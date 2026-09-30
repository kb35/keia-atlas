// Keia Atlas v11: the mark's motion (ported from the signed-off v11 runtime.js). The still mark is drawn on the server
// by src/components/BrandMark.astro; this binds to every svg[data-keia-mark] and redraws it for the angle it is at.
//   enter   once per visit (the first page): spins up, turns 135°, settles, then the ring closes
//   leave   kept for the docs and the review page; not played on ordinary page changes (too busy)
//   loading only while a navigation is genuinely slow (past ~900 ms): eases into a turntable, and eases out to rest when the page lands
//   hover   a small turn, and it settles back
//   idle    still. Nothing loops unless something is loading.
// Reduced motion, Motion Off and Keep things still (window.rsReducedNow, html[data-still="on"]) all mean a still mark.
import { SHAPES, REST, MOTION, EASE, bezier, frame, ringXY, rampP, rampV, stopP, planStop } from './brand-geom.mjs';

const W = typeof window !== 'undefined' ? window : null;
const reduced = () => {
  if (!W) return true;
  if (document.documentElement.getAttribute('data-still') === 'on') return true;
  if (typeof W.rsReducedNow === 'function') return !!W.rsReducedNow();
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
};
// Motion check (tools/motion-check.mjs) counts scripted moves that ask for time; the mark reports its own here.
const note = (ms, what) => { if (W && Array.isArray(W.__rsAnims)) W.__rsAnims.push({ d: Math.round(ms), el: 'svg.kam', at: `brand-mark ${what}` }); };

const EZ = Object.fromEntries(Object.entries(EASE).map(([k, v]) => [k, bezier(...v)]));
const live = new Set();
let raf = 0;
function tick(now) {
  raf = 0;
  for (const m of live) m.step(now);
  if (live.size) raf = requestAnimationFrame(tick);
}
const wake = (m) => { live.add(m); if (!raf) raf = requestAnimationFrame(tick); };

export class KeiaMark {
  constructor(svg) {
    this.el = svg;
    this.S = SHAPES[svg.getAttribute('data-shape')] || SHAPES.v11;
    const q = (s) => svg.querySelector(s);
    this.e = { g: q('.kg'), s: q('.ks'), t: q('.kt'), b: q('.kb'), rg: svg.querySelectorAll('.krg'), re: svg.querySelectorAll('.kre') };
    this.st = { phi: 0, ringOff: 0, ring: 1, op: 1, sc: 1 };
    this.tw = {}; this.spin = null; this.stop = null; this.hovering = false;
    if (svg.hasAttribute('data-hover')) {
      const host = svg.closest('a') || svg;
      host.addEventListener('pointerenter', () => this.hover(true));
      host.addEventListener('pointerleave', () => this.hover(false));
    }
  }
  draw() {
    const s = this.st, F = frame(this.S, REST + s.phi, { ringDeg: REST + s.phi - s.ringOff });
    this.e.s.setAttribute('d', F.side); this.e.t.setAttribute('d', F.top); this.e.g.setAttribute('d', F.top);
    const T = ringXY(F.ring), p = Math.max(0, Math.min(1, s.ring));
    this.e.rg.forEach((g) => g.setAttribute('transform', T));
    this.e.re.forEach((el) => {
      if (p >= 1) { el.removeAttribute('stroke-dasharray'); el.removeAttribute('opacity'); }
      else { el.setAttribute('stroke-dasharray', `${(p * 100).toFixed(2)} 200`); el.setAttribute('opacity', Math.min(1, p / 0.06).toFixed(3)); }
    });
    if (s.op >= 1) this.e.b.removeAttribute('opacity'); else this.e.b.setAttribute('opacity', s.op.toFixed(3));
    if (s.sc === 1) this.e.b.removeAttribute('transform');
    else this.e.b.setAttribute('transform', `translate(24 24) scale(${s.sc.toFixed(4)}) translate(-24 -24)`);
  }
  to(k, v, dur, ease = 'settle', delay = 0) {
    this.tw[k] = { from: this.st[k], to: v, t0: performance.now() + delay, dur, ez: EZ[ease] };
    wake(this);
  }
  step(now) {
    if (reduced()) { live.delete(this); return this.still(); }
    const s = this.st; let active = false;
    for (const [k, w] of Object.entries(this.tw)) {
      const u = (now - w.t0) / w.dur;
      if (u < 0) { active = true; continue; }
      s[k] = w.from + (w.to - w.from) * w.ez(Math.min(1, u));
      if (u >= 1) { delete this.tw[k]; if (w.then) w.then(); } else active = true;
    }
    if (this.spin) {
      const L = MOTION.loading, u = (now - this.spin.t0) / L.ramp;
      s.phi = this.spin.phi0 + L.speed * (L.ramp / 1000) * rampP(u);
      this.spin.v = L.speed * rampV(u); active = true;
    }
    if (this.stop) {
      const u = (now - this.stop.t0) / this.stop.T;
      s.phi = this.stop.phi0 + this.stop.delta * stopP(Math.min(1, u), this.stop.m); active = true;
      if (u >= 1) { s.phi -= this.stop.target; s.ringOff = 0; this.stop = null; }
    }
    this.draw();
    if (!active && !Object.keys(this.tw).length) live.delete(this);
  }
  still() {
    this.tw = {}; this.spin = this.stop = null; this.hovering = false;
    Object.assign(this.st, { phi: 0, ringOff: 0, ring: 1, op: 1, sc: 1 }); this.draw();
  }
  enter() {
    if (reduced()) return this.still();
    const E = MOTION.enter;
    this.tw = {}; this.spin = this.stop = null; this.hovering = false;
    Object.assign(this.st, { phi: -E.turn, ringOff: 0, ring: 0, op: 0, sc: E.from });
    this.draw();
    this.to('phi', 0, E.dur, 'spinIn'); this.to('op', 1, E.fade, 'settle'); this.to('sc', 1, E.dur * 0.7, 'settle');
    this.to('ring', 1, E.ringDur, 'settle', E.ringAt);
    note(E.ringAt + E.ringDur, 'enter');
  }
  leave() {
    if (reduced()) return this.still();
    const L = MOTION.leave;
    this.spin = this.stop = null; this.hovering = false;
    this.to('phi', this.st.phi + L.turn, L.dur, 'exit'); this.to('op', 0, L.dur, 'exit'); this.to('sc', L.to, L.dur, 'exit');
    note(L.dur, 'leave');
  }
  load() {
    if (reduced() || this.spin) return;
    this.stop = null; delete this.tw.phi;
    this.spin = { t0: performance.now(), phi0: this.st.phi, v: 0 };
    this.to('ring', 0, MOTION.loading.ringOut, 'exit');
    this.to('op', 1, 300, 'settle'); this.to('sc', MOTION.leave.to, MOTION.leave.dur, 'settle');
    note(MOTION.loading.ramp, 'loading');
    wake(this);
  }
  done() {
    if (reduced()) return this.still();
    if (!this.spin) { if (this.st.ring < 1) this.to('ring', 1, MOTION.loading.ringDur, 'settle'); return; }
    const L = MOTION.loading, v = this.spin.v, phi = this.st.phi, p = planStop(v, phi);
    this.spin = null;
    this.stop = { t0: performance.now(), phi0: phi, ...p };
    this.st.ringOff = p.target;
    this.to('ring', 1, L.ringDur, 'settle', p.T * L.ringAt);
    this.to('sc', 1, p.T, 'settle'); this.to('op', 1, 300, 'settle');
    note(p.T, 'loaded');
    wake(this);
  }
  hover(on) {
    if (reduced() || this.spin || this.stop || this.st.ring < 1 || this.st.op < 1 || (this.tw.phi && !this.hovering)) return;
    this.hovering = on;
    const H = MOTION.hover;
    this.to('phi', on ? H.turn : 0, on ? H.in : H.out, 'settle');
    this.tw.phi.then = () => { if (!on) this.hovering = false; };
    note(on ? H.in : H.out, 'hover');
  }
}

// Wiring: one KeiaMark per svg (kept on the element, so a mark that persists across view transitions keeps its state).
const marks = () => [...document.querySelectorAll('svg[data-keia-mark]')].map((el) => el.__km || (el.__km = new KeiaMark(el)));
// Calm by default (Keith, 30 Sept): no spin on every click. The mark arrives once per visit, and turns only when a page
// is genuinely slow to arrive; ordinary page changes leave it still.
const LOAD_AFTER = 900;
let pending = 0, navigating = false;

if (W && !W.__rsBrandMark) {
  W.__rsBrandMark = true;
  document.addEventListener('astro:before-preparation', () => {
    navigating = true;
    clearTimeout(pending);
    pending = setTimeout(() => { if (navigating) marks().forEach((m) => m.load()); }, LOAD_AFTER);
  });
  const land = () => {
    clearTimeout(pending); navigating = false;
    let first = false;
    try { first = !sessionStorage.getItem('rs-brand-entered'); sessionStorage.setItem('rs-brand-entered', '1'); } catch (_) {}
    marks().forEach((m) => { if (m.spin) m.done(); else if (first) m.enter(); });
  };
  document.addEventListener('astro:page-load', land);
  // Keep things still, or motion switched off mid-page: settle every mark to its still frame at once.
  const calm = () => { if (reduced()) marks().forEach((m) => m.still()); };
  document.addEventListener('rs:a11y', calm);
  new MutationObserver(calm).observe(document.documentElement, { attributes: true, attributeFilter: ['data-still', 'data-motion'] });
}
