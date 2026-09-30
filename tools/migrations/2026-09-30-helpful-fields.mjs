#!/usr/bin/env node
// One-off migration: device classes' required_fields become helpful_fields.
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once no
// device class says required_fields.
//
// Before: each platform in a device class listed `required_fields` (Keia's object profile name). The video
// bar class, for example, listed serial and expected_firmware for Keia Atlas. That reads as a rule a record
// must meet, which is right for a well-kept asset register and wrong for a company that starts from a
// spreadsheet of rooms.
// After: the same lists, under `helpful_fields`. Nothing else changes: the same fields, in the same order.
// A record that lacks one still passes, and the schema still accepts the old name
// (schemas/keia/object-profile.schema.yaml).
//
// The edit is made on the text, so comments and layout stay as they were.
//
// Run from the repository root:  node tools/migrations/2026-09-30-helpful-fields.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'data/device-classes');
const files = readdirSync(DIR).filter((f) => f.endsWith('.yaml'));
const OLD = /^(\s+)required_fields:/gm;

let changed = 0;
for (const f of files) {
  const file = path.join(DIR, f);
  const text = readFileSync(file, 'utf8');
  if (!OLD.test(text)) continue;
  OLD.lastIndex = 0;
  writeFileSync(file, text.replace(OLD, '$1helpful_fields:'));
  changed += 1;
}
console.log(changed ? `Renamed required_fields to helpful_fields in ${changed} device classes.` : 'Already run: no device class says required_fields.');
