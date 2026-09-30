// The front door's hero in 3D (FRONT-DOOR-V2 section 3, MOTION-V2 4.36): the demo's Dublin office as an architect's
// model, built in three.js from the building data (src/lib/floors.mjs) and the room drawings (src/lib/room3d.mjs),
// with the devices as health rings in space and each level's answer written over it (src/lib/hero-labels.mjs).
// Loaded by HeroZoom.astro after first paint, only where the screen is wide and WebGL draws, so the static first
// frame (an SVG of the same building) is what a visitor sees first and what a phone keeps.
//
// The look is the office itself, not the UI, and calm (Keith, 30 Sept): painted walls between rooms, one muted
// feature wall per meeting room, glass only where a room meets a corridor or an open area (with a frosted band at
// eye height, as offices have), every wall topped with a clean cap; chairs in one tone, each table one shape, the
// pendants soft discs, one sun with soft, light shadows. Every material and light is a --in-* token from the interior
// palette (src/lib/interior-palette.mjs: per look, light and dark), read again when the look changes and eased there
// over --dur-theme, colours only, so the geometry never pops. Health is only ever the look's own --h-fine and
// --h-fault, never mixed with a material.
//
// Why it is steady (the glitch Keith saw was the fourth floor left in view at 5% opacity, every material sorted as
// transparent, and glass overlapping its frames):
//   - Everything is opaque except the glass, which never writes depth and draws in a fixed order after the rooms.
//   - The fourth floor fades with a depth pre-pass (only its nearest surface shows, so nothing inside it flickers)
//     and is hidden, not faint, once it has lifted away. It casts no shadows, so nothing dapples the third floor.
//   - No two faces share a plane: walls meet end to face, glass stops at the walls, caps sit on top.
//   - The sun's shadow map is drawn once for the still scene (renderer.shadowMap.autoUpdate off) and again only
//     while a level change moves furniture; never because the camera moves.
//   - Furniture is merged: one draw per material per group. The scene draws only while something moves, and not
//     at all while it is off screen or the tab is hidden.
//
// The sequence runs, settles on its end frame, and HeroZoom's loop holds it, cross-fades and runs it again:
//   1  a beat on the building, then a slow dolly in with a slight turn
//   2  the fourth floor lifts away and fades while the camera settles over the third; the spaces are named
//   3  every space's ring comes on in turn; one breaks, once; the heartbeat appears
//   4  the camera eases into 3.09 Whooper Swan: the rooms beside it empty to their floors, the corridor glass in
//      front of it drops away, and its devices come on in turn, named; the video bar's ring breaks
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
//   opts                             { labels: the element the labels are written into }
import {
  WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera, Group, Mesh, InstancedMesh, BoxGeometry, ExtrudeGeometry, Shape,
  RingGeometry, CircleGeometry, CylinderGeometry, IcosahedronGeometry, PlaneGeometry, MeshLambertMaterial, MeshBasicMaterial,
  ShadowMaterial, HemisphereLight, DirectionalLight, AmbientLight, Color, Vector2, Vector3, Spherical, Raycaster, CanvasTexture, SRGBColorSpace,
  Quaternion, Matrix4, PCFShadowMap,
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
const WALL_H = 2.4, LIFT = 4.5;                  // wall height; how far the fourth floor rises as it fades
const T_WALL = 0.1, T_GLASS = 0.02, RAIL = 0.05, CAP = 0.012, BAND = [1.05, 1.35];
const CUT = 1.15;                                // the section cut: the story room's side walls, at the space level
const CORE_H = 1.1;                              // the core (stairs, lifts, toilets): low, solid, matte blocks
const AZ = 24, EL = 38;                          // one camera angle for every level: only distance and target change
const NB_TINT = 0.55;                            // how far the rooms beside the story room fade to their floor
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
const LEAF = new IcosahedronGeometry(0.5, 1); LEAF.deleteAttribute('uv');
const POT = new CylinderGeometry(0.5, 0.42, 1, 10).toNonIndexed(); POT.rotateX(Math.PI / 2); POT.deleteAttribute('uv');
const placed = (geo, x, y, z, sx, sy, sz) => geo.clone().scale(sx, sy, sz).translate(x, y, z);

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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = { theme: ms(cs, '--dur-theme', 360), move: ms(cs, '--dur-hero-move', 1800), hold: ms(cs, '--dur-hero-hold', 700), state: ms(cs, '--dur-state', 300), stagger: ms(cs, '--stagger', 24), lift: ms(cs, '--dur-hero-lift', 1400) };
  let T = readTokens(host);

  // A laptop draws at up to twice its pixels; a machine that reports few cores or little memory at one and a half.
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: lowPower ? 'default' : 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
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
    const e = { token, base: o.base ?? 1, floor: o.floor ?? null, alpha: 1, derive: o.derive ?? null, emissive: o.emissive ?? 0, glass: o.glass ?? null, nb: !!o.nb };
    const col = colourOf(e);
    const m = kind === 'basic' ? new MeshBasicMaterial({ color: col }) : kind === 'shadow' ? new ShadowMaterial({ color: col }) : new MeshLambertMaterial({ color: col });
    m.opacity = e.base;
    m.transparent = !!(o.glass || o.fade || kind === 'shadow' || o.transparent);
    if (o.glass || o.depthWrite === false) m.depthWrite = false;
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
  const topZ = Math.max(...D.floors.map((f) => f.level)) + WALL_H;
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new CanvasTexture(c), plane = new PlaneGeometry(1, 1); owned.push(plane);
    const glow = new Mesh(plane, new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: T.c['--hz-ground'], opacity: T.a['--hz-ground'] }));
    glow.scale.set((bx[1] - bx[0]) * 1.5, (by[1] - by[0]) * 2.2, 1); glow.position.set(cx + 2, cy - 2, f0.level - 0.405); glow.renderOrder = -2; root.add(glow); glow.userData.ground = true;
    // The model's contact shadow: the sun's shadow of the building on an invisible ground just under it.
    const gnd = new Mesh(plane, mk('shadow', '--hz-ground', { base: T.n['--in-shadow-a'], depthWrite: false }));
    gnd.scale.set((bx[1] - bx[0]) * 3, (by[1] - by[0]) * 4, 1); gnd.position.set(cx, cy, f0.level - 0.402); gnd.receiveShadow = true; gnd.renderOrder = -1; root.add(gnd);
  }
  // The sun stands high to the south-west. Its shadow camera is fitted to the story floor and the ground under it
  // (only that floor casts), so each shadow-map texel is small and the edges soft rather than stepped.
  sun.position.copy(world(cx - 26, cy - 34, topZ + 46)); sun.target.position.copy(world(cx, cy, f0.level));
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  {
    const eye = new OrthographicCamera(); eye.position.copy(sun.position); eye.lookAt(sun.target.position); eye.updateMatrixWorld();
    const lo = new Vector3(Infinity, Infinity, Infinity), hi = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const x of [bx[0] - 4, bx[1] + 4]) for (const y of [by[0] - 4, by[1] + 4]) for (const z of [f0.level - 0.45, f0.level + WALL_H + 0.3]) { const p = world(x, y, z).applyMatrix4(eye.matrixWorldInverse); lo.min(p); hi.max(p); }
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

  // ---- The floors: slab, core, corridors and areas, the spaces' floors, walls and glass, then the furniture.
  const roomMeshes = [], pick = new MeshBasicMaterial({ visible: false });
  const fading = [];          // the fourth floor's meshes, drawn after a depth pre-pass while it fades
  let nb = null, storyWalls = null, storyGlass = null, nbLamps = null;
  const nbLampAt = [];
  const storyFloor = D.floors.find((f) => f.id === D.story.floor);
  const L3 = storyFloor.level;
  for (const [fi, f] of D.floors.entries()) {
    const g = new Group(); root.add(g); floorGroups.set(f.id, g);
    const L = f.level, isStory = f.id === D.story.floor, fade = !isStory;
    const lit = { cast: isStory, receive: isStory };
    const M = (token, o = {}) => mk(o.kind ?? 'lambert', token, { floor: f.id, fade, ...o });
    const rooms = D.rooms.filter((x) => x.f === f.id);

    // Slab, core, corridors, areas.
    bake(g, [prism(f.outline, L - 0.4, L)], M('--in-slab'), lit);
    const core = [], wc = [], corr = [], rug = [], town = [];
    for (const c of f.core) (c.kind === 'toilets' ? wc : core).push(boxG(c.r[0], c.r[1], L, c.r[2], c.r[3], L + (c.flat ? 0.02 : CORE_H)));
    for (const r of f.corr) corr.push(boxG(r[0], r[1], L, r[2], r[3], L + 0.015));
    for (const a of f.areas) (a.k === 'town-hall' ? town : rug).push(boxG(a.r[0], a.r[1], L, a.r[2], a.r[3], L + 0.012));
    bake(g, core, M('--in-core'), lit); bake(g, wc, M('--in-wc'), lit);
    const corrMat = M('--in-corr');
    bake(g, corr, corrMat, { receive: isStory }); bake(g, rug, M('--in-rug'), { receive: isStory }); bake(g, town, M('--in-town'), { receive: isStory });

    // The spaces' floors (the story room's on its own, for its tint), an invisible volume to point at, a ring above.
    const floorMat = M('--in-room-floor'), sharedMat = M('--in-corr');
    const plates = { floor: [], shared: [], corr: [] };
    for (const r of rooms) {
      const fault = r.id === D.story.room, [x0, y0, x1, y1] = r.r;
      const kind = ['reception', 'pantry', 'print', 'comms', 'store'].includes(r.k) ? 'shared' : r.bank ? 'corr' : 'floor';
      const mat = fault ? M('--in-room-floor') : kind === 'shared' ? sharedMat : kind === 'corr' ? corrMat : floorMat;
      const plate = boxG(x0, y0, L, x1, y1, L + (r.bank ? 0.02 : 0.03));
      if (fault) bake(g, [plate], mat, { receive: isStory }); else plates[kind].push(plate);
      const vol = volume(g, [x0, y0, L], [x1, y1, L + (r.bank ? 0.8 : WALL_H)], pick); vol.userData.room = r; roomMeshes.push(vol);
      const centre = [(x0 + x1) / 2, (y0 + y1) / 2], top = L + (r.bank ? 1.1 : WALL_H) + 0.55;
      const rg = ring(g, new Vector3(centre[0], centre[1], top), { px: fault ? 19 : 13, fault });
      roomObj.set(r.id, { r, m: vol, mat, ring: rg, centre: new Vector3(centre[0], centre[1], L + 1.0), top: new Vector3(centre[0], centre[1], top), fault, area: (x1 - x0) * (y1 - y0), L });
    }
    bake(g, plates.floor, floorMat, { receive: isStory }); bake(g, plates.shared, sharedMat, { receive: isStory }); bake(g, plates.corr, corrMat, { receive: isStory });

    // Walls. The story room's own (its side walls, its feature wall, its corridor glass) are kept apart so the space
    // level can cut them: the glass drops away and the side walls lower to a clean section.
    const W = { paint: [], feature: [], cap: [], glass: [], band: [], rail: [] };
    const SW = { paint: [], cap: [], feature: [], fcap: [], glass: [], band: [], rail: [] };
    const box = (s, t, z0, z1) => (s.ax === 'x' ? boxG(s.a, s.c - t / 2, z0, s.b, s.c + t / 2, z1) : boxG(s.c - t / 2, s.a, z0, s.c + t / 2, s.b, z1));
    for (const s of wallPlan(f, rooms)) {
      const mine = isStory && s.rooms.includes(D.story.room);
      const z = mine ? 0 : L;   // the story room's walls are built from 0 inside a group raised to the floor
      if (s.kind === 'glass') {
        const to = mine ? SW : W;
        to.glass.push(box(s, T_GLASS, z, z + BAND[0]), box(s, T_GLASS, z + BAND[1], z + WALL_H - RAIL));
        to.band.push(box(s, T_GLASS, z + BAND[0], z + BAND[1]));
        to.rail.push(box(s, RAIL, z + WALL_H - RAIL, z + WALL_H));
      } else if (mine && s.feature) { SW.feature.push(box(s, T_WALL, z, z + WALL_H)); SW.fcap.push(box(s, T_WALL, z + WALL_H, z + WALL_H + CAP)); }
      else if (mine) { SW.paint.push(box(s, T_WALL, z, z + WALL_H)); SW.cap.push(box(s, T_WALL, z + WALL_H, z + WALL_H + CAP)); }
      else { (s.feature ? W.feature : W.paint).push(box(s, T_WALL, z, z + WALL_H)); W.cap.push(box(s, T_WALL, z + WALL_H, z + WALL_H + CAP)); }
    }
    const paintMat = M('--in-wall'), featureMat = M('--in-feature'), capMat = M('--in-cap'), railMat = M('--in-frame', { derive: (t) => t.c['--in-frame'].clone().lerp(t.c['--in-cap'], 0.55) });
    const glassMat = M('--in-glass', { kind: 'basic', base: T.n['--in-glass-a'], glass: 'clear' });
    const bandMat = M('--in-glass', { kind: 'basic', base: Math.min(0.78, T.n['--in-glass-a'] * 2.4), glass: 'band', derive: (t) => t.c['--in-glass'].clone().lerp(t.c['--in-cream'], 0.55) });
    const glassOrder = fade ? 12 : 2;
    bake(g, W.paint, paintMat, lit); bake(g, W.feature, featureMat, lit); bake(g, W.cap, capMat, lit); bake(g, W.rail, railMat, lit);
    bake(g, W.glass, glassMat, { order: glassOrder }); bake(g, W.band, bandMat, { order: glassOrder + 1 });
    if (isStory) {
      storyWalls = new Group(); storyWalls.position.z = L; g.add(storyWalls);
      const feat = new Group(); feat.position.z = L; g.add(feat);
      storyGlass = new Group(); storyGlass.position.z = L; g.add(storyGlass);
      bake(storyWalls, SW.paint, paintMat, lit); bake(storyWalls, SW.cap, capMat, lit);
      bake(feat, SW.feature, featureMat, lit); bake(feat, SW.fcap, capMat, lit);
      bake(storyGlass, SW.glass, glassMat, { order: glassOrder }); bake(storyGlass, SW.band, bandMat, { order: glassOrder + 1 }); bake(storyGlass, SW.rail, railMat, lit);
    }

    // Furniture: the room drawings (HeroZoom), then desk banks, lounges, cafés and the town hall made here. One merged
    // mesh per material: the story room's apart (always whole), the rest of its floor together (they empty to the
    // floor at the space level: flattened and faded towards the floor's tone).
    const put = (to, mi, geo) => { (to[mi] ??= []).push(geo); };
    const own = [], rest = [];
    for (const b of D.furn) {
      if (b[0] !== fi) continue;
      const pts = []; for (let i = 5; i < b.length; i += 2) pts.push([b[i], b[i + 1]]);
      put(b[2] && isStory ? own : rest, b[1], prism(pts, b[3], b[4]));
    }
    const bx6 = (mi, x0, y0, z0, x1, y1, z1) => put(rest, mi, boxG(x0, y0, z0, x1, y1, z1));
    // Desk banks: an oak desk, a chair on the person's side, a dark monitor with a lit screen facing them.
    for (const r of rooms.filter((x) => x.bank)) for (const d of r.desks ?? []) {
      const [x, y, mx, my] = d, dx = Math.sign(mx - x), dy = Math.sign(my - y);
      bx6(1, x - 0.72, y - 0.36, L + 0.7, x + 0.72, y + 0.36, L + 0.735);
      const along = dy !== 0, mw = 0.56, md = 0.035, mz0 = L + 0.86, mz1 = L + 1.19;
      const mb = along ? [mx - mw / 2, my - md / 2, mz0, mx + mw / 2, my + md / 2, mz1] : [mx - md / 2, my - mw / 2, mz0, mx + md / 2, my + mw / 2, mz1];
      bx6(5, ...mb);
      const s = 0.012, sm = 0.02;
      bx6(6, ...(along ? [mx - mw / 2 + sm, my - dy * (md / 2 + s), mz0 + sm, mx + mw / 2 - sm, my - dy * (md / 2), mz1 - sm] : [mx - dx * (md / 2 + s), my - mw / 2 + sm, mz0 + sm, mx - dx * (md / 2), my + mw / 2 - sm, mz1 - sm]));
      const chx = x - dx * 0.62, chy = y - dy * 0.62;
      bx6(2, chx - 0.24, chy - 0.24, L + 0.4, chx + 0.24, chy + 0.24, L + 0.46);
      bx6(2, chx - 0.22 - dx * 0.2, chy - 0.22 - dy * 0.2, L + 0.46, chx + 0.22 - dx * 0.2, chy + 0.22 - dy * 0.2, L + 0.92);
    }
    const plant = (x, y, s = 1) => { put(rest, 10, placed(POT, x, y, L + 0.21 * s, 0.4 * s, 0.4 * s, 0.42 * s)); put(rest, 9, placed(LEAF, x, y, L + 0.9 * s, 0.72 * s, 0.72 * s, 0.7 * s)); };
    for (const a of f.areas) {
      const [x0, y0, x1, y1] = a.r, w = x1 - x0, d = y1 - y0, ax = (x0 + x1) / 2, ay = (y0 + y1) / 2;
      if (a.k === 'town-hall') {
        for (let i = 0; i < 2; i++) for (let j = 0; j < 5; j++) { const x = x0 + 3.4 + j * 1.3, y = y0 + 2.2 + i * 1.3; if (x < x1 - 1.2 && y < y1 - 0.8) { bx6(2, x - 0.22, y - 0.22, L + 0.42, x + 0.22, y + 0.22, L + 0.47); bx6(2, x - 0.22, y - 0.28, L + 0.47, x + 0.22, y - 0.22, L + 0.88); } }
        plant(x1 - 0.8, y0 + 0.8, 1.3);
        continue;
      }
      if (w >= 5.5 && d >= 5.5) {
        // Lounge: a sofa, two armchairs (the one accent tone), a round walnut table, a plant.
        bx6(4, ax - 1.0, ay - 1.3, L + 0.15, ax + 1.0, ay - 0.5, L + 0.45); bx6(4, ax - 1.0, ay - 1.3, L + 0.45, ax + 1.0, ay - 1.1, L + 0.82);
        for (const sx of [-1, 1]) { bx6(3, ax + sx * 0.65, ay + 0.2, L + 0.15, ax + sx * 1.35, ay + 0.9, L + 0.45); bx6(3, ax + sx * 0.65, ay + 0.75, L + 0.45, ax + sx * 1.35, ay + 0.9, L + 0.78); }
        put(rest, 0, placed(POT, ax, ay, L + 0.2, 0.9, 0.7, 0.4));
        plant(x0 + 0.7, y1 - 0.7, 1.2);
      } else if (w >= 3 && d >= 3) {
        // Two café tables with stools.
        for (const [tx, ty] of [[ax - 1.2, ay], [ax + 1.2, ay]]) { put(rest, 0, placed(POT, tx, ty, L + 0.37, 0.8, 0.8, 0.74)); for (const [sx, sy] of [[-0.7, 0], [0.7, 0], [0, 0.7]]) bx6(2, tx + sx - 0.17, ty + sy - 0.17, L + 0.42, tx + sx + 0.17, ty + sy + 0.17, L + 0.46); }
      }
    }
    // The pendants: a soft, low-contrast disc over each meeting table.
    const lampMat = M('--in-lamp', { derive: (t) => t.c['--in-lamp'].clone().lerp(t.c['--in-wall'], 0.5), emissive: 0.28 });
    const lampGeo = new CylinderGeometry(0.3, 0.3, 0.025, 28); lampGeo.rotateX(Math.PI / 2); owned.push(lampGeo);
    const lamps = rooms.filter((x) => !x.bank && ['meeting', 'small'].includes(x.k)).map((r) => [(r.r[0] + r.r[2]) / 2, (r.r[1] + r.r[3]) / 2, L + 2.08, r.id]);
    const furnMats = (nbMat) => FURN.map((token, i) => (i === LIT ? M(token, { kind: 'basic', nb: nbMat }) : M(token, { nb: nbMat })));
    if (isStory) {
      const ownMats = furnMats(false), restMats = furnMats(true);
      nb = new Group(); g.add(nb);
      for (const [i, list] of own.entries()) if (list) bake(g, list, ownMats[i], { cast: i !== LIT, receive: i !== LIT });
      for (const [i, list] of rest.entries()) if (list) bake(nb, list, restMats[i], { cast: i !== LIT, receive: i !== LIT });
      const mine = lamps.filter((l) => l[3] === D.story.room), others = lamps.filter((l) => l[3] !== D.story.room);
      bake(g, mine.map(([x, y, z]) => lampGeo.clone().translate(x, y, z)), lampMat);
      nbLamps = new InstancedMesh(lampGeo, lampMat, Math.max(1, others.length)); nbLamps.count = others.length; g.add(nbLamps);
      nbLampAt.push(...others.map(([x, y, z]) => new Vector3(x, y, z)));
    } else {
      const fm = furnMats(false);
      for (const [i, list] of rest.entries()) if (list) bake(g, list, fm[i]);
      bake(g, lamps.map(([x, y, z]) => lampGeo.clone().translate(x, y, z)), lampMat);
    }
    if (fade) g.traverse((o) => { if (o.isMesh && o.material !== pick && !o.material.userData.e?.glass && o.renderOrder < 30) fading.push(o); });
  }
  // The fading floor: a depth-only twin of each mesh draws first, so only the floor's nearest surface is blended.
  const depthOnly = new MeshBasicMaterial({ colorWrite: false, transparent: true });
  for (const o of fading) { const t = new Mesh(o.geometry, depthOnly); t.position.copy(o.position); t.scale.copy(o.scale); t.renderOrder = 10; o.renderOrder = 11; o.parent.add(t); }
  const m4 = new Matrix4(), q0 = new Quaternion(), s3 = new Vector3();
  const placeLamps = (k) => { if (!nbLamps) return; const s = Math.max(0.0001, 1 - k); nbLampAt.forEach((p, i) => nbLamps.setMatrixAt(i, m4.compose(p, q0, s3.set(s, s, s)))); nbLamps.instanceMatrix.needsUpdate = true; nbLamps.visible = s > 0.01 && nbLampAt.length > 0; };
  placeLamps(0);

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
    if (which === 'all') return { min: [bx[0], by[0], f0.level - 0.4], max: [bx[1], by[1], topZ] };
    const f = D.floors.find((x) => x.id === which);
    return { min: [bx[0], by[0], f.level - 0.4], max: [bx[1], by[1], f.level + WALL_H] };
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
  let lifted = 0, focus = 0, shadowDirty = true;
  // The fourth floor rises a little and fades out completely, then is not drawn at all.
  const setLift = (k) => { lifted = k; if (!g4) return; g4.position.z = LIFT * k; const a = Math.max(0, 1 - k * 1.3); setAlpha(D.floors[1].id, a); g4.visible = a > 0.004; };
  // The space level: the rooms beside the story room empty to their floors (furniture flattens and fades to the
  // floor's tone, pendants shrink away), the corridor glass in front of it drops, its side walls lower to the cut.
  const nbMats = mats.filter((e) => e.nb);
  const setFocus = (k) => {
    focus = k;
    const s = Math.max(0.001, 1 - k);
    if (nb) { nb.scale.z = s; nb.position.z = L3 * (1 - s); nb.visible = s > 0.004; }
    for (const e of nbMats) e.m.color.copy(colourOf(e)).lerp(T.c['--in-room-floor'], NB_TINT * k);
    placeLamps(k);
    if (storyGlass) { storyGlass.scale.z = s; storyGlass.visible = s > 0.004; }
    if (storyWalls) storyWalls.scale.z = 1 - k * (1 - CUT / WALL_H);
    shadowDirty = true;
  };
  const toward = (get, set, to, dur) => { const from = get(); if (Math.abs(from - to) < 1e-4) { set(to); return Promise.resolve(); } return animate(dur, (e) => set(from + (to - from) * e)); };
  const liftTo = (to, dur = DUR.lift) => toward(() => lifted, setLift, to, dur);
  const focusTo = (to, dur = DUR.move * 0.8) => toward(() => focus, setFocus, to, dur);
  const setRing = (r, on) => { r.on = on; r.g.visible = on > 0.004; r.back.opacity = 0.92 * on; (r.state === 'fault' ? r.hot : r.quiet).opacity = on; };
  const ringsTo = (list, to) => { for (const r of list) toward(() => r.on, (v) => setRing(r, v), to, DUR.state); };
  const breakRing = (r) => { r.state = 'fault'; r.fine.visible = false; r.broken.visible = true; r.hot.opacity = r.on; r.quiet.opacity = 0; };
  const TINT = 0.08;   // the fault room's floor: a hint of the fault colour, not a wash
  const tintRoom = (o, k) => { o.mat.color.copy(T.c['--in-room-floor']).lerp(T.c['--h-fault'], TINT * k); };
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
    if (moving || more || damping) requestRender();
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
    if (reduced) { setLift(1); setFocus(1); for (const r of rings) setRing(r, besideRings.includes(r) ? 0 : 1); ringsShown = true; breakRing(story.ring); tintRoom(story, 1); moveTo(VIEWS.space(), 0); showDevRings(true); level = 2; labels.level(2); hooks.onLevel?.(2); hooks.onBeat?.(); requestRender(); return true; }
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
    breakRing(story.ring); animate(DUR.state, (e) => tintRoom(story, e)); hooks.onBeat?.();
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
    tintRoom(story, 0); labels.level(-1);
    moveTo(VIEWS.far(), 0); level = 0; hooks.onLevel?.(0); requestRender();
  }
  // The rings are on from the start when a level is chosen before the run reaches it.
  function ringsOn() { ringsShown = true; for (const r of rings.filter((x) => !devRings.includes(x))) if (r.on < 1 && !(level === 2 && besideRings.includes(r))) setRing(r, 1); if (story.ring.state !== 'fault') { breakRing(story.ring); tintRoom(story, 1); } }

  // A look change: every material, light and opacity eases from what it shows now to the new look's value, together,
  // on one zero-bounce spring (--dur-theme; at once under reduced motion). Only colours change; nothing moves.
  let fadeLook = 0;
  function recolour() {
    T = readTokens(host);
    const faultOn = story.ring.state === 'fault' ? 1 : 0;
    const colTo = (e) => (e.m === story.mat ? T.c['--in-room-floor'].clone().lerp(T.c['--h-fault'], TINT * faultOn) : e.nb ? colourOf(e).lerp(T.c['--in-room-floor'], NB_TINT * focus) : colourOf(e));
    const jobs = [];
    const col = (c, to) => { if (to && !c.equals(to)) jobs.push({ c, a: c.clone(), b: to.clone() }); };
    const num = (get, set, to) => { const a = get(); if (Math.abs(a - to) > 1e-4) jobs.push({ get, set, a, b: to }); };
    for (const e of mats) {
      col(e.m.color, colTo(e));
      if (e.emissive) { col(e.m.emissive, T.c['--in-lamp']); num(() => e.m.emissiveIntensity, (v) => { e.m.emissiveIntensity = v; }, T.n['--in-lamp-i'] * e.emissive); }
      if (e.glass) num(() => e.base, (v) => { e.base = v; e.m.opacity = v * e.alpha; }, e.glass === 'band' ? Math.min(0.78, T.n['--in-glass-a'] * 2.4) : T.n['--in-glass-a']);
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
    dispose() {
      alive = false; ro.disconnect(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); controls.dispose(); labels.dispose();
      renderer.domElement.remove(); renderer.dispose();
      for (const e of mats) e.m.dispose();
      depthOnly.dispose(); pick.dispose(); nbLamps?.dispose();
      for (const g of owned) g.dispose();
    },
  };
}
