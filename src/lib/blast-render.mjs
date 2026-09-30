// The blast-radius explorer's moving parts, as HTML strings: the page draws them once on the server and
// BlastRadius.astro's script redraws them in the browser from the same functions, when a port, the target or the
// time handle changes. No data is loaded here (the explorer's data comes from src/lib/blast-view.mjs as JSON).
import { glyph } from './health.mjs';
import { countLine } from './blast-words.mjs';

export const SERVICE_NAME = { av: 'AV', network: 'Network', infrastructure: 'IT infrastructure' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "14:00" today or "09:30 tomorrow", for `min` minutes after `now` (zoneless local time). */
export function clock(now, min) {
  const [h, m] = String(now).slice(11, 16).split(':').map(Number);
  const t = h * 60 + m + min;
  const hm = `${pad(Math.floor((t % 1440) / 60))}:${pad(t % 60)}`;
  return t >= 1440 ? `${hm} tomorrow` : hm;
}

/** The window the meetings are counted in: { from, to } in minutes after `now`. A device is off from the handle to
    the end of the 24 hours; a change is off for its own window, starting at the handle. */
export const windowOf = (win, from) => ({ from, to: win.len ? Math.min(win.hours * 60, from + win.len) : win.hours * 60 });

/** What the explorer shows for the chosen ports (null: the whole thing off) and window. */
export function stateOf(ex, ports, w) {
  let sp, ap;
  if (!ex.ports || !ports) { sp = ex.whole.sp; ap = ex.whole.ap; }
  else {
    const s = new Set(), a = new Set();
    for (const p of ex.ports) if (ports.has(p.p)) { p.sp.forEach((i) => s.add(i)); p.ap.forEach((x) => a.add(x)); }
    sp = [...s].sort((x, y) => x - y); ap = [...a];
  }
  const meetings = [];
  for (const i of sp) for (const m of ex.spaces[i].meet) if (m[0] < w.to && m[0] + m[1] > w.from) meetings.push({ s: m[0], d: m[1], p: m[2], i });
  meetings.sort((a, b) => a.s - b.s || a.i - b.i);
  const services = new Set();
  if (ex.net !== false && (sp.length || ap.length)) services.add('network');
  for (const i of sp) for (const s of ex.spaces[i].sv) services.add(s);
  const people = meetings.reduce((n, m) => n + m.p, 0);
  return { sp, ap, meetings, people, services: ['av', 'network', 'infrastructure'].filter((s) => services.has(s)) };
}

/** The words for the window: "in the next 24 hours", "from 15:00 on", "during its window, 19:00 to 21:00". */
export function whenWords(win, w, now) {
  if (win.len) return `${w.from === win.start ? 'during its window' : 'while it is off'}, ${clock(now, w.from)} to ${clock(now, w.to)}`;
  return w.from === 0 ? `in the next ${win.hours} hours` : `from ${clock(now, w.from)} on`;
}

export function lineOf(ex, st, win, w, now) {
  return countLine({ spaces: st.sp.length, meetings: st.meetings.length, people: st.people, services: st.services.length, aps: st.ap.length }, { when: whenWords(win, w, now), carried: ex.carried });
}

/** The four figures: spaces, meetings, people, services. */
export function figuresHtml(st) {
  const f = (n, one, many) => `<div class="br-fig"><b>${n}</b><span>${n === 1 ? one : many}</span></div>`;
  return f(st.sp.length, 'Space', 'Spaces') + f(st.meetings.length, 'Meeting', 'Meetings') + f(st.people, 'Person in them', 'People in them') + f(st.services.length, 'Service', 'Services');
}

/** The meetings it would hit, in time order: when, where, and a count of people (never names, UX-V2 §7.5). */
export const SHOW = { meetings: 6, spaces: 12 };
const more = (n, what) => `<li class="br-more"><button type="button" class="btn small ghost" data-br-more="${what}">Show all ${n}</button></li>`;
export function meetingsHtml(ex, st, now, base = '', all = false) {
  if (!st.meetings.length) return '<li class="br-none">No meetings booked in these spaces in this window.</li>';
  const cut = !all && st.meetings.length > SHOW.meetings + 1;
  return (cut ? st.meetings.slice(0, SHOW.meetings) : st.meetings).map((m) => {
    const s = ex.spaces[m.i];
    return `<li><span class="br-t mono">${esc(clock(now, m.s))}</span><a href="${esc(base + s.to)}">${esc(s.label)}</a><span class="br-p">${plural(m.p, 'person', 'people')} · ${m.d} min</span></li>`;
  }).join('') + (cut ? more(st.meetings.length, 'meetings') : '');
}

/** The services named, each linking to its page. */
export function servicesHtml(st, base = '') {
  if (!st.services.length) return '<span class="faint">None</span>';
  return st.services.map((s) => `<a class="br-svc" href="${esc(`${base}/services/${s}/`)}">${esc(SERVICE_NAME[s])}</a>`).join('');
}

/** Every space it would cut off, each with its projection glyph, its floor and what is in it. */
export function spacesHtml(ex, st, base = '', all = false) {
  if (!st.sp.length && !st.ap.length) return '';
  const cut = !all && st.sp.length > SHOW.spaces + 1;
  const rows = (cut ? st.sp.slice(0, SHOW.spaces) : st.sp).map((i) => {
    const s = ex.spaces[i];
    const what = [s.desks ? plural(s.desks, 'desk') : null, s.units ? plural(s.units, 'unit') : null, s.meet.length ? plural(s.meet.length, 'booking') : null].filter(Boolean).join(' · ');
    return `<li><span class="br-lg">${glyph('fault', { size: 12, title: 'Would be affected' })}</span><span class="br-sn"><a href="${esc(base + s.to)}">${esc(s.label)}</a><small>${esc(ex.site ? '' : `${s.site?.toUpperCase()} · `)}${esc(floorWord(s.floor))}${what ? ` · ${esc(what)}` : ''}</small></span></li>`;
  });
  if (st.ap.length) rows.push(`<li><span class="br-lg">${glyph('fault', { size: 12, title: 'Would be affected' })}</span><span class="br-sn"><b>Wi-Fi in the open areas</b><small>${plural(st.ap.length, 'access point')}</small></span></li>`);
  return rows.join('') + (cut ? more(st.sp.length, 'spaces') : '');
}
const floorWord = (f) => (f == null ? '' : /^\d+$/.test(String(f)) ? `Floor ${f}` : String(f));
