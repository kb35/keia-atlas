#!/usr/bin/env node
// One-off migration: security-support fields on models and units (EU Cyber Resilience Act, UK PSTI).
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once the
// models have security_support.
//
// Models: every model with firmware worth attacking (networked, or a camera or microphone; see
// needsSecuritySupport in tools/crossrefs-privacy.mjs) gains security_support: the maker's firmware line,
// the end of security support and the maker's vulnerability contact.
//   - Dates. Makers rarely publish one. Cisco does for the Desk Pro (cited). Every other date is made up for
//     the demo and says demo: true; the made-up older models take their end_of_support. A few are set within
//     twelve months of the demo's today so the warning shows.
//   - Contacts. Only pages opened on 30 Sept 2026 (data/sources/security-support.yaml). Canon, Kramer and
//     BrightSign publish none we could open: their models leave the contact out and say so in gaps. The
//     made-up makers get a made-up page on an .example address, marked demo.
// Units: networked units installed from 2024, when the build sheet started asking, record
// default_password_changed: true. Two units still have the maker's default (false), so the warning shows.
// Earlier units have no record, and the page says "Not recorded".
//
// The edit is made on the text, so comments and layout stay as they were.
//
// Run from the repository root:  node tools/migrations/2026-09-30-security-support.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');
if (/^security_support:/m.test(readFileSync(path.join(DATA, 'device-models/poly-studio-x52.yaml'), 'utf8'))) {
  console.log('Already run: the models have security_support.');
  process.exit(0);
}

// [model, firmware line, end (YYYY-MM or a source-cited date), contact source or demo URL]
const CITED = { 'cisco-desk-pro': { date: '2031-03-31', source: 'cisco-desk-pro-eol' } };
const CONTACT = {
  Poly: ['https://enable.hp.com/potentialsecurityvulnerability-report', 'hp-report-vulnerability'],
  Logitech: ['https://www.logitech.com/en-us/legal/vulnerability-reporting', 'logitech-vulnerability-reporting'],
  Cisco: ['https://sec.cloudapps.cisco.com/security/center/resources/security_vulnerability_policy.html', 'cisco-security-vulnerability-policy'],
  Ubiquiti: ['https://www.ui.com/support/security-rewards/about/', 'ubiquiti-security-rewards'],
  Netgear: ['https://www.netgear.com/about/security/', 'netgear-product-security'],
  Samsung: ['https://security.samsungtv.com/', 'samsung-display-security'],
  LG: ['https://lgsecurity.lge.com/reporting', 'lg-product-security'],
};
const MADE_UP = ['Brightline', 'Corvus', 'Halden', 'Kestrel', 'Lumen', 'Solano'];
const NO_PAGE = ['Canon', 'Kramer', 'BrightSign'];
const LINES = {
  'poly-studio-x32': ['poly-videoos', '2032-12'], 'poly-studio-x52': ['poly-videoos', '2032-12'], 'poly-studio-x72': ['poly-videoos', '2032-12'], 'poly-g62': ['poly-videoos', '2032-12'],
  'poly-tc10': ['Poly VideoOS (updated with its system)', '2032-12'], 'poly-e60': ['Poly camera firmware (updated with its system)', '2031-06'], 'poly-e70': ['Poly camera firmware (updated with its system)', '2031-06'],
  'poly-expansion-microphone': ['Poly microphone firmware (updated with its system)', '2030-12'], 'poly-tabletop-microphone': ['Poly microphone firmware (updated with its system)', '2030-12'], 'poly-ip-ceiling-microphone': ['Poly microphone firmware', '2031-06'],
  'logitech-meetup-2': ['Logitech CollabOS', '2029-06'], 'logitech-tap-scheduler': ['Logitech CollabOS', '2027-06'], 'logitech-scribe': ['Logitech Scribe firmware, through Logitech Sync', '2026-12'],
  'cisco-desk-pro': ['Cisco RoomOS', null], 'cisco-catalyst-9200l-48p-4g': ['Cisco IOS XE', '2030-10'],
  'unifi-efg': ['UniFi OS', '2031-03'], 'unifi-express-7': ['UniFi OS', '2030-09'], 'unifi-u7-pro': ['UniFi device firmware', '2030-06'], 'unifi-u7-pro-max': ['UniFi device firmware', '2031-03'],
  'unifi-usw-pro-aggregation': ['UniFi device firmware', '2029-09'], 'unifi-usw-pro-max-48-poe': ['UniFi device firmware', '2031-06'],
  'netgear-m4250-gsm4210pd': ['NETGEAR M4250 firmware', '2029-04'], 'brightsign-xt1145': ['BrightSign OS', '2030-06'],
  'canon-ir-adv-c259': ['Canon imageRUNNER ADVANCE firmware', '2027-03'], 'canon-imageforce-c5150': ['Canon imageFORCE firmware', '2031-06'],
  'samsung-qm65c': ['Samsung Tizen for signage', '2028-12'], 'samsung-qm85c': ['Samsung Tizen for signage', '2028-12'],
  'lg-55uh5q-e': ['LG webOS Signage', '2027-08'], 'lg-75uh5q-e': ['LG webOS Signage', '2027-08'], 'kramer-pa-240z': ['Kramer PA-240Z firmware', '2029-01'],
};

const read = (dir) => {
  const out = {};
  const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.yaml')) out[n.slice(0, -5)] = { file: p, data: parse(readFileSync(p, 'utf8')) }; } };
  walk(path.join(DATA, dir));
  return out;
};
const classes = read('device-classes'), models = read('device-models');
const needs = (cls) => Boolean(classes[cls]?.data.platforms?.dhcp_dns) || ['network-gateway', 'camera', 'microphone'].includes(cls);
const q = (s) => (/[:#]/.test(s) ? JSON.stringify(s) : s);

let nModels = 0;
const modelEdits = [];
for (const [id, { file, data: m }] of Object.entries(models)) {
  if (!needs(m.class)) continue;
  const made = MADE_UP.includes(m.manufacturer);
  const line = LINES[id] ?? (made ? [`${m.manufacturer} firmware`, String(m.lifecycle?.end_of_support ?? '2015-06').slice(0, 7)] : null);
  if (!line) throw new Error(`${id}: no firmware line or date in the table`);
  const ends = CITED[id] ? `{ date: "${CITED[id].date}", source: ${CITED[id].source} }` : `{ date: "${line[1]}", demo: true }`;
  const out = ['security_support:', `  firmware_line: ${q(line[0])}`, `  ends: ${ends}`];
  if (made) out.push(`  vulnerability_contact: { url: "https://${m.manufacturer.toLowerCase()}.example/security", demo: true }`);
  else if (CONTACT[m.manufacturer]) out.push(`  vulnerability_contact: { url: "${CONTACT[m.manufacturer][0]}", source: ${CONTACT[m.manufacturer][1]} }`);
  else if (!NO_PAGE.includes(m.manufacturer)) throw new Error(`${id}: no contact rule for ${m.manufacturer}`);
  let text = readFileSync(file, 'utf8');
  const at = /^sources:\n/m.exec(text);
  text = text.slice(0, at.index) + out.join('\n') + '\n' + text.slice(at.index);
  if (NO_PAGE.includes(m.manufacturer)) {
    const gap = `  - ${m.manufacturer} publishes no vulnerability reporting page that could be opened on 30 Sept 2026, so security_support has no vulnerability_contact.\n`;
    text = /^gaps:\n/m.test(text) ? text.replace(/^gaps:\n/m, (g) => g + gap) : text.replace(/\n*$/, '\n\ngaps:\n' + gap);
  }
  modelEdits.push([file, text]);
  nModels++;
}

// Units: default_password_changed on networked units installed from 2024, and two still on the default:
// the second display in Copenhagen's Curlew (in service) and Juneau's printer (being installed; the password
// is set at the configure step).
const spaces = read('spaces'), types = read('space-types'), installs = read('installs');
const STILL_DEFAULT = new Set(['AG-000180', 'AG-000482']);
let nUnits = 0;
const edits = [];
for (const [sid, { file, data: inst }] of Object.entries(installs)) {
  const s = spaces[sid]?.data; if (!s) continue;
  const opt = types[s.space_type].data.keia_atlas.options.find((o) => o.id === s.option);
  let text = readFileSync(file, 'utf8');
  let changed = false;
  for (const p of inst.positions) {
    const key = p.position.replace(/^[a-z]+-\d+\//, '').replace(/#\d+$/, '');
    const cls = opt.equipment.find((e) => e.key === key)?.class;
    if (!classes[cls]?.data.platforms?.dhcp_dns || !p.hostname) continue;
    for (const u of p.units) {
      const still = STILL_DEFAULT.has(u.asset_tag);
      if (!still && (!u.installed || u.installed < '2024-01-01' || u.legacy)) continue;
      const re = new RegExp(`(\\n(\\s+)asset_tag: ${u.asset_tag}\\n\\s+stage: [a-z]+\\n(?:\\s+installed: "?[0-9-]+"?\\n)?)`);
      const m = re.exec(text);
      if (!m) throw new Error(`${sid}: could not find unit ${u.asset_tag} in block style`);
      text = text.replace(m[1], `${m[1]}${m[2]}default_password_changed: ${!still}\n`);
      changed = true; nUnits++;
    }
  }
  if (changed) edits.push([file, text]);
}
for (const [file, text] of [...modelEdits, ...edits]) writeFileSync(file, text);
console.log(`security_support on ${nModels} models; default_password_changed on ${nUnits} units (still on the default: ${[...STILL_DEFAULT].join(', ')}).`);
