// Planning: the baseline plan by financial year, built once from the data (projects, the work plan, the comms
// room sizing, the team and data/planning/*.yaml), and everything the Planning page and its script need to
// price it, add scenarios to it and check it against the team's hours. The rules are in planningcore.mjs.
import path from 'node:path';
import { loadYaml } from './demo-clock.mjs';
import { sites, siteStats, projects, plans, classes, commsRooms, SITE_ORDER, DEMO_TODAY, className, PROJECT_KIND } from './data.mjs';
import { policy, dueList, NOW_YEAR } from './refresh.mjs';
import { PEOPLE } from './demo.mjs';
import { commsFacts, sizeFor } from './comms.mjs';
import { ROLES, REGIONS, fyOf, fyId, fyLabel, fySpan, fyOfDue, groupOf, emptyYear, yearTotals, applyScenario, compare, effectWords, PROJECT_ROLE_TO_ROLE, roleHours, unitEur } from './planningcore.mjs';

const readPlanning = (name) => loadYaml(path.join(process.cwd(), `data/planning/${name}.yaml`));
export const ratios = readPlanning('ratios');
export const headcount = readPlanning('headcount');
export const budget = readPlanning('budget');
export const scenariosOnRecord = readPlanning('scenarios').scenarios;

export const NOW_FY = fyOf(DEMO_TODAY);
export const YEAR_NUMBERS = Array.from({ length: 7 }, (_, i) => NOW_FY + i);   // this financial year, next, and five ahead
export const YEARS = YEAR_NUMBERS.map((n) => ({ id: fyId(n), n, label: fyLabel(n), span: fySpan(n), current: n === NOW_FY, next: n === NOW_FY + 1 }));
export const RATE = budget.hour_rate;
export const eur = (n, c) => n * (budget.rates[c] ?? 1);
export const money = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
export const kmoney = (n) => (Math.abs(n) >= 1e6 ? `€${(n / 1e6).toFixed(2)}m` : `€${Math.round(n / 1000)}k`);
export const fmtH = (n) => Math.round(n).toLocaleString('en-IE');
// An office is named by its city; the remote sites keep their names.
export const officeName = (sid) => (sites[sid]?.kind === 'remote' ? sites[sid].name : `${sites[sid]?.city ?? sid} office`);

// ---- Per class: what a unit costs to buy, and the hours each role spends swapping it -------------------------
// The same networked rule as refresh.mjs: tasks marked networked_only apply to classes with a network address.
export const CLASS = {};
for (const c of policy.classes) {
  const hours = roleHours();
  for (const t of policy.tasks) {
    if (t.networked_only && !classes[c.class]?.platforms?.dhcp_dns) continue;
    const role = ratios.refresh_roles[t.task] ?? 'tech';
    hours[role] += (t.low + t.high) / 2;
  }
  CLASS[c.class] = { eur: budget.unit_price[c.class] ?? 500, hours, name: className(c.class), life: c.years };
}

// ---- The estate and the team, by region --------------------------------------------------------------------
export const siteRegion = Object.fromEntries(SITE_ORDER.map((s) => [s, sites[s].region]));
export const estate = {};
for (const g of REGIONS) estate[g] = { rooms: 0, units: 0, staff: 0, kits: 0, offices: 0 };
export const officeFacts = {};
for (const sid of SITE_ORDER) {
  const st = siteStats[sid], g = sites[sid].region, remote = sites[sid].kind === 'remote';
  const staff = remote ? st.kits : (headcount.staff[sid] ?? 0);
  officeFacts[sid] = { rooms: st.rooms, units: st.units, staff, kits: st.kits, desks: st.desks, remote };
  const e = estate[g];
  e.rooms += st.rooms; e.units += st.units; e.staff += staff; e.kits += st.kits; if (!remote) e.offices++;
}
export const team = {};
for (const g of REGIONS) team[g] = roleHours();
for (const p of PEOPLE) {
  if (!ROLES.includes(p.roleId)) continue;
  if (p.region) team[p.region][p.roleId] += 1;
  else if (p.roleId === 'network') { team.amer.network += 0.5; team.emea.network += 0.5; }   // covers the Americas and EMEA
}
export const hoursPerPerson = (ratios.hours.working_days - ratios.hours.leave_days) * ratios.hours.per_day;

// The context every calculation takes (planningcore.mjs). It goes to the browser as JSON too.
export const ctx = { CLASS, rate: RATE, ratios, estate, team, hires: headcount.changes, siteRegion, hoursPerPerson, avgClass: 'video-bar' };

// ---- Which units in the work plan a live project already covers --------------------------------------------
const REPLACING = new Set(['refresh', 'infra-refresh', 'custom-design', 'fit-out', 'upgrade', 'workplace-refresh', 'network-refresh', 'home-kit', 'decommission']);
const open = Object.values(projects).filter((p) => p.phase !== 'closed');
const roomProject = new Map();
for (const p of open) if (REPLACING.has(p.kind)) for (const s of p.spaces ?? []) roomProject.set(s.space, p);
export const projectOf = (r) => {
  const p = roomProject.get(r.space.id);
  return p && fyOfDue(r.due, NOW_FY) <= fyOf(p.target) ? p : null;
};

// ---- The baseline: seven plan years ------------------------------------------------------------------------
const envelopeOf = (n) => { const e = budget.envelopes.find((x) => x.year === fyId(n)); return e ? { eur: e.amount, status: e.status, note: e.note } : null; };
export const baseline = YEAR_NUMBERS.map((n) => emptyYear(n, envelopeOf(n)));
const yearAt = (n) => baseline.find((y) => y.n === n);
export const projectHours = (p) => { const h = roleHours(); for (const r of p.roles ?? []) { const role = PROJECT_ROLE_TO_ROLE[r.as]; if (role) h[role] += r.hours ?? 0; } return h; };
for (const p of open) {
  const y = yearAt(fyOf(p.target)); if (!y || !p.budget) continue;
  y.committed.projects.push({ id: p.id, name: p.name, kind: p.kind, site: p.site, phase: p.phase, owner: p.owner, eur: Math.round(eur(p.budget.approved, p.budget.currency)), currency: p.budget.currency, approved: p.budget.approved, hours: projectHours(p), target: p.target });
}
// The work plan, office by office and class by class, less what a project already covers.
export const dueUnits = [];   // every unit in the plan window, with its year and whether a project has it
const roomsSeen = new Map();
for (const r of dueList) {
  const n = fyOfDue(r.due, NOW_FY);
  const p = projectOf(r);
  const rec = { r, n, year: n <= YEAR_NUMBERS[YEAR_NUMBERS.length - 1] ? fyId(n) : null, project: p, site: r.space.site, cls: r.cls, group: groupOf(r.cls) };
  dueUnits.push(rec);
  const y = yearAt(n); if (!y || p) continue;
  const o = (y.planned.byOffice[r.space.site] ??= { rooms: 0, classes: {} });
  o.classes[r.cls] = (o.classes[r.cls] ?? 0) + 1;
  const k = `${n}:${r.space.site}`; const rs = roomsSeen.get(k) ?? new Set(); if (!rs.has(r.space.id)) { rs.add(r.space.id); o.rooms++; } roomsSeen.set(k, rs);
}
export const inProjectCount = (n) => dueUnits.filter((d) => d.n === n && d.project).length;
export const laterUnits = dueUnits.filter((d) => !d.year).length;

// ---- Comms rooms: what the sizing says is short, per office (the network refresh story) --------------------
export const commsShort = {};
for (const s of commsRooms) {
  const f = commsFacts(s), sz = sizeFor(s, f);
  const bad = (sz.rows ?? []).filter((row) => row.v?.tone === 'bad').map((row) => `${row.name.toLowerCase()} ${row.v.text.toLowerCase()}`);
  if (bad.length) (commsShort[s.site] ??= []).push({ room: s.name, id: s.id, what: bad.join(', ') });
}

// ---- Totals per year, the scenarios on record, and the lines behind every figure ---------------------------
export const totals = Object.fromEntries(baseline.map((y) => [y.id, yearTotals(y, ctx)]));
export const scenarios = scenariosOnRecord.map((s) => {
  const res = applyScenario(baseline, s, ctx);
  const rows = compare(baseline, res, ctx);
  return { ...s, notes: res.notes, rows, plan: res.years, effect: effectWords(rows), years: rows.filter((r) => r.d.spend || r.d.units || Math.abs(r.hours.tech.d) >= 1).map((r) => r.id) };
});

// The lines: one per project (committed) and one per office and kind (planned) in each year. Estimated lines
// come from adopted scenarios, on the page.
export const lines = [];
for (const y of baseline) {
  for (const p of y.committed.projects) lines.push({ id: `${y.id}:${p.id}`, year: y.id, n: y.n, status: 'committed', kind: p.kind, kindLabel: PROJECT_KIND[p.kind] ?? p.kind, site: p.site, region: siteRegion[p.site], name: p.name, sub: `${p.id} · ${officeName(p.site)} · ends ${new Date(p.target).toLocaleDateString('en-IE', { month: 'short', year: 'numeric' })}`, eur: p.eur, units: 0, rooms: 0, hours: p.hours, to: `/projects/${p.id.toLowerCase()}/`, where: 'the project' });
  for (const [site, o] of Object.entries(y.planned.byOffice)) {
    for (const group of ['av', 'network']) {
      const classes = Object.entries(o.classes).filter(([cls, n]) => n && groupOf(cls) === group);
      if (!classes.length) continue;
      const units = classes.reduce((a, [, n]) => a + n, 0);
      const e = classes.reduce((a, [cls, n]) => a + unitEur(cls, ctx) * n, 0);
      const hours = roleHours(); for (const [cls, n] of classes) for (const r of ROLES) hours[r] += (CLASS[cls]?.hours[r] ?? 0) * n;
      const top = classes.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cls, n]) => `${n} ${CLASS[cls]?.name.toLowerCase() ?? cls}${n === 1 ? '' : 's'}`).join(', ');
      const kind = group === 'network' ? 'infra-refresh' : 'refresh';
      const short = group === 'network' ? (commsShort[site] ?? []) : [];
      lines.push({ id: `${y.id}:${site}:${group}`, year: y.id, n: y.n, status: 'planned', kind, kindLabel: PROJECT_KIND[kind], site, region: siteRegion[site], name: `${officeName(site)}: ${group === 'network' ? 'comms room' : 'AV'} replacements`, sub: `${units} ${units === 1 ? 'unit' : 'units'} in ${o.rooms} ${o.rooms === 1 ? 'room' : 'rooms'}: ${top}${classes.length > 3 ? ' and more' : ''}${short.length ? `. ${short.map((x) => `${x.room} ${x.what}`).join('; ')}` : ''}`, eur: Math.round(e), units, rooms: o.rooms, hours, to: `/refresh/?year=${y.n === NOW_FY ? `${NOW_YEAR},${y.n}` : y.n}&site=${site}&project=none${group === 'network' ? '&cls=network-switch,network-gateway' : ''}`, where: 'the Work plan' });
    }
  }
}
// The pipeline in the year plan on record: work that is planned but not yet a project, priced when it is raised.
export const pipeline = Object.values(plans).flatMap((pl) => pl.pipeline.map((w) => ({ ...w, year: fyId(fyOf(w.start)) })));

export { fyLabel, fySpan, fyId, ROLES, REGIONS };
