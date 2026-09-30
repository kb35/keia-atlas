// A small QR code encoder for the room guide's table cards (no dependency). Byte mode, error correction
// level M (about 15% of the code can be damaged and it still reads), versions 1 to 10 (up to 213 bytes,
// plenty for a link). It follows the QR standard (ISO/IEC 18004) the way Project Nayuki's reference
// encoder lays it out, which is where the helper names come from. Pure: runs at build time and in tests.
//
//   qrMatrix(text)  -> { version, size, mask, dark(x, y) }   size = 17 + 4 * version modules
//   qrPath(text)    -> { size, d }                            an SVG path, one unit a module, 4-module quiet zone

const ECC_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];   // error correction codewords per block, by version
const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];          // blocks, by version
const MAX_VERSION = 10;

// Codewords a version holds in all (data and error correction together).
function rawCodewords(ver) {
  let bits = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    bits -= (25 * n - 10) * n - 55;
    if (ver >= 7) bits -= 36;
  }
  return Math.floor(bits / 8);
}
const dataCodewords = (ver) => rawCodewords(ver) - ECC_M[ver] * BLOCKS_M[ver];

// ---- Reed-Solomon over GF(256), polynomial 0x11D --------------------------------------------------
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < degree) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}
function rsRemainder(data, divisor) {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}

// ---- The data: mode, count, bytes, terminator and padding, then blocks with their error correction ----
function codewords(bytes, ver) {
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  const nBlocks = BLOCKS_M[ver], eccLen = ECC_M[ver], raw = rawCodewords(ver);
  const nShort = nBlocks - (raw % nBlocks), shortLen = Math.floor(raw / nBlocks);
  const div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) out.push(b[i]); });
  }
  return out;
}

function alignmentPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// A penalty in the spirit of the standard (runs, 2 by 2 blocks, finder-like runs, balance): the lowest
// scoring mask is used. Any mask is valid; this only picks the one that reads most easily.
function penalty(m, size) {
  let p = 0;
  const line = (get) => {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b <= size; b++) {
        if (b < size && get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      for (let b = 0; b + 10 < size; b++) {
        const s = Array.from({ length: 11 }, (_, i) => (get(a, b + i) ? 1 : 0)).join('');
        if (s === '10111010000' || s === '00001011101') p += 40;
      }
    }
  };
  line((y, x) => m[y][x]);
  line((x, y) => m[y][x]);
  let dark = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (m[y][x]) dark++;
    if (x + 1 < size && y + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
  }
  p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return p;
}

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let ver = 1;
  while (ver <= MAX_VERSION && dataCodewords(ver) * 8 < 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8) ver++;
  if (ver > MAX_VERSION) throw new Error(`Too long for a QR code here: ${bytes.length} bytes`);
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };

  // Function patterns: timing, finders, alignment, then the format and version areas.
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = alignmentPositions(ver), last = al.length - 1;
  al.forEach((ay, i) => al.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = (mask) => {
    const data = (0 << 3) | mask;   // level M is 00
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const b = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, b(i));
    set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i));
    set(8, size - 8, true);
  };
  format(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(a, b, dark); set(b, a, dark);
    }
  }

  // The data, in the zigzag from the bottom right, two columns at a time, skipping the timing column.
  const cw = codewords(bytes, ver);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && i < cw.length * 8) { mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }

  // Try the eight masks; keep the one with the lowest penalty.
  const apply = (k) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) mod[y][x] = !mod[y][x]; };
  let best = 0, bestP = Infinity;
  for (let k = 0; k < 8; k++) {
    apply(k); format(k);
    const p = penalty(mod, size);
    if (p < bestP) { bestP = p; best = k; }
    apply(k);
  }
  apply(best); format(best);
  return { version: ver, size, mask: best, dark: (x, y) => mod[y][x] };
}

// The code as one SVG path: a row's dark modules joined into runs. The view box includes the quiet zone.
export function qrPath(text, quiet = 4) {
  const q = qrMatrix(text);
  let d = '';
  for (let y = 0; y < q.size; y++) {
    for (let x = 0; x < q.size; x++) {
      if (!q.dark(x, y)) continue;
      let run = 1;
      while (x + run < q.size && q.dark(x + run, y)) run++;
      d += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
      x += run - 1;
    }
  }
  return { size: q.size + quiet * 2, d, version: q.version };
}
