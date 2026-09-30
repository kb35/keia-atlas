// Standing rules in the browser: runs made in the demo, the "How was this done?" card drawn for whoever is viewing,
// and the way back (Roll back, Undo). Pages that show rules include RulesData.astro (the rules as JSON) and import
// this module. Runs and reversals go through the live layer (src/lib/live.mjs), so every window sees them:
//
//   item  rule:<rule id>
//   field run:<run id>    after: the run ({ id, at, result, target, by, incident, stopped_at, why, did, ... })
//         back:<run id>   after: { by, at, kind }  (someone rolled it back or undid it)
//
// Times: a page that plays a held story (the 07:52 fault) passes its own clock (`now()`), so the demo's runs read
// "07:58" beside the story's other times; anywhere else a run is stamped with the real time.
import { howCard, playRun, runLine, rolledBack } from './rules.mjs';
import { howBody } from './howcard.mjs';

const W = window, D = document;
let DATA = null;
export function data() {
  if (DATA && DATA.__el?.isConnected) return DATA;
  const el = D.getElementById('rs-rules');
  if (!el) return null;
  try { DATA = JSON.parse(el.textContent || '{}'); DATA.__el = el; } catch { DATA = null; }
  return DATA;
}
const live = () => W.rsLive?.live ?? null;
const viewer = () => (W.rsWhoId ? W.rsWhoId() : null);
const actor = () => (W.rsActorId ? W.rsActorId() : viewer() ?? 'demo-admin');
export const people = () => data()?.people ?? {};
export const ruleOf = (id) => data()?.rules?.[id] ?? null;
const pad = (n) => String(n).padStart(2, '0');
/** Now as the data writes time (zoneless local), for runs made on a page with no held clock. */
export const localNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

/** The runs of a rule made in this demo (every window), oldest first, and who put which back. */
export function liveState(ruleId) {
  const L = live(); if (!L) return { runs: [], back: {} };
  const st = L.stateOf(`rule:${ruleId}`, {});
  const runs = Object.entries(st).filter(([k, v]) => k.startsWith('run:') && v).map(([, v]) => v).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const back = Object.fromEntries(Object.entries(st).filter(([k, v]) => k.startsWith('back:') && v).map(([k, v]) => [k.slice(5), v]));
  return { runs, back };
}
/** Every run of a rule: the page's and the demo's, each marked when a person put it back. */
export function runsOf(ruleId) {
  const r = ruleOf(ruleId); if (!r) return [];
  const { runs, back } = liveState(ruleId);
  return [...r.runs, ...runs].map((run) => (back[run.id] ? { ...run, reversed: true, result: back[run.id].kind === 'undo' ? 'undone' : 'rolled-back', reversed_by: back[run.id].by } : run));
}
export function findRun(runId) {
  const d = data(); if (!d) return null;
  for (const id of Object.keys(d.rules)) { const run = runsOf(id).find((x) => x.id === runId); if (run) return { rule: d.rules[id], run }; }
  return null;
}
/** The card for a run, for the viewer. The job's owner (who may also run it again) comes from the nearest
    [data-job-owner] around the trigger, or the page's. */
export function cardHtml(runId, trigger) {
  const x = findRun(runId); if (!x) return null;
  const jobOwner = trigger?.closest?.('[data-job-owner]')?.dataset.jobOwner || D.querySelector('[data-job-owner]')?.dataset.jobOwner || null;
  const ppl = people();
  const card = howCard(x.rule, x.run, { people: Object.fromEntries(Object.entries(ppl).map(([k, v]) => [k, { name: v.name }])), today: data().today, viewer: viewer(), jobOwner });
  return howBody(card, { log: data().log });
}
W.rsHowBody = (runId, trigger) => cardHtml(runId, trigger);

/** A run's one line for a record ("Done automatically under the DNS rule (owner: Nora)"). */
export const lineOf = (rule, run) => runLine(rule, run, people());

let seq = 0;
/** Play a run step by step. opts:
      target, incident   what it acts on, and the incident it runs for
      fail               the step it stops at ('write' or 'readback'), for a run that will be unable to complete
      now()              the clock to stamp it with (zoneless local time)
      onStep(step)       called at each state: { state, words, end? }
    Resolves with the recorded run. Reduced motion changes nothing about the steps: the words are the state. */
export function play(ruleId, { target = '', incident = null, fail = null, now = localNow, onStep = () => {}, by = actor(), did = null, extra = {} } = {}) {
  const rule = ruleOf(ruleId); if (!rule) return Promise.resolve(null);
  const steps = playRun(rule, { fail });
  const started = Date.now();
  const id = `RUN-${9000 + (Date.now() % 900) + (seq++ % 99)}`;
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      const s = steps[i++];
      onStep(s);
      if (!s.end) { setTimeout(next, s.ms); return; }
      const result = s.state === 'done' ? 'done' : 'unable';
      const stopped = steps.find((x) => x.state === 'unable') ? steps[steps.findIndex((x) => x.state === 'unable') - 1].state : null;
      const run = { id, at: now(), result, target, by, ms: Math.max(300, Date.now() - started), ...(incident ? { incident } : {}), ...(result === 'unable' ? { stopped_at: stopped, why: fail === 'write' ? 'The write was refused. Nothing stayed changed.' : 'The read back did not match. Nothing stayed changed.' } : {}), did: did ?? `${rule.verb.replace('{target}', target)}`, live: true, ...extra };
      live()?.record({ item: `rule:${ruleId}`, field: `run:${id}`, before: null, after: run, who: by });
      resolve(run);
    };
    next();
  });
}

/** Roll back or Undo a run (only the verb its rule declared; never a fake Undo). */
export function putBack(runId, kind) {
  const x = findRun(runId); if (!x) return null;
  if (x.rule.reversal.kind !== kind || x.run.result !== 'done' || x.run.reversed) return null;
  const who = actor();
  const after = { by: who, at: new Date().toISOString(), kind };
  live()?.record({ item: `rule:${x.rule.id}`, field: `back:${runId}`, before: null, after, who });
  return after;
}

// The card's buttons. Roll back and Undo act here and say so; Run again is the page's (it knows the job).
if (!W.__rsRulesBound) {
  W.__rsRulesBound = true;
  D.addEventListener('rs:how-act', (e) => {
    const { kind, run } = e.detail || {};
    if (kind === 'rollback' || kind === 'undo') {
      const done = putBack(run, kind);
      const x = findRun(run);
      if (done && x) {
        W.rsHowRefresh?.();
        W.rsToast?.(`${kind === 'undo' ? 'Undone' : 'Rolled back'}: ${x.rule.reversal.words.replace(/^(Undo|Roll back) /, '').replace(/^./, (c) => c.toUpperCase())}`);
        D.dispatchEvent(new CustomEvent('rs:rule-changed', { detail: { rule: x.rule.id, run, kind } }));
      }
    } else if (kind === 'again' && W.rsRunAgain) W.rsRunAgain(run, e.detail);
  });
  // Run again belongs to the page that set it; a page change clears it.
  D.addEventListener('astro:before-swap', () => { W.rsRunAgain = null; });
}
export { rolledBack };
