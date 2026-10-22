/**
 * Setup.gs — setup, health check, triggers, the "Cookie Cart" Sheet menu.
 *
 * setup() is safe to run again at any time: it creates missing sheets and
 * columns, adds sample data only to EMPTY sheets, adds missing Settings keys,
 * and never deletes anything.
 */

var SAMPLE_PRODUCTS_ = [
  // ProductID, Name, Description, Price, Available, DailyLimit, Allergens, DietaryTags, ImageURL, SortOrder
  ['CHOC_CHIP', 'Chocolate Chip Cookie', 'Fresh-baked, soft chocolate chip cookie.', 1.00, true, '', 'Wheat, Milk, Eggs, Soy', 'Vegetarian', '', 10],
  // Example of a second cookie: tick Available to switch the order page to the multi-cookie layout.
  ['SUGAR', 'Sugar Cookie', 'Classic sugar cookie with sprinkles.', 1.00, false, '', 'Wheat, Milk, Eggs', 'Vegetarian, Nut-free', '', 20]
];

function setup() {
  requireOwner_();
  var ss = getSs_();
  var owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  var ownerDomain = owner.split('@')[1] || '';

  var products = ensureSheet_(ss, CONFIG.SHEETS.PRODUCTS, CONFIG.HEADERS.PRODUCTS);
  if (products.getLastRow() < 2) writeByHeader_(products, CONFIG.HEADERS.PRODUCTS, SAMPLE_PRODUCTS_);
  var pi = headerIndex_(products);
  var pRows = Math.max(products.getMaxRows() - 1, 1);
  products.getRange(2, pi.Available + 1, pRows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  products.getRange(2, pi.Price + 1, pRows, 1).setNumberFormat('$0.00');
  products.getRange(2, pi.ProductID + 1, pRows, 1).setNumberFormat('@');

  var orders = ensureSheet_(ss, CONFIG.SHEETS.ORDERS, CONFIG.HEADERS.ORDERS);
  var oi = headerIndex_(orders);
  var oRows = Math.max(orders.getMaxRows() - 1, 1);
  ['RoomNumber', 'EditToken', 'CustomerName', 'ClassOrNote', 'SpecialInstructions', 'PaymentMethod'].forEach(function (h) {
    orders.getRange(2, oi[h] + 1, oRows, 1).setNumberFormat('@');
  });
  orders.getRange(2, oi.Total + 1, oRows, 1).setNumberFormat('$0.00');
  ['CreatedAt', 'LastUpdatedAt', 'DispatchedAt', 'DeliveredAt'].forEach(function (h) {
    orders.getRange(2, oi[h] + 1, oRows, 1).setNumberFormat('yyyy-mm-dd h:mm am/pm');
  });

  ensureSheet_(ss, CONFIG.SHEETS.HISTORY, CONFIG.HEADERS.HISTORY);

  var staff = ensureSheet_(ss, CONFIG.SHEETS.STAFF, CONFIG.HEADERS.STAFF);
  if (staff.getLastRow() < 2 && owner) staff.getRange(2, 1, 1, 3).setValues([[owner, 'Cookie Cart Owner', 'Admin']]);
  var si = headerIndex_(staff);
  staff.getRange(2, si.Role + 1, Math.max(staff.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STAFF_ROLES, true).setAllowInvalid(false)
      .setHelpText('Choose Admin or Staff. Only these roles can open the dashboard.').build());

  var settings = ensureSheet_(ss, CONFIG.SHEETS.SETTINGS, CONFIG.HEADERS.SETTINGS);
  settings.getRange(2, 2, Math.max(settings.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  var existing = dict_();
  if (settings.getLastRow() > 1) {
    settings.getRange(2, 1, settings.getLastRow() - 1, 1).getValues().forEach(function (r) { existing[String(r[0]).trim().toUpperCase()] = true; });
  }
  var toAdd = DEFAULT_SETTINGS.filter(function (d) { return !(d[0] in existing); }).map(function (d) {
    var v = d[1];
    if (d[0] === 'ALLOWED_DOMAINS' && ownerDomain && ownerDomain !== 'gmail.com') v = ownerDomain;
    return [d[0], typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v), d[2]];
  });
  if (toAdd.length) appendRows_(settings, toAdd);
  settings.setColumnWidth(1, 260); settings.setColumnWidth(2, 300); settings.setColumnWidth(3, 620);

  ensureSheet_(ss, CONFIG.SHEETS.ERRORS, CONFIG.HEADERS.ERRORS);

  // Warn anyone editing app-managed tabs by hand (the app itself is unaffected).
  [CONFIG.SHEETS.ORDERS, CONFIG.SHEETS.HISTORY, CONFIG.SHEETS.ERRORS].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
      sh.protect().setDescription('Managed by the Cookie Cart app. Use the dashboard instead.').setWarningOnly(true);
    }
  });

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('LAST_ORDER_NUMBER')) props.setProperty('LAST_ORDER_NUMBER', '0');
  touchOrdersVersion_();
  clearCaches_();

  var msg = 'Setup complete.\n\n1. Check the Settings tab (ALLOWED_DOMAINS is "' + getSettings_().ALLOWED_DOMAINS + '").\n' +
    '2. Edit the Products and Staff tabs.\n3. Deploy > New deployment > Web app (Execute as: Me; Anyone within your domain).\n' +
    '4. Cookie Cart > Install triggers, then Cookie Cart > Check setup.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
  return msg;
}

function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var lastCol = sheet.getLastColumn();
  var current = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  var missing = headers.filter(function (h) { return current.indexOf(h) === -1; });
  if (!current.filter(String).length) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  else if (missing.length) sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#f3e6d8');
  sheet.setFrozenRows(1);
  return sheet;
}

function headerIndex_(sheet) {
  var idx = dict_();
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].forEach(function (h, i) { idx[String(h).trim()] = i; });
  return idx;
}

/** Appends rows given in CONFIG header order under the matching header names. */
function writeByHeader_(sheet, headers, rows) {
  var idx = headerIndex_(sheet);
  var width = sheet.getLastColumn();
  appendRows_(sheet, rows.map(function (r) {
    var line = [];
    for (var c = 0; c < width; c++) line.push('');
    headers.forEach(function (h, i) { if (h in idx) line[idx[h]] = r[i]; });
    return line;
  }));
}

/**
 * Installs the time-driven jobs (safe to run again):
 *   nightlyMaintenance  ~2 AM daily (retention clean-up)
 *   sendDailySummary    ~4 PM daily (emails DAILY_SUMMARY_EMAILS if there were orders)
 */
function installTriggers() {
  requireOwner_();
  var handlers = ['nightlyMaintenance', 'sendDailySummary'];
  ScriptApp.getProjectTriggers().forEach(function (t) { if (handlers.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('nightlyMaintenance').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('sendDailySummary').timeBased().everyDays(1).atHour(16).create();
  try { SpreadsheetApp.getUi().alert('Triggers installed: nightly clean-up (~2 AM) and daily summary email (~4 PM).'); } catch (e) { /* editor */ }
}

function showLinks() {
  requireOwner_();
  var url = webAppUrl_();
  var msg = url ? 'Teachers (ordering):\n' + url + '\n\nCookie Cart staff (dashboard):\n' + url + '?page=dashboard\n\n' +
    'If these end in /dev they are TEST links. Copy the /exec link from Deploy > Manage deployments into Settings > WEB_APP_URL.'
    : 'Not deployed yet: Deploy > New deployment > Web app.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Cookie Cart')
    .addItem('Run setup / repair sheets', 'setup')
    .addItem('Check setup (health check)', 'checkSetup')
    .addItem('Show web app links', 'showLinks')
    .addItem('Clear cache', 'clearCache')
    .addSeparator()
    .addItem('Install triggers (nightly clean-up + daily summary)', 'installTriggers')
    .addItem('Reset for go-live (clear test orders, restart at #1)', 'resetForLaunch')
    .addToUi();
}

/**
 * Simple trigger: when someone edits Products, Settings or Staff in the
 * Sheet, clear the cache so the change shows up right away. It only clears a
 * cache, so it is harmless if called any other way.
 */
function onEdit(e) {
  try {
    var name = e && e.range ? e.range.getSheet().getName() : '';
    if ([CONFIG.SHEETS.PRODUCTS, CONFIG.SHEETS.SETTINGS, CONFIG.SHEETS.STAFF].indexOf(name) !== -1) {
      CacheService.getScriptCache().removeAll(['settings_v1', 'products_v1', 'staff_v1']);
    }
  } catch (err) { /* never block an edit */ }
}

/**
 * Health check: reports, in plain language, the configuration mistakes that
 * most often break a launch. Changes nothing.
 */
function checkSetup() {
  requireOwner_();
  clearCaches_();
  var errors = [];
  var warnings = [];
  var info = [];
  var ss = getSs_();
  var req = [[CONFIG.SHEETS.PRODUCTS, CONFIG.HEADERS.PRODUCTS], [CONFIG.SHEETS.ORDERS, CONFIG.HEADERS.ORDERS], [CONFIG.SHEETS.HISTORY, CONFIG.HEADERS.HISTORY],
    [CONFIG.SHEETS.STAFF, CONFIG.HEADERS.STAFF], [CONFIG.SHEETS.SETTINGS, CONFIG.HEADERS.SETTINGS], [CONFIG.SHEETS.ERRORS, CONFIG.HEADERS.ERRORS]];
  var ok = true;
  req.forEach(function (r) {
    var sh = ss.getSheetByName(r[0]);
    if (!sh) { errors.push('The "' + r[0] + '" tab is missing. Run Cookie Cart > Run setup.'); ok = false; return; }
    var have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    var missing = r[1].filter(function (h) { return have.indexOf(h) === -1; });
    if (missing.length) { errors.push('"' + r[0] + '" is missing column(s): ' + missing.join(', ') + '. Run setup.'); ok = false; }
  });
  if (ok) {
    var s = getSettings_();
    var domains = splitList_(s.ALLOWED_DOMAINS);
    if (!domains.length || domains.indexOf('yourschool.org') !== -1) errors.push('Settings > ALLOWED_DOMAINS is still the placeholder. Set your school domain (e.g. district.org).');
    var staffCount = Object.keys(getStaffMap_()).length;
    if (!staffCount) errors.push('Nobody can open the dashboard: add a row to Staff with Role Admin or Staff.');
    else info.push(staffCount + ' staff account(s) can use the dashboard.');
    var products = readProducts_();
    var avail = products.filter(function (p) { return p.available; });
    if (!avail.length) errors.push('No cookie is ticked Available in the Products tab.');
    info.push(products.length + ' cookie type(s), ' + avail.length + ' available' + (avail.length > 1 ? ' (multi-cookie layout)' : ' (single-cookie layout)') + '.');
    products.forEach(function (p) { if (!p.imageUrl && p.available) { /* photos are optional */ } });
    ['ORDER_OPEN_TIME', 'ORDER_CUTOFF_TIME'].forEach(function (k) {
      if (s[k] && !normalizeTime_(s[k])) errors.push('Settings > ' + k + ' "' + s[k] + '" is not a 24-hour time like 10:30.');
    });
    splitList_(s.ORDER_DAYS).forEach(function (d) {
      if (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(d.slice(0, 3)) === -1) errors.push('Settings > ORDER_DAYS contains "' + d + '".');
    });
    try { new RegExp(s.ROOM_PATTERN); } catch (e) { errors.push('Settings > ROOM_PATTERN is not a valid pattern.'); }
    var url = webAppUrl_();
    if (!url) errors.push('Not deployed yet: Deploy > New deployment > Web app.');
    else if (!s.WEB_APP_URL) warnings.push('Settings > WEB_APP_URL is blank. Paste the /exec link so email Edit buttons always open the live app.');
    else if (!/\/exec$/.test(s.WEB_APP_URL)) errors.push('Settings > WEB_APP_URL must end in /exec.');
    if (!s.SEND_EMAILS) warnings.push('SEND_EMAILS is FALSE: teachers get no confirmation or Edit links.');
    if (!s.ADMIN_ALERT_EMAIL) warnings.push('ADMIN_ALERT_EMAIL is blank: nobody is emailed if the app hits an error.');
    var handlers = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
    if (handlers.indexOf('nightlyMaintenance') === -1) warnings.push('Triggers not installed: run Cookie Cart > Install triggers.');
    var win = getOrderingWindow_();
    info.push('Ordering right now: ' + (win.open ? 'OPEN' : 'closed (' + win.message + ')') + '. Time zone ' + s.TIMEZONE + '.');
    info.push('Emails left today: ' + MailApp.getRemainingDailyQuota() + '.');
  }
  var lines = [errors.length ? '❌ ' + errors.length + ' problem(s) to fix:' : '✅ No blocking problems found.'];
  errors.forEach(function (m) { lines.push('  • ' + m); });
  if (warnings.length) { lines.push('', '⚠️ Warnings:'); warnings.forEach(function (m) { lines.push('  • ' + m); }); }
  if (info.length) { lines.push('', 'ℹ️ Info:'); info.forEach(function (m) { lines.push('  • ' + m); }); }
  lines.push('', 'App version ' + CONFIG.APP_VERSION + '.');
  try { SpreadsheetApp.getUi().alert('Cookie Cart health check', lines.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { console.log(lines.join('\n')); }
  return { errors: errors, warnings: warnings, info: info };
}

/**
 * ONE-TIME before launch: backs up and clears test orders and the change
 * log, and restarts numbering at ORDER_NUMBER_START. Owner only, from the
 * Sheet menu, after typing RESET.
 */
function resetForLaunch() {
  requireOwner_();
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {
    throw new Error('Run this from the spreadsheet: Cookie Cart > Reset for go-live. It needs you to type RESET to confirm.');
  }
  var ss = getSs_();
  var s = getSettings_();
  var count = loadOrders_().orders.length;
  var reply = ui.prompt('Reset for go-live', 'This clears ' + count + ' order(s), the OrderHistory and Errors tabs, and the next order will be #' +
    s.ORDER_NUMBER_START + '. A backup copy of Orders and OrderHistory is saved first. Products, Staff and Settings are not changed.\n\n' +
    'Only do this before real orders start.\n\nType RESET to continue:', ui.ButtonSet.OK_CANCEL);
  if (reply.getSelectedButton() !== ui.Button.OK || String(reply.getResponseText()).trim().toUpperCase() !== 'RESET') {
    ui.alert('Nothing was changed.');
    return { reset: false };
  }
  var stamp = Utilities.formatDate(new Date(), s.TIMEZONE, 'yyyy-MM-dd HHmm');
  withLock_(function () {
    [CONFIG.SHEETS.ORDERS, CONFIG.SHEETS.HISTORY].forEach(function (n) {
      var sh = ss.getSheetByName(n);
      if (sh && sh.getLastRow() > 1) sh.copyTo(ss).setName('Backup – ' + n + ' ' + stamp);
    });
    [CONFIG.SHEETS.ORDERS, CONFIG.SHEETS.HISTORY, CONFIG.SHEETS.ERRORS].forEach(function (n) {
      var sh = ss.getSheetByName(n);
      if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
    });
    PropertiesService.getScriptProperties().setProperty('LAST_ORDER_NUMBER', String(s.ORDER_NUMBER_START - 1));
    touchOrdersVersion_();
  });
  ui.alert('Reset complete. The next order will be #' + s.ORDER_NUMBER_START + '. Backups were saved in "Backup – …" tabs.');
  return { reset: true, next: s.ORDER_NUMBER_START };
}
