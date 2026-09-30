// Every piece of work in Keia Atlas, in one shape (decision 0025), so Overview, Schedule and Home always
// agree. Built once at build time from project tasks, incidents, Lab tests, year-plan events, the
// service managers' inbox, time off, site visits and the units due in the work plan. The shape and the
// rules (defaults for start and where, the views by person, day, site and kind) are in workcore.mjs.
import { projects, incidents, labTests, plans, spaces, href, DEMO_TODAY, SITE_ORDER } from './data.mjs';
import { PEOPLE, INBOX_SEED } from './demo.mjs';
import { schedule, SITE_VISITS } from './schedule.mjs';
import { dueList, HOURS } from './refresh.mjs';
import { fromTask, fromIncident, fromLab, fromPlanEvent, fromInbox, fromTimeOff, fromVisit, fromRefresh, byPerson, byDay, bySite, byKind, whereOn } from './workcore.mjs';

export * from './workcore.mjs';

const roomSite = (id) => spaces[id]?.site ?? null;
const personOf = (id) => PEOPLE.find((p) => p.id === id);
const ctx = { roomSite, link: href, today: DEMO_TODAY, siteOf: (id) => personOf(id)?.office ?? null };

const items = [];
for (const p of Object.values(projects)) for (const t of p.tasks) items.push(fromTask(p, t, ctx));
for (const inc of Object.values(incidents)) items.push(fromIncident(inc, ctx));
for (const l of Object.values(labTests)) items.push(fromLab(l, ctx));
for (const plan of Object.values(plans)) plan.events.forEach((e, i) => items.push(fromPlanEvent(plan, e, i, ctx)));
for (const r of INBOX_SEED) items.push(fromInbox(r, ctx));
for (const o of schedule.pto) items.push(fromTimeOff(o, ctx));
SITE_VISITS.forEach((v, i) => items.push(fromVisit(v, i, ctx)));

// The work plan: units due this year or next, one item per room and year, given to the site's
// technician (or nobody yet, for home offices and sites without one).
const THIS_YEAR = +DEMO_TODAY.slice(0, 4);
const due = new Map();
for (const r of dueList) {
  const year = Math.max(r.due, THIS_YEAR);
  if (year > THIS_YEAR + 1) continue;
  const k = `${r.space.id}:${year}`;
  const row = due.get(k) ?? { room: r.space.id, site: r.space.site, year, units: 0, hours: 0 };
  const h = HOURS[r.cls] ?? { low: 0, high: 0 };
  row.units++; row.hours += (h.low + h.high) / 2;
  due.set(k, row);
}
for (const row of due.values()) {
  const tech = PEOPLE.find((p) => p.roleId === 'tech' && p.site === row.site);
  items.push(fromRefresh({ ...row, hours: Math.round(row.hours * 10) / 10, who: tech ? [tech.id] : [] }, ctx));
}

const siteRank = (s) => (s ? SITE_ORDER.indexOf(s) : 99);
items.sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999') || siteRank(a.site) - siteRank(b.site) || a.id.localeCompare(b.id));

export const work = items;
export const workById = new Map(items.map((it) => [it.id, it]));
export const workByPerson = byPerson(items);
export const workBySite = bySite(items);
export const workByKind = byKind(items);
// The two weeks from the demo's today, day by day (weekdays only).
export const nextTwoWeeks = (list = items) => byDay(list, { from: DEMO_TODAY, to: new Date(new Date(`${DEMO_TODAY}T00:00:00Z`).getTime() + 13 * 864e5).toISOString().slice(0, 10) });
// Where each person is on a day: office, home office, remote or away.
export const whereIs = (personId, day) => whereOn(personOf(personId), day, schedule.pto);
