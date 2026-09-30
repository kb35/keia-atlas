// Lenses on the floor plan (UX-V2 §2.5) and Replay (UX-V2 §8): the pure rules in src/lib/lenses.mjs and
// src/lib/replay.mjs. The facts they read are gathered at build time (src/lib/lens-data.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LENSES, LENS_KEY, pickLens, nextLens, supportLens, networkLens, projectsLens, vendorsLens, knowledgeLens, healthLens, MARGIN_DB } from '../src/lib/lenses.mjs';
import { healthAt, jobWindow, dayHours, pastSentence, frameSvg, exportHtml, addMin, stamp } from '../src/lib/replay.mjs';
import { STATES } from '../src/lib/health.mjs';

test('six lenses, Health first, each tied to a module, each with a key in health states', () => {
  assert.deepEqual(LENSES.map((l) => l.id), ['health', 'support', 'network', 'projects', 'vendors', 'knowledge']);
  for (const l of LENSES) {
    assert.ok(l.module, l.id);
    assert.ok(LENS_KEY[l.id].length >= 2, l.id);
    for (const k of LENS_KEY[l.id]) assert.ok(STATES.includes(k.h), `${l.id}: ${k.h}`);
  }
});

test('a lens whose module is Off is never shown, and L skips it', () => {
  assert.equal(pickLens('vendors', { vendors: 'off' }), 'health');
  assert.equal(pickLens('support', { support: 'connected' }), 'support');
  assert.equal(pickLens('nonsense', {}), 'health');
  assert.equal(nextLens('projects', { vendors: 'off' }), 'knowledge');
  assert.equal(nextLens('knowledge', {}), 'health');
});

test('Support: the worst open job, fault before review before booked work', () => {
  assert.equal(supportLens({ jobs: [] }).h, 'fine');
  const r = supportLens({ jobs: [{ kind: 'refresh', title: 'Replace 1 device' }, { kind: 'incident', prio: 2, state: 'new', title: 'Video bar offline. More words.', who: 'Liam' }] });
  assert.equal(r.h, 'fault'); assert.equal(r.label, '2 jobs'); assert.equal(r.who, 'Liam'); assert.equal(r.line, 'Video bar offline.');
  assert.equal(supportLens({ jobs: [{ kind: 'incident', prio: 2, state: 'on-hold', title: 'x' }] }).h, 'review');
  assert.equal(supportLens({ jobs: [{ kind: 'incident', prio: 4, state: 'new', title: 'x' }] }).h, 'review');
});

test('Network: a port fault, then a port off the VLAN plan or a thin cable margin, then fine; nothing recorded is Off', () => {
  assert.equal(networkLens({}).h, 'off');
  assert.equal(networkLens({ ports: 3, portFault: 'Switch port: PoE 0 W' }).h, 'fault');
  assert.equal(networkLens({ ports: 3, minMargin: MARGIN_DB - 0.01 }).h, 'review');
  const off = networkLens({ ports: 3, vlanOff: 'dub-321-as02 port 24: Planned VLAN 31 Displays and signage, seen VLAN 20 Corporate on the switch.', minMargin: 6 });
  assert.equal(off.h, 'review'); assert.equal(off.label, 'VLAN'); assert.match(off.line, /seen VLAN 20/);
  assert.equal(networkLens({ ports: 3, portFault: 'Switch port: PoE 0 W', vlanOff: 'x' }).h, 'fault', 'a fault comes before a VLAN off the plan');
  const f = networkLens({ ports: 3, minMargin: 6, vlans: [30, 31], sw: 'Access switch 1' });
  assert.equal(f.h, 'fine'); assert.equal(f.on, 'VLAN 30 and 31 · Access switch 1');
});

test('Projects: planned, being installed, snag open, handed over', () => {
  const e = (phase, space) => projectsLens({ entries: [{ code: 'PRJ-1', name: 'A', phase, space }] }).h;
  assert.equal(e('design', 'not-started'), 'planned');
  assert.equal(e('integrate', 'in-progress'), 'progress');
  assert.equal(e('integrate', 'snags'), 'review');
  assert.equal(e('handover', 'done'), 'fine');
  assert.equal(projectsLens({}).h, 'off');
});

test('Vendors: a contract ending within 90 days is To review', () => {
  assert.equal(vendorsLens({ vendor: { name: 'Brightwave Integration', short: 'Brightwave', end: '2026-10-31' }, today: '2026-09-28' }).h, 'review');
  assert.equal(vendorsLens({ vendor: { name: 'Keystone Service', end: '2028-12-31' }, today: '2026-09-28' }).h, 'fine');
  assert.equal(vendorsLens({ today: '2026-09-28' }).h, 'off');
});

test('Knowledge: a guide past due is dashed, a known error is To review', () => {
  const today = '2026-09-28';
  assert.equal(knowledgeLens({ guides: [{ name: 'G', updated: '2026-03-02' }], today }).h, 'stale');
  assert.equal(knowledgeLens({ guides: [{ name: 'G', updated: '2026-09-01' }], errors: [{ title: 'Drops off' }], today }).h, 'review');
  assert.equal(knowledgeLens({ fixes: [{ text: 'x' }], today }).h, 'fine');
  assert.equal(knowledgeLens({ today }).h, 'off');
});

test('Health reads the live state', () => {
  assert.equal(healthLens('problem', 'Video bar offline').h, 'fault');
  assert.equal(healthLens('closed').h, 'off');
  assert.equal(healthLens('use').word, 'In use');
});

const JOBS = [
  { number: 'INC1', room: 'r1', prio: 2, opened: '2026-09-28T07:52', state: 'new', short: 'Video bar offline', lastSeen: '2026-09-28T07:51', lastSeenSays: 'Poly Lens last heard from it at 07:51.', heldAt: '2026-09-28T07:53', stateWord: 'nobody has it yet', with: 'Liam',
    history: [{ at: '2026-09-28T07:52', state: 'new', note: 'Captured. Offered to Liam.', who: 'Keia Atlas' }] },
  { number: 'INC2', room: 'r2', prio: 4, opened: '2026-09-25T14:30', state: 'on-hold', short: 'Panel', history: [{ at: '2026-09-25T14:30', state: 'new', note: 'x' }, { at: '2026-09-25T16:10', state: 'on-hold', note: 'y' }] },
];

test('Replay: a job is Fault from when its unit was last heard from, and each job counts from when it opened', () => {
  assert.deepEqual(healthAt(JOBS, '2026-09-25T14:00'), {});
  assert.deepEqual(healthAt(JOBS, '2026-09-28T07:40', 'INC1'), { r2: 'review' });
  assert.deepEqual(healthAt(JOBS, '2026-09-28T07:51', 'INC1'), { r1: 'fault', r2: 'review' });
  assert.deepEqual(healthAt(JOBS, '2026-09-28T07:51'), { r2: 'review' });
});

test('Replay: a job window is before, last heard, its events and as it stands, in order', () => {
  const w = jobWindow(JOBS, 'INC1');
  assert.deepEqual(w.frames.map((f) => f.at), ['2026-09-28T07:21', '2026-09-28T07:51', '2026-09-28T07:52', '2026-09-28T07:53']);
  assert.equal(w.frames[0].health.r1, undefined);
  assert.equal(w.frames[1].health.r1, 'fault');
  assert.equal(w.frames[3].caption, 'As it stands: nobody has it yet, offered to Liam');
  assert.equal(jobWindow(JOBS, 'NOPE'), null);
});

test('Replay: a day is its open hours up to now, or the day before when not open yet', () => {
  assert.deepEqual(dayHours('2026-09-28T09:30'), ['2026-09-28T07:00', '2026-09-28T08:00', '2026-09-28T09:00']);
  assert.equal(dayHours('2026-09-28T05:00')[0], '2026-09-27T07:00');
  assert.equal(dayHours('2026-09-28T22:00').length, 13);
  assert.equal(addMin('2026-09-28T00:10', -30), '2026-09-27T23:40');
  assert.equal(stamp('2026-09-28T07:52'), '07:52, 28 Sept');
});

test('Replay: the band speaks in the past tense, and the export is one self-contained page', () => {
  assert.equal(pastSentence({ at: '2026-09-28T07:52', health: { a: 'fault', b: 'review' } }), 'At 07:52: 1 space was not working');
  assert.equal(pastSentence({ at: '2026-09-28T07:00', health: { a: 'use' } }), 'At 07:00: every space was working');
  const plan = { vb: [0, 0, 10, 5], outline: '0,0 10,0 10,5 0,5', rooms: [{ id: 'r1', x: 1, y: 1, w: 2, h: 2 }] };
  const svg = frameSvg(plan, { r1: 'fault' }, { title: '07:52' });
  assert.match(svg, /rp-fault/);
  const page = exportHtml({ title: 'Replay', where: 'Dublin', windowLabel: 'INC1', frames: [{ at: '2026-09-28T07:52', caption: 'Captured', svg }], note: 'Simulated' });
  assert.match(page, /^<!doctype html>/);
  assert.match(page, /Simulated/);
  assert.doesNotMatch(page, /<script|<link/);
  assert.doesNotMatch(page, /—/);
});
