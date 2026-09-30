#!/usr/bin/env node
// One-off migration: certificates, service accounts and secrets, by reference (the Certificates and secrets
// capability, src/lib/modules.mjs).
//
// Kept for the record; it has already been run and its output committed. It writes only files that do not exist yet,
// so running it again changes nothing.
//
// Before: setup guides installed "the 802.1X certificate first", a Juneau printer waited on a certificate request
// (data/incidents/inc0041209.yaml) and build sheets named vault entries, but nothing recorded a certificate, a device
// service account or an API credential, or when any of them expires.
// After: data/credentials/ holds one reference per credential: its kind, where it lives in the vault (a vault: name,
// never the secret; tools/secrets.mjs and the schema both check it), what uses it (models and offices, a unit, or a
// platform), the role that owns it, when it was issued or last rotated, and when it expires.
// src/lib/credentials.mjs warns at 60, 30 and 7 days.
//
// Made up for the demo (demo: true): the names, dates and vault paths are invented; no secret is anywhere.
//
// Run from the repository root:  node tools/migrations/2026-09-30-credentials.mjs

import { write } from './_fleet.mjs';

const C = [
  ['cert-8021x-poly-emea', 'certificate', '802.1X certificate, Poly room systems in EMEA', 'vault:EMEA/AV/Poly/802.1X client certificate', '{ models: [poly-studio-x32, poly-studio-x52, poly-studio-x72, poly-g62], sites: [dub, lon, cph] }', 'Lets each room system join the room systems VLAN (the network standard\'s 802.1X rule).', 'Aigna internal CA', '2025-10-23', null, '2026-10-23', 'sm-infra'],
  ['cert-8021x-poly-amer', 'certificate', '802.1X certificate, Poly room systems in the Americas', 'vault:AMER/AV/Poly/802.1X client certificate', '{ models: [poly-studio-x32, poly-studio-x52, poly-studio-x72, poly-g62], sites: [nyc, chi, tor, jnu] }', 'Lets each room system join the room systems VLAN.', 'Aigna internal CA', '2026-02-14', null, '2027-02-14', 'sm-infra'],
  ['cert-https-kramer-dub', 'certificate', 'HTTPS certificate, Dublin laptop switchers', 'vault:Dublin/AV/Kramer SWT3-31-HU/web certificate', '{ models: [kramer-swt3-31-hu], sites: [dub] }', 'The switchers\' web pages, where their settings are made.', 'Aigna internal CA', '2025-10-04', null, '2026-10-04', 'sm-av'],
  ['cert-printer-jnu', 'certificate', 'Printer certificate, Juneau office', 'vault:Juneau/Print/Canon/device certificate', '{ units: [AG-000482] }', 'Lets the printer join the printer VLAN and the print service.', 'Aigna internal CA', '2025-09-20', null, '2026-09-20', 'sm-infra'],
  ['cert-radius-wifi', 'certificate', 'RADIUS server certificate, staff Wi-Fi', 'vault:Global/Network/RADIUS/server certificate', '{ models: [unifi-u7-pro, unifi-u7-pro-max] }', 'Staff laptops check it before they join the staff Wi-Fi with 802.1X.', 'Aigna internal CA', '2025-08-30', null, '2027-08-30', 'sm-infra'],
  ['cert-unifi-console', 'certificate', 'UniFi controller HTTPS certificate', 'vault:Global/Network/UniFi/controller certificate', '{ platform: unifi }', 'The controller\'s web console and its API.', 'Public certificate authority', '2025-11-20', null, '2026-11-20', 'network'],
  ['svc-google-admin-rooms', 'service-account', 'Google Admin service account for the Meet rooms', 'vault:Global/Monitoring/Google Admin/rooms service account', '{ platform: google-admin }', 'Reads the Meet room systems\' state for Atlas and device management.', null, '2026-06-01', '2026-06-01', '2026-12-01', 'sm-av'],
  ['snmp-unifi-switches', 'snmp-user', 'SNMP v3 user on the UniFi switches', 'vault:Global/Monitoring/UniFi/SNMP v3 user', '{ models: [unifi-usw-pro-max-48-poe, unifi-usw-pro-aggregation] }', 'Monitoring reads the switches\' ports and PoE use.', null, '2026-03-15', '2026-03-15', '2027-03-15', 'network'],
  ['api-poly-lens', 'api-token', 'Poly Lens API client', 'vault:Global/Monitoring/Poly Lens/API client', '{ platform: poly-lens }', 'Atlas reads each Poly system\'s firmware and health.', null, '2026-01-10', '2026-01-10', '2027-01-10', 'sm-av'],
  ['api-bsn-cloud', 'api-token', 'BSN.cloud API key', 'vault:Global/Signage/BSN.cloud/API key', '{ models: [brightsign-xt1145] }', 'Publishes the signage players\' content and reads their state.', null, '2025-11-02', '2025-11-02', '2026-11-02', 'sm-av'],
  ['svc-webex-control-hub', 'service-account', 'Webex Control Hub service app', 'vault:Global/Monitoring/Webex/service app', '{ models: [cisco-desk-pro] }', 'Reads the Webex desk devices\' state for Atlas.', null, '2026-05-01', '2026-05-01', '2027-05-01', 'sm-av'],
];

let n = 0;
for (const [id, kind, name, vault, used, purpose, issuer, issued, rotated, expires, owner] of C) {
  const text = `# Credential reference. Made up for the demo (tools/migrations/2026-09-30-credentials.mjs). No secret is kept here:
# vault names where it lives.
id: ${id}
kind: ${kind}
name: ${JSON.stringify(name)}
vault: ${JSON.stringify(vault)}
used_by: ${used}
purpose: ${JSON.stringify(purpose)}
${issuer ? `issuer: ${issuer}\n` : ''}issued: "${issued}"
${rotated ? `rotated: "${rotated}"\n` : ''}expires: "${expires}"
owner_role: ${owner}
demo: true
`;
  if (write(`credentials/${id}.yaml`, text)) n++;
}
console.log(`Wrote ${n} credential reference${n === 1 ? '' : 's'} (data/credentials/).`);
