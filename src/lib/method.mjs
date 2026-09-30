// The Keia Method, read from docs/keia-method.md when the site is built, so the method pages under /method/ say
// exactly what the method text says and never drift from it. Nothing here writes method content of its own: it
// splits the text into its levels, sections, labelled paragraphs, lists and tables, and renders the small amount
// of inline Markdown the text uses (bold, italics, links). tests/method.test.mjs checks the shape it expects.
//
//   METHOD            { title, sentence, intro, licence }
//   LEVEL1            { opening, story: { before, after, steps }, ideas: [{ n, slug, name, card, line }], start, words }
//   CARD              the four lines of an idea's card, in order: Instead of, You, You'll know it's working when, In Keia Atlas
//   IDEAS             the five ideas, each with its Level 2 section: { ...idea, num, summary, parts: [{ label, text }] }
//   SEC2              the other Level 2 sections, found by title: { modules, routine, trust, problems }
//   SECTIONS          every "### n.n" section by number: { num, title, paras, parts, tables, lists }
//   WORDS_FOR(prefixes)  rows of the Level 3 words table whose first cell starts with one of the prefixes
//   md(text)          inline Markdown to HTML (escaped first)
import { readFileSync } from 'node:fs';
import path from 'node:path';

const FILE = path.join(process.cwd(), 'docs', 'keia-method.md');
const RAW = readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n');

// ---------- Inline Markdown ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function md(text = '') {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u.replace(/"/g, '&quot;')}">${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
}
// Plain text: the Markdown marks taken out (for titles, labels and aria text).
export const plain = (text = '') => text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
export const slugOf = (name) => plain(name).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------- Blocks ----------
// A body of lines becomes blocks: a table (lines starting "|"), a numbered list, or a paragraph.
function blocks(lines) {
  const out = []; let cur = [];
  const flush = () => { if (cur.length) out.push(cur); cur = []; };
  for (const l of lines) { if (!l.trim() || /^---\s*$/.test(l)) flush(); else cur.push(l); }
  flush();
  return out.map((b) => {
    if (b.every((l) => l.trim().startsWith('|'))) {
      const rows = b.filter((l) => !/^\s*\|(\s*:?-+:?\s*\|)+\s*$/.test(l)).map((l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      return { kind: 'table', head: rows[0], rows: rows.slice(1) };
    }
    if (b.every((l) => /^\d+\.\s/.test(l.trim()))) return { kind: 'list', items: b.map((l) => l.trim().replace(/^\d+\.\s+/, '')) };
    if (b.every((l) => /^-\s/.test(l.trim()))) return { kind: 'list', bullets: true, items: b.map((l) => l.trim().replace(/^-\s+/, '')) };
    return { kind: 'para', text: b.map((l) => l.trim()).join(' ') };
  });
}
// "**Label.** text" or "**Label:** text"
const LABEL = /^\*\*(.+?)[.:]\*\*\s*(.*)$/;
const labelled = (text) => { const m = text.match(LABEL); return m ? { label: m[1], text: m[2] } : null; };

// ---------- Split the file ----------
const lines = RAW.split('\n');
const h1 = lines.findIndex((l) => l.startsWith('# '));
const title = lines[h1].slice(2).trim();
const levelAt = (n) => lines.findIndex((l) => l.startsWith(`## Level ${n}`));
const L1 = levelAt(1), L2 = levelAt(2), L3 = levelAt(3);
if (L1 < 0 || L2 < 0 || L3 < 0) throw new Error('method.mjs: docs/keia-method.md needs "## Level 1", "## Level 2" and "## Level 3" headings');
const head = blocks(lines.slice(h1 + 1, L1)).filter((b) => b.kind === 'para');
// The licence line is the last paragraph of the file, after the final rule.
const lastRule = lines.map((l, i) => (/^---\s*$/.test(l) ? i : -1)).filter((i) => i > L3).pop();
const tail = lastRule ? blocks(lines.slice(lastRule + 1)).filter((b) => b.kind === 'para') : [];

export const METHOD = { title, sentence: head[0]?.text ?? '', intro: head[1]?.text ?? '', licence: tail[0]?.text ?? '' };

// Level 1: the short version. Its "### " parts are found by their titles: the opening paragraph, the story (before,
// and after as timed steps), the five ideas (a "#### n. Name" heading each, with its card of four labelled lines),
// the 30-day start, and the words in two groups.
const l1lines = lines.slice(L1 + 1, L2);
const l1parts = [];
{
  let cur = { title: '', lines: [] };
  for (const l of l1lines) {
    if (/^### /.test(l)) { l1parts.push(cur); cur = { title: l.slice(4).trim(), lines: [] }; } else cur.lines.push(l);
  }
  l1parts.push(cur);
}
const l1part = (re) => {
  const p = l1parts.find((x) => re.test(x.title));
  if (!p) throw new Error(`method.mjs: Level 1 needs a "### " part matching ${re}`);
  return p;
};
// "- **Label** text", "- **Label:** text" or "- **Label.** text" -> { label, text }
const ITEM = /^\*\*(.+?)[.:]?\*\*[.:]?\s*(.*)$/;
const item = (text) => { const m = text.match(ITEM); return m ? { label: m[1], text: m[2] } : { label: '', text }; };
const bulletsOf = (bs) => bs.filter((b) => b.kind === 'list' && b.bullets).flatMap((b) => b.items.map(item));

const opening = blocks(l1parts[0].lines).filter((b) => b.kind === 'para').map((b) => b.text);

const storyPart = l1part(/morning/i);
const storyBlocks = blocks(storyPart.lines);
const storyBefore = storyBlocks.map((b) => b.kind === 'para' && labelled(b.text)).find((x) => x && /^Before$/.test(x.label));
const storyAfter = storyBlocks.map((b) => b.kind === 'para' && labelled(b.text)).find((x) => x && /^After$/.test(x.label));
const steps = bulletsOf(storyBlocks).map((x) => ({ time: x.label, text: x.text }));

// The card: four lines, always in this order. The first three make sense with no software; the last is Keia Atlas.
export const CARD = [
  { key: 'instead', label: 'Instead of' },
  { key: 'you', label: 'You' },
  { key: 'working', label: "You'll know it's working when" },
  { key: 'atlas', label: 'In Keia Atlas' },
];
const ideasPart = l1part(/five ideas/i);
const ideaChunks = [];
{
  let cur = null;
  for (const l of ideasPart.lines) {
    const m = l.match(/^#### (\d+)\.\s+(.+)$/);
    if (m) { cur = { n: Number(m[1]), name: m[2].trim(), lines: [] }; ideaChunks.push(cur); } else if (cur) cur.lines.push(l);
  }
}
const ideasIntro = blocks(ideasPart.lines.slice(0, ideasPart.lines.findIndex((l) => /^#### /.test(l)))).filter((b) => b.kind === 'para').map((b) => b.text);
const ideas = ideaChunks.map((c, i) => {
  const lines4 = bulletsOf(blocks(c.lines));
  const card = {};
  CARD.forEach((k, j) => {
    const got = lines4[j];
    if (!got || got.label !== k.label) throw new Error(`method.mjs: idea ${i + 1}, line ${j + 1} should start "**${k.label}**" (found "${got?.label ?? 'nothing'}")`);
    card[k.key] = got.text;
  });
  return { n: c.n, slug: slugOf(c.name), name: c.name, card, line: card.you };
});

const startPart = l1part(/30 days/i);
const startBlocks = blocks(startPart.lines);
const start = {
  title: startPart.title,
  intro: startBlocks.filter((b) => b.kind === 'para').map((b) => b.text),
  steps: bulletsOf(startBlocks).map((x) => { const m = x.label.match(/^([^:]+):\s*(.+)$/); return { when: m ? m[1] : x.label, what: m ? m[2] : '', text: x.text }; }),
};

// The words: an intro, then groups, each a "**Label.** line" paragraph followed by its list of "**Word:** meaning".
const wordsPart = l1part(/words/i);
const wordGroups = [];
const wordsIntro = [];
for (const b of blocks(wordsPart.lines)) {
  const l = b.kind === 'para' && labelled(b.text);
  if (l) wordGroups.push({ label: l.label, text: l.text, words: [] });
  else if (b.kind === 'list' && wordGroups.length) wordGroups[wordGroups.length - 1].words.push(...b.items.map(item).map((x) => ({ word: x.label, meaning: x.text })));
  else if (b.kind === 'para') wordsIntro.push(b.text);
}

export const LEVEL1 = {
  heading: lines[L1].replace(/^## /, ''),
  opening,
  story: { title: storyPart.title, before: storyBefore ?? null, after: storyAfter ?? null, steps },
  ideasTitle: ideasPart.title,
  ideasIntro,
  ideas,
  start,
  words: { title: wordsPart.title, intro: wordsIntro, groups: wordGroups },
};

// Level 2 and 3 sections, and the sections of any later part: "### n.n Title". A section ends at the next section,
// the next part ("## ..."), or the licence rule.
export const SECTIONS = {};
const secStarts = lines.map((l, i) => (/^### \d+\.\d+ /.test(l) ? i : -1)).filter((i) => i >= 0);
const partStarts = lines.map((l, i) => (/^## /.test(l) ? i : -1)).filter((i) => i >= 0);
secStarts.forEach((start, k) => {
  const end = Math.min(k + 1 < secStarts.length ? secStarts[k + 1] : lines.length, ...[...partStarts, lastRule ?? lines.length].filter((x) => x > start));
  const m = lines[start].match(/^### (\d+\.\d+) (.+)$/);
  const bs = blocks(lines.slice(start + 1, end));
  const paras = bs.filter((b) => b.kind === 'para').map((b) => b.text);
  SECTIONS[m[1]] = {
    num: m[1], title: m[2], level: Number(m[1].split('.')[0]),
    blocks: bs,
    paras: paras.filter((p) => !labelled(p)),
    parts: paras.map(labelled).filter(Boolean),
    tables: bs.filter((b) => b.kind === 'table'),
    lists: bs.filter((b) => b.kind === 'list').map((b) => b.items),
  };
});
export const sectionByTitle = (t) => Object.values(SECTIONS).find((s) => s.title.toLowerCase() === t.toLowerCase());
// The other Level 2 sections, found by their titles so a renumbering never breaks a page.
const l2 = (re) => {
  const s = Object.values(SECTIONS).find((x) => x.level === 2 && re.test(x.title));
  if (!s) throw new Error(`method.mjs: no Level 2 section titled ${re}`);
  return s;
};
export const SEC2 = { modules: l2(/^Start anywhere/), routine: l2(/routine work/i), trust: l2(/trust/i), problems: l2(/^The problems/) };

// The five ideas with their Level 2 sections.
export const IDEAS = ideas.map((idea) => {
  const s = sectionByTitle(idea.name);
  if (!s) throw new Error(`method.mjs: no Level 2 section named "${idea.name}"`);
  return { ...idea, num: s.num, title: s.title, summary: s.paras[0] ?? '', paras: s.paras.slice(1), parts: s.parts };
});
export const part = (idea, re) => idea.parts.find((p) => re.test(p.label));

// "The moves" as a list: "Zoom (region to port and back). Lens (...)." -> [{ move, meaning }]. Returns null when
// the text is not all in that shape, so a page can fall back to the sentence as written.
export function moves(text = '') {
  const out = [];
  const re = /\s*([A-Z][^.()]*?)\s\(((?:[^()]|\([^()]*\))*)\)\./g;
  let m, used = 0;
  while ((m = re.exec(text))) { out.push({ move: m[1], meaning: m[2] }); used += m[0].length; }
  return out.length && used === text.length ? out : null;
}

// Which rows of the Level 3 words table each idea's words map to (the idea's own words, found by their first cell).
export const MAPS = {
  'start-from-the-building': ['Space, Space type', 'Unit, Model, Device type', 'Relationship, Service map, Confidence'],
  'capture-dont-ask': ['Incident, Major incident', 'Priority P1 to P4', 'Setup guide, Build sheet', 'Problem, Known error'],
  'answer-first': ['Service, Service owner', 'Experience measure', 'To review', 'Past due'],
  'own-it-hand-it-on': ['With you', 'Ready for you', 'Waiting on', 'Verbs:', 'Done automatically'],
  'learn-as-you-go': ['Knowledge, Runbook, Lesson, Proposal', 'Setup guide, Build sheet', 'Problem, Known error'],
  modules: ['Module: On, Connected, Off'],
  'how-the-work-gets-done': ['Change: Standard, Normal, Emergency', 'Done automatically', 'Agent', 'Unable to complete'],
};

// Level 3: the words table and its intro.
const wordsSec = sectionByTitle('Words');
export const WORDS = { intro: wordsSec?.paras[0] ?? '', head: wordsSec?.tables[0]?.head ?? [], rows: wordsSec?.tables[0]?.rows ?? [] };
export function WORDS_FOR(prefixes) {
  return prefixes.map((p) => {
    const row = WORDS.rows.find((r) => plain(r[0]).startsWith(p));
    if (!row) throw new Error(`method.mjs: no row in the words table starts "${p}"`);
    return row;
  });
}
const stdSec = Object.values(SECTIONS).find((s) => /^Standards/.test(s.title));
export const STANDARDS = { title: stdSec?.title ?? '', intro: stdSec?.paras[0] ?? '', head: stdSec?.tables[0]?.head ?? [], rows: stdSec?.tables[0]?.rows ?? [] };
export function STANDARDS_FOR(prefixes) {
  return prefixes.map((p) => {
    const row = STANDARDS.rows.find((r) => plain(r[0]).startsWith(p));
    if (!row) throw new Error(`method.mjs: no row in the standards table starts "${p}"`);
    return row;
  });
}

// ---------- A later part: How it fits ----------
// "## How it fits" after Level 3: an intro, the overview table (framework, what it is for, how Keia relates, its
// section), labelled notes (Trademarks), then one "### 4.n" section per framework. A framework section is read as
// groups: each "**Label.** text" starts a group, and the tables, lists and plain paragraphs after it belong to it.
//   FITS  { title, intro: [para], notes: [{ label, text }], head, rows, frameworks: [{ num, title, what, groups }] }
const fitsAt = lines.findIndex((l) => /^## How it fits\s*$/.test(l));
function groupsOf(bs) {
  const out = [];
  for (const b of bs) {
    const l = b.kind === 'para' && labelled(b.text);
    if (l) out.push({ label: l.label, text: l.text, blocks: [] });
    else if (out.length) out[out.length - 1].blocks.push(b);
    else out.push({ label: '', text: '', blocks: [b] });
  }
  return out;
}
export const FITS = (() => {
  if (fitsAt < 0) return null;
  const firstSec = secStarts.find((i) => i > fitsAt) ?? lastRule ?? lines.length;
  const bs = blocks(lines.slice(fitsAt + 1, firstSec));
  const table = bs.find((b) => b.kind === 'table');
  const paras = bs.filter((b) => b.kind === 'para');
  const frameworks = secStarts.filter((i) => i > fitsAt).map((i) => SECTIONS[lines[i].match(/^### (\d+\.\d+) /)[1]]).map((s) => {
    const groups = groupsOf(s.blocks);
    const what = groups.find((g) => /^What (it is|they are)$/.test(g.label));
    return { num: s.num, title: s.title, what: what?.text ?? '', groups };
  });
  return {
    title: 'How it fits',
    intro: paras.filter((p) => !labelled(p.text)).map((p) => p.text),
    notes: paras.map((p) => labelled(p.text)).filter(Boolean),
    head: table?.head ?? [], rows: table?.rows ?? [],
    frameworks,
  };
})();
