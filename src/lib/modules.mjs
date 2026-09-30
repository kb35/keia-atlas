// Modules (UX-V2 §2.1, decision of 30 Sept 2026: no stages, the full product, modular). Each place in the
// sidebar after Home is one module, and each module is On (built in), Connected (its records come from a tool
// the team already uses, through the connector layer) or Off (absent from the sidebar; its pages say so and
// offer to switch it on). Settings › Modules sets them for this demo; the choice is kept in this browser
// (localStorage rs6-modules) and applied to <html> before first paint as two word lists:
//   data-off="vendors team"     modules switched off
//   data-conn="support"         modules connected to another tool
// Home and Learn are not modules: they are always there.
//
// `source` names the tool a Connected module reads from. It shows as the source mark on hover in the sidebar
// ("from ServiceNow") and in Settings. Plain JavaScript with no imports, so the page head can read it too.

export const MODULES = [
  { id: 'locations', label: 'Locations', source: 'the workplace system', what: 'Regions, offices, floors and the spaces in them' },
  { id: 'services', label: 'Services', source: 'the service catalogue', what: 'The services the team runs, their health and their standard' },
  { id: 'assets', label: 'Assets', source: 'the asset register', what: 'Device types, units, models, setup guides, standards, IT stores and cables' },
  { id: 'support', label: 'Support', source: 'ServiceNow', what: 'Incidents and every piece of open work, with who has it', state: 'connected' },
  { id: 'projects', label: 'Projects', source: 'the project tool', what: 'Projects, the schedule, planning, the work plan and the Lab' },
  { id: 'vendors', label: 'Vendors', source: 'the supplier portal', what: 'The companies that install and repair, and who looks after each' },
  { id: 'team', label: 'Team', source: 'the people directory', what: 'Who is on the team, where they are and who does what' },
  { id: 'knowledge', label: 'Knowledge', source: 'the knowledge base', what: 'Known errors, playbooks and proposals to change them' },
];

export const MODULE_STATES = [
  { id: 'on', label: 'On' },
  { id: 'connected', label: 'Connected' },
  { id: 'off', label: 'Off' },
];

export const MODULE_DEFAULTS = Object.fromEntries(MODULES.map((m) => [m.id, m.state ?? 'on']));

/** A saved choice (any shape, possibly stale) as a full, valid map of module id to state. */
export function readModules(saved) {
  const ok = new Set(MODULE_STATES.map((s) => s.id));
  const out = { ...MODULE_DEFAULTS };
  if (saved && typeof saved === 'object') for (const m of MODULES) if (ok.has(saved[m.id])) out[m.id] = saved[m.id];
  return out;
}

/** The two word lists the page head writes on <html>. */
export function moduleAttrs(map) {
  const full = readModules(map);
  const ids = (st) => MODULES.filter((m) => full[m.id] === st).map((m) => m.id).join(' ');
  return { off: ids('off'), conn: ids('connected') };
}
