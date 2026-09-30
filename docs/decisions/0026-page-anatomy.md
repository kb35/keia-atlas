# 0026. One page anatomy: the page scrolls, and every page is built from the same parts

- Status: Accepted
- Date: 2026-09-29
- Replaces: rule L2 (board pages fit one screen) and the "first screen is complete, no scrolling" reading of L1 in [0022](0022-seven-places-report-and-first-screens.md)

## Context

Review feedback asked for uniform pages (filters, band, key numbers and tabs in the same place on every page, with motion and continuity between pages) and said the page should scroll, with no cramped modules (the new Team page, with fixed-height boxes that scroll inside themselves, is what not to do). The uniformity review of 29 Sept measured 43 pages and found twelve band variants, seven ways of showing key numbers, six tab strips, sixteen pages hand-writing the same tab script, ten wordings of "Simulated", six pages fitting boards to the window and ten boxes that scroll inside themselves. Fitting to the window came from decision 0022's first-screen rule; it made boards scroll inside themselves and made the page jump as the fit helper re-measured.

## Decision

- **Every page has one anatomy**: path, place tabs, band, filter bar (on a list), main area on one 12-column grid, secondary sections (or tabs when more than four), empty state. Every page is one of four archetypes: List, Record, Board and Overview (rule L1, with sketches).
- **The page scrolls as one page.** Nothing scrolls inside it and nothing is fitted to the window (L8). A long list shows "Show all"; a detail column is a sticky `SidePanel` that follows the page and never has its own scrollbar. The first screen is a priority order, not a height cap (L7).
- **Shared parts, not page copies** (`src/components/`): `PageBand` (overline, title, one line, numbers and action slots), `KeyNumbers` (at most four, each may link), `SimTag` ("Simulated" or "Stage n" only), `EmptyState`, `DetailTabs` (hash-aware, owns the held, morphed panel swap), `SidePanel` (sticky, content cross-fades) and `Section` (h2, aside, "Show all"). `FilterBar` gains `sort` (a pill that opens like a facet) and `views` (word pills), and always shows "N of M". A 12-column grid, `.g12`, is in `base.css`.
- **Continuity between pages** (M5): the band and the filter bar join the top bar, sidebar and place tabs in staying put, so list to list only the results change. A clicked record's picture flies into its page and back (`data-vt-rec` and `recHere`, paired by the Shell only when both ends exist). Going up the path moves like Back. Live changes stay in place with a fading "who, just now" mark (M10).
- **One set of words** for find boxes, facet order, the count, the view switch, Sort, buttons, status, the simulated tag and the overline.
- Rooms and the room page are converted first as the reference List and Record pages. The rest follow in groups (review section 6); until then they are listed in Known gaps, and the fit helper stays until the last `data-fit-fill` page is converted.

## Consequences

- A new page is a checklist, `docs/standards/page-anatomy.md`: pick the archetype, fill the slots with the parts.
- Pages get longer and scroll; the first screen carries the answer, not everything. Boards and plans show at natural height.
- The band and filter bar are named for view transitions, so each page has at most one of each.
- Pages not yet converted look different from Rooms for a while. Known gaps 11 to 13 list them.
- The FilterBar `count` prop is kept but ignored, so older pages still build; pages that showed their own count in the band show it twice until converted.
