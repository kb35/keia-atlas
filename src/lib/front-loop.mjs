// The front door's loops (Keith, 30 Sept 2026: no "Play again" buttons; every moving picture runs on its own).
// One shape for every stage: play the sequence, which eases into its final frame on its own tokens; hold that
// frame for a calm pause; then a short cross-fade (never a jump) back to the first frame, and again. The loop
// pauses while the stage is off screen and while the tab is hidden, so nothing burns CPU unseen; and each stage
// waits its own random extra beat before restarting, so the loops never fall into step with each other.
// Reduced motion: no loop at all. The caller draws the finished frame and this returns a no-op.
//
//   loop(stage, { play, reset, hold, jitter })
//     play()   starts the sequence and returns the ms until its final frame is in place
//     reset()  puts the stage back to its first frame at once (called while the stage is faded out and marked
//              .fd-resetting, under which the page's CSS turns every transition off, so nothing plays backwards)
//     hold     how long the finished frame stays (default 3200 ms), plus up to `jitter` ms (default 900)
//   returns { stop(), pause(ms) }: stop the loop for good (a visitor took over), or yield to a visitor for `ms`
//   (default 8 s) of idleness, after which the loop carries on from wherever the stage is (play() runs from there)
import { motion } from './motion-read.mjs';

export function loop(stage, { play, reset, hold = 3200, jitter = 900 } = {}) {
  const m = motion();
  if (m.reduced || !stage) return { stop() {}, pause() {} };
  let visible = false, timer = 0, stopped = false, running = false, until = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = 0; } };
  const schedule = (ms, fn) => { clear(); timer = window.setTimeout(fn, ms); };
  const paused = () => stopped || !visible || document.hidden || !stage.isConnected || Date.now() < until;
  const restart = () => {
    if (paused()) { running = false; return; }
    const out = stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: m.exit, easing: m.exitEase, fill: 'forwards' });
    out.onfinish = () => {
      stage.classList.add('fd-resetting');
      reset();
      void stage.offsetWidth;
      stage.classList.remove('fd-resetting');
      out.cancel();
      stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: m.state, easing: m.ease });
      schedule(m.state, cycle);
    };
  };
  const cycle = () => {
    if (paused()) { running = false; return; }
    running = true;
    const total = Number(play()) || 0;
    schedule(total + hold + Math.random() * jitter, restart);
  };
  const kick = () => { if (!running && !paused()) cycle(); };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); if (visible) kick(); else { clear(); running = false; } }, { threshold: 0.3 }) : null;
  if (io) io.observe(stage); else { visible = true; kick(); }
  const onVis = () => { if (document.hidden) { clear(); running = false; } else kick(); };
  document.addEventListener('visibilitychange', onVis);
  return {
    stop() { stopped = true; clear(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); },
    pause(ms = 8000) { until = Date.now() + ms; clear(); running = false; schedule(ms + 20, kick); },
  };
}
