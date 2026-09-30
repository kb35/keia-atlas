// Classification, privacy records, security support and proposed priority (docs/rules/data.md F10, F11;
// schemas/ext/incident.schema.yaml). Run with:  npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { validate } from '../tools/validate.mjs';
import { LABELS, checkRegistry, fieldLabels, folderLabels, RESTRICTED_VIEWS, restrictedHtml } from '../src/lib/classification.mjs';
import { SENSING_CLASSES, recordFor, shownCount, privacyRows, loadPrivacy } from '../src/lib/privacy.mjs';
import { supportStatus, lastDay, monthLabel } from '../src/lib/security.mjs';
import { checkPriority } from '../tools/crossrefs-incidents.mjs';
import { crossCheckPrivacy, WORKS_COUNCIL_COUNTRIES } from '../tools/crossrefs-privacy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const yaml = (p) => parse(readFileSync(path.join(ROOT, p), 'utf8'));
const dir = (p) => readdirSync(path.join(ROOT, p)).filter((f) => f.endsWith('.yaml')).map((f) => ({ id: f.slice(0, -5), ...yaml(`${p}/${f}`) }));

// ---- Classification ----

test('every data folder has a label, and building facts are Restricted while model facts are Public', () => {
  const labels = folderLabels(ROOT);
  const reg = yaml('schemas/registry.yaml').collections;
  assert.deepEqual(checkRegistry(reg), []);
  for (const c of reg) assert.ok(LABELS.includes(c.classification) && c.classification !== 'Secret', c.folder);
  for (const f of ['floors', 'runs', 'circuits', 'racks', 'house-values']) assert.equal(labels[f], 'Restricted', f);
  for (const f of ['device-models', 'device-classes', 'space-types', 'rack-gear', 'sources', 'known-issues']) assert.equal(labels[f], 'Public', f);
  assert.equal(labels.privacy, 'Internal');
});

test('a unit\'s default password status is a Restricted field', () => {
  const found = fieldLabels(yaml('schemas/ext/install.schema.yaml'));
  assert.ok(found.some((x) => x.at.endsWith('default_password_changed') && x.label === 'Restricted'), JSON.stringify(found));
  assert.ok(fieldLabels(yaml('schemas/ext/vendor.schema.yaml')).some((x) => x.at.endsWith('people') && x.label === 'Restricted'));
});

test('the validator refuses a folder with no label, a Secret folder and a label that is not one of the four', async () => {
  const r = await validate(path.join(ROOT, 'tests/fixtures/classification'));
  const msgs = r.errors.map((e) => e.message);
  assert.ok(msgs.some((m) => m.includes('folder "widgets" needs a classification')), msgs.join('\n'));
  assert.ok(msgs.some((m) => m.includes('folder "gizmos" is labelled Secret')), msgs.join('\n'));
  assert.ok(msgs.some((m) => m.includes('not "Confidential"')), msgs.join('\n'));
  assert.ok(msgs.some((m) => m.includes('x-classification')), msgs.join('\n'));
  assert.equal(r.ok, false);
});

test('the Restricted label names what it is and carries help', () => {
  assert.match(restrictedHtml(RESTRICTED_VIEWS.floorPlan), /data-help="classification.restricted".*Restricted:<\/b> floor plan/);
  const help = readFileSync(path.join(ROOT, 'src/components/Restricted.astro'), 'utf8');
  assert.match(help, /data-help="classification.restricted"/);
  for (const [f, view] of [['src/components/FloorMap.astro', 'floorPlan'], ['src/components/Office3D.astro', 'building3d'], ['src/pages/rooms/[id].astro', 'rack'], ['src/pages/known-issues/[id].astro', 'exposure']]) {
    assert.ok(readFileSync(path.join(ROOT, f), 'utf8').includes(`<Restricted view="${view}" />`), `${f} shows the ${view} label`);
  }
});

// ---- Privacy records ----

const records = loadPrivacy(ROOT);

test('every privacy record counts people per room with a minimum group, and per-person views are off', () => {
  assert.ok(Object.keys(records).length >= 4);
  for (const [id, r] of Object.entries(records)) {
    assert.equal(r.occupancy.per_person_views, false, id);
    if (r.occupancy.counted) assert.ok(r.occupancy.min_group_size >= 3, id);
    assert.ok(r.dpia.ref && r.retention && r.purpose && r.lawful_basis, id);
    for (const c of r.covers.classes) assert.ok(SENSING_CLASSES.includes(c), `${id}: ${c}`);
  }
});

test('a unit finds its record by class and site; other units have none', () => {
  assert.equal(recordFor(records, 'video-bar', 'cph').id, 'meeting-rooms-denmark');
  assert.equal(recordFor(records, 'microphone', 'nyc').id, 'meeting-rooms-americas');
  assert.equal(recordFor(records, 'display', 'dub'), null);
  const rows = Object.fromEntries(privacyRows(records['meeting-rooms-denmark']));
  assert.equal(rows['Per-person views'], 'Off');
  assert.match(rows['Works council'], /SU-CPH-2025-03/);
  assert.match(rows.Occupancy, /never per person/);
});

test('a count below the minimum group size is never shown as a number', () => {
  assert.equal(shownCount(2, 3), 'fewer than 3');
  assert.equal(shownCount(3, 3), '3');
});

test('a site in a works-council country cannot say "no works council"', () => {
  assert.ok(WORKS_COUNCIL_COUNTRIES.includes('DK'));
  const rec = (folder, id, data) => ({ folder, id, file: `data/${folder}/${id}.yaml`, data });
  const base = yaml('data/privacy/meeting-rooms-denmark.yaml');
  const recs = [
    rec('sites', 'cph', { name: 'Copenhagen office', country: 'DK' }),
    rec('device-classes', 'video-bar', {}),
    rec('privacy', 'bad', { ...base, works_council: { none: 'We have none.' } }),
  ];
  const msgs = crossCheckPrivacy(recs).map((p) => p.message);
  assert.ok(msgs.some((m) => m.includes('country with works councils')), msgs.join('\n'));
});

// ---- Security support ----

test('support status: ended, ending within 12 months, or fine', () => {
  assert.equal(lastDay('2027-02'), '2027-02-28');
  assert.equal(monthLabel('2031-03-31'), '31 Mar 2031');
  const at = (date) => supportStatus({ ends: { date } }, '2026-09-28');
  assert.equal(at('2019-06').state, 'ended');
  assert.equal(at('2019-06').chip, 'Security support ended');
  assert.equal(at('2027-06').state, 'soon');
  assert.equal(at('2027-06').chip, 'Security support ends Jun 2027');
  // Warnings at 12, 6 and 3 months (V9 H3): To review until the last three months, then a fault.
  assert.equal(at('2027-06').step, 12);
  assert.equal(at('2027-02').step, 6);
  assert.equal(at('2026-11').step, 3);
  assert.equal(at('2026-11').tone, 'bad');
  assert.equal(at('2027-02').tone, 'warn');
  assert.equal(at('2031-03').state, 'ok');
  assert.equal(at('2031-03').chip, null);
  assert.equal(supportStatus(undefined, '2026-09-28').text, 'Not recorded');
});

test('support dates are cited or marked as demo values, and the demo shows every state', () => {
  const models = dir('data/device-models').filter((m) => m.security_support);
  assert.ok(models.length >= 40);
  const cited = models.filter((m) => m.security_support.ends.source);
  assert.deepEqual(cited.map((m) => m.id), ['cisco-desk-pro']);
  for (const m of models) assert.ok(Boolean(m.security_support.ends.source) !== Boolean(m.security_support.ends.demo), m.id);
  const states = new Set(models.map((m) => supportStatus(m.security_support, '2026-09-28').state));
  for (const s of ['ended', 'soon', 'ok']) assert.ok(states.has(s), s);
});

test('two units are still on the maker\'s default password, so the warning shows', () => {
  const text = readdirSync(path.join(ROOT, 'data/installs'), { recursive: true }).filter((f) => f.endsWith('.yaml'))
    .map((f) => readFileSync(path.join(ROOT, 'data/installs', f), 'utf8')).join('\n');
  assert.equal((text.match(/default_password_changed: false/g) ?? []).length, 2);
  assert.ok((text.match(/default_password_changed: true/g) ?? []).length > 100);
});

// ---- Proposed priority ----

test('priority in force is the proposal, or the person\'s change with a reason', () => {
  assert.deepEqual(checkPriority({ priority: 3, priority_proposed: 3, opened: '2026-09-28T09:12' }), []);
  assert.deepEqual(checkPriority({ priority: 2, priority_proposed: 3, opened: '2026-09-28T09:12', priority_override: { priority: 2, reason: 'Board meeting', by: 'denise', at: '2026-09-28T09:14' } }), []);
  assert.match(checkPriority({ priority: 2, priority_proposed: 3, opened: '2026-09-28T09:12' })[0].message, /priority must equal priority_proposed/);
  assert.match(checkPriority({ priority: 3, priority_proposed: 3, opened: '2026-09-28T09:12', priority_override: { priority: 3, reason: 'x', by: 'denise', at: '2026-09-28T09:14' } })[0].message, /already the proposal/);
  assert.match(checkPriority({ priority: 2, priority_proposed: 3, opened: '2026-09-28T09:12', priority_override: { priority: 2, reason: 'x', by: 'denise', at: '2026-09-28T09:00' } })[0].message, /before the ticket was opened/);
});

test('two demo incidents show a changed priority, one raised and one lowered', () => {
  const inc = dir('data/incidents');
  assert.ok(inc.every((i) => [1, 2, 3, 4].includes(i.priority_proposed)));
  const changed = inc.filter((i) => i.priority_override);
  assert.deepEqual(changed.map((i) => i.number).sort(), ['INC0041172', 'INC0041188']);
  assert.ok(changed.some((i) => i.priority < i.priority_proposed) && changed.some((i) => i.priority > i.priority_proposed));
  for (const i of changed) assert.equal(i.priority, i.priority_override.priority);
});
