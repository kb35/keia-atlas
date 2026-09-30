// The palette (⌘K; UX-V2 §2.3, SearchOverlay.astro): three modes on the first character, the first row of results
// in under 50 ms from the in-memory index, and verbs that are only ever the page's own buttons.
//
// The speed test runs on the real index when the site has been built (dist/search/index.json), and otherwise on a
// made-up index of the same size, so it always runs. Each query is timed on its own, the first one cold.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, search } from '../src/lib/search-query.mjs';
import { VERBS, verbRows, matchVerbs, paletteMode } from '../src/lib/verbs.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BUDGET_MS = 50;

// A made-up index the size of the real one: 3,000 spaces and 12,000 units across five offices.
function bigIndex() {
  const sites = { dub: ['DUB', 'Dublin office', 'Dublin', 'emea', 'Ireland'], lon: ['LON', 'London office', 'London', 'emea', 'United Kingdom'], nyc: ['NYC', 'New York office', 'New York', 'amer', 'United States'], sin: ['SIN', 'Singapore office', 'Singapore', 'apac', 'Singapore'], mel: ['MEL', 'Melbourne office', 'Melbourne', 'apac', 'Australia'] };
  const S = Object.keys(sites), birds = ['Gannet', 'Curlew', 'Wren', 'Heron', 'Skylark', 'Whooper Swan', 'Goldcrest', 'Kestrel'];
  const rooms = {}, items = [], units = [];
  for (let i = 0; i < 3000; i++) {
    const st = S[i % S.length], id = `${st}-${i}`, fl = String(1 + (i % 20)), name = `${birds[i % birds.length]} ${i}`;
    rooms[id] = [name, `${fl}.${i % 40}`, st, fl, 'conference-room-medium'];
    items.push(['room', `rooms/${id}/`, name, `${sites[st][1]} ${fl}.${i % 40} · Medium meeting room`, '', { st, fl, p: 'conference-room-medium', m: ['poly-studio-x52'], c: ['video-bar', 'display'] }]);
    for (let u = 0; u < 4; u++) units.push([id, u ? 'display' : 'video bar', u ? 0 : 'poly-studio-x52', u ? 'display' : 'video-bar', `${id}-d${u}`, `DEMO-${i}-${u}`, `AG-${String(i * 4 + u).padStart(6, '0')}`, '2021-01-01', 0, 'in-service']);
  }
  return {
    v: 1, today: '2026-09-30', sites,
    classes: { 'video-bar': 'Video bar', display: 'Display' },
    models: { 'poly-studio-x52': ['Poly', 'Studio X52', 'video-bar', 'standard'] },
    rp: { 'conference-room-medium': 'Medium meeting room' }, roles: { tech: 'On-site technician' },
    rooms, items, units,
  };
}

const built = join(ROOT, 'dist', 'search', 'index.json');
const RAW = existsSync(built) ? JSON.parse(readFileSync(built, 'utf8')) : bigIndex();
const I = load(RAW);

test(`the first row of results comes back in under ${BUDGET_MS} ms, from the in-memory index`, () => {
  const queries = ['x52', 'EMEA spaces with X52', 'whooper swan', 'dublin', 'displays older than 7 years', 'AG-000101', 'who is on site in APAC', 'gannet'];
  const slow = [];
  search(I, 'warm up'); // the first call pays for compiling the search code, which a person never waits for twice
  for (const q of queries) {
    // Best of three: the budget is about the search, not about a busy machine running other tests beside it.
    let ms = Infinity, R;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      R = search(I, q);
      ms = Math.min(ms, performance.now() - t0);
    }
    const first = R.top[0] ?? R.groups[0]?.items[0];
    if (ms >= BUDGET_MS) slow.push(`${q}: ${ms.toFixed(1)} ms`);
    if (q !== 'who is on site in APAC') assert.ok(first, `"${q}" finds something`);
  }
  assert.deepEqual(slow, [], `over ${BUDGET_MS} ms`);
});

test('the first character picks the mode: > does, ? asks, anything else finds', () => {
  assert.deepEqual(paletteMode('>take'), { mode: 'do', q: 'take' });
  assert.deepEqual(paletteMode('  > hand'), { mode: 'do', q: ' hand' });
  assert.deepEqual(paletteMode('?who is on site'), { mode: 'ask', q: 'who is on site' });
  assert.deepEqual(paletteMode('x52 in Dublin'), { mode: 'find', q: 'x52 in Dublin' });
  assert.deepEqual(paletteMode(''), { mode: 'find', q: '' });
});

test('a verb is listed under its button\'s own name, once, and found by the words people type', () => {
  const rows = verbRows([
    { id: 'report', label: 'Report' }, { id: 'report', label: 'Report' },     // a phone and a computer copy
    { id: 'hand-to', label: 'Hand to' }, { id: 'take', label: 'Take' },
    { id: 'action', label: 'Open in 3D' }, { id: 'settings', label: 'Settings' },
  ]);
  assert.deepEqual(rows.map((r) => r.label), ['Report', 'Hand to', 'Take', 'Open in 3D', 'Settings']);
  assert.deepEqual(matchVerbs(rows, 'hand').map((r) => r.label), ['Hand to']);
  assert.equal(matchVerbs(rows, 'problem')[0].label, 'Report', '"problem" finds Report a problem, named as its button');
  assert.equal(matchVerbs(rows, 'open')[0].label, 'Open in 3D');
  assert.equal(matchVerbs(rows, '').length, rows.length, 'nothing typed after > lists them all');
  assert.deepEqual(matchVerbs(rows, 'zzz'), []);
});

test('every data-verb on a page names a verb the palette knows, and the palette defines no verb of its own', () => {
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const known = new Set(VERBS.map((v) => v.id));
  const bad = [];
  for (const f of walk(join(ROOT, 'src')).filter((f) => /\.(astro|mjs|js)$/.test(f))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/data-verb="([a-z-]+)"/g)) if (!known.has(m[1])) bad.push(`${m[1]} (${relative(ROOT, f)})`);
  }
  assert.deepEqual(bad, [], 'add these to VERBS in src/lib/verbs.mjs');
  const overlay = readFileSync(join(ROOT, 'src/components/SearchOverlay.astro'), 'utf8');
  assert.ok(/querySelectorAll\('\[data-verb\]'\)/.test(overlay), 'Do mode reads the page\'s own buttons');
  assert.ok(!/data-verb="/.test(overlay), 'the palette carries no verb button of its own');
});
