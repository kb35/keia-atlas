// The connector kit v0 (docs/connectors/): the canonical schemas, the adapter interface, the two reference
// adapters (spreadsheet and NetBox export), the runner's rules (dry run first, idempotent, ownership per field,
// nothing deleted, no secrets) and the connect command. Everything runs offline on the fixtures in
// tests/fixtures/connectors/, writing only to temporary folders. Run with:  npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, cpSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { validateRecord, checkManifest, defineAdapter, redact, slug, toCloudEvent, plannedMcpTools } from '../tools/connectors/adapter.mjs';
import { planImport, applyPlan, formatPlan } from '../tools/connectors/run.mjs';
import { ADAPTERS } from '../tools/connectors/adapters/index.mjs';
import { parseCsv } from '../tools/connectors/adapters/csv.mjs';
import { validate } from '../tools/validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests/fixtures/connectors');
const CSV = path.join(FIX, 'devices.csv');
const NETBOX = path.join(FIX, 'netbox-export.json');
const CATALOGUE = path.join(ROOT, 'data');
const T0 = '2026-09-30T08:00:00.000Z';
const T1 = '2026-10-01T08:00:00.000Z';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'keia-connect-'));
const run = (adapter, file, dataDir, extra = {}) =>
  planImport({ adapter: ADAPTERS[adapter], file, dataDir, catalogueDir: CATALOGUE, syncedAt: T0, ...extra });
const rec = (plan, id) => plan.changes.find((c) => c.id === id)?.after;
const readRec = (dataDir, system, folder, id) => parse(readFileSync(path.join(dataDir, 'connected', system, folder, `${id}.yaml`), 'utf8'));
const yamlFix = (name) => parse(readFileSync(path.join(FIX, 'examples', name), 'utf8'));

// ---- The canonical model ----

test('the example ticket and event match the canonical schemas', () => {
  assert.deepEqual(validateRecord(yamlFix('ticket.yaml')), []);
  assert.deepEqual(validateRecord(yamlFix('event.yaml')), []);
});

test('an event maps onto a CloudEvents 1.0 envelope', () => {
  const ce = toCloudEvent(yamlFix('event.yaml'));
  for (const k of ['specversion', 'id', 'source', 'type']) assert.ok(ce[k], `CloudEvents requires ${k}`);
  assert.equal(ce.specversion, '1.0');
  assert.equal(ce.source, 'netbox://netbox.example.com');
  assert.equal(ce.subject, 'netbox-device-43');
});

test('the schemas refuse a record with no source mark, an unknown status or a link carrying a token', () => {
  const t = yamlFix('ticket.yaml');
  const { source, ...noSource } = t;
  assert.ok(source);
  assert.match(validateRecord(noSource).join('\n'), /missing required field "source"/);
  assert.match(validateRecord({ ...t, status: 'awaiting-vendor' }).join('\n'), /status: must be one of/);
  assert.ok(validateRecord({ ...t, source: { ...t.source, url: 'https://servicedesk.example.com/x?access_token=abc' } }).length);
  assert.ok(validateRecord({ ...t, source: { ...t.source, url: 'https://admin:pw@servicedesk.example.com/x' } }).length);
  assert.match(validateRecord({ ...t, assignee: 'A Person' }).join('\n'), /unknown field "assignee"/);
  assert.deepEqual(validateRecord({ kind: 'thing' }), ['kind must be one of space, contact, unit, network, port, address, connection, circuit, group, ticket, event']);
});

// ---- The adapter interface ----

test('every adapter has a valid manifest: read only, every field owned, no hosts, no credentials', () => {
  for (const a of Object.values(ADAPTERS)) {
    assert.deepEqual(checkManifest(a.manifest), [], a.manifest.id);
    for (const [kind, o] of Object.entries(a.manifest.objects)) {
      assert.deepEqual(o.actions, ['read'], `${a.manifest.id} ${kind}`);
      for (const owner of Object.values(o.fields)) assert.ok(['source', 'keia'].includes(owner));
    }
    assert.deepEqual(a.manifest.hosts, []);
    assert.deepEqual(a.manifest.credentials, []);
    for (const fn of ['open', 'list', 'get', 'map']) assert.equal(typeof a[fn], 'function', `${a.manifest.id}.${fn}`);
  }
});

test('a manifest with a write action, a literal credential or a runner field is refused', () => {
  const m = structuredClone(ADAPTERS.csv.manifest);
  m.objects.unit.actions = ['read', 'update'];
  m.credentials = [{ name: 'api', vault: 'hunter2', scope: 'read' }];
  m.objects.space.fields.source = 'source';
  const errs = checkManifest(m).join('\n');
  assert.match(errs, /actions\.1: must be one of "read"/);
  assert.match(errs, /credentials\.0\.vault/);
  assert.match(errs, /fields\.source: set by the runner/);
  assert.throws(() => defineAdapter({ manifest: ADAPTERS.csv.manifest, list() {}, get() {} }), /map\(\) is missing/);
});

test('the runner refuses an adapter that declares anything but read, even if it skipped defineAdapter', async () => {
  const sneaky = { ...ADAPTERS.csv, manifest: structuredClone(ADAPTERS.csv.manifest) };
  sneaky.manifest.objects.unit.actions = ['read', 'reboot'];
  const plan = await planImport({ adapter: sneaky, file: CSV, dataDir: tmp(), catalogueDir: CATALOGUE, syncedAt: T0 });
  assert.match(plan.problems.join('\n'), /read only in v0/);
  assert.throws(() => applyPlan(plan), /nothing written/);
});

test('an adapter may fill only the fields its manifest declares', async () => {
  const loose = { ...ADAPTERS.csv, map: (kind, n, ctx) => ({ ...ADAPTERS.csv.map(kind, n, ctx), password: 'x' }) };
  const plan = await planImport({ adapter: loose, file: CSV, dataDir: tmp(), catalogueDir: CATALOGUE, syncedAt: T0 });
  assert.match(plan.problems.join('\n'), /filled "password", which its manifest does not declare/);
});

test('the planned MCP tools are small, typed and read only', () => {
  assert.deepEqual(plannedMcpTools(ADAPTERS.csv.manifest).map((t) => `${t.name}:${t.tier}`), [
    'csv.space.list:read', 'csv.space.get:read', 'csv.unit.list:read', 'csv.unit.get:read',
  ]);
  const netbox = plannedMcpTools(ADAPTERS.netbox.manifest);
  assert.ok(netbox.every((t) => t.tier === 'read' && /^netbox\.[a-z]+\.(list|get)$/.test(t.name)));
  assert.deepEqual([...new Set(netbox.map((t) => t.name.split('.')[1]))], ['space', 'unit', 'network', 'port', 'address', 'connection', 'group']);
});

test('helpers: ids are slugs, and secret-looking fields are emptied unless they are vault references', () => {
  assert.equal(slug('Room 3.01 (Wren)'), 'room-3-01-wren');
  assert.equal(slug('Café Ós'), 'cafe-os');
  const { raw, redacted } = redact({ name: 'sw1', snmp: { community_password: 'x', api_key: 'vault:net/snmp' }, list: [{ token: 'y' }], enabled_token: true });
  assert.equal(raw.snmp.community_password, null);
  assert.equal(raw.snmp.api_key, 'vault:net/snmp');
  assert.equal(raw.list[0].token, null);
  assert.equal(raw.enabled_token, true);
  assert.deepEqual(redacted, ['snmp.community_password', 'list[0].token']);
});

// ---- Spreadsheet importer ----

test('CSV reading: quotes, doubled quotes, line breaks in cells, semicolons, a BOM and CRLF', () => {
  const r = parseCsv('﻿Name;Notes\r\nbar;"one; two"\r\ntc;"say ""hi""\r\nnext line"\r\n');
  assert.equal(r.separator, ';');
  assert.deepEqual(r.header, ['Name', 'Notes']);
  assert.deepEqual(r.rows.map((x) => x.cells), [['bar', 'one; two'], ['tc', 'say "hi"\r\nnext line']]);
  assert.deepEqual(r.rows.map((x) => x.line), [2, 3]);
});

test('spreadsheet: a dry run plans units and nested spaces and writes nothing', async () => {
  const dir = tmp();
  const plan = await run('csv', CSV, dir);
  assert.deepEqual(plan.problems, []);
  assert.equal(plan.changes.filter((c) => c.kind === 'unit').length, 6);
  assert.equal(plan.changes.filter((c) => c.kind === 'space').length, 8);
  assert.ok(plan.changes.every((c) => c.action === 'new'));
  assert.equal(existsSync(path.join(dir, 'connected')), false, 'a dry run writes nothing');

  const bar = rec(plan, 'spreadsheet-unit-aig-000101');
  assert.equal(bar.name, 'dub-3-04-bar');
  assert.equal(bar.status, 'manage');
  assert.equal(bar.status_native, 'In service');
  assert.equal(bar.model_id, 'poly-studio-x52', 'matched to the Keia catalogue');
  assert.equal(bar.space, 'spreadsheet-room-dublin-office-3-wren');
  assert.deepEqual(bar.source, { system: 'spreadsheet', instance: 'devices.csv', record_id: 'AIG-000101', synced_at: T0, adapter: 'csv', adapter_version: '0.1.0' });
  assert.equal(bar.raw['Admin password'], null, 'the secret column is emptied');
  assert.deepEqual(bar.raw_redacted, ['Admin password']);
  assert.equal(bar.raw.Notes, 'Mounted under the display, "left" side', 'unknown columns are kept in raw');

  const rma = rec(plan, 'spreadsheet-unit-aig-000104');
  assert.equal(rma.status, undefined, 'an unknown status is not guessed');
  assert.equal(rma.status_native, 'Awaiting RMA');
  assert.equal(rma.model_id, undefined);
  assert.equal(rma.name, 'AIG-000104');
  assert.equal(rec(plan, 'spreadsheet-unit-aig-000105').status, 'spare');
  assert.equal(rec(plan, 'spreadsheet-unit-aig-000106').status, 'retire');

  const site = rec(plan, 'spreadsheet-site-dublin-office');
  assert.equal(site.atlas_site, 'dub');
  assert.equal(site.country, 'IE');
  assert.equal(site.time_zone, 'Europe/Dublin');
  assert.equal(rec(plan, 'spreadsheet-floor-dublin-office-3').parent, 'spreadsheet-site-dublin-office');
  const wren = rec(plan, 'spreadsheet-room-dublin-office-3-wren');
  assert.equal(wren.parent, 'spreadsheet-floor-dublin-office-3');
  assert.equal(wren.code, '3.04');
  assert.equal(rec(plan, 'spreadsheet-site-london-office').atlas_site, 'lon');

  const text = formatPlan(plan);
  assert.match(text, /\+ new\s+unit\s+spreadsheet-unit-aig-000101/);
  assert.match(text, /Dry run: nothing written\. 14 new, 0 changed\. Run again with --apply/);
  assert.match(text, /"Admin password" looked like a secret in 1 unit/);
  assert.match(text, /columns kept in raw only \(no Keia field yet\): Purchase date, Admin password, Notes/);
});

test('spreadsheet: --apply writes once; the same file again changes nothing', async () => {
  const dir = tmp();
  assert.equal(applyPlan(await run('csv', CSV, dir)), 14);
  const file = path.join(dir, 'connected/spreadsheet/units/spreadsheet-unit-aig-000101.yaml');
  const first = readFileSync(file, 'utf8');
  assert.match(first, /^# Connected unit from spreadsheet \(devices\.csv\), record AIG-000101\./);
  assert.doesNotMatch(first, /not-a-real-password/, 'no secret reaches the repository');

  const again = await run('csv', CSV, dir, { syncedAt: T1 });
  assert.ok(again.changes.every((c) => c.action === 'same'), 'idempotent');
  assert.equal(applyPlan(again), 0);
  assert.equal(readFileSync(file, 'utf8'), first, 'synced_at does not move when nothing changed');
  assert.match(formatPlan(again), /= unchanged 14 records[\s\S]*Up to date: nothing to write\./);
});

test('spreadsheet: source-owned fields follow the file, Keia-owned fields keep a person\'s edit, and nothing is deleted', async () => {
  const dir = tmp();
  applyPlan(await run('csv', CSV, dir));
  // A person corrects the catalogue link in the repository.
  const f = path.join(dir, 'connected/spreadsheet/units/spreadsheet-unit-aig-000101.yaml');
  writeFileSync(f, stringify({ ...parse(readFileSync(f, 'utf8')), model_id: 'poly-studio-x32' }));
  // The next export renames one unit and drops another.
  const lines = readFileSync(CSV, 'utf8').split('\n');
  const edited = lines.map((l) => l.replace('dub-3-04-bar', 'dub-3-04-vb')).filter((l) => !l.includes('AIG-000106')).join('\n');
  const next = path.join(tmp(), 'devices.csv');
  writeFileSync(next, edited);

  const plan = await run('csv', next, dir, { syncedAt: T1 });
  assert.deepEqual(plan.problems, []);
  const c = plan.changes.find((x) => x.id === 'spreadsheet-unit-aig-000101');
  assert.equal(c.action, 'changed');
  assert.deepEqual(c.fields.map((x) => [x.field, x.from, x.to]), [['name', 'dub-3-04-bar', 'dub-3-04-vb']]);
  assert.deepEqual(c.kept, [{ field: 'model_id', ours: 'poly-studio-x32', theirs: 'poly-studio-x52' }]);
  assert.equal(c.after.source.synced_at, T1);
  assert.deepEqual(plan.missing.map((m) => m.id).sort(), ['spreadsheet-floor-london-office-2', 'spreadsheet-room-london-office-2-kestrel', 'spreadsheet-site-london-office', 'spreadsheet-unit-aig-000106']);
  const text = formatPlan(plan);
  assert.match(text, /name\s+"dub-3-04-bar" -> "dub-3-04-vb"/);
  assert.match(text, /model_id\s+kept "poly-studio-x32": Keia owns it \(the source suggests "poly-studio-x52"\)/);
  assert.match(text, /not in this file: 4 records, kept \(nothing is deleted\)/);

  applyPlan(plan);
  const after = readRec(dir, 'spreadsheet', 'units', 'spreadsheet-unit-aig-000101');
  assert.equal(after.name, 'dub-3-04-vb');
  assert.equal(after.model_id, 'poly-studio-x32');
  assert.ok(existsSync(path.join(dir, 'connected/spreadsheet/units/spreadsheet-unit-aig-000106.yaml')), 'kept');
});

test('spreadsheet: a row with no key, a repeated key or a room with no site stops the whole import', async () => {
  const bad = path.join(tmp(), 'bad.csv');
  writeFileSync(bad, 'Asset tag,Make,Model,Room\nA-1,Poly,TC10,Wren\nA-1,Poly,TC10,Wren\n,Poly,TC10,Wren\n');
  const dir = tmp();
  const plan = await run('csv', bad, dir);
  const p = plan.problems.join('\n');
  assert.match(p, /a Room column needs a Site column/);
  assert.match(p, /line 3: "A-1" is already on line 2/);
  assert.match(p, /line 4: a unit needs an ID, asset tag, serial or name/);
  assert.throws(() => applyPlan(plan), /nothing written/);
  assert.equal(existsSync(path.join(dir, 'connected')), false);
  assert.match(formatPlan(plan), /Stopped: 3 problems\. Nothing written\./);
});

// ---- NetBox export importer ----

test('netbox: sites, locations and racks become nested spaces; devices become units in their rack', async () => {
  const plan = await run('netbox', NETBOX, tmp());
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.changes.map((c) => c.id), ['netbox-site-1', 'netbox-site-2', 'netbox-location-10', 'netbox-location-11', 'netbox-rack-7', 'netbox-device-42', 'netbox-device-43', 'netbox-device-44']);

  const site = rec(plan, 'netbox-site-1');
  assert.equal(site.atlas_site, 'dub');
  assert.equal(site.status, 'in-service');
  assert.equal(site.code, 'dub');
  assert.equal(site.source.url, 'https://netbox.example.com/dcim/sites/1/');
  assert.equal(rec(plan, 'netbox-site-2').source.url, 'https://netbox.example.com/dcim/sites/2/', 'the API url without /api when display_url is missing');
  assert.equal(rec(plan, 'netbox-location-10').level, 'floor', 'a location with locations inside is a floor');
  assert.equal(rec(plan, 'netbox-location-10').parent, 'netbox-site-1');
  const room = rec(plan, 'netbox-location-11');
  assert.equal(room.level, 'room');
  assert.equal(room.parent, 'netbox-location-10');
  const rack = rec(plan, 'netbox-rack-7');
  assert.equal(rack.parent, 'netbox-location-11');
  assert.equal(rack.size_u, 42);
  assert.equal(rack.category_native, 'Network');

  const sw = rec(plan, 'netbox-device-42');
  assert.equal(sw.space, 'netbox-rack-7');
  assert.deepEqual(sw.position, { u: 38, face: 'front' });
  assert.equal(sw.model_id, 'cisco-catalyst-9200l-48p-4g');
  assert.equal(sw.firmware, '17.12.4');
  assert.equal(sw.source.instance, 'netbox.example.com');
  assert.equal(sw.source.record_id, 'device/42');
  assert.equal(sw.raw.custom_fields.enable_password, null);
  assert.deepEqual(sw.raw_redacted, ['custom_fields.enable_password']);

  const bar = rec(plan, 'netbox-device-43');
  assert.equal(bar.name, 'Studio X52 (43)', 'an unnamed device takes its display name');
  assert.equal(bar.status, 'manage', 'offline is a health state, not a lifecycle step');
  assert.equal(bar.status_native, 'Offline');
  assert.equal(bar.space, 'netbox-site-2');
  assert.equal(bar.position, undefined);
  assert.equal(bar.model_id, 'poly-studio-x52');

  const ups = rec(plan, 'netbox-device-44');
  assert.equal(ups.status, 'plan');
  assert.equal(ups.serial, undefined, 'an empty serial is left out');
  assert.equal(ups.category_native, 'Power', "NetBox 3's device_role is read too");
  assert.deepEqual(ups.position, { u: 1, face: 'rear' });
});

test('netbox: a later export updates only what changed; ownership and idempotency hold', async () => {
  const dir = tmp();
  applyPlan(await run('netbox', NETBOX, dir));
  const again = await run('netbox', NETBOX, dir, { syncedAt: T1 });
  assert.ok(again.changes.every((c) => c.action === 'same'));

  const data = JSON.parse(readFileSync(NETBOX, 'utf8'));
  const d = data.devices.results[0];
  d.serial = 'FAKE-C9200-0099';
  d.status = { value: 'decommissioning', label: 'Decommissioning' };
  d.last_updated = '2026-09-30T09:00:00.000000Z';
  const next = path.join(tmp(), 'netbox.json');
  writeFileSync(next, JSON.stringify(data));
  const plan = await run('netbox', next, dir, { syncedAt: T1 });
  const changed = plan.changes.filter((c) => c.action === 'changed');
  assert.deepEqual(changed.map((c) => c.id), ['netbox-device-42']);
  assert.deepEqual(changed[0].fields.map((f) => f.field).sort(), ['serial', 'status', 'status_native']);
  assert.equal(changed[0].rawChanged, true);
  assert.match(formatPlan(plan), /serial\s+"FAKE-C9200-0042" -> "FAKE-C9200-0099"[\s\S]*raw\s+the system's own record changed/);
  applyPlan(plan);
  const after = readRec(dir, 'netbox', 'units', 'netbox-device-42');
  assert.equal(after.status, 'retire');
  assert.equal(after.source.synced_at, T1);
  assert.equal(readRec(dir, 'netbox', 'units', 'netbox-device-43').source.synced_at, T0, 'untouched records keep their time');
});

test('netbox: one saved list response works, a short page is flagged, and a device whose rack is missing is refused', async () => {
  const data = JSON.parse(readFileSync(NETBOX, 'utf8'));
  const only = { ...data.devices, count: 120 };
  const file = path.join(tmp(), 'devices.json');
  writeFileSync(file, JSON.stringify(only));
  const plan = await run('netbox', file, tmp());
  assert.equal(plan.changes.length, 3, 'kinds are read from each object\'s url');
  assert.match(plan.warnings.join('\n'), /holds 3 of 120\. NetBox pages its lists \(1,000 at most by default, even with \?limit=0\): follow "next" and save every page/);
  assert.match(plan.problems.join('\n'), /unit netbox-device-42: space "netbox-rack-7" is not in this file or in data\/connected/);
});

test('netbox: --system keeps two instances apart', async () => {
  const dir = tmp();
  applyPlan(await run('netbox', NETBOX, dir));
  const plan = await run('netbox', NETBOX, dir, { system: 'netbox-apac' });
  assert.deepEqual(plan.problems, []);
  assert.ok(plan.changes.every((c) => c.action === 'new' && c.id.startsWith('netbox-apac-')));
  assert.ok(plan.outDir.endsWith(path.join('connected', 'netbox-apac')));
});

// ---- The output in the repository passes npm run validate ----

test('imported records pass the validator, and its cross-reference checks catch a broken link', async () => {
  // A small copy of the repository: the real schemas, and only the catalogue folders connected records link
  // to, so the test stays light. Only problems in data/connected count here; the full repository is checked by
  // validate.test.mjs.
  const root = tmp();
  symlinkSync(path.join(ROOT, 'schemas'), path.join(root, 'schemas'));
  for (const f of ['sites', 'device-models', 'device-classes', 'sources']) cpSync(path.join(CATALOGUE, f), path.join(root, 'data', f), { recursive: true });
  const data = path.join(root, 'data');
  const connectedErrors = async () => (await validate(root)).errors.filter((e) => e.file.startsWith(path.join('data', 'connected')));
  applyPlan(await planImport({ adapter: ADAPTERS.csv, file: CSV, dataDir: data, syncedAt: T0 }));
  applyPlan(await planImport({ adapter: ADAPTERS.netbox, file: NETBOX, dataDir: data, syncedAt: T0 }));
  assert.equal(readdirSync(path.join(data, 'connected')).length, 2);
  assert.deepEqual(await connectedErrors(), []);

  const f = path.join(data, 'connected/netbox/units/netbox-device-42.yaml');
  writeFileSync(f, stringify({ ...parse(readFileSync(f, 'utf8')), space: 'netbox-rack-99', model_id: 'no-such-model' }));
  const moved = path.join(data, 'connected/netbox/spaces/netbox-site-2.yaml');
  writeFileSync(path.join(data, 'connected/netbox/units/netbox-site-2.yaml'), readFileSync(moved, 'utf8'));
  rmSync(moved);
  const msgs = (await connectedErrors()).map((e) => e.message).join('\n');
  assert.match(msgs, /space "netbox-rack-99" is not a connected space/);
  assert.match(msgs, /model_id "no-such-model" is not a model in data\/device-models/);
  assert.match(msgs, /a connected space from netbox belongs in data\/connected\/netbox\/spaces\//);
});

// ---- The command ----

test('npm run connect: a dry run by default, --apply to write, a non-zero exit for an unknown adapter', () => {
  const dir = tmp();
  const cli = (...a) => execFileSync(process.execPath, [path.join(ROOT, 'tools/connectors/cli.mjs'), ...a], { cwd: ROOT, encoding: 'utf8' });
  const usage = cli();
  assert.match(usage, /csv\s+Spreadsheet importer/);
  assert.match(usage, /netbox\s+NetBox export importer/);
  const dry = cli('netbox', NETBOX, '--data', dir);
  assert.match(dry, /Dry run: nothing written\. 8 new, 0 changed/);
  assert.equal(existsSync(path.join(dir, 'connected')), false);
  const wrote = cli('netbox', NETBOX, '--data', dir, '--apply');
  assert.match(wrote, /Written: 8 files \(8 new, 0 changed\)/);
  assert.equal(readdirSync(path.join(dir, 'connected/netbox/units')).length, 3);
  assert.throws(() => cli('nosuch', NETBOX), (e) => e.status === 1);
});
