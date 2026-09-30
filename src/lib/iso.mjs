// An office as an architect's model: the building model (src/lib/floors.mjs) drawn in true isometric, every floor a
// slab with its rooms as low blocks, top faces lit and the two visible sides in shade. Used by the front door's hero
// (the building and floor levels of the zoom) and its first moment. Pure geometry, no DOM; build time or browser.
//
//   iso(x, y, z)                    building metres (x east, y north, z up) to unscaled screen units, y down
//   isoFloor(F, rooms, opts)        one floor's primitives in draw order, plus where each room's ring sits
//   isoBuilding(M, opts)            every floor stacked, exploded by `gap` metres, in draw order
//   fit(prims, box)                 a scale and offset that puts the primitives inside a viewBox, with a T() mapper
//
// The viewer stands to the north-east and above, so the faces at x = x1 (east) and y = y1 (north) are the ones you
// see, and things with a larger x + y are nearer. Draw order: for non-overlapping footprints, A goes before B when A
// lies wholly west or wholly south of B; anything unsettled falls back to distance.

export const ISO_C = Math.cos(Math.PI / 6), ISO_S = Math.sin(Math.PI / 6);
export const iso = (x, y, z = 0) => [(x - y) * ISO_C, (x + y) * ISO_S - z];

const rectPts = ([x0, y0, x1, y1]) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

// The three faces you see of a block standing on rect from z0 to z1.
export function prism(rect, z0, z1) {
  const [x0, y0, x1, y1] = rect;
  return {
    top: rectPts(rect).map(([x, y]) => iso(x, y, z1)),
    east: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]].map((p) => iso(...p)),
    north: [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]].map((p) => iso(...p)),
  };
}

export function drawOrder(items) {
  const n = items.length, E = 1e-6;
  const before = (a, b) => (a[2] <= b[0] + E || a[3] <= b[1] + E ? true : b[2] <= a[0] + E || b[3] <= a[1] + E ? false : null);
  const adj = Array.from({ length: n }, () => []), indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const r = before(items[i].rect, items[j].rect);
    const near = (it) => it.rect[0] + it.rect[1];
    const iFirst = r === true || (r === null && near(items[i]) <= near(items[j]));
    if (iFirst) { adj[i].push(j); indeg[j]++; } else { adj[j].push(i); indeg[i]++; }
  }
  const out = [], done = new Array(n).fill(false);
  const dist = items.map((it) => it.rect[0] + it.rect[1]);
  while (out.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (pick < 0 || dist[i] < dist[pick])) pick = i;
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || dist[i] < dist[pick])) pick = i;
    done[pick] = true; out.push(items[pick]);
    for (const j of adj[pick]) indeg[j]--;
  }
  return out;
}

// One floor: the slab (a thin block), its corridors and core as flat washes on top, then every room as a block of
// height `h`. Rings sit a little above each room's top face centre.
export function isoFloor(F, rooms, { z = 0, h = 1, slab = 0.4, ringLift = 0.35 } = {}) {
  const xs = F.outline.map((p) => p[0]), ys = F.outline.map((p) => p[1]);
  const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const prims = [];
  const S = prism(box, z - slab, z);
  prims.push({ kind: 'slab-north', pts: S.north }, { kind: 'slab-east', pts: S.east }, { kind: 'slab-top', pts: S.top });
  for (const c of F.corridors) prims.push({ kind: 'corr', pts: rectPts(c.rect).map(([x, y]) => iso(x, y, z)) });
  for (const c of F.core) prims.push({ kind: 'core', pts: rectPts(c.rect).map(([x, y]) => iso(x, y, z)), core: c.kind });
  const rings = [];
  for (const r of drawOrder(rooms.filter((r) => r.rect))) {
    const P = prism(r.rect, z, z + h);
    prims.push({ kind: 'room-north', pts: P.north, room: r }, { kind: 'room-east', pts: P.east, room: r }, { kind: 'room-top', pts: P.top, room: r });
    const cx = (r.rect[0] + r.rect[2]) / 2, cy = (r.rect[1] + r.rect[3]) / 2;
    rings.push({ room: r, at: iso(cx, cy, z + h + ringLift), top: iso(cx, cy, z + h) });
  }
  // The floor's near corner, where its name sits.
  const label = iso(box[0], box[3], z);
  return { prims, rings, label, box, z };
}

export function isoBuilding(M, { gap = 7.5, h = 1, slab = 0.4 } = {}) {
  const floors = M.floors.map((F, i) => {
    const rooms = Object.values(M.rooms).filter((r) => r.floor === F.id && r.rect);
    return { F, ...isoFloor(F, rooms, { z: i * gap, h, slab }) };
  });
  const ground = rectPts(floors[0].box).map(([x, y]) => iso(x, y, -slab));
  return { floors, ground, prims: floors.flatMap((f) => f.prims), rings: floors.flatMap((f) => f.rings) };
}

// Scale and centre a set of primitives in a viewBox. Returns k (units per metre) and T, a mapper to viewBox units.
export function fit(prims, { width, height, pad = 24, extra = [] }) {
  const pts = [...prims.flatMap((p) => p.pts), ...extra];
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min((width - 2 * pad) / (x1 - x0), (height - 2 * pad) / (y1 - y0));
  const ox = (width - (x1 - x0) * k) / 2 - x0 * k, oy = (height - (y1 - y0) * k) / 2 - y0 * k;
  const T = ([x, y]) => [Math.round((x * k + ox) * 10) / 10, Math.round((y * k + oy) * 10) / 10];
  return { k, T, pts: (P) => P.map(T).map((p) => p.join(',')).join(' ') };
}
