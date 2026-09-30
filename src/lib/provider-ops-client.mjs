// The operations pages in the browser: reserve a job's stock, send a draft order, receive an order, approve a RAMS.
// Each action is kept in this browser (localStorage rs9-ops, a demo setting like the modules), the whole view is worked
// out again from the record (opsView), and only the parts that changed are drawn again:
//   reserve   the job's chips travel from "Available to reserve" to "Reserved" (km.regroup, M2)
//   receive   the order's serials arrive in stock and on the job; every figure that changed ticks (km.tick, row 48)
//   send      the draft moves to On order
//   approve   the RAMS's sign-off changes in place; the visit it held back is ready once nothing else is missing
// Under reduced motion each lands at once (km.regroup and km.tick check it). Nothing here is sent anywhere.
import { opsView, readLocal } from './provider-ops.mjs';
import { shortHtml, placesHtml, itemsHtml, jobsHtml, ordersHtml, visitsHtml, ramsSignHtml, ramsListHtml, ordersAnswer, ramsListAnswer, ramsStatusWord } from './provider-ops-view.mjs';
import { WEEKS } from './provider-ops.mjs';

const KEY = 'rs9-ops';
const load = () => { try { return readLocal(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { return readLocal({}); } };
const save = (L) => { try { localStorage.setItem(KEY, JSON.stringify(L)); } catch (_) { /* a private window keeps it for the page only */ } };

let booted = false, base = null, root = null;

// Each dynamic slot on a page, and how to draw it from the view.
const SLOTS = {
  short: (V) => shortHtml(V),
  places: (V) => placesHtml(V),
  items: (V) => itemsHtml(V),
  'jobs-next': (V) => jobsHtml(V, WEEKS.next),
  'jobs-this': (V) => jobsHtml(V, WEEKS.this),
  drafts: (V) => ordersHtml(V, V.drafts, 'No draft orders: nothing is short.'),
  open: (V) => ordersHtml(V, V.open, 'Nothing on order.'),
  received: (V) => ordersHtml(V, V.received.slice().sort((a, b) => String(b.received).localeCompare(String(a.received))), 'Nothing received yet.'),
  'visits-this': (V) => visitsHtml(V, WEEKS.this, root?.dataset.base ?? ''),
  'visits-next': (V) => visitsHtml(V, WEEKS.next, root?.dataset.base ?? ''),
  'rams-list': (V) => ramsListHtml(V, root?.dataset.base ?? ''),
  sign: (V) => { const d = V.rams[root.dataset.job]; return d ? ramsSignHtml(d) : ''; },
};

// Answers and key numbers, per page.
function band(V) {
  const page = root.dataset.poPage;
  const set = (id, n) => { if (window.rsKeyNumber) window.rsKeyNumber(id, n); };
  const answer = (t) => { const el = document.querySelector('[data-pb-answer]'); if (el && el.textContent !== t) { if (window.rsAnswer) window.rsAnswer(t); else el.textContent = t; } };
  if (page === 'stock') {
    answer(V.answer);
    set('po-items', V.rows.length); set('po-reserved', V.rows.reduce((n, r) => n + r.reserved, 0)); set('po-low', V.rows.filter((r) => r.low).length); set('po-short', V.short.length);
  } else if (page === 'orders') {
    answer(ordersAnswer(V));
    set('po-short', V.short.length); set('po-drafts', V.drafts.length); set('po-open', V.open.length); set('po-received', V.received.length);
  } else if (page === 'visits') {
    answer(V.visitsAnswer);
    set('po-risk', V.visits.filter((r) => !r.ready).length); set('po-ready', V.visits.filter((r) => r.ready).length);
  } else if (page === 'rams') {
    answer(ramsListAnswer(V));
    set('po-waiting', Object.values(V.rams).filter((d) => d.status !== 'approved').length);
  } else if (page === 'rams-doc') {
    const d = V.rams[root.dataset.job]; if (!d) return;
    const st = document.querySelector('[data-rm-status]'); if (st) st.textContent = ramsStatusWord(d);
  }
}

// Draw the slots again. `move` regroups by data-vk (chips travelling); figures marked data-tk tick where they changed.
function paint(V, { move = null } = {}) {
  const boxes = [...root.querySelectorAll('[data-po-slot]')];
  const before = new Map();
  for (const b of boxes) b.querySelectorAll('[data-tk]').forEach((el, i) => before.set(`${b.dataset.poSlot}|${i}`, el.textContent));
  const swap = () => { for (const b of boxes) { const f = SLOTS[b.dataset.poSlot]; if (f) { const html = f(V); if (b.innerHTML !== html) b.innerHTML = html; } } };
  if (move && window.km) window.km.regroup(move, swap); else swap();
  for (const b of boxes) b.querySelectorAll('[data-tk]').forEach((el, i) => { const was = before.get(`${b.dataset.poSlot}|${i}`); if (was != null && was !== el.textContent && window.km) window.km.tick(el, was); });
  band(V);
}

function act(kind, id) {
  const L = load();
  if (kind === 'reserve' && !L.reserved.includes(id)) L.reserved.push(id);
  if (kind === 'send' && !L.sent.includes(id)) L.sent.push(id);
  if (kind === 'receive' && !L.received.includes(id)) L.received.push(id);
  if (kind === 'approve') L.approved[id] = { by: (window.rsWhoId && window.rsWhoId()) || 'sam', at: '2026-09-28T12:00' };
  save(L);
  const V = opsView(base, L);
  const box = kind === 'reserve' ? root.querySelector(`[data-job="${CSS.escape(id)}"]`)?.closest('[data-po-slot]') : kind === 'receive' || kind === 'send' ? root.querySelector('[data-po-orders]') : null;
  paint(V, { move: box });
  const toast = (t) => window.rsToast && window.rsToast(t);
  if (kind === 'reserve') { const p = V.plan.jobs.find((x) => x.job.id === id); toast(`Reserved for ${id}${p?.short ? `; ${p.lines.filter((l) => l.short).length} line still short` : ''}`); }
  if (kind === 'receive') { const a = V.arrived.find((x) => x.order === id); const n = a ? a.added.reduce((s, x) => s + (x.qty ?? 1), 0) : 0; toast(`${id} received: ${n} added to stock${a?.added.some((x) => x.job) ? ' and reserved for the job' : ''}`); }
  if (kind === 'send') toast(`${id} sent. It shows under On order until it arrives.`);
  if (kind === 'approve') toast(`RAMS approved. The visit's readiness now counts it.`);
}

function onClick(e) {
  if (e.target.closest('[data-po-print]')) { e.preventDefault(); window.print(); return; }
  const b = e.target.closest('[data-po-act]');
  if (b && root && root.contains(b)) { e.preventDefault(); act(b.dataset.poAct, b.dataset.id); return; }
  const r = e.target.closest('[data-po-reset]');
  if (r && root && root.contains(r)) { e.preventDefault(); save(readLocal({})); paint(opsView(base, {})); if (window.rsToast) window.rsToast('Back to the record as it is: nothing reserved, sent or received here.'); }
}

/** Start on an operations page: read the record the page carries, apply what this browser did, and listen. */
export function boot() {
  if (booted) return;
  booted = true;
  document.addEventListener('click', onClick);
  const run = () => {
    root = document.querySelector('[data-po-root]');
    if (!root) return;
    try { base = JSON.parse(document.getElementById('po-base')?.textContent || 'null'); } catch (_) { base = null; }
    if (!base) return;
    const L = load();
    if (L.sent.length || L.received.length || L.reserved.length || Object.keys(L.approved).length) paint(opsView(base, L));
  };
  document.addEventListener('astro:page-load', run);
}
