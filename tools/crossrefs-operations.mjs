// Cross-reference checks for the records a team runs on day to day: a unit's purchase, warranty and support cover
// (schemas/ext/install.schema.yaml).
//
//   - support names a vendor in data/vendors/; a service vendor's contract must list the unit's model;
//   - the warranty ends after the unit was bought, and a unit is bought on or before it is installed (or arrives).
//
// Each check returns { file, at, message } like the others in crossrefs.mjs.

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

  return problems;
}
