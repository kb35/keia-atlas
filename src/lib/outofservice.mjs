// Out of service (the Out of service capability, src/lib/modules.mjs): which spaces are out now, why and until when,
// who is told, and the space to offer instead. The records in data/out-of-service/ are where the demo starts; taking a
// space out or bringing it back on its page is kept in this browser (localStorage rs7-oos, the 'storage' event keeps
// other windows in step). The notices to the booking system and to the people booked in are simulated: there is no
// booking feed. Pure and loads nothing, so the build, the pages' scripts and the tests all use it.

export const KEY = 'rs7-oos';
export const EVENT = 'rs:oos-change';

/** Which spaces are out of service: the seed records, with this browser's changes on top (the latest wins).
    changes: { [space]: { out: true, reason, since, until, by } | { out: false, at } } */
export function outNow(seed = [], changes = {}) {
  const out = {};
  for (const r of seed) out[r.space] = { ...r, seeded: true };
  for (const [space, c] of Object.entries(changes || {})) {
    if (!c || typeof c !== 'object') continue;
    if (c.out) out[space] = { space, reason: c.reason, since: c.since, until: c.until, by_role: c.by ?? 'tech', alternative: c.alternative ?? out[space]?.alternative ?? null, notice: { booking_system: true, people_booked: true, room_guide: true } };
    else delete out[space];
  }
  return out;
}

// A seeded random number, so a space's simulated bookings are the same in every window.
const seedOf = (s) => [...String(s)].reduce((n, c) => (Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
const rnd = (seed) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
const mins = (t) => Date.parse(`${t}:00Z`) / 60000;

/** The bookings a space loses while it is out (simulated): meetings on working days 08:00 to 18:00 between two local
    times (from now to its expected return), a few a day, each with a count of people (never names). */
export function lostBookings(space, from, until, { seats = 8 } = {}) {
  const out = [];
  const r = rnd(seedOf(`oos:${space}`));
  const a = mins(from), b = mins(until);
  for (let t = Math.ceil(a / 30) * 30; t < b && out.length < 60; t += 30) {
    const d = new Date(t * 60000), h = d.getUTCHours() + d.getUTCMinutes() / 60, wd = d.getUTCDay();
    if (wd === 0 || wd === 6 || h < 8 || h >= 18) continue;
    if (out.length && out[out.length - 1].end > t) continue;
    if (r() >= 0.18) continue;
    const len = [30, 60, 60, 90][Math.floor(r() * 4)];
    out.push({ start: t, end: t + len, people: Math.max(2, Math.min(seats, 2 + Math.floor(r() * (seats - 1)))) });
  }
  return out;
}

/** What was sent, in words (every line simulated). */
export function noticeLines(rec, { spaceName = rec.space, altName = null, bookings = [] } = {}) {
  const people = bookings.reduce((n, b) => n + b.people, 0);
  const lines = [];
  if (rec.notice?.booking_system !== false) lines.push(`The booking system blocks ${spaceName} until ${whenWords(rec.until)}${bookings.length ? ` and ${altName ? `moves ${bookings.length === 1 ? 'the booking' : `${bookings.length} bookings`} to ${altName}` : `cancels ${bookings.length === 1 ? 'the booking' : `${bookings.length} bookings`}`}` : ''}`);
  if (rec.notice?.people_booked !== false && bookings.length) lines.push(`${people} ${people === 1 ? 'person' : 'people'} booked in ${people === 1 ? 'is' : 'are'} told by email, with the reason${altName ? ' and the new room' : ''}`);
  if (rec.notice?.room_guide !== false) lines.push('The room guide and the panel by the door say it is out of service');
  return lines;
}

/** A local time in words: "Thu 1 Oct, 17:00". */
export function whenWords(t) {
  if (!t) return '';
  const d = new Date(`${t}:00Z`);
  return `${d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${t.slice(11, 16)}`;
}

/** The working spaces to offer instead: the same kind of space in the same office, not out of service themselves,
    the same floor first, then the nearest in size. candidates: [{ id, site, floor, type, seats }] */
export function alternativesFor(space, candidates, out = {}) {
  return candidates.filter((c) => c.id !== space.id && c.site === space.site && c.kind === space.kind && !out[c.id])
    .sort((a, b) => (a.floor === space.floor ? 0 : 1) - (b.floor === space.floor ? 0 : 1) || (a.type === space.type ? 0 : 1) - (b.type === space.type ? 0 : 1) || Math.abs((a.seats ?? 0) - (space.seats ?? 0)) - Math.abs((b.seats ?? 0) - (space.seats ?? 0)) || a.id.localeCompare(b.id));
}

// ---- In the browser ---------------------------------------------------------------------------------------------------
export function readChanges(store = globalThis.localStorage) {
  try { return JSON.parse(store.getItem(KEY) || '{}') || {}; } catch (_) { return {}; }
}
export function writeChange(space, change, store = globalThis.localStorage) {
  const all = readChanges(store);
  all[space] = change;
  try { store.setItem(KEY, JSON.stringify(all)); } catch (_) {}
  if (globalThis.document) globalThis.document.dispatchEvent(new CustomEvent(EVENT, { detail: { space } }));
  return all;
}
