// Cables along containment (rule R7) and room geometry for 3D.
//
// For every room profile and build option: every cable is routed, every segment runs along one of the
// room's axes (no free arcs), and each cable starts and ends at the port it really uses. The geometry
// recorded in the profile's data must match the drawing's model, so the 3D model and the drawing agree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildRoom, render } from '../src/lib/room3d.mjs';
import { routeCables } from '../src/lib/cableroute.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const load = (d) => Object.fromEntries(readdirSync(`${ROOT}data/${d}`).filter((f) => f.endsWith('.yaml')).map((f) => [f.slice(0, -5), parse(readFileSync(`${ROOT}data/${d}/${f}`, 'utf8'))]));
const types = load('space-types'), models = load('device-models');
// Comms rooms, the IT store and a floor's open areas have no room drawing of their own (no display wall, no table, no AV): nothing to route or size.
const COMMS = new Set(['idf', 'mdf', 'it-store', 'open-area']);
const itemsOf = (o) => o.equipment.flatMap((e) => {
  const n = typeof e.quantity === 'number' ? e.quantity : 1;
  return Array.from({ length: n }, (_, i) => ({ e, key: n > 1 ? `${e.key}#${i + 1}` : e.key, i, n, loc: e.location ?? 'tbd', label: e.class }));
});
const rooms = [];
for (const [id, t] of Object.entries(types)) {
  if (COMMS.has(id)) continue;
  for (const o of t.keia_atlas.options) {
    const fitted = o.equipment.filter((e) => e.requirement === 'optional').map((e) => e.key);
    const M = buildRoom(id, o, itemsOf(o), { fitted, models });
    const R = render(M, { width: 760, pad: 12 });
    rooms.push({ id, o, M, RT: routeCables(M, o, fitted, { models, project: R.project }) });
  }
}

test('every cable is routed along the room axes, with no free arcs', () => {
  const bad = [];
  for (const { id, o, RT } of rooms) for (const c of RT.cables) {
    if (c.tail) continue;
    if (!c.pts || c.pts.length < 2) { bad.push(`${id}/${o.id} ${c.from} -> ${c.to}: not routed`); continue; }
    for (let i = 1; i < c.pts.length; i++) {
      const moved = [0, 1, 2].filter((k) => Math.abs(c.pts[i][k] - c.pts[i - 1][k]) > 1e-6);
      if (moved.length > 1) { bad.push(`${id}/${o.id} ${c.from} -> ${c.to}: segment ${i} is diagonal`); break; }
    }
  }
  assert.deepEqual(bad, []);
});

test('every cable starts and ends at the port it uses', () => {
  const bad = [];
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6;
  for (const { id, o, RT } of rooms) for (const c of RT.cables) {
    if (!c.pts || c.feed) continue;
    if (c.endA.p && !near(c.pts[0], c.endA.p)) bad.push(`${id}/${o.id} ${c.from}: starts away from its port`);
    if (c.endB.p && !c.endB.entry && !c.endB.closet && !near(c.pts.at(-1), c.endB.p)) bad.push(`${id}/${o.id} ${c.to}: ends away from its port`);
  }
  assert.deepEqual(bad, []);
});

test('each profile records the geometry its drawing uses', () => {
  const bad = [];
  for (const [id, t] of Object.entries(types)) {
    if (COMMS.has(id)) continue;
    const g = t.keia_atlas.geometry;
    if (!g) { bad.push(`${id}: no geometry`); continue; }
    const { M } = rooms.find((r) => r.id === id);
    const d = M.anchors.door;
    if (Math.abs(g.width_m - M.room.W) > 0.006 || Math.abs(g.depth_m - M.room.D) > 0.006) bad.push(`${id}: size ${g.width_m} x ${g.depth_m}, drawing ${M.room.W} x ${M.room.D}`);
    if (Math.abs(g.ceiling_m - M.H) > 1e-6) bad.push(`${id}: ceiling ${g.ceiling_m}, drawing ${M.H}`);
    if (g.door && (!d || g.door.wall !== d.wall || Math.abs(g.door.from_m - d.a0) > 0.006 || Math.abs(g.door.to_m - d.a1) > 0.006)) bad.push(`${id}: door differs from the drawing`);
    if ((g.display_wall === 'back') !== !!M.anchors.wall) bad.push(`${id}: display wall differs from the drawing`);
  }
  assert.deepEqual(bad, []);
});
