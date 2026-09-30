// Who has a job (src/lib/ownership.mjs), where pages open and how dense they are (src/lib/depth.mjs), the handover card
// (src/lib/handover.mjs) and the Home cockpit's rules (src/lib/homecore.mjs cockpit()).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipOf, verbsFor, apply, historyLine, clockWords, isMine, hasIt } from '../src/lib/ownership.mjs';
import { chipHtml } from '../src/lib/withchip.mjs';
import { depthFor, withDepth, openingLayer, densityFor, withDensity, confirmWords, store } from '../src/lib/depth.mjs';
import { parkRead, parkEdit, slotsHtml } from '../src/lib/handover.mjs';
import { cockpit, LAYOUT, rowState } from '../src/lib/homecore.mjs';

const people = { liam: { name: 'Liam Doyle', first: 'Liam', initials: 'LD' }, priya: { name: 'Priya Nair', first: 'Priya', initials: 'PN' } };
const T = '2026-09-28';

test('the chip says who has it, from the viewer\'s side', () => {
  const own = { s: 'with', to: 'liam', kind: 'person', at: '2026-09-28T07:54' };
  assert.equal(chipOf(own, 'liam', { people, today: T }).text, 'With you');
  assert.equal(chipOf(own, 'liam', { people, today: T }).sub, 'since 07:54');
  assert.equal(chipOf(own, 'priya', { people, today: T }).text, 'With Liam');
  assert.equal(chipOf({ ...own, at: '2026-09-25T15:05' }, 'priya', { people, today: T }).sub, 'since 25 Sep');
  assert.equal(chipOf({ s: 'ready', to: 'liam' }, 'liam', { people }).text, 'Ready for you');
  assert.equal(chipOf({ s: 'ready', to: null }, 'liam', { people }).text, 'Ready to take');
  assert.equal(chipOf({ s: 'waiting', to: 'liam', wait: 'parts (ETA Thu)' }, 'liam', { people }).text, 'Waiting on: parts (ETA Thu)');
  const v = chipOf({ s: 'with', to: 'poly', kind: 'vendor', name: 'Poly', why: 'Fan noise, swap under warranty', clock: '16:00' }, 'liam', { people });
  assert.equal(v.key, 'vendor'); assert.equal(v.text, 'With Poly (vendor)'); assert.match(v.sub, /due 16:00/);
  assert.equal(chipOf({ s: 'parked', to: 'liam', at: '2026-09-28T10:14' }, 'liam', { people, today: T }).text, 'Parked by you');
  assert.equal(chipOf({ s: 'auto', rule: { name: 'DNS rule', owner: 'priya' } }, 'liam', { people }).sub, 'DNS rule (Priya)');
  assert.equal(chipOf({ s: 'unable', rule: { name: 'DNS rule' } }, 'liam', { people }).text, 'Unable to complete, rolled back');
});

test('Take, Hand to, Park and Resume each make the next record, and the park card is kept', () => {
  let o = { s: 'ready', to: 'liam', kind: 'person' };
  assert.deepEqual(verbsFor(o, 'liam'), ['take', 'hand']);
  assert.deepEqual(verbsFor(o, 'priya'), []);
  assert.deepEqual(verbsFor(o, 'priya', { desk: true }), ['take', 'hand']);
  o = apply('take', o, { who: 'liam', at: 'x' });
  assert.equal(o.s, 'with'); assert.ok(hasIt(o, 'liam')); assert.deepEqual(verbsFor(o, 'liam'), ['park', 'hand']);
  o = apply('park', o, { who: 'liam', at: 'y', card: { where: ' Ports 1 to 8 ', next: 'Move 9 to 12' } });
  assert.equal(o.s, 'parked'); assert.equal(o.park.where, 'Ports 1 to 8'); assert.equal(o.park.question, '');
  assert.deepEqual(verbsFor(o, 'liam'), ['resume', 'hand']);
  const r = apply('resume', o, { who: 'liam', at: 'z' });
  assert.equal(r.s, 'with'); assert.equal(r.was.next, 'Move 9 to 12');
  assert.equal(historyLine(o, r, { people }), 'Liam Doyle resumed it');
  const h = apply('hand', r, { who: 'liam', at: 'w', target: { id: 'team-network', kind: 'team', name: 'Network team' }, why: 'needs a switch config change' });
  assert.equal(chipOf(h, 'liam', { people }).key, 'team');
  assert.equal(historyLine(r, h, { people }), 'Liam Doyle handed it to Network team: needs a switch config change');
  assert.ok(!isMine(h, 'liam'));
  assert.throws(() => apply('delete', o, {}));
});

test('times: today reads as a clock, earlier days as a date; a live change reads in the viewer\'s clock', () => {
  assert.equal(clockWords('2026-09-28T07:54', T), '07:54');
  assert.equal(clockWords('2026-09-25T15:05', T), '25 Sep');
  assert.equal(clockWords('2026-10-06', T), '6 Oct');
  const now = new Date('2026-09-30T10:00:00');
  assert.match(clockWords(new Date('2026-09-30T09:15:00').toISOString(), T, now), /^\d\d:\d\d$/);
});

test('the chip markup carries the item, the words and the history peek', () => {
  const html = chipHtml(chipOf({ s: 'with', to: 'liam', kind: 'person', at: '2026-09-28T07:54' }, 'liam', { people, today: T }), { item: 'inc:INC1', history: [{ at: '07:54', text: 'Liam took it' }] });
  assert.match(html, /data-wc-item="inc:INC1"/); assert.match(html, /With you/); assert.match(html, /data-peek/); assert.match(html, /Liam took it/);
  assert.doesNotMatch(chipHtml(chipOf(null, 'liam', {}), {}), /data-peek/);
});

test('depth is remembered per person per kind; the address wins; density defaults by look', () => {
  let all = withDepth({}, 'liam', 'home', 'record');
  assert.equal(depthFor(all, 'liam', 'home'), 'record');
  assert.equal(depthFor(all, 'priya', 'home'), null);
  all = withDepth(all, 'liam', 'home', 'band');
  assert.deepEqual(all, {});
  assert.equal(openingLayer('#raw', 'record'), 'raw');
  assert.equal(openingLayer('', 'record'), 'record');
  assert.equal(openingLayer('#ready', 'record'), null);
  assert.equal(densityFor({}, 'liam', 'studio'), 'comfortable');
  assert.equal(densityFor({}, 'liam', 'enterprise'), 'compact');
  assert.equal(densityFor(withDensity({}, 'liam', 'compact'), 'liam', 'studio'), 'compact');
  assert.equal(confirmWords('space'), 'Spaces now open here');
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } };
  const s = store(mem); s.setDepth('liam', 'space', 'raw');
  assert.equal(s.depth('liam', 'space'), 'raw'); s.resetDepth('liam'); assert.equal(s.depth('liam', 'space'), null);
});

test('the handover card keeps one fixed format for park, cover and welcome back', () => {
  assert.match(parkRead({ where: 'A', next: 'B', question: 'C' }), /Where I stopped[\s\S]*Next step[\s\S]*Open question/);
  assert.match(parkRead({}), /no notes left/);
  assert.equal((parkEdit().match(/<input/g) ?? []).length, 3);
  const cover = slotsHtml('cover', {}), welcome = slotsHtml('welcome', { open: { lines: [{ title: 'Job' }] } });
  assert.deepEqual([...cover.matchAll(/data-slot="(\w+)"/g)].map((m) => m[1]), ['open', 'fragile', 'owns', 'changed']);
  assert.deepEqual([...welcome.matchAll(/data-slot="(\w+)"/g)].map((m) => m[1]), ['open', 'handled', 'changed', 'refresh']);
  assert.match(welcome, /Nothing closed while you were away/);
});

test('the cockpit: four figures, one answer, and each role\'s order', () => {
  const items = {
    'inc:1': { id: 'inc:1', kind: 'incident', title: 'Panel stuck', who: ['liam'], site: 'dub', room: 'dub-4-05', prio: 3, status: 'todo', start: T, end: T },
    'task:1': { id: 'task:1', kind: 'task', title: 'Label ports', who: ['liam'], site: 'dub', status: 'todo', start: '2026-11-10', end: '2026-11-13' },
  };
  const own = { 'inc:1': { s: 'ready', to: 'liam', kind: 'person', at: `${T}T07:58` }, 'task:1': { s: 'parked', to: 'liam', kind: 'person', at: `${T}T10:14`, park: {} } };
  const H = {
    today: T, items, openInc: 'new,in-progress,on-hold', sites: { dub: { name: 'Dublin office', remote: false } },
    people: { liam: { id: 'liam', roleId: 'tech', office: 'dub', first: 'Liam' } }, numbers: { liam: [] },
    cockpit: { review: { liam: [{ title: 'x' }] }, inc: { 'inc:1': { past: false, newToday: true } }, siteHealth: { dub: { n: 34, fault: ['dub-4-05'], review: [] } }, offices: ['dub'], extra: { liam: {} } },
  };
  const m = cockpit(H, (id) => own[id], 'liam');
  assert.deepEqual(m.figures.map((f) => [f.label, f.n]), [['Ready for you', 1], ['With you', 1], ['Today', 1], ['To review', 1]]);
  assert.equal(m.figures[0].tone, 'bad');
  assert.equal(m.answer, 'Dublin: 1 space with a fault · 33 spaces ready');
  assert.deepEqual(m.layout, LAYOUT.field);
  assert.equal(rowState(items['inc:1'], own['inc:1']), 'fault');
  assert.equal(rowState(items['task:1'], own['task:1']), 'progress');
  own['inc:1'] = { s: 'with', to: 'liam', kind: 'person' };
  const m2 = cockpit(H, (id) => own[id], 'liam');
  assert.equal(m2.ready.length, 0); assert.equal(m2.withYou.length, 2); assert.equal(m2.figures[0].tone, '');
});
