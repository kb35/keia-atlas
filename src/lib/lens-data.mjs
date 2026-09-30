// The facts behind each lens, per space, for one office (build time; the rules are in src/lib/lenses.mjs).
// Every figure is from the demo data: made up where the data is made up, and the page says Simulated.
//   Support    the open work on the space (incidents, tasks, device swaps due this year, urgent reports)
//   Network    the switch ports serving the space as recorded (data/switch-ports, src/lib/switchports.mjs): how many,
//              their VLANs and switches, and any the switch reports off the plan; the cables' test margin, the
//              monitoring fact on an open incident and the nearest access point
//   Projects   open projects that list the space, with the space's own state in the project
//   Vendors    the service vendor whose contract covers a model in the space, else the office's integration partner
//   Knowledge  setup guides for the models in the space, known errors that affect a unit here, captured fixes
import { spaces, projects, vendors, configurations, DEMO_TODAY, KIND } from './data.mjs';
import { building } from './floors.mjs';
import { ITEMS } from './home.mjs';
import { incidentList } from './incidents.mjs';
import { issues } from './knownissues-view.mjs';
import { PEOPLE } from './demo.mjs';
import { supportLens, networkLens, projectsLens, vendorsLens, knowledgeLens } from './lenses.mjs';
import { jobWindow } from './replay.mjs';
import { siteNet } from './switchports.mjs';

const FIRST = Object.fromEntries(PEOPLE.map((p) => [p.id, p.name.split(' ')[0]]));
const YEAR = DEMO_TODAY.slice(0, 4);
const modelsIn = (s) => [...new Set((s?.positions ?? []).filter((p) => p.model && p.current?.stage === 'manage').map((p) => p.model))];
const incByRoom = new Map();
for (const v of incidentList) { const k = v.space?.id; if (!k) continue; if (!incByRoom.has(k)) incByRoom.set(k, []); incByRoom.get(k).push(v); }

function jobsOf(id) {
  const inc = new Map((incByRoom.get(id) ?? []).map((v) => [v.inc.number, v.inc]));
  return ITEMS.filter((it) => it.room === id && ['incident', 'task', 'refresh', 'inbox'].includes(it.kind))
    .filter((it) => it.kind !== 'refresh' || (it.id.split(':').pop() ?? '') <= YEAR)
    .map((it) => {
      const i = it.kind === 'incident' ? inc.get(it.number) : null;
      // An urgent report reads as To review: someone should look, nothing is known to be down.
      return { kind: it.kind === 'inbox' ? 'incident' : it.kind, prio: it.kind === 'inbox' ? 4 : it.prio, state: i?.state ?? it.state, title: it.title, who: FIRST[it.who?.[0]] ?? null, number: it.number };
    });
}

// The switch ports serving a space, as recorded: comms room ports whose outlet is in it, and its in-room switches'
// ports. Their VLANs, the switches, and the first port the switch reports off the plan.
function portsServing(net, id) {
  if (!net) return { ports: [], vlans: [], sw: null, off: null };
  const ports = net.switches.flatMap((s) => s.ports.filter((p) => p.f && ((p.f.kind === 'outlet' && p.f.space === id) || (s.where === 'room' && s.space === id))).map((p) => ({ s, p })));
  const active = ports.filter(({ p }) => p.state === 'active');
  const vlans = [...new Set(active.map(({ p }) => p.native))].sort((a, b) => a - b);
  const sw = [...new Set(ports.filter(({ s }) => s.where === 'rack').map(({ s }) => s.id))].join(', ') || null;
  const bad = ports.find(({ p }) => p.check.ok === false);
  return { ports, vlans, sw, off: bad ? `${bad.s.id} ${bad.p.word}: ${bad.p.check.why}` : null };
}

function vendorFor(site, models) {
  const all = Object.values(vendors);
  const svc = all.find((v) => v.kind === 'service' && (v.contract?.covers_models ?? []).some((m) => models.includes(m)));
  const pick = svc ?? all.find((v) => v.kind === 'integration' && (v.sites ?? []).includes(site));
  return pick ? { name: pick.name, short: pick.name.split(' ')[0], end: pick.contract?.end ?? null, kind: pick.kind, id: pick.id } : null;
}

// ---- Replay: the jobs on each floor, as the pure replay (src/lib/replay.mjs) reads them ----------------------------
const WHO = (h) => (h.by ? FIRST[h.by] ?? h.by : h.person ?? (h.source === 'keia_atlas' ? 'Keia Atlas' : 'ServiceNow'));
/** { [floor id]: [window] }: one window per open job on the floor, its frames the job's own events. */
export function replayJobs(siteId) {
  const M = building(siteId);
  if (!M) return {};
  const byFloor = {};
  for (const v of incidentList) {
    const room = v.space?.id, r = room ? M.rooms[room] : null;
    if (!r?.rect) continue;
    const i = v.inc, ka = i.keia_atlas ?? {};
    const seen = (ka.facts ?? []).find((f) => /last seen/i.test(f.label));
    const hm = seen && /(\d\d:\d\d)/.exec(seen.value)?.[1];
    const said = (ka.evidence ?? []).find((e) => hm && e.says?.includes(hm));
    const job = {
      number: i.number, room, prio: i.priority, opened: i.opened, state: i.state, short: i.short_description, stateWord: { new: 'nobody has it yet', 'in-progress': 'in progress', 'on-hold': 'on hold', resolved: 'resolved' }[i.state],
      with: ka.assigned ? FIRST[ka.assigned] : null, heldAt: ka.held_at ?? null,
      lastSeen: hm ? `${i.opened.slice(0, 10)}T${hm}` : null, lastSeenSays: said?.says ?? null, lastSeenFrom: said?.from ?? null,
      history: (i.history ?? []).map((h) => ({ at: h.at, state: h.state, note: h.note, who: WHO(h) })),
    };
    (byFloor[r.floor] ??= []).push(job);
  }
  const out = {};
  for (const [floor, jobs] of Object.entries(byFloor)) {
    out[floor] = jobs.filter((j) => j.state !== 'resolved').sort((a, b) => b.opened.localeCompare(a.opened)).map((j) => jobWindow(jobs, j.number)).filter(Boolean);
  }
  return out;
}

/** Every drawn space on the office's floors, with each lens's reading: { [space id]: { support, network, ... } }. */
export function officeLenses(siteId) {
  const M = building(siteId);
  if (!M) return {};
  const out = {};
  const openPrj = Object.values(projects).filter((p) => p.phase !== 'closed');
  const net = siteNet(siteId);
  for (const r of Object.values(M.rooms)) {
    if (!r.rect) continue;
    const s = spaces[r.id], models = modelsIn(s);
    const runs = M.runs.filter((x) => x.to?.space === r.id);
    const margins = runs.map((x) => x.test?.margin_db).filter((x) => typeof x === 'number');
    const cx = (r.rect[0] + r.rect[2]) / 2, cy = (r.rect[1] + r.rect[3]) / 2;
    const ap = M.aps.filter((a) => a.floor === r.floor).map((a) => ({ a, d: Math.hypot(a.at[0] - cx, a.at[1] - cy) })).sort((x, y) => x.d - y.d)[0]?.a ?? null;
    const sp = portsServing(net, r.id);
    const openInc = (incByRoom.get(r.id) ?? []).filter((v) => v.inc.state !== 'resolved');
    const bad = openInc.flatMap((v) => v.inc.keia_atlas?.facts ?? []).find((f) => /switch port/i.test(f.label) && f.level === 'bad');
    const entries = openPrj.flatMap((p) => (p.spaces ?? []).filter((x) => x.space === r.id).map((x) => ({ code: p.id, name: p.name, phase: p.phase, space: x.state, note: x.note })));
    const guides = Object.values(configurations).filter((c) => (c.models ?? []).some((m) => models.includes(m))).map((c) => ({ name: c.name, updated: c.updated }));
    const errors = issues.filter((i) => i.status === 'open' && i.ex.exposed.some((u) => u.room === r.id)).map((i) => ({ title: i.title }));
    const fixes = [
      ...Object.values(projects).filter((p) => (p.spaces ?? []).some((x) => x.space === r.id)).flatMap((p) => p.tasks.filter((t) => t.captured_fix).map((t) => ({ text: t.captured_fix }))),
      ...(incByRoom.get(r.id) ?? []).filter((v) => v.inc.keia_atlas?.captured_fix).map((v) => ({ text: v.inc.keia_atlas.captured_fix })),
    ];
    out[r.id] = {
      support: supportLens({ jobs: jobsOf(r.id) }),
      network: networkLens({ ports: sp.ports.length || runs.length, portFault: bad ? `${bad.label}: ${bad.value}` : null, vlanOff: sp.off, minMargin: margins.length ? Math.min(...margins) : null, ap: ap?.hostname ?? null, vlans: sp.vlans, sw: sp.sw }),
      projects: projectsLens({ entries }),
      vendors: vendorsLens({ vendor: models.length ? vendorFor(siteId, models) : null, today: DEMO_TODAY }),
      knowledge: knowledgeLens({ guides, errors, fixes, today: DEMO_TODAY }),
    };
  }
  return out;
}
