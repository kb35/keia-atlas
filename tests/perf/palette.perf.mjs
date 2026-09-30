// The palette's speed budget: the first row of results in under 50 ms from the in-memory index. A wall-clock budget
// is only fair on a quiet machine, so it runs on its own (`npm run perf`), never inside the parallel `npm test`.
// It uses the made-up index of the real one's size, so the answer does not change with the build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, search } from '../../src/lib/search-query.mjs';
import { bigIndex, QUERIES } from '../helpers/palette-index.mjs';

const BUDGET_MS = 50;
const I = load(bigIndex());

test(`the first row of results comes back in under ${BUDGET_MS} ms, from the in-memory index`, () => {
  const slow = [];
  search(I, 'warm up'); // the first call pays for compiling the search code, which a person never waits for twice
  for (const q of QUERIES) {
    let ms = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      search(I, q);
      ms = Math.min(ms, performance.now() - t0);
    }
    if (ms >= BUDGET_MS) slow.push(`${q}: ${ms.toFixed(1)} ms`);
  }
  assert.deepEqual(slow, [], `over ${BUDGET_MS} ms`);
});
