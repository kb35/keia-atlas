// Services: the three services the team runs, and which kit,
// which systems and which people belong to each. This file is the pure part (no data is loaded), so the rules can
// be tested on small inputs (tests/services.test.mjs). src/lib/services-view.mjs wires it to the site's data.
//
//   AV               room AV (video bars, codecs, displays, touch controllers, scheduler panels, signage, switchers,
//                    audio) and the Netgear AV Line switch inside a room. Owner: Sofia Reyes (service manager, AV).
//   Network          gateways, switches, access points, Wi-Fi controllers, internet circuits and the home gateways. Owner: Declan
//                    Moore (service manager, IT infrastructure), with the network engineers Marco Bianchi and Farah Idris.
//   IT infrastructure comms rooms and racks, UPS and power strips, out-of-band consoles, fibre and cabling links,
//                    spares. Owner: Declan Moore.
//
// Live figures run on the same simulation as the Rooms and Devices overviews (src/lib/livesim.mjs). Real feeds
// replace it at stage 2; a service page does not change.
import { prepare } from './livesim.mjs';

export const SERVICE_ORDER = ['av', 'network', 'infrastructure'];
export const SERVICES = {
  av: {
    id: 'av', name: 'AV', title: 'AV service', owner: 'sofia', path: '/services/av/',
    lede: 'Meeting rooms, video, screens and audio: are they working, and are they on the standard?',
    roles: ['sm-av', 'innovation', 'delivery', 'tech'],
    systems: ['Poly Lens', 'Logitech Sync', 'Netgear AV Line web interface', 'Room booking'],
    place: 'the AV service',
  },
  network: {
    id: 'network', name: 'Network', title: 'Network', owner: 'declan', path: '/services/network/',
    lede: 'Offices online, internet circuits, switches, access points, Wi-Fi controllers and every home gateway.',
    roles: ['sm-infra', 'network'],
    systems: ['UniFi Network', 'UniFi Site Manager', 'Switch and firewall management'],
    place: 'the network',
  },
  infrastructure: {
    id: 'infrastructure', name: 'IT infrastructure', title: 'IT infrastructure', owner: 'declan', path: '/services/infrastructure/',
    lede: 'Comms rooms, racks, power, out-of-band access and the links between them.',
    roles: ['sm-infra', 'network', 'tech'],
    systems: ['UPS management cards', 'Power strip web interface', 'Out-of-band console servers'],
    place: 'IT infrastructure',
  },
};

// ---- Which service owns what ---------------------------------------------------------------------------------
// Device classes (data/device-classes). Printers and security devices belong to no service here.
export const AV_CLASSES = ['video-bar', 'codec', 'desk-video-device', 'display', 'monitor', 'touch-controller', 'scheduler-panel', 'signage-player', 'av-switcher', 'av-extender', 'camera', 'microphone', 'loudspeaker', 'amplifier', 'dock', 'adapter'];
export const NETWORK_CLASSES = ['network-gateway', 'wireless-access-point'];
// The switch class is used twice: the Netgear AV Line switch inside a room is AV; a switch in a comms room is network.
export function serviceOfClass(cls, roomKind) {
  if (cls === 'network-switch') return roomKind === 'comms' ? 'network' : 'av';
  if (AV_CLASSES.includes(cls)) return 'av';
  if (NETWORK_CLASSES.includes(cls)) return 'network';
  return null;
}
// Rack gear kinds (data/rack-gear).
export const GEAR_SERVICE = {
  'access-switch': 'network', 'core-switch': 'network', switch: 'network', firewall: 'network', wlc: 'network', isp: 'network',
  ups: 'infrastructure', battery: 'infrastructure', pdu: 'infrastructure', oob: 'infrastructure', rack: 'infrastructure',
  'fibre-panel': 'infrastructure', 'patch-panel': 'infrastructure', 'cable-manager': 'infrastructure', shelf: 'infrastructure', blank: 'infrastructure', reserved: 'infrastructure',
};
export const serviceOfGear = (kind) => GEAR_SERVICE[kind] ?? null;
// The systems a service reads its live figures from (stage 2).
export const SYSTEM_SERVICE = {
  'Poly Lens': 'av', 'Logitech Sync': 'av', 'Netgear AV Line web interface': 'av', 'Room booking': 'av',
  'UniFi Network': 'network', 'UniFi Site Manager': 'network', 'Switch and firewall management': 'network',
  'UPS management cards': 'infrastructure', 'Power strip web interface': 'infrastructure', 'Out-of-band console servers': 'infrastructure',
};
export const serviceOfSystem = (name) => SYSTEM_SERVICE[name] ?? null;

// Which projects touch which service, by the project's kind (data/projects).
const PROJECT_KIND_SERVICES = {
  refresh: ['av'], 'workplace-refresh': ['av'], 'custom-design': ['av'], upgrade: ['av'], rma: ['av'], 'firmware-rollout': ['av'],
  'network-refresh': ['network', 'infrastructure'],
  'fit-out': ['av', 'network', 'infrastructure'], 'infra-refresh': ['network', 'infrastructure'], 'home-kit': ['network'],
};
export const servicesOfProject = (kind) => PROJECT_KIND_SERVICES[kind] ?? [];

// ---- Simulated health for kit the Devices overview does not track ---------------------------------------------
// [chance of dropping offline in an hour, chance of an alert in two hours, the alerts it can raise]. These are made
// up and higher than real kit, so a demo shows a fault or two now and then. livesim.prepare() gives every unit the
// figures of its class; this replaces them for the classes below.
export const SIM_KIND = {
  ups: [0.02, 0.32, ['On battery power', 'Battery needs replacing', 'Load near its limit', 'Running hot']],
  pdu: [0.015, 0.28, ['Load near its limit on one phase', 'An outlet bank has tripped', 'Running hot']],
  oob: [0.03, 0.26, ['Cellular link weak', 'Console port not responding', 'Not reporting to monitoring']],
  link: [0.015, 0.24, ['Light level low', 'Errors rising', 'Link flapping']],
  circuit: [0.02, 0.3, ['Latency high', 'Packet loss', 'Running on the backup path']],
  wlc: [0.015, 0.28, ['Access points slow to join', 'Licence expiring', 'Running hot']],
  'home-gateway': [0.12, 0.1, ['Signal from the internet provider is weak', 'Wi-Fi channel crowded', 'Update waiting to install']],
  'network-gateway': [0.012, 0.09, ['Uplink flapping', 'High CPU', 'Running hot', 'Not reporting to monitoring']],
};
// Adds seeds and rates to the model's units; a class with its own figures in SIM_KIND gets those. Safe to call twice.
export function prepareServiceModel(model) {
  const ready = model.__svc;
  prepare(model);
  if (ready) return model;
  for (const u of model.units) {
    const s = SIM_KIND[u.cls]; if (!s) continue;
    const k = u.old ? 2 : 1;
    u.pDown = s[0] * k; u.pAlert = s[1] * k; u.alerts = s[2];
  }
  model.__svc = true;
  return model;
}

// ---- Counting ------------------------------------------------------------------------------------------------
// Things that count for a service: not marked `x` (kept in the model only so room indexes still line up).
export const counted = (u) => !u.x;
export function tally(model, snap, pick = () => true) {
  const n = { online: 0, alert: 0, offline: 0, all: 0, fw: 0 };
  model.units.forEach((u, i) => { if (!counted(u) || !pick(u, i)) return; n[snap.units[i].st]++; n.all++; if (u.fw) n.fw++; });
  return n;
}
// The light for a group: red when several are offline (and at least one in fifty) or one in ten has a fault, amber for
// any fault, green when all is well.
export function lightOf(n) {
  if (!n.all) return 'none';
  const bad = n.offline + n.alert;
  if ((n.offline >= 3 && n.offline / n.all >= 0.02) || bad / n.all >= 0.1) return 'bad';
  return bad ? 'warn' : 'good';
}
export const LIGHT_WORDS = { good: 'All well', warn: 'To review', bad: 'Needs action', none: 'Nothing to show' };

// An office is online when none of its gateways is offline and at least one of its circuits is not offline
// (offices with no circuits recorded need only their gateways).
export function officesOnline(model, snap, sites) {
  let up = 0, total = 0;
  sites.forEach((s, si) => {
    if (s.remote) return;
    const mine = model.units.map((u, i) => ({ u, st: snap.units[i].st })).filter((x) => x.u.site === si && counted(x.u));
    if (!mine.length) return;
    total++;
    const gw = mine.filter((x) => x.u.k === 'gateway'), circ = mine.filter((x) => x.u.k === 'circuit');
    if (gw.some((x) => x.st === 'offline')) return;
    if (circ.length && circ.every((x) => x.st === 'offline')) return;
    up++;
  });
  return { up, total };
}

// ---- Comms rooms against the standard --------------------------------------------------------------------------
// rack: a rack from data/racks; gear: data/rack-gear by id. The five checks and the space left.
export const SPACE_SHORT_U = 6;
export function commsChecks(rack, gear = {}) {
  const items = rack.items ?? [];
  const has = (kind) => items.some((i) => i.kind === kind);
  const feeds = new Set((rack.side_pdus ?? []).map((p) => p.feed));
  const switches = items.filter((i) => ['switch', 'firewall', 'wlc'].includes(i.kind));
  const onStandard = switches.length > 0 && switches.every((i) => Boolean(gear[i.gear]?.standard));
  const used = items.filter((i) => !['blank', 'reserved'].includes(i.kind)).reduce((a, i) => a + (i.size ?? 1), 0);
  const free = (rack.height_u ?? 0) - used;
  const checks = [
    { id: 'ups', label: 'UPS in the rack', ok: has('ups') },
    { id: 'feeds', label: 'Two power feeds, A and B', ok: feeds.has('A') && feeds.has('B') },
    { id: 'oob', label: 'Out-of-band console', ok: has('oob') },
    { id: 'fibre', label: 'Fibre patch panel', ok: has('fibre-panel') },
    { id: 'switches', label: 'Switches on the house standard', ok: onStandard },
  ];
  return { checks, free, short: free < SPACE_SHORT_U, toStandard: checks.every((c) => c.ok), failed: checks.filter((c) => !c.ok) };
}

// ---- Words -----------------------------------------------------------------------------------------------------
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Search entries in the main search index's shape [kind, url, title, detail, extra words, facets] (search-index.mjs
// takes rows like these). Kind 'svc' needs a group in search-query.mjs; until then nothing merges them.
export function searchItems() {
  return SERVICE_ORDER.map((id) => {
    const s = SERVICES[id];
    return ['svc', `services/${id}/`, s.title, `Service · ${s.lede}`, `service ${s.name} ${s.systems.join(' ')} fleet firmware health owner`, {}];
  }).concat([['svc', 'services/', 'Services', 'The AV service, the network and IT infrastructure side by side', 'services overview fleet health', {}]]);
}
