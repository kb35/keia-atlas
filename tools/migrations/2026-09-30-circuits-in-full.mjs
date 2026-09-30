#!/usr/bin/env node
// One-off migration: each internet circuit in full (schemas/ext/circuits.schema.yaml): the circuit ID the carrier
// knows it by, the bandwidth, the service level, the carrier's support desk and account reference, and the contract's
// renewal. Everything here is made up for the demo and says demo: true; the carriers keep their generic names
// (rule F9). No person's name or number: the support desk is the carrier's, and the account is a reference.
//
// Kept for the record; it has already been run and its output committed. It refuses to run again once a circuit has
// circuit_id. The edit is made on the text: the "bandwidth: Not recorded" line becomes the value and the new fields
// follow it, so comments and layout stay.
//
// Run from the repository root:  node tools/migrations/2026-09-30-circuits-in-full.mjs

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'data', 'circuits');
const ONE = { desk: 'Carrier One service desk', hours: '24/7', sla: { availability: '99.95%', restore: '4 hours', hours: '24/7' } };
const TWO = { desk: 'Carrier Two network operations centre', hours: '24/7', sla: { availability: '99.9%', restore: '8 hours', hours: '24/7' } };
// [circuit, carrier, bandwidth, circuit id, account, contract start, term in months]
const C = [
  ['nyc-isp-1', ONE, '2 Gb/s symmetric', 'C1-NYC-0040917', 'C1-ACC-40702', '2024-07-01', 36],
  ['nyc-isp-2', TWO, '1 Gb/s symmetric', 'C2-NYC-0218836', 'C2-ACC-88390', '2025-02-01', 24],
  ['dub-isp-1', ONE, '1 Gb/s symmetric', 'C1-DUB-0041270', 'C1-ACC-40718', '2024-04-01', 36],
  ['dub-isp-2', TWO, '500 Mb/s symmetric', 'C2-DUB-0219044', 'C2-ACC-88412', '2025-01-01', 24],
  ['lon-isp-1', ONE, '1 Gb/s symmetric', 'C1-LON-0041528', 'C1-ACC-40731', '2023-11-01', 36],
  ['chi-isp-1', ONE, '1 Gb/s symmetric', 'C1-CHI-0040655', 'C1-ACC-40705', '2025-06-01', 36],
  ['tor-isp-1', ONE, '500 Mb/s symmetric', 'C1-TOR-0042013', 'C1-ACC-40744', '2024-10-01', 36],
  ['sin-isp-1', ONE, '1 Gb/s symmetric', 'C1-SIN-0042288', 'C1-ACC-40756', '2025-03-01', 36],
  ['mel-isp-1', ONE, '500 Mb/s symmetric', 'C1-MEL-0042491', 'C1-ACC-40763', '2024-02-01', 36],
  ['tyo-isp-1', ONE, '1 Gb/s symmetric', 'C1-TYO-0042730', 'C1-ACC-40770', '2025-09-01', 36],
  ['cph-isp-1', ONE, '500 Mb/s symmetric', 'C1-CPH-0043102', 'C1-ACC-40788', '2024-05-01', 24],
  ['jnu-isp-1', ONE, '200 Mb/s symmetric', 'C1-JNU-0044517', 'C1-ACC-40796', '2025-08-01', 36],
];
const renews = (start, months) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + months); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

const files = readdirSync(DIR).filter((f) => f.endsWith('.yaml'));
if (files.some((f) => /^\s+circuit_id:/m.test(readFileSync(path.join(DIR, f), 'utf8')))) { console.log('Already run: circuits have circuit_id.'); process.exit(0); }
let n = 0;
for (const f of files) {
  const file = path.join(DIR, f), lines = readFileSync(file, 'utf8').split('\n'), out = [];
  let id = null;
  for (const line of lines) {
    const m = /^\s+- id: ([a-z0-9-]+)\s*$/.exec(line);
    if (m) id = m[1];
    const bw = /^(\s+)bandwidth: /.exec(line);
    const row = bw && C.find((c) => c[0] === id);
    if (!row) { out.push(line); continue; }
    const [, carrier, band, cid, account, start, term] = row, pad = bw[1];
    out.push(`${pad}bandwidth: ${band}`,
      `${pad}circuit_id: ${cid}`,
      `${pad}sla: { availability: "${carrier.sla.availability}", restore: ${carrier.sla.restore}, hours: ${carrier.sla.hours} }`,
      `${pad}support: { desk: ${carrier.desk}, account: ${account}, hours: ${carrier.hours} }`,
      `${pad}contract: { start: "${start}", term_months: ${term}, renews: "${renews(start, term)}" }`,
      `${pad}demo: true`);
    n++;
  }
  writeFileSync(file, out.join('\n'));
}
if (n !== C.length) throw new Error(`wrote ${n} circuits, expected ${C.length}`);
console.log(`${n} circuits written in full.`);
