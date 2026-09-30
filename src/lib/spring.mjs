// Zero-bounce springs for scripted moves (MOTION-V2 section 2): zoom, drag, scrub, a chip changing owner.
// A spring with bounce 0 is critically damped: it never overshoots, and a move that is retargeted mid-flight keeps
// its velocity, so two hand-offs in a second read as one motion. Described by its perceptual duration (Apple, WWDC23).
// Web Animations API only; no library. Browser and Node (the maths has no DOM).

const SETTLE = 9.24; // omega * t at which a critically damped spring is within 0.1% of its target (1.47 durations)

// spring({ duration, bounce }) -> { w, settle, at(t), vel(t), easing }. duration in ms; bounce is kept at 0.
export function spring({ duration = 360, bounce = 0 } = {}) {
  if (bounce) throw new Error('Atlas springs never bounce (MOTION-V2 section 1, rule 5)');
  const w = (2 * Math.PI) / duration;
  const at = (t) => 1 - (1 + w * t) * Math.exp(-w * t);
  const vel = (t) => w * w * t * Math.exp(-w * t);
  const settle = Math.round(SETTLE / w);
  const pts = Array.from({ length: 21 }, (_, i) => (i === 20 ? 1 : +at((i / 20) * settle).toFixed(3)));
  return { w, settle, at, vel, easing: `linear(${pts.join(', ')})` };
}

// The value at time t of a critically damped move from x0 (with velocity v0, per ms) to x1.
const pos = (w, x0, x1, v0, t) => x1 + (x0 - x1 + (v0 + w * (x0 - x1)) * t) * Math.exp(-w * t);
const spd = (w, x0, x1, v0, t) => (v0 - w * (v0 + w * (x0 - x1)) * t) * Math.exp(-w * t);

const tf = (v) => `translate(${v.x}px, ${v.y}px) scale(${v.s})`;

// Move an element's transform (x, y in px, s a scale) to `to` on a zero-bounce spring. Called again before it
// settles, it starts from where the element is now, at the speed it is going (retarget). Reduced motion: at once.
// Returns the Animation, or null when nothing moved.
export function springTo(el, to, { duration = 360, reduced = false, from } = {}) {
  const target = { x: 0, y: 0, s: 1, ...to };
  const st = el.__spring;
  if (reduced || !el.animate) { el.__spring = null; el.style.transform = tf(target); return null; }
  const { w, settle } = spring({ duration });
  const now = performance.now();
  let x0 = { x: 0, y: 0, s: 1, ...from }, v0 = { x: 0, y: 0, s: 0 };
  if (st && !from) {
    const t = Math.min(now - st.t0, st.settle);
    for (const k of ['x', 'y', 's']) { x0[k] = pos(st.w, st.x0[k], st.x1[k], st.v0[k], t); v0[k] = spd(st.w, st.x0[k], st.x1[k], st.v0[k], t); }
    st.anim.cancel();
  }
  const frames = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * settle, v = {};
    for (const k of ['x', 'y', 's']) v[k] = +pos(w, x0[k], target[k], v0[k], t).toFixed(3);
    frames.push({ transform: tf(i === 24 ? target : v) });
  }
  el.style.willChange = 'transform';
  const anim = el.animate(frames, { duration: settle, easing: 'linear', fill: 'forwards' });
  el.__spring = { t0: now, w, settle, x0, x1: target, v0, anim };
  anim.onfinish = () => { if (el.__spring?.anim === anim) { el.__spring = null; el.style.willChange = ''; } };
  return anim;
}
