// The service catalogue: every service the team runs, twelve in all. The first three (AV, Network, IT infrastructure)
// are the live services in src/lib/services.mjs, with their own pages; the other nine are defined here, each with an
// owner, the units in scope (by device class), a standard (a house standard in data/standards/ where one fits,
// otherwise a short one of its own, marked as a house choice), targets, a service map and a capability switch under
// Services (src/lib/modules.mjs). Pure: no data is loaded, so the rules can be tested on small inputs
// (tests/catalogue.test.mjs). src/lib/catalogue-view.mjs wires it to the site's data.
//
// Health is rolled up from the units: each unit is online, alerting or offline; a unit that is online or alerting is
// working. A service is within target when, in every office it covers, the share of its units working meets the
// service's availability target, and its other targets are kept. The states are SIMULATED: seeded per unit (the same
// on every build), with the open incidents putting their unit on alert and a short list of made-up faults
// (SIM_FAULTS). Real feeds replace this with the same shape.
import { seeded } from './experience.mjs';

export const LIVE_SERVICES = ['av', 'network', 'infrastructure'];
export const NEW_SERVICES = ['collaboration', 'wifi', 'security', 'print', 'signage', 'booking', 'building', 'home-kit', 'events'];
export const CATALOGUE_ORDER = [...LIVE_SERVICES, ...NEW_SERVICES];

// A target: what is promised, the figure and which way is better. `from: 'units'` is measured from the units' states
// per office (the availability target); the others are simulated from a seed, around `centre`.
const T = (id, what, target, unit, extra = {}) => ({ id, what, target, unit, better: 'up', ...extra });

// ---- The nine new services ------------------------------------------------------------------------------------------
// classes   device classes in scope; `where` narrows by the space's kind (data.mjs KIND) or space types; `keys` by position
// standard  { id } a house standard in data/standards/, or { house: true, name, summary, rules: [[rule, why]] }
// map       the service map: what it needs first (another service), its groups of kit in the order signals pass, what
//           it gives
// capability the switch under Services; state as in CAPABILITIES (Security is Connected: the security team runs it)
export const CATALOGUE = {
  collaboration: {
    id: 'collaboration', name: 'Collaboration platforms', owner: 'sofia', capability: 'collaboration',
    lede: 'Teams Rooms, Zoom Rooms and Google Meet hardware: which room systems join which platform, and their licences.',
    classes: ['video-bar', 'codec', 'desk-video-device'], word: ['room system', 'room systems'],
    standard: { id: 'meeting-av' },
    systems: ['Google Admin console', 'Poly Lens', 'Webex Control Hub', 'The licence portals'],
    targets: [T('available', 'Room systems signed in to their platform, in every office', 98, '%', { from: 'units' }), T('first', 'Calls that joined first time', 97, '%', { centre: 98.4, spread: 0.8 }), T('licensed', 'Room systems on a licensed platform', 95, '%', { from: 'licences' })],
    map: { before: { label: 'AV', to: '/services/av/', sub: 'The room kit' }, groups: [{ label: 'Video bars and codecs', classes: ['video-bar', 'codec'] }, { label: 'Desk video', classes: ['desk-video-device'] }], after: { label: 'Google Meet, Teams, Zoom and Webex', sub: 'One way to join from every room' } },
  },
  wifi: {
    id: 'wifi', name: 'Wi-Fi', owner: 'declan', capability: 'wifi',
    lede: 'Access points on a planned grid in every office, carrying the three house networks.',
    classes: ['wireless-access-point'], word: ['access point', 'access points'],
    standard: { id: 'wifi' },
    systems: ['UniFi Network', 'UniFi Site Manager'],
    targets: [T('available', 'Access points online, in every office', 99, '%', { from: 'units' }), T('band', 'Staff devices on 5 or 6 GHz', 85, '%', { centre: 91, spread: 2 }), T('roam', 'Calls kept while walking between access points', 98, '%', { centre: 99.1, spread: 0.5 })],
    map: { before: { label: 'Network', to: '/services/network/', sub: 'Switch ports and PoE' }, groups: [{ label: 'Access points', classes: ['wireless-access-point'] }], after: { label: 'Staff, device and guest Wi-Fi', sub: 'The three house networks' } },
  },
  security: {
    id: 'security', name: 'Security', owner: 'declan', ownedBy: 'The IT security team', capability: 'security',
    lede: 'Door access, cameras and visitor sign-in at each reception, run with the IT security team.',
    classes: ['security-device'], word: ['device', 'devices'],
    standard: {
      house: true, name: 'Reception security', summary: 'Door controllers and cameras on their own VLAN, never pointed at desks or meeting rooms, each covered by a privacy record.',
      rules: [
        ['Put door controllers, cameras and intercoms on the Security VLAN (60), never on the corporate network.', 'A camera or a door is a way in; its own VLAN keeps it apart from staff devices.'],
        ['Point a camera only at the entrance and the reception desk, never at desks, meeting rooms or screens.', 'The privacy record allows the entrance and nothing else.'],
        ['Record no footage or door events in Keia Atlas: they stay in the security platform.', 'Keia Atlas holds the devices and their wiring, not what they capture.'],
        ['Keep the visitor sign-in on the security platform; Keia Atlas shows only how many signed in.', 'Visitors\' names are personal data and belong in one place.'],
      ],
    },
    systems: ['The security platform', 'The access control platform', 'Visitor sign-in'],
    targets: [T('available', 'Door controllers and cameras working, in every office', 99, '%', { from: 'units' }), T('visitors', 'Visitors signed in at reception, not by hand', 95, '%', { centre: 98, spread: 1 })],
    map: { before: { label: 'Network', to: '/services/network/', sub: 'The Security VLAN' }, groups: [{ label: 'Door access', keys: ['door-controller', 'intercom'] }, { label: 'Cameras', keys: ['cctv-camera'] }, { label: 'Visitor sign-in', keys: ['visitor-system', 'panic-button'] }], after: { label: 'A secure entrance', sub: 'Recorded in the security platform' } },
  },
  print: {
    id: 'print', name: 'Print', owner: 'declan', capability: 'print',
    lede: 'Printers and multifunction devices in the copy and print rooms, on the printers VLAN.',
    classes: ['printer'], word: ['printer', 'printers'],
    standard: {
      house: true, name: 'Print', summary: 'A multifunction printer in a copy and print room on each floor, on the printers VLAN, printing only when the person is at it.',
      rules: [
        ['Put every printer on the Printers VLAN (70), with its own reservation and a hostname ending in prn.', 'Printers are managed and monitored, and a printer on the wrong VLAN shows as a finding.'],
        ['Hold every job until its owner signs in at the printer (follow-me printing).', 'Nothing is left in the tray for anyone to pick up.'],
        ['Keep one multifunction printer in a copy and print room on each floor with desks.', 'Nobody walks further than one floor to print.'],
        ['Report toner and paper before they run out, to the office\'s technician.', 'A printer that runs out in the morning is a printer out of service.'],
      ],
    },
    systems: ['Print management', 'The printers\' web interfaces'],
    targets: [T('available', 'Printers working, in every office', 95, '%', { from: 'units' }), T('supplies', 'Toner and paper reported before they ran out', 90, '%', { centre: 94, spread: 2 })],
    map: { before: { label: 'Network', to: '/services/network/', sub: 'The Printers VLAN' }, groups: [{ label: 'Printers and multifunction devices', classes: ['printer'] }], after: { label: 'Printing, copying and scanning', sub: 'Follow-me printing' } },
  },
  signage: {
    id: 'signage', name: 'Digital signage and displays', short: 'Signage and displays', owner: 'sofia', capability: 'signage',
    lede: 'Screens in receptions, pantries and cafeterias, and the players that feed them.',
    classes: ['signage-player', 'display'], where: { kinds: ['shared'] }, word: ['screen', 'screens'],
    standard: { id: 'signage' },
    systems: ['BrightSign BSN.cloud', 'LG Business Cloud', 'Samsung VXT'],
    targets: [T('available', 'Screens working, in every office', 97, '%', { from: 'units' }), T('content', 'Screens showing scheduled content', 98, '%', { centre: 99.2, spread: 0.5 })],
    map: { before: { label: 'Network', to: '/services/network/', sub: 'The Displays and signage VLAN' }, groups: [{ label: 'Signage players', classes: ['signage-player'] }, { label: 'Displays', classes: ['display'] }], after: { label: 'Company content', sub: 'On a schedule, from one platform' } },
  },
  booking: {
    id: 'booking', name: 'Room booking and scheduling', short: 'Room booking', owner: 'sofia', capability: 'room-booking',
    lede: 'The booking panel outside every bookable room, and each room\'s link to its calendar.',
    classes: ['scheduler-panel'], word: ['panel', 'panels'],
    standard: { id: 'scheduler-panels' },
    systems: ['Room booking', 'Logitech Sync'],
    targets: [T('available', 'Booking panels working, in every office', 97, '%', { from: 'units' }), T('linked', 'Bookable rooms linked to their calendar', 100, '%', { from: 'calendar' }), T('released', 'No-show bookings released within 10 minutes', 90, '%', { centre: 95, spread: 1.5 })],
    map: { before: { label: 'Network', to: '/services/network/', sub: 'PoE at the door' }, groups: [{ label: 'Booking panels', classes: ['scheduler-panel'] }], after: { label: 'Every bookable room', sub: 'Linked to its calendar' } },
  },
  building: {
    id: 'building', name: 'Building and sensors', short: 'Building and sensors', owner: 'declan', capability: 'building-sensors',
    lede: 'Environment sensors and room occupancy, counted per room and never per person.',
    classes: ['building-sensor'], word: ['sensor', 'sensors'],
    standard: {
      house: true, name: 'Building sensors, privacy first', summary: 'Sensors measure the building, not people: counts are per room, for groups of three or more, and never shown per person.',
      rules: [
        ['Fit only sensors that measure the room (temperature, humidity, air), or count people as a number, never who they are.', 'The building is measured; the people in it are not watched.'],
        ['Show a room\'s occupancy only as a count, and only for groups of three or more.', 'A count of one or two can point at a person.'],
        ['Cover every sensing device by a privacy record for its class and office before it goes in.', 'A person has checked the purpose, the notice and how long anything is kept.'],
        ['Put building sensors on the Building VLAN (50).', 'They are managed apart from staff devices.'],
      ],
    },
    systems: ['The building management system', 'The privacy records'],
    targets: [T('available', 'Sensors reporting, in every office', 95, '%', { from: 'units' }), T('covered', 'Sensing devices covered by a privacy record', 100, '%', { from: 'privacy' })],
    map: { before: { label: 'Network', to: '/services/network/', sub: 'The Building VLAN' }, groups: [{ label: 'Environment sensors', classes: ['building-sensor'] }, { label: 'Room counts', counts: true }], after: { label: 'Comfortable, right-sized rooms', sub: 'Counts per room, never per person' } },
  },
  'home-kit': {
    id: 'home-kit', name: 'Home office kit', short: 'Home office kit', owner: 'declan', capability: 'home-kit',
    lede: 'The kit Aigna provides at home desks: a managed gateway, a screen and a dock.',
    classes: ['network-gateway', 'monitor', 'dock'], where: { kinds: ['kits'] }, word: ['unit', 'units'],
    standard: { id: 'home-offices' },
    systems: ['UniFi Site Manager', 'The asset register'],
    targets: [T('available', 'Home kit working, in every remote group', 95, '%', { from: 'units' }), T('ship', 'Kit delivered within 5 working days', 90, '%', { centre: 93, spread: 2 })],
    map: { before: { label: 'Network', to: '/services/network/', sub: 'Managed home gateways' }, groups: [{ label: 'Home gateways', classes: ['network-gateway'] }, { label: 'Screens and docks', classes: ['monitor', 'dock'] }], after: { label: 'A working desk at home', sub: 'One cable to the laptop' } },
  },
  events: {
    id: 'events', name: 'Events and experience centres', short: 'Events', owner: 'sofia', capability: 'events',
    lede: 'Client briefings in the experience centres: readiness before, a technician during, a report after.',
    classes: null, where: { spaceTypes: ['executive-boardroom', 'demo-zone', 'briefing-auditorium', 'welcome-lounge', 'av-control-room'] }, word: ['unit', 'units'],
    standard: {
      house: true, name: 'Experience centres', summary: 'Every event is checked before it starts, staffed while it runs and reported after it ends.',
      rules: [
        ['Test every room an event uses on the day, or the afternoon before.', 'A room that worked last week is not a room that works now.'],
        ['Charge demo kit to at least 80 percent and test it within 14 days of the event.', 'Flat or untested kit is the most common way a demo goes wrong.'],
        ['Load the content, and test the recording when the event is recorded, before the day starts.', 'Nothing is copied or set up in front of the client.'],
        ['Write a backup plan for every event: another room, or another way to show the demo.', 'When something fails, the plan is already made.'],
        ['Keep a technician on site for the whole event; an incident in an event room during an event is P1.', 'A live client briefing cannot wait in a queue.'],
      ],
    },
    systems: ['Room booking', 'Poly Lens', 'The events calendar'],
    targets: [T('ready', 'Events ready by their start', 100, '%', { from: 'events' }), T('available', 'Experience centre kit working', 99, '%', { from: 'units' }), T('lost', 'Time lost per event', 10, 'min', { better: 'down', from: 'reports' })],
    map: { before: { label: 'AV', to: '/services/av/', sub: 'The room kit' }, groups: [{ label: 'Rooms and their kit', units: true }, { label: 'Demo kit', kit: true }, { label: 'Readiness checks', checks: true }], after: { label: 'Client briefings', sub: 'Ready, staffed and reported' } },
  },
};

// ---- Simulated faults: the only units made to fail. Everything else is seeded (unitStatus). -----------------------
// London's only printer is off the network, so Print is below target there. Made up.
export const SIM_FAULTS = {
  print: [{ site: 'lon', cls: 'printer', st: 'offline', why: 'Offline since 07:40: a paper jam, then off the network' }],
};
// The alerts a unit of each class can raise in the simulation, and the chance of one. Alerts do not stop a unit working.
export const SIM_ALERTS = {
  'video-bar': ['Not signed in to the calendar', 'Firmware update waiting'], codec: ['Not signed in to the calendar'], 'desk-video-device': ['Firmware update waiting'],
  'wireless-access-point': ['Channel crowded', 'Many clients at once'], 'security-device': ['Tamper switch opened and closed'], printer: ['Toner low', 'Paper low'],
  'signage-player': ['Playlist older than a day'], display: ['Running hot'], 'scheduler-panel': ['Calendar slow to answer'], 'building-sensor': ['Battery low'],
  'network-gateway': ['Signal from the internet provider is weak'], monitor: ['Not seen for a week'], dock: ['Firmware update waiting'],
};
export const ALERT_RATE = 0.03;

/** One unit's state: a simulated fault first, then an open incident (alert), then a seeded alert now and then. */
export function unitStatus(u, { fault = null, incident = false } = {}) {
  if (fault) return { st: fault.st, why: fault.why };
  if (incident) return { st: 'alert', why: 'An open incident' };
  const r = seeded(`unit:${u.tag}`);
  if (r() < ALERT_RATE) { const list = SIM_ALERTS[u.cls] ?? ['Not reporting as often as it should']; return { st: 'alert', why: list[Math.floor(r() * list.length)] }; }
  return { st: 'online', why: '' };
}
/** The fault from SIM_FAULTS that applies to a unit of a service, if any. */
export const faultFor = (svc, u) => (SIM_FAULTS[svc] ?? []).find((f) => f.site === u.site && (!f.cls || f.cls === u.cls) && (!f.tag || f.tag === u.tag)) ?? null;

/** Counts for a list of units with their states: { all, online, alert, offline, working, share }. */
export function countStates(units) {
  const n = { all: units.length, online: 0, alert: 0, offline: 0 };
  for (const u of units) n[u.st]++;
  const working = n.online + n.alert;
  return { ...n, working, share: n.all ? (working / n.all) * 100 : null };
}

/** The roll-up: per office, and the service's own. `units` carry { site, st }; `target` is the availability target in
    percent. Returns { ...counts, sites: [{ site, ...counts, within }], within, below: [site] }. An office with no
    units in scope is not counted. */
export function rollUp(units, target) {
  const bySite = new Map();
  for (const u of units) { if (!bySite.has(u.site)) bySite.set(u.site, []); bySite.get(u.site).push(u); }
  const sites = [...bySite].map(([site, list]) => { const c = countStates(list); return { site, ...c, within: c.share >= target }; });
  const below = sites.filter((s) => !s.within).map((s) => s.site);
  return { ...countStates(units), sites, within: below.length === 0, below };
}

/** A simulated target's figure: seeded around its centre, the same on every build. */
export function simulatedFigure(svc, t) {
  const r = seeded(`${svc}:target:${t.id}`);
  const v = t.centre + (r() * 2 - 1) * (t.spread ?? 1);
  return Math.min(t.unit === '%' ? 100 : Infinity, Math.max(0, v));
}
export const kept = (t, v) => v != null && (t.better === 'down' ? v <= t.target : v >= t.target);
export function targetWords(t, v) {
  if (v == null) return '–';
  if (t.unit === '%') return `${v >= 99.95 ? 100 : v >= 99 ? v.toFixed(1) : Math.round(v)}%`;
  if (t.unit === 'min') return `${Math.round(v)} min`;
  return String(v);
}
export const promiseWords = (t) => (t.unit === '%' ? `${t.better === 'down' ? 'At most' : 'At least'} ${t.target}%` : `${t.better === 'down' ? 'Under' : 'Over'} ${t.target} ${t.unit}`);

// ---- The catalogue's answer ---------------------------------------------------------------------------------------
// rows: [{ id, name, within, below: [site] }] in catalogue order; placeName(site) says where ("London").
// "12 services: 11 within target, Print below target in London".
export function catalogueAnswer(rows, placeName = (s) => s) {
  const n = rows.length;
  const out = rows.filter((r) => !r.within);
  const svc = `${n} ${n === 1 ? 'service' : 'services'}`;
  if (!out.length) return `${svc}: all within target`;
  const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  const parts = out.slice(0, 2).map((r) => `${r.name} below target${r.below?.length ? ` in ${list(r.below.map(placeName))}` : ''}`);
  if (out.length > 2) parts.push(`${out.length - 2} more below target`);
  return `${svc}: ${n - out.length} within target, ${parts.join(', ')}`;
}

// Search entries in the main search index's shape (see services.mjs searchItems).
export function catalogueSearchItems() {
  return NEW_SERVICES.map((id) => {
    const s = CATALOGUE[id];
    return ['svc', `services/${id}/`, s.name, `Service · ${s.lede}`, `service ${s.name} ${s.systems.join(' ')} owner standard targets`, {}];
  });
}
