# 0022. Seven places, one Report button, and pages that use their first screen

- Status: Accepted
- Date: 2026-09-28
- Builds on: [0021](0021-device-pages-comms-rooms-editing-learn.md)
- Review: a UX review from screenshots of every page, and the owner's feedback

## Context

The sidebar had 18 items in 7 groups; Changes was its own section; the top bar carried a "name · Stages 1 to 6" pill nobody understood. Pages spent 170 to 340 px on a title band and left the right half of wide screens empty. Rooms and Devices were long flat lists. The owner asked for fewer, better-organised places; changes, new firmware and urgent issues raised from where the work happens; role-aware homes; capacity and budget; task pages; real MDF racks; a clearer Learn; and more motion that stays simple.

## Decision

- **Seven places:** Home, Work, Rooms, Devices, Plan, Team, Learn. Pages inside a place are tabs at the top of the page, not sidebar entries. Each role sees its own places first under the divider "Everything else"; nothing is hidden. Vendors see Your installation, Devices and Learn.
- **Report** on every page replaces Changes as a section: Suggest a change, New firmware found, or Urgent issue, preloaded with what the page is about, sent to the service manager who owns it. Urgent ones top the service manager's home. The change history stays at `/changes/`, linked from the inbox.
- **Home is per role:** the service managers' inbox, an engineer's tasks, projects for managers, team load for the delivery manager, incidents for the desk.
- **First screen rules:** a shorter band with the page's key numbers on its right; the main picture and its key side by side (room drawing and Key, rack and details); everything else in tabs or disclosures below.
- **Sites became a filter on Rooms** (region, site, kind, room type, status: hover to open, apply as you pick). The site list and site pages are retired.
- **Task pages**, **Capacity** and **Budget** added; more projects so every phase has one.
- **Configurations** mark every setting Set or Verify and show a web interface map for the firmware they were checked on.
- **Racks** are drawn to scale from real products (`data/rack-gear`), with a magnifier and U positions.

## Consequences

- The preview host allows 511 files per version; with 468 pages the preview leaves out non-Latin font files and has no per-site pages. Task pages are the next candidate for one template filled from data, as device pages are.
- Everything a manager can see, anyone can see; role only changes what comes first.
