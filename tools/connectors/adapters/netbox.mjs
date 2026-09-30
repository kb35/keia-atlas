// NetBox export importer: NetBox's REST API JSON, saved to a file (docs/connectors/netbox.md).
//
// NetBox (https://netboxlabs.com/docs/netbox/) is the open-source source of truth many network teams keep for sites,
// racks, devices, cabling and addresses. This adapter reads what its REST API returns, saved to a file, so it works
// offline and in CI. It never calls NetBox itself.
//
// The file is either
//   - one list response saved as it came:  { "count": 3, "next": null, "previous": null, "results": [ ... ] }
//     (the kind is read from each object's url: /api/dcim/devices/42/, /api/ipam/vlans/7/ ...), or
//   - several saved together:  { "sites": ..., "devices": ..., "interfaces": ..., "cables": ..., "vlans": ... },
//     each a list response, an array of objects, or an array of list responses (every page of a long list).
//
// What becomes what (canonical model v1, docs/connectors/model.md):
//   sites, locations, racks                     -> space
//   devices                                     -> unit
//   interfaces, front and rear ports, console
//   and console server ports, power ports and
//   power outlets                               -> port
//   cables                                      -> connection (port to port; other ends kept in their own words)
//   VLANs (with their VLAN group), prefixes,
//   IP ranges, wireless LANs                    -> network
//   IP addresses                                -> address
//   virtual chassis                             -> group (a stack)
// VLAN groups are read to name each VLAN's group and site; they are not records of their own.
//
// NetBox owns every value it sends; Keia owns the links it suggests to the Keia catalogue (atlas_site, model_id).
// Object shapes follow NetBox 4's API: nested objects carry id, url and display; choice fields, and from 4.7
// choice-type custom fields, carry { value, label }. NetBox 3's device_role is read where NetBox 4 says role.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineAdapter, mapStatus, normMac, containingPrefix, ipHost } from '../adapter.mjs';

// The list names NetBox's API uses, and the object type each holds.
const TYPES = {
  sites: 'site', locations: 'location', racks: 'rack', devices: 'device',
  interfaces: 'interface', 'front-ports': 'front-port', 'rear-ports': 'rear-port', 'console-ports': 'console-port',
  'console-server-ports': 'console-server-port', 'power-ports': 'power-port', 'power-outlets': 'power-outlet',
  cables: 'cable', 'virtual-chassis': 'virtual-chassis',
  'vlan-groups': 'vlan-group', vlans: 'vlan', prefixes: 'prefix', 'ip-ranges': 'ip-range', 'ip-addresses': 'ip-address',
  'wireless-lans': 'wireless-lan',
};
const PORT_TYPES = ['interface', 'front-port', 'rear-port', 'console-port', 'console-server-port', 'power-port', 'power-outlet'];
// A cable end's object type, as NetBox names it, to the port type above.
const END_TYPES = {
  'dcim.interface': 'interface', 'dcim.frontport': 'front-port', 'dcim.rearport': 'rear-port', 'dcim.consoleport': 'console-port',
  'dcim.consoleserverport': 'console-server-port', 'dcim.powerport': 'power-port', 'dcim.poweroutlet': 'power-outlet',
};
const END_WORDS = { 'dcim.powerfeed': 'Power feed', 'circuits.circuittermination': 'Circuit termination', 'circuits.providernetwork': 'Provider network' };

// NetBox's status choices, in Keia's words. Anything else keeps only its native label.
const SITE_STATUS = { planned: 'planned', staging: 'being-installed', active: 'in-service', retired: 'closed' };
const RACK_STATUS = { planned: 'planned', active: 'in-service', available: 'in-service', deprecated: 'closed' };
const LOCATION_STATUS = SITE_STATUS;
// A device's status in NetBox mixes lifecycle and health; Keia's status is the lifecycle, so an offline or
// failed device is still in service (its native label shows what is wrong).
const DEVICE_STATUS = { planned: 'plan', inventory: 'spare', staged: 'deploy', active: 'manage', offline: 'manage', failed: 'manage', decommissioning: 'retire' };
// Networks, addresses, cables and wireless LANs: a container prefix, a DHCP or SLAAC address keep their own word too.
const NET_STATUS = { active: 'in-service', reserved: 'reserved', deprecated: 'retired' };
const ADDRESS_STATUS = { active: 'in-service', reserved: 'reserved', deprecated: 'retired', dhcp: 'in-service', slaac: 'in-service' };
const CABLE_STATUS = { connected: 'in-service', planned: 'planned', decommissioning: 'retired' };
const MODES = { access: 'access', tagged: 'tagged', 'tagged-all': 'tagged-all' };
// NetBox's cable types, in the words the demo's cable records use.
const MEDIUM = {
  cat5e: 'cat5e', cat6: 'cat6', cat6a: 'cat6a', cat7: 'cat7', cat7a: 'cat7', cat8: 'cat8',
  'mmf-om3': 'fibre-om3', 'mmf-om4': 'fibre-om4', 'mmf-om5': 'fibre-om5', 'smf-os1': 'fibre-os1', 'smf-os2': 'fibre-os2',
  mmf: 'fibre-mm', smf: 'fibre-sm', 'dac-active': 'dac', 'dac-passive': 'dac', aoc: 'aoc', coaxial: 'coax', power: 'power',
};
const TO_METRES = { km: 1000, m: 1, cm: 0.01, mi: 1609.344, ft: 0.3048, in: 0.0254 };

const typeFromUrl = (u) => TYPES[String(u ?? '').match(/\/api\/(?:dcim|ipam|wireless)\/([a-z-]+)\/\d+\/?$/)?.[1]];
const isList = (v) => v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.results);
// Every page of a list: one list response, an array of objects, or an array of list responses.
const pagesOf = (v) => (isList(v) ? [v] : Array.isArray(v) && v.length && v.every(isList) ? v : null);
const results = (v) => {
  const pages = pagesOf(v);
  if (pages) return pages.flatMap((p) => p.results);
  return Array.isArray(v) ? v : null;
};
const choice = (v) => (v && typeof v === 'object' ? v.value : v);
const label = (v) => (v && typeof v === 'object' ? v.label ?? v.value : v) || undefined;
const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : typeof v === 'number' ? String(v) : undefined);
// A custom field's value. From NetBox 4.7 a choice-type custom field arrives as { value, label }; a multiple choice
// as a list of them. Read the value either way.
const cfText = (cf, ...names) => {
  for (const n of names) {
    const v = cf?.[n];
    const one = Array.isArray(v) ? v.map(choice).filter((x) => text(x)).join(', ') : choice(v);
    if (text(one)) return text(one);
  }
  return undefined;
};

// The page a person opens: display_url (NetBox 4.1 and later), else the API url without /api.
const link = (o) => o.display_url ?? (typeof o.url === 'string' ? o.url.replace('/api/', '/') : undefined);

function open(file) {
  const where = path.basename(file);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const found = Object.fromEntries(Object.values(TYPES).map((t) => [t, []]));
  const problems = [];
  const warnings = [];

  const take = (list, from) => {
    for (const o of list) {
      const t = typeFromUrl(o?.url) ?? from;
      if (!t) { warnings.push(`${where}: skipped an object Keia does not read yet (${o?.url ?? o?.display ?? 'no url'})`); continue; }
      if (o?.id === undefined || o?.id === null) { problems.push(`${where}: a ${t} has no id (${o?.display ?? o?.name ?? '?'})`); continue; }
      found[t].push(o);
    }
  };
  // NetBox pages its lists: at most MAX_PAGE_SIZE objects a page (1,000 unless changed), even when asked for
  // ?limit=0. A saved page that is not the whole list says so in `count` and `next`.
  const checkComplete = (v, name) => {
    const pages = pagesOf(v);
    if (!pages) return;
    const have = pages.reduce((n, p) => n + p.results.length, 0);
    const count = pages.find((p) => typeof p.count === 'number')?.count;
    const last = pages[pages.length - 1];
    if ((typeof count === 'number' && count > have) || (pages.length === 1 && last.next)) {
      warnings.push(`${where}: ${name} holds ${have} of ${count ?? 'more'}. NetBox pages its lists (1,000 at most by default, even with ?limit=0): follow "next" and save every page.`);
    }
  };

  if (pagesOf(data)) {
    checkComplete(data, 'the list');
    take(results(data));
  } else if (data && typeof data === 'object' && !Array.isArray(data)) {
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('_')) continue; // a note about the file
      const key = k.replace(/_/g, '-');
      if (!TYPES[key]) { warnings.push(`${where}: "${k}" is not a list Keia reads yet, so it was skipped`); continue; }
      const list = results(v);
      if (!list) { problems.push(`${where}: "${k}" should be a list response, an array of them, or an array of objects`); continue; }
      checkComplete(v, k);
      take(list, TYPES[key]);
    }
  } else problems.push(`${where}: expected a NetBox list response or an object of them`);

  const any = Object.values(found).flat().find((o) => typeof o.url === 'string');
  let instance;
  try { instance = any ? new URL(any.url).host : undefined; } catch { instance = undefined; }
  const parents = new Set(found.location.map((l) => l.parent?.id).filter((x) => x !== undefined && x !== null));
  const byId = (t) => new Map(found[t].map((o) => [o.id, o]));
  return {
    file, instance, found, parents, problems, warnings,
    interfaces: byId('interface'),
    vlanGroups: byId('vlan-group'),
    prefixes: found.prefix.map((o) => ({ prefix: o.prefix, id: o.id })),
  };
}

const recordId = (type, o) => `${type}/${o.id}`;

function list(source, kind) {
  const f = source.found;
  // Each node carries the lookups map() needs (interfaces, VLAN groups, prefixes) as `src`.
  const of = (...types) => types.flatMap((type) => f[type].map((o) => ({ type, o, src: source })));
  if (kind === 'space') return [...of('site'), ...f.location.map((o) => ({ type: 'location', o, floor: source.parents.has(o.id), src: source })), ...of('rack')];
  if (kind === 'unit') return of('device');
  if (kind === 'port') return of(...PORT_TYPES);
  if (kind === 'connection') return of('cable');
  if (kind === 'network') return of('vlan', 'prefix', 'ip-range', 'wireless-lan');
  if (kind === 'address') return of('ip-address');
  if (kind === 'group') return of('virtual-chassis').map((n) => ({ ...n, members: f.device.filter((d) => d.virtual_chassis?.id === n.o.id) }));
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

// The place a network or VLAN group applies to (NetBox 4.2 and later: scope_type and scope_id; before: site).
const scopeOf = (ctx, o) => {
  if (o.scope_type === 'dcim.site' && o.scope_id != null) return ctx.idFor('site', o.scope_id);
  if (o.scope_type === 'dcim.location' && o.scope_id != null) return ctx.idFor('location', o.scope_id);
  if (!o.scope_type && o.site?.id != null) return ctx.idFor('site', o.site.id);
  return undefined;
};

const idOrUndefined = (ctx, type, nested) => (nested?.id != null ? ctx.idFor(type, nested.id) : undefined);

// One end of a cable: the first port NetBox lists there, or the other thing's own words.
function cableEnd(ctx, terms, cable, side) {
  const list = Array.isArray(terms) ? terms : [];
  if (list.length > 1) ctx.warn(`cable ${cable.id} has ${list.length} terminations at its ${side} end; Keia keeps the first, and the rest stay in raw.`);
  const t = list[0];
  if (!t) return { native: 'No termination recorded' };
  const portType = END_TYPES[t.object_type];
  if (portType && t.object_id != null) return { port: ctx.idFor(portType, t.object_id) };
  return { native: `${END_WORDS[t.object_type] ?? t.object_type} ${t.object?.display ?? t.object?.name ?? t.object_id}`.trim() };
}

function mapPort(type, o, ctx) {
  const common = {
    id: ctx.idFor(type, o.id),
    name: text(o.name) ?? text(o.display) ?? `${type} ${o.id}`,
    label: text(o.label),
    unit: idOrUndefined(ctx, 'device', o.device),
    description: text(o.description),
  };
  if (type === 'interface') {
    const poe = choice(o.poe_mode);
    return {
      ...common,
      type: 'interface',
      type_native: label(o.type),
      enabled: typeof o.enabled === 'boolean' ? o.enabled : undefined,
      // NetBox keeps speed in kbit/s.
      speed_mbps: Number.isInteger(o.speed) ? Math.round(o.speed / 1000) : undefined,
      // NetBox 4.2 moved MAC addresses to objects of their own; the interface points at its primary one.
      mac: normMac(o.primary_mac_address?.mac_address ?? o.mac_address),
      mode: MODES[choice(o.mode)],
      untagged_vlan: idOrUndefined(ctx, 'vlan', o.untagged_vlan),
      tagged_vlans: Array.isArray(o.tagged_vlans) && o.tagged_vlans.length ? o.tagged_vlans.map((v) => ctx.idFor('vlan', v.id)) : undefined,
      poe: poe === 'pse' || poe === 'pd' ? { mode: poe, ...(label(o.poe_type) ? { type_native: label(o.poe_type) } : {}) } : undefined,
      lag: idOrUndefined(ctx, 'interface', o.lag),
    };
  }
  if (type === 'front-port') {
    // One rear port per front port. Newer NetBox releases can map several; those stay in raw.
    const rear = o.rear_port ?? (Array.isArray(o.rear_ports) ? o.rear_ports[0]?.rear_port ?? o.rear_ports[0] : undefined);
    return {
      ...common,
      type: 'front',
      type_native: label(o.type),
      rear_port: idOrUndefined(ctx, 'rear-port', rear),
      rear_position: Number.isInteger(o.rear_port_position) ? o.rear_port_position : undefined,
    };
  }
  if (type === 'rear-port') return { ...common, type: 'rear', type_native: label(o.type) };
  if (type === 'console-port' || type === 'console-server-port') {
    const word = type === 'console-port' ? 'Console port' : 'Console server port';
    return { ...common, type: 'console', type_native: label(o.type) ? `${word}, ${label(o.type)}` : word };
  }
  if (type === 'power-port') {
    return {
      ...common,
      type: 'power',
      type_native: label(o.type),
      max_draw_w: typeof o.maximum_draw === 'number' ? o.maximum_draw : undefined,
      allocated_draw_w: typeof o.allocated_draw === 'number' ? o.allocated_draw : undefined,
    };
  }
  const leg = choice(o.feed_leg);
  return { ...common, type: 'outlet', type_native: label(o.type), feed: ['A', 'B', 'C'].includes(leg) ? leg : undefined };
}

function map(kind, node, ctx) {
  const { type, o } = node;
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
      level: node.floor ? 'floor' : 'room',
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
  if (type === 'device') {
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
      inside: idOrUndefined(ctx, 'device', o.parent_device),
      firmware: cfText(o.custom_fields, 'firmware', 'firmware_version'),
      model_id: ctx.matchModel(manufacturer, model),
      source,
      raw: o,
    };
  }
  if (PORT_TYPES.includes(type)) return { ...mapPort(type, o, ctx), source, raw: o };
  if (type === 'cable') {
    const unit = choice(o.length_unit);
    const length = typeof o.length === 'number' && TO_METRES[unit] ? Math.round(o.length * TO_METRES[unit] * 1000) / 1000 : undefined;
    const medium = choice(o.type);
    return {
      id: ctx.idFor('cable', o.id),
      type: 'cable',
      label: text(o.label),
      a: cableEnd(ctx, o.a_terminations, o, 'A'),
      b: cableEnd(ctx, o.b_terminations, o, 'B'),
      medium: MEDIUM[medium],
      medium_native: label(o.type) ?? text(medium),
      length_m: length,
      colour: /^[0-9a-f]{6}$/i.test(o.color ?? '') ? `#${o.color.toLowerCase()}` : undefined,
      description: text(o.description),
      status: mapStatus(CABLE_STATUS, choice(o.status)),
      status_native: label(o.status),
      source,
      raw: o,
    };
  }
  if (type === 'vlan') {
    const group = o.group?.id != null ? node.src.vlanGroups.get(o.group.id) : undefined;
    return {
      id: ctx.idFor('vlan', o.id),
      name: text(o.name) ?? `VLAN ${o.vid}`,
      type: 'vlan',
      vid: o.vid,
      vlan_group: text(o.group?.name),
      scope: group ? scopeOf(ctx, group) : o.site?.id != null ? ctx.idFor('site', o.site.id) : undefined,
      role_native: text(o.role?.name),
      status: mapStatus(NET_STATUS, choice(o.status)),
      status_native: label(o.status),
      description: text(o.description),
      source,
      raw: o,
    };
  }
  if (type === 'prefix') {
    return {
      id: ctx.idFor('prefix', o.id),
      name: o.prefix,
      type: 'prefix',
      prefix: o.prefix,
      vid: Number.isInteger(o.vlan?.vid) ? o.vlan.vid : undefined,
      vlan: idOrUndefined(ctx, 'vlan', o.vlan),
      scope: scopeOf(ctx, o),
      role_native: text(o.role?.name),
      status: mapStatus(NET_STATUS, choice(o.status)),
      status_native: label(o.status),
      description: text(o.description),
      source,
      raw: o,
    };
  }
  if (type === 'ip-range') {
    return {
      id: ctx.idFor('ip-range', o.id),
      name: `${ipHost(o.start_address)}-${ipHost(o.end_address)}`,
      type: 'range',
      start: o.start_address,
      end: o.end_address,
      role_native: text(o.role?.name),
      status: mapStatus(NET_STATUS, choice(o.status)),
      status_native: label(o.status),
      description: text(o.description),
      source,
      raw: o,
    };
  }
  if (type === 'wireless-lan') {
    return {
      id: ctx.idFor('wireless-lan', o.id),
      name: o.ssid,
      type: 'wifi',
      ssid: o.ssid,
      // The key itself (auth_psk) is emptied on the way in, like any secret.
      auth_native: label(o.auth_type),
      vlan: idOrUndefined(ctx, 'vlan', o.vlan),
      scope: scopeOf(ctx, o),
      status: mapStatus(NET_STATUS, choice(o.status)),
      status_native: label(o.status),
      description: text(o.description),
      source,
      raw: o,
    };
  }
  if (type === 'ip-address') {
    const onInterface = o.assigned_object_type === 'dcim.interface' && o.assigned_object_id != null;
    const ifc = onInterface ? node.src.interfaces.get(o.assigned_object_id) : undefined;
    const net = containingPrefix(o.address, node.src.prefixes);
    const status = choice(o.status);
    return {
      id: ctx.idFor('ip-address', o.id),
      address: o.address,
      port: onInterface ? ctx.idFor('interface', o.assigned_object_id) : undefined,
      unit: idOrUndefined(ctx, 'device', o.assigned_object?.device),
      network: net ? ctx.idFor('prefix', net.id) : undefined,
      dns_name: text(o.dns_name),
      // NetBox keeps the MAC on the interface; the address takes it from there, so a DHCP server's reservation can
      // be checked against it (planned against seen).
      mac: ifc ? normMac(ifc.primary_mac_address?.mac_address ?? ifc.mac_address) : undefined,
      assignment: { dhcp: 'dhcp', slaac: 'slaac' }[status],
      role_native: label(o.role),
      status: mapStatus(ADDRESS_STATUS, status),
      status_native: label(o.status),
      description: text(o.description),
      source,
      raw: o,
    };
  }
  if (type === 'virtual-chassis') {
    const fromDevices = node.members.map((d) => ({
      ref: ctx.idFor('device', d.id),
      role: o.master?.id === d.id ? 'master' : 'member',
      ...(Number.isInteger(d.vc_position) ? { position: d.vc_position } : {}),
    }));
    const members = fromDevices.length ? fromDevices : (Array.isArray(o.members) ? o.members : []).map((d) => ({ ref: ctx.idFor('device', d.id), role: o.master?.id === d.id ? 'master' : 'member' }));
    if (!members.length) {
      ctx.warn(`virtual chassis ${o.id} (${o.name ?? '?'}) has no member devices in this file, so it was skipped. Export its devices too.`);
      return undefined;
    }
    return {
      id: ctx.idFor('virtual-chassis', o.id),
      name: text(o.name) ?? `virtual chassis ${o.id}`,
      type: 'stack',
      type_native: 'Virtual chassis',
      members: members.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
      domain: text(o.domain),
      source,
      raw: o,
    };
  }
  return undefined;
}

const PORT_FIELDS = [
  'name', 'label', 'type', 'type_native', 'unit', 'description', 'enabled', 'speed_mbps', 'mac', 'mode', 'untagged_vlan',
  'tagged_vlans', 'poe', 'lag', 'rear_port', 'rear_position', 'feed', 'max_draw_w', 'allocated_draw_w',
];
const owned = (fields, keia = []) => Object.fromEntries([...fields.map((f) => [f, 'source']), ...keia.map((f) => [f, 'keia'])]);

export default defineAdapter({
  manifest: {
    id: 'netbox',
    name: 'NetBox export importer',
    description: "Places, devices, ports, cables, VLANs, prefixes, addresses and stacks from NetBox's REST API JSON, saved to a file. Reads a file; calls nothing.",
    version: '0.2.0',
    tier: 'certified',
    owner: 'Keia Atlas maintainers',
    system: 'netbox',
    reads: 'file',
    objects: {
      space: { actions: ['read'], fields: owned(['name', 'level', 'code', 'parent', 'status', 'status_native', 'category_native', 'time_zone', 'size_u'], ['atlas_site']) },
      unit: {
        actions: ['read'],
        fields: owned(['name', 'manufacturer', 'model', 'serial', 'asset_tag', 'status', 'status_native', 'category_native', 'space', 'position', 'inside', 'firmware'], ['model_id']),
      },
      network: {
        actions: ['read'],
        fields: owned(['name', 'type', 'vid', 'vlan_group', 'prefix', 'start', 'end', 'ssid', 'auth_native', 'vlan', 'scope', 'role_native', 'status', 'status_native', 'description']),
      },
      port: { actions: ['read'], fields: owned(PORT_FIELDS) },
      address: {
        actions: ['read'],
        fields: owned(['address', 'port', 'unit', 'network', 'dns_name', 'mac', 'assignment', 'role_native', 'status', 'status_native', 'description']),
      },
      connection: {
        actions: ['read'],
        fields: owned(['type', 'label', 'a', 'b', 'medium', 'medium_native', 'length_m', 'colour', 'description', 'status', 'status_native']),
      },
      group: { actions: ['read'], fields: owned(['name', 'type', 'type_native', 'members', 'domain']) },
    },
    events: { mode: 'file' },
    rate: { requests_per_minute: 0, note: 'Reads a saved export. A live NetBox adapter would page through /api/ with a read-only token from the vault, following "next".' },
    hosts: [],
    credentials: [],
  },
  open,
  list,
  get,
  map,
});
