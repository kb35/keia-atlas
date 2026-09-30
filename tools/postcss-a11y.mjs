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

const ON = '[data-motion="reduced"], [data-motion="off"]';
const REDUCE = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i;
const NOPREF = /\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/i;
const SCALE = 'var(--rs-text, 1)';
const TOKEN = /^--(?:g-)?fs-|-size$|^--big-num$/;
const SCALED_TOKEN = /var\(--(?:g-)?fs-|var\(--[a-z0-9-]*-size\s*[,)]|var\(--big-num\s*[,)]/;
const MARK = '__rsA11y';

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
