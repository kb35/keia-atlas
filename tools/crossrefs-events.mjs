// Cross-reference checks for events and demo kit (schemas/ext/event.schema.yaml, schemas/ext/demo-kit.schema.yaml; the
// Events and experience centres service, src/lib/events.mjs):
//   events    the file is named after the id; the office and every room exist and the rooms are at that office; each
//             run of show item is in one of the event's rooms and ends after it starts, in order; the technician is an
//             on-site technician on the team; the room tests name the event's rooms; report faults are in its rooms
//             and name an incident that exists; a demo kit unit exists at the office, is never booked to two events
//             at once, and is checked in after it was checked out
//   demo kit  one file per office, named after it; the store it is kept in is a space at that office; its classes and
//             models exist; unit ids and label numbers are used once
// Each check returns { file, at, message } like the others in crossrefs.mjs.
import { PEOPLE } from '../src/lib/demo.mjs';
import { canBook } from '../src/lib/events.mjs';

export function crossCheckEvents(records) {
  const problems = [];
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const inFolder = (f) => records.filter((r) => r.folder === f);
  const ids = (f) => new Set(inFolder(f).map((r) => r.id));
  const sites = ids('sites'), classes = ids('device-classes'), models = ids('device-models');
  const spaces = new Map(inFolder('spaces').map((r) => [r.id, r.data]));
  const incidents = new Set(inFolder('incidents').map((r) => r.data.number));
  const kitBySite = new Map();

  for (const rec of inFolder('demo-kit')) {
    const d = rec.data;
    if (rec.id !== d.site) report(rec, ['site'], `file name "${rec.id}" must be the site id "${d.site}"`);
    if (!sites.has(d.site)) report(rec, ['site'], `site "${d.site}" does not exist`);
    const s = spaces.get(d.kept_in);
    if (!s) report(rec, ['kept_in'], `space "${d.kept_in}" does not exist`);
    else if (s.site !== d.site) report(rec, ['kept_in'], `space "${d.kept_in}" is not at ${d.site}`);
    const seen = new Set(), nums = new Set();
    d.units.forEach((u, i) => {
      if (seen.has(u.id)) report(rec, ['units', i, 'id'], `unit ${u.id} is listed twice`);
      if (nums.has(u.n)) report(rec, ['units', i, 'n'], `label number ${u.n} is used twice`);
      seen.add(u.id); nums.add(u.n);
      if (!classes.has(u.class)) report(rec, ['units', i, 'class'], `device class "${u.class}" does not exist`);
      if (u.model && !models.has(u.model)) report(rec, ['units', i, 'model'], `device model "${u.model}" does not exist`);
      if (u.battery && u.charge_pct == null) report(rec, ['units', i, 'charge_pct'], 'a unit with a battery needs its charge');
      if (!u.battery && u.charge_pct != null) report(rec, ['units', i, 'charge_pct'], 'a unit with no battery has no charge');
    });
    kitBySite.set(d.site, seen);
  }

  const techs = new Set(PEOPLE.filter((p) => p.roleId === 'tech' && !p.vendor).map((p) => p.id));
  const events = inFolder('events');
  const all = events.map((r) => r.data);
  for (const rec of events) {
    const d = rec.data;
    if (rec.id !== d.id.toLowerCase()) report(rec, ['id'], `file name "${rec.id}" must be the id in lower case, "${d.id.toLowerCase()}"`);
    if (!sites.has(d.site)) report(rec, ['site'], `site "${d.site}" does not exist`);
    if (d.end <= d.start) report(rec, ['end'], `the event ends (${d.end}) before it starts (${d.start})`);
    const rooms = new Set(d.rooms);
    d.rooms.forEach((r, i) => {
      const s = spaces.get(r);
      if (!s) report(rec, ['rooms', i], `space "${r}" does not exist`);
      else if (s.site !== d.site) report(rec, ['rooms', i], `space "${r}" is not at ${d.site}`);
    });
    if (!techs.has(d.technician)) report(rec, ['technician'], `"${d.technician}" is not an on-site technician on the team`);
    let last = d.start;
    d.agenda.forEach((a, i) => {
      if (!rooms.has(a.room)) report(rec, ['agenda', i, 'room'], `"${a.room}" is not one of the event's rooms`);
      if (a.until <= a.at) report(rec, ['agenda', i, 'until'], `the item ends before it starts`);
      if (a.at < last) report(rec, ['agenda', i, 'at'], `the item starts at ${a.at}, before the one above it ends (${last})`);
      if (a.at < d.start || a.until > d.end) report(rec, ['agenda', i], `the item is outside the event's hours (${d.start} to ${d.end})`);
      last = a.until;
    });
    for (const r of Object.keys(d.checks?.room_tests ?? {})) if (!rooms.has(r)) report(rec, ['checks', 'room_tests', r], `"${r}" is not one of the event's rooms`);
    (d.report?.faults ?? []).forEach((f, i) => {
      if (!rooms.has(f.room)) report(rec, ['report', 'faults', i, 'room'], `"${f.room}" is not one of the event's rooms`);
      if (f.incident && !incidents.has(f.incident)) report(rec, ['report', 'faults', i, 'incident'], `incident ${f.incident} does not exist`);
    });
    const kit = kitBySite.get(d.site) ?? new Set();
    (d.demo_kit ?? []).forEach((b, i) => {
      if (!kit.has(b.unit)) report(rec, ['demo_kit', i, 'unit'], `${b.unit} is not demo kit at ${d.site} (data/demo-kit/${d.site}.yaml)`);
      const c = canBook(b.unit, d, all);
      if (!c.ok) report(rec, ['demo_kit', i, 'unit'], `${b.unit} is also booked to ${c.clash} at the same time`);
      if (b.back && !b.out) report(rec, ['demo_kit', i, 'back'], 'checked in without being checked out');
      if (b.back && b.out && b.back < b.out) report(rec, ['demo_kit', i, 'back'], 'checked in before it was checked out');
    });
  }
  return problems;
}
