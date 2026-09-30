# 0006. Space types on public industry guidance

- Status: Accepted
- Date: 2026-09-27, revised 2026-09-30

## Context

The prototype called its templates "room types". Keia's composite profile has a `space_type` field, and some spaces with technology aren't rooms at all: desks, open collaboration areas and reception desks.

The first space types restated one company's published workplace guidelines, with that company's names for its rooms and a citation on every file. Keia Atlas is published as open source, so its standards must rest on material anyone can read and reuse, under names anyone in the industry would recognise.

## Decision

- A **space type** is the template: what a correctly built space of that kind contains. It is a Keia composite profile.
- A **space** is one real instance of a space type at a site, with its installed devices. Its extension schema is `space` (not `room`).
- Space types use **generic industry names**: huddle room, small, medium and large meeting room, hybrid meeting room, focus room, makerspace, recording studio, private office, hot desk and assigned desk, print room, cafeteria, pantry, reception, and the house comms rooms and IT store.
- Their numbers rest on **public guidance**, each recorded in `data/sources/room-guidance.yaml` (facts, short summaries and links; nothing copied):
  - **Room size and capacity:** Microsoft Teams Rooms' room sizes (focus 10 × 9 ft for 2 to 4, small 16 × 16 ft for 4 to 6, medium 18 × 20 ft for 6 to 12, large 15 × 32 ft for 12 to 16; the Signature Teams Room 25 × 14 ft for 6 to 8) and Zoom's kinds of space (huddle space up to 7).
  - **Display size:** AVIXA's DISCAS standard (ANSI/INFOCOMM V202.01), basic decision making. The house reads it at 3 percent element height, AVIXA's suggested starting point, so a display's image is at least a sixth of the distance to the farthest seat. A dual build puts content on one display, so both are sized for content.
  - **Kit class:** Microsoft's guidance (all-in-one devices for smaller rooms; separate microphones and speakers, and dual displays, for larger ones) and each house model's own room size from its maker (Poly Studio X32 small rooms, X52 medium, X72 large; Logitech MeetUp 2 small meeting rooms).
  - **Outlets and cabling:** TIA-568 (at least two telecommunications outlets per work area; 90 m permanent link, 100 m channel), with BICSI's TDMM as the design reference.
- Every value the guidance does not give (furniture, layouts, outlet heights, a spare outlet at each place, power never on a light switch) is marked **house assumption** in the space type's notes, so a reader can tell the two apart. `standard: industry` names its main source in `guideline`; `standard: house` is decision 0009.
- Four ids changed with the names (the lettered room types became `huddle-room`, `huddle-room-sofa`, `huddle-room-lounge` and `huddle-room-small`); their old addresses redirect (`src/lib/moved-types.mjs`). Every other id was already generic and stays.

## Consequences

- Anyone can check a number against a public source, and the open version carries no other company's material.
- Numbers moved where the guidance says so: meeting room capacities follow Microsoft's bands, and some display sizes grew to meet DISCAS.
- A space type is a starting point: a real organisation swaps in its own standard by changing the data, not the code.

Sources: [AVIXA, Display Image Size for 2D Content](https://www.avixa.org/resources/standards/display-image-size-for-2d-content), [Microsoft Learn, Plan for Microsoft Teams Rooms](https://learn.microsoft.com/en-us/microsoftteams/rooms/rooms-plan), [Microsoft Learn, Meeting room guidance for Teams](https://learn.microsoft.com/en-us/microsoftteams/rooms/room-planning-guidance), [Zoom Spaces hardware guide](https://www.zoom.com/en/products/meeting-rooms/hardware/guide/), [ANSI/TIA-568](https://en.wikipedia.org/wiki/ANSI/TIA-568).
