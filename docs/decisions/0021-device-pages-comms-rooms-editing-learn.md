# 0021. Device pages, comms rooms, editing, vendors, and a leaner sidebar

- Status: Accepted
- Date: 2026-09-28
- Builds on: [0020](0020-team-playbooks-plan-lab-incidents-vendors.md)

## Context

The owner asked for: room visuals (including MDF and IDF comms rooms with racks and the path to the internet); a page per device, as NetBox has; a leaner sidebar (Sites with regions as a filter, not two pages); a clearer device profile with the model choice obvious, compact and uniform health checks that tick as they verify, firmware and advisories on the page, and why each model is in the standard; a bigger team with engineers per region, technicians at most sites, integration and service vendors under contract; ways for engineers and managers to create and edit profiles, models, playbooks (from templates) and projects; an interactive RACI; and lessons for training.

## Decision

- **Device page.** One template (`/device/?tag=AG-…`) filled from `device/data.json`, built from the data at build time. Every unit has a page without a file per unit (the published preview holds at most 511 files; the fleet has over 1,300 units). With no tag it is a search across every unit.
- **Comms rooms.** `mdf` and `idf` room types (house standard, category `infrastructure`), comms rooms recorded at the Dublin office, Juneau office and the new sites, and rack layouts in `data/racks/`. Rooms show a wall elevation drawn from the device art; comms rooms show their rack; rooms show their path to the internet through the recorded IDF and MDF.
- **Firmware, advisories, model choices and configurations** are data (`data/firmware/`, `data/advisories/`, `data/model-choices/`, `data/configurations/`), every vendor fact cited in `data/sources/software.yaml`. Real finding recorded: Poly VideoOS 5 supports only Teams Rooms and Poly Device Mode, so it is blocked for Aigna's Google Meet rooms (ADV-001).
- **Device profile hierarchy.** The kind of device, then the model picker, then the chosen model (status, platforms, per-model numbers, drawing), then advisories, then tabs: Overview, Configuration, Firmware, Troubleshoot. Health is a compact checklist per platform; field anatomy moved to Learn.
- **Sidebar.** Regions folded into Sites (a region switcher); Device units folded into Devices (a "By model" view). Both pages are retired. New groups: People (Team, Vendors) and Help (Learn); Changes under Work.
- **Editing.** `/edit/` builds the file a change would write for six kinds of change (project from a playbook, playbook from a template, device profile, device model, configuration setting, firmware release), checks it, and names the approver. `/changes/` lists proposals and their review. In the demo, proposals stay in the browser; in the real system each is a pull request.
- **Vendors.** `data/vendors/` holds integration, service and manufacturer contracts. The vendor portal gives integration vendors a pack per phase (site, designs, models and configurations, their playbook steps) and the service vendor its covered devices, service levels, advisories and open tickets.
- **Sites.** London, Singapore and Toronto added, generated from room types so every install matches its option.

## Consequences

- The device page renders in the browser, so it needs JavaScript; everything else stays static.
- Proposals made in the demo are lost when browser storage is cleared. That is the honest limit of a static demo.
