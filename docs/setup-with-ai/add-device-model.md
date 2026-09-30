# Add a device model from the manufacturer's page

**Goal.** Draft a device model entry for a product the library does not have yet, from the manufacturer's public documents, with a source for every fact.

**Inputs.** The manufacturer and model name as your records write them ("Poly X72 video bar"). Optionally, links to its datasheet and manual. The agent needs web access to read them.

**Files written.**
- `data/device-models/<manufacturer>-<model>.yaml`, against `schemas/ext/device-model.schema.yaml`.
- New entries in `data/sources/<manufacturer>.yaml` (create the file if the manufacturer is new), one per document, each with its link and `last_verified` set to today.

## Steps

1. Check the model is not already in `data/device-models/` under another name or part number.
2. Find the manufacturer's own datasheet and manual. Use a third-party copy only when the manufacturer's is unavailable, and say so in the source's description.
3. Read each document twice, independently, and reconcile the two readings, as [docs/standards/new-device.md](../standards/new-device.md) asks.
4. Write the facts in your own words: manufacturer, model, part numbers, `class` (an existing file in `data/device-classes/`), a one-line `summary`, dimensions, weight, power, mounting, lifecycle dates the manufacturer published, and one `ports` entry per physical port.
5. List everything the documents do not state under `gaps`. Leave the field out; never fill it with a typical value.
6. Do not copy text, photos, drawings or manuals into the repository. Links only. A drawing is optional; without one the page shows the class outline.
7. Run `npm run validate` and `npm test`.

## Checks

- Every entry under `sources` names an id that exists in `data/sources/`.
- Every port has an id, connector, signals and direction; `face` and `order` only where a document shows them.
- `npm run validate` passes.

## Hand to the person

- The new model, fact by fact, with the source for each.
- The `gaps` list.
- Anything the two readings disagreed on, and how you settled it.
- If the model is networked and installed: whether the manufacturer publishes an end of security support. If it does not, say so; do not mark a real model's date as `demo: true`.

## The prompt

```text
Read AGENTS.md and docs/setup-with-ai/add-device-model.md, then follow it.
Add the model <manufacturer> <model>. <Links to its datasheet and manual, if you have them.>
Work on a new branch called model/<manufacturer>-<model>.
Cite a source for every fact, write in your own words, and list what you could not find under gaps.
Finish with the summary the task file asks for.
```
