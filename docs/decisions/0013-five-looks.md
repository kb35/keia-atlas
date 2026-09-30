# 0013. Five looks, one set of components

- Status: Accepted
- Date: 2026-09-27

## Context

The prototype had five visual looks: the original warm-paper Classic, a neutral, dense Enterprise look, a high contrast variant, a Drawing set styled like an AV drawing package, and a dark Control room. They show that the design is a system rather than one skin, and give people a choice that suits their eyes and screen.

Keeping five copies of every component in step would be slow and error-prone.

## Decision

- Components use design tokens only (colours, fonts, radii, borders, shadows, sizes). Each look is one CSS file that sets the same tokens under an attribute on the page root: `data-look` for the look, `data-contrast` for high contrast, `data-theme` for a forced light or dark mode.
- Enterprise needs no attribute to work (it is the fallback when none is set). Studio became the default later (0016).
- A small script in the page head reads the saved choice and sets those attributes before the first paint, so the page never flashes the wrong look. Extra web fonts are fetched only for the look that needs them.
- Settings is a native `<dialog>` with radio buttons, so it works with the keyboard and screen readers without extra code. Choices are saved in this browser only.
- Every look's text colours pass WCAG AA contrast (4.5:1) against its surfaces, checked with a small script.

## Consequences

- A new page gets all five looks for free.
- A new look is one file of tokens.
- The Control room look is always dark, so the light and dark switch has no effect there, and Settings says so.

Sources: [WCAG 2.2, contrast (minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [The dialog element (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog), [Using CSS custom properties (MDN)](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties).
