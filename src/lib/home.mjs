// Everything Home needs for every person, worked out once at build time.
// The page carries this as one JSON blob and draws whoever is viewing in the browser, so View as and a
// stage change re-render in place (no reload) and two windows can be two people. The work comes from
// src/lib/work.mjs, so Home agrees with the Work overview and the Schedule; the rules for grouping and the
// day are in src/lib/homecore.mjs (tested on their own).
import { work } from './work.mjs';
import { schedule } from './schedule.mjs';
import { placeOn } from './schedulecore.mjs';
import { groupFor, planDay } from './homecore.mjs';
import { projects, incidents, spaces, sites, SITE_ORDER, DEMO_TODAY, href, totals, labTests, advisories, commsRooms, phasesOf, OPEN_PHASES } from './data.mjs';
import { PEOPLE, ROLES, INBOX_SEED, MANAGER_ROLES } from './demo.mjs';
import { integratePlan, buildModel, batchHref } from './integrate.mjs';
import { lights, nextGate } from './project-status.mjs';
import { issues as kiIssues } from './knownissues-view.mjs';
import { KIND } from './data.mjs';

const TODAY = DEMO_TODAY;
const TASK_KINDS = 'provision,install,configure,commission,task';
const OPEN_INC = 'new,in-progress,on-hold';
const P = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));
const roomName = (id) => (spaces[id] ? (spaces[id].number ? `${spaces[id].number} ${spaces[id].name}` : spaces[id].name) : id);
const REGION_SHORT = { amer: 'Americas', emea: 'EMEA', apac: 'APAC' };

// ---- The work, lightened for the page --------------------------------------------------------------------
const taskById = new Map();
for (const p of Object.values(projects)) for (const t of p.tasks ?? []) taskById.set(t.id, { t, p });
// Work items are keyed by ticket number (INC0041172); the incidents folder is keyed by file name (inc0041172).
const incidentByNumber = new Map(Object.values(incidents).map((i) => [i.number, i]));
const OPEN = work.filter((it) => it.status !== 'done' && !(it.status === 'booked' && it.end && it.end < TODAY) || (it.kind === 'time-off' && it.end >= TODAY));
export const ITEMS = OPEN.map((it) => {
  const o = { id: it.id, kind: it.kind, title: it.title, who: it.who, site: it.site, room: it.room, start: it.start, end: it.end, hours: it.hours, status: it.status, href: it.href, where: it.where, project: it.project };
  if (it.kind === 'task') { const x = taskById.get(it.id.slice(5)); o.taskKind = it.taskKind; if (x?.t.blocked_by) o.blocked = x.t.blocked_by; }
  if (it.kind === 'incident') { const inc = incidentByNumber.get(it.id.slice(4)); if (inc) { o.prio = inc.priority; o.state = inc.state; o.number = inc.number; o.matched = Boolean(inc.keia_atlas?.matched_by); } }
  if (it.kind === 'refresh') { const m = /^Replace (\d+)/.exec(it.title); o.units = m ? +m[1] : 1; }
  return o;
});
const BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

// ---- People, and where each one is today ------------------------------------------------------------------
const country = (p) => sites[p.office]?.country ?? (p.region === 'amer' ? 'US' : p.region === 'apac' ? 'SG' : 'IE');
const placeCtx = { timeOff: schedule.pto, holidays: schedule.holidays, items: work };
export const PLACE = Object.fromEntries(PEOPLE.map((p) => {
  const pl = placeOn({ ...p, country: country(p) }, TODAY, placeCtx);
  return [p.id, { kind: pl.kind, place: pl.place ?? null, site: pl.site ?? null, why: pl.why ?? null, note: pl.off?.note ?? pl.holiday?.name ?? null }];
}));
const teamOf = (p) => {
  if (p.roleId === 'delivery-manager') return PEOPLE.filter((x) => ['delivery', 'onsite'].includes(x.team) && x.id !== p.id).map((x) => x.id);
  if (MANAGER_ROLES.includes(p.roleId)) return PEOPLE.filter((x) => x.reportsTo === p.id).map((x) => x.id);
  if (p.roleId === 'head') return PEOPLE.filter((x) => x.reportsTo === p.id).map((x) => x.id);
  return [];
};
export const PEOPLE_LITE = Object.fromEntries(PEOPLE.map((p) => [p.id, {
  id: p.id, name: p.name, first: p.name.split(' ')[0], role: p.role, roleId: p.roleId, team: p.team, where: p.where, scope: p.scope, initials: p.initials,
  office: p.office, base: p.base, home: p.home, region: p.region ?? null, tz: sites[p.office]?.time_zone ?? 'Europe/Dublin', vendor: p.vendor ?? null, projects: p.projects ?? [],
  people: teamOf(p),
}]));
export const SITES_LITE = Object.fromEntries(SITE_ORDER.map((s) => [s, { name: sites[s].name, city: sites[s].city ?? null, code: sites[s].code, region: sites[s].region, remote: sites[s].kind === 'remote', tz: sites[s].time_zone ?? null }]));
const roomIds = new Set([...ITEMS.map((it) => it.room), ...PEOPLE.map((p) => p.base), ...Object.values(PLACE).map((x) => x.place)].filter((r) => r && spaces[r]));
export const ROOMS_LITE = Object.fromEntries([...roomIds].map((r) => [r, { name: roomName(r), type: spaces[r].space_type, site: spaces[r].site, floor: spaces[r].floor ?? null }]));

// ---- What each role does, in one line (the caption under the title after View as) ----------------------------
export const CAPTION = {
  // One line each, short enough for the band's line at 1280 wide.
  tech: (p) => `Technician: installs, swaps and first-line fixes at ${sites[p.office]?.name ?? 'the office'}.`,
  delivery: () => 'Delivery engineer: space designs, commissioning and the next device.',
  network: () => 'Network engineer: ports, VLANs and patching from project and incident tasks.',
  innovation: () => 'Innovation engineer: tests new devices and firmware in the Lab.',
  'sm-av': () => 'Service manager, AV: owns the standard and approves what goes in.',
  'sm-infra': () => 'Service manager, IT: owns the network and comms rooms.',
  pm: () => 'Project manager: dates, tasks, gates and what is stuck.',
  programme: () => 'Programme manager: the year plan and the order projects run in.',
  head: () => 'Head of the service: the estate in four numbers and what is stuck.',
  desk: () => 'Service desk: incidents as they arrive, and first triage.',
  vendor: () => 'Vendor: your installation and the records Aigna needs.',
  'service-vendor': () => 'Service vendor: break-fix on the devices your contract covers.',
  'delivery-manager': () => 'Delivery manager: who is free for what, across regions.',
  'eng-manager': () => 'Engineering manager: the delivery engineers, in every region.',
  'pm-manager': () => 'Project management lead: the project managers you lead.',
  'tech-manager': () => 'On-site services manager: technicians, rotas and cover for the sites you look after.',
};
export const captionFor = (p) => (CAPTION[p.roleId] ?? (() => ROLES[p.roleId]?.owns?.[0] ?? ''))(p);

// ---- Key numbers per person: each opens the list it counts, filtered (rule P10) -------------------------------
const mine = (id) => ITEMS.filter((it) => it.who.includes(id));
const openTasksOf = (id) => mine(id).filter((it) => it.kind === 'task');
const todayN = (id) => planDay(ITEMS, id, TODAY).length;
const dayLink = (id) => `/work/schedule/?view=day&who=${id}&d=${TODAY}`;
const listLink = (q) => `/work/list/?${new URLSearchParams(q).toString().replace(/%2C/g, ',')}`;
const incAt = (site) => ITEMS.filter((it) => it.kind === 'incident' && it.site === site);
// Devices due this year at a site, the way the Work plan's "Due in <year>" counts them (past years roll into this one).
const dueAt = (site) => ITEMS.filter((it) => it.kind === 'refresh' && it.site === site && (it.end ?? '').slice(0, 4) === TODAY.slice(0, 4)).reduce((n, it) => n + (it.units ?? 0), 0);
const installing = Object.values(spaces).filter((s) => s.stages.deploy > 0 && !s.positions.some((p) => p.legacy));
const livePhases = [...new Set(Object.values(projects).filter((p) => p.phase !== 'closed').map((p) => p.phase))];
const myProjects = (id) => Object.values(projects).filter((p) => p.phase !== 'closed' && (p.owner === id || (p.roles ?? []).some((r) => r.person === id)));
const runs = (id) => Object.values(projects).filter((p) => p.phase !== 'closed' && p.owner === id);
const blockedOn = (ps) => ps.flatMap((p) => p.tasks.filter((t) => t.status === 'blocked'));
// Blocked tasks on the projects a PM runs: the Work list cannot filter by project, so the link filters by the
// owners of those tasks when that gives exactly the same count, otherwise it opens the PM's projects.
const blockedLink = (id) => {
  const bl = blockedOn(runs(id)), owners = [...new Set(bl.map((t) => t.owner))];
  const same = ITEMS.filter((it) => it.kind === 'task' && it.status === 'blocked' && it.who.some((w) => owners.includes(w))).length === bl.length;
  return same && bl.length ? listLink({ kind: TASK_KINDS, status: 'blocked', person: owners.join(',') }) : `/projects/?owner=${id}`;
};
const sitesOf = (ps) => [...new Set(ps.map((p) => p.site).filter((s) => sites[s]))];
const inboxN = (id) => INBOX_SEED.filter((x) => x.to === id && x.status === 'new').length;
const T = (n, label, to, extra = {}) => ({ n, label, to, ...extra });

export function numbersFor(p) {
  const id = p.id, office = sites[p.office]?.name ?? 'your office';
  const tasks = openTasksOf(id), blocked = tasks.filter((it) => it.status === 'blocked').length;
  const taskTo = listLink({ kind: TASK_KINDS, person: id });
  switch (p.roleId) {
    case 'tech': return [
      T(todayN(id), 'Today', dayLink(id), { id: 'today' }),
      T(tasks.length, 'Open tasks', taskTo, { id: 'tasks' }),
      T(incAt(p.office).length, `Incidents at ${office}`, `/incidents/?site=${p.office}&state=${OPEN_INC}`, { id: 'inc', tone: incAt(p.office).some((i) => i.state === 'new') ? 'warn' : undefined }),
      T(dueAt(p.office), 'Devices due in the work plan', `/refresh/?site=${p.office}&due=over,now`, { id: 'due' }),
    ];
    case 'delivery': case 'network': case 'innovation': {
      const ss = sitesOf(myProjects(id).filter((x) => x.phase === 'integrate'));
      const inst = installing.filter((s) => ss.includes(s.site)).length;
      return [
        T(todayN(id), 'Today', dayLink(id), { id: 'today' }),
        T(tasks.length, 'Open tasks', taskTo, { id: 'tasks' }),
        T(blocked, 'Waiting on', listLink({ kind: TASK_KINDS, person: id, status: 'blocked' }), { id: 'blocked', tone: blocked ? 'bad' : undefined }),
        p.roleId === 'innovation'
          ? T(Object.values(labTests).filter((l) => ['testing', 'queued'].includes(l.status)).length, 'Lab tests under way', '/lab/?status=testing,queued', { id: 'lab' })
          : T(inst, 'Spaces being installed on your projects', `/rooms/?status=installing${ss.length ? `&site=${ss.join(',')}` : ''}`, { id: 'rooms' }),
      ];
    }
    case 'sm-av': case 'sm-infra': {
      const passed = Object.values(labTests).filter((l) => l.status === 'passed').length;
      return [
        T(inboxN(id), 'For your approval', listLink({ kind: 'inbox', person: id }), { id: 'approval', tone: inboxN(id) ? 'warn' : undefined }),
        T(ITEMS.filter((it) => it.kind === 'incident').length, 'Open incidents', `/incidents/?state=${OPEN_INC}`, { id: 'inc' }),
        T(installing.length, 'Spaces being installed', '/rooms/?status=installing', { id: 'rooms' }),
        p.roleId === 'sm-av' ? T(passed, 'Lab passes to decide', '/lab/?status=passed', { id: 'lab', tone: passed ? 'warn' : undefined })
          : T(commsRooms.length, 'Comms rooms', '/rooms/?kind=comms', { id: 'comms' }),
      ];
    }
    case 'pm': {
      const ps = runs(id), bl = blockedOn(ps).length;
      return [
        T(ps.length, 'Your projects', `/projects/?owner=${id}`, { id: 'projects' }),
        T(bl, 'Waiting on, your projects', blockedLink(id), { id: 'blocked', tone: bl ? 'bad' : undefined }),
        T(tasks.length, 'Your tasks', taskTo, { id: 'tasks' }),
        T(todayN(id), 'Today', dayLink(id), { id: 'today' }),
      ];
    }
    case 'programme': case 'head': {
      const live = Object.values(projects).filter((x) => x.phase !== 'closed');
      const blAll = ITEMS.filter((it) => it.kind === 'task' && it.status === 'blocked').length;
      if (p.roleId === 'head') return [
        T(totals.offices, 'Offices', '/locations/', { id: 'sites' }),
        T(totals.spaces, 'Spaces', '/rooms/', { id: 'rooms' }),
        T(totals.units, 'Devices', '/devices/', { id: 'devices' }),
        T(ITEMS.filter((it) => it.kind === 'incident').length, 'Open incidents', `/incidents/?state=${OPEN_INC}`, { id: 'inc' }),
      ];
      return [
        T(live.length, 'Live projects', `/projects/?phase=${livePhases.join(',')}`, { id: 'projects' }),
        T(blAll, 'Tasks waiting on something', listLink({ kind: TASK_KINDS, status: 'blocked' }), { id: 'blocked', tone: blAll ? 'bad' : undefined }),
        T(tasks.length, 'Your tasks', taskTo, { id: 'tasks' }),
        T(todayN(id), 'Today', dayLink(id), { id: 'today' }),
      ];
    }
    case 'desk': {
      const inc = ITEMS.filter((it) => it.kind === 'incident');
      const n = (st) => inc.filter((i) => i.state === st).length;
      return [
        T(n('new'), 'New', '/incidents/?state=new', { id: 'new', tone: n('new') ? 'warn' : undefined }),
        T(n('in-progress'), 'In progress', '/incidents/?state=in-progress', { id: 'doing' }),
        T(n('on-hold'), 'On hold', '/incidents/?state=on-hold', { id: 'hold' }),
        T(inc.filter((i) => !i.matched).length, 'Not matched to a space', undefined, { id: 'unmatched', fact: true }),
      ];
    }
    case 'vendor': case 'service-vendor': {
      const ps = (p.projects ?? []).map((x) => projects[x]).filter(Boolean);
      const rooms = ps.flatMap((x) => x.spaces ?? []);
      return [
        T(rooms.length, 'Spaces in your installation', '/vendor/', { id: 'rooms' }),
        T(tasks.length, 'Your tasks', '/vendor/#tasks', { id: 'tasks' }),
        T(todayN(id), 'Today', dayLink(id), { id: 'today' }),
        T(rooms.filter((r) => r.state === 'snags').length, 'Spaces with snags', '/vendor/', { id: 'snags' }),
      ];
    }
    default: {   // the people managers
      const team = teamOf(p), teamTasks = ITEMS.filter((it) => it.kind === 'task' && it.who.some((w) => team.includes(w)));
      const bl = teamTasks.filter((it) => it.status === 'blocked').length;
      const onSite = team.filter((w) => ['office', 'visiting'].includes(PLACE[w]?.kind)).length, away = team.filter((w) => PLACE[w]?.kind === 'away').length;
      return [
        T(teamTasks.length, 'Open tasks in your team', listLink({ kind: TASK_KINDS, person: team.join(',') }), { id: 'tasks' }),
        T(bl, 'Waiting on', listLink({ kind: TASK_KINDS, person: team.join(','), status: 'blocked' }), { id: 'blocked', tone: bl ? 'bad' : undefined }),
        T(onSite, 'On site today', '/work/schedule/?view=day&scope=team', { id: 'onsite' }),
        T(away, 'Away today', '/work/schedule/?view=day&scope=team#away', { id: 'away' }),
      ];
    }
  }
}
export const EVERYONE_NUMBERS = [
  T(INBOX_SEED.filter((x) => x.kind === 'urgent' && x.status !== 'done').length, 'Urgent', listLink({ kind: 'inbox', q: 'urgent' }), { id: 'urgent', tone: 'bad' }),
  T(installing.length, 'Spaces being installed', '/rooms/?status=installing', { id: 'rooms' }),
  T(ITEMS.filter((it) => it.kind === 'incident').length, 'Open incidents', `/incidents/?state=${OPEN_INC}`, { id: 'inc' }),
  T(Object.keys(projects).length, 'Projects', '/projects/', { id: 'projects' }),
];

// ---- The next device: for engineers and vendors, the first batch of a Deploy project not yet done ----------
const plans = new Map();
const planOf = (p) => { if (!plans.has(p.id)) plans.set(p.id, { plan: integratePlan(p), M: null }); const x = plans.get(p.id); if (!x.M) x.M = buildModel(x.plan); return x; };
export function nextDeviceFor(p) {
  const vendor = Boolean(p.vendor);
  const ps = Object.values(projects).filter((x) => x.phase === 'integrate' && phasesOf(x).includes('integrate') && (vendor ? (p.projects ?? []).includes(x.id) : (x.roles ?? []).some((r) => r.person === p.id && ['lead', 'engineer', 'network'].includes(r.as))));
  for (const prj of ps) {
    const { plan, M } = planOf(prj);
    for (const b of plan.batches) {
      const units = b.units.filter((uid) => !vendor || M.U.get(uid)?.vendor);
      if (!units.length) continue;
      const s = M.batchSum(b.id);
      if (s.status === 'done') continue;
      const next = units.find((uid) => !M.unitSetUp(uid)) ?? units[0];
      const u = M.U.get(next);
      return {
        project: prj.id, projectName: prj.name, site: prj.site, siteName: sites[prj.site]?.name ?? '', batch: b.title, href: batchHref(plan, b.id),
        done: s.done, total: s.total, status: s.status, issues: s.issues.length, ready: s.ready.length,
        unit: u ? { name: u.name, short: u.short, room: u.room, roomName: u.roomName, model: u.modelName, host: u.host, type: spaces[u.room]?.space_type ?? null } : null,
      };
    }
  }
  return null;
}
export const NEXT = Object.fromEntries(PEOPLE.filter((p) => ['delivery', 'network', 'vendor'].includes(p.roleId)).map((p) => [p.id, nextDeviceFor(p)]).filter(([, v]) => v));

// ---- The whole blob ---------------------------------------------------------------------------------------------
export function homeData() {
  return {
    today: TODAY, base: href('/'), taskKinds: TASK_KINDS, openInc: OPEN_INC,
    items: Object.fromEntries(ITEMS.map((it) => [it.id, it])),
    people: PEOPLE_LITE, place: PLACE, sites: SITES_LITE, rooms: ROOMS_LITE,
    numbers: Object.fromEntries(PEOPLE.map((p) => [p.id, numbersFor(p)])), everyone: EVERYONE_NUMBERS,
    captions: Object.fromEntries(PEOPLE.map((p) => [p.id, captionFor(p)])),
    next: NEXT,
    projectNames: Object.fromEntries(Object.values(projects).map((p) => [p.id, p.name])),
    cockpit: cockpitData(),
  };
}
export const groupsFor = (id) => groupFor(ITEMS, id, TODAY);
export { BY_ID as itemById };

// ==== v2: the cockpit (design notes) ========================================================
// Everything Home needs to say who has what, which spaces are not all right, what was done automatically, what
// changed overnight and, after time away, what happened. Worked out once here; src/lib/homecore.mjs turns it into
// each role's answer sentence, four figures and lists in the browser, with the live layer's changes on top.
const DEMO_NOW = '2026-09-28T12:00';
const OVERNIGHT = '2026-09-27T18:00';
const AWAY_FROM = '2026-09-14';        // Welcome back: two weeks away, 14 to 28 September
const HOLD_WORDS = { 'awaiting-caller': 'the caller', 'awaiting-vendor': 'the vendor', 'awaiting-change': 'a change', 'awaiting-parts': 'parts' };
const STATE_WORD = { 'in-progress': 'Taken', 'on-hold': 'On hold', resolved: 'Resolved' };
const LOG_WORD = { risk: 'Risk', issue: 'Issue', dependency: 'Dependency', decision: 'Decision' };
const PHASE_WORD = { plan: 'Plan', design: 'Design', procure: 'Procure', integrate: 'Deploy', handover: 'Hand over' };
const KIND_WORD = { install: 'Install', commission: 'Commission', provision: 'Provision', configure: 'Configure', survey: 'Survey', network: 'Network work', records: 'Records', handover: 'Hand over', design: 'Design', order: 'Order', task: 'Task' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtShort = (d) => { const [, m, dd] = String(d).slice(0, 10).split('-'); return `${+dd} ${MON[+m - 1]}`; };
// How long a job may stay open before it is past target, by priority (simulated service targets, in hours).
export const TARGET_H = { 1: 4, 2: 8, 3: 72, 4: 240 };
const hoursBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 36e5;
const firstSentence = (s) => { const t = String(s ?? '').trim(); const m = /^(.+?[.!?])(\s|$)/.exec(t); return (m ? m[1] : t).replace(/\.$/, ''); };
const incOf = (it) => (it.kind === 'incident' ? incidentByNumber.get(it.id.slice(4)) : null);
const pName = (id) => P[id]?.name ?? id;
const pFirst = (id) => (P[id]?.name ?? String(id ?? 'nobody')).split(' ')[0];
const lower1 = (s) => String(s ?? '').replace(/^./, (c) => c.toLowerCase());

// The standing rule that matches tickets to spaces (quiet automation: a rule with a human owner, never an agent).
export const MATCH_RULE = { name: 'Match tickets to spaces', owner: 'priya' };

// ---- Who has each piece of work, before any live change ----------------------------------------------------
// Parked jobs in the demo (design notes): Liam stopped part way through labelling the IDF 3 panel for the cutover;
// Anna stopped part way through commissioning Heron in Juneau.
export const PARKED_SEED = {
  'task:T-1605': { by: 'liam', at: `${DEMO_TODAY}T10:14`, park: { where: 'Labelled ports 1 to 8 on the IDF 3 panel', next: 'Label 9 to 12, then check each against the build sheet', question: 'Is port 11 the booking panel? Its label is missing' } },
  'task:T-1404': { by: 'anna', at: '2026-09-25T16:40', park: { where: 'Framing fixed; half of the verification run', next: 'Run the far-end checks from another office', question: 'Does the Juneau desk want the old unit kept as a spare?' } },
};
function baseOwn(it) {
  const to = it.who[0] ?? null;
  const seed = PARKED_SEED[it.id];
  if (seed && it.status !== 'done') return { s: 'parked', to: seed.by, kind: 'person', at: seed.at, by: seed.by, park: seed.park };
  if (it.kind === 'incident') {
    const inc = incOf(it); if (!inc) return null;
    const last = [...inc.history].reverse().find((h) => h.state);
    const at = last?.at ?? inc.opened;
    if (inc.state === 'new') return { s: 'ready', to, kind: 'person', at: inc.opened };
    if (inc.state === 'in-progress') return { s: 'with', to, kind: 'person', at, by: last?.by ?? to };
    if (inc.state === 'on-hold') return { s: 'waiting', to, kind: 'person', at, wait: HOLD_WORDS[last?.hold_reason] ?? 'something outside' };
    return { s: 'done', to, kind: 'person', at };
  }
  if (it.kind === 'task' || it.kind === 'lab') {
    if (it.status === 'todo') return { s: 'ready', to, kind: 'person', at: it.start };
    if (it.status === 'doing') return { s: 'with', to, kind: 'person', at: it.start, by: to };
    if (it.status === 'blocked') return { s: 'waiting', to, kind: 'person', at: it.start, wait: lower1(it.blocked ?? 'something outside') };
    return { s: 'done', to, kind: 'person', at: it.end };
  }
  if (it.kind === 'inbox') return it.status === 'todo' ? { s: 'ready', to, kind: 'person', at: it.start } : null;
  return null;
}
export const OWN = Object.fromEntries(ITEMS.map((it) => [it.id, baseOwn(it)]).filter(([, o]) => o));

// The hand-off history each chip opens (newest first), from the ticket's history.
function historyOf(it) {
  const inc = incOf(it), out = [];
  if (inc) for (const h of inc.history) {
    if (h.source === 'keia_atlas') { out.push({ at: h.at, text: `Matched to its space automatically (${MATCH_RULE.name}, owner ${pFirst(MATCH_RULE.owner)})` }); continue; }
    if (h.state === 'new') out.push({ at: h.at, text: `Came in${h.person ? ` from ${h.person}` : ''}` });
    else if (h.state === 'in-progress' && h.by) out.push({ at: h.at, text: `${pName(h.by)} took it` });
    else if (h.state === 'on-hold') out.push({ at: h.at, text: `${h.by ? `${pName(h.by)}: w` : 'W'}aiting on ${HOLD_WORDS[h.hold_reason] ?? 'something outside'}` });
    else if (h.state === 'resolved') out.push({ at: h.at, text: `${h.by ? pName(h.by) : 'Someone'} resolved it` });
  }
  const seed = PARKED_SEED[it.id];
  if (seed) out.push({ at: seed.at, text: `${pName(seed.by)} parked it. Next: ${seed.park.next}` });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
export const HISTORY = Object.fromEntries(ITEMS.map((it) => [it.id, historyOf(it)]).filter(([, h]) => h.length));

// Extras on each open incident: its target and whether it is past it, when it came in, and whether it waits.
export const INC_EXTRA = Object.fromEntries(ITEMS.filter((it) => it.kind === 'incident').map((it) => {
  const inc = incOf(it); if (!inc) return [it.id, null];
  const age = hoursBetween(inc.opened, DEMO_NOW), target = TARGET_H[inc.priority] ?? 72;
  return [it.id, { opened: inc.opened, target, past: age > target, ageH: Math.round(age), newToday: inc.opened.slice(0, 10) === DEMO_TODAY, hold: inc.state === 'on-hold' }];
}).filter(([, v]) => v));

// ---- Spaces: which are not all right, from the open jobs on them (the dark cockpit colours nothing else) ------
// Fault: a P1 to P3 job someone is on or nobody has yet. To review: a P4, or a job waiting on something outside.
const RANK = { fault: 0, review: 1 };
export const SPACE_HEALTH = {};
for (const it of ITEMS.filter((x) => x.kind === 'incident' && x.room)) {
  const inc = incOf(it); if (!inc || inc.state === 'resolved') continue;
  const h = inc.priority <= 3 && inc.state !== 'on-hold' ? 'fault' : 'review';
  const cur = SPACE_HEALTH[it.room];
  if (!cur || RANK[h] < RANK[cur.h]) SPACE_HEALTH[it.room] = { h, why: firstSentence(inc.short_description), item: it.id, who: it.who[0] ?? null, prio: inc.priority, since: inc.opened };
}
// The spaces an office counts as its own (meeting rooms, shared spaces, comms rooms), not desks or home kits.
const countsAsSpace = (s) => s.site && !['desks', 'kits'].includes(KIND(s));
export const SITE_HEALTH = Object.fromEntries(SITE_ORDER.map((s) => {
  const list = Object.values(spaces).filter((x) => x.site === s && countsAsSpace(x)), bad = list.filter((x) => SPACE_HEALTH[x.id]);
  return [s, { n: list.length, fault: bad.filter((x) => SPACE_HEALTH[x.id].h === 'fault').map((x) => x.id), review: bad.filter((x) => SPACE_HEALTH[x.id].h === 'review').map((x) => x.id) }];
}));

// ---- Done automatically, and what changed overnight ---------------------------------------------------------
export const AUTO = [];
for (const inc of Object.values(incidents)) for (const h of inc.history) {
  if (h.source !== 'keia_atlas') continue;
  AUTO.push({ at: h.at, item: `inc:${inc.number}`, site: spaces[inc.subject.room]?.site ?? null, room: inc.subject.room, text: firstSentence(h.note), number: inc.number, href: href(`/incidents/${inc.number.toLowerCase()}/`), rule: MATCH_RULE });
}
AUTO.sort((a, b) => b.at.localeCompare(a.at));
export const CHANGED = [];
for (const inc of Object.values(incidents)) for (const h of inc.history) {
  if (h.at < OVERNIGHT || h.at > DEMO_NOW || h.source === 'keia_atlas') continue;
  const text = h.state === 'new' ? `New: ${inc.short_description}` : h.state ? `${STATE_WORD[h.state] ?? h.state}: ${inc.short_description}` : firstSentence(h.note);
  CHANGED.push({ at: h.at, site: spaces[inc.subject.room]?.site ?? null, item: `inc:${inc.number}`, text, sub: `${inc.number}${h.by ? ` · ${pName(h.by)}` : h.person ? ` · from ${h.person}` : ''}`, href: href(`/incidents/${inc.number.toLowerCase()}/`) });
}
for (const prj of Object.values(projects)) for (const l of prj.log ?? []) {
  if (!l.raised || l.raised < OVERNIGHT.slice(0, 10)) continue;
  CHANGED.push({ at: `${l.raised}T08:00`, site: prj.site, project: prj.id, text: `${LOG_WORD[l.kind] ?? 'Note'} raised: ${l.title}`, sub: `${prj.id} ${prj.name} · ${pName(l.owner)}`, href: href(`/projects/${prj.id.toLowerCase()}/`) });
}
CHANGED.sort((a, b) => b.at.localeCompare(a.at));

// ---- Knowledge to review: known errors from the manufacturers' feeds that may affect Aigna ------------------------
export const KNOWLEDGE = kiIssues.filter((i) => i.status === 'open' && i.affects !== 'no').map((i) => ({ title: i.title, sub: `${i.maker} · ${i.affects === 'yes' ? `affects ${i.ex.exposed.length} ${i.ex.exposed.length === 1 ? 'unit' : 'units'}` : 'may affect us'}`, href: href(i.path) }));

// ---- To review, per person: things someone should look at, where nothing is down (design notes, the notched ring) ----
const openLogOf = (pid) => Object.values(projects).filter((prj) => prj.phase !== 'closed').flatMap((prj) => (prj.log ?? []).filter((l) => l.status === 'open' && l.owner === pid && ['risk', 'issue'].includes(l.kind)).map((l) => ({ l, prj })));
function reviewFor(p) {
  const out = [], office = p.office;
  const R = (title, sub, to, extra = {}) => out.push({ title, sub, href: to ? href(to) : null, ...extra });
  const logRows = () => openLogOf(p.id).forEach(({ l, prj }) => R(l.title, `${prj.id} ${prj.name} · ${LOG_WORD[l.kind]}${l.due ? ` · due ${fmtShort(l.due)}` : ''}`, `/projects/${prj.id.toLowerCase()}/`));
  switch (p.roleId) {
    case 'tech': {
      for (const id of SITE_HEALTH[office]?.review ?? []) { const h = SPACE_HEALTH[id]; R(`${roomName(id)}: ${lower1(h.why)}`, `With ${pFirst(h.who)} · P${h.prio}`, `/incidents/${h.item.slice(4).toLowerCase()}/`, { item: h.item }); }
      const due = dueAt(office);
      if (due) R(`Replace ${due} ${due === 1 ? 'device' : 'devices'} due this year`, `The work plan · ${sites[office]?.name ?? ''}`, `/refresh/?site=${office}&due=over,now`);
      break;
    }
    case 'delivery': case 'network': case 'innovation': {
      logRows();
      if (p.roleId === 'innovation') for (const l of Object.values(labTests).filter((x) => x.status === 'passed')) R(l.title, `${l.id} · passed, waiting for the service owner`, `/lab/#${l.id.toLowerCase()}`);
      break;
    }
    case 'desk': {
      for (const it of ITEMS.filter((x) => x.kind === 'incident' && INC_EXTRA[x.id]?.hold)) {
        const d = Math.floor(INC_EXTRA[it.id].ageH / 24);
        if (d >= 3) R(it.title, `${it.id.slice(4)} · on hold, open ${d} days · with ${pFirst(it.who[0])}`, `/incidents/${it.id.slice(4).toLowerCase()}/`, { item: it.id });
      }
      break;
    }
    case 'sm-av': case 'sm-infra': {
      if (p.roleId === 'sm-av') {
        for (const l of Object.values(labTests).filter((x) => x.status === 'passed')) R(l.title, `${l.id} · passed in the Lab, yours to decide`, `/lab/#${l.id.toLowerCase()}`);
        for (const k of KNOWLEDGE.slice(0, 3)) out.push({ title: k.title, sub: `Known error · ${k.sub}`, href: k.href });
      } else for (const prj of Object.values(projects).filter((x) => x.phase !== 'closed' && ['network-refresh', 'infra-refresh'].includes(x.kind))) {
        const G = nextGate(prj);
        if (G && !G.signed) R(`${G.phase} gate, ${prj.name}`, `${fmtShort(G.date)} · ${G.signer} signs`, `/projects/${prj.id.toLowerCase()}/`);
      }
      break;
    }
    case 'pm': case 'programme': {
      for (const prj of Object.values(projects).filter((x) => x.phase !== 'closed' && (p.roleId === 'programme' || x.owner === p.id))) {
        const G = nextGate(prj);
        if (G && !G.signed && Math.round((Date.parse(G.date) - Date.parse(DEMO_TODAY)) / 864e5) <= 14) R(`${G.phase} gate, ${prj.name}`, `${fmtShort(G.date)}${G.late ? ` · ${G.slip} days over` : ''} · ${G.signer} signs`, `/projects/${prj.id.toLowerCase()}/`);
      }
      logRows();
      break;
    }
    case 'head': {
      for (const prj of Object.values(projects).filter((x) => x.phase !== 'closed')) {
        const L = lights(prj), bad = [L.schedule, L.cost, L.scope].filter((l) => l.state === 'bad');
        if (bad.length) R(prj.name, bad.map((l) => l.why).join(' '), `/projects/${prj.id.toLowerCase()}/`);
      }
      break;
    }
    case 'vendor': case 'service-vendor': {
      for (const prj of (p.projects ?? []).map((x) => projects[x]).filter(Boolean)) for (const s of prj.spaces ?? []) if (s.state === 'snags') R(`${roomName(s.space)}: snags to clear`, `${prj.id} ${prj.name}${s.note ? ` · ${s.note}` : ''}`, '/vendor/');
      break;
    }
    default: {
      const team = teamOf(p);
      for (const it of ITEMS.filter((x) => x.kind === 'task' && x.status === 'blocked' && x.who.some((w) => team.includes(w))).slice(0, 8)) out.push({ title: it.title, sub: `${pFirst(it.who[0])} · waiting on ${lower1(it.blocked ?? 'something')}`, href: it.href, item: it.id });
    }
  }
  return out;
}
export const REVIEW = Object.fromEntries(PEOPLE.map((p) => [p.id, reviewFor(p)]));

// ---- Welcome back, and the hand over for cover (design notes) ------------------------------------------------------
// Who covers whom while they are away: the first colleague in the same role (Marcus covers Anna).
export const coverOf = (p) => PEOPLE.find((x) => x.id !== p.id && x.roleId === p.roleId && !x.vendor)?.id ?? null;
const scopeSites = (p) => (p.roleId === 'tech' ? [p.office] : p.region ? SITE_ORDER.filter((s) => sites[s].region === p.region) : SITE_ORDER);
function welcomeFor(p) {
  if (p.vendor || p.roleId === 'head') return null;
  const inScope = new Set(scopeSites(p)), cover = coverOf(p);
  const mineOpen = ITEMS.filter((it) => it.who.includes(p.id) && ['incident', 'task', 'lab'].includes(it.kind) && it.status !== 'done' && (it.kind !== 'task' || it.status !== 'todo' || (it.end && it.end <= '2026-10-05')));
  const open = mineOpen.map((it) => ({ item: it.id, title: it.title, sub: [it.room ? roomName(it.room) : null, it.project].filter(Boolean).join(' · '), to: it.href, park: PARKED_SEED[it.id]?.park ?? null, note: cover && it.kind === 'incident' && it.status !== 'todo' ? `${pFirst(cover)} covered it while you were away` : null }));
  const handled = Object.values(incidents).filter((inc) => inc.state === 'resolved').map((inc) => ({ inc, res: [...inc.history].reverse().find((h) => h.state === 'resolved') }))
    .filter(({ inc, res }) => res && res.at.slice(0, 10) >= AWAY_FROM && (inScope.has(spaces[inc.subject.room]?.site) || inc.keia_atlas?.assigned === p.id))
    .sort((a, b) => b.res.at.localeCompare(a.res.at))
    .map(({ inc, res }) => ({ title: inc.short_description, sub: `${inc.number} · ${fmtShort(res.at)} · ${pName(res.by ?? inc.keia_atlas?.assigned)}`, to: href(`/incidents/${inc.number.toLowerCase()}/`), note: res.resolution?.notes ? `What fixed it: ${firstSentence(res.resolution.notes)}` : null }));
  const changed = [];
  for (const prj of Object.values(projects).filter((x) => x.phase !== 'closed' && (x.owner === p.id || (x.roles ?? []).some((r) => r.person === p.id)))) {
    for (const h of prj.history ?? []) if (h.ended && h.ended >= AWAY_FROM) {
      const slip = Math.round((Date.parse(h.ended) - Date.parse(h.planned)) / 864e5);
      changed.push({ at: h.ended, title: `${PHASE_WORD[h.phase] ?? h.phase} gate passed, ${prj.name}`, sub: `${fmtShort(h.ended)}${slip > 0 ? `, ${slip} ${slip === 1 ? 'day' : 'days'} after plan` : slip < 0 ? `, ${-slip} ${slip === -1 ? 'day' : 'days'} early` : ', on plan'} · signed by ${pName(h.signed_off_by)}`, to: href(`/projects/${prj.id.toLowerCase()}/`) });
    }
    for (const l of prj.log ?? []) if (l.raised && l.raised >= AWAY_FROM) changed.push({ at: l.raised, title: `${LOG_WORD[l.kind] ?? 'Note'}: ${l.title}`, sub: `${prj.id} · ${fmtShort(l.raised)} · ${pName(l.owner)}`, to: href(`/projects/${prj.id.toLowerCase()}/`) });
    for (const c of prj.changes ?? []) if (c.raised && c.raised >= AWAY_FROM) changed.push({ at: c.raised, title: `Change proposed: ${c.title}`, sub: `${prj.id} · ${fmtShort(c.raised)} · ${pName(c.proposed_by)}`, to: href(`/projects/${prj.id.toLowerCase()}/`) });
  }
  changed.sort((a, b) => b.at.localeCompare(a.at));
  // Refreshers: a kind of procedure on your open tasks you have not done in 90 days opens with every step again.
  const doneBy = Object.values(projects).flatMap((prj) => (prj.tasks ?? []).filter((t) => t.owner === p.id && t.status === 'done').map((t) => ({ kind: t.kind, due: t.due })));
  const kinds = [...new Set(mineOpen.filter((it) => it.kind === 'task' && it.taskKind).map((it) => it.taskKind))];
  const refresh = kinds.map((k) => {
    const last = doneBy.filter((d) => d.kind === k && d.due).map((d) => d.due).sort().pop() ?? null;
    return { k, last, days: last ? Math.round((Date.parse(DEMO_TODAY) - Date.parse(last)) / 864e5) : null };
  }).filter((x) => x.days === null || x.days > 90).map((x) => ({ title: `${KIND_WORD[x.k] ?? x.k}: every step shows again`, sub: x.last ? `Last done by you ${fmtShort(x.last)}, ${x.days} days ago` : 'Not done by you in Keia Atlas before' }));
  const rules = AUTO.filter((a) => a.at.slice(0, 10) >= AWAY_FROM && inScope.has(a.site)).map((a) => ({ title: a.text, sub: `${a.number} · ${fmtShort(a.at)} · under ${a.rule.name}`, to: a.href }));
  return { cover, from: AWAY_FROM, to: DEMO_TODAY, days: 14, open, handled, changed, refresh, rules };
}
export const WELCOME = Object.fromEntries(PEOPLE.map((p) => [p.id, welcomeFor(p)]).filter(([, w]) => w));

// ---- Figures that do not change as you watch: projects and the vendor's contract dates ------------------------
function extraFor(p) {
  const own = (prj) => p.roleId === 'programme' || p.roleId === 'head' || prj.owner === p.id;
  const live = Object.values(projects).filter((prj) => prj.phase !== 'closed' && own(prj));
  const off = live.filter((prj) => { const L = lights(prj); return [L.schedule, L.cost, L.scope].some((l) => l.state === 'bad'); });
  const gatesWeek = live.filter((prj) => { const G = nextGate(prj); return G && !G.signed && Math.round((Date.parse(G.date) - Date.parse(DEMO_TODAY)) / 864e5) <= 7; }).length;
  const late = live.flatMap((prj) => prj.tasks.filter((t) => t.status !== 'done' && t.due && t.due < DEMO_TODAY)).length;
  const risks = live.flatMap((prj) => (prj.log ?? []).filter((l) => l.kind === 'risk' && l.status === 'open')).length;
  const vendorPrj = (p.projects ?? []).map((x) => projects[x]).filter(Boolean);
  return {
    projects: live.length, onPlan: live.length - off.length, off: off.length, gatesWeek, late, risks,
    vendorSpaces: vendorPrj.flatMap((x) => x.spaces ?? []).length,
    vendorLate: vendorPrj.flatMap((x) => x.tasks.filter((t) => t.owner === p.id && t.status !== 'done' && t.due && t.due < DEMO_TODAY)).length,
  };
}
export const EXTRA = Object.fromEntries(PEOPLE.map((p) => [p.id, extraFor(p)]));

/** The cockpit's part of the Home blob. */
export function cockpitData() {
  return {
    now: DEMO_NOW, own: OWN, history: HISTORY, inc: INC_EXTRA, spaceHealth: SPACE_HEALTH, siteHealth: SITE_HEALTH,
    auto: AUTO.filter((a) => a.at.slice(0, 10) === DEMO_TODAY), changed: CHANGED, knowledge: KNOWLEDGE, review: REVIEW, welcome: WELCOME,
    targets: TARGET_H, matchRule: MATCH_RULE, extra: EXTRA,
    offices: SITE_ORDER.filter((s) => sites[s].kind !== 'remote'),
  };
}
