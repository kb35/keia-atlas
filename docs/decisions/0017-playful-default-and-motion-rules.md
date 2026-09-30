# 0017. The playful look is the default, and one motion rule book

- Status: Accepted
- Date: 2026-09-28
- Supersedes parts of: [0016](0016-studio-look.md) (which look is the default, and the motion rules)

## Context

On review of Studio, the owner preferred the v3 prototype's playful design: ink outlines, hard offset shadows, graph paper, bold display type and the yellow check mark. He wanted it more stylistic than enterprise, with a stronger type hierarchy. He also saw no motion between pages, and ports that jumped rather than moved when switching models. He asked for one set of rules that every animation follows.

## Decision

- Classic, the prototype's look, comes back and is the default. Its values match the v3 prototype. The masthead is paper, not black, as in v3. The type scale is pushed further: 36 to 60 px titles in Bricolage Grotesque at weight 800 with tight tracking, and mono capitals for every label. Bricolage Grotesque, Instrument Sans and JetBrains Mono are self-hosted. Studio stays as an option.
- One motion rule book, in `src/styles/motion.css`:
  1. Persist: an element on both states moves and resizes into its new place.
  2. Enter: a new element grows from nothing at its own centre.
  3. Exit: a leaving element shrinks to nothing at its own centre, then goes.
  4. State: colour and state changes ease in place.
  Nothing overshoots. Inner layers never leave outer ones. Motion never blocks a click, and reduced motion turns it off.
- Ports follow it: shared ports slide; new ports grow in, a beat later and staggered; removed ports shrink away. The chassis grows from its centre. Drawing parts grow and shrink at their own centre, not the drawing's.
- Page to page uses Astro's client router, which runs a view transition on every navigation. The frame stays still. The page body leaves upward and the next rises in. The title morphs into the next title, the sidebar marker slides to the new section, and a clicked profile card's drawing flies into the profile's stage. At most 7 names are used per page.
- The port panel is drawn at one fixed scale, so a one-port device no longer balloons to fill the width.
- A static preview (plain files) uses relative links, and the router swaps a page in before it updates the address. So on that build a small loader fetches each page and makes its paths full addresses first.

## Consequences

- Five looks: Classic (default), Studio, Enterprise, High contrast, Drawing set. Control room stays retired.
- Browsers without view transitions still get the client router's fallback animation. The keyed in-page morph works everywhere.
- Opened from disk (file://), pages load normally without the morph, because browsers block fetching local files.

Sources: [Astro: View transitions and the client router](https://docs.astro.build/en/guides/view-transitions/), [Chrome for Developers: View transitions](https://developer.chrome.com/docs/web-platform/view-transitions), [MDN: transform-box](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-box).
