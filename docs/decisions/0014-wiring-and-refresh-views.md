# 0014. Wiring diagrams and a refresh plan from the data

- Status: Accepted
- Date: 2026-09-27

## Context

Each space type option already has a checked wiring template, and each installed unit has an install date. Two questions follow naturally: what does the cabling in this room actually look like, and what needs replacing when?

Drawing wiring by hand for 176 spaces would go stale. Refresh plans usually live in a spreadsheet that nobody links back to the rooms.

## Decision

- Wiring diagrams are drawn from the option's template when the page is built. A cable is shown when the validator's rules say it applies: its optional kit is fitted, or its "unless" kit is not. Devices are laid out by where they sit (table outlets, at the table, at the wall, wall outlets), each port is a row, and cables are coloured by what they carry. The same cables are listed in a table for screen readers.
- Space pages show the wiring for the kit fitted in that space. Space type pages show every option with all optional kit fitted.
- A refresh policy file sets years in service for each device class. These are a house policy for the made-up company and are labelled that way, not presented as vendor figures.
- Engineering hours use the example per-device estimates from Keia's Operations Framework (provision, configure, install, commission, decommission). Provision and configure only count for devices with a network address.
- Due year is install year plus years in service. Anything already past it is shown as due now. Devices still being installed count from this year.
- There are no prices. Budgeting is a separate task in Keia's Plan stage, and inventing prices would undermine the rest of the data.
- The validator checks the policy too: every class that spaces use must have a policy, and no estimate's low figure may be above its high.

## Consequences

- Change a wiring template or an install date and the diagrams and plan update on the next build.
- The overview can say how many devices are due now without anyone maintaining a separate list.
- The hours are estimates to plan with, not measurements. Keia describes how measured durations can replace them later.

Sources: [Keia: Operations Framework, capacity planning](https://github.com/kb35/keia/blob/main/site/concepts/operations-framework.md).
