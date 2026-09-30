// Locations: offices, regions and home offices, worked out once
// at build time for the Locations pages (src/pages/locations/). Everything here is read from the data; the three
// service lights come from Services' health. Nothing is stored twice: rooms, comms rooms, racks, incidents, projects, work and people all come
// from their own libraries.
import { spaces, sites, projects, vendors, commsRooms, SITE_ORDER, KIND, REGION_LABEL, INC_STATE, DEMO_TODAY, href } from './data.mjs';
import { PEOPLE } from './demo.mjs';
import { incidentList, byUrgency } from './incidents.mjs';
import { commsFacts, standardPill, sizeFor, racksIn } from './comms.mjs';
import { workBySite, nextTwoWeeks, whereIs } from './work.mjs';
import { sitesWithFloors, building } from './floors.mjs';
import { roomsModel, lean } from './livemodel.mjs';
import { serviceHealth, SERVICE_ORDER } from './services-view.mjs';

export const REGIONS = ['emea', 'amer', 'apac'];
export const REGION_SHORT = { emea: 'EMEA', amer: 'Americas', apac: 'Asia Pacific' };
export const REGION_NAME = REGION_LABEL;
// The remote site that holds each region's home offices.
export const HOME_SITE = { emea: 'rem', amer: 'ram', apac: 'rap' };
export const ROLE_WORD = { headquarters: 'Headquarters', regional: 'Regional office', office: 'Office', satellite: 'Satellite office' };
export const OFFICE_IDS = SITE_ORDER.filter((id) => sites[id]?.kind === 'office');
export const officesIn = (region) => OFFICE_IDS.filter((id) => sites[id].region === region);
const FLOORED = new Set(sitesWithFloors());
export const hasFloors = (id) => FLOORED.has(id);
export const sitesFloored = () => [...FLOORED];

const byNumber = (a, b) => String(a.number ?? a.id).localeCompare(String(b.number ?? b.id), 'en', { numeric: true });
export const roomTitle = (s) => (s.number ? `${s.number} ${s.name}` : s.name);
const OPEN_STATES = ['new', 'in-progress', 'on-hold'];
export const OPEN_Q = `state=${OPEN_STATES.join(',')}`;

// Where each open incident is.
const openInc = incidentList.filter((v) => v.open).sort(byUrgency);
export const incidentsAt = (siteIds) => openInc.filter((v) => siteIds.includes(v.space.site));

// Who is on site today (the demo's today, as the Schedule has it): office days, and vendors at their project.
export function peopleAt(siteId, day = DEMO_TODAY) {
  return PEOPLE.filter((p) => { const w = whereIs(p.id, day); return w.kind === 'office' && w.place === siteId; });
}

// The three service lights for an office come from Services (serviceHealth, src/lib/services-view.mjs): the same
// simulation and rule as the service pages.
export function commsAt(siteId) {
  return commsRooms.filter((c) => c.site === siteId).sort(byNumber).map((space) => {
    const facts = commsFacts(space);
    const size = sizeFor(space, facts);
    const bad = size.rows.filter((r) => r.v.tone === 'bad');
    const unknown = size.rows.filter((r) => r.v.tone === 'faint' && r.id !== 'ups');
    const verdict = bad.length ? { tone: 'bad', text: `Short: ${bad.map((r) => r.name.toLowerCase()).join(', ')}` }
      : unknown.length === size.rows.length - 1 ? { tone: 'off', text: 'Not recorded' }
      : { tone: 'ok', text: 'Enough for the spaces it serves' };
    return { space, facts, size, verdict, pill: standardPill(space), racks: racksIn(space.id), title: roomTitle(space), mdf: space.space_type === 'mdf' };
  });
}
const LIGHT_LABEL = { av: 'AV', network: 'Network', infrastructure: 'Infrastructure' };
const TONE_OF = { ok: 'ok', warn: 'warn', bad: 'bad', none: 'off' };
export function lightsFor(siteId) {
  const h = serviceHealth(siteId);
  // A light that names offline units or alerts opens the service for this office filtered to just those (so the count
  // the light promises is the count the page shows); a green or grey one opens the office's whole list.
  return SERVICE_ORDER.map((id) => {
    const n = h[id].n, status = n.offline ? 'offline' : n.alert ? 'alert' : '';
    return { id, label: LIGHT_LABEL[id], tone: TONE_OF[h[id].light], text: h[id].reason, to: `/services/${id}/?site=${siteId}${status ? `&status=${status}` : ''}` };
  });
}
export const LIGHT_WORD = { ok: 'Fine', warn: 'To review', bad: 'Problem', off: 'Not recorded' };

// The rooms at a site, by floor (floors in the site's order; rooms by number), without comms rooms.
export function floorsOf(siteId) {
  const s = sites[siteId];
  const rooms = Object.values(spaces).filter((x) => x.site === siteId).sort(byNumber);
  const list = (s.floors ?? []).map((f) => ({ id: String(f.id), name: f.name.replace(/:.*$/, ''), rooms: rooms.filter((r) => String(r.floor) === String(f.id)) }));
  const loose = rooms.filter((r) => !list.some((f) => f.id === String(r.floor)));
  if (loose.length) list.push({ id: 'other', name: 'Other spaces', rooms: loose });
  return list;
}

// One office, all a page needs.
export function office(siteId) {
  const s = sites[siteId];
  const comms = commsAt(siteId);
  const floors = floorsOf(siteId);
  const all = floors.flatMap((f) => f.rooms);
  const people = peopleAt(siteId);
  const inc = incidentsAt([siteId]);
  const prj = Object.values(projects).filter((p) => p.site === siteId && p.phase !== 'closed').sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const work = workBySite.get(siteId) ?? [];
  const twoWeeks = [...new Set([...nextTwoWeeks(work).values()].flat())];
  const visits = work.filter((w) => w.kind === 'visit');
  const vend = Object.values(vendors).filter((v) => (v.sites ?? []).includes(siteId));
  const tech = PEOPLE.filter((p) => p.roleId === 'tech' && p.site === siteId);
  const M = hasFloors(siteId) ? building(siteId) : null;
  return {
    id: siteId, s, region: s.region, comms, floors, rooms: all, people, inc, projects: prj, work, twoWeeks, visits, vendors: vend, tech, M,
    lights: lightsFor(siteId),
    peopleRooms: all.filter((r) => KIND(r) !== 'comms'),
    desks: all.filter((r) => KIND(r) === 'desks').reduce((n, r) => n + (r.count ?? 1), 0),
    units: all.reduce((n, r) => n + r.positions.reduce((k, p) => k + p.units.length, 0), 0),
  };
}

// A region's home offices: each one's room, owner and open incidents.
export function homeOffices(region) {
  const sid = HOME_SITE[region];
  const rooms = Object.values(spaces).filter((x) => x.site === sid).sort((a, b) => String(a.town ?? a.name).localeCompare(String(b.town ?? b.name)));
  const inc = incidentsAt([sid]);
  return {
    site: sid, s: sites[sid], inc,
    rooms: rooms.map((r) => ({ r, owner: PEOPLE.find((p) => p.base === r.id) ?? null, near: sites[r.near] ?? null, inc: inc.filter((v) => v.space.id === r.id), kits: r.positions.reduce((n, p) => n + p.units.length, 0) })),
  };
}

// The live simulation's model for some sites only (every site stays listed, so indexes still match).
export function liveModelFor(siteIds = null) {
  const m = lean(roomsModel(), ['id', 'n', 'cls', 'old', 'inc']);
  if (!siteIds) return m;
  const keep = new Set(siteIds.map((id) => SITE_ORDER.indexOf(id)));
  const full = roomsModel();
  const unitIdx = new Map();
  const units = [];
  full.units.forEach((u, i) => { if (keep.has(u.site)) { unitIdx.set(i, units.length); units.push(m.units[i]); } });
  const rooms = full.rooms.map((r, i) => ({ r, i })).filter(({ r }) => keep.has(r.site)).map(({ i }) => ({ ...m.rooms[i], units: (m.rooms[i].units ?? []).map((k) => unitIdx.get(k)).filter((k) => k != null) }));
  return { ...m, units, rooms };
}

// A small plan of an office's first floor for a card: the outline and the rooms, north up, no words.
export function planThumb(siteId) {
  if (!hasFloors(siteId)) return null;
  const M = building(siteId);
  const F = M.floors[0];
  const W = Math.max(...F.outline.map((p) => p[0])), H = Math.max(...F.outline.map((p) => p[1]));
  const Y = (y) => H - y;
  return {
    W, H, floor: F.name, more: M.floors.length - 1,
    outline: F.outline.map(([x, y]) => `${x},${Y(y)}`).join(' '),
    rooms: Object.values(M.rooms).filter((r) => r.floor === F.id && r.rect).map((r) => ({ id: r.id, x: r.rect[0], y: Y(r.rect[3]), w: r.rect[2] - r.rect[0], h: r.rect[3] - r.rect[1], comms: ['mdf', 'idf'].includes(r.space_type) })),
  };
}

export const officeHref =(id) => href(`/locations/${id}/`);
export const INC_WORD = INC_STATE;
