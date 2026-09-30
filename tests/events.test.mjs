// Events in the experience centres (src/lib/events.mjs): readiness checks generated before each event, the live
// event priority for an incident in an event room, demo kit booking with check-out and check-in, and the report after.
// The pure rules on small made-up inputs, then the demo's own records (data/events/, data/demo-kit/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { readiness, readinessState, readinessLine, homeLine, eventState, currentItem, liveEventAt, livePriority, kitBookings, canBook, bookKit, checkOut, checkIn, kitState, eventReport, CHARGE_MIN } from '../src/lib/events.mjs';

const KIT = {
  'KIT-01': { n: 1, name: 'Portable video bar', battery: false, tested: '2026-09-20' },
  'KIT-03': { n: 3, name: 'Display cart', battery: true, charge_pct: 38, tested: '2026-09-25' },
};
const EV = {
  id: 'EVT-X', kind: 'executive-briefing', date: '2026-09-28', start: '10:00', end: '15:00', rooms: ['r1', 'r2'], recording: true,
  demo_kit: [{ unit: 'KIT-01' }, { unit: 'KIT-03' }],
  agenda: [{ at: '10:00', until: '10:30', title: 'Welcome', room: 'r1' }, { at: '10:30', until: '12:00', title: 'Demo', room: 'r2' }],
  checks: { room_tests: { r1: '2026-09-28T08:40', r2: '2026-09-27T16:00' }, content: '2026-09-27T17:00', recording: '2026-09-28T08:50', backup_plan: 'The boardroom takes the demo' },
};

test('readiness: one check per room, per kit unit (charged and tested), content, recording and a backup plan', () => {
  const c = readiness(EV, KIT, { roomName: (id) => id.toUpperCase() });
  assert.deepEqual(c.map((x) => x.id), ['room:r1', 'room:r2', 'kit:KIT-01:test', 'kit:KIT-03:charge', 'kit:KIT-03:test', 'content', 'recording', 'backup']);
  assert.deepEqual(c.filter((x) => !x.done).map((x) => x.missing), ['demo kit unit 3 not charged']);
  assert.equal(readinessState(c), 'at-risk');
  assert.equal(readinessLine(c), 'At risk: demo kit unit 3 not charged');
  assert.equal(homeLine(EV, c), 'Briefing at 10:00: 1 check left');
});

test('readiness: Ready with nothing left, Not ready with three or more; stale tests do not count', () => {
  const charged = { ...KIT, 'KIT-03': { ...KIT['KIT-03'], charge_pct: CHARGE_MIN } };
  assert.equal(readinessState(readiness(EV, charged)), 'ready');
  assert.match(readinessLine(readiness(EV, charged)), /^Ready: all 8 checks done$/);
  const early = { ...EV, checks: { ...EV.checks, room_tests: { r1: '2026-09-20T09:00' } } };
  const c = readiness(early, charged);
  assert.equal(c.find((x) => x.id === 'room:r1').done, false, 'a test a week before does not count');
  assert.equal(readinessState(c), 'at-risk');
  const bare = { ...EV, checks: {} };
  assert.equal(readinessState(readiness(bare, charged)), 'not-ready');
  assert.equal(readiness({ ...EV, recording: false }, charged).some((x) => x.id === 'recording'), false, 'no recording, no recording check');
  const out = { ...EV, demo_kit: [{ unit: 'KIT-01' }, { unit: 'KIT-03', out: '2026-09-28T08:20' }] };
  assert.equal(readinessState(readiness(out, KIT)), 'ready', 'a unit checked out passed its checks on the way out');
  const old = { ...charged, 'KIT-01': { ...charged['KIT-01'], tested: '2026-08-01' } };
  assert.equal(readiness(EV, old).find((x) => x.id === 'kit:KIT-01:test').done, false, 'tested more than 14 days before');
});

test('the run of show: the item running now, and where the event stands', () => {
  assert.equal(currentItem(EV, '2026-09-28T10:45')?.title, 'Demo');
  assert.equal(currentItem(EV, '2026-09-28T09:00'), null);
  assert.equal(currentItem(EV, '2026-09-29T10:45'), null, 'another day');
  const c = readiness(EV, KIT);
  assert.equal(eventState(EV, c, '2026-09-28T09:00'), 'at-risk');
  assert.equal(eventState(EV, c, '2026-09-28T11:00'), 'live');
  assert.equal(eventState(EV, c, '2026-09-28T15:00'), 'ran');
});

test('live event priority: an incident in an event room during the event is P1, with its reason', () => {
  const inc = { number: 'INC1', opened: '2026-09-28T10:40', priority: 3, subject: { room: 'r2' } };
  assert.deepEqual(livePriority(inc, [EV]), { pri: 1, from: 3, reason: 'live client briefing', event: 'EVT-X' });
  assert.equal(livePriority({ ...inc, opened: '2026-09-28T09:59' }, [EV]), null, 'before it starts');
  assert.equal(livePriority({ ...inc, opened: '2026-09-28T15:00' }, [EV]), null, 'after it ends');
  assert.equal(livePriority({ ...inc, subject: { room: 'r9' } }, [EV]), null, 'another room');
  assert.equal(liveEventAt('r1', '2026-09-28T14:59', [EV])?.id, 'EVT-X');
  assert.equal(livePriority({ ...inc, opened: '2026-09-28T11:00' }, [{ ...EV, kind: 'partner-day' }]).reason, 'live partner day');
});

test('demo kit: booked to events, a clash on the same day, check-out then check-in', () => {
  const other = { ...EV, id: 'EVT-Y', date: '2026-09-28', start: '16:00', end: '18:00', demo_kit: [{ unit: 'KIT-01' }] };
  const later = { ...EV, id: 'EVT-Z', date: '2026-10-01', demo_kit: [] };
  const evs = [EV, other, later];
  assert.deepEqual(canBook('KIT-01', later, evs), { ok: true, clash: null });
  assert.equal(canBook('KIT-01', other, [EV, { ...other, demo_kit: [] }]).clash, 'EVT-X', 'the same unit on the same day');
  assert.equal(bookKit('KIT-03', later, evs).ok, true);
  assert.deepEqual(bookKit('KIT-03', later, evs).event.demo_kit, [{ unit: 'KIT-03' }]);
  assert.match(bookKit('KIT-01', EV, evs).why, /already booked to this event/);
  const b = kitBookings(evs).find((x) => x.unit === 'KIT-03' && x.event === 'EVT-X');
  assert.equal(b.out, null);
  const o = checkOut(b, '2026-09-28T08:30');
  assert.equal(o.ok, true);
  assert.equal(checkOut(o.booking, '2026-09-28T08:31').ok, false, 'not twice');
  assert.equal(checkIn(b, '2026-09-28T15:30').ok, false, 'not before it is out');
  assert.equal(checkIn(o.booking, '2026-09-28T08:00').ok, false, 'not before it went out');
  const i = checkIn(o.booking, '2026-09-28T15:30');
  assert.equal(i.ok, true);
  assert.equal(kitState('KIT-03', [o.booking], '2026-09-28T09:00').st, 'out');
  assert.equal(kitState('KIT-03', [i.booking], '2026-09-28T16:00').st, 'in');
  assert.equal(kitState('KIT-03', [b], '2026-09-27T09:00').st, 'booked');
});

test('the report after: what ran, the faults, the time lost and lessons taken from the record', () => {
  const ran = { ...EV, report: { faults: [{ at: '10:50', room: 'r2', what: 'Demo display lost signal', minutes: 7, lesson: 'Keep a spare HDMI lead at the demo table' }], dropped: ['Welcome'] } };
  const r = eventReport(ran, readiness(ran, KIT), { roomName: (id) => id.toUpperCase() });
  assert.equal(r.planned, 2);
  assert.equal(r.ran, 1);
  assert.equal(r.lost, 7);
  assert.ok(r.lessons.includes('Keep a spare HDMI lead at the demo table'));
  assert.ok(r.lessons.some((l) => /^R1 was tested 80 minutes/.test(l)) === false, 'eighty minutes is enough notice');
  assert.ok(r.lessons.some((l) => /demo kit unit 3 not charged at the start/.test(l)));
  assert.ok(r.lessons.some((l) => /"Welcome" was dropped/.test(l)));
  const tight = { ...ran, checks: { ...ran.checks, room_tests: { r1: '2026-09-28T09:40', r2: '2026-09-27T16:00' } } };
  assert.ok(eventReport(tight, [], { roomName: (id) => id.toUpperCase() }).lessons.some((l) => /^R1 was tested 20 minutes before it was used/.test(l)));
});

// ---- The demo's own events and kit ---------------------------------------------------------------------------------
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dir = join(ROOT, 'data/events');
const EVENTS = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.yaml')).map((f) => parse(readFileSync(join(dir, f), 'utf8'))) : [];
const KITFILE = existsSync(join(ROOT, 'data/demo-kit/dub.yaml')) ? parse(readFileSync(join(ROOT, 'data/demo-kit/dub.yaml'), 'utf8')) : null;
const TODAY = '2026-09-28';

test('the demo seeds about five events: past, today and upcoming, all made up', { skip: !EVENTS.length }, () => {
  assert.ok(EVENTS.length >= 4 && EVENTS.length <= 7);
  assert.ok(EVENTS.some((e) => e.date < TODAY) && EVENTS.some((e) => e.date === TODAY) && EVENTS.some((e) => e.date > TODAY));
  for (const e of EVENTS) {
    assert.equal(e.demo, true);
    assert.equal(e.client.fictional, true);
    assert.ok(e.agenda.length >= 2, `${e.id}: a run of show`);
    if (e.date < TODAY) assert.ok(e.report, `${e.id}: a past event has its report`);
  }
});

test('today\'s briefing is At risk and names what is missing; no two events hold the same kit at once', { skip: !EVENTS.length || !KITFILE }, () => {
  const kit = Object.fromEntries(KITFILE.units.map((u) => [u.id, u]));
  const today = EVENTS.find((e) => e.date === TODAY);
  const c = readiness(today, kit);
  assert.equal(readinessState(c), 'at-risk');
  assert.match(readinessLine(c), /demo kit unit \d not charged/);
  for (const e of EVENTS) for (const b of e.demo_kit ?? []) assert.equal(canBook(b.unit, e, EVENTS).ok, true, `${e.id}: ${b.unit} is not double-booked`);
});
