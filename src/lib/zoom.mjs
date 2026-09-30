// The path is the zoom (UX-V2 §2.2). Six levels, each a page or a state of one:
//   region  /locations/emea/                 office  /locations/dub/        floor  /locations/dub/?floor=3
//   space   /rooms/dub-3-09/                 device  /device/?tag=AG-…      port   /device/?tag=AG-…#port-lan-1
// The top bar's path for a page on the zoom is worked out here from its address, so it always reads
// Locations / EMEA / Dublin office / Third floor / 3.09 Whooper Swan, whichever page linked there. Each step
// carries its level; the Shell's zoom script uses the levels to tell a zoom in or out from any other move.
// Floor and port are states of a page, so the page's own script adds those steps (src/lib/zoom-level.mjs).
import { sites, spaces, SITE_ORDER } from './data.mjs';
export { ZOOM_LEVELS, zoomLevel, pageLevel, zoomDir } from './zoom-level.mjs';

const REGION_WORD = { emea: 'EMEA', amer: 'Americas', apac: 'Asia Pacific' };
const REGION_IDS = Object.keys(REGION_WORD);
const OFFICES = new Set(SITE_ORDER.filter((id) => sites[id]?.kind === 'office'));
const roomTitle = (s) => (s.number ? `${s.number} ${s.name}` : s.name);

export const floorName = (siteId, floor) => sites[siteId]?.floors?.find((f) => String(f.id) === String(floor))?.name ?? `Floor ${floor}`;

// The path for a page on the zoom: [{ label, to?, level }], the last step without a link. Null otherwise.
export function zoomTrail(path) {
  const top = { label: 'Locations', to: '/locations/', level: 0 };
  let m = /^\/locations\/([a-z]+)\/$/.exec(path);
  if (m && REGION_IDS.includes(m[1])) return [top, { label: REGION_WORD[m[1]], level: 1 }];
  if (m && OFFICES.has(m[1])) {
    const s = sites[m[1]];
    return [top, { label: REGION_WORD[s.region], to: `/locations/${s.region}/`, level: 1 }, { label: s.name, level: 2 }];
  }
  m = /^\/rooms\/([a-z0-9-]+)\/$/.exec(path);
  const x = m && spaces[m[1]];
  if (!x) return null;
  const s = sites[x.site];
  if (!s) return null;
  const region = { label: REGION_WORD[s.region], to: `/locations/${s.region}/`, level: 1 };
  if (!OFFICES.has(x.site)) {
    return [top, region, { label: 'Home offices', to: `/locations/${s.region}/home-offices/`, level: 2 }, { label: roomTitle(x), level: 4 }];
  }
  const steps = [top, region, { label: s.name, to: `/locations/${x.site}/`, level: 2 }];
  if (x.floor != null) steps.push({ label: floorName(x.site, x.floor), to: `/locations/${x.site}/?floor=${x.floor}`, level: 3 });
  steps.push({ label: roomTitle(x), level: 4 });
  return steps;
}
