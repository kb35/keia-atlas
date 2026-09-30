// The blast-radius explorer and the approval a change needs (src/lib/blast.mjs, BUILD-PLAN V9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { building } from '../src/lib/floors.mjs';
import { reachable, cutOff, portsOf, uplinksOf, itemNode, circuitNodes, approvalFor, countLine, meetingsOf, ownPort } from '../src/lib/blast.mjs';
import { stateOf, windowOf, lineOf, clock } from '../src/lib/blast-render.mjs';

// A tiny graph: internet - fw - core - sw(port 1 -> a, port 2 -> b), and a second path to b through core2.
function tiny() {
  const adj = new Map();
  const add = (a, b, ports = null) => { for (const [x, y, k] of [[a, b, 1], [b, a, 0]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push({ to: y, ports, toPort: ports?.[k] ?? null }); } };
  add('internet', 'fw'); add('fw', 'core'); add('core', 'sw', [1, 49]); add('sw', 'a', [1, null]); add('sw', 'b', [2, null]);
  return adj;
}

test('what the internet still reaches, with a node or a port off', () => {
  const adj = tiny();
  assert.ok(reachable(adj).has('a'));
  const off = reachable(adj, { nodes: new Set(['sw']) });
  assert.ok(!off.has('a') && !off.has('b'));
  const port = reachable(adj, { ports: new Map([['sw', new Set([1])]]) });
  assert.ok(!port.has('a') && port.has('b'), 'port 1 off cuts a only');
  assert.equal(ownPort(adj.get('sw').find((e) => e.to === 'b')), 2);
});

test('Dublin: an IDF switch cuts its floor, a circuit cuts nothing while the other carries it', () => {
  const M = building('dub');
  const sw = cutOff(M, { nodes: new Set([itemNode('dub-4-21-r1', 37)]) });
  assert.ok(sw.spaces.length > 1);
  assert.ok(sw.spaces.every((s) => s.startsWith('dub-4-')), 'only fourth-floor spaces');
  const one = cutOff(M, { nodes: new Set(circuitNodes('dub-isp-1')) });
  assert.equal(one.spaces.length, 0);
  const both = cutOff(M, { nodes: new Set([...circuitNodes('dub-isp-1'), ...circuitNodes('dub-isp-2')]) });
  assert.ok(both.spaces.length >= sw.spaces.length);
  // Each port alone cuts a part of what the switch cuts; the uplinks are not ports to toggle.
  const ports = portsOf(M, itemNode('dub-4-21-r1', 37));
  const union = new Set(ports.flatMap((p) => p.spaces));
  assert.deepEqual([...union].sort(), sw.spaces);
  const up = uplinksOf(M, itemNode('dub-4-21-r1', 37));
  assert.ok(up.length >= 1 && !ports.some((p) => up.includes(p.port)));
});

test('the approval a change needs follows what it takes off', () => {
  assert.equal(approvalFor({ spaces: 1, floors: 1 }).level, 'go');
  assert.equal(approvalFor({ spaces: 0 }).level, 'go');
  const floor = approvalFor({ spaces: 10, floors: 1 });
  assert.equal(floor.level, 'owner');
  assert.equal(floor.words, 'Needs the service owner: 1 floor');
  assert.equal(approvalFor({ spaces: 20, floors: 3 }).words, 'Needs two approvals: 3 floors');
  assert.equal(approvalFor({ spaces: 30, floors: 2, whole: true, firmware: true }).words, 'Needs two approvals: a whole office and a firmware push');
  assert.equal(approvalFor({ spaces: 1, firmware: true }).level, 'two');
  assert.equal(approvalFor({ spaces: 1, irreversible: true }).need, 2);
  const rule = approvalFor({ rule: { name: 'PoE rule', cap: 1 } });
  assert.equal(rule.level, 'go');
  assert.match(rule.words, /at most 1 unit a wave/);
  // No retired word ("tier") in any of it.
  for (const a of [floor, rule, approvalFor({ spaces: 9, sites: 2 })]) assert.doesNotMatch(a.words, /\btier\b/i);
});

test('the count line comes first, in words', () => {
  assert.equal(countLine({ spaces: 6, meetings: 2, people: 14, services: 1 }), 'Would affect 6 spaces, 2 meetings in the next 24 hours (14 people) and 1 service');
  assert.equal(countLine({}, { carried: 'Firewall B carries every space' }), 'Would affect nothing: Firewall B carries every space');
  assert.match(countLine({ spaces: 1, services: 1 }, { when: 'during its window, 19:00 to 21:00' }), /no meetings during its window/);
});

test('simulated bookings: the same every build, inside the day, attendees within the seats', () => {
  const a = meetingsOf('dub-3-09', { seats: 8, now: '2026-09-28T12:00' });
  assert.deepEqual(a, meetingsOf('dub-3-09', { seats: 8, now: '2026-09-28T12:00' }));
  for (const [s, d, p] of a) {
    const t = (12 * 60 + s) % 1440;
    assert.ok(t >= 8 * 60 && t + d <= 18 * 60, `inside 08:00 to 18:00: ${t}`);
    assert.ok(p >= 2 && p <= 8);
  }
});

test('the explorer state: per port, and the meetings in the window', () => {
  const ex = { spaces: [{ id: 'x', meet: [[30, 60, 4], [600, 30, 3]], sv: ['network', 'av'] }, { id: 'y', meet: [], sv: ['network'] }], whole: { sp: [0, 1], ap: [] }, ports: [{ p: 1, sp: [0], ap: [] }, { p: 2, sp: [1], ap: [] }], carried: 'x' };
  const win = { hours: 24, start: 0, len: 0 };
  const all = stateOf(ex, null, windowOf(win, 0));
  assert.equal(all.sp.length, 2); assert.equal(all.meetings.length, 2); assert.equal(all.people, 7);
  assert.deepEqual(all.services, ['av', 'network']);
  const p2 = stateOf(ex, new Set([2]), windowOf(win, 0));
  assert.deepEqual(p2.sp, [1]); assert.equal(p2.meetings.length, 0);
  const later = stateOf(ex, null, windowOf(win, 120));
  assert.equal(later.meetings.length, 1);
  assert.equal(clock('2026-09-28T12:00', 1260), '09:00 tomorrow');
  const change = { hours: 24, start: 420, len: 120 };
  assert.match(lineOf(ex, stateOf(ex, null, windowOf(change, 420)), change, windowOf(change, 420), '2026-09-28T12:00'), /during its window, 19:00 to 21:00/);
});
