# Import a spreadsheet

**Goal.** Bring a spreadsheet of rooms and devices into Keia Atlas as connected records, without changing a single value.

**Inputs.** The spreadsheet, saved as CSV (Excel's "CSV UTF-8" is ideal). One row per device. Keep it outside the repository or in a folder you do not commit: it may hold names or addresses.

**Files written.** `data/connected/spreadsheet/spaces/*.yaml` and `data/connected/spreadsheet/units/*.yaml`, by the importer, never by hand. If the columns need renaming first, a renamed copy of the CSV beside the original (not in the repository).

**No AI needed** when the columns already use names the importer knows (Office, Floor, Room, Make, Model, Serial number, Asset tag, Status and the others in [docs/connectors/README.md](../connectors/README.md)). An agent helps only when the sheet is messy: odd column names, one "Location" column that holds office, floor and room together, or several sheets.

## Steps

1. Read the header row and a few rows. Map each column to the importer's names (`COLUMNS` in `tools/connectors/adapters/csv.mjs`). Do not change any cell's value.
2. If a column needs splitting (for example "Dublin / L3 / Whooper Swan"), split it into Office, Floor and Room in a renamed copy. List every row you could not split cleanly and leave those cells as they were.
3. Drop any column that holds a password, token or key, and say so.
4. Dry run: `npm run connect -- csv <file>`. Read the diff and the warnings.
5. On a new branch, apply: `npm run connect -- csv <file> --apply`.
6. Run `npm run validate` and `npm test`.

## Checks

- The dry run reports no problems.
- The number of units matches the number of device rows.
- `npm run validate` passes.

## Hand to the person

- The column mapping, as a two-column table (their column, Keia's field), and every column kept aside in `raw`.
- Rows that could not be placed in a room, and statuses kept in the sheet's own words because they did not map.
- The count of units that got a suggested `model_id`, and the model names that did not. Those go to [match-devices.md](match-devices.md).
- The validator's output.

## The prompt

```text
Read AGENTS.md and docs/setup-with-ai/import-spreadsheet.md, then follow it.
The spreadsheet is <path to the CSV>. Work on a new branch called import/spreadsheet.
Do not change any value in the sheet. Map columns only, and ask me before splitting any column.
Finish with the summary the task file asks for.
```
