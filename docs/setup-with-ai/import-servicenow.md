# Import a ServiceNow CMDB export

**Goal.** Bring the room and AV devices from a ServiceNow CMDB (configuration management database: the IT system that records every managed thing) into Keia Atlas as connected records.

**Inputs.** A CSV export of the relevant CMDB list (for example the configuration items for AV and room devices), made by a person in ServiceNow. Keep it outside the repository: it may hold people's names in fields such as "Assigned to" or "Managed by".

**Files written.** A renamed copy of the CSV (outside the repository), then `data/connected/servicenow/` by the spreadsheet importer.

**There is no ServiceNow importer yet.** Until there is, the export goes through the spreadsheet importer with `--system servicenow`, so the records are marked as coming from ServiceNow. Renaming the columns is the only step an agent helps with. A lasting importer can be written by following [docs/connectors/README.md](../connectors/README.md) and the field-by-field mapping in [docs/connectors/servicenow.md](../connectors/servicenow.md).

## Steps

1. Read the header row. ServiceNow exports use either field names (`serial_number`) or labels ("Serial number"), depending on how the export was made.
2. In a copy, rename columns to the spreadsheet importer's names (`COLUMNS` in `tools/connectors/adapters/csv.mjs`). Use the record's `sys_id` as the `ID` column, so the next import finds the same record. Map the install status column to `Status`. Leave every value as it is: statuses the importer does not recognise are kept in ServiceNow's own words.
3. If the location column holds office, floor and room together, split it into Office, Floor and Room. List the rows you could not split.
4. Remove every column that names a person (assigned to, managed by, owned by, support contact). Tickets and records in Keia name a team, never a person. Remove any column that holds a password, token or key.
5. Dry run: `npm run connect -- csv <renamed file> --system servicenow`.
6. On a new branch, apply with `--apply`. Run `npm run validate` and `npm test`.

## Checks

- No column naming a person reached the renamed file.
- The dry run reports no problems, and the unit count matches the export's row count.
- `npm run validate` passes.

## Hand to the person

- The column mapping, and the columns removed (with the reason for each).
- Rows with no usable location, and statuses kept in ServiceNow's words.
- Models with no suggested `model_id`. Those go to [match-devices.md](match-devices.md).
- The validator's output.

## The prompt

```text
Read AGENTS.md and docs/setup-with-ai/import-servicenow.md, then follow it.
The ServiceNow export is <path>. Work on a new branch called import/servicenow.
Rename columns only; do not change values. Remove every column that names a person.
Finish with the summary the task file asks for.
```
