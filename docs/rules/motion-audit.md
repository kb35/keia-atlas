# Motion audit: every page family against the grammar

30 Sept 2026. Keith: "I thought the whole website was supposed to have motion design in it." This audit lists every page family, the interactions on it, and whether each one has the right move from the motion library (docs/rules/motion.md, M17 and M19). Out of scope here, and owned by other work: the front door (`/welcome/`), the method pages (`/method/`), Settings and its accessibility controls, the hero's 3D, device and switch Ports tables, and the floor maps and small multiples.

## The grammar

| Interaction | The move | Library |
|---|---|---|
| Page enter | `main` leaves upward, the next rises in; frame, band and filter bar stay | view transitions (`motion.css`) |
| Section reveal | A section below the fold settles in once as it is first seen | `km-settle` |
| Tabs, phases, views | The next comes from the side you moved towards; the box eases to its height | `DetailTabs`, `rsSwapBegin`, `rsHold` |
| Filter, sort | Items that stay slide (FLIP), leavers fade early and shrink, arrivals grow; the box eases | `FilterBar` |
| Expand, collapse | Grows from its source: a `<details>` from its summary, "Show all" in a held box, a menu from its control | `km-disclose`, `Section`, `rsPopIn` |
| Open, close a card or dialog | Grows from the control that opened it, shrinks back | `rsPopIn`, `rsPopOut`, `km-peek` |
| List add, remove | Arrivals grow from their centre, leavers shrink where they were | `rsEnterEls`, `rsExitEls` |
| State (health, ownership) | The ring eases in place; the With chip slides | `km-ring`, `km-chip` |
| Numbers | The new value ticks into place, never counting through | `km-tick` |
| Charts | Draw in once when first seen | `km-draw-in` |
| Hover | Rows darken; cards that open something lift 2 px | `craft.css`, `km-lift` |

## What was true before this pass, on every page

Four gaps were the same on every family, which is why so much of the site felt still:

1. **Sections below the fold had no move at all.** Only the first 12 list items in view staggered in on arrival; everything you scrolled to was simply there.
2. **Every `<details>` jumped.** About 30 files use one (Home's quiet disclosures, device and model pages, projects, changes, integrate, search, standards). The box snapped to its full height; on Home the rows faded in after the box had already jumped.
3. **No number ever moved.** The rule book said figures never animate; the filter bar's count only blinked its opacity.
4. **No chart ever moved.** Sparklines and every bar chart (spares, cables, vendors' terms, project hours and budget, planning, refresh, models' installs, locations' use) were drawn still.

And two smaller ones: cards did not lift on hover (the rule book said nothing moves on hover), and filtering left leaving rows at full strength over the rows sliding into their place for the first 100 ms (visible in `motion-audit-filter-before.png`).

## Coverage by family

Scores: **full** (every interaction has its move), **partial** (some do), **none**. "After" is this pass.

| Family | Pages | Interactions | Before | After | Still to do |
|---|---|---|---|---|---|
| Home, per role (technician, lead, leadership, partner) | `/` (`index.astro`, `LeadershipHome`, `PartnerHome`, `home-client.mjs`) | enter; list stagger; quiet disclosures (Done automatically, What changed, Knowledge to review, Across the estate); With chip hand-offs; rows moving between lists; a new signal; figures (Ready for you, the band's four); sparklines on leadership's cost tiles; tour card dismissal; View as redraw | partial: chip, rows, signals and View as were full; disclosures jumped then faded; figures and sparklines still | full | |
| Locations: all, region, office, offices, home offices, 3D | `/locations/`, `_Region`, `_Office`, `offices/`, `[site]/home-offices`, `[site]/3d` | enter; zoom in and out; filter and sort; lenses; select a space; floor change; Replay; office cards; use bars; sections below the plan | partial: zoom, lenses, filter and Replay full; cards did not lift; use bars still; sections below the plan had no move | full | Plans and small multiples belong to the floor-map work |
| Spaces | `/rooms/`, `/rooms/<id>/` | enter; filter, sort, view switch; card grid; record's picture transform; Show all; outlets and wiring sections; guide card; details | partial | full | Signal flow (switched on by the person) is unchanged |
| Device, units, assets | `/device/`, `/devices/`, `/assets/` | enter; filter; 75 folded device-class `<details>` on `/devices/`; asset health bars; unit page sections | partial: filter full; every details jumped; bars still | full, outside Ports | Ports tables are out of scope for this pass |
| Models, profiles, space profiles | `/models/`, `/models/<id>/`, `/profiles/`, `/room-profiles/` | enter; filter; installs-by-year columns; DetailTabs; details; product picture transform | partial: tabs, filter and transform full; columns still; details jumped | full | |
| Support: overview, queue, incidents, incident | `/support/`, `/support/queue/`, `/incidents/`, `/incidents/<n>/` | enter; filter and sort; With chips; priority change pop; DetailTabs; side panel; run a fix; figures in the band; sections below | partial: chip, pop, tabs and FLIP full; count blinked; leavers overlapped; sections still | full | |
| Changes | `/changes/`, `/support/changes/`, `/support/changes/<id>/` | enter; filter; details; With chip; status | partial | full | |
| Standing rules | `/support/rules/`, `/support/rules/<id>/` | enter; filter; run a rule (words become the state); run strip squares entering; How card | partial: run strip and How card full; the result line's glyph jumped when the line was rewritten | full | |
| Projects and tasks | `/projects/`, `/projects/<id>/`, tasks, integrate, reports | enter; filter; task bars; phase timeline and rail; hours and budget bars; details; task board; integrate batch expand | partial: task board and integrate full; phase switch only eased height (no cross-fade, no direction); bars still; details jumped | full | |
| Schedule | `/work/schedule/`, year, capacity | enter; views (day to year); filter; the assign dialog; drag | partial: the dialog grew in but vanished on Cancel, Escape and Assign | full | |
| Planning | `/work/planning/` | enter; filter and sort; scenario swap; capacity and hours bars | partial: bars still | full | |
| Work list | `/work/list/` | enter; filter, sort, views; chips; Show all | full, count blinked | full | |
| Standards and cables | `/standards/`, `/standards/<id>/`, `/standards/cables/`, `/cables/` | enter; filter; figures; stock bars; details | partial | full | |
| Vendors | `/vendors/`, `/vendors/<id>/`, `/vendors/access/`, `/vendor/` | enter; filter; contract-term bars; figure tiles with sparklines; With chip | partial | full | |
| Knowledge | `/known-issues/`, cases, `/playbooks/` | enter; filter; phase-step columns; side panel; How card | partial | full | |
| Learn | `/learn/`, `/learn/fields/` | enter; lesson steps and tries (its own moves); progress bar | full | full | |
| Search | `/search/` and the palette | palette grows from its button; results never animate while typing; details | full, details jumped | full | |
| Team | `/team/`, open work | enter; filter and sort; the org chart; "Show all people" on a phone; open work's role rows | partial: chart fold jumped; open work's role row pulled the table's height at once | full | |
| Services | `/services/`, `/services/<id>/` | enter; service lights; figure tiles with sparklines; unit health bars; filter the units | partial | full | |
| Usage, spares, refresh, lab, configurations | `/usage/`, `/spares/`, `/refresh/`, `/lab/`, `/configurations/` | enter; filter and sort; stock bars; refresh columns; configure menus | partial: menus had their own drop; bars still | full | |
| The room guide | `/guide/<space>/` and its card, report and request | enter; symptom list; report status; With chip; glyphs coming on | full | full, and sections settle | |
| Every console page: Report a problem | the drawer in the Shell | open, close | partial: it slid in but vanished on close | full | |
| Edit | `/edit/` | enter; DetailTabs; side panel; details | partial | full | |
| About and the rule book | `/about/`, `/about/rules/` | enter; chapter tabs; live examples | full | full | |

## What changed in this pass

- **Five new library motions** (motion.md M17, 13 to 17): `km-settle`, `km-disclose`, `km-tick`, `km-draw-in`, `km-lift`, in `src/lib/motion-library.js` and `src/styles/motion-library.css`.
- **Wired once for every page** by `src/lib/motion-wire.js` (loaded by `Motion.astro` in the Shell and by the room guide's layout), so no page writes motion of its own: sections settle, charts draw in, figures tick, every `<details>` in `main` discloses.
- **Filtering reads cleanly:** a leaving row's words fade in the first 60% of the exit while its box shrinks (`rsExitEls` in the Shell), so it never sits over the row sliding into its place; the count ticks.
- **Projects:** a phase comes in from the side you stepped towards (`rsSwapBegin` with `dir`) instead of only easing the height.
- **Team:** "Show all people" holds the chart's box and grows the parts that open; open work's role row opens in a held box.
- **Home:** the day plan's timeline slides each block into its time, in turn (`data-chart-bar="each"`).
- **Standing rules:** the result line's glyph eases from its old ring to the new one (`km.ringSwap`).
- **Dialogs:** the Report drawer and the Schedule's assign dialog leave the way they came (`km.closeDialog`), on the backdrop, Cancel and Escape.
- **Reduced motion:** one answer for every script, `window.rsReducedNow()`, in the `<head>` of the Shell and the room guide: `html[data-motion="off"]` or `"reduced"` wins, then `data-reduced`, then the system. `motion-library.css` stops every CSS move under the site's switch.
- **The rule book** (motion.md M7, M9, M13 rows 1, 4 and 41 to 44, M14, M16, M17, new M19). This reverses two older rules on the owner's brief: figures now tick (still never counting through), and charts draw in once (still never looping, still redrawn still). Hover now lifts a card by 2 px.
- **The check** (`tools/motion-check.mjs`): five new flows (disclose, filter-tick, settle-draw, phase, lift), and every flow now runs twice, under the system's reduced motion and under the site's own `data-motion="off"`.

## Still to do

1. Floor plans and small multiples, device and switch Ports, Settings, the front door and the method pages are other helpers' work; this pass left them untouched.
2. The Report drawer's own Send closes it through the form (`method="dialog"`), so that one path still closes at once.
3. Home is re-rendered by its own client when View as changes; its rows use `rsChange`, but a glyph drawn afresh in a re-rendered row comes on (M8) rather than easing from its old state. `km.ringSwap` is there for it if the Home round wants it.
