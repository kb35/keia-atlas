// Arrival for the record blocks added with the overlooked items (warranty, on call, circuits, the comms room's power
// and temperature, repeat faults, accessibility, cable tests, platforms, office hours). Every move is the motion
// library's (src/lib/motion-library.js), each once:
//
//   [data-settle]  a block below the fold settles in as it first scrolls into view (km-settle, wired site-wide by
//                  src/lib/motion-wire.js)
//   [data-chart]   a trend strip draws in the first time it is seen (km-draw-in, wired site-wide)
//   .rs-tick       a block's figure ticks into place the first time it is in view (km-tick, rising in). This is the
//                  one piece wired here: the site-wide watcher ticks a figure when it changes, and these tick as
//                  they arrive. The value never counts through others (M9).
//
// The markup is the end state. Reduced motion (km.still()) does nothing, so the page shows the final state at once.
// Scrolling back never replays anything.
import km from './motion-library.js';

/** Tick every figure in `root` that has not ticked yet, once, as it comes into view. Safe to call again. */
export function arrive(root = document) {
  const els = [...root.querySelectorAll('.rs-tick:not([data-ticked])')];
  els.forEach((el) => el.setAttribute('data-ticked', ''));
  if (!els.length || km.still() || !('IntersectionObserver' in window)) return;
  let n = 0;
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    io.unobserve(e.target);
    const el = e.target, delay = Math.min(n++, 12) * km.t.stagger;
    // A beat apart, never more than twelve: the stagger of M13.
    if (delay) setTimeout(() => km.tick(el, ''), delay); else km.tick(el, '');
  }), { threshold: 0.5 });
  els.forEach((el) => io.observe(el));
}

/** For markup a script drew after the page arrived: tick its figures and draw in its strips, once each. */
export function arriveDrawn(root) {
  arrive(root);
  if (km.still() || !('IntersectionObserver' in window)) return;
  const charts = [...root.querySelectorAll('svg[data-chart]:not([data-drawn])')];
  charts.forEach((c) => c.setAttribute('data-drawn', ''));
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); km.drawIn(e.target); } }), { threshold: 0.3 });
  charts.forEach((c) => io.observe(c));
}
