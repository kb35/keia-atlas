#!/usr/bin/env node
// One-off migration: every "must" rule in the house standards says how it is proved (record:), so the validator can
// list the rules whose field no record carries (tools/coverage.mjs). VLANs were a rule no record carried; this makes
// the next such rule show up in `npm run validate`.
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once a rule has
// record:. The edit is made on the text, one line after each must rule's check:, so comments and layout stay.
//
// Each rule's proof, read from its check:
//   folder:key.path  the check reads a fact Keia Atlas keeps (or should keep: a field no record carries yet is
//                    exactly what the report is for, and several below are named before they exist)
//   on-site          a measurement, photo or certificate kept in the handover pack
//   connect          read from the system that runs it (controller, fleet management, monitoring)
//
// Run from the repository root:  node tools/migrations/2026-09-30-standards-record.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const DIR = path.join(process.cwd(), 'data', 'standards');
const PROOF = {
  cabling: {
    'cat6a-horizontal': 'runs:type', 'fire-rating': 'on-site', 'fibre-backbone': 'runs:test.loss_db', length: 'runs:test.length_m',
    support: 'on-site', 'bend-and-pull': 'on-site', 'power-separation': 'on-site', 'fire-stopping': 'on-site',
    t568b: 'runs:test.result', untwist: 'runs:test.margin_db', certify: 'runs:test.result', 'colour-by-purpose': 'cables:colour',
    'label-format': 'runs:id', 'outlet-label': 'runs:to.outlet',
  },
  displays: {
    'farthest-seat': 'on-site', commercial: 'device-models:rated_hours', 'seated-height': 'on-site', fixing: 'on-site',
    protrusion: 'on-site', 'outlets-behind': 'on-site', wired: ['installs:hostname', 'installs:mac'], fleet: 'connect',
    'network-standby': 'on-site', timers: 'sites:office_hours', 'energy-saving-off': 'connect', 'auto-off-off': 'on-site',
    'input-map': 'space-types:wiring', cec: 'on-site', firmware: 'firmware:releases', locks: 'on-site',
  },
  'home-offices': {
    'from-profile': 'installs:serial', 'one-cable': 'on-site', 'pre-adopt': 'connect', 'behind-isp': 'connect',
    'own-network': 'connect', updates: 'firmware:releases',
  },
  'meeting-av': {
    'profile-first': 'spaces:space_type', certified: 'model-choices:platforms', configured: 'projects:tasks',
    'camera-at-display': 'on-site', 'seats-in-view': 'on-site', 'room-outlets': 'space-types:infrastructure',
    'leads-fixed': 'on-site', 'usb-length': 'on-site', 'test-call': 'spaces:verification',
  },
  network: {
    'vlan-by-purpose': ['house-values:vlans', 'installs:vlan'], 'no-vlan-1': 'connect', 'av-not-routed': 'on-site',
    'dhcp-reservation': 'installs:mac', hostname: 'installs:hostname', ntp: 'house-values:time_servers',
    'poe-plan': 'device-models:power.poe_budget_w', 'dual-uplinks': 'on-site', firmware: 'firmware:releases',
  },
  power: {
    'dedicated-circuits': 'spaces:power.feeds', 'a-and-b': 'racks:side_pdus.feed', 'ups-size': 'spaces:power.ups.load_pct',
    'ups-runtime': 'spaces:power.ups.runtime_min', 'ups-network': 'connect', tgb: 'on-site', 'rack-bond': 'on-site',
    'behind-display': 'space-types:infrastructure',
  },
  racks: {
    'count-outlets': 'runs:to.outlet', 'port-headroom': 'cables:connects', 'poe-budget': 'device-models:power.poe_budget_w',
    'rack-units': 'racks:height_u', 'cable-managers': 'on-site', 'patch-short': 'on-site', clearance: 'on-site',
    temperature: 'spaces:environment.probe', access: 'spaces:door_access', 'rack-bond': 'on-site',
  },
  'scheduler-panels': {
    'latch-side': 'on-site', reach: 'on-site', poe: 'installs:vlan', name: 'installs:hostname', 'one-calendar': 'house-values:calendar',
  },
  signage: {
    'eye-height': 'on-site', protrusion: 'on-site', behind: 'on-site', 'player-network': 'installs:mac', bsn: 'house-values:platforms',
    'display-schedule': 'sites:office_hours', 'fixed-input': 'on-site', 'content-rules': 'connect',
  },
  wifi: {
    spacing: 'floors:access_points', 'signal-target': 'on-site', survey: 'on-site', 'ceiling-down': 'floors:access_points',
    'clear-of-metal': 'on-site', 'one-cat6a': 'runs:type', 'poe-plus': 'connect', 'trunk-port': 'connect',
    'three-ssids': 'house-values:wifi_networks', 'wpa3-6ghz': 'connect', 'guest-isolation': 'on-site', 'channel-width': 'connect',
    'band-steering': 'connect', 'channel-plan': ['connect', 'sites:change_window'], 'ap-firmware': 'firmware:releases', 'ap-name': 'installs:hostname',
  },
};

const files = readdirSync(DIR).filter((f) => f.endsWith('.yaml') && f !== 'cables.yaml');
if (files.some((f) => /^\s+record:/m.test(readFileSync(path.join(DIR, f), 'utf8')))) { console.log('Already run: rules have record:.'); process.exit(0); }
let n = 0;
for (const f of files) {
  const file = path.join(DIR, f), text = readFileSync(file, 'utf8'), data = parse(text);
  const table = PROOF[data.id] ?? {};
  const must = new Set(data.sections.flatMap((s) => (s.rules ?? []).filter((r) => r.level === 'must').map((r) => r.id)));
  for (const id of must) if (!table[id]) throw new Error(`${data.id}/${id}: no proof in the table`);
  const out = [];
  let rule = null;
  for (const line of text.split('\n')) {
    out.push(line);
    const id = /^\s+- id: ([a-z0-9-]+)\s*$/.exec(line);
    if (id) rule = id[1];
    const chk = /^(\s+)check: /.exec(line);
    if (chk && rule && must.has(rule)) {
      const v = table[rule];
      out.push(`${chk[1]}record: ${Array.isArray(v) ? `[${v.join(', ')}]` : v}`);
      must.delete(rule); n++;
    }
  }
  if (must.size) throw new Error(`${data.id}: could not place record: for ${[...must].join(', ')}`);
  writeFileSync(file, out.join('\n'));
}
console.log(`record: written on ${n} must rules.`);
