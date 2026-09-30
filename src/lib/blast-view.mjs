// The blast-radius explorer and change approvals as the pages show them: src/lib/blast.mjs joined to the building
// models, the spaces, the rack gear, the vendors and the changes. Worked out once at build time; the page carries
// the result as data and BlastRadius.astro's script only takes unions of it (per port, per hour).
import { building } from './floors.mjs';
import { spaces as SPACES, sites, KIND, models, rackGear, vendors, DEMO_TODAY, SITE_ORDER } from './data.mjs';
import { JOBS } from './vendors.mjs';
import { stateOf, windowOf, lineOf } from './blast-render.mjs';
import { cutOff, portsOf, uplinksOf, itemNode, circuitNodes, servicesOf, meetingsOf, approvalFor, APPROVAL } from './blast.mjs';
import { readSwitchPorts, groupsOf } from './switchcore.mjs';

const SWITCH_PORTS = readSwitchPorts();

/** The demo's "now" for bookings: noon on the demo's day, the same moment the vendor clocks use. */
export const BLAST_NOW = `${DEMO_TODAY}T12:00`;
export const HOURS = 24;
const ACTIVE = new Set(['switch', 'firewall', 'shelf']);
const KIND_WORD = { switch: 'Switch', firewall: 'Gateway (firewall)', shelf: 'Switch', circuit: 'Internet circuit', vendor: 'Vendor', change: 'Change' };
const r2 = (n) => Math.round(n * 100) / 100;
const spaceLabel = (s) => `${s.number ? `${s.number} ` : ''}${s.name}`;
const kindOf = (id) => (SPACES[id] ? KIND(SPACES[id]) : null);

// ---- The pictures: every floor of an office, drawn small at one scale --------------------------------------------
function floorPlan(M, f) {
  const xs = f.outline.map((p) => p[0]), ys = f.outline.map((p) => p[1]);
  const rooms = Object.values(M.rooms).filter((r) => r.floor === f.id && r.rect).map((r) => ({
    id: r.id, x: r2(r.rect[0]), y: r2(r.rect[1]), w: r2(r.rect[2] - r.rect[0]), h: r2(r.rect[3] - r.rect[1]),
    label: spaceLabel(r), bank: (r.count ?? 1) > 1, comms: ['mdf', 'idf'].includes(r.space_type),
  }));
  return {
    key: `${M.site}-${f.id}`, site: M.site, floor: f.id, name: f.name, W: Math.max(...xs), H: Math.max(...ys),
    outline: f.outline.map(([x, y]) => [r2(x), r2(y)]), core: f.core.map((c) => c.rect.map(r2)), rooms,
    aps: M.aps.filter((a) => a.floor === f.id).map((a) => ({ id: a.id, x: r2(a.at[0]), y: r2(a.at[1]) })),
  };
}
const plansOf = (siteIds, only = null) => siteIds.flatMap((s) => { const M = building(s); return M ? M.floors.filter((f) => !only || only.has(`${s}-${f.id}`)).map((f) => floorPlan(M, f)) : []; });

// ---- One space as the explorer lists it --------------------------------------------------------------------------
const BUSY = { meeting: 0.3, small: 0.16 };
export function spaceRow(id, units = 0, sv = []) {
  const s = SPACES[id]; const k = kindOf(id);
  const seats = s?.type?.keia_atlas?.capacity?.max ?? 0;
  const meet = BUSY[k] ? meetingsOf(id, { seats: Math.max(2, seats || 4), busy: BUSY[k], now: BLAST_NOW, hours: HOURS }) : [];
  return { id, label: s ? spaceLabel(s) : id, site: s?.site ?? null, floor: s?.floor ?? null, kind: k, units, desks: (s?.count ?? 1) > 1 ? s.count : 0, sv, meet, to: `/rooms/${id}/` };
}
// Units per space, and the services each space's cut-off units belong to.
function spaceRows(M, res) {
  const units = new Map(), sv = new Map();
  const idx = new Map();
  for (const key of res.outlets) idx.set(key, true);
  const cut = new Set(res.cut ?? res.spaces);
  for (const id of res.spaces) { units.set(id, 0); sv.set(id, new Set(cut.has(id) ? ['network'] : ['av'])); }
  for (const r of Object.values(M.rooms)) {
    if (!units.has(r.id)) continue;
    for (const o of r.outlets) if (idx.has(`outlet:${o.key}`)) {
      const one = servicesOf(M, { outlets: [`outlet:${o.key}`] }, kindOf);
      one.forEach((s) => sv.get(r.id).add(s));
    }
  }
  const tagSpace = new Map();
  for (const r of Object.values(M.rooms)) for (const p of r.positions ?? []) for (const u of p.units ?? []) if (!u.legacy) tagSpace.set(u.asset_tag, r.id);
  for (const t of res.units) { const sp = tagSpace.get(t); if (sp && units.has(sp)) units.set(sp, units.get(sp) + 1); }
  // A space the change touches directly (the unit itself off): all its units count.
  for (const id of res.spaces) if (!cut.has(id)) units.set(id, (M.rooms[id]?.positions ?? []).filter((p) => p.units?.some((u) => !u.legacy)).length);
  return res.spaces.map((id) => spaceRow(id, units.get(id), [...sv.get(id)]));
}

// ---- The explorer for a thing in an office ------------------------------------------------------------------------
/** What the explorer shows for a target in one office. target is one of
      { kind: 'item', rack, u }                   a switch, gateway or AV switch in a rack
      { kind: 'circuit', id }                     a provider's internet circuit
      { kind: 'touch', items, circuits, spaces }  what a change touches (all off at once)
    Returns plain data for BlastRadius.astro. */
const made = new Map();
export function explorerFor(site, target) {
  // Worked out once per build: a comms room, a unit page and a change can all ask for the same switch.
  const k = JSON.stringify([site, target]);
  if (!made.has(k)) made.set(k, explore(site, target));
  return made.get(k);
}
function explore(site, target) {
  const M = building(site);
  if (!M) return null;
  const nodes = new Set(), direct = new Set(target.spaces ?? []);
  let title = '', sub = '', kind = target.kind, node = null, carried = null, portCount = 0;
  const itemOf = (rack, u) => M._racks[rack]?.items.find((it) => u >= it.u && u < it.u + it.size) ?? null;
  if (target.kind === 'item') {
    const it = itemOf(target.rack, target.u);
    const gear = rackGear[it?.gear];
    node = itemNode(target.rack, it.u); nodes.add(node);
    title = it.label; kind = it.kind; portCount = typeof it.ports === "number" ? it.ports : 0;
    const rk = M.racks.find((r) => r.id === target.rack), room = M.rooms[rk?.space];
    sub = [gear ? `${gear.manufacturer} ${gear.model}` : null, `${rk?.name ?? target.rack}, U${it.u}`, room ? spaceLabel(room) : null].filter(Boolean).join(' · ');
    const twin = M._racks[target.rack].items.find((x) => x !== it && x.kind === it.kind && /\b[AB]$/.test(x.label) && x.label.replace(/[AB]$/, '') === it.label.replace(/[AB]$/, ''));
    carried = twin ? `${twin.label} carries every space` : null;
  } else if (target.kind === 'circuit') {
    const c = M.circuits.find((x) => x.id === target.id);
    circuitNodes(c.id).forEach((n) => nodes.add(n));
    title = c.name; sub = `${c.provider} · ${c.role === 'primary' ? 'Primary' : 'Secondary'} · handed off in ${M.rooms[M.racks.find((r) => r.id === c.handoff.rack)?.space]?.name ?? 'the main comms room'}`;
    const other = M.circuits.find((x) => x.id !== c.id);
    carried = other ? `${other.name} (${other.provider}) carries every space` : null;
  } else {
    const named = [];
    for (const i of target.items ?? []) { const it = itemOf(i.rack, i.u); if (it) { nodes.add(itemNode(i.rack, it.u)); named.push(it.label); } }
    for (const c of target.circuits ?? []) { circuitNodes(c).forEach((n) => nodes.add(n)); named.push(M.circuits.find((x) => x.id === c)?.name ?? c); }
    for (const sp of target.spaces ?? []) if (M.rooms[sp]) named.push(spaceLabel(M.rooms[sp]));
    const rooms = [...new Set((target.items ?? []).map((i) => M.rooms[M.racks.find((r) => r.id === i.rack)?.space]).filter(Boolean).map(spaceLabel))];
    title = named.length ? named.join(' and ') : target.title ?? 'What it touches';
    sub = [rooms.join(', '), sites[site]?.name].filter(Boolean).join(' · ');
  }
  const res = cutOff(M, { nodes });
  // Spaces the change touches directly (the unit itself off) count even when the network still reaches them.
  const all = [...new Set([...res.spaces, ...direct])].sort();
  const rows = spaceRows(M, { ...res, spaces: all, cut: res.spaces });
  const index = new Map(rows.map((r, i) => [r.id, i]));
  const ports = node && ACTIVE.has(kind) && kind !== 'firewall' ? portsOf(M, node).filter((p) => p.outlets.length || p.aps.length) : null;
  // "A whole office": as many spaces as taking every circuit off would cut.
  const everything = cutOff(M, { nodes: new Set(M.circuits.flatMap((c) => circuitNodes(c.id))) }).spaces.length || Object.keys(M.rooms).length;
  if (!all.length && !res.aps.length && node && !(ports?.length)) carried = carried ?? 'nothing is patched to it';
  const uplinks = ports ? uplinksOf(M, node) : [];
  return {
    listTitle: target.kind === 'touch' ? 'Spaces it takes off' : 'Spaces it would cut off', net: nodes.size > 0,
    portCount: ports ? Math.max(portCount, ...ports.map((p) => p.port), ...uplinks) : 0,
    key: target.key ?? `${site}-${target.kind}-${target.rack ?? ''}${target.u ?? ''}${target.id ?? ''}`,
    kind, kindWord: KIND_WORD[kind] ?? 'Unit', title, sub, site, siteName: sites[site]?.name ?? site,
    plans: plansOf([site]),
    spaces: rows, aps: res.aps,
    whole: { sp: rows.map((_, i) => i), ap: res.aps },
    ports: ports ? ports.map((p) => ({ p: p.port, sp: p.spaces.map((id) => index.get(id)).filter((x) => x != null), ap: p.aps, n: p.outlets.length })) : null,
    uplinks,
    carried: carried ?? 'every space keeps another way to the internet',
    wholeOffice: all.length > 0 && all.length >= everything,
    floors: new Set(rows.map((r) => r.floor)).size,
  };
}

/** Every thing in a comms room the explorer can take off: its switches and gateways, and, in the room the
    providers hand off in, the internet circuits. Each carries its explorer. */
export function explorersForRoom(spaceId) {
  const s = SPACES[spaceId]; if (!s) return [];
  const M = building(s.site); if (!M) return [];
  const out = [];
  for (const rk of M.racks.filter((r) => r.space === spaceId)) {
    for (const it of [...rk.items].sort((a, b) => b.u - a.u)) {
      if (!ACTIVE.has(it.kind)) continue;
      out.push(explorerFor(s.site, { kind: 'item', rack: rk.id, u: it.u, key: `${rk.id}-u${it.u}` }));
    }
  }
  for (const c of M.circuits.filter((x) => M.racks.find((r) => r.id === x.handoff.rack)?.space === spaceId)) out.push(explorerFor(s.site, { kind: 'circuit', id: c.id, key: c.id }));
  return out;
}

// ---- Vendors: if they stopped ------------------------------------------------------------------------------------
// A vendor is not wired to anything, so "off" means the work that depends on them stops: a manufacturer's units get
// no firmware or support cases, a service vendor's offices lose their repair cover, an integration partner's open
// jobs wait. The spaces those touch are the blast radius.
const OFFICE = (s) => sites[s] && sites[s].kind !== 'remote' && building(s)?.floors?.length;
export function explorerForVendor(id) {
  const V = vendors[id]; if (!V) return null;
  const covered = (V.sites?.length ? V.sites : SITE_ORDER.filter((s) => V.regions.includes(sites[s]?.region))).filter(OFFICE);
  let ids = [], why = '';
  if (V.kind === 'manufacturer') {
    const maker = V.name.replace(/^HP /, '');
    ids = Object.values(SPACES).filter((s) => covered.includes(s.site) && s.positions.some((p) => p.current && models[p.model]?.manufacturer === maker)).map((s) => s.id);
    why = `no firmware or support cases for their units`;
  } else if (V.kind === 'service') {
    ids = Object.values(SPACES).filter((s) => covered.includes(s.site) && ['meeting', 'small'].includes(KIND(s)) && s.positions.some((p) => p.current)).map((s) => s.id);
    why = 'no on-site repair cover';
  } else {
    ids = [...new Set(JOBS.filter((j) => j.vendor === id && j.state !== 'done').map((j) => j.space))].filter((sid) => SPACES[sid]);
    why = 'their open jobs wait';
  }
  const maker = V.kind === 'manufacturer' ? V.name.replace(/^HP /, '') : null;
  return explorerForSpaces(ids, {
    key: `vendor-${id}`, kind: 'vendor', kindWord: 'Vendor', title: V.name, sub: `If ${V.name} stopped: ${why}`, sites: covered, why,
    carried: 'nothing in the offices depends on them today', listTitle: 'Spaces that depend on them',
    unitsOf: (s) => s.positions.filter((p) => p.current && (!maker || models[p.model]?.manufacturer === maker)).length,
  });
}

/** An explorer over named spaces in any number of offices (a vendor, a standing rule): the spaces, their floors as
    small multiples, their bookings. Nothing is worked out from the patching: the spaces are the blast radius. */
export function explorerForSpaces(ids, { key, kind = 'spaces', kindWord = '', title, sub = '', sites: siteIds = null, why = '', carried = 'nothing depends on it today', listTitle = 'Spaces that depend on it', unitsOf = (s) => s.positions.filter((p) => p.current).length, sv = ['av'] }) {
  ids = [...new Set(ids)].filter((sid) => SPACES[sid]).sort();
  const rows = ids.map((sid) => spaceRow(sid, unitsOf(SPACES[sid]), sv));
  const floorsHit = new Set(rows.map((r) => `${r.site}-${r.floor}`));
  const offices = (siteIds ?? [...new Set(rows.map((r) => r.site))]).filter(OFFICE);
  const plans = plansOf(offices, floorsHit.size ? floorsHit : null);
  return {
    key, kind, kindWord, title, sub, listTitle, site: null, siteName: `${offices.length} ${offices.length === 1 ? 'office' : 'offices'}`,
    plans, spaces: rows, aps: [], whole: { sp: rows.map((_, i) => i), ap: [] }, ports: null,
    carried, net: false, wholeOffice: false, floors: floorsHit.size, sites: new Set(rows.map((r) => r.site)).size, why,
  };
}

// ---- Changes: what each touches, and the approval it needs ------------------------------------------------------
// What each planned change touches (read with the change list in src/lib/rules-view.mjs). A standing rule's run
// touches the space of the unit it ran on; a rule's own approval touches no space until it runs.
/** A change's items with the rest of any group they belong to (a virtual chassis, a stack, an HA pair: data/switch-ports
    groups). Kit that acts as one is changed as one, so the change touches every member. */
export function withGroups(site, items = []) {
  const M = building(site);
  if (!M || !items.length) return items;
  const groups = groupsOf(M, SWITCH_PORTS[site]);
  const out = new Map(items.map((i) => [`${i.rack}:${i.u}`, i]));
  for (const i of items) for (const g of groups) if (g.members.some((m) => m.rack === i.rack && m.u === i.u)) for (const m of g.members) if (m.key && !out.has(m.key)) out.set(m.key, { rack: m.rack, u: m.u });
  return [...out.values()];
}
export function explorerForChange(c, { incidents = {} } = {}) {
  const t = c.touches;
  if (t?.site) return explorerFor(t.site, { kind: 'touch', key: `chg-${c.id}`, items: withGroups(t.site, t.items ?? []), circuits: t.circuits ?? [], spaces: t.spaces ?? [], title: c.title });
  const room = c.space ?? Object.values(incidents).find((i) => (c.incidents ?? []).includes(i.number))?.room ?? null;
  if (room && SPACES[room]) return explorerFor(SPACES[room].site, { kind: 'touch', key: `chg-${c.id}`, spaces: [room], title: c.title });
  return null;
}
/** A standing rule's approval: the spaces its runs have acted on (through the incidents they ran for). Without the
    rule, each would wait for a person. */
export function explorerForRule(rule, { incidents = {} } = {}) {
  const byNumber = new Map(Object.values(incidents).map((i) => [i.number, i]));
  const ids = rule.allRuns.map((r) => byNumber.get(r.incident ?? r.target)?.room).filter(Boolean);
  return explorerForSpaces(ids, {
    key: `rule-${rule.id}`, kind: 'rule', kindWord: 'Standing rule', title: rule.name, sub: `If the ${rule.name} were off, these spaces would wait for a person`,
    carried: 'its runs change records and tickets, not a space', listTitle: 'Spaces its runs acted on',
    unitsOf: () => 1,
  });
}
// Second approvals recorded for the demo's changes that needed two people (the change list records one approver).
const SECOND = { 'CHG-158': 'declan' };
/** The approval a change needs, with why, and who gave it. rule: the standing rule behind it, if any. */
export function approvalOfChange(c, x, rule = null) {
  let a;
  if (c.run && rule) a = approvalFor({ rule: { name: rule.name, cap: rule.caps.per_wave } });
  else if (c.kind === 'standard' && rule) {
    const firmware = /firmware/.test(rule.id), irreversible = rule.reversal.kind === 'ask';
    a = firmware || irreversible ? approvalFor({ firmware, irreversible: irreversible && !firmware })
      : { level: 'owner', need: 1, why: [`a standing rule: at most ${rule.caps.per_wave} ${rule.caps.per_wave === 1 ? 'unit' : 'units'} a wave`], words: `Needed its owner once: at most ${rule.caps.per_wave} ${rule.caps.per_wave === 1 ? 'unit' : 'units'} a wave` };
  } else {
    const spaces = x ? x.spaces.length : c.space ? 1 : 0;
    a = approvalFor({ spaces, floors: x?.floors ?? (spaces ? 1 : 0), whole: !!x?.wholeOffice, firmware: !!c.firmware, irreversible: !!c.irreversible });
  }
  const by = [...new Set([...(c.approvers ?? (c.approver ? [c.approver] : [])), ...(SECOND[c.id] ? [SECOND[c.id]] : [])])];
  // A change already made says it in the past tense: "Needed two approvals: a firmware push".
  const past = c.status !== 'planned';
  const words = past ? a.words.replace(/^Needs /, 'Needed ').replace(/^Goes ahead/, 'Went ahead') : a.words;
  return { ...a, words, word: APPROVAL[a.level].word, by, still: past ? 0 : Math.max(0, a.need - by.length), past };
}

/** A unit's line for its own page: which comms room explorer shows it. { tag: { to, title } } for every switch and
    gateway with a unit record. */
export function unitExplorerLinks() {
  const out = {};
  for (const site of SITE_ORDER) {
    const M = building(site); if (!M) continue;
    for (const rk of M.racks) for (const it of rk.items) {
      if (!ACTIVE.has(it.kind) || !String(it.health).startsWith('AG-')) continue;
      const ex = explorerFor(site, { kind: 'item', rack: rk.id, u: it.u, key: `${rk.id}-u${it.u}` });
      const w = windowOf({ hours: HOURS, start: 0, len: 0 }, 0);
      const line = ex ? lineOf(ex, stateOf(ex, null, w), { hours: HOURS, start: 0, len: 0 }, w, BLAST_NOW) : '';
      out[it.health] = { to: `/rooms/${rk.space}/?off=${rk.id}-u${it.u}#if-off`, title: it.label, line };
    }
  }
  return out;
}
