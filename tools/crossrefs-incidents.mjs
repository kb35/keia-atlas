// Cross-reference and lifecycle checks for incidents (decision 0024).
//
// A schema checks one ticket on its own shape. These checks make sure the ticket points at something
// real (the room, the position in that room's install, the unit at that position, the symptom in the
// device profile's guide, the people and tasks it names) and that its history tells a possible story:
//
//   - the first entry opens the ticket as New, at the time it was opened;
//   - entries are in time order, and none is after the demo's today;
//   - nothing goes back to New, and a state entry changes the state;
//   - On hold says why (hold_reason), and only On hold does;
//   - Resolved says how (a resolution code and notes), and only Resolved does;
//   - after Resolved the only way on is back to In progress (a reopen), and a reopen says why in a note;
//   - a state change says who made it;
//   - the ticket's state is the state of its last state entry.
//
// Each check returns { file, at, message } like the others in crossrefs.mjs.

import path from 'node:path';

// The last moment a history entry may have: the end of the demo's today (DEMO_TODAY in src/lib/data.mjs).
export const LAST_MOMENT = '2026-09-28T23:59';
export const STATE_LABEL = { new: 'New', 'in-progress': 'In progress', 'on-hold': 'On hold', resolved: 'Resolved' };

// Priority (a proposal a person may change): the priority in force is the override's when there is one,
// otherwise the proposal; an override changes something and says why, after the ticket was opened and not
// in the future. Returns [{ at, message }].
export function checkPriority({ priority, priority_proposed: proposed, priority_override: o, opened }) {
  const out = [];
  const effective = o ? o.priority : proposed;
  if (priority !== effective) out.push({ at: ['priority'], message: o ? `a person changed the priority to ${o.priority}, so priority must be ${o.priority}, not ${priority}` : `priority must equal priority_proposed (${proposed}) unless priority_override says who changed it and why` });
  if (o && o.priority === proposed) out.push({ at: ['priority_override', 'priority'], message: `the override sets P${o.priority}, which is already the proposal; remove the override` });
  if (o && opened && o.at < opened) out.push({ at: ['priority_override', 'at'], message: `the change at ${o.at} is before the ticket was opened (${opened})` });
  if (o && o.at > LAST_MOMENT) out.push({ at: ['priority_override', 'at'], message: `${o.at} is in the future` });
  return out;
}

// The lifecycle rules on their own, so tests can call them directly. Returns [{ at, message }], where
// `at` is the path inside the incident (['history', 3, 'state']).
export function checkLifecycle({ opened, state, history }) {
  const out = [];
  const say = (at, message) => out.push({ at, message });
  if (!history?.length) { say(['history'], 'an incident needs at least one history entry'); return out; }
  const first = history[0];
  if (first.state !== 'new') say(['history', 0, 'state'], 'the first history entry must open the ticket as New');
  if (first.at !== opened) say(['history', 0, 'at'], `the first history entry is at ${first.at}, but the ticket was opened at ${opened}`);
  let now = null;
  history.forEach((h, i) => {
    const at = ['history', i];
    if (i > 0 && h.at < history[i - 1].at) say([...at, 'at'], `${h.at} is before the entry above it (${history[i - 1].at}); entries go oldest first`);
    if (h.at > LAST_MOMENT) say([...at, 'at'], `${h.at} is in the future`);
    if (h.hold_reason && h.state !== 'on-hold') say([...at, 'hold_reason'], 'only an On hold entry has a hold reason');
    if (h.resolution && h.state !== 'resolved') say([...at, 'resolution'], 'only a Resolved entry has a resolution');
    if (!h.state) return;
    if (i > 0 && !h.by && !h.person) say(at, `the move to ${STATE_LABEL[h.state]} doesn't say who made it (by or person)`);
    if (i > 0 && h.state === 'new') say([...at, 'state'], 'a ticket cannot go back to New');
    else if (h.state === now) say([...at, 'state'], `the ticket is already ${STATE_LABEL[h.state]}; a state entry must change the state`);
    if (h.state === 'on-hold' && !h.hold_reason) say(at, 'On hold needs a hold_reason (awaiting-caller, awaiting-vendor, awaiting-change or awaiting-parts)');
    if (h.state === 'resolved' && !h.resolution) say(at, 'Resolved needs a resolution with a code and notes');
    if (now === 'resolved' && h.state !== 'new' && h.state !== 'resolved') {
      if (h.state !== 'in-progress') say([...at, 'state'], `a resolved ticket can only be reopened to In progress, not ${STATE_LABEL[h.state]}`);
      else if (!h.note) say(at, 'reopening a resolved ticket needs a note saying why');
    }
    now = h.state;
  });
  if (now && state !== now) say(['state'], `state is ${STATE_LABEL[state] ?? state}, but the last state in history is ${STATE_LABEL[now]}`);
  return out;
}

export function crossCheckIncidents(records, { people, taskIds }) {
  const problems = [];
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const inFolder = (folder) => records.filter((r) => r.folder === folder);
  const spaces = new Map(inFolder('spaces').map((r) => [r.id, r.data]));
  const installs = new Map(inFolder('installs').map((r) => [r.data.space, r.data]));
  const spaceTypes = new Map(inFolder('space-types').map((r) => [r.id, r.data]));
  const classes = new Map(inFolder('device-classes').map((r) => [r.id, r.data]));
  const who = (rec, at, id) => { if (id && !people.has(id)) report(rec, at, `person "${id}" is not one of the demo people`); };
  const numbers = new Map();

  for (const rec of inFolder('incidents')) {
    const d = rec.data;
    if (rec.id !== d.number.toLowerCase()) report(rec, ['number'], `file name "${path.basename(rec.file)}" must be the number in lower case, ${d.number.toLowerCase()}.yaml`);
    if (numbers.has(d.number)) report(rec, ['number'], `incident ${d.number} is already in ${numbers.get(d.number)}`);
    numbers.set(d.number, rec.id);

    // What it is about: a real room, and for a device, a real position and the unit at it.
    const { subject } = d;
    const space = spaces.get(subject.room);
    let cls = null;
    if (subject.kind === 'device' && (!subject.position || !subject.device)) report(rec, ['subject'], 'an incident about a device needs both its position and its asset tag (device)');
    if (subject.kind === 'room' && (subject.position || subject.device)) report(rec, ['subject'], 'an incident about a whole room names no position or device; make it kind: device instead');
    if (!space) report(rec, ['subject', 'room'], `room "${subject.room}" does not exist`);
    else if (subject.kind === 'device' && subject.position) {
      const pos = installs.get(subject.room)?.positions.find((p) => p.position === subject.position);
      if (!pos) report(rec, ['subject', 'position'], `"${subject.position}" is not a position in ${subject.room}'s install`);
      else if (subject.device && !pos.units.some((u) => u.asset_tag === subject.device)) {
        report(rec, ['subject', 'device'], `asset tag ${subject.device} is not a unit at ${subject.room} / ${subject.position} (${pos.units.map((u) => u.asset_tag).join(', ')})`);
      }
      const key = subject.position.replace(/^[a-z]+-\d+\//, '').replace(/#\d+$/, '');
      const option = spaceTypes.get(space.space_type)?.keia_atlas.options.find((o) => o.id === space.option);
      cls = option?.equipment.find((e) => e.key === key)?.class ?? null;
    }
    if (d.keia_atlas.symptom) {
      if (subject.kind !== 'device') report(rec, ['keia_atlas', 'symptom'], 'a symptom belongs to a device; this incident is about a whole room');
      else if (classes.has(cls) && !classes.get(cls).discrimination?.[d.keia_atlas.symptom]) {
        report(rec, ['keia_atlas', 'symptom'], `symptom "${d.keia_atlas.symptom}" is not in the ${cls} profile's guide (${Object.keys(classes.get(cls)?.discrimination ?? {}).join(', ') || 'none'})`);
      }
    }

    // Priority is proposed; a person may change it, and the priority in force says which.
    for (const p of checkPriority(d)) report(rec, p.at, p.message);
    if (d.priority_override) who(rec, ['priority_override', 'by'], d.priority_override.by);

    // The lifecycle.
    for (const p of checkLifecycle(d)) report(rec, p.at, p.message);
    d.history.forEach((h, i) => who(rec, ['history', i, 'by'], h.by));

    // People and linked work.
    who(rec, ['keia_atlas', 'assigned'], d.keia_atlas.assigned);
    (d.keia_atlas.related ?? []).forEach((r, i) => { if (/^T-/.test(r) && !taskIds.has(r)) report(rec, ['keia_atlas', 'related', i], `task "${r}" does not exist`); });
  }
  return problems;
}
