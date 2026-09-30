// Motion tokens for page scripts that may run outside the console's Shell (the front door has no Shell, so no
// window.rsMotion). Reads the same CSS custom properties (motion.css, MOTION-V2 section 2); nothing types a number
// except the fallbacks, which are the token values. Browser only.

const ms = (cs, name, d) => {
  const v = cs.getPropertyValue(name).trim(), n = parseFloat(v);
  return Number.isNaN(n) ? d : /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n;
};

export function motion() {
  const cs = getComputedStyle(document.documentElement);
  return {
    reduced: (window.rsReducedNow ? window.rsReducedNow() : matchMedia('(prefers-reduced-motion: reduce)').matches),
    ease: cs.getPropertyValue('--ease-settle').trim() || 'cubic-bezier(.22, 1, .36, 1)',
    exitEase: cs.getPropertyValue('--ease-exit').trim() || 'cubic-bezier(.4, 0, 1, 1)',
    hover: ms(cs, '--dur-hover', 140), pop: ms(cs, '--dur-pop', 200), exit: ms(cs, '--dur-exit', 240),
    state: ms(cs, '--dur-state', 300), chip: ms(cs, '--dur-chip', 320), zoom: ms(cs, '--dur-zoom', 360),
    page: ms(cs, '--dur-page', 420), enter: ms(cs, '--dur-enter', 440), morph: ms(cs, '--dur-morph', 520),
    flash: ms(cs, '--dur-flash', 800), stagger: ms(cs, '--stagger', 24),
    springEase: cs.getPropertyValue('--ease-spring').trim() || 'cubic-bezier(.22, 1, .36, 1)',
    press: ms(cs, '--dur-press', 80), theme: ms(cs, '--dur-theme', 360), replay: ms(cs, '--replay-step', 600),
    linger: ms(cs, '--dur-linger', 4000), springSettle: ms(cs, '--spring-settle', 360), springSnap: ms(cs, '--spring-snap', 200),
    peekRest: ms(cs, '--peek-rest', 200), skeletonMax: ms(cs, '--skeleton-max', 400), skeletonSkip: ms(cs, '--skeleton-skip', 100),
    toast: ms(cs, '--toast-stay', 4000),
  };
}

// Run fn once when el first scrolls into view (or at once where IntersectionObserver is missing).
export function onceInView(el, fn, threshold = 0.25) {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); fn(); }
  }, { threshold });
  io.observe(el);
}

// A new thing grows from the control or item it came from (M11): opacity and scale only, from that point.
export function growFrom(el, from, m = motion(), scale = 0.94) {
  if (m.reduced || !el.animate) return;
  const a = el.getBoundingClientRect(), b = from?.getBoundingClientRect?.();
  const o = b ? `${Math.round(b.left + b.width / 2 - a.left)}px ${Math.round(b.top + b.height / 2 - a.top)}px` : 'center';
  el.animate([{ opacity: 0, transform: `scale(${scale})`, transformOrigin: o }, { opacity: 1, transform: 'none', transformOrigin: o }], { duration: m.enter, easing: m.ease });
}

// Keep a box's height while its content swaps, then ease it to the new height (rule M6), so the page never jumps.
export function holdSwap(box, swap, m = motion()) {
  const h0 = box.getBoundingClientRect().height;
  swap();
  const h1 = box.getBoundingClientRect().height;
  if (m.reduced || Math.abs(h1 - h0) < 1 || !box.animate) return;
  box.style.overflow = 'clip';
  box.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: m.morph, easing: m.ease }).onfinish = () => { box.style.overflow = ''; };
}
