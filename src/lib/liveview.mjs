// Browser helpers for the live overviews (Rooms and Devices). The simulation itself is src/lib/livesim.mjs;
// this is how its changes reach the page without moving it (docs/rules/motion.md, M2, M6, M10):
//   every()       calls a function at every tick of the wall clock, paused while the tab is hidden
//   steady()      makes a change and keeps what the person is looking at where it was
//   refresh()     swaps an item for a fresh copy, so the filter bar reads its new status next time it filters
//   syncList()    brings a keyed list to a new set of rows: rows that stay slide, new rows grow in, gone rows
//                 shrink away, and the list eases to its new height
//   pushFeed()    adds the newest events to the top of a fixed-length feed; the rest slide down one place
//   visible()     whether an item passes the filter bar's find box and facets (all but Status)
import { TICK_MS, tickOf } from './livesim.mjs';

const W = typeof window !== 'undefined' ? window : {};
export const motion = () => (W.rsMotion ? W.rsMotion() : { reduced: true, ease: 'ease', morph: 520, enter: 440, exit: 240, state: 300 });
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const clock = (ms) => new Date(ms).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
export function ago(ms, now) {
  const m = Math.floor((now - ms) / 60e3);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
}
export function span(min) { return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`; }

// Call fn(tickTime) on every tick boundary, and once more when the tab comes back. Returns stop().
export function every(fn) {
  let timer = 0, stopped = false;
  const loop = () => {
    if (stopped) return;
    const now = Date.now();
    timer = setTimeout(() => { if (!document.hidden) fn(tickOf(Date.now())); loop(); }, tickOf(now) + TICK_MS - now + 40);
  };
  const back = () => { if (!document.hidden && !stopped) fn(tickOf(Date.now())); };
  document.addEventListener('visibilitychange', back);
  loop();
  return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', back); };
}

// Make a change without moving what the person is reading: the first marked block still on screen under the
// top bar and filter bar keeps its place. At the very top of the page nothing is held: things below simply move.
export function steady(fn) {
  if (W.scrollY < 4) { fn(); return; }
  const cs = getComputedStyle(document.documentElement);
  const line = (parseFloat(cs.getPropertyValue('--mast-h')) || 60) + (parseFloat(cs.getPropertyValue('--fb-h')) || 0);
  const anchor = [...document.querySelectorAll('[data-steady]')].find((el) => el.offsetParent && el.getBoundingClientRect().bottom > line + 8);
  const y0 = anchor ? anchor.getBoundingClientRect().top : 0;
  fn();
  if (!anchor || !anchor.isConnected) return;
  const dy = anchor.getBoundingClientRect().top - y0;
  if (Math.abs(dy) > 0.5) W.scrollBy(0, dy);
}

// A fresh copy of an item, so the filter bar (which reads an item once) sees its new status. The copy keeps
// the item's classes (shown, hidden, past "Show all"), its focus and an open peek card. The copy starts as
// the old one looked, so its colour eases to the new state.
export function refresh(el, apply) {
  const n = el.cloneNode(true), focused = document.activeElement === el, P = W.__rsPeek;
  el.replaceWith(n);
  if (focused) n.focus({ preventScroll: true });
  n.getBoundingClientRect();
  apply(n);
  if (P && P.from === el) { const pinned = P.pinned; P.pinned = false; P.show(n); if (pinned) { P.pinned = true; n.classList.add('peek-pinned'); } }
  return n;
}

// Show an open peek card again when what it describes changed (Peek copies its template when it opens).
export function repeek(el) {
  const P = W.__rsPeek;
  if (!P || P.from !== el || P.card?.hidden) return;
  const pinned = P.pinned; P.pinned = false; P.show(el); if (pinned) { P.pinned = true; el.classList.add('peek-pinned'); }
}

// A brief ring on an item that just changed, easing in and out (M10, without a person's name).
export function ping(el) {
  if (!el) return;
  clearTimeout(el.__lvPing);
  el.classList.add('lv-hit');
  el.__lvPing = setTimeout(() => el.classList.remove('lv-hit'), parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-linger')) || 4000);
}

// A leaving thing shrinks to its own centre where it was, above the page, and takes no clicks (M2).
function ghost(el, M) {
  const r = el.getBoundingClientRect();
  if (!r.height || M.reduced) return;
  const g = el.cloneNode(true);
  g.removeAttribute('data-vk'); g.removeAttribute('id'); g.setAttribute('aria-hidden', 'true'); g.inert = true;
  Object.assign(g.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: '0', zIndex: '5', pointerEvents: 'none', boxSizing: 'border-box' });
  document.body.appendChild(g);
  g.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.9)', opacity: 0 }], { duration: M.exit, easing: M.ease, fill: 'forwards' }).onfinish = () => g.remove();
}

// Bring a list (its children keyed by data-vk) to `rows`: [{ key, html, attrs }] in order. make(row) builds a
// new element. Rows that stay slide to their place; new rows grow in; gone rows shrink away; the list eases
// to its new height. Returns the elements that were added.
export function syncList(list, rows, make, { animate = true } = {}) {
  const M = motion(), move = animate && !M.reduced;
  const old = new Map([...list.children].filter((el) => el.dataset.vk).map((el) => [el.dataset.vk, el]));
  const first = new Map(), h0 = list.getBoundingClientRect().height;
  if (move) old.forEach((el, k) => { if (el.offsetParent) first.set(k, el.getBoundingClientRect()); });
  const want = new Set(rows.map((r) => r.key)), added = [];
  steady(() => {
    old.forEach((el, k) => { if (!want.has(k)) { if (move && el.offsetParent) ghost(el, M); el.remove(); } });
    let before = list.firstElementChild;
    for (const r of rows) {
      let el = old.get(r.key);
      if (!el) { el = make(r); el.dataset.vk = r.key; added.push(el); }
      if (r.html !== undefined && el.__lvHtml !== r.html) el.innerHTML = r.html;
      if (r.html !== undefined) el.__lvHtml = r.html;
      if (el !== before) list.insertBefore(el, before); else before = before.nextElementSibling;
    }
  });
  if (!move) return added;
  const h1 = list.getBoundingClientRect().height;
  if (Math.abs(h1 - h0) > 1) list.animate([{ height: `${h0}px`, overflow: 'clip' }, { height: `${h1}px`, overflow: 'clip' }], { duration: M.morph, easing: M.ease });
  [...list.children].forEach((el) => {
    const a = first.get(el.dataset.vk);
    if (!el.offsetParent) return;
    if (a) {
      const b = el.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) + Math.abs(dy) > 0.5) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: M.morph, easing: M.ease });
    } else if (added.includes(el)) {
      el.animate([{ transform: 'scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: M.enter, delay: M.delay ?? 120, easing: M.ease, fill: 'backwards' });
    }
  });
  return added;
}

// A feed of `size` rows, newest first. Rows keep one height, so the feed never changes size: new rows grow in
// at the top, the others slide down one place, and the oldest shrinks away at the foot.
export function pushFeed(list, rows, make, size, { animate = true } = {}) {
  const M = motion(), move = animate && !M.reduced;
  const first = new Map();
  if (move) [...list.children].forEach((el) => first.set(el, el.getBoundingClientRect()));
  const fresh = rows.map(make);
  for (let i = fresh.length - 1; i >= 0; i--) list.insertBefore(fresh[i], list.firstElementChild);
  [...list.children].slice(size).forEach((el) => { if (move) ghost(el, M); el.remove(); });
  if (!move) return;
  [...list.children].forEach((el) => {
    const a = first.get(el);
    if (a) {
      const dy = a.top - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: M.morph, easing: M.ease });
    } else el.animate([{ transform: 'scale(.94)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: M.enter, easing: M.ease, fill: 'backwards' });
  });
}

// The filter bar's choices, read for things the bar does not filter itself (the feed, the attention list).
export function filterOf(bar, keys) {
  const q = norm(bar?.querySelector('[data-fb-q]')?.value).trim();
  const sel = {};
  for (const k of keys) sel[k] = bar?.rsFilter ? bar.rsFilter.get(k) : [];
  return { words: q ? q.split(/\s+/) : [], sel };
}
// item: { find: 'words', [key]: value or [values] }
export function visible(item, f) {
  const text = norm(item.find);
  for (const w of f.words) if (!text.includes(w)) return false;
  for (const k in f.sel) {
    const s = f.sel[k]; if (!s.length) continue;
    const v = [].concat(item[k] ?? []);
    if (!v.some((x) => s.includes(String(x)))) return false;
  }
  return true;
}

// A column that sticks under the top bar and filter bar, or by its foot when it is taller than the window,
// so every part of it can be reached by scrolling the page (layout.md, L8). Returns stop().
export function stickSide(el) {
  const fit = () => {
    const cs = getComputedStyle(document.documentElement);
    const top = (parseFloat(cs.getPropertyValue('--mast-h')) || 60) + (parseFloat(cs.getPropertyValue('--fb-h')) || 0) + 16;
    const h = el.offsetHeight;
    el.style.setProperty('--lv-top', `${h > innerHeight - top - 16 ? Math.round(innerHeight - h - 16) : top}px`);
  };
  fit();
  const ro = W.ResizeObserver ? new ResizeObserver(fit) : null;
  ro?.observe(el);
  addEventListener('resize', fit);
  return () => { ro?.disconnect(); removeEventListener('resize', fit); };
}
