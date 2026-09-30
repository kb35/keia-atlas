// Vendors and partners (src/lib/vendors.mjs): one contract clock both sides see, paused while waiting on the client;
// access tied to a job and ended when it closes; no standing access; performance from the records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, NOW, addWorkingDays, dueOf, contractClock, accessOf, accessRegister, partnerBand, jobsFor, performance, contractLeft, spanWords, papersOf, NOT_SHARED } from '../src/lib/vendors.mjs';

const job = (o) => ({ id: 'J', vendor: 'v', person: 'p', kind: 'incident', title: 't', space: 's', handedAt: '2026-09-28T09:40', state: 'with', ...o });

test('working days skip the weekend', () => {
  assert.equal(addWorkingDays('2026-09-25T10:00', 1), '2026-09-28T10:00'); // Friday to Monday
  assert.equal(addWorkingDays('2026-09-28T10:00', 5), '2026-10-05T10:00');
});

test('the contract clock counts from the hand-off to the contract\'s service level', () => {
  const j = job({ sla: { what: 'P1', kind: 'response', hours: 4 } });
  assert.equal(dueOf(j), '2026-09-28T13:40');
  const c = contractClock(j, '2026-09-28T12:00');
  assert.equal(c.left, 100); assert.equal(c.past, false);
  assert.equal(c.text, 'Response due 13:40 · 1 h 40 min left');
});

test('past the clock says by how long, in words', () => {
  const c = contractClock(job({ handedAt: '2026-09-18T10:00', sla: { kind: 'fix', workdays: 5 } }), NOW);
  assert.ok(c.past);
  assert.equal(c.text, 'Past the clock by 3 days 2 h · was due Fri 25 Sep, 10:00');
});

test('waiting on the client stops the clock for both sides, and says why', () => {
  const w = job({ handedAt: '2026-09-25T10:00', sla: { kind: 'fix', workdays: 1 }, state: 'waiting', wait: 'client site access', waitFrom: '2026-09-28T12:10' });
  const a = contractClock(w, '2026-09-28T12:30'), b = contractClock(w, '2026-10-02T09:00');
  assert.equal(a.left, b.left, 'the clock does not move while waiting');
  assert.ok(a.paused && a.past);
  assert.equal(a.text, 'Clock paused, waiting on client site access · 2 h 10 min past');
});

test('access is tied to the job: its space, unit, build sheet and timeline, ending when the job closes', () => {
  const open = accessOf(job({}));
  assert.deepEqual(open.scope, ['space', 'unit', 'buildsheet', 'timeline']);
  assert.equal(open.ends, 'Access ends when this job closes');
  const done = accessOf(job({ state: 'done', closedAt: '2026-09-22T09:30' }));
  assert.equal(done.open, false); assert.match(done.ends, /^Access ended when the job closed/);
  for (const k of ['floor', 'other', 'ip']) assert.ok(NOT_SHARED.some((n) => n.id === k), k);
});

test('the access register lists a grant per job, newest first, and no standing access', () => {
  const R = accessRegister(JOBS);
  assert.equal(R.rows.length, JOBS.length);
  assert.equal(R.standing, 0);
  assert.equal(R.open + R.ended, JOBS.length);
  assert.ok(R.rows.every((r, i, all) => !i || all[i - 1].from >= r.from));
  assert.ok(R.rows.filter((r) => !r.open).every((r) => r.to), 'every ended grant has its end');
});

test('a partner\'s Home: their jobs only, worst first, and four figures that add up', () => {
  for (const p of ['dev', 'sam', 'lena']) {
    const B = partnerBand(p);
    assert.ok(B.jobs.length > 0, p);
    assert.ok(B.jobs.every((j) => j.person === p && j.state !== 'done'));
    assert.equal(B.withYou + B.waiting, B.jobs.length);
    assert.ok(B.jobs.every((j, i, all) => !i || Number(all[i - 1].clock.past) >= Number(j.clock.past)));
    assert.match(B.answer, /^\d+ jobs? with you · /);
  }
  assert.equal(jobsFor('nobody').length, 0);
});

test('performance comes from the records: the year\'s jobs add up and the rate is the record\'s', () => {
  const P = performance('keystone', 'service', { jobs: 37, on_time: 95 });
  const byId = Object.fromEntries(P.map((m) => [m.id, m]));
  assert.equal(byId.jobs.series.reduce((a, b) => a + b, 0), 37);
  assert.equal(byId.within.value, 95);
  assert.ok(byId.first && byId.rma);
  assert.ok(performance('northlight', 'integration', { jobs: 14, on_time: 86 }).some((m) => m.id === 'snags'));
  assert.equal(performance('x', 'service', {}).find((m) => m.id === 'within').words, 'No jobs yet');
});

test('contracts and paperwork: To review within 90 days, words for the dates', () => {
  assert.equal(contractLeft({ end: '2026-10-31' }).state, 'review');
  assert.equal(contractLeft({ end: '2028-12-31' }).state, 'fine');
  assert.equal(contractLeft({ end: '2026-01-01' }).state, 'fault');
  assert.equal(spanWords(-130), '2 h 10 min');
  assert.equal(papersOf('brightwave')[0].state, 'review');
  assert.deepEqual(papersOf('nobody'), []);
});
