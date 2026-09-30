// Switch ports: where every networked unit port is wired, and how the switch port at the far end is set.
//
// Two halves, kept apart on purpose:
//   the chain    unit port → wall or floor outlet → permanent link → patch panel port → patch cord → switch port.
//                It is not typed in twice: the building model (src/lib/floors.mjs) already holds the room wiring,
//                the runs and the patch cords, and farEnds() walks them, the same graph the network path trace and
//                the blast-radius explorer follow.
//   the setting  each switch port's state (active, parked or disabled), mode (access or trunk), native VLAN and
//                tagged VLANs, as the switch platform (UniFi, Meraki or Netgear) reports it. That is recorded, per
//                site, in data/switch-ports/<site>.yaml, with each port's far end named (its run, patch cord, unit
//                and unit port) so a person can read the file alone. tools/crossrefs-switchports.mjs checks that the
//                names in the file are the chain the building model finds, so the two can never drift.
//
// checkPort() then answers the network standard's vlan-by-purpose rule for a port: the native VLAN against the
// plan for the device on it (data/house-values: the VLAN per kind of device), VLAN 1 (no-vlan-1) and VLAN 40 on
// an in-room switch's uplink (av-not-routed).
//
// Pure except readSwitchPorts() and readHouse(), which read the files. Used by the validator, the generator
// (tools/migrations/2026-09-30-switch-ports.mjs), the pages (src/lib/switchports.mjs) and tests/switchports.test.mjs.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { signalGraph, wiringToOutlet } from './floors.mjs';
import { parseEnd, devKey } from './room3d.mjs';

// ---- The switch platforms (the connector that would read and set a port) -------------------------------------
export const PLATFORM = {
  unifi: { name: 'UniFi Network', short: 'UniFi' },
  meraki: { name: 'Meraki dashboard', short: 'Meraki' },
  netgear: { name: 'NETGEAR Engage', short: 'Netgear' },
};
/** The platform a switch model is run from (house choice, demo): UniFi models from UniFi Network, the Catalyst
    switches cloud-managed from the Meraki dashboard, the in-room AV switch from NETGEAR Engage. */
export const platformOf = (gearOrModel = '') => (/^unifi-/.test(gearOrModel) ? 'unifi' : /^netgear-/.test(gearOrModel) ? 'netgear' : 'meraki');

// ---- The VLAN plan -----------------------------------------------------------------------------------------------
/** The network standard's VLAN plan: [{ vlan, name, what, reaches, routed }], from data/standards/network.yaml. */
export function vlanPlan(standard) {
  const rows = standard?.sections?.find((s) => s.id === 'vlans')?.table?.rows ?? [];
  return rows.map(([v, name, what, reaches]) => ({ vlan: Number(v), name, what, reaches, routed: !/not routed/i.test(reaches) }));
}
/** The plan's VLAN for each kind of device (data/house-values vlans): Map class → VLAN number. */
export function classVlans(house) {
  const m = new Map();
  for (const v of house?.vlans ?? []) for (const c of v.classes) m.set(c, Number(v.vlan));
  return m;
}
export const AV_VLAN = 40;
/** Every VLAN the office network routes (a trunk between switches carries them all). */
export const routedVlans = (plan) => plan.filter((v) => v.routed && v.vlan !== 10).map((v) => v.vlan);

// ---- Reading the files --------------------------------------------------------------------------------------------
export function readSwitchPorts(root = process.cwd()) {
  const dir = path.join(root, 'data', 'switch-ports');
  if (!existsSync(dir)) return {};
  return Object.fromEntries(readdirSync(dir).filter((n) => n.endsWith('.yaml')).sort().map((n) => [n.slice(0, -5), parse(readFileSync(path.join(dir, n), 'utf8'))]));
}
export function readHouse(root = process.cwd()) {
  const dir = path.join(root, 'data', 'house-values');
  const f = existsSync(dir) ? readdirSync(dir).find((n) => n.endsWith('.yaml')) : null;
  return f ? parse(readFileSync(path.join(dir, f), 'utf8')) : null;
}

// ---- Port ranges ------------------------------------------------------------------------------------------------
/** "41-48,51" → [41..48, 51]. */
export function rangeList(s) {
  const out = [];
  for (const part of String(s ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const [lo, hi] = part.split('-').map(Number);
    for (let n = lo; n <= (Number.isFinite(hi) ? hi : lo); n++) out.push(n);
  }
  return out;
}
/** [41..48, 51] → "41-48,51". */
export function rangeText(list) {
  const s = [...new Set(list)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`); i = j;
  }
  return out.join(',');
}

// ---- The switches of an office ---------------------------------------------------------------------------------
const itemAtU = (rack, u) => rack?.items.find((it) => u >= it.u && u < it.u + (it.size ?? 1)) ?? null;
const digitsOf = (space) => String(space?.number ?? '').replace('.', '');
/** Every switch in an office: the switches in its comms room racks, and the in-room switches in its spaces.
    [{ key, where: 'rack'|'room', rack, u, space, position, label, gear|model, hostname (recorded or null), ports }]
    `ports` is how many copper ports a rack switch has, or the ids of an in-room switch's network ports. */
export function switchesOf(M) {
  const raw = M._raw;
  const out = [];
  for (const rk of M.racks) {
    const rack = M._racks[rk.id];
    for (const it of rack.items.filter((i) => i.kind === 'switch')) {
      const pos = it.position ? raw.installs[rk.space]?.positions.find((p) => p.position === it.position) : null;
      out.push({ key: `${rk.id}:${it.u}`, where: 'rack', rack: rk.id, u: it.u, space: rk.space, position: it.position ?? null, label: it.label, gear: it.gear ?? null,
        hostname: pos?.hostname ?? null, tag: pos?.units.find((x) => !x.legacy)?.asset_tag ?? null, ports: typeof it.ports === 'number' ? it.ports : 0 });
    }
  }
  for (const r of Object.values(M.rooms)) {
    for (const p of r.positions ?? []) {
      const eq = r.optionData?.equipment.find((e) => e.key === p.position.replace(/^[a-z]+-\d+\//, '').split('#')[0]);
      if (eq?.class !== 'network-switch') continue;
      if (M.racks.some((k) => k.space === r.id)) continue;   // a comms room's own switches are its rack items
      const model = p.model ?? eq.model ?? null;
      const ids = (raw.models[model]?.ports ?? []).filter((x) => ['rj45', 'sfp', 'sfp-plus'].includes(x.connector)).map((x) => x.id);
      out.push({ key: `${r.id}/${p.position}`, where: 'room', rack: null, u: null, space: r.id, position: p.position, label: `${r.name}, ${eq.role ?? 'network switch'}`, model,
        hostname: p.hostname ?? null, tag: p.units.find((x) => !x.legacy)?.asset_tag ?? null, ports: ids });
    }
  }
  return out;
}
/** A hostname for a rack switch with no unit recorded: the comms room's number and the switch's number in its
    label, after the hostname rule (network standard: site, room without its dot, prefix, number). */
export function hostnameFor(M, sw) {
  if (sw.hostname) return sw.hostname;
  const space = M._raw.spaces[sw.space];
  const n = /\b([AB])$/.test(sw.label) ? (sw.label.endsWith('A') ? 1 : 2) : Number(/(\d+)/.exec(sw.label)?.[1] ?? 1);
  const prefix = /core/i.test(sw.label) ? 'cs' : 'as';
  return `${M.site}-${digitsOf(space)}-${prefix}${String(n).padStart(2, '0')}`;
}

// ---- The room's own network cables ---------------------------------------------------------------------------------
/** The Cat6 links in a room's wiring that are live for its build (fitted items, when and unless), with both ends
    resolved to position keys or outlets: [{ a: { key, port } | { outlet }, b, notes }]. */
export function roomLinks(room) {
  const opt = room.optionData; if (!opt) return [];
  const fitted = new Set(room.fitted ?? []);
  const items = new Map(opt.equipment.map((e) => [e.key, e]));
  const on = (k) => items.get(k)?.requirement !== 'optional' || fitted.has(k);
  const out = [];
  for (const l of opt.wiring ?? []) {
    if (!['cat6', 'cat6a'].includes(l.cable)) continue;
    if (l.when && !fitted.has(l.when)) continue;
    if (l.unless && fitted.has(l.unless)) continue;
    const a = parseEnd(l.from), b = parseEnd(l.to);
    if ([a, b].some((e) => e.key && !on(e.key))) continue;
    if (a.dev || b.dev) continue;   // a laptop's cable
    const end = (e, rawEnd) => (e.outlet ? { outlet: rawEnd.slice(7) } : { key: devKey(e, opt), port: e.port });
    out.push({ a: end(a, l.from), b: end(b, l.to), notes: l.notes ?? null, cable: l.cable });
  }
  return out;
}

// ---- Units at an outlet --------------------------------------------------------------------------------------------
const clsOf = (room, key, raw, model) => {
  const eq = room.optionData?.equipment.find((e) => e.key === key.split('#')[0]);
  return raw.models[model]?.class ?? eq?.class ?? null;
};
/** The units whose network cable reaches each outlet, with the unit's own port and anything in between
    (a PoE injector, an in-room switch): Map outlet node → [{ tag, host, cls, model, space, position, port, via }]. */
export function unitsAtOutlets(M) {
  const raw = M._raw;
  const idx = new Map();
  const put = (k, u) => { if (!idx.has(k)) idx.set(k, []); idx.get(k).push(u); };
  for (const r of Object.values(M.rooms)) {
    for (const p of r.positions ?? []) {
      const u = p.units?.find((x) => !x.legacy);
      if (!u) continue;
      const w = wiringToOutlet(r, p.position);
      if (!w || !w.hops.length) continue;
      const local = p.position.replace(/^[a-z]+-\d+\//, '');
      const first = w.hops[0];
      const ends = [parseEnd(first.l.from), parseEnd(first.l.to)];
      const mine = ends.find((e) => e.key && devKey(e, r.optionData) === local) ?? ends[0];
      const model = u.model ?? p.model ?? r.optionData?.equipment.find((e) => e.key === local.split('#')[0])?.model ?? null;
      const via = w.hops.slice(1).map((h) => h.from);
      put(`outlet:${r.id}:${w.outlet}`, { tag: u.asset_tag, host: p.hostname ?? null, cls: clsOf(r, local, raw, model), model, space: r.id, position: p.position, port: mine?.port ?? null, via, hops: w.hops.length });
    }
  }
  for (const a of M.aps) {
    if (!a.asset_tag) continue;
    const port = (raw.models[a.model]?.ports ?? []).find((x) => x.connector === 'rj45')?.id ?? 'lan-1';
    put(`outlet:ap:${a.id}`, { tag: a.asset_tag, host: a.hostname, cls: 'wireless-access-point', model: a.model, space: a.space, position: a.position, port, via: [], hops: 1, ap: a.id });
  }
  return idx;
}
/** The unit a switch port serves at an outlet: an in-room switch before anything behind it; otherwise a device
    before the adapter (a PoE injector) it passes through; otherwise the nearest. */
export function primaryOf(units = []) {
  const rank = (u) => (u.cls === 'network-switch' ? 0 : u.cls === 'adapter' ? 2 : 1);
  return [...units].sort((a, b) => rank(a) - rank(b) || a.hops - b.hops)[0] ?? null;
}

// ---- The far end of every switch port -----------------------------------------------------------------------------
const ownPort = (e) => (e.ports ? (e.ports[1] === e.toPort ? e.ports[0] : e.ports[1]) : null);
/** What each switch port reaches, from the recorded patching. Map switch key → Map port → far, where far is
      { kind: 'outlet', outlet, run, patch, panel: { rack, u, port }, units, unit }   a room outlet or access point
      { kind: 'switch', key, port, patch, runs }                                          another switch
      { kind: 'item', rack, u, label, patch }                                             a firewall or controller
      { kind: 'unit', unit }                                                              an in-room switch's device
      { kind: 'uplink', outlet, via }                                                     an in-room switch's uplink
    Every port a patch cord or a room cable reaches is listed; a port nothing reaches is not. */
export function farEnds(M) {
  const adj = signalGraph(M);
  const atOutlet = unitsAtOutlets(M);
  const sws = switchesOf(M);
  const byNode = new Map(sws.filter((s) => s.where === 'rack').map((s) => [`item:${s.rack}:${s.u}`, s]));
  const runById = new Map(M.runs.map((r) => [r.id, r]));
  const out = new Map();
  for (const s of sws) out.set(s.key, new Map());
  // Rack switches: walk each patch cord out through passive panels (and the riser fibre) to what it reaches.
  for (const s of sws.filter((x) => x.where === 'rack')) {
    const node = `item:${s.rack}:${s.u}`;
    for (const e of adj.get(node) ?? []) {
      if (e.kind !== 'patch') continue;
      const port = ownPort(e);
      const runs = [], patches = [e.cable];
      let at = e.to, prev = node, panel = null, found = null, last = e;
      for (let guard = 0; guard < 12 && !found; guard++) {
        if (at.startsWith('port:')) {
          const [, rk, u, p] = at.split(':');
          if (!panel) panel = { rack: rk, u: +u, port: +p };
          const next = (adj.get(at) ?? []).find((x) => x.to !== prev);
          if (!next) { found = { kind: 'dead', panel }; break; }
          if (next.kind === 'run') runs.push(next.run); else if (next.kind === 'patch') patches.push(next.cable);
          prev = at; at = next.to; last = next;
        } else if (at.startsWith('outlet:')) {
          const units = atOutlet.get(at) ?? [];
          const r = runById.get(runs[runs.length - 1]);
          found = { kind: 'outlet', outlet: at.slice(7), space: r?.to?.space ?? null, ap: r?.to?.access_point ?? null, run: runs[runs.length - 1] ?? null, patch: patches[0], panel, units, unit: primaryOf(units) };
        } else if (at.startsWith('item:')) {
          const other = byNode.get(at);
          const [, rk, u] = at.split(':');
          const it = itemAtU(M._racks[rk], +u);
          found = other ? { kind: 'switch', key: other.key, port: last.toPort ?? null, patch: patches[patches.length - 1], patches, runs, panel }
            : { kind: 'item', rack: rk, u: +u, label: it?.label ?? `U${u}`, itemKind: it?.kind ?? null, patch: patches[patches.length - 1], panel };
        } else found = { kind: 'other', node: at };
      }
      if (found && port != null) out.get(s.key).set(port, found);
    }
  }
  // In-room switches: their own cables, to the room's devices and up to an outlet.
  const hosts = new Map(sws.map((s) => [s.key, s]));
  for (const s of sws.filter((x) => x.where === 'room')) {
    const r = M.rooms[s.space];
    const units = new Map((r.positions ?? []).map((p) => [p.position, p]));
    for (const l of roomLinks(r)) {
      const [me, them] = l.a.key === s.position ? [l.a, l.b] : l.b.key === s.position ? [l.b, l.a] : [null, null];
      if (!me) continue;
      if (them.outlet) { out.get(s.key).set(me.port, { kind: 'uplink', outlet: `${r.id}:${them.outlet}` }); continue; }
      const p = units.get(them.key); const u = p?.units.find((x) => !x.legacy);
      const model = u?.model ?? p?.model ?? r.optionData?.equipment.find((e) => e.key === them.key.split('#')[0])?.model ?? null;
      out.get(s.key).set(me.port, { kind: 'unit', unit: u ? { tag: u.asset_tag, host: p.hostname ?? null, cls: clsOf(r, them.key, M._raw, model), model, space: r.id, position: them.key, port: them.port } : null, position: them.key, unitPort: them.port, notes: l.notes });
    }
  }
  // An in-room switch's uplink: the comms room port whose outlet it plugs into.
  for (const [k, ports] of out) {
    if (!hosts.get(k) || hosts.get(k).where !== 'room') continue;
    for (const [p, f] of ports) {
      if (f.kind !== 'uplink') continue;
      for (const [k2, ports2] of out) for (const [p2, f2] of ports2) if (f2.kind === 'outlet' && f2.outlet === f.outlet) { f.key = k2; f.port = p2; f.run = f2.run; f.patch = f2.patch; f.panel = f2.panel; }
    }
  }
  return out;
}

// ---- Checking a port against the plan -------------------------------------------------------------------------------
/** Whether a recorded port follows the VLAN plan. port: the recorded { state, mode, native, tagged }; far: from
    farEnds(); ctx: { plan (vlanPlan), byClass (classVlans), inRoom (the port is on an in-room switch) }.
    Returns { ok: true|false|null, rule, why } in plain words; ok null when the plan has nothing to say. */
export function checkPort(port, far, { plan, byClass, inRoom = false, className = (c) => c } = {}) {
  const name = (v) => plan.find((x) => x.vlan === v)?.name ?? null;
  const vl = (v) => (name(v) ? `VLAN ${v} ${name(v)}` : `VLAN ${v}`);
  if (!port || port.state === 'disabled') return { ok: true, rule: 'no-vlan-1', why: 'Disabled.' };
  if (port.state === 'parked') return port.native != null ? { ok: false, rule: 'no-vlan-1', why: `Parked but still on ${vl(port.native)}; a parked port sits on no VLAN.` } : { ok: true, rule: 'no-vlan-1', why: 'Parked: patched to an outlet with nothing plugged in, shut until it is needed.' };
  if (port.native === 1) return { ok: false, rule: 'no-vlan-1', why: 'On VLAN 1, the switch default, which carries nothing here.' };
  if (!name(port.native)) return { ok: false, rule: 'vlan-by-purpose', why: `On VLAN ${port.native}, which is not in the VLAN plan.` };
  for (const t of port.tagged ?? []) if (t === 1 || !name(t)) return { ok: false, rule: t === 1 ? 'no-vlan-1' : 'vlan-by-purpose', why: `Carries VLAN ${t}, which is not in the VLAN plan.` };
  // An in-room switch's uplink keeps the AV VLAN in the room.
  if (inRoom && far?.kind === 'uplink' && ((port.tagged ?? []).includes(AV_VLAN) || port.native === AV_VLAN)) return { ok: false, rule: 'av-not-routed', why: `The uplink carries ${vl(AV_VLAN)}, which stays in the room.` };
  if (far?.kind === 'uplink' || far?.kind === 'switch' || far?.kind === 'item') {
    return port.mode === 'trunk' && port.native === 10 ? { ok: true, rule: 'vlan-by-purpose', why: `A trunk to network kit, managed on ${vl(10)}.` }
      : { ok: false, rule: 'vlan-by-purpose', why: `A link to network kit should be a trunk managed on ${vl(10)}; it is ${port.mode} on ${vl(port.native)}.` };
  }
  const unit = far?.unit ?? null;
  if (!unit) return { ok: null, rule: 'vlan-by-purpose', why: 'Nothing recorded on the far end.' };
  // On an in-room AV switch, a device's second port may sit on the AV VLAN, kept in the room.
  if (inRoom && port.native === AV_VLAN) return { ok: true, rule: 'av-not-routed', why: `${vl(AV_VLAN)}, kept in the room.` };
  const want = byClass.get(unit.cls);
  const what = String(className(unit.cls) ?? 'device').toLowerCase();
  if (want == null) return { ok: null, rule: 'vlan-by-purpose', why: `The VLAN plan does not name ${/s$/.test(what) ? what : `${what}s`} yet.` };
  if (port.native !== want) return { ok: false, rule: 'vlan-by-purpose', why: `On ${vl(port.native)}; the plan puts ${/^[aeiou]/.test(what) ? 'an' : 'a'} ${what} on ${vl(want)}.` };
  if (unit.cls === 'network-switch' || unit.cls === 'wireless-access-point') {
    if (port.mode !== 'trunk') return { ok: false, rule: 'vlan-by-purpose', why: `${unit.cls === 'wireless-access-point' ? 'An access point' : 'An in-room switch'} needs a trunk for what it carries; this port is access only.` };
  } else if (port.mode === 'trunk') return { ok: false, rule: 'vlan-by-purpose', why: `A trunk to a single ${what}; the plan gives it one VLAN, untagged.` };
  return { ok: true, rule: 'vlan-by-purpose', why: `On ${vl(port.native)}, as the plan says.` };
}
