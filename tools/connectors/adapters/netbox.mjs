// NetBox export importer: sites, locations, racks and devices from NetBox's REST API JSON (docs/connectors/README.md).
//
// NetBox (https://netboxlabs.com/docs/netbox/) is the open-source source of truth many network teams keep for
// sites, racks and devices. This adapter reads what its REST API returns, saved to a file, so it works offline
// and in CI. It never calls NetBox itself.
//
// The file is either
//   - one list response saved as it came:  { "count": 3, "next": null, "previous": null, "results": [ ... ] }
//     (the kind is read from each object's url: /api/dcim/sites/, /api/dcim/locations/, /api/dcim/racks/,
//     /api/dcim/devices/), or
//   - several saved together:  { "sites": <list response or array>, "locations": ..., "racks": ..., "devices": ... }
//
// Sites, locations and racks become connected spaces (a rack is a place units are mounted in); devices become
// connected units, placed in their rack, else their location, else their site. NetBox owns every value it
// sends; Keia owns the links it suggests to the Keia catalogue (atlas_site, model_id).
//
// Object shapes follow NetBox 4's API: nested objects carry id, url and display; choice fields carry
// { value, label }. NetBox 3's device_role is read where NetBox 4 says role.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineAdapter, mapStatus } from '../adapter.mjs';

const TYPES = { sites: 'site', locations: 'location', racks: 'rack', devices: 'device' };

// NetBox's status choices, in Keia's words. Anything else keeps only its native label.
const SITE_STATUS = { planned: 'planned', staging: 'being-installed', active: 'in-service', retired: 'closed' };
const RACK_STATUS = { planned: 'planned', active: 'in-service', available: 'in-service', deprecated: 'closed' };
const LOCATION_STATUS = SITE_STATUS;
// A device's status in NetBox mixes lifecycle and health; Keia's status is the lifecycle, so an offline or
// failed device is still in service (its native label shows what is wrong).
const DEVICE_STATUS = { planned: 'plan', inventory: 'spare', staged: 'deploy', active: 'manage', offline: 'manage', failed: 'manage', decommissioning: 'retire' };

const typeFromUrl = (u) => TYPES[String(u ?? '').match(/\/api\/dcim\/([a-z-]+)\/\d+\/?$/)?.[1]];
const results = (v) => (Array.isArray(v) ? v : Array.isArray(v?.results) ? v.results : null);
const choice = (v) => (v && typeof v === 'object' ? v.value : v);
const label = (v) => (v && typeof v === 'object' ? v.label ?? v.value : v) || undefined;
const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

// The page a person opens: display_url (NetBox 4.1 and later), else the API url without /api.
const link = (o) => o.display_url ?? (typeof o.url === 'string' ? o.url.replace('/api/', '/') : undefined);

function open(file) {
  const where = path.basename(file);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const found = { site: [], location: [], rack: [], device: [] };
  const problems = [];
  const warnings = [];

  const take = (list, from) => {
    for (const o of list) {
      const t = typeFromUrl(o?.url) ?? from;
      if (!t) { warnings.push(`${where}: skipped an object that is not a site, location, rack or device (${o?.url ?? o?.display ?? 'no url'})`); continue; }
      if (o?.id === undefined || o?.id === null) { problems.push(`${where}: a ${t} has no id (${o?.display ?? o?.name ?? '?'})`); continue; }
      found[t].push(o);
    }
  };
  const checkCount = (resp, name) => {
    const list = results(resp);
    if (resp && !Array.isArray(resp) && typeof resp.count === 'number' && list && resp.count > list.length) {
      warnings.push(`${where}: ${name} holds ${list.length} of ${resp.count}. NetBox pages its lists: export with ?limit=0, or follow "next" and save every page.`);
    }
  };

  if (results(data)) {
    checkCount(data, 'the list');
    take(results(data));
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (!TYPES[k]) { warnings.push(`${where}: "${k}" is not one of sites, locations, racks, devices, so it was skipped`); continue; }
      const list = results(v);
      if (!list) { problems.push(`${where}: "${k}" should be a list response or an array`); continue; }
      checkCount(v, k);
      take(list, TYPES[k]);
    }
  } else problems.push(`${where}: expected a NetBox list response or an object of them`);

  const any = [...found.site, ...found.location, ...found.rack, ...found.device].find((o) => typeof o.url === 'string');
  let instance;
  try { instance = any ? new URL(any.url).host : undefined; } catch { instance = undefined; }
  const parents = new Set(found.location.map((l) => l.parent?.id).filter((x) => x !== undefined && x !== null));
  return { file, instance, found, parents, problems, warnings };
}

const recordId = (type, o) => `${type}/${o.id}`;

function list(source, kind) {
  if (kind === 'space') return [...source.found.site.map((o) => ({ type: 'site', o })), ...source.found.location.map((o) => ({ type: 'location', o, floor: source.parents.has(o.id) })), ...source.found.rack.map((o) => ({ type: 'rack', o }))];
  if (kind === 'unit') return source.found.device.map((o) => ({ type: 'device', o }));
  return [];
}

function get(source, kind, key) {
  return list(source, kind).find((n) => recordId(n.type, n.o) === key);
}

// Where a location, rack or device sits: the deepest place NetBox names.
const placeOf = (ctx, o, { rack = true } = {}) =>
  rack && o.rack?.id != null ? ctx.idFor('rack', o.rack.id)
    : o.location?.id != null ? ctx.idFor('location', o.location.id)
      : o.site?.id != null ? ctx.idFor('site', o.site.id)
        : undefined;

function map(kind, { type, o, floor }, ctx) {
  const source = { record_id: recordId(type, o), url: link(o) };
  if (type === 'site') {
    return {
      id: ctx.idFor('site', o.id),
      name: o.name ?? o.display,
      level: 'site',
      code: text(o.facility) ?? text(o.slug),
      status: mapStatus(SITE_STATUS, choice(o.status)),
      status_native: label(o.status),
      category_native: text(o.group?.name),
      time_zone: text(o.time_zone),
      atlas_site: ctx.matchSite(o.slug, o.name, o.facility),
      source,
      raw: o,
    };
  }
  if (type === 'location') {
    return {
      id: ctx.idFor('location', o.id),
      name: o.name ?? o.display,
      // NetBox locations nest freely. One with locations inside it is read as a floor, one without as a room.
      level: floor ? 'floor' : 'room',
      code: text(o.facility),
      parent: o.parent?.id != null ? ctx.idFor('location', o.parent.id) : placeOf(ctx, o),
      status: mapStatus(LOCATION_STATUS, choice(o.status)),
      status_native: label(o.status),
      source,
      raw: o,
    };
  }
  if (type === 'rack') {
    return {
      id: ctx.idFor('rack', o.id),
      name: o.name ?? o.display,
      level: 'rack',
      code: text(o.facility_id),
      parent: placeOf(ctx, o, { rack: false }),
      status: mapStatus(RACK_STATUS, choice(o.status)),
      status_native: label(o.status),
      category_native: text(o.role?.name),
      size_u: Number.isInteger(o.u_height) ? o.u_height : undefined,
      source,
      raw: o,
    };
  }
  const manufacturer = text(o.device_type?.manufacturer?.name);
  const model = text(o.device_type?.model);
  const face = choice(o.face);
  return {
    id: ctx.idFor('device', o.id),
    name: text(o.name) ?? text(o.display) ?? `device ${o.id}`,
    manufacturer,
    model,
    serial: text(o.serial),
    asset_tag: text(o.asset_tag),
    status: mapStatus(DEVICE_STATUS, choice(o.status)),
    status_native: label(o.status),
    category_native: text((o.role ?? o.device_role)?.name),
    space: placeOf(ctx, o),
    position: typeof o.position === 'number' ? { u: o.position, ...(face === 'front' || face === 'rear' ? { face } : {}) } : undefined,
    firmware: text(o.custom_fields?.firmware) ?? text(o.custom_fields?.firmware_version),
    model_id: ctx.matchModel(manufacturer, model),
    source,
    raw: o,
  };
}

export default defineAdapter({
  manifest: {
    id: 'netbox',
    name: 'NetBox export importer',
    description: "Sites, locations, racks and devices from NetBox's REST API JSON, saved to a file. Reads a file; calls nothing.",
    version: '0.1.0',
    tier: 'certified',
    owner: 'Keia Atlas maintainers',
    system: 'netbox',
    reads: 'file',
    objects: {
      space: {
        actions: ['read'],
        fields: {
          name: 'source', level: 'source', code: 'source', parent: 'source', status: 'source', status_native: 'source',
          category_native: 'source', time_zone: 'source', size_u: 'source', atlas_site: 'keia',
        },
      },
      unit: {
        actions: ['read'],
        fields: {
          name: 'source', manufacturer: 'source', model: 'source', serial: 'source', asset_tag: 'source', status: 'source',
          status_native: 'source', category_native: 'source', space: 'source', position: 'source', firmware: 'source',
          model_id: 'keia',
        },
      },
    },
    events: { mode: 'file' },
    rate: { requests_per_minute: 0, note: 'Reads a saved export. A live NetBox adapter would page through /api/dcim/ with a read-only token from the vault.' },
    hosts: [],
    credentials: [],
  },
  open,
  list,
  get,
  map,
});
