// Keia Atlas's words, in plain language. Lessons link to these (hover a dotted word for its meaning), and
// Learn lists them all under Glossary. Files starting with _ are not pages.
export const GLOSSARY = [
  { id: 'device-profile', term: 'Device type', def: 'A kind of device, such as "Video bar": what it is for and what healthy looks like. It names no product.', to: '/profiles/' },
  { id: 'model', term: 'Model', def: 'One product from one manufacturer, such as the Poly Studio X52, with its ports, size and power. One device type has several models.', to: '/models/' },
  { id: 'maker', term: 'Manufacturer', def: 'Who makes a model, such as Poly, Logitech or Ubiquiti. A vendor is different: a company that installs or looks after devices for Aigna.', to: '/models/' },
  { id: 'unit', term: 'Unit', def: 'One physical device, with its own serial number, asset tag and history, from the day it is ordered to the day it is taken out. Often just called a device. All of them are listed under Devices, Units.', to: '/devices/' },
  { id: 'lifecycle', term: 'Lifecycle', def: 'The five steps of a unit\'s life, each with its status word: plan (Ordered), procure (Procured), deploy (Being installed), manage (In service) and retire (Retired).' },
  { id: 'configuration', term: 'Setup guide', def: 'The settings Aigna uses for a model, in the order to do them, each marked Set or Verify.', to: '/configurations/' },
  { id: 'set', term: 'Set', def: 'A setting you must change from the manufacturer\'s default to Aigna\'s value.' },
  { id: 'verify', term: 'Verify', def: 'A setting where the manufacturer\'s default is already right. You check it and tick it.' },
  { id: 'room-profile', term: 'Space type', def: 'A kind of space, such as "Conference room, large": its size, the devices it needs and how they are wired.', to: '/room-profiles/' },
  { id: 'build-option', term: 'Build option', def: 'One of the ways a space type can be built, such as dual display or single display.' },
  { id: 'room', term: 'Space', def: 'Any place technology lives, such as the meeting room 20.05 Curlew at the New York office, a comms room or a home office. It is built to one space type and one build option.', to: '/rooms/' },
  { id: 'site', term: 'Office', def: 'One of the ten offices, such as the New York office, or one of the three remote groups (Remote Americas, Remote EMEA and Remote APAC) that hold the home offices of a region.' },
  { id: 'home-office', term: 'Home office', def: 'The space someone works from at home, with the kit Aigna provides: a monitor, a dock on the Mac option, and a gateway for the home network. Each is a space at Remote EMEA, Remote Americas or Remote APAC, labelled by town and number. Laptops and phones are not tracked.', to: '/rooms/?kind=kits' },
  { id: 'it-store', term: 'IT store', def: 'An office\'s locked storage room, with numbered shelves in cabinets. It holds the spare units, the parts and the cords, so a failed unit can be swapped the same day. Each store has a least-to-keep for every model.', to: '/spares/' },
  { id: 'spare', term: 'Spare', def: 'A unit waiting on a shelf in an IT store, with its own serial number and asset tag, ready to swap in for one that fails. Cords, mounts and parts without a serial number are counted stock instead, checked against a minimum.', to: '/spares/' },
  { id: 'base', term: 'Base', def: 'Where a person works on a normal day: an office, or their home office. With their office days, it tells the schedule where everyone is.' },
  { id: 'hostname', term: 'Hostname', def: 'A device\'s name, which says where it is: nyc-2005-vc01 is New York, space 20.05, the first video conferencing device.' },
  { id: 'standard', term: 'The standard', def: 'The models, firmware and settings Aigna has agreed to use. Every new install is built to it.' },
  { id: 'firmware', term: 'Firmware', def: 'The software inside a device. A new version is tested in the Lab before it becomes the standard.' },
  { id: 'lab', term: 'The Lab', def: 'Where new devices and firmware are tested before anyone installs them in a space.', to: '/lab/' },
  { id: 'advisory', term: 'Advisory', def: 'A warning attached to a model or a firmware version, such as "do not install version 5".' },
  { id: 'known-issue', term: 'Known error', def: 'A fault a manufacturer has published about its own firmware, with the versions it affects, any fix and any workaround. Keia Atlas reads them with the firmware list and shows which units run an affected version.', to: '/known-issues/' },
  { id: 'maker-case', term: 'Manufacturer case', def: 'Something Aigna raised with a manufacturer through its support route, such as a fault that keeps coming back across the fleet. Keia Atlas prepares the evidence; a person sends it and records what the manufacturer says.', to: '/known-issues/#maker-cases' },
  { id: 'change', term: 'Proposal', def: 'A proposed edit to Keia Atlas\'s knowledge, such as a standard, a setup guide or a playbook. Nothing changes until the owner approves it; then it shows everywhere.', to: '/changes/' },
  { id: 'approve', term: 'Approve', def: 'The owner of that piece of knowledge accepts a proposal. Keia Atlas keeps who approved what, and why.' },
  { id: 'service-manager', term: 'Service manager', def: 'Owns part of the standard, such as AV devices or the network, and approves changes to it.' },
  { id: 'help', term: 'Help', def: 'The ? switch at the top of every page. While it is on, anything with a dotted outline explains what it is and what to do with it when you point at it, with a link to learn more.' },
  { id: 'report', term: 'Report', def: 'The button at the top of every page: propose an edit, log new firmware or raise an urgent issue, in under 30 seconds.' },
  { id: 'incident', term: 'Incident', def: 'Something broken that someone reported, such as a space with no video. It has a priority and an owner.', to: '/incidents/' },
  { id: 'room-guide', term: 'Room guide', def: 'The page the QR code on a space\'s table opens, for anyone using the room: how to start a meeting and share a screen, and a two-tap way to report a problem or ask for something. What they send arrives on the Incidents board and the space\'s page.' },
  { id: 'request', term: 'Request', def: 'Someone asking for something that is not broken, such as help setting up a space, a change to a space or home office kit. The service desk that will handle requests is being built.' },
  { id: 'on-hold', term: 'On hold', def: 'An incident waiting on something outside the team: the caller, a vendor, a change or parts. It always says which, and for how long.', to: '/incidents/' },
  { id: 'resolution', term: 'Resolution', def: 'How an incident ended: fixed, a workaround, no fault found, a duplicate or cancelled, with notes. A resolved incident that comes back is reopened, with a note saying why.', to: '/incidents/' },
  { id: 'work-note', term: 'Work note', def: 'A note on a ServiceNow ticket for the team, not the caller. Keia Atlas drafts one from what it found; someone approves it before it is added.', to: '/incidents/' },
  { id: 'project', term: 'Project', def: 'A piece of work with a start and an end, such as a video bar refresh at one office.', to: '/projects/' },
  { id: 'playbook', term: 'Playbook', def: 'The recipe a kind of project follows: its phases, its steps, who does each one, and the gates.', to: '/playbooks/' },
  { id: 'phase', term: 'Phase', def: 'One part of a project: plan, design, procure, deploy, hand over, closed. A playbook may skip phases it does not need.' },
  { id: 'integrate', term: 'Deploy', def: 'The phase where the devices go in and start working. Each device goes through four steps: provision, install, configure and commission.' },
  { id: 'batch', term: 'Batch', def: 'The units in a project that share one setup guide, such as three video bars, set up together: the shared settings once, then only what differs per unit.' },
  { id: 'provision', term: 'Provision', def: 'Making a device\'s records in the systems before or as it arrives: asset record, address and DNS, device management, booking, monitoring, licence and firmware check. The first step of Deploy.' },
  { id: 'configure', term: 'Configure', def: 'Setting a device up from its setup guide, in the setup order, then working through each Set and Verify setting. The third step of Deploy, after install.' },
  { id: 'commission', term: 'Commission', def: 'Checking the space works as a whole: its verification, a test call and the device type\'s healthy checks. The last step of Deploy.' },
  { id: 'gate', term: 'Gate', def: 'The sign-off at the end of a phase. The next phase starts once it is signed.' },
  { id: 'task', term: 'Task', def: 'One job on a project, with an owner and a due date. Anyone on the project can add one.' },
  { id: 'captured-fix', term: 'Captured fix', def: 'One sentence written when a task closes, about anything the guide did not cover. Fixes that keep helping become part of the standard.' },
  { id: 'raci', term: 'RACI', def: 'Who does a step (Responsible), who signs it off (Accountable), who is asked first (Consulted) and who is told after (Informed).' },
  { id: 'home-page', term: 'Home page', def: 'Your first screen, built for your role: tasks, an inbox, projects or incidents.', to: '/' },
  { id: 'view-as', term: 'View as', def: 'Shows Keia Atlas the way another role sees it. The home page and the order of the sidebar follow the role.' },
  { id: 'agent', term: 'Agent', def: 'Software that does routine work under a standing rule. It changes only what its rule allows, and only what can be put back. Anything that cannot be put back is a proposal a person confirms. It is named in "How was this done?" and in Settings, never on the top layer.' },
  { id: 'module', term: 'Module', def: 'A part of Keia Atlas a team switches on or off. On means built in, Connected means an outside tool feeds it (each figure shows its source and time), and Off means not used. A team starts anywhere.' },
  { id: 'standing-rule', term: 'Standing rule', def: 'A routine job that a named owner approved once, with its conditions and its way back, so software may run it. Nothing runs outside it, and the owner is told on every run.' },
  { id: 'ready-for-you', term: 'Ready for you', def: 'Prepared and waiting for you.' },
  { id: 'with', term: 'With', def: 'Who holds the work now, and why, such as "With Aoife", "With Network team" or "With Poly (vendor)".' },
  { id: 'to-review', term: 'To review', def: 'A person should look. Nothing is broken yet.' },
  { id: 'waiting-on', term: 'Waiting on', def: 'Stopped until something outside the record moves. It says what for, such as "Waiting on: the vendor".' },
  { id: 'unable-to-complete', term: 'Unable to complete', def: 'It did not happen. It says why, and where it stopped.' },
  { id: 'past-due', term: 'Past due', def: 'Later than promised. It says since when.' },
  { id: 'done-automatically', term: 'Done automatically', def: 'Run under a standing rule, read back and recorded. "How was this done?" opens what it read and did.' },
  { id: 'mdf', term: 'MDF', def: 'The building\'s main comms room: core switches, firewalls and the internet circuits.' },
  { id: 'idf', term: 'IDF', def: 'A comms room on each floor, where the floor\'s data outlets end on patch panels and switches.' },
];
export const TERM = Object.fromEntries(GLOSSARY.map((g) => [g.id, g]));

// Lesson text uses [[id]] or [[id|words]] for a glossary word and **words** for bold.
export function rich(s) {
  return String(s)
    .replace(/\[\[([a-z-]+)(?:\|([^\]]+))?\]\]/g, (m, id, label) => {
      const g = TERM[id];
      if (!g) throw new Error(`Learn: no glossary term "${id}"`);
      return `<a class="gl-t" href="#g-${id}" data-term="${id}">${label ?? g.term.toLowerCase()}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}
