// Cross-reference checks for switch ports (data/switch-ports/<site>.yaml, schemas/ext/switch-ports.schema.yaml).
//
//   file      one file per office with floor plans, named for its site; its VLAN group is the site's own
//   VLANs     every VLAN in the network standard's plan once, with the plan's role, nothing else and never VLAN 1;
//             a routed VLAN has a gateway inside its prefix, the AV VLAN (not routed) has none
//   switches  every switch in the office (comms room rack switches and in-room switches) is recorded once, by its
//             rack and unit or its space and position; its id is its unit's hostname, or when it has no unit, a
//             hostname no unit uses; ids are unique across every site
//   ports     each interface is listed once (in interfaces or disabled) and is a real port: a number up to the
//             switch's port count or a patched uplink, or a port id from the in-room switch's model
//   traces    the cable trace each interface records (connected) is the one the patch cords, the runs and the room
//             wiring give (src/lib/switchcore.mjs farEnds and connectedOf): the same cables in the same order, and
//             the same device and interface at the end. A port something reaches is not disabled; a port nothing
//             reaches is not listed as cabled.
//   groups    each member is a switch in the file or a unit in one of the office's racks, in one group at most
//   addresses each is inside a routed VLAN's prefix and not its gateway, used once, for a unit at the office or a
//             switch in the file; a MAC is used once across every office; a unit on an access port has its address
//             in that port's VLAN
//
// Whether a port follows the VLAN plan is not checked here: that is a finding the pages show as To review, since a
// real switch can be set wrong. Each problem is { file, at, message }, as in crossrefs.mjs.
import { buildingModel } from '../src/lib/floors.mjs';
import { switchesOf, hostnameFor, farEnds, vlanPlan, rangeList, connectedOf, groupsOf } from '../src/lib/switchcore.mjs';

const ip = (s) => s.split('.').reduce((n, x) => n * 256 + Number(x), 0);
const inSubnet = (addr, cidr) => { const [net, bits] = cidr.split('/'); const m = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0; return ((ip(addr) & m) >>> 0) === ((ip(net) & m) >>> 0); };
const same = (a, b) => String(a ?? '') === String(b ?? '');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');
const text = (c) => (c ? JSON.stringify(Object.fromEntries(Object.entries(c).sort())) : 'nothing');

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
  const macs = new Map();

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

    // The VLAN group.
    if (D.vlan_group !== D.site) report(rec, ['vlan_group'], `the VLAN group is the site's own, "${D.site}"`);
    const seen = new Set();
    D.vlans.forEach((v, i) => {
      const at = ['vlans', i];
      if (seen.has(v.vid)) report(rec, [...at, 'vid'], `VLAN ${v.vid} is listed twice`);
      seen.add(v.vid);
      if (v.vid === 1) report(rec, [...at, 'vid'], 'VLAN 1 carries nothing (network standard, no-vlan-1), so it has no row');
      else if (!planIds.has(v.vid)) report(rec, [...at, 'vid'], `VLAN ${v.vid} is not in the network standard's VLAN plan`);
      const p = plan.find((x) => x.vlan === v.vid);
      if (p && v.role !== slug(p.name)) report(rec, [...at, 'role'], `the plan's role for VLAN ${v.vid} is "${slug(p.name)}"`);
      if (p?.routed && !v.gateway) report(rec, [...at], `VLAN ${v.vid} is routed, so it needs a gateway`);
      if (p && !p.routed && v.gateway) report(rec, [...at, 'gateway'], `VLAN ${v.vid} is not routed, so it has no gateway`);
      if (v.gateway && !inSubnet(v.gateway, v.prefix)) report(rec, [...at, 'gateway'], `${v.gateway} is not in ${v.prefix}`);
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
      S.interfaces.forEach((P, j) => {
        const pat = [...at, 'interfaces', j];
        if (listed.has(String(P.name))) report(rec, [...pat, 'name'], `interface ${P.name} is listed twice`);
        listed.set(String(P.name), P);
        if (!real(P.name)) report(rec, [...pat, 'name'], sw.where === 'rack' ? `${sw.label} has no port ${P.name}` : `the in-room switch's model has no network port "${P.name}"`);
        const f = far.get(P.name);
        if (!f) { report(rec, [...pat, 'name'], `nothing is patched or cabled to port ${P.name}, so it belongs under disabled`); return; }
        // A room whose build option is missing is reported by the main checks; what plugs in there can't be known.
        if (f.kind === 'outlet' && f.space && M.rooms[f.space] && !M.rooms[f.space].optionData) return;
        // The cable trace, cable by cable, and what is at the end.
        const want = connectedOf(f, idOf), got = P.connected ?? null;
        if (text(want) !== text(got)) {
          const R = got ?? {}, W = want ?? {};
          const diff = ['cables', 'device', 'interface', 'rack', 'u'].filter((k) => text({ v: R[k] }) !== text({ v: W[k] }));
          report(rec, [...pat, 'connected', ...(diff.length === 1 ? [diff[0]] : [])], `the cable trace is ${text(want)}, from the patch cords, runs and room wiring; the file says ${text(got)}`);
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

    // Addresses: in a routed VLAN's prefix, used once, for something at this office.
    const tagsHere = new Set();
    for (const r of inFolder('installs')) if (raw.spaces[r.data.space]?.site === D.site) for (const p of r.data.positions ?? []) for (const u of p.units ?? []) tagsHere.add(u.asset_tag);
    const swIds = new Set(D.switches.map((x) => x.id));
    const vlanOfAddress = (a) => D.vlans.find((v) => v.gateway && inSubnet(a.split('/')[0], v.prefix));
    const taken = new Map(), addrOf = new Map();
    (D.addresses ?? []).forEach((A, i) => {
      const at = ['addresses', i];
      const ip = A.address.split('/')[0];
      const v = vlanOfAddress(A.address);
      if (!v) report(rec, [...at, 'address'], `${A.address} is not in any routed VLAN's prefix at this office`);
      else if (A.address.split('/')[1] !== v.prefix.split('/')[1]) report(rec, [...at, 'address'], `${A.address} should carry VLAN ${v.vid}'s prefix length, /${v.prefix.split('/')[1]}`);
      if (v && ip === v.gateway) report(rec, [...at, 'address'], `${ip} is VLAN ${v.vid}'s gateway`);
      if (taken.has(ip)) report(rec, [...at, 'address'], `${ip} is already given to ${taken.get(ip)}`);
      taken.set(ip, A.device);
      if (!tagsHere.has(A.device) && !swIds.has(A.device)) report(rec, [...at, 'device'], `"${A.device}" is not a unit at this office or a switch in this file`);
      if (A.mac) { if (macs.has(A.mac)) report(rec, [...at, 'mac'], `MAC ${A.mac} is already used by ${macs.get(A.mac)}`); macs.set(A.mac, `${A.device} (${rec.file})`); }
      if (v) addrOf.set(`${A.device}|${A.interface ?? ''}`, v.vid);
    });
    for (const [i, S] of D.switches.entries()) S.interfaces.forEach((P, j) => {
      const k = `${P.connected?.device}|${P.connected?.interface ?? ''}`;
      if (!P.enabled || P.mode !== 'access' || !addrOf.has(k)) return;
      if (addrOf.get(k) !== P.untagged_vlan) report(rec, ['switches', i, 'interfaces', j, 'untagged_vlan'], `${P.connected.device} ${P.connected.interface}'s address is in VLAN ${addrOf.get(k)}, but its port is recorded on VLAN ${P.untagged_vlan}`);
    });

    // Groups: each member a switch here or a unit in one of this office's racks, and in one group at most.
    const inGroup = new Map();
    groupsOf(M, D).forEach((g, i) => {
      g.members.forEach((m, j) => {
        if (!m.key) report(rec, ['groups', i, 'members', j], `"${m.ref}" is not a comms room switch in this file or a unit in one of this office's racks`);
        if (inGroup.has(m.ref)) report(rec, ['groups', i, 'members', j], `${m.ref} is already in group ${inGroup.get(m.ref)}`);
        inGroup.set(m.ref, g.id);
      });
    });
  }
  return problems;
}
