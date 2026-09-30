// Organisations and engagements (src/lib/engagements.mjs, docs/service-providers.md): the scope filter. A provider sees
// a client's records only through an active engagement, only inside its scope, and only work handed to it; nothing
// from one client ever reaches another; the provider's own crews, notes and costs never flow; revoking stops the flow
// and each side keeps its copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENGAGEMENTS, ORGS, RECORD_KINDS, federation, reach, canSee, visibleTo, engagementView, portfolio, clientCard, engagement, active, activityOf, engagementAnswer, NOW } from '../src/lib/engagements.mjs';

const ids = (rs) => rs.map((r) => r.id);
const R = federation();
const rec = (id) => R.find((r) => r.id === id);

test('a provider sees only in-scope records: its sites, and work handed to it', () => {
  const seen = new Set(ids(visibleTo('northlight')));
  // In scope: Aigna's four Americas offices and the jobs handed to Northlight there.
  for (const id of ['aigna:nyc', 'aigna:chi', 'aigna:tor', 'aigna:jnu', 'SNAG-14-02', 'TASK-14-2-03', 'SURV-0412']) assert.ok(seen.has(id), `${id} is in scope`);
  // Aigna's other offices are outside the engagement.
  for (const id of ['aigna:dub', 'aigna:lon', 'aigna:sin']) assert.ok(!seen.has(id), `${id} is outside the scope`);
  // A job at an in-scope office handed to another provider stays hidden (INC0041215, New York, with Keystone).
  assert.equal(rec('INC0041215').site, 'nyc');
  assert.ok(!seen.has('INC0041215'));
  assert.equal(reach('northlight', rec('INC0041215')).why, 'Handed to someone else');
  // Restricted records never flow, whatever the scope.
  assert.ok(!seen.has('plan-aigna-jnu-2'));
  assert.equal(reach('northlight', rec('plan-aigna-jnu-2')).why, 'Never shared');
});

test('nothing from one client reaches another, not even through the provider they share', () => {
  const aigna = engagementView('aigna-northlight', 'provider');
  const fen = engagementView('fenwater-northlight', 'provider');
  assert.ok(aigna.length && fen.length);
  assert.ok(aigna.every((r) => r.client === 'aigna'), 'the Aigna view holds only Aigna records');
  assert.ok(fen.every((r) => r.client === 'fenwater'), 'the Fenwater view holds only Fenwater records');
  // Neither client sees the other's records, nor the provider's records about the other.
  const seenByAigna = visibleTo('aigna');
  const seenByFen = visibleTo('fenwater');
  assert.ok(!seenByAigna.some((r) => r.client === 'fenwater' || r.client === 'quillmark'));
  assert.ok(!seenByFen.some((r) => r.client === 'aigna' || r.client === 'quillmark'));
  // A client's job handed to another provider never reaches Northlight either.
  assert.ok(!canSee('northlight', rec('FW-INC-2205')));
});

test('a provider\'s crews, notes and costs stay its own; what it sends lands with that client only', () => {
  const aignaSees = new Set(ids(visibleTo('aigna')));
  for (const id of ['crew-nl-1', 'note-nl-jnu', 'cost-nl-prj14']) assert.ok(!aignaSees.has(id), `${id} is Northlight's own`);
  for (const id of ['asbuilt-nl-205', 'visit-nl-chi']) assert.ok(aignaSees.has(id), `${id} was shared with Aigna`);
  assert.ok(!aignaSees.has('visit-nl-cam'), 'a visit for another client never reaches Aigna');
  // The client's side of the engagement: what it lets through, and what came back. No internal record.
  const clientSide = engagementView('aigna-northlight', 'client');
  assert.ok(clientSide.every((r) => RECORD_KINDS[r.kind].flows));
  assert.ok(clientSide.some((r) => r.id === 'asbuilt-nl-205'));
});

test('an organisation with no engagement sees nothing of another', () => {
  assert.deepEqual(visibleTo('brightwave').filter((r) => r.client !== 'aigna'), []);
  assert.ok(!canSee('brightwave', rec('SNAG-14-02')), 'another provider\'s job with the same client');
  assert.ok(!canSee('hp-poly', rec('aigna:dub')), 'a manufacturer with no sites in scope');
  assert.deepEqual(visibleTo('nobody').filter((r) => r.owner !== 'nobody'), []);
});

test('revoking stops the flow at once, and each side keeps its copy of what was shared before', () => {
  const revoked = ENGAGEMENTS.map((e) => (e.id === 'aigna-northlight' ? { ...e, revokedAt: '2026-09-20T00:00' } : e));
  const e = revoked.find((x) => x.id === 'aigna-northlight');
  assert.equal(active(e, NOW), false);
  // Shared before the cut: kept, and marked as a copy.
  const before = reach('northlight', rec('SNAG-14-02'), revoked);
  assert.equal(before.ok, true); assert.equal(before.copy, true);
  // Shared after the cut: never arrives.
  assert.equal(canSee('northlight', rec('TASK-14-2-03'), revoked), false);
  // The client keeps the as-built it was sent before.
  assert.equal(canSee('aigna', rec('asbuilt-nl-205'), revoked), true);
  // Other engagements are not touched.
  assert.equal(canSee('northlight', rec('FW-INC-2207'), revoked), true);
  // The portfolio drops a revoked client.
  assert.ok(!portfolio('northlight', NOW, R, revoked).cards.some((c) => c.client === 'aigna'));
});

test('the portfolio: one card per client, worst first, with the answer sentence', () => {
  const P = portfolio('northlight');
  assert.deepEqual(P.cards.map((c) => c.client).sort(), ['aigna', 'fenwater', 'quillmark']);
  const aigna = P.cards.find((c) => c.client === 'aigna');
  assert.equal(aigna.answer, 'Aigna: 3 jobs open, 1 past target');
  assert.ok(P.cards[0].past >= P.cards[P.cards.length - 1].past, 'worst first');
  assert.equal(P.answer, '3 clients · 7 jobs open · 2 past target');
  assert.ok(P.crews.length >= 1 && P.visits.length >= 3 && P.renewals.length === 3);
  assert.ok(P.renewals[0].left <= P.renewals[1].left, 'soonest renewal first');
  // A job waiting on the client is paused: it does not count as past target.
  assert.ok(!aigna.jobs.find((j) => j.id === 'TASK-14-2-03').clock.past);
});

test('every engagement names real organisations, a known role, and only kinds that can flow', () => {
  for (const e of ENGAGEMENTS) {
    assert.ok(ORGS[e.client]?.kind === 'client', `${e.id}: client`);
    assert.ok(ORGS[e.provider]?.kind === 'provider', `${e.id}: provider`);
    assert.ok(['integrator', 'managed', 'maintenance', 'manufacturer'].includes(e.role));
    assert.ok(e.scope.kinds.every((k) => RECORD_KINDS[k]?.flows), `${e.id}: a kind that never flows is in scope`);
    assert.ok(e.start <= e.end);
    assert.ok(activityOf(e.id).length > 0, `${e.id} has an activity log`);
  }
  assert.ok(ORGS.fenwater.fictional && ORGS.quillmark.fictional, 'the extra clients are marked fictional');
  assert.match(engagementAnswer(engagement('aigna-northlight')), /^In force · 4 sites and 1 project shared/);
  assert.equal(clientCard(engagement('quillmark-northlight')).answer, 'Quillmark Publishing: 1 job open');
});
