// Device drawings, traced by hand in the prototype from head-on product photos and official
// front-view drawings (sources in ART_SRC). Every model of a type draws the same named parts in the
// same order, so switching models morphs one drawing into the next. Sizes are to scale within a type.
// Carried over unchanged from the prototype's src/36-art.js; only the wrapper below is new.
import { ART as ART_AV, ART_SRC as SRC_AV } from './art/batch-av.mjs';
import { ART as ART_INFRA, ART_SRC as SRC_INFRA } from './art/batch-infra.mjs';
const ART_SRC = {
  x30: 'Poly Studio X30 data sheet (front photo)', x32: 'Poly Studio X32 data sheet (front photo)', x52: 'Poly Studio X52 data sheet (front photo)',
  x70: 'Poly Studio X70 data sheet (front photo)', x72: 'Poly Studio X72 data sheet (front photo)', polyx: 'Drawn as the X52 (family shape)', meetup2: 'Logitech MeetUp 2 product gallery (front)',
  tc10: 'HP dimensional drawing, TC10 front', tc10s: 'HP dimensional drawing, TC10 front', tc8: 'HP dimensional drawing, TC8 front', ipmic: 'Poly IP Table Microphone data sheet (top view)',
  e70: 'HP dimensional drawing, Studio E70 front', deskpro: 'Cisco Desk Pro product image (front)', m4250: 'Netgear M4250-9G1F-PoE+ product image (front)', m4250l: 'Generic: wider M4250 model, not traced',
  tx: 'Kramer EXT3 user manual, Figure 1 (front panel)', rx: 'Kramer EXT3 user manual, Figure 3 (front panel)', rxb: 'Drawn as the EXT3-POE-XR-R', swt3: 'Kramer SWT3 user manual, Figure 1 (front panel)',
};
const Rk = (k, x, y, w, h, rx, cls) => ({ k, t: 'rect', cls, g: { x, y, width: w, height: h, rx: rx || 0 } });
const Ck = (k, cx, cy, r, cls) => ({ k, t: 'circle', cls, g: { cx, cy, r } });
const Pk = (k, d, cls) => ({ k, t: 'path', cls, d });
const ORDER = {
  bar: ['shadow', 'body', 'top', 'meshL', 'meshR', 'g1', 'g2', 'g3', 'g4', 'camblock', 'pod', 'ring', 'lens1', 'lens2', 'shutter', 'led', 'logo', 'mount'],
  touch: ['shadow', 'body', 'screen', 't1', 't2', 't3', 'sensor', 'ledL', 'ledR', 'led', 'stand'],
  ext: ['shadow', 'body', 'btn', 'usbc', 'usbb', 'l0', 'l1', 'l2', 'l3', 'led', 'l5', 'label', 'model'],
  poe: ['shadow', 'body', 'brand', 'modeltxt', 'led', 'led2', 'reset', 'console', ...Array.from({ length: 24 }, (_, i) => 'p' + i), 'p9x', 'sfp'],
};
ORDER.sched = ORDER.touch;
const CX = 160, CY = 88;
function zeroOf(k, t) { return t === 'circle' ? Ck(k, CX, CY, 0, 'art-none') : Rk(k, CX, CY, 0, 0, 0, 'art-none'); }
function fill(type, parts) {
  const order = ORDER[type]; if (!order) return parts;
  const by = {}; parts.forEach(p => by[p.k] = p);
  const tagOf = k => /^(g\d|lens\d|ring|sensor|reset|l\d)$/.test(k) ? 'circle' : 'rect';
  return order.map(k => by[k] || zeroOf(k, tagOf(k))).concat(parts.filter(p => !order.includes(p.k)));
}
function barParts(m) {
  const s = 0.35, spec = {
    x30: { W: 441.8, H: 62.5, rx: 5 }, x32: { W: 576.8, H: 66.1, rx: 11.5 }, x52: { W: 769.5, H: 115.2, rx: 17 }, polyx: { W: 769.5, H: 115.2, rx: 17 },
    x70: { W: 840.2, H: 135.4, rx: 20 }, x72: { W: 840.2, H: 135.4, rx: 20 }, meetup2: { W: 469.2, H: 73.3, rx: 11 },
  }[m] || { W: 700, H: 110, rx: 16 };
  const W = spec.W * s, Hh = spec.H * s, x0 = CX - W / 2, y0 = CY - Hh / 2, P = [];
  P.push(Rk('shadow', x0 + 5, y0 + 5, W, Hh, spec.rx, 'art-shadow'), Rk('body', x0, y0, W, Hh, spec.rx, 'art-dev'));
  if (m === 'x30') {
    P.push(Rk('top', x0, y0, W, 3.5, 2, 'art-cream'), Rk('pod', CX - 21, CY - 5, 42, 14, 7, 'art-podline'), Ck('lens1', CX, CY + 2, 3, 'art-lens'), Rk('shutter', CX - 5, CY + 6, 10, 2.5, 1, 'art-mount'), Rk('led', CX - 13, y0 + 5, 26, 2, 1, 'art-led'), Rk('logo', x0 + W * 0.82, CY + 3, 12, 3.5, 1.5, 'art-logo'));
  } else if (m === 'x32') {
    P.push(Rk('pod', CX - 16.5, CY - 7.5, 33, 15, 7.5, 'art-gloss'), Ck('lens1', CX, CY, 4.6, 'art-lens'), Rk('led', CX - 11, CY + 2, 3, 3, 1.5, 'art-led'), Rk('logo', x0 + W * 0.93, CY + 3, 5, 4, 2, 'art-logo'));
  } else if (m === 'x52' || m === 'polyx') {
    P.push(Ck('g1', x0 + W * 0.11, CY, 9, 'art-grille'), Ck('g4', x0 + W * 0.89, CY, 9, 'art-grille'), Ck('ring', CX, CY, 13, 'art-ring'), Ck('lens1', CX, CY, 7, 'art-lens'), Rk('led', CX - 20, y0 + 1, 40, 2.5, 1.2, 'art-led'), Rk('logo', x0 + W * 0.82, CY + 7, 6, 5, 2.5, 'art-logo'), Rk('mount', CX - 27, y0 + Hh, 54, 8, 1.5, 'art-mount'));
  } else if (m === 'x70' || m === 'x72') {
    P.push(Ck('g1', x0 + W * 0.05, CY, 5, 'art-grille'), Ck('g2', x0 + W * 0.13, CY, 8, 'art-grille'), Ck('g3', x0 + W * 0.87, CY, 8, 'art-grille'), Ck('g4', x0 + W * 0.95, CY, 5, 'art-grille'),
      Rk('pod', CX - 9.5, y0 + 3.5, 19, Hh - 7, 9.5, m === 'x72' ? 'art-gloss bronze' : 'art-gloss'), Ck('lens1', CX, CY - 9, 3.6, 'art-lens'), Ck('lens2', CX, CY + 8.5, 5.4, 'art-lens'), Rk('led', CX - 7.5, CY - 12.5, 2.6, 2.6, 1.3, 'art-led'), Rk('logo', x0 + W * 0.84, CY + 9, 16, 4, 2, 'art-logo'), Rk('mount', CX - 85, y0 + Hh - 1, 170, 5, 2.5, 'art-vent'));
  } else if (m === 'meetup2') {
    P.push(Rk('meshL', x0 + 6, y0 + 5, W / 2 - 22, Hh - 10, 4, 'art-mesh'), Rk('meshR', CX + 16, y0 + 5, W / 2 - 22, Hh - 10, 4, 'art-mesh'), Rk('camblock', CX - 13, y0 - 1, 26, Hh + 2, 6, 'art-gloss'), Ck('lens1', CX, CY - 1, 6.5, 'art-lens'), Rk('led', CX - 1.5, y0 + 2, 3, 2, 1, 'art-led'), Rk('logo', CX - 3, y0 + Hh - 5, 6, 2, 1, 'art-logo'));
  }
  return fill('bar', P);
}
function touchParts(m) {
  const s = 0.78, light = m === 'tc8', dim = m === 'tc8' ? [204.5, 123.2] : [258.4, 161.8], W = dim[0] * s, Hh = dim[1] * s, x0 = CX - W / 2, y0 = CY - Hh / 2 + 2, inset = m === 'tc8' ? 12 : 8, P = [];
  P.push(Rk('shadow', x0 + 5, y0 + 5, W, Hh, 12, 'art-shadow'), Rk('body', x0, y0, W, Hh, 12, light ? 'art-devlight' : 'art-dev'), Rk('screen', x0 + inset, y0 + inset, W - inset * 2, Hh - inset * 2, 4, 'art-screen'));
  const sx = x0 + inset + 10, sy = y0 + inset + 10, sw = W - inset * 2 - 20, sh = Hh - inset * 2 - 20;
  if (m === 'tc10s') P.push(Rk('t1', sx, sy, sw, sh * 0.42, 4, 'art-free'), Rk('t2', sx, sy + sh * 0.55, sw * 0.6, sh * 0.14, 2, 'art-uiline'), Rk('t3', sx, sy + sh * 0.78, sw * 0.4, sh * 0.14, 2, 'art-uiline'));
  else P.push(Rk('t1', sx, sy, sw * 0.46, sh, 5, 'art-ui'), Rk('t2', sx + sw * 0.54, sy, sw * 0.46, sh * 0.45, 4, 'art-uitile'), Rk('t3', sx + sw * 0.54, sy + sh * 0.55, sw * 0.46, sh * 0.45, 4, 'art-uitile'));
  if (m !== 'tc8') P.push(Ck('sensor', CX, y0 + 4.2, 2, 'art-sensor'), Rk('ledL', x0 - 7, y0 + Hh * 0.22, 3.5, Hh * 0.56, 1.75, 'art-led'), Rk('ledR', x0 + W + 3.5, y0 + Hh * 0.22, 3.5, Hh * 0.56, 1.75, 'art-led'));
  else P.push(Rk('led', x0 + W - 12, y0 + Hh - 7, 4, 3, 1.5, 'art-led'), Rk('stand', CX - 40, y0 + Hh, 80, 5, 2, 'art-devlight'));
  return fill('touch', P);
}
function extParts(m) {
  const s = 1.42, W = 190 * s, Hh = 27 * s, x0 = CX - W / 2, y0 = CY - Hh / 2, P = [], X = f => x0 + W * f, lx = { tx: [0.58, 0.64, 0.69, 0.74, 0.79, 0.9], rx: [0.58, 0.69, 0.73, 0.77, 0.85, 0.9], rxb: [0.58, 0.69, 0.73, 0.77, 0.85, 0.9], swt3: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9] }[m];
  P.push(Rk('shadow', x0 + 5, y0 + 5, W, Hh, 5, 'art-shadow'), Rk('body', x0, y0, W, Hh, 5, 'art-dev'), Rk('label', x0 + 8, y0 + Hh - 9, 58, 3, 1.5, 'art-logo'), Rk('model', x0 + W - 52, y0 + Hh - 9, 44, 3.5, 1.5, 'art-logo'));
  if (m === 'tx') P.push(Rk('btn', X(0.12) - 6, y0 + 9, 12, 12, 2, 'art-btn'), Rk('usbc', X(0.27) - 8, y0 + 13, 16, 5.5, 2.75, 'art-port'));
  if (m === 'rx' || m === 'rxb') P.push(Rk('usbb', X(0.15) - 7, y0 + 9, 14, 13, 2, 'art-port'));
  if (lx && m !== 'swt3') { [0, 1, 2, 3].forEach(i => P.push(Ck('l' + i, X(lx[i]), y0 + 18, 2.6, 'art-ledoff'))); P.push(Rk('led', X(lx[4]) - 2.8, y0 + 15.2, 5.6, 5.6, 2.8, 'art-led'), Ck('l5', X(lx[5]), y0 + 18, 2.6, 'art-ledon')); }
  if (m === 'swt3') {
    P.push(Rk('usbb', X(0.05) - 4, y0 + 8, 8, 14, 1.5, 'art-port'), Rk('usbc', X(0.16) - 8, y0 + 13, 16, 5.5, 2.75, 'art-port'), Rk('btn', X(0.75) - 6, y0 + 9, 12, 12, 2, 'art-btn'),
      Rk('l0x', X(0.27) - 9, y0 + 11, 18, 8, 2, 'art-port'), Rk('l1x', X(0.37) - 7, y0 + 9, 14, 13, 2, 'art-port'), Rk('l2x', X(0.51) - 9, y0 + 11, 18, 8, 2, 'art-port'), Rk('l3x', X(0.61) - 7, y0 + 9, 14, 13, 2, 'art-port'), Rk('btn2', X(0.84) - 6, y0 + 9, 12, 12, 2, 'art-btn'), Rk('led', X(0.92) - 2.6, y0 + 11, 5.2, 5.2, 2.6, 'art-led'), Ck('l5', X(0.92), y0 + 21, 2.6, 'art-ledon'));
  }
  return fill('ext', P);
}
function poeParts(m) {
  const s = 1.33, big = m === 'm4250l', W = (big ? 230 : 210) * s, Hh = (big ? 44 : 40) * s, x0 = CX - W / 2, y0 = CY - Hh / 2, P = [], n = big ? 24 : 8;
  P.push(Rk('shadow', x0 + 5, y0 + 5, W, Hh, 3, 'art-shadow'), Rk('body', x0, y0, W, Hh, 3, 'art-dev'), Rk('brand', x0 + 6, y0 + 6, 38, 6, 1, 'art-logo'), Rk('modeltxt', x0 + W - 58, y0 + 6, 52, 3.5, 1.5, 'art-logo'),
    Rk('led', x0 + 8, y0 + 17, 5, 2.4, 1, 'art-led'), Rk('led2', x0 + 8, y0 + 22, 5, 2.4, 1, 'art-ledg'), Ck('reset', x0 + 11, y0 + Hh - 13, 2.2, 'art-port'), Rk('console', x0 + 20, y0 + Hh - 17, 11, 6, 1.5, 'art-console'));
  const pw = big ? 11 : 19.5, ph = big ? 9 : 15, px0 = x0 + W * 0.16;
  for (let i = 0; i < n; i++) { const row = big ? (i < 12 ? 0 : 1) : 0, col = big ? i % 12 : i; P.push(Rk('p' + i, px0 + col * (pw + 1.5) + (col >= (big ? 6 : 4) ? 3 : 0), y0 + (big ? 16 + row * 12 : Hh * 0.42), pw, ph, 1.5, 'art-port')); }
  if (!big) P.push(Rk('p9x', x0 + W * 0.79, y0 + Hh * 0.42, 19.5, 15, 1.5, 'art-port'), Rk('sfp', x0 + W * 0.875, y0 + Hh * 0.44, 20, 12, 1, 'art-sfp'));
  else P.push(Rk('sfp', x0 + W * 0.84, y0 + 18, 26, 16, 1, 'art-sfp'));
  return fill('poe', P);
}
function micParts() {
  // traced from the top-view photo: two broad upper arms, one lower arm, mute triangle in the hub
  const k = 1.18, pts = [[129.3, 20], [100, 52.5], [138.1, 79.2], [138.1, 125], [182.7, 125], [182.7, 79.2], [220, 60.1], [193, 20], [159.8, 41]].map(([x, y]) => [160 + (x - 160) * k, 74 + (y - 74) * k]);
  const d = dx => 'M' + pts.map(([x, y]) => `${(x + dx).toFixed(1)} ${(y + dx).toFixed(1)}`).join(' L') + ' Z';
  const tri = [[159.8, 48.6], [176.1, 76.5], [143.4, 76.5]].map(([x, y]) => [160 + (x - 160) * k, 74 + (y - 74) * k]);
  return [Pk('shadow', d(5), 'art-shadow'), Pk('body', d(0), 'art-dev'), Pk('led', 'M' + tri.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + ' Z', 'art-ledline'), Rk('logo', 152, 128, 16, 3.5, 1.7, 'art-logo')];
}
function camParts() {
  return [Rk('shadow', 42, 97, 236, 32, 14, 'art-shadow'), Rk('body', 37, 92, 236, 32, 14, 'art-devlight'), Rk('pod', 131, 36, 58, 88, 29, 'art-devlight'), Rk('glass', 138, 43, 44, 74, 22, 'art-gloss'), Rk('lens1', 153, 55, 14, 11, 3, 'art-lens'), Ck('lens2', 160, 94, 10, 'art-lens'), Rk('led', 214, 120, 44, 2.5, 1.2, 'art-led'), Rk('logo', 170, 106, 6, 5, 2.5, 'art-logo')];
}
function deskParts() {
  const s = 0.3, W = 630 * s, Hh = 510 * s, x0 = CX - W / 2, y0 = CY - Hh / 2 + 2;
  return [Rk('shadow', x0 + 5, y0 + 5, W, Hh, 8, 'art-shadow'), Rk('body', x0, y0, W, Hh, 8, 'art-dev'), Rk('screen', x0 + 6, y0 + 6, W - 12, Hh * 0.74, 3, 'art-ui'), Ck('cam', CX, y0 + 3.2, 1.8, 'art-sensor'), Rk('t1', CX - 30, y0 + Hh * 0.3, 16, 16, 8, 'art-uitile'), Rk('t2', CX - 8, y0 + Hh * 0.3, 16, 16, 8, 'art-uitile'), Rk('t3', CX + 14, y0 + Hh * 0.3, 16, 16, 8, 'art-uitile'), Rk('fabric', x0 + 2, y0 + Hh * 0.8, W - 4, Hh * 0.18, 4, 'art-fabric'), Rk('logo', CX - 6, y0 + Hh * 0.88, 12, 3, 1.5, 'art-logo'), Rk('led', x0 + W - 22, y0 + Hh * 0.76, 12, 3, 1.5, 'art-led'), Rk('foot1', x0 + 12, y0 + Hh, 18, 4, 1, 'art-dev'), Rk('foot2', x0 + W - 30, y0 + Hh, 18, 4, 1, 'art-dev')];
}

// Keia model id -> the prototype's drawing id and drawing type.
const MAP = {
  'poly-studio-x32': ['x32', 'bar'], 'poly-studio-x52': ['x52', 'bar'], 'poly-studio-x72': ['x72', 'bar'], 'logitech-meetup-2': ['meetup2', 'bar'],
  'poly-tc10': ['tc10', 'touch'], 'logitech-tap-scheduler': ['tc10s', 'touch'],
  'kramer-ext3-c-xr-t': ['tx', 'ext'], 'kramer-ext3-poe-xr-r': ['rx', 'ext'], 'kramer-swt3-31-hu': ['swt3', 'ext'],
  'netgear-m4250-gsm4210pd': ['m4250', 'poe'], 'poly-tabletop-microphone': ['ipmic', 'mic'], 'poly-e70': ['e70', 'cam'], 'cisco-desk-pro': ['deskpro', 'desk'],
};
// The prototype drew the Tap Scheduler with the TC10's shape in scheduler mode; say so rather than claim a trace.
const SRC_NOTE = { 'logitech-tap-scheduler': 'Drawn with the TC10 shape in scheduler mode, not traced from a Logitech photo' };
// batches: each batch file under src/lib/art/ exports ART (model id -> { id, type, parts() }) and ART_SRC (drawing id -> source).
const BATCH = {}, BATCH_SRC = {};
Object.assign(BATCH, ART_AV); Object.assign(BATCH_SRC, SRC_AV);
Object.assign(BATCH, ART_INFRA); Object.assign(BATCH_SRC, SRC_INFRA);
export function artParts(model) {
  if (BATCH[model]) return BATCH[model].parts();
  const m = MAP[model]; if (!m) return null;
  const [id, type] = m;
  if (type === 'bar') return barParts(id);
  if (type === 'touch') return touchParts(id);
  if (type === 'ext') return extParts(id);
  if (type === 'poe') return poeParts(id);
  if (type === 'mic') return micParts();
  if (type === 'cam') return camParts();
  if (type === 'desk') return deskParts();
  return null;
}
export const artSource = (model) => (BATCH[model] ? BATCH_SRC[BATCH[model].id] ?? null : null) ?? SRC_NOTE[model] ?? (MAP[model] ? ART_SRC[MAP[model][0]] : null);
// The drawing type for a model (bar, touch, ext, poe, mic, cam, desk), or null.
export const artType = (model) => BATCH[model]?.type ?? MAP[model]?.[1] ?? null;
