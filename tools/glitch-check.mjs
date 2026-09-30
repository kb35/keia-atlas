#!/usr/bin/env node
/* Glitch check: finds the visual glitches the responsive check cannot see, because the page itself does not
   scroll sideways. It opens each page at three widths, three text sizes (Settings › Accessibility › Text size)
   and two looks (Studio light, Enterprise dark), and lists:

     spill       a label, row or box that sticks out past the edge of the box it sits in (a bordered or filled
                 parent), sideways or, for text, below a fixed-height box
     clipped     text or a control cut off by a parent that hides its overflow
     ellipsis    a label cut short with "…": headings, names, roles and buttons rank high
     overlap     siblings on top of each other (avatar stacks and chip rows most of all)
     glyph       an icon whose centre sits more than 3 px off its text line
     console     an error in the console or an uncaught exception, on load or after opening the palette,
                 the account menu, View as, Settings, a filter, details and tabs
     request     a file the page asked for that did not load
     link        an internal link to a page that is not in dist/ (every built page is scanned)

   Every finding has a signature (the element and its parent, by class), so one fault in a shared component is
   one line, counted across every page, width, text size and look it appears on. The report ranks by
   count x severity.

   Usage:
     npm run build && npx astro preview --port 4499 &
     npm run glitch -- [--base http://127.0.0.1:4499/keia-atlas] [--only home,portfolio] [--quick]
                       [--widths 375,768,1440] [--text 1,1.15,1.3] [--looks studio-light,enterprise-dark]
                       [--out <dir>] [--workers 6] [--max 40]
   --quick checks 375 and 1440, text 1 and 1.3, Studio only. The report goes to ../notes/audit/ next to the
   repository (never committed): glitches.json and GLITCHES.md. Needs Playwright with WebKit, found the way
   tools/responsive-check.mjs finds it. Exits 0 (it reports; it does not gate).

   Marking something as intended: data-glitch-ok (or data-rc-ok) on an element skips it and everything in it;
   data-overlap on a stack (avatars that overlap by design) allows its members to overlap up to that fraction
   (data-overlap="0.3"). Keep both rare, and say why in a comment beside them. */
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PAGES } from './check-pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const QUICK = flag('quick');
const BASE = opt('base', 'http://127.0.0.1:4499/keia-atlas').replace(/\/$/, '');
const BASE_PATH = new URL(BASE).pathname.replace(/\/$/, '');
const WIDTHS = opt('widths', QUICK ? '375,1440' : '375,768,1440').split(',').map(Number);
const TEXTS = opt('text', QUICK ? '1,1.3' : '1,1.15,1.3').split(',').map(Number);
const LOOKS = opt('looks', QUICK ? 'studio-light' : 'studio-light,enterprise-dark').split(',');
const ONLY = opt('only', '').split(',').filter(Boolean);
const WORKERS = Number(opt('workers', '6'));
const MAX_PER_GLOB = Number(opt('max', '40'));
const DIST = join(ROOT, 'dist');

const TEXT_NAME = { 1: 'default', 1.15: 'larger', 1.3: 'largest' };
const LOOK = { 'studio-light': ['studio', 'light'], 'studio-dark': ['studio', 'dark'], 'enterprise-light': ['enterprise', 'light'], 'enterprise-dark': ['enterprise', 'dark'] };
const SEVERITY = { console: 5, request: 4, link: 4, clipped: 3, spill: 3, 'ellipsis-key': 3, overlap: 3, 'overlap-other': 2, 'spill-v': 2, ellipsis: 1, glyph: 1 };

// Cut-offs that are meant to be there: a signature (or the start of one) and why. Keep this short.
const INTENTIONAL = [
  // ['span.fb-val', 'a chosen filter value in a chip is cut, the full list is one click away'],
];

// ---------- The pages ----------
// The shared list, the new places Keith asked for, and every built page under a few folders (found in dist/).
const EXTRA = [
  ['method-fits', '/method/how-it-fits/'], ['about-a11y', '/about/accessibility/'],
];
const GLOBS = ['portfolio', 'services', 'switches'];
function builtPages(dir) {
  const out = [];
  const walk = (d, rel) => {
    if (!existsSync(d)) return;
    if (existsSync(join(d, 'index.html'))) out.push('/' + rel + (rel ? '/' : ''));
    for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p, rel ? `${rel}/${f}` : f); }
  };
  walk(join(DIST, dir), dir);
  return out;
}
function pageList() {
  const seen = new Set();
  const list = [];
  const add = (id, path) => { const p = path.split('#')[0]; if (seen.has(p)) return; seen.add(p); list.push([id, path]); };
  for (const [id, path] of PAGES) add(id, path);
  for (const [id, path] of EXTRA) add(id, path);
  for (const g of GLOBS) {
    let found = builtPages(g);
    // Switches: one of each kind is plenty (they are one template).
    if (g === 'switches') found = found.slice(0, 2);
    for (const p of found.slice(0, MAX_PER_GLOB)) add(p.replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'root', p);
  }
  return ONLY.length ? list.filter(([id, p]) => ONLY.some((o) => id === o || p.startsWith(o))) : list;
}
// The provider's pages are only whole when you view as the provider (docs/service-providers.md).
const whoFor = (path) => (path.startsWith('/portfolio') ? 'sam' : '');

// ---------- Playwright ----------
async function loadPlaywright() {
  const tries = [() => import('playwright')];
  if (process.env.PLAYWRIGHT) tries.push(() => import(join(process.env.PLAYWRIGHT, 'index.mjs')));
  const npx = join(homedir(), '.npm', '_npx');
  if (existsSync(npx)) for (const d of readdirSync(npx)) {
    const p = join(npx, d, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(p)) tries.push(() => import(p));
  }
  for (const t of tries) { try { const pw = await t(); return await pw.webkit.launch(); } catch (_) { /* next */ } }
  console.error('Playwright with WebKit was not found. Install it with: npm i -D playwright && npx playwright install webkit');
  process.exit(2);
}

// ---------- Runs in the page ----------
function measure() {
  const out = [];
  const W = document.documentElement.clientWidth;
  const cache = new Map();
  const cs = (el) => { let c = cache.get(el); if (!c) { c = getComputedStyle(el); cache.set(el, c); } return c; };
  const SKIP = '[data-glitch-ok], [data-rc-ok], [hidden], .sr-only, .visually-hidden, [aria-hidden="true"], astro-dev-toolbar, template, noscript, canvas, dialog:not([open]), [inert]';
  const hiddenUp = (el) => { for (let p = el; p; p = p.parentElement) { const c = cs(p); if (c.display === 'none' || +c.opacity === 0 || c.contentVisibility === 'hidden') return true; } return false; };
  const shown = (el) => {
    if (!el || el.closest(SKIP)) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (cs(el).visibility === 'hidden') return false;
    return !hiddenUp(el);
  };
  const cls = (e) => [...e.classList].filter((x) => !/^astro-|^is-|^on$|^open$|^active$|^sel$/.test(x)).slice(0, 2).map((x) => '.' + x).join('');
  const one = (e) => e.tagName.toLowerCase() + cls(e);
  const sig = (el) => {
    // The element and the nearest ancestor with a class, so a shared component reads the same on every page.
    let p = el.parentElement;
    while (p && p !== document.body && !cls(p)) p = p.parentElement;
    return (p && p !== document.body ? one(p) + ' > ' : '') + one(el);
  };
  const text = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50);
  const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return c === 'transparent' ? 0 : 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? +p[3] : 1; };
  const kindOf = (el) => {
    if (el === document.body || el === document.documentElement) return 'page';
    const c = cs(el);
    if (c.overflowX !== 'visible' || c.overflowY !== 'visible') return 'clip';
    if (c.display === 'inline' || c.display === 'contents') return null;
    if ((parseFloat(c.borderLeftWidth) > 0 && c.borderLeftStyle !== 'none') || (parseFloat(c.borderRightWidth) > 0 && c.borderRightStyle !== 'none')) return 'box';
    if (alpha(c.backgroundColor) > 0.05 || c.backgroundImage !== 'none') return 'box';
    return null;
  };
  const positioned = (el) => { const p = cs(el).position; return p === 'absolute' || p === 'fixed'; };
  // The nearest box an item must stay inside, or null when a positioned layer comes first (badges, popovers
  // that are meant to stick out).
  const boxOf = (start) => {
    for (let p = start; p; p = p.parentElement) {
      const k = kindOf(p);
      if (k) return { el: p, kind: k };
      if (positioned(p)) return null;
      if (p.tagName === 'svg' || p.closest('svg') && p.tagName !== 'svg') return null;
    }
    return null;
  };
  const add = (type, el, extra) => out.push({ type, sig: sig(el), text: text(el), ...extra });
  const seen = new Set();
  const once = (k) => { if (seen.has(k)) return false; seen.add(k); return true; };

  // 1. Spill and clip: text and boxes against their box.
  const check = (node, r, host) => {
    const b = boxOf(host === node ? node.parentElement : host);
    if (!b) return;
    if (b.kind === 'page') return; // page-level overflow is the responsive check's job
    const br = b.el.getBoundingClientRect();
    const c = cs(b.el);
    const isText = node.nodeType === 3;
    const dx = Math.max(r.right - br.right, br.left - r.left);
    const dy = r.bottom - br.bottom;
    if (b.kind === 'clip') {
      const sx = c.overflowX === 'auto' || c.overflowX === 'scroll';
      const sy = c.overflowY === 'auto' || c.overflowY === 'scroll';
      const control = !isText && host.matches('a, button, input, select, textarea, [role=button]');
      if (!isText && !control) return;
      if (c.textOverflow === 'ellipsis' || (c.webkitLineClamp && c.webkitLineClamp !== 'none')) return; // counted as ellipsis
      if (!sx && dx > 1.5 && once('c' + sig(host))) add('clipped', host, { by: one(b.el), px: Math.round(dx), axis: 'x' });
      else if (!sy && dy > 2 && isText && once('cv' + sig(host))) add('clipped', host, { by: one(b.el), px: Math.round(dy), axis: 'y' });
      return;
    }
    if (dx > 1.5 && once('s' + sig(host))) add('spill', host, { by: one(b.el), px: Math.round(dx) });
    else if (isText && dy > 2 && once('sv' + sig(host))) add('spill-v', host, { by: one(b.el), px: Math.round(dy) });
  };
  const all = [...document.body.querySelectorAll('*')].slice(0, 40000);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n = 0;
  for (let t = walker.nextNode(); t && n < 40000; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const host = t.parentElement;
    if (!host || /^(SCRIPT|STYLE|TITLE|OPTION)$/.test(host.tagName) || host.closest('svg')) continue;
    if (!shown(host)) continue;
    n++;
    const range = document.createRange(); range.selectNodeContents(t);
    const r = range.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    check(t, r, host);
  }
  for (const el of all) {
    if (el.closest('svg') && el.tagName !== 'svg') continue;
    const k = kindOf(el);
    const leaf = /^(IMG|svg|INPUT|SELECT|TEXTAREA|BUTTON|VIDEO)$/.test(el.tagName);
    if (!k && !leaf) continue;
    if (k === 'page' || positioned(el) || !shown(el)) continue;
    check(el, el.getBoundingClientRect(), el);
  }

  // 2. Ellipsis and line clamps.
  const KEY = 'h1, h2, h3, h4, h5, h6, button, .btn, [role=button], [role=tab], th, legend, summary, label';
  const KEYCLS = /name|title|role|who|person|head|label|btn|tab|crumb/i;
  for (const el of all) {
    const c = cs(el);
    const ell = c.textOverflow === 'ellipsis' && c.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1;
    const clamp = c.webkitLineClamp && c.webkitLineClamp !== 'none' && el.scrollHeight > el.clientHeight + 1;
    if (!(ell || clamp) || !shown(el)) continue;
    const key = el.matches(KEY) || !!el.closest(KEY) || KEYCLS.test(el.className || '') || KEYCLS.test(el.parentElement?.className || '');
    if (once('e' + sig(el))) add(key ? 'ellipsis-key' : 'ellipsis', el, { px: Math.round(el.scrollWidth - el.clientWidth), clamp: !!clamp });
  }

  // 3. Overlapping siblings in the flow.
  const CHIPISH = /av\b|avatar|initials|chip|pill|tag|badge|face|who|person/i;
  for (const par of all) {
    const kids = [...par.children];
    if (kids.length < 2 || kids.length > 60) continue;
    const allow = par.closest('[data-overlap]');
    const limit = allow ? Number(allow.getAttribute('data-overlap')) || 0.3 : 0.2;
    const pc = cs(par);
    if (pc.display === 'contents' || !shown(par)) continue;
    const vis = kids.filter((k) => !positioned(k) && cs(k).display !== 'contents' && !/^(SCRIPT|STYLE|TEMPLATE)$/.test(k.tagName) && shown(k));
    const rects = vis.map((k) => k.getBoundingClientRect());
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = rects[i], b = rects[j];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w <= 1 || h <= 1) continue;
      const frac = (w * h) / Math.min(a.width * a.height, b.width * b.height);
      if (frac <= limit) continue;
      const chip = CHIPISH.test(vis[i].className || '') || CHIPISH.test(par.className || '');
      if (once('o' + sig(vis[i]) + sig(vis[j]))) add(chip ? 'overlap' : 'overlap-other', vis[i], { with: one(vis[j]), frac: Math.round(frac * 100) / 100 });
    }
  }

  // 4. Icons off their text line.
  const GLYPHS = 'svg, [class*="glyph"], [class*="icon"], .hg, i';
  for (const g of document.body.querySelectorAll(GLYPHS)) {
    if (g.parentElement?.closest(GLYPHS.replace(', i', '')) && g.tagName !== 'svg') continue;
    if (g.tagName === 'svg' && g.parentElement?.closest('svg')) continue;
    if (!shown(g)) continue;
    const gr = g.getBoundingClientRect();
    if (gr.height > 28 || gr.width > 28 || gr.height < 6) continue;
    const par = g.parentElement;
    if (!par) continue;
    const pd = cs(par).display;
    // Only an icon set beside words in the same row: its parent lays it out inline or in a row.
    if (!/flex|inline|block|grid/.test(pd) || (pd.includes('flex') && cs(par).flexDirection.startsWith('column'))) continue;
    let best = null;
    for (const node of par.childNodes) {
      if (node === g || (node.nodeType === 1 && (node.contains(g) || node.querySelector?.('svg')))) continue;
      if (node.nodeType !== 3 && node.nodeType !== 1) continue;
      if (!(node.textContent || '').trim()) continue;
      if (node.nodeType === 1 && (!shown(node) || positioned(node))) continue;
      // The first line of words: the first text in it, never a box (a box may hold several lines).
      let tn = node;
      if (node.nodeType === 1) { const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: (x) => (x.textContent.trim() ? 1 : 3) }); tn = tw.nextNode(); }
      if (!tn) continue;
      const range = document.createRange(); range.selectNodeContents(tn);
      const lines = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
      if (!lines.length) continue;
      const l = lines[0];
      const gap = l.left >= gr.right ? l.left - gr.right : gr.left >= l.right ? gr.left - l.right : 0;
      if (gap > 16) continue;
      if (l.bottom < gr.top - 2 || l.top > gr.bottom + 2) continue; // stacked, not side by side
      if (!best || gap < best.gap) best = { gap, l };
    }
    if (!best) continue;
    const off = (gr.top + gr.bottom) / 2 - (best.l.top + best.l.bottom) / 2;
    if (Math.abs(off) > 3 && once('g' + sig(g))) add('glyph', g, { px: Math.round(off * 10) / 10, host: one(par) });
  }
  return out;
}

// Opens the parts of a page that are closed at first, so their contents are measured too.
async function openDetails(page) {
  await page.evaluate(() => {
    for (const d of [...document.querySelectorAll('main details:not([open]), .page details:not([open])')].slice(0, 30)) {
      const s = d.querySelector(':scope > summary');
      if (s && !s.closest('[data-glitch-ok]')) s.click();
    }
  });
}

// ---------- The run ----------
function repoNotes() {
  const out = opt('out', process.env.GLITCH_OUT || '');
  if (out) return resolve(out);
  try {
    const common = execSync('git rev-parse --path-format=absolute --git-common-dir', { cwd: ROOT, encoding: 'utf8' }).trim();
    const notes = resolve(dirname(common), '..', 'notes');
    if (existsSync(notes)) return join(notes, 'audit');
  } catch (_) { /* not a checkout */ }
  return join(tmpdir(), 'keia-glitches');
}

function distHas(pathname) {
  let p = decodeURIComponent(pathname);
  if (!p.startsWith(BASE_PATH + '/') && p !== BASE_PATH) return true; // not ours
  p = p.slice(BASE_PATH.length) || '/';
  const f = join(DIST, p);
  if (p.endsWith('/')) return existsSync(join(f, 'index.html'));
  return existsSync(f) || existsSync(join(f, 'index.html'));
}

// Every built page's internal links, read from the HTML (no browser needed).
function staticLinks() {
  const bad = new Map();
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (f !== '_astro') walk(p); continue; }
      if (!f.endsWith('.html')) continue;
      const html = readFileSync(p, 'utf8');
      const from = '/' + p.slice(DIST.length + 1).replace(/index\.html$/, '');
      for (const m of html.matchAll(/<a\b[^>]*?\shref="([^"#?]*)(?:[?#][^"]*)?"/g)) {
        const h = m[1];
        if (!h || !h.startsWith(BASE_PATH + '/')) continue;
        if (distHas(h)) continue;
        const e = bad.get(h) || { href: h, from: [] };
        if (e.from.length < 5) e.from.push(from);
        e.count = (e.count || 0) + 1;
        bad.set(h, e);
      }
    }
  };
  if (existsSync(DIST)) walk(DIST);
  return [...bad.values()];
}

async function interact(page, errs) {
  // The shell's parts: the palette, the account menu with View as, Settings. Each is opened, measured, closed.
  const found = [];
  const step = async (label, fn) => {
    const before = errs.length;
    try { await fn(); await page.waitForTimeout(250); } catch (e) { errs.push({ kind: 'interact', text: `${label}: ${e.message.split('\n')[0]}` }); }
    for (const e of errs.slice(before)) e.after = label;
    try { const m = await page.evaluate(measure); for (const x of m) { x.state = label; found.push(x); } } catch (_) { /* page moved on */ }
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(120);
  };
  const clickFirst = (sel) => page.evaluate((s) => { const el = [...document.querySelectorAll(s)].find((e) => e.getBoundingClientRect().width > 0); if (el) { el.click(); return true; } return false; }, sel);
  await step('palette', async () => { await page.keyboard.press('Meta+k'); await page.waitForTimeout(100); if (!(await page.evaluate(() => !!document.querySelector('.search-ov:not([hidden]), [data-search-ov]:not([hidden]), dialog[open]')))) await clickFirst('[data-open-search]'); });
  await step('account', () => clickFirst('[data-acct-menu]'));
  await step('view-as', async () => { await clickFirst('[data-acct-menu]'); await page.waitForTimeout(100); await clickFirst('[data-open-viewas], #view-as [data-view-as], [data-verb="view-as"]'); });
  await step('settings', () => clickFirst('[data-open-settings]'));
  await step('filter', () => clickFirst('.fb .fb-chip-btn, [data-fb-facet] button'));
  await step('tabs', () => page.evaluate(() => { for (const t of [...document.querySelectorAll('[role=tab], .dt-tab')].slice(0, 8)) t.click(); }));
  return found;
}

async function main() {
  const pages = pageList();
  const combos = [];
  for (const look of LOOKS) for (const text of TEXTS) for (const w of WIDTHS) combos.push({ look, text, w });
  console.log(`${pages.length} pages x ${combos.length} views (${WIDTHS.join('/')} px, text ${TEXTS.join('/')}, ${LOOKS.join(' and ')}) at ${BASE}`);
  const browser = await loadPlaywright();
  const findings = []; // { type, sig, text, page, view, ... }
  const errors = [];
  const hrefs = new Map();
  const t0 = Date.now();
  let done = 0;
  const total = pages.length * combos.length;
  for (const combo of combos) {
    const [skin, theme] = LOOK[combo.look];
    const view = `${combo.w}/${combo.text}/${combo.look}`;
    const primary = combo.w === WIDTHS[WIDTHS.length - 1] && combo.text === TEXTS[0] && combo.look === LOOKS[0];
    const shellView = combo.w === WIDTHS[0] || primary || combo.text !== TEXTS[0];
    const ctx = await browser.newContext({ viewport: { width: combo.w, height: combo.w < 600 ? 812 : 900 }, colorScheme: theme, reducedMotion: 'reduce' });
    await ctx.addInitScript(({ skin, theme, text, who }) => {
      try {
        localStorage.setItem('rs4-look-v', '2'); localStorage.setItem('rs4-skin', skin); localStorage.setItem('rs4-theme', theme);
        localStorage.setItem('rs7-a11y', JSON.stringify({ motion: 'off', text }));
        if (location.pathname.includes('/portfolio')) { sessionStorage.setItem('rs5-who', who); sessionStorage.setItem('rs5-me', who); }
        else if (sessionStorage.getItem('rs5-who') === who) { sessionStorage.removeItem('rs5-who'); sessionStorage.removeItem('rs5-me'); }
      } catch (_) { /* storage off */ }
    }, { skin, theme, text: TEXT_NAME[combo.text] || 'default', who: 'sam' });
    const queue = [...pages];
    const worker = async () => {
      const page = await ctx.newPage();
      const errs = [];
      page.on('console', (m) => { if (m.type() === 'error') errs.push({ kind: 'console', text: m.text().slice(0, 240) }); });
      page.on('pageerror', (e) => errs.push({ kind: 'exception', text: String(e.message || e).split('\n')[0].slice(0, 240) }));
      page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(BASE)) errs.push({ kind: 'request', text: `${r.status()} ${r.url().slice(BASE.length)}` }); });
      while (queue.length) {
        const [id, path] = queue.shift();
        errs.length = 0;
        try {
          try { await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 }); }
          catch (_) { await page.waitForTimeout(400); await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 }); }
          await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
          await page.waitForTimeout(350);
          await openDetails(page);
          await page.waitForTimeout(150);
          const m = await page.evaluate(measure);
          for (const x of m) findings.push({ ...x, page: path, view, state: 'load' });
          if (primary) {
            const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.href));
            for (const h of links) { try { const u = new URL(h); if (u.origin === new URL(BASE).origin && !distHas(u.pathname)) { const e = hrefs.get(u.pathname) || { href: u.pathname, from: new Set() }; e.from.add(path); hrefs.set(u.pathname, e); } } catch (_) { /* odd href */ } }
          }
          // The shell's menus on two pages per view; the page's own parts (filters, tabs) on every page once.
          if (shellView && (path === '/' || path === '/portfolio/') || primary) {
            const f = await interact(page, errs);
            for (const x of f) findings.push({ ...x, page: path, view });
          }
        } catch (e) {
          errs.push({ kind: 'load', text: e.message.split('\n')[0] });
        }
        for (const e of errs) errors.push({ ...e, page: path, view });
        done++;
        if (done % 50 === 0) console.log(`  ${done}/${total} (${Math.round((Date.now() - t0) / 1000)} s)`);
      }
      await page.close();
    };
    await Promise.all(Array.from({ length: WORKERS }, worker));
    await ctx.close();
  }
  await browser.close();

  // ---------- Rank ----------
  const groups = new Map();
  const intentional = (s) => INTENTIONAL.find(([p]) => s.startsWith(p));
  for (const f of findings) {
    if (intentional(f.sig)) continue;
    const key = `${f.type}|${f.sig}${f.by ? ' in ' + f.by : ''}${f.with ? ' x ' + f.with : ''}`;
    const g = groups.get(key) || { type: f.type, sig: f.sig, by: f.by, with: f.with, severity: SEVERITY[f.type] || 1, count: 0, pages: new Set(), views: new Set(), states: new Set(), sample: f.text, px: 0 };
    g.count++; g.pages.add(f.page); g.views.add(f.view); g.states.add(f.state);
    g.px = Math.max(g.px, Math.abs(f.px || 0), f.frac || 0);
    groups.set(key, g);
  }
  // Console errors, grouped by message (numbers and ids folded).
  for (const e of errors) {
    const type = e.kind === 'request' ? 'request' : 'console';
    const msg = e.text.replace(/\d+/g, 'N').slice(0, 160);
    const key = `${type}|${e.kind}: ${msg}`;
    const g = groups.get(key) || { type, sig: `${e.kind}: ${e.text.slice(0, 160)}`, severity: SEVERITY[type], count: 0, pages: new Set(), views: new Set(), states: new Set(), sample: e.after || 'load', px: 0 };
    g.count++; g.pages.add(e.page); g.views.add(e.view); g.states.add(e.after || 'load');
    groups.set(key, g);
  }
  const links = staticLinks();
  for (const [h, e] of hrefs) if (!links.some((l) => l.href === h)) links.push({ href: h, from: [...e.from].slice(0, 5), count: e.from.size, runtime: true });
  for (const l of links) groups.set(`link|${l.href}`, { type: 'link', sig: l.href, severity: SEVERITY.link, count: l.count || 1, pages: new Set(l.from), views: new Set(['static']), states: new Set([l.runtime ? 'script' : 'html']), sample: '', px: 0 });

  const ranked = [...groups.values()].map((g) => ({ ...g, score: g.count * g.severity, pages: [...g.pages].slice(0, 12), pageCount: g.pages.size, views: [...g.views].slice(0, 18), viewCount: g.views.size, states: [...g.states] }))
    .sort((a, b) => b.score - a.score || b.pageCount - a.pageCount);
  const byType = {};
  for (const g of ranked) { byType[g.type] = byType[g.type] || { distinct: 0, occurrences: 0 }; byType[g.type].distinct++; byType[g.type].occurrences += g.count; }
  const total_ = ranked.reduce((s, g) => s + g.count, 0);
  const summary = { when: new Date().toISOString(), base: BASE, pages: pages.length, views: combos.length, loads: total, distinct: ranked.length, occurrences: total_, weighted: ranked.reduce((s, g) => s + g.score, 0), byType };

  const dir = repoNotes();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'glitches.json'), JSON.stringify({ summary, ranked }, null, 1));
  const md = [
    '# Glitches', '',
    `Glitch check (tools/glitch-check.mjs, \`npm run glitch\`), ${summary.when.slice(0, 16).replace('T', ' ')}. ${pages.length} pages, ${combos.length} views each (${WIDTHS.join(', ')} px; text ${TEXTS.join(', ')}; ${LOOKS.join(', ')}).`, '',
    `**${summary.distinct} distinct glitches, ${summary.occurrences} occurrences, weighted score ${summary.weighted}.**`, '',
    '| Type | Distinct | Occurrences |', '|---|---:|---:|',
    ...Object.entries(byType).sort((a, b) => b[1].occurrences - a[1].occurrences).map(([t, v]) => `| ${t} | ${v.distinct} | ${v.occurrences} |`), '',
    '## Top 40 (count x severity)', '',
    '| # | Score | Type | Where | Pages | Views | Sample |', '|---:|---:|---|---|---:|---:|---|',
    ...ranked.slice(0, 40).map((g, i) => `| ${i + 1} | ${g.score} | ${g.type} | \`${(g.sig + (g.by ? ' in ' + g.by : '') + (g.with ? ' x ' + g.with : '')).replace(/\|/g, '\\|')}\`${g.states.some((s) => s !== 'load') ? ' (' + g.states.join(', ') + ')' : ''} | ${g.pageCount} (${g.pages.slice(0, 2).join(', ')}) | ${g.viewCount} | ${String(g.sample || '').replace(/\|/g, '/').slice(0, 40)}${g.px ? ` (${g.px})` : ''} |`), '',
    `The full list is in glitches.json beside this file.`, '',
  ].join('\n');
  writeFileSync(join(dir, 'GLITCHES.md'), md);
  console.log(`\n${summary.distinct} distinct glitches, ${summary.occurrences} occurrences, weighted ${summary.weighted}. ${Math.round((Date.now() - t0) / 1000)} s.`);
  for (const [t, v] of Object.entries(byType)) console.log(`  ${t.padEnd(14)} ${String(v.distinct).padStart(4)} distinct  ${String(v.occurrences).padStart(6)} times`);
  console.log(`Report: ${join(dir, 'GLITCHES.md')}`);
}

await main();
