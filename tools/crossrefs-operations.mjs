// Cross-reference checks for the records a team runs on day to day.
//
// A unit's purchase, warranty and support cover (schemas/ext/install.schema.yaml):
//   - support names a vendor in data/vendors/; a service vendor's contract must list the unit's model;
//   - the warranty ends after the unit was bought, and a unit is bought on or before it is installed (or arrives).
// On call (schemas/ext/on-call.schema.yaml):
//   - one rota per region; it covers sites of that region, and every site belongs to one rota;
//   - everyone named is on the team (src/lib/demo.mjs) and not a vendor; nobody backs themselves up;
//   - the weeks follow on, seven days apart, each starting on the handover day.
// A comms room's power and temperature (schemas/ext/space.schema.yaml): on comms rooms only; feeds A and B once each,
// never one circuit. An internet circuit's contract renews after it starts. An office's hours close after they open,
// a change window closes at another time than it opens, and neither is on a remote site.
//
// Each check returns { file, at, message } like the others in crossrefs.mjs.
import { PEOPLE } from '../src/lib/demo.mjs';

export function crossCheckOperations(records) {
  const problems = [];
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const inFolder = (f) => records.filter((r) => r.folder === f);
  const vendors = new Map(inFolder('vendors').map((r) => [r.id, r.data]));

  // A unit's purchase, warranty and support.
  const checkUnit = (rec, at, u, model, started) => {
    if (u.support) {
      const v = vendors.get(u.support);
      if (!v) report(rec, [...at, 'support'], `support "${u.support}" is not a vendor in data/vendors`);
      else if (v.kind === 'service' && v.contract?.covers_models && !v.contract.covers_models.includes(model)) {
        report(rec, [...at, 'support'], `${v.name}'s contract does not list ${model ?? 'this unit\'s model'} (contract.covers_models)`);
      }
    }
    if (u.purchase && u.warranty && u.warranty.ends <= u.purchase.date) report(rec, [...at, 'warranty', 'ends'], `the warranty ends (${u.warranty.ends}) before the unit was bought (${u.purchase.date})`);
    if (u.purchase && started && u.purchase.date > started) report(rec, [...at, 'purchase', 'date'], `bought on ${u.purchase.date}, after it was installed or arrived (${started})`);
  };
  for (const rec of inFolder('installs')) {
    (rec.data.positions ?? []).forEach((p, i) => p.units.forEach((u, j) => checkUnit(rec, ['positions', i, 'units', j], u, u.model ?? p.model, u.installed)));
    (rec.data.spare_units ?? []).forEach((u, i) => checkUnit(rec, ['spare_units', i], u, u.model, u.arrived));
  }

  // On call.
  const people = new Map(PEOPLE.map((p) => [p.id, p]));
  const sites = new Map(inFolder('sites').map((r) => [r.id, r.data]));
  const regions = new Map();
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const staff = (rec, at, id) => {
    const p = people.get(id);
    if (!p) report(rec, at, `"${id}" is not on the team (src/lib/demo.mjs)`);
    else if (p.vendor) report(rec, at, `${p.name} works for a vendor, and a vendor is never on Aigna's rota`);
  };
  for (const rec of inFolder('on-call')) {
    const d = rec.data;
    if (regions.has(d.region)) report(rec, ['region'], `${d.region} already has a rota (${regions.get(d.region)})`);
    regions.set(d.region, rec.rel);
    d.covers.forEach((sid, i) => {
      const s = sites.get(sid);
      if (!s) report(rec, ['covers', i], `"${sid}" is not a site`);
      else if (s.region !== d.region) report(rec, ['covers', i], `${s.name} is in ${s.region}, not ${d.region}`);
    });
    staff(rec, ['escalate_to'], d.escalate_to);
    d.weeks.forEach((w, i) => {
      staff(rec, ['weeks', i, 'person'], w.person);
      staff(rec, ['weeks', i, 'backup'], w.backup);
      if (w.person === w.backup) report(rec, ['weeks', i, 'backup'], 'the backup must be someone else');
      if (DAYS[new Date(`${w.from}T00:00:00Z`).getUTCDay()] !== d.handover.day) report(rec, ['weeks', i, 'from'], `${w.from} is not a ${d.handover.day}, the handover day`);
      const prev = d.weeks[i - 1];
      if (prev && (new Date(`${w.from}T00:00:00Z`) - new Date(`${prev.from}T00:00:00Z`)) / 864e5 !== 7) report(rec, ['weeks', i, 'from'], `the weeks must follow on, seven days apart (${prev.from} to ${w.from})`);
    });
  }
  if (regions.size) {
    const covered = new Set(inFolder('on-call').flatMap((r) => r.data.covers));
    for (const [sid, s] of sites) if (s.region && regions.has(s.region) && !covered.has(sid)) {
      const rec = inFolder('on-call').find((r) => r.data.region === s.region);
      report(rec, ['covers'], `${s.name} (${sid}) is in ${s.region} but no rota covers it`);
    }
  }

  // A comms room's power and temperature record belongs to a comms room.
  for (const rec of inFolder('spaces')) {
    const d = rec.data;
    for (const k of ['power', 'environment']) if (d[k] && !['mdf', 'idf'].includes(d.space_type)) report(rec, [k], `${k} is recorded for comms rooms only; ${d.name} is a ${d.space_type}`);
    const feeds = d.power?.feeds ?? [];
    if (new Set(feeds.map((f) => f.feed)).size !== feeds.length) report(rec, ['power', 'feeds'], 'each feed (A, B) is listed once');
    if (feeds.length === 2 && feeds[0].board === feeds[1].board && feeds[0].way === feeds[1].way) report(rec, ['power', 'feeds'], 'feeds A and B share one circuit, so they are not two feeds');
  }

  // An internet circuit's contract renews after it starts; an office's change window opens and closes at different times.
  for (const rec of inFolder('circuits')) {
    rec.data.circuits.forEach((c, i) => {
      if (c.contract?.start && c.contract.renews <= c.contract.start) report(rec, ['circuits', i, 'contract', 'renews'], `the contract renews (${c.contract.renews}) before it starts (${c.contract.start})`);
    });
  }
  for (const [sid, s] of sites) {
    const rec = inFolder('sites').find((r) => r.id === sid);
    if (s.change_window && s.change_window.from === s.change_window.to) report(rec, ['change_window', 'to'], 'the change window must close at a different time from when it opens');
    if (s.office_hours && s.office_hours.close <= s.office_hours.open) report(rec, ['office_hours', 'close'], 'the office must close after it opens');
    if ((s.office_hours || s.change_window) && s.kind !== 'office') report(rec, [s.office_hours ? 'office_hours' : 'change_window'], 'office hours and a change window are for offices; a home office keeps its person\'s hours');
  }

  return problems;
}
