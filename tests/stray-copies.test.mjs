// iCloud (Documents sync) sometimes leaves copies named "name 2.ext" beside moved or deleted files.
// Astro would build them as extra pages, so any such copy under src/, data/ or schemas/ fails the tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

test('no stray " 2" copies from file sync in src, data or schemas', () => {
  const stray = ['src', 'data', 'schemas'].flatMap((d) => walk(join(ROOT, d))).filter((p) => / \d+\.[a-z]+$/i.test(p));
  assert.deepEqual(stray.map((p) => p.slice(ROOT.length)), [], 'move these out: they are sync copies, not real files');
});
