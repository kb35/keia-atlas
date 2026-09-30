// Home's rules (src/lib/homecore.mjs): which group a piece of work sits in, how a day is laid out in
// order, and the words for when something is due. The page runs the same rules in the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketOf, groupFor, planDay, dueWords, placeWords, clock, spanWords, listOrder } from '../src/lib/homecore.mjs';

const TODAY = '2026-09-28';   // a Monday
const task = (o) => ({ kind: 'task', who: ['liam'], site: 'dub', room: null, start: o.due, end: o.due, hours: 2, status: 'todo', title: 'Task', ...o, id: `task:${o.id ?? 'T'}` });

test('a task is Today when due today or overdue, This week within seven days, otherwise Later', () => {
  assert.equal(bucketOf(task({ due: '2026-09-28' }), TODAY), 'today');
  assert.equal(bucketOf(task({ due: '2026-09-25' }), TODAY), 'today');
  assert.equal(bucketOf(task({ due: '2026-10-02' }), TODAY), 'week');
  assert.equal(bucketOf(task({ due: '2026-10-05' }), TODAY), 'week');
  assert.equal(bucketOf(task({ due: '2026-10-06' }), TODAY), 'later');
  assert.equal(bucketOf(task({ due: null, start: null, end: null }), TODAY), 'later');
  assert.equal(bucketOf(task({ due: '2026-10-02', status: 'done' }), TODAY), 'done');
});

test('a task under way today is Today even when it is due later in the week', () => {
  assert.equal(bucketOf(task({ start: '2026-09-28', end: '2026-10-01' }), TODAY), 'today');
});

test('incidents and reports are live, so they are Today; the work plan and planning dates are Later', () => {
  assert.equal(bucketOf({ kind: 'incident', status: 'todo', start: '2026-09-24', end: TODAY }, TODAY), 'today');
  assert.equal(bucketOf({ kind: 'inbox', status: 'todo', start: '2026-09-27', end: '2026-09-27' }, TODAY), 'today');
  assert.equal(bucketOf({ kind: 'refresh', status: 'todo', start: TODAY, end: '2026-12-31' }, TODAY), 'later');
  assert.equal(bucketOf({ kind: 'time-off', status: 'booked', start: TODAY, end: TODAY }, TODAY), null);
});

test('a person\'s work is grouped and ordered: live things first, then the soonest, blocked last on a day', () => {
  const items = [
    task({ id: 'a', due: '2026-10-02', title: 'Later in the week' }),
    task({ id: 'b', due: '2026-09-28', title: 'Blocked today', status: 'blocked' }),
    task({ id: 'c', due: '2026-09-28', title: 'Due today' }),
    { id: 'inc:1', kind: 'incident', who: ['liam'], site: 'dub', start: '2026-09-28', end: TODAY, status: 'todo', title: 'Fault', prio: 3 },
    task({ id: 'd', due: '2026-10-20', title: 'Next month' }),
    task({ id: 'e', due: '2026-10-01', title: 'Not mine', who: ['tom'] }),
    { id: 'refresh:dub-3-01:2026', kind: 'refresh', who: ['liam'], site: 'dub', room: 'dub-3-01', start: TODAY, end: '2026-12-31', status: 'todo', title: 'Replace 2 devices due in 2026', units: 2, hours: 3 },
    { id: 'refresh:dub-3-02:2026', kind: 'refresh', who: ['liam'], site: 'dub', room: 'dub-3-02', start: TODAY, end: '2026-12-31', status: 'todo', title: 'Replace 1 device due in 2026', units: 1, hours: 1.5 },
  ];
  const g = groupFor(items, 'liam', TODAY);
  assert.deepEqual(g.today.map((x) => x.id), ['inc:1', 'task:c', 'task:b']);
  assert.deepEqual(g.week.map((x) => x.id), ['task:a']);
  assert.deepEqual(g.later.map((x) => x.id), ['task:d', 'refresh:dub:2026']);
  assert.equal(g.later[1].title, 'Replace 3 devices due in 2026');
  assert.equal(g.later[1].rooms, 2);
  assert.equal(g.done.length, 0);
});

test('the day runs from nine in order: incidents, then tasks by due date, each for its hours that day', () => {
  const items = [
    task({ id: 'a', start: '2026-09-28', end: '2026-09-29', hours: 6, title: 'Two-day task' }),       // 3 h today
    task({ id: 'b', start: '2026-09-28', end: '2026-09-28', hours: 1, title: 'Short task' }),
    { id: 'inc:1', kind: 'incident', who: ['liam'], site: 'dub', start: '2026-09-28', end: TODAY, hours: 2, status: 'todo', title: 'Fault', prio: 3 },
    task({ id: 'c', start: '2026-10-02', end: '2026-10-02', title: 'Not today' }),
    { id: 'off:1', kind: 'time-off', who: ['liam'], start: TODAY, end: TODAY, hours: 0, status: 'booked', title: 'Time off' },
  ];
  const plan = planDay(items, 'liam', TODAY);
  assert.deepEqual(plan.map((x) => [x.it.id, x.from, x.to]), [['inc:1', 9, 11], ['task:b', 11, 12], ['task:a', 12, 15]]);
});

test('a visit takes the whole day; work past six o\'clock is listed without a place on the bar', () => {
  const items = [
    { id: 'visit:1', kind: 'visit', who: ['tom'], site: 'cph', start: TODAY, end: TODAY, hours: 6, status: 'booked', title: 'Site visit' },
    task({ id: 'a', who: ['tom'], start: TODAY, end: TODAY, hours: 8, title: 'Long' }),
    task({ id: 'b', who: ['tom'], start: TODAY, end: TODAY, hours: 2, title: 'Spill' }),
  ];
  const plan = planDay(items, 'tom', TODAY);
  assert.deepEqual(plan.map((x) => [x.it.id, x.from, x.to]), [['task:a', 9, 17], ['task:b', 17, 18], ['visit:1', 9, 18]]);
  const more = planDay([...items, task({ id: 'c', who: ['tom'], start: TODAY, end: TODAY, hours: 1, title: 'Z, last by name' })], 'tom', TODAY);
  assert.deepEqual(more.find((x) => x.it.id === 'task:c').from, null);
});

test('due words and clock words read plainly', () => {
  assert.equal(dueWords(task({ due: '2026-09-25' }), TODAY), '3 days late');
  assert.equal(dueWords(task({ due: '2026-09-27' }), TODAY), '1 day late');
  assert.equal(dueWords(task({ due: '2026-09-28' }), TODAY), 'Today');
  assert.equal(dueWords(task({ due: '2026-09-29' }), TODAY), 'Tomorrow');
  assert.equal(dueWords(task({ due: '2026-10-01' }), TODAY), 'In 3 days');
  assert.equal(dueWords(task({ due: '2026-10-20' }), TODAY, (d) => d.slice(5)), '10-20');
  assert.equal(dueWords({ kind: 'incident', start: '2026-09-24', end: TODAY }, TODAY), 'Open 4 days');
  assert.equal(clock(9), '09:00'); assert.equal(clock(13.5), '13:30');
  assert.equal(spanWords(0.5), '30 min'); assert.equal(spanWords(2), '2 h'); assert.equal(spanWords(1.5), '1.5 h');
});

test('where someone is today, in words', () => {
  const names = { siteName: (s) => ({ dub: 'Dublin office' })[s], roomName: (r) => ({ 'rem-bray-01': 'Bray home office 1' })[r] };
  assert.equal(placeWords({ kind: 'office', site: 'dub' }, names).text, 'At the Dublin office');
  assert.equal(placeWords({ kind: 'home', place: 'rem-bray-01' }, names).text, 'At home, Bray home office 1');
  assert.equal(placeWords({ kind: 'away', why: 'time-off', off: { note: 'Holiday' } }, names).text, 'Away: Holiday');
  assert.equal(placeWords({ kind: 'away', why: 'weekend' }, names).text, 'Weekend');
  assert.equal(placeWords({ kind: 'visiting', site: 'dub', place: 'dub' }, names).text, 'Visiting the Dublin office');
});

test('list order puts an incident before a task and a P2 before a P3', () => {
  const a = { kind: 'incident', prio: 3, title: 'a' }, b = { kind: 'incident', prio: 2, title: 'b' }, c = task({ due: TODAY });
  assert.deepEqual([c, a, b].sort(listOrder).map((x) => x.title), ['b', 'a', 'Task']);
});
