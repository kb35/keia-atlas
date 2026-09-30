// Capabilities (src/lib/modules.mjs; Keith's rule of 30 Sept 2026: the bigger items are switched on when they are
// needed, so nothing ever looks missing). One registry is the source of truth; a capability is off with its module
// and with anything it requires; what it marks leaves the page with no heading or count left behind.
//
// The browser check (an off capability takes its section, heading and figure with it) runs when Playwright with
// WebKit can be found, the same way tools/responsive-check.mjs finds it, and is skipped otherwise.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MODULES, MODULE_STATES, CAPABILITIES, CAPABILITY_IDS, CAPABILITY_DEFAULTS, resolveFeatures, readFeatures, featureAttrs, featureOn, featureCss, featureAnyCss, offBecause } from '../src/lib/modules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });

// The sections the overlooked batch added, registered in modules.mjs with `helper: true`.
const HELPER_IDS = ['warranty', 'oncall', 'circuits', 'comms-environment', 'repeat-faults', 'room-accessibility', 'cable-tests', 'certified-platforms', 'change-windows'];
// The capabilities built behind their switches in this change, with their defaults.
const BUILT = { licences: 'on', maintenance: 'on', 'out-of-service': 'on', alerts: 'connected', credentials: 'off', cves: 'on', 'config-backups': 'connected', 'meeting-quality': 'connected' };

test('the registry: unique ids, a real module, a valid default, a source, and requires that exist', () => {
  const mods = new Set(MODULES.map((m) => m.id));
  const states = new Set(MODULE_STATES.map((s) => s.id));
  assert.equal(new Set(CAPABILITY_IDS).size, CAPABILITY_IDS.length, 'ids are unique');
  for (const c of CAPABILITIES) {
    assert.match(c.id, /^[a-z][a-z-]*$/, `${c.id}: a lower-case word`);
    assert.ok(!mods.has(c.id), `${c.id}: not also a module id`);
    assert.ok(mods.has(c.module), `${c.id}: module ${c.module} exists`);
    assert.ok(states.has(c.state), `${c.id}: default ${c.state} is On, Connected or Off`);
    assert.ok(c.label && c.what && c.source, `${c.id}: has a label, a line and a source`);
    assert.ok(c.what.length <= 80, `${c.id}: its line fits one row in Settings`);
    for (const r of c.requires ?? []) assert.ok(mods.has(r) || CAPABILITY_IDS.includes(r), `${c.id}: requires ${r}, which exists`);
  }
  for (const [id, st] of Object.entries(BUILT)) assert.equal(CAPABILITY_DEFAULTS[id], st, `${id} defaults to ${st}`);
});

test('the overlooked batch\'s sections are registered in the one capability list, and there is no second list', () => {
  for (const id of HELPER_IDS) {
    const c = CAPABILITIES.find((x) => x.id === id);
    assert.ok(c, `${id} is registered in src/lib/modules.mjs`);
    assert.ok(c.helper, `${id} is marked as another change's section`);
  }
  assert.ok(!existsSync(join(ROOT, 'src/lib/features-added.mjs')), 'CAPABILITIES in modules.mjs is the only list of capabilities');
  const lib = readdirSync(join(ROOT, 'src/lib')).filter((n) => /\.m?js$/.test(n) && n !== 'modules.mjs');
  const second = lib.filter((n) => /export const (FEATURES|CAPABILIT)[A-Z_]*\s*=\s*\[/.test(readFileSync(join(ROOT, 'src/lib', n), 'utf8')));
  assert.deepEqual(second, [], 'no second list of capabilities');
  assert.equal(CAPABILITY_DEFAULTS.engagements, 'on', 'service-provider engagements, under Vendors, on by default');
});

test('requires cascades: a module Off takes its capabilities, and a capability waits for what it requires', () => {
  const d = readFeatures(null, null);
  assert.deepEqual(d, CAPABILITY_DEFAULTS, 'with nothing chosen, every capability is at its default');
  // A module Off: every capability in it is off, whatever was chosen.
  const a = readFeatures({ assets: 'off' }, { credentials: 'on', licences: 'connected' });
  for (const c of CAPABILITIES.filter((x) => x.module === 'assets')) assert.equal(a[c.id], 'off', `${c.id} is off with Assets`);
  assert.equal(a.alerts, 'connected', 'another module\'s capabilities keep their state');
  // Requires a module in another place: alerts need Services, room checks and out of service need Locations,
  // on-call needs Support.
  assert.equal(readFeatures({ services: 'off' }, null).alerts, 'off');
  const loc = readFeatures({ locations: 'off' }, null);
  assert.equal(loc.maintenance, 'off'); assert.equal(loc['out-of-service'], 'off');
  assert.equal(readFeatures({ support: 'off' }, null).oncall, 'off');
  assert.equal(readFeatures({ support: 'connected' }, null).oncall, 'on', 'Connected is not off');
  // Says why.
  const mods = { ...Object.fromEntries(MODULES.map((m) => [m.id, 'on'])), services: 'off' };
  assert.equal(offBecause('alerts', mods, readFeatures(mods, null)), 'services');
  assert.equal(offBecause('licences', mods, readFeatures(mods, null)), null);
  // A capability that requires another capability goes off with it, through a chain, and a loop is off.
  const caps = [
    { id: 'a', module: 'm', state: 'on' },
    { id: 'b', module: 'm', state: 'connected', requires: ['a'] },
    { id: 'c', module: 'n', state: 'on', requires: ['b'] },
    { id: 'x', module: 'n', state: 'on', requires: ['y'] },
    { id: 'y', module: 'n', state: 'on', requires: ['x'] },
  ];
  assert.deepEqual(resolveFeatures(caps, { m: 'on', n: 'on' }, null), { a: 'on', b: 'connected', c: 'on', x: 'off', y: 'off' });
  assert.deepEqual(resolveFeatures(caps, { m: 'on', n: 'on' }, { a: 'off' }), { a: 'off', b: 'off', c: 'off', x: 'off', y: 'off' });
  assert.equal(resolveFeatures(caps, { m: 'off', n: 'on' }, null).c, 'off', 'a module Off reaches through the chain');
  // A stale or broken choice falls back to the default.
  assert.equal(readFeatures(null, { licences: 'sideways', gone: 'off' }).licences, 'on');
});

test('the lists on <html>, and featureOn when the site is built', () => {
  const attrs = featureAttrs(readFeatures(null, null));
  assert.equal(attrs.off, 'credentials');
  assert.deepEqual(attrs.conn.split(' ').sort(), ['alerts', 'config-backups', 'meeting-quality']);
  assert.equal(featureOn('licences'), true);
  assert.equal(featureOn('credentials'), false);
  assert.equal(featureOn('alerts'), true, 'Connected counts as on');
  assert.throws(() => featureOn('nothing-like-this'));
  const css = featureCss(['licences']);
  assert.ok(css.includes(':root[data-feat-off~="licences"] [data-feature~="licences"]{display:none!important}'));
  assert.ok(css.includes(':is(.sec,[data-feat-wrap]):has(> [data-feature~="licences"])'), 'a section of only gated content goes too');
  assert.ok(css.includes('[data-feat-src~="licences"]'), 'the source mark shows only while Connected');
});

test('every capability named in src/ is registered (data-feature, data-feat-src, feature props and rsFeatureOn)', () => {
  const bad = [];
  const known = new Set(CAPABILITY_IDS);
  for (const f of walk(join(ROOT, 'src')).filter((f) => /\.(astro|mjs|js)$/.test(f))) {
    const src = readFileSync(f, 'utf8');
    const found = [
      ...[...src.matchAll(/data-(?:feature|feat-src|feat-offshow|feat-any)=["']([a-z -]+)["']/g)].flatMap((m) => m[1].split(/\s+/)),
      ...[...src.matchAll(/\bfeature(?:On)?\(\s*'([a-z-]+)'/g)].map((m) => m[1]),
      ...[...src.matchAll(/\brsFeature(?:On)?\(\s*'([a-z-]+)'/g)].map((m) => m[1]),
      ...[...src.matchAll(/\bfeature: '([a-z-]+)'/g)].map((m) => m[1]),
      ...[...src.matchAll(/<FeatureSource id="([a-z-]+)"/g)].map((m) => m[1]),
    ];
    for (const id of found) if (id && !known.has(id)) bad.push(`${id} in ${relative(ROOT, f)}`);
  }
  assert.deepEqual(bad, []);
});

test('Settings › Modules nests each capability under its module, with On, Connected and Off', () => {
  const s = readFileSync(join(ROOT, 'src/components/SettingsModules.astro'), 'utf8');
  assert.ok(/data-caps-of=\{m\.id\}/.test(s) && /data-cap=\{c\.id\}/.test(s), 'the capabilities are listed under their module');
  assert.ok(!/overflow(-y)?:\s*(auto|scroll)/.test(s), 'no box of its own that scrolls');
  const shell = readFileSync(join(ROOT, 'src/layouts/Shell.astro'), 'utf8');
  assert.ok(/data-feat-off/.test(shell) && /rs6-features/.test(shell), 'applied before first paint in the page head');
  assert.ok(/rsSetFeature[\s\S]{0,600}rsChange\(/.test(shell), 'a switch changes the page through rsChange');
});

// ---- In a browser: an off capability leaves no heading or count behind ------------------------------------------
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
const browser = await loadPlaywright();

const FIXTURE = `<!doctype html><html><head><style>${featureCss()}${featureAnyCss(['licences', 'maintenance'])}</style></head><body><main>
  <section class="sec" id="s-any" data-feat-any="licences maintenance"><header class="section-head"><h2 id="h-any">Upkeep</h2></header><div class="cap-grid"><div data-feature="licences">L</div><div data-feature="maintenance">M</div></div></section>
  <section class="band"><ul class="kn">
    <li id="kn-units">12 units</li><li id="kn-lic" data-feature="licences">3 renewing</li>
  </ul><p id="answer">All units in service<span id="ans-lic" data-feature="licences"> · 3 licences renew in 30 days</span></p></section>
  <section class="sec" id="s-lic"><header class="section-head"><h2 id="h-lic">Licences</h2></header><div data-feature="licences">list</div><script>1</script></section>
  <section class="sec" id="s-mixed"><header class="section-head"><h2 id="h-mixed">This space</h2></header><div data-feature="licences">licences</div><div id="plain">the rest</div></section>
  <section class="sec" id="s-self" data-feature="licences"><h2 id="h-self">Renewals</h2></section>
  <div class="g12" data-feat-wrap id="wrap"><div class="card" data-feature="licences"><h3 id="h-card">Licence</h3></div></div>
  <span id="src" data-feat-src="licences">from the licence portals</span>
  <p id="offshow" data-feat-offshow="licences">Licences are switched off</p>
</main></body></html>`;

test('an off capability leaves no heading or count behind; On shows everything; Connected shows its source', { skip: !browser && 'Playwright with WebKit not found' }, async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(FIXTURE);
    const shown = (ids) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, (() => { const el = document.getElementById(id); return !!el && el.getClientRects().length > 0; })()])), ids);
    const IDS = ['kn-units', 'kn-lic', 'ans-lic', 's-lic', 'h-lic', 's-mixed', 'h-mixed', 'plain', 's-self', 'h-self', 'wrap', 'h-card', 'src', 'offshow'];
    const set = (off, conn) => page.evaluate(([o, c]) => { document.documentElement.setAttribute('data-feat-off', o); document.documentElement.setAttribute('data-feat-conn', c); }, [off, conn]);

    await set('credentials', '');
    let v = await shown(IDS);
    for (const id of IDS.filter((x) => !['src', 'offshow'].includes(x))) assert.equal(v[id], true, `${id} shows while Licences is On`);
    assert.equal(v.src, false, 'no source mark while On'); assert.equal(v.offshow, false);

    await set('credentials', 'licences');
    v = await shown(['src', 'kn-lic']);
    assert.equal(v.src, true, 'the source mark shows while Connected'); assert.equal(v['kn-lic'], true);

    await set('credentials licences', '');
    v = await shown(IDS);
    assert.equal(v['kn-lic'], false, 'the count leaves the band');
    assert.equal(v['ans-lic'], false, 'the answer no longer mentions it');
    assert.equal(v['s-lic'], false, 'a section of only its content goes'); assert.equal(v['h-lic'], false, 'with its heading');
    assert.equal(v['s-self'], false); assert.equal(v['h-self'], false);
    assert.equal(v.wrap, false, 'a box marked data-feat-wrap goes when all it holds is gated'); assert.equal(v['h-card'], false);
    assert.equal(v['s-mixed'], true, 'a section with other content stays'); assert.equal(v['h-mixed'], true); assert.equal(v.plain, true);
    assert.equal(v['kn-units'], true); assert.equal(v.src, false); assert.equal(v.offshow, true);
    // A section holding two capabilities' cards stays while either is on, and goes with its heading when both are off.
    assert.equal((await shown(['h-any']))['h-any'], true, 'one of its two is still on');
    await set('credentials licences maintenance', '');
    v = await shown(['s-any', 'h-any']);
    assert.equal(v['s-any'], false); assert.equal(v['h-any'], false);
  } finally {
    await page.close();
  }
});

test.after(async () => { if (browser) await browser.close(); });
