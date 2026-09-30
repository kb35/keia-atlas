# Zabbix

**Status:** live later. Problems matter while they are open, so it waits for live connectors; its alerts take the same shape as the Alertmanager importer's. **Kinds:** unit (observed health and inventory), event.

## What it is

Zabbix is one of the most widely deployed open-source monitoring systems: it checks hosts (switches, servers, room devices, services) with agents, SNMP and web checks, raises problems when a trigger fires, and keeps an inventory of each host.

## Licence

Open source. **From version 7.0 Zabbix is licensed under the AGPL 3.0**; 6.4 and older are GPL 2.0. Keia only reads it over its API and copies none of its code, so neither licence reaches Keia, but a customer who changes and serves Zabbix itself should know the AGPL asks them to share those changes.

## API

| | |
|---|---|
| Style | JSON-RPC 2.0: every call is a POST to one endpoint (`api_jsonrpc.php`) naming a method: `host.get`, `hostgroup.get`, `problem.get`, `event.get`, `trigger.get`. Media types can also push problems to a webhook |
| Auth | An API token, sent in the `Authorization: Bearer` header in recent versions (older ones put it in the request's `auth` field). Make it for a user whose role only allows reading the host groups Keia needs, and keep it in the vault |
| Pagination | No offset: ask with `limit`, sort by id, and ask again from the last id seen (for events, `eventid_from`) |
| Rate limits | None built in; the front end's server sets what it can take. A live sync asks only for problems changed since its last run |
| Sandbox or demo | No public sandbox. Run Zabbix from its official containers. Fixtures stay made up |

## What Keia reads

| Zabbix | Keia |
|---|---|
| host `host`, `name`, host groups; inventory `serialno_a`, `model`, `vendor`, `os`, `location` | unit, matched to the system of record's unit on serial, else name. Inventory values are observed: running `firmware` (from `os`) and `serial` go into `seen` |
| host availability | unit `health` (ok, down, unknown), `health_native`, `health_since` |
| problem `eventid`, `name`, `severity` (0 not classified, 1 information, 2 warning, 3 average, 4 high, 5 disaster), `clock` | event `io.keia.alert.firing`, `key` the problem's event id, `severity` (info, info, warning, warning, major, critical) and `severity_native`, `time` |
| recovery event (`r_eventid`, `r_clock`) | event `io.keia.alert.resolved` with the same `key` |
| the problem's host | `subject`: the connected unit |

## What Keia might write later

Always through a person's approval:

- A maintenance period for the hosts in an approved change window (`maintenance.create`), so an install raises no problems, removed when the change closes.
- Add a newly installed device as a host, from a template, so it is monitored from its first day.

## Field ownership

Everything Zabbix says is observed. Its manifest will declare `observes` for unit `health`, `firmware` and `serial`: they fill Zabbix's own unit records and the `seen` block of the system of record's unit, and a difference in firmware or serial is a drift event. Problems are Zabbix's events.

## Sample fixture

Made up. One problem from `problem.get` (trimmed), and the event Keia would write:

```json
{ "eventid": "90211", "objectid": "31044", "clock": "1790755200", "name": "dub-3-04-bar: unavailable by ICMP ping", "severity": "4", "r_eventid": "0" }
```

```yaml
kind: event
id: zabbix-problem-90211-firing
type: io.keia.alert.firing
subject: netbox-device-104
time: 2026-09-30T08:00:00Z
severity: major
severity_native: High
state: firing
key: "90211"
data: { summary: "dub-3-04-bar: unavailable by ICMP ping" }
```
