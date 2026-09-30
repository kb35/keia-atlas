#!/usr/bin/env node
// One-off migration: meeting quality per space, as read from the meeting platform (the Meeting quality capability,
// src/lib/modules.mjs).
//
// Kept for the record; it has already been run and its output committed. It writes only files that do not exist yet,
// so running it again changes nothing.
//
// Before: the Usage pages counted failed calls, and the service pages "meetings started on time"; nothing said how a
// room's calls sounded and looked, though three of the demo incidents are exactly that (an echo, a picture that
// freezes, people lost at the far end of the table).
// After: data/meeting-quality/ holds one snapshot per office, as the connector would read it from the meeting platform
// (the Google Meet quality tool; Webex Control Hub for the Webex desks): for each space with a video system, a call
// quality score out of 100 for the last seven days, the eight weeks before (oldest first), calls held, poor calls and
// the most common cause. The spaces with those incidents score low, for the same reason.
//
// Simulated for the demo (simulated: true): seeded figures.
//
// Run from the repository root:  node tools/migrations/2026-09-30-meeting-quality.mjs

import { units, rand, TODAY, write } from './_fleet.mjs';

const VIDEO = new Set(['video-bar', 'codec', 'desk-video-device']);
// Spaces with an incident about how calls sound or look (data/incidents/), and its cause.
const KNOWN = { 'tyo-15-03': 'video', 'jnu-2-02': 'audio', 'cph-4-07': 'audio', 'nyc-20-05': 'audio', 'mel-8-07': 'audio' };
const CAUSES = ['network', 'audio', 'video', 'device'];

const spaces = new Map();
for (const u of units) if (VIDEO.has(u.cls) && u.stage === 'manage' && u.office) spaces.set(u.space, { site: u.site, webex: u.model === 'cisco-desk-pro' });
const bySite = new Map();
for (const [id, s] of [...spaces].sort()) { if (!bySite.has(s.site)) bySite.set(s.site, []); bySite.get(s.site).push({ id, ...s }); }

let n = 0;
for (const [site, list] of [...bySite].sort()) {
  const rows = list.map((s) => {
    const r = (k) => rand(`mq:${s.id}:${k}`);
    const bad = KNOWN[s.id];
    const base = bad ? 58 + Math.floor(r('b') * 12) : 82 + Math.floor(r('b') * 15);
    // Eight weeks, oldest first: steady, and falling towards now where a fault started.
    const weeks = Array.from({ length: 8 }, (_, i) => Math.max(40, Math.min(99, Math.round(bad ? base + (7 - i) * 2.5 + (r(`w${i}`) - 0.5) * 6 : base + (r(`w${i}`) - 0.5) * 8))));
    const calls = 6 + Math.floor(r('c') * 30);
    const poor = bad ? Math.max(2, Math.round(calls * (100 - base) / 100)) : Math.floor(calls * (100 - base) / 180);
    const cause = poor === 0 ? 'none' : bad ?? CAUSES[Math.floor(r('k') * CAUSES.length)];
    return `  - { space: ${s.id}, platform: ${s.webex ? 'webex' : 'google-meet'}, score: ${base}, weeks: [${weeks.join(', ')}], calls_7d: ${calls}, poor_7d: ${poor}, cause: ${cause} }`;
  });
  const text = `# Meeting quality, ${site.toUpperCase()}: as the connector reads it from the meeting platform. Simulated for the demo
# (tools/migrations/2026-09-30-meeting-quality.mjs). Score: the share of call minutes rated good, out of 100, last 7 days.
site: ${site}
read_at: "${TODAY}T06:00"
spaces:
${rows.join('\n')}
simulated: true
`;
  if (write(`meeting-quality/${site}.yaml`, text)) n++;
}
console.log(`Wrote ${n} meeting quality snapshot${n === 1 ? '' : 's'} (data/meeting-quality/).`);
