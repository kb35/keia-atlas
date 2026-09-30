// Build sheets (src/lib/buildsheet.mjs): every per-unit setting has a value template, a unit's values are worked
// out from the data, secrets are never shown, and what cannot be worked out is Not recorded, never guessed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from 'yaml';
import { buildSheet, sheetCsv, wherePath } from '../src/lib/buildsheet.mjs';

const root = new URL('..', import.meta.url);
const read = (rel) => parse(readFileSync(new URL(rel, root), 'utf8'));
const HOUSE = read('data/house-values/aigna.yaml');
const CFGS = readdirSync(new URL('data/configurations/', root)).map((f) => read(`data/configurations/${f}`));
const meetup = CFGS.find((c) => c.id === 'logitech-meetup-2-google-meet');

const ctx = (extra = {}) => ({
  unit: { id: 'jnu-2-03/video-bar', cls: 'video-bar', clsName: 'Video bar', host: 'jnu-203-vc01', ip: '10.100.2.73', port: 'jnu-203-sw01 port 5', tag: 'AG-000479', serial: 'DEMO-JNU-000479', modelName: 'Logitech MeetUp 2', networked: true, records: ['assetbox', 'infodns', 'fleetlens', 'appstate', 'monitordog'], steps: ['provision', 'install', 'configure'] },
  room: { id: 'jnu-2-03', number: '2.03', name: 'Wren' },
  site: { id: 'jnu', code: 'JNU', name: 'Juneau office', city: 'Juneau', region: 'amer', time_zone: 'America/Juneau', countryName: 'United States' },
  regionName: 'Americas', cfg: meetup, house: HOUSE, vlanName: { 30: 'Room systems' }, systems: { assetbox: 'Assetbox', infodns: 'InfoDNS' },
  platforms: HOUSE.platforms.filter((p) => p.configurations.includes(meetup.id)), partner: { host: null, name: null, compute: null }, firmware: null,
  ...extra,
});
const row = (S, t) => S.rows.find((r) => r.t === t);

test('every per-unit setting in every configuration names its value template', () => {
  const bare = CFGS.flatMap((c) => c.groups.flatMap((g) => g.settings.filter((s) => s.per_device && s.action !== 'leave' && !s.derive).map((s) => `${c.id}: ${s.name}`)));
  assert.deepEqual(bare, []);
});

test('the MeetUp 2 in Wren: its own values, from the data', () => {
  const S = buildSheet(ctx());
  assert.equal(row(S, 'Room calendar').val, 'Juneau 2.03 Wren');
  assert.equal(row(S, 'Room calendar').alt.val, 'jnu-203-wren@resource.aigna.example');
  assert.equal(row(S, 'Time zone').val, 'America/Juneau');
  assert.equal(row(S, 'Internet Time (NTP)').val, 'ntp1.aigna.example');
  assert.equal(row(S, 'DHCP reservation').val, '10.100.2.73');
  assert.equal(row(S, 'VLAN (native, untagged)').val, '30 Room systems');
  assert.equal(row(S, 'DNS servers handed out').val, '10.10.0.53, 10.10.0.54');
  assert.equal(row(S, 'Room group').val, 'Juneau office');
  assert.equal(row(S, 'Organisational unit').val, 'Rooms / Americas / Juneau office');
  // Provisioning comes first, in the order it is done.
  assert.deepEqual(S.groups.slice(0, 3).map((g) => g.id), ['asset', 'dns', 'port']);
});

test('secrets are never shown: the sheet names the vault entry', () => {
  const r = row(buildSheet(ctx()), 'Admin password');
  assert.equal(r.secret, true);
  assert.equal(r.val, 'Juneau office / AV / Logitech MeetUp 2 / Admin password');
});

test('what the data does not hold is Not recorded, with a reason, never guessed', () => {
  const S = buildSheet(ctx());
  const enrol = row(S, 'Enroll a device with a code');
  assert.equal(enrol.missing, true);
  assert.equal(enrol.val, null);
  assert.match(enrol.why, /compute system/);
  assert.ok(S.missing.some((r) => r.t === 'MAC address for the reservation'));
  const noHost = buildSheet(ctx({ unit: { ...ctx().unit, host: null } }));
  assert.equal(row(noHost, 'DNS name (A and PTR records)').missing, true);
  const csv = sheetCsv(S);
  assert.ok(csv.includes('"Not recorded"'));
  assert.ok(csv.includes('From the password vault') && csv.includes('Juneau office / AV / Logitech MeetUp 2 / Admin password'));
});

test('where exactly does not repeat a menu step', () => {
  assert.equal(wherePath('Google Admin console > Devices > Google Meet hardware', 'Devices > Google Meet hardware > Settings'), 'Google Admin console › Devices › Google Meet hardware › Settings');
  assert.equal(wherePath('Device web interface', 'General Settings > Date and Time'), 'Device web interface › General Settings › Date and Time');
});
