// "How was this done?" (design notes): the card's markup, from howCard() in src/lib/rules.mjs. Pure (no
// DOM), so HowCard.astro draws it on the server and src/lib/rules-client.mjs draws a new run's card in the browser
// with the same function. The card itself (open, close, the motion) is HowCard.astro's.
//
// The trigger is the words themselves: a button that reads "How was this done?", carrying the card as a template.
// The card is one fixed order of rows, plain words, no percentage; "What it did not check" is never empty; only the
// verb the rule declared appears; the full trace is one link away in the audit log.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The card's body (the part inside the shared card), as HTML. `log` is the audit log page's address. */
export function howBody(card, { log = '/support/log/' } = {}) {
  const rows = card.rows.map((r) => `<div class="how-r"><dt>${esc(r.k)}</dt><dd>${esc(r.v)}</dd></div>`).join('');
  const ai = card.ai ? `<p class="how-ai">${esc(card.ai)}</p>` : '';
  const acts = card.actions.map((a) => `<button type="button" class="btn small${a.kind === 'again' ? ' primary' : ''}" data-how-act="${esc(a.kind)}" data-how-run="${esc(card.id)}" data-how-rule="${esc(card.rule)}"${a.kind === 'again' ? ' data-verb="run-rule"' : ''} title="${esc(a.words)}">${esc(a.verb)}</button>`).join('');
  const again = card.againFor ? `<span class="how-who">${esc(card.againFor)}</span>` : '';
  return `<header class="how-h"><p class="how-t">${esc(card.title)}</p><p class="how-m">${esc(card.meta)}</p></header>`
    + `<dl class="how-dl">${rows}</dl>${ai}`
    + `<footer class="how-f">${acts}${again}<a class="how-log" href="${esc(log)}${esc(card.trace)}">Open the full trace in the log</a></footer>`;
}

/** The trigger: the words that open the card, with the card inside as a template. */
export function howTrigger(card, { log, label = 'How was this done?', cls = '' } = {}) {
  return `<button type="button" class="how-link${cls ? ` ${esc(cls)}` : ''}" data-how="${esc(card.id)}" data-help="how.open" aria-haspopup="dialog" aria-expanded="false">${esc(label)}<template data-how-body>${howBody(card, { log })}</template></button>`;
}
