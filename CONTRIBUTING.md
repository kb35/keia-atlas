# Contributing to Keia Atlas

Thank you for looking. Keia Atlas is Apache 2.0, Copyright Red Hat, Inc., created by Keith Brady. Contributions of every size are welcome: a corrected port on a device model, a new model, a fix to a page, a new connector, a better sentence in the help.

## Before you start

- Read `docs/rules/README.md`, the rule book on one page. Every rule has a number, a why, a do and a don't. Pull requests are reviewed against it.
- Read `docs/standards/page-anatomy.md` before touching a page and `docs/standards/new-device.md` before adding a device.
- Read [docs/connectors/README.md](docs/connectors/README.md) before writing a connector: read only, made-up fixtures, vault references never values, tests that run offline.
- Look at `docs/decisions/` for why things are the way they are. If you disagree with a decision, open an issue that names it.

## Proposing a change

1. **Open an issue first** for anything beyond a small fix: say what problem you have and how you work today. The roadmap is ordered by what real teams need.
2. **Fork and branch.** One change per branch, named for what it does.
3. **Make the change.** Keep to the files the change needs. Shared parts (`PageBand`, `FilterBar`, `DetailTabs`, `SidePanel`, `Section`, `EmptyState`, `Shell`, the motion and base stylesheets) change only with an issue agreed first, because every page depends on them.
4. **Check it:**

   ```sh
   npm run validate   # schemas and cross-reference checks
   npm run build      # the whole site must build
   npm test           # unit tests, help-key coverage, Keia drift check, and checks on the built pages
   ```

   CI runs the same three in this order. The tests that read the built pages are skipped if `dist/` does not exist yet, so build first to run them all.

   For a page: check it at 375, 768, 1024, 1280, 1440 and 1920 wide (`node tools/responsive-check.mjs`), in light and dark, and with reduced motion on.

   For glitches inside a page (a label spilling out of its box, a cut-off name, overlapping avatars, an icon off its line, console errors, broken links) at three widths and three text sizes: build, run `npx astro preview --port 4499`, then `npm run glitch` (add `--quick` for a short run); it writes a ranked report to `../notes/audit/`.
5. **Open a pull request** that says what changed and why, with a screenshot for anything visual. The template asks for a short checklist. Small, complete pull requests are merged faster than large ones.
6. **Add a line to the changelog** under `Unreleased` in [CHANGELOG.md](CHANGELOG.md) if people will notice the change.

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

This project uses the [Developer Certificate of Origin](https://developercertificate.org/) (DCO), as many open-source projects do. The DCO is a short statement that you wrote the change, or otherwise have the right to give it to the project under its licence; signing off a commit is how you make that statement. Every commit in a pull request must be signed off:

```sh
git commit -s -m "Add the Poly Studio X72 model"
```

That adds a `Signed-off-by: Your Name <you@example.com>` line, using the name and email in your Git settings. A check on every pull request (`.github/workflows/dco.yml`) fails if any commit is missing it.

Forgot? `git commit --amend -s --no-edit` fixes the last commit; `git rebase --signoff main` fixes every commit on your branch. Then push again with `--force-with-lease`.

## Releases

Keia Atlas uses semantic versions (major.minor.patch). The version lives in one place, `package.json`. While it is 0.x, any release may change things; from 1.0, only a major version may break something, and anything removed is announced a release ahead ([the roadmap's production principles](ROADMAP.md#production-principles)).

A maintainer makes a release:

1. **Choose the number.** A patch for fixes only, a minor for anything new, a major for anything that breaks.
2. **Update two files in one pull request:** `version` in `package.json` (and `package-lock.json`, with `npm version <number> --no-git-tag-version`), and [CHANGELOG.md](CHANGELOG.md), where `Unreleased` becomes `## [<number>] - <date>` with a fresh, empty `Unreleased` above it and the compare links at the bottom updated.
3. **Merge it, then tag that commit on `main`:** `git tag -a v<number> -m "Keia Atlas <number>"` (or `-s` to sign the tag, if you have a signing key set up in Git) and `git push origin v<number>`.
4. **The release workflow does the rest** (`.github/workflows/release.yml`): it checks the tag matches `package.json`, validates, builds and tests, builds the container image, pushes it to the GitHub Container Registry, writes an SBOM (a software bill of materials, the list of every package inside), signs the image and the SBOM with Sigstore, and creates the GitHub release with the changelog section and the SBOM attached.
5. **Check it:** the release page is there, and `cosign verify` (the command is at the top of the workflow file) passes for the new image.

If the workflow fails in its first job (the checks), nothing was published: fix the cause on `main`, delete the tag (`git push origin :v<number>` and `git tag -d v<number>`) and tag again. If an image was already pushed, never reuse the number; fix the cause and release the next patch.

## Code of conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/), version 2.1. Be direct and be decent. Report concerns through the contact in the repository's `CODE_OF_CONDUCT.md`.

## Licence

By contributing you agree that your code and data contributions are licensed under the Apache License 2.0, the same as the project, and that contributions to the Keia Method text ([docs/keia-method.md](docs/keia-method.md)) are licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Device facts you add must come from public documents and be cited.

---

Copyright Red Hat, Inc. Created by Keith Brady. The Keia Method text is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Keia Atlas, the software that runs it, is Apache 2.0.
