// The fleet's warranties, from the unit records (src/lib/cover.mjs has the words). For Planning's "Warranties ending
// in the next 12 months": every unit still in use or on a shelf, not one on its way out.
import { spaces, vendors, modelName, className, DEMO_TODAY } from './data.mjs';
import { officeName } from './planning.mjs';
import { endingSoon } from './cover.mjs';

export function fleetUnits() {
  const out = [];
  for (const s of Object.values(spaces)) {
    for (const p of [...s.positions, ...s.spareKit]) {
      for (const u of p.units) {
        if (!u.warranty || u.legacy || u.stage === 'retire') continue;
        const model = u.model ?? p.model ?? null;
        out.push({ tag: u.asset_tag, site: s.site, office: officeName(s.site), model, cls: p.cls, modelName: model ? modelName(model) : className(p.cls), ends: u.warranty.ends, demo: Boolean(u.warranty.demo), support: u.support ?? null, supportName: u.support ? vendors[u.support]?.name ?? u.support : null });
      }
    }
  }
  return out;
}

/** Warranties ending in the next `months` months, across the fleet. */
export const fleetEnding = (months = 12) => endingSoon(fleetUnits(), DEMO_TODAY, months);
