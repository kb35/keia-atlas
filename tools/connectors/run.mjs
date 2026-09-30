// The connector runner: runs one adapter over one file and plans what would change in data/connected/.
//
//   planImport()  reads the file through the adapter, maps every record, adds source marks, keeps the native
//                 record aside (secrets emptied), merges with what is already in the repository by the
//                 ownership rules, checks each result against the schema, compares it with what other systems
//                 hold about the same things (planned against seen), and returns a plan. Writes nothing.
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
//   - Planned against seen. A field a system only sees (its manifest's `observes`) never overwrites the owner's
//     value in another system's record: it goes into that record's `seen` block, and a difference is a drift
//     event (drift.mjs).

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parse, stringify } from 'yaml';
import { KINDS, KIND_FOLDER, ACTIONS_V0, RUNNER_FIELDS, validateRecord, redact, slug } from './adapter.mjs';
import { linksOf } from './kinds.mjs';
import { compare, sameThing, DRIFT_FOUND } from './drift.mjs';
import { ADAPTERS } from './adapters/index.mjs';
import { findSecrets } from '../secrets.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DEFAULT_DATA = path.join(REPO_ROOT, 'data');

// Field order in a written file follows the schema, so files read the same way every time.
const TAIL = ['notes', 'source', 'field_sources', 'seen', 'raw', 'raw_redacted'];
const ORDER = {
  unit: ['kind', 'id', 'name', 'manufacturer', 'model', 'serial', 'asset_tag', 'status', 'status_native', 'category_native', 'space', 'position', 'inside', 'firmware', 'health', 'health_native', 'health_since', 'purchased_on', 'warranty_ends', 'supplier', 'config_backup', 'model_id', 'team', 'contacts', ...TAIL],
  space: ['kind', 'id', 'name', 'level', 'code', 'parent', 'status', 'status_native', 'category_native', 'time_zone', 'country', 'size_u', 'atlas_site', 'atlas_space', 'team', 'contacts', ...TAIL],
  ticket: ['kind', 'id', 'type', 'number', 'title', 'status', 'status_native', 'priority', 'priority_native', 'group', 'opened_at', 'updated_at', 'resolved_at', 'space', 'unit', 'related', ...TAIL],
  event: ['kind', 'id', 'type', 'subject', 'time', 'severity', 'severity_native', 'state', 'key', 'data', 'source', 'raw', 'raw_redacted'],
  port: ['kind', 'id', 'name', 'label', 'type', 'type_native', 'unit', 'space', 'description', 'enabled', 'speed_mbps', 'mac', 'mode', 'untagged_vlan', 'tagged_vlans', 'poe', 'lag', 'rear_port', 'rear_position', 'feed', 'max_draw_w', 'allocated_draw_w', ...TAIL],
  connection: ['kind', 'id', 'type', 'label', 'a', 'b', 'medium', 'medium_native', 'length_m', 'colour', 'bundle', 'description', 'status', 'status_native', ...TAIL],
  network: ['kind', 'id', 'name', 'type', 'vid', 'vlan_group', 'prefix', 'start', 'end', 'ssid', 'auth_native', 'vlan', 'scope', 'role_native', 'status', 'status_native', 'description', 'purpose', 'atlas_site', 'team', 'contacts', ...TAIL],
  address: ['kind', 'id', 'address', 'port', 'unit', 'network', 'dns_name', 'mac', 'assignment', 'role_native', 'status', 'status_native', 'description', ...TAIL],
  group: ['kind', 'id', 'name', 'type', 'type_native', 'members', 'domain', 'space', 'status', 'status_native', 'team', ...TAIL],
  circuit: ['kind', 'id', 'circuit_id', 'name', 'carrier', 'carrier_contact', 'account', 'type_native', 'role', 'bandwidth_mbps', 'sla', 'terminations', 'installed_on', 'contract_ends', 'status', 'status_native', 'description', 'team', 'contacts', ...TAIL],
  contact: ['kind', 'id', 'type', 'name', 'organisation', 'role', 'phone', 'email', 'url', 'hours', 'atlas_vendor', ...TAIL],
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
  const plan = { manifest: m, system: sys, file, dataDir, outDir, syncedAt: now, changes: [], missing: [], problems: [], warnings: [], drift: [] };
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
  // What is already in the repository, for links, merging, drift and "missing".
  const existing = readYamlDir(connectedDir).filter((e) => e.data && typeof e.data === 'object');
  const incoming = [];
  // A record another system already brought in, found by its name (an alert names its host, not a Keia id).
  const hostName = (s) => String(s ?? '').trim().toLowerCase().replace(/:\d+$/, '').split('.')[0];
  const matchConnected = (kind, ...names) => {
    const want = new Set(names.filter(Boolean).map(hostName).filter(Boolean));
    if (!want.size) return undefined;
    const pool = [...incoming, ...existing.map((e) => e.data)].filter((r) => r.kind === kind && r.source?.system !== sys);
    return pool.filter((r) => want.has(hostName(r.name))).map((r) => r.id).sort()[0];
  };
  const ctx = {
    system: sys,
    instance: source?.instance,
    idFor: (...parts) => [sys, ...parts].map(slug).filter(Boolean).join('-'),
    matchSite: catalogue.matchSite,
    matchModel: catalogue.matchModel,
    matchConnected,
    warn: (msg) => plan.warnings.push(msg),
    problem,
  };

  // 1. Map every native record.
  const redactions = new Map();
  for (const kind of KINDS.filter((k) => m.objects[k])) {
    const owners = m.objects[kind].fields;
    for (const native of await adapter.list(source, kind)) {
      const out = adapter.map(kind, native, ctx);
      if (!out) continue;
      // An adapter may empty more of the native record than secrets (a person's name, for privacy) and say where.
      const { source: ref, raw: rawOverride, redacted: alsoRedacted, id, ...fields } = out;
      const label = `${kind} ${id ?? '(no id)'}`;
      for (const f of Object.keys(fields)) {
        if (RUNNER_FIELDS.includes(f) || !(f in owners)) problem(`${label}: ${m.id} filled "${f}", which its manifest does not declare for ${kind}`);
      }
      if (!ref?.record_id) problem(`${label}: map() gave no source.record_id`);
      const { raw, redacted: secretPaths } = redact(rawOverride ?? native);
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
        raw_redacted: [...new Set([...(alsoRedacted ?? []), ...secretPaths])],
      });
      for (const r of secretPaths) redactions.set(`${kind}|${r}`, (redactions.get(`${kind}|${r}`) ?? 0) + 1);
      incoming.push(record);
    }
  }

  for (const [key, n] of redactions) {
    const [kind, at] = key.split('|');
    ctx.warn(`"${at}" looked like a secret in ${plural(n, kind)}, so its value was not kept. Keep secrets in the vault and store only a reference (vault:...).`);
  }

  // 2. Ids must be unique.
  const seenIds = new Map();
  for (const r of incoming) {
    const key = r.id;
    if (seenIds.has(key)) problem(`${r.kind} ${key}: two records in this file map to the same id (source records ${seenIds.get(key)} and ${r.source.record_id})`);
    else seenIds.set(key, r.source.record_id);
  }

  // 3. Merge with what is already in the repository, and check every link.
  const kindOf = new Map([...existing.map((e) => [e.id, e.data.kind]), ...incoming.map((r) => [r.id, r.kind])]);
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
    const change = describeChange({ action: before ? 'changed' : 'new', kind: r.kind, id: r.id, file: target, before, after, kept });

    // Links: each must point at a record of the right kind that exists (in this file or in the repository).
    for (const l of linksOf(after)) {
      if (!l.kinds.includes(kindOf.get(l.id))) problem(`${r.kind} ${r.id}: ${showAt(l.at)} "${l.id}" is not in this file or in data/connected`);
    }

    for (const e of validateRecord(after)) problem(`${r.kind} ${r.id}: ${e}`);
    for (const s of findSecrets(after)) problem(`${r.kind} ${r.id}: ${s.message}`);
    plan.changes.push(change);
  }

  // 4. Planned against seen: what other systems hold about the same things.
  planDrift(plan, { existing, m, sys, now, connectedDir });

  // 5. Records from this system that the file no longer has: reported, never deleted. Drift events are Keia's
  //    findings, not the system's records, so they are never "missing".
  const incomingFiles = new Set(plan.changes.map((c) => c.file));
  for (const kind of KINDS.filter((k) => m.objects[k])) {
    for (const e of readYamlDir(path.join(outDir, KIND_FOLDER[kind]))) {
      if (String(e.data?.type ?? '').startsWith('io.keia.drift.')) continue;
      if (!incomingFiles.has(e.file)) plan.missing.push({ kind, id: e.id, file: e.file });
    }
  }
  return plan;
}

const showAt = (at) => at.map((p, i) => (typeof p === 'number' ? `[${p}]` : i ? `.${p}` : p)).join('');

// Fill in how a change reads: new, the same as before, or which fields changed.
function describeChange(change) {
  const { before, after } = change;
  change.name = after.name ?? after.title ?? after.address ?? after.circuit_id ?? after.label ?? after.type;
  change.fields = [];
  change.kept ??= [];
  change.rawChanged = false;
  if (!before) return change;
  const cmpAfter = { ...after, source: { ...after.source, synced_at: before.source?.synced_at } };
  if (isDeepStrictEqual(tidy(cmpAfter), tidy(before))) {
    change.action = 'same';
    change.after = before;
    return change;
  }
  change.action = 'changed';
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (['raw', 'raw_redacted', 'source'].includes(k)) continue;
    if (!isDeepStrictEqual(before[k], after[k])) change.fields.push({ field: k, from: before[k], to: after[k] });
  }
  for (const k of ['instance', 'url', 'adapter_version']) {
    if (before.source?.[k] !== after.source?.[k]) change.fields.push({ field: `source.${k}`, from: before.source?.[k], to: after.source?.[k] });
  }
  change.rawChanged = !isDeepStrictEqual(before.raw, after.raw);
  return change;
}

// The fields a record's system sees rather than decides, from that system's adapter manifest.
function observesOf(rec, m) {
  const manifest = rec.source?.adapter === m.id ? m : ADAPTERS[rec.source?.adapter]?.manifest;
  return manifest?.objects?.[rec.kind]?.observes ?? [];
}

// Compare the records this import brings with other systems' records of the same things. Where one system sees a
// field the other decides, the seen value goes into the deciding record's `seen` block (never over its value), and a
// difference becomes a drift event in the seeing system's events folder.
function planDrift(plan, { existing, m, sys, now, connectedDir }) {
  const others = existing.filter((e) => e.data.source?.system && e.data.source.system !== sys);
  if (!others.length) return;
  const byFile = new Map(plan.changes.map((c) => [c.file, c]));

  const pairs = [];
  for (const c of [...plan.changes]) {
    const r = c.after;
    for (const e of others) {
      if (e.data.kind !== r.kind || !sameThing(r, e.data)) continue;
      const mine = observesOf(r, m);
      const theirs = observesOf(e.data, m);
      const iSee = mine.filter((f) => !theirs.includes(f));
      const theySee = theirs.filter((f) => !mine.includes(f));
      if (iSee.length) pairs.push({ plannedFile: e.file, fallback: e.data, observed: r, fields: iSee });
      if (theySee.length) pairs.push({ plannedFile: c.file, fallback: r, observed: e.data, fields: theySee });
    }
  }

  for (const p of pairs) {
    const planned = byFile.get(p.plannedFile)?.after ?? p.fallback;
    const { seen, events, findings } = compare({ planned, observed: p.observed, fields: p.fields, syncedAt: now });
    plan.drift.push(...findings);
    if (seen) {
      let c = byFile.get(p.plannedFile);
      if (!c) {
        // Another system's record: only its seen block changes, and that system's own imports keep it.
        c = { kind: planned.kind, id: planned.id, file: p.plannedFile, before: planned, after: planned };
        plan.changes.push(c);
        byFile.set(p.plannedFile, c);
      }
      c.after = tidy({ ...c.after, seen });
      describeChange(c);
      if (!c.before) c.action = 'new';
      for (const e of validateRecord(c.after)) plan.problems.push(`${c.kind} ${c.id}: ${e}`);
    }
    for (const ev of events) {
      const file = path.join(connectedDir, ev.source.system, KIND_FOLDER.event, `${ev.id}.yaml`);
      if (existsSync(file) || byFile.has(file)) continue;
      const c = { action: 'new', kind: 'event', id: ev.id, name: ev.type, file, after: tidy(ev), fields: [], kept: [], rawChanged: false, drift: true };
      for (const e of validateRecord(c.after)) plan.problems.push(`event ${ev.id}: ${e}`);
      plan.changes.push(c);
      byFile.set(file, c);
    }
  }
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

const header = (rec, manifest) => {
  const first = `# Connected ${rec.kind} from ${rec.source.system}${rec.source.instance ? ` (${rec.source.instance})` : ''}, record ${rec.source.record_id}.`;
  if (rec.kind === 'event' && String(rec.type ?? '').startsWith('io.keia.drift.')) {
    return [first, '# Raised by the drift check in npm run connect: planned against seen. A finding for a person; nothing was', '# overwritten. See docs/connectors/model.md.', ''].join('\n');
  }
  const own = rec.source.adapter === manifest.id ? manifest : ADAPTERS[rec.source.adapter]?.manifest ?? manifest;
  const keia = Object.entries(own.objects[rec.kind]?.fields ?? {}).filter(([, o]) => o === 'keia').map(([f]) => f);
  return [
    first,
    `# Written by npm run connect -- ${own.id}. Fields the source owns are replaced on the next import;`,
    `# fields Keia owns (${keia.join(', ') || 'none from this adapter'}, notes) are kept. See docs/connectors/model.md.`,
    '',
  ].join('\n');
};

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
  const kindWidth = Math.max(6, ...plan.changes.map((c) => c.kind.length));
  const row = (sign, word, c) => lines.push(`  ${sign} ${word.padEnd(9)} ${c.kind.padEnd(kindWidth)} ${c.id.padEnd(width)} ${c.name ?? ''}`);

  list(by('new'), (c) => row('+', 'new', c));
  list(by('changed'), (c) => {
    row('~', 'changed', c);
    for (const f of c.fields) {
      if (f.field === 'seen') lines.push(`        ${'seen'.padEnd(16)} what other systems see was updated; the owner's values are unchanged`);
      else lines.push(`        ${f.field.padEnd(16)} ${show(f.from)} -> ${show(f.to)}`);
    }
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

  if (plan.drift?.length) {
    lines.push('', 'Planned against seen (a finding for a person; nothing is overwritten)');
    list(plan.drift, (d) => {
      const what = `${d.kind} ${d.subject}, ${d.field}`;
      if (d.type === DRIFT_FOUND) lines.push(`  ! ${what}: ${d.plannedSystem} has ${show(d.planned)}, ${d.seenSystem} sees ${show(d.seen)}`);
      else lines.push(`  = ${what}: ${d.plannedSystem} and ${d.seenSystem} agree again (${show(d.seen)})`);
    });
  }
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
