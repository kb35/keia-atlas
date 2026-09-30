// Standards coverage: is every "must" rule carried by a record?
//
// A rule in data/standards/ says how it is proved in `record` (schemas/ext/house-standard.schema.yaml):
//   - a record field, as folder:key.path ("sites:change_window", "installs:warranty.ends"): the proof is a fact
//     Keia Atlas keeps. The path is a chain of keys, found anywhere in a record of that folder; lists are passed
//     through, so "runs:test.margin_db" finds the margin on any run's test.
//   - on-site: proved on site or in the handover pack (a measurement, a photo, a test certificate).
//   - connect: read from the system that runs it (the controller, fleet management, monitoring) by a connector.
// A rule may name several. VLANs were written as a rule that no record carried, so no page could show them; this
// check lists every such rule, so the next one is caught by a script and not by a person.
//
// It is a report, not a failure: a rule can be written before the field exists, and the list says what is still
// to build. docs/rules/gaps.md keeps the current list.

export const PROOF = { 'on-site': 'proved on site or in the handover pack', connect: 'read from the system that runs it' };

/** True when some part of `node` has the chain of keys `path` (lists passed through). */
export function carries(node, path) {
  if (!path.length) return node !== undefined && node !== null;
  if (Array.isArray(node)) return node.some((n) => carries(n, path));
  if (!node || typeof node !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(node, path[0]) && follow(node[path[0]], path.slice(1))) return true;
  return Object.values(node).some((v) => v && typeof v === 'object' && carries(v, path));
}
// Follow the rest of a chain from a key that matched: it must continue right here, not anywhere below.
function follow(node, rest) {
  if (!rest.length) return node !== undefined && node !== null;
  if (Array.isArray(node)) return node.some((n) => follow(n, rest));
  if (!node || typeof node !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(node, rest[0]) && follow(node[rest[0]], rest.slice(1));
}

/** Split "installs:warranty.ends" into its folder and key chain; null for on-site and connect. */
export function parseRef(ref) {
  const m = /^([a-z0-9-]+):([a-z0-9_]+(?:\.[a-z0-9_]+)*)$/.exec(ref);
  return m ? { folder: m[1], path: m[2].split('.') } : null;
}

/**
 * The coverage report. `records` are the validated records ({ folder, rel, data }), as the validator keeps them.
 * `folders`, when given, is every folder the registry knows: a field in any other folder is a typo, returned in
 * `unknown` (the validator makes that an error, since no record could ever carry it).
 * Returns { missing, untied, unknown, counts }:
 *   missing  must rules that name a field no record of that folder carries (the list to act on)
 *   untied   must rules that say nothing about their proof (record left out): not yet known
 *   counts   how many must rules are carried by a record, proved on site, read by a connector, missing, untied
 */
export function standardsCoverage(records, folders = null) {
  const byFolder = new Map();
  for (const r of records) { if (!byFolder.has(r.folder)) byFolder.set(r.folder, []); byFolder.get(r.folder).push(r.data); }
  const seen = new Map();
  const has = (ref) => {
    if (!seen.has(ref)) { const p = parseRef(ref); seen.set(ref, !!p && (byFolder.get(p.folder) ?? []).some((d) => carries(d, p.path))); }
    return seen.get(ref);
  };
  const missing = [], untied = [], unknown = [];
  const counts = { must: 0, carried: 0, 'on-site': 0, connect: 0, missing: 0, untied: 0 };
  for (const rec of records.filter((r) => r.folder === 'standards' && Array.isArray(r.data?.sections))) {
    for (const [si, s] of rec.data.sections.entries()) {
      for (const [ri, rule] of (s.rules ?? []).entries()) {
        if (rule.level !== 'must') continue;
        counts.must += 1;
        const at = ['sections', si, 'rules', ri];
        const refs = rule.record == null ? [] : [].concat(rule.record);
        if (!refs.length) { counts.untied += 1; untied.push({ standard: rec.data.id, rule: rule.id, text: rule.rule, check: rule.check, file: rec.rel, at }); continue; }
        const fields = refs.filter((x) => !PROOF[x]);
        for (const [k, x] of refs.entries()) {
          const p = parseRef(x);
          if (p && folders && !folders.has(p.folder)) unknown.push({ file: rec.rel, at: [...at, 'record', ...(Array.isArray(rule.record) ? [k] : [])], message: `record "${x}": there is no data folder "${p.folder}" (schemas/registry.yaml)` });
        }
        const gone = fields.filter((x) => !has(x));
        if (gone.length) { counts.missing += 1; missing.push({ standard: rec.data.id, rule: rule.id, text: rule.rule, check: rule.check, fields: gone, file: rec.rel, at: [...at, 'record'] }); }
        else if (fields.length) counts.carried += 1;
        else if (refs.includes('connect')) counts.connect += 1;
        else counts['on-site'] += 1;
      }
    }
  }
  return { missing, untied, unknown, counts };
}

/** The report as lines a person can read, for the validator's command line. */
export function coverageLines(cov) {
  const c = cov.counts;
  const out = [`Standards coverage (a report, not a failure): ${c.must} must rules; ${c.carried} carried by a record, ${c['on-site']} proved on site, ${c.connect} read by a connector.`];
  if (cov.missing.length) {
    out.push(`  ${cov.missing.length} must rule${cov.missing.length === 1 ? ' checks a field' : 's check a field'} that no record carries, so no page can show it:`);
    for (const m of cov.missing) out.push(`    ${m.standard}/${m.rule}  needs ${m.fields.join(', ')}`);
  } else out.push('  Every must rule that names a field is carried by a record.');
  if (cov.untied.length) {
    out.push(`  ${cov.untied.length} must rule${cov.untied.length === 1 ? ' does' : 's do'} not say how it is proved (add record: a field, on-site or connect):`);
    for (const u of cov.untied) out.push(`    ${u.standard}/${u.rule}`);
  }
  return out;
}
