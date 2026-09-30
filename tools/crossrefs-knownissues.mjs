// Cross-reference checks for known issues and maker cases (decision 0029).
//
// A schema checks one file on its own. These make sure a maker's feed and a maker case point at real things,
// and that the data stays honest about where it came from:
//
//   - a feed's file name is its id; its vendor is a manufacturer in data/vendors; its firmware line exists;
//   - every model, advisory and source an issue names exists, and every symptom is in a device profile's guide;
//   - an exact version (no "x") in a feed tied to a firmware line is a release in that line;
//   - Fixed says what fixes it (fixed_in); Open and Won't fix don't;
//   - issue ids are unique across every feed;
//   - made-up data says so: a demo feed's issues are all demo and cite demo sources, and a real feed cites no
//     demo source;
//   - a maker case names a real feed, models, incidents and people, a known issue from its own maker, and its
//     status is the last status in its history, which runs oldest first.
//
// Each check returns { file, at, message } like the others in crossrefs.mjs.

import path from 'node:path';
import { LAST_MOMENT } from './crossrefs-incidents.mjs';

export function crossCheckKnownIssues(records, { people }) {
  const problems = [];
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const inFolder = (folder) => records.filter((r) => r.folder === folder);
  const modelIds = new Set(inFolder('device-models').map((r) => r.id));
  const vendors = new Map(inFolder('vendors').map((r) => [r.data.id, r.data]));
  const firmware = new Map(inFolder('firmware').map((r) => [r.data.id, r.data]));
  const advIds = new Set(inFolder('advisories').map((r) => r.data.id));
  const sources = new Map(inFolder('sources').flatMap((r) => r.data.entries.map((e) => [e.id, e])));
  const incidents = new Set(inFolder('incidents').map((r) => r.data.number));
  const symptoms = new Set(inFolder('device-classes').flatMap((r) => Object.keys(r.data.discrimination ?? {})));
  const needModel = (rec, at, m) => { if (!modelIds.has(m)) report(rec, at, `device model "${m}" does not exist`); };
  const needSource = (rec, at, id) => { if (id && !sources.has(id)) report(rec, at, `source "${id}" is not in data/sources`); };
  const who = (rec, at, id) => { if (id && !people.has(id)) report(rec, at, `person "${id}" is not one of the demo people`); };

  const issueOwner = new Map();   // issue id -> feed id
  for (const rec of inFolder('known-issues')) {
    const d = rec.data;
    if (rec.id !== d.id) report(rec, ['id'], `id "${d.id}" must match the file name "${path.basename(rec.file, '.yaml')}"`);
    if (d.vendor) {
      const v = vendors.get(d.vendor);
      if (!v) report(rec, ['vendor'], `vendor "${d.vendor}" is not in data/vendors`);
      else if (v.kind !== 'manufacturer') report(rec, ['vendor'], `vendor "${d.vendor}" is not a manufacturer`);
    }
    if (!d.vendor && !d.support) report(rec, [], 'a feed with no vendor record must say how to raise a case with the maker (support)');
    const line = d.firmware ? firmware.get(d.firmware) : null;
    if (d.firmware && !line) report(rec, ['firmware'], `firmware line "${d.firmware}" does not exist`);
    const releases = new Set((line?.releases ?? []).map((r) => r.version));
    const exact = (v) => !/x/i.test(v);
    (d.follows?.models ?? []).forEach((m, i) => needModel(rec, ['follows', 'models', i], m));
    if (d.follows) needSource(rec, ['follows', 'source'], d.follows.source);

    d.issues.forEach((it, i) => {
      const at = ['issues', i];
      if (issueOwner.has(it.id)) report(rec, [...at, 'id'], `known issue "${it.id}" is already in ${issueOwner.get(it.id)}`);
      issueOwner.set(it.id, d.id);
      if (it.ref && it.ref !== it.id) report(rec, [...at, 'ref'], `a known issue with the maker's reference ${it.ref} uses it as its id`);
      it.models.forEach((m, j) => needModel(rec, [...at, 'models', j], m));
      (it.needs?.with_models ?? []).forEach((m, j) => needModel(rec, [...at, 'needs', 'with_models', j], m));
      if (!it.models.length && !it.maker_models?.length) report(rec, [...at, 'models'], 'a known issue names at least one model (models or maker_models)');
      (it.symptoms ?? []).forEach((s, j) => { if (!symptoms.has(s)) report(rec, [...at, 'symptoms', j], `symptom "${s}" is not in any device profile's guide`); });
      (it.signs ?? []).forEach((s, j) => { if (s !== s.toLowerCase()) report(rec, [...at, 'signs', j], `sign "${s}" must be lower case`); });
      if (it.advisory && !advIds.has(it.advisory)) report(rec, [...at, 'advisory'], `advisory "${it.advisory}" does not exist`);
      needSource(rec, [...at, 'source'], it.source);
      if (it.status === 'fixed' && !it.fixed_in) report(rec, [...at, 'fixed_in'], 'a fixed known issue says which version fixes it (fixed_in)');
      if (it.status !== 'fixed' && it.fixed_in) report(rec, [...at, 'fixed_in'], `only a fixed known issue has fixed_in (this one is ${it.status})`);
      if (line) {
        it.affected.forEach((v, j) => { if (exact(v) && !releases.has(v)) report(rec, [...at, 'affected', j], `${v} is not a release of ${d.firmware}`); });
        if (it.fixed_in && exact(it.fixed_in) && !releases.has(it.fixed_in)) report(rec, [...at, 'fixed_in'], `${it.fixed_in} is not a release of ${d.firmware}`);
      }
      // Honest about what is made up.
      const srcCat = sources.get(it.source)?.category;
      if (d.demo && !it.demo) report(rec, [...at], 'every issue in a demo feed says demo: true');
      if (it.demo && srcCat && srcCat !== 'demo') report(rec, [...at, 'source'], `a made-up issue cites a demo source, not "${it.source}"`);
      if (!it.demo && srcCat === 'demo') report(rec, [...at, 'source'], `"${it.source}" is a demo source; the issue must say demo: true`);
    });
  }

  for (const rec of inFolder('maker-cases')) {
    const d = rec.data;
    if (rec.id !== d.id.toLowerCase()) report(rec, ['id'], `file name "${path.basename(rec.file)}" must be the id in lower case, ${d.id.toLowerCase()}.yaml`);
    const feed = inFolder('known-issues').find((r) => r.data.id === d.maker)?.data;
    if (!feed) report(rec, ['maker'], `maker "${d.maker}" is not a feed in data/known-issues`);
    d.models.forEach((m, i) => needModel(rec, ['models', i], m));
    (d.incidents ?? []).forEach((n, i) => { if (!incidents.has(n)) report(rec, ['incidents', i], `incident ${n} does not exist`); });
    if (d.known_issue) {
      const owner = issueOwner.get(d.known_issue);
      if (!owner) report(rec, ['known_issue'], `known issue "${d.known_issue}" does not exist`);
      else if (owner !== d.maker) report(rec, ['known_issue'], `known issue "${d.known_issue}" is in the ${owner} feed, not ${d.maker}`);
    }
    who(rec, ['raised_by'], d.raised_by); who(rec, ['owner'], d.owner);
    let last = null;
    d.history.forEach((h, i) => {
      who(rec, ['history', i, 'by'], h.by);
      if (i > 0 && h.at < d.history[i - 1].at) report(rec, ['history', i, 'at'], `${h.at} is before the entry above it; entries go oldest first`);
      if (h.at > LAST_MOMENT) report(rec, ['history', i, 'at'], `${h.at} is in the future`);
      if (!h.by && !h.maker) report(rec, ['history', i], 'each entry says who: by (a demo person) or maker: true');
      if (h.status) last = h.status;
    });
    if (d.history[0]?.status !== 'sent') report(rec, ['history', 0, 'status'], 'the first entry is the case being sent');
    if (last && last !== d.status) report(rec, ['status'], `status is ${d.status}, but the last status in history is ${last}`);
    if (d.history[0] && d.raised !== d.history[0].at.slice(0, 10)) report(rec, ['raised'], `raised is ${d.raised}, but the case was sent on ${d.history[0].at.slice(0, 10)}`);
  }
  return problems;
}
