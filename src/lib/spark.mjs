// Sparklines (UI-V2 §8.2): the last 30 days (or 12 months, or the last 12 runs) of one figure as a small line, 64 by
// 16 px, drawn in --quiet with no axes and no numbers. The last point gets a 3 px dot in the state's fill only when the
// figure is not fine. The tooltip gives the lowest, the highest and the latest. Drawn still and redrawn when the figure
// changes (MOTION-V2 §5: sparklines never move).
//
// Pure: no DOM. FigureTile.astro and KeyNumbers.astro draw on the server with sparkSvg(); page scripts redraw with it.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r1 = (n) => Math.round(n * 10) / 10;

/** The points of a sparkline in a w by h box, `pad` px in from each edge. A flat series sits in the middle. */
export function sparkPoints(values, { w = 64, h = 16, pad = 2 } = {}) {
  const v = (values ?? []).filter((x) => Number.isFinite(x));
  if (!v.length) return { pts: [], min: null, max: null };
  const min = Math.min(...v), max = Math.max(...v), span = max - min;
  const step = v.length > 1 ? (w - pad * 2) / (v.length - 1) : 0;
  const pts = v.map((x, i) => [r1(pad + i * step), r1(span ? h - pad - ((x - min) / span) * (h - pad * 2) : h / 2)]);
  return { pts, min, max };
}

/** The line as an SVG path. */
export const sparkPath = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join('');

/** The tooltip words: "30 days: lowest 91%, highest 99%, latest 97%". `fmt` writes one value. */
export function sparkWords(values, { fmt = (x) => String(x), span = '30 days' } = {}) {
  const v = (values ?? []).filter((x) => Number.isFinite(x));
  if (!v.length) return '';
  return `${span}: lowest ${fmt(Math.min(...v))}, highest ${fmt(Math.max(...v))}, latest ${fmt(v[v.length - 1])}`;
}

/** A whole sparkline as SVG. `state` is the figure's health (fine, review, fault); the last point is marked only when
    it is not fine. `label` is read out instead of the picture. */
export function sparkSvg(values, { w = 64, h = 16, state = 'fine', label = '', fmt, span } = {}) {
  const { pts } = sparkPoints(values, { w, h });
  if (!pts.length) return '';
  const words = label || sparkWords(values, { fmt, span });
  const last = pts[pts.length - 1];
  const dot = state && state !== 'fine' ? `<circle class="spk-dot" data-state="${esc(state)}" cx="${last[0]}" cy="${last[1]}" r="1.5"/>` : '';
  return `<svg class="spk" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(words)}"><title>${esc(words)}</title><path d="${sparkPath(pts)}"/>${dot}</svg>`;
}
