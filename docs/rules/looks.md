# Looks and tokens

### T1. Components use tokens only

Colours, fonts, radii, borders, shadows and sizes are CSS custom properties. A look is one file in `src/styles/looks/` setting the same tokens.

- **Why:** a new page gets every look for free; a new look is one file.
- **Do:** `background: var(--surface)`.
- **Don't:** a hex colour in a component (art tokens aside).

### T2. Five looks, light and dark

Studio (default: warm, one burnt-orange accent), Enterprise (dense, slate and deep blue with one accent, set in Inter), High contrast, Drawing set (ink on drafting paper) and Playful (ink outlines, hard shadows). A head script sets `data-look` before first paint. Auto mode follows the system; the mode button flips it; each look sets dark tokens under both `prefers-color-scheme: dark` and `[data-theme="dark"]`.

- **Why:** the design is a system, and eyes and screens differ.
- **Do:** check new pages in every look, light and dark.
- **Don't:** design for Studio in light only.

### T3. Contrast

Text passes WCAG AA (4.5 to 1) on its surfaces in every look and mode; large text and controls 3 to 1. Status is never colour alone.

- **Why:** [WCAG 2.2, contrast (minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- **Do:** use `--text-2` and `--text-3` for quieter text.
- **Don't:** lower text opacity to make it quieter.

### T4. Colour has jobs

The accent marks where you are, focus and the main action. Green is healthy, amber needs attention, red is a fault, blue in progress, violet planning, grey off or unknown. Cables and ports use signal colours.

- **Why:** when a colour means one thing, people read it without thinking.
- **Do:** pair each status colour with its word.
- **Don't:** use the accent for status, or red for decoration.

## No accent bars on rounded boxes
A coloured stripe down one edge of a box with rounded corners curves around the corners and looks off. Don't use `border-left` or an `inset` left shadow as an accent on anything rounded. Show state with a thin tinted outline (`box-shadow: inset 0 0 0 1px color-mix(in srgb, <colour> 55%, transparent)`), a soft tinted background, or a small dot or icon. Straight table rows may keep a straight edge.
