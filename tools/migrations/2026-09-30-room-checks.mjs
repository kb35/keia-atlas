#!/usr/bin/env node
// One-off migration: room checks and planned maintenance (the Room checks capability, src/lib/modules.mjs).
//
// Kept for the record; it has already been run and its output committed. It writes only files that do not exist yet,
// so running it again changes nothing.
//
// Before: nothing recurred. The standards named checks nobody was scheduled to do: the UPS self-test and the comms
// room temperature (data/standards/power.yaml, racks.yaml), and the yearly hearing-loop test to IEC 60118-4 that
// data/accessibility/ records the last result of.
// After: data/checks/ holds one plan per kind of check: what it covers (space types, or the spaces with a hearing loop),
// how often and on which day, how long a space takes, who does it (a role) and its checklist, each step naming the
// standard's rule it proves where there is one. src/lib/checks.mjs turns the plans into dated rounds per office, the
// work items the Schedule and Home show. The hearing-loop plan is due a year after each room's last recorded test.
//
// Made up for the demo (demo: true): the days, times and checklists are house choices, not a published schedule.
//
// Run from the repository root:  node tools/migrations/2026-09-30-room-checks.mjs

import { write } from './_fleet.mjs';

const PLANS = {
  'meeting-room-monthly': `# Room check plan. Made up for the demo (tools/migrations/2026-09-30-room-checks.mjs).
id: meeting-room-monthly
name: Monthly meeting room check
summary: Every meeting room, before the first meetings of the day, once a month.
applies_to:
  space_types: [conference-room-small, conference-room-medium, conference-room-large, hybrid-meeting-room, presentation-recording-room]
every: { n: 1, unit: month }
on: { week: 1, weekday: thu, before: "09:00" }
minutes: 15
role: tech
checklist:
  - Start a test call from the touch controller and join it from a phone
  - Share a laptop over HDMI and over USB-C
  - Check the camera frames the whole table and both microphones pick up
  - Check the scheduler panel shows today's bookings
  - Tidy the table cables and close the table boxes
demo: true
`,
  'comms-room-quarterly': `# Room check plan. Made up for the demo (tools/migrations/2026-09-30-room-checks.mjs).
id: comms-room-quarterly
name: Quarterly comms room check
summary: Every comms room, once a quarter, against the racks and power standards.
applies_to:
  space_types: [mdf, idf]
every: { n: 3, unit: month }
on: { week: 2, weekday: thu, months: [1, 4, 7, 10] }
minutes: 45
role: tech
checklist:
  - { do: "Read the air temperature at the front of each rack: 18 to 27 degrees C", rule: racks/temperature }
  - { do: The UPS log shows a passed battery self-test in the last month, rule: power/battery-test }
  - { do: Both power strips on each rack report their load, rule: power/metered-pdus }
  - { do: "1 m clear in front of each rack and 0.6 m behind; nothing stored in the room", rule: racks/clearance }
  - Patch leads labelled to the house cable standard
  - The out-of-band console answers
demo: true
`,
  'hearing-loop-yearly': `# Room check plan. Made up for the demo (tools/migrations/2026-09-30-room-checks.mjs).
id: hearing-loop-yearly
name: Yearly hearing loop test
summary: Each room with a hearing loop, a year after its last test, to IEC 60118-4.
applies_to:
  hearing_loop: true
every: { n: 12, unit: month }
minutes: 30
role: tech
standard: IEC 60118-4
checklist:
  - Measure the field strength at three seats to IEC 60118-4
  - Check the loop amplifier shows no fault
  - Check the loop sign is on the door and the booking panel
  - Record the result in the space's accessibility record
demo: true
`,
};

let n = 0;
for (const [id, text] of Object.entries(PLANS)) if (write(`checks/${id}.yaml`, text)) n++;
console.log(`Wrote ${n} check plan${n === 1 ? '' : 's'} (data/checks/).`);
