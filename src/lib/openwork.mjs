// Open work by role and kind: the one count behind "Who has the open work" on Team and the Work list's Kind and
// Role filters (src/pages/work/_Work.astro), so a count on one page is the count the other shows.
import { work } from './work.mjs';
import { STEPS } from './schedulecore.mjs';
import { sites, DEMO_TODAY, STEP_LABEL } from './data.mjs';
import { PEOPLE, ROLES } from './demo.mjs';

const P = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));

/** Everything not done; booked things (time off, visits, plan dates) only while they are still ahead. */
export const openWork = work.filter((it) => it.status !== 'done' && !(it.status === 'booked' && it.end && it.end < DEMO_TODAY));

/** The kinds of work, in three groups. A project task sits in its Deploy step (Provision, Install, Configure,
    Commission) or, for everything else a project needs, "Other project tasks". */
export const COLS = [
  { k: 'provision', label: STEP_LABEL.provision, one: 'Provision', g: 'proj' },
  { k: 'install', label: STEP_LABEL.install, one: 'Install', g: 'proj' },
  { k: 'configure', label: STEP_LABEL.configure, one: 'Configure', g: 'proj' },
  { k: 'commission', label: STEP_LABEL.commission, one: 'Commission', g: 'proj' },
  { k: 'task', label: 'Other project tasks', one: 'Project task', g: 'proj', note: 'Surveys, designs, reviews, budgets, orders, network, records and hand over' },
  { k: 'incident', label: 'Incidents', one: 'Incident', g: 'svc' },
  { k: 'lab', label: 'Lab tests', one: 'Lab test', g: 'svc' },
  { k: 'inbox', label: 'Approvals waiting', one: 'Approval', g: 'svc', note: 'Reports for a service manager to decide, and time off for a manager to approve' },
  { k: 'refresh', label: 'Work plan due', one: 'Work plan', g: 'year', note: 'Devices due for replacement this year and next, one item per space' },
  { k: 'visit', label: 'Site visits', one: 'Site visit', g: 'year' },
  { k: 'plan', label: 'Planning', one: 'Planning', g: 'year', note: 'Planning reviews, budget dates and change freezes' },
  { k: 'time-off', label: 'Time off', one: 'Time off', g: 'year', note: 'Booked time off from today' },
];
export const GROUPS = [{ g: 'proj', label: 'Project work' }, { g: 'svc', label: 'Running the service' }, { g: 'year', label: 'The year and the people' }].map((x) => ({ ...x, n: COLS.filter((c) => c.g === x.g).length }));
export const COL = Object.fromEntries(COLS.map((c, i) => [c.k, { ...c, i }]));
export const colOf = (it) => (it.kind === 'task' ? (STEPS.includes(it.taskKind) ? it.taskKind : 'task') : it.kind);

// The roles, in the order work flows from leadership to vendors; then the people managers, who mostly approve
// and assign rather than hold work; then work nobody has yet.
const ROLE_ORDER = ['head', 'programme', 'sm-av', 'sm-infra', 'pm', 'delivery', 'network', 'innovation', 'tech', 'desk', 'vendor', 'service-vendor', 'delivery-manager', 'pm-manager', 'eng-manager', 'tech-manager'];
const firstNames = (ps) => { const f = ps.map((p) => p.name.split(' ')[0]); return f.length > 4 ? `${f.slice(0, 3).join(', ')} and ${f.length - 3} more` : f.length > 1 ? `${f.slice(0, -1).join(', ')} and ${f.at(-1)}` : f[0] ?? ''; };
export const ROWS = [
  ...ROLE_ORDER.map((r) => { const ps = PEOPLE.filter((p) => p.roleId === r); return { id: r, name: ROLES[r].name, sub: firstNames(ps), people: ps, role: ROLES[r] }; }),
  { id: 'none', name: 'Not given to anyone', sub: 'Waiting for a person, or everyone’s (a change freeze)', people: [], role: null },
];
export const rolesOf = (who) => (who.length ? [...new Set(who.map((w) => P[w]?.roleId).filter(Boolean))] : ['none']);
export const sitesOf = (it) => (it.site ? [it.site] : [...new Set(it.who.map((w) => P[w]?.office).filter((s) => sites[s]))]);

/** Heat: 1, 2 to 3, 4 to 7, 8 to 15, 16 or more. */
export const level = (n) => (!n ? 0 : Math.min(5, Math.floor(Math.log2(n)) + 1));

/** The counts: per role and kind, per role, per kind, and in all (shared work counts once for each role on it). */
export function countWork(items = openWork) {
  const cell = {}, row = {}, col = {}, list = {};
  for (const it of items) {
    const k = colOf(it);
    col[k] = (col[k] ?? 0) + 1;
    for (const r of rolesOf(it.who)) { cell[`${r}|${k}`] = (cell[`${r}|${k}`] ?? 0) + 1; row[r] = (row[r] ?? 0) + 1; (list[`${r}|${k}`] ??= []).push(it); }
  }
  return { cell, row, col, list, all: items.length };
}
