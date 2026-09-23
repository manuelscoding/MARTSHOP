/**
 * Config.gs — the ONE place for configuration.
 *
 * Two layers:
 *   1. CONFIG (below): structural constants — sheet names, column headers,
 *      order statuses. Change these only if you know what you are doing.
 *   2. The "Settings" sheet: day-to-day options (shop name, allowed domains,
 *      hours, limits...). Each key in DEFAULT_SETTINGS appears as a row in the
 *      Settings sheet. Edit the Value column there — no code changes needed.
 *      If a Settings row is blank or missing, the default below is used.
 */

var CONFIG = Object.freeze({
  APP_VERSION: '1.0.0',

  SHEETS: Object.freeze({
    MENU: 'Menu',
    ORDERS: 'Orders',
    STAFF: 'Staff',
    SETTINGS: 'Settings',
    ERRORS: 'Errors',
    ARCHIVE: 'Archive'
  }),

  // Column headers. Code looks columns up BY NAME, so you may reorder columns
  // in the sheet, but do not rename or delete them.
  HEADERS: Object.freeze({
    MENU: ['ItemID', 'Name', 'Price', 'Available', 'Category', 'SortOrder'],
    ORDERS: [
      'OrderNumber', 'Timestamp', 'CustomerEmail', 'CustomerName', 'ItemsJSON',
      'Total', 'Delivery', 'RoomNumber', 'PaymentMethod', 'Status',
      'StatusUpdatedAt', 'StaffNotes', 'ResponseToken', 'TokenExpiresAt',
      'CompletedAt', 'StatusHistory', 'CustomerType'
    ],
    STAFF: ['Email', 'Name', 'Role'],
    SETTINGS: ['Key', 'Value', 'Description'],
    ERRORS: ['Timestamp', 'Function', 'Message', 'User']
  }),

  STATUS: Object.freeze({
    PENDING: 'Pending',
    AWAITING: 'Awaiting Customer Response',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled'
  }),

  // Statuses shown on the live dashboard vs. in History.
  ACTIVE_STATUSES: Object.freeze(['Pending', 'Awaiting Customer Response', 'In Progress']),
  CLOSED_STATUSES: Object.freeze(['Completed', 'Cancelled']),

  PAYMENT_METHODS: Object.freeze(['Cash', 'Card']),

  // Customer types stored on each order (CustomerType column).
  CUSTOMER_TYPES: Object.freeze({ STAFF: 'Staff', STUDENT: 'Student' }),

  STAFF_ROLES: Object.freeze(['Admin', 'Staff']),

  // How long (seconds) Settings and Staff lists are cached. Edits to those
  // sheets take effect within this time (or immediately via the
  // "Coffee Shop > Clear settings cache" menu).
  CACHE_SECONDS: 60,

  // Hard safety limits that Settings cannot exceed.
  HARD_LIMITS: Object.freeze({
    MAX_QTY_PER_ITEM: 50,
    MAX_LINES_PER_ORDER: 40,
    NAME_MAX: 60,
    NOTE_MAX: 200,
    ROOM_MAX: 20,
    HISTORY_ENTRIES_MAX: 60
  })
});

/**
 * Default values for every Settings key. The TYPE of the default decides how
 * the Settings sheet value is read (true/false, number, or text).
 * `setup()` writes any missing keys into the Settings sheet with these values.
 */
var DEFAULT_SETTINGS = [
  // --- General ---
  ['SHOP_NAME', 'Staff Coffee Shop', 'Name shown on the app and in emails.'],
  ['CURRENCY_SYMBOL', '$', 'Currency symbol shown before prices.'],

  // --- Access control ---
  ['ALLOWED_DOMAINS', 'yourschool.org', 'Comma-separated email domains for teachers/staff who may order (e.g. yourschool.org). Shop staff must also be on one of these domains.'],
  ['STUDENT_DOMAINS', '', 'Comma-separated STUDENT email domains (e.g. students.yourschool.org). Leave blank until students are allowed.'],
  ['STUDENT_ORDERING_ENABLED', false, 'TRUE lets users on STUDENT_DOMAINS place orders. Students can NEVER see the shop dashboard.'],

  // --- Ordering hours ---
  ['ORDERING_ENABLED', true, 'Master switch. FALSE closes ordering for everyone (e.g. shop closed today).'],
  ['ORDER_DAYS', 'Mon,Tue,Wed,Thu,Fri', 'Days ordering is open (Mon,Tue,Wed,Thu,Fri,Sat,Sun).'],
  ['ORDER_OPEN_TIME', '07:00', '24-hour time ordering opens (HH:MM). Blank = no limit.'],
  ['ORDER_CLOSE_TIME', '14:30', '24-hour time ordering closes (HH:MM). Blank = no limit.'],

  // --- Delivery ---
  ['DELIVERY_ENABLED', true, 'FALSE = pickup only for everyone.'],
  ['ROOM_PATTERN', '^[A-Z]?[0-9]{1,4}[A-Z]?$', 'Pattern a room number must match (after converting to UPPERCASE). Default accepts 214, B12, 101A.'],
  ['NAMED_ROOMS', 'LIBRARY,GYM,MAIN OFFICE,CAFETERIA,AUDITORIUM,COUNSELING', 'Comma-separated room NAMES accepted in addition to the pattern.'],

  // --- Limits ---
  ['MAX_QTY_PER_ITEM', 10, 'Maximum quantity of a single menu item per order.'],
  ['MAX_ITEMS_PER_ORDER', 25, 'Maximum total number of items in one order.'],
  ['MAX_ACTIVE_ORDERS_PER_CUSTOMER', 3, 'How many unfinished orders one person may have at once (0 = unlimited).'],

  // --- Unavailable-item flow ---
  ['RESPONSE_LINK_HOURS', 24, 'Hours before "Revise / Continue" email links expire.'],
  ['AWAITING_WARN_MINUTES', 15, 'Dashboard highlights orders waiting on the customer longer than this.'],
  ['AUTO_CANCEL_AWAITING_MINUTES', 0, 'If > 0 and maintenance triggers are installed, orders waiting on the customer longer than this are cancelled automatically. 0 = never.'],

  // --- Dashboard ---
  ['POLL_SECONDS', 12, 'How often the shop dashboard checks for new orders (10-60).'],
  ['HISTORY_MAX_RESULTS', 200, 'Maximum orders shown in one History search.'],

  // --- Email ---
  ['SEND_EMAILS', true, 'FALSE turns off ALL customer emails (useful while testing).'],
  ['EMAIL_ON_COMPLETE', false, 'TRUE emails the customer when staff mark the order Completed ("ready").'],
  ['REPLY_TO_EMAIL', '', 'Optional reply-to address for customer emails (e.g. the shop\'s shared inbox).'],
  ['WEB_APP_URL', '', 'Optional. The deployed web app /exec URL used in email links. Blank = detected automatically.'],

  // --- Data retention ---
  ['ARCHIVE_AFTER_DAYS', 60, 'Completed/cancelled orders older than this many days move to the Archive sheet when archiving runs. 0 = never archive.'],
  ['DELETE_ARCHIVE_AFTER_DAYS', 0, 'If > 0, archived orders older than this are permanently deleted when archiving runs. 0 = keep forever.'],
  ['ORDER_NUMBER_START', 1, 'First order number ever issued. Only used before the first order.'],

  // --- Student rules (only apply when STUDENT_ORDERING_ENABLED is TRUE) ---
  ['STUDENT_DELIVERY_ENABLED', false, 'TRUE allows students to request delivery.'],
  ['STUDENT_ALLOWED_ROOMS', '', 'If set, students may only request delivery to these comma-separated rooms.'],
  ['STUDENT_MAX_ITEMS_PER_ORDER', 5, 'Maximum total items in one student order.'],
  ['STUDENT_MAX_ACTIVE_ORDERS', 1, 'Unfinished orders a student may have at once (0 = unlimited).'],
  ['STUDENT_ORDER_DAYS', '', 'Days students may order. Blank = same as ORDER_DAYS.'],
  ['STUDENT_ORDER_OPEN_TIME', '', 'Student ordering opens (HH:MM). Blank = same as ORDER_OPEN_TIME.'],
  ['STUDENT_ORDER_CLOSE_TIME', '', 'Student ordering closes (HH:MM). Blank = same as ORDER_CLOSE_TIME.']
];

/** Text settings that fall back to their default when left blank. */
var REQUIRED_TEXT_SETTINGS_ = ['SHOP_NAME', 'CURRENCY_SYMBOL', 'ALLOWED_DOMAINS', 'ROOM_PATTERN'];

var settingsMemo_ = null;

/**
 * Returns the effective settings object (defaults merged with the Settings
 * sheet). Cached per execution and in CacheService for CONFIG.CACHE_SECONDS.
 */
function getSettings_() {
  if (settingsMemo_) return settingsMemo_;
  var cache = CacheService.getScriptCache();
  var cached = cache.get('settings_v1');
  if (cached) {
    settingsMemo_ = JSON.parse(cached);
    return settingsMemo_;
  }

  var sheetValues = {};
  var sheet = getSs_().getSheetByName(CONFIG.SHEETS.SETTINGS);
  if (sheet && sheet.getLastRow() > 1) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
    rows.forEach(function (r) {
      var key = String(r[0] || '').trim().toUpperCase();
      if (key) sheetValues[key] = r[1];
    });
  }

  var tz = Session.getScriptTimeZone();
  var s = {};
  DEFAULT_SETTINGS.forEach(function (d) {
    var key = d[0];
    var def = d[1];
    if (!sheetValues.hasOwnProperty(key)) { s[key] = def; return; }
    var raw = sheetValues[key];
    // A deliberately blank text setting (e.g. ORDER_CLOSE_TIME) means "none",
    // except for the few that must always have a value.
    if ((raw === '' || raw === null) && typeof def === 'string' && REQUIRED_TEXT_SETTINGS_.indexOf(key) === -1) {
      s[key] = '';
      return;
    }
    s[key] = coerceSetting_(raw, def, tz);
  });

  // Keep numeric settings inside safe ranges.
  s.MAX_QTY_PER_ITEM = clampInt_(s.MAX_QTY_PER_ITEM, 1, CONFIG.HARD_LIMITS.MAX_QTY_PER_ITEM);
  s.MAX_ITEMS_PER_ORDER = clampInt_(s.MAX_ITEMS_PER_ORDER, 1, 200);
  s.STUDENT_MAX_ITEMS_PER_ORDER = clampInt_(s.STUDENT_MAX_ITEMS_PER_ORDER, 1, 200);
  s.MAX_ACTIVE_ORDERS_PER_CUSTOMER = clampInt_(s.MAX_ACTIVE_ORDERS_PER_CUSTOMER, 0, 100);
  s.STUDENT_MAX_ACTIVE_ORDERS = clampInt_(s.STUDENT_MAX_ACTIVE_ORDERS, 0, 100);
  s.POLL_SECONDS = clampInt_(s.POLL_SECONDS, 10, 60);
  s.RESPONSE_LINK_HOURS = clampInt_(s.RESPONSE_LINK_HOURS, 1, 24 * 14);
  s.HISTORY_MAX_RESULTS = clampInt_(s.HISTORY_MAX_RESULTS, 10, 1000);
  s.ORDER_NUMBER_START = clampInt_(s.ORDER_NUMBER_START, 1, 9999999);
  s.TIMEZONE = tz;

  settingsMemo_ = s;
  try {
    cache.put('settings_v1', JSON.stringify(s), CONFIG.CACHE_SECONDS);
  } catch (e) { /* cache is best-effort */ }
  return s;
}

/** Converts a raw Settings-sheet value to the type of its default. */
function coerceSetting_(raw, def, tz) {
  if (raw === '' || raw === null || raw === undefined) return def;
  if (typeof def === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    var t = String(raw).trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'on'].indexOf(t) !== -1) return true;
    if (['false', 'no', 'n', '0', 'off'].indexOf(t) !== -1) return false;
    return def;
  }
  if (typeof def === 'number') {
    var n = Number(raw);
    return isFinite(n) ? n : def;
  }
  // Text. Sheets may turn "07:00" into a time value; convert it back.
  if (raw instanceof Date) return Utilities.formatDate(raw, tz, 'HH:mm');
  return String(raw).trim();
}

/** Clears cached Settings and Staff so sheet edits apply immediately. */
function clearCache() {
  requireOwner_();
  CacheService.getScriptCache().removeAll(['settings_v1', 'staff_v1']);
  settingsMemo_ = null;
  staffMemo_ = null;
  try {
    SpreadsheetApp.getUi().alert('Cache cleared. Settings and Staff changes are now live.');
  } catch (e) { /* not running from the spreadsheet UI */ }
}
