// The support queue: every open incident, worst first (priority, then nobody on it, then past target, then oldest),
// each with who has it. One list for the Queue page and the Support overview, so their figures agree.
import { incidentList, spoken } from './incidents.mjs';
import { OWN, INC_EXTRA } from './home.mjs';
import { clockFor } from './rules-view.mjs';

/** ready: nobody has it; waiting: on hold for something outside; parked and with: someone has it. */
export const queueStatus = (o) => (!o || o.s === 'ready' ? 'ready' : o.s === 'waiting' ? 'waiting' : o.s === 'parked' ? 'parked' : o.s === 'done' ? 'done' : 'with');

export const queueRows = incidentList.filter((v) => v.open).map((v) => {
  const o = OWN[`inc:${v.inc.number}`] ?? null, x = INC_EXTRA[`inc:${v.inc.number}`] ?? null, clock = clockFor(v, { now: v.now });
  const status = queueStatus(o);
  const glyph = v.inc.state === 'on-hold' || v.inc.priority === 4 ? 'review' : 'fault';
  const due = status === 'ready' ? clock.words : x?.past ? `Past target: open ${spoken(Math.round(x.ageH * 60))}, target ${x.target} h` : `Open ${spoken(v.age)}`;
  return { v, o, x, status, glyph, due, past: !!x?.past, rank: [v.inc.priority, status === 'ready' ? 0 : 1, x?.past ? 0 : 1, v.inc.opened] };
}).sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2] || String(a.rank[3]).localeCompare(String(b.rank[3])));

/** The queue's figures: nobody has it, with someone, waiting on something, past target. */
export function queueCounts(rows = queueRows) {
  return {
    open: rows.length,
    ready: rows.filter((r) => r.status === 'ready').length,
    with: rows.filter((r) => r.status === 'with' || r.status === 'parked').length,
    waiting: rows.filter((r) => r.status === 'waiting').length,
    past: rows.filter((r) => r.past).length,
  };
}
