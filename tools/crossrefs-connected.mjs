// Cross-reference checks for connected records (data/connected/, docs/connectors/model.md).
//
// The schema checks one file. These look across files: each record sits where its source mark says
// (data/connected/<system>/<kind>s/<id>.yaml), ids are unique, links between connected records point at
// records of the right kind, and Keia's links into the catalogue (model_id, atlas_site, atlas_space) point at
// real models, offices and spaces.
//
// Each check returns { file, at, message } like the others in crossrefs.mjs.

const FOLDER = { unit: 'units', space: 'spaces', ticket: 'tickets', event: 'events' };

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
  const byKind = { unit: new Set(), space: new Set(), ticket: new Set(), event: new Set() };
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
    byKind[d.kind]?.add(rec.id);
  }

  const all = new Set(seen.keys());
  for (const rec of connected) {
    const d = rec.data;
    const link = (field, set, what) => {
      if (d[field] !== undefined && !set.has(d[field])) report(rec, [field], `${field} "${d[field]}" is not ${what}`);
    };
    const connectedSpace = 'a connected space';
    if (d.kind === 'unit') {
      link('space', byKind.space, connectedSpace);
      link('model_id', models, 'a model in data/device-models');
    }
    if (d.kind === 'space') {
      link('parent', byKind.space, connectedSpace);
      if (d.parent === d.id) report(rec, ['parent'], 'a space cannot sit in itself');
      link('atlas_site', sites, 'an office in data/sites');
      link('atlas_space', spaces, 'a space in data/spaces');
    }
    if (d.kind === 'ticket') {
      link('space', byKind.space, connectedSpace);
      link('unit', byKind.unit, 'a connected unit');
    }
    if (d.kind === 'event') link('subject', all, 'a connected record');
  }
  return problems;
}
