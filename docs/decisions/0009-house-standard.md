# 0009. Two standards: industry guidance and a house standard

- Status: Accepted
- Date: 2026-09-27

## Context

Most of Keia Atlas's space types are based on public industry guidance (decision 0006). Some things the project needs aren't in that guidance: remote workers' home setups, and a Mac option for desks, whose monitors are all Dell in the desk options. The choices for those are Keia Atlas's own, and a reader must never mistake one for the other.

Keia's Operations Framework treats technology standards as something each team sets for itself, so a second standard fits the framework rather than working around it.

## Decision

- Every space type says which standard it comes from: `industry` (it names its main public guidance) or `house`.
- A house option inside an industry space type (the Mac desk) is marked `standard: house` on the option.
- Offices follow the industry space types. Office networks stay out of scope: they belong to the network team.
- House choices, and why:
  - **Mac desk:** Apple Studio Display (2026) for Mac laptops, plus a StarTech US1GC30B USB-C Ethernet adapter, because the display has no network port and the desk's patched data outlet should still be used.
  - **Remote and home:** either a Dell P2726DEB (camera, dock, network and charging in the monitor), or a Studio Display on a CalDigit TS5 Thunderbolt 5 dock for Mac users. Each home gets a UniFi Express 7, a gateway and Wi-Fi 7 access point in one, managed centrally. No DisplayLink docks, which need extra drivers.
- **Laptop systems are claimed only as vendors state them.** Each build option lists the laptop systems it serves (`clients`), each laptop-facing device model lists what its vendor states (`client_os`), and the validator fails if an option claims a system one of its devices doesn't list.

## Consequences

- Readers can tell published guidance from Keia Atlas's own judgement at a glance.
- No desk or home option is currently vendor-stated for Linux: Dell lists Windows and macOS (or nothing), CalDigit lists macOS and Windows, and Apple lists Mac and iPad. The gap is shown, not papered over. Finding Linux-certified kit is open work.
- House choices can change without touching anything taken from the industry guidance.

Sources: [Keia: Operations Framework](https://github.com/kb35/keia/blob/main/site/concepts/operations-framework.md), [Apple Studio Display (2026) tech specs](https://support.apple.com/en-us/126324), [CalDigit TS5](https://www.caldigit.com/thunderbolt-5-dock-ts5/), [UniFi Express 7 tech specs](https://techspecs.ui.com/unifi/wifi/ux7).
