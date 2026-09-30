// Who has a piece of work, in one record (UX-V2 §4.2 to §4.4, UI-V2 §8.5). Work has one named owner and moves as a
// whole: Take, Hand to, Park and Resume each write a new record, and the With chip says who has it now.
//
// The record (what the live layer stores in the field `own` of a work item, src/lib/live.mjs):
//
//   { s, to, kind, name?, at, by?, why?, wait?, park?, rule?, clock? }
//
//   s      ready    offered, nobody has taken it yet (to: who it is offered to, or null)
//          with     someone has it (kind person, team or vendor)
//          parked   its owner stopped part way and left a park card (park: { where, next, question })
//          waiting  it waits on something outside (wait: "parts (ETA Thu)")
//          auto     done automatically under a standing rule (rule: { name, owner })
//          unable   a standing rule was unable to complete and rolled back (rule)
//          done     finished
//   to     a person id, a team id or a vendor id; `name` for a team or vendor
//   at     when it became so; zoneless times are the data's local time, times with a zone come from a live change
//
// Pure: no data, no browser. The Home page (src/lib/home-client.mjs), WithChip.astro and the tests use it.

export const STATES = ['ready', 'with', 'parked', 'waiting', 'auto', 'unable', 'done'];
export const VERBS = { take: 'Take', hand: 'Hand to', park: 'Park', resume: 'Resume' };
// The chip's look for each case (UI-V2 §8.5): the key picks the fill and the mark.
export const CHIP_KEYS = ['ready', 'mine', 'person', 'team', 'vendor', 'waiting', 'parked', 'auto', 'unable', 'done'];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** A time as the chip says it: "07:54" when it is today, "25 Sep" before. `today` is the demo's day (YYYY-MM-DD).
    A zoneless time ("2026-09-28T07:54") is read as written; a time with a zone is a live change and is shown in the
    viewer's own clock, where "today" is the viewer's real day. */
export function clockWords(at, today, now = new Date()) {
  if (!at) return '';
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(at)) {
    const d = new Date(at);
    if (Number.isNaN(+d)) return '';
    const same = d.toDateString() === now.toDateString();
    return same ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${d.getDate()} ${MON[d.getMonth()]}`;
  }
  const [day, hm] = String(at).split('T');
  if (day === today && hm) return hm.slice(0, 5);
  const [, m, dd] = day.split('-');
  return `${+dd} ${MON[+m - 1]}`;
}

const firstName = (people, id) => {
  const p = people?.[id];
  return p ? (p.first ?? String(p.name ?? id).split(' ')[0]) : id;
};
const initialsOf = (people, id, name) => people?.[id]?.initials ?? String(name ?? id ?? '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

/** The With chip for a record, as the viewer sees it. Returns the key (the look), the words, the mark and a sentence
    for screen readers and the tooltip. `people` maps person ids to { name, first, initials }. */
export function chipOf(own, viewer, { people = {}, today = '' } = {}) {
  if (!own) return { key: 'ready', text: 'Ready to take', sub: '', mark: { t: 'none' }, aria: 'Ready to take: nobody has it yet' };
  const since = clockWords(own.at, today);
  const mine = own.to && own.to === viewer;
  const who = own.kind === 'person' || !own.kind ? (mine ? 'you' : firstName(people, own.to)) : own.name ?? own.to;
  const av = own.kind === 'team' ? { t: 'team' } : own.kind === 'vendor' ? { t: 'vendor' } : own.to ? { t: 'av', label: initialsOf(people, own.to, own.name), you: mine } : { t: 'none' };
  const rule = own.rule ? `${own.rule.name}${own.rule.owner ? ` (${firstName(people, own.rule.owner)})` : ''}` : 'a standing rule';
  switch (own.s) {
    case 'ready': {
      const text = !own.to ? 'Ready to take' : mine ? 'Ready for you' : `Ready for ${who}`;
      return { key: 'ready', text, sub: '', mark: av, aria: `${text}${since ? `, since ${since}` : ''}` };
    }
    case 'with': {
      const key = own.kind === 'team' ? 'team' : own.kind === 'vendor' ? 'vendor' : mine ? 'mine' : 'person';
      const text = `With ${who}${own.kind === 'vendor' ? ' (vendor)' : ''}`;
      const sub = own.kind === 'team' || own.kind === 'vendor' ? [own.why, own.clock ? `due ${own.clock}` : ''].filter(Boolean).join(' · ') : since ? `since ${since}` : '';
      return { key, text, sub, clock: own.clock ?? null, mark: av, aria: `${text}${sub ? `, ${sub}` : ''}${own.why && key !== 'team' && key !== 'vendor' ? `. Why: ${own.why}` : ''}` };
    }
    case 'parked': {
      const text = `Parked by ${who}`;
      return { key: 'parked', text, sub: since, mark: av, aria: `${text}${since ? ` at ${since}` : ''}` };
    }
    case 'waiting': {
      const text = `Waiting on: ${own.wait ?? 'something outside'}`;
      return { key: 'waiting', text, sub: '', mark: av, aria: `${text}. With ${who}` };
    }
    case 'auto': return { key: 'auto', text: 'Done automatically', sub: rule, mark: { t: 'rule' }, aria: `Done automatically under ${rule}` };
    case 'unable': return { key: 'unable', text: 'Unable to complete, rolled back', sub: rule, mark: { t: 'rule' }, aria: `Unable to complete, rolled back, under ${rule}` };
    case 'done': return { key: 'done', text: 'Done', sub: since, mark: av, aria: `Done${since ? ` at ${since}` : ''}` };
    default: return { key: 'ready', text: 'Ready to take', sub: '', mark: { t: 'none' }, aria: 'Ready to take' };
  }
}

/** The verbs the viewer can use on a record, in the order they show. The palette (⌘K) uses the same names. */
export function verbsFor(own, viewer, { desk = false } = {}) {
  if (!own || !viewer || viewer === 'everyone') return [];
  const mine = own.to === viewer;
  switch (own.s) {
    case 'ready': return mine || !own.to || desk ? ['take', 'hand'] : [];
    case 'with': return mine ? ['park', 'hand'] : desk ? ['take', 'hand'] : [];
    case 'parked': return mine ? ['resume', 'hand'] : [];
    case 'waiting': return mine ? ['hand'] : desk ? ['hand'] : [];
    default: return [];
  }
}

// ---- The verbs: each returns the next record. Nothing is lost: the park card stays on the record as `was`. ----
export const take = (own, who, at) => ({ s: 'with', to: who, kind: 'person', at, by: who });
/** Hand to a person, a team or a vendor. `target` is { id, kind, name? }. The reason is the one thing only the
    person handing over knows ("Why?"); it travels with the job. A vendor hand-off may carry the contract clock. */
export function handTo(own, target, why, who, at, { clock } = {}) {
  const r = { s: 'with', to: target.id, kind: target.kind ?? 'person', at, by: who };
  if (target.name) r.name = target.name;
  if (why) r.why = String(why).trim();
  if (clock) r.clock = clock;
  return r;
}
/** Park: three lines, each optional (UX-V2 §4.4). An empty card still parks, and says so. */
export function park(own, card, who, at) {
  const c = { where: (card?.where ?? '').trim(), next: (card?.next ?? '').trim(), question: (card?.question ?? '').trim() };
  return { s: 'parked', to: who, kind: 'person', at, by: who, park: c };
}
/** Resume: the job is yours again; the card is kept as `was` so the record opens with it above the timeline. */
export const resume = (own, who, at) => ({ s: 'with', to: who, kind: 'person', at, by: who, was: own?.park ?? null });

/** Apply a verb by name (the Home page and ⌘K call this). */
export function apply(verb, own, { who, at, target, why, card, clock } = {}) {
  if (verb === 'take') return take(own, who, at);
  if (verb === 'hand') return handTo(own, target, why, who, at, { clock });
  if (verb === 'park') return park(own, card, who, at);
  if (verb === 'resume') return resume(own, who, at);
  throw new Error(`Unknown verb: ${verb}`);
}

/** One line of the hand-off history for a record change ("Liam took it", "Handed to Network team: why"). */
export function historyLine(before, after, { people = {}, viewer = null } = {}) {
  const name = (id) => (id === viewer ? 'You' : people?.[id]?.name ?? id);
  const by = after?.by ? name(after.by) : null;
  const toName = after?.kind === 'person' || !after?.kind ? name(after?.to) : after?.name ?? after?.to;
  switch (after?.s) {
    case 'with':
      if (after.by && after.by === after.to && before?.s === 'parked') return `${by} resumed it`;
      if (after.by && after.by === after.to) return `${by} took it`;
      return `${by ?? 'Handed'} handed it to ${toName}${after.why ? `: ${after.why}` : ''}`;
    case 'parked': return `${by} parked it${after.park?.next ? `. Next: ${after.park.next}` : ''}`;
    case 'waiting': return `Waiting on ${after.wait ?? 'something outside'}`;
    case 'ready': return after.to ? `Offered to ${toName}` : 'Came in, nobody has it yet';
    case 'auto': return `Done automatically under ${after.rule?.name ?? 'a standing rule'}`;
    case 'unable': return `Unable to complete under ${after.rule?.name ?? 'a standing rule'}, rolled back`;
    case 'done': return `${by ?? 'Someone'} finished it`;
    default: return 'Changed';
  }
}

/** Is the record the viewer's to act on now (Ready for you, or With you, parked or waiting)? */
export const isMine = (own, viewer) => !!own && own.to === viewer && ['ready', 'with', 'parked', 'waiting'].includes(own.s);
/** Has the viewer got it (With you, parked or waiting), as opposed to offered? */
export const hasIt = (own, viewer) => !!own && own.to === viewer && ['with', 'parked', 'waiting'].includes(own.s);
