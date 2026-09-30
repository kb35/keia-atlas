// Tests for the live simulation behind the Rooms and Devices overviews (src/lib/livesim.mjs): the same moment
// gives the same answer everywhere, offices keep their local hours, and the events are exactly the changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  prepare, snapshot, diff, eventsBetween, roomAt, unitAt, roomUntil, openAt, nextSwitch, local, heatCode, useShare,
  countRooms, countUnits, tickOf, TICK_MS, OFFICE_HOURS,
} from '../src/lib/livesim.mjs';

const busy = heatCode(Array.from({ length: 5 }, () => Array(10).fill(100)));
const model = () => prepare({
  sites: [
    { id: 'dub', tz: 'Europe/Dublin' },
    { id: 'nyc', tz: 'America/New_York' },
    { id: 'rem', tz: null, remote: true },
  ],
  units: [
    { id: 'AG-1', cls: 'video-bar', inc: -1 },
    { id: 'AG-2', cls: 'display', old: 1, inc: -1 },
    { id: 'AG-3', cls: 'scheduler-panel', inc: 0 },
    ...Array.from({ length: 40 }, (_, i) => ({ id: `AG-X${i}`, cls: 'signage-player', inc: -1 })),
  ],
  rooms: [
    { id: 'dub-1', site: 0, kind: 'meeting', heat: busy, video: 1, inc: -1, units: [0, 1] },
    { id: 'dub-2', site: 0, kind: 'shared', cur: 'shared', video: 0, inc: -1, units: [] },
    { id: 'nyc-1', site: 1, kind: 'meeting', cur: 'office', video: 1, inc: -1, units: [2] },
    { id: 'rem-1', site: 2, kind: 'kits', home: 1, tz: 'Europe/Dublin', cur: 'home', video: 0, inc: -1, units: [] },
  ],
  incs: [{ no: 'INC1', title: 'Panel blank' }],
});

// Tuesday 29 September 2026, 10:00 in Dublin (09:00 UTC) and 05:00 in New York.
const TUE_10_DUB = Date.parse('2026-09-29T09:00:00Z');

test('local time and opening hours follow each office', () => {
  assert.deepEqual(local('Europe/Dublin', TUE_10_DUB), { dow: 2, h: 10, m: 0 });
  assert.equal(openAt('Europe/Dublin', TUE_10_DUB), true);
  assert.equal(openAt('America/New_York', TUE_10_DUB), false);                       // 05:00 there
  assert.equal(openAt('Europe/Dublin', Date.parse('2026-10-03T12:00:00Z')), false);  // a Saturday
  assert.equal(openAt('Europe/Dublin', Date.parse('2026-09-29T18:30:00Z')), false);  // 19:30
  // Clocks go back on 25 October: 08:00 UTC is 09:00 in Dublin before, and 08:00 after.
  assert.equal(local('Europe/Dublin', Date.parse('2026-10-23T08:00:00Z')).h, 9);
  assert.equal(local('Europe/Dublin', Date.parse('2026-10-26T08:00:00Z')).h, 8);
});

test('the next opening is found across a weekend', () => {
  const sat = Date.parse('2026-10-03T12:00:00Z');
  const next = nextSwitch('Europe/Dublin', sat, OFFICE_HOURS);
  assert.equal(new Date(next).toISOString(), '2026-10-05T06:00:00.000Z');   // Monday 07:00 in Dublin
});

test('the same moment gives the same answer, in any order and in any window', () => {
  const a = snapshot(model(), TUE_10_DUB), b = snapshot(model(), TUE_10_DUB);
  assert.deepEqual(a, b);
  const m = model();
  snapshot(m, TUE_10_DUB + 3600e3);
  assert.deepEqual(snapshot(m, TUE_10_DUB), a);
});

test('a room is closed outside hours, and busy rooms are in use when open', () => {
  const m = model();
  const night = snapshot(m, Date.parse('2026-09-29T23:00:00Z'));
  assert.equal(night.rooms[1].st, 'closed');
  let inUse = 0;
  for (let k = 0; k < 20; k++) if (roomAt(m.rooms[0], TUE_10_DUB + k * 15 * 60e3, []).use) inUse++;
  assert.ok(inUse >= 12, `a room busy every hour should mostly be in use (${inUse} of 20)`);
  assert.equal(useShare(m.rooms[0], 2, 10), 1);
  assert.equal(useShare(m.rooms[0], 6, 10), 0);
});

test('an open incident makes a problem, even when the office is closed', () => {
  const m = model();
  const s = snapshot(m, Date.parse('2026-09-29T09:00:00Z'));
  assert.equal(s.units[2].st === 'alert' || s.units[2].st === 'offline', true);
  assert.equal(s.rooms[2].st, 'problem');
  assert.equal(s.rooms[2].why.unit, 2);
  assert.equal(s.rooms[2].open, false);
});

test('events are exactly the changes between ticks, and they pair up', () => {
  const m = model();
  const t0 = TUE_10_DUB, t1 = t0 + 3 * 3600e3;
  const evs = eventsBetween(m, t0, t1);
  let prev = snapshot(m, t0), stepped = [];
  for (let t = t0 + TICK_MS; t <= t1; t += TICK_MS) { const cur = snapshot(m, t); stepped.push(...diff(m, prev, cur)); prev = cur; }
  assert.deepEqual(evs, stepped);
  // Each unit goes offline before it comes back, and an alert is raised before it is cleared.
  for (let i = 0; i < m.units.length; i++) {
    let down = snapshot(m, t0).units[i].down;
    for (const e of evs.filter((x) => x.unit === i && (x.k === 'offline' || x.k === 'online'))) {
      assert.equal(e.k, down ? 'online' : 'offline'); down = !down;
      if (e.k === 'online') assert.ok(e.dur >= 1);
    }
  }
  assert.ok(evs.some((e) => e.k === 'use' || e.k === 'free'), 'rooms go in and out of use');
  assert.ok(evs.some((e) => e.k === 'offline'), 'forty signage players over three hours drop offline at least once');
});

test('home offices only speak up when something is wrong', () => {
  const m = model();
  const evs = eventsBetween(m, TUE_10_DUB, TUE_10_DUB + 6 * 3600e3);
  assert.equal(evs.filter((e) => e.room === 3 && !['problem', 'clear'].includes(e.k)).length, 0);
});

test('offices open and close as events', () => {
  const m = model();
  const open = Date.parse('2026-09-29T06:00:00Z');   // 07:00 in Dublin
  const evs = eventsBetween(m, open - 60e3, open + 60e3);
  assert.deepEqual(evs.filter((e) => e.site != null).map((e) => [e.k, e.site]), [['open', 0]]);
});

test('how long a room stays as it is', () => {
  const m = model();
  const r = m.rooms[0], s = roomAt(r, TUE_10_DUB, []);
  const u = roomUntil(r, TUE_10_DUB);
  assert.equal(u.use, s.use);
  if (u.t) assert.ok(u.t > TUE_10_DUB);
});

test('counts add up', () => {
  const m = model();
  const s = snapshot(m, tickOf(TUE_10_DUB + 1234));
  const r = countRooms(m, s), u = countUnits(m, s);
  assert.equal(r.use + r.free + r.problem + r.closed, m.rooms.length);
  assert.equal(u.online + u.offline + u.alert, m.units.length);
  assert.equal(unitAt(m.units[2], TUE_10_DUB).inc, 0);
});
