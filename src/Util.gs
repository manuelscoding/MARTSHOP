/**
 * Util.gs — shared helpers: errors, locking, sheet access, sanitizing.
 *
 * SECURITY NOTE: any top-level function whose name does NOT end in "_" can be
 * called from a browser with google.script.run. Every helper here ends in "_"
 * on purpose so it is private to the server.
 */

/**
 * A user-facing error. Its message is shown to the user as-is, so keep it
 * friendly and never include internal details.
 */
function AppError(message) {
  this.name = 'AppError';
  this.message = message;
  this.stack = new Error(message).stack;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

var GENERIC_ERROR_ = 'Sorry, something went wrong. Please try again. If it keeps happening, let the coffee shop staff know.';

/**
 * Wraps every browser-callable function. Returns {ok:true,data} or
 * {ok:false,error}. Unexpected errors are logged to the Errors sheet and the
 * user sees a generic, friendly message.
 */
function api_(fnName, fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (e && e.name === 'AppError') return { ok: false, error: e.message };
    logError_(fnName, e);
    return { ok: false, error: GENERIC_ERROR_ };
  }
}

/** Appends a row to the Errors sheet. Never throws. */
function logError_(fnName, err) {
  var message = (err && (err.stack || err.message)) ? String(err.stack || err.message) : String(err);
  console.error('[' + fnName + '] ' + message);
  try {
    var user = '';
    try { user = Session.getActiveUser().getEmail(); } catch (ignore) { /* no user */ }
    var sheet = getSs_().getSheetByName(CONFIG.SHEETS.ERRORS);
    if (sheet) sheet.appendRow([new Date(), String(fnName), sheetSafe_(message.slice(0, 2000)), user]);
  } catch (e2) {
    console.error('logError_ failed: ' + e2);
  }
  alertAdmin_(fnName, message);
}

/**
 * Emails ADMIN_ALERT_EMAIL about an unexpected error, at most once per hour so
 * a recurring problem cannot flood the inbox or use up the email quota.
 * Never throws and never calls logError_ (to avoid loops).
 */
function alertAdmin_(fnName, message) {
  try {
    var to = String(getSettings_().ADMIN_ALERT_EMAIL || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return;
    var cache = CacheService.getScriptCache();
    if (cache.get('admin_alert_sent')) return;
    cache.put('admin_alert_sent', '1', 3600);
    if (MailApp.getRemainingDailyQuota() < 5) return;   // keep the last few emails for customers
    var ssUrl = '';
    try { ssUrl = getSs_().getUrl(); } catch (ignore) { /* no sheet */ }
    MailApp.sendEmail({
      to: to,
      subject: getSettings_().SHOP_NAME + ': app error in ' + fnName,
      body: 'The coffee shop app hit an unexpected error.\n\nFunction: ' + fnName + '\nTime: ' + new Date() +
        '\n\n' + String(message).slice(0, 1500) +
        '\n\nSee the Errors tab for details' + (ssUrl ? ': ' + ssUrl : '.') +
        '\nYou will get at most one of these alerts per hour.'
    });
  } catch (e) {
    console.error('alertAdmin_ failed: ' + e);
  }
}

/**
 * Runs fn while holding the script-wide lock, so only one order creation or
 * status change happens at a time. Flushes sheet writes before releasing.
 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new AppError('The coffee shop system is busy right now. Please wait a few seconds and try again.');
  }
  try {
    var result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

var ssMemo_ = null;

/** The database spreadsheet (the Sheet this script is attached to). */
function getSs_() {
  if (ssMemo_) return ssMemo_;
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (id) ss = SpreadsheetApp.openById(id);
  }
  if (!ss) throw new Error('Spreadsheet not found. Open the script from the Sheet (Extensions > Apps Script) and run setup().');
  ssMemo_ = ss;
  return ss;
}

function getSheet_(name) {
  var sheet = getSs_().getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet "' + name + '" is missing. Run setup() from the Apps Script editor.');
  }
  return sheet;
}

/**
 * Reads a whole sheet in ONE call. Returns
 * { sheet, headers, idx: {HeaderName: columnIndex}, rows: [[...], ...] }.
 * rows excludes the header row; rows[i] is sheet row i + 2.
 */
function readTable_(sheetName, requiredHeaders) {
  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) throw new Error('Sheet "' + sheetName + '" has no header row. Run setup().');
  var values = sheet.getRange(1, 1, Math.max(lastRow, 1), lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var idx = {};
  headers.forEach(function (h, i) { if (h) idx[h] = i; });
  (requiredHeaders || []).forEach(function (h) {
    if (!idx.hasOwnProperty(h)) {
      throw new Error('Sheet "' + sheetName + '" is missing the "' + h + '" column. Run setup() to repair headers.');
    }
  });
  return { sheet: sheet, headers: headers, idx: idx, rows: values.slice(1) };
}

/**
 * getRange() fails past the sheet's last row, so grow the sheet first.
 * Inserted rows copy the formatting of the row above.
 */
function ensureRows_(sheet, lastRowNeeded) {
  var max = sheet.getMaxRows();
  if (lastRowNeeded > max) sheet.insertRowsAfter(max, Math.max(lastRowNeeded - max, 200));
}

/**
 * CacheService is only a speed-up. It occasionally throws transient errors,
 * so these wrappers treat any cache failure as a cache miss.
 */
function cacheGet_(key) {
  try { return CacheService.getScriptCache().get(key); } catch (e) { return null; }
}
function cachePut_(key, value, seconds) {
  try { CacheService.getScriptCache().put(key, value, seconds); } catch (e) { /* best-effort */ }
}

/** HTML-escapes text for emails and server-rendered pages. */
function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Cleans free text: removes control characters, collapses spaces, trims, limits length. */
function cleanText_(value, maxLen) {
  var s = String(value === null || value === undefined ? '' : value);
  s = s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ');
  s = s.replace(/[<>]/g, '');        // angle brackets never needed in names/notes
  s = s.replace(/\s+/g, ' ').trim();
  return s.slice(0, maxLen);
}

/** Prevents spreadsheet formula injection from user-entered text. */
function sheetSafe_(s) {
  s = String(s === null || s === undefined ? '' : s);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

/** Strips the protective apostrophe (if any) when reading text back. */
function unSheetSafe_(s) {
  s = String(s === null || s === undefined ? '' : s);
  return s.charAt(0) === "'" ? s.slice(1) : s;
}

function clampInt_(n, min, max) {
  n = Math.floor(Number(n));
  if (!isFinite(n)) n = min;
  return Math.min(max, Math.max(min, n));
}

/** Converts a sheet value to epoch milliseconds (0 if empty/invalid). */
function toMs_(v) {
  if (v instanceof Date) return v.getTime();
  if (v === '' || v === null || v === undefined) return 0;
  var d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function parseJson_(s, fallback) {
  if (s === '' || s === null || s === undefined) return fallback;
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

/** Splits a comma-separated setting into a clean lowercase list. */
function splitList_(s) {
  return String(s || '').split(',')
    .map(function (x) { return x.trim().toLowerCase(); })
    .filter(function (x) { return x; });
}

function centsToAmount_(cents) {
  return Math.round(cents) / 100;
}

function toCents_(amount) {
  return Math.round(Number(amount) * 100);
}

function formatMoney_(amount) {
  return getSettings_().CURRENCY_SYMBOL + Number(amount || 0).toFixed(2);
}

function formatDateTime_(ms) {
  if (!ms) return '';
  return Utilities.formatDate(new Date(ms), getSettings_().TIMEZONE, 'EEE MMM d, h:mm a');
}

/** Random, unguessable token (64 hex chars). */
function newToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
}

/** Compares two strings without leaking timing information. */
function safeEquals_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (!a || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Validates an order number coming from the browser or a URL. */
function parseOrderNumber_(v) {
  var s = String(v === null || v === undefined ? '' : v).replace(/^#/, '').trim();
  if (!/^\d{1,7}$/.test(s)) throw new AppError('That order number is not valid.');
  return Number(s);
}

/** Validates a response token coming from the browser or a URL. */
function parseToken_(v) {
  var s = String(v || '').trim().toLowerCase();
  if (!/^[a-f0-9]{32,64}$/.test(s)) {
    throw new AppError('This link is not valid. Please use the most recent email from the coffee shop.');
  }
  return s;
}

/** Bumps the "orders changed" marker the dashboard polls for. */
function touchOrdersVersion_() {
  // Time plus a random part, so two changes in the same millisecond still differ.
  PropertiesService.getScriptProperties().setProperty('ORDERS_VERSION', Date.now() + '.' + Math.floor(Math.random() * 1e6));
}

function getOrdersVersion_() {
  return PropertiesService.getScriptProperties().getProperty('ORDERS_VERSION') || '0';
}

/** JSON safe to embed inside a <script> tag in a template. */
function safeJsonForHtml_(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Allows only the script owner running from the editor or the Sheet menu.
 * Blocks web-app visitors from calling admin functions via google.script.run
 * (for them, the active user differs from the owner, or is blank).
 */
function requireOwner_() {
  var active = '';
  var effective = '';
  try { active = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { active = ''; }
  try { effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { effective = ''; }
  if (!active || active !== effective) {
    throw new AppError('Only the owner of this script can run this function.');
  }
}

/**
 * Allows the owner (as above) OR a genuine time-driven trigger of this
 * project. Trigger runs receive an event object whose triggerUid must match
 * one of this project's installed triggers.
 */
function requireOwnerOrTrigger_(e) {
  if (e && e.triggerUid) {
    var uid = String(e.triggerUid);
    var ok = ScriptApp.getProjectTriggers().some(function (t) { return t.getUniqueId() === uid; });
    if (ok) return;
  }
  requireOwner_();
}
