// Known issues as the pages show them (decision 0029), worked out once at build time from the makers' feeds
// (data/known-issues), the maker cases (data/maker-cases), the fleet and the incidents. The rules are in
// src/lib/knownissues.mjs; this file only wires them to the data.
//
// Each unit's firmware version is simulated the same way as the Devices overview (src/lib/livemodel.mjs):
// most units on the standard, about one in twelve a release behind. Stage 2 reads it from device management.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { spaces, sites, models, classes, vendors, projects, advisories, SITE_ORDER, firmwareLines, firmwareFor, standardFirmware, modelName, src, deviceName, DEMO_TODAY, KIND } from './data.mjs';
import { incidentList, when, RES_LABEL } from './incidents.mjs';
import { seedOf, rand } from './livesim.mjs';
import { PEOPLE } from './demo.mjs';
import { matchIncident, exposure, affectsUs, findClusters, fixPlan, bySite, EXPLAINED, KI_STATUS } from './knownissues.mjs';

export * from './knownissues.mjs';

const read = (folder) => {
  const dir = path.join(process.cwd(), 'data', folder);
  return readdirSync(dir).filter((n) => n.endsWith('.yaml')).sort().map((n) => parse(readFileSync(path.join(dir, n), 'utf8')));
};
export const feeds = read('known-issues');
export const makerCases = read('maker-cases');
const feedById = Object.fromEntries(feeds.map((f) => [f.id, f]));
export const person = (id) => PEOPLE.find((p) => p.id === id) ?? { id, name: id, initials: String(id).slice(0, 2).toUpperCase() };
export const siteName = (id) => sites[id]?.name ?? id;
export const isOffice = (id) => sites[id]?.kind !== 'remote';
export const kiPath = (id) => `/known-issues/${id.toLowerCase()}/`;
export const casePath = (id) => `/known-issues/cases/${id.toLowerCase()}/`;

// ---- The fleet: every live unit of a model, with the version it runs -----------------------------------------
const linesOf = (model) => Object.values(firmwareLines).filter((l) => l.models.includes(model));
function simulatedFirmware(p, u) {
  const std = standardFirmware(p.model)?.version ?? null;
  if (!std) return null;
  const managed = Boolean(classes[p.cls]?.platforms?.device_management);
  const older = firmwareFor(p.model)?.releases.filter((r) => r.status === 'superseded').map((r) => r.version) ?? [];
  const seed = seedOf(`fw:${u.asset_tag}`);
  const behind = Boolean(p.hostname) && managed && older.length && rand(seed, 1) < (p.older ? 0.35 : 0.08);
  return behind ? older[Math.floor(rand(seed, 2) * older.length)] : std;
}
const follows = new Map(feeds.flatMap((f) => (f.follows?.models ?? []).map((m) => [m, f.firmware])));

export const fleet = [];
for (const sid of SITE_ORDER) {
  for (const s of Object.values(spaces).filter((x) => x.site === sid)) {
    const all = [...s.positions, ...s.olderKit];
    const roomModels = [...new Set(all.map((p) => p.model).filter(Boolean))];
    const own = new Map();
    for (const p of all) if (p.model && p.current && linesOf(p.model).length) own.set(p, simulatedFirmware(p, p.current));
    // The system an accessory takes its version from: the one in the same room on that firmware line.
    const systemFw = (line) => [...own].find(([p]) => firmwareLines[line]?.models.includes(p.model))?.[1] ?? null;
    for (const p of all) {
      const u = p.current;
      if (!u || u.stage !== 'manage' || !p.model) continue;
      const fw = own.has(p) ? own.get(p) : follows.has(p.model) ? systemFw(follows.get(p.model)) : null;
      fleet.push({ tag: u.asset_tag, serial: u.serial, model: p.model, site: s.site, room: s.id, roomTitle: s.number ? `${s.number} ${s.name}` : s.name,
        name: deviceName(s, p), host: p.hostname ?? null, firmware: fw, roomModels, kind: KIND(s) });
    }
  }
}
const unitByTag = new Map(fleet.map((u) => [u.tag, u]));

// ---- Known issues, each with its feed, exposure and fix ----------------------------------------------------------
// Where an advisory is read: the device profile page of the first model it names.
const advOf = (id) => (id ? Object.values(advisories).find((a) => a.id === id) ?? null : null);
const advLink = (a) => (a ? { id: a.id, title: a.title, to: `/profiles/${models[a.models[0]].class}/${a.models[0]}/` } : null);
const rollouts = Object.values(projects).filter((p) => p.kind === 'firmware-rollout' && p.phase !== 'closed');
const short = (v) => v.split(/[.-]/).slice(0, 3).join('.');
export const issues = feeds.flatMap((f) => f.issues.map((it) => {
  const ex = exposure(it, fleet);
  const line = f.firmware ? firmwareLines[f.firmware] : null;
  const release = it.fixed_in && line ? line.releases.find((r) => r.version === it.fixed_in) ?? null : null;
  const rollout = it.fixed_in ? rollouts.find((p) => `${p.name} ${p.summary}`.includes(short(it.fixed_in))) ?? null : null;
  const src0 = src(it.source);
  return {
    ...it, feed: f, maker: f.maker, demo: Boolean(f.demo || it.demo), statusLabel: KI_STATUS[it.status],
    path: kiPath(it.id), ex, affects: affectsUs(ex),
    exSites: bySite(ex.exposed, SITE_ORDER), unknownSites: bySite(ex.unknown, SITE_ORDER), safeSites: bySite(ex.safe, SITE_ORDER),
    modelNames: [...it.models.map(modelName), ...(it.maker_models ?? [])],
    fix: fixPlan(it, { release, rollout }), release, rollout,
    advisoryRec: advLink(advOf(it.advisory)), releaseAdvisory: advLink(advOf(release?.advisory)),
    sourceRec: src0,
    firmwareTracked: Boolean(line),
  };
}));
export const issueById = new Map(issues.map((i) => [i.id, i]));

// ---- Incidents: what each looks like, and which known issues it matches ------------------------------------------
const explained = (v) => Boolean(v.resolution && EXPLAINED.includes(v.resolution.code)) || (v.inc.keia_atlas.related ?? []).length > 0;
const incText = (v) => [v.inc.short_description, v.inc.description, ...v.inc.history.map((h) => h.note), ...v.inc.keia_atlas.evidence.map((e) => e.says)].filter(Boolean).join(' ').toLowerCase();
export const incInputs = incidentList.map((v) => {
  const unit = v.inc.device ? unitByTag.get(v.inc.device) : null;
  const fromTicket = v.inc.keia_atlas.firmware ?? null;
  return {
    v, number: v.inc.number, model: v.pos?.model ?? null, site: v.space.site, opened: v.inc.opened, symptom: v.inc.keia_atlas.symptom ?? null,
    firmware: fromTicket ?? unit?.firmware ?? null, firmwareFrom: fromTicket ? 'ticket' : unit?.firmware ? 'fleet' : null,
    roomModels: [...new Set([...v.space.positions, ...v.space.olderKit].map((p) => p.model).filter(Boolean))],
    text: incText(v), explained: explained(v), serial: v.unit?.serial ?? null,
  };
});
const RANK = { strong: 0, possible: 1 };
export const matches = [];
for (const i of incInputs) {
  if (i.v.resolution && EXPLAINED.includes(i.v.resolution.code)) continue;
  for (const it of issues) {
    const m = matchIncident(it, i);
    if (m) matches.push({ issue: it, inc: i, ...m, key: `${it.id}:${i.number}` });
  }
}
matches.sort((a, b) => RANK[a.confidence] - RANK[b.confidence] || Number(!a.inc.v.open) - Number(!b.inc.v.open) || b.inc.opened.localeCompare(a.inc.opened));
export const matchesOf = (issueId) => matches.filter((m) => m.issue.id === issueId);
export const matchesForIncident = (number) => matches.filter((m) => m.inc.number === number);

// ---- Repeats across the fleet with no known issue, and the case Keia Atlas prepares for each ---------------------
export const clusters = findClusters(incInputs, { today: DEMO_TODAY, matched: new Set(matches.map((m) => m.inc.number)) });

// The maker's feed for a model: the feed that names it, or whose firmware line or accessories include it, or
// whose maker's name matches the model's maker.
export function feedForModel(model) {
  const byData = feeds.find((f) => f.issues.some((it) => it.models.includes(model)) || (f.firmware && firmwareLines[f.firmware]?.models.includes(model)) || f.follows?.models.includes(model));
  if (byData) return byData;
  const maker = (models[model]?.manufacturer ?? '').toLowerCase();
  return feeds.find((f) => maker && (f.maker.toLowerCase().includes(maker) || maker.includes(f.maker.toLowerCase()))) ?? null;
}

// How to reach the maker: the contract in data/vendors, or the feed's support route when there is no contract.
export function routeOf(feed) {
  const v = feed?.vendor ? vendors[feed.vendor] ?? Object.values(vendors).find((x) => x.id === feed.vendor) : null;
  const service = Object.values(vendors).filter((x) => x.kind === 'service' && (x.contract.covers_models ?? []).some((m) => feed?.issues.some((it) => it.models.includes(m)) || (feed?.firmware && firmwareLines[feed.firmware]?.models.includes(m)) || feed?.follows?.models.includes(m)));
  return v ? {
    vendor: v, contract: v.contract.ref, until: v.contract.end, scope: v.contract.scope, sla: v.contract.sla ?? [], owner: v.owner ? person(v.owner) : null,
    how: `A support case through the ${v.name} support portal, under contract ${v.contract.ref}.`, service,
  } : { vendor: null, contract: null, how: feed?.support ?? 'No support route on record: ask the service vendor.', sla: [], service, owner: null };
}

// The evidence for a case about some incidents: models, versions, serials, the timeline and the logs to attach.
export function evidenceFor(incs) {
  const units = incs.map((i) => {
    const room = spaces[i.v.inc.room];
    const sys = [...room.positions].find((p) => p.model && linesOf(p.model).length && p.hostname);
    const sysUnit = sys?.current ? unitByTag.get(sys.current.asset_tag) : null;
    return {
      number: i.number, name: i.v.deviceTitle ?? i.v.title, site: i.site, where: i.v.where, model: i.model ? modelName(i.model) : 'Not known', serial: i.serial, tag: i.v.inc.device,
      firmware: i.firmware, firmwareFrom: i.firmwareFrom,
      system: sys ? { name: deviceName(room, sys), host: sys.hostname, model: modelName(sys.model), firmware: sysUnit?.firmware ?? null } : null,
    };
  });
  const timeline = incs.flatMap((i) => [
    { at: i.opened, number: i.number, text: `Opened: ${i.v.inc.short_description}`, where: i.v.where },
    ...i.v.inc.keia_atlas.evidence.filter((e) => e.level !== 'ok').map((e) => ({ at: i.opened, number: i.number, text: `${e.from}: ${e.says}`, where: i.v.where, evidence: true })),
    ...(i.v.resolution ? [{ at: i.v.closed, number: i.number, text: `${RES_LABEL[i.v.resolution.code]}: ${i.v.resolution.notes}`, where: i.v.where }] : []),
    ...(i.v.reopened ? [{ at: i.v.steps.list.find((s) => s.reopen).at, number: i.number, text: 'Reopened: the fault came back', where: i.v.where }] : []),
  ]).sort((a, b) => a.at.localeCompare(b.at));
  const logs = [];
  for (const u of units) {
    if (u.system) logs.push(`System log bundle from ${u.system.host} (${u.system.name}), downloaded from device management`);
    logs.push(`Device management event history for ${u.tag} since ${when(incs.find((i) => i.number === u.number).opened, { time: false })}`);
  }
  const versions = [...new Set(units.map((u) => u.firmware ?? u.system?.firmware).filter(Boolean))];
  return { units, timeline, logs: [...new Set(logs)], versions, sites: [...new Set(units.map((u) => u.site))] };
}

// A case Keia Atlas prepares for each repeat (cases/new-...), ready for a person to read, change and send.
export const draftCases = clusters.map((c) => {
  const feed = feedForModel(c.model);
  const ev = evidenceFor(c.incidents);
  const cls = models[c.model]?.class;
  const sympLabel = c.symptom.replace(/_/g, ' ');
  const fleetCount = fleet.filter((u) => u.model === c.model).length;
  const fleetSites = new Set(fleet.filter((u) => u.model === c.model).map((u) => u.site)).size;
  const id = `new-${c.key}`;
  return {
    id, path: casePath(id), draft: true, cluster: c, feed, route: routeOf(feed), ev,
    models: [c.model], modelName: modelName(c.model), symptom: c.symptom, sympLabel, cls,
    title: `${modelName(c.model)}: ${sympLabel}, ${c.incidents.length} times in ${c.sites.length} ${c.sites.length === 1 ? 'office' : 'offices'}`,
    summary: `${c.incidents.length} ${modelName(c.model)} units in ${c.sites.map(siteName).join(', ')} had the same fault between ${when(c.first, { time: false })} and ${when(c.last, { time: false })}. What people reported: ${c.incidents.map((i) => `"${i.v.inc.short_description}"`).join('; ')}. ${c.incidents.some((i) => i.v.reopened || (i.v.open && i.v.inc.history.length > 3)) ? 'Fixes on site have not lasted.' : ''} ${ev.versions.length ? `The systems they are attached to run ${ev.versions.join(' and ')}.` : ''} We have ${fleetCount} of this model in ${fleetSites} offices. Is this a known fault, and is there a fix or a workaround?`.replace(/ +/g, ' '),
    ask: 'Whether this is a known fault, and a fix or a workaround.',
    fleetCount, fleetSites,
  };
});

// A case about a published known issue that affects us, when there isn't one yet: asking for the fix, or when.
const ASK = {
  blocked: 'The fix on the version we run: we can\'t install the version that has it.',
  none: 'When a fix is coming, and anything more we can do meanwhile.',
  'wont-fix': 'Whether the fix can come to the version we run after all.',
  propose: 'Anything to know before we roll out the version with the fix.',
  rollout: 'Anything to know before we roll out the version with the fix.',
  standard: 'Anything to know before we update the units still on an affected version.',
};
for (const it of issues) {
  if (it.affects === 'no' || makerCases.some((c) => c.known_issue === it.id)) continue;
  const incs = matchesOf(it.id).map((m) => m.inc);
  const ev = evidenceFor(incs);
  const n = it.ex.exposed.length, u = it.ex.unknown.length, offices = new Set([...it.ex.exposed, ...it.ex.unknown].map((x) => x.site)).size;
  const versions = [...new Set(it.ex.exposed.map((x) => x.firmware))];
  const id = `new-${it.id.toLowerCase()}`;
  draftCases.push({
    id, path: casePath(id), draft: true, issueDraft: it, feed: it.feed, route: routeOf(it.feed), ev,
    models: it.models, modelName: it.modelNames.join(', '), title: `${it.ref ?? it.id}: ${it.title}`,
    summary: `Your known issue ${it.ref ?? `"${it.title}"`} affects us. ${n ? `${n} of our units in ${offices} ${offices === 1 ? 'office' : 'offices'} run an affected version (${versions.join(', ')}).` : `${u} of our units in ${offices} ${offices === 1 ? 'office' : 'offices'} may run an affected version.`} ${incs.length ? `${incs.length} of our incidents look like it (${incs.map((i) => i.number).join(', ')}).` : ''} ${it.fix.kind === 'blocked' ? `The fix is in ${it.fixed_in}, which we can't install.` : ''}`.replace(/ +/g, ' ').trim(),
    ask: ASK[it.fix.kind] ?? ASK.none,
    fleetCount: n + u, fleetSites: offices,
  });
}

// Maker cases on record, with their feed, route and links.
export const cases = makerCases.map((c) => {
  const feed = feedById[c.maker];
  const incs = (c.incidents ?? []).map((n) => incInputs.find((i) => i.number === n)).filter(Boolean);
  return { ...c, path: casePath(c.id), draft: false, feed, route: routeOf(feed), ev: incs.length ? evidenceFor(incs) : null, incs, issue: c.known_issue ? issueById.get(c.known_issue) ?? null : null, modelNames: c.models.map(modelName) };
});
export const caseForIssue = (id) => cases.find((c) => c.known_issue === id) ?? null;
export const draftForIssue = (id) => draftCases.find((d) => d.issueDraft?.id === id) ?? null;
export const draftForCluster = (key) => draftCases.find((d) => d.cluster?.key === key) ?? null;

// ---- Numbers for the band ----------------------------------------------------------------------------------------
export const counts = {
  decisions: matches.length + clusters.length,
  affecting: issues.filter((i) => i.affects === 'yes').length,
  exposedUnits: new Set(issues.flatMap((i) => i.ex.exposed.map((u) => u.tag))).size,
  openCases: cases.filter((c) => c.status !== 'closed').length,
};
