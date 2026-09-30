// Loads everything in data/ once, at build time, and works out what the pages need.
// The validator (npm run validate) runs before the build, so this trusts the data.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const DATA = path.join(process.cwd(), 'data');
export const base = import.meta.env.BASE_URL.replace(/\/$/, '');
export const href = (p) => `${base}${p}`;
// The repository is private for now, so links to its decision records point at the site's own copies.
const REPO_DECISIONS = 'https://github.com/kb35/keia-atlas/blob/main/docs/decisions/';
const siteUrl = (u) => (u?.startsWith(REPO_DECISIONS) ? href(`/about/decisions/${u.slice(REPO_DECISIONS.length).replace(/\.md$/, '')}/`) : u);

function readFolder(folder) {
  const out = {};
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name.startsWith('.')) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.yaml')) out[name.slice(0, -5)] = parse(readFileSync(full, 'utf8'));
    }
  };
  walk(path.join(DATA, folder));
  return out;
}

export const sites = readFolder('sites');
export const spaceTypes = readFolder('space-types');
export const classes = readFolder('device-classes');
export const models = readFolder('device-models');
const spacesRaw = readFolder('spaces');
const installs = readFolder('installs');

export const sources = {};
for (const file of Object.values(readFolder('sources'))) {
  for (const e of file.entries) sources[e.id] = { ...e, url: siteUrl(e.access?.find((a) => a.url)?.url) };
}

// Offices first, then the three remote sites (one per region), which hold the home offices (decision 0025).
export const SITE_ORDER = ['nyc', 'dub', 'lon', 'chi', 'tor', 'sin', 'mel', 'tyo', 'cph', 'jnu', 'rem', 'ram', 'rap'];
// Spare sits between procured and in service: a unit that has arrived and is kept in an IT store until a room needs it.
export const STAGES = ['plan', 'procure', 'spare', 'deploy', 'manage', 'retire'];
// A unit's status, in plain words, from its lifecycle stage (Keia's five stages underneath). A unit is
// only "installed" for part of its life, so the set of them is called Units (glossary: unit, lifecycle).
export const STAGE_LABEL = { plan: 'Ordered', procure: 'Procured', spare: 'Spare', deploy: 'Being installed', manage: 'In service', retire: 'Retired' };

export const className = (id) => classes[id]?.profile.name ?? id;
export const modelName = (id) => (models[id] ? `${models[id].manufacturer} ${models[id].model}` : id);
export const optionOf = (typeId, optionId) => spaceTypes[typeId]?.keia_atlas.options.find((o) => o.id === optionId);

// Spaces, joined with their install and option.
export const spaces = {};
for (const [id, s] of Object.entries(spacesRaw)) {
  const option = optionOf(s.space_type, s.option);
  const inst = installs[id] ?? { positions: [] };
  const byKey = new Map(option.equipment.map((e) => [e.key, e]));
  const positions = inst.positions.map((p) => {
    const key = p.position.replace(/^[a-z]+-\d+\//, '').replace(/#\d+$/, '');
    const e = byKey.get(key);
    const current = p.units.find((u) => !u.legacy);
    const legacy = p.units.find((u) => u.legacy);
    return { ...p, key, cls: e?.class, role: e?.role, equipment: e, current, legacy };
  });
  const stages = Object.fromEntries(STAGES.map((st) => [st, 0]));
  for (const p of positions) for (const u of p.units) stages[u.stage]++;
  const attention = [];
  if (positions.some((p) => p.legacy)) attention.push({ kind: 'replacement', text: 'A replacement is in progress' });
  if (stages.deploy && !positions.some((p) => p.legacy)) attention.push({ kind: 'deploy', text: 'Being fitted out' });
  // Older kit: devices from before today's standard. Still installed ones behave like positions of
  // their own (so they show in the inventory and the work plan); retired ones are history only.
  const older = (inst.older_kit ?? []).map((u, i) => {
    const cls = models[u.model]?.class;
    const year = u.installed.slice(0, 4);
    const unit = { serial: u.serial, asset_tag: u.asset_tag, stage: u.retired ? 'retire' : 'manage', installed: u.installed, retired: u.retired ?? null, notes: u.notes };
    return { position: `older-${i + 1}`, key: `older-${i + 1}`, model: u.model, cls, role: `${className(cls)} (${year})`, hostname: u.hostname, older: true, units: [unit], current: u.retired ? undefined : unit };
  });
  // Spare units: boxes on an IT store's shelves. Like older kit they are positions of their own (so a unit page
  // and the Units list can show them), but they are kept apart from the room's real positions so no drawing,
  // wiring or stage count sees them.
  const spareKit = (inst.spare_units ?? []).map((u, i) => {
    const cls = models[u.model]?.class;
    const unit = { serial: u.serial, asset_tag: u.asset_tag, stage: 'spare', installed: null, arrived: u.arrived, notes: u.notes };
    return { position: `spare#${i + 1}`, key: 'spare', model: u.model, cls, role: className(cls), spare: true, cabinet: u.cabinet, shelf: u.shelf, units: [unit], current: unit };
  });
  spaces[id] = { id, ...s, type: spaceTypes[s.space_type], option, fitted: inst.fitted ?? [], positions, spareKit, olderKit: older.filter((p) => !p.units[0].retired), retiredKit: older.filter((p) => p.units[0].retired), stages, attention, notes: [...(s.notes ?? []), ...(inst.notes ?? [])] };
}

export const KIND = (s) => {
  const t = s.space_type;
  if (t.startsWith('workstation')) return 'desks';
  if (t === 'remote-home') return 'kits';
  if (t === 'mdf' || t === 'idf') return 'comms';
  if (t === 'it-store') return 'stores';
  if (t === 'open-area') return 'open';
  if (t.startsWith('huddle-room') || t === 'focus-room' || t === 'office') return 'small';
  if (['reception-concierge', 'cafeteria', 'pantry', 'pantry-expanded', 'copy-print-room'].includes(t)) return 'shared';
  return 'meeting';
};
export const KIND_LABEL = { meeting: 'Meeting rooms', small: 'Huddle rooms, focus rooms and offices', shared: 'Shared rooms', desks: 'Desks', kits: 'Home offices', comms: 'Comms rooms', stores: 'IT stores', open: 'Open areas and corridors' };

// Per-site rollups.
export const siteStats = {};
for (const sid of SITE_ORDER) {
  const list = Object.values(spaces).filter((s) => s.site === sid);
  const stages = Object.fromEntries(STAGES.map((st) => [st, 0]));
  let rooms = 0, desks = 0, kits = 0, units = 0;
  for (const s of list) {
    const k = KIND(s);
    if (k === 'desks') desks += s.count ?? 1; else if (k === 'kits') kits += s.count ?? 1; else rooms++;
    for (const st of STAGES) stages[st] += s.stages[st];
    units += s.positions.reduce((n, p) => n + p.units.length, 0);
  }
  siteStats[sid] = { spaces: list, rooms, desks, kits, units, stages, attention: list.filter((s) => s.attention.length) };
}

// Where each model is used.
export const usedIn = {};
for (const s of Object.values(spaces)) {
  for (const p of [...s.positions, ...s.olderKit]) {
    if (!p.model) continue;
    const u = (usedIn[p.model] ??= { units: 0, spaces: new Set(), sites: new Set() });
    u.units += p.units.length; u.spaces.add(s.id); u.sites.add(s.site);
  }
}
export const typesUsing = {};
for (const [tid, t] of Object.entries(spaceTypes)) {
  for (const o of t.keia_atlas.options) for (const e of o.equipment) if (e.model) (typesUsing[e.model] ??= new Set()).add(tid);
}

export const totals = {
  sites: SITE_ORDER.length,
  offices: SITE_ORDER.filter((id) => sites[id]?.kind === 'office').length,
  spaces: Object.keys(spaces).length,
  units: Object.values(siteStats).reduce((n, s) => n + s.units, 0),
  models: Object.keys(models).length,
  types: Object.keys(spaceTypes).length,
  stages: Object.fromEntries(STAGES.map((st) => [st, Object.values(siteStats).reduce((n, s) => n + s.stages[st], 0)])),
};

export const LOC_LABEL = {
  'behind-display': 'Behind the display', 'below-table': 'Below the table', 'table-top': 'On the desk', 'wall-below-table': 'Wall, below the table',
  'wall-behind-storage': 'Wall, behind storage', 'floor-box': 'Floor box', 'room-entrance': 'At the door', ceiling: 'Ceiling', 'display-wall': 'Display wall',
  wall: 'Wall', 'data-closet': 'Data closet', tbd: 'Set per project',
};
export const CONNECTOR_LABEL = {
  hdmi: 'HDMI', displayport: 'DisplayPort', vga: 'VGA', 'usb-a': 'USB-A', 'usb-b': 'USB-B', 'usb-c': 'USB-C', 'micro-usb': 'Micro-USB', rj45: 'RJ45', rj11: 'RJ11',
  sfp: 'SFP', 'sfp-plus': 'SFP+', '3.5mm': '3.5 mm', '6.35mm': '6.35 mm', xlr: 'XLR', 'terminal-block': 'Terminal block', db9: 'DB9', 'dc-barrel': 'DC barrel',
  'iec-c14': 'IEC C14', 'iec-c8': 'IEC C8', 'iec-c6': 'IEC C6', proprietary: 'Proprietary', 'not-stated': 'Not stated',
};
export const OS_LABEL = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };

// Colour token for a port, by what it carries.
export function portColour(p) {
  const s = p.signals ?? [];
  if (s.includes('hdbaset')) return 'var(--c-hdbt)';
  if (['hdmi', 'displayport', 'vga'].includes(p.connector)) return 'var(--c-hdmi)';
  if (s.includes('poe')) return 'var(--c-poe)';
  if (['usb-a', 'usb-b', 'usb-c', 'micro-usb'].includes(p.connector)) return 'var(--c-usb)';
  if (['rj45', 'sfp', 'sfp-plus'].includes(p.connector)) return 'var(--c-lan)';
  if (s.length === 1 && s[0] === 'power') return 'var(--c-power)';
  if (s.some((x) => ['audio', 'microphone', 'speaker-level'].includes(x))) return 'var(--c-audio)';
  return 'var(--grey)';
}


const REGION_NAMES = new Intl.DisplayNames(['en-IE'], { type: 'region' });
export const countryName = (code) => (code === 'US' ? 'United States' : REGION_NAMES.of(code));
export const REGION_LABEL = { amer: 'Americas', emea: 'Europe, Middle East and Africa', apac: 'Asia Pacific' };
export const plural = (n, one, many = `${one}s`) => `${n.toLocaleString('en-IE')} ${n === 1 ? one : many}`;

// House status words, over Keia's five lifecycle stages underneath.
export const DEVICE_STATUS = { plan: 'Planned', procure: 'Planned', spare: 'Spare', deploy: 'Installing', manage: 'In service', retire: 'Retiring' };
export const UNIT_STATUS = STAGE_LABEL;   // one set of words for a unit's status, everywhere

// Projects (stage 3, demo data): delivery work at a site.
export const projects = readFolder('projects');
// Six phases (decision 0025): Install and Commission became one phase, Deploy, which holds four
// steps for each device. A playbook may skip phases; a project shows only its playbook's phases.
export const PHASES = ['plan', 'design', 'procure', 'integrate', 'handover', 'closed'];
export const PHASE_LABEL = { plan: 'Plan', design: 'Design', procure: 'Procure', integrate: 'Deploy', handover: 'Hand over', closed: 'Closed' };
// Every phase a project works through before it is closed (for rails and gantts that stop at handover).
export const OPEN_PHASES = PHASES.filter((p) => p !== 'closed');
// Old phase names, so saved links, browser storage and filters from before 0025 still land somewhere.
export const OLD_PHASE = { install: 'integrate', commission: 'integrate' };
export const phaseId = (p) => OLD_PHASE[p] ?? p;
export const INTEGRATE_STEPS = ['provision', 'install', 'configure', 'commission'];
export const STEP_LABEL = { provision: 'Provision', install: 'Install', configure: 'Configure', commission: 'Commission' };
// The phases a project goes through: its playbook's, in order, or all six without a playbook. The
// project's own phase is always included, so a project is never on a phase its rail cannot show.
export const phasesOf = (project) => {
  const pb = project?.playbook ? playbooks[project.playbook] : null;
  const own = new Set([...(pb?.phases ?? []).map((ph) => ph.phase), ...(project?.history ?? []).map((h) => h.phase), project?.phase].filter(Boolean));
  return pb ? PHASES.filter((p) => own.has(p)) : PHASES;
};
export const TASK_STATUS = { todo: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done' };
export const TEAM_LABEL = { 'av-it': 'AV and IT', 'it-network': 'IT network', facilities: 'Facilities', 'it-security': 'IT security', procurement: 'Procurement', vendor: 'Vendor' };
export const NOTHING_NEW = { 'guide-was-right': 'Nothing new: the guide was right', 'not-device-related': 'Nothing new: not device related', 'one-off': 'Nothing new: a one-off' };

// Keia's vocabulary says "space"; the console says "room" (decision 0019). Use when showing Keia text.
export const roomWords = (t) => String(t).replace(/\bspace types?\b/gi, (m) => m.replace(/space/i, (x) => (x[0] === 'S' ? 'Room' : 'room'))).replace(/\bspaces?\b/gi, (m) => m.replace(/space/i, (x) => (x[0] === 'S' ? 'Room' : 'room')));

// Playbooks, Lab tests and incidents (demo data).
export const playbooks = readFolder('playbooks');
export const labTests = readFolder('lab');
// Incidents keep what they are about in `subject` (decision 0024). `room`, `position` and `device` are
// copied to the top for the pages that only need the room or position; position and device are null
// for an incident about a whole room.
export const incidents = Object.fromEntries(Object.entries(readFolder('incidents')).map(([k, i]) => [k,
  { ...i, room: i.subject.room, position: i.subject.position ?? null, device: i.subject.device ?? null }]));
export const incidentPath = (number) => `/incidents/${number.toLowerCase()}/`;
export const INTENSITY = { light: 'Light', medium: 'Medium', heavy: 'Heavy' };
export const PROJECT_KIND = { refresh: 'AV refresh', 'infra-refresh': 'Comms room refresh', 'fit-out': 'New office', upgrade: 'Upgrade', 'custom-design': 'Custom design', 'workplace-refresh': 'Workplace IT refresh', 'network-refresh': 'Network refresh', rma: 'RMA', provision: 'Provision new devices', 'firmware-rollout': 'Firmware rollout', 'home-kit': 'Home and remote kit', decommission: 'Move out and decommission' };
export const LAB_STATUS = { queued: 'Queued', testing: 'Testing', passed: 'Passed', failed: 'Failed', adopted: 'In the standard' };
export const INC_STATE = { new: 'New', 'in-progress': 'In progress', 'on-hold': 'On hold', resolved: 'Resolved' };
export const fmtDate = (d, o = { day: 'numeric', month: 'short', year: 'numeric' }) => (d ? new Date(d).toLocaleDateString('en-IE', o) : '');
// The demo's "today", so dates in the made-up data read sensibly whenever the site is built.
export const DEMO_TODAY = '2026-09-28';
export const findTask = (tid) => {
  for (const p of Object.values(projects)) { const t = p.tasks.find((x) => x.id === tid); if (t) return { project: p, task: t }; }
  return null;
};
export const plans = readFolder('plan');

// Firmware, advisories, model choices and configurations: what anyone installing, updating or
// troubleshooting a model needs to know, cited.
export const firmwareLines = readFolder('firmware');
export const advisories = readFolder('advisories');
export const modelChoices = Object.fromEntries(Object.values(readFolder('model-choices')).map((c) => [c.model, c]));
export const configurations = readFolder('configurations');
export const firmwareFor = (model) => Object.values(firmwareLines).find((f) => f.models.includes(model)) ?? null;
export const standardFirmware = (model) => firmwareFor(model)?.releases.find((r) => r.status === 'standard') ?? null;
export const configFor = (model) => Object.values(configurations).find((c) => c.models.includes(model)) ?? null;
export const advisoriesFor = (model) => Object.values(advisories).filter((a) => a.models.includes(model) && a.status !== 'closed')
  .sort((a, b) => ADV_ORDER.indexOf(a.level) - ADV_ORDER.indexOf(b.level) || b.date.localeCompare(a.date));
export const ADV_ORDER = ['do-not-install', 'act', 'check', 'info'];
export const ADV_LEVEL = { 'do-not-install': 'Do not install', act: 'Action needed', check: 'Check', info: 'Good to know' };
export const FW_STATUS = { standard: 'Standard', lab: 'In the Lab', blocked: 'Do not install', superseded: 'Superseded', available: 'Available' };
export const MODEL_STATUS = { standard: 'In the standard', legacy: 'Legacy', candidate: 'Candidate', 'under-review': 'Under review' };
export const LAYER_LABEL = { profile: 'Profile default', model: 'Model', country: 'Country', 'naming-network': 'Naming and network', 'room-type': 'Room profile', exception: 'Exception' };
export const src = (id) => (id ? sources[id] ?? null : null);

// Comms rooms and racks. A room reaches the internet through its floor's IDF (or the MDF when the
// MDF is on the same floor) and then the site's MDF.
export const racks = readFolder('racks');
export const rackGear = readFolder('rack-gear');
export const rackFor = (spaceId) => Object.values(racks).find((r) => r.space === spaceId) ?? null;
export const commsRooms = Object.values(spaces).filter((s) => ['mdf', 'idf'].includes(s.space_type));
export function networkPath(space) {
  const onSite = commsRooms.filter((c) => c.site === space.site);
  const mdf = onSite.find((c) => c.space_type === 'mdf') ?? null;
  const idf = onSite.find((c) => c.space_type === 'idf' && c.floor === space.floor) ?? (mdf && mdf.floor === space.floor ? mdf : null);
  return { mdf, idf };
}
export const vendors = readFolder('vendors');
export const VENDOR_KIND = { integration: 'Integration', service: 'Service and maintenance', manufacturer: 'Manufacturer' };

// The name people use for a device: where it is and what it does ("Curlew video bar", "Reception
// signage player"). Hostnames stay for systems; this is for finding it.
export const deviceName = (s, p, { site = false } = {}) => {
  let role = (p.role ?? className(p.cls) ?? p.key).replace(/:.*$/, '');
  // Long descriptive roles ("chooses between the laptop inputs") read badly in a name: use the kind.
  if (role.length > 30 || /[,;]/.test(role) || !/^[A-Z]/.test(role)) role = className(p.cls) ?? role;
  const n = p.position?.includes('#') ? ` ${p.position.split('#')[1]}` : '';
  const room = s.name;
  const r = /^[A-Z][a-z]/.test(role) ? role.charAt(0).toLowerCase() + role.slice(1) : role;
  return `${site ? `${sites[s.site].name}, ` : ''}${room} ${r}${n}`;
};
