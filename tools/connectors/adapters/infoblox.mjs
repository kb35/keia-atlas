// Infoblox NIOS export importer: WAPI JSON saved to a file (docs/connectors/infoblox.md).
//
// Infoblox NIOS runs DNS, DHCP and IP address management (DDI) for many organisations. Its REST API is the WAPI
// (https://<grid master>/wapi/v2.x/<object>). This adapter reads WAPI responses saved to a file, so it works offline
// and in CI. It never calls the grid.
//
// The file is either
//   - one WAPI response saved as it came: an array of objects, or { "result": [ ... ], "next_page_id": ... } when it
//     was paged (the object type is read from each object's _ref: network/..., fixedaddress/...), or
//   - several saved together: { "network": ..., "range": ..., "fixedaddress": ..., "record:host": ...,
//     "record:a": ..., "record:ptr": ... }, each as above or an array of pages. An optional "instance" names the grid
//     (its host name) for the source mark.
//
// What becomes what (canonical model v1, docs/connectors/model.md):
//   network, networkcontainer        -> network, type prefix (the VLAN number from an extensible attribute "VLAN")
//   range                            -> network, type range (a DHCP pool)
//   fixedaddress, record:host,
//   record:a, record:ptr             -> address: one record per IP address, joining its DHCP reservation (with the
//                                       MAC it is keyed on) and its DNS names
//
// Infoblox serves DNS and DHCP, so what it holds is what the network actually hands out. Its manifest therefore
// says it observes an address's DNS name and MAC: when another system (NetBox) records the same address, the
// Infoblox value goes into that record's `seen` block, and a difference is a drift event, never an overwrite.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineAdapter, normMac, containingPrefix, ipHost, text } from '../adapter.mjs';

const TYPES = ['network', 'networkcontainer', 'range', 'fixedaddress', 'record:host', 'record:a', 'record:ptr'];
const typeOfRef = (ref) => String(ref ?? '').split('/')[0];
const isPage = (v) => v && typeof v === 'object' && !Array.isArray(v) && Array.isArray(v.result);
const pagesOf = (v) => (isPage(v) ? [v] : Array.isArray(v) && v.length && v.every(isPage) ? v : Array.isArray(v) ? [{ result: v }] : null);
const ea = (o, name) => {
  const v = o?.extattrs?.[name]?.value;
  return Array.isArray(v) ? v[0] : v;
};
const view = (o) => text(o.network_view) ?? text(o.view) ?? 'default';

function open(file) {
  const where = path.basename(file);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const found = Object.fromEntries(TYPES.map((t) => [t, []]));
  const problems = [];
  const warnings = [];

  const take = (value, name) => {
    const pages = pagesOf(value);
    if (!pages) { problems.push(`${where}: "${name}" should be a WAPI response: an array, or { "result": [...] }`); return; }
    for (const o of pages.flatMap((p) => p.result)) {
      const t = typeOfRef(o?._ref);
      if (!TYPES.includes(t)) { warnings.push(`${where}: skipped an object Keia does not read yet (${t || 'no _ref'})`); continue; }
      found[t].push(o);
    }
    if (pages.some((p) => p.next_page_id)) {
      warnings.push(`${where}: ${name} has more pages (next_page_id). Ask the WAPI again with _page_id and save every page.`);
    }
  };

  let instance;
  if (Array.isArray(data) || isPage(data)) take(data, 'the response');
  else if (data && typeof data === 'object') {
    instance = text(data.instance);
    for (const [k, v] of Object.entries(data)) {
      if (k.startsWith('_') || k === 'instance') continue;
      if (!TYPES.includes(k)) { warnings.push(`${where}: "${k}" is not an object type Keia reads yet, so it was skipped`); continue; }
      take(v, k);
    }
  } else problems.push(`${where}: expected a WAPI response or an object of them`);

  // Every IP address the file mentions, with everything the grid says about it.
  const addresses = new Map();
  const at = (v, ip) => {
    const key = `${v}|${ipHost(ip)}`;
    if (!addresses.has(key)) addresses.set(key, { view: v, ip: ipHost(ip), host: [], fixed: [], a: [], ptr: [] });
    return addresses.get(key);
  };
  for (const o of found.fixedaddress) if (o.ipv4addr || o.ipv6addr) at(view(o), o.ipv4addr ?? o.ipv6addr).fixed.push(o);
  for (const o of found['record:host']) {
    for (const x of [...(o.ipv4addrs ?? []), ...(o.ipv6addrs ?? [])]) {
      const ip = x.ipv4addr ?? x.ipv6addr;
      if (ip) at(view(o), ip).host.push({ record: o, addr: x });
    }
  }
  for (const o of found['record:a']) if (o.ipv4addr) at(view(o), o.ipv4addr).a.push(o);
  for (const o of found['record:ptr']) if (o.ipv4addr || o.ipv6addr) at(view(o), o.ipv4addr ?? o.ipv6addr).ptr.push(o);

  const networks = [...found.network, ...found.networkcontainer].map((o) => ({ prefix: o.network, view: view(o), o }));
  return { file, instance, found, addresses: [...addresses.values()], networks, problems, warnings };
}

const netId = (ctx, n) => ctx.idFor('network', n.view === 'default' ? '' : n.view, n.o.network);

function list(source, kind) {
  if (kind === 'network') {
    return [
      ...source.networks.map((n) => ({ type: typeOfRef(n.o._ref), o: n.o, n })),
      ...source.found.range.map((o) => ({ type: 'range', o })),
    ];
  }
  if (kind === 'address') return source.addresses.map((a) => ({ type: 'address', a, networks: source.networks }));
  return [];
}

function get(source, kind, key) {
  return list(source, kind).find((x) => (x.o?._ref ?? primaryRef(x.a)) === key);
}

// The object an address record is known by in the grid: its host record's address, else its reservation, else its
// DNS records.
const primaryRef = (a) => a.host[0]?.addr?._ref ?? a.host[0]?.record?._ref ?? a.fixed[0]?._ref ?? a.a[0]?._ref ?? a.ptr[0]?._ref;

function map(kind, node, ctx) {
  if (node.type === 'network' || node.type === 'networkcontainer') {
    const o = node.o;
    const vid = Number(ea(o, 'VLAN'));
    return {
      id: netId(ctx, node.n),
      name: o.network,
      type: 'prefix',
      prefix: o.network,
      vid: Number.isInteger(vid) && vid >= 1 && vid <= 4094 ? vid : undefined,
      role_native: node.type === 'networkcontainer' ? 'Network container' : undefined,
      status_native: o.disable === true ? 'Disabled' : undefined,
      description: text(o.comment),
      atlas_site: ctx.matchSite(text(ea(o, 'Site'))),
      source: { record_id: o._ref },
      raw: o,
    };
  }
  if (node.type === 'range') {
    const o = node.o;
    return {
      id: ctx.idFor('range', view(o) === 'default' ? '' : view(o), o.start_addr, o.end_addr),
      name: `${o.start_addr}-${o.end_addr}`,
      type: 'range',
      start: o.start_addr,
      end: o.end_addr,
      role_native: 'DHCP range',
      status_native: o.disable === true ? 'Disabled' : undefined,
      description: text(o.comment) ?? text(o.name),
      source: { record_id: o._ref },
      raw: o,
    };
  }

  const a = node.a;
  const hostAddr = a.host[0]?.addr;
  const hostRec = a.host[0]?.record;
  const fixed = a.fixed[0];
  const forward = text(hostRec?.name) ?? text(a.a[0]?.name);
  const reverse = text(a.ptr[0]?.ptrdname);
  if (forward && reverse && forward.toLowerCase() !== reverse.toLowerCase()) {
    ctx.warn(`${a.ip}: its forward name (${forward}) and reverse name (${reverse}) differ in DNS. Keia keeps the forward name; both are in raw.`);
  }
  if (a.host.length + a.fixed.length > 1) ctx.warn(`${a.ip}: more than one reservation or host record names it. Keia takes the first; all are in raw.`);
  const reserved = Boolean(fixed) || hostAddr?.configure_for_dhcp === true;
  const disabled = fixed?.disable === true || hostRec?.disable === true;
  const net = containingPrefix(a.ip, node.networks.filter((n) => n.view === a.view && typeOfRef(n.o._ref) === 'network'))
    ?? containingPrefix(a.ip, node.networks.filter((n) => n.view === a.view));
  const len = net ? String(net.prefix).split('/')[1] : undefined;
  const raw = Object.fromEntries(Object.entries({ 'record:host': a.host.map((h) => h.record), fixedaddress: a.fixed, 'record:a': a.a, 'record:ptr': a.ptr }).filter(([, v]) => v.length));
  return {
    id: ctx.idFor('address', a.view === 'default' ? '' : a.view, a.ip),
    address: len ? `${a.ip}/${len}` : a.ip,
    network: net ? netId(ctx, net) : undefined,
    dns_name: forward ?? reverse,
    mac: normMac(hostAddr?.configure_for_dhcp ? hostAddr.mac : undefined) ?? normMac(fixed?.mac),
    assignment: reserved ? 'dhcp-reservation' : undefined,
    status_native: disabled ? 'Disabled' : undefined,
    description: [hostRec?.comment, fixed?.comment].map(text).filter(Boolean).join('; ') || undefined,
    source: { record_id: primaryRef(a) },
    raw,
  };
}

export default defineAdapter({
  manifest: {
    id: 'infoblox',
    name: 'Infoblox NIOS export importer',
    description: 'Networks, DHCP ranges, DHCP reservations and DNS records from Infoblox WAPI JSON, saved to a file. Reads a file; calls nothing.',
    version: '0.1.0',
    tier: 'community',
    owner: 'Keia Atlas maintainers',
    system: 'infoblox',
    reads: 'file',
    objects: {
      network: {
        actions: ['read'],
        fields: {
          name: 'source', type: 'source', prefix: 'source', start: 'source', end: 'source', vid: 'source', role_native: 'source',
          status_native: 'source', description: 'source', atlas_site: 'keia',
        },
      },
      address: {
        actions: ['read'],
        fields: {
          address: 'source', network: 'source', dns_name: 'source', mac: 'source', assignment: 'source', status_native: 'source', description: 'source',
        },
        // What DNS and DHCP really hand out, checked against the system that records the address plan.
        observes: ['dns_name', 'mac'],
      },
    },
    events: { mode: 'file' },
    rate: { requests_per_minute: 0, note: 'Reads a saved export. A live adapter would read the WAPI with paging (_paging=1, _max_results, _page_id) and a read-only account from the vault.' },
    hosts: [],
    credentials: [],
  },
  open,
  list,
  get,
  map,
});
