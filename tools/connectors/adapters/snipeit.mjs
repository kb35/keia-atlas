// Snipe-IT export importer: its REST API JSON, saved to a file (docs/connectors/snipeit.md).
//
// Snipe-IT is an open-source asset register. Its API (/api/v1/) returns lists as { "total": n, "rows": [ ... ] }.
// This adapter reads saved responses, so it works offline and in CI. It never calls Snipe-IT.
//
// The file is either
//   - one saved list: { "total": ..., "rows": [ ... ] } (assets unless its rows look like locations), or
//   - several saved together: { "locations": ..., "hardware": ... }, each a list, or an array of lists (every page).
//     An optional "instance" names the Snipe-IT host, for links back to each asset.
//
// What becomes what (canonical model v1, docs/connectors/model.md):
//   locations -> space (one with no parent is a site; one with places inside it a floor; the rest rooms)
//   hardware  -> unit, with the asset register's own facts: purchase date, warranty end, supplier
//
// Privacy: an asset's "checked out to" can name a person. Keia keeps no people, so when it does, it is emptied in raw
// and listed in raw_redacted, and the asset is not placed anywhere (a person's whereabouts are not an asset's). The
// same goes for the person who created a record and a location's manager. A location's street address, postcode,
// phone and fax are emptied too: a home office is a town and a country, never an address.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineAdapter, mapStatus, text } from '../adapter.mjs';

// Snipe-IT's status meta (what the label means), in Keia's lifecycle words. Pending and undeployable (broken, out for
// repair) keep only the label's own name.
const STATUS = { deployed: 'manage', deployable: 'spare', archived: 'retire' };
const LOCATION_PRIVATE = ['address', 'address2', 'zip', 'phone', 'fax', 'manager'];
const PERSON_FIELDS = ['created_by', 'updated_by', 'deleted_by', 'checked_out_by'];
const PRIVACY = 'Snipe-IT names a person (checked out to, created by or a manager), so that value was emptied in raw: Keia keeps no people. See docs/connectors/snipeit.md.';

const isList = (v) => v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.rows);
const pagesOf = (v) => (isList(v) ? [v] : Array.isArray(v) && v.length && v.every(isList) ? v : null);
const day = (v) => {
  const d = typeof v === 'object' && v ? v.date ?? v.datetime : v;
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : undefined;
};
const looksLikeLocation = (o) => o && ('parent' in o || 'children' in o || 'assets_count' in o) && !('asset_tag' in o);

function open(file) {
  const where = path.basename(file);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const found = { location: [], asset: [] };
  const problems = [];
  const warnings = [];
  const take = (v, name, as) => {
    const pages = pagesOf(v);
    if (!pages) { problems.push(`${where}: "${name}" should be a Snipe-IT list: { "total": ..., "rows": [...] }`); return; }
    const rows = pages.flatMap((p) => p.rows);
    const total = pages.find((p) => typeof p.total === 'number')?.total;
    if (typeof total === 'number' && total > rows.length) warnings.push(`${where}: ${name} holds ${rows.length} of ${total}. Snipe-IT pages its lists (limit and offset): save every page.`);
    for (const o of rows) {
      if (o?.id === undefined || o?.id === null) { problems.push(`${where}: a row in ${name} has no id`); continue; }
      found[as ?? (looksLikeLocation(o) ? 'location' : 'asset')].push(o);
    }
  };
  let instance;
  if (pagesOf(data)) take(data, 'the list');
  else if (data && typeof data === 'object') {
    instance = text(data.instance);
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('_') || k === 'instance') continue;
      if (k === 'locations') take(v, k, 'location');
      else if (k === 'hardware' || k === 'assets') take(v, k, 'asset');
      else warnings.push(`${where}: "${k}" is not a list Keia reads yet, so it was skipped`);
    }
  } else problems.push(`${where}: expected a Snipe-IT list or an object of them`);
  const withChildren = new Set(found.location.map((l) => l.parent?.id).filter((x) => x != null));
  return { file, instance, found, withChildren, problems, warnings };
}

function list(source, kind) {
  if (kind === 'space') return source.found.location.map((o) => ({ type: 'location', o, src: source }));
  if (kind === 'unit') return source.found.asset.map((o) => ({ type: 'hardware', o, src: source }));
  return [];
}

function get(source, kind, key) {
  return list(source, kind).find((n) => `${n.type}/${n.o.id}` === key);
}

// A copy of the native record with people and private addresses emptied, and the paths that were.
function withoutPeople(o, fields, { assigned = false } = {}) {
  const raw = structuredClone(o);
  const redacted = [];
  for (const f of fields) {
    if (raw[f] !== undefined && raw[f] !== null && raw[f] !== '') {
      raw[f] = null;
      redacted.push(f);
    }
  }
  if (assigned && raw.assigned_to && raw.assigned_to.type !== 'location' && raw.assigned_to.type !== 'asset') {
    raw.assigned_to = null;
    redacted.push('assigned_to');
  }
  return { raw, redacted };
}

function map(kind, { type, o, src }, ctx) {
  const url = src.instance ? `https://${src.instance}/${type === 'location' ? 'locations' : 'hardware'}/${o.id}` : undefined;
  const source = { record_id: `${type}/${o.id}`, url };
  if (type === 'location') {
    const { raw, redacted } = withoutPeople(o, LOCATION_PRIVATE);
    if (redacted.includes('manager')) ctx.warn(PRIVACY);
    const parent = o.parent?.id != null ? ctx.idFor('location', o.parent.id) : undefined;
    const country = text(o.country)?.toUpperCase();
    return {
      id: ctx.idFor('location', o.id),
      name: text(o.name) ?? `location ${o.id}`,
      level: !parent ? 'site' : src.withChildren.has(o.id) ? 'floor' : 'room',
      parent,
      country: /^[A-Z]{2}$/.test(country ?? '') ? country : undefined,
      atlas_site: parent ? undefined : ctx.matchSite(o.name, o.city),
      source,
      raw,
      redacted,
    };
  }
  const { raw, redacted } = withoutPeople(o, PERSON_FIELDS, { assigned: true });
  const toPerson = redacted.includes('assigned_to');
  if (redacted.length) ctx.warn(PRIVACY);
  const manufacturer = text(o.manufacturer?.name);
  const model = text(o.model?.name);
  // Where it is: the place it is checked out to, else its location, else (when not checked out at all) where it
  // goes back to. An asset with a person is not placed.
  const place = o.assigned_to?.type === 'location' ? o.assigned_to : toPerson ? undefined : o.location ?? (o.assigned_to ? undefined : o.rtd_location);
  return {
    id: ctx.idFor('asset', o.id),
    name: text(o.name) ?? text(o.asset_tag) ?? `asset ${o.id}`,
    manufacturer,
    model,
    serial: text(o.serial),
    asset_tag: text(o.asset_tag),
    status: mapStatus(STATUS, o.status_label?.status_meta),
    status_native: text(o.status_label?.name),
    category_native: text(o.category?.name),
    space: place?.id != null ? ctx.idFor('location', place.id) : undefined,
    purchased_on: day(o.purchase_date),
    warranty_ends: day(o.warranty_expires),
    supplier: text(o.supplier?.name),
    model_id: ctx.matchModel(manufacturer, model),
    source,
    raw,
    redacted,
  };
}

export default defineAdapter({
  manifest: {
    id: 'snipeit',
    name: 'Snipe-IT export importer',
    description: "Locations and assets, with purchase dates, warranties and suppliers, from Snipe-IT's API JSON saved to a file. Keeps no people. Reads a file; calls nothing.",
    version: '0.1.0',
    tier: 'community',
    owner: 'Keia Atlas maintainers',
    system: 'snipeit',
    reads: 'file',
    objects: {
      space: { actions: ['read'], fields: { name: 'source', level: 'source', parent: 'source', country: 'source', atlas_site: 'keia' } },
      unit: {
        actions: ['read'],
        fields: {
          name: 'source', manufacturer: 'source', model: 'source', serial: 'source', asset_tag: 'source', status: 'source', status_native: 'source',
          category_native: 'source', space: 'source', purchased_on: 'source', warranty_ends: 'source', supplier: 'source', model_id: 'keia',
        },
      },
    },
    events: { mode: 'file' },
    rate: { requests_per_minute: 0, note: 'Reads a saved export. A live adapter would page /api/v1/hardware with limit and offset under Snipe-IT\'s API throttle, with a read-only token from the vault.' },
    hosts: [],
    credentials: [],
  },
  open,
  list,
  get,
  map,
});
