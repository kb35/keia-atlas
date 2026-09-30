// The With chip (UI-V2 §8.5, MOTION-V2 4.17): who has a piece of work, in one pill. WithChip.astro renders it on
// the server with chipHtml(); pages that draw rows in the browser use the same function, and setChip() to change it
// in place. The chip is the one thing that slides between states: the old words and mark slide out to the left, the
// new ones slide in from the right along the same line, and the pill's width eases to fit, on a critically damped
// spring (no bounce). A second change before the first has settled retargets from where the chip is, keeping its
// speed, so two hand-offs in a second read as one motion. Reduced motion: the words swap at once.
//
// chipHtml(chip, opts) is pure (no DOM); setChip() and the spring run only in the browser.
import { chipOf } from './ownership.mjs';
import { spring, springEasing, retarget } from './spring.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Small marks, drawn on a 16 unit box in currentColor.
const MARK = {
  team: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="6" r="2.2"/><circle cx="11" cy="6" r="2.2"/><path d="M1.5 13c.6-2.2 2-3.3 3.5-3.3s2.9 1.1 3.5 3.3M7.5 13c.6-2.2 2-3.3 3.5-3.3s2.9 1.1 3.5 3.3"/></svg>',
  vendor: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="5.5" width="11" height="8" rx="1.2"/><path d="M5.5 5.5V4a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 10.5 4v1.5M2.5 9h11"/></svg>',
  rule: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.8v2.6h-2.6"/></svg>',
  none: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke-dasharray="2.2 2"/></svg>',
};

/** The inner markup of a chip (mark, words, time), the part that slides. */
export function chipInner(c) {
  const m = c.mark ?? { t: 'none' };
  const pause = c.key === 'parked' ? '<i class="wc-pz"></i>' : '';
  const mark = m.t === 'av'
    ? `<span class="wc-m wc-av${m.you ? ' wc-you' : ''}" aria-hidden="true">${esc(m.label)}${pause}</span>`
    : `<span class="wc-m wc-${esc(m.t)}" aria-hidden="true">${MARK[m.t] ?? MARK.none}${pause}</span>`;
  const sub = c.sub ? `<span class="wc-dot" aria-hidden="true">·</span><span class="wc-s">${esc(c.sub)}</span>` : '';
  return `<span class="wc-in">${mark}<span class="wc-t">${esc(c.text)}</span>${sub}</span>`;
}

/** A whole chip as HTML. `history` (lines) fills the hand-off history peek that opens on press. */
export function chipHtml(c, { item = '', history = [], help = 'chip.with', tag = 'button' } = {}) {
  const peek = history.length
    ? `<template data-peek-body><b class="peek-h">Hand-off history</b>${history.map((h) => `<small><span class="wc-h-at">${esc(h.at)}</span> ${esc(h.text)}</small>`).join('')}</template>`
    : '';
  const attrs = `class="wc" data-wc data-wc-key="${esc(c.key)}"${item ? ` data-wc-item="${esc(item)}"` : ''} data-help="${esc(help)}" title="${esc(c.aria)}"`;
  if (tag === 'span') return `<span ${attrs} role="status" aria-label="${esc(c.aria)}">${chipInner(c)}</span>`;
  return `<button type="button" ${attrs}${peek ? ' data-peek' : ''} aria-label="${esc(c.aria)}${peek ? '. Show the hand-off history' : ''}">${chipInner(c)}${peek}</button>`;
}

/** The chip for a record straight from ownership.mjs. */
export const chipFor = (own, viewer, ctx, opts) => chipHtml(chipOf(own, viewer, ctx), opts);

// ---- Browser: change a chip in place --------------------------------------------------------------------------
const cssMs = (name, d) => {
  if (typeof getComputedStyle !== 'function') return d;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(), n = parseFloat(v);
  return Number.isNaN(n) ? d : /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n;
};
const reduced = () => (typeof window !== 'undefined' && window.rsMotion ? window.rsMotion().reduced : typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Change a chip to a new chip model. Slides unless reduced motion; retargets a slide already running. */
export function setChip(el, c, { history, aria } = {}) {
  if (!el) return;
  const same = el.dataset.wcKey === c.key && el.querySelector(':scope > .wc-in:not(.wc-out) .wc-t')?.textContent === c.text && (el.querySelector(':scope > .wc-in:not(.wc-out) .wc-s')?.textContent ?? '') === (c.sub ?? '');
  el.dataset.wcKey = c.key;
  el.title = c.aria;
  el.setAttribute('aria-label', `${aria ?? c.aria}${el.hasAttribute('data-peek') ? '. Show the hand-off history' : ''}`);
  if (history) {
    let t = el.querySelector('template[data-peek-body]');
    if (!t) { t = document.createElement('template'); t.setAttribute('data-peek-body', ''); el.appendChild(t); el.setAttribute('data-peek', ''); }
    t.innerHTML = `<b class="peek-h">Hand-off history</b>${history.map((h) => `<small><span class="wc-h-at">${esc(h.at)}</span> ${esc(h.text)}</small>`).join('')}`;
  }
  if (same) return;
  const cur = el.querySelector(':scope > .wc-in:not(.wc-out)');
  const tmp = document.createElement('span'); tmp.innerHTML = chipInner(c);
  const next = tmp.firstElementChild;
  if (!cur || reduced() || !el.animate) {
    el.querySelectorAll(':scope > .wc-in').forEach((n) => n.remove());
    el.insertBefore(next, el.firstChild);
    el.style.width = '';
    return;
  }
  const dur = cssMs('--dur-chip', 320), exit = cssMs('--dur-exit', 240);
  // Where the width is now, and how fast it is changing: a running slide hands its speed to the next (spring.mjs).
  const now = performance.now(), run = el.__wc;
  let x0 = el.getBoundingClientRect().width, pxSpeed = 0;
  if (run && now - run.t0 < run.s.duration) { const r = retarget(run, now); x0 = run.from + (run.to - run.from) * r.at; pxSpeed = (run.to - run.from) * r.speed; }
  // Measure the new width with the new words in place (and no width animation running).
  el.getAnimations().forEach((a) => { if (a.id === 'wc-w') a.cancel(); });
  el.querySelectorAll(':scope > .wc-in.wc-out').forEach((n) => n.remove());
  const from = getComputedStyle(cur).transform, op = getComputedStyle(cur).opacity;
  cur.getAnimations().forEach((a) => a.cancel());
  cur.classList.add('wc-out');
  el.insertBefore(next, cur);
  el.style.width = '';
  const to = el.getBoundingClientRect().width;
  const dist = to - x0;
  const s = spring({ duration: dur, bounce: 0, velocity: Math.abs(dist) > 0.5 ? pxSpeed / dist : 0 });
  el.__wc = { s, t0: now, from: x0, to };
  // The width: keyframes sampled from the spring, so a retarget keeps its speed.
  const frames = [];
  for (let i = 0; i <= 24; i++) frames.push({ width: `${x0 + dist * s.at((dur * i) / 24)}px` });
  frames[24] = { width: `${to}px` };
  const aw = el.animate(frames, { duration: dur, easing: 'linear' }); aw.id = 'wc-w';
  aw.onfinish = () => { if (el.__wc?.t0 === now) el.__wc = null; };
  // The words: the old ones slide out to the left and fade; the new ones come in from the right.
  const easing = springEasing({ duration: dur, bounce: 0 });
  const shift = Math.max(12, Math.min(28, to * 0.18));
  cur.animate([{ transform: from === 'none' ? 'translateX(0)' : from, opacity: op }, { transform: `translateX(${-shift}px)`, opacity: 0 }], { duration: exit, easing: getComputedStyle(document.documentElement).getPropertyValue('--ease-exit').trim() || 'ease-in', fill: 'forwards' })
    .onfinish = () => cur.remove();
  next.animate([{ transform: `translateX(${shift}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: dur, easing, fill: 'backwards' });
}
