// Cross-reference checks for floors, runs and circuits. Only sites with a floor file are
// checked, so an office without one yet is not held to them.
//
//   rooms       every room on a floor is placed, inside the outline, without overlapping another room or the core,
//               and its size is within its profile's area range
//   outlets     every data outlet in every room, and every access point, has exactly one run; no run to nothing
//   ports       a panel port carries one run at most, it is a real port on a panel, it is patched to a switch
//               (data/cables), a patched panel port has a run, and the run's purpose is the patch cord's; a run
//               marked spare is on an unpatched port and goes to an outlet with nothing plugged in
//   trays       a run's trays and risers exist and join in order; runs between floors go through a riser that
//               serves both; the first is the ladder over the run's rack; the last feeds its outlet
//   lengths     a copper permanent link is at most 90 m and the channel at most 100 m (limits and sources in the runs
//               file); a recorded length is not shorter than the modelled route
//   fill        no tray carries more cables than its capacity, where it is known
//   Wi-Fi       access points: each a unit in the floor's one open-area install and on the plan once, a Wi-Fi model,
//               clear of rooms, the core and other trays by 1 m, enough of them for the open area (one per 150 m²)
//               and each town-hall area (one per 100 m²). Serials, tags and hostnames are checked with the installs.
//   circuits    the panel, the provider's box and the firewall are real rack items; the entry point exists
//
// Each problem is { file, at, message }, as in crossrefs.mjs. The model comes from src/lib/floors.mjs, so the checks,
// the generator and the pages measure the same thing.
import { buildingModel, FICTION, inPoly, overlapArea, touches, distToPath, rectArea, wifiAreas, WIFI_RULE, inRect, OPEN_AREA } from '../src/lib/floors.mjs';

const portRange = (s) => { const [lo, hi] = String(s ?? '').split('-').map(Number); const out = []; if (!Number.isFinite(lo)) return out; for (let n = lo; n <= (Number.isFinite(hi) ? hi : lo); n++) out.push(n); return out; };

export function crossCheckFloors(records) {
  const problems = [];
  const inFolder = (folder) => records.filter((r) => r.folder === folder);
  const byId = (folder) => Object.fromEntries(inFolder(folder).map((r) => [r.id, r.data]));
  const floorRecs = inFolder('floors');
  if (!floorRecs.length) return problems;
  const raw = { sites: byId('sites'), spaces: byId('spaces'), installs: byId('installs'), types: byId('space-types'), models: byId('device-models'), racks: byId('racks'),
    cables: byId('cables'), floors: byId('floors'), runs: byId('runs'), circuits: byId('circuits'), standards: byId('standards') };
  const recOf = (folder, pred) => inFolder(folder).find((r) => pred(r.data, r));
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });

  // The floor files themselves.
  for (const rec of floorRecs) {
    const f = rec.data, site = raw.sites[f.site];
    if (!site) { report(rec, ['site'], `site "${f.site}" does not exist`); continue; }
    if (rec.id !== `${f.site}-${f.floor}`) report(rec, ['floor'], `file name "${rec.id}" must be "${f.site}-${f.floor}"`);
    if (!site.floors?.some((x) => x.id === f.floor)) report(rec, ['floor'], `floor "${f.floor}" is not a floor of ${f.site}`);
    if (f.fictional !== FICTION) report(rec, ['fictional'], `must read "${FICTION}" (rule F9)`);
    const racks = new Set(Object.values(raw.racks).map((r) => r.id));
    f.racks.forEach((r, i) => { if (!racks.has(r.rack)) report(rec, ['racks', i, 'rack'], `rack "${r.rack}" does not exist`); });
    const ids = new Set();
    f.trays.forEach((t, i) => { if (ids.has(t.id)) report(rec, ['trays', i, 'id'], `tray "${t.id}" is listed twice`); ids.add(t.id); });
  }

  for (const siteId of [...new Set(floorRecs.map((r) => r.data.site))]) {
    const M = buildingModel(raw, siteId);
    if (!M) continue;
    const floorRec = (fid) => recOf('floors', (d) => d.site === siteId && d.floor === fid);
    const spaceRec = (id) => inFolder('spaces').find((r) => r.id === id);
    const runsRec = recOf('runs', (d) => d.site === siteId);
    const circRec = recOf('circuits', (d) => d.site === siteId);

    // Rooms on the plan.
    const placed = Object.values(M.rooms);
    for (const r of placed) {
      const rec = spaceRec(r.id);
      if (!r.geo) { report(rec, ['geometry'], `room is on floor ${r.floor}, which has a floor plan, but is not placed on it (geometry.on_floor, and size_m for a desk bank or comms room)`); continue; }
      const fl = M.floors.find((f) => f.id === r.floor);
      if (!r.geo.polygon.every((p) => inPoly(p, fl.outline, 0.01))) report(rec, ['geometry', 'on_floor'], `room sits outside floor ${r.floor}'s outline`);
      if (r.outOfRange) report(rec, ['geometry', 'size_m'], `${r.area} m² is outside the profile's ${r.areaRange.min} to ${r.areaRange.max} m²`);
      if (r.count === 1 && !r.geo.entry) report(rec, ['geometry'], 'room has no door or data entry to feed it from');
      for (const c of fl.core.filter((x) => !x.circulation)) if (overlapArea(r.rect, c.rect) > 0.01) report(rec, ['geometry', 'on_floor'], `room overlaps the core (${c.name})`);
      for (const c of fl.corridors) if (overlapArea(r.rect, c.rect) > 0.01) report(rec, ['geometry', 'on_floor'], `room overlaps the ${c.name.toLowerCase()}`);
      if (r.count > 1 && !(raw.spaces[r.id].geometry?.benches?.length)) report(rec, ['geometry'], 'a desk bank needs its benches');
      const desks = r.desks.length;
      if (r.count > 1 && desks !== r.count) report(rec, ['geometry', 'benches'], `the benches seat ${desks} desks, the bank has ${r.count}`);
    }
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      if (a.floor !== b.floor || !a.rect || !b.rect) continue;
      if (overlapArea(a.rect, b.rect) > 0.01) report(spaceRec(b.id), ['geometry', 'on_floor'], `room overlaps ${a.number ?? ''} ${a.name}`.replace('  ', ' '));
    }

    // Runs.
    if (!runsRec) { report(floorRec(M.floors[0].id), [], `site ${siteId} has floor plans but no data/runs/${siteId}.yaml`); continue; }
    const RD = runsRec.data;
    const std = raw.standards.cables;
    const purposes = new Map((std?.purposes ?? []).map((p) => [p.id, p]));
    const types = new Map((std?.cable_types ?? []).map((t) => [t.id, t]));
    const racks = Object.fromEntries(Object.values(raw.racks).map((r) => [r.id, r]));
    const itemAt = (rack, u) => rack?.items.find((it) => u >= it.u && u < it.u + it.size) ?? null;
    const cables = Object.values(raw.cables).find((c) => c.site === siteId)?.cables ?? [];
    // Panel ports that a patch cord uses, with the cord.
    const patched = new Map();
    for (const c of cables) {
      if (c.role !== 'patch') continue;
      for (const e of [c.connects?.from, c.connects?.to]) {
        const rk = racks[e?.rack ?? c.where?.rack]; const it = e?.u ? itemAt(rk, e.u) : null;
        if (it?.kind === 'patch-panel') for (const p of portRange(e.ports)) patched.set(`${rk.id}:${it.u}:${p}`, c);
      }
    }
    const trayIds = new Map(M.floors.flatMap((f) => f.trays.map((t) => [t.id, { ...t, floor: f.id }])));
    const riserIds = new Map(M.floors.flatMap((f) => f.risers.map((x) => [x.id, x])));
    const usedPorts = new Map();
    const outletRuns = new Map();
    const commsFloors = new Set(M.racks.filter((r) => r.floor).map((r) => r.floor));
    RD.runs.forEach((r, i) => {
      const at = ['runs', i];
      // A room whose build option is missing is reported by the main checks; its outlets can't be known, so skip.
      if (r.to?.space && M.rooms[r.to.space] && !M.rooms[r.to.space].optionData) { usedPorts.set(`${r.from.rack}:${itemAt(racks[r.from.rack], r.from.u)?.u}:${r.from.port}`, r.id); return; }
      const rk = racks[r.from.rack]; const it = itemAt(rk, r.from.u);
      if (!rk) { report(runsRec, [...at, 'from', 'rack'], `rack "${r.from.rack}" does not exist`); return; }
      if (!it || !['patch-panel', 'fibre-panel'].includes(it.kind)) { report(runsRec, [...at, 'from', 'u'], `U${r.from.u} in ${rk.id} is not a patch panel`); return; }
      const ports = r.from.port ? [r.from.port] : portRange(r.from.ports);
      for (const p of ports) {
        if (it.ports && p > it.ports) report(runsRec, [...at, 'from'], `${it.label} has ${it.ports} ports, not ${p}`);
        const k = `${rk.id}:${it.u}:${p}`;
        if (usedPorts.has(k)) report(runsRec, [...at, 'from'], `panel port ${rk.id} U${it.u} port ${p} is already used by ${usedPorts.get(k)}`);
        usedPorts.set(k, r.id);
      }
      if (!types.has(r.type)) report(runsRec, [...at, 'type'], `cable type "${r.type}" is not in the house cable standard`);
      const pu = purposes.get(r.purpose);
      if (!pu) report(runsRec, [...at, 'purpose'], `purpose "${r.purpose}" is not in the house cable standard`);
      else if (!pu.media.includes(r.type)) report(runsRec, [...at, 'type'], `a ${r.purpose} cable is ${pu.media.join(' or ')}, not ${r.type}`);
      // The run's panel port and its patch cord.
      // A spare run (terminated, not patched) is only for a room outlet with nothing plugged into it.
      if (r.kind === 'horizontal' && it.kind === 'patch-panel') {
        const cord = patched.get(`${rk.id}:${it.u}:${r.from.port}`);
        if (r.spare) {
          if (cord) report(runsRec, [...at, 'spare'], `panel port ${rk.id} U${it.u} port ${r.from.port} is patched (${cord.id}), so the run is not spare`);
          if (r.to.access_point) report(runsRec, [...at, 'spare'], 'an access point needs a live (patched) port, not a spare one');
          else if (M.rooms[r.to.space]?.outlets.find((o) => o.id === r.to.outlet)?.dev) report(runsRec, [...at, 'spare'], `a device is plugged into ${r.to.outlet}, so its run must be patched, not spare`);
        } else if (!cord) report(runsRec, [...at, 'from'], `panel port ${rk.id} U${it.u} port ${r.from.port} has no patch cord to a switch (data/cables), so the outlet is dead`);
        else if (cord.purpose !== r.purpose) report(runsRec, [...at, 'purpose'], `the patch cord on this port is ${cord.purpose}, the run is ${r.purpose}`);
      }
      // The far end.
      if (r.kind === 'horizontal') {
        const k = r.to.access_point ? `ap:${r.to.access_point}` : `${r.to.space}:${r.to.outlet}`;
        const exists = r.to.access_point ? M.aps.some((a) => a.id === r.to.access_point) : M.rooms[r.to.space]?.outlets.some((o) => o.key === k);
        if (!exists) report(runsRec, [...at, 'to'], r.to.access_point ? `access point "${r.to.access_point}" is not on any floor` : `room "${r.to.space}" has no outlet "${r.to.outlet}"`);
        if (outletRuns.has(k)) report(runsRec, [...at, 'to'], `${k} already has run ${outletRuns.get(k)}`);
        outletRuns.set(k, r.id);
      } else {
        const rk2 = racks[r.to.rack]; const it2 = itemAt(rk2, r.to.u);
        if (!it2 || !['patch-panel', 'fibre-panel'].includes(it2.kind)) report(runsRec, [...at, 'to'], `U${r.to.u} in ${r.to.rack} is not a panel`);
        for (const p of portRange(r.to.ports)) { const k = `${r.to.rack}:${it2?.u}:${p}`; if (usedPorts.has(k)) report(runsRec, [...at, 'to'], `panel port ${r.to.rack} U${it2?.u} port ${p} is already used by ${usedPorts.get(k)}`); usedPorts.set(k, r.id); }
      }
      // Trays and risers, in order.
      const via = r.via.map((v) => trayIds.get(v) ?? (riserIds.has(v) ? { riser: riserIds.get(v) } : null));
      via.forEach((v, j) => { if (!v) report(runsRec, [...at, 'via', j], `"${r.via[j]}" is not a tray or riser on this site's floors`); });
      if (via.every(Boolean)) {
        for (let j = 1; j < via.length; j++) {
          const a = via[j - 1], b = via[j];
          const ok = a.riser && b.riser ? false : a.riser ? a.riser.floors.includes(b.floor) && (inRect(b.path[0], a.riser.rect, 0.01) || inRect(b.path[b.path.length - 1], a.riser.rect, 0.01))
            : b.riser ? b.riser.floors.includes(a.floor) && (inRect(a.path[0], b.riser.rect, 0.01) || inRect(a.path[a.path.length - 1], b.riser.rect, 0.01))
              : a.floor === b.floor && touches(a.path, b.path, 0.01);
          if (!ok) report(runsRec, [...at, 'via', j], `${r.via[j - 1]} and ${r.via[j]} do not join`);
        }
        const rackFloor = M.racks.find((x) => x.id === r.from.rack)?.floor;
        const far = r.kind === 'backbone' ? M.racks.find((x) => x.id === r.to.rack)?.floor : r.to.access_point ? M.aps.find((a) => a.id === r.to.access_point)?.floor : M.rooms[r.to.space]?.floor;
        if (rackFloor && far && rackFloor !== far && !via.some((v) => v.riser && v.riser.floors.includes(rackFloor) && v.riser.floors.includes(far))) report(runsRec, [...at, 'via'], `the run goes from floor ${rackFloor} to floor ${far} but through no riser serving both`);
        const rackAt = M.racks.find((x) => x.id === r.from.rack)?.at;
        if (rackAt && via[0] && !via[0].riser && distToPath(rackAt, via[0].path) > 0.05) report(runsRec, [...at, 'via', 0], `${r.via[0]} does not pass over rack ${r.from.rack}`);
        if (r.kind === 'horizontal') {
          const last = via[via.length - 1];
          const want = r.to.access_point ? `ap-${r.to.access_point}` : `room-${r.to.space}`;
          if (last?.feeds !== want) report(runsRec, [...at, 'via'], `the last tray should be the one that feeds ${r.to.access_point ?? r.to.space} (${want})`);
        }
      }
      // Lengths.
      if (types.get(r.type)?.group === 'copper') {
        if (r.length_m > RD.limits.copper_link_m) report(runsRec, [...at, 'length_m'], `${r.length_m} m is longer than the ${RD.limits.copper_link_m} m permanent link limit`);
        const cord = patched.get(`${rk.id}:${it.u}:${r.from.port}`);
        const channel = r.length_m + (cord?.length_m ?? 0) + (RD.allowance?.outlet_cord_m ?? 0);
        if (channel > RD.limits.copper_channel_m) report(runsRec, [...at, 'length_m'], `the channel (${channel} m with its cords) is longer than ${RD.limits.copper_channel_m} m`);
        const m = M.runs.find((x) => x.id === r.id);
        if (m?.modelled != null && r.length_m + 0.05 < m.modelled) report(runsRec, [...at, 'length_m'], `${r.length_m} m is shorter than the route on the floor plan (${m.modelled} m)`);
        if (r.kind === 'horizontal' && m && m.modelled == null) report(runsRec, [...at, 'via'], 'no route on the trays from the rack to the outlet');
      }
    });
    // Every data outlet and access point on a planned floor has a run; every patched panel port on those floors has one.
    for (const r of placed) for (const o of r.outlets) if (!outletRuns.has(o.key)) report(spaceRec(r.id), [], `data outlet ${o.id} (plate ${o.plate}) has no run in data/runs/${siteId}.yaml`);
    for (const a of M.aps) if (!outletRuns.has(`ap:${a.id}`)) report(floorRec(a.floor), ['access_points'], `access point ${a.id} has no run in data/runs/${siteId}.yaml`);
    for (const [k, c] of patched) {
      const [rackId] = k.split(':');
      if (!commsFloors.has(M.racks.find((x) => x.id === rackId)?.floor)) continue;
      if (!usedPorts.has(k)) report(runsRec, [], `panel port ${k.replace(/:(\d+):(\d+)$/, ' U$1 port $2')} is patched (${c.id}) but has no run`);
    }

    // Tray fill.
    for (const f of M.floors) f.trays.forEach((t, i) => { if (t.capacity != null && t.runs > t.capacity) report(floorRec(f.id), ['trays', i], `${t.id} carries ${t.runs} cables, more than its capacity of ${t.capacity}`); });

    // Wi-Fi. Each access point on the plan is a unit in the floor's open-area install; each unit there is on the plan.
    for (const f of M.floors) {
      const rec = floorRec(f.id);
      const W = wifiAreas(M, f.id);
      const aps = M.aps.filter((a) => a.floor === f.id);
      const open = Object.entries(raw.spaces).filter(([, s]) => s.site === siteId && s.floor === f.id && s.space_type === OPEN_AREA).map(([id]) => id);
      if (open.length !== 1) report(rec, ['access_points'], `floor ${f.id} needs one "Open areas and corridors" space (${OPEN_AREA}) to hold its access points; it has ${open.length}`);
      const placedAt = new Map();
      f.access_points.forEach((a, i) => {
        const at = ['access_points', i];
        const s = raw.spaces[a.space];
        if (!s || s.space_type !== OPEN_AREA || s.site !== siteId || s.floor !== f.id) { report(rec, [...at, 'space'], `"${a.space}" is not this floor's open areas and corridors space`); return; }
        const u = aps.find((x) => x.id === a.id);
        if (!u?.asset_tag) { report(rec, [...at, 'position'], `${a.space} has no access point at position "${a.position}" (data/installs)`); return; }
        const k = `${a.space}/${a.position}`;
        if (placedAt.has(k)) report(rec, [...at, 'position'], `${k} is already placed as ${placedAt.get(k)}`);
        placedAt.set(k, a.id);
        if (u.hostname !== a.id) report(rec, [...at, 'id'], `the id should be the access point's hostname, ${u.hostname}`);
        if (raw.models[u.model]?.class !== 'wireless-access-point') report(rec, [...at, 'position'], `"${u.model}" is not a wireless access point model`);
        if (a.height_m < 2.7 || a.height_m > 4.5) report(rec, [...at, 'height_m'], 'the Wi-Fi standard mounts access points 2.7 to 4.5 m up');
        if (!inPoly(a.at, f.outline)) report(rec, [...at, 'at'], 'outside the floor outline');
        if (W.enclosed.some((r) => inRect(a.at, r.rect, -0.01)) || W.core.some((c) => inRect(a.at, c.rect, -0.01))) report(rec, [...at, 'at'], 'inside a room or the core; access points here cover the open areas and corridors');
        const area = f.areas.find((x) => x.id === a.area);
        if (a.area !== 'open' && !area) report(rec, [...at, 'area'], `area "${a.area}" is not on this floor`);
        if (area && !inRect(a.at, area.rect)) report(rec, [...at, 'at'], `not inside ${area.name}`);
        const near = f.trays.filter((t) => t.feeds !== `ap-${a.id}` && distToPath(a.at, t.path) < WIFI_RULE.clear_of_tray_m);
        if (near.length) report(rec, [...at, 'at'], `closer than ${WIFI_RULE.clear_of_tray_m} m to ${near.map((t) => t.id).join(', ')} (Wi-Fi standard: clear of metal)`);
      });
      for (const id of open) for (const p of raw.installs[id]?.positions ?? []) if (!placedAt.has(`${id}/${p.position}`)) report(rec, ['access_points'], `access point ${p.hostname ?? p.position} (${id}) is not placed on the floor plan`);
      const inOpen = aps.filter((a) => a.area === 'open').length, inHall = aps.filter((a) => a.area !== 'open' && f.areas.find((x) => x.id === a.area)?.kind === 'town-hall').length;
      if (inOpen < W.need.open) report(rec, ['access_points'], `${W.open} m² of open area needs ${W.need.open} access points at one per ${WIFI_RULE.open_m2} m²; ${inOpen} placed`);
      if (inHall < W.need.gathering) report(rec, ['access_points'], `the town-hall areas need ${W.need.gathering} access points at one per ${WIFI_RULE.gathering_m2} m²; ${inHall} placed`);
    }

    // Circuits.
    if (circRec) {
      const C = circRec.data;
      const entries = new Set(C.entry_points.map((e) => e.id));
      C.circuits.forEach((c, i) => {
        const at = ['circuits', i];
        if (!entries.has(c.entry)) report(circRec, [...at, 'entry'], `entry point "${c.entry}" is not listed`);
        const want = [['panel', 'fibre-panel'], ['handoff', 'isp'], ['firewall', 'firewall']];
        for (const [k, kind] of want) { const it = itemAt(racks[c[k].rack], c[k].u); if (it?.kind !== kind) report(circRec, [...at, k], `U${c[k].u} in ${c[k].rack} is not a ${kind}`); }
        for (const v of c.lead_in.via) if (!trayIds.has(v) && !riserIds.has(v)) report(circRec, [...at, 'lead_in', 'via'], `"${v}" is not a tray or riser on this site's floors`);
        for (const id of c.cables ?? []) if (!cables.some((x) => x.id === id)) report(circRec, [...at, 'cables'], `cable "${id}" is not in data/cables/${siteId}.yaml`);
      });
    }
  }
  return problems;
}
