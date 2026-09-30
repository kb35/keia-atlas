# Oxidized

**Status:** live later. It answers "when was this switch last backed up?", which is only worth asking now. **Kinds:** unit (its `config_backup`), event.

## What it is

Oxidized backs up the configuration of network devices (switches, firewalls, access points) on a schedule, usually into a Git repository, so every change has a version. A technician's first question before and after a job is whether the device's configuration was backed up, and what changed.

## Licence

Open source, Apache 2.0.

## API

| | |
|---|---|
| Style | Oxidized's web add-on (oxidized-web) serves JSON: `/nodes.json` lists every device with its group, model, last result and time; `/node/version.json?node_full=<group/name>` lists its versions. It can also call a hook when a backup runs or a configuration changes |
| Auth | oxidized-web has none of its own. It sits behind a reverse proxy that does sign-in; Keia gets a read-only credential for that proxy, from the vault |
| Pagination | None: `/nodes.json` is the whole list |
| Rate limits | None built in. One read of `/nodes.json` per sync is enough |
| Sandbox or demo | None. Run Oxidized in a container against a few simulated devices. Fixtures stay made up |

## What Keia reads

Only the facts about each backup. **Never the configuration itself**: it can hold passwords, keys and community strings. Keia links to the version in Oxidized or the Git repository instead.

| Oxidized (`/nodes.json`) | Keia |
|---|---|
| `name`, `full_name` (group and name), `ip`, `model` | matched to the connected unit by name, else address |
| `last.end` (or `time`), `last.status` (success, no_connection, fail) | unit `config_backup.at` and `config_backup.result` (ok or failed), with the native word in `config_backup.result_native` |
| number of versions (`/node/version.json`) | `config_backup.versions` |
| the link to the latest version | `config_backup.url` |
| a hook on a configuration change | event `io.keia.unit.config-changed`, about the unit, with the time and a link to the change |

Keia's checks: a device's backup is older than its standard allows; the last backup failed; a job closed without a backup after it.

## What Keia might write later

Oxidized reads its device list from a source it is pointed at (a file, a SQL table or an HTTP URL). Later, Keia can be that source: a read-only list of every installed network unit with its name, address and model, so nothing is installed without a backup. That is Oxidized reading Keia, set up once by a person; Keia still writes nothing to Oxidized.

## Field ownership

`config_backup` is an observed fact and belongs to Oxidized. It fills the field on its own connected unit record and, declared in `observes`, the `seen` block of the system of record's unit.

## Sample fixture

Made up. One node from `/nodes.json` (trimmed), and the field Keia would keep:

```json
{
  "name": "dub-3-21-sw1", "full_name": "dublin/dub-3-21-sw1", "ip": "192.0.2.11", "group": "dublin", "model": "IOS",
  "time": "2026-09-30 06:00:12 UTC",
  "last": { "start": "2026-09-30 06:00:05 UTC", "end": "2026-09-30 06:00:12 UTC", "status": "success" }
}
```

```yaml
config_backup:
  at: 2026-09-30T06:00:12Z
  result: ok
  result_native: success
  url: https://oxidized.example.com/node/version?node_full=dublin/dub-3-21-sw1
```
