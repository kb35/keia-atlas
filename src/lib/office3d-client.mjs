// The 3D page's script (decision 0030): one model shown two ways. It loads the office's data
// (/locations/<site>/3d.json), runs the live simulation for it (src/lib/livesim.mjs, the same moments as the
// Rooms and Devices overviews), and keeps one choice for both views:
//   3D model     src/lib/office3d-scene.mjs (three.js), loaded only on a wide screen that can draw WebGL
//   Floor plan   the FloorMap SVGs already in the page: the phone view, the keyboard route and the fallback
//   SidePanel    what is chosen and its path to the internet, hop by hop, with links; with nothing chosen,
//                what needs attention now, the way in and the comms rooms
// The choice, the view, the floors, the cables and their colouring stay in the address, so a view can be shared.
import { prepare, snapshot, tickOf } from './livesim.mjs';
import { every, esc, span } from './liveview.mjs';
import { glyph, setGlyph } from './health.mjs';

const W = window;
const NARROW = '(max-width: 759px)';
const STW = { use: 'In use', free: 'Free', problem: 'Problem', closed: 'Closed', comms: 'Comms room', none: 'Not in the live feed' };
const HW = { ok: 'Healthy', warn: 'Alert', bad: 'Down', idle: 'Not monitored' };
const KIND = { device: 'Device', 'room-device': 'In the space', outlet: 'Outlet', run: 'Permanent link', riser: 'Riser fibre', 'patch-panel': 'Patch panel', patch: 'Patch cord',
  switch: 'Switch', firewall: 'Firewall', isp: 'Provider\'s box', 'fibre-panel': 'Fibre panel', 'lead-in': 'Lead-in', entry: 'Building entry', circuit: 'Internet circuit', internet: 'Internet' };
const AP_ALERTS = ['Many clients on one radio', 'Interference on 5 GHz', 'Not reporting to the controller'];
const CIRCUIT_ALERTS = ['Packet loss above the limit', 'Latency above the limit'];
const hasGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

export function mount(root) {
  if (!root || root.__o3) return; root.__o3 = true;
  const q = (s) => root.querySelector(s), qa = (s) => [...root.querySelectorAll(s)];
  const panel = document.getElementById('o3-panel'), body = panel?.querySelector('[data-o3-panel]');
  const stage = q('[data-o3-stage]'), planBox = q('[data-o3-plan]'), box3d = q('[data-o3-3d]'), note = q('[data-o3-note]'), picBox = q('[data-o3-views]');
  const figs = qa('[data-fm]');
  const P = new URLSearchParams(location.search);
  const st = {
    view: P.get('view') === 'plan' ? 'plan' : '3d', floors: ['3', '4'].includes(P.get('floors')) ? P.get('floors') : 'all',
    cables: P.get('cables') !== '0', colour: P.get('colour') === 'health' ? 'health' : 'purpose', sel: P.get('sel') || null,
  };
  const gl = hasGL(), mq = matchMedia(NARROW);
  let D = null, live = null, snap = null, scene = null, loadingScene = null;
  const cleanups = [];
  const unitIx = new Map(), roomIx = new Map(), unitsIn = new Map();
  const byId = {};

  // ---------- Words and states ----------
  const unitSt = (tag) => { const i = unitIx.get(tag); if (i == null || !snap) return null; const s = snap.units[i]; return s.down ? 'bad' : s.al >= 0 || s.inc >= 0 ? 'warn' : 'ok'; };
  const unitWhy = (tag) => {
    const i = unitIx.get(tag); if (i == null || !snap) return null; const u = live.units[i], s = snap.units[i];
    const text = s.down ? 'Offline' : s.al >= 0 ? u.alerts[s.al] : s.inc >= 0 ? live.incs[s.inc]?.title : null;
    const mins = s.since != null ? Math.max(1, Math.round((snap.t - s.since) / 60e3)) : null;
    return text ? { text, mins, inc: s.inc >= 0 ? live.incs[s.inc] : null } : null;
  };
  const roomSt = (id) => {
    const i = roomIx.get(id);
    if (i != null && snap) return snap.rooms[i].st;
    const us = unitsIn.get(id);
    if (us) return us.some((t) => ['bad', 'warn'].includes(unitSt(t))) ? 'problem' : 'comms';
    return 'none';
  };
  const roomWhy = (id) => {
    const i = roomIx.get(id);
    if (i == null) { for (const t of unitsIn.get(id) ?? []) { const w = unitWhy(t); if (w) return { ...w, text: `${live.units[unitIx.get(t)].n}: ${w.text.toLowerCase()}` }; } return null; }
    const w = snap?.rooms[i].why; if (!w) return null;
    if (w.unit != null) {
      const u = live.units[w.unit], r = live.rooms[i];
      const what = u.n.startsWith(r.n + ' ') ? u.n.slice(r.n.length + 1) : u.n, cap = what.charAt(0).toUpperCase() + what.slice(1);
      const text = w.down ? `${cap} offline` : w.al >= 0 ? `${cap}: ${u.alerts[w.al].toLowerCase()}` : `${cap}: ${live.incs[w.inc]?.title ?? 'open incident'}`;
      return { text, mins: w.since != null ? Math.max(1, Math.round((snap.t - w.since) / 60e3)) : null, inc: w.inc >= 0 ? live.incs[w.inc] : null };
    }
    return { text: live.incs[w.inc]?.title ?? 'Open incident', inc: live.incs[w.inc] ?? null };
  };
  const runSt = (r) => { if (r.bb) return 'ok'; const s = r.tag ? unitSt(r.tag) : null; return s ?? 'idle'; };
  const hopSt = (h) => {
    if (!h.h) return null;
    if (unitIx.has(h.h)) return unitSt(h.h);
    if (byId.run.has(h.h)) return runSt(byId.run.get(h.h));
    return null;
  };
  const LIGHT = { ok: 'ok', warn: 'warn', bad: 'bad', idle: 'off' };
  // Each row's health glyph (UI-V2 §6); a hop with no health of its own keeps the plain path dot.
  const light = (s, title) => (s ? glyph(LIGHT[s] ?? 'off', { size: 12, title: title ?? HW[s] ?? '' }) : '<span class="o3-dot" aria-hidden="true"></span>');
  const roomName = (r) => `${r.no ? `${r.no} ` : ''}${r.n}`;
  const base = () => D?.base ?? '/';
  const to = (p) => (p ? `${base()}${p.replace(/^\//, '')}` : null);
  function nameOf(sel) {
    if (!sel || !D) return '';
    const [k, id] = [sel.slice(0, sel.indexOf(':')), sel.slice(sel.indexOf(':') + 1)];
    if (k === 'room') { const r = byId.room.get(id); if (!r) return id; const s = roomSt(id); return `${roomName(r)}: ${STW[s].toLowerCase()}`; }
    if (k === 'ap') { const a = byId.ap.get(id); return `Access point ${a?.host}: ${(HW[unitSt(a?.tag) ?? 'ok']).toLowerCase()}`; }
    if (k === 'run') { const r = byId.run.get(id); return r ? `${r.bb ? 'Riser fibre' : 'Cable'} ${r.id}${r.out ? `, to ${byId.room.get(r.room)?.n ?? ''} ${r.out}` : ''}` : id; }
    if (k === 'rack') { const rk = byId.rack.get(id); return rk ? `${byId.room.get(rk.room)?.n ?? ''}, ${rk.n}` : id; }
    if (k === 'circuit') { const c = byId.circuit.get(id); return c ? `${c.n}, ${c.prov} (${c.role})` : id; }
    return sel;
  }

  // ---------- What is lit: the chosen thing and every hop of its path ----------
  function litOf(sel) {
    if (!sel || !D) return null;
    const set = new Set([sel]);
    for (const i of D.traces[sel] ?? []) { const h = D.hops[i]; if (!h.lit) continue; set.add(h.lit); if (h.lit.startsWith('item:')) set.add(`rack:${h.lit.split(':')[1]}`); }
    for (const k of [...set]) {
      if (k.startsWith('run:')) for (const t of byId.run.get(k.slice(4))?.v ?? []) set.add(`tray:${t}`);
      if (k.startsWith('circuit:')) { const c = byId.circuit.get(k.slice(8)); for (const t of c?.v ?? []) set.add(`tray:${t}`); if (c) set.add(`entry:${c.entry}`); }
    }
    return set;
  }

  // ---------- The panel ----------
  function pill(s, words) { const cls = { problem: 'bad', bad: 'bad', warn: 'warn', use: 'deploy', free: 'manage', ok: 'manage' }[s] ?? 'plain'; return `<span class="pill ${cls}" data-o3-pill>${esc(words)}</span>`; }
  const incLink = (inc) => (inc ? `<a class="o3-inc" href="${esc(inc.to)}">${esc(inc.no)}, ${esc(String(inc.state).toLowerCase())}<small>${esc(inc.title)}</small></a>` : '');
  const whyLine = (w) => (w ? `<p class="o3-why">${esc(w.text)}${w.mins ? `, for ${span(w.mins)}` : ''}</p>${incLink(w.inc)}` : '');
  function head(sel) {
    const [k, id] = [sel.slice(0, sel.indexOf(':')), sel.slice(sel.indexOf(':') + 1)];
    const facts = [], links = [];
    let over = '', title = '', state = '', why = null, extra = '';
    if (k === 'room') {
      const r = byId.room.get(id); const s = roomSt(id);
      over = r.comms ? 'Comms room' : r.bank ? 'Desks' : 'Space'; title = roomName(r); state = pill(s, STW[s]); why = s === 'problem' ? roomWhy(id) : null;
      facts.push(['Floor', r.f]);
      facts.push(['Data outlets', r.outlets ? `${r.outlets}, ${r.used} with a device` : 'None']);
      if (r.vars.length) facts.push(['How it differs', r.vars.map(esc).join('<br>')]);
      links.push([`/rooms/${r.id}/${r.comms ? '#rack' : ''}`, r.comms ? 'Open the comms room' : 'Open the space']);
      const outs = D.runs.filter((x) => x.room === r.id && x.dev);
      if (outs.length) {
        extra = `<h3 class="o3-h">Cables with a device <small>${outs.length}</small></h3><ul class="o3-outs">${outs.slice(0, 10).map((x) => `<li><button type="button" class="o3-link" data-o3-pick="run:${esc(x.id)}">${esc(x.dev)}</button><small>${esc(x.out)}</small></li>`).join('')}</ul>${outs.length > 10 ? `<p class="faint o3-small">And ${outs.length - 10} more: choose one in the model or on the plan.</p>` : ''}`;
      }
    } else if (k === 'ap') {
      const a = byId.ap.get(id), s = unitSt(a.tag) ?? 'ok';
      over = 'Access point'; title = a.host; state = pill(s, HW[s]); why = unitWhy(a.tag);
      facts.push(['Model', a.model], ['Floor', a.f], ['Area', a.area === 'town-hall' ? 'Town hall area' : 'Open area'], ['Asset tag', a.tag]);
      extra = '<p class="faint o3-small">Recorded in the floor file, not yet a unit in a space (floors pilot, open point 1).</p>';
    } else if (k === 'run') {
      const r = byId.run.get(id), s = runSt(r);
      over = r.bb ? 'Riser fibre' : 'Cable run'; title = r.id; state = pill(s, r.bb ? 'Healthy' : r.dev ? HW[s] : 'Spare');
      why = r.tag ? unitWhy(r.tag) : null;
      facts.push(['Cable', `${r.type === 'cat6a' ? 'Cat6A' : r.type === 'fibre-om4' ? 'OM4 fibre' : r.type}, ${(D.purposes.find((p) => p.id === r.pur)?.n ?? r.pur).toLowerCase()}`], ['Length', `${r.len} m`], ['Test', r.test === 'pass' ? 'Passed' : r.test ?? 'Not recorded']);
      if (r.out) facts.push(['To', `${esc(byId.room.get(r.room)?.n ?? '')} ${esc(r.out)}${r.dev ? `, ${esc(r.dev)}` : ', spare'}`]);
      if (r.room) links.push([`/rooms/${r.room}/`, 'Open the space']);
    } else if (k === 'rack') {
      const rk = byId.rack.get(id), room = byId.room.get(rk.room), s = roomSt(rk.room);
      over = 'Rack'; title = `${room?.n ?? rk.room}, ${rk.n}`; state = pill(s === 'problem' ? 'bad' : 'ok', s === 'problem' ? 'Problem' : 'Healthy'); why = s === 'problem' ? roomWhy(rk.room) : null;
      facts.push(['Height', `${rk.hU}U`], ['Items', `${rk.items.filter((it) => !['blank', 'cable-manager', 'reserved'].includes(it.k)).length}`]);
      links.push([`/rooms/${rk.room}/#rack`, 'Open the rack']);
      extra = `<h3 class="o3-h">Active kit</h3><ul class="o3-outs">${rk.items.filter((it) => ['switch', 'firewall', 'isp', 'wlc', 'oob', 'ups'].includes(it.k)).map((it) => { const s2 = String(it.h).startsWith('AG-') ? unitSt(it.h) : null; return `<li data-h="${esc(it.h)}">${light(s2)}${String(it.h).startsWith('AG-') ? `<a href="${esc(to(`/device/?tag=${it.h}`))}">${esc(it.l)}</a>` : esc(it.l)}<small>U${it.u}</small></li>`; }).join('')}</ul>`;
    } else if (k === 'circuit') {
      const c = byId.circuit.get(id), s = unitSt(c.id) ?? 'ok';
      over = 'Internet circuit'; title = `${c.n}, ${c.prov}`; state = pill(s, HW[s]); why = unitWhy(c.id);
      facts.push(['Role', c.role === 'primary' ? 'Primary' : 'Secondary'], ['Service', c.type], ['Lead-in', c.len ? `${c.len} m of fibre` : 'Not recorded'], ['Bandwidth', c.bw === 'Not recorded' ? 'Not recorded' : c.bw]);
      extra = '<p class="faint o3-small">Both lead-ins share riser 1: one path inside the building, recorded as a risk.</p>';
    }
    return `<div class="o3-sel"><p class="o3-over">${esc(over)}</p><h3 class="o3-title">${esc(title)}</h3><div class="o3-state">${state}<button type="button" class="btn small o3-clear" data-o3-clear>Clear</button></div>${whyLine(why)}
      <dl class="o3-facts">${facts.map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${b}</dd></div>`).join('')}</dl>
      ${links.length ? `<p class="o3-links">${links.map(([h, l]) => `<a href="${esc(to(h))}">${esc(l)} →</a>`).join('')}</p>` : ''}</div>${extra}`;
  }
  function pathHtml(sel) {
    const t = D.traces[sel];
    if (!t?.length) return `<p class="faint o3-small">No recorded path to the internet from here.</p>`;
    return `<h3 class="o3-h">Path to the internet <small>${t.length} hops</small></h3><ol class="o3-path">${t.map((i) => {
      const h = D.hops[i], s = hopSt(h), w = s === 'bad' || s === 'warn' ? (unitIx.has(h.h) ? unitWhy(h.h) : null) : null;
      return `<li data-o3-hop="${esc(h.lit ?? '')}" data-h="${esc(h.h ?? '')}"${s ? ` data-st="${s}"` : ''}>${light(s)}<span class="o3-hk">${esc(KIND[h.k] ?? h.k)}</span>
        <span class="o3-hl">${h.to ? `<a href="${esc(to(h.to))}">${esc(h.l)}</a>` : esc(h.l)}</span>${h.sub ? `<small>${esc(h.sub)}</small>` : ''}${w ? `<small class="o3-bad">${esc(w.text)}</small>${incLink(w.inc)}` : ''}</li>`;
    }).join('')}</ol>`;
  }
  function problems() {
    if (!D || !snap) return [];
    const out = [];
    for (const r of D.rooms) { if (r.comms) continue; if (roomSt(r.id) === 'problem') out.push({ sel: `room:${r.id}`, name: roomName(r), why: roomWhy(r.id), s: 'bad' }); }
    for (const a of D.aps) { const s = unitSt(a.tag); if (s === 'bad' || s === 'warn') out.push({ sel: `ap:${a.id}`, name: `Access point ${a.host}`, why: unitWhy(a.tag), s }); }
    for (const rk of D.racks) for (const it of rk.items) { const s = String(it.h).startsWith('AG-') ? unitSt(it.h) : null; if (s === 'bad' || s === 'warn') out.push({ sel: `rack:${rk.id}`, name: `${it.l}, ${byId.room.get(rk.room)?.no ?? ''}`, why: unitWhy(it.h), s }); }
    for (const c of D.circuits) { const s = unitSt(c.id); if (s === 'bad' || s === 'warn') out.push({ sel: `circuit:${c.id}`, name: `${c.n}, ${c.prov}`, why: unitWhy(c.id), s }); }
    return out.sort((a, b) => (a.s === 'bad' ? 0 : 1) - (b.s === 'bad' ? 0 : 1));
  }
  function attentionHtml() {
    const list = problems();
    if (!list.length) return '<p class="o3-ok">No faults right now.</p>';
    return `<ul class="o3-att">${list.map((p) => `<li>${light(p.s)}<span><button type="button" class="o3-link" data-o3-pick="${esc(p.sel)}">${esc(p.name)}</button>${p.why ? `<small>${esc(p.why.text)}${p.why.mins ? `, for ${span(p.why.mins)}` : ''}</small>${incLink(p.why.inc)}` : ''}</span></li>`).join('')}</ul>`;
  }
  function restHtml() {
    return `<p class="o3-intro">Choose a space, rack, access point or cable, in the model or on the plan, to follow its path to the internet hop by hop.</p>
      <h3 class="o3-h">Not working now</h3><div data-o3-att>${attentionHtml()}</div>
      <h3 class="o3-h">The way in</h3><ul class="o3-att">${D.circuits.map((c) => `<li data-h="${esc(c.id)}">${light(unitSt(c.id) ?? 'ok')}<span><button type="button" class="o3-link" data-o3-pick="circuit:${esc(c.id)}">${esc(c.n)}, ${esc(c.prov)}</button><small>${c.role === 'primary' ? 'Primary' : 'Secondary'}, ${esc(D.entries.find((e) => e.id === c.entry)?.n ?? '')}</small></span></li>`).join('')}</ul>
      <h3 class="o3-h">Comms rooms</h3><ul class="o3-att">${D.racks.map((rk) => { const room = byId.room.get(rk.room); return `<li>${light(roomSt(rk.room) === 'problem' ? 'bad' : 'ok')}<span><button type="button" class="o3-link" data-o3-pick="rack:${esc(rk.id)}">${esc(room ? roomName(room) : rk.room)}</button><small>${esc(rk.n)}, floor ${esc(rk.f)}</small></span></li>`; }).join('')}</ul>`;
  }
  function renderPanel(animate = true) {
    if (!body || !D) return;
    const html = st.sel ? head(st.sel) + pathHtml(st.sel) : restHtml();
    const apply = () => { body.innerHTML = html; if (st.sel) body.querySelector('[data-o3-clear]')?.setAttribute('aria-label', `Clear the choice: ${nameOf(st.sel)}`); };
    if (animate && W.rsPanelSwap && panel) W.rsPanelSwap(panel, apply); else apply();
    const t = panel?.querySelector('.sp-h h2'); if (t) t.textContent = st.sel ? 'Chosen' : 'Path to the internet';
  }
  // Live changes in the panel stay in place: lights change colour, the attention list is redrawn only when it changed.
  let attSig = '';
  function refreshPanel() {
    if (!body) return;
    body.querySelectorAll('[data-h]').forEach((el) => {
      const h = el.dataset.h; if (!h) return;
      const s = unitIx.has(h) ? unitSt(h) ?? 'ok' : byId.run.has(h) ? runSt(byId.run.get(h)) : null;
      const l = el.querySelector(':scope > .hg'); if (l && s) setGlyph(l, LIGHT[s], { title: HW[s] });
    });
    if (st.sel) { const p = body.querySelector('[data-o3-pill]'); if (p) { const tmp = document.createElement('div'); tmp.innerHTML = head(st.sel); const np = tmp.querySelector('[data-o3-pill]'); if (np && np.outerHTML !== p.outerHTML) p.replaceWith(np); } }
    const att = body.querySelector('[data-o3-att]');
    if (att) { const sig = problems().map((p) => p.sel + p.s + (p.why?.text ?? '')).join('|'); if (sig !== attSig) { attSig = sig; const doIt = () => { att.innerHTML = attentionHtml(); }; W.rsHold ? W.rsHold(att, doIt) : doIt(); } }
  }

  // ---------- The plan ----------
  const planState = new Map();
  function paintPlan() {
    if (!D) return;
    for (const fig of figs) {
      fig.classList.toggle('fm-nocables', !st.cables);
      fig.classList.toggle('fm-health', st.colour === 'health');
      fig.classList.toggle('fm-lit', !!lit);
      fig.querySelectorAll('[data-sel]').forEach((el) => {
        const key = el.dataset.sel, [k, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
        let s = null;
        if (k === 'room') s = roomSt(id);
        else if (k === 'ap') s = unitSt(byId.ap.get(id)?.tag) ?? 'ok';
        else if (k === 'run') { const r = byId.run.get(id); s = r ? runSt(r) : null; }
        else if (k === 'rack') s = roomSt(byId.rack.get(id)?.room) === 'problem' ? 'bad' : 'ok';
        if (s && planState.get(el) !== s) { el.dataset.st = s; planState.set(el, s); }
        el.classList.toggle('is-lit', !!lit?.has(key));
        const on = key === st.sel; el.classList.toggle('is-sel', on); if (el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (el.tabIndex >= 0) el.setAttribute('aria-label', nameOf(key));
      });
      fig.querySelectorAll('[data-tray]').forEach((el) => el.classList.toggle('is-lit', !!lit?.has(`tray:${el.dataset.tray}`)));
    }
  }
  function showFloorsInPlan() {
    qa('[data-o3-floor]').forEach((el) => { el.hidden = !(st.floors === 'all' || st.floors === el.dataset.o3Floor); });
  }

  // ---------- Choosing ----------
  let lit = null;
  function select(sel, { from = null } = {}) {
    if (sel && !(D?.traces[sel] || byId.has(sel))) sel = null;
    if (sel === st.sel) return;
    st.sel = sel; lit = litOf(sel);
    save(); paintPlan(); scene?.light(lit, sel); renderPanel();
    // A thing on the other floor: show it.
    const f = floorOf(sel);
    if (f && st.floors !== 'all' && st.floors !== f) setFloors('all');
    const bar = q('[data-o3-chosen]');
    if (bar) { bar.hidden = !sel || !mq.matches; bar.querySelector('span').textContent = sel ? nameOf(sel) : ''; }
    if (from === 'key' && sel) q(`[data-sel="${CSS.escape(sel)}"]`)?.focus();
  }
  function floorOf(sel) {
    if (!sel) return null;
    const [k, id] = [sel.slice(0, sel.indexOf(':')), sel.slice(sel.indexOf(':') + 1)];
    return k === 'room' ? byId.room.get(id)?.f : k === 'ap' ? byId.ap.get(id)?.f : k === 'rack' ? byId.rack.get(id)?.f : k === 'run' ? byId.run.get(id)?.f : null;
  }

  // ---------- Controls ----------
  function save() {
    const p = new URLSearchParams(location.search);
    const set = (k, v, def) => (v === def || v == null ? p.delete(k) : p.set(k, v));
    set('view', st.view, '3d'); set('floors', st.floors, 'all'); set('cables', st.cables ? null : '0', null); set('colour', st.colour, 'purpose'); set('sel', st.sel, null);
    const qs = p.toString(); history.replaceState(history.state, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  }
  const press = (attr, val) => qa(`[${attr}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute(attr) === val)));
  function setFloors(v, animate = true) {
    st.floors = v; press('data-o3-floors', v);
    const swap = () => showFloorsInPlan();
    if (effView() === 'plan' && animate && W.rsHold) W.rsHold(planBox, swap); else swap();
    scene?.setFloors(v, animate); save();
  }
  const effView = () => (gl && !mq.matches ? st.view : 'plan');
  function applyView(animate = true) {
    const v = effView();
    qa('[data-o3-view]').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.o3View === v)); b.disabled = b.dataset.o3View === '3d' && (!gl || mq.matches); });
    root.dataset.o3View = v;
    const swap = () => { box3d.hidden = v !== '3d'; planBox.hidden = v !== 'plan'; };
    if (animate && W.rsSwap && picBox) W.rsSwap(picBox, swap); else swap();
    if (note) { note.hidden = gl && !mq.matches; note.textContent = !gl ? 'This browser can\'t draw the 3D model here, so the floor plan shows it.' : 'On a small screen the floor plan shows the model. Open this page on a wider screen for 3D.'; }
    if (v === '3d') ensureScene();
    const bar = q('[data-o3-chosen]'); if (bar) bar.hidden = !st.sel || !mq.matches;
  }
  function ensureScene() {
    if (scene || loadingScene || !D) return;
    stage.dataset.state = 'loading';
    loadingScene = import('./office3d-scene.mjs').then(({ createScene }) => {
      if (!root.isConnected) return;
      scene = createScene(stage, D, {
        onPick: (sel) => select(sel),
        onHover: (sel, ev) => hover(sel, ev),
        onWheelHint: wheelHint,
      });
      scene.setStates(states);
      scene.setFloors(st.floors, false); scene.setCables(st.cables); scene.setColour(st.colour); scene.light(lit, st.sel);
      if (st.floors !== 'all') scene.preset(`f${st.floors}`, false);
      stage.dataset.state = 'ready';
    }).catch(() => { stage.dataset.state = 'failed'; st.view = 'plan'; applyView(false); });
  }
  const tip = q('[data-o3-tip]');
  function hover(sel, ev) {
    if (!tip) return;
    if (!sel) { tip.hidden = true; scene?.focus(null); return; }
    tip.textContent = nameOf(sel); tip.hidden = false;
    const r = stage.getBoundingClientRect();
    tip.style.transform = `translate(${Math.round(ev.clientX - r.left + 14)}px, ${Math.round(ev.clientY - r.top + 14)}px)`;
  }
  let hintT = 0;
  function wheelHint() { const h = q('[data-o3-hint]'); if (!h) return; h.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => { h.hidden = true; }, 1400); }

  root.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-sel]'); if (!t) return;
    if (t.dataset.o3View && !t.disabled) { st.view = t.dataset.o3View; save(); applyView(); }
    else if (t.dataset.o3Floors) { setFloors(t.dataset.o3Floors); if (st.floors !== 'all') scene?.preset(`f${st.floors}`); }
    else if (t.hasAttribute('data-o3-cables')) { st.cables = !st.cables; t.setAttribute('aria-pressed', String(st.cables)); scene?.setCables(st.cables); paintPlan(); save(); }
    else if (t.dataset.o3Colour) { st.colour = t.dataset.o3Colour; press('data-o3-colour', st.colour); root.dataset.o3Colour = st.colour; scene?.setColour(st.colour); paintPlan(); save(); }
    else if (t.dataset.o3Cam) { const c = t.dataset.o3Cam; if (c === 'f3' || c === 'f4') setFloors(c.slice(1)); scene?.preset(c); }
    else if (t.dataset.sel && t.closest('[data-fm]')) select(t.dataset.sel === st.sel ? null : t.dataset.sel);
  });
  // The plan's own rooms, racks and access points: Enter or Space chooses.
  root.addEventListener('keydown', (e) => {
    const t = e.target.closest?.('[data-fm] [data-sel]');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(t.dataset.sel === st.sel ? null : t.dataset.sel, { from: 'key' }); }
    else if (e.key === 'Escape' && st.sel) select(null);
  });
  stage?.addEventListener('keydown', (e) => { if (e.target === stage && scene?.key(e)) e.preventDefault(); });
  const onPanelClick = (e) => {
    const b = e.target.closest('[data-o3-pick], [data-o3-clear]'); if (!b) return;
    if (b.hasAttribute('data-o3-clear')) select(null); else select(b.dataset.o3Pick);
  };
  panel?.addEventListener('click', onPanelClick);
  const onPanelOver = (e) => { const li = e.target.closest('[data-o3-hop]'); scene?.focus(li?.dataset.o3Hop || null); };
  panel?.addEventListener('pointerover', onPanelOver);
  q('[data-o3-to-plan]')?.addEventListener('click', (e) => { e.preventDefault(); st.view = 'plan'; save(); applyView(); setTimeout(() => planBox.querySelector('[data-o3-floor]:not([hidden]) [data-sel][tabindex]')?.focus(), 60); });
  const onMq = () => applyView(false);
  mq.addEventListener?.('change', onMq);
  // Looks and light or dark: read the tokens again.
  const look = new MutationObserver(() => { requestAnimationFrame(() => scene?.recolour()); });
  look.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-skin', 'class', 'style'] });
  const dark = matchMedia('(prefers-color-scheme: dark)'), onDark = () => scene?.recolour();
  dark.addEventListener?.('change', onDark);

  // ---------- Start ----------
  const states = { room: (id) => roomSt(id), unit: (t) => unitSt(t), run: (r) => runSt(r), circuit: (id) => unitSt(id) };
  press('data-o3-floors', st.floors); press('data-o3-colour', st.colour); root.dataset.o3Colour = st.colour;
  q('[data-o3-cables]')?.setAttribute('aria-pressed', String(st.cables));
  showFloorsInPlan(); applyView(false);
  fetch(root.dataset.o3Src).then((r) => r.json()).then((data) => {
    if (!root.isConnected) return;
    D = data;
    byId.room = new Map(D.rooms.map((r) => [r.id, r])); byId.ap = new Map(D.aps.map((a) => [a.id, a])); byId.run = new Map(D.runs.map((r) => [r.id, r]));
    byId.rack = new Map(D.racks.map((r) => [r.id, r])); byId.circuit = new Map(D.circuits.map((c) => [c.id, c]));
    byId.has = (sel) => { const i = sel.indexOf(':'), k = sel.slice(0, i), id = sel.slice(i + 1); return !!byId[k]?.has?.(id); };
    live = prepare(D.live);
    live.units.forEach((u, i) => {
      unitIx.set(u.id, i);
      if (u.cls === 'access-point') u.alerts = AP_ALERTS;
      if (u.cls === 'circuit') { u.alerts = CIRCUIT_ALERTS; u.pDown = 0.01; u.pAlert = 0.03; }
      if (u.room) (unitsIn.get(u.room) ?? unitsIn.set(u.room, []).get(u.room)).push(u.id);
    });
    live.rooms.forEach((r, i) => roomIx.set(r.id, i));
    snap = snapshot(live, tickOf(Date.now()));
    lit = litOf(st.sel && (D.traces[st.sel] || byId.has(st.sel)) ? st.sel : null); if (!lit) st.sel = null;
    root.dataset.o3Ready = '';
    paintPlan(); renderPanel(false); attSig = problems().map((p) => p.sel + p.s + (p.why?.text ?? '')).join('|');
    if (effView() === '3d') ensureScene();
    const stop = every((t) => {
      snap = snapshot(live, t);
      paintPlan(); refreshPanel(); scene?.setStates(states);
      if (W.rsKeyNumber) W.rsKeyNumber('o3-prob', String(D.rooms.filter((r) => !r.comms && roomSt(r.id) === 'problem').length));
    });
    cleanups.push(stop);
    if (W.rsKeyNumber) W.rsKeyNumber('o3-prob', String(D.rooms.filter((r) => !r.comms && roomSt(r.id) === 'problem').length));
  }).catch(() => { if (body) body.innerHTML = '<p class="faint">The model could not be loaded. Reload the page to try again.</p>'; });

  const destroy = () => {
    cleanups.forEach((f) => f()); scene?.dispose(); look.disconnect(); mq.removeEventListener?.('change', onMq); dark.removeEventListener?.('change', onDark);
    panel?.removeEventListener('click', onPanelClick); panel?.removeEventListener('pointerover', onPanelOver);
  };
  document.addEventListener('astro:before-swap', destroy, { once: true });
}
