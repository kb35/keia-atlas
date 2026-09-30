// Classification (docs/rules/data.md F10): four labels, and the label drives who may see a fact.
//
//   Public      facts about models: ports, drawings, datasheets, room profiles, makers' known issues
//   Internal    facts about Aigna that staff may see: rooms, units, incidents, projects, budgets
//   Restricted  facts about Aigna's buildings that help an attacker: floor plans, camera and door-controller
//               positions, IP plans and VLANs, switch ports, the vulnerable-firmware list, default passwords
//   Secret      credentials and break-glass details: never in Keia Atlas data, only a vault reference
//
// Each data folder's default label is in schemas/registry.yaml (`classification`). A field more sensitive
// than its folder carries `x-classification` in its schema. The validator refuses a folder without a
// label, a label that is not one of the four, and a folder labelled Secret.
//
// This file has no Astro or browser dependency, so the validator and the tests use it too.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export const LABELS = ['Public', 'Internal', 'Restricted', 'Secret'];
export const RANK = Object.fromEntries(LABELS.map((l, i) => [l, i]));
export const KEYWORD = 'x-classification';

// What each label means in practice, for the rule book and the "What Keia logs" page.
export const HANDLING = {
  Public: 'Anyone. Fine for the public demo.',
  Internal: 'Signed-in staff.',
  Restricted: 'Need-to-know roles only. Exports are watermarked and logged.',
  Secret: 'Never stored in Keia Atlas. Only the name of a vault entry.',
};

// Views worked out from several folders that are Restricted even when their parts are not. The words are
// what the small "Restricted: ..." label on the page says.
export const RESTRICTED_VIEWS = {
  floorPlan: 'floor plan',
  building3d: 'building model',
  rack: 'rack and switch ports',
  ipPlan: 'IP plan',
  exposure: 'vulnerable-firmware list',
  passwords: 'default password status',
  circuits: 'internet circuits',
};

// Every `x-classification` in a schema, as [{ at: 'properties.units.items...', label }], following $defs.
export function fieldLabels(schema) {
  const out = [];
  const walk = (node, at) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((n, i) => walk(n, `${at}[${i}]`)); return; }
    if (typeof node[KEYWORD] === 'string') out.push({ at: at || '(whole record)', label: node[KEYWORD] });
    for (const [k, v] of Object.entries(node)) if (k !== KEYWORD) walk(v, at ? `${at}.${k}` : k);
  };
  walk(schema, '');
  return out;
}

// Check a registry's collections. Returns [message] for each problem.
export function checkRegistry(collections) {
  const out = [];
  for (const c of collections ?? []) {
    if (!c?.folder) continue;
    if (!c.classification) out.push(`folder "${c.folder}" needs a classification: Public, Internal or Restricted`);
    else if (!LABELS.includes(c.classification)) out.push(`folder "${c.folder}": classification must be one of ${LABELS.join(', ')}, not "${c.classification}"`);
    else if (c.classification === 'Secret') out.push(`folder "${c.folder}" is labelled Secret, but secrets never sit in Keia Atlas data: keep them in the vault and store only the entry's name`);
  }
  return out;
}

// The default label of each data folder, read from the registry (build time only).
let cache = null;
export function folderLabels(root = process.cwd()) {
  if (cache && root === process.cwd()) return cache;
  const reg = parse(readFileSync(path.join(root, 'schemas', 'registry.yaml'), 'utf8'));
  const map = Object.fromEntries((reg.collections ?? []).map((c) => [c.folder, c.classification]));
  if (root === process.cwd()) cache = map;
  return map;
}
export const labelOf = (folder, root) => folderLabels(root)[folder] ?? 'Internal';

// The label's HTML, for pages that build their markup in a script (the unit page). Astro pages use
// src/components/Restricted.astro, which renders the same thing.
export const restrictedHtml = (what) => `<span class="cls-tag" data-help="classification.restricted"><b>Restricted:</b> ${what}</span>`;
