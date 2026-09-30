# Keia Atlas for the whole industry: service providers and engagements

How Keia Atlas works for everyone who builds and runs workplace technology, not only the company whose offices it is: integrators, AV companies, IT service providers, managed service providers on site, maintenance vendors and manufacturers, each working with their clients' Keia.

This is a design document, marked like [architecture.md](architecture.md):

- **Built**: in this repository today, with the file named.
- **Designed**: written down here, not built yet.

> **Where it stands:** the model, the scope filter and a demo slice are built on simulated data (`src/lib/engagements.mjs`, tested in `tests/engagements.test.mjs`). Nothing is exchanged between two real Keias yet: that needs database mode and the API ([architecture.md, section 8](architecture.md#8-built-today-and-next)).

## In one minute

- **Every organisation runs its own Keia.** A client, an integrator, a managed service provider and a manufacturer each keep their own records, in repo mode or database mode.
- **An engagement links two of them.** It is signed by both sides and says who is the client and who is the provider, the role, the scope (sites, spaces, projects and the kinds of record that flow), the dates and the agreement (service levels).
- **Federation, not one shared database.** Each side keeps its own Keia and exchanges scoped, signed records and events over the engagement. Both sides hold the audit trail. Revoking stops the flow; each side keeps its copy of what was already shared.
- **The client owns its places and records; the provider owns its own work.** Shared records (jobs, as-builts, handovers, visit readiness) carry both marks, with field ownership as the [connector model](connectors/model.md#who-owns-each-field) sets out.
- **A provider sees one Home across every client**, and each client's data stays separate. Nothing crosses from one client to another.

---

## 1. Organisations

An organisation is anyone with its own Keia: a company with offices (the client), or a company that works for one (the provider). The same software serves both; only the records differ.

| Kind | Examples | What its Keia holds |
|---|---|---|
| **Client** | A company with offices, a hospital group, a university | Its places (sites, floors, spaces), its units, its standards, its incidents and projects |
| **Provider** | AV integrator, IT service provider, managed service provider on site, maintenance vendor, manufacturer | Its clients (as engagements), its crews and rotas, its work notes, its costs, its own templates and device library, and its copies of what clients shared |

One organisation can be both: an IT service provider that runs its own office is a client of its own Keia.

**Person** and **organisation** become record kinds in the canonical model (designed in [architecture.md](architecture.md#the-parts)). A person belongs to one organisation and signs in through that organisation's identity provider. They never get an account in another organisation's Keia: they act there only through an engagement.

**Built:** the organisations in the demo are listed in `ORGS` in `src/lib/engagements.mjs`. **Designed:** `organisation` and `person` as schemas in `schemas/connectors/`.

## 2. Engagements

An engagement is a signed link between two organisations: one client and one provider.

```yaml
id: aigna-northlight
client: aigna
provider: northlight
role: integrator             # integrator | managed | maintenance | manufacturer
start: 2025-04-01
end: 2027-03-31
signed: 2025-03-14           # by both sides, with the data processing agreement
scope:
  sites: [nyc, chi, tor, jnu]
  projects: [PRJ-14]
  kinds: [site, job, visit, as-built, handover, design]   # the records that may flow
agreement:
  ref: AG-INT-2025-04
  sla:
    - { what: Snag fixed after handover, target: 10 working days }
    - { what: Site survey after request, target: 5 working days }
```

**The roles:**

| Role | What the provider does | Typical scope |
|---|---|---|
| **Integrator for a project** | Designs, installs and hands over one or more projects | The project's sites and spaces; jobs, as-builts, handovers, design proposals |
| **Managed service on site** | Runs the client's rooms day to day, often with resident technicians | Every site in the contract; jobs, room checks, visit readiness, handovers |
| **Maintenance vendor** | Break-fix and preventive maintenance under a contract | The covered sites or models; jobs and visits |
| **Manufacturer** | Firmware, known errors, warranty and support cases | The client's units of its models; support cases |

**Scope** has three parts: *where* (sites, spaces and projects), *what* (the kinds of record that may flow) and *which work* (only jobs and visits handed to this provider, even at a site in scope). The client sets the scope. Changing it is itself an entry in both logs, and the next record follows the new scope.

**Agreement** carries the service levels, the term, the data processing agreement and the security assessment. For Aigna's vendors the contract in `data/vendors/<id>.yaml` is the agreement's master today.

**Paperwork before data.** No record flows until the engagement is signed by both sides and the data processing agreement is in place (the rule the Vendors pages already show).

**Built:** `ENGAGEMENTS` in `src/lib/engagements.mjs` (six engagements, simulated). **Designed:** `agreement` and `engagement` as schemas, and the signing flow.

## 3. Who owns what

| Records | Owner | Over an engagement |
|---|---|---|
| Sites, floors, spaces, units, standards | The client | The provider reads the ones in scope |
| Floor plans, IP addresses, switch ports, camera and door positions | The client | Never shared (Restricted, [architecture.md 6.4](architecture.md#64-labels-decide-who-sees-what)); a job that needs one gets the fact it needs, on the job |
| Jobs handed to the provider | Both marks | The client owns the state and priority; the provider owns its own status and reference; both are shown ("Waiting on parts · Northlight: Awaiting RMA") |
| Visit readiness | Both marks | The provider books; the client confirms access; both see what is missing |
| As-builts | Both marks | The provider sends; it lands in the client's record as a reviewed change |
| Handovers | Both marks | The provider hands over; the client accepts |
| Design proposals | The provider, until accepted | Drafted in the provider's Keia and proposed; accepted, it becomes the client's project |
| Crews, rotas, work notes, internal costs and margin | The provider | Never shared |
| The provider's other clients | Each of them | Never visible to anyone else |

**Field ownership** follows the connector model: a field is owned by one side, an import never overwrites a value the other side owns, and comments and work logs are append-only on both sides, so they never conflict. A shared record carries both source marks (`source` and `field_sources` in the [connector model](connectors/model.md#the-source-mark)).

## 4. How two Keias connect

**Federation, not one giant shared database.** A single shared database would put every client's floor plans and every provider's costs in one place, and make one breach everybody's breach. Instead each side keeps its own Keia and its own copy, and they exchange scoped records and events over the engagement.

```
  Client's Keia                                     Provider's Keia
  ┌───────────────────┐   engagement (signed)   ┌───────────────────┐
  │ places, units,    │ ── scoped records ────► │ copies of what    │
  │ standards, jobs   │    and events           │ is in scope       │
  │                   │ ◄── as-builts, status ─ │ crews, notes,     │
  │ audit log         │     readiness, designs  │ costs (never out) │
  └───────────────────┘                         │ audit log         │
                                                └───────────────────┘
```

- **Scoped.** Every outgoing record passes the scope filter first (section 6). Nothing else leaves.
- **Signed.** Each record or event is signed by the sending organisation and checked by the receiver. The engagement id rides in every envelope (CloudEvents, as [architecture.md](architecture.md#the-parts) designs the event bus).
- **Audited on both sides.** The sender writes "shared", the receiver writes "received", each in its own append-only log. Either side can show an auditor what crossed and when.
- **Revocable.** Revoking stops the flow at once, in both directions. Each side keeps its copy of what was shared before, marked as a copy from an ended engagement; nothing new arrives and nothing is pulled back from the other side's store. The revoke is itself an entry in both logs.

**By mode:**

| | Repo mode | Database mode |
|---|---|---|
| Out | A signed export of the records in scope, in the repo mode folder layout ([architecture.md 2.4](architecture.md#24-snapshots-and-export)) | Events and records over the API, pushed as they change |
| In | A pull request on the receiver's repository, which a person reviews and merges | A write through the receiver's API, into a review queue where the record kind needs one |
| Mixed | A repo-mode client and a database-mode provider work together: exports go one way, API writes become pull requests the other way |

**Capture, don't ask.** When a provider hands over, its as-built (what is installed where, serials, MACs, drawings) lands in the client's record as a reviewed change: the delivery engineer sees the difference and accepts it, and nobody retypes a spreadsheet. This is the method's "capture, don't ask" at the boundary between two companies.

**Built:** the scope filter and the both-sides log in the demo. **Designed:** signed envelopes, exports, the API exchange, the review queue.

## 5. The provider's portfolio

A provider has one Home across all its clients:

- **Clients as cards,** worst first, each with its answer sentence: "Aigna: 3 jobs open, 1 past target".
- **Crews on site today,** visits this week with their readiness, and renewals, soonest first.
- **Opening a client** shows only that engagement's view: the client's sites in scope, the jobs handed to the provider there, the service levels, this week's crews and visits, what stays with each side, and the engagement itself.

**Each client's data stays separated.** The portfolio is drawn from each engagement on its own and only adds up counts. No page, search or export mixes two clients' records, and a record reaches a client page only through that client's engagement. In database mode this is the tenant separation of [architecture.md 7.7](architecture.md#77-many-clients-multi-tenancy-for-managed-service-providers): a store per client, keys per client, and the cross-client view reading each tenant through a grant the client can see and revoke.

**Built (simulated):** the Home for a provider with more than one client (`src/components/PortfolioHome.astro`, `src/lib/homecore.mjs` kind `provider`), `/portfolio/` (every client), `/portfolio/<engagement>/` (one client) and `/portfolio/<engagement>/engagement/` (the provider's side of the engagement).

## 6. The scope filter

One rule, used by every page, export and event (`reach()` in `src/lib/engagements.mjs`, **built** and tested):

1. An organisation always sees its own records.
2. A record kind that never flows (Restricted places, crews, notes, costs) is never shared.
3. A provider sees a client's record only through an active engagement between them, only when the kind is in the scope, only when its site or project is in the scope, and, for work, only when the work was handed to that provider.
4. A client sees a provider's record only when the provider shared it over their engagement.
5. After a revoke or the end date, nothing new flows; records shared before stay as kept copies.

The tests in `tests/engagements.test.mjs` check that a provider sees only in-scope records, that a job at an in-scope site handed to another provider stays hidden, that nothing from one client reaches another (not even through the provider they share), that the provider's crews, notes and costs never reach a client, and that revoking stops the flow while each side keeps its copy.

## 7. Design and pre-sales

A provider can draft a design in its own Keia before any contract: space types, the bill of materials drawn from the shared device library, and the drawings. It proposes the design to the client as a project. The client sees it as a proposal, compares it with its own standards and space types, and decides. Accepted, it becomes a project in the client's Keia, with the provider engaged as integrator for it; declined, it stays with the provider.

**Built:** "Propose a design" on the client page when design is in scope (simulated). **Designed:** the proposal record, the comparison with the client's standards, and turning an accepted proposal into a project.

### 7.1 Winning the work: design, quote, statement of work, accepted

**The edge is the unbroken thread.** A design is drawn from the space types and the device library; its bill of materials prices the quote; the design and the quote write the statement of work; accepted, the design crosses the engagement as a proposal, becomes the client's project, and its BOM becomes the install positions the build sheets start from; the as-built comes back as a reviewed change. Nothing is typed twice, and every line says where it came from: the space type's **standard**, the device **library**, or **changed** by a person.

**What it is not.** Keia Atlas does not rebuild accounting, invoicing, a PSA (ConnectWise, Halo, Simpro) or a quoting tool (D-Tools, Jetbuilt). It keeps the thread and hands the money to the tools that already do it.

| Step | What Keia does | Where the words come from |
|---|---|---|
| Opportunities | A small pipeline by stage (lead, design, quoted, accepted, lost), each with its value and one sentence | The provider's own records |
| Design | Spaces, a space type and build option per space; the equipment fills from the option and the library; a person changes quantities and models | Space types, device models, the client's spaces over the engagement |
| Bill of materials | Each room's lines roll up to the project's, by model, with the rooms and marks each carries | The design |
| Labour | Install per unit (by device class), configure per unit (from the setup guide's settings), commission per room, manage as a share; rates by role | Task types and setup guides |
| Quote | Cost, sell and margin by line and in total; options priced on their own; versions with a line-by-line difference; validity and terms | The BOM, the labour, the provider's price list and terms |
| Statement of work | Scope per room, deliverables, assumptions, exclusions, the client's part, acceptance, timeline, change control, price; printable | The design, the quote, the terms, the space types' outlets, and Keia's verification |
| Accepted | The design crosses as a proposal, lands in the client's review queue, becomes a project; its BOM becomes each space's install positions | The engagement, the design |

**Acceptance is Keia's verification.** The statement of work's acceptance criteria are the ones Keia checks anyway: each unit read back against its setup guide, and each room's test (the space type's verification) passed.

**Connects to** (designed, not built): **Xero or QuickBooks** for invoicing, from an accepted quote's payment schedule; **D-Tools or Jetbuilt** import, a project from a quoting tool brought in as a design and matched to the space types and the library.

**Built (simulated):** `src/lib/provider-sales.mjs` (the maths, tested in `tests/provider-sales.test.mjs`), Northlight AV's records in `data/providers/northlight/sales/` (schema `schemas/ext/provider-sales.schema.yaml`), and the pages under `/portfolio/sales/`: the pipeline, a design, its quote, the statement of work and Accept. Behind the Provider sales capability (Vendors, on by default). What is simulated is listed in [gaps.md, gap 48](rules/gaps.md). **Designed:** saving a draft as a new version, the proposal record crossing a real engagement, and the connections above.

## 8. Standards

**The client's standards win.** Work for a client follows that client's house standards, space types and setup guides. A provider can offer its own standards as a template: the client can adopt any part, which becomes the client's own, reviewed like any other change to a standard. A provider working for many clients keeps its templates in its own Keia and never applies them to a client's records by itself.

**Built:** "Offer your standards as a template" on the provider's side of the engagement (simulated).

## 9. On the demo

Aigna is the demo company. Northlight AV, its integrator in the Americas, has two more clients, made up for the demo: Fenwater Health (a hospital group, managed service on site) and Quillmark Publishing (a publisher, maintenance). They are lightweight data: sites, open jobs and service levels, marked as made-up on every page.

- **As Sam Okafor (Northlight AV):** Home is the portfolio. "Your clients" in the sidebar lists every client; each opens only its engagement's view.
- **As Aigna staff:** under Vendors, each provider's record shows its engagement and what it can see; the engagement page shows the scope, the role, the service levels, what is shared and who owns it, the log, and Revoke (simulated).
- **Anyone else** opening a provider's pages sees a line saying whose Keia they belong to, not the data.

In the demo the two sides are pages of one site, so the separation is shown and tested rather than enforced by two servers.

## 10. Business fit

Every feature here is open, for everyone: engagements, the scope filter, the portfolio, federation between two Keias in either mode, and the exchange formats. An integrator can run its own Keia for free, and a client never pays to let its providers in.

Where a paid service could fit, without closing anything: **hosted multi-client operation** for providers that would rather not run it themselves. That means running a provider's Keia and its clients' tenants with the separation of [architecture.md 7.7](architecture.md#77-many-clients-multi-tenancy-for-managed-service-providers), backups, upgrades and service levels for the platform itself. Anyone can run the same thing on their own.

## 11. Open decisions

- **Signing.** Which key each organisation signs with, and how a receiver learns it (a published key per organisation, or keys exchanged when the engagement is signed).
- **Scope at field level.** Whether a scope can name fields (share a job without its priority) or only kinds, sites and projects.
- **A client with several providers on one job.** Whether a job can be handed to two providers at once, or is split into one job each.
- **Discovery.** How two organisations find each other to start an engagement: an invitation link from the client, or a directory.

---

Copyright Red Hat, Inc. Created by Keith Brady. Keia Atlas is licensed under the Apache License 2.0.
