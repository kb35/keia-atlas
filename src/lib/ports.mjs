// Port panel layout for device profiles, after the prototype's portPanel: one row per face,
// each port a keyed group positioned with a transform, so switching models moves matching
// ports (same id) instead of redrawing them.
import { models, portColour, CONNECTOR_LABEL } from './data.mjs';

const SHAPES = {
  hdmi: { w: 42, svg: '<path class="body" d="M0 0h42v10l-5 6H5l-5-6z"/><rect class="hole" x="7" y="4" width="28" height="4" rx="1"/>' },
  displayport: { w: 40, svg: '<path class="body" d="M0 0h40v16H6l-6-6z"/><rect class="hole" x="8" y="5" width="26" height="4" rx="1"/>' },
  vga: { w: 44, svg: '<path class="body" d="M0 0h44l-4 16H4z"/><rect class="hole" x="10" y="5" width="24" height="5" rx="1"/>' },
  'usb-c': { w: 30, svg: '<rect class="body" x="0" y="2" width="30" height="12" rx="6"/><rect class="hole" x="7" y="6.5" width="16" height="3" rx="1.5"/>' },
  'usb-a': { w: 30, svg: '<rect class="body" x="0" y="1" width="30" height="14" rx="1.5"/><rect class="hole" x="4" y="4" width="22" height="4"/>' },
  'usb-b': { w: 24, svg: '<path class="body" d="M4 0h16l4 4v14H0V4z"/><rect class="hole" x="6" y="6" width="12" height="7"/>' },
  'micro-usb': { w: 22, svg: '<path class="body" d="M2 2h18l-3 9H5z"/>' },
  rj45: { w: 30, svg: '<rect class="body" x="0" y="0" width="30" height="24" rx="2"/><path class="hole" d="M5 5h20v10h-5v4h-10v-4h-5z"/>' },
  rj11: { w: 24, svg: '<rect class="body" x="0" y="2" width="24" height="20" rx="2"/><path class="hole" d="M5 6h14v8h-4v3h-6v-3H5z"/>' },
  sfp: { w: 40, svg: '<rect class="body" x="0" y="3" width="40" height="16" rx="1.5"/><rect class="hole" x="5" y="8" width="30" height="6"/>' },
  'sfp-plus': { w: 40, svg: '<rect class="body" x="0" y="3" width="40" height="16" rx="1.5"/><rect class="hole" x="5" y="8" width="30" height="6"/>' },
  sfp28: { w: 40, svg: '<rect class="body" x="0" y="3" width="40" height="16" rx="1.5"/><rect class="hole" x="5" y="8" width="30" height="6"/>' },
  'dc-barrel': { w: 26, svg: '<circle class="body" cx="13" cy="12" r="11"/><circle class="hole" cx="13" cy="12" r="4"/>' },
  'iec-c14': { w: 34, svg: '<path class="body" d="M0 0h34v16l-6 8H6l-6-8z"/><rect class="hole" x="8" y="7" width="3" height="8"/><rect class="hole" x="23" y="7" width="3" height="8"/>' },
  '3.5mm': { w: 20, svg: '<circle class="body" cx="10" cy="12" r="8"/><circle class="hole" cx="10" cy="12" r="3"/>' },
  '6.35mm': { w: 24, svg: '<circle class="body" cx="12" cy="12" r="10"/><circle class="hole" cx="12" cy="12" r="4"/>' },
  xlr: { w: 28, svg: '<circle class="body" cx="14" cy="12" r="12"/><circle class="hole" cx="9" cy="10" r="1.5"/><circle class="hole" cx="19" cy="10" r="1.5"/><circle class="hole" cx="14" cy="16" r="1.5"/>' },
  'terminal-block': { w: 36, svg: '<rect class="body" x="0" y="4" width="36" height="14" rx="1.5"/><circle class="hole" cx="9" cy="11" r="2.5"/><circle class="hole" cx="18" cy="11" r="2.5"/><circle class="hole" cx="27" cy="11" r="2.5"/>' },
  db9: { w: 38, svg: '<path class="body" d="M0 2h38l-4 14H4z"/><rect class="hole" x="9" y="6" width="20" height="4" rx="1"/>' },
};
const OTHER = { w: 24, svg: '<rect class="body" x="0" y="4" width="24" height="14" rx="3"/>' };
export const FACES = ['front', 'rear', 'bottom'];
export const FACE_LABEL = { front: 'Front', rear: 'Rear', bottom: 'Underside', none: 'Position not stated' };
const ROW_H = 86;

export function layoutPorts(modelId, faces) {
  const ports = models[modelId]?.ports ?? [];
  const rows = [];
  let y = 22;
  for (const f of faces) {
    const list = ports.filter((p) => (p.face ?? 'none') === f).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    let x = 22;
    const items = list.map((p) => {
      const sh = SHAPES[p.connector] ?? OTHER;
      const lw = p.id.length * 6.2 + 8, slot = Math.max(sh.w, lw);
      const it = { p, x: x + (slot - sh.w) / 2, cx: x + slot / 2, y: y + 12, sh, colour: portColour(p), name: CONNECTOR_LABEL[p.connector] ?? p.connector };
      x += slot + 12;
      return it;
    });
    rows.push({ face: f, y, w: list.length ? x + 10 : 0, items });
    y += ROW_H;
  }
  return { rows, h: y - 4, w: Math.max(200, ...rows.map((r) => r.w)) };
}
// Faces any model of a class uses, so every model of the class draws the same rows.
export function classFaces(ids) {
  const used = new Set(ids.flatMap((id) => (models[id]?.ports ?? []).map((p) => p.face ?? 'none')));
  return [...FACES, 'none'].filter((f) => used.has(f));
}
