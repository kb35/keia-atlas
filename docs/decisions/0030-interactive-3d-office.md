# 0030. An interactive 3D office: one building model, shown two ways

- Status: Accepted
- Date: 2026-09-30

## Context

The owner asked for "a 3D model of a whole office, including the MDF and all the cable in and everything, so everything can be seen, it all makes sense and it's all connected, even the ISP in and out." The floors pilot (Hazel House, Dublin) now holds both floors, 34 rooms placed with their variations, the core, trays, the riser, 16 access points, 292 runs and both internet circuits, and `trace()` in `src/lib/floors.mjs` walks any device, outlet, access point or run out to the internet.

Room drawings (rooms.md R1) are a fixed cut-away from one viewpoint, drawn as SVG. That works for one room and keeps every room comparable, but a building with two floors, a riser and 292 cables cannot be read from one fixed angle: things hide behind each other, and people need to turn it, isolate a floor and follow a path.

Options: (a) more fixed SVG views (a cut-away per floor), (b) an interactive WebGL view, (c) a 2D plan only.

## Decision

**One building model, shown two ways** (new rule R8 in `docs/rules/rooms.md`).

- **3D**: an interactive three.js view (`src/lib/office3d-scene.mjs`), from npm, bundled by Astro and loaded only on the 3D page, and only when the screen is at least 760 px wide and the browser can draw WebGL. Floors stacked, with a switch to isolate one; rooms as see-through volumes coloured by the live state; racks with every item at its height; trays, riser, access points; every run as instanced cylinders in its purpose colour or its health; both providers' lead-ins from the street, up the riser, to the MDF. It starts at the house angle (front right, as room drawings do) and has preset views (Front right, Top, one floor), orbit, pan and zoom by mouse, touch and keyboard, eased on the motion tokens, and never turns on its own.
- **2D**: the floor plan (`src/components/FloorMap.astro`) is the same model flat. It is the phone view (under 760 px, turned a quarter turn so its long side runs down the screen), the keyboard route (rooms, racks and access points can be focused and chosen) and the fallback without WebGL.
- **One choice for both**: choosing anything (a room, rack, access point, cable or circuit) lights its whole path in either view, and the side panel lists it hop by hop from `trace()` (device, outlet, run, panel port, switch, core, firewall, the provider's box, the circuit), with links to the room, unit and cable pages and a live light on each hop the feed reports on. Anything with a problem glows; with reduced motion it is a still ring.
- **Built once, sent as data**: `src/lib/office3d.mjs` turns the building model into the scene and every path (each hop once); `/locations/<site>/3d.json` adds the live simulation's model for the office, so the 3D page agrees with the Rooms and Devices overviews at every moment.
- **It draws only when something changes** (a camera move, a live state, a choice), pauses its fault pulse when the tab is hidden or the view is off screen, and reads its colours from the design tokens again when the look or light and dark changes.
- **Honest labels**: "Fictional floor plan: room sizes from the room profiles; layout, trays and cable lengths made up for the demo." on the model and every plan, and the live state marked "Simulated live". Cables are drawn thicker than life, and the legend says so.

R1 stays as it is for room drawings: one room, one fixed viewpoint, to scale.

## Consequences

- three.js and the scene add about 150 KB gzipped (610 KB before compression) to the 3D page only, loaded after the page itself; phones and pages without the 3D view load none of it.
- The page is `/locations/<site>/3d/` for each site with floor files (today `dub`). It has no place tab yet: the sidebar's move to Locations comes later (Shell's NAV is shared).
- Access points are not units in an install yet (floors pilot, open point 1): their health comes from the same simulation, keyed by their asset tag, and they have no unit page to link to.
- Picking a single cable in 3D is fiddly by nature; the room's panel lists its cables with a device as buttons, and the plan draws every run.
