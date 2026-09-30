# Infoblox NIOS

**Status:** file importer, `npm run connect -- infoblox <file>`. Live later. **Kinds:** network, address.

## What it is

Infoblox NIOS runs DNS, DHCP and IP address management (together, DDI) on a grid of appliances, physical or virtual, managed from one grid master. Where it is in place, it is what actually hands devices their addresses and answers for their names, so its view of an address is what the network really does. (Infoblox's cloud service, Universal DDI, has a different API and is not covered here.)

## Licence

Commercial. Keia reads it over its API with the customer's own account.

## API

| | |
|---|---|
| Style | The WAPI: REST and JSON at `https://<grid master>/wapi/v2.<n>/<object>`, one path per object type (`network`, `range`, `fixedaddress`, `record:host`, `record:a`, `record:ptr`). `_return_fields+=` adds fields, such as `extattrs`, to what comes back |
| Auth | HTTP basic authentication over HTTPS for an API user, or a client certificate; the grid then keeps a session cookie. Give Keia a read-only admin group limited to the network views and DNS views it needs, from the vault |
| Pagination | Ask with `_paging=1&_max_results=<n>&_return_as_object=1`: the answer is `{ "result": [...], "next_page_id": "..." }`, and the next page is `_page_id=<that id>`. Without paging, a search that matches more than the maximum results fails rather than cutting short |
| Rate limits | No fixed published number. The grid master serves the API and the grid at once, so a live sync reads small pages, off-peak, and backs off when answers slow |
| Sandbox or demo | No public sandbox. Infoblox provides evaluation virtual appliances; contract tests run against one of those, never a production grid. Fixtures stay made up |

## What Keia reads

Save each object type's WAPI answer, following `next_page_id`, into one file: `{ "instance": "<grid master host>", "network": ..., "range": ..., "fixedaddress": ..., "record:host": ..., "record:a": ..., "record:ptr": ... }`. Each value is an array, a paged answer, or an array of pages. A single saved answer works too; the type comes from each object's `_ref`.

**Networks:** `network`, `networkcontainer`, `range` → **network**

| WAPI | Keia |
|---|---|
| network `network`, `comment` | `type: prefix`, `prefix` and `name`, `description` |
| extensible attribute `VLAN` | `vid` (Infoblox names the VLAN number; the VLAN itself is recorded in the network source of truth) |
| extensible attribute `Site` | `atlas_site` suggested, when it names a Keia office |
| networkcontainer | `type: prefix`, `role_native: Network container` |
| range `start_addr`, `end_addr`, `comment` or `name` | `type: range`, `start`, `end`, `description`, `role_native: DHCP range` |
| `disable: true` | `status_native: Disabled` |
| `_ref` | `source.record_id` |

**Addresses:** `fixedaddress`, `record:host`, `record:a`, `record:ptr` → **address**, one record per IP address (and network view), joining everything the grid says about it:

| WAPI | Keia |
|---|---|
| `ipv4addr` (or `ipv6addr`), with the length of the network it sits in | `address`, `network` |
| host record `name`, else A record `name`, else PTR `ptrdname` | `dns_name`. When the forward and reverse names differ, the import warns, and both stay in `raw` |
| fixed address `mac`, or a host address with `configure_for_dhcp: true` and its `mac` | `mac`, and `assignment: dhcp-reservation` |
| `comment` | `description` |
| `disable: true` | `status_native: Disabled` |
| the host address's `_ref`, else the fixed address's, else the DNS record's | `source.record_id` |

`raw` keeps every object for the address under its type. Extensible attributes whose names look like secrets are emptied. Leases (`lease`) are not read yet: they are what DHCP handed out just now, an observed fact for a live connector.

## What Keia might write later

Always through a person's approval, one named action at a time:

- Reserve an address for a new install: the next free address in the right network (the WAPI's `next_available_ip`), as a fixed address keyed on the new device's MAC, with its host record.
- Retire the reservation and DNS records of a device Keia retires.

## Field ownership

Infoblox owns what it fills (`source`), and Keia owns `atlas_site`. Its manifest also says it **observes** an address's `dns_name` and `mac`: Infoblox serves them, so they are what the network does. When the network source of truth (NetBox) records the same address, Infoblox's values go into that record's `seen` block, and a difference raises `io.keia.drift.found`. Nothing is overwritten. See [planned and seen](model.md#planned-and-seen).

## Sample fixture

[`tools/connectors/fixtures/infoblox-wapi.json`](../../tools/connectors/fixtures/infoblox-wapi.json): the Aigna Dublin office, made up. Three networks with their VLAN numbers, a container, the room systems DHCP pool, the video bar's host record (reserved for a MAC that differs from NetBox's record: the bar was swapped), a scheduler panel whose forward and reverse names disagree, a disabled old reservation, and an attribute holding a token, which is emptied.

```sh
npm run connect -- netbox tools/connectors/fixtures/netbox-dublin.json --data /tmp/keia-try --apply   # the plan
npm run connect -- infoblox tools/connectors/fixtures/infoblox-wapi.json --data /tmp/keia-try        # what the grid serves: one drift
```
