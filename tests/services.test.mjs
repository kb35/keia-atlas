// Services (src/lib/services.mjs): which kit belongs to which service, the light, the comms room checks, and the live
// figures on a small made-up model. The pure rules only; the pages are checked by the build and the audits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceOfClass, serviceOfGear, serviceOfSystem, servicesOfProject, lightOf, commsChecks, prepareServiceModel, tally, officesOnline, SERVICES, SERVICE_ORDER, SIM_KIND, searchItems } from '../src/lib/services.mjs';
import { snapshot, unitAt } from '../src/lib/livesim.mjs';

test('kit belongs to one service; the switch depends on where it is', () => {
  assert.equal(serviceOfClass('video-bar', 'meeting'), 'av');
  assert.equal(serviceOfClass('network-switch', 'meeting'), 'av', 'the Netgear AV Line switch in a room');
  assert.equal(serviceOfClass('network-switch', 'comms'), 'network');
  assert.equal(serviceOfClass('network-gateway', 'comms'), 'network');
  assert.equal(serviceOfClass('printer', 'meeting'), null);
  assert.equal(serviceOfGear('ups'), 'infrastructure');
  assert.equal(serviceOfGear('oob'), 'infrastructure');
  assert.equal(serviceOfGear('access-switch'), 'network');
  assert.equal(serviceOfGear('isp'), 'network');
  assert.equal(serviceOfSystem('Poly Lens'), 'av');
  assert.equal(serviceOfSystem('UniFi Network'), 'network');
  assert.deepEqual(servicesOfProject('infra-refresh'), ['network', 'infrastructure']);
  assert.deepEqual(servicesOfProject('made-up'), []);
});

test('every service has an owner, a path and the systems it reads', () => {
  assert.deepEqual(SERVICE_ORDER, ['av', 'network', 'infrastructure']);
  assert.equal(SERVICES.av.owner, 'sofia');
  assert.equal(SERVICES.network.owner, 'declan');
  assert.equal(SERVICES.infrastructure.owner, 'declan');
  for (const id of SERVICE_ORDER) {
    assert.equal(SERVICES[id].path, `/services/${id}/`);
    for (const s of SERVICES[id].systems) assert.equal(serviceOfSystem(s), id, `${s} belongs to ${id}`);
  }
});

test('the light: green when all is well, amber for a fault, red for several offline', () => {
  assert.equal(lightOf({ all: 0, online: 0, alert: 0, offline: 0 }), 'none');
  assert.equal(lightOf({ all: 100, online: 100, alert: 0, offline: 0 }), 'good');
  assert.equal(lightOf({ all: 100, online: 98, alert: 1, offline: 1 }), 'warn');
  assert.equal(lightOf({ all: 100, online: 96, alert: 0, offline: 3 }), 'bad');
  assert.equal(lightOf({ all: 400, online: 394, alert: 3, offline: 3 }), 'warn', 'three of four hundred is a few');
  assert.equal(lightOf({ all: 10, online: 9, alert: 1, offline: 0 }), 'bad', 'one in ten is a lot');
});

test('comms room checks: the standard, and the space left', () => {
  const gear = { 'u-sw': { standard: 'unifi' }, 'c-sw': {} };
  const good = { height_u: 24, side_pdus: [{ feed: 'A' }, { feed: 'B' }], items: [
    { kind: 'ups', size: 2 }, { kind: 'oob', size: 1 }, { kind: 'fibre-panel', size: 1 }, { kind: 'switch', gear: 'u-sw', size: 1 }, { kind: 'reserved', size: 8 }, { kind: 'blank', size: 1 },
  ] };
  const c = commsChecks(good, gear);
  assert.equal(c.toStandard, true);
  assert.equal(c.free, 19, 'reserved and blank space count as free');
  assert.equal(c.short, false);
  const old = commsChecks({ ...good, items: good.items.map((i) => (i.kind === 'switch' ? { ...i, gear: 'c-sw' } : i)) }, gear);
  assert.equal(old.toStandard, false);
  assert.deepEqual(old.failed.map((f) => f.id), ['switches']);
  const tight = commsChecks({ height_u: 12, side_pdus: [{ feed: 'A' }], items: [{ kind: 'ups', size: 4 }, { kind: 'switch', gear: 'c-sw', size: 4 }] }, gear);
  assert.equal(tight.short, true, '4U free is short');
  assert.deepEqual(tight.failed.map((f) => f.id), ['feeds', 'oob', 'fibre', 'switches']);
});

const model = () => ({
  sites: [{ id: 'aaa', tz: 'Europe/Dublin', region: 'emea' }, { id: 'bbb', tz: 'America/New_York', region: 'amer' }, { id: 'rem', tz: 'Europe/Dublin', region: 'emea', remote: true }],
  units: [
    { id: 'G1', n: 'Gateway A', cls: 'network-gateway', k: 'gateway', site: 0, old: 0, inc: -1 },
    { id: 'C1', n: 'Circuit A', cls: 'circuit', k: 'circuit', site: 0, old: 0, inc: -1 },
    { id: 'G2', n: 'Gateway B', cls: 'network-gateway', k: 'gateway', site: 1, old: 0, inc: -1 },
    { id: 'U1', n: 'UPS', cls: 'ups', k: 'ups', site: 1, old: 0, inc: 0 },
    { id: 'P1', n: 'Printer', cls: 'printer', k: 'printer', site: 1, old: 0, inc: -1, x: 1 },
  ],
  rooms: [], incs: [{ no: 'INC1', state: 'New', title: 'UPS beeping', pri: 3, room: 'r', tag: 'U1' }],
});

test('the service model runs on the shared simulation, with its own figures for kit it does not track', () => {
  const m = prepareServiceModel(model());
  const ups = m.units.find((u) => u.cls === 'ups');
  assert.deepEqual(ups.alerts, SIM_KIND.ups[2]);
  assert.equal(ups.pAlert, SIM_KIND.ups[1]);
  assert.equal(prepareServiceModel(m), m, 'safe to call twice');
  const t = Date.UTC(2026, 8, 30, 11, 0);
  const a = snapshot(m, t), b = snapshot(prepareServiceModel(model()), t);
  assert.deepEqual(a.units, b.units, 'the same in every window');
  assert.equal(unitAt(ups, t).inc, 0);
  assert.notEqual(a.units[3].st, 'online', 'an open incident keeps its unit on alert');
});

test('tally leaves out kit kept only so indexes line up', () => {
  const m = prepareServiceModel(model());
  const n = tally(m, snapshot(m, Date.UTC(2026, 8, 30, 11, 0)));
  assert.equal(n.all, 4);
  assert.equal(n.online + n.alert + n.offline, 4);
});

test('an office is online unless a gateway is offline or every circuit is', () => {
  const m = prepareServiceModel(model());
  const snap = (states) => ({ units: states.map((st) => ({ st })) });
  const on = ['online', 'online', 'online', 'online', 'online'];
  assert.deepEqual(officesOnline(m, snap(on), m.sites), { up: 2, total: 2 }, 'home offices are not counted');
  assert.equal(officesOnline(m, snap(['offline', 'online', 'online', 'online', 'online']), m.sites).up, 1, 'gateway offline');
  assert.equal(officesOnline(m, snap(['online', 'offline', 'online', 'online', 'online']), m.sites).up, 1, 'its only circuit is offline');
  assert.equal(officesOnline(m, snap(['online', 'alert', 'online', 'online', 'online']), m.sites).up, 2, 'an alert is still up');
});

test('search entries for the three services and the overview', () => {
  const items = searchItems();
  assert.equal(items.length, 4);
  assert.ok(items.every(([kind, url]) => kind === 'svc' && url.startsWith('services/')));
});
