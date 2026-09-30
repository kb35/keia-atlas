// The front door's hero in 3D (FRONT-DOOR-V2 section 3, MOTION-V2 4.36): the demo's Dublin office as an architect's
// model, built in three.js from the building data (src/lib/floors.mjs) and the room drawings (src/lib/room3d.mjs),
// with the devices as health rings in space and each level's answer written over it (src/lib/hero-labels.mjs).
// Loaded by HeroZoom.astro after first paint, only where the screen is wide and WebGL draws, so the static first
// frame (an SVG of the same building) is what a visitor sees first and what a phone keeps.
//
// The look is an architect's model (Keith, 30 Sept): smooth slabs, the corridors a shade apart, the core as low solid
// blocks, every space a floor plate inside low partitions in one or two quiet tones (bone clay and pale oak; in dark,
// charcoal and slate), glass drawn as a thinner, lighter partition. The rings and the fault are the only saturated
// colour. Furniture appears only at the space level, in the story's room: its table (one shape), its chairs (one
// tone), its displays and video bar, a soft pendant disc. Every material and light is a --in-* token from the
// interior palette (src/lib/interior-palette.mjs: per look, light and dark), read again when the look changes and
// eased there over --dur-theme, colours only, so the geometry never pops.
//
// Why it is steady (the glitch Keith saw was the fourth floor left in view at 5% opacity, every material sorted as
// transparent, and glass overlapping its frames):
//   - Everything is opaque. Only the fourth floor, while it fades, and the rings' discs are ever blended.
//   - The fourth floor fades with a depth pre-pass (only its nearest surface shows, so nothing inside it flickers)
//     and is hidden, not faint, once it has lifted away. It casts no shadows, so nothing dapples the third floor.
//   - No two faces share a plane: partitions meet end to face, caps sit on top, screens stand 8 mm off their bezels.
//   - The sun's shadow map is drawn once for the still scene (renderer.shadowMap.autoUpdate off) and again only
//     while a level change moves something that casts; never because the camera moves.
//   - Geometry is merged: one draw per material per group (about 15 to 30 draws a frame). The scene draws only
//     while something moves, and not at all while it is off screen or the tab is hidden.
//
// The sequence runs, settles on its end frame, and HeroZoom's loop holds it, cross-fades and runs it again:
//   1  a beat on the building, then a slow dolly in with a slight turn
//   2  the fourth floor lifts away and fades while the camera settles over the third; the spaces are named
//   3  every space's ring comes on in turn; one breaks, once; the heartbeat appears
//   4  the camera eases into 3.09 Whooper Swan, which fits itself out as it arrives: the furniture grows up from the
//      floor, the display wall rises, the partition in front drops away; its devices come on in turn, named; the
//      video bar's ring breaks
// Every camera move is one critically damped spring (src/lib/spring.mjs) started from wherever the camera is, so
// the level strip, a click on a space or a drag can take over mid-move without a jump (and ends the loop). Distance
// eases on a log scale, so a long zoom reads as one even move. Reduced motion: the final frame, still and labelled,
// every level a click away. run() resolves true when it reached its end frame, false when something took over;
// reset() puts the scene back to the frame run() starts from (drawn under HeroZoom's cross-fade, never seen jumping).
//
//   mountHero(host, D, hooks, opts)  builds the scene in `host`, returns { run, go, goRoom, dispose, recolour, ... }
//   D                                { site, floors, rooms, furn, people, story } from HeroZoom.astro (inline JSON);
//                                    furn: [floor index, FURN index, 1 if in the story's room, z0, z1, x, y, x, y, ...]
//   hooks                            { onReady(), onLevel(i, room?), onHover(o | null), onPick(room, go), onTouch(), onFrame(project), onBeat() }
//   opts                             { labels: the element the labels are written into, reduced: the site's reduced motion,
//                                      ratio: a fixed pixel ratio (tools/hero-stills.mjs) }
import {
  WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera, Group, Mesh, BoxGeometry, ExtrudeGeometry, Shape,
  RingGeometry, CircleGeometry, CylinderGeometry, PlaneGeometry, MeshLambertMaterial, MeshBasicMaterial,
  ShadowMaterial, HemisphereLight, DirectionalLight, AmbientLight, Color, Vector2, Vector3, Spherical, Raycaster, CanvasTexture, SRGBColorSpace,
  Quaternion, PCFShadowMap,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { spring } from './spring.mjs';
import { createLabels } from './hero-labels.mjs';

// The interior palette and the lights (HeroZoom.astro sets them on .hz, light and dark), plus the two health colours.
const TOKENS = ['--in-slab', '--in-room-floor', '--in-corr', '--in-rug', '--in-town', '--in-wall', '--in-feature', '--in-cap', '--in-core', '--in-wc', '--in-glass',
  '--in-frame', '--in-wood', '--in-oak', '--in-chair', '--in-chair-2', '--in-sofa', '--in-dev', '--in-screen', '--in-cream', '--in-leg', '--in-leaf', '--in-pot',
  '--in-lamp', '--hz-ground', '--in-sun', '--in-sky', '--in-bounce', '--h-fine', '--h-fault', '--surface'];
const NUMBERS = { '--in-sun-i': 1.5, '--in-sky-i': 1.3, '--in-amb-i': 0.3, '--in-lamp-i': 0.6, '--in-glass-a': 0.28, '--in-shadow-a': 0.35, '--in-shadow-i': 0.5 };
// Furniture materials, by the index HeroZoom writes for each part (the room drawings' materials, grouped).
const FURN = ['--in-wood', '--in-oak', '--in-chair', '--in-chair-2', '--in-sofa', '--in-dev', '--in-screen', '--in-cream', '--in-leg', '--in-leaf', '--in-pot'];
const LIT = 6;                                   // the screens: unlit, so they glow a little
const WALL_H = 2.4, LIFT = 4.5;                  // a full wall (the story room's display wall); the fourth floor's rise
const MODEL_H = 1.1, CORE_H = 1.5, SLAB = 0.32;  // the model's partitions, its core blocks, its slab
const T_WALL = 0.1, T_GLASS = 0.04, CAP = 0.012;
const AZ = 24, EL = 38;                          // one camera angle for every level: only distance and target change
const world = (x, y, z) => new Vector3(x, z, -y);
const rad = (deg) => (deg * Math.PI) / 180;

// Read the tokens as colours (any CSS colour syntax) by painting one pixel each; the alpha is kept for the shadow.
function readTokens(el) {
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true }), cs = getComputedStyle(el), out = {}, alpha = {};
  for (const n of TOKENS) {
    g.clearRect(0, 0, 1, 1); g.fillStyle = '#888'; g.fillStyle = cs.getPropertyValue(n).trim() || '#888'; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data, a = d[3] / 255 || 1;
    out[n] = new Color().setRGB(d[0] / 255 / a, d[1] / 255 / a, d[2] / 255 / a, SRGBColorSpace); alpha[n] = d[3] / 255;
  }
  const num = {};
  for (const [n, d] of Object.entries(NUMBERS)) { const v = parseFloat(cs.getPropertyValue(n)); num[n] = Number.isNaN(v) ? d : v; }
  return { c: out, a: alpha, n: num };
}
const ms = (cs, name, d) => { const v = cs.getPropertyValue(name).trim(), n = parseFloat(v); return Number.isNaN(n) ? d : /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n; };

// ---- Plan geometry (metres, z up): a prism from an outline, a box, merged per material.
const prism = (pts, z0, z1) => {
  const g = new ExtrudeGeometry(new Shape(pts.map(([x, y]) => new Vector2(x, y))), { depth: Math.max(0.004, z1 - z0), bevelEnabled: false, curveSegments: 1, steps: 1 });
  g.translate(0, 0, z0); g.deleteAttribute('uv'); return g;
};
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const boxG = (x0, y0, z0, x1, y1, z1) => prism(rectPts(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)), z0, z1);

// ---- Walls from the plan: each walled room's edges, split wherever another rectangle starts or ends, and each
// piece typed by what is on its other side: another walled room (one shared party wall), the core, the outside, or
// open floor (a corridor, an area, a room without walls) where a glass room gets its glass.
function wallPlan(f, rooms) {
  const walled = rooms.filter((r) => r.w === 'glass' || r.w === 'solid');
  const core = f.core.filter((c) => !c.flat);
  const xs = f.outline.map((p) => p[0]), ys = f.outline.map((p) => p[1]);
  const [ox0, oy0, ox1, oy1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const inside = (p, r) => p[0] > r[0] && p[0] < r[2] && p[1] > r[1] && p[1] < r[3];
  const cuts = { x: new Set(), y: new Set() };
  for (const r of [...rooms.map((o) => o.r), ...f.core.map((c) => c.r), ...f.corr, ...f.areas.map((a) => a.r)]) { cuts.x.add(r[0]); cuts.x.add(r[2]); cuts.y.add(r[1]); cuts.y.add(r[3]); }
  const beyond = (p, self) => {
    const room = walled.find((o) => o !== self && inside(p, o.r)); if (room) return { t: 'party', room };
    if (p[0] < ox0 || p[0] > ox1 || p[1] < oy0 || p[1] > oy1) return { t: 'outside' };
    return core.some((c) => inside(p, c.r)) ? { t: 'core' } : { t: 'open' };
  };
  const segs = new Map();
  const keep = (s) => { const k = `${s.ax}:${s.c.toFixed(2)}:${s.a.toFixed(2)}:${s.b.toFixed(2)}`; const had = segs.get(k); if (had) had.rooms = [...new Set([...had.rooms, ...s.rooms])]; else segs.set(k, s); };
  for (const r of walled) {
    const [x0, y0, x1, y1] = r.r;
    for (const e of [{ ax: 'x', c: y0, a: x0, b: x1, n: -1, side: 's' }, { ax: 'x', c: y1, a: x0, b: x1, n: 1, side: 'n' }, { ax: 'y', c: x0, a: y0, b: y1, n: -1, side: 'w' }, { ax: 'y', c: x1, a: y0, b: y1, n: 1, side: 'e' }]) {
      const at = [e.a, ...[...cuts[e.ax]].filter((v) => v > e.a + 1e-3 && v < e.b - 1e-3).sort((p, q) => p - q), e.b];
      let run = null;
      for (let i = 0; i < at.length - 1; i++) {
        const m = (at[i] + at[i + 1]) / 2, o = beyond(e.ax === 'x' ? [m, e.c + e.n * 0.06] : [e.c + e.n * 0.06, m], r);
        const kind = r.w === 'glass' && o.t === 'open' ? 'glass' : 'paint', tag = `${kind}:${o.t}:${o.room?.id ?? ''}`;
        if (run && run.tag === tag) run.b = at[i + 1];
        else { if (run) keep(run); run = { tag, kind, ax: e.ax, c: e.c, a: at[i], b: at[i + 1], side: e.side, beyond: o.t, rooms: [r.id, o.room?.id].filter(Boolean) }; }
      }
      if (run) keep(run);
    }
  }
  const list = [...segs.values()];
  // One feature wall per glass room: its own wall (not shared) on the side facing away from its glass.
  const OPP = { s: 'n', n: 's', w: 'e', e: 'w' };
  for (const r of walled.filter((o) => o.w === 'glass')) {
    const g = list.find((s) => s.kind === 'glass' && s.rooms[0] === r.id); if (!g) continue;
    for (const s of list) if (s.kind === 'paint' && s.rooms.length === 1 && s.rooms[0] === r.id && s.side === OPP[g.side]) s.feature = true;
  }
  // Ends: a wall along x runs on over the end of a painted wall it meets (unless another runs on in line); every
  // other wall and all glass stops at that wall's face. So walls meet end to face, and no two faces share a plane.
  const paintAcross = (ax, c, v) => list.some((s) => s.kind === 'paint' && s.ax !== ax && Math.abs(s.c - v) < 0.01 && c > s.a - 0.01 && c < s.b + 0.01);
  const paintInLine = (s, v) => list.some((o) => o !== s && o.kind === 'paint' && o.ax === s.ax && Math.abs(o.c - s.c) < 0.01 && (Math.abs(o.a - v) < 0.01 || Math.abs(o.b - v) < 0.01));
  for (const s of list) {
    for (const end of ['a', 'b']) {
      const v = s[end], dir = end === 'a' ? -1 : 1;
      if (!paintAcross(s.ax, s.c, v)) continue;
      if (s.kind === 'paint' && s.ax === 'x') { if (!paintInLine(s, v)) s[end] = v + dir * (T_WALL / 2); }
      else s[end] = v - dir * (T_WALL / 2);
    }
  }
  return list;
}

export function mountHero(host, D, hooks = {}, opts = {}) {
  const cs = getComputedStyle(host);
  const reduced = opts.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = { theme: ms(cs, '--dur-theme', 360), move: ms(cs, '--dur-hero-move', 1800), hold: ms(cs, '--dur-hero-hold', 700), state: ms(cs, '--dur-state', 300), stagger: ms(cs, '--stagger', 24), lift: ms(cs, '--dur-hero-lift', 1400) };
  let T = readTokens(host);
  let lifted = 0, focus = 0, shadowDirty = true;   // the fourth floor's lift, the story room's fit-out (0..1)

  // Resolution adapts: the scene starts at one and a half times its pixels (at most the screen's), steps down a quarter
  // whenever twenty frames in a move average over 22 ms, and steps back up (to at most twice, or one and a half on a
  // low-power machine) only at the start of a later move whose frames had room to spare, so a change is never seen
  // on a still frame.
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: lowPower ? 'default' : 'high-performance' });
  const maxRatio = opts.ratio ?? Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
  let ratio = opts.ratio ?? Math.min(maxRatio, 1.5), roomToSpare = false;   // opts.ratio: the stills' capture, fixed
  renderer.setPixelRatio(ratio);
  const frameMs = [];
  let lastFrame = 0;
  const adapt = (now) => {
    if (lastFrame) frameMs.push(now - lastFrame);
    lastFrame = now;
    if (frameMs.length < 20) return;
    const mean = frameMs.reduce((a, b) => a + b, 0) / frameMs.length; frameMs.length = 0;
    if (mean > 22 && ratio > 1) { ratio = Math.max(1, ratio - 0.25); renderer.setPixelRatio(ratio); roomToSpare = false; }
    else if (mean < 14 && ratio < maxRatio) roomToSpare = true;
  };
  const stepUp = () => { if (roomToSpare) { roomToSpare = false; ratio = Math.min(maxRatio, ratio + 0.25); renderer.setPixelRatio(ratio); } };
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  renderer.domElement.className = 'hz-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 16 / 10, 0.5, 600);
  const root = new Group(); root.rotation.x = -Math.PI / 2; scene.add(root);   // plan metres, z up
  const owned = [];   // geometries to dispose

  // ---- Light: a warm sky, a little bounce from the floor, one sun with soft, light shadows, a cool fill.
  const sky = new HemisphereLight(T.c['--in-sky'], T.c['--in-bounce'], T.n['--in-sky-i']); scene.add(sky);
  const amb = new AmbientLight(T.c['--in-sky'], T.n['--in-amb-i']); scene.add(amb);
  const sun = new DirectionalLight(T.c['--in-sun'], T.n['--in-sun-i']); scene.add(sun); scene.add(sun.target);
  const fill = new DirectionalLight(0xffffff, 0.3); fill.position.set(70, 30, -40); scene.add(fill);

  // ---- Materials. Opaque unless glass, a ground shadow, or on the floor that fades (drawn after a depth pre-pass).
  const mats = [];
  const colourOf = (e) => (e.derive ? e.derive(T) : T.c[e.token] ?? new Color(e.token));
  const mk = (kind, token, o = {}) => {
    const e = { token, base: o.base ?? 1, floor: o.floor ?? null, alpha: 1, derive: o.derive ?? null, emissive: o.emissive ?? 0 };
    const col = colourOf(e);
    const m = kind === 'basic' ? new MeshBasicMaterial({ color: col }) : kind === 'shadow' ? new ShadowMaterial({ color: col }) : new MeshLambertMaterial({ color: col });
    m.opacity = e.base;
    m.transparent = !!(o.fade || kind === 'shadow' || o.transparent);
    if (o.depthWrite === false) m.depthWrite = false;
    if (e.emissive) { m.emissive = T.c['--in-lamp'].clone(); m.emissiveIntensity = T.n['--in-lamp-i'] * e.emissive; }
    e.m = m; mats.push(e); m.userData.e = e; return m;
  };
  const setAlpha = (floor, a) => { for (const e of mats) if (e.floor === floor) { e.alpha = a; e.m.opacity = e.base * a; } };
  const bake = (parent, list, mat, { cast = false, receive = false, order = 0 } = {}) => {
    if (!list.length) return null;
    const g = mergeGeometries(list, false); for (const x of list) x.dispose(); owned.push(g);
    const m = new Mesh(g, mat); m.castShadow = cast; m.receiveShadow = receive; m.renderOrder = order; parent.add(m); return m;
  };
  const unitBox = new BoxGeometry(1, 1, 1); owned.push(unitBox);
  const volume = (parent, [x0, y0, z0], [x1, y1, z1], mat) => { const m = new Mesh(unitBox, mat); m.scale.set(x1 - x0, y1 - y0, z1 - z0); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(m); return m; };

  // ---- The building's footprint and the ground it stands on.
  const f0 = D.floors[0], xs = f0.outline.map((p) => p[0]), ys = f0.outline.map((p) => p[1]);
  const bx = [Math.min(...xs), Math.max(...xs)], by = [Math.min(...ys), Math.max(...ys)];
  const cx = (bx[0] + bx[1]) / 2, cy = (by[0] + by[1]) / 2;
  const topZ = Math.max(...D.floors.map((f) => f.level)) + MODEL_H;
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new CanvasTexture(c), plane = new PlaneGeometry(1, 1); owned.push(plane);
    const glow = new Mesh(plane, new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: T.c['--hz-ground'], opacity: T.a['--hz-ground'] }));
    glow.scale.set((bx[1] - bx[0]) * 1.5, (by[1] - by[0]) * 2.2, 1); glow.position.set(cx + 2, cy - 2, f0.level - SLAB - 0.005); glow.renderOrder = -2; root.add(glow); glow.userData.ground = true;
    // The model's contact shadow: the sun's shadow of the building on an invisible ground just under it.
    const gnd = new Mesh(plane, mk('shadow', '--hz-ground', { base: T.n['--in-shadow-a'], depthWrite: false }));
    gnd.scale.set((bx[1] - bx[0]) * 3, (by[1] - by[0]) * 4, 1); gnd.position.set(cx, cy, f0.level - SLAB - 0.002); gnd.receiveShadow = true; gnd.renderOrder = -1; root.add(gnd);
  }
  // The sun stands high to the south-west. Its shadow camera is fitted to the story floor and the ground under it
  // (only that floor casts), so each shadow-map texel is small and the edges soft rather than stepped.
  sun.position.copy(world(cx - 26, cy - 34, topZ + 46)); sun.target.position.copy(world(cx, cy, f0.level));
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  {
    const eye = new OrthographicCamera(); eye.position.copy(sun.position); eye.lookAt(sun.target.position); eye.updateMatrixWorld();
    const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const x of [bx[0] - 4, bx[1] + 4]) for (const y of [by[0] - 4, by[1] + 4]) for (const z of [f0.level - SLAB - 0.05, f0.level + WALL_H + 0.3]) { const p = world(x, y, z).applyMatrix4(eye.matrixWorldInverse); lo.min(p); hi.max(p); }
    const sc = sun.shadow.camera; sc.left = lo.x; sc.right = hi.x; sc.bottom = lo.y; sc.top = hi.y; sc.near = Math.max(0.5, -hi.z - 2); sc.far = -lo.z + 2; sc.updateProjectionMatrix();
  }
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 4; sun.shadow.intensity = T.n['--in-shadow-i'];

  // ---- Health rings: a billboard the size of a glyph on screen, on a small light disc so it reads on any floor.
  // Drawn last (after the glass and the fading floor), without writing depth.
  const floorGroups = new Map(), roomObj = new Map(), rings = [];
  const ringGeo = new RingGeometry(0.72, 1, 48), dotGeo = new CircleGeometry(0.24, 16), discGeo = new CircleGeometry(1.28, 32);
  const arcA = new RingGeometry(0.68, 1, 20, 1, -Math.PI / 3, (2 * Math.PI) / 3), arcB = new RingGeometry(0.68, 1, 20, 1, (2 * Math.PI) / 3, (2 * Math.PI) / 3);
  owned.push(ringGeo, dotGeo, discGeo, arcA, arcB);
  const ring = (parent, at, { px = 13, fault = false } = {}) => {
    const g = new Group(); g.position.copy(at); parent.add(g);
    const back = mk('basic', '--surface', { base: 0.92, depthWrite: false, transparent: true }), fine = mk('basic', '--h-fine', { transparent: true }), hot = mk('basic', '--h-fault', { transparent: true });
    const disc = new Mesh(discGeo, back); disc.position.z = -0.01; disc.renderOrder = 30; g.add(disc);
    const ok = new Mesh(ringGeo, fine); ok.renderOrder = 31; g.add(ok);
    let broken = null;
    if (fault) { broken = new Group(); broken.add(new Mesh(arcA, hot), new Mesh(arcB, hot), new Mesh(dotGeo, hot)); broken.children.forEach((m) => { m.renderOrder = 31; }); broken.visible = false; g.add(broken); }
    const r = { g, fine: ok, broken, back, quiet: fine, hot, px, on: 0, state: 'fine' };
    fine.opacity = 0; hot.opacity = 0; back.opacity = 0; g.visible = false;
    rings.push(r); return r;
  };

  // ---- The floors, as an architect's model: a smooth slab, the corridors a shade apart, the core as low solid
  // blocks, each walled space a floor plate inside low partitions (painted where it meets another room, the core or
  // the outside; thinner and lighter where it meets open floor, where the office has glass). No furniture: that
  // arrives only in the story's room, at the space level, where it tells the story.
  const roomMeshes = [], pick = new MeshBasicMaterial({ visible: false });
  const fading = [];          // the fourth floor's meshes, drawn after a depth pre-pass while it fades
  let storyFront = null, storyWall = null, storyFurn = null, storyLamp = null, featureMat = null;
  const storyFloor = D.floors.find((f) => f.id === D.story.floor);
  const L3 = storyFloor.level;
  for (const [fi, f] of D.floors.entries()) {
    const g = new Group(); root.add(g); floorGroups.set(f.id, g);
    const L = f.level, isStory = f.id === D.story.floor, fade = !isStory;
    const lit = { cast: isStory, receive: isStory };
    const M = (token, o = {}) => mk(o.kind ?? 'lambert', token, { floor: f.id, fade, ...o });
    const rooms = D.rooms.filter((x) => x.f === f.id);

    // Slab, corridors, core.
    bake(g, [prism(f.outline, L - SLAB, L)], M('--in-slab'), lit);
    bake(g, f.corr.map((r) => boxG(r[0], r[1], L, r[2], r[3], L + 0.012)), M('--in-corr'), { receive: isStory });
    const coreMat = M('--in-core'), capMat = M('--in-cap');
    const solid = f.core.filter((c) => !c.flat);
    bake(g, solid.map((c) => boxG(c.r[0], c.r[1], L, c.r[2], c.r[3], L + CORE_H)), coreMat, lit);
    bake(g, f.core.filter((c) => c.flat).map((c) => boxG(c.r[0], c.r[1], L, c.r[2], c.r[3], L + 0.014)), M('--in-corr'), { receive: isStory });

    // The spaces' floors (the story room's on its own, for its tint), an invisible volume to point at, a ring above.
    const floorMat = M('--in-room-floor');
    const plates = [];
    for (const r of rooms) {
      const fault = r.id === D.story.room, [x0, y0, x1, y1] = r.r;
      const mat = fault ? M('--in-room-floor') : floorMat;
      const plate = boxG(x0, y0, L, x1, y1, L + 0.02);
      if (fault) bake(g, [plate], mat, { receive: isStory }); else plates.push(plate);
      const walled = r.w !== 'none';
      const vol = volume(g, [x0, y0, L], [x1, y1, L + (walled ? MODEL_H : 0.6)], pick); vol.userData.room = r; roomMeshes.push(vol);
      const centre = [(x0 + x1) / 2, (y0 + y1) / 2], top = L + (walled ? MODEL_H : 0.4) + 0.6;
      const rg = ring(g, new Vector3(centre[0], centre[1], top), { px: fault ? 19 : 13, fault });
      roomObj.set(r.id, { r, m: vol, mat, ring: rg, centre: new Vector3(centre[0], centre[1], L + 1.0), top: new Vector3(centre[0], centre[1], top), fault, area: (x1 - x0) * (y1 - y0), L });
    }
    bake(g, plates, floorMat, { receive: isStory });

    // Partitions. The story room's own are kept apart: at the space level the one in front of it drops away and
    // its display wall rises to full height in the feature colour; the side partitions stay as they are.
    const W = { paint: [], cap: [], glass: [] }, SF = [], SW = [], SWcap = [];
    const box = (s, t, z0, z1) => (s.ax === 'x' ? boxG(s.a, s.c - t / 2, z0, s.b, s.c + t / 2, z1) : boxG(s.c - t / 2, s.a, z0, s.c + t / 2, s.b, z1));
    for (const s of wallPlan(f, rooms)) {
      const mine = isStory && s.rooms.includes(D.story.room);
      if (s.kind === 'glass') (mine ? SF : W.glass).push(box(s, T_GLASS, mine ? 0 : L, (mine ? 0 : L) + MODEL_H));
      else if (mine && s.feature) { SW.push(box(s, T_WALL, 0, WALL_H)); SWcap.push(box(s, T_WALL, WALL_H, WALL_H + CAP)); }
      else { W.paint.push(box(s, T_WALL, L, L + MODEL_H)); W.cap.push(box(s, T_WALL, L + MODEL_H, L + MODEL_H + CAP)); }
    }
    const paintMat = M('--in-wall'), glassMat = M('--in-glass');
    bake(g, W.paint, paintMat, lit); bake(g, W.cap, capMat, lit); bake(g, W.glass, glassMat, lit);
    if (isStory) {
      storyFront = new Group(); storyFront.position.z = L; g.add(storyFront); bake(storyFront, SF, glassMat, lit);
      featureMat = M('--in-wall', { derive: (t) => t.c['--in-wall'].clone().lerp(t.c['--in-feature'], focus) });
      storyWall = new Group(); storyWall.position.z = L; g.add(storyWall); bake(storyWall, SW, featureMat, lit); bake(storyWall, SWcap, capMat, lit);

      // The story room's furniture (the room drawing, from HeroZoom): one merged mesh per material, grown up from
      // the floor at the space level. The pendant over the table: a soft, low-contrast disc.
      const own = [];
      for (const b of D.furn) {
        if (b[0] !== fi) continue;
        const pts = []; for (let i = 5; i < b.length; i += 2) pts.push([b[i], b[i + 1]]);
        (own[b[1]] ??= []).push(prism(pts, b[3] - L, b[4] - L));
      }
      storyFurn = new Group(); storyFurn.position.z = L; g.add(storyFurn);
      for (const [i, list] of own.entries()) if (list) bake(storyFurn, list, i === LIT ? M(FURN[i], { kind: 'basic' }) : M(FURN[i]), { cast: i !== LIT, receive: i !== LIT });
      const lampGeo = new CylinderGeometry(0.3, 0.3, 0.025, 28); lampGeo.rotateX(Math.PI / 2); owned.push(lampGeo);
      const sr = D.rooms.find((x) => x.id === D.story.room).r;
      storyLamp = new Mesh(lampGeo, M('--in-lamp', { derive: (t) => t.c['--in-lamp'].clone().lerp(t.c['--in-wall'], 0.5), emissive: 0.28 }));
      storyLamp.position.set((sr[0] + sr[2]) / 2, (sr[1] + sr[3]) / 2, L + 2.08); g.add(storyLamp);
    }
    if (fade) g.traverse((o) => { if (o.isMesh && o.material !== pick && o.renderOrder < 30) fading.push(o); });
  }
  // The fading floor: a depth-only twin of each mesh draws first, so only the floor's nearest surface is blended.
  const depthOnly = new MeshBasicMaterial({ colorWrite: false, transparent: true });
  for (const o of fading) { const t = new Mesh(o.geometry, depthOnly); t.position.copy(o.position); t.scale.copy(o.scale); t.renderOrder = 10; o.renderOrder = 11; o.parent.add(t); }

  // The story's devices, as rings where they are in the space (shown once the camera is in the room).
  const storyG = floorGroups.get(D.story.floor);
  const devRings = D.story.devices.map((d) => {
    const rg = ring(storyG, new Vector3(...d.at), { px: d.fault ? 18 : 12, fault: !!d.fault });
    rg.g.userData.dev = d; return rg;
  });
  const story = roomObj.get(D.story.room);
  const besideRings = [...roomObj.values()].filter((o) => o.r.f === D.story.floor && o !== story).map((o) => o.ring);

  // ---- Words over the scene: each level's answer, where the thing is. In the space: the fault and three more.
  const labels = createLabels(opts.labels ?? host, { reduced, caps: { 1: 3, 2: 2 } });
  const at3 = (o) => { const p = new Vector3(); o.getWorldPosition(p); return p; };
  const ringPx = (r) => r.px * 0.5 + 8;
  labels.add({ id: 'site', level: 0, cls: 'hz-lab-site', text: D.site.name, sub: D.site.line, at: () => world(cx, by[1] + 1.5, topZ + 2.2), priority: 20, dy: 8 });
  for (const f of D.floors) labels.add({ id: `floor-${f.id}`, level: 0, cls: 'hz-lab-floor', text: f.name, at: () => at3(floorGroups.get(f.id)).add(world(bx[0] - 1.2, by[0] - 0.4, f.level + 0.2)), priority: 6, dy: -6 });
  for (const o of roomObj.values()) {
    if (o.r.f !== D.story.floor) continue;
    const small = o.area < 14;
    labels.add({ id: o.r.id, level: 1, cls: `hz-lab-room${small ? ' is-small' : ''}${o.fault ? ' is-fault' : ''}`, text: o.r.n, sub: o.fault ? 'Fault' : null, ring: o.fault ? 'fault' : 'fine',
      at: () => at3(o.ring.g), priority: o.fault ? 30 : 4 + Math.min(6, o.area / 8), dy: ringPx(o.ring) });
  }
  const CORE_WORD = { stair: 'Stairs', lift: 'Lifts', toilets: 'Toilets' };
  for (const c of storyFloor.core) if (CORE_WORD[c.kind]) labels.add({ id: `core-${c.r.join()}`, level: 1, cls: 'hz-lab-core', text: CORE_WORD[c.kind], at: () => world((c.r[0] + c.r[2]) / 2, (c.r[1] + c.r[3]) / 2, L3 + CORE_H + 0.05), priority: 2, dy: 0, free: true });
  // Who is on site: only the technician the story follows (the rest are in the record, not the picture).
  for (const p of D.people.filter((x) => x.story)) {
    const f = D.floors.find((x) => x.id === p.f); if (!f) continue;
    const g = floorGroups.get(p.f), lifts = p.f !== D.story.floor;
    labels.add({ id: `p-${p.i}`, level: 1, cls: `hz-lab-person${p.story ? ' is-story' : ''}`, avatar: p.i, text: p.story ? p.n : null, sub: p.story ? p.r : null, title: `${p.n}, ${p.r}`,
      at: () => at3(g).add(world(p.at[0], p.at[1], f.level + 1.7)), priority: p.story ? 12 : 3, dy: 0, lifts });
  }
  for (const r of devRings) { const d = r.g.userData.dev; labels.add({ id: `dev-${d.key}`, level: 2, cls: `hz-lab-dev${d.fault ? ' is-fault' : ''}`, text: d.label, sub: d.fault ? 'Offline' : null, ring: d.fault ? 'fault' : 'fine', at: () => at3(r.g), priority: d.fault ? 40 : 8, dy: ringPx(r), ...(d.fault ? { side: 'right', dx: r.px * 0.64 + 6 } : {}) }); }

  // ---- Camera: fit a box at an angle; move on a spring from wherever the camera is now.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enableZoom = false; controls.enablePan = false; controls.rotateSpeed = 0.35;
  controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.32; controls.enabled = false;
  const target = controls.target;
  const bounds = (which) => {
    if (which === 'all') return { min: [bx[0], by[0], f0.level - SLAB], max: [bx[1], by[1], topZ] };
    const f = D.floors.find((x) => x.id === which);
    return { min: [bx[0], by[0], f.level - SLAB], max: [bx[1], by[1], f.level + MODEL_H] };
  };
  function fitView(b, az, el, k = 1) {
    const c = world((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    const right = new Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(right).normalize();
    const tanV = Math.tan((camera.fov * Math.PI) / 360), tanH = tanV * camera.aspect;
    let d = 0;
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
      const p = world(x, y, z).sub(c); d = Math.max(d, p.dot(dir) + Math.abs(p.dot(right)) / tanH, p.dot(dir) + Math.abs(p.dot(up)) / tanV);
    }
    return { target: c, pos: c.clone().add(dir.multiplyScalar(d * k)) };
  }
  // Every level is framed from the same angle, the subject centred with a little air round it; only the distance
  // and the target change, so a move never swings the horizon. A room is framed with its walls and the devices'
  // words above them.
  const roomView = (o) => { const [x0, y0, x1, y1] = o.r.r; return fitView({ min: [x0 - 0.3, y0 - 0.3, o.L], max: [x1 + 0.3, y1 + 0.3, o.L + WALL_H + 0.7] }, rad(AZ), rad(EL), 1.3); };
  const VIEWS = {
    far: () => fitView(bounds('all'), rad(AZ), rad(EL), 1.3),
    building: () => fitView(bounds('all'), rad(AZ), rad(EL), 1.08),
    floor: () => fitView(bounds(D.story.floor), rad(AZ), rad(EL), 1.06),
    space: () => roomView(story),
    room: (o) => roomView(o),
  };
  // Near and far planes follow the distance, so depth stays precise at every level and nothing near is clipped.
  const planes = (r) => { const n = Math.min(2, Math.max(0.1, r * 0.02)), f = r * 5 + 150; if (Math.abs(camera.near - n) > 1e-3 || Math.abs(camera.far - f) > 0.5) { camera.near = n; camera.far = f; camera.updateProjectionMatrix(); } };
  let tween = null;
  function moveTo(v, dur = DUR.move) {
    if (reduced || !dur) { tween = null; target.copy(v.target); camera.position.copy(v.pos); camera.lookAt(target); planes(v.pos.distanceTo(v.target)); controls.update(); requestRender(); return; }
    const s0 = new Spherical().setFromVector3(camera.position.clone().sub(target)), s1 = new Spherical().setFromVector3(v.pos.clone().sub(v.target));
    let dt = s1.theta - s0.theta; if (dt > Math.PI) dt -= 2 * Math.PI; if (dt < -Math.PI) dt += 2 * Math.PI;
    stepUp();
    tween = { t0: performance.now(), s: spring({ duration: dur, bounce: 0 }), from: { t: target.clone(), s: s0 }, to: { t: v.target.clone(), s: s1, dt } };
    requestRender();
  }
  const sph = new Spherical(), off = new Vector3();
  function stepTween(now) {
    if (!tween) return false;
    const e = tween.s.at(now - tween.t0), { from, to } = tween;
    target.lerpVectors(from.t, to.t, e);
    sph.set(from.s.radius * Math.pow(to.s.radius / from.s.radius, e), from.s.phi + (to.s.phi - from.s.phi) * e, from.s.theta + to.dt * e);
    camera.position.copy(target).add(off.setFromSpherical(sph));
    camera.lookAt(target); planes(sph.radius);
    if (now - tween.t0 >= tween.s.duration) { tween = null; controls.update(); }
    return !!tween;
  }

  // ---- Small timed changes (a floor lifting, a ring coming on): each a spring on one value, drawn per frame.
  const anims = new Set();
  const animate = (dur, fn) => new Promise((res) => {
    if (reduced || !dur) { fn(1); requestRender(); res(); return; }
    const a = { t0: performance.now(), s: spring({ duration: dur, bounce: 0 }), fn, res }; anims.add(a); requestRender();
  });
  function stepAnims(now) {
    for (const a of anims) { const t = now - a.t0, e = a.s.at(t); a.fn(e); if (t >= a.s.duration) { anims.delete(a); a.res(); } }
    return anims.size > 0;
  }
  const g4 = floorGroups.get(D.floors[1]?.id);
  // The fourth floor rises a little and fades out completely, then is not drawn at all.
  const setLift = (k) => { lifted = k; if (!g4) return; g4.position.z = LIFT * k; const a = Math.max(0, 1 - k * 1.3); setAlpha(D.floors[1].id, a); g4.visible = a > 0.004; };
  // The space level: the story room fits itself out. Its furniture grows up from the floor, its display wall rises
  // to full height in the feature colour, the pendant opens, and the partition in front of it drops away.
  const setFocus = (k) => {
    focus = k;
    const grow = Math.max(0.001, k), drop = Math.max(0.001, 1 - k);
    storyFurn.scale.z = grow; storyFurn.visible = k > 0.004;
    storyLamp.scale.setScalar(grow); storyLamp.visible = k > 0.004;
    storyWall.scale.z = MODEL_H / WALL_H + (1 - MODEL_H / WALL_H) * k;
    featureMat.color.copy(colourOf(featureMat.userData.e));
    storyFront.scale.z = drop; storyFront.visible = k < 0.996;
    shadowDirty = true;
  };
  const toward = (get, set, to, dur) => { const from = get(); if (Math.abs(from - to) < 1e-4) { set(to); return Promise.resolve(); } return animate(dur, (e) => set(from + (to - from) * e)); };
  const liftTo = (to, dur = DUR.lift) => toward(() => lifted, setLift, to, dur);
  const focusTo = (to, dur = DUR.move * 0.8) => toward(() => focus, setFocus, to, dur);
  const setRing = (r, on) => { r.on = on; r.g.visible = on > 0.004; r.back.opacity = 0.92 * on; (r.state === 'fault' ? r.hot : r.quiet).opacity = on; };
  const ringsTo = (list, to) => { for (const r of list) toward(() => r.on, (v) => setRing(r, v), to, DUR.state); };
  const breakRing = (r) => { r.state = 'fault'; r.fine.visible = false; r.broken.visible = true; r.hot.opacity = r.on; r.quiet.opacity = 0; };
  const sleep = (t) => new Promise((r) => setTimeout(r, reduced ? 0 : t));

  // ---- Rings face the camera and keep their size on screen.
  const tmp = new Vector3(), tmpQ = new Quaternion();
  function placeRings() {
    const h = renderer.domElement.clientHeight || 1, tanV = Math.tan((camera.fov * Math.PI) / 360);
    for (const r of rings) {
      if (!r.g.visible) continue;
      r.g.getWorldPosition(tmp);
      const d = camera.position.distanceTo(tmp);
      r.g.scale.setScalar(Math.max(0.02, (r.px * d * tanV) / h));
      r.g.quaternion.copy(camera.quaternion); r.g.parent.getWorldQuaternion(tmpQ); r.g.quaternion.premultiply(tmpQ.invert());
    }
  }
  // The glyphs no label may cover: the fault's ring, and in the space every device's.
  const keepClear = () => {
    const out = [];
    for (const r of rings) {
      if (!r.g.visible || r.on < 0.5 || (r.state !== 'fault' && !devRings.includes(r))) continue;
      const p = project(at3(r.g)); if (!p) continue;
      const h = r.px * 0.64 + 1; out.push({ x0: p[0] - h, x1: p[0] + h, y0: p[1] - h, y1: p[1] + h });
    }
    return out;
  };

  // ---- Drawing only while something moves, and only while the stage is on screen and the tab shown.
  let pending = false, alive = true, onScreen = true;
  function requestRender() { if (!pending && alive) { pending = true; requestAnimationFrame(frame); } }
  function frame(now) {
    pending = false; if (!alive) return;
    const moving = stepTween(now), more = stepAnims(now), damping = controls.enabled && controls.update();
    if (!onScreen || document.hidden) return;   // resumes (from the current time) when it is seen again
    placeRings();
    if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    renderer.render(scene, camera);
    const size = [renderer.domElement.clientWidth, renderer.domElement.clientHeight];
    labels.place(project, lifted, size, keepClear());
    hooks.onFrame?.(project);
    if (moving || more || damping) { adapt(now); requestRender(); } else lastFrame = 0;
  }
  const v3 = new Vector3();
  function project(pos) {
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    v3.copy(pos).project(camera);
    return v3.z < 1 ? [((v3.x + 1) / 2) * w, ((1 - v3.y) / 2) * h] : null;
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); requestRender();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { onScreen = es[es.length - 1].isIntersecting; if (onScreen) requestRender(); }) : null;
  io?.observe(host);
  const onVis = () => { if (!document.hidden) requestRender(); };
  document.addEventListener('visibilitychange', onVis);
  controls.addEventListener('change', requestRender);

  // ---- Pointing: a space under the pointer is named; a click eases the camera to it.
  const ray = new Raycaster(), ndc = new Vector2();
  let hover = null, down = null;
  const pickAt = (x, y) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(roomMeshes.filter((m) => (m.userData.room.f === D.story.floor) || lifted < 0.5), false)[0];
    return hit ? roomObj.get(hit.object.userData.room.id) : null;
  };
  const onMove = (e) => {
    if (e.buttons) return;
    const o = pickAt(e.clientX, e.clientY);
    if (o !== hover) { hover = o; renderer.domElement.style.cursor = o ? 'pointer' : ''; hooks.onHover?.(o ? { room: o.r, at: () => project(at3(o.ring.g)) } : null); }
  };
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; hooks.onTouch?.(); if (!reduced) { tween = null; controls.enabled = true; } };
  const onUp = (e) => {
    if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), quick = performance.now() - down.t < 600; down = null;
    if (moved < 6 && quick && e.button === 0) { const o = pickAt(e.clientX, e.clientY); if (o) hooks.onPick?.(o.r, () => goRoom(o)); }
  };
  const onLeave = () => { if (hover) { hover = null; hooks.onHover?.(null); } };
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointerleave', onLeave);

  // ---- The levels, and the sequence that visits them once.
  let level = 0, seq = 0;
  // In the space, the devices' rings take over from the room's own ring (one fault, told once).
  let roomRingWas = 0;
  const showDevRings = async (on) => {
    if (on) {
      if (story.ring.on > 0) { roomRingWas = story.ring.on; animate(DUR.state, (e) => setRing(story.ring, roomRingWas * (1 - e))); }
      for (let i = 0; i < devRings.length; i++) { const r = devRings[i]; setTimeout(() => animate(DUR.state, (e) => setRing(r, e)), reduced ? 0 : i * DUR.stagger * 3); }
      await sleep(devRings.length * DUR.stagger * 3 + DUR.state);
      const vb = devRings.find((r) => r.g.userData.dev.fault); if (vb && vb.state !== 'fault') breakRing(vb); requestRender();
    } else { for (const r of devRings) setRing(r, 0); if (roomRingWas && story.ring.on < roomRingWas) { const from = story.ring.on; animate(DUR.state, (e) => setRing(story.ring, from + (roomRingWas - from) * e)); } }
    requestRender();
  };
  // The labels of a level arrive as the camera settles, a little after the move starts.
  const wordsAt = (i, delay) => { const my = seq; const f = () => { if (seq === my && alive) { labels.level(i); requestRender(); } }; if (reduced || !delay) f(); else setTimeout(f, delay); };
  let ringsShown = false;
  async function go(i, animateIt = true) {
    seq++; level = i; hooks.onLevel?.(i);
    const dur = animateIt && !reduced ? DUR.move : 0, lift = animateIt ? DUR.lift : 0;
    wordsAt(i, dur * 0.45);
    if (i === 0) { moveTo(VIEWS.building(), dur); liftTo(0, lift); focusTo(0, dur * 0.8); showDevRings(false); if (ringsShown) ringsTo(besideRings, 1); }
    if (i === 1) { moveTo(VIEWS.floor(), dur); liftTo(1, lift); focusTo(0, dur * 0.8); showDevRings(false); if (ringsShown) ringsTo(besideRings, 1); }
    if (i === 2) { moveTo(VIEWS.space(), dur); liftTo(1, lift); focusTo(1, dur * 0.8); ringsTo(besideRings, 0); showDevRings(true); }
    if (i === 3) { labels.level(3); requestRender(); }
  }
  function goRoom(o) {
    if (o === story) { go(2); return; }
    seq++; level = 2; hooks.onLevel?.(2, o.r); moveTo(VIEWS.room(o)); wordsAt(3, DUR.move * 0.45);
    focusTo(0); showDevRings(false); if (ringsShown) ringsTo(besideRings, 1);
  }
  async function run() {
    const my = ++seq;
    const alive_ = () => seq === my;
    if (reduced) { setLift(1); setFocus(1); for (const r of rings) setRing(r, besideRings.includes(r) ? 0 : 1); ringsShown = true; breakRing(story.ring); moveTo(VIEWS.space(), 0); showDevRings(true); level = 2; labels.level(2); hooks.onLevel?.(2); hooks.onBeat?.(); requestRender(); return true; }
    moveTo(VIEWS.far(), 0);
    await sleep(DUR.hold); if (!alive_()) return false;
    moveTo(VIEWS.building()); labels.level(0); requestRender(); await sleep(DUR.move + DUR.hold * 0.4); if (!alive_()) return false;
    hooks.onLevel?.(1);
    moveTo(VIEWS.floor()); liftTo(1); await sleep(DUR.move * 0.55); if (!alive_()) return false;
    labels.level(1); requestRender();
    const floorRings = [...roomObj.values()].filter((o) => o.r.f === D.story.floor).sort((a, b) => a.r.r[0] - b.r.r[0]).map((o) => o.ring);
    floorRings.forEach((r, i) => setTimeout(() => { if (alive_()) animate(DUR.state, (e) => setRing(r, e)); }, i * DUR.stagger * 2));
    ringsShown = true;
    await sleep(floorRings.length * DUR.stagger * 2 + DUR.state + DUR.hold * 0.8); if (!alive_()) return false;
    breakRing(story.ring); requestRender(); hooks.onBeat?.();
    await sleep(DUR.hold * 1.8); if (!alive_()) return false;
    level = 2; hooks.onLevel?.(2);
    moveTo(VIEWS.space()); focusTo(1); ringsTo(besideRings, 0); await sleep(DUR.move * 0.5); if (!alive_()) return false;
    labels.level(2); requestRender();
    await showDevRings(true);
    await sleep(DUR.move * 0.5);   // the camera settles
    return alive_();
  }
  // Back to the frame run() starts from: the far view, the fourth floor home, the floor furnished, every ring off
  // and whole, no words.
  function reset() {
    seq++; tween = null; anims.clear(); controls.enabled = false;
    setLift(0); setFocus(0); roomRingWas = 0; ringsShown = false;
    for (const r of rings) { if (r.broken) { r.state = 'fine'; r.fine.visible = true; r.broken.visible = false; } setRing(r, 0); }
    labels.level(-1);
    moveTo(VIEWS.far(), 0); level = 0; hooks.onLevel?.(0); requestRender();
  }
  // The rings are on from the start when a level is chosen before the run reaches it.
  function ringsOn() { ringsShown = true; for (const r of rings.filter((x) => !devRings.includes(x))) if (r.on < 1 && !(level === 2 && besideRings.includes(r))) setRing(r, 1); if (story.ring.state !== 'fault') { breakRing(story.ring); } }

  // A look change: every material, light and opacity eases from what it shows now to the new look's value, together,
  // on one zero-bounce spring (--dur-theme; at once under reduced motion). Only colours change; nothing moves.
  let fadeLook = 0;
  function recolour() {
    T = readTokens(host);
    const colTo = (e) => colourOf(e);
    const jobs = [];
    const col = (c, to) => { if (to && !c.equals(to)) jobs.push({ c, a: c.clone(), b: to.clone() }); };
    const num = (get, set, to) => { const a = get(); if (Math.abs(a - to) > 1e-4) jobs.push({ get, set, a, b: to }); };
    for (const e of mats) {
      col(e.m.color, colTo(e));
      if (e.emissive) { col(e.m.emissive, T.c['--in-lamp']); num(() => e.m.emissiveIntensity, (v) => { e.m.emissiveIntensity = v; }, T.n['--in-lamp-i'] * e.emissive); }
      if (e.token === '--hz-ground') num(() => e.base, (v) => { e.base = v; e.m.opacity = v; }, T.n['--in-shadow-a']);
    }
    col(sky.color, T.c['--in-sky']); col(sky.groundColor, T.c['--in-bounce']); col(amb.color, T.c['--in-sky']); col(sun.color, T.c['--in-sun']);
    num(() => sky.intensity, (v) => { sky.intensity = v; }, T.n['--in-sky-i']); num(() => amb.intensity, (v) => { amb.intensity = v; }, T.n['--in-amb-i']); num(() => sun.intensity, (v) => { sun.intensity = v; }, T.n['--in-sun-i']);
    num(() => sun.shadow.intensity, (v) => { sun.shadow.intensity = v; }, T.n['--in-shadow-i']);
    root.traverse((o) => { if (o.userData.ground) { col(o.material.color, T.c['--hz-ground']); const m = o.material; num(() => m.opacity, (v) => { m.opacity = v; }, T.a['--hz-ground']); } });
    const my = ++fadeLook;
    animate(DUR.theme, (k) => { if (my !== fadeLook) return; for (const j of jobs) { if (j.c) j.c.copy(j.a).lerp(j.b, k); else j.set(j.a + (j.b - j.a) * k); } });
  }

  resize();
  moveTo(reduced ? VIEWS.space() : VIEWS.far(), 0);
  // Compile every material now (the fading floor's too), so no shader is built mid-move.
  renderer.compile(scene, camera);
  renderer.render(scene, camera); shadowDirty = false;
  Promise.resolve().then(() => { if (alive) hooks.onReady?.(); });   // after the caller holds the handle

  return {
    run, reset, go: (i, a) => { ringsOn(); return go(i, a); }, goRoom, recolour, requestRender,
    storyAt: () => project(at3(story.ring.g)),
    deviceAt: () => { const vb = devRings.find((r) => r.g.userData.dev.fault); return vb && vb.g.visible && vb.on > 0.5 ? project(at3(vb.g)) : null; },
    level: () => level,
    ratio: () => ratio,
    dispose() {
      alive = false; ro.disconnect(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); controls.dispose(); labels.dispose();
      renderer.domElement.remove(); renderer.dispose();
      for (const e of mats) e.m.dispose();
      depthOnly.dispose(); pick.dispose();
      for (const g of owned) g.dispose();
    },
  };
}
