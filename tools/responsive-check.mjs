#!/usr/bin/env node
/* Responsive check (docs/rules/layout.md, L5 and L10): loads key pages at six widths and fails when
   a page scrolls sideways, when parts overlap, or when a label spills out of its box.

   Usage:
     node tools/responsive-check.mjs [--base http://127.0.0.1:4321/keia-atlas] [--only work,projects]
                                     [--widths 375,768,1024] [--shots dir] [--dark] [--all] [--who sam]
   Start a dev server first (npx astro dev --port <n>) or serve the built site (npm run preview:files),
   and pass its address with --base.

   Needs Playwright with WebKit. It is not in package.json on purpose (it is large); the script finds it:
     1. in node_modules (npm i -D playwright, then npx playwright install webkit), or
     2. at the path in PLAYWRIGHT (the playwright package folder), or
     3. in the npx cache (~/.npm/_npx/<hash>/node_modules/playwright), picking one whose WebKit is installed.

   What counts as a failure, per page and width:
     overflow   the page is wider than the window (it would scroll sideways). The elements that stick out
                are named. A wide table or drawing inside a box that scrolls sideways on its own is allowed (L5).
     overlap    two parts of the page's chrome sit on top of each other: band items, filter bar items, tabs,
                key numbers, buttons, headings.
     spill      a label is wider than its box (a squashed table heading, a tab, a button, a pill).
   Items the page marks data-rc-ok are skipped. --who opens every page as that person (View as), for the pages
   only some people see, such as a provider's own clients (--who sam --only portfolio,portfolio-client). */
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(`--${k}`);
const BASE = opt('base', 'http://127.0.0.1:4321/keia-atlas').replace(/\/$/, '');
const WIDTHS = opt('widths', '375,768,1024,1280,1440,1920').split(',').map(Number);
const ONLY = opt('only', '');
const SHOTS = opt('shots', '');
const DARK = flag('dark');
const WHO = opt('who', '');

// The pages to check: every archetype, and the pages most often used at small sizes.
const PAGES = [
  ['home', '/'],
  ['support', '/support/'],
  ['work-list', '/work/list/'],
  ['schedule-day', '/work/schedule/?view=day'],
  ['schedule-week', '/work/schedule/?view=week'],
  ['schedule-month', '/work/schedule/?view=month'],
  ['schedule-year', '/work/schedule/?view=year'],
  ['projects', '/projects/'],
  ['project', '/projects/prj-09/'],
  ['project-integrate', '/projects/prj-09/integrate/'],
  ['deliver-type', '/projects/prj-14/integrate/?by=type'], ['deliver-room', '/projects/prj-14/integrate/?by=room'], ['deliver-floor', '/projects/prj-14/integrate/?by=floor'],
  ['deliver-one', '/projects/prj-14/integrate/?by=one'], ['deliver-set', '/projects/prj-14/integrate/?by=set'],
  ['task', '/projects/prj-09/tasks/t-0901/'],
  ['incidents', '/incidents/'],
  ['incident', '/incidents/inc0041121/'],
  ['incident-known-issue', '/incidents/inc0041205/'],
  ['known-issues', '/known-issues/'],
  ['known-issue', '/known-issues/poly-tc10-restart/'],
  ['office-3d', '/locations/dub/3d/'],
  ['office-3d-plan', '/locations/dub/3d/?view=plan&sel=room:dub-3-05'],
  ['maker-case', '/known-issues/cases/mc-001/'],
  ['maker-case-new', '/known-issues/cases/new-poly-expansion-microphone--far-end-cannot-hear/'],
  ['playbooks', '/playbooks/'],
  ['playbook', '/playbooks/av-refresh/'],
  ['refresh', '/refresh/'],
  ['planning', '/work/planning/'],
  ['planning-scenarios', '/work/planning/#scenarios'],
  ['planning-capacity', '/work/planning/#capacity'],
  ['lab', '/lab/'],
  ['changes', '/changes/'],
  ['edit', '/edit/'],
  // Other places (owned by other helpers; checked with --all)
  ['locations', '/locations/'], ['offices', '/locations/offices/'], ['region', '/locations/emea/'], ['office', '/locations/dub/'], ['office-plain', '/locations/lon/'], ['home-offices', '/locations/emea/home-offices/'],
  ['services', '/services/'], ['service-av', '/services/av/'], ['service-network', '/services/network/'], ['service-infrastructure', '/services/infrastructure/'],
  ['spares', '/spares/'], ['store', '/spares/dub/'],
  ['assets', '/assets/', 'other'],
  ['rooms', '/rooms/', 'other'],
  ['room-profiles', '/room-profiles/', 'other'],
  ['devices', '/devices/', 'other'],
  ['unit', '/device/?tag=AG-000028', 'other'],
  ['profiles', '/profiles/', 'other'],
  ['models', '/models/', 'other'],
  ['model', '/models/poly-studio-x52/', 'other'], ['room', '/rooms/chi-12-01/', 'other'],
  ['team', '/team/', 'other'],
  ['vendors', '/vendors/', 'other'], ['vendor-record', '/vendors/keystone/', 'other'], ['vendors-access', '/vendors/access/', 'other'], ['vendor-job', '/vendor/jobs/inc0041214/', 'other'],
  // Organisations and engagements (docs/service-providers.md): the client's side, and the provider's own (--who sam).
  ['vendor-engagement', '/vendors/northlight/engagement/', 'other'],
  ['portfolio', '/portfolio/', 'other'], ['portfolio-client', '/portfolio/aigna-northlight/', 'other'], ['portfolio-client-fw', '/portfolio/fenwater-northlight/', 'other'], ['portfolio-engagement', '/portfolio/aigna-northlight/engagement/', 'other'],
  ['usage', '/usage/', 'other'],
  ['learn', '/learn/', 'other'],
  // The front door and the method pages
  ['welcome', '/welcome/'],
  ['method', '/method/'], ['method-building', '/method/start-from-the-building/'], ['method-capture', '/method/capture-dont-ask/'],
  ['method-answer', '/method/answer-first/'], ['method-own', '/method/own-it-hand-it-on/'], ['method-learn', '/method/learn-as-you-go/'],
  ['method-problems', '/method/problems/'], ['method-modules', '/method/modules/'], ['method-work', '/method/how-the-work-gets-done/'],
  ['method-trust', '/method/trust/'], ['method-words', '/method/words/'],
];

async function loadPlaywright() {
  const tries = [];
  tries.push(() => import('playwright'));
  if (process.env.PLAYWRIGHT) tries.push(() => import(join(process.env.PLAYWRIGHT, 'index.mjs')));
  const npx = join(homedir(), '.npm', '_npx');
  if (existsSync(npx)) for (const d of readdirSync(npx)) {
    const p = join(npx, d, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(p)) tries.push(() => import(p));
  }
  for (const t of tries) {
    try {
      const pw = await t();
      const b = await pw.webkit.launch();
      return { pw, browser: b };
    } catch (_) { /* next */ }
  }
  console.error('Playwright with WebKit was not found. Install it with: npm i -D playwright && npx playwright install webkit');
  process.exit(2);
}

// Runs in the page: measure and report problems.
function measure() {
  const W = document.documentElement.clientWidth;
  const out = { overflow: [], overlap: [], spill: [], docW: document.documentElement.scrollWidth, W };
  const vis = (el) => {
    if (el.closest('[data-rc-ok], [hidden], .sr-only, [aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0;
  };
  const name = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const c = [...el.classList].filter((x) => !x.startsWith('astro-')).slice(0, 3);
    if (c.length) s += '.' + c.join('.');
    const t = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return t ? `${s} "${t}"` : s;
  };
  // A box that scrolls sideways (or clips) on its own may hold wider things.
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
    }
    return false;
  };
  const fixedish = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const ps = getComputedStyle(p).position; if (ps === 'fixed') return true; } return false; };
  if (out.docW > W + 1) {
    const seen = [];
    // Anything that sticks out counts, even when it is invisible (a closed popover still widens the page).
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right <= W + 1 || r.width < 1 || clipped(el) || fixedish(el) || getComputedStyle(el).display === 'none') continue;
      if (seen.some((s) => s.contains(el))) continue;
      seen.push(el);
      out.overflow.push(`${name(el)} right=${Math.round(r.right)}`);
      if (seen.length > 6) break;
    }
  }
  // Overlap among the page's chrome.
  const groups = [
    '.band.pb .pb-main, .band.pb .kn-i, .band.pb .pb-act',
    '.fb .fb-search, .fb .fb-chip, .fb .fb-toggle, .fb .fb-clear:not([hidden]), .fb .fb-views, .fb .fb-count, .fb .fb-extra > *',
    '.sec-tabs a',
    '.dt-list .dt-tab',
    '.section-head > *, .sp-h > *',
  ];
  const inter = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2;
  for (const g of groups) {
    const els = [...document.querySelectorAll(g)].filter((e) => vis(e) && !fixedish(e));
    for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (inter(a.getBoundingClientRect(), b.getBoundingClientRect())) out.overlap.push(`${name(a)} x ${name(b)}`);
    }
  }
  // Labels wider than their box.
  const labels = 'th, .kn-i span, .fb-chip-btn, .fb-view, .dt-tab, .sec-tabs a, .btn, .pill, .tag, .fb-count, h1, h2, h3, [data-rc-label]';
  for (const el of document.querySelectorAll(labels)) {
    if (!vis(el) || fixedish(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis') continue;
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && cs.overflowX !== 'auto') out.spill.push(`${name(el)} ${el.scrollWidth}>${el.clientWidth}`);
    // A heading broken inside a word: one word per line at a width too small for the word.
    if (/^(TH|BUTTON)$/.test(el.tagName) || el.matches('.dt-tab, .sec-tabs a, [data-rc-label]')) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        const text = t.textContent.replace(/­/g, '').trim(); if (!text) continue;
        const words = text.split(/\s+/).length;
        const range = document.createRange(); range.selectNodeContents(t);
        const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
        if (lines > words) { out.spill.push(`${name(el)} word "${text.slice(0, 24)}" broken over ${lines} lines`); break; }
      }
    }
  }
  return out;
}

const { browser } = await loadPlaywright();
const list = PAGES.filter(([id, , who]) => (ONLY ? ONLY.split(',').includes(id) : flag('all') || who !== 'other'));
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let fails = 0;
const rows = [];
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 600 ? 812 : 900 }, colorScheme: DARK ? 'dark' : 'light', reducedMotion: 'reduce' });
  if (WHO) await ctx.addInitScript((w) => { try { sessionStorage.setItem('rs5-who', w); sessionStorage.setItem('rs5-me', w); } catch (_) {} }, WHO);
  const page = await ctx.newPage();
  for (const [id, path] of list) {
    try {
      // A page may still be finishing its own address change when the next one loads: try twice.
      try { await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 }); }
      catch (_) { await page.waitForTimeout(500); await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 }); }
      await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
      await page.waitForTimeout(350);
      const r = await page.evaluate(measure);
      const bad = r.overflow.length + r.overlap.length + r.spill.length > 0 || r.docW > r.W + 1;
      if (bad) fails++;
      rows.push({ id, w, ok: !bad, ...r });
      if (SHOTS) await page.screenshot({ path: join(SHOTS, `${id}-${w}${DARK ? '-dark' : ''}.png`), fullPage: true });
      const tag = bad ? 'FAIL' : 'ok  ';
      console.log(`${tag} ${String(w).padStart(4)}  ${id}${r.docW > r.W + 1 ? `  (page ${r.docW}px wide)` : ''}`);
      for (const k of ['overflow', 'overlap', 'spill']) for (const m of r[k].slice(0, 8)) console.log(`        ${k}: ${m}`);
    } catch (e) {
      fails++;
      console.log(`ERR  ${String(w).padStart(4)}  ${id}  ${e.message.split('\n')[0]}`);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${rows.filter((r) => r.ok).length} of ${rows.length} page widths pass.`);
process.exit(fails ? 1 : 0);
