// The records a team runs on day to day: warranty and purchase per unit, on-call cover, internet circuits, the comms
// room's power and temperature, repeat faults, office hours and change windows. The words are pure functions
// (src/lib/cover.mjs and friends); the data is read straight from data/. Run with:  npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { warrantyWords, supportWords, monthsUntil, endingSoon, money } from '../src/lib/cover.mjs';
import { FEATURES_ADDED } from '../src/lib/features-added.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walk = (d) => readdirSync(d).flatMap((n) => { const p = path.join(d, n); return statSync(p).isDirectory() ? walk(p) : n.endsWith('.yaml') ? [p] : []; });
const load = (dir) => walk(path.join(ROOT, 'data', dir)).map((f) => ({ id: path.basename(f, '.yaml'), file: f, ...parse(readFileSync(f, 'utf8')) }));
const TODAY = '2026-09-28';

// ---- Warranty, support cover and purchase ----------------------------------------------------------------------

test('the warranty answers first, in the words a person says', () => {
  assert.equal(warrantyWords('2027-01-31', TODAY).text, 'Warranty ends in 4 months');
  assert.equal(warrantyWords('2027-01-31', TODAY).state, 'soon');
  assert.equal(warrantyWords('2026-10-08', TODAY).text, 'Warranty ends in 10 days');
  assert.equal(warrantyWords('2026-10-20', TODAY).text, 'Warranty ends in 3 weeks');
  assert.equal(warrantyWords('2025-02-04', TODAY).text, 'Out of warranty since Feb 2025');
  assert.equal(warrantyWords('2028-06-07', TODAY).text, 'Under warranty until Jun 2028');
  assert.equal(warrantyWords(null, TODAY), null, 'no date, no answer: the page shows nothing');
  assert.equal(monthsUntil('2026-09-28', '2027-09-27'), 12);
});

test('support names the vendor and its contract, and says when a contract has ended', () => {
  const v = { id: 'keystone', name: 'Keystone Service', contract: { ref: 'AG-SVC-2026-01', end: '2028-12-31' } };
  assert.equal(supportWords(v, TODAY).text, 'Keystone Service, contract AG-SVC-2026-01, until 31 Dec 2028');
  assert.equal(supportWords({ ...v, contract: { ref: 'X', end: '2026-01-01' } }, TODAY).live, false);
  assert.equal(money(3600), '€3,600');
});

test('warranties ending: counted by month, grouped by office and model, and the ones with no cover after are named', () => {
  const units = [
    { tag: 'A', site: 'dub', office: 'Dublin office', model: 'm1', modelName: 'M1', ends: '2026-11-02', support: 'keystone', supportName: 'Keystone Service' },
    { tag: 'B', site: 'dub', office: 'Dublin office', model: 'm1', modelName: 'M1', ends: '2027-02-10', support: null },
    { tag: 'C', site: 'lon', office: 'London office', model: 'm2', modelName: 'M2', ends: '2029-01-01', support: null },
    { tag: 'D', site: 'lon', office: 'London office', model: 'm2', modelName: 'M2', ends: '2025-01-01', support: null },
  ];
  const r = endingSoon(units, TODAY, 12);
  assert.equal(r.count, 2);
  assert.equal(r.bare, 1);
  assert.equal(r.answer, '2 warranties end in the next 12 months · 1 with no support contract after');
  assert.deepEqual(r.rows.map((x) => [x.site, x.n, x.covered]), [['dub', 2, 1]]);
  assert.equal(r.bars.length, 12);
  assert.equal(r.bars.reduce((n, b) => n + b.n, 0), 2);
});

test('every unit with a date has a purchase and a warranty, marked demo; support names a vendor that covers it', () => {
  const vendors = Object.fromEntries(load('vendors').map((v) => [v.id, v]));
  let n = 0;
  for (const inst of load('installs')) {
    for (const p of inst.positions ?? []) for (const u of p.units) {
      if (!u.installed) continue;
      n++;
      assert.ok(u.purchase?.demo && u.warranty?.demo, `${u.asset_tag}: purchase and warranty, marked demo`);
      assert.ok(u.warranty.ends > u.purchase.date && u.purchase.date <= u.installed, `${u.asset_tag}: bought, then installed, warranty after`);
      if (u.support) {
        const v = vendors[u.support];
        assert.ok(v, `${u.asset_tag}: support vendor ${u.support} exists`);
        if (v.kind === 'service') assert.ok(v.contract.covers_models.includes(u.model ?? p.model), `${u.asset_tag}: ${v.name} covers its model`);
      }
    }
  }
  assert.ok(n > 1000, 'the fleet has its purchase records');
});

// ---- Every new block can be switched off -------------------------------------------------------------------------

test('each capability added is listed once, with a label, a line and a module', () => {
  const ids = FEATURES_ADDED.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FEATURES_ADDED) {
    assert.ok(f.label && f.description && ['assets', 'locations', 'team', 'support', 'projects'].includes(f.module), f.id);
  }
});
