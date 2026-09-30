// Rack equipment fronts, drawn to scale in millimetres (decision 0028, rule R5). The UniFi fronts are traced
// from Ubiquiti's labelled panel drawings (cited in their rack-gear files); the others follow the front panel
// their rack-gear file describes from the vendor's documents: the body at its real width, ports in the
// vendor's blocks and numbering, LEDs, screens and the printed marks. A port that
// a recorded patch cable uses shows a plug in that cable's colour (and, on UniFi switches, its Etherlighting
// ring); a free port is an empty socket, so the rack reads at a glance without hovering.
//
// A face is (x, y, h, ctx) => SVG string: x is the left edge of the 19-inch face (482.6 mm wide), y the top
// of the item, h its height; ctx.used is a Map of port number to the cable's colour. Every numbered port is
// wrapped in <g class="pt" data-p="n">, so the large drawing in the rack view can say what it connects to. Colours come from the
// classes styled in RackView.astro on the art tokens; only a cable's standard colour is written inline.
export const U = 44.45, FACE = 482.6, EAR = 16;

const f1 = (n) => (+n).toFixed(1);
const r = (x, y, w, h, c, rx = 1, extra = '') => `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${rx}" class="${c}"${extra}/>`;
const circ = (x, y, rr, c, extra = '') => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${rr}" class="${c}"${extra}/>`;
const txt = (x, y, s, c, anchor = '') => `<text x="${f1(x)}" y="${f1(y)}" class="${c}"${anchor ? ` text-anchor="${anchor}"` : ''}>${s}</text>`;
const fillOf = (hex) => (hex ? ` style="fill:${hex}"` : '');

// Rack ears with their screws, either side of a body of width w centred on the face.
const ears = (x, y, h, c = 'ear') => r(x, y, EAR + 4, h, c, 1.5) + r(x + FACE - EAR - 4, y, EAR + 4, h, c, 1.5)
  + circ(x + 8, y + h / 2, 2.6, 'screw') + circ(x + FACE - 8, y + h / 2, 2.6, 'screw');
// The body of a device W mm wide, centred on the face.
const bodyX = (x, W) => x + (FACE - W) / 2;

// A port wrapped with its number, so the detail drawing can say what it connects to.
const pt = (n, inner) => (n ? `<g class="pt" data-p="${n}">${inner}</g>` : inner);
// A port's state: its number and, when a recorded patch cable uses it, the cable's colour.
const hexOf = (u) => (u && typeof u === 'object' ? u.hex : u ?? null);
const numOf = (u) => (u && typeof u === 'object' ? u.n : null);

// An RJ45 socket, 11.2 x 9.2 mm, latch down. Used: a plug boot in the cable colour, and the link light.
function rj(x, y, u, { eth = false, led = true, k = 0 } = {}) {
  const hex = hexOf(u);
  let s = r(x, y, 11.2, 9.2, eth && hex ? 'jack eth' : 'jack', 0.8, eth && hex ? ` style="stroke:${hex}"` : '');
  if (hex) s += r(x + 1.4, y + 1.4, 8.4, 6.4, 'plug', 0.8, fillOf(hex)) + r(x + 3.6, y + 6.4, 4, 1.6, 'plug-latch', 0.3);
  else s += r(x + 1.6, y + 1.8, 8, 5.8, 'jack-in', 0.4) + r(x + 3.6, y + 6, 4, 2, 'jack-in', 0.3);
  if (led && hex) s += circ(x + 1.9, y - 1.3, 0.9, `plink${k % 4 ? '' : ' blink'}`, ` style="--d:${((k * 0.37) % 2).toFixed(2)}s"`);
  return pt(numOf(u), s);
}
// An SFP cage. Used: a transceiver with a duplex LC pair in the cable colour.
function sfp(x, y, u, w = 13.5, h = 8.5) {
  const hex = hexOf(u);
  let s = r(x, y, w, h, 'cage', 0.6);
  if (hex) s += r(x + 1.2, y + 1.2, w - 2.4, h - 2.4, 'xcvr', 0.4) + circ(x + w * 0.36, y + h / 2, 1.5, 'lc', fillOf(hex)) + circ(x + w * 0.64, y + h / 2, 1.5, 'lc', fillOf(hex));
  else s += r(x + 1.5, y + 1.5, w - 3, h - 3, 'cage-in', 0.3);
  return pt(numOf(u), s);
}
const led = (x, y, c = 'led-g', rr = 1.5) => circ(x, y, rr, c);
const usedOf = (ctx, n) => ({ hex: ctx?.used?.get(n) ?? null, n });

// ---------- UniFi (silver steel, touchscreen, Etherlighting) ----------
// Traced from the labelled front drawings on techspecs.ui.com (2.455 px per mm on the vendor's image).
function unifiShell(x, y, h, W) {
  const bx = bodyX(x, W);
  return { bx, s: ears(x, y, h, 'ear-silver') + r(bx, y, W, h, 'silver', 1.2) + r(bx, y + h - 2.2, W, 2.2, 'silver-lip', 0.6) };
}
// The 1.3-inch touchscreen: a dark glass square with the UniFi status ring.
const touch = (x, y) => r(x, y, 23, 23, 'screen', 2.2) + circ(x + 11.5, y + 11.5, 4.2, 'screen-ring') + circ(x + 11.5, y + 11.5, 2, 'screen-dot')
  + circ(x + 4.5, y + 4.5, 1.1, 'screen-ui') + circ(x + 18.5, y + 4.5, 1.1, 'screen-ui') + circ(x + 4.5, y + 18.5, 1.1, 'screen-ui') + circ(x + 18.5, y + 18.5, 1.1, 'screen-ui');
// The dark group strips printed above each port block.
const strips = (x, y, spans) => spans.map(([a, b]) => r(x + a, y, b - a, 1.3, 'strip', 0.4)).join('');

export const FACES = {
  'unifi-sw48': (x, y, h, ctx) => {
    const { bx, s: shell } = unifiShell(x, y, h, 442.4);
    let s = shell + touch(bx + 4, y + 10.8) + txt(bx + 4, y + 39.5, 'USW Pro Max', 'mark-dark');
    s += strips(bx, y + 3.4, [[35.8, 110], [112, 150.5], [153.2, 228], [230, 267], [269.3, 343], [345, 385]]);
    for (let n = 1; n <= 48; n++) {
      const blk = Math.floor((n - 1) / 16), col = Math.floor(((n - 1) % 16) / 2), row = (n - 1) % 2;
      const px = bx + [35.8, 153.2, 269.3][blk] + col * 14.5, py = y + (row ? 23.2 : 8.7);
      s += rj(px, py, usedOf(ctx, n), { eth: true, led: false, k: n });
      if (col === 0 && !row) s += txt(px, py - 1.2, String(n), 'pnum-dark');
    }
    for (let k = 0; k < 4; k++) s += sfp(bx + 390 + Math.floor(k / 2) * 16.5, y + (k % 2 ? 23.2 : 8.7), usedOf(ctx, 49 + k), 14.5, 10.2);
    return s + circ(bx + 429, y + 39, 1.1, 'reset');
  },
  'unifi-agg': (x, y, h, ctx) => {
    const { bx, s: shell } = unifiShell(x, y, h, 442);
    let s = shell + touch(bx + 4, y + 10.8) + txt(bx + 4, y + 39.5, 'USW Pro', 'mark-dark');
    s += strips(bx, y + 3.4, [[35.8, 110], [112, 170], [173.5, 248], [251, 327], [330, 387]]);
    for (let n = 1; n <= 28; n++) {
      const col = Math.floor((n - 1) / 2), row = (n - 1) % 2;
      s += sfp(bx + 173.5 + col * 15.25, y + (row ? 23.2 : 8.7), usedOf(ctx, n), 14, 10.2);
      if (!row && col % 2 === 0) s += txt(bx + 173.5 + col * 15.25, y + 7.4, String(n), 'pnum-dark');
    }
    for (let k = 0; k < 4; k++) s += sfp(bx + 391 + Math.floor(k / 2) * 15.5, y + (k % 2 ? 23.2 : 8.7), usedOf(ctx, 29 + k), 14, 10.2);
    return s + circ(bx + 429, y + 39, 1.1, 'reset');
  },
  'unifi-efg': (x, y, h, ctx) => {
    const { bx, s: shell } = unifiShell(x, y, h, 442.4);
    let s = shell + touch(bx + 6, y + 10.8) + txt(bx + 6, y + 39.5, 'Enterprise FG', 'mark-dark');
    s += strips(bx, y + 3.4, [[36, 111], [113, 190], [192, 268], [270, 346], [348, 420]]);
    s += rj(bx + 367, y + 9.5, usedOf(ctx, 1), { eth: false, k: 1 }) + rj(bx + 367, y + 23.5, usedOf(ctx, 2), { eth: false, k: 2 });
    s += sfp(bx + 385, y + 9, usedOf(ctx, 3), 15, 10.2) + sfp(bx + 385, y + 23, usedOf(ctx, 4), 15, 10.2);
    s += sfp(bx + 404, y + 9, usedOf(ctx, 5), 15, 10.2) + sfp(bx + 404, y + 23, usedOf(ctx, 6), 15, 10.2);
    s += txt(bx + 368, y + 7.4, 'WAN', 'pnum-dark') + txt(bx + 405, y + 7.4, 'WAN', 'pnum-dark');
    return s + circ(bx + 427, y + 39, 1.1, 'reset');
  },

  // ---------- Cisco Catalyst (dark grey, blue beacon, odd ports on top) ----------
  'rj48-module': (x, y, h, ctx) => {
    let s = r(x, y, FACE, h, 'chassis') + ears(x, y, h) + led(x + 26, y + 11) + led(x + 26, y + 18, 'led-b') + led(x + 26, y + 25) + txt(x + 20.5, y + 38, 'CISCO', 'brand');
    for (let n = 1; n <= 48; n++) {
      const blk = Math.floor((n - 1) / 24), col = Math.floor(((n - 1) % 24) / 2), row = (n - 1) % 2;
      s += rj(x + 42 + blk * (12 * 12.4 + 5) + col * 12.4, y + 11 + row * 13.2, usedOf(ctx, n), { k: n });
    }
    s += r(x + 360, y + 5, 106, h - 10, 'module', 1.5);
    for (let k = 0; k < 4; k++) s += sfp(x + 368 + k * 16, y + 11, usedOf(ctx, 49 + k));
    return s + r(x + 440, y + 27, 10, 7, 'usb', 1);
  },
  'rj48-sfp4': (x, y, h, ctx) => {
    let s = r(x, y, FACE, h, 'chassis') + ears(x, y, h) + led(x + 26, y + 13) + led(x + 26, y + 23) + txt(x + 20.5, y + 38, 'CISCO', 'brand');
    for (let n = 1; n <= 48; n++) {
      const blk = Math.floor((n - 1) / 24), col = Math.floor(((n - 1) % 24) / 2), row = (n - 1) % 2;
      s += rj(x + 42 + blk * (12 * 12.4 + 5) + col * 12.4, y + 11 + row * 13.2, usedOf(ctx, n), { k: n });
    }
    for (let k = 0; k < 4; k++) s += sfp(x + 372 + k * 16, y + 11, usedOf(ctx, 49 + k));
    return s + r(x + 444, y + 12, 11, 9, 'jack', 0.8);
  },
  'sfp24-qsfp4': (x, y, h, ctx) => {
    let s = r(x, y, FACE, h, 'chassis') + ears(x, y, h) + led(x + 26, y + 11) + led(x + 26, y + 18, 'led-b') + led(x + 26, y + 25) + txt(x + 20.5, y + 38, 'CISCO', 'brand');
    for (let n = 1; n <= 24; n++) {
      const col = Math.floor((n - 1) / 2), row = (n - 1) % 2;
      s += sfp(x + 44 + col * 15.8 + (col >= 6 ? 4 : 0), y + 9 + row * 13, usedOf(ctx, n));
    }
    for (let k = 0; k < 4; k++) s += sfp(x + 250 + Math.floor(k / 2) * 24, y + 8 + (k % 2) * 14, usedOf(ctx, 25 + k), 20, 10.5);
    return s + r(x + 330, y + 12, 11, 9, 'jack', 0.8) + r(x + 346, y + 14, 9, 6, 'usb', 1) + r(x + 360, y + 10, 90, h - 20, 'vent', 1);
  },
  wlc: (x, y, h, ctx) => {
    let s = r(x + 2, y + h - 6, FACE - 4, 5, 'tray', 1) + ears(x, y, h, 'ear-tray') + r(x + 30, y + 4, 216, h - 10, 'chassis', 2)
      + rj(x + 40, y + 12, null) + rj(x + 54, y + 12, null) + r(x + 68, y + 14, 8, 5, 'usb', 1) + r(x + 80, y + 14, 9, 6, 'usb', 1);
    for (let n = 1; n <= 4; n++) s += rj(x + 96 + (n - 1) * 12.4, y + 12, usedOf(ctx, n), { k: n });
    for (let n = 5; n <= 6; n++) s += sfp(x + 150 + (n - 5) * 15, y + 12, usedOf(ctx, n));
    return s + txt(x + 206, y + 26, 'CISCO', 'brand');
  },

  // ---------- Palo Alto PA-445 on a tray ----------
  'fw-pa400': (x, y, h, ctx) => {
    let s = r(x + 2, y + h - 6, FACE - 4, 5, 'tray', 1) + ears(x, y, h, 'ear-tray') + r(x + 76, y + 4, 330.2, h - 10, 'fw', 3)
      + r(x + 86, y + 14, 9, 6, 'usb', 1) + r(x + 98, y + 14, 9, 6, 'usb', 1) + rj(x + 112, y + 12, null) + r(x + 126, y + 14, 8, 5, 'usb', 1)
      + sfp(x + 140, y + 12, null, 12, 9) + rj(x + 156, y + 12, null);
    for (let n = 1; n <= 8; n++) s += rj(x + 174 + (n - 1) * 12.6, y + 12, usedOf(ctx, n), { k: n });
    return s + led(x + 288, y + 14) + led(x + 296, y + 14) + led(x + 304, y + 14, 'led-off') + txt(x + 282, y + 28, 'PWR STAT ALM', 'tiny')
      + r(x + 326, y + 11, 14, 11, 'jack', 2) + r(x + 346, y + 11, 14, 11, 'jack', 2);
  },

  // ---------- ZPE Nodegrid ----------
  serial48: (x, y, h, ctx) => {
    let s = r(x, y, FACE, h, 'chassis-2') + ears(x, y, h) + txt(x + 22, y + 26, 'ZPE', 'brand');
    for (let n = 1; n <= 48; n++) {
      const blk = Math.floor((n - 1) / 24), col = (n - 1) % 12, row = Math.floor(((n - 1) % 24) / 12);
      s += rj(x + 44 + blk * (12 * 12.4 + 5) + col * 12.4, y + 11 + row * 13.2, usedOf(ctx, n), { k: n });
    }
    return s + rj(x + 372, y + 12, null) + rj(x + 386, y + 12, null) + sfp(x + 402, y + 12, null) + sfp(x + 418, y + 12, null) + r(x + 438, y + 13, 8, 6, 'usb', 1) + r(x + 448, y + 13, 10, 6, 'usb', 1);
  },
  'gate-sr': (x, y, h) => r(x + 2, y + h - 6, FACE - 4, 5, 'tray', 1) + ears(x, y, h, 'ear-tray') + r(x + 110, y + 3, 260, h - 9, 'chassis-2', 3)
    + [0, 1, 2, 3, 4].map((i) => rj(x + 120 + i * 12.4, y + 12, null)).join('') + [0, 1, 2, 3].map((i) => rj(x + 186 + i * 12.4, y + 12, null)).join('')
    + sfp(x + 240, y + 12, null) + sfp(x + 256, y + 12, null) + txt(x + 276, y + 26, 'ZPE', 'brand')
    + `<path d="M${x + 372} ${y + 10}l18 -20M${x + 372} ${y + 22}l22 -14" class="antenna"/>` + txt(x + 322, y + 34, '4G/5G', 'tiny'),

  // ---------- The internet providers' boxes (theirs, on a shared tray) ----------
  ntu: (x, y, h) => {
    let s = r(x + 2, y + h - 6, FACE - 4, 5, 'tray', 1) + ears(x, y, h, 'ear-tray');
    for (const bx of [x + 18, x + 248]) s += r(bx, y + 4, 218, h - 10, 'ntu', 2) + [0, 1, 2, 3].map((i) => rj(bx + 10 + i * 13, y + 12, null)).join('') + sfp(bx + 70, y + 12, null) + sfp(bx + 88, y + 12, null) + led(bx + 118, y + 16) + txt(bx + 136, y + 22, 'PROVIDER', 'tiny-dark');
    return s;
  },

  // ---------- Passive: fibre, copper patch panels, cable managers, blanks ----------
  'fibre-cch': (x, y, h, ctx) => {
    let s = r(x, y, FACE, h, 'chassis') + ears(x, y, h) + r(x + 22, y + 4, FACE - 44, h - 8, 'door', 2);
    [x + 40, x + 250].forEach((px, b) => {
      s += r(px, y + 9, 190, h - 18, 'fpanel', 1);
      for (let i = 0; i < 12; i++) { const n = b * 12 + i + 1, hex = usedOf(ctx, n).hex; s += pt(n, r(px + 8 + i * 15, y + 14, 8, 10, hex ? 'lc-on' : 'lc', 1, fillOf(hex))); }
    });
    return s;
  },
  patch48: (x, y, h, ctx) => {
    let s = r(x, y, FACE, h, 'patch') + ears(x, y, h, 'ear-dark');
    for (let rw = 0; rw < 2; rw++) for (let b = 0; b < 2; b++) {
      const bx = x + 42 + b * (12 * 16.5 + 12), by = y + 14 + rw * 40;
      s += txt(bx, by - 3, String(1 + rw * 24 + b * 12), 'pnum');
      for (let i = 0; i < 12; i++) {
        const n = 1 + rw * 24 + b * 12 + i, hex = usedOf(ctx, n).hex;
        s += pt(n, r(bx + i * 16.5, by, 12.5, 11, 'kjack', 1) + (hex ? r(bx + i * 16.5 + 1.6, by + 1.6, 9.3, 7.8, 'plug', 0.8, fillOf(hex)) + r(bx + i * 16.5 + 4.5, by + 11, 3.5, 8, 'cord', 1, fillOf(hex)) : r(bx + i * 16.5 + 2.5, by + 5, 7.5, 5, 'jack-in', 0.3)));
      }
    }
    return s;
  },
  patch24: (x, y, h, ctx) => {
    let s = r(x, y, FACE, h, 'patch') + ears(x, y, h, 'ear-dark') + txt(x + 42, y + 11, '1', 'pnum') + txt(x + 42 + 12 * 16.2 + 8, y + 11, '13', 'pnum');
    for (let i = 0; i < 24; i++) {
      const jx = x + 42 + i * 16.2 + (i >= 12 ? 8 : 0), hex = usedOf(ctx, i + 1).hex;
      s += pt(i + 1, r(jx, y + 14, 12, 11, 'kjack', 1) + (hex ? r(jx + 1.5, y + 15.5, 9, 8, 'plug', 0.8, fillOf(hex)) + r(jx + 4.2, y + 25, 3.6, 8, 'cord', 1, fillOf(hex)) : r(jx + 2.4, y + 19, 7.2, 5, 'jack-in', 0.3)));
    }
    return s;
  },
  cm: (x, y, h) => { let s = r(x, y, FACE, h, 'cmgr') + ears(x, y, h, 'ear-dark'); const n = 11; for (let i = 0; i < n; i++) s += r(x + 30 + i * (FACE - 60) / (n - 1) - 8, y + 5, 16, h - 10, 'finger', 4); return s; },
  blank: (x, y, h) => r(x, y, FACE, h, 'blankp') + ears(x, y, h, 'ear-dark'),

  // ---------- Power ----------
  'ups-srt': (x, y, h) => {
    let s = r(x, y, FACE, h, 'chassis') + ears(x, y, h) + r(x + 175, y + 16, 110, 52, 'lcd', 3) + txt(x + 230, y + 40, '100%', 'lcd-t', 'middle') + txt(x + 230, y + 56, 'ONLINE', 'lcd-s', 'middle');
    for (const [i, bx] of [x + 300, x + 318, x + 336].entries()) s += circ(bx, y + 42, 5, 'btn-c') + (i === 0 ? led(bx, y + 30, 'led-g', 1.3) : '');
    for (let i = 0; i < 9; i++) s += r(x + 30 + i * 15, y + 12, 8, h - 24, 'vent', 2) + r(x + 360 + i * 11, y + 12, 6, h - 24, 'vent', 2);
    return s + txt(x + 24, y + h - 8, 'APC', 'brand');
  },
  battery: (x, y, h) => { let s = r(x, y, FACE, h, 'chassis') + ears(x, y, h); for (let i = 0; i < 24; i++) s += r(x + 30 + i * 17.6, y + 12, 9, h - 24, 'vent', 2); return s + txt(x + 24, y + h - 8, 'APC', 'brand'); },

  // ---------- A desktop switch on a shelf (the AV switch: Netgear M4250, 210 mm wide). Ports 1 to 9 and the
  // SFP are on the front panel as drawn; port 10 is on the back, so a cable there shows only in the card. ----------
  shelf: (x, y, h, ctx) => {
    let s = r(x + 2, y + h - 6, FACE - 4, 5, 'tray', 1) + ears(x, y, h, 'ear-tray') + r(x + 136, y + 3, 210, h - 9, 'chassis-2', 2);
    for (let n = 1; n <= 9; n++) s += rj(x + 146 + (n - 1) * 13, y + 13, usedOf(ctx, n), { k: n });
    return s + sfp(x + 266, y + 13, null) + led(x + 290, y + 16) + txt(x + 300, y + 20, 'NETGEAR', 'tiny');
  },
  generic: (x, y, h) => r(x, y, FACE, h, 'chassis') + ears(x, y, h) + led(x + 26, y + h / 2),
};

// Which face draws an item: its product's, else one for its kind.
export function faceOf(it, gear) {
  if (gear && FACES[gear.face]) return gear.face;
  return { 'cable-manager': 'cm', blank: 'blank', battery: 'battery', shelf: 'shelf', 'patch-panel': it.ports === 24 ? 'patch24' : 'patch48', ups: 'ups-srt' }[it.kind] ?? 'generic';
}
