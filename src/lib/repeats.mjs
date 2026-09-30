// Repeat faults: how often a space or a unit has failed, this quarter and month by month over the last year. Pure: a
// fault is { number, opened, space, unit?, symptom? } from the fault history and the incidents (src/lib/repeats-view.mjs
// gathers them), so the space page, the unit page, Support and the tests share one count.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "1st", "2nd", "3rd", "4th", "11th", "22nd". */
export function ordinal(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

/** The first day of the quarter `day` falls in ("2026-07-01"). */
export function quarterStart(day) {
  const y = +day.slice(0, 4), m = +day.slice(5, 7);
  return `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
}

/** Twelve months ending with today's, oldest first: [{ key: "2025-10", label: "Oct" }]. */
export function lastMonths(today, n = 12) {
  const y = +today.slice(0, 4), m = +today.slice(5, 7) - 1;
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - (n - 1 - i), 1)); return { key: d.toISOString().slice(0, 7), label: MON[d.getUTCMonth()] }; });
}

/**
 * The faults of one space or unit, as the page says them: { quarter, year, text, repeat, bars, latest }.
 *   quarter  faults since the quarter began
 *   year     faults in the last 12 months
 *   text     "3rd fault this quarter"; "1 fault this quarter"; "No faults this quarter" (then the year says the rest)
 *   repeat   true from the second fault in the quarter: the space or unit keeps failing
 *   bars     one per month, oldest first, for the trend strip
 * Returns null when there is nothing in the last 12 months: the page then shows nothing.
 */
export function repeatsOf(faults, today) {
  const months = lastMonths(today);
  const from = `${months[0].key}-01`, q = quarterStart(today);
  const year = faults.filter((f) => f.opened.slice(0, 10) >= from && f.opened.slice(0, 10) <= today).sort((a, b) => a.opened.localeCompare(b.opened));
  if (!year.length) return null;
  const quarter = year.filter((f) => f.opened.slice(0, 10) >= q);
  const n = quarter.length;
  const text = n >= 2 ? `${ordinal(n)} fault this quarter` : n === 1 ? '1 fault this quarter' : 'No faults this quarter';
  const bars = months.map((mo) => ({ label: mo.label, key: mo.key, n: year.filter((f) => f.opened.startsWith(mo.key)).length }));
  return { quarter: n, year: year.length, text, repeat: n >= 2, bars, latest: year[year.length - 1], ordinal: n >= 2 ? ordinal(n) : null };
}

/** The spaces with the most faults this quarter (two or more), most first, then the latest first. */
export function mostRepeats(faults, today, limit = 5) {
  const bySpace = new Map();
  for (const f of faults) { if (!bySpace.has(f.space)) bySpace.set(f.space, []); bySpace.get(f.space).push(f); }
  return [...bySpace.entries()]
    .map(([space, list]) => ({ space, ...repeatsOf(list, today) }))
    .filter((r) => r.repeat)
    .sort((a, b) => b.quarter - a.quarter || b.latest.opened.localeCompare(a.latest.opened))
    .slice(0, limit);
}
