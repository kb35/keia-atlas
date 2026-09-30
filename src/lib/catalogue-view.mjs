// The service catalogue as the pages show it, worked out once at build time from the site's data (rules in
// src/lib/catalogue.mjs). One model per new service, and one row per service for the Services index:
//   units     the units in scope, each with its simulated state (catalogue.mjs unitStatus), office and space
//   roll      health rolled up per office against the availability target
//   targets   every target with this month's figure (measured from the units, the licences, the privacy records or the
//             events; otherwise simulated) and whether it is kept
//   standard  the house standard it follows (data/standards/), or its own short one, marked as a house choice
//   extra     what only this service has: platforms and licences, the Wi-Fi networks, privacy records, calendars
// The three live services keep their own models (src/lib/services-view.mjs); the index reads their service levels.
import { spaces, sites, incidents, KIND, className, modelName, modelChoices, SITE_ORDER, href, DEMO_TODAY } from './data.mjs';
import { CATALOGUE, CATALOGUE_ORDER, NEW_SERVICES, LIVE_SERVICES, unitStatus, faultFor, rollUp, simulatedFigure, kept, targetWords, promiseWords, catalogueAnswer } from './catalogue.mjs';
import { SERVICES } from './services.mjs';
import { serviceLevels } from './experience.mjs';
import { licences, readRecords } from './capabilities-view.mjs';
import { PEOPLE } from './demo.mjs';
import { featureOn } from './modules.mjs';

export { CATALOGUE, CATALOGUE_ORDER, NEW_SERVICES, LIVE_SERVICES };

const STANDARDS = Object.fromEntries(readRecords('standards').filter((s) => s.id).map((s) => [s.id, s]));
const PRIVACY = readRecords('privacy');
const HOUSE = readRecords('house-values')[0] ?? {};
const person = (id) => PEOPLE.find((p) => p.id === id);
export const spaceTitle = (id) => { const s = spaces[id]; return s ? (s.number ? `${s.number} ${s.name}` : s.name) : id; };
export const placeName = (siteId) => sites[siteId]?.city ?? sites[siteId]?.name ?? siteId;
const openIncidentTags = new Set(Object.values(incidents).filter((i) => i.state !== 'resolved' && i.subject?.device).map((i) => i.subject.device));

// ---- Units in scope --------------------------------------------------------------------------------------------------
function inScope(svc, s, p) {
  const w = svc.where ?? {};
  if (w.kinds && !w.kinds.includes(KIND(s))) return false;
  if (w.spaceTypes && !w.spaceTypes.includes(s.space_type)) return false;
  if (svc.classes && !svc.classes.includes(p.cls)) return false;
  return true;
}
export function unitsOf(id) {
  const svc = CATALOGUE[id];
  const out = [];
  for (const s of Object.values(spaces)) {
    for (const p of s.positions) {
      const u = p.current;
      if (!u || u.stage === 'retire' || !p.cls || !inScope(svc, s, p)) continue;
      const model = u.model ?? p.model ?? null;
      const unit = { tag: u.asset_tag, cls: p.cls, key: p.key, role: p.role ?? className(p.cls), model, modelName: model ? modelName(model) : null, host: p.hostname ?? null, space: s.id, spaceName: spaceTitle(s.id), site: s.site, stage: u.stage };
      const fault = faultFor(id, unit);
      out.push({ ...unit, ...unitStatus(unit, { fault, incident: openIncidentTags.has(unit.tag) }), to: `/device/?tag=${encodeURIComponent(unit.tag)}` });
    }
  }
  return out.sort((a, b) => SITE_ORDER.indexOf(a.site) - SITE_ORDER.indexOf(b.site) || a.spaceName.localeCompare(b.spaceName) || a.tag.localeCompare(b.tag));
}

// ---- The service's own extras ------------------------------------------------------------------------------------------
function platformRows(units) {
  const byPool = licences.filter((l) => l.kind === 'meeting-room');
  const certified = (m) => (modelChoices[m]?.platforms ?? []).filter((x) => x.support === 'yes').map((x) => x.name);
  const names = new Map();
  for (const u of units) {
    const pool = byPool.find((l) => l.units.includes(u.tag));
    const name = pool?.platformLabel ?? 'No platform licence recorded';
    const row = names.get(name) ?? { name, units: 0, sites: new Set(), certified: new Set() };
    row.units++; row.sites.add(u.site); for (const c of certified(u.model)) row.certified.add(c);
    names.set(name, row);
  }
  return [...names.values()].map((r) => ({ ...r, sites: r.sites.size, certified: [...r.certified] })).sort((a, b) => b.units - a.units);
}
function wifiNetworks() {
  const sec = STANDARDS.wifi?.sections?.find((x) => x.id === 'networks');
  return (sec?.table?.rows ?? []).map(([name, security, vlan, bands, forWho]) => ({ name, security, vlan, bands, forWho }));
}
function privacyFor(classes, siteIds) {
  return PRIVACY.filter((r) => r.covers.classes.some((c) => classes.includes(c)) && r.covers.sites.some((s) => siteIds.includes(s)))
    .map((r) => ({ name: r.name, sites: r.covers.sites.map((s) => placeName(s)), captures: r.captures, identifies: r.identifies_people, counted: r.occupancy?.counted ?? false, min: r.occupancy?.min_group_size ?? null, perPerson: r.occupancy?.per_person_views ?? false, retention: r.retention, never: r.never ?? [] }));
}
function calendarRows() {
  const bookable = Object.values(spaces).filter((s) => s.type?.keia_atlas?.bookable && s.site && !sites[s.site]?.kind?.startsWith('remote'));
  const withPanel = bookable.filter((s) => s.positions.some((p) => p.cls === 'scheduler-panel' && p.current));
  return { bookable: bookable.length, panels: withPanel.length, linked: bookable.length };
}

// ---- Targets -------------------------------------------------------------------------------------------------------------
function targetRows(id, roll, extra) {
  const svc = CATALOGUE[id];
  return svc.targets.map((t) => {
    let v = null, how = 'Simulated';
    if (t.from === 'units') { v = roll.sites.length ? Math.min(...roll.sites.map((s) => s.share)) : 100; how = 'From the units, the lowest office'; }
    else if (t.from === 'licences') { const pools = licences.filter((l) => l.kind === 'meeting-room'); v = pools.length ? (pools.filter((l) => !l.short).length / pools.length) * 100 : 100; how = 'From the licence pools'; }
    else if (t.from === 'calendar') { v = extra.calendar ? (extra.calendar.linked / Math.max(1, extra.calendar.bookable)) * 100 : 100; how = 'Simulated from the room booking system'; }
    else if (t.from === 'privacy') { v = 100; how = 'From the privacy records (the validator checks every sensing unit is covered)'; }
    else if (t.from === 'events' || t.from === 'reports') { v = extra.events?.[t.id] ?? null; how = 'From the events\' records'; }
    else v = simulatedFigure(id, t);
    return { ...t, value: v, words: targetWords(t, v), promise: promiseWords(t), kept: kept(t, v), how };
  });
}

// ---- One service --------------------------------------------------------------------------------------------------------
const cache = new Map();
export function catalogueModel(id, extraIn = {}) {
  if (cache.has(id)) return cache.get(id);
  const svc = CATALOGUE[id];
  const units = unitsOf(id);
  const avail = svc.targets.find((t) => t.from === 'units');
  const roll = rollUp(units, avail.target);
  const siteIds = [...new Set(units.map((u) => u.site))];
  const extra = { ...extraIn };
  if (id === 'collaboration') extra.platforms = platformRows(units);
  if (id === 'collaboration') extra.licences = licences.filter((l) => l.kind === 'meeting-room');
  if (id === 'wifi') extra.networks = wifiNetworks();
  if (id === 'security') extra.privacy = privacyFor(['security-device'], siteIds);
  if (id === 'building') extra.privacy = privacyFor(['video-bar', 'camera', 'codec', 'desk-video-device', 'microphone'], SITE_ORDER);
  if (id === 'booking') extra.calendar = calendarRows();
  if (id === 'signage' || id === 'collaboration') extra.platformsHouse = (HOUSE.platforms ?? []).map((p) => p.name);
  const targets = targetRows(id, roll, extra);
  const within = targets.every((t) => t.kept);
  const std = svc.standard.id ? STANDARDS[svc.standard.id] : null;
  const standard = std
    ? { house: false, id: std.id, name: std.name, summary: std.summary, rules: std.sections.flatMap((s) => s.rules).length, owner: std.owner, to: `/standards/${std.id}/`, sample: std.sections.flatMap((s) => s.rules).slice(0, 4).map((r) => [r.rule, r.why]) }
    : { house: true, name: svc.standard.name, summary: svc.standard.summary, rules: svc.standard.rules.length, sample: svc.standard.rules };
  // The groups on the service map, each with its units' worst state.
  const groups = svc.map.groups.map((g) => {
    const mine = g.classes ? units.filter((u) => g.classes.includes(u.cls)) : g.keys ? units.filter((u) => g.keys.includes(u.key)) : g.units ? units : [];
    const off = mine.filter((u) => u.st === 'offline').length, al = mine.filter((u) => u.st === 'alert').length;
    return { ...g, n: mine.length, off, al, state: off ? 'fault' : al ? 'review' : 'fine' };
  });
  const kinds = [...new Set(units.map((u) => u.role))].map((r) => ({ label: r, n: units.filter((u) => u.role === r).length })).sort((a, b) => b.n - a.n);
  const model = {
    id, svc, owner: person(svc.owner), units, roll, siteIds, kinds, targets, within, standard, groups, extra,
    sites: roll.sites.map((s) => ({ ...s, name: sites[s.site]?.name ?? s.site, city: placeName(s.site), remote: sites[s.site]?.kind === 'remote' })).sort((a, b) => SITE_ORDER.indexOf(a.site) - SITE_ORDER.indexOf(b.site)),
    notWorking: units.filter((u) => u.st !== 'online').sort((a, b) => (a.st === 'offline' ? 0 : 1) - (b.st === 'offline' ? 0 : 1)),
  };
  cache.set(id, model);
  return model;
}

/** The answer a new service's page leads with: "Below target in London: 1 printer offline", "Within target · 214 working". */
export function serviceAnswer(m) {
  const w = m.svc.word;
  if (!m.units.length) return 'Nothing in this service is recorded yet';
  if (m.roll.below.length) {
    const s = m.roll.sites.find((x) => x.site === m.roll.below[0]);
    return `Below target in ${m.roll.below.map(placeName).join(' and ')}: ${s.offline} ${s.offline === 1 ? w[0] : w[1]} of ${s.all} not working`;
  }
  const off = m.targets.filter((t) => !t.kept);
  if (off.length) return `Below target: ${off[0].what.toLowerCase()}`;
  const al = m.roll.alert;
  return `Within target · ${m.roll.working.toLocaleString('en-IE')} of ${m.roll.all.toLocaleString('en-IE')} ${w[1]} working${al ? `, ${al} with an alert` : ''}`;
}

// ---- The index: every service, answer first ----------------------------------------------------------------------------
/** One row per service in catalogue order: { id, name, path, owner, capability, within, below, line, n, word }.
    `events` carries the Events service's own figures (events-view.mjs), so this file does not load events. */
export function catalogueRows({ liveUnits = {}, eventsExtra = {} } = {}) {
  return CATALOGUE_ORDER.map((id) => {
    if (LIVE_SERVICES.includes(id)) {
      const s = SERVICES[id], lv = serviceLevels(id);
      const keptN = lv.filter((r) => r.kept).length;
      return { id, name: s.name === 'AV' ? 'AV' : s.title, path: s.path, owner: person(s.owner), capability: null, live: true, within: keptN === lv.length, below: [], line: `${keptN} of ${lv.length} promises kept this month`, n: liveUnits[id] ?? null, word: id === 'av' ? 'units' : 'items' };
    }
    const m = catalogueModel(id, id === 'events' ? { events: eventsExtra } : {});
    return { id, name: m.svc.name, short: m.svc.short ?? m.svc.name, path: `/services/${id}/`, owner: m.owner, ownedBy: m.svc.ownedBy ?? null, capability: m.svc.capability, live: false, within: m.within, below: m.roll.below, line: serviceAnswer(m), n: m.units.length, word: m.svc.word[1], state: m.within ? 'fine' : m.roll.offline ? 'fault' : 'review' };
  });
}
export const indexAnswer = (rows) => catalogueAnswer(rows.filter((r) => !r.capability || featureOn(r.capability)), placeName);
export { href, DEMO_TODAY };
