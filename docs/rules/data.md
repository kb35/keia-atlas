# Data

Keia Atlas's knowledge is plain files anyone can read and review. The schema is the contract between copies.

### F1. YAML, checked by schema

Data lives in `data/`, a folder per kind of thing, each checked by the JSON Schema (2020-12) that `schemas/registry.yaml` names. The Keia framework's core schemas are pinned and never edited; Keia Atlas's own ideas go in `schemas/ext/`. Change the schema first, then the data.

- **Why:** a copy that passes the same schemas can exchange data with any other.
- **Do:** describe every field in the schema.
- **Don't:** put data in a page or a component.

### F2. Checks stop the build

`npm run validate` checks every file and cross-checks references: cables fit both ends, no port is used twice, enough outlets, unique serials and asset tags. Then `npm test` and `npx astro build`. It also reports standards coverage: every must rule in `data/standards/` names how it is proved (`record:` a field, `on-site` or `connect`), and the report lists each rule whose field no record carries, so a rule is never written that no page can show (`tools/coverage.mjs`).

- **Why:** a wrong fact caught at build time never reaches a technician.
- **Do:** run all three before committing.
- **Don't:** skip a failing check.

### F3. Every fact has a source

Sources live in `data/sources/` with a `last_verified` date; a model says which source provides what. Unknown is a valid answer, recorded under `gaps`; a guess is not.

- **Why:** people trust what they can check.
- **Do:** say "Unknown" and why.
- **Don't:** fill a gap with a typical value.

### F4. Real where public, made up where private

Device facts and space guidelines are public and cited. The company, sites, people, serials and incidents are made up.

- **Why:** the open version must be safe to publish.
- **Do:** follow the demo's naming (trees for buildings, birds for spaces).
- **Don't:** copy anything from a real building or company.

### F5. Retire, don't remove

A record no longer current gets a retired or archived status with a date and reason; its file stays.

- **Why:** refresh plans and audits need the history.
- **Do:** keep old models and old installs.
- **Don't:** delete a file to shorten a list.

### F6. Reshape data with a migration you keep

When the model changes (two phases become one, anonymous groups become one space each), a one-off script in `tools/migrations/`, named by date, rewrites the data. Run it once, commit its output with it, and keep the script.

- **Why:** a reviewer can see how every file changed and why, and nothing is typed in by hand.
- **Do:** keep every fact the old shape held (dates, summaries, sign-offs, asset tags), and say in the script where each went.
- **Don't:** hand-edit a hundred files, or delete the script once it has run.

### F7. Home offices are spaces, never people's addresses

Each home office is a space at its region's remote site, labelled by town and number, with its country and nearest office. A person's `base` links to it.

- **Why:** the schedule needs to know who is at home and where their kit is; nobody's address belongs in Keia Atlas.
- **Do:** "Bray home office 1", near the Dublin office.
- **Don't:** a street, an eircode or a person's name in a space name.

### F8. A manufacturer's known error stays the manufacturer's

Known errors (`data/known-issues/`, decision 0029) keep what the manufacturer published: its reference, models, versions, fix and source. Anything Aigna adds says so: a workaround the manufacturer didn't publish is `from: aigna`, a reading of an unclear version list goes in `affected_note`, and a made-up feed or issue says `demo: true` and cites a demo source (the checks refuse a mix). Matching an incident or raising a case with the manufacturer is always a person's decision, recorded with who and when.

- **Why:** a service manager quotes a known error to the manufacturer and to the team; it must be exactly what the manufacturer said, and Keia Atlas's guesses must never look like the manufacturer's words.
- **Do:** "Poly lists this as fixed in 5.0.1 and doesn't say which earlier versions have it. Aigna reads it as every version before 5.0.1."
- **Don't:** invent a manufacturer reference, a workaround or a fixed version, or close, link or send anything without a person.

### F9. Made-up buildings say so, and use no real names

Floor plans, trays, cable runs and circuits (`data/floors/`, `data/runs/`, `data/circuits/`) are invented for the demo, so every floor carries the label in `FICTION` (`src/lib/floors.mjs`): "Fictional floor plan: space sizes from the space types; layout, trays and cable lengths made up for the demo." Every map and 3D model shows it, and the checks fail a floor file without it. Labels on made-up things are generic: providers are "Carrier One" and "Carrier Two", never a real company; buildings have no street address; serials start `DEMO-`.

- **Why:** a plan that looks real is easy to mistake for a survey; the label and generic names keep the demo honest and keep real companies' names off made-up faults.
- **Do:** space sizes from the space types, within their area range; "Carrier Two (secondary, north duct)"; a circuit's bandwidth, ID, service level and support desk made up for the demo and marked `demo: true`, with a desk and an account reference, never a person or a phone number.
- **Don't:** a real provider's name, a real building's address, or a floor plan without the label.

### F10. Every fact carries a label, and the label decides who sees it

Four labels. **Public**: facts about models (ports, drawings, datasheets, space types, manufacturers' known errors). **Internal**: facts about Aigna that staff may see (rooms, units, incidents, projects, budgets). **Restricted**: facts about Aigna's buildings that would help an attacker: floor plans, camera and door-controller positions, IP plans and VLANs, racks and switch ports, the vulnerable-firmware list (units matched to a manufacturer's known error), who at a vendor can reach Aigna's systems, and whether a unit still has its default password. **Secret**: credentials and break-glass details, which never sit in `data/`, only the name of a vault entry (the secret check in `tools/secrets.mjs`).

Each folder's default label is `classification` in `schemas/registry.yaml`. A field more sensitive than its folder carries `x-classification: Restricted` in its schema (install units' `default_password_changed`, vendors' `people`). Views worked out from several folders are listed in `RESTRICTED_VIEWS` (`src/lib/classification.mjs`). Wherever Restricted content shows, the page shows a small "Restricted: floor plan" label beside it (`src/components/Restricted.astro`).

- **Why:** the model catalogue is open and shared, but a building's plan, addresses and weak spots are a map for an attacker (ISO 19650-5). The label on the schema means each new folder or field is classified when it is made.
- **Do:** give every new folder a label in the registry; label a new sensitive field in its schema; put the Restricted label beside any new view of Restricted facts. Keep a repository that describes real offices private.
- **Don't:** label a folder Secret (the validator refuses it), or publish a real building's plan, camera positions or addresses, even from a friendly site.

### F11. Sensing devices carry a privacy record; models carry their security support

Every installed camera, microphone, video bar, codec, desk video device and door or CCTV device is covered by exactly one privacy record in `data/privacy/` for its class and site: what it captures, whether it identifies people, purpose, lawful basis, DPIA reference, room notice (and where), retention, the works-council agreement (required where the country has works councils) and the approver. Occupancy is counted per room with a minimum group size; per-person views are off, and turning them on needs a logged decision. The unit page shows the record, and "What Keia logs about users" (linked from About) says what Keia Atlas keeps about its own users.

Every installed model with firmware worth attacking (anything networked, and every camera and microphone) has `security_support`: its firmware line, the end of security updates and the manufacturer's vulnerability contact. A date or page the manufacturer published cites its source in `data/sources/`; anything else says `demo: true` and the page says "Demo value". Units record `default_password_changed` once someone has checked. The unit and model pages warn from 12 months before support ends.

- **Why:** the GDPR, works councils, the EU Cyber Resilience Act and the UK PSTI rules all ask for these records; keeping them beside the device means they are there when someone asks.
- **Do:** "Security support ends Jun 2027"; "Counted per room, never per person"; "not legal advice".
- **Don't:** say a device or Aigna is "compliant", call aggregated counts "anonymous", or invent a manufacturer's support date or contact without marking it as a demo value.

### F12. The demo's dates move with today; real facts never do

The demo's records are written as of one day, the anchor (`demo_anchor` in `data/house-values/`). With `demo_clock: rolling` (Aigna's demo only), each build moves every date inside the demo world forward by the whole weeks between the anchor and the build date, when the data is loaded (`src/lib/demo-clock.mjs`); the YAML files never change. The story stays the same (the 3.09 fault is still "today 07:52", PRJ-14 is on the same step, a warranty still ends in 10 months) and weekdays are kept. Pages rebuilds every Monday at 03:00 UTC, so the live demo stays current. A real organisation leaves `demo_clock` out, and its dates never move.

Which dates move is an allow-list, `DATE_FIELDS` in `src/lib/demo-clock-core.mjs`, per folder and field path: `shift` (a demo date: by whole weeks), `fy` (the year plan's bounds, its quarterly reviews and freezes, and the planning years: by whole financial years, and only once today has crossed into another one), `year` (the work plan's horizon: by calendar years) or `fixed` (a real-world fact, a connector's own record, or when this repository's public files were written). The validator fails any date-like field that is on neither list.

**Registering a new folder.** Add the folder (or `folder/sub-folder`) to `DATE_FIELDS` with the path of every date field: dotted keys, `[]` for any item of a list, `*` for any key of a map and `**` for any path below (`positions[].units[].warranty.ends`, `rooms.*.hearing_loop.tested`). A made-up record's date is `shift`; a date someone outside Aigna published (a release, an end of support, a standard taking effect, a citation) is `fixed`. Then run `npm run validate`: it names any date you missed, with its file and line. A date written in JavaScript for the demo goes through `demoShift()`; a page script that needs today reads `document.documentElement.dataset.demoToday`, never its own clock's date.

- **Why:** a demo that looks three months old reads as abandoned, and a real fact that moved would be a lie.
- **Do:** check a change with `DEMO_BUILD_DATE=2026-12-28 npm run build` (13 weeks on) as well as the plain build, and read a few pages.
- **Don't:** move a date by editing the YAML, put a demo date in prose ("on 12 September") where a field could carry it, or mark a real fact `shift` to make a page read better.
