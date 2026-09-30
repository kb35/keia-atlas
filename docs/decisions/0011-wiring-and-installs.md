# 0011. Wiring templates and installed devices

- Status: Accepted
- Date: 2026-09-27

## Context

Each space type option says what equipment a space holds and which power and data outlets it needs. To show wiring and lifecycle, Keia Atlas also needs to know how the equipment connects, port to port, and which physical units are installed where. Writing every cable by hand for 176 spaces would be thousands of lines and easy to get wrong.

## Decision

**Wiring templates.** Each build option carries its wiring once: a list of cables, each from one endpoint to another, with a cable type. An endpoint is a port on an equipment line (`video-bar.hdmi-out-1`, `hdbaset-rx#2.usb-b-1`), a numbered outlet (`outlet:data/behind-display#2`), the person's `laptop`, or the `home-router`. Optional kit uses `when` and `unless`, so the laptop picture runs through the scaler only when the whiteboard kit is fitted. Every space built to that option inherits the wiring.

The published guideline gives outlet assignments, not a port-by-port plan, so port-level wiring is Keia Atlas's engineering reading of it.

The validator checks every cable: the key exists, the port exists on that model, the cable type fits the connector, the outlet exists in the option, and no port or outlet is used twice, both with all optional kit fitted and with none.

**Installed devices.** Each space has an install file, following Keia's split between logical and physical identity:

- a **position** is the role (the video bar in Curlew): its model and hostname stay the same when hardware is replaced;
- a **unit** is one physical box, with a made-up serial (always `DEMO-`), an asset tag, a Keia lifecycle stage (plan, procure, deploy, manage, retire) and an install date.

During a replacement a position has two units: the outgoing one, marked legacy and in the retire stage, and the new one. The validator checks that each space's positions match its option (required kit, fitted optional kit, repeated desks and kits), that each position has one current unit, and that serials, asset tags and hostnames are unique.

## Consequences

- 370 cables across the templates and 1,164 installed units, all checked.
- Juneau is shown mid fit-out (stage deploy), and one HQ room shows a live video bar replacement.
- Personal assigned desks and reception security devices are not tracked by unit: the first are each person's own kit, and the second have no named models.

Source: [Keia: Operations Framework, logical and physical device identity](https://github.com/kb35/keia/blob/main/site/concepts/operations-framework.md).
