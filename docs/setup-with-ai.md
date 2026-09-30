# Setting up Keia Atlas

**Import from your tools. Draft the rest with AI if you want it. Every change is reviewed.**

Keia Atlas keeps one standard for sites, floors, spaces and devices. Your records are translated into that standard; the standard does not bend to them. There are three ways to do the translating, in this order:

1. **Importers.** Deterministic programs (they give the same result every time) for spreadsheets and NetBox. No AI involved.
2. **By hand.** Every step can be done by editing YAML files. [GETTING-STARTED.md](../GETTING-STARTED.md) shows how.
3. **An AI agent, if you want one.** Optional help for inputs no importer can read: PDF or image floor plans, messy spreadsheets, and manufacturers' spec pages.

Whichever you use, the rule is the same: **a change is proposed, the validator checks it, and a person accepts it.**

## Before you start

- Work in a **private copy** of the repository. Floor plans and device lists describe your buildings; treat them like keys. The safety rules are in the [README](../README.md#keep-your-workplace-data-safe).
- Install and check it runs: `npm ci`, then `npm run validate`. See [GETTING-STARTED.md](../GETTING-STARTED.md) for the details.
- Start small: one office. A useful site exists after step 2; the later steps make it richer.

## The six steps

| Step | From your tools, no AI | Optional AI help | You check |
|---|---|---|---|
| 1. Organisation | Edit the house values and one site file | Turn a pasted list of offices into site files | Codes, countries, time zones |
| 2. Bring what you have | Spreadsheet and NetBox importers | Rename messy columns; a ServiceNow export | Counts, unplaced rows, unmapped statuses |
| 3. Floors | Copy a demo floor file and edit it | Draft a floor from a drawing | Every shape against the drawing |
| 4. Match devices | Exact name matches, made by the importer | Match near names and part numbers | Each proposed match, by group |
| 5. Walk the rooms | Walk with a printed list; correct the sheet; import again | Read serials and model names from label photos | Each value read from a photo |
| 6. Settings | Edit house values, standards and the refresh policy | List what is missing and what it would unlock | The list, and who supplies what |

Each prompt below is short on purpose: it points the agent at [AGENTS.md](../AGENTS.md) (the rules every agent reads) and at one task file in [docs/setup-with-ai/](setup-with-ai/), which holds the exact steps, files and checks.

### 1. Organisation

Your company's fixed values go in `data/house-values/` (domain, time servers, DNS, calendar naming). Each office is a file in `data/sites/`. Set `site` and `base` in `astro.config.mjs` for where you will host it.

```text
Read AGENTS.md. Here is our list of offices: <paste the list>.
Draft one site file per office in data/sites/, on a new branch called setup/sites.
Leave out anything the list does not say, and tell me what is missing.
```

**Check:** each three-letter code, country and time zone. The agent should not have guessed a mains supply or a floor list.

### 2. Bring what you have

The importers read a file, show what would change, and write only when you add `--apply`. They put records in `data/connected/<system>/`, marked with where they came from.

- **Spreadsheet:** `npm run connect -- csv your-devices.csv`. With an agent: [import-spreadsheet.md](setup-with-ai/import-spreadsheet.md).
- **NetBox:** export with a read-only token, then `npm run connect -- netbox netbox-export.json`. With an agent: [import-netbox.md](setup-with-ai/import-netbox.md).
- **ServiceNow CMDB:** no importer yet. Rename the export's columns and use the spreadsheet importer. With an agent: [import-servicenow.md](setup-with-ai/import-servicenow.md).
- **Microsoft 365 rooms and Google Workspace resources:** planned, not built.

```text
Read AGENTS.md and docs/setup-with-ai/import-spreadsheet.md, then follow it.
The spreadsheet is <path>. Work on a new branch called import/spreadsheet.
```

**Check:** the unit count matches your rows; rows that could not be placed in a room; statuses kept in your system's own words. Remove columns that name people before you hand a file to an agent.

### 3. Floors

A floor file (`data/floors/<site>-<floor>.yaml`) holds the outline, core, corridors and open areas in metres. Each space then gets its place on the floor. By hand, copy `data/floors/dub-3.yaml` and edit it. With an agent that can read images: [draft-floor.md](setup-with-ai/draft-floor.md).

```text
Read AGENTS.md and docs/setup-with-ai/draft-floor.md, then follow it.
The drawing is <path>, for site <site> floor <floor>. The heights are <...>. Do not guess any height.
Work on a new branch called floor/<site>-<floor>.
```

**Check:** open the office page and the 3D view beside the drawing, and compare every room, wall and corridor. The heights come from facilities, never from the agent.

### 4. Match devices

The importer already links a device to a library model when the manufacturer and model names match exactly. The rest need a person, or an agent that proposes matches for a person to accept: [match-devices.md](setup-with-ai/match-devices.md). A product the library lacks gets a new model entry: [add-device-model.md](setup-with-ai/add-device-model.md).

```text
Read AGENTS.md and docs/setup-with-ai/match-devices.md, then follow it,
for the records in data/connected/<system>/. Work on a new branch called match/<system>.
```

**Check:** the grouped table, one row per model name. Accept or correct each group. For a new model, check a few facts against the linked source.

### 5. Walk the rooms

A person goes room by room: confirms what is there, reads serial numbers and asset tags from the labels, and notes what is wrong. The phone app for this is designed, not built. For now, print each room's list, walk, correct the spreadsheet, and import it again: the importer updates what changed and deletes nothing.

An agent with vision can read serials and model names from photos of labels. Photograph labels only, never people or screens, and keep the photos out of the repository.

```text
Read AGENTS.md. These photos are of device labels in room <room> at <site>: <paths>.
List each device's manufacturer, model, serial and asset tag as a table.
Mark any character you are not sure of with a ?. Change no file.
```

**Check:** every value read from a photo, against the label, before it goes into the sheet.

### 6. Settings

House values, standards (`data/standards/`), the refresh policy and who owns what are YAML in v0.1. Start from the demo's and change what differs. An agent can list what is still missing and what each item would unlock: [review-missing.md](setup-with-ai/review-missing.md).

```text
Read AGENTS.md and docs/setup-with-ai/review-missing.md, then follow it. Change no file.
```

**Check:** the list, and who will supply each item. Missing facts are normal; nothing is scored.

## Using an AI agent (optional)

**What you need.** An AI coding agent that can read and write files and run commands in the repository: Claude Code, Codex, Cursor, or any agent that reads `AGENTS.md`. For floor plans and label photos it needs vision (the ability to read images). For device models it needs web access.

**How to start.** Open the repository in the agent. It reads [AGENTS.md](../AGENTS.md) first: the golden rules, where each kind of data goes, and how to run the checks. Then paste the prompt for the step.

**How its work reaches you.** As a change you review, the same way you review any change:

- The agent works on its own branch and never on `main`.
- It ends with a short summary: what it proposed, file by file; the sources it used; what it could not find; what needs your decision; and the validator's result.
- It may open a pull request (a proposed change someone reviews before it lands) if you ask. It never merges or approves its own work. You do.

## What data goes where

**What an agent sees.** The repository's files and the inputs you hand it. With a hosted model, that content goes to the model's provider, under your agreement with them. Hand it only what the step needs.

**What it never needs.**

- Credentials. You make exports yourself, with a read-only token from your vault; the agent reads the saved file.
- Secrets. None belong in the repository; the validator fails on a literal password or token.
- Personal data. Remove columns that name people before you hand over a file. Home offices are a town and a number, never an address.

**Sensitive sites.** Floor plans and device positions are Restricted: they would help an attacker. For those sites, use a model that runs on your own infrastructure (self-hosted or local), or no AI at all. Floor plans of secure areas can be traced by hand.

## What it costs

There are no measured figures for a whole setup yet. What drives the cost of the AI help, in tokens (the units AI models count text in, and bill by), money and time:

- **Floors traced from images.** The largest driver. Each drawing is read as an image, and each round of correction costs a new pass.
- **Device rows.** Rows go through the importer at no AI cost. An agent reads only the header and a sample, unless it must split or clean every row.
- **Models not in the library.** Each needs its manufacturer's documents read twice.
- **Review rounds.** Each "fix this and run the checks again" repeats part of the work.

**How to measure it.** Most AI coding tools show a session's usage, and your provider's console shows it by day. Start a fresh session for each step, and note the tokens and the time at the end of each. Money is the tokens times your provider's price.

| Setup | Tokens | Money | Person's time | Measured on |
|---|---|---|---|---|
| One small office (1 floor, about 20 spaces) | Not measured yet | | | |
| A mid-size office (3 to 5 floors) | Not measured yet | | | |
| A multi-site organisation (10 offices) | Not measured yet | | | |

**One step, measured.** On 30 September 2026, one agent session followed [import-spreadsheet.md](setup-with-ai/import-spreadsheet.md) on the demo sheet (`tests/fixtures/connectors/devices.csv`: 6 devices and 1 office row), as a dry run only. It used Claude Opus 5.5 in Claude Code, made 7 tool calls, took about 42 seconds, and Claude Code reported about 72,000 tokens for the session (input and output together). Most of that was reading `AGENTS.md`, the task file and the importer's column list, which a session pays once; the rows themselves were a small part. The importer on its own, with no AI, ran in under half a second. Treat this as the fixed cost of one small step, not a figure per row.

| Step measured | Input | Tokens | Time | Measured on |
|---|---|---|---|---|
| Import a spreadsheet, dry run | Demo sheet, 7 rows | About 72,000 | About 42 seconds | 30 Sept 2026, Claude Opus 5.5 in Claude Code |

**Without AI** the cost is a person's time only. Every step above can be done by hand.

## Limits

Stated plainly, so nobody finds them later:

- **AI can misread a floor plan.** A wall taken for a corridor, a label on the wrong room, a scale off by a few per cent. The tracer (the drawing laid under the plan for checking) is designed, not built; until it exists, compare the office page and 3D view with the drawing by eye.
- **Device facts drafted from web pages need a source link,** and a person should check a sample against it. The agent writes facts in its own words and never copies the manufacturer's text, photos or manuals.
- **A likely match is not a match.** Only sure matches are written; the rest wait for you.
- **Some v0.1 checks were written for the demo,** so the public demo can never hold real data. In a private copy they stop real records: unit serials in `data/installs/` must look like demo serials (real units come in through an importer instead); floor files must carry the demo's "Fictional floor plan" label, and a site with floors needs cabling records; a networked model's end of security support must be cited or marked as a demo value. [AGENTS.md](../AGENTS.md) tells agents to stop and ask rather than change these checks.
- **Not built yet:** importers for ServiceNow, Microsoft 365 and Google Workspace; the tracer and DXF import (DXF is the common file format for CAD drawings); the phone room walk; a `match` command.
