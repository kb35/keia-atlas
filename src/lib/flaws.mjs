// Security flaws per firmware line (the Security flaws capability, src/lib/modules.mjs): each flaw in
// data/security-flaws/ matched to the fleet. On a firmware line Atlas tracks (data/firmware/, versions per unit in
// src/lib/knownissues-view.mjs), a unit on a version older than the fix is exposed and one on the fix or later is not;
// where Atlas does not track the model's versions, every unit may be exposed, unless no fix exists, when all are.
// Pure: the fleet and the lines come from the caller.

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
export const SEVERITY_WORD = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
export const SEVERITY_TONE = { critical: 'bad', high: 'bad', medium: 'warn', low: null };
export const FIX_WORD = { standard: 'Fixed in the standard', lab: 'Fix in the Lab', available: 'Fix available', blocked: 'Fix in a release we do not install', none: 'No fix yet', untracked: 'Fix available' };

/** Where the fix stands for Aigna: in the standard, in the Lab, available, blocked, or no fix. */
export function fixState(flaw, line) {
  if (!flaw.fixed_in) return 'none';
  const r = line?.releases.find((x) => x.version === flaw.fixed_in);
  if (!r) return 'untracked';
  return r.status === 'standard' ? 'standard' : r.status === 'lab' ? 'lab' : r.status === 'blocked' ? 'blocked' : r.status === 'superseded' ? 'standard' : 'available';
}

/** Which units a flaw touches: exposed (on an affected version, or no fix exists), unknown (versions not tracked), fixed. */
export function exposure(flaw, fleet, lines = {}) {
  const line = flaw.firmware_line ? lines[flaw.firmware_line] : null;
  const order = line ? line.releases.map((x) => x.version) : [];
  const fixAt = flaw.fixed_in ? order.indexOf(flaw.fixed_in) : -1;
  const out = { exposed: [], unknown: [], fixed: [] };
  for (const u of fleet) {
    if (!flaw.models.includes(u.model)) continue;
    if (!flaw.fixed_in) { out.exposed.push(u); continue; }
    const at = line && u.firmware ? order.indexOf(u.firmware) : -1;
    if (at < 0 || fixAt < 0) out.unknown.push(u);
    else if (at > fixAt) out.exposed.push(u);   // releases are newest first: a higher index is older
    else out.fixed.push(u);
  }
  return out;
}

/** One row per flaw, worst first: severity, then how many units are exposed. */
export function flawRows(flaws, fleet, lines = {}) {
  return flaws.map((f) => {
    const x = exposure(f, fleet, lines);
    return { ...f, fix: fixState(f, f.firmware_line ? lines[f.firmware_line] : null), exposed: x.exposed, unknown: x.unknown, fixed: x.fixed, lineName: f.firmware_line ? lines[f.firmware_line]?.name ?? f.firmware_line : null };
  }).sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.exposed.length - a.exposed.length || a.id.localeCompare(b.id));
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export function flawSummary(rows) {
  const exposing = rows.filter((r) => r.exposed.length);
  const units = new Set(exposing.flatMap((r) => r.exposed.map((u) => u.tag)));
  const maybe = rows.filter((r) => !r.exposed.length && r.unknown.length);
  return { flaws: rows.length, exposing: exposing.length, units: units.size, maybe: maybe.length, maybeUnits: new Set(maybe.flatMap((r) => r.unknown.map((u) => u.tag))).size,
    critical: rows.filter((r) => r.severity === 'critical' && (r.exposed.length || r.unknown.length)).length };
}
/** The answer first: flaws that expose units, then the ones that may. */
export function flawAnswer(s) {
  const parts = [];
  if (s.exposing) parts.push(`${plural(s.exposing, 'flaw')} ${s.exposing === 1 ? 'exposes' : 'expose'} ${plural(s.units, 'unit')}`);
  if (s.maybe) parts.push(`${s.maybe} more may affect ${plural(s.maybeUnits, 'unit')}${s.critical ? `, ${s.critical} critical` : ''}`);
  return parts.length ? parts.join(' · ') : 'No unit is exposed to a known flaw';
}
/** For one unit: the flaws it is exposed to, or may be. */
export function flawsForUnit(rows, tag) {
  return rows.flatMap((r) => (r.exposed.some((u) => u.tag === tag) ? [{ row: r, state: 'exposed' }] : r.unknown.some((u) => u.tag === tag) ? [{ row: r, state: 'unknown' }] : []));
}
