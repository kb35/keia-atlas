// The live simulation behind the Rooms and Devices overviews. Real feeds do not exist
// yet, so this makes up what they would say, from the data the site already has: each room's usage (how busy
// it is by weekday and hour, src/lib/usage.mjs), which rooms have video, each unit's kind and age, and the
// open incidents. Stage 2 replaces it with the real feeds: monitoring, room booking, occupancy sensors and
// device management.
//
// Everything here is a pure function of the model and a time, so every window (and every test) that asks
// about the same moment gets the same answer. Time moves in ticks of TICK_MS; a page asks for the state at
// the current tick, and the events are the differences between one tick and the next.
//
//   Rooms   An office is open 07:00 to 19:00 local time on weekdays (a home office 08:00 to 18:00). Each
//           room's day is cut into 30-minute blocks, shifted by a per-room offset so the changes spread out.
//           A block is in use with the room's usage share for that weekday and hour; some meetings end early;
//           in a room with video most meetings have a call, which starts a minute or so in and ends just
//           before the meeting does. A room has a problem while one of its units is offline or alerting, or
//           while it has an open incident.
//   Units   Units that report (they have a hostname) drop offline now and then for a few minutes, and raise an
//           alert now and then that clears itself. Older kit does both more often. A unit with an open
//           incident shows an alert until the incident is resolved. Some units run firmware behind the
//           standard; that does not change during the day.
//
// The model is built at build time by src/lib/livemodel.mjs; prepare() adds what the functions need.

export const TICK_MS = 5000;
export const BLOCK_MS = 30 * 60e3;
export const OFFICE_HOURS = [7, 19];
export const HOME_HOURS = [8, 18];
const MIN = 60e3, HOUR = 60 * MIN;
export const tickOf = (ms) => Math.floor(ms / TICK_MS) * TICK_MS;

// ---- Deterministic randomness: a number in [0, 1) from a seed, a salt and a block number ---------------------
export function seedOf(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function fmix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
export const rand = (seed, salt, n = 0) => fmix(seed ^ fmix(Math.imul(salt + 1, 0x9e3779b1) ^ (n >>> 0))) / 4294967296;
// Salts, one per decision, so no two decisions share their dice.
const S = { OFF: 1, USE: 2, EARLY: 3, LEN: 4, CALL: 5, CALLA: 6, CALLB: 7, SHARE: 8, DOWN: 20, ALERT: 30, WHICH: 40 };

// ---- Local time in a site's time zone -------------------------------------------------------------------
const fmts = new Map(), offsets = new Map();
function fmt(tz) {
  let f = fmts.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }); fmts.set(tz, f); }
  return f;
}
// Minutes ahead of UTC. Clocks change on a quarter hour at the latest, so the answer is kept per quarter hour.
export function tzOffset(tz, ms) {
  const key = `${tz}|${Math.floor(ms / 9e5)}`;
  let o = offsets.get(key);
  if (o === undefined) {
    const p = {};
    for (const x of fmt(tz).formatToParts(new Date(ms))) p[x.type] = x.value;
    o = Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - Math.floor(ms / MIN) * MIN) / MIN);
    if (offsets.size > 20000) offsets.clear();
    offsets.set(key, o);
  }
  return o;
}
// dow: 0 Sunday to 6 Saturday; h and m: the local hour and minute.
export function local(tz, ms) {
  const d = new Date(ms + tzOffset(tz, ms) * MIN);
  return { dow: d.getUTCDay(), h: d.getUTCHours(), m: d.getUTCMinutes() };
}
export const hhmm = (tz, ms) => { const t = local(tz, ms); return `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}`; };
export function openAt(tz, ms, hours = OFFICE_HOURS) {
  const t = local(tz, ms);
  return t.dow >= 1 && t.dow <= 5 && t.h >= hours[0] && t.h < hours[1];
}
// When a site next opens or closes (to the quarter hour), or null if not within four days.
export function nextSwitch(tz, ms, hours = OFFICE_HOURS) {
  const now = openAt(tz, ms, hours);
  let t = Math.floor(ms / 9e5) * 9e5 + 9e5;
  for (let i = 0; i < 4 * 24 * 4; i++, t += 9e5) if (openAt(tz, t, hours) !== now) return t;
  return null;
}

// ---- How busy a room is at a local weekday and hour ------------------------------------------------------
// Rooms with a usage record carry its weekday-by-hour grid (08:00 to 18:00), coded one character an hour,
// 0 to z for 0 to 100%. Rooms without one follow a curve for their kind, by hour from 07:00.
const CURVE = {
  shared: [0.15, 0.35, 0.45, 0.5, 0.5, 0.8, 0.85, 0.5, 0.45, 0.4, 0.3, 0.15],
  desks: [0.2, 0.55, 0.75, 0.8, 0.8, 0.65, 0.75, 0.8, 0.75, 0.65, 0.45, 0.2],
  office: [0.1, 0.4, 0.55, 0.6, 0.6, 0.35, 0.55, 0.6, 0.5, 0.4, 0.25, 0.1],
  home: [0, 0.7, 0.8, 0.8, 0.8, 0.5, 0.75, 0.8, 0.75, 0.6, 0.35, 0],
};
export const heatCode = (grid) => grid.flat().map((v) => Math.round(Math.max(0, Math.min(100, v)) / 100 * 35).toString(36)).join('');
export function useShare(r, dow, h) {
  if (dow < 1 || dow > 5) return 0;
  if (r.heat) {
    if (h >= 8 && h < 18) return parseInt(r.heat[(dow - 1) * 10 + (h - 8)], 36) / 35;
    return h === 7 || h === 18 ? 0.1 : 0;
  }
  return CURVE[r.cur]?.[h - 7] ?? 0;
}

// ---- Units: what can go wrong, and how often ----------------------------------------------------------
// [chance of dropping offline in an hour, chance of an alert in two hours]. Older kit doubles both.
const RATE = {
  'network-switch': [0.008, 0.06], 'video-bar': [0.04, 0.07], codec: [0.035, 0.07], 'touch-controller': [0.045, 0.05],
  'scheduler-panel': [0.05, 0.06], 'signage-player': [0.06, 0.07], display: [0.03, 0.05], printer: [0.04, 0.12],
  'av-switcher': [0.03, 0.05], 'desk-video-device': [0.04, 0.06],
};
const RATE0 = [0.035, 0.05];
export const ALERTS = {
  'video-bar': ['Camera not detected', 'Microphone not detected', 'Running hot', 'Not reporting to device management'],
  codec: ['Display not detected', 'Camera not detected', 'Running hot'],
  'touch-controller': ['Lost its pairing with the room system', 'Not reporting to device management'],
  'scheduler-panel': ['Calendar not syncing', 'Screen not responding'],
  'signage-player': ['Content out of date', 'Display not responding'],
  display: ['No signal on the input in use', 'Running hot', 'Not answering its control port'],
  'network-switch': ['Power over Ethernet near its limit', 'Fan fault', 'Port errors rising', 'Running hot'],
  printer: ['Toner low', 'Paper jam', 'Not reporting to monitoring'],
  'av-switcher': ['Input signal lost', 'Not answering its control port'],
  'desk-video-device': ['Camera not detected', 'Not reporting to device management'],
};
const ALERTS0 = ['Not reporting to monitoring', 'Running hot'];

// An episode (an outage, an alert): in each block of `len`, shifted per unit, it happens with chance p,
// starts somewhere in the first `startMin` minutes and lasts minDur plus up to spanDur minutes. It may run
// into the next block, so the block before is checked too.
function episode(seed, salt, ms, len, p, startMin, minDur, spanDur) {
  const off = Math.floor(rand(seed, salt) * len);
  const idx = Math.floor((ms - off) / len);
  for (let k = idx; k >= idx - 1; k--) {
    if (!(rand(seed, salt + 1, k) < p)) continue;
    const start = k * len + off + Math.floor(rand(seed, salt + 2, k) * startMin) * MIN;
    const end = start + Math.round((minDur + rand(seed, salt + 3, k) * spanDur)) * MIN;
    if (ms >= start && ms < end) return { start, end, k };
  }
  return null;
}

// ---- Preparing the model ------------------------------------------------------------------------------
// model: { sites: [{ id, tz, remote }], units: [{ id, cls, old, inc }], rooms: [{ id, site, tz?, heat?, cur?,
// video, inc, units, home? }], incs: [...] }. Adds seeds, rates, time zones and hours. Safe to call twice.
export function prepare(model) {
  if (model.__ready) return model;
  for (const u of model.units) {
    const [down, alert] = RATE[u.cls] ?? RATE0, k = u.old ? 2 : 1;
    u.seed = seedOf(`unit:${u.id}`); u.pDown = down * k; u.pAlert = alert * k; u.alerts = ALERTS[u.cls] ?? ALERTS0;
  }
  for (const r of model.rooms ?? []) {
    r.seed = seedOf(`room:${r.id}`);
    r.tz ??= model.sites[r.site]?.tz;
    r.hours = r.home ? HOME_HOURS : OFFICE_HOURS;
    r.callShare = 0.5 + rand(r.seed, S.SHARE) * 0.4;
  }
  model.__ready = true;
  return model;
}

// ---- One unit at one time ------------------------------------------------------------------------------
// { down: bool, al: index into the unit's alerts or -1, since, until, inc: incident index or -1, st }
export function unitAt(u, ms) {
  const d = episode(u.seed, S.DOWN, ms, HOUR, u.pDown, 50, 1, 6);
  const a = episode(u.seed, S.ALERT, ms, 2 * HOUR, u.pAlert, 100, 3, 15);
  const al = a ? Math.floor(rand(u.seed, S.WHICH, a.k) * u.alerts.length) : -1;
  const inc = u.inc ?? -1;
  const st = d ? 'offline' : al >= 0 || inc >= 0 ? 'alert' : 'online';
  return { st, down: !!d, al, inc, since: d ? d.start : a ? a.start : null, until: d ? d.end : a ? a.end : null };
}

// ---- One room at one time ------------------------------------------------------------------------------
function meeting(r, idx) {
  const off = Math.floor(rand(r.seed, S.OFF) * BLOCK_MS);
  const start = idx * BLOCK_MS + off;
  if (!openAt(r.tz, start, r.hours)) return null;
  const t = local(r.tz, start);
  if (!(rand(r.seed, S.USE, idx) < useShare(r, t.dow, t.h))) return null;
  const early = rand(r.seed, S.EARLY, idx) < 0.3;
  const end = start + (early ? Math.round(12 + rand(r.seed, S.LEN, idx) * 14) * MIN : BLOCK_MS);
  let call = null;
  if (r.video && rand(r.seed, S.CALL, idx) < r.callShare) {
    const a = start + Math.round((0.5 + rand(r.seed, S.CALLA, idx) * 3) * 60) * 1000;
    const b = end - Math.round(rand(r.seed, S.CALLB, idx) * 3 * 60) * 1000;
    if (b > a + MIN) call = [a, b];
  }
  return { start, end, call };
}
const blockOf = (r, ms) => Math.floor((ms - Math.floor(rand(r.seed, S.OFF) * BLOCK_MS)) / BLOCK_MS);

// unitSt: the states of the model's units at the same time (for problems).
// { st: 'use' | 'free' | 'problem' | 'closed', open, use, call, why: { unit, inc } | null }
export function roomAt(r, ms, unitSt = []) {
  const open = openAt(r.tz, ms, r.hours);
  let use = false, call = false;
  if (open) {
    const m = meeting(r, blockOf(r, ms));
    if (m && ms < m.end) { use = true; call = !!m.call && ms >= m.call[0] && ms < m.call[1]; }
  }
  // The worst thing wrong: a unit offline, then a unit alerting, then an open incident on the room.
  // `why` carries what it says about the unit at this moment, so an event can be put in words later.
  let why = null;
  for (const i of r.units ?? []) {
    const u = unitSt[i]; if (!u || u.st === 'online') continue;
    const rank = u.down ? 0 : u.al >= 0 ? 1 : 2;
    if (!why || rank < why.rank) why = { rank, unit: i, down: u.down, al: u.al, inc: u.inc, since: u.since };
  }
  if (!why && (r.inc ?? -1) >= 0) why = { rank: 3, inc: r.inc, since: null };
  const st = why ? 'problem' : !open ? 'closed' : use ? 'use' : 'free';
  return { st, open, use, call, why };
}

// How long a room stays as it is: the end of this run of meetings, or the start of the next one (within six
// hours, while the site is open). For the peek card: "In use until about 14:30", "Free until 15:00".
export function roomUntil(r, ms) {
  let idx = blockOf(r, ms), m = meeting(r, idx);
  if (m && ms < m.end) {
    while (m && m.end === m.start + BLOCK_MS) { const n = meeting(r, idx + 1); if (!n) break; m = n; idx++; }
    return { use: true, t: m.end };
  }
  for (let k = 1; k <= 12; k++) {
    const n = meeting(r, idx + k);
    if (n) return { use: false, t: n.start };
  }
  return { use: false, t: null };
}

// ---- Everything at one time, and what changed between two times --------------------------------------------
export function snapshot(model, ms) {
  prepare(model);
  const units = model.units.map((u) => unitAt(u, ms));
  const rooms = (model.rooms ?? []).map((r) => roomAt(r, ms, units));
  const sites = model.sites.map((s) => (s.tz && !s.remote ? openAt(s.tz, ms, OFFICE_HOURS) : null));
  return { t: ms, units, rooms, sites };
}

// Events, in the order they are listed: sites opening and closing, then rooms, then units.
//   site:  { k: 'open' | 'close', site }
//   room:  { k: 'use' | 'free' | 'call-on' | 'call-off' | 'problem' | 'clear', room, why? }
//   unit:  { k: 'offline' | 'online' | 'alert' | 'cleared', unit, al?, dur? (minutes) }
// A room going in or out of use because its office opened or closed says nothing of its own (the office
// does), and home offices only speak up when something is wrong with them.
export function diff(model, a, b) {
  const out = [], t = b.t;
  model.sites.forEach((s, i) => { if (a.sites[i] !== b.sites[i] && a.sites[i] !== null) out.push({ t, k: b.sites[i] ? 'open' : 'close', site: i }); });
  (model.rooms ?? []).forEach((r, i) => {
    const x = a.rooms[i], y = b.rooms[i];
    if (x.st !== 'problem' && y.st === 'problem') out.push({ t, k: 'problem', room: i, why: y.why });
    if (x.st === 'problem' && y.st !== 'problem') out.push({ t, k: 'clear', room: i });
    if (r.home || x.open !== y.open) return;
    if (x.use !== y.use) out.push({ t, k: y.use ? 'use' : 'free', room: i });
    if (x.call !== y.call) out.push({ t, k: y.call ? 'call-on' : 'call-off', room: i });
  });
  model.units.forEach((u, i) => {
    const x = a.units[i], y = b.units[i];
    if (!x.down && y.down) out.push({ t, k: 'offline', unit: i });
    if (x.down && !y.down) out.push({ t, k: 'online', unit: i, dur: x.since != null ? Math.max(1, Math.round((t - x.since) / MIN)) : null });
    if (x.al < 0 && y.al >= 0) out.push({ t, k: 'alert', unit: i, al: y.al });
    if (x.al >= 0 && y.al < 0) out.push({ t, k: 'cleared', unit: i, al: x.al });
  });
  return out;
}

// Every event after t0 up to and including t1, oldest first (t0 and t1 are rounded to ticks).
export function eventsBetween(model, t0, t1) {
  const out = [];
  let prev = snapshot(model, tickOf(t0));
  for (let t = tickOf(t0) + TICK_MS; t <= tickOf(t1); t += TICK_MS) {
    const cur = snapshot(model, t);
    for (const e of diff(model, prev, cur)) out.push(e);
    prev = cur;
  }
  return out;
}

// Counts for the band and the rows. `pick` chooses which rooms or units count.
export function countRooms(model, snap, pick = () => true) {
  const n = { use: 0, free: 0, problem: 0, closed: 0, call: 0, all: 0 };
  (model.rooms ?? []).forEach((r, i) => { if (!pick(r, i)) return; const s = snap.rooms[i]; n[s.st]++; n.all++; if (s.call) n.call++; });
  return n;
}
export function countUnits(model, snap, pick = () => true) {
  const n = { online: 0, offline: 0, alert: 0, fw: 0, all: 0 };
  model.units.forEach((u, i) => { if (!pick(u, i)) return; n[snap.units[i].st]++; n.all++; if (u.fw) n.fw++; });
  return n;
}
