// The capabilities built behind their switches (src/lib/modules.mjs): each one's data validates against its schema
// and its cross-references, and each one's rules give the answer its page leads with. The rules are pure, so they run
// here on the data read straight from data/ (no site build).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { validate } from '../tools/validate.mjs';
import { seatHolders, licenceRows, licenceSummary, licenceAnswer, inDays } from '../src/lib/licences.mjs';
import { nthWeekday, planDates, rounds, checksForSpace, checksSummary, checksAnswer, checkItem, addMonths } from '../src/lib/checks.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TODAY = '2026-09-28';
const read = (folder) => {
  const dir = join(ROOT, 'data', folder), out = [];
  if (!existsSync(dir)) return out;
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f); else if (n.endsWith('.yaml')) out.push(parse(readFileSync(f, 'utf8'))); } };
  walk(dir);
  return out;
};
// The fleet as the capabilities see it: every unit in service or going in, with its space, site and region.
const sites = Object.fromEntries(read('sites').map((s) => [s.code.toLowerCase(), s]));
const spaceSite = {};
for (const f of readdirSync(join(ROOT, 'data/spaces'))) for (const n of readdirSync(join(ROOT, 'data/spaces', f))) spaceSite[n.slice(0, -5)] = f;
const units = [];
for (const f of readdirSync(join(ROOT, 'data/installs'))) for (const n of readdirSync(join(ROOT, 'data/installs', f))) {
  const inst = parse(readFileSync(join(ROOT, 'data/installs', f, n), 'utf8')), space = n.slice(0, -5), site = spaceSite[space];
  const add = (u, model) => { if (!u.legacy && !u.retired && u.stage !== 'retire') units.push({ tag: u.asset_tag, model, space, site, region: sites[site]?.region }); };
  for (const p of inst.positions ?? []) for (const u of p.units) add(u, u.model ?? p.model);
  for (const u of inst.older_kit ?? []) add(u, u.model);
}

const FOLDERS = ['licences', 'checks'];
let result;
test('each capability\'s data validates: schema, secrets and cross-references', async () => {
  result = await validate(ROOT);
  const mine = result.errors.filter((e) => FOLDERS.some((f) => e.file.startsWith(`data/${f}/`)) || /capabilit/.test(e.message));
  assert.deepEqual(mine, []);
  for (const f of FOLDERS) assert.ok(read(f).length > 0, `data/${f}/ has records`);
  for (const f of FOLDERS) for (const r of read(f)) assert.ok(r.demo === true || r.simulated === true, `${f}/${r.id ?? r.site}: marked demo or simulated`);
});

// ---- Licences ------------------------------------------------------------------------------------------------------
test('licences: seats are counted from the units, by model and scope, or from the units named', () => {
  const pool = { covers: { models: ['m1'] }, scope: { region: 'emea' } };
  const us = [{ tag: 'A', model: 'm1', region: 'emea' }, { tag: 'B', model: 'm1', region: 'amer' }, { tag: 'C', model: 'm2', region: 'emea' }];
  assert.deepEqual(seatHolders(pool, us).map((u) => u.tag), ['A']);
  assert.deepEqual(seatHolders({ ...pool, scope: undefined }, us).map((u) => u.tag), ['A', 'B']);
  assert.deepEqual(seatHolders({ ...pool, assigned: [] }, us), [], 'a pool assigned by hand counts only the units it names');
});

test('licences: the answer leads with what renews in 30 days, then seats short; the demo says 3 renew', () => {
  const rows = licenceRows(read('licences'), units, TODAY);
  const s = licenceSummary(rows);
  assert.equal(s.renewing, 3);
  assert.ok(s.seatsShort > 0, 'one pool is short of seats');
  assert.match(licenceAnswer(s), /^3 licences renew in 30 days · \d+ seats? short$/);
  assert.equal(licenceAnswer({ renewing: 0, seatsShort: 0 }), 'Every licence has seats to spare · none renews in 30 days');
  assert.deepEqual(rows.map((r) => r.days), [...rows.map((r) => r.days)].sort((a, b) => a - b), 'soonest renewal first');
  const meet = rows.filter((r) => r.platform === 'google-meet-hardware');
  assert.ok(meet.every((r) => r.used > 0), 'every Meet pool has rooms in it');
  assert.equal(inDays(0), 'today'); assert.equal(inDays(21), 'in 21 days'); assert.equal(inDays(-3), '3 days ago');
});

// ---- Room checks ---------------------------------------------------------------------------------------------------
const spaceList = [];
for (const f of readdirSync(join(ROOT, 'data/spaces'))) for (const n of readdirSync(join(ROOT, 'data/spaces', f))) {
  const s = parse(readFileSync(join(ROOT, 'data/spaces', f, n), 'utf8'));
  spaceList.push({ id: n.slice(0, -5), site: s.site, type: s.space_type });
}
const loops = {};
for (const a of read('accessibility')) for (const [id, r] of Object.entries(a.rooms ?? {})) if (r.hearing_loop?.tested) loops[id] = r.hearing_loop.tested;

test('room checks: a plan falls on its day of the month, in its months only', () => {
  assert.equal(nthWeekday(2026, 10, 1, 'tue'), '2026-10-06');
  assert.equal(nthWeekday(2026, 10, 2, 'thu'), '2026-10-08');
  assert.deepEqual(planDates({ on: { week: 1, weekday: 'tue' } }, '2026-09-28', '2026-12-31'), ['2026-10-06', '2026-11-03', '2026-12-01']);
  assert.deepEqual(planDates({ on: { week: 2, weekday: 'thu', months: [1, 4, 7, 10] } }, '2026-07-01', '2027-02-01'), ['2026-07-09', '2026-10-08', '2027-01-14']);
});

test('room checks: rounds per office, each with its technician; a hearing loop is due a year after its last test', () => {
  const plans = read('checks');
  const list = rounds(plans, { spaces: spaceList, techs: { dub: 'liam' }, loops, from: '2026-07-28', to: '2027-01-26', today: TODAY });
  const dub = list.filter((r) => r.plan === 'meeting-room-monthly' && r.site === 'dub');
  assert.ok(dub.length >= 5 && dub.every((r) => r.who[0] === 'liam' && r.spaces.length > 1));
  assert.equal(dub.find((r) => r.date === '2026-10-01')?.status, 'due', 'the first Thursday of October is in the next seven days');
  assert.ok(dub.filter((r) => r.date < TODAY).every((r) => r.status === 'done'), 'past rounds are done');
  const loop = list.filter((r) => r.plan === 'hearing-loop-yearly');
  assert.ok(loop.length > 0 && loop.every((r) => r.spaces.length === 1 && r.date === addMonths(r.last, 12)));
  const next = checksForSpace(list, 'dub-3-09');
  assert.equal(next.next.date, '2026-10-01'); assert.equal(next.last.date, '2026-09-03');
  const s = checksSummary(list, TODAY);
  assert.equal(checksAnswer({ overdue: 0, due: 0, next: null }), 'No checks due');
  assert.match(checksAnswer(s), s.overdue ? /overdue/ : /check|round/);
  const item = checkItem(dub[0]);
  assert.equal(item.kind, 'check'); assert.equal(item.feature, 'maintenance', 'a work item carries its capability, so it leaves the Schedule when the capability is off');
});
