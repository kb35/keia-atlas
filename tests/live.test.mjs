// Tests for the live layer (src/lib/live.mjs, decision 0025): replaying events over the built data,
// versions, undo that never deletes, and two windows sharing events and presence over a fake channel.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, versionsOf, historyOf, reversing, matches, createLive } from '../src/lib/live.mjs';

const E = (id, at, item, field, before, after, extra = {}) => ({ id, at, who: 'ruth', item, field, before, after, ...extra });
const events = [
  E('e2', '2026-09-29T10:42:00Z', 'task:T-1204', 'owner', 'liam', 'carlos'),
  E('e1', '2026-09-29T10:40:00Z', 'task:T-1204', 'status', 'doing', 'done'),
  E('e3', '2026-09-29T10:45:00Z', 'task:T-1205', 'status', 'todo', 'doing'),
];

test('replay puts every event for an item over its base, in time order', () => {
  assert.deepEqual(replay(events, 'task:T-1204', { status: 'doing', owner: 'liam', hours: 6 }), { status: 'done', owner: 'carlos', hours: 6 });
  assert.deepEqual(replay(events, 'task:T-9999', { status: 'todo' }), { status: 'todo' });
});

test('versions start with the base and add one per event', () => {
  const v = versionsOf(events, 'task:T-1204', { status: 'doing', owner: 'liam' });
  assert.equal(v.length, 3);
  assert.deepEqual(v.map((x) => x.state), [{ status: 'doing', owner: 'liam' }, { status: 'done', owner: 'liam' }, { status: 'done', owner: 'carlos' }]);
  assert.deepEqual(v.map((x) => x.event?.id ?? null), [null, 'e1', 'e2']);
});

test('undo writes a reversing event, keeps the original, and undoing the undo is a redo', () => {
  const u = reversing(events, events[1], { id: 'u1', at: '2026-09-29T11:00:00Z', who: 'aoife', base: { status: 'doing' } });
  assert.deepEqual({ ...u }, { id: 'u1', at: '2026-09-29T11:00:00Z', who: 'aoife', item: 'task:T-1204', field: 'status', before: 'done', after: 'doing', note: 'Undo', undoes: 'e1' });
  const after = [...events, u];
  assert.equal(after.length, 4);
  assert.equal(replay(after, 'task:T-1204', { status: 'doing' }).status, 'doing');
  const h = historyOf(after, 'task:T-1204');
  assert.deepEqual(h.map((e) => e.id), ['u1', 'e2', 'e1']);
  assert.equal(h.find((e) => e.id === 'e1').undoneBy, 'u1');
  const redo = reversing(after, u, { id: 'r1', at: '2026-09-29T11:05:00Z', who: 'aoife', base: { status: 'doing' } });
  assert.equal(redo.note, 'Redo');
  assert.equal(replay([...after, redo], 'task:T-1204', { status: 'doing' }).status, 'done');
});

test('a key ending in a colon is a prefix; anything else is one item', () => {
  assert.ok(matches('task:', 'task:T-1204'));
  assert.ok(matches('task:T-1204', 'task:T-1204'));
  assert.ok(!matches('task:T-12', 'task:T-1204'));
  assert.ok(matches('task:T-12*', 'task:T-1204'));
});

// Two windows on one computer: one shared store (localStorage) and one channel (BroadcastChannel).
function computer() {
  let saved = [];
  const store = { load: () => [...saved], append: (e) => { saved = [...saved, e]; return saved; } };
  const listeners = new Set();
  const transport = () => {
    let mine = null;
    return {
      send: (m) => { for (const l of listeners) if (l !== mine) l(structuredClone(m)); },
      listen: (fn) => { mine = fn; listeners.add(fn); return () => listeners.delete(fn); },
    };
  };
  let t = Date.parse('2026-09-29T10:00:00Z');
  const clock = { now: () => new Date(t).toISOString(), tick: (ms) => { t += ms; } };
  let n = 0;
  const open = (name) => createLive({ store, transport: transport(), now: clock.now, id: () => `${name}-${++n}`, tab: name });
  return { open, clock };
}

test('a change in one window reaches the other, with who and when, and both agree on the state', () => {
  const { open } = computer();
  const a = open('A'), b = open('B');
  const seen = [];
  b.subscribe('task:', (e, { remote }) => seen.push([e.item, e.field, e.after, e.who, remote]));
  a.record({ item: 'task:T-1204', field: 'status', before: 'doing', after: 'done', who: 'ruth' });
  assert.deepEqual(seen, [['task:T-1204', 'status', 'done', 'ruth', true]]);
  assert.equal(b.stateOf('task:T-1204', { status: 'doing' }).status, 'done');
  assert.equal(b.historyOf('task:T-1204')[0].at, '2026-09-29T10:00:00.000Z');
  // Window B undoes it; window A sees the reversing event and the original stays in the history.
  const u = b.undo(b.historyOf('task:T-1204')[0].id, { who: 'aoife', base: { status: 'doing' } });
  assert.equal(a.stateOf('task:T-1204', { status: 'doing' }).status, 'doing');
  assert.deepEqual(a.historyOf('task:T-1204').map((e) => e.id), [u.id, 'A-1']);
  assert.equal(a.versions('task:T-1204', { status: 'doing' }).length, 3);
});

test('a window opened later replays what is already stored', () => {
  const { open } = computer();
  open('A').record({ item: 'task:T-1', field: 'owner', before: 'liam', after: 'carlos', who: 'ruth' });
  assert.equal(open('C').stateOf('task:T-1', { owner: 'liam' }).owner, 'carlos');
});

test('presence: each window sees the others on the same page until they leave or go quiet', () => {
  const { open, clock } = computer();
  const a = open('A'), b = open('B');
  const leaveA = a.here('project:PRJ-12', 'ruth');
  b.here('project:PRJ-12', 'aoife');
  b.here('project:PRJ-14', 'aoife');
  assert.deepEqual(a.whoIsHere('project:PRJ-12').map((h) => h.who), ['aoife']);
  assert.deepEqual(b.whoIsHere('project:PRJ-12').map((h) => h.who), ['ruth']);
  assert.deepEqual(a.whoIsHere('project:PRJ-14').map((h) => h.who), ['aoife']);
  leaveA();
  assert.deepEqual(b.whoIsHere('project:PRJ-12'), []);
  clock.tick(12000);
  assert.deepEqual(a.whoIsHere('project:PRJ-14'), []);
  a.close(); b.close();
});
