# NetBox

**Status:** file importer, `npm run connect -- netbox <file>`. Live later. **Kinds:** space, unit, port, connection, network, address, group.

## What it is

NetBox is an open-source source of truth for networks: the places and racks, the devices in them, every port and cable between them (DCIM, data centre infrastructure management), and the address plan and VLANs (IPAM, IP address management). Network teams keep it as the record of what should be there. NetBox Labs and a large community maintain it.

## Licence

Open source, Apache 2.0. Some add-ons from NetBox Labs are under other licences; the importer reads only NetBox's core objects, and data from plugins stays in `raw`.

## API

| | |
|---|---|
| Style | REST and JSON at `/api/`. A read-only GraphQL API at `/graphql/` suits "one room's whole picture in one call" later; sync stays on REST, where the change log is |
| Auth | An API token in the `Authorization` header: `Token <key>`, or from 4.5 the newer v2 tokens sent as `Bearer`. Give Keia a read-only token for the objects below, from the vault |
| Pagination | `limit` and `offset`, with `count`, `next` and `previous` in every list. A page holds at most `MAX_PAGE_SIZE` objects (1,000 unless changed), **even when you ask for `?limit=0`**, so always follow `next` until it is empty. Newer releases also page by cursor (`?start=<id>`), which is faster on long lists |
| Rate limits | None built in; whatever the NetBox host or its proxy sets. Keep a live sync gentle and page by page |
| Sandbox or demo | The public demo (demo.netbox.dev) is shared and reset often: good for exploring, not for tests. Contract tests run against a local NetBox in a container. Fixtures stay made up |

## What Keia reads

Save the lists as JSON, following `next`, with a read-only token taken from the vault at that moment and never written to a file (the full commands are in [README.md](README.md#netbox-export-importer-netbox)). Put the lists in one file as `{ "sites": ..., "devices": ..., "interfaces": ... }`; a list may be one response, or an array of every page.

**Places:** `/api/dcim/sites/`, `/locations/`, `/racks/` → **space**

| NetBox | Keia |
|---|---|
| site `name`, `facility` or `slug`, `time_zone`, `status`, `group.name` | `name`, `code`, `time_zone`, `status` and `status_native`, `category_native`; `atlas_site` suggested |
| location `name`, `facility`, `parent` | `name`, `code`, `parent`; a location with locations inside it is a `floor`, one without is a `room` |
| rack `name`, `facility_id`, `u_height`, `role.name` | `name`, `code`, `size_u`, `category_native`; `level: rack` |

**Devices:** `/api/dcim/devices/` → **unit**

| NetBox | Keia |
|---|---|
| `name` (else `display`), `device_type.manufacturer.name`, `device_type.model` | `name`, `manufacturer`, `model`; `model_id` suggested from the catalogue |
| `serial`, `asset_tag`, `role.name` (3.x: `device_role`) | `serial`, `asset_tag`, `category_native` |
| `status` | `status` (planned → plan, inventory → spare, staged → deploy, active, offline and failed → manage, decommissioning → retire) and `status_native` |
| `rack`, else `location`, else `site`; `position`, `face` | `space`, `position` |
| `parent_device` | `inside` |
| `custom_fields.firmware` or `firmware_version` | `firmware`. From 4.7 a choice-type custom field arrives as `{ value, label }`; Keia reads the value |

**Ports:** `/api/dcim/interfaces/`, `/front-ports/`, `/rear-ports/`, `/console-ports/`, `/console-server-ports/`, `/power-ports/`, `/power-outlets/` → **port**

| NetBox | Keia |
|---|---|
| the object's list | `type`: interface, front, rear, console (both console kinds), power, outlet |
| `device`, `name`, `label`, `description`, `type.label` | `unit`, `name`, `label`, `description`, `type_native` |
| interface `enabled`, `speed` (kbit/s), `mode` | `enabled`, `speed_mbps`, `mode` (access, tagged, tagged-all) |
| interface `untagged_vlan`, `tagged_vlans` | `untagged_vlan`, `tagged_vlans` (the VLAN records below) |
| interface `primary_mac_address.mac_address` (4.2 and later), else `mac_address` | `mac`, written lower case with colons |
| interface `poe_mode`, `poe_type`, `lag` | `poe.mode` (pse, pd), `poe.type_native`, `lag` |
| front port `rear_port`, `rear_port_position` | `rear_port`, `rear_position` |
| power port `maximum_draw`, `allocated_draw`; power outlet `feed_leg` | `max_draw_w`, `allocated_draw_w`; `feed` |

**Cables:** `/api/dcim/cables/` → **connection**

| NetBox | Keia |
|---|---|
| `a_terminations[0]`, `b_terminations[0]` | `a.port`, `b.port`. An end that is not a port (a power feed, a circuit termination) keeps its words in `native`. Further terminations at one end (a breakout) stay in `raw`, with a warning |
| `type`, `label`, `color`, `description` | `medium` (cat6a, fibre-om4, fibre-os2, dac, power...) and `medium_native`, `label`, `colour` (`#rrggbb`), `description` |
| `length`, `length_unit` | `length_m` |
| `status` | `status` (connected → in-service, planned, decommissioning → retired) and `status_native` |

**IPAM and wireless:** `/api/ipam/vlan-groups/`, `/vlans/`, `/prefixes/`, `/ip-ranges/`, `/ip-addresses/`, `/api/wireless/wireless-lans/` → **network** and **address**

| NetBox | Keia |
|---|---|
| VLAN `vid`, `name`, `group.name`; the group's `scope` (a site), else the VLAN's `site` | network `type: vlan`, `vid`, `name`, `vlan_group`, `scope` |
| prefix `prefix`, `vlan`, `scope` (4.2 and later) or `site`, `role.name` | network `type: prefix`, `prefix`, `vlan` and `vid`, `scope`, `role_native` |
| IP range `start_address`, `end_address`, `role.name` | network `type: range`, `start`, `end`, `role_native` |
| wireless LAN `ssid`, `auth_type`, `vlan`, `scope` | network `type: wifi`, `ssid`, `auth_native`, `vlan`, `scope`. `auth_psk` is a secret: emptied, never stored |
| status (active, reserved, deprecated) | `status` (in-service, reserved, retired) and `status_native` |
| IP address `address`, `assigned_object` (an interface), `dns_name`, `role`, `status` | address `address`, `port` and `unit`, `network` (the most specific prefix it sits in), `dns_name`, `role_native`, `status`; the interface's MAC as `mac`; `assignment` dhcp or slaac when the status says so |

**Stacks:** `/api/dcim/virtual-chassis/` → **group**, `type: stack`, with its devices as `members` (the master as `master`, the rest `member`, each with its `vc_position`), and `domain`.

**Clusters** (`/api/virtualization/clusters/`, a spec only): a cluster becomes a **group**, `type: cluster`, whose members are the devices that name it in their `cluster` field. Keia reads the cluster, not its virtual machines.

## What Keia might write later

Always one named action at a time, under a standing rule a person approves; a first-time or irreversible write always waits for a person.

- A planned install: new devices, their ports and cables, written to NetBox as planned, from a Keia project.
- A fix for a drift a person accepted: the MAC or VLAN NetBox records, from what was seen.
- A journal entry on a device when a Keia job finishes.

Writes would use NetBox's version stamps (ETags, `If-Match`), so a write never overwrites someone's newer edit.

## Field ownership

NetBox is the system of record for places, racks, device placement, ports, cables, VLANs, prefixes and the address plan: every field it fills is `source`. Keia owns `model_id` and `atlas_site` (suggestions a person can correct). NetBox observes nothing: what a switch really does is seen by monitoring, and lands in `seen` on these records.

## Sample fixture

[`tools/connectors/fixtures/netbox-dublin.json`](../../tools/connectors/fixtures/netbox-dublin.json): the Aigna Dublin office's comms room, made up. A two-switch stack, a patch panel, a video bar in room 3.04, a console server and a power strip; five cables (patch, permanent link, console, power, and a feed from a power panel Keia holds no record for); five VLANs in the site's VLAN group; three prefixes, a DHCP pool, two addresses and the guest Wi-Fi. It shows both fixes: a firmware custom field sent as `{ value, label }`, and a Wi-Fi key and an SNMP secret that are emptied on the way in.

```sh
npm run connect -- netbox tools/connectors/fixtures/netbox-dublin.json
```
