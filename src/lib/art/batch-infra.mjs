// Device drawings, batch "infra": network gear, docks and adapters, AV boxes, printers, a ceiling speaker,
// and the fictional "older kit" (Brightline, Corvus, Halden, Kestrel, Lumen, Solano).
//
// Same rules as art.mjs: front-on, viewBox 0 0 320 180 centred on (160, 88), colour only through the art-*
// classes, no text and no brand logos beyond a plain shape. Every drawing is laid out in millimetres and then
// scaled by one factor per type, so models of a type are drawn to scale against each other.
// Every part is a rect (a round part is a rect with a full radius) so parts can morph between models.
//
// Shape (read by the "// batches" marker in art.mjs):
//   ART      { <model id>: { id, type, parts() } }  parts() returns art.mjs parts (k, t, cls, g or d), already
//            filled to the type's ORDER, so a part a model lacks is a zero-size part and models still morph.
//   ART_SRC  { <drawing id>: 'what it was traced from' }  (the drawing id is the model id here)
const CX = 160, CY = 88;
const R = (k, x, y, w, h, rx, cls) => ({ k, t: 'rect', cls, g: { x, y, width: w, height: h, rx: rx || 0 } });
const Ck = (k, cx, cy, r, cls) => ({ k, t: 'circle', cls, g: { cx, cy, r } });
const Pk = (k, d, cls) => ({ k, t: 'path', cls, d });
// A body of W x H millimetres centred on the canvas at s px per mm. Offsets inside the body are in mm from
// its top-left corner; `dy` nudges the whole device down in px.
function stage(s, W, H, dy = 0) {
  const w = W * s, h = H * s, x0 = CX - w / 2, y0 = CY - h / 2 + dy;
  return {
    w, h, x0, y0,
    r: (k, x, y, ww, hh, rx, cls) => R(k, x0 + x * s, y0 + y * s, ww * s, hh * s, (rx || 0) * s, cls),
    rc: (k, cx, cy, ww, hh, rx, cls) => R(k, x0 + (cx - ww / 2) * s, y0 + (cy - hh / 2) * s, ww * s, hh * s, (rx || 0) * s, cls),
    o: (k, cx, cy, d, cls) => R(k, x0 + (cx - d / 2) * s, y0 + (cy - d / 2) * s, d * s, d * s, d * s / 2, cls),
    // a true circle part, only for the keys art.mjs already draws as circles (l0-l3, lens2)
    c: (k, cx, cy, r, cls) => Ck(k, x0 + cx * s, y0 + cy * s, r * s, cls),
    shell: (rx, cls) => [R('shadow', x0 + 5, y0 + 5, w, h, rx * s, 'art-shadow'), R('body', x0, y0, w, h, rx * s, cls)],
  };
}
const seq = (n, prefix) => Array.from({ length: n }, (_, i) => prefix + i);

// Part order of each type. The first block is copied from art.mjs and batch-av.mjs because this batch reuses
// those types, at their scales, so its models morph with theirs (its extra parts follow the type's own parts).
// The rest are this batch's own types.
const ORDER = {
  disp: ['shadow', 'body', 'screen', 'rcv'],
  codec: ['shadow', 'body', 'led', 'logo'],
  sig: ['shadow', 'body', 'scL', 'scR', 'ant1', 'ant2', 'audio', 'ir', 'serial', 'gpio', 'l0', 'l1', 'l2', 'l3', 'pwr'],
  adapter: ['shadow', 'body', 'scL', 'scR', 'usba1', 'usba2', 'lan', 'usbb'],
  cam: ['shadow', 'body', 'foot1', 'foot2', 'pod', 'yoke', 'ring', 'lens1', 'glass', 'lens2', 'led', 'led2'],
  ext: ['shadow', 'body', 'btn', 'usbc', 'usbb', 'l0', 'l1', 'l2', 'l3', 'led', 'l5', 'label', 'model'],
  touch: ['shadow', 'body', 'screen', 't1', 't2', 't3', 'sensor', 'ledL', 'ledR', 'led', 'stand'],
  // Rack switches, gateways and the small desktop gateway.
  'inf-rack': ['shadow', 'body', 'screen', 'sdot', ...seq(5, 'vent'), 'brand', ...seq(5, 'led'), 'btn', ...seq(4, 'frame'), 'usb0', 'usb1', 'con', ...seq(4, 'strip'), ...seq(48, 'p'), ...seq(32, 'q'), 'rst'],
  // Round ceiling access point, seen from below.
  'inf-ap': ['shadow', 'body', 'halo', 'hub', 'mark'],
  // Desktop dock, on its side as the vendor shows it.
  'inf-dock': ['shadow', 'body', 'cap', 'jack', 'uc1', 'uc2', 'sd', 'msd', 'led', 'logo'],
  // Small AV and IT boxes: adapters, amplifiers, codecs, players.
  'inf-box': ['shadow', 'body', 'plate', 'stripe', 'vent', 'scr', ...seq(4, 's'), 'logo', 'ir', ...seq(8, 'led'), 'jack', 'sw', 'k0', 'k1', 'pad', ...seq(8, 'b'), 'usbc', 'mount'],
  // Floor-standing printers and copiers.
  'inf-printer': ['shadow', 'body', 'adf', 'top', 'tray', 'panel', 'screen', 'logo', 'led', ...seq(4, 'd'), ...seq(4, 'h'), 'foot1', 'foot2'],
  // Ceiling speaker, seen from below.
  'inf-spk': ['shadow', 'body', 'rim', 'cone', 'dome', ...seq(4, 's'), 'dial'],
  // Lamp projectors.
  'inf-proj': ['shadow', 'body', 'top', 'vent', 'lens', 'glass', 'ir', ...seq(3, 'led'), 'logo', 'foot1', 'foot2'],
};

// ---------------------------------------------------------------------------------------------------------
// inf-rack: 0.66 px per mm. A 19-inch, 1U front is about 292 x 29 px.
const RACK = 0.66;
function unifiPorts(g, P, cols, x0, pitch, rows) {
  // RJ45 jacks, two rows, numbered down each column (1 above 2)
  for (let i = 0; i < cols * 2; i++) P.push(g.r('p' + i, x0 + (i >> 1) * pitch + (pitch - 12.6) / 2, rows[i & 1], 12.6, 11.6, 1, 'art-port'));
}
function unifiFront(g, P, o) {
  // The UniFi family: silver-white 1U, touch display at the left, a row of vents above the ports, reset dot.
  P.push(...g.shell(1.5, 'art-devlight'));
  if (o.screen) P.push(g.r('screen', 3.3, 10.2, 23.6, 22.8, 2.4, 'art-screen'), g.o('sdot', 15.1, 21.6, 6, 'art-ring'));
  o.vents.forEach(([x, w], i) => P.push(g.r('vent' + i, x, 5, w, 1.2, 0.6, 'art-podline')));
  P.push(g.o('rst', 429.6, 38.6, 1.8, 'art-port'));
}
function rackParts(m) {
  const P = [], rows = [8.6, 23.6];
  if (m === 'usw-pro-max-48-poe') {
    const g = stage(RACK, 442.4, 43.7);
    unifiFront(g, P, { screen: true, vents: [[35.9, 74], [114, 74], [192, 74], [270, 73], [347, 37]] });
    unifiPorts(g, P, 24, 35.4, 14.54, rows);
    [[391.2, 0], [407.4, 0]].forEach(([x], c) => rows.forEach((y, r) => P.push(g.r('q' + (c * 2 + r), x, y, 15.5, 11.6, 1, 'art-sfp'))));
    return P;
  }
  if (m === 'usw-pro-aggregation') {
    const g = stage(RACK, 442, 44);
    unifiFront(g, P, { screen: true, vents: [[35.9, 74], [114, 63], [191, 73], [269, 73], [347, 39]] });
    for (let c = 0; c < 14; c++) rows.forEach((y, r) => P.push(g.r('q' + (c * 2 + r), 173.4 + c * 15.26 + 0.4, y, 14.4, 11.6, 1, 'art-sfp')));
    [390.7, 407].forEach((x, c) => rows.forEach((y, r) => P.push(g.r('q' + (28 + c * 2 + r), x, y, 15.5, 11.6, 1, 'art-sfp'))));
    return P;
  }
  if (m === 'efg') {
    const g = stage(RACK, 442.4, 43.7);
    unifiFront(g, P, { screen: true, vents: [[37, 74.6], [114.5, 73.5], [191.7, 73], [269.4, 73.6], [346.7, 74]] });
    rows.forEach((y, r) => P.push(g.r('p' + r, 367, y, 17.5, 11.6, 1, 'art-port')));
    [386.7, 406.7].forEach((x, c) => rows.forEach((y, r) => P.push(g.r('q' + (c * 2 + r), x, y, 18, 11.6, 1, 'art-sfp'))));
    return P;
  }
  if (m === 'express-7') {
    // 117 x 42.5 mm white slab with a small status display on the front and a lit line along the base
    const g = stage(RACK, 117, 42.5);
    P.push(...g.shell(9, 'art-devlight'), g.r('strip1', 0, 36.5, 117, 6, 0, 'art-fabric'), g.r('strip0', 24, 38.4, 69, 1.2, 0.6, 'art-cream'), g.rc('screen', 58.5, 19.5, 21, 10.5, 5.25, 'art-screen'));
    return P;
  }
  if (m === 'c9200l-48p-4g') {
    // 445 x 44 mm. Traced from Cisco's front-panel figure: LEDs, console and two USB-A at the top left, four
    // groups of 12 ports (6 columns, 2 rows), four SFP uplinks at the right.
    const g = stage(RACK, 445, 44.5);
    P.push(...g.shell(1.6, 'art-dev'));
    [6.7, 24.8, 32.6, 39.6, 46.6].forEach((x, i) => P.push(g.o('led' + i, x, 5.2, 2.2, i === 0 ? 'art-ledon' : 'art-ledoff')));
    P.push(g.r('con', 60.3, 2.6, 9, 5.4, 1, 'art-port'), g.r('usb0', 74.5, 2.6, 12.4, 5.4, 0.8, 'art-mount'), g.r('usb1', 93.9, 2.6, 12.4, 5.4, 0.8, 'art-mount'));
    [[111.5, 72.4], [187, 86.7], [276, 86.7], [374, 64]].forEach(([x, w], i) => P.push(g.r('strip' + i, x, 1.8, w, 6, 1.5, 'art-podline')));
    [6.5, 96.5, 186, 276].forEach((x, f) => {
      P.push(g.r('frame' + f, x, 9.6, 87.4, 27.7, 2, 'art-podline'));
    });
    [6.5, 96.5, 186, 276].forEach((x, f) => { for (let i = 0; i < 12; i++) P.push(g.r('p' + (f * 12 + i), x + 1.7 + (i >> 1) * 14.07, i & 1 ? 24.8 : 11.4, 12.4, 11.3, 1, 'art-port')); });
    for (let i = 0; i < 4; i++) P.push(g.r('q' + i, 374.6 + i * 15.5, 25.8, 15, 10.8, 1, 'art-sfp'));
    return P;
  }
  if (m === 'cs-2950' || m === 'cs-3560p') {
    // Fictional Corvus access switches, 1U: status LEDs and a mode button at the left, 24 ports in two groups
    // of 12, two uplink slots and a console jack at the right.
    const old = m === 'cs-2950', g = stage(RACK, 440, 44);
    P.push(...g.shell(1.5, old ? 'art-devlight' : 'art-dev'), g.r('brand', 8, 5, 34, 3.2, 1.2, old ? 'art-podline' : 'art-logo'));
    for (let i = 0; i < 5; i++) P.push(g.o('led' + i, 12 + i * 5.6, 18, 2.6, i === 0 ? 'art-ledon' : 'art-ledoff'));
    P.push(g.rc('btn', 26, 32, 9, 5, 1.2, 'art-btn'));
    [50, 148].forEach((x, f) => P.push(g.r('frame' + f, x, 8.6, 93, 27.8, 2, 'art-podline')));
    [50, 148].forEach((x, f) => { for (let i = 0; i < 12; i++) P.push(g.r('p' + (f * 12 + i), x + 1.6 + (i >> 1) * 14.6, i & 1 ? 24.1 : 10.3, 12.4, 11.3, 1, 'art-port')); });
    if (old) P.push(g.r('q0', 254, 10.3, 18, 11.3, 1, 'art-sfp'), g.r('q1', 254, 24.1, 18, 11.3, 1, 'art-sfp'));
    else P.push(g.r('q0', 254, 10.3, 16, 11.3, 1, 'art-sfp'), g.r('q1', 254, 24.1, 16, 11.3, 1, 'art-sfp'));
    P.push(g.r('con', 284, 16, 10, 7, 1, 'art-port'), g.r('strip0', 330, 9, 96, 8, 1.5, 'art-podline'), g.r('strip1', 330, 22, 60, 3, 1.2, old ? 'art-podline' : 'art-logo'));
    return P;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// inf-ap: 0.7 px per mm; the 206 mm disc is about 144 px across.
function apParts(m) {
  const g = stage(0.7, 206, 206), max = m === 'u7-pro-max';
  return [...g.shell(103, 'art-devlight'), g.o('halo', 103, 103, max ? 106 : 102, 'art-lens'), g.o('hub', 103, 103, max ? 90 : 86, 'art-devlight'), g.rc('mark', 103, 103, 10, 4, 2, 'art-logo')];
}

// ---------------------------------------------------------------------------------------------------------
// inf-dock: 2 px per mm. The TS5 is 141 x 42 mm and is shown on its side, as the vendor's front photo does.
function dockParts() {
  const g = stage(2, 141, 41.5);
  return [...g.shell(3.5, 'art-dev'), g.r('cap', 0, 0, 2, 41.5, 0, 'art-fabric'), g.o('jack', 16.5, 19.1, 6.9, 'art-port'), g.r('uc1', 27.8, 17.4, 9.4, 3.4, 1.7, 'art-port'), g.r('uc2', 46.2, 17.4, 9.3, 3.4, 1.7, 'art-port'),
    g.r('sd', 63, 19.2, 27.8, 2.9, 1.2, 'art-port'), g.r('msd', 70.2, 16, 13.4, 1.4, 0.7, 'art-port'), g.o('led', 121, 20.8, 1.8, 'art-ledon'), g.r('logo', 129.2, 8.6, 4.4, 24, 1, 'art-logo')];
}

// ---------------------------------------------------------------------------------------------------------
// Small boxes at 1.4 px per mm, the same scale as batch-av's adapter type: a half-rack 215 mm box is about 300 px.
// The four adapter-class models use the shared adapter type; the two amplifiers use inf-box; the codecs (0.9 px per
// mm, like the G62) use codec; the player (0.9, like the BrightSign) uses sig.
const BOX = 1.4;
function boxScrews(g, P, W, H, inset, cy1, cy2) {
  [[inset, cy1], [W - inset, cy1], [inset, cy2], [W - inset, cy2]].forEach(([x, y], i) => P.push(g.o('s' + i, x, y, 4.4, 'art-port')));
}
function boxParts(m, s = BOX) {
  const P = [];
  if (m === 'pa-240z') {
    // Kramer PA-240Z: 214.6 x 43.6, four corner screws, logo plate, ON light, five status lights, rule and model line
    const g = stage(s, 214.6, 43.6);
    P.push(...g.shell(1.5, 'art-dev'), g.r('logo', 13.9, 14.7, 15, 15, 2, 'art-logo'), g.r('stripe', 14.1, 36.1, 188.2, 0.6, 0.3, 'art-logo'));
    boxScrews(g, P, 214.6, 43.6, 7.3, 8.9, 34.2);
    [35.6, 86.1, 102.9, 119.3, 135.9, 152.5].forEach((x, i) => P.push(g.o('led' + i, x, 31.5, 3.2, i === 0 ? 'art-ledon' : 'art-ledoff')));
    return P;
  }
  if (m === 'vp-440h2') {
    // Kramer VP-440H2: 214.6 x 42.8, logo ring, mic switch and jack, five input buttons, menu, arrow pad, two more buttons
    const g = stage(s, 214.6, 42.8);
    P.push(...g.shell(1.5, 'art-dev'), g.o('logo', 14.4, 10.3, 9, 'art-logo'), g.r('sw', 12, 19, 5.7, 7.1, 1, 'art-port'), g.o('jack', 27.6, 21.9, 10.5, 'art-port'));
    [38.5, 54.3, 69.5, 85.3, 100.7].forEach((x, i) => P.push(g.r('b' + i, x, 16.4, 10.5, 10.4, 1.5, 'art-cream')));
    P.push(g.r('b5', 134.1, 16.4, 9.5, 9.6, 1.5, 'art-cream'), g.o('pad', 162.5, 21.5, 29.2, 'art-cream'), g.o('k0', 162.5, 21.5, 11, 'art-fabric'),
      g.r('b6', 182.2, 17, 8.7, 8.6, 1.2, 'art-cream'), g.r('b7', 195.2, 17, 9, 8.6, 1.2, 'art-cream'),
      g.r('stripe', 12.8, 36.1, 141.7, 0.5, 0.25, 'art-logo'), g.r('vent', 170, 36.1, 31, 0.5, 0.25, 'art-logo'));
    P.push(g.c('scL', 4.9, 6.9, 2.2, 'art-port'), g.c('scR', 209.7, 6.9, 2.2, 'art-port'), g.o('s2', 4.9, 36.3, 4.4, 'art-port'), g.o('s3', 209.7, 36.3, 4.4, 'art-port'));
    return P;
  }
  if (m === 'poly-poe-injector') {
    // Poly PoE++ 65 W 2.5G adapter: a 90 x 28.5 mm black brick with a mounting ear at one end
    const g = stage(s, 90, 28.5);
    P.push(...g.shell(2, 'art-dev'), g.r('plate', 6, 4.5, 60, 19.5, 1.5, 'art-podline'), g.r('logo', 70, 8.5, 14, 3, 1.5, 'art-logo'), g.o('led0', 77, 19, 3, 'art-ledon'), g.r('mount', 6, 28.5, 12, 4, 1, 'art-mount'));
    return P;
  }
  if (m === 'usb-pdi-100') {
    // SCT USB-PDI-100, front: 97 x 36 mm. Logo tile and wordmark line top left, model line top right,
    // locking USB-C (power and data) low left of centre, two lights beside it.
    const g = stage(s, 97, 36);
    P.push(...g.shell(1, 'art-dev'), g.r('logo', 3.6, 3.7, 9.2, 9.2, 1.5, 'art-lens'), g.r('stripe', 14.5, 5, 26, 2.6, 1.2, 'art-logo'), g.r('plate', 65, 4.4, 27, 6, 1.5, 'art-logo'),
      g.o('k0', 38.4, 23.1, 2.2, 'art-port'), g.rc('usbc', 38.9, 28.7, 8.4, 3.2, 1.6, 'art-port'), g.o('led0', 64.7, 29.6, 2, 'art-ledoff'), g.o('led1', 69.5, 29.6, 2, 'art-ledon'));
    return P;
  }
  if (m === 'us1gc30b') {
    // StarTech US1GC30B seen end-on at the RJ45 end of the dongle. The vendor gives no body size; the
    // retailer listing gives about 25 x 15 mm, drawn here.
    const g = stage(s, 25.4, 15.2, 0);
    P.push(...g.shell(3, 'art-dev'), g.r('plate', 3, 2.5, 19.4, 10.2, 2, 'art-podline'), g.rc('lan', 12.7, 7.6, 11.6, 7.8, 0.6, 'art-port'));
    return P;
  }
  if (m === 'ap-60') {
    // Fictional Solano AP-60, a two-channel installation amplifier: two level knobs, two rows of level lights,
    // a power button, a vent strip.
    const g = stage(s, 220, 60);
    P.push(...g.shell(2, 'art-dev'), g.r('vent', 14, 8, 60, 3, 1.5, 'art-vent'), g.r('stripe', 14, 51, 192, 0.7, 0.35, 'art-logo'), g.r('logo', 14, 40, 30, 4, 2, 'art-logo'));
    boxScrews(g, P, 220, 60, 6.5, 6.5, 53.5);
    P.push(g.o('k0', 78, 27, 17, 'art-ring'), g.o('k1', 112, 27, 17, 'art-ring'));
    [0, 1, 2, 3].forEach((i) => P.push(g.o('led' + i, 142 + i * 8, 20, 3.4, i < 3 ? 'art-ledon' : 'art-ledoff'), g.o('led' + (i + 4), 142 + i * 8, 34, 3.4, i < 2 ? 'art-ledon' : 'art-ledoff')));
    P.push(g.r('b0', 186, 21, 14, 12, 2, 'art-btn'));
    return P;
  }
  if (m === 'vc-300') {
    // Fictional Kestrel VC-300, a 2002 standard-definition codec: small status display, four buttons,
    // an infra-red window and three lights on a pale case.
    const g = stage(s, 215, 62);
    P.push(...g.shell(2.5, 'art-devlight'), g.r('scr', 14, 10, 52, 20, 2, 'art-screen'));
    for (let i = 0; i < 4; i++) P.push(g.r('b' + i, 76 + i * 14, 14, 10, 8, 1.5, 'art-btn'));
    P.push(g.r('ir', 160, 11, 22, 8, 2, 'art-gloss'), g.o('led0', 190, 15, 3.4, 'art-ledon'), g.o('led1', 198, 15, 3.4, 'art-ledoff'), g.o('led2', 206, 15, 3.4, 'art-ledoff'),
      g.r('logo', 14, 42, 38, 4.5, 2, 'art-podline'), g.r('stripe', 14, 52, 187, 0.8, 0.4, 'art-podline'));
    return P;
  }
  if (m === 'vc-700') {
    // Fictional Kestrel VC-700, a 2010 HD codec: dark slim case, a vented panel, one power button and three lights.
    const g = stage(s, 215, 44);
    P.push(...g.shell(2, 'art-dev'), g.r('vent', 104, 8, 96, 28, 2, 'art-vent'), g.r('b0', 14, 14, 11, 11, 2.5, 'art-btn'), g.r('led', 34, 18.4, 10, 2.4, 1.1, 'art-led'), g.o('led1', 52, 19.6, 3.4, 'art-ledoff'), g.o('led2', 60, 19.6, 3.4, 'art-ledoff'),
      g.r('ir', 74, 15.5, 20, 8, 2, 'art-gloss'), g.r('logo', 14, 32, 34, 3.5, 1.7, 'art-logo'));
    return P;
  }
  if (m === 'sp-100') {
    // Fictional Lumen SP-100 signage player: a small dark box with a power light, a button and a name line.
    const g = stage(s, 160, 28);
    P.push(...g.shell(3, 'art-dev'), g.c('l0', 13, 14, 2, 'art-ledon'), g.r('logo', 40, 12.5, 62, 3, 1.5, 'art-logo'), g.r('pwr', 130, 8.5, 11, 11, 2.5, 'art-btn'));
    return P;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------
// inf-printer: 0.17 px per mm; the C5150 (620 x 937 mm) is about 105 x 159 px.
const PRN = 0.17;
function printerParts(m) {
  const P = [];
  let W, H, L;
  if (m === 'imageforce-c5150') {
    // Canon imageFORCE C5150 in its standard build: document feeder and scanner, tilted touch panel, open
    // output area, logo, two paper cassettes. Proportions from Canon's front photo, size from the spec.
    W = 620; H = 937;
    L = { adf: [34, 0, 552, 135], top: [34, 135, 552, 82], tray: [20, 216, 560, 210], panel: [246, 150, 266, 92], logo: [285, 545, 50, 6], led: [470, 566, 10, 6],
      d: [[20, 752, 580, 94], [20, 850, 580, 84]], h: [[250, 770, 100, 34], [250, 866, 100, 34]] };
  } else if (m === 'imagerunner-advance-c259i') {
    // Canon imageRUNNER ADVANCE DX C259i: narrower scanner unit, panel at the right, open output area, one cassette
    W = 519; H = 638;
    L = { adf: [20, 0, 470, 118], top: [20, 118, 470, 74], tray: [18, 196, 400, 150], panel: [232, 172, 255, 110], logo: [230, 452, 60, 6], led: [400, 500, 10, 6],
      d: [[18, 560, 483, 70]], h: [[190, 580, 140, 30]] };
  } else if (m === 'mfp-4200') {
    // Fictional Lumen MFP-4200, a 2013 floor-standing multifunction: 600 x 900 mm, two cassettes
    W = 600; H = 900;
    L = { adf: [30, 0, 540, 120], top: [30, 120, 540, 76], tray: [30, 204, 520, 200], panel: [280, 136, 270, 70], logo: [250, 520, 60, 6], led: [450, 545, 10, 6],
      d: [[26, 640, 548, 120], [26, 766, 548, 120]], h: [[240, 668, 120, 34], [240, 794, 120, 34]] };
  } else return null;
  const g = stage(PRN, W, H);
  P.push(...g.shell(14, 'art-devlight'), g.r('adf', ...L.adf, 8, 'art-fabric'), g.r('top', ...L.top, 6, 'art-devlight'), g.r('tray', ...L.tray, 12, 'art-dev'), g.r('panel', ...L.panel, 14, 'art-dev'),
    g.r('screen', L.panel[0] + 16, L.panel[1] + 12, L.panel[2] - 32, L.panel[3] - 24, 6, 'art-screen'), g.r('logo', ...L.logo, 3, 'art-podline'), g.r('led', ...L.led, 3, 'art-led'));
  L.d.forEach((d, i) => P.push(g.r('d' + i, ...d, 8, 'art-fabric'), g.r('h' + i, ...L.h[i], 10, 'art-podline')));
  P.push(g.r('foot1', 40, H, 50, 20, 6, 'art-dev'), g.r('foot2', W - 90, H, 50, 20, 6, 'art-dev'));
  return P;
}

// ---------------------------------------------------------------------------------------------------------
// inf-spk: 0.6 px per mm. Kramer GALIL 6-C, the 251 mm bezel seen from below the ceiling.
function spkParts() {
  const g = stage(0.6, 251, 251), c = 125.5;
  const P = [...g.shell(c, 'art-devlight'), g.o('rim', c, c, 211, 'art-fabric'), g.o('cone', c, c, 165, 'art-grille'), g.o('dome', c, c, 43, 'art-podline')];
  [[0, -101], [-101, 0], [101, 0], [0, 101]].forEach(([dx, dy], i) => P.push(g.o('s' + i, c + dx, c + dy, 8, 'art-port')));
  P.push(g.o('dial', c - 92, c + 42, 14, 'art-mount'));
  return P;
}

// ---------------------------------------------------------------------------------------------------------
// Flat panels use batch-av's disp type at its 0.15 px per mm: a 1060 x 640 mm panel is 159 x 96 px.
function flatParts(m) {
  const g = stage(0.15, m === 'lcd-46' ? 1060 : 1030, 640, -2), lcd = m === 'lcd-46', W = lcd ? 1060 : 1030;
  const P = [...g.shell(lcd ? 14 : 10, lcd ? 'art-dev' : 'art-devlight')];
  if (lcd) P.push(g.r('screen', 32, 32, W - 64, 562, 3, 'art-screen'), g.r('logo', W / 2 - 30, 610, 60, 10, 3, 'art-logo'), g.r('led', W - 80, 608, 22, 12, 3, 'art-led'), g.r('btn', W - 150, 608, 40, 12, 3, 'art-podline'));
  else P.push(g.r('screen', 50, 45, W - 100, 523, 3, 'art-screen'), g.r('spkL', 50, 588, 270, 36, 8, 'art-mesh'), g.r('spkR', W - 320, 588, 270, 36, 8, 'art-mesh'), g.r('logo', W / 2 - 25, 594, 50, 10, 3, 'art-podline'), g.r('led', W - 60, 596, 18, 10, 3, 'art-led'));
  P.push(g.r('stand', W / 2 - 200, 640, 400, 26, 6, 'art-dev'));
  return P;
}

// ---------------------------------------------------------------------------------------------------------
// inf-proj: 0.85 px per mm; a 310 mm lamp projector is about 264 px wide.
function projParts(m) {
  const P = [], old = m === 'px-2000', W = old ? 310 : 296, H = old ? 92 : 98, g = stage(0.85, W, H, -4);
  if (old) {
    // Fictional Brightline PX-2000, a 2000-era XGA projector: pale case, lens at the left, vent grille at the right
    P.push(...g.shell(8, 'art-devlight'), g.o('lens', 104, 44, 66, 'art-ring'), g.o('glass', 104, 44, 46, 'art-gloss'), g.r('vent', 196, 14, 96, 46, 4, 'art-vent'), g.r('ir', 248, 68, 14, 8, 2, 'art-gloss'),
      g.o('led0', 24, 20, 4, 'art-ledon'), g.o('led1', 34, 20, 4, 'art-ledoff'), g.o('led2', 44, 20, 4, 'art-ledoff'), g.r('logo', 22, 68, 42, 5, 2, 'art-podline'), g.r('foot1', 30, H, 34, 7, 2, 'art-dev'), g.r('foot2', W - 64, H, 34, 7, 2, 'art-dev'));
  } else {
    // Fictional Brightline PX-4500, a 2012 WXGA projector: dark case, slot vents, lens toward the left of centre
    P.push(...g.shell(14, 'art-dev'), g.r('top', 14, 8, W - 28, 6, 3, 'art-podline'), g.o('lens', 120, 52, 72, 'art-ring'), g.o('glass', 120, 52, 52, 'art-gloss'), g.r('vent', 200, 24, 78, 56, 6, 'art-vent'), g.r('ir', 24, 40, 12, 8, 2, 'art-gloss'),
      g.o('led0', 236, 88, 4, 'art-ledon'), g.o('led1', 246, 88, 4, 'art-ledoff'), g.o('led2', 256, 88, 4, 'art-ledoff'), g.r('logo', 28, 76, 44, 5, 2, 'art-logo'), g.r('foot1', 32, H, 34, 7, 2, 'art-dev'), g.r('foot2', W - 66, H, 34, 7, 2, 'art-dev'));
  }
  return P;
}

// ---------------------------------------------------------------------------------------------------------
// Types art.mjs already has, reused so these models morph with the ones already drawn.
// ext (1.42 px per mm): Kramer TP-58x extenders and WP-20CT wall plate, and the fictional Halden MS-42 switcher.
// Their extra parts (scr0, scr1, hdmi, b1-b3) are drawn after the type's own parts, so anything that has to sit
// under another part takes one of the type's own keys (the WP-20CT's metal insert is the 'btn').
const EXT = 1.42;
function extParts(m) {
  const P = [];
  if (m === 'tp-583txr' || m === 'tp-583rxr' || m === 'tp-580rxr') {
    // Kramer TP-583Txr / TP-583Rxr / TP-580Rxr front: 120 x 24 mm, a screw at each end, four lights at the
    // right, a rule with the name line under it (drawn as plain bars)
    const H = m === 'tp-580rxr' ? 24.4 : 24, g = stage(EXT, 120, H), on = m === 'tp-580rxr';
    P.push(...g.shell(2.5, 'art-dev'), g.o('scr0', 4.2, H / 2, 4.2, 'art-port'), g.o('scr1', 115.6, H / 2, 4.2, 'art-port'));
    [78.6, 86, 93.2, 105.9].forEach((x, i) => P.push(g.c('l' + i, x, H * 0.6, 1.1, on ? 'art-ledon' : 'art-ledoff')));
    P.push(g.r('label', 9.5, H - 5.2, 34, 1.7, 0.8, 'art-logo'), g.r('model', 96, H - 5.2, 18, 1.9, 0.9, 'art-logo'));
    return P;
  }
  if (m === 'wp-20ct') {
    // Kramer WP-20CT, US wall plate: 69.8 x 114.3 mm plate, a smaller metal insert holding three lights,
    // USB-C, HDMI and a name bar
    const g = stage(EXT, 69.8, 114.3);
    P.push(...g.shell(3, 'art-devlight'), g.r('btn', 19.4, 25.2, 30.9, 61.9, 2.5, 'art-mount'));
    [26.8, 34.5, 42.1].forEach((x, i) => P.push(g.c('l' + i, x, 36.5, 1.5, 'art-ledoff')));
    P.push(g.r('usbc', 29.8, 46.2, 9.4, 3.6, 1.8, 'art-port'), g.rc('hdmi', 34.5, 68.7, 14.7, 6.1, 1, 'art-port'), g.r('label', 27, 80.4, 15, 2.6, 1.2, 'art-dev'));
    return P;
  }
  if (m === 'ms-42') {
    // Fictional Halden MS-42, a 2008 four-in, two-out VGA matrix switcher, 200 x 44 mm: four input buttons
    // with a light under each, power light
    const g = stage(EXT, 200, 44);
    P.push(...g.shell(2.5, 'art-dev'), g.r('label', 12, 34, 40, 3, 1.4, 'art-logo'), g.r('model', 140, 34, 48, 3, 1.4, 'art-logo'));
    for (let i = 0; i < 4; i++) P.push(g.c('l' + i, 30 + i * 22, 25, 1.7, i === 0 ? 'art-ledon' : 'art-ledoff'));
    P.push(g.r('btn', 24, 9, 12, 8, 1.5, 'art-btn'), g.r('b1', 46, 9, 12, 8, 1.5, 'art-btn'), g.r('b2', 68, 9, 12, 8, 1.5, 'art-btn'), g.r('b3', 90, 9, 12, 8, 1.5, 'art-btn'), g.rc('led', 176, 20, 5.6, 5.6, 2.8, 'art-led'));
    return P;
  }
  return null;
}
// touch (0.78 px per mm): the fictional Halden TP-7 seven-inch touch panel, 190 x 125 mm
function touchParts() {
  const g = stage(0.78, 190, 125, 2);
  return [...g.shell(10, 'art-dev'), g.r('screen', 12, 12, 166, 92, 3, 'art-screen'), g.r('t1', 20, 20, 74, 76, 4, 'art-ui'), g.r('t2', 100, 20, 70, 34, 3, 'art-uitile'), g.r('t3', 100, 62, 70, 34, 3, 'art-uitile'), g.r('led', 168, 112, 8, 4, 2, 'art-led')];
}
// cam: the fictional Kestrel pan-tilt-zoom cameras in the cam type at 0.9 px per mm, laid out like the E60: a wide
// base slab on two feet, a narrow tier, a yoke, and a round head with its lens. The 2010 HD camera is dark and
// neat; the 2003 SD camera is a bigger pale case.
function camParts(m) {
  const hd = m === 'cam-hd';
  const D = hd ? { bw: 150, bh: 24, pw: 96, ph: 16, yw: 50, yh: 34, rr: 32, lr: 20 } : { bw: 172, bh: 28, pw: 114, ph: 20, yw: 62, yh: 40, rr: 40, lr: 25 };
  const yy = 2 * D.rr - 3, py = yy + D.yh - 2, by = py + D.ph - 1, H = by + D.bh + 6, g = stage(0.9, D.bw, H), cx = D.bw / 2, cls = hd ? 'art-dev' : 'art-devlight';
  const shadow = g.r('shadow', 0, by, D.bw, D.bh, 3, 'art-shadow'); shadow.g.x += 5; shadow.g.y += 5;
  return [shadow, g.r('body', 0, by, D.bw, D.bh, 3, cls), g.r('foot1', 8, by + D.bh, 14, 6, 1.5, 'art-grille'), g.r('foot2', D.bw - 22, by + D.bh, 14, 6, 1.5, 'art-grille'),
    g.r('pod', cx - D.pw / 2, py, D.pw, D.ph, 6, cls), g.r('yoke', cx - D.yw / 2, yy, D.yw, D.yh, 8, cls), g.c('ring', cx, D.rr, D.rr, 'art-ring'), g.o('lens1', cx, D.rr, 2 * D.lr, 'art-lens'),
    g.r('led', 12, by + D.bh / 2 - 1.6, 3.2, 3.2, 1, 'art-led')];
}
// mic: the fictional Kestrel MIC-1, a round table pod seen from above, in canvas px
function micParts() {
  const ring = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  return [Pk('shadow', ring(165, 85, 54), 'art-shadow'), Pk('body', ring(160, 80, 54), 'art-dev'), Pk('led', ring(160, 80, 42), 'art-ledline'), R('logo', 152, 106, 16, 3.5, 1.7, 'art-logo')];
}

// ---------------------------------------------------------------------------------------------------------
// Fill a drawing to its type's ORDER: a part it lacks becomes a zero-size part at the centre (same rule as art.mjs).
const CIRCLE = { sig: /^(scL|scR|ant\d|audio|ir|serial|l\d)$/, adapter: /^(scL|scR)$/, cam: /^(ring|lens2)$/, disp: /^$/, codec: /^$/ };
const CIRCLE_DEFAULT = /^(g\d|lens\d|ring|sensor|reset|l\d)$/;
function fill(type, parts) {
  const order = ORDER[type]; if (!order) return parts;
  const by = {}; parts.forEach((p) => by[p.k] = p);
  const isCircle = (k) => (CIRCLE[type] ?? CIRCLE_DEFAULT).test(k);
  const zero = (k) => isCircle(k) ? Ck(k, CX, CY, 0, 'art-none') : R(k, CX, CY, 0, 0, 0, 'art-none');
  return order.map((k) => by[k] || zero(k)).concat(parts.filter((p) => !order.includes(p.k)));
}

// model id -> [type, builder]
const BUILD = {
  'caldigit-ts5': ['inf-dock', dockParts],
  'canon-imageforce-c5150': ['inf-printer', () => printerParts('imageforce-c5150')],
  'canon-ir-adv-c259': ['inf-printer', () => printerParts('imagerunner-advance-c259i')],
  'lumen-mfp-4200': ['inf-printer', () => printerParts('mfp-4200')],
  'cisco-catalyst-9200l-48p-4g': ['inf-rack', () => rackParts('c9200l-48p-4g')],
  'corvus-cs-2950': ['inf-rack', () => rackParts('cs-2950')],
  'corvus-cs-3560p': ['inf-rack', () => rackParts('cs-3560p')],
  'unifi-efg': ['inf-rack', () => rackParts('efg')],
  'unifi-express-7': ['inf-rack', () => rackParts('express-7')],
  'unifi-usw-pro-aggregation': ['inf-rack', () => rackParts('usw-pro-aggregation')],
  'unifi-usw-pro-max-48-poe': ['inf-rack', () => rackParts('usw-pro-max-48-poe')],
  'unifi-u7-pro': ['inf-ap', () => apParts('u7-pro')],
  'unifi-u7-pro-max': ['inf-ap', () => apParts('u7-pro-max')],
  'kramer-galil-6': ['inf-spk', spkParts],
  'kramer-pa-240z': ['inf-box', () => boxParts('pa-240z')],
  'kramer-vp-440h2': ['adapter', () => boxParts('vp-440h2')],
  'poly-poe-injector': ['adapter', () => boxParts('poly-poe-injector')],
  'sct-usb-pdi-100': ['adapter', () => boxParts('usb-pdi-100')],
  'startech-us1gc30b': ['adapter', () => boxParts('us1gc30b')],
  'solano-ap-60': ['inf-box', () => boxParts('ap-60')],
  'kestrel-vc-300': ['codec', () => boxParts('vc-300', 0.9)],
  'kestrel-vc-700': ['codec', () => boxParts('vc-700', 0.9)],
  'lumen-sp-100': ['sig', () => boxParts('sp-100', 0.9)],
  'kramer-tp-580rxr': ['ext', () => extParts('tp-580rxr')],
  'kramer-tp-583rxr': ['ext', () => extParts('tp-583rxr')],
  'kramer-tp-583txr': ['ext', () => extParts('tp-583txr')],
  'kramer-wp-20ct': ['ext', () => extParts('wp-20ct')],
  'halden-ms-42': ['ext', () => extParts('ms-42')],
  'halden-tp-7': ['touch', touchParts],
  'kestrel-cam-hd': ['cam', () => camParts('cam-hd')],
  'kestrel-cam-sd': ['cam', () => camParts('cam-sd')],
  'kestrel-mic-1': ['mic', micParts],
  'solano-lcd-46': ['disp', () => flatParts('lcd-46')],
  'solano-pl-42': ['disp', () => flatParts('pl-42')],
  'brightline-px-2000': ['inf-proj', () => projParts('px-2000')],
  'brightline-px-4500': ['inf-proj', () => projParts('px-4500')],
};
export const ART = Object.fromEntries(Object.entries(BUILD).map(([model, [type, build]]) => [model, { id: model, type, parts: () => fill(type, build()) }]));

const FICTION = 'Illustrative drawing of a fictional model (house design)';
export const ART_SRC = {
  'caldigit-ts5': 'CalDigit TS5 product page (front photo, shown on its side) and its 141 x 42 mm size',
  'canon-imageforce-c5150': "Canon imageFORCE C5100 series product photo (front), with the 620 x 937 mm size from Canon's specifications",
  'canon-ir-adv-c259': "Canon imageRUNNER ADVANCE DX C259i product photo (three-quarter view, front face drawn), 519 x 638 mm from Canon's specifications",
  'cisco-catalyst-9200l-48p-4g': 'Cisco Catalyst 9200 series hardware installation guide, front-panel figure',
  'kramer-galil-6': 'Kramer GALIL 6-C product photo (front) and user manual',
  'kramer-pa-240z': 'Kramer PA-240Z product photo (front panel)',
  'kramer-tp-580rxr': 'Kramer TP-580Rxr product photo (front panel)',
  'kramer-tp-583rxr': 'Kramer TP-583Rxr product photo (front panel)',
  'kramer-tp-583txr': 'Kramer TP-583Txr product photo (front panel)',
  'kramer-vp-440h2': 'Kramer VP-440H2 product photo (front panel)',
  'kramer-wp-20ct': 'Kramer WP-20CT product photo (front, US plate)',
  'poly-poe-injector': 'Poly PoE++ 65 W 2.5G adapter product photo (three-quarter view, long side drawn) and its 90 x 28.5 mm size',
  'sct-usb-pdi-100': 'SCT USB-PDI-100 product page (front photo)',
  'startech-us1gc30b': 'StarTech US1GC30B product photo (RJ45 end), size from a retailer listing',
  'unifi-efg': 'Ubiquiti Enterprise Fortress Gateway product page (front-panel diagram)',
  'unifi-express-7': 'Ubiquiti UniFi Express 7 store photos (front)',
  'unifi-u7-pro-max': 'Ubiquiti U7 Pro Max store photos, drawn as seen from below the ceiling',
  'unifi-u7-pro': 'Ubiquiti U7 Pro store photos, drawn as seen from below the ceiling',
  'unifi-usw-pro-aggregation': 'Ubiquiti USW-Pro-Aggregation store page (front-panel diagram)',
  'unifi-usw-pro-max-48-poe': 'Ubiquiti Switch Pro Max 48 PoE store page (front-panel diagram)',
  ...Object.fromEntries(['brightline-px-2000', 'brightline-px-4500', 'corvus-cs-2950', 'corvus-cs-3560p', 'halden-ms-42', 'halden-tp-7', 'kestrel-cam-hd', 'kestrel-cam-sd', 'kestrel-mic-1', 'kestrel-vc-300', 'kestrel-vc-700', 'lumen-mfp-4200', 'lumen-sp-100', 'solano-ap-60', 'solano-lcd-46', 'solano-pl-42'].map((m) => [m, FICTION])),
};
