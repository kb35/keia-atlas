// The capabilities' records, read once when the site is built (src/lib/modules.mjs): the new data folders, and one
// list of every unit in the fleet that each capability's pure rules work from. Pages import the views from here; the
// rules themselves are in licences.mjs, checks.mjs, outofservice.mjs, alerts.mjs, credentials.mjs, flaws.mjs,
// backups.mjs and quality.mjs, which load nothing, so tests run them alone.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { spaces, sites, models, classes, DEMO_TODAY, href, KIND } from './data.mjs';
import { sentence, subjectOf, routeWords, simulatedAlerts, alertCounts } from './alerts.mjs';
import { credentialRows, credentialSummary, expiryWords, LEVEL_WORD } from './credentials.mjs';
import { flawRows, flawSummary, flawsForUnit, SEVERITY_WORD, SEVERITY_TONE, FIX_WORD } from './flaws.mjs';
import { fleet as kiFleet } from './knownissues-view.mjs';
import { backupRows, backupSummary, backupWhen, SOURCE_LABEL as BACKUP_SOURCE } from './backups.mjs';
import { firmwareLines } from './data.mjs';
import { alternativesFor } from './outofservice.mjs';
import { PEOPLE } from './demo.mjs';
import { licenceRows, licenceSummary, inDays } from './licences.mjs';
import { rounds, checksSummary, checkItem, addDays } from './checks.mjs';

const DATA = path.join(process.cwd(), 'data');
export function readRecords(folder) {
  const out = [];
  const dir = path.join(DATA, folder);
  if (!existsSync(dir)) return out;
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      if (n.startsWith('.')) continue;
      const f = path.join(d, n);
      if (statSync(f).isDirectory()) walk(f);
      else if (n.endsWith('.yaml')) out.push(parse(readFileSync(f, 'utf8')));
    }
  };
  walk(dir);
  return out;
}

// Every unit in service or going in: its tag, model, class, space, site and region.
export const fleetUnits = [];
for (const s of Object.values(spaces)) {
  const region = sites[s.site]?.region ?? null;
  for (const p of [...s.positions, ...s.olderKit]) {
    for (const u of p.units) {
      if (u.legacy || u.stage === 'retire' || u.retired) continue;
      const model = u.model ?? p.model ?? null;
      fleetUnits.push({ tag: u.asset_tag, serial: u.serial, model, cls: models[model]?.class ?? p.cls ?? null, host: p.hostname ?? null, space: s.id, site: s.site, region, stage: u.stage, role: p.role ?? null });
    }
  }
}
export const unitByTag = new Map(fleetUnits.map((u) => [u.tag, u]));
export const spaceTitle = (id) => { const s = spaces[id]; return s ? (s.number ? `${s.number} ${s.name}` : s.name) : id; };

// ---- Licences ----------------------------------------------------------------------------------------------------
export const licencePools = readRecords('licences');
export const licences = licenceRows(licencePools, fleetUnits, DEMO_TODAY);
export const licenceTotals = licenceSummary(licences);

// ---- Room checks ---------------------------------------------------------------------------------------------------
// Rounds from two months back (the last done) to four months ahead, each office's own technician doing its rounds.
export const checkPlans = readRecords('checks');
export const techOf = {};
for (const [sid, s] of Object.entries(sites)) {
  if (s.kind === 'remote') continue;
  const t = PEOPLE.find((p) => p.roleId === 'tech' && p.site === sid) ?? PEOPLE.find((p) => p.roleId === 'tech' && s.city && p.scope?.includes(s.city));
  if (t) techOf[sid] = t.id;
}
export const hearingLoops = {};
for (const a of readRecords('accessibility')) for (const [sid, r] of Object.entries(a.rooms ?? {})) if (r.hearing_loop?.tested) hearingLoops[sid] = r.hearing_loop.tested;
export const checkRounds = rounds(checkPlans, {
  spaces: Object.values(spaces).map((s) => ({ id: s.id, site: s.site, type: s.space_type })), techs: techOf, loops: hearingLoops,
  from: addDays(DEMO_TODAY, -62), to: addDays(DEMO_TODAY, 120), today: DEMO_TODAY,
});
export const checkTotals = checksSummary(checkRounds, DEMO_TODAY);
export const checkWork = checkRounds.map((r) => checkItem(r, { link: href, siteName: (s) => sites[s]?.name ?? s, spaceTitle }));

// ---- Out of service --------------------------------------------------------------------------------------------------
// The records the demo starts with, and for any space the working spaces of the same kind in its office to offer.
export const oosSeed = readRecords('out-of-service');
const candidate = (s) => ({ id: s.id, site: s.site, floor: s.floor ?? null, type: s.space_type, kind: KIND(s), seats: s.type.keia_atlas.capacity?.max ?? null, name: spaceTitle(s.id) });
export const oosCandidates = (spaceId) => {
  const s = spaces[spaceId];
  if (!s) return [];
  return alternativesFor(candidate(s), Object.values(spaces).filter((x) => x.site === s.site).map(candidate)).slice(0, 6);
};
export const oosOf = (spaceId) => oosSeed.find((r) => r.space === spaceId) ?? null;

// ---- Alert rules -----------------------------------------------------------------------------------------------------
// Each rule with its sentence, what it watches, who gets it at each office and its last 30 days (simulated).
export const alertRules = readRecords('alert-rules').sort((a, b) => a.id.localeCompare(b.id));
const nightRule = readRecords('standing-rules').find((r) => r.id === 'firmware-to-standard');
const night = nightRule?.window ? { name: nightRule.name, from: nightRule.window.split(' to ')[0], to: nightRule.window.split(' to ')[1] } : null;
const siteLabel = (s) => sites[s]?.name ?? s;
// (the switch class is named for its in-room use; in a comms room it is simply a network switch, gap 17)
const alertCtx = { className: (c) => (c === 'network-switch' ? 'network switch' : classes[c]?.profile.name ?? c), siteName: siteLabel };
/** Who a rule's alert goes to at an office: the office's technician, the region's network engineer, the service desk. */
export function alertPerson(rule, site) {
  const r = rule.route, region = sites[site]?.region;
  if (r.role === 'tech') return techOf[site] ?? null;
  const all = PEOPLE.filter((p) => p.roleId === r.role);
  if (r.at === 'region') return (all.find((p) => p.region === region) ?? all.find((p) => !p.region) ?? all[0])?.id ?? null;
  return all[0]?.id ?? null;
}
export function alertTargets(rule) {
  const a = rule.applies_to;
  const inSite = (s) => !a.sites || a.sites.includes(s);
  if (a.classes) return fleetUnits.filter((u) => a.classes.includes(u.cls) && inSite(u.site) && (!a.space_types || a.space_types.includes(spaces[u.space]?.space_type)) && u.stage === 'manage')
    .map((u) => ({ id: u.tag, label: `${u.host ?? u.tag}, ${spaceTitle(u.space)}, ${siteLabel(u.site)}`, site: u.site, space: u.space, to: `/device/?tag=${u.tag}` }));
  return Object.values(spaces).filter((s) => a.space_types.includes(s.space_type) && inSite(s.site)).map((s) => ({ id: s.id, label: `${spaceTitle(s.id)}, ${siteLabel(s.site)}`, site: s.site, space: s.id, to: `/rooms/${s.id}/` }));
}
export const alertViews = alertRules.map((rule) => {
  const targets = alertTargets(rule);
  const alerts = simulatedAlerts(rule, { targets, rounds: checkRounds, night, who: (s) => alertPerson(rule, s), today: DEMO_TODAY });
  const officeIds = [...new Set(targets.map((t) => t.site))];
  return { rule, sentence: sentence(rule, alertCtx), subject: subjectOf(rule, alertCtx), route: routeWords(rule, alertCtx), targets, alerts, counts: alertCounts(alerts),
    people: officeIds.map((s) => ({ site: s, person: alertPerson(rule, s), n: targets.filter((t) => t.site === s).length })) };
});

// ---- Certificates and secrets ----------------------------------------------------------------------------------------
export const credentials = credentialRows(readRecords('credentials'), fleetUnits, DEMO_TODAY);
export const credentialTotals = credentialSummary(credentials);
export const platformName = (id) => readRecords('house-values')[0]?.platforms?.find((p) => p.id === id)?.name ?? id;

// ---- Security flaws ----------------------------------------------------------------------------------------------------
// Matched to the fleet with each unit's firmware version (simulated, as on Known errors: src/lib/knownissues-view.mjs).
export const flaws = flawRows(readRecords('security-flaws'), kiFleet, firmwareLines);
export const flawTotals = flawSummary(flaws);

// ---- Config backups --------------------------------------------------------------------------------------------------
export const backups = backupRows(readRecords('config-backups'));
export const backupTotals = backupSummary(backups);

// ---- The unit page's cards (/device/caps.json, UnitCapabilities.astro) --------------------------------------------
// Each card already worded: { feature, help, title, answer, tone?, items: [{ b, text?, w?, tone?, small?, to? }], more? }.
// Cards come in the order UnitCapabilities.astro lists them (licences, credentials, cves, config-backups).
const fmt = (d) => new Date(d).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
const UNIT_CARDS = [];   // (tag) => card or null, in order; each capability adds its own below
UNIT_CARDS.push((u) => {
  const lic = licences.filter((r) => r.units.includes(u.tag));
  if (!lic.length) return null;
  const soon = lic.filter((r) => r.soon || r.lapsed);
  return {
    feature: 'licences', help: 'unit.licences', title: 'Licences',
    answer: soon.length ? `${soon[0].platformLabel} renews ${inDays(soon[0].days)}` : lic.some((r) => r.short) ? 'Its pool is short of seats' : `Holds a seat in ${lic.length === 1 ? 'one licence' : `${lic.length} licences`}`,
    tone: soon.length || lic.some((r) => r.short) ? 'warn' : undefined,
    items: lic.map((r) => ({ b: r.name, text: `Renews ${fmt(r.renews)}`, w: `(${inDays(r.days)})`, tone: r.soon ? 'warn' : r.lapsed ? 'bad' : undefined, small: r.short ? `${r.short} seat${r.short === 1 ? '' : 's'} short across the pool` : `${r.used} of ${r.seats} seats in use`, to: `assets/licences/#${r.id}` })),
  };
});
UNIT_CARDS.push((u) => {
  const cr = credentials.filter((r) => r.units.includes(u.tag));
  if (!cr.length) return null;
  const first = cr[0];
  return {
    feature: 'credentials', help: 'unit.credentials', title: 'Certificates and secrets',
    answer: first.level ? `${first.kindLabel} ${expiryWords(first, fmt)}` : `${cr.length === 1 ? 'One credential' : `${cr.length} credentials`}, none expiring within 60 days`,
    tone: first.tone ?? undefined,
    items: cr.map((r) => ({ b: r.name, text: `${r.kindLabel} · ${r.days < 0 ? 'expired' : 'expires'} ${fmt(r.expires)}`, w: r.level ? `(${LEVEL_WORD[r.level].toLowerCase()})` : '', tone: r.tone ?? undefined, small: `In the vault as ${r.vault.slice(6)}`, to: `assets/certificates/#${r.id}` })),
  };
});
UNIT_CARDS.push((u) => {
  const fl = flawsForUnit(flaws, u.tag);
  if (!fl.length) return null;
  const ex = fl.filter((x) => x.state === 'exposed');
  const ki = kiFleet.find((x) => x.tag === u.tag);
  return {
    feature: 'cves', help: 'unit.flaws', title: 'Security flaws',
    answer: ex.length ? `Exposed to ${ex.length === 1 ? 'one flaw' : `${ex.length} flaws`}${ki?.firmware ? ` on ${ki.firmware}` : ''}` : `May be exposed to ${fl.length === 1 ? 'one flaw' : `${fl.length} flaws`}: its version is not tracked`,
    tone: ex.some((x) => SEVERITY_TONE[x.row.severity] === 'bad') ? 'bad' : 'warn',
    items: fl.map(({ row, state }) => ({ b: `${row.id}: ${row.title}`, text: `${SEVERITY_WORD[row.severity]}${row.cvss != null ? ` (${row.cvss})` : ''} · ${state === 'exposed' ? 'exposed' : 'may be exposed'}`, tone: SEVERITY_TONE[row.severity] ?? undefined,
      small: row.fixed_in ? `${FIX_WORD[row.fix]}: ${row.fixed_in}` : FIX_WORD.none, to: `assets/security-flaws/#${row.id.toLowerCase()}` })),
  };
});
UNIT_CARDS.push((u) => {
  const b = backups.find((r) => r.unit === u.tag);
  if (!b) return null;
  return {
    feature: 'config-backups', help: 'unit.backup', title: 'Config backup',
    answer: `${b.status === 'failed' ? 'Last backup failed; the last good one was' : 'Last backed up'} ${backupWhen(b)}${b.drift.length ? ` · ${b.drift.length === 1 ? 'one setting differs' : `${b.drift.length} settings differ`} from the standard` : ''}`,
    tone: b.late ? 'bad' : b.drift.length ? 'warn' : undefined,
    items: [
      { b: `${BACKUP_SOURCE[b.source]}, ${fmt(b.last.slice(0, 10))} ${b.last.slice(11, 16)}`, text: b.changed ? `${b.changed} ${b.changed === 1 ? 'line' : 'lines'} changed since the backup before` : 'No change since the backup before' },
      ...b.drift.map((d) => ({ b: d.setting, text: `${d.found}; the standard says ${d.expected}`, tone: 'warn', small: `Network standard, rule ${d.rule.split('/')[1]}`, to: `standards/${d.rule.split('/')[0]}/#r-${d.rule.split('/')[1]}` })),
    ],
    more: { to: 'assets/config-backups/', label: 'Every device\'s backup' },
  };
});
export function unitCaps() {
  const out = {};
  for (const u of fleetUnits) {
    const cards = UNIT_CARDS.map((f) => f(u)).filter(Boolean);
    if (cards.length) out[u.tag] = { cards };
  }
  return out;
}
