# GLPI

**Status:** spec only. A saved export can go through the spreadsheet importer with `--system glpi` meanwhile. **Kinds:** ticket, unit, space, port, connection.

## What it is

GLPI is an open-source service desk and asset register in one, widely used in Europe and in the public sector: tickets, problems and changes beside network equipment, monitors, peripherals, racks, power strips, sockets and the cables between them. For a team that runs it, it can hold both Keia's Support side and much of its record of kit.

## Licence

Open source, GPL 3.0. Keia only reads it over its API.

## API

| | |
|---|---|
| Style | Two REST APIs. The older one at `/apirest.php` (a session opened with `initSession`, then `/Ticket`, `/NetworkEquipment`, `/Location`, `/search/...`). GLPI 11 adds a newer high-level API with an OpenAPI description. The live connector uses the newer one where the customer's version has it |
| Auth | Older API: an application token (`App-Token` header) and a user token, exchanged for a session token. Newer API: OAuth 2. Either way, a read-only profile limited to the entities Keia needs, secrets from the vault |
| Pagination | Ranges: the older API's `range=0-49` parameter, with the total in the `Content-Range` header; keep asking until you hold it all. The newer API pages too |
| Rate limits | None built in; whatever the host sets. A live sync asks for what changed since its last run (`date_mod`), not everything |
| Sandbox or demo | No public sandbox for API tests. Run GLPI in a container. Fixtures stay made up |

## What Keia reads

**Tickets** → **ticket**

| GLPI | Keia |
|---|---|
| `id`, `name`, `type` (1 incident, 2 request) | `number`, `title`, `type` |
| `status` (1 new, 2 processing (assigned), 3 processing (planned), 4 pending, 5 solved, 6 closed) | `status` (new, in-progress, in-progress, on-hold, resolved, closed) and `status_native` |
| `priority` (6 major, 5 very high, 4 high, 3 medium, 2 low, 1 very low) | `priority` (1, 1, 2, 3, 4, 4) and `priority_native` |
| the assigned group | `group`. An assigned person is never read |
| `date`, `date_mod`, `solvedate` | `opened_at`, `updated_at`, `resolved_at` |
| linked items (network equipment, a location) | `unit`, `space`, `related` |

**Kit and places** → **unit**, **space**, **port**, **connection**

| GLPI | Keia |
|---|---|
| network equipment, monitors, peripherals, PDUs (`name`, `serial`, `otherserial` (inventory number), manufacturer, model, state, location) | unit `name`, `serial`, `asset_tag`, `manufacturer`, `model`, `status_native`, `space`. Computers and phones are out of scope and not read |
| racks, and a unit's position in a rack | space `level: rack`, unit `position` |
| locations (nested) | space; a location's address fields are not kept |
| network ports, sockets (wall outlets) | port (`type: interface`; a socket is a `front` port on its space) |
| cables, with their two ends | connection |

## What Keia might write later

Always through a person's approval:

- Add a follow-up to a ticket when a Keia job moves it on ("Technician on site, 10:40").
- Open a ticket from a fault Keia finds, for the right group.
- Solve a ticket when its Keia job closes, if the service desk's rules allow it.

## Field ownership

GLPI owns its tickets (`source`): status and priority change there, and Keia shows its plain words beside GLPI's. For kit, GLPI is the asset register: serials, inventory numbers and states are its. Where a network source of truth also holds the same switch, each keeps its own record; which one a page shows is set when the second is connected. Keia owns `model_id` and the `atlas_*` links.

## Sample fixture

Made up. A ticket as the older API returns it with `expand_dropdowns=true` (trimmed), and the ticket Keia would write:

```json
{
  "id": 4127, "name": "No picture on the room 3.04 display", "type": 1,
  "status": 4, "priority": 3, "urgency": 3, "impact": 3,
  "date": "2026-09-29 09:12:00", "date_mod": "2026-09-29 11:40:00", "solvedate": null,
  "locations_id": "Dublin office > Third floor > Meeting room 3.04 (Wren)"
}
```

```yaml
kind: ticket
id: glpi-ticket-4127
type: incident
number: "4127"
title: No picture on the room 3.04 display
status: on-hold
status_native: Pending
priority: 3
priority_native: Medium
group: Workplace technology        # from the ticket's assigned group (/Ticket/4127/Group_Ticket)
opened_at: 2026-09-29T09:12:00+01:00   # GLPI's local time, with the instance's time zone added
updated_at: 2026-09-29T11:40:00+01:00
```
