# 0016. Studio becomes the default look

- Status: Accepted
- Date: 2026-09-28
- Supersedes parts of: [0013](0013-five-looks.md) (which looks exist and which is the default)

## Context

The project wanted a new default look, Studio: Linear in style and UniFi in spirit, where every device is a picture of the product with its ports on its panel. On review the owner asked for it to be warm rather than cool in both modes, a little analog, professional and clean with a clear hierarchy, and to follow the system's light or dark setting rather than default to dark. The other looks are Enterprise, High contrast and Drawing set, so Classic and Control room are no longer part of the set.

## Decision

- Studio is one more token file (`src/styles/looks/studio.css`) under `data-look="studio"`, as 0013 set out. Components are unchanged; Studio adds a few structural rules only it needs: a frosted masthead, a warm glow behind the page title and nowhere else, hairline borders with no shadows, a warm spotlight on a dot grid behind product drawings, and a faint paper grain.
- Warm neutrals in both modes: paper and stone in light, charcoal in dark. Small mono capitals for labels, like an instrument panel, give four clear steps: label, title, body, detail.
- Auto by default: the page follows the system's light or dark setting until the viewer picks Light or Dark with the mode button. Both modes are designed with equal care.
- One restrained accent, burnt orange (never red), used only for the current tab, the current section icon, focus and primary buttons. Selected controls use a raised neutral surface, so colour stays for status. Warnings use ochre yellow so they never read as the accent.
- Fonts are self-hosted from Fontsource (Inter and JetBrains Mono, both under the SIL Open Font License), so the default look never waits on a font service. Drawing set still fetches its fonts only when chosen; Enterprise uses the same bundled Inter.
- Classic and Control room are retired and removed from the project. A saved choice of either falls back to Studio. Saved choices move to new keys (`rs4-skin`, `rs4-theme`) so everyone starts on the new default once.
- Every Studio text colour passes WCAG AA (4.5:1) on every surface in both modes.
- Motion: no springs. Everything decelerates into its place on one curve (`--ease-settle`) and never overshoots, replacing the spring overshoot in 0015 and the earlier plan for one spring curve. Because a device body and every part on it move on the same curve and timing, a part that starts and ends inside the body stays inside it throughout; inner parts and ports are also clipped to the body or chassis as a safety net, so layers always read as layers.

## Consequences

- Four looks instead of five; one fewer font request on first load.
- Port panels are centred in a frame as wide as the class's widest model, so switching models grows or shrinks the panel from its centre.
- The device profile page is reorganised into Overview, Configuration and Troubleshoot tabs. The model switcher is a segmented control whose raised thumb glides to the chosen model on the same curve as the drawing morph, and the page announces the new model to screen readers.
- Classic and Control room can come back from the project's git history.

Sources: [Fontsource: variable fonts](https://fontsource.org/docs/getting-started/variable), [MDN: backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/backdrop-filter), [WCAG 2.2, contrast (minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
