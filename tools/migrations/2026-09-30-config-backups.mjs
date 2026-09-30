#!/usr/bin/env node
// One-off migration: config backups and drift, as read from Oxidized (the Config backups capability,
// src/lib/modules.mjs).
//
// Kept for the record; it has already been run and its output committed. It writes only files that do not exist yet,
// so running it again changes nothing.
//
// Before: the setup guides page compared system records with each other (simulated), not a device's running config,
// and no switch, gateway or firewall config backup was recorded anywhere.
// After: data/config-backups/ holds one snapshot per office, as the connector would read it from Oxidized: for each
// network device (switches and gateways in the offices), when its config was last backed up, whether the backup
// worked, how many lines changed since the one before, and where its config differs from the network standard, each
// difference naming the standard's rule (VLAN 1 unused, PoE priority, automatic updates off, AV VLAN not routed, NTP).
// Atlas keeps the date and the drift, never the config itself (it can hold secrets).
//
// Simulated for the demo (simulated: true): a seeded pick of devices, dates and differences.
//
// Run from the repository root:  node tools/migrations/2026-09-30-config-backups.mjs

import { units, rand, pick, addDays, TODAY, write } from './_fleet.mjs';

const NET = new Set(['network-switch', 'network-gateway']);
const DRIFT = {
  unifi: [
    { rule: 'network/no-vlan-1', setting: 'Unused port 44', found: 'Enabled, native VLAN 1', expected: 'Disabled, on the parking VLAN' },
    { rule: 'network/poe-priority', setting: 'PoE priority, access point ports', found: 'Low', expected: 'High' },
    { rule: 'network/firmware', setting: 'Automatic firmware updates', found: 'On', expected: 'Off' },
    { rule: 'network/ntp', setting: 'Time server', found: 'pool.ntp.org', expected: 'ntp1.aigna.example (from DHCP)' },
  ],
  netgear: [
    { rule: 'network/av-not-routed', setting: 'Uplink port, VLAN 40', found: 'Tagged', expected: 'Not carried' },
    { rule: 'network/no-vlan-1', setting: 'Unused port 7', found: 'Enabled, native VLAN 1', expected: 'Disabled' },
  ],
};
const bySite = new Map();
for (const u of units.filter((x) => NET.has(x.cls) && x.office && x.stage === 'manage').sort((a, b) => a.tag.localeCompare(b.tag))) {
  if (!bySite.has(u.site)) bySite.set(u.site, []);
  bySite.get(u.site).push(u);
}

let n = 0;
for (const [site, list] of [...bySite].sort()) {
  const lines = list.map((u) => {
    const r = rand(`backup:${u.tag}`);
    const fam = u.model.startsWith('netgear') ? 'netgear' : 'unifi';
    const failed = r < 0.05, stale = !failed && r > 0.97;
    const last = failed ? `${addDays(TODAY, -4)}T02:00` : stale ? `${addDays(TODAY, -9)}T02:00` : `${TODAY}T02:0${Math.floor(rand(`m:${u.tag}`) * 10)}`;
    const drift = rand(`drift:${u.tag}`) < 0.16 ? [pick(`d1:${u.tag}`, DRIFT[fam])] : [];
    if (drift.length && rand(`d2:${u.tag}`) < 0.35) { const d2 = pick(`d3:${u.tag}`, DRIFT[fam]); if (d2 !== drift[0]) drift.push(d2); }
    const changed = drift.length ? 1 + Math.floor(rand(`c:${u.tag}`) * 6) : rand(`c:${u.tag}`) < 0.2 ? 1 + Math.floor(rand(`c2:${u.tag}`) * 3) : 0;
    const out = [`  - unit: ${u.tag}`, `    last_backup: "${last}"`, `    status: ${failed ? 'failed' : 'ok'}`, `    lines_changed: ${changed}`];
    if (drift.length) {
      out.push('    drift:');
      for (const d of drift) out.push(`      - { rule: ${d.rule}, setting: ${JSON.stringify(d.setting)}, found: ${JSON.stringify(d.found)}, expected: ${JSON.stringify(d.expected)} }`);
    }
    return out.join('\n');
  });
  const text = `# Config backups, ${site.toUpperCase()}: as the connector reads them from Oxidized. Simulated for the demo
# (tools/migrations/2026-09-30-config-backups.mjs). Atlas keeps the date and the drift, never the config itself.
site: ${site}
source: oxidized
read_at: "${TODAY}T06:00"
devices:
${lines.join('\n')}
simulated: true
`;
  if (write(`config-backups/${site}.yaml`, text)) n++;
}
console.log(`Wrote ${n} config backup snapshot${n === 1 ? '' : 's'} (data/config-backups/).`);
