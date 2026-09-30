#!/usr/bin/env node
/* Motion check (docs/rules/motion.md, docs/rules/motion.md M7): with prefers-reduced-motion: reduce, no script may
   animate. It opens pages in a browser set to reduced motion, does what a person does on them (zoom into a space
   on the floor plan and back out with [ and ], open the palette in each of its modes, switch a module off and on
   in Settings, choose a port on a unit, press a space and a floor on a Home thumbnail; open and close a disclosure, filter a list, scroll sections and charts into
   view, switch a project's phase, hover a card; on a room drawing, turn Cables on and off, focus two devices, Show everything, switch a
   build option and move to another size of room), and fails when any Element.animate() call asks for a duration above 0.
   It runs every flow twice: once with the system set to reduced motion, and once with the system at full motion but
   the site's own switch on (html data-motion="off"), which must win.
   CSS transitions and animations are checked by motion.css's own reduce rules, not here.

   Usage:
     node tools/motion-check.mjs [--base http://127.0.0.1:4400/keia-atlas] [--only zoom,palette] [--full]
   Start a dev server first (npx astro dev --port <n>) or serve the built site, and pass its address with --base.
   --full runs the same flows with motion on and reports how many scripted moves ran (a smoke test, never a fail).

   Needs Playwright with WebKit, found the same way as tools/responsive-check.mjs (it is not in package.json). */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('base', 'http://127.0.0.1:4321/keia-atlas').replace(/\/$/, '');
const ONLY = opt('only', '').split(',').filter(Boolean);
const FULL = args.includes('--full');

async function loadPlaywright() {
  const tries = [() => import('playwright')];
  if (process.env.PLAYWRIGHT) tries.push(() => import(join(process.env.PLAYWRIGHT, 'index.mjs')));
  const npx = join(homedir(), '.npm', '_npx');
  if (existsSync(npx)) for (const d of readdirSync(npx)) {
    const p = join(npx, d, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(p)) tries.push(() => import(p));
  }
  for (const t of tries) {
    try { const pw = await t(); return { pw, browser: await pw.webkit.launch() }; } catch (_) { /* next */ }
  }
  console.error('Playwright with WebKit was not found. Install it with: npm i -D playwright && npx playwright install webkit');
  process.exit(2);
}

// In the page, before any script: count every scripted animation that asks for time.
function hook() {
  window.__rsAnims = [];
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (k, o) {
    const d = typeof o === 'number' ? o : (o && +o.duration) || 0;
    if (d > 0) {
      const cls = this.className && typeof this.className === 'object' ? this.className.baseVal : this.className;
      window.__rsAnims.push({ d: Math.round(d), el: `${this.tagName.toLowerCase()}${cls ? '.' + String(cls).trim().split(/\s+/).join('.') : ''}`, at: (new Error().stack || '').split('\n').slice(1, 3).join(' < ').replace(/https?:\/\/[^ ]*?\/(src|node_modules)\//g, '$1/') });
    }
    return orig.call(this, k, o);
  };
}

const settle = (page, ms = 700) => page.waitForTimeout(ms);
const key = (page, k) => page.keyboard.press(k);

// What a person does. Each flow starts from a fresh page load.
const FLOWS = [
  ['zoom', '/locations/dub/?floor=3', async (page) => {
    // First press chooses the space (the lenses' selection, V6); a second press zooms in.
    await page.click('[data-sel="room:dub-3-09"]'); await settle(page);
    await key(page, 'l'); await settle(page);   // a lens switch
    await page.click('[data-sel="room:dub-3-09"]');
    await page.waitForURL(/rooms\/dub-3-09/, { waitUntil: 'commit' }); await settle(page);
    await key(page, '['); await page.waitForURL(/locations\/dub\//, { waitUntil: 'commit' }); await settle(page);
    await key(page, ']'); await page.waitForURL(/rooms\/dub-3-09/, { waitUntil: 'commit' }); await settle(page);
    await key(page, '['); await settle(page);
    await key(page, '['); await settle(page);   // floor state off: the path loses a step
    await key(page, '['); await page.waitForURL(/locations\/emea\//, { waitUntil: 'commit' }); await settle(page);
  }],
  ['replay', '/locations/dub/?floor=3', async (page) => {
    await page.click('[data-rpl-toggle]'); await settle(page);
    await page.click('[data-rpl-win="inc0041210"]'); await settle(page);
    await page.click('[data-rpl-f="1"]'); await settle(page);
    await page.click('[data-rpl-play]'); await settle(page, 1500);
    await page.click('[data-rpl-now]'); await settle(page);
  }],
  ['thumb', '/', async (page) => {
    // The floor map's thumbnail on Home: a space changes state and back (tint and glyph), a space zooms open, and
    // the card zooms into the office plan on its floor.
    await page.evaluate(() => { document.dispatchEvent(new CustomEvent('rs:space-state', { detail: { id: 'dub-3-03', h: 'review', why: 'check' } })); }); await settle(page);
    await page.evaluate(() => { document.dispatchEvent(new CustomEvent('rs:space-state', { detail: { id: 'dub-3-03', h: 'fine' } })); }); await settle(page);
    await page.locator('.fm-t-hit:has(.hg):visible').first().click();
    await page.waitForURL(/rooms\//, { waitUntil: 'commit' }); await settle(page);
    await page.goBack(); await page.waitForURL(/keia-atlas\/$/, { waitUntil: 'commit' }); await settle(page);
    await page.locator('a.fm-t-open:visible').first().click();
    await page.waitForURL(/locations\/[a-z]+\/\?floor=/, { waitUntil: 'commit' }); await settle(page);
  }],
  ['palette', '/', async (page) => {
    await key(page, '/'); await settle(page, 300);
    await page.keyboard.type('x52'); await settle(page, 300);
    await key(page, 'ArrowDown'); await page.keyboard.press('Meta+a'); await page.keyboard.type('>'); await settle(page, 300);
    await key(page, 'ArrowDown'); await page.keyboard.press('Meta+a'); await page.keyboard.type('?who is on site in APAC'); await settle(page, 400);
    await key(page, 'Escape'); await settle(page, 300);
  }],
  // The Keia Atlas mark (src/lib/brand-mark.mjs reports its own moves): arrival, a hover, and a page change (leave,
  // then the turntable if it runs past 300 ms, then the landing).
  ['brand', '/', async (page) => {
    await settle(page, 1500);
    await page.hover('.brand svg.kam'); await settle(page); await page.mouse.move(600, 400); await settle(page);
    await page.locator('.nav a[href*="/locations/"]:visible').first().click();
    await page.waitForURL(/locations\//, { waitUntil: 'commit' }); await settle(page, 1500);
  }],
  ['palette-verb', '/locations/dub/', async (page) => {
    await key(page, '/'); await settle(page, 300);
    await page.keyboard.type('>settings'); await settle(page, 300);
    await key(page, 'Enter'); await settle(page, 500);
    await key(page, 'Escape'); await settle(page, 300);
  }],
  // The quick menu (the gear): it opens, a look and a mode change, text size steps, and Escape closes it.
  ['quick-menu', '/vendors/', async (page) => {
    await page.locator('[data-open-settings]:visible').first().click(); await settle(page, 400);
    await page.locator('dialog#settings input[name="qm-skin"][value="enterprise"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.locator('dialog#settings input[name="qm-mode"][value="dark"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.click('dialog#settings [data-text-step="1"]'); await settle(page);
    await page.click('dialog#settings [data-text-step="-1"]'); await settle(page);
    await key(page, 'Escape'); await settle(page, 400);
  }],
  // Organisation settings: a module off and on again; its sidebar entry leaves and comes back through rsChange.
  ['modules', '/settings/organisation/', async (page) => {
    await page.locator('[data-mod-sw="vendors"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.locator('[data-mod-sw="vendors"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.locator('input[name="mod-support"][value="on"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.locator('input[name="mod-support"][value="connected"]').evaluate((i) => i.closest('label').click()); await settle(page);
  }],
  ['deliver', '/projects/prj-14/integrate/', async (page) => {
    // Deliver by: each way regroups the same units (km.regroup); One at a time's Next slides the next in (km.slide).
    for (const by of ['type', 'room', 'one', 'set', 'floor']) {
      await page.click(`[data-deliver-ctl] [data-by="${by}"]`); await settle(page);
      if (by === 'one') { await page.click('[data-act="one-next"]'); await settle(page); }
    }
  }],
  // A capability off and on again (src/lib/modules.mjs): what it marks collapses and grows back through rsChange.
  ['capability', '/settings/organisation/', async (page) => {
    await page.click('[data-mod-card="assets"] details > summary'); await settle(page);
    await page.click('[data-mod-card="projects"] details > summary'); await settle(page);
    for (const id of ['licences', 'licences', 'maintenance', 'maintenance']) {
      await page.locator(`[data-cap-sw="${id}"]`).evaluate((i) => i.closest('label').click()); await settle(page);
    }
    await page.locator('input[name="cap-config-backups"][value="on"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.locator('input[name="cap-config-backups"][value="connected"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.locator('[data-mod-sw="assets"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.locator('[data-mod-sw="assets"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.click('[data-org-all]'); await settle(page);
    await page.click('[data-org-reset]'); await settle(page);
  }],
  // View as: the sheet opens from the account button, finds a person, and choosing folds it away.
  ['view-as', '/', async (page) => {
    await page.locator('[data-acct-menu]:visible, [data-open-settings]:visible').first().click(); await settle(page, 500);
    if (!(await page.evaluate(() => document.querySelector('dialog[data-vp]').open))) { await page.click('dialog#settings [data-open-viewas]'); await settle(page, 500); }
    await page.keyboard.type('liam'); await settle(page, 300);
    await key(page, 'Enter'); await settle(page, 900);
  }],
  // The Settings page: a section from the list, a density change and a find.
  ['settings-page', '/settings/', async (page) => {
    await page.click('[data-st-to="accessibility"]'); await settle(page);
    await page.locator('input[name="st-density"][value="compact"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.locator('input[name="st-density"][value="comfortable"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.fill('[data-fb-q]', 'motion'); await settle(page);
    await page.fill('[data-fb-q]', ''); await settle(page);
  }],
  ['port', '/rooms/dub-3-09/', async (page) => {
    await page.locator('main a[href*="device/?tag="]:visible').first().click();
    await page.waitForURL(/device\/\?tag=/, { waitUntil: 'commit' }); await page.waitForSelector('a.dv-port', { timeout: 8000 }); await settle(page);
    await page.locator('a.dv-port').first().click(); await settle(page);
    await key(page, '['); await settle(page);
    await key(page, ']'); await settle(page);
  }],
  // The site-wide grammar (motion.md M19): a disclosure opens and closes (km-disclose), a filter reflows a list and
  // ticks its count (km-tick), sections settle and charts draw in as they scroll into view (km-settle, km-draw-in),
  // a phase switch comes in from the side, a card lifts on hover (km-lift, CSS).
  ['disclose', '/', async (page) => {
    const s = page.locator('main details:not([hidden]) > summary:visible').first();
    await s.click(); await settle(page);
    await s.click(); await settle(page);
  }],
  ['filter-tick', '/support/queue/', async (page) => {
    await page.locator('[data-fb-facet="prio"] .fb-chip-btn').first().click(); await settle(page, 300);
    await page.locator('[data-fb-facet="prio"] [data-fopt][data-v="3"]').first().click(); await settle(page);
    await page.locator('[data-fb-facet="prio"] [data-fopt][data-v="3"]').first().click(); await settle(page);
    await key(page, 'Escape'); await settle(page, 300);
  }],
  ['settle-draw', '/services/av/', async (page) => {
    await page.addInitScript(() => { window.__kmSettleAlways = true; });   // an automated browser skips km-settle otherwise
    await page.reload({ waitUntil: 'load' }); await settle(page, 500);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 700); await settle(page, 250); }
  }],
  ['phase', '/projects/prj-09/', async (page) => {
    const tabs = page.locator('.ptl-row[data-phx]:visible, .pr-step[data-phx]:visible');
    if (await tabs.count() > 1) { await tabs.first().click(); await settle(page); await tabs.last().click(); await settle(page); }
  }],
  // The room drawing (motion.md rows 55 to 58): a layer on and off, focus on a device and on another, Show
  // everything, a build-option tab (the in-page morph), and another size of room (the morph between pages).
  ['scene', '/room-profiles/huddle-room/', async (page) => {
    await page.click('.scene-wrap:visible [data-layer="cables"]'); await settle(page);
    await page.click('.scene-wrap:visible [data-layer="cables"]'); await settle(page);
    await page.locator('.scene-wrap:visible .scene .no:not(.tag)').first().click(); await settle(page);
    await page.locator('.dt-panel:not([hidden]) .rk-row[data-sk] .rk-no').nth(1).click(); await settle(page);   // another device, from the Key
    await page.click('.scene-wrap:visible [data-scene-all]'); await settle(page);
    const tabs = page.locator('[data-dt-tab]');
    if (await tabs.count() > 1) { await tabs.nth(1).click(); await settle(page); }
    await page.click('.rt-size[href*="conference-room-large"]');
    await page.waitForURL(/conference-room-large/, { waitUntil: 'commit' }); await settle(page, 900);
  }],
  ['lift', '/locations/offices/', async (page) => {
    await page.locator('main .card.oc').first().hover(); await settle(page, 400);
    await page.mouse.move(2, 2); await settle(page, 300);
  }],
];

const { browser } = await loadPlaywright();
const run = async (reduced, motionAttr = '') => {
  const ctx = await browser.newContext({ reducedMotion: reduced ? 'reduce' : 'no-preference', viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(hook);
  // The site's own switch (html data-motion="off"), as a Settings control would set it, kept through page changes.
  if (motionAttr) await ctx.addInitScript((v) => {
    const set = () => { if (document.documentElement) document.documentElement.setAttribute('data-motion', v); };
    document.addEventListener('readystatechange', set); document.addEventListener('astro:after-swap', set); document.addEventListener('DOMContentLoaded', set);
    set(); new MutationObserver((_, mo) => { if (document.documentElement) { set(); mo.disconnect(); } }).observe(document, { childList: true });
  }, motionAttr);
  const out = [];
  for (const [name, path, flow] of FLOWS.filter(([n]) => !ONLY.length || ONLY.includes(n))) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    try {
      await page.goto(BASE + path, { waitUntil: 'load' }); await settle(page, 500);
      await flow(page);
      out.push({ name, anims: await page.evaluate(() => window.__rsAnims), errors });
    } catch (e) {
      out.push({ name, anims: await page.evaluate(() => window.__rsAnims).catch(() => []), errors: [...errors, `flow stopped: ${String(e.message || e).split('\n')[0]}`] });
    }
    await page.close();
  }
  await ctx.close();
  return out;
};

let failed = 0;
const report = (rs, how) => { for (const r of rs) {
  const bad = r.anims.length || r.errors.length;
  if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${r.name.padEnd(13)} ${r.anims.length} scripted animation${r.anims.length === 1 ? '' : 's'} ${how}${r.errors.length ? `, ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}` : ''}`);
  r.anims.slice(0, 8).forEach((a) => console.log(`        ${a.d} ms on ${a.el}  (${a.at})`));
  r.errors.slice(0, 4).forEach((e) => console.log(`        error: ${e}`));
} };
report(await run(true), 'under reduced motion');
// The site's own switch must hold even when the system asks for full motion.
report(await run(false, 'off'), 'with data-motion="off"');
if (FULL) for (const r of await run(false)) console.log(`full  ${r.name.padEnd(13)} ${r.anims.length} scripted moves${r.errors.length ? `, errors: ${r.errors.join('; ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} flow${failed === 1 ? '' : 's'} animate under reduced motion (or stopped).` : '\nNo scripted animation under reduced motion.');
process.exit(failed ? 1 : 0);
