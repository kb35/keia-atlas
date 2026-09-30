// One floor of the building model (src/lib/floors.mjs) as an isometric scene, fitted to a viewBox: the drawing the
// front door uses wherever it shows a floor (the Deliver stage, Fix it yourself, the first moment). The projection is
// src/lib/iso.mjs; this adds what a drawing on a page needs: every primitive in draw order in viewBox units, where
// each space's ring sits, where each device in a space sits on its top face, and the space's kind for its tint.
// Its floor and spaces come from src/lib/floorplan.mjs, the geometry the plan and the thumbnails share.
// Pure geometry, no DOM: IsoFloor.astro draws it, and a parent reads the same points to place words.
//
//   floorScene(M, floorId, opts)   { F, rooms, prims, ground, rings, devs, k, width, height, T }
//     opts.kit    true: a dot per device in each single space (desk banks and their per-desk kit are left out)
//     opts.rings  'all' (every space, as the hero) or 'rooms' (single spaces only: the ones a fit-out equips)
import { isoFloor, fit, iso } from './iso.mjs';
import { planOf, KIND_GROUP } from './floorplan.mjs';

// A space's kind, as the floor plan's key has it: the one definition in src/lib/floorplan.mjs, desk banks as "desks".
export const kindOf = KIND_GROUP;

// The order kit goes in on a fit-out (src/lib/integrate.mjs: the room system, then what pairs with it, then the rest).
export const BATCH_ORDER = ['video-bar', 'display', 'touch-controller', 'scheduler-panel'];

export function floorScene(M, floorId, { width = 960, height = 560, pad = 40, h = 1.1, kit = false, rings = 'all', ringLift = kit ? 1.05 : 0.35 } = {}) {
  // The same floor and spaces as the plan and the thumbnail (src/lib/floorplan.mjs), projected.
  const P = planOf(M, floorId);
  if (!P) throw new Error(`floorScene: no floor ${floorId}`);
  const { F, rooms } = P;
  const FL = isoFloor(F, rooms, { h, ringLift });
  const f = fit(FL.prims, { width, height, pad });
  const single = (r) => (r.count ?? 1) === 1;
  const area = (r) => (r.rect[2] - r.rect[0]) * (r.rect[3] - r.rect[1]);
  const ringRooms = FL.rings.filter((r) => rings === 'all' || single(r.room));
  const out = {
    F, rooms, k: f.k, width, height, T: f.T,
    prims: FL.prims.map((p) => ({ kind: p.kind, room: p.room ?? null, k: p.room ? kindOf(p.room.space_type) : null, pts: f.pts(p.pts) })),
    ground: f.pts(FL.prims[2].pts.map(([x, y]) => [x, y + 2.6])),
    rings: ringRooms.map((r) => ({ id: r.room.id, room: r.room, at: f.T(r.at), top: f.T(r.top), wide: area(r.room) > (kit ? 14 : 9) })),
    devs: [],
  };
  if (!kit) return out;
  // Each single space's devices as a tidy row across its top face, along the longer side, in batch order.
  for (const r of rooms.filter(single)) {
    const devs = (r.outlets ?? []).filter((o) => o.dev && !o.dev.includes('/')).map((o) => o.dev.split('#')[0]);
    if (!devs.length) continue;
    devs.sort((a, b) => (BATCH_ORDER.indexOf(a) + 1 || 99) - (BATCH_ORDER.indexOf(b) + 1 || 99));
    const [x0, y0, x1, y1] = r.rect, w = x1 - x0, d = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const along = w >= d ? 'x' : 'y', L = Math.max(w, d);
    const s = devs.length > 1 ? Math.min(0.9, (L - 1.2) / (devs.length - 1)) : 0;
    devs.forEach((cls, i) => {
      const t = (i - (devs.length - 1) / 2) * s;
      const p = along === 'x' ? [cx + t, cy] : [cx, cy + t];
      out.devs.push({ room: r.id, cls, at: f.T(iso(p[0], p[1], h + 0.02)) });
    });
  }
  return out;
}

// The devices grouped into batches, in the order they are set up: [{ cls, devs, rooms }].
export function batchesOf(devs) {
  const seen = new Map();
  for (const d of devs) { if (!seen.has(d.cls)) seen.set(d.cls, []); seen.get(d.cls).push(d); }
  const order = (c) => (BATCH_ORDER.indexOf(c) + 1 || 99);
  return [...seen.entries()].sort((a, b) => order(a[0]) - order(b[0])).map(([cls, ds]) => ({ cls, devs: ds, rooms: [...new Set(ds.map((d) => d.room))] }));
}
