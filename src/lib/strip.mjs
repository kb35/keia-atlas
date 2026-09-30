// A trend strip as markup: a small row of bars, one per period (a month, a week). The svg is a data-chart, so the
// motion library draws it in once, the first time it is seen (km-draw-in, src/lib/motion-wire.js), and it is then still.
// Shared by TrendStrip.astro and pages that draw their markup in a script (the unit page gets it ready-made in its data). Styles: src/styles/arrive.css (.ts).
//   bars   [{ label, n }] oldest first
//   label  what the strip shows, for people who cannot see it
//   tone   'fault' or 'warn' tints the bars; otherwise the quiet ink
//   mark   the index of a bar drawn in full ink (the current period)
//   ends   true: the first and last labels under the strip
//   step   px a bar (the strip is drawn at its own size, never stretched); height px

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function trendStrip({ bars, label, tone = 'quiet', height = 28, ends = false, mark = -1, step = 14 }) {
  const max = Math.max(1, ...bars.map((b) => b.n));
  const W = step, H = height, w = bars.length * W;
  const said = `${label}: ${bars.map((b) => `${b.label} ${b.n}`).join(', ')}`;
  const lines = bars.map((b, i) => (b.n > 0
    ? `<line class="ts-bar${i === mark ? ' is-mark' : ''}" style="--k:${i}" pathLength="1" x1="${i * W + W / 2}" x2="${i * W + W / 2}" y1="${H - 1}" y2="${(H - 1 - Math.max(3, ((H - 4) * b.n) / max)).toFixed(1)}"/>`
    : '')).join('');
  const cap = ends && bars.length > 1 ? `<figcaption class="ts-ends"><span>${esc(bars[0].label)}</span><span>${esc(bars[bars.length - 1].label)}</span></figcaption>` : '';
  return `<figure class="ts ts-${tone}"><svg data-chart viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="${esc(said)}"><title>${esc(said)}</title><line class="ts-base" x1="0" x2="${w}" y1="${H - 0.5}" y2="${H - 0.5}"/>${lines}</svg>${cap}</figure>`;
}
