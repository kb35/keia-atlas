# 0004. A static site built with Astro

- Status: Accepted
- Date: 2026-09-27

## Context

The prototype is one hand-assembled HTML file. The rebuild needs a page per device model, space type, site and space, generated from the YAML, and it should be free and simple to host.

Options considered:

1. A plain build script that stitches HTML together, like the prototype. Nothing new to learn, but routing and templating get hand-rolled.
2. A single-page app that loads all the data into the browser. Smooth in-app motion, but one URL for everything.
3. A static site generator that reads the YAML at build time and writes finished pages.

## Decision

Option 3, using [Astro](https://docs.astro.build/en/guides/content-collections/). The site is hosted on GitHub Pages.

- The validator runs first and is the single gate. Astro only reads data that has already passed.
- Interactive parts (model morph, Settings) are small scripts on otherwise plain HTML and CSS.

## Consequences

- Every device, space and site gets its own link that can be shared.
- Hosting is static files: no server to run or patch.
- Astro is a Node dependency that needs keeping up to date.

Source: [Astro: Deploy to GitHub Pages](https://docs.astro.build/en/guides/deploy/github/).
