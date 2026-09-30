// Tests for the cross-reference checks.
//
// Copies the real data into a temporary folder, breaks one link at a time,
// and checks the validator reports exactly that problem.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../tools/validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Run the validator on a copy of the repo with one edit applied.
async function withEdit(file, from, to) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'keia-atlas-'));
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

test('a space type naming a device class that does not exist', async () => {
  const errors = await withEdit('data/space-types/huddle-room-sofa.yaml', 'class: touch-controller', 'class: touch-panel');
  assert.deepEqual(errors, ['data/space-types/huddle-room-sofa.yaml: device class "touch-panel" does not exist']);
});

test('a guideline id that is not in the source registry', async () => {
  const errors = await withEdit('data/space-types/focus-room.yaml', 'guideline: zoom-hardware-guide', 'guideline: zoom-hardware-guid');
  assert.deepEqual(errors, ['data/space-types/focus-room.yaml: guideline "zoom-hardware-guid" is not a source entry id']);
});

test('an object_profile path that does not resolve', async () => {
  const errors = await withEdit('data/space-types/focus-room.yaml',
    'object_profile: data/device-classes/monitor.yaml', 'object_profile: data/device-classes/monitors.yaml');
  assert.ok(errors.includes('data/space-types/focus-room.yaml: device class "monitors" does not exist'), errors.join('\n'));
  assert.ok(errors.includes('data/space-types/focus-room.yaml: device class "monitor" is used in an option but no equipment category points at it'), errors.join('\n'));
});

test('a space_type that does not match its file name', async () => {
  const errors = await withEdit('data/space-types/huddle-room-small.yaml', 'space_type: huddle-room-small', 'space_type: huddle-room-smal');
  assert.deepEqual(errors, ['data/space-types/huddle-room-small.yaml: space_type "huddle-room-smal" must match the file name "huddle-room-small"']);
});

test('a source id used twice', async () => {
  const errors = await withEdit('data/sources/room-guidance.yaml', 'id: zoom-huddle-space', 'id: zoom-hardware-guide');
  assert.ok(errors.some((e) => e.includes('source id "zoom-hardware-guide" is already used')), errors.join('\n'));
});

test('an option claiming a laptop system its devices do not list', async () => {
  const errors = await withEdit('data/space-types/remote-home.yaml',
    'clients:\n        - macos\n        - windows\n', 'clients:\n        - macos\n        - windows\n        - linux\n');
  assert.deepEqual(errors, ['data/space-types/remote-home.yaml: option "usb-c-monitor" serves linux, but dell-p2726deb doesn\'t list it in client_os']);
});

test('an industry space type without its guideline', async () => {
  const errors = await withEdit('data/space-types/pantry.yaml', '  guideline: avixa-v202-display-image-size\n', '');
  assert.deepEqual(errors, ['data/space-types/pantry.yaml: an industry space type must name its guideline']);
});

test('a space on a floor its site does not have', async () => {
  const errors = await withEdit('data/spaces/jnu/jnu-2-01.yaml', 'floor: "2"', 'floor: "3"');
  assert.ok(errors.includes('data/spaces/jnu/jnu-2-01.yaml: floor "3" is not a floor of jnu'), errors.join('\n'));
});

test('a space built to an option its space type does not have', async () => {
  const errors = await withEdit('data/spaces/jnu/jnu-2-02.yaml', 'option: single-display', 'option: triple-display');
  assert.deepEqual(errors, ['data/spaces/jnu/jnu-2-02.yaml: space type "conference-room-small" has no option "triple-display"']);
});

test('wiring to a port the model does not have', async () => {
  const errors = await withEdit('data/space-types/huddle-room-small.yaml', 'from: video-bar.hdmi-out-1', 'from: video-bar.hdmi-out-9');
  assert.deepEqual(errors, ['data/space-types/huddle-room-small.yaml: option "byom": video-bar.hdmi-out-9: logitech-meetup-2 has no port "hdmi-out-9"']);
});

test('a cable that does not fit the connector', async () => {
  const errors = await withEdit('data/space-types/huddle-room-small.yaml', 'to: display.hdmi-in-1\n          cable: hdmi', 'to: display.hdmi-in-1\n          cable: displayport');
  assert.deepEqual(errors, ['data/space-types/huddle-room-small.yaml: option "byom": a displayport cable doesn\'t fit hdmi (video-bar.hdmi-out-1)']);
});

test('one port used by two cables', async () => {
  const errors = await withEdit('data/space-types/huddle-room-small.yaml', 'from: video-bar.usb-c-1', 'from: video-bar.hdmi-out-1');
  assert.ok(errors.some((e) => e.includes('video-bar#1.hdmi-out-1 is used by two cables')), errors.join('\n'));
});

test('an install missing a required position', async () => {
  const errors = await withEdit('data/installs/jnu/jnu-2-02.yaml', 'position: touch-controller', 'position: touch-controlr');
  assert.ok(errors.includes('data/installs/jnu/jnu-2-02.yaml: missing position touch-controller'), errors.join('\n'));
});

test('two units with the same serial', async () => {
  const errors = await withEdit('data/installs/nyc/nyc-20-05.yaml', 'serial: DEMO-NYC-000616', 'serial: DEMO-NYC-000615');
  assert.ok(errors.includes('data/installs/nyc/nyc-20-05.yaml: serial DEMO-NYC-000615 is already used in nyc-20-05'), errors.join('\n'));
});

test('a device class that spaces use but the refresh policy leaves out', async () => {
  const errors = await withEdit('data/refresh-policy/aigna.yaml', '  - { class: dock, years: 4 }\n', '');
  assert.deepEqual(errors, ['data/refresh-policy/aigna.yaml: no refresh policy for device class "dock", which spaces use']);
});

test('a refresh task whose low estimate is above its high one', async () => {
  const errors = await withEdit('data/refresh-policy/aigna.yaml', 'low: 1\n    high: 3', 'low: 4\n    high: 3');
  assert.deepEqual(errors, ['data/refresh-policy/aigna.yaml: configure: low estimate 4 is above high 3']);
});

test('a setup step that waits for a later step', async () => {
  const errors = await withEdit('data/configurations/poly-x-google-meet.yaml', 'after: [admin-password]\n    why_order: "Device Management', 'after: [provider]\n    why_order: "Device Management');
  assert.deepEqual(errors, ['data/configurations/poly-x-google-meet.yaml: setup step "updates-off" waits for "provider", which is not an earlier step']);
});

test('a setup step that waits without saying why', async () => {
  const errors = await withEdit('data/configurations/poly-x-google-meet.yaml', '    why_order: "The enrolment code only appears after the restart into Google Meet."\n', '');
  assert.deepEqual(errors, ['data/configurations/poly-x-google-meet.yaml: setup step "enrol" waits for another step but does not say why']);
});

// Decision 0025: the Deploy phase, home offices and task dates.
test('a playbook with its phases out of order', async () => {
  const errors = await withEdit('data/playbooks/custom-room.yaml', '  - phase: handover', '  - phase: design');
  assert.ok(errors.some((e) => e.startsWith('data/playbooks/custom-room.yaml: phase "design" comes after "integrate"')), errors.join('\n'));
});

test('a home office near an office in another region', async () => {
  const errors = await withEdit('data/spaces/rem/rem-bray-01.yaml', 'near: dub', 'near: nyc');
  assert.ok(errors.includes('data/spaces/rem/rem-bray-01.yaml: near "nyc" is in amer, but rem is the remote site for emea'), errors.join('\n'));
});

test('a home office without its town', async () => {
  const errors = await withEdit('data/spaces/rap/rap-chiba-01.yaml', 'town: Chiba\n', '');
  assert.deepEqual(errors, ['data/spaces/rap/rap-chiba-01.yaml: a home office needs its town']);
});

test('a task that starts after it is due', async () => {
  const errors = await withEdit('data/projects/prj-20.yaml', 'start: "2026-10-06", due: "2026-10-06"', 'start: "2026-10-09", due: "2026-10-06"');
  assert.deepEqual(errors, ['data/projects/prj-20.yaml: T-2003 starts 2026-10-09, after it is due (2026-10-06)']);
});

// Device classes list helpful fields, not required ones (see schemas/keia/object-profile.schema.yaml).
test('a device class still written with Keia\'s required_fields passes', async () => {
  const errors = await withEdit('data/device-classes/video-bar.yaml', 'keia_atlas:\n    helpful_fields:', 'keia_atlas:\n    required_fields:');
  assert.deepEqual(errors, []);
});

test('a consistency check on a field its platform does not list', async () => {
  const errors = await withEdit('data/device-classes/video-bar.yaml', '      - keia_atlas.serial\n', '      - keia_atlas.colour\n');
  assert.deepEqual(errors, ['data/device-classes/video-bar.yaml: "keia_atlas.colour": "colour" is not in keia_atlas\'s helpful_fields']);
});

test('a platform with no fields listed at all', async () => {
  const errors = await withEdit('data/device-classes/video-bar.yaml', '  monitoring:\n    helpful_fields:\n      - monitor_name\n', '  monitoring:\n');
  assert.ok(errors.some((e) => e.startsWith('data/device-classes/video-bar.yaml:')), errors.join('\n'));
});
