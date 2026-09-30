// The Schedule's rules, with no data loaded (like workcore.mjs), so they run in the browser, at build
// time and in tests alike. The Schedule page (src/components/ScheduleViews.astro) feeds them the work
// items from src/lib/work.mjs, the people from demo.mjs and the events from the live layer.
//
// What is here:
//   dates        monday, weekDays, addWorkdays, workdaysIn
//   kinds        chipKind (the kind a chip shows: provision, install, configure, commission, visit...)
//   where        placeOn: where a person is on a day (time off, public holiday, a visit or on-site work,
//                an office day, their home office)
//   load         dayLoad, weekLoad, loadBand: hours booked against the hours a person has
//   people       reportsOf, teamOf, scopePeople: Me, My team, Everyone
//   assigning    assignRights, canAssign, unscheduled: what a manager can hand out, and to whom
//   live         baseOf, applyState: an item as the live layer's events have changed it
import { addDays, isWeekend, whereOn, hoursPerDay, HOURS_PER_DAY, ONSITE_KINDS } from './workcore.mjs';

export { HOURS_PER_DAY };

// ---- Dates ------------------------------------------------------------------------------------
const dow = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const monday = (d) => addDays(d, -((dow(d) + 6) % 7));
export const weekDays = (mon) => [0, 1, 2, 3, 4].map((i) => addDays(mon, i));
// Move forward (or back, with a negative n) by working days, skipping weekends.
export function addWorkdays(d, n) {
  let x = d, left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (isWeekend(x)) x = addDays(x, step);
  while (left > 0) { x = addDays(x, step); if (!isWeekend(x)) left--; }
  return x;
}
// Working days from `from` to `to`, both included.
export function workdaysIn(from, to) {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) if (!isWeekend(d)) n++;
  return n;
}

// ---- Kinds ------------------------------------------------------------------------------------
// What a chip says it is. The four Deploy steps keep their own colour; other project work is "task".
export const STEPS = ['provision', 'install', 'configure', 'commission'];
export const chipKind = (it) => (it.kind === 'task' ? (STEPS.includes(it.taskKind) ? it.taskKind : 'task') : it.kind);
export const KIND_WORDS = {
  provision: 'Provision', install: 'Install', configure: 'Configure', commission: 'Commission', task: 'Other project work',
  visit: 'Site visit', incident: 'Incident', lab: 'Lab test', refresh: 'Work plan', 'time-off': 'Time off', plan: 'Planning',
  inbox: 'Report', holiday: 'Public holiday', phase: 'Phase end', check: 'Room check',
};
export const KIND_ORDER = ['incident', 'provision', 'install', 'configure', 'commission', 'visit', 'check', 'task', 'lab', 'refresh', 'inbox', 'plan', 'phase', 'holiday', 'time-off'];
export const kindRank = (k) => { const i = KIND_ORDER.indexOf(k); return i < 0 ? 99 : i; };

// ---- Where someone is -------------------------------------------------------------------------
// A home office is a room at one of the remote sites ("rem-bray-01" is at "rem").
export const siteOfPlace = (place) => (place ? (/^(rem|ram|rap)-/.exec(place)?.[1] ?? place) : null);
export const holidayOn = (holidays, country, day) => holidays.find((h) => h.country === country && h.date === day) ?? null;
// Work that puts a person at a place: a site visit, or a task done at the room itself.
export const placesPerson = (it) => it.kind === 'visit' || (it.kind === 'task' && it.where === 'onsite' && ONSITE_KINDS.has(it.taskKind));

// Where a person is on a day. Returns { kind, place, site, why?, item?, holiday?, off? }:
//   away      time off, a public holiday where they work, or a weekend
//   visiting  at another site (or someone's home office) for a visit or on-site work
//   office    at their office on an office day
//   home      at their home office
//   remote    working somewhere Keia Atlas does not track
export function placeOn(person, day, { timeOff = [], holidays = [], items = [] } = {}) {
  const off = timeOff.find((o) => o.who === person.id && o.from <= day && o.to >= day && o.status !== 'pending');
  if (off) return { kind: 'away', place: null, site: null, why: 'time-off', off };
  if (isWeekend(day)) return { kind: 'away', place: null, site: null, why: 'weekend' };
  const hol = holidayOn(holidays, person.country, day);
  if (hol) return { kind: 'away', place: null, site: null, why: 'holiday', holiday: hol };
  const base = whereOn(person, day, []);
  const at = items.find((it) => placesPerson(it) && it.who.includes(person.id) && it.start && it.start <= day && it.end >= day && (it.room || it.site));
  if (at) {
    // At a home office the place is the room itself; at an office it is the site.
    const place = at.room && /^(rem|ram|rap)-/.test(at.room) ? at.room : at.site;
    const site = siteOfPlace(place);
    if (!(base.kind === 'office' && base.place === site)) return { kind: 'visiting', place, site, item: at.id };
  }
  return { ...base, site: siteOfPlace(base.place) };
}

// ---- Load -------------------------------------------------------------------------------------
// Items that take someone's time on a day: everything but time off, and work-plan items that have not
// been booked on a day yet (they are a year-long window, not work on any one day).
export const takesTime = (it) => it.kind !== 'time-off' && !(it.kind === 'refresh' && !it.booked);
// Hours a person has booked on one day: their work items, plus project time not yet split into tasks
// (`reserved`: [{ who, from, to, perDay, project }]).
export function dayLoad(personId, day, items, reserved = []) {
  if (isWeekend(day)) return 0;
  let h = 0;
  for (const it of items) if (takesTime(it) && it.who.includes(personId) && it.start && it.start <= day && it.end >= day) h += hoursPerDay(it);
  for (const r of reserved) if (r.who === personId && r.from <= day && r.to >= day) h += r.perDay;
  return h;
}
// The hours a person has on a day: a full day unless they are away.
export const dayCapacity = (place) => (place.kind === 'away' ? 0 : HOURS_PER_DAY);
// A person's day: where they are, the hours booked and the hours they have. Project time not yet in
// tasks is not booked on a day they are away (it moves to the days they are in); real work stays, so
// work planned on a day off shows up as too much.
export function personDay(person, day, ctx) {
  const place = placeOn(person, day, ctx);
  const away = place.kind === 'away';
  return { place, hours: dayLoad(person.id, day, ctx.items ?? [], away ? [] : ctx.reserved ?? []), cap: dayCapacity(place) };
}
export function weekLoad(person, mon, ctx) {
  let hours = 0, cap = 0;
  for (const d of weekDays(mon)) { const x = personDay(person, d, ctx); hours += x.hours; cap += x.cap; }
  return { hours: Math.round(hours * 10) / 10, cap };
}
// 0 nothing, 1 light (half or less), 2 busy, 3 full, 4 too much.
export const loadBand = (h, cap) => (h <= 0 ? 0 : cap <= 0 ? 4 : h <= cap * 0.5 ? 1 : h <= cap * 0.85 ? 2 : h <= cap * 1.05 ? 3 : 4);
export const LOAD_WORDS = ['Free', 'Light', 'Busy', 'Full', 'Too much'];

// ---- People: Me, My team, Everyone -----------------------------------------------------------
// Everyone who reports to a person, all the way down. Remembered per list of people.
const REPORTS = new WeakMap();
export function reportsOf(id, people) {
  const memo = REPORTS.get(people) ?? REPORTS.set(people, new Map()).get(people);
  if (memo.has(id)) return memo.get(id);
  const out = [], seen = new Set([id]);
  const walk = (m) => { for (const p of people) if (p.reportsTo === m && !seen.has(p.id)) { seen.add(p.id); out.push(p.id); walk(p.id); } };
  walk(id);
  memo.set(id, out);
  return out;
}
// A person's team: the people they manage; for a project manager, the people on the projects they run;
// otherwise their own manager and the people who share that manager. Always includes the person.
export function teamOf(id, people, projects = []) {
  const me = people.find((p) => p.id === id);
  if (!me) return [id];
  const below = reportsOf(id, people);
  if (below.length) return [id, ...below];
  if (me.roleId === 'pm') {
    const ids = new Set([id]);
    for (const p of projects) if (p.owner === id && p.phase !== 'closed') for (const x of p.people) ids.add(x);
    return [...ids];
  }
  if (me.vendor) return [id];
  const boss = me.reportsTo;
  if (!boss) return [id];
  return [...new Set([id, boss, ...people.filter((p) => p.reportsTo === boss).map((p) => p.id)])];
}
export function scopePeople(scope, id, people, projects = []) {
  if (scope === 'all') return new Set(people.map((p) => p.id));
  if (scope === 'team') return new Set(teamOf(id, people, projects));
  return new Set([id]);
}
// Which scope and view a role opens on (the brief's defaults): the people doing the work see their own
// week, their managers their team's week, the people running the programme the year, the desk the day.
export function defaultsFor(roleId) {
  if (['programme', 'head', 'sm-av', 'sm-infra'].includes(roleId)) return { scope: 'all', view: 'year' };
  if (roleId === 'desk') return { scope: 'all', view: 'day' };
  if (['eng-manager', 'pm-manager', 'tech-manager', 'delivery-manager'].includes(roleId)) return { scope: 'team', view: 'week' };
  return { scope: 'me', view: 'week' };
}

// ---- Assigning --------------------------------------------------------------------------------
// What a viewer may hand out: 'all' (head, delivery manager, programme manager), 'reports' (anyone who
// manages people: to those people), 'pm' (a project manager: their own projects' work, to the project
// team), or null.
export function assignRights(viewerId, people) {
  const me = people.find((p) => p.id === viewerId);
  if (!me || me.vendor) return null;
  if (['head', 'delivery-manager', 'programme'].includes(me.roleId)) return 'all';
  if (reportsOf(viewerId, people).length) return 'reports';
  if (me.roleId === 'pm') return 'pm';
  return null;
}
const regionsOf = (p) => (p?.covers?.length ? p.covers : p?.region ? [p.region] : null);
// May the viewer give this item to this person?
export function canAssign(viewerId, item, targetId, { people, projects = [] }) {
  const rights = assignRights(viewerId, people);
  if (!rights || !item || ['time-off', 'plan', 'inbox'].includes(item.kind)) return false;
  if (item.status === 'done') return false;
  if (rights === 'all') return true;
  if (rights === 'reports') return targetId === viewerId || reportsOf(viewerId, people).includes(targetId);
  const pr = item.project && projects.find((p) => p.id === item.project);
  return !!pr && pr.owner === viewerId && (pr.people.includes(targetId) || targetId === viewerId);
}
// Is this item the viewer's to hand out at all (whoever it goes to)? Work their people have, work of
// their own projects, or work with nobody on it in their regions.
export function canHandOut(viewerId, item, ctx) {
  const rights = assignRights(viewerId, ctx.people);
  if (!rights || !item || ['time-off', 'plan', 'inbox'].includes(item.kind) || item.status === 'done') return false;
  if (rights === 'all') return true;
  if (rights === 'pm') { const pr = item.project && ctx.projects.find((p) => p.id === item.project); return !!pr && pr.owner === viewerId; }
  const mine = new Set([viewerId, ...reportsOf(viewerId, ctx.people)]);
  if (item.who.some((w) => mine.has(w))) return true;
  if (item.who.length) return false;
  const regions = regionsOf(ctx.people.find((p) => p.id === viewerId));
  const region = item.site ? ctx.sites?.[item.site]?.region : null;
  return !regions || !region || regions.includes(region);
}
// What is waiting for someone to schedule it, for this viewer:
//   cover   a task whose owner is away on a day it is planned
//   nobody  work with nobody on it
//   book    work-plan swaps due this year, not yet booked on a day
// Each entry: { item, why, note }. Sorted: cover, then nobody, then book; by start date within each.
export function unscheduled(viewerId, ctx) {
  const { items, people, today, horizon, timeOff = [], holidays = [] } = ctx;
  const byId = new Map(people.map((p) => [p.id, p]));
  const out = [];
  for (const it of items) {
    if (it.status === 'done' || ['time-off', 'plan', 'inbox', 'lab', 'incident', 'visit'].includes(it.kind)) continue;
    if (!it.start || it.start > horizon || it.end < today) continue;
    if (!canHandOut(viewerId, it, ctx)) continue;
    if (!it.who.length) { out.push({ item: it, why: 'nobody', note: 'Nobody is on it yet' }); continue; }
    if (it.kind === 'refresh' && !it.booked) { out.push({ item: it, why: 'book', note: 'Not booked on a day yet' }); continue; }
    const owner = byId.get(it.who[0]);
    if (!owner) continue;
    const from = it.start < today ? today : it.start;
    const away = [];
    for (let d = from; d <= it.end; d = addDays(d, 1)) {
      if (isWeekend(d)) continue;
      const pl = placeOn(owner, d, { timeOff, holidays });
      if (pl.kind === 'away') away.push({ d, why: pl.why, holiday: pl.holiday });
    }
    if (away.length) out.push({ item: it, why: 'cover', note: `${owner.name} is away`, away });
  }
  const rank = { cover: 0, nobody: 1, book: 2 };
  return out.sort((a, b) => rank[a.why] - rank[b.why] || a.item.start.localeCompare(b.item.start) || a.item.id.localeCompare(b.item.id));
}

// ---- Live -------------------------------------------------------------------------------------
// The two fields the Schedule changes, as the live layer records them: `owner` (a person id, the same
// field the project page uses) and `start` (the first day). A work-plan item starts unbooked (null).
export const baseOf = (it) => ({ owner: it.who[0] ?? null, start: it.kind === 'refresh' ? null : it.start });
// The item after its events: the new owner first in `who`, and a new start that keeps the same number of
// working days (a booked work-plan item takes whole days for its hours).
export function applyState(it, state) {
  const base = baseOf(it);
  let out = it;
  if ('owner' in state && state.owner !== base.owner) {
    const rest = it.who.slice(1).filter((w) => w !== state.owner);
    out = { ...out, who: state.owner ? [state.owner, ...rest] : rest };
  }
  if ('start' in state && state.start && state.start !== base.start) {
    const days = it.kind === 'refresh' ? Math.max(1, Math.ceil((it.hours ?? HOURS_PER_DAY) / HOURS_PER_DAY)) : Math.max(1, workdaysIn(it.start, it.end));
    out = { ...out, start: state.start, end: addWorkdays(state.start, days - 1), booked: true, moved: true };
  }
  return out;
}
