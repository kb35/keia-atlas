// The method pages read docs/keia-method.md (src/lib/method.mjs). These checks fail when the text changes shape in
// a way the pages cannot follow, so an edit to the method is caught here, not on a blank page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { METHOD, LEVEL1, CARD, IDEAS, SECTIONS, SEC2, WORDS, STANDARDS, WORDS_FOR, MAPS, FITS, part, moves, md } from '../src/lib/method.mjs';
import { PAGES, LEVEL1_TRY, FIT_PAGES } from '../src/pages/method/_pages.mjs';
import { LINE, SENTENCE } from '../src/lib/brand.mjs';

test('Level 1: the opening, the story, five ideas on one card shape, a 30-day start, the words in two groups', () => {
  assert.equal(METHOD.title, 'The Keia Method');
  assert.ok(METHOD.sentence && METHOD.sentence.length <= 110, 'the line under the title is at most 110 characters');
  assert.ok(!/[—–!]/.test(METHOD.sentence), 'no dashes or exclamation marks');
  // The opening: what it is and who it is for, then the problem, then the method beside the software.
  assert.match(LEVEL1.opening[0], /^The Keia Method is a way of working for /);
  assert.match(LEVEL1.opening[0], /spreadsheet/, 'the opening says the method works without the software');
  // The story: before in prose, after as timed steps; the first five steps are the five ideas, in order.
  assert.ok(LEVEL1.story.before?.text && LEVEL1.story.after?.text);
  assert.ok(LEVEL1.story.steps.length >= 6, 'five steps for the ideas, then the outcome');
  for (const s of LEVEL1.story.steps) assert.match(s.time, /^\d\d:\d\d$/, s.text);
  const minutes = LEVEL1.story.steps.map((s) => Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3)));
  assert.deepEqual(minutes, [...minutes].sort((x, y) => x - y), 'the steps are in time order');
  // Five ideas, each on the same four-line card; the first three name no product.
  assert.deepEqual(LEVEL1.ideas.map((i) => i.name), ['Start from the building', "Capture, don't ask", 'Answer first', 'Own it, hand it on', 'Learn as you go']);
  assert.deepEqual(CARD.map((k) => k.label), ['Instead of', 'You', "You'll know it's working when", 'In Keia Atlas']);
  for (const i of LEVEL1.ideas) {
    for (const k of CARD) assert.ok(i.card[k.key], `${i.name}: ${k.label}`);
    for (const k of ['instead', 'you', 'working']) assert.ok(!/Keia|Atlas/.test(i.card[k]), `${i.name}: the "${k}" line makes sense with no software`);
    const words = CARD.map((k) => i.card[k.key]).join(' ').split(/\s+/).length;
    assert.ok(words <= 75, `${i.name}: at most about 70 words at Level 1 (${words})`);
  }
  // Start in 30 days: weeks in order, then day 30.
  assert.deepEqual(LEVEL1.start.steps.map((s) => s.when), ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Day 30']);
  for (const s of LEVEL1.start.steps) assert.ok(s.what && s.text, s.when);
  // The words: the ITIL words kept, then Keia's own, each with a one-line meaning.
  assert.deepEqual(LEVEL1.words.groups.map((g) => g.label), ['ITIL words we keep', "Keia's own words"]);
  for (const g of LEVEL1.words.groups) {
    assert.ok(g.words.length >= 4, g.label);
    for (const w of g.words) assert.ok(w.word && w.meaning, `${g.label}: ${w.word}`);
  }
  assert.match(METHOD.licence, /CC BY-SA 4\.0/);
});

test("each idea has its Level 2 section, in the card's shape, expanded", () => {
  assert.deepEqual(IDEAS.map((i) => i.slug), ['start-from-the-building', 'capture-dont-ask', 'answer-first', 'own-it-hand-it-on', 'learn-as-you-go']);
  const ORDER = ['Instead of', 'You', 'The moves', "You'll know it's working when", 'In Keia Atlas', 'Why it works', 'Limits'];
  for (const i of IDEAS) {
    assert.ok(i.summary && i.summary.length <= 110, `${i.slug}: a plain first sentence, at most 110 characters (it is the page's line)`);
    const labels = i.parts.map((p) => p.label).filter((l) => ORDER.includes(l));
    assert.deepEqual(labels, ORDER, `${i.slug}: the card's lines, in order, then why and limits`);
    assert.ok(moves(part(i, /^The moves$/).text), `${i.slug}: the moves read as a list`);
    for (const re of [/^Instead of$/, /^You$/, /^The moves$/]) assert.ok(!/Keia Atlas/.test(part(i, re).text), `${i.slug}: ${re} makes sense with no software`);
  }
});

test('Level 2 after the ideas: where to start, routine work, trust, then the evidence, each with a plain first sentence', () => {
  assert.deepEqual([SEC2.modules, SEC2.routine, SEC2.trust, SEC2.problems].map((s) => s.num), ['2.6', '2.7', '2.8', '2.9']);
  for (const s of Object.values(SEC2)) assert.ok(s.paras[0] && s.paras[0].split(/(?<=\.)\s/)[0].length <= 110, `${s.title}: a plain first sentence`);
  assert.ok(Math.max(...IDEAS.map((i) => Number(i.num.split('.')[1]))) < Number(SEC2.problems.num.split('.')[1]), 'the evidence comes after the ideas');
});

test('the sections the pages use exist, with their tables', () => {
  for (const n of ['3.1', '3.2', '3.3', '3.4']) assert.ok(SECTIONS[n], n);
  assert.equal(SEC2.problems.tables[0].head.length, 3);
  assert.ok(SEC2.trust.tables[0].rows.length >= 8, 'the trust table keeps its first row (its header is empty)');
  assert.ok(SEC2.routine.tables[0].rows.length >= 10 && SEC2.modules.tables[0].rows.length >= 7);
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

test('the method pages follow the method: the five ideas first in Level 2, then the rest in its order', () => {
  const l2 = PAGES.filter((p) => p.level === 2);
  const n = (p) => Number(p.num.split('.')[1]);
  assert.deepEqual(l2.map(n), [...l2.map(n)].sort((a, b) => a - b));
  assert.deepEqual(l2.slice(0, 5).map((p) => p.slug), IDEAS.map((i) => i.slug));
});

test('inline Markdown is escaped before it is rendered', () => {
  assert.equal(md('<b>x</b> **y** *z* [a](https://e.org)'), '&lt;b&gt;x&lt;/b&gt; <strong>y</strong> <em>z</em> <a href="https://e.org">a</a>');
});

test('How it fits: the overview, nine frameworks in order, each with its line, mapping, sources and a page', () => {
  assert.ok(FITS, 'docs/keia-method.md has a "## How it fits" part');
  assert.deepEqual(FITS.head, ['Framework', 'What it is for', 'How Keia relates', 'Section']);
  assert.deepEqual(FITS.frameworks.map((f) => f.title), ['ITIL', 'ISO/IEC 20000-1', 'PMI: the PMBOK Guide', 'PRINCE2', 'Agile, DevOps and SRE', 'AVIXA standards', 'ISO 41001 and ISO 55001', 'ISO/IEC 27001 and NIS2', 'COBIT']);
  assert.deepEqual(FITS.rows.map((r) => r[3]), FITS.frameworks.map((f) => f.num), 'the overview lists every framework, in order');
  for (const r of FITS.rows) assert.match(r[2], /^(Implements part of it|Companion|Out of scope)/, r[0]);
  assert.ok(FITS.notes.some((n) => n.label === 'Trademarks' && /PeopleCert/.test(n.text) && /Project Management Institute/.test(n.text) && /ISACA/.test(n.text) && /AVIXA/.test(n.text)));
  const ideaNames = IDEAS.map((i) => i.name);
  for (const f of FITS.frameworks) {
    assert.ok(f.what && f.what.length <= 110, `${f.title}: one line, at most 110 characters`);
    const g = (label) => f.groups.find((x) => x.label === label);
    assert.match(g('Official source')?.text ?? '', /\]\(https:\/\//, `${f.title}: an official source link`);
    assert.ok(g('Sources')?.blocks.some((b) => b.kind === 'list'), `${f.title}: sources listed`);
    if (f.title === 'COBIT') continue;
    const map = g('How the ideas map')?.blocks.find((b) => b.kind === 'table');
    assert.ok(map && map.head[0] === 'Keia idea' && map.head.length === 3, `${f.title}: a mapping table`);
    for (const r of map.rows) assert.ok(ideaNames.includes(r[0]), `${f.title}: "${r[0]}" is one of the five ideas`);
    assert.ok(g('Use your normal process here')?.blocks.some((b) => b.kind === 'list'), `${f.title}: what it covers that Keia does not`);
    assert.ok(g('Words side by side')?.blocks.some((b) => b.kind === 'table'), `${f.title}: the words side by side`);
  }
  assert.equal(FIT_PAGES.length, FITS.frameworks.length + 1);
  assert.ok(FIT_PAGES.every((p) => PAGES.includes(p) && p.to.startsWith('/method/how-it-fits/')));
});
