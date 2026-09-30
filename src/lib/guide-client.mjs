// The room guide in the browser: sending a report or a request through the live layer (src/lib/live.mjs),
// and showing what was sent, as it arrives, on the pages staff watch: the Incidents board, the office page,
// Home (technician and service desk) and the room's own page. Also the guide itself, so a second person
// in the room sees that it has already been reported.
//
// Pages mark where things go; nothing here knows a page's layout beyond those marks:
//   [data-guide-room]           the guide: data-room, and [data-guide-known] for the "We know" list
//   [data-guide-form]           the report or request form: data-kind="report" | "request", a JSON room
//   [data-guide-host]           a staff page: "board" | "office" | "home" | "room", with data-site or data-room
// Rows are added in the page's own style: they take the scoped-style mark of the list they join.
import { browserLive } from './live.mjs';
import { reportIncident, makeRequest, fromEvents, symptomOf, requestOf, reportStatus, sentFields, localStamp, REPORT_PREFIX, REQUEST_PREFIX } from './guide.mjs';
import { setGlyph } from './health.mjs';

const D = document;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reduced = () => (window.rsReducedNow ? window.rsReducedNow() : matchMedia('(prefers-reduced-motion: reduce)').matches);
const hm = (stamp) => stamp.slice(11, 16);
const todayOf = (stamp) => stamp.slice(0, 10);
let stops = [];
D.addEventListener('astro:before-swap', () => { stops.forEach((f) => f()); stops = []; });

const live = () => browserLive();
const all = () => fromEvents(live()?.events() ?? []);
const onChange = (fn) => {
  const L = live(); if (!L) return;
  stops.push(L.subscribe(REPORT_PREFIX, fn), L.subscribe(REQUEST_PREFIX, fn));
};
// The scoped-style mark (data-astro-cid-...) of an element, so a row made here looks like the page's own.
const cidOf = (el) => [...(el?.attributes ?? [])].find((a) => a.name.startsWith('data-astro-cid-'))?.name ?? null;
function html(el, markup, cid) {
  el.innerHTML = markup;
  if (cid) for (const x of [el, ...el.querySelectorAll('*')]) x.setAttribute(cid, '');
  return el;
}
const mark = (el, remote) => { if (remote && window.rsMarkChanged) window.rsMarkChanged(el, 'Room guide'); };

// ---- The guide: the answer line says so when a report from this room is open --------------------------
// The report itself, its status and its steps are GuideReport's (mountReport, below).
function mountGuide(root) {
  const room = root.dataset.room, ans = root.querySelector('[data-guide-answer]');
  if (!ans) return;
  const glyphEl = ans.querySelector('.hg'), text = ans.querySelector('[data-answer-text]');
  const was = { state: glyphEl?.dataset.state, text: text?.textContent };
  const owner = JSON.parse(root.querySelector('[data-guide-report] script[type="application/json"]')?.textContent ?? '{}').room?.owner ?? null;
  const draw = () => {
    const r = openReport(room);
    if (!r) { setGlyph(glyphEl, was.state, { title: was.text }); if (text.textContent !== was.text) text.textContent = was.text; return; }
    const st = reportStatus(r, { owner });
    const words = `We know: ${symptomOf(r.reported.keia_atlas?.symptom).label.toLowerCase()} · ${st.word}`;
    setGlyph(glyphEl, st.glyph, { title: words });
    if (text.textContent !== words) text.textContent = words;
  };
  draw();
  onChange(draw);
}

// The newest report from this room today that is still open for the person (not answered "Yes, it works").
const itemOf = (n) => REPORT_PREFIX + n;
function openReport(room) {
  const mine = all().reports.filter((r) => r.subject?.room === room);
  if (!mine.length) return null;
  const today = todayOf(mine[0].opened);
  for (const inc of mine.filter((x) => todayOf(x.opened) === today)) {
    const r = live()?.stateOf(itemOf(inc.number)) ?? { reported: inc };
    if (!r.followup?.ok) return r;
  }
  return null;
}

// ---- GuideReport: two taps, then the status read back ------------------------------------------------
// Views: start (two buttons) → list (symptoms) → sent (status, steps, follow-up, what was sent). The box eases
// to its new height (the held-box morph, --dur-morph) and the new view fades in (--dur-state); the With chip
// slides between owners (km.chip, MOTION-V2 4.17); a status change eases the glyph in place and cross-fades the
// words once (4.15). Reduced motion: everything changes at once.
const TAKE_AFTER_MS = 6000;   // simulated: the technician takes a new report a few seconds after it arrives
function mountReport(root) {
  const { room } = JSON.parse(root.querySelector('script[type="application/json"]').textContent);
  const owner = room.owner ?? null;
  const $ = (s) => root.querySelector(s);
  const views = [...root.querySelectorAll('[data-gr-view]')];
  const M = () => window.km?.t ?? { state: 300, stagger: 24, settle: 'cubic-bezier(.22,1,.36,1)' };
  const morphMs = () => parseFloat(getComputedStyle(D.documentElement).getPropertyValue('--dur-morph')) || 520;
  const stamp = () => localStamp(Date.now(), room.tz ?? 'UTC');
  let current = null, last = null, timer = null;

  function show(to, { focus = true } = {}) {
    if (root.dataset.view === to) return;
    const h0 = root.offsetHeight;
    for (const v of views) v.hidden = v.dataset.grView !== to;
    root.dataset.view = to;
    const el = views.find((v) => v.dataset.grView === to);
    if (focus) el.querySelector('[data-gr-focus]')?.focus({ preventScroll: true });
    // Keep the view's top in sight under the sticky bar.
    const top = root.getBoundingClientRect().top;
    if (top < 64) scrollBy({ top: top - 72, behavior: reduced() ? 'auto' : 'smooth' });
    if (reduced() || !root.animate) return;
    const h1 = root.offsetHeight;
    if (Math.abs(h1 - h0) > 1) root.animate([{ height: `${h0}px`, overflow: 'hidden' }, { height: `${h1}px`, overflow: 'hidden' }], { duration: morphMs(), easing: M().settle });
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M().state, easing: M().settle });
  }

  const L = live();
  const now = () => (current ? L?.stateOf(itemOf(current)) ?? null : null);
  const put = (field, after, note) => L?.record({ item: itemOf(current), field, before: now()?.[field] ?? null, after, who: null, note });

  // Liam's side, simulated: he takes it, then marks it fixed. A technician doing it in another window is the same event.
  const take = () => { const r = now(); if (!r || r.with || !owner) return; put('with', { who: owner.id, name: owner.name, at: stamp() }, `${owner.first} took it (simulated)`); };
  const fix = () => { const r = now(); if (!r?.with || (r.fixed && r.followup?.ok !== false)) return; if (r.followup) put('followup', null); put('fixed', { at: stamp(), by: r.with.who }, `${r.with.name.split(' ')[0]} marked it fixed (simulated)`); };
  const armTake = (r) => {
    clearTimeout(timer);
    if (!r || r.with || !owner) return;
    const made = L?.historyOf(itemOf(current)).at(-1)?.at;
    const age = made ? Date.now() - Date.parse(made) : 0;
    timer = setTimeout(take, Math.max(1500, TAKE_AFTER_MS - age));
  };
  stops.push(() => clearTimeout(timer));

  function render() {
    const r = now(); if (!r?.reported) return;
    const st = reportStatus(r, { owner });
    const first = last === null;
    if (!first && last !== st.step && !reduced()) {
      for (const el of [$('[data-gr-head]'), $('[data-gr-line]')]) el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M().state, easing: M().settle });
    }
    // The sent view's glyphs arrive after the page's M8, so they are lit at once (as glyph() draws them).
    root.querySelectorAll('[data-gr-view="sent"] .hg:not(.lit)').forEach((el) => el.classList.add('lit'));
    setGlyph($('[data-gr-glyph] .hg'), st.glyph, { title: st.sentence });
    $('[data-gr-head]').textContent = st.head;
    $('[data-gr-line]').textContent = st.line;
    // The chip: Ready for Liam, then With Liam · since 08:05. It slides only when the owner or the words change.
    const chip = $('[data-gr-chip]');
    if (chip && owner) {
      const who = r.with ? r.with.name.split(' ')[0] : owner.first;
      const text = r.with ? `With ${who}` : `Ready for ${who}`;
      if (chip.dataset.key !== text) {
        if (first || !window.km) chip.querySelector('.km-chip-text').textContent = text;
        else window.km.chip(chip, { mark: owner.initials, kind: 'person', text });
        chip.dataset.key = text;
      }
      chip.toggleAttribute('data-ready', !r.with);
      chip.hidden = st.step === 'done' || st.step === 'fixed';
    }
    for (const s of st.steps) {
      const li = $(`[data-step="${s.key}"]`);
      setGlyph(li.querySelector('.hg'), s.state, { title: `${s.word} ${s.at}`.trim() });
      li.querySelector('[data-step-word]').textContent = s.word;
      li.querySelector('[data-step-at]').textContent = s.at;
      li.toggleAttribute('data-done', s.state === 'fine');
    }
    $('[data-gr-ask]').hidden = !st.ask;
    // Once it is fixed there is nothing left to be told about.
    $('[data-gr-opt="contact"]').hidden = st.step === 'fixed' || st.step === 'done';
    // The demo strip: what happens next on Liam's side, and a button to play it now.
    const demo = $('[data-gr-demo]'), next = $('[data-gr-next]'), dt = $('[data-gr-demo-text]');
    const name = r.with?.name.split(' ')[0] ?? owner?.first ?? 'The team';
    demo.hidden = st.step === 'done';
    next.hidden = st.step === 'fixed';
    dt.textContent = !r.with ? `${name} takes it in a few seconds.` : st.step === 'fixed' ? 'Answer as the person in the room.' : `${name} is working on it. Play the fix:`;
    next.textContent = !r.with ? `Take it as ${name}` : `Mark it fixed as ${name}`;
    if (first || $('[data-gr-ref]').textContent !== r.reported.number) {
      $('[data-gr-ref]').textContent = r.reported.number;
      $('[data-gr-fields]').innerHTML = sentFields(r.reported, room).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
    }
    const saved = [r.note && 'Note added.', r.contact && "We'll tell you when it's fixed."].filter(Boolean).join(' ');
    $('[data-gr-saved]').hidden = !saved; $('[data-gr-saved]').textContent = saved;
    last = st.step;
    armTake(r);
  }

  // Tap 1: the buttons become the list, in place.
  $('[data-gr-open]')?.addEventListener('click', (e) => { e.preventDefault(); show('list'); });
  $('[data-gr-back]')?.addEventListener('click', () => show(current && now() && !now().followup?.ok ? 'sent' : 'start'));
  // Tap 2: the report is made and sent; the status replaces the list.
  root.querySelectorAll('[data-symptom]').forEach((b) => b.addEventListener('click', () => {
    root.querySelectorAll('.gr-sym.picked').forEach((x) => x.classList.remove('picked'));
    b.classList.add('picked');
    const rec = reportIncident({ room, symptom: b.dataset.symptom });
    current = rec.number; last = null;
    L?.record({ item: itemOf(rec.number), field: 'reported', before: null, after: JSON.parse(JSON.stringify(rec)), who: null, note: 'Reported from the room guide' });
    root.querySelectorAll('.gr-opt').forEach((d) => { d.open = false; d.querySelector('input').value = ''; });
    render();
    const go = () => { b.classList.remove('picked'); show('sent'); };
    reduced() ? go() : setTimeout(go, M().state / 2);
  }));
  $('[data-gr-next]').addEventListener('click', () => { const r = now(); if (!r?.with) take(); else fix(); });
  root.querySelectorAll('[data-gr-answer]').forEach((b) => b.addEventListener('click', () => {
    const ok = b.dataset.grAnswer === 'yes';
    put('followup', { ok, at: stamp() }, ok ? 'The person in the room says it works' : 'Reopened: not fixed for the person');
    if (!ok) put('fixed', null);
  }));
  root.querySelectorAll('[data-gr-save]').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = f.querySelector('input').value.trim(); if (!v || !current) return;
    put(f.dataset.grSave, v, f.dataset.grSave === 'note' ? 'Note from the person in the room' : 'The person in the room asked to be told');
    f.closest('details').open = false;
  }));
  $('[data-gr-again]').addEventListener('click', () => show('list'));

  onChange((e) => { if (current && e.item === itemOf(current)) render(); });
  // Coming back to the page: the newest open report from this room reads its status back at once.
  if (root.dataset.view === 'start') {
    const r = openReport(room.id);
    if (r) { current = r.reported.number; render(); show('sent', { focus: false }); }
  }
}

// ---- The forms: pick a tile, Send, see the reference ------------------------------------------------
function mountForm(root) {
  const form = root.querySelector('form'), done = root.querySelector('[data-guide-done]'), send = form.querySelector('[data-send]');
  const room = JSON.parse(root.querySelector('script[type="application/json"]').textContent);
  const kind = root.dataset.kind;
  const pick = () => form.querySelector('input[name="pick"]:checked')?.value ?? null;
  form.addEventListener('change', (e) => {
    send.disabled = !pick(); send.classList.toggle('ready', !!pick());
    // A tile picked with Send out of sight: bring Send up, so the second tap is right there.
    if (e.target.name === 'pick' && send.getBoundingClientRect().bottom > innerHeight) send.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const choice = pick(); if (!choice) return;
    const note = form.querySelector('[name="note"]')?.value ?? '', name = form.querySelector('[name="name"]')?.value ?? '';
    const L = live();
    let rec;
    if (kind === 'report') {
      rec = reportIncident({ room, symptom: choice, note, name });
      L?.record({ item: REPORT_PREFIX + rec.number, field: 'reported', before: null, after: JSON.parse(JSON.stringify(rec)), who: null, note: 'Reported from the room guide' });
    } else {
      rec = makeRequest({ room, kind: choice, what: note, name });
      L?.record({ item: REQUEST_PREFIX + rec.number, field: 'requested', before: null, after: rec, who: null, note: 'Requested from the room guide' });
    }
    done.querySelectorAll('[data-ref]').forEach((el) => { el.textContent = rec.number; });
    done.querySelectorAll('[data-what]').forEach((el) => { el.textContent = kind === 'report' ? symptomOf(choice).label : requestOf(choice).label; });
    const swap = () => {
      form.hidden = true; root.querySelectorAll('[data-guide-before]').forEach((el) => { el.hidden = true; });
      done.hidden = false; done.classList.remove('g-in'); void done.offsetWidth; done.classList.add('g-in');
      done.querySelector('[data-done-h]')?.focus({ preventScroll: true });
      scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
    };
    // Fade the form out, then show the answer; the timer makes sure it swaps even where animations are paused.
    let did = false;
    const once = () => { if (!did) { did = true; swap(); } };
    if (reduced() || !form.animate) once();
    else { form.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.98)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished.then(once); setTimeout(once, 260); }
  });
  root.querySelector('[data-again]')?.addEventListener('click', () => {
    form.reset(); send.disabled = true; send.classList.remove('ready');
    form.getAnimations?.().forEach((a) => a.cancel());
    form.hidden = false; done.hidden = true; root.querySelectorAll('[data-guide-before]').forEach((el) => { el.hidden = false; });
  });
}

// ---- Staff pages -------------------------------------------------------------------------------------
const roomLink = (base, r) => `${base}/rooms/${r.subject.room}/#room-guide`;
const where = (r) => r.where ?? r.subject.room;

function boardHost(host) {
  const list = D.querySelector('[data-board] [data-col="new"] [data-col-list]');
  if (!list) return;
  const base = host.dataset.base, cid = cidOf(list), bar = D.querySelector('[data-fb]');
  const draw = (e, info) => {
    for (const r of all().reports.slice().reverse()) {
      if (list.querySelector(`[data-guide-ref="${r.number}"]`)) continue;
      const a = D.createElement('a');
      a.className = `icard pr-${r.priority} g-live`;
      a.href = roomLink(base, r);
      Object.assign(a.dataset, { guideRef: r.number, fi: '', i: '-1', opened: r.opened, find: `${r.number} ${r.short_description} ${r.caller} ${where(r)} room guide`, fState: 'new', fPrio: String(r.priority), fSite: r.site ?? '', fRegion: r.region ?? '' });
      html(a, `<span class="ic-top"><span class="mono ic-no">${esc(r.number)}</span><span class="prio p-${r.priority}">P${r.priority}</span><span class="ic-flag">Room guide</span></span>` +
        `<b class="ic-t">${esc(r.short_description)}</b>` +
        `<span class="ic-state">Reported ${esc(hm(r.opened))} by ${esc(r.caller)}</span>`, cid);
      list.insertBefore(a, list.firstChild);
      if (bar?.rsFilter) bar.rsFilter.refresh(a);
      mark(a, info?.remote);
    }
  };
  draw();
  onChange(draw);
}

function officeHost(host) {
  const site = host.dataset.site, base = host.dataset.base;
  const head = [...D.querySelectorAll('#work .ow-h')].find((h) => /^Incidents/.test(h.textContent.trim()));
  if (!head) return;
  const cid = cidOf(head), col = head.parentElement;
  const draw = (e, info) => {
    const mine = all().reports.filter((r) => r.site === site);
    let ul = col.querySelector('ul.tl');
    if (!ul && mine.length) { col.querySelector('p.faint')?.remove(); ul = html(D.createElement('ul'), '', cid); ul.className = 'tl'; col.appendChild(ul); }
    for (const r of mine.slice().reverse()) {
      if (ul.querySelector(`[data-guide-ref="${r.number}"]`)) continue;
      const li = html(D.createElement('li'), `<a href="${esc(roomLink(base, r))}"><b>${esc(r.short_description)}</b></a><small><span class="ri-p p-${r.priority}">P${r.priority}</span> ${esc(r.number)} · New · from the room guide, ${esc(hm(r.opened))}</small>`, cid);
      li.dataset.guideRef = r.number;
      ul.insertBefore(li, ul.firstChild);
      mark(li, info?.remote);
    }
  };
  draw();
  onChange(draw);
}

// Home draws its lists itself (and again on View as), so rows are put back whenever a list is redrawn.
function homeHost(host) {
  const base = host.dataset.base;
  const lists = [
    { el: D.querySelector('[data-office-inc]'), site: () => new URLSearchParams(D.querySelector('[data-office-all]')?.getAttribute('href')?.split('?')[1] ?? '').get('site') },
    { el: D.querySelector('[data-desk-new]'), site: () => null },
  ].filter((x) => x.el);
  let busy = false;
  const draw = (e, info) => {
    busy = true;
    for (const { el, site } of lists) {
      const s = site(), cid = cidOf(el);
      const mine = all().reports.filter((r) => !s || r.site === s);
      for (const r of mine.slice().reverse()) {
        if (el.querySelector(`[data-guide-ref="${r.number}"]`)) continue;
        el.querySelector('.hp-empty')?.remove();
        const a = html(D.createElement('a'), `<span class="prio p${r.priority}">P${r.priority}</span><span>${esc(r.short_description)}<small>${esc(where(r))} · New · Room guide, ${esc(hm(r.opened))}</small></span><span class="mr-arrow" aria-hidden="true">→</span>`, cid);
        a.className = 'mini-row'; a.href = roomLink(base, r); a.dataset.guideRef = r.number;
        el.insertBefore(a, el.firstChild);
        mark(a, info?.remote);
      }
    }
    busy = false;
  };
  const mo = new MutationObserver(() => { if (!busy) draw(); });
  lists.forEach(({ el }) => mo.observe(el, { childList: true }));
  stops.push(() => mo.disconnect());
  draw();
  onChange(draw);
}

// The room page: what people in this room sent from its guide.
function roomHost(host) {
  const room = host.dataset.room, list = host.querySelector('[data-guide-sent]'), none = host.querySelector('[data-guide-none]');
  if (!list) return;
  const draw = (e, info) => {
    const { reports, requests } = all();
    const rows = [
      ...reports.filter((r) => r.subject?.room === room).map((r) => ({ at: r.opened, n: r.number, t: r.short_description, s: `Incident · P${r.priority} · ${r.caller}` })),
      ...requests.filter((r) => r.room === room).map((r) => ({ at: r.opened, n: r.number, t: r.title, s: `Request: ${r.label} · ${r.caller}` })),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
    const cid = cidOf(list);
    for (const r of rows.slice().reverse()) {
      if (list.querySelector(`[data-guide-ref="${r.n}"]`)) continue;
      const li = html(D.createElement('li'), `<b>${esc(r.t)}</b><small>${esc(r.n)} · ${esc(r.s)} · ${esc(r.at.slice(8, 10))}/${esc(r.at.slice(5, 7))} ${esc(hm(r.at))}</small>`, cid);
      li.dataset.guideRef = r.n;
      list.insertBefore(li, list.firstChild);
      mark(li, info?.remote);
    }
    if (none) none.hidden = rows.length > 0;
  };
  draw();
  onChange(draw);
}

const HOSTS = { board: boardHost, office: officeHost, home: homeHost, room: roomHost };
export function mountAll() {
  for (const el of D.querySelectorAll('[data-guide-report]:not([data-gm])')) { el.dataset.gm = '1'; mountReport(el); }
  for (const el of D.querySelectorAll('[data-guide-room]:not([data-gm])')) { el.dataset.gm = '1'; mountGuide(el); }
  for (const el of D.querySelectorAll('[data-guide-form]:not([data-gm])')) { el.dataset.gm = '1'; mountForm(el); }
  for (const el of D.querySelectorAll('[data-guide-host]:not([data-gm])')) { el.dataset.gm = '1'; HOSTS[el.dataset.guideHost]?.(el); }
}
