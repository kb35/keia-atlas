// Leadership: "are we OK, and what does it cost?" (design notes, BUILD-PLAN V7 H3, ROADMAP "Leadership").
//
// Claire's Home answers it on one page: the band (four experience and cost figures, each with a 30-day sparkline and
// its source and time), the estate as small multiples, What it costs (four figures with a 12-month strip each), To
// review, the pilot measures from the roadmap, and a cost-and-value model whose inputs are shown and can be changed.
//
// Rules this file keeps:
//   - Every figure names its source and the time it was read. Money comes from the finance connector (SIMULATED).
//   - The model's inputs say what they are: Sourced (a published figure, with its link and strength from
//     the value research), or Assumption (Aigna's own number, to be replaced with real figures). The model's
//     results are estimates, never findings.
//   - Nothing names or ranks a person. An owner is a separate field, never written into a line with a number
//     (tests/no-rankings.test.mjs checks it).
// Pure: no data is loaded. The page passes the vendor contracts, the experience figures and the firmware count.

import { seeded } from './experience.mjs';

export const FINANCE = { from: 'Finance connector', at: '08:00', sim: true };
export const eur = (n) => `€${Math.round(n).toLocaleString('en-IE')}`;
export const eurK = (n) => (Math.abs(n) >= 1e6 ? `€${(n / 1e6).toFixed(1)}m` : Math.abs(n) >= 1e4 ? `€${Math.round(n / 1e3)}k` : eur(n));

/** Twelve months (oldest first) around a centre, seeded, so the strip is the same on every build. */
export function monthStrip(key, centre, spread, { months = 12, trend = 0, min = 0 } = {}) {
  const r = seeded(`cost:${key}`);
  return Array.from({ length: months }, (_, i) => Math.max(min, centre + trend * (i - months + 1) + (r() * 2 - 1) * spread));
}

// ---- The published figures the model may use (VALUE-SCAN; strength A, B or C; [V] vendor-sponsored) ----------------
export const SOURCES = {
  logitech: { cite: 'Logitech study run by Harris Poll, 1,700 decision-makers in 11 countries, Sept 2026', url: 'https://www.nasdaq.com/press-release/new-logitech-study-exposes-million-dollar-design-flaw-silently-drains-organizational', strength: 'B, vendor-sponsored' },
  happysignals: { cite: 'HappySignals Global IT Experience Benchmark 2026, about 2 million responses', url: 'https://www.happysignals.com/news-and-press-releases/happysignals-global-benchmark-2026-employees-lose-more-than-three-hours-of-productivity-per-it-incident', strength: 'B, vendor-sponsored' },
  happysignals25: { cite: 'HappySignals Global IT Experience Benchmark 2025, 2.28 million responses', url: 'https://www.happysignals.com/global-it-experience-benchmark-2025', strength: 'B, vendor-sponsored' },
  metricnet: { cite: 'MetricNet, Metrics Unleashed: Shift-Left, 2020 (North America, fully loaded)', url: 'https://www.metricnet.com/metrics-unleashed-shift-left/', strength: 'B, figures from 2020' },
  avm360: { cite: 'AVM-360 case study, one integrator managing 100+ rooms', url: 'https://avm-360.com/remote-av-monitoring/', strength: 'C, vendor, a single case' },
  lbnl: { cite: 'Lawrence Berkeley National Laboratory field surveys (office equipment in use under 25% of the week)', url: 'https://www.osti.gov/servlets/purl/791184-OzeVRe/native/', strength: 'A, from about 2000' },
};

// ---- The model's inputs --------------------------------------------------------------------------------------------------
// kind: sourced (a published figure, as published or converted), assumption (Aigna's own), demo (from the demo's records).
export const INPUTS = [
  { id: 'hourCost', label: 'Cost of an hour of someone\'s time', unit: '€', value: 50, step: 5, kind: 'assumption', note: 'A loaded hourly cost. Replace it with your own; VALUE-SCAN uses €50 to price HappySignals\' lost time.' },
  { id: 'disruptMin', label: 'Minutes each person loses when meeting technology fails', unit: 'min', value: 12.2, step: 0.1, kind: 'sourced', source: 'logitech', note: 'The median per person per disruption.' },
  { id: 'disruptWeek', label: 'Meetings disrupted by technology each week', unit: 'a week', value: 50, step: 1, kind: 'assumption', note: 'The worked example in VALUE-SCAN. Count yours from the incident records and room booking.' },
  { id: 'people', label: 'People in a disrupted meeting', unit: 'people', value: 6, step: 1, kind: 'assumption', note: 'The worked example in VALUE-SCAN.' },
  { id: 'fewerDisrupt', label: 'Disruptions avoided by checking spaces before meetings', unit: '%', value: 25, step: 5, kind: 'assumption', note: 'No published figure was found. Measure it: meeting-start delay is a pilot measure.' },
  { id: 'incidentHours', label: 'Hours lost per IT incident', unit: 'h', value: 3.3, step: 0.1, kind: 'sourced', source: 'happysignals', note: '3 h 18 min in 2026. Reported by the person, not measured.' },
  { id: 'incidentsMonth', label: 'Incidents a month on AV, network and infrastructure', unit: 'a month', value: 64, step: 1, kind: 'demo', note: 'From the demo\'s incident records (simulated). Use your own count.' },
  { id: 'fewerLost', label: 'Lost time avoided by fewer reassignments', unit: '%', value: 20, step: 5, kind: 'assumption', note: 'HappySignals 2025: lost time rises from 2 h with no reassignment to 9 h 28 min with several. The share avoided is ours.', source: 'happysignals25' },
  { id: 'visitsMonth', label: 'Site visits a month', unit: 'a month', value: 20, step: 1, kind: 'demo', note: 'From the demo\'s records (simulated).' },
  { id: 'visitCost', label: 'Cost of a site visit', unit: '€', value: 200, step: 10, kind: 'sourced', source: 'metricnet', note: 'About $220 per field-support ticket, converted and rounded to €200 (the conversion is ours).' },
  { id: 'remoteCost', label: 'Cost of a fix at the service desk', unit: '€', value: 20, step: 1, kind: 'sourced', source: 'metricnet', note: 'About $22 per service-desk ticket, converted and rounded (the conversion is ours).' },
  { id: 'remoteShare', label: 'Site visits that become remote fixes', unit: '%', value: 40, step: 5, kind: 'sourced', source: 'avm360', note: 'Nearly 40% fewer unnecessary site visits in one case. A single vendor case: treat it as an upper bound.' },
  { id: 'runCost', label: 'Running Keia Atlas for a year', unit: '€', value: 30000, step: 1000, kind: 'assumption', note: 'Hosting and about a fifth of one person\'s time. There is no licence per seat.' },
];
export const DEFAULTS = Object.fromEntries(INPUTS.map((i) => [i.id, i.value]));

/** The cost-and-value model, per year, from the inputs (any missing input takes its default). Each line says how it is
    worked out, in words. These are estimates, not findings (VALUE-SCAN §1 and §7). */
export function valueModel(input = {}) {
  const a = { ...DEFAULTS, ...input };
  const meetingHours = (a.disruptWeek * 52 * a.people * a.disruptMin) / 60;
  const meetingCost = meetingHours * a.hourCost;
  const meetingValue = meetingCost * (a.fewerDisrupt / 100);
  const incidentCost = a.incidentsMonth * 12 * a.incidentHours * a.hourCost;
  const incidentValue = incidentCost * (a.fewerLost / 100);
  const visitValue = a.visitsMonth * 12 * (a.remoteShare / 100) * Math.max(0, a.visitCost - a.remoteCost);
  const lines = [
    { id: 'meetings', label: 'Meeting time lost to technology', today: meetingCost, value: meetingValue,
      how: `${a.disruptWeek} disrupted meetings a week × ${a.people} people × ${a.disruptMin} min × 52 weeks × €${a.hourCost} an hour; ${a.fewerDisrupt}% avoided` },
    { id: 'incidents', label: 'Time people lose to incidents', today: incidentCost, value: incidentValue,
      how: `${a.incidentsMonth} incidents a month × 12 × ${a.incidentHours} h × €${a.hourCost} an hour; ${a.fewerLost}% avoided` },
    { id: 'visits', label: 'Site visits that become remote fixes', today: a.visitsMonth * 12 * a.visitCost, value: visitValue,
      how: `${a.visitsMonth} visits a month × 12 × ${a.remoteShare}% × (€${a.visitCost} a visit less €${a.remoteCost} a remote fix)` },
  ];
  const value = lines.reduce((n, l) => n + l.value, 0);
  return { inputs: a, lines, value, run: a.runCost, net: value - a.runCost, payback: value > 0 ? (a.runCost / value) * 12 : null };
}

// ---- The pilot measures (ROADMAP, "How we will know it works") ----------------------------------------------------------
// Baseline at the start of the pilot and now; both SIMULATED. `better` says which way is good.
export const PILOT = [
  { id: 'start', label: 'Meeting-start delay', base: '4 min 10 s', now: '2 min 40 s', better: true, from: 'Room booking and device monitoring' },
  { id: 'lost', label: 'Lost time per incident', base: '3 h 5 min', now: '1 h 12 min', better: true, from: 'Incident records, the HappySignals method' },
  { id: 'reassign', label: 'Reassignment rate', base: '0.9 per job', now: '0.3 per job', better: true, from: 'Incident records' },
  { id: 'remote', label: 'Remote fixes against site visits', base: '52% remote', now: '81% remote', better: true, from: 'Incident records' },
  { id: 'ftf', label: 'First-time fix', base: '78%', now: '89%', better: true, from: 'Incident records' },
  { id: 'tools', label: 'Tool count', base: '12 consoles', now: '7 consoles', better: true, from: 'Settings, connectors' },
  { id: 'audit', label: 'Audit preparation hours', base: '120 h per audit', now: '40 h per audit', better: true, from: 'Project records' },
  { id: 'energy', label: 'Idle-hours energy', base: '2,600 kWh a month', now: '1,840 kWh a month', better: true, from: 'Power strip and display monitoring' },
];

// ---- What it costs, and the band ---------------------------------------------------------------------------------------
/** Everything Claire's Home shows, from what the page knows: `vendors` (data/vendors records), `experience` (the AV
    service's four measures across every office, src/lib/experience.mjs), `behind` (units running firmware behind the
    standard), `today` (the demo's day), `servicesWithin` (true when every service is within its targets this week). */
export function leadership({ vendors = [], experience = [], behind = 0, today = '2026-09-28', servicesWithin = true, owners = {} }) {
  const days = (d) => Math.round((Date.parse(d) - Date.parse(today)) / 864e5);
  const ending = vendors.filter((v) => { const d = days(v.contract.end); return d >= 0 && d <= 90; }).sort((a, b) => a.contract.end.localeCompare(b.contract.end));
  const spend = monthStrip('spend', 42000, 2600, { trend: 120 });
  spend[11] = 41200;
  const plan = 45000;
  const E = Object.fromEntries(experience.map((m) => [m.id, m]));
  const src = (from, at = '08:00') => ({ from, at, sim: true });
  const figures = [
    { id: 'ontime', n: E.ontime?.words ?? '–', label: 'Meetings on time', spark: E.ontime?.series ?? [], fmt: '%', state: E.ontime?.within === false ? 'review' : 'fine', source: src('Room booking and device monitoring'), title: `${E.ontime?.label ?? ''}, last 30 days` },
    { id: 'first', n: E.first?.words ?? '–', label: 'Worked first time', spark: E.first?.series ?? [], fmt: '%', state: E.first?.within === false ? 'review' : 'fine', source: src('Incident records and room booking'), title: `${E.first?.label ?? ''}, last 30 days` },
    { id: 'lost', n: E.lost?.words ?? '–', label: 'Lost time per incident', spark: E.lost?.series ?? [], fmt: 'min', state: E.lost?.within === false ? 'review' : 'fine', source: src('Incident records, the HappySignals method'), title: 'Lost time per incident, last 30 days' },
    { id: 'cost', n: eurK(spend[11]), label: 'Cost this month', spark: spend, fmt: 'eur', state: spend[11] > plan ? 'review' : 'fine', source: { ...FINANCE }, title: `${eur(spend[11])} against a ${eur(plan)} plan` },
  ];
  const costs = [
    { id: 'licences', label: 'Licences per seat', value: '€0', sub: 'Keia Atlas is open source. The tools it connects to keep their own licences.', strip: monthStrip('licences', 6400, 280), stripWords: 'Licences for connected tools, a month', source: { ...FINANCE } },
    { id: 'contracts', label: 'Contracts ending within 90 days', value: String(ending.length), sub: ending.length ? ending.map((v) => `${v.name}, ${v.contract.end.slice(8, 10).replace(/^0/, '')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+v.contract.end.slice(5, 7) - 1]}`).join('; ') : 'None', strip: monthStrip('vendors', 18500, 1800), stripWords: 'Vendor spend, a month', source: { from: 'Vendor records and the finance connector', at: '08:00', sim: true }, to: '/vendors/?ending=1' },
    { id: 'visits', label: 'Remote fixes against site visits', value: '81% remote', sub: '61 fixed remotely, 14 site visits this month', strip: monthStrip('remote', 70, 5, { trend: 1.2, min: 40 }), stripWords: 'Share fixed remotely, a month', source: src('Incident records') },
    { id: 'energy', label: 'Energy at idle', value: '1,840 kWh', sub: 'AV and displays outside office hours this month', strip: monthStrip('energy', 2200, 160, { trend: -35 }), stripWords: 'Idle-hours energy, a month', source: src('Power strip and display monitoring') },
  ];
  // To review: plain lines, each with its owner in its own field (never in the words with the number).
  const review = [
    ...ending.map((v) => ({ id: `contract-${v.id}`, text: `${v.name} contract ends in ${days(v.contract.end)} days`, owner: owners[v.owner] ?? null, to: `/vendors/${v.id}/` })),
    ...(behind ? [{ id: 'firmware', text: `Firmware behind the standard on ${behind} units; a proposal is waiting`, owner: owners.sofia ?? null, to: '/services/av/?fw=1#units' }] : []),
  ];
  const answer = `${servicesWithin ? 'All services within target' : 'A service is past target'} · ${review.length ? `${review.length} to review` : 'nothing to review'}`;
  return { figures, costs, review, answer, plan, spend, pilot: PILOT, inputs: INPUTS, model: valueModel() };
}
