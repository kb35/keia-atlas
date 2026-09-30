// Vendors and partners (design notes, CONNECT-SCAN §7.3, BLUEPRINT 6.3; BUILD-PLAN V7).
//
// A partner (vendor, integrator, manufacturer) works inside Aigna's Atlas on the jobs handed to them, and on nothing
// else. The rules this file keeps:
//   1. One shared record. The job is Aigna's; the partner's own tool mirrors it and shows both states
//      ("Waiting on parts · Keystone: Awaiting RMA").
//   2. Access is tied to a job: the space, the unit, its build sheet and the job's timeline, from the hand-off until
//      the job closes. No standing access. Everything a partner opens is logged.
//   3. One contract clock, computed from the job's own times and the contract's service level, the same for Aigna and
//      the partner. Waiting on the client pauses it for both, with the same reason.
//   4. Performance against the contract is measured from the records, with no manual reporting.
//   5. Paperwork before data: a data processing agreement and a security assessment per partner, with their dates.
//
// The jobs, cases, grants and figures here are SIMULATED (made up, written at the demo's now, 28 Sept 12:00 on the anchor).
// The dates move with the rolling demo clock (demoShift). No data is loaded, so the rules can be tested (tests/vendors.test.mjs). Pages join this to data/vendors.
import { demoShift } from './demo-clock.mjs';

export const NOW = demoShift('2026-09-28T12:00');

// ---- Time, as the data writes it: "2026-09-28T12:00", read as written (no zone) -------------------------------------
const ms = (t) => Date.parse(`${t.length === 10 ? `${t}T00:00` : t}:00Z`);
const iso = (n) => new Date(n).toISOString().slice(0, 16);
const pad = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** n working days after a time, at the same time of day (Saturday and Sunday are skipped). */
export function addWorkingDays(t, n) {
  let d = ms(t);
  let left = n;
  while (left > 0) { d += 864e5; const w = new Date(d).getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return iso(d);
}
/** Minutes from a to b (negative when b is earlier). */
export const minutesBetween = (a, b) => Math.round((ms(b) - ms(a)) / 6e4);

/** A length of time in words: "3 h 40 min", "2 days 4 h", "25 min". */
export function spanWords(min) {
  const m = Math.abs(Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h < 24) return `${h} h${r ? ` ${r} min` : ''}`;
  const d = Math.floor(h / 24), hh = h % 24;
  return `${d} ${d === 1 ? 'day' : 'days'}${hh ? ` ${hh} h` : ''}`;
}
/** A due time in words, from the viewer's now: "16:00" today, "Tue 29 Sep, 17:00" later or earlier. */
export function whenWords(t, now = NOW) {
  const hm = t.slice(11, 16);
  if (t.slice(0, 10) === now.slice(0, 10)) return hm;
  const d = new Date(ms(t));
  return `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${hm}`;
}
/** A moment in words from the demo's now: "today, 09:40", or "Fri 25 Sep, 10:00". */
export const atWords = (t, now = NOW) => (t.slice(0, 10) === now.slice(0, 10) ? `today, ${t.slice(11, 16)}` : whenWords(t, now));
/** A date in words: "31 Oct 2026". */
export function dateWords(t) {
  const d = new Date(ms(t));
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** Whole days from a to b. */
export const daysBetween = (a, b) => Math.round((ms(b.slice(0, 10)) - ms(a.slice(0, 10))) / 864e5);

// ---- The contract clock (CONNECT 7.3 rule 6) ------------------------------------------------------------------------
/** When a job is due under its service level: `sla.hours` elapsed hours, or `sla.workdays` working days, from the
    hand-off. */
export function dueOf(job) {
  const s = job.sla ?? {};
  if (s.hours) return iso(ms(job.handedAt) + s.hours * 36e5);
  if (s.workdays) return addWorkingDays(job.handedAt, s.workdays);
  return null;
}

/** The one clock both sides see. While the job waits on the client the clock stands still at the moment it started
    waiting, and says why. Returns { due, left (minutes; negative is past), past, paused, closed, text, short }. */
export function contractClock(job, now = NOW) {
  const due = dueOf(job);
  if (!due) return { due: null, left: null, past: false, paused: false, closed: false, text: 'No contract clock on this job', short: '' };
  if (job.state === 'done') {
    const left = minutesBetween(job.closedAt, due);
    return { due, left, past: left < 0, paused: false, closed: true, text: left < 0 ? `Closed ${spanWords(left)} past the clock` : 'Closed within the clock', short: left < 0 ? 'past the clock' : 'within the clock' };
  }
  const paused = job.state === 'waiting' && job.waitFrom;
  const at = paused ? job.waitFrom : now;
  const left = minutesBetween(at, due);
  const what = job.sla.kind === 'response' ? 'Response due' : 'Due';
  if (paused) {
    return { due, left, past: left < 0, paused: true, closed: false,
      text: `Clock paused, waiting on ${job.wait} · ${left < 0 ? `${spanWords(left)} past` : `${spanWords(left)} left`}`,
      short: left < 0 ? `past by ${spanWords(left)}, paused` : `paused, ${spanWords(left)} left` };
  }
  if (left < 0) return { due, left, past: true, paused: false, closed: false, text: `Past the clock by ${spanWords(left)} · was due ${whenWords(due, now)}`, short: `past by ${spanWords(left)}` };
  return { due, left, past: false, paused: false, closed: false, text: `${what} ${whenWords(due, now)} · ${spanWords(left)} left`, short: `due ${whenWords(due, now)}` };
}

// ---- Job-scoped access (CONNECT 7.3 rule 3) ---------------------------------------------------------------------------
// What a partner may open for a job, and what stays with Aigna. The shape of every page stays the same: a slot a
// partner may not see is kept in place and says why (design notes, CONNECT 7.2 rule 3).
const SCOPE_WORDS = { space: 'this space', unit: 'this unit', buildsheet: 'its build sheet', timeline: 'the job\'s timeline', design: 'the space design', model: 'the model and its setup guide' };
export const NOT_SHARED = [
  { id: 'floor', what: 'Floor plan', why: 'Not shared with partners' },
  { id: 'other', what: 'Other spaces and offices', why: 'Only the space on this job' },
  { id: 'ip', what: 'IP address and switch port', why: 'Not shared with partners' },
  { id: 'people', what: 'Who booked the space', why: 'Not shared with partners' },
];
export const SCOPE_BY_KIND = {
  incident: ['space', 'unit', 'buildsheet', 'timeline'],
  snag: ['space', 'unit', 'buildsheet', 'timeline'],
  install: ['space', 'buildsheet', 'model', 'timeline'],
  survey: ['space', 'design', 'timeline'],
  design: ['design', 'timeline'],
};
/** The access a job gives: its scope in words, when it started, and when it ends ("when this job closes", or when it
    did). `open` is true until the job is done. */
export function accessOf(job) {
  const scope = SCOPE_BY_KIND[job.kind] ?? ['timeline'];
  const open = job.state !== 'done';
  return {
    scope, words: scope.map((s) => SCOPE_WORDS[s]), open, from: job.handedAt,
    ends: open ? 'Access ends when this job closes' : `Access ended when the job closed, ${whenWords(job.closedAt, job.closedAt)} on ${dateWords(job.closedAt)}`,
    line: `Access: ${scope.map((s) => SCOPE_WORDS[s]).join(', ')} · ${open ? 'ends when the job closes' : 'ended'}`,
  };
}
/** The vendor access register: one row per grant, newest first. Every grant is tied to a job; `standing` counts grants
    that are not (there are none, by rule). */
export function accessRegister(jobs, now = NOW) {
  const rows = jobs.map((j) => {
    const a = accessOf(j);
    return { job: j.id, vendor: j.vendor, person: j.person, space: j.space, site: j.site, kind: j.kind, scope: a.words, from: j.handedAt, to: j.state === 'done' ? j.closedAt : null, open: a.open, opened: j.opened ?? 0, reason: j.title };
  }).sort((a, b) => b.from.localeCompare(a.from));
  return { rows, open: rows.filter((r) => r.open).length, ended: rows.filter((r) => !r.open).length, standing: 0, now };
}

// ---- The simulated jobs handed to partners -------------------------------------------------------------------------------
// id: Aigna's record (the master); native: the partner's own tool, mirrored (both states shown).
// kind: incident, snag, install, survey, design. sla: from the contract (data/vendors/<id>.yaml `sla`), kind response or
// fix. state: with, waiting (wait, waitOwner, waitFrom) or done (closedAt). opened: pages the partner opened (logged).
export const JOBS = [
  // Keystone Service: break-fix under the maintenance contract (Dev Patel).
  { id: 'INC0041214', vendor: 'keystone', person: 'dev', kind: 'incident', title: 'Video bar fan noise, swap under warranty', space: 'dub-3-09', site: 'dub', position: 'video-bar', priority: 2,
    why: 'Fan noise, swap under warranty', handedBy: 'liam', handedAt: demoShift('2026-09-28T08:05'), sla: { what: 'P2 (room degraded)', kind: 'fix', workdays: 1 }, state: 'with',
    native: { from: 'Keystone service desk', ref: 'KS-48812', status: 'Engineer assigned' }, opened: 4,
    history: [{ at: demoShift('2026-09-28T07:52'), text: 'Opened from the room: fan noise during calls' }, { at: demoShift('2026-09-28T08:05'), text: 'Liam handed it to Keystone Service (vendor): fan noise, swap under warranty' }, { at: demoShift('2026-09-28T08:40'), text: 'Keystone booked Dev Patel for tomorrow morning' }] },
  { id: 'INC0041215', vendor: 'keystone', person: 'dev', kind: 'incident', title: 'Room down: codec will not start', space: 'nyc-20-05', site: 'nyc', position: 'codec', priority: 1,
    why: 'Codec stuck at the start screen after a power cut, meeting at 14:00', handedBy: 'anna', handedAt: demoShift('2026-09-28T09:40'), sla: { what: 'P1 (room down, meeting today)', kind: 'response', hours: 4 }, state: 'with',
    native: { from: 'Keystone service desk', ref: 'KS-48820', status: 'On the way' }, opened: 2,
    history: [{ at: demoShift('2026-09-28T09:31'), text: 'Opened by the service desk: nothing starts in the room' }, { at: demoShift('2026-09-28T09:40'), text: 'Anna handed it to Keystone Service (vendor): codec stuck after a power cut, meeting at 14:00' }] },
  { id: 'INC0041199', vendor: 'keystone', person: 'dev', kind: 'incident', title: 'Camera not detected', space: 'cph-4-11', site: 'cph', position: 'video-bar', priority: 2,
    why: 'Camera missing after the firmware update, needs a swap', handedBy: 'anna', handedAt: demoShift('2026-09-25T08:00'), sla: { what: 'P2 (room degraded)', kind: 'fix', workdays: 1 }, state: 'waiting',
    wait: 'client site access', waitOwner: 'anna', waitFrom: demoShift('2026-09-28T10:10'), native: { from: 'Keystone service desk', ref: 'KS-48790', status: 'Awaiting access' }, opened: 6,
    history: [{ at: demoShift('2026-09-25T07:44'), text: 'Opened from the room: the camera is not found' }, { at: demoShift('2026-09-25T08:00'), text: 'Anna handed it to Keystone Service (vendor): camera missing after the firmware update' }, { at: demoShift('2026-09-28T10:10'), text: 'Keystone: waiting on site access to the fourth floor' }] },
  { id: 'INC0041171', vendor: 'keystone', person: 'dev', kind: 'incident', title: 'Touch panel cracked', space: 'dub-4-05', site: 'dub', position: 'touch-controller', priority: 3,
    why: 'Glass cracked, advance replacement', handedBy: 'liam', handedAt: demoShift('2026-09-21T11:00'), sla: { what: 'Advance replacement shipped', kind: 'fix', workdays: 1 }, state: 'done', closedAt: demoShift('2026-09-22T09:30'),
    native: { from: 'Keystone service desk', ref: 'KS-48744', status: 'Closed' }, opened: 5, history: [] },
  // Northlight AV: the Juneau office fit-out (PRJ-14) and a survey (Sam Okafor).
  { id: 'SNAG-14-02', vendor: 'northlight', person: 'sam', kind: 'snag', title: 'Camera framing too tight for the far seats', space: 'jnu-2-02', site: 'jnu', position: 'video-bar', project: 'PRJ-14',
    why: 'Snag from the space test: reframe the camera', handedBy: 'marcus', handedAt: demoShift('2026-09-16T15:00'), sla: { what: 'Snag fixed after handover', kind: 'fix', workdays: 10 }, state: 'with',
    native: { from: 'Northlight projects', ref: 'NL-2291', status: 'Scheduled' }, opened: 3, history: [{ at: demoShift('2026-09-16T15:00'), text: 'Marcus handed the snag to Northlight AV (vendor): reframe the camera' }] },
  { id: 'TASK-14-2-03', vendor: 'northlight', person: 'sam', kind: 'install', title: 'Record serials and MACs, 2.03', space: 'jnu-2-03', site: 'jnu', project: 'PRJ-14',
    why: 'Install and record each unit', handedBy: 'marcus', handedAt: demoShift('2026-09-21T09:00'), sla: { what: 'Install to the project plan', kind: 'fix', workdays: 8 }, state: 'waiting',
    wait: 'switch ports patched by the network team', waitOwner: 'marco', waitFrom: demoShift('2026-09-25T16:00'), native: { from: 'Northlight projects', ref: 'NL-2294', status: 'On hold' }, opened: 9, history: [] },
  { id: 'SURV-0412', vendor: 'northlight', person: 'sam', kind: 'survey', title: 'Site survey before the 12.09 refit', space: 'chi-12-09', site: 'chi',
    why: 'Survey for the refit design', handedBy: 'marcus', handedAt: demoShift('2026-09-18T10:00'), sla: { what: 'Site survey after request', kind: 'fix', workdays: 5 }, state: 'with',
    native: { from: 'Northlight projects', ref: 'NL-2280', status: 'Booked' }, opened: 1, history: [] },
  { id: 'SNAG-14-05', vendor: 'northlight', person: 'sam', kind: 'snag', title: 'Cable cover missing under the table', space: 'jnu-2-05', site: 'jnu', project: 'PRJ-14',
    why: 'Snag from the space test', handedBy: 'marcus', handedAt: demoShift('2026-09-08T10:00'), sla: { what: 'Snag fixed after handover', kind: 'fix', workdays: 10 }, state: 'done', closedAt: demoShift('2026-09-11T15:20'),
    native: { from: 'Northlight projects', ref: 'NL-2262', status: 'Closed' }, opened: 4, history: [] },
  // Brightwave Integration: the Dublin town hall (PRJ-15) (Lena Fischer).
  { id: 'DSGN-15-01', vendor: 'brightwave', person: 'lena', kind: 'design', title: 'Design review: the divisible town hall', space: 'dub-3-04', site: 'dub', project: 'PRJ-15',
    why: 'Return the design review with the microphone plan', handedBy: 'anna', handedAt: demoShift('2026-09-24T14:00'), sla: { what: 'Design review returned', kind: 'fix', workdays: 3 }, state: 'with',
    native: { from: 'Brightwave jobs', ref: 'BW-7713', status: 'In review' }, opened: 7, history: [] },
  { id: 'SURV-0415', vendor: 'brightwave', person: 'lena', kind: 'survey', title: 'Site survey before the 3.09 refit', space: 'dub-3-09', site: 'dub', project: 'PRJ-15',
    why: 'Measure the ceiling for the microphones', handedBy: 'anna', handedAt: demoShift('2026-09-23T09:00'), sla: { what: 'Site survey after request', kind: 'fix', workdays: 5 }, state: 'waiting',
    wait: 'floor access after 18:00', waitOwner: 'anna', waitFrom: demoShift('2026-09-25T11:00'), native: { from: 'Brightwave jobs', ref: 'BW-7709', status: 'Awaiting access' }, opened: 2, history: [] },
  { id: 'DSGN-15-00', vendor: 'brightwave', person: 'lena', kind: 'design', title: 'Concept design: the divisible town hall', space: 'dub-3-04', site: 'dub', project: 'PRJ-15',
    why: 'First design from the space type', handedBy: 'anna', handedAt: demoShift('2026-09-10T09:00'), sla: { what: 'Design review returned', kind: 'fix', workdays: 3 }, state: 'done', closedAt: demoShift('2026-09-14T16:00'),
    native: { from: 'Brightwave jobs', ref: 'BW-7680', status: 'Closed' }, opened: 11, history: [] },
];

/** Paperwork before data (CONNECT 7.3 rule 7, BLUEPRINT 6.3 row 6): the data processing agreement and the security
    assessment for each partner, with their dates. Made up. */
export const PAPERS = {
  keystone: { dpa: { signed: demoShift('2025-12-02'), ends: demoShift('2028-12-31') }, assessment: { done: demoShift('2025-12-10'), next: demoShift('2026-12-10') } },
  northlight: { dpa: { signed: demoShift('2025-03-14'), ends: demoShift('2027-03-31') }, assessment: { done: demoShift('2025-03-20'), next: demoShift('2026-03-20') } },
  brightwave: { dpa: { signed: demoShift('2024-10-15'), ends: demoShift('2026-10-31') }, assessment: { done: demoShift('2025-10-21'), next: demoShift('2026-10-21') } },
  'hp-poly': { dpa: { signed: demoShift('2023-03-20'), ends: demoShift('2027-03-31') }, assessment: { done: demoShift('2026-02-11'), next: demoShift('2027-02-11') } },
};
/** The paperwork in words, with To review when a date has passed or falls within 60 days. */
export function papersOf(id, now = NOW) {
  const p = PAPERS[id]; if (!p) return [];
  const row = (what, date, verb) => { const d = daysBetween(now, date); return { what, date, words: `${verb} ${dateWords(date)}`, state: d < 0 ? 'fault' : d <= 60 ? 'review' : 'fine', left: d }; };
  return [
    { what: 'Data processing agreement', date: p.dpa.signed, words: `Signed ${dateWords(p.dpa.signed)}, runs to ${dateWords(p.dpa.ends)}`, state: daysBetween(now, p.dpa.ends) < 0 ? 'fault' : daysBetween(now, p.dpa.ends) <= 60 ? 'review' : 'fine', left: daysBetween(now, p.dpa.ends) },
    row('Security assessment', p.assessment.next, 'Next due'),
  ];
}

// ---- One partner's Home (design notes) ------------------------------------------------------------------------------------
/** The jobs with one partner person, worst first (past the clock, then least time left), with each job's clock. */
export function jobsFor(person, jobs = JOBS, now = NOW) {
  return jobs.filter((j) => j.person === person && j.state !== 'done')
    .map((j) => ({ ...j, clock: contractClock(j, now), access: accessOf(j) }))
    .sort((a, b) => Number(b.clock.past) - Number(a.clock.past) || (a.clock.left ?? 9e9) - (b.clock.left ?? 9e9));
}
/** The band for a partner: the answer sentence and the four figures (With you, Waiting on the client, Past the clock,
    Spaces you can open today). */
export function partnerBand(person, jobs = JOBS, now = NOW) {
  const mine = jobsFor(person, jobs, now);
  const withYou = mine.filter((j) => j.state === 'with').length;
  const waiting = mine.filter((j) => j.state === 'waiting').length;
  const past = mine.filter((j) => j.clock.past).length;
  const spaces = new Set(mine.filter((j) => j.access.scope.includes('space')).map((j) => j.space)).size;
  const n = mine.length;
  return {
    jobs: mine, withYou, waiting, past, spaces,
    answer: `${n} ${n === 1 ? 'job' : 'jobs'} with you · ${past ? `${past} past the contract clock` : 'none past the contract clock'}`,
  };
}

// ---- Performance against the contract, measured from the records (BLUEPRINT 6.3 row 1) ------------------------------------
function seeded(key) {
  let h = 2166136261;
  for (const c of String(key)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Twelve months of jobs spread from the year's total, the share within the clock near the year's rate. Returns the
    measures a vendor record shows: within the clock, jobs, and (for service vendors) fixed on the first visit and
    replacements shipped. `record` is data/vendors' `record` ({ jobs, on_time }). */
export function performance(id, kind, record = {}) {
  const r = seeded(`perf:${id}`);
  const total = record.jobs ?? 0, rate = (record.on_time ?? 90) / 100;
  const w = Array.from({ length: 12 }, () => 0.5 + r());
  const sum = w.reduce((a, b) => a + b, 0);
  const jobs = w.map((x) => Math.round((x / sum) * total));
  jobs[11] += total - jobs.reduce((a, b) => a + b, 0);
  const onTime = jobs.map((n) => (n ? Math.min(100, Math.max(0, rate * 100 + (r() * 2 - 1) * 7)) : null));
  const within = total ? Math.round(rate * 100) : null;
  const out = [
    { id: 'within', label: 'Within the contract clock', value: within, words: within == null ? 'No jobs yet' : `${within}%`, series: onTime.filter((x) => x != null), unit: '%', state: within == null ? 'off' : within >= 90 ? 'fine' : within >= 80 ? 'review' : 'fault' },
    { id: 'jobs', label: 'Jobs in the last 12 months', value: total, words: String(total), series: jobs, unit: 'n', state: 'fine' },
  ];
  if (kind === 'service') {
    const ftf = Math.round(86 + r() * 8);
    out.push({ id: 'first', label: 'Fixed on the first visit', value: ftf, words: `${ftf}%`, series: jobs.map(() => Math.round(ftf + (r() * 2 - 1) * 6)), unit: '%', state: ftf >= 85 ? 'fine' : 'review' });
    const days = Math.round((0.7 + r() * 0.5) * 10) / 10;
    out.push({ id: 'rma', label: 'Replacement shipped in', value: days, words: `${days} working days`, series: jobs.map(() => Math.round((days + (r() * 2 - 1) * 0.4) * 10) / 10), unit: 'd', state: days <= 1 ? 'fine' : 'review' });
  } else if (kind === 'integration') {
    const snags = Math.round((0.3 + r() * 0.5) * 10) / 10;
    out.push({ id: 'snags', label: 'Snags per space handed over', value: snags, words: `${snags} per space`, series: jobs.map(() => Math.max(0, Math.round((snags + (r() * 2 - 1) * 0.3) * 10) / 10)), unit: 'x', state: snags <= 0.5 ? 'fine' : 'review' });
  } else {
    const days = Math.round(3 + r() * 4);
    out.push({ id: 'case', label: 'Support case answered in', value: days, words: `${days} working days, median`, series: jobs.map(() => Math.max(1, Math.round(days + (r() * 2 - 1) * 2))), unit: 'd', state: days <= 5 ? 'fine' : 'review' });
  }
  return out;
}

/** Days left on a contract, and its state: To review within 90 days, Fault once it has ended. */
export function contractLeft(contract, now = NOW) {
  const left = daysBetween(now, contract.end);
  return { left, state: left < 0 ? 'fault' : left <= 90 ? 'review' : 'fine', words: left < 0 ? `Ended ${dateWords(contract.end)}` : `Ends ${dateWords(contract.end)}, in ${left} ${left === 1 ? 'day' : 'days'}` };
}
