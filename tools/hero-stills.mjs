// The front door's hero stills (src/components/front/HeroZoom.astro): each level's frame from the real 3D scene
// (src/lib/hero3d.mjs), light and dark, in the wide shape a laptop shows and the 4:3 shape a phone shows, saved as
// JPEGs under public/hero/, with where the fault sits in each frame written to src/lib/hero-stills.json. The stills
// are the hero's first frame everywhere and the whole hero where the 3D is not used, so run this again whenever the
// scene, the palette or the story room changes, and check the frames by eye.
//
//   npm run dev                                     (in another terminal)
//   node tools/hero-stills.mjs [http://localhost:4321/keia-atlas/welcome/]
//
// Needs Playwright with its WebKit browser, which is not one of the site's dependencies: install it once with
// `npx playwright install webkit`, or point PLAYWRIGHT_DIR at a folder whose node_modules holds it.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const url = process.argv[2] ?? 'http://localhost:4321/keia-atlas/welcome/';
const require = createRequire(process.env.PLAYWRIGHT_DIR ? `${process.env.PLAYWRIGHT_DIR}/` : import.meta.url);
const { webkit } = require('playwright');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = `${ROOT}public/hero`;
mkdirSync(OUT, { recursive: true });

// The two shapes: a 1440 x 900 laptop (its stage is about 2.4 : 1) and a phone (the stage is 4 : 3).
const SHAPES = { wide: { width: 1440, height: 900, scale: 2 }, tall: { width: 390, height: 844, scale: 3 } };
const LEVELS = [['first', null], ['floor', 1], ['space', 2]];
const HIDE = '.hz-labels, .hz-key, .hz-hover, .hz-pin { visibility: hidden !important; } .hz-stage { box-shadow: none !important; border-radius: 0 !important; }';

const browser = await webkit.launch();
const pins = { first: null, floor: {}, space: {} }, size = {};
const hash = createHash('sha1');
for (const [shape, vp] of Object.entries(SHAPES)) {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale, colorScheme: theme });
    await page.goto(`${url}?hero=3d&hero-capture`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('[data-hz]')?.dataset.hzMode === '3d', null, { timeout: 60000 });
    await page.addStyleTag({ content: HIDE });
    const stage = page.locator('[data-hz-stage]');
    await stage.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);   // the model's fade-in, and the fonts
    for (const [name, level] of LEVELS) {
      if (level != null) { await page.evaluate((l) => window.__hzHero.go(l, false), level); await page.waitForTimeout(2200); }
      const file = `${OUT}/${name}-${theme}-${shape}.jpg`;
      await stage.screenshot({ path: file, type: 'jpeg', quality: 82 });
      hash.update(readFileSync(file));
      if (theme === 'light' && level != null) {
        const at = await page.evaluate((l) => { const h = window.__hzHero, s = document.querySelector('[data-hz-stage]'); const p = l === 1 ? h.storyAt() : h.deviceAt(); return p && [p[0] / s.clientWidth, p[1] / s.clientHeight]; }, level);
        if (at) pins[name][shape] = at.map((v) => Math.round(v * 10000) / 10000);
      }
    }
    if (theme === 'light') size[shape] = await stage.evaluate((s, k) => [Math.round(s.clientWidth * k), Math.round(s.clientHeight * k)], vp.scale);
    await page.close();
    console.log(`${shape} ${theme}: done`);
  }
}
await browser.close();
for (const n of ['floor', 'space']) if (!pins[n].wide || !pins[n].tall) pins[n] = null;
const json = { version: hash.digest('hex').slice(0, 8), size, pins };
writeFileSync(`${ROOT}src/lib/hero-stills.json`, `${JSON.stringify(json, null, 2)}\n`);
console.log(JSON.stringify(json));
