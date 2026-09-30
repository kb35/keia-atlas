// The method pages under /method/, in reading order, with the level each belongs to and the thing to try in the
// demo. Titles and text come from docs/keia-method.md (src/lib/method.mjs); this file only orders the pages and
// says where "Try it in the demo" goes and as whom (View as). Each try is something the v0.1 demo really does.
import { IDEAS, SECTIONS } from '../../lib/method.mjs';

// Who a "Try it" opens the demo as. Names are the demo's made-up people (src/lib/demo.mjs).
export const PEOPLE = {
  liam: 'Liam, the Dublin technician',
  anna: 'Anna, a delivery engineer',
  declan: 'Declan, who owns the network and comms rooms',
  priya: 'Priya, on the service desk',
  nora: 'Nora, who runs the lab',
  claire: 'Claire, head of the service',
};

const TRY = {
  'start-from-the-building': {
    to: '/locations/dub/', as: 'liam', label: 'Open the Dublin office',
    steps: ['Open the Dublin office: the floor plan shows every space.', 'Select a space on the plan, then open it: its drawing, its devices, its bookings.', 'In the space, open the video bar: its unit page lists its ports and its history.'],
  },
  'capture-dont-ask': {
    to: '/guide/dub-3-09/', label: 'Open the room guide for 3.09 Whooper Swan',
    steps: ['Open the room guide for 3.09 Whooper Swan, the page behind the code on the table.', 'Report a fault: tap the symptom. The space and its devices are already known, so nothing else is asked.'],
  },
  'answer-first': {
    to: '/services/', as: 'declan', label: 'Open Services',
    steps: ['Open Services: the band says whether each service is within target.', 'Select a figure: it opens the list it counts, with the filters in the address.', 'Open one record from the list, then its log.'],
  },
  'own-it-hand-it-on': {
    to: '/incidents/inc0041172/', as: 'liam', label: 'Open the Whooper Swan booking panel incident',
    steps: ['Open the booking panel incident: it says who holds it and what it is waiting on.', 'Read its history: every hand-off keeps the evidence with it.', 'Switch View as to Anna: the same record, the same history.'],
  },
  'learn-as-you-go': {
    to: '/configurations/poly-x-google-meet/', as: 'anna', label: 'Open the video bar setup guide',
    steps: ['Open the setup guide for the video bar: the settings in order, beside the device.', 'Press ? to switch Help on, then point at three things on the page.'],
  },
  problems: {
    to: '/incidents/', as: 'priya', label: 'Open Incidents',
    steps: ['Open Incidents: each one names its space and its device.', 'Open one: the evidence is on the record, with where each line came from.'],
  },
  modules: {
    to: '/', as: 'liam', label: 'Open Home as Liam',
    steps: ['Open Home as Liam: his first screen is built from the places his work uses.', 'Open Settings (the gear): it switches modules on, connected or off. Next: each module On, Connected or Off.'],
  },
  'how-the-work-gets-done': {
    to: '/changes/', as: 'nora', label: 'Open Proposals',
    steps: ['Open Proposals: every edit to a standard, who proposed it and who approved it.', 'In v0.1 automatic work is simulated. Next: standing rules with "How was this done?" on every run.'],
  },
  trust: {
    to: '/device/?tag=AG-000335', as: 'liam', label: 'Open the Whooper Swan video bar',
    steps: ['Open the video bar in 3.09 Whooper Swan: where it is, what it is connected to, and its history.', 'Every line of history names who, what and when.'],
  },
  words: {
    to: '/search/?q=known%20error', label: 'Search the demo',
    steps: ['Search the demo for a word from the table, such as "known error".', 'The same word is used on every page that shows it.'],
  },
  level1: {
    to: '/', as: 'liam', label: 'Open Home as Liam',
    steps: ['Open Home as Liam: the page opens with its answer, then four figures.', 'Press ? and point at anything: the help explains the screen you are on.'],
  },
};

const sec = (num) => SECTIONS[num];
// Level 2 in the method's own order (2.1 to 2.9), then Level 3.
export const PAGES = [
  { slug: 'problems', num: '2.1', level: 2, title: sec('2.1').title, short: 'The problems' },
  ...IDEAS.map((i) => ({ slug: i.slug, num: i.num, level: 2, title: i.name, short: i.name, idea: i.n })),
  { slug: 'modules', num: '2.7', level: 2, title: sec('2.7').title, short: 'Modules' },
  { slug: 'how-the-work-gets-done', num: '2.8', level: 2, title: sec('2.8').title, short: 'How the work gets done' },
  { slug: 'trust', num: '2.9', level: 2, title: sec('2.9').title, short: 'Trust' },
  { slug: 'words', num: '3.1', level: 3, title: 'Words, mapped to ITIL, PMI and ISO', short: 'Words' },
].map((p) => ({ ...p, to: `/method/${p.slug}/`, try: TRY[p.slug] }));
export const LEVEL1_TRY = TRY.level1;
export const pageBySlug = (slug) => PAGES.find((p) => p.slug === slug);
export const LEVELS = [
  { n: 0, name: 'The sentence', time: 'five seconds' },
  { n: 1, name: 'One screen', time: 'minutes' },
  { n: 2, name: 'The practices', time: 'an afternoon' },
  { n: 3, name: 'The reference', time: 'as needed' },
];
