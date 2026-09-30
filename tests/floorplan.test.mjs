// One floor map (src/lib/floorplan.mjs): the plan, the thumbnail and the isometric floor read the same geometry, so
// they can never disagree. Run with:  npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { building, sitesWithFloors } from '../src/lib/floors.mjs';
import { planOf, frameOf, placeIn, hitBox, glyphShare, KIND_OF, KIND_GROUP, PAD } from '../src/lib/floorplan.mjs';
import { floorScene } from '../src/lib/isofloor.mjs';
import { tally } from '../src/lib/health.mjs';

const every = () => sitesWithFloors().flatMap((s) => building(s).floors.map((f) => ({ M: building(s), f })));

test('every floor has one plan: its outline, and every space inside its own picture box', () => {
  for (const { M, f } of every()) {
    const P = planOf(M, f.id);
    assert.ok(P, `${M.site} ${f.id}`);
    assert.equal(P.viewBox, `${-PAD} ${-PAD} ${P.W + 2 * PAD} ${P.H + 2 * PAD}`);
    for (const r of P.rooms) {
      const b = hitBox(P, r.rect);
      assert.ok(b.left >= 0 && b.top >= 0 && b.left + b.width <= 100.001 && b.top + b.height <= 100.001, `${r.id} sits inside its floor`);
      assert.ok(glyphShare(P, r) > 0, `${r.id} has room for a glyph`);
    }
  }
});

test('the isometric floor projects exactly the plan\'s spaces', () => {
  for (const { M, f } of every()) {
    const S = floorScene(M, f.id);
    assert.deepEqual(S.rooms.map((r) => r.id).sort(), planOf(M, f.id).rooms.map((r) => r.id).sort(), `${M.site} ${f.id}`);
  }
});

test('a set of thumbnails shares one scale: the largest floor fills its frame, none is enlarged', () => {
  const plans = every().map(({ M, f }) => planOf(M, f.id));
  const fr = frameOf(plans);
  for (const P of plans) {
    const at = placeIn(P, fr);
    assert.ok(at.width <= 100 && at.height <= 100);
    assert.ok(Math.abs(at.width / 100 - P.VW / fr.VW) < 1e-3);
  }
  assert.ok(plans.some((P) => placeIn(P, fr).width === 100));
});

test('kinds: one definition, desk banks grouped for the isometric views', () => {
  assert.equal(KIND_OF('workstation-assigned'), 'assigned');
  assert.equal(KIND_GROUP('workstation-assigned'), 'desks');
  assert.equal(KIND_OF('idf'), 'comms');
});

test('counts use the site\'s words', () => {
  assert.equal(tally(0, 0), 'All fine');
  assert.equal(tally(1, 0), '1 fault');
  assert.equal(tally(3, 2), '3 faults · 2 to review');
  assert.equal(tally(0, 2), '2 to review');
});

test('SmallMultiples draws no plan of its own: it uses FloorMap\'s thumbnail', () => {
  const src = readFileSync(new URL('../src/components/SmallMultiples.astro', import.meta.url), 'utf8');
  assert.match(src, /<FloorMap [^>]*detail="thumb"/);
  assert.doesNotMatch(src, /<polygon|<rect/);
});
