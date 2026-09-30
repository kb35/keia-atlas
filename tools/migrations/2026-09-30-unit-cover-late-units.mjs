#!/usr/bin/env node
// One-off migration, a follow-up to 2026-09-30-unit-cover.mjs: purchase, warranty and support for the units that
// arrived on main after that one ran (the door, camera and sensor units in a few rooms), by the same rules:
//   purchase.date    3 to 7 weeks before it was installed; spares 1 to 3 weeks before they arrived
//   purchase.order   the office's order for that month when one already exists, else the next number that year
//   purchase.cost    the house price for its device class (data/planning/budget.yaml), in euros, when there is one
//   warranty.ends    2 years for adapters, 5 for switches and gateways, 3 for everything else
//   support          a service vendor whose contract lists the model, else HP Poly for Poly models, else nothing
// All made up for the demo and marked demo: true. It touches only units with a date and no purchase yet, so running
// it again changes nothing.
//
// Run from the repository root:  node tools/migrations/2026-09-30-unit-cover-late-units.mjs

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const DATA = path.join(process.cwd(), 'data');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : n.endsWith('.yaml') ? [p] : []; });
const load = (dir) => Object.fromEntries(walk(path.join(DATA, dir)).map((f) => [path.basename(f, '.yaml'), parse(readFileSync(f, 'utf8'))]));
const files = walk(path.join(DATA, 'installs'));
const spaces = load('spaces'), types = load('space-types'), models = load('device-models'), vendors = load('vendors');
const price = parse(readFileSync(path.join(DATA, 'planning/budget.yaml'), 'utf8')).unit_price;
const service = Object.values(vendors).filter((v) => v.kind === 'service' && v.contract?.covers_models);
const supportFor = (model) => (model ? service.find((v) => v.contract.covers_models.includes(model))?.id ?? (models[model]?.manufacturer === 'Poly' ? 'hp-poly' : null) : null);
const YEARS = { adapter: 2, 'network-switch': 5, 'network-gateway': 5 };
const h = (s) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const day = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const anniversary = (d, years) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCFullYear(x.getUTCFullYear() + years); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); };

// The orders already written: site and month to order, and the highest number per site and year.
const orders = new Map(), top = new Map();
for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/date: "(\d{4}-\d{2})-\d{2}", order: (PO-([A-Z]{3})-(\d{4})-(\d{3}))/g)) {
  orders.set(`${m[3]}-${m[1]}`, m[2]);
  top.set(`${m[3]}-${m[4]}`, Math.max(top.get(`${m[3]}-${m[4]}`) ?? 0, +m[5]));
}
const orderFor = (site, date) => {
  const S = site.toUpperCase(), k = `${S}-${date.slice(0, 7)}`;
  if (!orders.has(k)) { const y = `${S}-${date.slice(0, 4)}`, n = (top.get(y) ?? 0) + 1; top.set(y, n); orders.set(k, `PO-${S}-${date.slice(0, 4)}-${String(n).padStart(3, '0')}`); }
  return orders.get(k);
};

let n = 0;
for (const file of files) {
  const inst = parse(readFileSync(file, 'utf8')), sp = spaces[inst.space];
  const option = types[sp.space_type].keia_atlas.options.find((o) => o.id === sp.option);
  const clsOf = (pos, model) => models[model]?.class ?? option.equipment.find((e) => e.key === pos.replace(/^[a-z]+-\d+\//, '').replace(/#\d+$/, ''))?.class;
  const todo = [];
  for (const p of inst.positions ?? []) for (const u of p.units) if (u.installed && !u.purchase) todo.push({ serial: u.serial, model: u.model ?? p.model, cls: clsOf(p.position, u.model ?? p.model), date: day(u.installed, -(21 + (h(u.serial) % 29))) });
  for (const u of inst.spare_units ?? []) if (!u.purchase) todo.push({ serial: u.serial, model: u.model, cls: models[u.model]?.class, date: day(u.arrived, -(7 + (h(u.serial) % 15))), flow: true });
  if (!todo.length) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const u of todo) {
    const i = lines.findIndex((l) => l.includes(`serial: ${u.serial}`));
    const cost = price[u.cls], sup = supportFor(u.model);
    const purchase = `{ date: "${u.date}", order: ${orderFor(sp.site, u.date)}${cost ? `, cost: ${cost}, currency: EUR` : ''}, demo: true }`;
    const warranty = `{ ends: "${anniversary(u.date, YEARS[u.cls] ?? 3)}", demo: true }`;
    if (u.flow) { lines[i] = lines[i].replace(/(, notes: "[^"]*")? \}\s*$/, (m, notes) => `, purchase: ${purchase}, warranty: ${warranty}${sup ? `, support: ${sup}` : ''}${notes ?? ''} }`); }
    else {
      const indent = /^(\s*)- serial:/.exec(lines[i])[1].length + 2;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() && lines[j].length - lines[j].trimStart().length >= indent) j++;
      const pad = ' '.repeat(indent);
      lines.splice(j, 0, `${pad}purchase: ${purchase}`, `${pad}warranty: ${warranty}`, ...(sup ? [`${pad}support: ${sup}`] : []));
    }
    n++;
  }
  writeFileSync(file, lines.join('\n'));
}
console.log(`Purchase, warranty and support written on ${n} late units.`);
