// On call (data/on-call/<region>.yaml): who answers out of hours, now and next, in words. Pure: pass the rota and a
// moment in UTC, so Team, Home, the incident band and the tests all read the same answer. Each rota's times are in
// its own time zone, so "now" is turned into that zone's wall clock first.

const DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_WORD = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const REGION_WORD = { emea: 'EMEA', amer: 'the Americas', apac: 'Asia Pacific' };

/** The wall clock in `tz` at the UTC moment `utc`, as "YYYY-MM-DDTHH:MM". */
export function localAt(tz, utc) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/** The UTC moment (ISO) when the wall clock in `tz` reads `local` ("YYYY-MM-DDTHH:MM"). */
export function utcOf(local, tz) {
  const guess = Date.parse(`${local}:00Z`);
  const seen = Date.parse(`${localAt(tz, guess)}:00Z`);
  return new Date(guess - (seen - guess)).toISOString();
}
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dayOf = (d) => DAY[new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay()];

/** Is `local` ("YYYY-MM-DDTHH:MM") out of hours for this rota? */
export function outOfHours(rota, local) {
  const o = rota.out_of_hours, day = dayOf(local), t = local.slice(11, 16);
  if (day === 'sat' || day === 'sun') return Boolean(o.weekends);
  return o.weekdays_from > o.weekdays_to ? t >= o.weekdays_from || t < o.weekdays_to : t >= o.weekdays_from && t < o.weekdays_to;
}

/** "weekdays from 19:00 to 07:00, and all weekend" */
export const hoursWords = (rota) => `weekdays ${rota.out_of_hours.weekdays_from} to ${rota.out_of_hours.weekdays_to}${rota.out_of_hours.weekends ? ', and all weekend' : ''}`;

/** "08:00 today", "tomorrow 08:00", "Monday 08:00" within the next week, else "Monday 12 Oct, 08:00"; `full` adds
    the date to a weekday. */
export function whenWords(local, fromLocal, { full = false } = {}) {
  const day = DAY_WORD[dayOf(local)], t = local.slice(11, 16);
  if (local.slice(0, 10) === fromLocal.slice(0, 10)) return `${t} today`;
  if (local.slice(0, 10) === addDays(fromLocal.slice(0, 10), 1)) return `tomorrow ${t}`;
  const d = new Date(`${local.slice(0, 10)}T00:00:00Z`);
  const soon = local.slice(0, 10) <= addDays(fromLocal.slice(0, 10), 7);
  return soon && !full ? `${day} ${t}` : `${day} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}, ${t}`;
}

/**
 * The rota at a moment: { now, next, upcoming, local, ooh }.
 *   now       { person, backup, from, until } for the week that holds the moment ("YYYY-MM-DDTHH:MM" local), or null
 *             when the rota has no week for it
 *   upcoming  the weeks after it, in order
 *   ooh       true when the moment is out of hours, so the person on call is the first to answer
 */
export function rotaAt(rota, utc) {
  const local = localAt(rota.time_zone, utc), at = rota.handover.at;
  const weeks = rota.weeks.map((w, i) => ({ ...w, start: `${w.from}T${at}`, end: `${rota.weeks[i + 1]?.from ?? addDays(w.from, 7)}T${at}` }));
  const i = weeks.findIndex((w) => w.start <= local && local < w.end);
  const now = i >= 0 ? { person: weeks[i].person, backup: weeks[i].backup, from: weeks[i].start, until: weeks[i].end, note: weeks[i].note ?? null } : null;
  const upcoming = weeks.filter((w) => w.start > local).map((w) => ({ person: w.person, backup: w.backup, from: w.start, until: w.end }));
  return { region: rota.region, name: rota.name, local, now, next: upcoming[0] ?? null, upcoming, ooh: outOfHours(rota, local) };
}

/**
 * One line for a person: "You're on call until Monday 08:00" when they are on call now, "You're backup on call until
 * Monday 08:00" when they back it up, "You're on call from Monday 5 Oct, 08:00" when their week is next; else null.
 */
const line = (kind, lead, when, until, rota, r) => ({ kind, lead, when, text: `${lead} ${when}`, until, region: rota.region, rota, r });
export function lineFor(personId, rotas, utc) {
  for (const rota of rotas) {
    const r = rotaAt(rota, utc);
    if (r.now?.person === personId) return line('now', "You're on call", `until ${whenWords(r.now.until, r.local)}`, r.now.until, rota, r);
    if (r.now?.backup === personId) return line('backup', "You're backup on call", `until ${whenWords(r.now.until, r.local)}`, r.now.until, rota, r);
  }
  for (const rota of rotas) {
    const r = rotaAt(rota, utc);
    if (r.next?.person === personId) return line('next', "You're on call", `from ${whenWords(r.next.from, r.local, { full: true })}`, r.next.until, rota, r);
  }
  return null;
}
