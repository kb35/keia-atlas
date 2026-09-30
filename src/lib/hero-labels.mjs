// Words over the hero's 3D scene (FRONT-DOOR-V2 section 3): each level's answer, placed where the thing is.
// Building: the office and one line of counts. Floor: every space's number, name and kind, the core, who is on
// site. Space: the room's devices and its booking. The labels are HTML (so they use the page's type and tokens),
// positioned each frame from the scene's projection with a transform only; they fade in (opacity) when their
// level arrives and fade out when it leaves. Nothing pulses or loops. Labels that would overlap give way to the
// more important one (the fault first, then larger rooms), so small spaces are named on hover or at a closer zoom.
// No label ever covers a glyph the scene marks as kept clear (the fault ring), and a level may cap how many labels
// it shows beside the fault (the space: the fault and three more), so the room stays calm.
//
//   createLabels(host, { reduced, caps })  -> { add, level, place, dispose }
//   caps           { [level]: n }: at most n labels besides the fault's at that level (a spec with free: true, a
//                  quiet word such as "Stairs", is not counted)
//   add(spec)      spec: { id, level (0..2 or [..]), floor, cls, text, sub, ring ('fine' | 'fault' | null), at() -> Vector3,
//                         priority, dy (px above the anchor), avatar (initials), side ('right': beside the anchor,
//                         dx px to its right and centred on it, so a label never sits over what it names) }
//   level(i)       the level shown now: its labels come on, the rest go off (the fade is CSS, opacity only)
//   place(project, lifted, size, clear)  every frame: project(worldVector) -> [x, y] | null; lifted: how far the other
//                  floor is away (0..1); clear: screen boxes { x0, y0, x1, y1 } no label may cover
export function createLabels(host, { reduced = false, caps = {} } = {}) {
  const labels = [];
  let level = -1;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function add(spec) {
    const d = el('div', `hz-lab ${spec.cls ?? ''}`);
    if (spec.ring) { d.dataset.ring = spec.ring; }
    if (spec.avatar) d.appendChild(el('i', 'hz-lab-av', spec.avatar));
    if (spec.text) d.appendChild(el('b', null, spec.text));
    if (spec.sub) d.appendChild(el('span', null, spec.sub));
    if (spec.title) d.title = spec.title;
    d.style.opacity = '0';
    host.appendChild(d);
    const L = { ...spec, el: d, w: 0, h: 0, on: false, shown: false, levels: new Set([].concat(spec.level)), x: 0, y: 0 };
    labels.push(L);
    return L;
  }
  // Sizes are measured once the fonts are in (and again if they arrive later).
  const measure = () => { for (const L of labels) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; } };
  document.fonts?.ready?.then(() => measure());

  function setLevel(i) {
    if (i === level) return;
    level = i;
    for (const L of labels) L.on = L.levels.has(i);
  }
  const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  // Place every label that is on; hide the ones off screen or under a more important one.
  function place(project, lifted = 0, size = null, clear = []) {
    if (!labels.length) return;
    if (labels.some((L) => L.on && !L.w)) measure();
    const W = size?.[0] ?? host.clientWidth, H = size?.[1] ?? host.clientHeight;
    const live = [];
    for (const L of labels) {
      let show = L.on;
      if (show && L.lifts) show = lifted < 0.5;   // on the floor that lifts away: gone once it has gone
      const p = show ? project(L.at()) : null;
      if (!p || p[0] < -20 || p[1] < -20 || p[0] > W + 20 || p[1] > H + 20) show = false;
      if (show) { L.ax = p[0]; L.ay = p[1]; L.x = Math.round(p[0] + (L.side ? L.dx ?? 12 : 0)); L.y = Math.round(p[1] - (L.side ? 0 : L.dy ?? 10)); live.push(L); }
      L.want = show;
    }
    live.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    const taken = clear.map((c) => ({ ...c, glyph: true })), cap = caps[level] ?? Infinity;
    let others = 0;
    for (const L of live) {
      // A label on screen holds its place against a small overlap (4 px), and one off screen needs 4 px of air to
      // come back, so a moving camera never makes two labels trade places frame by frame.
      const m = L.shown ? -1 : 7, r = L.side ? { x0: L.x - m, x1: L.x + L.w + m, y0: L.y - L.h / 2 - m, y1: L.y + L.h / 2 + m }
        : { x0: L.x - L.w / 2 - m, x1: L.x + L.w / 2 + m, y0: L.y - L.h - m, y1: L.y + m };
      const fault = L.ring === 'fault', counted = !fault && !L.free;
      // A label never tests against its own glyph (the ring it names sits just under it).
      const own = (t) => t.glyph && Math.abs((t.x0 + t.x1) / 2 - L.ax) < 2 && Math.abs((t.y0 + t.y1) / 2 - L.ay) < 2;
      if ((counted && others >= cap) || taken.some((t) => (!fault || !t.glyph) && !own(t) && overlap(t, r))) { L.want = false; continue; }
      if (counted) others++;
      taken.push(r);
    }
    for (const L of labels) {
      // Whole pixels, and the centring done here (not by a percentage transform) so the text never lands on a half pixel.
      if (L.want) L.el.style.transform = L.side ? `translate3d(${L.x}px, ${Math.round(L.y - L.h / 2)}px, 0)` : `translate3d(${Math.round(L.x - L.w / 2)}px, ${L.y - L.h}px, 0)`;
      if (L.want !== L.shown) { L.shown = L.want; L.el.style.opacity = L.want ? '1' : '0'; L.el.classList.toggle('is-on', L.want); }
    }
  }
  return {
    add, level: setLevel, place, measure,
    current: () => level,
    dispose() { for (const L of labels) L.el.remove(); labels.length = 0; },
  };
}
