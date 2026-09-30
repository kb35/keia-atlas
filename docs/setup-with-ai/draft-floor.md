# Draft a floor from a PDF or image plan

**Goal.** Turn a floor plan drawing into a draft floor file, and place the floor's spaces on it, for a person to check against the drawing.

**Inputs.**
- The drawing: a PDF page, an architect's plan, or a photo of the fire-evacuation plan. The agent needs vision (it must be able to read images).
- One known length, if the drawing has no scale bar or dimension lines: the width of a door (about 0.9 m) is a fallback, but a measured length is better.
- The floor's heights (floor level, slab to slab, ceiling, cable tray height). They are rarely on a plan. Ask facilities; never guess them.

**Files written.** `data/floors/<site>-<floor>.yaml`, and `geometry` in each space file on that floor (`data/spaces/<site>/`).

**Sensitive.** A floor plan is Restricted: it helps an attacker. For secure areas, a person can trace the plan by hand instead, or use a model that runs inside the organisation (see the guide's "What data goes where").

## Steps

1. Work out the scale from the scale bar, a dimension line, or the known length. Write down which you used.
2. Use metres, x east and y north from the outline's south-west corner. Boxes are `[x0, y0, x1, y1]`.
3. Draft the `outline`, then the `core` (stairs, lifts, risers, toilets, stores), `corridors` and open `areas`. Copy the shape of a demo floor file such as `data/floors/dub-3.yaml`.
4. Place each space already in `data/spaces/<site>/` for this floor: `geometry.on_floor` (x, y, turn) and `size_m` where it differs from its space type. Match spaces to the drawing by room number or name.
5. Mark what you are unsure of in the file's `notes` (for example "Room 3.14: label unreadable; placed by its neighbours"). Put the drawing's name and the scale you used at the top as a comment.
6. Run `npm run validate`. The floor checks are strict (see "Limits").

## Checks

- Every space on the floor is placed, inside the outline, clear of the core and corridors.
- No two spaces overlap.
- `npm run validate` passes, or every remaining failure is listed for the person.

## Hand to the person

- The floor's page (`/locations/<site>/`) and 3D view (`/locations/<site>/3d/`), to compare side by side with the drawing. A tracer that lays the drawing under the plan is designed, not built yet; until then, this side-by-side check is the review.
- Every shape marked unsure, and every room on the drawing that has no space record (and the reverse).
- The heights you were given, and by whom.

## Limits

- AI can misread a drawing: a wall taken for a corridor, a label on the wrong room, a scale off by a few per cent. Every shape needs a person's eye.
- In v0.1 a floor file must carry the demo's "Fictional floor plan" label, and a site with floors needs a cabling file (`data/runs/<site>.yaml`). If the checks ask for cabling you do not have, stop and list what they want. Do not change the checks.

## The prompt

```text
Read AGENTS.md and docs/setup-with-ai/draft-floor.md, then follow it.
The drawing is <path>, for site <site> floor <floor>. <A known length, if there is no scale bar.>
The heights are: floor level <m>, slab to slab <m>, ceiling <m>, tray <m>. Do not guess any height.
Work on a new branch called floor/<site>-<floor>. Finish with the summary the task file asks for.
```
