// Privacy records for sensing devices (schemas/ext/privacy-record.schema.yaml). Rule: count, never identify.
// No Astro or browser dependency, so the validator (tools/crossrefs-privacy.mjs) uses it too.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

// The records in data/privacy/, by id (the file name). Build time only.
let cache = null;
export function loadPrivacy(root = process.cwd()) {
  if (cache) return cache;
  const dir = path.join(root, 'data', 'privacy');
  cache = existsSync(dir) ? Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort().map((f) => [f.slice(0, -5), parse(readFileSync(path.join(dir, f), 'utf8'))])) : {};
  return cache;
}

// Device classes that sense people: they carry a privacy record. Door and CCTV equipment is in the
// security-device class.
export const SENSING_CLASSES = ['camera', 'microphone', 'video-bar', 'codec', 'desk-video-device', 'security-device'];
export const isSensing = (cls) => SENSING_CLASSES.includes(cls);

export const CAPTURE_LABEL = { video: 'Video', audio: 'Sound', 'people-count': 'How many people (a number)', presence: 'Whether anyone is there', 'badge-id': 'Badge number' };
export const PROCESSING_LABEL = { 'on-device': 'On the device', cloud: 'In the manufacturer\'s cloud', 'on-device-and-cloud': 'On the device, then the manufacturer\'s cloud' };

// The record that covers a unit of this class at this site, or null. `records` is { id: record }.
export function recordFor(records, cls, site) {
  if (!isSensing(cls)) return null;
  const hits = Object.entries(records).filter(([, r]) => r.covers.classes.includes(cls) && r.covers.sites.includes(site));
  return hits.length ? { id: hits[0][0], ...hits[0][1] } : null;
}

// How a count is shown: below the minimum group size it is "fewer than N", so a small room never shows who was in it.
export const shownCount = (n, min) => (n < min ? `fewer than ${min}` : String(n));

const day = (d) => new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });

// The record, shaped for a page: label and value pairs, what a person in the room would ask first. The unit
// page shows the first six and opens the rest on request.
export function privacyRows(r) {
  const o = r.occupancy;
  return [
    ['Captures', r.captures.map((c) => CAPTURE_LABEL[c] ?? c).join(', ')],
    ['Identifies people', r.identifies_people ? 'Yes' : 'No'],
    ['Purpose', r.purpose],
    ['Room notice', r.notice.posted ? `Yes: ${r.notice.where}` : 'No'],
    ['Occupancy', o.counted ? `Counted per room, never per person. Fewer than ${o.min_group_size} people shows as "fewer than ${o.min_group_size}".` : 'Not counted'],
    ['Per-person views', o.per_person_views ? `On: ${o.decision}` : 'Off'],
    ['Lawful basis', r.lawful_basis],
    ['DPIA', `${r.dpia.ref}, ${day(r.dpia.date)}${r.dpia.reviewed ? `, reviewed ${day(r.dpia.reviewed)}` : ''}`],
    ['Retention', r.retention],
    ['Works council', r.works_council.none ?? `${r.works_council.body}, ${r.works_council.ref}, ${day(r.works_council.date)}`],
  ];
}
