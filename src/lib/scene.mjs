// The items in a room, numbered in the order the room profile lists them. Shared by the drawing
// (src/lib/room3d.mjs, drawn to scale) and the Key beside it, so hovering one lights the other.
import { className, modelName, LOC_LABEL, href } from './data.mjs';

// Every physical item in the option, numbered in the order the room profile lists them.
export function roomItems(option, { fitted = null, space = null } = {}) {
  const fit = fitted ? new Set(fitted) : null;
  const eq = option.equipment.filter((e) => e.requirement === 'required' || !fit || fit.has(e.key));
  return eq.flatMap((e) => {
    const n = typeof e.quantity === 'number' ? e.quantity : 1;
    return Array.from({ length: Math.min(n, 12) }, (_, i) => {
      const key = n > 1 ? `${e.key}#${i + 1}` : e.key;
      const pos = space?.positions.find((p) => p.position === key || p.position.endsWith(`/${key}`));
      return { e, key, i, n, optional: e.requirement === 'optional', pos, loc: e.location ?? 'tbd' };
    });
  }).map((it, idx) => ({
    ...it, no: idx + 1,
    label: it.e.role?.split(':')[0] ?? className(it.e.class),
    kind: className(it.e.class),
    model: it.e.model ? modelName(it.e.model) : null,
    where: LOC_LABEL[it.loc] ?? it.loc,
    link: it.pos?.current ? href(`/device/?tag=${it.pos.current.asset_tag}`) : it.e.model ? href(`/models/${it.e.model}/`) : null,
    hidden: ['behind-display', 'below-table', 'data-closet'].includes(it.loc),
  }));
}
