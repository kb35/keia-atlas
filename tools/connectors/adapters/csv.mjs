// Spreadsheet importer: units and spaces from a CSV file (docs/connectors/README.md).
//
// Most teams start with a spreadsheet: one row per device, with columns for where it is. Save the sheet as
// CSV (comma, semicolon or tab separated; Excel's "CSV UTF-8" is ideal) and run
//
//   npm run connect -- csv my-devices.csv            (shows what would change)
//   npm run connect -- csv my-devices.csv --apply    (writes data/connected/spreadsheet/)
//
// Columns are matched by name, in any order and any case; the names each field accepts are in COLUMNS below.
// The location columns (Site, Building, Floor, Room) become connected spaces, nested in that order, and each
// unit is placed in the deepest one its row names. A row whose Kind column says "space" describes a place
// with no device (its time zone, country, status).
//
// Each unit's record id is the ID column if there is one, else the asset tag, else the serial, else the name.
// Keep that column stable: it is how the next import finds the same unit again.
//
// Columns the importer does not know are kept in raw, not dropped. A column that looks like a secret
// (password, token, key) is emptied on the way in: keep secrets in the vault.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineAdapter, mapStatus, slug } from '../adapter.mjs';

// Field -> the column names it accepts (compared lower case, with spaces and punctuation as "_").
export const COLUMNS = {
  kind: ['kind', 'record', 'record_kind'],
  id: ['id', 'record_id', 'key'],
  site: ['site', 'office', 'campus', 'location'],
  building: ['building'],
  floor: ['floor', 'level', 'storey'],
  room: ['room', 'space', 'room_name', 'space_name'],
  room_number: ['room_number', 'room_no', 'number'],
  name: ['name', 'hostname', 'host_name', 'device_name', 'device', 'label'],
  manufacturer: ['manufacturer', 'make', 'brand'],
  model: ['model', 'model_name', 'product'],
  serial: ['serial', 'serial_number', 'serial_no', 'sn', 's_n'],
  asset_tag: ['asset_tag', 'asset', 'asset_number', 'asset_no', 'tag'],
  status: ['status', 'state', 'lifecycle', 'lifecycle_status'],
  category: ['category', 'type', 'device_type', 'class', 'role'],
  firmware: ['firmware', 'firmware_version', 'fw', 'software_version'],
  url: ['url', 'link'],
  time_zone: ['time_zone', 'timezone', 'tz'],
  country: ['country', 'country_code'],
};

const UNIT_STATUS = {
  ordered: 'plan', 'on order': 'plan', planned: 'plan', plan: 'plan',
  procured: 'procure', received: 'procure', delivered: 'procure', procure: 'procure',
  spare: 'spare', 'in stock': 'spare', stock: 'spare', 'in store': 'spare', inventory: 'spare',
  'being installed': 'deploy', installing: 'deploy', staged: 'deploy', commissioning: 'deploy', deploy: 'deploy',
  'in service': 'manage', 'in use': 'manage', active: 'manage', live: 'manage', deployed: 'manage', production: 'manage', manage: 'manage',
  retired: 'retire', decommissioned: 'retire', disposed: 'retire', removed: 'retire', retire: 'retire',
};
const SPACE_STATUS = {
  planned: 'planned', 'being installed': 'being-installed', 'fit out': 'being-installed', 'fit-out': 'being-installed',
  'being replaced': 'being-replaced', refresh: 'being-replaced', refurbishment: 'being-replaced',
  'in service': 'in-service', 'in use': 'in-service', active: 'in-service', open: 'in-service', live: 'in-service',
  closed: 'closed', retired: 'closed', decommissioned: 'closed',
};

// ---- CSV reading (RFC 4180: quotes, doubled quotes, commas and line breaks inside quotes) ----

export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  // The separator is whichever of , ; or tab appears most in the first line outside quotes.
  const first = src.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
  const sep = [',', ';', '\t'].map((c) => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const records = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else { if (ch === '\n') line += 1; cell += ch; }
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      records.push({ line: startLine, cells: row });
      row = []; cell = ''; line += 1; startLine = line;
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); records.push({ line: startLine, cells: row }); }
  const nonEmpty = records.filter((r) => r.cells.some((c) => c.trim() !== ''));
  const [head, ...rows] = nonEmpty;
  return { separator: sep, header: (head?.cells ?? []).map((h) => h.trim()), rows };
}

const norm = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// ---- Turning rows into units and the spaces they sit in ----

function open(file) {
  const text = readFileSync(file, 'utf8');
  const { header, rows } = parseCsv(text);
  const problems = [];
  const warnings = [];
  const where = path.basename(file);
  if (!header.length) problems.push(`${where}: the file is empty`);

  // Which column holds which field.
  const col = {};
  const used = new Set();
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [field, names] of Object.entries(COLUMNS)) {
      if (col[field] === undefined && names.includes(n)) { col[field] = i; used.add(i); break; }
    }
  });
  const unknown = header.filter((h, i) => !used.has(i) && h !== '');
  if (unknown.length) warnings.push(`${where}: columns kept in raw only (no Keia field yet): ${unknown.join(', ')}`);
  if (col.site === undefined && col.room !== undefined) problems.push(`${where}: a Room column needs a Site column too, so rooms at two sites with the same name stay apart`);

  const spaces = new Map(); // path key -> space native
  const units = [];
  const seenKeys = new Map();

  const addSpace = (level, parts, parentKey, name) => {
    const key = parts.join(' / ');
    const parent = parentKey ? spaces.get(parentKey) : undefined;
    if (!spaces.has(key)) spaces.set(key, { type: 'space', level, key, parts, parent: parent && { level: parent.level, parts: parent.parts }, name, attrs: {}, raw: { [level]: name, path: key } });
    return spaces.get(key);
  };

  for (const r of rows) {
    const get = (f) => (col[f] === undefined ? undefined : (r.cells[col[f]] ?? '').trim() || undefined);
    const raw = Object.fromEntries(header.map((h, i) => [h || `column ${i + 1}`, r.cells[i] ?? '']));
    const kind = (get('kind') ?? 'unit').toLowerCase();
    if (!['unit', 'device', 'space', 'room'].includes(kind)) {
      problems.push(`${where} line ${r.line}: Kind "${get('kind')}" is not unit or space`);
      continue;
    }

    // The place this row names, outermost first.
    const site = get('site');
    const building = get('building');
    const floor = get('floor');
    const room = get('room');
    let deepest;
    if (site) {
      const parts = [site];
      deepest = addSpace('site', [...parts], undefined, site);
      if (building) { parts.push(`building ${building}`); deepest = addSpace('building', [...parts], deepest.key, building); }
      if (floor) { parts.push(`floor ${floor}`); deepest = addSpace('floor', [...parts], deepest.key, /^\d+$/.test(floor) ? `Floor ${floor}` : floor); }
      if (room) {
        parts.push(`room ${room}`);
        deepest = addSpace('room', [...parts], deepest.key, room);
        if (get('room_number')) deepest.attrs.code = get('room_number');
      }
    } else if (building || floor) {
      problems.push(`${where} line ${r.line}: a Building or Floor needs a Site`);
    }

    if (kind === 'space' || kind === 'room') {
      if (!deepest) { problems.push(`${where} line ${r.line}: a space row needs at least a Site`); continue; }
      deepest.raw = raw;
      deepest.line = r.line;
      for (const f of ['time_zone', 'country', 'status', 'category', 'url']) if (get(f)) deepest.attrs[f] = get(f);
      continue;
    }

    const key = get('id') ?? get('asset_tag') ?? get('serial') ?? get('name');
    if (!key) {
      problems.push(`${where} line ${r.line}: a unit needs an ID, asset tag, serial or name, so the next import can find it again`);
      continue;
    }
    if (!slug(key)) {
      problems.push(`${where} line ${r.line}: "${key}" has no letters or digits to make an id from`);
      continue;
    }
    if (seenKeys.has(key)) {
      problems.push(`${where} line ${r.line}: "${key}" is already on line ${seenKeys.get(key)}; each unit needs its own ID, asset tag or serial`);
      continue;
    }
    seenKeys.set(key, r.line);
    const fields = Object.fromEntries(Object.keys(COLUMNS).map((f) => [f, get(f)]));
    units.push({ type: 'unit', key, line: r.line, fields, space: deepest && { level: deepest.level, parts: deepest.parts }, raw });
  }
  return { file, instance: where, spaces: [...spaces.values()], units, problems, warnings };
}

function list(source, kind) {
  return kind === 'unit' ? source.units : kind === 'space' ? source.spaces : [];
}

function get(source, kind, key) {
  return list(source, kind).find((n) => n.key === key);
}

function map(kind, native, ctx) {
  const spaceId = (s) => ctx.idFor(s.level, ...s.parts.map((p) => p.replace(/^(building|floor|room) /, '')));
  if (kind === 'space') {
    const s = native;
    const status = s.attrs.status;
    return {
      id: spaceId(s),
      name: s.name,
      level: s.level,
      code: s.attrs.code,
      parent: s.parent ? spaceId(s.parent) : undefined,
      status: mapStatus(SPACE_STATUS, status),
      status_native: status,
      category_native: s.attrs.category,
      time_zone: s.attrs.time_zone,
      country: s.attrs.country?.toUpperCase(),
      atlas_site: s.level === 'site' ? ctx.matchSite(s.name) : undefined,
      source: { record_id: s.key, url: s.attrs.url },
      raw: s.raw,
    };
  }
  const f = native.fields;
  return {
    id: ctx.idFor('unit', native.key),
    name: f.name ?? native.key,
    manufacturer: f.manufacturer,
    model: f.model,
    serial: f.serial,
    asset_tag: f.asset_tag,
    status: mapStatus(UNIT_STATUS, f.status),
    status_native: f.status,
    category_native: f.category,
    space: native.space ? spaceId(native.space) : undefined,
    firmware: f.firmware,
    model_id: ctx.matchModel(f.manufacturer, f.model),
    source: { record_id: native.key, url: f.url },
    raw: native.raw,
  };
}

export default defineAdapter({
  manifest: {
    id: 'csv',
    name: 'Spreadsheet importer',
    description: 'Units and spaces from a CSV export of a spreadsheet or asset register. Reads a file; calls nothing.',
    version: '0.1.0',
    tier: 'certified',
    owner: 'Keia Atlas maintainers',
    system: 'spreadsheet',
    reads: 'file',
    objects: {
      space: {
        actions: ['read'],
        fields: {
          name: 'source', level: 'source', code: 'source', parent: 'source', status: 'source', status_native: 'source',
          category_native: 'source', time_zone: 'source', country: 'source', atlas_site: 'keia',
        },
      },
      unit: {
        actions: ['read'],
        fields: {
          name: 'source', manufacturer: 'source', model: 'source', serial: 'source', asset_tag: 'source', status: 'source',
          status_native: 'source', category_native: 'source', space: 'source', firmware: 'source', model_id: 'keia',
        },
      },
    },
    events: { mode: 'file' },
    rate: { requests_per_minute: 0, note: 'Reads a file on disk.' },
    hosts: [],
    credentials: [],
  },
  open,
  list,
  get,
  map,
});
