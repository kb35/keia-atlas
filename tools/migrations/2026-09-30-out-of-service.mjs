#!/usr/bin/env node
// One-off migration: a space out of service (the Out of service capability, src/lib/modules.mjs).
//
// Kept for the record; it has already been run and its output committed. It writes only files that do not exist yet,
// so running it again changes nothing.
//
// Before: a space was either in service or being installed. The room guide said "We know" for an open incident, and
// nothing told the booking system or the people booked in.
// After: data/out-of-service/ holds one file per space taken out of service: why, since when, when it is expected
// back, the role that took it out, the nearest working space to offer instead, and whether the booking system and the
// people booked in were told. The demo starts with one: Dublin 4.01 Kingfisher, after a leak. Taking a space out and
// bringing it back from the space page is kept in the browser (src/lib/outofservice.mjs); the notices are simulated.
//
// Made up for the demo (demo: true).
//
// Run from the repository root:  node tools/migrations/2026-09-30-out-of-service.mjs

import { write } from './_fleet.mjs';

const n = write('out-of-service/dub-4-01.yaml', `# Out of service: Dublin 4.01 Kingfisher. Made up for the demo (tools/migrations/2026-09-30-out-of-service.mjs).
# The notices to the booking system and the people booked in are simulated: the demo has no booking feed.
space: dub-4-01
reason: Water came through a ceiling tile above the table. The display wall is off until facilities dry the ceiling and an electrician checks the circuit.
since: "2026-09-28T08:10"
until: "2026-10-01T17:00"
by_role: tech
alternative: dub-3-05
notice:
  booking_system: true
  people_booked: true
  room_guide: true
demo: true
`) ? 1 : 0;
console.log(`Wrote ${n} out-of-service file${n === 1 ? '' : 's'} (data/out-of-service/).`);
