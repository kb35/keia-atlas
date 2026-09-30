#!/usr/bin/env node
// One-off migration: the door and building systems on the network at two receptions (Dublin 3.01, New York 20.01).
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once the runs exist.
//
// Why: the network standard's VLAN plan has a Building VLAN (50) and a Security VLAN (60), and nothing in the demo
// sat on either. The reception space type gained a "secured" option (door controller, CCTV camera and an environment
// sensor, each on its own data outlet); the two receptions were moved to it and their three units recorded by hand
// in data/installs. This script adds what the floor checks then ask for:
//   - one permanent link per new outlet, from free ports on the comms room patch panel that serves the reception,
//     through the same trays as the reception's other runs, the length the route on the floor plan gives (rounded
//     up to 0.1 m), and a made-up passing test;
//   - the patch cords from those panel ports to free ports on the access switch behind the panel: red (critical)
//     for the door controller and the camera, as the house cable standard says, blue (user data) for the sensor.
// Everything is made up for the demo. The edit is made on the text, so comments and layout stay as they were.
//
// Run from the repository root:  node tools/migrations/2026-09-30-reception-security.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadRaw, buildingModel } from '../../src/lib/floors.mjs';

const ROOT = process.cwd();
// Per reception: the rack, the panel and its free ports, and the access switch the panel is patched to.
const PLAN = [
  { site: 'dub', space: 'dub-3-01', rack: 'dub-3-21-r1', panel: 6, ports: [41, 42, 43], sw: 15, cords: ['dub-cb-61', 'dub-cb-62'], room: 'Comms room (MDF) 3.21', where: 'dub-3-21' },
  { site: 'nyc', space: 'nyc-20-01', rack: 'nyc-20-14-r1', panel: 9, ports: [42, 43, 44], sw: 16, cords: ['nyc-cb-83', 'nyc-cb-84'], room: 'Comms room (MDF) 20.14', where: 'nyc-20-14' },
];
// The three outlets in the order of the ports above, and what each carries.
const OUTLETS = [
  { outlet: 'data/ceiling#1', purpose: 'critical', margin: 5.12 },       // CCTV camera
  { outlet: 'data/room-entrance#1', purpose: 'critical', margin: 4.86 }, // door controller
  { outlet: 'data/ceiling#2', purpose: 'user-data', margin: 5.41 },      // environment sensor
];

const runsFile = (site) => path.join(ROOT, 'data', 'runs', `${site}.yaml`);
const cablesFile = (site) => path.join(ROOT, 'data', 'cables', `${site}.yaml`);
if (readFileSync(runsFile('dub'), 'utf8').includes('space: dub-3-01\n      outlet: data/ceiling#1')) {
  console.log('Already run: the reception runs exist.');
  process.exit(0);
}

const pad2 = (n) => String(n).padStart(2, '0');
const runId = (p, rack, u, port) => {
  const [site, fl, rm] = p.where.split('-');
  return `${site.toUpperCase()}-${fl}.${rm}-R${rack.split('-r')[1]}-U${pad2(u)}-P${pad2(port)}`;
};
const runText = (r) => `  - id: ${r.id}
    kind: horizontal
    type: cat6a
    purpose: ${r.purpose}
    from:
      rack: ${r.rack}
      u: ${r.u}
      port: ${r.port}
    to:
      space: ${r.space}
      outlet: ${r.outlet}
    via:
${r.via.map((v) => `      - ${v}`).join('\n')}
    length_m: ${r.length_m}
    test:
      result: pass
      date: 2026-09-22
      length_m: ${r.test_m}
      margin_db: ${r.margin}
`;
const cordText = (c) => `  - id: ${c.id}
    role: patch
    type: cat6a
    length_m: 1
    colour: ${c.colour}
    purpose: ${c.purpose}
    quantity: ${c.n}
    where: { room: ${c.room}, space: ${c.where}, rack: ${c.rack} }
    connects:
      from: { u: ${c.sw}, ports: ${c.swPorts} }
      to: { u: ${c.panel}, ports: ${c.panelPorts} }
    notes: "${c.notes}"
`;

for (const p of PLAN) {
  const text = readFileSync(runsFile(p.site), 'utf8');
  // The reception's other runs give the trays.
  const raw = loadRaw(ROOT);
  const sibling = Object.values(raw.runs).find((f) => f.site === p.site).runs.find((r) => r.to?.space === p.space);
  const runs = OUTLETS.map((o, i) => ({ id: runId(p, p.rack, p.panel, p.ports[i]), rack: p.rack, u: p.panel, port: p.ports[i], space: p.space, outlet: o.outlet, purpose: o.purpose, via: sibling.via, margin: o.margin, length_m: 1, test_m: 1 }));
  // Measure each on the floor plan: add them with a placeholder length, build the model, read the modelled route.
  const trial = { ...raw, runs: { ...raw.runs, [p.site]: { ...raw.runs[p.site], runs: [...raw.runs[p.site].runs, ...runs.map(({ margin, test_m, ...r }) => ({ kind: 'horizontal', type: 'cat6a', from: { rack: r.rack, u: r.u, port: r.port }, to: { space: r.space, outlet: r.outlet }, ...r }))] } } };
  const M = buildingModel(trial, p.site);
  for (const r of runs) {
    const m = M.runs.find((x) => x.id === r.id)?.modelled;
    if (m == null) throw new Error(`no route for ${r.id}`);
    r.length_m = Math.ceil(m * 10) / 10;
    r.test_m = Math.round((r.length_m + 0.04) * 100) / 100;
  }
  writeFileSync(runsFile(p.site), text.replace(/\n*$/, '\n') + runs.map(runText).join(''));

  // The patch cords, before the file's closing "demo: true".
  const ctext = readFileSync(cablesFile(p.site), 'utf8');
  const cords = [
    { id: p.cords[0], colour: 'red', purpose: 'critical', n: 2, sw: p.sw, panel: p.panel, swPorts: `${p.ports[0]}-${p.ports[1]}`, panelPorts: `${p.ports[0]}-${p.ports[1]}`, notes: 'Reception CCTV camera and door controller (Security VLAN). Red: never moved without a change record.' },
    { id: p.cords[1], colour: 'blue', purpose: 'user-data', n: 1, sw: p.sw, panel: p.panel, swPorts: `"${p.ports[2]}"`, panelPorts: `"${p.ports[2]}"`, notes: 'Reception environment sensor (Building VLAN).' },
  ].map((c) => ({ ...c, room: p.room, where: p.where, rack: p.rack }));
  const at = ctext.lastIndexOf('\ndemo: true');
  writeFileSync(cablesFile(p.site), ctext.slice(0, at).replace(/\n*$/, '\n') + cords.map(cordText).join('') + ctext.slice(at + 1));
  console.log(`${p.site}: ${runs.map((r) => `${r.id} ${r.length_m} m`).join(', ')}; cords ${p.cords.join(', ')}`);
}
