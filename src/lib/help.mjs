// The help registry (decision 0027, docs/rules/platform.md "Help on every page").
//
// One place for every help card. An element says data-help="<key>"; with the "?" Help switch on, hovering or
// focusing it shows the entry for that key: what it is, what to do with it, and a "Learn more" link into Learn.
//
//   key       "shell.report", "filter.sort", "overview.cell". A key with a colon ("filter.facet:region",
//             "number:Rooms", "place:work") is a family: it uses its own entry if there is one, otherwise the entry
//             for the part before the colon, and takes its missing "what to do" from that general entry.
//             "term:<id>" is any glossary word (src/pages/learn/_glossary.mjs), built from the glossary itself, so
//             a term has one definition everywhere. "page.<section>" is a whole page, from Shell's `section`.
//   name      the card's heading. A thing that has its own name in the page (a tab, a facet, a number) passes it
//             with data-help-name, and the words may say {name}.
//   what      one or two plain sentences: what this is.
//   do        one or two plain sentences: what to do with it.
//   learn     where "Learn more" goes: 'l:<lesson id>' (a lesson in Learn) or 'g:<term id>' (a glossary entry).
//
// The build turns this into /help/index.json (src/pages/help/index.json.js), which the page fetches the first
// time help is switched on. tests/help.test.mjs lists any data-help key used in src/ that has no entry here.
// Words follow docs/rules/words.md: plain English, no em dashes, glossary words used exactly.
import { GLOSSARY, TERM } from '../pages/learn/_glossary.mjs';
import { USING, TEAM } from '../pages/learn/_lessons.mjs';

// A glossary definition, so a term is defined once and the help repeats it word for word.
const def = (id) => { if (!TERM[id]) throw new Error(`help.mjs: no glossary term "${id}"`); return TERM[id].def; };
const e = (name, what, doText, learn) => ({ name, what, ...(doText ? { do: doText } : {}), ...(learn ? { learn } : {}) });

// ---- Shell: the top bar, the sidebar, the place tabs, the page itself -----------------------------------------
const SHELL = {
  'shell.brand': e('Keia Atlas home', 'The Keia Atlas mark. It always takes you back to your home page.', 'Select it to go Home.', 'l:home'),
  'shell.path': e('Where you are', 'The path to this page. Every step before the last is a link back up the path.', 'Select an earlier step to go back up.'),
  'shell.search': e('Search', 'Finds any room, device, setting, project or person, even a device that was taken out years ago.', 'Select it, or press / or Ctrl K, then type it the way you would say it, such as "EMEA rooms with X52".', 'l:search'),
  'shell.help': e('Help', 'The Help switch. While it is on, everything with a dotted outline explains itself when you point at it.', 'Select it, or press ?, to turn help on or off. Escape turns it off. On a touch screen, tap a dotted thing once to read about it and again to use it.', 'l:help'),
  'shell.report': e('Report', def('report'), 'Select it to suggest a change, log new firmware or raise an urgent issue about the page you are on. It goes to the person who owns it.', 'l:report'),
  'shell.mode': e('Colour mode', 'Switches between light and dark. Auto follows your computer until you choose.', 'Select it to flip between light and dark.'),
  'shell.settings': e('Settings', 'The look of Keia Atlas, light or dark, which stage is switched on and whether agents show. Saved in this browser only.', 'Select it to open Settings.', 'g:stage'),
  'shell.account': e('Viewing as', 'Who this window is showing Keia Atlas as. The home page, the order of the sidebar and who your changes are recorded as follow it.', 'Select it to view as another role. Nobody is signed in for real: this is a demo, and each window keeps its own person.', 'g:view-as'),
  'shell.viewas': e('View as', def('view-as'), 'Pick a role, or type a role, place or team to find one.', 'g:view-as'),
  'shell.viewas-everyone': e('Everyone (overview)', 'Not a person: every role\'s first screen at once, for seeing the whole picture. A change made here is recorded as the demo admin.', 'Select it to see every role together.', 'g:view-as'),
  'shell.viewas-person': e('A role', 'A role, with the person who holds it in this demo and where they work.', 'Select it to see Keia Atlas the way that person sees it. Your other open windows keep their own person.', 'g:view-as'),
  'shell.viewas-find': e('Find a person', 'Narrows the list below to the roles that match.', 'Type a role, a place or a team.'),
  'shell.ribbon': e('Viewing as', 'This window is showing Keia Atlas as someone else: their home page, their sidebar order, their numbers. It stays on every page until you go back.', 'Select Back to you to return to the person this window opened as.', 'g:view-as'),
  'shell.back-to-you': e('Back to you', 'Returns this window to the person it opened as.', 'Select it.', 'g:view-as'),
  'shell.more': e('More places', 'On a phone, the rest of the places in the sidebar are behind this button.', 'Select it to open them.'),
  'shell.tabs': e('The pages in this place', 'The tabs across the top are the pages inside this place. The one with the bar under it is where you are.', 'Select a tab to open that page.'),
  'shell.stage-gate': e('Switch on this stage', 'This page arrives at a later stage of the roll-out, and the demo is set to an earlier one.', 'Select it to switch that stage on for this demo.', 'g:stage'),
};

// The six places and their tabs. "place" and "tab" are the general entries; the specific ones follow.
const PLACES = {
  place: e('A place', 'One of the places in the sidebar. The pages inside it show as tabs across the top of the page.', 'Select it to go there.'),
  'place:home': e('Home', def('home-page'), 'Select it to see what needs you today.', 'l:home'),
  'place:vendor': e('Your installation', 'For vendors: the rooms and tasks assigned to your company, and the records Aigna needs back, such as serial numbers, MAC addresses and photos.', 'Select it to open your installation.'),
  'place:vschedule': e('Your schedule', 'For vendors: when you are booked and what is on each day.', 'Select it to open your schedule.'),
  'place:work': e('Work', 'Everything that has a date and an owner: the overview, the schedule, projects, incidents, playbooks, the work plan, budget and the Lab.', 'Select it to open the Work overview.', 'l:projects'),
  'place:locations': e('Locations', 'Where the work happens: the regions, the offices, the home offices and the rooms in them, with what is happening in each right now.', 'Select it to see every location live, then open a region or an office.', 'g:site'),
  'place:services': e('Services', 'The services the team runs, AV, Network and Infrastructure: how each is doing, its fleet, its standard and who owns it.', 'Select it to see how the services are doing.'),
  'place:devices': e('Devices', 'Device profiles, the units in rooms, models, configurations, IT stores and cables.', 'Select it to see the device profiles.', 'l:profiles'),
  'place:team': e('Team', 'Who is on the team, who they report to, where they are this week, and who does what.', 'Select it to see the team.'),
  'place:learn': e('Learn', 'Short lessons on using Keia Atlas, how the team works, and the glossary of every word Keia Atlas uses.', 'Select it to start, or to look a word up.'),
  tab: e('A page in this place', 'One of the pages inside the place you are in.', 'Select it to open it.'),
  'tab:overview': e('Overview', 'Every piece of open work in one place, from everyone\'s point of view.', 'Select it to open the Work overview.'),
  'tab:schedule': e('Schedule', 'Who is where and doing what: the day, each person\'s week, the month and the year.', 'Select it to open the schedule.'),
  'tab:projects': e('Projects', def('project'), 'Select it to see every project.', 'g:project'),
  'tab:incidents': e('Incidents', def('incident'), 'Select it to see the incidents board.', 'g:incident'),
  'tab:playbooks': e('Playbooks', def('playbook'), 'Select it to see the playbooks.', 'g:playbook'),
  'tab:refresh': e('Work plan', 'The plan for replacing devices as they reach the end of their planned life.', 'Select it to see what is due and when.'),
  'tab:budget': e('Budget', 'Planning: the budget, scenarios and the team\'s capacity, by financial year.', 'Select it to open Planning on the Budget view.'),
  'tab:scenarios': e('Scenarios', 'Planning: the budget, scenarios and the team\'s capacity, by financial year. Scenarios are changes to the plan you can compare and adopt.', 'Select it to open Planning on the Scenarios view.'),
  'tab:planning': e('Planning', 'The budget, scenarios and the team\'s capacity as one place, by financial year: this year, next, and five ahead.', 'Select it to open Planning. Pick a year in the filter bar; every view follows it.'),
  'tab:lab': e('Lab', def('lab'), 'Select it to see what is being tested.', 'g:lab'),
  'tab:types': e('Room profiles', def('room-profile'), 'Select it to see the room profiles.', 'g:room-profile'),
  'tab:rooms': e('Rooms', def('room'), 'Select it to see the rooms.', 'g:room'),
  'tab:locations-overview': e('Overview', 'Every region and office at once, and what is happening in its rooms right now: in use, free, or with a problem. Simulated live until real feeds are connected.', 'Select it to see every location live.'),
  'tab:offices': e('Offices', 'Every office as a card: its local time, whether it is open, its three service lights, open incidents and who is in today.', 'Select it to see the offices.', 'g:site'),
  'tab:services-overview': e('Overview', 'How each service is doing, side by side: AV, Network and Infrastructure.', 'Select it to see the services at a glance.'),
  'tab:services-av': e('AV', 'The AV service: meeting rooms, displays, signage and room booking panels, their health and their standard.', 'Select it to open the AV service.'),
  'tab:services-network': e('Network', 'The IT network: switches, Wi-Fi and the internet circuits at every office, and the address plan.', 'Select it to open the Network service.', 'g:mdf'),
  'tab:services-infrastructure': e('Infrastructure', 'The comms rooms, racks, power and cabling that everything else runs on.', 'Select it to open the Infrastructure service.', 'g:idf'),
  'tab:devices-overview': e('Overview', 'How the units are doing right now: online, offline, with alerts, or on old firmware. Simulated live until real feeds are connected.', 'Select it to see the units live.'),
  'tab:usage': e('Usage', 'How much the rooms are actually used, from bookings and calls. The figures are simulated.', 'Select it to see usage.'),
  'tab:profiles': e('Device profiles', def('device-profile'), 'Select it to see the device profiles.', 'g:device-profile'),
  'tab:devices': e('Units', def('unit'), 'Select it to see every unit.', 'g:unit'),
  'tab:models': e('Models', def('model'), 'Select it to see the models.', 'g:model'),
  'tab:standards': e('Standards', 'The house standards integrators build to, rule by rule, each with why, how to check it and its source.', 'Select it to see the standards.'),
  'tab:configurations': e('Configurations', def('configuration'), 'Select it to see the configurations.', 'l:configurations'),
  'tab:equipment-usage': e('Usage', 'How much each kind of device is used, so you can see what is idle and what is stretched. The figures are simulated.', 'Select it to see equipment usage.'),
  'tab:spares': e('IT stores', 'Each office\'s storage room: its spare units, its counted stock, and where the stock is below its minimum.', 'Select it to see the stores.'),
  'tab:cables': e('Cables', 'Every cable, where it runs and what it joins.', 'Select it to see the cables.'),
  'tab:team': e('People', 'Everyone on the team, as an org chart or a list.', 'Select it to see the team.'),
  'tab:vendors': e('Vendors', 'The companies that install and repair for Aigna, and who looks after each.', 'Select it to see the vendors.', 'l:t-vendors'),
};

// Whole pages: the general "what is this page" card, from Shell's `section`.
const PAGES = {
  'page.generic': e('This page', 'A page in Keia Atlas. The band at the top says what it is and gives its key figures.', 'Use the bar under the band to find things, and the tabs at the top to move around the place. Turn on help to see what each part is.', 'l:help'),
  'page.home': e('Your home page', def('home-page'), 'Start with what is at the top. View as, under your name, shows another role\'s first screen.', 'l:home'),
  'page.overview': e('Work overview', 'Every piece of open work in one place: who has it, what kind it is and when. Filters and the Who does what table narrow the list.', 'Pick a role or a kind in the table, or use the filter bar, then open any row.', 'l:projects'),
  'page.schedule': e('Schedule', 'Who is where and doing what. Day shows the offices, Week each person, Month the calendar, and Year the projects.', 'Choose a view in the bar, then a scope: Me, My team or Everyone. Drag work onto a person and day, or use Assign.'),
  'page.projects': e('Projects', def('project'), 'Open a project to see its phase, tasks and rooms. Deploy is where the devices go in.', 'l:projects'),
  'page.incidents': e('Incidents', def('incident'), 'Open one to see the room, the evidence and the next steps from the guide.', 'g:incident'),
  'page.playbooks': e('Playbooks', def('playbook'), 'Open one to see its phases, steps, who does each and the gates.', 'g:playbook'),
  'page.refresh': e('Work plan', 'The plan for replacing devices as they pass their planned life, grouped by office and year.', 'Filter by site or kind, then open a line to see the devices behind it.'),
  'page.budget': e('Planning', 'The budget, scenarios and the team\'s capacity by financial year. The band answers the year in one line and four figures; the views below carry the detail.', 'Pick a year in the filter bar, then Budget, Scenarios or Capacity. Every figure opens the projects and work plan items behind it.'),
  'page.scenarios': e('Planning', 'The budget, scenarios and the team\'s capacity by financial year.', 'Pick a year in the filter bar, then Budget, Scenarios or Capacity.'),
  'page.planning': e('Planning', 'The budget, scenarios and the team\'s capacity by financial year. The band answers the year in one line and four figures; the views below carry the detail.', 'Pick a year in the filter bar, then Budget, Scenarios or Capacity. Every figure opens the projects and work plan items behind it.'),
  'page.lab': e('The Lab', def('lab'), 'Open a test to see its result and who signs it off.', 'g:lab'),
  'page.types': e('Room profiles', def('room-profile'), 'Open one to see the devices it needs, its build options and how it is wired.', 'g:room-profile'),
  'page.rooms': e('Rooms', def('room'), 'Filter the list, or open a room to see its drawing, what is installed and how it compares to its profile.', 'l:room'),
  'page.locations-overview': e('Locations overview', 'A live view of every region and office: which rooms are in use, free or have a problem, and what just changed. The feed is simulated.', 'Start with a region tile or To review. Hover a room tile to look, select it to open the room, and select an office\'s name to open the office.', 'g:site'),
  'page.offices': e('Offices', 'Every office as a card: a plan of its first floor where one is modelled, its local time and whether it is open, the AV, Network and Infrastructure lights, open incidents and who is on site today. Home offices follow, by region.', 'Filter by region or by open now, then open an office. Every count opens the list it counts.', 'g:site'),
  'page.office': e('An office', 'One office on one page: its floors and rooms as they are now, the three service lights, who is on site today, what needs attention, the internet, comms rooms, IT store, the next two weeks of work, vendors and facts. The live state is simulated.', 'Start with Today. Choose a room on the floor map to open it, or Open in 3D to follow a cable to the internet.', 'g:site'),
  'page.region': e('A region', 'One region: a card per office and one for the home offices, what needs attention, the work, the people who look after it and its vendors. The live figures are simulated.', 'Open an office from its card, or follow any count to its list.'),
  'page.home-offices': e('Home offices', def('home-office'), 'Find a town or a person, or filter to the ones with a problem now. Open one to see its kit.', 'g:home-office'),
  'page.devices-overview': e('Devices overview', 'A live view of every unit that reports in: online, offline, alerts and firmware, by kind and by office. The feed is simulated.', 'Select a bar to filter, then open a unit from Needs attention.'),
  'page.usage': e('Usage', 'How much rooms are used, from bookings and calls. The figures are simulated.', 'Use the filters, then read what is busy and what sits idle.'),
  'page.equipment-usage': e('Equipment usage', 'How much each kind of device is used, so you can see what is idle and what is stretched. The figures are simulated.', 'Use the tabs to look at one kind of evidence at a time.'),
  'page.profiles': e('Device profiles', def('device-profile'), 'Open one to see what healthy looks like, its models and its symptoms.', 'l:profiles'),
  'page.devices': e('Units', def('unit'), 'Find one by hostname, serial number, asset tag, room or model, then open it for its health, settings and history.', 'g:unit'),
  'page.models': e('Models', def('model'), 'Open one to see its ports, size, power, drawing and any warnings.', 'g:model'),
  'page.configurations': e('Configurations', def('configuration'), 'Open one to see every setting in the order to do them, each marked Set or Verify.', 'l:configurations'),
  'page.spares': e('IT stores', 'Each office\'s storage room. Spare units sit on its shelves with the status Spare; cords, mounts and parts are counted against a minimum.', 'Filter to Below minimum to see what to reorder, or open a store for its shelves.'),
  'store.card': e('IT store', 'One office\'s storage room: how many spare units and counted lines it holds, and which of them are below their minimum.', 'Select it to open the store, with its cabinets, shelves and every spare unit.'),
  'store.minimum': e('Minimum stock', 'The least to keep of each model in this store, for example at least 2 TC10s. A model below its minimum is flagged.', 'Reorder what is flagged. The Where column says which shelf to look on.'),
  'store.cabinets': e('Cabinets and shelves', 'The store\'s cabinets, each with its shelves. The number on a shelf is how many spare units are on it.', 'Use it to find the right shelf before you walk to the store.'),
  'store.units': e('Spare units', 'Units with the status Spare: they have arrived and are kept on a shelf until a room needs one. Each has its own serial number, asset tag and page.', 'Select a unit to see its page. When one is fitted in a room it stops being a spare.', 'g:unit'),
  'store.counted': e('Counted stock', 'Cords, mounts, power supplies and modules that have no serial number, so they are counted against a minimum instead.', 'Recount them when the count is overdue, and reorder any that are low.'),
  'page.standards': e('Standards', 'The house standards integrators build to: cabling, racks, power, network, Wi-Fi, displays, meeting rooms, signage, scheduler panels and home offices. Each rule says what to do, why, how to check it and where it comes from.', 'Filter by area, then open a standard. Rules marked House choice are Aigna\'s own decisions.'),
  'page.cables': e('Cables', 'Every cable in the estate, where it runs and what it joins.', 'Filter by office or kind, then open a cable.'),
  'page.changes': e('Changes', def('change'), 'Review a change, approve it or ask for more. Each one names who proposed it and who approves it.', 'l:change'),
  'page.team': e('Team', 'Who does what, who they report to, and where everyone is this week.', 'Select a person for their week and details. Switch between the chart and the list.'),
  'page.vendors': e('Vendors', 'The companies that install and repair for Aigna, and who looks after each.', 'Open one to see its offices, contacts and work.', 'l:t-vendors'),
  'page.vendor': e('Your installation', 'For vendors: your rooms, the tasks assigned to your company and the records Aigna needs back.', 'Work down the list and add each serial number, MAC address and photo.'),
  'page.learn': e('Learn', 'Short lessons on using Keia Atlas, how the team works, and the glossary of every word Keia Atlas uses.', 'Start the path for your role, or look a word up in the glossary. Switch on help to learn from the page you are on.', 'l:help'),
  'page.search': e('Search results', 'Everything that matches what you typed, grouped by kind.', 'Select a result to open it, or refine the words.', 'l:search'),
  'page.about': e('About Keia Atlas', 'What Keia Atlas is, how it is built and the decisions behind it.', 'Read the decision records for the reasons.'),
  'page.decisions': e('Decisions', 'The decision records: what was decided, when, and why.', 'Open one to read the reasoning.'),
  'page.locations': e('An office in 3D', 'One building model shown two ways: a 3D model and floor plans. Every floor, the comms rooms, every cable run and both internet circuits, joined up. The floor plan is fictional and the live state is simulated.', 'Choose a room, rack, access point or cable to follow its path to the internet hop by hop. Use the floor plan to choose with the keyboard.', 'g:mdf'),
};

// ---- Locations: offices, regions and home offices --------------------------------------------
const LOCATIONS = {
  'loc.region-tile': e('A region', 'One region at a glance: how many of its offices are open now, rooms in use and with a problem now, and its home offices.', 'Select the region\'s name to open it, or a figure to see those rooms.'),
  'loc.region': e('Region', 'The region this office is in.', 'Select it to open the region: its offices, home offices, people and work.'),
  'loc.open': e('Local time, open or closed', 'The time at the office now, and whether it is open. Offices are open 07:00 to 19:00 local on weekdays.', 'Read it before you call or book someone in.'),
  'loc.lights': e('Service lights', 'AV, Network and IT infrastructure for this office, from the Services pages: green when all its kit is online, amber when some has an alert, red when some is offline. Grey means nothing of that service is recorded here.', 'Select a light to open that service for this office.', 'g:mdf'),
  'loc.3d': e('3D model', 'The whole office in 3D: every floor, comms room, cable run and internet circuit, joined up. Offices without a floor file are not modelled yet.', 'Select Open in 3D, then choose anything to follow its path to the internet.', 'g:mdf'),
  'loc.floor': e('Floors', 'The office floor by floor. On a modelled office, the fictional floor plan with each room coloured by its state now; otherwise the rooms on each floor.', 'Pick a floor, then select a room (or a rack) to open it.'),
  'loc.today': e('Today', 'The office today: the three service lights, who is on site, and what needs attention, from rooms with a problem now to open incidents, the IT store and older kit.', 'Start here. Select anything to open it.'),
  'loc.internet': e('Internet', 'The internet circuits into the office: provider, whether primary or backup, and the kind of circuit. Recorded where the office is modelled.', 'Follow them in 3D from the street to the firewalls.', 'g:mdf'),
  'loc.comms': e('Comms rooms', 'The MDF and IDFs: each one\'s racks, its kit against the house network standard, and whether it is sized for the rooms it serves.', 'Open a comms room for its rack, patching and sizing.', 'g:idf'),
  'loc.store': e('IT store', 'The office\'s storage room: its spare units and counted stock, and how many lines are below their minimum.', 'Open the IT store to see what to reorder.'),
  'loc.work': e('Next two weeks', 'Work at this office in the next two weeks: tasks, visits, incidents and the work plan, from the Schedule.', 'Open an item, or see them all in the Schedule.'),
  'loc.rooms': e('Rooms by floor', 'Every room at the office, floor by floor, each with its plan and its state now.', 'Select a room to open it.', 'l:room'),
  'loc.openwork': e('Open work and incidents', 'The open projects and incidents here, most urgent first.', 'Open one, or follow the count to the full list.', 'l:projects'),
  'loc.vendors': e('Vendors and visits', 'The vendors who work here, and the site visits booked.', 'Open a vendor or a visit.', 'l:t-vendors'),
  'loc.facts': e('Facts', 'What the office is: its kind, city, time zone, floors, rooms, devices, mains power and who looks after it on site.', 'Read it to check the record against the building.'),
  'loc.homes': e('Home offices', def('home-office'), 'Open a region\'s home offices to see each one, who works there and its state now.', 'g:home-office'),
  'loc.homestate': e('State now', 'Whether the home office is in use, free, has a problem or is outside working hours (08:00 to 18:00 local). Simulated live.', 'Filter by Status to see only the ones with a problem.'),
  'loc.attention': e('Needs attention', 'The open incidents in the region, most urgent first.', 'Open one, or see them all in Incidents.', 'g:incident'),
  'loc.people': e('Who looks after it', 'The managers whose teams cover this region, then the technicians, engineers and project managers based in it.', 'Select a person to see their week.'),
};

// ---- The office in 3D (decision 0030) ------------------------------------------------------------------------
const OFFICE3D = {
  'o3.view': e('3D model or floor plan', 'The same model, shown two ways. The floor plan is the view on a phone, the way to choose things with the keyboard, and what shows when a browser can\'t draw 3D.', 'Pick one. What you chose stays chosen in both.'),
  'o3.floors': e('Floors', 'Show every floor stacked, or one floor on its own so you can see into it.', 'Pick a floor to fade the others away; All floors brings them back.'),
  'o3.cables': e('Cables', 'Every permanent link from a patch panel to an outlet or access point, along the trays and down into the rooms, and the riser fibre.', 'Turn them off to see the rooms and trays. A chosen path always shows its cables.'),
  'o3.colour': e('Colour the cables', 'Purpose uses the house cable colours (blue for user data, green for AV). Health uses the live state of the device at the end of each cable: green healthy, amber alert, red down, grey spare or not monitored.', 'Switch to Health to see where the problems are.'),
  'o3.camera': e('Camera', 'Ready-made views: from the front right corner (the house angle, like the room drawings), from the top, or one floor close up.', 'Pick one; the camera eases there. Drag to turn, Shift-drag to move, Ctrl and scroll to zoom.'),
  'o3.scene': e('The 3D model', 'The office to scale: floors, core, rooms coloured by their live state, the comms room racks, trays, access points, cables and the internet circuits from the street. Anything with a problem glows.', 'Point at something to name it; select it to see its path to the internet. With the keyboard, the arrows turn the view and plus and minus zoom.'),
  'o3.legend': e('What the colours mean', 'Rooms by their live state, and cables by purpose or by health.', 'Read it with the model. Cables are drawn thicker than life so they can be seen.'),
  'o3.panel': e('{name}', 'What you chose and its path to the internet, hop by hop: device, outlet, cable, panel port, switch, core, firewall, the provider\'s box and the circuit. A light shows the live state where the feed reports it.', 'Point at a hop to find it in the model; follow a link to its room, unit or cable. With nothing chosen, it lists what needs attention now.', 'g:idf'),
  'o3.holds': e('What the model holds', 'The facts behind the model: floors, comms rooms, cable runs, trays, Wi-Fi and the way in from the street.', 'Read it to check the model against the building.'),
};

// ---- Shared parts ------------------------------------------------------------------------------------------------
const PARTS = {
  'page.action': e('Main action', 'The one main thing to do on this page.', 'Select it to do that.'),
  number: e('{name}', 'A key figure for this page. It counts the whole page, not what the filters leave.', 'If it underlines when you point at it, select it to see what is counted.'),
  'simtag:simulated': e('Simulated', 'The figures on this page are made up for the demo. Nothing here is live.', 'Read the numbers as an example of what real data would show.', 'g:stage'),
  'simtag:stage': e('Stage', 'This page belongs to a later stage of the roll-out.', 'Switch stages in Settings to see it switched on.', 'g:stage'),
  peek: e('Preview', 'A quick look at something without leaving the page. Anything with a dotted outline and no card of its own opens one.', 'Point at it to look, select it to keep the card open, and press Escape or select elsewhere to close it.'),
  empty: e('Nothing to show', 'No item matches the filters, or the list has nothing in it yet.', 'Select the button to clear the filters and see everything again.'),
  sidepanel: e('{name}', 'The details of the thing beside it. It stays in view as you scroll the page.', 'Read it alongside the picture or list next to it.'),
  section: e('{name}', 'A block of more detail, lower on the page.', 'Read on. A long list shows its first few items, and Show all opens the rest, or See all takes you to the page with the whole list.'),
  'section.showall': e('Show all', 'Long lists show their first few items so the page stays short.', 'Select it to see every item. Select it again to fold the list back up.'),
  'section.seeall': e('See all', 'A summary shows only the first few items. The whole list lives on its own page, which this link names.', 'Select it to open that page with the same filters, showing the same count. Back brings you here, where you were.'),
  detailtabs: e('{name}', 'One part of the detail on this page. Only one tab shows at a time.', 'Select it, or use the arrow keys, to switch. The address follows the tab, so you can share it.'),
  'phase-rail': e('{name}', 'One phase of a project. Filled means done, lit is where the project is now, and outlined is still to come.', 'Where a phase is a button, select it to see its tasks.', 'g:phase'),
  roomkey: e('{name}', 'One item in this room, numbered as it is in the drawing. Some are hidden behind the display, under the table or in the comms room.', 'Point at it to light it in the drawing, or point at the drawing to find it here.', 'l:room'),
  'raci.legend': e('What the letters mean', def('raci'), 'Read this first, then look for the letters in the table.', 'g:raci'),
  'raci.pick': e('Show one role', 'Narrows the table to the work one role has a letter in.', 'Select a role to see only its work. All roles puts everything back.', 'g:raci'),
  'raci.work': e('A piece of work', 'One piece of work. Each role has a letter against it, or nothing.', 'Point at a letter for what it means here and who holds the role today.', 'g:raci'),
  'raci.role': e('{name}', 'A role. The column shows what it does in each piece of work.', 'Point at a letter in the column for the detail.', 'g:raci'),
  'live.bar': e('Live between windows', 'Shows who else has this page open. A change made in one window appears in the others on this computer straight away.', 'Open a second window, view as another person, and change something to see it. Across different computers this needs a small server later.'),
  'live.history': e('History', 'Every change to this item, newest first, with who made it, when, and the value before and after.', 'Select it to open the history. Undo puts an old value back and keeps the record of both.'),
  'live.drawer': e('History', 'Every change to this item, newest first, with who made it and when. Each is a version you can step back to.', 'Select Undo on a change to put the old value back. Nothing is ever deleted.'),
  'live.undo': e('Undo', 'Adds a new change that puts the old value back. The original change stays in the history.', 'Select it to undo that change. You can undo the undo.'),
};

// The filter bar: one bar on every list, with the same parts in the same order.
const FILTER = {
  'filter.find': e('Find', 'Filters this list as you type. Every word you type has to appear in the item.', 'Type part of a name, number, town or model. Escape empties the box.'),
  'filter.facet': e('{name}', 'A filter. Each choice shows how many items it would leave.', 'Point at it or select it, then pick one or more choices. The list narrows at once, and the address follows, so you can share the filtered list.'),
  'filter.facet:region': e('Region', 'The part of the world: Americas, EMEA or APAC.', 'Pick one or more regions to narrow the list.'),
  'filter.facet:site': e('Office', def('site'), 'Pick one or more offices to narrow the list.'),
  'filter.facet:kind': e('Kind', 'What sort of thing it is. The choices are the ones that exist on this page.', 'Pick one or more kinds to narrow the list.'),
  'filter.facet:status': e('Status', 'Where each item is in its life, in the page\'s own words.', 'Pick one or more statuses to narrow the list.'),
  'filter.facet:type': e('Room profile', def('room-profile'), 'Pick a room profile to see only the rooms built to it.', 'g:room-profile'),
  'filter.facet:role': e('Role', 'The role that does the work or holds the job.', 'Pick a role to narrow the list.'),
  'filter.facet:person': e('Person', 'A person on the team.', 'Pick someone to see only their work.'),
  'filter.facet:team': e('Team', 'One of the teams: delivery, on-site, AV and IT, IT infrastructure, service desk, leadership or vendor.', 'Pick a team to narrow the list.'),
  'filter.facet:fw': e('Firmware', def('firmware'), 'Pick a state to see which units are on the standard and which are behind.', 'g:firmware'),
  'filter.facet:step': e('Step', 'One of the four steps of Deploy: provision, install, configure or commission.', 'Pick a step to see the devices at it.', 'g:integrate'),
  'filter.toggle': e('{name}', 'A switch. When it is on, the list shows only the items that match it.', 'Select it to switch it on or off.'),
  'filter.clear': e('Clear all', 'Puts every filter back to how it starts.', 'Select it to see everything again.'),
  'filter.views': e('View', 'The same items shown another way, such as Cards or List. Each view has its own count.', 'Select a view. Keia Atlas remembers your choice in this browser.'),
  'filter.sort': e('Sort', 'How the items are ordered. The choices start with "By" or end with "first".', 'Select it and pick an order. The items slide into place.'),
  'filter.count': e('How many', 'How many items match the filters, out of all of them.', 'Nothing to do. It updates as you filter.'),
};

// ---- Home ---------------------------------------------------------------------------------------------------------
const HOME = {
  'home.who': e('Whose first screen', 'Says which role this block is the first screen for.', 'Nothing to do. Use View as, under your name, to see another role\'s first screen.', 'l:home'),
  'home.day': e('My day', 'Where you are today, and your day in order: incidents first, then tasks by due date, then Lab work and visits, each for the hours it takes. Times are a plan for the day, not bookings; the red line is now, in your office\'s time.', 'Select an item to open it. Full schedule opens your day in the Schedule.', 'l:home'),
  'home.day-item': e('Something on today', 'One thing that takes your time today: when it starts in the day\'s order, how long, and where.', 'Select it to open the task, incident, test or visit.'),
  'home.next': e('Next up', 'The first thing on your day, with a drawing of its room.', 'Select it to open it.', 'l:home'),
  'home.next-card': e('Your next job', 'What it is, where, and when it is due. The drawing is the room profile, seen from above.', 'Select it to open the task or incident.', 'g:room-profile'),
  'home.office': e('At your office', 'Open incidents at the office you are based at, most urgent first.', 'Select one to see the room, the evidence and the next steps. See all opens Incidents filtered to your office.', 'g:incident'),
  'home.device': e('Next device', 'The next device to set up on your Deploy projects: its batch, and how far the batch has got.', 'Select it to open the batch and work down its checklist.', 'l:projects'),
  'home.device-card': e('The next device', 'The device, its room and model, and how many of its batch are set up.', 'Select it to open the batch.', 'g:unit'),
  'home.provision': e('Provisioning waiting', 'Your provision tasks: the system records a device needs before it goes on the wall.', 'Select one to open it. See all opens them in the Work list.', 'g:task'),
  'home.inbox': e('For your approval', 'What people have sent you with Report: urgent issues first, then new firmware, then suggested changes. Reports sent from any page land here.', 'Work down from the top. Take an urgent one, or review a change.', 'l:report'),
  'home.inbox-item': e('Something sent to you', 'One report: what it is about, who sent it, when, and what they said.', 'Select Take it or Review. The link opens the page it is about.', 'l:report'),
  'home.review': e('Waiting for your review', 'Changes that someone proposed and you approve.', 'Select one to read it and approve it or ask for more.', 'l:change'),
  'home.health': e('Your service\'s health', 'Three figures about the part of the estate you own, each opening the list it counts.', 'Select a figure to see the rooms behind it.'),
  'home.tile': e('{name}', 'A figure about your service. It counts a list.', 'Select it to open that list, filtered.'),
  'home.projects': e('Projects by status', 'Each live project with its three lights (schedule, cost, scope), its phase, the next gate and how many tasks are blocked. Worst first. A project manager sees the projects they run.', 'Select a project to open it.', 'l:projects'),
  'home.project-row': e('A project', 'Its lights, its phase and gate, and how many tasks are open or blocked.', 'Select it to open the project.', 'g:project'),
  'home.gates': e('Gates due', 'The next gate on each project, soonest first, with who signs it. A late gate is red.', 'Select one to open the project.', 'g:gate'),
  'home.stuck': e('What is stuck', 'Urgent reports, projects with a red light, and blocked tasks, across the whole service.', 'Select a line to open it. See all opens every blocked task in the Work list.'),
  'home.regions': e('The regions', 'Offices, rooms and open incidents in each region. Every number opens its list.', 'Select a number to see the rooms or incidents in that region.'),
  'home.desk-new': e('New incidents', 'Tickets that have come in and have nobody on them yet, most urgent first.', 'Select one to triage it: the room, the evidence and who should take it.', 'g:incident'),
  'home.desk-open': e('In progress and on hold', 'Tickets someone is working on, or waiting on a caller, a vendor or parts.', 'Select one to see where it is.', 'g:incident'),
  'home.vendor': e('Your installation', 'For vendors: your rooms, your tasks and the records Aigna needs.', 'Select the button to open your installation.'),
  'home.team': e('Your team today', 'Each person you manage: where they are today and how much is on.', 'Select a person to see their day in the Schedule.'),
  'home.team-row': e('Someone in your team', 'Where they are today (office, home, visiting or away) and how many things are on.', 'Select it to open their day.'),
  'home.lab': e('In the Lab', 'Tests of new devices and firmware that are waiting or under way.', 'Select one to see how it is going.', 'g:lab'),
  'home.tasks': e('Your tasks', 'Everything that is yours, grouped Today, This week and Later, with the room, the project and when it is due. A change made in another window shows here straight away.', 'Tick a task to mark it done: it turns green, then moves to Done today. Undo is in the strip below. Select a task to open it.', 'l:projects'),
  'home.tasks-group': e('A group', 'Today is what is due today or overdue and anything live now; This week is due within seven days; Later is the rest, with the work plan folded to one line per office.', 'Nothing to do; the groups fill themselves.'),
  'home.task': e('A task', def('task'), 'Select it to open the task, or tick the box to mark it done.', 'g:task'),
  'home.tick': e('Tick done', 'Marks the task done through the live layer: who and when are recorded, and every open window sees it.', 'Select it. Select it again, or Undo, to put it back.'),
  'home.firmware': e('Firmware and advisories', 'Each firmware line with its standard version and what is in the Lab, and every open advisory with what to do.', 'Select a line to open the model, its firmware and the advisory.', 'g:advisory'),
  'home.blocked': e('Blocked on your projects', 'Every blocked task on the projects you run, with who has it and why it is stuck.', 'Select one to open the task and unblock it.', 'g:task'),
  'home.tour': e('The 5 minute tour', 'A few short lessons picked for your role, each with something to try.', 'Select Start the tour. The cross hides it for good.', 'l:help'),
  'home.across': e('Across Aigna', 'Every office, with how many of its devices are at each step of their life.', 'Select it to open the list, then an office to see its rooms.', 'g:lifecycle'),
};

// ---- Work overview ------------------------------------------------------------------------------------------------
const OVERVIEW = {
  'overview.matrix': e('Who does what', 'Open work by role and by kind, with the count in each square on a heat scale: the darker, the more.', 'Hover a number to look at the work. Select a number, a kind or a total to open that work in the Work list.'),
  'overview.seeas': e('See as', 'The rows are roles. A role\'s name is its See as chip: it lights the row and shows what that role owns, decides and hands on.', 'Select a role\'s name to see it as they do. Select it again to let go.', 'g:view-as'),
  'overview.all': e('Everyone', 'Every role at once.', 'Select it to clear the role and see all the work.'),
  'overview.role': e('{name}', 'A role. Its row counts the open work it has, by kind.', 'Select it to see this page as that role: its row lights up and opens to say who holds it, what it owns and what it decides. Its total opens its work in the Work list.', 'g:raci'),
  'overview.kind': e('{name}', 'A kind of work: a task, a step in Deploy, a booked visit or another kind. The column counts it across the roles.', 'Select it to open every piece of that kind in the Work list.'),
  'overview.cell': e('A count', 'How much open work this role has of this kind. Shared work counts once for each role on it.', 'Hover it to look at the work. Select it to open that work in the Work list, with the filters you picked here.'),
  'overview.total': e('{name}', 'A total: the open work in this row or column, with the filters you picked here.', 'Select it to open that work in the Work list. The list shows the same number.'),
  'overview.nobody': e('Nobody yet', 'Work that nobody has been given yet.', 'Select it to show that work here, then give it to someone in the Schedule. Its total opens it in the Work list.'),
  'overview.person': e('Open their Home', 'Someone who holds this role in the demo.', 'Select it to view Keia Atlas as them and go to their home page.', 'g:view-as'),
  'overview.scale': e('How to read the colours', 'The heat scale runs from fewer to more pieces of work.', 'Nothing to do. Numbers matter more than colour.'),

  'overview.row': e('A piece of open work', 'One task, step or visit: what it is, who has it, when and its status.', 'Select it to open it. Changes made in the Schedule or on a project show here too.', 'g:task'),
  'overview.today': e('Today across offices', 'For each office, who is on site today and what work is on there. It follows the Region and Office filters.', 'Select an office to open Day in the Schedule at that site.'),
  'overview.recent': e('Recent changes', 'The latest changes anyone has made to work, with who made them and when.', 'Change something in another window to watch it appear here.'),
};

// ---- Schedule -----------------------------------------------------------------------------------------------------
const SCHEDULE = {
  'schedule.views': e('Day, Week, Month, Year', 'Four ways to see the same schedule. Day is today across the offices, Week is each person, Month is a calendar and Year is the projects.', 'Select one. Keia Atlas remembers it.'),
  'schedule.scope': e('Whose schedule', 'Me shows your own work, My team shows the people you manage or work with, and Everyone shows all.', 'Select one. A name here means you came from a person\'s page: select it to let go.'),
  'schedule.zoom': e('5 days or 12 weeks', 'Zooms the week view out from the five days to twelve weeks of load.', 'Select 12 weeks to spot busy weeks ahead.'),
  'schedule.nav': e('Move in time', 'Steps to the previous or next working day, week or month, or back to now.', 'Use the arrows, or Today, This week or This month.'),
  'schedule.chip': e('A piece of work', 'A task, step or visit on a day. The colour is the kind and a dashed outline means the person is visiting the office.', 'Select it to open it. If you may assign it, drag it onto another person and day. Undo is offered.', 'g:task'),
  'schedule.pchip': e('A person', 'Someone, with their initials. Select one to see only their week.', 'Select it to open their week.'),
  'schedule.rchip': e('A booked room', 'A room that is booked out for work on this day.', 'Select it to open the room.', 'g:room'),
  'schedule.dayrow': e('An office today', 'Who is at this office today, and which rooms and work are on there.', 'Select a chip to open the person, room or work.'),
  'schedule.load': e('Load', 'Hours booked against six hours a working day. Light, busy, full or too much.', 'If someone is too full, move work to someone lighter.'),
  'schedule.tray': e('Unscheduled', 'Work that has nobody on it, whose owner is away, or that has no day yet.', 'Drag a piece of work onto a person and day, or select Assign.'),
  'schedule.assign': e('Assign', 'Gives this work to someone on a day. Who you may give work to depends on your role.', 'Select it, choose the person and day, then Assign. Undo is offered.'),
  'schedule.cell': e('A day', 'One day in the month, with what is on it.', 'Select the number to see the day in the panel on the right.'),
  'schedule.timeoff': e('Your time off', 'Your time off used, pending and left, and a form to ask for more.', 'Pick the dates and send the request. It shows as pending until a manager approves it.'),
  'schedule.lane': e('{name}', 'One lane of the year: projects, the pipeline, the Lab, work due in the plan or team load. Each row is a bar across the months.', 'Select the lane\'s name to fold it or open it. Select a bar to open what it is.'),
  'schedule.key': e('Key', 'What the colours and marks in this view mean.', 'Nothing to do. It changes with the view.'),
  'schedule.how': e('How the schedule works', 'A short explanation of where people are, load, assigning and the Unscheduled tray.', 'Open it if a chip or a number is not what you expected.'),
};

// ---- Deploy ----------------------------------------------------------------------------------------------------
const INTEGRATE = {
  'integrate.next': e('Open the next batch', 'Opens the first batch that still has work in it, in the order an engineer sets things up.', 'Select it to start, and use Open the next batch on each batch page to keep going.', 'g:batch'),
  'integrate.next-batch': e('Open the next batch', 'Goes to the next batch in the work order. The last one takes you back to the overview.', 'Select it when this batch is done, or to look ahead.', 'g:batch'),
  'integrate.next-room': e('Open the next room', 'Goes to the next room to commission. The last one takes you back to the overview.', 'Select it when this room is signed off.', 'g:integrate'),
  'integrate.views': e('Batches or rooms', 'Batches groups the units that share a configuration, for setting them up together. Rooms groups them by room, for commissioning.', 'Select Batches to set up, Rooms to commission.', 'g:batch'),
  'integrate.needs': e('Needs you', 'Only the exceptions: something Keia Atlas checked that did not pass, a room test that failed, or a task that is waiting. Everything that passed is not here.', 'Fix each one with its button or its sentence. It leaves the list by itself once Keia Atlas sees it fixed.', 'g:integrate'),
  'integrate.need': e('An exception', 'One thing that needs a person, with where it is, what is wrong and how to fix it.', 'Do what the second line says, then select its button. Recheck asks Keia Atlas to look again.'),
  'integrate.fix': e('Fix it', 'Recheck asks Keia Atlas to look again. Update sends the standard firmware. Reapply sends the profile again. Save gives a unit its hostname.', 'Select it once you have done what the line above says. Keia Atlas reports back in a moment.'),
  'integrate.checked': e('Checked by Keia Atlas', 'What Keia Atlas saw pass and nobody has accepted yet, grouped by batch (or by room in the Rooms view). Exceptions are never part of it.', 'Read the one-line summary of what passed, then accept it in one go.', 'g:integrate'),
  'integrate.ready': e('Ready to accept', 'A batch or a room whose checks passed: which checks, and how many.', 'Select Accept to sign it off in one action. It is recorded with your name, the time and what passed, and Undo is in History.'),
  'integrate.accept': e('Accept', 'Signs off everything that passed here in one action. Exceptions are left out. The record keeps who, when and which checks passed.', 'Select it, or press A in the units table. History has Undo.'),
  'integrate.accept-all': e('Accept everything that passed', 'Accepts every batch that passed in one action, with one record of what was accepted.', 'Select it when the list above is what you expect. Exceptions stay under Needs you.'),
  'integrate.batch': e('A batch', 'Every unit in this project that shares one configuration, such as three video bars. The bars show each step, one segment per unit.', 'Select it to open the batch: the shared setup once, then only what differs per unit.', 'g:batch'),
  'integrate.room': e('A room', 'The units this project changes in one room, and how far each has got. Commissioning is room by room.', 'Select Open the room for its room test.', 'g:room'),
  'integrate.kept': e('Kept as they are', 'Devices in these rooms that this project does not change. They are not set up again; the room test covers them.', 'Nothing to do here. If one should change, tell the project manager.'),
  'integrate.tasks': e('Tasks', 'The project\'s tasks in this phase, with who has each and when it is due.', 'Select a task to open it.', 'g:task'),
  'integrate.how': e('How it works', 'Batches instead of rooms, checks instead of ticks, and rooms and installers, in three short cards.', 'Read it once. After that the page explains itself.', 'g:integrate'),
  'integrate.vendor': e('Viewing as a vendor', 'A vendor sees only their own installs on this project: one action per unit, no configuration.', 'Select Installed when a unit is mounted, connected and powered on. Keia Atlas confirms it when it comes online.', 'g:view-as'),
  'integrate.installs': e('Your installs', 'The units in this room for you to install, one action each.', 'Select Installed per unit, or Mark the room installed. Add a serial or a photo of the label if you have it.'),
  'integrate.installed': e('Installed', 'Says this unit is mounted, connected and powered on. Where it is on the network, Keia Atlas then looks for it on its switch port.', 'Select it after the install.'),
  'integrate.room-installed': e('Mark the room installed', 'Marks every unit left in this room installed, in one action.', 'Select it once the whole room is in.'),
  'integrate.shared': e('Once for every unit', 'The shared setup for this batch: one profile, applied once, sets the settings that are the same on every unit.', 'Select Apply to send it, or Hand to the agent to have it prepared. Keia Atlas then reads each unit back.', 'g:batch'),
  'integrate.apply': e('Apply the profile', 'Sends the shared settings to every unit in the batch through device management. Units that are not online yet take it when they come online.', 'Select it once. Keia Atlas reads each unit back and fills in the Configure column.', 'g:stage'),
  'integrate.apply-agent': e('Apply the prepared run', 'The configuration agent has prepared the run for this batch. Agents only propose: a person applies it.', 'Select it to apply the run, then accept what Keia Atlas reads back. Discard throws it away.', 'g:agent'),
  'integrate.hand': e('Hand to the agent', 'Asks the configuration agent to prepare this batch\'s run. It changes nothing by itself.', 'Select it, then check what it prepared before you apply anything.', 'g:agent'),
  'integrate.agent': e('Prepared by the agent', 'What the configuration agent has prepared for this batch. Nothing has changed on any unit yet.', 'Apply it, or Discard it.', 'g:agent'),
  'integrate.confirm-all': e('Confirm all set', 'For units Keia Atlas cannot read back (switches on the back, a menu on the screen), a person confirms they are set as the configuration says.', 'Select it once they are all set. It is recorded with your name as one confirmation.'),
  'integrate.same': e('The same on every unit', 'Values that turned out to be the same for every unit in this batch, so they belong to the shared setup, not the table.', 'Nothing to do per unit. They are in the profile.'),
  'integrate.units': e('The units', 'Each unit in the batch with only what differs (its hostname, address and what it pairs with) and where each step stands.', 'Select a unit\'s name for its full detail. Select a Checked cell to accept it.'),
  'integrate.row': e('A unit', 'One unit in the batch. The row is selectable.', 'Arrow keys move, Space selects, A accepts what passed, Enter opens the detail.'),
  'integrate.pick': e('Select', 'Selects units, so Accept takes only those.', 'Tick the ones you want, then Accept, or press A.'),
  'integrate.keys': e('Keys', 'The units table works from the keyboard.', 'Arrow keys or J and K move, Space selects, A accepts, Enter opens a unit.'),
  'integrate.expand': e('A unit\'s detail', 'Opens every check for this unit: what each system holds, where it is online and what was read back, with History.', 'Select it to open or close. Only needed when something looks wrong.'),
  'integrate.step': e('{name}', 'One of the steps each unit goes through. Commissioning is done per room, on the room\'s page.', 'Read down the column to see every unit at this step.', 'g:integrate'),
  'integrate.cell': e('{name}', 'Where this unit stands at this step, and who or what said so: Checked (Keia Atlas saw it pass), a done word (accepted or done by hand), Needs you, Waiting, Under way or To do.', 'Select Checked to accept it. Select anything else to open the unit\'s detail.', 'g:integrate'),
  'integrate.own': e('Its own values', 'The values set on this unit that differ from the others in the batch.', 'Nothing to do: they are applied with the profile.'),
  'integrate.tick': e('Mark it done by hand', 'For a step Keia Atlas cannot see, or has not seen yet. Where Keia Atlas could see it, you give a reason.', 'Select it, then pick or type a reason if asked.'),
  'integrate.untick': e('Untick', 'Takes a step back to To do, with a reason, even if Keia Atlas saw it pass.', 'Select it, then pick or type a reason. History keeps both.'),
  'integrate.setup': e('Setup order', 'The configuration\'s steps in the order they must happen, with the next one open. Ticking is optional: Keia Atlas\'s checks decide when a unit is configured.', 'Open a step for how and why. Tick a unit, or Done on all to tick every unit at once.', 'g:configuration'),
  'integrate.su-step': e('A setup step', 'One step of the setup order, with how many units have it done. A dot means do it before the steps after it.', 'Select it to open or close it.'),
  'integrate.su-unit': e('A unit on this step', 'Whether this step is done on this unit.', 'Select it to tick or untick.'),
  'integrate.su-all': e('Done on all', 'Ticks this setup step on every unit in the batch at once.', 'Select it when you have done the step on all of them.'),
  'integrate.settings': e('Every setting', 'Every setting in the profile, grouped where it lives, with the value and why. The profile applies them together, so there is nothing to tick.', 'Open a group to read it.', 'g:configuration'),
  'integrate.roomtest': e('Room test', 'A few checks done in the room the way people will use it: a call, the displays, the sound, sharing, the booking panel.', 'Select Pass or Fail on each, or All passed when every one works.', 'g:integrate'),
  'integrate.test': e('A room test', 'One check in the room, with what good looks like.', 'Select Pass or Fail. Fail asks what went wrong, and it shows under Needs you.'),
  'integrate.all-passed': e('All passed', 'Records every room test as passed and signs the room off, in one action.', 'Select it when the whole room works. A failure: select Fail on just that test instead.'),
  'integrate.sign': e('Sign off the room', 'Says this room is commissioned. It is recorded with your name and the time.', 'Select it once every test has passed.'),
  'integrate.sheet-open': e('Build sheet', 'Every setting this unit gets, worked out to its own value (hostname, address, VLAN, calendar, time zone, vault entry), in setup order.', 'Select it to open the sheet. Copy, print or export it from there.', 'g:configuration'),
  'integrate.sheet-row': e('A setting', 'One setting for this unit: where exactly to set it, its value worked out from the data, Set or Check, and what Keia Atlas has seen. Not recorded means the data does not hold it yet; nothing is guessed.', 'Copy the value with the button beside it. The small line says where the value came from.'),
  'integrate.sheet-copy': e('Copy', 'Copies this one value, exactly as shown. For a secret it copies the password vault entry\'s name, never the secret.', 'Select it, then paste into the device or console.'),
  'integrate.sheet-copy-all': e('Copy all', 'Copies every setting in this group that is showing, one per line as setting and value.', 'Select it to paste the group into a note or a ticket.'),
  'integrate.sheet-copy-sheet': e('Copy the whole sheet', 'Copies every group, in setup order, as plain text.', 'Select it to paste the whole sheet anywhere.'),
  'integrate.sheet-csv': e('Export CSV', 'Downloads the sheet as a spreadsheet file: order, where, setting, value, Set or Check, and where each value came from.', 'Select it to save the file.'),
  'integrate.sheet-print': e('Print the sheet', 'Prints the whole sheet on its own, black on white, with the unit, room and project at the top.', 'Select it, then print or save as PDF.'),
  'integrate.sheet-unit': e('This unit', 'The values typed most (hostname, address, VLAN, time zone), where each step stands, and anything not recorded.', 'Copy a value from here, or select a Not recorded line to jump to its row.'),
  'integrate.sheet-steps': e('Its steps', 'Where this unit stands at Provision, Install and Configure, the same as its row on the batch page.', 'Select Checked to accept it; anything else opens the unit in its batch.', 'g:integrate'),
  'integrate.sheet-missing': e('Not recorded', 'Values the sheet cannot work out, because the data does not hold them yet, each with the reason. Keia Atlas never guesses one.', 'Record them where the reason says, or note them on site.'),
  'integrate.sheet-other': e('Another unit', 'The build sheet of the previous or next unit in this batch.', 'Select it to move along the batch.'),
  'integrate.inroom': e('In this room', 'The units this project changes in this room and where each stands, then the devices kept as they are.', 'Select a unit to open it in its batch.'),
};

// ---- Incident -----------------------------------------------------------------------------------------------------
const INCIDENT = {
  'incident.number': e('Ticket number', 'The number from the service desk\'s ticketing tool. Keia Atlas matched this ticket to a room and a device.', 'Quote it when you talk to the caller or the vendor.', 'g:incident'),
  'incident.priority': e('Priority', 'How urgent it is, from P1 (critical) to P4 (low). It sets who looks at it and how fast.', 'Nothing to do. The priority comes from the ticket.', 'g:incident'),
  'incident.state': e('State', 'Where the ticket is: new, in progress, on hold or resolved. On hold always says what it waits on.', 'Read the lifecycle below for the history.', 'g:on-hold'),
  'incident.lifecycle': e('Lifecycle', 'Each state the ticket has been in, with when and who. On hold is a pause, not a step.', 'Point at a step for its note.', 'g:incident'),
  'incident.picture': e('The room', 'The room, drawn to scale, with the device in question lit. Point at anything to find it in the list.', 'Select Room page to open the whole room.', 'l:room'),
  'incident.device': e('The device', 'The device or the whole room this ticket is about, with its model, hostname and asset tag.', 'Select Device page for its health, settings and history.', 'g:unit'),
  'incident.evidence': e('Evidence', 'What each connected system reports, such as booking, device management and monitoring. The light says whether it agrees with the fault.', 'Read it before you go to the room.'),
  'incident.health': e('Health checks', 'The device profile\'s healthy checks, run when Keia Atlas matched the ticket, and the firmware against the standard.', 'A red or amber row is where to start.', 'g:firmware'),
  'incident.next': e('Next, from the guide', 'The first check and the likely causes for this symptom, from the device profile, then the steps to try.', 'Follow the steps in order. If the guide is wrong, use Report.', 'l:report'),
  'incident.worknote': e('Work note', def('work-note'), 'Read it, then select Approve and add to the ticket. In this demo nothing is sent, and Undo takes it back.', 'g:work-note'),
  'incident.fix': e('Fix captured', def('captured-fix'), 'Nothing to do. If a fix keeps helping, it becomes part of the standard.', 'g:captured-fix'),
  'incident.matched': e('Matched by', 'How Keia Atlas worked out which room and device the ticket is about.', 'If it matched the wrong one, use Report to say so.'),
};

// ---- Room ---------------------------------------------------------------------------------------------------------
const ROOM = {
  'room.site': e('Office', def('site'), 'Select it to see every room at the office.', 'g:site'),
  'room.status': e('Status', 'Where the room is in its life: ordered, being installed, in service or retired.', 'Nothing to do. It follows the devices in the room.', 'g:lifecycle'),
  'room.picture': e('The room', 'The room drawn to scale from its room profile and build option. The devices are where they really are.', 'Point at a device to find it in the list, or point at the list to find it here. Select to keep one lit.', 'l:room'),
  'room.rack': e('The rack', 'The comms room rack from the front: small and whole on the left, the item you choose large on the right. Every item is drawn from its product\'s real front, and a port with a cable in it shows a plug in the cable\'s colour.', 'Choose an item in the small rack to see it large, with its facts. Point at a port to see where its cable goes.', 'g:idf'),
  'rack.labels': e('The whole rack', 'Every item in the rack at its height, to scale, with a bar in its group\'s colour. Free space is dashed.', 'Point at one to see its name. Select it, or use Up and Down, to see it large beside the rack. The address keeps your choice, so you can share it.', 'g:idf'),
  'rack.front': e('The item, large', 'The chosen item\'s front, drawn to scale with every port on it. A plug in a port is a patch cable, in its standard colour.', 'Point at a port, or use Left and Right, to see where its cable goes. Select to keep it and follow the links.', 'g:idf'),
  'profile.compare': e('How the comms rooms compare', 'Every comms room built to this profile: what it has against what the rooms it serves need (ports and rack, by the sizing method), and whether its network kit is the house standard (UniFi) or older kit due in the network refresh.', 'Select a room to open it and see every figure.', 'g:room-profile'),
  'room.standard': e('House standard', 'Whether the network kit in this comms room is the house standard (UniFi) or older kit, and the network refresh that replaces it.', 'Select the room profile in Compared against to see how every comms room compares.', 'g:idf'),
  'room.sizing': e('Sized for what it serves', 'What this comms room needs for the rooms it serves (data outlets, access ports with headroom, switches, PoE, rack space) against what is installed, with a verdict on each.', 'A shortfall is a task to raise. The rules are on the room profile.', 'g:idf'),
  'comms.sizing': e('{name}', 'One figure: what the rooms served need, worked out by the sizing rules, what this room has, and the difference.', 'Select the room profile to read the rule behind it.', 'g:idf'),
  'profile.sizing': e('How a comms room is sized', 'The method that fits a comms room to the rooms it serves: outlets, headroom, switches, panels, PoE, rack space and UPS, in order. There is no standard rack.', 'Read the steps, then open a comms room to see its own figures.', 'g:idf'),
  'profile.rule': e('{name}', 'One sizing rule and where it comes from: a house rule, the room profiles or the device models.', 'Propose a change if the rule should move.', 'g:idf'),
  'profile.parts': e('What goes in it', 'The parts of the standard and their models, with how many a comms room needs, and any older devices still in service.', 'Select a model for its profile. Units live on each comms room\'s page, not here.', 'g:idf'),
  'profile.part': e('{name}', 'One part of the standard: its model and how many a comms room needs.', 'Select the model to read about it.', 'g:model'),
  'profile.older': e('Older devices still in service', 'Network devices from before the standard that are still in comms rooms, and the refresh that replaces them.', 'Select the network refresh to see how it is done.', 'g:idf'),
  'room.patching': e('Patching', 'The patch cables recorded in the rack, one line per device with its cables in their standard colours, sized by how many.', 'Open a line to see each run and where it goes. Choosing a device in the rack opens its line.', 'g:idf'),
  'rack.key': e('What\'s in the rack', 'Every item in the rack, top first, with its model, hostname and health. This is the device list for the comms room.', 'Point at a row to find it in the rack; select it to see it large with its facts and links.', 'g:idf'),
  'rack.item': e('{name}', 'One item in the rack: its model, hostname and health. A light says whether its unit is in service and free of open incidents.', 'Select it to see it large beside the rack, with its ports, unit and links.', 'g:unit'),
  'rack.older': e('Older kit still installed', 'Devices from before today\'s standard that are still in the room but not in the rack drawing.', 'Select one to open its unit. They are replaced when the room is refreshed.', 'g:unit'),
  'rack.patching': e('{name}', 'One device\'s patch cables: how many, in their standard colours, sized by how many of each.', 'Select the line to see each run, what it is for and where it goes.', 'g:idf'),
  'comms.space': e('Rack space', 'How many rack units are free of the rack\'s height, and what any free space is kept for.', 'Check it before planning new kit for this room.', 'g:idf'),
  'comms.ports': e('Access ports', 'How many copper ports on the access switches are free, switch by switch, and the PoE budget the vendor states.', 'Check it before adding a room or device on this floor.', 'g:idf'),
  'comms.power': e('Power', 'The UPS in the rack, its battery pack and the feeds the power strips are on.', 'Load and runtime come from monitoring when it is connected.', 'g:idf'),
  'comms.uplinks': e('Uplinks', 'Where this comms room connects to: the MDF over the riser fibre, or for an MDF the internet circuits, the firewalls and each floor comms room it feeds.', 'Select a room to open it.', 'g:idf'),
  'room.banner': e('Replacement in progress', 'A device in this room is being replaced. The old one and the new one are both on record.', 'Select the links to see the project and the new unit.'),
  'room.kit': e('What\'s installed', 'Every device in the room, with its model and status.', 'Select a device for its health, settings and history.', 'g:unit'),
  'room.incidents': e('Incidents', 'Incidents raised for this room and how they ended.', 'Select one to open it, or All incidents to see the office.', 'g:incident'),
  'room.compared': e('Compared against', 'The room profile and build option this room is built to, and whether anything required is missing.', 'Select the profile to see what it needs. A missing device is a task to raise.', 'g:room-profile'),
  'room.lifecycle': e('Lifecycle', 'How many devices are at each step of their life: ordered, procured, being installed, in service and retired.', 'Nothing to do.', 'g:lifecycle'),
  'room.outlets': e('Outlets', 'The data and power outlets in the room and where each goes.', 'Use it to find the outlet a device should use.'),
  'room.guide': e('Room guide and QR', 'The page people in this room reach from the QR code on the table, and what they have sent from it.', 'Open the guide to see what they see, or print the table card for the room.', 'g:room-guide'),
  'room.guide-qr': e('QR code', "This room's code. A phone camera opens the room guide from it; it is drawn from the guide's public address.", 'Print the table card and put it where people sit.', 'g:room-guide'),
  'room.guide-sent': e('Sent from the guide', 'Problems reported and requests made from this room\'s guide, newest first, as they arrive.', 'Reports are also on the Incidents board, the office page and Home.', 'g:request'),
  'room.spares': e('Spare units', 'The spare units on this store\'s shelves, by model, against the least the office should keep. The IT store page has every unit, shelf by shelf, and the counted stock.', 'Open the IT store for the units and what to reorder.'),
  'room.team-notes': e('Notes from the team', 'Notes left on this room from a known issue with Tell the team: what the maker says is wrong, and the workaround, with who left it and when.', 'Read them before a visit. Select the issue for the full picture.'),
  'room.notes': e('Notes', 'Things worth knowing about this room that are not in its profile.', 'Read them before a visit.'),
};

// ---- Unit ---------------------------------------------------------------------------------------------------------
const UNIT = {
  'unit.find': e('Find a unit', 'Searches every unit by hostname, serial number, asset tag, room or model. Scanning an asset tag lands on its unit.', 'Type part of any of those, then select the unit.', 'g:unit'),
  'unit.status': e('Status', 'Where this unit is in its life, and whether it has open incidents.', 'Select the incident pill\'s number in the band to see them.', 'g:lifecycle'),
  'unit.picture': e('The unit', 'The unit drawn to scale from its model, with its lifecycle underneath. A red glow means an open incident.', 'Nothing to do. The lifecycle says what step it is at.', 'g:lifecycle'),
  'unit.facts': e('Facts', 'Where the unit is, what it is built to, and its identity: hostname, serial number, asset tag, address and dates.', 'Select the office, room, model or profile to open it.', 'g:unit'),
  'unit.advisories': e('Advisories', def('advisory'), 'Open one for what to do next.', 'g:advisory'),
  'unit.health': e('Health', 'Checks of each system that knows about this unit, such as booking, monitoring and device management. They are simulated until stage 2.', 'Select Check again to run them again.', 'g:stage'),
  'unit.check': e('Check again', 'Runs the health checks again, one after another.', 'Select it.'),
  'unit.config': e('Configuration', 'The settings that are unique to this unit, such as its name and calendar, filled in from its record.', 'Select Every setting to see the whole configuration.', 'l:configurations'),
  'unit.history': e('Work and incidents', 'Everything that has happened to this unit and its room, newest first: incidents, tasks, Lab tests of the model, and when it went in or came out.', 'Select a line to open it.'),
  'unit.usage': e('Usage', 'How much this unit is used. The figures are simulated.', 'Select the button to compare it across the fleet.'),
  'unit.connections': e('Connections', 'Each port on this unit, where its cable goes and which cable it is.', 'Use it when you trace a fault or replace the unit.'),
  'unit.network': e('Network', 'The path from this unit to the internet: the floor switch, the core and the firewall.', 'Select a comms room to open it.', 'g:mdf'),
};

// ---- Team ---------------------------------------------------------------------------------------------------------
const TEAM_KEYS = {
  'team.chart': e('Org chart', 'Who reports to whom. Anyone who manages people has a bar on their left edge.', 'Select a person for their details, or use the arrow keys to move between people.'),
  'team.chip': e('{name}', 'A person, with their role and, if they are away today, an Away mark.', 'Select them to see their week and details in the panel.'),
  'team.list': e('Everyone', 'The same people as a list you can scan.', 'Select a person for their details.'),
  'team.panel': e('Person', 'The selected person: their role, who they manage, who they work with and where they are this week.', 'Select a name in it to move to that person.'),
  'team.week': e('This week', 'Where they are each day, Monday to Friday, and the work on those days.', 'Select a line to open the work, or the schedule link for the whole week.'),
  'team.pick': e('A colleague', 'A person this one manages, reports to or works with.', 'Select them to see their details.'),
  'team.raci': e('Who does what (RACI)', def('raci'), 'Point at a letter for the reason. Pick a role to see only its work.', 'g:raci'),
  'team.flow': e('How the team works', 'Teams as boxes, and the work that passes between them, such as the standard, incidents and finished rooms.', 'Point at a team to follow its work. Select it to open its pages.', 'l:t-support'),
  'team.flow-team': e('{name}', 'One team, what it owns and what it does.', 'Select it to open its pages.'),
};

// ---- Other shared pieces that pages reuse ------------------------------------------------------------------------
// ---- The standards library (/standards/) ------------------------------------------------------------------------
const STANDARDS = {
  'std.card': e('{name}', 'A house standard: the rules integrators follow for one area, each with why and how to check it.', 'Select it to read the standard.'),
  'std.checklist': e('The must rules', 'Every rule this standard says every install must follow, in the order of the page.', 'Select a rule to jump to its reason, its check and its source.'),
  'std.facts': e('About this standard', 'Who owns the standard, its version, where it applies, and the device profiles, models, configurations and room profiles it governs.', 'Follow a link to see what the standard applies to.'),
  'std.rule': e('A rule', 'One thing to do, why it matters, how to check it was done, and where it comes from.', 'Do it, then prove it with the check. A rule marked Must has no exceptions without a change record.'),
  'std.level': e('{name}', 'Must: every install, no exceptions without a change record. Should: the default; an exception is written down with its reason.', 'Treat Must rules as blocking at handover.'),
  'std.house': e('House choice', 'Aigna\'s own decision, not a requirement of a public standard. Another company could choose differently.', 'Follow it here. To change it, propose a change to the standard.', 'l:change'),
  'std.sources': e('Sources', 'The public standards, regulations, guides and vendor documents the rules lean on, named and summarised in our own words.', 'Open a source to read its public page. Paid standards link to their publisher.'),
  'std.figure': e('{name}', 'A drawing of the rule, worked out from the same numbers as the table beside it.', 'Read it with the table and the rules below it.'),
};

const OTHER = {
  wiring: e('Wiring', 'How each device connects to the next, port to port, cable by cable.', 'Point at a connection to see its cable.', 'l:room'),
};


// Key figures in the page band. Each says what the figure counts; "what to do" comes from the general "number" card.
// A figure whose label is not here still gets the general card.
const NUMBER_WORDS = {
  'Urgent': 'Urgent issues waiting for someone to take them.',
  'Rooms being installed': 'Rooms with at least one device at the Being installed step.',
  'Open incidents': 'Incidents that are not resolved yet.',
  'Open': 'Incidents that are not resolved yet.',
  'High priority': 'Open incidents at P1 (critical) or P2 (high).',
  'On hold': 'Incidents waiting on something outside the team: the caller, a vendor, a change or parts.',
  'Resolution': 'How this incident ended.',
  'Related': 'Other incidents and work about the same room or device.',
  'Projects': 'The projects on record.',
  'Open projects': 'Projects that have not closed yet.',
  'Live projects': 'Projects that are under way now.',
  'In Deploy': 'Projects in the Deploy phase, where the devices go in.',
  'Blocked tasks': 'Tasks that cannot move until something else is sorted.',
  'Open tasks': 'Tasks and Deploy steps that are not done.',
  'Next gate': 'When the current phase is due to end and be signed off.',
  'Gate, late': 'The current phase is past the date its gate was due.',
  'Hours logged': 'Hours logged by everyone on the project, against the hours they were given.',
  'Open tasks in room': 'Tasks on projects in this room that are not done.',
  'On site today': 'People at an office today, not at home or away.',
  'Away today': 'People who are away today: time off or a public holiday.',
  'Need cover': 'Work whose owner is away on the day it is planned.',
  'Over-booked': 'People with more hours booked than a working day holds.',
  'Staff': 'People on the team in this demo.',
  'Regions': 'The regions the team works across.',
  'Offices': 'The offices on record, not counting the remote groups that hold the home offices.',
  'Room profiles': 'The kinds of room Aigna builds.',
  'Build options': 'The ways the room profiles can be built.',
  'Rooms built to them': 'Real rooms that follow one of these room profiles.',
  'With video': 'Room profiles that have a video call setup.',
  'With incidents': 'Rooms with at least one open incident.',
  'Seats': 'How many people the room is designed for.',
  'm²': 'The floor area the room profile is designed for, in square metres.',
  'Missing': 'Devices this room\'s profile needs that are not recorded in it.',
  'Matches its profile': 'Every device the room profile needs is recorded here.',
  'Connections': 'Cables recorded on this unit.',
  'Advisories': 'Warnings on this unit\'s model.',
  'Units': 'Units on record: physical devices, from ordered to taken out.',
  'Models': 'Different models on record.',
  'Models covered': 'Models that have a configuration.',
  'Devices covered': 'Devices this vendor is responsible for.',
  'Devices to record': 'Devices in your rooms that still need their serial number, MAC address or photo recorded.',
  'Rooms accepted': 'Rooms Aigna has accepted as finished.',
  'In use now': 'Models installed in a live room today.',
  'Older kit': 'Models still installed but no longer the standard.',
  'Support ended': 'Models whose firmware the maker no longer supports.',
  'Years in service': 'How long the oldest and newest units of this model have been in service.',
  'Past planned life': 'Units of this model that have passed the life planned for them.',
  'Rooms using it': 'Rooms that have this model installed.',
  'Past their year': 'Devices that have been in service longer than the work plan allows.',
  'In service': 'Devices in service today, counted for the work plan.',
  'With drift': 'Units whose settings have moved away from their configuration.',
  'Being configured': 'Units being set up from a configuration right now.',
  'To set or verify': 'Settings in this configuration you must Set or Verify.',
  'Changes asked for': 'Changes the owner sent back with a request for more.',
  'Waiting for review': 'Changes waiting for their owner to approve.',
  'Approved': 'Changes that have been approved, or money that has been approved.',
  'Merged': 'Changes that are now part of the standard.',
  'On the bench': 'Lab tests under way now.',
  'Waiting for a decision': 'Lab tests that passed and wait for the service manager.',
  'In the standard': 'Lab tests whose result was adopted into the standard.',
  'Failed': 'Lab tests that failed.',
  'Playbooks': 'The playbooks on record.',
  'Not in use': 'Playbooks no project is using.',
  'Steps': 'Steps in this playbook.',
  'Weeks': 'How long the playbook takes, in weeks.',
  'Long lead': 'Steps that take a long time to arrange, so they start early.',
  'Projects using it': 'Projects that follow this playbook.',
  'Stock lines': 'Different spare items in stock.',
  'Units on hand': 'How many spare units are on the shelf in all.',
  'Below minimum': 'Stock lines with fewer on the shelf than the minimum.',
  'Count overdue': 'Stock lines that have not been counted lately.',
  'Patched': 'Patch cables recorded.',
  'Spare': 'Spare cables recorded.',
  'Jobs in the last year': 'Jobs the vendors did for Aigna in the last year.',
  'Ending within 6 months': 'Vendor contracts that end within six months.',
  'In the vendor portal': 'Vendors who can sign in to their own installation page.',
  'Project budget': 'The money set aside for the year\'s projects.',
  'Committed': 'Money in projects already under way in this financial year, in euros at demo rates.',
  'Planned': 'What the work plan\'s replacements due this financial year cost, priced by device class and hours, less what a project already covers.',
  'Planned and estimated': 'The work plan\'s replacements due this financial year, plus what the scenarios adopted add.',
  'Devices to replace': 'Devices due for replacement in this financial year that no project has yet.',
  'Technician hours used': 'The hours the on-site technicians need this year (upkeep, the work plan, projects and scenarios adopted) as a share of the hours they have.',
  'Not yet given out': 'Budget that has not been given to a project yet.',
  'Paid so far': 'What has been paid out so far.',
  'Rooms funded': 'Rooms the plan can pay for with the budget as set.',
  'Rooms deferred': 'Rooms the plan leaves for later.',
  'Deferred at high risk': 'Deferred rooms where waiting carries a high risk.',
  'Of the week occupied': 'How much of the working week rooms are occupied.',
  'Of bookings no-show': 'The share of bookings where nobody turned up.',
  'Failed calls a week': 'Calls that failed to start or dropped each week.',
  'Flagged': 'Items with a usage flag, such as idle or stretched.',
  'Standards': 'The standards in the library.',
  'Rules': 'Rules across every standard in the library.',
  'House choices': 'Rules that are Aigna\'s own decisions rather than a public standard\'s requirement.',
  'Public standards named': 'Public standards, regulations and design guides the library leans on.',
};
const NUMBERS = Object.fromEntries(Object.entries(NUMBER_WORDS).map(([label, what]) => [`number:${label}`, e(label, what)]));

// Glossary terms, one entry each, made from the glossary itself.
const TERMS = Object.fromEntries(GLOSSARY.map((g) => [`term:${g.id}`, e(g.term, g.def, g.to ? 'Select a link on this page to open it.' : '', `g:${g.id}`)]));
// Words with a "what to do" of their own.
TERMS['term:set'] = e('Set', def('set'), 'Change it on the device, then tick the row.', 'g:set');
TERMS['term:verify'] = e('Verify', def('verify'), 'Look at the setting on the device, confirm it, then tick the row.', 'g:verify');

// ---- A project: the lights, the timeline, the charter, the board, the log and change requests --------------------
const PROJECT = {
  'project.light': e('{name}', 'One of three lights on a project: schedule, cost and scope. Green is on plan, amber needs watching, red needs a decision. The line under it says why.', 'Read the reason. The timeline, budget and change requests below carry the detail.', 'g:project'),
  'project.gate': e('The next gate', 'The end of the current phase: the checks it must pass, when it is due and who signs it off. A project moves on only when its gate is signed.', 'Select the phase on the timeline to see its record and the full gate.', 'g:phase'),
  'project.stuck': e('What is stuck', 'Blocked tasks, open issues and dependencies still waiting, so the thing to unblock is the first thing you see.', 'Select one to open it. The Log tab has every entry.'),
  'project.timeline': e('Timeline', 'One row per phase. The faint bar is what was planned, the filled bar is what happened, red is time past the plan. The diamond at the end of a row is the phase\'s gate: filled once it is signed off.', 'Select a phase to see what happened in it, its tasks and its gate.', 'g:phase'),
  'project.phasepanel': e('The phase record', 'What happened in the phase you picked on the timeline: when it ended against plan, what it handed on, who signed its gate, its tasks and the checks the gate needs.', 'Pick another phase on the timeline to change it.', 'g:phase'),
  'project.charter': e('Charter', 'Why the project exists, its scope, who sponsors it, who runs it, the dates and what success looks like. Agreed at the start and changed only through a change request.', 'Read it before you read anything else on the project.', 'g:project'),
  'project.taskviews': e('Board or list', 'Two ways to see the same tasks: columns by status, or one list in phase order. A closed project shows a summary of what was done instead of a board.', 'Select one. Keia Atlas remembers it.'),
  'project.addtask': e('Add a task', 'For work this project needs that the playbook does not list. You can also suggest it for the playbook, which sends it to the playbook owner to approve.', 'Select it, say what needs doing, and choose how it should count.', 'g:task'),
  'project.column': e('{name}', 'Tasks with this status. Only the statuses that have work show, and each column is as tall as its cards.', 'Drag a card here to change its status. Every window with this project open sees the move.', 'g:task'),
  'project.card': e('A task', 'One task: its title, room and due date, its status and who owns it. Open it for the steps and how it closes.', 'Select the title to open it. Change the status or the owner right here; the change is shared live and can be undone from History.', 'g:task'),
  'project.status': e('Status', 'The task\'s status: To do, Doing, Blocked or Done. Blocked tasks say why when you point at them.', 'Select it and pick a status. Or drag the card to another column.', 'g:task'),
  'project.assign': e('Who owns it', 'The person the task is assigned to, as their initials.', 'Select it to hand the task to someone else. The project team comes first; anyone away today is greyed.', 'g:task'),
  'project.picker': e('Assign to', 'Everyone who could take the task, the project team first. Someone away today is greyed but can still be chosen.', 'Type to narrow the list, use the arrow keys, and press Enter or select a name.'),
  'project.lessons': e('Lessons learned', 'Every fix captured when a task closed, and whether it has gone into the playbook so the next project starts with it.', 'Select the task to see where the fix came from, or the playbook to see it in place.', 'g:playbook'),
  'project.phasedone': e('{name}', 'What was done in this phase: when it ended, who signed its gate, and each task with any fix it captured.', 'Select a task to open its record.', 'g:phase'),
  'project.logentry': e('A log entry', 'A risk (might happen), an issue (has happened), a decision (agreed) or a dependency (waiting on someone else), with who holds it and what it links to.', 'Select a linked task, room or incident to open it.'),
  'project.change': e('A change request', 'A change to what the project delivers, with its effect on the date and the budget. The approver decides; until then the scope light shows it waiting.', 'If you are the approver, approve or decline it. History keeps who decided and when, with Undo.'),
  'project.approve': e('Approve', 'Accepts the change into the project\'s scope. The scope light and the log follow.', 'Select it to approve. Undo is in History.'),
  'project.decline': e('Decline', 'Turns the change down; the scope stays as chartered.', 'Select it to decline. Undo is in History.'),
};

// ---- Known issues and maker cases (decision 0029) -------------------------------------------------------------------
const KNOWN_ISSUES = {
  'page.known-issues': e('Known issues', def('known-issue'), 'Start with Needs your decision: link the incidents that look like a known issue, and raise repeats with the maker.', 'g:known-issue'),
  'tab:known-issues': e('Known issues', def('known-issue'), 'Select it to see what makers publish and what needs your decision.', 'g:known-issue'),
  'filter.facet:maker': e('Maker', 'The company that publishes the known issue, one feed each.', 'Pick one or more makers to narrow the list.', 'g:known-issue'),
  'filter.facet:model': e('Model', def('model'), 'Pick a model to see the known issues the maker lists for it.', 'g:model'),
  'filter.facet:affects': e('Affects us', 'Whether any of our units runs an affected version: yes, maybe (the version isn\'t tracked yet) or no.', 'Pick Affects us to see what matters now.', 'g:known-issue'),
  'ki.decide': e('Needs your decision', 'Incidents that look like a known issue, and faults that repeat across the fleet with no known issue. Keia Atlas proposes; a person decides.', 'Link or turn down each match. Raise a repeat with the maker, or choose not now.', 'g:known-issue'),
  'ki.match-card': e('Looks like a known issue', 'A known issue and the incidents that look like it, each with why: the model, the firmware version and the symptom.', 'Link the ones that are this issue. Linking never closes a ticket.', 'g:known-issue'),
  'ki.confidence': e('{name}', 'How sure Keia Atlas is. Strong: the same model, an affected version and the same symptom. Possible: something is missing, usually the version.', 'Read the ticks under it, then decide.', 'g:known-issue'),
  'ki.link': e('Link', 'Says this incident is this known issue. The incident keeps its own state; the person working it decides what to do.', 'Select it. It shows in every open window, with your name, and Undo is in History.'),
  'ki.not-this': e('Not this', 'Says this incident is not this known issue, so Keia Atlas stops proposing it.', 'Select it. Put back undoes it.'),
  'ki.put-back': e('Put back', 'Takes your answer back, so the match or the repeat is waiting for a decision again.', 'Select it.'),
  'ki.cluster-card': e('A repeat with no known issue', 'The same model and symptom, three or more times in 30 days or in more than one office, and no known issue explains it. Incidents already explained elsewhere are left out.', 'Raise it with the maker, or choose not now.', 'g:maker-case'),
  'ki.raise': e('Raise with the maker', 'Opens the case Keia Atlas prepared: the maker\'s support route, the models, versions, serials, the incidents in order and the logs to attach.', 'Select it, read the case, change anything, then send it.', 'g:maker-case'),
  'ki.open-case': e('Open the case', 'The case with the maker for this repeat, and where it has got to.', 'Select it to see it or record the maker\'s answer.', 'g:maker-case'),
  'ki.not-now': e('Not now', 'Leaves the repeat without a case for now. It stays on the list, dimmed, until you put it back.', 'Select it.'),
  'ki.history': e('History', 'Every decision on this item, newest first, with who made it and when.', 'Select it, then Undo any change.'),
  'ki.all': e('Every known issue', 'What each maker publishes, one card each, with what it means for our fleet.', 'Use the filters above, or open one for the units, incidents and fix.', 'g:known-issue'),
  'ki.cases': e('Maker cases', def('maker-case'), 'Open one to see what was sent, what the maker said and where it is now.', 'g:maker-case'),
  'ki.feeds': e('Maker feeds', 'Where each maker publishes its known issues, and when Keia Atlas last read them. Real feeds come from public release notes; demo feeds are made up.', 'Nothing to do. Keia Atlas reads each feed with the firmware list.', 'g:known-issue'),
  'ki.feed': e('{name}', 'One maker\'s feed: where it is published, when Keia Atlas last read it and how many known issues it holds. The times are simulated until stage 2.', 'Nothing to do.', 'g:known-issue'),
  'ki.ref': e('Maker\'s reference', 'The maker\'s own number for the issue. Where the maker publishes none, Keia Atlas gives it a name of its own.', 'Quote it when you talk to the maker.', 'g:known-issue'),
  'ki.status': e('Status', 'What the maker says: Open (no fix yet), Fixed (a version fixes it) or Won\'t fix.', 'Read The fix below for what it means for us.', 'g:known-issue'),
  'ki.affects': e('{name}', 'Whether any of our units runs an affected version, counting the maker\'s conditions, such as an external camera.', 'Read the fleet picture for where.', 'g:known-issue'),
  'ki.demo': e('Demo issue', 'Made up for this demo. It is not from a real release note.', 'Nothing to do.'),
  'ki.link-all': e('Link these incidents', 'Links every incident still waiting for a decision on this page to this known issue, one change each.', 'Read the list first. Each link shows in History, with Undo.', 'g:known-issue'),
  'ki.tell': e('Tell the team', 'Leaves a note on every room with an affected unit, so whoever opens the room sees the issue and the workaround.', 'Select it, check the words, then leave the note.'),
  'ki.fleet': e('Where it is in our fleet', 'Every unit of the models the maker names, by office: red runs an affected version, amber may, green doesn\'t or its room doesn\'t meet the maker\'s condition.', 'Point at a dot for the unit and its version; select it to open the unit.', 'g:unit'),
  'ki.maker-says': e('What the maker says', 'The known issue as the maker published it: reference, models, versions, the fix and the source, with when Keia Atlas last read it.', 'Follow the source to read the maker\'s own words.', 'g:known-issue'),
  'ki.workaround': e('Workaround', 'What to do meanwhile. It says whether the maker published it or it is Aigna\'s own.', 'Use it when the symptom shows up.'),
  'ki.incidents': e('Incidents that look like it', 'Every incident that matches the model, and the symptom or the maker\'s words, with an affected version where Keia Atlas knows it.', 'Link the ones that are this issue, or say Not this.', 'g:incident'),
  'ki.fix': e('The fix', 'What fixing it means for us: a rollout that already moves units to the fixed version, one to propose, or why the fix can\'t be installed here.', 'Follow the button or the link it gives.', 'g:firmware'),
  'ki.plan': e('Propose a firmware rollout', 'Records that a rollout to the fixed version is wanted. It starts from the Firmware rollout playbook, with a Lab pass first.', 'Select it. Take it back undoes it.', 'g:playbook'),
  'ki.maker': e('With the maker', 'The case with the maker about this issue, or a case Keia Atlas has ready when there is none.', 'Open the case, or raise one.', 'g:maker-case'),
  'ki.units': e('Affected units', 'Each unit on an affected version, or whose version isn\'t known, with its room, office and version. Rooms with a note show it.', 'Select a unit or a room to open it.', 'g:unit'),
  'case.id': e('Case', 'Aigna\'s number for the case. A case Keia Atlas has prepared says New until someone sends it.', 'Nothing to do.', 'g:maker-case'),
  'case.status': e('{name}', 'Where the case is: being prepared, sent, acknowledged, maker investigating, known issue published or closed.', 'Record the maker\'s answers in Tracking.', 'g:maker-case'),
  'case.send': e('{name}', 'Sends the case to the maker through its support route, as you. In this demo nothing leaves Keia Atlas. Once sent, the same button takes you to Tracking.', 'Read the case, then select it and confirm.', 'g:maker-case'),
  'case.doc': e('The case', 'What goes to the maker: who it goes to and under which contract, the subject, what we see, what we ask and the logs to attach.', 'Read it and change What we see if you want to before sending.', 'g:maker-case'),
  'case.summary': e('What we see', 'The fault in plain words, written by Keia Atlas from the incidents. Editable until the case is sent; each change is kept in History.', 'Change anything, then send.'),
  'case.logs': e('Logs to attach', 'The system logs and event histories Keia Atlas gathers for the maker when the case is sent.', 'Untick any you don\'t want to send.'),
  'case.track': e('Tracking', 'Each step of the case with who and when. Once sent, record what the maker says here.', 'Select the maker\'s answer, save its case number, and link the known issue when it publishes one.', 'g:maker-case'),
  'case.answer': e('{name}', 'Records this answer from the maker, with your name and the time.', 'Select it when the maker says so. Undo is in History.'),
  'case.ki': e('Known issue it became', 'The known issue the maker published for this case. Linking it puts the case at Known issue published and ties it to the fleet and the incidents.', 'Pick it and select Link.', 'g:known-issue'),
  'case.why': e('Why this case', 'What made Keia Atlas prepare it: a repeat across the fleet, or a known issue that affects us.', 'Nothing to do.'),
  'case.contract': e('Contract and support', 'The contract with the maker and its service levels, from Vendors, and who can swap faulty units meanwhile.', 'Nothing to do.'),
  'case.who': e('Who decides', 'Who prepares, sends and follows the case. Keia Atlas prepares; a person always sends.', 'Nothing to do.'),
  'case.evidence': e('The evidence', 'Each incident\'s device, where it is, its model, serial and version, then what happened in order.', 'Select an incident or a device to open it.', 'g:incident'),
  'case.timeline': e('What happened, in order', 'Each incident\'s opening, what device management and monitoring saw, and how it ended.', 'Nothing to do.'),
  'case.said': e('What each side said', 'The case\'s history as recorded: what Aigna sent and what the maker answered.', 'Nothing to do.'),
  'incident.known-issue': e('Looks like a known issue', 'A known issue a maker published that this ticket looks like: the same model, and the symptom or the maker\'s words, on an affected version where Keia Atlas knows it. A proposal, not a diagnosis.', 'Open it for the workaround and to link the ticket.', 'g:known-issue'),
  'incident.repeat': e('Part of a repeat', 'The same model and symptom keep coming back across the fleet, and no known issue explains it. Keia Atlas has a case ready for the maker.', 'Open the case to read it and send it.', 'g:maker-case'),
  'unit.known-issues': e('Known issues for this firmware', 'Known issues the maker lists for this model and the version it runs, or may run where the version isn\'t tracked yet.', 'Open one for the workaround, the fix and the rest of the fleet.', 'g:known-issue'),
  'number:To decide': e('To decide', 'Matches to confirm and repeats to raise that are waiting for a person.'),
  'number:Affect us': e('Affect us', 'Known issues with at least one of our units on an affected version.'),
  'number:Units exposed': e('Units exposed', 'Units running a version a maker says has a known issue.'),
  'number:Open maker cases': e('Open maker cases', 'Cases with a maker that are not closed.'),
  'number:Units, version unknown': e('Units, version unknown', 'Units of an affected model whose firmware version Keia Atlas doesn\'t track yet.'),
  'number:Incidents linked': e('Incidents linked', 'Incidents a person has linked to this known issue.'),
  'number:Fixed in': e('Fixed in', 'The version the maker says fixes it.'),
  'number:Units of the model': e('Units of the model', 'How many of this model Aigna has in service, across every office.'),
  'number:Working day to answer': e('Working day to answer', 'The maker\'s service level for a support case, from the contract.'),
};

// ---- Planning: the budget, scenarios and capacity by financial year --------------------------------------------
const PLANNING = {
  'planning.views': e('Budget, Scenarios, Capacity', 'Three views of the same year: the money (committed, planned, estimated), the scenarios you can compare and adopt, and the hours the work needs against the hours the team has.', 'Select one. The year in the filter bar applies to all three.'),
  'planning.year-money': e('The year in money', 'One bar for the year: committed (projects in flight), planned (the work plan, priced by device class and hours), estimated (scenarios adopted), against the budget envelope, the tick.', 'Select a figure to see the lines behind it, or the devices in the Work plan.'),
  'planning.by-kind': e('By kind', 'The year\'s money by what it is for: AV refresh, comms room refresh, new office, upgrade and the rest. Each bar is committed, planned and estimated in turn.', 'Select a kind to see only its lines.'),
  'planning.by-office': e('By region and office', 'The year\'s money, devices and rooms for each office, with the region\'s total above them. A new office from an adopted scenario gets a row of its own.', 'Select a figure: committed opens the office\'s projects, planned opens its devices in the Work plan.'),
  'planning.lines': e('The lines behind the figures', 'Every line the figures add up: one per project (committed), one per office and kind of work in the work plan (planned), and one per project a scenario adds (estimated), for every year.', 'Filter by year, region, office, kind or status; Sort by money, office or name. Select a line to open the project or the Work plan.'),
  'planning.line': e('A line', 'One project, or one office\'s planned replacements of a kind, in one financial year, with its money and where it goes.', 'Select it to open the project, or the devices behind it in the Work plan.'),
  'planning.scenario': e('A scenario', 'A change to the plan: a cut, a new office, a class refreshed early or a refresh delayed. It says what it does to spend, devices and technician hours in the year chosen, and its effect over the whole plan.', 'Select Compare to see it against the plan year by year, or Adopt to put it in the plan. Adopting is a live change: who, when, and Undo in History.'),
  'planning.try': e('Try a scenario', 'Makes a scenario from a few choices: how much to cut and when, where and how big a new office, which class to refresh early, or what to delay.', 'Choose, then Add scenario. It appears beside the others with its effect worked out, kept in this browser\'s live layer with who typed it.'),
  'planning.compare': e('Compared with the plan', 'The chosen scenario beside the plan as it stands, year by year: spend, devices, rooms, technician hours and engineer hours, with the change in each.', 'Select Compare on a scenario to bring it here. Amber is more, green is less.'),
  'planning.compare-btn': e('Compare', 'Brings this scenario into the comparison below, against the plan as it stands.', 'Select it, then read the table below.'),
  'planning.adopt': e('Adopt', 'Puts this scenario into the plan. Every figure on the page follows: the band, the year in money, the offices, the lines and the hours needed. Other windows on this computer see it too.', 'Select it. Undo is offered for a moment, and History keeps every version.'),
  'planning.role': e('{name}', 'The hours this role needs in the year (upkeep from the ratio model, the work plan and projects, and scenarios adopted) against the hours the people in it have. The tick is what is available.', 'If the figure is over 85%, look at By region and role below to see where, and at the headcount changes in the plan.'),
  'planning.by-region': e('By region and role', 'People, hours available and hours needed for each role in each region, with the estate the region looks after above its rows.', 'A short gap in one region and spare hours in another is a case for sharing people, or for a hire in the plan.'),
  'planning.ratios': e('The ratio model', 'How the hours are worked out: plannable hours a person a year, upkeep hours per room, unit, person and home office for each role, and the ratios the head of the service plans to. All house assumptions, so the arithmetic can be followed.', 'Read it before trusting a gap. Change the figures in data/planning/ratios.yaml.'),
  'planning.new-office': e('What a new office adds', 'For a small, medium or large office (like the ones on record): the fit-out cost and hours, then the upkeep hours it adds every year after, and when its units start falling due.', 'Try one as a scenario to see it in a year.'),
  'planning.headcount': e('Headcount changes in the plan', 'Planned hires and leavers by financial year, approved or proposed. They change the hours available from that year on.', 'Change them in data/planning/headcount.yaml.'),
  'planning.benchmarks': e('Published benchmarks', 'The staffing benchmarks that exist, named so someone with access can check them, and why none of them feeds the arithmetic.', 'Nothing to do here.'),
};

// ---- Services: the AV service, the network and IT infrastructure (src/pages/services/) -----------------------------
const SERVICES = {
  'page.services-overview': e('Services', 'The AV service, the network and IT infrastructure side by side: each one\'s light, owner, four key figures and worst three items. The figures are simulated live.', 'Select a service to open it, or a figure to see the list it counts.'),
  'page.services-av': e('AV service', 'How each service is doing: its light, its four key figures, what needs attention, its firmware against the standard, its incidents, its work and who runs it. The figures are simulated live.', 'Start with Needs attention, then use the bar to narrow by region, office, kind or status. Every figure opens the list behind it.'),
  'page.services-network': e('Network', 'How each service is doing: its light, its four key figures, what needs attention, its firmware against the standard, its incidents, its work and who runs it. The figures are simulated live.', 'Start with Needs attention, then use the bar to narrow by region, office, kind or status. Every figure opens the list behind it.'),
  'page.services-infrastructure': e('IT infrastructure', 'How each service is doing: its light, its four key figures, what needs attention, its firmware against the standard, its incidents, its work and who runs it. The figures are simulated live.', 'Start with Needs attention, then use the bar to narrow by region, office, kind or status. Every figure opens the list behind it.'),
  'services.card': e('{name}', 'One service: its light, its owner, four figures and its three worst items right now.', 'Select the name to open the service, or a figure to see what it counts.'),
  'services.light': e('The service light', 'Green when everything in the service is online, amber when something has a fault, red when several are offline or one in ten has a fault.', 'Open Needs attention to see what is behind it.'),
  'services.owner': e('Service owner', 'The service manager who owns this service: what goes into its standard and who signs off its changes.', 'Select the name to see them on the Team page.'),
  'services.health': e('Health by office', 'A bar for each office: green online, amber with an alert, red offline. It follows the filters above.', 'Select an office to show only its units, or a count to show the ones in that state.'),
  'services.units': e('Every unit in the service', 'Each dot is one unit or item, coloured by how it is doing now, in the office it belongs to.', 'Hover a dot to look, select it to open it.'),
  'services.commsrooms': e('Comms rooms against the standard', 'Each recorded comms room checked for a UPS, two power feeds, an out-of-band console, a fibre patch panel and switches on the house standard, with the space left in its rack.', 'Select a room to open it and see its rack.'),
  'services.firmware': e('Against the standard', 'For each model in the service: how many units there are, how many run firmware behind the standard, the standard version, and the advisories and known issues that apply.', 'Select a model to open its profile, or the known issues count to see them.'),
  'services.incidents': e('Service incidents', 'The open incidents on this service\'s kit. Each keeps its unit on alert until it is resolved.', 'Select an incident to open it.'),
  'services.changes': e('Changes and upcoming work', 'The open projects that touch this service, and the project tasks due in the next two weeks.', 'Select a project or task to open it.'),
  'services.stock': e('Stock and records', 'Spares for this service that are below their minimum on the shelf.', 'Select a spare to open it in Spares.'),
  'services.owners': e('Who runs this service', 'The roles that run this service, who holds them, and what each owns, decides and hands on, from the roles on the Team page.', 'Select a name to see them on the Team page.'),
  'services.owner-card': e('{name}', 'A role in this service, who holds it, and what it owns, decides and hands on.', 'Select a name to see them on the Team page.'),
  'services.belongs': e('What belongs to each service', 'The kinds of kit each service looks after, with how many. A switch inside a room is AV; a switch in a comms room is the network.', 'Select a kind to open that service, filtered to it.'),
  'number:Rooms working now': e('Rooms working now', 'Rooms that are open with nothing wrong: in use or free. Simulated live.', 'Select it to see them in the Rooms overview.'),
  'number:Units alerting': e('Units alerting', 'Units in this service that are offline or raising an alert now. Simulated live.', 'Select it to see them on the unit map.'),
  'number:Firmware behind the standard': e('Firmware behind the standard', 'Units running firmware behind the standard. Simulated; device management will report it.', 'Select it to see them on the unit map.'),
  'number:Offices online': e('Offices online', 'Offices with their gateways up and at least one internet circuit up. Simulated live.', 'Select it to see the health of each office.'),
  'number:Home gateways online': e('Home gateways online', 'Home office gateways that are up. Simulated live.', 'Select it to see them on the map.'),
  'number:Switches alerting': e('Switches alerting', 'Switches in comms rooms that are offline or raising an alert now. Simulated live.', 'Select it to see them on the map.'),
  'number:Circuits up': e('Circuits up', 'Internet circuits that are up. Simulated live.', 'Select it to see them on the map.'),
  'number:Comms rooms to standard': e('Comms rooms to standard', 'Comms rooms that pass all five checks: UPS, two power feeds, out-of-band console, fibre patch panel and switches on the house standard.', 'Select it to see each room and what is still to do.'),
  'number:UPS and power strip alerts': e('UPS and power strip alerts', 'UPS and power strips that are offline or raising an alert now. Simulated live.', 'Select it to see them on the map.'),
  'number:Rack space short': e('Rack space short', 'Racks with less than 6U free, counting reserved growth space as free.', 'Select it to see the space in each comms room.'),
  'number:Links with a fault': e('Links with a fault', 'Fibre and cabling links that are down or raising an alert now. Simulated live.', 'Select it to see them on the map.'),
  'number:Services running well': e('Services running well', 'Services with a green light: nothing offline and nothing alerting. Simulated live.', 'Select it to see the three services.'),
  'number:Units needing attention': e('Units needing attention', 'Units across the three services that are offline or alerting now. Simulated live.', 'Select it to see the three services and their worst items.'),
};

export const HELP = {
  ...SHELL, ...PLACES, ...PAGES, ...PARTS, ...FILTER, ...HOME, ...OVERVIEW, ...SCHEDULE, ...INTEGRATE, ...INCIDENT,
  ...ROOM, ...UNIT, ...TEAM_KEYS, ...STANDARDS, ...OTHER, ...PROJECT, ...PLANNING, ...NUMBERS, ...TERMS, ...KNOWN_ISSUES, ...OFFICE3D, ...LOCATIONS, ...SERVICES,
};

// Where "Learn more" goes: a hash on the Learn page. Lessons open by their id, glossary words by g-<id>.
const LESSON_TITLE = Object.fromEntries([...USING, ...TEAM].map((l) => [l.id, l.title]));
export function learnLink(ref) {
  if (!ref) return null;
  const [kind, id] = ref.split(':');
  if (kind === 'l') { if (!LESSON_TITLE[id]) throw new Error(`help.mjs: no lesson "${id}"`); return { hash: `#${id}`, label: LESSON_TITLE[id] }; }
  if (kind === 'g') { if (!TERM[id]) throw new Error(`help.mjs: no glossary term "${id}"`); return { hash: `#g-${id}`, label: TERM[id].term }; }
  throw new Error(`help.mjs: bad learn reference "${ref}"`);
}

// The registry as the page reads it: a family entry takes what it lacks from its general entry.
export function helpJson() {
  const out = {};
  for (const [key, h] of Object.entries(HELP)) {
    const base = key.includes(':') && !key.startsWith('term:') ? HELP[key.split(':')[0]] : null;
    const doText = h.do ?? base?.do;
    const learn = learnLink(h.learn ?? base?.learn);
    out[key] = { name: h.name, what: h.what, ...(doText ? { do: doText } : {}), ...(learn ? { learn } : {}) };
  }
  return out;
}

// Which key an element means, following the same rule as the page: exact, then the part before the colon.
export function hasHelp(key) {
  if (key === 'page') return true;
  if (HELP[key]) return true;
  const family = key.split(':')[0];
  if (key.includes(':') && HELP[family]) return true;
  return key.startsWith('page.') && !!HELP['page.generic'];
}
