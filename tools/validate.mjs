#!/usr/bin/env node
// Keia Atlas data validator.
//
// What it does, in order:
//   1. Reads schemas/registry.yaml, which says which schema checks which data folder.
//   2. Loads every *.schema.yaml under schemas/ (JSON Schema draft 2020-12, written in YAML).
//   3. Walks data/. Every file must sit in a registered folder, be valid YAML,
//      pass that folder's schema, and hold no literal secret (tools/secrets.mjs:
//      a password, token or key field must be a vault reference).
//   4. Checks classification (docs/rules/data.md F10): every folder has a default label in the registry,
//      every x-classification in a schema is one of the four labels, and no folder is Secret.
//
// Run it with:  npm run validate
// Exit code 0 means everything passed, 1 means at least one problem.
//
// Later steps add cross-reference checks (a space pointing at a real space type,
// a connection pointing at real ports) and the Keia drift check.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parseDocument, LineCounter } from 'yaml';
import { crossCheck } from './crossrefs.mjs';
import { findSecrets } from './secrets.mjs';
import { LABELS, KEYWORD, checkRegistry } from '../src/lib/classification.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const YAML_EXT = new Set(['.yaml', '.yml']);

// List every file under a folder, skipping hidden files like .gitkeep.
async function listFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(full)));
    else files.push(full);
  }
  return files.sort();
}

// Parse YAML strictly: duplicate keys and syntax errors are failures, not warnings.
function parseYaml(text) {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { uniqueKeys: true, lineCounter, prettyErrors: true });
  if (doc.errors.length > 0) {
    const e = doc.errors[0];
    const line = e.linePos?.[0]?.line;
    const err = new Error(e.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, ''));
    err.line = line;
    throw err;
  }
  return { doc, data: doc.toJS(), lineCounter };
}

// Turn an Ajv error into a sentence a person can act on.
function describe(error) {
  const where = error.instancePath
    ? error.instancePath.slice(1).split('/').join('.')
    : '(top level)';
  switch (error.keyword) {
    case 'required':
      return `${where}: missing required field "${error.params.missingProperty}"`;
    case 'additionalProperties':
      return `${where}: unknown field "${error.params.additionalProperty}"`;
    case 'enum':
      return `${where}: must be one of ${error.params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`;
    default:
      return `${where}: ${error.message}`;
  }
}

// Find the line in the YAML file that an error points at, so messages read file.yaml:12.
function lineOf(error, doc, lineCounter) {
  const segments = error.instancePath
    .split('/')
    .slice(1)
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
  // For an unknown field, point at the field itself rather than its parent.
  if (error.keyword === 'additionalProperties') segments.push(error.params.additionalProperty);
  const node = segments.length ? doc.getIn(segments, true) : doc.contents;
  const offset = node?.range?.[0];
  return offset === undefined ? undefined : lineCounter.linePos(offset).line;
}

export async function validate(root = REPO_ROOT) {
  const schemasDir = path.join(root, 'schemas');
  const dataDir = path.join(root, 'data');
  const errors = [];
  const problem = (file, message, line) =>
    errors.push({ file: path.relative(root, file), line, message });
  const result = () => ({
    ok: errors.length === 0,
    schemas: schemaFiles.length,
    collections: collections.length,
    checked,
    errors,
  });

  let schemaFiles = [];
  let collections = [];
  let checked = 0;

  // 1. The registry.
  const registryPath = path.join(schemasDir, 'registry.yaml');
  try {
    const { data } = parseYaml(await readFile(registryPath, 'utf8'));
    collections = data?.collections ?? [];
    if (!Array.isArray(collections)) {
      problem(registryPath, '"collections" must be a list');
      collections = [];
    }
    for (const m of checkRegistry(collections)) problem(registryPath, m);
  } catch (err) {
    problem(registryPath, `could not read the registry: ${err.message}`, err.line);
    return result();
  }

  // 2. The schemas. Add them all first so one schema can $ref another.
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  // A field's label (x-classification: Restricted). Ajv's strict mode refuses unknown keywords, so the
  // label is declared here, and a label that is not one of the four fails the schema.
  ajv.addKeyword({ keyword: KEYWORD, schemaType: 'string', metaSchema: { enum: LABELS } });
  schemaFiles = (await listFiles(schemasDir)).filter((f) => f.endsWith('.schema.yaml'));
  const idByPath = new Map();
  for (const file of schemaFiles) {
    try {
      const { data } = parseYaml(await readFile(file, 'utf8'));
      if (!data?.$id) {
        problem(file, 'schema has no $id');
        continue;
      }
      ajv.addSchema(data);
      idByPath.set(path.relative(schemasDir, file), data.$id);
    } catch (err) {
      problem(file, `schema could not be loaded: ${err.message}`, err.line);
    }
  }

  // Compile one checker per registered folder.
  const checkers = new Map();
  for (const entry of collections) {
    const id = idByPath.get(entry?.schema);
    if (!entry?.folder || !entry?.schema) {
      problem(registryPath, `each collection needs "folder" and "schema": ${JSON.stringify(entry)}`);
    } else if (!id) {
      problem(registryPath, `folder "${entry.folder}" points at schema "${entry.schema}", which was not found or did not load`);
    } else {
      try {
        checkers.set(entry.folder, ajv.getSchema(id));
      } catch (err) {
        problem(path.join(schemasDir, entry.schema), `schema is invalid: ${err.message}`);
      }
    }
  }

  // 3. The data. Files that pass their schema are kept for the cross-reference checks.
  const records = [];
  for (const file of await listFiles(dataDir)) {
    const [folder, ...rest] = path.relative(dataDir, file).split(path.sep);
    if (rest.length === 0) {
      problem(file, 'data files must sit inside a folder under data/, such as data/device-models/');
      continue;
    }
    if (!YAML_EXT.has(path.extname(file))) {
      problem(file, 'only .yaml files belong under data/');
      continue;
    }
    if (!collections.some((c) => c?.folder === folder)) {
      problem(file, `folder "${folder}" is not listed in schemas/registry.yaml`);
      continue;
    }
    const check = checkers.get(folder);
    if (!check) continue; // its schema failed to load; already reported
    checked += 1;
    try {
      const { doc, data, lineCounter } = parseYaml(await readFile(file, 'utf8'));
      // No literal secrets, whatever the schema says.
      for (const f of findSecrets(data, path.relative(dataDir, file).split(path.sep).join('/'))) {
        const node = doc.getIn(f.at, true);
        problem(file, f.message, node?.range ? lineCounter.linePos(node.range[0]).line : undefined);
      }
      if (!check(data)) {
        for (const e of check.errors) problem(file, describe(e), lineOf(e, doc, lineCounter));
      } else {
        records.push({ folder, file, rel: path.relative(root, file), id: path.basename(file, path.extname(file)), data, doc, lineCounter });
      }
    } catch (err) {
      problem(file, `not valid YAML: ${err.message}`, err.line);
    }
  }

  // 4. Cross-references: links between files must point at things that exist.
  for (const p of crossCheck(records, root)) {
    const rec = records.find((r) => r.file === p.file);
    const node = rec && p.at?.length ? rec.doc.getIn(p.at, true) : undefined;
    const line = node?.range ? rec.lineCounter.linePos(node.range[0]).line : undefined;
    problem(p.file, p.message, line);
  }

  return result();
}

// Command line: print a summary a person can read.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ? path.resolve(process.argv[2]) : REPO_ROOT;
  const r = await validate(root);
  console.log(`Keia Atlas validator`);
  console.log(`  schemas loaded:     ${r.schemas}`);
  console.log(`  data folders:       ${r.collections}`);
  console.log(`  data files checked: ${r.checked}`);
  if (r.ok) {
    console.log(`\nPASS: no problems found`);
  } else {
    console.log(`\nFAIL: ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}`);
    for (const e of r.errors) console.log(`  ${e.file}${e.line ? `:${e.line}` : ''}  ${e.message}`);
    process.exitCode = 1;
  }
}
