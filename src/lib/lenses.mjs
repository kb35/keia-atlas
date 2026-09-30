// Lenses on the floor plan (UX-V2 §2.5, BUILD-PLAN V6 H1). One plan; the lens changes what each space's glyph and
// label say. Pure: no data imports, so the rules are tested on their own (tests/lenses.test.mjs). The facts each rule
// reads are gathered at build time by src/lib/lens-data.mjs; the plan's script (src/lib/lens-client.mjs) switches.
//
// A space under a lens is { h, word, label, line, who? }:
//   h      one of the health states (src/lib/health.mjs): the glyph's shape
//   word   the state in words, beside the glyph in the selected-space panel ("Fault", "Being installed")
//   label  the short label on the plan under the glyph ("2 jobs", "PRJ-16", "Keystone"); empty for none
//   line   one sentence for the panel and the peek ("Video bar offline before the 09:00")
//   who    a first name for "With Liam" (Support only)

// Each lens and the module it belongs to: a lens shows only while its module is On or Connected
// (src/lib/modules.mjs). Health belongs to Locations, the page's own module, so it is always there.
export const LENSES = [
  { id: 'health', label: 'Health', module: 'locations', says: 'Health of each space now' },
  { id: 'support', label: 'Support', module: 'support', says: 'The worst open job in each space' },
  { id: 'network', label: 'Network', module: 'services', says: 'The switch ports and access point serving each space' },
  { id: 'projects', label: 'Projects', module: 'projects', says: 'The phase of the work in each space' },
  { id: 'vendors', label: 'Vendors', module: 'vendors', says: 'Which vendor covers each space\'s kit' },
  { id: 'knowledge', label: 'Knowledge', module: 'knowledge', says: 'Setup guides, known errors and captured fixes for each space' },
];
export const LENS_IDS = LENSES.map((l) => l.id);
export const lensOf = (id) => LENSES.find((l) => l.id === id) ?? LENSES[0];

/** The lens to show: the one asked for if its module is not Off, else Health. */
export function pickLens(asked, modules = {}) {
  const l = LENSES.find((x) => x.id === asked);
  return l && modules[l.module] !== 'off' ? l.id : 'health';
}
/** The next lens for the `L` key, skipping lenses whose module is Off. */
export function nextLens(cur, modules = {}) {
  const on = LENSES.filter((l) => modules[l.module] !== 'off');
  const i = on.findIndex((l) => l.id === cur);
  return on[(i + 1) % on.length].id;
}

// The key under the plan, per lens: the states the lens uses, in its own words.
export const LENS_KEY = {
  health: [
    { h: 'fine', word: 'Working', says: 'Nothing wrong now; shaded darker while in use' },
    { h: 'fault', word: 'Not working now', says: 'A unit offline or alerting, or an open incident' },
    { h: 'off', word: 'Closed', says: 'Outside the office\'s hours; no ring' },
  ],
  support: [
    { h: 'fault', word: 'Fault', says: 'A P1 to P3 incident someone is on, or nobody has yet' },
    { h: 'review', word: 'To review', says: 'A P4, or a job waiting on something outside' },
    { h: 'progress', word: 'Work booked', says: 'A task or a device swap, no incident' },
    { h: 'fine', word: 'No open jobs', says: 'Nothing open in the space' },
  ],
  network: [
    { h: 'fault', word: 'Fault', says: 'A switch port serving the space is down or draws no power' },
    { h: 'review', word: 'To review', says: 'A cable passed its test with little margin to spare' },
    { h: 'fine', word: 'Fine', says: 'Every port up; its access point in service' },
    { h: 'off', word: 'Not recorded', says: 'No switch port recorded for the space' },
  ],
  projects: [
    { h: 'planned', word: 'Planned', says: 'In a project that has not reached the space yet' },
    { h: 'progress', word: 'Being installed', says: 'The new kit is going in now' },
    { h: 'review', word: 'Snag open', says: 'Installed, with a snag still open' },
    { h: 'fine', word: 'Handed over', says: 'Done and handed over' },
  ],
  vendors: [
    { h: 'fine', word: 'Covered', says: 'A vendor covers the kit; the contract runs past 90 days' },
    { h: 'review', word: 'To review', says: 'The covering contract ends within 90 days' },
    { h: 'off', word: 'Not covered', says: 'No vendor recorded for the kit' },
  ],
  knowledge: [
    { h: 'fine', word: 'Guides and fixes', says: 'Setup guides or captured fixes cover the kit' },
    { h: 'review', word: 'Known error', says: 'A manufacturer\'s known error affects a unit here' },
    { h: 'stale', word: 'Guide past due', says: 'A setup guide is past due for review (dashed)' },
    { h: 'off', word: 'Nothing recorded', says: 'No guide, known error or captured fix yet' },
  ],
};

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const first = (s) => String(s ?? '').replace(/^(.*?[.!?])\s.*$/, '$1');

// ---- Support: the worst open job in the space --------------------------------------------------------------------
// jobs: [{ kind: 'incident' | 'task' | 'refresh' | ..., prio?, state?, title, who? }]
const JOB_RANK = { fault: 0, review: 1, progress: 2 };
export function supportLens({ jobs = [] } = {}) {
  if (!jobs.length) return { h: 'fine', word: 'No open jobs', label: '', line: 'No open jobs in the space.' };
  const graded = jobs.map((j) => ({
    j,
    h: j.kind === 'incident' ? (j.prio <= 3 && j.state !== 'on-hold' ? 'fault' : 'review') : 'progress',
  })).sort((a, b) => JOB_RANK[a.h] - JOB_RANK[b.h] || (a.j.prio ?? 9) - (b.j.prio ?? 9));
  const w = graded[0];
  const word = w.h === 'fault' ? 'Fault' : w.h === 'review' ? 'To review' : 'Work booked';
  return { h: w.h, word, label: plural(jobs.length, 'job'), line: first(w.j.title), who: w.j.who ?? null, ...(w.j.number ? { ref: w.j.number } : {}) };
}

// ---- Network: the switch ports and access point serving the space ------------------------------------------------
// { ports, portFault?, minMargin?, ap?, vlans?, sw? }. A port fault comes from the monitoring fact on an open
// incident; a low margin from the cable's own test (a pass, but under MARGIN_DB to spare).
export const MARGIN_DB = 2.55;
export function networkLens({ ports = 0, portFault = null, minMargin = null, ap = null, vlans = [], sw = null } = {}) {
  const on = [vlans.length ? `VLAN ${vlans.join(' and ')}` : null, sw].filter(Boolean).join(' · ');
  if (!ports && !ap) return { h: 'off', word: 'Not recorded', label: '', line: 'No switch port recorded for the space.' };
  if (portFault) return { h: 'fault', word: 'Fault', label: 'Port', line: portFault, on };
  if (minMargin != null && minMargin < MARGIN_DB) return { h: 'review', word: 'To review', label: `${minMargin.toFixed(1)} dB`, line: `A cable passed its test with ${minMargin.toFixed(2)} dB to spare; retest at the next visit.`, on };
  return { h: 'fine', word: 'Fine', label: ports ? plural(ports, 'port') : '', line: `${ports ? `${plural(ports, 'port')} up` : 'No wired ports'}${ap ? `; Wi-Fi from ${ap}` : ''}.`, on };
}

// ---- Projects: the phase of the work in the space ----------------------------------------------------------------
// entries: [{ code, name, phase, space: 'not-started' | 'in-progress' | 'snags' | 'done', note? }]
const PRJ_RANK = { review: 0, progress: 1, planned: 2, fine: 3 };
export function projectsLens({ entries = [] } = {}) {
  if (!entries.length) return { h: 'off', word: 'No project', label: '', line: 'No open project in the space.' };
  const graded = entries.map((e) => {
    const installing = ['integrate', 'handover'].includes(e.phase);
    const h = e.space === 'done' ? 'fine' : e.space === 'snags' ? 'review' : e.space === 'in-progress' && installing ? 'progress' : 'planned';
    return { e, h };
  }).sort((a, b) => PRJ_RANK[a.h] - PRJ_RANK[b.h]);
  const w = graded[0];
  const word = { fine: 'Handed over', review: 'Snag open', progress: 'Being installed', planned: 'Planned' }[w.h];
  const more = entries.length > 1 ? ` and ${plural(entries.length - 1, 'more project')}` : '';
  return { h: w.h, word, label: w.e.code, line: `${w.e.code} ${w.e.name}${w.e.note ? `: ${w.e.note}` : ''}${more}.`, ref: w.e.code };
}

// ---- Vendors: who covers the space's kit, and when the contract ends ----------------------------------------------
// { vendor: { name, short, end, kind }, today }. Within 90 days of the end is To review.
export const CONTRACT_DAYS = 90;
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export function vendorsLens({ vendor = null, today } = {}) {
  if (!vendor) return { h: 'off', word: 'Not covered', label: '', line: 'No vendor recorded for the kit in the space.' };
  const left = vendor.end ? days(today, vendor.end) : null;
  const soon = left != null && left <= CONTRACT_DAYS;
  return {
    h: soon ? 'review' : 'fine', word: soon ? 'To review' : 'Covered', label: vendor.short ?? vendor.name,
    line: `${vendor.name} covers the kit${vendor.end ? `; the contract ends ${soon ? `in ${plural(left, 'day')}` : `on ${vendor.end}`}` : ''}.`,
  };
}

// ---- Knowledge: guides, known errors and captured fixes -----------------------------------------------------------
// { guides: [{ name, updated }], errors: [{ title }], fixes: [{ text }], today }. A guide is due for review every
// GUIDE_MONTHS months; one past that is Past due for review and draws the dashed ring.
export const GUIDE_MONTHS = 6;
export function knowledgeLens({ guides = [], errors = [], fixes = [], today } = {}) {
  const n = guides.length + errors.length + fixes.length;
  if (!n) return { h: 'off', word: 'Nothing recorded', label: '', line: 'No setup guide, known error or captured fix for the space yet.' };
  const due = new Date(today); due.setMonth(due.getMonth() - GUIDE_MONTHS);
  const past = guides.filter((g) => g.updated && g.updated < due.toISOString().slice(0, 10));
  const parts = [guides.length && plural(guides.length, 'setup guide'), errors.length && plural(errors.length, 'known error'), fixes.length && plural(fixes.length, 'captured fix', 'captured fixes')].filter(Boolean).join(', ');
  if (past.length) return { h: 'stale', word: 'Guide past due', label: plural(n, 'item'), line: `${past[0].name} is past due for review (last updated ${past[0].updated}). ${parts}.` };
  if (errors.length) return { h: 'review', word: 'Known error', label: plural(n, 'item'), line: `${first(errors[0].title)}${/[.!?]$/.test(first(errors[0].title)) ? '' : '.'} ${parts}.` };
  return { h: 'fine', word: 'Guides and fixes', label: plural(n, 'item'), line: `${parts}.` };
}

// ---- Health: the live state, from the simulation (src/lib/livesim.mjs roomAt) ---------------------------------------
// st: 'use' | 'free' | 'problem' | 'closed'; why: words for what is wrong.
export function healthLens(st, why = '') {
  if (st === 'problem') return { h: 'fault', word: 'Not working now', label: '', line: why || 'Not working now.' };
  if (st === 'closed') return { h: 'off', word: 'Closed', label: '', line: 'Outside the office\'s hours.' };
  return { h: 'fine', word: st === 'use' ? 'In use' : 'Free', label: '', line: st === 'use' ? 'In use now; working.' : 'Free now; working.' };
}
