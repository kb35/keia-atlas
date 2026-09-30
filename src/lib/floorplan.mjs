// One floor, one drawing (decision 0030, Keith 30 Sept 2026: "the same floor map everywhere, so people learn the
// shape of their floor"). The geometry every picture of a floor shares, read from the building model
// (src/lib/floors.mjs, which reads data/floors/*.yaml): the outline, the core, the corridors and areas, and every
// space at its real size and place. Pure, no DOM, no files: the build and the browser can both use it.
//
// Three drawings read it, at three levels of detail, so they can never disagree:
//   FloorMap.astro detail="plan"    the office plan: labels, doors, desks, trays, racks, access points, lenses
//   FloorMap.astro detail="thumb"   the thumbnail (SmallMultiples on Home, region, leadership and vendor pages):
//                                   outline, core and every space in its true shape, tinted by state
//   IsoFloor.astro                  the isometric floor (src/lib/isofloor.mjs projects the same rooms)
//
//   planOf(M, floorId)     { F, W, H, pad, viewBox, rooms, Y, box, pts, centre, single, kind, name, label }
//   frameOf(plans)         one scale for a set of plans: the largest sets it, smaller ones sit centred, never enlarged
//   placeIn(plan, frame)   where one plan's own box sits in the frame, in percent (left, top, width, height)
//   hitBox(plan, rect)     where a space sits in its plan's own box, in percent, for an HTML layer over the drawing
//   glyphShare(plan, r)    the room's shorter side as a share of the plan's width: a glyph drawn at most this big
//                          (times a margin) stays inside its space, so two glyphs never overlap
//
// Coordinates: building metres, x east and y north from the outline's south-west corner; the drawings' SVG y runs
// down, so Y(y) flips it. Every drawing uses the same padding (PAD), so a thumbnail and the plan have the same
// picture box and one can grow into the other (the shared-element zoom, docs/rules/motion.md).

export const PAD = 1.5;

// What each space is, for its tint and the key (rooms.md R10): one look per kind, the same in every view.
export const KIND_OF = (t) => (t === 'mdf' || t === 'idf' ? 'comms' : t === 'workstation-assigned' ? 'assigned' : t?.startsWith('workstation') ? 'flex'
  : t === 'reception-concierge' ? 'reception' : ['pantry', 'pantry-expanded', 'cafeteria'].includes(t) ? 'pantry' : ['copy-print-room', 'it-store'].includes(t) ? 'print'
  : t === 'focus-room' || t === 'office' || t?.startsWith('huddle-room') ? 'small' : 'meeting');
// The coarser kinds the isometric views tint by: every desk bank is "desks".
export const KIND_GROUP = (t) => { const k = KIND_OF(t); return k === 'flex' || k === 'assigned' ? 'desks' : k; };

export const roomName = (r) => `${r.number ? `${r.number} ` : ''}${r.name}`;
export const isSingle = (r) => (r.count ?? 1) <= 1;
export const isComms = (r) => r.space_type === 'mdf' || r.space_type === 'idf';

export function planOf(M, floorId) {
  const F = M?.floors?.find((f) => f.id === floorId) ?? null;
  if (!F) return null;
  const xs = F.outline.map((p) => p[0]), ys = F.outline.map((p) => p[1]);
  const W = Math.max(...xs), H = Math.max(...ys);
  // Plan y runs north (up); SVG y runs down.
  const Y = (y) => H - y;
  const box = ([x0, y0, x1, y1]) => ({ x: x0, y: Y(y1), width: x1 - x0, height: y1 - y0 });
  const pts = (P) => P.map(([x, y]) => `${x},${Y(y)}`).join(' ');
  const centre = (r) => [(r.rect[0] + r.rect[2]) / 2, Y((r.rect[1] + r.rect[3]) / 2)];
  const rooms = Object.values(M.rooms).filter((r) => r.floor === floorId && r.rect);
  return {
    site: M.site, siteName: M.siteName, F, W, H, pad: PAD,
    VW: W + PAD * 2, VH: H + PAD * 2, viewBox: `${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`,
    rooms, Y, box, pts, centre,
    single: isSingle, kind: (r) => KIND_OF(r.space_type), name: roomName, label: (r) => r.number ?? r.name,
  };
}

// One scale for a set of plans (design notes): the largest floor sets it.
export function frameOf(plans) {
  const ok = plans.filter(Boolean);
  return { VW: Math.max(1, ...ok.map((p) => p.VW)), VH: Math.max(1, ...ok.map((p) => p.VH)) };
}
const pc = (v) => +(v * 100).toFixed(3);
export function placeIn(plan, frame) {
  return { left: pc((frame.VW - plan.VW) / 2 / frame.VW), top: pc((frame.VH - plan.VH) / 2 / frame.VH), width: pc(plan.VW / frame.VW), height: pc(plan.VH / frame.VH) };
}
export function hitBox(plan, rect) {
  const b = plan.box(rect);
  return { left: pc((b.x + PAD) / plan.VW), top: pc((b.y + PAD) / plan.VH), width: pc(b.width / plan.VW), height: pc(b.height / plan.VH) };
}
export const glyphShare = (plan, r) => +(Math.min(r.rect[2] - r.rect[0], r.rect[3] - r.rect[1]) / plan.VW).toFixed(4);

// Where a space's middle sits on its floor, in building metres (x east, y north), from the building model's rect.
// floors.mjs roomGeometry is the one place that turns and mirrors a space, so a space turned 180 degrees is never
// put on the wrong side of anything.
export function spaceCentre(M, id) {
  const r = M?.rooms?.[id]?.rect;
  return r ? { x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 } : null;
}
// The two sides of a floor a crew works in turn: north and south of the core on a wide floor, west and east on a
// deep one. side(point) names the side a point is on. Null when the floor has no core to split by.
export function floorSides(M, floorId) {
  const F = M?.floors?.find((f) => String(f.id) === String(floorId));
  const core = F?.core ?? [], xs = (F?.outline ?? []).map((p) => p[0]), ys = (F?.outline ?? []).map((p) => p[1]);
  if (!core.length || !xs.length) return null;
  const cx = (Math.min(...core.map((c) => c.rect[0])) + Math.max(...core.map((c) => c.rect[2]))) / 2;
  const cy = (Math.min(...core.map((c) => c.rect[1])) + Math.max(...core.map((c) => c.rect[3]))) / 2;
  const wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  return wide ? { order: ['north', 'south'], side: (p) => (p.y >= cy ? 'north' : 'south') } : { order: ['west', 'east'], side: (p) => (p.x < cx ? 'west' : 'east') };
}
