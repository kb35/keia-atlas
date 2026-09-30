// Loads a provider's operations (data/providers/<provider>/ops/) and joins them to what the record knows, for
// src/lib/provider-ops.mjs. Read once when the site is built, and by the tests; the browser gets the result as JSON.
//
// What the record gives the paperwork, and where it comes from:
//   the bill of materials   Aigna's build sheet: the positions of a project's unfinished spaces (data/installs/, the
//                           space type's equipment), with the model the record names or the provider's pick
//   the site's facts        ceiling and cable tray heights, the riser and the comms room (data/floors/, data/spaces/),
//                           whether the office is a fit-out or in use (data/projects/), electrical work by others (a
//                           project's facilities task); for the made-up clients, the provider's own surveys
//   the as-built            units, serials and hostnames (data/installs/), ports, VLANs and addresses
//                           (data/switch-ports/), setup guides (data/configurations/) and manufacturer documents
//                           (data/sources/)
// A client's floor plan never flows to a provider (docs/service-providers.md, section 3): a job gets the facts it needs,
// and every fact here says it came from the client's record, shared on the job.
// Node only (it reads files); nothing here runs in the browser.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { JOBS as HANDED, dateWords } from './vendors.mjs';
import { ORGS, CLIENT_SITES } from './engagements.mjs';
import { itemKey } from './provider-ops.mjs';

const read = (root, rel) => parse(readFileSync(path.join(root, 'data', rel), 'utf8'));
function folder(root, rel) {
  const dir = path.join(root, 'data', rel), out = {};
  if (!existsSync(dir)) return out;
  const walk = (d) => { for (const n of readdirSync(d).sort()) { const f = path.join(d, n); if (statSync(f).isDirectory()) walk(f); else if (n.endsWith('.yaml')) out[n.slice(0, -5)] = parse(readFileSync(f, 'utf8')); } };
  walk(dir);
  return out;
}
const VLAN_WORDS = { management: 'Management', corporate: 'Corporate', 'room-systems': 'Room systems', 'displays-and-signage': 'Displays and signage', av: 'AV', building: 'Building', security: 'Security', printers: 'Printers', guest: 'Guest' };
const lowerFirst = (w) => (/^[A-Z][a-z]/.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : w);
const spaceLabel = (s) => (s ? (s.number && !String(s.name).includes(s.number) ? `${s.number} ${s.name}` : s.name) : '');

const cache = new Map();
/** Everything the operations pages need, for one provider. */
export function loadOps(root = process.cwd(), provider = 'northlight') {
  const k = `${root}|${provider}`;
  if (cache.has(k)) return cache.get(k);
  const ops = {};
  for (const [name, doc] of Object.entries(folder(root, `providers/${provider}/ops`))) ops[doc.kind ?? name] = doc;
  const models = folder(root, 'device-models');
  const classes = folder(root, 'device-classes');
  const spaceTypes = folder(root, 'space-types');
  const spaces = folder(root, 'spaces');
  const installs = folder(root, 'installs');
  const projects = Object.fromEntries(Object.values(folder(root, 'projects')).map((p) => [p.id, p]));
  const sites = folder(root, 'sites');
  const configurations = folder(root, 'configurations');
  const sources = {};
  for (const f of Object.values(folder(root, 'sources'))) for (const e of f.entries ?? []) sources[e.id] = { title: e.title, url: e.access?.find((a) => a.url)?.url ?? null };

  const stockItems = new Map((ops.stock?.items ?? []).map((it) => [itemKey(it), it]));
  const modelName = (id) => (models[id] ? `${models[id].manufacturer} ${models[id].model}` : id);
  const className = (id) => classes[id]?.profile?.name ?? id;
  const lineInfo = (l) => {
    if (l.model) { const m = models[l.model]; return { name: modelName(l.model), cls: l.cls ?? m?.class ?? null, weightKg: m?.weight_kg ?? null, manufacturer: m?.manufacturer ?? null }; }
    return { name: stockItems.get(itemKey(l))?.what ?? l.part, cls: l.cls ?? null, weightKg: null, manufacturer: null };
  };
  const equipmentOf = (space) => {
    const opt = spaceTypes[space.space_type]?.keia_atlas?.options?.find((o) => o.id === space.option);
    return new Map((opt?.equipment ?? []).map((e) => [e.key, e]));
  };
  // The positions in a space, as the build sheet reads them: the model the install names, or the space type's.
  const positionsOf = (spaceId) => {
    const s = spaces[spaceId], inst = installs[spaceId];
    if (!s || !inst) return [];
    const eq = equipmentOf(s);
    return (inst.positions ?? []).map((p) => {
      const key = p.position.replace(/^[a-z]+-\d+\//, '').replace(/#\d+$/, '');
      const e = eq.get(key);
      const unit = (p.units ?? []).find((u) => !u.legacy) ?? {};
      const model = p.model ?? e?.model ?? null;
      const cls = e?.class ?? models[model]?.class ?? null;
      return { space: spaceId, spaceName: spaceLabel(s), position: p.position, key, model, cls, clsName: className(cls), location: e?.location ?? null, serial: unit.serial ?? null, tag: unit.asset_tag ?? null, stage: unit.stage ?? null, installed: unit.installed ?? null, host: p.hostname ?? null };
    });
  };

  /** A job's bill of materials, one line per unit or part, resolved: name, class, where it goes, weight. */
  function bomOf(job) {
    const B = job.bom;
    if (!B) return [];
    if (Array.isArray(B)) return B.map((l) => ({ ...l, ...lineInfo(l), where: job.where ?? null }));
    const out = [];
    for (const sid of job.spaces ?? []) {
      for (const p of positionsOf(sid)) {
        if (['manage', 'retire'].includes(p.stage) || p.installed) continue;
        const pick = (B.picks ?? []).find((x) => x.space === sid && x.position === p.key);
        const line = pick ? { model: pick.model, part: pick.part, qty: 1, pick: pick.why } : p.model ? { model: p.model, qty: 1 } : { part: `unknown-${p.cls}`, qty: 1 };
        out.push({ ...line, ...lineInfo(line), cls: p.cls, location: p.location, where: `${p.spaceName}, ${lowerFirst(p.clsName)}`, from: `${B.project} build sheet` });
      }
    }
    for (const l of B.add ?? []) out.push({ ...l, ...lineInfo(l), where: 'For the job', from: 'Added by Northlight' });
    return out;
  }

  /** What the record knows of a job's site: see the file's header. Each fact carries its source. */
  function factsOf(job) {
    const clientName = ORGS[job.client]?.name ?? job.client;
    const siteName = CLIENT_SITES[job.client]?.find((s) => s.id === job.site)?.name ?? sites[job.site]?.name ?? job.site;
    const f = { clientName, siteName, where: job.where ?? (job.spaces ?? []).map((s) => spaceLabel(spaces[s])).join(', ') };
    if (job.client === 'aigna') {
      const sp = (job.spaces ?? []).map((s) => spaces[s]).filter(Boolean);
      const floorId = sp[0]?.floor;
      const fl = floorId ? (() => { try { return read(root, `floors/${job.site}-${floorId}.yaml`); } catch { return null; } })() : null;
      const floorWords = `${siteName}, ${fl?.name?.toLowerCase() ?? `floor ${floorId}`}`;
      if (fl?.ceiling_m) { f.ceiling_m = fl.ceiling_m; f.ceilingSource = `${clientName}'s floor record: ceiling ${fl.ceiling_m} m (${floorWords}), shared on this job`; }
      if (fl?.tray_m) { f.tray_m = fl.tray_m; f.traySource = `${clientName}'s floor record: cable tray in the corridor ceiling at ${fl.tray_m} m (${floorWords})`; }
      const comms = Object.entries(spaces).find(([, s]) => s.site === job.site && String(s.floor) === String(floorId) && ['mdf', 'idf'].includes(s.space_type));
      if (comms) {
        const note = (comms[1].geometry?.notes ?? []).find((n) => /riser/i.test(n));
        f.comms = { id: comms[0], name: spaceLabel(comms[1]), source: `${clientName}'s record: ${spaceLabel(comms[1])}${note ? `. ${note.replace(/\.$/, '')}` : ''}` };
      }
      const riser = (fl?.risers ?? [])[0];
      if (riser) f.riser = { name: riser.name, notes: riser.notes ?? null, source: `${clientName}'s floor record: ${riser.name}${riser.notes ? `, ${riser.notes.replace(/\.$/, '').toLowerCase()}` : ''}` };
      const prj = job.ref?.startsWith('PRJ-') ? projects[job.ref] : Object.values(projects).find((p) => p.site === job.site && p.kind === 'fit-out' && p.phase !== 'closed');
      if (prj && prj.kind === 'fit-out' && prj.phase !== 'closed') {
        f.fitOut = true; f.occupied = false;
        f.fitOutSource = `${clientName}'s project ${prj.id}: a fit-out, not yet open (handover target ${dateWords(prj.target)})`;
        const power = (prj.tasks ?? []).find((t) => t.team === 'facilities' && /power/i.test(t.title));
        if (power && bomOf(job).some((l) => l.cls === 'display' || /^display-\d/.test(l.part ?? ''))) {
          f.electrical = { what: `${power.title} by ${clientName}'s facilities team (${power.id}, ${power.status === 'done' ? `done by ${dateWords(power.due)}` : `due ${dateWords(power.due)}`})`, source: `${clientName}'s project ${prj.id}, task ${power.id}` };
        }
      } else {
        f.occupied = true; f.setting = `${siteName}, in use`;
        f.occupiedSource = `${clientName}'s record: ${siteName} is a working office`;
      }
    } else {
      const sv = (ops.surveys?.surveys ?? []).find((s) => s.site === job.site);
      if (sv) {
        const by = (ops.crew?.people ?? []).find((p) => p.id === sv.by)?.name ?? sv.by;
        const src = `Northlight's survey (${sv.where}, ${dateWords(sv.surveyed)}, ${by})`;
        f.ceiling_m = sv.ceiling_m; f.ceilingSource = `${src}: ceiling ${sv.ceiling_m} m`;
        f.access = sv.access; f.accessSource = `${src}: ${sv.access.charAt(0).toLowerCase()}${sv.access.slice(1)}`;
        f.occupied = sv.occupied; f.setting = sv.setting; f.occupiedSource = `${src}: ${sv.setting.charAt(0).toLowerCase()}${sv.setting.slice(1)}`;
        if (sv.comms) f.comms = { name: sv.comms, source: `${src}: comms in ${sv.comms.charAt(0).toLowerCase()}${sv.comms.slice(1)}` };
        if (sv.emergency) f.emergency = sv.emergency;
      }
      f.hospital = job.client === 'fenwater';
      const v = (ops.visits?.visits ?? []).find((x) => x.jobs.includes(job.id));
      if (v?.access?.ceiling_note) f.ceilingNote = `${clientName}: ${v.access.ceiling_note}`;
    }
    return f;
  }

  /** The units in a job's spaces, for the as-built. */
  const unitsOf = (job) => (job.spaces ?? []).flatMap((sid) => positionsOf(sid).filter((p) => p.tag).map((p) => ({
    ...p, name: `${p.spaceName}, ${lowerFirst(p.clsName)}`, modelName: p.model ? modelName(p.model) : null, manufacturer: p.model ? models[p.model]?.manufacturer ?? null : null,
  })));

  /** Ports, VLANs and addresses by asset tag, from the site's switch ports. */
  function portsOf(site) {
    let sp; try { sp = read(root, `switch-ports/${site}.yaml`); } catch { return {}; }
    const vlan = Object.fromEntries((sp.vlans ?? []).map((v) => [v.vid, VLAN_WORDS[v.role] ?? v.role]));
    const out = {};
    for (const sw of sp.switches ?? []) for (const i of sw.interfaces ?? []) {
      const tag = i.connected?.device;
      if (!tag || !/^AG-/.test(tag) || out[tag]) continue;
      out[tag] = { switch: sw.id, port: i.name, vlan: i.untagged_vlan ?? null, vlanName: i.untagged_vlan != null ? vlan[i.untagged_vlan] ?? null : null };
    }
    for (const a of sp.addresses ?? []) if (a.device && out[a.device]) Object.assign(out[a.device], { address: a.address.replace(/\/\d+$/, ''), mac: a.mac ?? null });
    else if (a.device && /^AG-/.test(a.device)) out[a.device] = { address: a.address.replace(/\/\d+$/, ''), mac: a.mac ?? null };
    return out;
  }

  /** Setup guides and manufacturer documents for each model. */
  const docsOf = (modelIds) => Object.fromEntries(modelIds.filter(Boolean).map((m) => {
    const cfg = Object.values(configurations).find((c) => (c.models ?? []).includes(m));
    const src = (models[m]?.sources ?? []).map((s) => sources[s.source]).filter((s) => s?.url).slice(0, 3);
    return [m, { guide: cfg ? { id: cfg.id, name: cfg.name, to: `/configurations/${cfg.id}/` } : null, sources: src }];
  }));

  /** Snags still open on a job's spaces (Aigna's jobs handed to the provider). */
  const snagsOf = (job) => HANDED.filter((j) => j.vendor === provider && j.kind === 'snag' && j.state !== 'done' && (job.spaces ?? []).includes(j.space));

  const out = {
    provider, ops,
    stock: ops.stock, orders: ops.orders, jobs: ops.jobs?.jobs ?? [], crew: ops.crew, visits: ops.visits?.visits ?? [], surveys: ops.surveys?.surveys ?? [],
    rams: ops.rams?.reviews ?? [], handovers: ops.handovers,
    bomOf, factsOf, unitsOf, portsOf, docsOf, snagsOf, modelName, className, models, spaces, projects,
  };
  cache.set(k, out);
  return out;
}

/** The whole operations record as plain data, for opsView() in src/lib/provider-ops.mjs: the stock, the orders and
    distributors, the jobs with their resolved bill of materials and site facts, the crew, the visits and the RAMS
    reviews (with the reviewer's name). Small enough to go to the browser as JSON. */
export function opsBase(root = process.cwd(), provider = 'northlight') {
  const L = loadOps(root, provider);
  const people = L.crew?.people ?? [];
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? id;
  const names = {};
  for (const it of L.stock?.items ?? []) names[itemKey(it)] = it.model ? L.modelName(it.model) : it.what;
  for (const j of L.jobs) for (const l of L.bomOf(j)) names[itemKey(l)] ??= l.name;
  return {
    provider,
    stock: L.stock,
    orders: L.orders?.orders ?? [],
    distributors: L.orders?.distributors ?? [],
    jobs: L.jobs.map((j) => ({ ...j, bomLines: L.bomOf(j), facts: L.factsOf(j) })),
    people,
    rota: L.crew?.rota ?? [],
    visits: L.visits,
    reviews: L.rams.map((r) => ({ ...r, reviewedByName: r.reviewed_by ? nameOf(r.reviewed_by) : null })),
    names,
  };
}
