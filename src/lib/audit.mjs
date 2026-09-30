// The audit log (Keia Method 2.9, "a record that cannot be quietly edited"; design notes): the raw layer behind every
// "How was this done?" card. One trace per run: each step with its time, what it called, what came back, and the
// rule's version; where AI drafted anything, the model, the region and the prompt version. The card is one link
// away from its trace, never the other way round. Pure: no data, no browser (tests/rules.test.mjs).
//
// An entry: { id, at, kind, who, what, src, run?, rule?, item?, lines?: [{ t, what, got, src }] }
//   kind  run      one run of a standing rule, with its trace lines
//         hand     who has a job changed (Take, Hand to, Park, Resume)
//         priority a priority proposed, or changed with a reason
//         state    a ticket's state changed
//         ai       a line drafted by AI

import { STEP_WORD, rolledBack } from './rules.mjs';

const pad = (n, w = 2) => String(n).padStart(w, '0');
/** "02:00:00.300": a run's moment plus `ms`, from a zoneless local time. */
export function clock(t, ms = 0) {
  const [, hm = '00:00'] = String(t).split('T');
  const [h, m] = hm.split(':').map(Number);
  const total = (h * 3600 + m * 60) * 1000 + Math.round(ms);
  return `${pad(Math.floor(total / 3600000) % 24)}:${pad(Math.floor(total / 60000) % 60)}:${pad(Math.floor(total / 1000) % 60)}.${pad(total % 1000, 3)}`;
}

// What each kind of step calls, in the words of the system it talks to. Made up for the demo; no real endpoint.
const CALL = {
  read: (rule, run) => ({ what: `Read ${rule.reads[0]?.replace(/ \(.*$/, '') ?? 'the source'}`, got: run.target ? `${run.target} found` : 'found' }),
  write: (rule, run, fail) => ({ what: run.after ? `Write ${run.after}` : `${STEP_WORD.write}: ${rule.steps.find((s) => s.kind === 'write')?.words ?? ''}`, got: fail ? 'Refused: the service account has no permission here' : 'Accepted' }),
  wait: (rule) => ({ what: rule.steps.find((s) => s.kind === 'wait')?.words ?? 'Wait', got: 'Waited' }),
  readback: (rule, run, fail) => ({ what: 'Read back and compare', got: fail ? `Does not match: ${run.before ?? 'the old value'} is still there` : 'Matches' }),
};

/** The trace of one run, line by line (the log's raw layer). */
export function traceOf(rule, run) {
  const lines = [];
  const total = rule.steps.reduce((n, s) => n + (s.seconds ?? 0), 0) || 1;
  const scale = run.ms != null ? run.ms / 1000 / total : 1;
  let ms = 0;
  const add = (what, got, src = 'Keia Atlas') => lines.push({ t: clock(run.at, ms), what, got, src });
  add(`Start the ${rule.name}, version ${rule.approved.version ?? 1} (approved under ${rule.approved.change})`, run.by ? `Run by hand` : 'Run on its own', 'Keia Atlas');
  add('Check the conditions', `${rule.conditions.length} of ${rule.conditions.length} hold`, 'Keia Atlas');
  if (run.quiet) { add('Compare every record with its build sheet', 'Nothing to change'); return lines; }
  for (const step of rule.steps) {
    const fail = run.stopped_at === step.kind;
    const c = CALL[step.kind](rule, run, fail);
    add(c.what, c.got, step.kind === 'read' || step.kind === 'readback' ? (rule.reads[step.kind === 'read' ? 0 : rule.reads.length - 1] ?? '').replace(/^.*\((.*)\).*$/, '$1') || 'Keia Atlas' : step.kind === 'write' ? (rule.reads[rule.reads.length - 1] ?? '').replace(/^.*\((.*)\).*$/, '$1') || 'Keia Atlas' : 'Keia Atlas');
    ms += (step.seconds ?? 0) * 1000 * scale;
    if (fail) {
      if (step.kind === 'write') { const rb = CALL.readback(rule, run, true); add(rb.what, rb.got); }
      break;
    }
  }
  if (run.result === 'unable' || run.result === 'halted') {
    if (rolledBack(rule, run)) add('Restore the previous state', run.before ? `Restored ${run.before}` : 'Restored');
    add('Stop', 'Unable to complete; raised an incident to the rule\'s owner');
  } else if (run.result === 'done' || run.result === 'rolled-back' || run.result === 'undone') add('Record the run', 'Done automatically');
  if (run.result === 'rolled-back' || run.result === 'undone') add(run.result === 'undone' ? 'Undo' : 'Roll back', `${run.reversed_by ?? run.by ?? 'A person'} put it back`);
  if (run.ai) add('AI draft of the summary line: prompt version 3, no tools called, a local model, EU region', 'Checked against the read back before it was saved', 'AI');
  return lines;
}

/** Every entry for the log, newest first: runs (with their traces), and the hand-offs, priorities and states of
    incidents. `rules` are rule records with `runs`; `incidents` are incident records; `name(id)` a person's name. */
export function entries({ rules = [], incidents = [], name = (id) => id }) {
  const out = [];
  for (const rule of rules) for (const run of rule.runs) {
    if (run.quiet) continue;
    out.push({ id: `run-${run.id}`, at: run.at, kind: 'run', who: `${rule.name} (${name(rule.owner)})`, what: `${run.result === 'done' ? 'Done automatically' : run.result === 'unable' ? (rolledBack(rule, run) ? 'Unable to complete, rolled back' : 'Unable to complete') : run.result === 'undone' ? 'Undone' : run.result === 'rolled-back' ? 'Rolled back' : run.result}: ${run.did}`, src: 'Keia Atlas', run: run.id, rule: rule.id, item: run.incident ? `inc:${run.incident}` : null, lines: traceOf(rule, run) });
    if (run.ai) out.push({ id: `ai-${run.id}`, at: run.at, kind: 'ai', who: 'AI (a local model, EU region)', what: `Drafted the summary line of ${run.id}`, src: 'Keia Atlas', run: run.id, rule: rule.id });
  }
  for (const inc of incidents) {
    out.push({ id: `pri-${inc.number}`, at: inc.opened, kind: 'priority', who: 'Keia Atlas', what: `Proposed P${inc.priority_proposed} for ${inc.number}${inc.priority_reason ? `: ${inc.priority_reason}` : ''}`, src: 'Keia Atlas', item: `inc:${inc.number}` });
    if (inc.priority_override) out.push({ id: `pri2-${inc.number}`, at: inc.priority_override.at, kind: 'priority', who: name(inc.priority_override.by), what: `Changed ${inc.number} from P${inc.priority_proposed} to P${inc.priority_override.priority}: ${inc.priority_override.reason}`, src: 'Keia Atlas', item: `inc:${inc.number}` });
    if (inc.major) out.push({ id: `maj-${inc.number}`, at: inc.major.at, kind: 'hand', who: 'Keia Atlas', what: `Declared ${inc.number} a major incident; commander ${name(inc.major.commander)}`, src: 'Keia Atlas', item: `inc:${inc.number}` });
    inc.history.forEach((h, i) => {
      if (!h.state || h.rule) return;
      const who = h.by ? name(h.by) : h.person ?? 'The service desk';
      const what = h.state === 'in-progress' ? `${who} took ${inc.number}` : `${inc.number} is ${h.state.replace('-', ' ')}`;
      out.push({ id: `st-${inc.number}-${i}`, at: h.at, kind: h.state === 'in-progress' ? 'hand' : 'state', who, what, src: h.source === 'servicenow' ? 'ServiceNow' : 'Keia Atlas', item: `inc:${inc.number}` });
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}
