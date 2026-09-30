# Looks and tokens

### T1. Components use tokens only

Colours, fonts, radii, borders, shadows and sizes are CSS custom properties. A look is one file in `src/styles/looks/` setting the same tokens.

- **Why:** a new page gets every look for free; a new look is one file.
- **Do:** `background: var(--surface)`.
- **Don't:** a hex colour in a component (art tokens aside).

### T2. Five looks, light and dark

Studio (default: warm and calm, one burnt-orange accent), Enterprise (crisp and dense: a deep navy frame, one clear brighter blue accent, no red or burgundy, set in Inter), High contrast (maximum clarity), Drawing set (blueprint: blue ink lines on drafting film; a blueprint in dark) and Playful (brighter, ink outlines, hard shadows). A head script sets `data-look` before first paint. Auto mode follows the system; the mode button flips it; each look sets dark tokens under both `prefers-color-scheme: dark` and `[data-theme="dark"]`.

Each look also has its own motion personality, set by the motion tokens in `src/styles/motion.css` (docs/rules/motion.md, M1): Studio calm, Enterprise shorter and tighter, Playful a little livelier (never bouncing), High contrast minimal motion, Drawing set lines that draw on. Changing the look cross-fades the page and changes both its colour and its tempo.

- **Why:** the design is a system, and eyes and screens differ.
- **Do:** check new pages in every look, light and dark.
- **Don't:** design for Studio in light only.

### T3. Contrast

Text passes WCAG AA (4.5 to 1) on its surfaces in every look and mode; large text and controls 3 to 1. Status is never colour alone.

`node tools/contrast-check.mjs` checks the health palette in every look, light and dark. It runs in `npm run build` and `npm test`.

- **Why:** [WCAG 2.2, contrast (minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- **Do:** use `--text-2` and `--text-3` for quieter text.
- **Don't:** lower text opacity to make it quieter.

### T4. Colour has jobs

Health has six states, each with one shape from the HealthGlyph set and a word beside it: Fine, To review, Fault, Not reporting (the fault colour, dashed), In progress, Planned, Off. Shape carries the state; colour backs it up.

Each state has three tokens in every look and mode:

- `--h-<state>`: the fill, for glyphs and chart marks. At least 3 to 1 on `--bg` and `--surface`.
- `--h-<state>-ink`: the words. At least 4.5 to 1 on `--bg`, `--surface` and its own soft.
- `--h-<state>-soft`: a light tint for backgrounds.

The states are `fine`, `review`, `fault`, `progress`, `planned` and `off`.

Fine is calm, not grey. A Fine glyph always has its own soft green-teal (`--h-fine`), on overviews too, so a healthy estate reads as healthy rather than off or unknown. The dark cockpit keeps overviews still, not colourless: To review, Fault and Not reporting stand out by a stronger colour, their shape and their word. Red at more than glyph size is only for a P1 or major incident, a safety matter or a live event at risk, and it leaves when that is over.

Useful colour beyond health: each service and each lens has its own colour (`--svc-av`, `--svc-network`, `--svc-infrastructure`; `--lens-health`, `--lens-support`, `--lens-network`, `--lens-projects`, `--lens-vendors`, `--lens-knowledge`, in `src/styles/craft.css`), for charts, a section's accent and small highlights. They are chosen away from the health hues, are at least 3 to 1 in every look and mode, and never mean health.

The accent marks where you are, focus and the one action. It never means health. Cables and ports use signal colours, never health colours.

The old families (`--green`, `--amber`, `--red`, `--blue`, `--violet`, `--grey`) are now aliases of the health tokens. They are retiring from components: use `--h-*` in new work.

- **Why:** when a colour means one thing, people read it without thinking.
- **Do:** pair each glyph with its word, and use the ink token for any text.
- **Don't:** use the accent for health, a fill token for text, or red for decoration.

## No accent bars on rounded boxes
A coloured stripe down one edge of a box with rounded corners curves around the corners and looks off. Don't use `border-left` or an `inset` left shadow as an accent on anything rounded. Show state with a thin tinted outline (`box-shadow: inset 0 0 0 1px color-mix(in srgb, <colour> 55%, transparent)`), a soft tinted background, or a small dot or icon. Straight table rows may keep a straight edge.
