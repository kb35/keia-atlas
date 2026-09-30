# 0012. A task-first console site

- Status: Accepted
- Date: 2026-09-27

## Context

The data is complete enough to show: 20 space types, 40 device models, 8 sites, 176 spaces and 1,164 installed devices. An early preview listed it all as tables. It was accurate but hard to use: the reader had to know what to look for.

The people this is for (an engineer walking into a room, a manager planning next year) arrive with a question, not a table name.

## Decision

- Every page follows one template: a band with the title and one line of context, then the content, with a side card for facts at a glance.
- Pages lead with what needs attention (a replacement in progress, a site being fitted out) before listing everything else.
- Navigation follows how people think about a building: site, then room, then device, then port. Space types and device models are the catalogue behind it.
- Each space shows what is installed next to what its space type says should be there ("compared against").
- Device ports are drawn per face from the model's own port list, coloured by what they carry, with a table underneath for screen readers and detail.
- Motion uses the browser's View Transitions API: pages cross-fade, and port drawings morph when stepping between models of the same class. Everything is switched off when the system asks for reduced motion.
- On phones the left navigation becomes a bottom tab bar, and wide tables scroll sideways rather than squashing.
- Decision records are rendered as pages of the site, since the repository is private for now.

## Consequences

- A reader can answer "is this room right?" from one page.
- The page template is strict, so new pages are quick to add and look the same.
- View Transitions are not in every browser yet; where they are missing, pages simply load without the animation.

Sources: [View Transition API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API), [Astro: View transitions](https://docs.astro.build/en/guides/view-transitions/), [prefers-reduced-motion (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion).
