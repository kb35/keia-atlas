// Tests for the Schedule's rules (src/lib/schedulecore.mjs): where someone is on a day, load, Me / My team /
// Everyone, who may assign what, the Unscheduled tray, and an item after the live layer's events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monday, weekDays, addWorkdays, workdaysIn, chipKind, placeOn, dayLoad, weekLoad, loadBand, reportsOf, teamOf,
  scopePeople, defaultsFor, assignRights, canAssign, canHandOut, unscheduled, baseOf, applyState,
} from '../src/lib/schedulecore.mjs';

const people = [
  { id: 'boss', roleId: 'delivery-manager', team: 'delivery', reportsTo: null, office: 'dub', base: 'dub', office_days: ['mon', 'tue', 'wed', 'thu', 'fri'], country: 'IE' },
  { id: 'lead', roleId: 'tech-manager', team: 'onsite', region: 'emea', reportsTo: 'boss', office: 'lon', base: 'lon', office_days: ['mon', 'tue', 'wed', 'thu', 'fri'], country: 'GB' },
  { id: 'liam', name: 'Liam Doyle', roleId: 'tech', team: 'onsite', region: 'emea', reportsTo: 'lead', office: 'dub', base: 'dub', office_days: ['mon', 'tue', 'wed', 'thu', 'fri'], country: 'IE' },
  { id: 'tom', name: 'Tom Ashby', roleId: 'tech', team: 'onsite', region: 'emea', reportsTo: 'lead', office: 'lon', base: 'lon', office_days: ['mon', 'tue', 'wed', 'thu', 'fri'], country: 'GB' },
  { id: 'anna', name: 'Anna Byrne', roleId: 'delivery', team: 'delivery', region: 'emea', reportsTo: 'boss', office: 'dub', base: 'rem-maynooth-01', home: true, office_days: ['tue', 'thu'], country: 'IE' },
  { id: 'ruth', roleId: 'pm', team: 'delivery', region: 'emea', reportsTo: 'boss', office: 'dub', base: 'rem-bray-01', home: true, office_days: ['wed'], country: 'IE' },
  { id: 'sam', roleId: 'vendor', team: 'vendor', vendor: true, reportsTo: null, office: 'jnu', base: 'jnu', office_days: ['mon'], country: 'US' },
];
const projects = [{ id: 'PRJ-12', owner: 'ruth', phase: 'integrate', people: ['ruth', 'anna', 'liam'] }];
const sites = { dub: { region: 'emea' }, lon: { region: 'emea' }, nyc: { region: 'amer' }, rem: { region: 'emea' } };
const timeOff = [{ id: 's0', who: 'anna', from: '2026-10-05', to: '2026-10-09', status: 'approved' }];
const holidays = [{ country: 'IE', date: '2026-10-26', name: 'October Bank Holiday' }];
const P = (id) => people.find((p) => p.id === id);

test('weeks start on Monday, and working days skip weekends', () => {
  assert.equal(monday('2026-10-01'), '2026-09-28');
  assert.equal(monday('2026-10-04'), '2026-09-28');
  assert.deepEqual(weekDays('2026-09-28'), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.equal(addWorkdays('2026-10-02', 1), '2026-10-05');
  assert.equal(addWorkdays('2026-10-05', -1), '2026-10-02');
  assert.equal(workdaysIn('2026-09-28', '2026-10-09'), 10);
});

test('chips show the Deploy step, otherwise the kind of work', () => {
  assert.equal(chipKind({ kind: 'task', taskKind: 'install' }), 'install');
  assert.equal(chipKind({ kind: 'task', taskKind: 'design' }), 'task');
  assert.equal(chipKind({ kind: 'incident' }), 'incident');
});

test('where someone is: time off, holidays, visits and on-site work, office days, home', () => {
  const items = [
    { id: 'visit:0', kind: 'visit', who: ['tom'], site: 'cph', room: null, start: '2026-10-06', end: '2026-10-06' },
    { id: 'task:T-1', kind: 'task', taskKind: 'install', where: 'onsite', who: ['liam'], site: 'rem', room: 'rem-drogheda-02', start: '2026-10-06', end: '2026-10-06' },
    { id: 'task:T-2', kind: 'task', taskKind: 'design', where: 'remote', who: ['anna'], site: 'nyc', start: '2026-09-28', end: '2026-09-28' },
  ];
  const ctx = { timeOff, holidays, items };
  assert.equal(placeOn(P('anna'), '2026-10-06', ctx).why, 'time-off');
  assert.equal(placeOn(P('liam'), '2026-10-26', ctx).why, 'holiday');
  assert.equal(placeOn(P('tom'), '2026-10-26', ctx).kind, 'office', 'a holiday in Ireland is not one in London');
  assert.deepEqual([placeOn(P('tom'), '2026-10-06', ctx).kind, placeOn(P('tom'), '2026-10-06', ctx).site], ['visiting', 'cph']);
  assert.deepEqual([placeOn(P('liam'), '2026-10-06', ctx).place, placeOn(P('liam'), '2026-10-06', ctx).site], ['rem-drogheda-02', 'rem']);
  assert.deepEqual([placeOn(P('anna'), '2026-09-28', ctx).kind, placeOn(P('anna'), '2026-09-28', ctx).site], ['home', 'rem'], 'remote work does not move her');
  assert.deepEqual([placeOn(P('anna'), '2026-09-29', ctx).kind, placeOn(P('anna'), '2026-09-29', ctx).place], ['office', 'dub']);
  assert.equal(placeOn(P('anna'), '2026-10-03', ctx).why, 'weekend');
  assert.equal(placeOn(P('anna'), '2026-10-06', { ...ctx, timeOff: [{ ...timeOff[0], status: 'pending' }] }).kind, 'office', 'a pending request is not time off yet');
});

test('load: hours spread over their days, project time not in tasks, none of it on days off', () => {
  const items = [
    { id: 'a', kind: 'task', who: ['anna'], start: '2026-09-28', end: '2026-09-30', hours: 12 },
    { id: 'b', kind: 'refresh', who: ['anna'], start: '2026-09-28', end: '2026-12-31', hours: 50 },
    { id: 'c', kind: 'time-off', who: ['anna'], start: '2026-09-28', end: '2026-09-28', hours: 0 },
  ];
  const reserved = [{ who: 'anna', from: '2026-09-28', to: '2026-10-30', perDay: 1 }];
  assert.equal(dayLoad('anna', '2026-09-28', items), 4, 'an unbooked work-plan item takes no day');
  assert.equal(dayLoad('anna', '2026-09-28', items, reserved), 5);
  const wk = weekLoad(P('anna'), '2026-09-28', { items, reserved, timeOff, holidays });
  assert.deepEqual(wk, { hours: 17, cap: 30 });
  const off = weekLoad(P('anna'), '2026-10-05', { items, reserved, timeOff, holidays });
  assert.deepEqual(off, { hours: 0, cap: 0 }, 'a week off books no project time');
  assert.deepEqual([loadBand(0, 30), loadBand(10, 30), loadBand(20, 30), loadBand(30, 30), loadBand(40, 30), loadBand(2, 0)], [0, 1, 2, 3, 4, 4]);
});

test('Me, My team and Everyone', () => {
  assert.deepEqual(reportsOf('boss', people).sort(), ['anna', 'lead', 'liam', 'ruth', 'tom']);
  assert.deepEqual(teamOf('lead', people).sort(), ['lead', 'liam', 'tom']);
  assert.deepEqual(teamOf('ruth', people, projects).sort(), ['anna', 'liam', 'ruth'], 'a project manager\'s team is their project team');
  assert.deepEqual(teamOf('liam', people).sort(), ['lead', 'liam', 'tom'], 'otherwise: their manager and the people beside them');
  assert.deepEqual(teamOf('sam', people), ['sam']);
  assert.equal(scopePeople('all', 'liam', people).size, people.length);
  assert.deepEqual([...scopePeople('me', 'liam', people)], ['liam']);
});

test('each role opens on its own view', () => {
  assert.deepEqual(defaultsFor('tech'), { scope: 'me', view: 'week' });
  assert.deepEqual(defaultsFor('pm'), { scope: 'me', view: 'week' });
  assert.deepEqual(defaultsFor('tech-manager'), { scope: 'team', view: 'week' });
  assert.deepEqual(defaultsFor('programme'), { scope: 'all', view: 'year' });
  assert.deepEqual(defaultsFor('sm-av'), { scope: 'all', view: 'year' });
  assert.deepEqual(defaultsFor('desk'), { scope: 'all', view: 'day' });
});

test('who may assign what, to whom', () => {
  const ctx = { people, projects, sites };
  const task = { id: 'task:T-1', kind: 'task', status: 'todo', who: ['liam'], project: 'PRJ-12', site: 'dub' };
  assert.equal(assignRights('boss', people), 'all');
  assert.equal(assignRights('lead', people), 'reports');
  assert.equal(assignRights('ruth', people), 'pm');
  assert.equal(assignRights('liam', people), null);
  assert.equal(assignRights('sam', people), null);
  assert.ok(canAssign('lead', task, 'tom', ctx));
  assert.ok(!canAssign('lead', task, 'anna', ctx), 'not someone else\'s report');
  assert.ok(canAssign('ruth', task, 'anna', ctx));
  assert.ok(!canAssign('ruth', task, 'tom', ctx), 'not outside the project team');
  assert.ok(!canAssign('ruth', { ...task, project: 'PRJ-99' }, 'anna', ctx), 'not another project');
  assert.ok(!canAssign('liam', task, 'liam', ctx));
  assert.ok(!canAssign('boss', { ...task, status: 'done' }, 'tom', ctx), 'done work stays done');
  assert.ok(!canAssign('boss', { ...task, kind: 'time-off' }, 'tom', ctx));
  assert.ok(canHandOut('lead', task, ctx));
  assert.ok(!canHandOut('lead', { ...task, who: ['anna'] }, ctx));
  assert.ok(canHandOut('lead', { ...task, who: [], site: 'lon' }, ctx), 'unowned work in their region');
  assert.ok(!canHandOut('lead', { ...task, who: [], site: 'nyc' }, ctx));
});

test('Unscheduled: needs cover, nobody on it, work plan to book', () => {
  const items = [
    { id: 'task:T-9', kind: 'task', status: 'todo', who: ['anna'], project: 'PRJ-12', site: 'dub', start: '2026-10-06', end: '2026-10-06', hours: 3 },
    { id: 'task:T-8', kind: 'task', status: 'todo', who: ['anna'], project: 'PRJ-12', site: 'dub', start: '2026-10-13', end: '2026-10-13', hours: 3 },
    { id: 'refresh:dub-1:2026', kind: 'refresh', status: 'todo', who: ['liam'], site: 'dub', start: '2026-09-28', end: '2026-12-31', hours: 5 },
    { id: 'refresh:lon-1:2026', kind: 'refresh', status: 'todo', who: [], site: 'lon', start: '2026-09-28', end: '2026-12-31', hours: 5 },
    { id: 'task:T-7', kind: 'task', status: 'done', who: ['anna'], project: 'PRJ-12', site: 'dub', start: '2026-10-06', end: '2026-10-06' },
  ];
  const ctx = { items, people, projects, sites, today: '2026-09-28', horizon: '2026-12-31', timeOff, holidays };
  assert.deepEqual(unscheduled('boss', ctx).map((u) => [u.item.id, u.why]), [['task:T-9', 'cover'], ['refresh:lon-1:2026', 'nobody'], ['refresh:dub-1:2026', 'book']]);
  assert.deepEqual(unscheduled('ruth', ctx).map((u) => u.item.id), ['task:T-9'], 'a project manager sees their own projects');
  assert.deepEqual(unscheduled('lead', ctx).map((u) => u.item.id), ['refresh:lon-1:2026', 'refresh:dub-1:2026']);
  assert.deepEqual(unscheduled('liam', ctx), []);
  const booked = items.map((it) => (it.id === 'refresh:dub-1:2026' ? applyState(it, { start: '2026-10-07' }) : it));
  assert.ok(!unscheduled('boss', { ...ctx, items: booked }).some((u) => u.item.id === 'refresh:dub-1:2026'), 'booked on a day, it leaves the tray');
});

test('an item after the live layer\'s events: owner first, start moved by whole working days', () => {
  const it = { id: 'task:T-1', kind: 'task', who: ['anna', 'liam'], start: '2026-10-01', end: '2026-10-05', hours: 12 };
  assert.deepEqual(baseOf(it), { owner: 'anna', start: '2026-10-01' });
  assert.equal(applyState(it, baseOf(it)), it, 'no change, same item');
  const moved = applyState(it, { owner: 'tom', start: '2026-10-08' });
  assert.deepEqual([moved.who, moved.start, moved.end, moved.moved], [['tom', 'liam'], '2026-10-08', '2026-10-12', true]);
  const plan = { id: 'refresh:x:2026', kind: 'refresh', who: [], start: '2026-09-28', end: '2026-12-31', hours: 8 };
  assert.deepEqual(baseOf(plan), { owner: null, start: null });
  const b = applyState(plan, { owner: 'liam', start: '2026-10-07' });
  assert.deepEqual([b.who, b.start, b.end, b.booked], [['liam'], '2026-10-07', '2026-10-08', true]);
});
