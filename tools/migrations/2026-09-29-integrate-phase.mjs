#!/usr/bin/env node
// One-off migration (decision 0025): Install and Commission become one phase, Deploy.
//
// Kept for the record; it has already been run and its output committed. Running it again does
// nothing, because no file still names the old phases.
//
// Projects:
//   - `phase: install` or `phase: commission` becomes `phase: integrate`.
//   - The install and commission history entries merge into one integrate entry. Nothing is lost:
//     the phase keeps the latest planned and ended dates, both summaries, every artefact and the
//     final sign-off, and `steps` keeps each old entry exactly as it was (dates, summary, artefacts
//     and who signed it off).
//   - Tasks in either phase move to integrate. A provision task whose title is about configuring
//     becomes the new `configure` kind (provision is now the system records only).
// Vendors:
//   - A portal pack item given "when: install" is given in Deploy.
// Playbooks:
//   - The install and commission phases merge into one integrate phase. Each step says which device
//     step it belongs to (provision, install, configure, commission), and a Provision and a Configure
//     step are added where the playbook had none. Gates merge; the version goes up by one.
//
// Run from the repository root:  node tools/migrations/2026-09-29-integrate-phase.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseDocument, visit } from 'yaml';

const ROOT = process.cwd();
const OLD = new Set(['install', 'commission']);
// Keep each file's own style: padded one-line maps (`{ a: 1 }`) but tight lists (`[a, b]`), lists
// at the left edge or indented, dates in double or single quotes.
const write = (file, doc, text) => {
  const padded = text.includes('{ ');
  let s = doc.toString({ lineWidth: 0, flowCollectionPadding: padded, indentSeq: !/^- /m.test(text) });
  if (padded) s = s.replace(/\[ ([^\[\]\n]*?) \]/g, '[$1]').replace(/\[ \{/g, '[{').replace(/\} \]/g, '}]');
  writeFileSync(file, s);
};
// Dates are written quoted, like the rest of the data.
const quoteDates = (node, text) => {
  const q = /: '\d{4}-/.test(text) ? 'QUOTE_SINGLE' : 'QUOTE_DOUBLE';
  visit(node, { Scalar(_, n) { if (typeof n.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(n.value)) n.type = q; } });
};
let changed = 0;

// ---- Projects -------------------------------------------------------------------------------
for (const name of readdirSync(path.join(ROOT, 'data/projects')).filter((f) => f.endsWith('.yaml'))) {
  const file = path.join(ROOT, 'data/projects', name);
  const text = readFileSync(file, 'utf8');
  const doc = parseDocument(text);
  const p = doc.toJS();
  let touched = false;

  if (OLD.has(p.phase)) { doc.set('phase', 'integrate'); touched = true; }

  const hist = doc.get('history');
  if (hist?.items) {
    const idx = hist.items.map((n, i) => [n.toJSON?.() ?? n, i]).filter(([h]) => OLD.has(h.phase));
    if (idx.length) {
      const olds = idx.map(([h]) => h);
      const inst = olds.find((h) => h.phase === 'install'), comm = olds.find((h) => h.phase === 'commission');
      const last = comm ?? inst;
      const merged = { phase: 'integrate', planned: last.planned };
      // The phase has ended only when its last step has.
      if (last.ended) merged.ended = last.ended;
      merged.summary = olds.map((h) => h.summary.trim()).join(' ');
      if (last.ended && last.signed_off_by) merged.signed_off_by = last.signed_off_by;
      const arts = [...new Set(olds.flatMap((h) => h.artefacts ?? []))];
      if (arts.length) merged.artefacts = arts;
      merged.steps = olds.map((h) => {
        const s = { step: h.phase, planned: h.planned };
        if (h.ended) s.ended = h.ended;
        s.summary = h.summary;
        if (h.signed_off_by) s.signed_off_by = h.signed_off_by;
        if (h.artefacts?.length) s.artefacts = h.artefacts;
        return s;
      });
      const at = idx[0][1];
      const node = doc.createNode(merged);
      // The merged phase is written as a block, with one line per artefact list and per step.
      for (const pair of node.items) {
        if (pair.key.value === 'artefacts') pair.value.flow = true;
        if (pair.key.value === 'steps') for (const it of pair.value.items) it.flow = true;
      }
      quoteDates(node, text);
      for (const [, i] of idx.slice().reverse()) hist.items.splice(i, 1);
      hist.items.splice(at, 0, node);
      touched = true;
    }
  }

  const tasks = doc.get('tasks');
  for (const t of tasks?.items ?? []) {
    if (OLD.has(t.get('phase'))) { t.set('phase', 'integrate'); touched = true; }
    if (t.get('kind') === 'provision' && /configur/i.test(t.get('title'))) { t.set('kind', 'configure'); touched = true; }
  }

  if (touched) { write(file, doc, text); changed++; console.log(`project  ${name}`); }
}

// ---- Playbooks ------------------------------------------------------------------------------
// Which device step each existing Install or Commission step belongs to, by its wording.
const stepOf = (title, from) => {
  if (/record serial|record .*serial|label photo|asset register|provision/i.test(title)) return 'provision';
  if (/configur|pair|tune/i.test(title)) return 'configure';
  return from === 'commission' ? 'commission' : 'install';
};
// Written for this change: how long Deploy takes, and the Provision and Configure steps a
// playbook gains when it had none. Roles are ids from src/lib/demo.mjs.
const EXTRA = {
  'av-refresh': {
    weeks: 'Half a day per room, then 1',
    provision: { title: 'Provision each new unit: asset record, address and DNS, device management, booking and monitoring', role: 'delivery' },
    configure: { title: 'Configure each device in its setup order, then set and verify its settings', role: 'delivery' },
  },
  'new-office': {
    weeks: '8 to 14',
    provision: { title: 'Provision every device: asset record, address and DNS, device management, booking and monitoring', role: 'delivery' },
    configure: { title: 'Configure each device in its setup order, then set and verify its settings', role: 'delivery' },
  },
  'infra-refresh': {
    weeks: 'One weekend, then 1',
    provision: { title: 'Provision the new switches: asset records, management addresses and monitoring', role: 'network' },
    configure: { title: 'Load the pre-staged configuration and verify each port against the map', role: 'network' },
  },
  'custom-room': {
    weeks: '4 to 6',
    provision: { title: 'Provision each device: asset record, address and DNS, device management, booking and monitoring', role: 'delivery' },
    configure: { title: 'Configure each device in its setup order, including every mode the room has', role: 'delivery' },
  },
};
const ORDER = ['provision', 'install', 'configure', 'commission'];
for (const name of readdirSync(path.join(ROOT, 'data/playbooks')).filter((f) => f.endsWith('.yaml'))) {
  const file = path.join(ROOT, 'data/playbooks', name);
  const text = readFileSync(file, 'utf8');
  const doc = parseDocument(text);
  const pb = doc.toJS();
  const phases = doc.get('phases');
  const idx = phases.items.map((n, i) => [n.toJSON(), i]).filter(([ph]) => OLD.has(ph.phase));
  if (!idx.length) continue;
  const extra = EXTRA[pb.id] ?? {};
  const steps = idx.flatMap(([ph]) => ph.steps.map((s) => ({ ...s, step: stepOf(s.title, ph.phase) })));
  for (const k of ['provision', 'configure']) if (extra[k] && !steps.some((s) => s.step === k)) steps.push({ ...extra[k], step: k });
  // Device steps in their order; within a step, the playbook's own order.
  steps.sort((a, b) => ORDER.indexOf(a.step) - ORDER.indexOf(b.step));
  const gates = idx.map(([ph]) => ph.gate);
  const merged = {
    phase: 'integrate',
    weeks: extra.weeks ?? idx.map(([ph]) => ph.weeks).join(', then '),
    steps,
    gate: { by: [...new Set(gates.flatMap((g) => g.by))], checks: [...new Set(gates.flatMap((g) => g.checks))] },
  };
  const node = doc.createNode(merged);
  for (const pair of node.items) {
    if (pair.key.value === 'steps') for (const it of pair.value.items) it.flow = true;
    if (pair.key.value === 'gate') pair.value.flow = true;
  }
  const at = idx[0][1];
  for (const [, i] of idx.slice().reverse()) phases.items.splice(i, 1);
  phases.items.splice(at, 0, node);
  // Record the change in the playbook itself.
  const v = String(pb.version ?? '1.0').replace(/(\d+)$/, (n) => String(+n + 1));
  doc.set('version', v);
  const change = doc.createNode({ date: '2026-09-29', change: 'Install and Commission merged into one Deploy phase, with Provision, Install, Configure and Commission steps for each device (decision 0025).' });
  change.flow = true;
  quoteDates(change, text);
  if (doc.get('changes')) doc.get('changes').items.unshift(change);
  else { const list = doc.createNode([]); list.items.push(change); doc.set('changes', list); }
  write(file, doc, text);
  changed++;
  console.log(`playbook ${name}`);
}

// ---- Vendors --------------------------------------------------------------------------------
// What a vendor's portal pack gives them "when: install" is now given in Deploy.
for (const name of readdirSync(path.join(ROOT, 'data/vendors')).filter((f) => f.endsWith('.yaml'))) {
  const file = path.join(ROOT, 'data/vendors', name);
  const text = readFileSync(file, 'utf8');
  const next = text.replace(/\bwhen: (install|commission)\b/g, 'when: integrate');
  if (next !== text) { writeFileSync(file, next); changed++; console.log(`vendor   ${name}`); }
}

console.log(`${changed} files changed`);
