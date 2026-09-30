// Room drawings to scale. Every room profile is modelled in metres from its data in data/space-types
// (room size, display sizes, the kit and its outlets, based on the public guidance in
// data/sources/room-guidance.yaml), then drawn as a cut-away axonometric: you look in from the front
// right corner at the display wall (the back) and the left wall. Furniture and other sizes the guidance
// does not give are house choices, kept the same everywhere; the caption under a drawing says which.
//
// World axes: x runs along the display wall (left to right), y comes out from it towards you,
// z is height. Everything is a prism (a floor polygon pushed up between two heights), sorted so
// nearer things are drawn over farther ones.
//
// The view turns a little per room (between 26 and 46 degrees) so a long room fills the frame
// instead of running off diagonally; the scale bar is drawn along the display wall's direction, so
// it stays true whatever the turn.

const PH = (30 * Math.PI) / 180, sP = Math.sin(PH), cP = Math.cos(PH);
function makeView(deg) {
  const th = (deg * Math.PI) / 180, cT = Math.cos(th), sT = Math.sin(th);
  return {
    deg, cT, sT,
    project: (x, y, z) => [x * cT - y * sT, (x * sT + y * cT) * sP - z * cP],
    depthOf: (x, y, z) => x * sT + y * cT + z * 0.05,
  };
}
const V28 = makeView(28);
export const project = V28.project;

export const WALL_H = 2.6;
const IN = 0.0254;
// Screen width and height (metres) from a 16:9 diagonal in inches.
const screen169 = (d) => ({ w: d * 0.8716 * IN, h: d * 0.4903 * IN });

// ---------- Building blocks ----------
function scene() {
  const S = [], decor = [], outlets = [], anchors = {};
  const api = {
    S, decor, outlets, anchors,
    prism(pts, z0, z1, mat, o = {}) {
      let a = 0;
      for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
      if (a < 0) pts = [...pts].reverse();
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const s = { pts, z0, z1, mat, ...o, bb: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } };
      S.push(s);
      return s;
    },
    box(x0, y0, z0, x1, y1, z1, mat, o = {}) {
      return api.prism([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0, z1, mat, { ...o, isBox: true });
    },
  };
  return api;
}
const rot = (pts, cx, cy, a) => pts.map(([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
const rect = (w, d) => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
const poly = (n, r, cx = 0, cy = 0, a0 = Math.PI / n) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(a0 + (i * 2 * Math.PI) / n), cy + r * Math.sin(a0 + (i * 2 * Math.PI) / n)]);

// A task chair facing angle a (radians; 0 faces +x, PI/2 faces +y towards you).
function chair(b, cx, cy, a, o = {}) {
  const g = o.ghost ? { ghost: true } : {};
  const seat = o.lounge ? 0.64 : 0.48, h = o.lounge ? 0.42 : 0.46;
  b.prism(rot(poly(6, 0.26), cx, cy, a), 0, 0.05, 'chair-base', g);
  b.prism(rot(rect(0.06, 0.06), cx, cy, a), 0.05, h - 0.06, 'chair-base', g);
  b.prism(rot(rect(seat, seat), cx, cy, a), h - 0.06, h, 'chair', g);
  const back = rot([[-seat / 2 + 0.02, -0.035], [seat / 2 - 0.02, -0.035], [seat / 2 - 0.02, 0.035], [-seat / 2 + 0.02, 0.035]], 0, 0, a + Math.PI / 2)
    .map(([x, y]) => [x + cx - Math.cos(a) * (seat / 2 - 0.03), y + cy - Math.sin(a) * (seat / 2 - 0.03)]);
  b.prism(back, h + 0.04, o.lounge ? 0.78 : 0.95, 'chair-back', g);
  if (o.lounge) {
    for (const s of [-1, 1]) {
      const arm = rot([[-seat / 2, -0.05], [seat / 2, -0.05], [seat / 2, 0.05], [-seat / 2, 0.05]], 0, 0, a)
        .map(([x, y]) => [x + cx + Math.cos(a + Math.PI / 2) * s * (seat / 2 - 0.05), y + cy + Math.sin(a + Math.PI / 2) * s * (seat / 2 - 0.05)]);
      b.prism(arm, h, 0.6, 'chair-back', g);
    }
  }
}
function stool(b, cx, cy, h = 0.76) {
  b.prism(poly(8, 0.2, cx, cy), 0, 0.03, 'chair-base');
  b.prism(poly(6, 0.03, cx, cy), 0.03, h - 0.04, 'chair-base');
  b.prism(poly(10, 0.19, cx, cy), h - 0.04, h, 'chair');
}
// A table: a slab on legs. The slab hides what is under it (class occ).
function table(b, x0, y0, x1, y1, h = 0.74, o = {}) {
  const inset = 0.12, t = o.thick ?? 0.04, mat = o.mat ?? 'table';
  if (o.pedestal) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, n = Math.max(1, Math.round((x1 - x0) / 2.2));
    for (let i = 0; i < n; i++) {
      const px = x0 + ((x1 - x0) * (i + 0.5)) / n;
      b.box(px - 0.3, cy - 0.2, 0, px + 0.3, cy + 0.2, 0.03, 'leg', { ghost: o.ghost });
      b.box(px - 0.08, cy - 0.12, 0.03, px + 0.08, cy + 0.12, h - t, 'leg', { ghost: o.ghost });
    }
  } else {
    for (const [lx, ly] of [[x0 + inset, y0 + inset], [x1 - inset, y0 + inset], [x0 + inset, y1 - inset], [x1 - inset, y1 - inset]]) b.box(lx - 0.025, ly - 0.025, 0, lx + 0.025, ly + 0.025, h - t, 'leg', { ghost: o.ghost });
  }
  if (o.modesty) b.box(x0 + 0.05, y0 + 0.02, h - 0.4, x1 - 0.05, y0 + 0.04, h - t, mat, { ghost: o.ghost });
  return b.box(x0, y0, h - t, x1, y1, h, mat, { occ: true, ghost: o.ghost });
}
function plant(b, cx, cy, h = 1.1, s = 1) {
  b.prism(poly(8, 0.17 * s, cx, cy), 0, 0.36 * s, 'pot', { label: 'Plant' });
  b.prism(poly(9, 0.3 * s, cx, cy, 0.3), 0.36 * s, h * 0.72, 'leaf', { label: 'Plant' });
  b.prism(poly(7, 0.2 * s, cx + 0.03, cy - 0.02, 0.1), h * 0.72, h, 'leaf', { label: 'Plant' });
}
// A door in the left wall (x = 0) between y0 and y1, or in the back wall (y = 0) between x0 and x1.
function door(b, wall, a0, a1) {
  if (wall === 'left') {
    b.box(-0.02, a0, 0, 0.03, a1, 2.1, 'door', { decor: [{ face: 'right', poly: [[0.08, 0.95], [0.18, 0.95], [0.18, 1.0], [0.08, 1.0]], mat: 'handle' }] });
    b.decor.push({ kind: 'arc', c: [0.03, a1], r: a1 - a0, from: -Math.PI / 2, to: 0 });
    b.anchors.door = { wall, a0, a1, p: [0.02, a1 + 0.12, 1.35] };
  } else {
    b.box(a0, -0.02, 0, a1, 0.03, 2.1, 'door', { decor: [{ face: 'front', poly: [[0.08, 0.95], [0.18, 0.95], [0.18, 1.0], [0.08, 1.0]], mat: 'handle' }] });
    b.decor.push({ kind: 'arc', c: [a0, 0.03], r: a1 - a0, from: 0, to: Math.PI / 2 });
    b.anchors.door = { wall, a0, a1, p: [a0 - 0.14, 0.02, 1.35] };
  }
}
function markerBoard(b, wall, a0, a1, zb = 0.9, zt = 2.0) {
  b.anchors.board = { wall, a0, a1, zb, zt };
  if (wall === 'left') b.box(0, a0, zb, 0.025, a1, zt, 'board', { label: 'Marker board' });
  else b.box(a0, 0, zb, a1, 0.025, zt, 'board', { label: 'Marker board' });
}
function credenza(b, x0, y0, x1, y1, h = 0.74, label = 'Credenza') { b.box(x0, y0, 0.05, x1, y1, h, 'wood', { label }); b.box(x0 + 0.03, y0 + 0.03, 0, x1 - 0.03, y1 - 0.03, 0.05, 'leg'); }

// ---------- Devices ----------
const BAR_W = { 'poly-studio-x72': 1.1, 'poly-studio-x52': 0.7, 'poly-studio-x32': 0.55, 'logitech-meetup-2': 0.44 };
const screenDecor = (w, h, face = 'front', m = 0.018) => [{ face, poly: [[m, m], [w - m, m], [w - m, h - m], [m, h - m]], mat: 'screen' }, { face, poly: [[m, h * 0.55], [w * 0.55, h - m], [m, h - m]], mat: 'glare' }];
function wallDisplay(b, cx, zb, inches, o) {
  const { w, h } = screen169(inches);
  b.box(cx - w / 2, 0.06, zb, cx + w / 2, 0.12, zb + h, 'bezel', { ...o, occ: true, decor: screenDecor(w, h) });
  return { x0: cx - w / 2, x1: cx + w / 2, z0: zb, z1: zb + h };
}
function videoBar(b, cx, zc, model, o) {
  const w = BAR_W[model] ?? 0.7, h = model === 'logitech-meetup-2' ? 0.1 : 0.09;
  b.box(cx - w / 2, 0.02, zc - h / 2, cx + w / 2, 0.13, zc + h / 2, 'dev', { ...o, decor: [{ face: 'front', poly: poly(10, 0.028, w / 2, h / 2), mat: 'lens' }, { face: 'front', poly: [[0.05, h / 2 - 0.006], [w / 2 - 0.06, h / 2 - 0.006], [w / 2 - 0.06, h / 2 + 0.006], [0.05, h / 2 + 0.006]], mat: 'grille' }, { face: 'front', poly: [[w / 2 + 0.06, h / 2 - 0.006], [w - 0.05, h / 2 - 0.006], [w - 0.05, h / 2 + 0.006], [w / 2 + 0.06, h / 2 + 0.006]], mat: 'grille' }] });
}
function monitor(b, cx, yb, zDesk, kind, o) {
  // kind: '34' (ultrawide 21:9), '27', 'desk-pro' (27 inch all-in-one), 'studio'
  const W = kind === '34' ? 0.81 : kind === 'desk-pro' ? 0.63 : 0.61, H = kind === '34' ? 0.36 : kind === 'desk-pro' ? 0.4 : 0.36;
  const lift = kind === 'desk-pro' ? 0.1 : 0.12;
  b.box(cx - 0.12, yb, zDesk, cx + 0.12, yb + 0.2, zDesk + 0.015, 'dev', o);
  b.box(cx - 0.03, yb + 0.02, zDesk + 0.015, cx + 0.03, yb + 0.05, zDesk + lift + 0.05, 'dev', o);
  b.box(cx - W / 2, yb + 0.05, zDesk + lift, cx + W / 2, yb + 0.08, zDesk + lift + H, 'bezel', { ...o, decor: o.flip ? [] : screenDecor(W, H, 'front', 0.012) });
  if (kind === 'desk-pro' || kind === '34' || o.camera) b.box(cx - 0.03, yb + 0.05, zDesk + lift + H, cx + 0.03, yb + 0.085, zDesk + lift + H + 0.02, 'dev', o);
}
function smallBox(b, cx, cy, z0, w, d, h, o, mat = 'dev') { return b.box(cx - w / 2, cy - d / 2, z0, cx + w / 2, cy + d / 2, z0 + h, mat, o); }
function laptop(b, cx, cy, z) {
  b.box(cx - 0.16, cy - 0.11, z, cx + 0.16, cy + 0.11, z + 0.015, 'laptop', { label: 'Laptop' });
  b.box(cx - 0.16, cy - 0.12, z + 0.015, cx + 0.16, cy - 0.105, z + 0.23, 'laptop', { label: 'Laptop', decor: screenDecor(0.32, 0.215, 'front', 0.012) });
}

// ---------- Room layouts ----------
// Each returns the room size, the furniture, and anchors the devices use: the display wall (where the
// screens centre and how high the camera sits), the table or desk surface, the door, and spots for
// items the guidance leaves to the project.
const num = (v) => (v && typeof v === 'object' ? v.max ?? v.min : v);
const pickSize = (sizes, n) => {
  const s = [...(sizes ?? [55])].sort((a, b) => a - b);
  return n > 1 ? s[Math.min(s.length - 1, Math.floor((s.length - 1) / 2))] : s[Math.min(s.length - 1, Math.floor(s.length / 2))];
};

function meetingTable(b, W, D, { tx0, ty0, tw, td, perSide, endChairs = 0, oval = false }) {
  const tx1 = tx0 + tw, ty1 = ty0 + td;
  table(b, tx0, ty0, tx1, ty1, 0.74, { pedestal: true });
  // Chairs down both long sides (the long side runs away from the display), none at the display end.
  for (let i = 0; i < perSide; i++) {
    const y = ty0 + 0.45 + ((td - 0.9) * (perSide === 1 ? 0.5 : i / (perSide - 1)));
    chair(b, tx0 - 0.34, y, 0);
    chair(b, tx1 + 0.34, y, Math.PI);
  }
  for (let i = 0; i < endChairs; i++) chair(b, (tx0 + tx1) / 2 + (i - (endChairs - 1) / 2) * 0.7, ty1 + 0.36, -Math.PI / 2);
  b.anchors.table = { x0: tx0, y0: ty0, x1: tx1, y1: ty1, z: 0.74 };
  return perSide * 2 + endChairs;
}

const LAYOUTS = {
  'conference-room-small'(b) {
    const W = 3.66, D = 6.1; // 12 x 20 ft, 22.3 m2; 6 seats, the top of Microsoft's small room
    const chairs = meetingTable(b, W, D, { tx0: 1.23, ty0: 1.6, tw: 1.2, td: 3.0, perSide: 3 });
    door(b, 'left', D - 1.25, D - 0.35); markerBoard(b, 'left', 0.9, 2.7);
    b.anchors.wall = { cx: W / 2, lens: 1.22 };
    return { W, D, area: 22.3, chairs, notes: ['Table 3.0 × 1.2 m (house choice)'] };
  },
  'conference-room-medium'(b) {
    const W = 3.66, D = 7.62; // 12 x 25 ft, 27.9 m2
    const chairs = meetingTable(b, W, D, { tx0: 1.18, ty0: 1.6, tw: 1.3, td: 4.2, perSide: 6 });
    door(b, 'left', D - 1.2, D - 0.3); markerBoard(b, 'left', 0.9, 2.7);
    b.anchors.wall = { cx: W / 2, lens: 1.22 };
    return { W, D, area: 27.9, chairs, notes: ['Table 4.2 × 1.3 m (house choice)'] };
  },
  'conference-room-large'(b) {
    const W = 4.6, D = 9.7; // 15 x 32 ft, 44.6 m2: Microsoft's large room, 16 seats
    const chairs = meetingTable(b, W, D, { tx0: 1.6, ty0: 1.6, tw: 1.4, td: 6.0, perSide: 8 });
    door(b, 'left', D - 1.2, D - 0.3); markerBoard(b, 'left', 1.2, 3.0);
    b.anchors.wall = { cx: W / 2, lens: 1.22 };
    return { W, D, area: 44.6, chairs, notes: ['Table 6.0 × 1.4 m (house choice)'] };
  },
  'hybrid-meeting-room'(b) {
    // Display on the long wall. C-shaped table 189 in wide by 64 in deep, nearest edge 1.45 m
    // (about 4.8 ft) from the display wall; every seat within about 90 degrees of the camera.
    const W = 6.6, D = 5.2, cx = W / 2, cy = -0.05, a = (50 * Math.PI) / 180, r1 = 2.33, r2 = 3.13, n = 10;
    for (let i = 0; i < n; i++) {
      const t0 = -a + (2 * a * i) / n, t1 = -a + (2 * a * (i + 1)) / n;
      const P = (r, t) => [cx + r * Math.sin(t), cy + r * Math.cos(t)];
      b.prism([P(r1, t0), P(r2, t0), P(r2, t1), P(r1, t1)], 0.7, 0.74, 'table', { occ: true, seam: 0.7 });
      if (i % 3 === 1) b.prism(poly(6, 0.07, ...P((r1 + r2) / 2, (t0 + t1) / 2)), 0, 0.7, 'leg');
    }
    const seats = 8;
    for (let i = 0; i < seats; i++) {
      const t = -a * 0.86 + (2 * a * 0.86 * i) / (seats - 1);
      chair(b, cx + (r2 + 0.36) * Math.sin(t), cy + (r2 + 0.36) * Math.cos(t), -Math.PI / 2 - t);
    }
    door(b, 'left', D - 1.2, D - 0.3); markerBoard(b, 'left', 0.5, 2.3);
    b.anchors.wall = { cx, lens: 1.22, gap: 0.12 };
    b.anchors.table = { arc: true, x0: cx - 1.6, y0: 1.9, x1: cx + 1.6, y1: 2.6, z: 0.74, pts: [-0.55, 0.55].map((t) => [cx + 2.73 * Math.sin(t), cy + 2.73 * Math.cos(t)]) };
    return { W, D, area: 34.3, chairs: seats, notes: ['C-shaped table 4.8 × 1.6 m, nearest edge 1.45 m from the display wall'] };
  },
  'huddle-room'(b) {
    const W = 3.05, D = 3.66; // 120 sq ft
    // Trapezoid table cleated to the display wall: narrow end at the wall. Display and table sit a
    // little right of centre, so the screen is on the wall diagonal from the door.
    const cx = W / 2 + 0.15, y0 = 0.08, y1 = 2.2;
    b.prism([[cx - 0.4, y0], [cx + 0.4, y0], [cx + 0.6, y1], [cx - 0.6, y1]], 0.72, 0.76, 'table', { occ: true });
    b.box(cx - 0.3, y0, 0.6, cx + 0.3, y0 + 0.04, 0.72, 'leg', { label: 'Wall cleat' });
    b.box(cx - 0.05, y1 - 0.4, 0, cx + 0.05, y1 - 0.3, 0.72, 'leg');
    for (const t of [0.45, 0.8]) { const y = y0 + (y1 - y0) * t, hw = 0.4 + 0.2 * t; chair(b, cx - hw - 0.34, y, 0); chair(b, cx + hw + 0.34, y, Math.PI); }
    chair(b, cx, y1 + 0.36, -Math.PI / 2);
    door(b, 'left', D - 1.1, D - 0.2);
    b.anchors.wall = { cx, lens: 1.02 };
    b.anchors.table = { x0: cx - 0.45, y0, x1: cx + 0.45, y1, z: 0.76 };
    b.anchors.wallBelow = { x: cx + 0.55, y: 0.02, z: 0.45 };
    return { W, D, area: 11.14, chairs: 5, notes: ['Trapezoid table cleated to the wall, top at 30 in; camera at 40 in'] };
  },
  'huddle-room-sofa'(b) {
    const W = 3.05, D = 3.66;
    // L-shaped sofa facing the display, a large powered table, a guest chair and a side table.
    const sofa = (x0, y0, x1, y1, backSide) => {
      b.box(x0, y0, 0.05, x1, y1, 0.42, 'sofa');
      const t = 0.18;
      const bk = backSide === 'front' ? [x0, y1 - t, x1, y1] : backSide === 'left' ? [x0, y0, x0 + t, y1] : null;
      if (bk) b.box(bk[0], bk[1], 0.42, bk[2], bk[3], 0.85, 'sofa-back');
    };
    sofa(0.05, 1.3, 0.85, D - 0.05, 'left');
    sofa(0.85, D - 0.85, 2.3, D - 0.05, 'front');
    table(b, 1.05, 1.55, 2.25, 2.6, 0.72, { pedestal: true });
    chair(b, 2.65, 2.05, Math.PI);
    b.box(2.45, D - 0.55, 0, 2.95, D - 0.1, 0.5, 'wood', { label: 'Side table' });
    door(b, 'back', W - 0.95, W - 0.08);
    b.anchors.wall = { cx: 1.45, lens: 1.22 };
    b.anchors.table = { x0: 1.05, y0: 1.55, x1: 2.25, y1: 2.6, z: 0.72 };
    return { W, D, area: 11.14, chairs: 5, notes: ['L-shaped sofa, powered table 1.2 × 1.05 m, one guest chair'] };
  },
  'huddle-room-lounge'(b) {
    const W = 3.05, D = 3.66;
    // Lounge laptop chairs in an arc, two ottomans, laptop tables, storage on the left wall.
    const cx = W / 2;
    [[-1.12, 2.45], [-0.38, 2.85], [0.38, 2.85], [1.12, 2.45]].forEach(([dx, y], i) => {
      chair(b, cx + dx, y, -Math.PI / 2 - dx * 0.35, { lounge: true });
      if (i === 0 || i === 3) b.prism(poly(8, 0.16, cx + dx * 0.8, y - 0.6), 0, 0.55, 'wood', { label: 'Laptop table' });
    });
    b.box(cx - 0.3, 1.45, 0, cx + 0.3, 1.9, 0.4, 'sofa', { label: 'Ottoman' });
    b.box(cx + 0.45, 1.5, 0, cx + 0.85, 1.9, 0.4, 'sofa', { label: 'Ottoman' });
    b.box(0, 0.6, 0.85, 0.3, 2.2, 1.25, 'wood', { label: 'Wall-mounted storage, 12 in deep', occ: true });
    door(b, 'back', W - 0.95, W - 0.08);
    b.anchors.wall = { cx: 1.35, lens: 1.505, barAbove: true };
    b.anchors.storage = { x: 0.02, y: 1.4, z: 1.05 };
    return { W, D, area: 11.14, chairs: 4, notes: ['Video bar above the display, camera at 59.25 in; storage 12 in deep'] };
  },
  'huddle-room-small'(b) {
    const W = 2.67, D = 3.0; // about 8 m2
    const cx = W / 2 - 0.1;
    table(b, cx - 0.46, 0.1, cx + 0.46, 0.1 + 1.52, 0.74, { pedestal: true });
    chair(b, cx - 0.8, 1.05, 0); chair(b, cx + 0.8, 1.05, Math.PI);
    door(b, 'left', D - 1.05, D - 0.2);
    b.anchors.wall = { cx, lens: 1.22 };
    b.anchors.table = { x0: cx - 0.46, y0: 0.1, x1: cx + 0.46, y1: 1.62, z: 0.74 };
    return { W, D, area: 8, chairs: 2, notes: ['Peninsula 36 × 60 in cleated to the display wall'] };
  },
  'focus-room'(b) {
    const W = 2.44, D = 2.29; // 60 sq ft
    table(b, 0.3, 0.05, 0.3 + 1.52, 0.05 + 0.76, 0.74, { modesty: true });
    chair(b, 1.06, 1.2, -Math.PI / 2);
    door(b, 'left', D - 0.95, D - 0.1);
    b.anchors.desk = { x0: 0.3, y0: 0.05, x1: 1.82, y1: 0.81, z: 0.74 };
    return { W, D, area: 5.57, chairs: 1, notes: ['Desk 60 × 30 in'] };
  },
  office(b) {
    const W = 3.66, D = 3.05; // 120 sq ft
    // Credenzas on the left wall under the marker board, a lockable credenza on the back wall,
    // the desk in the room facing you, two guest chairs across it, the door on the back wall.
    credenza(b, 0.02, 0.25, 0.48, 1.16, 0.74, 'Open credenza, 36 in');
    credenza(b, 0.02, 1.16, 0.48, 2.07, 0.74, 'Open credenza, 36 in');
    credenza(b, 0.62, 0.02, 1.53, 0.48, 0.74, 'Lockable credenza');
    markerBoard(b, 'left', 0.4, 1.95, 1.05, 2.0);
    table(b, 0.85, 1.35, 0.85 + 1.83, 1.35 + 0.76, 0.74, { modesty: true });
    chair(b, 1.76, 2.5, -Math.PI / 2);
    chair(b, 1.35, 0.95, Math.PI / 2); chair(b, 2.2, 0.95, Math.PI / 2);
    door(b, 'back', W - 1.0, W - 0.12);
    b.box(W - 1.18, 0, 1.7, W - 1.12, 0.08, 1.76, 'dev', { label: 'Coat hook' });
    b.anchors.desk = { x0: 0.85, y0: 1.35, x1: 2.68, y1: 2.11, z: 0.74 };
    b.anchors.wallBelow = { x: 0.02, y: 2.35, z: 0.35, wall: 'left' };
    return { W, D, area: 11.14, chairs: 3, notes: ['Desk 72 × 30 in, two 36 in open credenzas and a lockable one'] };
  },
  makerspace(b) {
    const W = 5.5, D = 4.22; // 23.2 m2
    // Bar-height "guitar pick" table, top 39.5 in, its nearest point 56 in (1.42 m) from the display wall.
    const cx = W / 2, y0 = 1.42;
    const pick = [];
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * 2 * Math.PI;
      const r = 1.0 - 0.28 * Math.cos(t); // narrow at the display end
      pick.push([cx + 0.78 * r * Math.sin(t), y0 + 1.25 - 1.25 * Math.cos(t) * (0.9 + 0.1 * Math.cos(t))]);
    }
    b.box(cx - 0.12, y0 + 0.7, 0, cx + 0.12, y0 + 1.4, 0.96, 'leg');
    b.prism(pick, 0.96, 1.0, 'table', { occ: true });
    [[-0.95, 0.75], [0.95, 0.75], [-1.05, 1.45], [1.05, 1.45], [-0.75, 2.15], [0.75, 2.15], [0, 2.62]].forEach(([dx, dy]) => stool(b, cx + dx, y0 + dy, 0.76));
    door(b, 'left', D - 1.1, D - 0.2); markerBoard(b, 'left', 0.6, 2.4);
    b.anchors.wall = { cx, lens: 1.47, between: true };
    b.anchors.table = { x0: cx - 0.5, y0: y0 + 0.4, x1: cx + 0.5, y1: y0 + 1.9, z: 1.0 };
    return { W, D, area: 23.2, chairs: 7, notes: ['Bar-height table, top 39.5 in, 56 in from the display wall; 7 stools'] };
  },
  'presentation-recording-room'(b) {
    const W = 3.05, D = 2.62; // about 8 m2
    table(b, 0.76, 0.05, 0.76 + 1.52, 0.81, 0.74, { modesty: true });
    chair(b, 1.52, 1.25, -Math.PI / 2);
    plant(b, 0.3, D - 0.3, 0.95, 0.7); plant(b, W - 0.3, D - 0.3, 0.8, 0.7);
    for (const x of [0.88, 2.16]) { b.box(x - 0.03, 0.12, 0.74, x + 0.03, 0.16, 1.2, 'dev', { label: 'Clamp desk light' }); b.box(x - 0.08, 0.14, 1.18, x + 0.08, 0.34, 1.22, 'lamp', { label: 'Clamp desk light' }); }
    door(b, 'left', D - 0.98, D - 0.1);
    b.anchors.desk = { x0: 0.76, y0: 0.05, x1: 2.28, y1: 0.81, z: 0.74 };
    return { W, D, area: 8, chairs: 1, notes: ['Desk 60 × 30 in facing the far wall, two clamp lights, plants in camera view'] };
  },
  'workstation-flex'(b) { return workstations(b); },
  'workstation-assigned'(b) { return workstations(b); },
  'copy-print-room'(b) {
    const W = 2.8, D = 2.5; // 80 sq ft
    b.box(1.5, 0.05, 0.72, 2.75, 0.65, 0.76, 'wood', { label: 'Work counter' });
    b.box(1.55, 0.08, 0, 2.7, 0.62, 0.72, 'wood', { label: 'Paper storage' });
    door(b, 'left', D - 0.98, D - 0.1);
    b.anchors.printer = { x: 0.1, y: 0.05 };
    b.anchors.wallOutlets = { x: 1.25, y: 0.02, z: 0.5 };
    return { W, D, area: 7, chairs: 0, notes: ['Printer footprint 37.1 × 46.4 in plus 20 in for the feeder'] };
  },
  cafeteria(b) {
    const W = 10, D = 9; // size varies by site; 90 m2 chosen
    b.box(0, 1.2, 0, 0.7, 6.8, 0.92, 'counter', { label: 'Servery counter' });
    b.box(0, 1.2, 0.92, 0.7, 6.8, 0.96, 'stone');
    for (const [x, y] of [[2.6, 2.6], [5.0, 2.6], [7.4, 2.6], [2.6, 5.0], [5.0, 5.0], [7.4, 5.0]]) {
      table(b, x - 0.45, y - 0.45, x + 0.45, y + 0.45, 0.74, { pedestal: true });
      chair(b, x - 0.8, y, 0); chair(b, x + 0.8, y, Math.PI); chair(b, x, y - 0.8, Math.PI / 2); chair(b, x, y + 0.8, -Math.PI / 2);
    }
    table(b, 2.2, 7.2, 7.8, 8.1, 0.74, { pedestal: true });
    for (let i = 0; i < 6; i++) { chair(b, 2.7 + i * 1.02, 6.85, Math.PI / 2); chair(b, 2.7 + i * 1.02, 8.45, -Math.PI / 2); }
    plant(b, W - 0.5, 0.5, 1.4);
    door(b, 'left', 7.3, 8.8);
    b.anchors.wall = { cx: 5.0, signage: true };
    b.anchors.wallPlate = { x: 6.6, y: 0.02, z: 0.45 };
    return { W, D, area: 90, chairs: 36, notes: ['Room size varies by site; 10 × 9 m shown', 'Signage display 43 to 85 in, 65 in shown'] };
  },
  pantry(b) { return pantryLike(b, false); },
  'pantry-expanded'(b) { return pantryLike(b, true); },
  'reception-concierge'(b) {
    const W = 6.0, D = 5.0; // size varies; 30 m2 chosen
    // Reception desk for two facing the entrance, lounge seating, signage behind the desk.
    b.box(1.5, 1.4, 0, 4.2, 1.95, 1.08, 'counter', { label: 'Reception desk' });
    b.box(1.5, 1.2, 0.72, 4.2, 1.45, 0.76, 'stone', { label: 'Reception desk' });
    b.anchors.desk = { x0: 1.5, y0: 1.2, x1: 4.2, y1: 1.45, z: 0.76 };
    b.anchors.counterTop = { x0: 1.5, y0: 1.4, x1: 4.2, y1: 1.95, z: 1.08 };
    chair(b, 2.3, 0.75, Math.PI / 2); chair(b, 3.4, 0.75, Math.PI / 2);
    // Lounge.
    b.box(0.1, 3.0, 0.05, 0.9, 4.8, 0.42, 'sofa', { label: 'Lounge sofa' }); b.box(0.1, 3.0, 0.42, 0.28, 4.8, 0.82, 'sofa-back');
    b.box(1.3, 3.4, 0, 2.1, 4.4, 0.4, 'wood', { label: 'Coffee table' });
    chair(b, 2.75, 3.6, Math.PI, { lounge: true }); chair(b, 2.75, 4.35, Math.PI, { lounge: true });
    plant(b, W - 0.45, D - 0.45, 1.5);
    door(b, 'left', 1.4, 2.8);
    b.anchors.wall = { cx: 4.95, signage: true, zc: 1.7 };
    b.anchors.wallPlate = { x: 4.95, y: 0.02, z: 0.45 };
    return { W, D, area: 30, chairs: 4, notes: ['Room size varies by site; 6 × 5 m shown', 'Desk for one or two, lounge seating, signage 65 in shown'] };
  },
  'remote-home'(b) {
    const W = 3.0, D = 2.6;
    table(b, 0.6, 0.05, 2.0, 0.75, 0.74, { modesty: true });
    chair(b, 1.3, 1.2, -Math.PI / 2);
    b.box(2.25, 0.05, 0, 2.95, 0.45, 0.62, 'wood', { label: 'Sideboard' });
    b.box(0.05, 1.7, 0, 0.45, 2.4, 1.8, 'wood', { label: 'Bookcase' });
    door(b, 'left', 0.2, 1.05);
    b.anchors.desk = { x0: 0.6, y0: 0.05, x1: 2.0, y1: 0.75, z: 0.74 };
    b.anchors.home = true;
    b.anchors.sideboard = { x0: 2.25, x1: 2.95, y0: 0.05, y1: 0.45, z: 0.62 };
    return { W, D, area: null, chairs: 1, notes: ['A typical home desk: 1.4 × 0.7 m desk, the broadband router on a sideboard'] };
  },
};

function workstations(b) {
  // One run of four desks, two facing two across a privacy screen, 60 × 30 in each. The next run is
  // 84 in (2.1 m) away, desk edge to desk edge, so the people in between sit back to back. The
  // coloured desk is the workstation this profile describes; the grey ones are its neighbours.
  const dw = 1.52, dd = 0.76, x0 = 0.75, y0 = 0.95, gap = 2.13;
  const ny = y0 + 2 * dd + gap, W = x0 + 2 * dw + 0.3, D = ny + dd + 0.2;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
    const dx = x0 + c * dw, dy = y0 + r * dd, mine = r === 1 && c === 0, o = { ghost: !mine };
    table(b, dx + 0.01, dy, dx + dw - 0.01, dy + dd, 0.74, o);
    chair(b, dx + dw / 2, r === 0 ? dy - 0.42 : dy + dd + 0.42, r === 0 ? Math.PI / 2 : -Math.PI / 2, o);
    if (!mine) monitor(b, dx + dw / 2, r === 0 ? dy + dd - 0.3 : dy + 0.05, 0.74, '27', { ghost: true, flip: r === 0 });
  }
  b.box(x0, y0 + dd - 0.01, 0.74, x0 + 2 * dw, y0 + dd + 0.01, 1.15, 'screen-panel', { label: 'Privacy screen' });
  // The next run: its near row, the people sitting with their backs to ours.
  for (let c = 0; c < 2; c++) {
    const dx = x0 + c * dw;
    table(b, dx + 0.01, ny, dx + dw - 0.01, ny + dd, 0.74, { ghost: true });
    chair(b, dx + dw / 2, ny - 0.42, Math.PI / 2, { ghost: true });
    monitor(b, dx + dw / 2, ny + dd - 0.3, 0.74, '27', { ghost: true, flip: true });
  }
  b.decor.push({ kind: 'dim', a: [x0 - 0.35, y0 + 2 * dd, 0], b: [x0 - 0.35, ny, 0], label: '2.1 m (84 in)', side: 'left' });
  b.anchors.desk = { x0, y0: y0 + dd, x1: x0 + dw, y1: y0 + 2 * dd, z: 0.74, faceBack: true };
  b.anchors.open = true;
  return { W, D, area: 3.34, chairs: 1, open: true, notes: ['Desk 60 × 30 in in runs of 4 to 8, 84 in (2.1 m) back to back; the coloured desk is one workstation'] };
}
function pantryLike(b, big) {
  const W = big ? 10.5 : 8.5, D = big ? 7.96 : 6.55;
  // Millwork along the back wall: base cabinets, worktop, wall cabinets, a tall fridge.
  b.box(0.05, 0, 0, 5.0, 0.62, 0.88, 'counter', { label: 'Millwork' });
  b.box(0.05, 0, 0.88, 5.0, 0.64, 0.92, 'stone');
  b.box(0.05, 0, 1.45, 4.2, 0.35, 2.2, 'counter', { label: 'Wall cabinets' });
  b.box(4.25, 0, 0, 5.0, 0.7, 2.05, 'appliance', { label: 'Fridge' });
  b.box(1.0, 0.1, 0.92, 1.35, 0.45, 1.3, 'appliance', { label: 'Coffee machine' });
  // Bar-height island with at least 60 in (1.52 m) from the millwork.
  const iy = 0.62 + 1.52;
  b.box(1.0, iy, 0, 3.8, iy + 0.9, 1.02, 'counter', { label: 'Island, bar height' });
  b.box(0.95, iy - 0.05, 1.02, 3.85, iy + 0.95, 1.06, 'stone', { occ: true });
  const stools = big ? 5 : 4;
  for (let i = 0; i < stools; i++) stool(b, 1.35 + (i * 2.1) / (stools - 1), iy + 1.3, 0.76);
  b.decor.push({ kind: 'dim', a: [0.7, 0.62, 0], b: [0.7, iy, 0], label: '1.52 m (60 in)' });
  // Tables.
  const tables = big ? [[5.6, 2.6], [5.6, 5.2]] : [[5.9, 2.4], [5.9, 4.8]];
  for (const [x, y] of tables) {
    const w = big ? 0.9 : 0.45;
    table(b, x - w, y - 0.45, x + w, y + 0.45, 0.74, { pedestal: true });
    const n = big ? 2 : 1;
    for (let i = 0; i < n; i++) { const cx = x - (w - 0.45) + i * 0.9; chair(b, cx, y - 0.8, Math.PI / 2); chair(b, cx, y + 0.8, -Math.PI / 2); }
  }
  let chairs = stools + tables.length * (big ? 4 : 2);
  if (big) {
    // Booth seating for four to six along the right, two booths.
    for (const y of [1.2, 4.2]) {
      b.box(8.3, y, 0.05, 10.4, y + 0.55, 0.45, 'sofa', { label: 'Booth' }); b.box(8.3, y, 0.45, 10.4, y + 0.15, 1.1, 'sofa-back');
      table(b, 8.5, y + 0.7, 10.2, y + 1.45, 0.74, { pedestal: true });
      b.box(8.3, y + 1.6, 0.05, 10.4, y + 2.15, 0.45, 'sofa', { label: 'Booth' }); b.box(8.3, y + 2.0, 0.45, 10.4, y + 2.15, 1.1, 'sofa-back');
      chairs += 6;
    }
  }
  plant(b, 0.5, D - 0.6, 1.4);
  door(b, 'left', D - 2.0, D - 0.6);
  const cx = big ? 6.9 : 6.9;
  b.anchors.wall = { cx, signage: true };
  b.anchors.wallPlate = { x: cx + 1.3, y: 0.02, z: 0.45 };
  return { W, D, area: big ? 83.6 : 55.7, chairs, notes: [big ? 'As the pantry, plus booth seating for 4 to 6 and larger tables' : 'Millwork, bar-height island with 60 in clearance', 'Signage display 43 to 85 in, 65 in shown'] };
}

// ---------- Outlets as real plates ----------
// Every outlet in the build option is drawn as the plate, floor box or desk module it really is, at
// its real size, on its surface: the outlets at one place share one plate group, lettered A, B, C.
// Sizes in millimetres, from public dimensions:
//   UK, Ireland, Singapore (BS 1363 sockets on BS 4662 boxes): single gang 86 × 86, double 146 × 86.
//   US and Canada (NEMA 5-15R duplex): 2.75 × 4.5 in (70 × 114) single gang, 1.81 in (46) more per gang.
//   Japan (JIS C 8303): one-gang plate 70 × 120 (Panasonic Cosmo Wide 21), a duplex socket each.
//   Australia (AS/NZS 3112): double power point plate 116 × 76 (Clipsal 2025).
//   Continental Europe and Denmark (DIN 49073 boxes 71 apart): house default 80 × 80 frame per socket.
//   Data: keystone jacks, 14.5 × 16 mm faces. Floor box: 300 × 300 mm lid (3-compartment boxes).
// A room profile has no country, so it gets plain outlets on the European frame.
const PLATE_FMT = {
  bs: { note: 'UK and Ireland plates, 86 and 146 mm wide', perPlate: 2, dataPer: [2, 4] },
  nema: { note: 'US plates, 70 mm wide and 46 mm more a gang', perPlate: 8, dataPer: [4, 8] },
  jis: { note: 'Japanese plates, 70 × 120 mm', perPlate: 2, dataPer: [3, 3] },
  as: { note: 'Australian plates, 116 × 76 mm', perPlate: 2, dataPer: [4, 4] },
  eu: { note: 'European frames, 80 mm a socket, 71 mm apart', perPlate: 4, dataPer: [2, 8] },
  plain: { note: 'plain outlets (a room profile has no country)', perPlate: 4, dataPer: [2, 8] },
};
const FMT_BY_COUNTRY = { IE: 'bs', GB: 'bs', SG: 'bs', MT: 'bs', US: 'nema', CA: 'nema', JP: 'jis', AU: 'as', NZ: 'as' };
const SOCKET_PREF = ['G', 'I', 'K', 'F', 'E', 'B', 'A'];
// The socket on the wall: a plug list of [C, E, F, K] means a Danish K socket (C is a plug only).
export function socketOf(plugs) { return plugs ? SOCKET_PREF.find((t) => plugs.includes(t)) ?? plugs[0] : null; }
export function plateFormat(country, plugs) {
  const t = socketOf(plugs);
  if (!t) return 'plain';
  return FMT_BY_COUNTRY[country] ?? ({ G: 'bs', A: 'nema', B: 'nema', I: 'as' }[t] ?? 'eu');
}
// Where each group of outlets is, and how it is built. Heights not in the data use one house default:
// 450 mm to the centre (inside Approved Document M's 450 to 1200 mm, above ADA's 15 in minimum).
export const HOUSE_OUTLET_Z = 0.45;
const PLATE_LOC = {
  'behind-display': { kind: 'wall', hid: true, where: 'behind the display' },
  'wall-below-table': { kind: 'wall', where: 'on the wall below the table' },
  'below-table': { kind: 'floor', hid: true, where: 'in the floor under the table' },
  'floor-box': { kind: 'floor', where: 'in the floor by the table' },
  'wall-behind-storage': { kind: 'wall', hid: true, where: 'behind the storage' },
  'table-top': { kind: 'desk', where: 'on the desk' },
  wall: { kind: 'wall', where: 'on the wall' },
  tbd: { kind: 'wall', where: 'on the wall, where the project puts it' },
  'room-entrance': { kind: 'wall', hid: true, outside: true, where: 'outside the door, behind the booking panel' },
  ceiling: { kind: 'ceiling', hid: true, where: 'in the ceiling' },
};
const PLATE_ORDER = Object.keys(PLATE_LOC);
const KIND_NAME = { wall: 'Wall plate', floor: 'Floor box', desk: 'Desk module', ceiling: 'Ceiling plate' };

export function parseEnd(ep) {
  const om = /^outlet:([a-z-]+)\/([a-z-]+)#(\d+)$/.exec(ep);
  if (om) return { outlet: true, svc: om[1], loc: om[2], n: +om[3] };
  if (ep === 'laptop' || ep === 'home-router') return { dev: ep, port: null };
  const m = /^([a-z0-9-]+)(?:#(\d+))?\.([a-z0-9-]+)$/.exec(ep);
  return m ? { key: m[1], n: m[2] ? +m[2] : null, port: m[3] } : { dev: ep };
}
// The scene key of a device end: "display#2" when the option has more than one of it.
export function devKey(end, option) {
  if (end.dev) return end.dev;
  const e = option.equipment.find((x) => x.key === end.key);
  const q = typeof e?.quantity === 'number' ? e.quantity : 1;
  return q > 1 ? `${end.key}#${end.n ?? 1}` : end.key;
}

// The physical plates for a list of ports, in the format's sizes. Each item sits at (u, v) mm from the
// plate's bottom left, as seen from the front.
function platesFor(fmt, power, data) {
  const out = [];
  const pw = [...power], dt = [...data];
  const sockets = (ps, w, h, at) => ps.map((p, i) => ({ t: 'socket', p, ...at(i) }));
  if (fmt === 'bs') {
    while (pw.length) { const ps = pw.splice(0, 2); const w = ps.length === 2 ? 146 : 86; out.push({ w, h: 86, items: sockets(ps, w, 86, (i) => ({ u: ps.length === 2 ? 36.5 + i * 73 : 43, v: 38 })) }); }
    while (dt.length) { const ps = dt.splice(0, 4); const w = ps.length > 2 ? 146 : 86; out.push({ w, h: 86, items: ps.map((p, i) => ({ t: 'jack', p, u: w / 2 + (i - (ps.length - 1) / 2) * 25, v: 43 })) }); }
  } else if (fmt === 'nema') {
    while (pw.length) { const ps = pw.splice(0, 8); const g = Math.ceil(ps.length / 2), w = 69.85 + 46 * (g - 1); out.push({ w, h: 114.3, items: sockets(ps, w, 114.3, (i) => ({ u: 34.9 + 46 * Math.floor(i / 2), v: 57.15 + (i % 2 ? -19.4 : 19.4) })) }); }
    while (dt.length) { const ps = dt.splice(0, 8); const g = Math.ceil(ps.length / 4), w = 69.85 + 46 * (g - 1); out.push({ w, h: 114.3, items: ps.map((p, i) => { const k = i % 4; return { t: 'jack', p, u: 34.9 + 46 * Math.floor(i / 4) + (k % 2 ? 10 : -10), v: 57.15 + (k < 2 ? 14 : -14) }; }) }); }
  } else if (fmt === 'jis') {
    while (pw.length) { const ps = pw.splice(0, 2); out.push({ w: 70, h: 120, items: sockets(ps, 70, 120, (i) => ({ u: 35, v: 60 + (i ? -22 : 22) })) }); }
    while (dt.length) { const ps = dt.splice(0, 3); out.push({ w: 70, h: 120, items: ps.map((p, i) => ({ t: 'jack', p, u: 35, v: 60 + (1 - i) * 26 })) }); }
  } else if (fmt === 'as') {
    while (pw.length) { const ps = pw.splice(0, 2); out.push({ w: 116, h: 76, items: sockets(ps, 116, 76, (i) => ({ u: ps.length === 2 ? 30 + i * 52 : 50, v: 38 })) }); }
    while (dt.length) { const ps = dt.splice(0, 4); out.push({ w: 76, h: 116, items: ps.map((p, i) => ({ t: 'jack', p, u: 38 + (i % 2 ? 11 : -11), v: 58 + (i < 2 ? 14 : -14) })) }); }
  } else {
    while (pw.length) { const ps = pw.splice(0, 4); const w = 80 + 71 * (ps.length - 1); out.push({ w, h: 80, items: sockets(ps, w, 80, (i) => ({ u: 40 + 71 * i, v: 40 })) }); }
    while (dt.length) { const ps = dt.splice(0, 8); const g = Math.ceil(ps.length / 2), w = 80 + 71 * (g - 1); out.push({ w, h: 80, items: ps.map((p, i) => ({ t: 'jack', p, u: 40 + 71 * Math.floor(i / 2) + (i % 2 ? 11 : -11), v: 40 })) }); }
  }
  return out;
}

// The plate groups for a build option, from the data alone (the Key uses this too, so letters match).
export function outletPlates(option, { fitted = [], plugs = null, country = null } = {}) {
  const fmt = plateFormat(country, plugs);
  const socket = socketOf(plugs);
  const fit = new Set(fitted);
  const items = new Map(option.equipment.map((e) => [e.key, e]));
  const on = (k) => items.get(k)?.requirement !== 'optional' || fit.has(k);
  // Which device plugs into each outlet port, from the option's wiring.
  const uses = new Map();
  for (const l of option.wiring ?? []) {
    if (l.when && !fit.has(l.when)) continue;
    if (l.unless && fit.has(l.unless)) continue;
    const a = parseEnd(l.from), b = parseEnd(l.to);
    if ([a, b].some((e) => e.key && !on(e.key))) continue;
    const [o, d] = a.outlet ? [a, b] : b.outlet ? [b, a] : [null, null];
    if (!o) continue;
    uses.set(`${o.svc}/${o.loc}#${o.n}`, { dev: devKey(d, option), port: d.port, cable: l.cable, notes: l.notes ?? '' });
  }
  const byLoc = new Map();
  for (const inf of option.infrastructure ?? []) {
    const loc = PLATE_LOC[inf.location] ? inf.location : 'wall';
    if (!byLoc.has(loc)) byLoc.set(loc, { power: [], data: [], 'direct-run': [], entries: [] });
    const g = byLoc.get(loc), list = g[inf.service] ?? (g[inf.service] = []);
    const q = typeof inf.quantity === 'number' ? inf.quantity : inf.quantity === 'tbd' ? 1 : inf.quantity.max;
    for (let i = 0; i < q; i++) {
      const n = list.length + 1, u = uses.get(`${inf.service}/${inf.location}#${n}`);
      list.push({ svc: inf.service, n, loc: inf.location, name: inf.serves?.[i] ?? 'spare', optional: typeof inf.quantity === 'object' && i >= inf.quantity.min, ...(u ?? {}) });
    }
    g.entries.push(inf);
  }
  // Two screens: the ports behind the display split in order, the first half behind screen 1.
  const screens = option.equipment.filter((e) => e.location === 'display-wall' && e.class === 'display' && !/led/.test(e.key)).reduce((n, e) => n + (typeof e.quantity === 'number' ? e.quantity : 1), 0);
  const groups = [];
  for (const loc of PLATE_ORDER) {
    const g = byLoc.get(loc); if (!g) continue;
    const parts = loc === 'behind-display' && screens > 1 ? 2 : 1;
    for (let part = 0; part < parts; part++) {
      const half = (list) => (parts === 1 ? list : part === 0 ? list.slice(0, Math.ceil(list.length / 2)) : list.slice(Math.ceil(list.length / 2)));
      const power = half(g.power), data = half(g.data), runs = half(g['direct-run']);
      if (!power.length && !data.length && !runs.length) continue;
      const L = PLATE_LOC[loc];
      groups.push({ loc, part, ...L, ...(parts > 1 ? { where: `behind display ${part + 1}` } : {}), fmt, socket, power, data, runs, entries: g.entries, name: KIND_NAME[L.kind], plates: L.kind === 'desk' ? [] : platesFor(fmt, power, data) });
    }
  }
  groups.forEach((g, i) => {
    g.id = String.fromCharCode(65 + i);
    g.sk = `plate-${g.id}`;
    g.ports = [...g.power, ...g.data];
    g.devs = [...new Set(g.ports.map((p) => p.dev).filter(Boolean))];
  });
  return { fmt, socket, note: PLATE_FMT[fmt].note, groups };
}

// Front-on shapes on a plate face, in mm around the item's centre (u across, v up). Each is a list of
// [points, class]; `pt` marks the part that lights with the port.
const R_ = (cx, cy, w, h) => [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
const rotR = (cx, cy, w, h, a) => R_(0, 0, w, h).map(([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
const circ = (cx, cy, r, n = 14) => poly(n, r, cx, cy, 0);
export function socketShapes(type, fmt) {
  switch (type) {
    case 'G': return [[R_(0, 0, 40, 34), 'sock'], [R_(0, 8, 4, 8), 'hole'], [R_(-11.1, -6, 7, 4), 'hole'], [R_(11.1, -6, 7, 4), 'hole'], [R_(fmt === 'bs' ? 26 : 0, fmt === 'bs' ? 26 : 22, 9, 12), 'rocker']];
    case 'I': return [[R_(0, 0, 34, 30), 'sock'], [rotR(-6.9, 3, 1.8, 6.4, -0.52), 'hole'], [rotR(6.9, 3, 1.8, 6.4, 0.52), 'hole'], [R_(0, -7, 1.8, 6.4), 'hole'], [R_(fmt === 'as' ? 21 : 0, 0, 7, 11), 'rocker']];
    case 'A': case 'B': {
      const face = fmt === 'jis' ? R_(0, 0, 30, 30) : [[-16.5, -14], [16.5, -14], [16.5, 14], [12, 17.5], [-12, 17.5], [-16.5, 14]];
      return [[face, 'sock'], [R_(-6.35, 3, 2.2, 7.9), 'hole'], [R_(6.35, 3, 2.2, 9.9), 'hole'], ...(type === 'B' ? [[circ(0, -8, 2.4, 10), 'hole']] : [])];
    }
    case 'K': return [[circ(0, 0, 19.5, 18), 'sock'], [circ(-9.5, 3, 2.4, 10), 'hole'], [circ(9.5, 3, 2.4, 10), 'hole'], [[[-4, -7], [4, -7], [3, -10], [0, -11.2], [-3, -10]], 'hole']];
    case 'E': return [[circ(0, 0, 19.5, 18), 'sock'], [circ(-9.5, 0, 2.4, 10), 'hole'], [circ(9.5, 0, 2.4, 10), 'hole'], [circ(0, 11, 2.4, 10), 'pin']];
    case 'F': return [[circ(0, 0, 19.5, 18), 'sock'], [circ(-9.5, 0, 2.4, 10), 'hole'], [circ(9.5, 0, 2.4, 10), 'hole'], [R_(0, 17.5, 6, 3), 'pin'], [R_(0, -17.5, 6, 3), 'pin']];
    default: return [[R_(0, 0, 36, 36), 'sock'], [R_(-6, 0, 2.4, 8), 'hole'], [R_(6, 0, 2.4, 8), 'hole']];
  }
}
// A keystone jack: a 14.5 × 16 mm face in its signal's colour, the RJ45 opening in it.
export const JACK_SHAPES = [[R_(0, 0, 14.5, 16), 'jack'], [[[-5.8, 4], [5.8, 4], [5.8, -2.5], [2.5, -2.5], [2.5, -5], [-2.5, -5], [-2.5, -2.5], [-5.8, -2.5]], 'hole']];
// The signal a data port carries, for its colour (the same tokens as ports and cables everywhere).
export function portSignal(p) {
  if (p.svc === 'power') return 'power';
  if (!p.dev) return 'spare';
  if (/hdbaset/.test(p.port ?? '') || /hdbaset/.test(p.dev)) return 'hdbt';
  if (/poe/.test(p.notes ?? '') || /poe/i.test(p.name)) return 'poe';
  return 'lan';
}
// The shapes on one plate face, each with its port for lighting and titles.
export function plateFace(fmt, socket, plate) {
  const out = [];
  for (const it of plate.items) {
    const shapes = it.t === 'socket' ? socketShapes(socket ?? 'plain', fmt) : JACK_SHAPES;
    for (const [pts, cls] of shapes) out.push({ pts: pts.map(([x, y]) => [it.u + x, it.v + y]), cls, p: it.p });
  }
  return out;
}

// A group front-on, in mm (u across, v up): its plates side by side, a floor box's lid with the
// plates laid in it, or a desk module's face. For the Key, which draws it large enough to read.
export function faceSketch(g) {
  const out = [], add = (pts, cls, p) => out.push({ pts, cls, p });
  const shift = (list, du, dv) => list.map(({ pts, cls, p }) => ({ pts: pts.map(([u, v]) => [u + du, v + dv]), cls, p }));
  if (g.kind === 'desk') {
    const P = 52, J = 24, L = 36 + P * g.power.length + (g.data.length ? 8 + J * g.data.length : 0);
    add(R_(L / 2, 28, L, 56), 'mod');
    g.power.forEach((p, i) => { for (const [pts, cls] of socketShapes(g.socket ?? 'plain', 'desk').filter(([, c]) => c !== 'rocker')) add(pts.map(([u, v]) => [18 + P * (i + 0.5) + u * 0.9, 28 + v * 0.9]), cls, p); });
    g.data.forEach((p, i) => { for (const [pts, cls] of JACK_SHAPES) add(pts.map(([u, v]) => [18 + P * g.power.length + 8 + J * (i + 0.5) + u * 0.9, 28 + v * 0.9]), cls === 'jack' ? `jack-${portSignal(p)}` : cls, p); });
    return { w: L, h: 56, parts: out };
  }
  const plateParts = (pl) => [{ pts: R_(pl.w / 2, pl.h / 2, pl.w, pl.h), cls: 'plate' }, ...plateFace(g.fmt, g.socket, pl).map((f) => ({ pts: f.pts, cls: f.cls === 'jack' ? `jack-${portSignal(f.p)}` : f.cls, p: f.p }))];
  if (g.kind === 'floor') {
    const rows = g.plates.map((p) => ({ p, w: p.w, h: p.h }));
    if (g.runs.length) rows.push({ runs: g.runs, w: g.runs.length * 32, h: 30 });
    const iw = Math.max(...rows.map((r) => r.w)), ih = rows.reduce((s, r) => s + r.h, 0) + 8 * (rows.length - 1);
    const Lw = Math.max(300, iw + 44), Ld = Math.max(300, ih + 44);
    add(R_(Lw / 2, Ld / 2, Lw, Ld), 'lid'); add(R_(Lw / 2, Ld / 2, Lw - 22, Ld - 22), 'fb-well');
    let top = Ld / 2 + ih / 2;
    for (const r of rows) {
      const v0 = top - r.h, u0 = (Lw - r.w) / 2;
      if (r.p) out.push(...shift(plateParts(r.p), u0, v0));
      else r.runs.forEach((q, i) => { add(circ(u0 + 16 + i * 32, v0 + 15, 12.5), 'conduit', q); add(circ(u0 + 16 + i * 32, v0 + 15, 8), 'hole'); });
      top = v0 - 8;
    }
    return { w: Lw, h: Ld, parts: out };
  }
  let u = 0; const h = Math.max(...g.plates.map((p) => p.h));
  for (const pl of g.plates) { out.push(...shift(plateParts(pl), u, (h - pl.h) / 2)); u += pl.w + 10; }
  return { w: Math.max(1, u - 10), h, parts: out };
}

// ---------- Placing the room profile's devices ----------
// Every device is placed at its model's size where the data has one, and records how it is mounted
// (`mounts`), so the cable router (src/lib/cableroute.mjs) can find each port on the right face:
//   front: standing or hanging as normal, its front towards you (+y)
//   rev: turned round, its front towards the display wall (-y)
//   wall-base: a small box behind a display, its base on the wall and its rear panel facing down,
//     so its cables drop straight into the track below it (house rule R7)
//   left / right: on the left wall facing into the room (+x), or on the right wall (-x)
//   out-left / out-back: outside the door, facing the corridor
//   ceiling: in the ceiling, facing down
// Behind the display the order is fixed, bottom to top: the outlet plates, the track, the boxes.
export function buildRoom(typeId, option, items, { plug = null, plugs = null, country = null, fitted = [], models = null } = {}) {
  const b = scene();
  const PL = outletPlates(option, { fitted, plugs: plugs ?? (plug ? [plug] : null), country });
  const L = LAYOUTS[typeId] ?? LAYOUTS['conference-room-small'];
  const room = L(b);
  const { W, D } = room;
  const A = b.anchors;
  const at = (...locs) => items.filter((it) => locs.includes(it.loc));
  const meta = (it) => ({ sk: it.key, it, hid: it.hidden, opt: it.optional });
  const placed = new Map(), mounts = new Map();
  const mark = (it, s) => { if (!placed.has(it.key)) placed.set(it.key, []); placed.get(it.key).push(s); return s; };
  const put = (it, fn, mount = 'front') => { const n0 = b.S.length; fn(meta(it)); for (let i = n0; i < b.S.length; i++) mark(it, b.S[i]); if (b.S.length > n0 && !mounts.has(it.key)) mounts.set(it.key, mount); };
  // The model's size in metres: [width, height, depth] as the datasheet gives them, or null.
  const size = (it) => { const d = models?.[it.e.model]?.dimensions_mm; return d ? [d.width / 1000, d.height / 1000, d.depth / 1000] : null; };
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const T = A.table, K = A.desk, S0 = T ?? K;

  // Outlet plates: the helpers first, because the plates behind a display set the track's height.
  const feet = b.S.filter((s) => s.z0 < 0.05 && s.mat === 'leg');
  const clear = (x, y, w, d) => !feet.some((s) => s.bb.x0 < x + w / 2 + 0.03 && s.bb.x1 > x - w / 2 - 0.03 && s.bb.y0 < y + d / 2 + 0.03 && s.bb.y1 > y - d / 2 - 0.03);
  const spot = (cands, w, d) => cands.find(([x, y]) => clear(x, y, w, d)) ?? cands[0];
  const mm = (v) => v / 1000;
  const pkey = (p) => `${p.svc}/${p.loc}#${p.n}`;
  const faceDecor = (p, face, flip) => plateFace(PL.fmt, PL.socket, p).map((f) => ({ face, poly: f.pts.map(([u, v]) => [mm(flip ? p.w - u : u), mm(v)]), mat: f.cls === 'jack' ? `jack-${portSignal(f.p)}` : f.cls, port: f.p }));
  // Plates side by side 10 mm apart, wrapping to a second row 20 mm lower when the row is too wide.
  const rowLayout = (list, maxW) => {
    const rows = [[]]; let w = 0;
    for (const p of list) { if (rows.at(-1).length && w + 10 + p.w > maxW) { rows.push([]); w = 0; } w += (rows.at(-1).length ? 10 : 0) + p.w; rows.at(-1).push(p); }
    const rw = rows.map((r) => r.reduce((s, p) => s + p.w, 0) + 10 * (r.length - 1));
    const rh = rows.map((r) => Math.max(...r.map((p) => p.h)));
    const gw = Math.max(...rw), gh = rh.reduce((s, h) => s + h, 0) + 20 * (rows.length - 1);
    const pos = []; let top = gh;
    rows.forEach((r, i) => { const v0 = top - rh[i]; let u = (gw - rw[i]) / 2; for (const p of r) { pos.push({ p, u, v: v0 + (rh[i] - p.h) / 2 }); u += p.w + 10; } top = v0 - 20; });
    return { gw, gh, pos };
  };
  // A group on a wall: `a` is where it sits along the wall (its centre, or its start or end edge).
  const onWall = (g, { wall = 'back', a, zc = HOUSE_OUTLET_Z, z0 = null, maxW = 1.0, align = 'centre' }) => {
    const Lw = rowLayout(g.plates, maxW * 1000), gw = mm(Lw.gw), gh = mm(Lw.gh);
    const s0 = align === 'end' ? a - gw : align === 'start' ? a : a - gw / 2, zb = z0 ?? zc - gh / 2;
    for (const { p, u, v } of Lw.pos) {
      const s = s0 + mm(u), z = zb + mm(v), o = { sk: g.sk, pl: g, hid: g.hid, outside: g.outside, decor: faceDecor(p, wall === 'left' ? 'right' : 'front', wall === 'left') };
      if (wall === 'left') b.box(0, s, z, 0.009, s + mm(p.w), z + mm(p.h), 'plate', o);
      else b.box(s, 0, z, s + mm(p.w), 0.009, z + mm(p.h), 'plate', o);
      for (const it of p.items) g.portAt[pkey(it.p)] = wall === 'left' ? [0.014, s + mm(it.u), z + mm(it.v)] : [s + mm(it.u), 0.014, z + mm(it.v)];
    }
    g.surface = wall; g.houseZ = z0 == null && zc === HOUSE_OUTLET_Z;
    g.at = wall === 'left' ? [0.01, s0 + gw / 2, zb + gh / 2] : [s0 + gw / 2, 0.01, zb + gh / 2];
    g.top = wall === 'left' ? [0.005, s0 + gw / 2, zb + gh] : [s0 + gw / 2, 0.005, zb + gh];
    g.size = [Lw.gw, Lw.gh];
    g.span = [s0, s0 + gw];
  };
  // A floor box: a 300 × 300 mm lid (larger if its plates need it) flush with the floor, the plates
  // laid in it in rows, the direct runs as 25 mm conduit openings.
  const inFloor = (g, cands) => {
    const rows = g.plates.map((p) => ({ p, w: p.w, h: p.h }));
    if (g.runs.length) rows.push({ runs: g.runs, w: g.runs.length * 32, h: 30 });
    const iw = Math.max(...rows.map((r) => r.w)), ih = rows.reduce((s, r) => s + r.h, 0) + 8 * (rows.length - 1);
    const Lw = Math.max(300, iw + 44), Ld = Math.max(300, ih + 44);
    const [cx, cy] = spot(cands, mm(Lw), mm(Ld));
    const x0 = cx - mm(Lw) / 2, y0 = cy - mm(Ld) / 2;
    const dec = [{ face: 'top', poly: R_(Lw / 2, Ld / 2, Lw - 22, Ld - 22).map(([u, v]) => [mm(u), mm(v)]), mat: 'fb-well' }];
    let top = Ld / 2 + ih / 2;
    for (const r of rows) {
      const v0 = top - r.h, u0 = (Lw - r.w) / 2;
      const put2 = (pts, mat, port) => dec.push({ face: 'top', poly: pts.map(([u, v]) => [mm(u0 + u), mm(Ld - (v0 + v))]), mat, port });
      if (r.p) {
        put2(R_(r.w / 2, r.h / 2, r.w, r.h), 'plate-flat');
        for (const f of plateFace(PL.fmt, PL.socket, r.p)) put2(f.pts, f.cls === 'jack' ? `jack-${portSignal(f.p)}` : f.cls, f.p);
        for (const it of r.p.items) g.portAt[pkey(it.p)] = [x0 + mm(u0 + it.u), y0 + mm(Ld - (v0 + it.v)), 0.004];
      } else {
        r.runs.forEach((q, i) => { put2(circ(16 + i * 32, 15, 12.5), 'conduit', q); put2(circ(16 + i * 32, 15, 8), 'hole'); g.portAt[pkey(q)] = [x0 + mm(u0 + 16 + i * 32), y0 + mm(Ld - (v0 + 15)), 0.004]; });
      }
      top = v0 - 8;
    }
    b.box(x0, y0, 0, x0 + mm(Lw), y0 + mm(Ld), 0, 'floorbox', { sk: g.sk, pl: g, hid: g.hid, flat: true, decor: dec });
    g.surface = 'floor'; g.at = [cx, cy, 0]; g.top = [cx, cy, 0]; g.size = [Lw, Ld];
  };
  // A desk module on the desk's back edge: sockets and jacks in a row on its front face.
  const onDesk = (g, D0) => {
    const P = 52, J = 24, list = [...g.power.map((p, i) => ({ p, u: 18 + P * (i + 0.5) })), ...g.data.map((p, i) => ({ p, u: 18 + P * g.power.length + 8 + J * (i + 0.5) }))];
    const L = 36 + P * g.power.length + (g.data.length ? 8 + J * g.data.length : 0);
    const x0 = D0.x0 + 0.06, y0 = D0.y0 + 0.02, z = D0.z;
    const dec = [];
    for (const it of list) {
      const shapes = it.p.svc === 'power' ? socketShapes(PL.socket ?? 'plain', 'desk').filter(([, c]) => c !== 'rocker') : JACK_SHAPES;
      for (const [pts, cls] of shapes) dec.push({ face: 'front', poly: pts.map(([u, v]) => [mm(it.u + u * 0.9), mm(28 + v * 0.9)]), mat: cls === 'jack' ? `jack-${portSignal(it.p)}` : cls, port: it.p });
      g.portAt[pkey(it.p)] = [x0 + mm(it.u), y0 + 0.064, z + 0.028];
    }
    b.box(x0, y0, z, x0 + mm(L), y0 + 0.06, z + 0.056, 'deskmod', { sk: g.sk, pl: g, decor: dec });
    g.surface = 'desk'; g.at = [x0 + mm(L) / 2, y0 + 0.03, z + 0.03]; g.top = [x0 + mm(L) / 2, y0 + 0.03, z + 0.056]; g.size = [L, 56];
  };
  const tableCands = (end) => {
    if (!S0) return [[W / 2, 1.2]];
    if (T?.arc) return end ? [[W / 2 + 0.6, 2.68]] : [[W / 2, 2.68], [W / 2 + 0.5, 2.68]];
    const cx = (S0.x0 + S0.x1) / 2, y = end ? S0.y1 - 0.4 : S0.y0 + 0.4;
    return [[cx, y], [cx - 0.3, y], [cx + 0.3, y], [cx, end ? y - 0.3 : y + 0.3], [cx - 0.35, end ? y - 0.3 : y + 0.3]];
  };
  for (const g of PL.groups) g.portAt = {};

  // Display wall: screens side by side, the video bar under them (camera lens at the room's height),
  // or between them (makerspace), or above (the lounge huddle room).
  const wall = at('display-wall');
  const screens = wall.filter((it) => it.e.class === 'display' && !/led/.test(it.e.key));
  const led = wall.filter((it) => it.e.class === 'display' && /led/.test(it.e.key));
  const bars = wall.filter((it) => ['video-bar', 'codec'].includes(it.e.class));
  const cams = wall.filter((it) => it.e.class === 'camera');
  let span = null;
  const screenRects = [];
  if (A.wall) {
    const Wl = A.wall, lens = Wl.lens ?? 1.22;
    const sizes = screens.map((it) => (typeId === 'makerspace' ? (it.e.key === 'display-second' ? 43 : 65) : pickSize(it.e.sizes_in, screens.length)));
    const barModel = bars.find((it) => it.e.class === 'video-bar')?.e.model;
    const barH = barModel ? 0.1 : 0;
    const gap = Wl.between ? 0.25 + (BAR_W[barModel] ?? 0.7) : Wl.gap ?? 0.1;
    const total = sizes.reduce((s, d) => s + screen169(d).w, 0) + gap * Math.max(0, sizes.length - 1);
    let x = Wl.cx - total / 2;
    const zBottom = (d) => {
      if (Wl.signage) return (Wl.zc ?? 1.65) - screen169(d).h / 2;
      if (Wl.between) return lens - screen169(d).h * 0.42;
      if (Wl.barAbove) return lens - 0.08 - screen169(d).h;
      return lens + barH / 2 + 0.06;
    };
    screens.forEach((it, i) => {
      const d = sizes[i], s = screen169(d);
      put(it, (m) => screenRects.push(wallDisplay(b, x + s.w / 2, zBottom(d), d, { ...m, inches: d })));
      x += s.w + gap;
    });
    const top = screens.length ? Math.max(...screens.map((_, i) => zBottom(sizes[i]) + screen169(sizes[i]).h)) : lens + 0.6;
    span = { x0: Wl.cx - total / 2, x1: Wl.cx + total / 2, z0: screens.length ? Math.min(...screens.map((_, i) => zBottom(sizes[i]))) : lens - 0.4, z1: top };
    led.forEach((it) => put(it, (m) => { const s = screen169(136); b.box(Wl.cx - s.w / 2, 0.14, lens + 0.12, Wl.cx + s.w / 2, 0.16, lens + 0.12 + s.h, 'led-wall', { ...m, inches: 136 }); }));
    bars.forEach((it) => put(it, (m) => {
      if (it.e.class === 'codec') smallBox(b, Wl.cx + 0.55, 0.06, lens - 0.36, 0.26, 0.1, 0.05, m, 'dev');
      else videoBar(b, Wl.cx, lens, it.e.model, m);
    }));
    cams.forEach((it, i) => put(it, (m) => {
      const cx = Wl.cx + (i - (cams.length - 1) / 2) * 0.42;
      smallBox(b, cx, 0.12, lens - 0.12, 0.2, 0.2, 0.2, { ...m, decor: [{ face: 'front', poly: poly(12, 0.06, 0.1, 0.1), mat: 'lens' }] }, 'dev');
      b.box(cx - 0.12, 0.02, lens - 0.14, cx + 0.12, 0.24, lens - 0.12, 'wood', { label: 'Camera shelf' });
    }));
  }
  const backs = screenRects.length ? screenRects : span && span.x1 - span.x0 > 0.3 ? [span] : [];
  A.screens = backs;
  // The plates behind the display sit low behind each screen; the track runs just above them, across
  // every screen; the boxes hang on the wall just above the track.
  for (const g of PL.groups.filter((g) => g.loc === 'behind-display')) {
    const sr = backs[g.part] ?? backs[0];
    if (sr) onWall(g, { a: (sr.x0 + sr.x1) / 2, z0: sr.z0 + 0.05, maxW: sr.x1 - sr.x0 - 0.12 });
    else onWall(g, { a: A.wall?.cx ?? W / 2, zc: 1.0 });
  }
  if (backs.length) {
    const plated = PL.groups.filter((g) => g.loc === 'behind-display' && g.at);
    const top = plated.length ? Math.max(...plated.map((g) => g.at[2] + mm(g.size[1]) / 2)) : Math.min(...backs.map((r) => r.z0)) + 0.08;
    // Room for the cables in the track: about one lane for every two cables that use it (the router
    // packs them), at a nominal 36 mm a lane; the router squeezes its lanes to fit if it must.
    const wallKeys = new Set(option.equipment.filter((e) => ['behind-display', 'display-wall'].includes(e.location)).map((e) => e.key));
    const onWallEnd = (ep) => /^outlet:[a-z-]+\/behind-display#/.test(ep) || wallKeys.has(ep.split(/[#.]/)[0]);
    const n = (option.wiring ?? []).filter((l) => onWallEnd(l.from) || onWallEnd(l.to)).length;
    const half = Math.min(0.2, Math.max(0.05, (Math.ceil(n * 0.5) + 1) * 0.036 / 2));
    A.track = { x0: Math.min(...backs.map((r) => r.x0)) + 0.05, x1: Math.max(...backs.map((r) => r.x1)) - 0.05, y: 0.03, z: top + half + 0.03, half };
  }
  const behind = at('behind-display');
  if (backs.length) {
    // Each box goes behind the screen whose plate it plugs into, so its power cable stays short.
    const per = backs.map(() => []);
    behind.forEach((it, i) => {
      const g = PL.groups.find((x) => x.loc === 'behind-display' && x.devs.includes(it.key));
      per[g && backs[g.part] ? g.part : i % backs.length].push(it);
    });
    backs.forEach((r, ri) => {
      // On its base: its width across the wall, its depth up the wall, its height out from the wall.
      const list = per[ri].map((it) => { const s = size(it); return { it, w: cl(s?.[0] ?? 0.18, 0.07, 0.4), h: cl(s?.[2] ?? 0.1, 0.05, 0.2), t: cl(s?.[1] ?? 0.035, 0.02, 0.045) }; });
      if (!list.length) return;
      // The middle of each screen is left clear for the screen's own connection panel.
      const cx = (r.x0 + r.x1) / 2, keep = 0.13, z0 = A.track.z + A.track.half + 0.04;
      const left = list.slice(0, Math.ceil(list.length / 2)), right = list.slice(Math.ceil(list.length / 2));
      const row = (arr, dir) => {
        let edge = cx + dir * keep, z = z0, rowH = 0;
        for (const d of arr) {
          let x0 = dir < 0 ? edge - d.w : edge;
          if ((dir < 0 && x0 < r.x0 + 0.03) || (dir > 0 && x0 + d.w > r.x1 - 0.03)) { z += rowH + 0.05; rowH = 0; edge = cx + dir * keep; x0 = dir < 0 ? edge - d.w : edge; }
          put(d.it, (m) => smallBox(b, x0 + d.w / 2, 0.005 + d.t / 2, z, d.w, d.t, d.h, m, 'dev'), 'wall-base');
          edge = dir < 0 ? x0 - 0.05 : x0 + d.w + 0.05; rowH = Math.max(rowH, d.h);
        }
      };
      row(left, -1); row(right, 1);
    });
  }
  // Table top and below the table.
  const onTop = at('table-top');
  if (K) {
    // Desks: monitors at the back edge facing the person; everything else beside them.
    const mons = onTop.filter((it) => ['monitor', 'desk-video-device'].includes(it.e.class));
    const rest = onTop.filter((it) => !mons.includes(it));
    const yb = K.faceBack ? K.y0 + 0.05 : K.y0 + 0.08;
    const widths = mons.map((it) => (/3426|3425/.test(it.e.model ?? '') ? 0.81 : it.e.class === 'desk-video-device' ? 0.63 : 0.61));
    const tot = widths.reduce((s, w) => s + w, 0) + 0.06 * Math.max(0, mons.length - 1);
    let x = (K.x0 + K.x1) / 2 - tot / 2 - (A.home ? 0.15 : 0);
    mons.forEach((it, i) => put(it, (m) => {
      const kind = /3426|3425/.test(it.e.model ?? '') ? '34' : it.e.class === 'desk-video-device' ? 'desk-pro' : '27';
      monitor(b, x + widths[i] / 2, yb, K.z, kind, { ...m, camera: /web|deb|studio/.test(it.e.model ?? '') });
      x += widths[i] + 0.06;
    }));
    rest.forEach((it, i) => put(it, (m) => smallBox(b, K.x1 - 0.2 - i * 0.25, yb + 0.12, K.z, it.e.class === 'dock' ? 0.22 : 0.08, 0.1, it.e.class === 'dock' ? 0.04 : 0.02, m, 'dev')));
    if (A.home || A.open || typeId === 'office' || typeId === 'focus-room') {
      const lx = A.home ? K.x1 - 0.3 : (K.x0 + K.x1) / 2 + (A.open ? 0.1 : 0.05);
      laptop(b, lx, K.y1 - 0.25, K.z);
      A.laptopAt = [lx - 0.08, K.y1 - 0.36, K.z + 0.008];
    }
  } else if (T) {
    onTop.forEach((it, i) => put(it, (m) => {
      if (it.e.class === 'touch-controller') {
        const tx = T.arc ? (T.x0 + T.x1) / 2 : (T.x0 + T.x1) / 2 + 0.2, ty = T.arc ? 2.75 : T.y0 + 0.35;
        b.prism([[tx - 0.13, ty - 0.08], [tx + 0.13, ty - 0.08], [tx + 0.13, ty + 0.08], [tx - 0.13, ty + 0.08]], T.z, T.z + 0.02, 'dev', m);
        b.box(tx - 0.12, ty + 0.02, T.z + 0.02, tx + 0.12, ty + 0.07, T.z + 0.12, 'dev', { ...m, decor: [{ face: 'top', poly: [[0.01, 0.005], [0.23, 0.005], [0.23, 0.045], [0.01, 0.045]], mat: 'screen-lit' }, { face: 'front', poly: [[0.015, 0.012], [0.225, 0.012], [0.225, 0.088], [0.015, 0.088]], mat: 'screen-lit' }] });
        return;
      }
      if (T.arc && T.pts) { const k = i % T.pts.length; b.prism(poly(10, 0.085, ...T.pts[k]), T.z, T.z + 0.025, 'dev', m); return; }
      const mics = onTop.filter((x) => x.e.class === 'microphone'), j = mics.indexOf(it);
      const y = T.y0 + (T.y1 - T.y0) * (mics.length === 1 ? 0.55 : 0.35 + (0.4 * j) / Math.max(1, mics.length - 1));
      b.prism(poly(10, 0.085, (T.x0 + T.x1) / 2, y), T.z, T.z + 0.025, 'dev', m);
    }));
    // Where a laptop cable comes up through the table: a cable cubby each side of the middle.
    const cx = (T.x0 + T.x1) / 2;
    A.cubbies = T.arc ? [[cx - 0.95, 2.62, T.z], [cx + 0.95, 2.62, T.z]] : [[cx - 0.25, Math.min(T.y1 - 0.3, T.y0 + 0.75), T.z], [cx + 0.25, Math.min(T.y1 - 0.3, T.y0 + 0.75), T.z]];
  }
  // Under the table: boxes hung under the top beside the cable tray, rear panel towards it.
  const under = at('below-table');
  if (S0) {
    under.forEach((it, i) => {
      const n = under.length, s = size(it), w = cl(s?.[0] ?? 0.2, 0.08, 0.3), d = cl(s?.[2] ?? 0.12, 0.05, 0.2), h = cl(s?.[1] ?? 0.05, 0.02, 0.06);
      const cx = (S0.x0 + S0.x1) / 2;
      if (T?.arc) put(it, (m) => smallBox(b, cx + (i - (n - 1) / 2) * 0.5 + 0.35, 2.68 - 0.08 - d / 2, S0.z - 0.05 - h, w, d, h, m, 'dev'), 'rev');
      else put(it, (m) => smallBox(b, cx + (n === 1 ? 0.22 : (i - (n - 1) / 2) * 0.44), S0.y0 + 0.3 + d / 2, S0.z - 0.05 - h, w, d, h, m, 'dev'));
    });
  }
  // Ceiling.
  const ceil = at('ceiling');
  ceil.forEach((it, i) => put(it, (m) => {
    const n = ceil.length, x = W * (0.3 + (0.4 * (n === 1 ? 0.5 : i / (n - 1))));
    const y = (T ? (T.y0 + T.y1) / 2 : D / 2) + (i % 2 ? 0.8 : -0.8);
    b.prism(poly(12, it.e.class === 'loudspeaker' ? 0.14 : 0.2, x, y), WALL_H - 0.03, WALL_H, 'ceil-dev', { ...m, ceiling: true });
  }, 'ceiling'));
  // Door: the booking panel sits outside, beside the door (shown dashed, through the wall).
  at('room-entrance').forEach((it) => {
    const d = A.door;
    if (d.wall === 'left') put(it, (m) => b.box(0, d.a0 - 0.28, 1.1, 0.02, d.a0 - 0.12, 1.3, 'dev', { ...m, hid: true, outside: true }), 'out-left');
    else put(it, (m) => b.box(d.a0 - 0.3, 0, 1.1, d.a0 - 0.14, 0.02, 1.3, 'dev', { ...m, hid: true, outside: true }), 'out-back');
  });
  // Walls, storage and items the guideline leaves to the project. A controller on the wall below the
  // table sits beside its plate, not above it, so its cable drops clear of the plate.
  at('wall-below-table').forEach((it) => put(it, (m) => {
    const p = A.wallBelow ?? { x: W / 2, y: 0.02, z: 0.45 }, x = p.x + 0.34;
    b.box(x - 0.12, 0, 0.62, x + 0.12, 0.05, 0.78, 'dev', { ...m, decor: [{ face: 'front', poly: [[0.02, 0.02], [0.22, 0.02], [0.22, 0.14], [0.02, 0.14]], mat: 'screen-lit' }] });
  }));
  at('wall-behind-storage').forEach((it) => put(it, (m) => {
    const p = A.storage ?? { x: 0.02, y: 1.2, z: 1.0 };
    b.box(0, p.y - 0.12, p.z - 0.05, 0.05, p.y + 0.12, p.z + 0.1, 'dev', { ...m, hid: true });
  }, 'left'));
  at('wall').forEach((it, i) => {
    if (it.e.class === 'camera') put(it, (m) => {
      // A whiteboard camera (Logitech Scribe) goes on the same wall as the marker board, centred over
      // it, on its arm reaching out from the wall and looking back down at the board. Logitech: the
      // bottom of the camera base about 124 mm (5 in) above the top of the board, centred on a board
      // up to 2 x 1.2 m ("How far above the whiteboard should I mount Scribe?", Logitech support; the
      // Scribe datasheet). Sizes from the model: 119 wide, 149 high, 593 mm reach from the wall.
      const bd = A.board ?? { wall: 'left', a0: 1.2, a1: 2.3, zt: 2.0 };
      const s = size(it), w = s?.[0] ?? 0.119, h = s?.[1] ?? 0.149, reach = s?.[2] ?? 0.593;
      const c = (bd.a0 + bd.a1) / 2, z0 = Math.min((bd.zt ?? 2.0) + 0.124, WALL_H - h - 0.05);
      const head = 0.1, armH = 0.045;
      if (bd.wall === 'left') {
        b.box(0, c - w / 2, z0, 0.02, c + w / 2, z0 + h, 'dev', m);
        b.box(0.02, c - w / 2, z0 + h - armH, reach - head, c + w / 2, z0 + h, 'dev', m);
        b.box(reach - head, c - w / 2, z0, reach, c + w / 2, z0 + h, 'dev', m);
      } else {
        b.box(c - w / 2, 0, z0, c + w / 2, 0.02, z0 + h, 'dev', m);
        b.box(c - w / 2, 0.02, z0 + h - armH, c + w / 2, reach - head, z0 + h, 'dev', m);
        b.box(c - w / 2, reach - head, z0, c + w / 2, reach, z0 + h, 'dev', m);
      }
    }, A.board?.wall === 'back' ? 'front' : 'left');
    else put(it, (m) => smallBox(b, 0.5 + i * 0.3, 0.03, 1.2, 0.2, 0.04, 0.2, m, 'dev'));
  });
  const tbd = at('tbd');
  tbd.forEach((it, i) => {
    const c = it.e.class;
    if (c === 'printer') put(it, (m) => {
      const p = A.printer ?? { x: 0.1, y: 0.05 };
      b.box(p.x, p.y, 0, p.x + 0.94, p.y + 1.18, 0.95, 'printer', m);
      b.box(p.x + 0.06, p.y + 0.06, 0.95, p.x + 0.88, p.y + 0.9, 1.2, 'printer-top', { ...m, decor: [{ face: 'front', poly: [[0.5, 0.05], [0.75, 0.05], [0.75, 0.18], [0.5, 0.18]], mat: 'screen-lit' }] });
      b.box(p.x + 0.94, p.y + 0.1, 0.35, p.x + 0.94 + 0.51, p.y + 0.9, 0.9, 'printer', { ...m, label: 'Feeder' });
    });
    else if (c === 'av-extender') put(it, (m) => {
      // A laptop wall plate (HDMI and USB-C in), one gang in the site's plate size.
      const p = A.wallPlate ?? { x: W / 2 + 1.2, y: 0.02, z: 0.45 };
      const [pw, ph] = { bs: [86, 86], nema: [69.85, 114.3], jis: [70, 120], as: [76, 116] }[PL.fmt] ?? [80, 80];
      const face = [[R_(pw / 2, ph / 2 + 12, 15, 5.5), 'av-hdmi'], [R_(pw / 2, ph / 2 + 12 - 1.5, 11, 1.4), 'hole'], [R_(pw / 2, ph / 2 - 12, 9, 3.3), 'av-usb'], [R_(pw / 2, ph / 2 - 12, 6, 1), 'hole']];
      b.box(p.x - pw / 2000, 0, p.z - ph / 2000, p.x + pw / 2000, 0.009, p.z + ph / 2000, 'plate', { ...m, decor: face.map(([pts, cls]) => ({ face: 'front', poly: pts.map(([u, v]) => [u / 1000, v / 1000]), mat: cls })) });
    });
    else if (c === 'network-gateway') put(it, (m) => b.box(2.7, 0.14, 0.62, 2.84, 0.28, 0.665, 'router', m)); // on the sideboard beside the home router
    else if (c === 'security-device') {
      const k = it.e.key;
      if (/visitor/.test(k)) put(it, (m) => { const C = A.counterTop; b.box(C.x1 - 0.5, C.y0 + 0.1, C.z, C.x1 - 0.3, C.y0 + 0.25, C.z + 0.02, 'dev', m); b.box(C.x1 - 0.5, C.y0 + 0.2, C.z + 0.02, C.x1 - 0.3, C.y0 + 0.23, C.z + 0.28, 'dev', { ...m, decor: screenDecor(0.2, 0.26, 'front', 0.012) }); });
      else if (/cctv/.test(k)) put(it, (m) => b.prism(poly(12, 0.09, W - 0.35, D - 0.35), WALL_H - 0.12, WALL_H, 'ceil-dev', { ...m, ceiling: true }), 'ceiling');
      else if (/intercom/.test(k)) put(it, (m) => { const d = A.door; b.box(0, d.a0 - 0.3, 1.25, 0.03, d.a0 - 0.15, 1.45, 'dev', m); }, 'left');
      else if (/panic/.test(k)) put(it, (m) => { const C = A.desk; b.box(C.x0 + 0.7, C.y0 + 0.12, C.z - 0.12, C.x0 + 0.78, C.y0 + 0.2, C.z - 0.06, 'dev', { ...m, hid: true }); });
      else put(it, (m) => smallBox(b, 0.5 + i * 0.3, 0.05, 1.2, 0.15, 0.04, 0.15, m, 'dev'));
    } else put(it, (m) => smallBox(b, W / 2 + 1 + i * 0.3, 0.05, 1.0, 0.18, 0.05, 0.12, m, 'dev'));
  });
  // A home desk: the worker's own broadband router on the sideboard.
  if (A.home) b.box(2.4, 0.12, 0.62, 2.62, 0.3, 0.66, 'router-home', { label: "Home broadband router (worker's own)", sk: 'home-router' });

  // The other outlet groups, each on its own surface, to scale, its ports on the face.
  // A height the guideline gives (height_mm on the outlet, the middle of a range), else the house default.
  const zOf = (g) => { const h = g.entries.find((e) => e.height_mm)?.height_mm; return h ? (typeof h === 'number' ? h : (h.min + h.max) / 2) / 1000 : HOUSE_OUTLET_Z; };
  for (const g of PL.groups) {
    if (g.loc === 'behind-display') continue;
    const d = A.door;
    if (g.loc === 'wall-below-table') {
      if (A.wallBelow) onWall(g, { wall: A.wallBelow.wall ?? 'back', a: A.wallBelow.wall === 'left' ? A.wallBelow.y : A.wallBelow.x, zc: zOf(g) });
      else onWall(g, { a: (S0?.x0 ?? 0.8) - 0.06, align: 'end', zc: zOf(g) });
    } else if (g.loc === 'wall-behind-storage') onWall(g, { wall: 'left', a: A.storage?.y ?? 1.2, zc: A.storage?.z ?? 1.0 });
    else if (g.loc === 'room-entrance' && d) onWall(g, { wall: d.wall, a: d.a0 - (d.wall === 'left' ? 0.2 : 0.22), zc: 1.2 });
    else if (g.loc === 'wall') onWall(g, { a: A.wallOutlets?.x ?? 0.6, zc: zOf(g) });
    else if (g.loc === 'tbd') onWall(g, { a: (A.wallPlate?.x ?? W / 2) + 0.1, align: 'start', zc: zOf(g) });
    else if (g.kind === 'floor') inFloor(g, tableCands(g.loc === 'floor-box'));
    else if (g.kind === 'desk' && S0) onDesk(g, S0);
    else if (g.kind === 'ceiling') {
      const cx = W / 2 + 0.5, cy = S0 ? (S0.y0 + S0.y1) / 2 : D / 2;
      b.box(cx - 0.043, cy - 0.043, WALL_H - 0.009, cx + 0.043, cy + 0.043, WALL_H, 'plate', { sk: g.sk, pl: g, hid: true, ceiling: true });
      for (const p of g.ports) g.portAt[pkey(p)] = [cx, cy, WALL_H - 0.01];
      g.surface = 'ceiling'; g.at = [cx, cy, WALL_H]; g.top = g.at; g.size = [86, 86];
    } else onWall(g, { a: W / 2 });
  }
  // Fixed ends that are not items: the person's laptop on a desk, the home broadband router.
  const ends = {
    ...(A.laptopAt ? { laptop: { p: A.laptopAt, n: [0, -1, 0] } } : {}),
    ...(A.home ? { 'home-router': { p: [2.51, 0.12, 0.635], n: [0, -1, 0] } } : {}),
  };
  return { room, b, placed, mounts, runs: [], plug, ends, plates: PL, backs, anchors: A, H: WALL_H };
}

// ---------- The same room as a small floor plan ----------
// Seen from above: every solid's outline, lowest first, so the table covers what is under it. Used for
// the thumbnails on the room profile and room lists, so a card and its drawing always agree. Each
// plan fills its card; the 1 m bar in the corner keeps the scale honest. viewBox 0 0 120 80.
const PLAN_CLS = { table: 'pl-table', wood: 'pl-table', stone: 'pl-table', counter: 'pl-counter', appliance: 'pl-counter', sofa: 'pl-chair', 'sofa-back': 'pl-chair', chair: 'pl-chair', 'chair-back': 'pl-chair', bezel: 'pl-display', 'led-wall': 'pl-display', board: 'pl-board', leaf: 'pl-leaf', printer: 'pl-counter', 'printer-top': 'pl-counter', 'screen-panel': 'pl-ghost' };
const PLAN_SKIP = new Set(['chair-base', 'leg', 'door', 'handle', 'pot', 'plate', 'lamp', 'floorbox', 'deskmod']);
export function planView(model, { w = 120, h = 80, pad = 5 } = {}) {
  const { room, b } = model;
  const { W, D } = room;
  const k = Math.min((w - 2 * pad) / W, (h - 2 * pad - 5) / D);
  const ox = (w - W * k) / 2, oy = (h - 5 - D * k) / 2;
  const P = ([x, y]) => `${(ox + x * k).toFixed(1)},${(oy + y * k).toFixed(1)}`;
  const out = [`<rect x="${ox.toFixed(1)}" y="${oy.toFixed(1)}" width="${(W * k).toFixed(1)}" height="${(D * k).toFixed(1)}" rx="1" class="${room.open ? 'pl-open' : 'pl-room'}"/>`];
  const solids = b.S.filter((s) => !PLAN_SKIP.has(s.mat) && !s.ceiling && !s.outside && !s.hid).sort((a, c) => a.z1 - c.z1);
  for (const s of solids) {
    const cls = s.ghost ? 'pl-ghost' : PLAN_CLS[s.mat] ?? 'pl-dev';
    out.push(`<polygon points="${s.pts.map(P).join(' ')}" class="${cls}"/>`);
  }
  const d = b.anchors.door;
  if (d && !room.open) {
    const r = (d.a1 - d.a0) * k;
    if (d.wall === 'left') out.push(`<path d="M${ox.toFixed(1)} ${(oy + d.a0 * k).toFixed(1)}v${r.toFixed(1)}" class="pl-gap"/><path d="M${ox.toFixed(1)} ${(oy + d.a1 * k).toFixed(1)}h${r.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 0 0 -${r.toFixed(1)} -${r.toFixed(1)}" class="pl-door"/>`);
    else out.push(`<path d="M${(ox + d.a0 * k).toFixed(1)} ${oy.toFixed(1)}h${r.toFixed(1)}" class="pl-gap"/><path d="M${(ox + d.a0 * k).toFixed(1)} ${oy.toFixed(1)}v${r.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 0 0 ${r.toFixed(1)} -${r.toFixed(1)}" class="pl-door"/>`);
  }
  // A 1 m bar under the plan's right corner, clear of the door.
  const by = oy + D * k + 2.5, bx = ox + W * k - k;
  out.push(`<path d="M${bx.toFixed(1)} ${by.toFixed(1)}h${k.toFixed(1)}M${bx.toFixed(1)} ${(by - 1.2).toFixed(1)}v2.4M${(bx + k).toFixed(1)} ${(by - 1.2).toFixed(1)}v2.4" class="pl-scale"/>`);
  return out.join('');
}

// ---------- Projection and draw order ----------
const F = (v) => Math.round(v * 10) / 10;
// The turn that makes the room biggest in a frame of the given shape, preferring 28 degrees.
function bestView(W, D, aspect) {
  let best = V28, bestScore = 0;
  for (let deg = 26; deg <= 46; deg += 2) {
    const v = makeView(deg);
    const pts = [[0, 0, WALL_H], [W, 0, WALL_H], [0, D, WALL_H], [W, D, 0], [0, D, 0], [W, 0, 0], [0, 0, 0]].map((p) => v.project(...p));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 0.9, h = Math.max(...ys) - Math.min(...ys) + 0.7;
    const score = Math.min(aspect / w, 1 / h) * (1 - Math.abs(deg - 28) * 0.004);
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return best;
}
export function render(model, { width = 1000, pad = 26, aspect = 1.45 } = {}) {
  const { room, b, runs } = model;
  const { W, D } = room;
  const H = WALL_H, t = 0.1;
  const { project, depthOf, sT, cT } = bestView(W, D, aspect);
  // Fixed: floor slab, back wall, left wall. They are always drawn first.
  const fixed = [];
  const faces = (s) => {
    const out = [];
    const n = s.pts.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = s.pts[i], [x2, y2] = s.pts[(i + 1) % n];
      const nx = y2 - y1, ny = -(x2 - x1), len = Math.hypot(nx, ny) || 1;
      const facing = (nx * sT + ny * cT) / len;
      if (facing <= 1e-6) continue;
      if (s.seam && len > s.seam) continue; // the cuts between the pieces of a curved table
      if (s.flat) continue; // flush with the floor: only its top shows
      const shade = Math.round(72 + 16 * (ny / len));
      out.push({ d: [[x1, y1, s.z0], [x2, y2, s.z0], [x2, y2, s.z1], [x1, y1, s.z1]], k: shade, face: Math.abs(ny) >= Math.abs(nx) ? 'front' : 'right', depth: depthOf((x1 + x2) / 2, (y1 + y2) / 2, 0) });
    }
    out.sort((a, c) => a.depth - c.depth);
    out.push({ d: s.pts.map(([x, y]) => [x, y, s.z1]), k: 100, face: 'top' });
    return out;
  };
  const pts2 = (d) => d.map(([x, y, z]) => project(x, y, z));
  // Decorations on a box face, in the face's own u (across) and v (up) metres.
  const decorPts = (s, dc) => {
    const { x0, x1, y0, y1 } = s.bb;
    return dc.poly.map(([u, v]) => (dc.face === 'front' ? [x0 + u, y1 + 0.001, s.z0 + v] : dc.face === 'right' ? [x1 + 0.001, y1 - u, s.z0 + v] : [x0 + u, y0 + v, s.z1 + 0.001]));
  };
  // Order: a topological sort on "must be drawn before", falling back to distance from the viewer.
  const S = b.S;
  const P = S.map((s) => {
    const c = [];
    for (const [x, y] of s.pts) { c.push(project(x, y, s.z0)); c.push(project(x, y, s.z1)); }
    const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
  const E = 1e-4;
  const before = (A, B) => {
    const a = A.bb, c = B.bb;
    // Any axis that separates the two is safe (we look down and in, so a thing wholly lower, farther
    // left or farther back can never hide the other). Height first, so one rule wins consistently.
    if (A.z1 <= B.z0 + E) return true;
    if (B.z1 <= A.z0 + E) return false;
    if (a.x1 <= c.x0 + E) return true;
    if (c.x1 <= a.x0 + E) return false;
    if (a.y1 <= c.y0 + E) return true;
    if (c.y1 <= a.y0 + E) return false;
    return null;
  };
  const n = S.length, adj = Array.from({ length: n }, () => []), indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const p = P[i], q = P[j];
    if (p.x1 <= q.x0 || q.x1 <= p.x0 || p.y1 <= q.y0 || q.y1 <= p.y0) continue;
    const r = before(S[i], S[j]);
    if (r === true) { adj[i].push(j); indeg[j]++; } else if (r === false) { adj[j].push(i); indeg[i]++; }
    else {
      const di = depthOf((S[i].bb.x0 + S[i].bb.x1) / 2, (S[i].bb.y0 + S[i].bb.y1) / 2, (S[i].z0 + S[i].z1) / 2), dj = depthOf((S[j].bb.x0 + S[j].bb.x1) / 2, (S[j].bb.y0 + S[j].bb.y1) / 2, (S[j].z0 + S[j].z1) / 2);
      if (di <= dj) { adj[i].push(j); indeg[j]++; } else { adj[j].push(i); indeg[i]++; }
    }
  }
  const dep = S.map((s) => depthOf((s.bb.x0 + s.bb.x1) / 2, (s.bb.y0 + s.bb.y1) / 2, s.z0));
  const order = [], done = new Array(n).fill(false);
  while (order.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (pick < 0 || dep[i] < dep[pick])) pick = i;
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || dep[i] < dep[pick])) pick = i; // a cycle: break it
    done[pick] = true; order.push(pick);
    for (const j of adj[pick]) indeg[j]--;
  }

  // Everything in world metres, then scaled to a fixed-width viewBox.
  const shapes = [];
  const push = (kind, pts3, o) => shapes.push({ kind, p: pts2(pts3), ...o });
  // Floor slab and walls.
  push('poly', [[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0]], { cls: 'floor', fill: true });
  push('poly', [[0, D, 0], [W, D, 0], [W, D, -0.08], [0, D, -0.08]], { cls: 'slab f' });
  push('poly', [[W, 0, 0], [W, D, 0], [W, D, -0.08], [W, 0, -0.08]], { cls: 'slab r' });
  if (!room.open) {
  push('poly', [[0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H]], { cls: 'wall back' });
  push('poly', [[0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H]], { cls: 'wall left' });
  push('poly', [[-t, -t, H], [W, -t, H], [W, 0, H], [0, 0, H], [0, D, H], [-t, D, H]], { cls: 'wall-cut' });
  push('poly', [[W, -t, 0], [W, 0, 0], [W, 0, H], [W, -t, H]], { cls: 'wall-cut side' });
  push('poly', [[-t, D, 0], [0, D, 0], [0, D, H], [-t, D, H]], { cls: 'wall-cut side' });
  push('line', [[0, 0, 0], [W, 0, 0]], { cls: 'skirt' });
  push('line', [[0, 0, 0], [0, D, 0]], { cls: 'skirt' });
  }
  for (const dc of b.decor) {
    if (dc.kind === 'arc') {
      const steps = 12, pts = [];
      for (let i = 0; i <= steps; i++) { const a = dc.from + ((dc.to - dc.from) * i) / steps; pts.push([dc.c[0] + dc.r * Math.cos(a), dc.c[1] + dc.r * Math.sin(a), 0.002]); }
      push('path', [[dc.c[0], dc.c[1], 0.002], ...pts, [dc.c[0], dc.c[1], 0.002]], { cls: 'swing' });
    }
  }
  const drawn = [];
  for (const i of order) {
    const s = S[i];
    const fs = faces(s).map((f) => ({ pts: pts2(f.d), k: f.k, top: f.face === 'top' }));
    const dec = (s.decor ?? []).map((dc) => ({ pts: pts2(decorPts(s, dc)), mat: dc.mat, port: dc.port }));
    drawn.push({ s, fs, dec });
  }
  // Runs and dimension lines, drawn over the floor.
  const runsOut = runs.map((r) => ({ pts: pts2(r.pts), label: r.label }));
  const dims = [];
  for (const dc of b.decor) if (dc.kind === 'dim') dims.push({ a: project(...dc.a), b: project(...dc.b), label: dc.label, side: dc.side });
  // The room's width along the front edge, its depth along the right edge, and a small metric scale
  // bar in front, drawn along the display wall's direction (1 m, or 2 m for a big room).
  const off = 0.32;
  const widthDim = { a: project(0, D + off, 0), b: project(W, D + off, 0), label: `${W.toFixed(2)} m` };
  const depthDim = { a: project(W + off, 0, 0), b: project(W + off, D, 0), label: `${D.toFixed(2)} m` };
  // The bar stands up like a ribbon, so its squares read clearly whatever the turn of the view.
  const L = W >= 6 ? 2 : 1, sy = D + off + 0.55, th = L === 2 ? 0.16 : 0.1;
  const scaleSegs = [0, 1, 2, 3].map((i) => ({ fill: i % 2 === 0, p: [project((L * i) / 4, sy, 0), project((L * (i + 1)) / 4, sy, 0), project((L * (i + 1)) / 4, sy, -th), project((L * i) / 4, sy, -th)] }));
  const scaleLabels = [[0, '0'], [L, `${L} m`]].map(([x, t2]) => ({ at: project(x, sy, -th), t: t2 }));
  const ceilFrame = [project(W, 0, H), project(W, D, H), project(0, D, H)];

  // Bounds and scale.
  const all = [];
  shapes.forEach((sh) => all.push(...sh.p));
  drawn.forEach((d) => d.fs.forEach((f) => all.push(...f.pts)));
  all.push(widthDim.a, widthDim.b, depthDim.a, depthDim.b, ...ceilFrame, ...scaleSegs.flatMap((s) => s.p), ...scaleLabels.map((l) => l.at));
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const mx = Math.min(...xs), Mx = Math.max(...xs), my = Math.min(...ys), My = Math.max(...ys);
  // Tight to the room: the only margin beyond pad is what the depth label (drawn to the right of the
  // depth line's middle, about 74 units long) needs when it reaches past the drawing.
  const k0 = (width - 2 * pad) / (Mx - mx);
  const labelRight = ((depthDim.a[0] + depthDim.b[0]) / 2 - mx) * k0 + 10 + 74;
  const over = Math.max(0, labelRight - (Mx - mx) * k0);
  const k = (width - 2 * pad - over) / (Mx - mx);
  // Room at the top for the layer chips that float over the drawing.
  const T2 = ([x, y]) => [F((x - mx) * k + pad), F((y - my) * k + pad + 34)];
  const height = Math.ceil((My - my) * k + 2 * pad + 50);
  const pstr = (ps) => ps.map((p) => T2(p).join(',')).join(' ');
  const pathD = (ps) => `M${ps.map((p) => T2(p).join(' ')).join(' L')}`;

  // Every item and plate group as one outline on screen: where its marker goes, its ghost when it is
  // hidden, and what hides it.
  const marks = new Map();
  drawn.forEach((d, idx) => {
    const s = d.s;
    if (!s.sk || (!s.it && !s.pl)) return;
    const m = marks.get(s.sk) ?? { sk: s.sk, it: s.it ?? null, pl: s.pl ?? null, hid: !!(s.hid || s.pl?.hid), outside: !!s.outside, pts: [], idx: 0 };
    for (const f of d.fs) for (const p of f.pts) m.pts.push(T2(p));
    m.idx = Math.max(m.idx, idx);
    marks.set(s.sk, m);
  });
  const markList = [...marks.values()].map((m) => {
    const hull = convexHull(m.pts), xs = hull.map((p) => p[0]), ys = hull.map((p) => p[1]);
    return { sk: m.sk, it: m.it, pl: m.pl, hid: m.hid, outside: m.outside, idx: m.idx, hull, bb: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } };
  });
  // What hides what: a see-through-able solid (display, table top) drawn after a thing and over it.
  const occluders = drawn.map((d, idx) => (d.s.occ ? { idx, h: convexHull(d.fs.flatMap((f) => f.pts.map(T2))) } : null)).filter(Boolean);
  return {
    width, height, k,
    shapes: shapes.map((sh) => ({ ...sh, pts: sh.kind === 'poly' ? pstr(sh.p) : null, d: sh.kind !== 'poly' ? pathD(sh.p) : null })),
    drawn: drawn.map((d) => ({ s: d.s, fs: d.fs.map((f) => ({ pts: pstr(f.pts), k: f.k, top: f.top })), dec: d.dec.map((x) => ({ pts: pstr(x.pts), mat: x.mat, port: x.port })) })),
    runs: runsOut.map((r) => ({ d: pathD(r.pts), label: r.label })),
    dims: dims.map((d) => ({ a: T2(d.a), b: T2(d.b), label: d.label, side: d.side })),
    widthDim: { a: T2(widthDim.a), b: T2(widthDim.b), label: widthDim.label },
    depthDim: { a: T2(depthDim.a), b: T2(depthDim.b), label: depthDim.label },
    scale: { segs: scaleSegs.map((s) => ({ fill: s.fill, pts: pstr(s.p) })), labels: scaleLabels.map((l) => ({ at: T2(l.at), t: l.t })), m: L },
    view: sT,
    ceil: ceilFrame.map(T2),
    marks: markList,
    occluders,
    project: (x, y, z) => T2(project(x, y, z)),
  };
}

// ---------- Screen geometry for markers ----------
function convexHull(points) {
  const p = [...new Map(points.map((q) => [`${q[0]},${q[1]}`, q])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (hi.length >= 2 && cross(hi.at(-2), hi.at(-1), q) <= 0) hi.pop(); hi.push(q); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
function inPoly([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// Markers: a device's number or a plate's letter, one rule for all. A thing you can see gets its
// marker just above it. A thing hidden by something (behind a display, under a table top) gets its
// marker just outside what hides it, on the nearest side, with a short leader line back to it. No two
// markers overlap: a marker that would sits one step further along, or to the side.
export function layoutLabels(R, ts = 1) {
  const r = 13 * ts, gap = 4, minY = 34 + r;
  const placed = [];
  const fits = (x, y) => x >= r + 2 && x <= R.width - r - 2 && y >= minY && y <= R.height - r - 2 && placed.every((p) => Math.hypot(p.x - x, p.y - y) >= 2 * r + gap);
  const occ = R.occluders.filter((o) => o.h.length > 2);
  // A marker should not cover another device or plate either: that costs more than going further.
  const segDist = ([px, py], [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  const covers = (p, h) => h.length > 2 && (inPoly(p, h) || h.some((q, i) => segDist(p, q, h[(i + 1) % h.length]) < r * 0.85));
  const order = [...R.marks].sort((a, b) => (a.hid - b.hid) || (!!a.pl - !!b.pl) || a.bb.y0 - b.bb.y0);
  for (const m of order) {
    const c = [(m.bb.x0 + m.bb.x1) / 2, (m.bb.y0 + m.bb.y1) / 2];
    const others = R.marks.filter((o) => o !== m).map((o) => o.hull);
    const blocked = (p) => occ.some((o) => o.idx > m.idx && inPoly(p, o.h));
    // Where to start looking, each way: just above, below or beside a thing you can see; just outside
    // what hides a hidden one, the shortest way out first.
    let anchor = c, behind = false, ways;
    if (blocked(c)) {
      behind = true;
      ways = [[0, 1], [0, -1], [1, 0], [-1, 0]].map((dv) => {
        let t = 0;
        while (t < 600 && blocked([c[0] + dv[0] * t, c[1] + dv[1] * t])) t += 2;
        return { dv, t, from: c };
      }).filter((w) => w.t < 600).sort((a, b) => a.t - b.t).map((w, i) => ({ ...w, base: i * 1.5 + w.t / (4 * r) }));
    }
    if (!ways?.length) {
      behind = false; anchor = [c[0], m.bb.y0];
      const hw = (m.bb.x1 - m.bb.x0) / 2, hh = (m.bb.y1 - m.bb.y0) / 2;
      ways = [{ dv: [0, -1], t: hh, base: 0 }, { dv: [0, 1], t: hh, base: 1.6 }, { dv: [1, 0], t: hw, base: 2 }, { dv: [-1, 0], t: hw, base: 2.2 }].map((w) => ({ ...w, from: c }));
    }
    const cands = [];
    for (const w of ways) {
      const dir = w.dv, perp = [-dir[1], dir[0]], st = [w.from[0] + dir[0] * (w.t + r + 4), w.from[1] + dir[1] * (w.t + r + 4)];
      for (let k = 0; k < 8; k++) for (const s of [0, 1, -1, 2, -2, 3, -3]) {
        const x = st[0] + dir[0] * k * r * 1.1 + perp[0] * s * (2 * r + gap), y = st[1] + dir[1] * k * r * 1.1 + perp[1] * s * (2 * r + gap);
        cands.push({ x, y, w, cost: w.base + k * 0.9 + Math.abs(s) * 1.3 + (others.some((h) => covers([x, y], h)) ? 4 : 0) });
      }
    }
    cands.sort((a, b) => a.cost - b.cost);
    const at = cands.find((q) => fits(q.x, q.y)) ?? cands[0];
    if (!behind) anchor = [c[0] + at.w.dv[0] * at.w.t, c[1] + at.w.dv[1] * at.w.t];
    const dist = Math.hypot(at.x - anchor[0], at.y - anchor[1]);
    const lead = dist > r + 8 ? { x1: anchor[0], y1: anchor[1], x2: at.x - ((at.x - anchor[0]) / dist) * r, y2: at.y - ((at.y - anchor[1]) / dist) * r } : null;
    placed.push({ x: F(at.x), y: F(at.y), r, sk: m.sk, it: m.it, pl: m.pl, hid: m.hid || m.outside, behind, lead: lead && Object.fromEntries(Object.entries(lead).map(([k2, v]) => [k2, F(v)])) });
  }
  return placed;
}

// Cables are routed along containment in src/lib/cableroute.mjs.
