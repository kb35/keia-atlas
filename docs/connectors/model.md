# The Keia canonical model, v1

Every connector turns another system's records into the same few shapes. Pages read only these shapes, never a vendor's API, so swapping a spreadsheet for NetBox, or NetBox for Nautobot, does not change a page.

A kind earns its place only when a technician, a planner or a standing rule acts on it. Everything else a system holds stays in `raw`, with a link back.

v1 has eleven kinds. Each is a JSON Schema (draft 2020-12, written in YAML like the rest of `schemas/`) in `schemas/connectors/`:

| Kind | What it is | Schema |
|---|---|---|
| **space** | A place: region, site, building, floor, room, desk, rack or home office. Places nest through `parent` | `space.schema.yaml` |
| **unit** | One physical device (glossary: unit), as another system knows it | `unit.schema.yaml` |
| **port** | A place something plugs in: a switch interface, a patch panel's front or rear, a console port, a power inlet or outlet | `port.schema.yaml` |
| **connection** | A cable (or a wireless link) from one port to another | `connection.schema.yaml` |
| **network** | A VLAN, a prefix (subnet), an IP range or a Wi-Fi network | `network.schema.yaml` |
| **address** | One IP address: the port it is on, its DNS name, its DHCP reservation | `address.schema.yaml` |
| **group** | Units that act together: a stack, a virtual chassis, a high-availability pair, a cluster | `group.schema.yaml` |
| **circuit** | A service from an outside carrier: circuit ID, bandwidth, service level, both ends | `circuit.schema.yaml` |
| **contact** | Who to call: an organisation, or a role at one ("Carrier One NOC"). Never a person | `contact.schema.yaml` |
| **ticket** | An incident or a request in a service-management tool | `ticket.schema.yaml` |
| **event** | Something that happened: an alert raised or cleared, a status change, a drift found. Maps onto CloudEvents 1.0 | `event.schema.yaml` |

`common.schema.yaml` holds the parts they share (the source mark, `raw`, `seen`, `team`, `contacts`), `record.schema.yaml` picks the shape by `kind`, and `manifest.schema.yaml` is the adapter manifest (see [README.md](README.md)). Which kind links to which is one table, `LINKS` in `tools/connectors/kinds.mjs`, used by both the importer and `npm run validate`.

## Where connected records live

```
data/connected/<system>/spaces/<id>.yaml        data/connected/<system>/addresses/<id>.yaml
data/connected/<system>/units/<id>.yaml         data/connected/<system>/groups/<id>.yaml
data/connected/<system>/ports/<id>.yaml         data/connected/<system>/circuits/<id>.yaml
data/connected/<system>/connections/<id>.yaml   data/connected/<system>/contacts/<id>.yaml
data/connected/<system>/networks/<id>.yaml      data/connected/<system>/tickets/<id>.yaml
                                                data/connected/<system>/events/<id>.yaml
```

One folder per system, so two systems never write over each other's records. The id starts with the system and the system's own kind (`netbox-interface-1001`, `infoblox-address-192-0-2-70`). The folder is registered in `schemas/registry.yaml` as **Restricted**, because an import can hold rack positions and addresses. `npm run validate` checks every file against its schema and then checks the links between them (`tools/crossrefs-connected.mjs`).

Ports run to thousands (a 48-port switch has more than 50), so repo mode keeps one small file per port; database mode will keep one row per port. Every port still has its own id and source mark.

Connected records sit beside Keia Atlas's own records (`data/spaces/`, `data/installs/`, `data/cables/`, `data/runs/`); they do not replace them. A connected record points into the catalogue through Keia-owned links (`model_id`, `atlas_site`, `atlas_space`, `atlas_vendor`, `purpose`), and later steps use those links to join the two.

## The core fields

Only what every source of that kind can fill. Anything else stays in `raw`.

**Space:** `name`, `level` (region, site, building, floor, room, desk, rack, home), `code`, `parent`, `status` and `status_native`, `category_native` (the system's own kind or role), `time_zone`, `country`, `size_u` (racks), `atlas_site` and `atlas_space` (Keia's links to `data/sites/` and `data/spaces/`), `team`, `contacts`, `notes`. A home office is a town and a country, never a street address.

**Unit:** `name`, `manufacturer`, `model`, `serial`, `asset_tag`, `status` and `status_native`, `category_native`, `space`, `position` (rack unit and face), `inside` (the unit it is fitted in: an optic in a switch), `firmware`, `health`, `health_native` and `health_since` (what monitoring sees now: ok, degraded, down, unknown), `purchased_on`, `warranty_ends`, `supplier`, `config_backup` (the last backup's time, result and link; never the configuration), `model_id` (Keia's link to `data/device-models/`), `team`, `contacts`, `notes`.

**Port:** `name`, `label`, `type` (interface, front, rear, power, console, outlet) and `type_native`, `unit` or `space` (a wall plate or a rack's feed belongs to a place), `description`, `enabled`, `speed_mbps`, `mac`, `mode` (access, tagged, tagged-all), `untagged_vlan` and `tagged_vlans` (networks of type vlan), `poe` (mode pse or pd, and the standard), `lag`, `rear_port` and `rear_position` (a front port's rear), `feed` (A, B or C), `max_draw_w` and `allocated_draw_w`, `notes`.

**Connection:** `type` (cable, wireless), `a` and `b` (each a `port`, a `circuit`, or when Keia holds no record for the far end, the system's own words in `native`), `label`, `medium` (cat6a, fibre-om4, fibre-os2, power... the words the demo's cable records use) and `medium_native`, `length_m`, `colour`, `bundle`, `status` and `status_native`, `notes`.

**Network:** `name`, `type` (vlan, prefix, range, wifi), `vid` and `vlan_group` (the group its number is unique in, usually one per site), `prefix`, `start` and `end` (a range), `ssid` and `auth_native` (never the key), `vlan` (the VLAN a prefix or a Wi-Fi network rides on), `scope` (the space it applies to), `role_native`, `status` and `status_native`, `purpose` (Keia's link to the house VLAN plan), `atlas_site`, `team`, `contacts`, `notes`.

**Address:** `address` (with its prefix length when known), `port`, `unit`, `network`, `dns_name`, `mac` (the port's, or the one a reservation is keyed on), `assignment` (static, dhcp-reservation, dhcp, slaac), `role_native`, `status` and `status_native`, `notes`.

**Group:** `name`, `type` (stack, virtual-chassis, ha-pair, cluster, lag, diverse-pair) and `type_native`, `members` (each a record id, with `role`: master, member, primary, backup, active or standby, and `position`), `domain`, `space`, `status`, `team`, `notes`.

**Circuit:** `circuit_id` (what you quote on the phone), `name`, `carrier` and `carrier_contact`, `account`, `type_native`, `role` (primary, backup), `bandwidth_mbps`, `sla`, `terminations` (`a` and `z`: a space, a port, the hand-off in the system's words), `installed_on`, `contract_ends`, `status`, `team`, `contacts`, `notes`.

**Contact:** `type` (organisation or role), `name`, `organisation`, `role`, `phone` and `email` (a role's number and mailbox), `url`, `hours`, `atlas_vendor` (Keia's link to `data/vendors/`), `notes`. There is no field for a person's name. People come later from the identity provider, matched on its own ids.

**Ticket:** `type` (incident or request), `number`, `title`, `status` and `status_native`, `priority` (1 to 4) and `priority_native`, `group` (a team, never a person), `opened_at`, `updated_at`, `resolved_at`, `space`, `unit`, `related` (ports, circuits, networks), `notes`.

**Event:** `type` (reverse-DNS, such as `io.keia.alert.firing`), `subject` (the connected record it is about), `time`, `severity` (info, warning, major, critical) and `severity_native`, `state` (firing or resolved), `key` (the source's own key for the thing that fires and clears, such as an alert fingerprint), `data`.

### Both states, always

`status` is Keia's word; `status_native` is the system's own, and both are kept. A status that does not map cleanly is left out rather than guessed, so the page shows the system's word on its own ("Awaiting RMA"). Keia's words:

- Units: `plan` (Ordered), `procure` (Procured), `spare` (Spare), `deploy` (Being installed), `manage` (In service), `retire` (Retired). A lifecycle, not health: NetBox's "Offline" is still In service, with "Offline" beside it, and what monitoring sees goes in `health`.
- Spaces: `planned`, `being-installed`, `being-replaced`, `in-service`, `closed`.
- Networks, addresses, connections, circuits and groups: `planned`, `reserved` (networks and addresses held for later), `in-service`, `retired`. A carrier's "Offline" is still in service.
- Ports: `enabled`, true or false.
- Tickets: `new`, `in-progress`, `on-hold`, `resolved`, `closed`.

## The source mark

Every record carries one, and every value can carry its own:

```yaml
source:
  system: netbox                                  # which system
  instance: netbox.example.com                    # which copy of it, when there is more than one
  record_id: interface/1001                       # its own id there (Keia's id is primary; this is the alias)
  url: https://netbox.example.com/dcim/interfaces/1001/  # the link back, for a person to open
  synced_at: 2026-09-30T08:00:00.000Z             # when Keia last took a changed value from it
  adapter: netbox
  adapter_version: 0.2.0
```

Pages show it as a source badge: "NetBox · interface 1001 · synced 2 min ago". `synced_at` moves only when a value changed, so running the same import twice changes nothing in the repository.

When one record holds values from more than one place (a person in Keia corrected a field), `field_sources` marks those fields one by one:

```yaml
field_sources:
  model_id: { system: keia, synced_at: 2026-10-02T09:30:00Z }
```

A field not listed there came from `source`. A link never carries a user name, password or token; the schema refuses one.

## The raw payload, kept aside

`raw` holds the system's own record exactly as it arrived (the NetBox object, the spreadsheet row, the alert), so nothing is lost and a mapping can change later without importing again. Pages may show it under "More from NetBox", below the important content.

On the way in, any field whose name looks like a password, secret, token, key or Wi-Fi pre-shared key is emptied, unless its value is a vault reference, and its path is listed in `raw_redacted`. An adapter can empty more for privacy: the Snipe-IT importer empties a person in "checked out to" and a location's street address. The import says so, and `npm run validate` refuses any literal secret that gets past.

## Who owns each field

Each adapter's manifest says who owns every field it fills:

- **source**: the other system is the source of truth. Each import replaces the value, and a person should change it there, not in the YAML.
- **keia**: Keia is the source of truth. The adapter only suggests a first value (for example `model_id` from a manufacturer and model it recognises); an import never overwrites a value already in the file, and the plan says "kept ... Keia owns it" when the two differ.

`notes`, `field_sources`, `seen` and any Keia link an adapter does not fill belong to Keia and are always kept.

### The defaults

One rule settles most fields, and a new adapter starts from it (`defaultOwner()` in `tools/connectors/kinds.mjs`):

- **Decided facts belong to the system of record.** A name, a place in a rack, a role, the VLAN planned on a port, the address plan, an asset tag, a warranty. Whoever decides them keeps them.
- **Observed facts belong to the system that sees them.** Health, the firmware actually running, a MAC address, the neighbour a switch port sees, the VLAN a port really has, the last configuration backup. Only a system that looks can know them.
- **Keia owns its links and notes.** `model_id`, `atlas_site`, `atlas_space`, `atlas_vendor`, `purpose` and `notes`. A manifest must mark these `keia`; the kit refuses anything else.

| Fields | Usually owned by | When that system is not connected |
|---|---|---|
| Unit name, space, rack position, role | The network source of truth (NetBox, Nautobot) | The asset register, then Keia |
| Serial, asset tag, purchase date, warranty, supplier | The asset register (Snipe-IT, GLPI) | The network source of truth, then Keia |
| Health, running firmware, config backup | Monitoring (LibreNMS, Zabbix, Datadog) and the backup tool (Oxidized) | Nobody: left empty |
| Ports, cables, patching, the VLAN planned on a port | The network source of truth | GLPI, then Keia's `data/cables/` and `data/runs/` |
| The VLAN, MAC and neighbour seen on a port | Monitoring or the network controller | Nobody: left empty |
| Networks, prefixes, addresses, DNS names, reservations | The IPAM system (NetBox, Infoblox) | Keia's VLAN plan |
| Circuits, carrier accounts, carrier contacts | The network source of truth, or the service desk | Keia's `data/circuits/` and `data/vendors/` |
| Tickets | The service desk (GLPI, ServiceNow) | Keia, when Support is On |
| Links into the catalogue, purpose, notes | Keia | – |

When two connected systems both declare `source` for the same field (NetBox and Snipe-IT both fill `serial`), each keeps its own record in its own folder; which one a page shows is set once, when the second is connected, never by whichever synced last. That setting arrives with live connectors.

## Planned and seen

One system says what should be; another sees what is. NetBox records that the room 3.04 video bar's address belongs to MAC `...:2a`; the DHCP server hands that address to `...:2b`, because the bar was swapped last week. Both are useful, and neither is simply wrong, so Keia keeps both and never lets one overwrite the other.

- **An adapter's manifest says which fields its system sees** (`objects.<kind>.observes`). The Infoblox importer observes an address's `dns_name` and `mac`, because Infoblox serves the DNS and DHCP.
- **Records from two systems are matched on what they describe**, never on a guess: an address on its address; a network on its prefix, range, SSID, or VLAN number within its group; a unit on its serial, else its asset tag, else its name. Two units with different serials are two units, whatever their names.
- **The seen value goes into the owner's `seen` block**, with its own mark, beside the owner's value:

  ```yaml
  mac: 00:00:5e:00:53:2a            # NetBox's, unchanged
  seen:
    mac:
      - value: 00:00:5e:00:53:2b
        system: infoblox
        instance: gm.example.com
        record_id: record:host_ipv4addr/...
        synced_at: 2026-09-30T08:00:00Z
        differs: true
  ```

- **A difference is a drift event**, `io.keia.drift.found`, written to the seeing system's events folder, with both values and both marks. A page shows it as a calm check ("Address 192.0.2.70: planned MAC ...:2a, seen ...:2b"). When the two agree again, Keia raises `io.keia.drift.cleared`. The same finding always gets the same id, so importing again raises nothing new.
- **Nothing is overwritten.** A standing rule may later open a ticket or propose a fix to the record, through a person's approval.

The owner's own imports keep the `seen` block, and the order the systems are imported in does not matter.

## Stability

Every kind and field in v1 is **Experimental**, in the sense OpenTelemetry uses: it may still change. The source mark is the part to rely on first. Fields are added, never renamed; anything removed is deprecated first, with a long window. v0 records are valid v1 records.

## Not in v1

People (from the identity provider, by SCIM, matched on its ids), work logs and comments, agreements other than a circuit's service level and contract end, health readings over time (they stay in the monitoring tool, with a link), configuration contents, and writing back to any system.
