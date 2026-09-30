# LibreNMS

**Status:** live later. Its value is what it sees now, so it waits for live connectors; a saved export would be stale by the time it is read. **Kinds:** unit, port, connection, address, event (all observed).

## What it is

LibreNMS is open-source network monitoring that finds switches, access points and other devices on its own over SNMP, then keeps asking them how they are: up or down, which ports are up, at what speed, on which VLAN, how much PoE they draw, which MAC addresses sit behind each port, and which neighbour each port sees (LLDP and CDP, the protocols switches use to announce themselves to each other). It is the open "what is really plugged in where" for many network teams.

## Licence

Open source, GPL 3.0. Keia only reads it over its API.

## API

| | |
|---|---|
| Style | REST and JSON at `/api/v0/`: `/devices`, `/devices/:hostname/ports`, `/ports/:id`, `/resources/fdb` (MAC addresses per port), `/resources/links` (neighbours), `/resources/locations`, `/inventory/:hostname`, `/alerts`. Alert transports can also push alerts to a webhook |
| Auth | An API token in the `X-Auth-Token` header, made for a read-only user, kept in the vault |
| Pagination | Most lists come back whole; ask per device for the big ones (ports, MAC tables) to keep answers small |
| Rate limits | None built in. The same server polls the network, so a live sync reads per site, spaced out, and never faster than the poller's own cycle (usually five minutes) |
| Sandbox or demo | No sandbox the project keeps for API tests. Run LibreNMS in a container against a few simulated SNMP devices. Fixtures stay made up |

## What Keia reads

Everything LibreNMS says is an **observed fact**. It lands in the `seen` block of the matching NetBox (or other source of truth) record, and a difference raises a drift event ([planned and seen](model.md#planned-and-seen)). Where no system of record holds the thing, LibreNMS's own record stands alone in `data/connected/librenms/`.

| LibreNMS | Keia |
|---|---|
| device `hostname` or `sysName`, `hardware`, `serial`, `version`, `location` | unit `name`, `model`, `serial`, `firmware` (running), `space` by location name. Matched to the system of record's unit on serial, else name |
| device `status` (up or down), `status_reason`, `uptime` | unit `health` (ok or down), `health_native`, `health_since` |
| port `ifName`, `ifAlias`, `ifAdminStatus`, `ifOperStatus`, `ifSpeed` (bit/s), `ifPhysAddress`, `ifVlan` | port `name`, `description`, `enabled`, `speed_mbps`, `mac`, and the VLAN seen as `untagged_vlan`. Matched to the recorded port by its unit and name |
| MAC addresses behind a port (FDB) | the address or unit with that MAC, seen on that port |
| neighbour links (`local_port_id`, `remote_hostname`, `remote_port`, `protocol`) | connection, observed: which port really meets which. A recorded cable with a different far end is a drift |
| inventory (optics, power supplies) with serials | unit with `inside` its switch |
| alerts (rule, severity, state, timestamp) | event `io.keia.alert.firing` or `.resolved`, keyed by the alert's id, as for Alertmanager |

The checks this turns on, from the house network standard: the VLAN seen on a room device's port matches the plan; PoE use stays under the budget; both uplinks are up; no active port sits on VLAN 1.

## What Keia might write later

Always through a person's approval:

- Add a newly installed device to monitoring (`POST /api/v0/devices`), so it is watched from the day it goes in.
- Mark a device under maintenance during an approved change, so an install raises no alerts.

## Field ownership

LibreNMS owns nothing a system of record decides. Its manifest will declare `observes` for unit `health`, `firmware` and `serial`, and for port `enabled`, `mac`, `speed_mbps` and `untagged_vlan`; a live import fills those into `seen` on the owner's records and raises drift for the differences.

## Sample fixture

Made up. One port as `/api/v0/ports/:id` returns it (trimmed), and what Keia does with it:

```json
{
  "port_id": 5012, "device_id": 41, "ifName": "Gi1/0/12", "ifAlias": "Room 3.04 video bar",
  "ifAdminStatus": "up", "ifOperStatus": "up", "ifSpeed": 1000000000,
  "ifPhysAddress": "00005e00530c", "ifVlan": "20"
}
```

Matched to NetBox's port `GigabitEthernet1/0/12` on `dub-3-21-sw1`, which records VLAN 30: the port's `seen.untagged_vlan` gets VLAN 20 from LibreNMS, and Keia raises `io.keia.drift.found` ("Port Gi1/0/12: planned VLAN 30, seen VLAN 20"). The interface name is matched in its short and long forms.
