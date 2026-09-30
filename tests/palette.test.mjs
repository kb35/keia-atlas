// The palette (⌘K; SearchOverlay.astro): three modes on the first character, results from the in-memory index, and
// verbs that are only ever the page's own buttons.
//
// Always on the made-up index of the real one's size (tests/helpers/palette-index.mjs), so the answer does not change
// with the build. The 50 ms speed budget is a wall-clock check, so it runs on its own: `npm run perf`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, search } from '../src/lib/search-query.mjs';
import { VERBS, verbRows, matchVerbs, matchPeople, paletteMode } from '../src/lib/verbs.mjs';
import { bigIndex, QUERIES, MAY_BE_EMPTY } from './helpers/palette-index.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const I = load(bigIndex());

test('each query a person types finds its first row in the in-memory index', () => {
  for (const q of QUERIES) {
    const R = search(I, q);
    const first = R.top[0] ?? R.groups[0]?.items[0];
    if (!MAY_BE_EMPTY.has(q)) assert.ok(first, `"${q}" finds something`);
  }
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

test('Do mode finds people to view as by first name, surname, role or place, and "view as" on its own lists all', async () => {
  const { PEOPLE } = await import('../src/lib/demo.mjs');
  const people = [{ id: 'everyone', name: 'Everyone (overview)', role: 'Every role at once', where: 'Every role at once' },
    ...PEOPLE.map((p) => ({ id: p.id, name: p.name, role: p.role, where: p.where }))];
  const ids = (q) => matchPeople(people, q).map((p) => p.id);
  assert.equal(ids('liam')[0], 'liam', '">liam" finds Liam first');
  assert.equal(ids('view as liam')[0], 'liam');
  assert.equal(ids('View as Anna')[0], 'anna', 'case does not matter');
  assert.equal(ids('byrne')[0], 'anna', 'a surname works');
  assert.equal(ids('tomas')[0], 'tomas', 'accents do not matter');
  assert.ok(ids('technician dublin').includes('liam') && ids('technician dublin').length === 1, 'a role and a place together narrow to one');
  assert.equal(ids('view as').length, people.length, '"view as" on its own lists everyone');
  assert.deepEqual(ids(''), [], 'nothing typed lists no one, so the page\'s verbs come first');
  assert.deepEqual(ids('take'), [], 'a verb is not a person');
  assert.equal(ids('everyone')[0], 'everyone');
});

test('View as is one picker: every way in opens it, and it keeps the Shell\'s storage', () => {
  const va = readFileSync(join(ROOT, 'src/components/ViewAs.astro'), 'utf8');
  const shell = readFileSync(join(ROOT, 'src/layouts/Shell.astro'), 'utf8');
  assert.ok(/<ViewAs \/>/.test(shell), 'the Shell draws it on every page');
  assert.ok(/data-acct-menu/.test(shell) && /data-open-viewas/.test(shell), 'the name in the sidebar and the ribbon open it');
  assert.ok(/data-open-viewas/.test(readFileSync(join(ROOT, 'src/components/Settings.astro'), 'utf8')), 'Settings opens it (the way in on a phone)');
  assert.ok(/W\.rsPickWho\(id\)/.test(va), 'choosing goes through rsPickWho, so Home changes in place and the per-window storage is kept');
  assert.ok(!/sessionStorage\.setItem\('rs5-who'/.test(va), 'it never writes the person itself');
  assert.ok(!/class="vp-people"[^>]*style=/.test(va), 'no fixed heights on the people panels');
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
