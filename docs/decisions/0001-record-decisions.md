# 0001. Record design decisions

- Status: Accepted
- Date: 2026-09-27

## Context

Keia Atlas is being rebuilt from a working prototype. A lot of the value is in the reasoning: why the data looks the way it does, why one tool over another. Code shows what was built, not why.

## Decision

Every decision that shapes the project gets a short record in `docs/decisions/`, numbered in order, using Michael Nygard's format: context, decision, consequences.

## Consequences

- Anyone reading the repo can follow the reasoning, not just the result.
- A decision that turns out wrong is replaced by a new record, not quietly edited, so the history stays honest.
- Small cost: each real decision takes a few minutes to write down.

Source: [Architectural Decision Records](https://adr.github.io/).
