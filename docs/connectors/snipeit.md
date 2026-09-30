# Snipe-IT

**Status:** file importer, `npm run connect -- snipeit <file>`. Live later. **Kinds:** space, unit (and, later, event).

## What it is

Snipe-IT is a widely used open-source asset register. Teams keep in it what they bought, from whom, when, with what warranty, where each asset is and who has it. For room and network kit that fills what a network source of truth lacks: the purchase date, warranty and supplier that a refresh plan and a return for repair need.

## Licence

Open source, AGPL 3.0. Keia only reads it over its API and copies none of its code, so the licence does not reach Keia.

## API

| | |
|---|---|
| Style | REST and JSON at `/api/v1/`: `/hardware` (assets), `/locations`, `/models`, `/manufacturers`, `/categories`, `/statuslabels`, `/suppliers`, `/maintenances` |
| Auth | A personal access token sent as `Authorization: Bearer <token>`, with `Accept: application/json`. Make it for an account whose permissions only allow viewing, and keep it in the vault |
| Pagination | `limit` and `offset`. A list answers `{ "total": n, "rows": [...] }`; keep asking until you hold `total` rows |
| Rate limits | The API is throttled per user; the limit is set by the host (`API_THROTTLE_PER_MINUTE`, 120 a minute unless changed). A live sync stays well under it and waits when told to |
| Sandbox or demo | A public demo that is reset regularly, for exploring only. Contract tests run against Snipe-IT in a container. Fixtures stay made up |

## What Keia reads

Save `/api/v1/locations` and `/api/v1/hardware` (every page) into one file: `{ "instance": "<snipe-it host>", "locations": ..., "hardware": ... }`. Each list may be one answer or an array of pages.

**Locations** → **space**

| Snipe-IT | Keia |
|---|---|
| `name`, `parent` | `name`, `parent`. A location with no parent is a `site`; one with places inside it a `floor`; the rest `room` |
| `country` | `country` |
| a site's `name` or `city` | `atlas_site` suggested, when it names a Keia office |
| `address`, `address2`, `zip`, `phone`, `fax`, `manager` | emptied in `raw` (privacy, below). The town (`city`) is kept |

**Assets** (`hardware`) → **unit**

| Snipe-IT | Keia |
|---|---|
| `name` (else `asset_tag`), `asset_tag`, `serial` | `name`, `asset_tag`, `serial` |
| `manufacturer.name`, `model.name`, `category.name` | `manufacturer`, `model`, `category_native`; `model_id` suggested from the catalogue |
| `status_label.status_meta`, `status_label.name` | `status` (deployed → manage, deployable → spare, archived → retire; pending and undeployable keep their own word) and `status_native` ("Out for repair") |
| `assigned_to` when it is a location, else `location`, else (not checked out) `rtd_location` | `space` |
| `purchase_date.date`, `warranty_expires.date`, `supplier.name` | `purchased_on`, `warranty_ends`, `supplier` |
| `custom_fields` | kept in `raw`. A field whose name looks like a secret ("Admin password") is emptied |

### People are never kept

An asset's `assigned_to` ("checked out to") can be a person: their name, user name, email and staff number. Keia keeps no people, and personal devices are out of scope, so by default:

- when `assigned_to` is a person, it is emptied in `raw` and listed in `raw_redacted`, and the asset is not placed anywhere: a person's whereabouts are not the asset's (their home is not a place Keia records);
- `created_by` and the other "who did it" fields on an asset, and a location's `manager`, are emptied the same way;
- the import says so in a warning.

Checked out to a location, or to another asset, is kept. Changing this default is a privacy decision for a person to make and record, not a setting an agent changes.

## What Keia might write later

Always through a person's approval, one named action at a time:

- Create the asset when an install is handed over, with its serial, tag, model and location.
- Check an asset in to a room, or out to a store, when a Keia job moves it.
- Set a retired status when Keia decommissions a unit.
- Log a maintenance (a repair or return) against an asset from a Keia job.

## Field ownership

Snipe-IT is the system of record for the asset facts: `serial`, `asset_tag`, `purchased_on`, `warranty_ends`, `supplier`, and the asset's status and location in the register (`source`). Keia owns `model_id` and `atlas_site`. When NetBox also records a serial or an asset tag, each system keeps its own record; which one a page shows is set when the second is connected ([who owns each field](model.md#who-owns-each-field)).

## Sample fixture

[`tools/connectors/fixtures/snipeit-api.json`](../../tools/connectors/fixtures/snipeit-api.json): the Aigna Dublin office and one home office, made up. Five locations; a video bar and touch controller in room 3.04; a dock checked out to an invented person (emptied); a spare video bar in the IT store; an archived touch controller; and a UPS out for repair. A custom field holding a password and the office's street address are emptied too.

```sh
npm run connect -- snipeit tools/connectors/fixtures/snipeit-api.json
```
