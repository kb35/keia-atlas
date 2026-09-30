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

// ---- Capabilities (Keith's rule, 30 Sept 2026: the bigger items are "turned on and turned off if they're needed,
// so that it never looks like there's anything missing") ------------------------------------------------------------
// Each module holds capabilities: the bigger items a team adds when it needs them (licences, room checks, alert
// rules, certificates). Each is On, Connected (its records come from a named tool) or Off, like a module, and is
// off whenever its module is Off or anything it `requires` (a module or another capability) is off.
//
// This list is the single source of truth for capability ids. An element marked data-feature="<id>" is taken out
// of view while that capability is off. The boot script in the page head writes two word lists on <html> before
// first paint,
//   data-feat-off="credentials maintenance"   capabilities that are off (chosen, or by their module or requires)
//   data-feat-conn="alerts config-backups"      capabilities connected to another tool
// and featureCss() hides what they mark. A Section (.sec) or a [data-feat-wrap] box whose content (apart from its
// heading) is all gated by one capability goes with it, so no heading is left behind. Pages check a capability with
// featureOn() when the site is built and window.rsFeatureOn(id) in the browser, so answers and counts never mention
// one that is off. The choice is kept in this browser (localStorage rs6-features).
//
//   id        the word used in data-feature, in rs6-features and in the two lists on <html>
//   label     its name in Settings
//   what      one line: what it adds
//   module    the module it belongs to (its parent in Settings)
//   state     the default: on, connected or off
//   source    the tool it reads from when Connected (the source mark: "from Datadog")
//   requires  modules or capabilities that must not be Off for it to be on
//   helper    a section another change added (src/lib/features-added.mjs, FEATURES_ADDED, lists them with the same
//             module); registered here, so that list never needs a switch of its own
export const CAPABILITIES = [
  // Locations
  { id: 'room-accessibility', module: 'locations', label: 'Room accessibility', what: 'Hearing loops, captions and step-free access on each space', state: 'on', source: 'the workplace system', helper: true },
  { id: 'circuits', module: 'locations', label: 'Internet circuits', what: 'Circuit ids, bandwidth, support lines and contract ends per office', state: 'on', source: 'the carrier portals', helper: true },
  { id: 'comms-environment', module: 'locations', label: 'Comms room power and climate', what: 'UPS runtime, load, temperature and cooling in each comms room', state: 'on', source: 'the power monitoring', helper: true },
  { id: 'change-windows', module: 'locations', label: 'Change windows', what: 'Each office\'s hours and the window when changes may run', state: 'on', source: 'the change calendar', helper: true },
  { id: 'cable-tests', module: 'locations', label: 'Cable test results', what: 'Certification results for every cable run and outlet', state: 'on', source: 'the cable tester', helper: true },
  { id: 'certified-platforms', module: 'locations', label: 'Certified platforms', what: 'Which meeting platforms each space\'s kit is certified for', state: 'on', source: 'the manufacturers', helper: true },
  { id: 'meeting-quality', module: 'locations', label: 'Meeting quality', what: 'A call-quality score per space, its trend and the worst rooms', state: 'connected', source: 'the meeting platform' },
  // Services: the service catalogue beyond AV, Network and IT infrastructure (src/lib/catalogue.mjs). Each service is a
  // capability, so a team shows only the services it runs. Security is Connected: the security team usually owns it.
  { id: 'collaboration', module: 'services', label: 'Collaboration platforms', what: 'Teams Rooms, Zoom Rooms and Google Meet hardware, with their licences', state: 'on', source: 'the platforms\' admin consoles' },
  { id: 'wifi', module: 'services', label: 'Wi-Fi', what: 'Access points and the three house networks in every office', state: 'on', source: 'UniFi Site Manager' },
  { id: 'security', module: 'services', label: 'Security', what: 'Door access, cameras and visitor sign-in at each reception', state: 'connected', source: 'the security platform' },
  { id: 'print', module: 'services', label: 'Print', what: 'Printers and multifunction devices in the copy and print rooms', state: 'on', source: 'print management' },
  { id: 'signage', module: 'services', label: 'Digital signage and displays', what: 'Screens in receptions, pantries and cafeterias, and their players', state: 'on', source: 'the signage platforms' },
  { id: 'room-booking', module: 'services', label: 'Room booking and scheduling', what: 'Booking panels and each room\'s link to its calendar', state: 'on', source: 'the booking system' },
  { id: 'building-sensors', module: 'services', label: 'Building and sensors', what: 'Environment sensors and room counts, never per person', state: 'on', source: 'the building management system' },
  { id: 'home-kit', module: 'services', label: 'Home office kit', what: 'Home gateways, screens and docks at home desks', state: 'on', source: 'the asset register' },
  { id: 'events', module: 'services', label: 'Events and experience centres', what: 'Client briefings: readiness, demo kit, a technician on site, a report', state: 'on', source: 'the events calendar', requires: ['locations'] },
  // Assets
  { id: 'licences', module: 'assets', label: 'Licences', what: 'Room and platform licences, seats, renewals and cost', state: 'on', source: 'the licence portals' },
  { id: 'warranty', module: 'assets', label: 'Warranty and cover', what: 'Warranty, support cover and purchase per unit', state: 'on', source: 'the asset register', helper: true },
  { id: 'cves', module: 'assets', label: 'Security flaws', what: 'Published security flaws per firmware line, and the units exposed', state: 'on', source: 'the vendor advisories' },
  { id: 'credentials', module: 'assets', label: 'Certificates and secrets', what: 'Certificates, service accounts and secrets by reference, with expiry', state: 'off', source: 'the vault' },
  { id: 'config-backups', module: 'assets', label: 'Config backups', what: 'The last config backup of each network device, and its drift', state: 'connected', source: 'Oxidized' },
  // Support
  { id: 'out-of-service', module: 'support', label: 'Out of service', what: 'Take a space out of service and tell the people booked into it', state: 'on', source: 'the booking system', requires: ['locations'] },
  { id: 'alerts', module: 'support', label: 'Alert rules', what: 'What counts as an alert, who gets it, quiet hours and silences', state: 'connected', source: 'monitoring', requires: ['services'] },
  { id: 'repeat-faults', module: 'support', label: 'Repeat faults', what: 'Spaces and models that keep failing, and the trend', state: 'on', source: 'ServiceNow', helper: true },
  // Projects
  { id: 'maintenance', module: 'projects', label: 'Room checks', what: 'Recurring checks and planned maintenance, scheduled with a checklist', state: 'on', source: 'the maintenance planner', requires: ['locations'] },
  // Vendors
  { id: 'engagements', module: 'vendors', label: 'Service providers', what: 'Engagements with service providers: scope, service levels and reviews', state: 'on', source: 'the supplier portal' },
  { id: 'provider-sales', module: 'vendors', label: 'Provider sales', what: 'For a provider: opportunities, designs, quotes and statements of work', state: 'on', source: 'the provider\'s own Keia', requires: ['engagements'] },
  // A provider's own operations (src/lib/provider-ops.mjs, /portfolio/ops/): what an integrator runs its work with.
  { id: 'provider-stock', module: 'vendors', label: 'Provider stock and orders', what: 'A provider\'s stock, reservations per job and purchase orders to distributors', state: 'on', source: 'the provider\'s stock system' },
  { id: 'provider-crews', module: 'vendors', label: 'Provider crews', what: 'A provider\'s crews, certifications and each visit\'s readiness', state: 'on', source: 'the provider\'s scheduling tool' },
  { id: 'provider-rams', module: 'vendors', label: 'Provider RAMS', what: 'Risk assessments and method statements from the record, approved by a person', state: 'on', source: 'the provider\'s safety system' },
  // Team
  { id: 'oncall', module: 'team', label: 'On-call', what: 'Who is on call now, by region and service', state: 'on', source: 'the paging tool', requires: ['support'], helper: true },
];

export const CAPABILITY_IDS = CAPABILITIES.map((c) => c.id);
export const CAPABILITY_DEFAULTS = Object.fromEntries(CAPABILITIES.map((c) => [c.id, c.state]));
export const capability = (id) => CAPABILITIES.find((c) => c.id === id) ?? null;

/* Every capability's state, from the modules' states (a full map, as readModules gives) and a saved choice (any
   shape, possibly stale). A capability is off when its module is Off, when anything it requires is off, or when it
   was switched off; otherwise it is what was chosen, or its default. Plain JavaScript with no outside names, so the
   page head can carry it as text (resolveFeatures.toString()). */
export function resolveFeatures(caps, mods, saved) {
  var ok = /^(on|connected|off)$/, byId = {}, out = {}, i;
  for (i = 0; i < caps.length; i++) byId[caps[i].id] = caps[i];
  function eff(id, seen) {
    if (Object.prototype.hasOwnProperty.call(out, id)) return out[id];
    var c = byId[id];
    if (!c) return mods && mods[id] ? mods[id] : 'on';   // a module (or a name nobody registered)
    if (seen[id]) return 'off';                           // a loop in `requires` switches the loop off
    seen[id] = true;
    var v = saved && ok.test(saved[id]) ? saved[id] : c.state || 'on';
    if (mods && mods[c.module] === 'off') v = 'off';
    var req = c.requires || [];
    for (var j = 0; j < req.length; j++) if (eff(req[j], seen) === 'off') v = 'off';
    out[id] = v;
    return v;
  }
  for (i = 0; i < caps.length; i++) eff(caps[i].id, {});
  return out;
}

/** The capabilities' states for a modules choice and a capabilities choice (both as saved; stale is fine). */
export const readFeatures = (mods, saved) => resolveFeatures(CAPABILITIES, readModules(mods), saved);

/** Why a capability is off although it was not switched off itself: its module, or the first thing it requires
    that is off. Null when nothing above it is off. */
export function offBecause(id, mods, feats) {
  const c = capability(id);
  if (!c) return null;
  if (mods[c.module] === 'off') return c.module;
  for (const r of c.requires ?? []) if ((feats[r] ?? mods[r]) === 'off') return r;
  return null;
}

/** The two word lists the page head writes on <html>: data-feat-off and data-feat-conn. */
export function featureAttrs(feats) {
  const ids = (st) => CAPABILITIES.filter((c) => feats[c.id] === st).map((c) => c.id).join(' ');
  return { off: ids('off'), conn: ids('connected') };
}

/** When the site is built: is this capability on (On or Connected) by default? Text written once at build time uses
    it, and is marked data-feature as well, so the browser takes it away when the person switches the capability off. */
export function featureOn(id, feats = readFeatures(null, null)) {
  if (!(id in feats)) throw new Error(`featureOn: no capability "${id}" in src/lib/modules.mjs`);
  return feats[id] !== 'off';
}

/* A box that holds the work of several capabilities (a section of cards on a space page) goes when every one of them
   is off: mark it data-feat-any="<ids>" (in this order, space-separated) and put this rule on the page with it. */
export function featureAnyCss(ids) {
  const list = [...new Set(ids)];
  for (const id of list) if (!CAPABILITY_IDS.includes(id)) throw new Error(`featureAnyCss: no capability "${id}" in src/lib/modules.mjs`);
  return `:root${list.map((id) => `[data-feat-off~="${id}"]`).join('')} [data-feat-any="${list.join(' ')}"]{display:none!important}`;
}

/* The rules that take gated things out of view, keyed only on the two lists on <html>: a change of state is one
   change of attribute, which rsChange measures before and after (what leaves shrinks, what arrives grows).
     [data-feature~=id]       belongs to a capability; with several ids it needs all of them
     .sec, [data-feat-wrap]   a section or box whose content (apart from its heading) is all gated by one capability
                              goes with it, so no heading is left orphaned
     [data-feat-src~=id]      a source mark ("from Datadog"), shown only while the capability is Connected
     [data-feat-offshow~=id]  shown only while the capability is off (a page's own "switched off" line) */
export function featureCss(ids = CAPABILITY_IDS) {
  const skip = '.section-head,script,style,template,[hidden],.sec-all,.sec-to';
  return ids.map((id) => {
    const off = `:root[data-feat-off~="${id}"]`;
    return `${off} [data-feature~="${id}"]{display:none!important}`
      + `${off} :is(.sec,[data-feat-wrap]):has(> [data-feature~="${id}"]):not(:has(> :not(${skip},[data-feature~="${id}"]))){display:none!important}`
      + `:root:not([data-feat-conn~="${id}"]) [data-feat-src~="${id}"]{display:none!important}`
      + `:root:not([data-feat-off~="${id}"]) [data-feat-offshow~="${id}"]{display:none!important}`;
  }).join('');
}
