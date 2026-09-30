# ServiceNow

**Status:** spec only. Until there is an importer, a CMDB list exported as CSV goes through the spreadsheet importer with `--system servicenow` ([docs/setup-with-ai/import-servicenow.md](../setup-with-ai/import-servicenow.md)). **Kinds:** unit, space, ticket (and contact, from its companies).

## What it is

ServiceNow is a hosted platform for IT service management: incidents, requests, problems and changes, and a configuration management database (CMDB) of every managed thing and how things relate. Large organisations often run their service desk and their record of kit in it.

## Licence

Commercial, software as a service. Keia reads it over its API with the customer's own account.

## API

| | |
|---|---|
| Style | The Table API: REST and JSON at `https://<instance>.service-now.com/api/now/table/<table>`. `sysparm_fields` names the fields to return, `sysparm_query` filters (an encoded query), and `sysparm_display_value` chooses stored values, display values or both |
| Auth | OAuth 2 (preferred) or basic authentication, for an integration user whose roles only allow reading the tables below. Secrets from the vault |
| Pagination | `sysparm_limit` and `sysparm_offset`; the answer's `Link` header gives the next page, and `X-Total-Count` the total. For a sync, filter on `sys_updated_on` after the last run |
| Rate limits | Set per instance by its administrators as rate limit rules (per user or role, per hour). Over the limit, the answer is 429 with a time to wait; the connector keeps well under the budget the admins give it |
| Sandbox or demo | A free Personal Developer Instance from ServiceNow's developer programme, for contract tests. Never a customer's production instance. Fixtures stay made up |

## What Keia reads

**Incidents** (`incident`) → **ticket**, `type: incident`. Requests (`sc_req_item`) the same way, `type: request`.

| ServiceNow | Keia |
|---|---|
| `number`, `short_description` | `number`, `title` |
| `state` (1 New, 2 In Progress, 3 On Hold, 6 Resolved, 7 Closed, 8 Canceled) | `status` (new, in-progress, on-hold, resolved, closed; Canceled keeps its own word) and `status_native` (the display value, which may be renamed per instance) |
| `priority` (1 Critical to 5 Planning) | `priority` (1, 2, 3, 4, 4) and `priority_native` |
| `assignment_group` (display value) | `group`. `assigned_to`, `caller_id` and `opened_by` are people and are never read |
| `opened_at`, `sys_updated_on`, `resolved_at` | `opened_at`, `updated_at`, `resolved_at` (with the instance's time zone) |
| `cmdb_ci`, `location` | `unit`, `space` |
| `sys_id` | `source.record_id`; the link back is the record's form |

**Configuration items** (`cmdb_ci` and its classes, such as `cmdb_ci_netgear` for network gear) → **unit**

| ServiceNow | Keia |
|---|---|
| `name`, `serial_number`, `asset_tag`, `manufacturer`, `model_id` (display values) | `name`, `serial`, `asset_tag`, `manufacturer`, `model`; Keia's own `model_id` suggested from the catalogue |
| `install_status` (1 Installed, 2 On Order, 3 In Maintenance, 6 In Stock, 7 Retired...) | `status` (manage, plan, manage, spare, retire: On Order is Ordered; others keep their own word) and `status_native` |
| `operational_status` (1 Operational, 2 Non-Operational...) | `health_native`; `health` ok or down where it maps |
| `sys_class_name` | `category_native` |
| `location` | `space` |
| `firmware_version` (where the class has it) | `firmware` |

**Locations** (`cmn_location`, nested through `parent`) → **space**. A location's street fields are not kept. **Companies** (`core_company`) that are vendors or carriers → **contact** `type: organisation`; a company's people are never read.

Relationships (`cmdb_rel_ci`) stay in `raw` for now.

## What Keia might write later

Always through a person's approval, one named action at a time:

- Add a work note to an incident when a Keia job moves it on.
- Open an incident from a fault Keia finds, for the right assignment group.
- Create or update a configuration item at install handover through ServiceNow's Identification and Reconciliation Engine (IRE), which decides whether it is new or an update, rather than writing to CMDB tables directly.

## Field ownership

ServiceNow owns its tickets (`source`), as any service desk does: states and priorities change there. For configuration items, it is usually the system of record for status and ownership in large organisations; where a network source of truth also holds the same device, which system a page shows is set when the second is connected. Keia owns `model_id` and the `atlas_*` links.

## Sample fixture

The ticket example in `tests/fixtures/connectors/examples/ticket.yaml` is the shape a ServiceNow incident becomes. Made up. An incident from the Table API with `sysparm_display_value=true` (trimmed):

```json
{
  "sys_id": "9d1f0c2a1b2c3d4e5f60718293a4b5c6", "number": "INC0041121",
  "short_description": "Video bar in 3.04 shows no camera image",
  "state": "On Hold", "priority": "3 - Moderate", "assignment_group": "Workplace technology",
  "opened_at": "2026-09-28 07:58:00", "sys_updated_on": "2026-09-29 11:20:00",
  "cmdb_ci": "dub-3-04-bar", "location": "Dublin office - 3.04 Wren"
}
```
