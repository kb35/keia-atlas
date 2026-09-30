# Write a connector in an afternoon

A connector brings records from another system (a spreadsheet, NetBox, a fleet tool, a service desk) into Keia Atlas in repo mode. It reads an export, shows you exactly what would change, and writes YAML into `data/connected/` only when you say so.

This is the connector kit: the [canonical model v1](model.md), the adapter interface, five file importers and the `connect` command. It is read only. Nothing here calls another system or writes to one, and no credential is held anywhere in it.

## Ready to connect

Keia Atlas is ready to connect. That means three things:

- **Every fact has a place.** Whatever these systems hold that changes work in a room or on a job (a device, the switch port it is on, the cable between them, its VLAN, its address and DNS name, the stack it belongs to, the carrier's circuit, who to call) has a field waiting for it in the [canonical model](model.md), with its owner decided.
- **Every system has a written mapping.** One page per system below: what it is, its licence, its API, which of its fields become which of Keia's, what Keia might write back one day (always through a person's approval), and who owns each field.
- **The cheap ones already work, from a saved file.** Export from the system, run `npm run connect`, read the diff, and apply it.

Going live later changes one thing: where an adapter reads from. Today it reads an export a person saved; later it asks the system itself, with a read-only credential the vault issues for minutes. The fields, the mappings, the ownership rules, the privacy rules and the checks stay as they are, so no page changes when a connection goes live.

| System | Licence | Kinds | Status |
|---|---|---|---|
| Spreadsheet (CSV) | – | space, unit | **file importer** (`csv`), below |
| [NetBox](netbox.md) | Open source, Apache 2.0 | space, unit, port, connection, network, address, group | **file importer** (`netbox`) |
| [Infoblox NIOS](infoblox.md) | Commercial | network, address | **file importer** (`infoblox`) |
| [Prometheus Alertmanager](alertmanager.md) | Open source, Apache 2.0 | event | **file importer** (`alertmanager`) |
| [Snipe-IT](snipeit.md) | Open source, AGPL 3.0 | space, unit | **file importer** (`snipeit`) |
| [Nautobot](nautobot.md) | Open source, Apache 2.0 | space, unit, port, connection, network, address, group, circuit, contact | spec only |
| [GLPI](glpi.md) | Open source, GPL 3.0 | ticket, unit, space, port, connection | spec only |
| [ServiceNow](servicenow.md) | Commercial | ticket, unit, space, contact | spec only |
| [LibreNMS](librenms.md) | Open source, GPL 3.0 | unit, port, connection, address, event (all seen) | live later |
| [Oxidized](oxidized.md) | Open source, Apache 2.0 | unit (its config backup), event | live later |
| [Zabbix](zabbix.md) | Open source, AGPL 3.0 from 7.0 | unit (seen), event | live later |
| [Datadog](datadog.md) | Commercial | event; unit and port (seen) | live later |

- **file importer**: works today on a saved export, `npm run connect -- <id> <file>`.
- **spec only**: the mapping is written; the importer is still to come. A CSV export can go through the spreadsheet importer with `--system <name>` meanwhile.
- **live later**: what the system knows is only worth having while it is fresh (health, alerts, what is plugged in now), so it waits for live connectors.

These are common tools that workplace and IT teams run; the list says nothing about what any particular organisation uses.

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

## The file importers

Five, each with made-up fixtures and tests:

| Importer | Reads | Try it |
|---|---|---|
| `csv` | A spreadsheet saved as CSV (below) | `tests/fixtures/connectors/devices.csv` |
| `netbox` | NetBox's REST API JSON (below, and [netbox.md](netbox.md)) | `tools/connectors/fixtures/netbox-dublin.json` |
| `infoblox` | Infoblox WAPI JSON ([infoblox.md](infoblox.md)) | `tools/connectors/fixtures/infoblox-wapi.json` |
| `alertmanager` | Alertmanager webhook payloads ([alertmanager.md](alertmanager.md)) | `tools/connectors/fixtures/alertmanager-webhook.json` |
| `snipeit` | Snipe-IT API JSON ([snipeit.md](snipeit.md)) | `tools/connectors/fixtures/snipeit-api.json` |

To see planned against seen at work, import NetBox's plan and then what Infoblox serves, into a scratch folder:

```sh
npm run connect -- netbox tools/connectors/fixtures/netbox-dublin.json --data /tmp/keia-try --apply
npm run connect -- infoblox tools/connectors/fixtures/infoblox-wapi.json --data /tmp/keia-try
```

The second diff ends with one finding, and changes nothing NetBox owns:

```
Planned against seen (a finding for a person; nothing is overwritten)
  ! address netbox-ip-address-402, mac: netbox has "00:00:5e:00:53:2a", infoblox sees "00:00:5e:00:53:2b"
```

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

[NetBox](https://netboxlabs.com/docs/netbox/) is where many network teams keep sites, racks, devices, cabling and addresses. The adapter reads NetBox's REST API JSON saved to a file, so it runs offline and in CI and never calls NetBox itself.

**NetBox pages its lists, and `?limit=0` does not get round that:** a page holds at most `MAX_PAGE_SIZE` objects (1,000 unless changed), whatever you ask for. So save every page, following `next` until it is empty. This saves the lists into one file, `netbox-export.json`, with a **read-only** API token taken from your vault at the moment you run it, never written to a file (it needs `curl` and `jq`):

```sh
export NETBOX_TOKEN="$(your-vault-cli read netbox/read-only-token)"   # your vault's own command
echo '{}' > netbox-export.json
save() {  # every page of one list, following "next"
  name=$(basename "$1"); url="https://netbox.example.com/api/$1/?limit=1000"
  while [ -n "$url" ] && [ "$url" != "null" ]; do
    curl -s -H "Authorization: Token $NETBOX_TOKEN" -H "Accept: application/json" "$url" > page.json
    jq --arg k "$name" --slurpfile p page.json '.[$k] += $p' netbox-export.json > next.json && mv next.json netbox-export.json
    url=$(jq -r .next page.json)
  done
  rm -f page.json
}
for list in dcim/sites dcim/locations dcim/racks dcim/devices dcim/virtual-chassis \
            dcim/interfaces dcim/front-ports dcim/rear-ports dcim/console-ports dcim/console-server-ports \
            dcim/power-ports dcim/power-outlets dcim/cables \
            ipam/vlan-groups ipam/vlans ipam/prefixes ipam/ip-ranges ipam/ip-addresses wireless/wireless-lans; do
  save "$list"
done
```

(NetBox 4.5 and later also issue v2 tokens, sent as `Bearer`; use the form your version's REST API documentation shows.) Each list in the file is an array of its pages, which the importer reads as one list. A single saved list response works too, and so does a file shaped like `tools/connectors/fixtures/netbox-dublin.json`:

```sh
npm run connect -- netbox netbox-export.json
```

Sites, locations and racks become connected spaces (a location with locations inside it is a floor, one without is a room; a rack is a space units are mounted in). Devices become units in their rack, else their location, else their site, with rack position and face. Interfaces, patch panel ports, console and power ports become ports; cables become connections from port to port; VLANs, prefixes, IP ranges and wireless LANs become networks; IP addresses become addresses on their ports; a virtual chassis becomes a stack. NetBox's status sits beside Keia's: an Offline device is still In service, shown with "Offline". A choice-type custom field (such as `firmware`, which NetBox 4.7 sends as `{ value, label }`) is read by its value. If a list holds fewer objects than its `count`, the import warns you to follow `next`. The full mapping is in [netbox.md](netbox.md).

## What a connector is

Think of a mixing desk. Every source plugs into its own channel strip (the adapter), which brings it to one standard level (the [canonical model](model.md)). The desk's output (the pages) only ever sees that standard signal, and each strip tells the desk which knobs it has (the manifest), so the desk never shows a control that is not there.

An adapter is one file in `tools/connectors/adapters/` that exports `defineAdapter({ manifest, open, list, get, map })`:

| Part | What it does |
|---|---|
| `manifest` | What the adapter can do, declared before it does anything. Checked against `schemas/connectors/manifest.schema.yaml` when it loads |
| `open(file, options)` | Reads the input once and returns a `source` object for the other three. May return `instance` (which copy of the system), `problems` and `warnings`. Optional: the default reads the file as text |
| `list(source, kind)` | Every native record of one kind (`space`, `unit`, `port`, `connection`, `network`, `address`, `group`, `circuit`, `contact`, `ticket`, `event`), as the system gives it |
| `get(source, kind, recordId)` | One native record by the system's own id |
| `map(kind, native, ctx)` | One native record in Keia's shape: the fields the manifest declares, plus `id` and `source: { record_id, url }`. May return `raw` when the native record is not the thing to keep (the spreadsheet row, not the wrapper), and `redacted`: paths it emptied in `raw` for privacy, such as a person's name |

`ctx` gives `map` what it needs: `ctx.idFor(...parts)` builds an id that starts with the system (`netbox-device-42`); `ctx.matchModel(manufacturer, model)` and `ctx.matchSite(...names)` suggest Keia links from the catalogue; `ctx.matchConnected(kind, ...names)` finds a record another system already brought in, by name (an alert names its host, not a Keia id); `ctx.warn()` and `ctx.problem()` report.

The runner (`tools/connectors/run.mjs`) does the rest, the same way for every adapter: it adds the source mark and `synced_at`, keeps the native record in `raw` with secrets emptied, merges with the file already in the repository by who owns each field, checks every record against the schema and every link between records, compares what one system sees with what another records ([planned and seen](model.md#planned-and-seen)), and plans. `--apply` writes only a plan with no problems, and a record missing from a new export is reported and kept, never deleted.

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
      observes: ['firmware'],           // what it sees rather than decides: goes into the owner's `seen`
    },
  },
  events: { mode: 'file' },             // file, poll, delta, webhook or subscription
  rate: { requests_per_minute: 0 },     // its budget on the other system's API; 0 for a file
  hosts: [],                            // every host it may reach; empty for a file
  credentials: [],                      // { name, vault: 'vault:fleet/read-only', scope: 'read' }, never a value
}
```

**Ownership** is the source of truth per field. `source`: the other system owns it and each import replaces it. `keia`: Keia owns it; the adapter only fills it when the file has no value yet. Decide it field by field, not per system, starting from the [defaults](model.md#the-defaults): decided facts belong to the system of record, observed facts to the system that sees them, and Keia's links and notes to Keia (the kit refuses a manifest that says otherwise for `model_id`, `atlas_*`, `purpose` or `notes`).

**`observes`** lists the fields the system sees on the live estate rather than decides. For a record another system holds about the same thing, the runner puts this system's value in that record's `seen` block and raises a drift event when the two differ, never overwriting.

## Build one in an afternoon

1. **Get a real export and make a fixture.** Save a small export from the system, then replace every real name, host, serial and address with made-up ones (`example.com` hosts, `FAKE-` serials). Keep it to a handful of records that cover the awkward cases: an empty field, an unknown status, a record in no room, a field that looks like a password, a person's name. Put it in `tools/connectors/fixtures/`, with a `_note` saying it is made up.
2. **Copy the closest importer.** `csv.mjs` for tabular exports, `netbox.mjs` or `snipeit.mjs` for JSON from an API, `alertmanager.mjs` for pushed alerts. Rename it, write the manifest, and register it in `tools/connectors/adapters/index.mjs`. The system's spec in this folder says which fields map to which.
3. **Write `map` first.** Fill only the core fields in [model.md](model.md); leave everything else to `raw`. Map statuses through a small table with `mapStatus()`, and leave `status` out when a word does not map cleanly: the native word is kept.
4. **Run it dry until the diff reads right:** `npm run connect -- <id> <fixture>`. Every problem names the record and the field.
5. **Write the tests** in `tests/`, following `tests/connectors-v1.test.mjs`: the planned records for your fixture, a second run that changes nothing, a changed export that changes only what it should, a Keia-owned field that survives, a secret and a person that are emptied, any drift it should raise, and `validate()` passing on the written output.
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

## What going live still needs

The model, the mappings and the file importers are done. A live connector still needs:

- **A connector worker** that reads from the system's API instead of a file, with its manifest's `hosts`, `rate` and vault `credentials` filled in and enforced, and a short-lived read-only credential per run ([architecture, section 5](../architecture.md#5-connectors-in-production)).
- **A webhook receiver** for the systems that push (Alertmanager, Zabbix media types, Datadog notifications, NetBox event rules), plus a scheduled reconcile that catches anything a push missed.
- **Change feeds** so a sync reads only what changed: NetBox's change log, `sys_updated_on` in ServiceNow, `date_mod` in GLPI.
- **Precedence** set once, when a second system fills the same field (NetBox and Snipe-IT both know a serial), so a page shows one owner's value and the other goes to `seen`.
- **Matching across systems** confirmed by a person where it is ambiguous, then kept as a Keia-owned link.
- **Importers for the specs**: Nautobot and GLPI next (both cheap from a saved export), then LibreNMS, Oxidized, Zabbix, Datadog and ServiceNow as live connectors.
- **Contract tests** against each vendor's sandbox or a local container, never a customer's production system.
- **Writes**, one named action at a time, each under a standing rule a person approves, with its undo declared.
