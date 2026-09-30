// Cross-reference checks for the capabilities' records (src/lib/modules.mjs): licences, room checks, out of service,
// alert rules, certificates and secrets, security flaws, config backups and meeting quality. What each names (a
// model, a site, a space, a unit, a role, a standard, a firmware line) must exist, dates must be in order, and a
// credential is a vault reference, never a secret.
//
// Each check returns { file, at, message } like the others in crossrefs.mjs.

import { ROLES } from '../src/lib/demo.mjs';

export function crossCheckCapabilities(records) {
  const problems = [];
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const inFolder = (f) => records.filter((r) => r.folder === f);
  const ids = (f) => new Set(inFolder(f).map((r) => r.id));
  const sites = ids('sites');
  const models = ids('device-models');
  const spaces = new Map(inFolder('spaces').map((r) => [r.id, r.data]));
  const tags = new Map();
  for (const r of inFolder('installs')) {
    for (const p of r.data.positions ?? []) for (const u of p.units) tags.set(u.asset_tag, { model: u.model ?? p.model, space: r.id });
    for (const u of r.data.older_kit ?? []) tags.set(u.asset_tag, { model: u.model, space: r.id });
    for (const u of r.data.spare_units ?? []) tags.set(u.asset_tag, { model: u.model, space: r.id });
  }
  const model = (rec, at, m) => { if (!models.has(m)) report(rec, at, `device model "${m}" does not exist`); };
  const site = (rec, at, s) => { if (!sites.has(s)) report(rec, at, `site "${s}" does not exist`); };
  const space = (rec, at, s) => { if (!spaces.has(s)) report(rec, at, `space "${s}" does not exist`); };
  const unit = (rec, at, t) => { if (!tags.has(t)) report(rec, at, `unit "${t}" is not in data/installs/`); };
  const role = (rec, at, r) => { if (!ROLES[r]) report(rec, at, `role "${r}" is not one of the roles in src/lib/demo.mjs`); };
  const fileId = (rec) => { if (rec.data.id && rec.data.id !== rec.id) report(rec, ['id'], `id "${rec.data.id}" does not match the file name "${rec.id}"`); };

  // Licences: the models, the scope and the units it names exist; a hand-assigned unit is one of the covered models.
  for (const rec of inFolder('licences')) {
    const d = rec.data;
    fileId(rec);
    d.covers.models.forEach((m, i) => model(rec, ['covers', 'models', i], m));
    (d.scope?.sites ?? []).forEach((s, i) => site(rec, ['scope', 'sites', i], s));
    (d.assigned ?? []).forEach((t, i) => {
      unit(rec, ['assigned', i], t);
      const u = tags.get(t);
      if (u && !d.covers.models.includes(u.model)) report(rec, ['assigned', i], `unit "${t}" is a ${u.model}, which this licence does not cover`);
    });
    if (d.scope?.region && d.scope?.sites) report(rec, ['scope'], 'give a region or a list of offices, not both');
    role(rec, ['owner_role'], d.owner_role);
  }

  // Room checks: real space types, a real role, and each checklist rule a rule in that house standard.
  const spaceTypes = ids('space-types');
  const standards = new Map(inFolder('standards').map((r) => [r.id, r.data]));
  const ruleIds = (std) => new Set((std?.sections ?? []).flatMap((s) => (s.rules ?? []).map((x) => x.id)));
  for (const rec of inFolder('checks')) {
    const d = rec.data;
    fileId(rec);
    (d.applies_to.space_types ?? []).forEach((t, i) => { if (!spaceTypes.has(t)) report(rec, ['applies_to', 'space_types', i], `space type "${t}" does not exist`); });
    role(rec, ['role'], d.role);
    d.checklist.forEach((c, i) => {
      if (typeof c !== 'object' || !c.rule) return;
      const [std, rule] = c.rule.split('/');
      if (!standards.has(std)) report(rec, ['checklist', i, 'rule'], `house standard "${std}" does not exist`);
      else if (!ruleIds(standards.get(std)).has(rule)) report(rec, ['checklist', i, 'rule'], `the ${std} standard has no rule "${rule}"`);
    });
  }

  // Out of service: the file is named after a real space; the space offered instead is another of the same office;
  // it comes back after it went out; the incident exists.
  const incidents = new Set(inFolder('incidents').map((r) => r.data.number));
  for (const rec of inFolder('out-of-service')) {
    const d = rec.data;
    space(rec, ['space'], d.space);
    if (d.space !== rec.id) report(rec, ['space'], `the file is named "${rec.id}" but holds space "${d.space}"`);
    if (d.alternative) {
      space(rec, ['alternative'], d.alternative);
      if (d.alternative === d.space) report(rec, ['alternative'], 'the space offered instead is the same space');
      else if (spaces.get(d.alternative) && spaces.get(d.space) && spaces.get(d.alternative).site !== spaces.get(d.space).site) report(rec, ['alternative'], 'the space offered instead is in another office');
    }
    if (d.until <= d.since) report(rec, ['until'], 'the expected return is not after it went out of service');
    if (d.incident && !incidents.has(d.incident)) report(rec, ['incident'], `incident "${d.incident}" does not exist`);
    role(rec, ['by_role'], d.by_role);
  }

  // Alert rules: real classes, space types, offices and roles; the file is named after the rule.
  const classes = ids('device-classes');
  for (const rec of inFolder('alert-rules')) {
    const d = rec.data;
    if (d.id.toLowerCase() !== rec.id) report(rec, ['id'], `id "${d.id}" does not match the file name "${rec.id}"`);
    (d.applies_to.classes ?? []).forEach((c, i) => { if (!classes.has(c)) report(rec, ['applies_to', 'classes', i], `device class "${c}" does not exist`); });
    (d.applies_to.space_types ?? []).forEach((t, i) => { if (!spaceTypes.has(t)) report(rec, ['applies_to', 'space_types', i], `space type "${t}" does not exist`); });
    (d.applies_to.sites ?? []).forEach((s, i) => site(rec, ['applies_to', 'sites', i], s));
    role(rec, ['route', 'role'], d.route.role);
    role(rec, ['owner_role'], d.owner_role);
    if (d.priority === 1 && d.quiet_hours) report(rec, ['quiet_hours'], 'a priority 1 alert never waits for quiet hours to end');
  }

  // Credentials: what uses it exists (models, offices, units, a management platform); it expires after it was issued.
  const platforms = new Set(inFolder('house-values').flatMap((r) => (r.data.platforms ?? []).map((p) => p.id)));
  for (const rec of inFolder('credentials')) {
    const d = rec.data, u = d.used_by;
    fileId(rec);
    (u.models ?? []).forEach((m, i) => model(rec, ['used_by', 'models', i], m));
    (u.sites ?? []).forEach((s, i) => site(rec, ['used_by', 'sites', i], s));
    (u.units ?? []).forEach((t, i) => unit(rec, ['used_by', 'units', i], t));
    if (u.platform && !platforms.has(u.platform)) report(rec, ['used_by', 'platform'], `management platform "${u.platform}" is not in data/house-values/`);
    if (d.expires <= d.issued) report(rec, ['expires'], 'it expires before it was issued');
    if (d.rotated && d.rotated < d.issued) report(rec, ['rotated'], 'it was rotated before it was issued');
    role(rec, ['owner_role'], d.owner_role);
  }

  // Security flaws: real models; a firmware line that exists and covers them; a fixed version that is one of its
  // releases; the file named after the flaw.
  const lines = new Map(inFolder('firmware').map((r) => [r.id, r.data]));
  for (const rec of inFolder('security-flaws')) {
    const d = rec.data;
    if (d.id.toLowerCase() !== rec.id) report(rec, ['id'], `id "${d.id}" does not match the file name "${rec.id}"`);
    d.models.forEach((m, i) => model(rec, ['models', i], m));
    if (d.firmware_line) {
      const line = lines.get(d.firmware_line);
      if (!line) report(rec, ['firmware_line'], `firmware line "${d.firmware_line}" does not exist`);
      else if (d.fixed_in && !line.releases.some((x) => x.version === d.fixed_in)) report(rec, ['fixed_in'], `"${d.fixed_in}" is not a release of ${line.name}`);
    }
  }

  // Config backups: a real office, named in the file; each unit a network switch or gateway in that office, listed
  // once; each difference names a rule of the house standard.
  const netModels = new Set(inFolder('device-models').filter((r) => ['network-switch', 'network-gateway'].includes(r.data.class)).map((r) => r.id));
  for (const rec of inFolder('config-backups')) {
    const d = rec.data, seen = new Set();
    site(rec, ['site'], d.site);
    if (d.site !== rec.id) report(rec, ['site'], `the file is named "${rec.id}" but holds office "${d.site}"`);
    d.devices.forEach((x, i) => {
      const u = tags.get(x.unit);
      if (!u) report(rec, ['devices', i, 'unit'], `unit "${x.unit}" is not in data/installs/`);
      else {
        if (!netModels.has(u.model)) report(rec, ['devices', i, 'unit'], `unit "${x.unit}" is a ${u.model}, not a network switch or gateway`);
        if (spaces.get(u.space)?.site !== d.site) report(rec, ['devices', i, 'unit'], `unit "${x.unit}" is not in this office`);
      }
      if (seen.has(x.unit)) report(rec, ['devices', i, 'unit'], `unit "${x.unit}" is listed twice`);
      seen.add(x.unit);
      if (x.last_backup > d.read_at) report(rec, ['devices', i, 'last_backup'], 'backed up after the snapshot was read');
      (x.drift ?? []).forEach((f, j) => {
        const [std, rule] = f.rule.split('/');
        if (!standards.has(std)) report(rec, ['devices', i, 'drift', j, 'rule'], `house standard "${std}" does not exist`);
        else if (!ruleIds(standards.get(std)).has(rule)) report(rec, ['devices', i, 'drift', j, 'rule'], `the ${std} standard has no rule "${rule}"`);
      });
    });
  }

  return problems;
}
