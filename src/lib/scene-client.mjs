/* The room drawing's behaviour (src/components/RoomScene.astro): focus, the layers, and the morph from one room
   to the next. One module for every drawing on a page, loaded once; everything is delegated from the document,
   so drawings that arrive later (the client router, the unit page's borrowed drawing) work too.

   Two states only (docs/rules/motion.md rows 55 to 58). The full view, or focus on one thing: a device, a plate
   or a cable. What is in focus (the chosen thing, what it plugs into, its ports and its cables) is marked .hit,
   the chosen thing itself .sel; the drawing's root carries .focus, and CSS turns everything else into a quiet
   silhouette. A focus comes from, in order: a pointer resting on a marker, a cable or a Key row (a preview, mouse
   and pen only, so a tap never leaves a hover behind); a choice (a click or tap, kept until "Show everything", a
   click on empty space or Escape); the page's own highlight (data-pin: the incident's device, in the fault colour).

   The morph (row 60): the same thing in two drawings carries the same data-mk. Walls, floor, rulers and leaders
   tween their geometry to the new room's; furniture, devices and plates slide and resize from where they were
   (FLIP on their SVG transform); markers slide; what only the old room had fades out where it was, what only the
   new one has fades in; the dimension figures tick to their new values. Inside a page (build-option tabs) the
   DetailTabs component calls it through window.rsMorphers; between pages (the size picker on a space type) the
   drawing's frame becomes its own view-transition layer and the same morph plays inside it. Reduced motion
   (window.rsReducedNow): every change lands at once. */

const D = document, W = window, SVGNS = 'http://www.w3.org/2000/svg';
const esc = (s) => (W.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'));
const reduced = () => (W.rsReducedNow ? W.rsReducedNow() : matchMedia('(prefers-reduced-motion: reduce)').matches);
// Durations and curves from the motion tokens (M1); the Shell's rsMotion when there is one (the guide has none).
const motion = () => {
  if (W.rsMotion) return W.rsMotion();
  const cs = getComputedStyle(D.documentElement);
  const ms = (n, d) => { const v = cs.getPropertyValue(n).trim(), x = parseFloat(v); return isNaN(x) ? d : /ms$/.test(v) ? x : /s$/.test(v) ? x * 1000 : x; };
  return { reduced: reduced(), ease: cs.getPropertyValue('--ease-settle').trim() || 'cubic-bezier(.22,1,.36,1)', exitEase: cs.getPropertyValue('--ease-exit').trim() || 'cubic-bezier(.4,0,1,1)',
    morph: ms('--dur-morph', 520), enter: ms('--dur-enter', 440), exit: ms('--dur-exit', 240), state: ms('--dur-state', 300), hover: ms('--dur-hover', 140), delay: ms('--delay-enter', 24) };
};

/* ---------- Finding things ---------- */
const rootOf = (el) => {
  if (!el || !el.closest) return null;
  const r = el.closest('[data-scene-root]'); if (r) return r;
  const k = el.closest('[data-key-for]');
  const uid = (el.closest('[data-scene-uid]') || {}).dataset?.sceneUid || (k && k.dataset.keyFor);
  return uid ? D.querySelector(`[data-scene-root][data-uid="${esc(uid)}"]`) : null;
};
const keyOf = (root) => (root ? D.querySelector(`[data-key-for="${esc(root.dataset.uid)}"]`) : null);
// What a pointer, tap or row stands for: { sks } for a device or plate, { cab } for a cable. Bodies count for a
// click or tap only (body: true), so moving the mouse across the drawing never flips the whole room.
function specOf(el, body) {
  if (!el || !el.closest) return null;
  const root = rootOf(el); if (!root) return null;
  const row = el.closest('.rk-cab[data-cab]');
  if (row) return root.querySelector(`[data-cab="${esc(row.dataset.cab)}"]`) ? { root, cab: row.dataset.cab } : null;
  const c = el.closest('.cab[data-cab], .feed[data-cab]');
  if (c && c.closest('[data-scene-root]')) return { root, cab: c.dataset.cab };
  const t = el.closest(body ? '.no[data-sk], .rk-row[data-sk], .it[data-sk], .pl[data-sk], .ghost-ol[data-sk], .lead[data-sk]' : '.no[data-sk], .rk-row[data-sk]');
  return t ? { root, sks: [t.dataset.sk] } : null;
};
const same = (a, b) => !!a && !!b && (a.cab || '') === (b.cab || '') && (a.sks || []).join(' ') === (b.sks || []).join(' ');

/* ---------- State ---------- */
const st = (root) => root.__sc || (root.__sc = { sel: null, prev: null, pinOff: false, pin: root.dataset.pin ? { sks: root.dataset.pin.split(' ') } : null });
const current = (s) => s.sel || (s.pin && !s.pinOff ? s.pin : null);

// Mark what the focus lights (.hit) and what was chosen (.sel), in the drawing and its Key, and set the root's
// state. Classes change in one go, so CSS eases every element from its old state to its new one together: the
// focus moves from one route to the next rather than going out and coming back.
function apply(root) {
  if (!root) return;
  const s = st(root), f = s.prev || current(s), k = keyOf(root);
  const hit = new Set(), sel = new Set();
  let hid = false;
  if (f) {
    const cab = f.cab ? root.querySelector(`.cab[data-cab="${esc(f.cab)}"], .feed[data-cab="${esc(f.cab)}"]`) : null;
    const chosen = cab ? (cab.dataset.a ? [cab.dataset.a, cab.dataset.b] : [cab.dataset.for]) : f.sks || [];
    const all = chosen.slice();
    // A device lights the plate it plugs into; a plate the devices plugged into it.
    if (!cab) chosen.forEach((sk) => {
      const src = root.querySelector(`[data-sk="${esc(sk)}"][data-rel]`) || (k && k.querySelector(`[data-sk="${esc(sk)}"][data-rel]`));
      if (src) src.dataset.rel.split(' ').forEach((r) => { if (r && !all.includes(r)) all.push(r); });
    });
    all.forEach((sk) => {
      const e = esc(sk), mine = !cab && chosen.includes(sk);
      root.querySelectorAll(`[data-sk="${e}"]`).forEach((h) => { hit.add(h); if (mine) sel.add(h); if (h.classList.contains('hid') && mine) hid = true; });
      root.querySelectorAll(`.pt[data-dev="${e}"]`).forEach((p) => hit.add(p));
      if (k) k.querySelectorAll(`[data-sk="${e}"], .pt[data-dev="${e}"]`).forEach((x) => { hit.add(x); if (mine) sel.add(x); });
    });
    const runs = (c) => (c.dataset.runs || '').split(' ').forEach((id) => { if (id) root.querySelectorAll(`.tk[data-run="${esc(id)}"]`).forEach((t) => hit.add(t)); });
    if (cab) {
      // A cable: its whole route (the containment it runs in), both ends, and its row in the Key.
      hit.add(cab); sel.add(cab); runs(cab);
      if (k) k.querySelectorAll(`.rk-cab[data-cab="${esc(f.cab)}"]`).forEach((x) => { hit.add(x); sel.add(x); });
    } else chosen.forEach((sk) => {
      const e = esc(sk);
      root.querySelectorAll(`.cab[data-a="${e}"], .cab[data-b="${e}"], .feed[data-for="${e}"]`).forEach((c) => { hit.add(c); runs(c); });
    });
  }
  const was = [...root.querySelectorAll('.hit, .sel'), ...(k ? k.querySelectorAll('.hit, .sel') : [])];
  was.forEach((el) => { if (!hit.has(el)) el.classList.remove('hit'); if (!sel.has(el)) el.classList.remove('sel'); });
  hit.forEach((el) => el.classList.add('hit'));
  sel.forEach((el) => el.classList.add('sel'));
  const on = !!f && hit.size > 0;
  root.classList.toggle('focus', on);
  root.classList.toggle('sticky', !!current(s));
  root.classList.toggle('pin-on', on && !s.prev && !s.sel && f === s.pin);
  root.classList.toggle('focus-hid', on && hid);
}

// Choose something (a click, a tap, Enter on a Key row). Choosing what is already chosen goes back to the whole room.
function choose(spec) {
  const root = spec.root, s = st(root), f = { sks: spec.sks, cab: spec.cab };
  s.prev = null;
  if (same(current(s), f)) { showAll(root); return; }
  if (s.pin && same(s.pin, f)) { s.sel = null; s.pinOff = false; } else s.sel = f;
  apply(root);
}
function showAll(root) {
  if (!root) return;
  const s = st(root); s.sel = null; s.prev = null; if (s.pin) s.pinOff = true;
  apply(root);
}

/* ---------- The layers: See behind and Cables, on or off ---------- */
function setLayer(root, name, on) {
  const chip = root.querySelector(`.lchip[data-layer="${name}"]`);
  if (chip) chip.setAttribute('aria-pressed', String(on));
  root.classList.toggle(`show-${name}`, on);
  if (on && current(st(root))) showAll(root);   // turning a layer on shows it: the whole room, not the focus
  // Showing the cables opens their list in the Key too.
  const list = on && name === 'cables' && keyOf(root)?.querySelector('details.rk-cables');
  if (list) list.open = true;
}

/* ---------- Pointer, touch and keyboard ---------- */
let hoverT = 0, leaveT = 0, hovering = null;
const preview = (spec) => {
  clearTimeout(leaveT); clearTimeout(hoverT);
  if (same(hovering, spec)) return;
  const go = () => {
    if (hovering && hovering.root !== spec.root) { st(hovering.root).prev = null; apply(hovering.root); }
    hovering = spec; st(spec.root).prev = { sks: spec.sks, cab: spec.cab }; apply(spec.root);
  };
  hoverT = setTimeout(go, reduced() ? 0 : motion().hover);
};
const unpreview = (now) => {
  clearTimeout(hoverT); clearTimeout(leaveT);
  const end = () => { if (!hovering) return; const r = hovering.root; hovering = null; st(r).prev = null; apply(r); };
  if (now) end(); else leaveT = setTimeout(end, reduced() ? 0 : motion().hover);
};
D.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  const spec = specOf(e.target, false);
  if (spec) preview(spec); else if (hovering) unpreview(false);
});
D.addEventListener('pointerout', (e) => {
  if (e.pointerType === 'touch' || !hovering) return;
  const to = e.relatedTarget && specOf(e.relatedTarget, false);
  if (!same(to, hovering)) unpreview(false);
});
D.addEventListener('focusin', (e) => {
  const t = e.target.closest && e.target.closest('.rk-row[data-sk], .rk-cab[data-cab]');
  if (t) { const spec = specOf(t, false); if (spec) { clearTimeout(hoverT); hovering = null; preview(spec); } }
});
D.addEventListener('focusout', (e) => { if (e.target.closest && e.target.closest('.rk-row[data-sk], .rk-cab[data-cab]')) unpreview(true); });
D.addEventListener('click', (e) => {
  const t = e.target; if (!t.closest) return;
  const chip = t.closest('.lchip[data-layer]');
  if (chip && chip.closest('[data-scene-root]')) { setLayer(chip.closest('[data-scene-root]'), chip.dataset.layer, chip.getAttribute('aria-pressed') !== 'true'); return; }
  const all = t.closest('[data-scene-all]');
  if (all) { showAll(all.closest('[data-scene-root]')); return; }
  // A row in the Key: its link still opens the device; the rest of the row chooses it in the drawing.
  const row = t.closest('.rk-row[data-sk], .rk-cab[data-cab]');
  if (row) { if (!t.closest('a, button, summary')) { const spec = specOf(row, true); if (spec) { unpreview(true); choose(spec); } } return; }
  if (t.closest('svg.scene') && performance.now() - lastTap < 700) return;   // a tap already chose it
  press(t);
});
// Press the drawing: choose what is there, or, on empty space, go back to the whole room.
function press(t) {
  const svg = t.closest('svg.scene'); if (!svg) return;
  const root = svg.closest('[data-scene-root]'); if (!root) return;
  const spec = specOf(t, true);
  unpreview(true);
  if (spec) choose(spec); else showAll(root);
}
// A tap on the drawing: WebKit sends no click for a tap on plain SVG shapes, so a short, still touch is a press.
let tap = null, lastTap = 0;
D.addEventListener('pointerdown', (e) => { tap = e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY, t: performance.now(), el: e.target } : null; }, true);
D.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'touch' || !tap) return;
  const el = tap.el, ok = Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10 && performance.now() - tap.t < 600;
  tap = null;
  if (!ok || !el.closest || !el.closest('svg.scene')) return;
  lastTap = performance.now();
  press(el);
}, true);
D.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    const row = e.target.closest && e.target.closest('.rk-row[data-sk], .rk-cab[data-cab]');
    if (row && e.target === row) { e.preventDefault(); const spec = specOf(row, true); if (spec) choose(spec); }
    return;
  }
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const inside = e.target.closest && (e.target.closest('[data-scene-root]') || e.target.closest('[data-key-for]'));
  const root = inside ? rootOf(inside) : (e.target === D.body ? [...D.querySelectorAll('[data-scene-root]')].find((r) => r.__sc && r.__sc.sel) : null);
  if (root && current(st(root))) showAll(root);
});

/* ---------- The morph: one room becomes the next ---------- */
const GEO = ['points', 'd', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'x', 'y'];
const XA = new Set(['x1', 'x2', 'cx', 'x']);
const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
// Walls, floor, rulers, dimension lines and leaders tween their geometry; markers slide; the rest (furniture,
// devices, plates) slide and resize as a whole.
const kindOf = (el) => (el.matches('.no') ? 'm' : el.matches('.sh, .dim, .rdim, .sbar, .lead') ? 't' : 'f');
const geoOf = (el) => [el, ...el.querySelectorAll('*')].filter((n) => /^(polygon|path|line|circle|text|rect)$/.test(n.tagName)).map((n) => ({ n, tag: n.tagName, a: GEO.filter((k) => n.hasAttribute(k)).map((k) => [k, n.getAttribute(k)]) }));
const bboxOf = (el) => { try { const b = el.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; } catch (_) { return null; } };

function capture(root) {
  const svg = root && root.querySelector('svg.scene'); if (!svg) return null;
  const m = svg.getScreenCTM(), box = root.querySelector('.scene-box').getBoundingClientRect();
  if (!m || !box.width) return null;
  const els = new Map();
  svg.querySelectorAll('[data-mk]').forEach((el) => {
    const kind = kindOf(el);
    els.set(el.dataset.mk, { el, kind, bb: bboxOf(el), geo: kind === 't' ? geoOf(el) : null, text: [...el.querySelectorAll('text')].map((t) => t.textContent) });
  });
  const s = st(root), f = current(s);
  const selMk = f && f.sks ? f.sks.map((sk) => root.querySelector(`.no[data-sk="${esc(sk)}"]`)?.dataset.mk).filter(Boolean) : [];
  return { m: { a: m.a, d: m.d, e: m.e, f: m.f }, box: { left: box.left, top: box.top, width: box.width }, els, selMk: f && f.sks && selMk.length === f.sks.length ? selMk : [],
    layers: { xray: root.classList.contains('show-xray'), cables: root.classList.contains('show-cables') && !root.classList.contains('cables-default') },
    cap: root.querySelector('.scene-cap')?.textContent || '' };
}

// A cubic-bezier curve from the settle token, for the geometry tweens a script drives frame by frame.
function curve(css) {
  const m = /cubic-bezier\(([^)]+)\)/.exec(css || '');
  const [x1, y1, x2, y2] = m ? m[1].split(',').map(Number) : [0.22, 1, 0.36, 1];
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, dx = (t) => (3 * ax * t + 2 * bx) * t + cx, sy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

// The same shape in both rooms (the same parts, the same number of points): tween each number from where it was
// (in the new drawing's units) to where it is now. Anything else is not the same shape, and fades in instead.
function tweenOf(from, to, X, Y) {
  if (!from || from.length !== to.length) return null;
  const parts = [];
  for (let i = 0; i < to.length; i++) {
    const a = from[i], b = to[i];
    if (a.tag !== b.tag || a.a.length !== b.a.length) return null;
    for (let j = 0; j < b.a.length; j++) {
      const [k, vb] = b.a[j], [k2, va] = a.a[j];
      if (k !== k2) return null;
      const na = (va.match(NUM) || []).map(Number), nb = (vb.match(NUM) || []).map(Number);
      if (na.length !== nb.length) return null;
      const pair = k === 'points' || k === 'd';
      const f0 = na.map((v, n) => (pair ? (n % 2 ? Y(v) : X(v)) : XA.has(k) ? X(v) : Y(v)));
      if (f0.every((v, n) => Math.abs(v - nb[n]) < 0.05)) continue;
      parts.push({ n: b.n, k, tpl: vb.split(NUM), from: f0, to: nb, end: vb });
    }
  }
  return parts;
}
const fill = (p, t) => p.tpl.reduce((s, piece, i) => s + piece + (i < p.to.length ? (p.from[i] + (p.to[i] - p.from[i]) * t).toFixed(2) : ''), '');

// Carry the person's layers and choice across to the next room.
function carry(root, snap, later) {
  if (!snap) return;
  const s = st(root);
  if (snap.selMk.length) {
    const sks = snap.selMk.map((mk) => root.querySelector(`.no[data-mk="${esc(mk)}"]`)?.dataset.sk).filter(Boolean);
    if (sks.length === snap.selMk.length) { s.sel = { sks }; s.prev = null; apply(root); }
  }
  const layer = (name, on) => { if (root.querySelector(`.lchip[data-layer="${name}"]`)) { root.querySelector(`.lchip[data-layer="${name}"]`).setAttribute('aria-pressed', String(on)); root.classList.toggle(`show-${name}`, on); } };
  if (snap.layers.xray) layer('xray', true);
  if (snap.layers.cables) {
    // The cables draw in along their routes once the room has settled.
    root.querySelector('.lchip[data-layer="cables"]')?.setAttribute('aria-pressed', 'true');
    if (later) setTimeout(() => layer('cables', true), later); else layer('cables', true);
  }
}

function play(root, snap, { page = false } = {}) {
  if (!root || !snap) return;
  const svg = root.querySelector('svg.scene');
  if (!svg || reduced() || !svg.animate) { carry(root, snap, 0); return; }
  if (root.__morph) root.__morph();
  const M = motion(), ease = curve(M.ease);
  carry(root, snap, M.morph * 0.75);
  const m = svg.getScreenCTM(), box = root.querySelector('.scene-box').getBoundingClientRect();
  if (!m || !box.width) return;
  // Where the old drawing's user units land in the new drawing's: within a page, the same place on screen; between
  // pages, the same place in the frame, which starts at the old frame's size (the view transition's group).
  let s, ox, oy;
  if (page) {
    const f = snap.box.width / box.width;
    s = snap.m.a / (f * m.a);
    ox = (snap.m.e - snap.box.left) / (f * m.a) - (m.e - box.left) / m.a;
    oy = (snap.m.f - snap.box.top) / (f * m.d) - (m.f - box.top) / m.d;
  } else { s = snap.m.a / m.a; ox = (snap.m.e - m.e) / m.a; oy = (snap.m.f - m.f) / m.d; }
  const X = (x) => x * s + ox, Y = (y) => y * s + oy;
  const anims = [], tweens = [], exits = [], seen = new Set();
  const flip = (el, from) => {
    el.style.transformBox = 'view-box'; el.style.transformOrigin = '0 0';
    anims.push(el.animate([{ transform: from }, { transform: 'none' }], { duration: M.morph, easing: M.ease }));
  };
  // Enter: from nothing to whatever the drawing's state asks of it (an implicit end, so a hidden marker stays hidden).
  const enter = (el) => anims.push(el.animate([{ opacity: 0, offset: 0 }], { duration: M.enter, delay: M.delay, easing: M.ease, fill: 'backwards' }));
  const tick = (el, o) => {
    if (!W.km || !W.km.tick) return;
    el.querySelectorAll('text').forEach((t, i) => { if (o.text[i] != null && o.text[i] !== t.textContent) W.km.tick(t, o.text[i]); });
  };
  root.classList.add('morphing');
  svg.querySelectorAll('[data-mk]').forEach((el) => {
    const mk = el.dataset.mk, o = snap.els.get(mk), kind = kindOf(el);
    seen.add(mk);
    if (!o || o.kind !== kind) { enter(el); return; }
    if (kind === 't') {
      const tw = tweenOf(o.geo, geoOf(el), X, Y);
      if (tw) tweens.push(...tw); else { enter(el); exits.push(o); }
      tick(el, o);
      return;
    }
    const nb = bboxOf(el), ob = o.bb && { x: X(o.bb.x), y: Y(o.bb.y), w: o.bb.w * s, h: o.bb.h * s };
    if (!nb || !ob) { enter(el); return; }
    if (kind === 'm') {
      const dx = ob.x + ob.w / 2 - (nb.x + nb.w / 2), dy = ob.y + ob.h / 2 - (nb.y + nb.h / 2);
      if (Math.hypot(dx, dy) > 0.5) flip(el, `translate(${dx}px, ${dy}px)`);
      return;
    }
    const sx = nb.w > 0.5 ? ob.w / nb.w : 1, sy = nb.h > 0.5 ? ob.h / nb.h : 1;
    // Too different to be the same thing stretched: the old one fades out where it was, the new one in.
    if (sx < 0.33 || sx > 3 || sy < 0.33 || sy > 3) { enter(el); exits.push(o); return; }
    const tx = ob.x - sx * nb.x, ty = ob.y - sy * nb.y;
    if (Math.abs(ob.x - nb.x) + Math.abs(ob.y - nb.y) + Math.abs(ob.w - nb.w) + Math.abs(ob.h - nb.h) < 0.6) return;
    flip(el, `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`);
  });
  snap.els.forEach((o, mk) => { if (!seen.has(mk)) exits.push(o); });
  // What only the old room had fades out where it was (exit: --dur-exit on the exit curve), drawn in the old
  // room's place over the new one, and takes no clicks.
  let layer = null;
  if (exits.length) {
    layer = D.createElementNS(SVGNS, 'g');
    layer.setAttribute('class', 'mk-exit'); layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('transform', `matrix(${s} 0 0 ${s} ${ox} ${oy})`);
    layer.style.pointerEvents = 'none';
    exits.forEach((o) => {
      const c = o.el.cloneNode(true);
      ['data-mk', 'data-sk', 'data-rel'].forEach((a) => c.removeAttribute(a));
      c.classList.remove('hit', 'sel');
      c.querySelectorAll('title').forEach((t) => t.remove());
      layer.appendChild(c);
      anims.push(c.animate([{ opacity: 0 }], { duration: M.exit, easing: M.exitEase || 'ease-in', fill: 'forwards' }));
    });
    const things = svg.querySelector('.things');
    svg.insertBefore(layer, things ? things.nextSibling : svg.firstChild);
  }
  // The caption's words cross-fade in place when they changed.
  const cap = root.querySelector('.scene-cap');
  if (cap && cap.textContent !== snap.cap) anims.push(cap.animate([{ opacity: 0, offset: 0 }], { duration: M.state, easing: M.ease }));
  // The geometry, frame by frame, on the settle curve.
  let raf = 0, t0 = 0;
  const frame = (now) => {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / M.morph), k = ease(p);
    tweens.forEach((tw) => tw.n.setAttribute(tw.k, p >= 1 ? tw.end : fill(tw, k)));
    if (p < 1) raf = requestAnimationFrame(frame); else done();
  };
  if (tweens.length) { tweens.forEach((tw) => tw.n.setAttribute(tw.k, fill(tw, 0))); raf = requestAnimationFrame(frame); }
  let over = false;
  const done = () => {
    if (over) return; over = true;
    cancelAnimationFrame(raf);
    tweens.forEach((tw) => tw.n.setAttribute(tw.k, tw.end));
    if (layer) layer.remove();
    root.classList.remove('morphing');
    if (root.__morph === stop) root.__morph = null;
  };
  const stop = () => { anims.forEach((a) => { try { a.finish(); } catch (_) {} }); done(); };
  root.__morph = stop;
  setTimeout(() => { if (!tweens.length || over) done(); }, Math.max(M.morph, M.enter + M.delay, M.exit) + 40);
}

// DetailTabs (and any in-page switch) finds morphs by the data-morph of what it swaps.
W.rsMorphers = W.rsMorphers || {};
W.rsMorphers.room = { capture, play: (root, snap) => play(root, snap) };

/* ---------- Between pages: the size picker on a space type, or any record drawing to the next ---------- */
let pageSnap = null;
const visibleRoot = (doc) => [...doc.querySelectorAll('[data-scene-root][data-morph="room"]')].find((r) => !r.closest('[hidden]') && r.closest('.scene-card'));
const named = (el) => { for (let p = el; p && p !== D.documentElement; p = p.parentElement) { const n = p.style && p.style.viewTransitionName; if (n && n !== 'none') return true; } return false; };
D.addEventListener('astro:before-preparation', (e) => {
  // Choosing another size keeps the page where it is: the page cross-fades while the drawing morphs.
  const pick = e.sourceElement && e.sourceElement.closest && e.sourceElement.closest('[data-room-pick]');
  if (pick) { W.__rsNavDir = 'same'; D.documentElement.setAttribute('data-nav-dir', 'same'); }
  const load = e.loader;
  e.loader = async function () {
    await load();
    pageSnap = null;
    const nd = e.newDocument;
    if (!nd || reduced() || !D.startViewTransition) return;
    const old = visibleRoot(D), next = old && visibleRoot(nd);
    if (!old || !next || named(old)) return;
    const r = old.getBoundingClientRect();
    if (r.bottom < 60 || r.top > innerHeight - 60) return;   // not on screen: nothing to carry across
    const a = old.querySelector('.scene-box'), b = next.querySelector('.scene-box');
    if (!a || !b) return;
    pageSnap = capture(old);
    if (!pageSnap) return;
    a.style.viewTransitionName = 'room-scene';
    b.style.viewTransitionName = 'room-scene';
    b.setAttribute('data-vt-room', '');
  };
});
D.addEventListener('astro:after-swap', () => {
  const snap = pageSnap; pageSnap = null;
  const box = D.querySelector('.scene-box[data-vt-room]');
  if (!box) return;
  const root = box.closest('[data-scene-root]');
  if (snap && root) play(root, snap, { page: true });
  setTimeout(() => { box.style.viewTransitionName = ''; box.removeAttribute('data-vt-room'); }, motion().morph + 200);
});

/* ---------- Every drawing on arrival ---------- */
const init = () => D.querySelectorAll('[data-scene-root]').forEach((root) => { if (root.dataset.pin && !root.__sc) apply(root); });
W.rsSceneInit = (root) => { if (root) { root.__sc = null; apply(root); } };
D.addEventListener('astro:page-load', init);
init();
