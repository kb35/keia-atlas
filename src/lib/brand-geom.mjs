// Keia Atlas v11 mark: the shape and the timing, copied from the signed-off v11 source (geom.mjs). Used on the server to
// draw the still mark (src/components/BrandMark.astro) and in the browser by src/lib/brand-mark.mjs, so both agree.
// One slab on a 48 box, in the app's isometric; every face is computed for the angle it is at.

export const KX = Math.sqrt(1.5), KY = Math.SQRT1_2;
export const REST = 45;                                  // the resting turn, in degrees
const D2R = Math.PI / 180;
export const r2 = (v) => (Math.round(v * 100) / 100).toString();

// The v11 shape, its cut for 24 px and under, and v10 (a rounded square) for comparison.
export const SHAPES = {
  v11: { n: 4, a: 12.9, t: 5.8, gap: 1.0, taper: 0.965, cy: 21.4, ring: { d: 4.4, r: 3.9, w: 2.3, beta: 0.8 } },
  small: { n: 4, a: 13.5, t: 7.2, gap: 1.55, taper: 0.97, cy: 20.7, ring: { d: 4.3, r: 4.7, w: 3.3, beta: 0.84 } },
};

export function outline(S, N) {
  const pts = [], e = 2 / S.n;
  for (let i = 0; i < N; i++) {
    const u = (i / N) * 2 * Math.PI, c = Math.cos(u), s = Math.sin(u);
    pts.push([S.a * Math.sign(c) * Math.abs(c) ** e, S.a * Math.sign(s) * Math.abs(s) ** e]);
  }
  return pts;
}
function hull(P) {
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const x = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && x(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && x(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// Resample a closed polygon to M points evenly along its length, starting at index `start` (fixed counts for SMIL).
function even(poly, M, start) {
  const n = poly.length, L = [0];
  for (let i = 1; i <= n; i++) { const a = poly[(start + i - 1) % n], b = poly[(start + i) % n]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const out = []; let j = 0;
  for (let k = 0; k < M; k++) {
    const d = (k / M) * L[n];
    while (L[j + 1] < d) j++;
    const a = poly[(start + j) % n], b = poly[(start + j + 1) % n], w = (d - L[j]) / (L[j + 1] - L[j] || 1);
    out.push([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w]);
  }
  return out;
}
const topmost = (P) => { let k = 0; P.forEach((p, i) => { if (p[1] < P[k][1] - 1e-9) k = i; }); return k; };
const path = (pts) => 'M' + pts.map((p) => r2(p[0]) + ' ' + r2(p[1])).join('L') + 'Z';

// One frame. deg: the slab's turn in plan; ringDeg: the ring's (the same, unless the ring was re-seated while off).
// fixed: a point count for SMIL keyframes (top and side resampled evenly from their topmost point), else exact.
export function frame(S, deg, { ringDeg = deg, fixed = 0, cx = 24, N = 200 } = {}) {
  const c = Math.cos(deg * D2R), s = Math.sin(deg * D2R);
  const P = outline(S, fixed ? 360 : N);
  const proj = (x, y, k, dy) => [cx + KX * k * (x * c - y * s), S.cy + dy + KY * k * (x * s + y * c)];
  let top = P.map(([x, y]) => proj(x, y, 1, 0));
  let sil = hull(top.concat(P.map(([x, y]) => proj(x, y, S.taper, S.t))));
  if (fixed) { top = even(top, fixed, topmost(top)); sil = even(sil, fixed + 16, topmost(sil)); }
  const R = S.ring, rc = Math.cos(ringDeg * D2R), rs = Math.sin(ringDeg * D2R);
  return {
    side: path(sil), top: path(top),
    ring: { cx: cx + KX * R.d * (rc + rs), cy: S.cy + KY * R.d * (rs - rc), rx: KX * R.r, ry: KY * R.r, w: R.w, beta: R.beta },
  };
}

// The ring: an ellipse whose stroke is w at the sides and w·beta at top and bottom (drawn in a group squashed by beta,
// so the path is taller by 1/beta). It is turned a quarter so a draw-on starts at the top and runs clockwise.
export const ringXY = (rg) => `translate(${r2(rg.cx)} ${r2(rg.cy)}) scale(1 ${rg.beta})`;
export const ringAttrs = (rg) => `rx="${r2(rg.ry / rg.beta)}" ry="${r2(rg.rx)}" stroke-width="${rg.w}" transform="rotate(-90)" pathLength="100" fill="none" stroke-linecap="round"`;

/* ---------------- timing ---------------- */
// cubic-bezier, as CSS has it.
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-6) break; if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; if (Math.abs(X(t) - x) > 1e-5) { t = x; while (hi - lo > 1e-6) { if (X(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return Y(t);
  };
}
export const EASE = {
  settle: [0.22, 1, 0.36, 1],        // the product's settle curve
  spinIn: [0.42, 0, 0.14, 1],        // from rest: a short, soft start, then the long settle
  exit: [0.4, 0, 1, 1],              // the product's exit curve: leaving things gather speed
};
export const MOTION = {
  enter: { turn: 135, dur: 1250, fade: 380, from: 0.94, /* --pop-scale */ ringAt: 720, ringDur: 620 },
  leave: { turn: 70, dur: 400, to: 0.94 },         // a beat longer than --dur-exit (240 ms), so the turn reads
  loading: { speed: 180, ramp: 650, ringOut: 300, minTravel: 0.36, stopMin: 800, stopMax: 1350, ringAt: 0.55, ringDur: 620 },
  hover: { turn: 20, in: 600, out: 750 },
};
// Loading's speed-up: velocity follows smootherstep, so there is no jolt at the start or where it reaches speed.
export const rampV = (s) => (s >= 1 ? 1 : s <= 0 ? 0 : s * s * s * (s * (s * 6 - 15) + 10));
export const rampP = (s) => (s <= 0 ? 0 : s >= 1 ? s - 0.5 : s ** 4 * (s * (s - 3) + 2.5)); // ∫ rampV, in units of speed·ramp
// The slow-down: from speed m (in units of Δ/T) to rest at Δ, with no jolt at the end (1 - (1-s)^3 (1 + (3-m)s)).
export const stopP = (s, m) => (s >= 1 ? 1 : 1 - (1 - s) ** 3 * (1 + (3 - m) * s));
export function planStop(v, phi) {
  const L = MOTION.loading;
  const target = Math.ceil((phi + Math.max(v * L.minTravel, 12)) / 90) * 90, delta = target - phi;
  const T = Math.min(L.stopMax, Math.max(L.stopMin, (3 * delta / Math.max(v, 1)) * 1000));
  return { target, delta, T, m: Math.min(3.9, (v * T) / 1000 / delta) };
}
