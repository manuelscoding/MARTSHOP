/**
 * cookie-cart/tests/simulate.js — OPTIONAL developer check. Not needed to run the app.
 *
 * Runs the Cookie Cart server code (cookie-cart/src/*.gs) in Node.js against
 * in-memory fakes of the Apps Script services (Sheets, Mail, Cache, Lock...)
 * with a controllable clock, then exercises the flows from
 * docs/TEST_CHECKLIST.md. Usage:   node cookie-cart/tests/simulate.js
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
    getName: () => sheet.name,
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
    copyTo() {
      const copy = makeSheet(sheet.name + ' copy'); copy.data = sheet.data.map(r => r.slice());
      copy.setName = (n) => { delete sheets[copy.name]; copy.name = n; sheets[n] = copy; return copy; };
      sheets[copy.name] = copy; return copy;
    },
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
            line.forEach((v, c) => { target[col - 1 + c] = v instanceof Date ? new Date(v.getTime()) : v; });
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

const sheets = {};
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = makeSheet(n)),
  getId: () => 'SSID',
  getUrl: () => 'https://docs.google.com/spreadsheets/d/SSID'
};

const TZ = 'America/New_York';
let activeEmail = 'owner@school.org';
const ownerEmail = 'owner@school.org';
const mail = [];
const cacheMap = new Map();
const props = new Map();
let mailQuota = 100;
let lockFree = true;

function formatDate(d, tz, pattern) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', weekday: 'long', timeZoneName: 'longOffset' }).formatToParts(d).forEach(p => { parts[p.type] = p.value; });
  const h24 = Number(parts.hour);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const off = (parts.timeZoneName.replace('GMT', '') || '+00:00').replace(':', '');
  const map = {
    yyyy: parts.year, MMM: months[Number(parts.month) - 1], MM: parts.month, dd: parts.day, d: String(Number(parts.day)),
    EEEE: parts.weekday, EEE: parts.weekday.slice(0, 3), HH: parts.hour, h: String(h24 % 12 || 12), mm: parts.minute,
    a: h24 < 12 ? 'AM' : 'PM', Z: off
  };
  return pattern.replace(/yyyy|EEEE|EEE|MMM|MM|dd|HH|mm|d|h|a|Z/g, t => map[t]);
}

const g = {
  console: { log() {}, warn() {}, error: (...a) => g.__errors.push(a.join(' ')) },
  __errors: [],
  __triggers: [],
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ss, openById: () => ss, flush() {},
    getUi() { if (!g.__ui) throw new Error('no ui'); return g.__ui; },
    ProtectionType: { SHEET: 'SHEET' },
    newDataValidation() { const b = { requireCheckbox: () => b, requireValueInList: () => b, setAllowInvalid: () => b, setHelpText: () => b, build: () => ({}) }; return b; }
  },
  Session: {
    getActiveUser: () => ({ getEmail: () => activeEmail }),
    getEffectiveUser: () => ({ getEmail: () => ownerEmail }),
    getScriptTimeZone: () => TZ
  },
  CacheService: { getScriptCache: () => ({
    get: k => (cacheMap.has(k) ? cacheMap.get(k) : null), put: (k, v) => cacheMap.set(k, v),
    removeAll: ks => ks.forEach(k => cacheMap.delete(k)), remove: k => cacheMap.delete(k)
  }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v))
  }) },
  LockService: { getScriptLock: () => ({ tryLock: () => lockFree, releaseLock() {} }) },
  MailApp: {
    getRemainingDailyQuota: () => mailQuota,
    sendEmail: m => { mailQuota--; mail.push(m); }
  },
  ScriptApp: {
    getService: () => ({ getUrl: () => 'https://script.google.com/a/macros/school.org/s/ABC/exec' }),
    getProjectTriggers: () => g.__triggers,
    deleteTrigger: t => { g.__triggers = g.__triggers.filter(x => x !== t); },
    newTrigger(fn) {
      const b = { timeBased: () => b, everyDays: () => b, atHour: () => b,
        create: () => { const id = 'uid-' + fn; g.__triggers.push({ getHandlerFunction: () => fn, getUniqueId: () => id }); } };
      return b;
    },
    AuthMode: { FULL: { toString: () => 'FULL' } }
  },
  HtmlService: {
    createTemplateFromFile: f => { const t = { evaluate: () => ({ file: f, t, setTitle() { return this; }, addMetaTag() { return this; } }) }; return t; },
    createHtmlOutputFromFile: () => ({ getContent: () => '' })
  },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    base64EncodeWebSafe: s => Buffer.from(s).toString('base64url'),
    formatDate
  }
};
vm.createContext(g);
const srcDir = path.join(__dirname, '..', 'src');
fs.readdirSync(srcDir).filter(f => f.endsWith('.gs')).forEach(f => {
  vm.runInContext(fs.readFileSync(path.join(srcDir, f), 'utf8'), g, { filename: f });
});
// Controllable clock: the app reads time only through now_().
vm.runInContext('var __nowMs = 0; now_ = function () { return new Date(__nowMs || Date.now()); };', g);
function setNow(iso) { g.__nowMs = new Date(iso).getTime(); }

/* ---------------------------------------------------------------- helpers */

let keepRateLimits = false;
function as(email) {
  activeEmail = email;
  // per-execution memos reset between "requests", like real Apps Script
  vm.runInContext('ctxMemo_ = null; settingsMemo_ = null; staffMemo_ = null; productsMemo_ = null;', g);
  if (!keepRateLimits) for (const k of [...cacheMap.keys()]) if (k.startsWith('rl_')) cacheMap.delete(k);
}
function ok(res) { assert.ok(res && res.ok, 'expected ok, got ' + JSON.stringify(res)); return res.data; }
function fail(res, re) {
  if (!keepRateLimits) for (const k of [...cacheMap.keys()]) if (k.startsWith('rl_')) cacheMap.delete(k);
  assert.ok(res && !res.ok, 'expected failure, got ' + JSON.stringify(res && res.data ? { ok: res.ok } : res));
  if (re) assert.ok(re.test(res.error), 'error "' + res.error + '" does not match ' + re);
  return res.error;
}
function settingRow(key) { return sheets.Settings.data.findIndex(r => r && r[0] === key); }
function setSetting(key, value) {
  sheets.Settings.data[settingRow(key)][1] = value;
  cacheMap.delete('settings_v1');
}
function setProduct(id, header, value) {
  const s = sheets.Products; const col = s.data[0].indexOf(header);
  const row = s.data.find((r, i) => i > 0 && r[0] === id);
  row[col] = value;
  cacheMap.delete('products_v1');
}
function addProduct(obj) {
  const s = sheets.Products;
  s.data.push(s.data[0].map(h => (h in obj ? obj[h] : '')));
  cacheMap.delete('products_v1');
}
function orderRow(num) {
  const o = sheets.Orders; const h = o.data[0];
  const r = o.data.find((row, i) => i > 0 && row[0] === num);
  const obj = {}; h.forEach((k, i) => { obj[k] = r[i]; }); return obj;
}
function historyFor(num) {
  const s = sheets.OrderHistory; return s.data.filter((r, i) => i > 0 && r[0] === num).map(r => r[3]);
}
function tokenFrom(m) { const x = /token=([a-f0-9]+)/.exec(m.htmlBody); return x ? x[1] : ''; }
function lastMailTo(to) { for (let i = mail.length - 1; i >= 0; i--) if (mail[i].to.split(',').indexOf(to) !== -1) return mail[i]; return null; }
function dash() { as(STAFF); return ok(g.getDashboard('')); }
function staffOrder(num) { return dash().orders.find(o => o.orderNumber === num); }
/** Deep equality across the vm realm boundary. */
function same(a, b, msg) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); }
let passed = 0;
function test(name, fn) {
  try { fn(); } catch (e) { console.error('  ✗ ' + name); throw e; }
  passed++; console.info('  ✓ ' + name);
}

const STAFF = 'cookies@school.org';
const ADMIN = ownerEmail;
const TEACHER = 'jane.doe@school.org';
const OTHER_TEACHER = 'bob.smith@school.org';
const OUTSIDER = 'someone@gmail.com';
const STUDENT = '1234567@school.org';
const WED_9AM = '2026-10-21T09:00:00-04:00';   // a Wednesday, inside 07:00-10:30
let rid = 0;
const order = (extra) => Object.assign({
  items: [{ productId: 'CHOC_CHIP', quantity: 24 }], name: 'Jane Doe', room: '214', classOrNote: 'Period 2',
  payment: 'Cash', requestId: 'req-' + (++rid) + '-abcdef'
}, extra || {});
const editPayload = (o, items, extra) => Object.assign({
  items, name: o.customerName, room: o.room, classOrNote: o.classOrNote, instructions: o.instructions,
  deliveryWindow: o.deliveryWindow, allergy: o.allergy, payment: o.payment
}, extra || {});

/* ------------------------------------------------------------------ tests */

console.info('Running Cookie Cart simulated flows…');
setNow(WED_9AM);

test('setup() is owner-only, creates every tab, adds the owner as Admin, and is safe to re-run', () => {
  as(TEACHER);
  assert.throws(() => g.setup(), /owner/i);
  as(ownerEmail);
  g.setup();
  ['Products', 'Orders', 'OrderHistory', 'Staff', 'Settings', 'Errors'].forEach(n => assert.ok(sheets[n], n + ' missing'));
  same(sheets.Orders.data[0].slice(0, 17), ['OrderNumber', 'CreatedAt', 'CustomerEmail', 'CustomerName', 'RoomNumber', 'ClassOrNote', 'ItemsJSON',
    'Total', 'PaymentMethod', 'Status', 'Version', 'LastUpdatedAt', 'DispatchedAt', 'DispatchedVersion', 'DeliveredAt', 'EditToken', 'SpecialInstructions']);
  same(sheets.Staff.data[1], [ownerEmail, 'Cookie Cart Owner', 'Admin']);
  assert.strictEqual(sheets.Settings.data[settingRow('ALLOWED_DOMAINS')][1], 'school.org');
  const rows = sheets.Settings.data.length;
  g.setup();
  assert.strictEqual(sheets.Settings.data.length, rows, 're-running setup duplicated settings');
  assert.strictEqual(sheets.Products.data.length, 3, 'sample products added twice');
  sheets.Staff.data.push([STAFF, 'Cookie Crew', 'Staff']);
  cacheMap.delete('staff_v1');
});

test('one cookie available → single-product bootstrap with server prices and remembered details', () => {
  as(TEACHER);
  const b = ok(g.getCustomerBootstrap());
  assert.strictEqual(b.products.length, 1);
  assert.strictEqual(b.products[0].id, 'CHOC_CHIP');
  assert.strictEqual(b.products[0].price, 1);
  assert.strictEqual(b.ordering.open, true);
  assert.strictEqual(b.user.suggestedName, 'Jane Doe');
  assert.strictEqual(b.lastRoom, '');
  assert.strictEqual(b.user.isStaff, false);
});

test('unauthorized access is rejected by every server function', () => {
  as(OUTSIDER);
  const tok = 'a'.repeat(64);
  [() => g.getCustomerBootstrap(), () => g.submitOrder(order()), () => g.getMyOrders(), () => g.getOrderForEdit(1, tok),
    () => g.editOrder(1, tok, 1, order()), () => g.cancelMyOrder(1, tok)].forEach(fn => fail(fn(), /does not have access/));
  [OUTSIDER, TEACHER, STUDENT].forEach(who => {
    as(who);
    [() => g.getDashboard(''), () => g.getDashboardBootstrap(), () => g.staffUpdateStatus(1, 'dispatch'), () => g.acknowledgeChange(1),
      () => g.getHistory({}), () => g.getOrderLog(1), () => g.getDaySummary(''), () => g.setOrderingEnabled(false),
      () => g.setProductAvailable('CHOC_CHIP', false), () => g.setProductDailyLimit('CHOC_CHIP', 5)].forEach(fn => fail(fn(), /only for Cookie Cart staff|does not have access|sign in/));
  });
  as(TEACHER);
  ['setup', 'checkSetup', 'clearCache', 'installTriggers', 'showLinks', 'resetForLaunch'].forEach(fn => assert.throws(() => g[fn](), /owner/i, fn));
  // A browser cannot forge a trigger event.
  assert.throws(() => g.sendDailySummary({ triggerUid: 'uid-sendDailySummary', authMode: 'FULL' }), /owner/i);
  assert.throws(() => g.nightlyMaintenance({ triggerUid: 'x', authMode: { toString: () => 'FULL' } }), /owner/i);
  // Pages
  assert.strictEqual(g.doGet({ parameter: { page: 'dashboard' } }).file, 'Message');
  as(OUTSIDER);
  assert.strictEqual(g.doGet({ parameter: {} }).file, 'Message');
  as(STAFF);
  assert.strictEqual(g.doGet({ parameter: { page: 'dashboard' } }).file, 'Dashboard');
  assert.throws(() => g.include('Code'), /Unknown partial/);
});

let first;
test('order is priced on the server; room normalised; confirmation email has Edit and Cancel links', () => {
  as(TEACHER);
  mail.length = 0;
  first = ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 24, unitPrice: 0.01 }], room: ' b12 ' })));
  assert.strictEqual(first.orderNumber, 1);
  assert.strictEqual(first.total, 24);
  assert.strictEqual(first.room, 'B12');
  assert.strictEqual(first.status, 'Received');
  assert.strictEqual(first.emailSent, true);
  const row = orderRow(1);
  assert.strictEqual(row.Version, 1);
  assert.strictEqual(row.CustomerType, 'Staff');
  assert.match(row.EditToken, /^[a-f0-9]{64}$/);
  same(JSON.parse(row.ItemsJSON), [{ productId: 'CHOC_CHIP', name: 'Chocolate Chip Cookie', unitPrice: 1, quantity: 24 }]);
  const m = lastMailTo(TEACHER);
  assert.ok(m && /#1/.test(m.subject));
  assert.ok(m.htmlBody.indexOf('page=edit&amp;order=1&amp;token=' + row.EditToken) !== -1 || m.htmlBody.indexOf('page=edit&order=1&token=' + row.EditToken) !== -1, 'edit link');
  assert.ok(/page=cancel/.test(m.htmlBody), 'cancel link');
  same(historyFor(1), ['Created']);
  // next visit remembers the room
  as(TEACHER);
  assert.strictEqual(ok(g.getCustomerBootstrap()).lastRoom, 'B12');
});

test('duplicate submission (same requestId) returns the same order and saves one row', () => {
  as(TEACHER);
  const p = order({ items: [{ productId: 'CHOC_CHIP', quantity: 2 }] });
  const a = ok(g.submitOrder(p));
  const before = sheets.Orders.getLastRow();
  as(TEACHER);
  const b = ok(g.submitOrder(p));
  assert.strictEqual(b.orderNumber, a.orderNumber);
  assert.strictEqual(b.duplicate, true);
  assert.strictEqual(sheets.Orders.getLastRow(), before);
  // the same requestId from a different account is a different order
  as(OTHER_TEACHER);
  assert.notStrictEqual(ok(g.submitOrder(Object.assign({}, p, { name: 'Bob' }))).orderNumber, a.orderNumber);
});

test('concurrent orders get unique, sequential numbers; busy lock fails cleanly', () => {
  const nums = [];
  for (let i = 0; i < 12; i++) { as(i % 2 ? TEACHER : OTHER_TEACHER); nums.push(ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 1 }] }))).orderNumber); }
  assert.strictEqual(new Set(nums).size, 12);
  nums.forEach((n, i) => { if (i) assert.strictEqual(n, nums[i - 1] + 1); });
  lockFree = false;
  as(TEACHER);
  fail(g.submitOrder(order()), /busy/);
  lockFree = true;
  // numbers are never reused even if rows are deleted by hand
  const last = nums[nums.length - 1];
  sheets.Orders.data.splice(sheets.Orders.data.length - 1, 1);
  as(TEACHER);
  assert.strictEqual(ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 1 }] }))).orderNumber, last + 1);
});

test('input validation: room, name, payment, windows, quantities, unknown/sold-out cookies', () => {
  as(TEACHER);
  fail(g.submitOrder(order({ room: '' })), /room number/);
  fail(g.submitOrder(order({ room: '214; DROP' })), /valid room/);
  fail(g.submitOrder(order({ room: 'ROOFTOP' })), /valid room/);
  ok(g.submitOrder(order({ room: 'library', items: [{ productId: 'CHOC_CHIP', quantity: 1 }] })));
  fail(g.submitOrder(order({ name: '   ' })), /your name/);
  fail(g.submitOrder(order({ payment: 'Bitcoin' })), /how you will pay/);
  fail(g.submitOrder(order({ payment: 'Account', accountName: 'Science' })), /how you will pay/);
  fail(g.submitOrder(order({ deliveryWindow: 'Midnight' })), /delivery windows/);
  fail(g.submitOrder(order({ items: [] })), /at least one/);
  fail(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 0 }] })), /at least one/);
  fail(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 2.5 }] })), /whole numbers/);
  fail(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: -1 }] })), /whole numbers/);
  fail(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 61 }] })), /whole numbers from 0 to 60/);
  fail(g.submitOrder(order({ items: [{ productId: 'NOPE', quantity: 1 }] })), /no longer offered/);
  fail(g.submitOrder(order({ items: [{ productId: 'constructor', quantity: 1 }] })), /no longer offered/);
  fail(g.submitOrder(order({ items: [{ productId: 'SUGAR', quantity: 1 }] })), /sold out right now/);
  fail(g.submitOrder(null), /your name/);
  // Account charge when enabled
  setSetting('ALLOW_ACCOUNT_CHARGE', 'TRUE');
  as(TEACHER);
  fail(g.submitOrder(order({ payment: 'Account', accountName: '' })), /department or account/);
  const acct = ok(g.submitOrder(order({ payment: 'Account', accountName: 'Science Dept', items: [{ productId: 'CHOC_CHIP', quantity: 1 }], deliveryWindow: 'Morning (by 10:00)' })));
  assert.strictEqual(acct.payment, 'Account: Science Dept');
  assert.strictEqual(acct.deliveryWindow, 'Morning (by 10:00)');
  setSetting('ALLOW_ACCOUNT_CHARGE', 'FALSE');
});

test('spreadsheet formula injection is neutralised but shown unchanged', () => {
  as(TEACHER);
  const o = ok(g.submitOrder(order({ name: '=HYPERLINK("http://x","y")', instructions: '+cmd', items: [{ productId: 'CHOC_CHIP', quantity: 1 }] })));
  const row = orderRow(o.orderNumber);
  assert.ok(String(row.CustomerName).startsWith("'="));
  assert.ok(String(row.SpecialInstructions).startsWith("'+"));
  assert.strictEqual(staffOrder(o.orderNumber).customerName, '=HYPERLINK("http://x","y")');
});

test('editing via the email link: owner + token required, total recalculated, version++, history, old-vs-new email', () => {
  const tok = orderRow(1).EditToken;
  as(OTHER_TEACHER);
  fail(g.getOrderForEdit(1, tok), /different account/);
  fail(g.getOrderForEdit(1, ''), /not valid/);
  fail(g.getOrderForEdit(99999, tok), /not valid/);       // same message: no order-existence leak
  as(TEACHER);
  fail(g.getOrderForEdit(1, 'b'.repeat(64)), /not valid/);
  fail(g.getOrderForEdit(1, 'not-hex'), /not valid/);
  const o = ok(g.getOrderForEdit(1, tok));
  assert.strictEqual(o.version, 1);
  same(o.rules, { canEdit: true, canIncrease: true, canDecrease: true, canCancel: true, message: '' });
  mail.length = 0;
  as(TEACHER);
  const e = ok(g.editOrder(1, tok, 1, editPayload(o, [{ productId: 'CHOC_CHIP', quantity: 30 }], { instructions: 'Leave on desk' })));
  assert.strictEqual(e.total, 30);
  assert.strictEqual(e.version, 2);
  assert.strictEqual(orderRow(1).Version, 2);
  const log = historyFor(1);
  assert.strictEqual(log[1], 'Edited (v2): Chocolate Chip Cookie 24 → 30; changed instructions');
  const m = lastMailTo(TEACHER);
  assert.ok(/updated/i.test(m.subject), m.subject);
  assert.ok(/Was 24 -> Now 30/.test(m.body), m.body);
  assert.ok(/\$24\.00 -> \$30\.00/.test(m.body), 'old/new total');
  // Stale tab: someone edits with the old version number
  as(TEACHER);
  fail(g.editOrder(1, tok, 1, editPayload(o, [{ productId: 'CHOC_CHIP', quantity: 10 }])), /changed since you opened/);
  as(TEACHER);
  fail(g.editOrder(1, tok, 2, editPayload(e, [{ productId: 'CHOC_CHIP', quantity: 30 }])), /didn't change anything/);
  // Dashboard shows a quiet Edited badge (not the dispatch alert)
  const so = staffOrder(1);
  assert.strictEqual(so.edited, true);
  assert.strictEqual(so.afterDispatch, false);
  // From My Orders (signed in, no token) also works
  as(TEACHER);
  assert.ok(ok(g.getMyOrders()).some(x => x.orderNumber === 1 && x.rules.canEdit));
  as(TEACHER);
  ok(g.getOrderForEdit(1, ''));
});

let disp;
test('edit after dispatch: big alert with exact diff, staff email, acknowledge, new baseline, room change', () => {
  setSetting('STAFF_NOTIFY_EMAILS', 'lead@school.org');
  as(TEACHER);
  disp = ok(g.submitOrder(order({ room: '214' })));                 // 24 cookies
  const tok = orderRow(disp.orderNumber).EditToken;
  as(STAFF);
  ok(g.staffUpdateStatus(disp.orderNumber, 'prepare'));
  as(STAFF);
  ok(g.staffUpdateStatus(disp.orderNumber, 'dispatch'));
  let so = staffOrder(disp.orderNumber);
  assert.strictEqual(so.status, 'Out for Delivery');
  assert.strictEqual(so.afterDispatch, false);
  // Teacher may only ADD now.
  as(TEACHER);
  const o = ok(g.getOrderForEdit(disp.orderNumber, tok));
  assert.strictEqual(o.rules.canIncrease, true);
  assert.strictEqual(o.rules.canDecrease, false);
  assert.strictEqual(o.rules.canCancel, false);
  as(TEACHER);
  fail(g.editOrder(disp.orderNumber, tok, o.version, editPayload(o, [{ productId: 'CHOC_CHIP', quantity: 20 }])), /can no longer be reduced/);
  as(TEACHER);
  fail(g.cancelMyOrder(disp.orderNumber, tok), /can no longer be reduced or cancelled/);
  mail.length = 0;
  as(TEACHER);
  const e = ok(g.editOrder(disp.orderNumber, tok, o.version, editPayload(o, [{ productId: 'CHOC_CHIP', quantity: 30 }])));
  assert.strictEqual(e.total, 30);
  so = staffOrder(disp.orderNumber);
  assert.strictEqual(so.afterDispatch, true);
  assert.strictEqual(so.edited, false);
  same(so.changes.map(c => [c.name, c.old, c.now, c.diff]), [['Chocolate Chip Cookie', 24, 30, 6]]);
  assert.strictEqual(so.roomChange, null);
  assert.match(historyFor(disp.orderNumber).pop(), /^Edited after dispatch \(v\d\): Chocolate Chip Cookie 24 → 30$/);
  const alert = lastMailTo('lead@school.org');
  assert.ok(alert && /was 24 → now 30 \(\+6\)/.test(alert.body), 'staff alert email');
  assert.ok(lastMailTo(TEACHER), 'teacher update email');
  // Polling picks it up: version marker changed
  as(STAFF);
  const v1 = ok(g.getDashboard('')).version;
  as(STAFF);
  assert.strictEqual(ok(g.getDashboard(v1)).unchanged, true);
  // Acknowledge clears the alert and is logged with the staff name
  as(STAFF);
  ok(g.acknowledgeChange(disp.orderNumber));
  assert.notStrictEqual(ok(g.getDashboard(v1)).unchanged, true);
  so = staffOrder(disp.orderNumber);
  assert.strictEqual(so.afterDispatch, false);
  assert.strictEqual(so.edited, true);
  assert.match(historyFor(disp.orderNumber).pop(), /^Acknowledged change \(v2\)$/);
  assert.strictEqual(sheets.OrderHistory.data.filter(r => r[3] === 'Acknowledged change (v2)')[0][2], 'Cookie Crew');
  // A later change is measured from the acknowledged contents, and room changes show.
  as(TEACHER);
  const o2 = ok(g.getOrderForEdit(disp.orderNumber, tok));
  as(TEACHER);
  ok(g.editOrder(disp.orderNumber, tok, o2.version, editPayload(o2, [{ productId: 'CHOC_CHIP', quantity: 32 }], { room: '215' })));
  so = staffOrder(disp.orderNumber);
  same(so.changes.map(c => [c.old, c.now, c.diff]), [[30, 32, 2]]);
  same(so.roomChange, { old: '214', now: '215' });
  // Prep summary counts it as out for delivery
  const prep = dash().prep.find(p => p.productId === 'CHOC_CHIP');
  assert.ok(prep.out >= 32);
});

test('blocked edits: delivered/cancelled orders and their links stop working', () => {
  const tok = orderRow(disp.orderNumber).EditToken;
  as(STAFF);
  fail(g.staffUpdateStatus(disp.orderNumber, 'prepare'), /now "Out for Delivery"/);
  as(STAFF);
  fail(g.staffUpdateStatus(disp.orderNumber, 'hasOwnProperty'), /went wrong/);
  as(STAFF);
  ok(g.staffUpdateStatus(disp.orderNumber, 'deliver'));
  assert.strictEqual(orderRow(disp.orderNumber).EditToken, '');
  assert.ok(typeof orderRow(disp.orderNumber).DeliveredAt.getTime === 'function');
  as(TEACHER);
  fail(g.getOrderForEdit(disp.orderNumber, tok), /already delivered/);
  as(TEACHER);
  fail(g.getOrderForEdit(disp.orderNumber, ''), /already delivered/);
  // EDITS_ALLOWED_UNTIL = Preparing blocks edits once preparing starts
  setSetting('EDITS_ALLOWED_UNTIL', 'Preparing');
  as(TEACHER);
  const o = ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 2 }] })));
  as(STAFF);
  ok(g.staffUpdateStatus(o.orderNumber, 'prepare'));
  as(TEACHER);
  fail(g.getOrderForEdit(o.orderNumber, ''), /already preparing, so it can no longer be changed/);
  setSetting('EDITS_ALLOWED_UNTIL', 'Delivered');
  // Teacher cancels a Received order; staff cancel sends the reason
  as(TEACHER);
  const c = ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 2 }] })));
  const ctok = orderRow(c.orderNumber).EditToken;
  as(TEACHER);
  assert.strictEqual(ok(g.cancelMyOrder(c.orderNumber, ctok)).status, 'Cancelled');
  as(TEACHER);
  fail(g.cancelMyOrder(c.orderNumber, ctok), /already cancelled/);
  mail.length = 0;
  as(STAFF);
  ok(g.staffUpdateStatus(o.orderNumber, 'cancel', 'Oven broke'));
  assert.ok(/Oven broke/.test(lastMailTo(TEACHER).body));
  assert.match(historyFor(o.orderNumber).pop(), /^Status: Cancelled \(Oven broke\)$/);
});

test('cutoff and opening times, closed days, and the staff open/close switch', () => {
  as(TEACHER);
  const o = ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 10 }] })));
  const tok = orderRow(o.orderNumber).EditToken;
  setNow('2026-10-21T10:45:00-04:00');
  as(TEACHER);
  const b = ok(g.getCustomerBootstrap());
  assert.strictEqual(b.ordering.open, false);
  assert.strictEqual(b.ordering.message, "Today's ordering closed at 10:30 AM. It reopens Thursday at 7:00 AM.");
  as(TEACHER);
  fail(g.submitOrder(order()), /closed at 10:30 AM/);
  // After cutoff: can reduce or cancel, cannot add
  as(TEACHER);
  const e = ok(g.getOrderForEdit(o.orderNumber, tok));
  assert.strictEqual(e.rules.canIncrease, false);
  assert.strictEqual(e.rules.canDecrease, true);
  assert.ok(/past today's ordering cutoff \(10:30 AM\)/.test(e.rules.message));
  as(TEACHER);
  fail(g.editOrder(o.orderNumber, tok, 1, editPayload(e, [{ productId: 'CHOC_CHIP', quantity: 11 }])), /cutoff/);
  as(TEACHER);
  assert.strictEqual(ok(g.editOrder(o.orderNumber, tok, 1, editPayload(e, [{ productId: 'CHOC_CHIP', quantity: 8 }]))).total, 8);
  setSetting('ALLOW_INCREASE_AFTER_CUTOFF', 'TRUE');
  as(TEACHER);
  ok(g.editOrder(o.orderNumber, tok, 2, editPayload(e, [{ productId: 'CHOC_CHIP', quantity: 12 }])));
  setSetting('ALLOW_INCREASE_AFTER_CUTOFF', 'FALSE');
  // Before opening
  setNow('2026-10-21T06:30:00-04:00');
  as(TEACHER);
  assert.strictEqual(ok(g.getCustomerBootstrap()).ordering.message, 'Ordering opens at 7:00 AM today.');
  // Weekend
  setNow('2026-10-24T09:00:00-04:00');
  as(TEACHER);
  assert.strictEqual(ok(g.getCustomerBootstrap()).ordering.message, 'Ordering is closed today. It reopens Monday at 7:00 AM.');
  // Friday after cutoff reopens Monday
  setNow('2026-10-23T11:00:00-04:00');
  as(TEACHER);
  assert.ok(/reopens Monday/.test(ok(g.getCustomerBootstrap()).ordering.message));
  setNow(WED_9AM);
  // Staff switch
  as(STAFF);
  assert.strictEqual(ok(g.setOrderingEnabled(false)).open, false);
  as(TEACHER);
  fail(g.submitOrder(order()), /Ordering is closed right now/);
  as(STAFF);
  fail(g.setOrderingEnabled('yes'), /went wrong/);
  as(STAFF);
  assert.strictEqual(ok(g.setOrderingEnabled(true)).open, true);
  as(TEACHER);
  ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 1 }] })));
});

test('daily limit: sold-out messages, edits respect what is left, cancelled orders free stock', () => {
  as(STAFF);
  fail(g.setProductDailyLimit('CHOC_CHIP', -5), /whole number/);
  as(STAFF);
  fail(g.setProductDailyLimit('NOPE', 5), /not found/);
  // Today's non-cancelled total so far:
  as(STAFF);
  const already = dash().products.find(p => p.id === 'CHOC_CHIP').soldToday;
  as(STAFF);
  ok(g.setProductDailyLimit('CHOC_CHIP', already + 30));
  as(TEACHER);
  const a = ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 20 }] })));
  as(OTHER_TEACHER);
  fail(g.submitOrder(order({ name: 'Bob', items: [{ productId: 'CHOC_CHIP', quantity: 15 }] })), /Only 10 Chocolate Chip Cookie left today/);
  as(TEACHER);
  const bp = ok(g.getCustomerBootstrap()).products[0];
  assert.strictEqual(bp.left, 10);
  assert.strictEqual(bp.lowStock, true);
  as(OTHER_TEACHER);
  const b = ok(g.submitOrder(order({ name: 'Bob', items: [{ productId: 'CHOC_CHIP', quantity: 10 }] })));
  as(OTHER_TEACHER);
  fail(g.submitOrder(order({ name: 'Bob', items: [{ productId: 'CHOC_CHIP', quantity: 1 }] })), /sold out for today/);
  // Editing my order: can't grow past the limit, can shrink, then grow back to what I freed
  const tok = orderRow(a.orderNumber).EditToken;
  as(TEACHER);
  const ea = ok(g.getOrderForEdit(a.orderNumber, tok));
  as(TEACHER);
  fail(g.editOrder(a.orderNumber, tok, 1, editPayload(ea, [{ productId: 'CHOC_CHIP', quantity: 21 }])), /Only 20 Chocolate Chip Cookie left/);
  as(TEACHER);
  ok(g.editOrder(a.orderNumber, tok, 1, editPayload(ea, [{ productId: 'CHOC_CHIP', quantity: 18 }])));
  as(TEACHER);
  ok(g.editOrder(a.orderNumber, tok, 2, editPayload(ea, [{ productId: 'CHOC_CHIP', quantity: 20 }])));
  // Cancelling frees the cookies
  as(OTHER_TEACHER);
  ok(g.cancelMyOrder(b.orderNumber, orderRow(b.orderNumber).EditToken));
  as(TEACHER);
  assert.strictEqual(ok(g.getCustomerBootstrap()).products[0].left, 10);
  as(STAFF);
  ok(g.setProductDailyLimit('CHOC_CHIP', 0));
});

test('adding a second cookie needs no code: switch to multi-product, per-product prep, price kept on edit', () => {
  as(TEACHER);
  fail(g.setProductAvailable('SUGAR', true), /only for Cookie Cart staff/);
  as(STAFF);
  ok(g.setProductAvailable('SUGAR', true));
  as(TEACHER);
  let b = ok(g.getCustomerBootstrap());
  same(b.products.map(p => p.id), ['CHOC_CHIP', 'SUGAR']);
  // A third cookie typed into the Sheet appears after the onEdit cache clear
  addProduct({ ProductID: 'OATMEAL', Name: 'Oatmeal Raisin', Description: 'Chewy.', Price: 1.25, Available: true, Allergens: 'Wheat', DietaryTags: 'Vegan', ImageURL: 'javascript:alert(1)', SortOrder: 15 });
  cacheMap.set('products_v1', '[]');
  g.onEdit({ range: { getSheet: () => ({ getName: () => 'Products' }) } });
  assert.strictEqual(cacheMap.has('products_v1'), false);
  as(TEACHER);
  b = ok(g.getCustomerBootstrap());
  same(b.products.map(p => p.id), ['CHOC_CHIP', 'OATMEAL', 'SUGAR']);
  assert.strictEqual(b.products[1].imageUrl, '', 'non-https image URLs are dropped');
  same(b.products[1].dietaryTags, ['Vegan']);
  as(TEACHER);
  const o = ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 2 }, { productId: 'OATMEAL', quantity: 4 }, { productId: 'SUGAR', quantity: 0 }] })));
  assert.strictEqual(o.total, 7);
  assert.strictEqual(o.items.length, 2);
  // Price goes up; the existing order keeps its price, a new line uses the new price
  setProduct('OATMEAL', 'Price', 2);
  const tok = orderRow(o.orderNumber).EditToken;
  as(TEACHER);
  const e = ok(g.getOrderForEdit(o.orderNumber, tok));
  as(TEACHER);
  const e2 = ok(g.editOrder(o.orderNumber, tok, 1, editPayload(e, [{ productId: 'CHOC_CHIP', quantity: 2 }, { productId: 'OATMEAL', quantity: 4 }, { productId: 'SUGAR', quantity: 1 }])));
  assert.strictEqual(e2.total, 8);
  // The cookie is removed from the Sheet: the order can keep or reduce it, not add more
  sheets.Products.data = sheets.Products.data.filter(r => r[0] !== 'OATMEAL');
  cacheMap.delete('products_v1');
  as(TEACHER);
  fail(g.editOrder(o.orderNumber, tok, 2, editPayload(e, [{ productId: 'CHOC_CHIP', quantity: 2 }, { productId: 'OATMEAL', quantity: 5 }, { productId: 'SUGAR', quantity: 1 }])), /no longer offered/);
  as(TEACHER);
  assert.strictEqual(ok(g.editOrder(o.orderNumber, tok, 2, editPayload(e, [{ productId: 'CHOC_CHIP', quantity: 2 }, { productId: 'OATMEAL', quantity: 3 }, { productId: 'SUGAR', quantity: 1 }]))).total, 6.75);
  const prep = dash().prep;
  assert.ok(prep.find(p => p.productId === 'OATMEAL').needed >= 3, 'removed cookie still in prep while ordered');
  assert.ok(prep.find(p => p.productId === 'SUGAR'));
  // Sold out from the dashboard hides it for teachers
  as(STAFF);
  ok(g.setProductAvailable('SUGAR', false));
  as(TEACHER);
  same(ok(g.getCustomerBootstrap()).products.map(p => p.id), ['CHOC_CHIP']);
});

test('students: blocked by default, never staff, own limit when enabled', () => {
  sheets.Staff.data.push([STUDENT, 'Sneaky', 'Admin']);
  cacheMap.delete('staff_v1');
  as(STUDENT);
  fail(g.getCustomerBootstrap(), /does not have access/);
  fail(g.getDashboard(''), /only for Cookie Cart staff/);
  assert.strictEqual(g.doGet({ parameter: { page: 'dashboard' } }).file, 'Message');
  setSetting('STUDENT_ORDERING_ENABLED', 'TRUE');
  as(STUDENT);
  assert.strictEqual(ok(g.getCustomerBootstrap()).rules.maxPerOrder, 3);
  as(STUDENT);
  fail(g.submitOrder(order({ name: 'Kid', items: [{ productId: 'CHOC_CHIP', quantity: 4 }] })), /limited to 3/);
  as(STUDENT);
  const s = ok(g.submitOrder(order({ name: 'Kid', items: [{ productId: 'CHOC_CHIP', quantity: 2 }] })));
  assert.strictEqual(orderRow(s.orderNumber).CustomerType, 'Student');
  assert.strictEqual(staffOrder(s.orderNumber).customerType, 'Student');
  setSetting('STUDENT_ORDERING_ENABLED', 'FALSE');
  sheets.Staff.data.pop();
  cacheMap.delete('staff_v1');
});

test('dashboard: oldest first, filters data, history search, change log, day summary', () => {
  const d = dash();
  const created = d.orders.map(o => o.createdAt);
  same(created, created.slice().sort((a, b) => a - b));
  assert.strictEqual(d.today, '2026-10-21');
  as(STAFF);
  const h = ok(g.getHistory({ text: String(disp.orderNumber) }));
  assert.strictEqual(h.total, 1);
  as(STAFF);
  assert.ok(ok(g.getHistory({ text: 'jane' })).total >= 2);
  as(STAFF);
  assert.ok(ok(g.getHistory({ date: '2026-10-21' })).orders.every(o => ['Delivered', 'Cancelled'].indexOf(o.status) !== -1));
  as(STAFF);
  fail(g.getHistory({ date: 'yesterday' }), /valid date/);
  as(STAFF);
  const log = ok(g.getOrderLog(disp.orderNumber));
  same(log.map(r => r.action.split(' (')[0].split(':')[0]),
    ['Created', 'Status', 'Status', 'Edited after dispatch', 'Acknowledged change', 'Edited after dispatch', 'Status']);
  assert.strictEqual(log[3].oldTotal, 24);
  assert.strictEqual(log[3].newTotal, 30);
  as(STAFF);
  const sum = ok(g.getDaySummary('2026-10-21'));
  assert.ok(sum.orders > 10);
  assert.ok(sum.cancellations >= 3);
  assert.strictEqual(sum.postDispatchEdits, 2);
  assert.ok(sum.byPayment.some(p => p.method === 'Account'));
  const cookies = sum.cookies.reduce((n, c) => n + c.quantity, 0);
  assert.ok(cookies > 0);
  as(STAFF);
  fail(g.getDaySummary('21/10/2026'), /valid date/);
});

test('end-of-day summary email runs from the owner or a real trigger only', () => {
  as(ownerEmail);
  g.installTriggers();
  same(g.__triggers.map(t => t.getHandlerFunction()), ['nightlyMaintenance', 'sendDailySummary']);
  as(ownerEmail);
  assert.strictEqual(g.sendDailySummary(), false, 'no recipients configured');
  setSetting('DAILY_SUMMARY_EMAILS', 'principal@school.org, bad-address');
  mail.length = 0;
  as('');
  assert.strictEqual(g.sendDailySummary({ triggerUid: 'uid-sendDailySummary', authMode: g.ScriptApp.AuthMode.FULL }), true);
  const m = lastMailTo('principal@school.org');
  assert.ok(m && /2026-10-21|Oct/.test(m.subject + m.body));
  assert.strictEqual(mail.length, 1);
});

test('rate limit stops scripted order spam', () => {
  keepRateLimits = true;
  as(OTHER_TEACHER);
  let blocked = false;
  for (let i = 0; i < 20 && !blocked; i++) {
    as(OTHER_TEACHER);
    const r = g.submitOrder(order({ name: 'Bob', items: [{ productId: 'CHOC_CHIP', quantity: 1 }] }));
    if (!r.ok && /too often/.test(r.error)) blocked = true;
  }
  keepRateLimits = false;
  assert.ok(blocked);
});

test('email quota exhausted: order still saved, emailSent false, error logged', () => {
  mailQuota = 0;
  as(TEACHER);
  const o = ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 1 }] })));
  assert.strictEqual(o.emailSent, false);
  assert.ok(sheets.Errors.data.some(r => /quota/.test(String(r[2]))));
  mailQuota = 100;
});

test('pages: edit/cancel links route with the token, bad links get a friendly page', () => {
  as(TEACHER);
  const tok = 'c'.repeat(64);
  const p = g.doGet({ parameter: { page: 'edit', order: '5', token: tok } });
  assert.strictEqual(p.file, 'Customer');
  const boot = JSON.parse(p.t.bootJson);
  assert.strictEqual(boot.mode, 'edit');
  assert.strictEqual(boot.token, tok);
  assert.ok(boot.strings && boot.strings.dispatchedBadge, 'client strings are sent');
  assert.strictEqual(g.doGet({ parameter: { page: 'cancel', order: '5', token: tok } }).file, 'Customer');
  assert.strictEqual(g.doGet({ parameter: { page: 'edit', order: '5', token: '<script>' } }).file, 'Message');
  assert.strictEqual(g.doGet({ parameter: { page: 'edit', order: 'x', token: tok } }).file, 'Message');
  // Strings containing </script> cannot break out of the boot JSON
  assert.ok(!/<\/script/i.test(g.safeJsonForHtml_({ a: '</script><b>' })));
});

test('nightly retention removes old closed orders and their change log only', () => {
  setSetting('DELETE_CLOSED_ORDERS_AFTER_DAYS', 30);
  as(ownerEmail);
  assert.strictEqual(g.nightlyMaintenance().removedOrders, 0);
  setNow('2026-12-01T09:00:00-05:00');
  as(ownerEmail);
  const before = sheets.Orders.data.filter((r, i) => i > 0 && r[0] !== '').length;
  const closed = sheets.Orders.data.filter((r, i) => i > 0 && ['Delivered', 'Cancelled'].indexOf(r[9]) !== -1).length;
  const res = g.nightlyMaintenance();
  assert.strictEqual(res.removedOrders, closed);
  assert.strictEqual(sheets.Orders.data.filter((r, i) => i > 0 && r[0] !== '').length, before - closed);
  assert.ok(!sheets.OrderHistory.data.some((r, i) => i > 0 && r[0] === disp.orderNumber), 'change log removed too');
  setSetting('DELETE_CLOSED_ORDERS_AFTER_DAYS', 0);
  setNow(WED_9AM);
});

test('health check and reset for go-live (typed RESET, backups, restart at #1)', () => {
  as(ownerEmail);
  const hc = g.checkSetup();
  same(hc.errors, []);
  assert.ok(hc.info.some(l => /cookie type/.test(l)));
  // Cancel path
  const alerts = [];
  g.__ui = { ButtonSet: { OK_CANCEL: 1, OK: 0 }, Button: { OK: 'OK' }, alert: (...a) => alerts.push(a.join(' ')),
    prompt: () => ({ getSelectedButton: () => 'OK', getResponseText: () => g.__reply }) };
  g.__reply = 'nope';
  as(ownerEmail);
  assert.strictEqual(g.resetForLaunch().reset, false);
  g.__reply = 'reset';
  as(ownerEmail);
  assert.strictEqual(g.resetForLaunch().reset, true);
  assert.strictEqual(sheets.Orders.getLastRow(), 1);
  assert.strictEqual(sheets.OrderHistory.getLastRow(), 1);
  assert.ok(Object.keys(sheets).some(n => /^Backup – Orders /.test(n)));
  delete g.__ui;
  as(TEACHER);
  assert.strictEqual(ok(g.submitOrder(order({ items: [{ productId: 'CHOC_CHIP', quantity: 1 }] }))).orderNumber, 1);
});

test('security: special IDs never match built-in properties; staff-tab Role must be Admin/Staff', () => {
  as(TEACHER);
  fail(g.submitOrder(order({ items: [{ productId: '__proto__', quantity: 1 }] })), /no longer offered/);
  as(STAFF);
  fail(g.setProductAvailable('toString', true), /not found/);
  sheets.Staff.data.push(['blank.role@school.org', 'No Role', '']);
  sheets.Staff.data.push(['viewer@school.org', 'Viewer', 'Viewer']);
  cacheMap.delete('staff_v1');
  as('blank.role@school.org');
  fail(g.getDashboard(''), /only for Cookie Cart staff/);
  as('viewer@school.org');
  fail(g.getDashboard(''), /only for Cookie Cart staff/);
  as('COOKIES@SCHOOL.ORG');
  ok(g.getDashboard(''));
  assert.strictEqual(g.__errors.filter(e => !/quota|Oven/.test(e)).length, 0, 'unexpected errors logged: ' + g.__errors.join('\n'));
});

console.info('\nAll ' + passed + ' Cookie Cart simulated flows passed.');
