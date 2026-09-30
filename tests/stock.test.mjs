// Tests for spares, cables and the cable standard: the label helpers, and the cross-reference checks
// (break one link at a time in a copy of the real data and check the validator says exactly that).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../tools/validate.mjs';
import { portLabel, endLabel, isLow, shortBy, countOverdue, rackNumber, formatLength } from '../src/lib/cablecore.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function withEdit(file, from, to) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'keia-atlas-stock-'));
  try {
    await cp(path.join(root, 'schemas'), path.join(dir, 'schemas'), { recursive: true });
    await cp(path.join(root, 'data'), path.join(dir, 'data'), { recursive: true });
    await cp(path.join(root, 'docs'), path.join(dir, 'docs'), { recursive: true });
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

test('a label is site, room, rack, unit and port', () => {
  assert.equal(portLabel({ code: 'DUB', room: '3.21', rack: 'dub-3-21-r1', u: 15, port: 7 }), 'DUB-3.21-R1-U15-P07');
  assert.equal(portLabel({ code: 'DUB', room: '3.21', rack: 'dub-3-21-r1', u: 6 }), 'DUB-3.21-R1-U06');
  assert.equal(rackNumber('dub-3-21-r2'), 'R2');
});

test('a port range reads as first port to last', () => {
  const ctx = { code: 'DUB', room: '3.21', rack: 'dub-3-21-r1' };
  assert.equal(endLabel(ctx, { u: 15, ports: '1-40' }), 'DUB-3.21-R1-U15-P01 to P40');
  assert.equal(endLabel(ctx, { u: 15, ports: '49' }), 'DUB-3.21-R1-U15-P49');
  assert.equal(endLabel(ctx, { device: 'Power strip A', ports: '1-12' }), 'Power strip A, outlets 1-12');
});

test('stock is low only below the minimum, and old counts are flagged', () => {
  assert.equal(isLow(1, 2), true);
  assert.equal(isLow(2, 2), false);
  assert.equal(shortBy(0, 3), 3);
  assert.equal(shortBy(5, 3), 0);
  assert.equal(countOverdue('2026-06-05', '2026-09-28'), true);
  assert.equal(countOverdue('2026-09-01', '2026-09-28'), false);
  assert.equal(formatLength(0.5), '0.5 m');
  assert.equal(formatLength(2), '2 m');
});

test('the real spares, cables and standard pass', async () => {
  const r = await validate();
  assert.deepEqual(r.errors, []);
});

test('a cable colour that is not the standard colour for its purpose', async () => {
  const errors = await withEdit('data/cables/lon.yaml', 'colour: red\n    purpose: critical', 'colour: blue\n    purpose: critical');
  assert.deepEqual(errors, ['data/cables/lon.yaml: "Critical and security systems" cables are red in the standard, not blue']);
});

test('a cable type the purpose does not allow', async () => {
  const errors = await withEdit('data/cables/lon.yaml', 'type: fibre-os2', 'type: hdmi');
  assert.ok(errors.some((e) => e.includes('a hdmi cable cannot be "Singlemode fibre"')), errors.join('\n'));
});

test('a patch cable end that lands on a blank unit', async () => {
  const errors = await withEdit('data/cables/lon.yaml', 'from: { u: 18, ports: "1" }', 'from: { u: 25, ports: "1" }');
  assert.ok(errors.some((e) => e.includes('nothing is mounted at U25')), errors.join('\n'));
});

test('a port range that does not match the quantity', async () => {
  const errors = await withEdit('data/cables/lon.yaml', 'ports: 1-36', 'ports: 1-30');
  assert.ok(errors.some((e) => e.includes('port range 1-30 is 30 ports but the quantity is 36')), errors.join('\n'));
});

test('an IT store in a room at another office', async () => {
  const errors = await withEdit('data/spares/lon.yaml', 'store: lon-2-11', 'store: dub-3-19');
  assert.ok(errors.some((e) => e.includes('room "dub-3-19" is at site "dub", not "lon"')), errors.join('\n'));
});

test('a minimum naming a device model that does not exist', async () => {
  const errors = await withEdit('data/spares/lon.yaml', 'model: poly-studio-x32', 'model: poly-studio-x33');
  assert.deepEqual(errors, ['data/spares/lon.yaml: device model "poly-studio-x33" does not exist']);
});

test('a stock id used twice', async () => {
  const errors = await withEdit('data/spares/lon.yaml', 'id: lon-sp-02', 'id: lon-sp-01');
  assert.ok(errors.some((e) => e.includes('id "lon-sp-01" is already used')), errors.join('\n'));
});

test('counted stock on a shelf the store does not have', async () => {
  const errors = await withEdit('data/spares/lon.yaml', 'where: { cabinet: Cabinet A, shelf: Shelf 1 }', 'where: { cabinet: Cabinet A, shelf: Shelf 9 }');
  assert.ok(errors.some((e) => e.includes('"Shelf 9" is not a shelf of Cabinet A')), errors.join('\n'));
});

test('a spare unit in a cabinet the store does not have', async () => {
  const errors = await withEdit('data/installs/lon/lon-2-11.yaml', 'cabinet: Cabinet A, shelf: Shelf 2 }', 'cabinet: Cabinet Z, shelf: Shelf 2 }');
  assert.ok(errors.some((e) => e.includes('"Cabinet Z" is not a cabinet of it-store / compact')), errors.join('\n'));
});

test('a spare unit with a serial already in use', async () => {
  const errors = await withEdit('data/installs/lon/lon-2-11.yaml', 'serial: DEMO-LON-003174', 'serial: DEMO-LON-003173');
  assert.ok(errors.some((e) => e.includes('serial DEMO-LON-003173 is already used')), errors.join('\n'));
});

test('every office has an IT store whose spare units are units with the status Spare, and a model can be below its minimum', async () => {
  const { parse } = await import('yaml');
  const read = async (f) => parse(await readFile(path.join(root, f), 'utf8'));
  const sites = ['chi', 'cph', 'dub', 'jnu', 'lon', 'mel', 'nyc', 'sin', 'tor', 'tyo'];
  let below = 0, units = 0;
  for (const sid of sites) {
    const file = await read(`data/spares/${sid}.yaml`);
    const inst = await read(`data/installs/${sid}/${file.store}.yaml`);
    assert.ok(inst.spare_units.length > 0, `${sid}: the store holds spare units`);
    assert.ok(inst.spare_units.every((u) => u.stage === 'spare' && /^AG-\d{6}$/.test(u.asset_tag) && /^DEMO-/.test(u.serial)), `${sid}: each spare unit has a serial, a tag and the status spare`);
    units += inst.spare_units.length;
    for (const m of file.minimums) if (inst.spare_units.filter((u) => u.model === m.model).length < m.minimum) below++;
  }
  assert.ok(below > 0, 'some model is below its minimum, so the flag has something to show');
  const dub = await read('data/spares/dub.yaml');
  const dubUnits = (await read('data/installs/dub/dub-3-19.yaml')).spare_units;
  assert.equal(dub.minimums.find((m) => m.model === 'poly-tc10').minimum, 2);
  assert.equal(dubUnits.filter((u) => u.model === 'poly-tc10').length, 1);
  assert.ok(units > 100);
});
