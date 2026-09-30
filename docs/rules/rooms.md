# Spaces

A space drawing is a promise about the real space. The model is `src/lib/room3d.mjs` (drawn by `RoomScene.astro`); wiring is `src/lib/wiring.mjs` (drawn by `Wiring.astro`).

### R1. To scale, one viewpoint

Each space type is modelled in metres from its published facts: area, table size, display size, camera height. Sizes not published are chosen to fit, kept the same everywhere, and named in the caption. Every space is a cut-away from the front right corner, display wall at the back, with a ruler in metres. This is for space drawings; a whole building is R8.

- **Why:** a small huddle room must look small, and one space read means all spaces read.
- **Do:** change the profile's data and let the drawing follow.
- **Don't:** nudge furniture by eye.

### R2. What every space drawing shows, and how hidden kit looks

Every item in the build option, numbered to match the Key beside it, and every outlet plate, lettered A, B, C. Displays on the wall or a stand, monitors on desks, furniture at real size. Things out of sight (behind the display, under the table, behind storage, outside the door, in the ceiling) are drawn where they really are, under what hides them, with a faint dashed outline over it. One marker rule everywhere, drawing and Key alike: a solid marker is something you can see in the space, a dashed one something hidden. A visible thing's marker sits just above it (or below or beside it, never on another device); a hidden thing's marker sits just outside what hides it, on the nearest side, with a short leader line back to it. Markers never overlap. "See behind" fades what hides them; pointing at a hidden thing does the same.

- **Why:** the drawing and the equipment list must never disagree, and hidden kit must not pile up on the display face.
- **Do:** give every item a place from the profile; let `layoutLabels` in `src/lib/room3d.mjs` place the markers.
- **Don't:** leave out a device because it is hard to see, or put a marker on the thing that hides it.

### R3. Outlets are real plates, in the site's plug type

Every outlet in the option is drawn as what it is, to scale, on its surface: a wall plate on the wall, a floor box flush in the floor, a desk module on the desk, a plate in the ceiling. The outlets at one place share one group (behind a pair of displays, the ports split in order, half behind each screen). Power sockets are the site's type from `mains` in `data/sites/<site>.yaml` (a Danish site draws Type K, since C is a plug only); data ports are keystone jacks coloured by signal with the same tokens as ports and cables everywhere; a laptop wall plate shows its HDMI and USB-C. Sizes, in mm:

| Where | Plate | Source |
| --- | --- | --- |
| UK, Ireland, Singapore (Type G) | 86 × 86 single, 146 × 86 double (a twin socket) | BS 4662 boxes; MK, Cablenet plates |
| US, Canada (Type A, B) | 70 × 114 single gang, 46 more a gang (2.75, 4.56, 6.375 in) | Leviton wallplate size guide |
| Japan (Type A, B) | 70 × 120, a duplex socket | Panasonic Cosmo Wide 21 |
| Australia (Type I) | 116 × 76, a double power point | Clipsal 2025 |
| Continental Europe, Denmark | 80 × 80 frame a socket, 71 apart | 71 mm from DIN 49073 box spacing; 80 mm is the house default |
| Data | keystone jack face 14.5 × 16 | Keystone module standard |
| Floor box | 300 × 300 lid, plates laid in it, direct runs as 25 mm conduit | 3-compartment floor boxes (Cableduct Minima) |
| Desk module | 52 a socket, 24 a jack, 56 tall | House default |

A wall outlet sits at the height the guideline gives (`height_mm` on the outlet, the middle of a range); where it gives none, 450 mm to its centre (house default, inside Approved Document M's 450 to 1200 mm and above ADA's 15 in). Outlets behind a display sit low behind it, under the track and the hidden devices (R7). The caption names the format and any house default. A space type has no country, so it shows plain outlets. The Key lists every plate, drawn front-on, with what it feeds. "Cables" draws every cable in the option along its containment (R7), coloured by signal; pointing at a plate lights the devices plugged into it and their ports, and pointing at a device lights its plate.

- **Why:** Dublin has Type G sockets on 86 mm plates, Chicago Type B on 70 mm ones; a technician should see where to plug in.
- **Do:** record the mains for every new site, and number wiring ends as outlet ports (`outlet:power/behind-display#2`) so the cable finds its socket.
- **Don't:** draw an outlet as a floating icon, or one country's plug everywhere.

### R4. Wiring reads left to right

Where a signal starts, what carries or switches it, where it ends. Cables take their signal's colour. In the wiring diagram, outlets are listed under each device, not drawn as long lines (the space drawing shows them as plates, R3). Hovering a device or cable lights its path; a table lists the same cables.

- **Why:** people trace a fault the way the signal flows.
- **Do:** keep the diagram on one screen.
- **Don't:** draw how every space reaches the internet.

### R5. Racks: small and whole, the chosen item large

Racks are drawn in millimetres to scale: 1U is 44.45 mm, U1 at the bottom, each item from its front in `src/lib/rackfaces.mjs` and its product in `data/rack-gear`. The whole rack is small (about 12 px a unit) with a bar in each item's group colour; the chosen item is drawn large beside it, every port on it, with its facts and links. A port a recorded patch cable uses shows a plug in the cable's standard colour, and pointing at it says where the cable goes. Choosing keeps the item in the address and lights its cables in Patching; nothing dims and the page never moves. Power strips are listed, not drawn, in the small rack. A recorded replacement can be shown as it was (decision 0028).

- **Why:** a technician should see the whole rack at once, then read one device port by port before touching anything.
- **Do:** add the gear's front and product before placing it; record a swap with `replaced` on the rack item.
- **Don't:** draw a generic box for real gear, draw the whole rack so large it needs a list to navigate, or put details in a panel that changes height under the pointer.

### R6. Plans in cards: long side across, blue line is the screen

The small floor plans on space type and space cards sit on a wide tile. A space that is deeper than it is wide is turned a quarter turn so its long side runs across the tile and the plan fills it. The display wall is marked in blue, and it stays the one fixed thing: at the top of an upright plan, on the left of a turned one. Each plan is to scale inside its own card, with its 1 m bar. The big drawing on a profile page keeps the display wall at the back.

- **Why:** a tall plan on a wide tile leaves it half empty and small; "the blue line is the screen" is easy to learn and works either way round.
- **Do:** let `RoomPlanSprite.astro` decide the turn from the space's width and depth.
- **Don't:** turn a plan by hand, or drop the blue marker to make a shape fit.

### R7. Cables run along containment, from the real ports

Every cable in a space drawing runs the way an installer would run it: out of the port it really uses, a short straight drop into containment, along the containment, and a short straight drop into the port at the other end. Nothing crosses the space in the air. Behind a display, bottom to top: the outlet plates just above the screen's lower edge, then the **track** (a horizontal channel across every screen), then the boxes behind the display, hung on their base with the rear panel down so their cables drop straight into the track, each behind the screen whose plate it plugs into. Elsewhere: a **wall riser** from the floor duct and skirting up to the track, clear of the video bar and the plates; a **ceiling drop** from the track to the **ceiling baskets** along the display wall and the door wall, with a branch across the ceiling to each ceiling device; **skirting** with straight rises to each wall plate; under a table a **tray**, then a **cable spine** or a **leg** down to a **floor cover** into the **floor box**, and the **floor duct** from the box to the wall riser (a table fixed to the display wall uses a **wall pass-through** instead); under a desk a tray, a back leg, a floor cover to the nearest wall. The building's data comes in above the door, from the corridor ceiling; each plate's feed runs up inside the wall to it (a floor box's through the floor void). Each profile records its containment and data entry in `geometry`.

Routing is Manhattan in the space's axes (along the display wall, away from it, up): the shortest path over the containment, with few bends. Cables that share a run lie side by side in lanes 3.2 px apart (the track's lanes close up to 2.1 px to fit behind the screen), each in its signal's colour, keeping their lane round every fold; the order is chosen to leave the fewest crossings. Stretches under the floor are dashed. Ports come from the model's `face` and `order`; where the model does not give them, the house default is the rear face, lower third, spread about the middle, and the Key says so. Containment is drawn only with Cables on, and only as far as its cables go. Pointing at a cable lights its whole route (the containment it runs in) and both ends; the Key lists every cable in words ("Video bar LAN 1 to plate B, data 5, via the track behind the display").

- **Why:** a technician must be able to trust the drawing to find a cable, and a tidy, standard route is what a good install looks like.
- **Do:** give each device model its ports' `face` and `order`; change the containment rule in `src/lib/cableroute.mjs`, never one cable by hand.
- **Don't:** draw a cable as a curve, invent a port the model does not have, or route anything through the air to make a picture fit.

### R8. A building is one model, shown two ways

An office with floor files is one building model (`src/lib/floors.mjs`), shown as an interactive 3D view and as floor plans (decision 0030). The 3D view starts at the house angle (front right, like a space drawing), has preset views and a floor switch, and never moves on its own; the floor plan is the phone view, the keyboard route and the view without WebGL. Choosing anything in either lights its whole path to the internet in both, and the panel beside lists it hop by hop from `trace()`. Spaces are coloured by their live state, cables by purpose (the house cable colours) or by health; a problem glows, or shows a still ring with reduced motion. Every view of it carries the fictional floor plan label (F9) and "Simulated live" for the states.

- **Why:** a building with a riser and hundreds of cables cannot be read from one fixed angle, and a phone or a keyboard needs a flat, focusable view of the same thing.
- **Do:** change the floor files, runs or circuits and let both views follow; keep one choice for both views.
- **Don't:** draw a second, hand-made plan, let the 3D view turn by itself, or show a floor or cable that is not in the data.
