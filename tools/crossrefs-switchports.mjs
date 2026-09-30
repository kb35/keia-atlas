// Cross-reference checks for switch ports (data/switch-ports/<site>.yaml, schemas/ext/switch-ports.schema.yaml).
//
//   file      one file per office with floor plans, named for its site
//   VLANs     the site's table has every VLAN in the network standard's plan once, nothing else and never VLAN 1;
//             a routed VLAN has a gateway inside its subnet, the AV VLAN (not routed) has none
//   switches  every switch in the office (comms room rack switches and in-room switches) is recorded once, by its
//             rack and unit or its space and position; its id is its unit's hostname, or when it has no unit, a
//             hostname no unit uses; ids are unique across every site
//   ports     each port is listed once (in ports or disabled) and is a real port: a number up to the switch's port
//             count or a patched uplink, or a port id from the in-room switch's model
//   far ends  the chain each port names is the one the room wiring, the runs and the patch cords give (src/lib/
//             switchcore.mjs farEnds): the same run, patch cord, unit and unit port, or the same switch and port at
//             the other end. A port something reaches is not disabled; a port nothing reaches is not listed as used.
//
// Whether a port follows the VLAN plan is not checked here: that is a finding the pages show as To review, since a
// real switch can be set wrong. Each problem is { file, at, message }, as in crossrefs.mjs.
import { buildingModel } from '../src/lib/floors.mjs';
import { switchesOf, hostnameFor, farEnds, vlanPlan, rangeList } from '../src/lib/switchcore.mjs';

const ip = (s) => s.split('.').reduce((n, x) => n * 256 + Number(x), 0);
const inSubnet = (addr, cidr) => { const [net, bits] = cidr.split('/'); const m = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0; return ((ip(addr) & m) >>> 0) === ((ip(net) & m) >>> 0); };
const same = (a, b) => String(a ?? '') === String(b ?? '');

export function crossCheckSwitchPorts(records) {
  const problems = [];
  const inFolder = (folder) => records.filter((r) => r.folder === folder);
  const byId = (folder) => Object.fromEntries(inFolder(folder).map((r) => [r.id, r.data]));
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const files = inFolder('switch-ports');
  const floorSites = new Set(inFolder('floors').map((r) => r.data.site));
  if (!files.length && !floorSites.size) return problems;
  const raw = { sites: byId('sites'), spaces: byId('spaces'), installs: byId('installs'), types: byId('space-types'), models: byId('device-models'), racks: byId('racks'),
    cables: byId('cables'), floors: byId('floors'), runs: byId('runs'), circuits: byId('circuits'), standards: byId('standards') };
  const plan = vlanPlan(raw.standards.network);
  const planIds = new Set(plan.map((v) => v.vlan));
  const hostsInUse = new Map();
  for (const rec of inFolder('installs')) for (const p of rec.data.positions ?? []) if (p.hostname) hostsInUse.set(p.hostname, rec.id);
  const ids = new Map();

  for (const site of floorSites) if (!files.some((r) => r.data.site === site)) {
    const rec = inFolder('floors').find((r) => r.data.site === site);
    report(rec, [], `site ${site} has floor plans but no data/switch-ports/${site}.yaml`);
  }

  for (const rec of files) {
    const D = rec.data;
    if (rec.id !== D.site) report(rec, ['site'], `file name "${rec.id}" must be the site id "${D.site}"`);
    if (!raw.sites[D.site]) { report(rec, ['site'], `site "${D.site}" does not exist`); continue; }
    const M = buildingModel(raw, D.site);
    if (!M) { report(rec, ['site'], `site ${D.site} has no floor plans, so its switch ports cannot be checked`); continue; }

    // The VLAN table.
    const seen = new Set();
    D.vlans.forEach((v, i) => {
      const at = ['vlans', i];
      if (seen.has(v.vlan)) report(rec, [...at, 'vlan'], `VLAN ${v.vlan} is listed twice`);
      seen.add(v.vlan);
      if (v.vlan === 1) report(rec, [...at, 'vlan'], 'VLAN 1 carries nothing (network standard, no-vlan-1), so it has no row');
      else if (!planIds.has(v.vlan)) report(rec, [...at, 'vlan'], `VLAN ${v.vlan} is not in the network standard's VLAN plan`);
      const p = plan.find((x) => x.vlan === v.vlan);
      if (p?.routed && !v.gateway) report(rec, [...at], `VLAN ${v.vlan} is routed, so it needs a gateway`);
      if (p && !p.routed && v.gateway) report(rec, [...at, 'gateway'], `VLAN ${v.vlan} is not routed, so it has no gateway`);
      if (v.gateway && !inSubnet(v.gateway, v.subnet)) report(rec, [...at, 'gateway'], `${v.gateway} is not in ${v.subnet}`);
    });
    for (const p of plan) if (!seen.has(p.vlan)) report(rec, ['vlans'], `VLAN ${p.vlan} ${p.name} from the plan has no row`);

    // The switches.
    const sws = switchesOf(M);
    const F = farEnds(M);
    const idOf = new Map(sws.map((s) => [s.key, hostnameFor(M, s)]));
    const found = new Set();
    D.switches.forEach((S, i) => {
      const at = ['switches', i];
      if (ids.has(S.id)) report(rec, [...at, 'id'], `switch ${S.id} is already recorded in ${ids.get(S.id)}`);
      ids.set(S.id, rec.file);
      const sw = S.rack ? sws.find((x) => x.where === 'rack' && x.rack === S.rack && x.u === S.u) : sws.find((x) => x.where === 'room' && x.space === S.space && x.position === S.position);
      if (!sw) { report(rec, at, S.rack ? `U${S.u} in rack ${S.rack} is not a switch in this office` : `${S.space} has no in-room switch at position "${S.position}"`); return; }
      if (found.has(sw.key)) report(rec, at, `${sw.label} is recorded twice`);
      found.add(sw.key);
      if (sw.hostname && S.id !== sw.hostname) report(rec, [...at, 'id'], `the id should be the switch's hostname, ${sw.hostname}`);
      if (!sw.hostname && hostsInUse.has(S.id)) report(rec, [...at, 'id'], `hostname ${S.id} belongs to a unit in ${hostsInUse.get(S.id)}`);

      // Ports: each once, each real.
      const far = F.get(sw.key);
      const listed = new Map();
      const disabled = sw.where === 'rack' ? rangeList(typeof S.disabled === 'string' ? S.disabled : '') : (Array.isArray(S.disabled) ? S.disabled : []);
      const max = sw.where === 'rack' ? Math.max(sw.ports, ...[...far.keys()].filter((p) => typeof p === 'number')) : null;
      const real = (p) => (sw.where === 'rack' ? Number.isInteger(p) && p >= 1 && p <= max : sw.ports.includes(p));
      S.ports.forEach((P, j) => {
        const pat = [...at, 'ports', j];
        if (listed.has(String(P.port))) report(rec, [...pat, 'port'], `port ${P.port} is listed twice`);
        listed.set(String(P.port), P);
        if (!real(P.port)) report(rec, [...pat, 'port'], sw.where === 'rack' ? `${sw.label} has no port ${P.port}` : `the in-room switch's model has no network port "${P.port}"`);
        const f = far.get(P.port);
        if (!f) { report(rec, [...pat, 'port'], `nothing is patched or cabled to port ${P.port}, so it belongs under disabled`); return; }
        // The far end, link by link.
        const R = P.far ?? {};
        const want = (k, v, what) => { if (!same(R[k], v)) report(rec, [...pat, 'far', k], `${what} is ${v ?? 'none'}, not ${R[k] ?? 'none'} (${f.kind === 'outlet' ? 'runs, patch cords and room wiring' : 'patch cords and room wiring'})`); };
        // A room whose build option is missing is reported by the main checks; what plugs in there can't be known.
        if (f.kind === 'outlet' && f.space && M.rooms[f.space] && !M.rooms[f.space].optionData) return;
        if (f.kind === 'outlet') {
          want('run', f.run, 'the permanent link');
          want('patch', f.patch, 'the patch cord');
          want('unit', f.unit?.tag, 'the unit on the outlet');
          want('unit_port', f.unit?.port, "the unit's port");
        } else if (f.kind === 'switch' || f.kind === 'uplink') {
          want('switch', idOf.get(f.key), 'the switch at the other end');
          want('port', f.port, 'its port');
        } else if (f.kind === 'item') {
          want('rack', f.rack, 'the rack at the other end'); want('u', f.u, 'the unit at the other end');
        } else if (f.kind === 'unit') {
          want('unit', f.unit?.tag, 'the unit on the cable');
          want('unit_port', f.unit?.port, "the unit's port");
        }
      });
      for (const p of disabled) {
        if (listed.has(String(p))) report(rec, [...at, 'disabled'], `port ${p} is both listed and disabled`);
        else listed.set(String(p), { state: 'disabled' });
        if (!real(p)) report(rec, [...at, 'disabled'], `${sw.label} has no port ${p}`);
        if (far.has(p)) report(rec, [...at, 'disabled'], `port ${p} is patched or cabled, so it cannot be disabled`);
      }
      for (const p of far.keys()) if (!listed.has(String(p))) report(rec, [...at, 'ports'], `port ${p} is patched or cabled but not recorded`);
      const every = sw.where === 'rack' ? Array.from({ length: max }, (_, k) => k + 1) : sw.ports;
      for (const p of every) if (!listed.has(String(p))) report(rec, [...at, 'disabled'], `port ${p} is neither listed nor disabled`);
    });
    for (const sw of sws) if (!found.has(sw.key)) report(rec, ['switches'], `${sw.label} (${sw.where === 'rack' ? `${sw.rack} U${sw.u}` : `${sw.space}/${sw.position}`}) is not recorded`);
  }
  return problems;
}
