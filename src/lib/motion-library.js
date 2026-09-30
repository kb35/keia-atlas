/* Keia motion library: the scripted half, the site's single source for these motions.
   Pairs with src/styles/motion-library.css. Loaded once on every page by Motion.astro; sets window.km.
   Durations and curves are read from the tokens (so each look keeps its
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
  /* True when the person asked for reduced motion: the site's own switch (html data-motion="off" or "reduced",
     or the older data-reduced="true"), else the system's prefers-reduced-motion. data-motion="full" (or
     data-reduced="false") keeps motion on even when the system asks for less. */
  reduced() {
    const m = root.dataset.motion;
    if (m === 'off' || m === 'reduced') return true;
    if (m === 'full' || m === 'on') return false;
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
    get morph() { return tokenMs('--dur-morph', 520); },
    get hover() { return tokenMs('--dur-hover', 140); },
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

  /* km-ring, for a line that is redrawn with new markup: render() replaces the box's content; each glyph that was
     there before (matched in order) starts from its old state and eases to its new one, so a status that changes
     never jumps even when its words are rewritten. Reduced motion: the new state at once. */
  ringSwap(box, render) {
    const was = box ? [...box.querySelectorAll('.hg-ring')].map((r) => r.getAttribute('data-s')) : [];
    render();
    if (!box || km.reduced() || !was.length) return;
    const now = [...box.querySelectorAll('.hg-ring')];
    const to = now.map((r) => r.getAttribute('data-s'));
    now.forEach((r, i) => { if (was[i] && was[i] !== to[i]) { r.style.transition = 'none'; r.setAttribute('data-s', was[i]); } });
    void box.offsetWidth;
    now.forEach((r, i) => { if (was[i] && was[i] !== to[i]) { r.style.transition = ''; r.setAttribute('data-s', to[i]); } });
  },

  /* A <dialog> leaves the way it came: it fades and moves back towards where it grew from (`to`, a transform), on
     --dur-exit and --ease-exit, takes no clicks meanwhile, then closes.
     A page sends Escape here too: dlg.addEventListener('cancel', (e) => { e.preventDefault(); km.closeDialog(dlg); }).
     Reduced motion: it closes at once. */
  closeDialog(dlg, { to = `scale(${getComputedStyle(root).getPropertyValue('--pop-scale').trim() || .94})`, value } = {}) {
    if (!dlg || !dlg.open) return;
    if (dlg.__kmClosing) return;
    const shut = () => { dlg.__kmClosing = false; dlg.style.pointerEvents = ''; value === undefined ? dlg.close() : dlg.close(value); };
    if (km.reduced() || !dlg.animate) { shut(); return; }
    dlg.__kmClosing = true;
    dlg.style.pointerEvents = 'none';
    const a = dlg.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: to }], { duration: km.t.exit, easing: km.t.exitCurve, fill: 'forwards' });
    a.onfinish = () => { shut(); a.cancel(); };
  },

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

  /* ---------- 13. km-settle: a section settles in once, as it first scrolls into view ----------
     Sections below the fold when a page arrives wait just under their place (still in the flow, so nothing
     reflows) and rise 12 px into it while they fade in, once, over --dur-enter. What is in view at arrival
     comes with the page move instead (M5), so nothing moves twice. Returns a function that shows every
     waiting section at once (used when the page changes). Reduced motion: nothing waits. */
  settle(scope, sel = 'section.sec, [data-settle]') {
    // An automated browser (a full-page screenshot, a check) sees every section in its place: nothing waits.
    if (!scope || km.reduced() || !('IntersectionObserver' in window) || (navigator.webdriver && !window.__kmSettleAlways)) return () => {};
    const vh = innerHeight, all = [...scope.querySelectorAll(sel)];
    const els = all.filter((el) => {
      if (el.closest('[data-no-settle], [hidden], dialog, .peek')) return false;
      const up = el.parentElement && el.parentElement.closest(sel);
      if (up && scope.contains(up)) return false;   // only the outermost section moves; its parts share its move (M4)
      const r = el.getBoundingClientRect();
      return r.height > 0 && r.top > vh * 0.92;
    });
    if (!els.length) return () => {};
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const el = e.target;
      el.classList.add('km-settling');
      el.classList.remove('km-settle-wait');
      const done = () => el.classList.remove('km-settling');
      el.addEventListener('transitionend', done, { once: true });
      setTimeout(done, km.t.enter + 100);
    }), { rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => { el.classList.add('km-settle-wait'); io.observe(el); });
    return () => { io.disconnect(); els.forEach((el) => el.classList.remove('km-settle-wait', 'km-settling')); };
  },

  /* ---------- 14. km-disclose: a disclosure grows from its summary and folds back into it ----------
     A <details> in the flow: its box eases from the summary's height to its open height (--dur-morph, the one
     held box of M6) while the content rises 4 px and fades in (--dur-state); closing fades the content
     (--dur-exit) while the box folds back to the summary, then it closes. A <details> whose content floats
     (a menu) grows from its summary instead (--pop-scale, --dur-pop) and shrinks back to it. A second press
     mid-move starts from where the box is. Reduced motion: it opens and closes at once. */
  disclose(d, open = !d.open) {
    const sum = d.querySelector(':scope > summary');
    if (!sum) { d.open = open; return; }
    if (d.__km) { d.__km(); d.__km = null; }
    if (km.reduced() || !d.animate) { d.open = open; return; }
    const kids = () => [...d.children].filter((k) => k !== sum && k.nodeType === 1);
    const floating = (k) => /absolute|fixed/.test(getComputedStyle(k).position);
    if (open) d.open = true;
    const parts = kids();
    if (!parts.length) { d.open = open; return; }
    if (parts.every(floating)) {
      const S = sum.getBoundingClientRect();
      const anims = parts.map((k) => {
        const K = k.getBoundingClientRect();
        const o = `${Math.round(S.left + S.width / 2 - K.left)}px ${Math.round(S.top + S.height / 2 - K.top)}px`;
        const f = [{ opacity: 0, transform: `scale(${getComputedStyle(root).getPropertyValue('--pop-scale').trim() || .94})`, transformOrigin: o }, { opacity: 1, transform: 'none', transformOrigin: o }];
        return k.animate(open ? f : f.slice().reverse(), { duration: open ? km.t.pop : km.t.exit, easing: open ? km.t.settle : km.t.exitCurve, fill: open ? 'none' : 'forwards' });
      });
      const end = () => { anims.forEach((a) => a.cancel()); };
      if (!open) anims[0].onfinish = () => { d.open = false; end(); d.__km = null; };
      d.__km = () => { end(); if (!open) d.open = false; };
      return;
    }
    const cs = getComputedStyle(d);
    const closedH = () => sum.getBoundingClientRect().bottom - d.getBoundingClientRect().top + parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth);
    const h0 = d.getBoundingClientRect().height;
    const h1 = open ? d.getBoundingClientRect().height : closedH();
    const from = open ? closedH() : h0;
    const box = d.animate([{ height: `${from}px`, overflow: 'clip' }, { height: `${h1}px`, overflow: 'clip' }], { duration: open ? km.t.morph : km.t.exit, easing: open ? km.t.settle : km.t.exitCurve });
    const fades = parts.map((k, i) => k.animate(open
      ? [{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }]
      : [{ opacity: 1 }, { opacity: 0 }],
    { duration: open ? km.t.state : km.t.exit, delay: open ? Math.min(i, 12) * km.t.stagger : 0, easing: open ? km.t.settle : km.t.exitCurve, fill: open ? 'backwards' : 'forwards' }));
    const end = () => { box.cancel(); fades.forEach((a) => a.cancel()); };
    box.onfinish = () => { if (!open) d.open = false; end(); d.__km = null; };
    d.__km = () => { end(); if (!open) d.open = false; };
  },

  /* ---------- 15. km-tick: a figure ticks to its new value ----------
     The new value rises into place when it went up, drops into place when it went down, once, over --dur-state.
     It never counts through the numbers in between (M9): the figure is exact on every frame, only its place eases.
     from: the old text, to tell up from down. Reduced motion: the new value is simply there. */
  tick(el, from = '') {
    if (!el || km.reduced() || !el.animate) return;
    const num = (s) => { const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
    const a = num(from), b = num(el.textContent);
    const dir = isNaN(a) || isNaN(b) || a === b ? 1 : (b > a ? 1 : -1);
    if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
    if (el.__kmTick) el.__kmTick.cancel();
    el.__kmTick = el.animate([{ transform: `translateY(${dir * 0.45}em)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: km.t.state, easing: km.t.settle });
  },

  /* Watch a page for figures that change and tick them (km-tick). Only figures that were already showing tick; a
     list drawn afresh does not. sel: what counts as a figure. Returns a function that stops watching. */
  watchFigures(scope, sel = '[data-tick], .num, .fb-count, [data-fb-shown], [data-n], [data-qn]') {
    if (!scope || !window.MutationObserver) return () => {};
    const last = new WeakMap(), vh = () => innerHeight;
    const ok = (el) => !el.closest('.fb-opt, [data-no-tick], [hidden]');
    scope.querySelectorAll(sel).forEach((el) => last.set(el, el.textContent));
    const mo = new MutationObserver((recs) => {
      const hit = new Set();
      recs.forEach((r) => {
        let t = r.target.nodeType === 3 ? r.target.parentElement : r.target;
        const f = t && t.closest && t.closest(sel);
        if (f) hit.add(f);
        r.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches(sel)) last.set(n, n.textContent); n.querySelectorAll && n.querySelectorAll(sel).forEach((x) => last.set(x, x.textContent)); } });
      });
      let n = 0;
      hit.forEach((el) => {
        const was = last.get(el), now = el.textContent;
        last.set(el, now);
        if (was == null || was === now || !/\d/.test(now) || !/\d/.test(was) || !ok(el) || n >= 12) return;
        const r = el.getBoundingClientRect();
        if (!r.height || r.bottom < 0 || r.top > vh()) return;
        n++; km.tick(el, was);
      });
    });
    mo.observe(scope, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  },

  /* ---------- 16. km-draw-in: a chart draws in once, the first time it is seen ----------
     A line (a sparkline, any path in [data-chart]) draws along its length; bars grow from their baseline, all the
     segments of a stacked bar together from its left edge, so they stay joined; up to 12 bars a stagger apart.
     Transform and stroke only, over --dur-morph, once. After that a chart is redrawn still (M9). Reduced
     motion: the chart is simply there. */
  drawIn(el, { delay = 0 } = {}) {
    if (!el || km.reduced() || !el.animate) return;
    const d = km.t.morph, ease = km.t.settle, st = km.t.stagger;
    const lines = el.matches('svg') ? [...el.querySelectorAll('path, polyline, line')].filter((p) => !p.closest('defs')) : [...el.querySelectorAll('svg.spk path, [data-draw]')];
    lines.forEach((p, i) => {
      if (getComputedStyle(p).stroke === 'none') return;
      const had = p.getAttribute('pathLength');
      p.setAttribute('pathLength', '1');
      p.style.strokeDasharray = '1';
      const a = p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: d, delay: delay + Math.min(i, 12) * st, easing: ease, fill: 'backwards' });
      const clean = () => { p.style.strokeDasharray = ''; if (had == null) p.removeAttribute('pathLength'); else p.setAttribute('pathLength', had); };
      a.onfinish = clean; a.oncancel = clean;
    });
    const bars = el.matches('svg') ? [] : [...(el.matches(km.BARS) ? [el] : el.querySelectorAll(km.BARS))];
    bars.forEach((bar, bi) => {
      const B = bar.getBoundingClientRect();
      // A timeline (data-chart-bar="each", Home's day): each block slides a little into its own time, in turn.
      if (bar.dataset.chartBar === 'each') {
        [...bar.children].filter((seg) => /width/.test(seg.getAttribute('style') || '')).forEach((seg, i) => {
          seg.animate([{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: km.t.enter, delay: delay + Math.min(i, 12) * st, easing: ease, fill: 'backwards' });
        });
        return;
      }
      [...bar.children].forEach((seg) => {
        const sty = seg.getAttribute('style') || '';
        if (!seg.matches('i, [data-bar-seg]') && !/width|height|flex/.test(sty)) return;
        const S = seg.getBoundingClientRect();
        if (!S.width || !S.height) return;
        const tall = /height/.test(seg.getAttribute('style') || '') && !/width/.test(seg.getAttribute('style') || '');
        const o = tall ? `50% ${Math.round(B.bottom - S.top)}px` : `${Math.round(B.left - S.left)}px 50%`;
        seg.animate([{ transform: tall ? 'scaleY(0)' : 'scaleX(0)', transformOrigin: o }, { transform: 'none', transformOrigin: o }], { duration: d, delay: delay + Math.min(bi, 12) * st, easing: ease, fill: 'backwards' });
      });
    });
  },
  /* The bar charts on the site, as markup: a track whose <i> children are sized to their value. */
  BARS: '[data-chart-bar], .sp-bar, .cfc-bar, .cf-prog-bar, .vd-bar, .vrec-bar, .hbar, .bud-bar, .task-bar, .pbs-bar, .mdp-bar, .lv-bar, .lv-hbar, .sv-hbar, .pl-mbar, .pl-kbar, .pl-hbar, .wp-bars',
  /* Draw every chart in scope in once as it first comes into view. Returns a function that stops watching. */
  watchCharts(scope, sel = '[data-chart], svg.spk') {
    if (!scope || km.reduced() || !('IntersectionObserver' in window)) return () => {};
    const els = [...scope.querySelectorAll(`${sel}, ${km.BARS}`)].filter((el) => !el.closest('[data-no-draw], .sm-grid') && !(el.parentElement && el.parentElement.closest(km.BARS)));
    if (!els.length) return () => {};
    let n = 0;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      const el = e.target;
      // Started now with a delay (never a timer): the chart is hidden from the first frame, so it cannot flash drawn.
      km.drawIn(el, { delay: Math.min(n++, 12) * km.t.stagger });
    }), { threshold: 0.3 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  },
};

window.km = km;
export default km;
