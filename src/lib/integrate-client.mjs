// Deploy in the browser: replays the live events over the plan, draws what changed, runs the actions
// and plays the simulated systems (Keia Atlas reading back, the agent preparing). Loaded by
// src/components/IntegrateLive.astro on the Deploy pages; the markup is shared with the build
// (src/lib/integrate-view.mjs), so the page never draws something the build would draw differently.
//
// Motion (docs/rules/motion.md): a step glyph eases between states (M2 state), batch meters fill, a list
// that gains or loses items morphs (rsMorphPanels) inside a held box (rsHold), a change made by Keia Atlas,
// the agent or another window is marked in place with who (rsMarkChanged), and a unit's detail grows
// from its row. With reduced motion on, states just change.
import { integrateModel, cellHtml, metersHtml, batchFootHtml, roomFootHtml, roomChipsHtml, needsHtml, readyHtml, unitDetailHtml, sharedHtml, setupHtml, testsHtml, describe, glyph, esc, PSEUDO, sheetCheck, boardHtml, groupActsHtml, groupMetersHtml, oneHtml, oneActsHtml, nextInQueue, setBarHtml, setFormHtml, DELIVER_WORD, roomTestWord } from './integrate-view.mjs';

const W = window;
const motion = () => (W.rsMotion ? W.rsMotion() : { reduced: true, state: 300, morph: 520, enter: 440, exit: 240, ease: 'ease' });
const first = (s) => String(s ?? '').split(' ')[0];

function start() {
  const root = document.querySelector('[data-int]');
  const dataEl = document.querySelector('[data-int-plan]');
  if (!root || !dataEl || root.__int) return;
  root.__int = true;
  const plan = JSON.parse(dataEl.textContent);
  const page = root.dataset.page, focus = root.dataset.focus ?? null;
  const PFX = `int:${plan.project}:`;

  // Keia Atlas and the agent sign their own changes; the History drawer names them.
  const RP = (W.RS_PEOPLE = W.RS_PEOPLE || []);
  for (const [id, name] of Object.entries(PSEUDO)) if (!RP.some((p) => p.id === id)) RP.push({ id, name, initials: id === 'agent' ? 'AG' : 'RS', role: '' });
  const people = () => Object.fromEntries((W.RS_PEOPLE || []).map((p) => [p.id, p.name]));

  let L = null;
  const stage = () => +(document.documentElement.dataset.stage || 6);
  const io = {
    get: (it, base) => (L ? L.live.stateOf(it, base) : base),
    stage, agents: () => stage() >= 6 && document.documentElement.dataset.agents !== 'off',
    get people() { return people(); },
  };
  let M = integrateModel(plan, io);
  const who = () => (L ? L.who() : W.rsActorId ? W.rsActorId() : 'anna');
  const myName = () => M.nameOf(who());

  // ---- Who is looking: a vendor sees only their installs ----
  const vendorIds = W.RS_VENDORS || [];
  let mode = 'engineer';
  function setMode() {
    const id = W.rsWhoId ? W.rsWhoId() : 'anna';
    const isVendor = vendorIds.includes(id);
    mode = isVendor ? 'vendor' : 'engineer';
    root.dataset.mode = mode;
    root.dataset.vendorHere = isVendor && plan.vendor?.id === id ? 'yes' : 'no';
    const vName = (W.RS_PEOPLE || []).find((p) => p.id === id);
    root.querySelectorAll('[data-vendor-name]').forEach((el) => { el.textContent = vName ? `${vName.name}${vName.where ? `, ${vName.where}` : ''}` : 'a vendor'; });
    if (page === 'overview') {
      // A vendor works space by space: their installs sit in each space's card, whatever the team's way.
      const want = mode === 'vendor' ? 'room' : (setMode.by ?? by);
      if (mode === 'vendor' && by !== 'room') { setMode.by = by; by = 'room'; drawBoard(false); }
      else if (mode !== 'vendor' && setMode.by && want !== by) { by = want; setMode.by = null; drawBoard(false); }
      vendorCards();
      paintCtl();
      document.querySelectorAll('.band [data-help="integrate.next"]').forEach((a) => { a.hidden = mode === 'vendor'; });
    }
  }

  // ---- Deliver by (the overview): the same units, grouped the way the team works ----
  // The team's way is the project's delivery.by; a person's own pick, their sets and where they are in the
  // one-at-a-time queue are kept in this browser (rs8-deliver-*). Every way reads and writes the same unit-level
  // events, so switching never loses progress.
  const WAYS = ['type', 'room', 'floor', 'one', 'set'];
  const boardBox = root.querySelector('[data-board-box]');
  const board = root.querySelector('[data-board]');
  const setSlot = root.querySelector('[data-setslot]');
  const ctl = root.querySelector('[data-deliver-ctl]');
  const fbar = document.querySelector('[data-fb]');
  const still = () => motion().reduced || Boolean(W.km && W.km.reduced()) || /^(off|reduced)$/.test(document.documentElement.dataset.motion || '');
  const K = (k) => `rs8-deliver-${k}:${plan.project}`;
  const keep = {
    get(k, d) { try { const v = localStorage.getItem(K(k)); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { if (v == null) localStorage.removeItem(K(k)); else localStorage.setItem(K(k), JSON.stringify(v)); } catch (_) { /* private window: this visit only */ } },
  };
  const team = WAYS.includes(plan.delivery?.by) ? plan.delivery.by : 'type';
  // The address is read before the filter bar rewrites it (index.astro keeps it in window.__rsDeliverQ).
  const q0 = new URLSearchParams(W.__rsDeliverQ ?? location.search);
  let by = WAYS.includes(q0.get('by')) ? q0.get('by') : q0.get('view') === 'rooms' ? 'room' : keep.get('by', null);
  if (!WAYS.includes(by)) by = team;
  let sets = keep.get('sets', []);
  if (!Array.isArray(sets)) sets = [];
  sets = sets.filter((s) => s && s.id && s.name && Array.isArray(s.units));
  let setId = keep.get('set', null);
  let draft = null, at = keep.get('at', null), sortV = 'order';
  const activeSet = () => sets.find((s) => s.id === setId) ?? null;
  const suggestName = () => `Set ${sets.length + 1}`;
  if (by === 'set' && !sets.length) draft = { id: null, name: suggestName(), units: [] };

  function paintCtl() {
    if (!ctl) return;
    ctl.querySelectorAll('[data-by]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.by === by)));
    // One marker slides to the chosen way (M12); on a phone the five words sit in one line, short.
    const seg = ctl.querySelector('.dv-seg');
    if (seg && W.rsMarkerWatch) W.rsMarkerWatch(seg, '[aria-pressed=true]');
    // The band's one action follows the way you work: the next batch, the next space, or the next unit.
    const act = document.querySelector('.band [data-help="integrate.next"]');
    if (act && mode !== 'vendor') {
      const nb = plan.batches.find((b) => M.batchSum(b.id).status !== 'done');
      const nr = plan.rooms.find((r) => r.units.length && !M.roomSum(r.id).signed);
      const nu = nextInQueue(M, null);
      const t = by === 'one' && nu ? [M.U.get(nu).sheet, 'Open the next unit'] : (by === 'room' || by === 'floor') && nr ? [`${plan.base}room/${nr.id}/`, 'Open the next space'] : nb ? [`${plan.base}${nb.id}/`, 'Open the next batch'] : null;
      if (t) { act.setAttribute('href', t[0]); if (act.textContent !== t[1]) act.textContent = t[1]; }
    }
    const line = ctl.querySelector('[data-deliver-team]');
    if (line) {
      const tw = DELIVER_WORD[team].toLowerCase();
      line.innerHTML = by === team
        ? `<b>The team's way</b>${plan.delivery?.note ? ` · ${esc(plan.delivery.note)}` : ` · by ${esc(tw)}${plan.delivery?.recorded ? '' : ', the default'}`}`
        : `<b>Your way, in this browser</b> · the team delivers by ${esc(tw)}. <button type="button" class="dv-link" data-act="deliver-team" data-help="integrate.deliver-team">Back to the team's way</button>`;
    }
  }
  function vendorCards() {
    if (page !== 'overview') return;
    root.querySelectorAll('[data-rcard]').forEach((c) => {
      const mine = plan.units.some((u) => u.room === c.dataset.rcard && u.vendor);
      c.hidden = mode === 'vendor' && !(root.dataset.vendorHere === 'yes' && mine);
    });
  }
  function drawSetSlot(hold = true) {
    if (!setSlot) return;
    const html = by === 'set' && mode !== 'vendor' ? setBarHtml(M, sets, setId) + (draft ? setFormHtml(M, draft) : '') : '';
    const openHand = setSlot.querySelector('.dv-sf-hand')?.open;
    const go = () => { setSlot.innerHTML = html; setSlot.hidden = !html; if (openHand) { const d = setSlot.querySelector('.dv-sf-hand'); if (d) d.open = true; } };
    if (hold && W.rsHold && !still()) W.rsHold(setSlot, go); else go();
  }
  // Draw the board for `by`. With `animate`, each unit row travels to its new group (km.regroup).
  function drawBoard(animate) {
    if (!board) return;
    const html = boardHtml(M, by, { set: activeSet(), sort: sortV, at });
    const go = () => {
      board.innerHTML = html;
      board.querySelectorAll('[data-slot]').forEach((el) => { el.__h = null; });
      drawSetSlot(false);
      vendorCards();
      markCurrent();
      if (fbar?.rsFilter) fbar.rsFilter.refresh(); else document.dispatchEvent(new CustomEvent('rs:find-refresh'));
    };
    if (animate && W.km?.regroup && !still()) W.km.regroup(boardBox || board, go); else go();
  }
  function setBy(v) {
    if (!WAYS.includes(v) || v === by) return;
    by = v;
    keep.set('by', v === team ? null : v);
    if (by === 'set' && !sets.length && !draft) draft = { id: null, name: suggestName(), units: [] };
    paintCtl();
    drawBoard(true);
    paint();
  }
  // One at a time: the unit in hand, and Next.
  const currentOne = () => board?.querySelector('[data-slot="one"]')?.dataset.u || null;
  function markCurrent() {
    const cur = by === 'one' ? currentOne() : null;
    board?.querySelectorAll('[data-urow]').forEach((row) => { const on = row.dataset.urow === cur; row.classList.toggle('is-current', on); if (on) row.setAttribute('aria-current', 'step'); else row.removeAttribute('aria-current'); });
  }
  function oneGo(uid, dir = 1) {
    if (!uid || by !== 'one' || !board) return;
    const slot = board.querySelector('[data-slot="one"]'), acts = board.querySelector('[data-oacts]'), card = slot?.closest('.dv-cur');
    if (!slot || uid === slot.dataset.u) return;
    at = uid; keep.set('at', at);
    reasonFor = null;
    const swap = () => { slot.dataset.u = uid; slot.innerHTML = oneHtml(M, uid); if (acts) { acts.__h = null; acts.innerHTML = oneActsHtml(M, uid); } markCurrent(); };
    if (card && W.km?.slide && !still()) W.km.slide(card, swap, { dir }); else swap();
    const top = card?.getBoundingClientRect().top ?? 0, lim = W.rsTopLimit ? W.rsTopLimit() : 0;
    if (card && top < lim) card.scrollIntoView({ block: 'start', behavior: still() ? 'auto' : 'smooth' });
  }
  function oneStep(dir) {
    const cur = currentOne();
    const q = plan.queue ?? plan.units.map((u) => u.id);
    const next = dir > 0 ? nextInQueue(M, cur) ?? q[(q.indexOf(cur) + 1) % q.length] : q[(q.indexOf(cur) - 1 + q.length) % q.length];
    if (next && next !== cur) oneGo(next, dir);
  }
  // Custom sets.
  const saveSets = () => { keep.set('sets', sets); keep.set('set', setId); };
  function pickSet(id) { if (id === setId && !draft) return; setId = id; draft = null; saveSets(); drawBoard(true); paint(); }
  function editSet(d) { draft = d; drawSetSlot(true); if (d) later(0, () => setSlot?.querySelector('input[name="name"]')?.focus({ preventScroll: true })); }
  function syncDraft() {
    if (!draft || !setSlot) return;
    const has = new Set(draft.units);
    setSlot.querySelectorAll('input[name="u"]').forEach((cb) => { cb.checked = has.has(cb.value); });
    setSlot.querySelectorAll('[data-act="set-add"]').forEach((b) => { const ids = b.dataset.ids.split(' ').filter(Boolean); b.setAttribute('aria-pressed', String(ids.length > 0 && ids.every((i) => has.has(i)))); });
    const n = setSlot.querySelector('[data-set-n]'); if (n) n.textContent = String(has.size);
  }
  function toggleDraft(ids) {
    if (!draft) return;
    const has = new Set(draft.units), all = ids.every((i) => has.has(i));
    ids.forEach((i) => (all ? has.delete(i) : has.add(i)));
    draft.units = plan.units.map((u) => u.id).filter((id) => has.has(id));
    syncDraft();
  }
  function saveSet(form) {
    if (!draft) return;
    const name = String(new FormData(form).get('name') || '').trim().slice(0, 60);
    const units = draft.units.filter((id) => M.U.has(id));
    const say = form.querySelector('.dv-sf-n');
    if (!name || !units.length) { if (say) say.innerHTML = `<b class="num" data-set-n>${units.length}</b> units chosen · ${!name ? 'Name the set first' : 'Choose at least one unit'}`; return; }
    if (draft.id && sets.some((s) => s.id === draft.id)) sets = sets.map((s) => (s.id === draft.id ? { ...s, name, units } : s));
    else { const id = `set-${Date.now().toString(36)}`; sets = [...sets, { id, name, units, made: nowIso() }]; draft.id = id; }
    setId = draft.id; draft = null;
    saveSets(); drawBoard(true); paint();
  }
  function deleteSet(id) {
    sets = sets.filter((s) => s.id !== id);
    if (setId === id) setId = sets[0]?.id ?? null;
    draft = sets.length ? null : { id: null, name: suggestName(), units: [] };
    saveSets(); drawBoard(true); paint();
  }
  // Live changes: every row, count, answer and action changes in place; nothing re-sorts (M10).
  function paintBoard() {
    if (!board) return;
    let refilter = false;
    board.querySelectorAll('[data-urow]').forEach((row) => {
      const uid = row.dataset.urow, u = M.U.get(uid); if (!u) return;
      const xs = M.unitSteps(uid), w = M.worstOf(xs), st = M.unitStatus(uid);
      if (row.dataset.st !== st) { row.dataset.st = st; row.dataset.fStatus = st; refilter = true; }
      const g = row.querySelector('.dv-ub > .ig'); if (g && w) g.dataset.st = w.st;
      const word = row.querySelector('[data-uword]'), txt = M.unitWord(uid);
      if (word && word.textContent !== txt) word.textContent = txt;
      row.querySelectorAll('[data-dot]').forEach((d) => { const x = xs[u.steps.indexOf(d.dataset.dot)]; if (x && d.dataset.st !== x.st) { d.dataset.st = x.st; const gl = d.querySelector('.ig'); if (gl) gl.dataset.st = x.st; d.title = `${M.LABEL[d.dataset.dot]}: ${x.label}`; } });
    });
    board.querySelectorAll('.dv-g[data-g]').forEach((sec) => {
      const g = groupFor(sec.dataset.g); if (!g) return;
      const sum = M.groupSum(g);
      sec.dataset.st = sum.status;
      const c = sec.querySelector('[data-gcount]'); if (c) c.textContent = `${sum.checked}/${sum.total}`;
      const a = sec.querySelector('[data-gans]'), ans = M.groupAnswer(g, sum, { bare: true }); if (a && a.textContent !== ans) a.textContent = ans;
      const m = sec.querySelector('[data-gmeters]');
      if (m) {
        const tmp = document.createElement('div'); tmp.innerHTML = groupMetersHtml(M, g);
        const olds = m.querySelectorAll('.im'), news = tmp.querySelectorAll('.im');
        if (olds.length !== news.length) m.innerHTML = tmp.innerHTML;
        else news.forEach((n, i) => {
          const o = olds[i], os = o.querySelectorAll('.im-segs i, .im-bar i'), ns = n.querySelectorAll('.im-segs i, .im-bar i');
          if (os.length !== ns.length) { o.replaceWith(n); return; }
          ns.forEach((x, j) => { os[j].dataset.st = x.dataset.st; if (x.style.width) os[j].style.width = x.style.width; });
          const ob = o.querySelector('.im-h b'), nb = n.querySelector('.im-h b'); if (ob && nb) ob.textContent = nb.textContent;
        });
      }
      const f = sec.querySelector('[data-gacts]'); if (f) swapHtml(f, groupActsHtml(M, g));
    });
    board.querySelectorAll('[data-rword]').forEach((el) => { const t = roomTestWord(M, el.dataset.rword); if (el.textContent !== t) el.textContent = t; });
    const cur = currentOne();
    if (cur) {
      const oa = board.querySelector('[data-oans]'), t = M.unitAnswer(cur); if (oa && oa.textContent !== t) oa.textContent = t;
      const acts = board.querySelector('[data-oacts]'); if (acts) swapHtml(acts, oneActsHtml(M, cur));
    }
    if (refilter) fbar?.rsFilter?.refresh(board);
  }

  // ---- Painting ----
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const pending = new Set();
  const markWho = (e, meta) => (e.who === 'keia_atlas' || e.who === 'agent' ? PSEUDO[e.who] : meta?.remote ? first(M.nameOf(e.who)) : null);

  let settled = false;   // the first paint only catches up with the stored events: no holding, no motion
  function swapList(el, html) {
    if (el.__h === html) return false;
    el.__h = html;
    const go = () => { el.innerHTML = html; el.querySelectorAll('[data-k]').forEach((x) => { x.dataset.vk = x.dataset.k; }); };
    if (!settled) { go(); return true; }
    const old = new Set([...el.querySelectorAll('[data-k]')].map((x) => x.dataset.k));
    el.querySelectorAll('[data-k]').forEach((x) => { x.dataset.vk = x.dataset.k; });
    if (W.rsMorphPanels && !motion().reduced && old.size) W.rsMorphPanels(el, el, () => (W.rsHold ? W.rsHold(el, go) : go()));
    else if (W.rsHold) W.rsHold(el, go); else go();
    return true;
  }
  function swapHtml(el, html, keepOpen) {
    if (el.__h === html) return false;
    const open = keepOpen ? new Set([...el.querySelectorAll('details[open][data-keep], li[data-su] > details[open]')].map((d) => d.closest('[data-su]')?.dataset.su ?? d.dataset.keep)) : null;
    el.__h = html;
    const go = () => {
      el.innerHTML = html;
      if (open) el.querySelectorAll('li[data-su] > details').forEach((d) => { if (open.has(d.closest('[data-su]').dataset.su)) d.open = true; });
    };
    if (settled && W.rsHold) W.rsHold(el, go); else go();
    return true;
  }
  function paintCell(el, mark) {
    const [uid, step] = el.dataset.cell.split('|');
    const x = M.stepOf(uid, step);
    if (x.st === 'na') return;
    const was = el.dataset.st;
    el.dataset.st = x.st;
    const g = el.querySelector('.ig'); if (g) g.dataset.st = x.st;
    const l = el.querySelector('.ic-l'), s = el.querySelector('.ic-s');
    if (l && l.textContent !== x.label) l.textContent = x.label;
    if (s && s.textContent !== x.sub) s.textContent = x.sub;
    el.classList.toggle('checking', pending.has(uid));
    el.setAttribute('aria-label', `${M.LABEL[step]}, ${M.U.get(uid).name}: ${x.label}${x.sub ? `, ${x.sub}` : ''}`);
    if (mark && was !== x.st && W.rsMarkChanged) W.rsMarkChanged(el.closest('td') || el, mark);
  }
  // A build sheet row's check: its glyph eases to the new state, and the row's Status filter follows.
  const SCK_STATUS = { issue: 'issue', verified: 'seen', done: 'seen' };
  function paintSheetCheck(el, mark) {
    const ck = el.dataset.sckStep ? { step: el.dataset.sckStep, rec: el.dataset.sckRec || undefined } : null;
    const c = sheetCheck(M, el.dataset.sck, ck, el.dataset.sckT);
    if (el.dataset.st === c.st) return;
    el.dataset.st = c.st;
    const g = el.querySelector('.ig'); if (g) g.dataset.st = c.st;
    const l = el.querySelector('.bs-ckl'); if (l) l.textContent = c.label;
    const row = el.closest('[data-fi]');
    if (row && row.dataset.fStatus !== 'missing') {
      const st = SCK_STATUS[c.st] ?? 'todo';
      if (row.dataset.fStatus !== st) { row.dataset.fStatus = st; document.querySelector('[data-fb]')?.rsFilter?.refresh?.(row); }
    }
    if (mark && W.rsMarkChanged) W.rsMarkChanged(el.closest('.bs-c') || el, mark);
  }
  function paintMeters(el) {
    const b = M.B.get(el.dataset.b); if (!b) return;
    const sum = M.batchSum(b.id);
    el.querySelectorAll('[data-meter]').forEach((m) => {
      const xs = sum.per[m.dataset.meter] ?? [];
      m.querySelectorAll('[data-seg]').forEach((seg, i) => { if (xs[i]) seg.dataset.st = xs[i].st; });
      const n = xs.filter((x) => x.st === 'done' || x.st === 'verified').length, t = xs.filter((x) => x.st !== 'na').length;
      const nb = m.querySelector('[data-meter-n]'); if (nb) nb.textContent = `${n}/${t}`;
    });
  }
  function paintChips(el) {
    const r = M.R.get(el.dataset.r); if (!r) return;
    const tmp = document.createElement('div'); tmp.innerHTML = roomChipsHtml(M, r.id);
    tmp.querySelectorAll('[data-chip]').forEach((n) => {
      const cur = el.querySelector(`[data-chip="${CSS.escape(n.dataset.chip)}"]`); if (!cur) return;
      if (cur.dataset.st !== n.dataset.st) { cur.dataset.st = n.dataset.st; cur.title = n.title; const g = cur.querySelector('.ig'); if (g) g.dataset.st = n.dataset.st; }
    });
  }
  function figures() {
    if (!W.rsKeyNumber) return;
    if (page === 'overview') {
      if (mode === 'vendor') {
        const mine = plan.units.filter((u) => u.vendor && root.dataset.vendorHere === 'yes');
        const done = mine.filter((u) => ['done', 'verified'].includes(M.stepOf(u.id, 'install').st)).length;
        const seen = mine.filter((u) => M.us(u.id).online).length;
        W.rsKeyNumber('int-needs', mine.length - done, { label: 'To install', tone: mine.length - done ? 'warn' : '' });
        W.rsKeyNumber('int-accept', done, { label: 'Installed' });
        W.rsKeyNumber('int-setup', seen, { label: 'Seen online' });
        W.rsKeyNumber('int-rooms', new Set(mine.map((u) => u.room)).size, { label: 'Your spaces' });
        return;
      }
      const f = M.figures();
      W.rsKeyNumber('int-needs', f.needs, { label: 'Ready for you', tone: f.needs ? 'warn' : '' });
      W.rsKeyNumber('int-accept', f.toAccept, { label: 'Checked, to accept', tone: f.toAccept ? 'good' : '' });
      W.rsKeyNumber('int-setup', `${f.setUp}/${f.units}`, { label: 'Units set up' });
      W.rsKeyNumber('int-rooms', `${f.signed}/${f.rooms}`, { label: 'Spaces signed off' });
    } else if (page === 'batch') {
      const s = M.batchSum(focus);
      const nd = new Set(s.issues.map((z) => z.id)).size;
      W.rsKeyNumber('int-needs', nd, { tone: nd ? 'warn' : '' });
      W.rsKeyNumber('int-accept', s.ready.length, { tone: s.ready.length ? 'good' : '' });
      W.rsKeyNumber('int-setup', `${s.done}/${s.total}`);
    } else if (page === 'room') {
      const s = M.roomSum(focus);
      W.rsKeyNumber('int-setup', `${s.setUp}/${s.total}`);
      W.rsKeyNumber('int-tests', `${s.passed}/${s.tests.length}`, { tone: s.failed.length ? 'warn' : s.signed ? 'good' : '' });
    }
  }
  function paintFilterItems() {
    const bar = document.querySelector('[data-fb]');
    let moved = false;
    root.querySelectorAll('[data-bcard][data-fi]').forEach((c) => {
      const st = M.batchSum(c.dataset.bcard).status;
      if (c.dataset.fStatus !== st) { c.dataset.fStatus = st; moved = true; bar?.rsFilter?.refresh?.(c); }
      c.dataset.st = st;
    });
    root.querySelectorAll('[data-rcard][data-fi]').forEach((c) => {
      const st = M.roomSum(c.dataset.rcard).status;
      if (c.dataset.fStatus !== st) { c.dataset.fStatus = st; moved = true; bar?.rsFilter?.refresh?.(c); }
      c.dataset.st = st;
    });
    return moved;
  }
  // The Checked list follows the way the work is grouped (type, room, floor, one, set).
  function paint(ev, meta) {
    M.fresh();
    const mark = ev ? markWho(ev, meta) : null;
    const touchedUnit = ev && /:unit$/.test(ev.item) ? ev.item.slice(PFX.length, -':unit'.length) : null;
    root.querySelectorAll('[data-cell]').forEach((el) => paintCell(el, mark && (!touchedUnit || el.dataset.cell.startsWith(`${touchedUnit}|`)) ? mark : null));
    root.querySelectorAll('[data-slot="meters"]').forEach(paintMeters);
    root.querySelectorAll('[data-slot="rchips"]').forEach(paintChips);
    root.querySelectorAll('[data-slot="bfoot"]').forEach((el) => swapHtml(el, batchFootHtml(M, el.dataset.b)));
    root.querySelectorAll('[data-slot="rfoot"]').forEach((el) => swapHtml(el, roomFootHtml(M, el.dataset.r)));
    root.querySelectorAll('[data-slot="needs"]').forEach((el) => swapList(el, needsHtml(M, { room: el.dataset.room || null, batch: el.dataset.batch || null })));
    root.querySelectorAll('[data-slot="ready"]').forEach((el) => swapList(el, readyHtml(M, { by: el.dataset.by === 'follow' ? by : el.dataset.by, only: el.dataset.only || null, set: activeSet() })));
    root.querySelectorAll('[data-slot="shared"]').forEach((el) => { if (swapHtml(el, sharedHtml(M, el.dataset.b)) && mark && ev && /:batch$/.test(ev.item) && W.rsMarkChanged) W.rsMarkChanged(el, mark); });
    root.querySelectorAll('[data-slot="setup"]').forEach((el) => swapHtml(el, setupHtml(M, el.dataset.b), true));
    root.querySelectorAll('[data-slot="tests"]').forEach((el) => { if (swapHtml(el, testsHtml(M, el.dataset.r)) && mark && ev && /:room$/.test(ev.item) && W.rsMarkChanged) W.rsMarkChanged(el, mark); });
    root.querySelectorAll('[data-slot="uaccept"]').forEach((el) => swapHtml(el, uacceptHtml(el.dataset.b)));
    root.querySelectorAll('[data-slot="udetail"]').forEach((el) => { if (!el.closest('[hidden]')) swapHtml(el, detailHtml(el.dataset.u)); });
    root.querySelectorAll('[data-slot="vinstall"]').forEach((el) => swapHtml(el, vinstallHtml(el.dataset.r)));
    root.querySelectorAll('tr[data-u]').forEach((tr) => { const xs = M.unitSteps(tr.dataset.u); tr.dataset.st = xs.some((x) => x.st === 'issue') ? 'issue' : xs.every((x) => x.st === 'done') ? 'done' : xs.some((x) => x.st === 'verified') ? 'verified' : 'todo'; });
    root.querySelectorAll('[data-sck]').forEach((el) => paintSheetCheck(el, mark));
    paintBoard();
    figures();
    if (paintFilterItems()) document.dispatchEvent(new CustomEvent('rs:find-refresh'));
  }

  // ---- Parts only the browser draws ----
  const selected = new Set();
  function uacceptHtml(bid) {
    const b = M.B.get(bid), s = M.batchSum(bid);
    const readyUnits = [...new Set(s.ready.map((z) => z.id))];
    const sel = readyUnits.filter((id) => selected.has(id));
    const issueUnits = new Set(s.issues.map((z) => z.id)).size;
    const allPass = readyUnits.length === b.units.length && b.units.every((id) => M.U.get(id).steps.every((st) => ['verified', 'done'].includes(M.stepOf(id, st).st)));
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many ?? `${one}s`}`;
    const msg = !M.seeOn() ? 'Keia Atlas reads back once real feeds replace the simulation. Until then, mark each unit by hand in its detail.'
      : allPass ? `All ${b.units.length} pass every check Keia Atlas can run.`
        : readyUnits.length ? `Passed so far: ${plural(s.ready.length, 'step')} on ${plural(readyUnits.length, 'unit')}.${issueUnits ? ` ${plural(issueUnits, 'unit is', 'units are')} ready for you first; exceptions are never accepted with the rest.` : ''}`
          : s.done === b.units.length ? `All ${b.units.length} set up.` : s.done ? `${s.done} of ${b.units.length} set up. The rest gather here as Keia Atlas sees them pass.` : issueUnits ? `${plural(issueUnits, 'unit is', 'units are')} ready for you before anything here can be accepted.` : 'Nothing checked yet. Apply the profile, or install the units, and Keia Atlas reads them back.';
    const btn = readyUnits.length ? `<button type="button" class="btn small primary" data-help="integrate.accept" data-act="accept-units" data-id="${esc(bid)}">${sel.length ? `Accept the ${sel.length} selected` : allPass ? `Accept all ${readyUnits.length}` : `Accept ${plural(s.ready.length, 'step')}`}</button>` : '';
    return `<p class="ua-t">${readyUnits.length ? glyph('verified') : ''}<span>${esc(msg)}</span></p>${btn}${readyUnits.length ? '<span class="ua-keys faint" data-help="integrate.keys">Keys: arrows move, Space selects, A accepts</span>' : ''}`;
  }
  let reasonFor = null;
  function detailHtml(uid) {
    let html = unitDetailHtml(M, uid);
    if (reasonFor && reasonFor.uid === uid) {
      const tmp = document.createElement('div'); tmp.innerHTML = html;
      const sec = [...tmp.querySelectorAll('.ud-s')][M.U.get(uid).steps.indexOf(reasonFor.step)];
      if (sec) {
        const q = reasonFor.v ? `Keia Atlas has not seen this. Why mark it ${M.DONE_W[reasonFor.step].toLowerCase()}?` : 'Why untick it?';
        const chips = (reasonFor.v ? ['Checked on site', 'Seen in the vendor\'s portal', 'Not needed in this project'] : ['Not really done', 'Needs a second look', 'Ticked by mistake']).map((c) => `<button type="button" class="rs-chip" data-act="reason" data-r="${esc(c)}">${esc(c)}</button>`).join('');
        const f = document.createElement('form');
        f.className = 'ud-reason'; f.dataset.actForm = 'reason';
        f.innerHTML = `<p>${esc(q)}</p><div class="ud-rc">${chips}</div><div class="ud-ri"><input name="r" placeholder="Or say why" aria-label="Reason" /><button class="btn small">Save</button><button type="button" class="btn small ghost" data-act="reason-cancel">Cancel</button></div>`;
        sec.appendChild(f);
      }
      html = tmp.innerHTML;
    }
    return html;
  }
  function vinstallHtml(rid) {
    const r = M.R.get(rid);
    const mineOnly = mode === 'vendor';
    const list = r.units.map((id) => M.U.get(id)).filter((u) => u.steps.includes('install') && (!mineOnly || (u.vendor && root.dataset.vendorHere === 'yes')));
    if (!list.length) return `<p class="faint vi-none">Nothing to install here.</p>`;
    const left = list.filter((u) => !['done', 'verified'].includes(M.stepOf(u.id, 'install').st) && !M.us(u.id).installed);
    const rows = list.map((u) => {
      const x = M.stepOf(u.id, 'install'), s = M.us(u.id);
      const done = x.st === 'done' || x.st === 'verified' || s.installed;
      const extra = `<details class="vi-more" data-keep="${esc(u.id)}"><summary>${s.serial || s.photo ? 'Serial and photo added' : 'Add serial or photo'}</summary><form class="vi-form" data-act-form="records" data-u="${esc(u.id)}"><label>Serial<input name="serial" value="${esc(s.serial ?? '')}" placeholder="${esc(u.serial ?? 'On the label')}" autocomplete="off" spellcheck="false" /></label><label>Photo<input name="photo" type="file" accept="image/*" capture="environment" /></label><button class="btn small">Save</button></form></details>`;
      return `<li class="vi" data-k="${esc(u.id)}" data-st="${x.st}"><span class="vi-b">${glyph(done ? (x.st === 'verified' || x.st === 'done' ? x.st : 'doing') : 'todo')}<span><b>${esc(u.short)}</b><small>${esc([u.modelName, u.where].filter(Boolean).join(' · '))}</small><small class="vi-s">${esc(done ? (s.online ? `Seen online on ${u.port}` : x.sub || 'Marked installed') : u.blocked?.install ? `Waiting: ${u.blocked.install}` : '')}</small></span></span>` +
        `<span class="vi-a">${done ? '' : `<button type="button" class="btn small" data-help="integrate.installed" data-act="installed" data-u="${esc(u.id)}"${u.blocked?.install ? ' disabled' : ''}>Installed</button>`}</span>${extra}</li>`;
    }).join('');
    const bulk = left.length > 1 ? `<button type="button" class="btn small ghost" data-help="integrate.room-installed" data-act="room-installed" data-id="${esc(rid)}">Mark the space installed (${left.length})</button>` : '';
    return `<ul class="vi-list">${rows}</ul>${bulk}`;
  }

  // ---- Recording ----
  const rec = (it, field, before, after, note, as) => {
    if (!L) return null;
    const e = { item: it, field, before: before ?? null, after: after ?? null, who: as ?? who() };
    if (note) e.note = note;
    return L.live.record(e);
  };
  const setU = (uid, field, v, note, as) => rec(M.item.unit(uid), field, M.us(uid)[field], v, note, as);
  const nowIso = () => new Date().toISOString();

  // ---- Groups: the ones on the page, and any other by its key ("room:jnu-2-02", "set:set-1", "unit:<id>") ----
  function groupFor(gid) {
    const i = gid.indexOf(':'), scope = gid.slice(0, i), id = gid.slice(i + 1);
    if (scope === 'unit') return M.U.has(id) ? { scope, id, title: M.unitLabel(M.U.get(id)), units: [id] } : null;
    if (scope === 'project') return { scope, id: 'all', title: 'the whole project', units: plan.units.map((u) => u.id) };
    const way = { batch: 'type', room: 'room', zone: 'floor', queue: 'one', set: 'set', rest: 'set' }[scope];
    return way ? M.groupsBy(way, { set: activeSet() }).find((g) => g.scope === scope && String(g.id) === id) ?? null : null;
  }
  // Accept: one event on the group's item, every unit and step with who, when, what passed and where.
  function accept(g, keys, note) {
    if (!g || !keys.length || !L) return;
    const e = M.acceptEvent(g, keys, { who: who(), at: nowIso(), note });
    rec(e.item, e.field, e.before, e.after, e.note);
  }
  const verifiedKeys = (ids) => ids.flatMap((id) => M.U.get(id).steps.filter((s) => M.stepOf(id, s).st === 'verified').map((s) => `${id}|${s}`));
  function acceptGroup(scope, id) {
    if (scope === 'project') { accept(groupFor('project:all'), M.readyGroups('batch').flatMap((g) => g.keys)); return; }
    const g = groupFor(`${scope}:${id}`);
    if (g) accept(g, verifiedKeys(g.units));
  }
  function acceptUnits(bid, only) {
    const keys = verifiedKeys(M.B.get(bid).units.filter((id) => !only || only.has(id)));
    if (!keys.length) return 0;
    accept(groupFor(`batch:${bid}`), keys);
    return keys.length;
  }
  // Apply: a batch in one event; any other group, each unit that still needs its setup guide.
  function applyGroup(g, how) {
    const evs = M.applyEvents(g, { how });
    evs.forEach((e) => rec(e.item, e.field, e.before, e.after, e.note));
    const bids = new Set(g.units.map((id) => M.U.get(id).batch));
    bids.forEach((bid) => readBack(bid));
  }
  function confirmGroup(g) {
    const keys = M.toConfirm(g).map((id) => `${id}|configure`);
    if (keys.length) accept(g, keys, `Confirmed by hand in ${g.title}, ${keys.length} ${keys.length === 1 ? 'unit' : 'units'}: set as the setup guide says. Keia Atlas cannot read these back.`);
  }

  // ---- The simulated systems: what Keia Atlas and the agent do after a person acts ----
  const reachable = (u) => (u.networked ? Boolean(M.us(u.id).online) : true) && M.hostOnline(u);
  function readBack(bid, delay = 900) {
    if (stage() < 2) return;
    const b = M.B.get(bid); if (!b?.readable) return;
    let i = 0, drifted = false;
    for (const id of b.units) {
      const u = M.U.get(id); if (!u.steps.includes('configure')) continue;
      if (!(M.bs(bid).applied || M.us(id).applied)) continue;
      const s = M.us(id); if (s.read && !s.drift) continue;
      if (!reachable(u)) continue;
      const n = i++;
      pending.add(id);
      later(delay + n * 650, () => {
        pending.delete(id);
        const hist = L ? L.live.historyOf(M.item.unit(id)) : [];
        const drift = !drifted && b.cfg?.id === 'poly-x-google-meet' && !u.base.drift && !hist.some((e) => e.field === 'drift');
        setU(id, 'read', true, `Read back from ${b.via}: ${drift ? 'one setting differs' : `matches ${b.cfg ? `${b.cfg.name} ${b.cfg.version}` : 'the standard'}`}`, 'keia_atlas');
        if (drift) { drifted = true; setU(id, 'drift', 'Automatic updates: On. Fleet Lens turned them back on (advisory ADV-001).', 'Found on read-back', 'keia_atlas'); }
      });
    }
  }
  function seeOnline(uid, delay = 1400) {
    const u = M.U.get(uid);
    if (stage() < 2 || !u.networked) return;
    pending.add(uid); paint();
    later(delay, () => {
      pending.delete(uid);
      setU(uid, 'online', true, `Seen online on ${u.port}`, 'keia_atlas');
      // Anything waiting for it follows: its own profile, and what pairs with it.
      for (const b of M.plan.batches) if (b.units.includes(uid) || b.units.some((x) => M.U.get(x).hostPos === uid)) readBack(b.id, 700);
    });
  }
  const runFix = {
    recheck(uid, field) {
      const u = M.U.get(uid); pending.add(uid); paint();
      later(1300, () => {
        pending.delete(uid);
        const by = first(myName());
        if (field === 'dnsOk') setU(uid, 'dnsOk', true, `Rechecked for ${by}: DNS now points at the new unit`, 'keia_atlas');
        else if (field === 'fwOk') setU(uid, 'fwOk', true, `Rechecked for ${by}: version ${u.fw}`, 'keia_atlas');
        else if (field === 'online') { setU(uid, 'offline', null, `Rechecked for ${by}`, 'keia_atlas'); setU(uid, 'online', true, `Back online on ${u.port}`, 'keia_atlas'); }
        else if (field === 'drift') setU(uid, 'drift', null, `Rechecked for ${by}: matches again`, 'keia_atlas');
      });
    },
    update(uid) {
      const u = M.U.get(uid); pending.add(uid); paint();
      later(1700, () => { pending.delete(uid); setU(uid, 'fwOk', true, `${first(myName())} sent ${u.fw} from Fleet Lens; the unit now reports ${u.fw}`, 'keia_atlas'); });
    },
    reapply(uid) {
      pending.add(uid); paint();
      later(1200, () => { pending.delete(uid); setU(uid, 'drift', null, `${first(myName())} reapplied the setup guide; read back: matches`, 'keia_atlas'); });
    },
  };

  // ---- Actions ----
  function openDetail(uid, scroll) {
    const row = root.querySelector(`tr[data-ud="${CSS.escape(uid)}"]`); if (!row) return;
    const btn = root.querySelector(`[data-act="expand"][data-u="${CSS.escape(uid)}"]`);
    const slot = row.querySelector('[data-slot="udetail"]');
    const opening = row.hidden;
    const go = () => { row.hidden = !opening; if (btn) btn.setAttribute('aria-expanded', String(opening)); if (opening) swapHtml(slot, detailHtml(uid)); };
    const M0 = motion();
    if (opening && !M0.reduced) {
      go();
      const box = slot.firstElementChild ? slot : row;
      box.animate([{ opacity: 0, transform: 'translateY(-6px)', clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, transform: 'none', clipPath: 'inset(0 0 0 0)' }], { duration: M0.enter, easing: M0.ease });
    } else if (W.rsHold) W.rsHold(root.querySelector('[data-units]') || row, go); else go();
    if (scroll && opening) (root.querySelector(`tr[data-u="${CSS.escape(uid)}"]`) || row).scrollIntoView({ block: 'center', behavior: M0.reduced ? 'auto' : 'smooth' });
  }
  function tick(uid, step, v) {
    const x = M.stepOf(uid, step), s = M.us(uid), cur = s[`x-${step}`] ?? null;
    const seeable = M.seeOn() && (x.cs ?? []).every((c) => c.ok !== null);
    if (v === false && cur?.v === true && !x.seen) { setU(uid, `x-${step}`, null, 'Cleared the tick'); return; }
    if (v === true && cur?.v === false) { setU(uid, `x-${step}`, null, 'Put back to what Keia Atlas sees'); return; }
    if (v === true && !seeable) { setU(uid, `x-${step}`, { v: true, w: who() }, 'Keia Atlas cannot see this: done by hand'); return; }
    reasonFor = { uid, step, v };
    const row = root.querySelector(`tr[data-ud="${CSS.escape(uid)}"]`);
    if (row?.hidden) openDetail(uid); else paint();
    later(0, () => root.querySelector('.ud-reason input')?.focus({ preventScroll: true }));
  }
  function saveReason(text) {
    if (!reasonFor || !text) return;
    const { uid, step, v } = reasonFor; reasonFor = null;
    setU(uid, `x-${step}`, { v, w: who(), n: text }, text);
  }
  function testSet(rid, tid, res) {
    const cur = M.rs(rid).tests ?? {};
    const next = { ...cur };
    if (res === null) delete next[tid]; else next[tid] = res;
    rec(M.item.room(rid), 'tests', cur, next, res ? `${M.R.get(rid).tests.find((t) => t.id === tid)?.t}: ${res.r === 'pass' ? 'passed' : `failed: ${res.note}`}` : 'Cleared a result');
  }

  function onClick(ev) {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const a = t.closest('[data-act]');
    const cell = t.closest('[data-cell]');
    if (cell && root.contains(cell) && cell.tagName === 'BUTTON') {
      const [uid, step] = cell.dataset.cell.split('|');
      const x = M.stepOf(uid, step);
      if (x.st === 'verified') { accept(groupFor(`batch:${M.U.get(uid).batch}`), [`${uid}|${step}`]); return; }
      if (['todo', 'doing', 'blocked'].includes(x.st) && !(M.seeOn() && (x.cs ?? []).every((c) => c.ok !== null)) && !x.why && page === 'batch') { tick(uid, step, true); return; }
      if (page === 'batch') openDetail(uid, false); else location.href = `${plan.base}${M.U.get(uid).batch}/#u=${encodeURIComponent(uid)}`;
      return;
    }
    if (!a || !root.contains(a)) return;
    const act = a.dataset.act, uid = a.dataset.u, id = a.dataset.id;
    if (act === 'expand') { openDetail(uid, false); return; }
    if (act === 'accept') { acceptGroup(a.dataset.scope, id); return; }
    if (act === 'accept-units') { const n = acceptUnits(id, selected.size ? selected : null); if (n) { selected.clear(); root.querySelectorAll('[data-pick]').forEach((b) => { b.checked = false; }); } return; }
    if (act === 'confirm') {
      const b = M.B.get(id);
      const keys = b.units.filter((u) => M.U.get(u).steps.includes('configure') && !['done', 'verified'].includes(M.stepOf(u, 'configure').st)).map((u) => `${u}|configure`);
      if (keys.length) accept(groupFor(`batch:${id}`), keys, `Confirmed by hand on ${keys.length} ${keys.length === 1 ? 'unit' : 'units'}: set as ${b.cfg?.name ?? 'the configuration'} says. Keia Atlas cannot read these back.`);
      return;
    }
    // Deliver by, and what each group can do.
    if (act === 'g-accept') { const g = groupFor(a.dataset.g); if (g) accept(g, verifiedKeys(g.units)); return; }
    if (act === 'g-apply') { const g = groupFor(a.dataset.g); if (g) applyGroup(g, a.dataset.via); return; }
    if (act === 'g-confirm') { const g = groupFor(a.dataset.g); if (g) confirmGroup(g); return; }
    if (act === 'deliver') { setBy(a.dataset.by); return; }
    if (act === 'deliver-team') { setBy(team); return; }
    if (act === 'one-next') { oneStep(1); return; }
    if (act === 'one-prev') { oneStep(-1); return; }
    if (act === 'one-pick') { ev.preventDefault(); oneGo(uid, 1); return; }
    if (act === 'set-pick') { pickSet(a.dataset.set); return; }
    if (act === 'set-new') { editSet({ id: null, name: suggestName(), units: [] }); return; }
    if (act === 'set-edit') { const s = activeSet(); if (s) editSet({ ...s, units: [...s.units] }); return; }
    if (act === 'set-cancel') { editSet(null); return; }
    if (act === 'set-delete') { deleteSet(a.dataset.set); return; }
    if (act === 'set-add') { toggleDraft(a.dataset.ids.split(' ').filter(Boolean)); return; }
    if (act === 'apply') {
      const b = M.B.get(id), via = a.dataset.via;
      rec(M.item.batch(id), 'applied', false, true, via === 'agent' ? 'Applied the run the setup guide agent prepared' : via === 'push' ? `Applied through ${b.via} to all ${b.units.length}` : `Applied by hand in ${b.via}`);
      readBack(id);
      return;
    }
    if (act === 'handoff') {
      rec(M.item.batch(id), 'handed', false, true, 'Handed to the setup guide agent');
      later(1500, () => rec(M.item.batch(id), 'prepared', false, true, `Prepared the run for ${M.B.get(id).units.length} units`, 'agent'));
      return;
    }
    if (act === 'discard') { rec(M.item.batch(id), 'prepared', true, false, 'Discarded the prepared run'); rec(M.item.batch(id), 'handed', true, false); return; }
    if (act === 'recheck') { a.disabled = true; a.textContent = 'Checking'; runFix.recheck(uid, a.dataset.f); return; }
    if (act === 'update') { a.disabled = true; a.textContent = 'Updating'; runFix.update(uid); return; }
    if (act === 'reapply') { a.disabled = true; a.textContent = 'Reapplying'; runFix.reapply(uid); return; }
    if (act === 'tick') { tick(uid, a.dataset.step, true); return; }
    if (act === 'untick') { tick(uid, a.dataset.step, false); return; }
    if (act === 'reason') { saveReason(a.dataset.r); return; }
    if (act === 'reason-cancel') { reasonFor = null; paint(); return; }
    if (act === 'history' && L) { L.history(M.item.unit(uid), M.U.get(uid).name); return; }
    if (act === 'history-room' && L) { L.history(M.item.room(id), M.R.get(id).name); return; }
    if (act === 'history-batch' && L) { L.history(M.item.batch(id), M.B.get(id).title); return; }
    if (act === 'su') { const on = Boolean(M.us(uid)[`su-${a.dataset.s}`] || M.bs(M.U.get(uid).batch)[`su-${a.dataset.s}`]); if (on && M.bs(M.U.get(uid).batch)[`su-${a.dataset.s}`]) return; setU(uid, `su-${a.dataset.s}`, !on); return; }
    if (act === 'su-all') { rec(M.item.batch(id), `su-${a.dataset.s}`, false, true); return; }
    if (act === 'installed') { setU(uid, 'installed', true, 'Mounted, connected and powered on'); seeOnline(uid); return; }
    if (act === 'room-installed') {
      const r = M.R.get(id);
      const list = r.units.map((x) => M.U.get(x)).filter((u) => u.steps.includes('install') && (mode !== 'vendor' || u.vendor) && !M.us(u.id).installed && !['done', 'verified'].includes(M.stepOf(u.id, 'install').st) && !u.blocked?.install);
      list.forEach((u, i) => { setU(u.id, 'installed', true, `Marked the space installed (${list.length} units)`); seeOnline(u.id, 1400 + i * 450); });
      return;
    }
    if (act === 'test') {
      const cur = M.rs(id).tests?.[a.dataset.t]?.r ?? null, r = a.dataset.r;
      if (cur === r) { testSet(id, a.dataset.t, null); return; }
      if (r === 'pass') { testSet(id, a.dataset.t, { r: 'pass' }); return; }
      const li = a.closest('[data-test]'); const f = li?.querySelector('.rt-fail');
      if (f) { f.hidden = false; const M0 = motion(); if (!M0.reduced) f.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: M0.pop, easing: M0.ease }); f.querySelector('input')?.focus(); }
      return;
    }
    if (act === 'fail-cancel') { const f = a.closest('form'); if (f) f.hidden = true; return; }
    if (act === 'all-passed') {
      const r = M.R.get(id), cur = M.rs(id).tests ?? {};
      const all = Object.fromEntries(r.tests.map((x) => [x.id, { r: 'pass' }]));
      rec(M.item.room(id), 'tests', cur, all, `All ${r.tests.length} room tests passed: ${r.tests.map((x) => x.t.toLowerCase()).join(', ')}`);
      rec(M.item.room(id), 'signed', M.rs(id).signed, { w: who(), at: nowIso(), n: `all ${r.tests.length} room tests passed` }, `Signed off: all ${r.tests.length} room tests passed`);
      return;
    }
    if (act === 'sign') { rec(M.item.room(id), 'signed', M.rs(id).signed, { w: who(), at: nowIso() }, 'Signed off the space'); return; }
  }
  function onSubmit(ev) {
    const f = ev.target.closest && ev.target.closest('[data-act-form]');
    if (!f || !root.contains(f)) return;
    ev.preventDefault();
    const kind = f.dataset.actForm, fd = new FormData(f);
    if (kind === 'set') { saveSet(f); return; }
    if (kind === 'host') { const v = String(fd.get('host') || '').trim().toLowerCase().replace(/\s+/g, '-'); if (v) setU(f.dataset.u, 'host', v, 'Gave it a hostname'); return; }
    if (kind === 'reason') { saveReason(String(fd.get('r') || '').trim()); return; }
    if (kind === 'fail') { const note = String(fd.get('note') || '').trim(); if (note) testSet(f.dataset.id, f.dataset.t, { r: 'fail', note }); return; }
    if (kind === 'records') {
      const uid = f.dataset.u, s = M.us(uid);
      const serial = String(fd.get('serial') || '').trim(), photo = fd.get('photo');
      if (serial && serial !== s.serial) setU(uid, 'serial', serial, 'Recorded from the label');
      if (photo && photo.name) setU(uid, 'photo', photo.name, 'Photo of the label');
    }
  }
  // Keyboard on the units table: arrows move, Space selects, A accepts, Enter opens the detail.
  function onKey(ev) {
    const tr = ev.target.closest && ev.target.closest('tr[data-u]');
    if (!tr || !root.contains(tr) || ev.target.matches('input, textarea, select') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const rows = [...root.querySelectorAll('tr[data-u]')];
    const i = rows.indexOf(tr);
    const k = ev.key.toLowerCase();
    if (k === 'arrowdown' || k === 'j') { ev.preventDefault(); rows[Math.min(rows.length - 1, i + 1)]?.focus(); return; }
    if (k === 'arrowup' || k === 'k') { ev.preventDefault(); rows[Math.max(0, i - 1)]?.focus(); return; }
    if (k === ' ' || k === 'x') { ev.preventDefault(); const cb = tr.querySelector('[data-pick]'); if (cb) { cb.checked = !cb.checked; pick(cb); } return; }
    if (k === 'enter' && ev.target === tr) { ev.preventDefault(); openDetail(tr.dataset.u); return; }
    if (k === 'a') {
      ev.preventDefault();
      const only = selected.size ? selected : new Set([tr.dataset.u]);
      if (acceptUnits(focus, only)) { selected.clear(); root.querySelectorAll('[data-pick]').forEach((b) => { b.checked = false; }); }
    }
  }
  function pick(cb) {
    const tr = cb.closest('tr[data-u]');
    if (cb.dataset.pick === 'all') { root.querySelectorAll('tr[data-u] [data-pick]').forEach((b) => { b.checked = cb.checked; b.closest('tr').classList.toggle('picked', cb.checked); if (cb.checked) selected.add(b.closest('tr').dataset.u); else selected.delete(b.closest('tr').dataset.u); }); }
    else if (tr) { if (cb.checked) selected.add(tr.dataset.u); else selected.delete(tr.dataset.u); tr.classList.toggle('picked', cb.checked); }
    paint();
  }
  const onChange = (ev) => {
    const u = ev.target.closest && ev.target.closest('.dv-setform input[name="u"]');
    if (u && draft) { const has = new Set(draft.units); if (u.checked) has.add(u.value); else has.delete(u.value); draft.units = plan.units.map((x) => x.id).filter((id) => has.has(id)); syncDraft(); return; }
    const cb = ev.target.closest && ev.target.closest('[data-pick]'); if (cb && root.contains(cb)) pick(cb);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('keydown', onKey);
  root.addEventListener('change', onChange);

  // ---- The filter bar: views and sort ----
  const bar = document.querySelector('[data-fb]');
  const RANK = { needs: 0, accept: 1, test: 1, doing: 2, todo: 3, done: 4 };
  const onSort = (e) => {
    const v = e.detail?.value ?? 'order';
    // The Deploy overview's board: the groups re-order and every unit travels with its group.
    if (board) { sortV = v; drawBoard(true); return; }
    const re = () => root.querySelectorAll('[data-sortable]').forEach((grid) => {
      const items = [...grid.children];
      items.sort((x, y) => (v === 'needs' ? (RANK[x.dataset.st] ?? 5) - (RANK[y.dataset.st] ?? 5) : 0) || (v === 'name' ? String(x.dataset.name).localeCompare(String(y.dataset.name)) : (+x.dataset.order) - (+y.dataset.order)));
      items.forEach((n) => grid.appendChild(n));
    });
    if (bar?.rsFilter) bar.rsFilter.run(true, re); else re();
  };
  if (bar) { bar.addEventListener('fb:sort', onSort); sortV = bar.rsFilter?.sort?.() ?? sortV; }

  // ---- The live layer ----
  let stop = null;
  function go() {
    L = W.rsLive; if (!L || !document.body.contains(root)) return;
    L.register(PFX, { base: (it) => M.baseOf(it), describe: (e) => describe(M, e) });
    if (stop) stop();
    stop = L.live.subscribe(PFX, (e, meta) => { paint(e, meta); });
    // The board is drawn once the events are in, so its rows open in the right order (exceptions first) for
    // the way this person works; from here on they change in place.
    if (board) { M.fresh(); if (bar?.rsFilter?.sort) sortV = bar.rsFilter.sort(); drawBoard(false); paintCtl(); }
    paint();
    settled = true;
    // A link to one unit (#u=<id>) opens its detail.
    const h = /(?:^|[#&])u=([^&]+)/.exec(location.hash);
    if (h && page === 'batch') openDetail(decodeURIComponent(h[1]), true);
  }
  setMode();
  paint();
  if (W.rsLive) go(); else document.addEventListener('rs:live-ready', go, { once: true });
  const onDemo = () => { M = integrateModel(plan, io); setMode(); root.querySelectorAll('[data-slot]').forEach((el) => { el.__h = null; }); paint(); };
  document.addEventListener('rs:demo-change', onDemo);
  document.addEventListener('astro:before-swap', () => {
    if (stop) stop(); stop = null;
    timers.forEach(clearTimeout); timers.clear();
    document.removeEventListener('rs:demo-change', onDemo);
    bar?.removeEventListener('fb:sort', onSort);
  }, { once: true });
}

document.addEventListener('astro:page-load', start);
if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
