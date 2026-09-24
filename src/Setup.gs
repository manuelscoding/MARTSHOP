/**
 * Setup.gs — one-time (and safe-to-repeat) setup.
 *
 * Run setup() from the Apps Script editor (or Coffee Shop > Run setup in the
 * Sheet). It:
 *   - creates any missing sheets and header columns
 *   - adds the starting menu ONLY if the Menu sheet is empty
 *   - adds any missing Settings keys (never overwrites your values)
 *   - adds you as an Admin in the Staff sheet if it is empty
 * Running it again will NOT erase orders, menu items, settings or staff.
 */

var SAMPLE_MENU_ = [
  // ItemID, Name, Price, Available, Category, SortOrder, Icon, Tag
  ['COKE', 'Coca Cola', 1, true, 'Drinks', 10, '🥤', ''],
  ['DIETCOKE', 'Diet Coke', 1, true, 'Drinks', 20, '🥤', ''],
  ['SPRITE', 'Sprite', 1, true, 'Drinks', 30, '🍋', ''],
  ['DIETDRPEPPER', 'Diet Dr Pepper', 1, true, 'Drinks', 40, '🥤', ''],
  ['GATORADE', 'Gatorade', 2, true, 'Drinks', 50, '🏅', ''],
  ['HOTTEA', 'Hot Tea', 2, true, 'Drinks', 60, '🍵', 'Hot'],
  ['ALANINU', 'Alani Nu', 3, true, 'Drinks', 70, '⚡', ''],
  ['POPPI', 'Poppi', 3, true, 'Drinks', 80, '🍹', ''],
  ['PROTEIN', 'Protein Shake', 3, true, 'Drinks', 90, '💪', ''],
  ['HOTCHOC', 'Hot Chocolate', 3, true, 'Drinks', 100, '🍫', 'Hot'],
  ['HOTCOFFEE', 'Hot Coffee', 3, true, 'Drinks', 110, '☕', 'Hot'],
  ['ICEDCOFFEE', 'Iced Coffee', 3, true, 'Drinks', 120, '🧊', 'Iced'],
  ['TAKIS', 'Takis', 1, true, 'Snacks', 210, '🌶️', 'Spicy'],
  ['LAYS', 'Lays', 1, true, 'Snacks', 220, '🥔', ''],
  ['DORITOS', 'Doritos', 1, true, 'Snacks', 230, '🧀', ''],
  ['SPARTAN', 'Spartan Special', 1, true, 'Snacks', 240, '🛡️', 'Special'],
  ['HONEYBUN', 'Honey Bun', 2, true, 'Snacks', 250, '🍯', ''],
  ['FUDGESTRIPES', 'Fudge Stripes', 2, true, 'Snacks', 260, '🍪', ''],
  ['MUFFIN', 'Muffins', 2, true, 'Snacks', 270, '🧁', ''],
  ['SEASONAL', 'Seasonal Treat', 2, true, 'Snacks', 280, '✨', 'Seasonal']
];

function setup() {
  requireOwner_();
  var ss = getSs_();
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  var owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  var ownerDomain = owner.split('@')[1] || '';

  // --- Menu ---
  var menu = ensureSheet_(ss, CONFIG.SHEETS.MENU, CONFIG.HEADERS.MENU);
  if (menu.getLastRow() < 2) {
    menu.getRange(2, 1, SAMPLE_MENU_.length, SAMPLE_MENU_[0].length).setValues(SAMPLE_MENU_);
  }
  var mIdx = headerIndex_(menu);
  var menuRows = Math.max(menu.getMaxRows() - 1, 1);
  menu.getRange(2, mIdx.Available + 1, menuRows, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  menu.getRange(2, mIdx.Price + 1, menuRows, 1).setNumberFormat('$0.00');
  menu.getRange(2, mIdx.ItemID + 1, menuRows, 1).setNumberFormat('@');

  // --- Orders ---
  var orders = ensureSheet_(ss, CONFIG.SHEETS.ORDERS, CONFIG.HEADERS.ORDERS);
  var oIdx = headerIndex_(orders);
  var oRows = Math.max(orders.getMaxRows() - 1, 1);
  ['RoomNumber', 'ResponseToken', 'CustomerName', 'StaffNotes'].forEach(function (h) {
    orders.getRange(2, oIdx[h] + 1, oRows, 1).setNumberFormat('@');   // keep as text (e.g. room "0214")
  });
  orders.getRange(2, oIdx.Total + 1, oRows, 1).setNumberFormat('$0.00');
  ['Timestamp', 'StatusUpdatedAt', 'TokenExpiresAt', 'CompletedAt'].forEach(function (h) {
    orders.getRange(2, oIdx[h] + 1, oRows, 1).setNumberFormat('yyyy-mm-dd h:mm:ss am/pm');
  });

  // --- Staff ---
  var staff = ensureSheet_(ss, CONFIG.SHEETS.STAFF, CONFIG.HEADERS.STAFF);
  if (staff.getLastRow() < 2 && owner) staff.getRange(2, 1, 1, 3).setValues([[owner, 'Shop Owner', 'Admin']]);
  var sIdx = headerIndex_(staff);
  staff.getRange(2, sIdx.Role + 1, Math.max(staff.getMaxRows() - 1, 1), 1)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STAFF_ROLES, true)
      .setAllowInvalid(false).setHelpText('Choose Admin or Staff. Only these roles can open the shop dashboard.').build());

  // --- Settings (add missing keys only) ---
  var settings = ensureSheet_(ss, CONFIG.SHEETS.SETTINGS, CONFIG.HEADERS.SETTINGS);
  settings.getRange(2, 2, Math.max(settings.getMaxRows() - 1, 1), 1).setNumberFormat('@');  // stop "07:00" becoming a time
  var existing = {};
  if (settings.getLastRow() > 1) {
    settings.getRange(2, 1, settings.getLastRow() - 1, 1).getValues()
      .forEach(function (r) { existing[String(r[0]).trim().toUpperCase()] = true; });
  }
  var toAdd = DEFAULT_SETTINGS.filter(function (d) { return !existing[d[0]]; }).map(function (d) {
    var value = d[1];
    if (d[0] === 'ALLOWED_DOMAINS' && ownerDomain && ownerDomain !== 'gmail.com') value = ownerDomain;
    return [d[0], typeof value === 'boolean' ? (value ? 'TRUE' : 'FALSE') : String(value), d[2]];
  });
  ensureRows_(settings, settings.getLastRow() + toAdd.length);
  if (toAdd.length) settings.getRange(settings.getLastRow() + 1, 1, toAdd.length, 3).setValues(toAdd);
  settings.setColumnWidth(1, 260);
  settings.setColumnWidth(2, 260);
  settings.setColumnWidth(3, 600);

  // --- Errors ---
  ensureSheet_(ss, CONFIG.SHEETS.ERRORS, CONFIG.HEADERS.ERRORS);

  // Warn (not block) anyone editing app-managed tabs by hand. The app itself
  // runs as the owner and is unaffected.
  [CONFIG.SHEETS.ORDERS, CONFIG.SHEETS.ERRORS, CONFIG.SHEETS.ARCHIVE].forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (sh && sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0) {
      sh.protect().setDescription('Managed by the Coffee Shop app. Use the dashboard instead of editing here.').setWarningOnly(true);
    }
  });

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('LAST_ORDER_NUMBER')) props.setProperty('LAST_ORDER_NUMBER', '0');
  if (!props.getProperty('ORDERS_VERSION')) touchOrdersVersion_();

  CacheService.getScriptCache().removeAll(['settings_v1', 'staff_v1', 'icons_v1']);
  settingsMemo_ = null;
  staffMemo_ = null;

  var msg = 'Setup complete.\n\n' +
    '1. Check the Settings sheet (ALLOWED_DOMAINS is "' + getSettings_().ALLOWED_DOMAINS + '").\n' +
    '2. Edit the Menu and Staff sheets.\n' +
    '3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone within your domain).\n' +
    '4. Run Coffee Shop > Check setup before announcing the app.';
  console.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { /* run from editor */ }
  return msg;
}

/** Creates the sheet if missing and makes sure every required header exists. */
function ensureSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var lastCol = sheet.getLastColumn();
  var current = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  var missing = headers.filter(function (h) { return current.indexOf(h) === -1; });
  if (!current.filter(String).length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else if (missing.length) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  }
  var width = sheet.getLastColumn();
  sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#efe6dc');
  sheet.setFrozenRows(1);
  return sheet;
}

function headerIndex_(sheet) {
  var idx = {};
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .forEach(function (h, i) { idx[String(h).trim()] = i; });
  return idx;
}

/**
 * Installs the optional maintenance triggers:
 *   - archiveOldOrders       daily at ~2 AM
 *   - autoCancelStaleOrders  every 15 minutes (does nothing unless
 *                            AUTO_CANCEL_AWAITING_MINUTES > 0)
 * Safe to run more than once.
 */
function installTriggers() {
  requireOwner_();
  var handlers = ['archiveOldOrders', 'autoCancelStaleOrders'];
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (handlers.indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('archiveOldOrders').timeBased().everyDays(1).atHour(2).create();
  ScriptApp.newTrigger('autoCancelStaleOrders').timeBased().everyMinutes(15).create();
  var msg = 'Maintenance triggers installed (daily archiving, 15-minute stale-order check).';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

/** Shows the customer and shop links (after you have deployed). */
function showLinks() {
  requireOwner_();
  var url = webAppUrl_();
  var msg = url
    ? 'Customer ordering link:\n' + url + '\n\nShop dashboard link (staff only):\n' + url + '?page=shop\n\n' +
      'If these end in /dev, they are TEST links. Use Deploy > Manage deployments to copy the /exec link, and paste it into Settings > WEB_APP_URL.'
    : 'No deployment found yet. In the Apps Script editor choose Deploy > New deployment > Web app.';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); }
}

/** Adds the "Coffee Shop" menu to the spreadsheet. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Coffee Shop')
    .addItem('Run setup / repair sheets', 'setup')
    .addItem('Check setup (health check)', 'checkSetup')
    .addItem('Show web app links', 'showLinks')
    .addItem('Clear settings cache', 'clearCache')
    .addSeparator()
    .addItem('Archive old orders now', 'archiveOldOrders')
    .addItem('Install maintenance triggers', 'installTriggers')
    .addToUi();
}

/**
 * Health check: looks for the configuration mistakes that most often break a
 * live launch, and reports them in plain language. Changes nothing.
 * Run it from Coffee Shop > Check setup (health check).
 * Returns { errors: [...], warnings: [...], info: [...] }.
 */
function checkSetup() {
  requireOwner_();
  CacheService.getScriptCache().removeAll(['settings_v1', 'staff_v1', 'icons_v1']);
  settingsMemo_ = null;
  staffMemo_ = null;
  var errors = [];
  var warnings = [];
  var info = [];
  var ss = getSs_();

  // 1. Sheets and headers
  var required = {};
  required[CONFIG.SHEETS.MENU] = CONFIG.HEADERS.MENU;
  required[CONFIG.SHEETS.ORDERS] = CONFIG.HEADERS.ORDERS;
  required[CONFIG.SHEETS.STAFF] = CONFIG.HEADERS.STAFF;
  required[CONFIG.SHEETS.SETTINGS] = CONFIG.HEADERS.SETTINGS;
  required[CONFIG.SHEETS.ERRORS] = CONFIG.HEADERS.ERRORS;
  var sheetsOk = true;
  Object.keys(required).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) { errors.push('The "' + name + '" tab is missing. Run Coffee Shop > Run setup.'); sheetsOk = false; return; }
    var have = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
    var missing = required[name].filter(function (h) { return have.indexOf(h) === -1; });
    if (missing.length) { errors.push('The "' + name + '" tab is missing column(s): ' + missing.join(', ') + '. Run Coffee Shop > Run setup.'); sheetsOk = false; }
  });
  if (!sheetsOk) return reportHealth_(errors, warnings, info);

  var s = getSettings_();
  var owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  var ownerDomain = owner.split('@')[1] || '';

  // 2. Access
  var domains = splitList_(s.ALLOWED_DOMAINS);
  if (!domains.length || domains.indexOf('yourschool.org') !== -1) {
    errors.push('Settings > ALLOWED_DOMAINS is still the placeholder. Set it to your school domain (e.g. district.org).');
  } else if (ownerDomain && domains.indexOf(ownerDomain) === -1) {
    warnings.push('The owner account (' + owner + ') is not on ALLOWED_DOMAINS (' + domains.join(', ') + '). Check the domain is spelled correctly.');
  }
  domains.forEach(function (d) {
    if (d.indexOf('@') !== -1 || d.indexOf(' ') !== -1) errors.push('ALLOWED_DOMAINS entry "' + d + '" should be just the domain, like district.org (no @).');
  });
  if (s.STUDENT_EMAIL_PATTERN) {
    try { new RegExp(s.STUDENT_EMAIL_PATTERN); } catch (e) { errors.push('Settings > STUDENT_EMAIL_PATTERN is not a valid pattern.'); }
  }
  var staff = getStaffMap_();
  var staffEmails = Object.keys(staff);
  if (!staffEmails.length) errors.push('The Staff tab has no rows with a valid email AND a Role of Admin or Staff, so nobody can open the shop dashboard.');
  var st = readTable_(CONFIG.SHEETS.STAFF, ['Email']);
  st.rows.forEach(function (r, i) {
    var email = String(r[st.idx.Email] || '').trim();
    if (!email) return;
    var roleCell = st.idx.hasOwnProperty('Role') ? String(r[st.idx.Role] || '').trim() : '';
    if (!normalizeRole_(roleCell)) {
      warnings.push('Staff tab row ' + (i + 2) + ' (' + email + ') has Role "' + roleCell + '". Only Admin or Staff can open the dashboard, so this person has NO access.');
    }
  });
  staffEmails.forEach(function (email) {
    var domain = email.split('@')[1];
    if (domains.indexOf(domain) === -1) warnings.push('Staff member ' + email + ' is not on ALLOWED_DOMAINS, so they cannot open the dashboard.');
    else if (isStudentLocalPart_(email.split('@')[0], s.STUDENT_EMAIL_PATTERN)) warnings.push('Staff member ' + email + ' looks like a STUDENT account (STUDENT_EMAIL_PATTERN), so they cannot open the dashboard.');
  });
  info.push(staffEmails.length + ' staff account(s) can use the dashboard.');

  // 3. Menu
  var t = readTable_(CONFIG.SHEETS.MENU, ['ItemID']);
  var nonBlank = t.rows.filter(function (r) { return String(r[t.idx.ItemID] || '').trim() || String(r[t.idx.Name] || '').trim(); }).length;
  var menu = readMenu_();
  var available = menu.filter(function (it) { return it.available; }).length;
  if (nonBlank > menu.length) warnings.push((nonBlank - menu.length) + ' Menu row(s) are skipped because of a missing ItemID/Name, an invalid Price, or a duplicate ItemID.');
  if (!available) errors.push('No menu items are marked Available, so customers will see an empty menu.');
  info.push(menu.length + ' menu item(s), ' + available + ' available.');

  // 4. Settings values
  try { new RegExp(s.ROOM_PATTERN); } catch (e) { errors.push('Settings > ROOM_PATTERN is not a valid pattern; the default is being used.'); }
  ['ORDER_OPEN_TIME', 'ORDER_CLOSE_TIME', 'STUDENT_ORDER_OPEN_TIME', 'STUDENT_ORDER_CLOSE_TIME'].forEach(function (k) {
    if (s[k] && !normalizeTime_(s[k])) errors.push('Settings > ' + k + ' "' + s[k] + '" is not a 24-hour time like 07:30. It is being ignored.');
  });
  var validDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  ['ORDER_DAYS', 'STUDENT_ORDER_DAYS'].forEach(function (k) {
    splitList_(s[k]).forEach(function (d) {
      if (validDays.indexOf(d.slice(0, 3)) === -1) errors.push('Settings > ' + k + ' contains "' + d + '". Use Mon,Tue,Wed,Thu,Fri,Sat,Sun.');
    });
  });
  if (!s.ORDERING_ENABLED) warnings.push('ORDERING_ENABLED is FALSE: customers cannot order right now.');
  if (s.REPLY_TO_EMAIL && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.REPLY_TO_EMAIL)) warnings.push('Settings > REPLY_TO_EMAIL is not a valid email and is being ignored.');
  ['FAVICON_URL', 'SHOP_FAVICON_URL'].forEach(function (k) {
    if (s[k] && !isValidFaviconUrl_(s[k])) warnings.push('Settings > ' + k + ' must be a link starting with https:// to an image. It is being ignored.');
  });
  if (!s.ADMIN_ALERT_EMAIL) warnings.push('Settings > ADMIN_ALERT_EMAIL is blank. Set it so someone is emailed if the app hits an error.');
  info.push('Hours: ' + describeHours_(getRules_({ customerType: CONFIG.CUSTOMER_TYPES.STAFF })) + ' (script time zone ' + s.TIMEZONE + ').');

  // 5. Deployment and email
  var url = webAppUrl_();
  if (!url) {
    errors.push('The web app is not deployed yet. In the Apps Script editor: Deploy > New deployment > Web app.');
  } else if (!s.WEB_APP_URL) {
    warnings.push('Settings > WEB_APP_URL is blank. Paste the /exec deployment URL there so email links always open the live app.');
  } else if (!/\/exec$/.test(s.WEB_APP_URL)) {
    errors.push('Settings > WEB_APP_URL should be the live link ending in /exec (it is "' + s.WEB_APP_URL + '").');
  }
  if (url) info.push('Customer link: ' + url + '   Dashboard: ' + url + '?page=shop');
  if (!s.SEND_EMAILS) warnings.push('SEND_EMAILS is FALSE: customers get no confirmation or "item unavailable" emails.');
  info.push('Emails left today: ' + MailApp.getRemainingDailyQuota() + '.');

  // 6. Maintenance
  var handlers = ScriptApp.getProjectTriggers().map(function (tr) { return tr.getHandlerFunction(); });
  if (handlers.indexOf('archiveOldOrders') === -1) warnings.push('Maintenance triggers are not installed (nightly archiving and log clean-up). Run Coffee Shop > Install maintenance triggers.');
  var errSheet = ss.getSheetByName(CONFIG.SHEETS.ERRORS);
  var recentErrors = 0;
  if (errSheet.getLastRow() > 1) {
    var dayAgo = Date.now() - 86400000;
    recentErrors = errSheet.getRange(2, 1, errSheet.getLastRow() - 1, 1).getValues()
      .filter(function (r) { return toMs_(r[0]) > dayAgo; }).length;
  }
  if (recentErrors) warnings.push(recentErrors + ' error(s) were logged in the last 24 hours. See the Errors tab.');

  return reportHealth_(errors, warnings, info);
}

function reportHealth_(errors, warnings, info) {
  var lines = [];
  lines.push(errors.length ? '❌ ' + errors.length + ' problem(s) to fix before going live:' : '✅ No blocking problems found.');
  errors.forEach(function (m) { lines.push('  • ' + m); });
  if (warnings.length) {
    lines.push('', '⚠️ ' + warnings.length + ' warning(s):');
    warnings.forEach(function (m) { lines.push('  • ' + m); });
  }
  if (info.length) {
    lines.push('', 'ℹ️ Info:');
    info.forEach(function (m) { lines.push('  • ' + m); });
  }
  lines.push('', 'App version ' + CONFIG.APP_VERSION + '.');
  var text = lines.join('\n');
  console.log(text);
  try { SpreadsheetApp.getUi().alert('Coffee Shop health check', text, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) { /* run from editor */ }
  return { errors: errors, warnings: warnings, info: info };
}
