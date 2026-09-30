// Floor plans for every office (src/lib/floors.mjs): rooms placed, every outlet and access point cabled once, trays
// joined, lengths within the limits, access points as units, and every networked device traced hop by hop to the
// internet. Then the cross-reference checks (tools/crossrefs-floors.mjs) are shown to catch a broken copy of the data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { building, trace, healthHooks, wifiAreas, sitesWithFloors, loadRaw, FICTION, overlapArea, OPEN_AREA } from '../src/lib/floors.mjs';
import { validate } from '../tools/validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = loadRaw(root);
const OFFICES = Object.keys(raw.sites).filter((s) => raw.sites[s].kind === 'office' && Object.values(raw.spaces).some((x) => x.site === s)).sort();
const M = building('dub', root);
const ALL = Object.fromEntries(OFFICES.map((s) => [s, building(s, root)]));

test('every office with rooms has a floor plan for each of its floors', () => {
  assert.deepEqual([...sitesWithFloors(root)].sort(), OFFICES);
  assert.equal(OFFICES.length, 10);
  for (const s of OFFICES) assert.deepEqual(ALL[s].floors.map((f) => f.id).sort(), raw.sites[s].floors.map((f) => f.id).sort(), s);
});

test('every room in every office is placed on its floor, without overlaps, and marked fictional', () => {
  assert.equal(Object.values(M.rooms).length, 35);
  for (const [s, B] of Object.entries(ALL)) {
    const rooms = Object.values(B.rooms);
    assert.deepEqual(rooms.filter((r) => !r.rect).map((r) => r.id), [], s);
    for (const f of B.floors) assert.equal(f.fictional, FICTION);
    for (const a of rooms) for (const b of rooms) if (a.id < b.id && a.floor === b.floor) assert.ok(overlapArea(a.rect, b.rect) < 0.01, `${a.id} overlaps ${b.id}`);
    assert.ok(rooms.some((r) => r.variations.length), `${s}: some rooms differ from their profile`);
    assert.ok(!rooms.some((r) => r.space_type === OPEN_AREA), `${s}: the open areas are not a room`);
  }
});

test('every data outlet and access point has exactly one run, and no panel port is used twice', () => {
  for (const [s, B] of Object.entries(ALL)) {
    const outlets = Object.values(B.rooms).flatMap((r) => r.outlets.map((o) => o.key));
    const runs = B.runs.filter((r) => r.kind === 'horizontal');
    assert.equal(runs.length, outlets.length + B.aps.length, s);
    assert.equal(new Set(runs.map((r) => r.outletKey)).size, runs.length, s);
    const ports = runs.map((r) => `${r.from.rack}:${r.from.u}:${r.from.port}`);
    assert.equal(new Set(ports).size, ports.length, s);
    assert.ok(B.circuits.length >= 1, s);
    // A spare run is only ever an outlet with nothing plugged in.
    for (const r of runs.filter((x) => x.spare)) assert.ok(!r.to.access_point && !B.rooms[r.to.space].outlets.find((o) => o.id === r.to.outlet).dev, r.id);
  }
  assert.equal(M.aps.length, 16);
  assert.equal(M.circuits.length, 2);
  assert.equal(ALL.nyc.circuits.length, 2);
  assert.equal(ALL.cph.circuits.length, 1);
});

test('runs follow the trays, stay within 90 m, and have a 3D path; no tray is over its capacity', () => {
  for (const B of Object.values(ALL)) {
    for (const r of B.runs) {
      assert.ok(r.path && r.path.length >= 2, `${r.id} has no path`);
      if (r.type === 'cat6a') assert.ok(r.length_m <= 90, `${r.id} is ${r.length_m} m`);
      if (r.kind === 'horizontal') assert.ok(r.length_m >= r.modelled, `${r.id} is shorter than its route`);
    }
    for (const f of B.floors) for (const t of f.trays) if (t.capacity != null) assert.ok(t.runs <= t.capacity, `${t.id} over capacity`);
  }
});

test('there are enough access points for the Wi-Fi standard, and each is a unit in its floor\'s open-area install', () => {
  for (const [s, B] of Object.entries(ALL)) {
    for (const f of B.floors) {
      const w = wifiAreas(B, f.id), aps = B.aps.filter((a) => a.floor === f.id);
      assert.ok(aps.length >= w.need.open + w.need.gathering, `${s} floor ${f.id}`);
      const open = `${s}-${f.id}-open`;
      assert.equal(raw.spaces[open]?.space_type, OPEN_AREA, open);
      assert.equal(raw.installs[open].positions.length, aps.length, open);
    }
    for (const a of B.aps) assert.ok(a.serial && a.asset_tag && ['unifi-u7-pro', 'unifi-u7-pro-max'].includes(a.model), `${a.id}`);
  }
  // Dublin's access points kept their serials when they moved.
  assert.deepEqual(M.aps.map((a) => a.serial), Array.from({ length: 16 }, (_, i) => `DEMO-DUB-${String(3101 + i).padStart(6, '0')}`));
});

test('a meeting room display traces hop by hop to the internet', () => {
  const T = trace(M, 'dub-309-dsp01');
  assert.ok(T.complete);
  const kinds = T.hops.map((h) => h.kind).filter((k) => k !== 'patch');
  assert.deepEqual(kinds, ['device', 'outlet', 'run', 'patch-panel', 'switch', 'switch', 'firewall', 'isp', 'fibre-panel', 'lead-in', 'entry', 'circuit', 'internet']);
  // The fourth floor goes up the riser fibre to the MDF; so does New York's twenty-second.
  const up = trace(M, 'dub-4-01/video-bar');
  assert.ok(up.complete && up.hops.some((h) => h.kind === 'riser'));
  const ny = Object.values(ALL.nyc.rooms).find((r) => r.floor === '22' && r.positions?.some((p) => p.hostname));
  const T2 = trace(ALL.nyc, `${ny.id}/${ny.positions.find((p) => p.hostname).position}`);
  assert.ok(T2.complete && T2.hops.some((h) => h.kind === 'riser'), JSON.stringify(T2.reason));
});

test('every networked device, access point and live outlet in every office reaches the internet', () => {
  for (const [s, B] of Object.entries(ALL)) {
    const stuck = [];
    const spare = new Set(B.runs.filter((r) => r.spare).map((r) => r.outletKey));
    for (const r of Object.values(B.rooms)) {
      for (const o of r.outlets) if (!spare.has(o.key) && !trace(B, o.key)?.complete) stuck.push(o.key);
      for (const p of r.positions ?? []) {
        const T = trace(B, `${r.id}/${p.position}`);
        if (T && !T.complete && T.reason !== 'No network cable from this device in the room wiring') stuck.push(`${r.id}/${p.position}: ${T.reason}`);
      }
    }
    for (const a of B.aps) if (!trace(B, a.hostname)?.complete) stuck.push(a.id);
    assert.deepEqual(stuck, [], s);
    const H = healthHooks(B);
    assert.ok(H.units.includes(B.aps[0].asset_tag) && H.circuits.length === B.circuits.length && H.runs.length === B.runs.length, s);
  }
});

// ---------- The checks catch broken data ----------
async function withEdit(file, from, to) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'keia-atlas-floors-'));
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

test('a room moved onto another is caught', async () => {
  const errors = await withEdit('data/spaces/dub/dub-3-08.yaml', 'x_m: 54.6', 'x_m: 52.6');
  assert.ok(errors.some((e) => e.includes('dub-3-08.yaml') && e.includes('overlaps')), errors.join('\n'));
});

test('a panel port used twice, and the outlet it left, are caught', async () => {
  const errors = await withEdit('data/runs/dub.yaml', 'u: 9\n      port: 1\n', 'u: 9\n      port: 2\n');
  assert.ok(errors.some((e) => e.includes('is already used by')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('is patched') && e.includes('has no run')), errors.join('\n'));
});

test('a run longer than the permanent link limit is caught', async () => {
  const errors = await withEdit('data/runs/dub.yaml', 'length_m: 61\n', 'length_m: 92\n');
  assert.ok(errors.some((e) => e.includes('longer than the 90 m permanent link limit')), errors.join('\n'));
});

test('a spare run that loses its mark is a dead outlet', async () => {
  const errors = await withEdit('data/runs/jnu.yaml', '    spare: true\n', '');
  assert.ok(errors.some((e) => e.includes('jnu.yaml') && e.includes('has no patch cord to a switch')), errors.join('\n'));
});

test('an access point unit that is not on the floor plan is caught', async () => {
  const errors = await withEdit('data/floors/cph-4.yaml', 'position: access-point#1\n', 'position: access-point#9\n');
  assert.ok(errors.some((e) => e.includes('cph-4.yaml') && e.includes('has no access point at position')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('is not placed on the floor plan')), errors.join('\n'));
});
