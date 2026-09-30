// The health glyph set (design notes): one family of rings, where the shape carries the state, a word sits beside it
// and colour only reinforces. HealthGlyph.astro renders these on the server; scripts that draw rows in the
// browser call glyph() for the same markup, and setGlyph() to change a glyph's state in place.
//
// States, their word on screen, and the shape:
//   fine      Fine            closed ring
//   review    To review       ring with one notch at 1 o'clock
//   fault     Fault           ring broken top and bottom, with a centre dot
//   stale     Not reporting   ring of 8 dashes (fault colour)
//   progress  In progress     three-quarter arc, open from 12 to 3 o'clock
//   planned   Planned         thin ring
//   off       Off             thin ring with a slash from 10 to 4 o'clock
//
// Colour comes from the --h-<state> tokens in every look (src/styles/looks/*.css; stale uses the fault colour).
// `quiet` draws Fine in --quiet: the dark cockpit rule for Home, region and office pages (nothing fine is coloured).
// Styles live in src/styles/base.css (.hg) and motion.css (M8: comes on once, in turn; never pulses).

export const STATES = ['fine', 'review', 'fault', 'stale', 'progress', 'planned', 'off'];
export const WORD = { fine: 'Fine', review: 'To review', fault: 'Fault', stale: 'Not reporting', progress: 'In progress', planned: 'Planned', off: 'Off' };
export const SIZES = [12, 16, 24, 40];

// The older light states and tones used across the data and pages, mapped to the six health states.
const LEGACY = {
  ok: 'fine', good: 'fine', done: 'fine', healthy: 'fine', live: 'fine', green: 'fine', safe: 'fine',
  warn: 'review', warning: 'review', amber: 'review', attention: 'review', review: 'review', blocked: 'review', exposed: 'review',
  bad: 'fault', red: 'fault', down: 'fault', problem: 'fault', alert: 'fault',
  stale: 'stale', silent: 'stale',
  info: 'progress', doing: 'progress', deploy: 'progress', installing: 'progress', blue: 'progress', use: 'progress',
  plan: 'planned', todo: 'planned', proposed: 'planned', violet: 'planned', order: 'planned',
  idle: 'off', unknown: 'off', grey: 'off', none: 'off', closed: 'off', retired: 'off',
};
/** One of the seven states for any state word the site already uses ('ok', 'warn', 'bad', 'off', 'good'...). */
export const stateOf = (s) => (STATES.includes(s) ? s : LEGACY[String(s ?? '').toLowerCase()] ?? 'off');

// The km-ring (the motion library, motion 3): every state is the same circle with a dash pattern set by the
// state (src/styles/motion-library.css), plus the fault's dot and the off slash, so a state change eases in place
// instead of swapping shapes. data-s names the state in the markup; the pattern comes from .hg[data-state].
const RING = (s) => `<circle class="hg-s hg-ring" data-s="${s}" pathLength="1" cx="8" cy="8" r="6"/><circle class="hg-dot" cx="8" cy="8" r="1.5"/><line class="hg-s hg-thin hg-slash" pathLength="1" x1="2.804" y1="5" x2="13.196" y2="11"/>`;
const SHAPE = Object.fromEntries(['fine', 'review', 'fault', 'stale', 'progress', 'planned', 'off'].map((s) => [s, RING(s)]));

/** A count of what is not fine, in the site's words: "1 fault", "2 to review", "1 fault · 2 to review", or "All fine". */
export const tally = (fault = 0, review = 0) => (fault || review
  ? [fault && `${fault} fault${fault === 1 ? '' : 's'}`, review && `${review} to review`].filter(Boolean).join(' · ')
  : 'All fine');

/** The inner SVG shapes for a state (the 16 unit box). */
export const shape = (state) => SHAPE[stateOf(state)];

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The attributes and parts of one glyph, shared by the Astro part and glyph(). */
export function glyphParts(state, { size = 16, word = false, quiet = false, title = '', label = '', lit = false } = {}) {
  const s = stateOf(state);
  const px = SIZES.includes(+size) ? +size : 16;
  const text = typeof word === 'string' ? word : WORD[s];
  const aria = label || (title ? `${WORD[s]}: ${title}` : text);
  const cls = ['hg', quiet && 'hg-quiet', lit && 'lit'].filter(Boolean).join(' ');
  return { s, px, text, aria, cls, showWord: !!word };
}

/** A glyph as an HTML string, for scripts that draw in the browser. Lit at once (it arrives after the page's M8). */
export function glyph(state, opts = {}) {
  const g = glyphParts(state, { lit: true, ...opts });
  const svg = `<svg viewBox="0 0 16 16" width="${g.px}" height="${g.px}" style="--hg-px:${g.px}" aria-hidden="true" focusable="false">${SHAPE[g.s]}</svg>`;
  const t = opts.title ? ` title="${esc(opts.title)}"` : '';
  return g.showWord
    ? `<span class="${g.cls}" data-state="${g.s}" data-size="${g.px}"${t}>${svg}<span class="hg-w">${esc(g.text)}</span></span>`
    : `<span class="${g.cls}" data-state="${g.s}" data-size="${g.px}" role="img" aria-label="${esc(g.aria)}"${t}>${svg}</span>`;
}

/** Change a glyph's state in place (the state move, --dur-state; never a pulse). Keeps its size, word and quiet. */
export function setGlyph(el, state, { title, word } = {}) {
  if (!el) return;
  const s = stateOf(state);
  if (el.dataset.state !== s) {
    el.dataset.state = s;
    const ring = el.querySelector('.hg-ring');
    if (ring) ring.setAttribute('data-s', s); else { const svg = el.querySelector('svg'); if (svg) svg.innerHTML = SHAPE[s]; }
  }
  const w = el.querySelector('.hg-w');
  if (w) w.textContent = typeof word === 'string' ? word : WORD[s];
  if (title !== undefined) el.title = title;
  if (el.getAttribute('role') === 'img') el.setAttribute('aria-label', title ? `${WORD[s]}: ${title}` : WORD[s]);
}
