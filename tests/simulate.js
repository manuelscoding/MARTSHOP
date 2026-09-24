/**
 * tests/simulate.js — OPTIONAL developer check. Not needed to run the app.
 *
 * Runs the server code (src/*.gs) in Node.js against in-memory fakes of the
 * Apps Script services (Sheets, Mail, Cache, Lock...), then exercises the main
 * flows from the test checklist. Usage:   node tests/simulate.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const assert = require('assert');

/* ------------------------------------------------------------------ fakes */

function makeSheet(name) {
  const sheet = {
    name, data: [], maxRows: 1000,
    getName: () => name,
    getLastRow() {
      for (let r = sheet.data.length - 1; r >= 0; r--) {
        if ((sheet.data[r] || []).some(v => v !== '' && v !== null && v !== undefined)) return r + 1;
      }
      return 0;
    },
    getLastColumn() { return sheet.data.reduce((m, row) => Math.max(m, lastNonEmpty(row)), 0); },
    getMaxRows: () => sheet.maxRows,
    insertRowsAfter(after, n) { sheet.maxRows += n; },
    appendRow(values) { const r = sheet.getLastRow() + 1; sheet.getRange(r, 1, 1, values.length).setValues([values]); },
    setFrozenRows() {}, setColumnWidth() {},
    protections: [],
    getProtections() { return sheet.protections; },
    protect() { const pr = { setDescription: () => pr, setWarningOnly: (w) => { pr.warningOnly = w; return pr; } }; sheet.protections.push(pr); return pr; },
    getRange(row, col, nr = 1, nc = 1) {
      if (row < 1 || col < 1) throw new Error('bad range');
      if (row + nr - 1 > sheet.maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
      const rng = {
        getValues() {
          const out = [];
          for (let r = 0; r < nr; r++) {
            const src = sheet.data[row - 1 + r] || [];
            const line = [];
            for (let c = 0; c < nc; c++) { const v = src[col - 1 + c]; line.push(v === undefined ? '' : v); }
            out.push(line);
          }
          return out;
        },
        setValues(vals) {
          assert.strictEqual(vals.length, nr, 'setValues row count');
          vals.forEach((line, r) => {
            assert.strictEqual(line.length, nc, 'setValues col count');
            const target = sheet.data[row - 1 + r] = sheet.data[row - 1 + r] || [];
            line.forEach((v, c) => { target[col - 1 + c] = store(v); });
          });
          return rng;
        },
        setValue(v) { return rng.setValues([[v]]); },
        clearContent() { for (let r = 0; r < nr; r++) { const t = sheet.data[row - 1 + r]; if (t) for (let c = 0; c < nc; c++) t[col - 1 + c] = ''; } return rng; },
        setNumberFormat: () => rng, setDataValidation: () => rng, setFontWeight: () => rng, setBackground: () => rng
      };
      return rng;
    }
  };
  return sheet;
}
function lastNonEmpty(row) { for (let i = row.length - 1; i >= 0; i--) if (row[i] !== '' && row[i] !== undefined) return i + 1; return 0; }
// Mimic Sheets: numbers stay numbers, Date stays Date, 'TRUE' strings stay strings (text format columns).
function store(v) { return v instanceof Date ? new Date(v.getTime()) : v; }

const sheets = {};
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = makeSheet(n)),
  getId: () => 'SSID',
  getUrl: () => 'https://docs.google.com/spreadsheets/d/SSID'
};

let activeEmail = 'owner@school.org';
const ownerEmail = 'owner@school.org';
const mail = [];
const cacheMap = new Map();
const props = new Map();
let mailQuota = 100;

const g = {
  console: { log() {}, warn() {}, error: (...a) => g.__errors.push(a.join(' ')) },
  __errors: [],
  __triggers: [],
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ss, openById: () => ss, flush() {},
    getUi() { throw new Error('no ui'); },
    ProtectionType: { SHEET: 'SHEET' },
    newDataValidation() { const b = { requireCheckbox: () => b, requireValueInList: () => b, setAllowInvalid: () => b, setHelpText: () => b, build: () => ({}) }; return b; }
  },
  Session: {
    getActiveUser: () => ({ getEmail: () => activeEmail }),
    getEffectiveUser: () => ({ getEmail: () => ownerEmail }),
    getScriptTimeZone: () => 'America/New_York'
  },
  CacheService: { getScriptCache: () => ({
    get: k => (cacheMap.has(k) ? cacheMap.get(k) : null), put: (k, v) => cacheMap.set(k, v),
    removeAll: ks => ks.forEach(k => cacheMap.delete(k))
  }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v))
  }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  MailApp: {
    getRemainingDailyQuota: () => mailQuota,
    sendEmail: m => { mailQuota--; mail.push(m); }
  },
  ScriptApp: {
    getService: () => ({ getUrl: () => 'https://script.google.com/a/macros/school.org/s/ABC/exec' }),
    getProjectTriggers: () => g.__triggers,
  },
  HtmlService: {
    createTemplateFromFile: f => { const t = { evaluate: () => ({ file: f, t, favicon: null,
      setTitle() { return this; }, addMetaTag() { return this; },
      setFaviconUrl(u) { if (g.__faviconThrows) throw new Error('Invalid argument: ' + u); this.favicon = u; return this; } }) }; return t; },
    createHtmlOutputFromFile: () => ({ getContent: () => '' })
  },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    base64EncodeWebSafe: s => Buffer.from(s).toString('base64url'),
    formatDate(d, tz, pattern) {
      const parts = {};
      new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
        .formatToParts(d).forEach(p => { parts[p.type] = p.value; });
      const h24 = Number(parts.hour);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return pattern
        .replace('yyyy', parts.year).replace('MMM', months[Number(parts.month) - 1]).replace('MM', parts.month)
        .replace('dd', parts.day).replace(/\bd\b/, String(Number(parts.day))).replace('EEE', parts.weekday)
        .replace('HH', parts.hour).replace(/\bh\b/, String(h24 % 12 || 12)).replace('mm', parts.minute)
        .replace(/\ba\b/, h24 < 12 ? 'AM' : 'PM');
    }
  }
};
vm.createContext(g);
const srcDir = path.join(__dirname, '..', 'src');
['Config', 'Util', 'Auth', 'Menu', 'Orders', 'Email', 'Setup', 'Code'].forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(srcDir, f + '.gs'), 'utf8'), g, { filename: f + '.gs' });
});

/* ---------------------------------------------------------------- helpers */

function as(email) {
  activeEmail = email;
  // per-execution memos must reset between "requests"
  vm.runInContext('ctxMemo_ = null; settingsMemo_ = null; staffMemo_ = null;', g);
}
function ok(res) { assert.ok(res && res.ok, 'expected ok, got ' + JSON.stringify(res)); return res.data; }
function fail(res, re) {
  assert.ok(res && !res.ok, 'expected failure, got ' + JSON.stringify(res));
  if (re) assert.ok(re.test(res.error), 'error "' + res.error + '" does not match ' + re);
  return res.error;
}
function setSetting(key, value) {
  const s = sheets.Settings;
  const row = s.data.findIndex(r => r && r[0] === key);
  s.data[row][1] = value;
  cacheMap.delete('settings_v1');
}
function orderRow(num) {
  const o = sheets.Orders; const h = o.data[0];
  const r = o.data.find((row, i) => i > 0 && row[0] === num);
  const obj = {}; h.forEach((k, i) => { obj[k] = r[i]; }); return obj;
}
function same(a, b, msg) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); }
let passed = 0;
function test(name, fn) { fn(); passed++; console.info('  ✓ ' + name); }

const STAFF = 'barista@school.org';
const TEACHER = 'jane.doe@school.org';
const OTHER_TEACHER = 'bob@school.org';
const OUTSIDER = 'someone@gmail.com';
const STUDENT = 'kid@students.school.org';
const order = (extra) => Object.assign({
  items: [{ id: 'LATTE', qty: 2 }, { id: 'MUFFIN', qty: 1 }], name: 'Jane Doe', delivery: true, room: '214', payment: 'Card'
}, extra || {});

/* ------------------------------------------------------------------ tests */

console.info('Running simulated flows…');

test('setup() creates sheets and is owner-only', () => {
  as(TEACHER);
  assert.throws(() => g.setup(), /owner/);
  as(ownerEmail);
  g.setup();
  ['Menu', 'Orders', 'Staff', 'Settings', 'Errors'].forEach(n => assert.ok(sheets[n], n));
  assert.strictEqual(sheets.Menu.getLastRow(), 21);           // 20 starting items + header
  g.setup(); // idempotent
  assert.strictEqual(sheets.Menu.getLastRow(), 21);
  same(sheets.Menu.data[0], ['ItemID', 'Name', 'Price', 'Available', 'Category', 'SortOrder', 'Icon', 'Tag']);
  assert.strictEqual(sheets.Settings.data.filter(r => r[0] === 'SHOP_NAME').length, 1);
  assert.strictEqual(orderSettings('ALLOWED_DOMAINS'), 'school.org');
  sheets.Staff.appendRow([STAFF, 'Barista', 'Staff']);
  cacheMap.delete('staff_v1');
  setSetting('ORDER_OPEN_TIME', '');   // make tests independent of the clock (see also next test)
  setSetting('ORDER_CLOSE_TIME', '');
  setSetting('ORDER_DAYS', '');
});
function orderSettings(k) { return sheets.Settings.data.find(r => r[0] === k)[1]; }

test('starting menu: drinks then snacks, prices, icons and tags', () => {
  as(TEACHER);
  const menu = ok(g.getCustomerBootstrap()).menu;
  assert.strictEqual(menu.length, 20);
  same(menu.filter(i => i.category === 'Drinks').map(i => i.name), ['Coca Cola', 'Diet Coke', 'Sprite', 'Diet Dr Pepper', 'Gatorade',
    'Hot Tea', 'Alani Nu', 'Poppi', 'Protein Shake', 'Hot Chocolate', 'Hot Coffee', 'Iced Coffee']);
  same(menu.filter(i => i.category === 'Snacks').map(i => i.name), ['Takis', 'Lays', 'Doritos', 'Spartan Special', 'Honey Bun',
    'Fudge Stripes', 'Muffins', 'Seasonal Treat']);
  const price = n => menu.find(i => i.name === n).price;
  same([price('Coca Cola'), price('Gatorade'), price('Alani Nu'), price('Iced Coffee'), price('Takis'), price('Honey Bun'), price('Seasonal Treat')], [1, 2, 3, 3, 1, 2, 2]);
  assert.ok(menu.every(i => i.icon));
  assert.strictEqual(menu.find(i => i.id === 'SPARTAN').tag, 'Special');
  // An order is priced from these values: 2 Coke + 1 Iced Coffee + 1 Takis = $6
  as(ownerEmail);
  setSetting('ORDER_OPEN_TIME', ''); setSetting('ORDER_CLOSE_TIME', ''); setSetting('ORDER_DAYS', '');
  as(TEACHER);
  const o = ok(g.submitOrder({ items: [{ id: 'COKE', qty: 2 }, { id: 'ICEDCOFFEE', qty: 1 }, { id: 'TAKIS', qty: 1 }], name: 'Jane', delivery: false, payment: 'Cash' }));
  assert.strictEqual(o.total, 6);
  // Reset: remove that order and load a fixed test menu so later checks use known prices.
  sheets.Orders.data.length = 1;
  props.set('LAST_ORDER_NUMBER', '0');
  mail.length = 0;
  sheets.Menu.data.length = 1;
  [['DRIP', 'Drip Coffee', 2.00, true, 'Coffee', 10, '', ''], ['AMER', 'Americano', 2.75, true, 'Coffee', 20, '', ''],
   ['LATTE', 'Latte', 3.50, true, 'Espresso', 30, '', ''], ['CAPP', 'Cappuccino', 3.50, true, 'Espresso', 40, '', ''],
   ['MOCHA', 'Mocha', 4.00, true, 'Espresso', 50, '', ''], ['CHAI', 'Chai Latte', 3.75, true, 'Tea', 60, '', ''],
   ['TEA', 'Hot Tea', 1.50, true, 'Tea', 70, '', ''], ['COCOA', 'Hot Chocolate', 2.50, true, 'Tea', 80, '', ''],
   ['ICED', 'Iced Coffee', 3.00, true, 'Cold', 90, '', ''], ['WATER', 'Water', 1.00, true, 'Cold', 100, '', ''],
   ['MUFFIN', 'Blueberry Muffin', 2.50, true, 'Snacks', 110, '', ''], ['BAGEL', 'Bagel', 2.75, true, 'Snacks', 120, '', '']
  ].forEach(r => sheets.Menu.appendRow(r));
  // Blank Icon cells fall back to a category icon.
  assert.ok(ok(g.getCustomerBootstrap()).menu.every(i => i.icon));
});

test('unauthorized users are rejected on every function', () => {
  as(OUTSIDER);
  fail(g.getCustomerBootstrap(), /does not have access/);
  fail(g.submitOrder(order()), /does not have access/);
  fail(g.getActiveOrders(''), /only for coffee shop staff/);
  as('');
  fail(g.getCustomerBootstrap(), /could not confirm/);
  as(TEACHER);
  fail(g.getActiveOrders(''), /only for coffee shop staff/);
  fail(g.completeOrder(1), /only for coffee shop staff/);
  fail(g.markItemsUnavailable(1, ['LATTE'], false), /only for coffee shop staff/);
  fail(g.getHistory({}), /only for coffee shop staff/);
  fail(g.setMenuItemAvailability('LATTE', false), /only for coffee shop staff/);
  assert.throws(() => g.archiveOldOrders({ triggerUid: 'fake' }), /owner/);
  const page = g.doGet({ parameter: { page: 'shop' } });
  assert.strictEqual(page.file, 'Message');
  as(OUTSIDER);
  assert.strictEqual(g.doGet({ parameter: {} }).file, 'Message');
  as(TEACHER);
  assert.strictEqual(g.doGet({ parameter: {} }).file, 'Customer');
  as(STAFF);
  assert.strictEqual(g.doGet({ parameter: { page: 'shop' } }).file, 'Shop');
});

let first;
test('order is priced on the server, ignoring browser prices', () => {
  as(TEACHER);
  const boot = ok(g.getCustomerBootstrap());
  assert.ok(boot.menu.length > 5);
  first = ok(g.submitOrder(order({ items: [{ id: 'LATTE', qty: 2, price: 0.01 }, { id: 'MUFFIN', qty: 1 }], requestId: 'req-aaaaaaaa' })));
  assert.strictEqual(first.orderNumber, 1);
  assert.strictEqual(first.total, 9.5);           // 2*3.50 + 2.50
  assert.strictEqual(first.room, '214');
  assert.strictEqual(mail.length, 1);
  assert.match(mail[0].subject, /Order #1 received/);
});

test('duplicate submission (same requestId) returns the same order', () => {
  const again = ok(g.submitOrder(order({ requestId: 'req-aaaaaaaa' })));
  assert.strictEqual(again.orderNumber, 1);
  assert.strictEqual(again.duplicate, true);
  assert.strictEqual(sheets.Orders.getLastRow(), 2);
  assert.strictEqual(mail.length, 1);
});

test('input validation', () => {
  fail(g.submitOrder(order({ items: [] })), /at least one item/);
  fail(g.submitOrder(order({ items: [{ id: 'LATTE', qty: 0 }] })), /whole numbers/);
  fail(g.submitOrder(order({ items: [{ id: 'LATTE', qty: 1.5 }] })), /whole numbers/);
  fail(g.submitOrder(order({ items: [{ id: 'LATTE', qty: 11 }] })), /whole numbers from 1 to 10/);
  fail(g.submitOrder(order({ items: [{ id: 'LATTE', qty: 6 }, { id: 'LATTE', qty: 6 }] })), /at most 10/);
  fail(g.submitOrder(order({ items: [{ id: 'NOPE', qty: 1 }] })), /no longer on the menu/);
  fail(g.submitOrder(order({ room: '' })), /room number/);
  fail(g.submitOrder(order({ room: '<script>' })), /valid room/);
  fail(g.submitOrder(order({ room: '12345' })), /valid room/);
  fail(g.submitOrder(order({ payment: 'Bitcoin' })), /cash or card/);
  fail(g.submitOrder(order({ delivery: 'yes' })), /delivery/);
  fail(g.submitOrder(order({ name: '   ' })), /name/);
  fail(g.submitOrder('garbage'), /at least one item/);
  const lib = ok(g.submitOrder(order({ room: 'library', name: '=HYPERLINK("x")', delivery: true })));
  assert.strictEqual(lib.room, 'LIBRARY');
  assert.strictEqual(orderRow(lib.orderNumber).CustomerName.charAt(0), "'");   // formula injection neutralised
  assert.strictEqual(lib.customerName, '=HYPERLINK("x")');
  ok(g.submitOrder(order({ delivery: false, room: 'ignored' })));
  fail(g.submitOrder(order()), /already have 3 order/);    // MAX_ACTIVE_ORDERS_PER_CUSTOMER
});

test('concurrent orders get unique, sequential numbers; numbers never reused', () => {
  as(OTHER_TEACHER);
  const nums = [];
  setSetting('MAX_ACTIVE_ORDERS_PER_CUSTOMER', 0);
  for (let i = 0; i < 5; i++) nums.push(ok(g.submitOrder(order({ name: 'Bob', delivery: false }))).orderNumber);
  same(nums, [4, 5, 6, 7, 8]);
  setSetting('MAX_ACTIVE_ORDERS_PER_CUSTOMER', 3);
});

test('dashboard lists active orders oldest first and polls cheaply', () => {
  as(STAFF);
  const b = ok(g.getShopBootstrap());
  assert.strictEqual(b.user.email, STAFF);
  assert.ok(ok(g.getMenuAdmin()).length === 12);
  const r = ok(g.getActiveOrders(''));
  assert.strictEqual(r.orders.length, 8);
  same(r.orders.map(o => o.orderNumber), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(r.orders.every(o => typeof o.timestamp === 'number'));
  const again = ok(g.getActiveOrders(r.version));
  assert.strictEqual(again.unchanged, true);
});

let token1;
test('item unavailable → Awaiting + email with secure links', () => {
  as(STAFF);
  const before = mail.length;
  fail(g.markItemsUnavailable(1, [], false), /at least one/);
  fail(g.markItemsUnavailable(1, ['BAGEL'], false), /not in order/);
  const r = ok(g.markItemsUnavailable(1, ['MUFFIN'], true));
  assert.strictEqual(r.status, 'Awaiting Customer Response');
  assert.strictEqual(r.warning, '');
  const row = orderRow(1);
  token1 = row.ResponseToken;
  assert.match(token1, /^[a-f0-9]{64}$/);
  const m = mail[before];
  assert.strictEqual(m.to, TEACHER);
  assert.match(m.htmlBody, /Blueberry Muffin is no longer available/);
  assert.ok(m.htmlBody.includes('choice=continue&amp;order=1&amp;token=' + token1));
  assert.ok(m.htmlBody.includes('choice=revise'));
  assert.match(m.htmlBody, /\$7\.00/);                                     // new total
  // also turned off on the menu
  as(TEACHER);
  assert.ok(!ok(g.getCustomerBootstrap()).menu.some(i => i.id === 'MUFFIN'));
  as(STAFF);
  fail(g.completeOrder(1), /Awaiting Customer Response/);                   // cannot complete while waiting
});

test('response links: wrong account, bad/old token, then continue, then reuse', () => {
  as(OTHER_TEACHER);
  fail(g.getResponseContext(1, token1), /different account/);
  fail(g.respondContinue(1, token1), /different account/);
  as(TEACHER);
  fail(g.getResponseContext(1, 'x'), /not valid/);
  fail(g.respondContinue(1, 'a'.repeat(64)), /out of date/);
  const ctx = ok(g.getResponseContext(1, token1));
  assert.strictEqual(ctx.newTotal, 7);
  same(ctx.unavailable.map(u => u.id), ['MUFFIN']);
  const res = ok(g.respondContinue(1, token1));
  assert.strictEqual(res.status, 'Pending');
  assert.strictEqual(res.total, 7);
  same(res.items.map(i => i.id), ['LATTE']);
  assert.strictEqual(orderRow(1).Total, 7);
  assert.strictEqual(orderRow(1).ResponseToken, '');
  fail(g.respondContinue(1, token1), /already been used/);                  // reused link
  fail(g.submitRevision(1, token1, order()), /already been used/);
});

test('expired links are rejected', () => {
  as(STAFF);
  ok(g.markItemsUnavailable(2, ['LATTE'], false));
  const row = orderRow(2);
  const r = sheets.Orders.data.findIndex(x => x[0] === 2);
  const col = sheets.Orders.data[0].indexOf('TokenExpiresAt');
  sheets.Orders.data[r][col] = new Date(Date.now() - 1000);
  as(TEACHER);
  fail(g.respondContinue(2, row.ResponseToken), /expired/);
});

test('re-flagging issues a new token and invalidates the old link', () => {
  as(STAFF);
  const oldTok = orderRow(2).ResponseToken;
  ok(g.markItemsUnavailable(2, ['LATTE'], false));
  const newTok = orderRow(2).ResponseToken;
  assert.notStrictEqual(oldTok, newTok);
  as(TEACHER);
  fail(g.respondContinue(2, oldTok), /out of date/);
});

test('revise flow: same order number, blocked item rejected, total recalculated', () => {
  as(TEACHER);
  const tok = orderRow(2).ResponseToken;
  fail(g.submitRevision(2, tok, order({ items: [{ id: 'LATTE', qty: 1 }] })), /not available/);
  const res = ok(g.submitRevision(2, tok, order({ items: [{ id: 'CAPP', qty: 2 }, { id: 'DRIP', qty: 1 }], delivery: false, payment: 'Cash' })));
  assert.strictEqual(res.orderNumber, 2);
  assert.strictEqual(res.total, 9);   // 2*3.50 + 2.00
  assert.strictEqual(res.status, 'Pending');
  assert.strictEqual(res.delivery, false);
  assert.strictEqual(sheets.Orders.data.filter(r => r[0] === 2).length, 1);
  fail(g.submitRevision(2, tok, order()), /already been used/);
});

test('all items unavailable + continue → order cancelled', () => {
  as(STAFF);
  ok(g.markItemsUnavailable(3, ['LATTE', 'MUFFIN'], false));
  as(TEACHER);
  const res = ok(g.respondContinue(3, orderRow(3).ResponseToken));
  assert.strictEqual(res.cancelled, true);
  assert.strictEqual(orderRow(3).Status, 'Cancelled');
});

test('staff: start, complete, cancel, reopen, continue-on-behalf', () => {
  as(STAFF);
  ok(g.startOrder(4));
  fail(g.startOrder(4), /In Progress/);
  ok(g.completeOrder(4));
  fail(g.completeOrder(4), /Completed/);                                    // double tap
  assert.strictEqual(Object.prototype.toString.call(orderRow(4).CompletedAt), '[object Date]');
  const before = mail.length;
  ok(g.cancelOrder(5, '  Out of <b>milk</b> '));
  assert.match(mail[before].htmlBody, /Out of bmilk\/b|Out of milk|Out of b/);
  assert.ok(!/<b>milk/.test(mail[before].htmlBody));
  ok(g.reopenOrder(4));
  assert.strictEqual(orderRow(4).Status, 'Pending');
  ok(g.markItemsUnavailable(6, ['MUFFIN'], false));
  const r = ok(g.staffContinueWithout(6));
  assert.strictEqual(r.status, 'Pending');
  assert.strictEqual(orderRow(6).Total, 7);
});

test('history: search by number, name, email, date; newest first; status timeline', () => {
  as(STAFF);
  ok(g.completeOrder(1));
  const all = ok(g.getHistory({}));
  same(all.orders.map(o => o.orderNumber), [5, 3, 1]);
  same(ok(g.getHistory({ text: '#3' })).orders.map(o => o.orderNumber), [3]);
  assert.strictEqual(ok(g.getHistory({ text: 'jane' })).orders.length, 2);
  assert.strictEqual(ok(g.getHistory({ text: 'bob@' })).orders.length, 1);
  const today = g.Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  assert.strictEqual(ok(g.getHistory({ date: today })).orders.length, 3);
  assert.strictEqual(ok(g.getHistory({ date: '2001-01-01' })).orders.length, 0);
  fail(g.getHistory({ date: 'yesterday' }), /valid date/);
  const h1 = all.orders.find(o => o.orderNumber === 1).history.map(e => e.s);
  same(h1, ['Pending', 'Awaiting Customer Response', 'Pending', 'Completed']);
});

test('shared domain: numeric accounts are students, name accounts are staff', () => {
  const NUM_STUDENT = '1111111@school.org';
  // Default settings: student ordering OFF, so numeric accounts are denied.
  as(NUM_STUDENT);
  fail(g.getCustomerBootstrap(), /does not have access/);
  fail(g.submitOrder(order()), /does not have access/);
  // Listing a student in the Staff sheet never grants the dashboard.
  sheets.Staff.appendRow([NUM_STUDENT, 'Helper', 'Staff']);
  cacheMap.delete('staff_v1');
  as(NUM_STUDENT);
  fail(g.getActiveOrders(''), /only for coffee shop staff/);
  assert.strictEqual(g.doGet({ parameter: { page: 'shop' } }).file, 'Message');
  // Teacher formats are staff.
  ['firstname.lastname@school.org', 'f.lastname@school.org', 'F.Lastname@school.org', 'flastname@school.org', 'jsmith2@school.org'].forEach(e => {
    as(e);
    assert.ok(ok(g.getCustomerBootstrap()).menu.length > 0, e);
    assert.strictEqual(vm.runInContext('getUserContext_().customerType', g), 'Staff', e);
  });
  ['123@school.org', '123456789@school.org', '1111111@school.org'].forEach(e => {
    as(e);
    assert.strictEqual(vm.runInContext('getUserContext_().customerType', g), 'Student', e);
  });
  as('12@school.org');   // fewer than 3 digits: not the student format
  assert.strictEqual(vm.runInContext('getUserContext_().customerType', g), 'Staff');
  // Enable students: numeric account orders as a Student with student rules.
  as(ownerEmail);
  setSetting('STUDENT_ORDERING_ENABLED', 'TRUE');
  as(NUM_STUDENT);
  const boot = ok(g.getCustomerBootstrap());
  assert.strictEqual(boot.rules.deliveryEnabled, false);
  assert.strictEqual(boot.user.isShopStaff, false);
  const s1 = ok(g.submitOrder(order({ name: 'Student', delivery: false, items: [{ id: 'LATTE', qty: 1 }] })));
  assert.strictEqual(orderRow(s1.orderNumber).CustomerType, 'Student');
  fail(g.getActiveOrders(''), /only for coffee shop staff/);
  // A broken pattern falls back to the safe default instead of making students staff.
  as(ownerEmail);
  setSetting('STUDENT_EMAIL_PATTERN', '([0-9');
  as(NUM_STUDENT);
  assert.strictEqual(vm.runInContext('getUserContext_().customerType', g), 'Student');
  as(ownerEmail);
  setSetting('STUDENT_EMAIL_PATTERN', '^[0-9]{3,9}');
  setSetting('STUDENT_ORDERING_ENABLED', 'FALSE');
  // cancel the student's order so later tests are unaffected
  as(STAFF);
  ok(g.cancelOrder(s1.orderNumber, 'test cleanup'));
});

test('students: blocked until enabled, never staff, student rules apply', () => {
  as(STUDENT);
  fail(g.getCustomerBootstrap(), /does not have access/);
  as(ownerEmail);
  setSetting('STUDENT_DOMAINS', 'students.school.org');
  setSetting('STUDENT_ORDERING_ENABLED', 'TRUE');
  sheets.Staff.appendRow([STUDENT, 'Student Helper', 'Staff']);
  cacheMap.delete('staff_v1');
  as(STUDENT);
  const boot = ok(g.getCustomerBootstrap());
  assert.strictEqual(boot.rules.deliveryEnabled, false);
  assert.strictEqual(boot.user.isShopStaff, false);
  fail(g.getActiveOrders(''), /only for coffee shop staff/);
  fail(g.submitOrder(order({ name: 'Kid', items: [{ id: 'LATTE', qty: 1 }] })), /Delivery is not available/);
  fail(g.submitOrder(order({ name: 'Kid', delivery: false, items: [{ id: 'LATTE', qty: 6 }] })), /limited to 5/);
  const s = ok(g.submitOrder(order({ name: 'Kid', delivery: false, items: [{ id: 'LATTE', qty: 1 }] })));
  assert.strictEqual(orderRow(s.orderNumber).CustomerType, 'Student');
  fail(g.submitOrder(order({ name: 'Kid', delivery: false, items: [{ id: 'LATTE', qty: 1 }] })), /already have 1/);
});

test('ordering window and master switch', () => {
  as(ownerEmail);
  setSetting('ORDERING_ENABLED', 'FALSE');
  as(TEACHER);
  const boot = ok(g.getCustomerBootstrap());
  assert.strictEqual(boot.orderingOpen, false);
  fail(g.submitOrder(order()), /not taking orders/);
  as(ownerEmail);
  setSetting('ORDERING_ENABLED', 'TRUE');
});

test('email quota exhausted: order still succeeds, staff warned', () => {
  mailQuota = 0;
  as(STAFF);
  const r = ok(g.markItemsUnavailable(7, ['MUFFIN'], false));
  assert.ok(r.warning.length > 0);
  assert.ok(sheets.Errors.getLastRow() > 1);
  mailQuota = 100;
});

test('staff menu toggle turns an item back on', () => {
  as(STAFF);
  ok(g.setMenuItemAvailability('MUFFIN', true));
  fail(g.setMenuItemAvailability('NOPE', true), /not found/);
  as(TEACHER);
  assert.ok(ok(g.getCustomerBootstrap()).menu.some(i => i.id === 'MUFFIN'));
});

test('archiving moves old closed orders; numbers keep increasing', () => {
  as(ownerEmail);
  const o = sheets.Orders;
  const col = o.data[0].indexOf('CompletedAt');
  const r = o.data.findIndex(x => x[0] === 1);
  o.data[r][col] = new Date(Date.now() - 90 * 86400000);
  const res = g.archiveOldOrders();
  assert.strictEqual(res.moved, 1);
  assert.strictEqual(sheets.Archive.getLastRow(), 2);
  assert.ok(!o.data.some((x, i) => i > 0 && x[0] === 1));
  as(OTHER_TEACHER);
  setSetting('MAX_ACTIVE_ORDERS_PER_CUSTOMER', 0);
  const lastIssued = Number(props.get('LAST_ORDER_NUMBER'));
  const n = ok(g.submitOrder(order({ name: 'Bob', delivery: false }))).orderNumber;
  assert.strictEqual(n, lastIssued + 1);   // keeps counting up; archived #1 is never reused
});

test('health check: flags real launch problems in plain language', () => {
  as(TEACHER);
  assert.throws(() => g.checkSetup(), /owner/);
  as(ownerEmail);
  let r = g.checkSetup();
  same(r.errors, []);
  assert.ok(r.warnings.some(w => /WEB_APP_URL is blank/.test(w)));
  assert.ok(r.warnings.some(w => /ADMIN_ALERT_EMAIL/.test(w)));
  assert.ok(r.warnings.some(w => /triggers are not installed/.test(w)));
  assert.ok(r.info.some(i => /menu item/.test(i)));
  setSetting('ORDER_CLOSE_TIME', '2:30pm');
  setSetting('ORDER_DAYS', 'Mon,Tues,Funday');
  setSetting('ALLOWED_DOMAINS', 'yourschool.org');
  setSetting('WEB_APP_URL', 'https://script.google.com/a/macros/school.org/s/ABC/dev');
  r = g.checkSetup();
  assert.ok(r.errors.some(e => /ORDER_CLOSE_TIME/.test(e)));
  assert.ok(r.errors.some(e => /"funday"/.test(e)));
  assert.ok(!r.errors.some(e => /"tues"/.test(e)));
  assert.ok(r.errors.some(e => /placeholder/.test(e)));
  assert.ok(r.errors.some(e => /ending in \/exec/.test(e)));
  setSetting('ORDER_CLOSE_TIME', ''); setSetting('ORDER_DAYS', ''); setSetting('ALLOWED_DOMAINS', 'school.org');
  setSetting('WEB_APP_URL', 'https://script.google.com/a/macros/school.org/s/ABC/exec');
  // setup() put warning-only protection on app-managed tabs
  assert.ok(sheets.Orders.protections.length === 1 && sheets.Orders.protections[0].warningOnly === true);
  g.setup();
  assert.strictEqual(sheets.Orders.protections.length, 1);   // not duplicated
});

test('admin alert email on unexpected errors, at most once per hour', () => {
  as(ownerEmail);
  setSetting('ADMIN_ALERT_EMAIL', 'it@school.org');
  cacheMap.delete('admin_alert_sent');
  const before = mail.length;
  vm.runInContext("logError_('testFn', new Error('boom 1')); logError_('testFn', new Error('boom 2'));", g);
  const alerts = mail.slice(before).filter(m => m.to === 'it@school.org');
  assert.strictEqual(alerts.length, 1);
  assert.match(alerts[0].subject, /app error in testFn/);
  assert.match(alerts[0].body, /boom 1/);
  setSetting('ADMIN_ALERT_EMAIL', '');
});

test('error log is trimmed by retention; archive tab recreated if emptied', () => {
  as(ownerEmail);
  const e = sheets.Errors;
  e.appendRow([new Date(Date.now() - 200 * 86400000), 'old', 'old error', 'x@school.org']);
  const oldCount = e.data.filter((r, i) => i > 0 && r[1] === 'old').length;
  assert.strictEqual(oldCount, 1);
  sheets.Archive.data.length = 0;                       // someone cleared the Archive tab
  const res = g.archiveOldOrders();
  assert.ok(res.errorsTrimmed >= 1);
  assert.ok(!e.data.some((r, i) => i > 0 && r[1] === 'old'));
  assert.strictEqual(sheets.Archive.data[0][0], 'OrderNumber');
});

test('a failing cache service never breaks ordering or the dashboard', () => {
  const real = g.CacheService.getScriptCache;
  g.CacheService.getScriptCache = () => ({
    get() { throw new Error('Service invoked too many times'); },
    put() { throw new Error('Service invoked too many times'); },
    removeAll() {}
  });
  try {
    as(OTHER_TEACHER);
    ok(g.getCustomerBootstrap());
    ok(g.submitOrder(order({ name: 'Bob', delivery: false, requestId: 'req-cachefail1' })));
    as(STAFF);
    ok(g.getActiveOrders(''));
  } finally {
    g.CacheService.getScriptCache = real;
  }
});

test('dashboard access: ONLY Staff-tab rows with Role Admin or Staff', () => {
  // Every server function that belongs to the shop dashboard.
  const STAFF_FUNCTIONS = {
    getShopBootstrap: [], getActiveOrders: [''], startOrder: [999], completeOrder: [999], cancelOrder: [999, 'x'],
    reopenOrder: [999], markItemsUnavailable: [999, ['LATTE'], false], staffContinueWithout: [999],
    getHistory: [{}], getMenuAdmin: [], setMenuItemAvailability: ['LATTE', true]
  };
  const cases = [
    // [email, Role cell, should have access]
    ['role.admin@school.org', 'Admin', true],
    ['role.staff@school.org', 'Staff', true],
    ['role.lower@school.org', ' staff ', true],       // case/spaces are forgiven
    ['role.upper@school.org', 'ADMIN', true],
    ['role.blank@school.org', '', false],
    ['role.teacher@school.org', 'Teacher', false],
    ['role.customer@school.org', 'Customer', false],
    ['role.typo@school.org', 'Staf', false],
    ['1234567@school.org', 'Admin', false]             // student account, even with Admin role
  ];
  as(ownerEmail);
  cases.forEach(c => sheets.Staff.appendRow([c[0], 'Test', c[1]]));
  cacheMap.delete('staff_v1');

  const notListed = 'not.listed@school.org';
  cases.concat([[notListed, null, false]]).forEach(([email, role, allowed]) => {
    as(email);
    const label = email + ' (Role "' + role + '")';
    // 1. The dashboard page itself
    assert.strictEqual(g.doGet({ parameter: { page: 'shop' } }).file, allowed ? 'Shop' : 'Message', label + ' page');
    // 2. The "Shop dashboard" link on the ordering page
    if (!/^\d/.test(email)) {
      assert.strictEqual(ok(g.getCustomerBootstrap()).user.isShopStaff, allowed, label + ' link');
    }
    // 3. Every staff server function (a non-staff user calling it from the browser console)
    Object.keys(STAFF_FUNCTIONS).forEach(fn => {
      as(email);
      const res = g[fn].apply(null, STAFF_FUNCTIONS[fn]);
      if (allowed) assert.ok(!(res.error || '').match(/only for coffee shop staff/), label + ' ' + fn + ' should be allowed');
      else assert.match(res.error || '', /only for coffee shop staff/, label + ' ' + fn + ' should be refused');
    });
  });
  // Put the menu item back (setMenuItemAvailability was called with true only)
  // The health check names the rows that grant no access.
  as(ownerEmail);
  const r = g.checkSetup();
  ['role.blank@', 'role.teacher@', 'role.customer@', 'role.typo@'].forEach(e =>
    assert.ok(r.warnings.some(w => w.indexOf(e) !== -1 && /NO access/.test(w)), 'health check should flag ' + e));
  assert.ok(!r.warnings.some(w => w.indexOf('role.admin@') !== -1));
  // Changing a role takes effect once the 60-second cache expires (or Clear settings cache).
  const row = sheets.Staff.data.findIndex(x => x[0] === 'role.staff@school.org');
  sheets.Staff.data[row][2] = '';
  cacheMap.delete('staff_v1');
  as('role.staff@school.org');
  assert.strictEqual(g.doGet({ parameter: { page: 'shop' } }).file, 'Message');
});

test('favicons: coffee cup for customers, clipboard for the dashboard, never breaks a page', () => {
  const CUP = 'https://fonts.gstatic.com/s/e/notoemoji/latest/2615/512.png';
  const CLIP = 'https://fonts.gstatic.com/s/e/notoemoji/latest/1f4cb/512.png';
  as(TEACHER);
  assert.strictEqual(g.doGet({ parameter: {} }).favicon, CUP);
  assert.strictEqual(g.doGet({ parameter: { page: 'shop' } }).file, 'Message');
  assert.strictEqual(g.doGet({ parameter: { page: 'shop' } }).favicon, CUP);   // access-denied page
  as(STAFF);
  assert.strictEqual(g.doGet({ parameter: { page: 'shop' } }).favicon, CLIP);
  // Custom icon, shop falls back to it when SHOP_FAVICON_URL is blank
  as(ownerEmail);
  setSetting('FAVICON_URL', 'https://example.org/spartans.png');
  setSetting('SHOP_FAVICON_URL', '');
  as(STAFF);
  assert.strictEqual(g.doGet({ parameter: { page: 'shop' } }).favicon, 'https://example.org/spartans.png');
  // Invalid values are ignored (no favicon call) and flagged by the health check
  as(ownerEmail);
  setSetting('FAVICON_URL', 'http://insecure.example/x.png');
  setSetting('SHOP_FAVICON_URL', 'javascript:alert(1)');
  as(STAFF);
  const page = g.doGet({ parameter: { page: 'shop' } });
  assert.strictEqual(page.file, 'Shop');
  assert.strictEqual(page.favicon, null);
  as(ownerEmail);
  const r = g.checkSetup();
  assert.ok(r.warnings.some(w => /FAVICON_URL must be a link starting with https/.test(w)));
  assert.ok(r.warnings.some(w => /SHOP_FAVICON_URL must be a link/.test(w)));
  // If Google rejects the icon, the page still loads
  setSetting('FAVICON_URL', CUP);
  setSetting('SHOP_FAVICON_URL', CLIP);
  g.__faviconThrows = true;
  as(TEACHER);
  const p2 = g.doGet({ parameter: {} });
  assert.strictEqual(p2.file, 'Customer');
  g.__faviconThrows = false;
  // setup() adds the new settings rows to an existing Settings tab without touching others
  as(ownerEmail);
  sheets.Settings.data = sheets.Settings.data.filter(row => row[0] !== 'FAVICON_URL' && row[0] !== 'SHOP_FAVICON_URL');
  g.setup();
  assert.strictEqual(sheets.Settings.data.filter(row => row[0] === 'FAVICON_URL').length, 1);
  assert.strictEqual(sheets.Settings.data.find(row => row[0] === 'SHOP_FAVICON_URL')[1], CLIP);
});

test('Orders sheet grows past its row limit without errors', () => {
  sheets.Orders.maxRows = sheets.Orders.getLastRow();
  as(OTHER_TEACHER);
  ok(g.submitOrder(order({ name: 'Bob', delivery: false })));
});

same(g.__errors.filter(e => !/quota|STUDENT_EMAIL_PATTERN|\[testFn\]/i.test(e)), [], 'unexpected server errors');
console.info('\nAll ' + passed + ' simulated test groups passed.');
