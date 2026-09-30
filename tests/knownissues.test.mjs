// Tests for known issues and maker cases (decision 0029).
//
// The matching rules (src/lib/knownissues.mjs) are tested on small made-up inputs; the cross-reference checks
// (tools/crossrefs-knownissues.mjs) run the validator on a copy of the repo with one edit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../tools/validate.mjs';
import { versionIn, matchIncident, exposure, affectsUs, findClusters, fixPlan, bySite } from '../src/lib/knownissues.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A known issue in the shape of data/known-issues.
const ISSUE = () => ({
  id: 'KI-1', models: ['bar-x'], affected: ['4.6.1', '4.6.2'], status: 'open',
  symptoms: ['controller_shows_not_paired'], signs: ['not paired', 'restart'],
});
const INC = (o = {}) => ({ number: 'INC1', model: 'bar-x', firmware: '4.6.2', firmwareFrom: 'ticket', symptom: 'controller_shows_not_paired', text: 'the panel says not paired since the restart', roomModels: ['bar-x'], ...o });

test('versions: exact, and "x" for a whole line', () => {
  assert.ok(versionIn('4.6.2', ['4.6.1', '4.6.2']));
  assert.ok(!versionIn('4.6.3', ['4.6.1', '4.6.2']));
  assert.ok(versionIn('1.12.225', ['1.12.x']));
  assert.ok(versionIn('1.12', ['1.12.x']));
  assert.ok(!versionIn('1.120.1', ['1.12.x']));
  assert.ok(!versionIn(null, ['1.12.x']));
});

test('a strong match needs the model, an affected version, the symptom and the maker\'s words', () => {
  const m = matchIncident(ISSUE(), INC());
  assert.equal(m.confidence, 'strong');
  assert.deepEqual(m.reasons.map((r) => r.ok), [true, true, true, true]);
});

test('without a version the match is only possible', () => {
  const m = matchIncident(ISSUE(), INC({ firmware: null, firmwareFrom: null }));
  assert.equal(m.confidence, 'possible');
  assert.equal(m.reasons[1].ok, null);
});

test('the symptom alone, or the words alone, is possible', () => {
  assert.equal(matchIncident(ISSUE(), INC({ text: 'nothing works' })).confidence, 'possible');
  assert.equal(matchIncident(ISSUE(), INC({ symptom: null })).confidence, 'possible');
});

test('no match: another model, a version the maker doesn\'t list, no sign of the symptom', () => {
  assert.equal(matchIncident(ISSUE(), INC({ model: 'bar-y' })), null);
  assert.equal(matchIncident(ISSUE(), INC({ firmware: '5.0.1' })), null);
  assert.equal(matchIncident(ISSUE(), INC({ symptom: 'no_picture', text: 'the screen is blank' })), null);
});

test('the maker\'s condition: a room without the companion model, or a condition no room meets', () => {
  const needs = { ...ISSUE(), needs: { text: 'An external camera', with_models: ['cam-1'] } };
  assert.equal(matchIncident(needs, INC()), null);
  assert.equal(matchIncident(needs, INC({ roomModels: ['bar-x', 'cam-1'] })).confidence, 'strong');
  assert.equal(matchIncident({ ...ISSUE(), needs: { text: 'Wi-Fi in use', never: 'Wired only' } }, INC()), null);
});

test('exposure: affected, unknown and safe units, each safe one says why', () => {
  const units = [
    { tag: 'A', model: 'bar-x', site: 'dub', firmware: '4.6.2', roomModels: ['bar-x'] },
    { tag: 'B', model: 'bar-x', site: 'nyc', firmware: '4.7.0', roomModels: ['bar-x'] },
    { tag: 'C', model: 'bar-x', site: 'nyc', firmware: null, roomModels: ['bar-x'] },
    { tag: 'D', model: 'other', site: 'nyc', firmware: '4.6.2', roomModels: [] },
  ];
  const ex = exposure(ISSUE(), units);
  assert.deepEqual(ex.exposed.map((u) => u.tag), ['A']);
  assert.deepEqual(ex.unknown.map((u) => u.tag), ['C']);
  assert.deepEqual(ex.safe.map((u) => [u.tag, u.why]), [['B', 'version']]);
  assert.equal(affectsUs(ex), 'yes');
  assert.equal(affectsUs(exposure(ISSUE(), units.slice(1, 3))), 'maybe');
  assert.equal(affectsUs(exposure(ISSUE(), units.slice(1, 2))), 'no');
  const cam = exposure({ ...ISSUE(), needs: { text: 'x', with_models: ['cam-1'] } }, units);
  assert.deepEqual(cam.safe.map((u) => u.why), ['need', 'need', 'need']);
  assert.deepEqual(bySite(ex.exposed.concat(ex.unknown), ['nyc', 'dub']).map((g) => g.site), ['nyc', 'dub']);
});

// Incidents for the repeat rule, relative to a made-up today of 28 Sept.
const R = (number, site, opened, o = {}) => ({ number, model: 'mic-1', symptom: 'far_end_cannot_hear', site, opened, explained: false, ...o });

test('a repeat: three in 30 days, or two in two offices', () => {
  const three = findClusters([R('1', 'dub', '2026-09-10T09:00'), R('2', 'dub', '2026-09-20T09:00'), R('3', 'dub', '2026-09-27T09:00')], { today: '2026-09-28' });
  assert.equal(three.length, 1);
  assert.equal(three[0].why, '3 incidents in 30 days');
  const two = findClusters([R('1', 'dub', '2026-09-10T09:00'), R('2', 'nyc', '2026-09-20T09:00')], { today: '2026-09-28' });
  assert.equal(two[0].why, '2 incidents in 2 offices');
  assert.deepEqual(findClusters([R('1', 'dub', '2026-09-10T09:00'), R('2', 'dub', '2026-09-20T09:00')], { today: '2026-09-28' }), []);
});

test('a repeat leaves out old, explained and already matched incidents', () => {
  const list = [R('1', 'dub', '2026-08-01T09:00'), R('2', 'nyc', '2026-09-20T09:00'), R('3', 'mel', '2026-09-21T09:00', { explained: true }), R('4', 'cph', '2026-09-22T09:00')];
  assert.deepEqual(findClusters(list, { today: '2026-09-28' })[0].incidents.map((i) => i.number), ['2', '4']);
  assert.deepEqual(findClusters(list, { today: '2026-09-28', matched: new Set(['4']) }), []);
});

test('the fix, in words: none yet, blocked, a rollout, the standard, propose, won\'t fix', () => {
  assert.equal(fixPlan(ISSUE()).kind, 'none');
  const fixed = { ...ISSUE(), status: 'fixed', fixed_in: '5.0.1' };
  assert.equal(fixPlan(fixed, { release: { status: 'blocked', advisory: 'ADV-001' } }).kind, 'blocked');
  assert.match(fixPlan(fixed, { release: { status: 'blocked', advisory: 'ADV-001' } }).text, /ADV-001/);
  assert.equal(fixPlan(fixed, { rollout: { id: 'PRJ-1', name: 'Rollout' } }).kind, 'rollout');
  assert.equal(fixPlan(fixed, { release: { status: 'standard' } }).kind, 'standard');
  assert.equal(fixPlan(fixed).kind, 'propose');
  assert.equal(fixPlan({ ...ISSUE(), status: 'wont-fix' }).kind, 'wont-fix');
});

// ---- The cross-reference checks, on a copy of the data --------------------------------------------------------
async function withEdit(file, from, to) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'keia-atlas-ki-'));
  try {
    for (const d of ['schemas', 'data', 'docs']) await cp(path.join(root, d), path.join(dir, d), { recursive: true });
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

test('a fixed known issue must say which version fixes it', async () => {
  const errors = await withEdit('data/known-issues/unifi.yaml', '    fixed_in: 4.2.3\n', '');
  assert.deepEqual(errors, ['data/known-issues/unifi.yaml: a fixed known issue says which version fixes it (fixed_in)']);
});

test('an affected version that is not a release of the firmware line', async () => {
  const errors = await withEdit('data/known-issues/poly-videoos.yaml', 'affected: [5.0.1.470014]\n    status: open\n    symptom: The touch controller', 'affected: [5.0.2.470099]\n    status: open\n    symptom: The touch controller');
  assert.deepEqual(errors, ['data/known-issues/poly-videoos.yaml: 5.0.2.470099 is not a release of poly-videoos']);
});

test('made-up data says so', async () => {
  const errors = await withEdit('data/known-issues/netgear.yaml', '    demo: true\n', '\n');
  assert.deepEqual(errors, [
    'data/known-issues/netgear.yaml: every issue in a demo feed says demo: true',
    'data/known-issues/netgear.yaml: "demo-netgear-known-issues" is a demo source; the issue must say demo: true',
  ]);
});

test('a maker case must name a known issue from its own maker', async () => {
  const errors = await withEdit('data/maker-cases/mc-001.yaml', 'known_issue: POLY-TC10-RESTART', 'known_issue: DEMO-LOGI-TAP-0142');
  assert.deepEqual(errors, ['data/maker-cases/mc-001.yaml: known issue "DEMO-LOGI-TAP-0142" is in the logitech feed, not poly-videoos']);
});

test('a maker case\'s status is the last status in its history', async () => {
  const errors = await withEdit('data/maker-cases/mc-002.yaml', 'status: sent\nraised', 'status: closed\nraised');
  assert.deepEqual(errors, ['data/maker-cases/mc-002.yaml: status is closed, but the last status in history is sent']);
});
