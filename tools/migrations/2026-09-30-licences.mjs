#!/usr/bin/env node
// One-off migration: room and platform licences (the Licences capability, src/lib/modules.mjs).
//
// Kept for the record; it has already been run and its output committed. It writes only files that do not exist yet,
// so running it again changes nothing.
//
// Before: no licence was recorded anywhere. The setup guides said "confirm a Google Meet licence is free" and the house
// values named the management platforms, with no tier, seat count or renewal.
// After: data/licences/ holds one file per licence pool: the platform, which models take a seat, where it applies
// (a region or offices, or the units listed under assigned), seats bought, the renewal date, the cost and the role that owns it. Seats in use are not
// written down: src/lib/licences.mjs counts them from the units in data/installs/, so they never drift.
//
// Everything here is made up for the demo (demo: true): seat counts are the fleet's own count with a margin (one pool
// two seats short, so the page has something to show), dates and costs are invented, and Aigna has no Teams Rooms
// or Zoom Rooms estate: the one Teams Rooms Pro pool is a small trial for the Lab.
//
// Run from the repository root:  node tools/migrations/2026-09-30-licences.mjs

import { units, write } from './_fleet.mjs';

const MEET = ['poly-studio-x32', 'poly-studio-x52', 'poly-studio-x72', 'poly-g62', 'logitech-meetup-2'];
const POLY = ['poly-studio-x32', 'poly-studio-x52', 'poly-studio-x72', 'poly-g62'];
const used = (models, region) => units.filter((u) => models.includes(u.model) && (!region || u.region === region)).length;

const POOLS = [
  { id: 'google-meet-hardware-amer', name: 'Google Meet hardware, Americas', platform: 'google-meet-hardware', kind: 'meeting-room', vendor: 'Google', models: MEET, region: 'amer', extra: 5, term: 'annual', renews: '2026-10-19', auto: false, per: 230, owner: 'sm-av', note: 'Bought through the Google reseller; renews by purchase order, not automatically.' },
  { id: 'google-meet-hardware-emea', name: 'Google Meet hardware, EMEA', platform: 'google-meet-hardware', kind: 'meeting-room', vendor: 'Google', models: MEET, region: 'emea', extra: -2, term: 'annual', renews: '2027-03-01', auto: true, per: 230, owner: 'sm-av', note: 'Two rooms added in the Dublin fit-out went live before seats were added.' },
  { id: 'google-meet-hardware-apac', name: 'Google Meet hardware, Asia Pacific', platform: 'google-meet-hardware', kind: 'meeting-room', vendor: 'Google', models: MEET, region: 'apac', extra: 2, term: 'annual', renews: '2026-10-24', auto: false, per: 230, owner: 'sm-av' },
  { id: 'webex-room-devices', name: 'Webex room devices', platform: 'webex-device', kind: 'meeting-room', vendor: 'Cisco', models: ['cisco-desk-pro'], extra: 1, term: 'annual', renews: '2027-01-31', auto: true, per: 360, owner: 'sm-av' },
  { id: 'teams-rooms-pro-lab', name: 'Teams Rooms Pro, Lab trial', platform: 'teams-rooms-pro', kind: 'meeting-room', vendor: 'Microsoft', models: ['poly-studio-x52'], assigned: [], seats: 2, term: 'annual', renews: '2026-10-15', auto: false, per: 450, owner: 'innovation', note: 'Two seats for trying Poly systems in Teams mode in the Lab. No room uses them.' },
  { id: 'poly-lens-subscription', name: 'Poly Lens management subscription', platform: 'poly-lens', kind: 'device-management', vendor: 'HP Poly', models: POLY, extra: 6, term: 'three-year', renews: '2027-06-30', auto: false, per: 40, owner: 'sm-av' },
  { id: 'bsn-cloud', name: 'BrightSign BSN.cloud', platform: 'bsn-cloud', kind: 'device-management', vendor: 'BrightSign', models: ['brightsign-xt1145'], extra: 2, term: 'annual', renews: '2027-02-14', auto: true, per: 90, owner: 'sm-av' },
];

let n = 0;
for (const p of POOLS) {
  const seats = p.seats ?? Math.max(0, used(p.models, p.region) + p.extra);
  const scope = (p.region ? `scope: { region: ${p.region} }\n` : '') + (p.assigned ? `assigned: [${p.assigned.join(', ')}]\n` : '');
  const text = `# Licence pool: ${p.name}. Made up for the demo (tools/migrations/2026-09-30-licences.mjs).
# Seats in use are counted from the units in data/installs/ whose model is listed under covers, in this scope.
id: ${p.id}
name: ${p.name}
platform: ${p.platform}
kind: ${p.kind}
vendor: ${p.vendor}
covers:
  models: [${p.models.join(', ')}]
${scope}seats: ${seats}
term: ${p.term}
renews: "${p.renews}"
auto_renew: ${p.auto}
cost: { amount: ${seats * p.per}, currency: EUR, per: year }
owner_role: ${p.owner}
${p.note ? `notes: ${JSON.stringify(p.note)}\n` : ''}demo: true
`;
  if (write(`licences/${p.id}.yaml`, text)) n++;
}
console.log(`Wrote ${n} licence file${n === 1 ? '' : 's'} (data/licences/).`);
