// The known issues pages in the browser (decision 0029): every decision a person makes there is an event in
// the live layer (src/lib/live.mjs, through LiveBar's window.rsLive), so it shows in every open window, says
// who and when, and can be undone from History. Nothing is sent anywhere: "Send" records that the person sent
// the case (stage 4 sends it for real, still only when a person says so).
//
// Items and fields:
//   ki:<ID>            link:<INC>  'linked' | 'not-this' | null      a person's answer to a proposed match
//                      plan        'proposed' | null                  a firmware rollout proposed for the fix
//                      told        number of rooms | null             a note left on each affected room
//   room-note:<room>   ki:<ID>     the note's words | null
//   cluster:<key>      decision    'raise' | 'not-now' | null         what to do about a repeat with no known issue
//   case:<id>          status, summary, ref, known_issue              a maker case, from draft to the maker's answer
import { CASE_STATUS, CASE_ORDER } from './knownissues.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const at = (t) => new Date(t).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const lower1 = (w) => w.charAt(0).toLowerCase() + w.slice(1);

export function describe(e) {
  const f = e.field, a = e.after;
  let w;
  if (f.startsWith('link:')) { const n = f.slice(5); w = a === 'linked' ? `Linked ${n}` : a === 'not-this' ? `Said ${n} is not this issue` : `Put ${n} back to decide`; }
  else if (f === 'plan') w = a ? 'Proposed a firmware rollout for the fix' : 'Took back the rollout proposal';
  else if (f === 'told') w = a ? `Left a note on ${a} ${a === 1 ? 'room' : 'rooms'}` : 'Took the room notes back';
  else if (f === 'decision') w = a === 'raise' ? 'Chose to raise it with the maker' : a === 'not-now' ? 'Chose not to raise it now' : 'Put it back to decide';
  else if (f === 'status') w = a === 'draft' ? 'Put the case back to being prepared' : `Case: ${CASE_STATUS[a] ?? a}`;
  else if (f === 'summary') w = 'Changed what the case says';
  else if (f === 'ref') w = a ? `Maker's reference: ${a}` : "Cleared the maker's reference";
  else if (f === 'known_issue') w = a ? `Linked to known issue ${a}` : 'Unlinked the known issue';
  else if (f.startsWith('ki:')) w = a ? `Note about known issue ${f.slice(3)}` : `Removed the note about ${f.slice(3)}`;
  else w = `${f} changed`;
  return e.undoes ? `${e.note}: ${lower1(w)}` : w;
}

// The newest event on one field: who set the value it has now, and when.
const lastOn = (L, item, field) => L.live.historyOf(item).find((e) => e.field === field) ?? null;
const byLine = (L, e) => (e ? `${L.name(e.who)}, ${at(e.at)}` : '');

// What the page in view needs; replaced on every page load, cleared when the page is swapped out.
let ctx = null;

function bind(mark0) {
  const L = window.rsLive;
  if (!L || !document.body.contains(mark0) || mark0.__kiBound) return;
  mark0.__kiBound = true;
  const root = document;
  const json = (sel) => { try { return JSON.parse(root.querySelector(sel)?.textContent || '{}'); } catch (_) { return {}; } };
  const CASE = json('[data-case-json]');   // on a case page: { id, base, maker, sendAs }
  for (const p of ['ki:', 'room-note:', 'cluster:', 'case:']) L.register(p, { base: (item) => (item === CASE.item ? CASE.base : {}), describe });
  const rec = (item, field, after, note) => {
    const before = L.live.stateOf(item, item === CASE.item ? CASE.base : {})[field] ?? null;
    if (before === after) return;
    L.live.record({ item, field, before, after, who: L.who(), ...(note ? { note } : {}) });
  };

  // ---- Proposed matches: Link, Not this, Put back ------------------------------------------------------------
  function paintMatches() {
    let open = 0, linked = 0;
    root.querySelectorAll('[data-ki-m]').forEach((row) => {
      const item = row.dataset.item, f = `link:${row.dataset.inc}`;
      const v = L.live.stateOf(item)[f] ?? null;
      row.dataset.state = v ?? 'open';
      const s = row.querySelector('[data-ki-mstate]');
      if (s) s.textContent = v === 'linked' ? `Linked by ${byLine(L, lastOn(L, item, f))}` : v === 'not-this' ? `Not this issue: ${byLine(L, lastOn(L, item, f))}` : '';
      if (!v) open++; else if (v === 'linked') linked++;
    });
    root.querySelectorAll('[data-ki-card]').forEach((card) => {
      const rows = card.querySelectorAll('[data-ki-m]');
      const left = [...rows].filter((r) => r.dataset.state === 'open').length;
      card.dataset.done = left ? '' : '1';
      const n = card.querySelector('[data-ki-left]');
      if (n) n.textContent = left ? `${left} to decide` : 'All decided';
    });
    root.querySelectorAll('[data-ki-linkall]').forEach((b) => { b.disabled = !root.querySelector(`[data-ki-m][data-item="${b.dataset.item}"][data-state="open"]`); });
    if (window.rsKeyNumber && root.querySelector('[data-kn="linked"]') === null) { /* the list page counts decisions below */ }
    return { open, linked };
  }

  // ---- Repeats with no known issue -----------------------------------------------------------------------------
  function paintClusters() {
    let open = 0;
    root.querySelectorAll('[data-ki-cluster]').forEach((card) => {
      const item = card.dataset.item, caseItem = card.dataset.case;
      const d = L.live.stateOf(item).decision ?? null;
      const cs = L.live.stateOf(caseItem).status ?? 'draft';
      card.dataset.state = cs !== 'draft' ? 'sent' : d ?? 'open';
      const s = card.querySelector('[data-ki-cstate]');
      if (s) {
        s.textContent = cs !== 'draft' ? `${CASE_STATUS[cs]}: ${byLine(L, lastOn(L, caseItem, 'status'))}`
          : d === 'raise' ? `Case being prepared: ${byLine(L, lastOn(L, item, 'decision'))}`
          : d === 'not-now' ? `Not raised now: ${byLine(L, lastOn(L, item, 'decision'))}` : '';
      }
      if (!d && cs === 'draft') open++;
    });
    return open;
  }

  // ---- A known issue's own actions: the fix, telling the team ---------------------------------------------------
  function paintIssue() {
    const box = root.querySelector('[data-ki-issue]'); if (!box) return;
    const item = box.dataset.item, st = L.live.stateOf(item);
    const plan = root.querySelector('[data-ki-planstate]');
    if (plan) { plan.textContent = st.plan ? `Proposed by ${byLine(L, lastOn(L, item, 'plan'))}. The rollout starts from the Firmware rollout playbook, with a Lab pass first.` : ''; plan.hidden = !st.plan; }
    root.querySelectorAll('[data-ki-plan]').forEach((b) => { b.hidden = Boolean(st.plan); });
    root.querySelectorAll('[data-ki-unplan]').forEach((b) => { b.hidden = !st.plan; });
    const told = root.querySelector('[data-ki-toldstate]');
    if (told) { told.textContent = st.told ? `Note left on ${st.told} ${st.told === 1 ? 'room' : 'rooms'} by ${byLine(L, lastOn(L, item, 'told'))}.` : ''; told.hidden = !st.told; }
    root.querySelectorAll('[data-ki-tell-open]').forEach((b) => { b.hidden = Boolean(st.told); });
    root.querySelectorAll('[data-ki-tell-undo]').forEach((b) => { b.hidden = !st.told; });
    root.querySelectorAll('[data-ki-room]').forEach((r) => {
      const note = L.live.stateOf(`room-note:${r.dataset.kiRoom}`)[`ki:${box.dataset.id}`];
      r.dataset.noted = note ? '1' : '';
    });
    const m = paintMatches();
    if (window.rsKeyNumber) window.rsKeyNumber('linked', m.linked);
  }

  // ---- A maker case ---------------------------------------------------------------------------------------------
  function paintCase() {
    const box = root.querySelector('[data-case]'); if (!box) return;
    const st = L.live.stateOf(CASE.item, CASE.base);
    const status = st.status ?? 'draft', i = CASE_ORDER.indexOf(status);
    box.dataset.status = status;
    root.querySelectorAll('[data-case-pill]').forEach((p) => { p.textContent = CASE_STATUS[status]; p.className = `pill ${status === 'draft' ? 'plain' : status === 'closed' || status === 'published' ? 'manage' : 'deploy'}`; });
    root.querySelectorAll('[data-case-step]').forEach((s) => {
      const k = CASE_ORDER.indexOf(s.dataset.caseStep);
      s.dataset.at = k < i ? 'done' : k === i ? 'now' : 'next';
      const w = s.querySelector('[data-case-when]');
      if (w) { const e = L.live.historyOf(CASE.item).find((x) => x.field === 'status' && x.after === s.dataset.caseStep && !x.undoneBy); w.textContent = e ? byLine(L, e) : (s.dataset.base || ''); }
    });
    const ta = root.querySelector('[data-case-summary]');
    if (ta && document.activeElement !== ta) ta.value = st.summary ?? '';
    if (ta) ta.readOnly = status !== 'draft';
    const ref = root.querySelector('[data-case-ref]');
    if (ref && document.activeElement !== ref) ref.value = st.ref ?? '';
    const ki = root.querySelector('[data-case-ki]');
    if (ki && document.activeElement !== ki) ki.value = st.known_issue ?? '';
    const kiLink = root.querySelector('[data-case-kilink]');
    if (kiLink) { const o = ki?.querySelector(`option[value="${CSS.escape(st.known_issue ?? '')}"]`); kiLink.hidden = !st.known_issue; if (st.known_issue && o) { kiLink.href = o.dataset.href; kiLink.textContent = `Open ${st.known_issue}`; } }
    root.querySelectorAll('[data-case-to]').forEach((b) => { const k = CASE_ORDER.indexOf(b.dataset.caseTo); b.disabled = status === 'draft' || k <= i; });
    root.querySelectorAll('[data-case-primary]').forEach((b) => { b.textContent = status === 'draft' ? `Send to ${CASE.maker}` : "Record the maker's answer"; });
    const sent = root.querySelector('[data-case-sentline]');
    if (sent) { const e = lastOn(L, CASE.item, 'status'); sent.hidden = status === 'draft'; sent.textContent = status === 'draft' ? '' : e && e.after === 'sent' ? `Sent to ${CASE.maker} by ${byLine(L, e)}. Simulated: nothing left Keia Atlas.` : CASE.sentLine || ''; }
    root.querySelectorAll('[data-case-draftonly]').forEach((el) => { el.hidden = status !== 'draft'; });
    root.querySelectorAll('[data-case-sentonly]').forEach((el) => { el.hidden = status === 'draft'; });
  }

  // ---- Numbers in the band --------------------------------------------------------------------------------------
  function paintNumbers() {
    if (!root.querySelector('[data-ki-decide]')) return;
    const m = paintMatches(), c = paintClusters();
    if (window.rsKeyNumber) window.rsKeyNumber('decide', m.open + c, { tone: m.open + c ? 'warn' : '' });
    const left = root.querySelector('[data-ki-decide-left]');
    if (left) left.textContent = m.open + c ? `${m.open + c} to decide` : 'Nothing left to decide';
  }

  const paint = () => { paintMatches(); paintClusters(); paintIssue(); paintCase(); paintNumbers(); };
  paint();

  const mark = (e, info) => {
    if (!info?.remote || !window.rsMarkChanged) return;
    const el = e.field.startsWith('link:') ? root.querySelector(`[data-ki-m][data-item="${e.item}"][data-inc="${e.field.slice(5)}"]`)
      : e.item.startsWith('cluster:') ? root.querySelector(`[data-ki-cluster][data-item="${e.item}"]`)
      : e.item.startsWith('case:') ? root.querySelector(`[data-ki-cluster][data-case="${e.item}"]`) ?? root.querySelector('[data-case-track]')
      : root.querySelector('[data-ki-issue]');
    if (el) window.rsMarkChanged(el, L.name(e.who));
  };
  const stops = ['ki:', 'room-note:', 'cluster:', 'case:'].map((k) => L.live.subscribe(k, (e, info) => { paint(); mark(e, info); }));
  document.addEventListener('rs:demo-change', paint);
  document.addEventListener('astro:before-swap', () => { stops.forEach((s) => s()); document.removeEventListener('rs:demo-change', paint); ctx = null; }, { once: true });

  // ---- Clicks ---------------------------------------------------------------------------------------------------
  ctx = { L, CASE, rec, root };
}

// One listener for every known issues page, installed once (pages come and go with the client router).
function onClick(ev) {
  if (!ctx) return;
  const { L, CASE, rec, root } = ctx;
  {
    const t = ev.target;
    const hist = t.closest('[data-ki-history]');
    if (hist) { L.history(hist.dataset.item, hist.dataset.title); return; }
    const act = t.closest('[data-ki-act]');
    if (act) {
      const row = act.closest('[data-ki-m]'), f = `link:${row.dataset.inc}`;
      rec(row.dataset.item, f, act.dataset.kiAct === 'link' ? 'linked' : act.dataset.kiAct === 'not' ? 'not-this' : null);
      return;
    }
    const all = t.closest('[data-ki-linkall]');
    if (all) { root.querySelectorAll(`[data-ki-m][data-item="${all.dataset.item}"][data-state="open"]`).forEach((r) => rec(r.dataset.item, `link:${r.dataset.inc}`, 'linked')); return; }
    const cl = t.closest('[data-ki-cl]');
    if (cl) {
      const card = cl.closest('[data-ki-cluster]');
      const v = cl.dataset.kiCl === 'raise' ? 'raise' : cl.dataset.kiCl === 'not-now' ? 'not-now' : null;
      rec(card.dataset.item, 'decision', v);
      if (v !== 'raise') ev.preventDefault();   // "Raise with the maker" is a link: it goes on to the prepared case
      return;
    }
    const issue = root.querySelector('[data-ki-issue]');
    if (issue && t.closest('[data-ki-plan]')) { rec(issue.dataset.item, 'plan', 'proposed'); return; }
    if (issue && t.closest('[data-ki-unplan]')) { rec(issue.dataset.item, 'plan', null); return; }
    if (issue && t.closest('[data-ki-tell-open]')) {
      const f = root.querySelector('[data-ki-tell-form]'); f.hidden = false;
      if (window.rsPopIn) window.rsPopIn(f, t.closest('[data-ki-tell-open]'));
      f.querySelector('textarea')?.focus({ preventScroll: true });
      return;
    }
    if (issue && t.closest('[data-ki-tell-cancel]')) { root.querySelector('[data-ki-tell-form]').hidden = true; return; }
    if (issue && t.closest('[data-ki-tell-send]')) {
      const f = root.querySelector('[data-ki-tell-form]'), text = f.querySelector('textarea').value.trim();
      const rooms = (t.closest('[data-ki-tell-send]').dataset.rooms || '').split('|').filter(Boolean);
      if (!text || !rooms.length) return;
      rooms.forEach((r) => rec(`room-note:${r}`, `ki:${issue.dataset.id}`, text));
      rec(issue.dataset.item, 'told', rooms.length);
      f.hidden = true;
      return;
    }
    if (issue && t.closest('[data-ki-tell-undo]')) {
      const rooms = (t.closest('[data-ki-tell-undo]').dataset.rooms || '').split('|').filter(Boolean);
      rooms.forEach((r) => rec(`room-note:${r}`, `ki:${issue.dataset.id}`, null));
      rec(issue.dataset.item, 'told', null);
      return;
    }
    // A case: send (after a second, deliberate click), the maker's answers, the reference and the known issue.
    if (t.closest('[data-case-primary]')) {
      const st = L.live.stateOf(CASE.item, CASE.base);
      if ((st.status ?? 'draft') === 'draft') { const c = root.querySelector('[data-case-confirm]'); c.hidden = false; c.querySelector('[data-case-send]')?.focus({ preventScroll: true }); }
      else root.querySelector('[data-case-track]')?.scrollIntoView({ behavior: window.rsMotion?.().reduced ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    if (t.closest('[data-case-notyet]')) { root.querySelector('[data-case-confirm]').hidden = true; return; }
    if (t.closest('[data-case-send]')) {
      const ta = root.querySelector('[data-case-summary]');
      if (ta && ta.value.trim() !== (L.live.stateOf(CASE.item, CASE.base).summary ?? '')) rec(CASE.item, 'summary', ta.value.trim());
      rec(CASE.item, 'status', 'sent');
      if (CASE.cluster) rec(CASE.cluster, 'decision', 'raise');
      root.querySelector('[data-case-confirm]').hidden = true;
      return;
    }
    const to = t.closest('[data-case-to]');
    if (to && !to.disabled) { rec(CASE.item, 'status', to.dataset.caseTo); return; }
    if (t.closest('[data-case-refsave]')) { const v = root.querySelector('[data-case-ref]').value.trim(); rec(CASE.item, 'ref', v || null); return; }
    if (t.closest('[data-case-kisave]')) {
      const v = root.querySelector('[data-case-ki]').value || null;
      rec(CASE.item, 'known_issue', v);
      if (v && CASE_ORDER.indexOf(L.live.stateOf(CASE.item, CASE.base).status ?? 'draft') < CASE_ORDER.indexOf('published')) rec(CASE.item, 'status', 'published');
    }
  }
}
function onChange(ev) {
  if (!ctx) return;
  const ta = ev.target.closest?.('[data-case-summary]');
  if (ta && !ta.readOnly) ctx.rec(ctx.CASE.item, 'summary', ta.value.trim());
}

let booted = false;
export function boot() {
  if (booted) return;
  booted = true;
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  const run = () => {
    const root = document.querySelector('[data-ki-root]');
    if (!root) return;
    if (window.rsLive) bind(root); else document.addEventListener('rs:live-ready', () => bind(root), { once: true });
  };
  document.addEventListener('astro:page-load', run);
}

// "Tell the team" notes on a room page (room-note:<room>, one field per known issue, ki:<ID>): the room shows every
// note left on it, with who left it and when, and a link to the issue. The block starts hidden and shows when a note exists.
let notesBooted = false;
export function bootRoomNotes() {
  if (notesBooted) return;
  notesBooted = true;
  let stop = null;
  const paintNotes = (L, box) => {
    const item = `room-note:${box.dataset.room}`;
    const titles = (() => { try { return JSON.parse(box.dataset.titles || '{}'); } catch (_) { return {}; } })();
    const st = L.live.stateOf(item);
    const list = Object.keys(st).filter((f) => f.startsWith('ki:') && st[f]).map((f) => {
      const id = f.slice(3), e = L.live.historyOf(item).find((x) => x.field === f);
      return `<li><b><a href="${esc(box.dataset.kiBase + id.toLowerCase() + '/')}">${esc(titles[id] || id)}</a></b><p>${esc(st[f])}</p><small class="faint">${e ? `${esc(L.name(e.who))}, ${esc(at(e.at))}` : ''}</small></li>`;
    });
    box.querySelector('[data-rn-list]').innerHTML = list.join('');
    box.hidden = !list.length;
  };
  const run = () => {
    stop?.(); stop = null;
    const box = document.querySelector('[data-room-notes]');
    if (!box) return;
    const go = () => {
      const L = window.rsLive; if (!L || !document.body.contains(box)) return;
      paintNotes(L, box);
      stop = L.live.subscribe('room-note:', () => paintNotes(L, box));
    };
    if (window.rsLive) go(); else document.addEventListener('rs:live-ready', go, { once: true });
  };
  document.addEventListener('astro:page-load', run);
  document.addEventListener('astro:before-swap', () => { stop?.(); stop = null; });
}
