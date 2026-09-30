// Events in the experience centres as the pages show them, worked out once at build time (rules in src/lib/events.mjs).
//   events        every event, soonest first, each with its readiness checks, its state at the demo's moment, its
//                 rooms, its kit and, once it has run, its report
//   kit           the demo and loaner kit with each unit's state (in the store, booked, checked out) and bookings
//   eventWork     one work item per event (workcore.mjs's shape) for the Schedule and Home; it belongs to the Events
//                 capability (feature: 'events')
//   homeEvents    per technician, the events of the next two weeks with their line ("Briefing at 10:00: 1 check left")
//   liveIncident  the live event priority of an incident: an incident in an event room during an event is P1
// The demo's moment for events is 09:20 on the demo's today (DEMO_TODAY), before the day's briefing starts: the
// readiness states are as they stand then. The run of show on an event's page follows the clock in the browser.
import { spaces, sites, incidents, href, DEMO_TODAY, SITE_ORDER, modelName } from './data.mjs';
import { readRecords } from './capabilities-view.mjs';
import { PEOPLE } from './demo.mjs';
import { readiness, readinessState, readinessLine, homeLine, eventState, eventReport, kitBookings, kitState, livePriority, STATE_WORDS, KIT_WORDS, KIND_WORDS } from './events.mjs';

export const EVENT_NOW = `${DEMO_TODAY}T09:20`;
export const spaceTitle = (id) => { const s = spaces[id]; return s ? (s.number ? `${s.number} ${s.name}` : s.name) : id; };
const raw = readRecords('events').sort((a, b) => `${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`));
const kitFiles = readRecords('demo-kit');
export const kitUnits = kitFiles.flatMap((f) => f.units.map((u) => ({ ...u, site: f.site, keptIn: f.kept_in, keptInName: spaceTitle(f.kept_in), modelName: u.model ? modelName(u.model) : null })));
const kitById = Object.fromEntries(kitUnits.map((u) => [u.id, u]));
const person = (id) => PEOPLE.find((p) => p.id === id);
const fmtDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export const eventPath = (ev) => `/services/events/${ev.id.toLowerCase()}/`;
const KIND_SHORT = { 'executive-briefing': 'Briefing', 'customer-visit': 'Visit', 'partner-day': 'Partner day', 'innovation-day': 'Innovation day' };

export const events = raw.map((ev) => {
  const checks = readiness(ev, kitById, { roomName: spaceTitle });
  const state = eventState(ev, checks, EVENT_NOW);
  const past = ev.date < DEMO_TODAY;
  const report = past || state === 'ran' ? eventReport(ev, checks, { roomName: spaceTitle }) : null;
  return {
    ...ev, checks, state, stateWord: STATE_WORDS[state], readiness: readinessState(checks), readinessWord: STATE_WORDS[readinessState(checks)], line: readinessLine(checks),
    left: checks.filter((c) => !c.done).length, past, today: ev.date === DEMO_TODAY, upcoming: ev.date > DEMO_TODAY, day: fmtDay(ev.date), kindWord: KIND_WORDS[ev.kind], kindShort: KIND_SHORT[ev.kind],
    siteName: sites[ev.site]?.name ?? ev.site, tech: person(ev.technician), roomsNamed: ev.rooms.map((r) => ({ id: r, name: spaceTitle(r), to: `/rooms/${r}/` })),
    kit: (ev.demo_kit ?? []).map((b) => ({ ...b, ...kitById[b.unit], unit: b.unit })), report, to: eventPath(ev), homeLine: homeLine(ev, checks, KIND_SHORT[ev.kind]),
  };
});
export const eventById = Object.fromEntries(events.map((e) => [e.id, e]));
export const upcoming = events.filter((e) => !e.past);
export const history = events.filter((e) => e.past).reverse();

// ---- Demo kit ----------------------------------------------------------------------------------------------------------
export const bookings = kitBookings(raw);
export const kit = kitUnits.map((u) => {
  const s = kitState(u.id, bookings, EVENT_NOW);
  const mine = bookings.filter((b) => b.unit === u.id);
  const next = mine.find((b) => b.end > EVENT_NOW) ?? null;
  const charged = !u.battery || (u.charge_pct ?? 0) >= 80;
  const testedDays = Math.round((Date.parse(`${DEMO_TODAY}T00:00:00Z`) - Date.parse(`${u.tested}T00:00:00Z`)) / 864e5);
  return { ...u, st: s.st, stWord: KIT_WORDS[s.st], booking: s.booking, next, nextEvent: next ? eventById[next.event] : null, bookings: mine.length, charged, testedDays, tested14: testedDays <= 14,
    health: !charged || testedDays > 14 ? 'review' : 'fine' };
});

// ---- Work items for the Schedule and Home ----------------------------------------------------------------------------
export const eventWork = events.map((e) => ({
  id: `event:${e.id}`, kind: 'event', title: `${e.kindShort}: ${e.client.name}`, who: [e.technician], site: e.site, room: e.rooms[0] ?? null,
  start: e.date, end: e.date, hours: 6, status: e.past ? 'done' : 'booked', href: href(e.to), project: null, where: 'onsite', feature: 'events',
  at: e.start, until: e.end, state: e.readiness, stateWord: e.readinessWord, left: e.left, line: e.line,
}));

/** The events of the next two weeks for each person who is their technician, with the line for Home. */
export function homeEvents(days = 14) {
  const until = new Date(Date.parse(`${DEMO_TODAY}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
  return upcoming.filter((e) => e.date <= until).map((e) => ({
    id: e.id, who: [e.technician], title: e.title, line: e.today ? e.homeLine : `${e.kindShort} on ${e.day}: ${e.left ? `${e.left} ${e.left === 1 ? 'check' : 'checks'} left` : 'ready'}`,
    state: e.readiness, stateWord: `${{ ready: 'Fine', 'at-risk': 'To review', 'not-ready': 'Fault' }[e.readiness]} · ${e.readinessWord.toLowerCase()}`, missing: e.checks.filter((c) => !c.done).map((c) => c.missing), where: `${e.roomsNamed.map((r) => r.name.replace(/^\d+\.\d+ /, '')).slice(0, 2).join(', ')}${e.rooms.length > 2 ? ` and ${e.rooms.length - 2} more` : ''}, ${e.siteName}`,
    today: e.today, day: e.day, start: e.start, to: href(e.to),
  }));
}

// ---- Live event priority ---------------------------------------------------------------------------------------------
const incByNumber = new Map(Object.values(incidents).map((i) => [i.number, i]));
/** The incident's live event priority, if it was opened in an event room during an event: { pri, from, reason, event, eventTitle, to }. */
export function liveIncident(number) {
  const inc = incByNumber.get(number);
  const p = inc ? livePriority(inc, raw) : null;
  if (!p) return null;
  const ev = eventById[p.event];
  return { ...p, eventTitle: ev.title, to: ev.to };
}

// ---- The service's figures ---------------------------------------------------------------------------------------------
const ran = events.filter((e) => e.past);
export const eventFigures = {
  ready: ran.length ? (ran.filter((e) => e.readiness === 'ready').length / ran.length) * 100 : 100,
  lost: ran.length ? ran.reduce((n, e) => n + (e.report?.lost ?? 0), 0) / ran.length : 0,
};
export const eventsSummary = {
  upcoming: upcoming.length, today: events.filter((e) => e.today).length, atRisk: upcoming.filter((e) => e.readiness !== 'ready').length,
  kitOut: kit.filter((k) => k.st === 'out').length, kitToCharge: kit.filter((k) => !k.charged).length, ran: ran.length,
};
export { STATE_WORDS, KIND_WORDS, SITE_ORDER };
