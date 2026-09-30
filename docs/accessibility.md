# Accessibility

Keia Atlas should work for everyone who looks after a workplace: with a keyboard, a screen reader, larger text, high contrast, or less motion. This page says what works today, how to change it, what does not work yet, and how to tell us.

Written 30 September 2026, for the v0.1 preview. The rooms' own accessibility (hearing loops, step-free access) is product data in `data/accessibility/`, not this page.

## Our aim

We aim for [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA, which is also what the European Accessibility Act asks for through the standard EN 301 549. Keia Atlas **partly conforms**: the checks below pass, and the gaps listed further down are known and open.

## Change it for yourself

Open **Settings** (the gear at the bottom of the sidebar, or at the top right on a phone) and go to **Accessibility**. Every choice applies at once, and you switch it back the same way. The choices are kept in this browser, for you, whoever you view the demo as.

| Setting | What it does |
|---|---|
| Motion: Follow my device | The default. If your device asks for reduced motion, Keia Atlas does too. |
| Motion: Reduced | Short fades only. Nothing slides, grows or zooms. |
| Motion: Off | Nothing moves at all. Every change is instant. |
| Text size: Larger, Largest | All text 15% or 30% bigger, and everything that sits beside text grows with it: status marks, icons, avatars, buttons and the columns they sit in. Marks on a floor plan or in a drawing keep the drawing's scale. Pages reflow to fit, down to a 375 px phone. |
| High contrast | The High contrast look: darker text, stronger lines, a bolder focus ring. |
| Stronger outlines and focus rings | Lines drawn in a text colour, and a thicker focus ring with a halo, on any look. |
| Underline links | Every text link is underlined, not only told by its colour. |
| Status shown with words | The word (Fine, Fault, To review, Not reporting, In progress, Planned, Off) beside every status mark. |
| Keep things still | The moving pictures on the front page start paused, on their finished frame, and nothing on a page slides, grows or draws in by itself. |

Your browser's own zoom also works: the pages we checked reflow down to 320 px wide (400% zoom on a laptop) without scrolling sideways.

## Moving pictures

The front page is the one place that moves on its own. Each moving picture has a small pause button in its corner, and the footer has **Pause animations** for all of them. Pausing stops the picture where it is; play carries on from that point. Pause animations is kept, so the next visit starts still. With Motion at Reduced or Off, nothing plays: each picture shows its finished frame, and the 3D office is the drawn floor plan with its words.

Inside the console nothing loops. Things move only when you cause them, once, and each move has a still version under reduced motion.

## What works

- **Keyboard.** On the pages we checked, every control can be reached and used with the keyboard, in a sensible order. "Skip to content" is the first stop on every page. Menus and dialogs close with Escape and give focus back to what opened them. Nothing traps focus.
- **Focus you can see.** A focus ring on every control, never hidden under the sticky top bar, the filter bar or the phone's tab bar.
- **Screen readers.** Pages have landmarks (banner, navigation, main) and headings in order. Controls, pictures and status marks are named. Drawings name what they show, or are hidden when the same facts are written beside them.
- **Status by shape and word.** Each state has its own shape: a closed ring for Fine, a notch for To review, a broken ring with a dot for Fault, dashes for Not reporting, an open arc for In progress, a thin ring for Planned, a slash for Off. Colour only adds to the shape and the word.
- **Live updates stay quiet.** Words that change on their own are not read out over and over: "who else is here" speaks only when it changes, and the front page's pictures are silent while they play by themselves.
- **Contrast.** Text meets 4.5:1 (large text 3:1) in Studio, light and dark, and in High contrast, on the pages we checked; the health colours of every look are checked on every build (`npm run contrast`).
- **Targets.** On the pages we checked, controls are at least 24 by 24 px, or have that much space around them, and icon buttons grow with Text size.
- **Icons follow the text.** At Larger and Largest, every status mark, icon and avatar beside text is 15% or 30% bigger too, so a mark never looks small against its words; the rule is in [docs/rules/looks.md](rules/looks.md), T5.
- **Dragging.** Anything you can drag (a card on a project board, a job onto the schedule) can also be done with a button or a menu.

## How we checked

- [axe-core](https://github.com/dequelabs/axe-core) 4.13 in WebKit (Playwright) on one page of each kind: Home, the front page, an office, a space, a device, an incident, Support, the Schedule, Standards, the Method, the Settings dialog, a room guide and this page. At 1440 px and 375 px, light and dark, and again with every accessibility setting on.
- A keyboard walk through the same pages: every stop has a visible ring and none is hidden under a sticky bar.
- Reflow at 375 px with each text size, and at 320 px: no page scrolls sideways.
- Text size on the incident page, Home, a device, the Support queue and the sidebar, at 1440 px and 375 px, in Enterprise dark and Studio light: every icon beside text measured at Default and Largest grows by 1.3; the floor thumbnails' marks do not. `npm test` checks that a health glyph renders at 1.3 times its size at Largest and a floor-map marker does not.
- The motion check (`node tools/motion-check.mjs`) and a count of every scripted move under Reduced and Off: none.
- `npm test` covers the settings reaching the page before it paints, Motion Off stopping every transition and scripted move, and the reduced-motion rules applying to Reduced and Off.

| axe-core, 13 pages | Before (30 Sept) | After |
|---|---|---|
| Light, 1440 px | 6 issues on 31 elements | none |
| Dark, 1440 px | 12 issues on 78 elements | none |
| Dark, 375 px | not run | none |
| Every setting on, 375 px | not run | none |

Before, the issues were: links too faint in dark mode (every look but Enterprise), a list role on the front page's stage strip, list items inside chart pictures, one heading level skipped in the space key, a priority pill and a fault line below 4.5:1, and an unnamed device drawing. The keyboard walk also found rows whose focus was only a faint tint, a wiring diagram whose focusable parts sat inside one picture, and a history drawer that did not give focus back. All are fixed.

## Known gaps

- **Not yet tested with people or screen readers.** The checks above are automatic or by keyboard. We have not yet tested with VoiceOver, NVDA or JAWS, or with disabled users.
- **Floor plans and drawings.** Plans, room drawings and the 3D views are pictures first. Each space on a plan can be reached by keyboard and says its name and state, and the same facts are in lists on the page, but a plan cannot be explored by a screen reader the way it is seen.
- **Text in drawings.** Larger text scales the words in drawings drawn with CSS, not words fixed inside a drawing's own size. Marks on plans and drawings keep the drawing's scale on purpose, so they stay in their rooms.
- **Timeline dots.** Plain dots on a drawn rail (a device's life, a project's steps) keep their size, so they stay on the rail; the words and status marks beside them grow.
- **Status words on floor thumbnails.** On Home's small floor pictures, the word shows beside marks that are not Fine; Fine marks stay shapes, so the picture stays readable.
- **Fine and Planned** differ by the ring's weight (thick or thin) as well as colour; at 12 px the difference is small. The word setting removes the doubt.
- **The heartbeat** ("checked 40 s ago") changes its words every 10 seconds. It is not read out and does not move, but Pause animations does not stop it.
- **Exports.** Work reports downloaded as HTML or Markdown have not been checked.
- **Other looks.** Enterprise, Drawing set and Playful were not part of the axe runs; their link colour in dark mode was fixed with the rest.
- **Settings are per browser.** They are not yet kept with your sign-in, because the demo has none.

## Tell us about a problem

Open an issue at [github.com/kb35/keia-atlas/issues](https://github.com/kb35/keia-atlas/issues) and start the title with "Accessibility". Say which page, what you were trying to do, and what you use (browser, screen reader, zoom, settings). A screenshot or a short recording helps. If you cannot use GitHub, say so in [Discussions](https://github.com/kb35/keia-atlas/discussions) or ask someone to open the issue for you.
