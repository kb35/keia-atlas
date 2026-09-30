// Planning's rules (src/lib/planningcore.mjs): financial years, pricing, the ratio model, and what each kind of
// scenario does to a small made-up plan. The page and the browser use the same functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fyOf, fyOfDue, fyLabel, fySpan, unitEur, bauHours, teamIn, yearTotals, applyScenario, compare, effectWords, emptyYear, groupOf } from '../src/lib/planningcore.mjs';

const ctx = () => ({
  CLASS: { 'video-bar': { eur: 3600, hours: { tech: 2, delivery: 3, pm: 0, network: 0 } }, 'network-switch': { eur: 4800, hours: { tech: 1, delivery: 0, pm: 0, network: 3 } } },
  rate: 100,
  ratios: {
    support: { tech: { per_room: 8, per_unit: 1, per_staff: 0.5, per_kit: 3 }, delivery: { per_room: 1, per_unit: 0, per_staff: 0, per_kit: 0 }, network: { per_room: 0, per_unit: 0, per_staff: 0, per_kit: 0 }, pm: { per_room: 0, per_unit: 0, per_staff: 0, per_kit: 0 } },
    office_sizes: { S: { name: 'Small', rooms: 7, desks: 8, staff: 25, units: 25, like: 'jnu' }, M: { name: 'Medium', rooms: 14, desks: 30, staff: 110, units: 105, like: 'mel' }, L: { name: 'Large', rooms: 28, desks: 63, staff: 220, units: 190, like: 'dub' } },
    fit_out: { cost_per_unit: 9000, hours_per_unit: { pm: 6, delivery: 8, tech: 5, network: 2 }, refresh_after: 2, refresh_share: 0.5 },
  },
  estate: { amer: { rooms: 10, units: 100, staff: 200, kits: 4, offices: 1 }, emea: { rooms: 0, units: 0, staff: 0, kits: 0, offices: 0 }, apac: { rooms: 0, units: 0, staff: 0, kits: 0, offices: 0 } },
  team: { amer: { tech: 1, delivery: 1, pm: 1, network: 0 }, emea: { tech: 0, delivery: 0, pm: 0, network: 0 }, apac: { tech: 0, delivery: 0, pm: 0, network: 0 } },
  hires: [{ year: 'fy2029', role: 'tech', region: 'apac', add: 1, status: 'approved' }],
  siteRegion: { nyc: 'amer' },
  hoursPerPerson: 1000,
  avgClass: 'video-bar',
});
const plan = () => {
  const years = [2027, 2028, 2029, 2030].map((n) => emptyYear(n, n === 2027 ? { eur: 100000, status: 'set' } : null));
  years[0].committed.projects.push({ id: 'PRJ-1', name: 'A refresh', kind: 'refresh', site: 'nyc', eur: 20000, hours: { tech: 10, delivery: 20, pm: 30, network: 0 } });
  years[0].planned.byOffice.nyc = { rooms: 4, classes: { 'video-bar': 10, 'network-switch': 2 } };
  years[1].planned.byOffice.nyc = { rooms: 10, classes: { 'video-bar': 20 } };
  years[2].planned.byOffice.nyc = { rooms: 5, classes: { 'video-bar': 8, 'network-switch': 4 } };
  return years;
};

test('a financial year runs July to June and is named by the year it ends in', () => {
  assert.equal(fyOf('2026-09-28'), 2027);
  assert.equal(fyOf('2027-06-30'), 2027);
  assert.equal(fyOf('2027-07-01'), 2028);
  assert.equal(fyLabel(2028), 'FY2028');
  assert.equal(fySpan('fy2028'), 'July 2027 to June 2028');
});

test('a unit due in a calendar year is planned in that financial year, never before the current one', () => {
  assert.equal(fyOfDue(2029, 2027), 2029);
  assert.equal(fyOfDue(2024, 2027), 2027);
});

test('a unit is priced as its kit plus every role\'s hours at the hour rate', () => {
  assert.equal(unitEur('video-bar', ctx()), 3600 + 5 * 100);
  assert.equal(unitEur('never-seen', ctx()), 500);
  assert.equal(groupOf('network-switch'), 'network');
  assert.equal(groupOf('video-bar'), 'av');
});

test('upkeep hours follow the ratio model, and the team grows with the headcount changes', () => {
  const c = ctx();
  assert.deepEqual(bauHours(c.estate.amer, c.ratios), { tech: 80 + 100 + 100 + 12, delivery: 10, pm: 0, network: 0 });
  assert.equal(teamIn(2028, c).apac.tech, 0);
  assert.equal(teamIn(2029, c).apac.tech, 1);
});

test('a year\'s totals add committed projects, the priced work plan and upkeep, and compare them with the hours available', () => {
  const c = ctx(), t = yearTotals(plan()[0], c);
  assert.equal(t.spend.committed, 20000);
  assert.equal(t.spend.planned, 10 * 4100 + 2 * 5200);
  assert.equal(t.spend.total, t.spend.committed + t.spend.planned);
  assert.equal(t.units, 12);
  assert.equal(t.rooms, 4);
  assert.equal(t.projects, 1);
  assert.equal(t.byKind.refresh.planned, 41000);
  assert.equal(t.byKind['infra-refresh'].planned, 10400);
  assert.equal(t.hours.tech.need, 292 + 10 + 20 + 2);   // upkeep, the project, ten video bars, two switches
  assert.equal(t.hours.tech.have, 1000);
  assert.equal(t.headroom, 100000 - t.spend.total);
});

test('a cut moves that share of the year\'s replacements into the next year', () => {
  const c = ctx(), res = applyScenario(plan(), { changes: [{ op: 'cut', percent: 25, year: 'fy2028' }] }, c);
  assert.equal(res.years[1].planned.byOffice.nyc.classes['video-bar'], 15);
  assert.equal(res.years[2].planned.byOffice.nyc.classes['video-bar'], 13);
  assert.match(res.notes[0], /5 replacements move from FY2028 to FY2029/);
  const rows = compare(plan(), res, c);
  assert.equal(rows[1].d.units, -5);
  assert.equal(rows[2].d.units, 5);
  assert.equal(rows[1].d.spend + rows[2].d.spend, 0);
});

test('refreshing a class early pulls every later unit of it into that year', () => {
  const c = ctx(), res = applyScenario(plan(), { changes: [{ op: 'early', class: 'video-bar', year: 'fy2028' }] }, c);
  assert.equal(res.years[1].planned.byOffice.nyc.classes['video-bar'], 28);
  assert.equal(res.years[2].planned.byOffice.nyc.classes['video-bar'], 0);
  assert.equal(res.years[2].planned.byOffice.nyc.classes['network-switch'], 4, 'switches stay where they were');
});

test('delaying the network refresh moves switches and gateways later, and says what falls off the end', () => {
  const c = ctx(), res = applyScenario(plan(), { changes: [{ op: 'delay', group: 'network', years: 1 }] }, c);
  assert.equal(res.years[0].planned.byOffice.nyc.classes['network-switch'], 0);
  assert.equal(res.years[1].planned.byOffice.nyc.classes['network-switch'], 2);
  assert.equal(res.years[3].planned.byOffice.nyc.classes['network-switch'], 4);
  assert.equal(res.years[0].planned.byOffice.nyc.classes['video-bar'], 10, 'AV stays');
  const off = applyScenario(plan(), { changes: [{ op: 'delay', group: 'network', years: 3 }] }, c);
  assert.match(off.notes[0], /fall after FY2030/);
});

test('a new office adds a fit-out project, the rooms and people it brings, and its first replacements later', () => {
  const c = ctx(), res = applyScenario(plan(), { changes: [{ op: 'new-office', size: 'M', region: 'apac', city: 'Sydney', year: 'fy2028' }] }, c);
  const y = res.years[1];
  assert.equal(y.estimated.projects.length, 1);
  assert.equal(y.estimated.projects[0].eur, 105 * 9000);
  assert.equal(y.estimated.projects[0].hours.tech, 105 * 5);
  assert.equal(y.estimated.adds[0].rooms, 14);
  assert.equal(res.years[0].estimated.adds.length, 0, 'nothing before it opens');
  assert.equal(res.years[3].planned.byOffice['new:sydney'].classes['video-bar'], Math.round(105 * 0.5), 'its refresh starts two years on in this test model');
  const t = yearTotals(y, res.ctx);
  assert.equal(t.estate.apac.rooms, 14);
  assert.equal(t.hours.tech.byRegion.apac.need, 14 * 8 + 105 * 1 + 110 * 0.5 + 105 * 5);
  assert.equal(t.hours.tech.byRegion.apac.people, 0, 'nobody in APAC yet in FY2028');
  const rows = compare(plan(), res, c);
  assert.match(effectWords(rows), /more in FY2028, FY2030/);
});
