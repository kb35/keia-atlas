// Turns the built site (dist/, served under /keia-atlas/) into a folder of plain files with
// relative links (preview/), so the same folder can be:
//   - published on a static host that serves files by relative path, and
//   - opened straight from Finder (preview/index.html) with no server.
// Astro's asset folder "_astro" becomes "assets", since some hosts hide names starting with "_".
// Module scripts are inlined into each page, since some page frames limit where scripts load from.
// Run with: npm run preview:files
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';

const BASE = '/keia-atlas/';
const SRC = 'dist', OUT = 'preview';

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// "/keia-atlas/profiles/video-bar/#x" seen from "profiles/index.html" -> "video-bar/index.html#x"
function toRelative(target, fromFile) {
  const [pathq, hash = ''] = target.slice(BASE.length).split('#');
  const [path, query = ''] = pathq.split('?');
  let file = path.replace(/^_astro\//, 'assets/');
  if (file === '' || file.endsWith('/')) file += 'index.html';
  const rel = posix.relative(posix.dirname(fromFile), file) || posix.basename(file);
  return rel + (query ? `?${query}` : '') + (hash ? `#${hash}` : '');
}

// Script files by their name in dist/_astro, so pages can carry them inline.
const scripts = new Map(readdirSync(join(SRC, '_astro')).filter((n) => n.endsWith('.js')).map((n) => [n, readFileSync(join(SRC, '_astro', n), 'utf8')]));
const inlineScripts = (html) => html.replace(/<script type="module" src="\/keia-atlas\/_astro\/([^"]+\.js)"><\/script>/g, (m, name) =>
  scripts.has(name) ? `<script type="module">${scripts.get(name).replace(/<\/script/gi, '<\\/script')}</script>` : m);

rmSync(OUT, { recursive: true, force: true });
let pages = 0, files = 0;
// The text is English with Irish place and bird names: Latin and Latin Extended cover it. Other
// scripts' font files are left out (the host allows 511 files per version).
const OTHER_SCRIPTS = /(cyrillic|greek|vietnamese)/;
for (const abs of walk(SRC)) {
  const rel = relative(SRC, abs).split('\\').join('/');
  if (rel.endsWith('.woff2') && OTHER_SCRIPTS.test(rel)) continue;
  // Left out of the preview to stay under the host's 511 files: the old room-types redirects and the
  // one-page-per-task views (each project page still lists its tasks).
  if (/^(room-types\/|projects\/[^/]+\/tasks\/)/.test(rel)) continue;
  const outRel = rel.replace(/^_astro\//, 'assets/');
  const dest = join(OUT, outRel);
  mkdirSync(dirname(dest), { recursive: true });
  files++;
  if (rel.endsWith('.html')) {
    const html = inlineScripts(readFileSync(abs, 'utf8')).replace(/(["'])(\/keia-atlas\/[^"'\s]*)\1/g, (_, q, url) => q + toRelative(url, outRel) + q);
    writeFileSync(dest, html);
    pages++;
  } else if (rel.endsWith('.css')) {
    // CSS sits in assets/ next to the fonts it loads.
    writeFileSync(dest, readFileSync(abs, 'utf8').replace(/@font-face\{[^}]*?(cyrillic|greek|vietnamese)[^}]*\}/g, '').replace(/url\(\/keia-atlas\/_astro\//g, 'url('));
  } else {
    copyFileSync(abs, dest);
  }
}
const left = walk(OUT).filter((f) => /\.(html|css)$/.test(f) && /["'(]\/keia-atlas\//.test(readFileSync(f, 'utf8')));
if (left.length) { console.error(`Absolute /keia-atlas/ links left in ${left.length} files, e.g. ${left[0]}`); process.exit(1); }
console.log(`preview/: ${files} files, ${pages} pages, all links relative. Open preview/index.html, or publish the folder.`);
