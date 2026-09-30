// What the two usage pages tell an engineer, worked out once at build time: open incidents (real, from the
// service desk tickets in data/), failed calls and little-used kit (made up, the same on every build, from
// each unit's serial through src/lib/usage.mjs). Everything here is joined by room id or asset tag.
import { incidents, sites, incidentPath, href } from '../../lib/data.mjs';
import { equipment, rng } from '../../lib/usage.mjs';

// Open incidents, by device tag and by room. A whole-room ticket has no device.
export const incByDevice = {};
export const incByRoom = {};
for (const inc of Object.values(incidents)) {
  if (inc.state === 'resolved') continue;
  const it = { number: inc.number, title: inc.short_description, href: href(incidentPath(inc.number)), priority: inc.priority, device: inc.device ?? null };
  (incByRoom[inc.room] ??= []).push(it);
  if (inc.device) (incByDevice[inc.device] ??= []).push(it);
}
export const openIncidents = Object.values(incByRoom).reduce((n, l) => n + l.length, 0);

// Failed calls a week: a call that did not connect or dropped in the first minute. A unit with an open
// incident fails often; a few others do too; most hardly ever.
const failedOf = (e) => {
  const r = rng(`fail:${e.tag}`);
  const p = r();
  const rate = incByDevice[e.tag] ? 0.14 + r() * 0.2 : p < 0.08 ? 0.05 + r() * 0.06 : r() * 0.03;
  return Math.round(e.calls * rate);
};
export const failed = {};
for (const e of equipment) if (e.kind === 'video') failed[e.tag] = failedOf(e);
// A call failure is worth a look once it is two calls a week and one in twenty.
export const failing = (e) => e.kind === 'video' && failed[e.tag] >= 2 && failed[e.tag] / Math.max(1, e.calls) >= 0.05;
// "Little used": the units the usage rules flag as barely worked.
export const littleUsed = (e) => e.flag?.tone === 'under';

// One line per room for the engineering columns and the side panel.
export const byRoom = {};
for (const e of equipment) (byRoom[e.room] ??= []).push(e);
export function roomSignals(id) {
  const list = byRoom[id] ?? [];
  const bad = list.filter(failing).sort((a, b) => failed[b.tag] - failed[a.tag]);
  const little = list.filter(littleUsed);
  return {
    incidents: incByRoom[id] ?? [],
    failedCalls: list.reduce((n, e) => n + (failed[e.tag] ?? 0), 0), failing: bad,
    little,
    devices: list.length,
  };
}

export const isHome = (siteId) => sites[siteId]?.kind === 'remote';
export const WHERE = [{ value: 'office', label: 'Offices' }, { value: 'home', label: 'Home offices' }];
