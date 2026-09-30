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
  delivery: () => 'Delivery engineer: room designs, commissioning and the next device.',
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
        T(blocked, 'Blocked', listLink({ kind: TASK_KINDS, person: id, status: 'blocked' }), { id: 'blocked', tone: blocked ? 'bad' : undefined }),
        p.roleId === 'innovation'
          ? T(Object.values(labTests).filter((l) => ['testing', 'queued'].includes(l.status)).length, 'Lab tests under way', '/lab/?status=testing,queued', { id: 'lab' })
          : T(inst, 'Rooms being installed on your projects', `/rooms/?status=installing${ss.length ? `&site=${ss.join(',')}` : ''}`, { id: 'rooms' }),
      ];
    }
    case 'sm-av': case 'sm-infra': {
      const passed = Object.values(labTests).filter((l) => l.status === 'passed').length;
      return [
        T(inboxN(id), 'For your approval', listLink({ kind: 'inbox', person: id }), { id: 'approval', tone: inboxN(id) ? 'warn' : undefined }),
        T(ITEMS.filter((it) => it.kind === 'incident').length, 'Open incidents', `/incidents/?state=${OPEN_INC}`, { id: 'inc' }),
        T(installing.length, 'Rooms being installed', '/rooms/?status=installing', { id: 'rooms' }),
        p.roleId === 'sm-av' ? T(passed, 'Lab passes to decide', '/lab/?status=passed', { id: 'lab', tone: passed ? 'warn' : undefined })
          : T(commsRooms.length, 'Comms rooms', '/rooms/?kind=comms', { id: 'comms' }),
      ];
    }
    case 'pm': {
      const ps = runs(id), bl = blockedOn(ps).length;
      return [
        T(ps.length, 'Your projects', `/projects/?owner=${id}`, { id: 'projects' }),
        T(bl, 'Blocked on your projects', blockedLink(id), { id: 'blocked', tone: bl ? 'bad' : undefined }),
        T(tasks.length, 'Your tasks', taskTo, { id: 'tasks' }),
        T(todayN(id), 'Today', dayLink(id), { id: 'today' }),
      ];
    }
    case 'programme': case 'head': {
      const live = Object.values(projects).filter((x) => x.phase !== 'closed');
      const blAll = ITEMS.filter((it) => it.kind === 'task' && it.status === 'blocked').length;
      if (p.roleId === 'head') return [
        T(totals.offices, 'Offices', '/locations/', { id: 'sites' }),
        T(totals.spaces, 'Rooms', '/rooms/', { id: 'rooms' }),
        T(totals.units, 'Devices', '/devices/', { id: 'devices' }),
        T(ITEMS.filter((it) => it.kind === 'incident').length, 'Open incidents', `/incidents/?state=${OPEN_INC}`, { id: 'inc' }),
      ];
      return [
        T(live.length, 'Live projects', `/projects/?phase=${livePhases.join(',')}`, { id: 'projects' }),
        T(blAll, 'Blocked tasks', listLink({ kind: TASK_KINDS, status: 'blocked' }), { id: 'blocked', tone: blAll ? 'bad' : undefined }),
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
        T(inc.filter((i) => !i.matched).length, 'Not matched to a room', undefined, { id: 'unmatched', fact: true }),
      ];
    }
    case 'vendor': case 'service-vendor': {
      const ps = (p.projects ?? []).map((x) => projects[x]).filter(Boolean);
      const rooms = ps.flatMap((x) => x.spaces ?? []);
      return [
        T(rooms.length, 'Rooms in your installation', '/vendor/', { id: 'rooms' }),
        T(tasks.length, 'Your tasks', '/vendor/#tasks', { id: 'tasks' }),
        T(todayN(id), 'Today', dayLink(id), { id: 'today' }),
        T(rooms.filter((r) => r.state === 'snags').length, 'Rooms with snags', '/vendor/', { id: 'snags' }),
      ];
    }
    default: {   // the people managers
      const team = teamOf(p), teamTasks = ITEMS.filter((it) => it.kind === 'task' && it.who.some((w) => team.includes(w)));
      const bl = teamTasks.filter((it) => it.status === 'blocked').length;
      const onSite = team.filter((w) => ['office', 'visiting'].includes(PLACE[w]?.kind)).length, away = team.filter((w) => PLACE[w]?.kind === 'away').length;
      return [
        T(teamTasks.length, 'Open tasks in your team', listLink({ kind: TASK_KINDS, person: team.join(',') }), { id: 'tasks' }),
        T(bl, 'Blocked', listLink({ kind: TASK_KINDS, person: team.join(','), status: 'blocked' }), { id: 'blocked', tone: bl ? 'bad' : undefined }),
        T(onSite, 'On site today', '/work/schedule/?view=day&scope=team', { id: 'onsite' }),
        T(away, 'Away today', '/work/schedule/?view=day&scope=team#away', { id: 'away' }),
      ];
    }
  }
}
export const EVERYONE_NUMBERS = [
  T(INBOX_SEED.filter((x) => x.kind === 'urgent' && x.status !== 'done').length, 'Urgent', listLink({ kind: 'inbox', q: 'urgent' }), { id: 'urgent', tone: 'bad' }),
  T(installing.length, 'Rooms being installed', '/rooms/?status=installing', { id: 'rooms' }),
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
  };
}
export const groupsFor = (id) => groupFor(ITEMS, id, TODAY);
export { BY_ID as itemById };
