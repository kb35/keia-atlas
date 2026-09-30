// Usage (stage 2, simulated): how much each room and each device is used. Every number here is made
// up, generated from the room's or unit's own id so it is the same on every build. In real life each
// figure comes from a system the team already has; SOURCE says which kind, in generic words.
//
// Rooms: booked hours from room booking, occupied hours and headcount from occupancy sensing (a people
// counter or the video bar's own count). Never meeting titles or organisers: only in use or not, and
// how many people, in bands.
import { spaces, sites, models, incidents, KIND, SITE_ORDER, DEMO_TODAY, className, modelName, deviceName } from './data.mjs';
import { records, dueList, HOURS, NOW_YEAR, yearsBetween } from './refresh.mjs';

// ---------- Deterministic randomness: the same id always gives the same numbers ----------
const hash = (s) => [...String(s)].reduce((n, c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
export function rng(id) {
  let a = hash(id);
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const between = (r, lo, hi) => lo + r() * (hi - lo);
const round1 = (n) => Math.round(n * 10) / 10;

// Where each figure would come from. Generic kinds of system, no product names.
export const SOURCE = {
  booked: 'Room booking system: bookings for the space\'s calendar.',
  occupied: 'Occupancy sensing: a people counter in the space, or the video bar\'s own people count, matched against bookings.',
  noShow: 'Room booking against occupancy: a booking with nobody in the space after 10 minutes counts as a no-show.',
  headcount: 'Occupancy sensing: the number of people, reported only as a band. No names, no meeting titles, no organisers.',
  calls: 'Device management platform: call history from the video bar or codec (start, end, far ends). No call content.',
  display: 'Control system or device management: the display\'s power state, polled over its control port or the network.',
  signage: 'Signage manager: the player\'s set on and off schedule, and the panel power state it reports.',
  switch: 'Monitoring over SNMP: uptime, interface status and power over Ethernet draw, polled every five minutes.',
  lamp: 'The projector\'s own lamp hour counter, read over its control port.',
  incidents: 'Service desk: tickets raised against the space or its devices in the last 12 months.',
};

// ---------- Rooms ----------
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const DAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const HOUR0 = 8, HOURS_DAY = 10;             // 08:00 to 18:00 local, the bookable day
export const WEEK_H = HOURS_DAY * DAYS.length;       // 50 bookable hours a week
const DAY_F = [0.8, 1.05, 1.12, 1.05, 0.58];
const HOUR_F = [0.3, 0.72, 1.05, 1.08, 0.62, 0.66, 1.05, 1.08, 0.82, 0.42];
const MEAN_F = DAY_F.reduce((a, d) => a + HOUR_F.reduce((b, h) => b + d * h, 0), 0) / WEEK_H;
// How busy each office is overall (made up): the headquarters is busiest, the satellite quietest.
const SITE_F = { nyc: 1.14, dub: 1.06, lon: 1.02, chi: 0.95, tor: 0.86, sin: 1.02, mel: 0.82, tyo: 0.92, cph: 0.76, jnu: 0.62, rem: 0.5 };
export const SITE_WEIGHT = { headquarters: 1, regional: 0.8, office: 0.6, satellite: 0.4, remote: 0.2 };
export const SITE_ROLE = { headquarters: 'Headquarters', regional: 'Regional hub', office: 'Office', satellite: 'Satellite office', remote: 'Remote' };

const capOf = (s) => {
  const c = s.type.keia_atlas.capacity;
  return c ? (c.max ?? c.min ?? 1) : null;
};
export const bookable = (s) => ['meeting', 'small'].includes(KIND(s)) && s.space_type !== 'office' && capOf(s);

export const BANDS = ['1 to 2', '3 to 5', '6 to 10', '11 to 20', 'Over 20'];
export const bandOf = (n) => (n <= 2 ? 0 : n <= 5 ? 1 : n <= 10 ? 2 : n <= 20 ? 3 : 4);

export const FLAG = {
  over: { label: 'Over-used', long: 'Over-used: busy and full', tone: 'over' },
  under: { label: 'Under-used', long: 'Under-used', tone: 'under' },
  ghost: { label: 'Booked, empty', long: 'Booked but often empty', tone: 'ghost' },
};

function roomUsage(s) {
  const r = rng(`room:${s.id}`);
  const cap = capOf(s);
  const siteF = SITE_F[s.site] ?? 1;
  const pick = r();
  let kind = 'normal';
  if (pick < 0.12) kind = 'packed'; else if (pick < 0.21) kind = 'ghost'; else if (pick < 0.36) kind = 'quiet';
  const smallBoost = cap <= 5 ? 0.08 : cap >= 13 ? -0.06 : 0;
  let booked = kind === 'packed' ? between(r, 0.8, 0.94) : kind === 'ghost' ? between(r, 0.62, 0.82) : kind === 'quiet' ? between(r, 0.08, 0.24) : between(r, 0.34, 0.72) + smallBoost;
  booked = clamp(booked * (kind === 'normal' ? siteF : Math.sqrt(siteF)), 0.05, 0.96);
  const noShow = kind === 'ghost' ? between(r, 0.32, 0.48) : between(r, 0.05, 0.17);
  const walkIn = between(r, 0.0, 0.05);
  const occupied = clamp(booked * (1 - noShow) + walkIn * (1 - booked), 0.03, 0.95);
  // How full the room is when it's in use. Large rooms are often used by a few people.
  let ratio = kind === 'packed' ? between(r, 0.86, 1.12) : cap >= 13 ? between(r, 0.22, 0.62) : cap >= 8 ? between(r, 0.32, 0.8) : between(r, 0.45, 0.95);
  if (cap === 1) ratio = 1;
  const typical = Math.max(1, Math.round(cap * ratio));
  const peak = Math.max(typical, Math.min(cap + Math.ceil(cap * 0.25), Math.round(typical * between(r, 1.25, 1.7))));
  // Weekday by hour, share of the hour the room was occupied (0 to 100), averaged over four weeks.
  const heat = DAYS.map((_, d) => HOUR_F.map((hf) => Math.round(clamp((occupied * DAY_F[d] * hf / MEAN_F) * between(r, 0.8, 1.2)) * 100)));
  const occH = occupied * WEEK_H, bookH = booked * WEEK_H;
  const seatUse = occupied * clamp(typical / cap, 0, 1.2);   // seat-hours used over seat-hours available
  const fullShare = clamp(kind === 'packed' ? between(r, 0.55, 0.85) : ratio > 0.85 ? between(r, 0.3, 0.6) : ratio * between(r, 0.05, 0.3));
  let flag = null, why = '', act = '';
  if ((occupied >= 0.62 && typical / cap >= 0.8) || occupied >= 0.78) {
    flag = 'over';
    why = typical >= cap ? `In use ${Math.round(occupied * 100)}% of the working week, usually with ${typical} people in ${cap} seats.` : `In use ${Math.round(occupied * 100)}% of the working week: people struggle to find it free.`;
    act = 'A candidate for more space: a larger space, or another space of this space type on the floor. Protect it in any cut.';
  } else if (noShow >= 0.3) {
    flag = 'ghost';
    why = `Booked ${Math.round(bookH)} hours a week, but nobody turns up for ${Math.round(noShow * 100)}% of them.`;
    act = 'Release bookings nobody checks in to after 10 minutes before spending on the space.';
  } else if (occupied < 0.25 || (cap >= 8 && typical / cap < 0.4)) {
    flag = 'under';
    why = occupied < 0.25 ? `In use only ${Math.round(occupied * 100)}% of the working week.` : `Usually ${typical} people in a space for ${cap}.`;
    act = occupied < 0.25 ? 'A candidate for not refreshing, or for a lighter space type when it is due.' : 'A candidate for downsizing: two smaller spaces would serve the same meetings.';
  }
  return { cap, typical, peak, booked, occupied, noShow, bookH, occH, noShowH: booked * noShow * WEEK_H, seatUse, fullShare, heat, flag, why, act, kind };
}

export const roomList = Object.values(spaces).filter(bookable).map((s) => ({ s, site: sites[s.site], u: roomUsage(s) }))
  .sort((a, b) => b.u.occupied - a.u.occupied);
export const roomUse = Object.fromEntries(roomList.map((x) => [x.s.id, x.u]));

const avg = (list, f) => (list.length ? list.reduce((n, x) => n + f(x), 0) / list.length : 0);
function rollup(list) {
  return {
    rooms: list.length, seats: list.reduce((n, x) => n + x.u.cap, 0),
    occupied: avg(list, (x) => x.u.occupied), booked: avg(list, (x) => x.u.booked), noShow: avg(list, (x) => x.u.noShow), seatUse: avg(list, (x) => x.u.seatUse),
    over: list.filter((x) => x.u.flag === 'over').length, under: list.filter((x) => x.u.flag === 'under').length, ghost: list.filter((x) => x.u.flag === 'ghost').length,
  };
}
export const siteRoll = SITE_ORDER.map((id) => ({ id, site: sites[id], ...rollup(roomList.filter((x) => x.s.site === id)) })).filter((x) => x.rooms);
export const REGIONS = ['amer', 'emea', 'apac'];
export const regionRoll = REGIONS.map((r) => ({ id: r, ...rollup(roomList.filter((x) => x.site.region === r)) }));
export const allRoll = rollup(roomList);

// ---------- Equipment ----------
// Rated panel life for a commercial display, in hours of use (demo figure, typical of the market).
export const PANEL_LIFE = 50000;
const LAMP_LIFE = { 'brightline-px-2000': 2000, 'brightline-px-4500': 3000 };
const weeksSince = (d) => yearsBetween(d, DEMO_TODAY) * 52.18;

function schedule(s) {
  // Signage schedules: reception and lobby screens follow the working day; cafeteria screens run later.
  return ['cafeteria', 'pantry', 'pantry-expanded'].includes(s.space_type) ? { on: 7, off: 20, days: 5, label: '07:00 to 20:00, weekdays' } : { on: 7, off: 19, days: 5, label: '07:00 to 19:00, weekdays' };
}

function unitUsage(rec) {
  const { space: s, position: p, unit } = rec;
  const r = rng(`unit:${unit.serial}`);
  const room = roomUse[s.id];
  const cls = p.cls;
  const installed = unit.installed ?? DEMO_TODAY;
  const base = { tag: unit.asset_tag, name: deviceName(s, p), room: s.id, roomName: s.name, site: s.site, cls, model: p.model ?? null, older: Boolean(p.older), installed };
  if (['video-bar', 'codec', 'desk-video-device'].includes(cls)) {
    const share = between(r, 0.5, 0.9);
    const callH = room ? room.occH * share : between(r, 2, 9);
    const avgLen = between(r, 0.55, 0.95);
    const calls = Math.max(0, Math.round(callH / avgLen));
    const flag = callH < 4 ? { tone: 'under', text: 'Little used' } : callH > 26 ? { tone: 'over', text: 'Heavy use' } : null;
    return { ...base, kind: 'video', callH: round1(callH), calls, avgMin: Math.round(avgLen * 60), share: Math.round(share * 100), flag, source: SOURCE.calls };
  }
  if (cls === 'display' && LAMP_LIFE[p.model]) {
    const life = LAMP_LIFE[p.model];
    const lampH = Math.round(life * between(r, 0.55, 1.18));
    const onH = round1(room ? room.occH * 0.9 : between(r, 6, 14));
    const eos = models[p.model]?.lifecycle?.end_of_support ?? null;
    const flag = lampH >= life ? { tone: 'over', text: 'Lamp past rated hours' } : lampH >= life * 0.9 ? { tone: 'ghost', text: 'Lamp nearly spent' } : null;
    return { ...base, kind: 'projector', lampH, life, lampPct: Math.round((lampH / life) * 100), lampsFitted: 1 + Math.floor(yearsBetween(installed, DEMO_TODAY) * 52 * onH / life), onH, eos, flag, source: SOURCE.lamp };
  }
  if (cls === 'display') {
    const meeting = Boolean(room);
    const sleeps = r() > 0.1;
    const onH = round1(meeting ? (sleeps ? room.occH * 0.92 + room.noShowH * 0.25 + between(r, 0.5, 2.5) : between(r, 70, 168)) : sleeps ? between(r, 45, 62) : 168);
    const expected = meeting ? room.occH : 60;
    const flag = !sleeps ? { tone: 'ghost', text: meeting ? 'Stays on outside meetings' : 'Never switches off' } : null;
    const panelH = Math.round(onH * weeksSince(installed));
    return { ...base, kind: 'display', onH, expected: round1(expected), panelH, wear: Math.round((panelH / PANEL_LIFE) * 100), flag, source: SOURCE.display };
  }
  if (cls === 'signage-player') {
    const sch = schedule(s);
    const pick = r();
    const mode = pick < 0.34 ? 'never' : pick < 0.5 ? 'late' : 'ok';
    const offAt = mode === 'never' ? null : mode === 'late' ? Math.min(23, sch.off + 2 + Math.floor(r() * 3)) : sch.off;
    const weekends = mode === 'never' || r() < 0.2;
    const setH = (sch.off - sch.on) * sch.days;
    const actualH = mode === 'never' ? 168 : (offAt - sch.on) * sch.days + (weekends ? (offAt - sch.on) * 2 : 0);
    const panelH = Math.round(actualH * weeksSince(installed));
    const extraYear = Math.round((actualH - setH) * 52);
    const flag = mode === 'never' ? { tone: 'over', text: 'Never switches off' } : mode === 'late' || weekends ? { tone: 'ghost', text: 'Switches off late' } : null;
    return { ...base, kind: 'signage', schedule: sch, offAt, weekends, mode, setH, actualH, panelH, panelYear: actualH * 52, extraYear, wear: Math.round((panelH / PANEL_LIFE) * 100), flag, source: SOURCE.signage };
  }
  if (cls === 'network-switch') {
    const ports = models[p.model]?.ports?.filter((x) => x.connector === 'rj45').length || 24;
    const used = Math.min(ports, Math.max(1, Math.round(ports * between(r, 0.4, 0.97))));
    const budget = models[p.model]?.power?.poe_budget_w ?? (models[p.model]?.lifecycle?.end_of_support ? 370 : 740);
    const poeW = Math.round(budget * between(r, 0.2, 0.93));
    const uptimeD = Math.round(between(r, 6, 540));
    const avail = Math.round((100 - between(r, 0, 0.12) * (rec.older ? 3 : 1)) * 100) / 100;
    const availStr = avail >= 100 ? '100' : avail.toFixed(2);
    const flag = used / ports >= 0.95 && ports > 12 ? { tone: 'over', text: 'Ports nearly full' } : used === ports ? { tone: 'over', text: 'Every port in use' } : uptimeD > 400 ? { tone: 'ghost', text: 'No restart in over a year' } : poeW / budget > 0.85 ? { tone: 'over', text: 'Power over Ethernet near its limit' } : null;
    return { ...base, kind: 'switch', ports, used, budget, poeW, uptimeD, avail: availStr, flag, source: SOURCE.switch };
  }
  return null;
}

export const equipment = records.filter((r) => r.status !== 'retired').map(unitUsage).filter(Boolean);
export const equipmentByTag = Object.fromEntries(equipment.map((e) => [e.tag, e]));
export const EQUIP_KIND = { video: 'Video calls', display: 'Displays', signage: 'Signage', switch: 'Switches', projector: 'Projectors' };
const TAB = { video: 'video', display: 'displays', signage: 'signage', switch: 'switches', projector: 'projectors' };
const num = (v, d = 0) => v.toLocaleString('en-IE', { maximumFractionDigits: d });

// The small usage card on a device's own page: a few lines, the flag, and where it comes from.
export function usageCard(tag) {
  const e = equipmentByTag[tag];
  if (!e) return null;
  let lines = [];
  if (e.kind === 'video') lines = [['Call hours a week', num(e.callH, 1)], ['Calls a week', num(e.calls)], ['Average call', `${e.avgMin} min`], ...(roomUse[e.room] ? [['Meetings on a call', `${e.share}%`]] : [])];
  if (e.kind === 'display') lines = [['On a week', `${num(e.onH)} h`], [roomUse[e.room] ? 'Space in use a week' : 'Expected a week', `${num(e.expected)} h`], ['Panel hours since install', num(e.panelH)], ['Wear', `${e.wear}% of ${num(PANEL_LIFE)} h`]];
  if (e.kind === 'signage') lines = [['Set schedule', e.schedule.label], ['Actually', e.mode === 'never' ? 'On around the clock' : `Off at ${e.offAt}:00${e.weekends ? ', on at weekends' : ''}`], ['Hours a week', `${e.actualH} of ${e.setH} set`], ['Panel hours since install', `${num(e.panelH)} (${e.wear}% of rated)`]];
  if (e.kind === 'switch') lines = [['Uptime', `${e.uptimeD} days since restart`], ['Availability, 30 days', `${e.avail}%`], ['Ports in use', `${e.used} of ${e.ports}`], ['Power over Ethernet', `${e.poeW} of ${e.budget} W`]];
  if (e.kind === 'projector') lines = [['Lamp hours', `${num(e.lampH)} of ${num(e.life)} rated`], ['On a week', `${num(e.onH)} h`], ['Lamps since install', String(e.lampsFitted)], ...(e.eos ? [['End of support', e.eos.slice(0, 7)]] : [])];
  return { kind: e.kind, label: EQUIP_KIND[e.kind], tab: TAB[e.kind], lines, flag: e.flag, source: e.source };
}

// ---------- Scenarios: the work plan as packages of work, one per room ----------
// Demo unit prices in euros, per class, for costing the plan. Made up, round numbers.
export const PRICE = {
  display: 2400, monitor: 320, 'video-bar': 3600, codec: 6500, 'touch-controller': 900, camera: 1200, microphone: 450, amplifier: 800, loudspeaker: 350,
  'av-extender': 520, 'av-switcher': 1400, 'signage-player': 700, 'scheduler-panel': 600, 'network-switch': 4800, 'network-gateway': 260, adapter: 60, dock: 280,
  printer: 3200, 'desk-video-device': 2600, 'security-device': 900, 'building-sensor': 350,
};
export const HOUR_RATE = 95;

const eosState = (model) => {
  const d = models[model]?.lifecycle?.end_of_support;
  if (!d) return 0;
  if (d <= DEMO_TODAY) return 1;
  return yearsBetween(DEMO_TODAY, d) <= 1 ? 0.5 : 0;
};

function packageFor(s, recs) {
  const r = rng(`pkg:${s.id}`);
  const site = sites[s.site];
  const room = roomUse[s.id];
  const kind = KIND(s);
  const devices = recs.map((x) => ({ tag: x.unit.asset_tag, cls: x.cls, name: className(x.cls), model: x.model ? modelName(x.model) : null, ratio: x.dated ? x.yearsIn / x.life : 1, due: x.due, eos: x.model ? eosState(x.model) : 0, eosDate: x.model ? models[x.model]?.lifecycle?.end_of_support ?? null : null }));
  const cost = recs.reduce((n, x) => n + (PRICE[x.cls] ?? 500) + ((HOURS[x.cls].low + HOURS[x.cls].high) / 2) * HOUR_RATE, 0);
  const maxRatio = Math.max(...devices.map((d) => d.ratio));
  // Usage, 0 to 1: occupancy for bookable rooms; for others, how much depends on them.
  const usage = room ? room.occupied : kind === 'comms' ? between(r, 0.8, 0.95) : kind === 'shared' ? between(r, 0.45, 0.75) : kind === 'desks' ? between(r, 0.3, 0.6) : between(r, 0.15, 0.4);
  const realInc = Object.values(incidents).filter((i) => i.room === s.id).length;
  const incCount = realInc + Math.floor(r() * (1 + Math.min(2, maxRatio) * 2.2));
  const eos = Math.max(...devices.map((d) => d.eos));
  const projector = recs.map((x) => equipmentByTag[x.unit.asset_tag]).find((e) => e?.kind === 'projector' && e.lampPct >= 90);
  const failingPsu = kind === 'comms' && r() < 0.5;
  const mount = !projector && !failingPsu && r() < 0.08 && recs.some((x) => x.cls === 'display');
  const safety = projector ? `Projector lamp at ${projector.lampPct}% of its rated hours: a heat and failure risk.` : failingPsu ? 'Switch with a failed power supply: spaces on the floor run on the second one.' : mount ? 'Display mount flagged at the last inspection.' : null;
  const typeName = s.type.profile?.name ?? s.space_type;
  return {
    id: s.id, name: s.name, number: s.number ?? null, site: s.site, siteName: site.name, siteCode: site.code, region: site.region, role: site.role, profile: typeName,
    devices, count: devices.length, cost: Math.round(cost / 10) * 10,
    busiestHours: room ? Math.round(room.occH * 46) : null,
    f: {
      usage: round2(usage),
      age: round2(clamp((maxRatio - 0.6) / 1.4)),
      eos,
      incidents: round2(clamp(incCount / 6)),
      site: SITE_WEIGHT[site.role] ?? 0.5,
    },
    incCount, maxRatio: round2(maxRatio), safety, kind, flag: room?.flag ?? null,
  };
}
function round2(n) { return Math.round(n * 100) / 100; }

const byRoom = new Map();
for (const x of dueList.filter((d) => d.due <= NOW_YEAR + 1)) {
  if (!byRoom.has(x.space.id)) byRoom.set(x.space.id, []);
  byRoom.get(x.space.id).push(x);
}
export const packages = [...byRoom.entries()].map(([id, recs]) => packageFor(spaces[id], recs));
export const planCost = packages.reduce((n, p) => n + p.cost, 0);
export const FACTORS = [
  { id: 'usage', label: 'Usage', plain: 'How much the space is used: share of the working week it is occupied.', source: SOURCE.occupied },
  { id: 'age', label: 'Age', plain: 'How far past its planned life the oldest device in the work is.', source: 'The work plan: each unit\'s install date against the house policy.' },
  { id: 'eos', label: 'End of support', plain: 'Whether the manufacturer has stopped supporting a device (full) or stops within a year (half).', source: 'Device model records: end of support dates.' },
  { id: 'incidents', label: 'Incidents', plain: 'Incidents in the space in the last 12 months; six or more counts as full.', source: SOURCE.incidents },
  { id: 'site', label: 'Office', plain: 'How much the business depends on the site: headquarters highest, remote lowest.', source: 'Site records: the site\'s role.' },
];
