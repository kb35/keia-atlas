// The office in 3D, as data for the page's script (src/lib/office3d-client.mjs): the scene and every path to the
// internet from src/lib/office3d.mjs, the live simulation's model for this office (the same rooms and units as
// the Rooms and Devices overviews, so every window agrees), plus the access points and the two circuits as
// things the feed reports on. Built for each site that has floor files. Kept out of the page so the page is small.
import { building, sitesWithFloors } from '../../../lib/floors.mjs';
import { sceneOf, pathsOf } from '../../../lib/office3d.mjs';
import { roomsModel, devicesModel, lean } from '../../../lib/livemodel.mjs';
import { href } from '../../../lib/data.mjs';

export function getStaticPaths() {
  return sitesWithFloors().map((site) => ({ params: { site } }));
}

export function GET({ params }) {
  const M = building(params.site);
  const scene = sceneOf(M);
  const { hops, traces } = pathsOf(M, params.site);
  // The live model: this office's units (every unit that reports), its rooms, then its access points and circuits.
  const dm = devicesModel(), rm = roomsModel();
  const si = dm.sites.findIndex((s) => s.id === params.site);
  // Access points are units in the live model too; they are added once, below, with the 3D view's own kind.
  const units = dm.units.filter((u) => u.site === si && u.cls !== 'wireless-access-point');
  const at = new Map(units.map((u, i) => [u.id, i]));
  const rooms = rm.rooms.filter((r) => r.site === si).map((r) => ({ ...r, units: r.units.map((i) => at.get(rm.units[i].id)).filter((i) => i != null) }));
  const inc = (tag) => dm.incs.findIndex((x) => x.tag === tag);
  for (const a of M.aps) units.push({ id: a.asset_tag, n: `Access point ${a.hostname}`, cls: 'access-point', site: si, room: null, old: 0, inc: inc(a.asset_tag) });
  for (const c of M.circuits) units.push({ id: c.id, n: `${c.name}, ${c.provider}`, cls: 'circuit', site: si, room: null, old: 0, inc: -1 });
  const live = lean({ sites: dm.sites, units, rooms, incs: dm.incs }, ['id', 'n', 'cls', 'room', 'old', 'inc']);
  const std = M._raw.standards.cables;
  const hex = Object.fromEntries((std?.colours ?? []).map((c) => [c.id, c.hex]));
  const purposes = (std?.purposes ?? []).filter((p) => M.runs.some((r) => r.purpose === p.id)).map((p) => ({ id: p.id, n: p.name, hex: hex[p.colour] ?? null }));
  const body = { ...scene, hops, traces, live, purposes, base: href('/') };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}
