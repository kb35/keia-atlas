// The service catalogue (src/lib/catalogue.mjs): twelve services, each with an owner, units in scope, a standard,
// targets, a map and a capability switch; health rolled up from the units, per office; and the answer the Services
// index leads with. The pure rules only, on small made-up inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, CATALOGUE_ORDER, NEW_SERVICES, LIVE_SERVICES, unitStatus, faultFor, countStates, rollUp, catalogueAnswer, simulatedFigure, kept, targetWords, SIM_FAULTS } from '../src/lib/catalogue.mjs';
import { CAPABILITIES, capability } from '../src/lib/modules.mjs';
import { ROLES, PEOPLE } from '../src/lib/demo.mjs';

test('twelve services: the three live ones first, then nine more', () => {
  assert.equal(CATALOGUE_ORDER.length, 12);
  assert.deepEqual(CATALOGUE_ORDER.slice(0, 3), LIVE_SERVICES);
  assert.deepEqual(Object.keys(CATALOGUE).sort(), [...NEW_SERVICES].sort());
});

test('each new service has an owner on the team, a standard, targets, a map and a capability under Services', () => {
  for (const id of NEW_SERVICES) {
    const s = CATALOGUE[id];
    const owner = PEOPLE.find((p) => p.id === s.owner);
    assert.ok(owner && ROLES[owner.roleId], `${id}: owner ${s.owner} is on the team`);
    assert.ok(s.standard.id || (s.standard.house && s.standard.rules.length >= 2), `${id}: a standard, or a house one with rules`);
    assert.ok(s.targets.some((t) => t.from === 'units'), `${id}: an availability target measured from its units`);
    assert.ok(s.map.groups.length >= 1 && s.map.after.label, `${id}: a service map`);
    const cap = capability(s.capability);
    assert.ok(cap, `${id}: capability ${s.capability} is registered`);
    assert.equal(cap.module, 'services');
    assert.equal(cap.state, id === 'security' ? 'connected' : 'on', `${id}: default state`);
  }
  assert.equal(capability('security').source, 'the security platform');
  assert.ok(CAPABILITIES.some((c) => c.id === 'events' && c.module === 'services' && c.state === 'on'));
});

test('a unit\'s state: a simulated fault, then an open incident, then a seeded alert; the same every time', () => {
  const u = { tag: 'AG-1', cls: 'printer', site: 'lon' };
  assert.deepEqual(unitStatus(u, { fault: { st: 'offline', why: 'Jam' } }), { st: 'offline', why: 'Jam' });
  assert.equal(unitStatus(u, { incident: true }).st, 'alert');
  assert.deepEqual(unitStatus(u), unitStatus(u), 'seeded');
  assert.ok(['online', 'alert'].includes(unitStatus(u).st), 'a seeded state never takes a unit offline');
  assert.equal(faultFor('print', u)?.st, 'offline', 'London\'s printer is the simulated fault');
  assert.equal(faultFor('print', { ...u, site: 'dub' }), null);
  assert.ok(SIM_FAULTS.print.length >= 1);
});

test('health rolls up from the units: an alert still works, an office below target pulls the service below', () => {
  const units = [
    { site: 'dub', st: 'online' }, { site: 'dub', st: 'alert' }, { site: 'dub', st: 'online' },
    { site: 'lon', st: 'offline' },
    { site: 'nyc', st: 'online' }, { site: 'nyc', st: 'online' },
  ];
  const c = countStates(units);
  assert.deepEqual([c.all, c.online, c.alert, c.offline, c.working], [6, 4, 1, 1, 5]);
  const r = rollUp(units, 95);
  assert.equal(r.within, false);
  assert.deepEqual(r.below, ['lon']);
  assert.deepEqual(r.sites.find((s) => s.site === 'dub'), { site: 'dub', all: 3, online: 2, alert: 1, offline: 0, working: 3, share: 100, within: true });
  assert.equal(rollUp(units.filter((u) => u.site !== 'lon'), 95).within, true);
  assert.equal(rollUp([], 95).within, true, 'nothing in scope is nothing below target');
});

test('targets: simulated figures are seeded, and "kept" follows which way is better', () => {
  const t = { id: 'x', target: 90, unit: '%', better: 'up', centre: 94, spread: 2 };
  assert.equal(simulatedFigure('print', t), simulatedFigure('print', t));
  assert.ok(simulatedFigure('print', t) >= 92 && simulatedFigure('print', t) <= 96);
  assert.equal(kept(t, 90), true);
  assert.equal(kept(t, 89.9), false);
  assert.equal(kept({ target: 10, better: 'down' }, 12), false);
  assert.equal(targetWords(t, 94.4), '94%');
  assert.equal(targetWords({ unit: 'min' }, 7.6), '8 min');
});

test('the index answer: how many services, how many within target, and which is below where', () => {
  const rows = CATALOGUE_ORDER.map((id) => ({ id, name: CATALOGUE[id]?.name ?? id, within: id !== 'print', below: id === 'print' ? ['lon'] : [] }));
  const place = (s) => ({ lon: 'London', dub: 'Dublin' }[s]);
  const a = catalogueAnswer(rows, place);
  assert.equal(a, '12 services: 11 within target, Print below target in London');
  assert.ok(a.length <= 110);
  assert.equal(catalogueAnswer(rows.map((r) => ({ ...r, within: true })), place), '12 services: all within target');
  const two = rows.map((r) => (r.id === 'wifi' ? { ...r, within: false, below: ['lon', 'dub'] } : r));
  assert.equal(catalogueAnswer(two, place), '12 services: 10 within target, Wi-Fi below target in London and Dublin, Print below target in London');
});
