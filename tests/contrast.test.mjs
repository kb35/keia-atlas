import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, contrast, LOOKS, STATES } from '../tools/contrast-check.mjs';

const LOOK_DIR = fileURLToPath(new URL('../src/styles/looks/', import.meta.url));

test('every look passes the health palette contrast check, light and dark', () => {
  const rows = check();
  const failed = rows.filter((r) => !r.pass);
  assert.deepEqual(failed.map((r) => `${r.look} ${r.mode} ${r.token} ${r.ratio ?? ''} ${r.note ?? ''}`), []);
});

test('all 5 looks x 2 modes x 6 states are checked', () => {
  const rows = check();
  assert.equal(Object.keys(LOOKS).length, 5);
  for (const look of Object.keys(LOOKS)) {
    for (const mode of ['light', 'dark']) {
      for (const s of STATES) {
        for (const token of [`--h-${s}`, `--h-${s}-ink`]) {
          assert.ok(rows.some((r) => r.look === look && r.mode === mode && r.token === token && r.ratio != null), `${look} ${mode} ${token}`);
        }
      }
      assert.ok(rows.some((r) => r.look === look && r.mode === mode && r.token === '--quiet'), `${look} ${mode} --quiet`);
    }
  }
});

test('contrast ratio matches WCAG reference values', () => {
  assert.equal(Math.round(contrast('#000000', '#FFFFFF') * 100) / 100, 21);
  assert.equal(Math.round(contrast('#777777', '#FFFFFF') * 100) / 100, 4.48);
});

function copyLooks() {
  const dir = mkdtempSync(join(tmpdir(), 'looks-'));
  for (const f of readdirSync(LOOK_DIR)) copyFileSync(join(LOOK_DIR, f), join(dir, f));
  return dir;
}

test('fails when the two dark blocks drift apart', () => {
  const dir = copyLooks();
  const file = join(dir, 'studio.css');
  const css = readFileSync(file, 'utf8');
  // The first dark occurrence is the prefers-color-scheme block.
  const i = css.indexOf('--h-fault: #D55E00', css.indexOf('@media (prefers-color-scheme: dark)'));
  writeFileSync(file, css.slice(0, i) + '--h-fault: #C24E00' + css.slice(i + '--h-fault: #D55E00'.length));
  const rows = check({ dir });
  rmSync(dir, { recursive: true, force: true });
  assert.ok(rows.some((r) => !r.pass && r.look === 'studio' && r.token === '--h-fault' && /drift/.test(r.note)));
});

test('fails loudly on color-mix() in a checked token', () => {
  const dir = copyLooks();
  const file = join(dir, 'classic.css');
  const css = readFileSync(file, 'utf8').replace('--h-fine-soft: #D6F3EC', '--h-fine-soft: color-mix(in srgb, var(--h-fine) 12%, white)');
  writeFileSync(file, css);
  const rows = check({ dir });
  rmSync(dir, { recursive: true, force: true });
  assert.ok(rows.some((r) => !r.pass && r.look === 'playful' && r.mode === 'light' && /color-mix/.test(r.note)));
});
