// The refresh decision the front door shows twice (Plan it, Maintain it): units whose maker stops fixing security
// holes before the refresh policy would replace them. Read from the record at build time: every unit in service
// (src/lib/refresh.mjs), its model's security support (src/lib/security.mjs), and what a unit of its class costs to
// buy and fit (src/lib/planning.mjs). Nothing here is typed in: change a model's support date and the figures follow.
import { dueList } from './refresh.mjs';
import { YEARS, NOW_FY, ctx, kmoney, totals, baseline, scenarios } from './planning.mjs';
import { unitEur, fyOfDue } from './planningcore.mjs';
import { models, DEMO_TODAY, modelName, sites } from './data.mjs';
import { supportStatus, monthLabel } from './security.mjs';

/** Next financial year: the plan a decision made this autumn lands in. */
export const NEXT = YEARS.find((y) => y.next) ?? YEARS[1];

// Units in service whose security support ends within a year (or has ended), and whose refresh date by the policy
// falls after next year's plan: the ones a person would bring forward.
const byModel = new Map();
for (const r of dueList) {
  const m = r.model ? models[r.model] : null;
  if (!m?.security_support?.ends?.date) continue;
  const st = supportStatus(m.security_support, DEMO_TODAY);
  if (st.state !== 'soon' && st.state !== 'ended') continue;
  if (fyOfDue(r.due, NOW_FY) <= NEXT.n) continue;
  const row = byModel.get(r.model) ?? { id: r.model, name: modelName(r.model), cls: r.cls, n: 0, sites: new Set(), when: monthLabel(m.security_support.ends.date), ended: st.state === 'ended', eur: 0 };
  row.n++; row.sites.add(r.space.site); row.eur += unitEur(r.cls, ctx);
  byModel.set(r.model, row);
}
export const ENDING = [...byModel.values()].sort((a, b) => b.n - a.n || a.when.localeCompare(b.when))
  .map((r) => ({ ...r, sites: [...r.sites], offices: [...r.sites].map((s) => sites[s]?.city ?? sites[s]?.name ?? s), eur: Math.round(r.eur) }));
export const ADD = { units: ENDING.reduce((n, r) => n + r.n, 0), eur: ENDING.reduce((n, r) => n + r.eur, 0), models: ENDING.length };

/** One column per plan year: what is committed, what the policy plans, the envelope if one is set. */
export const COLUMNS = YEARS.map((y) => {
  const t = totals[y.id], env = baseline.find((b) => b.id === y.id)?.envelope ?? null;
  return { id: y.id, n: y.n, label: y.label, span: y.span, committed: Math.round(t.spend.committed), planned: Math.round(t.spend.planned), spend: Math.round(t.spend.total), units: t.units, rooms: t.rooms, projects: t.projects, envelope: env ? Math.round(env.eur) : null, envelopeStatus: env?.status ?? null, envelopeNote: env?.note ?? '' };
});

/** The scenarios on record worth trying on the front door: the ones that move money in the next few years. */
export const SCENARIOS = scenarios.filter((s) => ['cut-15', 'video-bars-early', 'network-later'].includes(s.id)).map((s) => ({
  id: s.id, name: s.name, say: s.say, effect: s.effect,
  years: s.rows.map((r) => ({ id: r.id, committed: Math.round(r.sc.spend.committed), planned: Math.round(r.sc.spend.planned), spend: Math.round(r.sc.spend.total), units: r.sc.units })),
}));

export { kmoney };
