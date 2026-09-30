#!/usr/bin/env node
/* Contrast check for the health palette (UI-V2 5.2): every look, light and dark.
   Reads src/styles/looks/*.css, resolves each look and mode the way the browser cascade would
   (selector matching, specificity, source order), then checks WCAG 2.x contrast ratios:
     --h-<state>      fill  >= 3:1   against --bg and --surface
     --h-<state>-ink  words >= 4.5:1 against --bg, --surface and --h-<state>-soft
     --quiet                >= 4.5:1 against --bg and --surface
   It also fails if the prefers-color-scheme dark block and the [data-theme="dark"] block of a look
   give different health tokens. Plain hex only: color-mix() and other functions fail loudly.
   Usage: node tools/contrast-check.mjs [--json]   (exit 1 on any failure) */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOOK_DIR = join(ROOT, 'src/styles/looks');
// The order Shell.astro imports them in, which is the cascade's source order.
const FILES = ['enterprise.css', 'classic.css', 'studio.css', 'drawing.css', 'contrast.css'];
export const STATES = ['fine', 'review', 'fault', 'progress', 'planned', 'off'];
// What the head script in Shell.astro sets on <html> for each look.
export const LOOKS = {
  studio: { look: 'studio' },
  enterprise: { look: 'enterprise' },
  contrast: { look: 'enterprise', contrast: 'high' },
  drawing: { look: 'draw' },
  playful: { look: 'classic' },
};
const FILL_MIN = 3;
const INK_MIN = 4.5;

/* ---------- CSS parsing: just enough for the look files ---------- */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

// Split a block body into top-level items: rules `sel { ... }`, at-rules, and declarations.
function parseBlock(src, media, out, file, order) {
  let i = 0;
  while (i < src.length) {
    // find the next '{' or ';' at depth 0, skipping strings and parentheses
    let j = i, paren = 0, quote = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) { if (c === '\\') j++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '(') paren++;
      else if (c === ')') paren--;
      else if (paren === 0 && (c === '{' || c === ';')) break;
    }
    const head = src.slice(i, j).trim();
    if (j >= src.length) break;
    if (src[j] === ';') { i = j + 1; continue; } // @import and stray declarations
    // matching close brace
    let depth = 1, k = j + 1; quote = null;
    for (; k < src.length && depth > 0; k++) {
      const c = src[k];
      if (quote) { if (c === '\\') k++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    const body = src.slice(j + 1, k - 1);
    if (head.startsWith('@media')) {
      parseBlock(body, head.slice(6).trim(), out, file, order);
    } else if (!head.startsWith('@')) {
      out.push({ file, media, selectors: head.split(',').map((s) => s.trim()), decls: parseDecls(body), order: order.n++ });
    }
    i = k;
  }
}

function parseDecls(body) {
  const decls = [];
  let cur = '', paren = 0, quote = null;
  const flush = () => {
    const m = cur.match(/^\s*(--[\w-]+)\s*:\s*([\s\S]*?)\s*$/);
    if (m) decls.push([m[1], m[2]]);
    cur = '';
  };
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(') paren++;
    if (c === ')') paren--;
    if (c === ';' && paren === 0) { flush(); continue; }
    cur += c;
  }
  flush();
  return decls;
}

export function parseLooks(dir = LOOK_DIR) {
  const rules = [];
  const order = { n: 0 };
  for (const f of FILES) parseBlock(stripComments(readFileSync(join(dir, f), 'utf8')), null, rules, f, order);
  return rules;
}

/* ---------- Selector matching on <html> ---------- */
// Supports what the look files use on :root: [attr], [attr="v"], :not(...). Anything else
// (descendants, classes, pseudo-elements) is not about <html> tokens and never matches.
function matchCompound(sel, attrs) {
  let s = sel.trim();
  if (!s.startsWith(':root')) return null;
  s = s.slice(5);
  let spec = 1;
  while (s.length) {
    let m;
    if ((m = s.match(/^\[([\w-]+)(?:="([^"]*)")?\]/))) {
      const [, name, val] = m;
      const has = Object.prototype.hasOwnProperty.call(attrs, name);
      if (!has || (val !== undefined && attrs[name] !== val)) return null;
      spec++;
      s = s.slice(m[0].length);
    } else if ((m = s.match(/^:not\(\[([\w-]+)(?:="([^"]*)")?\]\)/))) {
      const [, name, val] = m;
      const has = Object.prototype.hasOwnProperty.call(attrs, name);
      if (has && (val === undefined || attrs[name] === val)) return null;
      spec++;
      s = s.slice(m[0].length);
    } else {
      return null;
    }
  }
  return spec;
}

function mediaMatches(media, env) {
  if (media == null) return true;
  const m = media.match(/^\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)$/);
  if (!m) throw new Error(`contrast-check: unsupported @media ${media}`);
  return m[1] === env.scheme;
}

// Cascade: highest specificity wins, then later source order.
export function resolveTokens(rules, attrs, env) {
  const hits = [];
  for (const r of rules) {
    if (!mediaMatches(r.media, env)) continue;
    let best = null;
    for (const sel of r.selectors) {
      const sp = matchCompound(sel, attrs);
      if (sp != null && (best == null || sp > best)) best = sp;
    }
    if (best != null) hits.push({ spec: best, order: r.order, decls: r.decls });
  }
  hits.sort((a, b) => a.spec - b.spec || a.order - b.order);
  const map = {};
  for (const h of hits) for (const [k, v] of h.decls) map[k] = v;
  return map;
}

/* ---------- var() resolution and colour ---------- */
export function resolveValue(map, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`cycle through ${name}`);
  if (!(name in map)) return undefined;
  seen.add(name);
  const out = substitute(map, map[name], seen);
  seen.delete(name);
  return out;
}

function substitute(map, value, seen) {
  let out = '', i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at < 0) { out += value.slice(i); break; }
    out += value.slice(i, at);
    let depth = 1, k = at + 4;
    for (; k < value.length && depth; k++) { if (value[k] === '(') depth++; else if (value[k] === ')') depth--; }
    const inner = value.slice(at + 4, k - 1);
    const comma = inner.indexOf(',');
    const ref = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma < 0 ? undefined : inner.slice(comma + 1).trim();
    let v = resolveValue(map, ref, seen);
    if (v === undefined) {
      if (fallback === undefined) throw new Error(`var(${ref}) is not defined`);
      v = substitute(map, fallback, seen);
    }
    out += v;
    i = k;
  }
  return out.trim();
}

export function parseHex(value) {
  const v = String(value).trim();
  if (/color-mix\(/i.test(v)) throw new Error(`color-mix() is not supported here (use a plain hex): ${v}`);
  const m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) throw new Error(`not a plain opaque hex colour: ${v}`);
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const x = luminance(parseHex(a)), y = luminance(parseHex(b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/* ---------- The check ---------- */
const HEALTH = [...STATES.flatMap((s) => [`--h-${s}`, `--h-${s}-ink`, `--h-${s}-soft`]), '--quiet'];

export function check({ dir = LOOK_DIR } = {}) {
  const rules = parseLooks(dir);
  const rows = [];
  for (const [look, base] of Object.entries(LOOKS)) {
    for (const mode of ['light', 'dark']) {
      const attrs = { 'data-look': base.look };
      if (base.contrast) attrs['data-contrast'] = base.contrast;
      let map;
      if (mode === 'light') {
        map = resolveTokens(rules, { ...attrs, 'data-theme': 'light' }, { scheme: 'light' });
      } else {
        map = resolveTokens(rules, { ...attrs, 'data-theme': 'dark' }, { scheme: 'light' });
        // Auto on a dark system: the media-query block. Its health tokens must match.
        const auto = resolveTokens(rules, attrs, { scheme: 'dark' });
        const safe = (m, t) => { try { return resolveValue(m, t); } catch (e) { return `error (${e.message})`; } };
        for (const t of HEALTH) {
          const a = safe(map, t), b = safe(auto, t);
          if (a !== b) rows.push({ look, mode, token: t, against: 'media dark block', ratio: null, min: null, pass: false, note: `drift: [data-theme="dark"] ${a} vs prefers-color-scheme ${b}` });
        }
      }
      const get = (t) => resolveValue(map, t);
      const test = (token, min, againstNames) => {
        const row = { look, mode, token, against: '', ratio: null, min, pass: false, note: '' };
        try {
          const fg = get(token);
          if (fg === undefined) throw new Error(`${token} is not set`);
          row.value = fg;
          let worst = Infinity, worstName = '';
          for (const an of againstNames) {
            const bg = get(an);
            if (bg === undefined) throw new Error(`${an} is not set`);
            const r = contrast(fg, bg);
            if (r < worst) { worst = r; worstName = an; }
          }
          row.ratio = Math.round(worst * 100) / 100;
          row.against = worstName;
          row.pass = worst >= min;
        } catch (e) {
          row.note = e.message;
        }
        rows.push(row);
      };
      for (const s of STATES) {
        test(`--h-${s}`, FILL_MIN, ['--bg', '--surface']);
        test(`--h-${s}-ink`, INK_MIN, ['--bg', '--surface', `--h-${s}-soft`]);
      }
      test('--quiet', INK_MIN, ['--bg', '--surface']);
    }
  }
  return rows;
}

function printTable(rows) {
  const head = ['look', 'mode', 'token', 'value', 'worst', 'against', 'min', 'result'];
  const body = rows.map((r) => [r.look, r.mode, r.token, r.value ?? '', r.ratio == null ? '-' : r.ratio.toFixed(2), r.against, r.min ?? '', r.pass ? 'pass' : `FAIL${r.note ? ' ' + r.note : ''}`]);
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => String(b[i]).length)));
  const line = (cells) => cells.map((c, i) => (i === cells.length - 1 ? String(c) : String(c).padEnd(w[i]))).join('  ');
  console.log(line(head));
  for (const b of body) console.log(line(b));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let rows;
  try {
    rows = check();
  } catch (e) {
    console.error(`contrast-check: ${e.message}`);
    process.exit(1);
  }
  const failed = rows.filter((r) => !r.pass);
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else {
    printTable(rows);
    console.log(`\n${rows.length - failed.length}/${rows.length} pass` + (failed.length ? `, ${failed.length} fail` : ''));
  }
  process.exit(failed.length ? 1 : 0);
}
