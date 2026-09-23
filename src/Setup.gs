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
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STAFF_ROLES, true).build());

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

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('LAST_ORDER_NUMBER')) props.setProperty('LAST_ORDER_NUMBER', '0');
  if (!props.getProperty('ORDERS_VERSION')) touchOrdersVersion_();

  CacheService.getScriptCache().removeAll(['settings_v1', 'staff_v1']);
  settingsMemo_ = null;
  staffMemo_ = null;

  var msg = 'Setup complete.\n\n' +
    '1. Check the Settings sheet (ALLOWED_DOMAINS is "' + getSettings_().ALLOWED_DOMAINS + '").\n' +
    '2. Edit the Menu and Staff sheets.\n' +
    '3. Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone within your domain).';
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
    .addItem('Show web app links', 'showLinks')
    .addItem('Clear settings cache', 'clearCache')
    .addSeparator()
    .addItem('Archive old orders now', 'archiveOldOrders')
    .addItem('Install maintenance triggers', 'installTriggers')
    .addToUi();
}
