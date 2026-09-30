// A spring described by its perceptual duration and bounce (MOTION-V2 section 2, --spring-settle), as a Web
// Animations easing. Bounce 0 is critically damped: it never overshoots, and its one difference from a bezier is
// that a move can be retargeted from wherever it is without a visible restart. No library; browser or build time.
//
//   springCurve({ duration, bounce }, steps)  the curve sampled at even times, 0 to 1
//   springEasing({ duration, bounce })         the same as a CSS linear() easing string
//   settleEasing(fallback)                     linear() where the browser draws it, else the fallback (--ease-settle)
//   retarget(el, to, opts)                     start a new move on `to` from the values the element shows right now

export function springCurve({ duration = 360, bounce = 0 } = {}, steps = 32) {
  const w = 6.6 / duration;                                   // reaches 99% of the way at `duration`
  const zeta = 1 - Math.max(0, Math.min(bounce, 0.9));         // 1 is critically damped
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * duration;
    let y;
    if (zeta >= 1) y = 1 - (1 + w * t) * Math.exp(-w * t);
    else {
      const wd = w * Math.sqrt(1 - zeta * zeta);
      y = 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
    }
    pts.push(Math.round(y * 10000) / 10000);
  }
  pts[steps] = 1;
  return pts;
}

export const springEasing = (o) => `linear(${springCurve(o).join(', ')})`;

export function settleEasing(fallback = 'cubic-bezier(.22, 1, .36, 1)', o = { duration: 360, bounce: 0 }) {
  try {
    if (typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)')) return springEasing(o);
  } catch (_) { /* fall through */ }
  return fallback;
}

// Read what the element shows now (its animated transform and opacity), drop the moves in flight, and start one
// move from there to `to` ({ transform, opacity, transformOrigin }). A move interrupted twice still reads as one.
export function retarget(el, to, opts) {
  const cs = getComputedStyle(el);
  const from = { transform: cs.transform === 'none' ? 'none' : cs.transform, opacity: cs.opacity };
  el.getAnimations().forEach((a) => a.cancel());
  if (to.transformOrigin) el.style.transformOrigin = to.transformOrigin;
  const anim = el.animate([{ transform: from.transform, opacity: from.opacity }, { transform: to.transform, opacity: to.opacity }], { fill: 'forwards', ...opts });
  return anim;
}
