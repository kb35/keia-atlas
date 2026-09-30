// The office in 3D: the three.js half of the 3D page (decision 0030). Loaded by src/lib/office3d-client.mjs only
// when the screen is wide enough and the browser can draw WebGL, so phones never download three.js.
//
// Everything is built in the building's own metres inside one group turned upright (x east, y north, z up on the
// plan; three.js has y up), so the numbers from src/lib/office3d.mjs go in unchanged. Per floor: the slab, the
// core, corridors and areas, rooms as see-through volumes (coloured by the live state), desks, columns, the rack
// with every item at its height, the trays (instanced), the access points and every cable run (instanced
// cylinders, one per straight stretch, each run in its own lane so a tray reads as a bundle). For the building:
// the floors below (faint, not modelled), the riser, the riser fibre, both providers' lead-ins from the street.
//
// It draws only when something changes (a camera move, a state, a choice), and pauses its fault pulse while the
// tab is hidden or the view is off screen. Colours are the design tokens, read again when the look changes.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, InstancedMesh, LineSegments, BoxGeometry, CylinderGeometry, SphereGeometry,
  RingGeometry, EdgesGeometry, ExtrudeGeometry, Shape, BufferGeometry, Float32BufferAttribute, MeshLambertMaterial, MeshBasicMaterial,
  LineBasicMaterial, HemisphereLight, DirectionalLight, AmbientLight, Color, Vector3, Matrix4, Quaternion, Raycaster, Vector2, Spherical,
  SRGBColorSpace, DoubleSide,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const U_M = 0.04445, RACK_BASE = 0.1, RACK_W = 0.6, RACK_D = 1.07;
const TOKENS = ['--stage-bg', '--bg', '--surface', '--surface-2', '--surface-3', '--ink', '--text-2', '--line', '--line-strong', '--accent', '--blue', '--green', '--red',
  '--amber', '--grey', '--violet', '--yellow', '--blue-soft', '--green-soft', '--amber-soft', '--grey-soft', '--red-soft'];
const ROOM_TOKEN = { use: '--blue', free: '--green', problem: '--red', closed: '--grey', none: '--line-strong', comms: '--violet' };
const HEALTH_TOKEN = { ok: '--green', warn: '--amber', bad: '--red', idle: '--grey' };
const ITEM_TOKEN = { switch: '--blue', 'patch-panel': '--line-strong', 'fibre-panel': '--yellow', firewall: '--violet', isp: '--amber', ups: '--grey', battery: '--grey', oob: '--green', wlc: '--green' };
const AZ = 35 * Math.PI / 180, EL = 28 * Math.PI / 180;

// A cubic-bezier easing from the motion token (--ease-settle), so camera moves share the page's curve.
function easing(css) {
  const m = /cubic-bezier\(([^)]+)\)/.exec(css || '');
  const [x1, y1, x2, y2] = m ? m[1].split(',').map(Number) : [0.22, 1, 0.36, 1];
  const bx = (t) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3, by = (t) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3;
  return (x) => { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (bx(mid) < x) lo = mid; else hi = mid; } return by((lo + hi) / 2); };
}
// Read the tokens as colours (any CSS colour syntax), by painting one pixel.
function readTokens(el) {
  const c = document.createElement('canvas'); c.width = c.height = 1;
  const g = c.getContext('2d', { willReadFrequently: true }), cs = getComputedStyle(el), out = {};
  for (const n of TOKENS) {
    g.clearRect(0, 0, 1, 1); g.fillStyle = '#888'; g.fillStyle = cs.getPropertyValue(n).trim() || '#888'; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data; out[n] = new Color().setRGB(d[0] / 255, d[1] / 255, d[2] / 255, SRGBColorSpace);
  }
  return out;
}
const world = (x, y, z) => new Vector3(x, z, -y);

export function createScene(host, D, hooks) {
  // The motion tokens, read once and again when the look changes (not on every frame).
  const readMotion = () => {
    const base = window.rsMotion ? window.rsMotion() : { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, morph: 520, state: 300, ease: '' };
    const v = getComputedStyle(document.documentElement).getPropertyValue('--dur-pulse').trim(), n = parseFloat(v);
    return { ...base, pulse: isNaN(n) ? 2400 : /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n };
  };
  let MO = readMotion();
  const motion = () => MO;
  const rm = matchMedia('(prefers-reduced-motion: reduce)'), onRm = () => { MO = readMotion(); paintAll(); };
  rm.addEventListener?.('change', onRm);
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'o3-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.prepend(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 4 / 3, 0.3, 800);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false; controls.screenSpacePanning = true; controls.minDistance = 3; controls.maxDistance = 260; controls.maxPolarAngle = Math.PI * 0.495;
  const root = new Group(); root.rotation.x = -Math.PI / 2; scene.add(root);   // plan metres, z up
  scene.add(new HemisphereLight(0xffffff, 0x888888, 1.6));
  const sun = new DirectionalLight(0xffffff, 1.4); sun.position.set(60, 90, 70); scene.add(sun);
  scene.add(new AmbientLight(0xffffff, 0.5));

  let T = readTokens(host);
  const mats = [];            // every material: its token, its base opacity and its floor, so looks and fades can redo it
  const disposables = [];
  const floorAlpha = new Map(D.floors.map((f) => [f.id, 1]));
  const applyOpacity = (e) => { const a = e.floor ? floorAlpha.get(e.floor) : 1; e.m.opacity = e.base * a; e.m.transparent = e.m.opacity < 0.999 || e.always; e.m.depthWrite = e.m.opacity >= 0.999 && !e.always; e.m.visible = e.m.opacity > 0.004; };
  const mk = (kind, token, base = 1, floor = null, opts = {}) => {
    const { always, ...rest } = opts;
    const m = kind === 'line' ? new LineBasicMaterial({ color: T[token] ?? new Color(token) }) : kind === 'basic' ? new MeshBasicMaterial({ color: T[token] ?? new Color(token), side: DoubleSide }) : new MeshLambertMaterial({ color: T[token] ?? new Color(token), ...rest });
    const e = { m, token, base, floor, always: !!opts.always }; m.userData.e = e; mats.push(e); applyOpacity(e); return m;
  };
  const setBase = (m, base) => { const e = m.userData.e; if (e.base !== base) { e.base = base; applyOpacity(e); } };
  const setToken = (m, token) => { const e = m.userData.e; e.token = token; m.color.copy(T[token] ?? new Color(token)); };

  const unitBox = new BoxGeometry(1, 1, 1), unitEdges = new EdgesGeometry(unitBox), cyl = new CylinderGeometry(1, 1, 1, 6, 1, true), fatCyl = new CylinderGeometry(1, 1, 1, 4, 1, true);
  disposables.push(unitBox, unitEdges, cyl, fatCyl);
  const box = (parent, [x0, y0, z0], [x1, y1, z1], mat, edgeMat) => {
    const m = new Mesh(unitBox, mat); m.scale.set(Math.max(0.001, x1 - x0), Math.max(0.001, y1 - y0), Math.max(0.001, z1 - z0)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(m);
    if (edgeMat) { const l = new LineSegments(unitEdges, edgeMat); l.scale.copy(m.scale); l.position.copy(m.position); parent.add(l); m.userData.edges = l; }
    return m;
  };
  const pickables = [];       // meshes the pointer can choose
  const labels = [];          // words over the scene: { el, at (world), floor }
  const labelBox = host.querySelector('[data-o3-labels]');
  const label = (text, at, floor = null, cls = '') => { const el = document.createElement('span'); el.className = `o3-label ${cls}`; el.textContent = text; labelBox?.appendChild(el); labels.push({ el, at, floor }); return el; };

  // ---------- The building ----------
  const floorGroups = new Map();
  const bld = new Group(); root.add(bld);
  const outline0 = D.floors[0].outline;
  const bx = [Math.min(...outline0.map((p) => p[0])), Math.max(...outline0.map((p) => p[0]))], by = [Math.min(...outline0.map((p) => p[1])), Math.max(...outline0.map((p) => p[1]))];
  // The ground and the floors below, faint: the building stands on the street, and the lead-ins start there.
  box(bld, [bx[0] - 10, by[0] - 9, -0.06], [bx[1] + 10, by[1] + 9, -0.01], mk('lambert', '--surface-2', 0.55));
  const ghostMat = mk('line', '--line-strong', 0.55);
  for (const z of D.ghosts) {
    const pts = []; for (let i = 0; i < outline0.length; i++) { const a = outline0[i], b = outline0[(i + 1) % outline0.length]; pts.push(a[0], a[1], z, b[0], b[1], z); }
    const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pts, 3)); disposables.push(g); bld.add(new LineSegments(g, ghostMat));
  }
  if (D.ghosts.length) label(`Floors below: not modelled`, world(bx[0], by[0], D.ghosts[Math.floor(D.ghosts.length / 2)] ?? 0), null, 'o3-label-faint');
  for (const r of D.risers) {
    const m = box(bld, [r.r[0], r.r[1], r.z0], [r.r[2], r.r[3], r.z1], mk('lambert', '--blue-soft', 0.35), mk('line', '--blue', 0.8));
    m.userData.sel = null; label(r.n.replace(/ \(.*\)/, ''), world((r.r[0] + r.r[2]) / 2, (r.r[1] + r.r[3]) / 2, r.z1 + 0.4), null);
  }

  // ---------- Floors ----------
  const roomObj = new Map(), apObj = new Map(), rackObj = new Map(), trayMeshes = [], runMeshes = [], itemMeshes = [];
  for (const f of D.floors) {
    const g = new Group(); root.add(g); floorGroups.set(f.id, g);
    const L = f.level, top = L + f.h - 0.2;
    const shape = new Shape(f.outline.map(([x, y]) => new Vector2(x, y)));
    const slabG = new ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }); slabG.translate(0, 0, L - 0.2); disposables.push(slabG);
    g.add(new Mesh(slabG, mk('lambert', '--surface', 0.9, f.id)));
    const slabE = new EdgesGeometry(slabG); disposables.push(slabE); g.add(new LineSegments(slabE, mk('line', '--line-strong', 1, f.id)));
    label(f.name, world(bx[0] - 0.5, by[0], L + 0.4), f.id, 'o3-label-floor');
    const coreMat = mk('lambert', '--grey-soft', 0.7, f.id), coreEdge = mk('line', '--line-strong', 0.7, f.id), patch = mk('lambert', '--grey-soft', 0.9, f.id);
    for (const c of f.core) {
      if (c.k === 'riser') continue;
      if (c.circ) box(g, [c.r[0], c.r[1], L], [c.r[2], c.r[3], L + 0.02], patch);
      else box(g, [c.r[0], c.r[1], L], [c.r[2], c.r[3], top], coreMat, coreEdge);
    }
    for (const c of f.corr) box(g, [c.r[0], c.r[1], L], [c.r[2], c.r[3], L + 0.015], patch);
    for (const a of f.areas) box(g, [a.r[0], a.r[1], L], [a.r[2], a.r[3], L + 0.012], mk('lambert', a.k === 'town-hall' ? '--amber-soft' : '--green-soft', 0.95, f.id));
    // Rooms.
    const deskMat = mk('lambert', '--surface-3', 1, f.id), oddMat = mk('lambert', '--line-strong', 1, f.id);
    const desks = D.rooms.filter((r) => r.f === f.id).flatMap((r) => r.desks);
    if (desks.length) {
      const im = new InstancedMesh(unitBox, deskMat, desks.length), m4 = new Matrix4();
      desks.forEach((d, i) => { m4.compose(new Vector3(d[0], d[1], L + 0.37), new Quaternion(), new Vector3(1.4, 0.7, 0.74)); im.setMatrixAt(i, m4); });
      g.add(im);
    }
    for (const r of D.rooms.filter((x) => x.f === f.id)) {
      const fill = mk('lambert', r.comms ? ROOM_TOKEN.comms : ROOM_TOKEN.none, r.bank ? 0.16 : 0.42, f.id, { always: true, emissive: 0x000000 });
      const edge = mk('line', r.comms ? ROOM_TOKEN.comms : ROOM_TOKEN.none, 0.9, f.id);
      const m = r.bank ? box(g, [r.r[0], r.r[1], L], [r.r[2], r.r[3], L + 0.04], fill, edge) : box(g, [r.r[0], r.r[1], L], [r.r[2], r.r[3], L + r.h], fill, edge);
      m.userData.sel = `room:${r.id}`; m.userData.floor = f.id; m.userData.room = true; pickables.push(m);
      for (const o of r.odd) box(g, [o.r[0], o.r[1], L], [o.r[2], o.r[3], L + r.h], oddMat);
      roomObj.set(r.id, { r, m, fill, edge, centre: [(r.r[0] + r.r[2]) / 2, (r.r[1] + r.r[3]) / 2, L], radius: Math.hypot(r.r[2] - r.r[0], r.r[3] - r.r[1]) / 2 + 0.3 });
    }
    // Racks and their items.
    for (const k of D.racks.filter((x) => x.f === f.id)) {
      const H = RACK_BASE + k.hU * U_M;
      const fill = mk('lambert', '--ink', 1, f.id), edge = mk('line', '--line-strong', 1, f.id);
      const m = box(g, [k.at[0] - RACK_W / 2, k.at[1] - RACK_D / 2, L], [k.at[0] + RACK_W / 2, k.at[1] + RACK_D / 2, L + H], fill, edge);
      m.userData.sel = `rack:${k.id}`; m.userData.floor = f.id; pickables.push(m);
      const items = k.items.filter((it) => ITEM_TOKEN[it.k]);
      const im = new InstancedMesh(unitBox, mk('lambert', '#ffffff', 1, f.id, { emissive: 0x000000 }), items.length), m4 = new Matrix4();
      const face = k.face === 'n' ? 1 : -1;   // the front: south unless the floor file says otherwise
      items.forEach((it, i) => { m4.compose(new Vector3(k.at[0], k.at[1] + face * (RACK_D / 2 + 0.012), L + RACK_BASE + (it.u - 1 + it.s / 2) * U_M), new Quaternion(), new Vector3(0.5, 0.02, it.s * U_M * 0.86)); im.setMatrixAt(i, m4); });
      im.userData.items = items.map((it) => ({ ...it, key: `item:${k.id}:${it.u}` })); im.userData.sel = `rack:${k.id}`; im.userData.floor = f.id; pickables.push(im);
      g.add(im); itemMeshes.push({ im, rack: k });
      rackObj.set(k.id, { k, m, fill, edge, im, centre: [k.at[0], k.at[1], L] });
      const room = D.rooms.find((r) => r.id === k.room);
      label(room ? `${room.comms && room.type === 'mdf' ? 'MDF' : 'IDF'} ${room.no}` : k.n, world(k.at[0], k.at[1], L + H + 0.5), f.id, 'o3-label-rack');
    }
    // Trays: one instanced mesh, a box per straight stretch.
    const segs = f.trays.flatMap((t) => t.p.slice(1).map((b, i) => ({ t, a: t.p[i], b })));
    const tm = new InstancedMesh(unitBox, mk('lambert', '#ffffff', 1, f.id), segs.length);
    segs.forEach((s, i) => {
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1], len = Math.hypot(dx, dy), w = (s.t.w ?? 100) / 1000, d = (s.t.d ?? 50) / 1000;
      const m4 = new Matrix4().compose(new Vector3((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, L + s.t.z - d / 2 - 0.03), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.atan2(dy, dx)), new Vector3(len + w, w, d));
      tm.setMatrixAt(i, m4);
    });
    tm.userData.segs = segs; g.add(tm); trayMeshes.push(tm);
    // Access points, on the ceiling.
    for (const a of D.aps.filter((x) => x.f === f.id)) {
      const mat = mk('lambert', '--blue', 1, f.id, { emissive: 0x000000 });
      const m = new Mesh(cyl, mat); m.scale.set(0.13, 0.05, 0.13); m.rotation.x = Math.PI / 2; m.position.set(a.at[0], a.at[1], a.at[2] - 0.03); g.add(m);
      const hit = new Mesh(new SphereGeometry(0.55, 8, 6), new MeshBasicMaterial()); hit.visible = false; hit.position.copy(m.position); hit.userData.sel = `ap:${a.id}`; hit.userData.floor = f.id; g.add(hit); pickables.push(hit);
      disposables.push(hit.geometry, hit.material);
      apObj.set(a.id, { a, m, mat, centre: [a.at[0], a.at[1], a.at[2] - 0.05] });
    }
    // Cable runs on this floor.
    runMeshes.push(buildRuns(g, D.runs.filter((r) => r.f === f.id && !r.bb), f.id));
  }
  // The riser fibre and anything else between floors.
  runMeshes.push(buildRuns(bld, D.runs.filter((r) => r.bb), null));

  // ---------- The way in: both providers' lead-ins, the building entries and the street ----------
  const circObj = new Map();
  for (const c of D.circuits.filter((x) => x.p)) {
    const mat = mk('lambert', '--yellow', 1, null, { emissive: 0x000000 });
    const g = new Group(); bld.add(g);
    for (let i = 1; i < c.p.length; i++) {
      const a = new Vector3(...c.p[i - 1]), b = new Vector3(...c.p[i]), len = a.distanceTo(b); if (len < 1e-3) continue;
      const m = new Mesh(cyl, mat); m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.scale.set(0.045, len, 0.045); g.add(m);
      const hit = new Mesh(fatCyl, mat); hit.visible = false; hit.position.copy(m.position); hit.quaternion.copy(m.quaternion); hit.scale.set(0.3, len, 0.3); hit.userData.sel = `circuit:${c.id}`; g.add(hit); pickables.push(hit);
    }
    const street = c.p[0];
    const globe = new Mesh(new SphereGeometry(0.7, 20, 14), mat); globe.position.set(street[0], street[1], 0.8); globe.userData.sel = `circuit:${c.id}`; g.add(globe); pickables.push(globe); disposables.push(globe.geometry);
    label(`${c.prov} (${c.role})`, world(street[0], street[1], 2), null, 'o3-label-way');
    circObj.set(c.id, { c, mat, g, centre: [street[0], street[1], 0.02] });
  }
  const entryObj = new Map();
  for (const e of D.entries) {
    const mat = mk('lambert', '--ink', 1);
    const m = box(bld, [e.at[0] - 0.4, e.at[1] - 0.4, e.z], [e.at[0] + 0.4, e.at[1] + 0.4, e.z + 0.6], mat);
    const c = D.circuits.find((x) => x.entry === e.id); if (c) { m.userData.sel = `circuit:${c.id}`; pickables.push(m); }
    entryObj.set(e.id, { e, mat });
  }
  label('Telecoms entry, ground floor', world(bx[1] / 2 + 3, by[0], 1.4), null, 'o3-label-faint');

  // ---------- Cable runs as instanced cylinders ----------
  function buildRuns(parent, runs, floor) {
    const segs = [];
    runs.forEach((r, ri) => {
      // Each run keeps one lane through its trays: a small fixed offset, so a tray reads as a bundle.
      const dx = ((ri % 5) - 2) * 0.035, dy = ((Math.floor(ri / 5) % 5) - 2) * 0.035, dz = ((Math.floor(ri / 25) % 3) - 1) * 0.025;
      for (let i = 1; i < r.p.length; i++) {
        const a = new Vector3(r.p[i - 1][0] + dx, r.p[i - 1][1] + dy, r.p[i - 1][2] + dz), b = new Vector3(r.p[i][0] + dx, r.p[i][1] + dy, r.p[i][2] + dz);
        const len = a.distanceTo(b); if (len < 1e-3) continue;
        segs.push({ run: r, a, b, len, q: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), b.clone().sub(a).normalize()), mid: a.clone().add(b).multiplyScalar(0.5) });
      }
    });
    const mat = mk('lambert', '#ffffff', 1, floor, { emissive: 0x000000 });
    const im = new InstancedMesh(cyl, mat, Math.max(1, segs.length)), hit = new InstancedMesh(fatCyl, new MeshBasicMaterial(), Math.max(1, segs.length));
    hit.visible = false; disposables.push(hit.material);
    hit.userData.segs = segs; hit.userData.floor = floor; hit.userData.runs = true;
    parent.add(im); parent.add(hit); pickables.push(hit);
    return { im, hit, segs, floor };
  }

  // ---------- Choosing with the pointer ----------
  const ray = new Raycaster(), ndc = new Vector2();
  let cablesOn = true, colourBy = 'purpose', lit = null, selKey = null, focusKey = null, shown = 'all';
  const shownFloor = (f) => !f || shown === 'all' || shown === f;
  function pickAt(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, false).filter((h) => {
      const o = h.object;
      if (!shownFloor(o.userData.floor)) return false;
      if (o.userData.runs) { const s = o.userData.segs[h.instanceId]; return s && (cablesOn || (lit && lit.has(`run:${s.run.id}`))); }
      return true;
    });
    if (!hits.length) return null;
    const keyOf = (h) => (h.object.userData.runs ? `run:${h.object.userData.segs[h.instanceId].run.id}` : h.object.userData.sel);
    // Rooms are big see-through boxes: prefer a smaller thing inside or just behind the room's face.
    const first = hits[0];
    const small = hits.find((h) => !h.object.userData.room && keyOf(h));
    if (first.object.userData.room && small && small.distance < first.distance + 6) return keyOf(small);
    return keyOf(first);
  }
  let down = null;
  const onDown = (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onUp = (e) => {
    if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); const quick = performance.now() - down.t < 600; down = null;
    if (moved < 6 && quick && e.button === 0) hooks.onPick(pickAt(e.clientX, e.clientY));
  };
  let hoverPending = null;
  const onMove = (e) => {
    if (e.buttons) { hooks.onHover(null); return; }
    if (hoverPending) { hoverPending = e; return; }
    hoverPending = e;
    requestAnimationFrame(() => { const ev = hoverPending; hoverPending = null; const k = pickAt(ev.clientX, ev.clientY); renderer.domElement.style.cursor = k ? 'pointer' : ''; hooks.onHover(k, ev); });
  };
  const onLeave = () => hooks.onHover(null);
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerleave', onLeave);
  // The page scrolls under the wheel; Ctrl (or a trackpad pinch) zooms the model.
  const onWheel = (e) => { if (!e.ctrlKey && !e.metaKey) { e.stopImmediatePropagation(); hooks.onWheelHint?.(); } };
  host.addEventListener('wheel', onWheel, { capture: true });

  // ---------- Painting: states, choice, cables ----------
  const tmpC = new Color(), m4 = new Matrix4(), zero = new Matrix4().makeScale(0, 0, 0), sc = new Vector3();
  let states = { room: () => 'none', unit: () => null, run: () => 'idle', circuit: () => null };
  const dimmed = (key) => !!lit && !lit.has(key);
  function paintRooms() {
    for (const { r, fill, edge, m } of roomObj.values()) {
      const st = r.comms ? (states.room(r.id) === 'problem' ? 'problem' : 'comms') : states.room(r.id);
      const key = `room:${r.id}`, on = lit?.has(key), sel = selKey === key || focusKey === key;
      setToken(fill, ROOM_TOKEN[st] ?? ROOM_TOKEN.none); setToken(edge, sel || on ? '--accent' : ROOM_TOKEN[st] ?? ROOM_TOKEN.none);
      setBase(fill, (r.bank ? 0.16 : 0.42) * (dimmed(key) ? 0.3 : on ? 1.5 : 1)); setBase(edge, dimmed(key) ? 0.25 : 1);
      m.userData.problem = st === 'problem' ? 'bad' : null;
    }
  }
  function paintAps() {
    for (const { a, mat, m } of apObj.values()) {
      const st = states.unit(a.tag) ?? 'ok', key = `ap:${a.id}`;
      setToken(mat, lit?.has(key) || focusKey === key ? '--accent' : st === 'ok' ? '--blue' : HEALTH_TOKEN[st]);
      const s = lit?.has(key) || focusKey === key ? 1.6 : 1; m.scale.set(0.13 * s, 0.05, 0.13 * s);
      setBase(mat, dimmed(key) ? 0.35 : 1);
      m.userData.problem = st === 'bad' || st === 'warn' ? st : null;
    }
  }
  function paintRacks() {
    for (const { k, edge, im } of rackObj.values()) {
      const key = `rack:${k.id}`; setToken(edge, lit?.has(key) || selKey === key || focusKey === key ? '--accent' : '--line-strong');
      let worst = null;
      im.userData.items.forEach((it, i) => {
        const st = String(it.h).startsWith('AG-') ? states.unit(it.h) : null;
        const on = lit?.has(it.key) || focusKey === it.key;
        tmpC.copy(on ? T['--accent'] : st === 'bad' ? T['--red'] : st === 'warn' ? T['--amber'] : T[ITEM_TOKEN[it.k]] ?? T['--grey']);
        im.setColorAt(i, tmpC);
        if (st === 'bad' || (st === 'warn' && worst !== 'bad')) worst = st;
      });
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      rackObj.get(k.id).problem = worst;
    }
  }
  function paintTrays() {
    for (const tm of trayMeshes) {
      tm.userData.segs.forEach((s, i) => {
        const on = lit?.has(`tray:${s.t.id}`);
        tmpC.copy(on ? T['--accent'] : s.t.k === 'ladder' ? T['--text-2'] : T['--amber']);
        if (lit && !on) tmpC.lerp(T['--stage-bg'], 0.55);
        tm.setColorAt(i, tmpC);
      });
      if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
    }
  }
  function paintRuns() {
    for (const { im, hit, segs } of runMeshes) {
      segs.forEach((s, i) => {
        const key = `run:${s.run.id}`, on = lit?.has(key) || focusKey === key;
        const show = cablesOn || on;
        if (!show) { im.setMatrixAt(i, zero); hit.setMatrixAt(i, zero); return; }
        const r = on ? 0.035 : 0.012;
        m4.compose(s.mid, s.q, sc.set(r, s.len, r)); im.setMatrixAt(i, m4);
        m4.compose(s.mid, s.q, sc.set(0.09, s.len, 0.09)); hit.setMatrixAt(i, m4);
        if (colourBy === 'health' && !s.run.bb) tmpC.copy(T[HEALTH_TOKEN[states.run(s.run)] ?? '--grey']);
        else tmpC.set(s.run.hex ?? '#888888');
        if (lit && !on) tmpC.lerp(T['--stage-bg'], 0.82);
        im.setColorAt(i, tmpC);
      });
      im.instanceMatrix.needsUpdate = true; hit.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere(); hit.computeBoundingSphere();
    }
  }
  function paintWayIn() {
    for (const { c, mat } of circObj.values()) {
      const st = states.circuit(c.id), key = `circuit:${c.id}`;
      setToken(mat, lit?.has(key) || focusKey === key ? '--accent' : st === 'bad' ? '--red' : st === 'warn' ? '--amber' : '--yellow');
      setBase(mat, dimmed(key) ? 0.3 : 1);
      circObj.get(c.id).problem = st === 'bad' || st === 'warn' ? st : null;
    }
    for (const { e, mat } of entryObj.values()) setToken(mat, lit?.has(`entry:${e.id}`) ? '--accent' : '--ink');
  }

  // Problems glow: a ring on the floor round each, breathing unless motion is reduced (then it stays still).
  const rings = new Map(), ringGeo = new RingGeometry(0.86, 1, 56); disposables.push(ringGeo);
  function paintRings() {
    const want = new Map();
    for (const o of roomObj.values()) if (o.m.userData.problem) want.set(`room:${o.r.id}`, { at: o.centre, r: o.radius, st: 'bad', floor: o.r.f, mats: [o.fill] });
    for (const o of apObj.values()) if (o.m.userData.problem) want.set(`ap:${o.a.id}`, { at: [o.centre[0], o.centre[1], o.centre[2] - 0.02], r: 0.8, st: o.m.userData.problem, floor: o.a.f, mats: [o.mat] });
    for (const o of rackObj.values()) if (o.problem) want.set(`rack:${o.k.id}`, { at: [o.centre[0], o.centre[1], o.centre[2] + 0.03], r: 1.3, st: o.problem, floor: o.k.f, mats: [] });
    for (const o of circObj.values()) if (o.problem) want.set(`circuit:${o.c.id}`, { at: o.centre, r: 1.6, st: o.problem, floor: null, mats: [o.mat] });
    for (const [k, ring] of rings) if (!want.has(k)) { ring.mesh.parent?.remove(ring.mesh); mats.splice(mats.indexOf(ring.mat.userData.e), 1); ring.mat.dispose(); rings.delete(k); }
    for (const [k, w] of want) {
      let ring = rings.get(k);
      if (!ring) { const mat = mk('basic', w.st === 'bad' ? '--red' : '--amber', 0.85, w.floor, { always: true }); const mesh = new Mesh(ringGeo, mat); (w.floor ? floorGroups.get(w.floor) : bld).add(mesh); ring = { mesh, mat }; rings.set(k, ring); }
      setToken(ring.mat, w.st === 'bad' ? '--red' : '--amber');
      ring.mesh.position.set(w.at[0], w.at[1], w.at[2] + 0.03); ring.mesh.scale.setScalar(w.r); ring.mats = w.mats;
    }
    pulse();
  }
  const glowPhase = () => (0.5 - 0.5 * Math.cos((performance.now() / (motion().pulse || 2400)) * Math.PI * 2));
  function pulse() {
    const still = motion().reduced, p = still ? 0.6 : glowPhase();
    for (const ring of rings.values()) {
      setBase(ring.mat, still ? 0.9 : 0.35 + 0.6 * p);
      for (const m of ring.mats ?? []) if (m.emissive) m.emissive.copy(ring.mat.color).multiplyScalar(still ? 0.25 : 0.1 + 0.4 * p);
    }
    for (const o of [...roomObj.values(), ...apObj.values(), ...circObj.values()]) {
      const key = o.r ? `room:${o.r.id}` : o.a ? `ap:${o.a.id}` : `circuit:${o.c.id}`;
      if (!rings.has(key)) for (const m of [o.fill ?? o.mat]) if (m?.emissive) m.emissive.setRGB(0, 0, 0);
    }
  }
  function paintAll() { paintRooms(); paintAps(); paintRacks(); paintTrays(); paintRuns(); paintWayIn(); paintRings(); requestRender(); }

  // ---------- Camera: the house angle, presets, keys, eased moves ----------
  const target = controls.target;
  function boundsFor(which) {
    if (which === 'all') return { min: [bx[0], by[0], 0], max: [bx[1], by[1], Math.max(...D.floors.map((f) => f.level + f.h))] };
    const f = D.floors.find((x) => x.id === which);
    return { min: [bx[0], by[0], f.level - 0.2], max: [bx[1], by[1], f.level + f.h] };
  }
  function viewFor(which, az, el) {
    const b = boundsFor(which);
    const c = world((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    const back = dir, right = new Vector3(0, 1, 0).cross(back).normalize(); if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    const up = back.clone().cross(right).normalize();
    const tanV = Math.tan((camera.fov * Math.PI / 180) / 2), tanH = tanV * camera.aspect;
    let d = 0;
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
      const p = world(x, y, z).sub(c);
      const px = p.dot(right), py = p.dot(up), pz = p.dot(back);
      d = Math.max(d, pz + Math.abs(px) / tanH, pz + Math.abs(py) / tanV);
    }
    d *= 0.98;
    return { target: c, pos: c.clone().add(dir.multiplyScalar(d)) };
  }
  let tween = null;
  function moveTo(v, dur) {
    const M = motion();
    if (M.reduced || !dur) { tween = null; target.copy(v.target); camera.position.copy(v.pos); controls.update(); requestRender(); return; }
    const s0 = new Spherical().setFromVector3(camera.position.clone().sub(target)), s1 = new Spherical().setFromVector3(v.pos.clone().sub(v.target));
    let dt = s1.theta - s0.theta; if (dt > Math.PI) dt -= 2 * Math.PI; if (dt < -Math.PI) dt += 2 * Math.PI;
    tween = { t0: performance.now(), dur, ease: easing(M.ease), from: { t: target.clone(), s: s0 }, to: { t: v.target.clone(), s: s1, dt } };
    requestRender();
  }
  function stepTween(now) {
    if (!tween) return false;
    const k = Math.min(1, (now - tween.t0) / tween.dur), e = tween.ease(k);
    const { from, to } = tween;
    target.lerpVectors(from.t, to.t, e);
    const s = new Spherical(from.s.radius + (to.s.radius - from.s.radius) * e, from.s.phi + (to.s.phi - from.s.phi) * e, from.s.theta + to.dt * e);
    camera.position.copy(target).add(new Vector3().setFromSpherical(s));
    camera.lookAt(target);
    if (k >= 1) { tween = null; controls.update(); }
    return !!tween;
  }
  function preset(name, animate = true) {
    const which = name === 'f3' || name === 'f4' ? name.slice(1) : shown;
    const v = name === 'top' ? viewFor(which, 0, 89.4 * Math.PI / 180) : viewFor(which, AZ, name === 'front' ? EL : 30 * Math.PI / 180);
    moveTo(v, animate ? motion().morph : 0);
  }
  // Keys on the view: arrows turn, Shift and arrows move, plus and minus zoom, 0 or Home go back to the start.
  function key(e) {
    const s = new Spherical().setFromVector3(camera.position.clone().sub(target));
    const step = motion().state || 300;
    let t = target.clone();
    if (e.shiftKey && e.key.startsWith('Arrow')) {
      const dist = s.radius * 0.08, right = new Vector3().setFromMatrixColumn(camera.matrix, 0), up = new Vector3().setFromMatrixColumn(camera.matrix, 1);
      const mv = { ArrowLeft: right.multiplyScalar(-dist), ArrowRight: right.multiplyScalar(dist), ArrowUp: up.multiplyScalar(dist), ArrowDown: up.multiplyScalar(-dist) }[e.key];
      t = t.add(mv);
    } else if (e.key === 'ArrowLeft') s.theta -= Math.PI / 12;
    else if (e.key === 'ArrowRight') s.theta += Math.PI / 12;
    else if (e.key === 'ArrowUp') s.phi = Math.max(0.02, s.phi - Math.PI / 18);
    else if (e.key === 'ArrowDown') s.phi = Math.min(controls.maxPolarAngle, s.phi + Math.PI / 18);
    else if (e.key === '+' || e.key === '=') s.radius = Math.max(controls.minDistance, s.radius * 0.8);
    else if (e.key === '-' || e.key === '_') s.radius = Math.min(controls.maxDistance, s.radius * 1.25);
    else if (e.key === '0' || e.key === 'Home') { preset('front'); return true; }
    else return false;
    moveTo({ target: t, pos: t.clone().add(new Vector3().setFromSpherical(s)) }, step);
    return true;
  }

  // ---------- Drawing only when something changed ----------
  let pending = false, onScreen = true, pulseTimer = 0, alive = true;
  function requestRender() { if (!pending && alive) { pending = true; requestAnimationFrame(frame); } }
  function frame(now) {
    pending = false; if (!alive) return;
    const moving = stepTween(now);
    if (rings.size && !motion().reduced) pulse();
    renderer.render(scene, camera);
    placeLabels();
    if (moving) requestRender();
    else if (rings.size && !motion().reduced && onScreen && !document.hidden) { clearTimeout(pulseTimer); pulseTimer = setTimeout(requestRender, 50); }
  }
  controls.addEventListener('change', requestRender);
  const v3 = new Vector3();
  function placeLabels() {
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    for (const l of labels) {
      const show = shownFloor(l.floor) && (!l.floor || floorAlpha.get(l.floor) > 0.5);
      v3.copy(l.at).project(camera);
      const vis = show && v3.z < 1 && Math.abs(v3.x) < 1.05 && Math.abs(v3.y) < 1.05;
      l.el.hidden = !vis;
      if (vis) l.el.style.transform = `translate(${Math.round((v3.x + 1) / 2 * w)}px, ${Math.round((1 - v3.y) / 2 * h)}px) translate(-50%, -50%)`;
    }
  }
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); requestRender();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);
  const io = new IntersectionObserver((es) => { onScreen = es[0]?.isIntersecting ?? true; if (onScreen) requestRender(); }); io.observe(host);
  const onVis = () => { if (!document.hidden) requestRender(); };
  document.addEventListener('visibilitychange', onVis);

  // ---------- Floors: show all, or one, fading the other ----------
  let fadeT = null;
  function setFloors(which, animate = true) {
    shown = which;
    const goal = new Map(D.floors.map((f) => [f.id, which === 'all' || which === f.id ? 1 : 0]));
    const M = motion(), start = new Map(floorAlpha), t0 = performance.now(), dur = animate && !M.reduced ? M.state : 0, ease = easing(M.ease);
    cancelAnimationFrame(fadeT);
    const step = () => {
      const k = dur ? Math.min(1, (performance.now() - t0) / dur) : 1, e = ease(k);
      for (const f of D.floors) { const a = start.get(f.id) + (goal.get(f.id) - start.get(f.id)) * e; floorAlpha.set(f.id, a); floorGroups.get(f.id).visible = a > 0.004; }
      for (const m of mats) if (m.floor) applyOpacity(m);
      requestRender();
      if (k < 1) fadeT = requestAnimationFrame(step);
    };
    step();
  }

  // ---------- Looks and light or dark ----------
  function recolour() {
    T = readTokens(host); MO = readMotion();
    for (const e of mats) e.m.color.copy(T[e.token] ?? new Color(e.token));
    paintAll();
  }

  resize();
  preset('front', false);
  paintAll();

  return {
    setFloors,
    setCables(on) { cablesOn = on; paintRuns(); requestRender(); },
    setColour(mode) { colourBy = mode; paintRuns(); requestRender(); },
    setStates(s) { states = s; paintAll(); },
    light(set, sel) { lit = set; selKey = sel; paintAll(); },
    focus(key) { if (focusKey === key) return; focusKey = key; paintAll(); },
    preset, key, recolour, requestRender,
    dispose() {
      alive = false; clearTimeout(pulseTimer); cancelAnimationFrame(fadeT);
      ro.disconnect(); io.disconnect(); rm.removeEventListener?.('change', onRm); document.removeEventListener('visibilitychange', onVis); host.removeEventListener('wheel', onWheel, { capture: true });
      controls.dispose();
      scene.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
      for (const d of disposables) d.dispose?.();
      for (const e of mats) e.m.dispose();
      renderer.dispose(); renderer.domElement.remove();
      for (const l of labels) l.el.remove();
    },
  };
}
