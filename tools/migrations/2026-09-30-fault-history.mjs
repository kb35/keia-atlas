#!/usr/bin/env node
// One-off migration: the faults resolved in the year before the demo's incidents (data/fault-history/<site>.yaml,
// schemas/ext/fault-history.schema.yaml), so a space or unit can say "3rd fault this quarter" and Support can list the
// spaces with the most repeats. Every line is made up for the demo (demo: true). Each names a real space and, for a
// device, the unit at that position when the fault happened and a symptom from its device class's guide.
//
// The repeats are chosen to agree with the open incidents already in data/incidents/: Whooper Swan (3.09, Dublin),
// Singapore's 12.03, New York's 20.10 and Melbourne's 8.07 each reach a third fault this quarter; a few others a
// second. The rest are single faults spread over the year, so the trend strips have a past.
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once the folder has
// files.
//
// Run from the repository root:  node tools/migrations/2026-09-30-fault-history.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const DATA = path.join(process.cwd(), 'data');
const OUT = path.join(DATA, 'fault-history');
if (existsSync(OUT) && readdirSync(OUT).some((f) => f.endsWith('.yaml'))) { console.log('Already run: data/fault-history has files.'); process.exit(0); }

// [space, position, opened (local), hours to fix, symptom, fix]
const F = [
  ['dub-3-09', 'video-bar', '2026-08-11T09:20', 2, 'meeting_will_not_start', 'Restarted from Poly Lens; the calendar had lost its sign-in'],
  ['dub-3-09', 'video-bar', '2026-02-17T14:05', 3, 'echo_or_poor_audio', 'Microphone cable reseated under the table'],
  ['dub-3-09', 'display#1', '2025-11-04T08:40', 26, 'no_picture', 'Power board in the display replaced'],
  ['dub-3-06', 'video-bar', '2026-08-27T10:15', 2, 'meeting_will_not_start', 'Restarted; firmware brought to the standard'],
  ['dub-4-05', 'video-bar', '2026-06-23T09:05', 4, 'meeting_will_not_start', 'Restarted from Poly Lens'],
  ['dub-3-03', 'display#1', '2025-10-14T11:30', 3, 'display_unreachable', 'Network cable replaced at the outlet'],
  ['dub-4-01', 'video-bar', '2025-10-28T13:10', 2, 'no_camera_in_laptop_meeting', 'USB cable to the table box replaced'],
  ['sin-12-03', 'video-bar', '2026-07-21T09:40', 3, 'meeting_will_not_start', 'Restarted; calendar sign-in renewed'],
  ['sin-12-03', 'video-bar', '2026-04-08T15:20', 2, 'meeting_will_not_start', 'Restarted from Poly Lens'],
  ['sin-12-05', 'touch-controller', '2026-05-12T08:50', 5, 'controller_dark', 'PoE injector reset'],
  ['nyc-20-10', 'display#1', '2026-07-14T10:25', 6, 'no_picture', 'HDMI input reset; cable replaced'],
  ['nyc-20-10', 'display#1', '2026-05-19T16:45', 20, 'display_turns_itself_off', 'Energy saving turned off in fleet management'],
  ['nyc-20-05', 'microphone', '2026-06-10T11:00', 3, 'far_end_cannot_hear', 'Microphone re-paired to the video bar'],
  ['nyc-21-04', 'video-bar', '2026-01-26T09:15', 2, 'meeting_will_not_start', 'Restarted from Poly Lens'],
  ['mel-8-07', 'microphone', '2026-07-09T10:10', 2, 'far_end_cannot_hear', 'Microphone cable reseated'],
  ['mel-8-07', 'microphone', '2026-09-02T14:30', 3, 'far_end_cannot_hear', 'Microphone swapped from the IT store'],
  ['mel-8-03', 'display#1', '2025-12-15T09:35', 4, 'no_picture', 'Input source reset'],
  ['cph-4-07', 'microphone#2', '2026-08-19T13:20', 2, 'far_end_cannot_hear', 'Microphone re-paired'],
  ['cph-4-03', 'touch-controller', '2026-06-02T08:55', 1, 'controller_dark', 'PoE injector replaced'],
  ['chi-12-06', 'touch-controller', '2026-08-25T09:45', 2, 'controller_shows_not_paired', 'Re-paired after its own update'],
  ['chi-12-06', 'touch-controller', '2026-03-30T10:30', 2, 'controller_dark', 'Network cable reseated at the table'],
  ['chi-13-04', 'display-main', '2026-02-09T11:15', 3, 'no_picture', 'Cable replaced'],
  ['lon-2-03', 'display#1', '2026-01-12T09:00', 5, 'no_picture', 'Display restarted from fleet management'],
  ['lon-2-05', 'video-bar', '2026-03-03T14:40', 2, 'meeting_will_not_start', 'Restarted from Poly Lens'],
  ['tor-7-04', 'touch-controller', '2025-12-02T08:30', 2, 'controller_shows_not_paired', 'Re-paired'],
  ['tor-7-02', 'display#1', '2026-04-21T15:10', 4, 'display_turns_itself_off', 'Timer corrected to the office hours'],
  ['tyo-15-03', 'video-bar', '2026-07-29T10:05', 3, 'echo_or_poor_audio', 'Room acoustic settings reset to the setup guide'],
  ['tyo-15-05', 'microphone', '2026-08-04T13:50', 2, 'far_end_cannot_hear', 'Microphone re-paired'],
];

const load = (dir) => { const out = {}; const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (n.endsWith('.yaml')) out[n.slice(0, -5)] = parse(readFileSync(p, 'utf8')); else if (!n.includes('.')) walk(p); } }; walk(path.join(DATA, dir)); return out; };
const installs = load('installs'), incidents = load('incidents');
const used = new Set(Object.values(incidents).map((i) => i.number));
const addHours = (t, h) => { const d = new Date(`${t}:00Z`); d.setUTCHours(d.getUTCHours() + h); return d.toISOString().slice(0, 16); };

const bySite = new Map();
let seq = 39480;
for (const [space, pos, opened, hours, symptom, fix] of [...F].sort((a, b) => a[2].localeCompare(b[2]))) {
  const inst = installs[space];
  if (!inst) throw new Error(`${space}: no install file`);
  const p = inst.positions.find((x) => x.position === pos) ?? inst.positions.find((x) => x.position.replace(/#\d+$/, '') === pos.replace(/#\d+$/, ''));
  if (!p) throw new Error(`${space}: no position ${pos} (has ${inst.positions.map((x) => x.position).join(', ')})`);
  const u = p.units.find((x) => (x.installed ?? '') <= opened.slice(0, 10) && !x.legacy) ?? p.units[0];
  let number;
  do { number = `INC00${seq}`; seq += 7; } while (used.has(number));
  const site = space.split('-')[0];
  if (!bySite.has(site)) bySite.set(site, []);
  bySite.get(site).push(`  - { number: ${number}, opened: "${opened}", resolved: "${addHours(opened, hours)}", space: ${space}, unit: ${u.asset_tag}, symptom: ${symptom}, fix: ${JSON.stringify(fix)} }`);
}
mkdirSync(OUT, { recursive: true });
for (const [site, lines] of bySite) {
  writeFileSync(path.join(OUT, `${site}.yaml`), [
    `# Faults resolved at this office before the incidents held in full (schemas/ext/fault-history.schema.yaml). Made up for`,
    `# the demo; written by tools/migrations/2026-09-30-fault-history.mjs.`,
    `site: ${site}`,
    'source: ServiceNow, resolved incidents matched to spaces and units; the full tickets stay in ServiceNow',
    'faults:',
    ...lines,
    'demo: true',
    '',
  ].join('\n'));
}
console.log(`${F.length} faults written for ${bySite.size} offices.`);
