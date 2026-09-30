// What a comms room (MDF or IDF) is for, worked out from its racks, their gear and the patch cables
// recorded in them: which floors and rooms it serves, its uplinks, its power, how much space and how
// many ports are used and free, and the PoE budget the vendor states. Nothing is guessed: what the
// data does not say comes back as null, and the page says "Not recorded".
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { racks, rackGear, spaces, sites, commsRooms, networkPath, KIND, modelName, models, incidents, projects, STAGE_LABEL, href, plural } from './data.mjs';
import { cablesInRack } from './stock.mjs';
import { lifeOf } from './refresh.mjs';

// Kinds of rack item, grouped for the colour key.
export const RACK_GROUP = {
  'patch-panel': 'patch', 'fibre-panel': 'patch',
  switch: 'switch', shelf: 'switch', codec: 'switch',
  firewall: 'edge', isp: 'edge',
  oob: 'mgmt', wlc: 'mgmt',
  ups: 'power', battery: 'power', pdu: 'power',
  'cable-manager': 'space', blank: 'space', reserved: 'space',
};
export const GROUP_LABEL = { patch: 'Patching', switch: 'Switching', edge: 'Internet edge', mgmt: 'Management', power: 'Power', space: 'Free space' };
export const KIND_LABEL = { 'patch-panel': 'Patch panel', 'fibre-panel': 'Fibre patch', switch: 'Switch', firewall: 'Firewall', isp: 'Provider', ups: 'UPS', battery: 'Battery', pdu: 'Power', 'cable-manager': 'Cable manager', shelf: 'Shelf', codec: 'Codec', oob: 'Out-of-band', wlc: 'Wireless controller', blank: 'Blank', reserved: 'Free space' };

export const racksIn = (spaceId) => Object.values(racks).filter((r) => r.space === spaceId).sort((a, b) => a.id.localeCompare(b.id));

// "1-36" or "47" to a list of numbers.
const portList = (s) => {
  if (s === undefined || s === null || s === '') return [];
  const [lo, hi] = String(s).split('-').map(Number);
  if (!Number.isFinite(lo)) return [];
  const out = [];
  for (let n = lo; n <= (Number.isFinite(hi) ? hi : lo); n++) out.push(n);
  return out;
};
const itemAt = (rack, u) => rack.items.find((it) => u >= it.u && u < it.u + it.size) ?? null;
const gearOf = (it) => (it?.gear ? rackGear[it.gear] ?? null : null);
const shortModel = (g) => (g ? `${g.manufacturer.split(' ')[0]} ${g.model}` : null);
const isAccess = (it) => (it.kind === 'switch' && gearOf(it)?.kind === 'access-switch') || it.kind === 'shelf';
const isCore = (it) => it.kind === 'switch' && gearOf(it)?.kind === 'core-switch';
const floorName = (site, fid) => sites[site]?.floors?.find((f) => f.id === fid)?.name ?? (fid ? `Floor ${fid}` : 'Floor not recorded');
const roomName = (s) => `${s.number ? `${s.number} ` : ''}${s.name}`;

// One end of a patch cable, in words: "Access switch 1, ports 1 to 36".
export function endText(rack, e) {
  if (!e) return '';
  const ports = e.ports ? `${String(e.ports).includes('-') ? 'ports' : 'port'} ${String(e.ports).replace('-', ' to ')}` : '';
  if (!e.u) return [e.device, ports].filter(Boolean).join(', ');
  const other = e.rack && e.rack !== rack.id ? racks[e.rack] : null;
  const it = itemAt(other ?? rack, e.u);
  const name = it ? it.label : `U${e.u}`;
  return `${other ? `${other.name}, ` : ''}${name}${ports ? `, ${ports}` : ''}`;
}

// The unit page of the recorded device at one end of a patch cable, when there is one.
function unitLink(rack, e) {
  if (!e?.u) return null;
  const r = e.rack && e.rack !== rack.id ? racks[e.rack] : rack;
  const it = r ? itemAt(r, e.u) : null;
  const p = it?.position ? spaces[r.space]?.positions.find((x) => x.position === it.position) : null;
  return p?.current ? href(`/device/?tag=${p.current.asset_tag}`) : null;
}

export function commsFacts(space) {
  const rs = racksIn(space.id);
  const items = rs.flatMap((r) => r.items.map((it) => ({ ...it, rack: r })));
  const cables = rs.flatMap((r) => cablesInRack(r.id).map((c) => ({ ...c, rack: r, fromText: endText(r, c.connects?.from), toText: endText(r, c.connects?.to),
    fromLink: unitLink(r, c.connects?.from), toLink: unitLink(r, c.connects?.to), cableLink: href(`/cables/?site=${c.site}#cb-${c.id}`) })));
  const isMdf = space.space_type === 'mdf';

  // Serves: the rooms whose data outlets are patched here, by floor. An MDF also feeds every IDF on its site.
  const others = Object.values(spaces).filter((s) => s.site === space.site && s.id !== space.id && KIND(s) !== 'comms');
  const direct = others.filter((s) => networkPath(s).idf?.id === space.id);
  const floorsOf = (list) => {
    const m = new Map();
    for (const s of list) { if (!m.has(s.floor)) m.set(s.floor, []); m.get(s.floor).push(s); }
    return [...m].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'en', { numeric: true })).map(([fid, rooms]) => ({ id: fid, name: floorName(space.site, fid), rooms: rooms.sort((a, b) => roomName(a).localeCompare(roomName(b), 'en', { numeric: true })) }));
  };
  const feeds = isMdf ? commsRooms.filter((c) => c.site === space.site && c.id !== space.id) : [];
  const via = feeds.map((c) => ({ room: c, floors: floorsOf(others.filter((s) => networkPath(s).idf?.id === c.id)) }));
  const noComms = isMdf ? others.filter((s) => !networkPath(s).idf) : [];
  const serves = {
    direct: floorsOf(direct),
    via,
    unplaced: floorsOf(noComms),
    roomCount: direct.length + via.reduce((n, v) => n + v.floors.reduce((k, f) => k + f.rooms.length, 0), 0) + noComms.length,
  };

  // Ports: copper ports on the access switches, and which of them a patch cable uses.
  const used = new Map();
  for (const c of cables) for (const e of [c.connects?.from, c.connects?.to]) {
    if (!e?.u || (e.rack && e.rack !== c.rack.id)) continue;
    const key = `${c.rack.id}:${itemAt(c.rack, e.u)?.u}`;
    if (!used.has(key)) used.set(key, new Set());
    for (const n of portList(e.ports)) used.get(key).add(n);
  }
  const usedOn = (it) => { const s = used.get(`${it.rack.id}:${it.u}`); return s ? [...s].filter((n) => n <= (it.ports ?? 0)).length : 0; };
  // A panel or switch is on the AV side when every cable on it is for AV and room systems (or, for a
  // switch, when it is the install position the room profile calls the AV switch).
  const purposesOn = (it) => cables.filter((c) => [c.connects?.from, c.connects?.to].some((e) => e?.u && (!e.rack || e.rack === it.rack.id) && itemAt(it.rack, e.u)?.u === it.u && it.rack.id === c.rack.id)).map((c) => c.purpose);
  const isAv = (it) => it.position === 'av-switch' || (() => { const p = purposesOn(it).filter((x) => x !== 'uplink'); return p.length > 0 && p.every((x) => x === 'av'); })();
  const row = (it) => ({ label: it.label, total: it.ports, used: usedOn(it), model: shortModel(gearOf(it)) });
  const access = items.filter((it) => isAccess(it) && it.ports && !isAv(it)).map(row);
  const avSwitches = items.filter((it) => isAccess(it) && it.ports && isAv(it)).map(row);
  const panels = items.filter((it) => it.kind === 'patch-panel' && it.ports && !isAv(it)).map(row);
  const avPanels = items.filter((it) => it.kind === 'patch-panel' && it.ports && isAv(it)).map(row);
  const sum = (list, k) => list.reduce((n, x) => n + x[k], 0);
  const tot = (list) => (list.length ? { total: sum(list, 'total'), used: sum(list, 'used') } : null);
  const ports = access.length ? { ...tot(access), switches: access, av: tot(avSwitches), known: cables.length > 0 } : null;
  const outlets = panels.length ? { total: sum(panels, 'total'), live: sum(panels, 'used'), panels, av: tot(avPanels), known: cables.length > 0 } : null;

  // Rack space: blanks and free space count as free; a reserved space with its own purpose is kept for it.
  const totalU = rs.reduce((n, r) => n + r.height_u, 0);
  const listed = items.reduce((n, it) => n + it.size, 0);
  const freeItems = items.filter((it) => it.kind === 'blank' || it.kind === 'reserved');
  const kept = freeItems.filter((it) => it.kind === 'reserved' && !/growth/i.test(it.label)).map((it) => ({ label: it.label, size: it.size }));
  const freeU = totalU - listed + freeItems.reduce((n, it) => n + it.size, 0);
  const rackSpace = rs.length ? { total: totalU, used: totalU - freeU, free: freeU, kept } : null;

  // Uplinks.
  const fibreUp = cables.filter((c) => c.typeGroup === 'fibre' || /fibre/i.test(c.typeLabel)).filter((c) => {
    const a = itemAt(c.rack, c.connects?.from?.u ?? 0), b = itemAt(c.rack, c.connects?.to?.u ?? 0);
    return [a, b].some((x) => x && (isAccess(x) || isCore(x))) && [a, b].some((x) => x?.kind === 'fibre-panel');
  });
  const path = networkPath(space);
  const uplinks = [];
  if (!isMdf) {
    const n = fibreUp.reduce((k, c) => k + c.quantity, 0);
    uplinks.push({ kind: 'up', title: path.mdf ? `To the MDF, ${roomName(path.mdf)}` : 'To the MDF', to: path.mdf ? `/rooms/${path.mdf.id}/` : null,
      sub: n ? `${n} ${n === 1 ? 'fibre' : 'fibres'} over the riser (${[...new Set(fibreUp.map((c) => c.typeLabel))].join(', ')}), from ${[...new Set(fibreUp.map((c) => itemAt(c.rack, c.connects.from.u)?.label).filter(Boolean))].join(' and ')}` : 'Fibre patching not recorded' });
  } else {
    const isp = items.filter((it) => it.kind === 'isp');
    for (const it of isp) uplinks.push({ kind: 'internet', title: it.label, sub: [it.owner, shortModel(gearOf(it))].filter(Boolean).join(', ') });
    const fw = items.filter((it) => it.kind === 'firewall');
    if (fw.length) uplinks.push({ kind: 'edge', title: fw.length === 2 ? 'A pair of firewalls' : `${fw.length} ${fw.length === 1 ? 'firewall' : 'firewalls'}`, sub: shortModel(gearOf(fw[0])) ?? '' });
    for (const c of feeds) uplinks.push({ kind: 'down', title: `Down to ${roomName(c)}`, to: `/rooms/${c.id}/`, sub: `${floorName(c.site, c.floor)}, over the riser fibre` });
  }
  const oob = items.filter((it) => it.kind === 'oob').map((it) => ({ label: it.label, model: shortModel(gearOf(it)), ports: it.ports ?? null }));

  // Power: the UPS, any battery pack, and the power strips on each feed.
  const upsIt = items.find((it) => it.kind === 'ups') ?? null;
  const pdus = rs.flatMap((r) => r.side_pdus ?? []);
  const power = {
    ups: upsIt ? { label: upsIt.label, model: shortModel(gearOf(upsIt)), detail: upsIt.detail ?? null } : null,
    battery: items.some((it) => it.kind === 'battery'),
    feeds: [...new Set(pdus.map((p) => p.feed))],
    strip: pdus.length ? shortModel(rackGear[pdus[0].gear]) : null,
    // The room's own record (data/spaces power, environment): its circuits, and the UPS as last measured.
    record: space.power ?? null,
    env: space.environment ?? null,
  };

  // PoE budget as the vendor states it, per access switch model. The draw is not measured anywhere.
  const poe = [];
  for (const it of items.filter((x) => x.kind === 'switch' && isAccess(x))) {
    const g = gearOf(it); const text = g?.facts?.['Poe budget'];
    const row = poe.find((p) => p.model === shortModel(g));
    if (row) row.count++; else poe.push({ model: shortModel(g), count: 1, text: text ? text.replace(/\s*\(.*?\)\s*$/, '').split(';')[0].trim() : null, full: text ?? null });
  }

  // Devices: every recorded unit in the room, with its rack position when it has one.
  const where = new Map(items.filter((it) => it.position).map((it) => [it.position, it]));
  const devices = space.positions.map((p) => {
    const it = where.get(p.position) ?? null, g = gearOf(it);
    return { p, it, u: it ? (it.size > 1 ? `U${it.u} to U${it.u + it.size - 1}` : `U${it.u}`) : null, uSort: it ? it.u : -1, label: it?.label ?? p.role ?? p.key,
      model: g ? `${g.manufacturer} ${g.model}` : p.model ? modelName(p.model) : null, stage: p.current?.stage ?? null, stageLabel: p.current ? STAGE_LABEL[p.current.stage] : null };
  }).sort((a, b) => b.uSort - a.uSort);
  const older = (space.olderKit ?? []).map((p) => ({ p, label: p.role, model: p.model ? modelName(p.model) : null, note: p.current?.notes ?? null }));

  return { racks: rs, items, cables, isMdf, serves, ports, outlets, rackSpace, uplinks, oob, power, poe, devices, older, servesLine: servesLine(serves, isMdf) };
}

// One line for the band: "Serves 32 rooms: the third floor directly, the fourth through 4.21".
function servesLine(serves, isMdf) {
  if (!serves.roomCount) return 'Serves no spaces recorded yet';
  const low = (s) => s.replace(/^Floor/, 'floor').replace(/^(\w)/, (c) => c.toLowerCase());
  const parts = [];
  if (serves.direct.length) parts.push(`the ${serves.direct.map((f) => low(f.name)).join(' and ')}${isMdf ? ' directly' : ''}`);
  for (const v of serves.via) if (v.floors.length) parts.push(`the ${v.floors.map((f) => low(f.name)).join(' and ')} through ${v.room.number}`);
  if (serves.unplaced.length) parts.push(`${serves.unplaced.map((f) => low(f.name)).join(' and ')} with no comms room recorded`);
  return `Serves ${serves.roomCount} ${serves.roomCount === 1 ? 'space' : 'spaces'}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

// Patching, grouped by the rack item at the near end of each run (top of the rack first): one line per
// device, its runs beneath. Each run keeps its cable's colour, so a group can show a strip of its cables.
export function patchGroups(facts) {
  const groups = new Map();
  for (const c of facts.cables) {
    const e = c.connects?.from, r = c.rack;
    const it = e?.u && (!e.rack || e.rack === r.id) ? itemAt(r, e.u) : null;
    const key = it ? `${r.id}:${it.u}` : `${r.id}:other`;
    if (!groups.has(key)) groups.set(key, { key, rack: r, item: it, label: it ? it.label : (e?.device ?? 'Other'), u: it ? it.u : -1, grp: it ? RACK_GROUP[it.kind] ?? 'space' : 'space', runs: [], cables: 0 });
    const g = groups.get(key);
    g.runs.push(c); g.cables += c.quantity;
  }
  return [...groups.values()].sort((a, b) => b.u - a.u).map((g) => ({ ...g, runs: g.runs.sort((a, b) => b.quantity - a.quantity || a.id.localeCompare(b.id)) }));
}

// The network refresh: older kit is replaced by UniFi site by site under the Network refresh
// playbook. A project built from it covers an office; until one exists the refresh is planned for 2027.
export const NETWORK_REFRESH = { playbook: 'network-refresh', year: 2027 };
export function refreshFor(siteId) {
  const prj = Object.values(projects).find((p) => p.playbook === NETWORK_REFRESH.playbook && p.site === siteId && p.phase !== 'closed');
  return prj ? { text: `being replaced by ${HOUSE_NETWORK.name} in ${prj.name}`, short: prj.name, link: href(`/projects/${String(prj.id).toLowerCase()}/`), year: null }
    : { text: `being replaced by ${HOUSE_NETWORK.name} in the network refresh, due ${NETWORK_REFRESH.year}`, short: `Network refresh, ${NETWORK_REFRESH.year}`, link: href(`/playbooks/${NETWORK_REFRESH.playbook}/`), year: NETWORK_REFRESH.year };
}

// The band's word on the house standard for one comms room: matches, older kit and when it is replaced, or no rack.
export function standardPill(space) {
  const st = standardFor(space), rf = refreshFor(space.site);
  if (!st.hasRack) return { tone: 'info', text: 'No rack recorded', st, rf };
  if (st.matches) return { tone: 'manage', text: st.replacing ? `${HOUSE_NETWORK.name}, old units to collect` : `${HOUSE_NETWORK.name} standard`, st, rf };
  return { tone: 'warn', text: rf.year ? `Older kit, refresh ${rf.year}` : `Older kit, ${rf.short}`, st, rf };
}

// ---------- Sizing a comms room (there is no standard rack) ----------
// A comms room is sized from the rooms it serves: their data outlets (from each room profile's outlets),
// how many workspaces and video rooms they are, and the PoE the devices in them draw where the vendor
// states it. From that: access ports with headroom, switches, patch panels, rack units with growth, and
// the PoE budget. The rules are house rules; public standards leave the figures to the designer.
export const SIZING_RULES = [
  { id: 'outlets', name: 'Data outlets', rule: 'One per data outlet in every space served, from the space type\'s outlets; a repeated space (desks) counts each desk.', source: 'The space types' },
  { id: 'headroom', name: 'Headroom', rule: '20 percent spare access ports above the outlets, rounded up, so a floor can add spaces without a new switch.', source: 'House rule. Structured cabling guides plan for spare capacity; TIA-568 sets no figure.' },
  { id: 'switches', name: 'Access switches', rule: 'Ports with headroom divided by the ports on the standard access switch, rounded up.', source: 'The standard\'s access switch' },
  { id: 'panels', name: 'Patch panels', rule: 'One 48-port panel per 48 outlets, rounded up, each with a cable manager.', source: 'House rule (Panduit 48-port panels, 2U)' },
  { id: 'poe', name: 'PoE budget', rule: 'The sum of what each PoE-powered device draws, as its vendor states (its PoE class where there is no figure). Devices with no figure are counted, not guessed.', source: 'The device models' },
  { id: 'rack', name: 'Rack space', rule: 'The units the parts take, plus 25 percent free for growth, rounded up to the next rack size (12U, 24U or 42U).', source: 'House rule' },
  { id: 'ups', name: 'UPS', rule: 'Not sized yet: the load and runtime are not recorded. The UPS in the standard is stated per rack.', source: 'Monitoring, when connected' },
];
const POE_CLASS_W = { 1: 4, 2: 7, 3: 15.4, 4: 30, 5: 45, 6: 60, 7: 75, 8: 90 };
const PANEL_PORTS = 48, PANEL_U = 2, HEADROOM = 0.2, GROWTH = 0.25, RACK_SIZES = [12, 24, 42];
const qtyMax = (q) => (typeof q === 'number' ? q : q && typeof q === 'object' ? q.max : null);
const isVideo = (opt) => opt.equipment.some((e) => e.requirement === 'required' && ['video-bar', 'codec'].includes(e.class));
// What a PoE-powered model draws, as the vendor states it: null when it is powered another way, 'unknown'
// when it is PoE-powered but no figure is recorded.
function poeDraw(model) {
  const m = models[model]; if (!m) return null;
  const inp = (m.power?.inputs ?? []).find((i) => i.type === 'poe' && (i.poe?.role ?? 'powered') === 'powered');
  if (!inp) return null;
  return inp.poe?.watts ?? inp.watts ?? POE_CLASS_W[inp.poe?.class] ?? m.power?.consumption_w?.max ?? m.power?.consumption_w?.typical ?? 'unknown';
}
export function sizeFor(space, facts = null) {
  const f = facts ?? commsFacts(space);
  const rooms = f.serves.direct.flatMap((fl) => fl.rooms);
  let outlets = 0, unknownRooms = 0, workspaces = 0, videoRooms = 0, poeW = 0, poeKnown = 0, poeUnknown = 0;
  for (const s of rooms) {
    const n = s.count ?? 1;
    if (n > 1) workspaces += n;
    if (isVideo(s.option)) videoRooms++;
    let known = true;
    for (const o of s.option.infrastructure ?? []) {
      if (o.service !== 'data') continue;
      const q = qtyMax(o.quantity);
      if (q == null) known = false; else outlets += q * n;
    }
    if (!known) unknownRooms++;
    for (const p of s.positions) {
      const w = poeDraw(p.model); if (w == null) continue;
      if (w === 'unknown') poeUnknown += p.units.length; else { poeW += w * p.units.length; poeKnown += p.units.length; }
    }
  }
  // The standard's parts: the current build option of this room's profile.
  const opt = space.type.keia_atlas.options.find((o) => !o.superseded_by) ?? space.option;
  const sw = opt.equipment.find((e) => e.key === 'access-switch');
  const swModel = sw?.model ? models[sw.model] : null;
  const portsEach = swModel ? swModel.ports.filter((x) => x.connector === 'rj45' && /^\d+$/.test(x.label ?? '')).length || 48 : 48;
  const withHeadroom = Math.ceil(outlets * (1 + HEADROOM));
  const switches = Math.ceil(withHeadroom / portsEach);
  const panels = Math.ceil(outlets / PANEL_PORTS);
  // Rack units: the parts of the standard, then growth.
  const partsU = switches * 1 + panels * (PANEL_U + 1) + 1 /* fibre */ + 1 /* out-of-band */ + 2 /* UPS */ + 2 /* battery */
    + opt.equipment.filter((e) => e.key !== 'access-switch' && e.requirement === 'required').reduce((n, e) => n + (typeof e.quantity === 'number' ? e.quantity : 1), 0)
    + (f.isMdf ? 2 : 0) /* provider handoffs and cellular */;
  const withGrowth = Math.ceil(partsU * (1 + GROWTH));
  const rackU = RACK_SIZES.find((u) => u >= withGrowth) ?? RACK_SIZES[RACK_SIZES.length - 1];
  const has = {
    outlets: f.outlets?.total ?? null, ports: f.ports?.total ?? null, switches: f.ports?.switches.length ?? 0,
    poeW: f.items.filter((it) => it.kind === 'switch' && isAccess(it) && gearOf(it)?.device_model && models[gearOf(it).device_model]?.power?.poe_budget_w).reduce((n, it) => n + models[gearOf(it).device_model].power.poe_budget_w, 0) || null,
    rackU: f.rackSpace?.total ?? null, ups: f.power.ups?.model ?? null,
  };
  const verdict = (need, got, unit = '') => (got == null ? { tone: 'faint', text: 'Not recorded' } : got >= need ? { tone: 'manage', text: got - need > 0 ? `${got - need}${unit} to spare` : 'Exactly enough' } : { tone: 'bad', text: `Short by ${need - got}${unit}` });
  return {
    rooms: rooms.length, workspaces, videoRooms, unknownRooms,
    outlets, headroom: Math.round(HEADROOM * 100), withHeadroom, portsEach, switches, panels, poeW: Math.round(poeW), poeKnown, poeUnknown, partsU, growth: Math.round(GROWTH * 100), withGrowth, rackU,
    has,
    rows: [
      { id: 'outlets', name: 'Data outlets', need: `${outlets}`, needNote: `${plural(rooms.length, 'space')}${workspaces ? `, ${workspaces} desks` : ''}${videoRooms ? `, ${plural(videoRooms, 'video room')}` : ''}${unknownRooms ? `; ${plural(unknownRooms, 'space')} set per project` : ''}`, have: has.outlets != null ? `${has.outlets}` : null, haveNote: has.outlets != null ? 'panel ports' : null, v: verdict(outlets, has.outlets) },
      { id: 'ports', name: 'Access ports', need: `${withHeadroom}`, needNote: `${outlets} + ${Math.round(HEADROOM * 100)}% headroom`, have: has.ports != null ? `${has.ports}` : null, haveNote: has.ports != null ? `on ${plural(has.switches, 'switch', 'switches')}` : null, v: verdict(withHeadroom, has.ports) },
      { id: 'switches', name: 'Access switches', need: `${switches}`, needNote: `${portsEach} ports each`, have: `${has.switches}`, haveNote: null, v: verdict(switches, has.switches) },
      { id: 'poe', name: 'PoE budget', need: poeKnown ? `${Math.round(poeW)} W` : 'Not recorded', needNote: `${poeKnown ? `${plural(poeKnown, 'device')} as the vendors state` : ''}${poeUnknown ? `${poeKnown ? '; ' : ''}${plural(poeUnknown, 'PoE device')} with no figure` : ''}` || 'no PoE devices recorded', have: has.poeW != null ? `${has.poeW} W` : null, haveNote: has.poeW != null ? 'as the vendor states' : null, v: poeKnown ? verdict(Math.round(poeW), has.poeW, ' W') : { tone: 'faint', text: 'Draw not recorded' } },
      { id: 'rack', name: 'Rack space', need: `${rackU}U`, needNote: `${partsU}U of parts + ${Math.round(GROWTH * 100)}% growth`, have: has.rackU != null ? `${has.rackU}U` : null, haveNote: null, v: verdict(rackU, has.rackU, 'U') },
      { id: 'ups', name: 'UPS', need: 'Not sized', needNote: 'load and runtime not recorded', have: has.ups, haveNote: has.ups ? 'in the rack' : null, v: { tone: 'faint', text: has.ups ? 'Not checked' : 'Not recorded' } },
    ],
  };
}

// ---------- The rack, item by item (RackView) ----------
// Everything the rack drawing, its labels and its card need about each item, worked out once at build
// time: the product, the ports its recorded patch cables use (with each cable's colour), its uplinks,
// the PoE budget the vendor states, the unit recorded at its position and its health, and what stood
// there before a recorded replacement. Nothing is guessed: a missing fact comes back null.
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const makerModel = (g) => (g ? `${g.manufacturer} ${g.model}` : null);
const NETWORK_KINDS = new Set(['switch', 'firewall', 'wlc']);
const isNetworkItem = (it) => NETWORK_KINDS.has(it.kind);
const uText = (it) => (it.size > 1 ? `U${it.u} to U${it.u + it.size - 1}` : `U${it.u}`);
const portsText = (list) => {
  if (!list.length) return '';
  const s = [...list].sort((a, b) => a - b), runs = [];
  for (const n of s) { const last = runs[runs.length - 1]; if (last && n === last[1] + 1) last[1] = n; else runs.push([n, n]); }
  const t = runs.map(([a, b]) => (a === b ? `${a}` : `${a} to ${b}`)).join(', ');
  return `${s.length === 1 ? 'port' : 'ports'} ${t}`;
};
const openIncidentsFor = (tag) => (tag ? Object.values(incidents).filter((v) => v.subject?.device === tag && v.state !== 'resolved').length : 0);
// UniFi is the house standard for the IT network (decision 0028).
export const HOUSE_NETWORK = { id: 'unifi', name: 'UniFi' };

export function rackItems(rack, space = null) {
  const cables = rack.space ? cablesInRack(rack.id) : [];
  const idxAt = (u) => rack.items.findIndex((it) => u >= it.u && u < it.u + it.size);
  const per = rack.items.map(() => ({ used: new Map(), cables: [], ports: {} }));
  for (const c of cables) {
    const ends = [c.connects?.from, c.connects?.to];
    ends.forEach((e, k) => {
      if (!e?.u || (e.rack && e.rack !== rack.id)) return;
      const i = idxAt(e.u); if (i < 0) return;
      for (const n of portList(e.ports)) per[i].used.set(n, c.hex);
      const o = ends[1 - k];
      const oi = o?.u && (!o.rack || o.rack === rack.id) ? idxAt(o.u) : -1;
      // Port by port: what each port's cable reaches. When both ends are runs of the same length, port n
      // of one run meets the matching port of the other; otherwise the far end is named as recorded.
      const here = portList(e.ports), there = portList(o?.ports);
      here.forEach((n, j) => {
        const far = there.length === here.length ? { ...o, ports: String(there[j]) } : o;
        per[i].ports[n] = { hex: c.hex, type: c.typeLabel, colour: c.colourName, purpose: c.purposeName, length: c.lengthText ?? null,
          to: endText(rack, far) || 'Not recorded', toLink: unitLink(rack, o), toItem: oi, cable: href(`/cables/?site=${c.site}#cb-${c.id}`), note: c.notes ?? null };
      });
      per[i].cables.push({ id: c.id, n: c.quantity, type: c.typeLabel, hex: c.hex, colour: c.colourName, purpose: c.purpose, purposeName: c.purposeName, group: c.typeGroup,
        here: portsText(portList(e.ports)), there: endText(rack, o), other: oi, note: c.notes ?? null });
    });
  }
  return rack.items.map((it, i) => {
    const g = it.gear ? rackGear[it.gear] ?? null : null;
    const m = g?.device_model ? models[g.device_model] ?? null : null;
    const p = it.position && space ? space.positions.find((x) => x.position === it.position) ?? null : null;
    const was = it.replaced ? rackGear[it.replaced.gear] ?? null : null;
    const used = per[i].used, total = it.ports ?? null;
    const usedN = total ? [...used.keys()].filter((n) => n <= total).length : used.size;
    const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
    const uplinks = per[i].cables.filter((c) => c.purpose === 'uplink' || c.group === 'fibre').map((c) => `${cap(c.here) || 'Here'} to ${c.there} (${c.n} × ${c.type})${c.note ? `. ${c.note.replace(/\.$/, '')}` : ''}`);
    const poeW = m?.power?.poe_budget_w ?? null;
    const poeFact = g?.facts?.['Poe budget'] ?? null;
    const unit = p?.current ?? null, stage = unit?.stage ?? null;
    const open = openIncidentsFor(unit?.asset_tag);
    const health = !p ? null : open ? { state: 'bad', text: `${open} open ${open === 1 ? 'incident' : 'incidents'}` } : stage === 'manage' ? { state: 'ok', text: 'In service, no open incidents' } : stage ? { state: 'warn', text: STAGE_LABEL[stage] } : { state: 'off', text: 'No unit recorded' };
    return {
      i, u: it.u, size: it.size, uText: uText(it), kind: it.kind, kindLabel: KIND_LABEL[it.kind] ?? it.kind, grp: RACK_GROUP[it.kind] ?? 'space',
      label: it.label, detail: it.detail ?? null, owner: it.owner ?? g?.owner ?? null,
      // A recorded device with no rack product (the AV switch on its shelf) takes its model from the install.
      model: makerModel(g) ?? (p?.model && models[p.model] ? makerModel(models[p.model]) : null), short: shortModel(g) ?? (p?.model && models[p.model] ? shortModel(models[p.model]) : null),
      part: g?.part_number ?? null, does: g?.does ?? null, standard: g?.standard ?? null,
      // Network kit that is not the house standard is older kit, replaced in the site's network refresh.
      older: isNetworkItem(it) && !!g && g.standard !== HOUSE_NETWORK.id ? refreshFor(rack.space ? spaces[rack.space]?.site : null) : null,
      facts: g?.facts ?? {}, leds: g?.leds ?? {}, sources: g?.sources ?? [], modelPage: g?.device_model ? href(`/models/${g.device_model}/`) : null,
      network: isNetworkItem(it),
      ports: total ? { total, used: usedN, free: Math.max(0, total - usedN), known: cables.length > 0 } : null,
      used,
      poe: poeW ? `${poeW} W PoE budget, as the vendor states it` : poeFact ? poeFact.replace(/\s*\(.*?\)\s*$/, '') : null,
      uplinks,
      cables: per[i].cables.map(({ id, n, type, hex, colour, purposeName, here, there, other }) => ({ id, n, type, hex, colour, purposeName, here, there, other })),
      links: [...new Set(per[i].cables.map((c) => c.other).filter((x) => x >= 0 && x !== i))],
      portInfo: per[i].ports,
      // What the vendor says about each numbered port (speed and PoE), from the device model when there is one.
      portNotes: m ? Object.fromEntries(m.ports.filter((x) => /^\d+$/.test(x.label ?? '')).map((x) => [x.label, (x.notes ?? '').split('. ')[0].replace(/\.$/, '')])) : {},
      unit: p ? { host: p.hostname ?? null, tag: unit?.asset_tag ?? null, serial: unit?.serial ?? null, since: fmtDate(unit?.installed), stage, stageLabel: stage ? STAGE_LABEL[stage] : null,
        link: unit ? href(`/device/?tag=${unit.asset_tag}`) : null, outgoing: p.legacy ? { tag: p.legacy.asset_tag, note: p.legacy.notes ?? null, link: href(`/device/?tag=${p.legacy.asset_tag}`) } : null } : null,
      health,
      before: it.replaced ? { gear: it.replaced.gear, model: makerModel(was), short: shortModel(was), face: was?.face ?? null, date: fmtDate(it.replaced.date), reason: it.replaced.reason ?? null } : null,
    };
  });
}

// ---------- The house standard, per comms room ----------
// Whether a comms room's rack matches the house network standard (UniFi), and if not, which older kit is
// in it and when the policy says it is due for replacement (install year plus the class's years in service).
export function standardFor(space) {
  const opt = space.option;
  const rs = racksIn(space.id);
  const net = rs.flatMap((r) => r.items.filter((it) => isNetworkItem(it) && it.gear).map((it) => rackGear[it.gear]).filter(Boolean));
  const older = net.filter((g) => g.standard !== HOUSE_NETWORK.id);
  const olderNames = [...new Map(older.map((g) => [g.id, shortModel(g)])).values()];
  const dues = space.positions.filter((p) => p.current && ['network-switch', 'network-gateway'].includes(p.cls) && !(p.model && models[p.model]?.manufacturer === 'Ubiquiti') && !(p.model && /netgear/.test(p.model)))
    .map((p) => (p.current.installed ? +p.current.installed.slice(0, 4) + (lifeOf(p.cls) ?? 0) : null)).filter(Boolean);
  const matches = rs.length > 0 && net.length > 0 && older.length === 0;
  const superseded = opt?.superseded_by ? space.type.keia_atlas.options.find((o) => o.id === opt.superseded_by) ?? null : null;
  return {
    optionName: opt?.name ?? null, current: !opt?.superseded_by, supersededBy: superseded?.name ?? null,
    hasRack: rs.length > 0, matches, older: olderNames, due: dues.length ? Math.min(...dues) : null,
    replacing: space.positions.some((p) => p.legacy),
  };
}

// Typical rack layouts (data/rack-layouts): what a room profile's build option looks like in the rack
// before any room is built to it. Read here, beside the racks, so the count of real racks stays true.
const LAYOUTS = path.join(process.cwd(), 'data', 'rack-layouts');
export const rackLayouts = existsSync(LAYOUTS) ? readdirSync(LAYOUTS).filter((n) => n.endsWith('.yaml')).sort().map((n) => parse(readFileSync(path.join(LAYOUTS, n), 'utf8'))) : [];
export const layoutFor = (typeId, optId) => rackLayouts.find((r) => r.space_type === typeId && r.option === optId) ?? null;
