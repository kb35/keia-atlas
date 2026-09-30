// One-off generator, 30 Sept 2026: the Dublin floors pilot. Run once; its output is committed.
// Later the same day tools/migrations/2026-09-30-office-floors.mjs moved the access points it writes into units in
// each floor's open-area install (data/installs/dub/dub-<floor>-open.yaml); run that after this if this is ever rerun.
//
//   node tools/migrations/2026-09-30-dublin-floors.mjs
//
// Writes, for the Dublin office (site dub), floors 3 and 4:
//   data/floors/dub-3.yaml, dub-4.yaml   outline, core, corridors, areas, the riser, racks, trays, access points
//   data/spaces/dub/*.yaml               a `geometry` block on every room: where it sits, and how it differs from
//                                        its profile (size, mirror, door, columns and odd corners, benches for desks)
//   data/runs/dub.yaml                   a permanent link from a panel port to every data outlet and access point,
//                                        and the riser fibre between the MDF and the IDF
//   data/circuits/dub.yaml               the two providers' circuits and the building entry
//
// Everything is made up (rule F9). Room sizes come from the room profiles; the layout, the trays and the lengths
// are invented to look like a real 60 x 24 m office floor with a central core. Lengths are measured on the model
// with the same functions the checks use (src/lib/floors.mjs), so a check never disagrees with this file. Panel
// ports follow the patch cords already recorded in data/cables/dub.yaml: nothing there changes.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parseDocument, Document, visit, isScalar, isSeq } from 'yaml';
import { FICTION, loadRaw, roomGeometry, roomOutlets, trayGraph, routeRun, trayCapacity, inRect, overlapArea, distToPath, polyArea, rectArea, WIFI_RULE, panelZ, pathLength } from '../../src/lib/floors.mjs';

const ROOT = process.cwd();
const raw = loadRaw(ROOT);
const SITE = 'dub';
const r2 = (v) => Math.round(v * 100) / 100;
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---------- The building: one outline and one core, stacked ----------
const OUTLINE = [[0, 0], [60, 0], [60, 24], [0, 24]];
const LEVEL = { 3: 11.4, 4: 15.2 };
const CORE = [
  { id: 'stair-a', kind: 'stair', name: 'Stair A', rect: [22, 9, 25.5, 15] },
  { id: 'lift-lobby', kind: 'lift-lobby', name: 'Lift lobby', rect: [25.5, 9, 31.5, 11.4], circulation: true },
  { id: 'lifts', kind: 'lift', name: 'Lifts 1 to 3', rect: [25.5, 11.4, 31.5, 15], count: 3 },
  { id: 'riser-1', kind: 'riser', name: 'Riser 1 (data)', rect: [31.5, 12.4, 33, 15] },
  { id: 'store', kind: 'store', name: "Cleaner's store and plant", rect: [33, 12.4, 35.5, 15] },
  { id: 'toilets', kind: 'toilets', name: 'Toilets and accessible toilet', rect: [35.5, 9, 40, 15] },
  { id: 'stair-b', kind: 'stair', name: 'Stair B (escape)', rect: [56.5, 9, 60, 15] },
];
const CORRIDORS = [
  { id: 'corridor-south', name: 'South corridor', rect: [4, 7.2, 56.5, 9] },
  { id: 'corridor-north', name: 'North corridor', rect: [4, 15, 56.5, 16.8] },
  { id: 'corridor-west', name: 'West link', rect: [20.2, 9, 22, 15] },
  { id: 'corridor-east', name: 'East link', rect: [40, 9, 41.8, 15] },
];
const RISER = { id: 'dub-riser-1', name: 'Riser 1 (data)', rect: [31.5, 12.4, 33, 15], floors: ['3', '4'], from_level_m: 0, to_level_m: 19,
  sleeves: 4, sleeve_mm: 100, carries: 'Riser fibre between the MDF and the IDF, and both providers\' fibre from the ground floor entry', notes: 'Fire-stopped at each floor. Both providers\' lead-ins share it: a single path, recorded as a risk.' };
const COMMS_RECT = [31.5, 9, 35.5, 12.4];
const RACK_AT = [33.6, 10.9];
const RISER_C = [32.25, 13.7];
const TRAY_Z = 3.1, LADDER_Z = 2.4;
const mainTrays = (f) => [
  { id: `t${f}-comms`, kind: 'ladder', name: 'Ladder in the comms room', path: [RISER_C, [32.25, 10.9], RACK_AT, [34.8, 10.9], [34.8, 8.1]], z_m: LADDER_Z, width_mm: 450, depth_mm: 100 },
  { id: `t${f}-south-w`, kind: 'tray', name: 'South corridor tray, west', path: [[34.8, 8.1], [4.9, 8.1]], z_m: TRAY_Z },
  { id: `t${f}-south-e`, kind: 'tray', name: 'South corridor tray, east', path: [[34.8, 8.1], [55.6, 8.1]], z_m: TRAY_Z },
  { id: `t${f}-link-w`, kind: 'tray', name: 'West link tray', path: [[21.1, 8.1], [21.1, 15.9]], z_m: TRAY_Z },
  { id: `t${f}-link-e`, kind: 'tray', name: 'East link tray', path: [[40.9, 8.1], [40.9, 15.9]], z_m: TRAY_Z },
  { id: `t${f}-north-w`, kind: 'tray', name: 'North corridor tray, west', path: [[21.1, 15.9], [4.9, 15.9]], z_m: TRAY_Z },
  { id: `t${f}-north-m`, kind: 'tray', name: 'North corridor tray, middle', path: [[21.1, 15.9], [40.9, 15.9]], z_m: TRAY_Z },
  { id: `t${f}-north-e`, kind: 'tray', name: 'North corridor tray, east', path: [[40.9, 15.9], [55.6, 15.9]], z_m: TRAY_Z },
];

// ---------- Rooms: where each sits, and what is odd about it ----------
// back: the side of the plan the room's display (back) wall faces; door: the side its door faces. x0, y0: the
// footprint's south-west corner. size: the real size where it differs from the profile. The rest is recorded as is.
const ROOMS = {
  // Third floor: meeting rooms along the north facade, reception at the lifts, the pantry and town hall south.
  'dub-3-01': { x0: 25.3, y0: 2.2, back: 'S', size: [6.4, 5.0], doorWall: 'front', door: [2.6, 4.2], notes: ['Opens onto the lift lobby, so the door is on the lobby side, not where the profile puts it.'] },
  'dub-3-02': { x0: 40.9, y0: 0, back: 'S', door: 'E', size: [11.6, 7.2], notes: ['Stretched to the full depth of the south band (the profile room is 10.5 × 7.96 m).'] },
  'dub-3-03': { x0: 0.5, y0: 19.2, back: 'W', door: 'S', size: [4.8, 9.2], odd: [{ kind: 'window-wall', wall: 'left', note: 'Glass on the facade side: no wall plates there' }] },
  'dub-3-04': { x0: 10.2, y0: 19.4, back: 'E', door: 'S', size: [4.6, 9.4], odd: [{ kind: 'column', x_m: 4.0, y_m: 4.6, w_m: 0.5, d_m: 0.5, note: 'A structural column in the corner by the window' }] },
  'dub-3-05': { x0: 26, y0: 20.34, back: 'W', door: 'S' },
  'dub-3-06': { x0: 34, y0: 20.34, back: 'E', door: 'S', doorMove: [1.0, 1.9], notes: ['Door moved towards the display end to clear the riser duct outside.'] },
  'dub-3-07': { x0: 42, y0: 20.34, back: 'W', door: 'S' },
  'dub-3-08': { x0: 48.5, y0: 20.34, back: 'E', door: 'S', odd: [{ kind: 'corner', x_m: 0, y_m: 5.3, w_m: 0.9, d_m: 0.8, note: 'A corner cut out for a rainwater pipe' }] },
  'dub-3-09': { x0: 20.4, y0: 17.4, back: 'E', door: 'S', odd: [{ kind: 'window-wall', wall: 'right', note: 'A glass wall to the facade' }] },
  'dub-3-10': { x0: 33, y0: 0, back: 'S', door: 'W', size: [5.7, 4.1] },
  'dub-3-11': { x0: 55.5, y0: 20.95, back: 'W', door: 'S' },
  'dub-3-12': { x0: 17.5, y0: 12.2, back: 'W', door: 'N' },
  'dub-3-21': { comms: true },
  // Fourth floor: small rooms and offices north, desks south, focus rooms beside the core.
  'dub-4-01': { x0: 8.4, y0: 20.2, back: 'W', door: 'S', size: [3.8, 7.4], odd: [{ kind: 'column', x_m: 3.3, y_m: 3.5, w_m: 0.5, d_m: 0.5, note: 'A structural column on the long wall' }] },
  'dub-4-02': { x0: 16.2, y0: 20.34, back: 'E', door: 'S' },
  'dub-4-03': { x0: 22.7, y0: 20.95, back: 'W', door: 'S' },
  'dub-4-04': { x0: 26.7, y0: 20.95, back: 'E', door: 'S' },
  'dub-4-05': { x0: 30.8, y0: 20.34, back: 'S', odd: [{ kind: 'column', x_m: 2.4, y_m: 3.0, w_m: 0.45, d_m: 0.45, note: 'A column in the corner behind the sofa' }] },
  'dub-4-06': { x0: 34.2, y0: 20.34, back: 'S' },
  'dub-4-07': { x0: 37.7, y0: 21.33, back: 'W', door: 'S' },
  'dub-4-08': { x0: 41.0, y0: 21.33, back: 'E', door: 'S', odd: [{ kind: 'window-wall', wall: 'front', note: 'A glass wall to the facade' }] },
  'dub-4-09': { x0: 9.6, y0: 12.56, back: 'W', door: 'N' },
  'dub-4-10': { x0: 12.2, y0: 12.56, back: 'W', door: 'N' },
  'dub-4-11': { x0: 14.8, y0: 12.56, back: 'W', door: 'N' },
  'dub-4-12': { x0: 17.4, y0: 12.56, back: 'W', door: 'N', size: [2.44, 2.2], notes: ['A little shallower than the others: the stair wall is thicker here.'] },
  'dub-4-13': { x0: 0.5, y0: 20.95, back: 'S' },
  'dub-4-14': { x0: 4.3, y0: 20.95, back: 'S', size: [3.5, 3.05] },
  'dub-4-15': { x0: 0.5, y0: 0, back: 'S', door: 'E', odd: [{ kind: 'corner', x_m: 7.7, y_m: 0, w_m: 0.8, d_m: 0.9, note: 'A duct in the corner by the facade' }] },
  'dub-4-16': { x0: 44.5, y0: 4.4, back: 'W', door: 'N' },
  'dub-4-17': { bank: true, x0: 10, y0: 0.6, size: [18.6, 6.2], benches: [[0.6, 0.7, 6], [6.6, 0.7, 6], [12.6, 0.7, 6], [0.6, 3.9, 6], [6.6, 3.9, 6], [12.6, 3.9, 6]], entry: ['front', 9.3] },
  'dub-4-18': { bank: true, x0: 29.2, y0: 0.6, size: [7, 6.2], benches: [[0.4, 0.7, 4], [0.4, 3.9, 4]], entry: ['front', 3.5] },
  'dub-4-19': { bank: true, x0: 36.8, y0: 0.6, size: [7, 6.2], benches: [[0.4, 0.7, 4], [0.4, 3.9, 4]], entry: ['front', 3.5] },
  'dub-4-20': { bank: true, x0: 45, y0: 19.5, size: [13, 4], benches: [[0.3, 0.9, 8], [6.7, 0.9, 8]], entry: ['back', 6.5] },
  'dub-4-21': { comms: true },
};
// Town hall area on the third floor, beside the pantry: people gather here, so its access points are the Pro Max.
const AREAS = { 3: [{ id: 'town-hall', kind: 'town-hall', name: 'Town hall area', rect: [4, 0.4, 20, 7.2] }, { id: 'breakout-east', kind: 'breakout', name: 'Breakout', rect: [41.8, 9, 56.5, 15] }],
  4: [{ id: 'breakout-west', kind: 'breakout', name: 'Touchdown and breakout', rect: [0, 9, 9.4, 15] }, { id: 'breakout-east', kind: 'breakout', name: 'Breakout', rect: [41.8, 9, 56.5, 15] }] };
// Where the access points would go on a regular grid; each is nudged to the nearest spot in the open area that is
// clear of rooms, the core and every tray (the Wi-Fi standard's 1 m from metal).
const AP_WANT = {
  3: [['town-hall', 8, 3.8], ['town-hall', 16, 3.8], ['open', 5, 17.8], ['open', 30, 18.4], ['open', 48, 18.4], ['open', 11, 12], ['open', 49, 12], ['open', 38, 4.6]],
  4: [['open', 7.5, 4], ['open', 22.5, 4], ['open', 37.5, 4], ['open', 52.5, 4], ['open', 7.5, 18.4], ['open', 22.5, 18.4], ['open', 37.5, 18.4], ['open', 52.5, 18.4]],
};

// ---------- Solve each room's placement ----------
const SIDE_BY_TURN = { back: { 0: 'S', 90: 'E', 180: 'N', 270: 'W' }, left: { 0: 'W', 90: 'S', 180: 'E', 270: 'N' } };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
// Which of the room's own walls faces a side of the plan (left is x = 0 in the room's frame).
const wallFacing = (turn, side) => {
  const b = SIDE_BY_TURN.back[turn], l = SIDE_BY_TURN.left[turn];
  return side === b ? 'back' : side === OPP[b] ? 'front' : side === l ? 'left' : 'right';
};
function place(id, spec) {
  const s = raw.spaces[id], t = raw.types[s.space_type];
  const pg = t.keia_atlas.geometry;
  if (spec.comms) {
    return { size_m: { width: 4, depth: 3.4 }, on_floor: { x_m: COMMS_RECT[0], y_m: COMMS_RECT[1], turn_deg: 0 }, door: { wall: 'back', from_m: 2.6, to_m: 3.5 },
      notes: ['Comms room in the core, beside riser 1; the riser cupboard opens into it.'] };
  }
  const [W, D] = spec.size ?? [pg.width_m, pg.depth_m];
  const turn = { S: 0, E: 90, N: 180, W: 270 }[spec.back ?? 'S'];
  let mirror = false;
  if (spec.door && !spec.bank) {
    const pw = pg.door?.wall;   // left or back
    if (pw === 'left') {
      const w = wallFacing(turn, spec.door);
      if (w === 'left') mirror = false;
      else if (w === 'right') mirror = true;
      else throw new Error(`${id}: a left-wall door cannot face ${spec.door} with the back wall to ${spec.back}`);
    } else if (pw === 'back' && spec.door !== spec.back) throw new Error(`${id}: the door is on the back wall`);
  }
  // Origin so the footprint's south-west corner is (x0, y0).
  const ext = turn % 180 === 0 ? [W, D] : [D, W];
  const origin = { 0: [spec.x0, spec.y0], 90: [spec.x0 + ext[0], spec.y0], 180: [spec.x0 + ext[0], spec.y0 + ext[1]], 270: [spec.x0, spec.y0 + ext[1]] }[turn];
  const g = {};
  if (spec.size) g.size_m = { width: W, depth: D };
  if (mirror) g.mirror = true;
  g.on_floor = { x_m: r2(origin[0]), y_m: r2(origin[1]), turn_deg: turn };
  if (spec.doorWall) g.door = { wall: spec.doorWall, from_m: spec.door[0], to_m: spec.door[1] };
  if (spec.doorMove) {
    const pd = pg.door; const wall = pd.wall === 'left' ? (mirror ? 'right' : 'left') : pd.wall;
    g.door = { wall, from_m: spec.doorMove[0], to_m: spec.doorMove[1] };
  }
  if (spec.bank) {
    g.data_entry = { via: 'ceiling', wall: spec.entry[0], at_m: spec.entry[1] };
    g.benches = spec.benches.map(([x, y, n]) => ({ x_m: x, y_m: y, desks: n }));
  }
  if (spec.odd) g.odd = spec.odd;
  if (spec.notes) g.notes = spec.notes;
  return g;
}

const placed = {};
for (const [id, spec] of Object.entries(ROOMS)) placed[id] = place(id, spec);
for (const [id, g] of Object.entries(placed)) raw.spaces[id] = { ...raw.spaces[id], geometry: g };

// ---------- Build each floor ----------
const geoOf = (id) => roomGeometry(raw.spaces[id], raw.types[raw.spaces[id].space_type]);
const roomsOn = (f) => Object.keys(raw.spaces).filter((id) => raw.spaces[id].site === SITE && raw.spaces[id].floor === String(f)).sort();
const blocked = (f) => [...roomsOn(f).filter((id) => (raw.spaces[id].count ?? 1) === 1).map((id) => geoOf(id).rect), ...CORE.filter((c) => !c.circulation).map((c) => c.rect)];

// A branch from the nearest corridor tray to a point: straight across where it can, else with one bend.
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

const floorsOut = {}, runsOut = [], apsOut = {};
const racks = Object.fromEntries(Object.values(raw.racks).map((r) => [r.id, r]));
const cables = Object.values(raw.cables).find((c) => c.site === SITE).cables;
let tagNo = 3101;
for (const f of [3, 4]) {
  const trays = mainTrays(f);
  // Rooms' feeds (not the comms room: its ladder is its own).
  for (const id of roomsOn(f)) {
    if (ROOMS[id]?.comms) continue;
    const geo = geoOf(id);
    trays.push({ id: `t${f}-b-${id.replace(/^dub-/, '')}`, kind: 'basket', name: `Branch to ${raw.spaces[id].number} ${raw.spaces[id].name}`, path: branchTo(trays, [geo.entry[0], geo.entry[1]]), z_m: TRAY_Z, feeds: `room-${id}` });
  }
  // Access points: nudge each to a clear spot, then feed it.
  const bl = blocked(f), areas = AREAS[f];
  const hall = areas.find((a) => a.kind === 'town-hall');
  const aps = [];
  for (const [i, [area, x, y]] of AP_WANT[f].entries()) {
    const ok = (p) => (area === 'open' ? !bl.some((r) => inRect(p, r, 0.3)) && !(hall && inRect(p, hall.rect, 0.3)) : inRect(p, hall.rect, -0.5))
      && trays.every((t) => distToPath(p, t.path) >= WIFI_RULE.clear_of_tray_m + 0.05) && p[0] > 0.8 && p[0] < 59.2 && p[1] > 0.8 && p[1] < 23.2;
    let at = null;
    for (let d = 0; d <= 4 && !at; d += 0.25) for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, d], [d, -d], [-d, -d]]) { const p = [r2(x + dx), r2(y + dy)]; if (ok(p)) { at = p; break; } }
    if (!at) throw new Error(`floor ${f}: no clear spot for access point ${i + 1}`);
    const n = String(i + 1).padStart(2, '0'), no = String(tagNo++).padStart(6, '0');
    const ap = { id: `dub-${f}-ap${n}`, hostname: `dub-${f}-ap${n}`, model: area === 'town-hall' ? 'unifi-u7-pro-max' : 'unifi-u7-pro', area, at, height_m: 2.7,
      serial: `DEMO-DUB-${no}`, asset_tag: `AG-${no}`, stage: 'manage', installed: f === 3 ? '2024-11-12' : '2026-09-22' };
    aps.push(ap);
    trays.push({ id: `t${f}-b-ap${n}`, kind: 'basket', name: `Branch to access point ${ap.hostname}`, path: branchTo(trays, at), z_m: TRAY_Z, feeds: `ap-${ap.id}` });
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
  const ladder = 1.35 + 2.8;   // on each floor, from the riser to the rack along the ladder
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
// Coordinates and short lists on one line: [x, y] rather than a column of numbers.
const flowShort = (doc) => { visit(doc, { Seq(_, n) { if (n.items.every((i) => isScalar(i) && typeof i.value === 'number') || (n.items.length && n.items.every((i) => isSeq(i) && i.flow))) n.flow = true; } }); return doc; };
const stringify = (obj, o = {}) => flowShort(new Document(obj)).toString({ lineWidth: 0, ...o });
const order = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const trayOut = (t) => order(t, ['id', 'kind', 'name', 'path', 'z_m', 'width_mm', 'depth_mm', 'capacity', 'feeds']);
mkdirSync(path.join(ROOT, 'data/floors'), { recursive: true });
for (const f of [3, 4]) {
  const doc = {
    site: SITE, floor: String(f), name: raw.sites.dub.floors.find((x) => x.id === String(f)).name, fictional: FICTION,
    level_m: LEVEL[f], slab_to_slab_m: 3.8, ceiling_m: 2.7, raised_floor_m: 0.15, tray_m: TRAY_Z,
    outline: OUTLINE, core: CORE, corridors: CORRIDORS, areas: AREAS[f], risers: [RISER],
    racks: [{ rack: `dub-${f}-21-r1`, at: RACK_AT, facing: 's' }],
    trays: floorsOut[f].trays.map(trayOut),
    access_points: apsOut[f],
    notes: [
      'A 60 × 24 m floor plate with a central core (two stairs, three lifts, toilets, riser 1). The comms room sits in the core beside the riser, one above the other on every floor.',
      'Trays run in the corridor ceiling void at 3.1 m; a basket branches off to each room\'s data entry (above its door) and to each access point. Tray sizes are chosen for the cables they carry plus a quarter for growth, at a 40 percent fill.',
      f === 3 ? 'The town hall area by the pantry is where people gather, so it has U7 Pro Max access points (one per 100 m²); the rest of the open area has U7 Pro (one per 150 m²).' : 'Desks sit in the open area; each bench is fed from the ceiling down a pole at its end and along its spine.',
    ],
  };
  writeFileSync(path.join(ROOT, `data/floors/dub-${f}.yaml`), `# Dublin office, ${doc.name.toLowerCase()}: the floor plan for the 3D model and the floor map. Made up (rule F9); written by\n# tools/migrations/2026-09-30-dublin-floors.mjs. Metres from the outline's south-west corner, x east, y north.\n${stringify(doc)}`);
}
mkdirSync(path.join(ROOT, 'data/runs'), { recursive: true });
const runsDoc = {
  site: SITE, fictional: FICTION,
  limits: {
    copper_link_m: 90, copper_channel_m: 100,
    sources: [
      { title: 'ANSI/TIA-568.2-D: 90 m permanent link, 100 m channel (named in the house cabling standard)', url: 'https://tiaonline.org/products-and-services/tia-standards/' },
      { title: 'Category 6 cable (Wikipedia): 90 m of solid horizontal cable plus patch cords, 100 m in all', url: 'https://en.wikipedia.org/wiki/Category_6_cable' },
    ],
  },
  allowance: { rack_slack_m: 3, outlet_slack_m: 0.3, outlet_cord_m: 5, notes: 'House: a 3 m service loop at the panel and 0.3 m at the outlet are in each length; the channel check adds the recorded patch cord and 5 m for the device cord.' },
  tester: 'A calibrated Cat6A certification tester (made up); every result is invented for the demo.',
  runs: runsOut,
};
writeFileSync(path.join(ROOT, 'data/runs/dub.yaml'), `# Permanent links at the Dublin office: one run from a comms room patch panel port to every data outlet and access point,\n# and the riser fibre. Made up (rule F9); written by tools/migrations/2026-09-30-dublin-floors.mjs. The id is the\n# label on the panel end (SITE-ROOM-RACK-UNIT-PORT).\n${stringify(runsDoc, { lineWidth: 0 })}`);
mkdirSync(path.join(ROOT, 'data/circuits'), { recursive: true });
const circDoc = {
  site: SITE, fictional: 'Made up for the demo: the providers, the entry and the lead-in lengths are invented.',
  entry_points: [
    { id: 'dub-entry-south', name: 'Telecoms entry, south duct (ground floor)', level_m: 0, at: [32.25, 0], notes: 'A duct from the street into the ground floor telecoms room, then up riser 1.' },
    { id: 'dub-entry-north', name: 'Telecoms entry, north duct (ground floor)', level_m: 0, at: [32.25, 24], notes: 'A second duct from the other street, for a diverse route into the building.' },
  ],
  circuits: [
    { id: 'dub-isp-1', name: 'Internet circuit 1', provider: 'Carrier One', role: 'primary', type: 'Dedicated internet access over fibre, handed off as Ethernet', bandwidth: 'Not recorded', entry: 'dub-entry-south',
      lead_in: { type: 'fibre-os2', cores: 2, length_m: 42, via: LEADIN_VIA }, panel: { rack: 'dub-3-21-r1', u: 42, ports: '13-14' },
      handoff: { rack: 'dub-3-21-r1', u: 24, customer: [1], network: [5, 6] }, firewall: { rack: 'dub-3-21-r1', u: 22, port: 2 }, cables: ['dub-cb-13', 'dub-cb-11'] },
    { id: 'dub-isp-2', name: 'Internet circuit 2', provider: 'Carrier Two', role: 'secondary', type: 'Dedicated internet access over fibre, handed off as Ethernet', bandwidth: 'Not recorded', entry: 'dub-entry-north',
      lead_in: { type: 'fibre-os2', cores: 2, length_m: 55, via: LEADIN_VIA }, panel: { rack: 'dub-3-21-r1', u: 42, ports: '15-16' },
      handoff: { rack: 'dub-3-21-r1', u: 24, customer: [2], network: [7, 8] }, firewall: { rack: 'dub-3-21-r1', u: 23, port: 2 }, cables: ['dub-cb-13', 'dub-cb-12'] },
  ],
  notes: ['Both lead-ins come up riser 1, so the two circuits share one path inside the building: worth a second riser when the building allows.'],
};
writeFileSync(path.join(ROOT, 'data/circuits/dub.yaml'), `# The internet in and out of the Dublin office: two providers' circuits, from the building entry to the firewalls. Made up;\n# written by tools/migrations/2026-09-30-dublin-floors.mjs. The providers' boxes are the ADVA pair at U24 in the MDF.\n${stringify(circDoc, { lineWidth: 0 })}`);
// Rooms: add the geometry block, keeping each file's comments.
for (const [id, g] of Object.entries(placed)) {
  const file = path.join(ROOT, `data/spaces/dub/${id}.yaml`);
  const doc = parseDocument(readFileSync(file, 'utf8'));
  doc.set('geometry', doc.createNode(g));
  writeFileSync(file, flowShort(doc).toString({ lineWidth: 0 }));
}
// Summary.
const per = (f) => runsOut.filter((r) => r.from.rack === `dub-${f}-21-r1` && r.kind === 'horizontal');
console.log(`rooms placed ${Object.keys(placed).length}; runs ${runsOut.length} (floor 3 ${per(3).length}, floor 4 ${per(4).length}); access points ${apsOut[3].length + apsOut[4].length}; longest ${Math.max(...runsOut.filter((r) => r.type === 'cat6a').map((r) => r.length_m))} m`);
