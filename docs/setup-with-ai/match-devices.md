# Match devices to library models

**Goal.** Link each imported device to a model in the library (`data/device-models/`), and each imported room to a space, so drawings, specs and ports appear on every device.

**Inputs.** Connected records already imported: `data/connected/<system>/units/` and `spaces/`. The library: `data/device-models/`. The spaces: `data/spaces/`.

**Files written.** `model_id` on connected units, and `atlas_site` and `atlas_space` on connected spaces, each with a mark in `field_sources` saying Keia set it:

```yaml
model_id: poly-studio-x72
field_sources:
  model_id: { system: keia, synced_at: 2026-10-02T09:30:00Z }
```

These links belong to Keia, so the next import keeps them.

**Without AI**, the importer already matches exact manufacturer and model names. An agent helps with the rest: "Poly X72 video bar", "STUDIO-X72", a part number instead of a name.

## Steps

1. List every connected unit with no `model_id`. Group them by the manufacturer and model text the source used.
2. For each group, find the library model by name, part number (`part_numbers`) or a clear abbreviation. Rate each match: **sure** (the same product, by name or part number), **likely** (one plausible reading), or **none**.
3. For a group with no library model, do not force a near match. Add it to the list for [add-device-model.md](add-device-model.md).
4. Do the same for connected rooms: match each to a space in `data/spaces/` by site, room number and name.
5. On a new branch, write only the **sure** matches. Leave the others for the person.
6. Run `npm run validate` and `npm test`.

## Checks

- Every `model_id` you wrote names a file in `data/device-models/`; every `atlas_space` a file in `data/spaces/`.
- `npm run validate` passes.

## Hand to the person

A table, one row per group, with the count, not per device:

| Source says | Rows | Proposed model | Confidence | Why |
|---|---|---|---|---|
| Poly X72 video bar | 38 | `poly-studio-x72` | sure | Same product name; part number A4LZ8AA in the source matches the library |

Then: the likely matches waiting for a yes, the models to add to the library, and rooms with no matching space.

## The prompt

```text
Read AGENTS.md and docs/setup-with-ai/match-devices.md, then follow it.
Match the connected records in data/connected/<system>/ to library models and spaces.
Work on a new branch called match/<system>. Write only sure matches; list the rest for me.
Finish with the grouped table the task file asks for.
```
