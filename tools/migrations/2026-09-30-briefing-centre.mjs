// One-off generator, 30 Sept 2026: the Dublin office's executive briefing centre (EBC), a new fifth floor. Kept for
// the record (rule F6): it has been run and its output committed with it. Rerunnable: it rewrites the same files and
// replaces only what it wrote before (the fifth floor's runs and cables), so a second run gives the same result.
//
//   node tools/migrations/2026-09-30-briefing-centre.mjs
//
// Everything is made up for the demo (rule F9): the floor, its rooms, their kit, serials, tags, orders, cables and
// test results. The briefing centre opened in the summer of 2026, so its kit went in in June and July 2026.
//
// The floor is the same 44 × 24 m plate, core and corridors as the third and fourth floors
// (tools/migrations/2026-09-30-realistic-floors-dub.mjs), at 19.0 m. Its rooms use the five briefing centre space
// types (data/space-types/: welcome-lounge, executive-boardroom, demo-zone, briefing-auditorium, av-control-room):
//
//   south row   5.02 Boardroom (0 to 10 m), arrival and coats, 5.01 Welcome lounge opposite the lifts, 5.03 Demo zone
//   north row   5.05 Control room (0 to 5 m) behind 5.04 Briefing auditorium (5 to 23 m), then catering
//   core        5.21 Comms room (IDF), beside riser 1 as on every floor
//
// Each long room turns its display wall to a short wall and has its door on the corridor. The floor needs its own
// comms room: src/lib/floors.mjs routeRun() cables a room only from a rack on its own floor.
//
// What it writes:
//   data/sites/dub.yaml              the fifth floor in the site's floors
//   data/spaces/dub/dub-5-*.yaml     the seven spaces (five rooms, the IDF, the open areas that hold the access points)
//   data/installs/dub/dub-5-*.yaml   what is fitted in each: serials DEMO-DUB-004001 up, asset tags AG-004001 up
//   data/racks/dub-5-21.yaml         the IDF rack: fibre panel, console server, two 48-port panels, two UniFi access
//                                    switches, an AV panel and the AV switch, UPS, A and B power strips
//   data/floors/dub-5.yaml           the floor plan: core, corridors, areas, riser, rack, trays, access points
//   data/floors/dub-3.yaml, dub-4.yaml  riser 1 now serves the fifth floor too (floors, to_level_m)
//   data/runs/dub.yaml               a permanent link from a panel port to every data outlet and access point on the
//                                    floor, and the riser fibre from the MDF's floor riser panel (ports 13 to 24)
//   data/cables/dub.yaml             the IDF's patch cords, and the MDF's fibre cords from the core pair (ports 11, 12)
//                                    to the riser panel
//   data/accessibility/dub.yaml      hearing loops in the boardroom, the demo zone and the auditorium (8 seats and more)
// Afterwards data/switch-ports/dub.yaml is regenerated: delete it and run tools/migrations/2026-09-30-switch-ports.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseDocument, Document, visit, isScalar, isSeq } from 'yaml';
import { FICTION, loadRaw, roomGeometry, roomOutlets, trayGraph, routeRun, trayCapacity, inRect, distToPath, WIFI_RULE, panelZ, areaRange, OPEN_AREA } from '../../src/lib/floors.mjs';

const ROOT = process.cwd();
const SITE = 'dub';
const F = '5';
const THIS = 'tools/migrations/2026-09-30-briefing-centre.mjs';
const r2 = (v) => Math.round(v * 100) / 100;
let seed = 11;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const file = (...p) => path.join(ROOT, ...p);
const flowShort = (doc) => { visit(doc, { Seq(_, n) { if (n.items.every((i) => isScalar(i) && typeof i.value === 'number') || (n.items.length && n.items.every((i) => isSeq(i) && i.flow))) n.flow = true; } }); return doc; };
const stringify = (obj, o = {}) => flowShort(new Document(obj)).toString({ lineWidth: 0, ...o });

// ---------- The building: the same plate and core as floors 3 and 4 ----------
const L = 44, DEPTH = 24;
const OUTLINE = [[0, 0], [L, 0], [L, DEPTH], [0, DEPTH]];
const LEVEL = { 3: 11.4, 4: 15.2, 5: 19.0 };
const S1 = 6.4, m0 = 8, m1 = 16, N0 = 17.6;
const YS = 7.2, YN = 16.8;
const LW0 = 12.6, LW1 = 14.2, LE0 = 32.2, LE1 = 33.8, SB = 40.5;
const CORE = [
  { id: 'stair-a', kind: 'stair', name: 'Stair A', rect: [LW1, m0, 17.7, m1] },
  { id: 'lift-lobby', kind: 'lift-lobby', name: 'Lift lobby', rect: [17.7, m0, 23.7, 10.4], circulation: true },
  { id: 'lifts', kind: 'lift', name: 'Lifts 1 to 3', rect: [17.7, 10.4, 23.7, m1], count: 3 },
  { id: 'riser-1', kind: 'riser', name: 'Riser 1 (data)', rect: [23.7, 11.4, 25.2, m1] },
  { id: 'store', kind: 'store', name: "Cleaner's store", rect: [25.2, 11.4, 27.7, m1] },
  { id: 'toilets', kind: 'toilets', name: 'Toilets and accessible toilet', rect: [27.7, m0, LE0, m1] },
  { id: 'stair-b', kind: 'stair', name: 'Stair B (escape)', rect: [SB, m0, L, m1] },
];
const CORRIDORS = [
  { id: 'corridor-south', name: 'South corridor', rect: [0, S1, L, m0] },
  { id: 'corridor-north', name: 'North corridor', rect: [0, m1, L, N0] },
  { id: 'corridor-west', name: 'West link', rect: [LW0, m0, LW1, m1] },
  { id: 'corridor-east', name: 'East link', rect: [LE0, m0, LE1, m1] },
];
const AREAS = [
  { id: 'arrival', kind: 'reception-lobby', name: 'Arrival and coats', rect: [10, 0, LW1, S1] },
  { id: 'breakout-south', kind: 'breakout', name: 'Touchdown', rect: [38.2, 0, L, S1] },
  { id: 'breakout-west', kind: 'breakout', name: 'Quiet breakout', rect: [0, m0, LW0, m1] },
  { id: 'breakout-east', kind: 'breakout', name: 'Breakout', rect: [LE1, m0, SB, m1] },
  { id: 'catering', kind: 'breakout', name: 'Catering and networking', rect: [23, N0, L, DEPTH] },
];
const RISER_RECT = CORE.find((c) => c.id === 'riser-1').rect;
const RISER_FLOORS = ['3', '4', '5'], RISER_TOP = r2(LEVEL[5] + 3.8);
const RISER = { id: 'dub-riser-1', name: 'Riser 1 (data)', rect: RISER_RECT, floors: RISER_FLOORS, from_level_m: 0, to_level_m: RISER_TOP,
  sleeves: 4, sleeve_mm: 100, carries: 'Riser fibre between the MDF and the IDF, and both providers\' fibre from the ground floor entry', notes: 'Fire-stopped at each floor. Both providers\' lead-ins share it: a single path, recorded as a risk.' };
const COMMS_RECT = [23.7, m0, 27.7, 11.4];
const RACK_AT = [25.8, 9.9];
const RISER_C = [r2((RISER_RECT[0] + RISER_RECT[2]) / 2), r2((RISER_RECT[1] + RISER_RECT[3]) / 2)];
const JX = 27.0, LWX = r2((LW0 + LW1) / 2), LEX = r2((LE0 + LE1) / 2), X0 = 0.8, X1 = L - 0.8;
const TRAY_Z = 3.1, LADDER_Z = 2.4;
const mainTrays = (f) => [
  { id: `t${f}-comms`, kind: 'ladder', name: 'Ladder in the comms room', path: [RISER_C, [RISER_C[0], RACK_AT[1]], RACK_AT, [JX, RACK_AT[1]], [JX, YS]], z_m: LADDER_Z, width_mm: 450, depth_mm: 100 },
  { id: `t${f}-south-w`, kind: 'tray', name: 'South corridor tray, west', path: [[JX, YS], [X0, YS]], z_m: TRAY_Z },
  { id: `t${f}-south-e`, kind: 'tray', name: 'South corridor tray, east', path: [[JX, YS], [X1, YS]], z_m: TRAY_Z },
  { id: `t${f}-link-w`, kind: 'tray', name: 'West link tray', path: [[LWX, YS], [LWX, YN]], z_m: TRAY_Z },
  { id: `t${f}-link-e`, kind: 'tray', name: 'East link tray', path: [[LEX, YS], [LEX, YN]], z_m: TRAY_Z },
  { id: `t${f}-north-w`, kind: 'tray', name: 'North corridor tray, west', path: [[LWX, YN], [X0, YN]], z_m: TRAY_Z },
  { id: `t${f}-north-m`, kind: 'tray', name: 'North corridor tray, middle', path: [[LWX, YN], [LEX, YN]], z_m: TRAY_Z },
  { id: `t${f}-north-e`, kind: 'tray', name: 'North corridor tray, east', path: [[LEX, YN], [X1, YN]], z_m: TRAY_Z },
];

// ---------- The spaces ----------
// Rooms on the south row turn 270 (their display wall on the west, their left wall on the corridor); on the north
// row they turn 90 (display wall on the east). Every room is built to its space type's size.
const ROOMS = [
  { id: 'dub-5-01', number: '5.01', name: 'Welcome lounge', type: 'welcome-lounge', option: 'signage', on: [LW1, S1, 270],
    notes: ['Opposite the lift lobby: visitors step out of the lifts and across the corridor into it. The welcome screens are on the west wall.'] },
  { id: 'dub-5-02', number: '5.02', name: 'Boardroom', type: 'executive-boardroom', option: 'dual-display', on: [0, S1, 270],
    notes: ['At the west end of the south row, the displays on the end wall, the door at the far end from them.'] },
  { id: 'dub-5-03', number: '5.03', name: 'Demo zone', type: 'demo-zone', option: 'dual-display', on: [26.2, S1, 270],
    notes: ['East of the welcome lounge, so a tour goes lounge, demo zone, boardroom or auditorium.'] },
  { id: 'dub-5-04', number: '5.04', name: 'Briefing auditorium', type: 'briefing-auditorium', option: 'dual-display', on: [23, N0, 90],
    notes: ['On the north row, the displays on the east wall, the door at the back beside the control room.'] },
  { id: 'dub-5-05', number: '5.05', name: 'Control room', type: 'av-control-room', option: 'operator', on: [5, N0, 90],
    notes: ["Behind the auditorium: its monitoring display is on the shared wall, and the auditorium's AV rack stands here."] },
];
const COMMS = { id: 'dub-5-21', number: '5.21', name: 'Comms room (IDF)' };
const OPEN = { id: 'dub-5-open', name: 'Open areas and corridors, Fifth floor' };

const raw = loadRaw(ROOT);
const models = raw.models;
const optionOf = (s) => raw.types[s.space_type].keia_atlas.options.find((o) => o.id === s.option);
const spaceDocs = {};
for (const r of ROOMS) {
  spaceDocs[r.id] = { site: SITE, floor: F, number: r.number, name: r.name, space_type: r.type, option: r.option,
    geometry: { on_floor: { x_m: r.on[0], y_m: r.on[1], turn_deg: r.on[2] }, notes: r.notes } };
}
spaceDocs[COMMS.id] = { site: SITE, floor: F, number: COMMS.number, name: COMMS.name, space_type: 'idf', option: 'unifi',
  power: { feeds: [{ feed: 'A', board: 'DB-5A', way: 12 }, { feed: 'B', board: 'DB-5B', way: 14 }], ups: { runtime_min: 34, load_pct: 27, measured: '2026-06-12' }, demo: true },
  environment: { probe: 'Temperature probe on the UPS network card, at the front of the rack', reports_to: 'Monitoring', demo: true },
  geometry: { size_m: { width: 4, depth: 3.4 }, on_floor: { x_m: COMMS_RECT[0], y_m: COMMS_RECT[1], turn_deg: 0 }, door: { wall: 'back', from_m: 2.6, to_m: 3.5 },
    notes: ['Comms room in the core, beside riser 1; the riser cupboard opens into it. The same place on every floor.'] } };
spaceDocs[OPEN.id] = { site: SITE, floor: F, name: OPEN.name, space_type: OPEN_AREA, option: 'unifi',
  notes: ['Everything on the floor that is not an enclosed room or the core: arrival, breakout and catering areas, corridors and the lift lobby. Where each access point hangs is on the floor plan.'] };
for (const [id, d] of Object.entries(spaceDocs)) raw.spaces[id] = d;
for (const r of ROOMS) {
  const s = raw.spaces[r.id], t = raw.types[s.space_type], g = roomGeometry(s, t), rg = areaRange(t);
  if (rg && (g.area < rg.min || g.area > rg.max)) throw new Error(`${r.id}: ${g.area} m² is outside ${rg.min} to ${rg.max}`);
}

// ---------- What is fitted: one unit per position ----------
// Hostnames follow the house rule (site, room number, kind, count): dub-502-dsp01. Cameras, microphones, speakers and
// HDBaseT boxes have none, as in the other Dublin rooms. Costs are made up, in line with the same models elsewhere.
const KIND = { display: 'dsp', codec: 'vc', 'video-bar': 'vc', 'touch-controller': 'tc', 'scheduler-panel': 'sch', amplifier: 'amp', 'signage-player': 'sig', 'network-switch': 'sw', 'wireless-access-point': 'ap' };
const COST = { 'samsung-qm85c': 2400, 'samsung-qm65c': 1400, 'lg-75uh5q-e': 1900, 'poly-g62': 6500, 'poly-e60': 1200, 'poly-e70': 1600, 'poly-tc10': 900, 'poly-ip-ceiling-microphone': 450,
  'poly-tabletop-microphone': 450, 'kramer-pa-240z': 800, 'kramer-galil-6': 350, 'netgear-m4250-gsm4210pd': 4800, 'kramer-tp-583txr': 520, 'kramer-tp-583rxr': 520, 'kramer-ext3-c-xr-t': 520,
  'kramer-ext3-poe-xr-r': 520, 'kramer-wp-20ct': 300, 'kramer-tp-580rxr': 400, 'logitech-tap-scheduler': 700, 'brightsign-xt1145': 900, 'poly-studio-x72': 3800, 'unifi-usw-pro-max-48-poe': 4800, 'unifi-u7-pro': 420 };
const WARRANTY_Y = { 'network-switch': 5, 'wireless-access-point': 3 };
const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const addYears = (d, n) => addDays(`${Number(d.slice(0, 4)) + n}${d.slice(4)}`, -1);
// When each space's kit went in, and the order it came on.
const WHEN = { 'dub-5-21': ['2026-06-08', 'PO-DUB-2026-008'], 'dub-5-open': ['2026-06-10', 'PO-DUB-2026-008'], 'dub-5-02': ['2026-06-22', 'PO-DUB-2026-009'], 'dub-5-04': ['2026-06-29', 'PO-DUB-2026-009'],
  'dub-5-05': ['2026-06-30', 'PO-DUB-2026-009'], 'dub-5-03': ['2026-07-06', 'PO-DUB-2026-009'], 'dub-5-01': ['2026-07-08', 'PO-DUB-2026-009'] };
const POSITIONS = {
  'dub-5-21': [['access-switch#1', 'unifi-usw-pro-max-48-poe'], ['access-switch#2', 'unifi-usw-pro-max-48-poe'], ['av-switch', 'netgear-m4250-gsm4210pd']],
  'dub-5-open': Array.from({ length: 5 }, (_, i) => [`access-point#${i + 1}`, 'unifi-u7-pro']),
};
let serial = 4001;
const installs = {};
for (const id of [COMMS.id, OPEN.id, ...ROOMS.map((r) => r.id)]) {
  const s = raw.spaces[id], opt = optionOf(s);
  const list = POSITIONS[id] ?? opt.equipment.filter((e) => e.requirement === 'required').flatMap((e) => {
    const n = typeof e.quantity === 'number' ? e.quantity : 1;
    return Array.from({ length: n }, (_, i) => [n > 1 ? `${e.key}#${i + 1}` : e.key, e.model]);
  });
  const [day, order] = WHEN[id];
  const room = id === OPEN.id ? null : s.number.replace('.', '');
  const count = {};
  const positions = list.map(([position, model], i) => {
    const e = opt.equipment.find((x) => x.key === position.replace(/#\d+$/, ''));
    const cls = models[model].class;
    const k = id === COMMS.id ? { 'access-switch': 'as', 'av-switch': 'avs' }[e.key] : KIND[cls];
    let hostname = null;
    if (k) { count[k] = (count[k] ?? 0) + 1; hostname = id === OPEN.id ? `dub-5-ap${String(count[k]).padStart(2, '0')}` : `dub-${room}-${k}${String(count[k]).padStart(2, '0')}`; }
    const installed = addDays(day, i % 4);
    const bought = addDays(day, -28 - (i % 5));
    const unit = { serial: `DEMO-DUB-${String(serial).padStart(6, '0')}`, asset_tag: `AG-${String(serial).padStart(6, '0')}`, stage: 'manage', installed,
      ...(hostname ? { default_password_changed: true } : {}),
      purchase: { date: bought, order, cost: COST[model], currency: 'EUR', demo: true }, warranty: { ends: addYears(bought, WARRANTY_Y[cls] ?? 3), demo: true } };
    serial += 1;
    return { position, model, ...(hostname ? { hostname } : {}), units: [unit] };
  });
  installs[id] = { space: id, positions };
  raw.installs[id] = installs[id];
}

// ---------- The rack ----------
const RACK_ID = 'dub-5-21-r1';
const PANEL_A = 38, PANEL_B = 34, AS1 = 37, AS2 = 33, AV_PANEL = 31, AV_SW = 30, FIBRE = 42;
const rack = {
  id: RACK_ID, name: 'Rack 1', space: COMMS.id, height_u: 42, gear: 'apc-netshelter-sx-ar3150',
  side_pdus: [{ gear: 'raritan-px3-1486v', feed: 'A' }, { gear: 'raritan-px3-1486v', feed: 'B' }],
  items: [
    { u: FIBRE, size: 1, kind: 'fibre-panel', gear: 'corning-cch-01u', label: 'Fibre patch', ports: 12, detail: 'Riser fibre back to the MDF on the third floor, two fibres per access switch' },
    { u: 41, size: 1, kind: 'oob', gear: 'zpe-nodegrid-nsc-t48r', label: 'Out-of-band console server', ports: 48 },
    { u: 40, size: 1, kind: 'cable-manager', gear: 'panduit-wmpfse', label: 'Cable manager' },
    { u: PANEL_A, size: 2, kind: 'patch-panel', gear: 'panduit-nk6xppg48y', label: 'Patch panel A, fifth floor', ports: 48, detail: 'Outlets in the briefing centre rooms' },
    { u: AS1, size: 1, kind: 'switch', gear: 'unifi-usw-pro-max-48-poe', label: 'Access switch 1', position: 'access-switch#1', ports: 48 },
    { u: 36, size: 1, kind: 'cable-manager', gear: 'panduit-wmpfse', label: 'Cable manager' },
    { u: PANEL_B, size: 2, kind: 'patch-panel', gear: 'panduit-nk6xppg48y', label: 'Patch panel B, fifth floor', ports: 48, detail: 'The rest of the room outlets, and the access points from port 33' },
    { u: AS2, size: 1, kind: 'switch', gear: 'unifi-usw-pro-max-48-poe', label: 'Access switch 2', position: 'access-switch#2', ports: 48 },
    { u: 32, size: 1, kind: 'cable-manager', gear: 'panduit-wmpfse', label: 'Cable manager' },
    { u: AV_PANEL, size: 1, kind: 'patch-panel', label: 'Patch panel, AV outlets', ports: 24, detail: "The demo zone's video bar" },
    { u: AV_SW, size: 1, kind: 'shelf', label: 'AV switch on a shelf', position: 'av-switch', ports: 10 },
    { u: 27, size: 3, kind: 'reserved', label: "Space for a large room's codec", detail: "Optional in the IDF space type; the auditorium's codec is in the control room's AV rack instead" },
    { u: 3, size: 24, kind: 'reserved', label: 'Space for growth', detail: 'Blanking panels keep the cold air at the front' },
    { u: 1, size: 2, kind: 'ups', gear: 'apc-srt3000rmxla', label: 'UPS', detail: 'A smaller model in the same family would do for one floor; shown with the MDF\'s' },
  ],
};
raw.racks['dub-5-21'] = rack;

// ---------- The floor plan: trays, baskets and access points ----------
const geoOf = (id) => roomGeometry(raw.spaces[id], raw.types[raw.spaces[id].space_type]);
const roomIds = ROOMS.map((r) => r.id);
function branchTo(trays, p) {
  let best = null;
  for (const t of trays.filter((x) => x.kind === 'tray')) {
    const [a, b] = [t.path[0], t.path[t.path.length - 1]];
    const horiz = Math.abs(a[1] - b[1]) < 1e-6;
    const lo = horiz ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi = horiz ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
    const along = Math.max(lo, Math.min(hi, horiz ? p[0] : p[1]));
    const P = horiz ? [along, a[1]] : [a[0], along];
    const d = Math.abs(P[0] - p[0]) + Math.abs(P[1] - p[1]);
    if (!best || d < best.d) best = { d, P, horiz };
  }
  const { P, horiz } = best;
  const pts = [P];
  if (horiz ? Math.abs(P[0] - p[0]) > 1e-6 : Math.abs(P[1] - p[1]) > 1e-6) pts.push(horiz ? [P[0], p[1]] : [p[0], P[1]]);
  pts.push(p);
  return pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-6).map((q) => [r2(q[0]), r2(q[1])]);
}
const trays = mainTrays(F);
for (const id of roomIds) {
  const geo = geoOf(id);
  trays.push({ id: `t5-b-${id.replace(/^dub-/, '')}`, kind: 'basket', name: `Branch to ${raw.spaces[id].number} ${raw.spaces[id].name}`, path: branchTo(trays, [geo.entry[0], geo.entry[1]]), z_m: TRAY_Z, feeds: `room-${id}` });
}
// Where the access points would go, each nudged to the nearest clear spot (off rooms and the core, 1 m from trays).
const AP_WANT = [[12.1, 3.2], [41.1, 3.2], [6.3, 12], [37.1, 12], [33.5, 20.8]];
const blocked = [...[...roomIds, COMMS.id].map((id) => geoOf(id).rect), ...CORE.filter((c) => !c.circulation).map((c) => c.rect)];
const aps = [];
AP_WANT.forEach(([x, y], i) => {
  const id = `dub-5-ap${String(i + 1).padStart(2, '0')}`;
  const ok = (p) => !blocked.some((r) => inRect(p, r, 0.3)) && trays.every((t) => distToPath(p, t.path) >= WIFI_RULE.clear_of_tray_m + 0.05)
    && p[0] > 0.8 && p[0] < L - 0.8 && p[1] > 0.8 && p[1] < DEPTH - 0.8;
  let at = null;
  for (let d = 0; d <= 4 && !at; d += 0.25) for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) {
    const p = [r2(x + dx), r2(y + dy)];
    if (!ok(p)) continue;
    const br = branchTo(trays, p);
    if (aps.some((a) => distToPath(a.at, br) < WIFI_RULE.clear_of_tray_m + 0.05)) continue;
    at = p; break;
  }
  if (!at) throw new Error(`no clear spot for access point ${id}`);
  const ap = { id, space: OPEN.id, position: `access-point#${i + 1}`, area: 'open', at, height_m: 2.7 };
  aps.push(ap);
  trays.push({ id: `t5-b-ap${String(i + 1).padStart(2, '0')}`, kind: 'basket', name: `Branch to access point ${id}`, path: branchTo(trays, at), z_m: TRAY_Z, feeds: `ap-${id}` });
});

// ---------- Runs and the patch cords that make each one live ----------
const fl = { id: F, level_m: LEVEL[5], tray_m: TRAY_Z, raised_floor_m: 0.15, trays, racks: [{ rack: RACK_ID, at: RACK_AT, facing: 's' }] };
const G = trayGraph(trays);
const outlets = [];
for (const id of roomIds) {
  const s = raw.spaces[id], t = raw.types[s.space_type], opt = optionOf(s), geo = geoOf(id);
  for (const o of roomOutlets(s, t, opt, [], geo, models)) {
    const cls = o.dev ? opt.equipment.find((e) => e.key === o.dev.replace(/#\d+$/, ''))?.class : null;
    // AV outlets (a video bar or codec on an outlet, as on the fourth floor) go to the IDF's AV switch; an in-room AV
    // switch's uplink is a data outlet, patched to an access switch like the third floor's.
    outlets.push({ space: id, o, geo, av: ['video-bar', 'codec'].includes(cls) });
  }
}
const av = outlets.filter((x) => x.av), data = outlets.filter((x) => !x.av);
const onA = Math.min(40, data.length);
const ports = [
  ...av.map((x, i) => ({ x, u: AV_PANEL, port: i + 1, purpose: 'av' })),
  ...data.map((x, i) => (i < onA ? { x, u: PANEL_A, port: i + 1, purpose: 'user-data' } : { x, u: PANEL_B, port: i - onA + 1, purpose: 'user-data' })),
  ...aps.map((a, i) => ({ ap: a, u: PANEL_B, port: 33 + i, purpose: 'user-data' })),
];
if (data.length - onA > 32) throw new Error('panel B is full');
const label = (u, p) => `DUB-5.21-R1-U${String(u).padStart(2, '0')}-P${String(p).padStart(2, '0')}`;
const TEST_DATE = '2026-06-05';
const runs = ports.map((p) => {
  const item = rack.items.find((x) => x.u === p.u);
  const feedTray = trays.find((t) => t.feeds === (p.ap ? `ap-${p.ap.id}` : `room-${p.x.space}`));
  const feed = feedTray.path[feedTray.path.length - 1];
  const outlet = p.ap ? { kind: 'ap', at: [p.ap.at[0], p.ap.at[1], p.ap.height_m], feed } : { ...p.x.o, feed, geo: p.x.geo };
  const R = routeRun({ floor: fl, G, rackAt: RACK_AT, item, outlet, geo: p.x?.geo });
  if (!R) throw new Error(`no route for ${p.ap?.id ?? `${p.x.space} ${p.x.o.id}`}`);
  return { id: label(p.u, p.port), kind: 'horizontal', type: 'cat6a', purpose: p.purpose, from: { rack: RACK_ID, u: p.u, port: p.port },
    to: p.ap ? { access_point: p.ap.id } : { space: p.x.space, outlet: p.x.o.id }, via: R.via, length_m: R.length,
    test: { result: 'pass', date: TEST_DATE, length_m: r2(R.length - 0.2 + rand() * 0.4), margin_db: r2(2.5 + rand() * 4) } };
});
// The riser fibre: 12 duplex OM4 from the MDF's floor riser panel (ports 13 to 24) to the IDF's fibre panel.
{
  const ladder = r2(Math.abs(RACK_AT[0] - RISER_C[0]) + Math.abs(RISER_C[1] - RACK_AT[1]));
  const drop = (u) => LADDER_Z - panelZ(u);
  const len = Math.ceil((ladder * 2 + (LEVEL[5] - LEVEL[3]) + drop(12) + drop(FIBRE) + 10) * 10) / 10;
  runs.push({ id: 'DUB-3.21-R1-U12-P13', kind: 'backbone', type: 'fibre-om4', purpose: 'fibre-mm', cores: 24, from: { rack: 'dub-3-21-r1', u: 12, ports: '13-24' }, to: { rack: RACK_ID, u: FIBRE, ports: '1-12' },
    via: ['t3-comms', 'dub-riser-1', 't5-comms'], length_m: len, test: { result: 'pass', date: '2026-06-03', loss_db: 1.1, notes: 'Worst core, 850 nm; made up.' },
    notes: 'Riser fibre to the fifth floor, 12 duplex pairs (24 cores). MDF port n is IDF port n minus 12. Includes a 5 m service loop at each end.' });
}

// Tray sizes from the cables each carries, plus a quarter for growth, at the house fill.
const SIZES = [[100, 60], [150, 60], [200, 60], [300, 60], [450, 60], [600, 60]];
const count = new Map();
for (const r of runs) for (const v of r.via) count.set(v, (count.get(v) ?? 0) + 1);
for (const t of trays) {
  const n = count.get(t.id) ?? 0;
  if (t.kind === 'ladder') { t.capacity = trayCapacity(t.width_mm, t.depth_mm); continue; }
  const [w, d] = SIZES.find(([w0, d0]) => trayCapacity(w0, d0) >= Math.ceil(n * 1.25)) ?? SIZES[SIZES.length - 1];
  Object.assign(t, { width_mm: w, depth_mm: d, capacity: trayCapacity(w, d) });
}

// Patch cords: one per contiguous panel range, in the house colours (data/standards/cables.yaml).
const IDF_WHERE = { room: 'Comms room (IDF) 5.21', space: COMMS.id, rack: RACK_ID };
const MDF_WHERE = { room: 'Comms room (MDF) 3.21', space: 'dub-3-21', rack: 'dub-3-21-r1' };
const range = (a, b) => (a === b ? String(a) : `${a}-${b}`);
const dataOnA = data.slice(0, onA).length, dataOnB = data.length - onA;
const cords = [
  { role: 'patch', type: 'cat6a', length_m: 0.5, colour: 'blue', purpose: 'user-data', quantity: dataOnA, where: IDF_WHERE, connects: { from: { u: AS1, ports: range(1, dataOnA) }, to: { u: PANEL_A, ports: range(1, dataOnA) } },
    notes: `Panel A outlets 1 to ${dataOnA} live; ${dataOnA + 1} to 48 spare.` },
  ...(dataOnB ? [{ role: 'patch', type: 'cat6a', length_m: 0.5, colour: 'blue', purpose: 'user-data', quantity: dataOnB, where: IDF_WHERE, connects: { from: { u: AS2, ports: range(1, dataOnB) }, to: { u: PANEL_B, ports: range(1, dataOnB) } },
    notes: `Panel B outlets 1 to ${dataOnB} live.` }] : []),
  { role: 'patch', type: 'cat6a', length_m: 0.5, colour: 'blue', purpose: 'user-data', quantity: aps.length, where: IDF_WHERE, connects: { from: { u: AS2, ports: range(33, 32 + aps.length) }, to: { u: PANEL_B, ports: range(33, 32 + aps.length) } },
    notes: 'The access points, on the 2.5 GbE ports.' },
  { role: 'patch', type: 'cat6a', length_m: 0.3, colour: 'green', purpose: 'av', quantity: av.length, where: IDF_WHERE, connects: { from: { u: AV_SW, ports: range(1, av.length) }, to: { u: AV_PANEL, ports: range(1, av.length) } },
    notes: 'AV switch to the AV outlets.' },
  { role: 'patch', type: 'fibre-om4', length_m: 2, colour: 'aqua', purpose: 'fibre-mm', quantity: 2, where: IDF_WHERE, connects: { from: { u: AS1, ports: '49-50' }, to: { u: FIBRE, ports: '1-2' } }, notes: 'Riser to the third floor MDF.' },
  { role: 'patch', type: 'fibre-om4', length_m: 2, colour: 'aqua', purpose: 'fibre-mm', quantity: 2, where: IDF_WHERE, connects: { from: { u: AS2, ports: '49-50' }, to: { u: FIBRE, ports: '3-4' } }, notes: 'Riser to the third floor MDF.' },
  { role: 'patch', type: 'cat6a', length_m: 1, colour: 'yellow', purpose: 'uplink', quantity: 1, where: IDF_WHERE, connects: { from: { u: AS1, ports: '47' }, to: { u: AV_SW, ports: '10' } }, notes: 'AV switch uplink.' },
  { role: 'patch', type: 'console', length_m: 1.5, colour: 'purple', purpose: 'console', quantity: 1, where: IDF_WHERE, connects: { from: { u: 41, ports: '3' }, to: { device: 'Console port: the AV switch' } },
    notes: 'The vendor\'s drawings of the UniFi access switches show no console port, so only the AV switch has a console cable.' },
  { role: 'patch', type: 'power-c13-c14', length_m: 1, colour: 'black', purpose: 'power-a', quantity: 6, where: IDF_WHERE, connects: { from: { device: 'Every powered device, feed A' }, to: { ports: '1-6', device: 'Power strip A' } } },
  { role: 'patch', type: 'power-c13-c14', length_m: 1, colour: 'grey', purpose: 'power-b', quantity: 6, where: IDF_WHERE, connects: { from: { device: 'Every powered device, feed B' }, to: { ports: '1-6', device: 'Power strip B' } } },
  { role: 'patch', type: 'fibre-om4', length_m: 2, colour: 'aqua', purpose: 'fibre-mm', quantity: 2, where: MDF_WHERE, connects: { from: { u: 19, ports: '11-12' }, to: { u: 12, ports: '13-14' } }, notes: 'Riser to the fifth floor IDF (access switch 1).' },
  { role: 'patch', type: 'fibre-om4', length_m: 2, colour: 'aqua', purpose: 'fibre-mm', quantity: 2, where: MDF_WHERE, connects: { from: { u: 20, ports: '11-12' }, to: { u: 12, ports: '15-16' } }, notes: 'Riser to the fifth floor IDF (access switch 2).' },
];

// ---------- Write ----------
const header = (lines) => lines.map((l) => `# ${l}`).join('\n') + '\n\n';
const write = (rel, head, obj) => writeFileSync(file(rel), header(head) + stringify(obj));
// The site: the fifth floor.
{
  // A text edit, so the rest of the file keeps its layout.
  const p = file('data/sites/dub.yaml');
  const text = readFileSync(p, 'utf8');
  const after = '  - id: "4"\n    name: Fourth floor\n';
  if (!parseDocument(text).toJS().floors.some((f) => f.id === F)) writeFileSync(p, text.replace(after, `${after}  - id: "${F}"\n    name: Fifth floor\n`));
}
// Spaces.
for (const [id, d] of Object.entries(spaceDocs)) {
  const what = id === COMMS.id ? `Comms room (IDF), ${d.number}` : id === OPEN.id ? 'the open areas and corridors, home of the floor\'s Wi-Fi access points' : `room ${d.number}: ${d.name}, in the executive briefing centre`;
  write(`data/spaces/dub/${id}.yaml`, [`Dublin office, fifth floor, ${what}. Made up for the demo (rule F9); written by`, `${THIS}.`], d);
}
// Installs.
for (const [id, d] of Object.entries(installs)) {
  write(`data/installs/dub/${id}.yaml`, [`Installed in ${spaceDocs[id].name} (${id}), fifth floor, when the briefing centre opened in the summer of 2026.`, `Serials, asset tags, orders and costs are made up; written by ${THIS}.`], d);
}
// The rack.
writeFileSync(file('data/racks/dub-5-21.yaml'), header([
  "Rack in the Dublin office's fifth floor comms room (IDF), built for the executive briefing centre in June 2026 on the UniFi house",
  'standard (decision 0028): two 48-port panels and two UniFi Pro Max 48 PoE access switches for the floor\'s outlets and access points,',
  'an AV panel and the AV switch for the rooms\' AV networks, 10G fibre back to the MDF. Made up for the demo; written by',
  `${THIS}.`,
]).replace(/\n\n$/, '\n') + stringify(rack));
// The floor.
const trayOut = (t) => Object.fromEntries(['id', 'kind', 'name', 'path', 'z_m', 'width_mm', 'depth_mm', 'capacity', 'feeds'].filter((k) => t[k] !== undefined).map((k) => [k, t[k]]));
{
  const doc = {
    site: SITE, floor: F, name: 'Fifth floor', fictional: FICTION,
    level_m: LEVEL[5], slab_to_slab_m: 3.8, ceiling_m: 2.7, raised_floor_m: 0.15, tray_m: TRAY_Z,
    outline: OUTLINE, core: CORE, corridors: CORRIDORS, areas: AREAS, risers: [RISER],
    racks: [{ rack: RACK_ID, at: RACK_AT, facing: 's' }],
    trays: trays.map(trayOut),
    access_points: aps,
    notes: [
      `The executive briefing centre, opened in the summer of 2026. The same ${L} × ${DEPTH} m plate as the floors below: a row of rooms along each facade, two 1.6 m corridors, and the core in the middle zone with the comms room beside riser 1.`,
      'Visitors step out of the lifts into the welcome lounge; the boardroom, the demo zone and the auditorium open off the corridors, and the control room sits behind the auditorium with its AV rack.',
      'Trays run in the corridor ceiling void at 3.1 m; a basket branches off to each room\'s data entry (above its door) and to each access point. Tray sizes are chosen for the cables they carry plus a quarter for growth, at a 40 percent fill.',
    ],
  };
  writeFileSync(file('data/floors/dub-5.yaml'), `# Dublin office, fifth floor: the floor plan for the 3D model and the floor map. Made up (rule F9); written by\n# ${THIS}. Metres from the outline's south-west corner, x east, y north.\n${stringify(doc)}`);
}
// Riser 1 serves the fifth floor too.
for (const f of ['3', '4']) {
  const p = file(`data/floors/dub-${f}.yaml`);
  const doc = parseDocument(readFileSync(p, 'utf8'));
  const riser = doc.get('risers').items.find((x) => x.get('id') === 'dub-riser-1');
  const fl2 = doc.createNode(RISER_FLOORS);
  for (const n of fl2.items) n.type = 'QUOTE_DOUBLE';
  riser.set('floors', fl2);
  riser.set('to_level_m', RISER_TOP);
  writeFileSync(p, doc.toString({ lineWidth: 0 }));
}
// Runs: the fifth floor's replace any written before; everything else is kept as it is.
{
  const p = file('data/runs/dub.yaml');
  const text = readFileSync(p, 'utf8');
  const head = text.slice(0, text.indexOf('\nsite:') + 1);
  const doc = parseDocument(text).toJS();
  const mine = new Set(runs.map((r) => r.id));
  doc.runs = [...doc.runs.filter((r) => !mine.has(r.id) && r.from.rack !== RACK_ID), ...runs];
  writeFileSync(p, head + stringify(doc));
}
// Cables: numbered after the last one; a rerun replaces the block this script wrote.
{
  const p = file('data/cables/dub.yaml');
  let text = readFileSync(p, 'utf8');
  const MARK = `  # The fifth floor (the briefing centre) and the MDF cords that feed it: written by ${THIS}.\n`;
  if (text.includes(MARK)) text = text.slice(0, text.indexOf(MARK)) + text.slice(text.indexOf('\ndemo: true') + 1);
  const doc = parseDocument(text).toJS();
  let n = Math.max(...doc.cables.map((c) => Number(c.id.replace(/^dub-cb-/, '')))) + 1;
  // Each cord in the file's own layout: one line per field, where, from and to as flow maps, a single port quoted.
  const cordYaml = (c) => {
    const d = new Document(c);
    for (const k of [['where'], ['connects', 'from'], ['connects', 'to']]) { const node = d.getIn(k, true); if (node) node.flow = true; }
    visit(d, { Scalar(_, node) { if (typeof node.value === 'string' && /^\d+$/.test(node.value)) node.type = 'QUOTE_DOUBLE'; } });
    return d.toString({ lineWidth: 0 }).trimEnd().split('\n').map((l, i) => (i === 0 ? `  - ${l}` : `    ${l}`)).join('\n') + '\n';
  };
  const body = cords.map((c) => cordYaml({ id: `dub-cb-${n++}`, ...c })).join('');
  const at = text.lastIndexOf('\ndemo: true');
  writeFileSync(p, text.slice(0, at + 1) + MARK + body + text.slice(at + 1));
}
// Accessibility: the file's rule is a hearing loop in every room of 8 seats and more, tested when the room was
// commissioned (made up, like the rest of the file).
{
  const p = file('data/accessibility/dub.yaml');
  const text = readFileSync(p, 'utf8');
  const add = [
    '  dub-5-02:\n    hearing_loop: { standard: IEC 60118-4, tested: "2026-06-24", result: meets }\n',
    '  dub-5-03:\n    hearing_loop: { standard: IEC 60118-4, tested: "2026-07-08", result: meets }\n',
    '  dub-5-04:\n    hearing_loop: { standard: IEC 60118-4, tested: "2026-07-01", result: meets }\n    assistive_listening: { where: "Receivers and neck loops in the control room, 5.05, behind the auditorium" }\n',
  ].filter((s) => !text.includes(s.split('\n')[0] + '\n'));
  if (add.length) { const at = text.lastIndexOf('\ndemo: true'); writeFileSync(p, text.slice(0, at + 1) + add.join('') + text.slice(at + 1)); }
}
console.log(`rooms ${ROOMS.length}; units ${serial - 4001} (DEMO-DUB-004001 to DEMO-DUB-${String(serial - 1).padStart(6, '0')}); outlets ${outlets.length} (${av.length} AV); access points ${aps.length}; runs ${runs.length}; longest ${Math.max(...runs.filter((r) => r.type === 'cat6a').map((r) => r.length_m))} m`);
for (const id of roomIds) { const g = geoOf(id); console.log(`  ${id} ${g.W} × ${g.D} m, ${g.area} m²`); }
