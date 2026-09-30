# The Keia Method

A way of running IT from one living record of every room, device and job: kept by the work itself, readable in a minute, as deep as you need.

Read Level 1 in minutes. Read Level 2 in an afternoon. Level 3 is for looking things up, and How it fits maps the method to ITIL, ISO, PMI and the other frameworks IT people already know. There is no exam; people get good by using it.

---

## Level 1: one screen

Workplace IT runs on a console per vendor, forms that ask what the alert already said, and knowledge that leaves when people do. Keia keeps one record of every room, device and job, written as the work happens, with a named owner on each. It keeps the words ITIL people know. Start small; go as deep as you like.

**Five ideas**

1. **Start from the building.** Every room, device and job has one living record, read from the place outwards and shared by everyone who touches it. *Open the office: the floor plan, every device as a circle, who is on site, what is open. Click the room, then the device, then the port.*
2. **Capture, don't ask.** The systems already know the device, the place, the time and the last change; a person is asked only for what only a person knows. *An alert becomes an incident already filled in. Closing it asks one thing: "What fixed it?"*
3. **Answer first.** Every page opens with whether things are all right, then four figures, then the evidence, down to the raw record. Quiet when fine; one signal, once, when not. *"All services within target" opens to seven incidents, then to the device log.*
4. **Own it, hand it on.** Every job has one named owner until the person is back working. It moves as a whole, with its context, to a colleague, a team, a vendor, or a rule someone owns. *"Now with Network team: needs a switch config change."*
5. **Learn as you go.** The guide sits beside the device, the fix is kept where it was found, the help explains the screen you are on. Full for a first-timer, fading as skill grows. *A new technician sets up a video bar right first time; on her fifth, the checklist is shorter.*

**Eight words you need:** Incident (something is broken), Request (someone wants something), Problem (the cause behind repeating incidents), Change (a planned alteration to something in service), Service (what IT provides, with an owner and a target), Ready for you, With (who holds the work now, and why), Waiting on (what it is stopped for).

**How routine work gets done.** Software may do routine work (reboot, re-apply a setting, re-sync, update a record) only under a standing rule a named person approved once, within caps, and only where the action can be put back. Anything irreversible is a proposal a person confirms. Every automatic action shows what it read, what it did and why, with Undo or Roll back where one exists. Keia works with AI switched off.

**Where it comes from.** Keia keeps ITIL's nouns and PMI's project structure and puts them on one record. It changes the verbs: capture instead of ask, hand on instead of escalate, a rule someone owns instead of a board for routine work.

---

## Level 2: the practices

### 2.1 The problems it answers

| The problem | What it costs | Evidence |
|---|---|---|
| A console per vendor, and the join between them in someone's head | Network teams run 4 to 10 monitoring tools; none surveyed has reached one view | EMA 2026; SolarWinds 2026 |
| Forms that ask what the system already knows | The portal is the slowest channel (4 h 26 min lost per incident against 1 h 24 min for a walk-in); only 44% of issues are reported at all | HappySignals 2026; Nexthink 2023 |
| Work bounced between teams and vendors | Each reassignment cuts satisfaction by about 10 points and takes lost time from about 2 h to about 9.5 h | HappySignals 2025, 2026 |
| Service levels green, people unhappy | 3 h 18 min lost per incident; 13% of tickets cause 80% of lost time; only 6.6% of praise is about the fix | HappySignals 2026 |
| Rooms that fail and nobody records it | 75% of hybrid meetings hit a technical fault (about 11 min each); 34% use a laptop as the room mic instead of reporting | Jabra 2026 |
| Knowledge that leaves with people | 42% of role knowledge is unique to one person; knowledge management is the weakest ITSM practice (20% say it works) | Panopto; Axelos 2022 |
| Handover as a pile of PDFs | 65% of owners receive asset information unstructured; poor handover costs US owners about $10.6B a year | UK BIM Alliance; NIST 2004 |
| Status reporting by hand | 72% of PM staff spend half a day a month collating reports; a third of projects are not baselined | Wellingtone 2026 |
| Alerts that need no action | 67% of security alerts are ignored; clinicians override up to 96% of drug alerts. Nobody has measured AV and network; the pattern is the same | Vectra 2023; Ancker 2017 |
| Audit as a scramble | 56% rate their CMDB 85% accurate or less; 78% of "audit-ready" organisations still need days of preparation | Oomnitza 2024; Huntress 2026 |
| Training apart from the work | Training transfers only where it can be applied at once; one-off courses fade | Blume 2010 |
| Tools built from the database outwards, or a "simple" front that hides what technical people need | Either overwhelmed or under-served; the expert opens a terminal | Observed practice |

Some of these are organisational, not tooling: change boards exist for compliance and politics, tiers exist because skills differ. The method answers the parts a record and a way of working can answer, and says so.

### 2.2 Start from the building

**What you do.** Model the places first: region, office, floor, space (any place technology lives, including a home office), then the units in each space and what they connect to. Every other record (incident, change, project, contract, knowledge) attaches to a place or a unit. The space type is the standard a space is built to; the gap between the standard and the space is the work.

**The moves.** Zoom (region to port and back, each step a real page). Lens (one floor plan; switch on Network, Support, Projects, Vendors, Knowledge). Trace (the service map from the internet circuit to the device, lit by health).

**What you'll see.** One page shape for every object: where it is and what it is connected to, what is happening now, discussion, history, then the object's own detail. The same circle for health everywhere, with a word beside it.

**Why it works.** Nobody else joins the space, the device, the change, the owner and the vendor in one record; the join today lives in someone's head. Facilities tools own floors; IT tools own devices; the room's technology belongs to neither.

**Limits.** Real estate and property services (leases, space planning, moves, soft services) are another profession's record; Keia exchanges space data with those systems and never owns it. Laptops and phones are out of scope.

**Measure.** Spaces with a complete record; devices found on the network but not in the record; time from handover to a usable operational record.

### 2.3 Capture, don't ask

**What you do.** Every record is filled from what the systems know before a person sees it: the alert names the unit, the unit knows its space, the calendar knows the booking, the build sheet knows the settings, the change log knows what happened last. Categories are the space and the device type the record already has. A person is asked one thing at a time, and only what only they know.

**The moves.** Confirm (accept what was captured, correct what was not). Capture (one sentence at the moment of knowing: "What fixed it?" or "Nothing new"). Propose (a captured fix that keeps helping becomes a proposal to the setup guide, approved by its owner).

**What you'll see.** An incident that arrives with space, unit, likely known error, last change and a proposed priority a person may change. A change written from the work, not typed after it. The as-built record from a project becoming the operational record the next day.

**Why it works.** The form is the slowest, least-liked channel, and half of problems are never reported. Extraneous load (hunting, re-typing, translating) is the only kind design can remove.

**Limits.** Capture needs feeds. Say what works with no connector (the catalogue, space types, floor plans, standards, build sheets, the room guide) and label every connected figure with its source and time.

**Measure.** Fields filled by capture against fields typed; reports per space against faults observed; time to a filled-in incident.

### 2.4 Answer first

**What you do.** Every page opens with one sentence that answers "is it all right?", then at most four figures that answer "how many need me?", each opening the list it counts. Summaries never unfold in place; every number drills down to the owning list with its filters in the address. Detail opens where it came from, down to the raw record, the log and the config. Nothing is hidden and nothing is forced.

**The moves.** Drill (a number opens its list, the list opens its record). Peek (hover shows, click opens). Set your depth (open a page at the layer you use; it is remembered).

**Urgency when it is real.** Red, urgent words and motion appear only for a P1 or major incident, a safety matter, or a live event at risk, and they leave when it is over. Everything else is a fact with a date: "Past target since 09:14", "3 to review", "12 new". A quiet page proves it is quiet: "checked 40 s ago". A feed that has not reported in its window is itself a fault.

**Motion.** Stillness means fine. One motion, once, when a state changes. Navigation keeps the object in view as the page changes around it. Nothing pulses to look alive. Reduced motion replaces travel with cross-fades and keeps every meaning.

**Why it works.** People hold about four things at once; alerts that need no action train people to ignore the ones that do; static small multiples beat animation for reading data; cockpits, control rooms and intensive care all learnt to be quiet when normal and loud only when it matters.

**Limits.** Density is a layer, not a mode: the first screen is simple, every layer below is denser, and the raw layer is never removed. Experts set their own default depth.

**Measure.** Clicks from Home to the record; alerts that led to an action against alerts raised; pages red at any time against incidents open.

### 2.5 Own it, hand it on

**What you do.** Every job has one named owner, from the person who asked or the service owner who approved the rule. The owner keeps it until the person is back working, or hands it on as a whole: the record moves, with its history, evidence and context, and says who has it now and why. Vendors, integrators and managed service providers are peers in the same record with access scoped to the job and ending when it closes. Routine work is handed to a standing rule owned by a person.

**The moves.** Take (pick it up). Hand to (pass it as a peer, with why). Park (one minute: where I stopped, the next step, the open question; resuming takes one glance). Run (a rule does the outcome). Roll back or Undo (where the rule has one).

**The default when nothing moves.** Work not taken within the service's response target goes to the service owner. A major incident names one commander. A hand-off to a vendor carries the contract's clock, visible to both sides.

**Cover.** Handover for leave or a shift is a fixed short card (open, fragile, who owns it, what changed), not a chat thread. Coming back opens with what changed, what is yours and what was handled.

**Why it works.** Each reassignment multiplies lost time and cuts trust; a structured handover cut medical errors by 23%; external change approval does not reduce change failures. Peers with context beat tiers without it.

**Limits.** Escalation exists for reasons: contractual clocks, skills, command in a crisis. The default owner, the commander and the visible clock answer those without a tier.

**Measure.** Reassignments per job; time with nobody; jobs parked with a resume note; vendor response against the contract, read from the record.

### 2.6 Learn as you go

**What you do.** Put the knowledge where the work is. The setup guide opens beside the device being configured; the incident shows what was tried and what fixed it the last two times; the Help switch explains any control on the screen you are on; each lesson ends with a thing to try. Guidance is full the first time and shortens as a person's own record shows they no longer need it. Rarely used procedures come back in full after a long gap.

**The moves.** Switch on help (point at anything). Try it (every lesson has a task in the demo). Capture (what you learnt goes on the record, with your name).

**Progress, never points.** Show team progress on real outcomes (spaces that worked first time this month, problems fixed for good), and impact on the record ("Boardroom back for the 10:00"). A personal mastery record is private and opt-in and only shortens checklists. No leaderboards, no per-person rankings, no streaks, no points for volume or speed.

**Why it works.** Training transfers only where it is applied at once; step-by-step help that aids a novice hurts an expert; visible progress on meaningful work is the strongest motivator measured; points and leaderboards at work crowd it out.

**Limits.** People must keep doing the diagnosis. On a P1 or P2 the person records what they think before a suggestion is shown; any rule can be run by hand to keep the skill.

**Measure.** Right-first-time setups by a first-timer; time to competence for a new starter; captured fixes reused ("used on 14 installs").

### 2.7 Choose your modules

There is no staged journey. A team switches modules On, Connected (an outside tool shows its data in the same page shape with a source mark) or Off, and starts anywhere. The smallest useful setup is the device catalogue. It works for one person or a thousand: a one-person team has no tiers to remove and lets rules do more; a global team has the same records and the same words.

The scope rule: Keia owns the record of what is in the building and the work on it; connects to the systems that run each technology; leaves alone anything that is a whole product of its own (print queues, DNS, video retention, access credentials, HVAC control, real estate and space planning, endpoint management).

| Module | On its own | With the others on |
|---|---|---|
| Device catalogue | Models with cited facts, ports and drawings; standards; setup guides | Units in spaces with build sheets; firmware against the standard; known errors matched to the fleet |
| Locations | Floor plans, every device a health circle, who is on site | Incidents lit in their space; the change calendar on the floor |
| Services | A map per service; levels within or past target | Incidents, changes and vendors on the map; experience measures |
| Support | One queue for incidents, requests, problems and changes; hand-offs; standing rules | The incident story on the space drawing; changes written from work |
| Projects | Playbooks; a programme that is always current; deploy batches that verify instead of tick | The as-built record becomes the operational record; lessons into setup guides |
| Vendors | Contracts and end dates; cases; performance from the record | The vendor as a peer in the flow, scoped to the job |
| Knowledge | Runbooks, lessons, guides, glossary, with owners and review dates | Fixes captured where work closes |

### 2.8 How the work gets done

| Rule | Meaning |
|---|---|
| A rule has a named owner | A standing rule is a standard change the service owner approved once, with its conditions and its rollback; nothing runs outside it; the owner is told on every run |
| Reversible runs, irreversible asks | Bounded, reversible actions run within caps (never more than N devices per wave, never in a booked meeting, never in a freeze, halt on failures). Firmware, resets, deletes, bulk pushes, and anything touching security, identity, access or life safety are proposals a person confirms every time |
| Read freely, write narrowly | Software reads on its own; writes only under its rule; never does what is prohibited, for anyone |
| Checked by reading back | After every write the system is read back and compared; a write that does not read back as intended is "Unable to complete", never "done" |
| Undo, Roll back, or ask | Each rule declares which it has; the screen never shows an Undo that is not real |
| One line, one card, one log | "Done automatically under the DNS rule (owner: Nora)" on the record; "How was this done?" opens what it read, did, ruled out and did not check; the full trace is in the audit log |
| Text is data, not instructions | Ticket text, device names and vendor notes are untrusted; software that reads them cannot send data out |
| People keep the diagnosis | A suggestion follows the person's own call on P1 and P2; any rule can be run by hand; every action explains itself so people learn how their workplace behaves |
| Never about people | No scoring, ranking or allocation of work by an individual's behaviour or performance |
| Your model, your region, or none | The customer chooses the model and where it runs, including local only, or turns AI off; nothing trains on customer data; every AI call is logged with model and region; an assistant says it is AI |

### 2.9 Why IT can trust it

| | |
|---|---|
| Named ownership | Every change, task, incident and rule has a person; automatic work runs under that person's rule and reports to them |
| A record that cannot be quietly edited | Who, what, when, before, after, on every object; the audit log is also the change history and the auditor's evidence |
| Inspectable | "How was this done?" on every automatic action; every figure names its source and time; the raw record one click down |
| Least privilege | Connectors read-only by default; a write scope belongs to a named rule; per-platform service accounts in a vault; vendor access scoped to a job and ending with it |
| Bounded automation | Caps per wave, rings, halt on failures, change windows, two people above a blast-radius threshold, a kill switch |
| Restricted by default | Floor plans, camera and door positions, IP plans and the vulnerable-firmware list are restricted by schema; exports are watermarked and logged; live camera feeds are never stored |
| Keia is a service too | In its own catalogue with an owner and a service level; when the fault is ours, the incident says so |
| No rip and replace | Existing service desk, asset, fleet and network tools connect through one layer and stay the record for as long as the team wants |

---

## Level 3: the reference

### 3.1 Words

One vocabulary, no settings switch. ITIL, ITSM and PM terms where they are terms of art; plain verbs and statuses where ITIL is procedure-speak. When a module is connected, both states show: "Waiting on vendor · ServiceNow: Awaiting Vendor".

| On screen | Plain meaning | Maps to |
|---|---|---|
| Incident, Major incident | Something is broken; one so big it runs the urgency rule and names a commander | ITIL incident |
| Request, Service catalogue | Someone wants something that is not broken; the list to choose from | ITIL service request |
| Problem, Known error | The cause behind repeating incidents; a cause with a known workaround | ITIL problem, known error |
| Change: Standard, Normal, Emergency; Standing rule | A planned alteration; a standard change approved once so software may run it | ITIL change enablement |
| Service, Service owner, Service level, Within target, Past target | What IT provides; who answers for it; the promise; kept or not | ITIL service, SLA |
| Experience measure | What the people got: meetings started on time, spaces that worked first time, lost time per incident; per space, never per person | XLA |
| Priority P1 to P4 | Proposed from impact and urgency; a person may change it, with the reason kept | ITIL priority |
| Space, Space type | Any place technology lives; the standard it is built to. "Room" stays where people say room | Composite profile |
| Unit, Model, Device type | One physical thing; one product; a kind of device | ITIL asset management |
| Setup guide, Build sheet | The settings for a model, in order; every setting's actual value for one unit | Configuration |
| Relationship, Service map, Confidence | How things connect; the drawn picture; how sure the record is, from its source and age | CI, CMDB |
| Project, Programme, Baseline, Milestone, Gate, RAID log, Scope change | As PMI and PRINCE2 use them | PMI, PRINCE2 |
| Vendor, Partner, Contract, Case | A company relied on; one with people working in the record; anything with an end date; a ticket with them | ITIL supplier management |
| Knowledge, Runbook, Lesson, Proposal | Know-how; steps; what was learnt; a proposed edit to a standard | ITIL knowledge management |
| Module: On, Connected, Off; Connector; Source mark | Built in, fed by an outside tool, or not used; the adapter; "from ServiceNow, 09:14" on a figure | |
| **Verbs:** Take, Hand to, Park, Run, Run again, Undo, Roll back, Accept all, Prepare, Propose, Approve, Capture, Export | Pick it up; pass it as a peer; leave a resume note; do the outcome; retry; put it back; restore the declared previous state; verify a batch at once; get a draft ready; suggest an edit; say yes; record a fix; take the data with you | Replace assign, escalate, execute, submit |
| **Ready for you** | Prepared and waiting for you | Replaces needs you, action required, assigned |
| **With you / With Anna / With Network team / With Poly (vendor)** | Who holds the work now, and why | Replaces assigned, escalated, tier |
| **To review** | A person should look; nothing is broken yet | Replaces warning, needs attention, needs a look |
| **Waiting on** + who or what | Stopped until something outside the record moves | ITIL on hold; replaces blocked, pending |
| **In progress, Resolved, Closed, Done** | Being worked; fixed and checked; finished with lessons kept; the outcome happened | ITIL states |
| **Done automatically** | Run under a standing rule, read back, recorded, with "How was this done?" | Automated standard change |
| Agent | Software that does routine work under a standing rule; changes only what its rule allows and only what can be put back; named in "How was this done?" and in Settings, never on the top layer, never in Team | Governed agent |
| **Unable to complete** + why; **Unable to complete, rolled back** | It did not happen, and where it stopped | Replaces error, failed |
| **Past due** + date; **Doesn't match** + what's expected; **N new**; **Not recorded** | Later than promised; not as the standard says; not yet seen; unknown | Replace overdue, invalid, unread, unknown |
| Retired | Ticket (as identity), escalate, tier, breach, assign, blocked, pending, error, failed, overdue, warning, invalid, unread, critical, stage, needs you, needs a look, agent as a character | |

### 3.2 Standards and regulations the record supports

Keia is not "compliant" with anything; a tool cannot be. It keeps the records that let its users meet their duties.

| Standard or rule | What the record holds |
|---|---|
| ISO/IEC 20000-1 | Incident, request, problem, known error, change classes, service levels, supplier management, configuration: the kept nouns map one to one |
| ISO/IEC 27001, SOC 2, Cyber Essentials | Asset inventory, access reviews, patch status, changes, incidents, vendor reviews, exportable by date range with a published control mapping |
| ISO/IEC 42001 (shape, not certification) | A register of each AI use with purpose, model, owner and risk; evaluation records; the action log |
| EU AI Act, Article 50 | An assistant says it is AI; AI-drafted text sent to people is labelled or reviewed; no emotion or engagement scoring of staff; no scoring or allocation by individual behaviour |
| GDPR and works councils | A privacy record per sensing device: what it captures, purpose, lawful basis, identifies people or not, retention, DPIA, notice, works-council reference; occupancy counted, never identified; a plain page on what Keia logs about its users |
| NIS2 and the UK bill | Inventory of network and security devices with owner and firmware; a vendor access register; incident timers (24 h, 72 h, one month) with an exportable timeline |
| Cyber Resilience Act, PSTI | Security-support end date per model, firmware, vulnerability contact, default password changed, with warnings before support ends |
| Accessibility (WCAG 2.2 AA, EN 301 549, ADA) | The product itself; and per space: hearing loop and last test, captions, assistive listening, step-free access |
| CSRD, WEEE, ecodesign | Per device: power draw, schedule, purchase date, expected life, disposal route and certificate |

### 3.3 Underneath

The record follows a small canonical model (space, unit, model, service, person, organisation, work, event, agreement) that every page reads. Each connector maps one tool to that model in both directions, declares what it can read, write and subscribe to, keeps the raw payload beside the normalised one, and stamps every value with its source and time. Source of truth is set per object and per field. The Keia framework supplies the schemas, the Read, Write and Prohibited tiers, the write lifecycle (preview, execute, read back, report) and the learning loop.

### 3.4 Under consideration

Not yet part of the method. Each is written up and tried before it is added.

1. **Measure and improve.** Every correction, captured fix and lesson is classified and routed to the device type, playbook or rule it improves; a monthly note per service on what changed because of what was learnt.
2. **A friction budget.** One number per service, in the spirit of an error budget, that decides when to stop new work and fix.
3. **Keeping knowledge true.** Owner, review date and expiry on every knowledge item; "still true?" at review; a known error asks "still happening?".
4. **Welcome back.** A designed first screen after leave: what changed, what is yours, what was handled, with a lighter first day.

---

## How it fits

The Keia Method is a companion to the frameworks IT people already know, not a rival. ITIL tells you what service management is; the Keia Method shows how to run workplace technology that way, day to day.

It is far smaller than any of them: five ideas and one record, for the rooms, devices and networks in a building and the kit in a home office. Each page says what the framework is, which of its practices each Keia idea serves, what it covers that Keia does not, and where the words differ. The names of practices, processes and standards are the frameworks' own; every description is ours and short. For their definitions, read the frameworks themselves.

| Framework | What it is for | How Keia relates | Section |
|---|---|---|---|
| ITIL | Managing IT products and services, from strategy to support | Implements part of it: the everyday practices, for workplace technology | 4.1 |
| ISO/IEC 20000-1 | A service management system an organisation can be certified against | Companion: keeps records an audit can read; certification stays yours | 4.2 |
| PMI: the PMBOK Guide | Delivering projects, through principles and performance domains | Companion: project records on the same record as the building | 4.3 |
| PRINCE2 | Running a project in managed stages | Companion: phases, gates and lessons on the record | 4.4 |
| Agile, DevOps and SRE | Delivering change in small, safe steps and running services by measured reliability | Companion: standing rules and the learning loop borrow their habits | 4.5 |
| AVIXA standards | Designing, documenting and verifying audiovisual systems | Companion: the record holds the evidence; the standards say what good is | 4.6 |
| ISO 41001 and ISO 55001 | Managing facilities; managing assets over their life | Companion to ISO 55001: for technology assets; ISO 41001 is out of scope | 4.7 |
| ISO/IEC 27001 and NIS2 | Managing information security; the EU's cybersecurity law | Companion: keeps evidence for some controls and duties | 4.8 |
| COBIT | Governing and managing enterprise IT | Out of scope: Keia sits under your governance, not in place of it | 4.9 |

**Trademarks.** ITIL® and PRINCE2® are registered trademarks of the PeopleCert group. Project Management Institute, PMI® and PMBOK® are trademarks or registered trademarks of Project Management Institute, Inc. COBIT® is a registered trademark of ISACA. AVIXA® is a trademark or registered trademark of AVIXA, Inc. ISO is a registered trademark of the International Organization for Standardization, and ISO and IEC standards are protected by copyright. None of these bodies endorses Keia, and Keia uses none of their text.

### 4.1 ITIL

**What it is.** PeopleCert's framework of good practice for managing IT products and services.

**Which version.** ITIL (Version 5), released in 2026; PeopleCert plans to retire ITIL 4 on 31 December 2027. Version 5 keeps 34 practices, largely as in ITIL 4, and ITIL 4's guiding principles, and adds an eight-stage lifecycle (Discover, Design, Acquire, Build, Transition, Operate, Deliver, Support). Its simplified value chain was not yet public, so the value chain below is ITIL 4's. Keia is far smaller than ITIL: it covers the service management in and around a building's technology.

**How the ideas map.** Each Keia idea, the ITIL practices it serves, and what Keia adds.

| Keia idea | ITIL practices and value chain | What Keia adds |
|---|---|---|
| Start from the building | IT asset management; service configuration management. Value chain: design and transition, obtain/build | Every unit sits in a space on a floor plan, with its model, ports, cables and build sheet. The space type is the standard the space is built to, and the gap between the two is the work |
| Capture, don't ask | Incident management; service request management; monitoring and event management; service desk. Value chain: engage, deliver and support | An alert becomes an incident already filled in: space, unit, last change, likely known error and a proposed priority. The room guide behind the code on the table reports a fault in one tap. Closing asks one thing: "What fixed it?" |
| Answer first | Service level management; monitoring and event management. Value chain: deliver and support, improve | Every page opens with one sentence and up to four figures, each opening the list it counts. Services show within target or past target; experience measures are kept per space, never per person |
| Own it, hand it on | Incident management; problem management; supplier management; change enablement. Value chain: engage, deliver and support | One named owner per job until the person is back working. Hand to moves the whole record, with why, to a colleague, a team or a vendor. A standing rule is a standard change its service owner approved once, with caps, a read back, and Undo or Roll back where one exists |
| Learn as you go | Knowledge management; problem management; continual improvement. Value chain: improve | The setup guide opens beside the device, and an incident shows what fixed it the last two times. A captured fix becomes a proposal to the guide, approved by its owner. Guidance shortens as a person's own record shows they no longer need it |

**Guiding principles.** ITIL's seven guiding principles, and where Keia does each one.

| ITIL guiding principle | Where Keia does it |
|---|---|
| Focus on value | Experience measures per space: meetings started on time, spaces that worked first time, lost time per incident |
| Start where you are | No staged journey: switch on the module you need, starting with the device catalogue; existing tools connect and stay the record |
| Progress iteratively with feedback | A captured fix is proposed to the setup guide, tried, approved by its owner and kept |
| Collaborate and promote visibility | Vendors and integrators work in the same record as peers, scoped to the job; every figure names its source and time |
| Think and work holistically | One record joins the space, the device, the change, the owner and the vendor |
| Keep it simple and practical | One sentence, four figures, then the evidence; a person is asked only what only they know |
| Optimize and automate | Standing rules do routine work only where it can be put back, within caps, under a named owner; anything irreversible is a proposal a person confirms |

**Use your normal process here.** ITIL covers far more than Keia. For these, keep the process and the tool you have; Keia connects to them or leaves them alone.

- Strategy management, portfolio management and service financial management
- Relationship management with the business, and service design for new services
- Release management, deployment management, and software development and management
- Information security management as a whole (Keia keeps some of its evidence: see section 4.8)
- Workforce and talent management
- Laptops and phones, and the support for them: outside Keia's scope

**Words side by side.** Where Keia's words differ from ITIL's.

| Keia says | ITIL says |
|---|---|
| Hand to (a peer, with the whole record and why) | Escalate; assign |
| Standing rule (a routine change its owner approved once, with caps and a way back) | Standard change |
| Space, Unit (each a record with its relationships) | Configuration item (CI) |
| Relationship, Service map | Relationships held in the configuration management database (CMDB) |
| Within target, Past target | Service level agreement (SLA) met, breached |

**Official source.** [PeopleCert: ITIL Foundation (Version 5)](https://www.peoplecert.org/browse-certifications/it-governance-and-service-management/ITIL-1/itil-5-foundation-version-50-4154)

**Sources.** Checked 30 September 2026.

- [PeopleCert: ITIL frequently asked questions](https://www.peoplecert.org/help-and-support/faq-itil): Version 5, its 34 practices in two groups, the practice bundles, the ITIL 4 retirement date
- [PeopleCert: ITIL (Version 5) explained](https://www.peoplecert.org/news-and-announcements/itil-version-5-explained)
- [ITIL: ITIL Foundation (Version 5), what's new](https://www.itil.com/Itil-News-and-Announcements/itil-version-5-foundation-whats-new-guide): the eight lifecycle stages and the simplified value chain
- [ITSM.tools: the 34 ITIL 4 management practices](https://itsm.tools/34-itil-4-management-practices/): a secondary source, for practice names outside the Version 5 bundles
- [ITSM.tools: ITIL (Version 5) guiding principles](https://itsm.tools/itil-version-5-guiding-principles/): a secondary source, for the seven principles carried into Version 5

### 4.2 ISO/IEC 20000-1

**What it is.** The international standard for a service management system an organisation can be certified against.

**Which version.** ISO/IEC 20000-1:2018, with Amendment 1:2024 (climate action changes). No newer edition was published when this was checked. Keia is not certified and cannot make anyone compliant; it keeps records an auditor can read. The clause names below are the standard's own headings; what they require is in the standard.

**How the ideas map.** Each Keia idea, the clauses of the standard it serves (clause 8 is the operation of the service management system), and what Keia adds.

| Keia idea | ISO/IEC 20000-1 clauses | What Keia adds |
|---|---|---|
| Start from the building | 8.2.5 Asset management; 8.2.6 Configuration management | One record per space and unit, with its relationships and a confidence from each record's source and age; every change keeps who, what, when, before and after |
| Capture, don't ask | 8.6.1 Incident management; 8.6.2 Service request management | Incidents and requests arrive with the space, the unit and the last change filled in; the categories are the space and the device type the record already has |
| Answer first | 8.3.3 Service level management; clause 9, Performance evaluation | Every figure opens the list it counts and names its source and time, so a report is a list with its filters, exportable by date range |
| Own it, hand it on | 8.3.4 Supplier management; 8.5.1 Change management | Vendors work as peers with access scoped to the job; a standing rule is a change its owner approved once; the change history is the audit log |
| Learn as you go | 8.6.3 Problem management; clause 10, Improvement | Known errors matched to the fleet; captured fixes proposed into setup guides and approved by their owners |

**Use your normal process here.** The standard asks for a whole management system. Keia keeps records for part of it; the rest is yours.

- The service management system itself: its scope, policy, objectives, internal audit and management review
- 8.4 Supply and demand: budgeting and accounting for services, demand management, capacity management
- 8.7 Service assurance: availability, continuity and information security management
- 8.5.3 Release and deployment management, for software
- Certification: an accredited body certifies an organisation, never a tool

**Words side by side.** Where Keia's words differ from the standard's.

| Keia says | ISO/IEC 20000-1 says |
|---|---|
| Space, Unit (each a record with its relationships) | Configuration item (CI) |
| Vendor, Partner | External supplier |
| Service level, Within target | Service level agreement (SLA) and its targets |

**Official source.** [ISO: ISO/IEC 20000-1:2018](https://www.iso.org/standard/70636.html)

**Sources.** Checked 30 September 2026.

- [ISO: ISO/IEC 20000-1:2018/Amd 1:2024](https://www.iso.org/standard/88434.html)
- [IEC webstore: ISO/IEC 20000-1:2018/Amd 1:2024](https://webstore.iec.ch/en/publication/92576)
- [BCS: ISO/IEC 20000-1:2018, a talk by its project editor (PDF)](https://www.bcs.org/media/8614/promsg-springschool-lcooper-090322.pdf): the clause 8 headings

### 4.3 PMI: the PMBOK Guide

**What it is.** PMI's guide to delivering projects, built on principles and performance domains, not fixed steps.

**Which version.** Mapped to the Seventh Edition (2021): 12 principles and 8 performance domains. PMI published the Eighth Edition in November 2025; a short note on it follows the table.

**How the ideas map.** Each Keia idea, the performance domains and principles it serves, and what Keia adds.

| Keia idea | PMBOK Guide (7th edition) domains and principles | What Keia adds |
|---|---|---|
| Start from the building | Domains: Planning, Delivery. Principle: Systems thinking | A project names the spaces and units it changes, so its scope is a list of real rooms and devices. The as-built record becomes the operational record the day after handover |
| Capture, don't ask | Domains: Measurement, Project Work | Status is read from the work: a deploy batch verifies each unit against its build sheet instead of a person ticking a box, and each phase shows baseline against actual |
| Answer first | Domains: Measurement, Stakeholder. Principle: Value | A project opens with three lights (schedule, cost, scope), each with a one-line reason, then the next gate and what is stuck. Nobody collates a status report |
| Own it, hand it on | Domains: Team, Uncertainty. Principles: Stewardship, Leadership | Every task has one named owner. Risks, issues, decisions and dependencies sit in one log. Integrators and vendors work in the same record, with access that ends when the job closes |
| Learn as you go | Domain: Development Approach and Life Cycle. Principles: Tailoring, Adaptability and Resiliency | Each kind of project follows a playbook. Lessons at close become proposals to the playbook and the setup guides, so the next project starts from them |

**The Eighth Edition.** PMI published the Eighth Edition in November 2025. It keeps the idea of principles and performance domains but changes both: six principles, among them focus on value, embed quality and integrate sustainability, and seven domains (Governance, Scope, Schedule, Finance, Stakeholders, Resources, Risk). It also brings process guidance back. The Keia ideas map the same way: Start from the building to Scope; Capture, don't ask and Answer first to Schedule and Finance; Own it, hand it on to Governance, Resources and Risk.

**Use your normal process here.** PMBOK covers much that Keia leaves to you.

- The business case, benefits and the decision to fund a project
- Procurement and contract negotiation (Keia records the contract and its end date, not the deal)
- Earned value and detailed cost control
- Schedule modelling: critical path, resource levelling
- Stakeholder engagement and communications planning
- Building and leading the team

**Words side by side.** Where Keia's words differ from PMBOK's.

| Keia says | PMBOK Guide says |
|---|---|
| Playbook (the phases and steps for one kind of project) | Tailored development approach and life cycle |
| With Anna (who holds the task now) | Assignment; a responsibility assignment matrix sets it in advance |
| Deploy batch (units set up and verified together) | No single term; the work sits in the Project Work and Delivery domains |
| Lesson, proposed to the playbook | Lessons learned |

**Official source.** [PMI: The Standard for Project Management and the PMBOK Guide](https://www.pmi.org/standards/pmbok)

**Sources.** Checked 30 September 2026.

- [PMI: the 12 project management principles (PDF)](https://www.pmi.org/-/media/pmi/documents/public/pdf/pmbok-standards/12-project-management-principles.pdf)
- [PMI: the project performance domains (PDF)](https://www.pmi.org/-/media/pmi/documents/public/pdf/pmbok-standards/pmi-project-performance-domains.pdf)
- [PMI: PMBOK Guide questions and answers (PDF)](https://www.pmi.org/-/media/pmi/documents/public/pdf/pmbok-standards/pmbok-guide-external-faq.pdf)
- [ProjectManagement.com (PMI): PMI launches the PMBOK Guide, Eighth Edition](https://www.projectmanagement.com/articles/1134510/pmi-launches-the-pmbok--guide---eighth-edition)
- [PMI: Lexicon of project management terms (PDF)](https://www.pmi.org/-/media/pmi/documents/registered/pdf/pmbok-standards/pmi-lexicon-pm-terms.pdf): the trademark wording

### 4.4 PRINCE2

**What it is.** A method for running a project in managed stages, from PeopleCert.

**Which version.** PRINCE2 7 (2023), now called PRINCE2 Project Management (Version 7): seven principles, seven practices (called themes before version 7) and seven processes, with people at the centre.

**How the ideas map.** Each Keia idea, the PRINCE2 principles and practices it serves, and what Keia adds.

| Keia idea | PRINCE2 principles and practices | What Keia adds |
|---|---|---|
| Start from the building | Principle: focus on products. Practices: plans, quality | The products are real spaces and units, each with a build sheet; quality is checked against the space type and the setup guide, unit by unit |
| Capture, don't ask | Practice: progress | Progress is read from the work: units verified, phases against their baseline |
| Answer first | Principles: manage by stages, manage by exception | Each phase ends at a gate. A project opens with three lights and what is stuck, so the exception is the first thing anyone reads |
| Own it, hand it on | Principle: define roles, responsibilities and relationships. Practices: organizing, risk, issues | One named owner per task, risk and issue; vendors are peers in the record, scoped to the job |
| Learn as you go | Principle: learn from experience | Lessons at close become proposals to the playbook, so the next project starts with them |

**Use your normal process here.**

- Business justification and the business case
- Directing a project: the board's decisions and authorisations
- Setting tolerances, and exception reports to the board
- Starting up and initiating a project

**Words side by side.**

| Keia says | PRINCE2 says |
|---|---|
| Phase | Stage |
| Gate | Stage boundary |
| Hand to (a peer, with the record) | Escalate (to the level with authority, when a tolerance would be exceeded) |
| Playbook | Tailoring the method to the project |

**Official source.** [PeopleCert: PRINCE2 7 Foundation](https://www.peoplecert.org/browse-certifications/project-programme-and-portfolio-management/PRINCE2-2/PRINCE2-7-foundation-3579)

**Sources.** Checked 30 September 2026.

- [PeopleCert: the new PRINCE2 7](https://www.peoplecert.org/news-and-announcements/2023/new-prince2-7)
- [PeopleCert: PRINCE2 7 quick reference guide (PDF, hosted by a training provider)](https://www.nilc.co.uk/wp-content/uploads/2023/10/PRINCE2-Quick-Reference-Guide.pdf): the names of the principles, practices and processes
- [PeopleCert: acknowledgements](https://www.peoplecert.org/acknowledgements): the trademark wording

### 4.5 Agile, DevOps and SRE

**What they are.** Ways to deliver change in small steps with fast feedback, and to run services by measured reliability.

**Which version.** The Agile Manifesto (2001); the Scrum Guide (November 2020); DORA's five software delivery metrics (dora.dev, 2026); Google's Site Reliability Engineering book. Keia's standing rules, its change model and its learning loop sit alongside these; Keia does not deliver software.

**How the ideas map.** Each Keia idea, the practice it sits beside, and what Keia adds.

| Keia idea | Agile, DevOps and SRE practice | What Keia adds |
|---|---|---|
| Start from the building | SRE: service level objectives | Each service has an owner and a target; its map runs from the internet circuit to the device, lit by health |
| Capture, don't ask | SRE: eliminating toil; monitoring | Alerts arrive filled in, so nobody retypes them; a fix that keeps recurring becomes a standing rule instead of repeated manual work |
| Answer first | DORA: change fail rate, failed deployment recovery time | Pages open with within target or past target; alerts that led to an action are counted against alerts raised |
| Own it, hand it on | DORA: streamlining change approval | DORA found that heavyweight external approval did not lower change failures. A standing rule is approved once by its owner, runs within caps, is read back after every write, and halts on failures |
| Learn as you go | Scrum: the Sprint Retrospective. SRE: blameless postmortems | A lesson is captured where the work closes and proposed into the setup guide. Nothing scores or ranks a person |

**Use your normal process here.**

- Software delivery: builds, tests, pipelines and deployments of code
- Backlogs, sprint planning and a team's cadence
- Error budget policies for software releases
- On-call rotations and paging
- Measuring software delivery with DORA's metrics

**Words side by side.**

| Keia says | They say |
|---|---|
| Standing rule | Automated runbook; a pre-approved change |
| Unable to complete, rolled back | Failed deployment; rollback |
| Routine work a standing rule does | Toil, when a person does it by hand |
| Lesson; captured fix | Postmortem action item; retrospective improvement |
| Within target | Service level objective (SLO) met |

**Official source.** [Agile Manifesto](https://agilemanifesto.org/); [Scrum Guide](https://scrumguides.org/scrum-guide.html); [DORA](https://dora.dev/); [Google: SRE books](https://sre.google/books/)

**Sources.** Checked 30 September 2026.

- [DORA: software delivery performance metrics](https://dora.dev/guides/dora-metrics/)
- [DORA: streamlining change approval](https://dora.dev/capabilities/streamlining-change-approval/)
- [Scrum Guide revision history](https://scrumguides.org/revisions.html)
- [Google SRE book: Service level objectives](https://sre.google/sre-book/service-level-objectives/)
- [Google SRE book: Eliminating toil](https://sre.google/sre-book/eliminating-toil/)
- [Google SRE book: Postmortem culture](https://sre.google/sre-book/postmortem-culture/)

### 4.6 AVIXA standards

**What they are.** The AV industry association's standards for designing, documenting and verifying audiovisual systems.

**Which version.** AVIXA's published standards as listed on 30 September 2026. The performance verification standard is now ANSI/AVIXA D402.02:2013 (R2024), reaffirmed in 2024; it was formerly ANSI/INFOCOMM 10:2013. AVIXA publishes no project management standard; the nearest is its documentation standard.

**How the ideas map.** Each Keia idea, the AVIXA standard it serves, and what Keia adds.

| Keia idea | AVIXA standards | What Keia adds |
|---|---|---|
| Start from the building | ANSI/AVIXA V202.01:2026 Display Image Size for 2D Content (DISCAS); ANSI/AVIXA A102.01:2022 Audio Coverage Uniformity; AVIXA S601.01:2021 Energy Management for Audiovisual Systems | Each space type records the basis for its display size, and the house meeting room standard designs loudspeakers to AVIXA's coverage method, so every space built to them starts from the same rule. The house display standard switches displays on the room system and a timer |
| Capture, don't ask | AVIXA F501.01:2015 Cable Labeling for AV Systems | Each cable is a record with its label and both ends, under the house cable colour and labelling standard |
| Answer first | ANSI/AVIXA D402.02:2013 (R2024) AV Systems Performance Verification | Deploy ends with a short room test per space, and its result stays on the space's record. It is a check, not a verification to the standard; where you verify to D402.02, the record holds the report |
| Own it, hand it on | ANSI/AVIXA D401.01:2023 Documentation Requirements for Audiovisual Systems | The integrator hands over by leaving the as-built record, and the team runs from that record the next day |
| Learn as you go | AVIXA's credentials: CTS, CTS-D, CTS-I | Keia certifies nobody. The setup guide beside the device and the room guide help a technician learn on the job, alongside a credential |

**Use your normal process here.**

- AV system design and its review: drawings, calculations, the design process
- Performance verification itself: its tests, methods and pass criteria (Keia records the result)
- Rack design and rack building
- Lighting, contrast and acoustic measurement
- Professional credentials and training

**Words side by side.**

| Keia says | AVIXA says |
|---|---|
| Room test | Performance verification (a far fuller set of checks, to the standard) |
| As-built record | As-built documentation |
| Space type | No single term; the design basis for a kind of room |

**Official source.** [AVIXA: published standards](https://www.avixa.org/resources/standards/published-standards)

**Sources.** Checked 30 September 2026.

- [AVIXA: certification](https://www.avixa.org/training-certification/certification)
- [AVIXA: about us](https://www.avixa.org/about-us): the association's name and the trademark wording

### 4.7 ISO 41001 and ISO 55001

**What they are.** Requirements for a facility management system (ISO 41001) and an asset management system (ISO 55001).

**Which version.** ISO 41001:2018, with Amendment 1:2024 (climate action changes); ISO lists a revision under way. ISO 55001:2024, with its vocabulary in ISO 55000:2024. Both are management system standards: they ask for a whole system, of which a record is one part.

**How the ideas map.** Brief: these touch Keia at the edges.

| Keia idea | ISO 41001 and ISO 55001 | What Keia adds |
|---|---|---|
| Start from the building | ISO 55001: knowing what assets you hold and where. ISO 41001: the facility the technology lives in | Every unit sits in a space on a floor plan. Space data is exchanged with facilities systems, never owned by Keia |
| Capture, don't ask | ISO 55001: asset information kept current | Purchase date, expected life, power draw and disposal route per device, updated by the work |
| Answer first | ISO 55001: performance of assets over their life | The work plan shows the devices due for refresh under the policy, and whether each is in a project |
| Own it, hand it on | ISO 41001: the facility services around the technology | Vendors and partners work as peers, with contracts, end dates and access scoped to the job |

**Use your normal process here.**

- Leases, space planning, moves and soft services such as cleaning and catering: ISO 41001's ground, and another profession's record
- Heating, ventilation and building control
- Asset management policy and strategy, and the financial value of assets
- Laptops and phones: outside Keia's scope

**Words side by side.**

| Keia says | They say |
|---|---|
| Unit (one physical thing) | Asset |
| Keia Atlas (the record) | One part of an asset management system, never the whole of one |

**Official source.** [ISO: ISO 41001:2018](https://www.iso.org/standard/68021.html); [ISO: ISO 55001:2024](https://www.iso.org/standard/83054.html)

**Sources.** Checked 30 September 2026.

- [ISO: ISO 41001:2018/Amd 1:2024](https://www.iso.org/standard/88425.html)
- [ISO: ISO 55000:2024](https://www.iso.org/standard/83053.html)

### 4.8 ISO/IEC 27001 and NIS2

**What they are.** An information security management system standard, and the EU directive on cybersecurity duties.

**Which version.** ISO/IEC 27001:2022, with Amendment 1:2024; its Annex A lists 93 controls in four themes (organizational, people, physical, technological). NIS2 is Directive (EU) 2022/2555, applied by member states from 18 October 2024. Keia makes no one compliant; these are the touchpoints where its record is evidence.

**How the ideas map.** Brief: the touchpoints.

| Keia idea | ISO/IEC 27001 controls and NIS2 articles | What Keia adds |
|---|---|---|
| Start from the building | 27001 A.5.9 Inventory of information and other associated assets. NIS2 Article 21(2)(i), asset management | Every networked unit with its place, model, firmware and owner |
| Capture, don't ask | 27001 A.8.8 Management of technical vulnerabilities. NIS2 Article 21(2)(e), vulnerability handling | Each networked model carries its security support end date, with warnings at 12, 6 and 3 months before it ends; each unit records whether its default password was changed |
| Answer first | NIS2 Article 23: an early warning within 24 hours, a notification within 72 hours, a final report within one month | Incident timers for 24 h, 72 h and one month on the record, with a timeline that can be exported |
| Own it, hand it on | 27001 A.5.19 Information security in supplier relationships; A.8.32 Change management. NIS2 Article 21(2)(d), supply chain security | The vendor access register: every grant tied to one job, from when to when, with no standing access. Standing rules have a named owner, and the audit log is never edited in place |
| Learn as you go | 27001 A.5.24 Information security incident management planning and preparation. NIS2 Article 21(2)(b), incident handling | The incident's story stays on the record: what was tried, what fixed it, and who held it when |

**Use your normal process here.**

- The information security management system: scope, risk assessment and treatment, the Statement of Applicability, internal audit, management review
- Identity and access management
- Security monitoring and the security operations centre
- Registration with, and reporting to, the national authority (Keia keeps the timeline; you report)
- Laptops, phones and their security: outside Keia's scope

**Words side by side.**

| Keia says | They say |
|---|---|
| Unit | Information and other associated assets (27001) |
| Vendor, Partner | Supplier; the supply chain (NIS2) |
| Major incident | Significant incident, when NIS2 requires it to be reported |
| Security support end date | The end of the manufacturer's vulnerability fixes; part of vulnerability handling |

**Official source.** [ISO: ISO/IEC 27001:2022](https://www.iso.org/standard/27001); [EUR-Lex: Directive (EU) 2022/2555 (NIS2)](https://eur-lex.europa.eu/eli/dir/2022/2555/oj)

**Sources.** Checked 30 September 2026.

- [ISO: ISO/IEC 27001:2022/Amd 1:2024](https://www.iso.org/standard/88435.html)
- [IEC webstore: ISO/IEC 27001:2022](https://webstore.iec.ch/en/publication/79694)

### 4.9 COBIT

**What it is.** ISACA's framework for the governance and management of enterprise information and technology.

**How it fits.** COBIT 2019 is the current version; ISACA has announced COBIT 7, whose certificate starts on 27 October 2026, and its structure was not public when this was checked. COBIT sets how an organisation directs and oversees its technology, through 40 governance and management objectives in five domains: Evaluate, Direct and Monitor; Align, Plan and Organize; Build, Acquire and Implement; Deliver, Service and Support; Monitor, Evaluate and Assess. Keia sits under that governance, not in place of it. Its named owners, audit log, standing rules approved by a service owner and vendor access tied to a job are evidence a governance review can read. Everything else in COBIT stays with your normal process.

**Official source.** [ISACA: COBIT](https://www.isaca.org/resources/cobit)

**Sources.** Checked 30 September 2026.

- [ISACA: COBIT Foundation certificate](https://www.isaca.org/credentialing/cobit-foundation): COBIT 7's certificate date
- [ISACA: COBIT usage guidelines](https://www.isaca.org/about-us/cobit-usage-guidelines)

---

Copyright Red Hat, Inc. Created by Keith Brady. The Keia Method text is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Keia Atlas, the software that runs it, is Apache 2.0.
