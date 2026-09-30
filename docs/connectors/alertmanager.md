# Prometheus Alertmanager (webhook receiver)

**Status:** file importer, `npm run connect -- alertmanager <file>`. Live later, as a webhook receiver. **Kinds:** event (and, later, a unit's observed health).

## What it is

Prometheus collects metrics; Alertmanager takes the alerts its rules raise, groups them, silences them during work, and sends them on to receivers. Many other tools can send their alerts through it too, so one receiver covers a lot: switches and power checked over SNMP, room services checked from outside, and dashboards' own alerts. Keia is one more receiver. It takes alerts, never metrics.

## Licence

Open source, Apache 2.0.

## API

| | |
|---|---|
| Style | Push. Alertmanager's webhook receiver POSTs a JSON payload (version 4) to a URL in its configuration (`webhook_configs`). Its own REST API (`/api/v2/alerts`) lists the alerts active now, for a check on start-up or after an outage |
| Auth | Set in the receiver's `http_config`: basic authentication, a bearer token, or mutual TLS. Keia's receiver checks it on every delivery; the value lives in the vault, never in Alertmanager's file in a repository |
| Pagination | None. `max_alerts` on the receiver caps the alerts in one payload, and the payload's `truncatedAlerts` says how many were left out |
| Rate limits | Alertmanager paces itself: `group_wait`, `group_interval` and `repeat_interval` decide how often a group is sent again. The receiver must answer quickly and deal with the same alert arriving more than once |
| Sandbox or demo | Run Prometheus and Alertmanager in containers, and fire test alerts with `amtool`. Fixtures stay made up |

## What Keia reads

A payload holds a group's `status`, `receiver`, `groupLabels`, `commonLabels`, `externalURL` and a list of `alerts`. The importer reads one saved payload, or an array of them in the order they arrived. Each alert becomes one **event**:

| Alertmanager | Keia |
|---|---|
| `status` firing or resolved | `type` `io.keia.alert.firing` or `io.keia.alert.resolved`, and `state` |
| `fingerprint` | `key`: the same alert always has the same one, so raised and cleared pair up, and a flapping switch gives one key, not ten incidents |
| `startsAt`; for a resolved alert, `endsAt` | `time`; `data.started_at` and `data.ended_at` (Alertmanager sends `0001-01-01T00:00:00Z` as the end of an alert still firing, which Keia ignores) |
| label `severity` | `severity` (critical and page → critical; error, major and high → major; warning, warn and minor → warning; info, none and low → info) and `severity_native` |
| label `instance`, `host`, `hostname`, `device` or `target` | `subject`: the connected unit of that name, when another system brought it in (the port and the domain are dropped: `dub-3-21-sw1.aigna.example:161` finds `dub-3-21-sw1`). No match, no guess: the event has no subject and the import says so |
| label `alertname`; annotations `summary`, `description` | `data.alertname`, `data.summary`, `data.description` |
| `generatorURL` | `source.url`, the link back to the rule |
| `externalURL`'s host | `source.instance` |

The same alert delivered twice (a repeat notification) is one event, and importing a file again changes nothing. `raw` keeps the alert with the group's receiver and labels.

Later, the live receiver also sets a unit's observed `health` (down while a critical alert about it fires), with `health_since`.

## What Keia might write later

Always through a person's approval, one named action at a time:

- A silence for the units in a planned change window, so an approved install pages nobody, removed when the change closes (`POST /api/v2/silences`).

## Field ownership

Every field of an alert event is Alertmanager's (`source`). Health, when the live receiver sets it, is an observed fact: it belongs to the monitoring that raised the alert, never to the system of record.

## Sample fixture

[`tools/connectors/fixtures/alertmanager-webhook.json`](../../tools/connectors/fixtures/alertmanager-webhook.json): two deliveries for the Aigna Dublin office, made up. The room 3.04 video bar stops answering pings and recovers 17 minutes later; a switch's PoE use goes over 80% of its budget; and a signage player that no connected system knows about fails a web check.

```sh
npm run connect -- netbox tools/connectors/fixtures/netbox-dublin.json --data /tmp/keia-try --apply
npm run connect -- alertmanager tools/connectors/fixtures/alertmanager-webhook.json --data /tmp/keia-try
```
