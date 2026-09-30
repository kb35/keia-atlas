// Switch ports as the pages show them (build time): src/lib/switchcore.mjs joined to the spaces, the names and the
// blast-radius explorer. One view per office, made once:
//   switches   every switch with every port (recorded, parked or disabled), each port's far end in words, the
//              plan check, the links for its trace, and what a VLAN change on it would touch (for the form)
//   byUnit     for each unit (asset tag), its ports: where each goes, the VLAN, the check and the trace
//   vlans      the office's VLAN table with the plan's names, how many ports sit on each, and the ports to review
// Paths carry no base and no leading slash ('switches/dub-321-as02/'), with the hash apart, so the unit page's
// script and the static pages can both make links from them.
import { building, sitesWithFloors } from './floors.mjs';
import { readSwitchPorts, readHouse, vlanPlan, classVlans, switchesOf, hostnameFor, farEnds, checkPort, PLATFORM, rangeList, AV_VLAN, portOf, groupsOf, groupOfItem } from './switchcore.mjs';
import { spaces as SPACES, sites, className, modelName, models, rackGear, SITE_ORDER, plural } from './data.mjs';
import { explorerFor, spaceRow } from './blast-view.mjs';
import { poeDraw } from './comms.mjs';
import { approvalFor, meetingsFrom, cutOff, itemNode, uplinksOf } from './blast.mjs';

const FILES = readSwitchPorts();
const HOUSE = readHouse();
const BY_CLASS = classVlans(HOUSE);

export const portSlug = (p) => `port-${String(p).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
export const switchPath = (id) => `switches/${id}/`;
const spaceLabel = (id) => { const s = SPACES[id]; return s ? `${s.number ? `${s.number} ` : ''}${s.name}` : id; };
const cap = (s) => String(s ?? '').charAt(0).toUpperCase() + String(s ?? '').slice(1);
const portWord = (p) => (typeof p === 'number' ? `port ${p}` : String(p).toUpperCase().replace(/^LAN-/, 'LAN ').replace(/^SFP-/, 'SFP '));
// Where an outlet is, by its plate's surface (room3d's plate locations).
const OUTLET_KIND = { 'behind-display': 'Wall outlet', 'wall-below-table': 'Wall outlet', 'wall-behind-storage': 'Wall outlet', wall: 'Wall outlet', tbd: 'Wall outlet', 'room-entrance': 'Wall outlet', 'below-table': 'Floor box', 'floor-box': 'Floor box', 'table-top': 'Desk module', ceiling: 'Ceiling outlet' };
const OUTLET_WHERE = { 'behind-display': 'behind the display', 'wall-below-table': 'below the table', 'wall-behind-storage': 'behind the storage', wall: 'on the wall', tbd: 'on the wall', 'room-entrance': 'at the door', 'below-table': 'under the table', 'floor-box': 'by the table', 'table-top': 'on the desk', ceiling: 'in the ceiling' };

/** The unit's name as people say it ("Video bar", "Display 2") and its hostname, from its space. */
function unitInfo(space, position) {
  const s = SPACES[space];
  const p = s?.positions.find((x) => x.position === position);
  if (!p) return { name: position, host: null, cls: null };
  const role = p.role && p.role.length <= 30 && !/[,;]/.test(p.role) ? p.role : className(p.cls);
  const n = p.position.includes('#') ? ` ${p.position.split('#')[1]}` : '';
  const desk = /^desk-(\d+)\//.exec(p.position);
  return { name: `${desk ? `Desk ${+desk[1]}, ` : ''}${cap(role)}${n}`, host: p.hostname ?? null, cls: p.cls, model: p.model ?? p.equipment?.model ?? null, tag: p.current?.asset_tag ?? null };
}

const ipNum = (s) => s.split('.').reduce((n, x) => n * 256 + Number(x), 0);
const inPrefix = (ip, cidr) => { const [net, bits] = cidr.split('/'); const m = (~0 << (32 - Number(bits))) >>> 0; return ((ipNum(ip) & m) >>> 0) === ((ipNum(net) & m) >>> 0); };
/** A unit's address record (IPAM), from its office's switch-port file. */
export const addressOf = (site, tag) => siteNet(site)?.addresses.get(tag) ?? null;

const made = new Map();
/** The switch-port view of one office, or null when it has no floor plans or no switch-port file. */
export function siteNet(site) {
  if (made.has(site)) return made.get(site);
  const v = build(site);
  made.set(site, v);
  return v;
}

function build(site) {
  const M = building(site); const D = FILES[site];
  if (!M || !D) return null;
  const plan = vlanPlan(M._raw.standards.network);
  const nameOf = (vl) => plan.find((x) => x.vlan === vl)?.name ?? null;
  const vlWords = (vl) => (vl == null ? 'no VLAN' : nameOf(vl) ? `VLAN ${vl} ${nameOf(vl)}` : `VLAN ${vl}`);
  const F = farEnds(M);
  const sws = switchesOf(M);
  const idOf = new Map(sws.map((s) => [s.key, hostnameFor(M, s)]));
  const outletOf = new Map(Object.values(M.rooms).flatMap((r) => r.outlets.map((o) => [o.key, o])));
  const runOf = new Map(M.runs.map((r) => [r.id, r]));
  const cableOf = new Map(M.cables.map((c) => [c.id, c]));
  const rackName = (id) => M.racks.find((r) => r.id === id)?.name ?? id;
  const itemLabel = (rack, u) => M._racks[rack]?.items.find((it) => u >= it.u && u < it.u + (it.size ?? 1))?.label ?? `U${u}`;
  const panelShort = (pn) => (pn ? `${itemLabel(pn.rack, pn.u).split(',')[0]} port ${pn.port}` : null);
  const outletWords = (key) => {
    if (key.startsWith('ap:')) return { name: `Ceiling jack above ${key.slice(3)}`, where: 'in the ceiling', space: null };
    const o = outletOf.get(key);
    const [space] = key.split(':');
    if (!o) return { name: 'Outlet', where: '', space };
    const desk = o.unit ? `${cap(o.unit.replace('-', ' ').replace(/ 0+/, ' '))}, ` : '';
    return { name: `${desk}${OUTLET_KIND[o.loc] ?? 'Outlet'} ${o.plate}${o.n}`, short: `${OUTLET_KIND[o.loc] ?? 'Outlet'} ${o.plate}${o.n}`, where: OUTLET_WHERE[o.loc] ?? '', space };
  };
  const commsOf = (rack) => M.racks.find((r) => r.id === rack)?.space ?? null;
  const ctx = { plan, byClass: BY_CLASS, className };
  // Every unit's name at this office, by asset tag, for the lists of what a change touches.
  const tagName = new Map();
  for (const s of Object.values(SPACES).filter((x) => x.site === site)) for (const p of s.positions) if (p.current) tagName.set(p.current.asset_tag, `${unitInfo(s.id, p.position).name}, ${spaceLabel(s.id)}`);
  const groups = groupsOf(M, D);
  const KIND_WORD = { stack: 'stack', 'virtual-chassis': 'virtual chassis', 'ha-pair': 'HA pair', cluster: 'cluster' };

  // Every switch, every port.
  const switches = [];
  const bySwKey = new Map();
  for (const S of D.switches) {
    const sw = S.rack ? sws.find((x) => x.where === 'rack' && x.rack === S.rack && x.u === S.u) : sws.find((x) => x.where === 'room' && x.space === S.space && x.position === S.position);
    if (!sw) continue;
    const far = F.get(sw.key);
    const recorded = new Map(S.interfaces.map((p) => [String(p.name), p]));
    const disabled = new Set((sw.where === 'rack' ? rangeList(typeof S.disabled === 'string' ? S.disabled : '') : S.disabled ?? []).map(String));
    const count = sw.where === 'rack' ? Math.max(sw.ports, ...S.interfaces.map((p) => p.name).filter((p) => typeof p === 'number')) : sw.ports.length;
    const ids = sw.where === 'rack' ? Array.from({ length: count }, (_, i) => i + 1) : sw.ports;
    const gear = sw.gear ? rackGear[sw.gear] : null;
    const view = {
      id: S.id, key: sw.key, where: sw.where, site, label: sw.label, platform: S.platform, platformName: PLATFORM[S.platform]?.name ?? S.platform, platformShort: PLATFORM[S.platform]?.short ?? S.platform,
      rack: sw.rack, u: sw.u, rackName: sw.rack ? rackName(sw.rack) : null, space: sw.space, spaceLabel: spaceLabel(sw.space), tag: sw.tag,
      product: gear ? `${gear.manufacturer} ${gear.model}` : sw.model ? modelName(sw.model) : null, count, copper: sw.where === 'rack' ? sw.ports : sw.ports.filter((p) => /^lan/.test(p)).length,
      uplinks: sw.where === 'rack' ? uplinksOf(M, itemNode(sw.rack, sw.u)) : [], read: D.read_at, source: S.source ?? D.source ?? null, ports: [],
      group: (() => { const g = sw.where === 'rack' ? groupOfItem(groups, sw.rack, sw.u) : null; return g ? { id: g.id, kind: g.kind, kindWord: KIND_WORD[g.kind], name: g.name, members: g.members.map((m) => m.ref) } : null; })(),
    };
    for (const p of ids) {
      const f = far.get(p) ?? null;
      const rec = portOf(recorded.get(String(p)), Boolean(f));
      const check = checkPort(rec, f, { ...ctx, inRoom: sw.where === 'room' });
      view.ports.push({ port: p, slug: portSlug(p), word: portWord(p), state: rec.state, mode: rec.mode, native: rec.native, tagged: rec.tagged, auth: rec.auth, seen: rec.seen, drift: !!check.drift,
        vlanWords: rec.state === 'active' ? vlWords(rec.native) : rec.state === 'parked' ? 'Parked' : 'Disabled', seenWords: check.drift ? (rec.seen.native !== rec.native ? `seen ${vlWords(rec.seen.native)}` : `seen tagged ${rec.seen.tagged.join(', ')}`) : null,
        f, check, source: recorded.get(String(p))?.source ?? null });
    }
    // PoE: what the manufacturer says the switch can give, and what the units on its ports draw, as their
    // manufacturers state it. A unit with no figure is counted, never guessed.
    const budgetModel = sw.where === 'rack' ? (gear?.device_model ? models[gear.device_model] : null) : models[sw.model];
    const budgetText = gear?.facts?.['Poe budget'] ?? null;
    const budget = budgetModel?.power?.poe_budget_w ?? (budgetText ? Number(/(\d[\d,]*)\s*W/.exec(budgetText)?.[1]?.replace(',', '')) || null : null);
    let used = 0, known = 0, unknown = 0;
    for (const P of view.ports) {
      if (P.state !== 'active') continue;
      const u = P.f?.kind === 'outlet' ? P.f.unit : P.f?.kind === 'unit' ? P.f.unit : null;
      if (!u || u.cls === 'network-switch') continue;
      const w = poeDraw(u.model ?? unitInfo(u.space, u.position).model);
      if (w == null) continue;
      if (w === 'unknown') unknown++; else { used += w; known++; }
    }
    view.poe = budget ? { budget, used: Math.round(used * 10) / 10, known, unknown, share: used / budget, words: budgetModel?.power?.poe_budget_w ? `${budget} W, as ${budgetModel.manufacturer} states it` : `${budget} W with the default power supply (${gear.manufacturer} gives ${(/^([\d,]+\s*W\s*to\s*[\d,]+\s*W)/.exec(budgetText)?.[1] ?? budgetText).replace(/W/g, ' W').replace(/\s+/g, ' ')} by supply)` } : null;
    switches.push(view);
    bySwKey.set(sw.key, view);
  }
  const swById = new Map(switches.map((s) => [s.id, s]));

  // Each port's far end in words, its link and the hops of its chain (switch side first).
  for (const s of switches) {
    for (const P of s.ports) {
      const f = P.f;
      P.far = null;
      if (!f) { P.far = { title: s.where === 'rack' ? 'Nothing patched' : 'Nothing plugged in', sub: '' }; continue; }
      if (f.kind === 'outlet') {
        const ow = outletWords(f.outlet);
        const u = f.unit;
        const info = u ? (u.ap ? { name: 'Access point', host: u.host, cls: u.cls } : unitInfo(u.space, u.position)) : null;
        const via = u?.via?.length ? unitInfo(u.space, u.via[u.via.length - 1]) : null;
        P.far = {
          title: u ? `${info.name}${info.host ? ` · ${info.host}` : ''}` : 'Nothing plugged in',
          place: f.ap ? `Access point ${f.ap}` : spaceLabel(f.space),
          sub: [ow.name, via ? `through the ${via.name.toLowerCase()}` : null, panelShort(f.panel)].filter(Boolean).join(' · '),
          to: u ? { path: 'device/', q: `?tag=${u.tag}` } : f.space ? { path: `rooms/${f.space}/`, hash: '#outlets' } : null,
          unit: u ? { tag: u.tag, host: u.host, name: info.name, cls: u.cls, port: u.port, space: u.space } : null,
          space: f.space ?? null,
        };
      } else if (f.kind === 'switch' || f.kind === 'uplink') {
        const other = idOf.get(f.key);
        const up = s.uplinks.includes(P.port) || f.kind === 'uplink';
        P.far = { title: `Switch ${other} ${portWord(f.port)}`, sub: `${up ? 'Uplink' : 'Trunk'}${f.kind === 'uplink' ? ` through ${outletWords(f.outlet).short ?? 'an outlet'}` : f.runs?.length ? ' over the riser fibre' : ''}`, to: { path: switchPath(other), hash: `#${portSlug(f.port)}` }, sw: other, up };
      } else if (f.kind === 'item') {
        P.far = { title: f.label, sub: 'Trunk', to: { path: `rooms/${commsOf(f.rack)}/`, hash: '#rack' } };
      } else if (f.kind === 'unit') {
        const info = f.unit ? unitInfo(f.unit.space, f.unit.position) : { name: f.position };
        P.far = { title: `${info.name}${info.host ? ` · ${info.host}` : ''}`, sub: `Its ${portWord(f.unitPort)}${f.notes ? ` · ${f.notes}` : ''}`, to: f.unit ? { path: 'device/', q: `?tag=${f.unit.tag}` } : null, unit: f.unit ? { ...f.unit, name: info.name } : null, space: s.space };
      }
    }
  }

  // What a VLAN change on each port touches (the form's blast radius), and the approval it needs.
  const ex = new Map();
  const explorerOf = (s) => {
    if (s.where !== 'rack') return null;
    if (!ex.has(s.key)) ex.set(s.key, explorerFor(site, { kind: 'item', rack: s.rack, u: s.u, key: `${s.rack}-u${s.u}` }));
    return ex.get(s.key);
  };
  const unitsBehind = (s) => s.ports.filter((q) => q.f?.kind === 'unit' && q.f.unit).map((q) => ({ tag: q.f.unit.tag, name: unitInfo(q.f.unit.space, q.f.unit.position).name }));
  for (const s of switches) {
    for (const P of s.ports) {
      if (P.state === 'disabled' && !P.f) { P.impact = null; continue; }
      let sp = [], units = [], aps = [];
      if (s.where === 'rack') {
        const node = itemNode(s.rack, s.u);
        let res;
        if (P.f?.kind === 'switch') {
          const other = sws.find((x) => x.key === P.f.key);
          const cut = s.uplinks.includes(P.port) ? itemNode(s.rack, s.u) : itemNode(other.rack, other.u);
          res = cutOff(M, { nodes: new Set([cut]) });
        } else res = cutOff(M, { ports: new Map([[node, new Set([P.port])]]) });
        sp = res.spaces; aps = res.aps;
        if (P.f?.kind === 'outlet' && P.f.unit) {
          units = [{ tag: P.f.unit.tag, name: P.far.unit?.name ?? 'Unit' }];
          if (P.f.unit.cls === 'network-switch') { const inner = switches.find((x) => x.tag === P.f.unit.tag); if (inner) units.push(...unitsBehind(inner)); }
        } else units = res.units.map((t) => ({ tag: t, name: tagName.get(t) ?? t }));
        if (P.f?.kind === 'outlet' && P.f.space && !sp.includes(P.f.space)) sp = [P.f.space];
      } else {
        sp = [s.space];
        units = P.f?.kind === 'uplink' ? unitsBehind(s) : P.f?.unit ? [{ tag: P.f.unit.tag, name: P.far.unit?.name ?? 'Unit' }] : [];
      }
      const rows = sp.filter((id) => SPACES[id]).map((id) => spaceRow(id, 0, []));
      const meet = rows.reduce((a, r) => { const m = meetingsFrom(r.meet, 0); return { n: a.n + m.count, people: a.people + m.people }; }, { n: 0, people: 0 });
      const floors = new Set(rows.map((r) => r.floor)).size;
      const ap = approvalFor({ spaces: rows.length, floors });
      // Kit that acts as one: a trunk to a switch is one bundle across the group (and across this switch's own
      // links to it), so a change to one link is a change to all of them.
      const peers = [];
      if (P.f?.kind === 'switch') {
        const mates = s.group ? s.group.members.map((id) => switches.find((x) => x.id === id)).filter(Boolean) : [s];
        for (const o of mates) for (const q of o.ports) if (q !== P && q.f?.kind === 'switch' && q.f.key === P.f.key) peers.push({ sw: o.id, port: q.port, word: q.word, slug: q.slug });
      }
      P.impact = { spaces: rows.map((r) => ({ id: r.id, label: r.label })), units, aps, meetings: meet.n, people: meet.people, approval: { level: ap.level, words: ap.words },
        peers, group: peers.length && s.group ? { name: s.group.name, kindWord: s.group.kindWord } : null };
    }
  }

  // Each unit's ports: the chain from its own port out to the comms room switch, and the VLAN it lands on.
  const byUnit = new Map();
  const addUnit = (tag, row) => { if (!tag) return; if (!byUnit.has(tag)) byUnit.set(tag, []); byUnit.get(tag).push(row); };
  const chainFromOutlet = (s, P) => {
    const f = P.f; const hops = [];
    const ow = outletWords(f.outlet);
    const run = runOf.get(f.run), cord = cableOf.get(f.patch);
    const comms = commsOf(s.rack);
    hops.push({ kind: 'outlet', label: ow.short ?? ow.name, sub: ow.where, to: f.space ? { path: `rooms/${f.space}/`, hash: '#outlets' } : null });
    if (run) hops.push({ kind: 'run', label: 'Permanent link', sub: `${run.id} · ${run.length_m} m`, to: { path: `rooms/${comms}/`, hash: '#patching' } });
    if (f.panel) hops.push({ kind: 'panel', label: panelShort(f.panel), sub: `${rackName(f.panel.rack)}, U${f.panel.u}`, to: { path: `rooms/${comms}/`, hash: '#rack' } });
    if (cord) hops.push({ kind: 'patch', label: 'Patch cord', sub: `${cord.id} · ${cord.colour}`, to: { path: 'cables/', hash: `#cb-${cord.id}` } });
    hops.push({ kind: 'switch', label: `${s.id} ${P.word}`, sub: s.label, to: { path: switchPath(s.id), hash: `#${P.slug}` } });
    return hops;
  };
  const words = (hops) => hops.filter((h) => ['outlet', 'panel', 'switch', 'room-switch'].includes(h.kind)).map((h) => (h.kind === 'switch' || h.kind === 'room-switch' ? `Switch ${h.label}` : h.label));
  for (const s of switches) {
    for (const P of s.ports) {
      const f = P.f;
      const vlanHop = P.state === 'active' ? { kind: 'vlan', label: `VLAN ${P.native}`, sub: nameOf(P.native) ?? 'Not in the plan', to: { path: 'standards/network/', hash: '#vlans' }, vlan: P.native } : { kind: 'vlan', label: P.state === 'parked' ? 'Parked' : 'Disabled', sub: 'On no VLAN', to: null, vlan: null };
      const row = { sw: s.id, swLabel: s.label, port: P.port, portWord: P.word, slug: P.slug, state: P.state, mode: P.mode, native: P.native, vlanName: nameOf(P.native), tagged: P.tagged, check: P.check, platform: s.platformShort };
      if (s.where === 'rack' && f?.kind === 'outlet') {
        const chain = chainFromOutlet(s, P);
        for (const u of f.units) {
          if (u.via.some((k) => /network-switch/.test(k))) continue;    // behind an in-room switch: its own port says
          const mine = u.tag === f.unit?.tag;
          const via = u.via.map((k) => ({ kind: 'via', label: unitInfo(u.space, k).name, sub: 'Passes the link through', to: unitInfo(u.space, k).tag ? { path: 'device/', q: `?tag=${unitInfo(u.space, k).tag}` } : null }));
          const hops = [...via, ...chain, vlanHop];
          addUnit(u.tag, { ...row, unitPort: u.port, hops, words: [...words(hops)], check: mine ? P.check : { ok: null, why: `Passes the ${f.unit ? f.unit.cls === 'video-bar' ? 'video bar' : className(f.unit.cls).toLowerCase() : 'device'}'s link through; the switch port is set for that.` } });
        }
      } else if (s.where === 'room' && f?.kind === 'unit' && f.unit) {
        const up = s.ports.find((q) => q.f?.kind === 'uplink');
        const comms = up?.f?.key ? bySwKey.get(up.f.key) : null;
        const cp = comms?.ports.find((q) => q.port === up.f.port);
        const hops = [{ kind: 'room-switch', label: `${s.id} ${P.word}`, sub: 'In-room switch', to: { path: switchPath(s.id), hash: `#${P.slug}` } }];
        if (P.native !== AV_VLAN && cp) hops.push(...chainFromOutlet(comms, cp));
        hops.push(vlanHop);
        addUnit(f.unit.tag, { ...row, unitPort: f.unit.port, hops, words: [...words(hops)], inRoom: true, avOnly: P.native === AV_VLAN });
      } else if (s.where === 'rack' && (f?.kind === 'switch' || f?.kind === 'item') && s.tag) {
        // A comms room switch's own links, on its unit page.
        addUnit(s.tag, { ...row, unitPort: P.word, hops: [{ kind: 'switch', label: `${s.id} ${P.word}`, sub: s.label, to: { path: switchPath(s.id), hash: `#${P.slug}` } }, { kind: 'far', label: P.far.title, sub: P.far.sub, to: P.far.to }, vlanHop], words: [P.far.title], own: true });
      }
    }
  }

  // The VLAN table: members, and ports to review.
  const vlans = plan.map((p) => {
    const t = D.vlans.find((x) => x.vid === p.vlan) ?? {};
    const on = switches.flatMap((s) => s.ports.filter((q) => q.state === 'active' && q.native === p.vlan).map((q) => ({ s, q })));
    const devices = on.filter(({ q }) => q.f?.kind === 'outlet' || q.f?.kind === 'unit').length;
    return { vlan: p.vlan, name: p.name, role: t.role ?? null, what: p.what, reaches: p.reaches, routed: p.routed, subnet: t.prefix ?? null, gateway: t.gateway ?? null, reserved: t.reserved ?? null, pool: t.pool ?? null, note: t.note ?? null, ports: on.length, devices };
  });
  const review = switches.flatMap((s) => s.ports.filter((q) => q.check.ok === false).map((q) => ({ sw: s.id, port: q.port, word: q.word, slug: q.slug, why: q.check.why, rule: q.check.rule, far: q.far?.title ?? '', place: q.far?.place ?? s.spaceLabel, native: q.native, room: s.space })));
  const stray = switches.flatMap((s) => s.ports.filter((q) => q.state === 'active' && !plan.some((p) => p.vlan === q.native)).map((q) => q.native));
  // The addresses (IPAM), by device, and how many each VLAN holds.
  const addresses = new Map((D.addresses ?? []).map((a) => [a.device, { ...a, ip: a.address.split('/')[0] }]));
  for (const v of vlans) v.addresses = (D.addresses ?? []).filter((a) => v.subnet && v.gateway && inPrefix(a.address.split('/')[0], v.subnet)).length;
  return { site, siteName: sites[site]?.name ?? site, read: D.read_at, plan, vlans, stray: [...new Set(stray)], switches, swById, byUnit, review, addresses, groups };
}

/** Every switch in every office, for the switch pages. */
export function allSwitches() {
  return SITE_ORDER.flatMap((s) => siteNet(s)?.switches ?? []);
}
/** A unit's ports, from any office. */
export function portsOfUnit(site, tag) {
  return siteNet(site)?.byUnit.get(tag) ?? [];
}
/** The office's switches in one comms room (its racks) and the in-room switches it feeds. */
export function switchesInRoom(spaceId) {
  const s = SPACES[spaceId]; if (!s) return [];
  return (siteNet(s.site)?.switches ?? []).filter((x) => x.where === 'rack' && x.space === spaceId);
}
export const officesWithPorts = () => sitesWithFloors().filter((s) => FILES[s]);
export { plural };
