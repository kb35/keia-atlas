# The Keia canonical model, v0

Every connector turns another system's records into the same few shapes. Pages read only these shapes, never a vendor's API, so swapping a spreadsheet for NetBox, or NetBox for a fleet tool, does not change a page.

v0 has four kinds of record. Each is a JSON Schema (draft 2020-12, written in YAML like the rest of `schemas/`) in `schemas/connectors/`:

| Kind | What it is | Schema |
|---|---|---|
| **unit** | One physical device (glossary: unit), as another system knows it | `unit.schema.yaml` |
| **space** | A place: site, building, floor, room, desk or rack. Places nest through `parent` | `space.schema.yaml` |
| **ticket** | An incident or a request in a service-management tool | `ticket.schema.yaml` |
| **event** | Something that happened: a device went offline, a ticket changed. Maps onto CloudEvents 1.0 | `event.schema.yaml` |

`common.schema.yaml` holds the parts they share, `record.schema.yaml` picks the shape by `kind`, and `manifest.schema.yaml` is the adapter manifest (see [README.md](README.md)).

## Where connected records live

```
data/connected/<system>/units/<id>.yaml
data/connected/<system>/spaces/<id>.yaml
data/connected/<system>/tickets/<id>.yaml
data/connected/<system>/events/<id>.yaml
```

One folder per system, so two systems never write over each other. The id starts with the system and the system's own kind (`netbox-device-42`, `spreadsheet-room-dublin-office-3-wren`). The folder is registered in `schemas/registry.yaml` as **Restricted**, because an import can hold rack positions and addresses. `npm run validate` checks every file against its schema and then checks the links between them (`tools/crossrefs-connected.mjs`).

Connected records sit beside Keia Atlas's own records (`data/spaces/`, `data/installs/`); they do not replace them. A connected record points into the catalogue through Keia-owned links (`model_id`, `atlas_site`, `atlas_space`), and later steps use those links to join the two.

## The core fields

Only what every source of that kind can fill. Anything else stays in `raw`.

**Unit:** `name`, `manufacturer`, `model`, `serial`, `asset_tag`, `status` and `status_native`, `category_native` (the system's own kind or role), `space` (a connected space), `position` (rack unit and face), `firmware`, `model_id` (Keia's link to `data/device-models/`), `notes`.

**Space:** `name`, `level` (site, building, floor, room, desk, rack), `code`, `parent`, `status` and `status_native`, `category_native`, `time_zone`, `country`, `size_u` (racks), `atlas_site` and `atlas_space` (Keia's links to `data/sites/` and `data/spaces/`), `notes`.

**Ticket:** `type` (incident or request), `number`, `title`, `status` and `status_native`, `priority` (1 to 4) and `priority_native`, `group` (a team, never a person), `opened_at`, `updated_at`, `resolved_at`, `space`, `unit`, `notes`. No people in v0: callers and assignees come later from the identity provider, matched on its own ids, never on a name or an email address.

**Event:** `type` (reverse-DNS, such as `io.keia.unit.status-changed`), `subject` (the connected record it is about), `time`, `data`.

### Both states, always

`status` is Keia's word; `status_native` is the system's own, and both are kept. A status that does not map cleanly is left out rather than guessed, so the page shows the system's word on its own ("Awaiting RMA"). Keia's words:

- Units: `plan` (Ordered), `procure` (Procured), `spare` (Spare), `deploy` (Being installed), `manage` (In service), `retire` (Retired). A lifecycle, not health: NetBox's "Offline" is still In service, with "Offline" beside it.
- Spaces: `planned`, `being-installed`, `being-replaced`, `in-service`, `closed`.
- Tickets: `new`, `in-progress`, `on-hold`, `resolved`, `closed`.

## The source mark

Every record carries one, and every value can carry its own:

```yaml
source:
  system: netbox                                  # which system
  instance: netbox.example.com                    # which copy of it, when there is more than one
  record_id: device/42                            # its own id there (Keia's id is primary; this is the alias)
  url: https://netbox.example.com/dcim/devices/42/  # the link back, for a person to open
  synced_at: 2026-09-30T08:00:00.000Z             # when Keia last took a changed value from it
  adapter: netbox
  adapter_version: 0.1.0
```

Pages show it as a source badge: "NetBox · device 42 · synced 2 min ago". `synced_at` moves only when a value changed, so running the same import twice changes nothing in the repository.

When one record holds values from more than one place (a person in Keia corrected a field, or a second system fills one), `field_sources` marks those fields one by one:

```yaml
field_sources:
  model_id: { system: keia, synced_at: 2026-10-02T09:30:00Z }
```

A field not listed there came from `source`. A link never carries a user name, password or token; the schema refuses one.

## The raw payload, kept aside

`raw` holds the system's own record exactly as it arrived (the NetBox object, the spreadsheet row), so nothing is lost and a mapping can change later without importing again. Pages may show it under "More from NetBox", below the important content.

On the way in, any field whose name looks like a password, secret, token or key is emptied, unless its value is a vault reference, and its path is listed in `raw_redacted`. The import says so, and `npm run validate` refuses any literal secret that gets past.

## Who owns each field

Each adapter's manifest says who owns every field it fills:

- **source**: the other system is the source of truth. Each import replaces the value, and a person should change it there, not in the YAML.
- **keia**: Keia is the source of truth. The adapter only suggests a first value (for example `model_id` from a manufacturer and model it recognises); an import never overwrites a value already in the file, and the plan says "kept ... Keia owns it" when the two differ.

`notes`, `field_sources` and any Keia link an adapter does not fill belong to Keia and are always kept.

## Stability

Every field in v0 is **Experimental**, in the sense OpenTelemetry uses: it may still change. The source mark is the part to rely on first. Fields are added, not renamed; anything removed is deprecated first, with a long window.

## Not in v0

People and organisations (from the identity provider, by SCIM), work logs and comments, agreements (service levels, contracts, data processing agreements), health readings, and writing back to any system.
