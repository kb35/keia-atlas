#!/usr/bin/env node
// One-off migration: security flaws per firmware line (the Security flaws capability, src/lib/modules.mjs).
//
// Kept for the record; it has already been run and its output committed. It writes only files that do not exist yet,
// so running it again changes nothing.
//
// Before: security flaws were free text in one firmware release's headlines (data/firmware/poly-videoos.yaml, "Tested
// against CVE-..."). data/advisories/ holds what must be known before installing a model (compatibility, "do not
// install"), with no severity, affected versions or fixed version, so it does not fit a flaw; it is left as it is.
// After: data/security-flaws/ holds one flaw per file: its id, a title, the severity (and CVSS score), the models and
// the firmware line it is in, which versions are affected, the version that fixes it and Aigna's note.
// src/lib/flaws.mjs matches each to the fleet: on a tracked firmware line (Poly VideoOS) a unit on a version older than
// the fix is exposed; for models whose versions Atlas does not track, every unit may be exposed.
//
// Made up for the demo (demo: true). The ids are made up and say so (CVE-DEMO-...): these are not real advisories and
// no manufacturer published them.
//
// Run from the repository root:  node tools/migrations/2026-09-30-security-flaws.mjs

import { write } from './_fleet.mjs';

const POLY = '[poly-studio-x32, poly-studio-x52, poly-studio-x72, poly-g62, poly-tc10]';
const F = [
  ['CVE-DEMO-2026-0101', 'The web API returns an admin session to a crafted request', 'high', 8.1, 'poly-videoos', POLY, '4.6.1 and earlier', '4.6.2.460046', '2026-02-20', 'Fixed in the standard. Units still on 4.6.1 move up in the next firmware window.'],
  ['CVE-DEMO-2026-0102', 'A paired touch controller can be re-paired from the room network', 'medium', 5.4, 'poly-videoos', POLY, '4.6.2 and earlier', '4.7.0-466077', '2026-06-18', 'The fix is in 4.7.0, which is in the Lab (LAB-07). Room systems VLAN rules limit who can reach them meanwhile.'],
  ['CVE-DEMO-2026-0103', 'Remote management can be reached from the internet side', 'critical', 9.3, null, '[unifi-express-7]', 'Before 4.1.13', '4.1.13', '2026-09-12', 'Home gateway versions are not tracked in Atlas, so every home office gateway may be exposed. Check in the UniFi controller.'],
  ['CVE-DEMO-2026-0104', 'A malformed LLDP frame restarts the switch', 'medium', 6.5, null, '[netgear-m4250-gsm4210pd]', 'Before 13.0.4.26', '13.0.4.26', '2026-08-04', 'In-room AV switch versions are not tracked in Atlas.'],
  ['CVE-DEMO-2026-0105', 'The USB camera accepts firmware that is not signed', 'low', 3.1, null, '[logitech-meetup-2]', 'All versions', null, '2026-09-01', 'No fix published yet. Only someone with the USB cable in hand could use it.'],
];

let n = 0;
for (const [id, title, severity, cvss, line, models, affected, fixed, published, note] of F) {
  const text = `# Security flaw. Made up for the demo (tools/migrations/2026-09-30-security-flaws.mjs): not a real advisory.
id: ${id}
title: ${JSON.stringify(title)}
severity: ${severity}
cvss: ${cvss}
${line ? `firmware_line: ${line}\n` : ''}models: ${models}
affected: ${JSON.stringify(affected)}
${fixed ? `fixed_in: ${JSON.stringify(fixed)}\n` : ''}published: "${published}"
aigna: ${JSON.stringify(note)}
demo: true
`;
  if (write(`security-flaws/${id.toLowerCase()}.yaml`, text)) n++;
}
console.log(`Wrote ${n} security flaw${n === 1 ? '' : 's'} (data/security-flaws/).`);
