# 0018. Grouped navigation, demo controls in Settings, and projects

- Status: Accepted
- Date: 2026-09-28

## Context

The owner asked for the sidebar to follow the location and device structure: region, site, space; device profile, configuration, device and device unit. He asked for About this project and the decision records to move to the account corner with Settings. He wanted to drive the whole demo from Settings: who you're signed in as, which stage is on, and whether agents are shown. He also wanted projects started. On the device profile, the drawing took too much room and "what healthy looks like" needed to be more visual.

He also asked whether Keia Atlas should connect to a real NetBox. For now it doesn't: stages 2 to 6 run on simulated data that is shaped like the real systems' records and labelled on the page.

## Decision

- The sidebar is grouped. Work: Projects. Locations: Regions, Sites, Spaces, Space types. Devices: Devices, Device profiles, Configurations, Device units, Device models. Planning: Refresh plan. Device models move from `/devices/` to `/models/`, so `/devices/` can list the devices themselves (positions). About this project, Decision records and Settings sit in a menu on the account corner. On phones the bottom bar keeps Home, Projects, Sites, Devices and Device profiles.
- The interface still says Spaces, not rooms, as the first design asked.
- Settings holds the demo controls: signed in as (seven made-up people, one per role in the spec), stages switched on (1 to 6) and agents shown or hidden. A chip in the masthead shows the current person and stage, and opens Settings. Pages are gated by stage at page level only; below a page's stage it says what that stage adds and offers to switch it on.
- Projects (stage 3) are YAML files checked by a schema and cross-referenced to real sites, spaces and demo people. A done task must have a captured fix or a "nothing new" reason. A project page shows a phase rail, a task board, space progress and, at stage 6 with agents on, simulated agents that only propose tasks for a person to accept.
- The device profile header carries a small product card with the model pills; below it come ports, then six health cards. Each card draws its evidence for one example device: a pin in its space, an asset tag, the DNS round trip, a firmware check, a booking resource, a heartbeat. Address, MAC and firmware are demo values and the page says so.
- Page changes read as movement through the sidebar: going down, the next page rises from below; going up or Back, it comes from above.
- A written standard for adding devices (`docs/standards/new-device.md`), so every drawing, port and data file follows the same rules.

## Consequences

- Configurations has its page and six-layer explainer, but no values yet; the Poly video bars and TC10 come next.
- Demo people live in `src/lib/demo.mjs` rather than data files, since they are part of the demo layer, not the knowledge base.
- Links to `/devices/<model>/` from outside the site stop working; the model pages are at `/models/<model>/`.

Sources: [MDN: the details element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details), [WAI-ARIA Authoring Practices: menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/).
