// The rolling demo clock (docs/rules/data.md F12, src/lib/demo-clock-core.mjs): demo dates move by whole weeks
// with the build date, real facts never move, and the validator names any date that is on neither list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { makeClock, shiftRecord, dateFieldProblems, addDays, DATE_FIELDS } from '../src/lib/demo-clock-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANCHOR = '2026-09-28';                 // a Monday; data/house-values/aigna.yaml demo_anchor
const LATER = '2026-12-28';                  // 13 weeks on
const dow = (d) => new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay();

// ---- The rules ------------------------------------------------------------------------------------------------------
test('the offset is whole weeks, so the demo\'s today is always the anchor\'s weekday', () => {
  for (let i = -20; i < 800; i++) {
    const build = addDays(ANCHOR, i);
    const c = makeClock({ anchor: ANCHOR, build, rolling: true });
    assert.ok(c.offsetDays % 7 === 0, build);
    assert.equal(dow(c.today), dow(ANCHOR), build);
    assert.ok(c.today <= build && build < addDays(c.today, 7), `${build}: today ${c.today}`);
  }
});

test('a shifted date keeps its weekday, its time of day and its zone', () => {
  const c = makeClock({ anchor: ANCHOR, build: '2027-01-06', rolling: true });   // a Wednesday: today is Monday 4 January
  assert.equal(c.today, '2027-01-04');
  for (const d of ['2026-09-28', '2026-02-09', '2025-12-31', '2020-03-03']) assert.equal(dow(c.shift(d)), dow(d), d);
  assert.equal(c.shift('2026-09-28T07:52'), '2027-01-04T07:52');
  assert.equal(c.shift('2026-09-30T06:00:00Z'), '2027-01-06T06:00:00Z');
  assert.equal(c.shift('2026-09'), '2027-01');                // a month moves by whole months: this month stays this month
  assert.equal(c.shift('not a date'), 'not a date');
});

test('with the offset at 0 (the anchor, or the clock off) nothing moves', () => {
  for (const c of [makeClock({ anchor: ANCHOR, build: ANCHOR, rolling: true }), makeClock({ anchor: ANCHOR, build: '2027-06-01', rolling: false })]) {
    assert.equal(c.offsetDays, 0);
    assert.equal(c.today, ANCHOR);
    const rec = { opened: '2026-09-28T07:52', history: [{ at: '2026-09-28T07:52' }] };
    assert.deepEqual(shiftRecord('incidents/inc0041210.yaml', structuredClone(rec), c), rec);
  }
});

test('financial years move only when today crosses into another one, and then by whole years', () => {
  const dec = makeClock({ anchor: ANCHOR, build: LATER, rolling: true });
  assert.equal(dec.fyShift, 0);
  assert.equal(dec.shiftFy('fy2027'), 'fy2027');
  const jul = makeClock({ anchor: ANCHOR, build: '2027-07-05', rolling: true });
  assert.equal(jul.fyShift, 1);
  assert.equal(jul.shiftFy('fy2027'), 'fy2028');
  assert.equal(jul.shiftFy('2026-07-01'), '2027-07-01');
  assert.equal(jul.shiftFy('Cut 15% from FY2028'), 'Cut 15% from FY2029');
  assert.equal(jul.shiftFy('July 2026 to June 2027'), 'July 2027 to June 2028');
  const plan = shiftRecord('plan/fy2027.yaml', { id: 'fy2027', from: '2026-07-01', events: [{ date: '2026-10-05' }], pipeline: [{ start: '2027-01-11' }] }, jul);
  assert.deepEqual(plan, { id: 'fy2028', from: '2027-07-01', events: [{ date: '2027-10-05' }], pipeline: [{ start: '2027-10-18' }] });   // 40 weeks on
});

test('real facts stay fixed while demo dates move', () => {
  const c = makeClock({ anchor: ANCHOR, build: LATER, rolling: true });
  const model = shiftRecord('device-models/x.yaml', { security_support: { ends: { date: '2030-06' } }, lifecycle: { end_of_support: '2021-06-30' } }, c);
  assert.deepEqual(model, { security_support: { ends: { date: '2030-06' } }, lifecycle: { end_of_support: '2021-06-30' } });
  const fw = shiftRecord('firmware/poly-videoos.yaml', { releases: [{ released: '2026-08-28' }] }, c);
  assert.equal(fw.releases[0].released, '2026-08-28');
  const ki = shiftRecord('known-issues/poly.yaml', { checked: '2026-09-28T06:05', issues: [{ published: '2026-07-14' }] }, c);
  assert.deepEqual(ki, { checked: '2026-12-28T06:05', issues: [{ published: '2026-07-14' }] });
});

// ---- The validator's check ------------------------------------------------------------------------------------------
test('the validator flags a date field that is neither on the shift list nor fixed', () => {
  const bad = dateFieldProblems('incidents/inc9.yaml', { opened: '2026-09-28T07:52', follow_up: { due: '2026-10-02' } });
  assert.equal(bad.length, 1);
  assert.equal(bad[0].path, 'follow_up.due');
  assert.deepEqual(bad[0].at, ['follow_up', 'due']);
  assert.match(bad[0].message, /DATE_FIELDS.*"incidents".*shift.*fixed/);
  // A new folder is flagged until it is registered.
  assert.equal(dateFieldProblems('events/open-day.yaml', { date: '2026-10-08' }).length, 1);
  assert.equal(dateFieldProblems('events/open-day.yaml', { date: '2026-10-08' }, { events: { shift: ['date'] } }).length, 0);
  // Not every string with digits is a date.
  assert.equal(dateFieldProblems('incidents/inc9.yaml', { number: 'INC0041210', version: '4.7.0-466077', year: 2026 }).length, 0);
});

test('every date in data/ is on the list (shift, fy, year or fixed)', () => {
  const data = join(ROOT, 'data');
  const walk = (d) => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : n.endsWith('.yaml') ? [f] : []; });
  const problems = walk(data).flatMap((f) => dateFieldProblems(relative(data, f).split('\\').join('/'), parse(readFileSync(f, 'utf8'))).map((p) => `${relative(ROOT, f)}: ${p.path}`));
  assert.deepEqual(problems, []);
  for (const [folder, e] of Object.entries(DATE_FIELDS)) for (const k of Object.keys(e)) assert.ok(['shift', 'fy', 'year', 'fixed'].includes(k), `${folder}: ${k}`);
});

// ---- The pages' own modules, built 13 weeks on ----------------------------------------------------------------------
const probe = (date) => JSON.parse(execFileSync(process.execPath, [join(ROOT, 'tests/fixtures/demo-clock-probe.mjs')], { cwd: ROOT, env: { ...process.env, DEMO_BUILD_DATE: date }, encoding: 'utf8' }));
const now = probe('anchor');
const later = probe(LATER);

test('at the anchor, today is 28 September and the story is as written', () => {
  assert.equal(now.today, ANCHOR);
  assert.equal(now.offsetDays, 0);
  assert.equal(now.now, '2026-09-28T12:00');
  assert.deepEqual(now.fault, { number: 'INC0041210', today: true, words: '28 Sep, 07:52', state: 'new' });
  assert.equal(now.warranty, 'Warranty ends in 10 months');
  assert.deepEqual(now.pto, ['ruth', '2026-09-28', '2026-10-02', '']);
});

test('13 weeks later the dates have moved and the story holds', () => {
  assert.equal(later.today, LATER);
  assert.equal(later.offsetDays, 91);
  assert.equal(later.weekday, now.weekday);                                        // still a Monday
  assert.equal(later.now, `${LATER}T12:00`);
  assert.deepEqual(later.fault, { number: 'INC0041210', today: true, words: '28 Dec, 07:52', state: 'new' });   // the 3.09 fault: today 07:52
  assert.deepEqual(later.prj14, now.prj14);                                        // PRJ-14: same phase, same step, same tasks
  assert.equal(later.prj14.step, 'commission');
  assert.equal(later.warranty, 'Warranty ends in 10 months');
  assert.equal(later.warranties.ended, now.warranties.ended);                      // as many units out of warranty
  assert.deepEqual(later.pto, ['ruth', '2026-12-28', '2027-01-01', '']);          // Ruth is still away this week
});

test('13 weeks later the real facts have not moved', () => {
  assert.equal(later.firmware, '2026-08-28');                                     // Poly VideoOS 5.0.1 release date
  assert.equal(later.firmware, now.firmware);
  assert.equal(later.endOfSupport, now.endOfSupport);                             // Poly Studio X52 security support
  assert.equal(later.christmas, '2026-12-25');                                    // public holidays are calendar facts
  assert.deepEqual(later.fy, now.fy);                                             // still FY2027: no financial year crossed
});

// ---- The built pages at the anchor (runs when dist/ exists) -----------------------------------------------------------
const DIST = join(ROOT, 'dist');
const read = (p) => readFileSync(join(DIST, p), 'utf8');
const builtToday = existsSync(join(DIST, 'index.html')) ? /data-demo-today="([\d-]+)"/.exec(read('index.html'))?.[1] ?? null : null;

test('built pages carry the demo\'s today, a Monday, for their scripts (runs when dist/ exists)', { skip: !builtToday }, () => {
  assert.equal(dow(builtToday), 1);
  assert.match(read('incidents/inc0041210/index.html'), new RegExp(`data-demo-today="${builtToday}"`));
});

test('built at the anchor, the pages read as they always have (runs when dist/ was built at the anchor)', { skip: builtToday !== ANCHOR }, () => {
  const text = (p) => read(p).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert.match(text('about/index.html'), /Demo dates move with today; the story stays the same\./);
  assert.match(text('incidents/inc0041210/index.html'), /28 Sep, 07:52/);
  assert.match(read('projects/prj-14/index.html'), /Commission/);
  assert.match(text('models/poly-studio-x52/index.html'), /Dec 2032/);
});

// ---- Page code: a demo date typed into the code goes through demoShift() --------------------------------------------
// Allowed: comments, the public holidays (real calendar facts), placeholders for "no date", a firmware release shown
// as a real fact, and costs.mjs's default (it also runs in the browser; every caller passes the demo's today).
const ALLOWED = [
  ['src/lib/schedule.mjs', "...H('"],
  ['src/lib/incidents.mjs', "'2000-01-01'"],
  ['src/lib/engagements.mjs', "'2024-01-01T00:00'"],
  ['src/lib/costs.mjs', "today = '2026-09-28'"],
  ['src/pages/changes/index.astro', 'released: "2026-08-28"'],
  ['src/lib/ownership.mjs', 'A zoneless time'],                      // inside a block comment
];
test('no demo date is typed into page code without demoShift()', () => {
  const walk = (d) => readdirSync(d).flatMap((n) => { const f = join(d, n); return statSync(f).isDirectory() ? walk(f) : /\.(mjs|js|astro)$/.test(n) ? [f] : []; });
  const found = [];
  for (const f of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, f).split('\\').join('/');
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      const code = line.replace(/\s\/\/ .*$/, '').replace(/demoShift\('[^']*'\)/g, '');
      if (!/['"`]20\d{2}-\d{2}-\d{2}/.test(code)) return;
      if (ALLOWED.some(([file, text]) => file === rel && line.includes(text))) return;
      found.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(found, []);
});
