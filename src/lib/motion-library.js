/* Keia motion library: the scripted half, the site's single source for these motions (notes/logo/LIBRARY.md).
   Pairs with src/styles/motion-library.css. Loaded once on every page by Motion.astro; sets window.km.
   Ported from notes/logo/motion-library.js: durations and curves are read from the tokens (so each look keeps its
   own tempo), and the spring is V2's (src/lib/spring.mjs), one curve for the whole site.
   Every function checks km.reduced() and applies the end state at once when it is on (MOTION-V2 section 7). */
import { springEasing } from './spring.mjs';

const doc = document;
const root = doc.documentElement;

function tokenMs(name, fallback) {
  const v = getComputedStyle(root).getPropertyValue(name).trim();
  if (!v) return fallback;
  return v.endsWith('ms') ? parseFloat(v) : v.endsWith('s') ? parseFloat(v) * 1000 : parseFloat(v) || fallback;
}

export const km = {
  /* True when the person asked for reduced motion, or the page's own switch (data-reduced="true") is on. */
  reduced() {
    if (root.dataset.reduced === 'true') return true;
    if (root.dataset.reduced === 'false') return false;
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  },
  t: {
    get pop() { return tokenMs('--dur-pop', 200); },
    get exit() { return tokenMs('--dur-exit', 240); },
    get state() { return tokenMs('--dur-state', 300); },
    get zoom() { return tokenMs('--dur-zoom', 360); },
    get enter() { return tokenMs('--dur-enter', 440); },
    get chip() { return tokenMs('--dur-chip', 320); },
    get linger() { return tokenMs('--dur-linger', 4000); },
    get stagger() { return tokenMs('--stagger', 24); },
    get settle() { return getComputedStyle(root).getPropertyValue('--ease-settle').trim() || 'cubic-bezier(.22, 1, .36, 1)'; },
    get exitCurve() { return getComputedStyle(root).getPropertyValue('--ease-exit').trim() || 'cubic-bezier(.4, 0, 1, 1)'; },
  },

  /* The zero-bounce spring as a CSS linear() easing: the Shell's --ease-spring, written from src/lib/spring.mjs. */
  spring() {
    return getComputedStyle(root).getPropertyValue('--ease-spring').trim() || springEasing({ duration: 360, bounce: 0 });
  },

  /* Restart the CSS animation on an element (km-draw, km-on, km-ring closing, km-logo): drop and re-add .km-play. */
  play(el) {
    el.classList.remove('km-play');
    void el.offsetWidth;
    el.classList.add('km-play');
  },

  /* km-ring: change state in place. CSS transitions the dash pattern (--dur-state). */
  ring(el, state) { el.dataset.state = state; const c = el.querySelector && el.querySelector('.hg-ring'); if (c) c.setAttribute('data-s', state); },

  /* km-chip: the With chip changes owner. Old body slides left out, new slides in, width eases (--dur-chip).
     A second call before the first finishes retargets: the leaving body is dropped at once and the current
     incoming body becomes the leaving one from wherever it is. */
  chip(el, { mark = '', kind = 'person', text = '', when = '' } = {}) {
    const body = doc.createElement('span');
    body.className = 'km-chip-body';
    body.innerHTML = `<span class="km-chip-mark" data-kind="${kind}"></span><span class="km-chip-text"></span>${when ? '<span class="km-chip-when"></span>' : ''}`;
    body.querySelector('.km-chip-mark').textContent = mark;
    body.querySelector('.km-chip-text').textContent = text;
    if (when) body.querySelector('.km-chip-when').textContent = when;
    const old = el.querySelector('.km-chip-body:not(.km-leaving)');
    el.querySelectorAll('.km-chip-body.km-leaving').forEach((n) => n.remove());
    const w0 = el.getBoundingClientRect().width;
    el.style.width = w0 + 'px';
    if (old) old.classList.add('km-leaving');
    el.appendChild(body);
    el.style.width = 'auto';
    const w1 = el.getBoundingClientRect().width;
    el.style.width = w0 + 'px';
    void el.offsetWidth;
    el.style.width = w1 + 'px';
    if (km.reduced()) { if (old) old.remove(); el.style.width = ''; return; }
    const d = km.t.chip, ease = km.spring();
    if (old) {
      // start from wherever it is, if it was still arriving
      const cur = getComputedStyle(old).transform;
      old.style.transform = cur === 'none' ? '' : cur;
      old.animate([{ transform: old.style.transform || 'translateX(0)', opacity: 1 }, { transform: 'translateX(-14px)', opacity: 0 }], { duration: d, easing: km.t.exitCurve, fill: 'forwards' })
        .onfinish = () => old.remove();
    }
    body.animate([{ transform: 'translateX(14px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }], { duration: d, easing: ease, fill: 'both' });
    setTimeout(() => { el.style.width = ''; }, d);
  },

  /* km-heartbeat: "checked 40 s ago", words only, every 10 s. stale(since) swaps the words and the colour once.
     Returns a controller so a page can stop it and a demo can tick it by hand. */
  heartbeat(el, { at = Date.now(), window: win = 120000, every = 10000 } = {}) {
    let timer = null, stale = false, start = at;
    const words = () => {
      if (stale) return;
      const s = Math.max(0, Math.round((Date.now() - start) / 1000));
      el.textContent = s < 60 ? `checked ${s} s ago` : `checked ${Math.round(s / 60)} min ago`;
      if (Date.now() - start > win) ctl.stale(new Date(start));
    };
    const ctl = {
      tick(seconds) { if (seconds != null) start = Date.now() - seconds * 1000; words(); },
      stale(since = new Date()) {
        stale = true;
        el.textContent = `Not reporting since ${since.toTimeString().slice(0, 5)}`;
        el.classList.add('km-stale');
      },
      reset(at2 = Date.now()) { stale = false; start = at2; el.classList.remove('km-stale'); words(); },
      stop() { clearInterval(timer); },
    };
    words();
    timer = setInterval(words, every);
    return ctl;
  },

  /* km-zoom: the clicked shape's box becomes the page's box (--dur-zoom, critically damped); the plan scales to
     1.06 and fades beneath it; the path gains a step. Reduced motion: a cross-fade over --dur-state. */
  zoomIn(frame, target, { step = '' } = {}) {
    const plan = frame.querySelector('.km-zoom-plan'), page = frame.querySelector('.km-zoom-page');
    const F = frame.getBoundingClientRect(), T = target.getBoundingClientRect();
    frame.dataset.level = 'page';
    frame.dataset.from = target.dataset.zoom || '';
    if (step) {
      const path = frame.querySelector('.km-zoom-path');
      if (path) { const s = doc.createElement('span'); s.className = 'km-step km-in'; s.textContent = '/ ' + step; path.appendChild(s); }
    }
    if (km.reduced()) {
      page.animate([{ opacity: 0 }, { opacity: 1 }], { duration: km.t.state, easing: km.t.settle });
      return;
    }
    const from = `translate(${T.left - F.left}px, ${T.top - F.top}px) scale(${T.width / F.width}, ${T.height / F.height})`;
    page.animate([{ transform: from, opacity: .4 }, { transform: 'none', opacity: 1 }], { duration: km.t.zoom, easing: km.spring(), fill: 'both' });
    plan.style.visibility = 'visible';
    plan.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.06)', opacity: 0 }], { duration: km.t.zoom, easing: km.spring(), fill: 'forwards' })
      .onfinish = () => { plan.style.visibility = ''; };
  },
  zoomOut(frame) {
    const plan = frame.querySelector('.km-zoom-plan'), page = frame.querySelector('.km-zoom-page');
    const target = frame.querySelector(`[data-zoom="${frame.dataset.from}"]`);
    const path = frame.querySelector('.km-zoom-path');
    const last = path && path.querySelector('.km-step:last-child');
    if (last && last.classList.contains('km-in')) {
      if (km.reduced()) last.remove();
      else last.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(8px)' }], { duration: km.t.pop, easing: km.t.exitCurve, fill: 'forwards' }).onfinish = () => last.remove();
    }
    if (km.reduced()) {
      frame.dataset.level = 'plan';
      plan.animate([{ opacity: 0 }, { opacity: 1 }], { duration: km.t.state, easing: km.t.settle });
      return;
    }
    const F = frame.getBoundingClientRect();
    plan.style.visibility = 'visible';
    page.style.visibility = 'visible';
    let to = 'scale(.7)';
    if (target) { const T = target.getBoundingClientRect(); to = `translate(${T.left - F.left}px, ${T.top - F.top}px) scale(${T.width / F.width}, ${T.height / F.height})`; }
    plan.animate([{ transform: 'scale(1.06)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: km.t.zoom, easing: km.spring(), fill: 'both' });
    page.animate([{ transform: 'none', opacity: 1 }, { transform: to, opacity: 0 }], { duration: km.t.zoom, easing: km.spring(), fill: 'forwards' })
      .onfinish = () => { frame.dataset.level = 'plan'; page.style.visibility = ''; plan.style.visibility = ''; };
  },

  /* km-toggle: a switch. CSS moves the knob; this keeps the state. */
  toggle(el, force) {
    const on = force != null ? !!force : el.getAttribute('aria-checked') !== 'true';
    el.setAttribute('aria-checked', String(on));
    return on;
  },

  /* km-copy: put text on the clipboard and confirm in the button; the words return after --dur-linger. */
  async copy(btn, text) {
    try { await navigator.clipboard.writeText(text); } catch (e) { /* clipboard blocked: the confirmation still shows what was meant */ }
    btn.classList.remove('km-done');
    void btn.offsetWidth;
    btn.classList.add('km-done');
    clearTimeout(btn._kmT);
    btn._kmT = setTimeout(() => btn.classList.remove('km-done'), km.t.linger);
  },

  /* km-toast: one at a time. A second toast replaces the words in place; it leaves after --dur-linger or on dismiss. */
  toast(host, text, { action = '', onAction = null, stay = km.t.linger } = {}) {
    let t = host.querySelector('.km-toast:not(.km-out)');
    const leave = () => {
      if (!t || t.classList.contains('km-out')) return;
      t.classList.add('km-out');
      const done = () => t && t.remove();
      km.reduced() ? done() : t.addEventListener('animationend', done, { once: true });
    };
    if (t) {
      // A second toast replaces the words in place; its own action replaces the first one's.
      const act = action && t.querySelectorAll('button').length > 1 ? t.querySelector('button:not(.km-toast-x)') : null;
      if (act) { act.textContent = action; act.onclick = () => { onAction && onAction(); leave(); }; }
      const span = t.querySelector('.km-toast-text');
      const swap = () => { span.textContent = text; span.classList.remove('km-swap'); };
      if (km.reduced()) swap(); else { span.classList.add('km-swap'); setTimeout(swap, km.t.pop); }
    } else {
      t = doc.createElement('div');
      t.className = 'km-toast';
      t.setAttribute('role', 'status');
      t.innerHTML = `<span class="km-toast-text"></span>${action ? '<button type="button"></button>' : ''}<button type="button" class="km-toast-x" aria-label="Dismiss">×</button>`;
      // Paused while pointed at or focused, so there is time to read it and press Undo (WCAG 2.2.1).
      const hold = () => clearTimeout(host._kmT), go = () => { clearTimeout(host._kmT); host._kmT = setTimeout(leave, stay); };
      t.addEventListener('pointerenter', hold); t.addEventListener('pointerleave', go);
      t.addEventListener('focusin', hold); t.addEventListener('focusout', go);
      t.querySelector('.km-toast-text').textContent = text;
      const btns = t.querySelectorAll('button');
      if (action) { btns[0].textContent = action; btns[0].onclick = () => { onAction && onAction(); leave(); }; }
      btns[btns.length - 1].addEventListener('click', leave);
      host.appendChild(t);
    }
    clearTimeout(host._kmT);
    host._kmT = setTimeout(leave, stay);
    return leave;
  },

  /* km-skeleton: the wash goes, content cross-fades in, glyphs come on in turn, the heartbeat last (all in CSS). */
  skeleton(el) {
    el.classList.remove('km-loaded');
    void el.offsetWidth;
    el.classList.add('km-loaded');
  },

  /* km-peek: hover or focus an item for 200 ms and a peek grows from it; moving to a neighbour slides the peek.
     render(item) returns the peek's HTML. The peek element lives inside the container (position: relative). */
  peek(container, render, { rest = 200 } = {}) {
    let el = container.querySelector('.km-peek');
    if (!el) { el = doc.createElement('div'); el.className = 'km-peek'; el.setAttribute('role', 'tooltip'); container.appendChild(el); }
    let timer = null, current = null;
    const show = (item) => {
      const C = container.getBoundingClientRect(), R = item.getBoundingClientRect();
      const left = R.right - C.left + 8, top = R.top - C.top;
      const flip = left + 170 > C.width;
      el.style.setProperty('--km-origin', flip ? 'right top' : 'left top');
      el.innerHTML = render(item);
      el.style.left = (flip ? R.left - C.left - 8 - el.offsetWidth : left) + 'px';
      el.style.top = top + 'px';
      el.classList.add('km-open');
      current = item;
    };
    const arm = (item) => {
      clearTimeout(timer);
      if (el.classList.contains('km-open')) { show(item); return; }
      timer = setTimeout(() => show(item), km.reduced() ? 0 : rest);
    };
    const off = () => { clearTimeout(timer); el.classList.remove('km-open'); current = null; };
    container.querySelectorAll('[data-peek]').forEach((item) => {
      item.addEventListener('pointerenter', () => arm(item));
      item.addEventListener('focus', () => arm(item));
      item.addEventListener('blur', off);
    });
    container.addEventListener('pointerleave', off);
    return { show, off };
  },
};

window.km = km;
export default km;
