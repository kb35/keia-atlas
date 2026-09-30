# 0024. Incidents get a page each, a subject and a lifecycle

- Status: Accepted
- Date: 2026-09-29
- Builds on: [0020](0020-team-playbooks-plan-lab-incidents-vendors.md) (tickets stay in ServiceNow; Keia Atlas reads at stage 2 and writes work notes at stage 4)

## Context

Review found the incidents page really poor. It was one long list of five cards. A ticket could not be linked to, it did not say which unit it was about, and it had a state but no story: nobody could see when it was picked up, why it was waiting, how it was resolved or that it had come back. The room, its wiring and its other devices, which are what a technician needs to fix the fault, were a click away on another page.

## Decision

- **What a ticket is about is a `subject`.** Either a whole room (`kind: room`), or one device in it (`kind: device`) named by its position in the room's install and its asset tag. Home office kits work the same way: the room is the kit group and the position carries the kit (`kit-07/network-gateway`). Laptops, phones and other endpoints are out of scope.
- **Each ticket keeps a `history`** that mirrors ServiceNow's activity log: time, the state it moved to (if it moved), who did it (a person in the team, or a named outsider such as the caller), where it was written (ServiceNow or Keia Atlas), and a note. An On hold entry says why (waiting for the caller, the vendor, a change or parts). A Resolved entry gives a resolution code (fixed, workaround, no fault found, duplicate, cancelled) and notes. The top-level `state` stays, because pages and ServiceNow both use it.
- **The validator checks the lifecycle** (`tools/crossrefs-incidents.mjs`): the first entry opens the ticket as New at the time it was opened; entries are in time order and not in the future; nothing goes back to New; a state entry changes the state and says who; On hold has a reason and Resolved has a resolution, and nothing else does; a resolved ticket can only be reopened to In progress, with a note saying why; the state is the last state in the history. It also checks the subject is real: the room exists, the position is in that room's install, the asset tag is a unit at that position, and any symptom named is in the device profile's guide.
- **A page per incident** at `/incidents/<number in lower case>/`. The first screen has the heading band (number, priority, title, the device, room and site, and a dashed "Simulated: ServiceNow" tag), the lifecycle as steps (On hold as a pause with its reason and how long, a reopen marked), and the room drawing with the device lit beside a card about it: its drawing, the evidence, a health check per system, firmware against the standard, the next steps from the guide, and how Keia Atlas matched it. Tabs below hold the wiring with the device's signal path lit, every device in the room, the history (this ticket, the unit's install, other incidents in the room and project tasks), related work and the ticket's fields.
- **Room drawings and wiring take a `highlight`**. It uses the same classes hovering does, and the page returns to it when the pointer leaves. An open ticket lights its device red.
- **The list is a board** by state (New, In progress, On hold, Resolved), open first and by priority inside each column, with a search box and hover filters for state, priority and site. Every card opens the ticket's page.
- **Approving a work note** (stage 4) takes effect at once and offers Undo (rule P7). In the demo nothing is sent.
- Room pages list their incidents, open and past. Search results and the home page link to each incident's page.

## Consequences

- Fifteen made-up incidents across all eleven sites cover every state, every hold reason but one, all five resolution codes, a reopen, a duplicate, a vendor RMA, a whole room and a home office kit.
- A real connection maps ServiceNow's `sys_journal_field` (work notes and comments) and state changes onto `history`, and its hold reason and resolution fields onto ours. Asset tag matching needs the CMDB's configuration item on the ticket; where it is missing, Keia Atlas matches by room and says so in "Matched by".
- Pages that only need the room or position still read `room` and `position`, which the data loader copies from the subject.
- The device page (built separately) links to these pages by the same route.
