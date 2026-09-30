#!/usr/bin/env node
/* Drill-down audit (docs/rules/platform.md P10, docs/standards/page-anatomy.md): opens every page and lists
   each summary element (key number, "Show all", "See all", count, tile, matrix cell, chip) with what a click
   does: navigates (where, with which filters, and whether the destination shows the count the link promised),
   expands in place, opens a peek, or nothing. Flags every break of rule P10.

   Usage:
     node tools/drilldown-audit.mjs [--base http://127.0.0.1:4321/keia-atlas] [--out report.md] [--json f]
                                    [--only /work/,/incidents/]
   Needs Playwright with WebKit, found the way tools/responsive-check.mjs finds it (the npx cache). */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('base', 'http://127.0.0.1:4321/keia-atlas').replace(/\/$/, '');
const OUT = opt('out', '');
const JSON_OUT = opt('json', '');
const ONLY = opt('only', '').split(',').filter(Boolean);

// Every page, one record of each kind. `type` decides which rule applies: overview (summary pages), record
// (summary tiles of one thing), list (a list on its own page may expand in place).
const PAGES = [
  ['/', 'overview', 'Home'],
  ['/work/', 'overview', 'Work overview'],
  ['/work/list/', 'list', 'Work list'],
  ['/locations/', 'overview', 'Locations overview'], ['/locations/offices/', 'list', 'Offices'], ['/locations/emea/', 'overview', 'EMEA'], ['/locations/dub/', 'record', 'Dublin office'], ['/locations/lon/', 'record', 'London office'], ['/locations/emea/home-offices/', 'list', 'Home offices, EMEA'],
  ['/services/', 'overview', 'Services'], ['/services/av/', 'record', 'AV service'], ['/services/network/', 'record', 'Network service'], ['/services/infrastructure/', 'record', 'IT infrastructure service'],
  ['/known-issues/', 'list', 'Known errors'],
  ['/spares/dub/', 'record', 'Dublin IT store'],
  ['/devices/overview/', 'overview', 'Devices overview'],
  ['/usage/', 'list', 'Space usage'],
  ['/usage/equipment/', 'list', 'Equipment usage'],
  ['/work/schedule/?view=day', 'list', 'Schedule, Day'],
  ['/work/planning/', 'overview', 'Planning'],
  ['/projects/', 'list', 'Projects'],
  ['/projects/prj-09/', 'record', 'Project'],
  ['/projects/prj-09/integrate/', 'record', 'Project, Deploy'],
  ['/projects/prj-09/tasks/t-0901/', 'record', 'Task'],
  ['/incidents/', 'list', 'Incidents'],
  ['/incidents/inc0041121/', 'record', 'Incident'],
  ['/playbooks/', 'list', 'Playbooks'],
  ['/playbooks/av-refresh/', 'record', 'Playbook'],
  ['/refresh/', 'list', 'Work plan'],
  ['/lab/', 'list', 'Lab'],
  ['/changes/', 'list', 'Changes'],
  ['/rooms/', 'list', 'Spaces'],
  ['/rooms/dub-3-01/', 'record', 'Space'],
  ['/room-profiles/', 'list', 'Space types'],
  ['/room-profiles/conference-room-medium/', 'record', 'Space type'],
  ['/devices/', 'list', 'Units'],
  ['/device/?tag=AG-000593', 'record', 'Unit'],
  ['/profiles/', 'list', 'Device types'],
  ['/profiles/video-bar/poly-studio-x52/', 'record', 'Device type'],
  ['/models/', 'list', 'Models'],
  ['/models/brightline-px-4500/', 'record', 'Model'],
  ['/configurations/', 'list', 'Configurations'],
  ['/configurations/brightsign-xt1145-bsn-cloud/', 'record', 'Configuration'],
  ['/spares/', 'list', 'Spares'],
  ['/cables/', 'list', 'Cables'],
  ['/standards/cables/', 'list', 'Cable standard'],
  ['/team/', 'list', 'Team'],
  ['/vendors/', 'list', 'Vendors'],
  ['/vendor/', 'overview', 'Your installation (vendor)'],
  ['/learn/', 'list', 'Learn'],
  ['/about/', 'list', 'About'],
  ['/search/', 'list', 'Search'],
].filter(([p]) => !ONLY.length || ONLY.includes(p));

async function loadPlaywright() {
  const tries = [() => import('playwright')];
  if (process.env.PLAYWRIGHT) tries.push(() => import(join(process.env.PLAYWRIGHT, 'index.mjs')));
  const npx = join(homedir(), '.npm', '_npx');
  if (existsSync(npx)) for (const d of readdirSync(npx)) {
    const p = join(npx, d, 'node_modules', 'playwright', 'index.mjs');
    if (existsSync(p)) tries.push(() => import(p));
  }
  for (const t of tries) { try { const pw = await t(); return await pw.webkit.launch(); } catch (_) { /* next */ } }
  console.error('Playwright with WebKit was not found (see tools/responsive-check.mjs).');
  process.exit(2);
}

// ---- In the page: find the summary elements ------------------------------------------------------------
function collect() {
  const main = document.querySelector('main') || document.body;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[hidden]'); };
  const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  const sig = (el) => { const c = (e) => e.tagName.toLowerCase() + [...e.classList].filter((x) => !x.startsWith('astro-')).slice(0, 2).map((x) => '.' + x).join(''); return (el.parentElement ? c(el.parentElement) + ' > ' : '') + c(el); };
  const where = (el) => {
    const s = el.closest('section, .card, aside, details, table');
    const h = s && s.querySelector('h1, h2, h3, summary b, caption');
    if (el.closest('.band')) return 'Band';
    return h ? txt(h).slice(0, 40) : '';
  };
  const out = [];
  const seen = new Set();
  const push = (el, o) => { if (seen.has(el)) return; seen.add(el); out.push({ sig: sig(el), where: where(el), text: txt(el).slice(0, 80), ...o }); };
  const inBar = (el) => el.closest('.fb, [data-fb], nav, .mast, .side, .sec-tabs, [data-fb-facet], .dt-list, .crumbs, footer.site, dialog, .search-ov');
  // Key numbers.
  document.querySelectorAll('.band .kn-i').forEach((li) => {
    const a = li.querySelector('a');
    push(li, { kind: 'key number', href: a ? a.getAttribute('href') : null, plain: li.hasAttribute('data-kn-plain') ? li.getAttribute('data-kn-plain') || 'yes' : null });
  });
  // "Show all" buttons (Section, and home-made ones).
  main.querySelectorAll('[data-sa-btn], [data-show-all]:is(button), .sec-all, button').forEach((b) => {
    if (b.tagName !== 'BUTTON' || inBar(b) || !vis(b)) return;
    const t = txt(b);
    if (/^show (all|more)|^show fewer/i.test(t)) push(b, { kind: 'show all', action: 'expands in place', n: +(t.match(/[\d,]+/) || ['0'])[0].replace(/,/g, '') });
  });
  // Links and buttons that carry a count or say "see all" / "all ...".
  main.querySelectorAll('a[href], button').forEach((el) => {
    if (inBar(el) || !vis(el) || seen.has(el) || el.closest('.band .kn-i')) return;
    const t = txt(el);
    // A count: a number with words, not a date ("12 Feb") or a numbered step in a long sentence.
    const count = /(^|\s)\d[\d,]*(\s|$)/.test(t) && t.length <= (el.tagName === 'A' ? 90 : 60) && !/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(t);
    const seeAll = /^(see all|all |every |open (all|the)|show all|view all)|see (them|all)|all \w+ →?$/i.test(t);
    const cell = el.matches('[data-mx-cell], [data-peek]');
    if (!count && !seeAll && !cell) return;
    if (el.tagName === 'A') {
      const h = el.getAttribute('href') || '';
      const dn = el.querySelector('[data-dd-n]');
      push(el, { kind: seeAll ? 'see all' : cell ? 'chip or cell' : 'count link', href: h, peek: el.hasAttribute('data-peek'), ddn: dn ? txt(dn) : null });
    } else push(el, { kind: cell ? 'chip or cell' : seeAll ? 'see all' : 'count button', button: true, peek: el.hasAttribute('data-peek'), mode: el.closest('[data-dd]') ? el.closest('[data-dd]').dataset.dd : '' });
  });
  // Numbers nobody can click: a figure in a tile, a card or a summary, not inside a link or button. Left out, as
  // they count nothing that lives elsewhere: the key of a drawing (.rk-no), outlet and port counts in a drawing or
  // its table, step numbers, a board column's own count (.col-h), the settings summary of a configuration.
  const FACTS = '.rk-no, .oc-n, .cws-steps, .cws-n, .st-n, .mdl-ports, .col-h, .at-arch, table tbody td, [data-dd-fact]';
  main.querySelectorAll('b, strong, .num, .n, .big, .stat b, .tile b, td.mx-tot, [data-ctot], [data-gtot]').forEach((el) => {
    if (inBar(el) || !vis(el) || el.closest('a, button, label, .kn-i, table.to-cards tbody, .tablewrap tbody, .mono, pre, code, [data-rc-ok]') || el.closest(FACTS) || el.matches(FACTS) || el.querySelector('a')) return;
    const t = txt(el);
    if (!/^\d[\d,]*$/.test(t)) return;
    const box = el.closest('.card, section, aside');
    if (!box) return;
    push(el, { kind: 'number', dead: true });
  });
  return out;
}

// ---- In the destination: what the list shows, and which filters it knows -----------------------------------
function destInfo() {
  const c = document.querySelector('[data-fb-count]');
  const facets = [...document.querySelectorAll('[data-fb-facet]')].map((f) => f.dataset.fbFacet);
  const toggles = [...document.querySelectorAll('[data-fb-toggle]')].map((f) => f.dataset.fbToggle);
  const active = {};
  const bar = document.querySelector('[data-fb]');
  if (bar && bar.rsFilter && bar.rsFilter.get) facets.forEach((k) => { const v = bar.rsFilter.get(k); if (v && v.length) active[k] = v; });
  return { count: c ? c.textContent.replace(/\s+/g, ' ').trim() : null, facets, toggles, active, title: (document.querySelector('#pb-title') || {}).textContent || document.title, path: location.pathname + location.search };
}

const NON_FILTER = new Set(['view', 'sort', 'q', 'd', 'tab', 'scope', 'tag', 'id', 'as', 'who', 'at']);
// A calendar's "N of M" counts people, not the items a link promises: its counts are not compared.
const NO_COUNT = (p) => p.startsWith('/work/schedule/');

async function main() {
  // WebKit can crash on a heavy page and takes the whole browser with it; the audit starts a fresh one and goes on.
  let browser, ctx, page = null, destPage = null;
  async function launch() {
    if (browser) { try { await browser.close(); } catch (_) { /* already gone */ } }
    browser = await loadPlaywright();
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    ctx.setDefaultTimeout(15000);
    page = await ctx.newPage(); destPage = null;
  }
  await launch();
  const rows = [];
  const destCache = new Map();
  async function dest(href) {
    if (process.env.AUDIT_DEBUG) console.log("  dest", href);
    if (destCache.has(href)) return destCache.get(href);
    let info = null;
    try {
      // One tab is reused for every destination (opening and closing hundreds of tabs is what brought WebKit down).
      destPage ??= await ctx.newPage();
      await destPage.goto(href, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await destPage.waitForSelector('[data-fb-count]', { timeout: 4000 }).catch(() => {});   // the filter bar starts after the page's scripts
      await destPage.waitForTimeout(300);
      info = await destPage.evaluate(destInfo);
    } catch (e) {
      info = { error: String(e).slice(0, 80) };
      if (!browser.isConnected() || /closed|crash/i.test(String(e))) { process.stdout.write('  (the browser closed; starting a new one)\n'); await launch(); }
    }
    destCache.set(href, info);
    return info;
  }
  for (const [path, type, name] of PAGES) {
    const url = BASE + path;
    // A page that loses its browser (a WebKit crash) is tried once more in a fresh one; a page that hangs is
    // given up after 150 s and marked NOT CHECKED, so one page can never hang the run.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const mark = rows.length;
      let timer, timedOut = false, crashed = false;
      const limit = new Promise((res) => { timer = setTimeout(() => { timedOut = true; rows.push({ page: name, path, type, error: 'timed out after 150 s' }); process.stdout.write(`${name}: TIMED OUT\n`); res(); }, 150000); });
      if (timedOut || !page || !browser.isConnected()) await launch();
      await Promise.race([auditPage(path, type, name, url, page).catch((e) => { if (!timedOut) { crashed = /closed|crash/i.test(String(e)); rows.push({ page: name, path, type, error: String(e).slice(0, 100) }); } }), limit]);
      clearTimeout(timer);
      if (timedOut) { await launch().catch(() => {}); break; }
      if (crashed && attempt === 1) { rows.length = mark; process.stdout.write(`${name}: the browser closed; trying again in a new one\n`); await launch(); continue; }
      break;
    }
  }
  async function auditPage(path, type, name, url, page) {
    try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); } catch (e) { rows.push({ page: name, path, type, error: String(e).slice(0, 100) }); return; }
    await page.waitForTimeout(900);
    const found = await page.evaluate(collect);
    // Group alike elements (a matrix of 200 cells is one row).
    const groups = new Map();
    for (const f of found) {
      // Key numbers and "see all" links one by one; a cell, a chip or a row that opens a record, by its kind.
      const own = f.kind === 'key number' || f.kind === 'see all' || f.kind === 'show all';
      const k = [f.kind, f.sig, f.where, f.button ? 'b' : 'a', f.dead ? 'd' : '', f.mode || '', own ? f.text + f.href : ''].join('|');
      if (!groups.has(k)) groups.set(k, { ...f, count: 0, examples: [] });
      const g = groups.get(k); g.count++; if (g.examples.length < 12) g.examples.push({ text: f.text, href: f.href, n: f.n, ddn: f.ddn });
    }
    for (const g of groups.values()) {
      const r = { page: name, path, type, kind: g.kind, where: g.where, count: g.count, text: g.examples.slice(0, 3).map((e) => e.text).join(' | ').slice(0, 120), href: g.examples[0].href, peek: g.peek };
      if (g.kind === 'show all') { r.action = 'expands in place'; r.n = Math.max(...g.examples.map((e) => e.n || 0)); }
      else if (g.dead) r.action = 'nothing';
      else if (g.kind === 'key number' && !g.href) { r.action = g.plain ? 'nothing (documented exception)' : 'nothing'; r.plain = g.plain; }
      else if (g.button && g.mode) r.action = `stays on the page by design (${g.mode})`;
      else if (g.button) {
        // Click one and see whether the address changes.
        const before = page.url();
        if (process.env.AUDIT_DEBUG) console.log("  click", g.examples[0].text);
        const loc = page.locator(`xpath=//button[normalize-space(.)=${JSON.stringify(g.examples[0].text)}]`).first();
        let after = before;
        try { await loc.click({ timeout: 3000 }); await page.waitForTimeout(700); after = page.url(); } catch (_) { /* could not click */ }
        r.action = after.split('#')[0] !== before.split('#')[0] && new URL(after).pathname !== new URL(before).pathname ? `navigates to ${new URL(after).pathname}` : 'stays on the page (in place)';
        if (after !== before) { try { await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(600); } catch (_) {} }
      } else if (g.href) {
        const h = g.href;
        if (h.startsWith('#')) r.action = 'jumps down this page';
        else {
          const abs = new URL(h, url);
          const samePage = abs.pathname === new URL(url).pathname;
          r.action = samePage ? 'filters this page' : 'navigates';
          r.to = abs.pathname.replace(/^\/keia-atlas/, '') + abs.search + (g.count > 1 ? ' (and alike)' : '');
          // Check the filters and the count of every example that has a query (a matrix: up to 12 cells).
          const checks = g.examples.filter((e, i) => e.href && (i === 0 || /[?]/.test(e.href)));
          const bad = [], unknown = new Set();
          let compared = 0;
          for (const e of checks) {
            const u = new URL(e.href, url);
            const d = await dest(u.href);
            if (!d || d.error) { if (d) r.destError = d.error; continue; }
            [...u.searchParams.keys()].filter((k) => !NON_FILTER.has(k)).forEach((k) => { if (!d.facets.includes(k) && !d.toggles.includes(k)) unknown.add(k); });
            // The number the link promises: the one it marks data-dd-n, else the first number in its words.
            const promised = e.ddn || (e.text.match(/(^|\s)(\d[\d,]*)(\s|$)/) || [])[2];
            const shown = d.count ? (d.count.match(/[\d,]+/) || [])[0] : null;
            // A link that jumps to a section of the destination (#health) points at that section, not at its list.
            const toSection = u.hash && u.hash !== '#units' && u.hash !== '#list';
            if (promised && shown && !toSection && !NO_COUNT(u.pathname.replace(/^\/keia-atlas/, ''))) {
              compared++;
              if (promised.replace(/,/g, '') !== shown.replace(/,/g, '')) bad.push(`${promised} vs ${shown}`);
            }
          }
          r.unknown = [...unknown];
          if (compared) r.match = bad.length ? `no (${bad.slice(0, 3).join(', ')})` : compared > 1 ? `yes (${compared} checked)` : 'yes';
        }
      } else r.action = 'nothing';
      // Verdict against rule P10.
      const v = [];
      const summary = type === 'overview' || type === 'record';
      if (r.action === 'nothing' && (summary || r.kind === 'key number')) v.push('dead click');
      if (r.action === 'expands in place' && type === 'overview') v.push('expands on an overview');
      if (r.action === 'expands in place' && type === 'record' && (r.n || 0) >= 20) v.push(`expands ${r.n} rows in a record`);
      if (r.action === 'stays on the page (in place)' && summary && /cell|count/.test(r.kind)) v.push('count does not navigate');
      if (r.unknown && r.unknown.length) v.push(`filter not applied: ${r.unknown.join(', ')}`);
      if (r.match && r.match.startsWith('no')) v.push(`count mismatch ${r.match.slice(3)}`);
      if (r.kind === 'see all' && summary && /^(see all|show all|view all|more)( \d[\d,]*)?$/i.test(r.text.trim())) v.push('link does not say where');
      r.verdict = v.length ? v.join('; ') : 'ok';
      rows.push(r);
    }
    process.stdout.write(`${name}: ${[...groups.values()].length} groups\n`);
  }
  await browser.close();
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(rows, null, 1));
  const bad = rows.filter((r) => r.verdict && r.verdict !== 'ok');
  const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
  const md = [
    `| Page | Where | Element (how many) | Says | Click does | Destination (filters) | Count matches | Verdict |`,
    `|---|---|---|---|---|---|---|---|`,
    ...rows.filter((r) => !r.error).map((r) => `| ${esc(r.page)} | ${esc(r.where)} | ${esc(r.kind)}${r.count > 1 ? ` (${r.count})` : ''}${r.peek ? ', hover peek' : ''} | ${esc(r.text.slice(0, 60))} | ${esc(r.action)} | ${esc(r.to ?? '')} | ${esc(r.match ?? '')} | ${r.verdict === 'ok' ? 'ok' : `**${esc(r.verdict)}**`} |`),
  ].join('\n');
  const summary = `Checked ${PAGES.length} pages, ${rows.length} groups of elements; ${bad.length} groups break rule P10 (${bad.reduce((n, r) => n + r.count, 0)} elements).`;
  if (OUT) writeFileSync(OUT, `${summary}\n\n${md}\n`);
  console.log(summary);
  for (const r of rows.filter((x) => x.error)) console.log(`  ${r.page}: NOT CHECKED (${r.error})`);
  for (const r of bad) console.log(`  ${r.page}: ${r.kind} "${r.text.slice(0, 50)}" -> ${r.verdict}`);
}
main();
