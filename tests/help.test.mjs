// Help mode (decision 0027): every data-help key used anywhere in src/ has a card in src/lib/help.mjs, every
// place, tab and page has its own card, every "Learn more" link resolves, and the words follow the house rules.
// A missing key is listed by name, with the file that uses it, so it is easy to add.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP, helpJson, hasHelp, learnLink } from '../src/lib/help.mjs';
import { GLOSSARY } from '../src/pages/learn/_glossary.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const FILES = walk(join(ROOT, 'src')).filter((f) => /\.(astro|mjs|js|ts)$/.test(f) && !f.endsWith('src/lib/help.mjs') && !f.endsWith('components/HelpMode.astro'));
const text = new Map(FILES.map((f) => [f, readFileSync(f, 'utf8')]));

// Every key an element can carry, with where it was found. A key that is built from a variable ("number:" + label)
// is checked by its fixed front, which must have a general entry ("number").
function usedKeys() {
  const used = new Map();   // key -> first file
  const add = (raw, file, family = false) => {
    let key = raw.trim();
    if (!key) return;
    if (family || /[`'+$]/.test(key)) key = key.split(/[`'+$]/)[0];
    if (family && key.endsWith(':')) key = key.slice(0, -1);
    if (/^[a-z0-9.:-]+:$/i.test(key)) key = key.slice(0, -1);
    if (key && !used.has(key)) used.set(key, relative(ROOT, file));
  };
  for (const [file, src] of text) {
    // data-help="key" (also inside a JS string, where the quotes are escaped)
    for (const m of src.matchAll(/(?<![[\w-])data-help=\\?"([^"\\]+)\\?"/g)) add(m[1], file);
    // data-help={ 'a' ? 'b' } and data-help={`front:${x}`}
    for (const m of src.matchAll(/(?<![[\w-])data-help=\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
      for (const q of m[1].matchAll(/'([^']+)'/g)) add(q[1], file);
      for (const t of m[1].matchAll(/`([^`]*)`/g)) add(t[1].split('${')[0], file, t[1].includes('${'));
    }
    // keys a script reads straight from the registry (D['peek'])
    for (const m of src.matchAll(/\bD\['([a-z0-9.:-]+)'\]/g)) add(m[1], file);
    // props that carry a key into a shared part: <Section help="..."> <SidePanel help="..."> <FilterBar viewsHelp="...">
    for (const m of src.matchAll(/(?<![\w-])(?:help|viewsHelp)\s*=\s*["']([a-z0-9.:-]+)["']/g)) add(m[1], file);
  }
  return used;
}

test('every data-help key used in src/ has an entry in the help registry', () => {
  const missing = [...usedKeys()].filter(([k]) => !hasHelp(k));
  assert.deepEqual(missing.map(([k, f]) => `${k}  (used in ${f})`), [], 'add these keys to src/lib/help.mjs');
});

test('the registry has no key that nothing uses (typos and leftovers)', () => {
  const used = new Set(usedKeys().keys());
  // Family members ("filter.facet:region"), glossary words and whole pages are reached through their family or by rule.
  const unused = Object.keys(HELP).filter((k) => !k.includes(':') && !k.startsWith('page.') && !used.has(k));
  assert.deepEqual(unused, [], 'remove these from src/lib/help.mjs or put data-help on the thing they explain');
});

test('every page section has its own page card, and every place and tab has its own card', () => {
  const sections = new Set();
  for (const [file, src] of text) if (file.includes('/src/pages/')) for (const m of src.matchAll(/<Shell\b[^>]*?\bsection="([a-z-]+)"/gs)) sections.add(m[1]);
  assert.ok(sections.size > 20, 'found the pages\' sections');
  assert.deepEqual([...sections].filter((s) => !HELP[`page.${s}`]), [], 'each section needs a page.<section> card');
  const shell = readFileSync(join(ROOT, 'src/layouts/Shell.astro'), 'utf8');
  const nav = shell.slice(shell.indexOf('const NAV = ['), shell.indexOf('const parent = NAV'));
  const places = [...nav.matchAll(/^  \{ id: '([a-z-]+)', label:/gm)].map((m) => m[1]);
  const tabs = [...nav.matchAll(/^\s+\{ id: '([a-z-]+)', label: '[^']+', to:/gm)].map((m) => m[1]).filter((id) => !places.includes(id) || id === 'rooms' || id === 'devices' || id === 'team');
  assert.ok(places.length >= 8 && tabs.length >= 20, 'read the navigation');
  assert.deepEqual(places.filter((p) => !HELP[`place:${p}`]), [], 'each place needs place:<id>');
  assert.deepEqual([...new Set(tabs)].filter((t) => !HELP[`tab:${t}`]), [], 'each tab needs tab:<id>');
});

test('every "Learn more" link goes to a lesson or a glossary word that exists', () => {
  const j = helpJson();
  assert.ok(Object.keys(j).length > 150, 'the registry is built');
  for (const [k, h] of Object.entries(HELP)) {
    if (h.learn) assert.ok(learnLink(h.learn), `${k}: ${h.learn}`);
    assert.ok(h.name && h.what, `${k} needs a name and words for what it is`);
  }
  const some = Object.values(j).filter((h) => h.learn).length;
  assert.ok(some > 100, 'most cards link into Learn');
});

test('every glossary word can be explained (term:<id>) with one definition', () => {
  const j = helpJson();
  for (const g of GLOSSARY) assert.equal(j[`term:${g.id}`]?.what, g.def, `term:${g.id}`);
});

test('help words follow the house rules: no em dashes, no double spaces, no word left half-written', () => {
  for (const [k, h] of Object.entries(HELP)) {
    for (const t of [h.name, h.what, h.do]) {
      if (!t) continue;
      assert.ok(!/[\u2014\u2013]/.test(t), `${k} has a dash: ${t}`);
      assert.ok(!/ {2}/.test(t), `${k} has a double space`);
      assert.ok(!/\bTODO\b/.test(t), `${k} has a TODO`);
    }
  }
});

test('built pages only use keys the registry knows (runs when dist/ exists)', { skip: !existsSync(join(ROOT, 'dist')) }, () => {
  const dist = walk(join(ROOT, 'dist')).filter((f) => f.endsWith('.html'));
  const bad = new Map();
  for (const f of dist) {
    // Only real attributes on elements: not the words of a script, or a rule that quotes one in <code>.
    const html = readFileSync(f, 'utf8').replace(/<(script|style|code|pre)\b[\s\S]*?<\/\1>/g, '');
    for (const m of html.matchAll(/<[a-z][^<>]*?\sdata-help="([^"]+)"/g)) if (!hasHelp(m[1].replace(/&amp;/g, '&'))) bad.set(m[1], relative(ROOT, f));
  }
  assert.deepEqual([...bad].map(([k, f]) => `${k} (${f})`), []);
});
