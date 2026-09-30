// The handover card (UI-V2 §8.10, UX-V2 §4.3 and §4.4): one fixed card for three moments, so a person learns it once.
//
//   park      three lines when you stop part way: Where I stopped, Next step, Open question. Written in a minute;
//             no line is required. Shown read-only on the job's row and above its timeline until Resume.
//   cover     Hand over for cover, before time away: Open, Fragile, Who owns what, What changed recently.
//   welcome   Welcome back: the same four places, filled by the record while you were away: Yours now, Handled,
//             Changed, Refreshers.
//
// Pure HTML builders, used by HandoverCard.astro on the server and by pages that draw in the browser.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const PARK_LINES = [
  { id: 'where', label: 'Where I stopped', hint: 'Patched ports 1 to 8' },
  { id: 'next', label: 'Next step', hint: 'Move 9 to 12, then check PoE' },
  { id: 'question', label: 'Open question', hint: 'Is port 11 the booking panel?' },
];

export const SLOTS = {
  cover: [
    { id: 'open', label: 'Open', empty: 'Nothing open' },
    { id: 'fragile', label: 'Fragile', empty: 'Nothing likely to break' },
    { id: 'owns', label: 'Who owns what', empty: 'Everything stays with its owner' },
    { id: 'changed', label: 'What changed recently', empty: 'Nothing changed recently' },
  ],
  welcome: [
    { id: 'open', label: 'Yours now', empty: 'Nothing waiting for you' },
    { id: 'handled', label: 'Handled while you were away', empty: 'Nothing closed while you were away' },
    { id: 'changed', label: 'Changed on your projects', empty: 'Nothing changed on your projects' },
    { id: 'refresh', label: 'Refreshers', empty: 'Nothing you have not done in the last 90 days' },
  ],
};

/** The park card, read-only: the three lines that were written, in the fixed order. */
export function parkRead(card, { when = '', compact = false } = {}) {
  const lines = PARK_LINES.filter((l) => card?.[l.id]);
  if (!lines.length) return `<div class="ho-park ho-park-empty" data-help="handover.park">Parked${when ? ` at ${esc(when)}` : ''}, no notes left.</div>`;
  return `<dl class="ho-park${compact ? ' ho-compact' : ''}" data-help="handover.park">${lines.map((l) => `<div class="ho-l"><dt>${esc(l.label)}</dt><dd>${esc(card[l.id])}</dd></div>`).join('')}</dl>`;
}

/** The park card to fill in: three single lines, Save and Cancel. `id` keeps label ids unique on the page. */
export function parkEdit(card = {}, { id = 'park' } = {}) {
  return `<form class="ho-park-edit" data-park-form data-help="handover.park-edit">
    ${PARK_LINES.map((l) => `<label class="ho-f" for="${esc(id)}-${l.id}"><span>${esc(l.label)}</span><input id="${esc(id)}-${l.id}" name="${l.id}" type="text" autocomplete="off" maxlength="140" placeholder="${esc(l.hint)}" value="${esc(card[l.id] ?? '')}"></label>`).join('')}
    <div class="ho-act"><button type="submit" class="btn primary small" data-verb-go="park">Park</button><button type="button" class="btn ghost small" data-cancel>Cancel</button><span class="ho-note faint">Every line is optional. It shows on the job until you resume.</span></div>
  </form>`;
}

/** One line in a four-place card: an optional glyph (HTML), a title (a link when `to`), a second line and a note. */
function lineHtml(l) {
  const title = l.to ? `<a href="${esc(l.to)}">${esc(l.title)}</a>` : `<span>${esc(l.title)}</span>`;
  return `<li class="ho-i">${l.glyph ?? ''}<span class="ho-b"><b>${title}</b>${l.sub ? `<small>${esc(l.sub)}</small>` : ''}${l.park ? parkRead(l.park, { compact: true }) : ''}${l.note ? `<small class="ho-n">${esc(l.note)}</small>` : ''}</span>${l.chip ?? ''}</li>`;
}

/** The four-place card body: `data` maps each slot id to { lines: [...], free?: 'one free line' }. */
export function slotsHtml(variant, data = {}) {
  return (SLOTS[variant] ?? SLOTS.cover).map((s, i) => {
    const d = data[s.id] ?? {}, lines = d.lines ?? [];
    return `<section class="ho-slot" data-slot="${s.id}" style="--i:${i}" aria-labelledby="ho-${variant}-${s.id}">
      <h3 class="ho-sh" id="ho-${variant}-${s.id}"><span>${esc(s.label)}</span><span class="ho-n0">${lines.length || ''}</span></h3>
      ${lines.length ? `<ul class="ho-list">${lines.map(lineHtml).join('')}</ul>` : `<p class="ho-empty">${esc(s.empty)}.</p>`}
      ${d.free ? `<p class="ho-free">${esc(d.free)}</p>` : ''}
    </section>`;
  }).join('');
}
