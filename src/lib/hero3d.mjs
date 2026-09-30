// The front door's hero in 3D (FRONT-DOOR-V2 section 3, MOTION-V2 4.36): the demo's Dublin office as a real model,
// built in three.js from the same building data the office page draws (src/lib/office3d.mjs), with the devices as
// health rings in space. Loaded by HeroZoom.astro after first paint, only where the screen is wide and WebGL draws,
// so the static first frame (an SVG of the same building) is what a visitor sees first and what a phone keeps.
//
// The sequence plays once, then rests:
//   1  a beat on the building, then a slow dolly in with a slight turn
//   2  the fourth floor lifts away and fades while the camera settles over the third
//   3  every space's ring comes on in turn; one breaks, once; the heartbeat appears
//   4  the camera eases into 3.09 Whooper Swan; its devices come on in turn; the video bar's ring breaks
// Every camera move is one critically damped spring (src/lib/spring.mjs) started from wherever the camera is, so
// the level strip, a click on a space or a drag can take over mid-move without a jump. Nothing loops: the scene
// draws only while something moves. Reduced motion: the final frame, still, with every level a click away.
//
//   mountHero(host, D, hooks)  builds the scene in `host`, returns { run, go, dispose, recolour }
//   D                          { floors, rooms, story, camera } from HeroZoom.astro (inline JSON, no fetch)
//   hooks                      { onReady(), onLevel(i), onHover(room | null), onBeat() }
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, LineSegments, BoxGeometry, EdgesGeometry, ExtrudeGeometry, Shape, RingGeometry,
  CircleGeometry, PlaneGeometry, MeshLambertMaterial, MeshBasicMaterial, LineBasicMaterial, HemisphereLight, DirectionalLight, Color, Vector2, Vector3,
  Spherical, Raycaster, CanvasTexture, SRGBColorSpace, Quaternion,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { spring } from './spring.mjs';

const TOKENS = ['--hz-slab-top', '--hz-core', '--hz-corr', '--hz-top', '--hz-edge', '--hz-ground', '--quiet', '--h-fault', '--text-3', '--hz-area', '--hz-k-meeting', '--hz-k-small', '--hz-k-shared', '--hz-wc', '--hz-desk'];
// A space's kind, for its tint (the floor plan's key uses the same kinds: src/components/FloorMap.astro).
const KIND_TOKEN = { meeting: '--hz-k-meeting', small: '--hz-k-small', reception: '--hz-k-shared', pantry: '--hz-k-shared', print: '--hz-k-shared' };
const world = (x, y, z) => new Vector3(x, z, -y);

// Read the tokens as colours (any CSS colour syntax) by painting one pixel each.
function readTokens(el) {
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true }), cs = getComputedStyle(el), out = {};
  for (const n of TOKENS) {
    g.clearRect(0, 0, 1, 1); g.fillStyle = '#888'; g.fillStyle = cs.getPropertyValue(n).trim() || '#888'; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data; out[n] = new Color().setRGB(d[0] / 255, d[1] / 255, d[2] / 255, SRGBColorSpace);
  }
  return out;
}
const ms = (cs, name, d) => { const v = cs.getPropertyValue(name).trim(), n = parseFloat(v); return Number.isNaN(n) ? d : /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n; };

export function mountHero(host, D, hooks = {}) {
  const cs = getComputedStyle(host);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = { move: ms(cs, '--dur-hero-move', 1800), hold: ms(cs, '--dur-hero-hold', 700), state: ms(cs, '--dur-state', 300), stagger: ms(cs, '--stagger', 24), lift: ms(cs, '--dur-hero-lift', 1400) };
  let T = readTokens(host);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'hz-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 16 / 10, 0.5, 600);
  const root = new Group(); root.rotation.x = -Math.PI / 2; scene.add(root);   // plan metres, z up
  scene.add(new HemisphereLight(0xfff6ea, 0x6b5e4e, 1.9));
  const sun = new DirectionalLight(0xfff2e2, 1.5); sun.position.set(-40, 90, 60); scene.add(sun);
  const sun2 = new DirectionalLight(0xffffff, 0.35); sun2.position.set(70, 30, -40); scene.add(sun2);

  // ---- Materials, per floor so a floor can lift away and fade.
  const mats = [];
  const mk = (kind, token, base = 1, floor = null) => {
    const m = kind === 'line' ? new LineBasicMaterial({ color: T[token] }) : kind === 'basic' ? new MeshBasicMaterial({ color: T[token] }) : new MeshLambertMaterial({ color: T[token] });
    m.transparent = true; m.opacity = base;
    const e = { m, token, base, floor, alpha: 1 }; mats.push(e); m.userData.e = e; return m;
  };
  const setAlpha = (floor, a) => { for (const e of mats) if (e.floor === floor) { e.alpha = a; e.m.opacity = e.base * a; e.m.visible = e.m.opacity > 0.004; } };

  const unitBox = new BoxGeometry(1, 1, 1), unitEdges = new EdgesGeometry(unitBox);
  const box = (parent, [x0, y0, z0], [x1, y1, z1], mat, edgeMat) => {
    const m = new Mesh(unitBox, mat); m.scale.set(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), Math.max(0.001, z1 - z0)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(m);
    if (edgeMat) { const l = new LineSegments(unitEdges, edgeMat); l.scale.copy(m.scale); l.position.copy(m.position); parent.add(l); }
    return m;
  };

  // ---- The building: a soft ground shadow, then each floor as a slab with its core, corridors and rooms as blocks.
  const f0 = D.floors[0], xs = f0.outline.map((p) => p[0]), ys = f0.outline.map((p) => p[1]);
  const bx = [Math.min(...xs), Math.max(...xs)], by = [Math.min(...ys), Math.max(...ys)];
  const cx = (bx[0] + bx[1]) / 2, cy = (by[0] + by[1]) / 2;
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const tex = new CanvasTexture(c);
    const sh = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: T['--hz-ground'] }));
    sh.scale.set((bx[1] - bx[0]) * 1.5, (by[1] - by[0]) * 2.2, 1); sh.position.set(cx + 2, cy - 2, f0.level - 0.55); root.add(sh);
  }
  const floorGroups = new Map(), roomObj = new Map(), rings = [];
  const ringGeo = new RingGeometry(0.72, 1, 48), dotGeo = new CircleGeometry(0.24, 16);
  const arcA = new RingGeometry(0.68, 1, 20, 1, -Math.PI / 3, (2 * Math.PI) / 3), arcB = new RingGeometry(0.68, 1, 20, 1, (2 * Math.PI) / 3, (2 * Math.PI) / 3);
  // A health ring in space: a billboard the size of a glyph on screen, quiet grey until it comes on; a broken one has a dot.
  const ring = (parent, at, { px = 13, fault = false, floor = null } = {}) => {
    const g = new Group(); g.position.copy(at); parent.add(g);
    const quiet = mk('basic', '--quiet', 1, floor), hot = mk('basic', '--h-fault', 1, floor);
    const fine = new Mesh(ringGeo, quiet); g.add(fine);
    let broken = null;
    if (fault) { broken = new Group(); broken.add(new Mesh(arcA, hot), new Mesh(arcB, hot), new Mesh(dotGeo, hot)); broken.visible = false; g.add(broken); }
    const r = { g, fine, broken, quiet, hot, px, on: 0, state: 'fine' };
    quiet.opacity = 0; hot.opacity = 0; g.visible = false;
    rings.push(r); return r;
  };
  for (const f of D.floors) {
    const g = new Group(); root.add(g); floorGroups.set(f.id, g);
    const L = f.level;
    const shape = new Shape(f.outline.map(([x, y]) => new Vector2(x, y)));
    const slab = new ExtrudeGeometry(shape, { depth: 0.4, bevelEnabled: false }); slab.translate(0, 0, L - 0.4);
    g.add(new Mesh(slab, mk('lambert', '--hz-slab-top', 1, f.id)));
    g.add(new LineSegments(new EdgesGeometry(slab), mk('line', '--hz-edge', 1, f.id)));
    const coreMat = mk('lambert', '--hz-core', 1, f.id), corrMat = mk('lambert', '--hz-corr', 1, f.id), areaMat = mk('lambert', '--hz-area', 1, f.id), edge = mk('line', '--hz-edge', 1, f.id);
    const wcMat = mk('lambert', '--hz-wc', 1, f.id);
    for (const c of f.core) box(g, [c.r[0], c.r[1], L], [c.r[2], c.r[3], L + (c.flat ? 0.02 : 0.9)], c.kind === 'toilets' ? wcMat : coreMat, c.flat ? null : edge);
    for (const r of f.corr) box(g, [r[0], r[1], L], [r[2], r[3], L + 0.015], corrMat);
    for (const a of f.areas) box(g, [a[0], a[1], L], [a[2], a[3], L + 0.012], areaMat);
    const kindMats = {}, deskMat = mk('lambert', '--hz-desk', 1, f.id);
    const matOf = (k) => (kindMats[k] ??= mk('lambert', KIND_TOKEN[k] ?? '--hz-top', 1, f.id));
    for (const r of D.rooms.filter((x) => x.f === f.id)) {
      const fault = r.id === D.story.room;
      const mat = fault ? mk('lambert', '--hz-top', 1, f.id) : matOf(r.k);
      // Desks stand in the open: the bank is a flat outline on the floor with each desk on it.
      const m = box(g, [r.r[0], r.r[1], L], [r.r[2], r.r[3], L + (r.bank ? 0.03 : r.h)], r.bank ? corrMat : mat, edge);
      for (const d of r.desks ?? []) box(g, [d[0] - 0.7, d[1] - 0.34, L], [d[0] + 0.7, d[1] + 0.34, L + 0.38], deskMat, edge);
      m.userData.room = r;
      const centre = [(r.r[0] + r.r[2]) / 2, (r.r[1] + r.r[3]) / 2];
      const rg = ring(g, new Vector3(centre[0], centre[1], L + r.h + 0.55), { px: fault ? 19 : 13, fault, floor: f.id });
      roomObj.set(r.id, { r, m, mat, ring: rg, centre: new Vector3(centre[0], centre[1], L + r.h / 2), fault });
    }
  }
  // The story's devices, as rings where they are in the space (shown once the camera is in the room).
  const devRings = D.story.devices.map((d) => {
    const rg = ring(floorGroups.get(D.story.floor), new Vector3(...d.at), { px: d.fault ? 18 : 12, fault: !!d.fault, floor: D.story.floor });
    rg.g.userData.dev = d; return rg;
  });
  const roomMeshes = [...roomObj.values()].map((o) => o.m);

  // ---- Camera: fit a box at an angle; move on a spring from wherever the camera is now.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enableZoom = false; controls.enablePan = false; controls.rotateSpeed = 0.35;
  controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.32; controls.enabled = false;
  const target = controls.target;
  const bounds = (which) => {
    if (which === 'all') return { min: [bx[0], by[0], f0.level - 0.4], max: [bx[1], by[1], Math.max(...D.floors.map((f) => f.level + 1.2))] };
    const f = D.floors.find((x) => x.id === which);
    return { min: [bx[0], by[0], f.level - 0.4], max: [bx[1], by[1], f.level + 1.2] };
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
  const rad = (deg) => (deg * Math.PI) / 180;
  const story = roomObj.get(D.story.room);
  const VIEWS = {
    far: () => fitView(bounds('all'), rad(38), rad(31), 1.22),
    building: () => fitView(bounds('all'), rad(30), rad(27), 0.98),
    floor: () => fitView(bounds(D.story.floor), rad(26), rad(38), 0.92),
    space: () => { const c = world(story.centre.x, story.centre.y, story.centre.z + 0.4); const dir = new Vector3(Math.sin(rad(22)) * Math.cos(rad(34)), Math.sin(rad(34)), Math.cos(rad(22)) * Math.cos(rad(34))); return { target: c, pos: c.clone().add(dir.multiplyScalar(11.5)) }; },
    room: (o) => { const c = world(o.centre.x, o.centre.y, o.centre.z + 0.4); const dir = new Vector3(Math.sin(rad(22)) * Math.cos(rad(34)), Math.sin(rad(34)), Math.cos(rad(22)) * Math.cos(rad(34))); return { target: c, pos: c.clone().add(dir.multiplyScalar(11.5)) }; },
  };
  let tween = null;
  function moveTo(v, dur = DUR.move) {
    if (reduced || !dur) { tween = null; target.copy(v.target); camera.position.copy(v.pos); camera.lookAt(target); controls.update(); requestRender(); return; }
    const s0 = new Spherical().setFromVector3(camera.position.clone().sub(target)), s1 = new Spherical().setFromVector3(v.pos.clone().sub(v.target));
    let dt = s1.theta - s0.theta; if (dt > Math.PI) dt -= 2 * Math.PI; if (dt < -Math.PI) dt += 2 * Math.PI;
    tween = { t0: performance.now(), s: spring({ duration: dur, bounce: 0 }), from: { t: target.clone(), s: s0 }, to: { t: v.target.clone(), s: s1, dt } };
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
    const a = { t0: performance.now(), s: spring({ duration: dur, bounce: 0 }), fn, res }; anims.add(a); requestRender();
  });
  function stepAnims(now) {
    for (const a of anims) { const t = now - a.t0, e = a.s.at(t); a.fn(e); if (t >= a.s.duration) { anims.delete(a); a.res(); } }
    return anims.size > 0;
  }
  const g4 = floorGroups.get(D.floors[1]?.id);
  let lifted = 0;
  const setLift = (k) => { lifted = k; if (!g4) return; g4.position.z = 5.5 * k; setAlpha(D.floors[1].id, 1 - 0.9 * k); };
  const setRing = (r, on) => { r.on = on; r.g.visible = on > 0.004; (r.state === 'fault' ? r.hot : r.quiet).opacity = on; };
  const breakRing = (r) => { r.state = 'fault'; r.fine.visible = false; r.broken.visible = true; r.hot.opacity = r.on; r.quiet.opacity = 0; };
  const tintRoom = (o, k) => { o.mat.color.copy(T['--hz-top']).lerp(T['--h-fault'], 0.22 * k); };
  const sleep = (t) => new Promise((r) => setTimeout(r, reduced ? 0 : t));

  // ---- Rings face the camera and keep their size on screen.
  const tmp = new Vector3();
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
  const tmpQ = new Quaternion();

  // ---- Drawing only while something moves.
  let pending = false, alive = true;
  function requestRender() { if (!pending && alive) { pending = true; requestAnimationFrame(frame); } }
  function frame(now) {
    pending = false; if (!alive) return;
    const moving = stepTween(now), more = stepAnims(now), damping = controls.enabled && controls.update();
    placeRings();
    renderer.render(scene, camera);
    hooks.onFrame?.(project);
    if (moving || more || damping) requestRender();
  }
  const v3 = new Vector3();
  function project(pos) {
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    v3.copy(pos).project(camera);
    return v3.z < 1 ? [((v3.x + 1) / 2) * w, ((1 - v3.y) / 2) * h] : null;
  }
  const at = (o) => { const p = new Vector3(); o.getWorldPosition(p); return p; };
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
    const hit = ray.intersectObjects(roomMeshes, false)[0];
    return hit ? roomObj.get(hit.object.userData.room.id) : null;
  };
  const onMove = (e) => {
    if (e.buttons) return;
    const o = pickAt(e.clientX, e.clientY);
    if (o !== hover) { hover = o; renderer.domElement.style.cursor = o ? 'pointer' : ''; hooks.onHover?.(o ? { room: o.r, at: () => project(at(o.ring.g)) } : null); }
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
  const showDevRings = async (on) => { if (on) { for (let i = 0; i < devRings.length; i++) { const r = devRings[i]; setTimeout(() => animate(DUR.state, (e) => setRing(r, e)), reduced ? 0 : i * DUR.stagger * 3); } await sleep(devRings.length * DUR.stagger * 3 + DUR.state); const vb = devRings.find((r) => r.g.userData.dev.fault); if (vb && vb.state !== 'fault') breakRing(vb); requestRender(); } else for (const r of devRings) setRing(r, 0); requestRender(); };
  async function go(i, animateIt = true) {
    seq++; level = i; hooks.onLevel?.(i);
    const dur = animateIt && !reduced ? DUR.move : 0;
    if (i === 0) { moveTo(VIEWS.building(), dur); animate(animateIt ? DUR.lift : 0, (e) => setLift(lifted + (0 - lifted) * e)); showDevRings(false); }
    if (i === 1) { moveTo(VIEWS.floor(), dur); animate(animateIt ? DUR.lift : 0, (e) => setLift(lifted + (1 - lifted) * e)); showDevRings(false); }
    if (i === 2) { moveTo(VIEWS.space(), dur); if (lifted < 1) animate(animateIt ? DUR.lift : 0, (e) => setLift(lifted + (1 - lifted) * e)); showDevRings(true); }
  }
  function goRoom(o) { seq++; level = 2; hooks.onLevel?.(2, o.r); moveTo(VIEWS.room(o)); if (o === story) showDevRings(true); else showDevRings(false); }
  async function run() {
    const my = ++seq;
    const alive_ = () => seq === my;
    if (reduced) { setLift(1); for (const r of rings) setRing(r, 1); breakRing(story.ring); tintRoom(story, 1); moveTo(VIEWS.space(), 0); showDevRings(true); level = 2; hooks.onLevel?.(2); hooks.onBeat?.(); return; }
    moveTo(VIEWS.far(), 0);
    await sleep(DUR.hold); if (!alive_()) return;
    moveTo(VIEWS.building()); await sleep(DUR.move + DUR.hold * 0.4); if (!alive_()) return;
    hooks.onLevel?.(1);
    moveTo(VIEWS.floor()); animate(DUR.lift, (e) => setLift(e)); await sleep(DUR.move * 0.7); if (!alive_()) return;
    const floorRings = [...roomObj.values()].filter((o) => o.r.f === D.story.floor).sort((a, b) => a.r.r[0] - b.r.r[0]).map((o) => o.ring);
    floorRings.forEach((r, i) => setTimeout(() => { if (alive_()) animate(DUR.state, (e) => setRing(r, e)); }, i * DUR.stagger * 2));
    await sleep(floorRings.length * DUR.stagger * 2 + DUR.state + DUR.hold * 0.6); if (!alive_()) return;
    breakRing(story.ring); animate(DUR.state, (e) => tintRoom(story, e)); hooks.onBeat?.();
    await sleep(DUR.hold * 1.6); if (!alive_()) return;
    level = 2; hooks.onLevel?.(2);
    moveTo(VIEWS.space()); await sleep(DUR.move * 0.6); if (!alive_()) return;
    showDevRings(true);
  }
  // Rings on the other floor and the story floor's rings are on from the start when a level is chosen before the run reaches it.
  function ringsOn() { for (const r of rings.filter((x) => !devRings.includes(x))) setRing(r, 1); if (story.ring.state !== 'fault') { breakRing(story.ring); tintRoom(story, 1); } }

  function recolour() { T = readTokens(host); for (const e of mats) e.m.color.copy(T[e.token]); tintRoom(story, story.ring.state === 'fault' ? 1 : 0); requestRender(); }

  resize();
  moveTo(reduced ? VIEWS.space() : VIEWS.far(), 0);
  renderer.render(scene, camera);
  Promise.resolve().then(() => { if (alive) hooks.onReady?.(); });   // after the caller holds the handle

  return {
    run, go: (i, a) => { ringsOn(); return go(i, a); }, goRoom, recolour, requestRender,
    storyAt: () => project(at(story.ring.g)),
    deviceAt: () => { const vb = devRings.find((r) => r.g.userData.dev.fault); return vb && vb.g.visible && vb.on > 0.5 ? project(at(vb.g)) : null; },
    level: () => level,
    dispose() {
      alive = false; ro.disconnect(); controls.dispose();
      renderer.domElement.remove(); renderer.dispose();
      for (const e of mats) e.m.dispose();
      for (const g of [unitBox, unitEdges, ringGeo, dotGeo, arcA, arcB]) g.dispose();
    },
  };
}
