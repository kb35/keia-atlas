// One-off generator, 30 Sept 2026: the Dublin floors laid out as real office floors. Rerunnable; its output is committed.
// Replaces the layout tools/migrations/2026-09-30-dublin-floors.mjs wrote (rooms scattered over a 60 × 24 m plate,
// with gaps between them and wide empty bands).
//
//   node tools/migrations/2026-09-30-realistic-floors-dub.mjs
//
// The building: a 44 × 24 m plate, deep enough for a row of spaces on each facade and a middle zone between two
// 1.6 m corridors. The core sits in the middle zone (stair A, three lifts and their lobby, the comms room over riser 1,
// a cleaner's store and the toilets), with link corridors either side of it and the escape stair at the east end.
//
//   y  0.0 to  6.4   south row: spaces from the facade to the corridor, wall to wall (or desks in the open)
//   y  6.4 to  8.0   south corridor
//   y  8.0 to 16.0   middle zone: small spaces back to back either side of the core (4 m deep each side)
//   y 16.0 to 17.6   north corridor
//   y 17.6 to 24.0   north row
//
// Every space keeps its id, type and devices. A space on a row is as deep as the row, with its width chosen so the
// area stays within its space type's range; its door is on the corridor wall. Where a small space is shallower than
// its half of the middle zone, the rest is a store or lockers (building elements, not spaces). Desks sit in the open.
//
// Writes data/floors/dub-3.yaml and dub-4.yaml (outline, core, corridors, areas, riser, rack, trays, where each access
// point hangs), the `geometry` block of every Dublin space, data/runs/dub.yaml (the same panel ports and ids, new
// routes and lengths), and the entry points' positions in data/circuits/dub.yaml. The access points keep their ids,
// serials and tags (data/installs/dub/*-open.yaml, untouched); only where they hang moves.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseDocument, Document, visit, isScalar, isSeq } from 'yaml';
import { FICTION, loadRaw, roomGeometry, roomOutlets, trayGraph, routeRun, trayCapacity, inRect, distToPath, WIFI_RULE, panelZ, areaRange, OPEN_AREA } from '../../src/lib/floors.mjs';

const ROOT = process.cwd();
const raw = loadRaw(ROOT);
const SITE = 'dub';
const THIS = 'tools/migrations/2026-09-30-realistic-floors-dub.mjs';
const r2 = (v) => Math.round(v * 100) / 100;
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---------- The building: one outline and one core, stacked ----------
const L = 44, DEPTH = 24;
const OUTLINE = [[0, 0], [L, 0], [L, DEPTH], [0, DEPTH]];
const LEVEL = { 3: 11.4, 4: 15.2 };
const S1 = 6.4, m0 = 8, m1 = 16, N0 = 17.6;          // south row, middle zone, north row
const YS = 7.2, YN = 16.8;                              // corridor centre lines (the trays)
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
// Stores and lockers that fill the middle zone behind the small spaces, floor by floor.
const EXTRA = {
  3: [{ id: 'store-3w', kind: 'store', name: 'Furniture store', rect: [6.65, 10.62, LW0, 12] }],
  4: [
    { id: 'lockers-w', kind: 'store', name: 'Lockers and coats', rect: [0, 10.5, LW0, 12] },
    { id: 'duct-w', kind: 'shaft', name: 'Service duct', rect: [11.9, 12, LW0, m1] },
    { id: 'store-e', kind: 'store', name: 'Stationery store', rect: [39.5, m0, SB, 12] },
    { id: 'lockers-e', kind: 'store', name: 'Lockers', rect: [38.1, 12, SB, m1] },
  ],
};
const CORRIDORS = [
  { id: 'corridor-south', name: 'South corridor', rect: [0, S1, L, m0] },
  { id: 'corridor-north', name: 'North corridor', rect: [0, m1, L, N0] },
  { id: 'corridor-west', name: 'West link', rect: [LW0, m0, LW1, m1] },
  { id: 'corridor-east', name: 'East link', rect: [LE0, m0, LE1, m1] },
];
const RISER_RECT = CORE.find((c) => c.id === 'riser-1').rect;
const RISER = { id: 'dub-riser-1', name: 'Riser 1 (data)', rect: RISER_RECT, floors: ['3', '4'], from_level_m: 0, to_level_m: 19,
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

// ---------- Spaces: rows packed wall to wall ----------
// Each row lists its spaces west to east: [id, width along the row, options]. A row fixes the depth, the side the
// corridor is on and so the door wall. Options: back (the display wall's side: 'row' puts it away from the corridor,
// 'corridor' on it; the default is away), door [from, to] along the corridor wall, mirror, odd, notes, depth (a space
// shallower than the row). Banks (desks) are placed as they are, in the open.
const ROWS = {
  3: [
    { y0: 0, y1: S1, corridor: 'N', x0: 17.5, list: [
      ['dub-3-01', 6.4, { door: [2.2, 4.2], notes: ['Opposite the lift lobby: a wide opening onto the corridor.'] }],
      ['dub-3-02', 12.4, { door: [0.6, 2.0], mirror: true, notes: ['Laid along the facade, 12.4 × 6.4 m (the space type is 10.5 × 7.96 m).'] }],
      ['dub-3-10', 3.7, { door: [2.6, 3.5] }],
      ['dub-3-19', 4.0, { door: [0.4, 1.3], notes: ['An IT store off the south corridor, at the east end.'] }],
    ] },
    { y0: N0, y1: DEPTH, corridor: 'S', x0: 0, list: [
      ['dub-3-03', 5.4, { door: [0.3, 1.2], odd: [{ kind: 'window-wall', wall: 'left', note: 'Glass on the facade corner: no wall plates there' }] }],
      ['dub-3-04', 5.4, { door: [4.2, 5.1], odd: [{ kind: 'column', x_m: 4.7, y_m: 0.2, w_m: 0.5, d_m: 0.5, note: 'A structural column in the corner by the window' }] }],
      ['dub-3-05', 4.2, { door: [0.3, 1.2] }],
      ['dub-3-09', 5.4, { door: [0.3, 1.2], odd: [{ kind: 'window-wall', wall: 'front', note: 'A glass wall to the corridor' }] }],
      ['dub-3-06', 4.3, { door: [3.1, 4.0], notes: ['Door at the far end to clear the riser duct outside.'] }],
      ['dub-3-07', 3.66, { door: [0.3, 1.2] }],
      ['dub-3-08', 3.7, { door: [2.5, 3.4], odd: [{ kind: 'corner', x_m: 0, y_m: 5.6, w_m: 0.8, d_m: 0.8, note: 'A corner cut out for a rainwater pipe' }] }],
    ] },
    { y0: m0, y1: 12, corridor: 'S', x0: 6.65, list: [
      ['dub-3-11', 3.05, { depth: 2.62 }],
      ['dub-3-12', 2.9, { depth: 2.62 }],
    ] },
  ],
  4: [
    { y0: 0, y1: S1, corridor: 'N', x0: 0, list: [
      ['dub-4-15', 8.8, { door: [6.9, 8.3], odd: [{ kind: 'corner', x_m: 0, y_m: 0, w_m: 0.8, d_m: 0.9, note: 'A duct in the corner by the facade' }] }],
      ['dub-4-17', 18.6, { gap: 0.6 }],
      ['dub-4-18', 7, { gap: 0.8 }],
    ] },
    { y0: N0, y1: DEPTH, corridor: 'S', x0: 0, list: [
      ['dub-4-01', 4.2, { door: [0.3, 1.2], odd: [{ kind: 'column', x_m: 3.5, y_m: 3.2, w_m: 0.5, d_m: 0.5, note: 'A structural column on the long wall' }] }],
      ['dub-4-02', 3.66, { door: [2.4, 3.3] }],
      ['dub-4-20', 13, { gap: 0.8, y: 18.6 }],
      ['dub-4-19', 7, { gap: 0.8 }],
    ] },
    // Middle zone, west: focus rooms and copy and print on the south corridor, lockers behind them; huddle rooms on
    // the north corridor.
    { y0: m0, y1: 12, corridor: 'S', x0: 0, list: [
      ['dub-4-09', 2.44, { depth: 2.5 }], ['dub-4-10', 2.4, { depth: 2.5 }], ['dub-4-11', 2.44, { depth: 2.5 }], ['dub-4-12', 2.3, { depth: 2.5, notes: ['A little narrower than the others: the service duct is beside it.'] }],
      ['dub-4-16', 3.02, { depth: 2.5 }],
    ] },
    { y0: 12, y1: m1, corridor: 'N', x0: 0, list: [
      ['dub-4-03', 3.05, {}], ['dub-4-04', 2.9, { mirror: true }], ['dub-4-05', 3.05, {}], ['dub-4-06', 2.9, {}],
    ] },
    // Middle zone, east: two offices on the south corridor, two small huddle rooms on the north.
    { y0: m0, y1: 12, corridor: 'S', x0: LE1, list: [['dub-4-13', 2.9, {}], ['dub-4-14', 2.8, { notes: ['A little narrower than 4.13: the stationery store is beside it.'] }]] },
    { y0: 12, y1: m1, corridor: 'N', x0: LE1, list: [['dub-4-07', 2.15, {}], ['dub-4-08', 2.15, { odd: [{ kind: 'window-wall', wall: 'front', note: 'A glass wall to the corridor' }] }]] },
  ],
};
const BENCHES = {
  'dub-4-17': { size: [18.6, 6.2], benches: [[0.6, 0.7, 6], [6.6, 0.7, 6], [12.6, 0.7, 6], [0.6, 3.9, 6], [6.6, 3.9, 6], [12.6, 3.9, 6]], entry: ['front', 9.3] },
  'dub-4-18': { size: [7, 6.2], benches: [[1.8, 0.7, 4], [1.8, 3.9, 4]], entry: ['front', 3.5] },
  'dub-4-19': { size: [7, 6.2], benches: [[1.8, 0.7, 4], [1.8, 3.9, 4]], entry: ['back', 3.5] },
  'dub-4-20': { size: [13, 4], benches: [[0.3, 0.9, 8], [6.7, 0.9, 8]], entry: ['back', 6.5] },
};
const AREAS = {
  3: [
    { id: 'town-hall', kind: 'town-hall', name: 'Town hall area', rect: [0, 0, 17.5, S1] },
    { id: 'breakout-west', kind: 'breakout', name: 'Touchdown', rect: [0, m0, 6.65, m1] },
    { id: 'breakout-mid', kind: 'breakout', name: 'Quiet breakout', rect: [6.65, 12, LW0, m1] },
    { id: 'breakout-east', kind: 'breakout', name: 'Breakout', rect: [LE1, m0, SB, m1] },
    { id: 'breakout-north', kind: 'breakout', name: 'Café seating', rect: [32.06, N0, L, DEPTH] },
  ],
  4: [
    { id: 'open-south', kind: 'open-office', name: 'Open office', rect: [8.8, 0, 36.4, S1] },
    { id: 'breakout-south', kind: 'breakout', name: 'Touchdown', rect: [36.4, 0, L, S1] },
    { id: 'open-north', kind: 'open-office', name: 'Open office', rect: [7.86, N0, 37.5, DEPTH] },
    { id: 'breakout-east', kind: 'breakout', name: 'Breakout', rect: [37.5, N0, L, DEPTH] },
  ],
};
// Where the access points would go; each is nudged to the nearest clear spot (off rooms, the core and 1 m from trays).
const AP_WANT = {
  3: [['town-hall', 4.5, 3.2], ['town-hall', 12.5, 3.2], ['open', 3.2, 12], ['open', 9.6, 14.2], ['open', 36.5, 10.4], ['open', 37, 14.6], ['open', 35, 21], ['open', 41, 21]],
  4: [['open', 13.5, 3.2], ['open', 21.5, 3.2], ['open', 31.5, 3.2], ['open', 39.5, 3.2], ['open', 12, 21.3], ['open', 19.5, 21.3], ['open', 30, 21.3], ['open', 40, 21.3]],
};

// ---------- Solve each space's placement ----------
const TURN = { S: 0, E: 90, N: 180, W: 270 };
const place = (id, x0, row, opt) => {
  const s = raw.spaces[id], t = raw.types[s.space_type];
  const pg = t.keia_atlas?.geometry ?? {};
  const g = {};
  if (BENCHES[id]) {
    const b = BENCHES[id];
    const y = opt.y ?? (row.corridor === 'N' ? row.y1 - b.size[1] - 0.1 : row.y0 + 0.1);
    g.size_m = { width: b.size[0], depth: b.size[1] };
    g.on_floor = { x_m: r2(x0), y_m: r2(y), turn_deg: 0 };
    g.data_entry = { via: 'ceiling', wall: b.entry[0], at_m: b.entry[1] };
    g.benches = b.benches.map(([x, yy, n]) => ({ x_m: x, y_m: yy, desks: n }));
    return { g, width: b.size[0] };
  }
  const D = opt.depth ?? r2(row.y1 - row.y0);
  const W = opt.width;
  // The display wall away from the corridor; the door on the corridor wall (the front), unless the space type puts it
  // on the display wall, when the display wall faces the corridor instead.
  const doorOnBack = pg.door?.wall === 'back';
  const back = doorOnBack ? row.corridor : (row.corridor === 'N' ? 'S' : 'N');
  const turn = TURN[back];
  const y0 = back === 'S' ? (row.corridor === 'N' && !doorOnBack ? row.y1 - D : row.y0) : (row.corridor === 'S' ? row.y0 : row.y1 - D);
  const yy0 = row.corridor === 'N' ? row.y1 - D : row.y0;
  const origin = turn === 0 ? [x0, yy0] : [x0 + W, yy0 + D];
  if (W !== pg.width_m || D !== pg.depth_m) g.size_m = { width: W, depth: D };
  if (opt.mirror) g.mirror = true;
  g.on_floor = { x_m: r2(origin[0]), y_m: r2(origin[1]), turn_deg: turn };
  if (!doorOnBack) {
    const dw = pg.door ? r2(pg.door.to_m - pg.door.from_m) : 0.9;
    const [a, b] = opt.door ?? [0.3, r2(0.3 + dw)];
    g.door = { wall: 'front', from_m: a, to_m: b };
  }
  if (opt.odd) g.odd = opt.odd;
  const notes = [...(opt.notes ?? [])];
  const range = areaRange(t);
  if (range && g.size_m && !opt.notes) notes.push(`Built to its row: ${W} × ${D} m (the space type is ${pg.width_m} × ${pg.depth_m} m).`);
  if (!doorOnBack && pg.door?.wall === 'left') notes.push('Door on the corridor wall.');
  if (notes.length) g.notes = notes;
  void y0;
  return { g, width: W };
};

const placed = {};
for (const f of [3, 4]) for (const row of ROWS[f]) {
  let x = row.x0;
  for (const [id, w, opt] of row.list) {
    x += opt.gap ?? 0;
    const { g, width } = place(id, x, row, { ...opt, width: w });
    placed[id] = g;
    x = r2(x + width);
  }
}
for (const f of [3, 4]) {
  const id = `dub-${f}-21`;
  placed[id] = { size_m: { width: 4, depth: 3.4 }, on_floor: { x_m: COMMS_RECT[0], y_m: COMMS_RECT[1], turn_deg: 0 }, door: { wall: 'back', from_m: 2.6, to_m: 3.5 },
    notes: ['Comms room in the core, beside riser 1; the riser cupboard opens into it. The same place on every floor.'] };
}
for (const [id, g] of Object.entries(placed)) raw.spaces[id] = { ...raw.spaces[id], geometry: g };
// Sizes within each space type's range.
for (const id of Object.keys(placed)) {
  const s = raw.spaces[id], t = raw.types[s.space_type], r = areaRange(t);
  if (!r || (s.count ?? 1) > 1) continue;
  const geo = roomGeometry(s, t);
  if (geo.area < r.min - 1e-6 || geo.area > r.max + 1e-6) throw new Error(`${id}: ${geo.area} m² is outside ${r.min} to ${r.max}`);
}

// ---------- Build each floor ----------
const geoOf = (id) => roomGeometry(raw.spaces[id], raw.types[raw.spaces[id].space_type]);
const roomsOn = (f) => Object.keys(raw.spaces).filter((id) => raw.spaces[id].site === SITE && raw.spaces[id].floor === String(f) && raw.spaces[id].space_type !== OPEN_AREA).sort();
const coreOn = (f) => [...CORE, ...EXTRA[f]];
const blocked = (f) => [...roomsOn(f).filter((id) => (raw.spaces[id].count ?? 1) === 1).map((id) => geoOf(id).rect), ...coreOn(f).filter((c) => !c.circulation).map((c) => c.rect)];

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

// The access points as they are: ids, positions (their place in the open-area install) and models stay.
const oldFloor = (f) => parseDocument(readFileSync(path.join(ROOT, `data/floors/dub-${f}.yaml`), 'utf8')).toJS();
const floorsOut = {}, runsOut = [], apsOut = {};
const racks = Object.fromEntries(Object.values(raw.racks).map((r) => [r.id, r]));
const cables = Object.values(raw.cables).find((c) => c.site === SITE).cables;
for (const f of [3, 4]) {
  const trays = mainTrays(f);
  for (const id of roomsOn(f)) {
    if (/-21$/.test(id)) continue;
    const geo = geoOf(id);
    trays.push({ id: `t${f}-b-${id.replace(/^dub-/, '')}`, kind: 'basket', name: `Branch to ${raw.spaces[id].number} ${raw.spaces[id].name}`, path: branchTo(trays, [geo.entry[0], geo.entry[1]]), z_m: TRAY_Z, feeds: `room-${id}` });
  }
  const bl = blocked(f), areas = AREAS[f];
  const hall = areas.find((a) => a.kind === 'town-hall');
  const old = oldFloor(f).access_points;
  const aps = [];
  for (const [i, [area, x, y]] of AP_WANT[f].entries()) {
    const was = old[i];
    const ok = (p) => (area === 'open' ? !bl.some((r) => inRect(p, r, 0.3)) && !(hall && inRect(p, hall.rect, 0.3)) : inRect(p, hall.rect, -0.5))
      && trays.every((t) => distToPath(p, t.path) >= WIFI_RULE.clear_of_tray_m + 0.05) && p[0] > 0.8 && p[0] < L - 0.8 && p[1] > 0.8 && p[1] < DEPTH - 0.8
      && aps.every((a) => distToPath(p, trays.find((t) => t.feeds === `ap-${a.id}`).path) >= WIFI_RULE.clear_of_tray_m + 0.05);
    let at = null;
    for (let d = 0; d <= 4 && !at; d += 0.25) for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) {
      const p = [r2(x + dx), r2(y + dy)];
      if (!ok(p)) continue;
      const br = branchTo(trays, p);
      if (aps.some((a) => distToPath(a.at, br) < WIFI_RULE.clear_of_tray_m + 0.05)) continue;
      at = p; break;
    }
    if (!at) throw new Error(`floor ${f}: no clear spot for access point ${i + 1}`);
    const ap = { id: was.id, space: was.space, position: was.position, area: area === 'open' ? 'open' : hall.id, at, height_m: 2.7 };
    aps.push(ap);
    const n = was.id.replace(/^.*-ap/, '');
    trays.push({ id: `t${f}-b-ap${n}`, kind: 'basket', name: `Branch to access point ${was.id}`, path: branchTo(trays, at), z_m: TRAY_Z, feeds: `ap-${ap.id}` });
  }
  apsOut[f] = aps;
  floorsOut[f] = { trays, aps };
}

// ---------- Runs: panel ports, in the order the patch cords were recorded ----------
const draftFloor = (f) => ({ id: String(f), level_m: LEVEL[f], tray_m: TRAY_Z, raised_floor_m: 0.15, trays: floorsOut[f].trays, racks: [{ rack: `dub-${f}-21-r1`, at: RACK_AT, facing: 's' }] });
const patchedPorts = (rackId) => {
  const rk = racks[rackId]; const out = [];
  for (const c of cables) {
    if (c.role !== 'patch' || c.where?.rack !== rackId) continue;
    for (const e of [c.connects.from, c.connects.to]) {
      const it = e.u ? rk.items.find((x) => e.u >= x.u && e.u < x.u + x.size) : null;
      if (it?.kind !== 'patch-panel') continue;
      const [lo, hi] = String(e.ports).split('-').map(Number);
      for (let p = lo; p <= (hi || lo); p++) out.push({ u: it.u, size: it.size, port: p, purpose: c.purpose, cable: c.id, label: it.label });
    }
  }
  return out;
};
const label = (f, u, p) => `DUB-${f}.21-R1-U${String(u).padStart(2, '0')}-P${String(p).padStart(2, '0')}`;
const TEST_DATE = { old: '2022-01-24', new: '2026-09-19', ap3: '2024-11-08' };
const models = raw.models;
for (const f of [3, 4]) {
  const rackId = `dub-${f}-21-r1`;
  const fl = draftFloor(f); const G = trayGraph(fl.trays);
  const ports = patchedPorts(rackId).sort((a, b) => a.label.localeCompare(b.label) || a.port - b.port);
  // Every data outlet on the floor, room by room.
  const outlets = [];
  for (const id of roomsOn(f)) {
    const s = raw.spaces[id], t = raw.types[s.space_type];
    const opt = t.keia_atlas.options.find((o) => o.id === s.option);
    const fitted = raw.installs[id]?.fitted ?? [];
    const geo = geoOf(id);
    for (const o of roomOutlets(s, t, opt, fitted, geo, models)) {
      const cls = o.dev ? opt.equipment.find((e) => e.key === o.dev.replace(/^desk-\d+\//, '').replace(/#\d+$/, ''))?.class : null;
      outlets.push({ space: id, o, geo, video: ['video-bar', 'codec'].includes(cls) || /^poe-injector/.test(o.dev ?? '') });
    }
  }
  const isAvPanel = (p) => p.purpose === 'av';
  const avPorts = ports.filter(isAvPanel), dataPorts = ports.filter((p) => !isAvPanel(p));
  // Access points: floor 4 on switch ports 33 and 34 of four switches (2.5 GbE); floor 3 at the end of each panel.
  const apPortKeys = f === 4 ? [[38, 33], [38, 34], [34, 33], [34, 34], [30, 33], [30, 34], [26, 33], [26, 34]]
    : [[6, 37], [6, 38], [6, 39], [6, 40], [9, 41], [9, 42], [9, 43], [9, 44]];
  const apPorts = apPortKeys.map(([u, p]) => dataPorts.find((x) => x.u === u && x.port === p));
  const rest = dataPorts.filter((p) => !apPorts.includes(p));
  const video = f === 4 ? outlets.filter((x) => x.video) : [];
  const others = outlets.filter((x) => !video.includes(x));
  if (video.length !== avPorts.length && f === 4) throw new Error(`floor 4: ${video.length} video bar outlets for ${avPorts.length} AV panel ports`);
  if (others.length !== rest.length) throw new Error(`floor ${f}: ${others.length} outlets for ${rest.length} patched data panel ports`);
  const pairs = [...video.map((x, i) => [x, avPorts[i]]), ...others.map((x, i) => [x, rest[i]])];
  const mk = (p, to, outlet, date) => {
    const item = racks[rackId].items.find((x) => x.u === p.u);
    const R = routeRun({ floor: fl, G, rackAt: RACK_AT, item, outlet, geo: outlet.geo });
    if (!R) throw new Error(`no route for ${JSON.stringify(to)}`);
    const measured = r2(R.length - 0.2 + rand() * 0.4);
    return { id: label(f, p.u, p.port), kind: 'horizontal', type: 'cat6a', purpose: p.purpose, from: { rack: rackId, u: p.u, port: p.port }, to, via: R.via, length_m: R.length,
      test: { result: 'pass', date, length_m: measured, margin_db: r2(2.5 + rand() * 4) } };
  };
  for (const [x, p] of pairs) {
    const newPanel = f === 4 && [30, 26, 22].includes(p.u);
    const feedTray = fl.trays.find((t) => t.feeds === `room-${x.space}`);
    runsOut.push(mk(p, { space: x.space, outlet: x.o.id }, { ...x.o, at: x.o.at, feed: feedTray.path[feedTray.path.length - 1], geo: x.geo }, newPanel ? TEST_DATE.new : TEST_DATE.old));
  }
  apsOut[f].forEach((a, i) => {
    const feedTray = fl.trays.find((t) => t.feeds === `ap-${a.id}`);
    runsOut.push(mk(apPorts[i], { access_point: a.id }, { kind: 'ap', at: [a.at[0], a.at[1], a.height_m], feed: feedTray.path[feedTray.path.length - 1] }, f === 3 ? TEST_DATE.ap3 : TEST_DATE.new));
  });
}
// The riser fibre: 12 duplex OM4 between the MDF's floor riser panel and the IDF's fibre panel.
{
  const ladder = r2(Math.abs(RACK_AT[0] - RISER_C[0]) + Math.abs(RISER_C[1] - RACK_AT[1]));   // on each floor, from the riser to the rack along the ladder
  const drop = (u) => LADDER_Z - panelZ(u);
  const len = Math.ceil((ladder * 2 + (LEVEL[4] - LEVEL[3]) + drop(12) + drop(42) + 10) * 10) / 10;
  runsOut.push({ id: 'DUB-3.21-R1-U12-P01', kind: 'backbone', type: 'fibre-om4', purpose: 'fibre-mm', cores: 24, from: { rack: 'dub-3-21-r1', u: 12, ports: '1-12' }, to: { rack: 'dub-4-21-r1', u: 42, ports: '1-12' },
    via: ['t3-comms', 'dub-riser-1', 't4-comms'], length_m: len, test: { result: 'pass', date: TEST_DATE.old, loss_db: 0.9, notes: 'Worst core, 850 nm; made up.' },
    notes: 'Riser fibre, 12 duplex pairs (24 cores). Port n at one end is port n at the other. Includes a 5 m service loop at each end.' });
}

// ---------- Tray sizes from the cables each carries ----------
const SIZES = [[100, 60], [150, 60], [200, 60], [300, 60], [450, 60], [600, 60]];
const count = new Map();
for (const r of runsOut) for (const v of r.via) count.set(v, (count.get(v) ?? 0) + 1);
const LEADIN_VIA = ['dub-riser-1', 't3-comms'];
for (const v of LEADIN_VIA) count.set(v, (count.get(v) ?? 0) + 2);
for (const f of [3, 4]) for (const t of floorsOut[f].trays) {
  const n = count.get(t.id) ?? 0;
  if (t.kind === 'ladder') { t.capacity = trayCapacity(t.width_mm, t.depth_mm); continue; }
  const [w, d] = SIZES.find(([w0, d0]) => trayCapacity(w0, d0) >= Math.ceil(n * 1.25)) ?? SIZES[SIZES.length - 1];
  Object.assign(t, { width_mm: w, depth_mm: d, capacity: trayCapacity(w, d) });
}


// ---------- Write ----------
const flowShort = (doc) => { visit(doc, { Seq(_, n) { if (n.items.every((i) => isScalar(i) && typeof i.value === 'number') || (n.items.length && n.items.every((i) => isSeq(i) && i.flow))) n.flow = true; } }); return doc; };
const stringify = (obj, o = {}) => flowShort(new Document(obj)).toString({ lineWidth: 0, ...o });
const order = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const trayOut = (t) => order(t, ['id', 'kind', 'name', 'path', 'z_m', 'width_mm', 'depth_mm', 'capacity', 'feeds']);
for (const f of [3, 4]) {
  const doc = {
    site: SITE, floor: String(f), name: raw.sites.dub.floors.find((x) => x.id === String(f)).name, fictional: FICTION,
    level_m: LEVEL[f], slab_to_slab_m: 3.8, ceiling_m: 2.7, raised_floor_m: 0.15, tray_m: TRAY_Z,
    outline: OUTLINE, core: coreOn(f), corridors: CORRIDORS, areas: AREAS[f], risers: [RISER],
    racks: [{ rack: `dub-${f}-21-r1`, at: RACK_AT, facing: 's' }],
    trays: floorsOut[f].trays.map(trayOut),
    access_points: apsOut[f],
    notes: [
      `A ${L} × ${DEPTH} m floor plate: a row of spaces along each facade, two 1.6 m corridors, and a middle zone with the core (two stairs, three lifts, toilets, riser 1) and small spaces back to back either side of it. The comms room sits in the core beside the riser, one above the other on every floor.`,
      'Trays run in the corridor ceiling void at 3.1 m; a basket branches off to each space\'s data entry (above its door) and to each access point. Tray sizes are chosen for the cables they carry plus a quarter for growth, at a 40 percent fill.',
      f === 3 ? 'The town hall area by reception is where people gather, so it has U7 Pro Max access points (one per 100 m²); the rest of the open area has U7 Pro (one per 150 m²).' : 'Desks sit in the open along both facades; each bench is fed from the ceiling down a pole at its end and along its spine.',
    ],
  };
  writeFileSync(path.join(ROOT, `data/floors/dub-${f}.yaml`), `# Dublin office, ${doc.name.toLowerCase()}: the floor plan for the 3D model and the floor map. Made up (rule F9); written by\n# ${THIS}. Metres from the outline's south-west corner, x east, y north.\n${stringify(doc)}`);
}
// Runs: the same header, new routes.
{
  const file = path.join(ROOT, 'data/runs/dub.yaml');
  const text = readFileSync(file, 'utf8');
  const head = text.slice(0, text.indexOf('\nsite:') + 1).replace(/tools\/migrations\/[\w.-]+\.mjs/, THIS);
  const doc = parseDocument(text).toJS();
  doc.runs = runsOut;
  writeFileSync(file, head + stringify(doc));
}
// Circuits: the entry points line up with the riser.
{
  const file = path.join(ROOT, 'data/circuits/dub.yaml');
  const doc = parseDocument(readFileSync(file, 'utf8'));
  for (const e of doc.get('entry_points').items) { const at = e.get('at'); at.set(0, RISER_C[0]); }
  writeFileSync(file, doc.toString({ lineWidth: 0 }));
}
// Spaces: replace the geometry block, keeping each file's comments.
for (const [id, g] of Object.entries(placed)) {
  const file = path.join(ROOT, `data/spaces/dub/${id}.yaml`);
  const doc = parseDocument(readFileSync(file, 'utf8'));
  doc.set('geometry', doc.createNode(g));
  writeFileSync(file, flowShort(doc).toString({ lineWidth: 0 }));
}
const per = (f) => runsOut.filter((r) => r.from.rack === `dub-${f}-21-r1` && r.kind === 'horizontal');
console.log(`spaces placed ${Object.keys(placed).length}; runs ${runsOut.length} (floor 3 ${per(3).length}, floor 4 ${per(4).length}); longest ${Math.max(...runsOut.filter((r) => r.type === 'cat6a').map((r) => r.length_m))} m`);
