// The standards coverage check (tools/coverage.mjs): every "must" rule whose check names a field that no record
// carries is listed, so a rule like the VLAN plan can never again sit in a standard with nothing behind it.
// It is a report, never a failure. Run with:  npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../tools/validate.mjs';
import { carries, parseRef, standardsCoverage, coverageLines } from '../tools/coverage.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'fixtures', 'coverage');

test('a chain of keys is found anywhere in a record, through lists', () => {
  const rec = { units: [{ serial: 'x', warranty: { ends: '2027-01-01' } }], power: { ups: { runtime_min: 22 } } };
  assert.ok(carries(rec, ['warranty', 'ends']));
  assert.ok(carries(rec, ['ups', 'runtime_min']));
  assert.ok(carries(rec, ['power', 'ups', 'runtime_min']));
  assert.ok(!carries(rec, ['power', 'runtime_min']), 'a chain must continue right where it starts');
  assert.ok(!carries(rec, ['mac']));
  assert.ok(!carries({ mac: null }, ['mac']), 'an empty value is not a record of it');
});

test('a reference is folder:key.path, and on-site and connect are not fields', () => {
  assert.deepEqual(parseRef('installs:warranty.ends'), { folder: 'installs', path: ['warranty', 'ends'] });
  assert.equal(parseRef('on-site'), null);
  assert.equal(parseRef('connect'), null);
});

test('the report lists must rules whose field no record carries, and it is not a failure', async () => {
  const r = await validate(fixture);
  assert.deepEqual(r.errors, [], 'a missing field is a report, not an error');
  assert.equal(r.ok, true);
  const c = r.coverage;
  assert.deepEqual(c.missing.map((m) => [m.rule, m.fields]), [['has-colour', ['widgets:colour']], ['both', ['widgets:colour']]]);
  assert.deepEqual(c.untied.map((u) => u.rule), ['not-said']);
  assert.deepEqual(c.counts, { must: 6, carried: 1, 'on-site': 1, connect: 1, missing: 2, untied: 1 });
  const lines = coverageLines(c).join('\n');
  assert.match(lines, /2 must rules check a field that no record carries/);
  assert.match(lines, /widgets\/has-colour {2}needs widgets:colour/);
  assert.match(lines, /1 must rule does not say how it is proved/);
});

test('a field in a folder the registry does not know is named, so a typo cannot hide a gap', () => {
  const std = { folder: 'standards', rel: 'data/standards/x.yaml', data: { id: 'x', sections: [{ id: 's', rules: [{ id: 'r', level: 'must', record: 'widgetz:ports' }] }] } };
  const c = standardsCoverage([std], new Set(['widgets', 'standards']));
  assert.equal(c.unknown.length, 1);
  assert.match(c.unknown[0].message, /no data folder "widgetz"/);
});

test('the real standards: every must rule says how it is proved', async () => {
  const r = await validate();
  assert.equal(r.ok, true);
  assert.deepEqual(r.coverage.untied.map((u) => `${u.standard}/${u.rule}`), []);
  assert.ok(r.coverage.counts.must > 90, 'the standards hold their must rules');
});
