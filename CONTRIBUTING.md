# Contributing to Keia Atlas

Thank you for looking. Keia Atlas is Apache 2.0, Copyright Red Hat, Inc., created by Keith Brady. Contributions of every size are welcome: a corrected port on a device model, a new model, a fix to a page, a new connector, a better sentence in the help.

## Before you start

- Read `docs/rules/README.md`, the rule book on one page. Every rule has a number, a why, a do and a don't. Pull requests are reviewed against it.
- Read `docs/standards/page-anatomy.md` before touching a page and `docs/standards/new-device.md` before adding a device.
- Look at `docs/decisions/` for why things are the way they are. If you disagree with a decision, open an issue that names it.

## Proposing a change

1. **Open an issue first** for anything beyond a small fix: say what problem you have and how you work today. The roadmap is ordered by what real teams need.
2. **Fork and branch.** One change per branch, named for what it does.
3. **Make the change.** Keep to the files the change needs. Shared parts (`PageBand`, `FilterBar`, `DetailTabs`, `SidePanel`, `Section`, `EmptyState`, `Shell`, the motion and base stylesheets) change only with an issue agreed first, because every page depends on them.
4. **Check it:**

   ```sh
   npm run validate   # schemas and cross-reference checks
   npm test           # unit tests, help-key coverage, Keia drift check
   npm run build      # the whole site must build
   ```

   For a page: check it at 375, 768, 1024, 1280, 1440 and 1920 wide (`node tools/responsive-check.mjs`), in light and dark, and with reduced motion on.
5. **Open a pull request** that says what changed and why, with a screenshot for anything visual. Small, complete pull requests are merged faster than large ones.

## Optional: catch secrets before you commit

CI scans every push for secrets with [gitleaks](https://github.com/gitleaks/gitleaks). If you would like the same check on your own machine, before a secret ever leaves it, install gitleaks and add a pre-commit hook. Nothing here is required.

```sh
# .git/hooks/pre-commit  (then: chmod +x .git/hooks/pre-commit)
#!/bin/sh
gitleaks git --pre-commit --staged --redact --verbose
```

`npm run validate` also fails on any password, token or key field in `data/` that is not a vault reference.

## Adding a device model

Follow `docs/standards/new-device.md`. In short:

- Data first, from two independent readings of the manufacturer's public datasheet and manual, reconciled. Anything the sources do not state goes under `gaps`; nothing is guessed.
- Cite every document in `data/sources/` with the date you checked it. Store facts, summaries and links, never copies of the manufacturer's documents.
- One entry per physical port, with the shared port ids so drawings morph between models.
- A traced front-on drawing is welcome but optional; a model without one shows its class outline and says so.
- No brand logos beyond a plain shape; no text in drawings.

## House rules that matter most

- **No real internal data.** No real hostnames, serials, addresses, people, tickets or internal system names, ever, even in an example. Name systems by what they do or with a made-up name. The demo company is fictional; keep it that way.
- **Plain words.** Sentence case, the glossary's words used exactly, no em dashes. Irish English spelling in prose.
- **No mood words** (calm, effortless, seamless) and no pitch words in any public text; see [docs/keia-method.md](docs/keia-method.md) Level 3 for the vocabulary.
- **Tokens only.** Colours, durations and curves come from the tokens; no hard-coded values.
- **Every number drills down** to the list it counts; nothing expands in place on an overview.
- **Every hover has a click**, every drawing a text equivalent, reduced motion turns motion off.
- **Help on everything.** A new widget carries a `data-help` key with an entry in `src/lib/help.mjs`; `npm test` checks it.

## Sign your commits

This project uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO), as many open-source projects do. Sign off each commit to say you have the right to submit it under the project's licence:

```sh
git commit -s -m "Add the Poly Studio X72 model"
```

That adds a `Signed-off-by: Your Name <you@example.com>` line. Pull requests with unsigned commits are asked to add it.

## Code of conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/), version 2.1. Be direct and be decent. Report concerns through the contact in the repository's `CODE_OF_CONDUCT.md`.

## Licence

By contributing you agree that your code and data contributions are licensed under the Apache License 2.0, the same as the project, and that contributions to the Keia Method text ([docs/keia-method.md](docs/keia-method.md)) are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Device facts you add must come from public documents and be cited.

---

Copyright Red Hat, Inc. Created by Keith Brady. The Keia Method text is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Keia Atlas, the software that runs it, is Apache 2.0.
