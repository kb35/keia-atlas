# Datadog

**Status:** live later. It is a hosted service whose value is what it sees now, so it waits for live connectors. **Kinds:** event, and observed facts on unit and port.

## What it is

Datadog is a hosted monitoring service: agents and integrations send it metrics, logs and events, monitors turn them into alerts, and its Network Device Monitoring (NDM) polls switches, routers and access points over SNMP. Teams that already watch their servers and services in Datadog often watch their network and room kit there too.

## Licence

Commercial, software as a service. Keia reads it over its API with the customer's own keys.

## API

| | |
|---|---|
| Style | REST and JSON at the customer's Datadog site (`api.datadoghq.com`, `api.datadoghq.eu`, and the other regional sites: the host depends on where the account lives). Keia reads `GET /api/v1/monitor` (monitors and their state), `GET /api/v2/events` (events), `GET /api/v1/hosts` (hosts), and the NDM endpoints under `/api/v2/ndm/` (devices and their interfaces). Monitors can also notify a webhook |
| Auth | Two headers: `DD-API-KEY` (the organisation's API key) and `DD-APPLICATION-KEY` (an application key). Use an application key scoped to read only what Keia needs (monitors, events, hosts, NDM), made for a service account, and keep both in the vault |
| Pagination | Differs by endpoint: monitors page by `page` and `page_size`; the events API pages by cursor (`page[cursor]`, `page[limit]`); hosts by `start` and `count`; NDM lists by page size and number. The connector follows each to the end |
| Rate limits | Per endpoint and per organisation, reported on every answer in `X-RateLimit-Limit`, `-Remaining`, `-Reset` and `-Period`. The connector reads them and waits; a 429 answer means back off until the reset |
| Sandbox or demo | No shared sandbox. A free trial account suits contract tests; never a customer's production organisation. Fixtures stay made up |

## What Keia reads

Everything Datadog says is observed: it goes into `seen` on the system of record's records, and differences are drift events.

| Datadog | Keia |
|---|---|
| monitor `id`, `name`, `overall_state` (OK, Alert, Warn, No Data), `tags` | event `io.keia.alert.firing` when a monitor goes to Alert or Warn, `io.keia.alert.resolved` when it returns to OK, `key` the monitor id plus the group (such as `host:dub-3-21-sw1`), `severity` (Alert → major, Warn → warning; a `severity` tag wins), `severity_native` the state |
| a monitor's group or `host:` tag | `subject`: the connected unit of that name |
| events (`id`, `title`, `timestamp`, `tags`, `alert_type`) | event `io.keia.unit.event`, only for events tagged to a unit Keia holds |
| host `name`, `up`, `last_reported_time`, `tags` | unit `health` (ok or down), `health_since`, matched by name |
| NDM device (name, IP address, vendor, model, OS version, status, as the account returns them) | unit: running `firmware` and `health`, matched on name, else address |
| NDM interface (name, alias, admin and operational status, speed) | port: `enabled` and speed seen, matched by unit and name |

Metrics are never copied: Keia links to the dashboard or monitor instead.

## What Keia might write later

Always through a person's approval:

- A downtime for the units in an approved change window, so an install pages nobody, removed when the change closes.
- A tag on a device naming its Keia space, so Datadog's own views can group by room.

## Field ownership

Datadog observes; it decides nothing Keia keeps. Its manifest will declare `observes` for unit `health` and `firmware`, and port `enabled` and `speed_mbps`. Alerts and events are Datadog's (`source`).

## Sample fixture

Made up. A monitor as `GET /api/v1/monitor/{id}` returns it (trimmed), and the event Keia would write when it alerts for one host:

```json
{
  "id": 71002, "name": "Room device not answering", "type": "service check",
  "overall_state": "Alert", "tags": ["site:dub", "team:workplace-technology"],
  "state": { "groups": { "host:dub-3-04-bar": { "status": "Alert", "last_triggered_ts": 1790755200 } } }
}
```

```yaml
kind: event
id: datadog-monitor-71002-host-dub-3-04-bar-firing-1790755200
type: io.keia.alert.firing
subject: netbox-device-104
time: 2026-09-30T08:00:00Z
severity: major
severity_native: Alert
state: firing
key: "71002:host:dub-3-04-bar"
data: { summary: Room device not answering }
```
