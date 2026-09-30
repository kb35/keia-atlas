// The schedule: who is away, public holidays by country, site visits, installs and change freezes.
// Everything here is demo data except the public holidays, which are the usual national ones (check
// locally before relying on a date). Built once at build time and handed to the page as JSON.
import { projects, plans, sites, DEMO_TODAY, STEP_LABEL } from './data.mjs';
import { PEOPLE } from './demo.mjs';

export const ALLOWANCE = 25; // paid days off a year (demo)

const H = (country, list) => list.map(([date, name]) => ({ country, date, name }));
export const HOLIDAYS = [
  ...H('IE', [['2026-10-26', 'October Bank Holiday'], ['2026-12-25', 'Christmas Day'], ['2026-12-26', "St Stephen's Day"], ['2027-01-01', "New Year's Day"], ['2027-02-01', "St Brigid's Day"], ['2027-03-17', "St Patrick's Day"]]),
  ...H('GB', [['2026-12-25', 'Christmas Day'], ['2026-12-28', 'Boxing Day (in lieu)'], ['2027-01-01', "New Year's Day"]]),
  ...H('DK', [['2026-12-24', 'Christmas Eve'], ['2026-12-25', 'Christmas Day'], ['2026-12-26', 'Second Christmas Day'], ['2027-01-01', "New Year's Day"]]),
  ...H('US', [['2026-10-12', 'Columbus Day'], ['2026-11-11', 'Veterans Day'], ['2026-11-26', 'Thanksgiving'], ['2026-12-25', 'Christmas Day'], ['2027-01-01', "New Year's Day"], ['2027-01-18', 'Martin Luther King Jr. Day'], ['2027-02-15', "Presidents' Day"]]),
  ...H('CA', [['2026-10-12', 'Thanksgiving'], ['2026-12-25', 'Christmas Day'], ['2026-12-28', 'Boxing Day (in lieu)'], ['2027-01-01', "New Year's Day"]]),
  ...H('SG', [['2026-11-09', 'Deepavali (in lieu)'], ['2026-12-25', 'Christmas Day'], ['2027-01-01', "New Year's Day"]]),
  ...H('AU', [['2026-11-03', 'Melbourne Cup Day'], ['2026-12-25', 'Christmas Day'], ['2026-12-28', 'Boxing Day (in lieu)'], ['2027-01-01', "New Year's Day"], ['2027-01-26', 'Australia Day']]),
  ...H('JP', [['2026-09-21', 'Respect for the Aged Day'], ['2026-09-22', 'Citizens\' Holiday'], ['2026-09-23', 'Autumnal Equinox Day'], ['2026-10-12', 'Sports Day'], ['2026-11-03', 'Culture Day'], ['2026-11-23', 'Labor Thanksgiving Day'], ['2027-01-01', "New Year's Day"], ['2027-01-11', 'Coming of Age Day']]),
];

// Time off already booked (demo). People are the made-up team.
export const PTO_SEED = [
  ['anna', '2026-10-05', '2026-10-09', 'Autumn break'], ['anna', '2026-12-21', '2027-01-01', 'Christmas'],
  ['liam', '2026-10-19', '2026-10-23', ''], ['liam', '2026-12-23', '2026-12-31', ''],
  ['tom', '2026-10-12', '2026-10-16', ''], ['tom', '2026-12-28', '2027-01-01', ''],
  ['carlos', '2026-11-25', '2026-11-27', 'Thanksgiving week'], ['grace', '2026-10-26', '2026-10-30', ''],
  ['marcus', '2026-12-21', '2026-12-31', ''], ['arjun', '2026-10-02', '2026-10-02', ''],
  ['kenji', '2026-11-16', '2026-11-20', ''], ['ruby', '2026-12-14', '2026-12-24', 'Summer holiday'],
  ['mei', '2026-10-13', '2026-10-15', ''], ['olivia', '2026-11-02', '2026-11-06', ''],
  ['priya', '2026-10-27', '2026-10-30', ''], ['ruth', '2026-09-28', '2026-10-02', ''], ['ruth', '2026-12-24', '2027-01-04', ''],
  ['david', '2026-11-27', '2026-11-27', ''], ['hana', '2026-10-19', '2026-10-21', ''], ['marco', '2026-11-09', '2026-11-13', ''],
  ['sofia', '2026-12-18', '2027-01-04', 'Christmas'], ['declan', '2026-10-08', '2026-10-09', ''], ['nora', '2026-11-19', '2026-11-20', ''],
  ['tomas', '2026-10-19', '2026-10-23', 'Half term'], ['claire', '2026-12-22', '2027-01-04', ''],
];

export const SITE_VISITS = [
  { date: '2026-10-06', title: 'Site visit: Tom Ashby to the Copenhagen office', site: 'cph', who: ['tom'] },
  { date: '2026-10-14', end: '2026-10-15', title: 'Site visit: Anna Byrne to the London office', site: 'lon', who: ['anna'] },
  { date: '2026-11-03', title: 'Vendor walk-through, town hall', site: 'dub', who: ['lena', 'anna'] },
  { date: '2026-11-10', end: '2026-11-11', title: 'Site visit: Hana Mori to the Tokyo office', site: 'tyo', who: ['hana'] },
  { date: '2026-11-17', title: 'Site visit: Marcus Lee to the Toronto office', site: 'tor', who: ['marcus'] },
  { date: '2026-12-01', title: 'Comms room audit, Singapore office', site: 'sin', who: ['arjun'] },
  { date: '2027-01-19', title: 'Site visit: Ruth Kelly to the Juneau office', site: 'jnu', who: ['ruth'] },
];

const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Install windows: the planned dates of each device step in the Deploy phase of every live project
// (decision 0025), or the phase itself where it has no steps recorded yet.
const installs = [];
for (const p of Object.values(projects)) {
  if (p.phase === 'closed') continue;
  const h = (p.history ?? []).find((x) => x.phase === 'integrate');
  const steps = h?.steps?.length ? h.steps : h ? [{ step: 'install', ...h }] : [];
  if (steps.length) for (const st of steps) installs.push({ date: st.ended ?? st.planned, title: `${STEP_LABEL[st.step]}: ${p.name}`, site: p.site, project: p.id });
  else installs.push({ date: addDays(p.target, -35), end: addDays(p.target, -28), title: `Deploy (planned): ${p.name}`, site: p.site, project: p.id });
}

export const freezes = (plans.fy2027?.events ?? []).filter((e) => e.kind === 'freeze').map((e) => ({ date: e.date, end: e.end ?? e.date, title: e.title }));

export const schedule = {
  today: DEMO_TODAY,
  allowance: ALLOWANCE,
  people: PEOPLE.map((p) => ({ id: p.id, name: p.name, role: p.role, initials: p.initials, site: p.site ?? null, region: p.region ?? null, base: p.base, office: p.office, office_days: p.office_days, home: p.home, country: p.site ? sites[p.site]?.country : (p.region === 'amer' ? 'US' : p.region === 'apac' ? 'SG' : 'IE') })),
  sites: Object.fromEntries(Object.entries(sites).map(([id, s]) => [id, { code: s.code, name: s.name, country: s.country ?? null, region: s.region ?? null }])),
  holidays: HOLIDAYS,
  pto: PTO_SEED.map(([who, from, to, note], i) => ({ id: `s${i}`, who, from, to, note, status: 'approved' })),
  visits: SITE_VISITS.map((v) => ({ ...v, end: v.end ?? v.date })),
  installs: installs.filter((i) => i.date).map((i) => ({ ...i, end: i.end ?? i.date })),
  freezes,
};
