# Keia Atlas

**The open-source platform for workplace technology and the IT work around it.**

Keia is a way of running IT from one living record of every room, device and job: kept by the work itself, readable in a minute, as deep as you need.

Workplace IT runs on a console per vendor, forms that ask what the alert already said, and knowledge that leaves when people do. Keia keeps one record of every room, device and job, written as the work happens, with a named owner on each. It keeps the words ITIL people know. Start small; go as deep as you like.

Keia Atlas is the software that runs the Keia Method.

Created by **Keith Brady**. Design decisions are recorded in [`docs/decisions/`](docs/decisions/).

## Start here

- **Start at the front door:** [kb35.github.io/keia-atlas/welcome/](https://kb35.github.io/keia-atlas/welcome/)
- **Try it (no sign-up):** [live demo](https://kb35.github.io/keia-atlas/)
- **Read the method (ten minutes):** [on the site](https://kb35.github.io/keia-atlas/method/), or as text in [docs/keia-method.md](docs/keia-method.md)
- **Run it for your own offices:** [GETTING-STARTED](GETTING-STARTED.md)
- **Set it up from your own records:** [docs/setup-with-ai.md](docs/setup-with-ai.md): import from your tools, draft the rest with an AI agent if you want one, and review every change
- **See how it runs in production:** [docs/architecture.md](docs/architecture.md): storage, modules, automation, connectors, security and operations, with what is built today and what is next
- **Contribute:** [CONTRIBUTING](CONTRIBUTING.md)

**v0.1 is a preview:** a working demo of a fictional company with simulated live data. Repo mode (your offices as YAML in Git) is real today; database mode is on the [roadmap](ROADMAP.md).

What is real today: schemas, validation, floor plans, drawings, build sheets, the room guide. What is simulated: live health, bookings, every connector. What is next: the API, export, database mode (see the [roadmap](ROADMAP.md)).

**Status:** Version 0.x: a preview with no support guarantee and no long-term-support release; releases roughly monthly.

- [Roadmap](ROADMAP.md)
- [Governance](GOVERNANCE.md) · [Maintainers](MAINTAINERS.md)
- [Code of conduct](CODE_OF_CONDUCT.md) · [Security](SECURITY.md)

## What it does

- **Locations:** every office and home office, with floor plans, an interactive 3D model of each office (every cable run from the patch panel to the wall, and the internet circuits in), comms rooms sized to what they serve, and IT stores with spare units.
- **Rooms:** room profiles drawn to scale, each room's devices, wall plates and tidy cable routes, and a one-screen room guide (QR code) where anyone can report a problem in two taps.
- **Devices:** device profiles, models with every port from vendor documents, configurations with a setup order, a standards library for integrators, and makers' known issues matched to the fleet.
- **Services:** fleet health for AV, network and infrastructure (simulated in v0.1, and labelled on the page).
- **Work:** home pages per role, a schedule across offices, projects with a Deploy flow ("verify, don't tick"), build sheets with every setting's value, incidents, playbooks and planning by year.
- Help on every page (the ? button), one motion system, five looks, light and dark.

Rooms, Devices and Work become Spaces, Assets, Support and Projects in the next release; the data already uses spaces and space types.

## What it is not

- Laptops and phones are out of scope.
- Real estate, leases and space planning are connected, never owned.
- No certification exists or is planned as an entry fee.

## AI

- Keia Atlas works without any AI. In v0.1, any automatic work is simulated.
- Routine work (reboot a device, re-apply a setting, re-sync a calendar) runs only under a standing rule a named person owns, and only where the action can be put back.
- Anything irreversible is a proposal a person confirms every time.
- Every automatic action shows what it read and what it did, with Undo or Roll back where one exists.
- You choose the model and the region it runs in, or turn AI off. Nothing trains on your data.

## Keep your workplace data safe

> - Floor plans, camera and door positions and IP plans are sensitive. Treat them like keys.
> - Use a private repository only. Fork or copy the code into one before you add a single real record.
> - No passwords in YAML. Write a vault reference instead, such as `vault:site/admin-password`; `npm run validate` fails on a literal secret.
> - No camera feeds or recordings, ever. Describe where a camera is, never what it sees.
> - Do not publish a site built from real data. The public demo is safe only because everything in it is made up.

## The data

All data is **made up or public**. The company (Aigna, an AI company founded in Dublin and headquartered in New York), its offices, people, rooms and incidents are fictional. Device facts come from vendors' public datasheets and manuals, and space types are based on public industry guidance (AVIXA display sizing, Microsoft Teams Rooms and Zoom room sizes, TIA-568 cabling and the makers' room sizes), with house assumptions marked; each is cited in `data/sources/`. Live figures are a simulation and say so on the page.

## Running it

Needs [Node.js](https://nodejs.org/) 22 or later.

```sh
git clone --recurse-submodules https://github.com/kb35/keia-atlas.git
cd keia-atlas
npm ci
npm test          # the validator's and the pages' own tests
npm run dev       # the site at http://localhost:4321/keia-atlas/
npm run build     # check the data, then build the site into dist/
```

## How it's organised

| Path | What it holds |
|---|---|
| `data/` | YAML: sites, floors, rooms, installs, device models, configurations, standards, projects, incidents |
| `schemas/` | JSON Schemas that check every data file (`schemas/registry.yaml` says which checks which) |
| `tools/` | The validator, cross-reference checks and page checks |
| `src/` | The site (Astro): pages, shared parts, the design tokens |
| `docs/rules/` | The rule book: layout, motion, words, looks, data |
| `docs/decisions/` | Why things are the way they are |
| `vendor/keia/` | The schemas and rules underneath (the [Keia framework](https://github.com/kb35/keia)), pinned and never edited |

## Licence

The code is under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE). The Keia Method text ([docs/keia-method.md](docs/keia-method.md)) is under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

---

Copyright Red Hat, Inc. Created by Keith Brady. The code is written with AI assistance (Claude), working from his descriptions of the system.
