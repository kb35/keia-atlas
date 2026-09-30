// The front door's shared constants: the lifecycle stages the strip and the page both use, and the evidence the
// problem section quotes. Pure: no data, no browser. The figures are quoted from the research notes' strongest rows
// (VALUE-SCAN and PAIN-SCAN, Sept 2026) and carry their source and its strength; nothing here rounds a figure up.

export const STAGES = [
  { id: 'see', word: 'See', what: 'every office, one record' },
  { id: 'plan', word: 'Plan', what: 'the year ahead' },
  { id: 'deliver', word: 'Deliver', what: 'a new floor, in batches' },
  { id: 'maintain', word: 'Maintain', what: 'kept right, quietly' },
  { id: 'fix', word: 'Fix', what: 'five clicks, on the record' },
  { id: 'improve', word: 'Improve', what: 'the record learns' },
];

// Three numbers. `figure` is drawn large and still; `line` says what it counts; `source` names who found it and how.
export const EVIDENCE = [
  {
    id: 'rooms', figure: '3 in 4', unit: 'hybrid meetings', line: 'have at least one technology failure, costing about 11 minutes each.',
    source: 'Toluna for Jabra, June 2026: 2,300 people in seven countries. Vendor-sponsored.',
    url: 'https://www.avinteractive.com/news/collaboration/three-quarters-of-hybrid-meetings-experience-tech-failures-27-08-2026/',
  },
  {
    id: 'lost', figure: '3 h 18 min', unit: 'lost per IT incident', line: 'the time the person who reported it says they lost.',
    source: 'HappySignals Global IT Experience Benchmark 2026: about 2 million responses. Vendor data, self-estimated.',
    url: 'https://www.happysignals.com/news-and-press-releases/happysignals-global-benchmark-2026-employees-lose-more-than-three-hours-of-productivity-per-it-incident',
  },
  {
    id: 'handoff', figure: '2 h to 9 h 28 min', unit: 'as a job changes hands', line: 'every reassignment adds lost time. Having to explain twice is measurable.',
    source: 'HappySignals Global IT Experience Benchmark 2025: 2.28 million responses. Vendor data, self-estimated.',
    url: 'https://www.happysignals.com/global-it-experience-benchmark-2025',
  },
];
