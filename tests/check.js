/**
 * tests/check.js — fast static checks run on every change (see package.json
 * and .github/workflows/test.yml). Usage:   node tests/check.js
 *
 *  1. Every .gs file and every <script> block in the .html files parses.
 *  2. appsscript.json is valid and keeps the required web-app settings.
 *  3. SECURITY GUARD: every server function a browser can call (name without a
 *     trailing "_") performs an access check, unless it is on the short
 *     reviewed allowlist below. This stops a future edit from accidentally
 *     exposing data or actions to anyone.
 *  4. Templates only include partials that include() allows.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = path.join(__dirname, '..', 'src');
const failures = [];
const fail = (msg) => failures.push(msg);

const gsFiles = fs.readdirSync(src).filter(f => f.endsWith('.gs'));
const htmlFiles = fs.readdirSync(src).filter(f => f.endsWith('.html'));

// 1. Syntax
gsFiles.forEach(f => {
  try { new vm.Script(fs.readFileSync(path.join(src, f), 'utf8'), { filename: f }); } catch (e) { fail(f + ': ' + e.message); }
});
try {
  new vm.Script(gsFiles.map(f => fs.readFileSync(path.join(src, f), 'utf8')).join('\n;\n'), { filename: 'all.gs' });
} catch (e) { fail('Combined .gs files: ' + e.message + ' (duplicate top-level names?)'); }
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(src, f), 'utf8');
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const code = m[1].replace(/<\?!?=[\s\S]*?\?>/g, 'null');   // template tags
    try { new vm.Script(code, { filename: f }); } catch (e) { fail(f + ': ' + e.message); }
  }
});

// 2. Manifest
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(src, 'appsscript.json'), 'utf8'));
  if (manifest.runtimeVersion !== 'V8') fail('appsscript.json: runtimeVersion must be V8');
  if (!manifest.webapp || manifest.webapp.executeAs !== 'USER_DEPLOYING') fail('appsscript.json: webapp.executeAs must be USER_DEPLOYING');
  if (!manifest.webapp || manifest.webapp.access !== 'DOMAIN') fail('appsscript.json: webapp.access must be DOMAIN');
} catch (e) { fail('appsscript.json: ' + e.message); }

// 3. Access-check guard
const ACCESS_CHECKS = /require(Customer|Staff|Owner|OwnerOrTrigger)_\(/;
const ALLOWLIST = {
  doGet: 'checks the user itself and routes to an access-denied page',
  include: 'only returns whitelisted HTML partials',
  onOpen: 'adds the Sheet menu; does nothing in a web context',
  AppError: 'error constructor; no data or side effects'
};
let publicCount = 0;
gsFiles.forEach(f => {
  const code = fs.readFileSync(path.join(src, f), 'utf8');
  const re = /^function\s+([A-Za-z0-9]+)\s*\(/gm;
  let m;
  while ((m = re.exec(code))) {
    const name = m[1];
    publicCount++;
    if (ALLOWLIST[name]) continue;
    const end = code.indexOf('\n}', m.index);
    const body = code.slice(m.index, end === -1 ? undefined : end);
    if (!ACCESS_CHECKS.test(body)) {
      fail(f + ': ' + name + '() can be called from any browser but has no requireCustomer_/requireStaff_/requireOwner_ check. ' +
        'Add one, or rename it to end with "_" if browsers should not call it.');
    }
  }
});

// 4. Includes
const codeGs = fs.readFileSync(path.join(src, 'Code.gs'), 'utf8');
const allowedMatch = codeGs.match(/var allowed = \[([^\]]*)\]/);
const allowed = allowedMatch ? allowedMatch[1].split(',').map(s => s.trim().replace(/'/g, '')) : [];
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(src, f), 'utf8');
  (html.match(/include\('([^']+)'\)/g) || []).forEach(inc => {
    const name = inc.match(/'([^']+)'/)[1];
    if (allowed.indexOf(name) === -1) fail(f + ": include('" + name + "') is not in include()'s allowed list in Code.gs");
    if (!fs.existsSync(path.join(src, name + '.html'))) fail(f + ': includes missing file ' + name + '.html');
  });
});

if (failures.length) {
  console.error('Static checks FAILED:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
console.info('Static checks passed: ' + gsFiles.length + ' .gs files, ' + htmlFiles.length + ' .html files, ' +
  publicCount + ' browser-callable functions all guarded or reviewed.');
