# 0023. The product is called Keia Atlas

- Status: Accepted
- Date: 2026-09-29, renamed 2026-09-30
- Replaces: the product name in commit 03b8585 ("Console")

## Context

The product was first called Keia, then Console, then Roomstate. Keia is the framework underneath, and its licence names a different copyright holder, so using the same name tied the two together. Console was a stopgap: a funded IT company already trades under that name at console.com. On 30 September 2026 the owner renamed the product from Roomstate to Keia Atlas (tagline "Space to work"), the workplace platform built on the Keia framework, and renamed the demo company from Hawthorn Technologies to Aigna.

## Decision

- The product is **Keia Atlas** everywhere it names itself: the brand in the sidebar, page titles, the About page, Learn, search, reports, glossary, the rule book and the Mac launcher (`Open Keia Atlas.command`).
- The About page keeps its credit to the Keia framework, which supplies the core vocabulary. Keia Atlas is built on the Keia framework.
- "Console" stays only where it means the hardware: console ports and console cables.
- Internal identifiers such as `window.KeiaSearch` are not renamed; nobody sees them.

## Consequences

- One name for the repo, the product and the site path (`/keia-atlas/`).
- The data block that older files called `roomstate:` is now `keia_atlas:`, and the asset tag prefix `HT-` is now `AG-`.
- Code comments that describe the Keia framework itself (object profiles, lifecycle stages) still say Keia, on purpose.
