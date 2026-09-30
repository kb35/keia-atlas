#!/usr/bin/env node
/* Motion check (MOTION-V2 §6 and §7, docs/rules/motion.md M7): with prefers-reduced-motion: reduce, no script may
   animate. It opens pages in a browser set to reduced motion, does what a person does on them (zoom into a space
   on the floor plan and back out with [ and ], open the palette in each of its modes, switch a module off and on
   in Settings, choose a port on a unit), and fails when any Element.animate() call asks for a duration above 0.
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
  ['palette', '/', async (page) => {
    await key(page, '/'); await settle(page, 300);
    await page.keyboard.type('x52'); await settle(page, 300);
    await key(page, 'ArrowDown'); await page.keyboard.press('Meta+a'); await page.keyboard.type('>'); await settle(page, 300);
    await key(page, 'ArrowDown'); await page.keyboard.press('Meta+a'); await page.keyboard.type('?who is on site in APAC'); await settle(page, 400);
    await key(page, 'Escape'); await settle(page, 300);
  }],
  ['palette-verb', '/locations/dub/', async (page) => {
    await key(page, '/'); await settle(page, 300);
    await page.keyboard.type('>settings'); await settle(page, 300);
    await key(page, 'Enter'); await settle(page, 500);
    await key(page, 'Escape'); await settle(page, 300);
  }],
  ['modules', '/vendors/', async (page) => {
    const gear = page.locator('[data-open-settings]:visible').first();
    await gear.click(); await settle(page, 400);
    await page.locator('input[name="mod-vendors"][value="off"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await page.locator('input[name="mod-vendors"][value="on"]').evaluate((i) => i.closest('label').click()); await settle(page);
    await key(page, 'Escape'); await settle(page, 400);
  }],
  ['deliver', '/projects/prj-14/integrate/', async (page) => {
    // Deliver by: each way regroups the same units (km.regroup); One at a time's Next slides the next in (km.slide).
    for (const by of ['type', 'room', 'one', 'set', 'floor']) {
      await page.click(`[data-deliver-ctl] [data-by="${by}"]`); await settle(page);
      if (by === 'one') { await page.click('[data-act="one-next"]'); await settle(page); }
    }
  }],
  ['port', '/rooms/dub-3-09/', async (page) => {
    await page.locator('main a[href*="device/?tag="]:visible').first().click();
    await page.waitForURL(/device\/\?tag=/, { waitUntil: 'commit' }); await page.waitForSelector('a.dv-port', { timeout: 8000 }); await settle(page);
    await page.locator('a.dv-port').first().click(); await settle(page);
    await key(page, '['); await settle(page);
    await key(page, ']'); await settle(page);
  }],
];

const { browser } = await loadPlaywright();
const run = async (reduced) => {
  const ctx = await browser.newContext({ reducedMotion: reduced ? 'reduce' : 'no-preference', viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(hook);
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
for (const r of await run(true)) {
  const bad = r.anims.length || r.errors.length;
  if (bad) failed++;
  console.log(`${bad ? 'FAIL' : 'ok  '}  ${r.name.padEnd(13)} ${r.anims.length} scripted animation${r.anims.length === 1 ? '' : 's'} under reduced motion${r.errors.length ? `, ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}` : ''}`);
  r.anims.slice(0, 8).forEach((a) => console.log(`        ${a.d} ms on ${a.el}  (${a.at})`));
  r.errors.slice(0, 4).forEach((e) => console.log(`        error: ${e}`));
}
if (FULL) for (const r of await run(false)) console.log(`full  ${r.name.padEnd(13)} ${r.anims.length} scripted moves${r.errors.length ? `, errors: ${r.errors.join('; ')}` : ''}`);
await browser.close();
console.log(failed ? `\n${failed} flow${failed === 1 ? '' : 's'} animate under reduced motion (or stopped).` : '\nNo scripted animation under reduced motion.');
process.exit(failed ? 1 : 0);
