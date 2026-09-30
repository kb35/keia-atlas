// The capabilities' records, read once when the site is built (src/lib/modules.mjs): the new data folders, and one
// list of every unit in the fleet that each capability's pure rules work from. Pages import the views from here; the
// rules themselves are in licences.mjs, checks.mjs, outofservice.mjs, alerts.mjs, credentials.mjs, flaws.mjs,
// backups.mjs and quality.mjs, which load nothing, so tests run them alone.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { spaces, sites, models, DEMO_TODAY } from './data.mjs';
import { licenceRows, licenceSummary, inDays } from './licences.mjs';

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
export function unitCaps() {
  const out = {};
  for (const u of fleetUnits) {
    const cards = UNIT_CARDS.map((f) => f(u)).filter(Boolean);
    if (cards.length) out[u.tag] = { cards };
  }
  return out;
}
