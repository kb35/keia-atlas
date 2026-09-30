// Replay on the office plan, in the browser (design notes, docs/rules/motion.md). Replay.astro draws the frame; this fills it.
//
// Frames are made when a window is chosen, before anything is shown (docs/rules/motion.md: still frames rendered ahead; Play
// swaps prepared states). A day's frames are snapshots of the simulation (src/lib/livesim.mjs) at each hour; a job's
// are its own events (src/lib/replay.mjs, fed at build time). Pressing a frame shows that moment on the plan through
// the lens script (root.__lensApi.showFrame), with the Then mark, the past-tense sentence and "Replay · 07:52, 28 Sept"
// where the heartbeat was. Play steps one frame per --replay-step; Space pauses; ← and → step; Now goes back to live.
import { prepare, snapshot, tzOffset } from './livesim.mjs';
import { dayHours, frameSvg, pastSentence, stamp, clock, exportHtml } from './replay.mjs';
import { healthLens } from './lenses.mjs';
import { WORD } from './health.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const MIN = 60e3;

export function startReplay(root) {
  const sec = root.querySelector('[data-replay]');
  if (!sec || sec.__rpl) return () => {};
  sec.__rpl = true;
  const W = window, D = document, html = D.documentElement;
  const M = () => (W.rsMotion ? W.rsMotion() : { reduced: true, replay: 600 });
  const toggle = root.querySelector('[data-rpl-toggle]');
  const card = sec.closest('.card') ?? root;
  const jobs = JSON.parse(sec.querySelector('[data-rpl-jobs]')?.textContent ?? '{}');
  const model = prepare(JSON.parse(root.querySelector('[data-loc-model]')?.textContent ?? '{"sites":[],"units":[],"rooms":[]}'));
  const tz = sec.dataset.rplTz || 'Europe/Dublin';
  const strip = sec.querySelector('[data-rpl-strip]'), cap = sec.querySelector('[data-rpl-cap]'), then = sec.querySelector('[data-rpl-then]');
  const wins = sec.querySelector('[data-rpl-wins]'), playBtn = sec.querySelector('[data-rpl-play]');
  let win = null, frames = [], i = -1, timer = null;

  // ---- Time: the office's local clock, zoneless -------------------------------------------------------------------
  const iso = (d) => d.toISOString().slice(0, 16);
  const nowLocal = () => { const ms = Date.now(); return iso(new Date(ms + tzOffset(tz, ms) * MIN)); };
  const toMs = (at) => { const naive = Date.parse(`${at}:00Z`); let ms = naive - tzOffset(tz, naive) * MIN; ms = naive - tzOffset(tz, ms) * MIN; return ms; };

  // ---- The floor on show, as a small plan ------------------------------------------------------------------------
  const fig = () => [...root.querySelectorAll('[data-fm]')].find((f) => f.offsetParent !== null) ?? root.querySelector('[data-fm]');
  function planOf(f) {
    const w = +f.dataset.fmW, h = +f.dataset.fmH, pad = +f.dataset.fmPad;
    const rooms = [...f.querySelectorAll('.fm-room[data-sel^="room:"]:not(.fm-bank)')].map((g) => {
      const r = g.querySelector('rect');
      return { id: g.dataset.sel.slice(5), x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') };
    });
    return { vb: [-pad, -pad, w + pad * 2, h + pad * 2], outline: f.querySelector('.fm-outline')?.getAttribute('points') ?? '', rooms, floor: f.dataset.fm };
  }

  // ---- Windows and their frames ----------------------------------------------------------------------------------
  function dayFrames(plan) {
    const ids = new Set(plan.rooms.map((r) => r.id));
    return dayHours(nowLocal()).map((at) => {
      const snap = snapshot(model, toMs(at)), health = {};
      let bad = 0, use = 0, open = false;
      model.rooms.forEach((r, k) => {
        if (!ids.has(r.id)) return;
        const s = snap.rooms[k];
        // An open incident counts only from when it was opened.
        const early = s.why?.rank === 3 && (model.incs?.[s.why.inc]?.opened ?? '') > at;
        const st = early ? (!s.open ? 'closed' : s.use ? 'use' : 'free') : s.st;
        health[r.id] = st; if (st === 'problem') bad++; if (st === 'use') use++; if (st !== 'closed') open = true;
      });
      return { at, health, caption: !open ? 'Closed' : `${bad ? `${bad} not working` : 'All working'} · ${use} in use`, src: 'Simulated feed' };
    });
  }
  function windowsFor(floor) {
    return [{ id: 'day', kind: 'day', label: 'Today, by the hour', short: 'Today' }, ...(jobs[floor] ?? [])];
  }
  function readingsOf(fr) {
    const out = {};
    for (const [id, st] of Object.entries(fr.health)) {
      if (['use', 'free', 'problem', 'closed'].includes(st)) out[id] = st === 'closed' ? { h: 'none', word: 'Closed', label: '', line: 'Outside the office\'s hours.' } : healthLens(st, st === 'problem' ? 'Not working at that moment.' : '');
      else out[id] = { h: st, word: WORD[st] ?? st, label: '', line: win?.room === id ? fr.caption : `${WORD[st] ?? st} at that moment.` };
    }
    if (win?.kind === 'job') for (const r of planOf(fig()).rooms) out[r.id] ??= { h: 'fine', word: 'Working', label: '', line: 'Nothing open at that moment.' };
    return out;
  }

  // ---- Drawing ---------------------------------------------------------------------------------------------------
  function drawWins() {
    const list = windowsFor(planOf(fig()).floor);
    wins.innerHTML = list.map((w) => `<button type="button" class="rpl-win" data-rpl-win="${esc(w.id)}" aria-pressed="${w.id === win?.id}" title="${esc(w.label)}">${esc(w.kind === 'day' ? w.label : w.short)}</button>`).join('');
  }
  function build(id) {
    const plan = planOf(fig());
    const list = windowsFor(plan.floor);
    win = list.find((w) => w.id === id) ?? list[0];
    frames = win.kind === 'day' ? dayFrames(plan) : win.frames;
    strip.innerHTML = frames.map((f, k) => `<li><button type="button" class="rpl-f" data-rpl-f="${k}" data-help="replay.frame" aria-label="${esc(`${stamp(f.at)}: ${f.caption}`)}">${frameSvg(plan, f.health, { title: stamp(f.at) })}<b>${esc(clock(f.at))}</b><small>${esc(f.caption.split(/[:;](?!\d)/)[0])}</small></button></li>`).join('');
    drawWins();
    i = -1;
    cap.innerHTML = `${esc(win.label)}: ${frames.length} frames. Press one to see the floor as it was.`;
  }
  function show(k) {
    if (!frames.length) return;
    i = Math.max(0, Math.min(frames.length - 1, k));
    const fr = frames[i];
    root.dataset.replay = '1';
    html.dataset.replay = stamp(fr.at);
    root.__lensApi?.showFrame(readingsOf(fr));
    if (W.rsAnswer) W.rsAnswer(pastSentence(fr));
    D.querySelectorAll('.rpl-hb').forEach((el) => { el.textContent = `Replay · ${stamp(fr.at)}`; });
    strip.querySelectorAll('[data-rpl-f]').forEach((b) => b.setAttribute('aria-current', +b.dataset.rplF === i ? 'true' : 'false'));
    then.textContent = `Then · ${stamp(fr.at)}`; then.classList.add('is-then');
    cap.innerHTML = `<b>${esc(stamp(fr.at))}</b> · ${esc(fr.caption)}${fr.src ? ` <small>(${esc(fr.src)})</small>` : ''}`;
    setUrl(fr.at);
  }
  function now() {
    pause();
    i = -1;
    delete root.dataset.replay; delete html.dataset.replay;
    root.__lensApi?.live();
    if (root.__locTick) root.__locTick();
    strip.querySelectorAll('[data-rpl-f]').forEach((b) => b.setAttribute('aria-current', 'false'));
    then.textContent = 'Now'; then.classList.remove('is-then');
    if (win) cap.innerHTML = `${esc(win.label)}: ${frames.length} frames. Press one to see the floor as it was.`;
    setUrl(null);
  }
  function setUrl(at) {
    const u = new URL(location.href);
    if (at) { u.searchParams.set('rw', win.id); u.searchParams.set('at', at); } else { u.searchParams.delete('at'); if (!sec.hidden && win) u.searchParams.set('rw', win.id); else u.searchParams.delete('rw'); }
    try { history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (_) {}
  }

  // ---- Play, only when pressed -----------------------------------------------------------------------------------
  function play() {
    if (timer) { pause(); return; }
    if (i < 0 || i >= frames.length - 1) show(0);
    playBtn.setAttribute('aria-pressed', 'true'); playBtn.textContent = 'Pause';
    timer = setInterval(() => { if (i >= frames.length - 1) { pause(); return; } show(i + 1); }, M().replay);
  }
  function pause() {
    if (timer) clearInterval(timer);
    timer = null;
    playBtn?.setAttribute('aria-pressed', 'false'); if (playBtn) playBtn.textContent = 'Play';
  }

  // ---- Export: the strip, each frame's words and the events, as one page --------------------------------------------
  function exportIt() {
    const plan = planOf(fig());
    const office = sec.dataset.rplTitle ?? 'Office', floorName = root.querySelector(`[data-dt-tab="floor-${CSS.escape(plan.floor)}"]`)?.textContent?.replace(/\d+\s*$/, '').trim() ?? `Floor ${plan.floor}`;
    const page = exportHtml({
      title: `Replay: ${office}, ${floorName}`, where: `${office}, ${floorName}`, windowLabel: win.label,
      frames: frames.map((f) => ({ ...f, svg: frameSvg(plan, f.health, { title: stamp(f.at) }) })),
      timeline: win.kind === 'job' ? frames.map((f) => ({ at: f.at, who: f.src, what: f.caption })) : [],
      note: `Simulated for the Keia Atlas demo. Each frame is the floor as it was at that moment. Exported ${new Date().toLocaleString('en-IE')}.`,
    });
    const a = D.createElement('a');
    a.href = URL.createObjectURL(new Blob([page], { type: 'text/html;charset=utf-8' }));
    a.download = `replay-${plan.floor ? `${office.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-floor-${plan.floor}` : 'floor'}-${win.id}.html`;
    D.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    if (W.rsToast) W.rsToast('Replay exported as one page');
  }

  // ---- Opening and closing ---------------------------------------------------------------------------------------
  function setOpen(on, id) {
    const apply = () => { sec.hidden = !on; if (on) build(id ?? win?.id); };
    if (W.rsHold) W.rsHold(card, apply); else apply();
    toggle?.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (!on) { now(); win = null; setUrl(null); } else setUrl(null);
    if (on && !D.querySelector('.rpl-hb')) D.querySelector('[data-hb]')?.insertAdjacentHTML('afterend', '<span class="rpl-hb" data-help="replay"></span>');
  }
  toggle?.addEventListener('click', () => setOpen(sec.hidden));
  sec.addEventListener('click', (e) => {
    const f = e.target.closest?.('[data-rpl-f]'); if (f) { pause(); show(+f.dataset.rplF); return; }
    const w = e.target.closest?.('[data-rpl-win]'); if (w) { now(); W.rsHold ? W.rsHold(card, () => build(w.dataset.rplWin)) : build(w.dataset.rplWin); setUrl(null); return; }
    const s = e.target.closest?.('[data-rpl-step]'); if (s) { pause(); show((i < 0 ? (+s.dataset.rplStep > 0 ? -1 : frames.length) : i) + +s.dataset.rplStep); return; }
    if (e.target.closest?.('[data-rpl-play]')) { play(); return; }
    if (e.target.closest?.('[data-rpl-now]')) { now(); return; }
    if (e.target.closest?.('[data-rpl-export]')) exportIt();
  });
  function onKey(e) {
    if (sec.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.key === ' ' && !/^(BUTTON|A)$/.test(t?.tagName ?? '')) { e.preventDefault(); if (timer) pause(); else play(); }
    else if (e.key === 'ArrowRight' && !t?.closest?.('[role=tablist]')) { e.preventDefault(); pause(); show(i + 1); }
    else if (e.key === 'ArrowLeft' && !t?.closest?.('[role=tablist]')) { e.preventDefault(); pause(); show(i < 0 ? frames.length - 1 : i - 1); }
  }
  D.addEventListener('keydown', onKey);
  // A new floor: its own windows, back to live.
  const onFloor = () => { if (!sec.hidden) { now(); build('day'); } };
  root.addEventListener('dt:change', onFloor);

  // From the address: ?rw=inc0041210&at=2026-09-28T07:52 opens that moment.
  const q = new URL(location.href).searchParams;
  if (q.get('rw')) {
    const rw = q.get('rw'), at = q.get('at');
    requestAnimationFrame(() => {
      sec.hidden = false; toggle?.setAttribute('aria-expanded', 'true');
      if (!D.querySelector('.rpl-hb')) D.querySelector('[data-hb]')?.insertAdjacentHTML('afterend', '<span class="rpl-hb" data-help="replay"></span>');
      build(rw);
      if (at) { let k = frames.findIndex((f) => f.at === at); if (k < 0) k = Math.max(0, frames.filter((f) => f.at <= at).length - 1); show(k); }
    });
  }
  return () => { pause(); D.removeEventListener('keydown', onKey); delete html.dataset.replay; };
}
