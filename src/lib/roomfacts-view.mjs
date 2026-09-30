// The space page's accessibility, cable tests and certified platforms, from the data (src/lib/roomfacts.mjs has the
// words). Each returns null when the space holds none, so the page shows nothing rather than an empty block.
import { accessibility, runsBySite, modelChoices, KIND, DEMO_TODAY, modelName, className } from './data.mjs';
import { accessOf, GUIDE_KINDS } from './guide.mjs';
import { accessForStaff, cableTestsOf, platformsOf } from './roomfacts.mjs';

/** Room accessibility, for spaces with a room guide at a site with an accessibility record. */
export const roomAccess = (space) => (GUIDE_KINDS.includes(KIND(space)) && accessibility[space.site] ? accessForStaff(accessOf(accessibility[space.site], space.id), DEMO_TODAY) : null);

/** The cable runs whose far end is this space, with their certification results. */
export const roomCableTests = (space) => cableTestsOf((runsBySite[space.site]?.runs ?? []).filter((r) => r.to?.space === space.id));

/** The meeting platforms each model in the space is certified for (from data/model-choices). */
export function roomPlatforms(space) {
  const seen = new Set(), models = [];
  for (const p of space.positions) {
    if (!p.model || seen.has(p.model) || !modelChoices[p.model]?.platforms?.length) continue;
    seen.add(p.model);
    models.push({ id: p.model, name: modelName(p.model), role: p.role ?? className(p.cls), platforms: modelChoices[p.model].platforms });
  }
  return platformsOf(models);
}
