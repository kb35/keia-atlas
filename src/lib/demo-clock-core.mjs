// The rolling demo clock, the pure part (no file access, so tests and the validator use it too).
//
// The demo's data is written as of one day, the anchor (house values: demo_anchor). With demo_clock: rolling, a
// build moves every date inside the demo world forward by the whole weeks between the anchor and the build date,
// so the story reads the same whenever the site is built: the fault in 3.09 is still "today 07:52", PRJ-14 is on
// the same step, a warranty still ends in 10 months. Weekdays are kept because the offset is whole weeks.
//
// Real-world facts never move: firmware release dates, a manufacturer's end of support, standards and when they
// take effect, when a source was checked, known issues a manufacturer published. So the shift is an allow-list:
// DATE_FIELDS says, per data folder and field path, which dates shift and which stay fixed, and the validator
// fails any date-like field that is on neither list (dateFieldProblems), so a new folder can never go stale or
// shift a real fact without someone deciding which.
import { fyOf } from './planningcore.mjs';

const DAY = 864e5;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
// A date, a date and time (with or without seconds and a zone) or a month: "2026-09-28", "2026-09-28T07:52",
// "2026-09-30T06:00:00Z", "2026-09".
export const DATE_LIKE = /^\d{4}-\d{2}(-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?$/;
export const isDateLike = (v) => typeof v === 'string' && DATE_LIKE.test(v);

export const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const monthIndex = (d) => +d.slice(0, 4) * 12 + (+d.slice(5, 7) - 1);
const fromMonthIndex = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;

// ---- Which dates move --------------------------------------------------------------------------------------------
// Per folder under data/ (a folder, or a folder and sub-folder: "providers/sales"), the field paths holding dates:
//   shift  a date in the demo world: moves by whole weeks (a month-only value by whole months)
//   fy     a financial-year label or bound: moves by whole financial years, and only when the demo's today has
//          crossed into another financial year ("fy2027" -> "fy2028"; "FY2028" and four-digit years in the text)
//   year   a calendar year number: moves by whole calendar years when today's year has changed
//   fixed  a real-world fact, or the record of when this repository's own public files were written: never moves
// A path is the keys from the top of the file, dotted, with [] for any item of a list and * for any key of a map:
// "positions[].units[].warranty.ends", "rooms.*.hearing_loop.tested"; ** is any path below ("raw.**", or "**" for
// every field in the folder). To register a new folder, add it here
// (docs/rules/data.md F12); until then the validator names each of its date-like fields.
export const DATE_FIELDS = {
  // ---- The demo world: made-up records, written as of the anchor ----
  accessibility: { shift: ['every_room.checked', 'rooms.*.hearing_loop.tested'] },
  advisories: { shift: ['date'] },                       // Aigna's own advisory, written when Aigna raised it
  cables: { shift: ['cables[].last_counted'] },
  circuits: { shift: ['circuits[].contract.start', 'circuits[].contract.renews'] },
  'config-backups': { shift: ['read_at', 'devices[].last_backup'] },
  configurations: { shift: ['updated'] },
  credentials: { shift: ['issued', 'rotated', 'expires'] },
  'fault-history': { shift: ['faults[].opened', 'faults[].resolved'] },
  incidents: { shift: ['opened', 'history[].at', 'priority_override.at', 'booking.at', 'major.at', 'keia_atlas.held_at'] },
  installs: {
    shift: [
      'positions[].units[].installed', 'positions[].units[].purchase.date', 'positions[].units[].warranty.ends',
      'older_kit[].installed', 'older_kit[].retired',
      'spare_units[].arrived', 'spare_units[].purchase.date', 'spare_units[].warranty.ends',
    ],
  },
  'known-issues': { shift: ['checked'], fixed: ['issues[].published'] },   // when Aigna last looked; the maker's dates stay
  lab: { shift: ['start', 'end'] },
  licences: { shift: ['renews'] },
  'maker-cases': { shift: ['raised', 'history[].at'] },
  'meeting-quality': { shift: ['read_at'] },
  'model-choices': { shift: ['since', 'review'] },
  'on-call': { shift: ['weeks[].from'] },
  // An integrator's own records (Northlight AV, data/providers/): all story, so every date moves with the demo.
  providers: { shift: ['counted', 'jobs[].days[]', 'orders[].expected', 'orders[].raised', 'orders[].received', 'packs[].accepted.at', 'packs[].handed_over', 'packs[].sent', 'packs[].training[].on', 'people[].certs[].expires', 'reviews[].generated', 'reviews[].reviewed', 'rota[].from', 'rota[].to', 'surveys[].surveyed', 'visits[].days[]'] },
  'out-of-service': { shift: ['since', 'until'] },
  // The year plan's bounds and its calendar events (quarterly reviews, the year-end freeze, the budget deadline) are
  // tied to the financial year, so they move with it; the proposed work in the pipeline is story, so it moves by weeks.
  plan: { shift: ['pipeline[].start', 'pipeline[].end'], fy: ['id', 'name', 'from', 'to', 'events[].date', 'events[].end'] },
  planning: { fy: ['envelopes[].year', 'envelopes[].note', 'changes[].year', 'changes[].why', 'scenarios[].name', 'scenarios[].say', 'scenarios[].changes[].year'] },
  playbooks: { shift: ['changes[].date'] },
  privacy: { shift: ['dpia.date', 'dpia.reviewed', 'works_council.date'] },
  projects: {
    shift: [
      'start', 'target', 'history[].planned', 'history[].ended', 'history[].steps[].planned', 'history[].steps[].ended',
      'log[].raised', 'log[].decided', 'log[].due', 'changes[].raised', 'changes[].decided', 'tasks[].due', 'tasks[].start',
    ],
  },
  racks: { shift: ['items[].replaced.date'] },
  'refresh-policy': { year: ['horizon.from', 'horizon.to'], fixed: ['horizon.history_from'] },
  runs: { shift: ['runs[].test.date'] },
  spaces: { shift: ['power.ups.measured'] },
  spares: { shift: ['last_counted', 'consumables[].last_counted', 'retired[].archived.date'] },
  'standing-rules': { shift: ['approved.at', 'runs[].at'] },
  'switch-ports': { shift: ['read_at', 'source.synced_at', 'switches[].interfaces[].seen.at'] },
  vendors: { shift: ['contract.start', 'contract.end'] },
  // ---- Real-world facts and the repository's own public record: never move ----
  // Records a connector wrote (npm run connect) carry the real time they were read and the source's own record.
  connected: { fixed: ['**'] },
  'device-classes': { fixed: ['profile.last_updated'] },
  'device-models': { fixed: ['lifecycle.end_of_support', 'lifecycle.announced', 'security_support.ends.date'] },
  firmware: { fixed: ['releases[].released'] },
  'house-values': { fixed: ['demo_anchor'] },                // the clock's own anchor
  'security-flaws': { fixed: ['published'] },
  sources: { fixed: ['entries[].last_verified'] },
  'space-types': { fixed: ['profile.last_updated', 'keia_atlas.options[].since'] },
  standards: { fixed: ['effective', 'tia606.checked', 'references[].checked'] },
};
export const KINDS = ['shift', 'fy', 'year', 'fixed'];

// A path pattern as a test: "rooms.*.hearing_loop.tested" matches "rooms.dub-3-09.hearing_loop.tested".
const patternRe = (p) => new RegExp('^' + p.replace(/[.+?^${}()|\\]/g, '\\$&').replace(/\[\]/g, '\\[\\]').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^.\\[\\]]+').replace(/\u0000/g, '.+') + '$');
const compiled = new Map();
/** The rules for a file, by its path under data/ ("installs/dub/dub-3-09.yaml"): [{ kind, re, path }]. */
export function rulesFor(rel, fields = DATE_FIELDS) {
  const parts = String(rel).split(/[\\/]/);
  const key = `${fields === DATE_FIELDS ? '' : 'x:'}${parts.slice(0, -1).join('/')}`;
  if (fields === DATE_FIELDS && compiled.has(key)) return compiled.get(key);
  const out = [];
  for (let i = 1; i < parts.length; i++) {
    const entry = fields[parts.slice(0, i).join('/')];
    if (!entry) continue;
    for (const kind of KINDS) for (const p of entry[kind] ?? []) out.push({ kind, path: p, re: patternRe(p) });
  }
  if (fields === DATE_FIELDS) compiled.set(key, out);
  return out;
}
export const isRegistered = (rel, fields = DATE_FIELDS) => { const parts = String(rel).split(/[\\/]/); for (let i = 1; i < parts.length; i++) if (fields[parts.slice(0, i).join('/')]) return true; return false; };

// Every value in a record: fn(pattern path, value, set(newValue), concrete path as keys and indices).
function visit(node, pathStr, fn, at = []) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => (v && typeof v === 'object' && !(v instanceof Date) ? visit(v, `${pathStr}[]`, fn, [...at, i]) : fn(`${pathStr}[]`, v, (x) => { node[i] = x; }, [...at, i])));
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      const p = pathStr ? `${pathStr}.${k}` : k;
      if (v && typeof v === 'object' && !(v instanceof Date)) visit(v, p, fn, [...at, k]);
      else fn(p, v, (x) => { node[k] = x; }, [...at, k]);
    }
  }
}

/** The validator's check: each date-like field is on the shift list or marked fixed. [{ path, value, message }]. */
export function dateFieldProblems(rel, record, fields = DATE_FIELDS) {
  const rules = rulesFor(rel, fields);
  const folder = String(rel).split(/[\\/]/)[0];
  const seen = new Set();
  const out = [];
  visit(record, '', (p, v, _set, at) => {
    const s = v instanceof Date ? v.toISOString() : v;
    if (!isDateLike(s) || seen.has(p)) return;
    if (rules.some((r) => r.re.test(p))) return;
    seen.add(p);
    out.push({ path: p, at, value: s, message: `date field "${p}" is not on the demo clock's list: add it to DATE_FIELDS in src/lib/demo-clock-core.mjs under "${folder}", as shift (a demo date) or fixed (a real-world fact), see docs/rules/data.md F12` });
  });
  return out;
}

// ---- The clock ---------------------------------------------------------------------------------------------------
/**
 * A clock for one build. anchor: the day the data is written as of; build: the build date; rolling: the demo
 * setting (off means no date moves). Returns { anchor, build, rolling, today, offsetDays, monthShift, yearShift,
 * fyShift, shift(v), shiftYear(n), shiftFy(v) }.
 */
export function makeClock({ anchor, build = anchor, rolling = false }) {
  if (!ISO_DAY.test(anchor ?? '')) throw new Error(`the demo anchor must be a date like 2026-09-28, not "${anchor}"`);
  if (!ISO_DAY.test(build ?? '')) throw new Error(`the build date must be a date like 2027-01-04, not "${build}"`);
  const offsetDays = rolling ? Math.floor(daysBetween(anchor, build) / 7) * 7 : 0;
  const today = addDays(anchor, offsetDays);
  const monthShift = monthIndex(today) - monthIndex(anchor);
  const yearShift = +today.slice(0, 4) - +anchor.slice(0, 4);
  const fyShift = fyOf(today) - fyOf(anchor);
  const shift = (v) => {
    if (!offsetDays || v == null) return v;
    if (v instanceof Date) return new Date(v.getTime() + offsetDays * DAY);
    if (!isDateLike(v)) return v;
    if (v.length === 7) return fromMonthIndex(monthIndex(v) + monthShift);
    return addDays(v.slice(0, 10), offsetDays) + v.slice(10);
  };
  const shiftYear = (n) => (yearShift && typeof n === 'number' ? n + yearShift : n);
  const shiftFy = (v) => {
    if (!fyShift || v == null) return v;
    if (typeof v === 'number') return v + fyShift;
    if (typeof v !== 'string') return v;
    if (isDateLike(v)) return String(+v.slice(0, 4) + fyShift) + v.slice(4);
    return v.replace(/(^|[^\d-])(fy|FY)?(20\d{2})(?![\d-])/g, (_, pre, p = '', y) => `${pre}${p}${+y + fyShift}`);
  };
  return { anchor, build, rolling, today, offsetDays, monthShift, yearShift, fyShift, shift, shiftYear, shiftFy };
}

/** A record as the demo's today sees it: its registered dates moved (in place; returns the record). */
export function shiftRecord(rel, record, clock, fields = DATE_FIELDS) {
  if (!clock.offsetDays || !record || typeof record !== 'object') return record;
  const rules = rulesFor(rel, fields).filter((r) => r.kind !== 'fixed');
  if (!rules.length) return record;
  visit(record, '', (p, v, set) => {
    const r = rules.find((x) => x.re.test(p));
    if (!r) return;
    set(r.kind === 'shift' ? clock.shift(v) : r.kind === 'year' ? clock.shiftYear(v) : clock.shiftFy(v));
  });
  return record;
}
