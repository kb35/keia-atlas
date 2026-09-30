# Words

### W1. Plain English, thing first

Short sentences, the thing people need first. Buttons say what happens; links name where they go. Irish English spelling (colour, organise), sentence case, numbers as digits.

- **Why:** people are busy, and many are new to this kind of tool.
- **Do:** "Report an urgent issue".
- **Don't:** "Utilise the escalation functionality".

### W2. Glossary words, used exactly

Space, space type, device type, model, setup guide, manufacturer, known error, device, unit, lifecycle, build option, playbook, task, proposal and report mean what `src/pages/learn/_glossary.mjs` says, everywhere.

- **Why:** one word for one thing is how people learn a system.
- **Do:** add a new term to the glossary before using it.
- **Don't:** call a space type a "room profile", "room type" or "template", or a device type a "device profile".

### W3. No internal names

Public vendor and product names are fine. A real company's internal systems, hostnames, people, job titles and ticket text never appear. Name systems by what they do (the asset register) or with a made-up name.

- **Why:** Keia Atlas is open source; every copy must be safe to publish.
- **Do:** map real names in the work version's configuration.
- **Don't:** paste a real hostname or ticket as an example.

### W4. No em dashes

Use a comma, colon, brackets or a full stop.

- **Why:** house style, and shorter sentences.
- **Do:** search for the character before committing.
- **Don't:** use two hyphens instead.

### W5. Find boxes and facets say the same thing everywhere

The find box says "Find a" and the thing, then two examples: "Find a space, number or office", "Find a unit, hostname or serial". Facets come in one order, **Region, Office, Kind, Status**, then the page's own (Space type, Priority, Colour). An office is always "Office" (never "Site"), a state always "Status".

- **Why:** a bar that reads the same on every page is used without reading it.
- **Do:** name the facet by what it filters, in the shared order.
- **Don't:** "Site" for an office, "State" for a status, "Use" or "In use" for a kind, or a find box that lists five made-up examples.

### W6. The right end of the filter bar: view, Sort, count

At the right of the bar, in this order: the view switch as word pills, "Cards | List" (or "Day | Week | Month | Year"); then the Sort pill, "Sort: By office", which opens like a facet; then the count, "N of M spaces", always shown, the noun in the plural. Sort choices start with "By" ("By name", "By space type") or end with "first" ("Being installed first", "Incidents first").

- **Why:** the count answers "how many?" in one place, and a sort that works like the filters is learnt once.
- **Do:** pass `views` and `sort` to `FilterBar`.
- **Don't:** icon-only view buttons, a `<select>` for sort, or the count again in the band ("Spaces shown").

### W7. Buttons: one primary, verb then thing

Each band has at most one primary button, at its top right, named verb then thing: "New project", "New playbook", "New model", "Propose an edit".

- **Why:** one obvious next step per page, worded the same way on every page.
- **Do:** "New" for making a thing, "Propose" for changing a standard (P8).
- **Don't:** "Make a change", "Add a device model", "New project from a playbook", or a second primary button under the lede.

### W8. Status words and the simulated tag

One set of words per kind of thing. Units: Ordered, Procured, Spare (arrived and kept in an office's IT store), Being installed, In service, Retired ("Live" is kept for live data: "Simulated live", "Live between windows"). Spaces: Planned, Being installed, Being replaced, In service. Tasks: To do, Doing, Waiting on, Done. Incidents: New, In progress, On hold, Resolved. Project phases say Plan, Design, Procure, Deploy (provision, install, configure and commission together), Hand over, Closed. Data that is not live says one of two things, in the band's overline row only (`SimTag`): "Simulated" (made-up figures or people) or "Simulated live" (made-up figures that change as you watch). A page never says which stage it belongs to.

- **Why:** the same state in two words reads as two states, and trust depends on knowing what is real (P5).
- **Do:** take lifecycle words from `STAGE_LABEL`; pass `sim` to `PageBand`.
- **Don't:** "Integrate", "Install" and "Commission" as phases, "Live" or "Decommissioned" for a unit, "Not yet in service", or "Demo figures", "Demo people", "Placeholder".

### W9. The overline names the kind of thing

The small line above a page title says what kind of thing the page is about: "Space", "Unit", "Project PRJ-09", "Catalogue", "Directory". Status and the simulated tag follow it on the same row.

- **Why:** people glance at the overline to know where they are.
- **Do:** a noun for the kind, then the facts that place it ("NYC · New York office · Level 20").
- **Don't:** an audience ("For service managers") or a count ("20 device types").

### W10. Offices by city, manufacturers by name

An office is called by its city: "the Dublin office", "the New York office". Remote groups keep their own names ("Remote EMEA"). The made-up building name stays in the `building` field of the site file and is never shown. Who makes a model is its **manufacturer**, on screen and in the data. "Vendor" is a company that installs or looks after devices.

- **Why:** a made-up name per building was one more thing to learn, and easy to confuse with the real ones.
- **Do:** "at the Dublin office", "Dublin office video bar refresh", "Juneau 2.03 Wren" for a room calendar (the city, not "office").
- **Don't:** an invented building name, "maker" for a manufacturer, or "Site" for an office in a label.
