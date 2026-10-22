/**
 * Orders.gs — placing, editing and cancelling orders (customer side) and the
 * staff status changes. Every write happens inside withLock_() and every
 * change is recorded in the OrderHistory sheet.
 *
 * Line items are always stored as [{productId, name, unitPrice, quantity}],
 * even with one cookie, so adding cookie types needs no data changes.
 */

/* =========================================================================
 *  Loading and saving
 * ========================================================================= */

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
  var dispatched = parseJson_(r[idx.DispatchedItemsJSON], null);
  return {
    _row: rowNumber,
    _raw: r,
    orderNumber: Number(r[idx.OrderNumber]),
    createdAt: toMs_(r[idx.CreatedAt]),
    customerEmail: String(r[idx.CustomerEmail] || '').trim().toLowerCase(),
    customerName: unSheetSafe_(r[idx.CustomerName]),
    room: String(r[idx.RoomNumber] || ''),
    classOrNote: unSheetSafe_(r[idx.ClassOrNote]),
    items: normalizeItems_(parseJson_(r[idx.ItemsJSON], [])),
    total: Number(r[idx.Total]) || 0,
    payment: unSheetSafe_(r[idx.PaymentMethod]),
    status: String(r[idx.Status] || ''),
    version: Number(r[idx.Version]) || 1,
    lastUpdatedAt: toMs_(r[idx.LastUpdatedAt]),
    dispatchedAt: toMs_(r[idx.DispatchedAt]),
    dispatchedVersion: Number(r[idx.DispatchedVersion]) || 0,
    deliveredAt: toMs_(r[idx.DeliveredAt]),
    token: String(r[idx.EditToken] || ''),
    instructions: unSheetSafe_(r[idx.SpecialInstructions]),
    deliveryWindow: unSheetSafe_(r[idx.DeliveryWindow]),
    allergy: String(r[idx.AllergyFlag]).toUpperCase() === 'Y',
    dispatched: dispatched && Array.isArray(dispatched.items)
      ? { items: normalizeItems_(dispatched.items), room: String(dispatched.room || '') } : null,
    ackVersion: Number(r[idx.AckVersion]) || 0,
    customerType: String(r[idx.CustomerType] || CONFIG.CUSTOMER_TYPES.STAFF)
  };
}

function normalizeItems_(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(function (l) { return l && l.productId; }).map(function (l) {
    return {
      productId: String(l.productId),
      name: String(l.name || l.productId),
      unitPrice: centsToAmount_(toCents_(l.unitPrice || 0)),
      quantity: Math.max(0, Math.floor(Number(l.quantity) || 0))
    };
  });
}

function orderToRow_(o, t) {
  var row = o._raw ? o._raw.slice() : t.headers.map(function () { return ''; });
  while (row.length < t.headers.length) row.push('');
  var i = t.idx;
  var d = function (ms) { return ms ? new Date(ms) : ''; };
  row[i.OrderNumber] = o.orderNumber;
  row[i.CreatedAt] = d(o.createdAt);
  row[i.CustomerEmail] = o.customerEmail;
  row[i.CustomerName] = sheetSafe_(o.customerName);
  row[i.RoomNumber] = sheetSafe_(o.room);
  row[i.ClassOrNote] = sheetSafe_(o.classOrNote);
  row[i.ItemsJSON] = JSON.stringify(o.items);
  row[i.Total] = o.total;
  row[i.PaymentMethod] = sheetSafe_(o.payment);
  row[i.Status] = o.status;
  row[i.Version] = o.version;
  row[i.LastUpdatedAt] = d(o.lastUpdatedAt);
  row[i.DispatchedAt] = d(o.dispatchedAt);
  row[i.DispatchedVersion] = o.dispatchedVersion || '';
  row[i.DeliveredAt] = d(o.deliveredAt);
  row[i.EditToken] = o.token || '';
  row[i.SpecialInstructions] = sheetSafe_(o.instructions);
  row[i.DeliveryWindow] = sheetSafe_(o.deliveryWindow);
  row[i.AllergyFlag] = o.allergy ? 'Y' : 'N';
  row[i.DispatchedItemsJSON] = o.dispatched ? JSON.stringify(o.dispatched) : '';
  row[i.AckVersion] = o.ackVersion || '';
  row[i.CustomerType] = o.customerType;
  return row;
}

function saveOrder_(data, o) {
  var row = orderToRow_(o, data.table);
  var rowNum = o._row || (data.table.sheet.getLastRow() + 1);
  ensureRows_(data.table.sheet, rowNum);
  data.table.sheet.getRange(rowNum, 1, 1, row.length).setValues([row]);
  o._row = rowNum;
  o._raw = row;
}

function findOrder_(data, num) {
  for (var i = 0; i < data.orders.length; i++) if (data.orders[i].orderNumber === num) return data.orders[i];
  return null;
}

/** Never reuses a number, even after deleting rows (counter in Script Properties). */
function nextOrderNumber_(data) {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('LAST_ORDER_NUMBER')) || 0;
  var maxInSheet = 0;
  data.orders.forEach(function (o) { if (o.orderNumber > maxInSheet) maxInSheet = o.orderNumber; });
  var next = Math.max(last, maxInSheet, getSettings_().ORDER_NUMBER_START - 1) + 1;
  props.setProperty('LAST_ORDER_NUMBER', String(next));
  return next;
}

/** Appends audit-log rows to OrderHistory. Caller holds the lock. */
function logHistory_(entries) {
  if (!entries.length) return;
  appendRows_(getSheet_(CONFIG.SHEETS.HISTORY), entries.map(function (e) {
    return [e.orderNumber, now_(), e.by || '', sheetSafe_(e.action),
      e.oldItems ? JSON.stringify(e.oldItems) : '', e.newItems ? JSON.stringify(e.newItems) : '',
      e.oldTotal === undefined ? '' : e.oldTotal, e.newTotal === undefined ? '' : e.newTotal];
  }));
}

function totalOf_(items) {
  return centsToAmount_(items.reduce(function (c, l) { return c + toCents_(l.unitPrice) * l.quantity; }, 0));
}

function qtyByProduct_(items) {
  var m = dict_();
  items.forEach(function (l) { m[l.productId] = (m[l.productId] || 0) + l.quantity; });
  return m;
}

/** Cookies already ordered today per product (not counting cancelled orders, or `excludeNumber`). */
function soldToday_(data, excludeNumber) {
  var today = dayKey_(now_());
  var m = dict_();
  data.orders.forEach(function (o) {
    if (o.status === CONFIG.STATUS.CANCELLED || o.orderNumber === excludeNumber || dayKey_(o.createdAt) !== today) return;
    o.items.forEach(function (l) { m[l.productId] = (m[l.productId] || 0) + l.quantity; });
  });
  return m;
}

/** [{productId, name, old, now, diff}] for products whose quantity changed. */
function diffItems_(oldItems, newItems) {
  var a = qtyByProduct_(oldItems || []);
  var b = qtyByProduct_(newItems || []);
  var names = dict_();
  (oldItems || []).concat(newItems || []).forEach(function (l) { names[l.productId] = l.name; });
  return Object.keys(names).filter(function (id) { return (a[id] || 0) !== (b[id] || 0); }).map(function (id) {
    return { productId: id, name: names[id], old: a[id] || 0, now: b[id] || 0, diff: (b[id] || 0) - (a[id] || 0) };
  });
}

/* =========================================================================
 *  Validation
 * ========================================================================= */

/**
 * Builds priced line items from the browser's [{productId, quantity}].
 * Prices come from the Products sheet (or, for products already in an order
 * being edited, the price the teacher originally got).
 *   oldItems   current items when editing ([] for a new order)
 *   sold       soldToday_() EXCLUDING this order
 */
function buildItems_(rawItems, productMap, rules, oldItems, sold) {
  var invalid = t_('server.productGone');
  if (!Array.isArray(rawItems) || rawItems.length > CONFIG.HARD_LIMITS.MAX_LINES) throw new AppError(t_('server.noItems'));
  var oldQty = qtyByProduct_(oldItems || []);
  var oldPrice = dict_();
  var oldName = dict_();
  (oldItems || []).forEach(function (l) { oldPrice[l.productId] = l.unitPrice; oldName[l.productId] = l.name; });
  var qty = dict_();
  var order = [];
  rawItems.forEach(function (raw) {
    if (!raw || typeof raw !== 'object') throw new AppError(invalid);
    var id = String(raw.productId || '').trim();
    if (!id || id.length > 40) throw new AppError(invalid);
    var q = Number(raw.quantity);
    if (!Number.isInteger(q) || q < 0 || q > rules.maxPerProduct) throw new AppError(t_('server.qtyInvalid', { max: rules.maxPerProduct }));
    if (!(id in qty)) order.push(id);
    qty[id] = (qty[id] || 0) + q;
  });
  var total = 0;
  var items = [];
  order.forEach(function (id) {
    var q = qty[id];
    var p = productMap[id];
    var before = oldQty[id] || 0;
    if (q === 0) return;
    // A cookie removed from the Products sheet can be kept or reduced in an existing order, never added.
    if (!p && q > before) throw new AppError(invalid);
    if (q > rules.maxPerProduct) throw new AppError(t_('server.tooManyProduct', { max: rules.maxPerProduct, name: p ? p.name : oldName[id] }));
    var increase = q - before;
    if (increase > 0) {
      if (!p.available) throw new AppError(t_('server.productSoldOut', { name: p.name }));
      if (p.dailyLimit) {
        var left = Math.max(0, p.dailyLimit - (sold[id] || 0) - before);
        if (increase > left) {
          throw new AppError(left === 0 && before === 0 ? t_('server.soldOutToday', { name: p.name })
            : t_('server.dailyLimit', { left: left + before, name: p.name }));
        }
      }
    }
    total += q;
    items.push({
      productId: id,
      name: p ? p.name : (oldName[id] || id),
      unitPrice: (id in oldPrice) ? oldPrice[id] : p.price,
      quantity: q
    });
  });
  if (!items.length) throw new AppError(t_('server.noItems'));
  if (total > rules.maxPerOrder) throw new AppError(t_('server.tooManyTotal', { max: rules.maxPerOrder }));
  return items;
}

/** Validates delivery details. */
function validateDetails_(payload) {
  var s = getSettings_();
  var L = CONFIG.HARD_LIMITS;
  var name = cleanText_(payload.name, L.NAME_MAX);
  if (!name || !/[A-Za-z0-9À-ɏ]/.test(name)) throw new AppError(t_('server.nameRequired'));
  var room = validateRoom_(payload.room);
  var windows = splitListKeepCase_(s.DELIVERY_WINDOWS);
  var win = cleanText_(payload.deliveryWindow, 80);
  if (win && windows.indexOf(win) === -1) throw new AppError(t_('server.windowInvalid'));
  var method = String(payload.payment || '');
  var payment;
  if (method === CONFIG.PAYMENT.CASH || method === CONFIG.PAYMENT.CARD) {
    payment = method;
  } else if (method === CONFIG.PAYMENT.ACCOUNT && s.ALLOW_ACCOUNT_CHARGE) {
    var acct = cleanText_(payload.accountName, L.ACCOUNT_MAX);
    if (!acct) throw new AppError(t_('server.accountRequired'));
    payment = 'Account: ' + acct;
  } else {
    throw new AppError(t_('server.paymentRequired', { account: s.ALLOW_ACCOUNT_CHARGE ? ' or department account' : '' }));
  }
  return {
    name: name,
    room: room,
    classOrNote: cleanText_(payload.classOrNote, L.CLASS_MAX),
    instructions: cleanText_(payload.instructions, L.INSTRUCTIONS_MAX),
    deliveryWindow: win,
    allergy: payload.allergy === true,
    payment: payment
  };
}

function validateRoom_(value) {
  var s = getSettings_();
  var room = String(value || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!room) throw new AppError(t_('server.roomRequired'));
  if (room.length > CONFIG.HARD_LIMITS.ROOM_MAX || !/^[A-Z0-9 .\-]+$/.test(room)) throw new AppError(t_('server.roomInvalid'));
  if (splitList_(s.NAMED_ROOMS).map(function (r) { return r.toUpperCase(); }).indexOf(room) !== -1) return room;
  var re;
  try { re = new RegExp(s.ROOM_PATTERN); } catch (e) { re = /^[A-Z]?[0-9]{1,4}[A-Z]?$/; }
  if (!re.test(room)) throw new AppError(t_('server.roomInvalid'));
  return room;
}

/* =========================================================================
 *  Edit rules (from Settings)
 * ========================================================================= */

/**
 * What may the teacher still change? {canEdit, canIncrease, canDecrease,
 * canCancel, message}. The message explains any restriction in plain words.
 */
function editRules_(o, win) {
  var s = getSettings_();
  var flow = CONFIG.STATUS_FLOW;
  var res = { canEdit: false, canIncrease: false, canDecrease: false, canCancel: false, message: '' };
  if (CONFIG.CLOSED_STATUSES.indexOf(o.status) !== -1) {
    res.message = t_('server.alreadyClosed', { n: o.orderNumber, status: o.status.toLowerCase() });
    return res;
  }
  var idx = flow.indexOf(o.status);
  if (idx >= flow.indexOf(s.EDITS_ALLOWED_UNTIL)) {
    res.message = t_('server.editBlockedStatus', { n: o.orderNumber, status: o.status.toLowerCase() });
    return res;
  }
  res.canEdit = true;
  res.canDecrease = idx < flow.indexOf(s.NO_DECREASE_OR_CANCEL_FROM);
  res.canCancel = res.canDecrease;
  res.canIncrease = s.ALLOW_INCREASE_AFTER_CUTOFF || win.open;
  var msgs = [];
  if (!res.canDecrease) msgs.push(t_('server.decreaseBlocked', { status: o.status.toLowerCase() }));
  if (!res.canIncrease) msgs.push(t_('server.increaseAfterCutoff', { time: win.cutoff ? friendlyTime_(win.cutoff) : '' }));
  res.message = msgs.join(' ');
  return res;
}

/**
 * The signed-in user may act on this order if they own it. A token from an
 * email link must also match. Errors never reveal whether someone else's
 * order exists.
 */
function verifyOwner_(o, ctx, token) {
  if (!o) throw new AppError(t_('server.linkInvalid'));
  var owner = o.customerEmail === ctx.email;
  var tokenOk = !!token && !!o.token && safeEquals_(o.token, token);
  if (!owner && !tokenOk) throw new AppError(t_('server.linkInvalid'));
  if (!owner) throw new AppError(t_('server.notOwner', { n: o.orderNumber }));
  if (CONFIG.CLOSED_STATUSES.indexOf(o.status) !== -1) {
    throw new AppError(t_('server.alreadyClosed', { n: o.orderNumber, status: o.status.toLowerCase() }));
  }
  if (token && !tokenOk) throw new AppError(t_('server.linkInvalid'));
}

/* =========================================================================
 *  Shapes sent to browsers
 * ========================================================================= */

function toCustomerOrder_(o, win) {
  return {
    orderNumber: o.orderNumber, createdAt: o.createdAt, status: o.status, version: o.version,
    customerName: o.customerName, room: o.room, classOrNote: o.classOrNote,
    items: o.items, total: o.total, payment: o.payment, instructions: o.instructions,
    deliveryWindow: o.deliveryWindow, allergy: o.allergy, lastUpdatedAt: o.lastUpdatedAt,
    rules: win ? editRules_(o, win) : null
  };
}

/* =========================================================================
 *  Customer: bootstrap, place, view, edit, cancel
 * ========================================================================= */

/** Everything the customer page needs on load. */
function getCustomerBootstrap() {
  return api_('getCustomerBootstrap', function () {
    var ctx = requireCustomer_();
    rateLimit_('bootstrap', ctx.email, 60, 600);
    var s = getSettings_();
    var rules = getRules_(ctx);
    var win = getOrderingWindow_();
    var data = loadOrders_();
    var sold = soldToday_(data, 0);
    var mine = data.orders.filter(function (o) { return o.customerEmail === ctx.email; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
    var last = mine[0];
    return {
      appName: s.APP_NAME,
      appVersion: CONFIG.APP_VERSION,
      currency: s.CURRENCY_SYMBOL,
      user: { email: ctx.email, isStaff: ctx.isStaff, suggestedName: last ? last.customerName : nameFromEmail_(ctx.email) },
      lastRoom: last ? last.room : '',
      lastClass: last ? last.classOrNote : '',
      ordering: { open: win.open, message: win.message, reopensAt: win.reopensAt, cutoff: win.cutoff ? friendlyTime_(win.cutoff) : '' },
      products: readProducts_().filter(function (p) { return p.available; })
        .map(function (p) { return productForClient_(p, sold[p.id]); }),
      rules: {
        maxPerOrder: rules.maxPerOrder, maxPerProduct: rules.maxPerProduct,
        windows: splitListKeepCase_(s.DELIVERY_WINDOWS),
        allowAccount: s.ALLOW_ACCOUNT_CHARGE, accountLabel: s.ACCOUNT_CHARGE_LABEL,
        roomPattern: s.ROOM_PATTERN, namedRooms: splitList_(s.NAMED_ROOMS).map(function (r) { return r.toUpperCase(); }),
        editUntil: s.EDITS_ALLOWED_UNTIL.toLowerCase(), noDecreaseFrom: s.NO_DECREASE_OR_CANCEL_FROM.toLowerCase(),
        limits: CONFIG.HARD_LIMITS
      }
    };
  });
}

function nameFromEmail_(email) {
  var local = String(email || '').split('@')[0].replace(/[0-9]+/g, '');
  return local.split(/[._-]+/).filter(function (p) { return p; })
    .map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ').slice(0, CONFIG.HARD_LIMITS.NAME_MAX);
}

/**
 * payload = { items:[{productId, quantity}], name, room, classOrNote, instructions,
 *             deliveryWindow, allergy, payment, accountName, requestId }
 */
function submitOrder(payload) {
  return api_('submitOrder', function () {
    var ctx = requireCustomer_();
    rateLimit_('order', ctx.email, 15, 600);
    var win = getOrderingWindow_();
    if (!win.open) throw new AppError(win.message);
    payload = (payload && typeof payload === 'object') ? payload : {};
    var rules = getRules_(ctx);
    var details = validateDetails_(payload);
    var productMap = getProductMap_();
    var requestId = /^[A-Za-z0-9-]{8,64}$/.test(String(payload.requestId || '')) ? String(payload.requestId) : '';
    var dedupeKey = requestId ? 'req_' + Utilities.base64EncodeWebSafe(ctx.email) + '_' + requestId : '';

    var res = withLock_(function () {
      if (dedupeKey) {
        var prior = cacheGet_(dedupeKey);
        if (prior) return { duplicate: JSON.parse(prior) };
      }
      var data = loadOrders_();
      var items = buildItems_(payload.items, productMap, rules, [], soldToday_(data, 0));
      var now = now_().getTime();
      var o = {
        orderNumber: nextOrderNumber_(data), createdAt: now, customerEmail: ctx.email, customerName: details.name,
        room: details.room, classOrNote: details.classOrNote, items: items, total: totalOf_(items),
        payment: details.payment, status: CONFIG.STATUS.RECEIVED, version: 1, lastUpdatedAt: now,
        dispatchedAt: 0, dispatchedVersion: 0, deliveredAt: 0, token: newToken_(), instructions: details.instructions,
        deliveryWindow: details.deliveryWindow, allergy: details.allergy, dispatched: null, ackVersion: 0,
        customerType: ctx.customerType
      };
      saveOrder_(data, o);
      logHistory_([{ orderNumber: o.orderNumber, by: ctx.email, action: 'Created', newItems: items, newTotal: o.total }]);
      touchOrdersVersion_();
      var summary = toCustomerOrder_(o, null);
      if (dedupeKey) cachePut_(dedupeKey, JSON.stringify(summary), 1800);
      return { order: o, summary: summary };
    });
    if (res.duplicate) { res.duplicate.duplicate = true; res.duplicate.emailSent = true; return res.duplicate; }
    res.summary.emailSent = sendConfirmationEmail_(res.order);
    return res.summary;
  });
}

/** Customer: my recent orders (all active ones plus the last 20), with what I may still change. */
function getMyOrders() {
  return api_('getMyOrders', function () {
    var ctx = requireCustomer_();
    var win = getOrderingWindow_();
    var mine = loadOrders_().orders.filter(function (o) { return o.customerEmail === ctx.email; })
      .sort(function (a, b) { return b.createdAt - a.createdAt; });
    var list = mine.filter(function (o, i) { return i < 20 || CONFIG.ACTIVE_STATUSES.indexOf(o.status) !== -1; });
    return list.map(function (o) { return toCustomerOrder_(o, win); });
  });
}

/** Customer: one order to edit (from My Orders or the email "Edit my order" link). */
function getOrderForEdit(orderNumber, token) {
  return api_('getOrderForEdit', function () {
    var ctx = requireCustomer_();
    var num = parseOrderNumber_(orderNumber);
    var tok = parseOptionalToken_(token);
    var o = findOrder_(loadOrders_(), num);
    verifyOwner_(o, ctx, tok);
    var out = toCustomerOrder_(o, getOrderingWindow_());
    if (!out.rules.canEdit) throw new AppError(out.rules.message);
    return out;
  });
}

/**
 * Customer: save changes. expectedVersion is the Version the teacher was
 * looking at; if the order changed meanwhile, nothing is saved.
 */
function editOrder(orderNumber, token, expectedVersion, payload) {
  return api_('editOrder', function () {
    var ctx = requireCustomer_();
    rateLimit_('edit', ctx.email, 20, 600);
    var num = parseOrderNumber_(orderNumber);
    var tok = parseOptionalToken_(token);
    payload = (payload && typeof payload === 'object') ? payload : {};
    var details = validateDetails_(payload);
    var rules = getRules_(ctx);
    var productMap = getProductMap_();
    var win = getOrderingWindow_();

    var res = withLock_(function () {
      var data = loadOrders_();
      var o = findOrder_(data, num);
      verifyOwner_(o, ctx, tok);
      if (Number(expectedVersion) !== o.version) throw new AppError(t_('server.changedMeanwhile', { n: num }));
      var r = editRules_(o, win);
      if (!r.canEdit) throw new AppError(r.message);

      var newItems = buildItems_(payload.items, productMap, rules, o.items, soldToday_(data, num));
      var diff = diffItems_(o.items, newItems);
      if (diff.some(function (d) { return d.diff > 0; }) && !r.canIncrease) {
        throw new AppError(t_('server.increaseAfterCutoff', { time: win.cutoff ? friendlyTime_(win.cutoff) : '' }));
      }
      if (diff.some(function (d) { return d.diff < 0; }) && !r.canDecrease) {
        throw new AppError(t_('server.decreaseBlocked', { status: o.status.toLowerCase() }));
      }
      var detailChanges = [];
      ['room', 'classOrNote', 'instructions', 'deliveryWindow', 'payment', 'customerName'].forEach(function (k) {
        var nv = k === 'customerName' ? details.name : details[k];
        if (String(o[k] || '') !== String(nv || '')) detailChanges.push(k);
      });
      if (o.allergy !== details.allergy) detailChanges.push('allergy');
      if (!diff.length && !detailChanges.length) throw new AppError(t_('server.noChanges'));

      var before = { items: o.items, total: o.total, room: o.room };
      o.items = newItems;
      o.total = totalOf_(newItems);
      o.customerName = details.name;
      o.room = details.room;
      o.classOrNote = details.classOrNote;
      o.instructions = details.instructions;
      o.deliveryWindow = details.deliveryWindow;
      o.allergy = details.allergy;
      o.payment = details.payment;
      o.version += 1;
      o.lastUpdatedAt = now_().getTime();
      var afterDispatch = o.dispatchedVersion > 0 && o.status === CONFIG.STATUS.OUT;
      var action = (afterDispatch ? 'Edited after dispatch' : 'Edited') + ' (v' + o.version + ')' +
        (diff.length ? ': ' + diff.map(function (d) { return d.name + ' ' + d.old + ' → ' + d.now; }).join(', ') : '') +
        (detailChanges.length ? (diff.length ? '; ' : ': ') + 'changed ' + detailChanges.join(', ') : '');
      saveOrder_(data, o);
      logHistory_([{ orderNumber: num, by: ctx.email, action: action, oldItems: before.items, newItems: newItems, oldTotal: before.total, newTotal: o.total }]);
      touchOrdersVersion_();
      return { order: o, before: before, diff: diff, afterDispatch: afterDispatch };
    });

    var out = toCustomerOrder_(res.order, win);
    out.emailSent = sendUpdatedEmail_(res.order, res.before, res.diff);
    if (res.afterDispatch) sendStaffDispatchAlert_(res.order);
    return out;
  });
}

/** Customer: cancel (from My Orders or the email link's confirmation page). */
function cancelMyOrder(orderNumber, token) {
  return api_('cancelMyOrder', function () {
    var ctx = requireCustomer_();
    rateLimit_('edit', ctx.email, 20, 600);
    var num = parseOrderNumber_(orderNumber);
    var tok = parseOptionalToken_(token);
    var win = getOrderingWindow_();
    var o = withLock_(function () {
      var data = loadOrders_();
      var ord = findOrder_(data, num);
      verifyOwner_(ord, ctx, tok);
      var r = editRules_(ord, win);
      if (!r.canCancel) throw new AppError(r.canEdit ? t_('server.decreaseBlocked', { status: ord.status.toLowerCase() }) : r.message);
      var old = ord.items;
      ord.status = CONFIG.STATUS.CANCELLED;
      ord.token = '';
      ord.version += 1;
      ord.lastUpdatedAt = now_().getTime();
      saveOrder_(data, ord);
      logHistory_([{ orderNumber: num, by: ctx.email, action: 'Cancelled by teacher', oldItems: old, oldTotal: ord.total }]);
      touchOrdersVersion_();
      return ord;
    });
    sendCancelledEmail_(o, '');
    return toCustomerOrder_(o, null);
  });
}

/* =========================================================================
 *  Staff: status changes and acknowledging changes
 * ========================================================================= */

var STAFF_ACTIONS_ = {
  prepare: { from: ['Received'], to: 'Preparing' },
  dispatch: { from: ['Received', 'Preparing'], to: 'Out for Delivery' },
  deliver: { from: ['Out for Delivery'], to: 'Delivered' },
  cancel: { from: ['Received', 'Preparing', 'Out for Delivery'], to: 'Cancelled' }
};

/** Staff: action = 'prepare' | 'dispatch' | 'deliver' | 'cancel'. */
function staffUpdateStatus(orderNumber, action, reason) {
  return api_('staffUpdateStatus', function () {
    var ctx = requireStaff_();
    var num = parseOrderNumber_(orderNumber);
    var spec = STAFF_ACTIONS_[String(action)];
    if (!spec || !Object.prototype.hasOwnProperty.call(STAFF_ACTIONS_, String(action))) throw new AppError(t_('server.generic'));
    var why = cleanText_(reason, CONFIG.HARD_LIMITS.NOTE_MAX);
    var o = withLock_(function () {
      var data = loadOrders_();
      var ord = findOrder_(data, num);
      if (!ord) throw new AppError(t_('server.orderNotFound', { n: num }));
      if (spec.from.indexOf(ord.status) === -1) throw new AppError(t_('server.statusNotAllowed', { n: num, status: ord.status }));
      var now = now_().getTime();
      ord.status = spec.to;
      if (spec.to === CONFIG.STATUS.OUT) {
        ord.dispatchedAt = now;
        ord.dispatchedVersion = ord.version;
        ord.ackVersion = ord.version;
        ord.dispatched = { items: ord.items, room: ord.room };
      }
      if (spec.to === CONFIG.STATUS.DELIVERED) ord.deliveredAt = now;
      if (CONFIG.CLOSED_STATUSES.indexOf(spec.to) !== -1) ord.token = '';     // edit links stop working
      saveOrder_(data, ord);
      logHistory_([{ orderNumber: num, by: ctx.staffName || ctx.email, action: 'Status: ' + spec.to + (why ? ' (' + why + ')' : '') }]);
      touchOrdersVersion_();
      return ord;
    });
    var warning = '';
    if (spec.to === CONFIG.STATUS.CANCELLED && !sendCancelledEmail_(o, why)) warning = 'email';
    return { orderNumber: num, status: o.status, warning: warning };
  });
}

/** Staff: clear the "UPDATED AFTER DISPATCH" alert (logged with name and time). */
function acknowledgeChange(orderNumber) {
  return api_('acknowledgeChange', function () {
    var ctx = requireStaff_();
    var num = parseOrderNumber_(orderNumber);
    return withLock_(function () {
      var data = loadOrders_();
      var o = findOrder_(data, num);
      if (!o) throw new AppError(t_('server.orderNotFound', { n: num }));
      if (o.ackVersion >= o.version) return { orderNumber: num, acknowledged: true };
      o.ackVersion = o.version;
      // The new contents become the baseline for any later change.
      o.dispatched = o.dispatchedVersion ? { items: o.items, room: o.room } : o.dispatched;
      saveOrder_(data, o);
      logHistory_([{ orderNumber: num, by: ctx.staffName || ctx.email, action: 'Acknowledged change (v' + o.version + ')' }]);
      touchOrdersVersion_();
      return { orderNumber: num, acknowledged: true };
    });
  });
}
