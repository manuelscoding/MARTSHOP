/**
 * DashboardData.gs — staff-only data: live orders with change badges, prep
 * summary, delivery route, history and change log, day summary, controls.
 * Every function starts with requireStaff_() (or owner/trigger for jobs).
 */

/** Order shape for the dashboard, including change-detection flags. */
function toStaffOrder_(o) {
  var afterDispatch = o.dispatchedVersion > 0 && o.version > o.ackVersion && o.status === CONFIG.STATUS.OUT;
  var changes = [];
  var roomChange = null;
  if (afterDispatch && o.dispatched) {
    changes = diffItems_(o.dispatched.items, o.items);
    if (o.dispatched.room && o.dispatched.room !== o.room) roomChange = { old: o.dispatched.room, now: o.room };
  }
  return {
    orderNumber: o.orderNumber, createdAt: o.createdAt, lastUpdatedAt: o.lastUpdatedAt,
    customerName: o.customerName, customerEmail: o.customerEmail, customerType: o.customerType,
    room: o.room, classOrNote: o.classOrNote, items: o.items, total: o.total, payment: o.payment,
    instructions: o.instructions, deliveryWindow: o.deliveryWindow, allergy: o.allergy,
    status: o.status, version: o.version, dispatchedAt: o.dispatchedAt, deliveredAt: o.deliveredAt,
    edited: o.version > 1 && !afterDispatch,
    afterDispatch: afterDispatch,
    changes: changes,
    roomChange: roomChange
  };
}

/**
 * Staff: everything the dashboard shows. If nothing changed since
 * `sinceVersion`, returns {unchanged:true} without reading the Sheet.
 */
function getDashboard(sinceVersion) {
  return api_('getDashboard', function () {
    var ctx = requireStaff_();
    var s = getSettings_();
    var version = getOrdersVersion_();
    var win = getOrderingWindow_();
    var ordering = { enabled: s.ORDERING_ENABLED, open: win.open, message: win.message };
    if (sinceVersion && String(sinceVersion) === version) {
      return { unchanged: true, version: version, serverNow: now_().getTime(), ordering: ordering };
    }
    var data = loadOrders_();
    var today = dayKey_(now_());
    var list = data.orders.filter(function (o) {
      return CONFIG.ACTIVE_STATUSES.indexOf(o.status) !== -1 || dayKey_(o.createdAt) === today || dayKey_(o.lastUpdatedAt) === today;
    }).sort(function (a, b) { return (a.createdAt - b.createdAt) || (a.orderNumber - b.orderNumber); });

    // Prep summary per product: needed (not cancelled), delivered, out, still to prepare.
    var prep = dict_();
    var products = readProducts_();
    products.forEach(function (p) { prep[p.id] = { productId: p.id, name: p.name, needed: 0, delivered: 0, out: 0, remaining: 0 }; });
    list.forEach(function (o) {
      if (o.status === CONFIG.STATUS.CANCELLED) return;
      o.items.forEach(function (l) {
        var row = prep[l.productId] || (prep[l.productId] = { productId: l.productId, name: l.name, needed: 0, delivered: 0, out: 0, remaining: 0 });
        row.needed += l.quantity;
        if (o.status === CONFIG.STATUS.DELIVERED) row.delivered += l.quantity;
        else if (o.status === CONFIG.STATUS.OUT) row.out += l.quantity;
        else row.remaining += l.quantity;
      });
    });
    var sold = soldToday_(data, 0);
    return {
      version: version,
      serverNow: now_().getTime(),
      today: today,
      ordering: ordering,
      orders: list.map(toStaffOrder_),
      prep: Object.keys(prep).map(function (k) { return prep[k]; }).filter(function (r) { return r.needed > 0 || products.some(function (p) { return p.id === r.productId && p.available; }); }),
      products: products.map(function (p) {
        var c = productForClient_(p, sold[p.id]);
        c.available = p.available;          // staff see the real switch state
        return c;
      }),
      user: { email: ctx.email, name: ctx.staffName, role: ctx.staffRole }
    };
  });
}

/** Staff: static things the dashboard needs once (app name, strings, poll speed). */
function getDashboardBootstrap() {
  return api_('getDashboardBootstrap', function () {
    var ctx = requireStaff_();
    var s = getSettings_();
    return {
      appName: s.APP_NAME, appVersion: CONFIG.APP_VERSION, currency: s.CURRENCY_SYMBOL,
      pollSeconds: s.POLL_SECONDS, lowStock: s.LOW_STOCK_THRESHOLD,
      user: { email: ctx.email, name: ctx.staffName, role: ctx.staffRole }
    };
  });
}

/** Staff: the full OrderHistory change log for one order. */
function getOrderLog(orderNumber) {
  return api_('getOrderLog', function () {
    requireStaff_();
    var num = parseOrderNumber_(orderNumber);
    var t = readTable_(CONFIG.SHEETS.HISTORY, CONFIG.HEADERS.HISTORY);
    return t.rows.filter(function (r) { return Number(r[t.idx.OrderNumber]) === num; }).map(function (r) {
      return {
        at: toMs_(r[t.idx.Timestamp]), by: String(r[t.idx.ChangedBy] || ''), action: unSheetSafe_(r[t.idx.Action]),
        oldItems: normalizeItems_(parseJson_(r[t.idx.OldItemsJSON], [])), newItems: normalizeItems_(parseJson_(r[t.idx.NewItemsJSON], [])),
        oldTotal: r[t.idx.OldTotal] === '' ? null : Number(r[t.idx.OldTotal]), newTotal: r[t.idx.NewTotal] === '' ? null : Number(r[t.idx.NewTotal])
      };
    });
  });
}

/** Staff: delivered and cancelled orders, newest first. query = {text, date:'yyyy-MM-dd'} */
function getHistory(query) {
  return api_('getHistory', function () {
    requireStaff_();
    var q = (query && typeof query === 'object') ? query : {};
    var text = cleanText_(q.text, 100).toLowerCase().replace(/^#/, '');
    var date = String(q.date || '').trim();
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(t_('server.invalidDate'));
    var matches = loadOrders_().orders.filter(function (o) {
      if (CONFIG.CLOSED_STATUSES.indexOf(o.status) === -1) return false;
      if (date && dayKey_(o.createdAt) !== date) return false;
      if (!text) return true;
      if (/^\d+$/.test(text) && String(o.orderNumber) === text) return true;
      return o.customerName.toLowerCase().indexOf(text) !== -1 || o.customerEmail.indexOf(text) !== -1 || o.room.toLowerCase() === text;
    }).sort(function (a, b) { return (b.createdAt - a.createdAt) || (b.orderNumber - a.orderNumber); });
    return { total: matches.length, orders: matches.slice(0, 200).map(toStaffOrder_) };
  });
}

/** Builds the end-of-day numbers for one date ('yyyy-MM-dd'). */
function buildDaySummary_(date) {
  var orders = loadOrders_().orders.filter(function (o) { return dayKey_(o.createdAt) === date; });
  var live = orders.filter(function (o) { return o.status !== CONFIG.STATUS.CANCELLED; });
  var byProduct = dict_();
  var byPayment = dict_();
  var revenue = 0;
  live.forEach(function (o) {
    o.items.forEach(function (l) {
      var r = byProduct[l.productId] || (byProduct[l.productId] = { name: l.name, quantity: 0, revenue: 0 });
      r.quantity += l.quantity;
      r.revenue = centsToAmount_(toCents_(r.revenue) + toCents_(l.unitPrice) * l.quantity);
    });
    var method = o.payment.indexOf('Account') === 0 ? 'Account' : o.payment;
    byPayment[method] = centsToAmount_(toCents_(byPayment[method] || 0) + toCents_(o.total));
    revenue = centsToAmount_(toCents_(revenue) + toCents_(o.total));
  });
  var h = readTable_(CONFIG.SHEETS.HISTORY, CONFIG.HEADERS.HISTORY);
  var postDispatch = h.rows.filter(function (r) {
    return String(r[h.idx.Action]).indexOf('Edited after dispatch') === 0 && dayKey_(toMs_(r[h.idx.Timestamp])) === date;
  }).length;
  return {
    date: date,
    orders: live.length,
    delivered: live.filter(function (o) { return o.status === CONFIG.STATUS.DELIVERED; }).length,
    cancellations: orders.length - live.length,
    postDispatchEdits: postDispatch,
    cookies: Object.keys(byProduct).map(function (k) { return { productId: k, name: byProduct[k].name, quantity: byProduct[k].quantity, revenue: byProduct[k].revenue }; }),
    byPayment: Object.keys(byPayment).map(function (k) { return { method: k, amount: byPayment[k] }; }),
    revenue: revenue
  };
}

/** Staff: day summary on demand. */
function getDaySummary(date) {
  return api_('getDaySummary', function () {
    requireStaff_();
    var d = String(date || '').trim() || dayKey_(now_());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new AppError(t_('server.invalidDate'));
    return buildDaySummary_(d);
  });
}

/** Staff: open or close ordering for the day from the dashboard. */
function setOrderingEnabled(enabled) {
  return api_('setOrderingEnabled', function () {
    var ctx = requireStaff_();
    if (enabled !== true && enabled !== false) throw new AppError(t_('server.generic'));
    withLock_(function () {
      setSettingValueNoLock_('ORDERING_ENABLED', enabled);
      touchOrdersVersion_();
    });
    console.log(ctx.email + ' set ordering ' + (enabled ? 'OPEN' : 'CLOSED'));
    var win = getOrderingWindow_();
    return { enabled: enabled, open: win.open, message: win.message };
  });
}

/* =========================================================================
 *  Time-driven jobs (owner or installed trigger only)
 * ========================================================================= */

/** Emails the end-of-day summary to DAILY_SUMMARY_EMAILS (trigger, ~4 PM on school days). */
function sendDailySummary(e) {
  requireOwnerOrTrigger_(e);
  var s = getSettings_();
  var to = splitList_(s.DAILY_SUMMARY_EMAILS).filter(function (a) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a); });
  if (!to.length) return false;
  var day = dayKey_(now_());
  var sum = buildDaySummary_(day);
  if (!sum.orders && !sum.cancellations) return false;          // nothing to report
  return sendSummaryEmail_(to.join(','), sum);
}

/** Nightly: delete old closed orders + change log (if enabled) and old error rows. */
function nightlyMaintenance(e) {
  requireOwnerOrTrigger_(e);
  var s = getSettings_();
  return withLock_(function () {
    var removed = 0;
    var days = Number(s.DELETE_CLOSED_ORDERS_AFTER_DAYS) || 0;
    if (days > 0) {
      var cutoff = now_().getTime() - days * 86400000;
      var t = readTable_(CONFIG.SHEETS.ORDERS, CONFIG.HEADERS.ORDERS);
      var gone = dict_();
      var keep = t.rows.filter(function (r) {
        var old = CONFIG.CLOSED_STATUSES.indexOf(String(r[t.idx.Status])) !== -1 && toMs_(r[t.idx.CreatedAt]) < cutoff;
        if (old) gone[String(r[t.idx.OrderNumber])] = true;
        return !old;
      });
      removed = t.rows.length - keep.length;
      if (removed) {
        rewriteRows_(t, keep);
        var h = readTable_(CONFIG.SHEETS.HISTORY, CONFIG.HEADERS.HISTORY);
        rewriteRows_(h, h.rows.filter(function (r) { return !(String(r[h.idx.OrderNumber]) in gone); }));
        touchOrdersVersion_();
      }
    }
    var errDays = Number(s.ERROR_LOG_RETENTION_DAYS) || 0;
    var trimmed = 0;
    if (errDays > 0) {
      var et = readTable_(CONFIG.SHEETS.ERRORS, ['Timestamp']);
      var ecut = now_().getTime() - errDays * 86400000;
      var ekeep = et.rows.filter(function (r) { return toMs_(r[et.idx.Timestamp]) >= ecut; });
      trimmed = et.rows.length - ekeep.length;
      if (trimmed) rewriteRows_(et, ekeep);
    }
    return { removedOrders: removed, trimmedErrors: trimmed };
  });
}

/** Replaces all data rows of a table with `rows` (header kept). Caller holds the lock. */
function rewriteRows_(t, rows) {
  var width = t.headers.length;
  if (t.rows.length) t.sheet.getRange(2, 1, t.rows.length, width).clearContent();
  if (rows.length) t.sheet.getRange(2, 1, rows.length, width).setValues(rows.map(function (r) { return r.slice(0, width); }));
}
