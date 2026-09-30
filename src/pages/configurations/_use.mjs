// Where each configuration is used, for the Configurations list and each configuration's page.
//  - Projects configuring it now: projects in Deploy whose rooms hold one of its models, with how far
//    each room has got (from the room's state in the project and its configure task).
//  - Projects coming up: the same, for projects still in Plan, Design or Procure.
//  - Units running it: every unit of its models, with whether its records match (simulated: the example
//    unit takes what src/lib/cfgstate.mjs found; the others a small, repeatable share drift).
//  - Provisioning: the record each system needs for this kind of device, and the hostname pattern.
// Configuring itself happens in a project's Deploy page (/projects/<id>/integrate/).
import { projects, spaces, sites, classes, models, STAGE_LABEL, PHASE_LABEL, className, deviceName, modelName, standardFirmware, firmwareFor, href } from '../../lib/data.mjs';
import { SYSTEMS, fileState, providerOf } from '../../lib/cfgstate.mjs';

const h = (str) => [...String(str)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
export const integrateHref = (p) => href(`/projects/${p.id.toLowerCase()}/integrate/`);
export const projectHref = (p) => href(`/projects/${p.id.toLowerCase()}/`);
const roomTitle = (s) => (s.number ? `${s.number} ${s.name}` : s.name);

// A room's configure state inside a project: its own configure task first, then a project-wide one,
// then the room's state in the project.
export const ROOM_STATE = { done: 'Configured', doing: 'Being configured', todo: 'To do', blocked: 'Blocked' };
function roomState(p, entry) {
  const own = p.tasks.find((t) => t.kind === 'configure' && t.space === entry.space);
  const all = p.tasks.find((t) => t.kind === 'configure' && !t.space);
  if (entry.state === 'done') return 'done';
  const t = own ?? all;
  if (t) return t.status === 'done' ? 'done' : t.status === 'doing' ? 'doing' : t.status === 'blocked' ? 'blocked' : 'todo';
  return entry.state === 'in-progress' || entry.state === 'snags' ? 'doing' : 'todo';
}

const EARLY = new Set(['plan', 'design', 'procure']);
// Which kinds of device a project works on. A project named for one kind ("video bar refresh", "booking
// panels", "switch refresh") works on that kind; a general one (a room refresh, a fit-out, home offices)
// on everything in its rooms.
const ALIAS = {
  'video-bar': ['video bar', 'videoos'], 'touch-controller': ['touch controller', 'tc10', 'videoos'], 'scheduler-panel': ['booking panel', 'scheduler'],
  'network-switch': ['switch'], 'av-extender': ['hdbaset', 'extender', 'receiver'], 'network-gateway': ['gateway'], codec: ['codec'],
  'signage-player': ['signage'], display: ['display', 'screen'], camera: ['camera'], microphone: ['microphone'], printer: ['printer'],
};
const namesOf = (cls) => [className(cls).toLowerCase(), ...(ALIAS[cls] ?? [])];
const ALL_NAMES = Object.keys(classes).flatMap(namesOf);
function touches(p, cls) {
  const t = `${p.name}`.toLowerCase();
  if (!ALL_NAMES.some((n) => t.includes(n))) return true;
  return namesOf(cls).some((n) => t.includes(n));
}
function projectsFor(cfg) {
  const now = [], soon = [];
  const cls = models[cfg.models[0]].class;
  for (const p of Object.values(projects)) {
    if (!(p.phase === 'integrate' || EARLY.has(p.phase))) continue;
    if (!touches(p, cls)) continue;
    const rooms = [];
    for (const entry of p.spaces ?? []) {
      const s = spaces[entry.space]; if (!s) continue;
      const devs = s.positions.filter((pos) => cfg.models.includes(pos.model) && pos.current);
      if (!devs.length) continue;
      rooms.push({ id: s.id, title: roomTitle(s), site: sites[s.site].name, devices: devs.length, state: p.phase === 'integrate' ? roomState(p, entry) : 'todo', href: href(`/rooms/${s.id}/`) });
    }
    if (!rooms.length) continue;
    const total = rooms.reduce((n, r) => n + r.devices, 0);
    const done = rooms.filter((r) => r.state === 'done').reduce((n, r) => n + r.devices, 0);
    const doing = rooms.filter((r) => r.state === 'doing').reduce((n, r) => n + r.devices, 0);
    const row = { id: p.id, name: p.name, site: sites[p.site]?.name ?? '', phase: PHASE_LABEL[p.phase], rooms, total, done, doing, href: projectHref(p), integrate: integrateHref(p), target: p.target };
    (p.phase === 'integrate' ? now : soon).push(row);
  }
  // The ones with the most still to do first.
  now.sort((a, b) => (b.total - b.done) - (a.total - a.done) || a.id.localeCompare(b.id));
  soon.sort((a, b) => a.id.localeCompare(b.id));
  return { now, soon };
}

// Why a unit's records do not match, in plain words (simulated for every unit but the example one).
const DRIFT = {
  fw: 'Firmware behind the standard',
  dns: 'Address does not match DNS',
  mon: 'Missing from monitoring',
  asset: 'Asset record in the wrong room',
};
function unitsFor(cfg, fs) {
  const cls = models[cfg.models[0]].class, plat = classes[cls]?.platforms ?? {};
  const exHost = fs.device?.host, exTag = fs.device?.tag;
  const exDrift = fs.wrong.length ? `${fs.wrong[0].name} is wrong` : (() => {
    const d = fs.systems.find((s) => s.state === 'drift' || s.state === 'missing');
    return d ? (d.state === 'missing' ? `Missing from ${d.name}` : `${d.name} record drifted`) : null;
  })();
  const out = [];
  for (const s of Object.values(spaces)) for (const pos of [...s.positions, ...s.olderKit]) {
    if (!cfg.models.includes(pos.model) || !pos.current) continue;
    const u = pos.current, live = u.stage === 'manage';
    let drift = null;
    if (live && exTag && u.asset_tag === exTag) drift = exDrift;
    else if (live && h(`${cfg.id}:${u.serial}`) % 29 === 0) {
      const pick = ['fw', 'dns', 'mon', 'asset'].filter((k) => (k === 'fw' ? firmwareFor(pos.model) : k === 'dns' ? plat.dhcp_dns && pos.hostname : k === 'mon' ? plat.monitoring && pos.hostname : true));
      drift = DRIFT[pick[h(u.serial) % pick.length]];
    }
    out.push({
      name: deviceName(s, pos), tag: u.asset_tag, host: pos.hostname ?? null, room: roomTitle(s), roomId: s.id, site: sites[s.site].name, siteId: s.site,
      model: modelName(pos.model), stage: u.stage, status: STAGE_LABEL[u.stage], live, drift, example: Boolean(exTag && u.asset_tag === exTag),
      href: href(`/device/?tag=${u.asset_tag}`),
    });
  }
  // Drifted first, then live, then the rest; by site and room within.
  const rank = (x) => (x.drift ? 0 : x.live ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || a.site.localeCompare(b.site) || a.room.localeCompare(b.room, 'en', { numeric: true }));
}

// Provisioning: one record per system the kind of device lives in (the class's platforms), with the
// fields it needs, where the file sits, plus the hostname pattern, licence and firmware.
const PLATFORM_SYSTEM = { inventory: 'assetbox', dhcp_dns: 'infodns', device_management: 'fleetlens', room_booking: 'appstate', monitoring: 'monitordog' };
const FILE = {
  assetbox: 'assets/<asset tag>.json',
  infodns: 'zones/aigna.example/<hostname>',
  fleetlens: 'sites/<site>/devices/<hostname>.yaml',
  darksign: 'players/<hostname>.json',
  appstate: 'rooms/<room id>.yaml',
  monitordog: 'checks/<hostname>.yml',
};
const nice = (s) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export function provisioningOf(cfg) {
  const cls = models[cfg.models[0]].class, C = classes[cls], plat = C?.platforms ?? {}, signage = cls === 'signage-player';
  const fs = fileState(cfg);
  const used = new Map(fs.systems.filter((s) => s.state !== 'na').map((s) => [s.id, s]));
  const systems = SYSTEMS.map((sy) => {
    const pk = Object.keys(PLATFORM_SYSTEM).find((k) => PLATFORM_SYSTEM[k] === sy.id) ?? (sy.id === 'darksign' ? 'device_management' : null);
    const p = pk ? plat[pk] : null;
    const applies = used.has(sy.id);
    return { ...sy, applies, file: FILE[sy.id], fields: (p?.required_fields ?? used.get(sy.id)?.fields.map((f) => f.k) ?? []).map(nice), healthy: p?.healthy_indicators ?? [] };
  }).filter((s) => s.applies || (s.id !== 'darksign' || signage));
  const prefix = C?.profile.naming_prefixes?.[0] ?? null;
  const example = fs.device?.host ?? null;
  const fw = standardFirmware(cfg.models[0]);
  const licence = (cfg.requires ?? []).filter((r) => /licen[cs]e/i.test(r));
  return { systems, prefix, example, hostnames: Boolean(plat.dhcp_dns && prefix), fw, fwLine: firmwareFor(cfg.models[0]), licence, kind: className(cls) };
}

// Everything the list and the page need about one configuration, worked out once.
const cache = new Map();
export function useOf(cfg) {
  if (cache.has(cfg.id)) return cache.get(cfg.id);
  const fs = fileState(cfg);
  const { now, soon } = projectsFor(cfg);
  const units = unitsFor(cfg, fs);
  const live = units.filter((u) => u.live).length, drifted = units.filter((u) => u.drift).length;
  const configuring = now.reduce((n, p) => n + (p.total - p.done), 0);
  // Status for the list's filter: several can be true at once.
  const status = [now.length && 'configuring', drifted && 'drift', live && !drifted && 'sync', !units.length && 'unused'].filter(Boolean);
  const out = { fs, now, soon, units, live, drifted, configuring, status, provider: providerOf(cfg) };
  cache.set(cfg.id, out);
  return out;
}
export const STATUS_LABEL = { configuring: 'Being configured', drift: 'Drift found', sync: 'In sync', unused: 'No units yet' };
export const FW_KIND = { standard: 'Aigna standard', named: 'Version named', none: 'Not versioned' };

// The short facts a card, a row or a band shows about a configuration.
const short = (m) => models[m].model.replace(/\s*\(.*\)$/, '');
export function factsOf(cfg) {
  const cls = models[cfg.models[0]].class;
  // "Studio X52, X32 and X72": later models drop the words they share with the first.
  const names = cfg.models.map(short), first = names[0].split(' ');
  const parts = names.map((n, i) => { if (!i) return n; const w = n.split(' '); let k = 0; while (k < w.length - 1 && w[k] === first[k]) k++; return w.slice(k).join(' '); });
  const modelList = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
  const maker = [...new Set(cfg.models.map((m) => models[m].manufacturer))].join(', ');
  const std = standardFirmware(cfg.models[0])?.version ?? null;
  const fwFull = cfg.firmware_min ?? (std ? `${std} or later` : cfg.firmware ?? null);
  const fwShort = fwFull ? fwFull.split(/[;(]/)[0].trim() : null;
  const fwKind = std ? 'standard' : cfg.firmware ? 'named' : 'none';
  const all = cfg.groups.flatMap((g) => g.settings);
  const nSet = all.filter((s) => s.action === 'change').length, nVer = all.filter((s) => s.action === 'verify').length;
  const steps = (cfg.setup ?? cfg.steps ?? []).length;
  const unconfirmed = all.filter((s) => s.unconfirmed).length;
  return { cls, kind: className(cls), modelList, maker, fwFull, fwShort, fwKind, nSet, nVer, applied: nSet + nVer, total: all.length, steps, unconfirmed, mode: providerOf(cfg) };
}

// The web interface map: settings placed under their top menu, then page. With a menu list, only the
// device's own menus go in the map; settings made elsewhere (a cloud console, the firewall) are named
// beside it. A map needs a device with a web interface and more than one menu.
export function mapOf(cfg) {
  const all = cfg.groups.flatMap((g) => g.settings.map((st) => ({ ...st, group: g.name, where: g.where })));
  const menus = [];
  const menuOf = (name) => { let m = menus.find((x) => x.name === name); if (!m) menus.push((m = { name, pages: [] })); return m; };
  (cfg.menus ?? []).forEach(menuOf);
  const elsewhere = new Set();
  for (const st of all) {
    const parts = (st.path ?? '').split('>').map((x) => x.trim()).filter(Boolean);
    const top = parts[0] ?? st.where ?? 'Other';
    if (cfg.menus && !cfg.menus.includes(top)) { elsewhere.add(top); continue; }
    const page = parts.length > 1 ? parts.slice(1).join(' › ') : st.group !== top ? st.group : '';
    const m = menuOf(top);
    let pg = m.pages.find((x) => x.name === page); if (!pg) m.pages.push((pg = { name: page, settings: [] }));
    pg.settings.push(st);
  }
  const liveMenus = menus.filter((m) => m.pages.length);
  const none = /^none/i.test(cfg.managed_by ?? '');
  return { liveMenus, elsewhere: [...elsewhere], hasMap: !none && liveMenus.length > 1, webUi: Boolean(cfg.menus) || /web/i.test(cfg.managed_by ?? '') };
}
