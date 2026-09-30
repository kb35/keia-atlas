# Data

Keia Atlas's knowledge is plain files anyone can read and review. The schema is the contract between copies.

### F1. YAML, checked by schema

Data lives in `data/`, a folder per kind of thing, each checked by the JSON Schema (2020-12) that `schemas/registry.yaml` names. The Keia framework's core schemas are pinned and never edited; Keia Atlas's own ideas go in `schemas/ext/`. Change the schema first, then the data.

- **Why:** a copy that passes the same schemas can exchange data with any other.
- **Do:** describe every field in the schema.
- **Don't:** put data in a page or a component.

### F2. Checks stop the build

`npm run validate` checks every file and cross-checks references: cables fit both ends, no port is used twice, enough outlets, unique serials and asset tags. Then `npm test` and `npx astro build`.

- **Why:** a wrong fact caught at build time never reaches a technician.
- **Do:** run all three before committing.
- **Don't:** skip a failing check.

### F3. Every fact has a source

Sources live in `data/sources/` with a `last_verified` date; a model says which source provides what. Unknown is a valid answer, recorded under `gaps`; a guess is not.

- **Why:** people trust what they can check.
- **Do:** say "Unknown" and why.
- **Don't:** fill a gap with a typical value.

### F4. Real where public, made up where private

Device facts and room guidelines are public and cited. The company, sites, people, serials and incidents are made up.

- **Why:** the open version must be safe to publish.
- **Do:** follow the demo's naming (trees for buildings, birds for rooms).
- **Don't:** copy anything from a real building or company.

### F5. Retire, don't remove

A record no longer current gets a retired or archived status with a date and reason; its file stays.

- **Why:** refresh plans and audits need the history.
- **Do:** keep old models and old installs.
- **Don't:** delete a file to shorten a list.

### F6. Reshape data with a migration you keep

When the model changes (two phases become one, anonymous groups become one room each), a one-off script in `tools/migrations/`, named by date, rewrites the data. Run it once, commit its output with it, and keep the script.

- **Why:** a reviewer can see how every file changed and why, and nothing is typed in by hand.
- **Do:** keep every fact the old shape held (dates, summaries, sign-offs, asset tags), and say in the script where each went.
- **Don't:** hand-edit a hundred files, or delete the script once it has run.

### F7. Home offices are rooms, never people's addresses

Each home office is a room at its region's remote site, labelled by town and number, with its country and nearest office. A person's `base` links to it.

- **Why:** the schedule needs to know who is at home and where their kit is; nobody's address belongs in Keia Atlas.
- **Do:** "Bray home office 1", near the Dublin office.
- **Don't:** a street, an eircode or a person's name in a room name.

### F8. A maker's known issue stays the maker's

Known issues (`data/known-issues/`, decision 0029) keep what the maker published: its reference, models, versions, fix and source. Anything Aigna adds says so: a workaround the maker didn't publish is `from: aigna`, a reading of an unclear version list goes in `affected_note`, and a made-up feed or issue says `demo: true` and cites a demo source (the checks refuse a mix). Matching an incident or raising a case with the maker is always a person's decision, recorded with who and when.

- **Why:** a service manager quotes a known issue to the maker and to the team; it must be exactly what the maker said, and Keia Atlas's guesses must never look like the maker's words.
- **Do:** "Poly lists this as fixed in 5.0.1 and doesn't say which earlier versions have it. Aigna reads it as every version before 5.0.1."
- **Don't:** invent a maker reference, a workaround or a fixed version, or close, link or send anything without a person.

### F9. Made-up buildings say so, and use no real names

Floor plans, trays, cable runs and circuits (`data/floors/`, `data/runs/`, `data/circuits/`) are invented for the demo, so every floor carries the label in `FICTION` (`src/lib/floors.mjs`): "Fictional floor plan: room sizes from the room profiles; layout, trays and cable lengths made up for the demo." Every map and 3D model shows it, and the checks fail a floor file without it. Labels on made-up things are generic: providers are "Carrier One" and "Carrier Two", never a real company; buildings have no street address; serials start `DEMO-`.

- **Why:** a plan that looks real is easy to mistake for a survey; the label and generic names keep the demo honest and keep real companies' names off made-up faults.
- **Do:** room sizes from the room profiles, within their area range; "Carrier Two (secondary, north duct)"; bandwidth "Not recorded" unless a house value says otherwise.
- **Don't:** a real provider's name, a real building's address, or a floor plan without the label.
