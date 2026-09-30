// The blast-radius explorer (UX-V2 §7, BUILD-PLAN V9) and the approval a change needs (SECURITY-SCAN 7 and 8;
// SYNTHESIS 2.5). Pure: it takes a building model (src/lib/floors.mjs) and works out what would lose its way to the
// internet if something were off. src/lib/blast-view.mjs joins it to the site's data for the pages;
// tests/blast.test.mjs checks it.
//
// How "what serves what" is worked out: the building model's signal graph (every patch cord, permanent link, riser
// fibre, provider box and lead-in, the same graph the network path trace follows) is walked from the internet
// inwards. Whatever the walk still reaches with the thing taken off is fine; an outlet it reached before and not
// now would be cut off, and so is every unit wired to that outlet and the space it sits in. Redundancy counts for
// itself: with two core switches or two providers, taking one off cuts nothing, and the explorer says so.
//
// The approval a change needs follows from the same picture (the "blast-radius threshold"):
//   one space, or a standing rule inside its caps    Goes ahead: no approval
//   more than one space, on one floor                 The owner confirms
//   more than a floor, a whole office, a firmware     Two people approve
//   push, or no way back
// so most changes need no approval and an approval means something.
import { signalGraph, wiringToOutlet } from './floors.mjs';
import { serviceOfClass } from './services.mjs';

// ---- Reaching the internet ----------------------------------------------------------------------------------------
const graphs = new WeakMap();
/** The signal graph of a building model, made once per model. */
export function graphOf(M) {
  if (!graphs.has(M)) graphs.set(M, signalGraph(M));
  return graphs.get(M);
}
/** The port on the node an edge leaves from (the graph stores both ends' ports and the far end's). */
export const ownPort = (e) => (e.ports ? (e.ports[1] === e.toPort ? e.ports[0] : e.ports[1]) : null);

/** Every node the internet still reaches with `cut` taken off. cut.nodes: a set of node ids off entirely;
    cut.ports: a map of node id to the set of that node's ports that are off. */
export function reachable(adj, cut = {}) {
  const nodes = cut.nodes ?? new Set(), ports = cut.ports ?? new Map();
  const seen = new Set(['internet']);
  const q = ['internet'];
  while (q.length) {
    const u = q.shift();
    const pu = ports.get(u);
    for (const e of adj.get(u) ?? []) {
      const v = e.to;
      if (seen.has(v) || nodes.has(v)) continue;
      if (pu && pu.has(ownPort(e))) continue;
      const pv = ports.get(v);
      if (pv && pv.has(e.toPort)) continue;
      seen.add(v); q.push(v);
    }
  }
  return seen;
}

// ---- Outlets, and what hangs off each ----------------------------------------------------------------------------
const indexes = new WeakMap();
/** Every outlet node in the graph, with the space it is in (or the access point on it) and the units wired to it. */
export function outletIndex(M) {
  if (indexes.has(M)) return indexes.get(M);
  const idx = new Map();
  const models = M._raw?.models ?? {};
  for (const r of Object.values(M.rooms)) {
    for (const o of r.outlets) idx.set(`outlet:${o.key}`, { space: r.id, ap: null, units: [] });
    for (const p of r.positions ?? []) {
      const u = p.units?.find((x) => !x.legacy);
      if (!u) continue;
      const w = wiringToOutlet(r, p.position);
      if (!w) continue;
      const key = `outlet:${r.id}:${w.outlet}`;
      if (!idx.has(key)) idx.set(key, { space: r.id, ap: null, units: [] });
      idx.get(key).units.push({ tag: u.asset_tag, cls: models[p.model]?.class ?? null, model: p.model ?? null, position: p.position });
    }
  }
  for (const a of M.aps) idx.set(`outlet:ap:${a.id}`, { space: null, ap: a.id, floor: a.floor, units: a.asset_tag ? [{ tag: a.asset_tag, cls: 'wireless-access-point', model: a.model }] : [] });
  indexes.set(M, idx);
  return idx;
}

const bases = new WeakMap();
const baseReach = (M) => { if (!bases.has(M)) bases.set(M, reachable(graphOf(M))); return bases.get(M); };

/** What would be cut off with `cut` taken off: outlets that reach the internet today and would not.
    Returns { outlets: [node ids], spaces: [room ids], aps: [ap ids], units: [asset tags] }. */
export function cutOff(M, cut = {}) {
  const before = baseReach(M), after = reachable(graphOf(M), cut);
  const idx = outletIndex(M);
  const outlets = [], spaces = new Set(), aps = new Set(), units = new Set();
  for (const [key, o] of idx) {
    if (!before.has(key) || after.has(key)) continue;
    outlets.push(key);
    if (o.space) spaces.add(o.space);
    if (o.ap) aps.add(o.ap);
    for (const u of o.units) if (u.tag) units.add(u.tag);
  }
  return { outlets, spaces: [...spaces].sort(), aps: [...aps].sort(), units: [...units].sort() };
}

/** A rack item's node in the graph ("item:<rack>:<u>"), for switches, firewalls and the like. */
export const itemNode = (rack, u) => `item:${rack}:${u}`;
/** A provider's circuit: its box (the handoff) and its lead-in, both off. */
export const circuitNodes = (id) => [`isp:${id}`, `entry:${id}`];

/** A switch's ports that lead away from the internet (towards outlets or other switches), each with what it alone
    would cut off. Uplinks (the ports the switch reaches the internet through) are left out. */
export function portsOf(M, node) {
  const adj = graphOf(M);
  const before = baseReach(M);
  if (!before.has(node)) return [];
  // The ports this node is reached through: a walk that never passes the node, from the internet.
  const without = reachable(adj, { nodes: new Set([node]) });
  const out = new Map();
  for (const e of adj.get(node) ?? []) {
    const p = ownPort(e);
    if (p == null) continue;
    if (without.has(e.to)) continue;           // the far end reaches the internet without this node: an uplink or a spare path
    out.set(p, true);
  }
  return [...out.keys()].sort((a, b) => a - b).map((p) => ({ port: p, ...cutOff(M, { ports: new Map([[node, new Set([p])]]) }) }));
}

/** A switch's uplink ports: the ones whose far end reaches the internet without the switch. */
export function uplinksOf(M, node) {
  const adj = graphOf(M);
  const without = reachable(adj, { nodes: new Set([node]) });
  return [...new Set((adj.get(node) ?? []).filter((e) => without.has(e.to)).map(ownPort).filter((p) => p != null))].sort((a, b) => a - b);
}

// ---- Services ----------------------------------------------------------------------------------------------------
/** The services a cut touches: Network whenever anything is cut off (the link itself), plus the service of every
    unit behind it (AV for a video bar or a room switch). */
export function servicesOf(M, result, kindOf = () => null) {
  const idx = outletIndex(M);
  const out = new Set();
  if (result.outlets.length) out.add('network');
  for (const key of result.outlets) {
    const o = idx.get(key);
    for (const u of o?.units ?? []) { const s = serviceOfClass(u.cls, o.space ? kindOf(o.space) : null); if (s) out.add(s); }
  }
  return ['av', 'network', 'infrastructure'].filter((s) => out.has(s));
}

// ---- Meetings: simulated bookings for the next 24 hours ----------------------------------------------------------
// There is no room booking feed in the demo, so each bookable space gets a made-up day of bookings from a seed of
// its id: the same every build, labelled Simulated on the page. Attendees are a count, never names (UX-V2 §7.5).
const seedOf = (s) => [...String(s)].reduce((n, c) => (Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
const rnd = (seed) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
export const DAY_HOURS = [8, 18];
const minOf = (t) => { const [h, m] = String(t).slice(11, 16).split(':').map(Number); return h * 60 + m; };
/** Bookings in a space from `now` for `hours` hours: [[start, length, people]], start in minutes from `now`.
    Busy spaces (meeting rooms) book more often than small ones; bookings keep to 08:00 to 18:00. */
export function meetingsOf(spaceId, { seats = 6, busy = 0.4, now, hours = 24 } = {}) {
  if (!now || !seats) return [];
  const r = rnd(seedOf(`${spaceId}:${String(now).slice(0, 10)}`));
  const out = [];
  const start = minOf(now);
  for (let t = Math.ceil(start / 30) * 30; t < start + hours * 60; t += 30) {
    const day = t % 1440;
    if (day < DAY_HOURS[0] * 60 || day >= DAY_HOURS[1] * 60) continue;
    if (out.length && out[out.length - 1][0] + out[out.length - 1][1] > t - start) continue;
    if (r() >= busy) continue;
    const len = Math.min([30, 60, 60, 90][Math.floor(r() * 4)], DAY_HOURS[1] * 60 - day);
    const people = Math.max(2, Math.min(seats, 2 + Math.floor(r() * (seats - 1))));
    out.push([t - start, len, people]);
  }
  return out;
}
/** The meetings on or after `from` minutes (a meeting under way at `from` counts), and the people in them. */
export function meetingsFrom(list, from = 0) {
  const on = list.filter(([s, d]) => s + d > from);
  return { count: on.length, people: on.reduce((n, m) => n + m[2], 0) };
}

// ---- Words (src/lib/blast-words.mjs, which the browser can load too) ----------------------------------------
export { countLine, joinWords } from './blast-words.mjs';
import { joinWords, plural } from './blast-words.mjs';

// ---- Approval ----------------------------------------------------------------------------------------------------
// The three answers, in the method's words (no retired words: this is the approval a change needs, not a "tier").
export const APPROVAL = {
  go: { need: 0, word: 'Goes ahead', short: 'No approval' },
  owner: { need: 1, word: 'The owner confirms', short: 'The owner' },
  two: { need: 2, word: 'Two people approve', short: 'Two people' },
};
export const APPROVAL_ORDER = ['go', 'owner', 'two'];
/** The approval a change needs from what it touches (the explorer's result) and what it is. scope:
      spaces, floors, sites   how many the change would cut off or touch
      whole                   true when it would take a whole office off
      firmware                a firmware push
      irreversible            no way back (the rule or the change says it cannot be put back)
      rule                    { name, cap } when a standing rule runs it inside its caps
    Returns { level, need, why: [words], words }: "Needs two approvals: 3 floors and a firmware push". */
export function approvalFor({ spaces = 0, floors = 0, sites = 0, whole = false, firmware = false, irreversible = false, rule = null } = {}) {
  if (rule) {
    const why = [`a standing rule, approved once`, `at most ${plural(rule.cap, 'unit')} a wave`];
    return { level: 'go', need: 0, why, words: `Goes ahead under the ${rule.name}: ${why[1]}` };
  }
  const big = [];
  if (sites > 1) big.push(`${sites} offices`);
  else if (whole) big.push('a whole office');
  else if (floors > 1) big.push(`${floors} floors`);
  if (firmware) big.push('a firmware push');
  if (irreversible) big.push('no way back');
  if (big.length) return { level: 'two', need: 2, why: big, words: `Needs two approvals: ${joinWords(big)}` };
  if (spaces <= 1) { const why = [spaces ? 'one space' : 'nothing cut off']; return { level: 'go', need: 0, why, words: `Goes ahead: ${why[0]}` }; }
  const why = [`${plural(spaces, 'space')} on 1 floor`];
  return { level: 'owner', need: 1, why: ['1 floor'], words: 'Needs the service owner: 1 floor', detail: why[0] };
}
