# Layout

Every page has the same anatomy: the same slots, in the same place, in the same order, so people learn one page and can read them all. The page scrolls as one page; nothing inside it scrolls on its own and nothing is squeezed to fit the window. The frame is `src/layouts/Shell.astro` (top bar, sidebar or phone tab bar, place tabs); the slots are shared parts in `src/components/`. Step by step for a new page: `docs/standards/page-anatomy.md`. Why: decision 0026.

### L1. Same slots, same order, every page

1. **Path** in the top bar: Place / parent / this.
2. **Place tabs**, the pages inside the place. Never a second row of view buttons under them.
3. **Band** (`PageBand`): overline row (the kind of thing, a status, a `SimTag`), title, one line; on the right `KeyNumbers` (3 or 4 figures, each may link) and at most one primary action.
4. **Filter bar** (`FilterBar`), first in `.content` on any page with a list: find box, facets, switches, Clear, then at the right the view switch, Sort and "N of M". Nothing above it.
5. **Main area**: the picture and its facts, or the list, full width on the one 12-column grid.
6. **Secondary detail**: full-width `Section`s with an `h2` each, or `DetailTabs` when there are more than four. A `SidePanel` only as a sticky detail column beside a picture.
7. **Empty**: `EmptyState`, one sentence and one button, where the list would be.

Every page is one of four archetypes:

**A. List** (Rooms, Units, Models, Projects, Playbooks, People...)

```
PATH                                  [Search] [Report]
TABS ─────────────────────────────────────────────────
Overline · Sim                   11     7     9   [Action]
Title / one line                 sites  ...   ...
[find] [Region] [Office] [Kind] [Status] Clear  [Cards|List] Sort  N of M
┌─────┐┌─────┐┌─────┐┌─────┐   cards, rows or a board
└─────┘└─────┘└─────┘└─────┘   groups continue below
```

**B. Record** (a room, a unit, a model, a project, a task, an incident, a person)

```
PATH: Rooms / New York office / 20.10 Whooper Swan
Overline · status · Sim        13 units  ✓ matches  8 seats  [Action]
Title / one line
┌ picture (7 cols) ──────────┐┌ SidePanel: key or facts (5 cols, sticky) ┐
└────────────────────────────┘└──────────────────────────────────────────┘
┌ tile (4) ┐┌ tile (4) ┐┌ tile (4) ┐   equal heights
Section (12 cols)   Section   ...   or DetailTabs when more than four
```

**C. Board, plan or timeline** (Incidents board, Schedule, Year, Capacity, Budget, Lab, Scenarios)

```
Band with numbers
[find] [facets] [switches]         [Day|Week|Month|Year]  N of M
Columns, grid or gantt at natural height; the page scrolls
Legend and "how it works" below
```

**D. Overview** (Home, Work overview, Usage, Learn, About, Search)

```
Band with 3 or 4 numbers
[filter bar, if there is a list]
Priority tiles (12 cols, equal heights)
Main list or table, full width; secondary sections below
```

- **Why:** filters, band, key numbers and tabs in the same place on every page. A page learnt once is every page learnt.
- **Do:** pick the archetype first, then fill its slots with the shared parts.
- **Don't:** a page's own band, stats row, tab strip or filter; a chart, alert card, colour key or explainer above the filter bar.

### L2. Retired: board pages fit one screen

Retired on 29 Sept 2026 (decision 0026) and replaced by L7 and L8. Boards, plans and grids now take their natural height and the page scrolls. The fit helper is gone from `Shell.astro` and `base.css`.

- **Why:** fitting a board to the window made it scroll inside itself, and the page jumped as the helper re-measured.
- **Do:** let the board be as tall as it is.
- **Don't:** add `data-fit-fill` or `.content.fit` to a page.

### L3. Places, then tabs, then detail

The sidebar is a short, fixed list of places. Pages inside a place are tabs across the top, set in `NAV` in `Shell.astro`.

- **Why:** a sidebar that never changes is learnt once.
- **Do:** add a new page as a tab of its place.
- **Don't:** add a sidebar entry for one page.

### L4. Need to know first

Cards and rows show a name, a status and one line. More is a click or hover away: a peek card (`data-peek`) shows on hover, stays on click, and closes on a second click or Escape. Every hover has a click and keyboard equivalent.

- **Why:** hover alone is invisible on phones; too much on a card hides what matters.
- **Do:** `.list` of `.row`s; zebra rows on long tables.
- **Don't:** hover-only information.

### L5. Phones

Under 768 px the sidebar is a bottom tab bar with More, the band stacks (key numbers two by two, the action full width), the filter bar folds its facets into a Filters sheet, and tables, matrices and boards become cards or lists (L10). A device drawing or wiring diagram scales down to fit its card.

- **Why:** technicians use Keia Atlas on site.
- **Do:** check every page at 375 px wide.
- **Don't:** let the page itself scroll sideways, or make a box that scrolls sideways inside it.

### L6. One grid, and a path you can climb

Cards on a page sit on one 12-column grid (`.g12`, spans `.s-3` to `.s-8`) with equal gutters; cards in a row stretch to the same height, so their edges line up. A long list shows its first few rows and a "Show all" (`Section` with `showAll`). Every deep page (a unit, a room, a model, a device profile's model) puts its path in the top bar, for example Units / Dublin office / 3.02 Pantry / Pantry signage player, and each step but the last is a link.

- **Why:** stacked boxes of different sizes push the answer down, and people need to get back up a level in one click.
- **Do:** pass `crumbs` to `Shell`; a page filled in the browser rewrites `.mast .crumbs` once it knows the unit.
- **Don't:** leave a gap in the grid for one tall card, or end a path at a step that is not a link.

### L7. The first screen is a priority order

Not a height cap. The top of the page is a clean block in priority order, the answer first; everything else follows further down. Checks at 1440 by 900:

1. Band and place tabs together at most 150 px (the band about 100).
2. The filter bar (a list) or the picture (a record) starts within 260 px of the top of `main`.
3. The first block under the band is the answer: the list, the drawing beside its key, the board. Never an explainer, a chart, an alert digest or a colour key.
4. Cards in a row share a height.

- **Why:** people judge a page by its first screen, and what they came for must be the first thing on it (the most important information sits at the top, neatly organized).
- **Do:** move explainers, legends and "how it works" below the main area, or into a disclosure.
- **Don't:** shrink things or add inner scrollers to squeeze more onto the first screen.

### L8. The page scrolls; nothing scrolls inside it

One scrollbar: the page's. No box with a fixed or window-based height that scrolls inside itself, no fit-to-window heights. A long list uses "Show all"; a detail column is a sticky `SidePanel`, which follows the page and, when it is taller than the window, sticks by its foot so every part is reached by scrolling the page. A pop-up that floats over the page (a filter list, the phone Filters sheet, a peek) may scroll inside itself when it is taller than the window; nothing on the page itself does, sideways included (L10).

- **Why:** cramped modules that scroll inside themselves are what not to do. Two scrollbars hide content and trap the wheel.
- **Do:** natural heights; `SidePanel` for a column that should stay in view; `.stick` on a record's picture so it stays beside a taller panel.
- **Don't:** `max-height` with `overflow: auto` on content, or `height: calc(100vh - ...)`.

### L9. The band: one line, key numbers, one action

`PageBand` takes the overline (the kind of thing: "Room", "Unit", "Project PRJ-09", "Catalogue"), the title, one line (cut with an ellipsis), and `sim` or `stage` for the `SimTag`. `KeyNumbers` holds 3 or 4 figures, each a link where it can be (a page, `?status=installing` to filter this list, `#incidents` to open a tab or section), with a tone only when the label says the same thing in words. The count of a filtered list is not a key number: it is the filter bar's "N of M". One primary action, at the right end of the band.

- **Why:** one band everywhere replaced twelve page-made variants, and the band stays put between pages (M5).
- **Do:** make each key number answer "how many need me?" and link to them.
- **Don't:** a button under the lede, two primary buttons, a count as the overline, or a "shown" number beside the bar's count.

### L10. Every width, not one screen

Keia Atlas is laid out for any window from a 375 px phone to a 2560 px monitor, and checked at 375, 768, 1024, 1280, 1440 and 1920. Nothing scrolls sideways, nothing overlaps, and no label is squeezed or broken inside a word; when something does not fit, it changes shape.

**The frame follows the window** (media queries, in `base.css` and `Shell.astro`):

| Window | Sidebar | Top bar | Side padding (`--pad-x`) |
|---|---|---|---|
| 1024 and wider | names and icons (232 px) | path, Search, Help, Report | 31 to 40 px |
| 768 to 1023 | a rail: icons with short names (68 px); the account corner is the avatar | colour mode and Settings join it | 23 to 31 px |
| under 768 | a bottom tab bar with More | icons only, no path | 16 px |

From 1900 px the content stops at `--page-max` (1760 px) and centres. The path stays on one line; the page's own name is cut with an ellipsis. The place tabs never scroll: the ones that do not fit go into a More menu at their right end, and the current tab always shows.

**Parts follow their column** (container queries). `main` is the container `main` and every `.content` is the container `content`, so a part lays out by the width it really has, beside the sidebar or not. Inside `.content` use `@container content (max-width: ...)`, not `@media`. The usual steps are 1100, 1000, 840, 700, 600 and 560 px of content.

**The grid** (`.g12`): 12 columns from 840 px of content; 8 columns from 560 px (quarters and thirds two a row, a lone one takes the row, halves stay halves, anything wider takes the row, and a picture's `SidePanel` moves under it and stops sticking); 4 columns under 560 px (everything takes the row). The gutter (`--gutter`) is 20, 16, then 12 px.

**The shared parts:**

- `PageBand`: key numbers and the action sit right of the title from 900 px of `main`; under that they go below the title, the action at the right end of their row; under 600 px the numbers are two by two and the action takes the full width.
- `FilterBar` lays itself out by the room it has. *Line*: everything on one line. *Stack*: the find box with the view switch, Sort and count, then the facets as one group on the next line; or the find box alone, then the facets beside the view switch, Sort and count, whichever is shorter. *Sheet*: under 600 px of content, or when stacking would take more than three lines, the facets fold into one Filters button (showing how many choices are on) that opens a sheet from the bottom. Sort and the count never part. A closed facet list takes no room. The bar sticks under the top bar only when it is one line, or from 1024 px.
- `DetailTabs` wrap into rows of pills when they do not fit on one line.
- `SidePanel` moves under the picture under 840 px of content.
- A table marked `class="to-cards"` becomes one card per row under 700 px of content, each cell with its column's name (filled from the heading). A matrix (Who does what, RACI) becomes one card per row listing only its non-empty cells. A board goes 4, 2, then 1 column. The Schedule's week goes from people by days, to each person above their days, to days stacked; the year plan narrows its name column, then puts each name above its bar. A phase rail turns to run down the page.

- **Why:** a page should adapt to whatever screen size, not just a single one. A page tuned for 1440 looked broken in a narrower window: facets orphaned on a second line, matrix headings squashed to "Pro-vision".
- **Do:** design each block's narrow shape (cards, a list, a stacked row) when you design its wide one; run `node tools/responsive-check.mjs --base <dev server>/keia-atlas` before you commit (it fails on sideways scroll, overlapping parts and labels wider than their box, at all six widths).
- **Don't:** a `min-width` on a table or grid that forces a sideways scroll, `overflow-x: auto` on content, text broken inside a word, `@media` for a part inside `.content`, or a hidden pop-up sitting past the window's edge (it widens the page even while hidden).
