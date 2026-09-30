# Keia Atlas roadmap

Keia is a way of running IT from one living record of every room, device and job: kept by the work itself, readable in a minute, as deep as you need. Keia Atlas is the software that runs the [Keia Method](docs/keia-method.md).

This roadmap is an order of work, not a set of dates. Each step is useful on its own. Nothing here is promised for a particular release.

## The scope rule

- **Own:** Atlas owns the record of what is in the building and the work on it.
- **Connect:** it connects to the systems that run each technology.
- **Leave alone:** anything that is a whole product of its own (print queues and secure release, running DNS and DHCP, switch configuration, watching or retaining video, issuing access credentials, HVAC control, soft services, software licence compliance beyond workplace technology, laptops and phones).

Real estate and property services (IWMS, CAFM, leases, space planning, moves) are connect-only: Atlas reads and writes space data, and never owns them.

## v0.1: preview (today)

A working demo of one fictional company's estate, with simulated live data. Repo mode is real: every page is built from YAML files checked by schemas, and the site runs anywhere static files can be served. Database mode, sign-in and live connectors are on the roadmap below.

What is in it:

- **Locations:** ten offices in three regions and the home offices; floor plans and an interactive 3D model of each office (cable runs from patch panel to wall plate, internet circuits in); comms rooms sized to what they serve; IT stores with spare units.
- **Rooms and room profiles** drawn to scale, each room's devices, wall plates and cable routes; a one-screen room guide (QR code) for reporting a problem in two taps.
- **Devices:** device profiles, 66 models with ports from manufacturers' public documents, configurations with a setup order, a standards library for integrators, manufacturers' known issues matched to the fleet, a Lab for firmware and new devices.
- **Services:** fleet health for audio visual, network and infrastructure (simulated feeds, labelled).
- **Work:** Home pages per role, a schedule across offices, projects with a Deploy flow ("verify, don't tick"), build sheets with every setting's value per unit, incidents, playbooks, and planning by financial year (budget, scenarios, hours).
- Help on every page, one motion system, five looks, light and dark, responsive from phone to large screen.

What is real today: schemas, validation, floor plans, drawings, build sheets, the room guide. What is simulated: live health, bookings, every connector. What is next: the API, export, database mode. The page says so wherever a figure is simulated. Nothing writes to any real system.

## v0.2: words, structure and the office

- One vocabulary from the Keia Method: Spaces and Space types on screen (data already uses them), Assets and Inventory, Setup guides, Support, Projects and the Programme, Knowledge; the Keia Method's verbs and statuses ("Ready for you", "With ...", "Unable to complete", "To review").
- The new sidebar: Home, Locations, Services, Assets, Support, Projects, Vendors, Team, Knowledge; modules that are On, Connected or Off; the sidebar shows only what is on.
- **The office page with the floor plan:** 2D by default, 3D optional; every device a circle coloured by health with hover detail; filters by floor, space type, device type, health and service; who is on site; experience centres marked.
- **The front door and the method pages:** a landing page with two doors, "Try it" and "Read the method"; the method explained visually (the problems, the shifts as before and after, the five ideas with live examples, the vocabulary, a fair comparison with ITIL, ITSM tools and PMI / PRINCE2, start with one module).
- **Aigna through time:** the demo company at three sizes from its own history (one office and one IT generalist; four offices and a small team; the global estate), so the same site shows the method for one person and for a thousand, and shows which modules each size has on.
- Setting up: import from spreadsheets, discovery through connectors, trace a floor plan from a PDF or image; the first importers from ITSM tools and integrator handover documents.

## Then, in order

Connector names for each item are in [Connectors by module](#connectors-by-module) at the end.

1. **Support:** one queue for incidents, requests, problems and changes, with hand-offs and the incident story on the space drawing. Priority is proposed from impact and urgency, and a person may change it. Standing rules (standard changes approved once, run automatically, checked by read-back, recorded, with Undo or Roll back), the change calendar on the floor plan, a phone view for technicians, and service-management tools as optional connections.
2. **Services:** Audio visual, Network, Infrastructure with continuity risks, Security, Printing, Home offices, and Atlas itself as a service, each with service levels, experience measures and a service map lit by health. Room analytics and occupancy read from room systems and sensors, counted and never identified; energy per space with standby schedules; network readiness checks for AV over IP (QoS, multicast, PTP, AV VLANs). Meeting-platform certification and compatibility in the device catalogue, and accessibility and meeting-equity capabilities (hearing loops to IEC 60118-4, captions, intelligent framing, wireless presentation) on each space type, with AVIXA standards referenced by number.
2a. **Room booking, own or connected:** booking on the calendar platforms, room panels and the floor plan, with desk booking on the same plans, or a connector to the booking tool you already run. Booking knows space health, so it never offers a room whose display is down and moves the meeting when a space fails.
2b. **Digital signage, own or connected:** light signage (content to players, playlists, emergency messages using the Common Alerting Protocol, room-status and wayfinding screens driven by Atlas data), or a connector to the signage platform you already run.
3. **Projects, a full project management tool:** portfolio and programme, planning, work breakdown, Gantt and timeline with dependencies, resourcing and capacity, RAID log, budgets and reporting; the project page with charter, gates, scope changes, lessons and benefits; events in experience centres as work; playbooks; connectors to work-management tools. Integrators deliver projects in the same tool, and the as-built record becomes the customer's operational record.
4. **Vendors:** contracts and renewals (support, licences, warranties, certificates), cases, performance against support levels, spend.
5. **Knowledge and collaboration:** articles, runbooks, room guides, lessons, proposals, glossary with owners and review dates; comments and @mentions on every record; a "For you" feed. Sharing out to office and chat platforms, with replies coming back as comments.
6. **The device catalogue and the community catalogue:** device types, models, drawings, ports, firmware lines, known errors, advisories and compatibility as a shared catalogue any team can use and extend; facts, summaries and links to manufacturers' documents, never copies.
7. **Zoom, maps and timelines:** one continuous zoom from region to port; service maps; the incident story; the programme timeline; the change calendar on the floor plan.
8. **Connector kit:** the open connector specification, a template connector with tests, and contributor documentation, so anyone can add a source (fleet tools, network controllers, booking systems, monitoring, identity, service management). AV control and monitoring platforms supply status and health. A reboot runs under a standing rule; firmware updates and configuration pushes are proposals a person confirms.
9. **Accessibility and languages:** WCAG 2.2 AA throughout; interface strings in one file per language; formats by location.
10. **Database mode:** a database behind a small server, with sign-in, real role-based access, live collaboration, an API, full export and live connectors one at a time; YAML stays as import, export and seed data. Real automation: agents under standing rules with their own service accounts, least privilege and a full audit trail; you choose the AI model and where it runs, including local models on your own servers, or turn AI off. What enterprises need before they adopt: single sign-on (SAML and OIDC), audit logs, EU data residency as a standard option, backups and restore, high availability, a published threat model (what an attacker learns from an estate model, and how the platform limits it), and SOC 2 and ISO/IEC 27001 as targets, not claims.
11. **Migration in:** importers from service-management tools, spreadsheets and integrator handover documents, so switching is realistic.

## Beyond meeting rooms: the whole workplace estate

Workplace technology is more than meeting rooms. The scope rule above applies to all of it. In order:

1. **Print as a service:** printers as devices in spaces with health, meter reads and consumables read from managed print and print-management platforms; pages and energy as a sustainability measure.
2. **Power and comms rooms:** UPS runtime and PDU metering as live health; switched outlets for power-cycling under standing rules; energy per rack.
3. **More network connectors:** more network controllers beside the ones in the demo; network monitoring; IPAM and DNS; circuit measures against the carrier's service level; Wi-Fi surveys imported onto the floor plan.
4. **Physical security devices** (door controllers, readers, cameras, recorders) as devices in spaces with read-only health from access-control and video platforms; a privacy record per camera and microphone on the space page (purpose, retention, the notice in the room). Atlas never views video or issues credentials.
5. **Events before incidents:** alerts from any source (SNMP, syslog, traps, observability tools) deduplicated and correlated to the device, the space and the last change before one becomes an incident; two-way with the observability tool you already run.
6. **Disposal records** on every device's history: the disposal vendor, chain of custody, the wipe or destruction certificate, WEEE evidence.
7. **The room account and licence** for each meeting-room platform, as a live record on each space, with renewal and compliance state read from the identity and collaboration tenants.
8. **Building and facilities:** occupancy sensors as room-analytics sources that count and never identify; building management systems read over BACnet for comfort and comms room environment; facilities companies as partners. Space data is read from and written to IWMS and CAFM platforms; Keia never owns leases, space planning or moves.
9. **Asset management sync and discovery** with asset tools; **home-kit logistics** (ordering, tracked shipping, collection on leaving) through logistics services.
10. **Standards mapping extended:** ISO/IEC 19770-1 (IT asset management), ISO 41001 (facility management), NIST CSF 2.0, BICSI 002 and TIA-942 for comms room design, and the EU NIS2 directive's supplier and incident duties, supported and never claimed.

## Not now

- **Laptops and phones.** Endpoint tools already manage them; Atlas covers the workplace and the home-office kit around them.
- **AR headsets.** A QR code and a call with the record open does the same job with kit people already carry.
- **A certification programme.** People get good through use; a certificate would become an entry fee.
- **A foundation.** A project this young needs users and maintainers before it needs a legal home of its own.
- **A2A agent protocols.** Agents act only under standing rules inside Atlas; talking to other agents waits until those rules are proven.
- **Owning any property-services function.** Leases, space planning, moves and soft services are another profession's record; Atlas exchanges space data with them.

## An open project people can rely on

Written down in the repository, so "who maintains this in five years?" has an answer: named maintainers and how one becomes one; how decisions are made and recorded (`docs/decisions/`); a release cadence with long-term support versions; a security disclosure policy (`SECURITY.md`) with a private channel and a response time.

## Partners: vendors, integrators and managed service providers

Most workplace technology is designed, installed, monitored and fixed by partners. The method's rule, that a hand-off to a vendor is the same as a hand-off to a colleague, is built into Atlas in this order:

1. **Partners inside the customer's Atlas.** A vendor, integrator, on-site managed service provider or manufacturer is an organisation with its own people and scoped, time-limited, audited access: only their contracts, the sites, spaces and devices they service, and the work handed to them. Their on-site technicians appear in Team and Schedule marked as partner staff, take work, follow standing rules and use the same phone view. Performance against the contract (response, fix, RMA turnaround, experience measures) is measured from the records, with no manual reporting. A Partner role in the demo first; real partner access with database mode.
2. **Partners who keep their own tools.** Two-way connectors to the service management and PSA tools, AV design and quoting tools and AV monitoring platforms that integrators and managed service providers already use, so their ticket and our incident stay in sync. Before a partner is let in: a vendor security assessment and a data processing agreement (GDPR), recorded with their expiry.
3. **Project delivery end to end.** The integrator's design and bill of materials import into the project; their engineers commission in Atlas (build sheets, verify not tick); the as-built record becomes the operational record at handover. No PDF handovers.
4. **Integrators and managed service providers running Atlas for many clients.** The client as the level above everything: a client switcher and a cross-client view, and the same product underneath. Customer-run and integrator-run instances exchange work and records through the connector layer and the open data standard.
5. **The method for partners.** Integrators and managed service providers can adopt the Keia Method in their own service offerings; it is CC BY-SA 4.0.
6. **Keia Atlas for integrators and service providers.** The same product and codebase with a different module set, not a separate product: room and system design (from the space types, device types, drawings and the device catalogue), project delivery and commissioning, integrations management, service contracts and service levels, and multi-client. Quoting, pricing catalogues and CAD are connected, not rebuilt.

## The employee side

The people who use the spaces are an audience in their own right: the room guide from the QR code in the room (how to start a meeting here, share a screen, book it), reporting a problem in two taps, and a request in three. No sign-in, no console.

## Leadership

A leadership view (the estate, services within target, experience measures, the programme and spend on one screen) and a method page, "The case for leadership", with a cost model whose assumptions are shown as figures the reader can change: tool licence costs against open source, time saved (consoles, reports, audit preparation, status meetings), room downtime avoided, fewer site visits, vendor spend and performance made visible.

How we will know it works:

- Meeting-start delay.
- Lost time per incident.
- Reassignment rate.
- Remote fixes against site visits.
- First-time fix.
- Tool count.
- Audit preparation hours.
- Idle-hours energy.

## Also on our mind

- An open data standard for describing workplace technology (spaces, devices, wiring, standards), building on Keia's schemas, so estates, catalogues and tools can exchange data.
- A community device catalogue maintained in the open.
- Privacy for sensors, cameras and microphones in spaces (GDPR): what is recorded, for how long, and the notices in the room.

## How to influence it

Open an issue with the problem you have and how you work today. The order above changes when a real team needs something sooner.

## Connectors by module

Examples, not a promise of each one. Any tool can be added through the connector kit.

| Module | What flows | Examples |
|---|---|---|
| Support | Tickets both ways, with both states shown | ServiceNow, Jira Service Management |
| Services | Meeting-platform certification and compatibility | Microsoft Teams, Zoom, Google Meet, Dante |
| Room booking | Calendars, bookings, room panels, desks | Microsoft 365, Google Workspace, Microsoft Places, Robin, Condeco and Eptura, Joan, Zoom Workspace Reservation |
| Digital signage | Content, playlists, player health | Appspace, Xibo, BrightSign, Samsung VXT, LG, ScreenCloud, Yodeck |
| Projects | Tasks, dates, dependencies | Jira, Microsoft Project and Planner, Asana, monday.com, Smartsheet |
| Knowledge | Shares out, replies back as comments | Microsoft 365, Google Workspace, Slack, Zoom |
| AV control and monitoring | Status and health; reboots under standing rules | Crestron XiO Cloud, Q-SYS Reflect and Core, Biamp SageVue, Extron GlobalViewer, Utelogy, Domotz |
| Identity | Sign-in (SAML, OIDC) | Microsoft Entra ID, Okta |
| Migration in | Records imported once | ServiceNow and other service-management tools |
| Print | Health, meter reads, consumables | Xerox, Ricoh, HP, Canon, Kyocera, Konica Minolta, Lexmark; PaperCut, uniFLOW, Printix, Microsoft Universal Print |
| Power and comms rooms | UPS runtime, PDU metering, switched outlets | Schneider EcoStruxure IT, Eaton, Vertiv, Legrand |
| Network | Device health, monitoring, addressing, Wi-Fi surveys | UniFi and Netgear (in the demo); Cisco Meraki, HPE Aruba Central, Juniper Mist, Fortinet; Auvik, PRTG, LogicMonitor; Infoblox, NetBox; Ekahau, Hamina |
| Physical security | Read-only device health | Genetec, LenelS2, Brivo, Verkada, Avigilon Alta, Axis, Milestone |
| Events | Alerts in, correlated to device and space | Datadog, Grafana, Splunk |
| Room accounts | Account, licence, renewal | Microsoft Teams Rooms, Zoom Rooms, Webex |
| Building and facilities | Occupancy counts, building readings, space data both ways | VergeSense, Butlr, Density, Disruptive Technologies; Eptura, Planon, Spacewell, FM:Systems |
| Assets | Sync and discovery | Lansweeper, Snipe-IT, ServiceNow |
| Home-kit logistics | Orders, shipping, collection | Firstbase, Hofy, Deel |

---

Copyright Red Hat, Inc. Created by Keith Brady. The Keia Method text is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Keia Atlas, the software that runs it, is Apache 2.0.
