# 0008. Device models from vendor documents, read twice

- Status: Accepted
- Date: 2026-09-27

## Context

Step 3 needs the physical facts of 27 device models: size, weight, power, and every port with its connector, signals, direction and side. These come from vendor datasheets and manuals, which are long, sometimes contradict themselves, and are easy to misread. A wrong port count or PoE class would break every wiring diagram built on it.

## Decision

- **Schema first.** `schemas/ext/device-model.schema.yaml` fixes the vocabulary: connector types, signals, directions, faces, PoE standards, and naming rules for port ids. Conventions (HDMI lists video and audio; an HDBaseT port's direction is the way the picture flows) are written into the schema descriptions.
- **Two independent readings.** Two separate AI readers extracted every model from the vendor documents, each value with a citation, without seeing each other's work. A script compared the readings field by field. Every disagreement was settled against the quoted source text, preferring the document that labels its axes or units explicitly, and raw document text over summaries.
- **Gaps, not guesses.** Anything no source states is left out and listed under `gaps`. A port's `face` is optional for this reason, and `not-stated` is a valid connector.
- **Every model cites its sources**, which are Keia source entries in `data/sources/`. Where a vendor site blocked downloads, a third-party copy of the vendor's own document is used and marked as such.

## Consequences

- Five models (Netgear, Cisco, Dell, INOGENI, Sound Control Technologies) had only one reading, because a usage limit stopped the second; each was spot-checked against its primary source instead. One spot check (Cisco) caught a web summary that had dropped two ports; the raw datasheet confirmed the full count.
- Conflicts inside vendor documents are kept visible in each model's `notes` rather than hidden.
- Port positions for drawing are not here; they belong to device looks, a later step.

Sources: [Barchard and Pace, Double entry is superior to visual checking](https://barchard.faculty.unlv.edu/doubleentry/Better%20Data%20Entry%20APA%202008.pdf).
