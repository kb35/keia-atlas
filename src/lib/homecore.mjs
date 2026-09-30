// The rules behind Home: which group a piece of work sits in (Today,
// This week, Later, Done), how a person's day is laid out in order, and how a piece of work is worded.
// Pure: no data is loaded here, so the rules are tested on their own (tests/home.test.mjs).
// src/lib/home.mjs feeds it Keia Atlas's work items (src/lib/work.mjs) at build time, and the Home page
// runs the same rules again in the browser for whoever is viewing.
import { hoursPerDay, isWeekend, addDays } from './workcore.mjs';

export const GROUPS = { today: 'Today', week: 'This week', later: 'Later', done: 'Done today' };
export const GROUP_ORDER = ['today', 'week', 'later', 'done'];

const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

// Which group a piece of work belongs in for a person's list. Incidents and reports waiting on you are
// live now, so they are Today whatever their date; a task is Today when due today or overdue, This week
// when due within seven days, otherwise Later. A work-plan item (a year-long window) is always Later.
export function bucketOf(it, today) {
  if (it.status === 'done') return 'done';
  if (it.kind === 'incident' || it.kind === 'inbox') return 'today';
  if (it.kind === 'refresh' || it.kind === 'plan') return 'later';
  if (it.kind === 'time-off') return null;
  const at = it.kind === 'task' ? it.end : it.start;
  if (!at) return 'later';
  const n = days(today, at);
  if (n <= 0 || (it.start && it.start <= today && it.end >= today)) return 'today';
  return n <= 7 ? 'week' : 'later';
}

// The order inside a group: what is live first, then the soonest, then blocked last inside a day.
const KIND_RANK = { incident: 0, inbox: 1, task: 2, lab: 3, visit: 4, refresh: 5, plan: 6 };
export function listOrder(a, b) {
  const ka = KIND_RANK[a.kind] ?? 9, kb = KIND_RANK[b.kind] ?? 9;
  if (ka !== kb) return ka - kb;
  if (a.kind === 'incident') return (a.prio ?? 9) - (b.prio ?? 9);
  const da = a.end ?? a.start ?? '9999', db = b.end ?? b.start ?? '9999';
  if (da !== db) return da < db ? -1 : 1;
  return (a.status === 'blocked') - (b.status === 'blocked') || a.title.localeCompare(b.title);
}

// A person's open work, grouped. Work-plan items (one per room and year) fold into one line per site,
// so ten rooms due at the Dublin office read as "Replace 14 devices due at the Dublin office" with one link.
export function groupFor(items, personId, today) {
  const mine = items.filter((it) => it.who.includes(personId) && it.status !== 'done' && it.kind !== 'time-off');
  const folded = [], plans = new Map();
  for (const it of mine) {
    if (it.kind !== 'refresh') { folded.push(it); continue; }
    const k = `${it.site}:${it.end?.slice(0, 4) ?? ''}`;
    const row = plans.get(k) ?? { ...it, id: `refresh:${it.site}:${it.end?.slice(0, 4) ?? ''}`, room: null, units: 0, hours: 0, rooms: 0, folded: true };
    row.units += it.units ?? 0; row.hours += it.hours ?? 0; row.rooms += 1;
    plans.set(k, row);
  }
  for (const row of plans.values()) folded.push({ ...row, title: `Replace ${row.units} ${row.units === 1 ? 'device' : 'devices'} due in ${row.end?.slice(0, 4) ?? 'the work plan'}` });
  const out = { today: [], week: [], later: [], done: [] };
  for (const it of folded) { const g = bucketOf(it, today); if (g && out[g]) out[g].push(it); }
  for (const g of Object.keys(out)) out[g].sort(listOrder);
  return out;
}

// ---- The day ----------------------------------------------------------------------------------------
// Where a person is today, in words, from the Schedule's placeOn().
// "Dublin office" reads as "the Dublin office" in a sentence; a remote site's name stands as it is.
const theOffice = (n) => (n && / office$/.test(n) ? `the ${n}` : n);
export function placeWords(place, { siteName = () => null, roomName = () => null } = {}) {
  if (!place) return { kind: 'remote', text: 'Working remotely' };
  if (place.kind === 'away') return { kind: 'away', text: place.why === 'holiday' ? `Away: ${place.holiday?.name ?? 'public holiday'}` : place.why === 'weekend' ? 'Weekend' : `Away: ${place.off?.note || 'time off'}` };
  if (place.kind === 'office') return { kind: 'office', text: `At ${theOffice(siteName(place.site)) ?? 'the office'}` };
  if (place.kind === 'home') return { kind: 'home', text: `At home, ${roomName(place.place) ?? 'home office'}` };
  if (place.kind === 'visiting') return { kind: 'visiting', text: `Visiting ${roomName(place.place) ?? theOffice(siteName(place.site)) ?? 'another office'}` };
  return { kind: 'remote', text: 'Working remotely' };
}

// The order of the day: what takes the person's time today, laid end to end from `start` o'clock, each
// for the hours it takes that day (at least half an hour), until `end`. Incidents first (they are live),
// then tasks by due date (overdue first), then Lab work and visits. Anything past the end of the day is
// still listed, without a place on the bar. Times are a plan for the day, not bookings; the page says so.
const DAY_RANK = { incident: 0, task: 1, lab: 2, visit: 3, refresh: 4 };
export function planDay(items, personId, today, { start = 9, end = 18 } = {}) {
  const todays = items.filter((it) => it.who.includes(personId) && it.status !== 'done' && it.start && it.end && it.start <= today && it.end >= today
    && ['incident', 'task', 'lab', 'visit'].includes(it.kind))
    .sort((a, b) => (DAY_RANK[a.kind] ?? 9) - (DAY_RANK[b.kind] ?? 9) || (a.kind === 'incident' ? (a.prio ?? 9) - (b.prio ?? 9) : 0) || (a.end ?? '9').localeCompare(b.end ?? '9') || a.title.localeCompare(b.title));
  const out = [];
  let t = start;
  for (const it of todays) {
    const visitAllDay = it.kind === 'visit';
    const h = visitAllDay ? end - start : Math.max(0.5, Math.min(end - start, Math.round(hoursPerDay(it) * 2) / 2 || 1));
    const from = visitAllDay ? start : t, to = Math.min(end, from + h);
    const fits = from < end;
    out.push({ it, from: fits ? from : null, to: fits ? to : null, hours: h });
    if (!visitAllDay && fits) t = to;
  }
  return out;
}

export const clock = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
export const spanWords = (h) => (h >= 1 ? `${h % 1 ? h.toFixed(1) : h} h` : `${Math.round(h * 60)} min`);

// Due words for a task: "3 days late", "Today", "Tomorrow", "In 4 days", "12 Oct".
export function dueWords(it, today, fmt = (d) => d) {
  const at = it.kind === 'task' ? it.end : it.start;
  if (!at) return it.kind === 'refresh' ? 'This year' : '';
  const n = days(today, at);
  if (it.kind === 'incident') return n < 0 ? `Open ${-n} ${n === -1 ? 'day' : 'days'}` : 'Opened today';
  if (it.kind === 'refresh') return `By ${fmt(it.end)}`;
  if (n < 0) return `${-n} ${n === -1 ? 'day' : 'days'} late`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 7) return `In ${n} days`;
  return fmt(at);
}

// A working day near today (the Schedule's next working day), for links that need a weekday.
export const nextWorkingDay = (d) => { let x = d; while (isWeekend(x)) x = addDays(x, 1); return x; };
