# Keia Atlas architecture

How Keia Atlas is built to run for real: for one person with a Git repository, and for a whole IT organisation that depends on it every day, with automation doing routine work and connectors to the tools it already runs.

This is a design document. It is honest about what exists. Each part is marked:

- **Built**: in this repository today, with the file named.
- **Designed**: written down here, not built yet.

> **Where it stands:** repo mode is built and works today. Database mode, the API server, sign-in, automation that acts on real systems and live connectors are designed here and are next. [Section 8](#8-built-today-and-next) has the full table. The [roadmap](../ROADMAP.md) sets the order of work; nothing here is promised for a particular release.

## In one minute

- **One model.** Every page reads the same small set of record shapes, the canonical model. A page never knows where a record is stored or which tool it came from.
- **Two kinds of data.** Knowledge (the device catalogue, space types, standards, setup guides, playbooks, the method) lives in Git as YAML and is reviewed like code. Operations (incidents, tasks, events, live status, ownership, audit) live in Postgres: transactional, live and multi-user. One storage interface sits in front of both.
- **Modules you install and remove.** Each module is a package with a manifest. Removing one never breaks another; its data is kept and hidden.
- **Automation with brakes.** Routine work runs only under a standing rule a named person owns, within caps, in rings, halting on failure, with Undo, Roll back or a question. Each rule runs with its own identity, every action goes through one gateway, and every action is logged.
- **Security in one sentence.** Atlas holds nothing long-lived worth stealing, does nothing big without a brake, and makes the safe path the easy one.
- **Small to large on the same code.** No server at all in repo mode; `docker compose up` for a small team; Kubernetes, Helm or OpenShift with high-availability Postgres for an enterprise or a managed service provider.

## Contents

1. [The shape in one picture](#1-the-shape-in-one-picture)
2. [Two kinds of data, one model](#2-two-kinds-of-data-one-model)
3. [Modules as installable packages](#3-modules-as-installable-packages)
4. [Agents and automation](#4-agents-and-automation)
5. [Connectors in production](#5-connectors-in-production)
6. [Security](#6-security)
7. [Running it](#7-running-it)
8. [Built today and next](#8-built-today-and-next)
9. [Open decisions](#9-open-decisions)

---

## 1. The shape in one picture

```
  People: staff, service owners, vendors
          │
          ▼
  ┌──────────────┐  HTTPS   ┌──────────────────────┐◄── sign-in: OIDC or SAML, passkeys
  │   Web app    │─────────►│      API server      │◄── people and groups: SCIM
  │ (the pages)  │          │ who may see and do   │
  └──────────────┘          │ what; schema checks  │──── every write ────►┌───────────────────┐
                            └──┬────────────┬───┬──┘                      │ Audit log         │
                               │            │   │                         │ append-only,      │
                 ┌─────────────▼──┐  ┌──────▼─┐ │ runs people ask for     │ hash-chained,     │
                 │ Storage        │  │ Search │ │                         │ copied to your    │
                 │ interface      │  │ index  │ │                         │ security log      │
                 └───┬────────┬───┘  └────────┘ │                         └───────────────────┘
                     │        │                 │
          ┌──────────▼──┐  ┌──▼───────────┐     │
          │ Git: YAML   │  │ Postgres:    │     │
          │ knowledge   │  │ operations   │     │
          └─────────────┘  └──┬───────────┘     │
                              │ outbox          │
                  ┌───────────▼─────────────────▼──────────────────────────┐
                  │ Event bus: one envelope (CloudEvents) for everything   │
                  └─────┬──────────────────────────────────────────▲───────┘
                        │ triggers                                 │ records and events in
               ┌────────▼─────────┐                    ┌───────────┴──────────┐
               │ Rule worker      │                    │ Connector workers    │
               │ standing rules,  │                    │ one per connected    │
               │ caps, rings      │                    │ system, sandboxed    │
               └────────┬─────────┘                    └───▲──────────┬───┬───┘
                        │ tool calls                       │          │   │ short-lived
               ┌────────▼──────────────────────────────────┴──┐       │ ┌─▼─────┐
               │ Keia gateway (MCP): one typed tool per       │       │ │ Vault │
               │ action, authorised per tool, every call      │       │ └───────┘
               │ logged                                       │       ▼
               └────────▲─────────────────────────────────────┘   Other systems:
                        │ MCP                                     ServiceNow, NetBox,
               AI clients (optional): your model, or none         Poly Lens, UniFi...
```

Read it top to bottom. People use the web app, which talks only to the API server. The API server is the one door to the data: it checks who is asking and what they may see, down to the field, checks every write against its schema, and writes an audit entry and an event for it. Behind it, one storage interface keeps knowledge in Git and operations in Postgres. Events go onto the bus; the rule worker runs standing rules when an event, a schedule or a person asks; connector workers bring other systems' records in and carry approved actions out. Anything that acts on another system (a rule run, an AI feature, an outside AI client) goes through the Keia gateway, which authorises each tool call and logs it. Only connector workers hold credentials for other systems, and only for minutes, from the vault.

### The parts

| Part | What it does | Today |
|---|---|---|
| **Canonical model** | The record shapes every page reads: space, unit, model, service, person, organisation, work (incident, request, problem, change, task), event, agreement. JSON Schema, written in YAML | **Built** in part: `schemas/` checks every data folder; `schemas/connectors/` holds unit, space, ticket and event ([model.md](connectors/model.md)). Person, organisation and agreement are designed |
| **Storage interface** | One way to read, write, watch and see the history of any record, whichever store holds it ([section 2](#2-two-kinds-of-data-one-model)) | Designed. Today pages read YAML at build time (`src/lib/data.mjs`) |
| **Git store** | Knowledge as YAML, reviewed like code | **Built**: repo mode |
| **Postgres store** | Operations: transactional, live, multi-user | Designed |
| **API server** | The one door: identity, roles and field-level access, schema checks, audit entry and event with every write. HTTP and JSON, described in OpenAPI | Designed |
| **Web app** | The pages. The same page shapes in both modes | **Built** as a static site (Astro). In database mode the same pages fill their live parts from the API |
| **Event bus** | Every change as one event in one envelope (CloudEvents 1.0); written in the same transaction as the change (the outbox pattern), so none is lost | Designed. Today the live layer (`src/lib/live.mjs`) passes events between windows on one computer, through the same two functions a server will provide |
| **Rule worker** | Runs standing rules: conditions, caps, rings, read back, Undo or Roll back ([section 4](#4-agents-and-automation)) | Rules as data and the run model are **built** (`data/standing-rules/`, `src/lib/rules.mjs`, tested in `tests/rules.test.mjs`); runs are simulated |
| **Connector workers** | One per connected system: sync in, approved actions out ([section 5](#5-connectors-in-production)) | The adapter kit v0 is **built** (`tools/connectors/`): file imports, read only |
| **Keia gateway (MCP)** | The one path for any action on another system, by a rule or by AI | Designed. `npm run connect -- netbox --manifest` already prints the tools an adapter will publish |
| **Auth** | Single sign-on (OIDC or SAML), passkeys, SCIM for joiners and leavers, break-glass accounts | Designed. v0.1 has no sign-in of its own |
| **Vault** | Holds every secret; hands out short-lived credentials. Yours: OpenBao, HashiCorp Vault or a cloud secret manager | Vault references are **built** and enforced: `npm run validate` refuses a literal secret (`tools/secrets.mjs`) |
| **Audit log** | Who did what, when, before and after, under which rule; append-only and hash-chained | Designed. `/support/log/` shows its shape with demo entries |
| **Search index** | Finds anything a person may see, filtered by permission at query time | **Built** in the browser for the demo (`src/lib/search-index.mjs`); the server index is designed (Postgres full-text first, OpenSearch when an organisation outgrows it) |

---

## 2. Two kinds of data, one model

Some records are knowledge: slow to change, worth reviewing, worth sharing. Others are operations: changing by the minute, touched by many people and by software at once. Each deserves the store built for it.

### 2.1 Which data goes where

| | **Knowledge, in Git** | **Operations, in Postgres** |
|---|---|---|
| What | Device catalogue (models, ports, drawings, firmware lines, known issues), device types, space types, house standards and house values, setup guides, playbooks, standing rules, the method, sources | Incidents, requests, problems, changes, tasks, events, live status and health, ownership and hand-offs, comments, runs of standing rules, audit |
| How often it changes | A few times a week | Many times a minute |
| What it needs | Review, history, blame, branches, forks, diffs a person can read | Transactions, live updates to everyone, row and field access, fast queries |
| How it changes | A proposal that becomes a pull request or a commit | A write through the API, in one transaction with its event and its audit entry |
| Sharing | Forkable: a community catalogue, a partner's standards, your house rules on top | Stays inside your organisation |

**Places sit in between.** Sites, floors, spaces, racks and cabling are designed and reviewed like drawings, so they are knowledge by default. Units, what is installed where, and spares change with the work (a unit is swapped, moved, retired), so they are operations by default. Each record kind's home is one line in the registry, and an organisation can move a kind from one store to the other with a migration.

**Standing rules show why the split works.** A rule is knowledge: changing it is a pull request its owner approves, which is exactly a standard change approved once. Its runs are operations: each one a record with an owner, a result and an audit trail.

### 2.2 One storage interface

Pages, rules, connectors and the gateway use one interface and never know which store answers:

```ts
interface Store {
  get(kind, id, { at })         // one record, now or as it was at a version
  list(kind, filter, page)      // the records this caller may see
  watch(kind, filter)           // changes, as events
  write(change, context)        // operations: committed now; knowledge: opens a proposal
  history(kind, id)             // every version: who, when, why, before and after
}
```

`schemas/registry.yaml` already says which schema checks each folder and its classification (**built**). Each entry gains `store: knowledge` or `store: operations` (designed), and the API server sends each call to the right adapter.

- **Links across the two stores.** An operational record points at knowledge by id and remembers the version it was made against (the commit). An incident from March still shows the setup guide as it was in March, and a link to today's version.
- **One set of checks.** The same JSON Schemas check both stores. The cross-reference checks (`tools/crossrefs*.mjs`, **built**) run in CI on every knowledge commit, and in the API on every operational write that touches a link.
- **Nothing is deleted.** Records retire or are archived with who, when and why, in both stores (rules F5 and P7).

### 2.3 Editing knowledge from the web app

A person should never need Git to improve a setup guide, and an engineer who prefers a text editor should never be locked out of the web app's history. Both paths end in the same repository.

```
  "Propose an edit" on any page
          │
          ▼
  Proposal (an operations record: who, what, why, the diff, the commit it started from)
          │  the owner reviews it on the page (rule P8)
          ▼
  Approved ──► the API server writes a branch and a commit
          │     author: the person who proposed it; committer: Keia Atlas's service identity
          │     then opens a pull request on your Git host, or commits straight to main
          │     where your repository's policy says the owner's approval is enough
          ▼
  CI runs npm run validate and the tests ──► merged ──► webhook ──► index refreshed, pages updated
```

- **Git hosts:** GitHub, GitLab, Gitea or Forgejo, Bitbucket, or a plain repository the server keeps itself for an organisation with no Git host.
- **Owners agree in both places.** The owners named in the records generate the repository's CODEOWNERS file, so the person who approves on the page is the person Git asks to review.
- **Conflicts.** If the file changed since the proposal's starting commit, the server merges when the changes do not overlap, and otherwise marks the proposal "Doesn't match: the setup guide changed since you started", with both versions side by side.
- **Edits made straight in Git** are read like any other: every merged commit refreshes the index and appears in the record's history.

### 2.4 Snapshots and export

- **Export** writes everything a caller may see as YAML, in the same folder layout as repo mode (`data/incidents/`, `data/spaces/`, ...), with a manifest of counts and checksums, signed. Restricted fields are included only for someone allowed to see them; every export is logged and watermarked.
- **Snapshots** (optional): a nightly export of operations into a separate private Git repository, so there is a readable, diffable history outside the database. It is a way out and an audit aid, not the backup ([section 7.4](#74-backups-and-restore)).
- **Import and seed:** the same YAML seeds a new database. Moving from repo mode to database mode is an import; moving back is an export. The round trip is tested in CI (designed).

### 2.5 Repo mode stays first class

Repo mode is what Keia Atlas is today: YAML in a private Git repository, checked by `npm run validate`, built into a static site. It needs no server and no database, and it is the right choice for one person or a small team happy to review every change like code.

| | **Repo mode** (built) | **Database mode** (designed) |
|---|---|---|
| For | One person, a small team, anyone who wants every change reviewed | An IT organisation running on it every day |
| Runs as | A static site behind your own sign-in | Web app, API server, workers and Postgres |
| Knowledge | YAML in Git | YAML in Git, the same files |
| Operations | YAML in Git (incidents, projects) and the live layer in one browser | Postgres, live between everyone |
| Sign-in and roles | Your reverse proxy's sign-in; "View as" is presentation only | Single sign-on, SCIM, real roles down to the field |
| Connectors | File imports (`npm run connect`) | Live: webhooks, polling, reconcile, approved writes |
| Automation | Simulated, labelled on the page | Real, under standing rules |

The promises that keep repo mode first class: every release builds and tests it; nothing in the knowledge store depends on the server; file-based connectors keep working; and the YAML you write today is the YAML database mode imports.

---

## 3. Modules as installable packages

The sidebar after Home is a set of modules: Locations, Services, Assets, Support, Projects, Vendors, Team and Knowledge. Home, Learn, Settings and the shared page parts are the core. Today a module can be switched On, Connected or Off in this browser (`src/lib/modules.mjs`, **built**). This section is how modules become real packages that an organisation installs and removes.

### 3.1 The manifest

Every module ships one manifest that declares everything it adds, so the platform can install it, check it and remove it without reading its code:

```yaml
id: vendors
name: Vendors
version: 1.4.0
core: ">=1.2 <2"             # core versions it works with
model: ">=1.1"               # canonical model versions it reads and writes
uses:                        # soft dependencies: richer when present, fine when absent
  - locations                # shows each vendor's offices on the floor plan
  - support                  # lets work be handed to a vendor as a peer
schemas:                     # record kinds it adds, where each is stored, and its label
  - { kind: vendor,   schema: vendor.schema.yaml,   store: knowledge,  classification: Internal }
  - { kind: contract, schema: contract.schema.yaml, store: operations, classification: Restricted }
  - { kind: case,     schema: case.schema.yaml,     store: operations, classification: Internal }
pages: [/vendors/, /vendors/{id}/, /vendors/contracts/]
routes:                      # API routes, each with the permission it needs
  - { method: GET,  path: /api/vendors,            permission: vendors.read }
  - { method: POST, path: /api/vendors/{id}/cases, permission: vendors.cases.write }
permissions:
  - { id: vendors.read,        roles: [technician, service-owner, leadership] }
  - { id: vendors.cases.write, roles: [service-owner] }
connectors: [servicenow-vendor-cases]   # adapters it can be Connected through
rules: [renewal-reminder]               # standing rules it ships, off until an owner approves one
events:
  emits:    [io.keia.vendor.contract-ending]
  consumes: [io.keia.work.handed-to]
search: [vendor, contract]              # kinds it adds to search
help: help/vendors.yaml                 # help entries for its own widgets
migrations: migrations/                 # numbered, expand then contract (section 7.5)
```

### 3.2 The registry: installed, then On, Connected or Off

The registry is a table per organisation of the modules installed, their versions and their state, with who changed it and when (the change is audited like any other).

- **Installed** means the package is present: its code, migrations, pages and workers.
- **On:** built in. Its records live in Atlas.
- **Connected:** its pages show records from another tool through a connector, in the same page shapes, with a source mark ("from ServiceNow, 09:14"). Writes go to that tool.
- **Off:** absent from the sidebar and from search. Its pages say the module is off and offer to switch it on (rule P5, as the demo does today). Its API routes answer "module off", and its workers and rules do not run.

### 3.3 Soft dependencies: removing a module never breaks another

- **No module reads another module's tables or files.** Modules meet only through the canonical model, the API and events.
- **`uses` is always optional.** A feature that needs another module asks the registry and, when that module is off, leaves its part of the page out; the rest of the page keeps its place and shape.
- **The core owns the shared kinds** (space, unit, model, person, organisation, work, event). Modules add kinds of their own, or add fields to shared kinds in their own namespace; they never change a core field.
- **Removing is gentle, in steps.** Off first: instant and reversible. Uninstall removes code, workers and routes; its records stay, marked dormant, hidden from pages and search, still in exports and in the audit log. A link from another record shows "From the Vendors module, which is off" instead of breaking. Installing again brings everything back.
- **Deleting a module's data is a separate act:** an export first, two people, logged, never automatic.
- **Tested both ways.** CI installs each module on its own, and removes each module from the full set; everything left must still pass.

### 3.4 Versions and compatibility

- **Semantic versions** for the core, the canonical model, the connector SDK and every module.
- **Model fields carry stability labels:** Experimental, Stable, Deprecated ([model.md](connectors/model.md#stability)). Fields are added, never renamed; a field is deprecated for at least one long-term-support release before it goes.
- **The registry refuses** to switch on a module whose `core` or `model` range does not match, and says why in one line.
- **Migrations:** operational tables change by expand then contract ([section 7.5](#75-zero-downtime-upgrades-and-migrations)). Knowledge changes shape through a kept, one-off migration script (`tools/migrations/`, **built**, rule F6) whose output is a reviewed pull request.
- **Packages are signed** and carry a software bill of materials, like releases ([section 6.6](#66-supply-chain)). Community modules are off by default in production, like community connectors.

---

## 4. Agents and automation

**The words.** A **standing rule** is a standard change a service owner approved once, with its conditions, caps and way back. An **agent** is the software that runs it. Most automation has no AI in it at all: conditions, caps, thresholds and schedules are plain code that gives the same answer twice. AI is used where language or judgement is the work (summaries, drafts, grouping alerts, suggesting causes), and it proposes; it never acts on its own authority. Agents have no names, faces or place in Team. The record says it quietly: "Done automatically under the DNS rule (owner: Nora)".

### 4.1 One run, end to end

```
  Trigger: an event (a unit stopped answering), a schedule, or a person pressing Run
      │
      ▼
  The rule worker loads the rule at its approved version and checks, in order:
    module on? · rule approved and owned? · kill switch off? · conditions true?
    caps: wave size, ring, booked meeting, change freeze, halted after failures?
    approval tier met?
      │  any "no" ──► Not run, with the reason, on the record
      ▼
  A token for this run only: scoped to the rule's declared actions on the declared
  targets, valid for minutes
      │
      ▼
  Read ──► Write ──► (Wait) ──► Read back          every call through the Keia gateway
                                   │
                    matches ───────┼──► Done automatically under <rule> (owner: <person>)
                    does not ──────┴──► Unable to complete · Roll back or Undo if declared
                                        · an incident owned by the rule's owner, saying
                                          where it stopped

  At every step: an audit entry carrying the run id, an event on the bus, the owner told
```

The run model, its states and the "Unable to complete" wording are **built** in `src/lib/rules.mjs` and shown on the demo's rule pages; the worker that executes against real systems is designed.

### 4.2 Caps, rings and halts

Every rule declares its caps today (`caps` in `data/standing-rules/*.yaml`: units per wave, never in a booked meeting, never in a freeze, halt after N runs unable to complete). Production adds:

- **Rings:** ring 0 is lab units; ring 1 a small share (one office, or a few per cent); then waves. A soak time between rings, and each ring must pass before the next starts.
- **Auto-halt:** a wave stops when its failures pass the rule's threshold, and the rule halts until its owner looks.
- **Change windows and freezes** read from the change calendar.
- **Ceilings no rule can exceed,** set per organisation: for example, never more than a set number of units per hour across all rules.
- **Kill switches** at three levels (a rule, a module, the whole organisation) that take effect within seconds and are themselves audited.
- **Dry run by default:** a new rule starts by saying what it would have done, until its owner switches it to run.

### 4.3 The way back: Undo, Roll back, or ask

Each rule declares one, and the screen never shows a verb the rule does not have (rule P12, **built**):

- **Undo:** the action truly reverses.
- **Roll back:** the previous state is kept and restored.
- **Nothing to put back:** it ends as it started (a PoE cycle).
- **Asks:** it cannot be put back, so a person confirms every run.

### 4.4 Human approval tiers

| Tier | Examples | Who approves |
|---|---|---|
| **Read** | Reading any system within the connector's read scope | Nobody |
| **Reversible and small** | Within caps under an approved rule: reboot, re-apply a setting, re-sync a calendar, cycle PoE | The rule's owner, once, when the rule is approved; told on every run |
| **Wider** | More than the rule's normal reach: a whole floor or office in one wave | The rule's owner confirms this run |
| **Irreversible or sensitive** | Firmware, factory reset, delete, bulk configuration push; anything touching security, identity, access or life safety; the first write of any new rule | A person every time; two people above the organisation's blast-radius threshold (for example, more than one office) |
| **Prohibited** | Anything the Keia framework's Prohibited tier or your policy forbids | Nobody, for anyone |

The thresholds are the organisation's settings; the defaults are cautious. Because most actions need no approval, the approvals that remain mean something.

### 4.5 Each agent has its own identity

- **One service identity per rule:** a workload identity (a SPIFFE ID, or a client in your identity provider), never a person's token and never a shared admin account.
- **Least privilege by construction:** its scopes are exactly the rule's declared reads and writes, on its declared targets (device types, offices). A new action means a rule change, which means a reviewed pull request the owner approves.
- **Tokens per run, for minutes.** The credential for the other system stays in the connector worker, fetched from the vault; the agent never sees it.
- **Listed in Settings › Automation:** every agent, what it may do, its identity, its owner and its history.
- **No owner, no run.** When an owner leaves (SCIM tells Atlas), each of their rules must pass to a new owner or it stops.

### 4.6 Every action through the gateway, every action logged

The **Keia gateway** is the only path from Keia Atlas to act on another system.

- It speaks MCP (the stateless 2026 specification) and publishes one small typed tool per adapter action, generated from the adapter manifests: `netbox.unit.get`, `poly.unit.reboot`. Never a "run any query" tool. Read tools and write tools are separate, and each write tool declares its scope and its way back.
- **Callers:** the rule worker; Keia's own AI features; and any AI client an organisation points at Atlas. An outside client signs in as a person and gets that person's rights, never more; its write tools produce proposals a person confirms.
- **For each call** it checks the caller, the tool, the rule's scope and the caps, writes the audit entry before and after, and forwards to the connector worker. No caller's token is ever passed through to another system.
- **Vendor MCP servers** (ServiceNow, Atlassian, Datadog and others ship them) are optional read sources behind the same gateway, with their tool descriptions pinned and checked for changes. Nothing the pages depend on runs through them.

### 4.7 AI: your model, your region, or none

- **A model policy per organisation, per kind of task:** summaries, drafts, grouping alerts, suggesting causes, answering questions over Atlas's own records. Each kind uses a hosted provider in a chosen region, a local endpoint on your own servers (anything that speaks the common OpenAI-compatible interface, such as vLLM or Ollama), or nothing.
- **AI off works.** Every AI feature has a path without it: a rule, a template or a plain list. Keia Atlas works with AI switched off.
- **Every AI call is logged** with model, provider, region, prompt version, what it read and what it cost, next to the action's audit entry. Budgets and a kill switch per organisation.
- **Nothing trains on your data:** by contract with hosted providers, and by construction with local models.
- **Text is data, not instructions.** Ticket text, device names and vendor notes are untrusted. A model with no tools reads them and returns only structured fields; the model that can call tools never sees the raw text; nothing that reads untrusted text can send data out (no fetching arbitrary addresses, no email, no rendering of links the model wrote).
- **AI sees only what the person can see,** filtered before retrieval, not after.
- **People keep the diagnosis.** On a P1 or P2 the suggestion opens after the person has recorded their own call. Suggestions show evidence as counts ("3 of 4 checks agree"), never a confidence percentage.
- **Each AI task has an evaluation set,** run again on every model or prompt change.
- **An assistant says it is AI.**

### 4.8 How "How was this done?" is fed from the audit log

Every run has a run id, which is also its trace id in the observability data. The rule worker, the gateway and the connector worker each write audit entries carrying it:

| Entry | Holds |
|---|---|
| `read` | What it read, from where, and the values that mattered |
| `did` | Each tool call, with before and after |
| `ruled_out` | What it checked and set aside, and why |
| `not_checked` | What it could not check (declared by the rule, so it is never left empty) |
| `context` | The rule and its approved version, the owner, the agent's identity, the model and region if AI took part |

"How was this done?" (`src/components/HowCard.astro`, **built** on demo data) is a view over those entries: a short account on top, the entries one link away in the audit log. Because the card is drawn from the log, it cannot say anything the log does not.

**The audit log itself:** append-only; each entry carries a hash of the one before (a hash chain), so a removed or edited entry is detectable; copied as it is written to your own security log system. An action whose audit entry cannot be written does not run. The same log is the change history, the incident timeline and the auditor's evidence.

---

## 5. Connectors in production

[docs/connectors/](connectors/README.md) describes the connector kit as it is today (**built**): the canonical model, the adapter interface (`defineAdapter({ manifest, open, list, get, map })`), the manifest schema, field ownership, vault references, the `connect` command and two reference adapters (a spreadsheet and a NetBox export). It reads files and is read only. This section is what production adds.

### 5.1 Adapters and capability manifests

The adapter interface grows, keeping everything it has:

- `subscribe` for webhooks and subscriptions; `delta` for "changes since" queries; `write(action, target, params)` for declared actions, each with its way back; `readBack` to check a write landed.
- The manifest already declares `reads` (`file` now, `api` for live adapters), `events.mode` (file, poll, delta, webhook, subscription), `rate`, `hosts` and `credentials` as vault references (**built**, checked by `schemas/connectors/manifest.schema.yaml`). Production adds `actions` beyond `read`, each with its governance tier.
- **Pages show only what an adapter declares.** A missing action keeps its place on the page with a one-line reason, or becomes "Open in XiO Cloud"; the page shape never changes.

### 5.2 Sync: webhooks, polling and reconcile

- **Webhook or subscription first,** for speed; **polling or delta queries** where a tool has none; a **scheduled full reconcile** (nightly by default) to catch whatever the push channel missed.
- **Every inbound change** becomes one CloudEvents envelope on the bus, and is merged by field ownership, as the runner does today (**built**): `source` fields are replaced, `keia` fields are kept.
- **No echoes:** every write carries its origin, and a change that came from a system is never sent back to it.
- **Writes follow one lifecycle:** preview, execute, read back, report. The page says "Sending to ServiceNow", then "Saved in ServiceNow", or "Unable to complete" with the reason and a retry. It never pretends a write landed.
- **Staleness is a fault.** Each connection declares how often it should report; a feed that goes quiet shows on the page, not only in admin, and raises an event.
- **A sync log per record:** what changed, from which system, and whether it worked.

### 5.3 Source-of-truth rules

Ownership is set per field, not per system, and agreed when a connection is set up. The defaults:

| Record or field | Source of truth |
|---|---|
| Ticket number, state, assignment | Your service-management tool when Support is Connected; Atlas when Support is On |
| Device health, firmware, online state | The device platform (Poly Lens, Logitech Sync, XiO Cloud, Q-SYS Reflect, UniFi...) |
| Device identity, placement, asset record | Your CMDB if you have one; otherwise Atlas |
| People and groups | Your identity provider, through SCIM. Atlas never edits people |
| Bookings | The calendar system |
| Catalogue links, notes, links to spaces | Atlas |

Comments and work logs are append-only on both sides, so they never conflict.

### 5.4 Rate budgets

Atlas shares each tool's API budget with every other app the organisation runs on it, so it must be a good neighbour.

- Each connection has a budget (requests per minute, or points per hour for tools that count that way), enforced by the connector worker.
- It honours `Retry-After`, backs off with jitter, batches reads and caches what it can.
- Defaults are frugal, the budget is visible to the admin, and budget use is a metric with an alert.

### 5.5 The worker: isolated by default

- **One worker per connection** (a process or a container) with its own identity.
- **Its own credentials only,** fetched from the vault for minutes. It cannot read another connector's secrets.
- **Egress limited to the manifest's `hosts`,** enforced by network policy.
- **No direct database access:** it writes through the bus and the API, so every record passes the same checks.
- **Unused connections close themselves:** one with no owner, or no successful sync for a set number of days, is disabled and its owner told.

### 5.6 The connector SDK

Today's kit (**built**): the adapter interface, the runner that merges, checks and plans, fixtures, tests, and the "afternoon" guide. Next (designed): a live adapter template; a local runner that replays recorded webhooks; contract tests against vendor sandboxes where they exist; the generated MCP tools for each adapter. Later: a declarative format for simple REST tools, so an integrator can add one without writing code.

### 5.7 Certification tiers

| Tier | Who keeps it | What it takes | In production |
|---|---|---|---|
| **Community** | Anyone, named in the manifest | A valid manifest, fixtures and tests that pass in CI | Off by default; an admin turns it on knowing it is unreviewed |
| **Partner** (designed) | The vendor who makes the system | Community, plus a security review of scopes, hosts and vault references, and a signed release | Available |
| **Certified** | The Keia Atlas maintainers, or a partner under review | Partner, plus tests against the vendor's sandbox, a named owner who answers issues, and a stable manifest | Available |

One certified connector per system; forks are welcome but never shown as equal. A connector with no release and no owner response for six months is marked stale, then archived with a notice, never silently removed.

---

## 6. Security

### 6.1 Why Keia Atlas is a target

Atlas brings together three things that are usually kept apart:

- **A map:** floor plans, camera and door-controller positions, IP plans, switch ports.
- **Keys:** credentials for ServiceNow, the identity provider, device platforms, network controllers.
- **Hands:** automation that reboots devices, updates firmware and pushes configuration.

All three together give an attacker reconnaissance, a way into other systems, and a mass-action button. That is the same shape as the remote-management tools behind Kaseya and ScreenConnect. The design answer is not more gates for people; it is holding **nothing long-lived worth stealing**, doing **nothing big without a brake**, and making **the safe path the easy one**.

### 6.2 The threats that matter most

| # | Threat | Main defences |
|---|---|---|
| 1 | Stolen connector credentials used to reach other systems (the Salesloft Drift pattern) | No long-lived secrets: short-lived credentials from the vault or workload identity; read-only scopes by default; one identity per connector; egress allowlists; alerts on unusual query volume |
| 2 | Supply-chain compromise of a dependency or CI action | Lockfile and `npm ci`; a cooldown on new versions; actions pinned to commit hashes; least-privilege CI tokens; signed releases with an SBOM and provenance |
| 3 | Admin account takeover by phishing or a help-desk reset | Passkeys; single sign-on and SCIM; admin recovery needs a second person; short admin sessions; step-up for risky actions |
| 4 | Secrets or real office data committed to Git in repo mode | The validator refuses literal secrets; secret scanning in CI; private repositories only |
| 5 | A compromised vendor or integrator account | Access tied to a job, scoped to its devices, ending when the job closes; no standing vendor accounts; credentials rotated when a vendor leaves |
| 6 | Instructions hidden in ticket text or device names, driving AI | AI with the person's rights only; read-only tools; writes are proposals; no outbound channel; untrusted text read in quarantine |
| 7 | Automation blast radius: a buggy or malicious mass action | Caps, rings, auto-halt, change windows, two people above a threshold, kill switches, dry run by default |
| 8 | An Atlas server exposed to the internet and exploited | Never on the open internet: behind an identity-aware proxy; setup paths closed after install; a same-day patch process |
| 9 | A malicious community connector, module or MCP server | Signed packages with declared scopes; isolated workers; no access to other connectors' secrets; pinned tool descriptions |
| 10 | Theft of the map, or insider misuse, to plan a physical intrusion | Classification labels; field-level need-to-know; no camera feeds stored; watermarked, logged exports; alerts on bulk export; quarterly access review |

In repo mode today, threats 2 and 4 are the live ones, and both have defences in place ([section 6.6](#66-supply-chain)). The rest arrive with database mode and are designed for now, while they are cheap.

### 6.3 Secure and easier

Each of these removes a risk and a chore at the same time.

| Pattern | Prevents | Easier because |
|---|---|---|
| **Passkeys and single sign-on** (OIDC or SAML) | Phishing, password reuse | A tap or a face, no codes; Atlas has no passwords of its own |
| **SCIM** from your identity provider | Leavers keeping access | No offboarding checklist in Atlas; roles follow your groups |
| **Job-scoped vendor access** | Standing vendor back doors (the Target pattern) | The vendor asks, the owner taps approve, and access ends by itself when the job closes |
| **Vault references, never values** (`vault:site/admin-password`) | Secrets leaking from YAML, backups or tickets | One place to rotate; nobody hunts for "the Crestron password" |
| **Short-lived tokens and workload identity** | Stolen tokens staying useful | No rotation chores, no expiry surprises at 2 a.m. |
| **Read-only connectors, writes scoped to a named rule** | One token doing everything | A read-only connector needs no security review, so setting one up is quick |
| **Two people only above a blast-radius threshold** | Mass damage from one hijacked account | Most actions need no approval, so approval fatigue does not set in |
| **Caps, canary rings and auto-halt** | An outage across every office at once | Automation can be trusted to run unattended |
| **Tamper-evident audit log** | Covering tracks | The same log is the change history, the incident timeline and the audit evidence |
| **AI proposes, a person confirms** | Injected instructions turning into actions | The typing and looking up is done for you |
| **Signed releases and an SBOM** | Installing something other than what was built | Verify before you deploy with one command |
| **Labels drive handling** | Leaks of floor plans and camera positions | A Restricted field is hidden, redacted and watermarked without a case-by-case decision |

### 6.4 Labels decide who sees what

Every data folder carries a label in `schemas/registry.yaml`, and a field more sensitive than its folder carries `x-classification` in its schema (**built**, rule F10):

- **Public:** device model facts, space types.
- **Internal:** facts staff may see (room names, counts).
- **Restricted:** anything that would help an attacker: floor plans, camera and door positions, IP plans, the vulnerable-firmware list, vendor contacts.
- **Secret:** never in Atlas data at all; the vault only.

In database mode the label drives everything automatically (designed): who can read the field, whether search and AI can see it for this person, redaction in exports, watermarks, and alerts on bulk access.

### 6.5 What Atlas never stores

- Passwords, API keys and private keys: references to the vault only.
- Live camera feeds or recordings: a link to the video system, never a copy.
- Session tokens, browser traces and cookie dumps in attachments: stripped on the way in.
- Door-access logs about individual people.
- Personal data beyond work identity. Home offices are spaces, never people's addresses (rule F7).

### 6.6 Supply chain

**Built today:** dependencies installed from the lockfile with `npm ci`; Dependabot with a five-day cooldown on new releases; every GitHub Action pinned to a full commit hash; container base images pinned by digest; the container runs as a non-root user; secret scanning with gitleaks in CI; the OpenSSF Scorecard; private vulnerability reporting ([SECURITY.md](../SECURITY.md)); the Keia framework pinned as a submodule and never edited.

**Written, waiting for the first tagged release:** a release workflow (`.github/workflows/release.yml`) that signs each container image with Sigstore from CI, keyless, and attaches an SBOM (CycloneDX) to the image and the release; a DCO sign-off check on pull requests.

**Next:** SLSA build provenance, so anyone can check that an image was built from a given commit by a given workflow; signed module and connector packages.

### 6.7 The front door

- **Not on the open internet.** Atlas sits behind an identity-aware proxy: every request is checked for who, which device and what access, with no VPN and no public admin page for a scanner to find.
- **First-run setup closes for good** once installation finishes.
- **Break-glass:** two emergency accounts with hardware keys, kept apart, independent of single sign-on, monitored and tested every quarter.
- **Runbooks for the bad day:** revoke every connector token at once; restore from backup; publish an advisory the same day.

---

## 7. Running it

### 7.1 From one person to an enterprise, on the same code

| | **Repo mode** | **Small team** | **Enterprise** | **Managed service provider** |
|---|---|---|---|---|
| Status | **Built** | Designed | Designed | Designed |
| How | `npm run build`, or the container in `compose.yaml` serving the static site | `docker compose up`: web and API, one worker, the gateway, connector workers, Postgres | Kubernetes with the Helm chart, or OpenShift | The enterprise layout, one tenant per client |
| Data | YAML in Git | Git plus one Postgres | Git plus high-availability Postgres | Git and a database per client |
| Secrets | Vault references only | Your vault, or OpenBao in the compose file | Your vault, through its Kubernetes sign-in | A vault namespace per client |
| Sign-in | Your reverse proxy | Single sign-on and SCIM | Single sign-on, SCIM, break-glass | Per client, from each client's identity provider |

### 7.2 Kubernetes, Helm and OpenShift

One Helm chart (designed) deploys the parts as separate workloads so each scales on its own:

- **API server and web app:** at least two replicas behind a load balancer; stateless.
- **Rule worker:** several replicas; one leader runs schedules, and any replica takes a run from the queue.
- **Gateway:** stateless, at least two replicas.
- **Connector workers:** one per connection, each with a network policy generated from its manifest's `hosts`.
- **Every container** runs as a non-root user with a read-only root filesystem, so it runs under OpenShift's restricted security context constraints without exceptions.
- **Credentials** come from the vault through its Kubernetes sign-in, not from Kubernetes secrets.

### 7.3 High-availability Postgres

- A primary with a synchronous replica and an asynchronous one, across zones, with automatic failover: the CloudNativePG operator, Patroni, or a managed service (Amazon RDS, Azure Database for PostgreSQL, Google Cloud SQL). Your choice; Atlas needs only standard Postgres.
- Connection pooling (PgBouncer).
- Events are written in the same transaction as the change (the outbox), so a failover never loses one.
- Row-level security as a second lock behind the API's own checks.

### 7.4 Backups and restore

- **Postgres:** continuous write-ahead-log archiving and nightly base backups to object storage (pgBackRest or the operator's own), encrypted, with one copy that cannot be altered or deleted for its retention period. Restore to any point in time.
- **Knowledge:** your Git host, plus a mirror.
- **Vault:** its own snapshots.
- **Audit log:** your security log system holds an independent copy.
- **Restore is practised,** not assumed: a restore drill every quarter, measured against the targets in [section 7.8](#78-service-levels-for-the-platform-itself).

### 7.5 Zero-downtime upgrades and migrations

- **Expand, migrate, contract.** A release first adds what it needs (a column, a table), then moves data in the background in small batches, and only a later release removes what is no longer used.
- **Each release's database works with the previous release's code,** so a rolling deploy never breaks, and rolling back is starting the previous image.
- **Migrations run as one job** before the rollout, and a release whose migration fails does not roll out.
- **New behaviour behind a switch,** turned on once every replica runs the new code.

### 7.6 Observability

- **OpenTelemetry** traces, metrics and logs from every part, sent to whatever you run (Prometheus and Grafana, Datadog, Splunk, Elastic).
- **One trace** follows a click through the API, the bus, the rule worker, the gateway and the connector, and back. A run's trace id is its run id, so the audit log and the traces join.
- **The numbers that matter:** event lag, connector freshness, rate budget used, rule runs by result, audit write latency, proposal queue age.
- Health and readiness endpoints on every part.

### 7.7 Many clients: multi-tenancy for managed service providers

A tenant is one client organisation. An integrator or managed service provider runs one Atlas for many clients without ever mixing them:

- **Separate by default:** a database (or schema) per client, separate encryption keys, a separate vault namespace and a separate knowledge repository, which can pull from a shared upstream catalogue.
- **Row-level security** as a second lock.
- **Partner staff** get access per client, scoped to the job, never one login across clients.
- **The cross-client view** reads from each tenant through a grant the client can see and revoke.

How a provider and its clients connect, each with its own Keia, is designed in [service-providers.md](service-providers.md): organisations, engagements, who owns what, and federation.

### 7.8 Service levels for the platform itself

Keia Atlas is a service in its own catalogue (Services › Keia Atlas), with an owner, service levels, its connectors as parts of its service map, and its own incidents. When a fault is Atlas's, the incident says so.

Proposed targets for an enterprise deployment:

| Measure | Target |
|---|---|
| Pages and API available | 99.9% a month |
| A record page answers | 95% within 300 ms |
| A change in another system reaches the page | 95% within 30 s (webhook connectors) |
| Each connection reports within its declared window | 99% of windows |
| A rule run starts after its trigger | 95% within 60 s |
| Actions with an audit entry written first | 100%: an action whose entry cannot be written does not run |
| Restore | Data loss of at most 5 minutes; back within 1 hour |

### 7.9 Releases, upgrades and long-term support

- **Today:** version 0.x, a preview with no support guarantee and no long-term-support release; releases roughly monthly.
- **From 1.0 (proposed):** semantic versions; a minor release roughly monthly; one long-term-support release a year, supported with security fixes for 18 months; upgrades supported from the previous long-term-support release and the previous minor; deprecations announced at least one long-term-support release ahead; critical security fixes with a same-day advisory.

---

## 8. Built today and next

| Area | Built today | Next (designed here) |
|---|---|---|
| **Canonical model** | Schemas for every data folder (`schemas/`); connected unit, space, ticket and event (`schemas/connectors/`); stability labels | Person, organisation, agreement; work as one shape across incidents, requests, problems, changes and tasks |
| **Knowledge in Git** | Repo mode: YAML in `data/`, checked by `npm run validate` and cross-reference checks; kept migrations (`tools/migrations/`) | Proposals from the web app becoming pull requests or commits; CODEOWNERS from record owners |
| **Operations in Postgres** | Incidents and projects as YAML; changes to work as events in one browser (`src/lib/live.mjs`) | Postgres behind the storage interface; live updates between everyone |
| **Storage interface** | The registry of folders, schemas and labels (`schemas/registry.yaml`) | `store: knowledge` or `store: operations` per kind; one interface for pages, rules and connectors |
| **Export and snapshots** | The data is already YAML | Signed, permission-aware export; nightly snapshots; tested round trip between the modes |
| **API server** | None | One door to data, OpenAPI, field-level access, audit and event with every write |
| **Auth** | None of its own; host behind your proxy's sign-in | OIDC and SAML, passkeys, SCIM, roles down to the field, break-glass |
| **Modules** | On, Connected and Off in the browser (`src/lib/modules.mjs`); pages for an Off module say so | Manifests, the registry, install and uninstall, soft dependencies, the "remove any one" test |
| **Standing rules** | Rules as data with owners, conditions, caps and ways back (`data/standing-rules/`); the run model (`src/lib/rules.mjs`); "How was this done?" (`HowCard.astro`); runs simulated | The rule worker on real systems; rings, ceilings, kill switches, dry run |
| **Agents' identity** | None | One workload identity per rule, per-run tokens, Settings › Automation |
| **Keia gateway (MCP)** | Planned tools printed from each manifest (`npm run connect -- <id> --manifest`) | The gateway: per-tool authorisation, caps, audit, no token passthrough |
| **AI** | None acts; Ask, where present, answers from demo data and says it is AI | Model policy per task kind, local or hosted or off; quarantine for untrusted text; evaluation sets |
| **Audit log** | Its shape on `/support/log/`, with demo entries | Append-only, hash-chained, copied to your security log system |
| **Connectors** | Kit v0: adapter interface, manifest schema, field ownership, secret redaction, CSV and NetBox file importers, read only (`tools/connectors/`) | Live adapters (webhooks, polling, reconcile), approved writes, isolated workers, rate budgets, Partner tier, SDK additions |
| **Security** | Vault references enforced; classification labels; SHA-pinned actions; digest-pinned images; Dependabot with cooldown; gitleaks; Scorecard; non-root container | Label-driven access and redaction; job-scoped vendor access; signed releases and an SBOM (the workflow is written; the first release is to come); SLSA provenance |
| **Search** | In the browser, over the built site | Server index filtered by permission at query time |
| **Running it** | Static site; Dockerfile and `compose.yaml` serving it; GitHub Pages for the fictional demo | Compose file for a small team; Helm chart; OpenShift; HA Postgres; backups and restore drills; zero-downtime migrations |
| **Observability** | None needed for a static site | OpenTelemetry throughout; run id as trace id |
| **Multi-tenancy** | One organisation per copy | Tenant per client, isolated databases, keys and vault namespaces |
| **Platform service levels** | None | Atlas in its own catalogue, with the targets in section 7.8 |
| **Releases** | 0.x preview, roughly monthly | Semantic versions from 1.0; a yearly long-term-support release |

---

## 9. Open decisions

Written down so they are decided on purpose, each with a record in [`docs/decisions/`](decisions/) when it is made:

- **The event bus at scale.** A Postgres-backed queue (the outbox, read with row locks) is enough for most organisations and adds nothing to run. When one Postgres is not enough: NATS JetStream or Kafka behind the same interface.
- **The server's language.** TypeScript on Node, like the tools today, is the working assumption.
- **The module package format:** a signed archive, and whether modules are distributed through an OCI registry alongside the container images.
- **Which Git hosts come first** for proposals as pull requests.
- **Which live connectors come first:** one service-management tool, one device platform and one network controller, chosen by the first teams who run it.

---

Copyright Red Hat, Inc. Created by Keith Brady. Keia Atlas is licensed under the Apache License 2.0.
