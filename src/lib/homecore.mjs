// The rules behind Home: which group a piece of work sits in (Today,
// This week, Later, Done), how a person's day is laid out in order, and how a piece of work is worded.
// Pure: no data is loaded here, so the rules are tested on their own (tests/home.test.mjs).
// src/lib/home.mjs feeds it Keia Atlas's work items (src/lib/work.mjs) at build time, and the Home page
// runs the same rules again in the browser for whoever is viewing.
import { hoursPerDay, isWeekend, addDays } from './workcore.mjs';

export const GROUPS = { today: 'Today', week: 'This week', later: 'Later', done: 'Done today' };
export const GROUP_ORDER = ['today', 'week', 'later', 'done'];

const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5);

// Which group a piece of work belongs in for a person's list. Incidents and reports waiting on you are
// live now, so they are Today whatever their date; a task is Today when due today or overdue, This week
// when due within seven days, otherwise Later. A work-plan item (a year-long window) is always Later.
export function bucketOf(it, today) {
  if (it.status === 'done') return 'done';
  if (it.kind === 'incident' || it.kind === 'inbox') return 'today';
  if (it.kind === 'refresh' || it.kind === 'plan') return 'later';
  if (it.kind === 'time-off') return null;
  const at = it.kind === 'task' ? it.end : it.start;
  if (!at) return 'later';
  const n = days(today, at);
  if (n <= 0 || (it.start && it.start <= today && it.end >= today)) return 'today';
  return n <= 7 ? 'week' : 'later';
}

// The order inside a group: what is live first, then the soonest, then blocked last inside a day.
const KIND_RANK = { incident: 0, inbox: 1, task: 2, lab: 3, visit: 4, refresh: 5, plan: 6 };
export function listOrder(a, b) {
  const ka = KIND_RANK[a.kind] ?? 9, kb = KIND_RANK[b.kind] ?? 9;
  if (ka !== kb) return ka - kb;
  if (a.kind === 'incident') return (a.prio ?? 9) - (b.prio ?? 9);
  const da = a.end ?? a.start ?? '9999', db = b.end ?? b.start ?? '9999';
  if (da !== db) return da < db ? -1 : 1;
  return (a.status === 'blocked') - (b.status === 'blocked') || a.title.localeCompare(b.title);
}

// A person's open work, grouped. Work-plan items (one per room and year) fold into one line per site,
// so ten rooms due at the Dublin office read as "Replace 14 devices due at the Dublin office" with one link.
export function groupFor(items, personId, today) {
  const mine = items.filter((it) => it.who.includes(personId) && it.status !== 'done' && it.kind !== 'time-off');
  const folded = [], plans = new Map();
  for (const it of mine) {
    if (it.kind !== 'refresh') { folded.push(it); continue; }
    const k = `${it.site}:${it.end?.slice(0, 4) ?? ''}`;
    const row = plans.get(k) ?? { ...it, id: `refresh:${it.site}:${it.end?.slice(0, 4) ?? ''}`, room: null, units: 0, hours: 0, rooms: 0, folded: true };
    row.units += it.units ?? 0; row.hours += it.hours ?? 0; row.rooms += 1;
    plans.set(k, row);
  }
  for (const row of plans.values()) folded.push({ ...row, title: `Replace ${row.units} ${row.units === 1 ? 'device' : 'devices'} due in ${row.end?.slice(0, 4) ?? 'the work plan'}` });
  const out = { today: [], week: [], later: [], done: [] };
  for (const it of folded) { const g = bucketOf(it, today); if (g && out[g]) out[g].push(it); }
  for (const g of Object.keys(out)) out[g].sort(listOrder);
  return out;
}

// ---- The day ----------------------------------------------------------------------------------------
// Where a person is today, in words, from the Schedule's placeOn().
// "Dublin office" reads as "the Dublin office" in a sentence; a remote site's name stands as it is.
const theOffice = (n) => (n && / office$/.test(n) ? `the ${n}` : n);
export function placeWords(place, { siteName = () => null, roomName = () => null } = {}) {
  if (!place) return { kind: 'remote', text: 'Working remotely' };
  if (place.kind === 'away') return { kind: 'away', text: place.why === 'holiday' ? `Away: ${place.holiday?.name ?? 'public holiday'}` : place.why === 'weekend' ? 'Weekend' : `Away: ${place.off?.note || 'time off'}` };
  if (place.kind === 'office') return { kind: 'office', text: `At ${theOffice(siteName(place.site)) ?? 'the office'}` };
  if (place.kind === 'home') return { kind: 'home', text: `At home, ${roomName(place.place) ?? 'home office'}` };
  if (place.kind === 'visiting') return { kind: 'visiting', text: `Visiting ${roomName(place.place) ?? theOffice(siteName(place.site)) ?? 'another office'}` };
  return { kind: 'remote', text: 'Working remotely' };
}

// The order of the day: what takes the person's time today, laid end to end from `start` o'clock, each
// for the hours it takes that day (at least half an hour), until `end`. Incidents first (they are live),
// then tasks by due date (overdue first), then Lab work and visits. Anything past the end of the day is
// still listed, without a place on the bar. Times are a plan for the day, not bookings; the page says so.
const DAY_RANK = { incident: 0, task: 1, lab: 2, visit: 3, refresh: 4 };
export function planDay(items, personId, today, { start = 9, end = 18 } = {}) {
  const todays = items.filter((it) => it.who.includes(personId) && it.status !== 'done' && it.start && it.end && it.start <= today && it.end >= today
    && ['incident', 'task', 'lab', 'visit'].includes(it.kind))
    .sort((a, b) => (DAY_RANK[a.kind] ?? 9) - (DAY_RANK[b.kind] ?? 9) || (a.kind === 'incident' ? (a.prio ?? 9) - (b.prio ?? 9) : 0) || (a.end ?? '9').localeCompare(b.end ?? '9') || a.title.localeCompare(b.title));
  const out = [];
  let t = start;
  for (const it of todays) {
    const visitAllDay = it.kind === 'visit';
    const h = visitAllDay ? end - start : Math.max(0.5, Math.min(end - start, Math.round(hoursPerDay(it) * 2) / 2 || 1));
    const from = visitAllDay ? start : t, to = Math.min(end, from + h);
    const fits = from < end;
    out.push({ it, from: fits ? from : null, to: fits ? to : null, hours: h });
    if (!visitAllDay && fits) t = to;
  }
  return out;
}

export const clock = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`;
export const spanWords = (h) => (h >= 1 ? `${h % 1 ? h.toFixed(1) : h} h` : `${Math.round(h * 60)} min`);

// Due words for a task: "3 days late", "Today", "Tomorrow", "In 4 days", "12 Oct".
export function dueWords(it, today, fmt = (d) => d) {
  const at = it.kind === 'task' ? it.end : it.start;
  if (!at) return it.kind === 'refresh' ? 'This year' : '';
  const n = days(today, at);
  if (it.kind === 'incident') return n < 0 ? `Open ${-n} ${n === -1 ? 'day' : 'days'}` : 'Opened today';
  if (it.kind === 'refresh') return `By ${fmt(it.end)}`;
  if (n < 0) return `${-n} ${n === -1 ? 'day' : 'days'} late`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 7) return `In ${n} days`;
  return fmt(at);
}

// A working day near today (the Schedule's next working day), for links that need a weekday.
export const nextWorkingDay = (d) => { let x = d; while (isWeekend(x)) x = addDays(x, 1); return x; };

// ==== v2: the dark cockpit (UX-V2 §3, UI-V2 §3.1) ================================================================
// One Home skeleton for every role: the band answers "is it all right?" in one sentence, four figures say how many
// need you, and the sections follow in the role's order. Role changes what comes first, never what exists.
// cockpit() is pure: the page passes the Home blob (src/lib/home.mjs), who has each job now (the base plus the live
// layer's changes, src/lib/ownership.mjs records) and the viewer; it returns the words, the figures and the lists.

export const ROLE_KIND = {
  tech: 'field', delivery: 'field', network: 'field', innovation: 'field', desk: 'desk', 'sm-av': 'owner', 'sm-infra': 'owner',
  pm: 'pm', programme: 'pm', head: 'lead', vendor: 'vendor', 'service-vendor': 'vendor',
  'delivery-manager': 'manager', 'eng-manager': 'manager', 'pm-manager': 'manager', 'tech-manager': 'manager',
};
// The sections per kind of role, in order, in two layers: Summary (the figures opened) and Record (the rest).
// "work" is the row With you | To review. Every section exists for everyone; the order is the role's.
export const LAYOUT = {
  field: { summary: ['ready', 'day', 'work', 'floors'], record: ['quiet', 'tasks', 'device', 'provision', 'lab'] },
  desk: { summary: ['ready', 'queue', 'work', 'estate'], record: ['quiet', 'tasks'] },
  owner: { summary: ['ready', 'approval', 'work', 'estate'], record: ['quiet', 'tasks', 'firmware', 'lab'] },
  pm: { summary: ['ready', 'projects', 'work'], record: ['quiet', 'tasks', 'gates', 'blocked'] },
  lead: { summary: ['estate', 'costs', 'lreview'], record: ['pilot', 'model', 'projects', 'quiet', 'stuck', 'regions', 'across'] },
  vendor: { summary: ['partner', 'install'], record: ['tasks', 'vnext'] },
  manager: { summary: ['ready', 'team', 'work'], record: ['quiet', 'tasks'] },
  everyone: { summary: ['estate', 'work', 'projects'], record: ['quiet', 'stuck', 'regions', 'across'] },
};
export const JOB_KINDS = new Set(['incident', 'task', 'lab', 'inbox']);
const ORDER_S = { ready: 0, with: 1, parked: 2, waiting: 3 };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A job's health on a row: a fault for a P1 to P3 incident nobody has fixed, In progress while someone has it. */
export function rowState(it, own) {
  if (it.kind === 'incident' && own?.s !== 'waiting' && (it.prio ?? 9) <= 3 && own?.s === 'ready') return 'fault';
  if (own?.s === 'waiting') return 'review';
  if (own?.s === 'with' || own?.s === 'parked') return 'progress';
  if (own?.s === 'ready') return it.kind === 'incident' ? 'fault' : 'planned';
  return 'off';
}

/** Is a job offered to the viewer something to do now (Ready for you)? Incidents and reports are live; a task or
    Lab test counts when it is due today or overdue. */
export function readyNow(it, today) {
  if (it.kind === 'incident' || it.kind === 'inbox') return true;
  return bucketOf({ ...it, status: 'todo' }, today) === 'today';
}

const jobOrder = (ownOf) => (a, b) => {
  const oa = ownOf(a.id), ob = ownOf(b.id);
  return (a.kind === 'incident' ? 0 : 1) - (b.kind === 'incident' ? 0 : 1) || (a.prio ?? 9) - (b.prio ?? 9)
    || (ORDER_S[oa?.s] ?? 9) - (ORDER_S[ob?.s] ?? 9) || (a.end ?? '9').localeCompare(b.end ?? '9') || a.title.localeCompare(b.title);
};

/** The whole cockpit for one viewer. `H` is the Home blob, `ownOf(id)` who has a job now, `who` the viewer. */
export function cockpit(H, ownOf, who) {
  const C = H.cockpit, today = H.today, all = who === 'everyone';
  const p = all ? null : H.people[who];
  const kind = all ? 'everyone' : ROLE_KIND[p?.roleId] ?? 'field';
  const items = Object.values(H.items).filter((it) => JOB_KINDS.has(it.kind));
  const own = (it) => ownOf(it.id);
  const sort = jobOrder(ownOf);
  // Ready for you: offered to you and due now. The service desk's is every new incident nobody has taken yet.
  const ready = items.filter((it) => { const o = own(it); if (!o || o.s !== 'ready') return false; if (kind === 'desk' && it.kind === 'incident') return true; return o.to === who && readyNow(it, today); }).sort(sort);
  // With you: taken, parked or waiting on something outside.
  const withYou = items.filter((it) => { const o = own(it); return o && o.to === who && ['with', 'parked', 'waiting'].includes(o.s); }).sort(sort);
  const review = all ? [] : C.review[who] ?? [];
  const todayN = all ? 0 : planDay(Object.values(H.items), who, today).length;
  // The service desk's queue: every open incident, worst first (priority, then nobody on it, then past target, then oldest).
  const incs = items.filter((it) => it.kind === 'incident' && own(it) && own(it).s !== 'done');
  const queue = [...incs].sort((a, b) => (a.prio ?? 9) - (b.prio ?? 9) || (own(a).s === 'ready' ? 0 : 1) - (own(b).s === 'ready' ? 0 : 1)
    || (C.inc[b.id]?.past ? 1 : 0) - (C.inc[a.id]?.past ? 1 : 0) || (C.inc[a.id]?.opened ?? '').localeCompare(C.inc[b.id]?.opened ?? ''));
  const past = incs.filter((it) => C.inc[it.id]?.past).length;
  const waiting = incs.filter((it) => own(it).s === 'waiting').length;
  const newToday = incs.filter((it) => C.inc[it.id]?.newToday).length;
  const faultReady = ready.some((it) => it.kind === 'incident' && (it.prio ?? 9) <= 3);
  // Spaces: at the viewer's office, and across the estate.
  const office = p?.office && C.siteHealth[p.office] && !H.sites[p.office]?.remote ? p.office : null;
  const sh = office ? C.siteHealth[office] : null;
  const estate = C.offices.reduce((a, s) => ({ n: a.n + C.siteHealth[s].n, fault: a.fault + C.siteHealth[s].fault.length, review: a.review + C.siteHealth[s].review.length }), { n: 0, fault: 0, review: 0 });
  const X = all ? {} : C.extra[who] ?? {};
  const N = all ? [] : H.numbers[who] ?? [];
  const num = (id) => N.find((x) => x.id === id)?.n ?? 0;
  const F = (id, n, label, to, extra = {}) => ({ id, n, label, to, ...extra });
  const officeName = office ? H.sites[office].name.replace(/ office$/, '') : '';
  let figures, answer;
  switch (kind) {
    case 'field':
      figures = [F('ready', ready.length, 'Ready for you', '#ready', { tone: faultReady ? 'bad' : '' }), F('with', withYou.length, 'With you', '#with'), F('today', todayN, 'Today', '#day'), F('review', review.length, 'To review', '#review')];
      answer = sh
        ? `${officeName}: ${sh.fault.length ? `${plural(sh.fault.length, 'space')} with a fault · ` : ''}${sh.n - sh.fault.length - sh.review.length} spaces ready`
        : `${ready.length ? `${ready.length} ready for you` : 'Nothing new for you'} · ${withYou.length} with you · ${todayN} today`;
      break;
    case 'desk':
      figures = [F('ready', ready.length, 'Ready for you', '#queue', { tone: faultReady ? 'bad' : '' }), F('waiting', waiting, 'Waiting on', '/incidents/?state=on-hold'), F('past', past, 'Past target', '#queue', { tone: past ? 'bad' : '' }), F('new', newToday, 'New today', '#queue')];
      answer = `${ready.length ? `${plural(ready.length, 'new job')} ready to take` : 'Nothing waiting for you'} · ${waiting} waiting on something outside`;
      break;
    case 'owner': {
      const approval = num('approval');
      figures = [F('approval', approval, 'For your approval', '#approval', { tone: approval ? 'warn' : '' }), F('within', `${incs.length - past} of ${incs.length}`, 'Within target', `/incidents/?state=${H.openInc}`), F('past', past, 'Past target', `/incidents/?state=${H.openInc}`, { tone: past ? 'bad' : '' }), F('inc', incs.length, 'Open incidents', `/incidents/?state=${H.openInc}`)];
      answer = `${p.roleId === 'sm-infra' ? 'IT' : 'AV'}: ${past ? `${past} past target` : 'every job within target'} · ${approval ? `${approval} for your approval` : 'nothing for your approval'}`;
      break;
    }
    case 'pm':
      figures = [F('gates', X.gatesWeek ?? 0, 'Gates this week', '#review'), F('late', X.late ?? 0, 'Past due tasks', '#blocked', { tone: X.late ? 'bad' : '' }), F('waiting', num('blocked'), 'Waiting on', '#blocked'), F('risks', X.risks ?? 0, 'Open risks', '#review')];
      answer = `${X.onPlan ?? 0} of ${plural(X.projects ?? 0, 'project')} on plan · ${X.gatesWeek ? `${plural(X.gatesWeek, 'gate')} this week` : 'no gate this week'}`;
      break;
    case 'lead':
      // Leadership (UX-V2 §4.7): experience and cost, each with its sparkline and its source; nothing per person.
      if (C.lead) { figures = C.lead.figures.map((f) => F(f.id, f.n, f.label, f.to, { spark: f.spark, title: f.title })); answer = C.lead.answer; break; }
      // falls through without the leadership figures
    case 'everyone':
      figures = [F('spaces', `${estate.n - estate.fault} of ${estate.n}`, 'Spaces working', '/rooms/'), F('inc', incs.length, 'Open incidents', `/incidents/?state=${H.openInc}`), F('past', past, 'Past target', `/incidents/?state=${H.openInc}`, { tone: past ? 'bad' : '' }), F('off', X.off ?? 0, 'Projects off plan', '#review')];
      answer = `${estate.fault ? `${plural(estate.fault, 'space')} with a fault across ${C.offices.length} offices` : `All ${C.offices.length} offices running`} · ${past ? `${past} past target` : 'every job within target'}`;
      break;
    case 'vendor': {
      // A partner (UI-V2 §3.6): the jobs handed to their company and the one contract clock (src/lib/vendors.mjs).
      const P = C.partner?.[who];
      if (P) {
        figures = [F('with', P.withYou, 'With you', '#partner'), F('waiting', P.waiting, 'Waiting on the client', '#partner'), F('late', P.past, 'Past the clock', '#partner', { tone: P.past ? 'bad' : '' }), F('spaces', P.spaces, 'Spaces you can open today', '#partner')];
        answer = P.answer;
        break;
      }
      figures = [F('with', withYou.length, 'With you', '#with'), F('waiting', withYou.filter((it) => own(it).s === 'waiting').length, 'Waiting on the client', '#with'), F('late', X.vendorLate ?? 0, 'Past the date', '#with', { tone: X.vendorLate ? 'bad' : '' }), F('spaces', X.vendorSpaces ?? 0, 'Spaces you can open', '/vendor/')];
      answer = `${plural(withYou.length, 'job')} with you · ${X.vendorLate ? `${X.vendorLate} past the date` : 'none past the date'}`;
      break;
    }
    default:
      figures = N.map((n) => F(n.id, n.n, n.label, n.to, { tone: n.tone ?? '' }));
      answer = `${num('tasks')} open tasks in your team · ${num('blocked') ? `${num('blocked')} waiting on something` : 'nothing waiting on anyone'}`;
  }
  return { kind, layout: LAYOUT[kind], office, ready, withYou, review, todayN, queue, figures, answer, signal: ready.length > 0 || !!sh?.fault.length };
}

/** Welcome back (UX-V2 §4.3): the band and four figures while the person has not started the day yet. */
export function welcomeBand(w, person) {
  const first = person?.first ?? person?.name ?? '';
  return {
    title: `Welcome back, ${first}`,
    answer: `${w.days === 14 ? 'Two weeks' : `${w.days} days`} away · here is what changed`,
    figures: [
      { id: 'yours', n: w.open.length, label: 'Yours now', to: '#welcome' },
      { id: 'handled', n: w.handled.length, label: 'Handled while away', to: '#welcome' },
      { id: 'changed', n: w.changed.length, label: 'Changed on your projects', to: '#welcome' },
      { id: 'rules', n: w.rules.length, label: 'Done automatically', to: '#welcome' },
    ],
  };
}
