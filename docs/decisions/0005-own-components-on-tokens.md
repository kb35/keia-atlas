# 0005. Own components on design tokens

- Status: Accepted
- Date: 2026-09-27

## Context

Keia Atlas has five themes: Enterprise (a neutral, dense look in slate and blue), Classic, High contrast, Drawing set and Control room. They differ in structure as well as colour: Drawing set uses title blocks and outline drawings, and Control room is dense and status-first.

The prototype hard-coded borders and shadows in about 100 places, so every extra theme needed generated overrides.

Options considered:

1. A third-party component library (PatternFly was the one looked at) for everything. Enterprise comes almost free and accessible, but the other four themes would have to reshape its components through its tokens.
2. A small set of Keia Atlas components where every colour, border, radius, shadow and font comes from a Keia Atlas design token. In Enterprise the status colours take their values from PatternFly 6's design tokens (MIT), and the rest is a neutral slate and blue palette.

## Decision

Option 2. A theme is one token file plus a few structural rules, switched by data attributes on the root element.

## Consequences

- Adding or changing a theme doesn't touch component code.
- Enterprise needs no brand of its own: it is a neutral palette (slate and deep blue, one accent) set in an open font, and its text colours are checked against WCAG AA.
- We own keyboard and screen-reader behaviour for components like tabs and menus, and test it ourselves.

Source: [PatternFly: Design tokens overview](https://www.patternfly.org/foundations-and-styles/design-tokens/overview/).
