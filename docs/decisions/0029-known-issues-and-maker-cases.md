# 0029. Known issues from makers, matched to the fleet, and maker cases

- Status: Accepted
- Date: 2026-09-30

## Context

The request: makers such as HP Poly (in Poly Lens and their release notes) publish known issues with their firmware. When Keia Atlas fetches firmware information it should fetch those too. A published known issue can then be allocated when something similar happens in the fleet; and when something recurs across our fleet, the service manager should be able to tell the maker easily. It should be a good experience for the service manager who raises it.

The firmware line (`data/firmware/poly-videoos.yaml`) already listed each release's known issues as short strings, from the cited release posts, but nothing tied them to units or incidents.

## Decision

**Known issues are data, one file per maker feed** (`data/known-issues/<feed>.yaml`, schema `schemas/ext/known-issues.schema.yaml`). Each issue keeps what the maker published: its reference when there is one, the models, the affected versions, the fixed version, open, fixed or won't fix, the first published date and the source. Aigna's own words are marked as such: a workaround the maker didn't publish (`from: aigna`), how Aigna read an unclear version list (`affected_note`), and why no room meets a maker's condition (`needs.never`). The Poly VideoOS feed is real and cites the same release notes as the firmware line; the Logitech, UniFi and Netgear feeds are made up and say `demo: true`, cite a demo source, and show "Demo" on every page. A feed says when Keia Atlas last read it (simulated; stage 2 reads it with the firmware list).

**Matching is a proposal in words, never an action** (`src/lib/knownissues.mjs`, tested in `tests/knownissues.test.mjs`). An incident matches a known issue when it is about a named model, the room meets the maker's condition (such as an external camera), its firmware is an affected version or isn't known, and it shows the symptom from the device profile's guide or the maker's words. Strong: model, an affected version and both the symptom and the words. Possible: anything less that still fits. A version the maker doesn't list rules it out. Tickets resolved as duplicate, cancelled or no fault found never match. Nothing is closed or linked by Keia Atlas.

**Fleet exposure** counts every live unit of a named model by the version it runs (simulated the same way as the Devices overview; accessories such as the TC10 run their system's version). Units whose maker's firmware isn't tracked count as "may affect us".

**Repeats with no known issue**: the same model and symptom three or more times in 30 days, or twice or more in two or more offices, leaving out incidents that match a known issue or are explained elsewhere (a duplicate, cancelled, no fault found, or tied to project work).

**The service manager's flow** (`/known-issues/`, stage 2): Needs your decision first (matches to link or turn down, repeats to raise or leave for now), then every known issue with filters, the maker cases and the feeds. A known issue's page shows the fleet by office (each unit a link), the incidents that look like it, the fix in words (a rollout that already moves to it, one to propose through the Firmware rollout playbook, or why it can't be installed, such as 5.0.1 under ADV-001), and the case with the maker. Tell the team leaves a note on each affected room.

**Maker cases** (`data/maker-cases/`, schema `schemas/ext/maker-case.schema.yaml`). For each repeat, and each known issue that affects us without a case, Keia Atlas prepares one: the maker, contract and support route from `data/vendors` (or the feed's route when there is no contract), what we see (editable), what we ask, the evidence (models, versions, serials, the incidents in order) and the logs to attach. A person reads it and sends it; sending is simulated until stage 4 and always needs a second, deliberate click. Tracking records the maker's answers, its case number and the known issue it publishes, which links the case back to the fleet and the incidents.

**Everything a person decides is a live-layer event** (items `ki:`, `room-note:`, `cluster:`, `case:`, `src/lib/knownissues-client.mjs`): it shows in every open window with who and when, and History undoes it.

## Consequences

- The incident page says "Looks like a known issue" and "Part of a repeat"; the unit page lists "Known issues for this firmware" (from `/known-issues/units.json`).
- Three demo incidents were added (INC0041161, INC0041190, INC0041193) so the demo has a repeat and a second match.
- Room pages don't show the notes from Tell the team yet; the notes are live-layer events (`room-note:<room>`) ready for them.
- Known issues has no place tab yet (Shell's NAV is shared); the page sits under Work with its own help card.
