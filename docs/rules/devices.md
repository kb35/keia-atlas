# Devices

A device looks the same everywhere: a front-on drawing of the real product, its ports on a panel, its state beside it. Step by step: `docs/standards/new-device.md`.

### D1. Data before drawing

Write `data/device-models/<manufacturer>-<model>.yaml` from two independent readings of the vendor's documents. What they don't state goes under `gaps`.

- **Why:** drawing, ports, wiring and checks all read this file.
- **Do:** cite each document in `data/sources/`.
- **Don't:** fill a field from memory.

### D2. Front-on, from the vendor's picture, to scale

Trace the vendor's front photo or dimensional drawing into `src/lib/art.mjs` (a 320 by 180 canvas centred on 160, 88) at 0.35 px per mm, and name the source in `ART_SRC`. No picture, no drawing: the class outline shows and says so.

- **Why:** people recognise the box on the wall, and size is information.
- **Do:** take width and height from the data sheet.
- **Don't:** guess a shape, add text, or add a logo beyond a plain mark.

### D3. Same parts, same order

Every model of a type draws the parts in that type's `ORDER`; a missing part becomes zero size. The shell is `shadow`, `body`, then only what hangs off it (mount, stand, feet); everything on the face is clipped to the body.

- **Why:** matching parts let one model morph into the next.
- **Do:** switch to and from every other model of the type before committing.
- **Don't:** invent a part name for one model.

### D4. Colours from art tokens

Drawings use only `art-*` classes and art tokens. Real finishes are near-black, so art keeps its colours in every look.

- **Why:** a look can retune all art in one place.
- **Do:** pick the nearest `art-*` class.
- **Don't:** write a hex colour in a drawing.

### D5. Ports by id, face and signal

One entry per physical port: an `id` (`hdmi-in-1`, `lan-1`), a `face` (front, rear, bottom) and an `order` left to right. Each face gets its own row. Colour comes from the signal (video, USB, PoE, network, HDBaseT, power, audio). A new connector gets a shape in `SHAPES` in `src/lib/ports.mjs` first.

- **Why:** the same id on two models makes the port slide, not reappear.
- **Do:** reuse an id when another model has the same port.
- **Don't:** colour a port per model.

### D6. State beside the drawing

Health is a status light beside the device. An open incident makes its row or card radiate red. Lifecycle is a pill in plain words: Ordered (plan), Procured (procure), Being installed (deploy), In service (manage), Retired (retire), from `STAGE_LABEL` in `src/lib/data.mjs`. One physical device is a unit, and the list of them is Units, because a unit is installed for only part of its life.

- **Why:** the drawing stays recognisable and state reads the same everywhere.
- **Do:** pair each light with a word, and use the same status words everywhere.
- **Don't:** tint the drawing, or call the set of units "Installed".

### D7. Glyphs at small sizes

At icon size a device is its class glyph from `src/lib/glyphs.mjs`: 40 by 28, 1.8 stroke, round ends, current text colour.

- **Why:** a traced drawing turns to mush at 40 px.
- **Do:** add a glyph with every new device class.
- **Don't:** shrink a full drawing into a list row.
