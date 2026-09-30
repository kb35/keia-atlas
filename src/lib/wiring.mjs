// Works out which cables apply in a space and lays them out as a diagram.
// Same rules as the validator (tools/crossrefs.mjs): a cable applies when its "when" kit is fitted,
// its "unless" kit is not, and every optional device it touches is fitted.
import { models, className, modelName, LOC_LABEL, CONNECTOR_LABEL } from './data.mjs';

export const CABLE_LABEL = {
  hdmi: 'HDMI', displayport: 'DisplayPort', usb: 'USB', 'usb-c': 'USB-C', thunderbolt: 'Thunderbolt', cat6: 'Cat 6', cat6a: 'Cat 6A',
  audio: 'Audio', 'poly-mic': 'Poly microphone', speaker: 'Speaker', power: 'Power', proprietary: 'Vendor cable',
};
export function cableColour(link) {
  const c = link.cable;
  if (c === 'hdmi' || c === 'displayport') return 'var(--c-hdmi)';
  if (c === 'usb' || c === 'usb-c' || c === 'thunderbolt') return 'var(--c-usb)';
  if (c === 'cat6a' && /hdbaset/.test(link.from + link.to)) return 'var(--c-hdbt)';
  if (c === 'cat6' || c === 'cat6a') return 'var(--c-lan)';
  if (c === 'power') return 'var(--c-power)';
  if (c === 'audio' || c === 'poly-mic' || c === 'speaker') return 'var(--c-audio)';
  return 'var(--grey)';
}

function parse(ep) {
  if (ep === 'laptop') return { node: 'laptop', port: 'cable', kind: 'laptop' };
  if (ep === 'home-router') return { node: 'home-router', port: 'LAN', kind: 'router' };
  const om = /^outlet:([a-z-]+)\/([a-z-]+)#(\d+)$/.exec(ep);
  if (om) return { node: `outlet:${om[1]}/${om[2]}`, port: `#${om[3]}`, kind: 'outlet', service: om[1], location: om[2] };
  const m = /^([a-z0-9-]+)(?:#(\d+))?\.([a-z0-9-]+)$/.exec(ep);
  return { node: `${m[1]}#${m[2] ?? 1}`, key: m[1], n: +(m[2] ?? 1), port: m[3], kind: 'device' };
}

export function activeLinks(option, fitted) {
  const items = new Map(option.equipment.map((e) => [e.key, e]));
  const on = (k) => items.get(k)?.requirement !== 'optional' || fitted.has(k);
  return (option.wiring ?? []).filter((l) => {
    if (l.when && !fitted.has(l.when)) return false;
    if (l.unless && fitted.has(l.unless)) return false;
    return [l.from, l.to].map(parse).every((e) => e.kind !== 'device' || on(e.key));
  });
}

const SERVICE = { power: 'Power', data: 'Data', 'direct-run': 'Direct run' };

// Returns a left-to-right signal-flow diagram: where a signal starts (laptop, cameras, microphones,
// players) on the left, what carries and switches it (extenders, scalers, codec, video bar) in the
// middle, and where it ends (displays, speakers, the network) on the right. Power and network
// outlets are not drawn as long lines: each device lists the outlets it plugs into underneath its
// name, so every drawn line is a signal between two devices.
const RANK = {
  laptop: 0, camera: 1, microphone: 1, 'touch-controller': 1, 'signage-player': 1, 'scheduler-panel': 1, printer: 1, 'security-device': 1, 'building-sensor': 1,
  'av-extender': 2, adapter: 2, dock: 2, 'av-switcher': 3, 'desk-video-device': 4, codec: 4, 'video-bar': 4,
  amplifier: 5, display: 6, monitor: 6, loudspeaker: 6, 'network-switch': 7, 'network-gateway': 8, router: 9,
};
const SINKS = new Set(['display', 'monitor', 'loudspeaker']);
const OUTLET_WHERE = { 'behind-display': 'behind the display', 'below-table': 'under the table', 'floor-box': 'floor box', 'room-entrance': 'at the door', 'table-top': 'on the desk', 'wall-below-table': 'wall, below the desk', 'wall-behind-storage': 'behind the storage', ceiling: 'ceiling', wall: 'wall', tbd: 'set per project' };

export function layout(option, links, { maxWidth = 1100 } = {}) {
  const items = new Map(option.equipment.map((e) => [e.key, e]));
  const nodes = new Map();
  const node = (e) => {
    if (!nodes.has(e.node)) {
      let title, sub = '', cls;
      if (e.kind === 'laptop') { title = 'Laptop'; sub = "The person's own"; cls = 'laptop'; }
      else if (e.kind === 'router') { title = 'Home router'; sub = "The worker's own"; cls = 'router'; }
      else {
        const it = items.get(e.key);
        const q = it && typeof it.quantity === 'number' && it.quantity > 1;
        title = `${it?.role?.split(':')[0] ?? className(it?.class)}${q ? ` ${e.n}` : ''}`;
        sub = it?.model ? modelName(it.model) : 'Model set per project';
        cls = it?.class;
      }
      nodes.set(e.node, { id: e.node, key: e.key, kind: e.kind, cls, title, sub, inP: [], outP: [], stubs: [], ups: new Set(), downs: new Set(), rank: RANK[cls] ?? 3 });
    }
    return nodes.get(e.node);
  };
  const edges = [];
  for (const l of links) {
    const a = parse(l.from), b = parse(l.to);
    if (a.kind === 'outlet' || b.kind === 'outlet') {
      // A stub: the device end lists the outlet it uses.
      const [dev, out] = a.kind === 'outlet' ? [b, a] : [a, b];
      const n = node(dev);
      const label = `${out.service === 'power' ? 'Power' : 'Network'}, ${OUTLET_WHERE[out.location] ?? out.location} ${out.port}`;
      n.stubs.push({ service: out.service, label, link: l, port: dev.port });
      continue;
    }
    const na = node(a), nb = node(b);
    // Which way the signal runs: the laptop is always a source, the home router always a sink;
    // then port names (out, in); then the transmitter and receiver of a pair; then the kind of device.
    let up = null;
    if (a.kind === 'laptop' || b.kind === 'router') up = 'a';
    else if (b.kind === 'laptop' || a.kind === 'router') up = 'b';
    else if (/out/.test(a.port) || /-in(-|$)/.test(b.port)) up = 'a';
    else if (/out/.test(b.port) || /-in(-|$)/.test(a.port)) up = 'b';
    else if (/hdbaset/.test(a.port) && /hdbaset/.test(b.port)) up = /(^|-)(tx|wall-plate$)/.test(a.key) || /rx/.test(b.key) ? 'a' : 'b';
    else up = na.rank <= nb.rank ? 'a' : 'b';
    const [U, D, pu, pd] = up === 'a' ? [na, nb, a.port, b.port] : [nb, na, b.port, a.port];
    if (!U.outP.includes(pu)) U.outP.push(pu);
    if (!D.inP.includes(pd)) D.inP.push(pd);
    edges.push({ link: l, U, D, pu, pd, colour: cableColour(l) });
  }
  // Layers: the longest signal path from a source, so every line runs left to right.
  const list = [...nodes.values()];
  const out = new Map(list.map((n) => [n, []])), indeg = new Map(list.map((n) => [n, 0]));
  const seen = new Set();
  for (const e of edges) {
    const k = `${e.U.id}>${e.D.id}`;
    if (seen.has(k) || e.U === e.D) continue;
    seen.add(k); out.get(e.U).push(e.D); indeg.set(e.D, indeg.get(e.D) + 1);
  }
  const layer = new Map(list.map((n) => [n, 0]));
  const queue = list.filter((n) => indeg.get(n) === 0);
  const done = new Set();
  while (done.size < list.length) {
    let n = queue.shift();
    if (!n) n = list.filter((x) => !done.has(x)).sort((p, q) => p.rank - q.rank)[0]; // a loop: break it
    if (done.has(n)) continue;
    done.add(n);
    for (const m of out.get(n)) {
      if (done.has(m)) continue;
      layer.set(m, Math.max(layer.get(m), layer.get(n) + 1));
      indeg.set(m, indeg.get(m) - 1);
      if (indeg.get(m) === 0) queue.push(m);
    }
  }
  for (const e of edges) { e.U.downs.add(e.D.id); e.D.ups.add(e.U.id); }
  // Devices with no signal lines (a panel on the network) sit by what they are.
  const connected = new Set(edges.flatMap((e) => [e.U, e.D]));
  let maxL = Math.max(0, ...[...connected].map((n) => layer.get(n)));
  for (const n of list) if (!connected.has(n)) layer.set(n, n.rank <= 1 ? 0 : SINKS.has(n.cls) ? maxL : Math.min(maxL, 1));
  // Pull displays and speakers to the right, and sources that feed only one thing next to it.
  for (const n of list) if (SINKS.has(n.cls) && connected.has(n) && out.get(n).length === 0) layer.set(n, maxL);
  for (let pass = 0; pass < 2; pass++) for (const n of list) {
    const d = out.get(n); if (!d.length || !connected.has(n)) continue;
    const want = Math.min(...d.map((m) => layer.get(m))) - 1;
    if (want > layer.get(n) && ![...nodes.values()].some((x) => out.get(x).includes(n) && layer.get(x) >= want)) layer.set(n, want);
  }
  // Squeeze out empty layers.
  const used = [...new Set(list.map((n) => layer.get(n)))].sort((a, b) => a - b);
  const colOf = new Map(used.map((l, i) => [l, i]));
  for (const n of list) n.col = colOf.get(layer.get(n));
  const cols = used.length;
  // Order within each column to keep lines short and uncrossed (a few barycentre sweeps).
  const byCol = Array.from({ length: cols }, (_, c) => list.filter((n) => n.col === c).sort((p, q) => p.rank - q.rank || p.title.localeCompare(q.title)));
  const pos = new Map();
  const setPos = () => byCol.forEach((col) => col.forEach((n, i) => pos.set(n, i / Math.max(1, col.length - 1 || 1))));
  setPos();
  const nb = new Map(list.map((n) => [n, []]));
  for (const e of edges) { nb.get(e.U).push(e.D); nb.get(e.D).push(e.U); }
  for (let it = 0; it < 6; it++) {
    for (const col of it % 2 ? [...byCol].reverse() : byCol) {
      col.forEach((n) => { const ns = nb.get(n); n.bc = ns.length ? ns.reduce((s, m) => s + pos.get(m), 0) / ns.length : pos.get(n); });
      col.sort((p, q) => p.bc - q.bc);
    }
    setPos();
  }
  // Geometry: columns fill the width; every node shows its title, model, signal ports, then outlets.
  const GAP_MIN = 46;
  let NW = Math.min(210, Math.floor((maxWidth - (cols - 1) * 70) / cols));
  if (NW < 150) NW = Math.max(132, Math.floor((maxWidth - (cols - 1) * GAP_MIN) / cols));
  const GAP = cols > 1 ? Math.max(GAP_MIN, Math.min(110, Math.floor((maxWidth - cols * NW) / (cols - 1)))) : 0;
  const width = cols * NW + (cols - 1) * GAP;
  const CH = Math.floor((NW - 52) / 6.9); // characters per title line at 12.5px, clear of the icon
  const CS = Math.floor((NW - 20) / 5.9); // characters per model line at 11px
  const wrap = (t, n) => { const w = t.split(' '), ls = ['']; for (const x of w) { if ((ls[ls.length - 1] + ' ' + x).trim().length > n && ls[ls.length - 1]) ls.push(x); else ls[ls.length - 1] = (ls[ls.length - 1] + ' ' + x).trim(); } return ls.slice(0, 2).map((l, i, a) => (i === 1 && w.join(' ').length > a.join(' ').length ? l.slice(0, n - 1) + '…' : l)); };
  const portLabel = (n, p) => {
    if (n.kind !== 'device') return p;
    const it = items.get(n.key);
    const port = it?.model ? models[it.model]?.ports?.find((q) => q.id === p) : null;
    return port ? `${p} · ${CONNECTOR_LABEL[port.connector] ?? port.connector}` : p;
  };
  const TOP = 26, ROW = 17, VGAP = 16;
  let height = 0;
  byCol.forEach((col, c) => {
    let y = TOP;
    for (const n of col) {
      n.x = c * (NW + GAP); n.w = NW; n.y = y;
      n.tl = wrap(n.title, CH);
      n.sl = n.sub.length > CS ? n.sub.slice(0, CS - 1) + '…' : n.sub;
      const head = 12 + n.tl.length * 15 + 15;
      const ports = [...new Set([...n.inP, ...n.outP])];
      n.rows = ports.map((p, i) => ({ id: p, label: portLabel(n, p), y: y + head + 4 + i * ROW + ROW / 2, isIn: n.inP.includes(p), isOut: n.outP.includes(p) }));
      const stubY = y + head + 6 + ports.length * ROW;
      // One line per outlet group: "Power, behind the display #1" and so on, shortest first.
      const CO = Math.floor((NW - 30) / 5.7);
      n.stubRows = n.stubs.map((s, i) => ({ ...s, short: s.label.length > CO ? s.label.slice(0, CO - 1) + '…' : s.label, y: stubY + 8 + i * 15 }));
      n.h = head + 8 + ports.length * ROW + (n.stubs.length ? n.stubs.length * 15 + 8 : 0) + 4;
      y += n.h + VGAP;
    }
    height = Math.max(height, y);
  });
  // Centre short columns against the tallest.
  byCol.forEach((col) => {
    const bottom = col.length ? col[col.length - 1].y + col[col.length - 1].h : TOP;
    const shift = Math.max(0, Math.floor((height - VGAP - bottom) / 2));
    for (const n of col) { n.y += shift; n.rows.forEach((r) => (r.y += shift)); n.stubRows.forEach((r) => (r.y += shift)); }
  });
  // Lines: from the right side of the source port to the left side of the destination port.
  for (const e of edges) {
    const ya = e.U.rows.find((r) => r.id === e.pu).y, yb = e.D.rows.find((r) => r.id === e.pd).y;
    if (e.U.col < e.D.col) {
      const xa = e.U.x + e.U.w, xb = e.D.x, mid = Math.max(24, (xb - xa) * 0.5);
      e.d = `M${xa},${ya} C${xa + mid},${ya} ${xb - mid},${yb} ${xb},${yb}`;
      e.ends = [[xa, ya], [xb, yb]];
    } else {
      // Same column (rare): a short loop on the right.
      const xa = e.U.x + e.U.w, xb = e.D.x + e.D.w, bulge = 30 + Math.abs(yb - ya) * 0.12;
      e.d = `M${xa},${ya} C${xa + bulge},${ya} ${xb + bulge},${yb} ${xb},${yb}`;
      e.ends = [[xa, ya], [xb, yb]];
    }
  }
  // Three headings over the columns: where signals start, what carries and switches them, where
  // they end. The middle one spans every column between the first and the last.
  const colX = (c) => c * (NW + GAP);
  const last = byCol[cols - 1] ?? [];
  const endLabel = last.some((n) => ['router', 'network-gateway', 'network-switch'].includes(n.cls)) && !last.some((n) => SINKS.has(n.cls)) ? 'Network' : 'Where it ends';
  const heads = cols === 1 ? [{ x0: 0, x1: NW, label: 'Devices' }]
    : [{ x0: 0, x1: NW, label: 'Where it starts' },
      ...(cols > 2 ? [{ x0: colX(1), x1: colX(cols - 2) + NW, label: byCol.slice(1, -1).flat().every((n) => ['av-extender', 'adapter'].includes(n.cls)) ? 'Carried' : 'Carried, switched and processed' }] : []),
      { x0: colX(cols - 1), x1: colX(cols - 1) + NW, label: endLabel }];
  const nodesOut = list.map((n) => ({ ...n, ups: [...n.ups], downs: [...n.downs] }));
  return { width, height: height - VGAP + 8, nodes: nodesOut, edges, heads, cols };
}

export function describe(ep, option) {
  const e = parse(ep);
  if (e.kind === 'laptop') return 'Laptop';
  if (e.kind === 'router') return 'Home router';
  if (e.kind === 'outlet') return `${SERVICE[e.service]} outlet ${e.port.slice(1)}, ${(LOC_LABEL[e.location] ?? e.location).toLowerCase()}`;
  const it = option.equipment.find((x) => x.key === e.key);
  const name = it?.role?.split(':')[0] ?? className(it?.class);
  const q = it && typeof it.quantity === 'number' && it.quantity > 1;
  return `${name}${q ? ` ${e.n}` : ''}, ${e.port}`;
}
