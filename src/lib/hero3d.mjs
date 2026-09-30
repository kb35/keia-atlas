// The front door's hero in 3D (FRONT-DOOR-V2 section 3, MOTION-V2 4.36): the demo's Dublin office as an architect's
// model, built in three.js from the building data (src/lib/floors.mjs) and the room drawings (src/lib/room3d.mjs),
// with the devices as health rings in space and each level's answer written over it (src/lib/hero-labels.mjs).
// Loaded by HeroZoom.astro after first paint, only where the screen is wide and WebGL draws, so the static first
// frame (an SVG of the same building) is what a visitor sees first and what a phone keeps.
//
// The look is the office itself, not the UI: floors, tables, chairs, walls, glass meeting rooms in thin frames,
// plants, pendants, one sun casting soft shadows. Every material and light is a --in-* token from the interior
// palette (src/lib/interior-palette.mjs: per look, light and dark), read again when the look changes and eased
// there over --dur-theme, colours only, so the geometry never pops. Health is only ever the look's own --h-fine and
// --h-fault, never mixed with a material.
//
// The sequence runs, settles on its end frame, and HeroZoom's loop holds it, cross-fades and runs it again:
//   1  a beat on the building, then a slow dolly in with a slight turn
//   2  the fourth floor lifts away and fades while the camera settles over the third; the spaces are named
//   3  every space's ring comes on in turn; one breaks, once; the heartbeat appears
//   4  the camera eases into 3.09 Whooper Swan; its devices come on in turn, named; the video bar's ring breaks
// Every camera move is one critically damped spring (src/lib/spring.mjs) started from wherever the camera is, so
// the level strip, a click on a space or a drag can take over mid-move without a jump (and ends the loop). The scene
// draws only while something moves. Reduced motion: the final frame, still and labelled, every level a click away.
// run() resolves true when it reached its end frame, false when something took over; reset() puts the scene back
// to the frame run() starts from (drawn under HeroZoom's cross-fade, so it is never seen jumping).
//
//   mountHero(host, D, hooks, opts)  builds the scene in `host`, returns { run, go, goRoom, dispose, recolour, ... }
//   D                                { site, floors, rooms, furn, people, story } from HeroZoom.astro (inline JSON)
//   hooks                            { onReady(), onLevel(i, room?), onHover(o | null), onPick(room, go), onTouch(), onFrame(project), onBeat() }
//   opts                             { labels: the element the labels are written into }
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, InstancedMesh, LineSegments, BoxGeometry, EdgesGeometry, ExtrudeGeometry, Shape,
  RingGeometry, CircleGeometry, CylinderGeometry, SphereGeometry, PlaneGeometry, MeshLambertMaterial, MeshBasicMaterial, LineBasicMaterial,
  ShadowMaterial, HemisphereLight, DirectionalLight, AmbientLight, Color, Vector2, Vector3, Spherical, Raycaster, CanvasTexture, SRGBColorSpace,
  Quaternion, Matrix4, PCFShadowMap,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { spring } from './spring.mjs';
import { createLabels } from './hero-labels.mjs';
import { clock } from './front-loop.mjs';

// The interior palette and the lights (HeroZoom.astro sets them on .hz, light and dark), plus the two health colours.
const TOKENS = ['--in-slab', '--in-room-floor', '--in-corr', '--in-rug', '--in-town', '--in-wall', '--in-core', '--in-wc', '--in-glass', '--in-frame',
  '--in-wood', '--in-oak', '--in-chair', '--in-chair-2', '--in-sofa', '--in-dev', '--in-screen', '--in-cream', '--in-leg', '--in-leaf', '--in-pot',
  '--in-lamp', '--hz-edge', '--hz-ground', '--in-sun', '--in-sky', '--in-bounce', '--h-fine', '--h-fault', '--surface'];
const NUMBERS = { '--in-sun-i': 1.5, '--in-sky-i': 1.3, '--in-amb-i': 0.3, '--in-lamp-i': 0.6, '--in-glass-a': 0.28, '--in-shadow-a': 0.35 };
// Furniture materials, by the index HeroZoom writes for each box (the room drawings' materials, grouped).
const FURN = ['--in-wood', '--in-oak', '--in-chair', '--in-chair-2', '--in-sofa', '--in-dev', '--in-screen', '--in-cream', '--in-leg', '--in-leaf', '--in-pot'];
const WALL_H = 2.4, LIFT = 6.5;
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

export function mountHero(host, D, hooks = {}, opts = {}) {
  const cs = getComputedStyle(host);
  const reduced = (window.rsReducedNow ? window.rsReducedNow() : matchMedia('(prefers-reduced-motion: reduce)').matches);
  const DUR = { theme: ms(cs, '--dur-theme', 360), move: ms(cs, '--dur-hero-move', 1800), hold: ms(cs, '--dur-hero-hold', 700), state: ms(cs, '--dur-state', 300), stagger: ms(cs, '--stagger', 24), lift: ms(cs, '--dur-hero-lift', 1400) };
  let T = readTokens(host);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.className = 'hz-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 16 / 10, 0.5, 600);
  const root = new Group(); root.rotation.x = -Math.PI / 2; scene.add(root);   // plan metres, z up

  // ---- Light: a warm sky, a little bounce from the floor, one sun with soft shadows, a cool fill from the other side.
  const sky = new HemisphereLight(T.c['--in-sky'], T.c['--in-bounce'], T.n['--in-sky-i']); scene.add(sky);
  const amb = new AmbientLight(T.c['--in-sky'], T.n['--in-amb-i']); scene.add(amb);
  const sun = new DirectionalLight(T.c['--in-sun'], T.n['--in-sun-i']); scene.add(sun); scene.add(sun.target);
  const fill = new DirectionalLight(0xffffff, 0.3); fill.position.set(70, 30, -40); scene.add(fill);

  // ---- Materials, per floor so a floor can lift away and fade.
  const mats = [];
  const mk = (kind, token, base = 1, floor = null, x = {}) => {
    const col = T.c[token] ?? new Color(token);
    const m = kind === 'line' ? new LineBasicMaterial({ color: col }) : kind === 'basic' ? new MeshBasicMaterial({ color: col }) : kind === 'shadow' ? new ShadowMaterial({ color: col }) : new MeshLambertMaterial({ color: col });
    m.transparent = true; m.opacity = base;
    if (x.depthWrite === false) m.depthWrite = false;
    if (x.emissive) { m.emissive = col.clone(); m.emissiveIntensity = T.n['--in-lamp-i'] * (x.emissive === true ? 1 : x.emissive); }
    const e = { m, token, base, floor, alpha: 1, x }; mats.push(e); m.userData.e = e; return m;
  };
  const setAlpha = (floor, a) => { for (const e of mats) if (e.floor === floor) { e.alpha = a; e.m.opacity = e.base * a; e.m.visible = e.m.opacity > 0.004; } };

  const unitBox = new BoxGeometry(1, 1, 1), unitEdges = new EdgesGeometry(unitBox);
  const cyl = new CylinderGeometry(0.5, 0.5, 1, 14); cyl.rotateX(Math.PI / 2);   // axis up, in plan coordinates
  const ball = new SphereGeometry(0.5, 12, 8);
  const box = (parent, [x0, y0, z0], [x1, y1, z1], mat, edgeMat, shadow = true) => {
    const m = new Mesh(unitBox, mat); m.scale.set(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), Math.max(0.001, z1 - z0)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(m);
    if (shadow) { m.castShadow = true; m.receiveShadow = true; }
    if (edgeMat) { const l = new LineSegments(unitEdges, edgeMat); l.scale.copy(m.scale); l.position.copy(m.position); parent.add(l); }
    return m;
  };
  // Many boxes of one material as one draw call.
  const m4 = new Matrix4(), q0 = new Quaternion(), v3a = new Vector3(), v3b = new Vector3();
  const instanced = (parent, list, mat, geo = unitBox, { cast = true, receive = true } = {}) => {
    if (!list.length) return null;
    const im = new InstancedMesh(geo, mat, list.length);
    list.forEach((b, i) => { m4.compose(v3a.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2), q0, v3b.set(Math.max(0.01, b[3] - b[0]), Math.max(0.01, b[4] - b[1]), Math.max(0.01, b[5] - b[2]))); im.setMatrixAt(i, m4); });
    im.castShadow = cast; im.receiveShadow = receive; parent.add(im); return im;
  };

  // ---- The building's footprint and the ground it stands on.
  const f0 = D.floors[0], xs = f0.outline.map((p) => p[0]), ys = f0.outline.map((p) => p[1]);
  const bx = [Math.min(...xs), Math.max(...xs)], by = [Math.min(...ys), Math.max(...ys)];
  const cx = (bx[0] + bx[1]) / 2, cy = (by[0] + by[1]) / 2;
  const topZ = Math.max(...D.floors.map((f) => f.level)) + WALL_H;
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new CanvasTexture(c);
    const glow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: T.c['--hz-ground'], opacity: T.a['--hz-ground'] }));
    glow.scale.set((bx[1] - bx[0]) * 1.5, (by[1] - by[0]) * 2.2, 1); glow.position.set(cx + 2, cy - 2, f0.level - 0.62); root.add(glow); glow.userData.ground = true;
    // The model's contact shadow: the sun's shadow of the building on an invisible ground just under it.
    const gnd = new Mesh(new PlaneGeometry(1, 1), mk('shadow', '--hz-ground', T.n['--in-shadow-a'], null, { depthWrite: false }));
    gnd.scale.set((bx[1] - bx[0]) * 3, (by[1] - by[0]) * 4, 1); gnd.position.set(cx, cy, f0.level - 0.6); gnd.receiveShadow = true; root.add(gnd);
  }
  // The sun stands high to the south-west; its shadow camera covers the whole model.
  sun.position.copy(world(cx - 26, cy - 34, topZ + 46)); sun.target.position.copy(world(cx, cy, f0.level));
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 10; sun.shadow.camera.far = 160;
  sun.shadow.camera.left = -34; sun.shadow.camera.right = 34; sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 5;

  // ---- Health rings: a billboard the size of a glyph on screen, on a small light disc so it reads on any floor.
  const floorGroups = new Map(), roomObj = new Map(), rings = [];
  const ringGeo = new RingGeometry(0.72, 1, 48), dotGeo = new CircleGeometry(0.24, 16), discGeo = new CircleGeometry(1.28, 32);
  const arcA = new RingGeometry(0.68, 1, 20, 1, -Math.PI / 3, (2 * Math.PI) / 3), arcB = new RingGeometry(0.68, 1, 20, 1, (2 * Math.PI) / 3, (2 * Math.PI) / 3);
  const ring = (parent, at, { px = 13, fault = false, floor = null } = {}) => {
    const g = new Group(); g.position.copy(at); parent.add(g);
    const back = mk('basic', '--surface', 0.92, floor, { depthWrite: false }), fine = mk('basic', '--h-fine', 1, floor), hot = mk('basic', '--h-fault', 1, floor);
    const disc = new Mesh(discGeo, back); disc.position.z = -0.01; disc.renderOrder = 5; g.add(disc);
    const ok = new Mesh(ringGeo, fine); ok.renderOrder = 6; g.add(ok);
    let broken = null;
    if (fault) { broken = new Group(); broken.add(new Mesh(arcA, hot), new Mesh(arcB, hot), new Mesh(dotGeo, hot)); broken.children.forEach((m) => { m.renderOrder = 6; }); broken.visible = false; g.add(broken); }
    const r = { g, fine: ok, broken, back, quiet: fine, hot, px, on: 0, state: 'fine' };
    fine.opacity = 0; hot.opacity = 0; back.opacity = 0; g.visible = false;
    rings.push(r); return r;
  };

  // ---- The floors: slab, core, corridors and areas, then the spaces as glass rooms with their furniture.
  const roomMeshes = [];
  const areaKind = (a) => (a.k === 'town-hall' ? '--in-town' : '--in-rug');
  for (const [fi, f] of D.floors.entries()) {
    const g = new Group(); root.add(g); floorGroups.set(f.id, g);
    const L = f.level, later = fi > 0;
    const shape = new Shape(f.outline.map(([x, y]) => new Vector2(x, y)));
    const slabG = new ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }); slabG.translate(0, 0, L - 0.4);
    const slab = new Mesh(slabG, mk('lambert', '--in-slab', 1, f.id)); slab.receiveShadow = true; slab.castShadow = !later; g.add(slab);
    g.add(new LineSegments(new EdgesGeometry(slabG), mk('line', '--hz-edge', 1, f.id)));
    const coreMat = mk('lambert', '--in-core', 1, f.id), wcMat = mk('lambert', '--in-wc', 1, f.id), corrMat = mk('lambert', '--in-corr', 1, f.id);
    const rugMat = mk('lambert', '--in-rug', 1, f.id), townMat = mk('lambert', '--in-town', 1, f.id), edge = mk('line', '--hz-edge', 0.7, f.id);
    for (const c of f.core) { const m = box(g, [c.r[0], c.r[1], L], [c.r[2], c.r[3], L + (c.flat ? 0.02 : WALL_H)], c.kind === 'toilets' ? wcMat : coreMat, c.flat ? null : edge); if (c.flat) m.castShadow = false; }
    for (const r of f.corr) box(g, [r[0], r[1], L], [r[2], r[3], L + 0.015], corrMat, null, false).receiveShadow = true;
    for (const a of f.areas) box(g, [a.r[0], a.r[1], L], [a.r[2], a.r[3], L + 0.012], areaKind(a) === '--in-town' ? townMat : rugMat, null, false).receiveShadow = true;

    // Spaces: a floor plate in the room's tone, walls of glass in a thin dark frame (or solid for the back rooms),
    // an invisible volume to point at, and a ring above.
    const glass = [], frame = [], solid = [], plates = [];
    const pick = new MeshBasicMaterial({ visible: false });
    const floorMat = mk('lambert', '--in-room-floor', 1, f.id), sharedMat = mk('lambert', '--in-corr', 1, f.id);
    for (const r of D.rooms.filter((x) => x.f === f.id)) {
      const fault = r.id === D.story.room, [x0, y0, x1, y1] = r.r;
      const mat = fault ? mk('lambert', '--in-room-floor', 1, f.id) : ['reception', 'pantry', 'print', 'comms', 'store'].includes(r.k) ? sharedMat : r.bank ? corrMat : floorMat;
      const plate = box(g, [x0, y0, L], [x1, y1, L + (r.bank ? 0.02 : 0.03)], mat, null, false); plate.receiveShadow = true;
      if (!r.bank) plates.push(plate);
      const t = 0.045, wallH = r.w === 'solid' ? WALL_H : WALL_H;
      if (r.w === 'glass') {
        glass.push([x0, y0, L, x1, y0 + t, L + wallH], [x0, y1 - t, L, x1, y1, L + wallH], [x0, y0, L, x0 + t, y1, L + wallH], [x1 - t, y0, L, x1, y1, L + wallH]);
        const p = 0.05;
        for (const [px, py] of [[x0, y0], [x1 - p, y0], [x0, y1 - p], [x1 - p, y1 - p]]) frame.push([px, py, L, px + p, py + p, L + wallH]);
        frame.push([x0, y0, L + wallH - p, x1, y0 + p, L + wallH], [x0, y1 - p, L + wallH - p, x1, y1, L + wallH], [x0, y0, L + wallH - p, x0 + p, y1, L + wallH], [x1 - p, y0, L + wallH - p, x1, y1, L + wallH]);
      } else if (r.w === 'solid') {
        solid.push([x0, y0, L, x1, y0 + 0.12, L + wallH], [x0, y1 - 0.12, L, x1, y1, L + wallH], [x0, y0, L, x0 + 0.12, y1, L + wallH], [x1 - 0.12, y0, L, x1, y1, L + wallH]);
      }
      // The volume to point at (not drawn).
      const vol = box(g, [x0, y0, L], [x1, y1, L + (r.bank ? 0.8 : wallH)], pick, null, false); vol.userData.room = r; roomMeshes.push(vol);
      const centre = [(x0 + x1) / 2, (y0 + y1) / 2], top = L + (r.bank ? 1.1 : wallH) + 0.55;
      const rg = ring(g, new Vector3(centre[0], centre[1], top), { px: fault ? 19 : 13, fault, floor: f.id });
      roomObj.set(r.id, { r, m: vol, mat, ring: rg, centre: new Vector3(centre[0], centre[1], L + 1.0), top: new Vector3(centre[0], centre[1], top), fault, area: (x1 - x0) * (y1 - y0) });
    }
    instanced(g, glass, mk('lambert', '--in-glass', T.n['--in-glass-a'], f.id, { depthWrite: false }), unitBox, { cast: false, receive: false }).renderOrder = 4;
    instanced(g, frame, mk('lambert', '--in-frame', 1, f.id));
    instanced(g, solid, mk('lambert', '--in-wall', 1, f.id));

    // Furniture from the room drawings (one instanced mesh per material), lit screens unlit so they glow a little.
    const byMat = FURN.map(() => []);
    for (const b of D.furn) if (b[0] === fi) byMat[b[1]].push(b.slice(2));
    // Desk banks: an oak desk, a chair on the person's side, a dark monitor with a lit screen facing them.
    for (const r of D.rooms.filter((x) => x.f === f.id && x.bank)) for (const d of r.desks ?? []) {
      const [x, y, mx, my] = d, dx = Math.sign(mx - x), dy = Math.sign(my - y);
      byMat[1].push([x - 0.72, y - 0.36, L + 0.7, x + 0.72, y + 0.36, L + 0.735]);
      byMat[8].push([x - 0.66, y - 0.3, L, x - 0.62, y - 0.26, L + 0.7], [x + 0.62, y + 0.26, L, x + 0.66, y + 0.3, L + 0.7]);
      const along = dy !== 0;   // the monitor sits across the desk's long side
      const mw = 0.56, md = 0.035, mz0 = L + 0.86, mz1 = L + 1.19;
      const mb = along ? [mx - mw / 2, my - md / 2, mz0, mx + mw / 2, my + md / 2, mz1] : [mx - md / 2, my - mw / 2, mz0, mx + md / 2, my + mw / 2, mz1];
      byMat[5].push(mb, [x - 0.06, y - 0.06, L + 0.735, x + 0.06, y + 0.06, L + 0.88]);
      const s = 0.012, sm = 0.02;
      byMat[6].push(along ? [mx - mw / 2 + sm, my - dy * (md / 2 + s), mz0 + sm, mx + mw / 2 - sm, my - dy * (md / 2 - 0.001), mz1 - sm] : [mx - dx * (md / 2 + s), my - mw / 2 + sm, mz0 + sm, mx - dx * (md / 2 - 0.001), my + mw / 2 - sm, mz1 - sm]);
      const chx = x - dx * 0.62, chy = y - dy * 0.62;
      byMat[(Math.round(x + y) % 3 === 0) ? 3 : 2].push([chx - 0.24, chy - 0.24, L + 0.4, chx + 0.24, chy + 0.24, L + 0.46], [chx - 0.22 - dx * 0.2, chy - 0.22 - dy * 0.2, L + 0.46, chx + 0.22 - dx * 0.2, chy + 0.22 - dy * 0.2, L + 0.92]);
    }
    // Lounge corners and plants in the open areas; rows of chairs in the town hall; a pendant over each meeting table.
    const plants = [], pots = [], pendants = [];
    const plant = (x, y, s = 1) => { pots.push([x - 0.2 * s, y - 0.2 * s, L, x + 0.2 * s, y + 0.2 * s, L + 0.42 * s]); plants.push([x - 0.36 * s, y - 0.36 * s, L + 0.55 * s, x + 0.36 * s, y + 0.36 * s, L + 1.25 * s]); };
    for (const a of f.areas) {
      const [x0, y0, x1, y1] = a.r, w = x1 - x0, d = y1 - y0, ax = (x0 + x1) / 2, ay = (y0 + y1) / 2;
      if (a.k === 'town-hall') {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 7; j++) { const x = x0 + 2.2 + j * 1.05, y = y0 + 1.6 + i * 1.05; if (x < x1 - 1.2 && y < y1 - 0.8) byMat[j % 3 === 1 ? 3 : 2].push([x - 0.22, y - 0.22, L + 0.42, x + 0.22, y + 0.22, L + 0.47], [x - 0.22, y - 0.28, L + 0.47, x + 0.22, y - 0.22, L + 0.88]); }
        byMat[5].push([x0 + 0.1, y0 + 0.6, L + 1.0, x0 + 0.16, y0 + 3.0, L + 2.3]); byMat[6].push([x0 + 0.16, y0 + 0.66, L + 1.06, x0 + 0.17, y0 + 2.94, L + 2.24]);
        plant(x1 - 0.8, y0 + 0.8, 1.3); plant(x0 + 0.8, y1 - 0.8, 1.1);
        continue;
      }
      if (w >= 5.5 && d >= 5.5) {
        // Lounge: a sofa, two chairs, a round walnut table, a plant.
        byMat[4].push([ax - 1.0, ay - 1.3, L + 0.15, ax + 1.0, ay - 0.5, L + 0.45], [ax - 1.0, ay - 1.3, L + 0.45, ax + 1.0, ay - 1.1, L + 0.82]);
        byMat[2].push([ax - 1.35, ay + 0.2, L + 0.15, ax - 0.65, ay + 0.9, L + 0.45], [ax - 1.35, ay + 0.75, L + 0.45, ax - 0.65, ay + 0.9, L + 0.78]);
        byMat[3].push([ax + 0.65, ay + 0.2, L + 0.15, ax + 1.35, ay + 0.9, L + 0.45], [ax + 0.65, ay + 0.75, L + 0.45, ax + 1.35, ay + 0.9, L + 0.78]);
        byMat[0].push([ax - 0.45, ay - 0.35, L + 0.38, ax + 0.45, ay + 0.35, L + 0.42]); byMat[8].push([ax - 0.05, ay - 0.05, L, ax + 0.05, ay + 0.05, L + 0.38]);
        plant(x0 + 0.7, y1 - 0.7, 1.2); plant(x1 - 0.7, y0 + 0.7, 1.0);
      } else if (w >= 3 && d >= 3) {
        // Two café tables with stools, and a plant.
        for (const [tx, ty] of [[ax - 1.2, ay], [ax + 1.2, ay]]) { byMat[0].push([tx - 0.4, ty - 0.4, L + 0.7, tx + 0.4, ty + 0.4, L + 0.74]); byMat[8].push([tx - 0.04, ty - 0.04, L, tx + 0.04, ty + 0.04, L + 0.7]); for (const [sx, sy] of [[-0.7, 0], [0.7, 0], [0, 0.7]]) byMat[3].push([tx + sx - 0.17, ty + sy - 0.17, L + 0.42, tx + sx + 0.17, ty + sy + 0.17, L + 0.46]); }
        plant(x1 - 0.6, y1 - 0.6, 1.0);
      }
    }
    for (const r of D.rooms.filter((x) => x.f === f.id && !x.bank && ['meeting', 'small'].includes(x.k))) {
      const [x0, y0, x1, y1] = r.r; pendants.push([(x0 + x1) / 2 - 0.24, (y0 + y1) / 2 - 0.24, L + 2.0, (x0 + x1) / 2 + 0.24, (y0 + y1) / 2 + 0.24, L + 2.08]);
    }
    byMat[9].push(...plants); byMat[10].push(...pots);
    FURN.forEach((token, i) => {
      if (!byMat[i].length) return;
      const lit = i === 6, mat = lit ? mk('basic', token, 1, f.id) : mk('lambert', token, 1, f.id, i === 9 ? {} : {});
      instanced(g, byMat[i], mat, i === 9 ? ball : i === 10 ? cyl : unitBox, { cast: i !== 6, receive: !lit });
    });
    instanced(g, pendants, mk('lambert', '--in-lamp', 1, f.id, { emissive: true }), cyl, { cast: false, receive: false });
  }
  // The story's devices, as rings where they are in the space (shown once the camera is in the room).
  const storyFloor = floorGroups.get(D.story.floor);
  const devRings = D.story.devices.map((d) => {
    const rg = ring(storyFloor, new Vector3(...d.at), { px: d.fault ? 18 : 12, fault: !!d.fault, floor: D.story.floor });
    rg.g.userData.dev = d; return rg;
  });
  const story = roomObj.get(D.story.room);

  // ---- Words over the scene: each level's answer, where the thing is.
  const labels = createLabels(opts.labels ?? host, { reduced });
  const at3 = (o) => { const p = new Vector3(); o.getWorldPosition(p); return p; };
  const ringPx = (r) => r.px * 0.5 + 8;
  labels.add({ id: 'site', level: 0, cls: 'hz-lab-site', text: D.site.name, sub: D.site.line, at: () => world(cx, by[1] + 1.5, topZ + 2.2), priority: 20, dy: 8 });
  for (const f of D.floors) labels.add({ id: `floor-${f.id}`, level: 0, cls: 'hz-lab-floor', text: f.name, at: () => at3(floorGroups.get(f.id)).add(world(bx[0] - 1.2, by[0] - 0.4, f.level + 0.2)), priority: 6, dy: -6 });
  for (const o of roomObj.values()) {
    if (o.r.f !== D.story.floor) continue;
    const small = o.area < 14;
    labels.add({ id: o.r.id, level: o.fault ? [1, 2] : 1, cls: `hz-lab-room${small ? ' is-small' : ''}${o.fault ? ' is-fault' : ''}`, text: o.r.n, sub: o.r.t, ring: o.fault ? 'fault' : 'fine',
      at: () => at3(o.ring.g), priority: o.fault ? 30 : 4 + Math.min(6, o.area / 8), dy: ringPx(o.ring) });
  }
  const sf = D.floors.find((f) => f.id === D.story.floor);
  const CORE_WORD = { stair: 'Stairs', lift: 'Lifts', toilets: 'Toilets' };
  for (const c of sf.core) if (CORE_WORD[c.kind]) labels.add({ id: `core-${c.r.join()}`, level: 1, cls: 'hz-lab-core', text: CORE_WORD[c.kind], at: () => world((c.r[0] + c.r[2]) / 2, (c.r[1] + c.r[3]) / 2, sf.level + WALL_H + 0.1), priority: 2, dy: 0 });
  for (const a of sf.areas) labels.add({ id: `area-${a.r.join()}`, level: 1, cls: 'hz-lab-area', text: a.n, at: () => world((a.r[0] + a.r[2]) / 2, (a.r[1] + a.r[3]) / 2, sf.level + 0.2), priority: 1, dy: 0 });
  for (const p of D.people) {
    const f = D.floors.find((x) => x.id === p.f); if (!f) continue;
    const g = floorGroups.get(p.f), lifts = p.f !== D.story.floor;
    labels.add({ id: `p-${p.i}`, level: 1, cls: `hz-lab-person${p.story ? ' is-story' : ''}`, avatar: p.i, text: p.story ? p.n : null, sub: p.story ? p.r : null, title: `${p.n}, ${p.r}`,
      at: () => at3(g).add(world(p.at[0], p.at[1], f.level + 1.7)), priority: p.story ? 12 : 3, dy: 0, lifts });
  }
  for (const r of devRings) { const d = r.g.userData.dev; labels.add({ id: `dev-${d.key}`, level: 2, cls: `hz-lab-dev${d.fault ? ' is-fault' : ''}`, text: d.label, sub: d.sub, ring: d.fault ? 'fault' : 'fine', at: () => at3(r.g), priority: d.fault ? 40 : 8, dy: ringPx(r) }); }
  if (D.story.booking) labels.add({ id: 'booking', level: 2, cls: 'hz-lab-booking', text: D.story.booking.text, sub: D.story.booking.sub, at: () => at3(storyFloor).add(world(...D.story.booking.at)), priority: 9, dy: 0 });

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
  const roomView = (o, dist = 12.5) => { const c = world(o.centre.x, o.centre.y, o.centre.z + 0.9); const dir = new Vector3(Math.sin(rad(24)) * Math.cos(rad(36)), Math.sin(rad(36)), Math.cos(rad(24)) * Math.cos(rad(36))); return { target: c, pos: c.clone().add(dir.multiplyScalar(dist)) }; };
  const VIEWS = {
    far: () => fitView(bounds('all'), rad(38), rad(30), 1.22),
    building: () => fitView(bounds('all'), rad(30), rad(26), 1.0),
    floor: () => fitView(bounds(D.story.floor), rad(24), rad(40), 1.0),
    space: () => roomView(story),
    room: (o) => roomView(o),
  };
  // Time for the moves, which stops while the picture is paused (WCAG 2.2.2; pause() and resume() below): every
  // tween and timed change reads now(), and the sequence's waits are on a clock that pauses with it.
  let pausedAt = 0, pausedFor = 0;
  const now = () => (pausedAt || performance.now()) - pausedFor;
  const clk = clock();
  const later = (ms, fn) => clk.later(ms, fn);
  let tween = null;
  function moveTo(v, dur = DUR.move) {
    if (reduced || !dur) { tween = null; target.copy(v.target); camera.position.copy(v.pos); camera.lookAt(target); controls.update(); requestRender(); return; }
    const s0 = new Spherical().setFromVector3(camera.position.clone().sub(target)), s1 = new Spherical().setFromVector3(v.pos.clone().sub(v.target));
    let dt = s1.theta - s0.theta; if (dt > Math.PI) dt -= 2 * Math.PI; if (dt < -Math.PI) dt += 2 * Math.PI;
    tween = { t0: now(), s: spring({ duration: dur, bounce: 0 }), from: { t: target.clone(), s: s0 }, to: { t: v.target.clone(), s: s1, dt } };
    requestRender();
  }
  function stepTween(now) {
    if (!tween) return false;
    const e = tween.s.at(now - tween.t0), { from, to } = tween;
    target.lerpVectors(from.t, to.t, e);
    const s = new Spherical(from.s.radius + (to.s.radius - from.s.radius) * e, from.s.phi + (to.s.phi - from.s.phi) * e, from.s.theta + to.dt * e);
    camera.position.copy(target).add(new Vector3().setFromSpherical(s));
    camera.lookAt(target);
    if (now - tween.t0 >= tween.s.duration) { tween = null; controls.update(); }
    return !!tween;
  }

  // ---- Small timed changes (a floor lifting, a ring coming on): each a spring on one value, drawn per frame.
  const anims = new Set();
  const animate = (dur, fn) => new Promise((res) => {
    if (reduced || !dur) { fn(1); requestRender(); res(); return; }
    const a = { t0: now(), s: spring({ duration: dur, bounce: 0 }), fn, res }; anims.add(a); requestRender();
  });
  function stepAnims(now) {
    for (const a of anims) { const t = now - a.t0, e = a.s.at(t); a.fn(e); if (t >= a.s.duration) { anims.delete(a); a.res(); } }
    return anims.size > 0;
  }
  const g4 = floorGroups.get(D.floors[1]?.id);
  let lifted = 0;
  const setLift = (k) => { lifted = k; if (!g4) return; g4.position.z = LIFT * k; setAlpha(D.floors[1].id, 1 - 0.95 * k); };
  const setRing = (r, on) => { r.on = on; r.g.visible = on > 0.004; r.back.opacity = 0.92 * on; (r.state === 'fault' ? r.hot : r.quiet).opacity = on; };
  const breakRing = (r) => { r.state = 'fault'; r.fine.visible = false; r.broken.visible = true; r.hot.opacity = r.on; r.quiet.opacity = 0; };
  const tintRoom = (o, k) => { o.mat.color.copy(T.c['--in-room-floor']).lerp(T.c['--h-fault'], 0.26 * k); };
  const sleep = (t) => new Promise((r) => { if (reduced) setTimeout(r, 0); else later(t, r); });

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

  // ---- Drawing only while something moves.
  let pending = false, alive = true;
  function requestRender() { if (!pending && alive) { pending = true; requestAnimationFrame(frame); } }
  function frame() {
    pending = false; if (!alive) return;
    const t = now(), moving = !pausedAt && stepTween(t), more = !pausedAt && stepAnims(t), damping = controls.enabled && controls.update();
    placeRings();
    renderer.render(scene, camera);
    labels.place(project, lifted, [renderer.domElement.clientWidth, renderer.domElement.clientHeight]);
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
      for (let i = 0; i < devRings.length; i++) { const r = devRings[i]; later(reduced ? 0 : i * DUR.stagger * 3, () => animate(DUR.state, (e) => setRing(r, e))); }
      await sleep(devRings.length * DUR.stagger * 3 + DUR.state);
      const vb = devRings.find((r) => r.g.userData.dev.fault); if (vb && vb.state !== 'fault') breakRing(vb); requestRender();
    } else { for (const r of devRings) setRing(r, 0); if (roomRingWas && story.ring.on < roomRingWas) { const from = story.ring.on; animate(DUR.state, (e) => setRing(story.ring, from + (roomRingWas - from) * e)); } }
    requestRender();
  };
  // The labels of a level arrive as the camera settles, a little after the move starts.
  const wordsAt = (i, delay) => { const my = seq; const f = () => { if (seq === my && alive) { labels.level(i); requestRender(); } }; if (reduced || !delay) f(); else later(delay, f); };
  async function go(i, animateIt = true) {
    seq++; level = i; hooks.onLevel?.(i);
    const dur = animateIt && !reduced ? DUR.move : 0;
    wordsAt(i, dur * 0.45);
    if (i === 0) { moveTo(VIEWS.building(), dur); animate(animateIt ? DUR.lift : 0, (e) => setLift(lifted + (0 - lifted) * e)); showDevRings(false); }
    if (i === 1) { moveTo(VIEWS.floor(), dur); animate(animateIt ? DUR.lift : 0, (e) => setLift(lifted + (1 - lifted) * e)); showDevRings(false); }
    if (i === 2) { moveTo(VIEWS.space(), dur); if (lifted < 1) animate(animateIt ? DUR.lift : 0, (e) => setLift(lifted + (1 - lifted) * e)); showDevRings(true); }
    if (i === 3) { labels.level(3); requestRender(); }
  }
  function goRoom(o) { seq++; level = 2; hooks.onLevel?.(2, o.r); moveTo(VIEWS.room(o)); wordsAt(o === story ? 2 : 3, DUR.move * 0.45); if (o === story) showDevRings(true); else showDevRings(false); }
  async function run() {
    const my = ++seq;
    const alive_ = () => seq === my;
    if (reduced) { setLift(1); for (const r of rings) setRing(r, 1); breakRing(story.ring); tintRoom(story, 1); moveTo(VIEWS.space(), 0); showDevRings(true); level = 2; labels.level(2); hooks.onLevel?.(2); hooks.onBeat?.(); requestRender(); return true; }
    moveTo(VIEWS.far(), 0);
    await sleep(DUR.hold); if (!alive_()) return false;
    moveTo(VIEWS.building()); labels.level(0); requestRender(); await sleep(DUR.move + DUR.hold * 0.4); if (!alive_()) return false;
    hooks.onLevel?.(1);
    moveTo(VIEWS.floor()); animate(DUR.lift, (e) => setLift(e)); await sleep(DUR.move * 0.55); if (!alive_()) return false;
    labels.level(1); requestRender();
    const floorRings = [...roomObj.values()].filter((o) => o.r.f === D.story.floor).sort((a, b) => a.r.r[0] - b.r.r[0]).map((o) => o.ring);
    floorRings.forEach((r, i) => later(i * DUR.stagger * 2, () => { if (alive_()) animate(DUR.state, (e) => setRing(r, e)); }));
    await sleep(floorRings.length * DUR.stagger * 2 + DUR.state + DUR.hold * 0.8); if (!alive_()) return false;
    breakRing(story.ring); animate(DUR.state, (e) => tintRoom(story, e)); hooks.onBeat?.();
    await sleep(DUR.hold * 1.8); if (!alive_()) return false;
    level = 2; hooks.onLevel?.(2);
    moveTo(VIEWS.space()); await sleep(DUR.move * 0.5); if (!alive_()) return false;
    labels.level(2); requestRender();
    await showDevRings(true);
    await sleep(DUR.move * 0.5);   // the camera settles
    return alive_();
  }
  // Back to the frame run() starts from: the far view, the fourth floor home, every ring off and whole, no words.
  function reset() {
    seq++; tween = null; anims.clear(); controls.enabled = false;
    setLift(0); roomRingWas = 0;
    for (const r of rings) { if (r.broken) { r.state = 'fine'; r.fine.visible = true; r.broken.visible = false; } setRing(r, 0); }
    tintRoom(story, 0); labels.level(-1);
    moveTo(VIEWS.far(), 0); level = 0; hooks.onLevel?.(0); requestRender();
  }
  // Rings on the other floor and the story floor's rings are on from the start when a level is chosen before the run reaches it.
  function ringsOn() { for (const r of rings.filter((x) => !devRings.includes(x))) setRing(r, 1); if (story.ring.state !== 'fault') { breakRing(story.ring); tintRoom(story, 1); } }

  // A look change: every material, light and opacity eases from what it shows now to the new look's value, together,
  // on one zero-bounce spring (--dur-theme; at once under reduced motion). Only colours change; nothing moves.
  let fadeLook = 0;
  function recolour() {
    T = readTokens(host);
    const faultOn = story.ring.state === 'fault' ? 1 : 0;
    const colTo = (e) => (e.m === story.mat ? T.c['--in-room-floor'].clone().lerp(T.c['--h-fault'], 0.26 * faultOn) : T.c[e.token] ?? e.m.color);
    const jobs = [];
    const col = (c, to) => { if (to && !c.equals(to)) jobs.push({ c, a: c.clone(), b: to.clone() }); };
    const num = (get, set, to) => { const a = get(); if (Math.abs(a - to) > 1e-4) jobs.push({ get, set, a, b: to }); };
    for (const e of mats) {
      col(e.m.color, colTo(e));
      if (e.x.emissive) { col(e.m.emissive, T.c[e.token]); num(() => e.m.emissiveIntensity, (v) => { e.m.emissiveIntensity = v; }, T.n['--in-lamp-i'] * (e.x.emissive === true ? 1 : e.x.emissive)); }
      if (e.token === '--in-glass') num(() => e.base, (v) => { e.base = v; e.m.opacity = v * e.alpha; }, T.n['--in-glass-a']);
      if (e.token === '--hz-ground') num(() => e.base, (v) => { e.base = v; e.m.opacity = v; }, T.n['--in-shadow-a']);
    }
    col(sky.color, T.c['--in-sky']); col(sky.groundColor, T.c['--in-bounce']); col(amb.color, T.c['--in-sky']); col(sun.color, T.c['--in-sun']);
    num(() => sky.intensity, (v) => { sky.intensity = v; }, T.n['--in-sky-i']); num(() => amb.intensity, (v) => { amb.intensity = v; }, T.n['--in-amb-i']); num(() => sun.intensity, (v) => { sun.intensity = v; }, T.n['--in-sun-i']);
    root.traverse((o) => { if (o.userData.ground) { col(o.material.color, T.c['--hz-ground']); const m = o.material; num(() => m.opacity, (v) => { m.opacity = v; }, T.a['--hz-ground']); } });
    const my = ++fadeLook;
    animate(DUR.theme, (k) => { if (my !== fadeLook) return; for (const j of jobs) { if (j.c) j.c.copy(j.a).lerp(j.b, k); else j.set(j.a + (j.b - j.a) * k); } });
  }


  resize();
  moveTo(reduced ? VIEWS.space() : VIEWS.far(), 0);
  renderer.render(scene, camera);
  Promise.resolve().then(() => { if (alive) hooks.onReady?.(); });   // after the caller holds the handle

  return {
    run, reset, go: (i, a) => { ringsOn(); return go(i, a); }, goRoom, recolour, requestRender,
    // Pause and play the sequence where it is: the camera, the rings and the waits all stop, and carry on from there.
    pause() { if (pausedAt) return; pausedAt = performance.now(); clk.pause(); },
    resume() { if (!pausedAt) return; pausedFor += performance.now() - pausedAt; pausedAt = 0; clk.resume(); requestRender(); },
    storyAt: () => project(at3(story.ring.g)),
    deviceAt: () => { const vb = devRings.find((r) => r.g.userData.dev.fault); return vb && vb.g.visible && vb.on > 0.5 ? project(at3(vb.g)) : null; },
    level: () => level,
    dispose() {
      alive = false; ro.disconnect(); controls.dispose(); labels.dispose();
      renderer.domElement.remove(); renderer.dispose();
      for (const e of mats) e.m.dispose();
      for (const g of [unitBox, unitEdges, ringGeo, dotGeo, discGeo, arcA, arcB, cyl, ball]) g.dispose();
    },
  };
}
