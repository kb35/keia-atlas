// Tests that read the build output (dist/) run only after `npm run build`. Without it they skip, and say why.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const DIST = join(ROOT, 'dist');

// `{ skip: needsDist() }` or `{ skip: needsDist('index.html') }`: false when the file is there, else the reason.
export const needsDist = (file = '') => (existsSync(join(DIST, file)) ? false : `needs the build: run \`npm run build\` first (dist/${file} is missing)`);
