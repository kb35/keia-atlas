// The method pages read docs/keia-method.md (src/lib/method.mjs). These checks fail when the text changes shape in
// a way the pages cannot follow, so an edit to the method is caught here, not on a blank page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { METHOD, LEVEL1, IDEAS, SECTIONS, WORDS, STANDARDS, WORDS_FOR, MAPS, part, moves, md } from '../src/lib/method.mjs';
import { PAGES, LEVEL1_TRY } from '../src/pages/method/_pages.mjs';
import { LINE, SENTENCE } from '../src/lib/brand.mjs';

test('Level 1: the sentence, the paragraph, five ideas with an example each, eight words', () => {
  assert.equal(METHOD.title, 'The Keia Method');
  assert.ok(SENTENCE.endsWith(METHOD.sentence.slice(1)), 'the front door sentence is the method sentence');
  assert.ok(LEVEL1.paragraph.startsWith('Workplace IT runs on'));
  assert.equal(LEVEL1.ideas.length, 5);
  for (const i of LEVEL1.ideas) assert.ok(i.name && i.line && i.example, `idea ${i.n}`);
  assert.equal(LEVEL1.words.length, 8);
  assert.ok(LEVEL1.routine && LEVEL1.origin);
  assert.match(METHOD.licence, /CC BY-SA 4\.0/);
});

test('each idea has its Level 2 section in the fixed order', () => {
  assert.deepEqual(IDEAS.map((i) => i.slug), ['start-from-the-building', 'capture-dont-ask', 'answer-first', 'own-it-hand-it-on', 'learn-as-you-go']);
  for (const i of IDEAS) {
    for (const re of [/^What you do/, /^The moves/, /^Why it works/, /^Limits/, /^Measure/]) assert.ok(part(i, re), `${i.slug}: ${re}`);
    assert.ok(moves(part(i, /^The moves/).text), `${i.slug}: the moves read as a list`);
  }
});

test('the sections the pages use exist, with their tables', () => {
  for (const n of ['2.1', '2.7', '2.8', '2.9', '3.1', '3.2', '3.3', '3.4']) assert.ok(SECTIONS[n], n);
  assert.equal(SECTIONS['2.1'].tables[0].head.length, 3);
  assert.ok(SECTIONS['2.9'].tables[0].rows.length >= 8, 'the trust table keeps its first row (its header is empty)');
  assert.deepEqual(WORDS.head, ['On screen', 'Plain meaning', 'Maps to']);
  assert.ok(WORDS.rows.length > 20 && STANDARDS.rows.length > 5);
  for (const prefixes of Object.values(MAPS)) assert.equal(WORDS_FOR(prefixes).length, prefixes.length);
});

test('every method page has a thing to try, with steps and a link', () => {
  assert.ok(PAGES.length >= 10);
  for (const p of [...PAGES, { slug: 'level1', try: LEVEL1_TRY }]) {
    assert.ok(p.try && p.try.to.startsWith('/') && p.try.label && p.try.steps.length, p.slug);
    for (const s of p.try.steps) assert.ok(!/[—–]/.test(s), `${p.slug}: no dashes`);
  }
});

test('the line under the name is one constant, used by the README', () => {
  assert.ok(readFileSync(new URL('../README.md', import.meta.url), 'utf8').includes(LINE));
  assert.ok(!/[—–]/.test(LINE + SENTENCE));
});

test('inline Markdown is escaped before it is rendered', () => {
  assert.equal(md('<b>x</b> **y** *z* [a](https://e.org)'), '&lt;b&gt;x&lt;/b&gt; <strong>y</strong> <em>z</em> <a href="https://e.org">a</a>');
});
