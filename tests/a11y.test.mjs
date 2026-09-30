// Accessibility settings (docs/accessibility.md): they reach <html> before first paint, Motion Off stops every
// transition and scripted animation, Reduced and Off reuse every reduced-motion rule, and text size scales the type.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import postcss from 'postcss';
import { A11Y_BOOT, A11Y_KEY, readA11y, a11yAttrs, DEFAULTS } from '../src/lib/a11y.mjs';
import a11yPlugin, { scopeSelector, scaleSize, scaleFont } from '../tools/postcss-a11y.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// A small stand-in for the browser: <html> with attributes, localStorage, and Element.prototype.animate.
function fakePage(saved, { reduce = false } = {}) {
  const attrs = new Map();
  const html = { getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: (k) => attrs.delete(k) };
  const store = new Map(saved == null ? [] : [[A11Y_KEY, typeof saved === 'string' ? saved : JSON.stringify(saved)]]);
  const calls = [];
  class Element {}
  Element.prototype.animate = function (frames, opts) { calls.push(opts); return { opts }; };
  const listeners = {};
  const document = { documentElement: html, addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, dispatchEvent: (e) => (listeners[e.type] || []).forEach((f) => f(e)) };
  const window = { Element, document };
  const ctx = {
    window, document, Element, Object, JSON,
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
    matchMedia: (q) => ({ matches: reduce && /prefers-reduced-motion: reduce/.test(q) }),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  };
  window.window = window;
  // The boot script reads W = window; make the context's globals the same object.
  Object.assign(window, ctx);
  vm.createContext(window);
  vm.runInContext(A11Y_BOOT, window);
  return { attrs, store, window, calls, listeners };
}

test('a saved record always reads as a complete, valid set of settings', () => {
  assert.deepEqual(readA11y(null), DEFAULTS);
  assert.deepEqual(readA11y('not json'), DEFAULTS);
  assert.deepEqual(readA11y({ motion: 'fast', text: 'huge', outlines: 'yes' }), DEFAULTS);
  assert.deepEqual(readA11y('{"motion":"off","text":"largest","words":true}'), { ...DEFAULTS, motion: 'off', text: 'largest', words: true });
  assert.deepEqual(a11yAttrs(DEFAULTS), { 'data-motion': null, 'data-text': null, 'data-outlines': null, 'data-links': null, 'data-status-words': null, 'data-still': null });
});

test('the boot script puts the saved settings on <html> as it runs, before anything paints', () => {
  const { attrs } = fakePage({ motion: 'off', text: 'larger', outlines: true, links: true, words: true, still: true });
  assert.deepEqual(Object.fromEntries(attrs), { 'data-motion': 'off', 'data-text': 'larger', 'data-outlines': 'strong', 'data-links': 'underline', 'data-status-words': 'on', 'data-still': 'on' });
  const none = fakePage(null);
  assert.equal(none.attrs.size, 0, 'the defaults add nothing');
});

test('a change applies at once, is saved, can be undone, and survives a page change', () => {
  const { attrs, store, window, listeners } = fakePage(null);
  let heard = null;
  window.document.addEventListener('rs:a11y', (e) => { heard = e.detail; });
  window.rsSetA11y({ motion: 'reduced', words: true });
  assert.equal(attrs.get('data-motion'), 'reduced');
  assert.equal(attrs.get('data-status-words'), 'on');
  assert.equal(JSON.parse(store.get(A11Y_KEY)).motion, 'reduced');
  assert.equal(heard.words, true);
  assert.equal(window.rsReduced(), true);
  // The client router swaps in the next page's <html> attributes; the hook puts the settings back.
  attrs.clear();
  listeners['astro:after-swap'].forEach((f) => f());
  assert.equal(attrs.get('data-motion'), 'reduced');
  window.rsSetA11y({ motion: 'system', words: false });
  assert.equal(attrs.has('data-motion'), false);
  assert.equal(attrs.has('data-status-words'), false);
  assert.equal(window.rsReduced(), false);
  assert.equal(fakePage(null, { reduce: true }).window.rsReduced(), true, 'Follow my device follows the device');
});

test('every layout inlines the boot script in <head>, ahead of its stylesheets and the client router', () => {
  for (const f of ['src/layouts/Shell.astro', 'src/layouts/Front.astro', 'src/layouts/Guide.astro']) {
    const src = read(f);
    const head = src.slice(src.indexOf('<head>'), src.indexOf('</head>'));
    const at = head.indexOf('set:html={A11Y_BOOT}');
    assert.ok(at > 0, `${f}: the boot script is in <head>`);
    assert.match(head.slice(head.lastIndexOf('<script', at), at), /is:inline/, `${f}: inline, so it runs before first paint`);
    assert.ok(at < head.indexOf('<ClientRouter'), `${f}: before the client router`);
    assert.ok(!/<link rel="stylesheet"/.test(head.slice(0, at)), `${f}: no stylesheet before it`);
    assert.match(src, /import '\.\.\/styles\/a11y\.css'/, `${f}: loads a11y.css`);
    assert.match(src, /class="skip-link" href="#main"/, `${f}: has a skip link that shows on focus`);
  }
});

test('Motion Off: no CSS transition or animation runs, and scripted animations finish at once at their end', () => {
  const css = read('src/styles/a11y.css');
  const off = css.slice(css.indexOf(':root[data-motion="off"] *'));
  const rule = off.slice(0, off.indexOf('}'));
  for (const p of ['transition-duration: .01ms !important', 'transition-delay: 0s !important', 'animation-duration: .01ms !important', 'animation-delay: 0s !important', 'animation-iteration-count: 1 !important']) assert.ok(rule.includes(p), p);
  assert.match(css, /:root\[data-motion="off"\]::view-transition-group\(\*\)[^{]*\{ animation: none !important; \}/);
  for (const t of ['--dur-state', '--dur-morph', '--dur-zoom', '--dur-page', '--stagger', '--spring-settle']) assert.match(css, new RegExp(`${t}: 0ms`), `${t} is zero under Off`);

  const { window, calls } = fakePage({ motion: 'off' });
  const el = new window.Element();
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 440, delay: 24, iterations: Infinity, easing: 'ease' });
  el.animate([{ opacity: 0 }, { opacity: 1 }], 300);
  assert.deepEqual(calls.map((o) => [o.duration, o.delay, o.iterations]), [[0, 0, 1], [0, 0, 1]]);
  assert.equal(calls[0].easing, 'ease', 'the rest of the options are kept');
  window.rsSetA11y({ motion: 'system' });
  el.animate([], { duration: 440 });
  assert.equal(calls.at(-1).duration, 440, 'motion comes back when Off is switched off');
});

test('Reduced and Off reuse every reduced-motion rule, scoped to the root, with no extra specificity', async () => {
  assert.equal(scopeSelector('.hg svg', 'X'), ':where(:root:is(X)) .hg svg');
  assert.equal(scopeSelector(':root[data-look="draw"] .x', 'X'), ':root:where(X)[data-look="draw"] .x');
  assert.equal(scopeSelector('html', 'X'), 'html:where(X)');
  assert.equal(scopeSelector('::view-transition-old(*)', 'X'), ':root:where(X)::view-transition-old(*)');
  const src = '@media (prefers-reduced-motion: reduce) { .a { transition: none; } }\n@media (prefers-reduced-motion: reduce) and (max-width: 600px) { .b { animation: none; } }\n@media (prefers-reduced-motion: no-preference) { .c { transition: x; } }';
  const out = (await postcss([a11yPlugin()]).process(src, { from: undefined })).css;
  assert.match(out, /@media \(prefers-reduced-motion: reduce\) \{ \.a \{ transition: none; \} \}/, 'the device rule stays');
  assert.match(out, /:where\(:root:is\(\[data-motion="reduced"\], \[data-motion="off"\]\)\) \.a \{ transition: none; \}/, 'and applies to Reduced and Off');
  assert.match(out, /@media \(max-width: 600px\)\s*\{ :where\(:root:is\(\[data-motion="reduced"\], \[data-motion="off"\]\)\) \.b/, 'a combined query keeps its other half');
  assert.match(out, /:where\(:root:is\(:not\(\[data-motion="reduced"\], \[data-motion="off"\]\)\)\) \.c/, 'extra motion stays away under Reduced and Off');
  // The real motion.css: page transitions and glyph moves stop under Reduced and Off.
  const motion = (await postcss([a11yPlugin()]).process(read('src/styles/motion.css'), { from: undefined })).css;
  assert.match(motion, /:root:where\(\[data-motion="reduced"\], \[data-motion="off"\]\)::view-transition-group\(\*\)/);
  assert.match(motion, /:where\(:root:is\(\[data-motion="reduced"\], \[data-motion="off"\]\)\) \.m-enter/);
});

test('text size scales px type and px line heights, and never scales a token twice', () => {
  assert.equal(scaleSize('13px'), 'calc(13px * var(--rs-text, 1))');
  assert.equal(scaleSize('clamp(26px, 2.6vw, 32px)'), 'calc((clamp(26px, 2.6vw, 32px)) * var(--rs-text, 1))');
  assert.equal(scaleSize('var(--fs-body)'), null);
  assert.equal(scaleSize('var(--support-size, 13px)'), null, 'the token is scaled where it is defined');
  assert.equal(scaleSize('1.2em'), null);
  assert.equal(scaleSize('inherit'), null);
  assert.equal(scaleFont('600 11px/1.3 var(--font-sans)'), '600 calc(11px * var(--rs-text, 1))/1.3 var(--font-sans)');
  assert.equal(scaleFont('500 12px/18px Inter'), '500 calc(12px * var(--rs-text, 1))/calc(18px * var(--rs-text, 1)) Inter');
  assert.equal(scaleFont('600 var(--fs-body)/1.4 var(--font-sans)'), null);
  assert.equal(scaleFont('inherit'), null);
  const css = read('src/styles/a11y.css');
  assert.match(css, /:root\[data-text="larger"\] \{ --rs-text: 1\.15; \}/);
  assert.match(css, /:root\[data-text="largest"\] \{ --rs-text: 1\.3; \}/);
});

test('the front door: every loop has pause and play, and nothing plays under reduced motion', () => {
  const loop = read('src/lib/front-loop.mjs');
  assert.match(loop, /if \(m\.reduced \|\| !stage\) return/, 'no loop under reduced motion');
  assert.match(loop, /pauseButton\(/);
  assert.ok(!/Play again/.test(read('src/components/front/HeroZoom.astro')), 'no "Play again" button');
  for (const f of ['Plan', 'Deliver', 'Maintain', 'FixIt', 'Improve', 'Different']) {
    const src = read(`src/components/front/${f}.astro`);
    assert.match(src, /loop\([^)]*[\s\S]*?finish/, `${f}: the loop can show its finished frame (Keep things still)`);
    assert.ok(!/timers\.push\(window\.setTimeout/.test(src), `${f}: its timers pause with the picture`);
  }
  assert.match(read('src/components/front/HeroZoom.astro'), /pauseButton\(stage/);
  assert.match(read('src/layouts/Front.astro'), /data-still-toggle/, 'the footer has Pause animations');
});

test('a paused clock holds its timers and carries on with the time that was left', async () => {
  globalThis.window ??= globalThis;
  const { clock } = await import('../src/lib/front-loop.mjs');
  const c = clock(); const fired = [];
  c.later(40, () => fired.push('a'));
  c.pause();
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(fired, [], 'nothing fires while paused');
  c.resume();
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(fired, ['a']);
  const t = c.later(10, () => fired.push('b')); c.cancel(t);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(fired, ['a']);
});
