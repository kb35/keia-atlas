// Cross-reference checks for privacy records (schemas/ext/privacy-record.schema.yaml) and security support
// (device-model security_support, install units' default_password_changed).
//
// Privacy:
//   - a record covers real device classes, each of them a sensing class, and real sites;
//   - every installed sensing unit (in a position, or older kit still in place) is covered by exactly one
//     record for its class and site; spares in a store sense nothing and are not counted;
//   - a site in a country with works councils (WORKS_COUNCIL_COUNTRIES) needs a works-council agreement,
//     not "none".
// Security support:
//   - a date cited from a source names a source entry that exists;
//   - a firmware line that data/firmware/ tracks for the model uses that line's id;
//   - every model with firmware worth attacking (networked, or a camera or microphone) that is installed
//     somewhere has a security_support block.
//
// Each check returns { file, at, message } like the others in crossrefs.mjs.

import { SENSING_CLASSES, isSensing } from '../src/lib/privacy.mjs';

// Countries where staff have a works council (or cooperation committee) that must agree to monitoring.
export const WORKS_COUNCIL_COUNTRIES = ['AT', 'BE', 'DE', 'DK', 'FI', 'FR', 'LU', 'NL', 'NO', 'SE'];

// Classes whose models need security_support: networked classes (their profile has an addresses-and-DNS
// platform), plus network gateways, cameras and microphones.
export const needsSecuritySupport = (cls, classDoc) => Boolean(classDoc?.platforms?.dhcp_dns) || ['network-gateway', 'camera', 'microphone'].includes(cls);

export function crossCheckPrivacy(records) {
  const problems = [];
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const inFolder = (f) => records.filter((r) => r.folder === f);
  const sites = new Map(inFolder('sites').map((r) => [r.id, r.data]));
  const classes = new Map(inFolder('device-classes').map((r) => [r.id, r.data]));
  const spaceTypes = new Map(inFolder('space-types').map((r) => [r.id, r.data]));
  const spaces = new Map(inFolder('spaces').map((r) => [r.id, r.data]));
  const models = new Map(inFolder('device-models').map((r) => [r.id, r]));
  const privacy = inFolder('privacy');

  // The records themselves.
  for (const rec of privacy) {
    const { covers, works_council: wc } = rec.data;
    covers.classes.forEach((c, i) => {
      if (!classes.has(c)) report(rec, ['covers', 'classes', i], `device class "${c}" does not exist`);
      else if (!isSensing(c)) report(rec, ['covers', 'classes', i], `"${c}" is not a sensing class (${SENSING_CLASSES.join(', ')}); only sensing devices carry a privacy record`);
    });
    covers.sites.forEach((s, i) => {
      if (!sites.has(s)) report(rec, ['covers', 'sites', i], `site "${s}" does not exist`);
      else if (wc.none && WORKS_COUNCIL_COUNTRIES.includes(sites.get(s).country)) {
        report(rec, ['works_council'], `${sites.get(s).name} is in a country with works councils (${sites.get(s).country}): record the agreement (body, ref, date), not "none"`);
      }
    });
  }

  // Every installed sensing unit is covered by exactly one record; models in use have security support.
  const inUse = new Map();   // model id -> first install record that uses it
  for (const rec of inFolder('installs')) {
    const space = spaces.get(rec.data.space);
    if (!space) continue;   // reported by the main checks
    const option = spaceTypes.get(space.space_type)?.keia_atlas.options.find((o) => o.id === space.option);
    const cover = (cls, at, what) => {
      if (!isSensing(cls)) return;
      const hits = privacy.filter((p) => p.data.covers.classes.includes(cls) && p.data.covers.sites.includes(space.site));
      if (hits.length === 0) report(rec, at, `${what} is a sensing device (${cls}) at ${space.site}, but no privacy record in data/privacy/ covers ${cls} at that site`);
      else if (hits.length > 1) report(rec, at, `${what} is covered by ${hits.length} privacy records (${hits.map((h) => h.id).join(', ')}); a unit needs exactly one`);
    };
    rec.data.positions.forEach((p, i) => {
      const key = p.position.replace(/^[a-z]+-\d+\//, '').replace(/#\d+$/, '');
      const cls = option?.equipment.find((e) => e.key === key)?.class;
      cover(cls, ['positions', i], `${rec.data.space} / ${p.position}`);
      for (const m of [p.model, ...p.units.map((u) => u.model)]) if (m && !inUse.has(m)) inUse.set(m, rec);
    });
    (rec.data.older_kit ?? []).forEach((u, i) => {
      if (u.retired) return;
      cover(models.get(u.model)?.data.class, ['older_kit', i], `${rec.data.space} older unit ${u.asset_tag}`);
      if (!inUse.has(u.model)) inUse.set(u.model, rec);
    });
  }

  // Security support on models.
  const sourceIds = new Set(inFolder('sources').flatMap((r) => r.data.entries.map((e) => e.id)));
  const lines = inFolder('firmware').map((r) => r.data);
  for (const [id, rec] of models) {
    const ss = rec.data.security_support;
    const cls = rec.data.class;
    if (!ss) {
      if (inUse.has(id) && needsSecuritySupport(cls, classes.get(cls))) {
        report(rec, [], `${id} is installed and has firmware worth attacking (${cls}), so it needs security_support: the end date (cited, or demo: true), the firmware line and the maker's vulnerability contact`);
      }
      continue;
    }
    if (ss.ends.source && !sourceIds.has(ss.ends.source)) report(rec, ['security_support', 'ends', 'source'], `source "${ss.ends.source}" is not in data/sources/`);
    if (ss.vulnerability_contact?.source && !sourceIds.has(ss.vulnerability_contact.source)) report(rec, ['security_support', 'vulnerability_contact', 'source'], `source "${ss.vulnerability_contact.source}" is not in data/sources/`);
    const tracked = lines.find((l) => l.models.includes(id));
    if (tracked && ss.firmware_line !== tracked.id) report(rec, ['security_support', 'firmware_line'], `data/firmware/ tracks this model's firmware as "${tracked.id}"; use that id`);
  }
  return problems;
}
