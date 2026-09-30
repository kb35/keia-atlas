// Replay (UX-V2 §8, BUILD-PLAN V6 H3): a floor, or a job on it, over time. Pure: no data imports and no DOM, so it
// is tested on its own (tests/replay.test.mjs); src/lib/replay-client.mjs draws it and src/lib/lens-data.mjs feeds
// it the jobs at build time.
//
// A window is { id, label, kind: 'day' | 'job', frames }. A frame is one moment:
//   { at: '2026-09-28T07:52' (zoneless, the office's local time), caption, src?, health: { <space id>: state } }
// where state is 'fault' | 'review' | 'progress' for a space that is not fine at that moment (the rest are fine),
// or, for a day's frames from the live simulation, the room's own state ('use' | 'free' | 'problem' | 'closed').
//
// Frames are still: the strip is small multiples, read side by side. Play (only when pressed) steps one frame per
// --replay-step. The export is one self-contained page: the strip, each frame's words and the job's timeline.

const pad = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const firstSentence = (s) => String(s ?? '').replace(/^(.*?[.!?])\s.*$/, '$1');

/** "07:52" from a zoneless time. */
export const clock = (at) => String(at).slice(11, 16);
/** "07:52, 28 Sept" from a zoneless time. */
export const stamp = (at) => `${clock(at)}, ${+String(at).slice(8, 10)} ${MON[+String(at).slice(5, 7) - 1]}`;
/** A zoneless time plus minutes (the arithmetic is done as if in UTC, so no zone shifts it). */
export function addMin(at, min) {
  const d = new Date(`${String(at).slice(0, 16)}:00Z`); d.setUTCMinutes(d.getUTCMinutes() + min);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

// ---- A job over time ----------------------------------------------------------------------------------------------
// jobs: [{ number, room, prio, opened, state, short, history: [{ at, state?, note, who }], lastSeen?, lastSeenSays?,
//   lastSeenFrom?, heldAt?, stateWord?, with? }]
// for every job on the floor, so each frame shows the whole floor as it was. `focus` is the job whose events are the
// frames. A job is Fault from when it opened (or from lastSeen, when its unit was last heard from) while P1 to P3 and
// not on hold; To review while P4 or on hold; gone once resolved.
function stateAt(job, at) {
  let st = null;
  for (const h of job.history ?? []) if (h.at <= at && h.state) st = h.state;
  return st ?? (job.opened <= at ? 'new' : null);
}
export function healthAt(jobs, at, focus = null) {
  const out = {}, RANK = { fault: 0, review: 1 };
  for (const j of jobs) {
    const st = stateAt(j, at);
    let h = null;
    if (st && st !== 'resolved') h = j.prio <= 3 && st !== 'on-hold' ? 'fault' : 'review';
    else if (!st && focus && j.number === focus && j.lastSeen && j.lastSeen <= at) h = 'fault';   // down, not yet a ticket
    if (h && (!out[j.room] || RANK[h] < RANK[out[j.room]])) out[j.room] = h;
  }
  return out;
}
export function jobWindow(jobs, number) {
  const j = jobs.find((x) => x.number === number);
  if (!j) return null;
  const times = [];
  const first = j.lastSeen && j.lastSeen < j.opened ? j.lastSeen : j.opened;
  times.push({ at: addMin(first, -30), caption: 'As it was, before anything was reported', src: 'Keia Atlas' });
  if (j.lastSeen && j.lastSeen < j.opened) times.push({ at: j.lastSeen, caption: firstSentence(j.lastSeenSays ?? 'The unit stopped reporting.'), src: j.lastSeenFrom ?? 'Monitoring' });
  for (const h of j.history ?? []) times.push({ at: h.at, caption: firstSentence(h.note ?? `Now ${h.state}`), src: h.who ?? 'Keia Atlas' });
  if (j.heldAt && j.heldAt > times[times.length - 1].at) times.push({ at: j.heldAt, caption: `As it stands: ${j.stateWord ?? j.state}${j.with ? `, offered to ${j.with}` : ''}`, src: 'Keia Atlas' });
  const frames = times.sort((a, b) => a.at.localeCompare(b.at)).map((f) => ({ ...f, health: healthAt(jobs, f.at, number) }));
  return { id: number.toLowerCase(), kind: 'job', label: `${number} · ${clock(j.opened)} ${j.short}`, short: `${number} from ${clock(frames[1]?.at ?? j.opened)}`, room: j.room, frames };
}

// ---- A day, by the hour -----------------------------------------------------------------------------------------
// The hours of the office's day (07:00 to 19:00 local) up to `nowLocal` (a zoneless local time), one frame each;
// if the office has not opened yet today, the day before. Returns the zoneless times; the client takes a snapshot of
// the simulation at each (src/lib/livesim.mjs) for the rooms' states.
export function dayHours(nowLocal, hours = [7, 19]) {
  const day = String(nowLocal).slice(0, 10), h = +String(nowLocal).slice(11, 13);
  const d = h < hours[0] ? addMin(`${day}T00:00`, -1440).slice(0, 10) : day;
  const last = h < hours[0] ? hours[1] : Math.min(hours[1], h);
  const out = [];
  for (let k = hours[0]; k <= last; k++) out.push(`${d}T${pad(k)}:00`);
  return out;
}

// ---- The sentence in the band, in the past tense --------------------------------------------------------------------
export function pastSentence(frame) {
  const vals = Object.values(frame.health ?? {});
  const bad = vals.filter((h) => h === 'fault' || h === 'problem').length, rev = vals.filter((h) => h === 'review').length;
  const tail = bad ? `${bad} ${bad === 1 ? 'space was' : 'spaces were'} not working` : rev ? `${rev} ${rev === 1 ? 'space was' : 'spaces were'} to review` : 'every space was working';
  return `At ${clock(frame.at)}: ${tail}`;
}

// ---- A frame as a small plan ------------------------------------------------------------------------------------
// plan: { vb: [x, y, w, h], outline: 'x,y x,y ...', rooms: [{ id, x, y, w, h }] } in the floor plan's own units.
// Spaces not fine take their state's soft fill and edge; a ring sits on each, sized to the plan, so every frame
// reads at the same scale. Colours are the page's tokens, with fallbacks for the exported page.
const TONE = { fault: 'fault', problem: 'fault', review: 'review', progress: 'progress', use: null, free: null, closed: null };
export function frameSvg(plan, health = {}, { title = '' } = {}) {
  const r0 = Math.max(plan.vb[2], plan.vb[3]) / 60;
  const rooms = plan.rooms.map((r) => {
    const t = TONE[health[r.id]] ?? null, closed = health[r.id] === 'closed', use = health[r.id] === 'use';
    return `<rect class="rp-r${t ? ` rp-${t}` : ''}${closed ? ' rp-closed' : ''}${use ? ' rp-use' : ''}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`
      + (t ? `<circle class="rp-g rp-${t}" cx="${(r.x + r.w / 2).toFixed(2)}" cy="${(r.y + r.h / 2).toFixed(2)}" r="${r0.toFixed(2)}"${t === 'fault' ? ` stroke-dasharray="${(r0 * 2.1).toFixed(2)} ${(r0 * 1.05).toFixed(2)}"` : t === 'review' ? ` stroke-dasharray="${(r0 * 5.2).toFixed(2)} ${(r0 * 1.08).toFixed(2)}"` : ''}/>` : '');
  }).join('');
  return `<svg viewBox="${plan.vb.join(' ')}" role="img" aria-label="${esc(title)}"><polygon class="rp-o" points="${plan.outline}"/>${rooms}</svg>`;
}

// ---- The export: one page ---------------------------------------------------------------------------------------
// { title, where, window, frames: [{ at, caption, src, svg }], timeline?: [{ at, what, who }], note }
export function exportHtml({ title, where, windowLabel, frames, timeline = [], note }) {
  const css = `body{font:14px/1.45 system-ui,sans-serif;color:#1f1d1a;background:#fff;margin:32px;max-width:1080px}
h1{font-size:22px;margin:0 0 4px}p{margin:4px 0}.sim{display:inline-block;font:600 11px/1 system-ui;letter-spacing:.06em;text-transform:uppercase;padding:4px 7px;border:1px solid #8c857a;border-radius:4px;color:#4a453f}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin:18px 0}figure{margin:0;border:1px solid #d9d3c8;border-radius:8px;padding:10px;break-inside:avoid}
figcaption{font-size:12.5px;margin-top:6px}figcaption b{font-family:ui-monospace,monospace}svg{width:100%;height:auto;display:block}
.rp-o{fill:#f6f3ee;stroke:#8c857a;stroke-width:.12}.rp-r{fill:#fff;stroke:#b8b0a3;stroke-width:.08}.rp-closed{fill:#ece8e1}.rp-use{fill:#efebe4}
.rp-r.rp-fault{fill:#fbe3d6;stroke:#d55e00;stroke-width:.2}.rp-r.rp-review{fill:#f6ead2;stroke:#b36b00}.rp-r.rp-progress{fill:#dde7f2;stroke:#2a5b8f}
.rp-g{fill:none;stroke-width:.35}.rp-g.rp-fault{stroke:#d55e00}.rp-g.rp-review{stroke:#b36b00}.rp-g.rp-progress{stroke:#2a5b8f}
table{border-collapse:collapse;width:100%;margin-top:8px}td,th{text-align:left;padding:6px 8px;border-top:1px solid #e6e1d8;vertical-align:top}th{font-weight:600}
.key{display:flex;gap:16px;font-size:12.5px;color:#4a453f}.key i{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:6px;vertical-align:-2px}`;
  const figs = frames.map((f) => `<figure>${f.svg}<figcaption><b>${esc(stamp(f.at))}</b> · ${esc(f.caption)}${f.src ? ` <span style="color:#6b655c">(${esc(f.src)})</span>` : ''}</figcaption></figure>`).join('');
  const rows = timeline.map((t) => `<tr><td><b>${esc(stamp(t.at))}</b></td><td>${esc(t.who ?? '')}</td><td>${esc(t.what)}</td></tr>`).join('');
  return `<!doctype html><html lang="en-IE"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css}</style></head><body>
<p class="sim">Simulated</p><h1>${esc(title)}</h1><p>${esc(where)} · ${esc(windowLabel)}</p>
<div class="key"><span><i style="background:#fbe3d6;border:1px solid #d55e00"></i>Not working</span><span><i style="background:#f6ead2;border:1px solid #b36b00"></i>To review</span><span><i style="background:#fff;border:1px solid #b8b0a3"></i>Working</span></div>
<div class="grid">${figs}</div>${rows ? `<h2 style="font-size:16px">Timeline</h2><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
<p style="margin-top:18px;color:#6b655c">${esc(note)}</p></body></html>`;
}
