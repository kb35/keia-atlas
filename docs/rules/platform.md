# Platform pages

The same tools on every page, so people learn Keia Atlas once.

### P1. Every list has find and filter

A list longer than a screen gets `FilterBar` (`src/components/FilterBar.astro`): a find box, then pill buttons (Region, Office, Kind...) that open on hover, click, tap or keyboard focus. People pick as many choices as they like, each shows how many items it would leave, the list changes as they pick, and the address bar follows so a filtered list can be shared. It says "N of M", Escape clears the find box, and an empty result says so and offers "Clear the filters".

- **Why:** scrolling is the slowest way to find something, and one filter that looks and moves the same everywhere is learnt once.
- **Do:** mark items `data-fi` with `data-find` and `data-f-<key>` (several values with a bar, `a|b`), and give the bar `facets` (`{ key, label, options: [{ value, label }] }`). Switches use `data-t-<key>="1"`. A view switch is `views`, a sort is `sort` (both at the right); anything else inside the bar tag sits to their left. Items and groups hide through the bar, which holds the page still (`rsHold`) and uses the motion tokens.
- **Don't:** build a one-off filter, or hide list items yourself. `PageFind` is the older flat version still on Setup guides and Device types; move them to `FilterBar` when they are next redesigned.

### P2. Search reaches everything

The top bar Search (`/` or Ctrl K) finds spaces, profiles, devices, models, setup guides, projects, people, spares, cables and retired kit, and reads "EMEA spaces with X52" into chips people can change. The same words always give the same answer.

- **Why:** one box beats knowing where things live.
- **Do:** add a new kind of thing to `src/lib/search-index.mjs` in the same change.
- **Don't:** ship something search cannot find.

### P3. Report on every page

Report offers Propose an edit, New firmware found or Urgent issue, filled in with what the page is about (the `about` prop on `Shell`), and sends it to the owner.

- **Why:** people fix knowledge where they notice it is wrong.
- **Do:** pass `about` on every page about one thing.
- **Don't:** add a separate feedback form.

### P4. View as

Anyone can see Keia Atlas as any role from the menu under their name. Role changes what comes first, never what exists; vendors alone see less.

- **Why:** people learn each other's jobs.
- **Do:** order a role's first screen (Home) and its place tabs by role; the sidebar keeps one order for everyone (L3).
- **Don't:** build a page only one role can open.

### P5. Simulated data says so

There are no stages: every page belongs to a module (its place in the sidebar), and while Settings › Modules has that module Off, the page says so and offers to switch it on (`Shell.astro`; `minStage` is retired and ignored). Invented numbers (usage, costs, scenarios) carry the dashed "Simulated" tag, and made-up figures that change as you watch "Simulated live", both from `SimTag` in the band's overline row.

- **Why:** trust depends on knowing what is real.
- **Do:** label simulated numbers where they appear.
- **Don't:** show made-up data as live.

### P6. Empty states say what next

An empty list or a filter with no match says so and offers the way out: clear the filter, try fewer words, add the first one.

- **Why:** a blank panel looks broken.
- **Do:** one sentence and one button: `EmptyState`.
- **Don't:** a blank box or a bare "0".

### P7. Undo and archive, never delete

Actions take effect at once and offer Undo for about five seconds. Records are archived or retired with who, when and why; retired pages and files are removed, and stay in the project's git history.

- **Why:** audits need history, and fear of mistakes stops people using a tool.
- **Do:** "Archived. Undo". Changes to work (a task ticked, assigned or moved) go through the live layer, `src/lib/live.mjs`: each is an event with who and when, the History drawer shows every version, and Undo writes a new event that puts the old value back (decision 0025).
- **Don't:** "Are you sure?" dialogs, or a Delete button. Don't change work in browser storage behind the live layer's back: other windows will not see it and it has no history.

### P8. Propose, then approve

Anyone proposes a change to a profile, setup guide or playbook; its owner approves; nothing changes before that. Agents only propose.

- **Why:** the standard stays right when a person or an AI is wrong.
- **Do:** say who will see a proposal.
- **Don't:** let an edit change the standard directly.

### P9. Help on every page

Every page has a **Help** switch in the top bar (the round ? beside Report; the ? key toggles it, Escape turns it off, and it is remembered for the window). With it on, everything that has help gets a dotted outline, and pointing at it, focusing it or, on a touch screen, tapping it once shows a small card: what it is, what to do with it, and a Learn more link to the matching lesson or glossary word. Every page gets help for free from the shared parts (the top bar, band, key numbers, filter bar, tabs, panels, sections, empty states and the live layer), and adds a key only for a widget of its own.

- **Why:** people understand a page by pointing at it, without training and without leaving it.
- **Do:** put `data-help="<key>"` on a widget only your page has, and write its entry in `src/lib/help.mjs` (name, what it is, what to do, and where to learn more). Take the words of a glossary term from the glossary (`term:<id>`). `tests/help.test.mjs` fails, and names the key, if a `data-help` key has no entry.
- **Don't:** explain a control in a page's own tooltip or a paragraph above the list. Don't write help that repeats the label: say what the thing is for and what happens when you use it.

### P10. Every number drills down

On overview and summary pages (Home, the Work overview, the Spaces and Devices overviews, office and region pages, service pages, and the band and summary tiles of a record), every count, key number, tile, matrix cell, chip and "See all" is a drill-down: selecting it opens the page that owns that list, with the matching filters already in the address, which the filter bar reads when the page opens. The link says where it goes ("See all 9 in Incidents →", "See all 288 in the Work list →"), and the page it opens shows the same count in its "N of M". Back returns to the same place on the page you came from.

- **Why:** a number is a question ("which nine?"), and the answer lives on one page, with its filters, sort and actions. A summary that grows 288 rows in place stops being a summary, hides where the list really lives, and makes two versions of the same list.
- **Do:** give `KeyNumbers` items a `to` (`'/incidents/?state=new,in-progress,on-hold'`, or `'?status=problem'` when this page holds the list). Give an overview's `Section` a `to` and a `place` (and `carry` when both pages share a filter bar): it shows the first few items and "See all N in <place> →", never "Show all". A figure that counts no list (a phase, a date, an estimate, a size, a percentage, or the total of the list right under it) is the one exception, and says so with `fact: true`. Mark a drill-down's number or chip `data-vt-rec="dd-<path>"` (`KeyNumbers` and `Section` do it for you) and give the destination's `PageBand` `rec="dd-<path>"`, so the number flies into its title (M5). A hover peek may preview; the click always navigates, or opens the record. A control that changes how this page is seen (See as) or filters this page's own list may stay on the page; mark its box `data-dd="<why>"`.
- **Don't:** expand a list in place on an overview. "Show all" (`Section showAll`) is only for a list on its own page, or a short extra of a few rows inside a record; never 20 or more rows onto an overview. Don't link to a list without the filter the number counts, and don't show a number that opens a page counting something else. `node tools/drilldown-audit.mjs --base <dev server>/keia-atlas` lists every summary element, what a click does and whether the counts agree.

### P11. Depth and density, remembered per person

Every page has four layers: Band, Summary, Record and Raw. At each boundary, `OpenHere` says the layer's name and offers "Open pages like this here": pressing it makes that layer where every page of the same kind (home, space, device, job, service...) opens for this person, straight there with no scroll animation. The address wins (`#record`, `#raw`), and Back keeps its scroll. Density is Comfortable (the default) or Compact (the default in the Enterprise and High contrast looks): row height, card padding and type one step smaller, never a slot hidden, touch targets still 44 px. Both are per person and kept in this browser (`rs6-depth`, `rs6-density`, `src/lib/depth.mjs`); density is applied as `html[data-density]` before first paint; Settings has both, and "Open everything at the band again".

- **Why:** one person wants the answer and to leave, another lives in the log; the page serves both when the layer is theirs to choose and it is remembered.
- **Do:** put `<OpenHere kind="..." layer="...">` at each layer boundary; give the layer's first element `data-layer-start`; read spacing from `--row-py`, `--row-px`, `--card-py`, `--card-px` and type from `--name-size` and `--support-size` (`src/styles/density.css`).
- **Don't:** hide anything in Compact, remember depth per page instead of per kind, or animate the scroll to a remembered layer.

### P12. Standing rules: reversible runs, irreversible asks, people keep the diagnosis

Routine work runs only under a standing rule a named owner approved once (`data/standing-rules/`, the model in `src/lib/rules.mjs`). Every rule declares its way back: Undo (it truly reverses), Roll back (the previous state is kept), nothing (it ends as it started), or Asks (it cannot be put back, so a person confirms every run). Before every run it checks its conditions in order and its caps: never more units than its wave, never in a booked meeting, never in a change freeze, halted after runs in a row unable to complete. A run reads, writes and reads back; a write that does not read back as intended is "Unable to complete", never done, and a rule that declared a way back restores what it changed and raises an incident to its owner. Every automatic action carries "How was this done?" (`HowCard.astro`): what it read, did, ruled out and did not check, evidence as a count, only the declared verb, Run again only for the rule's owner or the job's owner, and the full trace one link away in the audit log (`/support/log/`). On a P1 or P2 the person says what they think before the suggestion opens. Work nobody takes within the response target goes to the service owner (the default owner clock); a major incident names one commander.

- **Why:** automation that explains itself and can be put back is trusted; automation that hides or fakes an Undo is not, and people who stop diagnosing lose the skill.
- **Do:** declare the way back in the rule's data; show the verb from the rule, never from the page; word results as "Done automatically" or "Unable to complete" with the rule and its owner; keep "What it did not check" filled.
- **Don't:** show an Undo that is not real, run anything irreversible without a person's confirmation, show a confidence percentage, or open the suggestion before the person's call on a P1 or P2.

