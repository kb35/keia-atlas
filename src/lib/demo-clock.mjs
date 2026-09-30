// The rolling demo clock for this build (server side: reads the house values and the environment). The pure rules
// and the list of which dates move are in src/lib/demo-clock-core.mjs; docs/rules/data.md F12 explains them.
//
//   demo_clock: rolling    in data/house-values/ turns it on (Aigna's demo). Off, or missing, nothing moves:
//                          a real organisation's dates are never shifted.
//   demo_anchor            the day the data is written as of (the demo's "today" when nothing moves).
//   DEMO_BUILD_DATE        the build date, for tests and previews: a date (2027-01-04) or "anchor". Without it,
//                          today's date (UTC) is used, so the weekly Pages build keeps the demo current.
//
// Every data loader reads through loadYaml(), so pages and the browser see the moved dates; the YAML files never
// change. Client scripts get the same today from the page (<html data-demo-today>), never from their own clock.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { makeClock, shiftRecord } from './demo-clock-core.mjs';

const DATA = path.join(process.cwd(), 'data');

function houseClock() {
  const dir = path.join(DATA, 'house-values');
  const files = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.yaml')).sort() : [];
  for (const n of files) {
    const h = parse(readFileSync(path.join(dir, n), 'utf8'));
    if (h?.demo_anchor) return { anchor: String(h.demo_anchor), rolling: h.demo_clock === 'rolling' };
  }
  return null;
}

function buildDate(anchor) {
  const env = (process.env.DEMO_BUILD_DATE ?? '').trim();
  if (!env) return new Date().toISOString().slice(0, 10);
  if (env === 'anchor') return anchor;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(env)) throw new Error(`DEMO_BUILD_DATE must be a date like 2027-01-04, or "anchor"; it is "${env}"`);
  return env;
}

const house = houseClock();
const today = new Date().toISOString().slice(0, 10);
// With no anchor recorded there is nothing to move: the build's own date is today.
export const CLOCK = house ? makeClock({ anchor: house.anchor, build: buildDate(house.anchor), rolling: house.rolling }) : makeClock({ anchor: today, build: today });

/** The demo's today: the anchor plus the whole weeks since it ("2026-12-28"). */
export const demoToday = () => CLOCK.today;
/** A date or time from the demo world, moved to the demo's today ("2026-09-28T07:52" -> "2026-12-28T07:52"). */
export const demoShift = (v) => CLOCK.shift(v);
/** A moment on the demo's today: demoNow('12:00') is "2026-12-28T12:00". */
export const demoNow = (hm = '12:00') => `${CLOCK.today}T${hm}`;
/** What a page says about the dates, when they move. */
export const DEMO_CLOCK_NOTE = CLOCK.rolling ? 'Demo dates move with today; the story stays the same.' : '';

/** A record from data/ as the demo's today sees it: a path under data/ ("projects/prj-14.yaml") and its parsed YAML. */
export const shiftData = (rel, record) => shiftRecord(rel.split(path.sep).join('/'), record, CLOCK);

/** Read and parse one YAML file; a file under data/ has its demo dates moved. */
export function loadYaml(file) {
  const doc = parse(readFileSync(file, 'utf8'));
  const rel = path.relative(DATA, path.resolve(file));
  return rel.startsWith('..') || path.isAbsolute(rel) ? doc : shiftData(rel, doc);
}
