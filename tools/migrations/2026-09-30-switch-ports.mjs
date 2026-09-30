#!/usr/bin/env node
// One-off migration: data/switch-ports/<site>.yaml for every office with floor plans.
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once the files
// exist (delete them first to regenerate; the deliberate findings below come back the same).
//
// What it writes, per office:
//   - The VLAN table: every VLAN in the network standard's plan, with a made-up subnet and gateway in private space,
//     10.<site>.<VLAN>.0/24 (site number from the demo's site order: New York 10, Dublin 20 and so on), Corporate a
//     /22 and Guest a /23 for the Wi-Fi clients. The AV VLAN is link-local in each room and has no gateway.
//   - Every switch: the comms room switches (rack items) and the in-room AV switches (units in the spaces). Its id is
//     its unit's hostname; a rack switch with no unit recorded (a second access switch, say) gets one after the
//     hostname rule from its comms room's number and the number in its label.
//   - Every port a patch cord or a room cable reaches, with its far end named (run, patch cord, unit and unit port,
//     or the switch and port at the other end), from src/lib/switchcore.mjs farEnds(): the same walk the checks do.
//     How each port is set follows the plan (data/house-values vlans): an access port on the device's VLAN; a trunk
//     managed on VLAN 10 to an access point (staff and guest Wi-Fi tagged), to an in-room switch (Room systems
//     tagged, never AV) and between switches and firewalls (every routed VLAN). An outlet with nothing plugged in is
//     parked; a port nothing reaches is disabled. On an in-room switch, a device's second port and the IP
//     microphones sit on the AV VLAN, kept in the room.
//   - Four deliberate findings, so the pages have something to show (the way a real estate drifts):
//       dub-309-dsp02 (3.09 Whooper Swan, display 2) left on Corporate (20) instead of Displays and signage (31);
//       dub-404-sch01 (4.04's booking panel) on VLAN 1, the switch default;
//       nyc-2004-sw01's uplink carrying the AV VLAN (40) out of the room;
//       nyc-2013-prn01 (the Level 20 printer) on Corporate (20) instead of Printers (70).
//     Each is found by the same check the pages use (checkPort), not written as a finding.
// Everything is made up for the demo.
//
// Run from the repository root:  node tools/migrations/2026-09-30-switch-ports.mjs

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadRaw, buildingModel, sitesWithFloors } from '../../src/lib/floors.mjs';
import { switchesOf, hostnameFor, farEnds, vlanPlan, classVlans, routedVlans, platformOf, readHouse, rangeText, AV_VLAN } from '../../src/lib/switchcore.mjs';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'data', 'switch-ports');
if (existsSync(path.join(OUT, 'dub.yaml'))) {
  console.log('Already run: data/switch-ports/ exists.');
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });

const SITE_ORDER = ['nyc', 'dub', 'lon', 'chi', 'tor', 'sin', 'mel', 'tyo', 'cph', 'jnu'];
const raw = loadRaw(ROOT);
const plan = vlanPlan(raw.standards.network);
const byClass = classVlans(readHouse(ROOT));
const ROUTED = routedVlans(plan);
const WIFI = [20, 90];
const AV_CLASSES = new Set(['av-switcher', 'av-extender', 'amplifier', 'loudspeaker', 'codec', 'camera', 'microphone']);
const vlanFor = (cls) => byClass.get(cls) ?? (AV_CLASSES.has(cls) ? 30 : 20);

// The deliberate findings: [site, how to find the port, what to set].
const FINDINGS = [
  ['dub', (sw, f) => f.unit?.host === 'dub-309-dsp02', { native: 20 }],
  ['dub', (sw, f) => f.unit?.host === 'dub-404-sch01', { native: 1 }],
  ['nyc', (sw, f) => sw.id === 'nyc-2004-sw01' && f.kind === 'uplink', { tagged: [30, AV_VLAN] }],
  ['nyc', (sw, f) => f.unit?.host === 'nyc-2013-prn01', { native: 20 }],
];

const flow = (o) => `{ ${Object.entries(o).filter(([, v]) => v != null && !(Array.isArray(v) && !v.length)).map(([k, v]) => `${k}: ${Array.isArray(v) ? `[${v.join(', ')}]` : typeof v === 'object' ? flow(v) : v}`).join(', ')} }`;
const sortPorts = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'en', { numeric: true }));
const spaceName = (id) => { const s = raw.spaces[id]; return s ? `${s.number ? `${s.number} ` : ''}${s.name}` : id; };
const words = (p) => p.replace(/^[a-z]+-\d+\//, (m) => `${m.replace('desk-', 'desk ').replace('/', '')}, `).replace(/#(\d+)/, ' $1').replace(/-/g, ' ');

let findings = 0;
for (const site of sitesWithFloors(ROOT).sort((a, b) => SITE_ORDER.indexOf(a) - SITE_ORDER.indexOf(b))) {
  const M = buildingModel(raw, site);
  const F = farEnds(M);
  const S = (SITE_ORDER.indexOf(site) + 1) * 10;
  // Comms room switches first (core, then access, by hostname), then the in-room switches by space.
  const rank = (s) => (s.where === 'room' ? 2 : /core/i.test(s.label) ? 0 : 1);
  const sws = switchesOf(M).sort((a, b) => rank(a) - rank(b) || hostnameFor(M, a).localeCompare(hostnameFor(M, b)));
  const idOf = new Map(sws.map((s) => [s.key, hostnameFor(M, s)]));
  const lines = [];
  lines.push(`# Switch ports at the ${raw.sites[site].name}: the VLAN table, and how every switch port is set with what is on its far end.`);
  lines.push('# Made up for the demo; written by tools/migrations/2026-09-30-switch-ports.mjs. In a live setup the switch platform\'s');
  lines.push('# connector (UniFi, Meraki or Netgear) reads this; here it is recorded. The chain on each port (run, patch cord, unit)');
  lines.push('# is checked against the runs, the patch cords and the room wiring by tools/crossrefs-switchports.mjs.');
  lines.push(`site: ${site}`);
  lines.push('read_at: "2026-09-30T06:00:00Z"');
  lines.push('vlans:');
  for (const v of plan) {
    const net = v.vlan === 20 ? `10.${S}.20.0/22` : v.vlan === 90 ? `10.${S}.90.0/23` : `10.${S}.${v.vlan}.0/24`;
    if (!v.routed) lines.push(`  - { vlan: ${v.vlan}, subnet: 169.254.0.0/16, note: "Link-local in each room, on the in-room switch only; not routed" }`);
    else lines.push(`  - { vlan: ${v.vlan}, subnet: ${net}, gateway: 10.${S}.${v.vlan}.1 }`);
  }
  lines.push('switches:');
  for (const sw of sws) {
    const id = idOf.get(sw.key);
    const far = F.get(sw.key);
    const room = sw.where === 'rack' ? `${spaceName(sw.space)}, ${M.racks.find((r) => r.id === sw.rack)?.name ?? sw.rack}, U${sw.u}` : spaceName(sw.space);
    lines.push(`  # ${sw.label} · ${room}`);
    lines.push(`  - id: ${id}`);
    if (sw.where === 'rack') lines.push(`    rack: ${sw.rack}`, `    u: ${sw.u}`);
    else lines.push(`    space: ${sw.space}`, `    position: ${sw.position}`);
    lines.push(`    platform: ${platformOf(sw.gear ?? sw.model ?? '')}`);
    const used = [];
    const rows = [];
    // Which unit ports already reach the network another way (for a device's second port on an in-room switch).
    const direct = new Set();
    if (sw.where === 'room') for (const [, ports] of F) for (const [, f] of ports) if (f.kind === 'outlet') for (const u of f.units) if (!u.via.length) direct.add(u.tag);
    const seen = new Set();
    for (const [port, f] of [...far].sort((a, b) => sortPorts(a[0], b[0]))) {
      let row = null, why = '';
      if (f.kind === 'outlet') {
        const at = f.ap ? `access point ${f.ap}` : `${spaceName(f.space)}, ${f.outlet.split(':')[1]}`;
        if (!f.unit) { row = { port, state: 'parked', far: { run: f.run, patch: f.patch } }; why = `${at}, nothing plugged in`; }
        else {
          const u = f.unit;
          const cfg = u.cls === 'network-switch' ? { mode: 'trunk', native: 10, tagged: [30] }
            : u.cls === 'wireless-access-point' ? { mode: 'trunk', native: 10, tagged: WIFI }
            : { mode: 'access', native: vlanFor(u.cls) };
          row = { port, state: 'active', ...cfg, far: { run: f.run, patch: f.patch, unit: u.tag, unit_port: u.port } };
          why = f.ap ? `access point ${u.host}` : `${spaceName(u.space)}, ${words(u.position)}${u.via.length ? ` (through the ${words(u.via[u.via.length - 1])})` : ''}`;
        }
      } else if (f.kind === 'switch') {
        row = { port, state: 'active', mode: 'trunk', native: 10, tagged: ROUTED, far: { switch: idOf.get(f.key), port: f.port, ...(f.runs?.length ? { run: f.runs[0] } : {}), ...(f.patches?.length > 1 ? { patches: f.patches } : { patch: f.patch }) } };
        why = `${sw.label.startsWith('Core') && !/core/i.test(sws.find((x) => x.key === f.key)?.label ?? '') ? 'trunk down to' : 'trunk to'} ${idOf.get(f.key)}`;
      } else if (f.kind === 'item') {
        const wlc = f.itemKind === 'wlc';
        row = { port, state: 'active', mode: 'trunk', native: 10, tagged: wlc ? WIFI : ROUTED, far: { rack: f.rack, u: f.u, patch: f.patch } };
        why = f.label;
      } else if (f.kind === 'uplink') {
        row = { port, state: 'active', mode: 'trunk', native: 10, tagged: [30], far: { switch: idOf.get(f.key), port: f.port } };
        why = `uplink to ${idOf.get(f.key)} port ${f.port}`;
      } else if (f.kind === 'unit' && f.unit) {
        const u = f.unit;
        const second = seen.has(u.tag) || direct.has(u.tag);
        seen.add(u.tag);
        const native = u.cls === 'microphone' || second ? AV_VLAN : vlanFor(u.cls);
        row = { port, state: 'active', mode: 'access', native, far: { unit: u.tag, unit_port: u.port } };
        why = `${words(u.position)}${native === AV_VLAN ? ', AV network in the room' : ''}`;
      }
      if (!row) { console.warn(`${site} ${id} port ${port}: ${f.kind}, left out`); continue; }
      for (const [s, hit, set] of FINDINGS) if (s === site && hit({ id }, f)) { Object.assign(row, set); findings++; }
      used.push(port);
      rows.push(`      - ${flow(row)}  # ${why}`);
    }
    lines.push('    ports:', ...rows);
    if (sw.where === 'rack') {
      const n = Math.max(sw.ports, ...used.filter((p) => typeof p === 'number'));
      const off = []; for (let p = 1; p <= n; p++) if (!used.includes(p)) off.push(p);
      if (off.length) lines.push(`    disabled: "${rangeText(off)}"`);
    } else {
      const off = sw.ports.filter((p) => !used.includes(p));
      if (off.length) lines.push(`    disabled: [${off.join(', ')}]`);
    }
  }
  lines.push('demo: true', '');
  writeFileSync(path.join(OUT, `${site}.yaml`), lines.join('\n'));
  console.log(`${site}: ${sws.length} switches`);
}
console.log(`${findings} deliberate findings set`);
