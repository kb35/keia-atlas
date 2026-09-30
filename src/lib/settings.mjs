// Settings, in three parts (Keith, 30 Sept 2026: "way too much in that one settings button"):
//   the quick menu    the gear: who you view as, light or dark, the look, text size, and links (Settings.astro)
//   /settings/        your own settings, in short sections: You, Accessibility, Organisation (a link), Demo, About
//   /settings/organisation/   modules and capabilities, for an admin: they affect everyone (SettingsModules.astro)
// Every choice keeps its storage key and is applied before first paint by the boot scripts in Shell.astro and
// src/lib/a11y.mjs, as before. Plain JavaScript with no imports, so pages and tests read the same lists.

export const LOOKS = [
  { id: 'studio', name: 'Studio', note: 'Calm and warm. The default.', sw: ['#12110F', '#F6F3EE', '#E27A3A', '#7BC49A'] },
  { id: 'enterprise', name: 'Enterprise', note: 'Dense, slate and blue.', sw: ['#16233A', '#FFFFFF', '#1D5BB8', '#DCA614'] },
  { id: 'contrast', name: 'High contrast', note: 'Stronger text and focus.', sw: ['#000000', '#FFFFFF', '#004D99', '#73480B'] },
  { id: 'drawing', name: 'Drawing set', note: 'Ink on drafting paper.', sw: ['#111111', '#F3F3EE', '#0B2A4C', '#B8860B'] },
  { id: 'classic', name: 'Playful', note: 'Ink outlines, bold colour.', sw: ['#15161B', '#F3F0E8', '#FFCB2E', '#1E5BFF'] },
];

export const MODES = [
  { id: 'system', name: 'Auto' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];

// The sections of /settings/, in order. Notifications is left out until there is something real to set.
export const SECTIONS = [
  { id: 'you', label: 'You', icon: 'sliders', what: 'Look, light or dark, density and where pages open' },
  { id: 'accessibility', label: 'Accessibility', icon: 'about', what: 'Motion, text size, contrast and links' },
  { id: 'organisation', label: 'Organisation', icon: 'sites', what: 'Modules and capabilities, for everyone' },
  { id: 'demo', label: 'Demo', icon: 'flask', what: 'View as, time away and a fresh start' },
  { id: 'about', label: 'About', icon: 'book', what: 'Where these are kept' },
];

// Settings › Accessibility: the switches, each with one short line (it fits one line on a phone).
export const A11Y_SWITCHES = [
  { id: 'contrast', name: 'High contrast', note: 'Darker text and stronger lines' },
  { id: 'outlines', name: 'Stronger outlines', note: 'Thicker lines and focus rings' },
  { id: 'links', name: 'Underline links', note: 'Every text link is underlined' },
  { id: 'words', name: 'Status in words', note: 'A word beside every status mark' },
  { id: 'still', name: 'Keep things still', note: 'Nothing plays or slides by itself' },
];
export const MOTION_NOTE = { system: 'Follows your device\'s setting.', reduced: 'Short fades only. Nothing slides or zooms.', off: 'Nothing moves. Every change is instant.' };
export const TEXT_STEPS = [
  { id: 'default', name: 'Default' },
  { id: 'larger', name: 'Larger' },
  { id: 'largest', name: 'Largest' },
];

// Reset the demo (Settings › Demo): every demo record, module, capability and person goes back to how the demo
// starts. What is yours stays: the look, light or dark, density, where pages open, accessibility, the
// lessons you finished, recent searches and how you like each list shown (the *-view keys).
export const PERSONAL_KEYS = ['rs4-skin', 'rs4-theme', 'rs4-look-v', 'rs6-density', 'rs6-depth', 'rs7-a11y', 'rs7-skin-before', 'rs4-learn', 'rs4-tour', 'rs5-tour', 'rs4-search-recent', 'rs-cfg-all'];

/** Of the keys in this browser's storage, the ones Reset the demo removes. Pure, so the tests read it too. */
export function demoResetKeys(keys) {
  return keys.filter((k) => /^rs\d?-/.test(k) && !PERSONAL_KEYS.includes(k) && !/-view$/.test(k));
}

// Where each module and capability lives in Keia Atlas, for the Organisation page's "Go to" links. A capability may
// name its own page with `to` in src/lib/modules.mjs; otherwise it is here; otherwise it goes to its module's place.
export const MODULE_HOME = {
  locations: { to: '/locations/', place: 'Locations' }, services: { to: '/services/', place: 'Services' }, assets: { to: '/assets/', place: 'Assets' },
  support: { to: '/support/', place: 'Support' }, projects: { to: '/projects/', place: 'Projects' }, vendors: { to: '/vendors/', place: 'Vendors' },
  team: { to: '/team/', place: 'Team' }, knowledge: { to: '/known-issues/', place: 'Knowledge' },
};
export const CAPABILITY_HOME = {
  'room-accessibility': { to: '/rooms/', place: 'Spaces' }, 'cable-tests': { to: '/rooms/', place: 'Spaces' },
  'certified-platforms': { to: '/rooms/', place: 'Spaces' }, 'out-of-service': { to: '/rooms/', place: 'Spaces' },
  circuits: { to: '/locations/offices/', place: 'Offices' }, 'comms-environment': { to: '/locations/offices/', place: 'Offices' },
  'change-windows': { to: '/locations/offices/', place: 'Offices' }, 'meeting-quality': { to: '/usage/quality/', place: 'Meeting quality' },
  licences: { to: '/assets/licences/', place: 'Licences' }, warranty: { to: '/devices/', place: 'Units' }, cves: { to: '/assets/security-flaws/', place: 'Security flaws' },
  credentials: { to: '/assets/certificates/', place: 'Certificates' }, 'config-backups': { to: '/assets/config-backups/', place: 'Config backups' },
  alerts: { to: '/support/alerts/', place: 'Alert rules' }, 'repeat-faults': { to: '/support/', place: 'Support' },
  maintenance: { to: '/work/checks/', place: 'Room checks' }, engagements: { to: '/vendors/', place: 'Vendors' }, oncall: { to: '/team/', place: 'Team' },
};
/** Where a capability ({ id, module, to?, place? } from the registry) lives: { to, place }. */
export function capabilityHome(c) {
  if (c.to) return { to: c.to, place: c.place ?? MODULE_HOME[c.module]?.place ?? c.label };
  return CAPABILITY_HOME[c.id] ?? MODULE_HOME[c.module] ?? { to: '/', place: 'Home' };
}
