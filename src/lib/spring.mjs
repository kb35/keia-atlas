// Springs for scripted moves (MOTION-V2 §2): the zoom, drags, scrubs and a chip that changes twice.
// A spring described by a duration and zero bounce is a critically damped curve: it never overshoots, and
// it can be retargeted mid-flight from where it is, at the speed it is going, so an interrupted move still
// reads as one motion. No library: the curve becomes a CSS `linear()` easing for the Web Animations API
// and for View Transitions (the Shell writes `--ease-spring` from springEasing at build time).
//
//   spring({ duration, bounce, velocity })  progress p(t) from 0 to 1 over `duration` ms, and its speed
//   springEasing(opts)                       the same curve as a `linear()` easing string
//   retarget(state, now)                     where a running spring is and how fast, to start the next from
//
// `duration` is when the move is done (within a thousandth), so it is the token's value (--dur-zoom 360).
// `velocity` is the starting speed in progress per millisecond, from retarget(). Plain JavaScript, no imports.

const SETTLE = 9.23; // ω·t at which a critically damped spring is within 0.1% of its target

export function spring({ duration = 360, bounce = 0, velocity = 0 } = {}) {
  const d = Math.max(1, duration);
  const b = Math.min(Math.max(bounce, 0), 0.9);
  const w = SETTLE / d;          // natural frequency, per ms
  const z = 1 - b;               // damping ratio: 1 is critically damped (no bounce)
  const v0 = -velocity;          // the offset's starting slope (the offset runs from 1 to 0)
  let offset, slope;
  if (z >= 1) {
    offset = (t) => (1 + (w + v0) * t) * Math.exp(-w * t);
    slope = (t) => (v0 - (w + v0) * w * t) * Math.exp(-w * t);
  } else {
    const wd = w * Math.sqrt(1 - z * z), B = (v0 + z * w) / wd;
    offset = (t) => Math.exp(-z * w * t) * (Math.cos(wd * t) + B * Math.sin(wd * t));
    slope = (t) => Math.exp(-z * w * t) * ((B * wd - z * w) * Math.cos(wd * t) - (wd + z * w * B) * Math.sin(wd * t));
  }
  return {
    duration: d,
    at: (t) => (t >= d ? 1 : 1 - offset(Math.max(0, t))),
    speed: (t) => (t >= d ? 0 : -slope(Math.max(0, t))),
  };
}

export function springEasing(opts = {}, steps = 24) {
  const s = spring(opts), pts = [];
  for (let i = 0; i <= steps; i++) pts.push(+s.at((s.duration * i) / steps).toFixed(4));
  pts[pts.length - 1] = 1;
  return `linear(${pts.join(', ')})`;
}

// A running move: { s: spring(...), t0: its start time }. Returns its progress and speed at `now`, so the next
// move can start from there (the caller converts both to the new distance).
export function retarget(state, now) {
  if (!state || !state.s) return { at: 1, speed: 0 };
  const t = now - state.t0;
  return { at: state.s.at(t), speed: state.s.speed(t) };
}
