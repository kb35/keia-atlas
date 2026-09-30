# 0025. The Integrate phase, home offices, one shape for work, and live changes

- Status: Accepted
- Date: 2026-09-29
- Supersedes: the projects' Install and Commission phases (introduced with projects in [0018](0018-navigation-demo-controls-projects.md)); the single remote site and its kit groups in [0010](0010-sites-and-spaces.md); kit positions such as `kit-07/network-gateway` in [0024](0024-incidents-lifecycle.md)
- From: review feedback on the Install and Commission phases, home offices and shared work

## Context

Installing a device and getting it working were two phases, Install and Commission, with provisioning and configuring filed under one or the other. The owner wanted them together. Remote workers were two anonymous groups of kits at one site called Willow,so nobody could say where a person works or which home office a ticket is about. The schedule, the master view and the home page each worked out "what work is there" in their own way. And changes to work lived in one browser only,with no history of who did what.

## Decision

**Phases.** Plan, Design, Procure, **Integrate**, Hand over, Closed. Integrate holds four steps for each device: **Provision** (the system records: asset, address and DNS, device management, booking, monitoring, licence, firmware check), **Install**, **Configure** (the setup order, then Set and Verify) and **Commission** (verification, test call, healthy checks). A playbook may skip phases but keeps the rest in order; a project's phase rail shows only its playbook's phases. Tasks gain a `configure` kind; `provision` now means the system records only. A one-off migration (`tools/migrations/2026-09-29-integrate-phase.mjs`) merged each project's install and commission history into one integrate entry, with the old entries kept whole under `steps`, and merged the playbooks' two phases, tagging each step with its device step. Links to `#install` or `#commission`, and `?phase=install`, still land on Integrate.

**Task dates.** A task may have a `start` and a `where` (onsite or remote). Left out, the start is worked back from the due date at six hours a working day, and survey, install, configure, commission and records work is on site.

**Home offices.** The remote site becomes three: Remote EMEA (`rem`), Remote Americas (`ram`) and Remote APAC (`rap`), so region filters and regional managers see their home offices. Each home office is a room of its own, built to one option of the remote-home room profile, with its own install (monitor and gateway, plus a dock on the Mac option) and its `town`, `country` and `near` (the nearest office, in the same region). 104 home offices sit in real towns near the offices, named only for the country, plug and time zone, and labelled by town and number ("Bray home office 1"), never by a person. A second one-off migration (`tools/migrations/2026-09-29-home-offices.mjs`) moved the 55 old kits into the first home offices, keeping their asset tags and install dates, and numbered the rest on from AG-001451. Old `/rooms/rem-kit-01/` and `/rooms/rem-kit-02/` links land on the list of home offices.

**People's bases.** Every person has a `base` (an office, or their home office), the `office` they go to and their `office_days`. Nine of the demo team work from home offices. The validator checks each base, office and day.

**One shape for work.** `src/lib/work.mjs` turns project tasks, incidents, Lab tests, year-plan events, the service managers' inbox, time off, site visits and units due in the work plan into `{id, kind, title, who, site, room, start, end, hours, status, href, project, where}`, with views by person, day, site and kind, and where each person is on a day. `who` is always a list. The rules are in `workcore.mjs`, which loads no data and is unit tested.

**Live changes.** `src/lib/live.mjs` records each change to work as an event `{id, at, who, item, field, before, after}`. A page shows the data it was built with with the events replayed on top, which gives a history on every item, versions to step back through, and Undo as a new event (nothing is deleted). Events are kept under `rs5-live` and travel between windows over BroadcastChannel, with presence by heartbeat. The store and the transport are two small interfaces (`load`/`append`, `send`/`listen`), so a sync server can replace them without touching pages. `LiveBar` shows who else is on a page, says "Live between windows on this computer (demo)", and holds the History drawer. Project task ticks and assignments use it first. Each window keeps its own person, so two windows can be two roles side by side.

## Consequences

- 1,414 units become 1,525 (111 new home office units); 203 rooms become 305; 11 sites become 13.
- 21 new Integrate tasks, so 31 open Integrate tasks fall due in the fortnight from the demo's today, across PRJ-11 to PRJ-14 and PRJ-20, a new project setting up four new starters' home offices.
- The year plan page (`/planning/`) still takes the first six phases for its gantt, which now includes Closed; it should use `OPEN_PHASES`.
- A shared session across computers needs a sync server; until then the label says so (known gap 11). View as is still shared by every window (known gap 12).
- Endpoints (laptops, phones) stay out of scope: a home office tracks only the monitor, dock and gateway.
