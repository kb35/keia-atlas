// The kinds of connected record in the Keia canonical model v1 (docs/connectors/model.md), where each is kept, and
// how they link to one another. The runner (run.mjs) and the validator's cross-reference check
// (tools/crossrefs-connected.mjs) both read this, so a link means the same thing in an import and in `npm run validate`.

// The order an import plans them in: places and contacts first, then what sits in them, then what joins them.
export const KINDS = ['space', 'contact', 'unit', 'network', 'port', 'address', 'connection', 'circuit', 'group', 'ticket', 'event'];

// Where each kind is kept under data/connected/<system>/.
export const KIND_FOLDER = {
  space: 'spaces', contact: 'contacts', unit: 'units', network: 'networks', port: 'ports', address: 'addresses',
  connection: 'connections', circuit: 'circuits', group: 'groups', ticket: 'tickets', event: 'events',
};

const ANY = KINDS;
const MEMBER = KINDS.filter((k) => !['ticket', 'event', 'contact'].includes(k));

// Every link from one connected record to another: the path of the field (a trailing [] walks a list) and the kinds
// it may point at. A link to Keia's own catalogue (model_id, atlas_site...) is checked by the validator instead.
export const LINKS = {
  space: [['parent', ['space']], ['contacts[].contact', ['contact']]],
  contact: [],
  unit: [['space', ['space']], ['inside', ['unit']], ['contacts[].contact', ['contact']]],
  network: [['scope', ['space']], ['vlan', ['network']], ['contacts[].contact', ['contact']]],
  port: [['unit', ['unit']], ['space', ['space']], ['untagged_vlan', ['network']], ['tagged_vlans[]', ['network']], ['rear_port', ['port']], ['lag', ['port']]],
  address: [['port', ['port']], ['unit', ['unit']], ['network', ['network']]],
  connection: [['a.port', ['port']], ['a.circuit', ['circuit']], ['b.port', ['port']], ['b.circuit', ['circuit']]],
  circuit: [
    ['carrier_contact', ['contact']], ['terminations.a.space', ['space']], ['terminations.a.port', ['port']],
    ['terminations.z.space', ['space']], ['terminations.z.port', ['port']], ['contacts[].contact', ['contact']],
  ],
  group: [['members[].ref', MEMBER], ['space', ['space']]],
  ticket: [['space', ['space']], ['unit', ['unit']], ['related[]', ANY]],
  event: [['subject', ANY]],
};

// Every link a record holds: [{ at: ['members', 0, 'ref'], field: 'members[].ref', id, kinds }].
export function linksOf(record) {
  const out = [];
  for (const [field, kinds] of LINKS[record?.kind] ?? []) {
    const walk = (node, parts, at) => {
      if (node === undefined || node === null) return;
      if (!parts.length) {
        if (typeof node === 'string') out.push({ at, field, id: node, kinds });
        return;
      }
      const [head, ...rest] = parts;
      const many = head.endsWith('[]');
      const key = many ? head.slice(0, -2) : head;
      const next = key === '' ? node : node?.[key];
      const here = key === '' ? at : [...at, key];
      if (many) {
        if (Array.isArray(next)) next.forEach((v, i) => walk(v, rest, [...here, i]));
      } else walk(next, rest, here);
    };
    walk(record, field.split('.'), []);
  }
  return out;
}

// The words a message uses for the kinds a link may point at.
export const kindWords = (kinds) => (kinds.length === 1 ? `a connected ${kinds[0]}` : 'a connected record');

// Fields Keia owns whichever system fills them first: its links into the catalogue and the plan, and people's notes.
// A manifest must declare these as "keia"; an import never overwrites a value already in the file.
export const KEIA_FIELDS = ['model_id', 'atlas_site', 'atlas_space', 'atlas_vendor', 'purpose', 'notes'];

// Field ownership defaults (docs/connectors/model.md, "Who owns each field"). Decided facts belong to the system of
// record; observed facts to the system that sees them; links and notes to Keia. An adapter's manifest still says who
// owns each field it fills; these are the defaults a new adapter starts from, and what the specs follow.
export const OBSERVED_FIELDS = {
  unit: ['health', 'health_native', 'health_since', 'config_backup', 'firmware'],
  port: ['mac'],
  address: ['mac'],
};
export function defaultOwner(kind, field) {
  if (KEIA_FIELDS.includes(field)) return 'keia';
  if (OBSERVED_FIELDS[kind]?.includes(field)) return 'observed';
  return 'record';
}
