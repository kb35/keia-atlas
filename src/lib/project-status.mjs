// How a project stands, worked out from its data the way a project manager reads it: three lights
// (schedule, cost, scope) each with a one-line reason; the next gate; what is stuck; the timeline of
// baseline against actual with a gate at the end of each phase; the log of risks, issues, decisions
// and dependencies; change requests for scope; and the lessons learned at close. Nothing here names a
// standard: it is the plain shape of running a piece of work with a start, an end and an owner.
import { projects, playbooks, incidents, spaces, PHASE_LABEL, phasesOf, PROJECT_KIND, DEMO_TODAY, plural, href, fmtDate } from './data.mjs';
import { person, PEOPLE, PROJECT_ROLE, ROLES } from './demo.mjs';
import { PTO_SEED } from './schedule.mjs';

const DAY = 86400000;
export const days = (a, b) => Math.round((new Date(b) - new Date(a)) / DAY);
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const short = (d) => fmtDate(d, { day: 'numeric', month: 'short' });
export const money = (p, n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: p.budget?.currency ?? 'EUR', maximumFractionDigits: 0 }).format(n);

export const LOG_KIND = { risk: 'Risk', issue: 'Issue', decision: 'Decision', dependency: 'Dependency' };
// One status word per kind, open and closed.
export const LOG_STATUS = {
  risk: { open: 'Watching', closed: 'Closed' }, issue: { open: 'Open', closed: 'Resolved' },
  decision: { open: 'Pending', closed: 'Decided' }, dependency: { open: 'Waiting', closed: 'Met' },
};
export const CHANGE_STATUS = { proposed: 'Waiting for approval', approved: 'Approved', declined: 'Declined' };

// The playbook's weeks for a phase: "1 to 2", "3 to 6", 8, "Half a day per room, then 1".
function weeksOf(pbp) {
  const w = pbp?.weeks;
  if (typeof w === 'number') return w;
  const m = String(w ?? '').match(/(\d+)\s*to\s*(\d+)/);
  if (m) return (+m[1] + +m[2]) / 2;
  const n = String(w ?? '').match(/(\d+)/g);
  return n ? +n[n.length - 1] : 2;
}

// ---- Timeline: baseline (planned) against actual, one row per phase, a gate at each planned end ----
export function timeline(p) {
  const list = phasesOf(p), at = list.indexOf(p.phase), pb = playbooks[p.playbook];
  const hist = Object.fromEntries((p.history ?? []).map((h) => [h.phase, h]));
  const today = DEMO_TODAY;
  // Baseline ends: what the history planned; phases not reached yet share the time left to the target
  // by the weeks the playbook gives them, the last one ending on the target date.
  const planEnd = {};
  let lastKnown = p.start;
  list.forEach((ph) => { if (hist[ph]?.planned) { planEnd[ph] = hist[ph].planned; lastKnown = hist[ph].planned; } });
  const unknown = list.filter((ph) => !planEnd[ph]);
  if (unknown.length) {
    const weights = unknown.map((ph) => weeksOf(pb?.phases.find((x) => x.phase === ph)));
    const total = weights.reduce((n, w) => n + w, 0) || 1;
    const span = Math.max(days(lastKnown, p.target), unknown.length * 7);
    let cur = lastKnown, used = 0;
    unknown.forEach((ph, i) => {
      used += weights[i];
      cur = i === unknown.length - 1 ? (p.target > lastKnown ? p.target : addDays(lastKnown, span)) : addDays(lastKnown, Math.round((span * used) / total));
      planEnd[ph] = cur;
    });
  }
  const rows = [];
  let planCur = p.start, actCur = p.start;
  list.forEach((ph, i) => {
    const h = hist[ph];
    const state = i < at ? 'done' : i === at ? 'now' : 'todo';
    const pEnd = planEnd[ph] > planCur ? planEnd[ph] : addDays(planCur, 3);
    let aStart = null, aEnd = null, open = false;
    if (state === 'done') { aStart = actCur; aEnd = h?.ended ?? h?.planned ?? pEnd; }
    else if (state === 'now') { aStart = actCur; aEnd = h?.ended ?? today; open = !h?.ended; }
    if (aEnd && aEnd < aStart) aEnd = aStart;
    const signed = h?.signed_off_by ?? null;
    const slip = h ? (h.ended ? days(h.planned, h.ended) : state === 'now' && today > h.planned ? days(h.planned, today) : 0) : 0;
    rows.push({
      phase: ph, label: PHASE_LABEL[ph], state, planStart: planCur, planEnd: pEnd, actStart: aStart, actEnd: aEnd, open, slip,
      gate: { date: h?.planned ?? pEnd, signed, signedName: signed ? person(signed).name : null, ended: h?.ended ?? null, late: slip > 0 },
      summary: h?.summary ?? '',
    });
    planCur = pEnd; if (aEnd) actCur = aEnd;
  });
  const min = p.start;
  const max = [p.target, ...(p.phase === 'closed' ? [] : [today]), ...rows.map((r) => r.planEnd), ...rows.flatMap((r) => (r.actEnd ? [r.actEnd] : []))].sort().pop();
  const span = Math.max(1, days(min, max));
  const pct = (d) => Math.min(100, Math.max(0, (days(min, d) / span) * 100));
  // Month ticks along the top.
  const ticks = [];
  for (let d = new Date(`${min.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 10) <= max; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (iso >= min) ticks.push({ date: iso, label: d.toLocaleDateString('en-IE', { month: 'short', timeZone: 'UTC' }), x: pct(iso) });
  }
  return { rows, min, max, span, pct, ticks, today, todayX: p.phase !== 'closed' && today >= min && today <= max ? pct(today) : null, targetX: pct(p.target) };
}

// ---- The three lights ---------------------------------------------------------------------------
// Schedule: the current phase against its planned end, and whether earlier phases slipped.
// Cost: spent and ordered against approved, then the estimates. Scope: rooms, and any change request.
export function lights(p) {
  const T = timeline(p), now = T.rows.find((r) => r.state === 'now');
  const slipped = T.rows.filter((r) => r.state === 'done' && r.slip > 0);
  let schedule;
  if (p.phase === 'closed') {
    const d = now?.gate.ended ? days(p.target, now.gate.ended) : 0;
    schedule = d > 0 ? { state: 'warn', word: `Closed ${plural(d, 'day')} late`, why: `Target was ${short(p.target)}; closed ${short(now.gate.ended)}.` } : { state: 'ok', word: d < 0 ? 'Closed early' : 'Closed on time', why: `Every gate signed off by ${short(now?.gate.ended ?? p.target)}.` };
  } else if (now && now.slip > 0) schedule = { state: 'bad', word: `${plural(now.slip, 'day')} over`, why: `${now.label} was due ${short(now.gate.date)} and is still open.` };
  else if (slipped.length) schedule = { state: 'warn', word: 'Slipped, now on plan', why: `${slipped.map((r) => `${r.label} ended ${plural(r.slip, 'day')} late`).join('; ')}. ${now ? `${now.label} is due ${short(now.gate.date)}.` : ''}` };
  else schedule = { state: 'ok', word: 'On plan', why: now ? `${now.label} is due ${short(now.gate.date)}; target ${short(p.target)}.` : `Target ${short(p.target)}.` };

  let cost;
  if (!p.budget) cost = { state: 'off', word: 'No budget yet', why: 'No budget lines on this project.' };
  else {
    const sum = (st) => p.budget.lines.filter((l) => l.status === st).reduce((n, l) => n + l.amount, 0);
    const sp = sum('spent'), cm = sum('committed'), es = sum('estimate'), ap = p.budget.approved, firm = sp + cm;
    if (firm > ap) cost = { state: 'bad', word: `${money(p, firm - ap)} over`, why: `Spent and ordered ${money(p, firm)} against ${money(p, ap)} approved.` };
    else if (firm + es > ap) cost = { state: 'warn', word: 'Estimates run over', why: `${money(p, firm)} firm; with estimates ${money(p, firm + es)} against ${money(p, ap)} approved.` };
    else cost = { state: 'ok', word: `${money(p, ap - firm - es)} in hand`, why: `${money(p, firm)} spent or ordered of ${money(p, ap)} approved${es ? `, ${money(p, es)} still estimated` : ''}.` };
  }

  const rooms = (p.spaces ?? []).length, ch = p.changes ?? [];
  const waiting = ch.filter((c) => c.status === 'proposed'), approved = ch.filter((c) => c.status === 'approved');
  let scope;
  if (waiting.length) scope = { state: 'warn', word: `${plural(waiting.length, 'change request')} waiting`, why: `${waiting[0].title}${waiting.length > 1 ? ` and ${waiting.length - 1} more` : ''}: ${person(waiting[0].approver).name} decides.` };
  else if (approved.length) scope = { state: 'ok', word: `Changed ${approved.length === 1 ? 'once' : `${approved.length} times`}, approved`, why: `${plural(rooms, 'room')}; ${approved[approved.length - 1].title.toLowerCase()} was approved by ${person(approved[approved.length - 1].approver).name}.` };
  else scope = { state: 'ok', word: 'As chartered', why: `${plural(rooms, 'room')}, ${PROJECT_KIND[p.kind]?.toLowerCase() ?? p.kind}; no change requests.` };
  return { schedule, cost, scope };
}

// The next gate: the current phase's end, what it checks and who signs it.
export function nextGate(p) {
  const pb = playbooks[p.playbook], T = timeline(p), now = T.rows.find((r) => r.state === 'now');
  if (!now) return null;
  const pbp = pb?.phases.find((x) => x.phase === p.phase);
  const by = (pbp?.gate?.by ?? []).map((r) => ROLES[r]?.name ?? r);
  const signer = now.gate.signed ? person(now.gate.signed).name : by.join(' and ') || person(p.owner).name;
  return { phase: now.label, date: now.gate.date, late: now.slip > 0, slip: now.slip, checks: pbp?.gate?.checks ?? [], signer, signed: Boolean(now.gate.ended && now.gate.signed), closed: p.phase === 'closed' };
}

// What is stuck: blocked tasks, open issues, dependencies still waiting, risks being watched.
export function stuck(p) {
  const home = `/projects/${p.id.toLowerCase()}/`;
  const out = [];
  for (const t of p.tasks.filter((x) => x.status === 'blocked')) out.push({ kind: 'task', label: t.title, why: t.blocked_by, to: href(`${home}tasks/${t.id.toLowerCase()}/`), owner: t.owner });
  for (const l of (p.log ?? []).filter((x) => x.status === 'open' && x.kind !== 'decision')) out.push({ kind: l.kind, label: l.title, why: l.note, to: `#log`, owner: l.owner });
  return out;
}

// ---- The log and change requests, with their links made ------------------------------------------
export function logEntries(p) {
  const home = `/projects/${p.id.toLowerCase()}/`;
  return (p.log ?? []).map((l) => {
    const inc = l.incident ? incidents[l.incident.toLowerCase()] : null;
    const task = l.task ? p.tasks.find((t) => t.id === l.task) : null;
    return {
      ...l, kindLabel: LOG_KIND[l.kind], statusLabel: LOG_STATUS[l.kind][l.status], ownerName: person(l.owner).name, ownerInitials: person(l.owner).initials,
      links: [
        task ? { label: `${task.id} ${task.title}`, to: href(`${home}tasks/${task.id.toLowerCase()}/`), kind: 'task' } : null,
        inc ? { label: `${inc.number} ${inc.short_description}`, to: href(`/incidents/${l.incident.toLowerCase()}/`), kind: 'incident' } : null,
        l.room && spaces[l.room] ? { label: spaces[l.room].number ? `${spaces[l.room].number} ${spaces[l.room].name}` : spaces[l.room].name, to: href(`/rooms/${l.room}/`), kind: 'room' } : null,
      ].filter(Boolean),
    };
  });
}
export function changeRequests(p) {
  return (p.changes ?? []).map((c) => ({ ...c, statusLabel: CHANGE_STATUS[c.status], byName: person(c.proposed_by).name, approverName: person(c.approver).name, approverInitials: person(c.approver).initials,
    effect: [c.days ? `${c.days > 0 ? '+' : ''}${plural(c.days, 'day')}` : null, c.cost ? `${c.cost > 0 ? '+' : ''}${money(p, c.cost)}` : null].filter(Boolean).join(', ') }));
}

// The charter: why, scope, sponsor, run by, and what success looks like (the project's own list, or
// the playbook's final gate).
export function charter(p) {
  const pb = playbooks[p.playbook];
  const sponsor = (p.roles ?? []).find((r) => r.as === 'programme')?.person ?? null;
  const last = pb?.phases[pb.phases.length - 1];
  const success = p.charter?.success ?? last?.gate?.checks ?? [];
  const rooms = (p.spaces ?? []).map((s) => spaces[s.space]).filter(Boolean);
  return { why: p.charter?.why ?? p.summary, success, sponsor: sponsor ? person(sponsor) : null, owner: person(p.owner), rooms, kind: PROJECT_KIND[p.kind] ?? p.kind, playbook: pb ?? null, start: p.start, target: p.target };
}

// Lessons learned: every captured fix, and where it went (a playbook change that names this project).
export function lessons(p) {
  const pb = playbooks[p.playbook];
  return p.tasks.filter((t) => t.captured_fix).map((t) => ({
    task: t, fix: t.captured_fix, owner: person(t.owner), phase: PHASE_LABEL[t.phase] ?? '',
    inPlaybook: (pb?.changes ?? []).find((c) => c.from === p.id && c.change.toLowerCase().slice(0, 24) === t.captured_fix.toLowerCase().slice(0, 24)) ?? (pb?.changes ?? []).find((c) => c.from === p.id) ?? null,
  }));
}

// Everyone who could take a task: the project team first, then the rest; who is away today is marked.
export function pickable(p) {
  const team = new Set((p.roles ?? []).map((r) => r.person));
  const awayToday = new Set(PTO_SEED.filter(([, from, to]) => from <= DEMO_TODAY && DEMO_TODAY <= to).map(([who]) => who));
  const roleOf = (id) => (p.roles ?? []).find((r) => r.person === id)?.as;
  return PEOPLE.filter((x) => !x.vendor || team.has(x.id)).map((x) => ({ id: x.id, name: x.name, initials: x.initials, role: team.has(x.id) ? PROJECT_ROLE[roleOf(x.id)] : x.role, team: team.has(x.id), away: awayToday.has(x.id) }))
    .sort((a, b) => (a.team === b.team ? a.name.localeCompare(b.name) : a.team ? -1 : 1));
}

// A closed project's work, by phase, for the summary that replaces the board.
export function byPhase(p) {
  return phasesOf(p).map((ph) => ({ phase: ph, label: PHASE_LABEL[ph], tasks: p.tasks.filter((t) => t.phase === ph), history: (p.history ?? []).find((h) => h.phase === ph) ?? null })).filter((g) => g.tasks.length || g.history);
}

export const allProjects = () => Object.values(projects);
