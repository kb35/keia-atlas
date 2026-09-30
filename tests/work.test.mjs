// Tests for the one work shape (src/lib/workcore.mjs, decision 0025): the defaults for a task's start
// and where, each source turned into a work item, and the views by person, day, site and kind.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  workBack, taskStart, taskWhere, fromTask, fromIncident, fromLab, fromPlanEvent, fromInbox, fromTimeOff, fromVisit, fromRefresh,
  byPerson, byDay, bySite, byKind, hoursPerDay, whereOn, weekday,
} from '../src/lib/workcore.mjs';

const project = { id: 'PRJ-12', site: 'nyc' };
const roomSite = (id) => ({ 'nyc-20-05': 'nyc', 'rem-bray-01': 'rem' })[id] ?? null;

test('a task starts on its due day when it fits in one working day', () => {
  assert.equal(taskStart({ due: '2026-10-02', hours: 6 }), '2026-10-02');
  assert.equal(taskStart({ due: '2026-10-02', hours: 2 }), '2026-10-02');
});

test('longer tasks are worked back from the due date at six hours a day, skipping weekends', () => {
  // Due Tuesday 6 October, 16 hours: three working days, so it starts on Friday 2 October.
  assert.equal(workBack('2026-10-06', 16), '2026-10-02');
  assert.equal(taskStart({ due: '2026-10-06', hours: 12 }), '2026-10-05');
  assert.equal(taskStart({ due: '2026-10-06' }), '2026-10-06');
});

test('a written start wins, and no due date means no start', () => {
  assert.equal(taskStart({ due: '2026-10-06', hours: 40, start: '2026-09-01' }), '2026-09-01');
  assert.equal(taskStart({ hours: 4 }), null);
});

test('survey, install, configure, commission and records are on site; the rest remote unless it says', () => {
  for (const kind of ['survey', 'install', 'configure', 'commission', 'records']) assert.equal(taskWhere({ kind }), 'onsite', kind);
  for (const kind of ['provision', 'design', 'order', 'handover', undefined]) assert.equal(taskWhere({ kind }), 'remote', String(kind));
  assert.equal(taskWhere({ kind: 'install', where: 'remote' }), 'remote');
});

test('a task becomes a work item at its room\'s site', () => {
  const it = fromTask(project, { id: 'T-1204', title: 'Install', owner: 'liam', space: 'nyc-20-05', due: '2026-10-02', hours: 6, kind: 'install', status: 'doing', phase: 'integrate' }, { roomSite, link: (p) => `/base${p}` });
  assert.deepEqual(
    { id: it.id, kind: it.kind, who: it.who, site: it.site, room: it.room, start: it.start, end: it.end, hours: it.hours, status: it.status, href: it.href, project: it.project, where: it.where },
    { id: 'task:T-1204', kind: 'task', who: ['liam'], site: 'nyc', room: 'nyc-20-05', start: '2026-10-02', end: '2026-10-02', hours: 6, status: 'doing', href: '/base/projects/prj-12/tasks/t-1204/', project: 'PRJ-12', where: 'onsite' },
  );
  // A task at a home office is at that remote site, not the project's.
  assert.equal(fromTask({ id: 'PRJ-20', site: 'dub' }, { id: 'T-1', title: 'x', owner: 'tom', space: 'rem-bray-01', status: 'todo' }, { roomSite }).site, 'rem');
});

test('incidents, Lab tests, plan events, inbox reports, time off, visits and the work plan share the shape', () => {
  const inc = fromIncident({ number: 'INC1', short_description: 'Gateway restarts', opened: '2026-09-24T16:30', state: 'on-hold', priority: 3, subject: { room: 'rem-bray-01' },
    history: [{ at: '2026-09-24T16:30', state: 'new' }, { at: '2026-09-25T09:10', state: 'in-progress', by: 'priya' }], keia_atlas: { assigned: 'priya' } }, { roomSite, today: '2026-09-28' });
  assert.deepEqual([inc.id, inc.status, inc.who[0], inc.site, inc.start, inc.end, inc.hours], ['inc:INC1', 'blocked', 'priya', 'rem', '2026-09-24', '2026-09-28', 2]);
  const lab = fromLab({ id: 'LAB-07', title: 'x', owner: 'niamh', with: ['aoife'], status: 'testing', start: '2026-09-21', checks: [{}, {}, {}] }, { siteOf: () => 'dub' });
  assert.deepEqual([lab.who, lab.site, lab.end, lab.hours, lab.status, lab.href], [['niamh', 'aoife'], 'dub', '2026-10-11', 6, 'doing', '/lab/#lab-07']);
  const freeze = fromPlanEvent({ id: 'fy' }, { kind: 'freeze', date: '2026-12-14', end: '2027-01-08', title: 'Freeze' }, 3, { today: '2026-09-28' });
  assert.deepEqual([freeze.id, freeze.who, freeze.end, freeze.status], ['plan:fy:3', [], '2027-01-08', 'booked']);
  const inbox = fromInbox({ id: 'RPT-1', kind: 'urgent', to: 'sofia', by: 'sam', at: '2026-09-28T09:40', status: 'new', about: { label: 'Heron', to: '/rooms/nyc-20-05/' } }, { roomSite });
  assert.deepEqual([inbox.id, inbox.who, inbox.site, inbox.room, inbox.status], ['inbox:RPT-1', ['sofia'], 'nyc', 'nyc-20-05', 'todo']);
  assert.deepEqual(fromTimeOff({ id: 's1', who: 'tom', from: '2026-10-12', to: '2026-10-16', note: '' }).who, ['tom']);
  assert.equal(fromVisit({ date: '2026-10-06', title: 'Visit', site: 'cph', who: ['tom'] }, 0).id, 'visit:0');
  const r = fromRefresh({ room: 'nyc-20-05', site: 'nyc', year: 2026, units: 2, hours: 5 }, { today: '2026-09-28' });
  assert.deepEqual([r.id, r.start, r.end, r.title], ['refresh:nyc-20-05:2026', '2026-09-28', '2026-12-31', 'Replace 2 devices due in 2026']);
});

const items = [
  { id: 'a', kind: 'task', who: ['aoife'], site: 'dub', start: '2026-09-28', end: '2026-09-30', hours: 6 },
  { id: 'b', kind: 'task', who: ['aoife', 'liam'], site: 'nyc', start: '2026-10-02', end: '2026-10-05', hours: 12 },
  { id: 'c', kind: 'plan', who: [], site: null, start: '2026-10-01', end: '2026-10-01', hours: 0 },
  { id: 'd', kind: 'incident', who: ['liam'], site: 'dub', start: null, end: null, hours: 2 },
];

test('byPerson lists an item under everyone on it; bySite and byKind group by one value', () => {
  const p = byPerson(items);
  assert.deepEqual(p.get('aoife').map((x) => x.id), ['a', 'b']);
  assert.deepEqual(p.get('liam').map((x) => x.id), ['b', 'd']);
  assert.deepEqual([...bySite(items).keys()], ['dub', 'nyc']);
  assert.deepEqual(byKind(items).get('task').map((x) => x.id), ['a', 'b']);
});

test('byDay gives every weekday in the range with the items that touch it', () => {
  const d = byDay(items, { from: '2026-09-28', to: '2026-10-05' });
  assert.deepEqual([...d.keys()], ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05']);
  assert.deepEqual(d.get('2026-09-30').map((x) => x.id), ['a']);
  assert.deepEqual(d.get('2026-10-01').map((x) => x.id), ['c']);
  assert.deepEqual(d.get('2026-10-05').map((x) => x.id), ['b']);
  assert.equal(byDay(items, { from: '2026-10-03', to: '2026-10-04', weekends: true }).get('2026-10-03')[0].id, 'b');
});

test('hours are spread over working days only', () => {
  assert.equal(hoursPerDay(items[1]), 6); // Friday and Monday
  assert.equal(hoursPerDay(items[3]), 0);
});

test('whereOn: away on time off, in the office on office days, otherwise at home or remote', () => {
  const aoife = { id: 'aoife', base: 'rem-maynooth-01', office: 'dub', office_days: ['tue', 'thu'], home: true };
  const olivia = { id: 'olivia', base: 'dub', office: 'dub', office_days: ['mon', 'tue', 'wed', 'thu'], home: false };
  assert.equal(weekday('2026-09-29'), 'tue');
  assert.deepEqual(whereOn(aoife, '2026-09-29'), { kind: 'office', place: 'dub' });
  assert.deepEqual(whereOn(aoife, '2026-09-30'), { kind: 'home', place: 'rem-maynooth-01' });
  assert.deepEqual(whereOn(olivia, '2026-10-02'), { kind: 'remote', place: null });
  assert.deepEqual(whereOn(aoife, '2026-10-06', [{ who: 'aoife', from: '2026-10-05', to: '2026-10-09' }]), { kind: 'away', place: null });
});
