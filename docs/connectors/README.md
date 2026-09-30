# Write a connector in an afternoon

A connector brings records from another system (a spreadsheet, NetBox, a fleet tool, a service desk) into Keia Atlas in repo mode. It reads an export, shows you exactly what would change, and writes YAML into `data/connected/` only when you say so.

This is the connector kit v0: the canonical model, the adapter interface, two reference adapters and the `connect` command. It is read only. Nothing here writes to any other system.

## Try it first

```sh
npm run connect                                                       # lists the adapters
npm run connect -- csv tests/fixtures/connectors/devices.csv          # shows the diff, writes nothing
npm run connect -- csv tests/fixtures/connectors/devices.csv --apply  # writes data/connected/spreadsheet/
npm run validate                                                      # checks what was written
```

The diff reads like this:

```
Spreadsheet importer (csv 0.1.0, certified, read only)
  reading  tests/fixtures/connectors/devices.csv
  into     data/connected/spreadsheet/

  + new       space  spreadsheet-site-dublin-office              Dublin office
  + new       unit   spreadsheet-unit-aig-000101                 dub-3-04-bar
  ~ changed   unit   spreadsheet-unit-aig-000102                 dub-3-04-tc
        firmware         "4.2.1" -> "4.3.0"
        model_id         kept "poly-tc10": Keia owns it (the source suggests "poly-tc8")
  = unchanged 12 records
  ? not in this file: 1 record, kept (nothing is deleted)

Warnings
  ! "Admin password" looked like a secret in 1 unit, so its value was not kept.

Dry run: nothing written. 2 new, 1 changed. Run again with --apply to write them.
```

Options: `--apply` writes, `--system <name>` names the system when you import from two copies of it (`netbox-emea`, `netbox-apac`), `--data <folder>` points at another data folder, `--verbose` lists every record, `--manifest` prints the adapter's manifest.

## The two reference adapters

### Spreadsheet importer (`csv`)

Where most teams start. Save the sheet as CSV (comma, semicolon or tab; Excel's "CSV UTF-8" is ideal), one row per device:

| Column (any of these names, any case) | Becomes |
|---|---|
| Asset tag, ID, Serial, Hostname | the unit's record id: the first of ID, asset tag, serial, name that the sheet has. Keep it stable; it is how the next import finds the same unit |
| Hostname, Name, Device name | `name` |
| Manufacturer, Make, Brand / Model | `manufacturer`, `model`, and a suggested `model_id` when it matches `data/device-models/` |
| Serial number, Asset tag, Firmware, Category | `serial`, `asset_tag`, `firmware`, `category_native` |
| Status | `status` (In service, In stock, Being installed, Decommissioned...) and `status_native` |
| Site or Office, Building, Floor, Room, Room number | nested connected spaces; the unit sits in the deepest one. A site that matches `data/sites/` gets `atlas_site` |
| Kind | `space` for a row that describes a place (its Time zone, Country, Status) rather than a device |

Other columns are kept in `raw` and listed in a warning. The full list of names is `COLUMNS` in `tools/connectors/adapters/csv.mjs`. Try it with `tests/fixtures/connectors/devices.csv`.

### NetBox export importer (`netbox`)

[NetBox](https://netboxlabs.com/docs/netbox/) is where many network teams keep sites, racks and devices. The adapter reads NetBox's REST API JSON saved to a file, so it runs offline and in CI and never calls NetBox itself. Save the lists with a **read-only** API token taken from your vault at the moment you run the command, never written to a file:

```sh
export NETBOX_TOKEN="$(your-vault-cli read netbox/read-only-token)"   # your vault's own command
for kind in sites locations racks devices; do
  curl -s -H "Authorization: Token $NETBOX_TOKEN" -H "Accept: application/json" \
    "https://netbox.example.com/api/dcim/$kind/?limit=0" > "netbox-$kind.json"
done
```

(NetBox 4.5 and later also issue v2 tokens, sent as `Bearer`; use the form your version's REST API documentation shows.) Then either run the importer on each file in turn, sites first, or put them in one file as `{ "sites": ..., "locations": ..., "racks": ..., "devices": ... }` like `tests/fixtures/connectors/netbox-export.json`:

```sh
npm run connect -- netbox tests/fixtures/connectors/netbox-export.json
```

Sites, locations and racks become connected spaces (a location with locations inside it is a floor, one without is a room; a rack is a space units are mounted in). Devices become units in their rack, else their location, else their site, with rack position and face. NetBox's status sits beside Keia's: an Offline device is still In service, shown with "Offline". If a list holds fewer objects than its `count`, the import warns you: NetBox pages its lists, so export with `?limit=0` or save every page.

## What a connector is

Think of a mixing desk. Every source plugs into its own channel strip (the adapter), which brings it to one standard level (the [canonical model](model.md)). The desk's output (the pages) only ever sees that standard signal, and each strip tells the desk which knobs it has (the manifest), so the desk never shows a control that is not there.

An adapter is one file in `tools/connectors/adapters/` that exports `defineAdapter({ manifest, open, list, get, map })`:

| Part | What it does |
|---|---|
| `manifest` | What the adapter can do, declared before it does anything. Checked against `schemas/connectors/manifest.schema.yaml` when it loads |
| `open(file, options)` | Reads the input once and returns a `source` object for the other three. May return `instance` (which copy of the system), `problems` and `warnings`. Optional: the default reads the file as text |
| `list(source, kind)` | Every native record of one kind (`unit`, `space`, `ticket`, `event`), as the system gives it |
| `get(source, kind, recordId)` | One native record by the system's own id |
| `map(kind, native, ctx)` | One native record in Keia's shape: the fields the manifest declares, plus `id` and `source: { record_id, url }`. May return `raw` when the native record is not the thing to keep (the spreadsheet row, not the wrapper) |

`ctx` gives `map` what it needs: `ctx.idFor(...parts)` builds an id that starts with the system (`netbox-device-42`); `ctx.matchModel(manufacturer, model)` and `ctx.matchSite(...names)` suggest Keia links from the catalogue; `ctx.warn()` and `ctx.problem()` report.

The runner (`tools/connectors/run.mjs`) does the rest, the same way for every adapter: it adds the source mark and `synced_at`, keeps the native record in `raw` with secrets emptied, merges with the file already in the repository by who owns each field, checks every record against the schema and every link between records, and plans. `--apply` writes only a plan with no problems, and a record missing from a new export is reported and kept, never deleted.

### The manifest

```js
manifest: {
  id: 'fleet',                          // used on the command line
  name: 'Fleet tool export importer',
  version: '0.1.0',
  tier: 'community',                    // community or certified (below)
  owner: 'Your team',                   // who keeps it working; never empty
  system: 'fleet',                      // the system name in source marks and folder names
  reads: 'file',                        // file now; api for live adapters later
  objects: {
    unit: {
      actions: ['read'],                // v0 is read only
      fields: {                         // every field it fills, and who owns it
        name: 'source', serial: 'source', firmware: 'source', status: 'source', status_native: 'source',
        model_id: 'keia',               // a suggestion; a person's correction is kept
      },
    },
  },
  events: { mode: 'file' },             // file, poll, delta, webhook or subscription
  rate: { requests_per_minute: 0 },     // its budget on the other system's API; 0 for a file
  hosts: [],                            // every host it may reach; empty for a file
  credentials: [],                      // { name, vault: 'vault:fleet/read-only', scope: 'read' }, never a value
}
```

**Ownership** is the source of truth per field. `source`: the other system owns it and each import replaces it. `keia`: Keia owns it; the adapter only fills it when the file has no value yet. Decide it field by field, not per system: a device platform owns firmware and health, while the catalogue link is Keia's.

## Build one in an afternoon

1. **Get a real export and make a fixture.** Save a small export from the system, then replace every real name, host, serial and address with made-up ones (`example.com` hosts, `FAKE-` serials). Keep it to a handful of records that cover the awkward cases: an empty field, an unknown status, a record in no room, a field that looks like a password. Put it in `tests/fixtures/connectors/`.
2. **Copy the closer reference adapter.** `csv.mjs` for tabular exports, `netbox.mjs` for JSON from an API. Rename it, write the manifest, and register it in `tools/connectors/adapters/index.mjs`.
3. **Write `map` first.** Fill only the core fields in [model.md](model.md); leave everything else to `raw`. Map statuses through a small table with `mapStatus()`, and leave `status` out when a word does not map cleanly: the native word is kept.
4. **Run it dry until the diff reads right:** `npm run connect -- <id> <fixture>`. Every problem names the record and the field.
5. **Write the tests** in `tests/`, following `tests/connectors.test.mjs`: the planned records for your fixture, a second run that changes nothing, a changed export that changes only what it should, a Keia-owned field that survives, a secret that is emptied, and `validate()` passing on the written output.
6. **Check:** `npm run validate`, `npm test`, `npm run build`. Then open a pull request (see [CONTRIBUTING.md](../../CONTRIBUTING.md)).

## Security rules

These are not optional; the kit enforces most of them.

- **Read only first.** v0 manifests may declare only `read`, and the runner refuses anything else. Writing comes later, one named action at a time, under a standing rule a person approves; a first-time or irreversible write always needs a person.
- **Least privilege.** Ask the other system for a read-only credential scoped to exactly the objects the manifest lists. Declare every host the adapter may reach in `hosts`; a file adapter reaches none.
- **Vault references, never values.** A credential appears in a manifest only as `vault:<entry name>`. The adapter asks the vault for a short-lived value when it runs and never stores it. The schema refuses anything else.
- **No secrets in YAML.** Secret-looking fields are emptied on the way in and listed in `raw_redacted`; links may not carry a user name, password or token; `npm run validate` fails on any literal secret in `data/`. Treat a repository that describes your offices as Restricted and keep it private.
- **Fixtures are made up.** No real hostnames, serials, addresses, people or ticket text, ever, even in a test.
- **Untrusted text is data.** A device name or a ticket title from another system is shown, never followed as an instruction, by any tool or agent.

## Certification tiers

| Tier | Who keeps it | What it takes |
|---|---|---|
| **Community** | Anyone. Named owner in the manifest | A valid manifest, fixtures and tests that pass in CI. Unreviewed: off by default in production, and a person turns it on knowing that |
| **Certified** | The Keia Atlas maintainers, or a partner under review | Everything above, plus a security review of the manifest (read-only scopes, hosts, vault references), tests against the vendor's sandbox where one exists, a named owner who answers issues, and a release that keeps the manifest stable |

One certified connector per system: forks are welcome but never shown as equal. A connector with no release and no owner response for six months is marked stale, then archived with a notice, never silently removed. A partner tier for connectors kept by the vendor themselves may follow.

## Next: the same adapter, exposed through Keia's MCP gateway

This is the roadmap, not v0. Each adapter's manifest will publish a small, scoped MCP server behind Keia's MCP gateway, so Keia's own agents, and any AI client a customer points at Keia, can use the same connector with the same limits:

- One small typed tool per object and action (`netbox.unit.list`, `netbox.unit.get`), never a "run any query" tool. `npm run connect -- netbox --manifest` already prints the tools it will publish.
- Read tools and write tools kept apart; each tool carries Keia's governance tier (read, write, prohibited), and a write tool declares its scope and its undo.
- The gateway authorises per tool, applies the customer's rules and writes the audit log. The adapter holds its own vault-issued credential; no agent or client ever receives it, and no user's token is passed through.
- Vendor MCP servers, where they exist, are optional read sources behind the same gateway, with their tool descriptions pinned and checked for changes.

After that: live adapters (`reads: api`) that poll or subscribe, then reconcile on a schedule, and write actions under standing rules.
