/**
 * Util.gs — shared helpers: errors, locking, sheet access, sanitizing, time.
 *
 * SECURITY NOTE: any top-level function whose name does NOT end in "_" can be
 * called from a browser with google.script.run. Every helper here ends in "_"
 * on purpose. tests/check.js fails if a browser-callable function lacks an
 * access check.
 */

/** A user-facing error: its message is shown to the user as-is. */
function AppError(message) {
  this.name = 'AppError';
  this.message = message;
  this.stack = new Error(message).stack;
}
AppError.prototype = Object.create(Error.prototype);
AppError.prototype.constructor = AppError;

/** Wraps every browser-callable function: returns {ok:true,data} or {ok:false,error}. */
function api_(fnName, fn) {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (e && e.name === 'AppError') return { ok: false, error: e.message };
    logError_(fnName, e);
    return { ok: false, error: t_('server.generic') };
  }
}

/** Appends a row to the Errors sheet and (rate-limited) alerts the admin. Never throws. */
function logError_(fnName, err) {
  var message = (err && (err.stack || err.message)) ? String(err.stack || err.message) : String(err);
  console.error('[' + fnName + '] ' + message);
  try {
    var user = '';
    try { user = Session.getActiveUser().getEmail(); } catch (ignore) { /* none */ }
    var sheet = getSs_().getSheetByName(CONFIG.SHEETS.ERRORS);
    if (sheet) sheet.appendRow([new Date(), String(fnName), sheetSafe_(message.slice(0, 2000)), user]);
  } catch (e2) {
    console.error('logError_ failed: ' + e2);
  }
  alertAdmin_(fnName, message);
}

function alertAdmin_(fnName, message) {
  try {
    var to = String(getSettings_().ADMIN_ALERT_EMAIL || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return;
    if (cacheGet_('admin_alert_sent')) return;
    cachePut_('admin_alert_sent', '1', 3600);
    if (MailApp.getRemainingDailyQuota() < 5) return;
    MailApp.sendEmail({
      to: to,
      subject: getSettings_().APP_NAME + ': app error in ' + fnName,
      body: 'The app hit an unexpected error.\n\nFunction: ' + fnName + '\nTime: ' + new Date() + '\n\n' +
        String(message).slice(0, 1500) + '\n\nSee the Errors tab. At most one alert per hour is sent.'
    });
  } catch (e) {
    console.error('alertAdmin_ failed: ' + e);
  }
}

/** Runs fn holding the script-wide lock; flushes writes before releasing. */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new AppError(t_('server.busy'));
  try {
    var result = fn();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

var ssMemo_ = null;
/** The Sheet this script is attached to (the app only ever uses this one). */
function getSs_() {
  if (ssMemo_) return ssMemo_;
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) throw new Error('Spreadsheet not found. Create the script from the Sheet (Extensions > Apps Script) and run setup().');
  ssMemo_ = ss;
  return ss;
}

function getSheet_(name) {
  var sheet = getSs_().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" is missing. Run setup() from the Apps Script editor.');
  return sheet;
}

/** Reads a whole sheet in ONE call: {sheet, headers, idx, rows} (rows[i] = sheet row i+2). */
function readTable_(sheetName, requiredHeaders) {
  var sheet = getSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) throw new Error('Sheet "' + sheetName + '" has no header row. Run setup().');
  var values = sheet.getRange(1, 1, Math.max(lastRow, 1), lastCol).getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var idx = dict_();
  headers.forEach(function (h, i) { if (h) idx[h] = i; });
  (requiredHeaders || []).forEach(function (h) {
    if (!(h in idx)) throw new Error('Sheet "' + sheetName + '" is missing the "' + h + '" column. Run setup() to repair headers.');
  });
  return { sheet: sheet, headers: headers, idx: idx, rows: values.slice(1) };
}

/** getRange() fails past the last row, so grow the sheet first. */
function ensureRows_(sheet, lastRowNeeded) {
  var max = sheet.getMaxRows();
  if (lastRowNeeded > max) sheet.insertRowsAfter(max, Math.max(lastRowNeeded - max, 200));
}

/** Appends many rows in one call. */
function appendRows_(sheet, rows) {
  if (!rows.length) return;
  var start = sheet.getLastRow() + 1;
  ensureRows_(sheet, start + rows.length - 1);
  sheet.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

/** CacheService is a speed-up only: failures count as a cache miss. */
function cacheGet_(key) {
  try { return CacheService.getScriptCache().get(key); } catch (e) { return null; }
}
function cachePut_(key, value, seconds) {
  try { CacheService.getScriptCache().put(key, value, seconds); } catch (e) { /* best-effort */ }
}

/** Per-user rate limit (best-effort, cache based). */
function rateLimit_(bucket, email, max, windowSeconds) {
  var key = 'rl_' + bucket + '_' + Utilities.base64EncodeWebSafe(String(email || 'anon'));
  var now = Date.now();
  var state = null;
  try { state = JSON.parse(cacheGet_(key) || 'null'); } catch (e) { state = null; }
  if (!state || now - state.start > windowSeconds * 1000) state = { start: now, n: 0 };
  state.n++;
  cachePut_(key, JSON.stringify(state), windowSeconds);
  if (state.n > max) throw new AppError(t_('server.tooOften'));
}

/** Dictionary with no built-in properties: safe to index with browser-supplied IDs. */
function dict_(from) {
  var d = Object.create(null);
  if (from) Object.keys(from).forEach(function (k) { d[k] = from[k]; });
  return d;
}

function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Removes control characters and angle brackets, collapses spaces, trims, limits length. */
function cleanText_(value, maxLen) {
  var s = String(value === null || value === undefined ? '' : value);
  s = s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ').replace(/[<>]/g, '');
  return s.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

/** Neutralises spreadsheet formula injection. */
function sheetSafe_(s) {
  s = String(s === null || s === undefined ? '' : s);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
function unSheetSafe_(s) {
  s = String(s === null || s === undefined ? '' : s);
  return s.charAt(0) === "'" ? s.slice(1) : s;
}

function clampInt_(n, min, max) {
  n = Math.floor(Number(n));
  if (!isFinite(n)) n = min;
  return Math.min(max, Math.max(min, n));
}

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

function splitList_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim().toLowerCase(); }).filter(function (x) { return x; });
}
/** Comma list keeping original case (delivery windows etc.). */
function splitListKeepCase_(s) {
  return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

function toCents_(amount) { return Math.round(Number(amount) * 100); }
function centsToAmount_(cents) { return Math.round(cents) / 100; }
function formatMoney_(amount) { return getSettings_().CURRENCY_SYMBOL + Number(amount || 0).toFixed(2); }

/** The current time. Tests replace this to simulate cutoffs. */
function now_() { return new Date(); }

/** 'yyyy-MM-dd' in the school's time zone. */
function dayKey_(msOrDate) {
  return Utilities.formatDate(new Date(msOrDate instanceof Date ? msOrDate.getTime() : msOrDate), getSettings_().TIMEZONE, 'yyyy-MM-dd');
}

function formatDateTime_(ms) {
  return ms ? Utilities.formatDate(new Date(ms), getSettings_().TIMEZONE, 'EEE MMM d, h:mm a') : '';
}

function newToken_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
}

function safeEquals_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (!a || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function parseOrderNumber_(v) {
  var s = String(v === null || v === undefined ? '' : v).replace(/^#/, '').trim();
  if (!/^\d{1,7}$/.test(s)) throw new AppError(t_('server.linkInvalid'));
  return Number(s);
}

/** Token from a link: '' if absent; throws if malformed. */
function parseOptionalToken_(v) {
  if (v === null || v === undefined || v === '') return '';
  var s = String(v).trim().toLowerCase();
  if (!/^[a-f0-9]{32,64}$/.test(s)) throw new AppError(t_('server.linkInvalid'));
  return s;
}

/** Bumps the "orders changed" marker the dashboard polls for. */
function touchOrdersVersion_() {
  PropertiesService.getScriptProperties().setProperty('ORDERS_VERSION', Date.now() + '.' + Math.floor(Math.random() * 1e6));
}
function getOrdersVersion_() {
  return PropertiesService.getScriptProperties().getProperty('ORDERS_VERSION') || '0';
}

function safeJsonForHtml_(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** Only the script owner (editor / Sheet menu). Blocks web-app visitors. */
function requireOwner_() {
  var active = '';
  var effective = '';
  try { active = String(Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) { active = ''; }
  try { effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase(); } catch (e) { effective = ''; }
  if (!active || active !== effective) throw new AppError(t_('server.ownerOnly'));
}

/** Owner, or a genuine installed time-driven trigger (Google's AuthMode object cannot be forged by a browser). */
function requireOwnerOrTrigger_(e) {
  if (e && e.triggerUid && e.authMode === ScriptApp.AuthMode.FULL) {
    var uid = String(e.triggerUid);
    if (ScriptApp.getProjectTriggers().some(function (t) { return t.getUniqueId() === uid; })) return;
  }
  requireOwner_();
}
