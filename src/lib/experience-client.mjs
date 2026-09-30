// The experience tiles on a service page follow the Region and Office filters (BUILD-PLAN V7 H1): the page carries each
// office's 30-day series (src/lib/experience.mjs, simulated), and this re-weights them by spaces for the offices the
// filter bar shows. The figure changes in place and the sparkline is redrawn (M9); nothing moves.
import { fmtMeasure, withinTarget } from './experience.mjs';
import { sparkSvg } from './spark.mjs';
import { glyph } from './health.mjs';

const FMT = {
  '%': (x) => `${x >= 99 ? x.toFixed(2) : Math.round(x)}%`,
  min: (x) => { const t = Math.round(x), h = Math.floor(t / 60), m = t % 60; return h ? `${h} h ${m} min` : `${m} min`; },
  x: (x) => x.toFixed(1),
};

export function initExperience(root) {
  const box = root?.querySelector('[data-exp]');
  const raw = box?.querySelector('[data-exp-model]');
  if (!box || !raw || box.__exp) return;
  box.__exp = true;
  const X = JSON.parse(raw.textContent);
  const bar = root.querySelector('[data-fb]');
  const scope = box.querySelector('[data-exp-scope]');
  function paint() {
    const f = bar?.rsFilter;
    const regions = f ? f.get('region') : [], picked = f ? f.get('site') : [];
    const offices = X.offices.filter((o) => (!regions.length || regions.includes(o.region)) && (!picked.length || picked.includes(o.id)));
    const total = offices.reduce((n, o) => n + o.weight, 0);
    for (const m of X.measures) {
      const tile = box.querySelector(`[data-ft="${m.id}"]`); if (!tile) continue;
      const series = total ? Array.from({ length: 30 }, (_, i) => offices.reduce((n, o) => n + (o.series[m.id][i] * o.weight) / total, 0)) : [];
      const value = series.length ? series.reduce((a, b) => a + b, 0) / series.length : null;
      const ok = value != null && withinTarget(m, value);
      tile.querySelector('[data-ft-n]').textContent = fmtMeasure(m, value);
      const s = tile.querySelector('[data-ft-s]'); if (s) s.innerHTML = sparkSvg(series, { state: ok ? 'fine' : 'review', fmt: FMT[m.unit] });
      let w = tile.querySelector('.ft-w');
      if (!ok && value != null && !w) { w = document.createElement('span'); w.className = 'ft-w'; w.innerHTML = glyph('review', { size: 12, word: 'Past target' }); tile.querySelector('.ft-v').after(w); }
      if ((ok || value == null) && w) w.remove();
    }
    if (scope) {
      const names = picked.length ? offices.map((o) => root.querySelector(`[data-fb-facet="site"] [data-fopt][data-v="${CSS.escape(o.id)}"]`)?.dataset.label).filter(Boolean) : [];
      const where = !offices.length ? 'No office matches the filters' : picked.length && names.length && names.length <= 2 ? names.join(' and ') : offices.length === X.offices.length ? 'Every office' : `${offices.length} of ${X.offices.length} offices`;
      scope.textContent = `${where}, last 30 days · counted per space, never per person`;
    }
  }
  bar?.addEventListener('fb:change', paint);
  if (bar?.rsFilter) paint(); else requestAnimationFrame(paint);
}
