// Cross-reference checks for standing rules (data/standing-rules) and the incidents that name them.
//
// A schema checks one rule on its own shape. These checks make sure it points at something real and tells a
// possible story:
//   - the file name is the rule's id; the owner and anyone who ran it by hand are demo people;
//   - runs are in time order, with unique ids across every rule, none after the demo's today;
//   - a run unable to complete says where it stopped and why; only such a run does;
//   - a rule whose way back is "ask" never ran on its own (every run names the person who confirmed it);
//   - an incident's rule, run, action and raised_by point at a rule and a run that exist, and a major incident's
//     commander is a demo person.
// Each check returns { file, at, message } like the others in crossrefs.mjs.

import path from 'node:path';

export const LAST_MOMENT = '2026-09-28T23:59';

export function crossCheckRules(records, { people }) {
  const problems = [];
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const rules = records.filter((r) => r.folder === 'standing-rules');
  const byId = new Map(rules.map((r) => [r.data.id, r.data]));
  const runs = new Map();
  const who = (rec, at, id) => { if (id && !people.has(id)) report(rec, at, `person "${id}" is not one of the demo people`); };

  for (const rec of rules) {
    const d = rec.data;
    if (rec.id !== d.id) report(rec, ['id'], `file name "${path.basename(rec.file)}" must be the rule's id, ${d.id}.yaml`);
    who(rec, ['owner'], d.owner);
    d.runs.forEach((r, i) => {
      const at = ['runs', i];
      if (runs.has(r.id)) report(rec, [...at, 'id'], `run ${r.id} is already in ${runs.get(r.id).rule}`);
      runs.set(r.id, { rule: d.id, run: r });
      if (i > 0 && r.at < d.runs[i - 1].at) report(rec, [...at, 'at'], `${r.at} is before the run above it; runs go oldest first`);
      if (r.at > LAST_MOMENT) report(rec, [...at, 'at'], `${r.at} is in the future`);
      who(rec, [...at, 'by'], r.by);
      const unable = r.result === 'unable' || r.result === 'halted';
      if (unable && (!r.stopped_at || !r.why)) report(rec, at, 'a run unable to complete says where it stopped (stopped_at) and why');
      if (!unable && (r.stopped_at || r.why)) report(rec, at, 'only a run unable to complete has stopped_at and why');
      if (d.reversal.kind === 'ask' && !r.by) report(rec, [...at, 'by'], `the ${d.name} asks a person every time, so every run names who confirmed it (by)`);
      if (r.result === 'rolled-back' && d.reversal.kind !== 'rollback') report(rec, [...at, 'result'], `the ${d.name} declares ${d.reversal.kind}, not Roll back`);
      if (r.result === 'undone' && d.reversal.kind !== 'undo') report(rec, [...at, 'result'], `the ${d.name} declares ${d.reversal.kind}, not Undo`);
    });
  }

  for (const rec of records.filter((r) => r.folder === 'incidents')) {
    const d = rec.data;
    const ruleRun = (at, rule, run) => {
      if (rule && !byId.has(rule)) { report(rec, at, `standing rule "${rule}" does not exist (data/standing-rules)`); return; }
      if (run && !runs.has(run)) report(rec, at, `run ${run} is not a run of any standing rule`);
      else if (run && rule && runs.get(run).rule !== rule) report(rec, at, `run ${run} belongs to ${runs.get(run).rule}, not ${rule}`);
    };
    d.history.forEach((h, i) => ruleRun(['history', i], h.rule, h.run));
    if (d.raised_by) ruleRun(['raised_by'], d.raised_by.rule, d.raised_by.run);
    (d.keia_atlas.actions ?? []).forEach((a, i) => ruleRun(['keia_atlas', 'actions', i], a.rule, a.again));
    if (d.major) who(rec, ['major', 'commander'], d.major.commander);
  }
  return problems;
}
