// Cross-reference checks for connected records (data/connected/, docs/connectors/model.md).
//
// The schema checks one file. These look across files: each record sits where its source mark says
// (data/connected/<system>/<kind folder>/<id>.yaml), ids are unique, links between connected records point at
// records of the right kind (the table is LINKS in tools/connectors/kinds.mjs, shared with the importer), and Keia's
// links into the catalogue (model_id, atlas_site, atlas_space, atlas_vendor) point at real models, offices, spaces
// and vendors.
//
// Each check returns { file, at, message } like the others in crossrefs.mjs.

import { KIND_FOLDER as FOLDER, linksOf, kindWords } from './connectors/kinds.mjs';

export function crossCheckConnected(records) {
  const problems = [];
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const inFolder = (folder) => records.filter((r) => r.folder === folder);
  const connected = inFolder('connected');
  if (!connected.length) return problems;

  const ids = (folder) => new Set(inFolder(folder).map((r) => r.id));
  const models = ids('device-models');
  const sites = ids('sites');
  const spaces = ids('spaces');
  const vendors = ids('vendors');
  const kindOf = new Map();
  const seen = new Map();

  for (const rec of connected) {
    const d = rec.data;
    const parts = rec.rel.split(/[\\/]/); // data, connected, <system>, <kind folder>, <id>.yaml
    if (d.id !== rec.id) report(rec, ['id'], `id "${d.id}" must match the file name "${rec.id}"`);
    if (parts.length !== 5 || parts[2] !== d.source?.system || parts[3] !== FOLDER[d.kind]) {
      report(rec, [], `a connected ${d.kind} from ${d.source?.system} belongs in data/connected/${d.source?.system}/${FOLDER[d.kind]}/`);
    }
    if (seen.has(rec.id)) report(rec, ['id'], `id "${rec.id}" is already used by ${seen.get(rec.id)}`);
    else seen.set(rec.id, rec.rel);
    kindOf.set(rec.id, d.kind);
  }

  for (const rec of connected) {
    const d = rec.data;
    for (const l of linksOf(d)) {
      if (!l.kinds.includes(kindOf.get(l.id))) report(rec, l.at, `${l.at.join('.')} "${l.id}" is not ${kindWords(l.kinds)}`);
    }
    const link = (field, set, what) => {
      if (d[field] !== undefined && !set.has(d[field])) report(rec, [field], `${field} "${d[field]}" is not ${what}`);
    };
    if (d.kind === 'unit') link('model_id', models, 'a model in data/device-models');
    if (d.kind === 'space') {
      if (d.parent === d.id) report(rec, ['parent'], 'a space cannot sit in itself');
      link('atlas_site', sites, 'an office in data/sites');
      link('atlas_space', spaces, 'a space in data/spaces');
    }
    if (d.kind === 'network') link('atlas_site', sites, 'an office in data/sites');
    if (d.kind === 'contact') link('atlas_vendor', vendors, 'a vendor in data/vendors');
    if (d.kind === 'port' && d.rear_port === d.id) report(rec, ['rear_port'], 'a port cannot map to itself');
    if (d.kind === 'connection' && d.a?.port && d.a.port === d.b?.port) report(rec, ['b', 'port'], 'a connection needs two different ports');
  }
  return problems;
}
