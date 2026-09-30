// Repeat faults from the data: the fault history (data/fault-history/) and the incidents (data/incidents/), as one list
// of faults. src/lib/repeats.mjs counts them.
import { incidents, faultHistory, spaces, sites, DEMO_TODAY, incidentPath } from './data.mjs';
import { repeatsOf, mostRepeats } from './repeats.mjs';

export const FAULTS = [
  ...Object.values(faultHistory).flatMap((f) => f.faults.map((x) => ({ number: x.number, opened: x.opened, space: x.space, unit: x.unit ?? null, symptom: x.symptom ?? null, open: false, fix: x.fix ?? null }))),
  ...Object.values(incidents).map((i) => ({ number: i.number, opened: i.opened, space: i.room, unit: i.device ?? null, symptom: i.keia_atlas?.symptom ?? null, open: i.state !== 'resolved', href: incidentPath(i.number), title: i.short_description })),
];

/** A symptom in words ("meeting_will_not_start" to "Meeting will not start"). The guides name them by id only. */
export const symptomWords = (sym) => (sym ? sym.replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()) : null);

export const spaceRepeats = (spaceId) => repeatsOf(FAULTS.filter((f) => f.space === spaceId), DEMO_TODAY);
export const unitRepeats = (tag) => repeatsOf(FAULTS.filter((f) => f.unit === tag), DEMO_TODAY);

/** Support's short list: the spaces with the most faults this quarter, with where they are and the latest symptom. */
export function topRepeats(limit = 5) {
  return mostRepeats(FAULTS, DEMO_TODAY, limit).map((r) => {
    const s = spaces[r.space];
    return { ...r, name: s ? `${s.number ? `${s.number} ` : ''}${s.name}` : r.space, office: sites[s?.site]?.name ?? '', site: s?.site, symptom: symptomWords(r.latest.symptom) };
  });
}
