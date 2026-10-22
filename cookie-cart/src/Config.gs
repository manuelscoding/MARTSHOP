/**
 * Config.gs — the ONE place for configuration (same layout as the Coffee Shop app).
 *
 *   1. CONFIG: structure — sheet names, column headers, statuses. Change only
 *      if you know what you are doing.
 *   2. The "Settings" sheet: day-to-day options. Every key in DEFAULT_SETTINGS
 *      appears there with a description. Edit the Value column; no code changes.
 *
 * Settings and Products are cached for speed (CacheService). The cache is
 * cleared automatically when those sheets are edited (see onEdit in Setup.gs),
 * when staff change things from the dashboard, and by Cookie Cart > Clear cache.
 */

var CONFIG = Object.freeze({
  APP_VERSION: '1.0.0',

  SHEETS: Object.freeze({
    PRODUCTS: 'Products',
    ORDERS: 'Orders',
    HISTORY: 'OrderHistory',
    STAFF: 'Staff',
    SETTINGS: 'Settings',
    ERRORS: 'Errors'
  }),

  // Code finds columns BY NAME: you may reorder columns, but never rename/delete them.
  HEADERS: Object.freeze({
    PRODUCTS: ['ProductID', 'Name', 'Description', 'Price', 'Available', 'DailyLimit', 'Allergens', 'DietaryTags', 'ImageURL', 'SortOrder'],
    ORDERS: ['OrderNumber', 'CreatedAt', 'CustomerEmail', 'CustomerName', 'RoomNumber', 'ClassOrNote', 'ItemsJSON',
      'Total', 'PaymentMethod', 'Status', 'Version', 'LastUpdatedAt', 'DispatchedAt', 'DispatchedVersion',
      'DeliveredAt', 'EditToken', 'SpecialInstructions',
      // extra columns (see README "Assumptions")
      'DeliveryWindow', 'AllergyFlag', 'DispatchedItemsJSON', 'AckVersion', 'CustomerType'],
    HISTORY: ['OrderNumber', 'Timestamp', 'ChangedBy', 'Action', 'OldItemsJSON', 'NewItemsJSON', 'OldTotal', 'NewTotal'],
    STAFF: ['Email', 'Name', 'Role'],
    SETTINGS: ['Key', 'Value', 'Description'],
    ERRORS: ['Timestamp', 'Function', 'Message', 'User']
  }),

  STATUS: Object.freeze({
    RECEIVED: 'Received',
    PREPARING: 'Preparing',
    OUT: 'Out for Delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled'
  }),
  // Order of the delivery flow (Cancelled is separate).
  STATUS_FLOW: Object.freeze(['Received', 'Preparing', 'Out for Delivery', 'Delivered']),
  ACTIVE_STATUSES: Object.freeze(['Received', 'Preparing', 'Out for Delivery']),
  CLOSED_STATUSES: Object.freeze(['Delivered', 'Cancelled']),

  PAYMENT: Object.freeze({ CASH: 'Cash', CARD: 'Card', ACCOUNT: 'Account' }),
  CUSTOMER_TYPES: Object.freeze({ STAFF: 'Staff', STUDENT: 'Student' }),
  STAFF_ROLES: Object.freeze(['Admin', 'Staff']),

  CACHE_SECONDS: 300,

  HARD_LIMITS: Object.freeze({
    MAX_QTY: 500,
    MAX_LINES: 30,
    NAME_MAX: 60,
    CLASS_MAX: 60,
    INSTRUCTIONS_MAX: 300,
    ROOM_MAX: 20,
    ACCOUNT_MAX: 60,
    NOTE_MAX: 200
  })
});

/** [key, default, description]. The TYPE of the default decides how the value is read. */
var DEFAULT_SETTINGS = [
  // --- General ---
  ['APP_NAME', 'Cookie Cart', 'Name shown on the app, emails and printouts.'],
  ['CURRENCY_SYMBOL', '$', 'Currency symbol shown before prices.'],

  // --- Access ---
  ['ALLOWED_DOMAINS', 'yourschool.org', 'Comma-separated school email domains (e.g. district.org). Accounts here are teachers/staff unless they match STUDENT_EMAIL_PATTERN.'],
  ['STUDENT_EMAIL_PATTERN', '^[0-9]{3,9}', 'Part of an email BEFORE the @ that marks a STUDENT (default: starts with 3-9 digits, e.g. 1111111@district.org). Blank = no pattern.'],
  ['STUDENT_DOMAINS', '', 'Comma-separated student-only domains, if any.'],
  ['STUDENT_ORDERING_ENABLED', false, 'TRUE lets students order. Students can NEVER open the dashboard.'],
  ['STUDENT_MAX_QTY_PER_ORDER', 3, 'Maximum cookies in one student order.'],

  // --- Ordering hours ---
  ['ORDERING_ENABLED', true, 'Master switch. Staff can also open/close ordering for the day from the dashboard.'],
  ['ORDER_DAYS', 'Mon,Tue,Wed,Thu,Fri', 'Days ordering is open.'],
  ['ORDER_OPEN_TIME', '07:00', 'Ordering opens (24-hour HH:MM). Blank = from midnight.'],
  ['ORDER_CUTOFF_TIME', '10:30', 'Daily cutoff (24-hour HH:MM). Blank = no cutoff.'],
  ['DELIVERY_WINDOWS', 'Morning (by 10:00), Midday (10:00-12:00), Afternoon (after 12:00)', 'Optional delivery windows teachers can pick, comma-separated. Blank = no choice offered.'],

  // --- Limits ---
  ['MAX_QTY_PER_ORDER', 60, 'Maximum total cookies in one order.'],
  ['MAX_QTY_PER_PRODUCT', 60, 'Maximum of one cookie type in one order.'],
  ['LOW_STOCK_THRESHOLD', 10, 'When a daily limit has this many or fewer left, customers see "Only N left today" and the dashboard warns.'],

  // --- Rooms ---
  ['ROOM_PATTERN', '^[A-Z]?[0-9]{1,4}[A-Z]?$', 'Pattern a room number must match (in UPPERCASE). Default accepts 214, B12, 101A.'],
  ['NAMED_ROOMS', 'LIBRARY,GYM,MAIN OFFICE,CAFETERIA,AUDITORIUM', 'Room NAMES accepted in addition to the pattern.'],

  // --- Payment ---
  ['ALLOW_ACCOUNT_CHARGE', false, 'TRUE offers "Charge to department/school account" as a payment method.'],
  ['ACCOUNT_CHARGE_LABEL', 'Charge to department/school account', 'Wording of the account payment option.'],

  // --- Editing rules ---
  ['EDITS_ALLOWED_UNTIL', 'Delivered', 'Teachers can edit until the order reaches this status (Preparing, Out for Delivery or Delivered).'],
  ['NO_DECREASE_OR_CANCEL_FROM', 'Out for Delivery', 'From this status on, teachers can only ADD cookies: no reducing or cancelling (Preparing, Out for Delivery or Delivered).'],
  ['ALLOW_INCREASE_AFTER_CUTOFF', false, 'TRUE lets teachers add cookies after the daily cutoff.'],

  // --- Dashboard & notifications ---
  ['POLL_SECONDS', 12, 'How often the dashboard checks for changes (10-60).'],
  ['STAFF_NOTIFY_EMAILS', '', 'Comma-separated staff emails to alert when an order is changed AFTER it went out for delivery.'],
  ['NOTIFY_STAFF_ON_DISPATCHED_EDIT', true, 'TRUE emails STAFF_NOTIFY_EMAILS when a dispatched order is edited.'],
  ['DAILY_SUMMARY_EMAILS', '', 'Comma-separated emails that receive the end-of-day summary (needs the maintenance triggers).'],

  // --- Email ---
  ['SEND_EMAILS', true, 'FALSE turns off all teacher emails (useful while testing).'],
  ['REPLY_TO_EMAIL', '', 'Optional reply-to address for emails.'],
  ['WEB_APP_URL', '', 'The deployed /exec URL used in email links. Blank = detected automatically.'],
  ['ADMIN_ALERT_EMAIL', '', 'Optional. Emailed (max once per hour) when the app hits an unexpected error.'],

  // --- Data retention ---
  ['DELETE_CLOSED_ORDERS_AFTER_DAYS', 0, 'If > 0, delivered/cancelled orders (and their change log) older than this are deleted nightly. 0 = keep.'],
  ['ERROR_LOG_RETENTION_DAYS', 90, 'Errors-tab rows older than this are deleted nightly. 0 = keep.'],
  ['ORDER_NUMBER_START', 1, 'First order number. Used before the first order and by "Reset for go-live".']
];

/** Text settings that fall back to their default when left blank. */
var REQUIRED_TEXT_SETTINGS_ = ['APP_NAME', 'CURRENCY_SYMBOL', 'ALLOWED_DOMAINS', 'ROOM_PATTERN', 'EDITS_ALLOWED_UNTIL', 'NO_DECREASE_OR_CANCEL_FROM'];

var settingsMemo_ = null;

/** Effective settings (defaults merged with the Settings sheet), cached. */
function getSettings_() {
  if (settingsMemo_) return settingsMemo_;
  var cached = cacheGet_('settings_v1');
  if (cached) {
    settingsMemo_ = JSON.parse(cached);
    return settingsMemo_;
  }
  var sheetValues = dict_();
  var sheet = getSs_().getSheetByName(CONFIG.SHEETS.SETTINGS);
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
      var key = String(r[0] || '').trim().toUpperCase();
      if (key) sheetValues[key] = r[1];
    });
  }
  var tz = Session.getScriptTimeZone();
  var s = {};
  DEFAULT_SETTINGS.forEach(function (d) {
    var key = d[0];
    var def = d[1];
    if (!(key in sheetValues)) { s[key] = def; return; }
    var raw = sheetValues[key];
    if ((raw === '' || raw === null) && typeof def === 'string' && REQUIRED_TEXT_SETTINGS_.indexOf(key) === -1) { s[key] = ''; return; }
    s[key] = coerceSetting_(raw, def, tz);
  });
  s.MAX_QTY_PER_ORDER = clampInt_(s.MAX_QTY_PER_ORDER, 1, CONFIG.HARD_LIMITS.MAX_QTY);
  s.MAX_QTY_PER_PRODUCT = clampInt_(s.MAX_QTY_PER_PRODUCT, 1, CONFIG.HARD_LIMITS.MAX_QTY);
  s.STUDENT_MAX_QTY_PER_ORDER = clampInt_(s.STUDENT_MAX_QTY_PER_ORDER, 1, CONFIG.HARD_LIMITS.MAX_QTY);
  s.LOW_STOCK_THRESHOLD = clampInt_(s.LOW_STOCK_THRESHOLD, 0, 10000);
  s.POLL_SECONDS = clampInt_(s.POLL_SECONDS, 10, 60);
  s.ORDER_NUMBER_START = clampInt_(s.ORDER_NUMBER_START, 1, 9999999);
  if (CONFIG.STATUS_FLOW.indexOf(s.EDITS_ALLOWED_UNTIL) < 1) s.EDITS_ALLOWED_UNTIL = CONFIG.STATUS.DELIVERED;
  if (CONFIG.STATUS_FLOW.indexOf(s.NO_DECREASE_OR_CANCEL_FROM) < 1) s.NO_DECREASE_OR_CANCEL_FROM = CONFIG.STATUS.OUT;
  s.TIMEZONE = tz;
  settingsMemo_ = s;
  cachePut_('settings_v1', JSON.stringify(s), CONFIG.CACHE_SECONDS);
  return s;
}

function coerceSetting_(raw, def, tz) {
  if (typeof def === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    var t = String(raw).trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'on'].indexOf(t) !== -1) return true;
    if (['false', 'no', 'n', '0', 'off'].indexOf(t) !== -1) return false;
    return def;
  }
  if (typeof def === 'number') {
    var n = Number(raw);
    return raw !== '' && isFinite(n) ? n : def;
  }
  if (raw instanceof Date) return Utilities.formatDate(raw, tz, 'HH:mm');
  return String(raw).trim();
}

/** Writes one Settings value (dashboard controls). Caller must hold the lock. */
function setSettingValueNoLock_(key, value) {
  var def = DEFAULT_SETTINGS.filter(function (d) { return d[0] === key; })[0];
  if (!def) throw new Error('Unknown setting ' + key);
  var sheet = getSheet_(CONFIG.SHEETS.SETTINGS);
  var text = typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value);
  var last = sheet.getLastRow();
  var keys = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getValues() : [];
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim().toUpperCase() === key) {
      sheet.getRange(i + 2, 2).setValue(text);
      clearCaches_();
      return;
    }
  }
  ensureRows_(sheet, last + 1);
  sheet.getRange(last + 1, 1, 1, 3).setValues([[key, text, def[2]]]);
  clearCaches_();
}

/** Clears cached Settings, Products and Staff. */
function clearCaches_() {
  try { CacheService.getScriptCache().removeAll(['settings_v1', 'products_v1', 'staff_v1']); } catch (e) { /* best-effort */ }
  settingsMemo_ = null;
  productsMemo_ = null;
  staffMemo_ = null;
}

/** Sheet menu: Cookie Cart > Clear cache. */
function clearCache() {
  requireOwner_();
  clearCaches_();
  try { SpreadsheetApp.getUi().alert('Cache cleared. Sheet changes are now live.'); } catch (e) { /* editor */ }
}
