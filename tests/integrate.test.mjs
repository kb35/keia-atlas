// Deploy, "verify, don't tick" (src/lib/integrate-view.mjs): what Keia Atlas checks, what waits to be
// accepted, and that exceptions are never swept up by an accept. A small made-up plan, replayed with events
// the way the browser does it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { integrateModel } from '../src/lib/integrate-view.mjs';
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
  const accepted = Object.fromEntries(g.keys.map((k) => [k, { who: 'aoife', at: '2026-09-29T10:00:00Z' }]));
  const M = model([{ id: 'e1', at: '2026-09-29T10:00:00Z', who: 'aoife', item: 'int:PRJ-1:c:batch', field: 'accepted', before: {}, after: accepted }]);
  assert.equal(M.stepOf('a', 'configure').st, 'done');
  assert.equal(M.stepOf('b', 'configure').st, 'issue');
});

test('fixing the drift makes it Checked again, and an untick with a reason wins over what was seen', () => {
  const fixed = model([{ id: 'e1', at: '2026-09-29T10:00:00Z', who: 'keia_atlas', item: 'int:PRJ-1:b:unit', field: 'drift', before: 'x', after: null }]);
  assert.equal(fixed.stepOf('b', 'configure').st, 'verified');
  const unticked = model([{ id: 'e2', at: '2026-09-29T10:00:00Z', who: 'aoife', item: 'int:PRJ-1:a:unit', field: 'x-install', before: null, after: { v: false, w: 'aoife', n: 'Needs a second look' } }]);
  const x = unticked.stepOf('a', 'install');
  assert.equal(x.st, 'todo');
  assert.equal(x.why, 'Needs a second look');
});

test('below stage 2 nothing is seen, so nothing is checked and there are no exceptions', () => {
  const M = integrateModel(plan, { get: (item, base) => base, stage: () => 1 });
  assert.equal(M.stepOf('a', 'configure').st, 'todo');
  assert.equal(M.needs().length, 0);
});
