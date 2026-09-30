// The work plan: a record of every device by install year, back to 2000, and which installed devices
// are due for replacement in which year, with the engineering hours to do it.
//
// Years in service always come from each unit's own install date (to today, or to the day it was taken
// out), never from a class average. The house policy only says when a device is due: install year plus
// the class's years in service. Hours come from the policy's per-task estimates: deploy tasks for the
// new unit, retire tasks for the old one. Tasks marked networked_only apply to classes with a network address.
import path from 'node:path';
import { loadYaml } from './demo-clock.mjs';
import { spaces, sites, classes, models, SITE_ORDER, DEMO_TODAY, className, modelName } from './data.mjs';

export const policy = loadYaml(path.join(process.cwd(), 'data/refresh-policy/aigna.yaml'));
const YEARS = Object.fromEntries(policy.classes.map((c) => [c.class, c.years]));
export const lifeOf = (cls) => YEARS[cls];
const networked = (cls) => Boolean(classes[cls]?.platforms?.dhcp_dns);

function hoursFor(cls) {
  let low = 0, high = 0;
  for (const t of policy.tasks) {
    if (t.networked_only && !networked(cls)) continue;
    low += t.low; high += t.high;
  }
  return { low, high };
}
export const HOURS = Object.fromEntries(policy.classes.map((c) => [c.class, hoursFor(c.class)]));

const { from, to } = policy.horizon;
export const historyFrom = policy.horizon.history_from ?? from;
export const NOW_YEAR = +DEMO_TODAY.slice(0, 4);
const MS_YEAR = 365.25 * 24 * 3600 * 1000;
export const yearsBetween = (a, b) => Math.max(0, (new Date(b) - new Date(a)) / MS_YEAR);
export const fmtYears = (n) => (n < 1 ? 'under a year' : `${n.toFixed(1)} years`);

// Every physical unit we know of: in service, being replaced, or taken out.
export const records = [];
for (const s of Object.values(spaces)) {
  for (const p of [...s.positions, ...s.olderKit, ...s.retiredKit]) {
    if (!p.cls) continue;
    for (const u of p.units) {
      const dated = Boolean(u.installed);
      const installedYear = dated ? +u.installed.slice(0, 4) : from;
      const retired = u.retired ?? null;
      const gone = Boolean(retired);
      // The outgoing unit of a replacement in progress is still in the room until it is taken out.
      const current = u === p.current;
      const retiring = !gone && !current;
      const life = YEARS[p.cls];
      records.push({
        space: s, position: p, unit: u, cls: p.cls, model: u.model ?? p.model ?? null, dated, older: Boolean(p.older),
        installed: u.installed ?? null, installedYear, retired, retiredYear: gone ? +retired.slice(0, 4) : null,
        current, status: gone ? 'retired' : retiring ? 'retiring' : 'in-service',
        life, due: installedYear + life,
        // From this unit's own install date, to today or the day it came out.
        yearsIn: dated ? yearsBetween(u.installed, gone ? retired : DEMO_TODAY) : 0,
      });
    }
  }
}

// The replacement list: units in service and not already being swapped.
export const dueList = records.filter((r) => r.current)
  .sort((a, b) => a.due - b.due || b.yearsIn - a.yearsIn);

export const buckets = [];
for (let y = from; y <= to; y++) buckets.push({ year: y, label: y === from ? `Due now` : String(y), sub: y === from ? `${from} or earlier` : '' });
buckets.push({ year: Infinity, label: 'Later', sub: `After ${to}` });
for (const b of buckets) Object.assign(b, { units: [], low: 0, high: 0, bySite: {}, byClass: {}, byModel: {}, spaces: new Set() });

for (const r of dueList) {
  const { space: s, position: p } = r;
  const b = buckets.find((x) => (r.due <= from ? x.year === from : x.year === r.due)) ?? buckets[buckets.length - 1];
  const h = HOURS[p.cls];
  b.units.push({ space: s, position: p, due: r.due, installedYear: r.installedYear, rec: r });
  b.low += h.low; b.high += h.high;
  b.bySite[s.site] = (b.bySite[s.site] ?? 0) + 1;
  b.byClass[p.cls] = (b.byClass[p.cls] ?? 0) + 1;
  if (p.model) b.byModel[p.model] = (b.byModel[p.model] ?? 0) + 1;
  b.spaces.add(s.id);
}
export const siteOrder = SITE_ORDER.filter((id) => sites[id]);
export const maxCount = Math.max(...buckets.map((b) => b.units.length));
export const fmtHours = (n) => n.toLocaleString('en-IE', { maximumFractionDigits: 1 });

// Year by year, from the first year of the record to the last plan year.
export const timeline = [];
for (let y = historyFrom; y <= to; y++) {
  const installed = records.filter((r) => r.dated && r.installedYear === y);
  const takenOut = records.filter((r) => r.retiredYear === y);
  const inService = y <= NOW_YEAR ? records.filter((r) => r.dated && r.installedYear <= y && (r.retiredYear === null || r.retiredYear > y)).length : null;
  const b = buckets.find((x) => x.year === y);
  const due = b ? b.units.map((u) => u.rec) : [];
  timeline.push({
    year: y, future: y > NOW_YEAR, current: y === NOW_YEAR, installed, takenOut, inService, due, bucket: b ?? null,
    stillIn: installed.filter((r) => r.status !== 'retired').length, gone: installed.filter((r) => r.status === 'retired').length,
  });
}

// Group a list of records by model for the year panels.
export function byModelRows(list) {
  const m = new Map();
  for (const r of list) {
    const key = r.model ?? `class:${r.cls}`;
    const row = m.get(key) ?? { model: r.model, cls: r.cls, n: 0, sites: new Set(), minYears: Infinity, maxYears: 0, rooms: new Set() };
    row.n++; row.sites.add(r.space.site); row.rooms.add(r.space.id);
    row.minYears = Math.min(row.minYears, r.yearsIn); row.maxYears = Math.max(row.maxYears, r.yearsIn);
    m.set(key, row);
  }
  return [...m.values()].sort((a, b) => b.n - a.n);
}
export const rowName = (row) => (row.model ? modelName(row.model) : `${className(row.cls)} (no set model)`);

// Facts about the record as a whole, for the page header.
export const facts = {
  total: records.filter((r) => r.dated).length,
  inService: records.filter((r) => r.dated && r.status !== 'retired').length,
  retired: records.filter((r) => r.status === 'retired').length,
  olderThanPolicy: dueList.filter((r) => r.dated && r.due <= NOW_YEAR).length,
  oldest: dueList.filter((r) => r.dated).sort((a, b) => b.yearsIn - a.yearsIn)[0] ?? null,
};
export const anyModel = (id) => models[id];
