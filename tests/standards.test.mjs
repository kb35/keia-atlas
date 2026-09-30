// The standards library (data/standards/*.yaml, drawn at /standards/): every rule says why and how to check it,
// cites only references its own file lists, and every model, configuration, class, room profile, related standard
// and data/sources entry it names exists. House standards follow the house words: no em dashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dir = (d) => join(ROOT, 'data', d);
const ids = (d) => new Set(readdirSync(dir(d)).filter((n) => n.endsWith('.yaml')).map((n) => n.slice(0, -5)));
const STD = Object.fromEntries(readdirSync(dir('standards')).filter((n) => n.endsWith('.yaml') && n !== 'cables.yaml')
  .map((n) => [n.slice(0, -5), { raw: readFileSync(join(dir('standards'), n), 'utf8') }]));
for (const s of Object.values(STD)) s.data = parse(s.raw);
const sourceIds = new Set(readdirSync(dir('sources')).flatMap((n) => parse(readFileSync(join(dir('sources'), n), 'utf8')).entries.map((e) => e.id)));
const configIds = new Set(readdirSync(dir('configurations')).map((n) => parse(readFileSync(join(dir('configurations'), n), 'utf8')).id));

test('there are house standards, each named after its file, in a unique order', () => {
  assert.ok(Object.keys(STD).length >= 10, 'the library has its ten standards');
  for (const [file, { data }] of Object.entries(STD)) assert.equal(data.id, file, `${file}.yaml: id must match the file name`);
  const orders = Object.values(STD).map((s) => s.data.order);
  assert.equal(new Set(orders).size, orders.length, 'each standard has its own place in the library');
});

test('every rule is unique in its standard and cites only its own references', () => {
  for (const [file, { data }] of Object.entries(STD)) {
    const refs = new Set(data.references.map((r) => r.id));
    const seen = new Set();
    for (const sec of data.sections) for (const r of sec.rules) {
      assert.ok(!seen.has(r.id), `${file}: rule "${r.id}" is used twice`);
      seen.add(r.id);
      for (const s of r.sources ?? []) assert.ok(refs.has(s), `${file}: rule "${r.id}" cites "${s}", which is not in its references`);
      assert.ok(r.house || (r.sources ?? []).length, `${file}: rule "${r.id}" is neither a house choice nor sourced`);
    }
  }
});

test('references name a public page or a data/sources entry that exists', () => {
  for (const [file, { data }] of Object.entries(STD)) for (const ref of data.references) {
    assert.ok(ref.url || ref.source, `${file}: reference "${ref.id}" needs a url or a source`);
    if (ref.source) assert.ok(sourceIds.has(ref.source), `${file}: reference "${ref.id}" points at source "${ref.source}", which is not in data/sources`);
  }
});

test('what a standard applies to, and the standards it relates to, exist', () => {
  const models = ids('device-models'), classes = ids('device-classes'), types = ids('space-types');
  const stds = new Set([...Object.keys(STD), 'cables']);
  for (const [file, { data }] of Object.entries(STD)) {
    const a = data.applies_to ?? {};
    for (const m of a.models ?? []) assert.ok(models.has(m), `${file}: model "${m}" does not exist`);
    for (const c of a.classes ?? []) assert.ok(classes.has(c), `${file}: class "${c}" does not exist`);
    for (const t of a.space_types ?? []) assert.ok(types.has(t), `${file}: room profile "${t}" does not exist`);
    for (const c of a.configurations ?? []) assert.ok(configIds.has(c), `${file}: configuration "${c}" does not exist`);
    for (const r of data.related ?? []) assert.ok(stds.has(r), `${file}: related standard "${r}" does not exist`);
  }
});

test('standards follow the house words: no em dashes, no double hyphens for dashes', () => {
  for (const [file, { raw }] of Object.entries(STD)) {
    assert.ok(!raw.includes('—'), `${file}.yaml has an em dash`);
    assert.ok(!/\s--\s/.test(raw), `${file}.yaml uses two hyphens as a dash`);
  }
});

test('the display class is managed, and every house display and access point has a configuration or a class to follow', () => {
  const display = parse(readFileSync(join(dir('device-classes'), 'display.yaml'), 'utf8'));
  assert.ok(display.platforms.device_management, 'displays are in fleet management');
  assert.ok(!display.not_applicable.includes('device_management'));
  for (const m of ['samsung-qm65c', 'samsung-qm85c', 'lg-55uh5q-e', 'lg-75uh5q-e']) {
    assert.ok([...readdirSync(dir('configurations'))].some((n) => parse(readFileSync(join(dir('configurations'), n), 'utf8')).models.includes(m)), `${m} has a configuration`);
  }
  assert.ok(existsSync(join(dir('device-classes'), 'wireless-access-point.yaml')));
});
