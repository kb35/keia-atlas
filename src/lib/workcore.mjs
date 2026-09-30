// The one shape every piece of work takes (decision 0025), and the pure helpers around it. No data is
// loaded here, so the rules can be tested on their own; src/lib/work.mjs feeds it Keia Atlas's data.
//
// A work item:
//   { id, kind, title, who, site, room, start, end, hours, status, href, project, where }
//   id       unique and stable: "task:T-1204", "inc:INC0041198", "lab:LAB-07", "plan:fy2027:3",
//            "inbox:RPT-097", "off:s3", "visit:2", "refresh:nyc-20-05:2026". The live layer
//            (src/lib/live.mjs) uses the same ids for its events.
//   kind     task, incident, lab, plan, inbox, time-off, visit or refresh (WORK_KIND has the words)
//   who      person ids, always a list (empty when it is everyone's, like a change freeze)
//   site     site id, or null when the work is not at one place
//   room     room id, or null
//   start    first day, YYYY-MM-DD (null when unknown); end is the last day, inclusive
//   hours    estimated hours (null when unknown)
//   status   todo, doing, blocked, done or booked (WORK_STATUS)
//   href     the page to open it
//   project  project id, or null
//   where    onsite or remote

export const HOURS_PER_DAY = 6;
export const WORK_KIND = {
  task: 'Project task', incident: 'Incident', lab: 'Lab test', plan: 'Planning', inbox: 'Inbox',
  'time-off': 'Time off', visit: 'Site visit', refresh: 'Work plan',
};
export const WORK_STATUS = { todo: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done', booked: 'Booked' };
// Work done at the room itself. Everything else can be done from anywhere.
export const ONSITE_KINDS = new Set(['survey', 'install', 'configure', 'commission', 'records']);

const DAY = 86400000;
const toDate = (d) => new Date(`${d}T00:00:00Z`);
export const iso = (t) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d, n) => iso(toDate(d).getTime() + n * DAY);
export const isWeekend = (d) => [0, 6].includes(toDate(d).getUTCDay());
export const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const weekday = (d) => WEEKDAY[toDate(d).getUTCDay()];

// Count back from `end` so the work fits in whole working days at HOURS_PER_DAY; weekends are skipped.
export function workBack(end, hours, perDay = HOURS_PER_DAY) {
  if (!end) return null;
  let left = Math.max(1, Math.ceil((hours ?? perDay) / perDay)) - 1;
  let d = end;
  while (left > 0) { d = addDays(d, -1); if (!isWeekend(d)) left--; }
  return d;
}
export const taskWhere = (t) => t.where ?? (ONSITE_KINDS.has(t.kind) ? 'onsite' : 'remote');
export const taskStart = (t) => t.start ?? workBack(t.due, t.hours);

// A project task. `ctx.roomSite(roomId)` says which site a room is at; `link` adds the site's base.
export function fromTask(project, t, { roomSite = () => null, link = (p) => p } = {}) {
  return {
    id: `task:${t.id}`, kind: 'task', title: t.title, who: [t.owner],
    site: (t.space && roomSite(t.space)) || project.site, room: t.space ?? null,
    start: taskStart(t), end: t.due ?? null, hours: t.hours ?? null, status: t.status,
    href: link(`/projects/${project.id.toLowerCase()}/tasks/${t.id.toLowerCase()}/`), project: project.id,
    where: taskWhere(t), taskKind: t.kind ?? null, phase: t.phase ?? null,
  };
}

const INC_STATUS = { new: 'todo', 'in-progress': 'doing', 'on-hold': 'blocked', resolved: 'done' };
// Rough effort by priority, for the load bars; the ticket system does not record it (demo figure).
export const INC_HOURS = { 1: 6, 2: 4, 3: 2, 4: 1 };
export function fromIncident(inc, { roomSite = () => null, link = (p) => p, today } = {}) {
  const resolved = [...inc.history].reverse().find((h) => h.state === 'resolved');
  const who = inc.keia_atlas?.assigned ?? [...inc.history].reverse().find((h) => h.by)?.by ?? null;
  return {
    id: `inc:${inc.number}`, kind: 'incident', title: inc.short_description, who: who ? [who] : [],
    site: roomSite(inc.subject.room), room: inc.subject.room, start: inc.opened.slice(0, 10),
    end: inc.state === 'resolved' && resolved ? resolved.at.slice(0, 10) : (today ?? inc.opened.slice(0, 10)),
    hours: INC_HOURS[inc.priority] ?? 2, status: INC_STATUS[inc.state] ?? 'todo',
    href: link(`/incidents/${inc.number.toLowerCase()}/`), project: null, where: 'onsite',
  };
}

const LAB_STATUS = { queued: 'todo', testing: 'doing', passed: 'done', failed: 'done', adopted: 'done' };
// A Lab test runs where its owner works. Without an end date it is planned to take three weeks.
export function fromLab(test, { siteOf = () => null, link = (p) => p } = {}) {
  return {
    id: `lab:${test.id}`, kind: 'lab', title: test.title, who: [test.owner, ...(test.with ?? [])],
    site: siteOf(test.owner), room: null, start: test.start, end: test.end ?? addDays(test.start, 20),
    hours: test.checks.length * 2, status: LAB_STATUS[test.status] ?? 'todo',
    href: link(`/lab/#${test.id.toLowerCase()}`), project: test.project ?? null, where: 'onsite',
  };
}

// Year-plan events: reviews, budget dates and change freezes. A freeze is everyone's.
export function fromPlanEvent(plan, e, i, { link = (p) => p, today } = {}) {
  const end = e.end ?? e.date;
  return {
    id: `plan:${plan.id}:${i}`, kind: 'plan', title: e.title, who: e.who ?? [], site: null, room: null,
    start: e.date, end, hours: e.kind === 'freeze' ? 0 : 2, status: today && end < today ? 'done' : 'booked',
    href: link('/work/schedule/?view=year'), project: null, where: 'remote', planKind: e.kind,
  };
}

// A report in a service manager's inbox: half an hour to read, decide and answer.
export function fromInbox(r, { roomSite = () => null, link = (p) => p } = {}) {
  const room = /^\/rooms\/([^/]+)\//.exec(r.about?.to ?? '')?.[1] ?? null;
  return {
    id: `inbox:${r.id}`, kind: 'inbox', title: `${r.about?.label ?? 'Report'}: ${r.kind}`, who: [r.to],
    site: room ? roomSite(room) : null, room, start: r.at.slice(0, 10), end: r.at.slice(0, 10), hours: 0.5,
    status: r.status === 'new' ? 'todo' : 'done', href: link('/#inbox'), project: null, where: 'remote', from: r.by,
  };
}

export function fromTimeOff(o, { link = (p) => p } = {}) {
  return {
    id: `off:${o.id}`, kind: 'time-off', title: o.note ? `Time off: ${o.note}` : 'Time off', who: [o.who],
    site: null, room: null, start: o.from, end: o.to, hours: 0, status: 'booked', href: link(`/work/schedule/?view=month&d=${o.from}`), project: null, where: 'remote',
  };
}

export function fromVisit(v, i, { link = (p) => p } = {}) {
  return {
    id: `visit:${i}`, kind: 'visit', title: v.title, who: v.who ?? [], site: v.site, room: null,
    start: v.date, end: v.end ?? v.date, hours: HOURS_PER_DAY, status: 'booked', href: link(`/work/schedule/?view=day&d=${v.date}`), project: null, where: 'onsite',
  };
}

// Units due in the work plan, one item per room and year: the room's technician does the swaps.
export function fromRefresh({ room, site, year, units, hours, who = [] }, { link = (p) => p, today } = {}) {
  const start = today && `${year}-01-01` < today ? today : `${year}-01-01`;
  return {
    id: `refresh:${room}:${year}`, kind: 'refresh', title: `Replace ${units} ${units === 1 ? 'device' : 'devices'} due in ${year}`, who,
    site, room, start, end: `${year}-12-31`, hours, status: 'todo', href: link('/refresh/'), project: null, where: 'onsite',
  };
}

// ---- Views over a list of items ---------------------------------------------------------------
const group = (items, keys) => {
  const m = new Map();
  for (const it of items) for (const k of keys(it)) { if (!m.has(k)) m.set(k, []); m.get(k).push(it); }
  return m;
};
export const byPerson = (items) => group(items, (it) => it.who);
export const bySite = (items) => group(items, (it) => (it.site ? [it.site] : []));
export const byKind = (items) => group(items, (it) => [it.kind]);
export const overlaps = (it, from, to) => Boolean(it.start && it.end) && it.start <= to && it.end >= from;
// Every day from `from` to `to` (inclusive), with the items that touch it. Weekends are left out
// unless `weekends` is true.
export function byDay(items, { from, to, weekends = false }) {
  const m = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) if (weekends || !isWeekend(d)) m.set(d, []);
  for (const it of items) {
    if (!overlaps(it, from, to)) continue;
    for (let d = it.start < from ? from : it.start; d <= it.end && d <= to; d = addDays(d, 1)) m.get(d)?.push(it);
  }
  return m;
}
// Hours a day: an item's hours spread over its working days (for load bars).
export const hoursPerDay = (it) => {
  if (!it.hours || !it.start || !it.end) return 0;
  let n = 0;
  for (let d = it.start; d <= it.end; d = addDays(d, 1)) if (!isWeekend(d)) n++;
  return it.hours / Math.max(1, n);
};

// Where a person is on a day: away (time off), at their office (an office day), at home (their home
// office), or working remotely from somewhere Keia Atlas does not track.
export function whereOn(person, day, timeOff = []) {
  if (timeOff.some((o) => o.who === person.id && o.from <= day && o.to >= day)) return { kind: 'away', place: null };
  if (isWeekend(day)) return { kind: 'away', place: null };
  if ((person.office_days ?? []).includes(weekday(day))) return { kind: 'office', place: person.office };
  if (person.home) return { kind: 'home', place: person.base };
  return { kind: 'remote', place: null };
}
