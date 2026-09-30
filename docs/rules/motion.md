# Motion

Motion explains a change. Something moves because it went somewhere, arrived, left or changed state; if nothing changed, nothing moves. This is the v2 motion system (MOTION-V2). Tokens and the shared moves are in `src/styles/motion.css`; the interaction layer (hover, press, focus, skeletons, toasts, lists appearing) is in `src/styles/craft.css` and `src/components/Motion.astro`; the shared scripts (`rsMotion`, `rsHold`, `rsMorphPanels`, and the controls family in M12: `rsTheme`, `rsChange`, `rsSwapBegin`, `rsMarker`, `rsPopIn`) are in `src/layouts/Shell.astro`; zero-bounce springs are in `src/lib/spring.mjs`.

### M1. Durations and curves are tokens

Every move uses a token; nothing types a number. Scripts read the same values from `window.rsMotion()` (or `motion()` in `src/lib/motion-read.mjs` outside the Shell).

| Token | Value | For |
|---|---|---|
| `--ease-settle` | `cubic-bezier(.22, 1, .36, 1)` | Every CSS move, enter and state change |
| `--ease-exit` | `cubic-bezier(.4, 0, 1, 1)` | Leaving things accelerate away |
| `--ease-spring` | a `linear()` curve | The zero-bounce spring for CSS, written by the Shell from `src/lib/spring.mjs`; pair it with `--spring-settle`, `--spring-snap` or `--dur-zoom` |
| `--dur-press` | 80 ms | Press feedback |
| `--dur-hover` | 140 ms | Hover and focus feedback |
| `--dur-pop` | 200 ms | Menus, peeks, the palette, the How card |
| `--dur-exit` | 240 ms | Everything that leaves |
| `--dur-state` | 300 ms | A glyph, a chip, a figure's tone changing in place |
| `--dur-chip` | 320 ms | The With chip sliding between states |
| `--dur-zoom` | 360 ms | One zoom level, in or out |
| `--dur-theme` | 360 ms | Look, light and dark |
| `--dur-page` | 420 ms | Page to page on the same level |
| `--dur-enter` | 440 ms | A new thing growing from its centre |
| `--dur-morph` | 520 ms | In-page morphs: a box easing to a new height, a drawing changing |
| `--dur-flash` | 800 ms | A light coming on, once (M8) |
| `--replay-step` | 600 ms | One frame of Replay while playing |
| `--dur-linger` | 4000 ms | A live-change mark (M10) |
| `--dur-flow` | 800 ms | Signal flow, only while the person has switched it on |
| `--stagger` | 24 ms | Between list items, at most 12 |
| `--pop-scale` | .94 | Where a menu or peek grows from |
| `--spring-settle` | 360 ms, bounce 0 | Scripted moves: zoom, drag, scrub, chip retarget; the move is done at 360 ms |
| `--spring-snap` | 200 ms, bounce 0 | Releasing a drag onto a snap point |
| `--press-scale` | .97 | A pressed button, chip or card |
| `--peek-rest` | 200 ms | How long the pointer rests before a peek grows |
| `--skeleton-max` | 400 ms | The longest a skeleton shows |
| `--skeleton-skip` | 100 ms | Content ready sooner than this skips the skeleton |
| `--toast-stay` | 4000 ms | How long a toast stays |

Retired: `--dur-pulse` (the fault pulse), `--dur-blink` (rack link lights), `--dur-fill` (bars filling to their value), and every loop on a working page.

- **Why:** one rhythm reads as one system, and one edit retunes it.
- **Do:** `transition: background-color var(--dur-hover) var(--ease-settle)`; an exit on `--ease-exit`.
- **Don't:** `transition: all .3s ease`, or a number typed into a script.

### M2. Five moves: persist, enter, exit, state, transform

A thing on both views moves and resizes into its new place (persist, `--dur-morph` or `--dur-page`). A new thing grows from nothing at its own centre, one beat (`--stagger`) after the moving ones start (enter, `--dur-enter`). A leaving thing shrinks to its own centre, quickly, on `--ease-exit`, and takes no clicks (exit, `--dur-exit`). A change of colour, shape or status eases in place, once (state, `--dur-state`). A container becomes the next container: the clicked shape's box tweens to the destination's picture box while the content cross-fades inside it (transform, `--dur-page` for a card to its page, `--dur-zoom` between zoom levels, `--spring-settle` when scripted).

- **Why:** people see what moved, arrived and left without reading.
- **Do:** give a shared thing the same key on both views (`data-vk`, `data-k`, a port `id`); mark a card's picture `data-vt-rec` and its page's picture `recHere(id)`.
- **Don't:** fade everything out and in, or fly things in from off screen.

### M3. Nothing overshoots, and everything can be interrupted

CSS moves decelerate into place on `--ease-settle`. Scripted and gesture moves use a critically damped spring (`spring`, `springEasing` and `retarget` in `src/lib/spring.mjs`): a spring described by its duration with zero bounce never overshoots, and when it is retargeted mid-flight it keeps its velocity, so a move you interrupt reads as one motion. Nothing scales past 1 on arrival, nothing pulses: stillness means fine, and a fault is told by its shape and word.

- **Why:** bounce is noise in a tool used all day; a restart mid-move looks like a glitch.
- **Do:** `el.animate(frames, { duration: M.springSettle, easing: M.spring })`, and start a second move from `retarget(state, now)`.
- **Don't:** a keyframe past 100%, or a bounce value.

### M4. Inner layers stay inside

Parts on a device, ports on a panel and rows in a card share their container's curve and timing, and are clipped to it.

- **Why:** a part poking out of its body mid-move looks broken.
- **Do:** clip face parts to the body and ports to the chassis.
- **Don't:** give a child its own duration.

### M5. Movement has a direction, and what both pages share stays put

Between pages, what both pages have stays in place: the top bar, the sidebar and its marker, the place tabs and their marker, the page band (`PageBand` names itself `band`) and the filter bar (`fb`). The rest of the page (`main`) leaves upward and the next rises in; going up the sidebar, up the path, or Back reverses it (`data-nav-dir` in `Shell.astro`). A clicked record transforms into its page: mark its picture `data-vt-rec="<id>"` in the list and spread `recHere(id)` (`src/lib/vt.mjs`) on the element it becomes; the Shell pairs them just before the page changes and names nothing without a pair. Inside a page, the next tab comes from the side you moved towards (`DetailTabs` does this).

- **Why:** direction tells people where they went, and a thing that stays put is a thing they need not look for again.
- **Do:** at most 8 named view transition elements per page; one `PageBand` and one `FilterBar` per page.
- **Don't:** give list items permanent `view-transition-name`s, or name a record picture yourself.

### M6. Never jump

Switching a tab, filter, view or step never moves the page under the pointer. Wrap the swap in `window.rsHold(box, swap)`: the box keeps its height through the swap (so the scroll cannot jump), then eases to its new height over `--dur-morph` and lets go. A height is the one layout property that may animate, and only on one held box. The shared parts do this for you: `DetailTabs` for tabs, `FilterBar` for filters, Sort and the view switch, `Section` for "Show all", `SidePanel` (`window.rsPanelSwap`) for a detail column.

- **Why:** a jumping page loses people's place. "It should never jump."
- **Do:** hold every in-page swap.
- **Don't:** toggle `hidden` on panels of different heights without holding their box.

### M7. Reduced motion is a second design, not the animations off

With reduced motion on, every meaning survives: travel and zoom become a cross-fade, a state change is instant, the heartbeat still updates its words, and a reduced page reaches its final state sooner than the full one. CSS is covered by `base.css`, `motion.css` and `craft.css`; scripts check `window.rsMotion().reduced` themselves. Each row of the table in M13 names its reduced equivalent.

- **Why:** [WCAG 2.2, 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html): motion makes some people ill.
- **Do:** guard every `el.animate()` and `startViewTransition()`: `if (M.reduced) { apply(); return; }`. `node tools/motion-check.mjs --base <dev server>` walks the zoom, the palette, Settings › Modules and a port with reduced motion on and fails on any scripted animation.
- **Don't:** assume the CSS rule stops script animation. It doesn't.

### M8. Lights come on in turn

Health glyphs (`HealthGlyph.astro`, `.hg`; UI-V2 section 6) arrive quiet, then come on once to their state, one after another (`--stagger` apart), as they scroll into view. The heartbeat ("checked 40 s ago") shows last. A later change of state eases in place over `--dur-state`. A check that is running shows the In progress arc, still; there is no spinner.

- **Why:** it shows something was checked, not just asserted; and a still page reads as fine.
- **Do:** use `HealthGlyph` (or `glyph()` from `src/lib/health.mjs` in a script, `.hg-m` in an inline script), with a word beside it.
- **Don't:** invent another status dot, spin anything, or loop anything on a working page.

### M9. When not to animate

Not text being read. Not numbers: a figure changes in place, never counts up, and a bar is drawn at its value. Not charts, sparklines or small multiples: they are drawn still and updated by redraw. Not things the person did not cause, with three exceptions that happen once: glyphs coming on at load, a new signal, a live change by a colleague. Not decoration on a loop. Stagger at most 12 list items, then show the rest together.

- **Why:** motion that explains nothing hides motion that does; and data is read from still pictures.
- **Do:** ask "what changed?" If nothing did, nothing moves.
- **Don't:** add motion to make a page feel busy.

### M10. Live changes stay in place

When someone else changes something you are looking at, it stays where it is. The changed field or card eases to a highlight and back (`.is-changed`, `--dur-state`) with a small "Ruth, just now" mark that fades after `--dur-linger`: call `window.rsMarkChanged(el, who)`. If it moves to another column, hold the box (`rsHold`) and let it slide across with its `data-vk`.

- **Why:** shared, live work must not pull the page from under the person reading it.
- **Do:** change the one field, mark it, and say who.
- **Don't:** re-render the list, re-sort it, or move the scroll.

### M11. Opening things: one move, from where it came

Everything that opens makes one move from its origin. Peek cards grow from the hovered item (`--dur-pop`, after `--peek-rest` of rest) and, when you move to the next item, slide there instead of closing and opening. Settings and the View as menu grow from the button that opened them and shrink back to it (`window.rsPopIn`, `rsPopOut`). Search grows from the search button. Filter and Sort menus drop from their pill. A side panel's content cross-fades in place; the panel never slides. Toasts rise from the bottom (`window.rsToast`). Every exit uses `--dur-exit` on `--ease-exit` and takes no clicks.

- **Why:** the move says where the thing came from, so people know how to put it back.
- **Do:** start the move at the control that opened it.
- **Don't:** fade a panel in from nowhere, or slide a side panel across the page.

### M12. Controls: one family of moves for everything that changes what you see

Every control that changes what is on screen uses the same few moves on the same tokens. The shared parts and the Shell do this; a page only calls them.

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
| A look, or light and dark | One calm cross-fade of the whole page (`--dur-theme`, View Transitions), after the look's fonts have loaded; nothing else moves or eases on its own meanwhile; what you were looking at stays still | `rsTheme(update, skin)` |
| Density | Rows and cards ease to their new size together; the element under the pointer stays put | `rsSetDensity(v)` |

- **The filter bar's shape depends on its width only.** It is laid out with everything at its widest and again only when its width changes, so no pick and no view switch re-lays it.
- **Why:** motion that is not cohesive reads as unfinished.
- **Do:** call the shared moves; start a move at the control that caused it; keep the pointer's target still.
- **Don't:** reload a page to show a setting, or let a control's own bar or menu change shape as you use it.

### M13. Every interaction has one row

Each interaction on a page is one of these rows (MOTION-V2 section 4), with its reduced-motion equivalent. A new interaction adds a row in the same change.

| # | Interaction | Full motion | Reduced motion |
|---|---|---|---|
| 1 | Hover a row, card, glyph or link | Background eases to `--surface-2` in `--dur-hover`; a peek grows from the item in `--dur-pop` after `--peek-rest`; moving to the next item slides the peek there | Background changes at once; the peek appears at once |
| 2 | Press a button, chip, card or row | Buttons, chips and cards scale to `--press-scale` in `--dur-press`, back on release; a primary button also darkens; a full-width row darkens instead of scaling | No scale; darkens at once |
| 3 | Focus (keyboard) | Focus ring appears at once, never obscured by a sticky bar | Same |
| 4 | Open or close a section, "Show all", a DetailTab | `rsHold`: the box keeps its height, then eases to the new height in `--dur-morph`; new rows enter `--stagger` apart up to 12; a tab comes from the side you moved towards | Height and rows change at once |
| 5 | Card to page | Transform: the card's picture tweens to the page's picture over `--dur-page` while `main` leaves upward and the next rises in; the band stays | Cross-fade of `main` |
| 6 | Zoom in one level | Transform over `--dur-zoom` on `--spring-settle`: the clicked shape grows into the destination picture; the parent scales to 1.06 and fades beneath it | Cross-fade |
| 7 | Zoom out one level | The reverse | Reverse cross-fade |
| 8 | Change floor on a plan | The plans cross-fade in `--dur-state`; the floor marker slides | Swap at once |
| 9 | Lens switch | The marker slides in `--dur-morph`; every glyph eases to its new state together | At once |
| 10 | Select a space on the plan | A 2 px accent outline eases in over `--dur-state`; the side panel's content cross-fades in place (`rsPanelSwap`); the plan never pans | Outline and content at once |
| 11 | Page to page on the same level | `main` leaves upward and the next rises in over `--dur-page`; frame, band and filter bar stay | Cross-fade |
| 12 | Loading | Slots drawn at final size with a still `--surface-2` wash for at most `--skeleton-max`, then content cross-fades in over `--dur-state`; skipped when ready within `--skeleton-skip`; glyphs then come on in turn; the heartbeat last. Never a spinner for the page | Skeleton to content at once |
| 13 | The heartbeat ticking | The words change every 10 s, no motion | Same |
| 14 | A feed goes stale | The heartbeat's words change to "Not reporting since …" and ease to fault ink; the nearest glyph turns dashed. Once | At once |
| 15 | A new signal | Three things change once, together, in `--dur-state`: the band's sentence, the one figure's tone, the glyph. A needed row enters at its centre | At once |
| 16 | A signal clears | The same three ease back, once; a row no longer needed exits | At once |
| 17 | Take, Hand to, Park, Resume (the With chip) | The chip's text slides out and the new in, `--dur-chip` on `--spring-settle`; a second hand-off retargets | Text swaps at once |
| 18 | Priority changed with a reason | The pill's colour eases; the reason line enters below | At once |
| 19 | Run a standing rule | The button's words become the state at once ("Running · read back in 40 s"); the glyph becomes In progress, still, then Fine or Fault once | Same, without easing |
| 20 | "How was this done?" opens | Grows from the words clicked (`--dur-pop`), shrinks back on close | At once |
| 21 | The palette (⌘K) | Grows from the search button; first results painted before the move; typing re-renders with no motion | At once |
| 22 | Filter, Sort, view switch | As M12 | Items swap at once |
| 23 | Toasts | Rise from the bottom (`--dur-enter`), stay `--toast-stay` or until dismissed, exit downward (`--dur-exit`); one at a time, a second replaces the first in place; never the only place a fact is shown | At once |
| 24 | Look, light and dark | One cross-fade (`--dur-theme`) | At once |
| 25 | Density | Rows and cards ease to their new size together; the scroll holds on the element under the pointer | At once |
| 26 | A module On, Connected or Off; View as | `rsChange` | At once |
| 27 | "Open pages like this here" | The line's words change, then fade back after `--dur-linger` | Same |
| 28 | Replay | A frame's glyphs ease in `--dur-state`; Play steps one frame per `--replay-step` | Frames change at once |
| 29 | Blast-radius explorer | Affected glyphs ease to the projection state together | At once |
| 30 | Signal flow on a drawing | Dashes travel only while "Show signals moving" is on; it turns itself off after 30 s or when the page changes | The path is lit, still |
| 31 | Live change by someone else | As M10 | Highlight and mark, no slide |
| 32 | Drag | Follows the pointer with no lag; on release, `--spring-snap` to the nearest snap point | Snaps at once |
| 33 | Wall mode | Nothing moves but a new signal and the heartbeat's words | Same |
| 34 | Front door: the strip and the five ideas | Each tile grows in once as it scrolls into view, `--stagger` apart | Present at once |
| 35 | Front door hero: the live plan | Glyphs on in turn, one breaks once, then the heartbeat; hover peeks; click zooms into the room | At once; the zoom is a cross-fade |

A list that appears with the page (a card grid, a list of rows) makes one quiet stagger, once: the first 12 items rise into place `--stagger` apart, the rest together; filtering, sorting and live changes never replay it.

- **Why:** a row per interaction is how one system stays one system.
- **Do:** find the row before you build; add one if nothing fits.
- **Don't:** invent a move for one page.

### M14. What never moves

- Text being read, and numbers changing.
- The band, the top bar, the sidebar, the place tabs and the filter bar between pages.
- The page under the pointer (M6).
- A fine glyph. Nothing that is fine pulses, breathes or glows.
- The floor plan: it never pans or zooms on its own.
- Sparklines, small multiples and charts: drawn still, updated by redraw.
- Focus rings and error text.
- An empty Restricted slot for a partner: drawn at once with its reason.

- **Why:** stillness is the designed state; a quiet screen means fine.
- **Do:** let the heartbeat's words prove the page is alive.
- **Don't:** animate something to show it is live.

### M15. Performance

| Budget | Value | How |
|---|---|---|
| Input to visible response | under 100 ms; the palette's first row under 50 ms | The new state paints first; the animation starts after, never before. Input never waits for a move |
| Animation frame | 60 fps on a 2020 laptop and a mid-range phone | Only `transform` and `opacity` animate; a height only inside `rsHold` on one box; `will-change` only for the move |
| Named view transitions | at most 8 per page | Lists never name items permanently |
| Concurrent moves | one transform, one set of state changes and one enter or exit group at a time | A second navigation cancels the first |
| Skeleton | at most 400 ms; skipped within 100 ms | Content arrives with the page; feeds fill in place |
| Motion weight | no library; `spring.mjs` about 2 KB | Web Animations API and View Transitions only |

- **Why:** a move that drops frames reads as slowness, not polish.
- **Do:** measure the heaviest move on a page with reduced CPU.
- **Don't:** animate `width`, `top`, `box-shadow` or `filter` on a list.
