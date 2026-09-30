# 0020. Team, playbooks, the year plan, the Lab, incidents and a vendor view

- Status: Accepted
- Date: 2026-09-28
- Builds on: [0018](0018-navigation-demo-controls-projects.md), [0019](0019-rooms-roles-cumulative-stages.md)

## Context

On review the owner asked for the delivery side of the work to be visible, not just the device side: playbooks for each kind of project (with a new office far heavier than a refresh), clear responsibilities and hours per person, a year plan the service managers and programme manager own but everyone can see, the Lab for new devices and firmware, a link to the ServiceNow incidents the team already works, and a way for vendors to record serial numbers and MAC addresses themselves. He also asked for the model to be a more obvious choice on a device profile, and for the health visuals to picture each field rather than each platform.

## Decision

- **Roles are data** (`src/lib/demo.mjs`): each role says what it owns, what it decides and what it hands on. People hold one role. On a project, people take a *project role* (project manager, lead engineer, network engineer, service owner, vendor installer and so on) with allocated and logged hours. A project manager role is added; the programme manager now runs the portfolio, not single projects.
- **Team page** (stage 3): who owns what, a person-by-project grid of roles and hours, and a RACI chart.
- **Playbooks** (`data/playbooks/`, stage 3): one per project kind, each with phases, steps (each done by a role), long-lead flags, and a gate signed off by named roles. Projects name their playbook, and a playbook records which project taught it each change.
- **Projects** gain a phase history (planned against actual end, what was handed on, who signed the gate), dates and hours on tasks, and the current phase's playbook steps.
- **Year plan** (`data/plan/`, stage 3): a twelve-month timeline built from projects and Lab tests, plus a pipeline, planning reviews and change freezes. Owned by the programme manager and both service managers.
- **The Lab** (`data/lab/`, stage 3): tests with checks, owner, outcome and who decided. Nothing enters the standard without passing.
- **Incidents** (`data/incidents/`, stage 2 to read, stage 4 to write back): tickets stay in ServiceNow. Keia Atlas matches each to a room and device and adds evidence, linked work and next steps. The real connection would read ServiceNow's Table API or receive a push from a business rule; the demo has no connection.
- **Vendor sign-in** (demo): signing in as a vendor narrows the console to their installation and the device reference pages. They record serials and MACs, which wait for the delivery engineer's review.
- **Model picker**: the models are a row of tiles under the page heading, with a note that the rest of the page follows the model.
- **Field visuals**: each required field gets its own picture (a label for the serial, the parts of a hostname, the two halves of a MAC address, the lifecycle rail and so on).

## Consequences

- Stage 3 now carries most of the delivery story; stage 2 carries incidents.
- The vendor view is a demo of access rules in the browser, not security. A real one needs server-side sign-in and per-vendor data access.
