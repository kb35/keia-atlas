// PostCSS plugin for the accessibility settings (src/lib/a11y.mjs, docs/accessibility.md). Runs on every stylesheet
// Vite builds, the components' <style> blocks included (postcss.config.mjs). Two jobs:
//
// 1. Motion: Reduced and Off in Settings › Accessibility must behave exactly like the device's reduced-motion
//    setting. Every `@media (prefers-reduced-motion: reduce)` block is copied once more outside the media query,
//    with each selector scoped to :root[data-motion="reduced"] or [data-motion="off"] (zero added specificity,
//    right after the original, so the cascade is the same). Every `(prefers-reduced-motion: no-preference)` block
//    is scoped to "not reduced and not off", so the extra motion it adds stays away.
// 2. Text size: the type is written in px, so Larger and Largest scale each font size (and px line heights) by
//    --rs-text (1, 1.15 or 1.3, set on <html> by a11y.css). The type tokens (--fs-*, --g-fs-*, --*-size,
//    --big-num) are scaled where they are defined; a declaration that only reads a token is left alone.
// 3. Icons: anything that sits in a line of text scales with Text size; anything that belongs to a drawing keeps
//    the drawing's scale (docs/rules/looks.md T5). In a rule whose every selector ends on an svg or img, each px
//    size (width, height, their min and max, flex-basis) of at most 48 px is multiplied by --rs-icon, which
//    a11y.css sets with --rs-text. So is a small fixed box that holds letters (a width or height in px of at
//    most 48, and its own font): an avatar's initials, a step's number, a chip of a set height. Larger sizes are pictures, not icons,
//    and are left alone. Two comments in a rule change that: `/* text-size: icon */` scales any other box (an
//    icon button, the frame round an icon, a status dot drawn by CSS), and `/* text-size: drawing */` keeps an
//    svg or a box at its drawn size. A drawing that holds HTML icons (a floor thumbnail's glyphs) sets
//    --rs-icon: 1 on itself instead, so they stay put. A health glyph's small nudge onto its line of text
//    (margin-top: 3px, translateY(2px) on a rule ending in .hg) is scaled with it, so it stays on the line, and
//    so is a grid track sized for an icon or an avatar (a px column of at most 48: `16px minmax(0, 1fr)`), so
//    the grown icon still fits its column.

const ON = '[data-motion="reduced"], [data-motion="off"]';
const REDUCE = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i;
const NOPREF = /\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/i;
const SCALE = 'var(--rs-text, 1)';
const TOKEN = /^--(?:g-)?fs-|-size$|^--big-num$/;
const SCALED_TOKEN = /var\(--(?:g-)?fs-|var\(--[a-z0-9-]*-size\s*[,)]|var\(--big-num\s*[,)]/;
const MARK = '__rsA11y';
const ISCALE = 'var(--rs-icon, 1)';
const ICON_PROP = /^(?:width|height|min-width|min-height|max-width|max-height|flex-basis|inline-size|block-size|min-inline-size|min-block-size)$/;
const ICON_MAX = 48;

/** Scope one selector to the root carrying `cond` (a :where() list), keeping its specificity. */
export function scopeSelector(sel, cond) {
  const s = sel.trim();
  const m = /^(:root|html)(?![\w-])/.exec(s);
  if (m) return `${m[1]}:where(${cond})${s.slice(m[1].length)}`;
  if (s.startsWith('::')) return `:root:where(${cond})${s}`;
  return `:where(:root:is(${cond})) ${s}`;
}

const scopeRule = (rule, cond) => { rule.selectors = rule.selectors.map((s) => scopeSelector(s, cond)); };
const walkRules = (node, fn) => node.walk((n) => { if (n.type === 'rule' && !(n.parent && n.parent.type === 'atrule' && /keyframes$/i.test(n.parent.name))) fn(n); });

/** Split a value at top-level spaces (outside brackets). */
const splitTop = (v, sep) => {
  const out = []; let depth = 0, cur = '';
  for (const ch of v) {
    if (ch === '(') depth++; else if (ch === ')') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (cur || sep !== ' ') out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur || sep !== ' ') out.push(cur);
  return out;
};
const hasLength = (v) => /(\d|\.)(px|rem|vw|vh|vmin|vmax)\b/.test(v);
const scaled = (v) => (/^\d*\.?\d+px$/.test(v) ? `calc(${v} * ${SCALE})` : `calc((${v}) * ${SCALE})`);

/** A font size scaled by the text setting, or null when it should be left as it is. */
export function scaleSize(v) {
  const t = v.trim();
  if (!t || t.includes('--rs-text') || SCALED_TOKEN.test(t) || !hasLength(t)) return null;
  const imp = /\s*!important$/i.exec(t);
  const core = imp ? t.slice(0, imp.index) : t;
  return scaled(core) + (imp ? ' !important' : '');
}

/** The `font` shorthand with its size (and a px line height) scaled, or null. */
export function scaleFont(v) {
  const t = v.trim();
  if (t.includes('--rs-text') || !hasLength(t)) return null;
  const parts = splitTop(t, ' ');
  // The size is the first part that is a length or a length function; a line height may follow it after "/".
  const i = parts.findIndex((p) => /^(\d|\.)/.test(p) ? hasLength(p.split('/')[0]) || /\//.test(p) : /^(calc|clamp|min|max)\(/.test(p));
  if (i < 0) return null;
  const [size, lh] = splitTop(parts[i], '/');
  const s2 = hasLength(size) && !SCALED_TOKEN.test(size) ? scaled(size) : size;
  const lh2 = lh != null && /px\b/.test(lh) ? scaled(lh) : lh;
  if (s2 === size && lh2 === lh) return null;
  parts[i] = lh2 != null ? `${s2}/${lh2}` : s2;
  return parts.join(' ');
}

/** The last compound of a selector (after its last combinator), outside brackets. */
const lastCompound = (sel) => {
  let depth = 0, cut = 0;
  const s = sel.trim();
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[') depth++; else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) cut = i + 1;
  }
  return s.slice(cut).replace(/::?[a-z-]+(\([^)]*\))?$/i, (m) => (/^::/.test(m) ? '' : m));
};
const subject = (sel) => lastCompound(sel.replace(/:(?:global|where|is|not|has)\((?:[^()]|\([^()]*\))*\)/g, (m) => (/^:global\(/.test(m) ? m.slice(8, -1) : '')));
/** True when the selector's subject is an svg or an img (an icon or a small picture). */
export function iconSelector(sel) {
  return /^(?:svg|img)(?![\w-])/i.test(subject(sel));
}
/** True when the selector's subject is a health glyph (.hg, or .hg-m drawn by CSS). */
export const glyphSelector = (sel) => /\.hg(?:-m)?(?![\w-])/.test(subject(sel));
/** A glyph's nudge to sit on its line of text (margin-top: 3px, translateY(2px)), scaled with the glyph. */
export function scaleNudge(v) {
  const t = v.trim();
  if (t.includes('--rs-')) return null;
  const out = t.replace(/(^|[\s(,])(-?\d*\.?\d+px)\b/g, (m, pre, n) => (Math.abs(parseFloat(n)) <= 8 && parseFloat(n) !== 0 ? `${pre}calc(${n} * ${ISCALE})` : m));
  return out === t ? null : out;
}
/** How a rule's px sizes follow Text size: 'icon', 'drawing' or null (its own comment wins, then its selector). */
export function iconMode(rule) {
  const c = (rule.nodes || []).find((n) => n.type === 'comment' && /text-size:\s*(icon|drawing)/.test(n.text));
  if (c) return /icon/.test(c.text) ? 'icon' : 'drawing';
  if (!rule.selectors?.length) return null;
  if (rule.selectors.every(iconSelector)) return 'icon';
  return letterBox(rule) ? 'icon' : null;
}
/** A small fixed box that holds letters (an avatar's initials, a step's number, a chip or a button of a set
    height): a width or a height in px of at most 48, and its own font. Its letters grow with Text size, so the box
    must too, or they spill out or are cut. A plain dot has no font and is left to its rule's comment, since some
    dots sit on a drawn rail. */
function letterBox(rule) {
  let w = null, h = null, type = false;
  for (const n of rule.nodes || []) {
    if (n.type !== 'decl') continue;
    const p = n.prop.toLowerCase(), v = n.value.trim();
    if (p === 'width') w = v; else if (p === 'height') h = v;
    else if (p === 'font' || p === 'font-size') type = true;
  }
  const small = (v) => v != null && /^\d*\.?\d+px$/.test(v) && parseFloat(v) <= ICON_MAX;
  return type && (small(w) || small(h));
}
/** An icon's size scaled by --rs-icon, or null (not px, a picture bigger than 48 px, or already scaled). */
export function scaleIcon(v) {
  const t = v.trim();
  if (!t || t.includes('--rs-') || !/\dpx\b/.test(t) || /%|\b(?:auto|none|fit-content|max-content|min-content)\b/.test(t)) return null;
  const px = [...t.matchAll(/(\d*\.?\d+)px\b/g)].map((m) => +m[1]);
  if (!px.length || Math.max(...px) > ICON_MAX) return null;
  const imp = /\s*!important$/i.exec(t);
  const core = imp ? t.slice(0, imp.index) : t;
  const out = /^\d*\.?\d+px$/.test(core) ? `calc(${core} * ${ISCALE})` : `calc((${core}) * ${ISCALE})`;
  return out + (imp ? ' !important' : '');
}

/** Grid tracks sized for an icon or an avatar (px of at most 48) scaled with it; wider tracks are left alone. */
export function scaleTracks(v) {
  const t = v.trim();
  if (t.includes('--rs-') || /\[/.test(t)) return null;
  const out = t.replace(/(^|[\s(,])(\d*\.?\d+)px(?=$|[\s),])/g, (m, pre, n) => (+n > 0 && +n <= ICON_MAX ? `${pre}calc(${n}px * ${ISCALE})` : m));
  return out === t ? null : out;
}

export default function a11yPlugin() {
  return {
    postcssPlugin: 'rs-a11y',
    Declaration(decl) {
      if (decl[MARK]) return;
      decl[MARK] = true;
      const p = decl.prop.toLowerCase();
      const inKeyframes = decl.parent?.parent?.type === 'atrule' && /keyframes$/i.test(decl.parent.parent.name);
      if (inKeyframes) return;
      let v = null;
      if (p === 'font-size' || p === 'line-height') v = p === 'line-height' && !/px\b/.test(decl.value) ? null : scaleSize(decl.value);
      else if (p === 'font') v = scaleFont(decl.value);
      else if (p.startsWith('--') && TOKEN.test(p)) v = scaleSize(decl.value);
      else if (ICON_PROP.test(p) && decl.parent?.type === 'rule') {
        const rule = decl.parent;
        if (rule.__rsIcon === undefined) rule.__rsIcon = iconMode(rule);   // decided once, before any value changes
        if (rule.__rsIcon === 'icon') v = scaleIcon(decl.value);
      } else if (p === 'grid-template-columns' || p === 'grid-auto-columns') {
        v = scaleTracks(decl.value);
      } else if (/^(?:margin-top|margin-bottom|top|transform|translate)$/.test(p) && decl.parent?.type === 'rule' && decl.parent.selectors?.every(glyphSelector)) {
        v = scaleNudge(decl.value);
      }
      if (v) decl.value = v;
    },
    AtRule: {
      media(at) {
        if (at[MARK]) return;
        at[MARK] = true;
        const params = at.params;
        if (REDUCE.test(params)) {
          const rest = params.replace(REDUCE, '').replace(/^\s*and\s+|\s+and\s*$/gi, '').replace(/\s+and\s+and\s+/gi, ' and ').trim();
          const copy = at.clone();
          copy[MARK] = true;
          copy.walk((n) => { n[MARK] = n.type === 'decl' ? false : true; });
          walkRules(copy, (r) => scopeRule(r, ON));
          if (rest) { copy.params = rest; at.after(copy); }
          else { at.after(copy.nodes.map((n) => n)); }
        } else if (NOPREF.test(params)) {
          walkRules(at, (r) => scopeRule(r, `:not(${ON})`));
        }
      },
    },
  };
}
a11yPlugin.postcss = true;
