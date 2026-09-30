#!/usr/bin/env node
// One-off migration: priority is proposed, not set (Keia Method; schemas/ext/incident.schema.yaml).
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once
// every incident has a priority_proposed.
//
// Before: each incident had one `priority`, as ServiceNow holds it.
// After: `priority` stays (the priority in force, still what ServiceNow holds) and every incident gains
// `priority_proposed`, the priority worked out when the ticket came in. For most tickets nobody changed it,
// so the proposal is the priority. Two demo tickets show a person changing it, with who, when and why
// (priority_override); their proposal is what the impact and urgency alone gave.
//
// The edit is made on the text, so comments and layout stay as they were.
//
// Run from the repository root:  node tools/migrations/2026-09-30-proposed-priority.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'data/incidents');
const files = readdirSync(DIR).filter((f) => f.endsWith('.yaml'));
if (files.every((f) => /^priority_proposed:/m.test(readFileSync(path.join(DIR, f), 'utf8')))) {
  console.log('Already run: every incident has a priority_proposed.');
  process.exit(0);
}

// The two demo overrides. One raised, one lowered.
const OVERRIDES = {
  'inc0041188.yaml': {
    proposed: 3,
    lines: [
      'priority_override:',
      '  priority: 2',
      '  reason: A board meeting starts in the room at 10:00 and cannot move to another room.',
      '  by: denise',
      '  at: "2026-09-28T09:14"',
    ],
  },
  'inc0041172.yaml': {
    proposed: 3,
    lines: [
      'priority_override:',
      '  priority: 4',
      '  reason: The room still books correctly from the calendar; only the panel by the door is out of date.',
      '  by: aoife',
      '  at: "2026-09-25T14:40"',
    ],
  },
};

let n = 0;
for (const f of files) {
  const file = path.join(DIR, f);
  const text = readFileSync(file, 'utf8');
  if (/^priority_proposed:/m.test(text)) continue;
  const m = /^priority: ([1-4])\n/m.exec(text);
  if (!m) throw new Error(`${f}: no priority line`);
  const o = OVERRIDES[f];
  const add = [`priority_proposed: ${o ? o.proposed : m[1]}`, ...(o ? o.lines : [])].join('\n') + '\n';
  writeFileSync(file, text.replace(m[0], m[0] + add));
  n++;
}
console.log(`Added priority_proposed to ${n} incidents, with ${Object.keys(OVERRIDES).length} changed by a person.`);
