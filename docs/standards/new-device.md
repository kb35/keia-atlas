# Standard: adding a device model

Every device in Keia looks and behaves the same way, so the console reads as one system. Follow this when adding a model, or a new kind of device. The rules behind them are in the rule book (`docs/rules/devices.md` and `docs/rules/motion.md`).

## 1. Data first, from two readings

- Create `data/device-models/<manufacturer>-<model>.yaml` against `schemas/ext/device-model.schema.yaml`.
- Read the vendor's data sheet and manual twice, independently, and reconcile them (decision 0008). Anything the sources don't state goes under gaps, never guessed.
- Cite every document in `data/sources/`, with the date it was checked.
- Ports: one entry per physical port.
  - `id` is `<connector>-<direction>-<n>` or `<connector>-<n>`, for example `hdmi-in-1`, `usb-a-2`, `lan-1` or `power-in`. A port both models share keeps the same id, so it slides instead of re-appearing when you switch models.
  - Give each port its `face` (front, rear, bottom) and its `order` left to right as the vendor draws it.
- The model needs a device class (`data/device-classes/`, a Keia object profile). A new kind of device needs a new class first.

## 2. The drawing

- Front-on, traced by hand from the vendor's front photo or dimensional drawing. Name that source in `ART_SRC` in `src/lib/art.mjs`.
- Canvas: `viewBox 0 0 320 180`, centred on (160, 88). Scale is 0.35 px per mm within a type, so models of a type are drawn to scale against each other.
- Parts: every model of a type draws the same named parts in the same order (`ORDER` in `art.mjs`). A part a model doesn't have is left out, and it becomes a zero-size part automatically. This is what lets one drawing morph into the next.
- The outer shell is `shadow`, then `body` (a rectangle), then only the things that hang off it: `mount`, `stand` or feet. Everything else sits on the face and is clipped to the body.
- Colour comes only from the art tokens (`--art-body`, `--art-lens`, `--led` and so on) and their `art-*` classes. There's no text in drawings, and no brand logos beyond a plain shape.
- A model without a traced drawing shows its class outline and says so. That's allowed; guessing a shape is not.

## 3. Ports panel

- Connector shapes live in `SHAPES` in `src/lib/ports.mjs`. A new connector type gets one shape there, drawn in the same 40 × 24 style, before any model uses it.
- Port colour comes from the signal (`--c-hdmi`, `--c-usb`, `--c-poe` and so on), never set per model.

## 4. Motion

Nothing to add: drawings and ports follow the motion rule book (`src/styles/motion.css`, decision 0017). Shared parts and ports move into place, new ones grow from nothing at their own centre, and missing ones shrink away.

## 5. Checks before committing

- `npm run validate` checks the schema and every cross-reference.
- `npm test`.
- Open the model's profile page and switch to and from every other model of its type. Check that nothing jumps and no part leaves the body.
- Planned: an automatic check that every drawing uses only its type's part names. Until it exists, check this by eye.
