#!/usr/bin/env node
// One-off migration: each comms room's power and temperature record (schemas/ext/space.schema.yaml power and
// environment). The power standard asks for dedicated circuits, a UPS loaded to 80% or less and 15 minutes of runtime;
// the racks standard asks for a temperature sensor reporting to monitoring. The comms room pages said "Load and
// runtime: Not recorded", because no record carried them.
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once a comms room
// has power:. Every value is made up for the demo and says demo: true:
//   feeds          A and B from two boards on the room's floor (DB-<floor>A and DB-<floor>B), way 12 and 14
//   ups            runtime and load as measured at the last timed test; most rooms are well inside the standard,
//                  London's load is over 80% and Toronto's runtime is under 15 minutes, so the page shows both
//   environment    the probe on the UPS network card, at the front of the rack, reporting to monitoring
//
// Run from the repository root:  node tools/migrations/2026-09-30-comms-power.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const DIR = path.join(process.cwd(), 'data', 'spaces');
// [space, runtime minutes, load %, measured]
const ROOMS = [
  ['nyc-20-14', 24, 46, '2025-11-18'], ['nyc-21-23', 31, 33, '2025-11-18'], ['nyc-22-22', 28, 37, '2025-11-19'],
  ['dub-3-21', 22, 41, '2026-03-12'], ['dub-4-21', 26, 38, '2026-03-12'],
  ['lon-2-08', 17, 83, '2026-02-24'], ['chi-12-11', 21, 52, '2025-09-30'], ['chi-13-20', 29, 35, '2025-09-30'],
  ['tor-7-08', 12, 64, '2025-08-14'], ['sin-12-08', 25, 44, '2026-01-20'], ['mel-8-17', 23, 47, '2026-05-06'],
  ['tyo-15-19', 27, 39, '2026-04-09'], ['cph-4-17', 30, 36, '2026-06-02'], ['jnu-2-08', 35, 29, '2026-08-27'],
];
const first = path.join(DIR, 'dub', 'dub-3-21.yaml');
if (/^power:/m.test(readFileSync(first, 'utf8'))) { console.log('Already run: comms rooms have power:.'); process.exit(0); }
for (const [id, runtime, load, measured] of ROOMS) {
  const file = path.join(DIR, id.split('-')[0], `${id}.yaml`), text = readFileSync(file, 'utf8'), s = parse(text);
  if (!['mdf', 'idf'].includes(s.space_type)) throw new Error(`${id} is not a comms room`);
  const f = s.floor;
  const add = [
    'power:',
    `  feeds: [{ feed: A, board: DB-${f}A, way: 12 }, { feed: B, board: DB-${f}B, way: 14 }]`,
    `  ups: { runtime_min: ${runtime}, load_pct: ${load}, measured: "${measured}" }`,
    '  demo: true',
    'environment:',
    '  probe: Temperature probe on the UPS network card, at the front of the rack',
    '  reports_to: Monitoring',
    '  demo: true',
  ];
  // After option:, before geometry, so the record reads top to bottom.
  const out = text.replace(/^(option: .*)$/m, (m) => `${m}\n${add.join('\n')}`);
  if (out === text) throw new Error(`${id}: no option line to follow`);
  writeFileSync(file, out);
}
console.log(`Power and temperature records written on ${ROOMS.length} comms rooms.`);
