// Room checks and planned maintenance (the Room checks capability, src/lib/modules.mjs): the plans in data/checks/
// turned into dated rounds per office, and each round as a work item for the Schedule and Home. Pure: the page passes
// the plans, the spaces, who does the checks at each office and the last hearing-loop tests, so tests run it alone.
//
// A round: { id, plan, name, site, date, spaces: [ids], minutes, who: [person], status }
//   status  done (a date before today: the demo counts it as done), overdue (a space-by-space check past its date),
//           due (today to seven days ahead) or planned (later)

const DAY = 864e5;
const WEEKDAY = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };
export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const addMonths = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
export const DUE_DAYS = 7;

/** The nth weekday of a month (week 1 is the first): nthWeekday(2026, 10, 1, 'tue') is 2026-10-06. */
export function nthWeekday(year, month, week, weekday) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const shift = (WEEKDAY[weekday] - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + shift + (week - 1) * 7)).toISOString().slice(0, 10);
}

/** The dates a plan with a fixed day falls on between two dates (inclusive). */
export function planDates(plan, from, to) {
  if (!plan.on) return [];
  const out = [];
  let y = +from.slice(0, 4), m = +from.slice(5, 7);
  for (let i = 0; i < 40; i++) {
    const inMonths = !plan.on.months || plan.on.months.includes(m);
    if (inMonths) { const d = nthWeekday(y, m, plan.on.week, plan.on.weekday); if (d >= from && d <= to) out.push(d); }
    if (`${y}-${String(m).padStart(2, '0')}` >= to.slice(0, 7)) break;
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** The spaces a plan covers: by space type, or every space whose accessibility record has a hearing loop. */
export function spacesFor(plan, spaces, loops = {}) {
  const t = plan.applies_to;
  return spaces.filter((s) => (t.space_types && t.space_types.includes(s.type)) || (t.hearing_loop && loops[s.id]));
}

const statusOf = (date, today, perSpace) => (date < today ? (perSpace ? 'overdue' : 'done') : date <= addDays(today, DUE_DAYS) ? 'due' : 'planned');

/** Every round between two dates. spaces: [{ id, site, type }]; techs: { site: personId }; loops: { spaceId: last test }. */
export function rounds(plans, { spaces, techs = {}, loops = {}, from, to, today }) {
  const out = [];
  for (const plan of plans) {
    const covered = spacesFor(plan, spaces, loops);
    if (plan.on) {
      const bySite = new Map();
      for (const s of covered) { if (!bySite.has(s.site)) bySite.set(s.site, []); bySite.get(s.site).push(s.id); }
      for (const date of planDates(plan, from, to)) for (const [site, ids] of bySite) {
        out.push({ id: `check:${plan.id}:${site}:${date}`, plan: plan.id, name: plan.name, site, date, spaces: ids, minutes: plan.minutes * ids.length, who: techs[site] ? [techs[site]] : [], status: statusOf(date, today, false) });
      }
    } else {
      // Space by space: due n months after its last check (the last hearing-loop test), overdue when that has passed.
      for (const s of covered) {
        const last = loops[s.id];
        if (!last) continue;
        const date = plan.every.unit === 'week' ? addDays(last, 7 * plan.every.n) : addMonths(last, plan.every.n);
        if (date > to) continue;
        out.push({ id: `check:${plan.id}:${s.id}`, plan: plan.id, name: plan.name, site: s.site, date, spaces: [s.id], minutes: plan.minutes, who: techs[s.site] ? [techs[s.site]] : [], status: statusOf(date, today, true), last });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.site.localeCompare(b.site) || a.plan.localeCompare(b.plan));
}

/** For one space: its next check (not done) and its last one (done), across every plan. */
export function checksForSpace(list, spaceId) {
  const mine = list.filter((r) => r.spaces.includes(spaceId));
  const next = mine.filter((r) => r.status !== 'done').sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  const done = mine.filter((r) => r.status === 'done');
  const last = done.length ? done[done.length - 1] : mine.find((r) => r.last) ? { date: mine.find((r) => r.last).last, name: mine.find((r) => r.last).name } : null;
  return { next, last, plans: [...new Set(mine.map((r) => r.plan))] };
}

/** The figures the Room checks page leads with. */
export function checksSummary(list, today) {
  const open = list.filter((r) => r.status !== 'done');
  const dueWeek = open.filter((r) => r.status === 'due');
  const overdue = open.filter((r) => r.status === 'overdue');
  return { due: dueWeek.length, dueSpaces: dueWeek.reduce((n, r) => n + r.spaces.length, 0), overdue: overdue.length, next: open.find((r) => r.date >= today) ?? null, open: open.length };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const short = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** The answer first: what is overdue, then what is due in the next seven days. */
export function checksAnswer(s) {
  const parts = [];
  if (s.overdue) parts.push(`${plural(s.overdue, 'check')} overdue`);
  if (s.due) parts.push(`${plural(s.dueSpaces, 'space')} to check in the next ${DUE_DAYS} days`);
  else if (s.next) parts.push(`next round ${short(s.next.date)}`);
  return parts.length ? parts.join(' · ') : 'No checks due';
}
export const dayWords = short;

/** A round as a work item (src/lib/workcore.mjs's shape), for the Schedule and Home; it belongs to its capability. */
export function checkItem(r, { link = (p) => p, siteName = (s) => s, spaceTitle = (s) => s } = {}) {
  const one = r.spaces.length === 1;
  return {
    id: r.id, kind: 'check', title: one ? `${r.name}: ${spaceTitle(r.spaces[0])}` : `${r.name}: ${plural(r.spaces.length, 'space')}, ${siteName(r.site)}`,
    who: r.who, site: r.site, room: one ? r.spaces[0] : null, start: r.date, end: r.date, hours: Math.round((r.minutes / 60) * 10) / 10,
    status: r.status === 'done' ? 'done' : 'todo', href: link(`/work/checks/#${r.id.replace(/:/g, '-')}`), project: null, where: 'onsite', feature: 'maintenance',
  };
}
