// The canonical model v1 (docs/connectors/model.md) and the file importers built on it: the seven new kinds, the
// planned-against-seen rule and its drift events, field ownership, and the NetBox (network), Infoblox,
// Alertmanager and Snipe-IT importers with their privacy and secret redaction. Everything runs offline on the
// made-up fixtures in tools/connectors/fixtures/, writing only to temporary folders. Run with:  npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, cpSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { parse, stringify } from 'yaml';
import { validateRecord, checkManifest, normMac, inPrefix } from '../tools/connectors/adapter.mjs';
import { KINDS, KIND_FOLDER, linksOf, defaultOwner } from '../tools/connectors/kinds.mjs';
import { sameThing, compare, DRIFT_FOUND, DRIFT_CLEARED } from '../tools/connectors/drift.mjs';
import { planImport, applyPlan, formatPlan } from '../tools/connectors/run.mjs';
import { ADAPTERS } from '../tools/connectors/adapters/index.mjs';
import { validate } from '../tools/validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tools/connectors/fixtures');
const NETBOX = path.join(FIX, 'netbox-dublin.json');
const INFOBLOX = path.join(FIX, 'infoblox-wapi.json');
const ALERTS = path.join(FIX, 'alertmanager-webhook.json');
const SNIPEIT = path.join(FIX, 'snipeit-api.json');
const V0_EXAMPLES = path.join(ROOT, 'tests/fixtures/connectors/examples');
const CATALOGUE = path.join(ROOT, 'data');
const T0 = '2026-09-30T08:00:00.000Z';
const T1 = '2026-10-01T08:00:00.000Z';

const tmp = () => mkdtempSync(path.join(tmpdir(), 'keia-connect-v1-'));
const run = (adapter, file, dataDir, extra = {}) =>
  planImport({ adapter: ADAPTERS[adapter], file, dataDir, catalogueDir: CATALOGUE, syncedAt: T0, ...extra });
const rec = (plan, id) => plan.changes.find((c) => c.id === id)?.after;
const readRec = (dataDir, system, kind, id) => parse(readFileSync(path.join(dataDir, 'connected', system, KIND_FOLDER[kind], `${id}.yaml`), 'utf8'));
const example = (dir, name) => parse(readFileSync(path.join(dir, name), 'utf8'));
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const saveJson = (data, name = 'export.json') => {
  const f = path.join(tmp(), name);
  writeFileSync(f, JSON.stringify(data));
  return f;
};
const mark = { system: 'netbox', record_id: 'x/1', synced_at: T0, adapter: 'netbox' };

// ---- The model ----

test('v1 has eleven kinds, each with a folder; v0 records stay valid', () => {
  assert.equal(KINDS.length, 11);
  for (const k of KINDS) assert.ok(KIND_FOLDER[k], k);
  assert.deepEqual(validateRecord(example(V0_EXAMPLES, 'ticket.yaml')), []);
  assert.deepEqual(validateRecord(example(V0_EXAMPLES, 'event.yaml')), []);
  assert.deepEqual(validateRecord(example(path.join(FIX, 'examples'), 'circuit.yaml')), []);
  assert.deepEqual(validateRecord(example(path.join(FIX, 'examples'), 'contact.yaml')), []);
});

test('the new kinds refuse what they must: a port on nothing, a VLAN with no number, a cable with an empty end, a person as a contact', () => {
  assert.match(validateRecord({ kind: 'port', id: 'x-1', name: 'Gi1', type: 'interface', source: mark }).join('\n'), /missing required field "unit"/);
  assert.deepEqual(validateRecord({ kind: 'port', id: 'x-1', name: 'D12', type: 'front', space: 'x-room-1', source: mark }), [], 'a wall plate port sits on a space');
  assert.match(validateRecord({ kind: 'port', id: 'x-1', name: 'Gi1', type: 'sfp', unit: 'x-2', source: mark }).join('\n'), /type: must be one of/);
  assert.match(validateRecord({ kind: 'port', id: 'x-1', name: 'Gi1', type: 'interface', unit: 'x-2', mac: '00-00-5E-00-53-2A', source: mark }).join('\n'), /mac/);
  assert.match(validateRecord({ kind: 'network', id: 'x-1', name: 'Rooms', type: 'vlan', source: mark }).join('\n'), /missing required field "vid"/);
  assert.match(validateRecord({ kind: 'network', id: 'x-1', name: 'Rooms', type: 'prefix', prefix: '192.0.2.0', source: mark }).join('\n'), /prefix/);
  assert.match(validateRecord({ kind: 'connection', id: 'x-1', type: 'cable', a: { port: 'x-2' }, b: {}, source: mark }).join('\n'), /b/);
  assert.match(validateRecord({ kind: 'contact', id: 'x-1', type: 'person', name: 'A Person', source: mark }).join('\n'), /type: must be one of "organisation", "role"/);
  assert.match(validateRecord({ kind: 'contact', id: 'x-1', type: 'role', name: 'NOC', first_name: 'A', source: mark }).join('\n'), /unknown field "first_name"/);
  assert.match(validateRecord({ kind: 'group', id: 'x-1', name: 'Stack', type: 'stack', members: [], source: mark }).join('\n'), /members/);
});

test('the seen block keeps other systems\' values with their marks, and only those', () => {
  const addr = { kind: 'address', id: 'netbox-ip-address-1', address: '192.0.2.70/26', mac: '00:00:5e:00:53:2a', source: mark };
  assert.deepEqual(validateRecord({ ...addr, seen: { mac: [{ value: '00:00:5e:00:53:2b', system: 'infoblox', synced_at: T0, differs: true }] } }), []);
  assert.match(validateRecord({ ...addr, seen: { mac: [{ value: 'x', synced_at: T0 }] } }).join('\n'), /missing required field "system"/);
  assert.match(validateRecord({ ...addr, seen: { mac: [{ value: 'x', system: 'infoblox', synced_at: T0, who: 'me' }] } }).join('\n'), /unknown field "who"/);
});

test('links: every kind says where it points, and the list walks nested ends and members', () => {
  const links = linksOf({
    kind: 'connection', a: { port: 'p-1' }, b: { native: 'Power feed A' },
  });
  assert.deepEqual(links.map((l) => [l.at.join('.'), l.id, l.kinds.join('|')]), [['a.port', 'p-1', 'port']]);
  const g = linksOf({ kind: 'group', members: [{ ref: 'u-1' }, { ref: 'u-2' }] });
  assert.deepEqual(g.map((l) => l.at), [['members', 0, 'ref'], ['members', 1, 'ref']]);
  const p = linksOf({ kind: 'port', unit: 'u-1', untagged_vlan: 'v-1', tagged_vlans: ['v-2', 'v-3'] });
  assert.deepEqual(p.map((l) => l.id), ['u-1', 'v-1', 'v-2', 'v-3']);
});

test('field ownership defaults: decided facts to the system of record, observed facts to what sees them, links and notes to Keia', () => {
  assert.equal(defaultOwner('unit', 'serial'), 'record');
  assert.equal(defaultOwner('unit', 'health'), 'observed');
  assert.equal(defaultOwner('address', 'mac'), 'observed');
  assert.equal(defaultOwner('unit', 'model_id'), 'keia');
  assert.equal(defaultOwner('network', 'purpose'), 'keia');
  const m = structuredClone(ADAPTERS.netbox.manifest);
  m.objects.unit.fields.model_id = 'source';
  m.objects.unit.observes = ['health'];
  const errs = checkManifest(m).join('\n');
  assert.match(errs, /fields\.model_id: Keia owns its links and notes, so this must be "keia"/);
  assert.match(errs, /observes: "health" is not one of the fields it fills/);
});

test('every adapter is read only, reaches no host and holds no credential', () => {
  assert.deepEqual(Object.keys(ADAPTERS), ['csv', 'netbox', 'infoblox', 'alertmanager', 'snipeit']);
  for (const a of Object.values(ADAPTERS)) {
    assert.deepEqual(checkManifest(a.manifest), [], a.manifest.id);
    assert.equal(a.manifest.reads, 'file');
    assert.deepEqual(a.manifest.hosts, []);
    assert.deepEqual(a.manifest.credentials, []);
    for (const o of Object.values(a.manifest.objects)) assert.deepEqual(o.actions, ['read']);
  }
});

test('helpers: MAC addresses in one form, and addresses inside prefixes', () => {
  assert.equal(normMac('00-00-5E-00-53-2A'), '00:00:5e:00:53:2a');
  assert.equal(normMac('0000.5e00.532a'), '00:00:5e:00:53:2a');
  assert.equal(normMac('not a mac'), undefined);
  assert.ok(inPrefix('192.0.2.70/26', '192.0.2.64/26'));
  assert.ok(!inPrefix('192.0.2.11', '192.0.2.64/26'));
  assert.ok(inPrefix('2001:db8::10', '2001:db8::/64'));
  assert.ok(!inPrefix('192.0.2.1', '2001:db8::/64'));
});

// ---- NetBox: the network ----

test('netbox: interfaces, patch, console and power ports become ports, with VLANs, PoE, speed and MAC', async () => {
  const plan = await run('netbox', NETBOX, tmp());
  assert.deepEqual(plan.problems, []);
  const count = (k) => plan.changes.filter((c) => c.kind === k).length;
  assert.deepEqual(Object.fromEntries(['space', 'unit', 'network', 'port', 'address', 'connection', 'group'].map((k) => [k, count(k)])),
    { space: 5, unit: 6, network: 10, port: 12, address: 2, connection: 5, group: 1 });

  const gi = rec(plan, 'netbox-interface-1001');
  assert.equal(gi.type, 'interface');
  assert.equal(gi.unit, 'netbox-device-101');
  assert.equal(gi.speed_mbps, 1000, 'NetBox keeps kbit/s');
  assert.equal(gi.mode, 'access');
  assert.equal(gi.untagged_vlan, 'netbox-vlan-230');
  assert.deepEqual(gi.poe, { mode: 'pse', type_native: '802.3at (Type 2)' });
  assert.equal(gi.description, 'Room 3.04 video bar');
  const up = rec(plan, 'netbox-interface-1002');
  assert.equal(up.mode, 'tagged');
  assert.deepEqual(up.tagged_vlans, ['netbox-vlan-210', 'netbox-vlan-220', 'netbox-vlan-230', 'netbox-vlan-231']);
  assert.equal(up.speed_mbps, 10000);
  assert.equal(rec(plan, 'netbox-interface-1003').mac, '00:00:5e:00:53:01', 'NetBox 4.2 MAC objects, written the Keia way');
  assert.equal(rec(plan, 'netbox-interface-1004').enabled, false);
  assert.equal(rec(plan, 'netbox-interface-1010').poe.mode, 'pd');

  assert.equal(rec(plan, 'netbox-front-port-2001').type, 'front');
  assert.equal(rec(plan, 'netbox-front-port-2001').rear_port, 'netbox-rear-port-2101');
  assert.equal(rec(plan, 'netbox-rear-port-2101').type, 'rear');
  assert.equal(rec(plan, 'netbox-console-port-3001').type_native, 'Console port, RJ-45');
  assert.equal(rec(plan, 'netbox-console-server-port-3101').type, 'console');
  assert.deepEqual([rec(plan, 'netbox-power-port-4001').max_draw_w, rec(plan, 'netbox-power-port-4001').allocated_draw_w], [1100, 450]);
  assert.equal(rec(plan, 'netbox-power-outlet-4101').type, 'outlet');
  assert.equal(rec(plan, 'netbox-power-outlet-4101').feed, 'A');
});

test('netbox: cables join ports end to end; another thing at an end keeps its own words', async () => {
  const plan = await run('netbox', NETBOX, tmp());
  const patch = rec(plan, 'netbox-cable-501');
  assert.deepEqual([patch.a, patch.b], [{ port: 'netbox-interface-1001' }, { port: 'netbox-front-port-2001' }]);
  assert.equal(patch.medium, 'cat6a');
  assert.equal(patch.length_m, 1);
  assert.equal(patch.colour, '#2196f3');
  assert.equal(patch.status, 'in-service');
  assert.equal(rec(plan, 'netbox-cable-502').length_m, 38, 'centimetres become metres');
  assert.deepEqual(rec(plan, 'netbox-cable-503').b, { port: 'netbox-console-port-3001' });
  const feed = rec(plan, 'netbox-cable-505');
  assert.deepEqual(feed.a, { native: 'Power feed DUB-3.21-R1 feed A' });
  assert.equal(feed.status, 'planned');
  assert.equal(feed.medium, 'power');
});

test('netbox: VLANs carry their group and site; prefixes, ranges and Wi-Fi are networks; the Wi-Fi key is not kept', async () => {
  const plan = await run('netbox', NETBOX, tmp());
  const rooms = rec(plan, 'netbox-vlan-230');
  assert.deepEqual([rooms.type, rooms.vid, rooms.vlan_group, rooms.scope, rooms.status], ['vlan', 30, 'Dublin office', 'netbox-site-1', 'in-service']);
  assert.equal(rec(plan, 'netbox-vlan-290').status, 'reserved');
  const p = rec(plan, 'netbox-prefix-302');
  assert.deepEqual([p.type, p.prefix, p.vlan, p.vid, p.scope], ['prefix', '192.0.2.64/26', 'netbox-vlan-230', 30, 'netbox-site-1']);
  const r = rec(plan, 'netbox-ip-range-351');
  assert.deepEqual([r.type, r.start, r.end, r.role_native], ['range', '192.0.2.100/26', '192.0.2.126/26', 'DHCP pool']);
  const wifi = rec(plan, 'netbox-wireless-lan-601');
  assert.deepEqual([wifi.type, wifi.ssid, wifi.vlan, wifi.auth_native], ['wifi', 'Aigna-Guest', 'netbox-vlan-290', 'WPA Personal (PSK)']);
  assert.equal(wifi.raw.auth_psk, null);
  assert.deepEqual(wifi.raw_redacted, ['auth_psk']);
  assert.match(plan.warnings.join('\n'), /"auth_psk" looked like a secret in 1 network/);
});

test('netbox: IP addresses sit on their port, in their prefix, with the port\'s MAC; a virtual chassis is a stack', async () => {
  const plan = await run('netbox', NETBOX, tmp());
  const bar = rec(plan, 'netbox-ip-address-402');
  assert.deepEqual([bar.address, bar.port, bar.unit, bar.network, bar.dns_name, bar.mac, bar.status],
    ['192.0.2.70/26', 'netbox-interface-1010', 'netbox-device-104', 'netbox-prefix-302', 'dub-3-04-bar.aigna.example', '00:00:5e:00:53:2a', 'in-service']);
  const stack = rec(plan, 'netbox-virtual-chassis-1');
  assert.equal(stack.type, 'stack');
  assert.deepEqual(stack.members, [{ ref: 'netbox-device-101', role: 'master', position: 1 }, { ref: 'netbox-device-102', role: 'member', position: 2 }]);
  assert.equal(stack.domain, 'dub-3-21');
});

test('netbox fix 1: a choice-type custom field arrives as { value, label } and is read by its value', async () => {
  const plan = await run('netbox', NETBOX, tmp());
  assert.equal(rec(plan, 'netbox-device-101').firmware, '17.12.4', 'firmware kept as a choice');
  assert.equal(rec(plan, 'netbox-device-104').firmware, '4.3.0', 'firmware kept as text');
  assert.deepEqual(rec(plan, 'netbox-device-101').raw_redacted, ['custom_fields.snmp_community_secret']);
});

test('netbox fix 2: every page of a list is read, and a list cut short says to follow "next"', async () => {
  const data = json(NETBOX);
  const all = data.interfaces.results;
  data.interfaces = [
    { count: all.length, next: 'https://netbox.example.com/api/dcim/interfaces/?limit=3&offset=3', previous: null, results: all.slice(0, 3) },
    { count: all.length, next: null, previous: 'https://netbox.example.com/api/dcim/interfaces/?limit=3', results: all.slice(3) },
  ];
  const paged = await run('netbox', saveJson(data), tmp());
  assert.deepEqual(paged.problems, []);
  assert.equal(paged.changes.filter((c) => c.id.startsWith('netbox-interface-')).length, all.length, 'both pages read');
  assert.doesNotMatch(paged.warnings.join('\n'), /pages its lists/);

  const short = json(NETBOX);
  short.devices = { count: 1200, next: 'https://netbox.example.com/api/dcim/devices/?limit=1000&offset=1000', previous: null, results: short.devices.results };
  const plan = await run('netbox', saveJson(short), tmp());
  assert.match(plan.warnings.join('\n'), /devices holds 6 of 1200\. NetBox pages its lists \(1,000 at most by default, even with \?limit=0\): follow "next" and save every page\./);
});

test('netbox: a port whose VLAN is not in the export or the repository stops the import', async () => {
  const data = json(NETBOX);
  delete data.vlans;
  const plan = await run('netbox', saveJson(data), tmp());
  assert.match(plan.problems.join('\n'), /port netbox-interface-1001: untagged_vlan "netbox-vlan-230" is not in this file or in data\/connected/);
  assert.match(plan.problems.join('\n'), /port netbox-interface-1002: tagged_vlans\[0\] "netbox-vlan-210"/);
});

// ---- Infoblox ----

test('infoblox: networks and ranges become networks; each IP address is one record joining its reservation and DNS names', async () => {
  const plan = await run('infoblox', INFOBLOX, tmp());
  assert.deepEqual(plan.problems, []);
  const net = rec(plan, 'infoblox-network-192-0-2-64-26');
  assert.deepEqual([net.type, net.prefix, net.vid, net.description, net.atlas_site], ['prefix', '192.0.2.64/26', 30, 'DUB room systems', 'dub']);
  assert.equal(net.source.instance, 'gm.example.com');
  assert.match(net.source.record_id, /^network\//);
  assert.equal(rec(plan, 'infoblox-network-192-0-2-0-24').role_native, 'Network container');
  const pool = rec(plan, 'infoblox-range-192-0-2-100-192-0-2-126');
  assert.deepEqual([pool.type, pool.start, pool.end, pool.role_native], ['range', '192.0.2.100', '192.0.2.126', 'DHCP range']);

  const bar = rec(plan, 'infoblox-address-192-0-2-70');
  assert.deepEqual([bar.address, bar.network, bar.dns_name, bar.mac, bar.assignment],
    ['192.0.2.70/26', 'infoblox-network-192-0-2-64-26', 'dub-3-04-bar.aigna.example', '00:00:5e:00:53:2b', 'dhcp-reservation']);
  assert.match(bar.source.record_id, /^record:host_ipv4addr\//);
  const sw = rec(plan, 'infoblox-address-192-0-2-11');
  assert.deepEqual([sw.dns_name, sw.mac, sw.assignment], ['dub-3-21-sw1.aigna.example', undefined, undefined], 'DNS only: not a reservation');
  assert.deepEqual(Object.keys(sw.raw), ['record:a', 'record:ptr']);
  const panel = rec(plan, 'infoblox-address-192-0-2-72');
  assert.equal(panel.dns_name, 'dub-3-04-panel.aigna.example', 'the forward name wins');
  assert.equal(panel.raw.fixedaddress[0].extattrs['Provisioning token'], null, 'a secret-looking attribute is emptied');
  assert.equal(rec(plan, 'infoblox-address-192-0-2-90').status_native, 'Disabled');
  const warnings = plan.warnings.join('\n');
  assert.match(warnings, /192\.0\.2\.72: its forward name \(dub-3-04-panel\.aigna\.example\) and reverse name \(dub-3-04-tc\.aigna\.example\) differ/);
  assert.match(warnings, /Provisioning token" looked like a secret/);
});

test('infoblox: one saved response works, and a paged one says there is more', async () => {
  const data = json(INFOBLOX);
  const plan = await run('infoblox', saveJson({ result: data.network.result, next_page_id: '789c5590cd6ac3300c' }), tmp());
  assert.equal(plan.changes.length, 3);
  assert.match(plan.warnings.join('\n'), /has more pages \(next_page_id\)/);
});

// ---- Planned against seen ----

test('drift: records from two systems match on the thing they describe, never on a guess', () => {
  const u = (serial, name, extra = {}) => ({ kind: 'unit', serial, name, ...extra });
  assert.ok(sameThing(u('FAKE-1', 'a'), u('fake-1', 'b')), 'the serial decides');
  assert.ok(!sameThing(u('FAKE-1', 'sw1'), u('FAKE-2', 'sw1')), 'two serials are two units, whatever the name');
  assert.ok(sameThing({ kind: 'unit', name: 'dub-3-21-sw1' }, { kind: 'unit', name: 'dub-3-21-sw1.aigna.example' }));
  assert.ok(sameThing({ kind: 'address', address: '192.0.2.70/26' }, { kind: 'address', address: '192.0.2.70' }));
  assert.ok(!sameThing({ kind: 'address', address: '192.0.2.70' }, { kind: 'network', type: 'prefix', prefix: '192.0.2.70/32' }));
  const planned = { kind: 'address', id: 'netbox-ip-address-402', mac: '00:00:5e:00:53:2a', source: { ...mark, record_id: 'ip-address/402' } };
  const observed = { kind: 'address', id: 'infoblox-address-192-0-2-70', mac: '00:00:5E:00:53:2A', dns_name: 'X.example.', source: { system: 'infoblox', record_id: 'r/1', synced_at: T0, adapter: 'infoblox' } };
  const same = compare({ planned, observed, fields: ['mac', 'dns_name'], syncedAt: T0 });
  assert.deepEqual(same.events, [], 'the same MAC written another way is not drift; a field the owner lacks is only seen');
  assert.deepEqual(Object.keys(same.seen), ['mac', 'dns_name']);
});

test('drift: NetBox records the address, Infoblox sees another MAC: a drift event, a seen value, and no overwrite', async () => {
  const dir = tmp();
  applyPlan(await run('netbox', NETBOX, dir));
  const plan = await run('infoblox', INFOBLOX, dir);
  assert.deepEqual(plan.problems, []);
  const drift = plan.changes.filter((c) => c.drift);
  assert.equal(drift.length, 1);
  const ev = drift[0].after;
  assert.equal(ev.type, DRIFT_FOUND);
  assert.equal(ev.subject, 'netbox-ip-address-402');
  assert.equal(ev.key, 'netbox-ip-address-402:mac');
  assert.deepEqual(ev.data.planned, { value: '00:00:5e:00:53:2a', system: 'netbox', record_id: 'ip-address/402' });
  assert.equal(ev.data.seen.value, '00:00:5e:00:53:2b');
  assert.equal(ev.source.system, 'infoblox');
  assert.ok(drift[0].file.includes(path.join('connected', 'infoblox', 'events')));

  const nb = plan.changes.find((c) => c.id === 'netbox-ip-address-402');
  assert.equal(nb.action, 'changed');
  assert.deepEqual(nb.fields.map((f) => f.field), ['seen'], 'only the seen block changes');
  assert.equal(nb.after.mac, '00:00:5e:00:53:2a', 'the owner\'s value is not overwritten');
  assert.deepEqual(nb.after.seen.mac, [{ value: '00:00:5e:00:53:2b', system: 'infoblox', instance: 'gm.example.com', record_id: nb.after.seen.mac[0].record_id, synced_at: T0, differs: true }]);
  assert.equal(nb.after.seen.dns_name[0].differs, undefined, 'the DNS names agree');
  const text = formatPlan(plan);
  assert.match(text, /Planned against seen \(a finding for a person; nothing is overwritten\)\n {2}! address netbox-ip-address-402, mac: netbox has "00:00:5e:00:53:2a", infoblox sees "00:00:5e:00:53:2b"/);
  assert.match(text, /seen\s+what other systems see was updated; the owner's values are unchanged/);

  applyPlan(plan);
  const again = await run('infoblox', INFOBLOX, dir, { syncedAt: T1 });
  assert.ok(again.changes.every((c) => c.action === 'same'), 'the same export twice raises nothing new');
  const nbAgain = await run('netbox', NETBOX, dir, { syncedAt: T1 });
  assert.ok(nbAgain.changes.every((c) => c.action === 'same'), 'NetBox\'s own import keeps the seen block');
  assert.equal(readRec(dir, 'netbox', 'address', 'netbox-ip-address-402').seen.mac[0].value, '00:00:5e:00:53:2b');
});

test('drift: the order of imports does not matter, and agreeing again raises a cleared event', async () => {
  const dir = tmp();
  applyPlan(await run('infoblox', INFOBLOX, dir));
  const plan = await run('netbox', NETBOX, dir);
  assert.deepEqual(plan.problems, []);
  const found = plan.changes.filter((c) => c.drift).map((c) => c.after);
  assert.deepEqual(found.map((e) => [e.type, e.subject, e.data.field]), [[DRIFT_FOUND, 'netbox-ip-address-402', 'mac']]);
  applyPlan(plan);

  // The network team fixes NetBox: the bar was replaced, and its new MAC is recorded.
  const data = json(NETBOX);
  data.interfaces.results.find((i) => i.id === 1010).primary_mac_address.mac_address = '00:00:5E:00:53:2B';
  const fixed = await run('netbox', saveJson(data), dir, { syncedAt: T1 });
  assert.deepEqual(fixed.problems, []);
  const cleared = fixed.changes.filter((c) => c.drift).map((c) => c.after);
  assert.deepEqual(cleared.map((e) => [e.type, e.subject, e.severity]), [[DRIFT_CLEARED, 'netbox-ip-address-402', 'info']]);
  const addr = fixed.changes.find((c) => c.id === 'netbox-ip-address-402').after;
  assert.equal(addr.mac, '00:00:5e:00:53:2b');
  assert.equal(addr.seen.mac[0].differs, undefined);
  assert.match(formatPlan(fixed), /= address netbox-ip-address-402, mac: netbox and infoblox agree again/);
});

// ---- Alertmanager ----

test('alertmanager: each alert raised or cleared is one event, keyed by its fingerprint, about the unit it names', async () => {
  const dir = tmp();
  applyPlan(await run('netbox', NETBOX, dir));
  const plan = await run('alertmanager', ALERTS, dir);
  assert.deepEqual(plan.problems, []);
  assert.equal(plan.changes.length, 4);
  const down = rec(plan, 'alertmanager-8c1f4a0b2d3e5f67-firing-2026-09-30t07-55-00z');
  assert.deepEqual([down.type, down.subject, down.state, down.severity, down.key, down.time],
    ['io.keia.alert.firing', 'netbox-device-104', 'firing', 'critical', '8c1f4a0b2d3e5f67', '2026-09-30T07:55:00Z']);
  assert.equal(down.data.summary, 'dub-3-04-bar is not answering pings');
  assert.equal(down.source.instance, 'alertmanager.example.com');
  assert.match(down.source.url, /^https:\/\/prometheus\.example\.com\/graph/);
  const up = rec(plan, 'alertmanager-8c1f4a0b2d3e5f67-resolved-2026-09-30t07-55-00z');
  assert.deepEqual([up.type, up.state, up.key, up.time], ['io.keia.alert.resolved', 'resolved', '8c1f4a0b2d3e5f67', '2026-09-30T08:12:00Z']);
  const poe = rec(plan, 'alertmanager-1a2b3c4d5e6f7081-firing-2026-09-30t07-58-30z');
  assert.equal(poe.subject, 'netbox-device-101', 'the port and the domain are dropped to find the unit');
  assert.equal(poe.severity, 'warning');
  const sign = rec(plan, 'alertmanager-f0e1d2c3b4a59687-firing-2026-09-30t08-01-00z');
  assert.equal(sign.subject, undefined, 'no guess when no unit has the name');
  assert.match(plan.warnings.join('\n'), /ProbeFailed on dub-4-12-sign\.aigna\.example: no connected unit has that name/);

  applyPlan(plan);
  const again = await run('alertmanager', ALERTS, dir, { syncedAt: T1 });
  assert.ok(again.changes.every((c) => c.action === 'same'));
});

test('alertmanager: a cut-short payload is flagged, and something else is refused', async () => {
  const data = json(ALERTS);
  data[0].truncatedAlerts = 4;
  const plan = await run('alertmanager', saveJson(data), tmp());
  assert.match(plan.warnings.join('\n'), /left out 4 alerts \(max_alerts on the receiver\)/);
  const bad = await run('alertmanager', saveJson({ hello: 'world' }), tmp());
  assert.match(bad.problems.join('\n'), /is not an Alertmanager webhook payload/);
});

// ---- Snipe-IT ----

test('snipe-it: locations become nested spaces; assets become units with purchase, warranty and supplier', async () => {
  const plan = await run('snipeit', SNIPEIT, tmp());
  assert.deepEqual(plan.problems, []);
  const site = rec(plan, 'snipeit-location-1');
  assert.deepEqual([site.level, site.country, site.atlas_site], ['site', 'IE', 'dub']);
  assert.equal(rec(plan, 'snipeit-location-2').level, 'floor');
  assert.equal(rec(plan, 'snipeit-location-3').level, 'room');
  assert.equal(rec(plan, 'snipeit-location-3').parent, 'snipeit-location-2');

  const bar = rec(plan, 'snipeit-asset-201');
  assert.deepEqual([bar.status, bar.status_native, bar.space, bar.purchased_on, bar.warranty_ends, bar.supplier, bar.model_id],
    ['manage', 'Deployed', 'snipeit-location-3', '2024-03-14', '2027-03-14', 'Northlight AV (example)', 'poly-studio-x52']);
  assert.equal(bar.source.url, 'https://assets.example.com/hardware/201');
  assert.equal(rec(plan, 'snipeit-asset-204').status, 'spare');
  assert.equal(rec(plan, 'snipeit-asset-204').name, 'AIG-000150', 'no name: the asset tag');
  assert.equal(rec(plan, 'snipeit-asset-204').space, 'snipeit-location-5');
  assert.equal(rec(plan, 'snipeit-asset-205').status, 'retire');
  const ups = rec(plan, 'snipeit-asset-206');
  assert.equal(ups.status, undefined, 'out for repair is not guessed');
  assert.equal(ups.status_native, 'Out for repair');
});

test('snipe-it: people are never kept: "checked out to" a person, who created it and a manager are emptied, and so are street addresses', async () => {
  const dir = tmp();
  const plan = await run('snipeit', SNIPEIT, dir);
  const dock = rec(plan, 'snipeit-asset-203');
  assert.equal(dock.raw.assigned_to, null);
  assert.equal(dock.raw.created_by, null);
  assert.deepEqual(dock.raw_redacted, ['created_by', 'assigned_to']);
  assert.equal(dock.space, undefined, 'an asset with a person is not placed: their whereabouts are not the asset\'s');
  const bar = rec(plan, 'snipeit-asset-201');
  assert.deepEqual(bar.raw.assigned_to, { id: 3, name: 'Meeting room 3.04 (Wren)', type: 'location' }, 'a place is kept');
  assert.equal(bar.raw.custom_fields['Admin password'], null);
  assert.deepEqual(bar.raw_redacted, ['created_by', 'custom_fields.Admin password']);
  const site = rec(plan, 'snipeit-location-1');
  for (const f of ['address', 'zip', 'phone', 'manager']) assert.equal(site.raw[f], null, f);
  assert.equal(site.raw.city, 'Dublin', 'a town is kept');
  assert.match(plan.warnings.join('\n'), /Snipe-IT names a person .* Keia keeps no people/);

  applyPlan(plan);
  const written = readdirSync(path.join(dir, 'connected/snipeit/units')).map((f) => readFileSync(path.join(dir, 'connected/snipeit/units', f), 'utf8')).join('\n');
  for (const s of ['Jordan', 'jordan@', 'E1017', 'Morgan', 'not-a-real-password']) assert.ok(!written.includes(s), s);
  assert.ok(!readFileSync(path.join(dir, 'connected/snipeit/spaces/snipeit-location-1.yaml'), 'utf8').includes('Example Quay'));
});

// ---- The output passes npm run validate ----

test('all four importers together pass the validator, and a broken link between new kinds is caught', async () => {
  const root = tmp();
  symlinkSync(path.join(ROOT, 'schemas'), path.join(root, 'schemas'));
  for (const f of ['sites', 'device-models', 'device-classes', 'sources', 'vendors']) cpSync(path.join(CATALOGUE, f), path.join(root, 'data', f), { recursive: true });
  const data = path.join(root, 'data');
  const connectedErrors = async () => (await validate(root)).errors.filter((e) => e.file.startsWith(path.join('data', 'connected')));
  for (const [id, file] of [['netbox', NETBOX], ['infoblox', INFOBLOX], ['snipeit', SNIPEIT], ['alertmanager', ALERTS]]) {
    const plan = await planImport({ adapter: ADAPTERS[id], file, dataDir: data, syncedAt: T0 });
    assert.deepEqual(plan.problems, [], id);
    applyPlan(plan);
  }
  assert.deepEqual(readdirSync(path.join(data, 'connected')).sort(), ['alertmanager', 'infoblox', 'netbox', 'snipeit']);
  assert.deepEqual(await connectedErrors(), []);

  const f = path.join(data, 'connected/netbox/ports/netbox-interface-1001.yaml');
  writeFileSync(f, stringify({ ...parse(readFileSync(f, 'utf8')), untagged_vlan: 'netbox-device-101' }));
  const c = path.join(data, 'connected/netbox/connections/netbox-cable-501.yaml');
  writeFileSync(c, stringify({ ...parse(readFileSync(c, 'utf8')), b: { port: 'netbox-interface-1001' } }));
  const msgs = (await connectedErrors()).map((e) => e.message).join('\n');
  assert.match(msgs, /untagged_vlan "netbox-device-101" is not a connected network/);
  assert.match(msgs, /a connection needs two different ports/);
  assert.ok(existsSync(path.join(data, 'connected/infoblox/events')));
});

test('npm run connect lists every importer', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'tools/connectors/cli.mjs')], { cwd: ROOT, encoding: 'utf8' });
  for (const name of ['csv', 'netbox', 'infoblox', 'alertmanager', 'snipeit']) assert.match(out, new RegExp(`\\n  ${name}\\s`));
});
