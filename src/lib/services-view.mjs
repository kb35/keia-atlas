// The services as the pages show them, worked out once at build time from the site's data (rules in
// src/lib/services.mjs). One model per service:
//   sim       what the live simulation runs on: { sites, units, rooms, incs } (units are the service's kit)
//   kinds     the Kind facet: [{ k, label, n }]
//   statics   figures that do not change during the day (comms rooms to standard, rack space, firmware behind)
//   firmware  one row per model: units, units behind the standard, the standard, advisories, known issues
//   incidents open incidents on this service's kit;  projects, due   changes and upcoming work
//   owners    the roles that run it, with who holds them and what they own, decide and hand on
// The live figures are simulated (livesim.mjs); stage 2 reads them from the real systems.
import { spaces, sites, racks, rackGear, projects, PROJECT_KIND, PHASE_LABEL, INC_STATE, DEMO_TODAY, SITE_ORDER, KIND, className, modelName, firmwareFor, standardFirmware, advisoriesFor, ADV_LEVEL, fmtDate, href } from './data.mjs';
import { devicesModel, roomsModel, lean, CLASS_LABEL } from './livemodel.mjs';
import { fleet, issues, person } from './knownissues-view.mjs';
import { ROLES, PEOPLE } from './demo.mjs';
import { work, addDays } from './work.mjs';
import { lowSpares } from './stock.mjs';
import { SERVICES, SERVICE_ORDER, serviceOfClass, servicesOfProject, commsChecks, prepareServiceModel, tally, lightOf, SPACE_SHORT_U } from './services.mjs';
import { snapshot, tickOf } from './livesim.mjs';

export { SERVICES, SERVICE_ORDER };

const dev = devicesModel();
const SITES = dev.sites;
const SITE_I = Object.fromEntries(SITES.map((s, i) => [s.id, i]));
const INCS = dev.incs;
const fleetByTag = new Map(fleet.map((f) => [f.tag, f]));
const KIND_WORDS = {
  gateway: 'Firewalls and gateways', switch: 'Switches', ap: 'Access points', wifi: 'Wi-Fi controllers', circuit: 'Internet circuits', 'home-gateway': 'Home gateways',
  ups: 'UPS', pdu: 'Power strips', oob: 'Out-of-band consoles', link: 'Fibre and cabling links',
};
const kindLabel = (k) => KIND_WORDS[k] ?? CLASS_LABEL[k] ?? className(k);

// A rack item as a thing that reports: not a device with a hostname in a room, so the simulation gives it health.
const rackThing = (r, s, it, k, name, tail = '') => ({
  id: `${r.id}:${it.u ?? 'side'}:${tail || k}`, n: name, cls: k, k, site: SITE_I[s.site], room: s.id, rn: s.name, old: 0, inc: -1, fw: '', m: it.gear ?? '', to: `/rooms/${s.id}/`,
});

// ---- The kit of each service ---------------------------------------------------------------------------------
function avUnits() {
  const base = roomsModel();
  const units = base.units.map((u) => {
    const own = serviceOfClass(u.cls, u.kind) === 'av';
    return { ...u, k: u.cls, x: own ? 0 : 1, m: fleetByTag.get(u.id)?.model ?? '' };
  });
  return { base, units };
}
function networkUnits() {
  const out = [];
  // The comms rooms' firewalls and switches, and the access points in each floor's open areas.
  for (const u of dev.units) {
    const ap = u.cls === 'wireless-access-point';
    if (serviceOfClass(u.cls, u.kind) !== 'network' || (u.kind !== 'comms' && !ap)) continue;
    out.push({ ...u, k: ap ? 'ap' : u.cls === 'network-gateway' ? 'gateway' : 'switch', m: fleetByTag.get(u.id)?.model ?? '' });
  }
  for (const r of Object.values(racks)) {
    const s = spaces[r.space]; if (!s) continue;
    for (const it of r.items) {
      if (it.kind === 'isp') {
        const n = /two providers|both providers/i.test(`${it.label} ${it.detail ?? ''}`) ? 2 : 1;
        for (let i = 1; i <= n; i++) out.push(rackThing(r, s, it, 'circuit', `Internet circuit${n > 1 ? ` ${i}` : ''}, ${sites[s.site].name}`, `circuit${i}`));
      }
      if (it.kind === 'wlc') out.push(rackThing(r, s, it, 'wlc', `Wi-Fi controller, ${sites[s.site].name}`, 'wlc'));
    }
  }
  for (const s of Object.values(spaces)) {
    if (KIND(s) !== 'kits') continue;
    for (const p of s.positions) {
      if (p.cls !== 'network-gateway' || p.current?.stage !== 'manage') continue;
      out.push({ id: p.current.asset_tag, n: `${s.name} home gateway`, cls: 'home-gateway', k: 'home-gateway', site: SITE_I[s.site], room: s.id, rn: s.name, old: 0, inc: INCS.findIndex((i) => i.tag === p.current.asset_tag), fw: '', m: p.model ?? '', to: `/device/?tag=${p.current.asset_tag}` });
    }
  }
  // The circuit and Wi-Fi controller things carry their kind as the simulated class (SIM_KIND); their filter kind is shorter.
  return out.map((u) => (u.cls === 'wlc' ? { ...u, k: 'wifi', cls: 'wlc' } : u));
}
function infraUnits() {
  const out = [];
  for (const r of Object.values(racks)) {
    const s = spaces[r.space]; if (!s) continue;
    const at = `${s.name}, ${sites[s.site].name}`;
    for (const it of r.items) {
      if (it.kind === 'ups') out.push(rackThing(r, s, it, 'ups', `UPS, ${at}`));
      if (it.kind === 'oob') out.push(rackThing(r, s, it, 'oob', `Out-of-band console, ${at}`, `oob${it.u}`));
      if (it.kind === 'fibre-panel') {
        const what = /floor riser/i.test(it.label) ? 'Floor riser fibre' : /riser fibre/i.test(it.detail ?? '') ? 'Riser fibre' : 'Provider fibre';
        out.push(rackThing(r, s, it, 'link', `${what}, ${at}`, `link${it.u}`));
      }
    }
    (r.side_pdus ?? []).forEach((p, i) => out.push(rackThing(r, s, { gear: p.gear }, 'pdu', `Power strip ${p.feed}, ${at}`, `pdu${i}`)));
  }
  return out;
}

// ---- Static figures for infrastructure -------------------------------------------------------------------------
function commsRoomRows() {
  return Object.values(racks).map((r) => {
    const s = spaces[r.space], c = commsChecks(r, rackGear);
    return { id: r.id, room: s.id, name: s.name, site: s.site, siteName: sites[s.site].name, region: sites[s.site].region, rack: r.name, height: r.height_u, free: c.free, short: c.short, toStandard: c.toStandard, checks: c.checks, failed: c.failed, to: `/rooms/${s.id}/` };
  }).sort((a, b) => SITE_ORDER.indexOf(a.site) - SITE_ORDER.indexOf(b.site) || a.name.localeCompare(b.name));
}
function gearRows() {
  const map = new Map();
  for (const r of Object.values(racks)) for (const it of r.items) {
    const g = it.gear ? rackGear[it.gear] : null; if (!g || !['ups', 'oob', 'access-switch', 'core-switch', 'firewall', 'wlc', 'isp', 'pdu'].includes(g.kind)) continue;
    const row = map.get(g.id) ?? { id: g.id, name: `${String(g.manufacturer).replace(/ by .*$/, '')} ${g.model}`, kind: g.kind, standard: Boolean(g.standard), racks: new Set(), count: 0 };
    row.racks.add(r.id); row.count++; map.set(g.id, row);
  }
  for (const r of Object.values(racks)) for (const p of r.side_pdus ?? []) {
    const g = rackGear[p.gear]; if (!g) continue;
    const row = map.get(g.id) ?? { id: g.id, name: `${String(g.manufacturer).replace(/ by .*$/, '')} ${g.model}`, kind: g.kind, standard: Boolean(g.standard), racks: new Set(), count: 0 };
    row.racks.add(r.id); row.count++; map.set(g.id, row);
  }
  return [...map.values()].map((r) => ({ ...r, racks: r.racks.size })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
const GEAR_KIND = { ups: 'UPS', oob: 'Out-of-band console', 'access-switch': 'Access switch', 'core-switch': 'Core switch', firewall: 'Firewall', wlc: 'Wi-Fi controller', isp: 'Provider box', pdu: 'Power strip' };

// ---- Firmware against the standard, one row per model ------------------------------------------------------------
function firmwareRows(units) {
  const by = new Map();
  for (const u of units) {
    if (u.x || !u.m) continue;
    const r = by.get(u.m) ?? { m: u.m, cls: u.cls, units: 0, behind: 0, found: new Set() };
    r.units++;
    if (u.fw) { r.behind++; const f = String(u.fw).split('|')[0]; if (f) r.found.add(f); }
    by.set(u.m, r);
  }
  return [...by.values()].map((r) => {
    const std = standardFirmware(r.m), line = firmwareFor(r.m);
    const ki = issues.filter((i) => i.models.includes(r.m));
    return {
      m: r.m, name: modelName(r.m), kind: CLASS_LABEL[r.cls] ?? className(r.cls), units: r.units, behind: r.behind, found: [...r.found],
      standard: std?.version ?? null, line: line?.name ?? null,
      advisories: advisoriesFor(r.m).map((a) => ({ id: a.id, level: a.level, levelLabel: ADV_LEVEL[a.level], title: a.title })),
      issues: ki.length, profile: `/models/${r.m}/`,
    };
  }).sort((a, b) => b.behind - a.behind || b.units - a.units || a.name.localeCompare(b.name));
}

// ---- Incidents, projects and owners ------------------------------------------------------------------------------
function incidentRows(units) {
  const tags = new Set(units.filter((u) => !u.x).map((u) => u.id));
  return INCS.filter((i) => i.tag && tags.has(i.tag)).map((i) => {
    const s = spaces[i.room];
    return { no: i.no, title: i.title, pri: i.pri, state: i.state, opened: i.opened, room: s ? (s.number ? `${s.number} ${s.name}` : s.name) : '', site: s?.site ?? '', siteName: s ? sites[s.site].name : '', to: i.to, tag: i.tag };
  });
}
function projectRows(id) {
  return Object.values(projects).filter((p) => p.phase !== 'closed' && servicesOfProject(p.kind).includes(id)).map((p) => {
    const tasks = work.filter((w) => w.kind === 'task' && w.project === p.id && w.status !== 'done');
    return {
      id: p.id, name: p.name, kind: PROJECT_KIND[p.kind] ?? p.kind, phase: PHASE_LABEL[p.phase] ?? p.phase, target: p.target, targetText: fmtDate(p.target),
      owner: person(p.owner).name, site: p.site, siteName: sites[p.site]?.name ?? '', open: tasks.length, to: `/projects/${p.id.toLowerCase()}/`,
    };
  }).sort((a, b) => String(a.target).localeCompare(String(b.target)));
}
function dueRows(id) {
  const to = addDays(DEMO_TODAY, 14);
  const kindOf = Object.fromEntries(Object.values(projects).map((p) => [p.id, p.kind]));
  return work.filter((w) => w.kind === 'task' && w.status !== 'done' && w.end && w.end >= DEMO_TODAY && w.end <= to && servicesOfProject(kindOf[w.project]).includes(id))
    .sort((a, b) => a.end.localeCompare(b.end) || a.title.localeCompare(b.title))
    .map((w) => ({ title: w.title, project: w.project, end: w.end, endText: fmtDate(w.end, { day: 'numeric', month: 'short' }), who: w.who.map((p) => person(p).name).join(', '), siteName: sites[w.site]?.name ?? '', to: w.href }));
}
function ownerRows(id) {
  const svc = SERVICES[id];
  return svc.roles.map((roleId, i) => {
    const role = ROLES[roleId], people = PEOPLE.filter((p) => p.roleId === roleId);
    return { roleId, name: role.name, owns: role.owns, decides: role.decides, hands: role.hands, owner: i === 0, count: people.length, people: people.slice(0, 3).map((p) => ({ id: p.id, name: p.name, initials: p.initials, scope: p.scope })), more: Math.max(0, people.length - 3) };
  });
}
function spareRows(id) {
  return lowSpares.filter((s) => (s.modelClass ? serviceOfClass(s.modelClass, 'meeting') === id || (s.modelClass === 'network-switch' && id === 'network') : id === 'infrastructure'))
    .map((s) => ({ id: s.id, what: s.what, siteName: s.siteName, site: s.site, quantity: s.quantity, minimum: s.minimum, where: s.whereText, to: `/spares/?q=${encodeURIComponent(s.id)}` }));
}

// ---- One service ------------------------------------------------------------------------------------------------
const cache = new Map();
export function serviceModel(id) {
  if (cache.has(id)) return cache.get(id);
  const svc = SERVICES[id];
  let units, rooms = [], base = null;
  if (id === 'av') { const a = avUnits(); units = a.units; base = a.base; rooms = base.rooms; }
  else units = id === 'network' ? networkUnits() : infraUnits();
  const shown = units.filter((u) => !u.x);
  const kinds = [...new Set(shown.map((u) => u.k))].map((k) => ({ k, label: kindLabel(k), n: shown.filter((u) => u.k === k).length })).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
  const rows = commsRoomRows();
  const statics = id === 'infrastructure'
    ? { rooms: rows.length, toStandard: rows.filter((r) => r.toStandard).length, short: rows.filter((r) => r.short).length, shortU: SPACE_SHORT_U }
    : {};
  const model = {
    id, svc, sim: { ...lean({ sites: SITES, units, rooms, incs: INCS }, ['id', 'n', 'cls', 'k', 'site', 'rn', 'old', 'inc', 'fw', 'x', 'm', 'to']) },
    kinds, units, shown, statics,
    sites: SITES.map((s, i) => ({ ...s, i, units: shown.filter((u) => u.site === i) })).filter((s) => s.units.length),
    firmware: id === 'infrastructure' ? [] : firmwareRows(units),
    gear: id === 'infrastructure' ? gearRows().map((g) => ({ ...g, kindLabel: GEAR_KIND[g.kind] ?? g.kind })) : [],
    commsRooms: id === 'infrastructure' ? rows : [],
    incidents: incidentRows(units), projects: projectRows(id), due: dueRows(id), owners: ownerRows(id), spares: spareRows(id),
    behind: shown.filter((u) => u.fw).length,
  };
  cache.set(id, model);
  return model;
}
export const KIND_LABEL_OF = kindLabel;
export { INC_STATE, href };

// The three lights for one office, at a moment (the build's time unless `ms` is given): the same simulation and the same
// rule as the service pages. { av, network, infrastructure } each { light: 'ok' | 'warn' | 'bad' | 'none', reason, n }.
// 'none' is an office with nothing of that service on record (five offices have no comms room recorded).
const LIGHT = { good: 'ok', warn: 'warn', bad: 'bad', none: 'none' };
const snaps = new Map();
export function serviceHealth(siteId, ms = Date.now()) {
  const t = tickOf(ms), out = {};
  for (const id of SERVICE_ORDER) {
    const m = serviceModel(id), si = SITE_I[siteId];
    prepareServiceModel(m.sim);
    const key = `${id}:${t}`;
    if (!snaps.has(key)) { if (snaps.size > 12) snaps.clear(); snaps.set(key, snapshot(m.sim, t)); }
    const n = tally(m.sim, snaps.get(key), (u) => u.site === si);
    const bad = n.offline + n.alert;
    out[id] = {
      light: LIGHT[lightOf(n)], n,
      reason: !n.all ? 'Nothing recorded here' : n.offline ? `${n.offline} offline${n.alert ? `, ${n.alert} with alerts` : ''}` : n.alert ? `${n.alert} with ${n.alert === 1 ? 'an alert' : 'alerts'}` : 'All online',
    };
  }
  return out;
}
