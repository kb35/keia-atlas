# Switch ports and VLANs: the NetBox mapping

`data/switch-ports/<site>.yaml` (schema `schemas/ext/switch-ports.schema.yaml`) holds each office's VLANs, the kit that acts as one, and every switch interface with what it is connected to. It uses NetBox's names, so a NetBox connector can fill it later without a remodel. In the demo it is made up (`tools/migrations/2026-09-30-switch-ports.mjs`).

| Keia Atlas | NetBox | Notes |
|---|---|---|
| `vlan_group` | VLAN group, scoped to the site | One group per office. |
| `vlans[].vid`, `role` | VLAN (`vid`, `role`) | `role` is the plan's purpose as a slug (`room-systems`). The name comes from the network standard's plan. |
| `vlans[].prefix` | IPAM prefix (`prefix`, `vlan`, `role`, `site`) | Made-up private space in the demo. |
| `vlans[].gateway` | IPAM IP address on the gateway's interface | NetBox has no "gateway" role; the connector picks the address on the gateway's VLAN interface. |
| `groups` (`virtual-chassis`, `stack`) | Virtual chassis, with its members | `ha-pair` has no NetBox object yet (a custom field or a tag on both members); `cluster` maps to a virtualisation cluster later. |
| `switches[]` | Device with role switch | `id` is the device name (the hostname); `rack` and `u` are its rack position. In-room switches sit in a space, not a rack. |
| `switches[].platform` | Platform | `unifi`, `meraki`, `netgear`: which connector reads and sets it. |
| `interfaces[].name`, `enabled` | Interface `name`, `enabled` | NetBox names are longer (`GigabitEthernet1/0/25`); the connector keeps its own name in `raw`. |
| `interfaces[].mode` | Interface `mode` | `access` or `tagged`. NetBox's `tagged-all` is not used. |
| `untagged_vlan`, `tagged_vlans` | Interface `untagged_vlan`, `tagged_vlans` | |
| `connected` | The interface's cable trace (`connected_endpoints`, with the cables on the path) | `cables` lists the patch cord and the permanent link in order; `device` and `interface` are the far end. |
| `data/cables/<site>.yaml` (patch cords) | Cable, A and B terminations | A patch cord joins a switch interface and a patch panel front port. |
| `data/runs/<site>.yaml` (permanent links) | Cable from a patch panel rear port to the outlet | NetBox models a wall outlet as a device with front and rear ports; Keia keeps the outlet in the room's space type. |
| Patch panels (`data/racks`, kind `patch-panel`) | Device with front and rear ports | Front port N maps to rear port N. |
| `source` on the file, a switch, an interface, a VLAN or a group | The connector model's source mark (`docs/connectors/model.md`) | Says a value came from NetBox or a switch platform, and when. |

Not recorded yet: PoE mode per interface (NetBox `poe_mode`, `poe_type`), LAG membership (NetBox `lag`; the trunks to a group are worked out as one bundle), speed and duplex.

The trace is worked out, never typed twice: `src/lib/switchcore.mjs` walks the room wiring, the runs and the patch cords (the same graph as the network path trace and the blast-radius explorer), and `tools/crossrefs-switchports.mjs` checks that each recorded `connected` block is that walk. Whether a port follows the VLAN plan is a finding on the pages, not a validation error.
