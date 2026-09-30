// Floors, cable runs and the internet circuits, joined into one building model (rule F9).
//
// Reads data/floors/<site>-<floor>.yaml (outline, core, corridors, areas, risers, racks, trays, where each access
// point hangs), the access points themselves (units in the floor's "Open areas and corridors" install),
// the rooms' `geometry` (where each room sits on its floor and how it differs from its profile), the racks and
// patch cables, data/runs/<site>.yaml (permanent links, panel port to outlet, and the riser fibre) and
// data/circuits/<site>.yaml (the providers' circuits and the building entry). From them:
//
//   building(site)        the model the office pages and the 3D view read: floors, rooms with their footprints,
//                         outlets and variations, core, trays (with how many cables each carries), risers, racks,
//                         runs (with a 3D path), access points and circuits, all in building metres
//   trace(model, ref)     from a unit (asset tag, hostname, "room/position"), an outlet ("room:data/..."), an access
//                         point or a run id: the ordered hops out to the internet
//   healthHooks(model)    the ids the live feeds report on (units by asset tag, rooms, runs, circuits)
//
// Coordinates: x east and y north on the floor plan, in metres from the outline's south-west corner; z up. A room's
// own frame is the room drawing's (src/lib/room3d.mjs): x along the display wall, y away from it. `on_floor` puts
// that frame's origin on the plan and turns it (0, 90, 180 or 270 degrees, anticlockwise); `mirror` builds the
// room the other way round first; `size_m` stretches the profile's layout to the real size.
//
// Everything here is pure except loadRaw(), which reads the files; the checks (tools/crossrefs-floors.mjs) and the
// generator (tools/migrations/2026-09-30-dublin-floors.mjs) use the same functions, so they always agree.
import { readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadYaml } from './demo-clock.mjs';
import { buildRoom, outletPlates, parseEnd, devKey } from './room3d.mjs';

export const FICTION = 'Fictional floor plan: space sizes from the space types; layout, trays and cable lengths made up for the demo.';
export const U_M = 0.04445;              // one rack unit
export const RACK_BASE_M = 0.1;          // plinth and castors under U1
export const SLACK = { rack: 3, outlet: 0.3 };   // house: service loop at the panel, spare at the outlet
export const OUTLET_CORD_M = 5;          // house allowance for the device cord at the outlet end, for the channel check
export const CABLE_OD_MM = 7.5;          // Cat6A U/UTP, a typical outside diameter (house figure)
export const TRAY_FILL = 0.4;            // house fill limit: 40 percent of the tray's cross-section
export const DESK = { w: 1.52, d: 0.76, module_z: 0.77 };   // 60 x 30 in desks back to back (workstation profile)
export const WIFI_RULE = { open_m2: 150, gathering_m2: 100, clear_of_tray_m: 1 };   // data/standards/wifi.yaml

// ---------- Small geometry ----------
const r2 = (v) => Math.round(v * 100) / 100;
export const rectArea = ([x0, y0, x1, y1]) => (x1 - x0) * (y1 - y0);
export const overlapArea = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
export const inRect = ([x, y], [x0, y0, x1, y1], e = 1e-6) => x >= x0 - e && x <= x1 + e && y >= y0 - e && y <= y1 + e;
export function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0; } return Math.abs(a) / 2; }
export function inPoly([x, y], pts, e = 1e-6) {
  // On an edge counts as inside.
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    if (Math.abs((bx - ax) * (y - ay) - (by - ay) * (x - ax)) < e && x >= Math.min(ax, bx) - e && x <= Math.max(ax, bx) + e && y >= Math.min(ay, by) - e && y <= Math.max(ay, by) + e) return true;
  }
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const onSeg = (p, a, b, e = 1e-6) => Math.abs(dist(a, p) + dist(p, b) - dist(a, b)) < e;
export const pathLength = (pts) => pts.slice(1).reduce((n, p, i) => n + dist(pts[i], p), 0);
// Shortest plan distance from a point to a polyline.
export function distToPath(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]]; const L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2)) : 0;
    best = Math.min(best, dist(p, [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]));
  }
  return best;
}
// Whether two polylines touch: an end of one lies on the other.
export function touches(A, B, e = 1e-6) {
  const onPath = (p, P) => P.slice(1).some((q, i) => onSeg(p, P[i], q, e));
  return [A[0], A[A.length - 1]].some((p) => onPath(p, B)) || [B[0], B[B.length - 1]].some((p) => onPath(p, A));
}
const pathTouchesRect = (P, rect) => [P[0], P[P.length - 1]].some((p) => inRect(p, rect, 0.01));

// ---------- Rooms on the floor ----------
const quant = (q) => (typeof q === 'number' ? q : q === 'tbd' ? 1 : q?.max ?? 1);
// The profile's area range: its published range, or 10 percent either side of a single figure.
export function areaRange(type) {
  const a = type?.keia_atlas?.area;
  if (!a) return null;
  if (typeof a.m2 === 'object') return { min: a.m2.min, max: a.m2.max, basis: 'range' };
  return { min: r2(a.m2 * 0.9), max: r2(a.m2 * 1.1), basis: 'ten-percent' };
}
const WALLS = ['back', 'right', 'front', 'left'];
export const MIRROR_WALL = { left: 'right', right: 'left', back: 'back', front: 'front' };

// One room's shell and where it sits: its size, door, data entry and the transform from its own frame to the plan.
export function roomGeometry(space, type) {
  const g = space.geometry ?? {};
  const prof = type?.keia_atlas?.geometry ?? null;
  const banked = (space.count ?? 1) > 1;
  const W0 = prof?.width_m ?? null, D0 = prof?.depth_m ?? null;
  const W = g.size_m?.width ?? (banked ? null : W0), D = g.size_m?.depth ?? (banked ? null : D0);
  if (!g.on_floor || W == null || D == null) return null;
  const mirror = !!g.mirror, turn = g.on_floor.turn_deg ?? 0, ox = g.on_floor.x_m, oy = g.on_floor.y_m;
  const sx = W0 && !banked ? W / W0 : 1, sy = D0 && !banked ? D / D0 : 1;
  // Profile coordinates to the room's own (as built) frame, and the room's frame to the plan.
  const fromProfile = ([x, y, z = 0]) => { let lx = x * sx; if (mirror) lx = W - lx; return [lx, y * sy, z]; };
  const toFloor = ([x, y, z = 0]) => {
    const [px, py] = turn === 90 ? [-y, x] : turn === 180 ? [-x, -y] : turn === 270 ? [y, -x] : [x, y];
    return [r2(ox + px), r2(oy + py), z];
  };
  const corners = [[0, 0], [W, 0], [W, D], [0, D]].map((p) => toFloor(p));
  const rect = [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[0])), Math.max(...corners.map((c) => c[1]))];
  // The door: the room's own, or the profile's (moved with the stretch and the mirror).
  let door = null;
  if (g.door) door = { ...g.door, basis: 'room' };
  else if (prof?.door) {
    const d = prof.door;
    if (d.wall === 'left') door = { wall: mirror ? 'right' : 'left', from_m: r2(d.from_m * sy), to_m: r2(d.to_m * sy), basis: 'profile' };
    else { const a = d.from_m * sx, b = d.to_m * sx; door = { wall: d.wall, from_m: r2(mirror ? W - b : a), to_m: r2(mirror ? W - a : b), basis: 'profile' }; }
  }
  // The point on a wall at a distance along it, stepped just outside the room.
  const onWall = (wall, at, out = 0.15) => ({ left: [-out, at], right: [W + out, at], back: [at, -out], front: [at, D + out] })[wall];
  const de = g.data_entry;
  const entryLocal = de?.wall ? onWall(de.wall, de.at_m ?? (de.wall === 'left' || de.wall === 'right' ? D / 2 : W / 2))
    : door ? onWall(door.wall, (door.from_m + door.to_m) / 2) : null;
  const entry = entryLocal ? toFloor(entryLocal) : null;
  const displayWall = g.display_wall ?? prof?.display_wall ?? 'none';
  const odd = (g.odd ?? []).map((o) => (o.x_m != null ? { ...o, rect: rectOf([[o.x_m, o.y_m], [o.x_m + o.w_m, o.y_m + o.d_m]].map((p) => toFloor(p))) } : { ...o }));
  return { W, D, W0, D0, sx, sy, mirror, turn, origin: [ox, oy], rect, polygon: corners.map((c) => [c[0], c[1]]), area: r2(W * D), door, entry, entryVia: de?.via ?? 'ceiling',
    ceiling_m: g.ceiling_m ?? prof?.ceiling_m ?? null, displayWall, odd, fromProfile, toFloor, walls: WALLS };
}
const rectOf = (pts) => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];

// What differs from the profile, in words, for the page and the 3D view's tooltip.
export function variationsOf(space, type, geo) {
  const g = space.geometry ?? {}, prof = type?.keia_atlas?.geometry, out = [];
  if (g.size_m && prof && (space.count ?? 1) === 1) out.push({ kind: 'size', text: `${g.size_m.width} × ${g.size_m.depth} m (space type ${prof.width_m} × ${prof.depth_m} m)` });
  if (g.mirror) out.push({ kind: 'mirror', text: 'Built the other way round' });
  if (g.door) out.push({ kind: 'door', text: `Door on the ${g.door.wall} wall, ${g.door.from_m} to ${g.door.to_m} m` });
  if (g.ceiling_m) out.push({ kind: 'ceiling', text: `Ceiling ${g.ceiling_m} m` });
  if (g.data_entry) out.push({ kind: 'data-entry', text: `Data comes in on the ${g.data_entry.wall} wall` });
  for (const o of g.odd ?? []) out.push({ kind: o.kind, text: o.note ?? o.kind });
  return out;
}

// ---------- Outlets ----------
const itemsOf = (o) => o.equipment.flatMap((e) => {
  const n = typeof e.quantity === 'number' ? e.quantity : 1;
  return Array.from({ length: n }, (_, i) => ({ e, key: n > 1 ? `${e.key}#${i + 1}` : e.key, i, n, loc: e.location ?? 'tbd', label: e.class }));
});
const roomCache = new Map();
function profileRoom(typeId, type, option, fitted, models) {
  const k = `${typeId}/${option.id}/${[...fitted].sort().join(',')}`;
  if (!roomCache.has(k)) roomCache.set(k, buildRoom(typeId, option, itemsOf(option), { fitted, models }));
  return roomCache.get(k);
}
// The desks of a bank, from its benches: a bench is a back-to-back run, half its desks each side of the spine.
export function desksOf(space) {
  const out = [];
  for (const [bi, b] of (space.geometry?.benches ?? []).entries()) {
    const per = b.desks / 2;
    for (let side = 0; side < 2; side++) for (let i = 0; i < per; i++) {
      const x = b.x_m + DESK.w * (i + 0.5);
      out.push({ n: out.length + 1, bench: bi + 1, desk: [x, b.y_m + (side ? DESK.d * 1.5 : DESK.d * 0.5)], module: [x, b.y_m + DESK.d + (side ? 0.03 : -0.03), DESK.module_z], pole: [b.x_m, b.y_m + DESK.d, 0] });
    }
  }
  return out;
}
export const deskKey = (n) => `desk-${String(n).padStart(2, '0')}`;

// Every data outlet in a room, where it is on the plan, and what plugs into it.
export function roomOutlets(space, type, option, fitted, geo, models) {
  if (!geo || !option) return [];
  const opt = option;
  if ((space.count ?? 1) > 1) {
    const P = outletPlates(opt, { fitted });
    const ports = P.groups.flatMap((g) => g.data.map((p) => ({ ...p, plate: g.id })));
    return desksOf(space).flatMap((d) => ports.map((p, i) => ({
      id: `${deskKey(d.n)}/data/${p.loc}#${p.n}`, unit: deskKey(d.n), plate: p.plate, loc: p.loc, n: p.n, dev: p.dev ? `${deskKey(d.n)}/${p.dev}` : null, port: p.port ?? null, name: p.name,
      local: [d.module[0] + (i - (ports.length - 1) / 2) * 0.025, d.module[1], d.module[2]], pole: d.pole, surface: 'desk', at: geo.toFloor([d.module[0] + (i - (ports.length - 1) / 2) * 0.025, d.module[1], d.module[2]]),
    })));
  }
  const M = profileRoom(space.space_type, type, opt, fitted, models);
  return M.plates.groups.flatMap((g) => g.data.map((p, i) => {
    const base = g.at ?? [M.room.W / 2, 0.01, 0.45];
    const lp = geo.fromProfile([base[0] + (i - (g.data.length - 1) / 2) * 0.025, base[1], base[2]]);
    return { id: `data/${p.loc}#${p.n}`, plate: g.id, loc: p.loc, n: p.n, dev: p.dev ?? null, port: p.port ?? null, name: p.name, surface: g.surface ?? g.kind, local: lp, at: geo.toFloor(lp) };
  }));
}

// ---------- Trays: the network of containment on a floor ----------
// A graph whose nodes are tray ends, bends and junctions (where one tray's end meets another tray), and whose
// edges are tray stretches. Shortest path by length, with the change of height when a run moves between trays.
const pk = (p) => `${r2(p[0])},${r2(p[1])}`;
export function trayGraph(trays) {
  const pts = new Map(); const adj = new Map();
  const node = (p) => { const k = pk(p); if (!pts.has(k)) { pts.set(k, [r2(p[0]), r2(p[1])]); adj.set(k, []); } return k; };
  const ends = trays.flatMap((t) => [t.path[0], t.path[t.path.length - 1]]);
  for (const t of trays) {
    for (let i = 1; i < t.path.length; i++) {
      const a = t.path[i - 1], b = t.path[i];
      const cuts = [a, ...ends.filter((p) => onSeg(p, a, b, 1e-6)), ...trays.filter((u) => u !== t).flatMap((u) => u.path.filter((p) => onSeg(p, a, b, 1e-6))), b]
        .sort((p, q) => dist(a, p) - dist(a, q));
      for (let j = 1; j < cuts.length; j++) {
        if (dist(cuts[j - 1], cuts[j]) < 1e-6) continue;
        const u = node(cuts[j - 1]), v = node(cuts[j]), L = dist(cuts[j - 1], cuts[j]);
        adj.get(u).push({ to: v, tray: t.id, len: L, z: t.z_m }); adj.get(v).push({ to: u, tray: t.id, len: L, z: t.z_m });
      }
    }
  }
  return { pts, adj, node: (p) => pk(p) };
}
// Shortest route between two points on the trays. Returns { points, via, length, climb } or null.
export function routeOnTrays(G, from, to) {
  const s = pk(from), t = pk(to);
  if (!G.adj.has(s) || !G.adj.has(t)) return null;
  const best = new Map([[`${s}|`, 0]]), prev = new Map(), done = new Set();
  const q = [[0, s, null]];
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]);
    const [d, u, tray] = q.shift();
    const key = `${u}|${tray ?? ''}`;
    if (done.has(key)) continue; done.add(key);
    if (u === t) {
      const nodes = [], via = []; let k = key, climb = 0, length = 0;
      while (k) { const [n, tr] = k.split('|'); nodes.unshift(G.pts.get(n)); if (tr && via[0] !== tr) via.unshift(tr); const p = prev.get(k); if (p) { length += p.len; climb += p.dz; } k = p?.key; }
      return { points: nodes, via, length: r2(length), climb: r2(climb) };
    }
    for (const e of G.adj.get(u)) {
      const zFrom = tray ? zOf(G, u, tray) : e.z;
      const dz = tray && tray !== e.tray ? Math.abs(zFrom - e.z) : 0;
      const nd = d + e.len + dz + (tray && tray !== e.tray ? 0.001 : 0);
      const nk = `${e.to}|${e.tray}`;
      if (nd < (best.get(nk) ?? Infinity)) { best.set(nk, nd); prev.set(nk, { key, len: e.len, dz }); q.push([nd, e.to, e.tray]); }
    }
  }
  return null;
}
const zOf = (G, u, tray) => G.adj.get(u).find((e) => e.tray === tray)?.z ?? 0;
// How many Cat6A cables a tray takes at the house fill limit.
export const trayCapacity = (w, d) => Math.floor((w * d * TRAY_FILL) / (Math.PI * (CABLE_OD_MM / 2) ** 2));

// ---------- A run's route and length ----------
export const panelZ = (u, size = 1) => RACK_BASE_M + (u - 1 + size / 2) * U_M;
// The route of a permanent link from its panel port to its outlet, and its length: the rise from the panel to the
// ladder over the rack, along the trays, then in the room (in the ceiling void, or down the wall into the floor void
// for a floor box, or down a desk bench's pole and along its spine), then the house slack at both ends.
export function routeRun({ floor, G, rackAt, item, outlet, geo, level = 0 }) {
  const ladder = floor.trays.find((t) => t.kind === 'ladder' && t.path.some((p) => dist(p, rackAt) < 0.05));
  if (!ladder || !outlet) return null;
  const end = outlet.feed;   // the tray end the outlet is fed from
  const R = routeOnTrays(G, rackAt, end);
  if (!R) return null;
  const pz = panelZ(item.u, item.size);
  const trayZ = floor.tray_m;
  const pts = [[rackAt[0], rackAt[1], pz], [rackAt[0], rackAt[1], ladder.z_m]];
  // Along the trays: each point at its tray's height.
  let z = ladder.z_m;
  const trayAt = (i) => { const a = R.points[i - 1], b = R.points[i]; const e = G.adj.get(pk(a)).find((x) => x.to === pk(b)); return e?.z ?? z; };
  for (let i = 1; i < R.points.length; i++) { const tz = trayAt(i); if (tz !== z) pts.push([R.points[i - 1][0], R.points[i - 1][1], tz]); z = tz; pts.push([R.points[i][0], R.points[i][1], z]); }
  let room = 0;
  const o = outlet.at;
  if (outlet.kind === 'ap') { pts.push([o[0], o[1], o[2]]); room = Math.abs(z - o[2]); }
  else if (outlet.pole) {
    const pole = geo.toFloor(outlet.pole);
    const spine = outlet.at;
    pts.push([pole[0], end[1] === pole[1] ? pole[1] : end[1], z], [pole[0], pole[1], z], [pole[0], pole[1], spine[2]], [spine[0], spine[1], spine[2]]);
    room = Math.abs(pole[0] - end[0]) + Math.abs(pole[1] - end[1]) + (z - spine[2]) + Math.abs(spine[0] - pole[0]) + Math.abs(spine[1] - pole[1]);
  } else if (outlet.surface === 'floor') {
    const fz = -(floor.raised_floor_m ?? 0.15) / 2;
    pts.push([end[0], end[1], fz], [o[0], end[1], fz], [o[0], o[1], fz], [o[0], o[1], 0]);
    room = (z - fz) + Math.abs(o[0] - end[0]) + Math.abs(o[1] - end[1]) + Math.abs(fz);
  } else {
    pts.push([o[0], end[1], z], [o[0], o[1], z], [o[0], o[1], o[2]]);
    room = Math.abs(o[0] - end[0]) + Math.abs(o[1] - end[1]) + (z - o[2]);
  }
  const rise = ladder.z_m - pz;
  const length = Math.ceil((rise + R.length + R.climb + room + SLACK.rack + SLACK.outlet) * 10) / 10;
  return { via: R.via, length, modelled: r2(rise + R.length + R.climb + room), path: pts.map(([x, y, zz]) => [r2(x), r2(y), r2(level + zz)]) };
}

// ---------- Loading ----------
function readFolder(root, folder) {
  const out = {}; const dir = path.join(root, 'data', folder);
  if (!existsSync(dir)) return out;
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const f = path.join(d, n); if (statSync(f).isDirectory()) walk(f); else if (n.endsWith('.yaml')) out[n.slice(0, -5)] = loadYaml(f); } };
  walk(dir); return out;
}
export function loadRaw(root = process.cwd()) {
  return {
    sites: readFolder(root, 'sites'), spaces: readFolder(root, 'spaces'), installs: readFolder(root, 'installs'), types: readFolder(root, 'space-types'),
    models: readFolder(root, 'device-models'), racks: readFolder(root, 'racks'), cables: readFolder(root, 'cables'), floors: readFolder(root, 'floors'),
    runs: readFolder(root, 'runs'), circuits: readFolder(root, 'circuits'), standards: readFolder(root, 'standards'),
  };
}

// ---------- The building model ----------
const portRange = (s) => { if (s == null || s === '') return []; const [lo, hi] = String(s).split('-').map(Number); const out = []; for (let n = lo; n <= (Number.isFinite(hi) ? hi : lo); n++) out.push(n); return out; };
const itemAtU = (rack, u) => rack.items.find((it) => u >= it.u && u < it.u + it.size) ?? null;
const PASSIVE = new Set(['patch-panel', 'fibre-panel']);

export function buildingModel(raw, siteId) {
  const site = raw.sites[siteId];
  const floorFiles = Object.entries(raw.floors).filter(([, f]) => f.site === siteId).map(([id, f]) => ({ fileId: id, ...f }))
    .sort((a, b) => a.level_m - b.level_m);
  if (!site || !floorFiles.length) return null;
  const runsFile = Object.values(raw.runs).find((r) => r.site === siteId) ?? { runs: [] };
  const circFile = Object.values(raw.circuits).find((c) => c.site === siteId) ?? { circuits: [], entry_points: [] };
  const cableStd = raw.standards.cables ?? null;
  const purposeColour = Object.fromEntries((cableStd?.purposes ?? []).map((p) => [p.id, p.colour]));
  const colourHex = Object.fromEntries((cableStd?.colours ?? []).map((c) => [c.id, c.hex]));
  const racks = Object.fromEntries(Object.values(raw.racks).filter((r) => raw.spaces[r.space]?.site === siteId).map((r) => [r.id, r]));
  const siteCables = Object.values(raw.cables).find((c) => c.site === siteId)?.cables ?? [];
  const floorOf = (fid) => floors.find((f) => f.id === fid);

  // Floors.
  const floors = floorFiles.map((f) => {
    const trays = f.trays.map((t) => ({ ...t, length: r2(pathLength(t.path)), level: f.level_m, runs: 0 }));
    return { id: f.floor, fileId: f.fileId, name: f.name, fictional: f.fictional, level_m: f.level_m, slab_to_slab_m: f.slab_to_slab_m, ceiling_m: f.ceiling_m,
      raised_floor_m: f.raised_floor_m ?? 0.15, tray_m: f.tray_m, outline: f.outline, core: f.core ?? [], corridors: f.corridors ?? [], areas: f.areas ?? [],
      risers: f.risers ?? [], racks: f.racks ?? [], trays, G: trayGraph(trays), access_points: f.access_points ?? [], rooms: [], notes: f.notes ?? [] };
  });

  // Rooms. The floor's open areas and corridors are a space too (it holds the access points), but not a room.
  const rooms = {};
  for (const [id, s] of Object.entries(raw.spaces)) {
    if (s.site !== siteId || s.space_type === OPEN_AREA) continue;
    const fl = floorOf(s.floor); if (!fl) continue;
    const type = raw.types[s.space_type];
    const option = type?.keia_atlas?.options.find((o) => o.id === s.option) ?? null;
    const inst = raw.installs[id] ?? { positions: [] };
    const fitted = inst.fitted ?? [];
    const geo = roomGeometry(s, type, raw.models);
    const outlets = roomOutlets(s, type, option, fitted, geo, raw.models).map((o) => ({ ...o, space: id, key: `${id}:${o.id}`, at: [o.at[0], o.at[1], r2(fl.level_m + o.at[2])], localZ: o.at[2], planAt: o.at }));
    const range = areaRange(type);
    rooms[id] = { id, name: s.name, number: s.number ?? null, floor: s.floor, space_type: s.space_type, option: s.option, count: s.count ?? 1, fitted, type, optionData: option,
      positions: inst.positions, geo, rect: geo?.rect ?? null, area: geo?.area ?? null, areaRange: range, outOfRange: !!(range && geo && (s.count ?? 1) === 1 && (geo.area < range.min - 0.05 || geo.area > range.max + 0.05)),
      variations: geo ? variationsOf(s, type, geo) : [], outlets, desks: (s.count ?? 1) > 1 ? desksOf(s).map((d) => ({ ...d, at: geo ? geo.toFloor(d.desk) : null })) : [],
      health: id };
    fl.rooms.push(id);
  }

  // Access points: where the floor plan hangs each one, and the unit from the open-area install it names.
  const aps = floors.flatMap((f) => f.access_points.map((a) => ({ ...apUnit(raw, a), ...a, floor: f.id, planAt: [a.at[0], a.at[1], a.height_m], at: [a.at[0], a.at[1], r2(f.level_m + a.height_m)] }))
    .map((a) => ({ ...a, health: a.asset_tag })));

  // Runs, with their 3D path and length as modelled.
  const outletByKey = new Map();
  for (const r of Object.values(rooms)) for (const o of r.outlets) outletByKey.set(o.key, { ...o, room: r });
  for (const a of aps) outletByKey.set(`ap:${a.id}`, { kind: 'ap', key: `ap:${a.id}`, id: a.id, at: a.planAt, ap: a });
  const rackPlace = (rid) => { for (const f of floors) { const r = f.racks.find((x) => x.rack === rid); if (r) return { f, at: r.at }; } return null; };
  const runs = runsFile.runs.map((r) => {
    const base = { ...r, colour: purposeColour[r.purpose] ?? null, hex: colourHex[purposeColour[r.purpose]] ?? null, health: r.id };
    if (r.kind !== 'horizontal') return { ...base, path: backbonePath(r, floors, racks, rackPlace) };
    const rp = rackPlace(r.from.rack); const rack = racks[r.from.rack];
    const item = rack ? itemAtU(rack, r.from.u) : null;
    const key = r.to.access_point ? `ap:${r.to.access_point}` : `${r.to.space}:${r.to.outlet}`;
    const o = outletByKey.get(key);
    let route = null;
    if (rp && item && o) {
      const fl = rp.f;
      const feed = o.kind === 'ap' ? feedFor(fl, `ap-${o.id}`) : feedFor(fl, `room-${o.room.id}`);
      route = feed ? routeRun({ floor: fl, G: fl.G, rackAt: rp.at, item, outlet: { ...o, at: o.kind === 'ap' ? o.at : o.planAt, feed, surface: o.surface }, geo: o.room?.geo, level: fl.level_m }) : null;
    }
    return { ...base, outletKey: key, floor: rp?.f.id ?? null, path: route?.path ?? null, modelled: route?.modelled ?? null, routeVia: route?.via ?? null };
  });
  // Cables per tray (runs and the providers' lead-ins).
  const trayById = new Map(floors.flatMap((f) => f.trays.map((t) => [t.id, t])));
  for (const r of runs) for (const v of r.via ?? []) if (trayById.has(v)) trayById.get(v).runs += r.kind === 'backbone' ? 1 : 1;
  for (const c of circFile.circuits) for (const v of c.lead_in?.via ?? []) if (trayById.has(v)) trayById.get(v).runs += 1;
  for (const t of trayById.values()) t.fill = t.capacity ? r2(t.runs / t.capacity) : null;
  for (const r of runs) if (r.to?.outlet || r.to?.access_point) { const o = outletByKey.get(r.outletKey); if (o) { if (o.kind === 'ap') o.ap.run = r.id; else { const ro = o.room.outlets.find((x) => x.key === o.key); if (ro) ro.run = r.id; } } }

  // Racks on the plan, each item at its height.
  const rackList = Object.values(racks).map((rk) => {
    const rp = rackPlace(rk.id);
    return { id: rk.id, name: rk.name, space: rk.space, floor: rp?.f.id ?? null, at: rp?.at ?? null, facing: rp ? rp.f.racks.find((x) => x.rack === rk.id).facing : null, height_u: rk.height_u,
      items: rk.items.map((it) => ({ u: it.u, size: it.size, kind: it.kind, label: it.label, position: it.position ?? null, z: r2((rp?.f.level_m ?? 0) + panelZ(it.u, it.size)), health: unitTagAt(raw, rk.space, it.position) ?? `${rk.id}:U${it.u}` })) };
  });

  const circuits = circFile.circuits.map((c) => ({ ...c, health: c.id }));
  const model = { site: siteId, siteName: site.name, fictional: FICTION, floors: floors.map(({ G, ...f }) => f), rooms, racks: rackList, runs, aps, circuits,
    entry_points: circFile.entry_points ?? [], cables: siteCables, _raw: raw, _racks: racks, _G: Object.fromEntries(floors.map((f) => [f.id, f.G])) };
  return model;
}
export const OPEN_AREA = 'open-area';
// An access point's unit: its install position in the floor's open-area space (hostname, model, current unit).
export function apUnit(raw, a) {
  const s = raw.spaces[a.space], p = raw.installs[a.space]?.positions.find((x) => x.position === a.position);
  if (!s || !p) return { hostname: null, model: null, serial: null, asset_tag: null, stage: null };
  const e = raw.types[s.space_type]?.keia_atlas.options.find((o) => o.id === s.option)?.equipment.find((x) => x.key === a.position.replace(/#\d+$/, ''));
  const u = p.units.find((x) => !x.legacy) ?? {};
  return { hostname: p.hostname ?? null, model: p.model ?? e?.model ?? null, serial: u.serial ?? null, asset_tag: u.asset_tag ?? null, stage: u.stage ?? null, installed: u.installed ?? null };
}
function unitTagAt(raw, spaceId, position) {
  if (!position) return null;
  const p = raw.installs[spaceId]?.positions.find((x) => x.position === position);
  return p?.units.find((u) => !u.legacy)?.asset_tag ?? null;
}
// The branch tray that feeds a room or an access point (by its `feeds`), and the end of it at the room.
export function feedFor(floor, feeds) {
  const t = floor.trays.find((x) => x.feeds === feeds);
  return t ? t.path[t.path.length - 1] : null;
}
function backbonePath(r, floors, racks, rackPlace) {
  const a = rackPlace(r.from.rack), b = rackPlace(r.to.rack);
  if (!a || !b) return null;
  const riser = floors.flatMap((f) => f.risers).find((x) => (r.via ?? []).includes(x.id));
  const rz = (p, u) => r2(p.f.level_m + panelZ(u));
  const c = riser ? [(riser.rect[0] + riser.rect[2]) / 2, (riser.rect[1] + riser.rect[3]) / 2] : a.at;
  const la = a.f.trays.find((t) => t.kind === 'ladder'), lb = b.f.trays.find((t) => t.kind === 'ladder');
  return [[a.at[0], a.at[1], rz(a, r.from.u)], [a.at[0], a.at[1], r2(a.f.level_m + (la?.z_m ?? 2.4))], [c[0], c[1], r2(a.f.level_m + (la?.z_m ?? 2.4))],
    [c[0], c[1], r2(b.f.level_m + (lb?.z_m ?? 2.4))], [b.at[0], b.at[1], r2(b.f.level_m + (lb?.z_m ?? 2.4))], [b.at[0], b.at[1], rz(b, r.to.u)]];
}

// ---------- Tracing a device to the internet ----------
// A graph of everything that carries the signal: room wiring (device to outlet), runs (outlet to panel port), patch
// cords (panel port to switch, switch to switch), the riser fibre, the providers' boxes, the lead-in and the internet.
// Passive panels are followed port by port; active gear (switches, firewalls) passes the signal on from any port.
export function signalGraph(M) {
  const adj = new Map();
  // Each direction remembers the port it arrives at, so a hop can say "port 47".
  const add = (a, b, e) => { for (const [x, y, k] of [[a, b, 1], [b, a, 0]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push({ to: y, ...e, toPort: e.ports?.[k] ?? null }); } };
  const racks = M._racks;
  const handoff = new Map();
  for (const c of M.circuits) for (const p of [...(c.handoff.customer ?? []), ...(c.handoff.network ?? [])]) handoff.set(`${c.handoff.rack}:${c.handoff.u}:${p}`, c.id);
  const nodeOf = (rackId, u, port) => {
    const rk = racks[rackId]; const it = rk ? itemAtU(rk, u) : null;
    if (!it) return null;
    if (it.kind === 'isp') { const c = handoff.get(`${rackId}:${it.u}:${port}`); return c ? `isp:${c}` : `item:${rackId}:${it.u}`; }
    return PASSIVE.has(it.kind) ? `port:${rackId}:${it.u}:${port}` : `item:${rackId}:${it.u}`;
  };
  for (const c of M.cables) {
    if (c.role !== 'patch' || !c.connects?.from?.u || !c.connects?.to?.u) continue;
    const rackId = c.where?.rack; const f = c.connects.from, t = c.connects.to;
    const fp = portRange(f.ports), tp = portRange(t.ports);
    const n = Math.max(fp.length, tp.length, 1);
    for (let i = 0; i < n; i++) {
      const a = nodeOf(f.rack ?? rackId, f.u, fp[i] ?? fp[0]), b = nodeOf(t.rack ?? rackId, t.u, tp[i] ?? tp[0]);
      if (a && b) add(a, b, { kind: 'patch', cable: c.id, colour: c.colour, purpose: c.purpose, ports: [fp[i] ?? fp[0] ?? null, tp[i] ?? tp[0] ?? null], rack: rackId });
    }
  }
  for (const r of M.runs) {
    if (r.kind === 'backbone') {
      const fp = portRange(r.from.ports), tp = portRange(r.to.ports);
      fp.forEach((p, i) => add(nodeOf(r.from.rack, r.from.u, p), nodeOf(r.to.rack, r.to.u, tp[i]), { kind: 'run', run: r.id, ports: [p, tp[i]] }));
    } else add(nodeOf(r.from.rack, r.from.u, r.from.port), `outlet:${r.outletKey}`, { kind: 'run', run: r.id, ports: [r.from.port, null] });
  }
  for (const c of M.circuits) {
    for (const p of portRange(c.panel.ports)) add(nodeOf(c.panel.rack, c.panel.u, p), `entry:${c.id}`, { kind: 'lead-in', circuit: c.id });
    add(`entry:${c.id}`, 'internet', { kind: 'provider', circuit: c.id });
  }
  return adj;
}
function shortest(adj, start, goal) {
  const prev = new Map([[start, null]]); const q = [start];
  while (q.length) {
    const u = q.shift(); if (u === goal) break;
    for (const e of adj.get(u) ?? []) if (!prev.has(e.to)) { prev.set(e.to, { from: u, e }); q.push(e.to); }
  }
  if (!prev.has(goal)) return null;
  const out = []; let k = goal;
  while (prev.get(k)) { const p = prev.get(k); out.unshift({ from: p.from, to: k, e: p.e }); k = p.from; }
  return out;
}
// Room wiring, device to outlet, over network cables only.
export function wiringToOutlet(room, posKey) {
  const opt = room.optionData; if (!opt) return null;
  const fitted = new Set(room.fitted);
  const unit = posKey.includes('/') ? posKey.split('/')[0] : null;
  const key = unit ? posKey.split('/')[1] : posKey;
  const items = new Map(opt.equipment.map((e) => [e.key, e]));
  const on = (k) => items.get(k)?.requirement !== 'optional' || fitted.has(k);
  const adj = new Map(); const add = (a, b, l) => { for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push({ to: y, l }); } };
  for (const l of opt.wiring ?? []) {
    if (!['cat6', 'cat6a'].includes(l.cable)) continue;
    if (l.when && !fitted.has(l.when)) continue;
    if (l.unless && fitted.has(l.unless)) continue;
    const a = parseEnd(l.from), b = parseEnd(l.to);
    if ([a, b].some((e) => e.key && !on(e.key))) continue;
    const nm = (e, raw) => (e.outlet ? `outlet:${raw.slice(7)}` : devKey(e, opt));
    add(nm(a, l.from), nm(b, l.to), l);
  }
  const prev = new Map([[key, null]]); const q = [key];
  while (q.length) {
    const u = q.shift();
    if (u.startsWith('outlet:')) {
      const hops = []; let k = u; while (prev.get(k)) { hops.unshift(prev.get(k)); k = prev.get(k).from; }
      return { outlet: `${unit ? `${unit}/` : ''}${u.slice(7)}`, hops };
    }
    for (const e of adj.get(u) ?? []) if (!prev.has(e.to)) { prev.set(e.to, { from: u, to: e.to, l: e.l }); q.push(e.to); }
  }
  return null;
}

// Find what a reference names: a unit, a room position, an outlet, an access point or a run.
function resolve(M, ref) {
  for (const r of Object.values(M.rooms)) {
    for (const p of r.positions ?? []) {
      if (p.hostname === ref || p.units.some((u) => u.asset_tag === ref || u.serial === ref) || `${r.id}/${p.position}` === ref) return { kind: 'device', room: r, position: p };
    }
    for (const o of r.outlets) if (o.key === ref) return { kind: 'outlet', room: r, outlet: o };
  }
  const ap = M.aps.find((a) => [a.id, a.hostname, a.asset_tag, a.serial].includes(ref));
  if (ap) return { kind: 'ap', ap };
  const run = M.runs.find((r) => r.id === ref);
  if (run) return { kind: 'run', run };
  return null;
}
const rackItemName = (M, rackId, u) => { const rk = M._racks[rackId]; const it = rk ? itemAtU(rk, u) : null; return it ? { label: it.label, u: it.u, kind: it.kind, position: it.position ?? null } : null; };

export function trace(M, ref) {
  const found = resolve(M, ref);
  if (!found) return null;
  const hops = [];
  let start = null;
  if (found.kind === 'device') {
    const { room, position } = found;
    const tag = position.units.find((u) => !u.legacy)?.asset_tag ?? null;
    hops.push({ kind: 'device', id: `${room.id}/${position.position}`, label: `${room.name}, ${position.position.replace('/', ' ').replace(/-/g, ' ').replace(/#/, ' ')}`, hostname: position.hostname ?? null, model: position.model ?? null, floor: room.floor, health: tag });
    const w = wiringToOutlet(room, position.position);
    if (!w) return { ref, hops, complete: false, reason: 'No network cable from this device in the space wiring' };
    for (const h of w.hops) if (!h.to.startsWith('outlet:') && h.to !== position.position.split('/').pop()) hops.push({ kind: 'room-device', id: `${room.id}/${h.to}`, label: `${room.name} ${h.to.replace(/-/g, ' ').replace(/#/, ' ')}`, via: h.l.cable, health: tagOf(room, h.to) });
    const o = room.outlets.find((x) => x.id === w.outlet);
    hops.push(outletHop(room, o, w.hops[w.hops.length - 1]?.l?.cable));
    start = `outlet:${room.id}:${w.outlet}`;
  } else if (found.kind === 'outlet') {
    hops.push(outletHop(found.room, found.outlet)); start = `outlet:${found.outlet.key}`;
  } else if (found.kind === 'ap') {
    const a = found.ap;
    hops.push({ kind: 'device', id: a.id, label: `Access point ${a.hostname}`, hostname: a.hostname, model: a.model, floor: a.floor, at: a.at, health: a.asset_tag });
    hops.push({ kind: 'outlet', id: `ap:${a.id}`, label: 'Ceiling jack above the access point', floor: a.floor, at: a.at, health: null });
    start = `outlet:ap:${a.id}`;
  } else {
    const r = found.run;
    start = r.kind === 'horizontal' ? `outlet:${r.outletKey}` : `port:${r.from.rack}:${itemAtU(M._racks[r.from.rack], r.from.u)?.u}:${portRange(r.from.ports)[0]}`;
  }
  const adj = signalGraph(M);
  const path = shortest(adj, start, 'internet');
  if (!path) return { ref, hops, complete: false, reason: 'No recorded path to the internet' };
  const runById = new Map(M.runs.map((r) => [r.id, r]));
  const circ = new Map(M.circuits.map((c) => [c.id, c]));
  for (const { to, e } of path) {
    if (e.kind === 'run') { const r = runById.get(e.run); hops.push({ kind: r.kind === 'backbone' ? 'riser' : 'run', id: r.id, label: r.kind === 'backbone' ? `Riser fibre ${r.id}` : `Permanent link ${r.id}`, type: r.type, colour: r.colour, length_m: r.length_m, test: r.test?.result ?? null, via: r.via, health: r.id }); }
    else if (e.kind === 'patch') hops.push({ kind: 'patch', id: e.cable, label: `Patch cord ${e.cable}`, colour: e.colour, purpose: e.purpose, health: null });
    else if (e.kind === 'lead-in') { const c = circ.get(e.circuit); hops.push({ kind: 'lead-in', id: `${c.id}-lead-in`, label: `${c.provider}'s fibre from the building entry`, via: c.lead_in?.via ?? [], health: c.id }); }
    else if (e.kind === 'provider') { const c = circ.get(e.circuit); hops.push({ kind: 'circuit', id: c.id, label: `${c.name}, ${c.provider}`, bandwidth: c.bandwidth ?? 'Not recorded', health: c.id }); }
    if (to.startsWith('port:') || to.startsWith('item:')) {
      const [, rackId, u, port] = to.split(':'); const it = rackItemName(M, rackId, +u); const rk = M.racks.find((x) => x.id === rackId);
      const port2 = to.startsWith('port:') ? +port : e.toPort ?? null;
      hops.push({ kind: it?.kind ?? 'rack-item', id: to, label: `${it?.label ?? `U${u}`}, U${u}${port2 ? `, port ${port2}` : ''}`, rack: rackId, room: rk?.space ?? null, floor: rk?.floor ?? null, health: unitTagAt(M._raw, rk?.space, it?.position) ?? `${rackId}:U${u}` });
    } else if (to.startsWith('isp:')) { const c = circ.get(to.slice(4)); hops.push({ kind: 'isp', id: to, label: `${c.provider}'s box (the handoff), U${c.handoff.u}`, rack: c.handoff.rack, health: c.id }); }
    else if (to.startsWith('entry:')) { const c = circ.get(to.slice(6)); const ep = M.entry_points.find((x) => x.id === c.entry); hops.push({ kind: 'entry', id: c.entry, label: ep?.name ?? 'Building entry', at: ep?.at ?? null, health: null }); }
    else if (to === 'internet') hops.push({ kind: 'internet', id: 'internet', label: 'The internet', health: null });
  }
  // Collapse a switch that is both entered and left in one go (two hops with the same id).
  const out = hops.filter((h, i) => !(i > 0 && hops[i - 1].id === h.id && h.kind !== 'patch'));
  return { ref, hops: out, complete: true };
}
const tagOf = (room, key) => room.positions?.find((p) => p.position === key)?.units.find((u) => !u.legacy)?.asset_tag ?? null;
function outletHop(room, o, cable) {
  return { kind: 'outlet', id: o ? o.key : null, label: o ? `${room.name}${o.unit ? `, ${o.unit.replace('-', ' ')}` : ''}, outlet ${o.plate}, data ${o.n} (${o.loc.replace(/-/g, ' ')})` : 'Outlet', via: cable ?? null, floor: room.floor, at: o?.at ?? null, run: o?.run ?? null, health: null };
}

// ---------- Health hooks ----------
// What the live feeds report on, by id: units (asset tags) for devices, access points and rack gear with a position;
// rooms by id; runs and circuits by id. The 3D view looks each object's `health` up in the feed.
export function healthHooks(M) {
  const units = new Set(), items = new Set();
  for (const r of Object.values(M.rooms)) for (const p of r.positions ?? []) for (const u of p.units) if (!u.legacy) units.add(u.asset_tag);
  for (const a of M.aps) units.add(a.asset_tag);
  for (const rk of M.racks) for (const it of rk.items) (String(it.health).startsWith('AG-') ? units : items).add(it.health);
  return { units: [...units], rooms: Object.keys(M.rooms), runs: M.runs.map((r) => r.id), circuits: M.circuits.map((c) => c.id), rackItems: [...items] };
}

// ---------- At build time ----------
const cache = new Map();
export function building(siteId, root = process.cwd()) {
  if (!cache.has(siteId)) cache.set(siteId, buildingModel(loadRaw(root), siteId));
  return cache.get(siteId);
}
export const sitesWithFloors = (root = process.cwd()) => [...new Set(Object.values(loadRaw(root).floors).map((f) => f.site))];
// The open area of a floor (everything inside the outline that is not an enclosed room or a non-walkable part of
// the core) and the gathering areas in it, for the Wi-Fi rule.
export function wifiAreas(M, floorId) {
  const f = M.floors.find((x) => x.id === floorId);
  const enclosed = Object.values(M.rooms).filter((r) => r.floor === floorId && r.rect && r.count === 1);
  const core = f.core.filter((c) => !c.circulation);
  const gathering = f.areas.filter((a) => a.kind === 'town-hall');
  const outline = polyArea(f.outline);
  const open = outline - enclosed.reduce((n, r) => n + rectArea(r.rect), 0) - core.reduce((n, c) => n + rectArea(c.rect), 0) - gathering.reduce((n, a) => n + rectArea(a.rect), 0);
  const gArea = gathering.reduce((n, a) => n + rectArea(a.rect), 0);
  const need = { open: Math.ceil(open / WIFI_RULE.open_m2), gathering: gathering.reduce((n, a) => n + Math.ceil(rectArea(a.rect) / WIFI_RULE.gathering_m2), 0) };
  return { outline: r2(outline), open: r2(open), gathering: r2(gArea), need, enclosed, core, areas: gathering };
}
