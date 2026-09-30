// Events in the experience centres (the Events and experience centres service, src/lib/catalogue.mjs): client
// briefings and visits (data/events/), the demo and loaner kit booked to them (data/demo-kit/), the readiness checks
// generated before each one, the priority an incident takes when it happens in an event room during an event, and the
// report after it. Pure: no data is loaded, so the rules can be tested on small inputs (tests/events.test.mjs).
// src/lib/events-view.mjs wires it to the site's data. Every event, client and host is made up.
//
//   readiness(ev, kit, opts)   the checks for one event: every room's test, each demo kit unit charged and tested,
//                              content loaded, recording tested (when it is recorded) and a backup plan
//   readinessState(checks)     Ready (nothing left), At risk (one or two left) or Not ready (three or more)
//   liveEventAt(room, at, evs) the event running in a room at a moment, if any
//   livePriority(inc, evs)     an incident in an event room during the event is raised to P1: "live client briefing"
//   kitBookings, canBook,      demo kit: bookable to events, with check-out and check-in, a clash when a unit is
//   checkOut, checkIn, kitState booked to two events at once
//   eventReport(ev)            what ran, any faults, the time lost and the lessons, taken from the record (never asked)

export const CHARGE_MIN = 80;        // a unit with a battery is charged at 80 percent or more
export const TESTED_WITHIN_DAYS = 14; // demo kit tested within 14 days of the event
export const ROOM_TEST_DAYS = 1;      // a room test counts on the event day or the day before

export const STATE_WORDS = { ready: 'Ready', 'at-risk': 'At risk', 'not-ready': 'Not ready', ran: 'Ran', live: 'Running now' };
export const STATE_GLYPH = { ready: 'fine', 'at-risk': 'review', 'not-ready': 'fault', ran: 'fine', live: 'progress' };
export const KIND_WORDS = { 'executive-briefing': 'Executive briefing', 'customer-visit': 'Customer visit', 'partner-day': 'Partner day', 'innovation-day': 'Innovation day' };

const DAY = 864e5;
const d0 = (d) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);
const daysBetween = (a, b) => Math.round((d0(b) - d0(a)) / DAY);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "2026-09-28T10:00" for an event's day and a time "10:00". */
export const at = (date, time) => `${date}T${time}`;
export const startOf = (ev) => at(ev.date, ev.start);
export const endOf = (ev) => at(ev.date, ev.end);

/** The readiness checks for one event. `kit` maps a kit id to its unit ({ n, name, battery, charge_pct, tested });
    `roomName(id)` names a room. Each check: { id, group, label, done, missing, at }. `missing` names what is left, in
    words for the At risk line: "demo kit unit 3 not charged". */
export function readiness(ev, kit = {}, { roomName = (id) => id } = {}) {
  const c = ev.checks ?? {};
  const out = [];
  for (const room of ev.rooms ?? []) {
    const when = c.room_tests?.[room] ?? null;
    const ok = !!when && daysBetween(when, ev.date) <= ROOM_TEST_DAYS && daysBetween(when, ev.date) >= 0;
    out.push({ id: `room:${room}`, group: 'rooms', label: `${roomName(room)} tested`, done: ok, at: when, missing: `${roomName(room)} not tested` });
  }
  for (const b of ev.demo_kit ?? []) {
    const k = kit[b.unit];
    if (!k) { out.push({ id: `kit:${b.unit}`, group: 'kit', label: `Demo kit ${b.unit}`, done: false, missing: `demo kit ${b.unit} not found` }); continue; }
    // A unit checked out to the event passed its charge and test checks on the way out: they stand as done then.
    if (k.battery) out.push({ id: `kit:${b.unit}:charge`, group: 'kit', label: `Demo kit unit ${k.n} charged`, done: !!b.out || (k.charge_pct ?? 0) >= CHARGE_MIN, at: b.out ?? k.charged_at ?? null, missing: `demo kit unit ${k.n} not charged` });
    const age = k.tested ? daysBetween(k.tested, ev.date) : null;
    out.push({ id: `kit:${b.unit}:test`, group: 'kit', label: `Demo kit unit ${k.n} tested`, done: !!b.out || (age != null && age >= 0 && age <= TESTED_WITHIN_DAYS), at: b.out ?? k.tested ?? null, missing: `demo kit unit ${k.n} not tested` });
  }
  out.push({ id: 'content', group: 'show', label: 'Content loaded', done: !!c.content, at: c.content ?? null, missing: 'content not loaded' });
  if (ev.recording) out.push({ id: 'recording', group: 'show', label: 'Recording tested', done: !!c.recording, at: c.recording ?? null, missing: 'recording not tested' });
  out.push({ id: 'backup', group: 'show', label: 'Backup plan written', done: !!c.backup_plan, at: null, missing: 'no backup plan', text: c.backup_plan ?? null });
  return out;
}

/** Ready, At risk or Not ready, from the checks left. */
export function readinessState(checks) {
  const left = checks.filter((c) => !c.done).length;
  return left === 0 ? 'ready' : left <= 2 ? 'at-risk' : 'not-ready';
}
/** The line under a readiness state: "Ready: every check done", "At risk: demo kit unit 3 not charged". */
export function readinessLine(checks) {
  const left = checks.filter((c) => !c.done);
  const st = readinessState(checks);
  if (!left.length) return `${STATE_WORDS.ready}: all ${checks.length} checks done`;
  const list = left.slice(0, 2).map((c) => c.missing);
  return `${STATE_WORDS[st]}: ${list.join(', ')}${left.length > 2 ? ` and ${plural(left.length - 2, 'more check')}` : ''}`;
}
/** "Briefing at 10:00: 1 check left", for the technician's Home. */
export function homeLine(ev, checks, kindWord = 'Briefing') {
  const left = checks.filter((c) => !c.done).length;
  return `${kindWord} at ${ev.start}: ${left ? `${plural(left, 'check')} left` : 'ready'}`;
}

/** Where an event stands at a moment: ran (over), live (running now) or its readiness. `now` is "YYYY-MM-DDTHH:MM". */
export function eventState(ev, checks, now) {
  if (now >= endOf(ev)) return 'ran';
  if (now >= startOf(ev)) return 'live';
  return readinessState(checks);
}

/** The agenda item running at a moment (the run of show on the day), or null. */
export function currentItem(ev, now) {
  if (String(now).slice(0, 10) !== ev.date) return null;
  const t = String(now).slice(11, 16);
  return (ev.agenda ?? []).find((a) => a.at <= t && t < a.until) ?? null;
}

// ---- Live event priority ----------------------------------------------------------------------------------------
/** The event running in a room at a moment ("YYYY-MM-DDTHH:MM"), or null. */
export function liveEventAt(room, when, events) {
  const t = String(when).slice(0, 16);
  return events.find((ev) => (ev.rooms ?? []).includes(room) && t >= startOf(ev) && t < endOf(ev)) ?? null;
}
export const LIVE_REASON = 'live client briefing';
/** An incident opened in an event room while the event is running is raised to P1, with its reason. Returns
    { pri: 1, from, reason, event } or null. An incident already at P1 keeps it, with the reason all the same. */
export function livePriority(inc, events) {
  const room = inc.subject?.room ?? inc.room;
  const ev = room ? liveEventAt(room, inc.opened, events) : null;
  if (!ev) return null;
  const kind = ev.kind === 'executive-briefing' || ev.kind === 'customer-visit' ? LIVE_REASON : `live ${KIND_WORDS[ev.kind]?.toLowerCase() ?? 'event'}`;
  return { pri: 1, from: inc.priority, reason: kind, event: ev.id };
}

// ---- Demo and loaner kit ---------------------------------------------------------------------------------------------
/** Every booking of every kit unit: [{ unit, event, date, start, end, out, back }], soonest first. */
export function kitBookings(events) {
  return events.flatMap((ev) => (ev.demo_kit ?? []).map((b) => ({ unit: b.unit, event: ev.id, title: ev.title, date: ev.date, start: startOf(ev), end: endOf(ev), out: b.out ?? null, back: b.back ?? null })))
    .sort((a, b) => a.start.localeCompare(b.start) || a.unit.localeCompare(b.unit));
}
const overlaps = (a, b) => a.start < b.end && b.start < a.end;
/** Can a unit be booked to an event? { ok, clash } where clash is the other event's id. Kit is booked from the start
    of the event's day (it is set up in the morning) to its end. */
export function canBook(unit, ev, events) {
  const want = { start: at(ev.date, '00:00'), end: endOf(ev) };
  for (const other of events) {
    if (other.id === ev.id || !(other.demo_kit ?? []).some((b) => b.unit === unit)) continue;
    const o = { start: at(other.date, '00:00'), end: endOf(other) };
    if (overlaps(want, o)) return { ok: false, clash: other.id };
  }
  return { ok: true, clash: null };
}
/** Book a unit to an event: the event with the unit added, or an Unable to complete reason. */
export function bookKit(unit, ev, events) {
  if ((ev.demo_kit ?? []).some((b) => b.unit === unit)) return { ok: false, why: `${unit} is already booked to this event` };
  const c = canBook(unit, ev, events);
  if (!c.ok) return { ok: false, why: `${unit} is booked to ${c.clash} at the same time` };
  return { ok: true, event: { ...ev, demo_kit: [...(ev.demo_kit ?? []), { unit }] } };
}
/** Check a booked unit out, then back in. Each returns the new booking, or { ok: false, why }. */
export function checkOut(b, when) {
  if (b.out) return { ok: false, why: `already checked out at ${b.out.slice(11, 16)}` };
  return { ok: true, booking: { ...b, out: when } };
}
export function checkIn(b, when) {
  if (!b.out) return { ok: false, why: 'not checked out yet' };
  if (b.back) return { ok: false, why: `already checked in at ${b.back.slice(11, 16)}` };
  if (when < b.out) return { ok: false, why: 'checked in before it was checked out' };
  return { ok: true, booking: { ...b, back: when } };
}
/** A unit's state at a moment: out (checked out, not back), booked (a booking to come), or in the store. */
export function kitState(unit, bookings, now) {
  const mine = bookings.filter((b) => b.unit === unit);
  const out = mine.find((b) => b.out && !b.back && b.out <= now);
  if (out) return { st: 'out', booking: out };
  const next = mine.find((b) => !b.out && b.end > now);
  if (next) return { st: 'booked', booking: next };
  return { st: 'in', booking: null };
}
export const KIT_WORDS = { out: 'Checked out', booked: 'Booked', in: 'In the store' };

// ---- The report after an event -------------------------------------------------------------------------------------
/** What ran, any faults, the time lost and the lessons: taken from the record (the run of show, the incidents and the
    readiness checks), never asked for. Returns { ran, planned, faults, lost, lessons }. */
export function eventReport(ev, checks = [], { roomName = (id) => id } = {}) {
  const r = ev.report ?? {};
  const planned = (ev.agenda ?? []).length;
  const dropped = new Set(r.dropped ?? []);
  const ran = (ev.agenda ?? []).filter((a) => !dropped.has(a.title)).length;
  const faults = (r.faults ?? []).map((f) => ({ ...f, minutes: f.minutes ?? 0 }));
  const lost = faults.reduce((n, f) => n + f.minutes, 0);
  const lessons = [];
  for (const f of faults) if (f.lesson) lessons.push(f.lesson);
  // Lessons the record shows on its own: a room tested less than an hour before its first agenda item, kit that was
  // not charged at the start, an agenda item that was dropped.
  for (const room of ev.rooms ?? []) {
    const t = ev.checks?.room_tests?.[room];
    const first = (ev.agenda ?? []).find((a) => a.room === room);
    if (t && first && t.slice(0, 10) === ev.date) {
      const gap = (Date.parse(`${ev.date}T${first.at}:00Z`) - Date.parse(`${t}:00Z`)) / 60e3;
      if (gap < 60) lessons.push(`${roomName(room)} was tested ${Math.max(0, Math.round(gap))} minutes before it was used: test it the afternoon before`);
    }
  }
  const unready = checks.filter((c) => !c.done && c.group === 'kit');
  if (unready.length) lessons.push(`${unready.map((c) => c.missing).join(', ')} at the start: charge and test kit the day before`);
  for (const t of dropped) lessons.push(`"${t}" was dropped from the run of show`);
  return { ran, planned, faults, lost, lessons: [...new Set(lessons)] };
}
