// The office plan's lenses and selection in the browser (design notes; docs/rules/motion.md).
//
// Markup it reads, inside the office's root:
//   [data-lens-strip]       LensStrip.astro: [data-lens-pick] pills, [data-lens-select], [data-lens-says]
//   [data-fm]               each floor's FloorMap; its rooms are [data-sel="room:<id>"] with a ring (.fm-g) and label (.fm-lt)
//   [data-lens-data]        JSON: { <space id>: { support, network, projects, vendors, knowledge } } (src/lib/lens-data.mjs)
//   [data-lens-key]         LensKey.astro's lists, one per lens
//   [data-sel-box]          the selected-space box under the plan
//   [data-loc-racks]        rack id to its comms room, so a rack opens its room
// The Health lens reads the live state that src/lib/locations-client.mjs publishes on each tick (root.__rooms).
//
// A lens switch: the strip's marker slides (M12), every ring eases to its new state together (--dur-state, the
// km-ring's dash transition), the labels cross-fade; the plan never moves. A selection outlines the space in the accent
// and fills the box under the plan in place (rsHold). `L` cycles lenses; Escape clears the selection, then zooms out.
// The lens is in the address (?lens=support), so Back and a shared link keep it.
import { LENSES, lensOf, pickLens, nextLens, healthLens } from './lenses.mjs';
import { glyph, WORD } from './health.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function startLenses(root) {
  if (!root || root.__lens) return () => {};
  root.__lens = true;
  const W = window, D = document;
  const M = () => (W.rsMotion ? W.rsMotion() : { reduced: true, exit: 0 });
  const data = JSON.parse(root.querySelector('[data-lens-data]')?.textContent ?? '{}');
  const racks = JSON.parse(root.querySelector('[data-loc-racks]')?.dataset.locRacks ?? '{}');
  const strip = root.querySelector('[data-lens-strip]');
  const pills = strip?.querySelector('[data-lens-pills]');
  const select = strip?.querySelector('[data-lens-select]');
  const says = root.querySelector('[data-lens-says]');
  // Two places show the chosen space: the sticky side panel beside the plan on a wide page, and the picture card
  // under the plan when the panel stacks below it (the page's CSS shows the one that applies).
  const boxes = [...root.querySelectorAll('[data-sel-box]')];
  const B = (D.querySelector('[data-loc-model]') && JSON.parse(D.querySelector('[data-loc-model]').textContent).base) || '/';
  const figs = () => [...root.querySelectorAll('[data-fm]')];
  const roomsEls = () => [...root.querySelectorAll('[data-sel^="room:"]')];
  const idOf = (el) => el.dataset.sel.slice(5);
  roomsEls().forEach((g) => { if (!g.dataset.name) g.dataset.name = g.getAttribute('aria-label') ?? idOf(g); });
  const nameOf = (id) => root.querySelector(`[data-sel="room:${CSS.escape(id)}"]`)?.dataset.name ?? id;
  const mods = () => (W.rsModules ? W.rsModules() : {});
  let lens = pickLens(new URL(location.href).searchParams.get('lens') ?? 'health', mods());
  let sel = null;
  let frame = null;   // Replay: { [space id]: reading } while a past moment is shown

  // ---- One space's reading under a lens --------------------------------------------------------------------------
  function reading(id, l = lens) {
    if (frame) return frame[id] ?? healthLens('free');
    if (l === 'health') {
      const r = root.__rooms?.get(id) ?? { st: root.querySelector(`[data-sel="room:${CSS.escape(id)}"]`)?.dataset.st ?? 'free', why: '' };
      return healthLens(r.st, r.why);
    }
    return data[id]?.[l] ?? { h: 'off', word: 'Not recorded', label: '', line: 'Nothing recorded for the space.' };
  }
  const shown = () => (frame ? 'health' : lens);

  // ---- Drawing the plan --------------------------------------------------------------------------------------------
  function label(t, text) {
    const fits = text && text.length * 0.35 <= +(t.dataset.w ?? 0) - 0.7;
    const next = fits ? text : '';
    if (t.textContent === next) return;
    if (M().reduced || !t.textContent) { t.textContent = next; return; }
    t.classList.add('fm-lt-out');
    setTimeout(() => { t.textContent = next; t.classList.remove('fm-lt-out'); }, M().exit);
  }
  function paint() {
    const l = shown();
    figs().forEach((f) => { f.dataset.lens = l; f.toggleAttribute('data-then', !!frame); });
    roomsEls().forEach((g) => {
      const id = idOf(g), r = reading(id, l);
      const closed = l === 'health' && !frame && (root.__rooms?.get(id)?.st ?? g.dataset.st) === 'closed';
      const h = closed ? 'none' : r.h;
      if (g.dataset.h !== h) g.dataset.h = h;
      const ring = g.querySelector('.fm-g .hg-ring');
      if (ring && h !== 'none' && ring.dataset.s !== r.h) ring.dataset.s = r.h;
      const t = g.querySelector('.fm-lt');
      if (t) label(t, l === 'health' ? (frame ? '' : nameOf(id).replace(/^\d[\w.]*\s/, '')) : r.label);
      const tip = g.querySelector('rect > title');
      if (tip) tip.textContent = `${nameOf(id)}: ${r.word}${r.line ? `. ${r.line}` : ''}${r.who ? ` With ${r.who}.` : ''}`;
      g.setAttribute('aria-label', `${nameOf(id)}, ${lensOf(l).label}: ${r.word}`);
    });
    if (sel) fillBox(false);
  }

  // ---- The strip -------------------------------------------------------------------------------------------------
  function drawStrip() {
    const m = mods();
    strip?.querySelectorAll('[data-lens-pick]').forEach((b) => {
      const on = b.dataset.lensPick === shown();
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (frame && !on) { b.setAttribute('aria-disabled', 'true'); b.title = 'Replay shows Health. Press Now to change lens.'; }
      else { b.removeAttribute('aria-disabled'); b.title = lensOf(b.dataset.lensPick).says; }
    });
    if (select) {
      [...select.options].forEach((o) => { o.hidden = m[lensOf(o.value).module] === 'off'; o.disabled = o.hidden || (!!frame && o.value !== 'health'); });
      select.value = shown();
    }
    if (says) says.textContent = frame ? 'Replay: Health as it was at that moment. Simulated.' : `${lensOf(shown()).says}. Simulated.`;
    root.querySelectorAll('[data-lens-key]').forEach((u) => { u.hidden = u.dataset.lensKey !== shown(); });
    const kn = root.querySelector('[data-lens-key-name]'); if (kn) kn.textContent = lensOf(shown()).label;
  }
  function setUrl() {
    const u = new URL(location.href);
    if (lens === 'health') u.searchParams.delete('lens'); else u.searchParams.set('lens', lens);
    try { history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (_) {}
  }
  function setLens(next, { url = true } = {}) {
    next = pickLens(next, mods());
    if (frame) return;
    if (next === lens && root.dataset.lensDrawn) return;
    lens = next; root.dataset.lensDrawn = '1';
    drawStrip(); paint();
    if (url) setUrl();
  }
  if (pills && W.rsMarkerWatch) W.rsMarkerWatch(pills, '[aria-pressed=true]');
  strip?.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-lens-pick]');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    setLens(b.dataset.lensPick);
  });
  select?.addEventListener('change', () => setLens(select.value));

  // ---- Selection ----------------------------------------------------------------------------------------------------
  function boxHtml() {
    const r = reading(sel);
    const others = LENSES.filter((l) => l.id !== shown() && mods()[l.module] !== 'off').map((l) => ({ l, r: frame ? null : reading(sel, l.id) })).filter((x) => x.r);
    const g = (h) => (h === 'none' ? 'off' : h);
    return `<div class="sel-h"><b>${esc(nameOf(sel))}</b><span class="faint">${frame ? 'as it was then' : 'selected'}</span>`
      + `<button type="button" class="sel-x" data-sel-clear aria-label="Clear the selection (Escape)">Clear</button></div>`
      + `<p class="sel-now">${glyph(g(r.h), { size: 16, word: r.word })}<span>${esc(r.line)}${r.who ? ` · With ${esc(r.who)}` : ''}${r.on ? ` · ${esc(r.on)}` : ''}</span></p>`
      + (others.length ? `<ul class="sel-more">${others.map(({ l, r: o }) => `<li><span class="sel-l">${esc(l.label)}</span>${glyph(g(o.h), { size: 12, title: o.word })}<span><b>${esc(o.word)}</b> ${esc(o.line)}</span></li>`).join('')}</ul>` : '')
      + `<a class="sel-open" href="${B}rooms/${esc(sel)}/" data-sel-open>Open the space <span aria-hidden="true">→</span></a>`;
  }
  function fillBox(hold = true) {
    const next = sel ? boxHtml() : '';
    boxes.forEach((box) => {
      if (box.innerHTML === next && box.hidden === !sel) return;
      const update = () => { box.hidden = !sel; box.innerHTML = next; };
      const panel = box.closest('[data-side-panel]');
      if (!hold) update();
      else if (panel && W.rsPanelSwap) W.rsPanelSwap(panel, update);
      else if (W.rsHold) W.rsHold(box.closest('.card') ?? root, update);
      else update();
    });
  }
  function select_(id) {
    sel = id;
    roomsEls().forEach((g) => { const on = idOf(g) === id; g.classList.toggle('is-sel', on); g.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    fillBox();
  }
  function open(id, from) {
    const url = `${B}rooms/${id}/`;
    if (W.rsGo) W.rsGo(url, from); else location.href = url;
  }
  function onPick(e) {
    if (e.target.closest?.('[data-sel-clear]')) { select_(null); return; }
    const opener = e.target.closest?.('[data-sel-open]');
    if (opener && e.type === 'click') { e.preventDefault(); open(sel, root.querySelector(`[data-sel="room:${CSS.escape(sel)}"]`)); return; }
    const g = e.target.closest?.('[data-sel^="room:"], [data-sel^="rack:"]');
    if (!g || !root.contains(g)) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const [kind, id] = [g.dataset.sel.slice(0, 4), g.dataset.sel.replace(/^[a-z]+:/, '')];
    if (kind === 'rack') { if (racks[id]) open(racks[id], g); return; }
    // First press chooses the space; a second press on the chosen one zooms into it.
    if (sel === id) open(id, g); else select_(id);
  }
  root.addEventListener('click', onPick);
  root.addEventListener('keydown', onPick);
  root.querySelectorAll('[data-sel^="room:"]').forEach((g) => g.setAttribute('aria-pressed', 'false'));

  // ---- Keys: L cycles lenses; Escape clears the selection, then zooms out ----------------------------------------------
  function onKey(e) {
    if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey || D.querySelector('dialog[open]') || D.documentElement.classList.contains('ks-lock')) return;
    if ((e.key === 'l' || e.key === 'L') && !frame) { e.preventDefault(); setLens(nextLens(lens, mods())); return; }
    if (e.key === 'Escape') {
      if (sel) { e.preventDefault(); select_(null); return; }
      // Nothing chosen: out one level, as `[` does (src/lib/zoom-client.mjs).
      D.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }));
    }
  }
  D.addEventListener('keydown', onKey);

  // ---- Live and demo changes -------------------------------------------------------------------------------------------
  const onTick = () => { if (lens === 'health' || sel) paint(); };
  root.addEventListener('loc:tick', onTick);
  const onDemo = () => { const want = pickLens(lens, mods()); drawStrip(); if (want !== lens) setLens(want); };
  D.addEventListener('rs:demo-change', onDemo);

  // Replay (src/lib/replay-client.mjs) shows a past moment through here.
  root.__lensApi = {
    showFrame(readings) { frame = readings; drawStrip(); paint(); },
    live() { frame = null; drawStrip(); paint(); },
    get lens() { return lens; },
  };

  root.dataset.lensDrawn = '';
  setLens(lens, { url: false });
  return () => { D.removeEventListener('keydown', onKey); D.removeEventListener('rs:demo-change', onDemo); };
}
