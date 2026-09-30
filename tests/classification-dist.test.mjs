// Rule F10 (docs/rules/data.md): Restricted facts never ride along in public JSON. A page can hide a field, but a
// JSON file under dist/ can be fetched by anyone who can load the site, so the payload itself must leave them out.
// Runs over the build output; skips (with a message) when dist/ has not been built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { fieldLabels } from '../src/lib/classification.mjs';
import { ROOT, DIST, needsDist } from './helpers/dist.mjs';

// The field names that are Restricted: every field a schema labels Restricted (x-classification), plus the parts of
// the IP plan a unit's address is made of, and the short name the unit page once used for the password flag.
function restrictedKeys() {
  const keys = new Set(['ip', 'mac', 'fqdn', 'pw', 'default_password_changed']);
  const dir = path.join(ROOT, 'schemas', 'ext');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.yaml'))) {
    for (const { at, label } of fieldLabels(parse(readFileSync(path.join(dir, f), 'utf8')))) {
      // `people` on a vendor names portal users; the word is too common to police alone, so it is checked by value below.
      const name = at.split('.').pop();
      if (label === 'Restricted' && name !== 'people') keys.add(name);
    }
  }
  return keys;
}
const MAC = /\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/i;

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test('no Restricted field appears in any public JSON file', { skip: needsDist() }, () => {
  const keys = restrictedKeys();
  const found = [];
  for (const file of walk(DIST).filter((p) => p.endsWith('.json'))) {
    const rel = path.relative(DIST, file);
    let data;
    try { data = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    const seen = new Set();
    const visit = (v, at) => {
      if (found.length > 20) return;
      if (typeof v === 'string') { if (MAC.test(v) && !seen.has('mac-value')) { seen.add('mac-value'); found.push(`${rel}: a MAC address at ${at}`); } return; }
      if (!v || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach((x, i) => visit(x, `${at}[${i}]`)); return; }
      for (const [k, x] of Object.entries(v)) {
        if (keys.has(k) && x != null && !seen.has(k)) { seen.add(k); found.push(`${rel}: "${k}" at ${at}.${k}`); }
        visit(x, `${at}.${k}`);
      }
    };
    visit(data, '$');
  }
  assert.deepEqual(found, [], 'Restricted facts in public JSON (docs/rules/data.md F10)');
});
