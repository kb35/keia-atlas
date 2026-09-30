// Deploy, "verify, don't tick" (src/lib/integrate-view.mjs): what Keia Atlas checks, what waits to be
// accepted, and that exceptions are never swept up by an accept. A small made-up plan, replayed with events
// the way the browser does it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateModel, nextInQueue } from '../src/lib/integrate-view.mjs';
import { replay } from '../src/lib/live.mjs';

const unit = (id, extra = {}) => ({
  id, room: 'r1', roomName: '1.01 Wren', site: 's', name: `Wren ${id}`, short: id, cls: 'video-bar', clsName: 'Video bar', model: 'm', modelName: 'Model', host: `h-${id}`, tag: null, serial: null,
  ip: '10.0.0.1', port: 'sw port 1', role: 'new', steps: ['provision', 'install', 'configure'], networked: true, readable: true, cfg: 'c', fw: '2', oldFw: '1',
  where: null, tz: '', country: '', hostPos: null, pairs: null, legacy: null, link: null, tasks: {}, blocked: {}, owner: {}, vendor: false, batch: 'c',
  records: [{ id: 'assetbox', t: 'Asset register', sys: 'Assetbox', exp: 'x', seen: true }],
  base: { online: true, read: true, drift: null, fwOk: true, dnsOk: true, installed: true, partial: {}, setupDone: 0, accepted: {}, hand: {} },
  ...extra,
});
const plan = {
  project: 'PRJ-1', name: 'Test', steps: [{ id: 'provision', label: 'Provision', done: 'Provisioned' }, { id: 'install', label: 'Install', done: 'Installed' }, { id: 'configure', label: 'Configure', done: 'Configured' }, { id: 'commission', label: 'Commission', done: 'Commissioned' }],
  units: [unit('a'), unit('b', { base: { ...unit('b').base, drift: 'Automatic updates: On' } })],
  batches: [{ id: 'c', title: '2 video bars', noun: 'video bars', cls: ['video-bar'], models: [], cfg: { id: 'c', name: 'Config', version: '1' }, via: 'Fleet Lens', readable: true, steps: ['provision', 'install', 'configure'], units: ['a', 'b'], rooms: ['r1'], setup: [], same: [], differ: [] }],
  rooms: [{ id: 'r1', name: '1.01 Wren', units: ['a', 'b'], kept: [], tests: [{ id: 'call', t: 'Call', how: '' }], base: { tests: {}, signed: null } }],
  kept: [], blocked: [], base: '/p/', vendor: null,
};
const model = (events = []) => integrateModel(plan, { get: (item, base) => replay(events, item, base), stage: () => 6 });

test('what Keia Atlas saw pass is Checked, and a drifted setting needs a person', () => {
  const M = model();
  assert.equal(M.stepOf('a', 'configure').st, 'verified');
  assert.equal(M.stepOf('b', 'configure').st, 'issue');
  assert.equal(M.needs().filter((n) => n.kind === 'drift').length, 1);
});

test('accepting a batch takes only what passed; the exception stays out', () => {
  const g = model().readyGroups('batch')[0];
  assert.ok(g.keys.includes('a|configure'));
  assert.ok(!g.keys.includes('b|configure'), 'the drifted unit is never swept up');
  assert.equal(g.left, 1);
  const accepted = Object.fromEntries(g.keys.map((k) => [k, { who: 'anna', at: '2026-09-29T10:00:00Z' }]));
  const M = model([{ id: 'e1', at: '2026-09-29T10:00:00Z', who: 'anna', item: 'int:PRJ-1:c:batch', field: 'accepted', before: {}, after: accepted }]);
  assert.equal(M.stepOf('a', 'configure').st, 'done');
  assert.equal(M.stepOf('b', 'configure').st, 'issue');
});

test('fixing the drift makes it Checked again, and an untick with a reason wins over what was seen', () => {
  const fixed = model([{ id: 'e1', at: '2026-09-29T10:00:00Z', who: 'keia_atlas', item: 'int:PRJ-1:b:unit', field: 'drift', before: 'x', after: null }]);
  assert.equal(fixed.stepOf('b', 'configure').st, 'verified');
  const unticked = model([{ id: 'e2', at: '2026-09-29T10:00:00Z', who: 'anna', item: 'int:PRJ-1:a:unit', field: 'x-install', before: null, after: { v: false, w: 'anna', n: 'Needs a second look' } }]);
  const x = unticked.stepOf('a', 'install');
  assert.equal(x.st, 'todo');
  assert.equal(x.why, 'Needs a second look');
});

test('below stage 2 nothing is seen, so nothing is checked and there are no exceptions', () => {
  const M = integrateModel(plan, { get: (item, base) => base, stage: () => 1 });
  assert.equal(M.stepOf('a', 'configure').st, 'todo');
  assert.equal(M.needs().length, 0);
});

// ---- Deliver by: the same units and checks, grouped the way a team works ----
const plan2 = {
  ...plan,
  units: [...plan.units, unit('c', { room: 'r2', roomName: '1.02 Kite', cls: 'display', clsName: 'Display', short: 'Display', batch: 'd', steps: ['provision', 'install'] })],
  batches: [...plan.batches, { id: 'd', title: '1 display', noun: 'display', cls: ['display'], models: [], cfg: null, via: null, readable: true, steps: ['provision', 'install'], units: ['c'], rooms: ['r2'], setup: [], same: [], differ: [] }],
  rooms: [...plan.rooms, { id: 'r2', name: '1.02 Kite', units: ['c'], kept: [], tests: [{ id: 'display', t: 'Displays', how: '' }], base: { tests: {}, signed: null } }],
  zones: [{ id: 's-1', title: 'First floor', rooms: ['r1', 'r2'], units: ['a', 'b', 'c'] }],
  queue: ['a', 'b', 'c'],
};
const model2 = (events = []) => integrateModel(plan2, { get: (item, base) => replay(events, item, base), stage: () => 6 });
const WAYS = ['type', 'room', 'floor', 'one', 'set'];
const SET = { id: 'set-1', name: 'Wren and Kite first', units: ['a', 'c'] };
const groupOf = (M, by, uid) => M.groupsBy(by, { set: SET }).find((g) => g.units.includes(uid));

test('every way of delivering holds every unit once', () => {
  const M = model2();
  for (const by of WAYS) {
    const ids = M.groupsBy(by, { set: SET }).flatMap((g) => g.units);
    assert.deepEqual([...ids].sort(), ['a', 'b', 'c'], by);
  }
});

test('the same unit progress shows in every grouping, whichever way it was accepted', () => {
  const at = '2026-09-30T09:00:00Z';
  // Accept what passed on the first floor (the floor view), then look at it every other way.
  const M0 = model2();
  const floor = M0.groupsBy('floor')[0];
  const e = M0.acceptEvent(floor, M0.groupSum(floor).readyKeys, { who: 'sam', at });
  assert.equal(e.item, 'int:PRJ-1:s-1:zone');
  const M = model2([{ id: 'e1', at, who: 'sam', ...e }]);
  for (const by of WAYS) {
    assert.equal(M.stepOf('a', 'configure').st, 'done', by);
    assert.equal(M.stepOf('c', 'install').st, 'done', by);
    assert.equal(M.stepOf('b', 'configure').st, 'issue', `${by}: the exception is never swept up`);
    const g = groupOf(M, by, 'a');
    assert.ok(M.groupSum(g).accepted >= 1, `${by}: the unit counts as accepted in its group`);
  }
  // The totals agree however the units are grouped.
  const checked = (by) => M.groupsBy(by, { set: SET }).reduce((n, g) => n + M.groupSum(g).checked, 0);
  for (const by of WAYS) assert.equal(checked(by), 2, by);
  // A space's answer comes first, and names the exception.
  const r1 = M.groupsBy('room').find((g) => g.id === 'r1');
  assert.equal(M.groupAnswer(r1), "1.01 Wren: 1 of 2 units checked; the b's automatic updates differ from the setup guide");
});

test("a custom set's accept records who, when and the evidence for each unit and step", () => {
  const M = model2();
  const g = M.groupsBy('set', { set: SET })[0];
  assert.equal(g.scope, 'set');
  const keys = M.groupSum(g).readyKeys;
  assert.deepEqual(keys, ['a|provision', 'a|install', 'a|configure', 'c|provision', 'c|install']);
  const e = M.acceptEvent(g, keys, { who: 'anna', at: '2026-09-30T10:00:00Z' });
  assert.equal(e.item, 'int:PRJ-1:all:project', 'a set lives in one browser, so its accept goes on the project');
  assert.match(e.note, /^Accepted in Wren and Kite first: 2 units, 5 steps/);
  for (const k of keys) {
    const v = e.after[k];
    assert.equal(v.who, 'anna');
    assert.equal(v.at, '2026-09-30T10:00:00Z');
    assert.equal(v.in, 'set:set-1');
    assert.equal(v.inTitle, 'Wren and Kite first');
    assert.ok(v.ev && v.ev.length > 3, `${k} carries its evidence`);
  }
  assert.match(e.after['a|install'].ev, /Online on its switch port: Online on sw port 1/);
  assert.match(e.after['a|provision'].ev, /Asset register/);
  const after = model2([{ id: 'e2', at: '2026-09-30T10:00:00Z', who: 'anna', ...e }]);
  assert.equal(after.acc('c|install').ev, e.after['c|install'].ev);
  assert.equal(after.groupSum(groupOf(after, 'type', 'c')).status, 'done');
});

test('one at a time: an accept goes on the unit, and the queue moves to the next open unit', () => {
  const M = model2();
  assert.equal(nextInQueue(M), 'a');
  const g = { scope: 'unit', id: 'a', title: 'Wren a', units: ['a'] };
  const e = M.acceptEvent(g, M.groupSum(g).readyKeys, { who: 'anna', at: '2026-09-30T11:00:00Z' });
  assert.equal(e.item, 'int:PRJ-1:a:unit');
  const M2 = model2([{ id: 'e3', at: '2026-09-30T11:00:00Z', who: 'anna', ...e }]);
  assert.equal(nextInQueue(M2), 'b');
  assert.equal(nextInQueue(M2, 'b'), 'c');
});

test('applying from a space sends the setup guide to its units alone, and they read back', () => {
  const p3 = { ...plan2, units: plan2.units.map((u) => (u.id === 'a' ? { ...u, base: { ...u.base, read: false } } : u)) };
  const M3 = integrateModel(p3, { get: (item, base) => base, stage: () => 6 });
  const r1 = M3.groupsBy('room').find((g) => g.id === 'r1');
  const evs = M3.applyEvents(r1);
  assert.deepEqual(evs.map((e) => e.item), ['int:PRJ-1:a:unit']);
  const events = evs.map((e, i) => ({ id: `x${i}`, at: '2026-09-30T12:00:00Z', who: 'anna', ...e }));
  const M4 = integrateModel(p3, { get: (item, base) => replay(events, item, base), stage: () => 6 });
  assert.equal(M4.stepOf('a', 'configure').sub, 'Reading back');
  assert.equal(M3.applyEvents(M3.groupsBy('type')[0])[0].item, 'int:PRJ-1:c:batch');
});
