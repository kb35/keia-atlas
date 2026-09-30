# 0010. Eight made-up sites for a made-up company

- Status: Accepted
- Date: 2026-09-27

## Context

The space types and device models describe what a space should contain. To show the rest of the lifecycle (what is installed where, how it is wired, when it is due for refresh), Keia Atlas needs real-looking offices. They must be clearly made up: no real company, building, room or person.

## Decision

- The company is **Aigna**, a made-up AI company founded in Dublin and headquartered in New York. Its seven offices are in real cities, so time zones and mains supplies are real, but every building and room is invented.
- Buildings are named after native Irish trees, rooms after Irish birds: larger birds for larger rooms (Heron, Curlew, Gannet), small birds for huddle rooms (Wren, Robin, Goldcrest). Focus rooms, offices and desk banks are numbered.

| Site | Building | Role |
|---|---|---|
| New York | New York office | Headquarters, three floors |
| Dublin | Dublin office | Regional, two floors |
| Chicago | Chicago office | Regional, two floors |
| Melbourne | Melbourne office | Office |
| Tokyo | Tokyo office | Office |
| Copenhagen | Copenhagen office | Office |
| Juneau | Juneau office | Small satellite |
| Remote | Willow | Home office kits |

- Each office records its mains supply (volts, hertz, plug types), because it decides power supplies and plugs: 120 V 60 Hz in the US, 100 V 50 Hz in Tokyo, 230 V 50 Hz in Dublin, Melbourne and Copenhagen, each with its own plug.
- A space is one real space built to one option of one space type. Identical repeated units, such as a bank of 40 flex desks or 40 home kits, are one entry with a `count`.
- Room numbers start with the floor (21.04). The validator checks that every space's site, floor, space type and option exist, that room numbers are unique within a site, and that remote kits sit only at the remote site.

## Consequences

- 176 spaces: 153 rooms, 344 desks and 55 home kits, across 20 space types.
- Installed devices and wiring (step 4.4) can be generated from each space's option, so every one of those spaces can be fully wired.

Source: [Mains electricity by country](https://en.wikipedia.org/wiki/Mains_electricity_by_country).
