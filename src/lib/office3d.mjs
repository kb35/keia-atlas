// The office in 3D (decision 0030): what the 3D view and its 2D floor plan need, from the
// building model (src/lib/floors.mjs), made small enough to put in the page. Build time only.
//
//   sceneOf(M)   floors (outline, core, corridors, areas, trays), the risers, rooms (footprint, height, odd
//                parts, desks, variations in words), racks (every item at its height), access points, runs (a
//                3D path each, colour from the house cable standard), the two internet circuits (from the
//                building entry, up the riser, to the MDF's fibre panel) and the building entries.
//   pathsOf(M)   every trace the page can show, from floors.trace(): one list of hops (each hop once) and, per
//                selection ("room:<id>", "ap:<id>", "run:<id>", "rack:<id>", "circuit:<id>"), the hop numbers
//                in order from the thing to the internet. Each hop says what to light in the scene (`lit`),
//                what the live feed reports it by (`h`) and where it links (`to`, without the site's base).
//
// Coordinates stay the building's: x east and y north on the plan, z up, metres from the outline's south-west
// corner at ground level. The client turns them into three.js axes.
import { trace, panelZ } from './floors.mjs';

const r2 = (v) => Math.round(v * 100) / 100;
const pretty = (s) => String(s).replace(/#(\d+)/, ' $1').replace(/[-/]/g, ' ');
const MONITOR_FIRST = ['video-bar', 'codec', 'desk-video-device', 'touch-controller', 'scheduler-panel'];

export function sceneOf(M) {
  const f0 = M.floors[0];
  // The floors below the first modelled one, drawn faint so the building stands on the ground (not modelled).
  const ghosts = [];
  for (let z = f0.level_m - f0.slab_to_slab_m; z > -0.01; z -= f0.slab_to_slab_m) ghosts.push(r2(z));
  const floors = M.floors.map((f) => ({
    id: f.id, name: f.name, level: f.level_m, h: f.slab_to_slab_m, ceil: f.ceiling_m, void: f.raised_floor_m, outline: f.outline,
    core: f.core.map((c) => ({ id: c.id, k: c.kind, n: c.name, r: c.rect, circ: c.circulation ? 1 : 0 })),
    corr: f.corridors.map((c) => ({ n: c.name, r: c.rect })),
    areas: f.areas.map((a) => ({ k: a.kind, n: a.name, r: a.rect })),
    trays: f.trays.map((t) => ({ id: t.id, k: t.kind, n: t.name, p: t.path, z: t.z_m, w: t.width_mm, d: t.depth_mm, runs: t.runs, cap: t.capacity ?? null })),
  }));
  const risers = [...new Map(M.floors.flatMap((f) => f.risers).map((x) => [x.id, x])).values()]
    .map((x) => ({ id: x.id, n: x.name, r: x.rect, z0: x.from_level_m, z1: x.to_level_m, carries: x.carries, note: x.notes }));
  const rooms = Object.values(M.rooms).filter((r) => r.rect).map((r) => {
    const f = M.floors.find((x) => x.id === r.floor);
    return {
      id: r.id, no: r.number, n: r.name, f: r.floor, r: r.rect, h: r.geo.ceiling_m ?? f.ceiling_m, type: r.space_type,
      bank: r.count > 1 ? 1 : 0, comms: ['mdf', 'idf'].includes(r.space_type) ? 1 : 0,
      odd: r.geo.odd.filter((o) => o.rect).map((o) => ({ k: o.kind, r: o.rect })),
      desks: r.desks.map((d) => d.at), door: doorOf(r), vars: r.variations.map((v) => v.text),
      outlets: r.outlets.length, used: r.outlets.filter((o) => o.dev).length,
    };
  });
  const racks = M.racks.filter((k) => k.at).map((k) => ({
    id: k.id, n: k.name, f: k.floor, room: k.space, at: k.at, face: k.facing, hU: k.height_u,
    items: k.items.map((it) => ({ u: it.u, s: it.size, k: it.kind, l: it.label, h: it.health })),
  }));
  const aps = M.aps.map((a) => ({ id: a.id, host: a.hostname, model: a.model === 'unifi-u7-pro-max' ? 'U7 Pro Max' : 'U7 Pro', f: a.floor, at: a.at, tag: a.asset_tag, run: a.run ?? null, area: a.area }));
  const deviceAt = new Map();
  for (const r of Object.values(M.rooms)) for (const o of r.outlets) deviceAt.set(o.key, { room: r, o, tag: o.dev ? r.positions?.find((p) => p.position === o.dev)?.units.find((u) => !u.legacy)?.asset_tag ?? null : null });
  const runs = M.runs.filter((r) => r.path).map((r) => {
    const end = r.outletKey ? deviceAt.get(r.outletKey) : null;
    const ap = r.to?.access_point ? M.aps.find((a) => a.id === r.to.access_point) : null;
    return {
      id: r.id, f: r.floor ?? null, bb: r.kind === 'backbone' ? 1 : 0, p: r.path, hex: r.hex, pur: r.purpose, type: r.type, len: r.length_m,
      test: r.test?.result ?? null, v: r.via ?? [], room: end?.room.id ?? null, out: end ? `${end.o.unit ? `${pretty(end.o.unit)}, ` : ''}plate ${end.o.plate}, data ${end.o.n}` : ap ? `Ceiling jack, ${ap.hostname}` : null,
      dev: end?.o.dev ? pretty(end.o.dev.split('/').pop()) : ap ? 'access point' : null, tag: end?.tag ?? ap?.asset_tag ?? null, ap: ap?.id ?? null,
    };
  });
  const rackOf = (id) => M.racks.find((k) => k.id === id);
  const entries = M.entry_points.map((e) => ({ id: e.id, n: e.name, at: e.at, z: e.level_m, note: e.notes }));
  const circuits = M.circuits.map((c, i) => {
    const e = entries.find((x) => x.id === c.entry), rk = rackOf(c.panel.rack), riser = risers.find((x) => c.lead_in?.via?.includes(x.id));
    const f = M.floors.find((x) => x.id === rk?.floor);
    const ladder = f?.trays.find((t) => t.kind === 'ladder');
    const off = i ? 0.09 : -0.09;   // the two lead-ins side by side in the riser
    const rc = riser ? [(riser.r[0] + riser.r[2]) / 2 + off, (riser.r[1] + riser.r[3]) / 2] : e.at;
    const zl = r2(f.level_m + (ladder?.z_m ?? 2.4));
    const path = e && rk ? [
      [e.at[0] + off, e.at[1] + (e.at[1] > 1 ? 7 : -7), 0.3], [e.at[0] + off, e.at[1], 0.3], [rc[0], rc[1], 0.3], [rc[0], rc[1], zl],
      ...(ladder ? ladder.path.slice(1, Math.max(1, ladder.path.findIndex((q) => Math.hypot(q[0] - rk.at[0], q[1] - rk.at[1]) < 0.05))).map((p) => [p[0] + off / 2, p[1], zl]) : []),
      [rk.at[0] + off / 2, rk.at[1], zl], [rk.at[0] + off / 2, rk.at[1], r2(f.level_m + panelZ(c.panel.u))],
    ].map((p) => p.map(r2)) : null;
    return { id: c.id, n: c.name, prov: c.provider, role: c.role, type: c.type, bw: c.bandwidth, entry: c.entry, p: path, len: c.lead_in?.length_m ?? null, rack: c.panel.rack, v: c.lead_in?.via ?? [] };
  });
  return { site: M.site, name: M.siteName, fiction: M.fictional, ghosts, floors, risers, rooms, racks, aps, runs, circuits, entries };
}

// Where the door is on the plan: a short segment on the room's outline (for the 3D gap and the plan's mark).
export function doorOf(r) {
  const g = r.geo, d = g.door;
  if (!d || r.count > 1) return null;
  const at = { back: (t) => [t, 0], front: (t) => [t, g.D], left: (t) => [0, t], right: (t) => [g.W, t] }[d.wall];
  if (!at) return null;
  return [g.toFloor(at(d.from_m)), g.toFloor(at(d.to_m))].map((p) => [r2(p[0]), r2(p[1])]);
}

// ---------- Paths to the internet ----------
export function pathsOf(M, site) {
  const hops = [], index = new Map(), traces = {};
  const cableRack = new Map(M.cables.map((c) => [c.id, c.where?.rack ?? null]));
  const rackSpace = new Map(M.racks.map((k) => [k.id, k.space]));
  const add = (h) => { const k = JSON.stringify(h); if (!index.has(k)) { index.set(k, hops.length); hops.push(h); } return index.get(k); };
  const roomOfOutlet = (key) => (key && !key.startsWith('ap:') ? key.split(':')[0] : null);
  // One hop from floors.trace(), in the page's words, with what it lights and where it links.
  const hopOf = (h) => {
    const tag = typeof h.health === 'string' && h.health.startsWith('AG-') ? h.health : null;
    const out = { k: h.kind, l: h.label };
    if (h.health) out.h = h.health;
    if (h.kind === 'device' || h.kind === 'room-device') {
      const room = h.id?.includes('/') ? h.id.split('/')[0] : null;
      out.lit = M.rooms[room] ? `room:${room}` : `ap:${h.id}`;
      if (tag) out.to = `/device/?tag=${tag}`;
      else if (M.rooms[room]) out.to = `/rooms/${room}/`;
      if (h.hostname) out.sub = h.hostname;
    } else if (h.kind === 'outlet') {
      const room = roomOfOutlet(h.id);
      out.lit = room ? `room:${room}` : `ap:${String(h.id).slice(3)}`;
      if (room) out.to = `/rooms/${room}/`;
    } else if (h.kind === 'run' || h.kind === 'riser') {
      out.lit = `run:${h.id}`;
      out.sub = [h.length_m ? `${h.length_m} m` : null, h.type ? h.type.replace('cat6a', 'Cat6A').replace('fibre-om4', 'OM4 fibre') : null, h.test ? `test ${h.test === 'pass' ? 'passed' : h.test}` : null].filter(Boolean).join(', ');
    } else if (h.kind === 'patch') {
      const rack = cableRack.get(h.id);
      out.lit = rack ? `rack:${rack}` : null;
      out.to = `/cables/?site=${site}#cb-${h.id}`;
      out.l = `Patch cord ${h.id}${h.purpose ? `, ${h.purpose.replace(/-/g, ' ')}` : ''}`;
    } else if (h.rack) {
      const c = h.kind === 'isp' ? M.circuits.find((x) => `isp:${x.id}` === h.id) : null;
      const [, rackId, u] = c ? [null, c.handoff.rack, c.handoff.u] : h.id.split(':');
      out.lit = `item:${rackId}:${u}`;
      const space = h.room ?? rackSpace.get(rackId);
      out.to = tag ? `/device/?tag=${tag}` : `/rooms/${space}/#rack`;
      out.sub = M.rooms[space]?.name ?? null;
    } else if (h.kind === 'lead-in' || h.kind === 'circuit') {
      out.lit = `circuit:${h.health}`;
      if (h.kind === 'circuit') out.sub = `Bandwidth: ${h.bandwidth === 'Not recorded' ? 'not recorded' : h.bandwidth}`;
    } else if (h.kind === 'entry') out.lit = `entry:${h.id}`;
    else if (h.kind === 'internet') out.lit = 'internet';
    if (!out.sub) delete out.sub;
    return out;
  };
  const keep = (sel, t, pre = []) => { if (t?.hops?.length) traces[sel] = [...pre, ...t.hops.map(hopOf)].map(add); };

  for (const a of M.aps) keep(`ap:${a.id}`, trace(M, a.id));
  for (const r of M.runs) {
    if (r.kind === 'backbone') { keep(`run:${r.id}`, trace(M, r.id)); continue; }
    if (r.to?.access_point) { keep(`run:${r.id}`, trace(M, r.to.access_point)); continue; }
    const room = M.rooms[r.to?.space]; const o = room?.outlets.find((x) => x.key === r.outletKey);
    const t = trace(M, r.outletKey);
    const pre = [];
    if (o?.dev) {
      const p = room.positions?.find((x) => x.position === o.dev); const tag = p?.units.find((u) => !u.legacy)?.asset_tag ?? null;
      pre.push({ k: 'device', l: `${room.name}, ${pretty(o.dev)}`, lit: `room:${room.id}`, ...(tag ? { h: tag, to: `/device/?tag=${tag}` } : { to: `/rooms/${room.id}/` }), ...(p?.hostname ? { sub: p.hostname } : {}) });
    }
    keep(`run:${r.id}`, t, pre);
  }
  // A room: the path from its main networked device (a video bar or codec first), else from its first cabled outlet.
  for (const room of Object.values(M.rooms)) {
    const ps = [...(room.positions ?? [])].filter((p) => p.hostname).sort((a, b) => rank(a) - rank(b));
    let done = false;
    for (const p of ps) { const t = trace(M, `${room.id}/${p.position}`); if (t?.complete) { keep(`room:${room.id}`, t); done = true; break; } }
    if (!done) { const o = room.outlets.find((x) => x.run); if (o) keep(`room:${room.id}`, trace(M, o.key)); }
  }
  // A rack: its way out, from its first access switch to the internet.
  for (const k of M.racks) {
    const run = M.runs.find((r) => r.kind === 'horizontal' && r.from.rack === k.id);
    const t = run ? trace(M, run.id) : null;
    const i = t?.hops.findIndex((h) => h.kind === 'switch') ?? -1;
    if (i >= 0) traces[`rack:${k.id}`] = traces[`room:${k.space}`] = t.hops.slice(i).map(hopOf).map(add);
  }
  // A circuit: from the firewall it feeds, out through the provider's box, the fibre panel and the lead-in.
  for (const c of M.circuits) {
    const rk = M._racks[c.panel.rack];
    const item = (u) => rk.items.find((it) => u >= it.u && u < it.u + it.size);
    const tagAt = (it) => { const h = M.racks.find((x) => x.id === rk.id)?.items.find((x) => x.u === it.u)?.health; return h; };
    const fw = item(c.firewall.u), isp = item(c.handoff.u), fp = item(c.panel.u);
    const ep = M.entry_points.find((e) => e.id === c.entry);
    const list = [
      { kind: fw.kind, id: `item:${rk.id}:${fw.u}`, label: `${fw.label}, U${fw.u}, port ${c.firewall.port}`, rack: rk.id, room: rk.space, health: tagAt(fw) },
      c.cables[1] ? { kind: 'patch', id: c.cables[1], purpose: 'uplink' } : null,
      { kind: 'isp', id: `item:${rk.id}:${isp.u}`, label: `${c.provider}'s box (the handoff), U${isp.u}`, rack: rk.id, room: rk.space, health: c.id },
      c.cables[0] ? { kind: 'patch', id: c.cables[0], purpose: 'fibre-sm' } : null,
      { kind: 'fibre-panel', id: `port:${rk.id}:${fp.u}:${String(c.panel.ports).split('-')[0]}`, label: `${fp.label}, U${fp.u}, ports ${String(c.panel.ports).replace('-', ' and ')}`, rack: rk.id, room: rk.space, health: tagAt(fp) },
      { kind: 'lead-in', id: `${c.id}-lead-in`, label: `${c.provider}'s fibre from the building entry${c.lead_in?.length_m ? `, ${c.lead_in.length_m} m` : ''}`, health: c.id },
      { kind: 'entry', id: c.entry, label: ep?.name ?? 'Building entry' },
      { kind: 'circuit', id: c.id, label: `${c.name}, ${c.provider} (${c.role})`, bandwidth: c.bandwidth ?? 'Not recorded', health: c.id },
      { kind: 'internet', id: 'internet', label: 'The internet' },
    ].filter(Boolean);
    traces[`circuit:${c.id}`] = list.map(hopOf).map(add);
  }
  return { hops, traces };
}
const rank = (p) => { const k = p.position.split('#')[0]; const i = MONITOR_FIRST.indexOf(k); return i < 0 ? 99 : i; };
