// People are never ranked (UX-V2 §4.7 step 5, UI-V2 §10 "No person's name appears beside a count, rate or rank").
// Leadership's Home names an owner ("Owner: Anna") but never counts, rates or ranks a person ("Tom: 12 closed this
// week"). Checked three ways: the leadership model (src/lib/costs.mjs), the experience figures behind it, and, when the
// site has been built, the text of Claire's sections on Home.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsDist } from './helpers/dist.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PEOPLE } from '../src/lib/demo.mjs';
import { leadership } from '../src/lib/costs.mjs';
import { experience, MEASURES } from '../src/lib/experience.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NAMES = [...new Set(PEOPLE.flatMap((p) => [p.name, p.name.split(' ')[0]]))];
const NAME_RE = new RegExp(`\\b(${NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`);
const hasCount = (s) => /\d/.test(s);
const nameIn = (s) => s.match(NAME_RE)?.[0] ?? null;

// Every string in a value, with its path, leaving out links (addresses carry ids, not words).
function strings(v, path = '', out = []) {
  if (typeof v === 'string') { if (!/(^|\.)(to|url|id)$/.test(path)) out.push([path, v]); }
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, path ? `${path}.${k}` : k, out);
  return out;
}

const OWNERS = Object.fromEntries(PEOPLE.map((p) => [p.id, p.name.split(' ')[0]]));
const VENDORS = [
  { id: 'brightwave', name: 'Brightwave Integration', owner: 'anna', contract: { end: '2026-10-31' } },
  { id: 'keystone', name: 'Keystone Service', owner: 'sofia', contract: { end: '2028-12-31' } },
];
const L = leadership({ vendors: VENDORS, experience: experience('av', [{ id: 'dub', weight: 40 }, { id: 'nyc', weight: 60 }]), behind: 34, owners: OWNERS });

test('the names list is real: it catches a name beside a count', () => {
  assert.ok(NAMES.includes('Claire') && NAMES.includes('Tom'));
  assert.equal(nameIn('Tom: 12 closed this week'), 'Tom');
  assert.equal(nameIn('Device firmware on 34 units'), null, 'a word that starts like a name is not a name');
});

test('no line on leadership\'s Home puts a person\'s name beside a number', () => {
  const bad = strings(L).filter(([path, s]) => hasCount(s) && nameIn(s) && !path.endsWith('.owner')).map(([p, s]) => `${p}: ${s}`);
  assert.deepEqual(bad, []);
});

test('an owner stands on its own: a name, never a number', () => {
  assert.ok(L.review.length > 0, 'the demo has something to review');
  for (const r of L.review) {
    if (r.owner) { assert.ok(!hasCount(r.owner), r.owner); assert.ok(NAMES.includes(r.owner), r.owner); }
    assert.equal(nameIn(r.text), null, r.text);
  }
});

test('the band\'s figures and answer name nobody, and every figure has a source and a time', () => {
  for (const f of L.figures) {
    assert.equal(nameIn(f.label), null, f.label); assert.equal(nameIn(String(f.n)), null);
    assert.ok(f.source?.from && f.source?.at, `${f.label} has a source and a time`);
  }
  assert.equal(nameIn(L.answer), null);
  for (const c of L.costs) assert.ok(c.source?.from && c.source?.at, `${c.label} has a source and a time`);
});

test('experience measures are per space or per service, never per person', () => {
  for (const list of Object.values(MEASURES)) for (const m of list) assert.equal(nameIn(`${m.label} ${m.method}`), null, m.label);
});

test('Claire\'s sections on the built Home name no person beside a number (runs when dist/ exists)', { skip: needsDist('index.html') }, () => {
  const html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');
  const bad = [];
  for (const sec of ['costs', 'lreview', 'pilot', 'model']) {
    const m = html.match(new RegExp(`<section[^>]*data-sec="${sec}"[\\s\\S]*?</section>`));
    assert.ok(m, `section ${sec} is on Home`);
    // Each run of text between tags is one thing the page says; none may hold both a name and a number.
    for (const t of m[0].replace(/<(script|style|template)[\s\S]*?<\/\1>/g, '').split(/<[^>]+>/).map((x) => x.trim()).filter(Boolean)) {
      if (hasCount(t) && nameIn(t)) bad.push(`${sec}: ${t}`);
    }
  }
  assert.deepEqual(bad, []);
});
