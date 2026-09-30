// The front door's loops (Keith, 30 Sept 2026: no "Play again" buttons; every moving picture runs on its own).
// One shape for every stage: play the sequence, which eases into its final frame on its own tokens; hold that
// frame for a calm pause; then a short cross-fade (never a jump) back to the first frame, and again. The loop
// pauses while the stage is off screen and while the tab is hidden, so nothing burns CPU unseen; and each stage
// waits its own random extra beat before restarting, so the loops never fall into step with each other.
//
// Pause and play (WCAG 2.2.2, docs/accessibility.md): anything that moves for more than 5 seconds can be paused.
// Each loop puts one small, quiet button in its stage's corner; the front door's footer has "Pause animations"
// for all of them (it is Settings › Accessibility › Keep things still). Pausing freezes the picture where it is,
// its timers and its moves; playing carries on from that point. Keep things still: the stage shows its finished
// frame and waits, paused, and Play starts it from the top.
//
// Reduced motion (the device's setting, or Reduced or Off in Settings): no loop and no button. The caller draws
// the finished frame and this returns a no-op.
//
//   loop(stage, { play, reset, finish, hold, jitter, clock, control, label })
//     play()   starts the sequence and returns the ms until its final frame is in place
//     reset()  puts the stage back to its first frame at once (called while the stage is faded out and marked
//              .fd-resetting, under which the page's CSS turns every transition off, so nothing plays backwards)
//     finish() draws the finished frame at once (for Keep things still)
//     hold     how long the finished frame stays (default 3200 ms), plus up to `jitter` ms (default 900)
//     clock    the stage's timers (clock() below): pass the one the sequence uses, so a pause stops them too
//     control  where the pause button goes (default: the stage); false for none
//     label    what the button names ("Plan it"); by default the heading of the stage's section
//   returns { stop(), pause(ms), hold(), resume(), held }: stop the loop for good (a visitor took over), yield to
//   a visitor for `ms` (default 8 s), or pause and play it as the button does
import { motion } from './motion-read.mjs';

/** Timers that can be paused and resumed where they were: later(ms, fn), cancel(t), clear(), pause(), resume(). */
export function clock() {
  let items = [], paused = false;
  const fire = (it) => { items = items.filter((x) => x !== it); it.fn(); };
  const arm = (it, ms) => { it.due = Date.now() + ms; it.id = window.setTimeout(() => fire(it), ms); };
  return {
    later(ms, fn) { const it = { fn, left: Math.max(0, ms), id: 0, due: 0 }; items.push(it); if (!paused) arm(it, it.left); return it; },
    cancel(it) { if (!it) return; clearTimeout(it.id); items = items.filter((x) => x !== it); },
    clear() { items.forEach((it) => clearTimeout(it.id)); items = []; },
    pause() { if (paused) return; paused = true; const t = Date.now(); items.forEach((it) => { clearTimeout(it.id); it.left = Math.max(0, it.due - t); }); },
    resume() { if (!paused) return; paused = false; items.slice().forEach((it) => arm(it, it.left)); },
    get paused() { return paused; },
  };
}

// Every moving picture on the page, for "Pause animations" and Keep things still.
const pictures = new Set();
const root = () => document.documentElement;
export const stillWanted = () => root().getAttribute('data-still') === 'on';
/** Add a moving picture ({ stage, hold(), resume() }) to the page's list; returns a function that takes it off. */
export function addPicture(p) { pictures.add(p); return () => pictures.delete(p); }
/** Pause (true) or play (false) every moving picture on the page. */
export function holdAll(on) { pictures.forEach((p) => { if (!p.stage.isConnected) pictures.delete(p); else if (on) p.hold(); else p.resume(); }); }
if (typeof document !== 'undefined' && !window.__rsLoopHook) {
  window.__rsLoopHook = true;
  // Keep things still switched in Settings or the footer: every picture follows at once.
  document.addEventListener('rs:a11y', (e) => { const on = !!e.detail?.still; if (on !== window.__rsStillWas) { window.__rsStillWas = on; holdAll(on); } });
  window.__rsStillWas = stillWanted();
}

const ICON = '<svg class="rs-p-pause" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5 3.5v9M11 3.5v9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>'
  + '<svg class="rs-p-play" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M5.5 3.2v9.6L12.8 8z" fill="currentColor"/></svg>';

/** The one pause and play button. Returns set(paused) to show the state. */
export function pauseButton(host, name, onToggle) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'rs-pause'; b.innerHTML = ICON;
  const set = (paused) => {
    const words = `${paused ? 'Play' : 'Pause'} the moving picture${name ? `: ${name}` : ''}`;
    b.setAttribute('aria-label', words); b.title = words;
    b.toggleAttribute('data-paused', paused);
  };
  b.addEventListener('click', (e) => { e.stopPropagation(); onToggle(); });
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(b);
  return set;
}

/** Freeze or thaw every move inside an element (CSS transitions and animations, and scripted ones). */
export function freezeMoves(el, on) {
  if (!el?.getAnimations) return;
  el.getAnimations({ subtree: true }).forEach((a) => { try { if (on) { if (a.playState === 'running') { a.pause(); a.__rsFrozen = true; } } else if (a.__rsFrozen) { a.__rsFrozen = false; a.play(); } } catch (_) { /* a finished move stays finished */ } });
}

const nameOf = (stage) => stage.closest('section')?.querySelector('h2, h3')?.textContent?.trim() ?? '';

export function loop(stage, { play, reset, finish, hold = 3200, jitter = 900, clock: clk = clock(), control, label } = {}) {
  const m = motion();
  if (m.reduced || !stage) return { stop() {}, pause() {}, hold() {}, resume() {}, held: false };
  let visible = false, timer = null, stopped = false, running = false, until = 0, held = false, atEnd = false, frozen = false;
  const clear = () => { if (timer) { clk.cancel(timer); timer = null; } };
  const schedule = (ms, fn) => { clear(); timer = clk.later(ms, () => { timer = null; fn(); }); };
  const waiting = () => stopped || !visible || document.hidden || !stage.isConnected || Date.now() < until;
  // Words that change as the picture plays are not read out while it plays on its own (every few seconds, for as
  // long as the page is open, would drown a screen reader); they are live again once the visitor takes over.
  const lives = Array.from((stage.closest('section') || stage).querySelectorAll('[aria-live]')).filter((el) => el.getAttribute('aria-live') !== 'off');
  const speak = (on) => lives.forEach((el) => el.setAttribute('aria-live', on ? 'polite' : 'off'));
  // Frozen: off screen, in a hidden tab, or paused. The timers and moves stop where they are.
  const setFrozen = (on) => { if (on === frozen) return; frozen = on; if (on) clk.pause(); else clk.resume(); freezeMoves(stage, on); };
  const restart = () => {
    if (waiting() || held) { running = false; return; }
    atEnd = false;
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
    if (waiting() || held) { running = false; return; }
    running = true; speak(false);
    const total = Number(play()) || 0;
    schedule(total + hold + Math.random() * jitter, restart);
  };
  const kick = () => { if (held || waiting()) return; setFrozen(false); if (!running) (atEnd ? restart : cycle)(); };
  const sync = () => { if (held || !visible || document.hidden) setFrozen(true); else kick(); };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); sync(); }, { threshold: 0.3 }) : null;
  const onVis = () => sync();
  document.addEventListener('visibilitychange', onVis);

  let show = () => {};
  const api = {
    stage,
    get held() { return held; },
    stop() { stopped = true; clear(); speak(true); setFrozen(false); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); pictures.delete(api); btn?.remove(); },
    pause(ms = 8000) { until = Date.now() + ms; speak(true); clear(); running = false; atEnd = false; setFrozen(false); setTimeout(kick, ms + 20); },
    hold() { if (stopped) return; held = true; setFrozen(true); show(true); },
    resume() { if (stopped) return; held = false; show(false); sync(); },
  };
  pictures.add(api);
  let btn = null;
  if (control !== false) {
    const host = control || stage;
    show = pauseButton(host, label ?? nameOf(stage), () => (held ? api.resume() : api.hold()));
    btn = host.querySelector(':scope > .rs-pause');
    show(false);
  }
  // Keep things still: the finished frame, paused, until the visitor presses Play.
  if (stillWanted()) {
    // The finished frame lands at once: any move it starts (a chip sliding to its last state) jumps to its end.
    const land = () => stage.getAnimations?.({ subtree: true }).forEach((a) => { try { a.finish(); } catch (_) { /* an endless one is cancelled below */ a.cancel(); } });
    // After the page's own first paint of the stage (a chip drawn from its data at load), so the finished frame wins.
    if (finish) { atEnd = true; setTimeout(() => { stage.classList.add('fd-resetting'); finish(); land(); requestAnimationFrame(() => { land(); stage.classList.remove('fd-resetting'); }); }, 0); }
    api.hold();
  }
  if (io) io.observe(stage); else { visible = true; sync(); }
  return api;
}
