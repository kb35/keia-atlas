#!/usr/bin/env node
// One-off migration: data/switch-ports/<site>.yaml for every office with floor plans.
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once the files
// exist (delete them first to regenerate; everything below comes back the same).
//
// What it writes, per office, in NetBox's names (docs/connectors/netbox-ports.md):
//   - The VLAN group: every VLAN in the network standard's plan with its role and a made-up prefix and gateway in
//     private space, 10.<site>.<VLAN>.0/24 (site number from the demo's site order: New York 10, Dublin 20 and so
//     on), Corporate a /22 and Guest a /23 for the Wi-Fi clients, with the range DHCP reservations come from and the
//     pool. The AV VLAN is link-local in each room and has no gateway.
//   - The groups: a Catalyst core pair as one virtual chassis (StackWise Virtual), and the firewalls as an HA pair.
//   - The addresses: each networked unit's address in its VLAN's prefix, in order of hostname (switches static from
//     .2, everything else a DHCP reservation from .20), its MAC (made up from its serial, locally administered: 02:)
//     and its DNS name.
//   - Every switch: the comms room switches (rack items) and the in-room AV switches (units in the spaces). Its id is
//     its unit's hostname; a rack switch with no unit recorded (a second access switch, say) gets one after the
//     hostname rule from its comms room's number and the number in its label.
//   - Every interface a patch cord or a room cable reaches, with its cable trace (the cables in order, and the device
//     and interface at the end), from src/lib/switchcore.mjs farEnds(): the same walk the checks do. How each port is
//     recorded follows the plan (data/house-values vlans): an access port on the device's VLAN; a trunk managed on
//     VLAN 10 to an access point (staff and guest Wi-Fi tagged), to an in-room switch (Room systems tagged, never AV)
//     and between switches and firewalls (every routed VLAN). An outlet with nothing plugged in is parked (enabled:
//     false, with its cables); a port nothing reaches is disabled. On an in-room switch, a device's second port and
//     the IP microphones sit on the AV VLAN, kept in the room. Access ports admit their device as the standard's
//     802-1x rule says: 802.1X at a desk, the MAC address against the record (MAB) for a room device.
//   - Four drift findings: the switch platform reports something other than the record (seen), the way a real
//     estate drifts, so the pages have something to show:
//       dub-309-dsp02 (3.09 Whooper Swan, display 2): planned 31 Displays and signage, seen 20 Corporate;
//       dub-404-sch01 (4.04's booking panel): planned 30 Room systems, seen VLAN 1, the switch default;
//       nyc-2004-sw01's uplink: planned tagged 30, seen tagged 30 and 40, the AV VLAN leaving the room;
//       nyc-2013-prn01 (the Level 20 printer): planned 70 Printers, seen 20 Corporate.
// Everything is made up for the demo.
//
// Run from the repository root:  node tools/migrations/2026-09-30-switch-ports.mjs

import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { loadRaw, buildingModel, sitesWithFloors } from '../../src/lib/floors.mjs';
import { switchesOf, hostnameFor, farEnds, vlanPlan, classVlans, routedVlans, platformOf, readHouse, rangeText, AV_VLAN, connectedOf } from '../../src/lib/switchcore.mjs';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'data', 'switch-ports');
if (existsSync(path.join(OUT, 'dub.yaml'))) {
  console.log('Already run: data/switch-ports/ exists.');
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });

const SITE_ORDER = ['nyc', 'dub', 'lon', 'chi', 'tor', 'sin', 'mel', 'tyo', 'cph', 'jnu'];
const SEEN_AT = '2026-09-30T06:00:00Z';
const raw = loadRaw(ROOT);
const HOUSE = readHouse(ROOT);
const plan = vlanPlan(raw.standards.network);
const byClass = classVlans(HOUSE);
const ROUTED = routedVlans(plan);
const WIFI = [20, 90];
const AV_CLASSES = new Set(['av-switcher', 'av-extender', 'amplifier', 'loudspeaker', 'codec', 'camera', 'microphone']);
const DESK = new Set(['monitor', 'dock', 'adapter']);
const vlanFor = (cls) => byClass.get(cls) ?? (AV_CLASSES.has(cls) ? 30 : 20);
const classDir = path.join(ROOT, 'data', 'device-classes');
const NETWORKED = new Set(readdirSync(classDir).filter((n) => n.endsWith('.yaml')).map((n) => [n.slice(0, -5), parse(readFileSync(path.join(classDir, n), 'utf8'))]).filter(([, c]) => c.platforms?.dhcp_dns).map(([id]) => id));

// The drift findings: [site, how to find the port, what the switch platform reports instead].
const FINDINGS = [
  ['dub', (sw, f) => f.unit?.host === 'dub-309-dsp02', { untagged_vlan: 20 }],
  ['dub', (sw, f) => f.unit?.host === 'dub-404-sch01', { untagged_vlan: 1 }],
  ['nyc', (sw, f) => sw.id === 'nyc-2004-sw01' && f.kind === 'uplink', { tagged_vlans: [30, AV_VLAN] }],
  ['nyc', (sw, f) => f.unit?.host === 'nyc-2013-prn01', { untagged_vlan: 20 }],
];

const flow = (o) => `{ ${Object.entries(o).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : typeof v === 'object' ? flow(v) : /[:#,\[\]{}]/.test(String(v)) ? `"${v}"` : v}`).join(', ')} }`;
const sortPorts = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en', { numeric: true }));
const spaceName = (id) => { const s = raw.spaces[id]; return s ? `${s.number ? `${s.number} ` : ''}${s.name}` : id; };
const words = (p) => p.replace(/^[a-z]+-\d+\//, (m) => `${m.replace('desk-', 'desk ').replace('/', '')}, `).replace(/#(\d+)/, ' $1').replace(/-/g, ' ');
const h = (str) => [...String(str)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const hex = (v) => (v & 255).toString(16).padStart(2, '0').toUpperCase();
const macOf = (seed) => { const n = h(seed); return ['02', hex(n), hex(n >> 8), hex(n >> 16), hex(n >> 24), hex(n >> 4)].join(':'); };
// Every unit at the site by asset tag: its hostname, serial and class.
const unitsOf = (site) => {
  const out = new Map();
  for (const [id, inst] of Object.entries(raw.installs)) {
    if (raw.spaces[id]?.site !== site) continue;
    const type = raw.types[raw.spaces[id].space_type];
    const opt = type?.keia_atlas?.options.find((o) => o.id === raw.spaces[id].option);
    for (const p of inst.positions ?? []) {
      const u = p.units.find((x) => !x.legacy); if (!u) continue;
      const eq = opt?.equipment.find((e) => e.key === p.position.replace(/^[a-z]+-\d+\//, '').split('#')[0]);
      const model = u.model ?? p.model ?? eq?.model ?? null;
      out.set(u.asset_tag, { host: p.hostname ?? null, serial: u.serial, cls: raw.models[model]?.class ?? eq?.class ?? null });
    }
  }
  return out;
};

let findings = 0;
for (const site of sitesWithFloors(ROOT).sort((a, b) => SITE_ORDER.indexOf(a) - SITE_ORDER.indexOf(b))) {
  const M = buildingModel(raw, site);
  const F = farEnds(M);
  const S = (SITE_ORDER.indexOf(site) + 1) * 10;
  const UNITS = unitsOf(site);
  // Comms room switches first (core, then access, by hostname), then the in-room switches by hostname.
  const rank = (s) => (s.where === 'room' ? 2 : /core/i.test(s.label) ? 0 : 1);
  const sws = switchesOf(M).sort((a, b) => rank(a) - rank(b) || hostnameFor(M, a).localeCompare(hostnameFor(M, b)));
  const idOf = new Map(sws.map((s) => [s.key, hostnameFor(M, s)]));

  // The VLAN group, with the address plan: .1 the gateway, .2 to .19 static for network kit, .20 to .219 DHCP
  // reservations for devices, .220 up the pool.
  const vlans = plan.map((v) => {
    const role = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (!v.routed) return { vid: v.vlan, role, prefix: '169.254.0.0/16', note: 'Link-local in each room, on the in-room switch only; not routed' };
    const n = `10.${S}.${v.vlan}`;
    if (v.vlan === 20) return { vid: 20, role, prefix: `${n}.0/22`, gateway: `${n}.1`, reserved: `${n}.20-${n}.219`, pool: `10.${S}.21.1-10.${S}.23.254` };
    if (v.vlan === 90) return { vid: 90, role, prefix: `${n}.0/23`, gateway: `${n}.1`, pool: `${n}.20-10.${S}.91.254` };
    return { vid: v.vlan, role, prefix: `${n}.0/24`, gateway: `${n}.1`, reserved: `${n}.20-${n}.219`, pool: `${n}.220-${n}.254` };
  });

  // Groups: the core pair runs as one switch (Catalyst StackWise Virtual) and the firewalls as an HA pair.
  const groups = [];
  for (const rk of M.racks) {
    const items = M._racks[rk.id].items;
    const tagAt = (it) => raw.installs[rk.space]?.positions.find((p) => p.position === it.position)?.units.find((x) => !x.legacy)?.asset_tag;
    const cores = items.filter((it) => /^core-switch#/.test(it.position ?? '') && /^cisco-/.test(it.gear ?? ''));
    if (cores.length === 2) groups.push({ id: idOf.get(`${rk.id}:${cores[0].u}`).replace(/cs0\d$/, 'core'), kind: 'virtual-chassis', name: 'Core switches, one virtual chassis (StackWise Virtual)', members: cores.map((it) => idOf.get(`${rk.id}:${it.u}`)).sort() });
    const fws = items.filter((it) => /^firewall#/.test(it.position ?? '') && tagAt(it));
    if (fws.length === 2) groups.push({ id: cores.length ? idOf.get(`${rk.id}:${cores[0].u}`).replace(/cs0\d$/, 'fw') : `${site}-fw`, kind: 'ha-pair', name: 'Firewalls A and B, an active and passive pair', members: fws.map(tagAt).sort() });
  }

  // The switches and their interfaces.
  const blocks = [];
  const wants = [];   // [vlan, device, interface, static] for the addresses
  for (const sw of sws) {
    const id = idOf.get(sw.key);
    const far = F.get(sw.key);
    const room = sw.where === 'rack' ? `${spaceName(sw.space)}, ${M.racks.find((r) => r.id === sw.rack)?.name ?? sw.rack}, U${sw.u}` : spaceName(sw.space);
    const lines = [`  # ${sw.label} · ${room}`, `  - id: ${id}`];
    if (sw.where === 'rack') lines.push(`    rack: ${sw.rack}`, `    u: ${sw.u}`);
    else lines.push(`    space: ${sw.space}`, `    position: ${sw.position}`);
    lines.push(`    platform: ${platformOf(sw.gear ?? sw.model ?? '')}`);
    if (sw.where === 'rack') wants.push([10, sw.tag ?? id, null, true, id]);
    // Which unit ports already reach the network another way (for a device's second port on an in-room switch).
    const direct = new Set();
    if (sw.where === 'room') for (const [, ports] of F) for (const [, f] of ports) if (f.kind === 'outlet') for (const u of f.units) if (!u.via.length) direct.add(u.tag);
    const seen = new Set(), used = [], rows = [];
    for (const [port, f] of [...far].sort((a, b) => sortPorts(a[0], b[0]))) {
      let row = null, why = '';
      if (f.kind === 'outlet') {
        const at = f.ap ? `access point ${f.ap}` : `${spaceName(f.space)}, ${f.outlet.split(':')[1]}`;
        if (!f.unit) { row = { name: port, enabled: false }; why = `${at}, nothing plugged in`; }
        else {
          const u = f.unit;
          row = u.cls === 'network-switch' ? { name: port, enabled: true, mode: 'tagged', untagged_vlan: 10, tagged_vlans: [30] }
            : u.cls === 'wireless-access-point' ? { name: port, enabled: true, mode: 'tagged', untagged_vlan: 10, tagged_vlans: WIFI }
            : { name: port, enabled: true, mode: 'access', untagged_vlan: vlanFor(u.cls), auth: DESK.has(u.cls) ? 'dot1x' : 'mab' };
          if (u.cls === 'network-switch') wants.push([10, u.tag, null, false]);
          else if (u.cls === 'wireless-access-point') wants.push([10, u.tag, u.port, false]);
          else if (row.untagged_vlan !== AV_VLAN) wants.push([row.untagged_vlan, u.tag, u.port, false]);
          why = f.ap ? `access point ${u.host}` : `${spaceName(u.space)}, ${words(u.position)}${u.via.length ? ` (through the ${words(u.via[u.via.length - 1])})` : ''}`;
        }
      } else if (f.kind === 'switch') {
        row = { name: port, enabled: true, mode: 'tagged', untagged_vlan: 10, tagged_vlans: ROUTED };
        why = `${sw.label.startsWith('Core') && !/core/i.test(sws.find((x) => x.key === f.key)?.label ?? '') ? 'trunk down to' : 'trunk to'} ${idOf.get(f.key)}`;
      } else if (f.kind === 'item') {
        row = { name: port, enabled: true, mode: 'tagged', untagged_vlan: 10, tagged_vlans: f.itemKind === 'wlc' ? WIFI : ROUTED };
        why = f.label;
      } else if (f.kind === 'uplink') {
        row = { name: port, enabled: true, mode: 'tagged', untagged_vlan: 10, tagged_vlans: [30] };
        why = `uplink to ${idOf.get(f.key)} port ${f.port}`;
      } else if (f.kind === 'unit' && f.unit) {
        const u = f.unit;
        const second = seen.has(u.tag) || direct.has(u.tag);
        seen.add(u.tag);
        const native = u.cls === 'microphone' || second ? AV_VLAN : vlanFor(u.cls);
        row = { name: port, enabled: true, mode: 'access', untagged_vlan: native, auth: 'mab' };
        if (native !== AV_VLAN) wants.push([native, u.tag, u.port, false]);
        why = `${words(u.position)}${native === AV_VLAN ? ', AV network in the room' : ''}`;
      }
      if (!row) { console.warn(`${site} ${id} port ${port}: ${f.kind}, left out`); continue; }
      row.connected = connectedOf(f, idOf);
      for (const [s, hit, drift] of FINDINGS) if (s === site && hit({ id }, f)) { row.seen = { ...drift, at: SEEN_AT }; findings++; why += `; the switch reports otherwise`; }
      used.push(port);
      rows.push(`      - ${flow(row)}  # ${why}`);
    }
    lines.push('    interfaces:', ...rows);
    if (sw.where === 'rack') {
      const n = Math.max(sw.ports, ...used.filter((p) => typeof p === 'number'));
      const off = []; for (let p = 1; p <= n; p++) if (!used.includes(p)) off.push(p);
      if (off.length) lines.push(`    disabled: "${rangeText(off)}"`);
    } else {
      const off = sw.ports.filter((p) => !used.includes(p));
      if (off.length) lines.push(`    disabled: [${off.join(', ')}]`);
    }
    blocks.push(...lines);
  }

  // The addresses: one per networked unit, in its VLAN's prefix, by hostname.
  const addresses = [];
  const byVlan = new Map();
  for (const [vid, device, iface, isStatic, swId] of wants) {
    const u = UNITS.get(device);
    const host = u?.host ?? swId ?? null;
    if (!host || (u && !NETWORKED.has(u.cls))) continue;
    if (!byVlan.has(vid)) byVlan.set(vid, []);
    if (byVlan.get(vid).some((x) => x.device === device)) continue;
    byVlan.get(vid).push({ device, iface, host, isStatic, seed: u?.serial ?? device });
  }
  for (const [vid, list] of [...byVlan].sort((a, b) => a[0] - b[0])) {
    const v = vlans.find((x) => x.vid === vid); if (!v?.gateway) continue;
    const base = v.prefix.split('/')[0].split('.').slice(0, 3).join('.'), len = v.prefix.split('/')[1];
    let st = 2, res = 20;
    for (const a of list.sort((x, y) => x.host.localeCompare(y.host))) {
      const last = a.isStatic ? st++ : res++;
      addresses.push({ address: `${base}.${last}/${len}`, device: a.device, interface: a.iface, mac: a.iface || !a.isStatic ? macOf(a.seed) : null, dns_name: `${a.host}.${HOUSE.domain}`, assignment: a.isStatic ? 'static' : 'dhcp-reservation', host: a.host });
    }
  }

  const out = [];
  out.push(`# Switch ports at the ${raw.sites[site].name}: its VLANs and prefixes, the kit that acts as one, the addresses, and every`);
  out.push("# switch interface with what it is connected to. Made up for the demo; written by tools/migrations/2026-09-30-switch-ports.mjs,");
  out.push("# in NetBox's names (docs/connectors/netbox-ports.md). In a live setup NetBox and the switch platform's connector (UniFi,");
  out.push('# Meraki or Netgear) fill it; here it is recorded. The record is the plan; `seen` is what the switch reports where it');
  out.push('# differs (a drift finding). Each cable trace is checked against the patch cords, the runs and the room wiring by');
  out.push('# tools/crossrefs-switchports.mjs.');
  out.push(`site: ${site}`, `vlan_group: ${site}`, `read_at: "${SEEN_AT}"`, `source: { system: keia, synced_at: "${SEEN_AT}" }`);
  out.push('# The VLAN group: every VLAN in the plan, its role, its prefix (IPAM), the gateway, and where addresses come from.');
  out.push('vlans:', ...vlans.map((v) => `  - ${flow(v)}`));
  if (groups.length) {
    out.push('# Kit that acts as one (NetBox: virtual chassis; an HA pair and a cluster are the same idea). A change to one member is a change to the group.');
    out.push('groups:', ...groups.map((g) => `  - { id: ${g.id}, kind: ${g.kind}, name: "${g.name}", members: [${g.members.join(', ')}] }`));
  }
  out.push('# Addresses (IPAM): each networked unit in its VLAN\'s prefix, with its MAC and DNS name. Switches are static; the rest are DHCP reservations.');
  out.push('addresses:', ...addresses.map(({ host, ...a }) => `  - ${flow(a)}  # ${host}`));
  out.push('switches:', ...blocks, 'demo: true', '');
  writeFileSync(path.join(OUT, `${site}.yaml`), out.join('\n'));
  console.log(`${site}: ${sws.length} switches, ${addresses.length} addresses`);
}
console.log(`${findings} drift findings set`);
