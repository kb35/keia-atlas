// Standing rules (Keia Method 2.8; SYNTHESIS 2.3, 2.9, 2.12; UX-V2 §4.1, §4.5, §6): the run model, the way back each
// rule declares, the conditions and caps checked before every run, the default owner clock and the major incident's
// commander. Pure: no data, no browser. src/lib/rules-view.mjs joins it to data/standing-rules; the pages and the
// browser (src/lib/rules-client.mjs) run the same functions; tests/rules.test.mjs checks them.
//
// A run is a small state machine. Every run reads, writes and reads back; a write that does not read back as
// intended is "Unable to complete", never done:
//
//   checking ──(a condition fails)──► not-run                 nothing was touched; the words say which condition
//      │
//      ▼
//    read ─► write ─► (wait) ─► readback ─► done              "Done automatically under the DNS rule (owner: Nora)"
//               │                  │
//               └──(refused)───────┴──(does not match)──► unable ─► rolled-back   (the rule declared Roll back or
//                                                            │                     Undo: it restores what it changed)
//                                                            └──► unable           (declared none: it ends where it
//                                                                                   started, and says so)
//   Two runs unable to complete in a row (caps.halt_after) halt the rule until its owner runs it again.

export const STEP_WORD = { read: 'Read', write: 'Write', wait: 'Wait', readback: 'Read back' };
export const REVERSAL_VERB = { undo: 'Undo', rollback: 'Roll back', none: null, ask: null };
export const REVERSAL_WORD = { undo: 'Undo', rollback: 'Roll back', none: 'Nothing to put back', ask: 'Asks every time' };
// What a finished run is called, the glyph it shows and the square it draws in the runs strip.
export const RESULT = {
  done: { word: 'Done automatically', glyph: 'fine', square: 'done' },
  unable: { word: 'Unable to complete', glyph: 'fault', square: 'notch' },
  'rolled-back': { word: 'Rolled back', glyph: 'review', square: 'back' },
  undone: { word: 'Undone', glyph: 'review', square: 'back' },
  halted: { word: 'Halted', glyph: 'fault', square: 'notch' },
  'not-run': { word: 'Not run', glyph: 'off', square: 'skip' },
};

// ---- Words ------------------------------------------------------------------------------------------------------
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
/** "02:00" today, "02:00, 26 Sept" before. Times are the data's local time, written without a zone. */
export function at(t, today = '') {
  const [d, hm = ''] = String(t).split('T');
  const [, m, dd] = d.split('-');
  const day = `${+dd} ${MON[+m - 1] === 'Sep' ? 'Sept' : MON[+m - 1]}`;
  return d === today ? hm.slice(0, 5) : `${hm.slice(0, 5)}, ${day}`;
}
export const seconds = (ms) => (ms == null ? '' : ms < 60000 ? `${Math.round(ms / 100) / 10} s`.replace('.0 s', ' s') : `${Math.round(ms / 60000)} min`);
const first = (people, id) => String(people?.[id]?.name ?? id ?? '').split(' ')[0];
const fullName = (people, id) => people?.[id]?.name ?? id ?? '';

/** The verb a rule shows on a record: "Cycle PoE on GE1/0/12". */
export const verbFor = (rule, target) => String(rule.verb).replace('{target}', target ?? 'this');
/** The line on a record for a run: "Done automatically under the DNS rule (owner: Nora)". */
export function runLine(rule, run, people) {
  const owner = `${rule.name} (owner: ${first(people, rule.owner)})`;
  if (run.result === 'done') return `Done automatically under the ${owner}`;
  if (run.result === 'unable') return rolledBack(rule, run) ? `Unable to complete, rolled back · ${owner}` : `Unable to complete · ${owner}`;
  if (run.result === 'rolled-back') return `Rolled back · ${owner}`;
  if (run.result === 'undone') return `Undone · ${owner}`;
  if (run.result === 'halted') return `Halted after runs unable to complete · ${owner}`;
  if (run.result === 'not-run') return `Not run: ${run.why ?? 'a condition did not hold'} · ${owner}`;
  return owner;
}
/** A run unable to complete restores what it changed when its rule declared a way back (Roll back or Undo). */
export const rolledBack = (rule, run) => run.result === 'unable' && run.stopped_at !== 'read' && ['rollback', 'undo'].includes(rule.reversal.kind);

// ---- Conditions and caps, checked before every run ----------------------------------------------------------------
const minutes = (t) => { const [, hm = '00:00'] = String(t).split('T'); const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const inWindow = (window, t) => {
  if (!window) return true;
  const [a, b] = window.split(' to ').map((x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; });
  const x = minutes(t);
  return a <= b ? x >= a && x <= b : x >= a || x <= b;
};
const between = (t, from, to) => t.slice(0, 10) >= from && t.slice(0, 10) <= to;

/** Whether a rule may run now, and each check in plain words. ctx:
      now        the moment (zoneless local time)
      meeting    { at, until? } the next booking in the space, or null
      freezes    [{ date, end }] change freezes
      wave       how many units this run would touch
      failures   runs unable to complete in a row just before this one
      confirmed  the person who confirmed it (a rule that asks needs one)
    Returns { ok, checks: [{ id, ok, words }], why } where why is the first check that failed. */
export function canRun(rule, ctx = {}) {
  const { now = '', meeting = null, freezes = [], wave = 1, failures = 0, confirmed = null } = ctx;
  const checks = [];
  const add = (id, ok, words) => checks.push({ id, ok, words });
  if (rule.reversal.kind === 'ask') add('confirmed', !!confirmed, confirmed ? 'A person confirmed this run' : 'Needs a person to confirm: it cannot be put back');
  if (rule.window) add('window', inWindow(rule.window, now), inWindow(rule.window, now) ? `Inside its window, ${rule.window}` : `Outside its window, ${rule.window}`);
  let meetingOk = true, meetingWords = 'No meeting in the space now';
  if (meeting?.at) {
    const gap = (Date.parse(meeting.at) - Date.parse(now)) / 60000;
    const going = meeting.until ? Date.parse(meeting.until) > Date.parse(now) && gap <= 0 : gap <= 0 && gap > -60;
    if (going) { meetingOk = false; meetingWords = 'A meeting is on in the space now'; }
    else if (gap > 0 && gap <= 10) { meetingOk = false; meetingWords = `A meeting starts in ${Math.round(gap)} min`; }
    else if (gap > 0) meetingWords = `No meeting in the space now; the next is at ${String(meeting.at).slice(11, 16)}`;
  }
  add('meeting', meetingOk, meetingWords);
  const freeze = freezes.find((f) => between(now, f.date, f.end ?? f.date));
  add('freeze', !freeze, freeze ? `In a change freeze until ${freeze.end ?? freeze.date}` : 'Not in a change freeze');
  add('cap', wave <= rule.caps.per_wave, wave <= rule.caps.per_wave ? `${wave} of at most ${rule.caps.per_wave} ${rule.caps.per_wave === 1 ? 'unit' : 'units'} in this wave` : `${wave} units is over the cap of ${rule.caps.per_wave} per wave`);
  add('halt', failures < rule.caps.halt_after, failures < rule.caps.halt_after ? 'Not halted' : `Halted: ${failures} runs in a row were unable to complete`);
  const failed = checks.find((c) => !c.ok);
  return { ok: !failed, checks, why: failed?.words ?? null };
}

// ---- The run as a state machine -----------------------------------------------------------------------------------
/** The states a run passes through for this rule, in order, before it ends. */
export const pathOf = (rule) => ['checking', ...rule.steps.map((s) => s.kind)];
/** The next state. `outcome` is 'ok' (the step did what it should), 'refused' (a write was refused) or 'mismatch' (a
    read back did not match), or for checking, 'blocked'. Unknown moves throw, so the demo can never invent one. */
export function nextState(rule, state, outcome = 'ok') {
  const path = pathOf(rule);
  const i = path.indexOf(state);
  const back = ['rollback', 'undo'].includes(rule.reversal.kind);
  if (state === 'checking' && outcome === 'blocked') return 'not-run';
  if (state === 'unable') { if (back) return 'rolled-back'; throw new Error(`The ${rule.name} declares no way back`); }
  if (i < 0) throw new Error(`"${state}" is not a state of a run of the ${rule.name}`);
  if (outcome === 'refused' && state !== 'write') throw new Error('Only a write can be refused');
  if (outcome === 'mismatch' && state !== 'readback') throw new Error('Only a read back can fail to match');
  if (outcome === 'refused' || outcome === 'mismatch') return 'unable';
  return i === path.length - 1 ? 'done' : path[i + 1];
}
/** Every state a run goes through, for the demo to play one by one: each with the step's words and a duration
    shortened for the screen (the real seconds are kept for the card). `fail` makes the run stop at that step. */
export function playRun(rule, { fail = null, blocked = null, speed = 0.06, min = 450, max = 2400 } = {}) {
  const out = [{ state: 'checking', words: blocked ? `Checking: ${blocked}` : 'Checking the conditions', ms: min }];
  if (blocked) { out.push({ state: 'not-run', words: `Not run: ${blocked}`, ms: 0, end: true }); return out; }
  let state = 'checking';
  for (;;) {
    const outcome = fail && state === fail ? (fail === 'readback' ? 'mismatch' : 'refused') : 'ok';
    const next = nextState(rule, state, outcome);
    if (next === 'done') { out.push({ state: 'done', words: 'Done automatically, read back and matched', ms: 0, end: true }); break; }
    if (next === 'unable') {
      out.push({ state: 'unable', words: `Unable to complete at the ${STEP_WORD[state].toLowerCase()} step`, ms: min });
      if (['rollback', 'undo'].includes(rule.reversal.kind)) out.push({ state: 'rolled-back', words: 'Rolled back: the previous state is restored', ms: 0, end: true });
      else out[out.length - 1].end = true;
      break;
    }
    const step = rule.steps.find((s) => s.kind === next);
    out.push({ state: next, words: step.words, real: step.seconds ?? 0, ms: Math.max(min, Math.min(max, (step.seconds ?? 0) * 1000 * speed)) });
    state = next;
  }
  return out;
}
/** "Running · read back in 40 s": the words a Do button shows while a run is under way (the words are the state). */
export function runningWords(rule, state) {
  const i = rule.steps.findIndex((s) => s.kind === state);
  if (i < 0) return 'Running · checking the conditions';
  const left = rule.steps.slice(i).filter((s) => s.kind !== 'readback').reduce((n, s) => n + (s.seconds ?? 0), 0);
  if (state === 'readback') return 'Running · reading back';
  return `Running · read back in ${Math.max(1, Math.round(left))} s`;
}

// ---- Who may do what ----------------------------------------------------------------------------------------------
/** Run again appears only for the rule's owner or the job's owner (UX-V2 §6). */
export const mayRunAgain = (rule, viewer, jobOwner = null) => !!viewer && (viewer === rule.owner || (!!jobOwner && viewer === jobOwner));
/** The way back a run offers, or null. Only the verb the rule declared; only on a run that changed something and
    has not been put back; never a fake Undo (SYNTHESIS 2.9). */
export function wayBack(rule, run) {
  const verb = REVERSAL_VERB[rule.reversal.kind];
  if (!verb || run.result !== 'done' || run.reversed) return null;
  return { verb, kind: rule.reversal.kind, words: rule.reversal.words };
}

// ---- Evidence strength: a count, never a percentage ------------------------------------------------------------
/** "3 of 4 signals agree with a PoE fault" and the ones not checked. */
export function evidenceStrength(signals, suggests) {
  const agree = signals.filter((s) => s.fits === 'agrees').length;
  const differ = signals.filter((s) => s.fits === 'differs');
  const notChecked = signals.filter((s) => s.fits === 'not-checked');
  const words = `${agree} of ${signals.length} ${signals.length === 1 ? 'signal agrees' : 'signals agree'} with ${suggests}`;
  return { agree, of: signals.length, differ: differ.map((s) => s.says), notChecked: notChecked.map((s) => s.says), words };
}

// ---- The default owner clock and response targets ---------------------------------------------------------------
// How long work may wait for someone to take it before it goes to the service's owner (Keia Method 2.5). P1 and P2
// count every minute; P3 and P4 count working hours, 08:00 to 18:00. Simulated targets for the demo.
export const RESPONSE_MIN = { 1: 15, 2: 15, 3: 480, 4: 960 };
export const WORKDAY = { from: 8 * 60, to: 18 * 60 };
const iso = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const ms0 = (t) => Date.parse(`${t}Z`);
/** When work opened at `opened` with this priority is due to be taken (zoneless local time). */
export function dueAt(opened, priority) {
  const need = RESPONSE_MIN[priority] ?? 480;
  if (priority <= 2) return iso(ms0(opened) + need * 60000);
  let t = ms0(opened), left = need;
  for (let guard = 0; guard < 20 && left > 0; guard++) {
    const day = iso(t).slice(0, 10), m = minutes(iso(t));
    if (m < WORKDAY.from) { t = ms0(`${day}T08:00`); continue; }
    if (m >= WORKDAY.to) { t = ms0(`${day}T08:00`) + 864e5; continue; }
    const take = Math.min(left, WORKDAY.to - m);
    t += take * 60000; left -= take;
    if (left > 0) t = ms0(`${day}T08:00`) + 864e5;
  }
  return iso(t);
}
/** The default owner clock: nobody has the work yet, so when does it go to the service owner?
      { state: 'running' | 'passed' | 'taken', due, left (min), goesTo, words } */
export function defaultOwnerClock({ opened, priority, taken = null, now, serviceOwner, people }) {
  const due = dueAt(opened, priority);
  const goesTo = serviceOwner;
  const name = fullName(people, goesTo);
  if (taken) return { state: 'taken', due, left: 0, goesTo, words: `Taken at ${String(taken).slice(11, 16)}, within the response target` };
  const left = Math.round((ms0(due) - ms0(now)) / 60000);
  const days = Math.round((ms0(`${due.slice(0, 10)}T00:00`) - ms0(`${String(now).slice(0, 10)}T00:00`)) / 864e5);
  const when = days === 0 ? due.slice(11, 16) : days === 1 ? `${due.slice(11, 16)} tomorrow` : at(due);
  if (left <= 0) return { state: 'passed', due, left, goesTo, words: `Nobody took it by ${days === 0 ? due.slice(11, 16) : at(due)}, so it went to ${name}, the service owner` };
  return { state: 'running', due, left, goesTo, words: `Goes to ${name}, the service owner, at ${when} if nobody takes it` };
}

// ---- The major incident's commander -------------------------------------------------------------------------------
/** Who commands a major incident when someone declares one: the service owner, unless a person is named. */
export const commanderFor = ({ serviceOwner, named = null }) => named ?? serviceOwner;

// ---- The runs strip: one square per run ---------------------------------------------------------------------------
/** Every run for the strip, oldest first: the recorded runs, and on a nightly cadence one done run for every other
    night in the last `days` days (a quiet night's run finds nothing to change, and says so). */
export function runsFor(rule, { today, days = 21 } = {}) {
  const out = rule.runs.map((r) => ({ ...r, rule: rule.id }));
  const m = /^nightly (\d\d:\d\d)$/.exec(rule.cadence ?? '');
  if (m && today) {
    const have = new Set(out.map((r) => r.at.slice(0, 10)));
    for (let i = days; i >= 1; i--) {
      const d = iso(ms0(`${today}T00:00`) - i * 864e5 + 864e5).slice(0, 10);
      if (d > today || have.has(d)) continue;
      out.push({ id: `N-${rule.id}-${d}`, at: `${d}T${m[1]}`, result: 'done', target: 'every renamed device', quiet: true, did: 'Nothing to change: every record matched its build sheet', ms: 600, rule: rule.id });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
/** The strip's summary in words, with no percentage and no score. */
export function stripWords(runs) {
  const unable = runs.filter((r) => r.result === 'unable' || r.result === 'halted').length;
  const back = runs.filter((r) => r.result === 'rolled-back' || r.result === 'undone').length;
  return `${runs.length} ${runs.length === 1 ? 'run' : 'runs'}${unable ? ` · ${unable} unable to complete` : ''}${back ? ` · ${back} put back by a person` : ''}`;
}

// ---- "How was this done?" (UX-V2 §6) ------------------------------------------------------------------------------
/** The card's rows in their fixed order, and the actions the viewer may take. `viewer` and `jobOwner` gate Run again.
    Returns { id, title, meta, rows: [{ k, v }], ai, actions: [{ verb, kind, words }], trace } */
export function howCard(rule, run, { people = {}, today = '', viewer = null, jobOwner = null, conditions = null } = {}) {
  const n = conditions ?? rule.conditions.length;
  const byHand = run.by ? ` · run by ${fullName(people, run.by)}` : '';
  const meta = `${rule.name} · owner ${fullName(people, rule.owner)} · ran ${at(run.at, today)}${run.ms != null ? ` · ${seconds(run.ms)}` : ''}${byHand}`;
  const unable = run.result === 'unable' || run.result === 'halted';
  const back = rolledBack(rule, run);
  const happened = unable
    ? `Unable to complete at the ${STEP_WORD[run.stopped_at]?.toLowerCase() ?? 'last'} step. ${run.why}${back && !/restor|put back|rolled back/i.test(run.why) ? ' It restored what it had changed.' : ''}`
    : run.result === 'rolled-back' ? `${run.did}. Rolled back afterwards${run.reversed_by ? ` by ${fullName(people, run.reversed_by)}` : ''}.`
      : run.result === 'undone' ? `${run.did}.`
        : `${run.did}. Read back and matched.`;
  const did = unable
    ? `${run.did}${run.before ? `. The record stayed ${run.before}` : ''}${back ? ', restored at the end of the run' : ''}.`
    : `${run.after ? `${run.after}${run.before ? ` (was ${run.before})` : ''}` : run.did}`;
  const evidence = unable
    ? `${n} of ${n} checks agreed before the write; ${run.stopped_at === 'write' ? 'the write was refused, so the read back did not match' : 'the read back did not match'}.`
    : run.quiet ? `${n} of ${n} checks agreed; there was nothing to write.` : `${n} of ${n} checks agreed before the write; read back matched.`;
  const rows = [
    { k: 'What happened', v: happened },
    { k: 'What it read', v: rule.reads.join(' · ') },
    { k: 'What it did', v: did },
    { k: 'What it ruled out', v: rule.rules_out.length ? rule.rules_out.join(' · ') : 'Nothing: it had no other cause to rule out' },
    { k: 'What it did not check', v: rule.not_checked.length ? rule.not_checked.join(' · ') : 'Nothing else was in scope' },
    { k: 'Evidence', v: evidence },
  ];
  const actions = [];
  const way = wayBack(rule, run);
  if (way) actions.push({ verb: way.verb, kind: way.kind, words: way.words });
  if (unable && mayRunAgain(rule, viewer, jobOwner)) actions.push({ verb: 'Run again', kind: 'again', words: 'Runs the same steps now; the timeline fills as it goes.' });
  const againFor = unable && !mayRunAgain(rule, viewer, jobOwner) ? `${first(people, rule.owner)}, the rule's owner, or whoever has the job can run it again` : null;
  return { id: run.id, rule: rule.id, title: 'How was this done?', meta, rows, ai: run.ai ?? null, actions, againFor, trace: `#run-${run.id}` };
}
