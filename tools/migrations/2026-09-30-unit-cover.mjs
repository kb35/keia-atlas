#!/usr/bin/env node
// One-off migration: purchase, warranty and support cover on every unit (schemas/ext/install.schema.yaml).
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once a unit has
// purchase:. The edit is made on the text, so comments and layout stay as they were.
//
// Which units: every unit in a position that has a date to start from (installed, or for a spare, arrived), and
// every spare in an IT store. Units with no date yet (being ordered) get nothing: they have not been bought.
// Older kit is history and gets nothing.
//
// Every figure is made up for the demo and says demo: true:
//   purchase.date    3 to 7 weeks before it was installed (or 1 to 3 weeks before a spare arrived)
//   purchase.order   one order a month per office: PO-<SITE>-<year>-<nnn>, numbered in date order within the year
//   purchase.cost    the house price for its device class (data/planning/budget.yaml unit_price), in euros, the
//                    currency Aigna buys in centrally
//   warranty.ends    the day before the purchase date's anniversary: 2 years for adapters, 5 for switches and
//                    gateways, 3 for everything else (a house assumption, not any manufacturer's terms)
// support is not made up: it names the vendor whose contract covers the unit, from data/vendors/:
//   a service vendor whose covers_models lists the model (Keystone Service), else the manufacturer's own
//   contract (HP Poly) for Poly models, else nothing.
//
// Run from the repository root:  node tools/migrations/2026-09-30-unit-cover.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const DATA = path.join(process.cwd(), 'data');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : n.endsWith('.yaml') ? [p] : []; });
const load = (dir) => Object.fromEntries(walk(path.join(DATA, dir)).map((f) => [path.basename(f, '.yaml'), parse(readFileSync(f, 'utf8'))]));
const installFiles = walk(path.join(DATA, 'installs'));
if (installFiles.some((f) => /^\s+purchase:|, purchase: \{/m.test(readFileSync(f, 'utf8')))) { console.log('Already run: units have purchase:.'); process.exit(0); }

const spaces = load('spaces'), types = load('space-types'), models = load('device-models'), vendors = load('vendors');
const price = parse(readFileSync(path.join(DATA, 'planning/budget.yaml'), 'utf8')).unit_price;
const service = Object.values(vendors).filter((v) => v.kind === 'service' && v.contract?.covers_models);
const supportFor = (model) => (model ? service.find((v) => v.contract.covers_models.includes(model))?.id ?? (models[model]?.manufacturer === 'Poly' ? 'hp-poly' : null) : null);
const YEARS = { adapter: 2, 'network-switch': 5, 'network-gateway': 5 };

const h = (s) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const day = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const anniversary = (d, years) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() + years); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

// First pass: every unit to cover, with its purchase date, so the orders can be numbered in date order.
const units = [];
for (const file of installFiles) {
  const inst = parse(readFileSync(file, 'utf8'));
  const sp = spaces[inst.space];
  const option = types[sp.space_type].keia_atlas.options.find((o) => o.id === sp.option);
  const clsOf = (pos, model) => models[model]?.class ?? option.equipment.find((e) => e.key === pos.replace(/^[a-z]+-\d+\//, '').replace(/#\d+$/, ''))?.class;
  for (const p of inst.positions ?? []) {
    for (const u of p.units) {
      if (!u.installed) continue;
      const model = u.model ?? p.model;
      units.push({ file, serial: u.serial, site: sp.site, cls: clsOf(p.position, model), model, date: day(u.installed, -(21 + (h(u.serial) % 29))) });
    }
  }
  for (const u of inst.spare_units ?? []) units.push({ file, serial: u.serial, site: sp.site, cls: models[u.model]?.class, model: u.model, date: day(u.arrived, -(7 + (h(u.serial) % 15))), flow: true });
}
const months = new Map();
for (const u of [...units].sort((a, b) => a.date.localeCompare(b.date))) {
  const key = `${u.site}-${u.date.slice(0, 7)}`;
  if (!months.has(key)) {
    const yearKey = `${u.site}-${u.date.slice(0, 4)}`;
    months.set(yearKey, (months.get(yearKey) ?? 0) + 1);
    months.set(key, `PO-${u.site.toUpperCase()}-${u.date.slice(0, 4)}-${String(months.get(yearKey)).padStart(3, '0')}`);
  }
  u.order = months.get(key);
}

// Second pass: write them in, file by file.
const byFile = new Map();
for (const u of units) { if (!byFile.has(u.file)) byFile.set(u.file, []); byFile.get(u.file).push(u); }
const fields = (u) => {
  const cost = price[u.cls];
  const purchase = `{ date: "${u.date}", order: ${u.order}${cost ? `, cost: ${cost}, currency: EUR` : ''}, demo: true }`;
  const warranty = `{ ends: "${anniversary(u.date, YEARS[u.cls] ?? 3)}", demo: true }`;
  const sup = supportFor(u.model);
  return { purchase, warranty, sup };
};
let n = 0;
for (const [file, list] of byFile) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const u of list) {
    const i = lines.findIndex((l) => l.includes(`serial: ${u.serial}`));
    if (i < 0) throw new Error(`${file}: ${u.serial} not found`);
    const f = fields(u);
    if (u.flow) {
      const extra = `, purchase: ${f.purchase}, warranty: ${f.warranty}${f.sup ? `, support: ${f.sup}` : ''}`;
      lines[i] = lines[i].replace(/(, notes: "[^"]*")? \}\s*$/, (m, notes) => `${extra}${notes ?? ''} }`);
    } else {
      const indent = /^(\s*)- serial:/.exec(lines[i])[1].length + 2;
      let j = i + 1;
      // The unit's own lines sit at its indent (a long note deeper); the next unit or position starts shallower.
      while (j < lines.length && lines[j].trim() && lines[j].length - lines[j].trimStart().length >= indent) j++;
      const pad = ' '.repeat(indent);
      const add = [`${pad}purchase: ${f.purchase}`, `${pad}warranty: ${f.warranty}`, ...(f.sup ? [`${pad}support: ${f.sup}`] : [])];
      lines.splice(j, 0, ...add);
    }
    n++;
  }
  writeFileSync(file, lines.join('\n'));
}
console.log(`Purchase, warranty and support written on ${n} units in ${byFile.size} files.`);
