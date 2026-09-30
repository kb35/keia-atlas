// The words people read (docs/rules/words.md, W2 and W10) and the band's answer line (REVIEW-SITE #1, #3).
//
//   - "profile" and "maker" are retired words: the glossary says device type, space type, setup guide and
//     manufacturer. They may not appear as visible words on any built page or in any help text. The data keys
//     (`maker:` in a known-issue feed, `layer: profile` in a setup guide) are not words on screen, so raw data in
//     <pre> and <code> is left out of the check, and so are the decision records and the written rules under
//     /about/, which are history and quote the old words on purpose.
//   - Two exceptions are real names, not our words: the manufacturers' own feature names "Network Profile" and
//     "Port Profile" (capitalised, as their screens spell them), and on the Method pages the Keia terms
//     "composite profile" and "object profile" that the words table maps to ours.
//   - The answer sentence under a page title wraps to two lines and is never cut with an ellipsis, but it must
//     stay short: an answer is at most 110 characters, a line that only describes the page at most 145.
//
// The page checks run when the site has been built (npm run build) and are skipped otherwise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP } from '../src/lib/help.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const built = existsSync(DIST);
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const pages = () => walk(DIST).filter((f) => f.endsWith('.html'));

const RETIRED = /(?<![\w-])(profiles?|makers?)(?![\w-])/gi;
const ALLOWED = /\b(Network Profiles?|Port Profiles?)\b/g;
const KEIA_TERMS = /\b(composite|object) profiles?\b/gi;
const ent = (s) => s.replace(/&#39;|&#x27;|&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ');

// What a person can read on a page: the text, and the words in title, aria-label, placeholder and alt.
function visible(html) {
  const attrs = [...html.matchAll(/\s(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((m) => m[1]);
  const text = html.replace(/<(script|style|pre|code)\b[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ');
  return ent([text, ...attrs].join(' \n '));
}

test('no page says "profile" or "maker" as a visible word', { skip: !built }, () => {
  const found = [];
  for (const f of pages()) {
    const rel = relative(DIST, f);
    if (rel.startsWith('about/')) continue;
    let text = visible(readFileSync(f, 'utf8')).replace(ALLOWED, ' ');
    if (rel.startsWith('method/')) text = text.replace(KEIA_TERMS, ' ');
    for (const m of text.matchAll(new RegExp(`.{0,40}${RETIRED.source}.{0,40}`, 'gi'))) found.push(`${rel}: ${m[0].replace(/\s+/g, ' ').trim()}`);
  }
  const seen = new Set();
  const uniq = found.filter((l) => { const k = l.split(': ')[1]; if (seen.has(k)) return false; seen.add(k); return true; });
  assert.deepEqual(uniq.slice(0, 25), [], `${uniq.length} places still say an old word (first 25 shown)`);
});

test('no help text says "profile" or "maker"', () => {
  const bad = [];
  for (const [k, h] of Object.entries(HELP)) {
    for (const t of [h.name, h.what, h.do]) {
      if (!t) continue;
      const clean = String(t).replace(ALLOWED, ' ');
      if (new RegExp(RETIRED.source, 'i').test(clean)) bad.push(`${k}: ${t}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('the answer under a page title is short enough to read in two lines', { skip: !built }, () => {
  const long = [];
  for (const f of pages()) {
    const html = readFileSync(f, 'utf8');
    const m = html.match(/<p class="pb-lede( pb-answer)?"[^>]*>\s*<span class="pb-a"[^>]*data-pb-answer[^>]*>([\s\S]*?)<\/span>\s*(?:<span class="pb-hb"|<\/p>)/);
    if (!m) continue;
    // A page that holds one answer per role (the others hidden) is not one sentence.
    if (/\shidden[\s>=]/.test(m[2])) continue;
    // The answer may carry a "How was this done?" link with its card inside: only the sentence counts.
    const text = ent(m[2].replace(/<(script|template)\b[\s\S]*?<\/\1>/g, '').replace(/<button\b[\s\S]*?<\/button>/g, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').replace(/ ·\s*$/, '').trim();
    const limit = m[1] ? 110 : 145;
    if (text.length > limit) long.push(`${relative(DIST, f)} (${text.length}): ${text}`);
  }
  assert.deepEqual(long, []);
});
