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
import { reportIncident, makeRequest, fromEvents, symptomOf, requestOf, REPORT_PREFIX, REQUEST_PREFIX } from './guide.mjs';

const D = document;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
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

// ---- The guide: "We know" also lists today's reports from this room ---------------------------------
function mountGuide(root) {
  const room = root.dataset.room, list = root.querySelector('[data-guide-known-live]'), box = root.querySelector('[data-guide-known]');
  if (!list || !box) return;
  const draw = () => {
    const mine = all().reports.filter((r) => r.subject?.room === room);
    const today = mine.length ? todayOf(mine[0].opened) : null;
    const shown = mine.filter((r) => todayOf(r.opened) === today).slice(0, 3);
    list.innerHTML = shown.map((r) => `<li><b>${esc(symptomOf(r.keia_atlas?.symptom).label)}</b>, reported here at ${esc(hm(r.opened))} <span class="g-ref">${esc(r.number)}</span>. The local team has it.</li>`).join('');
    box.hidden = !box.querySelector('[data-guide-known-static] li') && !shown.length;
  };
  draw();
  onChange(draw);
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
  for (const el of D.querySelectorAll('[data-guide-room]:not([data-gm])')) { el.dataset.gm = '1'; mountGuide(el); }
  for (const el of D.querySelectorAll('[data-guide-form]:not([data-gm])')) { el.dataset.gm = '1'; mountForm(el); }
  for (const el of D.querySelectorAll('[data-guide-host]:not([data-gm])')) { el.dataset.gm = '1'; HOSTS[el.dataset.guideHost]?.(el); }
}
