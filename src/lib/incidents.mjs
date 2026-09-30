// Incidents as the pages show them (decision 0024): what each ticket is about, its lifecycle as steps,
// how long it has been in each state, and the history around it. Worked out once at build time.
import { incidents, spaces, sites, projects, INC_STATE, className, modelName, incidentPath } from './data.mjs';
import { PEOPLE } from './demo.mjs';

// The demo's "now": the morning of DEMO_TODAY, after the last ticket in the sample data came in.
export const DEMO_NOW = '2026-09-28T12:00';
export const HOLD_LABEL = { 'awaiting-caller': 'Waiting for the caller', 'awaiting-vendor': 'Waiting for the vendor', 'awaiting-change': 'Waiting for a change', 'awaiting-parts': 'Waiting for parts' };
export const RES_LABEL = { fixed: 'Fixed', workaround: 'Workaround', 'no-fault-found': 'No fault found', duplicate: 'Duplicate', cancelled: 'Cancelled' };
export const STATE_ORDER = ['new', 'in-progress', 'on-hold', 'resolved'];
export const PRIORITY_LABEL = { 1: 'Critical', 2: 'High', 3: 'Moderate', 4: 'Low' };
export const SOURCE_LABEL = { servicenow: 'ServiceNow', keia_atlas: 'Keia Atlas' };
// A story the demo plays from the start (UX-V2 flow 4.1) is held at its own moment (keia_atlas.held_at) and says so.
export const nowOf = (inc) => inc.keia_atlas?.held_at ?? DEMO_NOW;

const ms = (t) => new Date(t).getTime();
export const minutesBetween = (a, b) => Math.max(0, Math.round((ms(b) - ms(a)) / 60000));
// "35 min", "3 h 10 min", "2 days", "3 weeks"
export function spoken(min) {
  if (min < 60) return `${min} min`;
  if (min < 60 * 24) { const h = Math.floor(min / 60), m = min % 60; return m && h < 6 ? `${h} h ${m} min` : `${Math.round(min / 60)} h`; }
  const d = Math.round(min / 1440);
  return d < 14 ? `${d} ${d === 1 ? 'day' : 'days'}` : `${Math.round(d / 7)} weeks`;
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Times are local to the site and written without a zone, so they are formatted from the text itself.
export const when = (t, { time = true, year = false } = {}) => {
  const [d, hm] = t.split('T');
  const [y, m, day] = d.split('-');
  return `${+day} ${MON[+m - 1]}${year ? ` ${y}` : ''}${time && hm ? `, ${hm}` : ''}`;
};
export const whoName = (h) => (h.by ? PEOPLE.find((p) => p.id === h.by)?.name ?? h.by : h.person ?? (h.source === 'keia_atlas' ? 'Keia Atlas' : 'ServiceNow'));

// The lifecycle as steps, in the order they happened. Each state entry is a step; a step lasts until
// the next state entry (or now). A move from Resolved back to In progress is a reopen.
export function steps(inc) {
  const list = [];
  const NOW = nowOf(inc);
  inc.history.forEach((h, i) => {
    if (!h.state) return;
    const prev = list[list.length - 1];
    if (prev) prev.until = h.at;
    list.push({ i, state: h.state, label: INC_STATE[h.state], at: h.at, who: whoName(h), note: h.note ?? null, hold: h.hold_reason ?? null, holdLabel: h.hold_reason ? HOLD_LABEL[h.hold_reason] : null, resolution: h.resolution ?? null, reopen: prev?.state === 'resolved' && h.state === 'in-progress' });
  });
  const last = list[list.length - 1];
  if (last && last.state !== 'resolved') last.until = null;
  for (const s of list) s.minutes = s.state === 'resolved' ? null : minutesBetween(s.at, s.until ?? NOW);
  // What is still to come, drawn faint: from New or On hold, work starts or resumes; then it is resolved.
  const ahead = [];
  if (last?.state === 'new' || last?.state === 'on-hold') ahead.push({ state: 'in-progress', label: last.state === 'on-hold' ? 'Back in progress' : 'In progress' });
  if (last && last.state !== 'resolved') ahead.push({ state: 'resolved', label: 'Resolved' });
  return { list, ahead };
}

// What a device does, short enough for a title: its role in the room profile ("HDBaseT receiver at the
// display"), or its kind when the role is a long description.
export const shortRole = (p) => {
  const role = (p.role ?? '').replace(/:.*$/, '');
  return role && role.length <= 44 && !/[,;]/.test(role) && /^[A-Z]/.test(role) ? role : className(p.cls);
};
const lower1 = (t) => (/^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
// "Heron HDBaseT receiver at the display", "Peregrine microphone 2", "Kit 07 network gateway".
export const unitTitle = (s, p) => {
  const kit = p.position?.match(/^(kit|desk)-(\d+)\//);
  const n = p.position?.includes('#') ? ` ${p.position.split('#')[1]}` : '';
  return `${kit ? `${kit[1] === 'kit' ? 'Kit' : 'Desk'} ${kit[2]}` : s.name} ${lower1(shortRole(p))}${n}`;
};

// Everything a page needs about one incident.
export function incidentView(inc) {
  const s = spaces[inc.room];
  const site = sites[s.site];
  const pos = inc.position ? s.positions.find((p) => p.position === inc.position) : null;
  const unit = pos ? pos.units.find((u) => u.asset_tag === inc.device) : null;
  const roomTitle = s.number ? `${s.number} ${s.name}` : s.name;
  const role = pos ? shortRole(pos) : null;
  const deviceTitle = pos ? unitTitle(s, pos) : null;
  const local = inc.position ? inc.position.replace(/^[a-z]+-\d+\//, '') : null;
  const [key, nth = '1'] = local ? local.split('#') : [null];
  const st = steps(inc);
  const open = inc.state !== 'resolved';
  const opened = inc.opened;
  const closed = open ? null : st.list[st.list.length - 1].at;
  const resolvedStep = [...st.list].reverse().find((x) => x.state === 'resolved');
  const hold = inc.state === 'on-hold' ? st.list[st.list.length - 1] : null;
  return {
    inc, space: s, site, pos, unit, role, key, local,
    href: incidentPath(inc.number),
    roomTitle, deviceTitle,
    title: inc.subject.kind === 'room' ? `${roomTitle}, the whole space` : deviceTitle,
    where: `${roomTitle}, ${site.name}${site.city ? `, ${site.city}` : ''}`,
    model: pos?.model ? modelName(pos.model) : null,
    sceneKey: local,                        // RoomScene's data-sk for this device
    wireNode: key ? `${key}#${nth}` : null, // Wiring's node id for this device
    steps: st, open, closed, resolution: inc.state === 'resolved' ? resolvedStep?.resolution : null,
    reopened: st.list.some((x) => x.reopen),
    hold, age: minutesBetween(opened, closed ?? nowOf(inc)), now: nowOf(inc), held: !!inc.keia_atlas?.held_at,
  };
}

export const incidentList = Object.values(incidents).map(incidentView);
// Open first (New, In progress, On hold), then priority, then newest.
export const byUrgency = (a, b) => (a.inc.state === 'resolved') - (b.inc.state === 'resolved') || a.inc.priority - b.inc.priority || b.inc.opened.localeCompare(a.inc.opened);

// The history around an incident: its own entries, the unit's install, other incidents in the same room
// (marked when they were about the same position) and project tasks for the room. Newest first.
export function aroundIncident(v) {
  const { inc, space, unit } = v;
  const rows = inc.history.map((h, i) => ({ at: h.at, kind: 'ticket', i, h, who: whoName(h) }));
  if (unit?.installed) rows.push({ at: `${unit.installed}T00:00`, kind: 'install', dateOnly: true, text: `${v.deviceTitle} installed`, sub: `${unit.serial} · ${unit.asset_tag}` });
  for (const p of space.positions) {
    for (const u of p.units) if (u.legacy && p.position === inc.position) rows.push({ at: `${u.installed ?? '2000-01-01'}T00:00`, kind: 'install', dateOnly: true, text: 'Earlier unit at this position', sub: `${u.serial} · ${u.asset_tag}` });
  }
  for (const other of incidentList) {
    if (other.inc.number === inc.number || other.inc.room !== inc.room) continue;
    const same = inc.position && other.inc.position === inc.position;
    rows.push({ at: other.inc.opened, kind: 'incident', other, same, text: other.inc.short_description, sub: `${other.inc.number} · ${INC_STATE[other.inc.state]}${other.resolution ? `, ${RES_LABEL[other.resolution.code].toLowerCase()}` : ''} · ${other.inc.subject.kind === 'room' ? 'Whole room' : other.deviceTitle}` });
  }
  for (const prj of Object.values(projects)) {
    for (const t of prj.tasks) {
      if (t.space !== inc.room || !t.due) continue;
      rows.push({ at: `${t.due}T00:00`, kind: 'task', dateOnly: true, prj, t, text: t.title, sub: `${t.id} · ${prj.id} ${prj.name}` });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at) || (b.i ?? 0) - (a.i ?? 0));
}
