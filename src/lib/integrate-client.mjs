// Deploy in the browser: replays the live events over the plan, draws what changed, runs the actions
// and plays the simulated systems (Keia Atlas reading back, the agent preparing). Loaded by
// src/components/IntegrateLive.astro on the Deploy pages; the markup is shared with the build
// (src/lib/integrate-view.mjs), so the page never draws something the build would draw differently.
//
// Motion (docs/rules/motion.md): a step glyph eases between states (M2 state), batch meters fill, a list
// that gains or loses items morphs (rsMorphPanels) inside a held box (rsHold), a change made by Keia Atlas,
// the agent or another window is marked in place with who (rsMarkChanged), and a unit's detail grows
// from its row. With reduced motion on, states just change.
import { integrateModel, cellHtml, metersHtml, batchFootHtml, roomFootHtml, roomChipsHtml, needsHtml, readyHtml, unitDetailHtml, sharedHtml, setupHtml, testsHtml, describe, glyph, esc, PSEUDO, sheetCheck } from './integrate-view.mjs';

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
  const who = () => (L ? L.who() : W.rsActorId ? W.rsActorId() : 'aoife');
  const myName = () => M.nameOf(who());

  // ---- Who is looking: a vendor sees only their installs ----
  const vendorIds = W.RS_VENDORS || [];
  let mode = 'engineer';
  function setMode() {
    const id = W.rsWhoId ? W.rsWhoId() : 'aoife';
    const isVendor = vendorIds.includes(id);
    mode = isVendor ? 'vendor' : 'engineer';
    root.dataset.mode = mode;
    root.dataset.vendorHere = isVendor && plan.vendor?.id === id ? 'yes' : 'no';
    const vName = (W.RS_PEOPLE || []).find((p) => p.id === id);
    root.querySelectorAll('[data-vendor-name]').forEach((el) => { el.textContent = vName ? `${vName.name}${vName.where ? `, ${vName.where}` : ''}` : 'a vendor'; });
    if (page === 'overview') {
      const bar = document.querySelector('[data-fb]');
      root.querySelectorAll('[data-rcard]').forEach((c) => {
        const mine = plan.units.some((u) => u.room === c.dataset.rcard && u.vendor);
        c.hidden = mode === 'vendor' && !(root.dataset.vendorHere === 'yes' && mine);
      });
      // The bar may still be starting: switch to Rooms as soon as it can.
      // A drill-down that asks for the rooms (?view=rooms, from "Rooms signed off") opens them too.
      let tries = 0;
      const wantRooms = mode === 'vendor' || (!setMode.done && new URLSearchParams(location.search).get('view') === 'rooms');
      setMode.done = true;
      const toRooms = () => {
        if (!wantRooms || !bar) return;
        if (bar.rsFilter?.setView) { bar.rsFilter.setView('rooms'); bar.rsFilter.refresh?.(); } else if (tries++ < 30) requestAnimationFrame(toRooms);
      };
      toRooms();
      if (mode !== 'vendor') bar?.rsFilter?.refresh?.();
      document.querySelectorAll('.band [data-help="integrate.next"]').forEach((a) => { a.hidden = mode === 'vendor'; });
    }
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
    root.querySelectorAll('[data-bcard]').forEach((c) => {
      const st = M.batchSum(c.dataset.bcard).status;
      if (c.dataset.fStatus !== st) { c.dataset.fStatus = st; moved = true; bar?.rsFilter?.refresh?.(c); }
      c.dataset.st = st;
    });
    root.querySelectorAll('[data-rcard]').forEach((c) => {
      const st = M.roomSum(c.dataset.rcard).status;
      if (c.dataset.fStatus !== st) { c.dataset.fStatus = st; moved = true; bar?.rsFilter?.refresh?.(c); }
      c.dataset.st = st;
    });
    return moved;
  }
  let view = 'batches';
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
    root.querySelectorAll('[data-slot="ready"]').forEach((el) => swapList(el, readyHtml(M, { by: el.dataset.by === 'follow' ? (view === 'rooms' ? 'room' : 'batch') : el.dataset.by, only: el.dataset.only || null })));
    root.querySelectorAll('[data-slot="shared"]').forEach((el) => { if (swapHtml(el, sharedHtml(M, el.dataset.b)) && mark && ev && /:batch$/.test(ev.item) && W.rsMarkChanged) W.rsMarkChanged(el, mark); });
    root.querySelectorAll('[data-slot="setup"]').forEach((el) => swapHtml(el, setupHtml(M, el.dataset.b), true));
    root.querySelectorAll('[data-slot="tests"]').forEach((el) => { if (swapHtml(el, testsHtml(M, el.dataset.r)) && mark && ev && /:room$/.test(ev.item) && W.rsMarkChanged) W.rsMarkChanged(el, mark); });
    root.querySelectorAll('[data-slot="uaccept"]').forEach((el) => swapHtml(el, uacceptHtml(el.dataset.b)));
    root.querySelectorAll('[data-slot="udetail"]').forEach((el) => { if (!el.closest('[hidden]')) swapHtml(el, detailHtml(el.dataset.u)); });
    root.querySelectorAll('[data-slot="vinstall"]').forEach((el) => swapHtml(el, vinstallHtml(el.dataset.r)));
    root.querySelectorAll('tr[data-u]').forEach((tr) => { const xs = M.unitSteps(tr.dataset.u); tr.dataset.st = xs.some((x) => x.st === 'issue') ? 'issue' : xs.every((x) => x.st === 'done') ? 'done' : xs.some((x) => x.st === 'verified') ? 'verified' : 'todo'; });
    root.querySelectorAll('[data-sck]').forEach((el) => paintSheetCheck(el, mark));
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

  function accept(scope, id, keys, note) {
    const it = scope === 'batch' ? M.item.batch(id) : scope === 'room' ? M.item.room(id) : M.item.project();
    const cur = (scope === 'batch' ? M.bs(id) : scope === 'room' ? M.rs(id) : io.get(it, { accepted: {} })).accepted ?? {};
    const add = Object.fromEntries(keys.map((k) => [k, { who: who(), at: nowIso() }]));
    rec(it, 'accepted', cur, { ...cur, ...add }, note);
  }
  const EV = { provision: 'in the asset register, DNS and device management', install: 'online on the right switch ports', configure: 'settings read back and match the standard' };
  function evidence(keys) {
    const steps = [...new Set(keys.map((k) => k.split('|')[1]))];
    const unitsN = new Set(keys.map((k) => k.split('|')[0])).size;
    const checksN = keys.reduce((n, k) => { const [u, s] = k.split('|'); return n + (M.stepOf(u, s).cs?.length ?? 0); }, 0);
    return `${unitsN} ${unitsN === 1 ? 'unit' : 'units'}, ${keys.length} ${keys.length === 1 ? 'step' : 'steps'}: ${['provision', 'install', 'configure'].filter((s) => steps.includes(s)).map((s) => EV[s]).join('; ')}. ${checksN} checks passed.`;
  }
  function acceptGroup(scope, id) {
    let groups = scope === 'project' ? M.readyGroups('batch') : M.readyGroups(scope).filter((g) => g.id === id);
    const keys = groups.flatMap((g) => g.keys);
    if (!keys.length) return;
    accept(scope, id, keys, `Accepted ${evidence(keys)}`);
  }
  function acceptUnits(bid, only) {
    const keys = M.B.get(bid).units.filter((id) => !only || only.has(id)).flatMap((id) => M.U.get(id).steps.filter((s) => M.stepOf(id, s).st === 'verified').map((s) => `${id}|${s}`));
    if (!keys.length) return 0;
    accept('batch', bid, keys, `Accepted ${evidence(keys)}`);
    return keys.length;
  }

  // ---- The simulated systems: what Keia Atlas and the agent do after a person acts ----
  const reachable = (u) => (u.networked ? Boolean(M.us(u.id).online) : true) && M.hostOnline(u);
  function readBack(bid, delay = 900) {
    if (stage() < 2) return;
    const b = M.B.get(bid); if (!b?.readable || !M.bs(bid).applied) return;
    let i = 0, drifted = false;
    for (const id of b.units) {
      const u = M.U.get(id); if (!u.steps.includes('configure')) continue;
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
      later(1200, () => { pending.delete(uid); setU(uid, 'drift', null, `${first(myName())} reapplied the profile; read back: matches`, 'keia_atlas'); });
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
      if (x.st === 'verified') { const n = M.U.get(uid); accept('batch', n.batch, [`${uid}|${step}`], `Accepted ${evidence([`${uid}|${step}`])}`); return; }
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
      if (keys.length) accept('batch', id, keys, `Confirmed by hand on ${keys.length} ${keys.length === 1 ? 'unit' : 'units'}: set as ${b.cfg?.name ?? 'the configuration'} says. Keia Atlas cannot read these back.`);
      return;
    }
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
  const onChange = (ev) => { const cb = ev.target.closest && ev.target.closest('[data-pick]'); if (cb && root.contains(cb)) pick(cb); };
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('keydown', onKey);
  root.addEventListener('change', onChange);

  // ---- The filter bar: views and sort ----
  const bar = document.querySelector('[data-fb]');
  const onView = (e) => { view = e.detail?.value ?? view; paint(); };
  const RANK = { needs: 0, accept: 1, test: 1, doing: 2, todo: 3, done: 4 };
  const onSort = (e) => {
    const v = e.detail?.value ?? 'order';
    const re = () => root.querySelectorAll('[data-sortable]').forEach((grid) => {
      const items = [...grid.children];
      items.sort((x, y) => (v === 'needs' ? (RANK[x.dataset.st] ?? 5) - (RANK[y.dataset.st] ?? 5) : 0) || (v === 'name' ? String(x.dataset.name).localeCompare(String(y.dataset.name)) : (+x.dataset.order) - (+y.dataset.order)));
      items.forEach((n) => grid.appendChild(n));
    });
    if (bar?.rsFilter) bar.rsFilter.run(true, re); else re();
  };
  if (bar) { bar.addEventListener('fb:view', onView); bar.addEventListener('fb:sort', onSort); view = bar.querySelector('.fb-view[aria-pressed="true"]')?.dataset.fbView ?? view; }

  // ---- The live layer ----
  let stop = null;
  function go() {
    L = W.rsLive; if (!L || !document.body.contains(root)) return;
    L.register(PFX, { base: (it) => M.baseOf(it), describe: (e) => describe(M, e) });
    if (stop) stop();
    stop = L.live.subscribe(PFX, (e, meta) => { paint(e, meta); });
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
    bar?.removeEventListener('fb:view', onView); bar?.removeEventListener('fb:sort', onSort);
  }, { once: true });
}

document.addEventListener('astro:page-load', start);
if (document.readyState !== 'loading') start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
