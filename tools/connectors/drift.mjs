// Planned against seen (docs/connectors/model.md, "Planned and seen").
//
// One system decides a fact (NetBox records that the video bar's address belongs to MAC ...:2a); another sees what
// the estate really does (the DHCP server hands that address to MAC ...:2b). Keia keeps both: the owner's value stays
// in the field, and every other system's value goes into the record's `seen` block with its own mark. A difference
// is a finding for a person, raised as a drift event (io.keia.drift.found), never an overwrite. When the two agree
// again, Keia raises io.keia.drift.cleared.
//
// Which fields a system sees is declared in its manifest (`objects.<kind>.observes`). The runner calls compare() for
// every pair of records from two systems that describe the same thing (sameThing()).

import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { normMac } from './adapter.mjs';

export const DRIFT_FOUND = 'io.keia.drift.found';
export const DRIFT_CLEARED = 'io.keia.drift.cleared';

const host = (ip) => String(ip ?? '').split('/')[0].trim().toLowerCase();
const lower = (v) => String(v).trim().toLowerCase();

// The keys two systems' records of the same thing share, most certain first. Units match on serial, then asset tag,
// then name (the house naming rule makes host names agree); addresses on the address; networks on the prefix, the
// range, the SSID, or the VLAN number within its group.
export function joinKeys(r) {
  switch (r?.kind) {
    case 'address':
      return r.address ? [['ip', host(r.address)]] : [];
    case 'network':
      if (r.type === 'prefix' && r.prefix) return [['prefix', lower(r.prefix)]];
      if (r.type === 'range' && r.start && r.end) return [['range', `${host(r.start)}-${host(r.end)}`]];
      if (r.type === 'wifi' && r.ssid) return [['ssid', r.ssid]];
      if (r.type === 'vlan' && r.vid && r.vlan_group) return [['vlan', `${lower(r.vlan_group)}:${r.vid}`]];
      return [];
    case 'unit': {
      const k = [];
      if (r.serial) k.push(['serial', lower(r.serial)]);
      if (r.asset_tag) k.push(['tag', lower(r.asset_tag)]);
      if (r.name) k.push(['name', lower(r.name).split('.')[0]]);
      return k;
    }
    default:
      return [];
  }
}

// Do two records describe the same thing? The first key both have decides: two units with different serials are
// different units, even when their names agree.
export function sameThing(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  const kb = new Map(joinKeys(b));
  for (const [type, value] of joinKeys(a)) if (kb.has(type)) return kb.get(type) === value;
  return false;
}

// Two values agree when they are the same once written the same way (MAC case and separators, a DNS name's case
// and trailing dot, an address's prefix length).
const norm = (field, v) => {
  if (v === undefined || v === null) return undefined;
  if (field === 'mac' || field.endsWith('_mac')) return normMac(v) ?? v;
  if (field === 'dns_name') return lower(v).replace(/\.$/, '');
  if (field === 'address') return host(v);
  if (typeof v === 'string') return v.trim();
  return v;
};
export const agree = (field, a, b) => isDeepStrictEqual(norm(field, a), norm(field, b));

const hash = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 12);

function event(type, { planned, observed, field, value, syncedAt }) {
  const obs = observed.source;
  const plannedValue = planned[field];
  return {
    kind: 'event',
    // The same finding always gets the same id, so running an import twice raises it once.
    id: `${obs.system}-drift-${hash(type, planned.id, field, norm(field, plannedValue), norm(field, value))}`,
    type,
    subject: planned.id,
    time: syncedAt,
    severity: type === DRIFT_FOUND ? 'warning' : 'info',
    key: `${planned.id}:${field}`,
    data: {
      field,
      planned: { value: plannedValue, system: planned.source.system, record_id: planned.source.record_id },
      seen: { value, system: obs.system, record_id: obs.record_id },
    },
    source: {
      system: obs.system,
      ...(obs.instance ? { instance: obs.instance } : {}),
      record_id: `${obs.record_id}#${field}`,
      synced_at: syncedAt,
      adapter: obs.adapter,
      ...(obs.adapter_version ? { adapter_version: obs.adapter_version } : {}),
    },
  };
}

// Compare what one system sees (observed) with the record that owns the facts (planned), over the fields the
// observer declares. Returns the planned record's new `seen` block (undefined when nothing in it changed), the drift
// events to raise, and a line per difference for the plan.
export function compare({ planned, observed, fields, syncedAt }) {
  const obs = observed.source;
  const seen = structuredClone(planned.seen ?? {});
  let changed = false;
  const events = [];
  const findings = [];
  for (const field of fields) {
    const value = observed[field];
    if (value === undefined) continue;
    const list = seen[field] ?? [];
    const i = list.findIndex((e) => e.system === obs.system && (e.instance ?? null) === (obs.instance ?? null));
    const prev = i >= 0 ? list[i] : undefined;
    const has = planned[field] !== undefined;
    const differs = has && !agree(field, planned[field], value);
    const entry = {
      value,
      system: obs.system,
      ...(obs.instance ? { instance: obs.instance } : {}),
      record_id: obs.record_id,
      ...(obs.url ? { url: obs.url } : {}),
      // Moves only when the value did, so the same export twice changes nothing.
      synced_at: prev && isDeepStrictEqual(prev.value, value) ? prev.synced_at : syncedAt,
      ...(differs ? { differs: true } : {}),
    };
    if (!prev || !isDeepStrictEqual(prev, entry)) {
      if (i >= 0) list[i] = entry;
      else list.push(entry);
      changed = true;
    }
    seen[field] = list;
    if (differs) {
      events.push(event(DRIFT_FOUND, { planned, observed, field, value, syncedAt }));
      findings.push({ type: DRIFT_FOUND, kind: planned.kind, subject: planned.id, field, planned: planned[field], plannedSystem: planned.source.system, seen: value, seenSystem: obs.system });
    } else if (has && prev?.differs) {
      events.push(event(DRIFT_CLEARED, { planned, observed, field, value, syncedAt }));
      findings.push({ type: DRIFT_CLEARED, kind: planned.kind, subject: planned.id, field, planned: planned[field], plannedSystem: planned.source.system, seen: value, seenSystem: obs.system });
    }
  }
  return { seen: changed ? seen : undefined, events, findings };
}
