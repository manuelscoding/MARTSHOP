/**
 * Auth.gs — who is the current user and what may they do?
 *
 * EVERY browser-callable function calls requireCustomer_() or requireStaff_()
 * first. The deployment's "Anyone within <domain>" setting is the first
 * fence; these checks are the second, and they never trust the browser.
 *
 *   User type   How it is decided                                    Can order?                    Shop dashboard?
 *   Student     domain in ALLOWED_DOMAINS and the part before the @   if STUDENT_ORDERING_ENABLED   NEVER
 *               matches STUDENT_EMAIL_PATTERN (e.g. 1111111@...),
 *               OR domain in STUDENT_DOMAINS
 *   Staff       any other account on ALLOWED_DOMAINS                  yes                           only if listed in Staff sheet
 *   Anyone else —                                                     no                            no
 */

var ctxMemo_ = null;
var staffMemo_ = null;

/** Builds the current user's context from their signed-in Google account. */
function getUserContext_() {
  if (ctxMemo_) return ctxMemo_;
  var s = getSettings_();
  var email = '';
  try { email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase(); } catch (e) { email = ''; }
  var domain = email.indexOf('@') > 0 ? email.split('@').pop() : '';

  var localPart = email.indexOf('@') > 0 ? email.split('@')[0] : '';

  var customerType = null;
  if (domain && splitList_(s.STUDENT_DOMAINS).indexOf(domain) !== -1) {
    customerType = CONFIG.CUSTOMER_TYPES.STUDENT;
  } else if (domain && splitList_(s.ALLOWED_DOMAINS).indexOf(domain) !== -1) {
    // Students and teachers share a domain: student accounts are recognised
    // by the pattern of the part before the @ (e.g. 1111111@district.org).
    customerType = isStudentLocalPart_(localPart, s.STUDENT_EMAIL_PATTERN)
      ? CONFIG.CUSTOMER_TYPES.STUDENT
      : CONFIG.CUSTOMER_TYPES.STAFF;
  }

  // Shop access requires BOTH: a staff-domain account AND a Staff sheet row.
  // A student-domain account can never be shop staff, even if listed.
  var staffRec = customerType === CONFIG.CUSTOMER_TYPES.STAFF ? (getStaffMap_()[email] || null) : null;

  var canOrder = customerType === CONFIG.CUSTOMER_TYPES.STAFF ||
    (customerType === CONFIG.CUSTOMER_TYPES.STUDENT && s.STUDENT_ORDERING_ENABLED === true);

  ctxMemo_ = {
    email: email,
    domain: domain,
    customerType: customerType,
    canOrder: canOrder,
    isShopStaff: !!staffRec,
    staffName: staffRec ? staffRec.name : '',
    staffRole: staffRec ? staffRec.role : ''
  };
  return ctxMemo_;
}

/**
 * True if the part of the email before the @ matches the student pattern.
 * A broken pattern falls back to the default (starts with 3-9 digits) so a
 * typo in Settings can never turn student accounts into staff accounts.
 */
function isStudentLocalPart_(localPart, pattern) {
  if (!localPart || !pattern) return false;
  var re;
  try {
    re = new RegExp(pattern, 'i');
  } catch (e) {
    logError_('isStudentLocalPart_', new Error('Invalid STUDENT_EMAIL_PATTERN "' + pattern + '"; using the default.'));
    re = /^[0-9]{3,9}/;
  }
  return re.test(localPart);
}

/** Throws unless the current user may place/modify their own orders. */
function requireCustomer_() {
  var ctx = getUserContext_();
  if (!ctx.email) {
    throw new AppError('We could not confirm your school Google account. Please sign in with your school account and reload the page.');
  }
  if (!ctx.canOrder) {
    throw new AppError('Your account (' + ctx.email + ') does not have access to the coffee shop ordering app.');
  }
  return ctx;
}

/** Throws unless the current user is coffee shop staff. */
function requireStaff_() {
  var ctx = getUserContext_();
  if (!ctx.email) {
    throw new AppError('We could not confirm your school Google account. Please sign in and reload the page.');
  }
  if (!ctx.isShopStaff) {
    throw new AppError('This area is only for coffee shop staff.');
  }
  return ctx;
}

/** Map of lowercase email -> {name, role} from the Staff sheet (cached). */
function getStaffMap_() {
  if (staffMemo_) return staffMemo_;
  var cache = CacheService.getScriptCache();
  var cached = cache.get('staff_v1');
  if (cached) {
    staffMemo_ = JSON.parse(cached);
    return staffMemo_;
  }
  var map = {};
  var t = readTable_(CONFIG.SHEETS.STAFF, ['Email']);
  t.rows.forEach(function (r) {
    var email = String(r[t.idx.Email] || '').trim().toLowerCase();
    if (!email || email.indexOf('@') < 1) return;
    var role = t.idx.hasOwnProperty('Role') ? String(r[t.idx.Role] || '').trim() : '';
    map[email] = {
      name: t.idx.hasOwnProperty('Name') ? String(r[t.idx.Name] || '').trim() : '',
      role: CONFIG.STAFF_ROLES.indexOf(role) !== -1 ? role : 'Staff'
    };
  });
  staffMemo_ = map;
  try { cache.put('staff_v1', JSON.stringify(map), CONFIG.CACHE_SECONDS); } catch (e) { /* best-effort */ }
  return map;
}

/**
 * The ordering rules that apply to this user. Students get their own
 * (usually stricter) rules from the STUDENT_* settings.
 */
function getRules_(ctx) {
  var s = getSettings_();
  var isStudent = ctx.customerType === CONFIG.CUSTOMER_TYPES.STUDENT;
  var rules = {
    isStudent: isStudent,
    orderingEnabled: s.ORDERING_ENABLED,
    orderDays: s.ORDER_DAYS,
    openTime: s.ORDER_OPEN_TIME,
    closeTime: s.ORDER_CLOSE_TIME,
    deliveryEnabled: s.DELIVERY_ENABLED,
    allowedRooms: [],
    maxQtyPerItem: s.MAX_QTY_PER_ITEM,
    maxItemsPerOrder: s.MAX_ITEMS_PER_ORDER,
    maxActiveOrders: s.MAX_ACTIVE_ORDERS_PER_CUSTOMER
  };
  if (isStudent) {
    rules.deliveryEnabled = s.DELIVERY_ENABLED && s.STUDENT_DELIVERY_ENABLED;
    rules.allowedRooms = splitList_(s.STUDENT_ALLOWED_ROOMS).map(function (r) { return r.toUpperCase(); });
    rules.maxItemsPerOrder = Math.min(s.MAX_ITEMS_PER_ORDER, s.STUDENT_MAX_ITEMS_PER_ORDER);
    rules.maxActiveOrders = s.STUDENT_MAX_ACTIVE_ORDERS;
    if (s.STUDENT_ORDER_DAYS) rules.orderDays = s.STUDENT_ORDER_DAYS;
    if (s.STUDENT_ORDER_OPEN_TIME) rules.openTime = s.STUDENT_ORDER_OPEN_TIME;
    if (s.STUDENT_ORDER_CLOSE_TIME) rules.closeTime = s.STUDENT_ORDER_CLOSE_TIME;
  }
  return rules;
}

/** Is ordering open right now for these rules? Returns {open, message}. */
function getOrderingWindow_(rules) {
  var s = getSettings_();
  var hoursText = describeHours_(rules);
  if (!rules.orderingEnabled) {
    return { open: false, message: s.SHOP_NAME + ' is not taking orders right now.', hours: hoursText };
  }
  var now = new Date();
  var day = Utilities.formatDate(now, s.TIMEZONE, 'EEE').toLowerCase();       // mon, tue...
  var hhmm = Utilities.formatDate(now, s.TIMEZONE, 'HH:mm');
  var days = splitList_(rules.orderDays).map(function (d) { return d.slice(0, 3); });
  if (days.length && days.indexOf(day) === -1) {
    return { open: false, message: 'Ordering is closed today. Hours: ' + hoursText + '.', hours: hoursText };
  }
  var open = normalizeTime_(rules.openTime);
  var close = normalizeTime_(rules.closeTime);
  if ((open && hhmm < open) || (close && hhmm >= close)) {
    return { open: false, message: 'Ordering is closed right now. Hours: ' + hoursText + '.', hours: hoursText };
  }
  return { open: true, message: '', hours: hoursText };
}

/** "07:00"/"7:00" -> "07:00"; invalid/blank -> "" (no limit). */
function normalizeTime_(t) {
  var m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  var h = Number(m[1]);
  var min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  return (h < 10 ? '0' : '') + h + ':' + m[2];
}

function describeHours_(rules) {
  var open = normalizeTime_(rules.openTime);
  var close = normalizeTime_(rules.closeTime);
  var days = String(rules.orderDays || '').replace(/\s+/g, '').replace(/,/g, ', ');
  var times = (open || close) ? ((open || 'open') + '–' + (close || 'close')) : 'all day';
  return (days ? days + ' ' : '') + times;
}
