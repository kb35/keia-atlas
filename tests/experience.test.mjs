// Experience measures and service levels (src/lib/experience.mjs) and the sparkline (src/lib/spark.mjs): simulated,
// seeded, the same on every build; counted per office, weighted by spaces, never per person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { experience, MEASURES, fmtMeasure, withinTarget, serviceLevels, SERVICE_LEVELS, officeSeries } from '../src/lib/experience.mjs';
import { sparkPoints, sparkSvg, sparkWords } from '../src/lib/spark.mjs';

const SITES = [{ id: 'dub', weight: 40 }, { id: 'nyc', weight: 60 }, { id: 'sin', weight: 20 }];

test('each service has four experience measures, and none of them is per person', () => {
  for (const svc of ['av', 'network', 'infrastructure']) {
    assert.equal(MEASURES[svc].length, 4, svc);
    for (const m of MEASURES[svc]) assert.ok(!/person|people|technician|engineer/i.test(m.label), `${svc} ${m.label}`);
  }
});

test('the figures are seeded: the same offices give the same series every time', () => {
  assert.deepEqual(experience('av', SITES), experience('av', SITES));
  assert.deepEqual(officeSeries('av', 'dub', MEASURES.av[0]), officeSeries('av', 'dub', MEASURES.av[0]));
  assert.notDeepEqual(officeSeries('av', 'dub', MEASURES.av[0]), officeSeries('av', 'nyc', MEASURES.av[0]));
});

test('the AV figures sit where the leadership view says they do: about 97%, 94%, 1 h 12 min and 0.3 per job', () => {
  const E = Object.fromEntries(experience('av', SITES).map((m) => [m.id, m]));
  assert.ok(Math.abs(E.ontime.value - 97) < 1.5, E.ontime.value);
  assert.ok(Math.abs(E.first.value - 94) < 1.5, E.first.value);
  assert.ok(Math.abs(E.lost.value - 72) < 8, E.lost.value);
  assert.ok(Math.abs(E.reassign.value - 0.3) < 0.1, E.reassign.value);
  for (const m of Object.values(E)) { assert.equal(m.series.length, 30); assert.ok(m.series.every((v) => v >= m.min && v <= m.max)); }
});

test('no offices means no figure, not a made-up one', () => {
  for (const m of experience('av', [])) { assert.equal(m.value, null); assert.equal(m.words, '–'); assert.deepEqual(m.series, []); }
});

test('figures read plainly', () => {
  const [ontime, , lost, re] = MEASURES.av;
  assert.equal(fmtMeasure(ontime, 96.6), '97%');
  assert.equal(fmtMeasure(lost, 72), '1 h 12 min');
  assert.equal(fmtMeasure(lost, 45), '45 min');
  assert.equal(fmtMeasure(lost, 120), '2 h');
  assert.equal(fmtMeasure(re, 0.31), '0.3 per job');
  assert.equal(fmtMeasure(MEASURES.network[0], 99.95), '99.95%');
  assert.ok(withinTarget(ontime, 96) && !withinTarget(ontime, 94));
  assert.ok(withinTarget(lost, 60) && !withinTarget(lost, 100));
});

test('service levels: each promise has this month\'s result and 12 weeks of history', () => {
  for (const svc of Object.keys(SERVICE_LEVELS)) {
    for (const r of serviceLevels(svc)) {
      assert.equal(r.weeks.length, 12);
      if (r.n != null) { assert.ok(r.met >= 0 && r.met <= r.n); assert.match(r.words, /^\d+ of \d+ this month$/); }
      else assert.match(r.words, /% this month$/);
      assert.equal(typeof r.kept, 'boolean');
    }
  }
});

test('a sparkline fits its box, sits flat when nothing changes, and marks the last point only when not fine', () => {
  const { pts, min, max } = sparkPoints([1, 3, 2, 5], { w: 64, h: 16 });
  assert.equal(pts.length, 4); assert.equal(min, 1); assert.equal(max, 5);
  assert.ok(pts.every(([x, y]) => x >= 0 && x <= 64 && y >= 0 && y <= 16));
  assert.ok(sparkPoints([4, 4, 4]).pts.every(([, y]) => y === 8));
  assert.ok(!sparkSvg([1, 2, 3]).includes('spk-dot'));
  assert.ok(sparkSvg([1, 2, 3], { state: 'review' }).includes('spk-dot'));
  assert.equal(sparkSvg([]), '');
  assert.equal(sparkWords([90, 99, 97], { fmt: (x) => `${x}%` }), '30 days: lowest 90%, highest 99%, latest 97%');
});
