/**
 * Orders.gs — creating orders, staff actions, and customer responses to the
 * "item unavailable" email.
 *
 * Rules enforced here (never in the browser):
 *   - prices and totals come from the Menu sheet / stored order lines
 *   - every write happens inside withLock_() so order numbers are unique and
 *     two staff tapping buttons at once cannot corrupt an order
 *   - every status change is recorded in the order's StatusHistory
 *   - emails are sent AFTER the lock is released so they never slow the queue
 */

/* =========================================================================
 *  Loading and saving orders
 * ========================================================================= */

/** Reads every order in ONE sheet call. */
function loadOrders_() {
  var t = readTable_(CONFIG.SHEETS.ORDERS, CONFIG.HEADERS.ORDERS);
  var orders = [];
  t.rows.forEach(function (r, i) {
    if (r[t.idx.OrderNumber] === '' || r[t.idx.OrderNumber] === null) return;
    orders.push(rowToOrder_(r, t.idx, i + 2));
  });
  return { table: t, orders: orders };
}

function rowToOrder_(r, idx, rowNumber) {
  return {
    _row: rowNumber,
    _raw: r,
    orderNumber: Number(r[idx.OrderNumber]),
    timestamp: toMs_(r[idx.Timestamp]),
    customerEmail: String(r[idx.CustomerEmail] || '').trim().toLowerCase(),
    customerName: unSheetSafe_(r[idx.CustomerName]),
    items: normalizeLines_(parseJson_(r[idx.ItemsJSON], [])),
    total: Number(r[idx.Total]) || 0,
    delivery: String(r[idx.Delivery]).toUpperCase() === 'Y',
    room: String(r[idx.RoomNumber] || ''),
    payment: String(r[idx.PaymentMethod] || ''),
    status: String(r[idx.Status] || ''),
    statusUpdatedAt: toMs_(r[idx.StatusUpdatedAt]),
    staffNotes: unSheetSafe_(r[idx.StaffNotes]),
    token: String(r[idx.ResponseToken] || ''),
    tokenExpiresAt: toMs_(r[idx.TokenExpiresAt]),
    completedAt: toMs_(r[idx.CompletedAt]),
    history: parseJson_(r[idx.StatusHistory], []) || [],
    customerType: String(r[idx.CustomerType] || CONFIG.CUSTOMER_TYPES.STAFF)
  };
}

/** Guards against hand-edited or malformed ItemsJSON. */
function normalizeLines_(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.filter(function (l) { return l && l.id; }).map(function (l) {
    var line = {
      id: String(l.id),
      name: String(l.name || l.id),
      price: centsToAmount_(toCents_(l.price || 0)),
      qty: Math.max(0, Math.floor(Number(l.qty) || 0))
    };
    if (l.unavailable === true) line.unavailable = true;
    return line;
  });
}

/** Builds the sheet row for an order, preserving any extra columns. */
function orderToRow_(o, t) {
  var row = o._raw ? o._raw.slice() : t.headers.map(function () { return ''; });
  while (row.length < t.headers.length) row.push('');
  var idx = t.idx;
  function d(ms) { return ms ? new Date(ms) : ''; }
  row[idx.OrderNumber] = o.orderNumber;
  row[idx.Timestamp] = d(o.timestamp);
  row[idx.CustomerEmail] = o.customerEmail;
  row[idx.CustomerName] = sheetSafe_(o.customerName);
  row[idx.ItemsJSON] = JSON.stringify(o.items);
  row[idx.Total] = o.total;
  row[idx.Delivery] = o.delivery ? 'Y' : 'N';
  row[idx.RoomNumber] = sheetSafe_(o.room);
  row[idx.PaymentMethod] = o.payment;
  row[idx.Status] = o.status;
  row[idx.StatusUpdatedAt] = d(o.statusUpdatedAt);
  row[idx.StaffNotes] = sheetSafe_(o.staffNotes);
  row[idx.ResponseToken] = o.token || '';
  row[idx.TokenExpiresAt] = d(o.tokenExpiresAt);
  row[idx.CompletedAt] = d(o.completedAt);
  row[idx.StatusHistory] = JSON.stringify(o.history || []);
  row[idx.CustomerType] = o.customerType;
  return row;
}

/** Writes one order back to its row with a single setValues call. */
function saveOrder_(data, o) {
  var t = data.table;
  var row = orderToRow_(o, t);
  var rowNum = o._row || (t.sheet.getLastRow() + 1);
  ensureRows_(t.sheet, rowNum);
  t.sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
  o._row = rowNum;
  o._raw = row;
}

function findOrder_(data, num) {
  for (var i = 0; i < data.orders.length; i++) {
    if (data.orders[i].orderNumber === num) return data.orders[i];
  }
  return null;
}

/** Next order number. Uses a stored counter so numbers are never reused, even after archiving. */
function nextOrderNumber_(data) {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('LAST_ORDER_NUMBER')) || 0;
  var maxInSheet = 0;
  data.orders.forEach(function (o) { if (o.orderNumber > maxInSheet) maxInSheet = o.orderNumber; });
  var next = Math.max(last, maxInSheet, getSettings_().ORDER_NUMBER_START - 1) + 1;
  props.setProperty('LAST_ORDER_NUMBER', String(next));
  return next;
}

function totalCents_(lines, includeUnavailable) {
  return lines.reduce(function (sum, l) {
    if (l.unavailable && !includeUnavailable) return sum;
    return sum + toCents_(l.price) * l.qty;
  }, 0);
}

function setStatus_(o, status, by, note) {
  o.status = status;
  o.statusUpdatedAt = Date.now();
  addHistory_(o, status, by, note);
}

function addHistory_(o, status, by, note) {
  o.history = Array.isArray(o.history) ? o.history : [];
  o.history.push({ s: status, at: Date.now(), by: by || '', note: note || '' });
  var max = CONFIG.HARD_LIMITS.HISTORY_ENTRIES_MAX;
  if (o.history.length > max) o.history = [o.history[0]].concat(o.history.slice(-(max - 1)));
}

function clearToken_(o) {
  o.token = '';
  o.tokenExpiresAt = 0;
}

function appendNote_(o, note) {
  var n = cleanText_(note, CONFIG.HARD_LIMITS.NOTE_MAX);
  if (!n) return;
  o.staffNotes = cleanText_((o.staffNotes ? o.staffNotes + ' | ' : '') + n, 1000);
}

/** Order shape sent to the shop dashboard (dates as numbers — google.script.run cannot return Date objects). */
function toStaffOrder_(o, icons) {
  icons = icons || {};
  return {
    orderNumber: o.orderNumber,
    timestamp: o.timestamp,
    customerEmail: o.customerEmail,
    customerName: o.customerName,
    customerType: o.customerType,
    items: o.items.map(function (l) {
      return { id: l.id, name: l.name, icon: icons[l.id] || '', price: l.price, qty: l.qty, lineTotal: centsToAmount_(toCents_(l.price) * l.qty), unavailable: !!l.unavailable };
    }),
    total: o.total,
    totalIfContinued: centsToAmount_(totalCents_(o.items, false)),
    delivery: o.delivery,
    room: o.room,
    payment: o.payment,
    status: o.status,
    statusUpdatedAt: o.statusUpdatedAt,
    staffNotes: o.staffNotes,
    completedAt: o.completedAt,
    tokenExpiresAt: o.tokenExpiresAt,
    history: (o.history || []).map(function (h) {
      return { s: String(h.s || ''), at: Number(h.at) || 0, by: String(h.by || ''), note: String(h.note || '') };
    })
  };
}

/** Order summary shown to the customer. */
function toCustomerSummary_(o) {
  return {
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    customerEmail: o.customerEmail,
    items: o.items.filter(function (l) { return !l.unavailable; }).map(function (l) {
      return { id: l.id, name: l.name, price: l.price, qty: l.qty, lineTotal: centsToAmount_(toCents_(l.price) * l.qty) };
    }),
    total: o.total,
    delivery: o.delivery,
    room: o.room,
    payment: o.payment,
    status: o.status
  };
}

/* =========================================================================
 *  Validation
 * ========================================================================= */

/**
 * Turns the browser's [{id, qty}] into priced order lines using the Menu
 * sheet. Any price the browser sends is ignored.
 */
function buildLines_(rawItems, menuMap, rules, blockedIds) {
  blockedIds = blockedIds || [];
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new AppError('Please add at least one item to your order.');
  }
  if (rawItems.length > CONFIG.HARD_LIMITS.MAX_LINES_PER_ORDER) {
    throw new AppError('Your order has too many different items.');
  }
  var qtyById = {};
  var ids = [];
  rawItems.forEach(function (raw) {
    if (!raw || typeof raw !== 'object') throw new AppError('Your order contains an invalid item. Please reload and try again.');
    var id = String(raw.id || '').trim();
    if (!id || id.length > 60) throw new AppError('Your order contains an invalid item. Please reload and try again.');
    var q = Number(raw.qty);
    if (!Number.isInteger(q) || q < 1 || q > rules.maxQtyPerItem) {
      throw new AppError('Quantities must be whole numbers from 1 to ' + rules.maxQtyPerItem + '.');
    }
    if (!qtyById[id]) ids.push(id);
    qtyById[id] = (qtyById[id] || 0) + q;
  });

  var totalQty = 0;
  var lines = ids.map(function (id) {
    var item = menuMap[id];
    if (!item) throw new AppError('An item in your order is no longer on the menu. Please review your order.');
    if (!item.available || blockedIds.indexOf(id) !== -1) {
      throw new AppError(item.name + ' is not available right now. Please remove it from your order.');
    }
    var q = qtyById[id];
    if (q > rules.maxQtyPerItem) throw new AppError('You can order at most ' + rules.maxQtyPerItem + ' of ' + item.name + '.');
    totalQty += q;
    return { id: id, name: item.name, price: item.price, qty: q };
  });
  if (totalQty > rules.maxItemsPerOrder) {
    throw new AppError('Orders are limited to ' + rules.maxItemsPerOrder + ' items in total.');
  }
  return lines;
}

/** Validates name, delivery/room and payment. */
function validateDetails_(payload, rules) {
  var name = cleanText_(payload.name, CONFIG.HARD_LIMITS.NAME_MAX);
  if (!name || !/[A-Za-z0-9À-ɏ]/.test(name)) throw new AppError('Please enter your name.');

  if (payload.delivery !== true && payload.delivery !== false) {
    throw new AppError('Please choose whether you would like delivery.');
  }
  var delivery = payload.delivery === true;
  if (delivery && !rules.deliveryEnabled) throw new AppError('Delivery is not available. Please choose pickup.');
  var room = delivery ? validateRoom_(payload.room, rules) : '';

  var payment = String(payload.payment || '');
  if (CONFIG.PAYMENT_METHODS.indexOf(payment) === -1) throw new AppError('Please choose cash or card.');

  return { name: name, delivery: delivery, room: room, payment: payment };
}

function validateRoom_(value, rules) {
  var s = getSettings_();
  var room = String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!room) throw new AppError('Please enter a room number for delivery.');
  if (room.length > CONFIG.HARD_LIMITS.ROOM_MAX || !/^[A-Z0-9 .\-]+$/.test(room)) {
    throw new AppError('Please enter a valid room number (for example 214 or B12).');
  }
  if (rules.allowedRooms && rules.allowedRooms.length) {
    if (rules.allowedRooms.indexOf(room) === -1) {
      throw new AppError('Delivery is only available to: ' + rules.allowedRooms.join(', ') + '.');
    }
    return room;
  }
  var named = splitList_(s.NAMED_ROOMS).map(function (r) { return r.toUpperCase(); });
  if (named.indexOf(room) !== -1) return room;
  var re;
  try { re = new RegExp(s.ROOM_PATTERN); } catch (e) { re = /^[A-Z]?[0-9]{1,4}[A-Z]?$/; }
  if (!re.test(room)) throw new AppError('Please enter a valid room number (for example 214 or B12).');
  return room;
}

function cleanRequestId_(v) {
  var s = String(v || '');
  return /^[A-Za-z0-9-]{8,64}$/.test(s) ? s : '';
}

/* =========================================================================
 *  Customer: place an order
 * ========================================================================= */

/**
 * payload = { items:[{id, qty}], name, delivery:true|false, room, payment:'Cash'|'Card', requestId }
 */
function submitOrder(payload) {
  return api_('submitOrder', function () {
    var ctx = requireCustomer_();
    var rules = getRules_(ctx);
    var win = getOrderingWindow_(rules);
    if (!win.open) throw new AppError(win.message);
    payload = (payload && typeof payload === 'object') ? payload : {};

    var lines = buildLines_(payload.items, getMenuMap_(), rules, []);
    var details = validateDetails_(payload, rules);

    // Double-submit protection: the same requestId always returns the same order.
    var requestId = cleanRequestId_(payload.requestId);
    var cache = CacheService.getScriptCache();
    var dedupeKey = requestId ? ('req_' + Utilities.base64EncodeWebSafe(ctx.email) + '_' + requestId) : '';

    var result = withLock_(function () {
      if (dedupeKey) {
        var prior = cache.get(dedupeKey);
        if (prior) return { duplicate: JSON.parse(prior) };
      }
      var data = loadOrders_();
      if (rules.maxActiveOrders > 0) {
        var active = data.orders.filter(function (o) {
          return o.customerEmail === ctx.email && CONFIG.ACTIVE_STATUSES.indexOf(o.status) !== -1;
        }).length;
        if (active >= rules.maxActiveOrders) {
          throw new AppError('You already have ' + active + ' order(s) in progress. Please wait for ' +
            (active === 1 ? 'it' : 'one') + ' to be completed before ordering again.');
        }
      }
      var now = Date.now();
      var o = {
        orderNumber: nextOrderNumber_(data),
        timestamp: now,
        customerEmail: ctx.email,
        customerName: details.name,
        items: lines,
        total: centsToAmount_(totalCents_(lines, true)),
        delivery: details.delivery,
        room: details.room,
        payment: details.payment,
        status: '',
        statusUpdatedAt: now,
        staffNotes: '',
        token: '',
        tokenExpiresAt: 0,
        completedAt: 0,
        history: [],
        customerType: ctx.customerType
      };
      setStatus_(o, CONFIG.STATUS.PENDING, ctx.email, 'Order placed');
      saveOrder_(data, o);
      touchOrdersVersion_();
      if (dedupeKey) cache.put(dedupeKey, JSON.stringify(toCustomerSummary_(o)), 1800);
      return { order: o };
    });

    if (result.duplicate) {
      var dup = result.duplicate;
      dup.duplicate = true;
      dup.emailSent = true;
      return dup;
    }
    var summary = toCustomerSummary_(result.order);
    summary.emailSent = sendConfirmationEmail_(result.order, 'new');
    return summary;
  });
}

/* =========================================================================
 *  Shop dashboard (staff only)
 * ========================================================================= */

function getShopBootstrap() {
  return api_('getShopBootstrap', function () {
    var ctx = requireStaff_();
    var s = getSettings_();
    return {
      shopName: s.SHOP_NAME,
      currency: s.CURRENCY_SYMBOL,
      pollSeconds: s.POLL_SECONDS,
      awaitingWarnMinutes: s.AWAITING_WARN_MINUTES,
      user: { email: ctx.email, name: ctx.staffName, role: ctx.staffRole },
      statuses: CONFIG.STATUS
    };
  });
}

/**
 * Active orders, oldest first. If sinceVersion matches the current version,
 * returns {unchanged:true} without reading the sheet (cheap polling).
 */
function getActiveOrders(sinceVersion) {
  return api_('getActiveOrders', function () {
    requireStaff_();
    var version = getOrdersVersion_();
    if (sinceVersion && String(sinceVersion) === version) {
      return { unchanged: true, version: version, serverNow: Date.now() };
    }
    var data = loadOrders_();
    var active = data.orders.filter(function (o) { return CONFIG.ACTIVE_STATUSES.indexOf(o.status) !== -1; });
    active.sort(function (a, b) { return (a.timestamp - b.timestamp) || (a.orderNumber - b.orderNumber); });
    var icons = getMenuIcons_();
    return { version: version, serverNow: Date.now(), orders: active.map(function (o) { return toStaffOrder_(o, icons); }) };
  });
}

/**
 * Loads an order under the lock, checks its status, applies `mutate`, saves.
 * Returns { order, extra }.
 */
function changeOrder_(orderNumber, allowedFrom, mutate) {
  var num = parseOrderNumber_(orderNumber);
  return withLock_(function () {
    var data = loadOrders_();
    var o = findOrder_(data, num);
    if (!o) throw new AppError('Order #' + num + ' was not found.');
    if (allowedFrom && allowedFrom.indexOf(o.status) === -1) {
      throw new AppError('Order #' + num + ' is now "' + o.status + '", so that action is no longer possible. The list has been refreshed.');
    }
    var extra = mutate(o, data) || {};
    saveOrder_(data, o);
    touchOrdersVersion_();
    return { order: o, extra: extra };
  });
}

function emailWarning_(sent) {
  return sent ? '' : 'The customer email could not be sent (email may be turned off or the daily limit reached). Please contact the customer directly.';
}

/** Staff: Pending -> In Progress. */
function startOrder(orderNumber) {
  return api_('startOrder', function () {
    var ctx = requireStaff_();
    var r = changeOrder_(orderNumber, [CONFIG.STATUS.PENDING], function (o) {
      setStatus_(o, CONFIG.STATUS.IN_PROGRESS, ctx.email, '');
    });
    return { orderNumber: r.order.orderNumber, status: r.order.status };
  });
}

/** Staff: mark Completed (removes it from the active view). */
function completeOrder(orderNumber) {
  return api_('completeOrder', function () {
    var ctx = requireStaff_();
    var r = changeOrder_(orderNumber, [CONFIG.STATUS.PENDING, CONFIG.STATUS.IN_PROGRESS], function (o) {
      o.completedAt = Date.now();
      clearToken_(o);
      setStatus_(o, CONFIG.STATUS.COMPLETED, ctx.email, '');
    });
    var warning = '';
    if (getSettings_().EMAIL_ON_COMPLETE) warning = emailWarning_(sendReadyEmail_(r.order));
    return { orderNumber: r.order.orderNumber, status: r.order.status, warning: warning };
  });
}

/** Staff: cancel any active order. The customer is emailed. */
function cancelOrder(orderNumber, reason) {
  return api_('cancelOrder', function () {
    var ctx = requireStaff_();
    var why = cleanText_(reason, CONFIG.HARD_LIMITS.NOTE_MAX);
    var r = changeOrder_(orderNumber, CONFIG.ACTIVE_STATUSES, function (o) {
      clearToken_(o);
      appendNote_(o, 'Cancelled' + (why ? ': ' + why : ''));
      setStatus_(o, CONFIG.STATUS.CANCELLED, ctx.email, why);
    });
    var sent = sendCancelledEmail_(r.order, why);
    return { orderNumber: r.order.orderNumber, status: r.order.status, warning: emailWarning_(sent) };
  });
}

/** Staff: re-open a Completed order (e.g. completed by mistake). */
function reopenOrder(orderNumber) {
  return api_('reopenOrder', function () {
    var ctx = requireStaff_();
    var r = changeOrder_(orderNumber, [CONFIG.STATUS.COMPLETED], function (o) {
      o.completedAt = 0;
      setStatus_(o, CONFIG.STATUS.PENDING, ctx.email, 'Reopened');
    });
    return { orderNumber: r.order.orderNumber, status: r.order.status };
  });
}

/**
 * Staff: flag one or more items in an order as unavailable. Sets the order to
 * "Awaiting Customer Response" and emails the customer secure links.
 */
function markItemsUnavailable(orderNumber, itemIds, alsoMarkMenu) {
  return api_('markItemsUnavailable', function () {
    var ctx = requireStaff_();
    if (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.length > CONFIG.HARD_LIMITS.MAX_LINES_PER_ORDER) {
      throw new AppError('Please select at least one unavailable item.');
    }
    var ids = itemIds.map(function (x) { return String(x || '').trim(); });
    var markMenu = alsoMarkMenu === true;
    var hours = getSettings_().RESPONSE_LINK_HOURS;

    var r = changeOrder_(orderNumber, [CONFIG.STATUS.PENDING, CONFIG.STATUS.IN_PROGRESS, CONFIG.STATUS.AWAITING], function (o) {
      var names = [];
      ids.forEach(function (id) {
        var line = o.items.filter(function (l) { return l.id === id; })[0];
        if (!line) throw new AppError('One of the selected items is not in order #' + o.orderNumber + '. Please refresh.');
        line.unavailable = true;
        names.push(line.name);
      });
      o.token = newToken_();                             // a new token invalidates older email links
      o.tokenExpiresAt = Date.now() + hours * 3600 * 1000;
      if (markMenu) {
        try { setMenuAvailabilityNoLock_(ids, false); } catch (e) {
          if (!e || e.name !== 'AppError') throw e;      // item no longer on menu: ignore
        }
      }
      setStatus_(o, CONFIG.STATUS.AWAITING, ctx.email, 'Unavailable: ' + names.join(', ') + (markMenu ? ' (also turned off on menu)' : ''));
    });

    var sent = sendUnavailableEmail_(r.order);
    return { orderNumber: r.order.orderNumber, status: r.order.status, warning: emailWarning_(sent) };
  });
}

/** Staff: the customer said (e.g. in person) to continue without the item. */
function staffContinueWithout(orderNumber) {
  return api_('staffContinueWithout', function () {
    var ctx = requireStaff_();
    var r = changeOrder_(orderNumber, [CONFIG.STATUS.AWAITING], function (o) {
      return resolveContinue_(o, ctx.email, 'Continued without unavailable item(s) (by staff)');
    });
    var sent = r.extra.cancelled
      ? sendCancelledEmail_(r.order, 'None of the items you ordered are available.')
      : sendConfirmationEmail_(r.order, 'updated');
    return { orderNumber: r.order.orderNumber, status: r.order.status, warning: emailWarning_(sent) };
  });
}

/**
 * Removes flagged lines, recalculates the total from the stored server-side
 * line prices and returns the order to Pending. If nothing is left, the
 * order is cancelled.
 */
function resolveContinue_(o, by, note) {
  var removed = o.items.filter(function (l) { return l.unavailable; }).map(function (l) { return l.name; });
  var remaining = o.items.filter(function (l) { return !l.unavailable; });
  clearToken_(o);
  if (!remaining.length) {
    appendNote_(o, 'Cancelled: no requested items available');
    setStatus_(o, CONFIG.STATUS.CANCELLED, by, 'No requested items were available');
    return { cancelled: true };
  }
  o.items = remaining;
  o.total = centsToAmount_(totalCents_(remaining, true));
  setStatus_(o, CONFIG.STATUS.PENDING, by, note + (removed.length ? ' — removed: ' + removed.join(', ') : ''));
  return { cancelled: false };
}

/** Staff: search completed and cancelled orders. query = {text, date:'yyyy-MM-dd', status:'closed'|'all'} */
function getHistory(query) {
  return api_('getHistory', function () {
    requireStaff_();
    var s = getSettings_();
    var q = (query && typeof query === 'object') ? query : {};
    var text = cleanText_(q.text, 100).toLowerCase().replace(/^#/, '');
    var date = String(q.date || '').trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('Please pick a valid date.');
    var includeActive = q.status === 'all';

    var data = loadOrders_();
    var matches = data.orders.filter(function (o) {
      if (!includeActive && CONFIG.CLOSED_STATUSES.indexOf(o.status) === -1) return false;
      if (date && Utilities.formatDate(new Date(o.timestamp), s.TIMEZONE, 'yyyy-MM-dd') !== date) return false;
      if (text) {
        if (/^\d+$/.test(text)) return String(o.orderNumber) === text;
        return o.customerName.toLowerCase().indexOf(text) !== -1 ||
          o.customerEmail.indexOf(text) !== -1 ||
          o.room.toLowerCase() === text;
      }
      return true;
    });
    matches.sort(function (a, b) { return (b.timestamp - a.timestamp) || (b.orderNumber - a.orderNumber); });
    var icons = getMenuIcons_();
    return {
      totalMatches: matches.length,
      limited: matches.length > s.HISTORY_MAX_RESULTS,
      orders: matches.slice(0, s.HISTORY_MAX_RESULTS).map(function (o) { return toStaffOrder_(o, icons); })
    };
  });
}

/* =========================================================================
 *  Customer responses to the "item unavailable" email
 * ========================================================================= */

/** Checks that the signed-in customer may act on this order with this token. */
function verifyResponse_(o, token, ctx) {
  if (!o) throw new AppError('We could not find that order.');
  if (o.customerEmail !== ctx.email) {
    throw new AppError('This link belongs to a different account. Please sign in with the school account that placed order #' + o.orderNumber + '.');
  }
  if (o.status !== CONFIG.STATUS.AWAITING || !o.token) {
    throw new AppError('This link has already been used or is no longer needed. Order #' + o.orderNumber + ' is currently "' + o.status + '".');
  }
  if (!safeEquals_(o.token, token)) {
    throw new AppError('This link is out of date. Please use the most recent email about order #' + o.orderNumber + '.');
  }
  if (o.tokenExpiresAt && Date.now() > o.tokenExpiresAt) {
    throw new AppError('This link has expired. Please contact the coffee shop about order #' + o.orderNumber + '.');
  }
}

/** Customer: details for the response page (and to pre-fill a revision). */
function getResponseContext(orderNumber, token) {
  return api_('getResponseContext', function () {
    var ctx = requireCustomer_();
    var num = parseOrderNumber_(orderNumber);
    var tok = parseToken_(token);
    var data = loadOrders_();
    var o = findOrder_(data, num);
    verifyResponse_(o, tok, ctx);
    var remaining = o.items.filter(function (l) { return !l.unavailable; });
    return {
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      delivery: o.delivery,
      room: o.room,
      payment: o.payment,
      unavailable: o.items.filter(function (l) { return l.unavailable; }).map(function (l) { return { id: l.id, name: l.name, qty: l.qty }; }),
      remaining: remaining.map(function (l) {
        return { id: l.id, name: l.name, price: l.price, qty: l.qty, lineTotal: centsToAmount_(toCents_(l.price) * l.qty) };
      }),
      originalTotal: o.total,
      newTotal: centsToAmount_(totalCents_(remaining, true)),
      expiresAt: o.tokenExpiresAt
    };
  });
}

/** Customer: "Continue without this item". */
function respondContinue(orderNumber, token) {
  return api_('respondContinue', function () {
    var ctx = requireCustomer_();
    var tok = parseToken_(token);
    var r = changeOrder_(orderNumber, null, function (o) {
      verifyResponse_(o, tok, ctx);
      return resolveContinue_(o, ctx.email, 'Customer chose to continue without unavailable item(s)');
    });
    if (r.extra.cancelled) sendCancelledEmail_(r.order, 'None of the items you ordered are available.');
    else sendConfirmationEmail_(r.order, 'updated');
    var summary = toCustomerSummary_(r.order);
    summary.cancelled = !!r.extra.cancelled;
    return summary;
  });
}

/** Customer: cancel instead of continuing or revising. */
function respondCancel(orderNumber, token) {
  return api_('respondCancel', function () {
    var ctx = requireCustomer_();
    var tok = parseToken_(token);
    var r = changeOrder_(orderNumber, null, function (o) {
      verifyResponse_(o, tok, ctx);
      clearToken_(o);
      appendNote_(o, 'Cancelled by customer');
      setStatus_(o, CONFIG.STATUS.CANCELLED, ctx.email, 'Cancelled by customer after item was unavailable');
    });
    return { orderNumber: r.order.orderNumber, status: r.order.status };
  });
}

/**
 * Customer: "Revise my order". Replaces the items/details of the SAME order
 * number, recalculates the total from the Menu sheet, returns it to Pending.
 */
function submitRevision(orderNumber, token, payload) {
  return api_('submitRevision', function () {
    var ctx = requireCustomer_();
    var rules = getRules_(ctx);
    var tok = parseToken_(token);
    payload = (payload && typeof payload === 'object') ? payload : {};
    var menuMap = getMenuMap_();
    var details = validateDetails_(payload, rules);

    var r = changeOrder_(orderNumber, null, function (o) {
      verifyResponse_(o, tok, ctx);
      var blocked = o.items.filter(function (l) { return l.unavailable; }).map(function (l) { return l.id; });
      var lines = buildLines_(payload.items, menuMap, rules, blocked);
      o.items = lines;
      o.total = centsToAmount_(totalCents_(lines, true));
      o.customerName = details.name;
      o.delivery = details.delivery;
      o.room = details.room;
      o.payment = details.payment;
      clearToken_(o);
      setStatus_(o, CONFIG.STATUS.PENDING, ctx.email, 'Order revised by customer');
    });
    var summary = toCustomerSummary_(r.order);
    summary.emailSent = sendConfirmationEmail_(r.order, 'updated');
    return summary;
  });
}

/* =========================================================================
 *  Maintenance (owner or installed time-driven triggers only)
 * ========================================================================= */

/** Cancels orders that have waited on the customer too long (if enabled). */
function autoCancelStaleOrders(e) {
  requireOwnerOrTrigger_(e);
  var s = getSettings_();
  var minutes = Number(s.AUTO_CANCEL_AWAITING_MINUTES) || 0;
  if (minutes <= 0) return 0;
  var cutoff = Date.now() - minutes * 60000;
  var cancelled = withLock_(function () {
    var data = loadOrders_();
    var list = [];
    data.orders.forEach(function (o) {
      if (o.status === CONFIG.STATUS.AWAITING && o.statusUpdatedAt && o.statusUpdatedAt < cutoff) {
        clearToken_(o);
        appendNote_(o, 'Auto-cancelled: no customer response');
        setStatus_(o, CONFIG.STATUS.CANCELLED, 'system', 'No response from customer within ' + minutes + ' minutes');
        saveOrder_(data, o);
        list.push(o);
      }
    });
    if (list.length) touchOrdersVersion_();
    return list;
  });
  cancelled.forEach(function (o) {
    sendCancelledEmail_(o, 'We did not hear back about the unavailable item, so the order was cancelled. You are welcome to place a new order.');
  });
  return cancelled.length;
}

/**
 * Moves Completed/Cancelled orders older than ARCHIVE_AFTER_DAYS to the
 * Archive sheet, and (optionally) deletes very old archived rows.
 */
function archiveOldOrders(e) {
  requireOwnerOrTrigger_(e);
  var s = getSettings_();
  var days = Number(s.ARCHIVE_AFTER_DAYS) || 0;
  var result = withLock_(function () {
    var moved = 0;
    var deleted = 0;
    var ss = getSs_();
    var t = readTable_(CONFIG.SHEETS.ORDERS, CONFIG.HEADERS.ORDERS);
    var archive = ss.getSheetByName(CONFIG.SHEETS.ARCHIVE);
    if (!archive) {
      archive = ss.insertSheet(CONFIG.SHEETS.ARCHIVE);
      archive.getRange(1, 1, 1, t.headers.length).setValues([t.headers]).setFontWeight('bold');
      archive.setFrozenRows(1);
    }

    if (days > 0) {
      var cutoff = Date.now() - days * 86400000;
      var keep = [];
      var move = [];
      t.rows.forEach(function (r) {
        var status = String(r[t.idx.Status]);
        var basis = toMs_(r[t.idx.CompletedAt]) || toMs_(r[t.idx.StatusUpdatedAt]) || toMs_(r[t.idx.Timestamp]);
        if (CONFIG.CLOSED_STATUSES.indexOf(status) !== -1 && basis && basis < cutoff) move.push(r);
        else keep.push(r);
      });
      if (move.length) {
        // Map by header name in case the Archive columns differ.
        var aHeaders = archive.getRange(1, 1, 1, archive.getLastColumn()).getValues()[0].map(String);
        var mapped = move.map(function (r) {
          return aHeaders.map(function (h) { return t.idx.hasOwnProperty(h) ? r[t.idx[h]] : ''; });
        });
        // Write to Archive FIRST, then rewrite Orders, so a failure can duplicate but never lose data.
        var start = archive.getLastRow() + 1;
        ensureRows_(archive, start + mapped.length - 1);
        archive.getRange(start, 1, mapped.length, aHeaders.length).setValues(mapped);
        SpreadsheetApp.flush();
        var width = t.headers.length;
        t.sheet.getRange(2, 1, t.rows.length, width).clearContent();
        if (keep.length) t.sheet.getRange(2, 1, keep.length, width).setValues(keep);
        moved = move.length;
        touchOrdersVersion_();
      }
    }

    var delDays = Number(s.DELETE_ARCHIVE_AFTER_DAYS) || 0;
    if (delDays > 0 && archive.getLastRow() > 1) {
      var a = readTable_(CONFIG.SHEETS.ARCHIVE, ['Timestamp']);
      var delCutoff = Date.now() - delDays * 86400000;
      var aKeep = a.rows.filter(function (r) { return toMs_(r[a.idx.Timestamp]) >= delCutoff; });
      deleted = a.rows.length - aKeep.length;
      if (deleted) {
        a.sheet.getRange(2, 1, a.rows.length, a.headers.length).clearContent();
        if (aKeep.length) a.sheet.getRange(2, 1, aKeep.length, a.headers.length).setValues(aKeep);
      }
    }
    return { moved: moved, deleted: deleted };
  });
  console.log('archiveOldOrders: moved ' + result.moved + ', deleted ' + result.deleted);
  try {
    if (!e) SpreadsheetApp.getUi().alert('Archived ' + result.moved + ' order(s). Deleted ' + result.deleted + ' old archived order(s).');
  } catch (ignore) { /* not in the Sheet UI */ }
  return result;
}
