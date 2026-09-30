# Review what's missing

**Goal.** Give a person a short, ordered list of what would make the records more useful, and what is blocking a check. Read only: this task changes no file.

**Inputs.** The whole of `data/`, and the output of `npm run validate`.

**Files written.** None. The result is a message to the person (or a pull request description, if they asked for one).

## Steps

1. Run `npm run validate`. Group any failures by the rule that failed, not by file.
2. Look for what is not known yet, and count it: units with no `model_id`; models with long `gaps`; spaces not placed on a floor that has a floor file; sites with no floor files; rooms in the source with no space record; units with no serial or firmware where the device class lists it under `helpful_fields`.
3. For each item, say what it would unlock (for example "Serials: warranty claims and manufacturer cases work") and who could supply it (anyone on a room walk, the asset register, the device management tool).
4. Order the list by what it unlocks for the work, not by count. Keep it to the ten most useful items.

## Checks

- You changed no file (`git status` shows nothing new).
- Every number in the list comes from a count you ran, not an estimate.

## Hand to the person

- The validator's failures, grouped, each with the fix a person could make.
- The ten items, each as: what is missing, how many records, what it unlocks, who could supply it.
- No score, percentage or "completeness" figure. Missing facts are normal; the list says what to do next.

## The prompt

```text
Read AGENTS.md and docs/setup-with-ai/review-missing.md, then follow it.
Do not change any file. Give me the grouped validator failures and the ten most useful missing items,
each with what it unlocks and who could supply it.
```
