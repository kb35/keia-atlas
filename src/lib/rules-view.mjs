// Standing rules, changes and the audit log as the pages show them: data/standing-rules joined to the people, the
// services, the incidents and the year plan's change freezes. Worked out once at build time. The rules themselves
// (the run machine, the clock, the card) are pure, in src/lib/rules.mjs.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { incidents, plans, spaces, DEMO_TODAY, href } from './data.mjs';
import { PEOPLE } from './demo.mjs';
import { SERVICES, serviceOfClass } from './services.mjs';
import { runsFor, howCard, canRun, verbFor, runLine, stripWords, RESULT, rolledBack, defaultOwnerClock } from './rules.mjs';
import { entries } from './audit.mjs';

const DIR = path.join(process.cwd(), 'data', 'standing-rules');
const raw = readdirSync(DIR).filter((f) => f.endsWith('.yaml')).sort().map((f) => parse(readFileSync(path.join(DIR, f), 'utf8')));

export const PEOPLE_MAP = Object.fromEntries(PEOPLE.map((p) => [p.id, { name: p.name, first: p.name.split(' ')[0], initials: p.initials }]));
export const personName = (id) => PEOPLE_MAP[id]?.name ?? id;
export const firstName = (id) => PEOPLE_MAP[id]?.first ?? id;
export const FREEZES = Object.values(plans).flatMap((p) => (p.items ?? p.events ?? p.dates ?? []).filter((x) => x?.kind === 'freeze'));
export const LOG_PATH = '/support/log/';
export const rulePath = (id) => `/support/rules/${id}/`;
export const changePath = (id) => `/support/changes/${id.toLowerCase()}/`;

// Rules, with their runs for the strip (the recorded runs, and the quiet nightly ones), newest last.
// Every note the record added to a ticket on its own is a run of the matching rule, so each carries its card.
const matchRuns = Object.values(incidents).flatMap((inc) => inc.history.map((h, i) => ({ h, i })).filter(({ h }) => h.source === 'keia_atlas' && !h.run && !h.state)
  .map(({ h, i }) => ({ id: `M-${inc.number}-${i}`, at: h.at, result: 'done', target: inc.number, incident: inc.number, did: h.note.replace(/\.$/, ''), ms: 900 })));
export const RULES = Object.fromEntries(raw.map((r) => {
  const runs = r.id === 'match-tickets' ? [...r.runs, ...matchRuns].sort((a, b) => a.at.localeCompare(b.at)) : r.runs;
  return [r.id, { ...r, runs, allRuns: runsFor({ ...r, runs }, { today: DEMO_TODAY, days: 21 }) }];
}));
/** The run behind an automatic note on a ticket (history entry i), for its card. */
export const runOfNote = (inc, i) => inc.history[i]?.run ?? (inc.history[i]?.source === 'keia_atlas' && !inc.history[i]?.state ? `M-${inc.number}-${i}` : null);
export const RULE_LIST = Object.values(RULES).sort((a, b) => a.name.localeCompare(b.name));
const RUNS = new Map(RULE_LIST.flatMap((r) => r.allRuns.map((run) => [run.id, { rule: r, run }])));
export const runById = (id) => RUNS.get(id) ?? null;
export const lastRun = (rule) => rule.allRuns[rule.allRuns.length - 1] ?? null;

/** The "How was this done?" card for a run. The page is built for everyone, so Run again is decided in the browser
    for whoever is viewing (rules-client.mjs); on the server it is drawn for the rule's owner and hidden by default. */
export function cardFor(runId, { viewer = null, jobOwner = null } = {}) {
  const x = runById(runId);
  return x ? howCard(x.rule, x.run, { people: PEOPLE_MAP, today: DEMO_TODAY, viewer, jobOwner }) : null;
}
export const lineFor = (runId) => { const x = runById(runId); return x ? runLine(x.rule, x.run, PEOPLE_MAP) : ''; };
export const stripFor = (rule) => ({ runs: rule.allRuns, words: stripWords(rule.allRuns) });

// Which incidents name each rule (raised by it, run for it, or offered on their Do section).
export function incidentsOfRule(id) {
  return Object.values(incidents).filter((inc) => inc.raised_by?.rule === id || inc.history.some((h) => h.rule === id) || (inc.keia_atlas.actions ?? []).some((a) => a.rule === id));
}

// The service an incident belongs to: from the device's class, else AV for a space.
export function serviceOf(v) {
  if (v.pos?.cls) return serviceOfClass(v.pos.cls, v.space?.kind) ?? 'av';
  return 'av';
}
export const serviceOwner = (sid) => SERVICES[sid]?.owner ?? 'sofia';

/** The Do section of an incident: each standing rule it offers, with its verb, its way back and whether it may run
    now (checked at `now`, the incident's own moment in the demo). */
export function actionsFor(inc, { now }) {
  return (inc.keia_atlas.actions ?? []).map((a) => {
    const rule = RULES[a.rule];
    const meeting = inc.booking ? { at: inc.booking.at } : null;
    const check = canRun(rule, { now, meeting, freezes: FREEZES, wave: 1, failures: 0, confirmed: rule.reversal.kind === 'ask' ? null : 'n/a' });
    return { ...a, rule, verb: verbFor(rule, a.target), check, again: a.again ? runById(a.again)?.run ?? null : null };
  });
}

/** The default owner clock for an incident at `now`. */
export function clockFor(v, { now }) {
  const inc = v.inc;
  const taken = inc.history.find((h) => h.state === 'in-progress')?.at ?? null;
  return defaultOwnerClock({ opened: inc.opened, priority: inc.priority, taken, now, serviceOwner: serviceOwner(serviceOf(v)), people: PEOPLE_MAP });
}

// ---- Changes (Support › Changes): standard changes are rule runs and rule approvals; normal ones are planned --------
const NORMAL = [
  { id: 'CHG-201', kind: 'normal', title: 'Firmware 4.7.0 on the Whooper Swan video bar, for the Lab pilot', at: '2026-09-16T18:30', owner: 'niamh', approver: 'sofia', status: 'done', space: 'dub-3-09', note: 'A pilot of 4.7.0 before it can enter the standard (LAB test). The standard stays 4.6.2 until the Lab passes it.', incidents: ['INC0041210'], blast: 'One space, one unit' },
];
function ruleChanges() {
  const out = [];
  for (const r of RULE_LIST) {
    out.push({ id: r.approved.change, kind: 'standard', title: `Standing rule approved: ${r.title}`, at: r.approved.at, owner: r.owner, approver: r.owner, status: 'approved', rule: r.id, note: `Version ${r.approved.version ?? 1}. ${r.reversal.words}`, blast: `At most ${r.caps.per_wave} ${r.caps.per_wave === 1 ? 'unit' : 'units'} per wave` });
    for (const run of r.runs.filter((x) => x.change)) {
      out.push({ id: run.change, kind: 'standard', title: `${r.name}: ${run.did}`, at: run.at, owner: r.owner, approver: null, status: run.result === 'unable' ? (rolledBack(r, run) ? 'unable-back' : 'unable') : run.result === 'done' ? 'auto' : run.result, rule: r.id, run: run.id, incidents: run.incident ? [run.incident] : [], blast: '1 unit' });
    }
  }
  return out;
}
export const CHANGE_STATUS = { auto: 'Done automatically', 'unable-back': 'Unable to complete, rolled back', unable: 'Unable to complete', approved: 'Approved', done: 'Done', 'rolled-back': 'Rolled back', undone: 'Undone' };
export const CHANGE_KIND = { standard: 'Standard', normal: 'Normal', emergency: 'Emergency' };
export const CHANGES = [...NORMAL, ...ruleChanges()].sort((a, b) => b.at.localeCompare(a.at));
export const changeById = (id) => CHANGES.find((c) => c.id === id) ?? null;

// ---- The audit log ------------------------------------------------------------------------------------------------
export const LOG = entries({ rules: RULE_LIST.map((r) => ({ ...r, runs: r.runs })), incidents: Object.values(incidents), name: personName });

export { RESULT, href, spaces, runLine };
