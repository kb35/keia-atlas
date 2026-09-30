// The record timeline's rows (design notes): newest first, grouped by day, each entry a time, a glyph or verb mark, who,
// what and where it came from. Automatic entries end with "How was this done?". Pure (no DOM): Timeline.astro draws
// the rows on the server and src/lib/rules-client.mjs adds live ones in the browser with the same function.
//
// An entry: { id?, at, kind, who, what, src?, state?, icon?, how?, href?, sub?, mark? }
//   at     zoneless local time ("2026-09-28T07:52") or an ISO time with a zone (a live change)
//   kind   person | rule | connector | change (the filter it belongs to)
//   state  a health state for the node's glyph (fine, fault, progress, review...); else the kind's mark
//   how    the "How was this done?" trigger's HTML (howTrigger() in src/lib/howcard.mjs)
import { glyph } from './health.mjs';

export const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'person', label: 'People' },
  { id: 'rule', label: 'Rules' },
  { id: 'connector', label: 'Connectors' },
  { id: 'change', label: 'Changes' },
];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pad = (n) => String(n).padStart(2, '0');
// The kinds' own marks, drawn on a 16 unit box in currentColor.
const MARK = {
  person: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="5.5" r="2.6"/><path d="M3 14c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3"/></svg>',
  rule: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.6"/><path d="M13 2.8v2.6h-2.6"/></svg>',
  connector: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3v3M10 3v3M4.5 6h7v2.5a3.5 3.5 0 0 1-7 0zM8 12v2"/></svg>',
  change: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 11.5 11 3.5l1.5 1.5-8 8H3z"/></svg>',
};

/** Split a time into its day and its clock, in the viewer's clock when it carries a zone. */
export function parts(at) {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(at)) {
    const d = new Date(at);
    return { day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hm: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  const [day, hm = ''] = String(at).split('T');
  return { day, hm: hm.slice(0, 5) };
}
/** "Today, 28 Sept" or "27 Sept 2026" for a day's label. */
export function dayLabel(day, today) {
  const [y, m, d] = day.split('-');
  const words = `${+d} ${MON[+m - 1]}`;
  if (day === today) return `Today, ${words}`;
  return y === String(today).slice(0, 4) ? words : `${words} ${y}`;
}

/** One row. */
export function rowHtml(e) {
  const { hm } = parts(e.at);
  const node = e.state ? glyph(e.state, { size: 16, title: e.stateWords ?? '' }) : `<span class="tl-mk tl-mk-${esc(e.kind)}">${MARK[e.kind] ?? MARK.change}</span>`;
  const what = e.href ? `<a href="${esc(e.href)}">${esc(e.what)}</a>` : esc(e.what);
  const src = e.src ? `<span class="tl-src">${esc(e.src)}</span>` : '';
  const sub = e.sub ? `<span class="tl-sub">${esc(e.sub)}</span>` : '';
  return `<li class="tl-row" data-tl-kind="${esc(e.kind)}" data-tl-day="${esc(parts(e.at).day)}"${e.id ? ` data-tl-id="${esc(e.id)}"` : ''}>`
    + `<time class="tl-t" datetime="${esc(e.at)}">${esc(hm)}</time>`
    + `<span class="tl-n">${node}</span>`
    + `<div class="tl-b"><p class="tl-w"><span class="tl-who">${esc(e.who)}</span> ${what}${e.how ? ` <span class="tl-how">· ${e.how}</span>` : ''}</p>${sub || src ? `<p class="tl-m">${sub}${src}</p>` : ''}</div>`
    + '</li>';
}
/** A day's label row. */
export const dayHtml = (day, today) => `<li class="tl-day" data-tl-day-label="${esc(day)}"><span>${esc(dayLabel(day, today))}</span></li>`;

/** Every row, newest first, with a day label before each day's first row. */
export function listHtml(entries, today) {
  const sorted = [...entries].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  let last = null, out = '';
  for (const e of sorted) {
    const { day } = parts(e.at);
    if (day !== last) { out += dayHtml(day, today); last = day; }
    out += rowHtml(e);
  }
  return out;
}
const sortKey = (e) => { const p = parts(e.at); return `${p.day}T${p.hm}${e.order != null ? pad(e.order) : ''}`; };
