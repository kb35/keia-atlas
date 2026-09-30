// The health glyphs and the heartbeat (UI-V2 §6, §8.6): states map, every glyph says its state in words, the
// heartbeat reads "checked N s ago" and turns into "Not reporting since" past its window, and no old status dot or
// fault pulse is left in src/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATES, WORD, stateOf, glyph, shape } from '../src/lib/health.mjs';
import { beat, lastCheck, parseFeed, FEED_EVERY } from '../src/lib/heartbeat.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('the older state words map onto the six health states', () => {
  assert.equal(stateOf('ok'), 'fine');
  assert.equal(stateOf('warn'), 'review');
  assert.equal(stateOf('bad'), 'fault');
  assert.equal(stateOf('off'), 'off');
  assert.equal(stateOf('stale'), 'stale');
  assert.equal(stateOf('nonsense'), 'off');
  for (const s of STATES) assert.equal(stateOf(s), s);
});

test('each state has its own shape and a word', () => {
  const shapes = new Set(STATES.map(shape));
  assert.equal(shapes.size, STATES.length, 'two states share a shape');
  for (const s of STATES) assert.ok(WORD[s], `${s} has no word`);
});

test('a glyph without its word carries it as its label', () => {
  const g = glyph('fault', { size: 12, title: 'offline since 07:51' });
  assert.match(g, /role="img"/);
  assert.match(g, /aria-label="Fault: offline since 07:51"/);
  assert.match(g, /data-state="fault"/);
  assert.match(glyph('ok', { word: true }), /<span class="hg-w">Fine<\/span>/);
});

test('the heartbeat counts up, then says Not reporting past its window', () => {
  const at = Date.UTC(2026, 8, 30, 8, 12, 0);
  assert.equal(beat(at + 2e3, at).text, 'checked just now');
  assert.equal(beat(at + 40e3, at).text, 'checked 40 s ago');
  assert.equal(beat(at + 60e3, at, 90).stale, false);
  const b = beat(at + 91e3, at, 90, 'UTC');
  assert.equal(b.stale, true);
  assert.equal(b.text, 'Not reporting since 08:12');
});

test('the demo feed checks on shared boundaries and stops when switched off', () => {
  const now = 1_000_000_123;
  assert.equal(lastCheck(now) % FEED_EVERY, 0);
  assert.ok(now - lastCheck(now) < FEED_EVERY);
  assert.deepEqual(parseFeed('off:500000'), { on: false, since: 500000 });
  assert.deepEqual(parseFeed(null), { on: true });
  assert.equal(lastCheck(now, 900_000_000), Math.floor(900_000_000 / FEED_EVERY) * FEED_EVERY);
});

test('no old status dot (.hl) or fault pulse (--dur-pulse) is left in src/', () => {
  const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const bad = [];
  for (const f of walk(join(ROOT, 'src')).filter((f) => /\.(astro|mjs|js|ts|css)$/.test(f))) {
    const src = readFileSync(f, 'utf8');
    if (/class="hl[ "]|class=\\?"hl lit|\.hl\[|\.hl\s*\{|var\(--dur-pulse/.test(src)) bad.push(f.slice(ROOT.length));
  }
  assert.deepEqual(bad, []);
});
