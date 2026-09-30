// The connector runner: runs one adapter over one file and plans what would change in data/connected/.
//
//   planImport()  reads the file through the adapter, maps every record, adds source marks, keeps the native
//                 record aside (secrets emptied), merges with what is already in the repository by the
//                 ownership rules, checks each result against the schema, and returns a plan. Writes nothing.
//   formatPlan()  the plan as a readable diff.
//   applyPlan()   writes the new and changed files. Refuses a plan that has problems.
//
// Rules it keeps (docs/connectors/README.md):
//   - Read only. An adapter whose manifest declares anything but read is refused.
//   - Idempotent. The same file twice changes nothing the second time; synced_at moves only when a value did.
//   - Ownership per field. A "source" field is replaced by each import; a "keia" field is only a first
//     suggestion, and a value already in the file is kept (the plan says so).
//   - Nothing is deleted. A record missing from a new export is reported and kept.
//   - Nothing half-done. If any record has a problem, nothing is written.

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parse, stringify } from 'yaml';
import { KINDS, KIND_FOLDER, ACTIONS_V0, RUNNER_FIELDS, validateRecord, redact, slug } from './adapter.mjs';
import { findSecrets } from '../secrets.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_DATA = path.join(REPO_ROOT, 'data');

// Field order in a written file follows the schema, so files read the same way every time.
const ORDER = {
  unit: ['kind', 'id', 'name', 'manufacturer', 'model', 'serial', 'asset_tag', 'status', 'status_native', 'category_native', 'space', 'position', 'firmware', 'model_id', 'notes', 'source', 'field_sources', 'raw', 'raw_redacted'],
  space: ['kind', 'id', 'name', 'level', 'code', 'parent', 'status', 'status_native', 'category_native', 'time_zone', 'country', 'size_u', 'atlas_site', 'atlas_space', 'notes', 'source', 'field_sources', 'raw', 'raw_redacted'],
  ticket: ['kind', 'id', 'type', 'number', 'title', 'status', 'status_native', 'priority', 'priority_native', 'group', 'opened_at', 'updated_at', 'resolved_at', 'space', 'unit', 'notes', 'source', 'field_sources', 'raw', 'raw_redacted'],
  event: ['kind', 'id', 'type', 'subject', 'time', 'data', 'source', 'raw', 'raw_redacted'],
};
const SOURCE_ORDER = ['system', 'instance', 'record_id', 'url', 'synced_at', 'adapter', 'adapter_version'];

const orderKeys = (obj, keys) => {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  for (const k of Object.keys(obj)) if (!(k in out) && obj[k] !== undefined) out[k] = obj[k];
  return out;
};
const tidy = (rec) => {
  const out = orderKeys(rec, ORDER[rec.kind] ?? []);
  if (out.source) out.source = orderKeys(out.source, SOURCE_ORDER);
  if (Array.isArray(out.raw_redacted) && out.raw_redacted.length === 0) delete out.raw_redacted;
  return out;
};

// ---- The Keia catalogue, for suggesting links (Keia-owned fields) ----

const readYamlDir = (dir) => {
  const out = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const n of readdirSync(d).sort()) {
      if (n.startsWith('.')) continue;
      const full = path.join(d, n);
      if (statSync(full).isDirectory()) walk(full);
      else if (n.endsWith('.yaml')) {
        try {
          out.push({ id: n.slice(0, -5), file: full, data: parse(readFileSync(full, 'utf8')) });
        } catch {
          out.push({ id: n.slice(0, -5), file: full, data: null });
        }
      }
    }
  };
  walk(dir);
  return out;
};

function loadCatalogue(dir) {
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const sites = readYamlDir(path.join(dir, 'sites'));
  const models = readYamlDir(path.join(dir, 'device-models'));
  const siteKeys = new Map();
  for (const s of sites) {
    for (const k of [s.id, s.data?.code, s.data?.name, s.data?.city]) if (k) siteKeys.set(norm(k), s.id);
  }
  const modelKeys = new Map();
  for (const m of models) {
    const man = norm(m.data?.manufacturer);
    modelKeys.set(`${man}|${norm(m.data?.model)}`, m.id);
    modelKeys.set(`id|${m.id}`, m.id);
  }
  return {
    matchSite: (...texts) => {
      for (const t of texts) if (t && siteKeys.has(norm(t))) return siteKeys.get(norm(t));
      return undefined;
    },
    matchModel: (manufacturer, model) => {
      if (!manufacturer || !model) return undefined;
      return modelKeys.get(`${norm(manufacturer)}|${norm(model)}`) ?? modelKeys.get(`id|${slug(`${manufacturer} ${model}`)}`);
    },
  };
}

// ---- Planning ----

export async function planImport({ adapter, file, dataDir = DEFAULT_DATA, catalogueDir, system, syncedAt, options = {} }) {
  const m = adapter.manifest;
  const sys = system ?? m.system;
  const now = syncedAt ?? new Date().toISOString();
  const connectedDir = path.join(dataDir, 'connected');
  const outDir = path.join(connectedDir, sys);
  const plan = { manifest: m, system: sys, file, dataDir, outDir, syncedAt: now, changes: [], missing: [], problems: [], warnings: [] };
  const problem = (msg) => plan.problems.push(msg);

  if (slug(sys) !== sys) problem(`system "${sys}" must be lower case words joined by hyphens`);
  for (const [kind, o] of Object.entries(m.objects)) {
    const extra = o.actions.filter((a) => !ACTIONS_V0.includes(a));
    if (extra.length) problem(`${m.id} declares ${extra.join(', ')} on ${kind}; connectors are read only in v0`);
  }
  if (plan.problems.length) return plan;

  let source;
  try {
    source = await adapter.open(file, options);
  } catch (err) {
    problem(`could not read ${file}: ${err.message}`);
    return plan;
  }
  plan.problems.push(...(source?.problems ?? []));
  plan.warnings.push(...(source?.warnings ?? []));

  const catalogue = loadCatalogue(catalogueDir ?? dataDir);
  const ctx = {
    system: sys,
    instance: source?.instance,
    idFor: (...parts) => [sys, ...parts].map(slug).filter(Boolean).join('-'),
    matchSite: catalogue.matchSite,
    matchModel: catalogue.matchModel,
    warn: (msg) => plan.warnings.push(msg),
    problem,
  };

  // 1. Map every native record.
  const incoming = [];
  const redactions = new Map();
  for (const kind of KINDS.filter((k) => m.objects[k])) {
    const owners = m.objects[kind].fields;
    for (const native of await adapter.list(source, kind)) {
      const out = adapter.map(kind, native, ctx);
      if (!out) continue;
      const { source: ref, raw: rawOverride, id, ...fields } = out;
      const label = `${kind} ${id ?? '(no id)'}`;
      for (const f of Object.keys(fields)) {
        if (RUNNER_FIELDS.includes(f) || !(f in owners)) problem(`${label}: ${m.id} filled "${f}", which its manifest does not declare for ${kind}`);
      }
      if (!ref?.record_id) problem(`${label}: map() gave no source.record_id`);
      const { raw, redacted } = redact(rawOverride ?? native);
      const record = tidy({
        kind,
        id,
        ...fields,
        source: {
          system: sys,
          instance: source?.instance,
          record_id: ref?.record_id === undefined ? undefined : String(ref.record_id),
          url: ref?.url,
          synced_at: now,
          adapter: m.id,
          adapter_version: m.version,
        },
        raw,
        raw_redacted: redacted,
      });
      for (const r of redacted) redactions.set(`${kind}|${r}`, (redactions.get(`${kind}|${r}`) ?? 0) + 1);
      incoming.push(record);
    }
  }

  for (const [key, n] of redactions) {
    const [kind, at] = key.split('|');
    ctx.warn(`"${at}" looked like a secret in ${plural(n, kind)}, so its value was not kept. Keep secrets in the vault and store only a reference (vault:...).`);
  }

  // 2. Ids must be unique.
  const seen = new Map();
  for (const r of incoming) {
    const key = r.id;
    if (seen.has(key)) problem(`${r.kind} ${key}: two records in this file map to the same id (source records ${seen.get(key)} and ${r.source.record_id})`);
    else seen.set(key, r.source.record_id);
  }

  // 3. What is already in the repository, for references, merging and "missing".
  const existing = readYamlDir(connectedDir).filter((e) => e.data && typeof e.data === 'object');
  const knownIds = new Set([...existing.map((e) => e.id), ...incoming.map((r) => r.id)]);
  const knownOf = (kind) => new Set([...existing.filter((e) => e.data.kind === kind).map((e) => e.id), ...incoming.filter((r) => r.kind === kind).map((r) => r.id)]);
  const spaceIds = knownOf('space');
  const unitIds = knownOf('unit');

  for (const r of incoming) {
    const owners = m.objects[r.kind].fields;
    const rel = path.join(KIND_FOLDER[r.kind], `${r.id}.yaml`);
    const target = path.join(outDir, rel);
    const before = existing.find((e) => e.file === target)?.data;
    const others = existing.filter((e) => e.id === r.id && e.file !== target);
    if (others.length) problem(`${r.kind} ${r.id}: the id is already used by ${path.relative(dataDir, others[0].file)}`);
    if (before && (before.source?.system !== sys || before.source?.record_id !== r.source.record_id)) {
      problem(`${r.kind} ${r.id}: ${path.relative(dataDir, target)} belongs to ${before.source?.system} record ${before.source?.record_id}, not ${sys} record ${r.source.record_id}`);
      continue;
    }

    const { after, kept } = merge(before, r, owners);
    const change = { action: before ? 'changed' : 'new', kind: r.kind, id: r.id, name: after.name ?? after.title ?? after.type, file: target, before, after, fields: [], kept, rawChanged: false };

    if (before) {
      const cmpAfter = { ...after, source: { ...after.source, synced_at: before.source?.synced_at } };
      if (isDeepStrictEqual(tidy(cmpAfter), tidy(before))) {
        change.action = 'same';
        change.after = before;
      } else {
        for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
          if (['raw', 'raw_redacted', 'source'].includes(k)) continue;
          if (!isDeepStrictEqual(before[k], after[k])) change.fields.push({ field: k, from: before[k], to: after[k] });
        }
        for (const k of ['instance', 'url', 'adapter_version']) {
          if (before.source?.[k] !== after.source?.[k]) change.fields.push({ field: `source.${k}`, from: before.source?.[k], to: after.source?.[k] });
        }
        change.rawChanged = !isDeepStrictEqual(before.raw, after.raw);
      }
    }

    // References: every link must point at a record that exists (here, in the repository, or in the catalogue).
    const refs = { unit: [['space', spaceIds]], space: [['parent', spaceIds]], ticket: [['space', spaceIds], ['unit', unitIds]], event: [['subject', knownIds]] }[r.kind];
    for (const [f, ids] of refs) {
      if (after[f] !== undefined && !ids.has(after[f])) problem(`${r.kind} ${r.id}: ${f} "${after[f]}" is not in this file or in data/connected`);
    }

    for (const e of validateRecord(after)) problem(`${r.kind} ${r.id}: ${e}`);
    for (const s of findSecrets(after)) problem(`${r.kind} ${r.id}: ${s.message}`);
    plan.changes.push(change);
  }

  // 4. Records from this system that the file no longer has: reported, never deleted.
  const incomingFiles = new Set(plan.changes.map((c) => c.file));
  for (const kind of KINDS.filter((k) => m.objects[k])) {
    for (const e of readYamlDir(path.join(outDir, KIND_FOLDER[kind]))) {
      if (!incomingFiles.has(e.file)) plan.missing.push({ kind, id: e.id, file: e.file });
    }
  }
  return plan;
}

// Merge a mapped record into the one already in the repository, by who owns each field.
export function merge(before, incoming, owners) {
  if (!before) return { after: incoming, kept: [] };
  const after = { ...before };
  const kept = [];
  for (const [field, owner] of Object.entries(owners)) {
    const theirs = incoming[field];
    if (owner === 'source') {
      if (theirs === undefined) delete after[field];
      else after[field] = theirs;
    } else if (before[field] === undefined) {
      if (theirs !== undefined) after[field] = theirs;
    } else if (theirs !== undefined && !isDeepStrictEqual(before[field], theirs)) {
      kept.push({ field, ours: before[field], theirs });
    }
  }
  after.kind = incoming.kind;
  after.id = incoming.id;
  after.source = incoming.source;
  after.raw = incoming.raw;
  if (incoming.raw_redacted?.length) after.raw_redacted = incoming.raw_redacted;
  else delete after.raw_redacted;
  return { after: tidy(after), kept };
}

// ---- Writing ----

const header = (rec, manifest) =>
  [
    `# Connected ${rec.kind} from ${rec.source.system}${rec.source.instance ? ` (${rec.source.instance})` : ''}, record ${rec.source.record_id}.`,
    `# Written by npm run connect -- ${manifest.id}. Fields the source owns are replaced on the next import;`,
    `# fields Keia owns (${Object.entries(manifest.objects[rec.kind].fields).filter(([, o]) => o === 'keia').map(([f]) => f).join(', ') || 'none from this adapter'}, notes) are kept. See docs/connectors/model.md.`,
    '',
  ].join('\n');

export function applyPlan(plan) {
  if (plan.problems.length) throw new Error(`nothing written: ${plan.problems.length} problem${plan.problems.length === 1 ? '' : 's'} to fix first`);
  let written = 0;
  for (const c of plan.changes) {
    if (c.action === 'same') continue;
    mkdirSync(path.dirname(c.file), { recursive: true });
    writeFileSync(c.file, header(c.after, plan.manifest) + stringify(c.after, { lineWidth: 0 }));
    written += 1;
  }
  return written;
}

// ---- The readable diff ----

const show = (v) => {
  if (v === undefined) return '(none)';
  const s = typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v);
  return s.length > 70 ? `${s.slice(0, 67)}...` : s;
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function formatPlan(plan, { apply = false, verbose = false, written } = {}) {
  const m = plan.manifest;
  const rel = (p) => path.relative(process.cwd(), p) || '.';
  const lines = [];
  lines.push(`${m.name} (${m.id} ${m.version}, ${m.tier}, read only)`);
  lines.push(`  reading  ${rel(plan.file)}`);
  lines.push(`  into     ${rel(plan.outDir)}/`);
  lines.push('');

  const by = (a) => plan.changes.filter((c) => c.action === a);
  const limit = verbose ? Infinity : 25;
  const list = (items, draw) => {
    items.slice(0, limit).forEach(draw);
    if (items.length > limit) lines.push(`      ... and ${items.length - limit} more (--verbose shows all)`);
  };
  const width = Math.max(20, ...plan.changes.map((c) => c.id.length)) + 2;
  const row = (sign, word, c) => lines.push(`  ${sign} ${word.padEnd(9)} ${c.kind.padEnd(6)} ${c.id.padEnd(width)} ${c.name ?? ''}`);

  list(by('new'), (c) => row('+', 'new', c));
  list(by('changed'), (c) => {
    row('~', 'changed', c);
    for (const f of c.fields) lines.push(`        ${f.field.padEnd(16)} ${show(f.from)} -> ${show(f.to)}`);
    if (c.rawChanged) lines.push(`        ${'raw'.padEnd(16)} the system's own record changed`);
    for (const k of c.kept) lines.push(`        ${k.field.padEnd(16)} kept ${show(k.ours)}: Keia owns it (the source suggests ${show(k.theirs)})`);
  });
  const same = by('same');
  const keptOnSame = same.filter((c) => c.kept.length);
  if (same.length) lines.push(`  = unchanged ${plural(same.length, 'record')}`);
  list(keptOnSame, (c) => {
    for (const k of c.kept) lines.push(`      ${c.id}: ${k.field} kept ${show(k.ours)}, Keia owns it (the source suggests ${show(k.theirs)})`);
  });
  if (plan.missing.length) {
    lines.push(`  ? not in this file: ${plural(plan.missing.length, 'record')}, kept (nothing is deleted)`);
    list(plan.missing, (x) => lines.push(`      ${x.kind.padEnd(6)} ${x.id}`));
  }
  if (!plan.changes.length && !plan.missing.length) lines.push('  (no records)');

  if (plan.warnings.length) {
    lines.push('', 'Warnings');
    list([...new Set(plan.warnings)], (w) => lines.push(`  ! ${w}`));
  }
  if (plan.problems.length) {
    lines.push('', `Problems (nothing is written until these are fixed)`);
    list(plan.problems, (p) => lines.push(`  x ${p}`));
  }

  const n = by('new').length;
  const ch = by('changed').length;
  lines.push('');
  if (plan.problems.length) lines.push(`Stopped: ${plural(plan.problems.length, 'problem')}. Nothing written.`);
  else if (n + ch === 0) lines.push('Up to date: nothing to write.');
  else if (apply) lines.push(`Written: ${plural(written ?? n + ch, 'file')} (${n} new, ${ch} changed). Next: npm run validate`);
  else lines.push(`Dry run: nothing written. ${n} new, ${ch} changed. Run again with --apply to write them.`);
  return lines.join('\n');
}
