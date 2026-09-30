// Tests for the incident checks (decision 0024).
//
// The lifecycle rules are tested on small made-up histories; the checks that need the rest of the data
// (a real room, position, unit and symptom) run the validator on a copy of the repo with one edit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../tools/validate.mjs';
import { checkLifecycle } from '../tools/crossrefs-incidents.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A healthy ticket: opened, picked up, put on hold, picked up again, resolved.
const OK = () => ({
  opened: '2026-09-20T09:00',
  state: 'resolved',
  history: [
    { at: '2026-09-20T09:00', state: 'new', person: 'A caller', source: 'servicenow' },
    { at: '2026-09-20T09:01', source: 'keia_atlas', note: 'Matched.' },
    { at: '2026-09-20T09:30', state: 'in-progress', by: 'liam', source: 'servicenow' },
    { at: '2026-09-20T10:00', state: 'on-hold', by: 'liam', source: 'servicenow', hold_reason: 'awaiting-vendor' },
    { at: '2026-09-22T10:00', state: 'in-progress', by: 'liam', source: 'servicenow' },
    { at: '2026-09-22T11:00', state: 'resolved', by: 'liam', source: 'servicenow', resolution: { code: 'fixed', notes: 'Swapped it.' } },
  ],
});
const messages = (inc) => checkLifecycle(inc).map((p) => p.message);

test('a healthy lifecycle passes', () => {
  assert.deepEqual(messages(OK()), []);
});

test('the first entry must open the ticket as New, when it was opened', () => {
  const inc = OK();
  inc.history[0].state = 'in-progress';
  inc.history[0].at = '2026-09-20T09:05';
  assert.deepEqual(messages(inc).slice(0, 2), [
    'the first history entry must open the ticket as New',
    'the first history entry is at 2026-09-20T09:05, but the ticket was opened at 2026-09-20T09:00',
  ]);
});

test('entries out of time order', () => {
  const inc = OK();
  inc.history[3].at = '2026-09-20T09:10';
  assert.deepEqual(messages(inc), ['2026-09-20T09:10 is before the entry above it (2026-09-20T09:30); entries go oldest first']);
});

test('an entry in the future', () => {
  const inc = OK();
  inc.history[5].at = '2026-10-02T11:00';
  assert.deepEqual(messages(inc), ['2026-10-02T11:00 is in the future']);
});

test('nothing goes back to New', () => {
  const inc = OK();
  inc.history[4].state = 'new';
  assert.ok(messages(inc).includes('a ticket cannot go back to New'), messages(inc).join('\n'));
});

test('a state entry must change the state', () => {
  const inc = OK();
  inc.history.splice(3, 1);
  assert.deepEqual(messages(inc), ['the ticket is already In progress; a state entry must change the state']);
});

test('On hold needs a reason, and only On hold has one', () => {
  const inc = OK();
  delete inc.history[3].hold_reason;
  inc.history[2].hold_reason = 'awaiting-caller';
  assert.deepEqual(messages(inc), [
    'only an On hold entry has a hold reason',
    'On hold needs a hold_reason (awaiting-caller, awaiting-vendor, awaiting-change or awaiting-parts)',
  ]);
});

test('Resolved needs a resolution, and only Resolved has one', () => {
  const inc = OK();
  inc.history[4].resolution = inc.history[5].resolution;
  delete inc.history[5].resolution;
  assert.deepEqual(messages(inc), ['only a Resolved entry has a resolution', 'Resolved needs a resolution with a code and notes']);
});

test('reopening a resolved ticket needs a note', () => {
  const inc = OK();
  inc.state = 'in-progress';
  inc.history.push({ at: '2026-09-24T09:00', state: 'in-progress', by: 'priya', source: 'servicenow' });
  assert.deepEqual(messages(inc), ['reopening a resolved ticket needs a note saying why']);
  inc.history[6].note = 'Reopened: it came back.';
  assert.deepEqual(messages(inc), []);
});

test('a resolved ticket can only be reopened to In progress', () => {
  const inc = OK();
  inc.state = 'on-hold';
  inc.history.push({ at: '2026-09-24T09:00', state: 'on-hold', by: 'priya', source: 'servicenow', hold_reason: 'awaiting-caller', note: 'Waiting.' });
  assert.deepEqual(messages(inc), ['a resolved ticket can only be reopened to In progress, not On hold']);
});

test('a state change says who made it', () => {
  const inc = OK();
  delete inc.history[2].by;
  assert.deepEqual(messages(inc), ["the move to In progress doesn't say who made it (by or person)"]);
});

test("the ticket's state must be its last state in history", () => {
  const inc = OK();
  inc.state = 'in-progress';
  assert.deepEqual(messages(inc), ['state is In progress, but the last state in history is Resolved']);
});

// Run the validator on a copy of the repo with one edit applied.
async function withEdit(file, from, to) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'keia-atlas-inc-'));
  try {
    await cp(path.join(root, 'schemas'), path.join(dir, 'schemas'), { recursive: true });
    await cp(path.join(root, 'data'), path.join(dir, 'data'), { recursive: true });
    await cp(path.join(root, 'docs'), path.join(dir, 'docs'), { recursive: true });
    await mkdir(path.join(dir, 'vendor'));
    await symlink(path.join(root, 'vendor', 'keia'), path.join(dir, 'vendor', 'keia'));
    const target = path.join(dir, file);
    const text = await readFile(target, 'utf8');
    assert.ok(text.includes(from), `test setup: "${from}" not found in ${file}`);
    await writeFile(target, text.replace(from, to));
    return (await validate(dir)).errors.map((e) => `${e.file}: ${e.message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const F = 'data/incidents/inc0041203.yaml';

test('an incident about a position the room does not have', async () => {
  const errors = await withEdit(F, 'position: video-bar, device: AG-000382', 'position: codec, device: AG-000382');
  assert.ok(errors.includes(`${F}: "codec" is not a position in dub-4-05's install`), errors.join('\n'));
});

test('an incident naming a unit that is not at that position', async () => {
  const errors = await withEdit(F, 'device: AG-000382', 'device: AG-000383');
  assert.deepEqual(errors, [`${F}: asset tag AG-000383 is not a unit at dub-4-05 / video-bar (AG-000382)`]);
});

test('an incident about a device without its asset tag', async () => {
  const errors = await withEdit(F, ', device: AG-000382', '');
  assert.deepEqual(errors, [`${F}: an incident about a device needs both its position and its asset tag (device)`]);
});

test('a symptom that is not in the device profile', async () => {
  const errors = await withEdit(F, 'symptom: meeting_will_not_start', 'symptom: printer_offline');
  assert.deepEqual(errors, [`${F}: symptom "printer_offline" is not in the video-bar profile's guide (meeting_will_not_start, no_camera_in_laptop_meeting, echo_or_poor_audio)`]);
});

test('a ticket whose state does not match its history', async () => {
  const errors = await withEdit(F, 'state: new\nassignment_group', 'state: in-progress\nassignment_group');
  assert.deepEqual(errors, [`${F}: state is In progress, but the last state in history is New`]);
});

test('a resolved ticket without a resolution fails the schema or the lifecycle', async () => {
  const file = 'data/incidents/inc0041195.yaml';
  const errors = await withEdit(file, '    resolution: { code: fixed, notes: "Facilities reset', '    note: { code: fixed, notes: "Facilities reset');
  assert.ok(errors.length > 0, 'expected a problem');
});
