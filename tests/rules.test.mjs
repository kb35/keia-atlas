// Standing rules (src/lib/rules.mjs), the audit trace (src/lib/audit.mjs), the card's markup (src/lib/howcard.mjs)
// and the job record's words (src/lib/incidentcore.mjs): the run machine, the caps and conditions, the way back each
// rule declares, the default owner clock, evidence strength as a count, and the rules the card keeps (design notes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  canRun, nextState, playRun, runningWords, mayRunAgain, wayBack, evidenceStrength, dueAt, defaultOwnerClock,
  runsFor, stripWords, howCard, runLine, rolledBack, verbFor, commanderFor,
} from '../src/lib/rules.mjs';
import { traceOf, entries } from '../src/lib/audit.mjs';
import { howBody, howTrigger } from '../src/lib/howcard.mjs';
import { answerFor, impactLine, handoffs } from '../src/lib/incidentcore.mjs';
import { listHtml, dayLabel } from '../src/lib/timeline.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIR = join(ROOT, 'data', 'standing-rules');
const RULES = Object.fromEntries(readdirSync(DIR).filter((f) => f.endsWith('.yaml')).map((f) => { const r = parse(readFileSync(join(DIR, f), 'utf8')); return [r.id, r]; }));
const people = { nora: { name: 'Nora Walsh' }, declan: { name: 'Declan Moore' }, sofia: { name: 'Sofia Reyes' }, liam: { name: 'Liam Doyle' }, priya: { name: 'Priya Nair' } };
const dns = RULES['dns-from-build-sheet'], poe = RULES['poe-cycle'], cal = RULES['calendar-resync'], fw = RULES['firmware-to-standard'];

test('every rule declares one way back, and a rule that asks never runs alone', () => {
  for (const r of Object.values(RULES)) {
    assert.ok(['undo', 'rollback', 'none', 'ask'].includes(r.reversal.kind), r.id);
    assert.ok(r.not_checked.length > 0, `${r.id}: "What it did not check" is never empty`);
    assert.ok(r.steps.some((s) => s.kind === 'write') && r.steps.at(-1).kind === 'readback', `${r.id}: every run writes, then reads back last`);
  }
  assert.equal(canRun(fw, { now: '2026-09-28T23:00' }).ok, false, 'firmware needs a person to confirm');
  assert.equal(canRun(fw, { now: '2026-09-28T23:00', confirmed: 'sofia' }).ok, true);
});

test('caps and conditions: never in a booked meeting, never in a freeze, never over the cap, halted after failures', () => {
  const ok = canRun(poe, { now: '2026-09-28T07:55', meeting: { at: '2026-09-28T09:00' } });
  assert.equal(ok.ok, true);
  assert.match(ok.checks.find((c) => c.id === 'meeting').words, /next is at 09:00/);
  assert.equal(canRun(poe, { now: '2026-09-28T08:55', meeting: { at: '2026-09-28T09:00' } }).ok, false, 'a meeting in 5 min blocks it');
  assert.equal(canRun(poe, { now: '2026-09-28T09:20', meeting: { at: '2026-09-28T09:00' } }).why, 'A meeting is on in the space now');
  assert.match(canRun(poe, { now: '2026-12-20T10:00', freezes: [{ date: '2026-12-14', end: '2027-01-08' }] }).why, /change freeze/);
  assert.match(canRun(poe, { now: '2026-09-28T10:00', wave: 2 }).why, /over the cap/);
  assert.match(canRun(poe, { now: '2026-09-28T10:00', failures: 2 }).why, /Halted/);
  assert.match(canRun(dns, { now: '2026-09-28T12:00' }).why, /Outside its window/);
  assert.equal(canRun(dns, { now: '2026-09-28T02:00' }).ok, true);
});

test('the run machine: read, write, read back; a refused write is unable to complete, then rolled back if declared', () => {
  assert.equal(nextState(dns, 'checking'), 'read');
  assert.equal(nextState(dns, 'read'), 'write');
  assert.equal(nextState(dns, 'write'), 'readback');
  assert.equal(nextState(dns, 'readback'), 'done');
  assert.equal(nextState(dns, 'write', 'refused'), 'unable');
  assert.equal(nextState(dns, 'unable'), 'rolled-back');
  assert.equal(nextState(dns, 'checking', 'blocked'), 'not-run');
  assert.throws(() => nextState(poe, 'unable'), /declares no way back/, 'a PoE cycle has nothing to roll back');
  assert.throws(() => nextState(dns, 'read', 'refused'), /Only a write/);
  const fail = playRun(dns, { fail: 'write' }).map((s) => s.state);
  assert.deepEqual(fail, ['checking', 'read', 'write', 'unable', 'rolled-back']);
  const good = playRun(poe).map((s) => s.state);
  assert.deepEqual(good, ['checking', 'read', 'write', 'wait', 'readback', 'done']);
  assert.deepEqual(playRun(poe, { blocked: 'A meeting is on' }).map((s) => s.state), ['checking', 'not-run']);
  assert.equal(runningWords(poe, 'write'), 'Running · read back in 52 s');
  assert.equal(runningWords(poe, 'readback'), 'Running · reading back');
});

test('only the declared verb, never a fake Undo; Run again only for the rule\'s owner or the job\'s owner', () => {
  const done = { id: 'R1', at: '2026-09-26T02:00', result: 'done', did: 'Wrote it' };
  assert.equal(wayBack(dns, done).verb, 'Roll back');
  assert.equal(wayBack(cal, done).verb, 'Undo');
  assert.equal(wayBack(poe, done), null, 'nothing to put back');
  assert.equal(wayBack(fw, done), null, 'asks every time');
  assert.equal(wayBack(dns, { ...done, reversed: true }), null, 'already put back');
  assert.equal(mayRunAgain(dns, 'nora'), true);
  assert.equal(mayRunAgain(dns, 'liam', 'liam'), true);
  assert.equal(mayRunAgain(dns, 'liam', 'nora'), false);
  assert.equal(mayRunAgain(dns, null), false);
});

test('evidence strength is a count, never a percentage', () => {
  const s = evidenceStrength([{ says: 'a', fits: 'agrees' }, { says: 'b', fits: 'agrees' }, { says: 'c', fits: 'agrees' }, { says: 'DSP data', fits: 'not-checked' }], 'a PoE fault');
  assert.equal(s.words, '3 of 4 signals agree with a PoE fault');
  assert.deepEqual(s.notChecked, ['DSP data']);
  assert.ok(!/%|percent/i.test(s.words));
});

test('the default owner clock: P1 and P2 count every minute, P3 and P4 count working hours', () => {
  assert.equal(dueAt('2026-09-28T07:52', 2), '2026-09-28T08:07');
  assert.equal(dueAt('2026-09-28T02:01', 3), '2026-09-28T16:00', 'a P3 raised overnight starts at 08:00');
  assert.equal(dueAt('2026-09-28T16:00', 3), '2026-09-29T14:00', 'working hours carry over to the next day');
  const run = defaultOwnerClock({ opened: '2026-09-28T07:52', priority: 2, now: '2026-09-28T07:53', serviceOwner: 'sofia', people });
  assert.equal(run.state, 'running'); assert.equal(run.left, 14); assert.match(run.words, /Sofia Reyes, the service owner, at 08:07/);
  assert.equal(defaultOwnerClock({ opened: '2026-09-28T07:52', priority: 2, now: '2026-09-28T08:30', serviceOwner: 'sofia', people }).state, 'passed');
  assert.equal(defaultOwnerClock({ opened: '2026-09-28T07:52', priority: 2, taken: '2026-09-28T07:54', now: '2026-09-28T08:30', serviceOwner: 'sofia', people }).state, 'taken');
  assert.equal(commanderFor({ serviceOwner: 'sofia' }), 'sofia');
  assert.equal(commanderFor({ serviceOwner: 'sofia', named: 'yusuf' }), 'yusuf');
});

test('the card keeps its fixed order, says what it did not check, and labels AI', () => {
  const unable = dns.runs.find((r) => r.result === 'unable');
  const c = howCard(dns, unable, { people, today: '2026-09-28', viewer: 'nora' });
  assert.deepEqual(c.rows.map((r) => r.k), ['What happened', 'What it read', 'What it did', 'What it ruled out', 'What it did not check', 'Evidence']);
  assert.match(c.rows[0].v, /^Unable to complete at the write step/);
  assert.ok(c.rows[4].v.length > 0);
  assert.deepEqual(c.actions.map((a) => a.verb), ['Run again'], 'unable: no Roll back to offer, Run again for the owner');
  assert.match(c.meta, /^DNS rule · owner Nora Walsh · ran 02:00 · 1.4 s$/);
  const other = howCard(dns, unable, { people, viewer: 'liam', jobOwner: 'nora' });
  assert.deepEqual(other.actions, []);
  assert.match(other.againFor, /Nora, the rule's owner/);
  const ai = dns.runs.find((r) => r.ai);
  const card = howCard(dns, ai, { people });
  assert.match(card.ai, /^Drafted by AI \(/);
  assert.deepEqual(card.actions.map((a) => a.verb), ['Roll back']);
  const html = howBody(card, { log: '/support/log/' });
  assert.ok(html.includes('href="/support/log/#run-RUN-5118"'), 'the trace is one link away');
  assert.ok(!/%/.test(html), 'no percentage on the card');
  assert.ok(howTrigger(card).startsWith('<button type="button" class="how-link"'));
  assert.equal(runLine(dns, unable, people), 'Unable to complete, rolled back · DNS rule (owner: Nora)');
  assert.equal(rolledBack(dns, unable), true);
  assert.equal(verbFor(poe, 'GE1/0/12'), 'Cycle PoE on GE1/0/12');
});

test('the audit trace stops where the run stopped and restores what it changed', () => {
  const unable = dns.runs.find((r) => r.result === 'unable');
  const lines = traceOf(dns, unable);
  assert.ok(lines.some((l) => /Refused/.test(l.got)), 'the refused write is in the trace');
  assert.ok(lines.some((l) => /^Restored/.test(l.got)), 'the rollback is in the trace');
  assert.ok(!lines.some((l) => /Matches/.test(l.got)), 'nothing claims it matched');
  const log = entries({ rules: [dns], incidents: [], name: (id) => people[id]?.name ?? id });
  assert.ok(log.find((e) => e.id === 'run-RUN-5120'));
  assert.ok(log.find((e) => e.kind === 'ai'), 'an AI-drafted line has its own entry');
  const strip = runsFor(dns, { today: '2026-09-28', days: 21 });
  assert.ok(strip.length >= 21 && strip.every((r, i) => i === 0 || strip[i - 1].at <= r.at));
  assert.match(stripWords(strip), /1 unable to complete$/);
  assert.ok(!/%/.test(stripWords(strip)));
});

test('the job record\'s words: the answer, the impact line and the hand-off count', () => {
  const booking = { at: '2026-09-28T09:00', people: 8 };
  assert.equal(answerFor({ own: { s: 'ready', to: 'liam' }, booking }, people), 'Offered to Liam, not taken yet · booked 09:00, 8 people');
  assert.equal(answerFor({ own: { s: 'with', to: 'liam', kind: 'person' }, booking }, people), 'With Liam · booked 09:00, 8 people');
  assert.equal(answerFor({ own: { s: 'with', to: 'liam' }, run: { result: 'done', at: '2026-09-28T07:58', rule: { name: 'PoE rule' } } }, people), 'Back at 07:58 under the PoE rule · close it with what fixed it');
  assert.equal(answerFor({ own: { s: 'ready', to: 'nora' }, run: { result: 'unable', back: true, rule: { name: 'DNS rule' } } }, people), 'Unable to complete, rolled back · offered to Nora, not taken yet');
  assert.equal(impactLine({ spaceNumber: '3.09', booking, resolvedAt: '2026-09-28T07:59' }), '3.09 back for the 09:00 (8 people)');
  assert.equal(handoffs([{ to: 'liam' }, { to: 'liam' }, { to: 'marco' }, { to: 'liam' }]), 2);
  for (const s of [answerFor({ own: null }, people), answerFor({ own: { s: 'waiting', wait: 'parts' } }, people)]) assert.ok(s.split(/\s+/).length <= 25);
});

test('the timeline groups by day, newest first', () => {
  const html = listHtml([{ at: '2026-09-27T10:00', kind: 'person', who: 'A', what: 'x' }, { at: '2026-09-28T07:52', kind: 'rule', who: 'B', what: 'y' }], '2026-09-28');
  assert.ok(html.indexOf('Today, 28 Sept') < html.indexOf('27 Sept'));
  assert.equal(dayLabel('2025-12-01', '2026-09-28'), '1 Dec 2025');
});
