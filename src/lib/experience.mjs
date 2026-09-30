// Experience measures and service levels for each service (design notes service owner and §4.7 leadership, design notes,
// BUILD-PLAN V7). Four figures per service, counted per space and then per office, never per person:
//   AV              meetings that started on time, spaces that worked first time, lost time per incident, reassignments
//   Network         time every office was online, fixed first time, lost time per incident, reassignments
//   Infrastructure  time on mains power with links up, fixed first time, lost time per incident, reassignments
// Lost time per incident follows the HappySignals method: the time the person who reported it says they lost.
// The service levels are the promises each service makes (response and fix by priority, and availability), measured
// from the incident records with no manual reporting.
//
// Everything here is SIMULATED: a seeded series per office, the same on every build and in every window. A real
// room booking system, device monitoring and the incident records replace it with the same shape.
// Pure: no data is loaded, so the rules can be tested (tests/experience.test.mjs).

/** A small seeded random number generator: the same key gives the same numbers every time. */
export function seeded(key) {
  let h = 2166136261;
  for (const c of String(key)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One measure: its words, its unit, which way is better, the target, and the simulation's centre and spread.
// `office` is how far one office may sit from the centre; `day` is the day-to-day wobble.
const M = (id, label, unit, better, target, centre, office, day, method, min = 0, max = unit === '%' ? 100 : Infinity) => ({ id, label, unit, better, target, centre, office, day, method, min, max });
const LOST = M('lost', 'Lost time per incident', 'min', 'down', 90, 72, 10, 9, 'The time the person who reported it says they lost (the HappySignals method)', 20);
const REASSIGN = M('reassign', 'Reassignments per job', 'x', 'down', 0.5, 0.3, 0.08, 0.07, 'Times a job changed owner before it was fixed', 0);
export const MEASURES = {
  av: [
    M('ontime', 'Meetings that started on time', '%', 'up', 95, 97, 1.2, 1.1, 'Booked meetings whose space was working at the start time'),
    M('first', 'Spaces that worked first time', '%', 'up', 92, 94, 1.5, 1.3, 'Meetings with no problem reported in their first ten minutes'),
    LOST, REASSIGN,
  ],
  network: [
    M('online', 'Time every office was online', '%', 'up', 99.9, 99.95, 0.03, 0.03, 'Office hours with every gateway up and at least one internet circuit up', 99),
    M('first', 'Fixed first time', '%', 'up', 85, 91, 2.5, 2.5, 'Incidents closed without being reopened or visited twice'),
    { ...LOST, centre: 58, target: 90 }, { ...REASSIGN, centre: 0.4 },
  ],
  infrastructure: [
    M('power', 'Time on mains power with links up', '%', 'up', 99.95, 99.98, 0.015, 0.012, 'Hours every comms room ran on mains power with its fibre links up', 99.5),
    M('first', 'Fixed first time', '%', 'up', 85, 93, 2, 2.2, 'Incidents closed without being reopened or visited twice'),
    { ...LOST, centre: 41, target: 90 }, { ...REASSIGN, centre: 0.2 },
  ],
};

/** Writes one value of a measure the way the page says it: "97%", "99.95%", "1 h 12 min", "0.3 per job". */
export function fmtMeasure(m, v) {
  if (v == null || !Number.isFinite(v)) return '–';
  if (m.unit === '%') return `${m.target >= 99 ? v.toFixed(2).replace(/0$/, '') : Math.round(v)}%`;
  if (m.unit === 'min') { const t = Math.round(v), h = Math.floor(t / 60), mm = t % 60; return h ? `${h} h${mm ? ` ${mm} min` : ''}` : `${mm} min`; }
  if (m.unit === 'x') return `${v.toFixed(1)} per job`;
  return String(v);
}
/** Is the value on the right side of its target? */
export const withinTarget = (m, v) => (m.better === 'up' ? v >= m.target : v <= m.target);

/** One office's daily values for one measure, `days` long, oldest first. */
export function officeSeries(svc, site, m, days = 30) {
  const r = seeded(`${svc}:${site}:${m.id}`);
  const lean = (r() * 2 - 1) * m.office;
  return Array.from({ length: days }, () => {
    const v = m.centre + lean + (r() * 2 - 1) * m.day;
    return Math.min(m.max, Math.max(m.min, v));
  });
}

/** The service's four measures over the offices given, each weighted by its number of spaces. `sites` is
    [{ id, weight }]. Returns [{ ...measure, series, value, words, within }]; the value is the mean of the series. */
export function experience(svc, sites, days = 30) {
  const list = MEASURES[svc] ?? [];
  const total = sites.reduce((n, s) => n + (s.weight ?? 1), 0);
  return list.map((m) => {
    const series = Array.from({ length: days }, () => 0);
    if (total > 0) for (const s of sites) officeSeries(svc, s.id, m, days).forEach((v, i) => { series[i] += (v * (s.weight ?? 1)) / total; });
    const value = total > 0 ? series.reduce((a, b) => a + b, 0) / series.length : null;
    return { ...m, series: total > 0 ? series : [], value, words: fmtMeasure(m, value), within: value != null && withinTarget(m, value) };
  });
}

// ---- Service levels: the promises, measured from the incident records -------------------------------------------
// Response: someone has the job. Fix: it works again. Hours are elapsed hours; the fix targets match Home's Past target.
export const SERVICE_LEVELS = {
  av: [
    { id: 'r1', what: 'Response, P1', promise: '15 min', n: 3 }, { id: 'r2', what: 'Response, P2', promise: '1 h', n: 11 },
    { id: 'f1', what: 'Fix, P1', promise: '4 h', n: 3 }, { id: 'f2', what: 'Fix, P2', promise: '8 h', n: 11 }, { id: 'f3', what: 'Fix, P3', promise: '3 days', n: 34 },
    { id: 'av', what: 'Spaces working in office hours', promise: '99%', n: null },
  ],
  network: [
    { id: 'r1', what: 'Response, P1', promise: '15 min', n: 1 }, { id: 'r2', what: 'Response, P2', promise: '1 h', n: 4 },
    { id: 'f1', what: 'Fix, P1', promise: '4 h', n: 1 }, { id: 'f2', what: 'Fix, P2', promise: '8 h', n: 4 }, { id: 'f3', what: 'Fix, P3', promise: '3 days', n: 12 },
    { id: 'av', what: 'Offices online', promise: '99.9%', n: null },
  ],
  infrastructure: [
    { id: 'r1', what: 'Response, P1', promise: '15 min', n: 1 }, { id: 'f1', what: 'Fix, P1', promise: '4 h', n: 1 },
    { id: 'f3', what: 'Fix, P3', promise: '3 days', n: 6 },
    { id: 'av', what: 'Comms rooms on mains power', promise: '99.95%', n: null },
  ],
};
// A promise is kept when at least this share of the month's jobs met it.
export const KEPT_AT = 0.9;

/** This month's result for each promise, with the last 12 weeks as a strip (share met, 0 to 100). */
export function serviceLevels(svc) {
  return (SERVICE_LEVELS[svc] ?? []).map((row) => {
    const r = seeded(`${svc}:sl:${row.id}`);
    const weeks = Array.from({ length: 12 }, () => Math.min(100, 88 + r() * 13));
    if (row.n == null) {
      const target = parseFloat(row.promise);
      const got = Math.min(100, target + r() * (100 - target) * 0.9);
      return { ...row, met: null, got, words: `${got.toFixed(target >= 99.9 ? 2 : 1)}% this month`, kept: got >= target, weeks };
    }
    // A missed job now and then on the busier promises; one miss in a handful would be past target, and the demo's month has none.
    const miss = row.n >= 10 && r() > 0.55 ? 1 : 0;
    const met = Math.max(0, row.n - Math.min(miss, row.n));
    return { ...row, met, got: row.n ? (met / row.n) * 100 : 100, words: `${met} of ${row.n} this month`, kept: !row.n || met / row.n >= KEPT_AT, weeks };
  });
}
