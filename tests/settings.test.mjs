// Settings in three parts (src/lib/settings.mjs): the quick menu behind the gear, /settings/ and
// /settings/organisation/. The quick menu stays short (it never scrolls, on a computer or a phone), every capability
// in the registry has its row on the Organisation page, the storage keys and the ways in are kept, and Reset the demo
// keeps what is yours. The page checks run when the site has been built (npm run build); the browser checks also need
// Playwright with WebKit, found as tools/responsive-check.mjs finds it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODULES, CAPABILITIES } from '../src/lib/modules.mjs';
import { SECTIONS, PERSONAL_KEYS, demoResetKeys, LOOKS } from '../src/lib/settings.mjs';
import { VERBS } from '../src/lib/verbs.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const built = existsSync(join(DIST, 'settings', 'organisation', 'index.html'));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('the quick menu holds the everyday things and the ways on, and nothing of the organisation', () => {
  const qm = read('src/components/Settings.astro');
  const markup = qm.slice(qm.indexOf('<dialog'), qm.indexOf('</dialog>'));
  assert.ok(/data-open-viewas/.test(markup), 'who you view as, with Change');
  assert.ok(/name="qm-mode"/.test(markup) && /name="qm-skin"/.test(markup) && /data-text-step/.test(markup), 'light or dark, the look and text size');
  for (const [to, verb] of [['/settings/', 'settings'], ['/settings/#accessibility', 'settings-a11y'], ['/settings/organisation/', 'settings-org']]) {
    assert.ok(markup.includes(`href('${to}')} data-qm-link data-verb="${verb}"`), `a link to ${to} that the palette can press`);
  }
  assert.ok(!/data-mod|data-cap|a11y-outlines|name="leave"/.test(markup), 'modules, capabilities and the rest live on the pages');
  assert.ok(/rsPopIn\(dlg, opener\)/.test(qm) && /'cancel'/.test(qm), 'it grows from its button, and Escape closes it');
});

test('the palette offers Open settings, Accessibility settings and Organisation settings, from the page\'s own links', () => {
  const ids = new Set(VERBS.map((v) => v.id));
  for (const id of ['settings', 'settings-a11y', 'settings-org']) assert.ok(ids.has(id), id);
  const names = Object.fromEntries(VERBS.map((v) => [v.id, v.name]));
  assert.deepEqual([names.settings, names['settings-a11y'], names['settings-org']], ['Open settings', 'Accessibility settings', 'Organisation settings']);
  assert.ok(/data-verb-always/.test(read('src/components/SearchOverlay.astro')), 'the closed menu\'s links are still listed');
});

test('every storage key and every before-first-paint setting is kept', () => {
  const shell = read('src/layouts/Shell.astro');
  for (const k of ['rs4-skin', 'rs4-theme', 'rs4-agents', 'rs6-density', 'rs6-modules', 'rs6-features', 'rs5-who', 'rs4-who', 'rs5-me']) assert.ok(shell.includes(`'${k}'`), `${k} read by the Shell`);
  assert.ok(/A11Y_BOOT/.test(shell), 'rs7-a11y applied in the head');
  const you = read('src/components/SettingsPersonal.astro');
  for (const k of ['rs4-skin', 'rs4-theme', 'rs6-density', 'rs6-depth']) assert.ok(you.includes(`'${k}'`), `${k} written by Settings › You`);
  assert.ok(/rsSetAgents/.test(you), 'agents');
  assert.ok(/rsSetA11y/.test(read('src/components/SettingsA11y.astro')), 'accessibility through rs7-a11y');
  const demo = read('src/components/SettingsDemo.astro');
  assert.ok(demo.includes("'rs6-leave'") && demo.includes("'rs6-welcomed'"), 'time away');
});

test('Reset the demo removes the demo\'s keys and keeps what is yours', () => {
  const keys = [...PERSONAL_KEYS, 'rs4-changes', 'rs6-modules', 'rs6-features', 'rs6-leave', 'rs4-who', 'rs6-who-recent', 'rs5-live', 'rs4-rooms-view', 'rs5-sch-view', 'other-app'];
  const gone = demoResetKeys(keys);
  assert.deepEqual(gone.sort(), ['rs4-changes', 'rs4-who', 'rs5-live', 'rs6-features', 'rs6-leave', 'rs6-modules', 'rs6-who-recent']);
  for (const k of ['rs4-skin', 'rs4-theme', 'rs7-a11y', 'rs6-density', 'rs6-depth']) assert.ok(PERSONAL_KEYS.includes(k), `${k} stays`);
});

test('the Settings page has one section per entry, in order, each with an address', () => {
  assert.deepEqual(SECTIONS.map((s) => s.id), ['you', 'accessibility', 'organisation', 'demo', 'about']);
  const page = read('src/pages/settings/index.astro');
  for (const s of SECTIONS) assert.ok(page.includes(`id="${s.id}"`), `#${s.id}`);
  assert.equal(LOOKS.length, 5);
});

test('built: every module and every capability in the registry has its row on the Organisation page', { skip: !built && 'run npm run build first' }, () => {
  const html = readFileSync(join(DIST, 'settings', 'organisation', 'index.html'), 'utf8');
  for (const m of MODULES) assert.ok(html.includes(`data-mod-card="${m.id}"`), `module ${m.id}`);
  const missing = CAPABILITIES.filter((c) => !html.includes(`data-cap-row="${c.id}"`)).map((c) => c.id);
  assert.deepEqual(missing, [], 'every capability is listed');
  for (const c of CAPABILITIES) assert.ok(html.includes(`data-cap-sw="${c.id}"`), `${c.id} has its switch`);
});

test('built: the ways into Settings land on the right place', { skip: !built && 'run npm run build first' }, () => {
  const page = (p) => readFileSync(join(DIST, p, 'index.html'), 'utf8');
  assert.match(page('settings'), /id="accessibility"/);
  // A switched-off module's gate and a capability's gate both link to its card on the Organisation page.
  assert.match(page('vendors'), /settings\/organisation\/#vendors/);
  assert.match(page('assets/licences'), /settings\/organisation\/#assets/);
});

// ---- In a browser --------------------------------------------------------------------------------------------------
async function loadPlaywright() {
  const tries = [() => import('playwright')];
  if (process.env.PLAYWRIGHT) tries.push(() => import(join(process.env.PLAYWRIGHT, 'index.mjs')));
  const npx = join(homedir(), '.npm', '_npx');
  if (existsSync(npx)) for (const d of readdirSync(npx)) {
    const p = join(npx, d, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(p)) tries.push(() => import(pathToFileURL(p).href));
  }
  for (const t of tries) {
    try { const pw = await t(); return await pw.webkit.launch(); } catch (_) { /* next */ }
  }
  return null;
}
const browser = built ? await loadPlaywright() : null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp' };
let server = null, base = '';
if (browser) {
  server = createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/keia-atlas/, '');
    let f = join(DIST, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!f.startsWith(DIST) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}/keia-atlas`;
}

for (const [w, h, text] of [[1440, 900, 'default'], [375, 812, 'default'], [375, 812, 'largest']]) {
  test(`the quick menu never scrolls and fits the window at ${w}×${h}, text ${text}`, { skip: !browser && 'needs a build and Playwright with WebKit' }, async () => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('rs5-tour', 'done'); if (t !== 'default') localStorage.setItem('rs7-a11y', JSON.stringify({ text: t })); } catch (_) {} }, text);
    const page = await ctx.newPage();
    try {
      await page.goto(`${base}/`, { waitUntil: 'load' });
      await page.locator('[data-open-settings]:visible').first().click();
      await page.waitForTimeout(150);
      const m = await page.evaluate(() => {
        const d = document.querySelector('dialog#settings'), r = d.getBoundingClientRect();
        const cut = [...d.querySelectorAll('b, small, span, output, a')].filter((el) => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible').length;
        return { open: d.open, sh: d.scrollHeight, ch: d.clientHeight, top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight, cut };
      });
      assert.ok(m.open, 'it opened');
      assert.ok(m.sh <= m.ch + 1, `no scroll inside (${m.sh} of ${m.ch})`);
      assert.ok(m.top >= 0 && m.bottom <= m.vh && m.left >= 0 && m.right <= m.vw, `inside the window (${JSON.stringify(m)})`);
      assert.equal(m.cut, 0, 'nothing in it is cut short');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(() => document.querySelector('dialog#settings').open), false, 'Escape closes it');
    } finally { await ctx.close(); }
  });
}

test('the Organisation page lists every registered capability, and a switch changes the page before first paint next time', { skip: !browser && 'needs a build and Playwright with WebKit' }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  try {
    await page.goto(`${base}/settings/organisation/`, { waitUntil: 'load' });
    const rows = await page.evaluate(() => [...document.querySelectorAll('[data-cap-row]')].map((r) => r.dataset.capRow));
    assert.deepEqual(rows.sort(), CAPABILITIES.map((c) => c.id).sort());
    await page.evaluate(() => { const d = document.querySelector('[data-mod-card="assets"] details'); d.open = true; });
    await page.locator('[data-cap-sw="licences"]').evaluate((i) => i.closest('label').click());
    assert.match(await page.evaluate(() => document.documentElement.getAttribute('data-feat-off')), /\blicences\b/);
    await page.reload({ waitUntil: 'load' });
    assert.match(await page.evaluate(() => document.documentElement.getAttribute('data-feat-off')), /\blicences\b/, 'kept in rs6-features');
    assert.equal(await page.locator('[data-cap-sw="licences"]').isChecked(), false);
  } finally { await ctx.close(); }
});

test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });
