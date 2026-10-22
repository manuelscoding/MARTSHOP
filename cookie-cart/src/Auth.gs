/**
 * Auth.gs — who is the user and what may they do? (same rules as the Coffee Shop)
 *
 *   Student   account on ALLOWED_DOMAINS whose part before the @ matches
 *             STUDENT_EMAIL_PATTERN, or any account on STUDENT_DOMAINS.
 *             Orders only if STUDENT_ORDERING_ENABLED. NEVER the dashboard.
 *   Teacher/staff   any other account on ALLOWED_DOMAINS. Can order.
 *   Cookie Cart staff   teacher/staff account listed in the Staff sheet with
 *             Role Admin or Staff. Can open the dashboard.
 *
 * Every browser-callable function calls requireCustomer_() or requireStaff_().
 */

var ctxMemo_ = null;
var staffMemo_ = null;

function getUserContext_() {
  if (ctxMemo_) return ctxMemo_;
  var s = getSettings_();
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) { email = ''; }
  var domain = email.indexOf('@') > 0 ? email.split('@').pop() : '';
  var local = email.indexOf('@') > 0 ? email.split('@')[0] : '';

  var type = null;
  if (domain && splitList_(s.STUDENT_DOMAINS).indexOf(domain) !== -1) {
    type = CONFIG.CUSTOMER_TYPES.STUDENT;
  } else if (domain && splitList_(s.ALLOWED_DOMAINS).indexOf(domain) !== -1) {
    type = isStudentLocalPart_(local, s.STUDENT_EMAIL_PATTERN) ? CONFIG.CUSTOMER_TYPES.STUDENT : CONFIG.CUSTOMER_TYPES.STAFF;
  }
  var staffRec = type === CONFIG.CUSTOMER_TYPES.STAFF ? (getStaffMap_()[email] || null) : null;
  ctxMemo_ = {
    email: email,
    customerType: type,
    canOrder: type === CONFIG.CUSTOMER_TYPES.STAFF || (type === CONFIG.CUSTOMER_TYPES.STUDENT && s.STUDENT_ORDERING_ENABLED === true),
    isStaff: !!staffRec,
    staffName: staffRec ? staffRec.name : '',
    staffRole: staffRec ? staffRec.role : ''
  };
  return ctxMemo_;
}

function isStudentLocalPart_(localPart, pattern) {
  if (!localPart || !pattern) return false;
  var re;
  try { re = new RegExp(pattern, 'i'); } catch (e) { re = /^[0-9]{3,9}/; }
  return re.test(localPart);
}

function requireCustomer_() {
  var ctx = getUserContext_();
  if (!ctx.email) throw new AppError(t_('server.notSignedIn'));
  if (!ctx.canOrder) throw new AppError(t_('server.noAccess', { email: ctx.email }));
  return ctx;
}

function requireStaff_() {
  var ctx = getUserContext_();
  if (!ctx.email) throw new AppError(t_('server.notSignedIn'));
  if (!ctx.isStaff) throw new AppError(t_('server.staffOnly'));
  return ctx;
}

function normalizeRole_(value) {
  var v = String(value === null || value === undefined ? '' : value).trim().toLowerCase();
  for (var i = 0; i < CONFIG.STAFF_ROLES.length; i++) {
    if (CONFIG.STAFF_ROLES[i].toLowerCase() === v) return CONFIG.STAFF_ROLES[i];
  }
  return '';
}

/** email -> {name, role} for rows whose Role is Admin or Staff (cached). */
function getStaffMap_() {
  if (staffMemo_) return staffMemo_;
  var cached = cacheGet_('staff_v1');
  if (cached) { staffMemo_ = dict_(JSON.parse(cached)); return staffMemo_; }
  var map = dict_();
  var t = readTable_(CONFIG.SHEETS.STAFF, ['Email']);
  t.rows.forEach(function (r) {
    var email = String(r[t.idx.Email] || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 1) return;
    var role = ('Role' in t.idx) ? normalizeRole_(r[t.idx.Role]) : '';
    if (!role) return;
    map[email] = { name: ('Name' in t.idx) ? String(r[t.idx.Name] || '').trim() : '', role: role };
  });
  staffMemo_ = map;
  cachePut_('staff_v1', JSON.stringify(map), CONFIG.CACHE_SECONDS);
  return map;
}

/** Ordering limits for this user (students may have their own). */
function getRules_(ctx) {
  var s = getSettings_();
  var student = ctx.customerType === CONFIG.CUSTOMER_TYPES.STUDENT;
  return {
    isStudent: student,
    maxPerOrder: student ? Math.min(s.MAX_QTY_PER_ORDER, s.STUDENT_MAX_QTY_PER_ORDER) : s.MAX_QTY_PER_ORDER,
    maxPerProduct: s.MAX_QTY_PER_PRODUCT
  };
}

/* ------------------------------------------------------------------ hours */

function normalizeTime_(t) {
  var m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return '';
  return (Number(m[1]) < 10 ? '0' : '') + Number(m[1]) + ':' + m[2];
}

/** "10:30" -> "10:30 AM" */
function friendlyTime_(hhmm) {
  var m = String(hhmm).match(/^(\d{2}):(\d{2})$/);
  if (!m) return hhmm;
  var h = Number(m[1]);
  return (h % 12 || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
}

/**
 * Is ordering open right now? Returns {open, message, reopensAt (ms or 0), cutoff ('10:30' or '')}.
 * reopensAt is computed from ORDER_DAYS and ORDER_OPEN_TIME (looks up to 14 days ahead).
 */
function getOrderingWindow_() {
  var s = getSettings_();
  var tz = s.TIMEZONE;
  var now = now_();
  var open = normalizeTime_(s.ORDER_OPEN_TIME);
  var cutoff = normalizeTime_(s.ORDER_CUTOFF_TIME);
  var days = splitList_(s.ORDER_DAYS).map(function (d) { return d.slice(0, 3); });
  var dayOk = function (d) { return !days.length || days.indexOf(Utilities.formatDate(d, tz, 'EEE').toLowerCase()) !== -1; };
  var hhmm = Utilities.formatDate(now, tz, 'HH:mm');

  var result = { open: true, message: '', reopensAt: 0, cutoff: cutoff };
  if (!s.ORDERING_ENABLED) {
    return { open: false, message: t_('server.closedManual'), reopensAt: 0, cutoff: cutoff };
  }
  if (dayOk(now) && (!open || hhmm >= open) && (!cutoff || hhmm < cutoff)) return result;

  // Closed: find when it reopens.
  var reopens = 0;
  if (dayOk(now) && open && hhmm < open) {
    reopens = atTime_(now, open, tz);
    return { open: false, message: t_('server.closedBefore', { time: friendlyTime_(open) }), reopensAt: reopens, cutoff: cutoff };
  }
  for (var i = 1; i <= 14 && !reopens; i++) {
    var d = new Date(now.getTime() + i * 86400000);
    if (dayOk(d)) reopens = atTime_(d, open || '00:00', tz);
  }
  var when = reopens ? Utilities.formatDate(new Date(reopens), tz, 'EEEE') + ' at ' + friendlyTime_(open || '00:00') : 'soon';
  var msg = (dayOk(now) && cutoff && hhmm >= cutoff)
    ? t_('server.closedAfter', { time: friendlyTime_(cutoff), when: when })
    : t_('server.closedToday', { when: when });
  return { open: false, message: msg, reopensAt: reopens, cutoff: cutoff };
}

/** Epoch ms of the given day at HH:MM in the school time zone. */
function atTime_(day, hhmm, tz) {
  var dateStr = Utilities.formatDate(day, tz, 'yyyy-MM-dd');
  // Find the offset for that date (handles daylight saving).
  var offset = Utilities.formatDate(day, tz, 'Z');            // e.g. -0400
  var iso = dateStr + 'T' + hhmm + ':00' + offset.slice(0, 3) + ':' + offset.slice(3);
  return new Date(iso).getTime();
}
