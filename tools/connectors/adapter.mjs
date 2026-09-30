// The Keia connector adapter interface, v0 (docs/connectors/README.md).
//
// An adapter translates one system (a spreadsheet, NetBox, later ServiceNow or a device platform) into the
// Keia canonical model (docs/connectors/model.md, schemas/connectors/). Think of it as a channel strip on a
// mixing desk: every source plugs into its own strip, which brings it to one standard level, so the pages
// never care where a value came from.
//
// An adapter is a plain object with four parts:
//
//   manifest   what it can do, declared up front (schemas/connectors/manifest.schema.yaml): the kinds of
//              record, the actions (read only in v0), every field it fills and who owns each one, how it
//              learns about changes, its rate budget on the other system, the hosts it may reach, the
//              credentials it needs (vault references only) and its tier (community or certified).
//   list(source, kind)        every native record of one kind, as the system gives it.
//   get(source, kind, key)    one native record by the system's own id, or undefined.
//   map(kind, native, ctx)    one native record in Keia's shape. It returns the canonical fields the
//                             manifest declares, plus `source: { record_id, url }`. The runner adds the rest
//                             of the source mark, keeps the native record aside in `raw` (with anything that
//                             looks like a secret emptied) and checks the result against the schema.
//
// and optionally open(file, options), which turns the input into the `source` the other three read. File
// adapters parse the export here; a live adapter would open its connection here, using a credential it asks
// the vault for by reference, never a value from the repository.
//
// defineAdapter() checks all of this when the adapter is loaded, so a bad manifest fails at once, not halfway
// through an import.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';
import { looksLikeSecretKey, isVaultReference } from '../secrets.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA_DIR = path.join(REPO_ROOT, 'schemas', 'connectors');
const ID_BASE = 'https://kb35.github.io/keia-atlas/schemas/connectors/';

// Spaces first, so the places exist before the units placed in them.
export const KINDS = ['space', 'unit', 'ticket', 'event'];
// Where each kind is kept under data/connected/<system>/.
export const KIND_FOLDER = { unit: 'units', space: 'spaces', ticket: 'tickets', event: 'events' };
export const TIERS = ['community', 'certified'];
export const OWNERS = ['source', 'keia'];
// v0 is read only. Write actions arrive with standing rules and a person's approval (docs/connectors/README.md).
export const ACTIONS_V0 = ['read'];
// Fields the runner sets on every record. An adapter never declares or fills these itself.
export const RUNNER_FIELDS = ['kind', 'id', 'source', 'raw', 'raw_redacted', 'field_sources'];

// ---- Schemas ----

let ajv = null;
function schemas() {
  if (ajv) return ajv;
  ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  addFormats(ajv);
  for (const f of readdirSync(SCHEMA_DIR).filter((n) => n.endsWith('.schema.yaml')).sort()) {
    ajv.addSchema(parse(readFileSync(path.join(SCHEMA_DIR, f), 'utf8')));
  }
  return ajv;
}

const describe = (e) => {
  const where = e.instancePath ? e.instancePath.slice(1).split('/').join('.') : '(top level)';
  if (e.keyword === 'required') return `${where}: missing required field "${e.params.missingProperty}"`;
  if (e.keyword === 'additionalProperties') return `${where}: unknown field "${e.params.additionalProperty}"`;
  if (e.keyword === 'enum') return `${where}: must be one of ${e.params.allowedValues.map((v) => JSON.stringify(v)).join(', ')}`;
  return `${where}: ${e.message}`;
};

// Check one canonical record against its kind's schema. Returns [] or a list of sentences.
export function validateRecord(record) {
  const kind = record?.kind;
  if (!KINDS.includes(kind)) return [`kind must be one of ${KINDS.join(', ')}`];
  const check = schemas().getSchema(ID_BASE + kind);
  if (check(record)) return [];
  // An if/then wrapper adds "must match then schema" noise; keep the useful messages.
  return [...new Set(check.errors.filter((e) => e.keyword !== 'if').map(describe))];
}

// Check a manifest against schemas/connectors/manifest.schema.yaml and the v0 rules.
export function checkManifest(manifest) {
  const check = schemas().getSchema(ID_BASE + 'manifest');
  const out = check(manifest) ? [] : check.errors.filter((e) => e.keyword !== 'if').map(describe);
  for (const [kind, o] of Object.entries(manifest?.objects ?? {})) {
    for (const f of Object.keys(o?.fields ?? {})) {
      if (RUNNER_FIELDS.includes(f)) out.push(`objects.${kind}.fields.${f}: set by the runner, not by an adapter`);
    }
  }
  return out;
}

// ---- Defining an adapter ----

const defaultOpen = (file) => ({ file, text: readFileSync(file, 'utf8') });

export function defineAdapter(adapter) {
  const problems = checkManifest(adapter?.manifest);
  for (const fn of ['list', 'get', 'map']) {
    if (typeof adapter?.[fn] !== 'function') problems.push(`${fn}() is missing: every adapter has list, get and map`);
  }
  if (problems.length) {
    throw new Error(`adapter "${adapter?.manifest?.id ?? '?'}" is not valid:\n  ${problems.join('\n  ')}`);
  }
  return Object.freeze({ open: defaultOpen, ...adapter });
}

// ---- Helpers adapters share ----

// A piece of a Keia id: lower case, words joined by hyphens. "Room 3.01 (Wren)" -> "room-3-01-wren".
export const slug = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Empty every value in a native record whose key looks like a secret (password, token, key...), unless it is a
// vault reference. Returns { raw, redacted: [paths] }. The Okta and Drift breaches both came from secrets
// sitting in records that were copied somewhere else; this keeps them out of the repository.
export function redact(native) {
  const redacted = [];
  const walk = (node, at) => {
    if (Array.isArray(node)) return node.map((v, i) => walk(v, `${at}[${i}]`));
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        const here = at ? `${at}.${k}` : k;
        if (looksLikeSecretKey(k) && v !== null && v !== undefined && typeof v !== 'boolean' && !(typeof v === 'string' && (v.trim() === '' || isVaultReference(v)))) {
          out[k] = null;
          redacted.push(here);
        } else out[k] = walk(v, here);
      }
      return out;
    }
    return node;
  };
  return { raw: walk(native, ''), redacted };
}

// Map a system's own status word to Keia's, through a table of lower-case words. Unknown words give undefined,
// so the record keeps only status_native and the page shows the system's word (connect rule 5: both states).
export function mapStatus(table, native) {
  if (native === undefined || native === null || native === '') return undefined;
  return table[String(native).trim().toLowerCase()];
}

// A canonical event as a CloudEvents 1.0 envelope (https://cloudevents.io/), for handing to other tools.
export function toCloudEvent(event) {
  const src = event.source;
  return {
    specversion: '1.0',
    id: src.record_id,
    source: src.instance ? `${src.system}://${src.instance}` : src.system,
    type: event.type,
    ...(event.subject ? { subject: event.subject } : {}),
    time: event.time,
    datacontenttype: 'application/json',
    data: event.data ?? {},
  };
}

// The tools an adapter will publish through Keia's MCP gateway (roadmap, docs/connectors/README.md): one small
// typed tool per object and action, never a "run any query" tool, each with its Keia governance tier.
export function plannedMcpTools(manifest) {
  const tools = [];
  for (const [kind, o] of Object.entries(manifest.objects)) {
    if (o.actions.includes('read')) {
      tools.push({ name: `${manifest.id}.${kind}.list`, tier: 'read' });
      tools.push({ name: `${manifest.id}.${kind}.get`, tier: 'read' });
    }
  }
  return tools;
}
