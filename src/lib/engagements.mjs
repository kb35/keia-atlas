// Organisations and engagements (docs/service-providers.md). The whole industry on one platform: each organisation
// runs its own Keia, and an engagement is the signed link between a client and a provider. It has a scope (sites,
// projects and the kinds of record that flow), a role, dates and the agreement. The rules this file keeps:
//   1. Federation, not one shared database. A provider sees a client's record only through an active engagement,
//      only inside its scope, and only work handed to that provider. Nothing crosses from one client to another.
//   2. Who owns what. The client owns its places and records; the provider owns its crews, notes and costs, which
//      never flow. Shared records (jobs, as-builts, handovers, visit readiness) carry both marks.
//   3. Revoking stops the flow at once. Each side keeps its copy of what was shared before.
//
// Aigna is the main demo company. Fenwater Health and Quillmark Publishing are two more clients of Northlight AV,
// made up for the demo, as lightweight data (sites, open jobs, service levels). Everything here is SIMULATED and fixed
// at the demo's now, 28 Sept 12:00. Pure: nothing is loaded, so the rules can be tested (tests/engagements.test.mjs).
import { JOBS, NOW, contractClock, daysBetween, dateWords, whenWords } from './vendors.mjs';

export { NOW };

// ---- Organisations: each runs its own Keia -----------------------------------------------------------------------
// mode: repo (YAML in Git) or database (the API and events). Northlight runs database mode because it serves many
// clients at once; Aigna's demo runs in repo mode.
export const ORGS = {
  aigna: { id: 'aigna', name: 'Aigna', kind: 'client', mode: 'repo', what: 'The demo company: offices in three regions' },
  fenwater: { id: 'fenwater', name: 'Fenwater Health', kind: 'client', mode: 'database', what: 'A made-up hospital group near Boston', fictional: true },
  quillmark: { id: 'quillmark', name: 'Quillmark Publishing', kind: 'client', mode: 'repo', what: 'A made-up publisher in Denver and Seattle', fictional: true },
  northlight: { id: 'northlight', name: 'Northlight AV', kind: 'provider', mode: 'database', what: 'AV integrator and managed service provider, Americas' },
  brightwave: { id: 'brightwave', name: 'Brightwave Integration', kind: 'provider', mode: 'repo', what: 'Integrator for EMEA and Asia Pacific' },
  keystone: { id: 'keystone', name: 'Keystone Service', kind: 'provider', mode: 'database', what: 'Maintenance for meeting room equipment' },
  'hp-poly': { id: 'hp-poly', name: 'HP Poly', kind: 'provider', mode: 'database', what: 'Manufacturer' },
};
export const orgName = (id) => ORGS[id]?.name ?? id;

// The roles an engagement can have, in words.
export const ROLE_WORDS = {
  integrator: 'Integrator for a project',
  managed: 'Managed service on site',
  maintenance: 'Maintenance vendor',
  manufacturer: 'Manufacturer',
};

// The kinds of record that can flow over an engagement, who owns each and what the other side gets. `flows` false:
// never shared, whatever the scope says.
export const RECORD_KINDS = {
  site: { words: 'Offices and spaces in scope', owner: 'client', flows: true, how: 'The client owns them; the provider reads them' },
  job: { words: 'Jobs handed to the provider', owner: 'both', flows: true, how: 'Both marks: the client owns the state and priority, the provider its own status and reference' },
  visit: { words: 'Visit readiness', owner: 'both', flows: true, how: 'Both marks: the provider books, the client confirms access' },
  'as-built': { words: 'As-builts', owner: 'both', flows: true, how: 'The provider sends; it lands in the client\'s record as a reviewed change' },
  handover: { words: 'Handovers', owner: 'both', flows: true, how: 'Both marks: the provider hands over, the client accepts' },
  design: { words: 'Design proposals', owner: 'provider', flows: true, how: 'The provider drafts in its own Keia and proposes it; the client decides' },
  'floor-plan': { words: 'Floor plans, IP addresses and switch ports', owner: 'client', flows: false, how: 'Restricted: never shared with a provider' },
  crew: { words: 'Crews and rotas', owner: 'provider', flows: false, how: 'The provider\'s own: never shared' },
  note: { words: 'Work notes', owner: 'provider', flows: false, how: 'The provider\'s own: never shared' },
  cost: { words: 'Internal costs and margin', owner: 'provider', flows: false, how: 'The provider\'s own: never shared' },
};

// ---- The fictional clients' records (lightweight: sites, jobs, service levels) --------------------------------------
// Jobs have the shape src/lib/vendors.mjs uses, so the same contract clock runs on them.
export const CLIENT_SITES = {
  aigna: [
    { id: 'dub', name: 'Dublin office', city: 'Dublin' }, { id: 'lon', name: 'London office', city: 'London' }, { id: 'cph', name: 'Copenhagen office', city: 'Copenhagen' },
    { id: 'nyc', name: 'New York office', city: 'New York' }, { id: 'chi', name: 'Chicago office', city: 'Chicago' }, { id: 'tor', name: 'Toronto office', city: 'Toronto' },
    { id: 'jnu', name: 'Juneau office', city: 'Juneau' }, { id: 'sin', name: 'Singapore office', city: 'Singapore' }, { id: 'tyo', name: 'Tokyo office', city: 'Tokyo' },
    { id: 'mel', name: 'Melbourne office', city: 'Melbourne' },
  ],
  fenwater: [
    { id: 'fw-bos', name: 'Boston campus', city: 'Boston' },
    { id: 'fw-cam', name: 'Cambridge clinic', city: 'Cambridge' },
    { id: 'fw-qcy', name: 'Quincy outpatient centre', city: 'Quincy' },
  ],
  quillmark: [
    { id: 'qm-den', name: 'Denver head office', city: 'Denver' },
    { id: 'qm-sea', name: 'Seattle studio', city: 'Seattle' },
  ],
};
export const siteName = (client, id) => CLIENT_SITES[client]?.find((s) => s.id === id)?.name ?? id;

const FICTIONAL_JOBS = [
  { id: 'FW-INC-2207', client: 'fenwater', vendor: 'northlight', kind: 'incident', title: 'Boardroom display flickers', site: 'fw-bos', where: 'Boardroom, level 6',
    handedAt: '2026-09-28T08:30', sla: { what: 'P2, room degraded: on site', kind: 'response', hours: 4 }, state: 'with', native: { from: 'Fenwater service desk', ref: 'FWH-2207', status: 'Assigned' } },
  { id: 'FW-INC-2201', client: 'fenwater', vendor: 'northlight', kind: 'incident', title: 'Lecture theatre microphones drop out', site: 'fw-cam', where: 'Lecture theatre',
    handedAt: '2026-09-24T10:00', sla: { what: 'P3 fixed', kind: 'fix', workdays: 2 }, state: 'with', native: { from: 'Fenwater service desk', ref: 'FWH-2201', status: 'Parts ordered' } },
  { id: 'FW-REQ-0880', client: 'fenwater', vendor: 'northlight', kind: 'request', title: 'Add a camera to telehealth room 2', site: 'fw-qcy', where: 'Telehealth room 2',
    handedAt: '2026-09-22T09:00', sla: { what: 'Request done', kind: 'fix', workdays: 10 }, state: 'with', native: { from: 'Fenwater service desk', ref: 'FWH-R880', status: 'Scheduled' } },
  { id: 'FW-INC-2190', client: 'fenwater', vendor: 'northlight', kind: 'incident', title: 'Ward huddle room will not join calls', site: 'fw-bos', where: 'Ward 4 huddle room',
    handedAt: '2026-09-21T08:00', sla: { what: 'P2, room degraded: on site', kind: 'response', hours: 4 }, state: 'done', closedAt: '2026-09-21T10:40', native: { from: 'Fenwater service desk', ref: 'FWH-2190', status: 'Closed' } },
  // Handed to another provider: Northlight must never see it (Fenwater's own record, another engagement).
  { id: 'FW-INC-2205', client: 'fenwater', vendor: 'other', kind: 'incident', title: 'Nurse call panel fault', site: 'fw-bos', where: 'Ward 2',
    handedAt: '2026-09-27T14:00', sla: { what: 'P1', kind: 'response', hours: 1 }, state: 'with', native: { from: 'Fenwater service desk', ref: 'FWH-2205', status: 'Assigned' } },
  { id: 'QM-1142', client: 'quillmark', vendor: 'northlight', kind: 'incident', title: 'Podcast studio mixer hums', site: 'qm-sea', where: 'Podcast studio',
    handedAt: '2026-09-25T14:00', sla: { what: 'Fault fixed', kind: 'fix', workdays: 2 }, state: 'with', native: { from: 'Quillmark IT', ref: 'Q-1142', status: 'Booked' } },
  { id: 'QM-1139', client: 'quillmark', vendor: 'northlight', kind: 'incident', title: 'Boardroom touch panel frozen', site: 'qm-den', where: 'Boardroom',
    handedAt: '2026-09-14T09:00', sla: { what: 'Fault fixed', kind: 'fix', workdays: 2 }, state: 'done', closedAt: '2026-09-15T11:00', native: { from: 'Quillmark IT', ref: 'Q-1139', status: 'Closed' } },
];

// ---- Engagements ---------------------------------------------------------------------------------------------------
// scope.sites and scope.projects say where; scope.kinds says which records flow (never a kind with flows: false).
// agreement.sla is the service levels; for Aigna's engagements the contract in data/vendors/<id>.yaml is the master
// and the page joins it (agreement.contract names it).
export const ENGAGEMENTS = [
  { id: 'aigna-northlight', client: 'aigna', provider: 'northlight', role: 'integrator', start: '2025-04-01', end: '2027-03-31', signed: '2025-03-14',
    scope: { sites: ['nyc', 'chi', 'tor', 'jnu'], projects: ['PRJ-14'], kinds: ['site', 'job', 'visit', 'as-built', 'handover', 'design'] },
    agreement: { contract: 'northlight' },
    contacts: { client: 'marcus', provider: 'sam' } },
  { id: 'fenwater-northlight', client: 'fenwater', provider: 'northlight', role: 'managed', start: '2025-01-01', end: '2026-12-31', signed: '2024-12-02',
    scope: { sites: ['fw-bos', 'fw-cam', 'fw-qcy'], projects: [], kinds: ['site', 'job', 'visit', 'handover'] },
    agreement: { ref: 'FWH-AV-2025-01', sla: [
      { what: 'P1, room down: on site', target: '1 hour' },
      { what: 'P2, room degraded: on site', target: '4 hours' },
      { what: 'P3 fixed', target: '2 working days' },
      { what: 'Rooms checked each weekday', target: 'Before 08:00' },
    ] },
    contacts: { provider: 'sam' } },
  { id: 'quillmark-northlight', client: 'quillmark', provider: 'northlight', role: 'maintenance', start: '2026-07-01', end: '2027-06-30', signed: '2026-06-12',
    scope: { sites: ['qm-den', 'qm-sea'], projects: [], kinds: ['site', 'job', 'visit'] },
    agreement: { ref: 'QM-MAINT-26', sla: [
      { what: 'Fault fixed', target: '2 working days' },
      { what: 'Preventive maintenance', target: 'Each quarter' },
    ] },
    contacts: { provider: 'sam' } },
  { id: 'aigna-brightwave', client: 'aigna', provider: 'brightwave', role: 'integrator', start: '2024-11-01', end: '2026-10-31', signed: '2024-10-15',
    scope: { sites: ['dub', 'lon', 'cph', 'sin', 'mel', 'tyo'], projects: ['PRJ-15'], kinds: ['site', 'job', 'visit', 'as-built', 'handover', 'design'] },
    agreement: { contract: 'brightwave' }, contacts: { client: 'anna', provider: 'lena' } },
  { id: 'aigna-keystone', client: 'aigna', provider: 'keystone', role: 'maintenance', start: '2026-01-01', end: '2028-12-31', signed: '2025-12-02',
    scope: { sites: ['dub', 'lon', 'cph', 'nyc', 'chi', 'tor', 'jnu', 'sin', 'tyo', 'mel'], projects: [], kinds: ['site', 'job', 'visit'] },
    agreement: { contract: 'keystone' }, contacts: { client: 'sofia', provider: 'dev' } },
  { id: 'aigna-hp-poly', client: 'aigna', provider: 'hp-poly', role: 'manufacturer', start: '2023-04-01', end: '2027-03-31', signed: '2023-03-20',
    scope: { sites: [], projects: [], kinds: ['job'] },
    agreement: { contract: 'hp-poly' }, contacts: { client: 'sofia' } },
];
export const engagement = (id) => ENGAGEMENTS.find((e) => e.id === id) ?? null;
/** The engagement between a client and a provider, if there is one. */
export const between = (client, provider, list = ENGAGEMENTS) => list.find((e) => e.client === client && e.provider === provider) ?? null;

/** Is the engagement in force at `now`: signed, started, not ended and not revoked. */
export function active(e, now = NOW) {
  if (!e) return false;
  const d = now.slice(0, 10);
  if (e.revokedAt && e.revokedAt <= now) return false;
  return e.start <= d && d <= e.end;
}

// ---- The records across the federation -------------------------------------------------------------------------------
// One flat list, each record with its kind, its owner (whose Keia it lives in), the client it is about and, for work,
// the provider it was handed to. In a real deployment each lives in its own organisation's Keia; the demo keeps them
// side by side so the scope filter can be shown and tested.
const aignaJobs = JOBS.map((j) => ({ ...j, client: 'aigna' }));
const jobRecord = (j) => ({ id: j.id, kind: 'job', owner: j.client, client: j.client, provider: j.vendor, site: j.site, project: j.project ?? null, at: j.handedAt, job: j });

export const PROVIDER_RECORDS = [
  // Crews on site today (the provider's own: never shared). Teams, never people.
  { id: 'crew-nl-1', kind: 'crew', owner: 'northlight', provider: 'northlight', client: 'aigna', site: 'jnu', at: '2026-09-28T07:30', what: 'Install crew 1 · 2 installers', doing: 'Reframing the camera in 2.02 (SNAG-14-02)' },
  { id: 'crew-nl-res', kind: 'crew', owner: 'northlight', provider: 'northlight', client: 'fenwater', site: 'fw-bos', at: '2026-09-28T07:00', what: 'Resident team · 2 technicians', doing: 'Rooms checked at 07:52; now on the boardroom display (FW-INC-2207)' },
  // Visits this week, with their readiness (shared: both marks).
  { id: 'visit-nl-chi', kind: 'visit', owner: 'northlight', provider: 'northlight', client: 'aigna', site: 'chi', at: '2026-09-29T10:00', what: 'Site survey before the 12.09 refit (SURV-0412)', ready: true, readiness: 'Ready: access booked with reception, survey kit packed', shared: true },
  { id: 'visit-nl-cam', kind: 'visit', owner: 'northlight', provider: 'northlight', client: 'fenwater', site: 'fw-cam', at: '2026-09-30T09:00', what: 'Swap the lecture theatre microphones (FW-INC-2201)', ready: false, readiness: 'Waiting on: parts, due Tuesday', shared: true },
  { id: 'visit-nl-den', kind: 'visit', owner: 'northlight', provider: 'northlight', client: 'quillmark', site: 'qm-den', at: '2026-10-01T09:30', what: 'Quarterly preventive maintenance', ready: true, readiness: 'Ready: access confirmed by Quillmark IT', shared: true },
  // Sent to the client (shared) and kept to itself (never shared).
  { id: 'asbuilt-nl-205', kind: 'as-built', owner: 'northlight', provider: 'northlight', client: 'aigna', site: 'jnu', project: 'PRJ-14', at: '2026-09-11T15:20', what: 'As-built for 2.05, with the cable cover fitted', shared: true },
  { id: 'note-nl-jnu', kind: 'note', owner: 'northlight', provider: 'northlight', client: 'aigna', site: 'jnu', at: '2026-09-25T17:00', what: 'Crew note: bring the long HDMI run for 2.03' },
  { id: 'cost-nl-prj14', kind: 'cost', owner: 'northlight', provider: 'northlight', client: 'aigna', project: 'PRJ-14', at: '2026-09-01T09:00', what: 'Juneau fit-out: labour and margin' },
  { id: 'note-nl-fw', kind: 'note', owner: 'northlight', provider: 'northlight', client: 'fenwater', site: 'fw-cam', at: '2026-09-26T16:00', what: 'Crew note: the theatre ceiling needs the tall ladder' },
];

// A client's own records that never flow (the scope filter must keep them home).
const CLIENT_ONLY = [
  { id: 'plan-aigna-jnu-2', kind: 'floor-plan', owner: 'aigna', client: 'aigna', site: 'jnu', at: '2026-04-24T09:00', what: 'Juneau office, second floor plan' },
  { id: 'plan-fw-bos-6', kind: 'floor-plan', owner: 'fenwater', client: 'fenwater', site: 'fw-bos', at: '2025-02-01T09:00', what: 'Boston campus, level 6 plan' },
];

/** Every record in the demo federation. */
export function federation() {
  const sites = Object.entries(CLIENT_SITES).flatMap(([client, ss]) => ss.map((s) => ({ id: `${client}:${s.id}`, kind: 'site', owner: client, client, site: s.id, at: '2024-01-01T00:00', what: s.name })));
  return [...sites, ...[...aignaJobs, ...FICTIONAL_JOBS].map(jobRecord), ...PROVIDER_RECORDS, ...CLIENT_ONLY];
}

// ---- The scope filter -------------------------------------------------------------------------------------------------
/** Why a record is or is not visible to an organisation. Returns { ok, why, copy } where copy is true for a record
    kept after the engagement was revoked (each side keeps what was shared before). */
export function reach(org, r, list = ENGAGEMENTS, now = NOW) {
  if (r.owner === org) return { ok: true, why: 'Your own record' };
  const K = RECORD_KINDS[r.kind];
  if (!K || !K.flows) return { ok: false, why: 'Never shared' };
  // A provider reading a client's record, or a client reading what its provider shared.
  const asProvider = ORGS[org]?.kind === 'provider' && r.owner === r.client;
  const asClient = r.client === org && r.owner === r.provider && r.shared;
  if (!asProvider && !asClient) return { ok: false, why: 'Not part of any engagement with you' };
  const e = asProvider ? between(r.client, org, list) : between(org, r.provider, list);
  if (!e) return { ok: false, why: 'No engagement' };
  if (!e.scope.kinds.includes(r.kind)) return { ok: false, why: 'Not in the engagement\'s scope' };
  const where = (r.site && e.scope.sites.includes(r.site)) || (r.project && e.scope.projects.includes(r.project));
  if (!where) return { ok: false, why: 'Outside the engagement\'s sites and projects' };
  if (asProvider && ['job', 'visit'].includes(r.kind) && r.provider !== org) return { ok: false, why: 'Handed to someone else' };
  if (active(e, now)) return { ok: true, why: 'In scope' };
  // Revoked or ended: nothing new flows, and each side keeps its copy of what was shared before.
  const cut = e.revokedAt ?? `${e.end}T23:59`;
  if (r.at && r.at <= cut) return { ok: true, why: 'Kept copy: shared before the engagement stopped', copy: true };
  return { ok: false, why: 'The engagement has stopped' };
}
export const canSee = (org, r, list = ENGAGEMENTS, now = NOW) => reach(org, r, list, now).ok;

/** Everything one organisation can see across the federation. */
export const visibleTo = (org, records = federation(), list = ENGAGEMENTS, now = NOW) => records.filter((r) => canSee(org, r, list, now));

/** One engagement's view. The provider's side: what that client lets through, and the provider's own records about
    that client (its crews and notes stay its own). The client's side: what it lets this provider see, and what this
    provider shared back. Nothing from another client, and nothing from another provider. */
export function engagementView(id, side = 'provider', records = federation(), list = ENGAGEMENTS, now = NOW) {
  const e = list.find((x) => x.id === id); if (!e) return [];
  return records.filter((r) => {
    if (r.client !== e.client) return false;
    if (side === 'provider') return canSee(e.provider, r, list, now) && (r.owner === e.client || r.owner === e.provider);
    if (r.owner === e.client) return canSee(e.provider, r, list, now);
    return r.owner === e.provider && canSee(e.client, r, list, now);
  });
}

// ---- A provider's portfolio -----------------------------------------------------------------------------------------
const WEEK = { from: '2026-09-28', to: '2026-10-04' };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One client card: the engagement, its open jobs (with the clock), crews today, visits this week, the renewal. */
export function clientCard(e, now = NOW, records = federation(), list = ENGAGEMENTS) {
  const mine = engagementView(e.id, 'provider', records, list, now);
  const jobs = mine.filter((r) => r.kind === 'job' && r.job.state !== 'done').map((r) => ({ ...r.job, clock: contractClock(r.job, now) }))
    .sort((a, b) => Number(b.clock.past) - Number(a.clock.past) || (a.clock.left ?? 9e9) - (b.clock.left ?? 9e9));
  const past = jobs.filter((j) => j.clock.past && !j.clock.paused).length;
  const crews = mine.filter((r) => r.kind === 'crew' && r.at.slice(0, 10) === now.slice(0, 10));
  const visits = mine.filter((r) => r.kind === 'visit' && r.at.slice(0, 10) >= WEEK.from && r.at.slice(0, 10) <= WEEK.to).sort((a, b) => a.at.localeCompare(b.at));
  const left = daysBetween(now, e.end);
  const renewal = { end: e.end, left, state: left < 0 ? 'fault' : left <= 120 ? 'review' : 'fine', words: left < 0 ? `Ended ${dateWords(e.end)}` : `Renews ${dateWords(e.end)}, in ${left} days` };
  const name = orgName(e.client);
  const answer = `${name}: ${jobs.length ? plural(jobs.length, 'job') : 'no jobs'} open${past ? `, ${past} past target` : ''}`;
  return { e, id: e.id, client: e.client, name, role: ROLE_WORDS[e.role], jobs, past, crews, visits, renewal, sites: e.scope.sites.length, answer, fictional: !!ORGS[e.client]?.fictional };
}

/** The provider's whole portfolio: one card per client, worst first, and the totals for the band. */
export function portfolio(provider, now = NOW, records = federation(), list = ENGAGEMENTS) {
  const cards = list.filter((e) => e.provider === provider && active(e, now)).map((e) => clientCard(e, now, records, list))
    .sort((a, b) => b.past - a.past || b.jobs.length - a.jobs.length || a.name.localeCompare(b.name));
  const jobs = cards.reduce((n, c) => n + c.jobs.length, 0), past = cards.reduce((n, c) => n + c.past, 0);
  const crews = cards.flatMap((c) => c.crews.map((x) => ({ ...x, clientName: c.name, engagement: c.id })));
  const visits = cards.flatMap((c) => c.visits.map((x) => ({ ...x, clientName: c.name, engagement: c.id }))).sort((a, b) => a.at.localeCompare(b.at));
  const renewals = cards.map((c) => ({ ...c.renewal, clientName: c.name, engagement: c.id })).sort((a, b) => a.left - b.left);
  const answer = `${plural(cards.length, 'client')} · ${plural(jobs, 'job')} open · ${past ? `${past} past target` : 'none past target'}`;
  return { provider, name: orgName(provider), cards, jobs, past, crews, visits, renewals, answer };
}

// ---- The activity log: signed on both sides ----------------------------------------------------------------------------
// Each entry is written in both organisations' audit logs (signed by the sender, received by the other side).
export const ACTIVITY = {
  'aigna-northlight': [
    { at: '2026-09-28T08:10', by: 'northlight', what: 'Marked Tuesday\'s Chicago survey ready: access booked, kit packed', kind: 'sent' },
    { at: '2026-09-25T16:00', by: 'aigna', what: 'TASK-14-2-03 now waiting on switch ports: the clock paused for both sides', kind: 'shared' },
    { at: '2026-09-21T09:00', by: 'aigna', what: 'Handed TASK-14-2-03 to Northlight AV: record serials and MACs, 2.03', kind: 'shared' },
    { at: '2026-09-18T10:00', by: 'aigna', what: 'Handed SURV-0412 to Northlight AV: survey before the 12.09 refit', kind: 'shared' },
    { at: '2026-09-16T15:00', by: 'aigna', what: 'Handed SNAG-14-02 to Northlight AV: reframe the camera in 2.02', kind: 'shared' },
    { at: '2026-09-11T15:20', by: 'northlight', what: 'Sent the as-built for 2.05; it landed in Aigna\'s record as a reviewed change, accepted by Marcus', kind: 'sent' },
    { at: '2025-03-14T11:00', by: 'aigna', what: 'Engagement signed by both sides, with the data processing agreement', kind: 'signed' },
  ],
  'fenwater-northlight': [
    { at: '2026-09-28T08:30', by: 'fenwater', what: 'Handed FW-INC-2207 to Northlight AV: boardroom display flickers', kind: 'shared' },
    { at: '2026-09-28T07:52', by: 'northlight', what: 'Rooms checked on all three sites before 08:00', kind: 'sent' },
    { at: '2026-09-24T10:00', by: 'fenwater', what: 'Handed FW-INC-2201 to Northlight AV: lecture theatre microphones', kind: 'shared' },
    { at: '2024-12-02T10:00', by: 'fenwater', what: 'Engagement signed by both sides', kind: 'signed' },
  ],
  'quillmark-northlight': [
    { at: '2026-09-25T14:00', by: 'quillmark', what: 'Handed QM-1142 to Northlight AV: podcast studio mixer hums', kind: 'shared' },
    { at: '2026-09-15T11:00', by: 'northlight', what: 'Closed QM-1139 with the fix and a photo of the panel', kind: 'sent' },
    { at: '2026-06-12T10:00', by: 'quillmark', what: 'Engagement signed by both sides', kind: 'signed' },
  ],
  'aigna-brightwave': [
    { at: '2026-09-25T11:00', by: 'aigna', what: 'SURV-0415 now waiting on floor access after 18:00: the clock paused for both sides', kind: 'shared' },
    { at: '2026-09-24T14:00', by: 'aigna', what: 'Handed DSGN-15-01 to Brightwave Integration: design review, the divisible town hall', kind: 'shared' },
    { at: '2024-10-15T10:00', by: 'aigna', what: 'Engagement signed by both sides, with the data processing agreement', kind: 'signed' },
  ],
  'aigna-keystone': [
    { at: '2026-09-28T09:40', by: 'aigna', what: 'Handed INC0041215 to Keystone Service: codec stuck after a power cut', kind: 'shared' },
    { at: '2026-09-28T08:40', by: 'keystone', what: 'Booked an engineer for tomorrow morning on INC0041214', kind: 'sent' },
    { at: '2025-12-02T10:00', by: 'aigna', what: 'Engagement signed by both sides, with the data processing agreement', kind: 'signed' },
  ],
  'aigna-hp-poly': [
    { at: '2026-02-11T10:00', by: 'aigna', what: 'Security assessment renewed', kind: 'signed' },
    { at: '2023-03-20T10:00', by: 'aigna', what: 'Engagement signed by both sides', kind: 'signed' },
  ],
};
/** The log in words, newest first: "today, 08:10 · Northlight AV · Marked ...", with how each side holds it. */
export function activityOf(id, now = NOW) {
  const e = engagement(id);
  return (ACTIVITY[id] ?? []).slice().sort((a, b) => b.at.localeCompare(a.at)).map((x) => ({
    ...x, byName: orgName(x.by), when: x.at.slice(0, 10) === now.slice(0, 10) ? `today, ${x.at.slice(11, 16)}` : `${dateWords(x.at)}, ${whenWords(x.at, x.at)}`,
    held: e ? `Signed by ${orgName(x.by)} · in both audit logs` : '',
  }));
}

/** The engagement in one line for its band. */
export function engagementAnswer(e, now = NOW) {
  if (!active(e, now)) return e.revokedAt ? 'Revoked · nothing flows · each side keeps its copy' : 'Not in force';
  const card = clientCard(e, now);
  const where = [e.scope.sites.length ? plural(e.scope.sites.length, 'site') : null, e.scope.projects.length ? plural(e.scope.projects.length, 'project') : null].filter(Boolean).join(' and ');
  return `In force · ${where || 'no sites'} shared · ${card.jobs.length ? plural(card.jobs.length, 'job') : 'no jobs'} open${card.past ? `, ${card.past} past target` : ''}`;
}
