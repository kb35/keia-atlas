// A provider's operations: running the work (docs/service-providers.md, section 5). Northlight AV's stock, reservations
// and purchase orders, its crews and their certifications, visit readiness, the RAMS (risk assessment and method
// statement) and the handover pack. Keia's edge is that it already knows the site: the paperwork builds itself from the
// record, and a person confirms it ("capture, don't ask"). Accounting and a full PSA stay where they are and connect.
//
// The rules this file keeps:
//   1. Stock answers first. A job's bill of materials takes stock in the order the jobs start; what stock cannot give and
//      no open order covers is a shortfall, and each shortfall becomes a draft purchase order a person sends.
//   2. Receiving an order adds its serials to stock and reserves them for the job it was for, in one step.
//   3. A certification is valid up to and including its expiry date; a visit needs it valid on every day it runs.
//   4. A visit is ready only when every check passes. A blocker names what is missing and the day it puts at risk:
//      "Badge not approved: Tuesday at risk".
//   5. A RAMS is generated from the record (the space, the job's tasks, the crew's certifications), each hazard says where
//      it came from, and nothing goes ahead until a person approves it. It is a demo template, not safety advice.
//
// Pure: nothing is loaded here, so the same code runs when the site is built, in the browser (a reservation, a received
// order, an approval) and in the tests (tests/provider-ops.test.mjs). src/lib/provider-ops-load.mjs gathers the data.
// Everything is SIMULATED, fixed at the demo's now, 28 Sept 12:00.
import { NOW, addWorkingDays, dateWords, daysBetween } from './vendors.mjs';

export { NOW, dateWords };
export const TODAY = NOW.slice(0, 10);

// ---- Days and weeks --------------------------------------------------------------------------------------------------
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const utc = (d) => new Date(`${d}T00:00Z`);
const iso = (t) => t.toISOString().slice(0, 10);
const addDays = (d, n) => iso(new Date(utc(d).getTime() + n * 864e5));
/** "15 Sep" (the year only when it is not this year's). */
export const shortDate = (d) => `${utc(d).getUTCDate()} ${MON[utc(d).getUTCMonth()]}${d.slice(0, 4) !== NOW.slice(0, 4) ? ` ${d.slice(0, 4)}` : ''}`;
/** "Tuesday" */
export const dayName = (d) => DAY[utc(d).getUTCDay()];
/** "Tue 29 Sep" */
export const dayWords = (d) => `${DAY[utc(d).getUTCDay()].slice(0, 3)} ${utc(d).getUTCDate()} ${MON[utc(d).getUTCMonth()]}`;
const weekday = (d) => { const w = utc(d).getUTCDay(); return w !== 0 && w !== 6; };
export const WEEKS = {
  this: { id: 'this', label: 'This week', from: '2026-09-28', to: '2026-10-02' },
  next: { id: 'next', label: 'Next week', from: '2026-10-05', to: '2026-10-09' },
};
/** The five working days of a week. */
export const weekDays = (w) => Array.from({ length: 5 }, (_, i) => addDays(w.from, i));
/** Does a job or visit start in the week? */
export const inWeek = (x, w) => x.days[0] >= w.from && x.days[0] <= w.to;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const listWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const firstName = (name) => String(name ?? '').split(' ')[0];

// ---- Stock -------------------------------------------------------------------------------------------------------------
/** The key an item, a bill-of-materials line or an order line is matched on. */
export const itemKey = (x) => (x.model ? `model:${x.model}` : `part:${x.part}`);
const LOC_ORDER = { warehouse: 0, van: 1 };

/** The stock record in a working shape, copied, so the maths never edits the data it was given. */
export function stockState(stock) {
  const order = Object.fromEntries((stock.locations ?? []).map((l, i) => [l.id, (LOC_ORDER[l.kind] ?? 2) * 10 + i]));
  return {
    counted: stock.counted, locations: (stock.locations ?? []).map((l) => ({ ...l })), order,
    items: (stock.items ?? []).map((it) => ({
      key: itemKey(it), model: it.model ?? null, part: it.part ?? null, what: it.what ?? null, unit: it.unit ?? null,
      reorderPoint: it.reorder_point ?? 0, distributor: it.distributor ?? null, notes: it.notes ?? null, serialised: Boolean(it.model),
      serials: (it.serials ?? []).map((s) => ({ serial: s.serial, at: s.at, job: s.job ?? null })),
      onHand: { ...(it.on_hand ?? {}) }, reserved: (it.reserved ?? []).map((r) => ({ job: r.job, qty: r.qty })),
    })),
  };
}
const cloneState = (S) => ({ ...S, locations: S.locations.map((l) => ({ ...l })), items: S.items.map((it) => ({ ...it, serials: it.serials.map((s) => ({ ...s })), onHand: { ...it.onHand }, reserved: it.reserved.map((r) => ({ ...r })) })) });
const sum = (xs) => xs.reduce((n, x) => n + x, 0);

/** One item's figures: on hand (in all and by location), reserved (in all and by job), available, and whether it is
    below its reorder point. Available is on hand less reserved; it is never below zero. */
export function figures(it) {
  const byLoc = {}, byJob = {};
  if (it.serialised) {
    for (const s of it.serials) { byLoc[s.at] = (byLoc[s.at] ?? 0) + 1; if (s.job) byJob[s.job] = (byJob[s.job] ?? 0) + 1; }
  } else {
    for (const [loc, n] of Object.entries(it.onHand)) if (n) byLoc[loc] = n;
    for (const r of it.reserved) byJob[r.job] = (byJob[r.job] ?? 0) + r.qty;
  }
  const onHand = sum(Object.values(byLoc)), reserved = sum(Object.values(byJob));
  const available = Math.max(0, onHand - reserved);
  return { onHand, byLoc, reserved, byJob, available, low: available < it.reorderPoint };
}

/** Every item with its figures, in the record's order. */
export const ledger = (S) => S.items.map((it) => ({ ...it, ...figures(it) }));

/** A bill of materials merged by item: one line per model or part, with the quantity and where each unit goes. */
export function mergeLines(lines = []) {
  const out = new Map();
  for (const l of lines) {
    const k = itemKey(l);
    if (!out.has(k)) out.set(k, { key: k, model: l.model ?? null, part: l.part ?? null, name: l.name ?? null, qty: 0, where: [], cls: l.cls ?? null, location: l.location ?? null, weightKg: l.weightKg ?? null });
    const o = out.get(k);
    o.qty += l.qty ?? 1;
    if (l.where) o.where.push(l.where);
  }
  return [...out.values()];
}

/** What each job needs, what is reserved for it already (held), what stock can still give it (take), what an open order
    is bringing for it (onOrder), and what is short. Jobs take stock in the order they start, so the earlier job never
    waits on a later one. Serialised kit is taken warehouse first, then the vans, in the record's order. Done jobs take
    nothing. Returns { jobs: [{ job, lines, short, onOrder, ready }], left: Map(key → units still free) }. */
export function planJobs(S, jobs, { orders = [] } = {}) {
  const byKey = new Map(S.items.map((it) => [it.key, it]));
  const free = new Map();
  for (const it of S.items) {
    free.set(it.key, it.serialised
      ? it.serials.filter((s) => !s.job).sort((a, b) => (S.order[a.at] ?? 99) - (S.order[b.at] ?? 99))
      : figures(it).available);
  }
  const openFor = (jobId, key) => sum(orders.filter((o) => o.status === 'sent' && o.job === jobId).flatMap((o) => o.lines).filter((l) => itemKey(l) === key).map((l) => l.qty));
  const out = [];
  const live = jobs.filter((j) => j.status !== 'done').slice().sort((a, b) => a.days[0].localeCompare(b.days[0]) || a.id.localeCompare(b.id));
  for (const job of live) {
    const lines = mergeLines(job.bomLines ?? []).map((l) => {
      const it = byKey.get(l.key);
      if (!it) {
        const onOrder = Math.min(l.qty, openFor(job.id, l.key));
        return { ...l, need: l.qty, held: 0, heldSerials: [], take: [], takeQty: 0, onOrder, short: l.qty - onOrder, known: false };
      }
      const heldSerials = it.serialised ? it.serials.filter((s) => s.job === job.id).map((s) => s.serial) : [];
      const held = it.serialised ? heldSerials.length : sum(it.reserved.filter((r) => r.job === job.id).map((r) => r.qty));
      let want = Math.max(0, l.qty - held);
      const onOrder = Math.min(want, openFor(job.id, l.key));
      want -= onOrder;
      let take = [], takeQty;
      if (it.serialised) { take = free.get(l.key).splice(0, want).map((s) => s.serial); takeQty = take.length; } else { takeQty = Math.min(want, free.get(l.key)); free.set(l.key, free.get(l.key) - takeQty); }
      return { ...l, need: l.qty, held, heldSerials, take, takeQty, onOrder, short: want - takeQty, known: true };
    });
    const short = lines.filter((l) => l.short > 0).length;
    const onOrder = lines.filter((l) => l.onOrder > 0).length;
    out.push({ job, lines, short, onOrder, reserved: lines.every((l) => l.held >= l.need), ready: short === 0 && onOrder === 0 });
  }
  const left = new Map([...free.entries()].map(([k, v]) => [k, Array.isArray(v) ? v.length : v]));
  return { jobs: out, left };
}

/** The lines a week's jobs are short of: one per job and item. */
export const shortfalls = (plan, week = WEEKS.next) => plan.jobs.filter((p) => inWeek(p.job, week)).flatMap((p) => p.lines.filter((l) => l.short > 0).map((l) => ({ job: p.job, ...l })));

/** Draft purchase orders for a week: one per distributor, for every line short in the week's jobs plus enough to bring
    the item back to its reorder point, and for anything the week's jobs leave below its reorder point. The expected
    date is the distributor's lead time in working days from today; `inTime` says it arrives before the first job
    that needs it. Numbered after the last order in the record. */
export function draftOrders(plan, S, distributors, { today = TODAY, week = WEEKS.next, orders = [] } = {}) {
  const byKey = new Map(S.items.map((it) => [it.key, it]));
  const need = new Map();   // key -> { short, jobs: [{ job, qty, day }] }
  for (const s of shortfalls(plan, week)) {
    if (!need.has(s.key)) need.set(s.key, { short: 0, jobs: [] });
    const n = need.get(s.key); n.short += s.short; n.jobs.push({ job: s.job.id, qty: s.short, day: s.job.days[0] });
  }
  const lines = [];
  for (const it of S.items) {
    const n = need.get(it.key), left = plan.left.get(it.key) ?? 0;
    const topUp = Math.max(0, it.reorderPoint - left);
    if (!n && !topUp) continue;
    lines.push({ key: it.key, model: it.model, part: it.part, distributor: it.distributor, short: n?.short ?? 0, topUp, qty: (n?.short ?? 0) + topUp, jobs: n?.jobs ?? [], alloc: (n?.jobs ?? []).map((j) => ({ job: j.job, qty: j.qty })) });
  }
  for (const [k, n] of need) if (!byKey.has(k)) {
    const [kind, id] = k.split(':');
    lines.push({ key: k, model: kind === 'model' ? id : null, part: kind === 'part' ? id : null, distributor: null, short: n.short, topUp: 0, qty: n.short, jobs: n.jobs, alloc: n.jobs.map((j) => ({ job: j.job, qty: j.qty })) });
  }
  let seq = Math.max(0, ...orders.map((o) => Number(String(o.id).slice(-4)) || 0));
  const year = today.slice(0, 4);
  const byDist = new Map();
  for (const l of lines) { const d = l.distributor ?? 'unassigned'; if (!byDist.has(d)) byDist.set(d, []); byDist.get(d).push(l); }
  const drafts = [...byDist.entries()].map(([dist, ls]) => {
    const D = distributors.find((d) => d.id === dist) ?? { id: dist, name: 'No distributor recorded', lead_days: 5 };
    const expected = addWorkingDays(`${today}T09:00`, D.lead_days).slice(0, 10);
    const days = ls.flatMap((l) => l.jobs.map((j) => j.day)).sort();
    const firstNeed = days[0] ?? null;
    const jobIds = [...new Set(ls.flatMap((l) => l.jobs.map((j) => j.job)))];
    return { distributor: dist, distributorName: D.name, lead: D.lead_days, lines: ls, expected, firstNeed, inTime: !firstNeed || expected < firstNeed, jobs: jobIds, job: jobIds.length === 1 ? jobIds[0] : null, short: ls.some((l) => l.short > 0), status: 'draft', raised: today, deliver_to: 'warehouse' };
  }).sort((a, b) => Number(b.short) - Number(a.short) || String(a.firstNeed ?? '9').localeCompare(String(b.firstNeed ?? '9')) || a.distributor.localeCompare(b.distributor));
  drafts.forEach((d) => { seq += 1; d.id = `PO-${year}-${String(seq).padStart(4, '0')}`; });
  return drafts;
}

/** Reserve a job's lines from stock: the serials it takes are marked for the job, and counted parts are held for it.
    Returns a new stock state; the one given is left as it was. */
export function reserveJob(S, jobPlan) {
  const N = cloneState(S);
  const byKey = new Map(N.items.map((it) => [it.key, it]));
  for (const l of jobPlan.lines) {
    const it = byKey.get(l.key); if (!it) continue;
    if (it.serialised) { for (const sn of l.take) { const s = it.serials.find((x) => x.serial === sn); if (s && !s.job) s.job = jobPlan.job.id; } }
    else if (l.takeQty > 0) {
      const r = it.reserved.find((x) => x.job === jobPlan.job.id);
      if (r) r.qty += l.takeQty; else it.reserved.push({ job: jobPlan.job.id, qty: l.takeQty });
    }
  }
  return N;
}

// A made-up serial for a unit that arrives with none on the order (the distributor's notice would carry it).
const hash = (s) => [...String(s)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
export const demoSerial = (poId, key, i) => `DEMO-NL-${30000 + ((hash(`${poId}|${key}`) % 900) * 10) + i}`;

/** Receive an order: every line goes into stock at its delivery place and is reserved for the job it was for (an order's
    `job`, or a draft's per-line allocation; a top-up to the reorder point stays free). Serials come from the order (the
    distributor's shipping notice) or are made up. Returns { state, added: [{ key, serial?, qty?, job }] }. */
export function receiveOrder(S, po) {
  const N = cloneState(S);
  const added = [];
  for (const line of po.lines) {
    const key = itemKey(line);
    let it = N.items.find((x) => x.key === key);
    if (!it) {
      it = { key, model: line.model ?? null, part: line.part ?? null, what: null, unit: null, reorderPoint: 0, distributor: po.distributor ?? null, notes: null, serialised: Boolean(line.model), serials: [], onHand: {}, reserved: [] };
      N.items.push(it);
    }
    const alloc = line.alloc ?? (po.job ? [{ job: po.job, qty: line.qty }] : []);
    const jobAt = (i) => { let n = i; for (const a of alloc) { if (n < a.qty) return a.job; n -= a.qty; } return null; };
    const at = po.deliver_to ?? 'warehouse';
    if (it.serialised) {
      const serials = line.serials?.length ? line.serials : Array.from({ length: line.qty }, (_, i) => demoSerial(po.id, key, i));
      serials.forEach((sn, i) => { const job = jobAt(i); it.serials.push({ serial: sn, at, job }); added.push({ key, serial: sn, job }); });
    } else {
      it.onHand[at] = (it.onHand[at] ?? 0) + line.qty;
      for (const a of alloc) {
        const r = it.reserved.find((x) => x.job === a.job);
        if (r) r.qty += a.qty; else it.reserved.push({ job: a.job, qty: a.qty });
        added.push({ key, qty: a.qty, job: a.job });
      }
      const spare = line.qty - sum(alloc.map((a) => a.qty));
      if (spare > 0) added.push({ key, qty: spare, job: null });
    }
  }
  return { state: N, added };
}

/** The stock page's answer: "2 shortfalls for next week's jobs", or what is low when nothing is short. */
export function stockAnswer(plan, S, week = WEEKS.next) {
  const short = shortfalls(plan, week);
  const low = ledger(S).filter((r) => r.low).length;
  const when = week.id === 'next' ? 'next week\'s jobs' : 'this week\'s jobs';
  if (short.length) return `${plural(short.length, 'shortfall')} for ${when} · ${low ? `${low} below the reorder point` : 'nothing else low'}`;
  return `Everything ${when} need is in stock · ${low ? `${low} below the reorder point` : 'nothing below the reorder point'}`;
}

// ---- Crew and certifications ------------------------------------------------------------------------------------------
export const CERTS = {
  cts: { label: 'CTS', by: 'AVIXA', what: 'Certified Technology Specialist', family: 'cts' },
  'cts-d': { label: 'CTS-D', by: 'AVIXA', what: 'Certified Technology Specialist, design', family: 'cts' },
  'cts-i': { label: 'CTS-I', by: 'AVIXA', what: 'Certified Technology Specialist, installation', family: 'cts' },
  'dante-2': { label: 'Dante Level 2', by: 'Audinate', what: 'Dante networks', family: 'dante' },
  'dante-3': { label: 'Dante Level 3', by: 'Audinate', what: 'Dante networks, advanced', family: 'dante' },
  wah: { label: 'Working at height', by: 'Training provider', what: 'Safe work above 2 m, ladders and podium steps', family: 'wah' },
  ipaf: { label: 'IPAF', by: 'IPAF', what: 'Operating mobile elevating work platforms', family: 'ipaf' },
  'site-card': { label: 'Site safety card', by: 'CSCS or OSHA', what: 'Construction site safety: CSCS in the UK, OSHA 30 in the US', family: 'site-card' },
  'first-aid': { label: 'First aid', by: 'Training provider', what: 'First aid at work', family: 'first-aid' },
};
/** Within this many days of expiry a certification is To review. */
export const RENEW_DAYS = 60;
/** A certification is valid up to and including its expiry date. */
export const validOn = (cert, day) => Boolean(cert) && cert.expires >= day;
/** A certification's state today: fine, To review within RENEW_DAYS, or Fault once expired. */
export function certState(cert, on = TODAY) {
  const left = daysBetween(on, cert.expires);
  const state = left < 0 ? 'fault' : left <= RENEW_DAYS ? 'review' : 'fine';
  const words = left < 0 ? `Expired ${dateWords(cert.expires)}` : left <= RENEW_DAYS ? `Expires ${dateWords(cert.expires)}, in ${plural(left, 'day')}` : `Valid to ${dateWords(cert.expires)}`;
  return { ...cert, label: CERTS[cert.kind]?.label ?? cert.kind, left, state, words };
}
/** The certification a person holds of a kind (the family, for "one of the CTS family"), latest expiry first. */
export function holds(person, kinds) {
  const ks = [].concat(kinds);
  return (person.certs ?? []).filter((c) => ks.includes(c.kind)).sort((a, b) => b.expires.localeCompare(a.expires))[0] ?? null;
}

/** Check the people on a visit against what its work needs. `needs`: [{ kinds, each, why, label }] (each: every person
    needs it; otherwise one person on site is enough). A certification must be valid on the visit's last day.
    Returns the problems: [{ person?, kinds, label, words, why }]. */
export function crewCheck(visit, people, needs) {
  const last = visit.days[visit.days.length - 1];
  const crew = visit.people.map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const problems = [];
  for (const n of needs) {
    const label = n.label ?? CERTS[[].concat(n.kinds)[0]]?.label ?? String(n.kinds);
    if (n.each) {
      for (const p of crew) {
        const c = holds(p, n.kinds);
        if (validOn(c, last)) continue;
        problems.push({ person: p.id, name: p.name, kinds: n.kinds, label, why: n.why,
          words: c ? `${label} for ${firstName(p.name)} expired ${shortDate(c.expires)}` : `${firstName(p.name)} has no ${label.toLowerCase()} on record` });
      }
    } else if (!crew.some((p) => validOn(holds(p, n.kinds), last))) {
      problems.push({ kinds: n.kinds, label, why: n.why, words: `Nobody on the visit holds ${label} in date` });
    }
  }
  return problems;
}

/** Who is where each day of a week: a booked visit first, else a rota day (a resident team, a project's crew), else in
    the workshop. Returns { days, rows: [{ person, cells }], onSite, sites }. */
export function weekGrid(people, visits, rota, week) {
  const days = weekDays(week);
  const rows = people.map((p) => ({
    person: p,
    cells: days.map((d) => {
      const v = visits.find((x) => x.people.includes(p.id) && x.days.includes(d));
      if (v) return { day: d, kind: 'visit', client: v.client, site: v.site, what: v.where, visit: v.id };
      const r = (rota ?? []).find((x) => x.people.includes(p.id) && d >= x.from && d <= x.to && (!x.weekdays || weekday(d)));
      if (r) return { day: d, kind: 'rota', client: r.client, site: r.site, what: r.what };
      return { day: d, kind: 'base', what: 'Workshop' };
    }),
  }));
  const onSite = rows.filter((r) => r.cells.some((c) => c.client)).length;
  const sites = new Set(rows.flatMap((r) => r.cells.filter((c) => c.client).map((c) => `${c.client}:${c.site}`))).size;
  return { days, rows, onSite, sites };
}

// ---- The RAMS: risk assessment and method statement, generated from the record ------------------------------------------
export const LIKELIHOOD = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
export const SEVERITY = ['Negligible', 'Minor', 'Moderate', 'Major', 'Severe'];
/** The 5 × 5 matrix's bands: 1 to 4 Low, 5 to 12 Medium, 15 and above High. */
export function riskBand(l, s) {
  const r = l * s;
  if (r >= 15) return { r, id: 'high', label: 'High', state: 'fault' };
  if (r >= 5) return { r, id: 'medium', label: 'Medium', state: 'review' };
  return { r, id: 'low', label: 'Low', state: 'fine' };
}
/** Above this a person is working at height. */
export const HEIGHT_M = 2;
/** Above this a ceiling is reached from a mobile platform, not podium steps. */
export const MEWP_M = 3.5;
const NETWORKED = new Set(['video-bar', 'camera', 'display', 'touch-controller', 'network-switch', 'signage-player', 'scheduler-panel', 'wireless-access-point', 'codec', 'printer']);

/** The kinds of work in a job, from its bill of materials and the space: what is mounted where, what is cabled, and
    what the job lists itself. Each says why. */
export function tasksOf(job, lines = [], facts = {}) {
  const T = new Map();
  const add = (id, why) => { if (!T.has(id)) T.set(id, []); if (why && !T.get(id).includes(why)) T.get(id).push(why); };
  for (const t of job.tasks ?? []) add(t, 'Listed on the job');
  for (const l of lines) {
    const name = l.name ?? l.model ?? l.part;
    const n = l.qty ?? 1;
    if (l.cls === 'display' || /^display-\d/.test(l.part ?? '')) add('mount-display', `${n} × ${name}`);
    if (l.cls === 'monitor') add('desk-kit', `${n} × ${name}`);
    if ((l.cls === 'camera' || l.cls === 'video-bar') && ['display-wall', 'wall', null, undefined].includes(l.location)) add('mount-small', `${n} × ${name}`);
    if (l.part === 'camera-bracket') add('mount-small', `${n} × ${name}`);
    if (l.cls === 'microphone' && (l.location === 'ceiling' || /ceiling/.test(l.model ?? ''))) add('ceiling-mics', `${n} × ${name}`);
    if (NETWORKED.has(l.cls) || l.part === 'cat6a-box') add('cabling', `${n} × ${name}`);
    if (l.cls === 'network-switch') add('rack', `${n} × ${name}`);
  }
  if (facts.comms && (T.has('cabling') || T.has('rack'))) add('rack', `Cables end in ${facts.comms.name}`);
  if (facts.electrical) add('electrical-by-others', facts.electrical.what);
  return [...T.entries()].map(([id, why]) => ({ id, why }));
}
export const TASK_WORDS = {
  survey: 'Survey the space', 'ceiling-mics': 'Fit ceiling microphones', cabling: 'Run and terminate cable', maintenance: 'Preventive maintenance',
  configure: 'Configure and test', audio: 'Fault-find the audio', 'mount-display': 'Mount displays on the wall', 'desk-kit': 'Set up desk monitors',
  'mount-small': 'Wall-mount a camera or video bar', rack: 'Work in the comms room', 'electrical-by-others': 'Electrical work by others',
};

/** The RAMS for one job. Inputs:
      job     { id, title, client, site, days, tasks }
      facts   what the record knows of the site (src/lib/provider-ops-load.mjs factsOf): ceiling_m, tray_m and their
              sources, riser, comms, occupied, fitOut, hospital, electrical, emergency, access, clientName, siteName
      lines   the job's bill of materials, resolved (cls, location, weightKg, name)
      people  the crew on the visit (with certs)
      review  { status, generated, reviewed_by, reviewedByName, reviewed, notes }
    Returns the document: tasks, hazards (each with who might be harmed, controls, the risk before and after on the 5 × 5
    matrix, and its sources), the matrix, method steps, PPE, emergency arrangements, the competence check, sign-offs and
    the disclaimer. */
export function generateRams({ job, facts = {}, lines = [], people = [], visit = null, review = null, today = TODAY }) {
  const tasks = tasksOf(job, lines, facts);
  const has = (id) => tasks.some((t) => t.id === id);
  const H = [];
  const hz = (h) => H.push({ ...h, id: `H${H.length + 1}`, before: { ...h.before, ...riskBand(h.before.l, h.before.s) }, after: { ...h.after, ...riskBand(h.after.l, h.after.s) } });
  const needs = [];
  const need = (n) => { if (!needs.some((x) => String(x.kinds) === String(n.kinds) && x.each === n.each)) needs.push(n); };
  const crewSize = visit ? visit.people.length : people.length;
  const others = facts.hospital ? 'Patients, staff and visitors' : facts.occupied ? 'Staff and visitors' : 'Other trades on site';

  // Working at height: ceiling work at the ceiling's height, cabling at the tray's (or through the ceiling void).
  const heights = [];
  if (has('ceiling-mics') && facts.ceiling_m) heights.push({ h: facts.ceiling_m, why: `ceiling microphones at ${facts.ceiling_m} m`, source: facts.ceilingSource });
  if (has('cabling') && facts.tray_m) heights.push({ h: facts.tray_m, why: `cable tray at ${facts.tray_m} m`, source: facts.traySource });
  else if (has('cabling') && facts.ceiling_m) heights.push({ h: facts.ceiling_m, why: `cable through the ceiling at ${facts.ceiling_m} m`, source: facts.ceilingSource });
  const top = heights.slice().sort((a, b) => b.h - a.h)[0];
  if (top && top.h > HEIGHT_M) {
    const mewp = top.h > MEWP_M;
    hz({
      title: 'Working at height', task: has('ceiling-mics') ? 'ceiling-mics' : 'cabling',
      what: `Work above ${HEIGHT_M} m: ${listWords(heights.map((x) => x.why))}.`,
      harmed: ['The crew', `${others} below (dropped tools)`],
      controls: [
        mewp ? `A mobile elevating work platform (MEWP): above ${MEWP_M} m podium steps do not reach` : 'Podium steps with guard rails; a leaning ladder only for short access',
        'Only people with in-date working at height training work above 2 m',
        'The area below kept clear with barriers and a sign',
        'Tools on lanyards; nothing loose on the platform',
      ],
      before: { l: 3, s: 5 }, after: { l: 1, s: 5 },
      sources: heights.map((x) => x.source).filter(Boolean),
    });
    need({ kinds: ['wah'], each: true, why: `Work above ${HEIGHT_M} m`, label: 'Working at height' });
    if (mewp) {
      hz({
        title: 'Operating a mobile platform', task: 'ceiling-mics',
        what: `The ceiling is ${top.h} m high: the platform could tip, trap or strike someone.${facts.access ? ` ${facts.access}.` : ''}`,
        harmed: ['The crew', others],
        controls: ['An IPAF-trained operator, with a second person on the ground throughout', 'Outriggers set on the flat floor only, checked before each lift', 'The platform area fenced off while it moves'],
        before: { l: 2, s: 5 }, after: { l: 1, s: 5 },
        sources: [facts.ceilingSource, facts.accessSource].filter(Boolean),
      });
      need({ kinds: ['ipaf'], each: false, why: `A mobile platform for the ${top.h} m ceiling`, label: 'IPAF' });
    }
  }

  // Manual handling: heavy displays, and many boxes of monitors.
  const heavy = lines.filter((l) => l.cls === 'display' || /^display-\d/.test(l.part ?? ''));
  const monitors = lines.filter((l) => l.cls === 'monitor');
  if (heavy.length || sum(monitors.map((l) => l.qty ?? 1)) >= 4) {
    const src = [
      ...heavy.map((l) => (l.weightKg ? `${l.name}: ${l.weightKg} kg (device library)` : `${l.name}: no weight in the device library, so treated as a two-person lift`)),
      ...monitors.map((l) => `${l.name}: ${l.weightKg ? `${l.weightKg} kg each, ` : ''}${l.qty ?? 1} of them (device library)`),
    ];
    const twoPerson = heavy.some((l) => !l.weightKg || l.weightKg >= 20);
    hz({
      title: 'Lifting and carrying', task: heavy.length ? 'mount-display' : 'desk-kit',
      what: `${heavy.length ? 'Displays lifted onto wall mounts' : ''}${heavy.length && monitors.length ? '; ' : ''}${monitors.length ? `${sum(monitors.map((l) => l.qty ?? 1))} monitors carried in their boxes` : ''}.`,
      harmed: ['The crew'],
      controls: [twoPerson ? 'Two people for every display lift' : 'Lift within your limit; ask for a second person', 'A trolley from the lift to the space; boxes opened where the kit is fitted', 'Clear route agreed before moving kit'],
      before: { l: 3, s: 3 }, after: { l: 2, s: 2 },
      sources: src,
    });
  }

  // Drilling: hidden services behind walls and ceilings.
  if (has('mount-display') || has('mount-small') || has('ceiling-mics')) {
    hz({
      title: 'Hidden cables and pipes when drilling', task: has('mount-display') ? 'mount-display' : has('mount-small') ? 'mount-small' : 'ceiling-mics',
      what: 'Fixings for mounts and brackets go into walls or ceilings that may hide power cables or pipes.',
      harmed: ['The crew', others],
      controls: ['A cable and pipe detector over every fixing point before drilling', 'Fixings only where the client\'s drawings or the site contact confirm it is clear', 'Stop and report anything unexpected'],
      before: { l: 2, s: 4 }, after: { l: 1, s: 4 },
      sources: [tasks.filter((t) => ['mount-display', 'mount-small', 'ceiling-mics'].includes(t.id)).map((t) => `Tasks: ${TASK_WORDS[t.id].toLowerCase()} (${t.why.join(', ')})`).join('; ')],
    });
  }

  // Electrical work by others: the crew never touches fixed wiring.
  if (facts.electrical) {
    hz({
      title: 'Electrical work by others', task: 'electrical-by-others',
      what: `${facts.electrical.what}. Northlight fits plug-in and low-voltage kit only.`,
      harmed: ['The crew'],
      controls: ['No work on fixed wiring: only the client\'s electrician opens a socket or a board', 'Every outlet checked with a socket tester before kit is plugged in', 'Faults reported to the site contact, never fixed by the crew'],
      before: { l: 2, s: 5 }, after: { l: 1, s: 5 },
      sources: [facts.electrical.source],
    });
  }

  // The comms room and the riser.
  if (has('rack') && facts.comms) {
    hz({
      title: 'Work beside live equipment in the comms room', task: 'rack',
      what: `${facts.comms.name}: patching beside switches that carry the building's network.`,
      harmed: ['The crew', 'Everyone on the client\'s network (an outage)'],
      controls: ['Access approved by the client; the rack left as found', 'Only the ports on the job touched; live patching never moved', 'No food or drink in the room'],
      before: { l: 2, s: 3 }, after: { l: 1, s: 3 },
      sources: [facts.comms.source],
    });
    if (facts.riser) {
      hz({
        title: 'Fire stopping in the riser', task: 'rack',
        what: `${facts.riser.name} opens into the comms room; ${facts.riser.notes ? facts.riser.notes.replace(/\.$/, '').toLowerCase() : 'it is fire-stopped at each floor'}. A cable through it could break the fire stopping.`,
        harmed: [facts.occupied ? 'Everyone in the building' : 'Everyone on site'],
        controls: ['No new cable through the riser without the client\'s permit', 'Any fire stopping disturbed is made good the same day and photographed', 'The photo goes on the as-built'],
        before: { l: 2, s: 5 }, after: { l: 1, s: 5 },
        sources: [facts.riser.source],
      });
    }
  }

  // The people around the work: an occupied space, a hospital, or a live fit-out.
  if (facts.occupied) {
    hz({
      title: facts.hospital ? 'Working near patients' : 'Working in an occupied space', task: 'site',
      what: `${facts.setting ?? 'The space is in use'}: ${others.toLowerCase()} pass close to the work.`,
      harmed: [others],
      controls: ['Barriers and signs round the work area', 'Noisy work and drilling booked with the site contact, out of hours where possible', 'Corridors and doors kept clear; cables never left across a walkway'],
      before: { l: 3, s: 3 }, after: { l: 1, s: 3 },
      sources: [facts.occupiedSource].filter(Boolean),
    });
    if (facts.hospital && (has('ceiling-mics') || has('cabling'))) {
      hz({
        title: 'Dust from the ceiling void', task: 'ceiling-mics',
        what: 'Opening ceiling tiles near clinical areas can release dust and spores.',
        harmed: ['Patients', 'Staff'],
        controls: ['The client\'s above-ceiling permit with infection control, before any tile is lifted', 'Dust sheets and a HEPA vacuum; tiles back the same day', 'Work in the order infection control sets'],
        before: { l: 3, s: 4 }, after: { l: 1, s: 4 },
        sources: [facts.occupiedSource, facts.ceilingNote].filter(Boolean),
      });
    }
  }
  if (facts.fitOut) {
    hz({
      title: 'Other trades on an active fit-out', task: 'site',
      what: 'The office is still a construction site: other trades, open floors and moving materials.',
      harmed: ['The crew', 'Other trades'],
      controls: ['Site induction before work; the site manager\'s rules and permits followed', 'Hard hat, high-visibility vest and safety boots on the floor', 'A site safety card for everyone on the crew'],
      before: { l: 3, s: 4 }, after: { l: 2, s: 3 },
      sources: [facts.fitOutSource],
    });
    need({ kinds: ['site-card'], each: true, why: 'An active fit-out site', label: 'Site safety card' });
  }

  // Cabling: trips and sharp edges.
  if (has('cabling')) {
    hz({
      title: 'Trips over cable, cuts from tray edges', task: 'cabling',
      what: 'Cable pulled across floors and through tray and ceiling grid with sharp edges.',
      harmed: ['The crew', others],
      controls: ['Cable pulled in one run and dressed away at once', 'Gloves when handling tray and ceiling grid', 'Offcuts and packaging cleared as the work goes'],
      before: { l: 3, s: 2 }, after: { l: 1, s: 2 },
      sources: [tasks.filter((t) => t.id === 'cabling').map((t) => `Task: ${TASK_WORDS.cabling.toLowerCase()} (${t.why.join(', ')})`)[0]],
    });
  }
  if (has('audio')) {
    hz({
      title: 'Loud sound while testing audio', task: 'audio',
      what: 'Fault-finding a mixer can produce sudden loud feedback or hum.',
      harmed: ['The crew', others],
      controls: ['Outputs muted before connecting; levels brought up slowly', 'Headphones kept off while the level is unknown', 'The studio booked empty while testing'],
      before: { l: 2, s: 3 }, after: { l: 1, s: 2 },
      sources: ['Task: fault-find the audio (listed on the job)'],
    });
  }

  // Lone working: one person on the visit.
  if (crewSize === 1) {
    hz({
      title: 'Working alone', task: 'site',
      what: 'One person on the visit: no one to raise the alarm after a fall or a shock.',
      harmed: ['The crew member'],
      controls: ['Check-in calls with Northlight at arrival, midday and departure', 'The client\'s site contact knows where the work is', 'No work at height alone'],
      before: { l: 2, s: 4 }, after: { l: 1, s: 4 },
      sources: [`${visit ? 'The visit' : 'The job'} books one person`],
    });
  }

  // Commissioning needs a CTS holder; and a first aider helps.
  if (has('configure') || has('cabling') || has('ceiling-mics')) need({ kinds: ['cts', 'cts-d', 'cts-i'], each: false, why: 'Configure and test to the setup guides', label: 'CTS' });

  // The matrix: how many hazards sit in each cell, before and after the controls.
  const matrix = { before: grid(H, 'before'), after: grid(H, 'after') };
  const worst = H.slice().sort((a, b) => b.after.r - a.after.r)[0] ?? null;

  // Method steps, in the order the work runs.
  const steps = [];
  const step = (t, detail, hazards = []) => steps.push({ n: steps.length + 1, t, detail, hazards });
  const refs = (...titles) => H.filter((h) => titles.includes(h.title)).map((h) => h.id);
  step('Before the visit', 'This RAMS approved and briefed to the crew; badges, induction and access confirmed; kit reserved and loaded.');
  step('Arrive and sign in', `Sign in with ${facts.clientName ?? 'the client'}'s site contact${facts.fitOut ? ' and the site manager' : ''}; agree the work area and any times to avoid.`, refs('Other trades on an active fit-out', 'Working in an occupied space', 'Working near patients'));
  step('Set up the work area', facts.occupied ? 'Barriers and signs round the area; floor protection where kit is moved.' : 'Mark the work area; check the route in for other trades\' materials.', refs('Working in an occupied space', 'Working near patients', 'Other trades on an active fit-out'));
  if (heavy.length || monitors.length) step('Bring the kit in', 'Trolley from the lift; two people for every display; boxes opened where the kit is fitted.', refs('Lifting and carrying'));
  if (has('cabling')) step('Run the cable', `${top && top.h > HEIGHT_M ? `From ${top.h > MEWP_M ? 'the platform' : 'podium steps'} at ${top.h} m` : 'At low level'}; dressed away as it goes${facts.hospital ? '; ceiling tiles back the same day' : ''}.`, refs('Working at height', 'Trips over cable, cuts from tray edges', 'Dust from the ceiling void'));
  if (has('mount-display') || has('mount-small')) step('Mount the kit', 'Detector over each fixing point, then the mount; the display lifted on by two people and locked.', refs('Hidden cables and pipes when drilling', 'Lifting and carrying'));
  if (has('ceiling-mics')) step('Fit the ceiling microphones', `${top && top.h > MEWP_M ? 'From the platform, with a ground person' : 'From podium steps'}; tiles and grid handled with gloves.`, refs('Working at height', 'Operating a mobile platform', 'Dust from the ceiling void'));
  if (has('desk-kit')) step('Set up the desk monitors', 'Each monitor on its arm or stand, cabled to the dock, tested at the desk.', refs('Lifting and carrying'));
  if (has('rack')) step('Patch in the comms room', 'Only the job\'s ports; fire stopping checked and photographed before leaving.', refs('Work beside live equipment in the comms room', 'Fire stopping in the riser'));
  if (has('audio')) step('Find the hum', 'Outputs muted, then each source brought up in turn until the fault shows.', refs('Loud sound while testing audio'));
  if (has('configure') || has('cabling') || has('ceiling-mics')) step('Configure and test', 'Each unit set up from its setup guide; the room test run and recorded on the job.');
  if (has('survey')) step('Survey', 'Measure and photograph the space; nothing fixed or opened.');
  if (has('maintenance')) step('Maintenance round', 'Each room checked to the maintenance list; worn cables swapped from the van.');
  step('Clear up and hand back', 'Waste and packaging removed; the area handed back to the site contact; the as-built recorded on the job.');

  // PPE, from the hazards.
  const ppe = ['Safety boots'];
  if (facts.fitOut) ppe.push('Hard hat', 'High-visibility vest');
  if (has('cabling') || heavy.length) ppe.push('Gloves');
  if (has('mount-display') || has('mount-small') || has('ceiling-mics')) ppe.push('Eye protection when drilling', 'Dust mask when drilling or in the ceiling void');
  if (top && top.h > MEWP_M) ppe.push('Harness and lanyard on the platform');

  // Competence: each need against the crew, on the visit's last day.
  const crewVisit = visit ?? { days: job.days, people: people.map((p) => p.id) };
  const problems = crewCheck(crewVisit, people, needs);
  const firstAider = people.find((p) => validOn(holds(p, 'first-aid'), crewVisit.days[crewVisit.days.length - 1]));
  const competence = needs.map((n) => ({ ...n, problems: problems.filter((p) => String(p.kinds) === String(n.kinds)) }));

  const emergency = [
    firstAider ? `First aider on the crew: ${firstAider.name}` : 'No first aider on the crew: use the site\'s first aiders, named at induction',
    facts.emergency ?? 'The site\'s fire alarm, assembly point and first aiders: confirmed at induction (not in the record)',
    'Emergency services: 911',
    `Report any incident to ${facts.clientName ?? 'the client'}'s site contact and to Northlight's safety lead the same day`,
  ];

  const status = review?.status === 'approved' ? 'approved' : 'draft';
  return {
    id: `RAMS-${job.id}`, job, title: job.title, where: facts.where ?? '', siteName: facts.siteName ?? job.site, clientName: facts.clientName ?? job.client,
    days: job.days, tasks, hazards: H, matrix, worst, steps, ppe, emergency, competence, problems, needs, status,
    generated: review?.generated ?? `${today}T09:00`, reviewedBy: review?.reviewed_by ?? null, reviewedByName: review?.reviewedByName ?? null, reviewed: review?.reviewed ?? null, notes: review?.notes ?? [],
    crew: people.map((p) => ({ id: p.id, name: p.name, role: p.role })),
    disclaimer: DISCLAIMER,
  };
}
export const DISCLAIMER = 'A demo template, not professional safety advice. A competent person must check every RAMS against the site, the work and the law where it happens before anyone relies on it.';
function grid(H, when) {
  const g = Array.from({ length: 5 }, () => Array(5).fill(0));
  for (const h of H) g[h[when].l - 1][h[when].s - 1] += 1;
  return g;
}
/** A RAMS in one line: "7 hazards · highest after controls: Medium · approved by Sam Okafor". */
export function ramsAnswer(doc) {
  const hi = doc.worst ? doc.worst.after.label : 'None';
  const who = doc.status === 'approved' ? `approved by ${doc.reviewedByName ?? 'a reviewer'}` : 'waiting for review';
  return `${plural(doc.hazards.length, 'hazard')} · highest after controls: ${hi} · ${who}`;
}

// ---- Visit readiness --------------------------------------------------------------------------------------------------
/** The checks for one visit, each passed or not, and the blockers in words. ctx:
      people   the crew records
      plan     planJobs() output (parts)
      rams     { [job id]: { status, reviewedByName } }
      needs    { [job id]: [{ kinds, each, why, label }] } from each job's RAMS
      orders   open orders (to say when parts arrive)
    Returns { visit, checks: [{ id, label, ok, words, blocker }], ready, blockers, day }. */
export function readiness(visit, { people = [], plan = { jobs: [] }, rams = {}, needs = {}, orders = [] } = {}) {
  const day = dayName(visit.days[0]);
  const risk = (what) => `${what}: ${day} at risk`;
  const A = visit.access;
  const crew = visit.people.map((id) => people.find((p) => p.id === id)).filter(Boolean);
  const nameOf = (id) => firstName(people.find((p) => p.id === id)?.name ?? id);
  const checks = [];
  const add = (c) => checks.push(c);

  const waiting = visit.people.filter((id) => A.badge?.[id] !== 'approved');
  add({ id: 'badge', label: 'Site badges', ok: !waiting.length, words: waiting.length ? `Waiting on ${listWords(waiting.map(nameOf))}'s badge` : 'Approved for everyone', blocker: risk('Badge not approved') });
  add({ id: 'escort', label: 'Escort', ok: A.escort !== 'requested', words: A.escort === 'not-needed' ? 'Not needed' : A.escort === 'approved' ? (A.escort_note ?? 'Booked') : 'Asked for, not confirmed', blocker: risk('Escort not confirmed') });
  const notInducted = visit.people.filter((id) => !(A.induction ?? []).includes(id));
  add({ id: 'induction', label: 'Site induction', ok: !notInducted.length, words: notInducted.length ? `${listWords(notInducted.map(nameOf))} not inducted yet` : 'Done by everyone', blocker: risk(`Induction not done for ${listWords(notInducted.map(nameOf))}`) });
  add({ id: 'comms', label: 'Comms room access', ok: A.comms_room !== 'requested', words: A.comms_room === 'not-needed' ? 'Not needed' : A.comms_room === 'approved' ? 'Approved' : 'Asked for, not confirmed', blocker: risk('Comms room access not approved') });
  add({ id: 'ceiling', label: 'Ceiling access', ok: A.ceiling !== 'requested', words: A.ceiling === 'not-needed' ? 'Not needed' : A.ceiling === 'approved' ? (A.ceiling_note ?? 'Approved') : 'Permit asked for, not issued', blocker: risk('Ceiling permit not issued') });

  const drafts = visit.jobs.filter((j) => rams[j]?.status !== 'approved');
  const by = [...new Set(visit.jobs.map((j) => rams[j]?.reviewedByName).filter(Boolean))];
  add({ id: 'rams', label: 'RAMS approved', ok: !drafts.length, words: drafts.length ? `Waiting for review: ${drafts.join(', ')}` : `Approved by ${listWords(by)}`, blocker: risk('RAMS not approved') });

  const problems = crewCheck(visit, crew, visit.jobs.flatMap((j) => needs[j] ?? []).filter((n, i, all) => all.findIndex((x) => String(x.kinds) === String(n.kinds) && x.each === n.each) === i));
  add({ id: 'certs', label: 'Certifications', ok: !problems.length, words: problems.length ? problems.map((p) => p.words).join('; ') : 'In date for the work', blocker: problems.length ? risk(problems[0].words) : '' });

  const mine = plan.jobs.filter((p) => visit.jobs.includes(p.job.id));
  const short = sum(mine.flatMap((p) => p.lines.map((l) => l.short)));
  const onOrder = sum(mine.flatMap((p) => p.lines.map((l) => l.onOrder)));
  const due = orders.filter((o) => o.status === 'sent' && visit.jobs.includes(o.job)).map((o) => o.expected).sort()[0];
  const lines = mine.flatMap((p) => p.lines);
  add({
    id: 'parts', label: 'Parts', ok: !short && !onOrder,
    words: !lines.length ? 'None needed' : short ? `${plural(short, 'unit')} short` : onOrder ? `${plural(onOrder, 'unit')} on order${due ? `, due ${dayWords(due)}` : ''}` : 'All reserved',
    blocker: short ? risk(`${plural(short, 'part')} short`) : risk('Parts not received'),
  });
  const blockers = checks.filter((c) => !c.ok).map((c) => c.blocker);
  return { visit, day, checks, ready: !blockers.length, blockers };
}

/** The visits page's answer: "3 visits at risk, of 6 · first on Wednesday: parts not received" (the shape; see the test). */
export function visitsAnswer(list) {
  const risky = list.filter((r) => !r.ready);
  if (!risky.length) return `All ${plural(list.length, 'visit')} ready`;
  const first = risky.slice().sort((a, b) => a.visit.days[0].localeCompare(b.visit.days[0]))[0];
  const what = first.blockers[0].split(':')[0];
  return `${risky.length} of ${plural(list.length, 'visit')} at risk · first on ${first.day}: ${what.charAt(0).toLowerCase()}${what.slice(1)}`;
}

// ---- The handover pack ----------------------------------------------------------------------------------------------
/** Warranty end for a unit: the provider's term for its manufacturer, from the handover date. */
export function warrantyEnd(handedOver, manufacturer, terms = []) {
  const t = terms.find((x) => x.manufacturer.toLowerCase() === String(manufacturer ?? '').toLowerCase());
  if (!t) return null;
  const d = utc(handedOver);
  d.setUTCMonth(d.getUTCMonth() + t.months);
  return { ends: iso(new Date(d.getTime() - 864e5)), months: t.months };
}

/** Put a finished job's handover pack together. Inputs, all from the record:
      pack      the provider's own part (handed_over, sent, accepted, training, notes)
      job       the job
      units     [{ space, spaceName, position, name, cls, clsName, model, modelName, manufacturer, serial, tag, host }]
      ports     { [tag]: { switch, port, vlan, vlanName, address, mac } }
      rooms     Deploy's room tests: [{ id, name, tests: [{ id, t }], results: { [test id]: { r, note } }, signed, signedName }]
      docs      { [model]: { guide: { name, href } | null, sources: [{ title, url }] } }
      terms     warranty terms by manufacturer
      snags     open snags on the job's spaces [{ id, title, space, clock }]
    Returns the pack with its answer, as-built rows, tests, O&M, training, warranty rows, delivery trail and gaps. */
export function handoverPack({ pack, job, units = [], ports = {}, rooms = [], docs = {}, terms = [], snags = [], names = {} }) {
  const asBuilt = units.map((u) => {
    const p = u.tag ? ports[u.tag] : null;
    const w = warrantyEnd(pack.handed_over, u.manufacturer, terms);
    return { ...u, port: p ? `${p.switch} port ${p.port}` : null, vlan: p?.vlan ?? null, vlanName: p?.vlanName ?? null, address: p?.address ?? null, mac: p?.mac ?? null, warranty: w };
  });
  const tests = rooms.map((r) => {
    const rows = r.tests.map((t) => ({ ...t, r: r.results?.[t.id]?.r ?? 'not-run', note: r.results?.[t.id]?.note ?? null }));
    return { ...r, rows, passed: rows.filter((x) => x.r === 'pass').length, failed: rows.filter((x) => x.r === 'fail').length };
  });
  const models = [...new Set(units.map((u) => u.model).filter(Boolean))];
  const om = models.map((m) => ({ model: m, modelName: units.find((u) => u.model === m)?.modelName ?? m, guide: docs[m]?.guide ?? null, sources: docs[m]?.sources ?? [] }));
  const gaps = [];
  const noModel = units.filter((u) => !u.model);
  if (noModel.length) gaps.push(`${plural(noModel.length, 'unit')} with no model in the client's record: ${noModel.map((u) => `${u.spaceName}, ${u.clsName.replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase())}`).join('; ')}`);
  const noWarranty = asBuilt.filter((u) => !u.warranty);
  if (noWarranty.length) gaps.push(`${plural(noWarranty.length, 'unit')} with no warranty term on record`);
  for (const r of tests.filter((x) => x.failed)) gaps.push(`${r.name}: ${plural(r.failed, 'room test')} not passed yet`);
  const passed = sum(tests.map((t) => t.passed)), total = sum(tests.map((t) => t.rows.length));
  const delivery = [
    { at: `${pack.handed_over}T12:00`, what: 'Pack put together from the record: as-built, room tests, setup guides, warranty', by: 'Keia' },
    pack.sent ? { at: pack.sent, what: `Sent over the engagement to ${names.client ?? job.client}`, by: names.provider ?? 'Northlight AV' } : null,
    pack.sent ? { at: pack.sent, what: `Landed in ${names.client ?? job.client}'s record as a reviewed change`, by: names.client ?? job.client } : null,
    pack.accepted ? { at: pack.accepted.at, what: `Accepted by ${names.accepted ?? pack.accepted.by}: the units and serials are in ${names.client ?? job.client}'s record`, by: names.client ?? job.client } : null,
  ].filter(Boolean);
  const state = pack.accepted ? 'accepted' : pack.sent ? 'sent' : 'ready';
  const answer = `${plural(asBuilt.length, 'unit')} · ${passed} of ${plural(total, 'room test')} passed · ${state === 'accepted' ? `accepted by ${names.accepted ?? 'the client'}` : state === 'sent' ? 'with the client for review' : 'ready to send'}`;
  return { id: pack.id, job, pack, asBuilt, tests, om, training: pack.training ?? [], notes: pack.notes ?? [], snags, gaps, delivery, state, answer, passed, total };
}

// ---- The whole view: the record, plus what a person did in this browser -------------------------------------------------
/** What a person did on the pages, kept in this browser (src/lib/provider-ops-client.mjs): orders sent and received, jobs
    reserved, RAMS approved. Any shape in, a clean one out. */
export function readLocal(x) {
  const L = x && typeof x === 'object' ? x : {};
  const ids = (a) => (Array.isArray(a) ? a.filter((s) => typeof s === 'string') : []);
  const approved = {};
  if (L.approved && typeof L.approved === 'object') for (const [k, v] of Object.entries(L.approved)) if (v && typeof v.by === 'string' && typeof v.at === 'string') approved[k] = { by: v.by, at: v.at };
  return { sent: ids(L.sent), received: ids(L.received), reserved: ids(L.reserved), approved };
}

/** Everything the operations pages show, from the record (opsBase in src/lib/provider-ops-load.mjs) and what a person
    did in this browser. The draft orders are worked out from the record alone, so their numbers stay put once one is
    sent. Then: orders received go into stock (reserved for their jobs); jobs reserved take their stock; the plan,
    the shortfalls, each job's RAMS, each visit's readiness and the weeks follow. */
export function opsView(base, local = {}, { today = TODAY } = {}) {
  const Lc = readLocal(local);
  const people = base.people ?? [];
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? id;
  const S0 = stockState(base.stock);
  const plan0 = planJobs(S0, base.jobs, { orders: base.orders });
  const drafts0 = draftOrders(plan0, S0, base.distributors, { today, orders: base.orders });
  // Orders: the record's, then the drafts (sent ones become open orders, received ones are in stock).
  const orders = [
    ...base.orders.map((o) => ({ ...o, status: o.status === 'received' || Lc.received.includes(o.id) ? 'received' : o.status, received: o.received ?? (Lc.received.includes(o.id) ? today : undefined), draft: false })),
    ...drafts0.map((d) => ({ ...d, status: Lc.received.includes(d.id) ? 'received' : Lc.sent.includes(d.id) ? 'sent' : 'draft', received: Lc.received.includes(d.id) ? today : undefined, draft: true })),
  ];
  let S = S0;
  const arrived = [];
  for (const o of orders) if (o.status === 'received' && Lc.received.includes(o.id)) { const r = receiveOrder(S, o); S = r.state; arrived.push({ order: o.id, added: r.added }); }
  for (const id of Lc.reserved) {
    const p = planJobs(S, base.jobs, { orders: orders.filter((o) => o.status === 'sent') }).jobs.find((x) => x.job.id === id);
    if (p) S = reserveJob(S, p);
  }
  const open = orders.filter((o) => o.status === 'sent');
  const plan = planJobs(S, base.jobs, { orders: open });
  const short = shortfalls(plan, WEEKS.next);
  const rows = ledger(S);
  // RAMS for every live job, with its review (and an approval made here).
  const reviews = Object.fromEntries((base.reviews ?? []).map((r) => [r.job, r]));
  for (const [job, a] of Object.entries(Lc.approved)) reviews[job] = { ...(reviews[job] ?? { job, generated: `${today}T09:00` }), status: 'approved', reviewed_by: a.by, reviewedByName: nameOf(a.by), reviewed: a.at, here: true };
  const rams = {};
  for (const job of base.jobs.filter((j) => j.status !== 'done')) {
    const visit = (base.visits ?? []).find((v) => v.jobs.includes(job.id)) ?? null;
    const crew = (visit?.people ?? []).map((id) => people.find((p) => p.id === id)).filter(Boolean);
    rams[job.id] = generateRams({ job, facts: job.facts, lines: mergeLines(job.bomLines), people: crew, visit, review: reviews[job.id] ?? null, today });
  }
  const status = Object.fromEntries(Object.values(rams).map((d) => [d.job.id, { status: d.status, reviewedByName: d.reviewedByName }]));
  const needs = Object.fromEntries(Object.values(rams).map((d) => [d.job.id, d.needs]));
  const visits = (base.visits ?? []).map((v) => readiness(v, { people, plan, rams: status, needs, orders: open }));
  const weeks = Object.fromEntries(Object.values(WEEKS).map((w) => [w.id, weekGrid(people, base.visits ?? [], base.rota ?? [], w)]));
  const jobsById = Object.fromEntries(base.jobs.map((j) => [j.id, j]));
  return {
    today, local: Lc, S, rows, plan, short, orders, drafts: orders.filter((o) => o.draft && o.status === 'draft'), open, arrived,
    received: orders.filter((o) => o.status === 'received'), distributors: base.distributors ?? [], rams, visits, weeks, jobsById, people, names: base.names ?? {},
    answer: stockAnswer(plan, S), visitsAnswer: visitsAnswer(visits),
  };
}
