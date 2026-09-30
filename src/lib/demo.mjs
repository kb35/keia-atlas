// The demo layer: who you can sign in as, what each role is responsible for, and the six adoption
// stages. People are made up. Stage 1 is real; stages 2 to 6 run on
// simulated systems and say so on the page.
import { demoShift } from './demo-clock.mjs';

// Roles are Aigna's own, not any real company's job titles. Each says what the role owns,
// what it decides, and what it hands to someone else.
export const ROLES = {
  head: {
    name: 'Head of AV and IT', team: 'leadership',
    owns: ['The AV and IT service across all regions', 'Budget and headcount'],
    decides: ['Approves the year plan', 'Signs off new standards'],
    hands: 'Runs the service through the two service managers and the programme manager.',
  },
  'sm-av': {
    name: 'Service manager, AV', team: 'av-it',
    owns: ['Device types and setup guides', 'The house standard for every space type', 'Which firmware is standard'],
    decides: ['What goes into the standard after a Lab test', 'Design sign-off for AV'],
    hands: 'Asks the Lab to test before anything new enters the standard.',
  },
  'sm-infra': {
    name: 'Service manager, IT infrastructure', team: 'it-infra',
    owns: ['Switches, VLANs and addressing', 'Comms rooms: the MDF and each IDF', 'ISP circuits'],
    decides: ['Network changes and port standards', 'Design sign-off for network'],
    hands: 'Network tasks go to the network engineer.',
  },
  programme: {
    name: 'Programme manager', team: 'delivery',
    owns: ['The year plan', 'Sequencing and budget across projects', 'Which project manager runs what'],
    decides: ['When a project starts and in what order', 'Phase gates across the programme'],
    hands: 'Each project is run day to day by a project manager.',
  },
  'delivery-manager': {
    name: 'Delivery manager', team: 'delivery',
    owns: ['Delivery headcount, skills and training across all regions: one delivery manager for the whole team', 'The leads for engineers, project managers and on-site technicians', 'Who is free for which project when regions compete for people'],
    decides: ['How people are shared between regions', 'Hiring plans for delivery'],
    hands: 'The leads staff their own teams day to day; the delivery manager steps in across regions.',
  },
  'eng-manager': {
    name: 'Engineering manager, AV and IT delivery', team: 'delivery',
    owns: ['The AV and IT delivery engineers in every region: staffing, workload, skills and one-to-ones', 'Escalations from engineers and project managers about design or commissioning'],
    decides: ['Which engineer is put on which project', 'When a project needs a second engineer or a vendor'],
    hands: 'Reports to the delivery manager. Questions about the standard go to the service managers.',
  },
  'pm-manager': {
    name: 'Project management lead', team: 'delivery',
    owns: ['The project managers they lead: staffing, workload, skills and one-to-ones', 'Escalations about dates, budget and projects waiting on something'],
    decides: ['Which project manager runs which project', 'When a late project is escalated to the programme manager'],
    hands: 'Reports to the delivery manager. Which project starts and when stays with the programme manager.',
  },
  'tech-manager': {
    name: 'On-site services manager', team: 'onsite',
    owns: ['The on-site IT technicians in their part of the world (Americas, or EMEA and Asia Pacific): rotas, site cover, skills and one-to-ones', 'Escalations when a technician cannot fix something from the guide'],
    decides: ['Who covers which site, including holidays and sickness', 'Whether a site needs extra hands for a project'],
    hands: 'Reports to the delivery manager. Technicians escalate to the delivery engineer for anything the guide does not cover.',
  },
  pm: {
    name: 'Project manager', team: 'delivery',
    owns: ['One project, day to day: dates, tasks, risks', 'Vendors and access to site', 'Handover pack'],
    decides: ['Task order and who does what', 'When a phase is ready for its gate'],
    hands: 'Engineering decisions go to the delivery engineer; standard changes to the service managers; a late project, or one waiting on something, goes to the project management lead.',
  },
  delivery: {
    name: 'AV and IT delivery engineer', team: 'delivery',
    owns: ['Space designs and signal routes', 'Commissioning and verification', 'Captured fixes'],
    decides: ['How a space is built to the standard', 'Whether a space passes commissioning'],
    hands: 'Installs go to technicians or a vendor; network changes to IT infrastructure.',
  },
  network: {
    name: 'Network engineer', team: 'it-infra',
    owns: ['Switch ports, VLANs and address reservations', 'Patching in the MDF and IDFs'],
    decides: ['Which port and VLAN a device gets'],
    hands: 'Works from tasks raised by projects and incidents.',
  },
  innovation: {
    name: 'Innovation engineer', team: 'av-it',
    owns: ['The Lab: new devices, firmware and features', 'Test plans and results'],
    decides: ['Whether a candidate passes the Lab'],
    hands: 'A pass goes to the service manager, who decides whether it enters the standard.',
  },
  tech: {
    name: 'On-site technician', team: 'onsite',
    owns: ['Installs, swaps and first-line fixes on site'],
    decides: ['Whether a fault needs escalating'],
    hands: 'Escalates to the delivery engineer when the fix is not in the guide; rotas and cover go through the on-site services manager.',
  },
  desk: {
    name: 'Service desk analyst', team: 'service-desk',
    owns: ['Incidents as they arrive in ServiceNow', 'First triage'],
    decides: ['Priority and which group gets it'],
    hands: 'Space and device incidents go to on-site technicians.',
  },
  vendor: {
    name: 'Integration vendor', team: 'vendor',
    owns: ['Design detail and installation for their projects', 'Recording serial numbers and MAC addresses'],
    decides: ['Nothing in the standard; flags problems as snags'],
    hands: 'Their records are checked by the delivery engineer before they count.',
  },
  'service-vendor': {
    name: 'Service vendor', team: 'vendor',
    owns: ['Break-fix under the maintenance contract', 'Advance replacement of failed units'],
    decides: ['Repair or replace, within the contract'],
    hands: 'Takes incidents the on-site technician can\'t fix; reports back on the ticket.',
  },
};

export const TEAMS = {
  leadership: 'Leadership', 'av-it': 'AV service', delivery: 'Delivery', onsite: 'On site', 'it-infra': 'IT infrastructure', 'service-desk': 'Service desk', vendor: 'Vendors',
};
export const REGION_SHORT = { amer: 'Americas', emea: 'EMEA', apac: 'APAC' };

// How the team is sized (the house ratio model, data/planning/ratios.yaml; the estate is 10 offices, 188
// rooms with technology in them, about 1,500 staff (home offices included) and 104 home offices). Made up.
//   Technicians: one for every 30 rooms and every 250 staff in a region. Americas 95 rooms, 743 staff: 4.
//     EMEA 53 rooms, 442 staff: 2. Asia Pacific 40 rooms, 324 staff needs 2, but its three offices are in
//     three time zones, so there is one at each: 3, every ratio under target.
//   Delivery engineers: one for every 70 rooms in a region. Americas 2, EMEA 1, Asia Pacific 1.
//   Network engineers: one for every 6 offices. 10 offices: 2 (Marco Bianchi for the Americas and EMEA, and
//     one for Asia Pacific).
//   Project managers: one for every 4 projects open at once. 13 open: 4, so 3 or 4 projects each.
//   Managers: one delivery manager for the whole team, and a lead only where a group has 4 or more people.
//     Engineers (4), project managers (4) and technicians (Americas 4; EMEA and Asia Pacific 5) each qualify
//     once, so there is no manager per region for engineers or project managers, and one on-site services
//     manager for the Americas and one for EMEA and Asia Pacific. That is the delivery manager and four leads for 17 people.
// Who reports to whom (people managers, not project work). Vendors are outside the line: they work
// with a project manager but report to their own company. Made up.
const REPORTS_TO = {
  anna: 'finn', marcus: 'finn', mei: 'finn', camila: 'finn',
  liam: 'yusuf', tom: 'yusuf', arjun: 'yusuf', kenji: 'yusuf', ruby: 'yusuf',
  carlos: 'denise', elena: 'denise', grace: 'denise', nathan: 'denise',
  ruth: 'ingrid', david: 'ingrid', hana: 'ingrid', katya: 'ingrid',
  finn: 'olivia', ingrid: 'olivia', yusuf: 'olivia', denise: 'olivia',
  olivia: 'claire', tomas: 'claire', sofia: 'claire', declan: 'claire', priya: 'claire',
  nora: 'sofia', marco: 'declan', farah: 'declan',
};

// Where each person works (decision 0025), for the Schedule's Day and Week views. `base` is where they
// are on a normal working day: an office (site id) or their home office (a room at a remote site).
// `office` is the office they go to on office days, and `office_days` which days those are. Vendors
// are based at the site they are working on. Made up.
const WD = ['mon', 'tue', 'wed', 'thu', 'fri'];
const BASES = {
  anna: { base: 'rem-maynooth-01', office: 'dub', office_days: ['tue', 'thu'] },
  marcus: { base: 'ram-hoboken-01', office: 'nyc', office_days: ['mon', 'wed', 'thu'] },
  mei: { base: 'rap-tampines-01', office: 'sin', office_days: ['tue', 'wed', 'thu'] },
  olivia: { base: 'dub', office_days: ['mon', 'tue', 'wed', 'thu'] },
  finn: { base: 'dub', office_days: ['mon', 'tue', 'wed', 'thu'] },
  ingrid: { base: 'cph', office_days: ['mon', 'tue', 'wed', 'thu'] },
  yusuf: { base: 'lon', office_days: WD },
  denise: { base: 'chi', office_days: WD },
  liam: { base: 'dub', office_days: WD }, tom: { base: 'lon', office_days: WD }, carlos: { base: 'nyc', office_days: WD },
  grace: { base: 'chi', office_days: WD }, arjun: { base: 'sin', office_days: WD }, kenji: { base: 'tyo', office_days: WD }, ruby: { base: 'mel', office_days: WD },
  priya: { base: 'rem-swords-01', office: 'dub', office_days: ['mon', 'wed'] },
  ruth: { base: 'rem-bray-01', office: 'dub', office_days: ['tue', 'wed', 'thu'] },
  david: { base: 'ram-stamford-01', office: 'nyc', office_days: ['tue', 'wed', 'thu'] },
  hana: { base: 'rap-yokohama-01', office: 'tyo', office_days: ['tue', 'thu'] },
  marco: { base: 'rem-watford-01', office: 'lon', office_days: ['mon', 'wed'] },
  sofia: { base: 'dub', office_days: ['mon', 'tue', 'wed', 'thu'] },
  declan: { base: 'dub', office_days: ['mon', 'tue', 'wed', 'thu'] },
  nora: { base: 'dub', office_days: WD },
  tomas: { base: 'rem-naas-01', office: 'dub', office_days: ['tue', 'wed', 'thu'] },
  claire: { base: 'dub', office_days: ['mon', 'tue', 'wed', 'thu'] },
  elena: { base: 'nyc', office_days: WD }, nathan: { base: 'tor', office_days: WD },
  camila: { base: 'ram-evanston-01', office: 'chi', office_days: ['tue', 'wed', 'thu'] },
  katya: { base: 'rem-drogheda-01', office: 'dub', office_days: ['tue', 'thu'] },
  farah: { base: 'sin', office_days: WD },
  sam: { base: 'jnu', office_days: WD }, lena: { base: 'dub', office_days: WD }, dev: { base: 'nyc', office_days: WD },
};
// A home office is a room id at a remote site ("rem-bray-01"); an office is a three-letter site id.
export const isHomeOffice = (base) => /^r(em|am|ap)-/.test(base ?? '');

export const PEOPLE = [
  { id: 'anna', name: 'Anna Byrne', roleId: 'delivery', region: 'emea', scope: 'Europe, Middle East and Africa', initials: 'AB' },
  { id: 'marcus', name: 'Marcus Lee', roleId: 'delivery', region: 'amer', scope: 'Americas', initials: 'ML' },
  { id: 'mei', name: 'Mei Tan', roleId: 'delivery', region: 'apac', scope: 'Asia Pacific', initials: 'MT' },
  { id: 'camila', name: 'Camila Ortiz', roleId: 'delivery', region: 'amer', scope: 'Americas', initials: 'CO' },
  { id: 'olivia', name: 'Olivia Grant', roleId: 'delivery-manager', scope: 'The whole delivery team: engineers, project managers and technicians, all regions', initials: 'OG', city: 'Dublin', citySite: 'dub' },
  { id: 'finn', name: 'Finn Gallagher', roleId: 'eng-manager', region: 'emea', scope: 'Delivery engineers in all regions', initials: 'FG', city: 'Dublin', citySite: 'dub', covers: ['emea', 'amer', 'apac'] },
  { id: 'ingrid', name: 'Ingrid Larsen', roleId: 'pm-manager', region: 'emea', scope: 'Project managers in all regions', initials: 'IL', city: 'Copenhagen', citySite: 'cph', covers: ['emea', 'amer', 'apac'] },
  { id: 'yusuf', name: 'Yusuf Demir', roleId: 'tech-manager', region: 'emea', scope: 'On-site technicians in EMEA and Asia Pacific', initials: 'YD', city: 'London', citySite: 'lon', covers: ['emea', 'apac'] },
  { id: 'denise', name: 'Denise Carter', roleId: 'tech-manager', region: 'amer', scope: 'On-site technicians in the Americas', initials: 'DC', city: 'Chicago', citySite: 'chi', covers: ['amer'] },
  { id: 'liam', name: 'Liam Doyle', roleId: 'tech', region: 'emea', site: 'dub', scope: 'Dublin office', initials: 'LD' },
  { id: 'tom', name: 'Tom Ashby', roleId: 'tech', region: 'emea', site: 'lon', scope: 'London office; covers Copenhagen', initials: 'TA' },
  { id: 'carlos', name: 'Carlos Mendes', roleId: 'tech', region: 'amer', site: 'nyc', scope: 'New York office', initials: 'CM' },
  { id: 'elena', name: 'Elena Vasquez', roleId: 'tech', region: 'amer', site: 'nyc', scope: 'New York office', initials: 'EV' },
  { id: 'grace', name: 'Grace Kim', roleId: 'tech', region: 'amer', site: 'chi', scope: 'Chicago office', initials: 'GK' },
  { id: 'nathan', name: 'Nathan Cho', roleId: 'tech', region: 'amer', site: 'tor', scope: 'Toronto office; covers Juneau', initials: 'NC' },
  { id: 'arjun', name: 'Arjun Rao', roleId: 'tech', region: 'apac', site: 'sin', scope: 'Singapore office', initials: 'AR' },
  { id: 'kenji', name: 'Kenji Sato', roleId: 'tech', region: 'apac', site: 'tyo', scope: 'Tokyo office', initials: 'KS' },
  { id: 'ruby', name: 'Ruby Chen', roleId: 'tech', region: 'apac', site: 'mel', scope: 'Melbourne office', initials: 'RC' },
  { id: 'priya', name: 'Priya Nair', roleId: 'desk', scope: 'All sites', initials: 'PN' },
  { id: 'ruth', name: 'Ruth Kelly', roleId: 'pm', region: 'emea', scope: 'Projects in Europe; the New York and Juneau projects', initials: 'RK' },
  { id: 'katya', name: 'Katya Novak', roleId: 'pm', region: 'emea', scope: 'Projects in Europe', initials: 'KN' },
  { id: 'david', name: 'David Okoro', roleId: 'pm', region: 'amer', scope: 'Projects in the Americas', initials: 'DO' },
  { id: 'hana', name: 'Hana Mori', roleId: 'pm', region: 'apac', scope: 'Projects in Asia Pacific', initials: 'HM' },
  { id: 'marco', name: 'Marco Bianchi', roleId: 'network', scope: 'Americas and EMEA', initials: 'MB' },
  { id: 'farah', name: 'Farah Idris', roleId: 'network', region: 'apac', scope: 'Asia Pacific', initials: 'FI' },
  { id: 'sofia', name: 'Sofia Reyes', roleId: 'sm-av', scope: 'Owns device types and setup guides', initials: 'SR' },
  { id: 'declan', name: 'Declan Moore', roleId: 'sm-infra', scope: 'Network, comms rooms (MDF and IDF)', initials: 'DM' },
  { id: 'nora', name: 'Nora Walsh', roleId: 'innovation', scope: 'The Lab: new devices and firmware', initials: 'NW' },
  { id: 'tomas', name: 'Tomás Varga', roleId: 'programme', scope: 'Fit-outs, refreshes and the year plan', initials: 'TV' },
  { id: 'claire', name: 'Claire Dunne', roleId: 'head', scope: 'All regions', initials: 'CD' },
  { id: 'sam', name: 'Sam Okafor', roleId: 'vendor', scope: 'Northlight AV · Juneau office fit-out', initials: 'SO', vendor: 'northlight', vendorName: 'Northlight AV', projects: ['PRJ-14'] },
  { id: 'lena', name: 'Lena Fischer', roleId: 'vendor', scope: 'Brightwave Integration · Dublin office town hall', initials: 'LF', vendor: 'brightwave', vendorName: 'Brightwave Integration', projects: ['PRJ-15'] },
  { id: 'dev', name: 'Dev Patel', roleId: 'service-vendor', scope: 'Keystone Service · maintenance contract', initials: 'DP', vendor: 'keystone', vendorName: 'Keystone Service', projects: [] },
].map((p) => ({
  ...p, role: ROLES[p.roleId].name, team: ROLES[p.roleId].team, reportsTo: REPORTS_TO[p.id] ?? null,
  base: BASES[p.id].base, office: BASES[p.id].office ?? BASES[p.id].base, office_days: BASES[p.id].office_days, home: isHomeOffice(BASES[p.id].base),
  // Where the role is based, shown with the role in "View as": the site for technicians, the region for
  // engineers and project managers, the company for vendors, otherwise every region.
  where: p.vendorName ?? (p.city && p.region ? `${p.covers?.length === 3 ? 'All regions' : (p.covers ?? [p.region]).map((r) => ({ amer: 'Americas', emea: 'EMEA', apac: 'APAC' }[r])).join(' and ')}, based in ${p.city}` : p.city ? `All regions, based in ${p.city}` : p.site ? p.scope.split(';')[0] : p.region ? { amer: 'Americas', emea: 'EMEA', apac: 'APAC' }[p.region] : p.roleId === 'network' ? 'Americas and EMEA' : 'All regions'),
}));
export const MANAGER_ROLES = ['eng-manager', 'pm-manager', 'tech-manager'];
// Who can add a task to a project that is not in its playbook: the delivery roles and the people who manage them.
export const TASK_ADDERS = ['pm', 'delivery', 'tech', ...MANAGER_ROLES, 'delivery-manager'];
export const person = (id) => PEOPLE.find((p) => p.id === id) ?? PEOPLE[0];

// What someone does on one project. Separate from their job: a delivery engineer can be the lead
// engineer on one project and a reviewer on another.
export const PROJECT_ROLE = {
  programme: 'Programme manager', pm: 'Project manager', lead: 'Lead engineer', engineer: 'Engineer',
  network: 'Network engineer', lab: 'Lab testing', technician: 'Technician', 'service-owner': 'Service owner (sign-off)', vendor: 'Vendor installer',
};

// What was already waiting in the service managers' inboxes when the demo starts. Reports sent from
// any page's Report button join these (saved in the browser under rs4-inbox). Made up.
export const INBOX_SEED = [
  { id: 'RPT-097', kind: 'urgent', to: 'sofia', by: 'sam', at: demoShift('2026-09-28T09:40'), status: 'new',
    about: { kind: 'device', label: 'Heron video bar, Juneau office', to: '/rooms/jnu-2-02/' },
    fields: { happened: 'The new Studio X52 arrived on VideoOS 4.7.0, which is still in the Lab. The setup guide is written for 4.6.2, so I stopped before provisioning. Do we downgrade to 4.6.2 or go ahead on 4.7.0?', blocks: "Yes, I can't continue" } },
  { id: 'RPT-096', kind: 'firmware', to: 'sofia', by: 'sam', at: demoShift('2026-09-28T09:32'), status: 'new',
    about: { kind: 'model', label: 'Poly Studio X52', to: '/profiles/video-bar/poly-studio-x52/' },
    fields: { model: 'Poly Studio X52', version: '4.7.0-466077', how: 'Arrived from the factory with it', works: 'Something is different or broken', notes: 'Six of the eight units for PRJ-14 shipped on 4.7.0, which is still in the Lab (LAB-07). Standard is 4.6.2.' } },
  { id: 'RPT-095', kind: 'urgent', to: 'declan', by: 'liam', at: demoShift('2026-09-27T16:10'), status: 'new',
    about: { kind: 'comms', label: 'Dublin office IDF, floor 4', to: '/rooms/dub-4-21/' },
    fields: { happened: 'Access switch 2 in the floor 4 IDF shows a failed power supply. Spaces on floor 4 still have power over Ethernet from the second supply.', blocks: 'No, but it needs fixing' } },
  { id: 'RPT-094', kind: 'change', to: 'sofia', by: 'liam', at: demoShift('2026-09-26T12:20'), status: 'new',
    about: { kind: 'config', label: 'TC10 paired to its room system', to: '/profiles/touch-controller/#configuration' },
    fields: { what: 'Pairing step', now: 'Find the TC10 by its MAC address and select Pair', should: 'Wait for the TC10 to finish its own update first (about 10 minutes out of the box), then pair', why: 'Pairing during the TC10 update failed three times in Curlew. After the update it paired first time.' } },
];
