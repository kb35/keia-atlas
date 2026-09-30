# Standard: building a page

Every Keia Atlas page has the same slots in the same order and is built from the same parts, so one page learnt is every page learnt. The rules behind this are in the rule book (`docs/rules/layout.md` L1, L5 to L10; `motion.md` M5, M6, M10; `words.md` W5 to W9) and decision 0026. The reference pages are `src/pages/rooms/index.astro` (List) and `src/pages/rooms/[id].astro` (Record).

## 1. Pick the archetype

| Archetype | For | Under the band |
|---|---|---|
| **A. List** | Rooms, Units, Models, Projects, Playbooks, People, Vendors... | `FilterBar`, then cards, rows or groups |
| **B. Record** | one room, unit, model, project, task, incident, person | picture (7 cols) beside a `SidePanel` (5 cols), then tiles and `Section`s or `DetailTabs` |
| **C. Board** | Incidents board, Schedule, Year, Capacity, Budget, Lab, Scenarios | `FilterBar` with the view switch, then the board at natural height, legend below |
| **D. Overview** | Home, Work overview, Usage, Learn, About, Search | priority tiles (12 cols), then the main list, then sections |

## 2. Fill the slots, in this order

1. `Shell` with `title`, `section`, `crumbs` (every step but the last a link) and `about`.
2. `PageBand`: `overline` (the kind of thing, W9), `title`, `lede` (one line), `sim` or `stage` if needed, `numbers` (3 or 4, each a drill-down with `to`, or `fact: true`; rule P10), one `.btn.primary` in `slot="action"` if the page has a main action (W7). A list page that numbers elsewhere open sets `rec="dd-<path>"` (`dd-incidents` for `/incidents/`), so their figure flies into its title.
3. `<div class="content">`, and first inside it (lists and boards) `FilterBar`: find box "Find a ...", facets Region, Office, Kind, Status then the page's own, switches, then `views` and `sort`. The count is automatic.
4. Main area: the list, or `<div class="g12 top">` with the picture (`s-7`, `stick`) and `SidePanel` (`s-5`).
5. Secondary detail: tiles in `<div class="g12">` (`.card.side-card.s-4` each), then `Section`s (on an overview or summary, `to` and `place` for a short preview and "See all N in <place> →"; `showAll` only on a list's own page or for a few rows in a record), or `DetailTabs` when there are more than four.
6. `EmptyState` where the list would be.

**Rule 7 (P10): every number drills down.** On Home, the overviews, office, region and service pages, and the band and summary tiles of a record, every count, key number, tile, matrix cell, chip and "See all" opens the page that owns that list, with its filters in the address (the filter bar reads them when the page opens), and the link says where ("See all 9 in Incidents →"). That page shows the same count in its "N of M". Nothing expands in place on an overview; never 20 or more rows. A hover peek may preview; the click navigates, or opens the record. The number flies into the destination's title (`data-vt-rec="dd-<path>"` here, `PageBand rec="dd-<path>"` there), and Back returns to the same scroll position. A figure that counts no list is `fact: true`. Check with `node tools/drilldown-audit.mjs --base <dev server>/keia-atlas`.

## 3. Check before you commit

- [ ] At 1440 by 900 the band and place tabs are at most 150 px; the bar or the picture starts within 260 px of the top of `main`.
- [ ] Nothing above the filter bar. No explainer, chart, alert card or colour key before the answer.
- [ ] No `max-height` with `overflow: auto`, no `height: calc(100vh ...)`, no `data-fit-fill` (L8).
- [ ] No page-made band, stats row, tab strip, tab script, sort `<select>` or simulated label.
- [ ] A record page puts `recHere(id)` on its picture (or `rec={id}` on `PageBand`, when the title is what the card or chip flies into); the list it comes from marks each picture `data-vt-rec={id}`.
- [ ] Drill-down (rule 7, P10): every key number has `to` or `fact: true` (the build warns otherwise); every count, tile, cell, chip and "See all" on a summary is a link to its list with the filters in the address, and that list shows the same count. No "Show all" on an overview.
- [ ] Help: a widget only this page has carries `data-help="<key>"` with an entry in `src/lib/help.mjs` (P9). The shared parts already carry theirs; `npm test` names any key without an entry.
- [ ] Every width (L10): `node tools/responsive-check.mjs --base <dev server>/keia-atlas --only <page>` passes at 375, 768, 1024, 1280, 1440 and 1920 (no sideways scroll, no overlaps, no label wider than its box), and each block has a narrow shape you have looked at, not a squeezed wide one.
- [ ] Inside `.content`, width rules are `@container content (...)`, not `@media`; no `min-width` or `overflow-x: auto` that makes a sideways scroll.
- [ ] Looked at 1440 by 900, 1280 by 720, 768 and 375 wide, light and dark, and with reduced motion. `npm test` and `npm run build` pass.

## 4. The parts

| Part | Props | Slots |
|---|---|---|
| `PageBand` | `overline`, `title`, `lede?`, `sim?` (true: "Simulated"; `"live"`: "Simulated live"), `stage?`, `numbers?`, `rec?` (the record's id: the title takes the shared-element name) | `overline` (extra items), `lede`, `numbers`, `action` |
| `KeyNumbers` | `items: [{ n, label, to?, fact?, tone?, id? }]`, at most 4. `to` is the list it counts, filtered (P10); `fact: true` is the documented exception for a figure that counts no list | |
| `SimTag` | `kind: 'simulated' \| 'stage:<n>'` (used by `PageBand`) | |
| `FilterBar` | `facets: [{ key, label, options, single?, value? }]`, `toggles`, `placeholder`, `noun`, `scope`, `views: [{ value, label, show, noun? }]`, `viewKey?`, `viewsHelp?` (a help key for the view switch), `sort: { options, value? }` | default (extra controls, left of the view switch) |
| `DetailTabs` | `tabs: [{ id, label, count? }]`, `label?`, `initial?`, `param?` (a query name that also opens a tab, default `tab`) | one per tab, named by its `id` |
| `SidePanel` | `title`, `meta?`, `sticky?`, `help?` | default, `head` |
| `Section` | `title?`, `aside?`, `id?`, `showAll?`, `to?` (the page that owns the list: the section shows the first `showAll` and "See all N in <place> →", never expanding; P10), `place?` (the words after "in"), `carry?` (take this page's filters onto the link), `help?` (a help key for the heading), any other attribute (such as `data-fb-group`) goes on the section | default (mark the item list `data-items`; a `data-sa-btn` button, or with `to` an `<a data-sa-to>`, inside puts the button or link where you want it), `aside` |
| `EmptyState` | `text`, `action?`, `to?`, `filter?` | |

Scripts: `window.rsPanelSwap(panel, update)` changes a `SidePanel`'s content; `window.rsMarkChanged(el, who)` marks a live change; `window.rsKeyNumber(id, value, { label?, tone?, title? })` changes a band figure that was given an `id`; `window.rsWhoId()` is who this window is signed in as; a `FilterBar` fires `fb:sort` and `fb:view`, a `DetailTabs` fires `dt:change`.

Filter bar options worth knowing:

- **One choice, or a starting choice.** `single: true` allows one choice at a time; `value: 'cut'` starts the facet on that choice (an array for several). A facet on its starting choice is not "active" and "Clear all" puts it back. A single facet with a starting choice always holds one (the Scenarios situation).
- **Filters from code.** `bar.rsFilter.set('role', ['pm'])` sets a facet to exactly those choices (`[]` clears it), and `bar.rsFilter.set({ role: ['pm'], kind: ['task'] })` sets several and recounts once. Never click the options from a script.
- **Views from code.** `bar.rsFilter.setView('week')` does what a click on the pill does. A view's own `noun: ['place', 'places']` changes what the count says ("2 of 2 places").
- **Sticky headings under the bar.** The bar sets `--fb-h` (its height, 0 on phones, where it does not stick) on the page: `top: calc(var(--mast-h) + var(--fb-h))`.
- **Show all after a filter.** `Section showAll={n}` counts only what still shows, and follows the bar. Do not write a local "See all" or `nth-child` rule. With `to`, the same count goes into "See all N in <place> →", and `carry` puts the bar's filters on the link.
- **Filters from the address.** A page opened as `/incidents/?state=new,in-progress&site=dub` starts with those facets chosen (switches as `?key=1`, the find box as `?q=`). That is how every drill-down lands filtered: give the destination a facet or switch for what the number counts.
- **Tables.** `table` fits its column. A table with more than three or four columns gets `class="to-cards"`: under 700 px of content each row becomes a card, each cell labelled with its column's heading (a page can place the cells with its own rules on `table.to-cards tr`). `.tablewrap` gives a table its card; do not rely on its sideways scroll.
- **Live items.** When an item's `data-f-*` or `data-find` changes after load, call `bar.rsFilter.refresh(item)` (or pass a container of items; no argument re-reads them all), or dispatch `rs:find-refresh` on `document` with `detail: { el }`.

## 5. Minimal List page

```astro
---
import Shell from '../../layouts/Shell.astro';
import PageBand from '../../components/PageBand.astro';
import FilterBar from '../../components/FilterBar.astro';
import EmptyState from '../../components/EmptyState.astro';
import { href } from '../../lib/data.mjs';
const items = [/* ... */];
const FACETS = [
  { key: 'region', label: 'Region', options: [/* { value, label } */] },
  { key: 'site', label: 'Office', options: [] },
  { key: 'status', label: 'Status', options: [] },
];
---
<Shell title="Widgets" section="widgets" crumbs={[{ label: 'Widgets' }]}>
  <PageBand overline="Catalogue" title="Widgets" lede="Every widget at every site."
    numbers={[{ n: 11, label: 'Sites' }, { n: 3, label: 'Faulty', to: '?status=faulty', tone: 'bad' }]}>
    <a slot="action" class="btn primary" href={href('/widgets/new/')}>New widget</a>
  </PageBand>
  <div class="content widgets">
    <FilterBar facets={FACETS} placeholder="Find a widget, number or office" noun={['widget', 'widgets']} scope=".content.widgets"
      views={[{ value: 'cards', label: 'Cards', show: '[data-grid]' }, { value: 'list', label: 'List', show: '[data-list]' }]}
      sort={{ options: [{ value: 'site', label: 'By office' }, { value: 'name', label: 'By name' }] }} />
    <div class="grid-cards" data-grid>
      {items.map((w) => (
        <a class="card pad" href={href(`/widgets/${w.id}/`)} data-fi data-find={w.name} data-f-site={w.site} data-f-status={w.status}>
          <span data-vt-rec={w.id}>{/* the picture */}</span><b>{w.name}</b>
        </a>
      ))}
    </div>
    <div data-list hidden>{/* the same items as rows, also data-fi */}</div>
    <EmptyState text="No widgets match these filters." />
  </div>
</Shell>
```

Re-order on Sort inside the bar's run, so items slide into place:

```js
bar.addEventListener('fb:sort', (e) => bar.rsFilter.run(true, () => reorder(e.detail.value)));
```

## 6. Minimal Record page

```astro
---
import Shell from '../../layouts/Shell.astro';
import PageBand from '../../components/PageBand.astro';
import SidePanel from '../../components/SidePanel.astro';
import Section from '../../components/Section.astro';
import DetailTabs from '../../components/DetailTabs.astro';
import { recHere } from '../../lib/vt.mjs';
const w = /* the record */;
---
<Shell title={w.name} section="widgets" crumbs={[{ label: 'Widgets', to: '/widgets/' }, { label: w.site, to: `/widgets/?site=${w.siteId}` }, { label: w.name }]} about={{ kind: 'widget', label: w.name, to: `/widgets/${w.id}/` }}>
  <PageBand overline="Widget" title={w.name} lede={w.summary}
    numbers={[{ n: w.ports, label: 'Ports' }, { n: w.open, label: 'Open incidents', to: '#incidents', tone: w.open ? 'bad' : undefined }]}>
    <span slot="overline" class="pill manage">In service</span>
  </PageBand>
  <div class="content">
    <div class="g12 top">
      <section class="card pad s-7 stick" aria-label="The widget" {...recHere(w.id)}>{/* the picture */}</section>
      <SidePanel class="s-5" title="Facts" meta="From the data sheet">{/* key or facts */}</SidePanel>
    </div>
    <div class="g12">
      <div class="card side-card s-4" id="incidents"><h3>Incidents</h3>{/* ... */}</div>
      <div class="card side-card s-4"><h3>Compared against</h3></div>
      <div class="card side-card s-4"><h3>Lifecycle</h3></div>
    </div>
    <Section title="Parts" showAll={8}><div class="list" data-items>{/* rows */}</div></Section>
    <DetailTabs tabs={[{ id: 'wiring', label: 'Wiring' }, { id: 'history', label: 'History', count: 12 }]}>
      <div slot="wiring">{/* ... */}</div>
      <div slot="history">{/* ... */}</div>
    </DetailTabs>
  </div>
</Shell>
```

## 7. Every width (L10)

The frame (sidebar, top bar, place tabs, padding) and the shared parts already change shape by width. A page only gives its own blocks a narrow shape.

| Width of `.content` | The grid | Your blocks |
|---|---|---|
| 840 px and wider | 12 columns, as written | the wide layout |
| 560 to 839 px | 8 columns: `.s-3` and `.s-4` two a row (a lone one takes the row), `.s-6` halves, `.s-5`, `.s-7`, `.s-8` full; the `SidePanel` goes under the picture | many-column tables become two-line rows or cards; boards go two columns; side-by-side lists stack |
| under 560 px | 4 columns: everything full width | one column, cards |

```css
/* In a page's <style>: by the width the block has, not the window. */
@container content (max-width: 699px) {
  .my-row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "name end" "sub sub"; }
}
```

- A block that can sit in columns of different widths (a card that is sometimes half, sometimes full) can be its own container: `container: myname / inline-size`, then `@container myname (...)`.
- A matrix or table wider than its column: each row becomes a card listing only its non-empty cells (Who does what on the Work overview, `Raci.astro`). Never squash headings or let them break inside a word.
- A board: `repeat(4, minmax(0, 1fr))`, then 2, then 1 column, by the width of `content`.
- A timeline or gantt: narrow the name column, then put each name above its bar (`ScheduleYear.astro`).
- A closed pop-up takes no room (`display: none`, with `@starting-style` for its fade in); a hidden one past the window's edge widens the page.
