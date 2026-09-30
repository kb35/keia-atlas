# Getting started: run Keia Atlas for your own estate

Keia is a way of running IT from one living record of every room, device and job: kept by the work itself, readable in a minute, as deep as you need.

Keia Atlas v0.1 is a preview: a working demo with simulated live data. Repo mode is real, which means everything you see is built from YAML files in `data/`, checked against the schemas in `schemas/`, and served as a static site. You can replace the demo data with your own and host the result anywhere static files can be served.

> **Keep your estate safe**
> - Floor plans, camera and door positions and IP plans are sensitive. Treat them like keys.
> - Use a private repository only. Fork or copy the code into one before you add a single real record.
> - No passwords in YAML. Write a vault reference instead, such as `vault:site/admin-password`; `npm run validate` fails on a literal secret.
> - No camera feeds or recordings, ever. Describe where a camera is, never what it sees.
> - Do not publish a site built from real data. The public demo is safe only because everything in it is made up.

## 1. Prerequisites

- [Node.js](https://nodejs.org/) 22.12 or later (`package.json` sets `"engines": { "node": ">=22.12" }`).
- Git, with submodule support (the Keia framework is pinned as a submodule in `vendor/keia/` and is never edited).
- Optional: Docker, if you want to run the built site in a container.

## 2. Clone, install, run

```sh
git clone --recurse-submodules https://github.com/kb35/keia-atlas.git
cd keia-atlas
npm ci
npm run dev
```

The site is at `http://localhost:4321/keia-atlas/`. Edit any file under `data/` and the page reloads.

If you cloned without `--recurse-submodules`: `git submodule update --init`.

## 3. How the data is organised

Everything is YAML under `data/`. `schemas/registry.yaml` says which schema checks which folder; `npm run validate` walks every file, checks it against its schema, and then runs the cross-reference checks (a space must point at a real space type, a unit at a real model, a cable at real ports, and so on).

| Folder | What it holds | One file per | Schema |
|---|---|---|---|
| `data/sites/` | Each office or remote group: code, name, city, country, region, time zone, mains supply and plug type, floors | office | `schemas/ext/site.schema.yaml` |
| `data/floors/` | A floor plan in metres: outline, core (stairs, lifts, risers), corridors, cable trays, access points | floor | `floor.schema.yaml` |
| `data/space-types/` | What a kind of space is built to: capacity, purpose, the device classes it needs, build options, outlets (a Keia composite profile) | space type | `space-type.schema.yaml`, `schemas/keia/composite-profile.schema.yaml` |
| `data/spaces/<site>/` | Each real space: number, name, space type, build option, geometry (size, position on the floor, door, variations) | space | `space.schema.yaml` |
| `data/device-classes/` | A kind of device and what healthy looks like for it (a Keia object profile) | class | `schemas/keia/object-profile.schema.yaml` |
| `data/device-models/` | One product: manufacturer, dimensions, power, every physical port, firmware, lifecycle dates, and the gaps the sources do not state | model | `device-model.schema.yaml` |
| `data/configurations/` | The settings we use for one model, in setup order, with the reason for each and how a value is derived | model or platform | `configuration.schema.yaml` |
| `data/installs/<site>/` | What is fitted in each space: each position, its model, hostname and units (serial, asset tag, stage, installed date) | space | `install.schema.yaml` |
| `data/racks/`, `data/rack-gear/`, `data/rack-layouts/` | Comms room racks, the gear in them, and layouts | rack, gear model | `rack.schema.yaml`, `rack-gear.schema.yaml` |
| `data/cables/`, `data/runs/`, `data/circuits/` | Patch cords by office, structured cabling runs from panel to outlet, internet circuits | office | `cables.schema.yaml`, `runs.schema.yaml`, `circuits.schema.yaml` |
| `data/spares/` | Spare units in each office's IT store and minimum stock levels | office | `spares.schema.yaml` |
| `data/standards/` | The house standards integrators build to: cabling, labelling, racks, power, network, Wi-Fi, displays | standard | `standards.schema.yaml`, `cable-standard.schema.yaml`, `house-standard.schema.yaml` |
| `data/house-values/` | The fixed values every build sheet is worked out from: domain, time servers, DNS per region, calendar naming, vault entry names | company | `house-values.schema.yaml` |
| `data/firmware/`, `data/advisories/`, `data/known-issues/`, `data/maker-cases/`, `data/lab/`, `data/model-choices/` | Firmware lines and the standard version, security advisories, manufacturers' known issues, cases raised with manufacturers, Lab tests, why each model was chosen | item | matching schemas in `schemas/ext/` |
| `data/projects/`, `data/playbooks/`, `data/plan/`, `data/planning/`, `data/refresh-policy/` | Projects, the playbooks they follow, the year's plan, budget, headcount, ratios and scenarios, the refresh policy | project, playbook, year | `project.schema.yaml`, `playbook.schema.yaml`, `year-plan.schema.yaml`, `planning.schema.yaml`, `refresh-policy.schema.yaml` |
| `data/incidents/` | Incidents matched to a space or unit, with evidence and history | incident | `incident.schema.yaml` |
| `data/vendors/` | Integrators, service companies and manufacturers you work with | vendor | `vendor.schema.yaml` |
| `data/sources/` | Every document a fact came from (datasheets, manuals, public guidelines), with the date it was checked | source | `schemas/keia/source-entry.schema.yaml` |

Two things to know before you start:

- **Facts are cited.** Device facts come from manufacturers' public documents, read twice and reconciled; anything a source does not state goes under `gaps`, never guessed. The catalogue stores facts, summaries and links, never copies of the documents.
- **Nothing is deleted.** Units retire, spaces close, records are archived with a reason. History is the point.

## 4. Replace the demo data with your own

Start small. Start with one module. The smallest useful setup is the device catalogue; you do not need a floor plan to get value.

1. **Make it yours.** In a private copy, edit `data/house-values/` (your company, domain, time servers, DNS, calendar naming) and `astro.config.mjs` (`site` and `base` for where you will host it; `base: '/'` for the root of a domain).
2. **Device catalogue first.** Keep the models you own, remove the rest from `data/device-models/`, `data/configurations/` and `data/model-choices/`, and add your own following `docs/standards/new-device.md` (data first from two readings of the manufacturer's documents, cited in `data/sources/`; a traced drawing is optional, the class outline is shown until there is one). Keep `data/device-classes/` and `data/standards/`; edit them to your house standards. The catalogue is useful with no connector and no floor plan.
3. **One office.** Replace `data/sites/` with one site file. Add its spaces under `data/spaces/<code>/` against your space types, and what is installed in each under `data/installs/<code>/`. Everything else about the office (floors, racks, cables, runs, circuits, spares) is optional and can come later.
4. **Then the rest, in any order:** floors (a floor file per storey; the room drawings and the 3D model read them), comms rooms and cabling, spares, projects and playbooks, incidents, vendors, planning. Remove the demo's files from any folder you do not use yet; an empty folder is fine.
5. **Check as you go:** `npm run validate` after every change. It names the file, the line and the rule that failed.

The demo company is Aigna; every occurrence of its name, codes (`DUB`, `NYC`, ...), people and serials is demo data. `grep -ri aigna data/` finds what is left.

## 5. Validate, test, build

```sh
npm run validate   # schemas and cross-reference checks on data/
npm test           # the validator's and the pages' own tests
npm run build      # validate, then build the static site into dist/
npm run preview    # serve dist/ locally to check it
```

`npm run build` fails if the data does not validate, so a broken record never reaches the site.

## 6. Host it

The build is static files in `dist/`. Any of these works:

- **Any static host or web server.** Copy `dist/` to the server. Set `base` in `astro.config.mjs` to the path it will be served from before building.
- **GitHub Pages.** Note that GitHub Pages sites are public unless your organisation is on a GitHub Enterprise plan with access control. Do not publish real estate data to public Pages.
- **Docker.** A Dockerfile that builds the site and serves `dist/` with a small web server:

  ```sh
  docker build -t keia-atlas .
  docker run -p 8080:80 keia-atlas
  ```

  Then open `http://localhost:8080/keia-atlas/` (or the `base` you set).

For an internal host, put the container or the files behind your usual sign-in (a reverse proxy with single sign-on). v0.1 has no sign-in of its own and no roles that lock anything: "View as" and the role-shaped pages are presentation only. Real role-based access arrives with database mode (see the roadmap).

## 7. What is simulated in v0.1

Labelled on the page wherever it appears:

- Live health of devices, rooms in use, alerts and the incidents they create.
- Room bookings and who is on site.
- Every connector: fleet management, network controllers, booking calendars, monitoring, service management. Nothing reads from or writes to a real system.
- Ask, the search-and-answer box, where present: answers are built from the demo data.

Ask, where present, says it is AI. Nothing here trains on your data.

Everything else is real data handling: the schemas, the validator, the cross-reference checks, the build sheets worked out from your house values, the drawings, the floor plans and the 3D model.

## 8. Where to go next

- `docs/rules/` is the rule book: how pages are laid out, how devices and rooms are drawn, how things move and how they are worded.
- `docs/standards/new-device.md` for adding a model; `docs/standards/page-anatomy.md` for adding a page.
- `docs/decisions/` records why things are the way they are.
- [CONTRIBUTING.md](CONTRIBUTING.md) if you want to send something back.

---

Copyright Red Hat, Inc. Created by Keith Brady. The Keia Method text is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Keia Atlas, the software that runs it, is Apache 2.0.
