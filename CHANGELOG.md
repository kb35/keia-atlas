# Changelog

Every change people will notice is listed here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version starts with 0, any release may change things that earlier ones did; from 1.0, only a major version may break something.

How a release is made is in [CONTRIBUTING.md](CONTRIBUTING.md#releases).

## [Unreleased]

### Added

- A release workflow: on a version tag, check the data, build and test the site, build the container image, publish it, sign it and attach an SBOM (a software bill of materials, the list of every package inside).
- A sign-off check (DCO) on pull requests, issue and pull request templates, this changelog, and the first page of the admin guide (`docs/admin/`).
- A "Road to production" section in the [roadmap](ROADMAP.md), with three milestones and the production principles.

### Changed

- CI now builds the site before it runs the tests, so the tests that read the built pages run on every push.

## [0.1.0] - 2026-09-30

The first public preview: a working demo of one fictional company (Aigna) with simulated live data. Repo mode is real: every page is built from YAML files checked by schemas.

### Added

- **The record.** YAML for sites, floors, spaces and space types, device classes, 66 device models with every port from manufacturers' public documents, configurations in setup order, installs, racks, cabling runs and patch cords, internet circuits, spares, standards, house values, firmware lines, advisories, known errors, cases with manufacturers, Lab tests, projects, playbooks, the year's plan, planning, incidents, vendors, standing rules, privacy records and accessibility per space. Every fact is cited in `data/sources/`.
- **Checks.** A JSON Schema for every data folder, cross-reference checks, classification labels on every folder, and a validator that fails on any password, token or key that is not a vault reference. Kept migrations in `tools/migrations/`.
- **Locations.** Ten offices in three regions and the home offices, floor plans that read like real office floors, an interactive 3D model of each office with cable runs and internet circuits, comms rooms and IT stores. The office plan has six lenses and Replay; a region shows its offices side by side at one scale.
- **Spaces and devices.** Spaces drawn to scale with their devices, wall plates and cable routes; device types, models and front-on drawings; build sheets with every setting's value per unit; security support dates with warnings at 12, 6 and 3 months; the blast-radius model (what a port or device would take down, and the approval a change needs).
- **Work.** Home as a cockpit per role, the With chip (Take, Hand to, Park, Resume) and the handover card; the Support queue with incidents, changes, standing rules and their runs, and the audit log's shape; the job record with a proposed priority and its reason; projects with the Deploy flow; a schedule across offices; planning by financial year.
- **Services.** Service pages with a service map, experience figures and service levels (simulated and labelled).
- **People who use the spaces.** The room guide from a QR code, with a two-tap problem report and its status read back.
- **Partners and leadership.** Vendor records, the access register, a partner's Home and job page, and a leadership Home with cost and value.
- **Connector kit v0.** A canonical model, the adapter interface, a manifest schema, field ownership, secret redaction, and read-only spreadsheet and NetBox importers.
- **The front door and the method.** A landing page at `/welcome/`, the Keia Method on the site under `/method/` (with how it fits beside ITIL, ISO and PMI), and as text in `docs/keia-method.md`.
- **Across the site.** Help on every page (the ? button), a palette with find, page actions and Ask, View as for each role, one motion library, five looks in light and dark, and layouts from phone to large screen.
- **Docs.** The rule book (`docs/rules/`), decision records (`docs/decisions/`), the production architecture (`docs/architecture.md`), getting started, and setting up from your own records with optional AI help.
- **Running it.** A Dockerfile serving the site with an unprivileged nginx, `compose.yaml`, and GitHub Pages for the fictional demo.
- **Security and supply chain.** Dependencies installed from the lockfile, Dependabot with a five-day cooldown, every GitHub Action pinned to a full commit hash, container base images pinned by digest, secret scanning with gitleaks, the OpenSSF Scorecard, and private vulnerability reporting.

[Unreleased]: https://github.com/kb35/keia-atlas/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/kb35/keia-atlas/releases/tag/v0.1.0
