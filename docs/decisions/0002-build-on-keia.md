# 0002. Build on Keia as a pinned submodule

- Status: Accepted
- Date: 2026-09-27

## Context

[Keia](https://github.com/kb35/keia) already defines how to describe an environment and the things in it: composite profiles (what a correctly built space contains), object profiles (a class of device and how to check its health), configuration profiles, source entries and target states. Keia Atlas needs all of those ideas, plus some of its own: device models with ports, sites, spaces, wiring and refresh plans.

Keia has no release tags yet, so "the latest Keia" can change under us at any time.

## Decision

- Keia is included as a Git submodule at `vendor/keia`, pinned to one exact commit.
- Keia Atlas never edits Keia. Keia Atlas-only concepts live as extension schemas in `schemas/ext/`.
- Moving to a newer Keia is a deliberate change: update the pin, run the checks, commit.

## Consequences

- Keia Atlas content that uses Keia's types stays valid Keia content, so it could be contributed back later.
- A change in Keia can't break Keia Atlas by surprise.
- Cloning the repo needs `git clone --recurse-submodules`, or `git submodule update --init` afterwards.

Source: [Pro Git: Submodules](https://git-scm.com/book/en/v2/Git-Tools-Submodules).
