# Nautobot

**Status:** spec only. A file importer is the next cheap one: most of the NetBox mapping carries over. **Kinds:** space, unit, port, connection, network, address, group, circuit, contact.

## What it is

Nautobot is an open-source network source of truth that began as a fork of NetBox in 2021 and is kept by Network to Code and its community. It models the same things (places, racks, devices, ports, cables, VLANs, prefixes, addresses, circuits) and adds an automation platform around them. Teams that automate their network from their source of truth often run it.

## Licence

Open source, Apache 2.0.

## API

| | |
|---|---|
| Style | REST and JSON at `/api/`, close to NetBox's. A read-only GraphQL API at `/api/graphql/`. Ask for an API version with the `Accept` header (`application/json; version=<n>`) so answers do not change under a live connector |
| Auth | An API token in the `Authorization` header (`Token <key>`). A read-only user, token from the vault |
| Pagination | `limit` and `offset`, with `count` and `next`; the server caps the page size (`MAX_PAGE_SIZE`). Follow `next` to the end |
| Rate limits | None built in; whatever the host or its proxy sets |
| Sandbox or demo | A public demo instance kept by the project, for exploring. Contract tests run against Nautobot in a container. Fixtures stay made up |

## What Keia reads

The NetBox mapping ([netbox.md](netbox.md)) applies object for object. The differences:

| Nautobot | Keia |
|---|---|
| **Locations** with a **location type** (Region, Site, Building, Floor, Room...), nested through `parent` | space. The type names the `level` directly, so there is no guessing floor or room from what sits inside (map each type to a level once, when connecting) |
| **Statuses** and **roles** are objects of their own, with names the customer chooses | `status_native` and `category_native` from the name; `status` through a table set per connection, and left out for a name not in it |
| devices, interfaces, front, rear, console and power ports, cables | unit, port, connection, as for NetBox |
| **Namespaces** (from 2.0) instead of VRFs, to keep prefixes and addresses unique | kept in `raw`; the namespace joins the address's id when there is more than one |
| IP addresses linked to interfaces through a many-to-many table (`ip-address-to-interface`) | address, one `port` per link; a second link stays in `raw` |
| VLANs and **VLAN groups** | network `type: vlan`, `vid`, `vlan_group`, `scope` |
| prefixes | network `type: prefix` |
| virtual chassis; clusters | group `type: stack`; group `type: cluster` |
| circuits, circuit terminations, providers | circuit (`circuit_id`, `carrier`, `bandwidth_mbps` from the commit rate, `terminations`) |
| **Contacts** and **teams** (from 2.1), with their assignments to objects | contact for a team or a role (a NOC, a service desk), and `contacts` on the record. A contact that is a named person is not imported; the assignment keeps its role |

## What Keia might write later

As for NetBox, always through a person's approval: a planned install as planned devices, ports and cables; a drift fix a person accepted. Nautobot's Jobs are not called: Keia writes records, never runs automation.

## Field ownership

Nautobot is the system of record for what it holds (`source`), as NetBox is. Keia owns `model_id`, `atlas_site`, `atlas_space` and `atlas_vendor`. It observes nothing: what the network really does comes from monitoring, into `seen`.

## Sample fixture

Made up. A room as Nautobot's API returns it (trimmed), and the space Keia would write:

```json
{
  "id": "5b0f3c1e-6d7a-4c2e-9f10-0a1b2c3d4e5f",
  "url": "https://nautobot.example.com/api/dcim/locations/5b0f3c1e-6d7a-4c2e-9f10-0a1b2c3d4e5f/",
  "name": "Meeting room 3.04 (Wren)",
  "location_type": { "id": "…", "name": "Room" },
  "parent": { "id": "8e2d…", "name": "Third floor" },
  "status": { "id": "…", "name": "Active" },
  "facility": "3.04"
}
```

```yaml
kind: space
id: nautobot-location-5b0f3c1e-6d7a-4c2e-9f10-0a1b2c3d4e5f
name: Meeting room 3.04 (Wren)
level: room                        # from the location type, not guessed
code: "3.04"
parent: nautobot-location-8e2d...
status: in-service
status_native: Active
```

The importer will ship with `tools/connectors/fixtures/nautobot-dublin.json`: the same made-up Dublin office as the NetBox fixture, in Nautobot's shapes.
