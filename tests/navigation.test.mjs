// Navigation v2 (BUILD-PLAN round V2): modules drive the sidebar, the path is the zoom, springs never overshoot,
// old place addresses still work, and no stage ladder is left anywhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsDist } from './helpers/dist.mjs';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES, MODULE_DEFAULTS, readModules, moduleAttrs } from '../src/lib/modules.mjs';
import { zoomLevel, pageLevel, zoomDir } from '../src/lib/zoom-level.mjs';
import { spring, springEasing, retarget } from '../src/lib/spring.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const shell = read('src/layouts/Shell.astro');
const nav = shell.slice(shell.indexOf('const NAV = ['), shell.indexOf('const parent = NAV'));
const places = [...nav.matchAll(/^  \{ id: '([a-z-]+)', label: '([^']+)'/gm)].map((m) => ({ id: m[1], label: m[2] }));

test('the sidebar: Home, the modules in their fixed order, then Learn and Method below the rule', () => {
  const staff = places.map((p) => p.id).filter((id) => !['vendor', 'vschedule', 'portfolio', 'ops'].includes(id));
  assert.deepEqual(staff, ['home', 'locations', 'services', 'assets', 'support', 'projects', 'vendors', 'team', 'knowledge', 'learn', 'method']);
  assert.deepEqual(MODULES.map((m) => m.id), ['locations', 'services', 'assets', 'support', 'projects', 'vendors', 'team', 'knowledge']);
  for (const m of MODULES) assert.equal(places.find((p) => p.id === m.id)?.label, m.label, `${m.id} is a place with the same name`);
  assert.ok(!/ROLE_NAV|roleCss/.test(shell), 'role no longer re-orders the sidebar');
  assert.ok(!/'Work'|'Devices'/.test(nav.replace(/PLACE_WORDS.*$/m, '')), 'Work and Devices are gone as places');
});

test('modules: each is On, Connected or Off; a stale or broken choice falls back to the default', () => {
  assert.equal(MODULE_DEFAULTS.support, 'connected');
  assert.ok(MODULES.every((m) => m.source && m.what), 'each module can be connected, and says what it holds');
  const m = readModules({ vendors: 'off', team: 'sideways', support: 'on', gone: 'off' });
  assert.equal(m.vendors, 'off'); assert.equal(m.team, 'on'); assert.equal(m.support, 'on'); assert.ok(!('gone' in m));
  assert.deepEqual(readModules(null), MODULE_DEFAULTS);
  assert.deepEqual(moduleAttrs({ vendors: 'off', team: 'off' }), { off: 'vendors team', conn: 'support' });
});

test('the zoom levels from an address, and which moves are a zoom', () => {
  assert.equal(zoomLevel('/locations/'), 0);
  assert.equal(zoomLevel('/locations/emea/'), 1);
  assert.equal(zoomLevel('/locations/dub/'), 2);
  assert.equal(zoomLevel('/locations/dub/', '?floor=3'), 3);
  assert.equal(zoomLevel('/rooms/dub-3-09/'), 4);
  assert.equal(zoomLevel('/rooms/overview/'), null);
  assert.equal(zoomLevel('/device/', '?tag=AG-000473'), 5);
  assert.equal(zoomLevel('/device/', '?tag=AG-000473', '#port-lan-1'), 6);
  assert.equal(zoomLevel('/device/'), null, 'the unit search is not on the zoom');
  assert.equal(zoomLevel('/support/'), null);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(pageLevel), [0, 1, 2, 2, 3, 4, 4]);
  assert.equal(zoomDir(2, 4), 'in', 'office to space');
  assert.equal(zoomDir(3, 4), 'in', 'a floor to one of its spaces');
  assert.equal(zoomDir(4, 3), 'out', 'a space up to its floor');
  assert.equal(zoomDir(4, 5), 'in');
  assert.equal(zoomDir(1, 4), null, 'two levels at once (the palette) is the ordinary page move');
  assert.equal(zoomDir(null, 4), null);
});

test('springs settle on time and never overshoot; a retargeted one keeps its speed', () => {
  const s = spring({ duration: 360, bounce: 0 });
  assert.equal(s.at(0), 0);
  assert.equal(s.at(360), 1);
  let prev = 0;
  for (let t = 0; t <= 360; t += 6) { const v = s.at(t); assert.ok(v >= prev - 1e-9 && v <= 1 + 1e-9, `no overshoot at ${t} ms`); prev = v; }
  assert.ok(s.at(359) > 0.99, 'within a hair of the target at the end');
  const e = springEasing({ duration: 360, bounce: 0 });
  assert.ok(/^linear\(0, [\d., ]+, 1\)$/.test(e), e);
  const mid = retarget({ s, t0: 0 }, 100);
  assert.ok(mid.at > 0 && mid.at < 1 && mid.speed > 0, 'mid-move: part of the way, still moving');
  const again = spring({ duration: 360, velocity: mid.speed });
  assert.ok(again.speed(0) > 0 && Math.abs(again.speed(0) - mid.speed) < 1e-9, 'the next move starts at that speed');
});

test('old place addresses send you on: /work/ to Support, /devices/overview/ to Assets', () => {
  assert.match(read('src/pages/work/index.astro'), /<Moved to="\/support\/" \/>/);
  assert.match(read('src/pages/devices/overview.astro'), /<Moved to="\/assets\/" \/>/);
  assert.match(shell, /'\/work\/': '\/support\/', '\/devices\/overview\/': '\/assets\/'/);
  assert.ok(existsSync(join(ROOT, 'src/pages/support/index.astro')) && existsSync(join(ROOT, 'src/pages/assets/index.astro')));
});

test('no stage ladder is left: no stage selector, no "N of 6", no rs4-stage', () => {
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const hits = [];
  for (const f of walk(join(ROOT, 'src')).filter((f) => /\.(astro|mjs|js|css)$/.test(f))) {
    const src = readFileSync(f, 'utf8');
    for (const re of [/\b\d of 6\b/, /STAGES_DEMO/, /rsSetStage/, /name="stage"/, /data-stage-n/]) if (re.test(src)) hits.push(`${re} in ${relative(ROOT, f)}`);
  }
  assert.deepEqual(hits, []);
});

test('built pages: a space\'s path is the zoom trail, and the palette carries its modes (runs when dist/ exists)', { skip: needsDist() }, () => {
  const html = read('dist/rooms/dub-3-09/index.html');
  const crumbs = /<nav class="crumbs"[^>]*>([\s\S]*?)<\/nav>/.exec(html)[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.equal(crumbs, 'Locations / EMEA / Dublin office / Third floor / 3.09 Whooper Swan');
  assert.match(html, /data-zoom/);
  assert.match(html, /\?floor=3/);
  assert.match(read('dist/index.html'), /--ease-spring:linear\(/);
});
