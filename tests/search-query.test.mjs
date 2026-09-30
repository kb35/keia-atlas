// Tests for the search parser and ranking (src/lib/search-query.mjs).
//
// Uses a small hand-made index in the same compact shape the build writes to /search/index.json, so
// each test says exactly which rooms and devices should come back and why.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, parse, search, removeSpan, alternatives, editDistance } from '../src/lib/search-query.mjs';

const RAW = {
  v: 1,
  today: '2026-09-28',
  sites: {
    dub: ['DUB', 'Dublin office', 'Dublin', 'emea', 'Ireland'],
    lon: ['LON', 'London office', 'London', 'emea', 'United Kingdom'],
    nyc: ['NYC', 'New York office', 'New York', 'amer', 'United States'],
    sin: ['SIN', 'Singapore office', 'Singapore', 'apac', 'Singapore'],
    mel: ['MEL', 'Melbourne office', 'Melbourne', 'apac', 'Australia'],
  },
  classes: { 'video-bar': 'Video bar', codec: 'Video codec', display: 'Display', 'touch-controller': 'Touch controller', 'signage-player': 'Signage player' },
  models: {
    'poly-studio-x52': ['Poly', 'Studio X52', 'video-bar', 'standard'],
    'poly-studio-x32': ['Poly', 'Studio X32', 'video-bar', 'standard'],
    'poly-tc10': ['Poly', 'TC10', 'touch-controller', 'standard'],
    'kestrel-vc-300': ['Kestrel', 'VC-300 Room Codec', 'codec', 'legacy'],
    'lumen-sp-100': ['Lumen', 'SP-100 Signage Player', 'signage-player', 'legacy'],
  },
  rp: { cafeteria: 'Cafeteria', 'conference-room-medium': 'Medium meeting room', 'huddle-room-sofa': 'Huddle room, sofa' },
  roles: { tech: 'On-site technician', delivery: 'AV and IT delivery engineer', pm: 'Project manager' },
  rooms: {
    'dub-3-05': ['Gannet', '3.05', 'dub', '3', 'conference-room-medium'],
    'dub-3-02': ['Cafeteria', '3.02', 'dub', '3', 'cafeteria'],
    'lon-2-03': ['Curlew', '2.03', 'lon', '2', 'conference-room-medium'],
    'nyc-20-06': ['Gannet', '20.06', 'nyc', '20', 'conference-room-medium'],
    'sin-12-04': ['Wren', '12.04', 'sin', '12', 'huddle-room-sofa'],
  },
  items: [
    ['site', 'rooms/?site=dub', 'Dublin office', 'Dublin', 'DUB Ireland', { st: 'dub' }],
    ['room', 'rooms/dub-3-05/', 'Gannet', 'Dublin office 3.05 · Medium meeting room', '', { st: 'dub', fl: '3', p: 'conference-room-medium', m: ['poly-studio-x52', 'poly-tc10'], c: ['video-bar', 'touch-controller', 'display'] }],
    ['room', 'rooms/dub-3-02/', 'Cafeteria', 'Dublin office 3.02 · Cafeteria', '', { st: 'dub', fl: '3', p: 'cafeteria', m: [], c: ['display', 'signage-player'] }],
    ['room', 'rooms/lon-2-03/', 'Curlew', 'London office 2.03 · Medium meeting room', '', { st: 'lon', fl: '2', p: 'conference-room-medium', m: ['poly-studio-x52'], c: ['video-bar', 'display'] }],
    ['room', 'rooms/nyc-20-06/', 'Gannet', 'New York office 20.06 · Medium meeting room', '', { st: 'nyc', fl: '20', p: 'conference-room-medium', m: ['poly-studio-x52'], c: ['video-bar'] }],
    ['room', 'rooms/sin-12-04/', 'Wren', 'Singapore office 12.04 · Huddle room, sofa', '', { st: 'sin', fl: '12', p: 'huddle-room-sofa', m: ['poly-studio-x32'], c: ['video-bar'] }],
    ['rp', 'room-profiles/cafeteria/', 'Cafeteria', '2 rooms', 'Food and signage', { p: 'cafeteria', m: [], c: ['display', 'signage-player'] }],
    ['model', 'models/poly-studio-x52/', 'Poly Studio X52', 'Video bar · 3 installed', '', { m: ['poly-studio-x52'], c: ['video-bar'], z: ['standard'] }],
    ['model', 'models/poly-studio-x32/', 'Poly Studio X32', 'Video bar · 1 installed', '', { m: ['poly-studio-x32'], c: ['video-bar'], z: ['standard'] }],
    ['cfg', 'profiles/video-bar/poly-studio-x52/#configuration', 'Studio X in Google Meet mode', 'Google Meet', '', { m: ['poly-studio-x32', 'poly-studio-x52'], c: ['video-bar'] }],
    ['cfg', 'profiles/signage-player/lumen-sp-100/#configuration', 'SP-100 loop playback', 'Signage', '', { m: ['lumen-sp-100'], c: ['signage-player'] }],
    ['set', 'profiles/video-bar/poly-studio-x52/#configuration', 'Enable Automatic Updates', 'Studio X in Google Meet mode · Set to Off', 'Device Management', { m: ['poly-studio-x32', 'poly-studio-x52'], c: ['video-bar'] }],
    ['prj', 'projects/prj-15/', 'Dublin office divisible town hall', 'PRJ-15 · Custom design · Dublin office', '', { st: 'dub', z: ['design', 'open'] }],
    ['prj', 'projects/prj-09/', 'London office meeting room refresh', 'PRJ-09 · AV refresh · London office', '', { st: 'lon', z: ['closed', 'closed'] }],
    ['person', 'team/', 'Arjun Rao', 'On-site technician · Singapore office', '', { r: 'apac', st: 'sin', ro: 'tech' }],
    ['person', 'team/', 'Ruby Chen', 'On-site technician · Melbourne office', '', { r: 'apac', st: 'mel', ro: 'tech' }],
    ['person', 'team/', 'Liam Doyle', 'On-site technician · Dublin office', '', { r: 'emea', st: 'dub', ro: 'tech' }],
    ['person', 'team/', 'Mei Tan', 'AV and IT delivery engineer · APAC', '', { r: 'apac', ro: 'delivery' }],
  ],
  units: [
    ['dub-3-05', 'video bar', 'poly-studio-x52', 'video-bar', 'dub-305-vc01', 'DEMO-DUB-000101', 'AG-000101', '2023-04-01', 0, 'in-service'],
    ['dub-3-05', 'display', 0, 'display', 'dub-305-dsp01', 'DEMO-DUB-000102', 'AG-000102', '2016-02-01', 0, 'in-service overdue'],
    ['dub-3-05', 'video codec (2009)', 'kestrel-vc-300', 'codec', 0, 'DEMO-DUB-900001', 'AG-900001', '2009-05-01', '2020-01-10', 'retired legacy'],
    ['lon-2-03', 'video bar', 'poly-studio-x52', 'video-bar', 'lon-203-vc01', 'DEMO-LON-000201', 'AG-000201', '2024-01-01', 0, 'in-service'],
    ['lon-2-03', 'display', 0, 'display', 'lon-203-dsp01', 'DEMO-LON-000202', 'AG-000202', '2021-06-01', 0, 'in-service'],
    ['nyc-20-06', 'video bar', 'poly-studio-x52', 'video-bar', 'nyc-2006-vc01', 'DEMO-NYC-000301', 'AG-000301', '2022-01-01', 0, 'in-service'],
    ['nyc-20-06', 'video codec (2004)', 'kestrel-vc-300', 'codec', 0, 'DEMO-NYC-900002', 'AG-900002', '2004-01-01', '2016-03-01', 'retired legacy'],
    ['dub-3-02', 'signage player (2015)', 'lumen-sp-100', 'signage-player', 'dub-302-sig90', 'DEMO-DUB-900003', 'AG-900003', '2015-06-02', 0, 'in-service legacy overdue'],
    ['sin-12-04', 'video bar', 'poly-studio-x32', 'video-bar', 'sin-1204-vc01', 'DEMO-SIN-000401', 'AG-000401', '2025-03-01', 0, 'installing'],
  ],
};

const I = load(RAW);
const kinds = (q) => parse(I, q).kinds.map((k) => k.v);
const filter = (q, type) => parse(I, q).filters.find((f) => f.type === type);
const urls = (q, kind) => { const r = search(I, q); return [...r.top, ...r.groups.flatMap((g) => g.items)].filter((x) => !kind || x.it.k === kind).map((x) => x.it.u); };
const chips = (q) => parse(I, q).chips.map((c) => c.label).join(' · ');

test('EMEA spaces with X52: spaces, region, has the model', () => {
  assert.equal(chips('EMEA spaces with X52'), 'Spaces · Region: EMEA · Has: Poly Studio X52');
  assert.deepEqual(urls('EMEA spaces with X52'), ['rooms/dub-3-05/', 'rooms/lon-2-03/']);
});

test('the old word "rooms" still searches, and reads as spaces', () => {
  assert.equal(chips('EMEA rooms with X52'), 'Spaces · Region: EMEA · Has: Poly Studio X52');
  assert.deepEqual(urls('EMEA rooms with X52'), ['rooms/dub-3-05/', 'rooms/lon-2-03/']);
});

test('rooms with x52, in any spelling of the model', () => {
  const want = ['rooms/dub-3-05/', 'rooms/lon-2-03/', 'rooms/nyc-20-06/'];
  for (const q of ['rooms with x52', 'room with X52', 'rooms with x 52', 'rooms with studio x52', 'rooms with Poly Studio X52', 'rooms that have an x-52']) {
    assert.deepEqual(urls(q), want, q);
  }
});

test('x52 never matches the x32 by spelling tolerance', () => {
  assert.deepEqual(filter('x52', 'model').v, ['poly-studio-x52']);
  assert.deepEqual(filter('x32', 'model').v, ['poly-studio-x32']);
  assert.ok(!urls('rooms with x52').includes('rooms/sin-12-04/'));
});

test('x52 in Dublin: the X52 units and rooms at the Dublin office', () => {
  const P = parse(I, 'x52 in Dublin');
  assert.deepEqual(P.kinds, []);
  assert.deepEqual(filter('x52 in Dublin', 'site').v, ['dub']);
  assert.deepEqual(urls('x52 in Dublin', 'unit'), ['device/?tag=AG-000101']);
  assert.deepEqual(urls('x52 in Dublin', 'room'), ['rooms/dub-3-05/']);
});

test('decommissioned codecs: retired units of the codec class', () => {
  assert.equal(chips('decommissioned codecs'), 'Status: Retired · Device kind: Video codec');
  assert.deepEqual(urls('decommissioned codecs').sort(), ['rooms/dub-3-05/', 'rooms/nyc-20-06/']);
  assert.ok(search(I, 'decommissioned codecs').groups.every((g) => g.k === 'unit'));
});

test('configurations for poly: every configuration covering a Poly model', () => {
  assert.deepEqual(kinds('configurations for poly'), ['cfg']);
  assert.deepEqual(filter('configurations for poly', 'make').v, ['Poly']);
  assert.deepEqual(urls('configurations for poly'), ['profiles/video-bar/poly-studio-x52/#configuration']);
});

test('projects at the Dublin office', () => {
  assert.equal(chips('projects at the Dublin office'), 'Projects · Office: Dublin office');
  assert.deepEqual(urls('projects at the Dublin office'), ['projects/prj-15/']);
});

test('displays older than 7 years: age from each unit\'s own install date', () => {
  const f = filter('displays older than 7 years', 'age');
  assert.deepEqual([f.op, f.n], ['>=', 7]);
  assert.deepEqual(urls('displays older than 7 years'), ['device/?tag=AG-000102']);
  assert.deepEqual(urls('displays 7+ years old'), ['device/?tag=AG-000102']);
  assert.deepEqual(urls('displays newer than 7 years'), ['device/?tag=AG-000202']);
});

test('who is on site in APAC: on-site technicians in Asia Pacific', () => {
  assert.equal(chips('who is on site in APAC'), 'People · Role: On-site technician · Region: APAC');
  assert.deepEqual(search(I, 'who is on site in APAC').groups[0].items.map((x) => x.it.t), ['Arjun Rao', 'Ruby Chen']);
  assert.deepEqual(search(I, 'technicians in asia').groups[0].items.map((x) => x.it.t), ['Arjun Rao', 'Ruby Chen']);
});

test('cafeteria: the room profile first, then its rooms and devices', () => {
  const r = search(I, 'cafeteria');
  assert.equal(r.top[0].it.u, 'room-profiles/cafeteria/');
  assert.deepEqual(r.groups.map((g) => g.k), ['room', 'unit']);
});

test('typos and plurals are forgiven, and said so', () => {
  const P = parse(I, 'romms wiht x52');
  assert.deepEqual(P.kinds.map((k) => k.v), ['room']);
  assert.ok(P.corrected);
  assert.deepEqual(filter('dubln ofice', 'site').v, ['dub']);
  assert.deepEqual(filter('EMAE', 'region').v, ['emea']);
  assert.deepEqual(filter('decomissioned', 'status').v, ['retired']);
  const t = parse(I, 'curlw');
  assert.equal(t.terms[0].corr, 'curlew');
  assert.deepEqual(urls('curlw', 'room'), ['rooms/lon-2-03/']);
});

test('did you mean: a number is suggested, never swapped silently', () => {
  const P = parse(I, 'rooms with x53');
  assert.equal(P.suggest, 'rooms with x52');
  assert.equal(P.corrected, null);
});

test('without, floors and install years', () => {
  assert.deepEqual(urls('rooms without x52 in dublin'), ['rooms/dub-3-02/']);
  assert.deepEqual(filter('rooms on the third floor', 'floor').v, ['3']);
  assert.deepEqual(urls('devices installed before 2010'), ['rooms/dub-3-05/', 'rooms/nyc-20-06/']);
});

test('plain words: serials, hostnames and settings', () => {
  assert.deepEqual(urls('AG-000201'), ['device/?tag=AG-000201']);
  assert.deepEqual(urls('dub-305'), ['device/?tag=AG-000101', 'device/?tag=AG-000102']);
  assert.deepEqual(urls('automatic updates'), ['profiles/video-bar/poly-studio-x52/#configuration']);
  assert.deepEqual(urls('"Dublin office"', 'prj'), ['projects/prj-15/']);
});

test('removing a chip takes its joining word with it', () => {
  const P = parse(I, 'EMEA rooms with X52');
  const has = P.chips.find((c) => c.type === 'model');
  assert.equal(removeSpan(P.q, has.span), 'EMEA rooms');
  const reg = P.chips.find((c) => c.type === 'region');
  assert.equal(removeSpan(P.q, reg.span), 'rooms with X52');
});

test('a chip can be changed to a sibling value, in plain words', () => {
  const P = parse(I, 'rooms with x52');
  const alt = alternatives(I, P, P.chips.find((c) => c.type === 'model'));
  assert.ok(alt.some((a) => a.q === 'Poly Studio X32'));
  const q2 = 'rooms with Poly Studio X32';
  assert.deepEqual(urls(q2), ['rooms/sin-12-04/']);
});

test('facets count what is in the results', () => {
  const r = search(I, 'rooms with x52');
  assert.deepEqual(r.facets.region.map((x) => [x.v, x.n]), [['emea', 2], ['amer', 1]]);
});

test('edit distance counts a swap of neighbours as one', () => {
  assert.equal(editDistance('hazle', 'hazel'), 1);
  assert.equal(editDistance('x52', 'x32'), 1);
});
