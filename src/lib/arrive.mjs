// Arrival motion for the record blocks added with the overlooked items (warranty, on call, circuits, the comms room's
// power and temperature, repeat faults, room accessibility, cable tests, platforms, office hours). Three moves, all
// from the motion library (src/lib/motion-library.js, src/styles/motion-library.css), each once:
//
//   [data-arrive]  a block below the fold settles in as it comes into view: opacity and 8 px up over --dur-enter
//                  (M13 row 41's move). A block already on screen arrives with the page and does not move again.
//   .rs-tick       a figure ticks into place: its final value rises into its slot once (km-rise, --dur-enter). It
//                  never counts through other values, so what is read is always the true figure (M9).
//   [data-draw]    a trend strip draws once: its strokes (km-draw, pathLength 1) draw on, --stagger apart.
//
// The markup is the end state. Reduced motion (km.reduced(), or the Motion setting off) does nothing at all, so the
// page shows the final state at once (M7). Scrolling back never replays anything.
import km from './motion-library.js';

const still = () => km.reduced() || /^(off|reduced)$/.test(document.documentElement.dataset.motion || '');

// Play the figures and strips inside a block: add .km-play once.
function play(el) {
  el.querySelectorAll('.rs-tick, [data-draw]').forEach((x, i) => {
    if (x.dataset.played) return;
    x.dataset.played = '1';
    x.style.setProperty('--i', String(Math.min(i, 12)));
    km.play(x);
  });
}

/** Wire every block in `root` that has not arrived yet. Safe to call again after a page draws more blocks. */
export function arrive(root = document) {
  const blocks = [...root.querySelectorAll('[data-arrive]:not([data-arrived])')];
  blocks.forEach((b) => b.setAttribute('data-arrived', ''));
  if (!blocks.length || still()) return;
  const fold = innerHeight * 0.9;
  const later = [];
  for (const b of blocks) {
    if (b.getBoundingClientRect().top > fold && 'IntersectionObserver' in window) { b.classList.add('rs-wait'); later.push(b); }
    else play(b);
  }
  if (!later.length) return;
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      e.target.classList.add('rs-in');
      play(e.target);
    }
  }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });
  later.forEach((b) => io.observe(b));
}
