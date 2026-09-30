// The zoom in the browser (design notes, docs/rules/motion.md). Loaded once by Shell.astro; it lives across
// page changes. What it does:
//   - tells a zoom from any other move: one page level in or out along region, office, space, device
//     (src/lib/zoom-level.mjs), and marks it on <html> as data-nav-dir="zoom-in" or "zoom-out" for nav.css;
//   - pairs the clicked shape with the next page's picture (the Shell pairs HTML records, src/lib/vt.mjs;
//     a room on a floor plan is an SVG shape, which View Transitions cannot capture, so a plain box stands in
//     for it here), and names the path's new or lost step so it slides;
//   - keys: [ zooms out one level, ] zooms back in to the child you came from (remembered per window);
//   - the floor, a state of the office page (?floor=3): the step in the path follows the floor tabs;
//   - window.rsPath (a page adds or takes away a state step: a floor, a port), window.rsZoom (one scripted
//     container move on the spring, retargeted from where it is if a second move starts), window.rsGo.
// Reduced motion: nothing is named or scaled; the page cross-fades (nav.css) and steps appear at once.
import { navigate } from 'astro:transitions/client';
import { zoomLevel, zoomDir } from './zoom-level.mjs';
import { spring, springEasing, retarget } from './spring.mjs';

const W = window, D = document;
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
const inSite = (u) => { const p = u.pathname; return p.startsWith(BASE) ? p.slice(BASE.length) || '/' : p; };
const levelOf = (u) => zoomLevel(inSite(u), u.search, u.hash);
const reduced = () => (window.rsReducedNow ? window.rsReducedNow() : matchMedia('(prefers-reduced-motion: reduce)').matches);
const M = () => (W.rsMotion ? W.rsMotion() : { reduced: true, zoom: 360, exit: 240, ease: 'ease' });
const esc = (s) => (W.CSS && CSS.escape ? CSS.escape(s) : s);
const recName = (id) => 'rec-' + String(id).replace(/[^a-zA-Z0-9_-]/g, '-');
const isShape = (el) => el instanceof SVGElement && !!el.ownerSVGElement;
const shown = (el) => { if (!el || !el.isConnected) return null; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 ? r : null; };

// ---- ] remembers the child you zoomed out of, per window ----
const KEY = 'rs6-zoom-back';
const keyOf = (u) => inSite(u) + u.search;
const back = {
  get(u) { try { return (JSON.parse(sessionStorage.getItem(KEY) || '{}'))[keyOf(u)] || null; } catch (_) { return null; } },
  put(parent, child) {
    try { const m = JSON.parse(sessionStorage.getItem(KEY) || '{}'); m[keyOf(parent)] = child.href; sessionStorage.setItem(KEY, JSON.stringify(m)); } catch (_) {}
  },
};

// ---- A stand-in box for a shape on a drawing, placed where the shape is, on the page ----
function proxyAt(rect, name) {
  const p = D.createElement('div');
  p.className = 'rs-zoom-proxy'; p.setAttribute('aria-hidden', 'true');
  Object.assign(p.style, { left: rect.left + scrollX + 'px', top: rect.top + scrollY + 'px', width: rect.width + 'px', height: rect.height + 'px' });
  p.style.viewTransitionName = name; p.style.viewTransitionClass = 'rec';
  D.body.appendChild(p);
  return p;
}
// Where the zoom's scale grows from: the shape's centre, as a share of the page body (main).
function originAt(rect) {
  const m = D.querySelector('main'); if (!m || !rect) return;
  const b = m.getBoundingClientRect();
  const x = Math.round(((rect.left + rect.width / 2 - b.left) / Math.max(1, b.width)) * 100);
  const y = Math.round(((rect.top + rect.height / 2 - b.top) / Math.max(1, b.height)) * 100);
  W.__rsZoomOrigin = [Math.min(100, Math.max(0, x)) + '%', Math.min(100, Math.max(0, y)) + '%'];
}
const applyOrigin = () => {
  const o = W.__rsZoomOrigin; if (!o) return;
  D.documentElement.style.setProperty('--zx', o[0]); D.documentElement.style.setProperty('--zy', o[1]);
};

let pending = null;   // after the swap: the shape on the parent page the child shrinks back into

// A page can hold two elements that stand for the same record (an office's title and its plan), and two equal
// names stop the move altogether. Keep one, the picture rather than the title. Reduced motion: nothing travels,
// so no record is named on either page.
D.addEventListener('astro:before-preparation', (e) => {
  const load = e.loader;
  e.loader = async () => {
    await load();
    [D, e.newDocument].forEach((root) => {
      if (!root) return;
      const els = root.querySelectorAll('[data-vt-here], [data-vt-rec]');
      if (reduced()) { els.forEach((el) => { el.style.viewTransitionName = 'none'; }); return; }
      const byName = new Map();
      els.forEach((el) => { const n = el.style.viewTransitionName; if (n && n !== 'none') byName.set(n, [...(byName.get(n) || []), el]); });
      byName.forEach((list) => {
        if (list.length < 2) return;
        const keep = list.find((el) => !/^H[1-6]$/.test(el.tagName)) || list[0];
        list.forEach((el) => { if (el !== keep) el.style.viewTransitionName = 'none'; });
      });
    });
  };
});

D.addEventListener('astro:before-preparation', (e) => {
  W.__rsZoomOrigin = null; pending = null;
  const from = new URL(location.href), to = e.to;
  // A floor's thumbnail (FloorMap detail="thumb") is the same map as the plan and the space it opens, so pressing
  // it zooms in even from a page that is not one level up (Home, leadership): data-zoom-in on the link says so.
  const src0 = e.sourceElement && e.sourceElement.closest ? e.sourceElement : null;
  const dir = zoomDir(levelOf(from), levelOf(to)) || (src0 && src0.closest('[data-zoom-in]') && levelOf(to) != null ? 'in' : null);
  if (!dir) return;
  W.__rsNavDir = 'zoom-' + dir;
  D.documentElement.setAttribute('data-nav-dir', W.__rsNavDir);
  if (dir === 'in') back.put(from, to); else back.put(to, from);
  const src = e.sourceElement && e.sourceElement.closest ? e.sourceElement : null;
  if (src) originAt(src.getBoundingClientRect());
  const load = e.loader;
  e.loader = async () => {
    await load();
    const nd = e.newDocument;
    if (!nd || reduced()) return;
    // The path: the step that arrives (in) or leaves (out) slides; the rest of the top bar stays.
    // (A unit's page writes its path once its data is in, so its first path is not the one to slide.)
    const step = dir === 'in' && levelOf(to) === 5 ? null : (dir === 'in' ? nd : D).querySelector('.crumbs [aria-current]');
    if (step) step.style.viewTransitionName = 'crumb-step';
    if (dir === 'in') {
      // A shape on a drawing (a room on the floor plan): a box stands in for it and becomes the next picture.
      const shape = src && src.closest('[data-vt-rec]');
      const target = shape && nd.querySelector('[data-vt-here="' + esc(shape.dataset.vtRec) + '"]');
      if (shape && isShape(shape) && target && !src.closest('a')) {
        const r = shown(shape);
        if (r) { proxyAt(r, recName(shape.dataset.vtRec)); target.style.viewTransitionName = recName(shape.dataset.vtRec); target.style.viewTransitionClass = 'rec'; }
      }
    } else {
      // The Shell named the parent's shape for this record. If that shape is on a drawing, a box stands in for
      // it once the parent page is drawn (after the swap), so the picture can shrink back into it.
      nd.querySelectorAll('[data-vt-rec]').forEach((el) => {
        const n = el.style.viewTransitionName;
        if (!n || n === 'none' || !isShape(el)) return;
        el.style.viewTransitionName = ''; el.style.viewTransitionClass = '';
        pending = el.dataset.vtRec;
      });
    }
  };
});

// The new page's scripts run after its picture is taken, so the floor the address names is shown here first
// (DetailTabs then finds it already chosen), and the plans are turned for a narrow window (FloorMap).
function showFloorNow() {
  const dt = floorTabs(), f = new URL(location.href).searchParams.get('floor');
  const id = 'floor-' + f;
  if (dt && f && dt.querySelector('[data-dt-panel="' + esc(id) + '"]')) {
    dt.querySelectorAll('[data-dt-panel]').forEach((p) => { p.hidden = p.dataset.dtPanel !== id; });
    dt.querySelectorAll('[data-dt-tab]').forEach((t) => { const on = t.dataset.dtTab === id; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
  }
  if (W.rsFloorMapsInit) W.rsFloorMapsInit();
}

D.addEventListener('astro:after-swap', () => {
  // Arriving on a floor (?floor=3), by any move: the floor is shown before the new page's picture is taken, so a
  // thumbnail of that floor grows into its plan rather than into a hidden tab.
  if (new URL(location.href).searchParams.get('floor')) showFloorNow();
  if (!String(D.documentElement.getAttribute('data-nav-dir') || '').startsWith('zoom')) return;
  if (pending && !reduced()) {
    const id = pending; pending = null;
    showFloorNow();
    // The floor plan shows the floor the address names; the shape is on it. Otherwise its card will do.
    const all = [...D.querySelectorAll('[data-vt-rec="' + esc(id) + '"]')];
    const shape = all.find((el) => isShape(el) && shown(el));
    const card = all.find((el) => !isShape(el) && shown(el));
    if (shape) { const r = shown(shape); proxyAt(r, recName(id)); originAt(r); }
    else if (card) { card.style.viewTransitionName = recName(id); card.style.viewTransitionClass = 'rec'; originAt(shown(card)); }
  }
  applyOrigin();
});
D.addEventListener('astro:before-swap', (e) => {
  const done = () => { D.querySelectorAll('.rs-zoom-proxy').forEach((p) => p.remove()); D.documentElement.style.removeProperty('--zx'); D.documentElement.style.removeProperty('--zy'); };
  if (e.viewTransition && e.viewTransition.finished) e.viewTransition.finished.then(done, done); else setTimeout(done, 800);
});

// ---- One scripted container move on the spring (rsZoom) ----
// Moves `el` from the box `from` (a DOMRect-like) to where it is now. If `el` is already moving, the new move
// starts from where it is, at the speed it is going, so two quick moves read as one.
W.rsZoom = function (el, from, opts = {}) {
  const m = M(); if (!el || !el.animate || m.reduced) return null;
  const now = performance.now(), prev = el.__rsZoom;
  let velocity = 0;
  if (prev && prev.anim.playState === 'running') {
    const r = retarget(prev.state, now);
    from = el.getBoundingClientRect();        // where it is on screen, mid-move
    velocity = r.speed; prev.anim.cancel();
  }
  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return null;
  const dx = from.left - to.left, dy = from.top - to.top;
  const sx = opts.scale === false ? 1 : (from.width || to.width) / to.width, sy = opts.scale === false ? 1 : (from.height || to.height) / to.height;
  const k = [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, transformOrigin: '0 0', opacity: opts.fade ? 0 : 1 }, { transform: 'none', transformOrigin: '0 0', opacity: 1 }];
  const o = { duration: opts.duration || m.zoom, bounce: 0, velocity };
  const anim = el.animate(k, { duration: o.duration, easing: springEasing(o) });
  el.__rsZoom = { anim, state: { s: spring(o), t0: now } };
  anim.onfinish = () => { if (el.__rsZoom && el.__rsZoom.anim === anim) el.__rsZoom = null; };
  return anim;
};

// ---- The path's state steps (a floor on the office page, a port on the device page) ----
function crumbs() { return D.querySelector('.mast .crumbs'); }
W.rsPath = {
  // Add a last step (the current one before it becomes a link to `prevTo`), sliding in from the right.
  push(label, level, prevTo) {
    const nav = crumbs(); if (!nav) return;
    nav.querySelectorAll('.zp-leaving').forEach((s) => s.__rsDone && s.__rsDone());   // a step still sliding out goes now
    const cur = nav.querySelector('[aria-current]');
    if (cur && prevTo) {
      const a = D.createElement('a'); a.href = prevTo; a.textContent = cur.textContent;
      if (cur.dataset.zl) a.dataset.zl = cur.dataset.zl;
      cur.replaceWith(a);
    }
    const sep = D.createElement('span'); sep.className = 'sep zp-sep'; sep.setAttribute('aria-hidden', 'true'); sep.textContent = '/';
    const step = D.createElement('span'); step.className = 'zp-step'; step.setAttribute('aria-current', 'page'); step.dataset.zl = String(level); step.textContent = label;
    nav.append(sep, step);
    const r = step.getBoundingClientRect();
    W.rsZoom(step, { left: r.left + 16, top: r.top, width: r.width, height: r.height }, { scale: false, fade: true });
  },
  // Rename the state step in place (another floor chosen): the words change, nothing moves.
  rename(label) { const s = crumbs() && crumbs().querySelector('.zp-step'); if (s) s.textContent = label; },
  // Take the last state step away, sliding out to the right; the step before it is current again.
  pop() {
    const nav = crumbs(); const step = nav && nav.querySelector('.zp-step'); if (!step) return;
    const sep = step.previousElementSibling, prev = sep && sep.previousElementSibling;
    // The path is right at once (the step before is current again); only the leaving words take a moment.
    step.classList.replace('zp-step', 'zp-leaving'); step.removeAttribute('aria-current'); step.setAttribute('aria-hidden', 'true');
    if (prev && prev.tagName === 'A') { const s = D.createElement('span'); s.setAttribute('aria-current', 'page'); s.textContent = prev.textContent; if (prev.dataset.zl) s.dataset.zl = prev.dataset.zl; prev.replaceWith(s); }
    const finish = step.__rsDone = () => { step.remove(); if (sep && sep.classList.contains('zp-sep')) sep.remove(); };
    const m = M();
    if (m.reduced || !step.animate) { finish(); return; }
    const an = step.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(16px)' }], { duration: m.exit, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
    an.onfinish = finish; an.oncancel = finish;
  },
  has() { return !!(crumbs() && crumbs().querySelector('.zp-step')); },
};

// ---- Going to a page with the zoom (a room on the floor plan is a shape, not a link) ----
W.rsGo = (url, sourceElement) => navigate(url, sourceElement ? { sourceElement } : undefined);

// ---- The floor: a state of the office page (?floor=3) ----
function floorTabs() { return D.querySelector('main [data-dt][data-dt-param="floor"]'); }
const floorLabel = (dt, id) => { const t = dt.querySelector('[data-dt-tab="' + esc(id) + '"]'); return t ? (t.firstChild ? t.firstChild.textContent : t.textContent).trim() : ''; };
function setFloorUrl(f) {
  const u = new URL(location.href);
  if (f) u.searchParams.set('floor', f); else u.searchParams.delete('floor');
  u.hash = '';
  try { history.replaceState(history.state, '', u.pathname + u.search); } catch (_) {}
}
function initFloors() {
  const dt = floorTabs(); if (!dt || dt.__rsZoom || !crumbs() || !crumbs().hasAttribute('data-zoom')) return;
  dt.__rsZoom = true;
  const office = location.pathname;
  const q = new URL(location.href).searchParams.get('floor');
  if (q && dt.querySelector('[data-dt-tab="floor-' + esc(q) + '"]')) {
    // Arrived on a floor: the path shows it, still (the page's own move already happened).
    const m = W.rsZoom; W.rsZoom = () => null; W.rsPath.push(floorLabel(dt, 'floor-' + q), 3, office); W.rsZoom = m;
  }
  dt.addEventListener('dt:change', (e) => {
    const f = String(e.detail.id || '').replace(/^floor-/, '');
    setFloorUrl(f);
    if (W.rsPath.has()) W.rsPath.rename(floorLabel(dt, e.detail.id)); else W.rsPath.push(floorLabel(dt, e.detail.id), 3, office);
  });
}

// ---- Keys: [ out, ] back in ----
function zoomOut() {
  const nav = crumbs(); if (!nav) return false;
  const links = nav.querySelectorAll('a[href]'); const up = links[links.length - 1];
  if (!up) return false;
  const here = new URL(location.href), there = new URL(up.href, location.href);
  // Out of a state (a floor, a port) is a change on this page, not a new page.
  if (there.pathname === here.pathname && W.rsPath.has()) {
    back.put(there, here);
    const dt = floorTabs();
    if (dt) setFloorUrl(null);
    D.dispatchEvent(new CustomEvent('rs:zoom-out', { detail: { from: here.href } }));
    W.rsPath.pop();
    return true;
  }
  up.click();
  return true;
}
function zoomIn() {
  const to = back.get(new URL(location.href)); if (!to) return false;
  const here = new URL(location.href), there = new URL(to, location.href);
  if (there.pathname === here.pathname) {
    const f = there.searchParams.get('floor'), dt = floorTabs();
    if (f && dt && dt.rsTabs) { dt.rsTabs.select('floor-' + f); if (!W.rsPath.has()) { setFloorUrl(f); W.rsPath.push(floorLabel(dt, 'floor-' + f), 3, here.pathname); } return true; }
    D.dispatchEvent(new CustomEvent('rs:zoom-in', { detail: { to: there.href } }));
    return true;
  }
  navigate(there.href);
  return true;
}
D.addEventListener('keydown', (e) => {
  if (e.key !== '[' && e.key !== ']') return;
  const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  if (typing || e.metaKey || e.ctrlKey || e.altKey || D.querySelector('dialog[open]') || D.documentElement.classList.contains('ks-lock')) return;
  if (e.key === '[' ? zoomOut() : zoomIn()) e.preventDefault();
});

initFloors();
D.addEventListener('astro:page-load', initFloors);
