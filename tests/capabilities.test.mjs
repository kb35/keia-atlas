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
import { outNow, lostBookings, noticeLines, whenWords, alternativesFor } from '../src/lib/outofservice.mjs';
import { sentence, quietWords, simulatedAlerts, alertCounts, ruleAnswer } from '../src/lib/alerts.mjs';
import { warnLevel, credentialRows, credentialSummary, credentialAnswer } from '../src/lib/credentials.mjs';
import { exposure, fixState, flawRows, flawSummary, flawAnswer } from '../src/lib/flaws.mjs';
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

const FOLDERS = ['licences', 'checks', 'out-of-service', 'alert-rules', 'credentials', 'security-flaws'];
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

// ---- Out of service ------------------------------------------------------------------------------------------------
test('out of service: the seed with this browser\'s changes on top; bringing it back is one change', () => {
  const seed = read('out-of-service');
  assert.deepEqual(Object.keys(outNow(seed, {})), ['dub-4-01']);
  assert.deepEqual(Object.keys(outNow(seed, { 'dub-4-01': { out: false, at: '2026-09-28T10:00' } })), [], 'brought back');
  const took = outNow(seed, { 'lon-2-01': { out: true, reason: 'The display is cracked.', since: '2026-09-28T10:00', until: '2026-09-29T17:00', by: 'tech' } });
  assert.deepEqual(Object.keys(took).sort(), ['dub-4-01', 'lon-2-01']);
  assert.equal(took['lon-2-01'].notice.booking_system, true);
});

test('out of service: the notices (simulated) name the bookings moved and the people told; same every time', () => {
  const a = lostBookings('dub-4-01', '2026-09-28T09:00', '2026-10-01T17:00', { seats: 12 });
  assert.deepEqual(a, lostBookings('dub-4-01', '2026-09-28T09:00', '2026-10-01T17:00', { seats: 12 }), 'seeded');
  assert.ok(a.length > 0 && a.every((b) => b.people >= 2 && b.people <= 12));
  assert.ok(a.every((b) => { const d = new Date(b.start * 60000); return d.getUTCHours() >= 8 && d.getUTCHours() < 18 && ![0, 6].includes(d.getUTCDay()); }), 'working hours only');
  const lines = noticeLines({ until: '2026-10-01T17:00', notice: { booking_system: true, people_booked: true, room_guide: true } }, { spaceName: '4.01 Kingfisher', altName: '3.05 Gannet', bookings: a });
  assert.match(lines[0], /^The booking system blocks 4\.01 Kingfisher until Thu, 1 Oct, 17:00 and moves \d+ bookings? to 3\.05 Gannet$/);
  assert.match(lines[1], /^\d+ people booked in are told by email/);
  assert.equal(whenWords('2026-10-01T17:00'), 'Thu, 1 Oct, 17:00');
});

// ---- Alert rules ---------------------------------------------------------------------------------------------------
test('alert rules: each rule is one plain sentence', () => {
  const rules = Object.fromEntries(read('alert-rules').map((r) => [r.id, r]));
  const ctx = { className: (c) => ({ 'video-bar': 'Video bar', 'touch-controller': 'Touch controller', codec: 'Video codec' }[c] ?? c), siteName: (s) => ({ dub: 'Dublin office' }[s] ?? s) };
  assert.equal(sentence(rules['AR-01'], ctx), 'When a video bar in the Dublin office is offline for 10 minutes during office hours, tell the Dublin on-site technician.');
  assert.equal(sentence(rules['AR-02'], ctx), "When a touch controller is offline for 15 minutes during office hours, tell that office's on-site technician.");
  assert.equal(sentence(rules['AR-05'], ctx), "When a comms room runs on its UPS battery for 2 minutes at any hour, tell that office's on-site technician.");
  assert.match(sentence(rules['AR-03'], ctx), /loses more than 2% of its packets for 5 minutes during office hours, tell the region's network engineer\.$/);
  assert.equal(quietWords(rules['AR-05']), 'A priority 1 alert never waits: it wakes someone at any hour.');
  assert.equal(quietWords(rules['AR-02']), 'Between 19:00 and 07:00 it waits for the morning.');
});

test('alert rules: the simulated alerts keep to office hours, silence for planned work, and a P1 never waits', () => {
  const rules = Object.fromEntries(read('alert-rules').map((r) => [r.id, r]));
  const targets = [{ id: 'AG-1', label: 'x', site: 'dub', space: 'dub-3-09' }, { id: 'AG-2', label: 'y', site: 'dub', space: 'dub-3-05' }];
  const ctx = { targets, rounds: [{ date: '2026-09-03', site: 'dub', spaces: ['dub-3-09'], name: 'Monthly meeting room check' }], night: { name: 'Firmware rule', from: '22:00', to: '05:00' }, who: () => 'liam', today: TODAY };
  const a = simulatedAlerts(rules['AR-01'], ctx);
  assert.deepEqual(a, simulatedAlerts(rules['AR-01'], ctx), 'seeded');
  const own = a.filter((e) => e.status === 'sent');
  assert.ok(own.every((e) => { const d = new Date(`${e.at.slice(0, 10)}T00:00:00Z`).getUTCDay(); const h = +e.at.slice(11, 13); return d > 0 && d < 6 && h >= 8 && h < 18; }), 'office hours, weekdays');
  assert.ok(a.some((e) => e.status === 'silenced' && /room check/.test(e.why)), 'a round silences it');
  assert.ok(a.some((e) => e.status === 'silenced' && /Firmware rule/.test(e.why)), 'a standing rule silences it');
  assert.ok(a.filter((e) => e.status === 'silenced').every((e) => e.to === null), 'a silenced alert goes to nobody');
  const ups = simulatedAlerts(rules['AR-05'], { ...ctx, targets: [{ id: 'dub-3-21', label: 'MDF', site: 'dub', space: 'dub-3-21' }] });
  assert.ok(ups.every((e) => e.status !== 'held'), 'priority 1 never waits');
  assert.match(ruleAnswer(alertCounts(a)), /^Sent (once|\d+ times) in 30 days · \d+ silenced by planned work/);
});

// ---- Certificates and secrets ---------------------------------------------------------------------------------------
test('credentials: references only, warned at 60, 30 and 7 days, soonest first', () => {
  const list = read('credentials');
  for (const c of list) {
    assert.match(c.vault, /^vault:\S/, `${c.id}: a vault name`);
    assert.ok(!Object.keys(c).some((k) => /pass|secret|token|key$/i.test(k)), `${c.id}: no field that could hold a secret`);
  }
  assert.equal(warnLevel(-1), 'expired'); assert.equal(warnLevel(6), 7); assert.equal(warnLevel(25), 30); assert.equal(warnLevel(53), 60); assert.equal(warnLevel(61), null);
  const rows = credentialRows(list, units, TODAY);
  assert.deepEqual(rows.map((r) => r.days), [...rows.map((r) => r.days)].sort((a, b) => a - b));
  const s = credentialSummary(rows);
  assert.equal(s.expired, 1, 'the Juneau printer certificate has expired');
  assert.match(credentialAnswer(s), /^1 credential expired · \d+ expires? within 30 days$/);
  assert.ok(rows.find((r) => r.id === 'cert-printer-jnu').units.includes('AG-000482'));
  assert.ok(rows.find((r) => r.id === 'cert-8021x-poly-emea').units.length > 10, 'used by every Poly system in its offices');
  assert.equal(credentialAnswer({ expired: 0, in30: 0, in60: 0 }), 'Nothing expires in the next 60 days');
});

// ---- Security flaws ------------------------------------------------------------------------------------------------
test('security flaws: exposed when older than the fix on a tracked line, may be when untracked, all when no fix', () => {
  const line = read('firmware').find((l) => l.id === 'poly-videoos');
  const lines = { 'poly-videoos': line };
  const fleet = [
    { tag: 'A', model: 'poly-studio-x52', firmware: '4.6.1.444241', site: 'dub' },
    { tag: 'B', model: 'poly-studio-x52', firmware: '4.6.2.460046', site: 'dub' },
    { tag: 'C', model: 'unifi-express-7', firmware: null, site: 'rem' },
    { tag: 'D', model: 'logitech-meetup-2', firmware: null, site: 'nyc' },
  ];
  const all = Object.fromEntries(read('security-flaws').map((f) => [f.id, f]));
  const x1 = exposure(all['CVE-DEMO-2026-0101'], fleet, lines);
  assert.deepEqual([x1.exposed.map((u) => u.tag), x1.fixed.map((u) => u.tag)], [['A'], ['B']]);
  assert.equal(fixState(all['CVE-DEMO-2026-0101'], line), 'standard');
  assert.equal(fixState(all['CVE-DEMO-2026-0102'], line), 'lab');
  assert.deepEqual(exposure(all['CVE-DEMO-2026-0102'], fleet, lines).exposed.map((u) => u.tag), ['A', 'B'], 'the fix is only in the Lab');
  assert.deepEqual(exposure(all['CVE-DEMO-2026-0103'], fleet, lines).unknown.map((u) => u.tag), ['C'], 'versions not tracked');
  assert.deepEqual(exposure(all['CVE-DEMO-2026-0105'], fleet, lines).exposed.map((u) => u.tag), ['D'], 'no fix: every unit');
  const rows = flawRows(Object.values(all), fleet, lines);
  assert.equal(rows[0].severity, 'critical', 'worst first');
  assert.match(flawAnswer(flawSummary(rows)), /^\d flaws? exposes? \d+ units? · \d more may affect \d+ units?, 1 critical$/);
  assert.ok(Object.values(all).every((f) => /^CVE-DEMO-/.test(f.id)), 'made-up flaws say so in their id');
});

test('out of service: the space offered instead is the same kind in the same office, same floor first, never one that is out', () => {
  const me = { id: 'a', site: 'dub', floor: '4', kind: 'meeting', type: 'conference-room-medium', seats: 12 };
  const c = [
    { id: 'b', site: 'dub', floor: '3', kind: 'meeting', type: 'conference-room-medium', seats: 12 },
    { id: 'c', site: 'dub', floor: '4', kind: 'meeting', type: 'conference-room-small', seats: 6 },
    { id: 'd', site: 'lon', floor: '4', kind: 'meeting', type: 'conference-room-medium', seats: 12 },
    { id: 'e', site: 'dub', floor: '4', kind: 'small', type: 'huddle-room', seats: 4 },
  ];
  assert.deepEqual(alternativesFor(me, c).map((x) => x.id), ['c', 'b']);
  assert.deepEqual(alternativesFor(me, c, { c: {} }).map((x) => x.id), ['b']);
});
