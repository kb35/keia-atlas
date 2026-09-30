// The job record's words (UI-V2 §3.5, UX-V2 §4.1 and §4.5): the answer sentence in the band, the impact line when it
// closes, and the hand-off count. Pure, so the page draws them on the server and its script redraws them in the
// browser from the live layer with the same functions (tests/rules.test.mjs).

const first = (people, id) => String(people?.[id]?.name ?? id ?? '').split(' ')[0];
const hm = (t) => (/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? new Date(t).toTimeString().slice(0, 5) : String(t ?? '').slice(11, 16));

/** "booked 09:00, 8 people", or the reason the priority was proposed when nothing is booked. */
export const bookingWords = (booking, reason) => (booking ? `booked ${hm(booking.at)}, ${booking.people} ${booking.people === 1 ? 'person' : 'people'}` : reason ?? '');

/** The impact line on a closed record: "3.09 back for the 09:00 (8 people)". */
export function impactLine({ spaceNumber, spaceName, booking, resolvedAt }) {
  const where = spaceNumber || spaceName;
  if (booking && (!resolvedAt || String(resolvedAt).slice(0, 16) <= String(booking.at).slice(0, 16) || /[zZ]/.test(String(resolvedAt)))) return `${where} back for the ${hm(booking.at)} (${booking.people} ${booking.people === 1 ? 'person' : 'people'})`;
  return `${where} back in service`;
}

/** The answer sentence: is it all right, who has it, what is at stake. Plain words, 25 or fewer.
    s: { state, own, run (the latest run of a rule on it: { result, at, rule: { name } }), resolved: { at, fix },
         booking, reason, hold, impact, raisedBy (a rule name), major: { commander } } */
export function answerFor(s, people = {}, viewer = null) {
  const at = bookingWords(s.booking, s.reason);
  const cmd = s.major ? ` · commander ${first(people, s.major.commander)}` : '';
  if (s.resolved) return `Resolved at ${hm(s.resolved.at)}${s.impact ? ` · ${s.impact}` : ''}`;
  if (s.run?.result === 'done') return `Back at ${hm(s.run.at)} under the ${s.run.rule.name} · close it with what fixed it`;
  const own = s.own;
  const who = !own ? 'nobody has it yet'
    : own.s === 'ready' ? (own.to ? `offered to ${own.to === viewer ? 'you' : first(people, own.to)}, not taken yet` : 'nobody has it yet')
      : own.s === 'parked' ? `parked by ${first(people, own.to)}`
        : own.s === 'waiting' ? `waiting on ${own.wait ?? 'something outside'}`
          : own.kind === 'team' || own.kind === 'vendor' ? `with ${own.name ?? own.to}` : `with ${own.to === viewer ? 'you' : first(people, own.to)}`;
  if (s.run && (s.run.result === 'unable')) return `Unable to complete${s.run.back ? ', rolled back' : ''} · ${who}${cmd}`;
  if (s.raisedBy && !s.run) return `The ${s.raisedBy} was unable to complete, rolled back · ${who}`;
  return `${who.charAt(0).toUpperCase()}${who.slice(1)}${at ? ` · ${at}` : ''}${cmd}`;
}

/** How many times the job changed hands: every move of `own` to someone else after the first owner. */
export function handoffs(history) {
  let n = 0, last = null;
  for (const h of history) {
    const to = h.to ?? null;
    if (!to) continue;
    if (last && to !== last) n++;
    last = to;
  }
  return n;
}
