# 0007. Space types before device models

- Status: Accepted
- Date: 2026-09-27

## Context

The first plan built one device model end to end (step 2), then the space types (step 3). That gives an early drawing, but it means choosing which devices matter before reading the guidelines that decide it.

## Decision

Build the space types first, from the published guidelines, then the device models they call for.

- Each space type lists its device classes (Keia's level) and, per build option, the exact models the guideline names (Keia Atlas's level).
- Model ids are written now, as the guideline names them. The validator starts checking them the moment the first device model exists, so step 3 has to supply every one.

## Consequences

- The device list comes from the source material, not from a guess.
- The first drawing of a device arrives one step later.
- Step 3 has a fixed, checkable to-do list: every model id named in `data/space-types/`.
