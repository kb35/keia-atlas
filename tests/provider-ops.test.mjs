// A provider's operations (src/lib/provider-ops.mjs): the reservation and shortfall maths, draft and received purchase
// orders, certifications against visits, visit readiness, and the RAMS generated from the space data. Small made-up
// fixtures for the rules, then the demo's own record (data/providers/northlight/ops/) for what the pages lead with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  stockState, figures, ledger, planJobs, shortfalls, draftOrders, reserveJob, receiveOrder, stockAnswer,
  certState, validOn, crewCheck, readiness, weekGrid, generateRams, tasksOf, riskBand, opsView, readLocal, visitsAnswer,
  handoverPack, warrantyEnd, WEEKS, HEIGHT_M, MEWP_M, DISCLAIMER, ramsAnswer,
} from '../src/lib/provider-ops.mjs';
import { opsBase, loadOps } from '../src/lib/provider-ops-load.mjs';
import { ordersAnswer, ramsListAnswer } from '../src/lib/provider-ops-view.mjs';
import { PROVIDER_RECORDS } from '../src/lib/engagements.mjs';
import { PEOPLE } from '../src/lib/demo.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---- Fixtures --------------------------------------------------------------------------------------------------------
const STOCK = {
  counted: '2026-09-25',
  locations: [{ id: 'van', name: 'Van', kind: 'van' }, { id: 'wh', name: 'Warehouse', kind: 'warehouse' }],
  items: [
    { model: 'bar', reorder_point: 1, distributor: 'd1', serials: [{ serial: 'S-VAN', at: 'van' }, { serial: 'S-1', at: 'wh' }, { serial: 'S-2', at: 'wh' }, { serial: 'S-HELD', at: 'wh', job: 'J-1' }] },
    { part: 'cable', what: 'Cable', unit: 'box', reorder_point: 2, distributor: 'd2', on_hand: { wh: 3, van: 1 }, reserved: [{ job: 'J-9', qty: 1 }] },
  ],
};
const job = (id, day, bomLines, extra = {}) => ({ id, title: id, client: 'c', site: 's', days: [day], bomLines, ...extra });
const DIST = [{ id: 'd1', name: 'One', lead_days: 3 }, { id: 'd2', name: 'Two', lead_days: 1 }];

// ---- Stock and reservations -------------------------------------------------------------------------------------------
test('figures: on hand by place and in all, reserved by job, available never below zero', () => {
  const S = stockState(STOCK);
  const [bar, cable] = ledger(S);
  assert.deepEqual([bar.onHand, bar.reserved, bar.available, bar.byLoc.wh, bar.byJob['J-1']], [4, 1, 3, 3, 1]);
  assert.deepEqual([cable.onHand, cable.reserved, cable.available, cable.low], [4, 1, 3, false]);
  const over = figures({ serialised: false, onHand: { wh: 1 }, reserved: [{ job: 'x', qty: 3 }], reorderPoint: 0, serials: [] });
  assert.equal(over.available, 0, 'more reserved than on hand leaves none available, never a negative');
});

test('a job keeps what is held for it, takes the rest from stock warehouse first, and the earlier job goes first', () => {
  const S = stockState(STOCK);
  const jobs = [
    job('J-2', '2026-10-06', [{ model: 'bar', qty: 2 }, { part: 'cable', qty: 2 }]),
    job('J-1', '2026-10-05', [{ model: 'bar', qty: 3 }]),
  ];
  const P = planJobs(S, jobs);
  assert.deepEqual(P.jobs.map((p) => p.job.id), ['J-1', 'J-2'], 'in the order they start');
  const j1 = P.jobs[0].lines[0];
  assert.deepEqual([j1.held, j1.heldSerials, j1.take, j1.short], [1, ['S-HELD'], ['S-1', 'S-2'], 0], 'warehouse serials before the van');
  const j2bar = P.jobs[1].lines.find((l) => l.model === 'bar');
  assert.deepEqual([j2bar.take, j2bar.short], [['S-VAN'], 1], 'the later job gets what is left, and is short of the rest');
  const j2cable = P.jobs[1].lines.find((l) => l.part === 'cable');
  assert.deepEqual([j2cable.takeQty, j2cable.short], [2, 0]);
  assert.equal(P.left.get('model:bar'), 0);
  assert.equal(P.left.get('part:cable'), 1);
  assert.deepEqual(shortfalls(P, { id: 'next', from: '2026-10-05', to: '2026-10-09' }).map((s) => [s.job.id, s.key, s.short]), [['J-2', 'model:bar', 1]]);
  assert.deepEqual(shortfalls(P, WEEKS.this), [], 'a shortfall belongs to the week its job starts');
});

test('an open order for the job covers its line: on order, not short; a done job takes nothing', () => {
  const S = stockState({ ...STOCK, items: [{ model: 'mic', reorder_point: 0, distributor: 'd1', serials: [] }] });
  const jobs = [job('J-5', '2026-09-30', [{ model: 'mic', qty: 2 }]), job('J-0', '2026-09-01', [{ model: 'mic', qty: 5 }], { status: 'done' })];
  const P = planJobs(S, jobs, { orders: [{ id: 'PO-1', status: 'sent', job: 'J-5', lines: [{ model: 'mic', qty: 2 }] }] });
  assert.equal(P.jobs.length, 1);
  assert.deepEqual([P.jobs[0].lines[0].onOrder, P.jobs[0].lines[0].short, P.jobs[0].ready], [2, 0, false]);
});

test('reserving marks the serials and counted parts for the job, and leaves the record given unchanged', () => {
  const S = stockState(STOCK);
  const P = planJobs(S, [job('J-1', '2026-10-05', [{ model: 'bar', qty: 3 }, { part: 'cable', qty: 2 }])]);
  const N = reserveJob(S, P.jobs[0]);
  assert.deepEqual(N.items[0].serials.filter((s) => s.job === 'J-1').map((s) => s.serial).sort(), ['S-1', 'S-2', 'S-HELD']);
  assert.deepEqual(N.items[1].reserved.find((r) => r.job === 'J-1'), { job: 'J-1', qty: 2 });
  assert.equal(S.items[0].serials.filter((s) => s.job).length, 1, 'the input is untouched');
  const again = planJobs(N, [job('J-1', '2026-10-05', [{ model: 'bar', qty: 3 }, { part: 'cable', qty: 2 }])]);
  assert.ok(again.jobs[0].reserved && again.jobs[0].lines.every((l) => l.takeQty === 0), 'reserved once: nothing left to take');
});

// ---- Purchase orders ----------------------------------------------------------------------------------------------------
test('draft orders: the shortfall plus a top-up to the reorder point, one per distributor, working days, numbered on', () => {
  const S = stockState(STOCK);
  const P = planJobs(S, [job('J-1', '2026-10-05', [{ model: 'bar', qty: 5 }, { part: 'cable', qty: 3 }])]);
  const D = draftOrders(P, S, DIST, { today: '2026-09-30', week: { id: 'next', from: '2026-10-05', to: '2026-10-09' }, orders: [{ id: 'PO-2026-0417' }] });
  const bar = D.find((d) => d.distributor === 'd1');
  assert.deepEqual(bar.lines.map((l) => [l.key, l.short, l.topUp, l.qty]), [['model:bar', 1, 1, 2]], 'short 1, then back up to the reorder point of 1');
  assert.equal(bar.expected, '2026-10-05', 'three working days from a Wednesday skip the weekend');
  assert.equal(bar.inTime, false, 'arriving on the day the job starts is too late');
  const cable = D.find((d) => d.distributor === 'd2');
  assert.deepEqual(cable.lines.map((l) => [l.short, l.topUp, l.qty]), [[0, 2, 2]], 'nothing short, but the job leaves it below its reorder point');
  assert.equal(cable.expected, '2026-10-01');
  assert.deepEqual(D.map((d) => d.id), ['PO-2026-0418', 'PO-2026-0419'], 'short first, numbered after the last order');
  assert.deepEqual(bar.lines[0].alloc, [{ job: 'J-1', qty: 1 }], 'the short part is for the job; the top-up stays free');
});

test('receiving an order puts its serials into stock at the delivery place, reserved for its job', () => {
  const S = stockState(STOCK);
  const { state, added } = receiveOrder(S, { id: 'PO-1', job: 'J-7', deliver_to: 'van', lines: [{ model: 'bar', qty: 2, serials: ['S-9', 'S-10'] }, { part: 'cable', qty: 4 }] });
  const bar = state.items[0], cable = state.items[1];
  assert.deepEqual(bar.serials.filter((s) => s.job === 'J-7').map((s) => [s.serial, s.at]), [['S-9', 'van'], ['S-10', 'van']]);
  assert.equal(cable.onHand.van, 5);
  assert.deepEqual(cable.reserved.find((r) => r.job === 'J-7'), { job: 'J-7', qty: 4 });
  assert.equal(added.length, 3);
  assert.equal(S.items[0].serials.length, 4, 'the input is untouched');
  // A draft's line: only its allocation is reserved; the top-up stays free, and made-up serials fill in.
  const r2 = receiveOrder(S, { id: 'PO-2', deliver_to: 'wh', lines: [{ model: 'bar', qty: 3, alloc: [{ job: 'J-8', qty: 1 }] }] });
  const got = r2.state.items[0].serials.slice(4);
  assert.deepEqual(got.map((s) => s.job), ['J-8', null, null]);
  assert.ok(got.every((s) => /^DEMO-NL-\d{5}$/.test(s.serial)), got.map((s) => s.serial).join());
  // A model that was not stocked becomes a new item.
  const r3 = receiveOrder(S, { id: 'PO-3', job: 'J-1', lines: [{ model: 'new', qty: 1, serials: ['N-1'] }] });
  assert.equal(r3.state.items.find((it) => it.model === 'new').serials[0].job, 'J-1');
});

// ---- Certifications and visits ---------------------------------------------------------------------------------------------
const crew = [
  { id: 'ann', name: 'Ann One', certs: [{ kind: 'wah', expires: '2026-10-06' }, { kind: 'ipaf', expires: '2026-09-29' }, { kind: 'cts', expires: '2028-01-01' }] },
  { id: 'bo', name: 'Bo Two', certs: [{ kind: 'wah', expires: '2027-01-01' }] },
];
test('a certification is valid up to and including its expiry date; To review within 60 days', () => {
  assert.equal(validOn({ expires: '2026-10-06' }, '2026-10-06'), true);
  assert.equal(validOn({ expires: '2026-10-06' }, '2026-10-07'), false);
  assert.equal(validOn(null, '2026-10-01'), false);
  assert.equal(certState({ kind: 'wah', expires: '2026-09-15' }, '2026-09-28').state, 'fault');
  assert.equal(certState({ kind: 'wah', expires: '2026-11-27' }, '2026-09-28').state, 'review');
  assert.equal(certState({ kind: 'wah', expires: '2026-11-28' }, '2026-09-28').state, 'fine');
});

test('a visit needs each certification valid on its last day: everyone, or one person on site', () => {
  const needs = [{ kinds: ['wah'], each: true, label: 'Working at height' }, { kinds: ['ipaf'], each: false, label: 'IPAF' }, { kinds: ['cts', 'cts-d'], each: false, label: 'CTS' }];
  const oneDay = crewCheck({ days: ['2026-09-29'], people: ['ann', 'bo'] }, crew, needs);
  assert.deepEqual(oneDay, [], 'on the 29th everything is in date');
  const threeDays = crewCheck({ days: ['2026-10-05', '2026-10-06', '2026-10-07'], people: ['ann', 'bo'] }, crew, needs);
  assert.deepEqual(threeDays.map((p) => [p.person ?? null, p.label]), [['ann', 'Working at height'], [null, 'IPAF']], 'it runs past Ann\'s expiry on the 6th, and nobody has IPAF by then');
  assert.match(threeDays[0].words, /^Working at height for Ann expired 6 Oct$/);
  assert.equal(crewCheck({ days: ['2026-09-29'], people: ['bo'] }, crew, [{ kinds: ['cts'], each: false, label: 'CTS' }])[0].words, 'Nobody on the visit holds CTS in date');
});

test('readiness: every check must pass, and a blocker names what is missing and the day it puts at risk', () => {
  const visit = { id: 'v', days: ['2026-10-06'], people: ['ann', 'bo'], jobs: ['J-1'], access: { badge: { ann: 'approved', bo: 'requested' }, escort: 'not-needed', induction: ['ann', 'bo'], comms_room: 'approved', ceiling: 'not-needed' } };
  const plan = { jobs: [{ job: { id: 'J-1' }, lines: [{ short: 0, onOrder: 0 }] }] };
  const r = readiness(visit, { people: crew, plan, rams: { 'J-1': { status: 'approved', reviewedByName: 'Sam Okafor' } }, needs: { 'J-1': [] } });
  assert.equal(r.ready, false);
  assert.deepEqual(r.blockers, ['Badge not approved: Tuesday at risk']);
  assert.equal(r.checks.find((c) => c.id === 'badge').words, 'Waiting on Bo\'s badge');
  const ok = readiness({ ...visit, access: { ...visit.access, badge: { ann: 'approved', bo: 'approved' } } }, { people: crew, plan, rams: { 'J-1': { status: 'approved', reviewedByName: 'Sam Okafor' } }, needs: { 'J-1': [] } });
  assert.equal(ok.ready, true);
  assert.equal(ok.checks.length, 8, 'badges, escort, induction, comms room, ceiling, RAMS, certifications, parts');
  const draft = readiness(visit, { people: crew, plan: { jobs: [{ job: { id: 'J-1' }, lines: [{ short: 2, onOrder: 0 }] }] }, rams: {}, needs: { 'J-1': [{ kinds: ['wah'], each: true, label: 'Working at height' }] } });
  assert.ok(draft.blockers.some((b) => /^Working at height for Ann expired 6 Oct: Tuesday at risk$/.test(b)) === false, 'Ann is in date on the 6th');
  assert.ok(draft.blockers.includes('RAMS not approved: Tuesday at risk'));
  assert.ok(draft.blockers.includes('2 parts short: Tuesday at risk'));
});

test('the week: a booked visit first, else a rota day, else the workshop', () => {
  const G = weekGrid(crew, [{ id: 'v', client: 'c', site: 's', where: 'Room', days: ['2026-09-29'], people: ['ann'] }], [{ people: ['ann', 'bo'], client: 'r', site: 'x', from: '2026-09-28', to: '2026-10-02', weekdays: true, what: 'Resident' }], WEEKS.this);
  assert.deepEqual(G.rows[0].cells.map((c) => c.kind), ['rota', 'visit', 'rota', 'rota', 'rota']);
  assert.deepEqual([G.onSite, G.sites], [2, 2]);
});

// ---- The RAMS -----------------------------------------------------------------------------------------------------------------
test('RAMS: working at height comes from the ceiling or tray height in the record, a platform above 3.5 m, each hazard sourced', () => {
  const people = crew;
  const low = generateRams({ job: job('J', '2026-10-05', [], { tasks: ['cabling'] }), facts: { tray_m: 1.9, traySource: 'tray record' }, people });
  assert.ok(!low.hazards.some((h) => h.title === 'Working at height'), `cable at 1.9 m is below ${HEIGHT_M} m`);
  const tray = generateRams({ job: job('J', '2026-10-05', [], { tasks: ['cabling'] }), facts: { tray_m: 3.1, traySource: 'Floor record: tray at 3.1 m', ceiling_m: 2.7 }, people });
  const wah = tray.hazards.find((h) => h.title === 'Working at height');
  assert.ok(wah && wah.sources.includes('Floor record: tray at 3.1 m') && /3\.1 m/.test(wah.what));
  assert.ok(!tray.hazards.some((h) => h.title === 'Operating a mobile platform'), 'podium steps reach 3.1 m');
  const high = generateRams({ job: job('J', '2026-10-05', []), lines: [{ model: 'm', qty: 2, cls: 'microphone', location: 'ceiling', name: 'Ceiling mic' }], facts: { ceiling_m: 6.2, ceilingSource: 'Survey: 6.2 m', occupied: true, hospital: true, occupiedSource: 'Survey: clinic' }, people });
  assert.ok(high.hazards.some((h) => h.title === 'Operating a mobile platform'), `above ${MEWP_M} m needs a platform`);
  assert.ok(high.hazards.some((h) => h.title === 'Dust from the ceiling void'), 'ceiling work near patients');
  assert.ok(high.needs.some((n) => n.kinds.includes('ipaf') && !n.each), 'one IPAF holder on site');
  for (const doc of [tray, high]) {
    for (const h of doc.hazards) {
      assert.ok(h.sources.length && h.sources.every(Boolean), `${h.title} says where it came from`);
      assert.ok(h.after.r <= h.before.r, `${h.title}: controls never raise the risk`);
      assert.ok(h.harmed.length && h.controls.length, h.title);
    }
    assert.equal(doc.matrix.after.flat().reduce((a, b) => a + b, 0), doc.hazards.length, 'every hazard sits in one cell');
    assert.equal(doc.disclaimer, DISCLAIMER);
    assert.ok(doc.steps.length >= 4 && doc.ppe.includes('Safety boots') && doc.emergency.length >= 3);
  }
  assert.equal(riskBand(3, 5).id, 'high'); assert.equal(riskBand(1, 5).id, 'medium'); assert.equal(riskBand(2, 2).id, 'low');
});

test('RAMS: tasks come from the bill of materials; one person alone and a fit-out add their hazards', () => {
  const T = tasksOf(job('J', 'd', []), [{ cls: 'display', qty: 1, name: 'Display' }, { cls: 'monitor', qty: 8, name: 'Monitor' }, { part: 'cat6a-box', qty: 1, name: 'Cable' }], { comms: { name: 'MDF' } }).map((t) => t.id);
  assert.deepEqual(T.sort(), ['cabling', 'desk-kit', 'mount-display', 'rack']);
  const solo = generateRams({ job: job('J', '2026-10-05', [], { tasks: ['maintenance'] }), facts: { fitOut: true, fitOutSource: 'Project: fit-out' }, people: [crew[1]], visit: { days: ['2026-10-05'], people: ['bo'] } });
  assert.ok(solo.hazards.some((h) => h.title === 'Working alone'));
  assert.ok(solo.hazards.some((h) => h.title === 'Other trades on an active fit-out'));
  assert.deepEqual(solo.problems.map((p) => p.words), ['Bo has no site safety card on record']);
});

// ---- The demo's record ---------------------------------------------------------------------------------------------------------
const B = opsBase(ROOT);
const V = opsView(B, {});

test('the record: every model is in the device library, every person and job exists, this week\'s visits keep their ids', () => {
  const models = new Set(readdirSync(join(ROOT, 'data/device-models')).map((n) => n.slice(0, -5)));
  const L = loadOps(ROOT);
  const used = [
    ...L.stock.items.filter((it) => it.model).map((it) => it.model),
    ...L.orders.orders.flatMap((o) => o.lines.filter((l) => l.model).map((l) => l.model)),
    ...B.jobs.flatMap((j) => j.bomLines.filter((l) => l.model).map((l) => l.model)),
  ];
  assert.deepEqual(used.filter((m) => !models.has(m)), []);
  const people = new Set(B.people.map((p) => p.id));
  const jobs = new Set(B.jobs.map((j) => j.id));
  for (const v of B.visits) { for (const p of v.people) assert.ok(people.has(p), `${v.id}: ${p}`); for (const j of v.jobs) assert.ok(jobs.has(j), `${v.id}: ${j}`); }
  for (const r of PROVIDER_RECORDS.filter((x) => x.kind === 'visit')) assert.ok(B.visits.some((v) => v.id === r.id), `${r.id} is in the ops visits`);
  const locs = new Set(L.stock.locations.map((l) => l.id));
  for (const it of L.stock.items) for (const s of it.serials ?? []) assert.ok(locs.has(s.at), s.serial);
  // Northlight's people are its own: only Sam is in the demo's View as, and no new name collides with Aigna's people.
  const aigna = new Set(PEOPLE.map((p) => p.name.split(' ')[0]));
  for (const p of B.people.filter((x) => x.id !== 'sam')) assert.ok(!aigna.has(p.name.split(' ')[0]), p.name);
  assert.equal(PEOPLE.find((p) => p.id === 'sam').vendor, 'northlight');
});

test('the Juneau job reads its bill of materials from Aigna\'s PRJ-14 build sheet, with Northlight\'s pick where the record has no model', () => {
  const j = B.jobs.find((x) => x.id === 'NL-2318');
  const count = (k) => j.bomLines.filter((l) => (l.model ?? l.part) === k).reduce((n, l) => n + l.qty, 0);
  assert.equal(count('dell-u2724de'), 8, 'eight flex desks, one monitor each');
  assert.equal(count('logitech-meetup-2'), 1);
  assert.equal(count('display-43'), 1, 'the space type leaves the display\'s model open');
  assert.ok(j.bomLines.every((l) => l.from), 'each line says where it came from');
});

test('the pages lead with: 2 shortfalls for next week, 3 of 6 visits at risk, and answers that fit two lines', () => {
  assert.equal(V.short.length, 2);
  assert.match(V.answer, /^2 shortfalls for next week's jobs/);
  assert.deepEqual(V.short.map((s) => `${s.job.id} ${s.key} ${s.short}`), ['NL-2318 model:dell-u2724de 2', 'NL-2310 model:poly-e60 1']);
  assert.equal(V.visits.filter((r) => !r.ready).length, 3);
  const qcy = V.visits.find((r) => r.visit.id === 'visit-nl-qcy');
  assert.ok(qcy.blockers.includes('Badge not approved: Tuesday at risk'));
  const jnu = V.visits.find((r) => r.visit.id === 'visit-nl-jnu');
  assert.ok(jnu.blockers.some((b) => /^Working at height for Maya expired 15 Sep: Monday at risk$/.test(b)), jnu.blockers.join(' | '));
  for (const a of [V.answer, V.visitsAnswer, ordersAnswer(V), ramsListAnswer(V), ...Object.values(V.rams).map(ramsAnswer)]) assert.ok(a.length <= 110, `${a.length}: ${a}`);
  assert.ok(!/\b(profiles?|makers?)\b/i.test(JSON.stringify(B)), 'no retired word in the ops record');
});

test('the Juneau RAMS is written from Aigna\'s floor data: tray height, the riser beside the comms room, a fit-out', () => {
  const d = V.rams['NL-2318'];
  const wah = d.hazards.find((h) => h.title === 'Working at height');
  assert.ok(wah.sources.some((s) => /floor record: cable tray .* 3\.1 m/.test(s)), wah.sources.join(' | '));
  const riser = d.hazards.find((h) => h.title === 'Fire stopping in the riser');
  assert.ok(riser && riser.sources.some((s) => /Riser 1 \(data\), fire-stopped at each floor/.test(s)), riser?.sources.join(' | '));
  assert.ok(d.hazards.some((h) => h.title === 'Other trades on an active fit-out' && h.sources.some((s) => /PRJ-14/.test(s))));
  assert.ok(d.hazards.some((h) => h.title === 'Electrical work by others' && h.sources.some((s) => /T-1403/.test(s))));
  assert.ok(!d.hazards.some((h) => h.title === 'Operating a mobile platform'), 'a 2.7 m ceiling is reached from podium steps');
  assert.equal(d.status, 'draft');
  const lt = V.rams['NL-2301'];
  assert.ok(lt.hazards.some((h) => h.title === 'Operating a mobile platform' && h.sources.some((s) => /6\.2 m/.test(s))), 'the 6.2 m lecture theatre, from the survey');
});

test('acting on the pages: receive, send, reserve and approve change the view, and a bad saved state is ignored', () => {
  assert.deepEqual(readLocal('junk'), { sent: [], received: [], reserved: [], approved: {} });
  const cam = () => V2.visits.find((r) => r.visit.id === 'visit-nl-cam');
  let V2 = opsView(B, { received: ['PO-2026-0417'] });
  assert.equal(cam().ready, true, 'the microphones arrive, reserved for the lecture theatre job');
  assert.equal(V2.S.items.find((it) => it.model === 'poly-ip-ceiling-microphone').serials.filter((s) => s.job === 'NL-2301').length, 2);
  const dell = V.drafts.find((d) => d.lines.some((l) => l.model === 'dell-u2724de'));
  V2 = opsView(B, { sent: [dell.id] });
  assert.ok(V2.open.some((o) => o.id === dell.id) && !V2.drafts.some((o) => o.id === dell.id), 'a sent draft is on order, with the same number');
  assert.equal(V2.short.length, 1, 'the Dell monitors are now on order for the job');
  V2 = opsView(B, { reserved: ['NL-2318'] });
  const p = V2.plan.jobs.find((x) => x.job.id === 'NL-2318');
  assert.equal(p.lines.find((l) => l.model === 'dell-u2724de').held, 6);
  V2 = opsView(B, { approved: { 'NL-2318': { by: 'sam', at: '2026-09-28T12:00' } } });
  const jnu = V2.visits.find((r) => r.visit.id === 'visit-nl-jnu');
  assert.ok(!jnu.blockers.some((b) => b.startsWith('RAMS')));
  assert.equal(V2.rams['NL-2318'].reviewedByName, 'Sam Okafor');
  assert.match(visitsAnswer(V2.visits), /^3 of 6 visits at risk/, 'Juneau still waits on Maya\'s training and the monitors');
});

test('the handover pack: as-built with ports and VLANs, tests, warranty from the handover date, gaps named', () => {
  const pack = { id: 'HO-1', handed_over: '2026-09-11', sent: '2026-09-11T15:20', accepted: { by: 'marcus', at: '2026-09-12T10:05' } };
  const units = [
    { space: 'r', spaceName: 'Heron', position: 'video-bar', name: 'Heron, video bar', cls: 'video-bar', clsName: 'Video bar', model: 'poly-studio-x52', modelName: 'Poly Studio X52', manufacturer: 'Poly', serial: 'S1', tag: 'AG-1', host: 'h1' },
    { space: 'r', spaceName: 'Heron', position: 'display', name: 'Heron, display', cls: 'display', clsName: 'Display', model: null, modelName: null, manufacturer: null, serial: 'S2', tag: 'AG-2', host: 'h2' },
  ];
  const H = handoverPack({
    pack, job: { id: 'NL-1', client: 'aigna' }, units, ports: { 'AG-1': { switch: 'sw1', port: 6, vlan: 30, vlanName: 'Room systems', address: '10.0.0.6' } },
    rooms: [{ id: 'r', name: 'Heron', tests: [{ id: 'call', t: 'Call' }, { id: 'display', t: 'Displays' }], results: { call: { r: 'fail', note: 'Framing' }, display: { r: 'pass' } } }],
    docs: { 'poly-studio-x52': { guide: { name: 'Guide' }, sources: [] } }, terms: [{ manufacturer: 'Poly', months: 36 }], names: { client: 'Aigna', accepted: 'Marcus Lee' },
  });
  assert.deepEqual([H.asBuilt[0].port, H.asBuilt[0].vlan, H.asBuilt[1].port], ['sw1 port 6', 30, null]);
  assert.deepEqual(H.asBuilt[0].warranty, { ends: '2029-09-10', months: 36 });
  assert.equal(warrantyEnd('2026-09-11', 'Nobody', []), null);
  assert.equal(H.answer, '2 units · 1 of 2 room tests passed · accepted by Marcus Lee');
  assert.ok(H.gaps.some((g) => /no model in the client's record/.test(g)) && H.gaps.some((g) => /Heron: 1 room test not passed/.test(g)));
  assert.deepEqual(H.delivery.map((d) => d.by), ['Keia', 'Northlight AV', 'Aigna', 'Aigna']);
});
