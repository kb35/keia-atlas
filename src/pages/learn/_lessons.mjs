// Learn's two tracks. "Using Keia Atlas" teaches the application, one bite-size lesson at a time, each with a
// hands-on try (drawn by components/LessonTry.astro) and each following one of the Keia Method's five ideas
// (docs/keia-method.md, Level 1). "How the team works" is for people new to the team.
// Written for people used to spreadsheets, email and tickets. Files starting with _ are not pages.

// The Keia Method's five ideas, in the method's order. A "Using" lesson names the idea it follows (idea: n).
export const IDEAS = [
  { n: 1, name: 'Start from the building' },
  { n: 2, name: 'Capture, don\'t ask' },
  { n: 3, name: 'Answer first' },
  { n: 4, name: 'Own it, hand it on' },
  { n: 5, name: 'Learn as you go' },
];

// "Why it matters to you" is written four ways; each role reads the one closest to its work.
export const GROUP = {
  tech: 'field', desk: 'field', 'service-vendor': 'field',
  delivery: 'build', network: 'build', innovation: 'build', vendor: 'build',
  'sm-av': 'own', 'sm-infra': 'own',
  pm: 'lead', programme: 'lead', 'delivery-manager': 'lead', head: 'lead',
};
export const GROUPS = ['field', 'build', 'own', 'lead'];

export const USING = [
  {
    id: 'help', title: 'Switch on help', icon: 'about', mins: 2, idea: 5,
    card: 'Point at anything to see what it is and what to do.',
    one: 'The [[help|Help]] switch, the round ? in the top bar, explains any page as you use it. With it on, everything that can explain itself gets a dotted outline. Point at one, or tap it once on a touch screen, and a small card says what it is, what to do with it, and where to learn more.',
    why: {
      field: 'On a page you do not use often, switch help on and point at the thing you are unsure of, instead of guessing or asking.',
      build: 'A new page, a new board or a new step: help tells you what each part is for before you change anything.',
      own: 'The cards use the same words as the glossary, so a term means one thing everywhere. If a card is wrong, use Report.',
      lead: 'Anyone new to the team can learn a screen by pointing at it, without a training session.',
    },
    like: 'The labels on a mixing desk: nothing changes until you touch it, but you can read what every knob does first.',
    task: 'Switch help on, then point at three different things: Report, Search and a place in the sidebar.',
    check: { q: 'You point at something and want more than the card says. What do you do?', a: [
      ['Nothing: the card is all there is', 0, 'There is more. Most cards end with a Learn more link.'],
      ['Follow Learn more on the card', 1, 'Right. It opens the lesson or the glossary entry for that thing.'],
      ['Ask the owner of the page', 0, 'You can, but the card and its lesson usually answer it first.'],
    ] },
    go: { help: true, label: 'Switch help on' },
  },
  {
    id: 'profiles', title: 'Device types, models and units', icon: 'profile', mins: 3, idea: 1,
    card: 'Device type, model, installed unit, and space type.',
    one: 'A [[device-profile|device type]] is a kind of device, a [[model]] is one product that fits it, and a [[unit]] is the real box, ordered, installed and one day taken out. A [[room-profile|space type]] is the same idea for spaces.',
    why: {
      field: 'When something breaks, the installed unit tells you exactly what is on the wall, and its profile tells you what healthy looks like and what to check first.',
      build: 'You design and build to profiles, not from memory. Pick the space type and the models, wiring and settings come with it.',
      own: 'Profiles are yours. Fix something once in a profile or a model and every space that uses it shows the fix.',
      lead: 'Profiles let you plan in plain terms: 40 video bars due for refresh, not 40 serial numbers in a spreadsheet.',
    },
    like: 'A job description (the profile), a candidate who fits it (the model) and the person actually sitting at the desk (the unit).',
    task: 'Start at the device types and find the real video bar in Curlew.',
    check: { q: 'The Poly Studio X72 is a...', a: [
      ['Device type', 0, 'Not quite. The profile is "Video bar", the kind of device. It names no product.'],
      ['Model', 1, 'Right. It is one product that can fill the video bar profile.'],
      ['Unit', 0, 'Not quite. A unit is one physical X72, with its own serial number.'],
    ] },
    go: { to: '/profiles/video-bar/', label: 'Open the video bar profile' },
  },
  {
    id: 'configurations', title: 'Setup guides: set and verify', icon: 'sliders', mins: 3, idea: 5,
    card: 'The settings for a model, in order, and how to tick them off.',
    one: 'A [[configuration]] is the list of settings for a model, in order. Each line is [[set|Set]] (change it) or [[verify|Verify]] (the default is right: check it and tick it).',
    why: {
      field: 'Swapping a unit? The setup guide gives you every setting, where it is in the menus and what to tick, so the new one behaves like the old one.',
      build: 'Every unit comes out the same, whoever sets it up. The order matters: automatic updates go off before anything else.',
      own: 'You decide the settings once. Every engineer and vendor sees the same list, with your reason next to each line.',
      lead: 'A space set up from the setup guide is a space that does not come back as an incident next week.',
    },
    like: 'A pre-flight checklist: some switches you flip, some you only check are already right, and you go in order.',
    task: 'Set up a new Studio X52: five settings, in order.',
    check: { q: 'A setting marked Verify means...', a: [
      ['Change it to Aigna\'s value', 0, 'That one is Set.'],
      ['The default is already right: check it and tick it', 1, 'Right. Verify lines are quick, but they still count.'],
      ['It is optional', 0, 'Every line in a setup guide counts. Verify lines are just quicker.'],
    ] },
    go: { to: '/configurations/poly-x-google-meet/', label: 'Open the X52 setup guide' },
  },
  {
    id: 'room', title: 'Start from the space', icon: 'room', mins: 3, idea: 1,
    card: 'Space type, build option, the devices and their health.',
    one: 'Every [[room]] is built from a [[room-profile|space type]] and one [[build-option|build option]], so Keia Atlas knows what should be in it, how it is wired and whether each device is healthy.',
    why: {
      field: 'When a space has a fault you check its health from your desk and follow the signal from source to screen, so you walk up the stairs knowing what to take.',
      build: 'The space page is your drawing, your equipment list and your wiring in one place, and it shows what is really installed.',
      own: 'Each space is checked against its profile, so anything missing or odd shows up without anyone auditing it.',
      lead: 'One look tells you whether a space is in service, being installed or waiting for a part.',
    },
    like: 'A recipe (the space type) and one dish cooked from it (the space). If the dish tastes wrong, you check it against the recipe.',
    task: 'Someone in Curlew plugs in their laptop and nothing shows on the second display. Find out why, the way the team would.',
    check: { q: 'Curlew is built to...', a: [
      ['Its own one-off design', 0, 'Not quite. One-off spaces are rare; most follow a space type.'],
      ['A space type and one of its build options', 1, 'Right: Conference room, large, built with two displays.'],
      ['Whatever the last engineer chose', 0, 'That is what space types prevent.'],
    ] },
    go: { to: '/rooms/nyc-20-05/', label: 'Open Curlew' },
  },
  {
    id: 'search', title: 'Finding anything', icon: 'search', mins: 2, idea: 1,
    card: 'Type it the way you would say it.',
    one: 'Type what you want the way you would say it, such as "EMEA spaces with X52", and Keia Atlas works out which spaces, devices, settings or projects you mean.',
    why: {
      field: 'Find a space, a unit or a serial number in seconds, even a device that was taken out years ago.',
      build: 'Find every space with a given model before a firmware change, or every setting that mentions a feature.',
      own: 'See everywhere a model or a setting is used before you change it.',
      lead: 'Answer "how many EMEA spaces have the X52?" without asking anyone to build a spreadsheet.',
    },
    like: 'A search engine that knows your buildings: it understands places, models and kinds of things, not only words.',
    task: 'Find every EMEA space with a Poly Studio X52.',
    check: { q: 'You want the old displays that were taken out of the New York office. What do you do?', a: [
      ['Nothing: retired devices are deleted', 0, 'Keia Atlas keeps them, so the history is never lost.'],
      ['Search "retired displays oak house"', 1, 'Right. Retired devices stay findable.'],
      ['Email the service desk', 0, 'You can find it yourself in seconds.'],
    ] },
    go: { to: '/rooms/?q=oak', label: 'Search the spaces' },
  },
  {
    id: 'change', title: 'Keep a fix as a proposal', icon: 'edit', mins: 3, idea: 2,
    card: 'Propose, approve, and see it everywhere.',
    one: 'Anyone can make a [[change]] to Keia Atlas\'s knowledge. The person who owns it [[approve|approves]] it, and then it shows on every page that uses it.',
    why: {
      field: 'When the guide is wrong you can fix it for everyone, not only remember it yourself.',
      build: 'Your fixes go into the standard instead of a notebook, and you can see who changed what, and why.',
      own: 'Nothing changes behind your back. Every proposal comes to you with the reason and the exact lines it would edit.',
      lead: 'An improvement lands once and spreads everywhere, with a history you can audit.',
    },
    like: 'Suggesting an edit to a shared document: the owner accepts it, and everyone\'s copy updates.',
    task: 'Suggest new maintenance hours for Studio X, then approve them as the owner.',
    check: { q: 'You propose an edit. When do other people see it?', a: [
      ['Straight away', 0, 'Not yet. It waits in the owner\'s review list until they approve it.'],
      ['Once the owner approves it', 1, 'Right. Then it shows everywhere at once, with your name and reason in the history.'],
      ['After the next project', 0, 'Sooner than that: as soon as it is approved.'],
    ] },
    go: { to: '/changes/', label: 'See every proposal and who approved it' },
  },
  {
    id: 'report', title: 'Reporting an issue', icon: 'inbox', mins: 2, idea: 2,
    card: 'One button, top of every page, under 30 seconds.',
    one: 'The [[report|Report]] button at the top of every page sends a suggestion, new firmware or an urgent issue to the person who owns it, in under 30 seconds. It is for Keia Atlas\'s knowledge. A broken space is an [[incident]], raised through the service desk.',
    why: {
      field: 'No hunting for the right email address. Report knows which page you are on and who owns it.',
      build: 'Waiting on something on site? An urgent report goes straight to the top of the owner\'s home page.',
      own: 'Reports arrive already sorted: what it is about, what happened, and whether someone is waiting on it.',
      lead: 'Problems show up the day they happen, not at the end-of-project review.',
    },
    like: 'The help button in a shop that calls the right person to the right aisle.',
    task: 'You are installing Curlew\'s new video bar and a setting is not where its setup guide says. The install is stuck. Report it.',
    check: { q: 'Where does an urgent report go?', a: [
      ['To a shared mailbox', 0, 'Not in Keia Atlas. It goes to one named owner.'],
      ['To the top of the owner\'s home page', 1, 'Right. Urgent first, then new firmware, then suggestions.'],
      ['Into a monthly summary', 0, 'Urgent means now: it goes straight to the owner.'],
    ] },
    go: { report: 'urgent', label: 'Open the real Report' },
  },
  {
    id: 'projects', title: 'Projects and tasks with an owner', icon: 'project', mins: 3, idea: 4,
    card: 'Phases, tasks, and adding the task the plan forgot.',
    one: 'A [[project]] follows a [[playbook]] through its [[phase|phases]]. Each phase is a list of [[task|tasks]] with an owner and a date, and you can add your own task when the plan misses something.',
    why: {
      field: 'Your tasks for the week are on your home page, with the space, the steps, and what to note when you finish.',
      build: 'Close a task with a [[captured-fix|captured fix]] and the next engineer benefits. Add the task the playbook forgot.',
      own: 'Tasks people keep adding by hand tell you what your playbooks are missing.',
      lead: 'See where every project is, what is waiting on something and who is doing what, without a status meeting.',
    },
    like: 'A shared to-do list for moving house: last time\'s checklist, plus the jobs this house needs.',
    task: 'Finish the Curlew install task, then add a task the plan forgot.',
    check: { q: 'The playbook is missing a step you always need. What do you do?', a: [
      ['Work around it', 0, 'Then the next person hits the same gap.'],
      ['Add a task, and suggest it for the playbook', 1, 'Right. It helps this project now, and the playbook owner decides whether every project gets it.'],
      ['Wait for next year\'s playbook', 0, 'No need to wait: add it now.'],
    ] },
    go: { to: '/projects/prj-12/', label: 'Open the New York office project' },
  },
  {
    id: 'home', title: 'Your home page: the answer first', icon: 'home', mins: 2, idea: 3,
    card: 'What is ready for you today, and View as.',
    one: 'Your [[home-page|home page]] shows what is ready for you today, and it follows your role: tasks for engineers, an inbox for service managers, projects for project managers.',
    why: {
      field: 'Open Keia Atlas and today\'s jobs are the first thing you see, with anything urgent on top.',
      build: 'Your tasks, soonest first, with anything that is waiting on something marked "Waiting on".',
      own: 'Your inbox: urgent reports first, then new firmware, then suggested changes.',
      lead: 'Your projects and your team\'s load for the next two weeks, at a glance.',
    },
    like: 'Desks in the same office: one building, but each desk has what that person needs within reach.',
    task: 'Switch roles with View as and watch the home page change.',
    check: { q: 'How do you see Keia Atlas the way a project manager sees it?', a: [
      ['Ask for a new account', 0, 'No need. In this demo anyone can switch.'],
      ['Use View as, under your name', 1, 'Right. On a phone it is in Settings.'],
      ['Change the look in Settings', 0, 'The look changes colours and type, not the role.'],
    ] },
    go: { to: '/', label: 'Go to your home page' },
  },
  {
    id: 'modules', title: 'Modules and agents', icon: 'agent', mins: 3, idea: 4,
    card: 'Modules are On, Connected or Off. Agents work under standing rules with named owners.',
    one: 'Nothing has to be climbed in order. A team sets each [[module]] to On, Connected (an outside tool shows its data here) or Off, and starts anywhere. An [[agent]] does routine work only under a [[standing-rule|standing rule]] that a named person approved once. Anything that cannot be put back is a proposal a person confirms.',
    why: {
      field: 'Every automatic action shows what it read and what it did, with the rule and its owner. Where the rule has an Undo, it is there.',
      build: 'Start with the device catalogue, which works alone. Add modules as they help. A Connected module keeps your existing tool as the record, with its source and time on each figure.',
      own: 'A rule is yours. You approve it once, with its conditions and its way back, and you are told on every run.',
      lead: 'A one-person team has no tiers to remove and lets rules do more. A global team has the same records and the same words.',
    },
    like: 'A smart home routine: you approve the rule once, it runs within its limits and tells you each time. Unlocking the front door still takes you.',
    task: 'Set some modules On, Connected or Off. Then see what runs under a rule and what waits for a person.',
    check: { q: 'A rule could reboot a display, or update a video bar\'s firmware. What happens?', a: [
      ['Both run by themselves', 0, 'Firmware cannot be put back, so it is a proposal a person confirms every time.'],
      ['The reboot can run under the rule; the firmware waits for a person', 1, 'Right. Actions that can be put back run within the rule\'s limits. Firmware, resets and deletes are proposals.'],
      ['Neither: software never acts', 0, 'It does routine work, but only under a standing rule a named person approved.'],
    ] },
    go: { settings: true, label: 'Choose which modules are on in Settings' },
  },
];

export const TEAM = [
  {
    id: 't-standards', title: 'How devices and spaces are standardised', icon: 'profile', mins: 4,
    card: 'One standard for every space, and who owns each part.',
    one: 'Aigna builds every space from the same [[standard]]: space types say what a space needs, device types and models say what can fill each place, and setup guides say how each model is set up.',
    why: 'A space in Tokyo and a space in Dublin work the same way, so anyone can support either, and a fix found in one helps all of them.',
    like: 'A franchise kitchen: the same recipes, equipment and checklists in every branch.',
    check: { q: 'Who decides which models are in the standard?', a: [
      ['Whoever installs the space', 0, 'Installers build to the standard; they do not choose it.'],
      ['The service manager, after the Lab', 1, 'Right. The Lab tests, the service manager decides.'],
      ['The vendor', 0, 'Vendors suggest; Aigna decides.'],
    ] },
    go: { to: '/room-profiles/', label: 'See the space types' },
  },
  {
    id: 't-projects', title: 'How a project runs', icon: 'playbook', mins: 3,
    card: 'Playbooks, seven phases, gates and RACI.',
    one: 'Every project follows a [[playbook]]: seven [[phase|phases]], each with steps done by a role and a [[gate]] someone signs off.',
    why: 'The same kind of project runs the same way, whoever runs it, and nothing skips a sign-off.',
    like: 'A pre-flight checklist with the captain\'s signature at each step.',
    check: { q: 'In a RACI, who signs a step off?', a: [
      ['Responsible', 0, 'Responsible does the work.'],
      ['Accountable', 1, 'Right. One person, and they sign.'],
      ['Informed', 0, 'Informed is told afterwards.'],
    ] },
    go: { to: '/playbooks/new-office/', label: 'Open the new office playbook' },
  },
  {
    id: 't-support', title: 'How support flows', icon: 'alert', mins: 3,
    card: 'From a broken space to a fixed one, and who does what.',
    one: 'A fault becomes one [[incident]]: the service desk checks nobody has opened it already, then looks at the space\'s health remotely. The on-site technician follows the signal from source to screen with the space\'s guide, and it is handed on, as a whole with what was tried, only when the fix is not in the guide: to the delivery engineer, then the service vendor. It closes with the cause and the fix.',
    why: 'Most faults are fixed on the first visit because the guide travels with the incident. Anything new gets captured so it is quicker next time.',
    like: 'A hospital: the nurse on the ward first, the specialist when it needs one, and the notes go everywhere with the patient.',
    check: { q: 'The on-site technician cannot fix a space and the guide does not cover it. Next?', a: [
      ['Close the incident', 0, 'The space is still broken.'],
      ['Hand it to the delivery engineer', 1, 'Right. It goes with everything tried so far. Then the vendor if it is a hardware fault under contract.'],
      ['Order a new space', 0, 'A bit much.'],
    ] },
    go: { to: '/incidents/', label: 'See the open incidents' },
  },
  {
    id: 't-firmware', title: 'How a firmware release reaches a space', icon: 'chip', mins: 2,
    card: 'Nothing reaches a space until the Lab passes it.',
    one: 'No [[firmware]] reaches a space until [[lab|the Lab]] passes it and the service manager makes it the standard.',
    why: 'Poly VideoOS 5 drops Google Meet and cannot be rolled back. An automatic update would have taken every Meet room down.',
    like: 'A pharmacy that checks each new batch before it goes on the shelf.',
    check: { q: 'A vendor releases new firmware. What happens first?', a: [
      ['Every device updates overnight', 0, 'Automatic updates are off for exactly this reason.'],
      ['It is logged and tested in the Lab', 1, 'Right. Then the service manager decides.'],
      ['The vendor installs it', 0, 'Not before the Lab.'],
    ] },
    go: { to: '/profiles/video-bar/poly-studio-x52/#firmware', label: 'See the X52 firmware line' },
  },
  {
    id: 't-loop', title: 'The knowledge loop', icon: 'refresh', mins: 2,
    card: 'The standard drives the work, and the work improves the standard.',
    one: 'The standards (space types, device types, setup guides, playbooks) drive the work, and every task closes with a [[captured-fix|captured fix]] that can improve them.',
    why: 'It is the reason Keia Atlas exists. Without it, fixes live in one person\'s head and leave when they do.',
    like: 'A recipe book the kitchen corrects after every service.',
    check: { q: 'A fix helps on three installs in a row. What should happen?', a: [
      ['Nothing', 0, 'Then the fourth install misses it.'],
      ['It becomes a proposal to change the standard', 1, 'Right. The next project starts from the better version.'],
      ['Someone writes it on a sticky note', 0, 'Sticky notes do not travel well.'],
    ] },
    go: { to: '/projects/prj-12/', label: 'See a captured fix on PRJ-12' },
  },
  {
    id: 't-network', title: 'How a space reaches the internet', icon: 'net', mins: 3,
    card: 'Outlet, floor comms room, main comms room, internet.',
    one: 'From the data outlet in the space to the internet circuit: every networked device passes through the floor\'s [[idf|IDF]] and the building\'s [[mdf|MDF]].',
    why: 'When a whole floor goes quiet, you know which comms room to check, and who owns it.',
    like: 'Roads: the street outside (the outlet), the local roundabout (IDF), the motorway junction (MDF) and the motorway itself.',
    check: { q: 'Where do a floor\'s data outlets end?', a: [
      ['In the MDF', 0, 'The MDF is the main space for the whole building.'],
      ['In that floor\'s IDF', 1, 'Right: on patch panels and switches.'],
      ['At the firewall', 0, 'The firewall is at the edge of the building\'s network.'],
    ] },
    go: { to: '/rooms/dub-3-21/', label: 'See the Dublin office\'s MDF rack' },
  },
  {
    id: 't-vendors', title: 'Working with vendors', icon: 'kit', mins: 2,
    card: 'What vendors see, and how their records count.',
    one: 'Vendors get their own view of their project: the site, the space designs, the models and how to set them up, their steps in the playbook, and where to record serials and MACs.',
    why: 'Vendors work from the same information as Aigna\'s engineers, from the first site survey, not only at install.',
    like: 'Giving a builder the architect\'s drawings, not a phone call.',
    check: { q: 'When do a vendor\'s serial numbers count?', a: [
      ['As soon as they type them', 0, 'Not yet.'],
      ['Once the delivery engineer has checked them', 1, 'Right.'],
      ['At the end of the year', 0, 'Much sooner: at the check.'],
    ] },
    go: { to: '/vendor/', label: 'See a vendor\'s view' },
  },
];

// Each role's short path through "Using Keia Atlas", in order.
export const PATHS = {
  delivery: ['help', 'home', 'profiles', 'configurations', 'room', 'projects', 'change', 'report'],
  network: ['help', 'home', 'room', 'search', 'projects', 'report'],
  innovation: ['help', 'profiles', 'configurations', 'change', 'modules'],
  vendor: ['help', 'profiles', 'configurations', 'room', 'report'],
  tech: ['help', 'home', 'room', 'search', 'configurations', 'report'],
  desk: ['help', 'home', 'search', 'room', 'report'],
  'service-vendor': ['help', 'search', 'room', 'report'],
  'sm-av': ['help', 'home', 'profiles', 'configurations', 'change', 'report', 'modules'],
  'sm-infra': ['help', 'home', 'room', 'profiles', 'change', 'report'],
  pm: ['help', 'home', 'projects', 'search', 'report', 'modules'],
  programme: ['help', 'home', 'projects', 'modules', 'search'],
  'delivery-manager': ['help', 'home', 'projects', 'search', 'modules'],
  head: ['help', 'home', 'modules', 'projects', 'search'],
};
