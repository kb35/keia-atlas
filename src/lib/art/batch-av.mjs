// Device drawings for the AV and displays batch: desktop monitors, signage displays, the E60 camera,
// the G62 codec, the BrightSign player and the INOGENI U-CAM. Front-on, on the 320 x 180 canvas
// centred on (160, 88), colour only through the art-* classes (see src/styles/base.css).
//
// Scale is fixed within a type and differs between types, because a desktop monitor and an 85 inch
// display cannot share one canvas scale: monitors 0.35 px/mm, signage displays 0.15, cameras 0.9,
// codec and player 0.9, adapter 1.4. Each type lists its part names in ORDER; a part a model doesn't
// have is filled in as a zero-size part so one drawing can morph into the next.
//
// Shape (same idea as art.mjs): ART maps a Keia model id to { id, type, parts() }, and ART_SRC maps
// the drawing id to the source it was traced from. art.mjs merges both at its "// batches" spot.
const CX = 160, CY = 88;
const Rk = (k, x, y, w, h, rx, cls) => ({ k, t: 'rect', cls, g: { x, y, width: w, height: h, rx: rx || 0 } });
const Ck = (k, cx, cy, r, cls) => ({ k, t: 'circle', cls, g: { cx, cy, r } });

const ORDER = {
  mon: ['shadow', 'body', 'screen', 'sensor', 'hump', 'mount', 'stand'],
  disp: ['shadow', 'body', 'screen', 'rcv'],
  cam: ['shadow', 'body', 'foot1', 'foot2', 'pod', 'yoke', 'ring', 'lens1', 'glass', 'lens2', 'led', 'led2'],
  codec: ['shadow', 'body', 'led', 'logo'],
  sig: ['shadow', 'body', 'scL', 'scR', 'ant1', 'ant2', 'audio', 'ir', 'serial', 'gpio', 'l0', 'l1', 'l2', 'l3', 'pwr'],
  adapter: ['shadow', 'body', 'scL', 'scR', 'usba1', 'usba2', 'lan', 'usbb'],
};
const CIRCLES = new Set(['sensor', 'ring', 'lens2', 'scL', 'scR', 'ant1', 'ant2', 'audio', 'ir', 'serial', 'l0', 'l1', 'l2', 'l3']);
const zeroOf = (k) => (CIRCLES.has(k) ? Ck(k, CX, CY, 0, 'art-none') : Rk(k, CX, CY, 0, 0, 0, 'art-none'));
function fill(type, parts) {
  const by = {}; parts.forEach((p) => { by[p.k] = p; });
  return ORDER[type].map((k) => by[k] || zeroOf(k));
}

// ---- Desktop monitors (0.35 px/mm) ----------------------------------------------------------------
// Front view: body (outer bezel), lit screen, optional pop-up webcam hump on top, neck and base.
// All sizes in mm; bodyH is the body without the webcam hump; gap is body bottom to table.
const MON = {
  u2724d: { W: 612.24, bodyH: 352.51, gap: 33.07, side: 7.75, top: 7.75, scrW: 596.74, scrH: 335.66, neckW: 45, baseW: 272.8, baseH: 12.5 },
  u2724de: { W: 612.24, bodyH: 352.51, gap: 33.07, side: 7.75, top: 7.75, scrW: 596.74, scrH: 335.66, neckW: 45, baseW: 272.8, baseH: 12.5 },
  u3425we: { W: 813.46, bodyH: 359.15, gap: 33.68, side: 6.83, top: 7, scrW: 799.8, scrH: 334.8, neckW: 45, baseW: 363, baseH: 12.5 },
  p2726deb: { W: 612.34, bodyH: 362.58, gap: 25.2, side: 7.8, top: 7.8, scrW: 596.74, scrH: 335.66, hump: { w: 64, prot: 30 }, neckW: 40, baseW: 272.8, baseH: 12 },
  p3426web: { W: 815.57, bodyH: 359.78, gap: 30.47, side: 7.9, top: 8, scrW: 799.8, scrH: 334.8, hump: { w: 62, prot: 33 }, neckW: 40, baseW: 343.2, baseH: 12 },
  // Tilt-adjustable stand variant: a flat aluminium slab under the body, 116 mm to the table.
  asd2026: { W: 623, bodyH: 362, gap: 116, side: 13.2, top: 13.2, scrW: 596.6, scrH: 335.6, cam: true, neckW: 150, baseW: 150, baseH: 6.5 },
};
function monParts(id) {
  const m = MON[id], s = 0.35, prot = m.hump ? m.hump.prot : 0;
  const W = m.W * s, Hb = m.bodyH * s, totalH = (prot + m.bodyH + m.gap) * s;
  const x0 = CX - W / 2, yTop = CY - totalH / 2, y0 = yTop + prot * s, rx = id === 'asd2026' ? 1.5 : 1;
  const P = [Rk('shadow', x0 + 5, y0 + 5, W, Hb, rx, 'art-shadow'), Rk('body', x0, y0, W, Hb, rx, 'art-dev')];
  P.push(Rk('screen', x0 + m.side * s, y0 + m.top * s, m.scrW * s, m.scrH * s, 0.5, 'art-screen'));
  if (m.cam) P.push(Ck('sensor', CX, y0 + (m.top / 2) * s, 1, 'art-sensor'));
  if (m.hump) P.push(Rk('hump', CX - (m.hump.w * s) / 2, yTop, m.hump.w * s, prot * s, 2, 'art-dev'));
  const yb = y0 + Hb, neckH = (m.gap - m.baseH) * s;
  P.push(Rk('mount', CX - (m.neckW * s) / 2, yb, m.neckW * s, neckH, 0, 'art-mount'));
  P.push(Rk('stand', CX - (m.baseW * s) / 2, yb + neckH, m.baseW * s, m.baseH * s, 1.5, 'art-mount'));
  return fill('mon', P);
}

// ---- Signage displays (0.15 px/mm), heads without stands ------------------------------------------
const DISP = {
  lg55: { W: 1240.1, H: 711.9, bez: 11.4 },
  lg75: { W: 1679.5, H: 958.7, bez: 12.9 },
  sam65: { W: 1456.8, H: 831.9, bez: 11.5, rcv: true },
  sam85: { W: 1904.3, H: 1085.3, bez: 13.9, rcv: true },
};
function dispParts(id) {
  const d = DISP[id], s = 0.15, W = d.W * s, H = d.H * s, x0 = CX - W / 2, y0 = CY - H / 2, b = d.bez * s;
  const P = [Rk('shadow', x0 + 5, y0 + 5, W, H, 1, 'art-shadow'), Rk('body', x0, y0, W, H, 1, 'art-dev'), Rk('screen', x0 + b, y0 + b, W - 2 * b, H - 2 * b, 0.5, 'art-screen')];
  // Samsung's setup guide draws the remote sensor block in the bottom right corner of the front.
  if (d.rcv) { const w = 0.119 * W, h = 0.05 * H; P.push(Rk('rcv', x0 + W - 0.015 * W - w, y0 + H - h, w, h, 1, 'art-podline')); }
  return fill('disp', P);
}

// ---- Poly Studio E60 PTZ camera (0.9 px/mm), from HP's product-dimensions front elevation ----------
function e60Parts() {
  const s = 0.9, W = 200 * s, x0 = CX - W / 2, y0 = CY - (166 * s) / 2;
  const X = (mm) => x0 + mm * s, Y = (mm) => y0 + mm * s;
  return fill('cam', [
    Rk('shadow', X(0) + 5, Y(129.6) + 5, 200 * s, 28.6 * s, 3, 'art-shadow'), Rk('body', X(0), Y(129.6), 200 * s, 28.6 * s, 3, 'art-dev'),
    Rk('foot1', X(7.4), Y(158.2), 14.8 * s, 7.7 * s, 1.5, 'art-grille'), Rk('foot2', X(178.3), Y(158.2), 16.9 * s, 7.7 * s, 1.5, 'art-grille'),
    Rk('pod', X(46), Y(109.5), 108 * s, 20.1 * s, 7, 'art-dev'), Rk('yoke', X(69), Y(70), 62 * s, 41 * s, 9, 'art-dev'),
    Ck('ring', X(100), Y(35.5), 35.5 * s, 'art-ring'), Rk('lens1', X(83), Y(18.5), 34 * s, 34 * s, 17 * s, 'art-lens'),
    Rk('glass', X(86.8), Y(131.6), 26.5 * s, 26.5 * s, 2, 'art-gloss'), Ck('lens2', X(99.5), Y(144.4), 8 * s, 'art-lens'),
    Rk('led', X(19.6), Y(143.3), 3.2 * s, 3.2 * s, 1, 'art-led'), Rk('led2', X(31.7), Y(143.3), 3.2 * s, 3.2 * s, 1, 'art-led'),
  ]);
}

// ---- Poly Studio G62 codec (0.9 px/mm): a rounded slab, LED at the front left ------------------------
function g62Parts() {
  const s = 0.9, W = 247.7 * s, H = 34.9 * s, x0 = CX - W / 2, y0 = CY - H / 2;
  return fill('codec', [
    Rk('shadow', x0 + 5, y0 + 5, W, H, 4.5, 'art-shadow'), Rk('body', x0, y0, W, H, 4.5, 'art-dev'),
    Rk('led', x0 + 21 * s, y0 + 6 * s, 9 * s, 2.3 * s, 1, 'art-led'), Rk('logo', x0 + 19 * s, y0 + 19 * s, 25 * s, 5 * s, 2, 'art-logo'),
  ]);
}

// ---- BrightSign XT1145 (0.9 px/mm): the connector edge, positions read off the product render ------
function xt1145Parts() {
  const s = 0.9, W = 238.62 * s, H = 19.19 * s, x0 = CX - W / 2, y0 = CY - H / 2, X = (mm) => x0 + mm * s, cy = y0 + H / 2;
  return fill('sig', [
    Rk('shadow', x0 + 5, y0 + 5, W, H, 3, 'art-shadow'), Rk('body', x0, y0, W, H, 3, 'art-dev'),
    Ck('scL', X(24), cy, 2.9 * s, 'art-mount'), Ck('scR', X(213.3), cy, 2.9 * s, 'art-mount'),
    Ck('ant1', X(33.1), cy, 5.1 * s, 'art-console'), Ck('ant2', X(202.6), cy, 5.1 * s, 'art-console'),
    Ck('audio', X(50.3), cy, 2.9 * s, 'art-port'), Ck('ir', X(67.4), cy, 2.9 * s, 'art-lens'), Ck('serial', X(84.1), cy, 2.9 * s, 'art-port'),
    Rk('gpio', X(95.2), cy - 2.8 * s, 43.4 * s, 5.6 * s, 1, 'art-port'),
    Ck('l0', X(151.5), cy, 1 * s, 'art-ledoff'), Ck('l1', X(156.7), cy, 1 * s, 'art-ledoff'), Ck('l2', X(161.8), cy, 1 * s, 'art-ledoff'), Ck('l3', X(167), cy, 1 * s, 'art-ledoff'),
    Rk('pwr', X(179.3), cy - 3.4 * s, 9.8 * s, 6.8 * s, 1.5, 'art-port'),
  ]);
}

// ---- INOGENI U-CAM (1.4 px/mm): the input end plate, a pill 70 x 23 mm ------------------------------
function ucamParts() {
  const s = 1.4, W = 70 * s, H = 23 * s, x0 = CX - W / 2, y0 = CY - H / 2, X = (mm) => x0 + mm * s, cy = y0 + H / 2 - 1.7 * s;
  return fill('adapter', [
    Rk('shadow', x0 + 5, y0 + 5, W, H, H / 2, 'art-shadow'), Rk('body', x0, y0, W, H, H / 2, 'art-dev'),
    Ck('scL', X(4.5), y0 + H / 2, 2 * s, 'art-mount'), Ck('scR', X(65.5), y0 + H / 2, 2 * s, 'art-mount'),
    Rk('usba1', X(8.5), cy - 4 * s, 5.5 * s, 8 * s, 1, 'art-port'), Rk('usba2', X(19), cy - 4 * s, 5.5 * s, 8 * s, 1, 'art-port'),
    Rk('lan', X(28.7), cy - 6.7 * s, 16 * s, 13.4 * s, 1.5, 'art-port'), Rk('usbb', X(48.3), cy - 5.8 * s, 12.3 * s, 11.6 * s, 1.5, 'art-port'),
  ]);
}

export const ART = {
  'dell-u2724d': { id: 'u2724d', type: 'mon', parts: () => monParts('u2724d') },
  'dell-u2724de': { id: 'u2724de', type: 'mon', parts: () => monParts('u2724de') },
  'dell-u3425we': { id: 'u3425we', type: 'mon', parts: () => monParts('u3425we') },
  'dell-p2726deb': { id: 'p2726deb', type: 'mon', parts: () => monParts('p2726deb') },
  'dell-p3426web': { id: 'p3426web', type: 'mon', parts: () => monParts('p3426web') },
  'apple-studio-display-2026': { id: 'asd2026', type: 'mon', parts: () => monParts('asd2026') },
  'lg-55uh5q-e': { id: 'lg55', type: 'disp', parts: () => dispParts('lg55') },
  'lg-75uh5q-e': { id: 'lg75', type: 'disp', parts: () => dispParts('lg75') },
  'samsung-qm65c': { id: 'sam65', type: 'disp', parts: () => dispParts('sam65') },
  'samsung-qm85c': { id: 'sam85', type: 'disp', parts: () => dispParts('sam85') },
  'poly-e60': { id: 'e60', type: 'cam', parts: e60Parts },
  'poly-g62': { id: 'g62', type: 'codec', parts: g62Parts },
  'brightsign-xt1145': { id: 'xt1145', type: 'sig', parts: xt1145Parts },
  'inogeni-u-cam': { id: 'ucam', type: 'adapter', parts: ucamParts },
};

export const ART_SRC = {
  u2724d: 'Dell U2724D/U2724DE outline dimensions drawing (front view) and user guide front view',
  u2724de: 'Dell U2724D/U2724DE outline dimensions drawing (front view) and user guide front view',
  u3425we: 'Dell U3425WE user guide, front view (small figure); panel size from the guide',
  p2726deb: 'Dell Pro P 24/27/34 user guide, Figure 1 front view (webcam pop-up on top); panel size from the guide',
  p3426web: 'Dell Pro P3426WEB press image, front (via TFTCentral); panel and stand sizes from the Dell user guide',
  asd2026: 'Apple Studio Display (2026) tech-specs front image, tilt-adjustable stand',
  lg55: 'LG UH5Q-E product page, even slim bezel front image; owner\'s manual for size',
  lg75: 'LG UH5Q-E product page, even slim bezel front image; owner\'s manual for size',
  sam65: 'Samsung QMC quick setup guide, front-view schematic (remote sensor block; not to scale); user manual for size',
  sam85: 'Samsung QMC quick setup guide, front-view schematic (remote sensor block; not to scale); user manual for size',
  e60: 'HP Poly Studio E60 product dimensions drawing, front elevation',
  g62: 'Poly Studio G62 data sheet product photo (front face, shot slightly from above)',
  xt1145: 'BrightSign XT5 series product render, connector edge (positions read off the render)',
  ucam: 'INOGENI U-CAM product page, input end-plate view',
};
