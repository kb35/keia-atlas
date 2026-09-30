# The Keia Atlas mark

![Keia Atlas](../public/brand/keia-atlas-lockup.svg)

## What it means

The mark is one slab, seen from above at an angle, with a ring on its corner.

- **The slab is any scale.** It can be a floor, an office, a room or a single device, so it stands for the whole system: every place and everything in it, in one record.
- **The closed ring means healthy.** It is the same idea as the health marks in the product: when everything is as it should be, the ring is whole.
- **The turning means in motion.** Workplace technology is never finished; the mark turns when the product is moving you somewhere, and rests when it is not.

## Files

| File | Use |
| --- | --- |
| [keia-mark.svg](../public/brand/keia-mark.svg) | The mark on its own, 48 × 48. Follows light and dark mode. |
| [keia-atlas-lockup.svg](../public/brand/keia-atlas-lockup.svg) | The mark with "Keia Atlas". |
| [keia-lockup.svg](../public/brand/keia-lockup.svg) | The mark with "Keia". |
| [keia-tile.svg](../public/brand/keia-tile.svg) | The app tile: a bone slab on a tobacco tile. |
| [keia-favicon.svg](../public/brand/keia-favicon.svg) | The favicon, cut for a 16 px grid. |
| [keia-mark-animated.svg](../public/brand/keia-mark-animated.svg) | The arrival motion, as a standalone SVG. |
| [keia-mark-loading.svg](../public/brand/keia-mark-loading.svg) | The loading turntable, as a standalone SVG. |

In the product the mark is drawn by `src/components/BrandMark.astro` and moved by `src/lib/brand-mark.mjs`, from the shape and timing in `src/lib/brand-geom.mjs`.

## Colours

| | Slab (top) | Side | Ring |
| --- | --- | --- | --- |
| Light | Tobacco `#624634` | `#4F392A` | Bone `#EFE7D8` |
| Dark | `#C6AC8D` | `#B6A186` | cut out: the background shows through |

Inside the product the mark follows the look:

- **Studio, Playful and Drawing set:** tobacco and bone, as above.
- **Enterprise:** espresso `#30251F` with a cream `#F1ECE4` ring on light surfaces; a cream slab with the ring cut out on its dark navy.
- **High contrast:** black and white.

Each look sets `--brand-slab`, `--brand-side`, `--brand-ring` and `--brand-cut` for light and dark.

## Clear space and size

- Keep clear space around the mark of at least a quarter of its width on every side. Nothing else sits inside it.
- The smallest size is 16 px, using the favicon. At 24 px and under, use the small cut (a thicker slab and ring), which the product picks for you.
- Do not recolour it outside the palettes above, add effects, outline it, or set it at another angle when it is at rest.

## Motion

The mark moves only when something is happening, and never loops unless something is loading.

| State | What it does |
| --- | --- |
| Arrival | Once per page: it turns 135° from rest, settles into its resting angle, then the ring draws closed. 1.25 s. |
| Leaving | When you go to another page: a 70° turn that gathers speed as it fades. 0.4 s. |
| Loading | Only if a page takes longer than about 300 ms: the ring lifts and the slab eases into a slow, steady turn. When the page lands it slows to rest (never a hard stop) and the ring closes. |
| Hover | A small 20° turn, and it settles back. |
| Idle | Still. |

With reduced motion set on the device, Motion off, or Keep things still in Settings, the mark is always still.
