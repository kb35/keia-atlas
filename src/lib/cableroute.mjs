// Cables along containment (house rule R7 in docs/rules/rooms.md). Every cable in a build option runs
// from the port it really leaves, along the room's containment, to the port it really plugs into:
//
//   the track        a horizontal channel on the wall behind the display(s), just above the plates;
//                    the boxes behind the display hang above it, rear panel down, so their cables
//                    drop straight in
//   the wall riser   vertical trunking on the display wall from the floor duct and the skirting up to
//                    the track, placed where it clears the video bar and the plates
//   the ceiling drop vertical trunking from the track up to the ceiling
//   the ceiling      baskets along the top of the display wall and the door wall, and a branch across
//                    the ceiling to each ceiling device; the building's data comes in here, above the
//                    door, from the comms room
//   skirting         trunking along the foot of the walls, with straight rises to each wall plate
//   the table        a tray under the top, down a leg, a floor cable cover to the floor box, then the
//                    floor duct to the wall riser; a table fixed to the display wall has a wall
//                    pass-through instead
//   the desk         a tray under the desk's back edge, down a back leg, a floor cover to the wall
//
// Routing is Manhattan: every segment runs along one of the room's axes (x along the display wall, y
// out from it, z up), so the drawing never shows a free arc. The route is the shortest path over the
// containment (a graph whose edges are the containment runs), then the short, straight drops at each
// end. Cables that share a run lie side by side in lanes a fixed few pixels apart, in an order chosen
// to leave the fewest crossings, and keep their lane round every bend (runs that fold round an edge,
// such as a table tray down a leg, share one set of lanes).
//
// Port positions come from the device model: `face` and `order` in data/device-models (order counts
// from the left as the maker's panel drawing shows that face). Where the model does not say, a house
// default is used and recorded (basis): the rear face, the lower third, the ports spread about the
// middle. A port that the model does not have is never drawn: wiring must name the model's ports
// (tools/crossrefs.mjs checks it).
import { parseEnd, devKey, WALL_H } from './room3d.mjs';

export const SIGNAL = { hdmi: 'hdmi', displayport: 'hdmi', usb: 'usb', 'usb-c': 'usb', thunderbolt: 'usb', cat6: 'lan', cat6a: 'lan', power: 'power', audio: 'audio', 'poly-mic': 'audio', speaker: 'audio', proprietary: 'other' };
const SIG_ORDER = ['power', 'lan', 'poe', 'hdbt', 'hdmi', 'usb', 'audio', 'other', 'feed'];
export const PITCH_PX = 3.2, MIN_PITCH_PX = 2.1;
const H_DEFAULT = WALL_H;

// ---------- Vectors ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const neg = (a) => a.map((v) => -v);
const axisOf = (v) => (Math.abs(v[0]) > 0.5 ? 0 : Math.abs(v[1]) > 0.5 ? 1 : 2);
const same = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
const r3 = (v) => Math.round(v * 1000) / 1000;
const key3 = (p) => `${r3(p[0])},${r3(p[1])},${r3(p[2])}`;

// ---------- Ports on the device ----------
// How a device is mounted (room3d's `mounts`): which way its front and its top point in the room.
const FRAMES = {
  front: { F: [0, 1, 0], U: [0, 0, 1] },
  rev: { F: [0, -1, 0], U: [0, 0, 1] },
  'wall-base': { F: [0, 0, 1], U: [0, 1, 0] },
  left: { F: [1, 0, 0], U: [0, 0, 1] },
  right: { F: [-1, 0, 0], U: [0, 0, 1] },
  'out-left': { F: [-1, 0, 0], U: [0, 0, 1] },
  'out-back': { F: [0, -1, 0], U: [0, 0, 1] },
  ceiling: { F: [0, 0, -1], U: [0, 1, 0] },
};
const faceNormal = (face, { F, U }) => ({ front: F, rear: neg(F), top: U, bottom: neg(U), right: cross(F, U), left: neg(cross(F, U)) })[face];
// The shape a device's ports are on: a monitor's panel, otherwise its biggest part.
function mainShape(ss) {
  const vol = (s) => (s.bb.x1 - s.bb.x0) * (s.bb.y1 - s.bb.y0) * (s.z1 - s.z0);
  return ss.find((s) => s.mat === 'bezel') ?? [...ss].sort((a, b) => vol(b) - vol(a))[0];
}
// Where a port is, in room metres, and the way it faces. `basis` says where the position comes from:
// model (face and order from the maker), face (face from the maker, place along it a house default) or
// default (neither known: rear face, lower third, spread about the middle).
export function portPlace(shapes, mount, model, portId, wiredPorts = []) {
  const s = mainShape(shapes);
  const fr = FRAMES[mount] ?? FRAMES.front;
  const all = model?.ports ?? wiredPorts.map((id) => ({ id }));
  const port = all.find((p) => p.id === portId) ?? { id: portId };
  const face = port.face ?? 'rear';
  const basis = port.face && port.order ? 'model' : port.face ? 'face' : 'default';
  const onFace = all.filter((p) => (p.face ?? 'rear') === face);
  let u;
  if (port.order) {
    const ranked = onFace.filter((p) => p.order).sort((a, b) => a.order - b.order);
    const k = ranked.findIndex((p) => p.id === port.id);
    u = 0.15 + (0.7 * (k + 0.5)) / ranked.length;
  } else {
    const loose = onFace.filter((p) => !p.order).map((p) => p.id).sort();
    const k = Math.max(0, loose.indexOf(port.id)), m = Math.max(1, loose.length), step = Math.min(0.12, 0.7 / m);
    u = 0.5 + (k - (m - 1) / 2) * step;
  }
  const n = faceNormal(face, fr);
  const up = Math.abs(n[axisOf(fr.U)]) > 0.5 && axisOf(n) === axisOf(fr.U) ? neg(fr.F) : fr.U;
  const right = cross(n, up);
  const lo = [s.bb.x0, s.bb.y0, s.z0], hi = [s.bb.x1, s.bb.y1, s.z1];
  const p = lo.map((v, i) => (v + hi[i]) / 2);
  // On the face itself.
  const na = axisOf(n); p[na] = n[na] > 0 ? hi[na] : lo[na];
  const ra = axisOf(right); p[ra] = lo[ra] + (hi[ra] - lo[ra]) * (right[ra] > 0 ? u : 1 - u);
  const ua = axisOf(up); const v = axisOf(n) === axisOf(fr.U) ? 0.5 : 1 / 3;
  p[ua] = lo[ua] + (hi[ua] - lo[ua]) * (up[ua] > 0 ? v : 1 - v);
  return { p, n, face, basis, id: port.id };
}

// ---------- Containment ----------
const WORD = {
  track: 'the track behind the display', riser: 'the wall riser', drop: 'the ceiling drop', ceiling: 'the ceiling', skirt: 'the skirting trunking',
  cover: 'the floor cable cover', duct: 'the floor duct', tray: 'the table tray', dtray: 'the desk tray', leg: 'the table leg', dleg: 'the desk leg',
  pass: 'the wall pass-through', spine: 'the cable spine', side: 'the trunking behind the sideboard', void: 'the floor void', wallv: 'inside the wall',
};
// Containment you can see is drawn as trunking; containment hidden in the floor, the ceiling or
// behind the display is drawn as a dashed outline.
const HIDDEN = new Set(['track', 'ceiling', 'duct', 'tray', 'dtray', 'void', 'wallv', 'box']);

export function containment(M) {
  const A = M.anchors, H = M.H ?? H_DEFAULT, { W, D, open } = M.room;
  const runs = [];
  const add = (kind, a, b, off, o = {}) => {
    const d = sub(b, a); const ax = [0, 1, 2].find((i) => Math.abs(d[i]) > 1e-6);
    if (ax == null) return null;
    const [lo, hi] = a[ax] <= b[ax] ? [a, b] : [b, a];
    const r = { id: `${kind}-${runs.length}`, kind, a: lo, b: hi, ax, off, hid: HIDDEN.has(kind), word: WORD[kind], ...o };
    runs.push(r); return r;
  };
  const groups = M.plates.groups.filter((g) => g.at);
  const shapesOf = (k) => M.placed.get(k) ?? [];
  const T = A.table, K = A.desk, tr = A.track;
  const door = A.door;
  const SK = 0.08, WY = 0.03, CZ = H - 0.005;

  // What stands on the display wall below the track, for keeping risers clear of it.
  const blocked = [];
  for (const [k, ss] of M.placed) {
    if (M.mounts.get(k) === 'wall-base') continue;
    for (const s of ss) if (s.bb.y0 < 0.3 && s.mat !== 'bezel' && s.z1 > 0.05) blocked.push([s.bb.x0, s.bb.x1, s.z0, s.z1]);
  }
  for (const g of groups) if (g.surface === 'back' && g.span) blocked.push([g.span[0], g.span[1], g.at[2] - 0.08, g.at[2] + 0.08]);
  const clearX = (cands, z0, z1) => cands.find((x) => blocked.every(([a, b, c, d]) => d < z0 || c > z1 || x < a - 0.05 || x > b + 0.05)) ?? cands[0];

  // The track, and the risers that meet it.
  let riserX = null, dropX = null;
  const boxes = groups.filter((g) => g.surface === 'floor');
  if (tr) {
    add('track', [tr.x0, WY, tr.z], [tr.x1, WY, tr.z], 2);
    const want = boxes[0]?.at[0] ?? (tr.x0 + tr.x1) / 2;
    const cands = [];
    for (let x = tr.x0 + 0.04; x <= tr.x1 - 0.04; x += 0.02) cands.push(x);
    cands.sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
    riserX = clearX(cands, 0, tr.z);
    cands.sort((a, b) => b - a);
    dropX = clearX(cands, tr.z, H);
    add('riser', [riserX, WY, boxes.length ? -0.05 : SK], [riserX, WY, tr.z], 0);
    add('drop', [dropX, WY, tr.z], [dropX, WY, CZ], 0);
  }
  // Skirting along the display wall and the left wall, stopping at a door.
  if (!open) {
    const gaps = (wall, len) => {
      if (!door || door.wall !== wall) return [[WY, len - WY]];
      return [[WY, door.a0 - 0.05], [door.a1 + 0.05, len - WY]].filter(([a, b]) => b - a > 0.2);
    };
    for (const [a, b] of gaps('back', W)) add('skirt', [a, WY, SK], [b, WY, SK], 2);
    for (const [a, b] of gaps('left', D)) add('skirt', [WY, a, SK], [WY, b, SK], 2);
    // The ceiling: baskets along the top of the display wall and the left wall.
    add('ceiling', [WY, WY, CZ], [W - 0.05, WY, CZ], 2);
    add('ceiling', [WY, WY, CZ], [WY, D - 0.05, CZ], 2);
  }
  // A branch across the ceiling to everything up there (ceiling devices, a camera high on a wall).
  const high = [];
  for (const [k, ss] of M.placed) { const s = mainShape(ss); if (s.z1 > H - 0.5 && (M.mounts.get(k) === 'ceiling' || M.mounts.get(k) === 'right')) high.push([(s.bb.x0 + s.bb.x1) / 2, (s.bb.y0 + s.bb.y1) / 2]); }
  for (const g of groups) if (g.surface === 'ceiling') high.push([g.at[0], g.at[1]]);
  if (!open) for (const [x, y] of high) add('ceiling', [x, WY, CZ], [x, y, CZ], 0);
  // A device high on the left wall (a whiteboard camera over the marker board): trunking up the wall
  // beside it into the ceiling basket along that wall.
  if (!open) for (const [k, ss] of M.placed) {
    if (M.mounts.get(k) !== 'left') continue;
    const s = mainShape(ss);
    if (s.z1 < H - 0.6) continue;
    const y = s.bb.y1 + 0.03;
    add('drop', [WY, y, Math.min(...ss.map((x) => x.z0))], [WY, y, CZ], 1);
  }

  // The table: a tray under the top, down the leg nearest the floor box, a floor cover to the box,
  // the box itself (its lid, then down into the floor), the floor duct to the wall riser.
  const legsUnder = (S) => M.b.S.filter((s) => s.mat === 'leg' && s.z1 > 0.3 && s.bb.x0 >= S.x0 - 0.3 && s.bb.x1 <= S.x1 + 0.3 && s.bb.y0 >= S.y0 - 0.3 && s.bb.y1 <= S.y1 + 0.3);
  const fb = boxes.find((g) => g.loc === 'below-table') ?? boxes[0];
  for (const g of boxes) {
    const [cx, cy] = g.at, hw = g.size[0] / 2000 - 0.02, hd = g.size[1] / 2000 - 0.02;
    add('box', [cx - hw, cy, 0.012], [cx + hw, cy, 0.012], 1, { sk: g.sk });
    add('box', [cx, cy - hd, 0.012], [cx, cy + hd, 0.012], 0, { sk: g.sk });
    add('box', [cx, cy, 0.012], [cx, cy, -0.05], 0, { sk: g.sk });
    if (tr) {
      add('duct', [cx, cy, -0.05], [cx, WY, -0.05], 0);
      if (Math.abs(cx - riserX) > 1e-3) add('duct', [cx, WY, -0.05], [riserX, WY, -0.05], 2);
    }
  }
  if (T) {
    const tz = T.z - 0.06, cx = (T.x0 + T.x1) / 2;
    const legs = legsUnder(T);
    const toward = fb ? fb.at : [cx, T.y0];
    const leg = [...legs].sort((a, b) => Math.hypot((a.bb.x0 + a.bb.x1) / 2 - toward[0], (a.bb.y0 + a.bb.y1) / 2 - toward[1]) - Math.hypot((b.bb.x0 + b.bb.x1) / 2 - toward[0], (b.bb.y0 + b.bb.y1) / 2 - toward[1]))[0];
    if (T.arc) {
      // A curved table: the tray runs across under it, with a spur to each microphone.
      const ty = fb ? fb.at[1] : 2.68, xs = (T.pts ?? []).map((p) => p[0]);
      const x0 = Math.min(cx - 1.0, ...xs), x1 = Math.max(cx + 1.0, ...xs);
      add('tray', [x0, ty, tz], [x1, ty, tz], 1);
      for (const [px, py] of T.pts ?? []) add('tray', [px, py, tz], [px, ty, tz], 0);
      for (const [px, py] of A.cubbies ?? []) add('tray', [px, py, tz], [px, ty, tz], 0);
      // A cable spine straight down from the tray into the floor box under the table.
      if (fb && Math.abs(fb.at[1] - ty) < 1e-3) add('spine', [fb.at[0], ty, tz], [fb.at[0], ty, 0.012], 1);
      if (leg) {
        const lx = leg.bb.x1 + 0.005;
        add('leg', [lx, ty, tz], [lx, ty, 0.012], 1);
        if (fb) add('cover', [lx, ty, 0.012], [fb.at[0], ty, 0.012], 1);
      }
    } else {
      add('tray', [cx, T.y0 + 0.1, tz], [cx, T.y1 - 0.1, tz], 0);
      if (leg) {
        const ly = leg.bb.y0 - 0.005, lx = cx;
        add('leg', [lx, ly, tz], [lx, ly, 0.012], 0);
        if (fb) {
          const [bx, by] = fb.at;
          if (Math.abs(bx - lx) < 1e-3) add('cover', [lx, ly, 0.012], [lx, by, 0.012], 0);
          else { add('cover', [lx, ly, 0.012], [lx, by, 0.012], 0); add('cover', [lx, by, 0.012], [bx, by, 0.012], 1); }
        } else if (!open) {
          add('cover', [lx, ly, 0.012], [lx, WY, 0.012], 0);
          add('skirt', [lx, WY, 0.012], [lx, WY, SK], 0);
        }
      }
      // A table fixed to the display wall: through the wall behind it, down from the track.
      if (tr && T.y0 < 0.2) {
        const px = clearX([cx, cx + 0.3, cx - 0.3, cx + 0.45, cx - 0.45, cx + 0.6, cx - 0.6], tz, tr.z);
        add('tray', [cx, WY, tz], [cx, T.y0 + 0.1, tz], 0);
        add('pass', [px, WY, tr.z], [px, WY, tz], 0);
        if (Math.abs(px - cx) > 1e-3) add('pass', [px, WY, tz], [cx, WY, tz], 2);
      }
    }
  }
  if (K) {
    // A desk: a tray under the back edge, over both back legs; a floor cover from a back leg to the
    // display wall or the left wall, then up to the skirting.
    const ty = K.y0 + 0.12, tz = K.z - 0.06;
    add('dtray', [K.x0 + 0.06, ty, tz], [K.x1 - 0.06, ty, tz], 1);
    if (!open) for (const lx of [K.x0 + 0.12, K.x1 - 0.12]) {
      add('dleg', [lx, ty, tz], [lx, ty, 0.012], 0);
      add('cover', [lx, ty, 0.012], [lx, WY, 0.012], 0);
      add('skirt', [lx, WY, 0.012], [lx, WY, SK], 0);
      if (lx < W / 2) {
        add('dleg', [lx, ty, tz], [lx, ty, 0.012], 1);
        add('cover', [lx, ty, 0.012], [WY, ty, 0.012], 1);
        add('skirt', [WY, ty, 0.012], [WY, ty, SK], 1);
      }
    }
  }
  if (A.sideboard) {
    // At home: up the wall behind the sideboard to a short run just above its top.
    const sb = A.sideboard, z = sb.z + 0.03, x = sb.x0 + 0.08;
    add('side', [x, WY, SK], [x, WY, z], 0);
    add('side', [x, WY, z], [sb.x1 - 0.05, WY, z], 2);
  }
  // Where the data comes in: above the door, from the comms room's cabling in the corridor ceiling.
  let entry = null;
  if (door && !open && !A.home) {
    const m = (door.a0 + door.a1) / 2;
    entry = door.wall === 'left' ? { p: [WY, m, CZ], out: [-0.12, m, CZ], wall: 'left' } : { p: [m, WY, CZ], out: [m, -0.12, CZ], wall: 'back' };
    // The floor boxes' own feed: through the floor void to the door wall, up inside it.
    for (const g of boxes) {
      const [cx, cy] = g.at;
      if (door.wall === 'left') { add('void', [cx, cy, -0.05], [cx, cy, -0.09], 0); add('void', [cx, cy, -0.09], [WY, cy, -0.09], 1); add('void', [WY, cy, -0.09], [WY, m, -0.09], 2); }
      else { add('void', [cx, cy, -0.05], [cx, cy, -0.09], 1); add('void', [cx, cy, -0.09], [cx, WY, -0.09], 0); add('void', [cx, WY, -0.09], [m, WY, -0.09], 2); }
    }
    if (boxes.length) add('wallv', door.wall === 'left' ? [WY, m, -0.09] : [m, WY, -0.09], entry.p, door.wall === 'left' ? 1 : 0);
  }
  return { runs, entry, riserX, dropX };
}

// ---------- The graph over the containment ----------
function pointOn(r, s) { const p = [...r.a]; p[r.ax] = s; return p; }
function onRun(r, p, tol = 2e-3) {
  for (let i = 0; i < 3; i++) if (i !== r.ax && Math.abs(p[i] - r.a[i]) > tol) return false;
  return p[r.ax] >= r.a[r.ax] - tol && p[r.ax] <= r.b[r.ax] + tol;
}
function junctions(runs) {
  const cuts = runs.map((r) => new Set([r.a[r.ax], r.b[r.ax]]));
  for (let i = 0; i < runs.length; i++) for (let j = 0; j < runs.length; j++) {
    if (i === j) continue;
    const r = runs[i], q = runs[j];
    // An end of q on r, or the crossing point of two perpendicular runs.
    for (const e of [q.a, q.b]) if (onRun(r, e)) cuts[i].add(e[r.ax]);
    if (r.ax !== q.ax) {
      const p = [...r.a]; p[r.ax] = q.a[r.ax];
      for (let k = 0; k < 3; k++) if (k !== r.ax && k === q.ax) p[k] = r.a[k];
      if (onRun(r, p) && onRun(q, p)) cuts[i].add(p[r.ax]);
    }
  }
  return cuts;
}
function buildGraph(runs, extra) {
  const cuts = junctions(runs);
  for (const { r, s } of extra) cuts[runs.indexOf(r)].add(s);
  const adj = new Map();
  const link = (a, b, e) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, ...e }); };
  runs.forEach((r, i) => {
    const ss = [...cuts[i]].map(r3).filter((s, k, arr) => arr.indexOf(s) === k).sort((a, b) => a - b);
    for (let k = 0; k + 1 < ss.length; k++) {
      const a = key3(pointOn(r, ss[k])), b = key3(pointOn(r, ss[k + 1]));
      const e = { run: r, s0: ss[k], s1: ss[k + 1], len: ss[k + 1] - ss[k] };
      link(a, b, e); link(b, a, { ...e, rev: true });
    }
  });
  return adj;
}
// Shortest path over the containment, with a small cost for changing run (fewer bends).
function shortest(adj, from, to) {
  const dist = new Map([[`${from}|`, 0]]), prev = new Map(), done = new Set();
  const q = [{ k: from, run: null, d: 0 }];
  while (q.length) {
    q.sort((a, b) => a.d - b.d);
    const cur = q.shift(), sk = `${cur.k}|${cur.run?.id ?? ''}`;
    if (done.has(sk)) continue; done.add(sk);
    if (cur.k === to) {
      const path = []; let s = sk;
      while (prev.has(s)) { const p = prev.get(s); path.unshift(p.e); s = p.from; }
      return path;
    }
    for (const e of adj.get(cur.k) ?? []) {
      const nd = cur.d + e.len + (cur.run && cur.run !== e.run ? 0.25 : 0);
      const nk = `${e.to}|${e.run.id}`;
      if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); prev.set(nk, { from: sk, e: { ...e, from: cur.k } }); q.push({ k: e.to, run: e.run, d: nd }); }
    }
  }
  return null;
}

// ---------- Routing ----------
// Which containment an end may join, from where the thing is.
function kindsFor(end) {
  if (end.plate && end.behind) return ['track'];
  if (end.plate) return { back: ['skirt'], left: ['skirt'], floor: ['box'], desk: ['dtray'], ceiling: ['ceiling'] }[end.surf] ?? ['skirt'];
  const loc = end.loc;
  if (end.fixed === 'laptop') return end.cubby ? ['tray'] : ['dtray'];
  if (end.fixed === 'home-router') return ['side'];
  if (loc === 'behind-display' || loc === 'display-wall') return ['track'];
  if (loc === 'table-top' || loc === 'below-table') return end.desk ? ['dtray'] : ['tray'];
  if (loc === 'ceiling' || end.mount === 'ceiling' || end.mount === 'right') return ['ceiling'];
  if (end.mount === 'left' && end.p[2] > 1.8) return ['drop'];
  if (end.cls === 'network-gateway') return ['side'];
  return ['skirt', 'side'];
}

export function routeCables(M, option, fitted = [], { models = {}, project = null, cacheKey = null } = {}) {
  const fit = new Set(fitted);
  const items = new Map(option.equipment.map((e) => [e.key, e]));
  const on = (k) => items.get(k)?.requirement !== 'optional' || fit.has(k);
  const groups = M.plates.groups.filter((g) => g.at);
  const byPort = new Map();
  for (const g of groups) for (const [k, p] of Object.entries(g.portAt)) byPort.set(k, { g, p });
  const C = containment(M);
  const runs = C.runs;
  const links = (option.wiring ?? []).filter((l) => !(l.when && !fit.has(l.when)) && !(l.unless && fit.has(l.unless)) && [l.from, l.to].map(parseEnd).every((e) => !e.key || on(e.key)));
  // The ports each device is wired on (for devices with no model, whose ports only the wiring names).
  const wired = new Map();
  for (const l of links) for (const ep of [l.from, l.to]) { const e = parseEnd(ep); if (e.key) { const k = e.key; if (!wired.has(k)) wired.set(k, new Set()); wired.get(k).add(e.port); } }
  let cubby = 0;
  const basisLog = [];
  const endOf = (ep) => {
    const e = parseEnd(ep);
    if (e.outlet) {
      const hit = byPort.get(`${e.svc}/${e.loc}#${e.n}`); if (!hit) return null;
      const n = hit.g.surface === 'left' ? [1, 0, 0] : hit.g.surface === 'floor' || hit.g.surface === 'ceiling' ? [0, 0, hit.g.surface === 'floor' ? 1 : -1] : hit.g.surface === 'desk' ? [0, 1, 0] : [0, 1, 0];
      return { sk: hit.g.sk, p: hit.p, n, plate: true, surf: hit.g.surface, g: hit.g, port: e, hid: hit.g.hid, behind: hit.g.loc === 'behind-display' };
    }
    if (ep === 'laptop') {
      if (M.ends.laptop) return { sk: 'laptop', ...M.ends.laptop, fixed: 'laptop' };
      const c = M.anchors.cubbies?.[cubby++ % (M.anchors.cubbies?.length || 1)];
      return c ? { sk: 'laptop', p: [c[0], c[1], c[2] + 0.004], n: [0, 0, 1], fixed: 'laptop', cubby: true } : { sk: 'laptop', tail: true };
    }
    if (M.ends[ep]) return { sk: ep, ...M.ends[ep], fixed: ep };
    const sk = devKey(e, option), eq = items.get(e.key);
    if (eq?.location === 'data-closet') return { sk: `closet:${e.key}`, closet: true, key: e.key, port: e.port, eq };
    const ss = M.placed.get(sk); if (!ss) return null;
    const pl = portPlace(ss, M.mounts.get(sk), models[eq?.model], e.port, [...(wired.get(e.key) ?? [])]);
    // A screen with no model: rear, middle, lower third, but never down among the track's lanes.
    if (!eq?.model && eq?.class === 'display' && M.anchors.track) pl.p[2] = Math.max(pl.p[2], M.anchors.track.z + M.anchors.track.half + 0.03);
    basisLog.push({ key: e.key, model: eq?.model ?? null, cls: eq?.class, port: e.port, basis: eq?.model ? pl.basis : 'no-model' });
    return { sk, p: pl.p, n: pl.n, loc: eq?.location, mount: M.mounts.get(sk), cls: eq?.class, desk: !!M.anchors.desk, port: e, eq, basis: pl.basis, hid: ['behind-display', 'below-table'].includes(eq?.location) };
  };
  // Attach an end to the nearest run of a kind it may join: the point on the run level with it.
  const attach = (end) => {
    let kinds = kindsFor(end);
    let cands = runs.filter((r) => kinds.includes(r.kind));
    if (!cands.length) cands = runs.filter((r) => !['void', 'wallv', 'box', 'duct'].includes(r.kind));
    let best = null;
    for (const r of cands) {
      const s = Math.max(r.a[r.ax], Math.min(r.b[r.ax], end.p[r.ax]));
      const q = pointOn(r, s);
      // A floor box's ports reach its lid run; everything else the nearest point.
      const d = Math.abs(q[0] - end.p[0]) + Math.abs(q[1] - end.p[1]) + Math.abs(q[2] - end.p[2]) + (end.plate && end.surf === 'floor' && r.sk !== end.sk ? 9 : 0);
      if (!best || d < best.d) best = { r, s: r3(s), d };
    }
    return best;
  };
  const cables = [], tails = [];
  const raw = [];
  for (const [i, l] of links.entries()) {
    const A0 = endOf(l.from), B0 = endOf(l.to);
    if (!A0 || !B0) continue;
    const sig = l.cable === 'cat6a' && /hdbaset/.test(l.from + l.to) ? 'hdbt' : /poe/i.test(l.notes ?? '') && SIGNAL[l.cable] === 'lan' ? 'poe' : SIGNAL[l.cable] ?? 'other';
    // Keep the room end first: a cable to the comms room starts in the room.
    const swap = A0.closet && !B0.closet;
    const [A, B] = swap ? [B0, A0] : [A0, B0];
    const [epA, epB] = swap ? [l.to, l.from] : [l.from, l.to];
    if (A.tail || B.tail || (A.closet && B.closet)) { tails.push({ i, l, A, B, sig, epA, epB }); continue; }
    raw.push({ i, l, A, B, sig, epA, epB });
  }
  // Feeds: each plate group's cabling back to the comms room, as a hidden route to the entry.
  if (C.entry) for (const g of groups) {
    if (g.outside || g.surface === 'desk') continue;
    const n = g.surface === 'floor' ? [0, 0, -1] : [0, 0, 1];
    const A = { sk: g.sk, p: g.surface === 'floor' ? [g.at[0], g.at[1], 0.012] : g.top, n, plate: true, surf: g.surface, g, feed: true };
    raw.push({ i: 1000 + raw.length, l: null, A, B: { sk: 'entry', entry: true, p: C.entry.p }, sig: 'feed' });
  }
  // Attach points, then the graph with them in it.
  const direct = (A, B) => !A.entry && !B.entry && !A.closet && !B.closet && Math.abs(A.p[0] - B.p[0]) + Math.abs(A.p[1] - B.p[1]) + Math.abs(A.p[2] - B.p[2]) < 0.5
    && ![A, B].some((e) => ['track', 'tray', 'dtray'].some((k) => kindsFor(e).includes(k)));
  const extra = [];
  for (const c of raw) {
    c.direct = direct(c.A, c.B);
    if (c.direct) continue;
    for (const side of ['A', 'B']) {
      const e = c[side];
      if (e.entry || e.closet) { c[`at${side}`] = { entry: true }; continue; }
      if (e.feed) {
        // A plate's feed goes straight up inside the wall to the ceiling (or down into the floor void).
        const k = e.surf === 'floor' ? 'void' : 'ceiling';
        const cand = runs.filter((r) => r.kind === k && (k === 'void' ? onRun(r, [e.p[0], e.p[1], -0.05], 0.01) || onRun(r, [e.p[0], e.p[1], -0.09], 0.01) : true));
        let best = null;
        for (const r of cand) {
          const s = Math.max(r.a[r.ax], Math.min(r.b[r.ax], e.p[r.ax])); const q = pointOn(r, s);
          const d = Math.abs(q[0] - e.p[0]) + Math.abs(q[1] - e.p[1]) + (k === 'ceiling' ? 0 : Math.abs(q[2] - e.p[2]));
          if (!best || d < best.d) best = { r, s: r3(s), d };
        }
        c[`at${side}`] = best; if (best) extra.push(best); continue;
      }
      const at = attach(e); c[`at${side}`] = at; if (at) extra.push(at);
    }
  }
  if (C.entry) { const r = runs.find((r) => r.kind === 'ceiling' && onRun(r, C.entry.p)); if (r) extra.push({ r, s: r3(C.entry.p[r.ax]) }); }
  const adj = buildGraph(runs, extra);
  for (const c of raw) {
    if (c.direct) { c.path = []; continue; }
    const ka = c.atA?.entry ? key3(C.entry.p) : c.atA && key3(pointOn(c.atA.r, c.atA.s));
    const kb = c.atB?.entry ? key3(C.entry.p) : c.atB && key3(pointOn(c.atB.r, c.atB.s));
    c.path = ka && kb ? (ka === kb ? [] : shortest(adj, ka, kb)) : null;
    if (c.path == null) c.direct = true;
  }
  // Channels: runs that fold round an edge (or carry straight on) with the same lane direction
  // share one set of lanes, so a cable keeps its lane round the fold.
  const parent = runs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const touch = (r, q) => onRun(r, q.a) || onRun(r, q.b) || onRun(q, r.a) || onRun(q, r.b);
  runs.forEach((r, i) => runs.forEach((q, j) => { if (j > i && r.off === q.off && touch(r, q) && (r.ax !== q.ax || [0, 1, 2].every((k) => k === r.ax || Math.abs(r.a[k] - q.a[k]) < 2e-3))) parent[find(i)] = find(j); }));
  runs.forEach((r, i) => { r.ch = find(i); });
  // Each cable's use of each run, as an interval along it.
  for (const c of raw) {
    c.use = new Map();
    for (const e of c.path ?? []) { const u = c.use.get(e.run) ?? [Infinity, -Infinity]; u[0] = Math.min(u[0], e.s0); u[1] = Math.max(u[1], e.s1); c.use.set(e.run, u); }
    c.chans = new Set([...c.use.keys()].map((r) => r.ch));
  }
  // Lane pitch per axis: the same few pixels on screen whichever way the run goes.
  const pitch = [0, 1, 2].map((ax) => {
    if (!project) return 0.03;
    const o = project(0, 0, 0), e = project(...[0, 1, 2].map((k) => (k === ax ? 1 : 0)));
    return PITCH_PX / Math.max(1, Math.hypot(e[0] - o[0], e[1] - o[1]));
  });
  // Lanes for an order of cables: each takes the lowest lane clear of the cables before it that share
  // any stretch of the same channel; the channel's lanes are then centred on the run.
  // Two stretches on different runs of one channel clash where both reach the point the runs meet.
  const meets = (r, u, q, v) => {
    const P = [q.a, q.b].find((e) => onRun(r, e)) ?? [r.a, r.b].find((e) => onRun(q, e));
    return !!P && P[r.ax] > u[0] - 0.06 && P[r.ax] < u[1] + 0.06 && P[q.ax] > v[0] - 0.06 && P[q.ax] < v[1] + 0.06;
  };
  const lanesFor = (order) => {
    const lane = new Map(), top = new Map(); // lowest free lane: as few lanes as the busiest stretch needs
    for (const c of order) {
      const m = new Map();
      // Lanes are per channel: a cable on several channels takes the lowest free lane in each.
      for (const ch of c.chans) {
        const taken = new Set();
        for (const d of order) {
          if (d === c) break;
          if (!d.chans.has(ch)) continue;
          const clash = [...c.use].some(([r, u]) => r.ch === ch && [...d.use].some(([q, v]) => q.ch === ch && (q === r ? v[0] < u[1] + 0.06 && u[0] < v[1] + 0.06 : meets(r, u, q, v))));
          if (clash) taken.add(lane.get(d).get(ch));
        }
        let l2 = 0; while (taken.has(l2)) l2++;
        m.set(ch, l2);
        top.set(ch, Math.max(top.get(ch) ?? 0, l2));
      }
      lane.set(c, m);
    }
    return { lane, top };
  };
  // A cable's legs: the drop from its port, its runs in their lanes, the drop to the other port.
  // The track behind a display has a fixed height to fit in (between the plates and the boxes): its
  // lanes close up to fit, but never closer than MIN_PITCH_PX on screen.
  const trackHalf = M.anchors.track?.half;
  const pitchOf = (r, L) => {
    const p = pitch[r.off];
    if (r.kind !== 'track' || !trackHalf) return p;
    const n = L.top.get(r.ch) ?? 0;
    return n ? Math.max(p * (MIN_PITCH_PX / PITCH_PX), Math.min(p, (2 * trackHalf - p) / n)) : p;
  };
  const offsetOf = (c, r, L) => { const ln = L.lane.get(c).get(r.ch), n = L.top.get(r.ch); return (ln - n / 2) * pitchOf(r, L); };
  const stub = (p, n, target) => {
    // From the port: out along the way the port faces first, then the other axes, shortest first.
    const out = axisOf(n), rest = [0, 1, 2].filter((k) => k !== out).sort((a, b) => Math.abs(target[a] - p[a]) - Math.abs(target[b] - p[b]));
    const pts = [p]; let cur = [...p];
    for (const k of [out, ...rest]) if (Math.abs(cur[k] - target[k]) > 1e-6) { cur = [...cur]; cur[k] = target[k]; pts.push(cur); }
    return pts;
  };
  const legsOf = (pts) => pts.slice(1).map((q, i) => { const p = pts[i]; const ax = [0, 1, 2].find((k) => Math.abs(q[k] - p[k]) > 1e-9); return { ax, fixed: p, to: q[ax] }; }).filter((l) => l.ax != null);
  const geometry = (c, L) => {
    if (c.direct) {
      const pts = stub(c.A.p, c.A.n ?? [0, 1, 0], c.B.p);
      return pts;
    }
    const lanePt = (at, r) => { const q = pointOn(r, at.s); q[r.off] += offsetOf(c, r, L); return q; };
    const legs = [];
    let pA = c.A.entry || c.A.closet ? null : c.A.p;
    const firstRun = c.path[0]?.run ?? c.atA?.r, lastRun = c.path.at(-1)?.run ?? c.atB?.r;
    if (pA) legs.push(...legsOf(stub(pA, c.A.n ?? [0, 0, 1], lanePt(c.atA, firstRun))));
    // Runs, merged where one run carries on.
    const segs = [];
    for (const e of c.path) {
      const s0 = e.rev ? e.s1 : e.s0, s1 = e.rev ? e.s0 : e.s1;
      if (segs.length && segs.at(-1).run === e.run) segs.at(-1).to = s1; else segs.push({ run: e.run, from: s0, to: s1 });
    }
    for (const sg of segs) { const q = pointOn(sg.run, sg.from); q[sg.run.off] += offsetOf(c, sg.run, L); legs.push({ ax: sg.run.ax, fixed: q, to: sg.to }); }
    const pB = c.B.entry || c.B.closet ? null : c.B.p;
    const endPt = pB ?? C.entry.p;
    if (pB) {
      const back = stub(pB, c.B.n ?? [0, 0, 1], lanePt(c.atB, lastRun)).reverse();
      legs.push(...legsOf(back));
    }
    const start = pA ?? (() => { const r = segs[0]?.run; const q = C.entry.p.slice(); if (r) q[r.off] += offsetOf(c, r, L); return q; })();
    const pts = [start];
    for (let k = 0; k + 1 < legs.length; k++) {
      const L1 = legs[k], L2 = legs[k + 1];
      if (L1.ax !== L2.ax) {
        const t = 3 - L1.ax - L2.ax, P = [0, 0, 0];
        P[L1.ax] = L2.fixed[L1.ax]; P[L2.ax] = L1.fixed[L2.ax]; P[t] = L1.fixed[t];
        pts.push(P);
        if (Math.abs(L1.fixed[t] - L2.fixed[t]) > 1e-6) { const P2 = [...P]; P2[t] = L2.fixed[t]; pts.push(P2); }
      } else {
        let P = [...L1.fixed]; P[L1.ax] = L1.to; pts.push(P);
        for (const t of [0, 1, 2]) if (t !== L1.ax && Math.abs(P[t] - L2.fixed[t]) > 1e-6) { P = [...P]; P[t] = L2.fixed[t]; pts.push(P); }
      }
    }
    if (pB) pts.push(endPt);
    else { const last = legs.at(-1); const P = [...last.fixed]; P[last.ax] = last.to; pts.push(P); }
    return tidy(pts);
  };
  // Crossings on screen between cables that share a channel: the order of lanes is chosen to keep
  // these few (adjacent swaps while it helps; the same answer every build).
  const proj = project ? (p) => project(...p) : null;
  const crossings = (geo) => {
    let n = 0;
    const segsOf = new Map([...geo].map(([c, pts]) => [c, pts.slice(1).map((q, i) => [proj(pts[i]), proj(q)])]));
    for (let i = 0; i < raw.length; i++) for (let j = i + 1; j < raw.length; j++) {
      const a = raw[i], b = raw[j];
      if (![...a.chans].some((ch) => b.chans.has(ch))) continue;
      for (const s of segsOf.get(a)) for (const t of segsOf.get(b)) if (segCross(s, t)) n++;
    }
    return n;
  };
  const rank = (c) => SIG_ORDER.indexOf(c.sig);
  let order = [...raw].sort((a, b) => rank(a) - rank(b) || a.i - b.i);
  const cached = cacheKey && ORDER_CACHE.get(cacheKey);
  if (cached && cached.length === order.length) order = cached.map((i) => raw.find((c) => c.i === i)).filter(Boolean);
  const evaluate = (ord) => { const L = lanesFor(ord); const g = new Map(ord.map((c) => [c, geometry(c, L)])); return { L, g, n: proj ? crossings(g) : 0 }; };
  let best = evaluate(order);
  if (proj && !cached && raw.length > 2) {
    for (let pass = 0; pass < 5 && best.n > 0; pass++) {
      let better = false;
      for (let k = 0; k + 1 < order.length; k++) {
        const o2 = [...order]; [o2[k], o2[k + 1]] = [o2[k + 1], o2[k]];
        const ev = evaluate(o2);
        if (ev.n < best.n) { order = o2; best = ev; better = true; }
      }
      if (!better) break;
    }
    if (cacheKey) ORDER_CACHE.set(cacheKey, order.map((c) => c.i));
  }
  // What the drawing and the Key need.
  const used = new Map();
  for (const c of raw) for (const r of c.use.keys()) used.set(r, (used.get(r) ?? 0) + 1);
  // Containment is drawn only as far as the cables in it go (a skirting run is not drawn round the room).
  const extent = (r) => {
    let lo = Infinity, hi = -Infinity;
    for (const c of raw) { const u = c.use.get(r); if (u && c.sig !== 'feed') { lo = Math.min(lo, u[0]); hi = Math.max(hi, u[1]); } }
    if (lo > hi) return [r.a, r.b];
    return [pointOn(r, lo), pointOn(r, hi)];
  };
  const bands = [...used.keys()].map((r) => ({ id: r.id, kind: r.kind, hid: r.hid, ax: r.ax, off: r.off, a: extent(r)[0], b: extent(r)[1], half: ((best.L.top.get(r.ch) ?? 0) / 2) * pitchOf(r, best.L) + pitch[r.off] * 0.9, pad: pitch[r.ax] * 0.9, feedOnly: [...raw].every((c) => !c.use.has(r) || c.sig === 'feed') }));
  for (const c of raw) {
    const out = { id: `c${c.i}`, i: c.i, a: c.A.sk, b: c.B.sk, sig: c.sig, cable: c.l?.cable ?? null, notes: c.l?.notes ?? '', from: c.epA ?? null, to: c.epB ?? null, pts: best.g.get(c), runs: [...c.use.keys()].map((r) => r.id), kinds: kindsAlong(c), direct: c.direct, feed: c.sig === 'feed', basis: [c.A.basis, c.B.basis].filter(Boolean), hid: !!(c.A.hid && c.B.hid), endA: c.A, endB: c.B };
    if (c.B.entry || c.B.closet) { const last = out.pts.at(-1), o = [...last]; o[C.entry.wall === 'left' ? 0 : 1] = -0.12; out.pts = [...out.pts, o]; }
    cables.push(out);
  }
  for (const t of tails) cables.push({ id: `t${t.i}`, i: t.i, a: t.A.sk, b: t.B.sk, sig: t.sig, cable: t.l.cable, notes: t.l.notes ?? '', from: t.epA, to: t.epB, pts: null, runs: [], kinds: [], basis: [], tail: true, endA: t.A, endB: t.B });
  cables.sort((x, y) => x.i - y.i);
  return { cables, bands, entry: C.entry, basis: basisLog, pitch };
}
const ORDER_CACHE = new Map();

// The containment a cable runs along, in order, for the Key's words.
function kindsAlong(c) {
  const out = [];
  for (const e of c.path ?? []) {
    const w = e.run.kind === 'box' ? `floor box ${e.run.sk?.replace('plate-', '')}` : e.run.word;
    if (w && out.at(-1) !== w && !out.includes(w)) out.push(w);
  }
  return out;
}
// Drop repeated points and points in the middle of a straight line.
function tidy(pts) {
  const q = pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]));
  const out = [q[0]];
  for (let i = 1; i < q.length - 1; i++) {
    const a = out.at(-1), b = q[i], c = q[i + 1];
    const d1 = sub(b, a), d2 = sub(c, b);
    const ax1 = [0, 1, 2].filter((k) => Math.abs(d1[k]) > 1e-9), ax2 = [0, 1, 2].filter((k) => Math.abs(d2[k]) > 1e-9);
    if (ax1.length === 1 && ax2.length === 1 && ax1[0] === ax2[0] && Math.sign(d1[ax1[0]]) === Math.sign(d2[ax2[0]])) continue;
    out.push(b);
  }
  if (q.length > 1) out.push(q.at(-1));
  return out;
}
function segCross([a, b], [c, d]) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 0.01 && d2 < -0.01) || (d1 < -0.01 && d2 > 0.01)) && ((d3 > 0.01 && d4 < -0.01) || (d3 < -0.01 && d4 > 0.01));
}

// ---------- Words ----------
// A device's short name: "HDBaseT transmitter 2" for the second of "HDBaseT transmitters, one per side".
export function itemName(it) {
  let s = it.label.split(',')[0].trim();
  if (it.n > 1) s = `${/[^s]s$/.test(s) ? s.slice(0, -1) : s} ${it.i + 1}`;
  return s;
}
// The comms room a room's cabling goes back to (house default until floors are modelled): the comms
// room on the same floor, otherwise the site's main one (MDF), otherwise any at the site.
export function commsRoomOf(space, all) {
  const cr = all.filter((s) => s.site === space.site && ['idf', 'mdf'].includes(s.space_type));
  return cr.find((s) => s.floor === space.floor) ?? cr.find((s) => s.space_type === 'mdf') ?? cr[0] ?? null;
}
const PORT_WORD = [
  [/^hdmi-out-(\d+)$/, 'HDMI out $1'], [/^hdmi-in-(\d+)$/, 'HDMI in $1'], [/^displayport-out-(\d+)$/, 'DisplayPort out $1'], [/^displayport-in-(\d+)$/, 'DisplayPort in $1'],
  [/^lan-(\d+)$/, 'LAN $1'], [/^usb-c-(\d+)$/, 'USB-C $1'], [/^usb-a-(\d+)$/, 'USB-A $1'], [/^usb-b-(\d+)$/, 'USB-B $1'], [/^power-in$/, 'power'],
  [/^mic-(\d+)$/, 'mic port $1'], [/^hdbaset-(\d+)$/, 'HDBaseT $1'], [/^audio-out-(\d+)$/, 'audio out $1'], [/^audio-in-(\d+)$/, 'audio in $1'],
  [/^speaker-out-(\d+)$/, 'speaker out $1'], [/^speaker-in-(\d+)$/, 'speaker in $1'],
];
// "LAN 2", or just "LAN" when the model has only one LAN port.
export function portWord(id, model, wiredIds = []) {
  const rule = PORT_WORD.find(([re]) => re.test(id));
  if (!rule) return id.replace(/-/g, ' ');
  const w = id.replace(rule[0], rule[1]);
  const stem = id.replace(/-\d+$/, '');
  const ids = model?.ports?.map((p) => p.id) ?? wiredIds;
  const n = ids.filter((x) => x.replace(/-\d+$/, '') === stem).length;
  return n <= 1 ? w.replace(/ \d+$/, '') : w;
}
const SVC_WORD = { power: 'power', data: 'data', 'direct-run': 'direct run' };
// One cable in words: "Video bar LAN to plate A, data 2, via the track behind the display".
export function cableWords(c, { nameOf, models = {}, option }) {
  const side = (end, ep) => {
    if (!ep) return end.entry ? 'the comms room' : '';
    if (end.plate && !end.feed) return `plate ${end.g.id}, ${SVC_WORD[end.port.svc]} ${end.port.n}`;
    if (end.closet) return `the ${nameOf(end.key, true)} in the comms room`;
    if (end.fixed === 'laptop' || ep === 'laptop') return 'a laptop';
    if (end.fixed === 'home-router') return 'the home router';
    const e = parseEnd(ep), eq = option.equipment.find((x) => x.key === e.key);
    return `${nameOf(end.sk)} ${portWord(e.port, models[eq?.model])}`;
  };
  if (c.feed) return `Plate ${c.endA.g.id}: cabled ${c.endA.surf === 'floor' ? 'through the floor void' : 'up inside the wall'} to the ceiling above the door, back to the comms room`;
  const words = `${side(c.endA, c.from)} to ${side(c.endB, c.to) || 'the comms room'}`;
  const first = words.charAt(0).toUpperCase() + words.slice(1);
  if (c.tail) return `${first}: a loose cable left at the plate for a laptop`;
  if (c.direct) return `${first}, plugged in beside it`;
  const via = c.kinds.filter((k) => k !== WORD.void && k !== WORD.wallv);
  const out = c.endB.entry || c.endB.closet ? ', out above the door' : '';
  return via.length ? `${first}, via ${via.length > 1 ? `${via.slice(0, -1).join(', ')} and ${via.at(-1)}` : via[0]}${out}` : first + out;
}
