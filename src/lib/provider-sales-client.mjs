// The sales pages' own script (src/pages/portfolio/sales/): the design's edits, the quote's versions, the handoff and
// printing. The maths is the same module the pages were built with (src/lib/provider-sales.mjs), so a figure here is
// always the figure the build would give. Every move is the motion library's, once, and lands at once under reduced
// motion (docs/rules/motion.md, rows 55 to 57):
//   55  the design: a changed quantity, model or rate ticks the room, the BOM and the totals into place (km-tick, wired
//       site-wide on [data-tick]); the BOM's totals tick in the first time they are seen (arrive)
//   56  the quote: switching versions cross-fades the two, and the box eases to its new height
//   57  accept: the design card flies into the client's Keia on the zero-bounce spring, and the proposed project
//       fills in where it lands
import km from './motion-library.js';
import { arrive } from './arrive.mjs';
import { rollUp, estimateLabour, summariseLabour, priceQuote, money, hoursWords, MARKS } from './provider-sales.mjs';

const clone = (x) => JSON.parse(JSON.stringify(x));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const setText = (el, t) => { if (el && el.textContent !== String(t)) el.textContent = String(t); };

let booted = false;
export function bootSales() {
  if (booted) return;
  booted = true;
  const run = () => {
    const main = document.querySelector('main');
    const d = document.querySelector('[data-sl-design]'); if (d) bindDesign(d);
    const q = document.querySelector('[data-sl-quote]'); if (q) bindQuote(q);
    const a = document.querySelector('[data-sl-accept]'); if (a) bindAccept(a);
    document.querySelectorAll('[data-sl-print]').forEach((b) => { if (b.__sl) return; b.__sl = true; b.addEventListener('click', () => window.print()); });
    if (main) arrive(main);
  };
  document.addEventListener('astro:page-load', run);
}

// ---- The design: quantities, models and rates ----------------------------------------------------------------------
function bindDesign(root) {
  if (root.__sl) return;
  root.__sl = true;
  const D = JSON.parse(root.querySelector('[data-sl-json]').textContent);
  const orig = clone(D.rooms);
  let rooms = clone(D.rooms);
  let rates = {};
  const cur = D.cur;
  const $ = (sel) => root.querySelector(sel);
  const lineAt = (el) => {
    const ro = el.closest('[data-sl-room]'), li = el.closest('[data-sl-line]');
    return ro && li ? [Number(ro.dataset.slRoom), Number(li.dataset.slLine)] : null;
  };
  const markLine = (r, l) => {
    const L = rooms[r].lines[l], O = orig[r].lines[l];
    L.source = L.qty === O.qty && L.model === O.model ? O.source : 'changed';
  };

  root.addEventListener('click', (e) => {
    const step = e.target.closest('[data-sl-step]');
    if (step) {
      const at = lineAt(step); if (!at) return;
      const L = rooms[at[0]].lines[at[1]];
      L.qty = Math.max(0, L.qty + Number(step.dataset.slStep));
      markLine(...at);
      update();
      return;
    }
    if (e.target.closest('[data-sl-reset]')) {
      rooms = clone(orig); rates = {};
      root.querySelectorAll('[data-sl-swap]').forEach((s) => { const at = lineAt(s); if (at) s.value = orig[at[0]].lines[at[1]].model; });
      root.querySelectorAll('[data-sl-rate]').forEach((i) => { i.value = D.L.roles.find((r) => r.id === i.dataset.slRate).sell; });
      update();
    }
  });
  root.addEventListener('change', (e) => {
    const s = e.target.closest('[data-sl-swap]');
    if (!s) return;
    const at = lineAt(s); if (!at) return;
    const L = rooms[at[0]].lines[at[1]], m = D.models[s.value];
    if (!m) return;
    Object.assign(L, { model: s.value, id: s.value, name: m.name, cost: m.cost, sell: m.sell, guide: m.guide, item: null, notInLibrary: false });
    markLine(...at);
    update();
  });
  root.addEventListener('input', (e) => {
    const i = e.target.closest('[data-sl-rate]');
    if (!i || i.value === '' || Number(i.value) < 0) return;
    rates[i.dataset.slRate] = { sell: Number(i.value) };
    update();
  });

  function update() {
    for (const r of rooms) { r.units = r.lines.reduce((n, l) => n + l.qty, 0); r.sell = Math.round(r.lines.reduce((n, l) => n + (l.sell ?? 0) * l.qty, 0) * 100) / 100; }
    const live = rooms.map((r) => ({ ...r, lines: r.lines.filter((l) => l.qty > 0) }));
    const bom = rollUp(live);
    const lab0 = estimateLabour(live, D.L, null, D.labourChanges);
    const lab = summariseLabour(lab0.tasks, D.L, live, lab0.gaps, rates);
    const q = priceQuote({ bom, labour: lab, priceList: { allowance: D.allowance }, discount: D.discount });
    // Rooms and their lines.
    rooms.forEach((r, ri) => {
      const box = $(`[data-sl-room="${ri}"]`); if (!box) return;
      setText(box.querySelector('[data-sl-ru]'), r.units);
      setText(box.querySelector('[data-sl-rs]'), money(r.sell, cur));
      r.lines.forEach((l, li) => {
        const row = box.querySelector(`[data-sl-line="${li}"]`); if (!row) return;
        setText(row.querySelector('[data-sl-q]'), l.qty);
        row.dataset.mark = l.source; row.classList.toggle('is-out', l.qty === 0);
        const chip = row.querySelector('[data-sl-m]'); chip.dataset.mark = l.source; setText(chip, MARKS[l.source].word);
      });
    });
    // Where the lines came from.
    const units = bom.totals.units || 1;
    for (const k of Object.keys(MARKS)) {
      setText($(`[data-sl-mark-n="${k}"]`), bom.totals.marks[k]);
      const bar = $(`[data-sl-bar] [data-mark="${k}"]`); if (bar) bar.style.width = `${(bom.totals.marks[k] / units) * 100}%`;
    }
    renderBom(bom);
    setText($('[data-sl-bt="units"]'), bom.totals.units);
    setText($('[data-sl-bt="sell"]'), money(bom.totals.sell, cur));
    // Labour.
    root.querySelectorAll('tr[data-role]').forEach((tr) => {
      const x = lab.byRole.find((b) => b.id === tr.dataset.role);
      setText(tr.querySelector('[data-c="hours"]'), hoursWords(x?.hours ?? 0));
      setText(tr.querySelector('[data-c="sell"]'), money(x?.sell ?? 0, cur));
    });
    setText($('[data-sl-lt="hours"]'), hoursWords(lab.totals.hours));
    setText($('[data-sl-lt="sell"]'), money(lab.totals.sell, cur));
    lab.byTask.forEach((t) => setText($(`[data-sl-task="${t.task}"]`), hoursWords(t.hours)));
    lab.byRoom.forEach((r) => setText($(`[data-sl-lr="${r.space}"]`), hoursWords(r.hours)));
    setText($('[data-sl-t="hours"]'), hoursWords(lab.totals.hours));
    // What it comes to.
    setText($('[data-sl-t="equipment"]'), money(q.equipment.sell, cur));
    setText($('[data-sl-t="labour"]'), money(q.labour.sell, cur));
    if (q.discount) setText($('[data-sl-t="discount"]'), money(-q.discount.amount, cur));
    setText($('[data-sl-t="total"]'), money(q.totals.sell, cur));
    setText($('[data-sl-t="margin"]'), `${money(q.totals.margin, cur)} · ${q.totals.marginPct.toFixed(1)}%`);
    const edited = JSON.stringify(rooms.map((r) => r.lines.map((l) => [l.qty, l.model]))) !== JSON.stringify(orig.map((r) => r.lines.map((l) => [l.qty, l.model]))) || Object.keys(rates).length > 0;
    const delta = Math.round((q.totals.sell - D.baseline) * 100) / 100;
    setText($('[data-sl-draft-note]'), edited
      ? `A draft of version ${D.v + 1}: ${delta === 0 ? 'the same total as' : `${money(Math.abs(delta), cur)} ${delta < 0 ? 'less than' : 'more than'}`} version ${D.v}. It stays on this page until it is saved as a version.`
      : `The quote for this design is version ${D.v}. Change a quantity or a model below to see a draft of the next one.`);
    const reset = $('[data-sl-reset]'); if (reset) reset.hidden = !edited;
  }

  // The BOM: rows change in place (so their figures tick); a line that arrives or leaves redraws the list.
  function renderBom(bom) {
    const body = $('[data-sl-bom]'); if (!body) return;
    const ids = [...body.children].map((tr) => tr.dataset.id).join('|');
    const roomsWord = (l) => l.rooms.map((x) => `${x.label.split(' ')[0]}${x.qty > 1 ? ` ×${x.qty}` : ''}`).join(', ');
    const chip = (m) => `<span class="sl-mark" data-mark="${m}">${MARKS[m].word}</span>`;
    if (ids === bom.lines.map((l) => l.id).join('|')) {
      for (const l of bom.lines) {
        const tr = body.querySelector(`tr[data-id="${CSS.escape(l.id)}"]`);
        setText(tr.querySelector('[data-c="qty"]'), l.qty);
        setText(tr.querySelector('[data-c="rooms"]'), roomsWord(l));
        const m = tr.querySelector('[data-c="mark"] .sl-mark');
        if (m.dataset.mark !== l.mark) tr.querySelector('[data-c="mark"]').innerHTML = chip(l.mark);
        setText(tr.querySelector('[data-c="sell"]'), money(l.sell, D.cur));
      }
      return;
    }
    const redraw = () => {
      body.innerHTML = bom.lines.map((l) => `<tr data-id="${esc(l.id)}" data-vk="${esc(l.id)}">
        <td><b>${esc(l.name)}</b><small>${esc(l.clsName)}${l.notInLibrary ? ' · not in the device library yet' : ''}</small></td>
        <td data-label="Qty"><b data-tick data-c="qty">${l.qty}</b></td>
        <td data-label="Rooms" data-c="rooms">${esc(roomsWord(l))}</td>
        <td data-label="From" data-c="mark">${chip(l.mark)}</td>
        <td data-label="Each" class="num-c">${money(l.unitSell, D.cur)}</td>
        <td data-label="Sell" class="num-c"><span data-tick data-c="sell">${money(l.sell, D.cur)}</span></td></tr>`).join('');
    };
    [...body.children].forEach((tr) => { tr.dataset.vk = tr.dataset.id; });
    km.regroup(body.closest('.tablewrap'), redraw);
  }
}

// ---- The quote: versions cross-fade ----------------------------------------------------------------------------------
function bindQuote(root) {
  if (root.__sl) return;
  root.__sl = true;
  const box = root.querySelector('[data-sl-vbox]');
  const tabs = [...root.querySelectorAll('[data-sl-v]')];
  if (!box || !tabs.length) return;
  let busy = null;
  const show = (v) => {
    const cur = box.querySelector('[data-sl-panel]:not([hidden])');
    const next = box.querySelector(`[data-sl-panel="${v}"]`);
    tabs.forEach((t) => t.setAttribute('aria-selected', String(Number(t.dataset.slV) === v)));
    if (!next || cur === next) return;
    if (busy) busy();
    if (km.reduced() || !next.animate) { cur.hidden = true; next.hidden = false; return; }
    const h0 = box.getBoundingClientRect().height;
    Object.assign(cur.style, { position: 'absolute', left: '0', right: '0', top: '0', pointerEvents: 'none' });
    cur.setAttribute('aria-hidden', 'true');
    box.style.position = 'relative';
    next.hidden = false;
    const h1 = next.getBoundingClientRect().height;
    const done = () => { cur.hidden = true; cur.removeAttribute('aria-hidden'); Object.assign(cur.style, { position: '', left: '', right: '', top: '', pointerEvents: '' }); box.style.position = ''; anims.forEach((a) => a.cancel()); busy = null; };
    const anims = [
      cur.animate([{ opacity: 1 }, { opacity: 0 }], { duration: km.t.exit, easing: km.t.exitCurve, fill: 'forwards' }),
      next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: km.t.state, delay: km.t.exit / 3, easing: km.t.settle, fill: 'backwards' }),
    ];
    if (Math.abs(h1 - h0) > 2) anims.push(box.animate([{ height: `${h0}px`, overflow: 'clip' }, { height: `${h1}px`, overflow: 'clip' }], { duration: km.t.morph, easing: km.t.settle }));
    anims[1].finished.then(done, done);
    busy = done;
  };
  tabs.forEach((t) => t.addEventListener('click', () => show(Number(t.dataset.slV))));
  tabs.forEach((t, i) => t.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    n.focus(); n.click();
  }));
}

// ---- Accept: the design flies into the client's Keia -------------------------------------------------------------------
function bindAccept(root) {
  if (root.__sl) return;
  root.__sl = true;
  const from = root.querySelector('[data-sl-from]'), to = root.querySelector('[data-sl-to]');
  const btn = root.querySelector('[data-sl-accept-btn]'), undo = root.querySelector('[data-sl-undo]');
  const empty = root.querySelector('[data-sl-empty]'), full = root.querySelector('[data-sl-full]');
  const note = root.querySelector('[data-sl-accept-note]');
  const noteWas = note?.textContent ?? '';
  const fly = (apply) => {
    if (km.reduced() || !from.animate) { apply(); return; }
    const a = from.getBoundingClientRect();
    const ghost = from.cloneNode(true);
    ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    ghost.querySelectorAll('[id],[data-help]').forEach((x) => { x.removeAttribute('id'); x.removeAttribute('data-help'); });
    ghost.removeAttribute('data-sl-from');
    Object.assign(ghost.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: '0', zIndex: '60', pointerEvents: 'none', transformOrigin: '0 0' });
    ghost.classList.add('sl-ghost');
    document.body.appendChild(ghost);
    apply();
    const b = to.getBoundingClientRect();
    const dx = b.left - a.left, dy = b.top - a.top, sx = b.width / a.width, sy = b.height / a.height;
    const d = km.t.morph;
    const g = ghost.animate([
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0 },
    ], { duration: d, easing: km.spring(), fill: 'forwards' });
    to.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: km.t.state, delay: d * 0.6, easing: km.t.settle, fill: 'backwards' });
    const end = () => ghost.remove();
    g.finished.then(end, end);
  };
  btn?.addEventListener('click', () => fly(() => {
    if (empty) empty.hidden = true;
    if (full) full.hidden = false;
    root.dataset.state = 'done';
    btn.hidden = true;
    if (undo) undo.hidden = false;
    if (note) note.textContent = 'Accepted (simulated). The proposal waits in the client\'s review queue.';
  }));
  undo?.addEventListener('click', () => {
    if (empty) empty.hidden = false;
    if (full) full.hidden = true;
    root.dataset.state = 'ready';
    undo.hidden = true;
    if (btn) { btn.hidden = false; btn.focus(); }
    if (note) note.textContent = noteWas;
  });
  root.querySelector('[data-sl-replay]')?.addEventListener('click', () => fly(() => {}));
}
