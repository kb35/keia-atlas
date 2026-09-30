#!/usr/bin/env node
// One-off migration: every office's opening hours and change window (schemas/ext/site.schema.yaml). The network
// standard ("in the office's change window"), the Wi-Fi standard (Channel AI and access point firmware) and the
// display and signage timers all name them; no site carried them, so no page or build sheet could say them.
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once a site has
// office_hours. Both are made up for the demo and say demo: true:
//   office_hours   07:00 to 19:00, Monday to Friday: the hours the demo's simulation already runs every office on
//                  (src/lib/livesim.mjs), so the pages agree with each other
//   change_window  one late evening a week in the office's own time, after the building is empty; the Americas start
//                  an hour earlier so a change there does not run into Europe's morning
// Remote sites (home offices) get neither: a home office keeps its person's hours.
//
// Run from the repository root:  node tools/migrations/2026-09-30-office-hours.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const DIR = path.join(process.cwd(), 'data', 'sites');
const WINDOW = {
  dub: ['thu', '22:00', '02:00'], lon: ['thu', '22:00', '02:00'], cph: ['wed', '22:00', '02:00'],
  nyc: ['tue', '21:00', '01:00'], chi: ['tue', '21:00', '01:00'], tor: ['wed', '21:00', '01:00'], jnu: ['wed', '20:00', '00:00'],
  sin: ['thu', '22:00', '02:00'], mel: ['wed', '22:00', '02:00'], tyo: ['thu', '22:00', '02:00'],
};
const files = readdirSync(DIR).filter((f) => f.endsWith('.yaml'));
if (files.some((f) => /^office_hours:/m.test(readFileSync(path.join(DIR, f), 'utf8')))) { console.log('Already run: sites have office_hours.'); process.exit(0); }
let n = 0;
for (const f of files) {
  const file = path.join(DIR, f), text = readFileSync(file, 'utf8'), site = parse(text), id = f.slice(0, -5);
  if (site.kind !== 'office') continue;
  const w = WINDOW[id];
  if (!w) throw new Error(`${id}: no change window in the table`);
  const add = [
    'office_hours: { days: [mon, tue, wed, thu, fri], open: "07:00", close: "19:00", demo: true }',
    `change_window: { day: ${w[0]}, from: "${w[1]}", to: "${w[2]}", demo: true }`,
  ];
  const out = text.replace(/^(time_zone: .*)$/m, (m) => `${m}\n${add.join('\n')}`);
  if (out === text) throw new Error(`${id}: no time_zone line to follow`);
  writeFileSync(file, out); n++;
}
console.log(`Office hours and a change window written on ${n} offices.`);
