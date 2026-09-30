#!/usr/bin/env node
// One-off migration: alert rules and routing (the Alert rules capability, src/lib/modules.mjs).
//
// Kept for the record; it has already been run and its output committed. It writes only files that do not exist yet,
// so running it again changes nothing.
//
// Before: alerts showed on the service pages, simulated, with no thresholds, routing or silences in the data
// (src/lib/services.mjs made up the alert kinds). Standing rules had run windows; nothing silenced an alert.
// After: data/alert-rules/ holds one rule per file: which monitoring tool raises it (Datadog, Alertmanager or LibreNMS),
// what it watches (device classes or comms rooms, and offices), the condition and how long it must last, when it
// counts (office hours or always), the priority, who gets it (a role, at the office or the region), quiet hours, and
// what silences it (a room check round, a standing rule's run window). src/lib/alerts.mjs says each rule as one sentence and makes
// up its last week of alerts from the connected tool (simulated).
//
// Made up for the demo (demo: true): thresholds and routes are house choices, not a vendor's defaults.
//
// Run from the repository root:  node tools/migrations/2026-09-30-alert-rules.mjs

import { write } from './_fleet.mjs';

const RULES = [
  ['ar-01', 'Dublin video bars offline', 'datadog', '{ classes: [video-bar], sites: [dub] }', '{ signal: offline, for_min: 10 }', 2, 'office-hours', '{ role: tech, at: office }', null, '{ room_checks: true, standing_rules: true }', 'sm-av'],
  ['ar-02', 'Touch controllers offline', 'datadog', '{ classes: [touch-controller] }', '{ signal: offline, for_min: 15 }', 3, 'office-hours', '{ role: tech, at: office }', '{ from: "19:00", to: "07:00" }', '{ room_checks: true, standing_rules: true }', 'sm-av'],
  ['ar-03', 'Meeting room packet loss', 'datadog', '{ classes: [video-bar, codec] }', '{ signal: packet-loss, above: 2, unit: "%", for_min: 5 }', 3, 'office-hours', '{ role: network, at: region }', null, '{ room_checks: true }', 'sm-infra'],
  ['ar-04', 'Access switch uplink down', 'alertmanager', '{ classes: [network-switch], space_types: [mdf, idf] }', '{ signal: port-down, for_min: 2 }', 2, 'always', '{ role: network, at: region }', '{ from: "22:00", to: "07:00" }', '{ standing_rules: true }', 'sm-infra'],
  ['ar-05', 'UPS on battery', 'librenms', '{ space_types: [mdf, idf] }', '{ signal: on-battery, for_min: 2 }', 1, 'always', '{ role: tech, at: office }', null, '{}', 'sm-infra'],
  ['ar-06', 'Comms room too warm', 'librenms', '{ space_types: [mdf, idf] }', '{ signal: temperature, above: 27, unit: "°C", for_min: 15 }', 2, 'always', '{ role: tech, at: office }', '{ from: "22:00", to: "06:00" }', '{ room_checks: true }', 'sm-infra'],
  ['ar-07', 'Wi-Fi access point offline', 'alertmanager', '{ classes: [wireless-access-point] }', '{ signal: offline, for_min: 10 }', 3, 'office-hours', '{ role: network, at: region }', null, '{ standing_rules: true }', 'sm-infra'],
  ['ar-08', 'Signage player offline', 'datadog', '{ classes: [signage-player] }', '{ signal: offline, for_min: 30 }', 4, 'office-hours', '{ role: desk, at: all }', '{ from: "17:00", to: "09:00" }', '{ room_checks: true }', 'sm-av'],
];

let n = 0;
for (const [id, name, source, applies, cond, prio, when, route, quiet, silence, owner] of RULES) {
  const text = `# Alert rule. Made up for the demo (tools/migrations/2026-09-30-alert-rules.mjs).
id: ${id.toUpperCase()}
name: ${name}
source: ${source}
applies_to: ${applies}
condition: ${cond}
priority: ${prio}
when: ${when}
route: ${route}
${quiet ? `quiet_hours: ${quiet}\n` : ''}silenced_by: ${silence}
owner_role: ${owner}
demo: true
`;
  if (write(`alert-rules/${id}.yaml`, text)) n++;
}
console.log(`Wrote ${n} alert rule${n === 1 ? '' : 's'} (data/alert-rules/).`);
