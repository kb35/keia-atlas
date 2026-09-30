// Switch ports: the far-end trace from the recorded patching, the VLAN plan check and drift, the groups, and the
// validator's check that the recorded cable traces are the ones the patching gives (src/lib/switchcore.mjs,
// tools/crossrefs-switchports.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { building, loadRaw } from '../src/lib/floors.mjs';
import { farEnds, switchesOf, hostnameFor, connectedOf, checkPort, checkPlan, driftOf, portOf, vlanPlan, classVlans, readHouse, readSwitchPorts, groupsOf, rangeList, rangeText } from '../src/lib/switchcore.mjs';
import { recheck } from '../src/lib/vlan-client.mjs';
import { validate } from '../tools/validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = building('dub', root);
const F = farEnds(M);
const idOf = new Map(switchesOf(M).map((s) => [s.key, hostnameFor(M, s)]));
const keyOf = (id) => [...idOf].find(([, v]) => v === id)[0];
const plan = vlanPlan(loadRaw(root).standards.network);
const byClass = classVlans(readHouse(root));
const ctx = { plan, byClass, className: (c) => ({ display: 'Display', 'video-bar': 'Video bar', 'scheduler-panel': 'Scheduler panel' })[c] ?? c };

test('the far end of a switch port: patch cord, panel port, permanent link, outlet, unit and its port', () => {
  const f = F.get(keyOf('dub-321-as02')).get(25);
  assert.equal(f.kind, 'outlet');
  assert.equal(f.outlet, 'dub-3-09:data/behind-display#5');
  assert.equal(f.run, 'DUB-3.21-R1-U09-P25');
  assert.equal(f.patch, 'dub-cb-02');
  assert.deepEqual(f.panel, { rack: 'dub-3-21-r1', u: 9, port: 25 });
  assert.equal(f.unit.tag, 'AG-000335');
  assert.equal(f.unit.cls, 'video-bar');
  assert.equal(f.unit.port, 'lan-1');
  assert.deepEqual(connectedOf(f, idOf), { cables: ['dub-cb-02', 'DUB-3.21-R1-U09-P25'], device: 'AG-000335', interface: 'lan-1' });
  // An outlet with nothing plugged in: the cables, no device.
  const empty = F.get(keyOf('dub-321-as02')).get(23);
  assert.equal(empty.unit, null);
  assert.deepEqual(connectedOf(empty, idOf), { cables: ['dub-cb-02', 'DUB-3.21-R1-U09-P23'] });
});

test('an in-room switch: a device on its own cable, and its uplink to the comms room port', () => {
  const inRoom = F.get(keyOf('dub-309-sw01'));
  assert.equal(inRoom.get('lan-1').unit.tag, 'AG-000335');
  assert.equal(inRoom.get('lan-1').unit.port, 'lan-2', "the video bar's second port");
  const up = inRoom.get('lan-9');
  assert.equal(up.kind, 'uplink');
  assert.equal(idOf.get(up.key), 'dub-321-as02');
  assert.equal(up.port, 22);
  // The comms room port sees the in-room switch as what serves the outlet, with the devices behind it.
  const f = F.get(keyOf('dub-321-as02')).get(22);
  assert.equal(f.unit.cls, 'network-switch');
  assert.ok(f.units.some((u) => u.cls === 'av-switcher' && u.via.length), 'the AV switcher is behind it');
});

test('switch to switch: a core port reaches a fourth-floor access switch over the riser fibre', () => {
  const f = F.get(keyOf('dub-321-cs01')).get(5);
  assert.equal(f.kind, 'switch');
  assert.equal(idOf.get(f.key), 'dub-421-as01');
  assert.equal(f.port, 49);
  assert.deepEqual(f.cables, ['dub-cb-16', 'DUB-3.21-R1-U12-P01', 'dub-cb-28']);
  // Two links in one patch cord line (the core interconnect) reach two different ports.
  assert.equal(F.get(keyOf('dub-321-cs01')).get(25).port, 25);
  assert.equal(F.get(keyOf('dub-321-cs01')).get(26).port, 26);
});

test('the VLAN plan check: the device on the port, VLAN 1, trunks and the AV VLAN', () => {
  const display = { unit: { cls: 'display' } };
  assert.equal(checkPlan({ state: 'active', mode: 'access', native: 31, tagged: [] }, display, ctx).ok, true);
  const off = checkPlan({ state: 'active', mode: 'access', native: 20, tagged: [] }, display, ctx);
  assert.equal(off.ok, false);
  assert.equal(off.why, 'On VLAN 20 Corporate; the plan puts a display on VLAN 31 Displays and signage.');
  assert.equal(off.want, 31);
  assert.equal(checkPlan({ state: 'active', mode: 'access', native: 1, tagged: [] }, display, ctx).rule, 'no-vlan-1');
  assert.equal(checkPlan({ state: 'active', mode: 'trunk', native: 31, tagged: [30] }, display, ctx).ok, false, 'a trunk to one device');
  assert.equal(checkPlan({ state: 'active', mode: 'access', native: 40, tagged: [] }, { kind: 'unit', unit: { cls: 'video-bar' } }, { ...ctx, inRoom: true }).ok, true, 'AV in the room');
  const uplink = checkPlan({ state: 'active', mode: 'trunk', native: 10, tagged: [30, 40] }, { kind: 'uplink' }, { ...ctx, inRoom: true });
  assert.equal(uplink.rule, 'av-not-routed');
  assert.equal(checkPlan({ state: 'active', mode: 'access', native: 30, tagged: [] }, { unit: { cls: 'av-switcher' } }, ctx).ok, null, 'the plan names no VLAN for it');
  assert.equal(checkPlan({ state: 'parked', mode: null, native: null, tagged: [] }, { unit: null }, ctx).ok, true);
});

test('planned against seen: a difference is drift, in words, and the check says so first', () => {
  const rec = { name: 24, enabled: true, mode: 'access', untagged_vlan: 31, seen: { untagged_vlan: 20, at: '2026-09-30T06:00:00Z' } };
  const p = portOf(rec, true);
  assert.equal(p.native, 31);
  assert.equal(p.seen.native, 20);
  assert.equal(driftOf(p, plan).why, 'Planned VLAN 31 Displays and signage, seen VLAN 20 Corporate on the switch.');
  const c = checkPort(p, { unit: { cls: 'display' } }, ctx);
  assert.equal(c.ok, false);
  assert.equal(c.drift, true);
  assert.equal(c.planOk, true, 'the record itself follows the plan');
  const tagged = portOf({ name: 'lan-9', enabled: true, mode: 'tagged', untagged_vlan: 10, tagged_vlans: [30], seen: { tagged_vlans: [30, 40], at: '2026-09-30T06:00:00Z' } }, true);
  assert.equal(driftOf(tagged, plan).rule, 'av-not-routed');
  assert.equal(driftOf(portOf({ name: 1, enabled: true, mode: 'access', untagged_vlan: 30 }, true), plan), null);
  assert.equal(portOf({ name: 3, enabled: false }, true).state, 'parked');
  assert.equal(portOf(undefined, false).state, 'disabled');
});

test('the demo data: every recorded port follows the plan except the four drift findings', () => {
  const files = readSwitchPorts(root);
  const found = [];
  for (const [site, D] of Object.entries(files)) {
    const Ms = building(site, root); const Fs = farEnds(Ms);
    for (const S of D.switches) {
      const sw = switchesOf(Ms).find((x) => (S.rack ? x.rack === S.rack && x.u === S.u : x.space === S.space && x.position === S.position));
      for (const rec of S.interfaces) {
        const c = checkPort(portOf(rec, true), Fs.get(sw.key).get(rec.name), { ...ctx, inRoom: sw.where === 'room' });
        if (c.ok === false) found.push(`${S.id} ${rec.name}: ${c.why}`);
      }
    }
  }
  assert.deepEqual(found.sort(), [
    'dub-321-as02 24: Planned VLAN 31 Displays and signage, seen VLAN 20 Corporate on the switch.',
    'dub-421-as01 22: Planned VLAN 30 Room systems, seen VLAN 1 (the switch default) on the switch.',
    'nyc-2004-sw01 lan-9: Planned tagged 30, seen tagged 30 and 40: VLAN 40 AV leaves the room.',
    'nyc-2014-as02 37: Planned VLAN 70 Printers, seen VLAN 20 Corporate on the switch.',
  ]);
  // VLANs 50 (Building) and 60 (Security) have members.
  const natives = Object.values(files).flatMap((D) => D.switches.flatMap((S) => S.interfaces.filter((i) => i.enabled).map((i) => i.untagged_vlan)));
  assert.ok(natives.includes(50) && natives.includes(60));
});

test('groups: the core pair is one virtual chassis and the firewalls an HA pair, each member a rack item', () => {
  const G = groupsOf(M, readSwitchPorts(root).dub);
  const core = G.find((g) => g.kind === 'virtual-chassis');
  assert.deepEqual(core.members.map((m) => m.ref), ['dub-321-cs01', 'dub-321-cs02']);
  assert.ok(core.members.every((m) => m.rack === 'dub-3-21-r1' && m.u));
  const fw = G.find((g) => g.kind === 'ha-pair');
  assert.deepEqual(fw.members.map((m) => m.u).sort(), [22, 23]);
});

test('port ranges, and the plan check again after a change in the browser', () => {
  assert.deepEqual(rangeList('9-12,25'), [9, 10, 11, 12, 25]);
  assert.equal(rangeText([48, 45, 46, 47, 1]), '1,45-48');
  const P = [{ v: 20, name: 'Corporate' }, { v: 31, name: 'Displays and signage' }, { v: 40, name: 'AV' }];
  assert.equal(recheck({ plan: 31, what: 'display', mode: 'access' }, 31, P).ok, true);
  assert.equal(recheck({ plan: 31, what: 'display', mode: 'access' }, 20, P).why, 'On VLAN 20 Corporate; the plan puts a display on VLAN 31 Displays and signage.');
  assert.equal(recheck({ plan: 30, mode: 'access', inRoom: true }, 40, P).ok, true);
  assert.equal(recheck({ plan: 30, mode: 'access' }, 1, P).ok, false);
});

// The validator on a copy of the repo with one edit.
async function withEdit(file, from, to) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'keia-atlas-sp-'));
  try {
    for (const d of ['schemas', 'data', 'docs']) await cp(path.join(root, d), path.join(dir, d), { recursive: true });
    await mkdir(path.join(dir, 'vendor'));
    await symlink(path.join(root, 'vendor', 'keia'), path.join(dir, 'vendor', 'keia'));
    const target = path.join(dir, file);
    const text = await readFile(target, 'utf8');
    assert.ok(text.includes(from), `test setup: "${from}" not found in ${file}`);
    await writeFile(target, text.replace(from, to));
    return (await validate(dir)).errors.map((e) => `${e.file}: ${e.message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('the validator: a recorded cable trace that is not the patching, and an address outside its VLAN', async () => {
  const errors = await withEdit('data/switch-ports/dub.yaml', 'device: AG-000335, interface: lan-1 }', 'device: AG-000336, interface: lan-1 }');
  assert.ok(errors.some((e) => e.startsWith('data/switch-ports/dub.yaml: the cable trace is') && e.includes('"device":"AG-000335"') && e.includes('"device":"AG-000336"')), errors.join('\n'));
  const addr = await withEdit('data/switch-ports/dub.yaml', 'address: 10.20.10.20/24', 'address: 10.99.10.20/24');
  assert.ok(addr.some((e) => e.includes("10.99.10.20/24 is not in any routed VLAN's prefix")), addr.join('\n'));
});
