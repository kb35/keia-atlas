# The Keia Atlas rule book

How Keia Atlas moves, lays out a page, draws a device or a space, and words things. Anyone adding to Keia Atlas, or starting a sister project in the same design language, follows it. Each rule has a number, a why, a do and a don't. The app shows the book with live examples under About, The rule book (`/about/rules/`).

## The book on one page

**Motion.** Every duration and curve is a token. Four moves: persist (moves into place), enter (grows from its centre), exit (shrinks to its centre), state (colour eases in place). Between pages what both share stays put and a clicked record flies into its page. Nothing overshoots or blocks a click, the page never jumps, and reduced motion turns it all off.

**Layout.** Every page has the same slots in the same order: path, place tabs, band, filter bar, main area, sections. The top of the page is the answer in priority order; the page then scrolls as one, and nothing scrolls inside it. Cards line up on one grid, and deep pages show a path you can climb. Every hover has a click. Phones never scroll sideways.

**Devices.** Data first. Drawn front-on from the vendor's picture, to scale, with the same parts in the same order so models morph. Ports coloured by signal. State beside the drawing, never on it.

**Spaces.** To scale in metres, one viewpoint, a numbered key, outlets in the site's plug type, wiring left to right.

**Platform.** Find and filter on every list; search, Report, View as and Help on every page; simulated data says so; nothing is deleted, and actions can be undone. Every number on a summary opens the list it counts, filtered, showing the same count; overviews never grow a list in place.

**Words.** Plain English, glossary words used exactly, no internal names, no em dashes. Filter bars, buttons, status words, the simulated tag and the overline are worded the same on every page.

**Looks and tokens.** Tokens only. Five looks, light and dark, WCAG AA contrast.

**Data.** YAML checked by schema at build time. Every fact has a source; unknown is allowed, a guess is not.

## Chapters

1. [Motion](motion.md)
2. [Layout](layout.md)
3. [Devices](devices.md)
4. [Spaces](rooms.md)
5. [Platform pages](platform.md)
6. [Words](words.md)
7. [Looks and tokens](looks.md)
8. [Data](data.md)
9. [Known gaps](gaps.md)

## Using the book

Read the chapter for what you are adding, then check your work against every "Don't". If a rule is wrong, change it in the same change as the code, with a decision record in `docs/decisions/` if it changes how Keia Atlas works. Code that breaks a rule and cannot be fixed now goes in Known gaps.
