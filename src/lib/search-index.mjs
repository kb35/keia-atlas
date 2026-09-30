// The search index: everything in Keia Atlas as one compact list, built once at build time and served as
// /search/index.json. The browser reads it with search-query.mjs (same parser as the unit tests).
//
// Shape (short keys, ids instead of repeated names):
//   sites  { id: [code, name, city, region, country] }     classes { id: name }
//   models { id: [maker, model, class, status] }           rp { id: room profile name }
//   roles  { id: role name }                               rooms { id: [name, number, site, floor, profile] }
//   items  [[kind, url, title, detail, extra words, facets]]  facets: r region, st site, m models,
//          c classes, mk makers, z statuses, p room profile, ro role, fl floor, rm room, y install date
//   units  [[room, what it does, model, class, hostname, serial, asset tag, installed, retired, statuses]]
//          Units are the biggest list, so they are stored as bare rows and expanded in the browser.
//
// Spares and cables: if src/lib/search-extra.mjs exists and exports searchItems(), its items are
// merged in (kinds 'spare' and 'cable' already have their own groups and words in the parser).
import {
  spaces, sites, classes, models, spaceTypes, configurations, firmwareLines, projects, playbooks, incidents, labTests, advisories,
  vendors, plans, racks, rackGear, incidentPath, SITE_ORDER, className, modelName, deviceName, countryName, DEMO_TODAY, FW_STATUS, PROJECT_KIND,
  PHASE_LABEL, TASK_STATUS, LAB_STATUS, INC_STATE, ADV_LEVEL, VENDOR_KIND, KIND, KIND_LABEL, REGION_LABEL,
} from './data.mjs';
import { PEOPLE, ROLES, TEAMS } from './demo.mjs';
import { unitTitle } from './incidents.mjs';
import { records, NOW_YEAR } from './refresh.mjs';
import { allFacts } from './modelinfo.mjs';
import { searchItems as serviceItems } from './services.mjs';
import { issues as knownIssues } from './knownissues-view.mjs';

// Say "space type" wherever older text says "room type" or "room profile".
const say = (s) => String(s ?? '').replace(/\broom (?:type|profile)(s?)\b/g, 'space type$1').replace(/\bRoom (?:type|profile)(s?)\b/g, 'Space type$1');
const clip = (s, n = 260) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n).replace(/\s\S*$/, '')}` : t; };
const who = (id) => PEOPLE.find((p) => p.id === id)?.name ?? '';
const siteName = (id) => sites[id]?.name ?? id;
const lower1 = (s) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
// Facets with nothing in them are left out, to keep the file small.
const F = (o) => { const out = {}; for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length && k !== 'm' && k !== 'c')) out[k] = v; return out; };
const uniq = (a) => [...new Set(a.filter(Boolean))];
const profileLink = (model, tab) => (models[model] ? `profiles/${models[model].class}/${model}/#${tab}` : 'configurations/');

export function buildSearchIndex() {
  const items = [];
  const push = (k, u, t, s, x, f) => items.push([k, u, say(t), say(s), clip(x, 400), F(f ?? {})]);

  const siteTable = {};
  for (const id of SITE_ORDER) {
    const s = sites[id]; if (!s) continue;
    siteTable[id] = [s.code, s.name, s.city ?? '', s.region ?? '', s.country ? countryName(s.country) : ''];
  }
  const classTable = Object.fromEntries(Object.entries(classes).map(([id, c]) => [id, c.profile.name]));
  const modelTable = Object.fromEntries(Object.entries(models).map(([id, m]) => [id, [m.manufacturer, m.model, m.class, allFacts[id]?.status ?? '']]));
  const rpTable = Object.fromEntries(Object.entries(spaceTypes).map(([id, t]) => [id, t.profile.name]));
  const roleTable = Object.fromEntries(Object.entries(ROLES).map(([id, r]) => [id, r.name]));

  // Sites.
  for (const id of SITE_ORDER) {
    const s = sites[id]; if (!s) continue;
    const n = Object.values(spaces).filter((x) => x.site === id).length;
    // An office opens its page in Locations; a remote site opens its region's home offices.
    const url = s.kind === 'remote' ? `locations/${s.region}/home-offices/` : `locations/${id}/`;
    push('site', url, s.name, `${s.city ?? 'Home offices'}${s.region ? ` · ${REGION_LABEL[s.region]}` : ''} · ${n} spaces`, `${s.code} ${s.country ? countryName(s.country) : ''} ${s.kind === 'remote' ? 'home offices remote' : 'office'} ${s.meaning ?? ''}`, { st: id, r: s.region });
  }
  // Regions (cohesion review, section 2: regions were not searchable).
  for (const r of ['emea', 'amer', 'apac']) {
    const offices = SITE_ORDER.filter((id) => sites[id]?.region === r && sites[id].kind === 'office');
    push('site', `locations/${r}/`, REGION_LABEL[r], `Region · ${offices.length} offices and home offices`, `region ${r} ${{ emea: 'EMEA Europe', amer: 'Americas', apac: 'APAC Asia Pacific' }[r]} ${offices.map((id) => sites[id].name).join(' ')}`, { r });
  }

  // Rooms, with the models and kinds of device in each (so "rooms with an X52" is a facet lookup).
  const roomTable = {};
  const ordered = Object.values(spaces).sort((a, b) => SITE_ORDER.indexOf(a.site) - SITE_ORDER.indexOf(b.site) || String(a.number ?? a.id).localeCompare(String(b.number ?? b.id), 'en', { numeric: true }));
  for (const s of ordered) {
    roomTable[s.id] = [s.name, s.number ?? '', s.site, s.floor ?? '', s.space_type];
    const inRoom = [...s.positions, ...s.olderKit].filter((p) => p.units.some((u) => !u.retired));
    const z = [];
    if (s.stages.deploy) z.push('installing');
    if (s.positions.some((p) => p.legacy)) z.push('retiring');
    if (s.olderKit.length) z.push('legacy');
    if (!z.length) z.push('in-service');
    push('room', `rooms/${s.id}/`, s.name, `${siteName(s.site)}${s.number ? ` ${s.number}` : ''} · ${s.type.profile.name}${s.count ? ` · ${s.count}` : ''}`,
      `${KIND_LABEL[KIND(s)]} ${s.option?.name ?? ''} ${s.id}`,
      { st: s.site, fl: s.floor, p: s.space_type, m: uniq(inRoom.map((p) => p.model)), c: uniq(inRoom.map((p) => p.cls)), z });
  }

  // Space types.
  for (const [id, t] of Object.entries(spaceTypes)) {
    const eq = t.keia_atlas.options.flatMap((o) => o.equipment);
    const n = Object.values(spaces).filter((s) => s.space_type === id).length;
    push('rp', `room-profiles/${id}/`, t.profile.name, `${t.profile.capacity ? `${t.profile.capacity} · ` : ''}${n} spaces · ${t.keia_atlas.options.length} build options`,
      `${t.profile.purpose ?? ''} ${t.keia_atlas.options.map((o) => o.name).join(' ')}`, { p: id, m: uniq(eq.map((e) => e.model)), c: uniq(eq.map((e) => e.class)) });
  }

  // Device types (classes) and models.
  for (const [id, c] of Object.entries(classes)) {
    const ms = Object.keys(models).filter((m) => models[m].class === id);
    push('dp', `profiles/${id}/`, c.profile.name, `Device type · ${ms.length} models`, `${c.profile.object_role ?? ''} ${(c.profile.naming_prefixes ?? []).join(' ')}`, { c: [id], m: ms });
  }
  for (const [id, m] of Object.entries(models)) {
    const f = allFacts[id];
    const z = uniq([f?.status, f?.older ? 'legacy' : null]);
    push('model', `models/${id}/`, `${m.manufacturer} ${m.model}`, `${className(m.class)} · ${f?.installed ?? 0} installed${f?.retired ? `, ${f.retired} retired` : ''}`,
      `${(m.part_numbers ?? []).map((p) => p.number).join(' ')} ${clip(m.summary, 160)}`, { m: [id], c: [m.class], z });
  }

  // Units: in service, being installed, being replaced and retired, including older kit.
  const units = [];
  for (const r of records) {
    const { space: s, position: p, unit: u } = r;
    // deviceName already reads "Heron video bar"; keep only what the device does.
    const role = deviceName(s, p).slice(s.name.length).trim() || lower1(className(p.cls));
    const z = [r.status === 'retired' ? 'retired' : r.status === 'retiring' ? 'retiring' : u.stage === 'deploy' ? 'installing' : ['plan', 'procure'].includes(u.stage) ? 'planned' : 'in-service'];
    if (r.older) z.push('legacy');
    if (r.current && r.dated && r.due <= NOW_YEAR) z.push('overdue');
    units.push([s.id, role, u.model ?? p.model ?? 0, p.cls, p.hostname ?? 0, u.serial ?? 0, u.asset_tag ?? 0, u.installed ?? 0, u.retired ?? 0, z.join(' ')]);
  }

  // Configurations and every setting in them.
  for (const c of Object.values(configurations)) {
    const cls = uniq(c.models.map((m) => models[m]?.class));
    const url = `configurations/${c.id}/`;
    push('cfg', url, c.name, `${c.mode ? `${c.mode} · ` : ''}version ${c.version} · ${c.models.map(modelName).join(', ')}`, `${c.summary ?? ''} ${who(c.owner)} ${c.firmware ?? ''} ${c.managed_by ?? ''}`, { m: c.models, c: cls });
    for (const g of c.groups ?? []) for (const x of g.settings ?? []) {
      push('set', url, x.name, `${c.name} · ${x.action === 'verify' ? 'Check it is' : x.action === 'leave' ? 'Leave at' : 'Set to'} ${x.value}`, `${g.name} ${x.path ?? ''} ${x.param ?? ''} ${g.where ?? ''}`, { m: c.models, c: cls });
    }
  }

  // Firmware releases.
  for (const line of Object.values(firmwareLines)) {
    for (const r of line.releases) {
      push('fw', profileLink(line.models[0], 'firmware'), `${line.name} ${r.version}`, `${FW_STATUS[r.status] ?? r.status} · released ${r.released}`,
        `${(r.headlines ?? []).join(' ')} ${(r.known_issues ?? []).join(' ')} ${r.aigna ?? ''} ${line.vendor ?? ''}`, { m: line.models, c: uniq(line.models.map((m) => models[m]?.class)), z: [r.status] });
    }
  }
  for (const a of Object.values(advisories)) {
    push('adv', profileLink(a.models[0], 'firmware'), a.title, `${a.id} · ${ADV_LEVEL[a.level] ?? a.level} · ${a.status}`, `${a.says ?? ''} ${a.action ?? ''}`,
      { m: a.models, c: uniq(a.models.map((m) => models[m]?.class)), z: uniq([a.level, a.status === 'closed' ? 'closed' : 'open']) });
  }

  // Projects and their tasks.
  for (const p of Object.values(projects)) {
    const pid = p.id.toLowerCase();
    push('prj', `projects/${pid}/`, p.name, `${p.id} · ${PROJECT_KIND[p.kind] ?? p.kind} · ${siteName(p.site)} · ${PHASE_LABEL[p.phase] ?? p.phase}`,
      `${p.summary ?? ''} ${(p.roles ?? []).map((r) => who(r.person)).join(' ')} ${p.playbook ?? ''}`, { st: p.site, z: [p.phase, p.phase === 'closed' ? 'closed' : 'open'] });
    for (const t of p.tasks ?? []) {
      const room = t.space ? spaces[t.space] : null;
      push('task', `projects/${pid}/tasks/${t.id.toLowerCase()}/`, t.title, `${t.id} · ${p.name} · ${who(t.owner) || t.owner}${t.due ? ` · due ${t.due}` : ''}`,
        `${TASK_STATUS[t.status] ?? t.status} ${t.kind ?? ''} ${PHASE_LABEL[t.phase] ?? ''} ${room ? room.name : ''} ${t.captured_fix ?? ''}`, { st: p.site, rm: t.space, z: [t.status] });
    }
  }
  for (const pb of Object.values(playbooks)) {
    push('pb', `playbooks/${pb.id}/`, pb.name, `Playbook · ${PROJECT_KIND[pb.kind] ?? pb.kind}${pb.weeks ? ` · ${pb.weeks.min} to ${pb.weeks.max} weeks` : ''}`,
      `${pb.summary ?? ''} ${pb.when ?? ''} ${(pb.phases ?? []).flatMap((ph) => (ph.steps ?? []).map((st) => st.title)).join(' ')}`, {});
  }

  // Incidents, Lab tests, the year plan.
  // Each incident has its own page (decision 0024); the subtitle names the device or says it is the whole room.
  for (const i of Object.values(incidents)) {
    const s = spaces[i.room];
    const pos = s?.positions.find((p) => p.position === i.position);
    const what = !s ? i.room : pos ? unitTitle(s, pos) : `${s.name}, the whole space`;
    const res = i.history.findLast((h) => h.resolution)?.resolution;
    push('inc', incidentPath(i.number).slice(1), i.short_description, `${i.number} · ${what}${s ? `, ${siteName(s.site)}` : ''} · P${i.priority} · ${INC_STATE[i.state] ?? i.state}`,
      `${i.caller ?? ''} ${i.assignment_group ?? ''} ${i.device ?? ''} ${pos?.hostname ?? ''} ${i.keia_atlas?.captured_fix ?? ''} ${res?.notes ?? ''} ${i.history.map((h) => h.note ?? '').join(' ')}`,
      { st: s?.site, rm: i.room, m: pos?.model ? [pos.model] : undefined, c: pos?.cls ? [pos.cls] : undefined, z: [i.state, i.state === 'resolved' ? 'resolved' : 'open'] });
  }
  for (const l of Object.values(labTests)) {
    push('lab', `lab/#${l.id.toLowerCase()}`, l.title, `${l.id} · ${LAB_STATUS[l.status] ?? l.status} · ${who(l.owner)}`, `${l.why ?? ''} ${(l.checks ?? []).map((c) => c.name).join(' ')}`,
      { m: l.models, c: uniq((l.models ?? []).map((m) => models[m]?.class)), z: [l.status] });
  }
  for (const plan of Object.values(plans)) {
    for (const it of plan.pipeline ?? []) {
      push('plan', 'work/schedule/year/', it.title, `Year plan · ${PROJECT_KIND[it.kind] ?? it.kind} · ${siteName(it.site)} · ${it.status}`, `${it.why ?? ''} ${who(it.raised_by) || it.raised_by || ''}`, { st: it.site, z: [it.status] });
    }
  }

  // People and vendors.
  for (const p of PEOPLE) {
    push('person', 'team/', p.name, `${p.role} · ${p.where}`, `${p.scope ?? ''} ${TEAMS[p.team] ?? ''} ${p.vendorName ?? ''}`, { r: p.region, st: p.site, ro: p.roleId });
  }
  for (const v of Object.values(vendors)) {
    push('ven', 'vendors/', v.name, `${VENDOR_KIND[v.kind] ?? v.kind}${v.regions?.length ? ` · ${v.regions.map((r) => ({ amer: 'Americas', emea: 'EMEA', apac: 'APAC' })[r]).join(', ')}` : ''}`,
      `${v.summary ?? ''} ${(v.contract?.scope ?? []).join(' ')} ${(v.people ?? []).map(who).join(' ')}`, { r: v.regions, st: v.sites });
  }

  // Rack equipment in the comms rooms.
  const shortMaker = (m) => String(m).replace(/\s*\(.*\)$/, '').replace(/ by .*$/, '').replace(/ Networks$/, '').replace(/ Systems$/, '');
  for (const r of Object.values(racks)) {
    const s = spaces[r.space]; if (!s) continue;
    for (const it of r.items ?? []) {
      const g = it.gear ? rackGear[it.gear] : null;
      if (!g) continue;
      push('rack', `rooms/${s.id}/`, `${shortMaker(g.manufacturer)} ${g.model}`, `${it.label ?? g.kind} · ${s.name}, ${siteName(s.site)} · ${r.name} U${it.u}`,
        `${g.kind ?? ''} ${g.part_number ?? ''} ${clip(g.does, 140)}`, { st: s.site, rm: s.id, p: s.space_type, mk: [shortMaker(g.manufacturer)] });
    }
  }

  // Services (AV, Network, IT infrastructure and the overview).
  for (const [k, u, t, sub, x, f] of serviceItems()) push(k, u, t, sub, x, f);

  // Known errors: the manufacturers' published problems, each with its own page.
  for (const it of knownIssues) {
    push('ki', it.path.slice(1), it.title, `${it.id} · ${it.maker} · ${it.statusLabel}${it.fixed_in ? ` · fixed in ${it.fixed_in}` : ''}`,
      `known error known issue ${it.ref ?? ''} ${it.symptom ?? ''} ${(it.signs ?? []).join(' ')} ${(it.modelNames ?? []).join(' ')} ${it.workaround?.text ?? ''}`,
      { m: it.models, c: uniq(it.models.map((m) => models[m]?.class)), z: [it.status] });
  }

  // Hook for spares and cables (see the header).
  const extra = Object.values(import.meta.glob('./search-extra.mjs', { eager: true }))[0];
  if (extra?.searchItems) for (const [k, u, t, s, x, f] of extra.searchItems()) push(k, u, t, s, x, f);

  return { v: 1, today: DEMO_TODAY, sites: siteTable, classes: classTable, models: modelTable, rp: rpTable, roles: roleTable, rooms: roomTable, items, units };
}
