// The records a team runs on day to day: warranty and purchase per unit, on-call cover, internet circuits, the comms
// room's power and temperature, repeat faults, office hours and change windows. The words are pure functions
// (src/lib/cover.mjs and friends); the data is read straight from data/. Run with:  npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { warrantyWords, supportWords, monthsUntil, endingSoon, money, renewalWords } from '../src/lib/cover.mjs';
import { TARGETS, upsWords, tempWords, envAnswer, simulatedTemp } from '../src/lib/environment.mjs';
import { hoursWords, daysWords, windowWords, nextWindow, plusHour } from '../src/lib/hours.mjs';
import { ordinal, quarterStart, lastMonths, repeatsOf, mostRepeats } from '../src/lib/repeats.mjs';
import { FEATURES_ADDED } from '../src/lib/features-added.mjs';
import { rotaAt, lineFor, outOfHours, localAt, utcOf, whenWords } from '../src/lib/oncall.mjs';
import { PEOPLE } from '../src/lib/demo.mjs';
import { accessForStaff, cableTestsOf, platformsOf } from '../src/lib/roomfacts.mjs';
import { accessOf } from '../src/lib/guide.mjs';
import { trendStrip } from '../src/lib/strip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : n.endsWith('.yaml') ? [p] : []; });
const load = (dir) => walk(path.join(ROOT, 'data', dir)).map((f) => ({ id: path.basename(f, '.yaml'), file: f, ...parse(readFileSync(f, 'utf8')) }));
const TODAY = '2026-09-28';

// ---- Warranty, support cover and purchase ----------------------------------------------------------------------

test('the warranty answers first, in the words a person says', () => {
  assert.equal(warrantyWords('2027-01-31', TODAY).text, 'Warranty ends in 4 months');
  assert.equal(warrantyWords('2027-01-31', TODAY).state, 'soon');
  assert.equal(warrantyWords('2026-10-08', TODAY).text, 'Warranty ends in 10 days');
  assert.equal(warrantyWords('2026-10-20', TODAY).text, 'Warranty ends in 3 weeks');
  assert.equal(warrantyWords('2025-02-04', TODAY).text, 'Out of warranty since Feb 2025');
  assert.equal(warrantyWords('2028-06-07', TODAY).text, 'Under warranty until Jun 2028');
  assert.equal(warrantyWords(null, TODAY), null, 'no date, no answer: the page shows nothing');
  assert.equal(monthsUntil('2026-09-28', '2027-09-27'), 12);
});

test('support names the vendor and its contract, and says when a contract has ended', () => {
  const v = { id: 'keystone', name: 'Keystone Service', contract: { ref: 'AG-SVC-2026-01', end: '2028-12-31' } };
  assert.equal(supportWords(v, TODAY).text, 'Keystone Service, contract AG-SVC-2026-01, until 31 Dec 2028');
  assert.equal(supportWords({ ...v, contract: { ref: 'X', end: '2026-01-01' } }, TODAY).live, false);
  assert.equal(money(3600), '€3,600');
});

test('warranties ending: counted by month, grouped by office and model, and the ones with no cover after are named', () => {
  const units = [
    { tag: 'A', site: 'dub', office: 'Dublin office', model: 'm1', modelName: 'M1', ends: '2026-11-02', support: 'keystone', supportName: 'Keystone Service' },
    { tag: 'B', site: 'dub', office: 'Dublin office', model: 'm1', modelName: 'M1', ends: '2027-02-10', support: null },
    { tag: 'C', site: 'lon', office: 'London office', model: 'm2', modelName: 'M2', ends: '2029-01-01', support: null },
    { tag: 'D', site: 'lon', office: 'London office', model: 'm2', modelName: 'M2', ends: '2025-01-01', support: null },
  ];
  const r = endingSoon(units, TODAY, 12);
  assert.equal(r.count, 2);
  assert.equal(r.bare, 1);
  assert.equal(r.answer, '2 warranties end in the next 12 months · 1 with no support contract after');
  assert.deepEqual(r.rows.map((x) => [x.site, x.n, x.covered]), [['dub', 2, 1]]);
  assert.equal(r.bars.length, 12);
  assert.equal(r.bars.reduce((n, b) => n + b.n, 0), 2);
});

test('every unit with a date has a purchase and a warranty, marked demo; support names a vendor that covers it', () => {
  const vendors = Object.fromEntries(load('vendors').map((v) => [v.id, v]));
  let n = 0;
  for (const inst of load('installs')) {
    for (const p of inst.positions ?? []) for (const u of p.units) {
      if (!u.installed) continue;
      n++;
      assert.ok(u.purchase?.demo && u.warranty?.demo, `${u.asset_tag}: purchase and warranty, marked demo`);
      assert.ok(u.warranty.ends > u.purchase.date && u.purchase.date <= u.installed, `${u.asset_tag}: bought, then installed, warranty after`);
      if (u.support) {
        const v = vendors[u.support];
        assert.ok(v, `${u.asset_tag}: support vendor ${u.support} exists`);
        if (v.kind === 'service') assert.ok(v.contract.covers_models.includes(u.model ?? p.model), `${u.asset_tag}: ${v.name} covers its model`);
      }
    }
  }
  assert.ok(n > 1000, 'the fleet has its purchase records');
});

// ---- Every new block can be switched off -------------------------------------------------------------------------

test('each capability added is listed once, with a label, a line and a module', () => {
  const ids = FEATURES_ADDED.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FEATURES_ADDED) {
    assert.ok(f.label && f.description && ['assets', 'locations', 'team', 'support', 'projects'].includes(f.module), f.id);
  }
});

// ---- On call -----------------------------------------------------------------------------------------------------

const NOW_UTC = '2026-09-28T11:00:00Z';   // noon on Monday 28 September in Dublin
const rotas = () => load('on-call');

test('the rota answers who is on call now, in each region\'s own time', () => {
  const R = Object.fromEntries(rotas().map((r) => [r.region, rotaAt(r, NOW_UTC)]));
  assert.equal(R.emea.local, '2026-09-28T12:00');
  assert.equal(R.emea.now.person, 'liam', 'EMEA handed over at 08:00 this morning');
  assert.equal(R.amer.local, '2026-09-28T07:00');
  assert.equal(R.amer.now.person, 'grace', 'New York has not reached 08:00 yet, so last week\'s person is still on');
  assert.equal(R.apac.ooh, true, '19:00 in Singapore is out of hours');
  assert.equal(R.emea.ooh, false);
});

test('a person\'s Home line: on call, backup, or next', () => {
  const all = rotas();
  assert.equal(lineFor('liam', all, NOW_UTC).text, "You're on call until Monday 08:00");
  assert.equal(lineFor('tom', all, NOW_UTC).text, "You're backup on call until Monday 08:00");
  assert.equal(lineFor('anna', all, NOW_UTC).text, "You're on call from Monday 5 Oct, 08:00");
  assert.equal(lineFor('claire', all, NOW_UTC), null, 'someone not on the rota gets no line');
});

test('times: out of hours, the wall clock and back, and the words for when', () => {
  const r = { out_of_hours: { weekdays_from: '19:00', weekdays_to: '07:00', weekends: true } };
  assert.equal(outOfHours(r, '2026-09-28T06:59'), true);
  assert.equal(outOfHours(r, '2026-09-28T12:00'), false);
  assert.equal(outOfHours(r, '2026-10-03T12:00'), true, 'Saturday');
  assert.equal(localAt('Europe/Dublin', utcOf('2026-09-28T07:53', 'Europe/Dublin')), '2026-09-28T07:53');
  assert.equal(whenWords('2026-09-28T08:00', '2026-09-28T07:00'), '08:00 today');
  assert.equal(whenWords('2026-09-29T08:00', '2026-09-28T07:00'), 'tomorrow 08:00');
});

test('every rota: someone on call today, people on the team, and a backup who is someone else', () => {
  const ids = new Set(PEOPLE.filter((p) => !p.vendor).map((p) => p.id));
  const all = rotas();
  assert.deepEqual(all.map((r) => r.region).sort(), ['amer', 'apac', 'emea']);
  for (const r of all) {
    assert.ok(rotaAt(r, NOW_UTC).now, `${r.region} has someone on call now`);
    assert.ok(r.demo, `${r.region} is marked demo`);
    for (const w of r.weeks) assert.ok(ids.has(w.person) && ids.has(w.backup) && w.person !== w.backup, `${r.region} ${w.from}`);
  }
});

// ---- Internet circuits -----------------------------------------------------------------------------------------

test('every circuit is recorded in full: ID, bandwidth, service level, support desk and renewal, marked demo', () => {
  const all = load('circuits').flatMap((f) => f.circuits);
  assert.equal(all.length, 12);
  for (const c of all) {
    assert.ok(c.circuit_id && c.bandwidth !== 'Not recorded' && c.sla?.availability && c.support?.desk && c.contract?.renews && c.demo, c.id);
    assert.ok(/^Carrier (One|Two)\b/.test(c.support.desk), `${c.id}: the carrier's desk, never a person`);
    assert.ok(!/\+?\d[\d ()-]{7,}/.test(JSON.stringify(c.support)), `${c.id}: no phone number in the record`);
  }
  assert.equal(renewalWords('2026-12-31', TODAY).text, 'Renews in 3 months');
  assert.equal(renewalWords('2027-09-30', TODAY).text, 'Renews 30 Sep 2027');
});

// ---- The comms room's power and temperature ----------------------------------------------------------------------

test('the targets are the standards\' own numbers', () => {
  const std = Object.fromEntries(load('standards').filter((s) => s.sections).map((s) => [s.id, s]));
  const rule = (sid, rid) => std[sid].sections.flatMap((x) => x.rules ?? []).find((r) => r.id === rid).rule;
  assert.match(rule('power', 'ups-runtime'), new RegExp(`${TARGETS.runtimeMin} minutes`));
  assert.match(rule('power', 'ups-size'), new RegExp(`${TARGETS.loadMaxPct}%`));
  assert.match(rule('racks', 'temperature'), new RegExp(`${TARGETS.tempC[0]} and ${TARGETS.tempC[1]} degrees`));
});

test('the UPS and the room say what is wrong first', () => {
  assert.equal(upsWords({ runtime_min: 22, load_pct: 41, measured: '2026-03-12' }).answer, 'UPS runs 22 min at 41% load, inside the standard');
  assert.equal(upsWords({ runtime_min: 17, load_pct: 83, measured: '2026-02-24' }).answer, 'UPS load 83%, over the 80% limit');
  assert.equal(upsWords({ runtime_min: 12, load_pct: 64, measured: '2025-08-14' }).answer, 'UPS runs 12 min, under the 15 minutes the standard asks');
  assert.equal(tempWords(29.1).ok, false);
  assert.equal(envAnswer(null, 22.4), 'the room is at 22.4 °C');
  const t = simulatedTemp('dub-3-21');
  assert.ok(t >= 20.5 && t <= 25.5 && simulatedTemp('dub-3-21') === t, 'the simulated reading is steady and in a normal range');
});

test('every comms room with a rack has its power and temperature record, and nothing else does', () => {
  const racked = new Set(load('racks').map((r) => r.space));
  for (const s of load('spaces')) {
    const comms = ['mdf', 'idf'].includes(s.space_type);
    if (comms && racked.has(s.id)) assert.ok(s.power?.ups && s.power.feeds?.length === 2 && s.environment?.probe && s.power.demo, `${s.id} has its record`);
    if (!comms) assert.ok(!s.power && !s.environment, `${s.id} is not a comms room`);
  }
});

// ---- Office hours and change windows -----------------------------------------------------------------------------

test('every office has its hours and a change window; home offices have neither', () => {
  for (const s of load('sites')) {
    if (s.kind === 'office') assert.ok(s.office_hours?.demo && s.change_window?.demo, s.id);
    else assert.ok(!s.office_hours && !s.change_window, s.id);
  }
});

test('hours and windows in words, and when the window next opens', () => {
  assert.equal(hoursWords({ days: ['mon', 'tue', 'wed', 'thu', 'fri'], open: '07:00', close: '19:00' }), '07:00 to 19:00, Monday to Friday');
  assert.equal(daysWords(['tue', 'thu']), 'Tuesday and Thursday');
  const w = { day: 'thu', from: '22:00', to: '02:00' };
  assert.equal(windowWords(w, { long: true }), 'Thursday 22:00 to 02:00 the next morning');
  assert.equal(nextWindow(w, '2026-09-28T12:00').text, 'Thursday 1 Oct, 22:00 to 02:00');
  assert.equal(nextWindow(w, '2026-10-01T12:00').text, 'tonight, 22:00 to 02:00');
  assert.equal(nextWindow(w, '2026-10-02T01:30').open, true, 'still open in the small hours of Friday');
  assert.equal(nextWindow(w, '2026-09-30T09:00').text, 'tomorrow, 22:00 to 02:00');
  assert.equal(plusHour('19:00'), '20:00');
});

// ---- Repeat faults -----------------------------------------------------------------------------------------------

test('ordinals and quarters', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
  assert.equal(quarterStart('2026-09-28'), '2026-07-01');
  assert.equal(quarterStart('2026-01-01'), '2026-01-01');
  assert.deepEqual(lastMonths('2026-09-28').map((m) => m.key).slice(0, 2), ['2025-10', '2025-11']);
});

test('a space\'s faults: the count this quarter, as the page says it, and a bar a month', () => {
  const f = (opened) => ({ opened, space: 's' });
  const r = repeatsOf([f('2026-08-11T09:20'), f('2026-09-25T14:30'), f('2026-09-28T07:52'), f('2026-02-17T14:05'), f('2024-01-01T10:00')], TODAY);
  assert.equal(r.text, '3rd fault this quarter');
  assert.equal(r.quarter, 3);
  assert.equal(r.year, 4, 'a fault older than 12 months is left out');
  assert.equal(r.bars.length, 12);
  assert.equal(r.bars[11].n, 2);
  assert.equal(repeatsOf([f('2026-05-01T10:00')], TODAY).text, 'No faults this quarter');
  assert.equal(repeatsOf([f('2026-09-01T10:00')], TODAY).repeat, false);
  assert.equal(repeatsOf([], TODAY), null, 'nothing this year: the page shows nothing');
  const top = mostRepeats([{ ...f('2026-09-01T10:00'), space: 'a' }, { ...f('2026-09-02T10:00'), space: 'a' }, { ...f('2026-09-03T10:00'), space: 'b' }], TODAY);
  assert.deepEqual(top.map((x) => x.space), ['a'], 'a single fault is not a repeat');
});

test('the fault history agrees with the incidents: Whooper Swan in Dublin is on its third fault this quarter', () => {
  const faults = [
    ...load('fault-history').flatMap((h) => h.faults.map((x) => ({ opened: x.opened, space: x.space, unit: x.unit }))),
    ...load('incidents').map((i) => ({ opened: i.opened, space: i.subject.room, unit: i.subject.device ?? null })),
  ];
  assert.equal(repeatsOf(faults.filter((x) => x.space === 'dub-3-09'), TODAY).text, '3rd fault this quarter');
  assert.equal(repeatsOf(faults.filter((x) => x.unit === 'AG-000335'), TODAY).text, '2nd fault this quarter');
  for (const h of load('fault-history')) {
    assert.ok(h.demo, `${h.id} is marked demo`);
    for (const x of h.faults) assert.ok(x.opened < `${TODAY}T23:59` && x.resolved > x.opened, x.number);
  }
});

// ---- The space page: accessibility, cable tests and platforms ---------------------------------------------------

test('a room\'s accessibility for staff: the answer first, and the yearly loop test when it is due', () => {
  const site = { checked_by: 'Facilities', every_room: { captions: true, step_free: { value: true }, checked: '2026-06-18' }, rooms: { r1: { hearing_loop: { standard: 'IEC 60118-4', tested: '2025-08-01', result: 'meets' } }, r2: { hearing_loop: { standard: 'IEC 60118-4', tested: '2026-07-12', result: 'meets' } } } };
  const r1 = accessForStaff(accessOf(site, 'r1'), TODAY), r2 = accessForStaff(accessOf(site, 'r2'), TODAY);
  assert.equal(r2.answer, 'A hearing loop, live captions and step-free access');
  assert.equal(r2.due.text, 'Next loop test due Jul 2027');
  assert.match(r1.answer, /loop test overdue since Aug 2026$/);
  assert.equal(accessForStaff(accessOf(site, 'r3'), TODAY).rows[0].value, 'None in this room');
  assert.equal(accessForStaff(null, TODAY), null, 'no record, no block');
});

test('cable tests: passed or failed first, with the closest margin', () => {
  const run = (id, result, margin) => ({ id, type: 'cat6a', to: { space: 's', outlet: 'data/behind-display#1' }, test: { result, date: '2022-01-24', length_m: 30, margin_db: margin } });
  assert.equal(cableTestsOf([run('a', 'pass', 6.1), run('b', 'pass', 2.4)]).answer, 'All 2 links passed certification · closest margin 2.4 dB');
  assert.equal(cableTestsOf([run('a', 'pass', 6.1), run('b', 'fail', 0)]).answer, '1 of 2 links failed certification');
  assert.equal(cableTestsOf([run('a', 'pass', 2.4)]).rows[0].thin, true);
  assert.equal(cableTestsOf([]), null);
});

test('platforms: the room\'s call system first, from the model choices', () => {
  const p = platformsOf([
    { id: 'tc', name: 'Poly TC10', role: 'Touch controller', platforms: [{ name: 'Google Meet', support: 'yes' }] },
    { id: 'vb', name: 'Poly Studio X52', role: 'Video bar', platforms: [{ name: 'Microsoft Teams Rooms', support: 'yes' }, { name: 'Google Meet', support: 'yes' }, { name: 'Zoom Rooms', support: 'not-confirmed' }] },
  ]);
  assert.equal(p.answer, 'The video bar is certified for Google Meet and Microsoft Teams Rooms');
  assert.equal(p.rows.find((r) => r.id === 'vb').other.length, 1);
  assert.equal(platformsOf([{ id: 'x', name: 'X', role: 'Display', platforms: [] }]), null);
});

test('the trend strip is drawn at its own size, one stroke a period, and says its numbers', () => {
  const html = trendStrip({ bars: [{ label: 'Aug', n: 0 }, { label: 'Sep', n: 2 }], label: 'Faults', step: 10, height: 20, mark: 1 });
  assert.match(html, /width="20" height="20"/);
  assert.equal((html.match(/class="ts-bar km-draw/g) ?? []).length, 1, 'an empty month draws no bar');
  assert.match(html, /aria-label="Faults: Aug 0, Sep 2"/);
  assert.match(html, /data-draw/);
});

// ---- Every new block can be switched off -------------------------------------------------------------------------

test('every capability in the list is carried by a block on some page (data-feature)', () => {
  const ids = new Set(FEATURES_ADDED.map((f) => f.id));
  const files = [];
  const walkSrc = (d) => readdirSync(d).forEach((n) => { const p = path.join(d, n); if (statSync(p).isDirectory()) walkSrc(p); else if (/\.(astro|mjs|js)$/.test(n)) files.push(p); });
  walkSrc(path.join(ROOT, 'src'));
  const used = new Set();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/data-feature=\\?["']([a-z-]+)\\?["']/g)) used.add(m[1]);
  for (const id of ids) assert.ok(used.has(id), `${id} is listed but no page carries data-feature="${id}"`);
});
