# 0019. Rooms, not spaces; generic roles; stages that build on each other

- Status: Accepted
- Date: 2026-09-28
- Supersedes: the earlier rule "Space, never room", and parts of [0018](0018-navigation-demo-controls-projects.md)

## Context

The product is called Keia Atlas, and the people who use it talk about rooms and room types. The first version chose "space" so that desks, pantries and home kits weren't called rooms. On review the owner chose "room" everywhere. He also asked that demo roles not use the job titles of any real company, that there be separate service managers for AV and for IT infrastructure, and said the stage setting read as if stages were alternatives rather than layers.

## Decision

- The interface says Rooms and Room types, at `/rooms/` and `/room-types/`. Keia's data and the code keep "space" (`data/spaces/`, `space_type`), because that is Keia's vocabulary; text shown from Keia files passes through `roomWords()`. Open-plan desk areas and home kits are rooms too.
- Demo roles are generic industry titles: AV and IT delivery engineer, on-site technician, service desk analyst, service manager for AV, service manager for IT infrastructure, innovation engineer, programme manager, head of AV and IT. The brand line reads "Rooms and devices".
- Stages are cumulative. Settings shows them as a ladder lit up to the chosen stage, and the masthead says "Stages 1 to n".

## Consequences

- A desk area reading as a "room" is a small stretch; the room type name (Flex desks, Home office kit) makes it clear.
- Old `/spaces/` and `/space-types/` addresses stop working.
