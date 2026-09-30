// What the guide's pages need about one room, worked out once at build time (files starting with _ are
// not pages). `forClient` is the little the browser needs to make a report or a request and read its status back.
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { loadYaml } from '../../lib/demo-clock.mjs';
import { spaces, sites, KIND, href, DEMO_TODAY } from '../../lib/data.mjs';
import { incidentList, byUrgency } from '../../lib/incidents.mjs';
import { PEOPLE } from '../../lib/demo.mjs';
import { loadPrivacy, recordFor, isSensing } from '../../lib/privacy.mjs';
import { GUIDE_KINDS, knownWords, roomGuide, symptomsFor, ownerFor, accessOf, accessWords, privacyWords, equipmentOf } from '../../lib/guide.mjs';

export const guidePaths = () => Object.keys(spaces).filter((id) => GUIDE_KINDS.includes(KIND(spaces[id]))).map((room) => ({ params: { room } }));

// data/accessibility/<site>.yaml, by site id. Build time only.
let access = null;
function loadAccess() {
  if (access) return access;
  const dir = path.join(process.cwd(), 'data', 'accessibility');
  access = existsSync(dir) ? Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.yaml')).map((f) => [f.slice(0, -5), loadYaml(path.join(dir, f))])) : {};
  return access;
}
const TODAY = DEMO_TODAY;
const titleOf = (x) => (x.number ? `${x.number} ${x.name}` : x.name);

// The nearest room at the site whose loop passed a test in the last year: same floor first.
function nearestLoop(x) {
  const a = loadAccess()[x.site];
  if (!a) return null;
  const ok = Object.entries(a.rooms).filter(([id, r]) => id !== x.id && r.hearing_loop?.result === 'meets' && (Date.parse(TODAY) - Date.parse(r.hearing_loop.tested)) / 864e5 <= 366 && spaces[id]);
  if (!ok.length) return null;
  const same = ok.filter(([id]) => spaces[id].floor === x.floor);
  const [id] = (same.length ? same : ok).sort(([p], [q]) => p.localeCompare(q, 'en', { numeric: true }))[0];
  const floor = sites[x.site].floors?.find((f) => f.id === spaces[id].floor)?.name;
  return `${titleOf(spaces[id])}${same.length ? ', on this floor' : floor ? `, ${floor.toLowerCase()}` : ''}`;
}

// A known problem's words after its title: who has it (as the With chip would say), what is being done, when.
export function knownText(v) {
  const p = v.inc.keia_atlas?.assigned ? PEOPLE.find((q) => q.id === v.inc.keia_atlas.assigned) : null;
  return `${p ? `With ${p.name.split(' ')[0]}. ` : ''}${knownWords({ state: v.inc.state, priority: v.inc.priority, hold: v.hold?.hold })}`;
}

export function guideRoom(id) {
  const x = spaces[id], site = sites[x.site];
  const title = titleOf(x);
  const office = site.city ? `${site.city} office` : site.name;
  const known = incidentList.filter((v) => v.inc.room === id && v.open).sort(byUrgency);
  const g = roomGuide({ option: x.option, fitted: x.fitted, name: 'the room' });
  const classes = [...new Set(equipmentOf(x.option, x.fitted).map((e) => e.class))];
  const owner = ownerFor(PEOPLE, x.site, site.city);
  // Privacy: the records that cover this room's sensing units, one per record.
  const recs = loadPrivacy();
  const covering = [...new Map(x.positions.filter((p) => isSensing(p.cls)).map((p) => recordFor(recs, p.cls, x.site)).filter(Boolean).map((r) => [r.id, r])).values()];
  const privacy = { ...privacyWords(covering, { monitor: classes.includes('monitor') }), sensing: [...new Set(x.positions.filter((p) => isSensing(p.cls)).map((p) => p.role ?? p.cls))] };
  const a = accessOf(loadAccess()[x.site], id);
  const accessRows = accessWords(a, { system: g.system, today: TODAY, nearest: a && !a.hearing_loop ? nearestLoop(x) : null });
  return {
    x, site, title, office, known, g, owner, privacy, accessRows, access: a,
    symptoms: symptomsFor(classes),
    knownLine: known.length ? `${known[0].inc.short_description}. ${knownText(known[0])}` : null,
    home: `/guide/${id}/`,
    forClient: {
      id, title, site: x.site, region: site.region, tz: site.time_zone, where: `${title}, ${site.name}`, owner,
      positions: x.positions.map((p) => ({ position: p.position, cls: p.cls, role: p.role ?? null, current: { asset_tag: p.current?.asset_tag ?? null } })),
    },
    staffBoard: href(`/incidents/?site=${x.site}&state=new`),
  };
}
