# The Keia Method

A way of running IT from one living record of every room, device and job: kept by the work itself, readable in a minute, as deep as you need.

Read Level 1 in minutes. Read Level 2 in an afternoon. Level 3 is for looking things up. There is no exam; people get good by using it.

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

1. **Measure and improve.** Every correction, captured fix and lesson is classified and routed to the profile, playbook or rule it improves; a monthly note per service on what changed because of what was learnt.
2. **A friction budget.** One number per service, in the spirit of an error budget, that decides when to stop new work and fix.
3. **Keeping knowledge true.** Owner, review date and expiry on every knowledge item; "still true?" at review; a known error asks "still happening?".
4. **Welcome back.** A designed first screen after leave: what changed, what is yours, what was handled, with a lighter first day.

---

Copyright Red Hat, Inc. Created by Keith Brady. The Keia Method text is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Keia Atlas, the software that runs it, is Apache 2.0.
