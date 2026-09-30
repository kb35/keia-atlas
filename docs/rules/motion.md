# Motion

Motion explains a change. Tokens and shared moves are in `src/styles/motion.css`; the shared scripts (`rsMotion`, `rsHold`, `rsMorphPanels`, and the controls family in M12: `rsTheme`, `rsChange`, `rsSwapBegin`, `rsMarker`, `rsPopIn`) are in `src/layouts/Shell.astro`.

### M1. Durations and curves are tokens

Moves use `--dur-morph` (520 ms), enters `--dur-enter` (440), exits `--dur-exit` (240), pages `--dur-page` (420), colour and status `--dur-state` (300), hovers `--dur-hover` (140), menus and peek cards `--dur-pop` (200), growing from `--pop-scale` (.94); a look or light and dark cross-fades the page in `--dur-theme` (360); list items start `--stagger` (24) apart; a live change stays marked for `--dur-linger` (4000). Loops have their own: `--dur-blink` (rack link lights) and `--dur-flow` (signal flow you start). `--dur-pulse` is retired: nothing on a working page loops. The curve is `--ease-settle`. Scripts read the same values from `window.rsMotion()`.

- **Why:** one rhythm reads as one system, and one edit retunes it.
- **Do:** `transition: background var(--dur-state) var(--ease-settle)`.
- **Don't:** `transition: all .3s ease`, or a number typed into a script.

### M2. Four moves: persist, enter, exit, state

A thing on both views moves and resizes into its new place. A new thing grows from nothing at its own centre, a beat after the moving ones start. A leaving thing shrinks to its own centre, quickly, and takes no clicks. A change of colour or status eases in place.

- **Why:** people see what moved, arrived and left without reading.
- **Do:** give a shared thing the same key on both views (`data-vk`, `data-k`, a port `id`).
- **Don't:** fade everything out and in, or fly things in from off screen.

### M3. Nothing overshoots

Everything decelerates into place on one curve. No springs, no bounce. Exceptions: a health glyph comes on once when it gets its result (M8), and spinners and signal flow run at an even speed. Nothing pulses: stillness means fine, and a fault is told by its shape and word.

- **Why:** bounce is noise in a tool used all day.
- **Do:** one curve for moves, enters and exits.
- **Don't:** a scale past 1 on arrival.

### M4. Inner layers stay inside

Parts on a device, ports on a panel and rows in a card share their container's curve and timing, and are clipped to it.

- **Why:** a part poking out of its body mid-move looks broken.
- **Do:** clip face parts to the body and ports to the chassis.
- **Don't:** give a child its own duration.

### M5. Movement has a direction, and what both pages share stays put

Between pages, what both pages have stays in place: the top bar, the sidebar and its marker, the place tabs and their marker, the page band (`PageBand` names itself `band`) and the filter bar (`fb`). So from one list to the next only the results change, and the title morphs into the next title. The rest of the page (`main`) leaves upward and the next rises in; going up the sidebar, up the path (a crumb, a space back to Spaces), or Back reverses it (`data-nav-dir` in `Shell.astro`). A clicked record flies into its page and back: mark its picture `data-vt-rec="<id>"` in the list and spread `recHere(id)` (`src/lib/vt.mjs`) on the element it becomes; the Shell pairs them just before the page changes and names nothing without a pair. Inside a page, the next tab or lesson comes from the side you moved towards (`DetailTabs` does this).

- **Why:** direction tells people where they went, and a thing that stays put is a thing they need not look for again.
- **Do:** at most 8 named view transition elements per page; one `PageBand` and one `FilterBar` per page.
- **Don't:** give list items permanent `view-transition-name`s, or name a record picture yourself.

### M6. Never jump

Switching a tab, filter, view or step never moves the page under the pointer. Wrap the swap in `window.rsHold(box, swap)`: the box keeps its height through the swap (so the scroll cannot jump), then eases to its new height over `--dur-morph` and lets go, so a short tab after a tall one leaves no blank space. While held, spare space collects at the bottom of the box (a grid never stretches its rows into it). If things should visibly move, call `window.rsMorphPanels(oldPanel, newPanel, heldSwap)`. The shared parts do this for you: `DetailTabs` for tabs, `FilterBar` for filters, Sort and the view switch, `Section` for "Show all", `SidePanel` (`window.rsPanelSwap`) for a detail column.

- **Why:** a jumping page loses people's place. "It should never jump."
- **Do:** hold every in-page swap.
- **Don't:** toggle `hidden` on panels of different heights without holding their box.

### M7. Reduced motion turns it off

With reduced motion on, nothing moves, and states still change at once. CSS is covered by `base.css` and `motion.css`; scripts must check `window.rsMotion().reduced` themselves. Glyphs are drawn at once, and the heartbeat's words still change.

- **Why:** [WCAG 2.2, 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html): motion makes some people ill.
- **Do:** guard every `el.animate()` and `startViewTransition()`. `node tools/motion-check.mjs --base <dev server>` walks the zoom, the palette, Settings › Modules and a port with reduced motion on and fails on any scripted animation.
- **Don't:** assume the CSS rule stops script animation. It doesn't.

### M8. Lights come on in turn

Health glyphs (`HealthGlyph.astro`, `.hg`; UI-V2 §6) arrive quiet, then come on once to their state, one after another (`--stagger` apart), as they scroll into view. The heartbeat ("checked 40 s ago") shows last. A later change of state eases in place over `--dur-state`. Nothing pulses, a fault included: the fault pulse and the radiating glow are retired.

- **Why:** it shows something was checked, not just asserted; and a still page reads as fine.
- **Do:** use `HealthGlyph` (or `glyph()` from `src/lib/health.mjs` in a script, `.hg-m` in an inline script), with a word beside it.
- **Don't:** invent another status dot, or loop anything on a working page.

### M9. When not to animate

Not text being read, not numbers changing every second, not things the person did not cause (lights and page entrances aside), not decoration on a loop. Stagger about 12 list items, then show the rest together.

- **Why:** motion that explains nothing hides motion that does.
- **Do:** ask "what changed?" If nothing did, nothing moves.
- **Don't:** add motion to make a page feel busy.

### M10. Live changes stay in place

When someone else changes something you are looking at, it stays where it is. The changed field or card eases to a highlight and back (`.is-changed`, `--dur-state`) with a small "Ruth, just now" mark that fades after `--dur-linger`: call `window.rsMarkChanged(el, who)`. If it moves to another column, hold the box (`rsHold`) and let it slide across with its `data-vk`.

- **Why:** shared, live work must not pull the page from under the person reading it.
- **Do:** change the one field, mark it, and say who.
- **Don't:** re-render the list, re-sort it, or move the scroll.

### M11. Opening things: one move, from where it came

Everything that opens makes one move from its origin, on the tokens. Peek cards grow from the hovered item (`--dur-pop`) and, when you move to the next item, slide there instead of closing and opening. Settings and the View as menu grow from the button that opened them and shrink back to it (`window.rsPopIn`, `rsPopOut`). The Report drawer slides in from the right (`--dur-page`). Search grows from the search button. Filter and Sort menus drop from their pill. A side panel's content cross-fades in place; the panel never slides. Checklist rows grow in (`.m-enter`). History entries and toasts rise from the bottom. Dialogs grow from the centre. Every exit uses `--dur-exit` and takes no clicks.

- **Why:** the move says where the thing came from, so people know how to put it back.
- **Do:** start the move at the control that opened it.
- **Don't:** fade a panel in from nowhere, or slide a side panel across the page.

### M12. Controls: one family of moves for everything that changes what you see

Every control that changes what is on screen (a filter, a view or scope switch, a tab, a setting, a look) uses the same few moves on the same tokens, so clicking through the console feels like one system. The shared parts and the Shell do this; a page only calls them.

| Control | What moves | How |
|---|---|---|
| A menu, list or card opens | It grows from its control (`--pop-scale` to full, `--dur-pop`) and shrinks back to it (`--dur-exit`) | `rsPopIn(el, from)`, `rsPopOut(el, from, done)`; filter lists do it in CSS |
| You pick an option | Its colour eases and its tick grows, in space that is always kept: no word in the list moves | `FilterBar` options, Sort |
| A segmented switch ("Me, My team, Everyone", "Day, Week, Month, Year", Settings) | One marker slides to the chosen word (`--dur-morph`) | `rsMarkerWatch(group, '[aria-pressed=true]')` |
| Filtering a list | Items that stay slide, new ones grow from their centre, leaving ones shrink to theirs where they were, the pills in the bar slide aside, the count eases in; the list box eases to its new height | `FilterBar` (`rsEnterEls`, `rsExitEls`, `rsHold`) |
| Switching a view, scope, step or person | The old view fades out where it was (`--dur-exit`) while the new one fades in (`--dur-enter`, from the side you stepped towards for a step); its box eases to the new height; if you had scrolled into the view, the new one starts at its top, just under the bar | `rsSwapBegin(old)` then `.end(new)`, or `rsSwap(box, redraw, { dir })` |
| A demo setting adds, removes or re-orders things (a module On, Connected or Off, agents, View as) | What leaves shrinks to its centre, what arrives grows from its centre, the rest (sidebar entries, place tabs, cards) slides; what you were looking at stays still on screen. A change that swaps the whole page (a page from a module that is switched off, the vendor gate) cross-fades the page instead | `rsSetStage(n)`, `rsSetAgents(v)`, `rsPickWho(id)` (all `rsChange`) |
| Zooming one level along the map (region, office, floor, space, device, port), by a click, the path or `[` and `]` | The clicked shape becomes the next page's picture on the zero-bounce spring (`--dur-zoom`, `--ease-spring` from `src/lib/spring.mjs`); the page behind scales to `--zoom-scale` and fades; the path's new step slides in from the right, and a lost one slides out. A shape on a drawing (a room on the plan) is stood in for by a plain box (`.rs-zoom-proxy`). Two levels at once is the ordinary page move. A second move starts from where the first is (`rsZoom`). Reduced motion: the pages cross-fade; the step is simply there | `src/lib/zoom-client.mjs`, `nav.css` |
| The palette (⌘K): Find, `>` Do, `?` Ask | Rows are drawn from memory on the keystroke's next frame and never animate while you type; `>` lists the page's own buttons (`data-verb`) and Enter presses the button | `SearchOverlay.astro`, `src/lib/verbs.mjs` |
| Take, Hand to, Park, Resume (the With chip, MOTION-V2 4.17) | The chip's words and mark slide out to the left and the new ones in from the right along one line while its width eases, on a critically damped spring (`--dur-chip`, `src/lib/spring.mjs`); a second change mid-slide retargets from where the chip is, at its speed. The row then moves to its new list (persist), arrives (enter) or leaves (exit), the box held so nothing jumps; on another window the chip changes in place with a "Liam, just now" mark (M10). Reduced motion: the words swap at once | `setChip()` in `src/lib/withchip.mjs`; `morph()` in `src/lib/home-client.mjs` |
| Park or Hand to opens its short form in the row (4.20) | The form grows from the button that opened it (`--dur-pop`) inside a held box and shrinks away on Cancel or Escape (`--dur-exit`) | `openEdit()` in `src/lib/home-client.mjs` |
| A new signal on Home (4.15) | Three things, once: the answer sentence cross-fades, the one figure eases to its tone, the row enters at its centre; a P1 also flashes the band's lower edge once (`--dur-flash`). Nothing pulses afterwards | `signal()` in `src/lib/home-client.mjs` |
| Welcome back, Start the day (4.26) | The handover card's four places come in together a stagger apart; Start the day shrinks the card away while Home grows in (`rsChange`) | `HandoverCard.astro`, `rsChange` |
| Density (4.25) and Open pages like this here (4.27) | Density: rows and cards ease to their new size together, holding what you were looking at (`rsChange`). Depth: the words change at once and go back after `--dur-linger`; a page opening at a remembered layer lands there with no scroll animation | `SettingsPersonal.astro`, `OpenHere.astro` |
| A look, or light and dark | One calm cross-fade of the whole page (`--dur-theme`, View Transitions), after the look's fonts have loaded; nothing else moves or eases on its own meanwhile; what you were looking at stays still | `rsTheme(update, skin)` |

- **The filter bar's shape depends on its width only.** It is laid out with everything at its widest (Clear all, Sort, the longest count, a choice named in every pill) and again only when its width changes, so no pick and no view switch re-lays it. A pill naming long choices shortens them with an ellipsis. A choice that does not apply to a view is switched off in place, never removed (Sort outside Week on the Schedule).
- **Settings keeps one size.** Every note sits in the same place, so choosing never resizes it, and its top edge stays put under the pointer.
- **Why:** everything should be smooth, even changing a theme, even changing the demo, even when you show and hide agents; motion that is not cohesive reads as unfinished.
- **Do:** call the shared moves; start a move at the control that caused it; keep the pointer's target still.
- **Don't:** reload a page to show a setting, toggle `display` on things a setting adds without `rsChange`, or let a control's own bar or menu change shape as you use it.

