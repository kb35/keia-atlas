// A room profile as a tiny floor plan, drawn to scale against the largest room (so a focus room looks
// small next to a large conference room): walls, the display wall, table and chairs, the door.
// Nothing about devices; it's there to recognise the kind of room at a glance. viewBox 0 0 120 80.
const num = (v) => (v && typeof v === 'object' ? v.max ?? v.min : v);

export function planSvg(id, t) {
  const rs = t.keia_atlas;
  const area = num(rs.area?.m2) ?? (id.startsWith('workstation') ? 40 : id === 'cafeteria' ? 90 : id === 'reception-concierge' ? 30 : 20);
  const cap = num(rs.capacity?.max) ?? 4;
  // Scale: 90 m² fills the frame; the smallest rooms stay readable.
  const k = Math.max(0.3, Math.min(1, Math.sqrt(area / 90)));
  const w = Math.round(108 * k), h = Math.round(68 * k);
  const x = (120 - w) / 2, y = (80 - h) / 2;
  const cx = 60, cy = y + h / 2 + 2;
  const p = [];
  p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" class="pl-room"/>`);
  // Door: a gap and a swing at the bottom right.
  const dw = Math.max(7, 11 * k);
  p.push(`<path d="M${x + w - dw - 4} ${y + h}h${dw}" class="pl-gap"/><path d="M${x + w - 4} ${y + h}a${dw} ${dw} 0 0 0 -${dw} -${dw}" class="pl-door"/>`);
  const chair = (a, b) => p.push(`<circle cx="${a.toFixed(1)}" cy="${b.toFixed(1)}" r="${Math.max(1.6, 2.6 * k).toFixed(1)}" class="pl-chair"/>`);
  const cat = rs.category;
  if (id === 'mdf' || id === 'idf') {
    const n = id === 'mdf' ? 4 : 2;
    for (let i = 0; i < n; i++) p.push(`<rect x="${cx - (n * 11) / 2 + i * 11}" y="${y + 6}" width="9" height="${Math.min(18, h * 0.5)}" rx="1" class="pl-rack"/>`);
  } else if (id === 'it-store') {
    // Storage cabinets standing along the back wall, each with its shelves, and a shelf unit down the left side.
    const n = Math.max(2, Math.min(4, Math.floor((w - 12) / 16)));
    const cw = Math.min(14, (w - 12) / n - 2);
    for (let i = 0; i < n; i++) {
      const cx0 = x + 6 + i * (cw + 2);
      p.push(`<rect x="${cx0.toFixed(1)}" y="${y + 3}" width="${cw.toFixed(1)}" height="9" rx="1" class="pl-rack"/>`);
      for (const f of [0.33, 0.66]) p.push(`<path d="M${cx0.toFixed(1)} ${(y + 3 + 9 * f).toFixed(1)}h${cw.toFixed(1)}" class="pl-shelf"/>`);
    }
    p.push(`<rect x="${x + 3}" y="${y + 16}" width="5" height="${Math.max(10, h - 34)}" rx="1" class="pl-dev"/>`);
  } else if (id.startsWith('workstation')) {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      const dx = x + 8 + c * ((w - 16) / 4), dy = y + 10 + r * (h / 2 - 2);
      p.push(`<rect x="${dx}" y="${dy}" width="${(w - 16) / 4 - 3}" height="7" rx="1" class="pl-table"/>`); chair(dx + ((w - 16) / 4 - 3) / 2, dy + 11);
    }
  } else if (['pantry', 'pantry-expanded', 'cafeteria'].includes(id)) {
    p.push(`<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="6" rx="1" class="pl-counter"/>`);
    const n = id === 'pantry' ? 3 : 5;
    for (let i = 0; i < n; i++) {
      const tx = x + 14 + (i * (w - 28)) / (n - 1), ty = cy + 6;
      p.push(`<circle cx="${tx}" cy="${ty}" r="${5 * k + 2}" class="pl-table"/>`);
      [0, 1, 2, 3].forEach((q) => chair(tx + Math.cos(q * Math.PI / 2) * (8 * k + 4), ty + Math.sin(q * Math.PI / 2) * (8 * k + 4)));
    }
  } else if (id === 'reception-concierge') {
    p.push(`<path d="M${cx - 16} ${cy - 4}q16 14 32 0" class="pl-desk"/>`); chair(cx, cy - 2);
  } else if (id === 'copy-print-room') {
    p.push(`<rect x="${x + 4}" y="${y + 4}" width="${w * 0.5}" height="${h * 0.35}" rx="1" class="pl-dev"/>`);
  } else if (id === 'remote-home') {
    p.length = 0;
    p.push(`<path d="M38 44l22-18 22 18v22H38z" class="pl-room"/><rect x="52" y="50" width="16" height="9" rx="1" class="pl-table"/>`);
  } else {
    // Meeting-style rooms: a display wall at the top, a table, chairs down both sides.
    if (cat === 'connect' || id === 'presentation-recording-room' || id === 'makerspace') p.push(`<path d="M${cx - w * 0.28} ${y + 2.5}h${w * 0.56}" class="pl-display"/>`);
    const seats = Math.min(cap, 14);
    const oval = id === 'makerspace';
    const tw = Math.max(10, w * (seats > 2 ? 0.34 : 0.3)), th = Math.max(6, Math.min(h * 0.6, 4 + seats * 3.2 * k));
    if (seats <= 1) {
      p.push(`<rect x="${cx - 9}" y="${y + 5}" width="18" height="7" rx="1" class="pl-table"/>`); chair(cx, y + 16);
    } else {
      p.push(oval ? `<ellipse cx="${cx}" cy="${cy}" rx="${tw / 2}" ry="${th / 2}" class="pl-table"/>` : `<rect x="${cx - tw / 2}" y="${cy - th / 2}" width="${tw}" height="${th}" rx="${Math.min(3, th / 3)}" class="pl-table"/>`);
      const per = Math.ceil(seats / 2);
      for (let i = 0; i < per; i++) {
        const yy = cy - th / 2 + (th * (i + 0.5)) / per;
        chair(cx - tw / 2 - 3.5 * k - 1.5, yy);
        if (i < seats - per) chair(cx + tw / 2 + 3.5 * k + 1.5, yy);
      }
    }
  }
  return p.join('');
}
