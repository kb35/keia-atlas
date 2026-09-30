// The capabilities added with the first batch of overlooked items, so each can be switched On, Connected or Off like
// a module (the capability switches read this list). Every block a feature adds to a page carries
// data-feature="<id>", so switching it off takes the block away and nothing looks missing.
//   id           the value of data-feature on its blocks
//   label        its name in Settings
//   description  one line: what it shows and where
//   module       the module it belongs to: assets, locations, team, support or projects
export const FEATURES_ADDED = [
  { id: 'warranty', label: 'Warranty and purchase', description: 'Each unit\'s warranty end, support contract, purchase date, order and cost, and the warranties ending in the next 12 months on Planning.', module: 'assets' },
  { id: 'oncall', label: 'On call', description: 'The out-of-hours rota for each region: who is on call now on Team, on their Home and on every incident.', module: 'team' },
  { id: 'circuits', label: 'Internet circuits', description: 'Each office\'s circuits in full: circuit ID, carrier, bandwidth, service level, support reference and renewal.', module: 'locations' },
  { id: 'comms-environment', label: 'Comms room power and temperature', description: 'UPS runtime and load against the power standard, and the temperature against its target, on each comms room.', module: 'locations' },
  { id: 'repeat-faults', label: 'Repeat faults', description: 'How many faults a space or unit has had this quarter with a trend by month, and the spaces with the most repeats on Support.', module: 'support' },
  { id: 'room-accessibility', label: 'Room accessibility', description: 'Hearing loops and their tests, assistive listening, captions and step-free access, on the space page.', module: 'locations' },
  { id: 'cable-tests', label: 'Cable tests', description: 'The certification result, length and margin of every cable run to a space, on the space page.', module: 'locations' },
  { id: 'certified-platforms', label: 'Certified meeting platforms', description: 'Which meeting platforms each model in a space is certified for, on the space page.', module: 'locations' },
  { id: 'change-windows', label: 'Office hours and change window', description: 'Each office\'s opening hours and the window when changes may be made, on the office page.', module: 'locations' },
];

export const FEATURE_IDS = FEATURES_ADDED.map((f) => f.id);
