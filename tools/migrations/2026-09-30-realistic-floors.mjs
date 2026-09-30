// One-off generator, 30 Sept 2026: every office's floors laid out as real office floors (after the Dublin one,
// tools/migrations/2026-09-30-realistic-floors-dub.mjs). Rerunnable; its output is committed. It replaces the layout
// tools/migrations/2026-09-30-office-floors.mjs wrote (spaces scattered along wide bands, with gaps between them).
//
//   node tools/migrations/2026-09-30-realistic-floors.mjs
//
// For each office with a floor plan other than Dublin (chi, cph, jnu, lon, mel, nyc, sin, tor, tyo) it writes what the
// office-floors generator wrote: the floor files, every space's `geometry`, the runs, the circuits, and each floor's
// open-area space and its access points as units (same ids, serials and tags while the counts stay the same).
//
// The building type: a plate with a 6.4 m row of spaces along each facade, two 1.6 m corridors, and an 8 m middle
// zone with the core (stair A, lifts and their lobby, the comms room over riser 1, a cleaner's store, the toilets) and
// small spaces back to back either side of it, with a link corridor each side of the core and the escape stair at the
// east end. Spaces are packed wall to wall in rows along the corridors, with the door on the corridor wall:
//   - a space on a facade row is as deep as the row, and as wide as its area needs (the space type's area, sometimes
//     a little more or less, always within the type's range);
//   - a small space in the middle zone is 4 m deep where its area allows; a smaller one keeps its type's size and the
//     depth behind it is a store (a building element, not a space);
//   - desks stand in the open on the facade rows, in banks with an aisle between them; the pantry or cafeteria sits
//     on a facade, with the town hall area beside the cafeteria where there is one.
//
// Everything is made up (rule F9). Panel ports follow the patch cords in data/cables/<site>.yaml, as before.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseDocument, Document, visit, isScalar, isSeq } from 'yaml';
import { FICTION, loadRaw, roomGeometry, roomOutlets, trayGraph, routeRun, trayCapacity, inRect, distToPath, rectArea, polyArea, WIFI_RULE, panelZ, areaRange, OPEN_AREA } from '../../src/lib/floors.mjs';

const ROOT = process.cwd();
const raw = loadRaw(ROOT);
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
let seed = 1;
const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const THIS = 'tools/migrations/2026-09-30-realistic-floors.mjs';

// ---------- YAML ----------
const flowShort = (doc) => { visit(doc, { Seq(_, n) { if (n.items.every((i) => isScalar(i) && typeof i.value === 'number') || (n.items.length && n.items.every((i) => isSeq(i) && i.flow))) n.flow = true; } }); return doc; };
const stringify = (obj) => flowShort(new Document(obj)).toString({ lineWidth: 0 });
const order = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const write = (rel, text) => { mkdirSync(path.dirname(path.join(ROOT, rel)), { recursive: true }); writeFileSync(path.join(ROOT, rel), text); };

// ---------- The house building ----------
// y from the south facade: south band (desks, shared and large rooms), south corridor, the middle zone (the core, and
// small rooms back to back either side of it), north corridor, north band.
const P = 6.4, CW = 1.6, DM = 8, MID_ROW = DM / 2;
const m0 = P + CW, m1 = m0 + DM, DEPTH = r2(m1 + CW + P);
const YS = r2(P + CW / 2), YN = r2(m1 + CW / 2);
const TRAY_Z = 3.1, LADDER_Z = 2.4, SLAB = 3.8, STAIR_B = 3.5, CORR_X0 = 4;
const TURN = { S: 0, E: 90, N: 180, W: 270 };
const LEFT_FACES = { 0: 'W', 90: 'S', 180: 'E', 270: 'N' };
const BACK_FACES = { 0: 'S', 90: 'E', 180: 'N', 270: 'W' };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const coreSpan = (lifts) => 3.5 + lifts * 2 + 8.5;
function coreOf(cx0, lifts) {
  const LW = lifts * 2, c0 = r2(cx0 + 3.5 + LW), ce = r2(c0 + 8.5);
  return {
    c0, ce, LW,
    parts: [
      { id: 'stair-a', kind: 'stair', name: 'Stair A', rect: [cx0, m0, r2(cx0 + 3.5), m1] },
      { id: 'lift-lobby', kind: 'lift-lobby', name: 'Lift lobby', rect: [r2(cx0 + 3.5), m0, c0, r2(m0 + 2.4)], circulation: true },
      { id: 'lifts', kind: 'lift', name: `Lifts 1 to ${lifts}`, rect: [r2(cx0 + 3.5), r2(m0 + 2.4), c0, m1], count: lifts },
      { id: 'riser-1', kind: 'riser', name: 'Riser 1 (data)', rect: [c0, r2(m0 + 3.4), r2(c0 + 1.5), m1] },
      { id: 'store', kind: 'store', name: "Cleaner's store and plant", rect: [r2(c0 + 1.5), r2(m0 + 3.4), r2(c0 + 4), m1] },
      { id: 'toilets', kind: 'toilets', name: 'Toilets and accessible toilet', rect: [r2(c0 + 4), m0, ce, m1] },
    ],
    comms: [c0, m0, r2(c0 + 4), r2(m0 + 3.4)],
    riserC: [r2(c0 + 0.75), r2((m0 + 3.4 + m1) / 2)],
    rackAt: [r2(c0 + 2.1), r2(m0 + 1.9)],
    jx: r2(c0 + 3.3),
  };
}

// The offices, with a seed each so every layout is its own but the same on every run. Test dates come from the
// comms room's install (the cabling a week before its first unit; the access points with its latest).
const OFFICES = {
  nyc: { seed: 101, lifts: 3 }, chi: { seed: 211, lifts: 3 }, lon: { seed: 307, lifts: 2 }, tor: { seed: 401, lifts: 2 },
  sin: { seed: 503, lifts: 2 }, mel: { seed: 601, lifts: 3 }, tyo: { seed: 701, lifts: 3 }, cph: { seed: 809, lifts: 2 }, jnu: { seed: 907, lifts: 2 },
};
const TOWN_HALL = { w: 16, d: P };

// ---------- Asset tags: continue after the highest in data/ (not counting the tags this script writes) ----------
function highestTag() {
  let max = 0;
  const walk = (d) => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, n.name);
      if (n.isDirectory()) walk(f);
      else if (n.name.endsWith('.yaml') && !n.name.endsWith('-open.yaml') && !f.includes(`${path.sep}floors${path.sep}`)) {
        for (const m of readFileSync(f, 'utf8').matchAll(/AG-(\d{6})/g)) { const v = +m[1]; if (v < 900000 && v > max) max = v; }
      }
    }
  };
  walk(path.join(ROOT, 'data'));
  return max;
}
let nextTag = highestTag() + 1;
const firstTag = nextTag;

// ---------- The open-area space and install ----------
const floorWord = (site, fid) => raw.sites[site].floors.find((x) => x.id === fid).name.replace(/:.*$/, '');
function writeOpenArea(site, fid, aps, installedNote) {
  const id = `${site}-${fid}-open`, fw = floorWord(site, fid);
  const byKey = { 'access-point': aps.filter((a) => a.key === 'access-point'), 'town-hall-ap': aps.filter((a) => a.key === 'town-hall-ap') };
  for (const list of Object.values(byKey)) list.forEach((a, i) => { a.position = list.length > 1 ? `${a.key}#${i + 1}` : a.key; });
  const space = { site, floor: fid, name: `Open areas and corridors, ${fw}`, space_type: OPEN_AREA, option: 'unifi',
    notes: ['Everything on the floor that is not an enclosed room or the core: desks in the open plan, breakout and town-hall areas, corridors and the lift lobby. Where each access point hangs is on the floor plan.'] };
  write(`data/spaces/${site}/${id}.yaml`, `# ${raw.sites[site].name}, ${fw.toLowerCase()}: the open areas and corridors, home of the floor's Wi-Fi access points.\n# Made up (rule F9); written by ${THIS}.\n\n${stringify(space)}`);
  const inst = { space: id, ...(byKey['town-hall-ap'].length ? { fitted: ['town-hall-ap'] } : {}),
    positions: aps.map((a) => ({ position: a.position, model: a.model, hostname: a.hostname, units: [order({ serial: a.serial, asset_tag: a.asset_tag, stage: a.stage, installed: a.installed }, ['serial', 'asset_tag', 'stage', 'installed'])] })) };
  write(`data/installs/${site}/${id}.yaml`, `# Installed in the open areas and corridors of the ${raw.sites[site].name}, ${fw.toLowerCase()} (${id}): the Wi-Fi access points.\n# Serials and asset tags are made up. ${installedNote}\n\n${stringify(inst)}`);
  raw.spaces[id] = space;
  raw.installs[id] = inst;
  return aps.map((a) => order({ id: a.id, space: id, position: a.position, area: a.area, at: a.at, height_m: a.height_m }, ['id', 'space', 'position', 'area', 'at', 'height_m']));
}

// ---------- Dublin: its access points become units ----------
{
  for (const fid of ['3', '4']) {
    const rel = `data/floors/dub-${fid}.yaml`;
    const text = readFileSync(path.join(ROOT, rel), 'utf8');
    const doc = parseDocument(text);
    const list = doc.toJS().access_points ?? [];
    if (!list.length || !list[0].serial) continue;   // already moved
    const aps = list.map((a) => ({ ...a, key: a.model === 'unifi-u7-pro-max' ? 'town-hall-ap' : 'access-point' }));
    const placed = writeOpenArea('dub', fid, aps, 'Moved here from the floor plan by ' + THIS + ', keeping their serials and tags.');
    const node = doc.createNode(placed); flowShort(node);   // only the new part is restyled; the rest of the file stays as it was
    doc.set('access_points', node);
    write(rel, doc.toString({ lineWidth: 0 }).replace('Made up (rule F8)', 'Made up (rule F9)'));

  }
}

// ---------- One office ----------
const summary = [];
const gaps = [];
for (const [SITE, cfg] of Object.entries(OFFICES)) {
  seed = cfg.seed;
  const site = raw.sites[SITE];
  const FLOORS = site.floors.map((f) => f.id);
  const spacesOn = (fid) => Object.keys(raw.spaces).filter((id) => raw.spaces[id].site === SITE && raw.spaces[id].floor === fid && raw.spaces[id].space_type !== OPEN_AREA).sort();
  const isComms = (id) => ['mdf', 'idf'].includes(raw.spaces[id].space_type);
  const LIFTS = cfg.lifts, SPAN = coreSpan(LIFTS);

  // Every space's footprint: W along its row (its display wall), D across it (towards the corridor). A room has a
  // facade-row size (as deep as the row) and a middle-zone size (4 m deep, or its type's own size with a store behind).
  const itemOf = (id) => {
    const s = raw.spaces[id], t = raw.types[s.space_type], pg = t.keia_atlas?.geometry ?? {};
    if ((s.count ?? 1) > 1) {
      const N = s.count, b = Math.ceil(N / 6), per = Math.floor(N / b / 2) * 2;
      const counts = Array.from({ length: b }, () => per); let rest = N - per * b;
      for (let i = 0; rest > 0; i = (i + 1) % b, rest -= 2) counts[i] += 2;
      const rows = b === 1 ? 1 : 2, cols = Math.ceil(b / rows), pitch = r2((Math.max(...counts) / 2) * 1.52 + 1.44);
      const width = r2(0.6 + cols * pitch), depth = rows === 1 ? 3.0 : 6.2;
      const benches = counts.map((n, i) => ({ x_m: r2(0.6 + Math.floor(i / rows) * pitch), y_m: i % rows ? 3.9 : 0.7, desks: n }));
      return { id, kind: 'bank', xext: width, yext: depth, width, depth, benches };
    }
    if (s.space_type === 'it-store') return { id, kind: 'room', store: true, pg: {}, doorBack: false, per: { W: 3, D: P }, mid: { W: 3, D: MID_ROW }, small: true };
    const range = areaRange(t);
    const area0 = pg.width_m * pg.depth_m;
    let f = 1;
    if (range && rand() < 0.3) f = [0.94, 0.97, 1.03, 1.06][Math.floor(rand() * 4)];
    const target = range ? Math.min(range.max - 0.06, Math.max(range.min + 0.06, area0 * f)) : area0;
    const fit = (D) => { const W = r2(target / D); return range && W * D > range.max ? r2(Math.floor((range.max / D) * 100) / 100) : W; };
    const per = fit(P) >= 2.4 ? { W: fit(P), D: P } : null;
    const midW = fit(MID_ROW);
    const mid = midW >= 2.1 ? { W: midW, D: MID_ROW } : pg.depth_m <= MID_ROW ? { W: pg.width_m, D: pg.depth_m } : null;
    return { id, kind: 'room', pg, doorBack: pg.door?.wall === 'back', per, mid, small: target <= 16 && !!mid };
  };
  const items = {};
  for (const fid of FLOORS) for (const id of spacesOn(fid)) if (!isComms(id)) items[id] = itemOf(id);

  // Pack: find the shortest plate that takes every floor. Small rooms go in the middle zone first; desks, shared and
  // large rooms along the facades; a town-hall area beside the cafeteria where there is one.
  let plan = null;
  for (let L = Math.ceil(SPAN + 2 * CW + CORR_X0 + STAIR_B + 8); L <= 120 && !plan; L += 0.5) {
    const w = (L - STAIR_B - CORR_X0 - 2 * CW - SPAN) / 2;
    const cx0 = r1(CORR_X0 + w + CW);
    const core = coreOf(cx0, LIFTS);
    const floors = {};
    let ok = true;
    for (const fid of FLOORS) {
      const rows = {
        ps: { side: 'N', edge: P, depth: P, x0: 0, x1: L, per: true, used: 0, list: [] },
        pn: { side: 'S', edge: r2(m1 + CW), depth: P, x0: 0, x1: L, per: true, used: 0, list: [] },
        msw: { side: 'S', edge: m0, depth: MID_ROW, x0: CORR_X0, x1: r2(cx0 - CW), used: 0, list: [] },
        mnw: { side: 'N', edge: m1, depth: MID_ROW, x0: CORR_X0, x1: r2(cx0 - CW), used: 0, list: [] },
        mse: { side: 'S', edge: m0, depth: MID_ROW, x0: r2(core.ce + CW), x1: r2(L - STAIR_B), used: 0, list: [] },
        mne: { side: 'N', edge: m1, depth: MID_ROW, x0: r2(core.ce + CW), x1: r2(L - STAIR_B), used: 0, list: [] },
      };
      const room = (r) => r.x1 - r.x0 - r.used;
      const ids = spacesOn(fid).filter((id) => !isComms(id));
      const hasHall = ids.some((id) => raw.spaces[id].space_type === 'cafeteria');
      const units = ids.map((id) => ({ ...items[id] }));
      if (hasHall) units.find((u) => raw.spaces[u.id].space_type === 'cafeteria').hall = true;
      const rank = (u) => (u.hall ? 0 : u.kind === 'bank' ? 1 : !u.small ? 2 : 3);
      const along = (u) => (u.kind === 'bank' ? u.xext : (u.per ?? u.mid).W);
      units.sort((a, b) => rank(a) - rank(b) || along(b) - along(a) || a.id.localeCompare(b.id));
      for (const u of units) {
        // Each row it could go in, with its size there: small spaces in the middle zone first, the rest on a facade.
        const opts = Object.entries(rows).map(([k, r]) => {
          if (u.kind === 'bank') return r.per ? { k, r, W: u.xext, D: u.yext, need: u.xext + 1.2 } : null;
          const dims = r.per ? (u.per ?? u.mid) : u.mid;
          if (!dims || (!r.per && dims.D > MID_ROW)) return null;
          const W = dims.W + (u.hall ? TOWN_HALL.w : 0);
          return { k, r, W: dims.W, D: dims.D, need: W };
        }).filter((o) => o && room(o.r) >= o.need);
        const mids = opts.filter((o) => !o.r.per), pers = opts.filter((o) => o.r.per);
        const pool = u.small && mids.length ? mids : pers.length ? pers : mids;
        if (!pool.length) { ok = false; break; }
        const o = pool.sort((a, b) => room(b.r) - room(a.r))[0];
        o.r.list.push({ ...u, W: o.W, D: o.D, need: o.need }); o.r.used += o.need;
      }
      if (!ok) break;
      floors[fid] = rows;
    }
    if (ok) plan = { L, cx0, core, floors };
  }
  if (!plan) throw new Error(`${SITE}: no plate fits`);
  const { L, cx0, core } = plan;
  const OUTLINE = [[0, 0], [L, 0], [L, DEPTH], [0, DEPTH]];

  // ---------- Place each space ----------
  const placed = {};
  const halls = {};
  const extras = Object.fromEntries(FLOORS.map((f) => [f, []])), nooks = Object.fromEntries(FLOORS.map((f) => [f, []]));
  // Add a rect to a list, merged into the last one when they share an edge (a run of stores or of window seats).
  const addRect = (list, rect, make) => {
    const prev = list[list.length - 1];
    if (prev && prev.rect[1] === rect[1] && prev.rect[3] === rect[3] && (Math.abs(prev.rect[2] - rect[0]) < 0.01 || Math.abs(prev.rect[0] - rect[2]) < 0.01)) prev.rect = [Math.min(prev.rect[0], rect[0]), rect[1], Math.max(prev.rect[2], rect[2]), rect[3]];
    else list.push(make(list.length + 1));
  };
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const place = (u, r, x0) => {
    const g = {}; const notes = [];
    const yy0 = r.side === 'N' ? r.edge - u.D : r.edge;
    if (u.kind === 'bank') {
      const y = r.side === 'N' ? r.edge - u.D - 0.1 : r.edge + 0.1;
      g.size_m = { width: u.width, depth: u.depth };
      g.on_floor = { x_m: r2(x0), y_m: r2(y), turn_deg: 0 };
      g.data_entry = { via: 'ceiling', wall: r.side === 'N' ? 'front' : 'back', at_m: r2(u.width / 2) };
      g.benches = u.benches;
      return g;
    }
    const { W, D, pg } = u;
    // The display wall away from the corridor and the door on the corridor wall; a space type with its door on the
    // display wall turns to face the corridor instead.
    const back = u.doorBack ? r.side : OPP[r.side];
    const turn = TURN[back];
    const origin = turn === 0 ? [x0, yy0] : [x0 + W, yy0 + D];
    if (u.store || W !== pg.width_m || D !== pg.depth_m) g.size_m = { width: W, depth: D };
    if (!u.store && rand() < 0.3) g.mirror = true;
    g.on_floor = { x_m: r2(origin[0]), y_m: r2(origin[1]), turn_deg: turn };
    if (!u.doorBack) {
      const dw = pg.door ? r2(pg.door.to_m - pg.door.from_m) : 0.9;
      const a0 = rand() < 0.5 ? 0.3 : r2(W - 0.3 - dw);
      g.door = { wall: 'front', from_m: a0, to_m: r2(a0 + dw) };
    }
    const odd = [];
    const roll = rand();
    if (!u.store && roll < 0.14 && W > 2.6 && D > 2.6) odd.push({ kind: 'column', x_m: 0.1, y_m: 0.1, w_m: 0.45, d_m: 0.45, note: pick(['A structural column in the corner', 'A column on the long wall, boxed in', 'A structural column by the window']) });
    else if (!u.store && roll < 0.24 && W > 2.6 && D > 2.6) odd.push({ kind: 'corner', x_m: r2(W - 0.8), y_m: 0, w_m: 0.8, d_m: 0.8, note: pick(['A corner cut out for a rainwater pipe', 'A duct in the corner', 'A corner boxed in for a service riser']) });
    if (!u.store && rand() < 0.16) odd.push({ kind: 'window-wall', wall: u.doorBack ? 'back' : 'front', note: 'A glass wall to the corridor: no wall plates on that side' });
    if (odd.length) g.odd = odd;
    if (u.store) notes.push('An IT store off the corridor: locked cabinets, no devices built in.');
    else if (g.size_m) notes.push(`Built to its row: ${W} × ${D} m (the space type is ${pg.width_m} × ${pg.depth_m} m).`);
    if (!u.doorBack && !u.store) notes.push('Door on the corridor wall.');
    if (notes.length) g.notes = notes;
    return g;
  };
  for (const fid of FLOORS) {
    const rows = plan.floors[fid];
    for (const [k, r] of Object.entries(rows)) {
      // Facade rows: the enclosed spaces wall to wall from one end, then the desks in the open with an aisle between
      // banks. Middle rows: wall to wall from the core's link corridor outwards.
      const rooms = r.list.filter((u) => u.kind !== 'bank'), banks = r.list.filter((u) => u.kind === 'bank');
      const fromEast = r.per ? rand() < 0.5 : k === 'msw' || k === 'mnw';
      const seq = [...rooms, ...banks];
      let x = fromEast ? r.x1 : r.x0;
      for (const u of seq) {
        const w = u.kind === 'bank' ? u.xext + 1.2 : u.W + (u.hall ? TOWN_HALL.w : 0);
        const x0 = fromEast ? x - w : x;
        const inner = u.kind === 'bank' ? x0 + 0.6 : u.hall && fromEast ? x0 + TOWN_HALL.w : x0;
        placed[u.id] = place(u, r, inner);
        if (u.hall) {
          const hx0 = fromEast ? x0 : x0 + u.W;
          const hy0 = r.side === 'N' ? r.edge - TOWN_HALL.d : r.edge;
          halls[fid] = { id: 'town-hall', kind: 'town-hall', name: 'Town hall area', rect: [r2(hx0), r2(hy0), r2(hx0 + TOWN_HALL.w), r2(hy0 + TOWN_HALL.d)] };
        }
        // A space shallower than its row: on a facade the depth behind it is window seating, in the middle zone a store.
        if (u.kind !== 'bank' && u.D < r.depth - 0.05) {
          const ys = r.side === 'N' ? [r.edge - r.depth, r.edge - u.D] : [r.edge + u.D, r.edge + r.depth];
          const rect = [r2(inner), r2(ys[0]), r2(inner + u.W), r2(ys[1])];
          if (r.per) addRect(nooks[fid], rect, (n) => ({ id: `window-seats-${n}`, kind: 'breakout', name: 'Window seats', rect }));
          else addRect(extras[fid], rect, (n) => ({ id: `store-${fid}-${n}`, kind: 'store', name: pick(['Store', 'Lockers', 'Coats and lockers', 'Stationery store']), rect }));
        }
        x = fromEast ? x0 : x0 + w;
      }
      // The open end of a row: touchdown in the middle zone, breakout on a facade (a short end is a store).
      {
        const ys = r.side === 'N' ? [r2(r.edge - r.depth), r.edge] : [r.edge, r2(r.edge + r.depth)];
        const rect = fromEast ? [r.x0, ys[0], r2(x), ys[1]] : [r2(x), ys[0], r.x1, ys[1]];
        const w = rect[2] - rect[0];
        if (!r.per && w > 0.2 && w < 1.5) extras[fid].push({ id: `store-${fid}-${k}`, kind: 'store', name: 'Store', rect });
        else if (!r.per && w >= 1.5) nooks[fid].push({ id: `touchdown-${k}`, kind: 'breakout', name: 'Touchdown', rect });
        else if (r.per && w >= 2) nooks[fid].push({ id: `breakout-${k}`, kind: 'breakout', name: 'Breakout', rect });
      }
    }
    for (const id of spacesOn(fid).filter(isComms)) {
      placed[id] = { size_m: { width: 4, depth: 3.4 }, on_floor: { x_m: core.comms[0], y_m: core.comms[1], turn_deg: 0 }, door: { wall: 'back', from_m: 2.6, to_m: 3.5 },
        notes: ['Comms room in the core, beside riser 1; the riser cupboard opens into it. The same place on every floor.'] };
    }
  }
  for (const [id, g] of Object.entries(placed)) raw.spaces[id] = { ...raw.spaces[id], geometry: g };

  // ---------- Floors: core, corridors, trays ----------
  const geoOf = (id) => roomGeometry(raw.spaces[id], raw.types[raw.spaces[id].space_type]);
  const LEVEL = Object.fromEntries(FLOORS.map((f) => [f, r2(Number(f) * SLAB)]));
  const CORE = [...core.parts, { id: 'stair-b', kind: 'stair', name: 'Stair B (escape)', rect: [r2(L - STAIR_B), m0, L, m1] }];
  const coreOn = (f) => [...CORE, ...extras[f]];
  const CORRIDORS = [
    { id: 'corridor-south', name: 'South corridor', rect: [0, P, L, m0] },
    { id: 'corridor-north', name: 'North corridor', rect: [0, m1, L, r2(m1 + CW)] },
    { id: 'corridor-west', name: 'West link', rect: [r2(cx0 - CW), m0, cx0, m1] },
    { id: 'corridor-east', name: 'East link', rect: [core.ce, m0, r2(core.ce + CW), m1] },
  ];
  const xs0 = 0.8, xs1 = r2(L - 0.8), lwx = r2(cx0 - CW / 2), lex = r2(core.ce + CW / 2);
  const mainTrays = (f) => [
    { id: `t${f}-comms`, kind: 'ladder', name: 'Ladder in the comms room', path: [core.riserC, [core.riserC[0], core.rackAt[1]], core.rackAt, [core.jx, core.rackAt[1]], [core.jx, YS]], z_m: LADDER_Z, width_mm: 450, depth_mm: 100 },
    { id: `t${f}-south-w`, kind: 'tray', name: 'South corridor tray, west', path: [[core.jx, YS], [xs0, YS]], z_m: TRAY_Z },
    { id: `t${f}-south-e`, kind: 'tray', name: 'South corridor tray, east', path: [[core.jx, YS], [xs1, YS]], z_m: TRAY_Z },
    { id: `t${f}-link-w`, kind: 'tray', name: 'West link tray', path: [[lwx, YS], [lwx, YN]], z_m: TRAY_Z },
    { id: `t${f}-link-e`, kind: 'tray', name: 'East link tray', path: [[lex, YS], [lex, YN]], z_m: TRAY_Z },
    { id: `t${f}-north-w`, kind: 'tray', name: 'North corridor tray, west', path: [[lwx, YN], [xs0, YN]], z_m: TRAY_Z },
    { id: `t${f}-north-m`, kind: 'tray', name: 'North corridor tray, middle', path: [[lwx, YN], [lex, YN]], z_m: TRAY_Z },
    { id: `t${f}-north-e`, kind: 'tray', name: 'North corridor tray, east', path: [[lex, YN], [xs1, YN]], z_m: TRAY_Z },
  ];
  const RISER = { id: `${SITE}-riser-1`, name: 'Riser 1 (data)', rect: CORE.find((c) => c.id === 'riser-1').rect, floors: FLOORS, from_level_m: 0, to_level_m: r2(LEVEL[FLOORS[FLOORS.length - 1]] + SLAB),
    sleeves: 4, sleeve_mm: 100, carries: FLOORS.length > 1 ? 'Riser fibre between the MDF and the IDFs, and the providers\' fibre from the ground floor entry' : 'The provider\'s fibre from the ground floor entry', notes: 'Fire-stopped at each floor.' };
  function branchTo(trays, p) {
    let best = null;
    for (const t of trays.filter((x) => x.kind === 'tray')) {
      const [a, b] = [t.path[0], t.path[t.path.length - 1]];
      const horiz = Math.abs(a[1] - b[1]) < 1e-6;
      const lo = horiz ? Math.min(a[0], b[0]) : Math.min(a[1], b[1]), hi = horiz ? Math.max(a[0], b[0]) : Math.max(a[1], b[1]);
      const along = Math.max(lo, Math.min(hi, horiz ? p[0] : p[1]));
      const Pt = horiz ? [along, a[1]] : [a[0], along];
      const d = Math.abs(Pt[0] - p[0]) + Math.abs(Pt[1] - p[1]);
      if (!best || d < best.d) best = { d, P: Pt, horiz };
    }
    const { P: Pt, horiz } = best;
    const pts = [Pt];
    if (horiz ? Math.abs(Pt[0] - p[0]) > 1e-6 : Math.abs(Pt[1] - p[1]) > 1e-6) pts.push(horiz ? [Pt[0], p[1]] : [p[0], Pt[1]]);
    pts.push(p);
    return pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-6).map((q) => [r2(q[0]), r2(q[1])]);
  }
  const short = (id) => id.replace(new RegExp(`^${SITE}-`), '');
  const floorsOut = {};
  for (const f of FLOORS) {
    const trays = mainTrays(f);
    for (const id of spacesOn(f)) {
      if (isComms(id)) continue;
      const geo = geoOf(id);
      trays.push({ id: `t${f}-b-${short(id)}`, kind: 'basket', name: `Branch to ${raw.spaces[id].number ?? ''} ${raw.spaces[id].name}`.replace(/\s+/g, ' '), path: branchTo(trays, [geo.entry[0], geo.entry[1]]), z_m: TRAY_Z, feeds: `room-${id}` });
    }
    floorsOut[f] = { trays, aps: [], areas: [{ id: 'breakout-west', kind: 'breakout', name: 'Touchdown and breakout', rect: [0, m0, CORR_X0, m1] }, ...(halls[f] ? [halls[f]] : []), ...nooks[f]] };
  }

  // ---------- Runs: panel ports in the order the patch cords were recorded ----------
  const racks = Object.fromEntries(Object.values(raw.racks).map((r) => [r.id, r]));
  const cables = Object.values(raw.cables).find((c) => c.site === SITE).cables;
  const portRange = (s) => { const [lo, hi] = String(s).split('-').map(Number); const out = []; for (let p = lo; p <= (hi || lo); p++) out.push(p); return out; };
  const itemAt = (rk, u) => rk.items.find((x) => u >= x.u && u < x.u + x.size);
  const patchedPorts = (rackId) => {
    const rk = racks[rackId]; const out = [];
    for (const c of cables) {
      if (c.role !== 'patch' || c.where?.rack !== rackId) continue;
      for (const e of [c.connects?.from, c.connects?.to]) {
        const it = e?.u ? itemAt(rk, e.u) : null;
        if (it?.kind !== 'patch-panel') continue;
        for (const p of portRange(e.ports)) out.push({ u: it.u, size: it.size, port: p, purpose: c.purpose, cable: c.id, label: it.label });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label) || a.port - b.port);
  };
  // What each floor's comms room patches: the outlets that plug into the AV panel, the rest, and the data ports.
  const portPlan = (f) => {
    const commsId = spacesOn(f).find(isComms);
    const rackId = Object.values(racks).find((r) => r.space === commsId).id;
    const outlets = [];
    for (const id of spacesOn(f)) {
      if (isComms(id)) continue;
      const s = raw.spaces[id], t = raw.types[s.space_type];
      const opt = t.keia_atlas.options.find((o) => o.id === s.option);
      const geo = geoOf(id);
      for (const o of roomOutlets(s, t, opt, raw.installs[id]?.fitted ?? [], geo, raw.models)) {
        const cls = o.dev ? opt.equipment.find((e) => e.key === o.dev.replace(/^desk-\d+\//, '').replace(/#\d+$/, ''))?.class : null;
        outlets.push({ space: id, o, geo, video: ['video-bar', 'codec'].includes(cls) || /^poe-injector/.test(o.dev ?? '') });
      }
    }
    const ports = patchedPorts(rackId);
    const avPorts = ports.filter((p) => p.purpose === 'av'), dataPorts = ports.filter((p) => p.purpose !== 'av');
    const video = avPorts.length ? outlets.filter((x) => x.video).slice(0, avPorts.length) : [];
    const others = outlets.filter((x) => !video.includes(x));
    return { rackId, outlets, ports, avPorts, dataPorts, video, others };
  };
  const PLAN = Object.fromEntries(FLOORS.map((f) => [f, portPlan(f)]));

  // ---------- Access points: the Wi-Fi standard's spacing, on clear spots ----------
  const enclosedOn = (f) => spacesOn(f).filter((id) => (raw.spaces[id].count ?? 1) === 1).map((id) => geoOf(id).rect);
  const coreSolidOn = (f) => coreOn(f).filter((c) => !c.circulation).map((c) => c.rect);
  const commsInst = (f) => raw.installs[spacesOn(f).find(isComms)];
  const unitDates = (inst) => (inst?.positions ?? []).flatMap((p) => p.units.map((u) => u.installed)).filter(Boolean).sort();
  const siteDates = FLOORS.flatMap((f) => unitDates(commsInst(f))).sort();
  const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
  const CABLED = addDays(siteDates[0] ?? '2022-01-10', -7);
  const AP_DATE = siteDates[siteDates.length - 1] ?? '2025-06-01';
  for (const f of FLOORS) {
    const { trays } = floorsOut[f];
    const hall = halls[f];
    const encl = enclosedOn(f), coreSolid = coreSolidOn(f);
    const open = polyArea(OUTLINE) - encl.reduce((n, r) => n + rectArea(r), 0) - coreSolid.reduce((n, r) => n + rectArea(r), 0) - (hall ? rectArea(hall.rect) : 0);
    const needHall = hall ? Math.ceil(rectArea(hall.rect) / WIFI_RULE.gathering_m2) : 0, needOpen = Math.ceil(open / WIFI_RULE.open_m2);
    // A patched port left over once every outlet has one is an access point the predictive design added.
    const left = Math.max(0, PLAN[f].dataPorts.length - PLAN[f].others.length - needOpen - needHall);
    const want = [{ area: 'open', n: needOpen + left }, ...(hall ? [{ area: hall.id, n: needHall }] : [])];
    const aps = [];
    const clearOf = (p, ts) => ts.every((t) => distToPath(p, t.path) >= WIFI_RULE.clear_of_tray_m + 0.05);
    const valid = (p, area) => (area === 'open'
      ? !encl.some((r) => inRect(p, r, 0.3)) && !coreSolid.some((r) => inRect(p, r, 0.3)) && !(hall && inRect(p, hall.rect, 0.3))
      : inRect(p, hall.rect, -0.5)) && p[0] > 1 && p[0] < L - 1 && p[1] > 1 && p[1] < DEPTH - 1 && clearOf(p, trays);
    for (const { area, n } of want) {
      const cands = [];
      for (let x = 1; x < L - 1; x += 0.5) for (let y = 1; y < DEPTH - 1; y += 0.5) if (valid([x, y], area)) cands.push([r2(x), r2(y)]);
      if (cands.length < n) throw new Error(`${SITE} floor ${f}: no room for ${n} access points in ${area}`);
      // k-means over the clear spots, from an even spread: the access points share the area out evenly.
      let cent = Array.from({ length: n }, (_, i) => cands[Math.floor(((i + 0.5) / n) * cands.length)]);
      const bx = area === 'open' ? null : hall.rect;
      if (!bx) {
        const cols = Math.max(1, Math.round(Math.sqrt((n * L) / DEPTH))), rowsN = Math.ceil(n / cols);
        cent = Array.from({ length: n }, (_, i) => [((i % cols) + 0.5) * (L / cols), (Math.floor(i / cols) + 0.5) * (DEPTH / rowsN)]);
      }
      for (let it = 0; it < 25; it++) {
        const sums = cent.map(() => [0, 0, 0]);
        for (const c of cands) { let bi = 0, bd = Infinity; cent.forEach((q, i) => { const d = (q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2; if (d < bd) { bd = d; bi = i; } }); sums[bi][0] += c[0]; sums[bi][1] += c[1]; sums[bi][2]++; }
        cent = cent.map((q, i) => (sums[i][2] ? [sums[i][0] / sums[i][2], sums[i][1] / sums[i][2]] : q));
      }
      for (const q of cent) {
        const byDist = cands.map((c) => [c, Math.hypot(c[0] - q[0], c[1] - q[1])]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
        let done = false;
        for (const c of byDist) {
          if (aps.some((a) => Math.hypot(a.at[0] - c[0], a.at[1] - c[1]) < 4)) continue;
          if (!clearOf(c, trays)) continue;
          const path = branchTo(trays, c);
          const branch = { path };
          if (aps.some((a) => distToPath(a.at, branch.path) < WIFI_RULE.clear_of_tray_m + 0.05)) continue;
          const n2 = String(aps.length + 1).padStart(2, '0');
          const id = `${SITE}-${f}-ap${n2}`;
          const no = String(nextTag++).padStart(6, '0');
          aps.push({ id, hostname: id, key: area === 'open' ? 'access-point' : 'town-hall-ap', model: area === 'open' ? 'unifi-u7-pro' : 'unifi-u7-pro-max', area, at: c, height_m: 2.7,
            serial: `DEMO-${SITE.toUpperCase()}-${no}`, asset_tag: `AG-${no}`, stage: 'manage', installed: AP_DATE });
          trays.push({ id: `t${f}-b-ap${n2}`, kind: 'basket', name: `Branch to access point ${id}`, path, z_m: TRAY_Z, feeds: `ap-${id}` });
          done = true; break;
        }
        if (!done) throw new Error(`${SITE} floor ${f}: no clear spot for an access point near ${q.map(r1)}`);
      }
    }
    floorsOut[f].aps = aps;
    // Rooms of 12 or more seats want an access point of their own; no room profile has one, so they are gaps.
    for (const id of spacesOn(f)) { const c = raw.types[raw.spaces[id].space_type].keia_atlas.capacity; if ((raw.spaces[id].count ?? 1) === 1 && c && c.max >= 12) gaps.push(`${raw.spaces[id].number} ${raw.spaces[id].name}`); }
  }

  const models = raw.models;
  const runsOut = [];
  const perFloor = {};
  const mk = (fl, G, rackId, p, to, outlet, date, spare) => {
    const item = racks[rackId].items.find((x) => x.u === p.u);
    const R = routeRun({ floor: fl, G, rackAt: core.rackAt, item, outlet, geo: outlet.geo });
    if (!R) throw new Error(`${SITE}: no route for ${JSON.stringify(to)}`);
    const measured = r2(R.length - 0.2 + rand() * 0.4);
    const commsNo = raw.spaces[racks[rackId].space].number;
    return order({ id: `${SITE.toUpperCase()}-${commsNo}-R1-U${String(p.u).padStart(2, '0')}-P${String(p.port).padStart(2, '0')}`, kind: 'horizontal', type: 'cat6a', purpose: p.purpose,
      from: { rack: rackId, u: p.u, port: p.port }, to, via: R.via, length_m: R.length, ...(spare ? { spare: true } : {}),
      test: { result: 'pass', date, length_m: measured, margin_db: r2(2.5 + rand() * 4) } }, ['id', 'kind', 'type', 'purpose', 'from', 'to', 'via', 'length_m', 'spare', 'test']);
  };
  for (const f of FLOORS) {
    const { rackId, outlets, ports, avPorts, dataPorts, video, others } = PLAN[f];
    const rk = racks[rackId];
    const fl = { id: f, level_m: LEVEL[f], tray_m: TRAY_Z, raised_floor_m: 0.15, trays: floorsOut[f].trays, racks: [{ rack: rackId, at: core.rackAt, facing: 's' }] };
    const G = trayGraph(fl.trays);
    const aps = floorsOut[f].aps;
    // Live: every outlet with a device plugged in, then the access points, then the rest while patched ports last.
    const withDev = others.filter((x) => x.o.dev), noDev = others.filter((x) => !x.o.dev);
    if (withDev.length + aps.length > dataPorts.length) throw new Error(`${SITE} floor ${f}: ${withDev.length} outlets in use and ${aps.length} access points for ${dataPorts.length} patched ports`);
    const liveNoDev = noDev.slice(0, dataPorts.length - withDev.length - aps.length);
    const spareOut = noDev.slice(liveNoDev.length);
    const live = others.filter((x) => withDev.includes(x) || liveNoDev.includes(x));
    // Free panel ports for the spares: data panels first, then the AV panel.
    const used = new Set(ports.map((p) => `${p.u}:${p.port}`));
    const panels = rk.items.filter((x) => x.kind === 'patch-panel').sort((a, b) => (avPorts.some((p) => p.u === a.u) ? 1 : 0) - (avPorts.some((p) => p.u === b.u) ? 1 : 0) || a.label.localeCompare(b.label));
    const free = panels.flatMap((it) => Array.from({ length: it.ports }, (_, i) => ({ u: it.u, size: it.size, port: i + 1, purpose: 'user-data', label: it.label })).filter((p) => !used.has(`${p.u}:${p.port}`)));
    if (free.length < spareOut.length) throw new Error(`${SITE} floor ${f}: ${spareOut.length} spare outlets for ${free.length} free panel ports`);
    const feedOf = (x) => { const t = fl.trays.find((y) => y.feeds === `room-${x.space}`); return t.path[t.path.length - 1]; };
    const add = (x, p, spare) => runsOut.push(mk(fl, G, rackId, p, { space: x.space, outlet: x.o.id }, { ...x.o, feed: feedOf(x), geo: x.geo }, CABLED, spare));
    video.forEach((x, i) => add(x, avPorts[i], false));
    live.forEach((x, i) => add(x, dataPorts[i], false));
    aps.forEach((a, i) => {
      const t = fl.trays.find((y) => y.feeds === `ap-${a.id}`);
      runsOut.push(mk(fl, G, rackId, dataPorts[live.length + i], { access_point: a.id }, { kind: 'ap', at: [a.at[0], a.at[1], a.height_m], feed: t.path[t.path.length - 1] }, addDays(AP_DATE, -4), false));
    });
    spareOut.forEach((x, i) => add(x, free[i], true));
    perFloor[f] = { outlets: outlets.length, spare: spareOut.length, aps: aps.length, rackId };
  }
  // The riser fibre from the MDF to each IDF: 12 duplex OM4 each, port n at the MDF is port n (less 12 for the second) at the IDF.
  const mdfFloor = FLOORS.find((f) => raw.spaces[spacesOn(f).find(isComms)].space_type === 'mdf');
  const mdfRack = perFloor[mdfFloor].rackId;
  FLOORS.filter((f) => f !== mdfFloor).forEach((f, i) => {
    const ladder = (core.riserC[1] - core.rackAt[1]) + (core.rackAt[0] - core.riserC[0]);
    const drop = (u) => LADDER_Z - panelZ(u);
    const fromU = racks[mdfRack].items.find((x) => x.kind === 'fibre-panel' && x.u < 30)?.u ?? 12;
    const toU = racks[perFloor[f].rackId].items.find((x) => x.kind === 'fibre-panel').u;
    const len = Math.ceil((ladder * 2 + Math.abs(LEVEL[f] - LEVEL[mdfFloor]) + drop(fromU) + drop(toU) + 10) * 10) / 10;
    const lo = i * 12 + 1;
    runsOut.push({ id: `${SITE.toUpperCase()}-${raw.spaces[racks[mdfRack].space].number}-R1-U${String(fromU).padStart(2, '0')}-P${String(lo).padStart(2, '0')}`, kind: 'backbone', type: 'fibre-om4', purpose: 'fibre-mm', cores: 24,
      from: { rack: mdfRack, u: fromU, ports: `${lo}-${lo + 11}` }, to: { rack: perFloor[f].rackId, u: toU, ports: '1-12' }, via: [`t${mdfFloor}-comms`, RISER.id, `t${f}-comms`], length_m: len,
      test: { result: 'pass', date: CABLED, loss_db: r2(0.7 + rand() * 0.5), notes: 'Worst core, 850 nm; made up.' },
      notes: `Riser fibre to the ${floorWord(SITE, f)} IDF, 12 duplex pairs (24 cores). Port ${lo} at the MDF is port 1 at the IDF. Includes a 5 m service loop at each end.` });
  });

  // ---------- Circuits: from the recorded fibre and uplink cords at the MDF ----------
  const mdf = racks[mdfRack];
  const fibreCord = cables.find((c) => c.role === 'patch' && c.purpose === 'fibre-sm' && c.where?.rack === mdfRack);
  const ends = [fibreCord.connects.from, fibreCord.connects.to];
  const panelEnd = ends.find((e) => itemAt(mdf, e.u)?.kind === 'fibre-panel'), ispEnd = ends.find((e) => itemAt(mdf, e.u)?.kind === 'isp');
  const ispU = itemAt(mdf, ispEnd.u).u;
  const fwCords = cables.filter((c) => c.role === 'patch' && c.where?.rack === mdfRack && [c.connects?.from, c.connects?.to].some((e) => e?.u && itemAt(mdf, e.u)?.u === ispU) && [c.connects?.from, c.connects?.to].some((e) => e?.u && itemAt(mdf, e.u)?.kind === 'firewall'));
  const fwEnd = (c) => [c.connects.from, c.connects.to].find((e) => itemAt(mdf, e.u)?.kind === 'firewall');
  const ispPort = (c) => +[c.connects.from, c.connects.to].find((e) => itemAt(mdf, e.u)?.u === ispU).ports;
  const panelPorts = portRange(panelEnd.ports), netPorts = portRange(ispEnd.ports);
  const two = /both/i.test(fibreCord.notes ?? '') && panelPorts.length >= 4;
  const leadLen = (e) => Math.ceil(Math.abs(core.riserC[1] - e.at[1]) + LEVEL[mdfFloor] + (core.riserC[1] - core.rackAt[1]) + 2 + 10);
  const entries = [{ id: `${SITE}-entry-south`, name: 'Telecoms entry, south duct (ground floor)', level_m: 0, at: [core.riserC[0], 0], notes: 'A duct from the street into the ground floor telecoms room, then up riser 1.' }];
  if (two) entries.push({ id: `${SITE}-entry-north`, name: 'Telecoms entry, north duct (ground floor)', level_m: 0, at: [core.riserC[0], DEPTH], notes: 'A second duct from the other street, for a diverse route into the building.' });
  const LEADIN_VIA = [RISER.id, `t${mdfFloor}-comms`];
  const range = (a) => (a.length > 1 ? `${a[0]}-${a[a.length - 1]}` : `${a[0]}`);
  const circuits = (two ? [0, 1] : [0]).map((k) => {
    const half = (a) => (two ? a.slice(k * a.length / 2, (k + 1) * a.length / 2) : a);
    const cords = two ? [fwCords[k]] : fwCords;
    const fw = fwEnd(cords[0]);
    return {
      id: `${SITE}-isp-${k + 1}`, name: `Internet circuit ${k + 1}`, provider: k ? 'Carrier Two' : 'Carrier One', role: two ? (k ? 'secondary' : 'primary') : 'primary',
      type: 'Dedicated internet access over fibre, handed off as Ethernet', bandwidth: 'Not recorded', entry: entries[k].id,
      lead_in: { type: 'fibre-os2', cores: 2, length_m: leadLen(entries[k]), via: LEADIN_VIA }, panel: { rack: mdfRack, u: itemAt(mdf, panelEnd.u).u, ports: range(half(panelPorts)) },
      handoff: { rack: mdfRack, u: ispU, customer: cords.map(ispPort), network: half(netPorts) }, firewall: { rack: mdfRack, u: itemAt(mdf, fw.u).u, port: +fw.ports }, cables: [fibreCord.id, ...cords.map((c) => c.id)],
    };
  });
  const circDoc = {
    site: SITE, fictional: 'Made up for the demo: the providers, the entry and the lead-in lengths are invented.', entry_points: entries, circuits,
    notes: [two ? 'Both lead-ins come up riser 1, so the two circuits share one path inside the building: worth a second riser when the building allows.'
      : 'One provider, as the office\'s patching records (one provider\'s fibre at the MDF). The cellular router in the rack is the backup path; it is not modelled as a circuit.'],
  };

  // ---------- Tray sizes from the cables each carries ----------
  const SIZES = [[100, 60], [150, 60], [200, 60], [300, 60], [450, 60], [600, 60]];
  const count = new Map();
  for (const r of runsOut) for (const v of r.via) count.set(v, (count.get(v) ?? 0) + 1);
  for (const v of LEADIN_VIA) count.set(v, (count.get(v) ?? 0) + circuits.length);
  for (const f of FLOORS) for (const t of floorsOut[f].trays) {
    const n = count.get(t.id) ?? 0;
    if (t.kind === 'ladder') { t.capacity = trayCapacity(t.width_mm, t.depth_mm); continue; }
    const [w, d] = SIZES.find(([w0, d0]) => trayCapacity(w0, d0) >= Math.ceil(n * 1.25)) ?? SIZES[SIZES.length - 1];
    Object.assign(t, { width_mm: w, depth_mm: d, capacity: trayCapacity(w, d) });
  }

  // ---------- Write ----------
  const trayOut = (t) => order(t, ['id', 'kind', 'name', 'path', 'z_m', 'width_mm', 'depth_mm', 'capacity', 'feeds']);
  const gapsHere = (f) => spacesOn(f).filter((id) => { const c = raw.types[raw.spaces[id].space_type].keia_atlas.capacity; return (raw.spaces[id].count ?? 1) === 1 && c && c.max >= 12; }).map((id) => `${raw.spaces[id].number} ${raw.spaces[id].name}`);
  for (const f of FLOORS) {
    const placedAps = writeOpenArea(SITE, f, floorsOut[f].aps, `Installed with the floor's access switches (made up).`);
    const g = gapsHere(f);
    const doc = {
      site: SITE, floor: f, name: site.floors.find((x) => x.id === f).name, fictional: FICTION,
      level_m: LEVEL[f], slab_to_slab_m: SLAB, ceiling_m: 2.7, raised_floor_m: 0.15, tray_m: TRAY_Z,
      outline: OUTLINE, core: coreOn(f), corridors: CORRIDORS, areas: floorsOut[f].areas, risers: [RISER],
      racks: [{ rack: perFloor[f].rackId, at: core.rackAt, facing: 's' }],
      trays: floorsOut[f].trays.map(trayOut),
      access_points: placedAps,
      notes: [
        `A ${L} × ${DEPTH} m floor plate: a row of spaces along each facade, two 1.6 m corridors, and a middle zone with the core (two stairs, ${LIFTS} lifts, toilets, riser 1). The comms room sits in the core beside the riser${FLOORS.length > 1 ? ', one above the other on every floor' : ''}.`,
        'Spaces are packed wall to wall along the corridors, each with its door on the corridor: small spaces back to back in the middle zone either side of the core; desks, shared spaces and large spaces along the facades.',
        'Trays run in the corridor ceiling void at 3.1 m; a basket branches off to each space\'s data entry (above its door) and to each access point. Tray sizes are chosen for the cables they carry plus a quarter for growth, at a 40 percent fill.',
        ...(halls[f] ? ['The town hall area beside the cafeteria is where people gather, so it has U7 Pro Max access points (one per 100 m²); the rest of the open area has U7 Pro (one per 150 m²).'] : []),
        ...(perFloor[f].spare ? [`${perFloor[f].spare} data outlets with nothing plugged in are terminated on panel ports without a patch cord (spare): the comms room's recorded patching has fewer live ports than the floor has outlets.`] : []),
        ...(g.length ? [`The Wi-Fi standard wants an access point in every space of 12 or more seats (${g.join(', ')}); no space type has one yet, so these are gaps.`] : []),
      ],
    };
    write(`data/floors/${SITE}-${f}.yaml`, `# ${site.name}, ${doc.name.replace(/:.*$/, '').toLowerCase()}: the floor plan for the 3D model and the floor map. Made up (rule F9); written by\n# ${THIS}. Metres from the outline's south-west corner, x east, y north.\n${stringify(doc)}`);
  }
  const runsDoc = {
    site: SITE, fictional: FICTION,
    limits: {
      copper_link_m: 90, copper_channel_m: 100,
      sources: [
        { title: 'ANSI/TIA-568.2-D: 90 m permanent link, 100 m channel (named in the house cabling standard)', url: 'https://tiaonline.org/products-and-services/tia-standards/' },
        { title: 'Category 6 cable (Wikipedia): 90 m of solid horizontal cable plus patch cords, 100 m in all', url: 'https://en.wikipedia.org/wiki/Category_6_cable' },
      ],
    },
    allowance: { rack_slack_m: 3, outlet_slack_m: 0.3, outlet_cord_m: 5, notes: 'House: a 3 m service loop at the panel and 0.3 m at the outlet are in each length; the channel check adds the recorded patch cord and 5 m for the device cord.' },
    tester: 'A calibrated Cat6A certification tester (made up); every result is invented for the demo.',
    runs: runsOut,
  };
  write(`data/runs/${SITE}.yaml`, `# Permanent links at the ${site.name}: one run from a comms room patch panel port to every data outlet and access point${FLOORS.length > 1 ? ', and the riser fibre' : ''}.\n# Made up (rule F9); written by ${THIS}. The id is the label on the panel end (SITE-ROOM-RACK-UNIT-PORT). A spare run is terminated but not patched.\n${stringify(runsDoc)}`);
  write(`data/circuits/${SITE}.yaml`, `# The internet in and out of the ${site.name}: ${circuits.length > 1 ? 'two providers\' circuits' : 'the provider\'s circuit'}, from the building entry to the firewall${circuits.length > 1 ? 's' : ''}. Made up;\n# written by ${THIS}. The provider's box is the one at U${ispU} in the MDF.\n${stringify(circDoc)}`);
  for (const [id, g] of Object.entries(placed)) {
    const file = path.join(ROOT, `data/spaces/${SITE}/${id}.yaml`);
    const doc = parseDocument(readFileSync(file, 'utf8'));
    doc.set('geometry', doc.createNode(g));
    writeFileSync(file, flowShort(doc).toString({ lineWidth: 0 }));
  }
  const horiz = runsOut.filter((r) => r.kind === 'horizontal');
  const differ = Object.entries(placed).filter(([id, g]) => !isComms(id) && (g.size_m && (raw.spaces[id].count ?? 1) === 1 || g.mirror || g.door || g.odd)).length;
  summary.push({ site: SITE, plate: `${L} × ${DEPTH}`, rooms: Object.keys(placed).length, differ, runs: runsOut.length, spare: horiz.filter((r) => r.spare).length, aps: FLOORS.reduce((n, f) => n + floorsOut[f].aps.length, 0),
    circuits: circuits.length, longest: Math.max(...horiz.map((r) => r.length_m)) });
}
console.table(summary);
console.log(`asset tags AG-${String(firstTag).padStart(6, '0')} to AG-${String(nextTag - 1).padStart(6, '0')}`);
console.log(`rooms of 12 or more seats without an access point (gaps): ${gaps.length}: ${gaps.join('; ')}`);
