// Planning's rules with no data loaded (like workcore.mjs), so they run in the browser, at build time and in
// tests alike. src/lib/planning.mjs builds the baseline from the data; the Planning page applies scenarios to it
// here, both when the site is built (the scenarios on record) and in the browser (a scenario typed on the page).
//
// A financial year runs July to June and is named by the year it ends in: FY2027 is July 2026 to June 2027.
// A unit due for replacement in calendar year N is planned in FY N (so it is bought by June N); anything overdue
// falls into the current financial year.
//
// The shape of one plan year (the baseline is a list of seven of these):
//   { id: 'fy2028', n: 2028, envelope: { eur, status } | null,
//     committed: { projects: [{ id, name, kind, site, eur, hours: { role: h } }] },      projects in flight
//     planned:   { byOffice: { site: { rooms, classes: { cls: n } } } },                  the work plan, priced by class
//     estimated: { projects: [...], adds: [{ region, rooms, units, staff, kits, offices }] } }   what scenarios add
// The context (ctx) carries what the pricing and the hours need: CLASS (per class: eur to buy, hours per role to
// swap), rate, ratios, estate (rooms, units, staff, kits, offices per region), team (people per role per region),
// hires (headcount changes by year), siteRegion and hoursPerPerson.

export const ROLES = ['tech', 'delivery', 'pm', 'network'];
export const ROLE_LABEL = { tech: 'On-site technicians', delivery: 'Delivery engineers', pm: 'Project managers', network: 'Network engineers' };
export const ROLE_ONE = { tech: 'on-site technician', delivery: 'delivery engineer', pm: 'project manager', network: 'network engineer' };
export const REGIONS = ['amer', 'emea', 'apac'];
export const REGION_NAME = { amer: 'Americas', emea: 'EMEA', apac: 'APAC' };
export const NET_CLASSES = new Set(['network-switch', 'network-gateway', 'wireless-access-point', 'security-device']);
export const groupOf = (cls) => (NET_CLASSES.has(cls) ? 'network' : 'av');
export const GROUP_LABEL = { av: 'AV refresh', network: 'Comms room refresh' };
// What a project's role (roles[].as) counts as in the capacity model.
export const PROJECT_ROLE_TO_ROLE = { pm: 'pm', lead: 'delivery', engineer: 'delivery', technician: 'tech', network: 'network' };

// ---- Financial years ---------------------------------------------------------------------------
export const fyOf = (date) => { const y = +String(date).slice(0, 4), m = +String(date).slice(5, 7); return m >= 7 ? y + 1 : y; };
export const fyId = (n) => `fy${n}`;
export const fyNum = (id) => +String(id).replace(/^fy/, '');
export const fyLabel = (n) => `FY${typeof n === 'string' ? fyNum(n) : n}`;
export const fySpan = (n) => { const y = typeof n === 'string' ? fyNum(n) : n; return `July ${y - 1} to June ${y}`; };
export const fyShort = (n) => { const y = typeof n === 'string' ? fyNum(n) : n; return `Jul ${y - 1} to Jun ${y}`; };
// A calendar due year lands in the financial year of the same number, never before the current one.
export const fyOfDue = (dueYear, nowFy) => Math.max(dueYear, nowFy);

// ---- Pricing -----------------------------------------------------------------------------------
export const roleHours = () => Object.fromEntries(ROLES.map((r) => [r, 0]));
const addHours = (into, h, k = 1) => { for (const r of ROLES) into[r] += (h?.[r] ?? 0) * k; return into; };
export function unitEur(cls, ctx) {
  const c = ctx.CLASS[cls] ?? { eur: 500, hours: {} };
  return c.eur + ROLES.reduce((n, r) => n + (c.hours[r] ?? 0) * ctx.rate, 0);
}
const clone = (x) => JSON.parse(JSON.stringify(x));
export const emptyYear = (n, envelope = null) => ({ id: fyId(n), n, envelope, committed: { projects: [] }, planned: { byOffice: {} }, estimated: { projects: [], adds: [] } });

// The planned work of one office in one year: units, rooms, euros and hours by role.
export function officePlanned(o, ctx) {
  let units = 0, eur = 0; const hours = roleHours();
  for (const [cls, n] of Object.entries(o.classes ?? {})) {
    if (!n) continue;
    units += n; eur += unitEur(cls, ctx) * n;
    addHours(hours, ctx.CLASS[cls]?.hours, n);
  }
  return { units, rooms: o.rooms ?? 0, eur, hours };
}

// Upkeep hours a year for an estate (rooms, units, staff, kits), by role, from the ratio model.
export function bauHours(est, ratios) {
  const out = roleHours();
  for (const r of ROLES) {
    const s = ratios.support[r];
    out[r] = (est.rooms ?? 0) * s.per_room + (est.units ?? 0) * s.per_unit + (est.staff ?? 0) * s.per_staff + (est.kits ?? 0) * s.per_kit;
  }
  return out;
}

// People per role per region in a year: today's team plus the headcount changes up to that year.
export function teamIn(n, ctx, { proposed = true } = {}) {
  const t = {}; for (const g of REGIONS) t[g] = { ...(ctx.team[g] ?? roleHours()) };
  for (const c of ctx.hires ?? []) if (fyNum(c.year) <= n && (proposed || c.status === 'approved')) t[c.region][c.role] = (t[c.region][c.role] ?? 0) + c.add;
  return t;
}

// Everything the page shows for one year: spend by status and kind, work, and hours needed against hours available
// by role and region.
export function yearTotals(y, ctx) {
  const spend = { committed: 0, planned: 0, estimated: 0, total: 0 };
  const byKind = {}; const byRegion = {}; const byOffice = {};
  const kindAdd = (k, status, eur) => { const b = (byKind[k] ??= { committed: 0, planned: 0, estimated: 0 }); b[status] += eur; };
  const regionAdd = (g, status, eur) => { const b = (byRegion[g] ??= { committed: 0, planned: 0, estimated: 0, units: 0, rooms: 0 }); b[status] += eur; return b; };
  const officeAdd = (s, status, eur) => { const b = (byOffice[s] ??= { committed: 0, planned: 0, estimated: 0, units: 0, rooms: 0, projects: 0 }); b[status] += eur; return b; };
  const need = {}; for (const g of REGIONS) need[g] = roleHours();
  let units = 0, rooms = 0, projects = 0;
  for (const p of y.committed.projects) {
    spend.committed += p.eur; kindAdd(p.kind, 'committed', p.eur); projects++;
    const g = ctx.siteRegion[p.site]; if (g) { regionAdd(g, 'committed', p.eur); addHours(need[g], p.hours); }
    officeAdd(p.site, 'committed', p.eur).projects++;
  }
  for (const [site, o] of Object.entries(y.planned.byOffice)) {
    const g = ctx.siteRegion[site]; if (!g) continue;
    let netEur = 0, avEur = 0;
    for (const [cls, n] of Object.entries(o.classes ?? {})) { const e = unitEur(cls, ctx) * n; if (groupOf(cls) === 'network') netEur += e; else avEur += e; }
    const p = officePlanned(o, ctx);
    spend.planned += p.eur; units += p.units; rooms += p.rooms;
    if (avEur) kindAdd('refresh', 'planned', avEur); if (netEur) kindAdd('infra-refresh', 'planned', netEur);
    const rb = regionAdd(g, 'planned', p.eur); rb.units += p.units; rb.rooms += p.rooms;
    const ob = officeAdd(site, 'planned', p.eur); ob.units += p.units; ob.rooms += p.rooms;
    addHours(need[g], p.hours);
  }
  for (const p of y.estimated.projects) {
    spend.estimated += p.eur; kindAdd(p.kind, 'estimated', p.eur); projects++;
    if (p.units) units += p.units; if (p.rooms) rooms += p.rooms;
    const g = p.region ?? ctx.siteRegion[p.site]; if (g) { const rb = regionAdd(g, 'estimated', p.eur); rb.units += p.units ?? 0; rb.rooms += p.rooms ?? 0; addHours(need[g], p.hours); }
    if (p.site) officeAdd(p.site, 'estimated', p.eur).projects++;
  }
  spend.total = spend.committed + spend.planned + spend.estimated;
  // Upkeep: the estate as it is, plus what scenarios have added by this year.
  const estate = {}; for (const g of REGIONS) estate[g] = { ...(ctx.estate[g] ?? {}) };
  for (const a of y.estimated.adds) { const e = estate[a.region]; for (const k of ['rooms', 'units', 'staff', 'kits', 'offices']) e[k] = (e[k] ?? 0) + (a[k] ?? 0); }
  const bau = {}; for (const g of REGIONS) { bau[g] = bauHours(estate[g], ctx.ratios); addHours(need[g], bau[g]); }
  const team = teamIn(y.n, ctx);
  const hours = {}; const gaps = {};
  for (const r of ROLES) {
    hours[r] = { need: 0, have: 0, people: 0, bau: 0, byRegion: {} };
    for (const g of REGIONS) {
      const people = team[g][r] ?? 0, have = people * ctx.hoursPerPerson, needH = need[g][r];
      hours[r].byRegion[g] = { people, have, need: needH, bau: bau[g][r], gap: have - needH };
      hours[r].need += needH; hours[r].have += have; hours[r].people += people; hours[r].bau += bau[g][r];
    }
    hours[r].gap = hours[r].have - hours[r].need;
    hours[r].pct = hours[r].have ? Math.round((hours[r].need / hours[r].have) * 100) : null;
    gaps[r] = hours[r].gap;
  }
  const envelope = y.envelope?.eur ?? null;
  return { id: y.id, n: y.n, spend, byKind, byRegion, byOffice, units, rooms, projects, hours, estate, envelope, headroom: envelope == null ? null : envelope - spend.total };
}

// ---- Scenarios ---------------------------------------------------------------------------------
const yearAt = (years, n) => years.find((y) => y.n === n) ?? null;
const sumClasses = (o) => Object.values(o.classes ?? {}).reduce((a, b) => a + b, 0);
// Move a share of an office's planned work from one year to another, rooms in proportion.
function moveShare(from, to, site, share, note) {
  const o = from.planned.byOffice[site]; if (!o) return 0;
  const t = (to.planned.byOffice[site] ??= { rooms: 0, classes: {} });
  let moved = 0;
  for (const [cls, n] of Object.entries(o.classes)) {
    const m = Math.round(n * share); if (!m) continue;
    o.classes[cls] = n - m; t.classes[cls] = (t.classes[cls] ?? 0) + m; moved += m;
  }
  const rooms = Math.round((o.rooms ?? 0) * share);
  o.rooms = (o.rooms ?? 0) - rooms; t.rooms = (t.rooms ?? 0) + rooms;
  return moved;
}
function moveClasses(from, to, pick) {
  let moved = 0;
  for (const [site, o] of Object.entries(from.planned.byOffice)) {
    const before = sumClasses(o);
    let m = 0;
    for (const [cls, n] of Object.entries(o.classes)) {
      if (!pick(cls) || !n) continue;
      const t = (to.planned.byOffice[site] ??= { rooms: 0, classes: {} });
      t.classes[cls] = (t.classes[cls] ?? 0) + n; o.classes[cls] = 0; m += n;
    }
    if (m && before) {
      const rooms = Math.round((o.rooms ?? 0) * (m / before));
      o.rooms -= rooms; to.planned.byOffice[site].rooms += rooms;
    }
    moved += m;
  }
  return moved;
}

// Apply one change to a copy of the years. Returns the words for what it did.
export function applyChange(years, c, ctx) {
  const last = years[years.length - 1].n;
  if (c.op === 'cut') {
    const n = fyNum(c.year), y = yearAt(years, n), next = yearAt(years, n + 1);
    if (!y) return `${fyLabel(n)} is outside the plan.`;
    let moved = 0;
    for (const site of Object.keys(y.planned.byOffice)) moved += next ? moveShare(y, next, site, c.percent / 100) : 0;
    return next ? `${moved} replacements move from ${fyLabel(n)} to ${fyLabel(n + 1)}, the lowest-scored spaces first.` : `${fyLabel(n)} is the last plan year; nothing to move into.`;
  }
  if (c.op === 'early') {
    const n = fyNum(c.year), y = yearAt(years, n);
    if (!y) return `${fyLabel(n)} is outside the plan.`;
    let moved = 0;
    for (const later of years) if (later.n > n) moved += moveClasses(later, y, (cls) => cls === c.class);
    return `${moved} ${c.class.replace(/-/g, ' ')} replacements due after ${fyLabel(n)} move into it.`;
  }
  if (c.op === 'delay') {
    let moved = 0, dropped = 0;
    for (let i = years.length - 1; i >= 0; i--) {
      const y = years[i], to = yearAt(years, y.n + c.years);
      if (to) moved += moveClasses(y, to, (cls) => groupOf(cls) === c.group);
      else { const gone = Object.values(y.planned.byOffice).reduce((a, o) => a + Object.entries(o.classes).filter(([cls]) => groupOf(cls) === c.group).reduce((s, [, n]) => s + n, 0), 0); if (gone) { dropped += gone; moveClasses(y, { planned: { byOffice: {} } }, (cls) => groupOf(cls) === c.group); } }
    }
    return `${moved} ${c.group === 'network' ? 'switch and gateway' : 'AV'} replacements move ${c.years === 1 ? 'a year' : `${c.years} years`} later${dropped ? `; ${dropped} fall after ${fyLabel(last)}` : ''}.`;
  }
  if (c.op === 'new-office') {
    const n = fyNum(c.year), y = yearAt(years, n), size = ctx.ratios.office_sizes[c.size], fo = ctx.ratios.fit_out;
    if (!y || !size) return `${fyLabel(n)} is outside the plan.`;
    const hours = roleHours(); for (const r of ROLES) hours[r] = (fo.hours_per_unit[r] ?? 0) * size.units;
    y.estimated.projects.push({ id: `new:${c.city.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:${n}`, name: `${c.city} office fit-out (${size.name.toLowerCase()})`, kind: 'fit-out', region: c.region, city: c.city, size: c.size, eur: size.units * fo.cost_per_unit, hours, units: size.units, rooms: size.rooms, staff: size.staff });
    for (const later of years) if (later.n >= n) later.estimated.adds.push({ region: c.region, city: c.city, rooms: size.rooms, units: size.units, staff: size.staff, kits: 0, offices: 1 });
    // Its units start falling due for replacement after refresh_after years, within the plan.
    const due = yearAt(years, n + fo.refresh_after);
    if (due) {
      const avg = ctx.avgClass ?? 'video-bar';
      const o = (due.planned.byOffice[`new:${c.city.toLowerCase()}`] ??= { rooms: 0, classes: {} });
      const m = Math.round(size.units * fo.refresh_share);
      o.classes[avg] = (o.classes[avg] ?? 0) + m; o.rooms += Math.round(size.rooms * fo.refresh_share);
      ctx.siteRegion[`new:${c.city.toLowerCase()}`] = c.region;
    }
    return `A ${size.name.toLowerCase()} office in ${c.city}: ${size.rooms} spaces, ${size.units} units and ${size.staff} staff from ${fyLabel(n)}; its first replacements fall in ${fyLabel(n + fo.refresh_after)}.`;
  }
  return 'Unknown change.';
}

export function applyScenario(baseline, scenario, ctx) {
  const years = clone(baseline);
  const c2 = { ...ctx, siteRegion: { ...ctx.siteRegion } };
  const notes = scenario.changes.map((c) => applyChange(years, c, c2));
  return { years, notes, ctx: c2 };
}

// Baseline and scenario side by side, per year.
export function compare(baseline, result, ctx) {
  return baseline.map((b, i) => {
    const a = yearTotals(b, ctx), s = yearTotals(result.years[i], result.ctx ?? ctx);
    const hours = {}; for (const r of ROLES) hours[r] = { base: a.hours[r].need, sc: s.hours[r].need, d: s.hours[r].need - a.hours[r].need, gapBase: a.hours[r].gap, gapSc: s.hours[r].gap };
    return { id: b.id, n: b.n, base: a, sc: s, d: { spend: s.spend.total - a.spend.total, units: s.units - a.units, rooms: s.rooms - a.rooms, projects: s.projects - a.projects }, hours };
  });
}

// A short sentence for a scenario's effect over the years: where the money and hours go.
export function effectWords(rows) {
  const up = rows.filter((r) => r.d.spend > 0), down = rows.filter((r) => r.d.spend < 0);
  const eur = (n) => (Math.abs(n) >= 1e6 ? `€${(Math.abs(n) / 1e6).toFixed(1)}m` : `€${Math.round(Math.abs(n) / 1000)}k`);
  const parts = [];
  if (up.length) parts.push(`${eur(up.reduce((a, r) => a + r.d.spend, 0))} more in ${up.map((r) => fyLabel(r.n)).join(', ')}`);
  if (down.length) parts.push(`${eur(down.reduce((a, r) => a + r.d.spend, 0))} less in ${down.map((r) => fyLabel(r.n)).join(', ')}`);
  const tech = rows.reduce((a, r) => a + r.hours.tech.d, 0);
  if (Math.abs(tech) >= 20) parts.push(`${Math.round(Math.abs(tech)).toLocaleString('en-IE')} technician hours ${tech > 0 ? 'more' : 'fewer'} over the plan`);
  return parts.length ? parts.join('; ') + '.' : 'No change to spend or hours.';
}

// The address of a new scenario typed on the page, and back.
export function changeFromForm(f) {
  if (f.op === 'cut') return { op: 'cut', percent: +f.percent || 15, year: f.year };
  if (f.op === 'new-office') return { op: 'new-office', size: f.size || 'M', region: f.region || 'emea', city: f.city || 'New office', year: f.year };
  if (f.op === 'early') return { op: 'early', class: f.class || 'video-bar', year: f.year };
  if (f.op === 'delay') return { op: 'delay', group: f.group || 'network', years: +f.years || 1 };
  return null;
}
