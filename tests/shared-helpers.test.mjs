// Copies that drifted from their shared twin and became bugs (code review, 30 Sept 2026). Each page now uses the
// shared helper; these tests keep it that way and pin the behaviour the copy had lost.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupOf, NET_CLASSES } from '../src/lib/planningcore.mjs';
import { tally, counted } from '../src/lib/services.mjs';
import { attentionRows, reason } from '../src/lib/services-client.mjs';

const src = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

test('the room guide reads the demo "today", never the build date', () => {
  const s = src('src/pages/guide/_room.mjs');
  assert.doesNotMatch(s, /new Date\(\s*\)/, 'no wall-clock date in build code');
  assert.match(s, /DEMO_TODAY/);
});

test('planning sorts every network class, building sensors included, with the shared groupOf', () => {
  for (const cls of NET_CLASSES) assert.equal(groupOf(cls), 'network', cls);
  assert.equal(groupOf('building-sensor'), 'network');
  assert.equal(groupOf('video-bar'), 'av');
  const s = src('src/pages/work/planning/index.astro');
  assert.doesNotMatch(s, /\['network-switch',\s*'network-gateway'/, 'no inline copy of the network classes');
  assert.match(s, /import \{[^}]*\bgroupOf\b[^}]*\} from '..\/..\/..\/lib\/planningcore.mjs';\n\s*import \{ flat/, 'the page script imports groupOf');
});

// A unit marked `x` is kept in a model only so indexes line up; it never counts.
const model = {
  incs: [],
  units: [
    { id: 'a', n: 'A', alerts: [] },
    { id: 'b', n: 'B', alerts: [], x: 1 },
    { id: 'c', n: 'C', alerts: ['Fan'], fw: '1|2' },
  ],
};
const snap = { t: 0, units: [{ st: 'offline', down: true, al: -1, inc: -1, since: null }, { st: 'offline', down: true, al: -1, inc: -1, since: null }, { st: 'alert', down: false, al: 0, inc: -1, since: null }] };

test('Assets and Services count the same units: the shared tally and attention list skip what does not count', () => {
  assert.equal(counted(model.units[1]), false);
  assert.deepEqual(tally(model, snap), { online: 0, alert: 1, offline: 1, all: 2, fw: 1 });
  assert.deepEqual(attentionRows(model, snap, 0).map((r) => r.u.id), ['a', 'c']);
  assert.equal(reason(model, model.units[2], snap.units[2]), 'Fan');
});

test('the Assets overview uses the Services helpers instead of its own copy', () => {
  const s = src('src/pages/assets/index.astro');
  assert.match(s, /from '..\/..\/lib\/services-client.mjs'/);
  assert.match(s, /\battentionRows\(/);
  assert.match(s, /\btally\(model, snap\)/);
  assert.doesNotMatch(s, /function reason\(/, 'no second reason()');
  assert.match(s, /!counted\(u\)/, 'the feed and the health rows skip what does not count');
});
