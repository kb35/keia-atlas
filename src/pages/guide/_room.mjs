// What the guide's pages need about one room, worked out once at build time (files starting with _ are
// not pages). `forClient` is the little the browser needs to make a report or a request.
import { spaces, sites, KIND, href } from '../../lib/data.mjs';
import { incidentList, byUrgency } from '../../lib/incidents.mjs';
import { GUIDE_KINDS } from '../../lib/guide.mjs';

export const guidePaths = () => Object.keys(spaces).filter((id) => GUIDE_KINDS.includes(KIND(spaces[id]))).map((room) => ({ params: { room } }));

export function guideRoom(id) {
  const x = spaces[id], site = sites[x.site];
  const title = x.number ? `${x.number} ${x.name}` : x.name;
  const office = site.city ? `${site.city} office` : site.name;
  const known = incidentList.filter((v) => v.inc.room === id && v.open).sort(byUrgency);
  return {
    x, site, title, office, known,
    home: `/guide/${id}/`,
    forClient: {
      id, title, site: x.site, region: site.region, tz: site.time_zone, where: `${title}, ${site.name}`,
      positions: x.positions.map((p) => ({ position: p.position, cls: p.cls, role: p.role ?? null, current: { asset_tag: p.current?.asset_tag ?? null } })),
    },
    staffBoard: href(`/incidents/?site=${x.site}&state=new`),
  };
}
