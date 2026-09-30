// Keia drift test.
//
// Keia Atlas keeps strict JSON Schema copies of the Keia schemas it uses
// (schemas/keia/). This test reads Keia's originals from the pinned submodule
// and fails if a copy disagrees with its original about:
//   - the schema version
//   - which fields exist, at each level Keia documents
//   - which of those fields are required
//
// So when the Keia pin moves and Keia has changed a schema, this test says
// exactly what to update, instead of the copies silently going stale.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = async (p) => parse(await readFile(path.join(root, p), 'utf8'));

// Keia describes fields two ways: a map of {field: {required: bool}}, or
// lists of required_fields and optional_fields. Turn either into {field: required}.
function keiaFields(node) {
  const out = {};
  if (node.fields) {
    for (const [k, v] of Object.entries(node.fields)) out[k] = Boolean(v?.required);
  }
  for (const k of node.required_fields ?? []) out[k] = true;
  for (const k of node.optional_fields ?? []) out[k] = false;
  if (!node.fields && !node.required_fields) {
    for (const [k, v] of Object.entries(node)) out[k] = Boolean(v?.required);
  }
  return out;
}

// The same, from one object level of our JSON Schema.
function ourFields(schemaNode) {
  const req = new Set(schemaNode.required ?? []);
  const out = {};
  for (const k of Object.keys(schemaNode.properties ?? {})) out[k] = req.has(k);
  return out;
}

// Compare one level. `keyed` are Keia fields that our copy stores as map keys;
// `extras` are fields Keia's own example files use that its schema doesn't list.
function compare(label, keia, ours, { keyed = [], extras = [], ignore = [] } = {}) {
  const problems = [];
  for (const [name, required] of Object.entries(keia)) {
    if (ignore.includes(name) || keyed.includes(name)) continue;
    if (!(name in ours)) problems.push(`${label}: Keia has "${name}", the copy doesn't`);
    else if (ours[name] !== required)
      problems.push(`${label}: "${name}" is ${required ? 'required' : 'optional'} in Keia but ${ours[name] ? 'required' : 'optional'} in the copy`);
  }
  for (const name of Object.keys(ours)) {
    if (ignore.includes(name) || extras.includes(name)) continue;
    if (!(name in keia)) problems.push(`${label}: the copy has "${name}", Keia doesn't`);
  }
  return problems;
}

function versionOf(copy) {
  return /keia-schema-version:\s*([\d.]+)/.exec(copy.$comment ?? '')?.[1];
}

test('composite-profile copy matches Keia', async () => {
  const keia = await load('vendor/keia/schemas/content/composite-profile.schema.yaml');
  const copy = await load('schemas/keia/composite-profile.schema.yaml');
  const s = keia.structure;
  const problems = [
    ...(versionOf(copy) === keia.version ? [] : [`version: Keia ${keia.version}, copy ${versionOf(copy)}`]),
    ...compare('top level', keiaFields(s), ourFields(copy), { ignore: ['schema'] }),
    ...compare('profile', keiaFields(s.profile), ourFields(copy.properties.profile)),
    ...compare('equipment category', keiaFields(s.equipment_categories.items.category_entry),
      ourFields(copy.properties.equipment_categories.items), { extras: ['notes'] }),
  ];
  assert.deepEqual(problems, []);
});

test('object-profile copy matches Keia', async () => {
  const keia = await load('vendor/keia/schemas/content/object-profile.schema.yaml');
  const copy = await load('schemas/keia/object-profile.schema.yaml');
  const s = keia.structure;
  const p = copy.properties;
  const problems = [
    ...(versionOf(copy) === keia.version ? [] : [`version: Keia ${keia.version}, copy ${versionOf(copy)}`]),
    ...compare('top level', keiaFields(s), ourFields(copy), { ignore: ['schema'] }),
    ...compare('profile', keiaFields(s.profile), ourFields(p.profile)),
    // The one deliberate difference: Keia's required_fields is helpful_fields in the copy, and the old name
    // is still accepted but no longer required (see the copy's header).
    ...compare('platform', keiaFields(s.platforms.items.platform_entry),
      ourFields(p.platforms.additionalProperties),
      { keyed: ['platform_name'], ignore: ['required_fields'], extras: ['helpful_fields'] }),
    ...compare('consistency check', keiaFields(s.consistency.items.consistency_check), ourFields(p.consistency.items)),
    ...compare('discrimination entry', keiaFields(s.discrimination.items.discrimination_entry),
      ourFields(p.discrimination.additionalProperties), { keyed: ['symptom'] }),
  ];
  assert.deepEqual(problems, []);
});

test('source-entry copy matches Keia', async () => {
  const keia = await load('vendor/keia/schemas/content/source-entry.schema.yaml');
  const copy = await load('schemas/keia/source-entry.schema.yaml');
  const s = keia.structure;
  const entry = copy.$defs.entry;
  const problems = [
    ...(versionOf(copy) === keia.version ? [] : [`version: Keia ${keia.version}, copy ${versionOf(copy)}`]),
    ...compare('entry', keiaFields(s), ourFields(entry)),
    ...compare('access tier', keiaFields(s.access.items.access_tier), ourFields(entry.properties.access.items)),
  ];
  assert.deepEqual(problems, []);
});

test('the drift check itself spots a difference', () => {
  const problems = compare('demo', { a: true, b: false }, { a: false, c: true });
  assert.deepEqual(problems, [
    'demo: "a" is required in Keia but optional in the copy',
    'demo: Keia has "b", the copy doesn\'t',
    'demo: the copy has "c", Keia doesn\'t',
  ]);
});
