// Shared by the capability migrations of 30 Sept 2026 (licences, room checks, out of service, alert rules,
// certificates, security flaws, config backups, meeting quality). Reads the data as it is, without the site's build
// code, and gives each migration the same view of the fleet and a seeded random number, so every run writes the
// same files. Not a migration itself (its name starts with an underscore).
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export const ROOT = process.cwd();
export const DATA = path.join(ROOT, 'data');
export const TODAY = '2026-09-28';   // the demo's today (src/lib/data.mjs DEMO_TODAY)

export function readFolder(folder) {
  const out = {};
  const dir = path.join(DATA, folder);
  if (!existsSync(dir)) return out;
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      if (n.startsWith('.')) continue;
      const f = path.join(d, n);
      if (statSync(f).isDirectory()) walk(f);
      else if (n.endsWith('.yaml')) out[n.slice(0, -5)] = parse(readFileSync(f, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

export const sites = readFolder('sites');
export const spaces = readFolder('spaces');
export const installs = readFolder('installs');
export const models = readFolder('device-models');

// Every unit in service or going in, with its space, site, region and model. Retired and legacy units are left out.
export const units = [];
for (const [sid, inst] of Object.entries(installs)) {
  const sp = spaces[sid];
  if (!sp) continue;
  const site = sites[sp.site];
  const push = (u, model, hostname) => {
    if (!u.asset_tag || u.legacy || u.retired || u.stage === 'retire') return;
    units.push({ tag: u.asset_tag, model, cls: models[model]?.class ?? null, host: hostname ?? null, space: sid, spaceType: sp.space_type, site: sp.site, region: site?.region ?? sp.region ?? null, stage: u.stage ?? 'manage', office: site?.kind === 'office' });
  };
  for (const p of inst.positions ?? []) for (const u of p.units) push(u, u.model ?? p.model, p.hostname);
  for (const u of inst.older_kit ?? []) push(u, u.model, u.hostname);
}

// A seeded random number in [0, 1) from a string, so a record is the same on every run.
export function rand(key) {
  let h = 2166136261;
  for (const c of String(key)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export const pick = (key, list) => list[Math.floor(rand(key) * list.length)];

export const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// Write a YAML file from lines of text, making its folder. Refuses to overwrite unless asked.
export function write(rel, text, { overwrite = false } = {}) {
  const f = path.join(DATA, rel);
  if (existsSync(f) && !overwrite) return false;
  mkdirSync(path.dirname(f), { recursive: true });
  writeFileSync(f, text.endsWith('\n') ? text : `${text}\n`);
  return true;
}
// A YAML scalar: quoted when it needs to be.
export const q = (v) => (typeof v === 'number' || typeof v === 'boolean' ? String(v) : /^[\w .,()/-]+$/.test(v) && !/^(yes|no|on|off|true|false|null|\d[\d.-]*)$/i.test(v) && !/^[-\s]/.test(v) && !/: /.test(v) ? v : JSON.stringify(v));
