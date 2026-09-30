// Warranty, support cover and purchase, in words (schemas/ext/install.schema.yaml: a unit's purchase, warranty and
// support). Pure: no data is read here, so the unit page, Planning and the tests share one set of words.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);
export const monthYear = (s) => `${MON[d(s).getUTCMonth()]} ${d(s).getUTCFullYear()}`;
export const dayMonthYear = (s) => `${d(s).getUTCDate()} ${MON[d(s).getUTCMonth()]} ${d(s).getUTCFullYear()}`;
const daysBetween = (a, b) => Math.round((d(b) - d(a)) / 864e5);

/** Whole months from `a` to `b` (b later), counting a part month as a month once 15 days in. */
export function monthsUntil(a, b) {
  const x = d(a), y = d(b);
  let m = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
  if (y.getUTCDate() - x.getUTCDate() >= 15) m += 1;
  else if (y.getUTCDate() - x.getUTCDate() < -15) m -= 1;
  return m;
}

// How far off, in the words a person says: "12 days", "3 weeks", "4 months".
function howLong(today, ends) {
  const days = daysBetween(today, ends);
  if (days < 14) return { n: days, unit: days === 1 ? 'day' : 'days' };
  if (days < 56) { const w = Math.round(days / 7); return { n: w, unit: 'weeks' }; }
  const m = Math.max(2, monthsUntil(today, ends));
  return { n: m, unit: 'months' };
}

/**
 * The warranty in one answer: { state, tone, n, unit, lead, text, short }.
 *   ended   "Out of warranty since Feb 2025"
 *   soon    "Warranty ends in 4 months" (within 12 months; n and unit carry the figure, so a page can tick it)
 *   active  "Under warranty until Feb 2028"
 */
export function warrantyWords(ends, today) {
  if (!ends) return null;
  if (ends < today) return { state: 'ended', tone: 'quiet', text: `Out of warranty since ${monthYear(ends)}`, lead: 'Out of warranty since', value: monthYear(ends), short: 'Ended' };
  const within = monthsUntil(today, ends) <= 12;
  if (!within) return { state: 'active', tone: 'good', text: `Under warranty until ${monthYear(ends)}`, lead: 'Under warranty until', value: monthYear(ends), short: monthYear(ends) };
  const h = howLong(today, ends);
  return { state: 'soon', tone: 'warn', n: h.n, unit: h.unit, text: `Warranty ends in ${h.n} ${h.unit}`, lead: 'Warranty ends in', value: `${h.n} ${h.unit}`, short: monthYear(ends) };
}

/** A vendor's cover, for a unit: { id, name, ref, ends, text }. `vendor` is its data/vendors record. */
export function supportWords(vendor, today) {
  if (!vendor) return null;
  const c = vendor.contract ?? {};
  const live = !c.end || c.end >= today;
  return {
    id: vendor.id, name: vendor.name, ref: c.ref ?? null, ends: c.end ?? null, live,
    text: `${vendor.name}${c.ref ? `, contract ${c.ref}` : ''}${c.end ? `, ${live ? 'until' : 'ended'} ${dayMonthYear(c.end)}` : ''}`,
  };
}

/** Money in the purchase's currency, the way people write it: "€3,600". */
export function money(n, currency = 'EUR') {
  const sym = { EUR: '€', USD: '$', GBP: '£' }[currency];
  const v = Math.round(n).toLocaleString('en-IE');
  return sym ? `${sym}${v}` : `${v} ${currency}`;
}

/**
 * Warranties ending in the next `months` months across the fleet. `units` are { tag, site, office, model, modelName,
 * ends, support, supportName }. Returns the answer, the months (a count each, for the strip) and one row per office
 * and model, soonest first, saying whether a support contract picks the units up after the warranty.
 */
export function endingSoon(units, today, months = 12) {
  const soon = units.filter((u) => u.ends && u.ends >= today && monthsUntil(today, u.ends) <= months);
  const rows = new Map();
  for (const u of soon) {
    const k = `${u.site}|${u.model ?? u.cls}`;
    const r = rows.get(k) ?? { site: u.site, office: u.office, model: u.model, name: u.modelName, n: 0, first: u.ends, last: u.ends, covered: 0, support: new Set(), tags: [] };
    r.n += 1; r.tags.push(u.tag);
    if (u.ends < r.first) r.first = u.ends;
    if (u.ends > r.last) r.last = u.ends;
    if (u.support) { r.covered += 1; r.support.add(u.supportName); }
    rows.set(k, r);
  }
  const list = [...rows.values()].map((r) => ({ ...r, support: [...r.support] })).sort((a, b) => a.first.localeCompare(b.first) || b.n - a.n);
  // One bar per month from this one: how many warranties end in it.
  const start = d(today);
  const bars = Array.from({ length: months }, (_, i) => {
    const m = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const key = m.toISOString().slice(0, 7);
    return { key, label: `${MON[m.getUTCMonth()]} ${String(m.getUTCFullYear()).slice(2)}`, n: soon.filter((u) => u.ends.slice(0, 7) === key).length };
  });
  const bare = soon.filter((u) => !u.support).length;
  const answer = soon.length
    ? `${soon.length.toLocaleString('en-IE')} warrant${soon.length === 1 ? 'y ends' : 'ies end'} in the next ${months} months${bare ? ` · ${bare.toLocaleString('en-IE')} with no support contract after` : ' · every one has a support contract after'}`
    : `No warranty ends in the next ${months} months`;
  return { count: soon.length, bare, answer, rows: list, bars };
}
