# Import NetBox

**Goal.** Bring NetBox's sites, locations, racks and devices, and their ports, cables, VLANs, prefixes, addresses and stacks, into Keia Atlas as connected records.

**Inputs.** NetBox's REST API output saved to one file holding every page of every list, made with the commands in [docs/connectors/README.md](../connectors/README.md#netbox-export-importer-netbox), or a file shaped like `tools/connectors/fixtures/netbox-dublin.json`. **A person makes the export**, with a read-only token taken from the vault at that moment, as shown in [docs/connectors/README.md](../connectors/README.md). The agent never sees or stores the token.

**Files written.** `data/connected/netbox/` (or `data/connected/<name>/` with `--system <name>` when there are two NetBox instances), by the importer.

**No AI needed.** The NetBox importer is deterministic. An agent only helps read the diff and write the summary.

## Steps

1. Check each list is complete: if a list's `count` is larger than the objects saved, or its last page still has a `next`, the export stopped early. `?limit=0` does not fix this, because NetBox caps every page. Stop and ask for an export that follows `next` to the end.
2. Check no file holds a token or an `Authorization` header. If one does, stop and tell the person.
3. Dry run: `npm run connect -- netbox <file>`. Import sites first when the lists are in separate files.
4. On a new branch, apply with `--apply`, in the same order.
5. Run `npm run validate` and `npm test`.

## Checks

- No "fewer objects than its count" warning.
- The dry run reports no problems.
- `npm run validate` passes.

## Hand to the person

- Counts: sites, floors, rooms, racks and devices imported.
- Devices that sit in no rack or location (placed at their site).
- NetBox statuses shown in NetBox's own words because they did not map.
- Device types with no suggested `model_id`. Those go to [match-devices.md](match-devices.md).
- Counts of ports, cables, networks, addresses and stacks, and any cable end that is not a port (kept in NetBox's words).
- Any "Planned against seen" findings: where another connected system sees something different from NetBox's record. They are for a person to look at; nothing was overwritten.
- The validator's output.

## The prompt

```text
Read AGENTS.md and docs/setup-with-ai/import-netbox.md, then follow it.
The NetBox export is <path>. I made it myself with a read-only token; you do not need the token.
Work on a new branch called import/netbox. Finish with the summary the task file asks for.
```
