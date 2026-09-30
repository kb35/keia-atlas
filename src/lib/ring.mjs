// The health ring (design notes): one family of shapes, so state is read from the shape first and colour only
// reinforces it. The shared HealthGlyph part (src/lib/health.mjs) draws every glyph on a 16-unit box; these parts
// draw the same shapes at any centre and radius, for rings inside another drawing (the front door's hero plan, in
// metres). The shapes and words match HealthGlyph, so a person sees one family.
//
//   ringParts(state, cx, cy, r, stroke)  the SVG elements for one ring, as [{ tag, attrs }]
//   RING_WORD                            the word shown beside each state
//
// Angles run clockwise from 12 o'clock.

export const RING_STATES = ['fine', 'review', 'fault', 'silent', 'progress', 'planned', 'off'];
export const RING_WORD = {
  fine: 'Fine', review: 'To review', fault: 'Fault', silent: 'Not reporting',
  progress: 'In progress', planned: 'Planned', off: 'Off',
};

const r3 = (v) => Math.round(v * 1000) / 1000;
const at = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [r3(cx + r * Math.sin(a)), r3(cy - r * Math.cos(a))];
};
function arc(cx, cy, r, from, to) {
  const [x0, y0] = at(cx, cy, r, from), [x1, y1] = at(cx, cy, r, to);
  const large = ((to - from + 360) % 360) > 180 ? 1 : 0;
  return `M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export function ringParts(state, cx = 8, cy = 8, r = 6, stroke = 2) {
  const line = { fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round' };
  switch (state) {
    case 'review': return [{ tag: 'path', attrs: { ...line, d: arc(cx, cy, r, 60, 359.99) } }];
    case 'fault': return [
      { tag: 'path', attrs: { ...line, d: arc(cx, cy, r, 30, 150) } },
      { tag: 'path', attrs: { ...line, d: arc(cx, cy, r, 210, 330) } },
      { tag: 'circle', attrs: { cx, cy, r: r3(r * 0.25), fill: 'currentColor', stroke: 'none' } },
    ];
    case 'silent': {
      const c = 2 * Math.PI * r, dash = r3(c / 16);
      return [{ tag: 'circle', attrs: { ...line, cx, cy, r, 'stroke-linecap': 'butt', 'stroke-dasharray': `${dash} ${dash}` } }];
    }
    case 'progress': return [{ tag: 'path', attrs: { ...line, d: arc(cx, cy, r, 90, 359.99) } }];
    case 'planned': return [{ tag: 'circle', attrs: { ...line, cx, cy, r, 'stroke-width': r3(stroke / 2) } }];
    case 'off': {
      const [x0, y0] = at(cx, cy, r, 300), [x1, y1] = at(cx, cy, r, 120);
      return [
        { tag: 'circle', attrs: { ...line, cx, cy, r, 'stroke-width': r3(stroke / 2) } },
        { tag: 'line', attrs: { ...line, x1: x0, y1: y0, x2: x1, y2: y1, 'stroke-width': r3(stroke / 2) } },
      ];
    }
    default: return [{ tag: 'circle', attrs: { ...line, cx, cy, r } }];
  }
}

// The same elements as one SVG string (for places that build markup in a loop).
export function ringSvg(state, cx, cy, r, stroke) {
  return ringParts(state, cx, cy, r, stroke).map(({ tag, attrs }) =>
    `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
}
