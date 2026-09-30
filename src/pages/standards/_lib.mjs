// The standards library: the house standards in data/standards/ (every file but cables.yaml) and the cable colour
// and label standard (cables.yaml), shaped for the list at /standards/ and the pages at /standards/<id>/.
// Loaded at build time; the validator and tests/standards.test.mjs have already checked every link.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { sources, models, classes, configurations, spaceTypes, modelName, className } from '../../lib/data.mjs';

const DIR = path.join(process.cwd(), 'data', 'standards');
const files = Object.fromEntries(readdirSync(DIR).filter((n) => n.endsWith('.yaml')).sort().map((n) => [n.slice(0, -5), parse(readFileSync(path.join(DIR, n), 'utf8'))]));

export const AREAS = [
  { id: 'cabling', label: 'Cabling and labelling' },
  { id: 'racks', label: 'Racks and comms rooms' },
  { id: 'power', label: 'Power and earthing' },
  { id: 'network', label: 'Network' },
  { id: 'wifi', label: 'Wi-Fi' },
  { id: 'displays', label: 'Displays' },
  { id: 'meeting-av', label: 'Meeting room AV' },
  { id: 'signage', label: 'Signage' },
  { id: 'scheduler-panels', label: 'Scheduler panels' },
  { id: 'home-offices', label: 'Home offices' },
];
export const AREA_LABEL = Object.fromEntries(AREAS.map((a) => [a.id, a.label]));
// A small line drawing per area (40 x 28, like the device class glyphs), coloured by currentColor.
export const AREA_GLYPH = {
  cabling: '<path d="M3 20c7 0 7-12 14-12s7 12 14 12"/><rect x="31" y="16" width="6" height="8" rx="1"/><path d="M33 16v-2M35 16v-2"/>',
  racks: '<rect x="11" y="2" width="18" height="24" rx="1.5"/><path d="M14 7h12M14 11h12M14 15h12M14 19h8"/>',
  power: '<path d="M22 3l-9 13h7l-2 9 9-13h-7z"/>',
  network: '<rect x="5" y="10" width="30" height="8" rx="1.5"/><path d="M10 14h2M15 14h2M20 14h2M25 14h2M20 10V5M10 18v5M30 18v5"/>',
  wifi: '<path d="M7 12a19 19 0 0 1 26 0M11 16a13 13 0 0 1 18 0M15 20a7 7 0 0 1 10 0"/><circle cx="20" cy="24" r="1.4"/>',
  displays: '<rect x="3" y="3" width="34" height="19" rx="1.5"/><path d="M16 26h8M20 22v4"/>',
  'meeting-av': '<rect x="6" y="3" width="28" height="15" rx="1.5"/><rect x="12" y="20" width="16" height="4" rx="2"/><circle cx="20" cy="22" r=".9"/>',
  signage: '<rect x="12" y="2" width="16" height="24" rx="1.5"/><path d="M18 11l5 3-5 3z"/>',
  'scheduler-panels': '<rect x="12" y="4" width="16" height="20" rx="2"/><path d="M12 8h16"/><circle cx="20" cy="16" r="3"/>',
  'home-offices': '<path d="M5 14L20 3l15 11"/><path d="M9 11v14h22V11"/><rect x="16" y="17" width="8" height="8"/>',
};
export const KIND_LABEL = { standard: 'Public standard', regulation: 'Regulation', guide: 'Design guide', vendor: 'Vendor document' };
export const BASED = { public: 'Public standards', vendor: 'Vendor guidance', house: 'House choices' };

// A reference's link: its own public page, or the data/sources entry's page.
const refUrl = (r) => r.url ?? sources[r.source]?.url ?? null;

// Each house standard, with its rules counted and its links resolved to pages in Keia Atlas.
export const houseStandards = Object.entries(files).filter(([id]) => id !== 'cables').map(([id, s]) => {
  const rules = s.sections.flatMap((sec) => sec.rules.map((r) => ({ ...r, section: sec.id })));
  const refs = s.references.map((r) => ({ ...r, href: refUrl(r) }));
  const a = s.applies_to ?? {};
  const based = new Set();
  for (const r of rules) {
    if (r.house) based.add('house');
    for (const sid of r.sources ?? []) {
      const ref = refs.find((x) => x.id === sid);
      based.add(ref?.kind === 'vendor' ? 'vendor' : 'public');
    }
  }
  // Names for a card: a standard by its number, a guide without one by who publishes it ("Cisco Meraki guide").
  const publicNames = [...new Set(refs.filter((r) => r.kind !== 'vendor').map((r) => (r.kind === 'guide' && !r.name.includes(', ') ? `${r.publisher} guide` : shortName(r.name))))];
  return {
    ...s, kind: 'house', href: `/standards/${id}/`, rules, refs,
    counts: { rules: rules.length, must: rules.filter((r) => r.level === 'must').length, house: rules.filter((r) => r.house).length, refs: refs.length },
    based: [...based], publicNames,
    links: {
      classes: (a.classes ?? []).filter((c) => classes[c]).map((c) => ({ id: c, label: className(c), href: `/profiles/${c}/` })),
      models: (a.models ?? []).filter((m) => models[m]).map((m) => ({ id: m, label: modelName(m), href: `/profiles/${models[m].class}/${m}/` })),
      configurations: (a.configurations ?? []).filter((c) => configurations[c]).map((c) => ({ id: c, label: configurations[c].name, href: `/configurations/${c}/` })),
      rooms: (a.space_types ?? []).filter((t) => spaceTypes[t]).map((t) => ({ id: t, label: spaceTypes[t].profile.name, href: `/room-profiles/${t}/` })),
    },
  };
});

// "ANSI/TIA-568.2-D, Balanced Twisted-Pair ..." reads as "ANSI/TIA-568.2-D" on a card.
function shortName(name) {
  const cut = name.split(/,\s/)[0];
  return cut.length > 42 ? `${cut.slice(0, 40)}...` : cut;
}

// The cable colour and label standard, as a card in the same library.
const C = files.cables;
const cableRules = C.purposes.filter((p) => p.coded !== false).length + C.labelling.rules.length;
export const cableCard = {
  id: 'cables', kind: 'colours', name: 'Cable colours and labels', area: 'cabling', order: 1.5, version: C.version, effective: C.effective, owner: C.owner,
  summary: 'A patch cord\'s colour says what it is for, and a label at both ends says where it goes.', href: '/standards/cables/',
  counts: { rules: cableRules, must: cableRules, house: cableRules, refs: C.tia606.sources.length + C.sources.length },
  based: ['house', 'public'], publicNames: ['ANSI/TIA-606'],
};

export const library = [...houseStandards, cableCard].sort((a, b) => a.order - b.order);
export const byId = Object.fromEntries(library.map((s) => [s.id, s]));
export const allRefs = houseStandards.flatMap((s) => s.refs.map((r) => ({ ...r, std: s.id })));

// Every public standard, regulation and guide the library names, with the standards that lean on it.
export const publicSources = (() => {
  const m = new Map();
  for (const r of allRefs.filter((x) => x.kind !== 'vendor')) {
    const key = shortName(r.name);
    const cur = m.get(key) ?? { name: r.name, short: key, kind: r.kind, publisher: r.publisher, summary: r.summary, href: r.href, stds: new Set() };
    cur.stds.add(r.std);
    m.set(key, cur);
  }
  return [...m.values()].map((x) => ({ ...x, stds: [...x.stds] })).sort((a, b) => b.stds.length - a.stds.length || a.short.localeCompare(b.short));
})();

export const totals = {
  standards: library.length,
  rules: library.reduce((n, s) => n + s.counts.rules, 0),
  must: houseStandards.reduce((n, s) => n + s.counts.must, 0),
  house: houseStandards.reduce((n, s) => n + s.counts.house, 0),
  publicSources: publicSources.length,
};
