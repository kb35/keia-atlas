// Run by tests/demo-clock.test.mjs in a child process, with DEMO_BUILD_DATE set: prints the facts a viewer sees,
// worked out by the same modules the pages use, as JSON. The clock is read once per process, so each build date
// needs a process of its own.
import { DEMO_TODAY, CLOCK, spaces, projects, models, firmwareLines, plans } from '../../src/lib/data.mjs';
import { incidentList, when, DEMO_NOW } from '../../src/lib/incidents.mjs';
import { timeline, nextGate } from '../../src/lib/project-status.mjs';
import { warrantyWords } from '../../src/lib/cover.mjs';
import { NOW_FY, YEARS } from '../../src/lib/planning.mjs';
import { PTO_SEED, HOLIDAYS } from '../../src/lib/schedule.mjs';

const fault = incidentList.find((v) => v.inc.subject.room === 'dub-3-09' && v.inc.opened.endsWith('T07:52'));
const openedDay = fault?.inc.opened.slice(0, 10);
const prj = projects['prj-14'];
const T = timeline(prj);
const unit = spaces['chi-12-08'].positions.find((p) => p.current?.asset_tag === 'AG-000046')?.current;
// How every unit's warranty reads today, counted by the words (the story: as many in each state, whatever the date).
const words = {};
for (const s of Object.values(spaces)) for (const p of s.positions) { const u = p.current; if (u?.warranty?.ends) { const w = warrantyWords(u.warranty.ends, DEMO_TODAY); const k = w.state === 'soon' ? w.text : w.state; words[k] = (words[k] ?? 0) + 1; } }
const poly = Object.values(firmwareLines).find((f) => f.releases.some((r) => r.version?.startsWith('5.0.1')));
const x52 = models['poly-studio-x52'];

console.log(JSON.stringify({
  today: DEMO_TODAY,
  offsetDays: CLOCK.offsetDays,
  weekday: new Date(`${DEMO_TODAY}T00:00:00Z`).getUTCDay(),
  now: DEMO_NOW,
  fault: { number: fault?.inc.number, today: openedDay === DEMO_TODAY, words: when(fault?.inc.opened), state: fault?.inc.state },
  prj14: { phase: prj.phase, now: T.rows.find((r) => r.state === 'now')?.label ?? null, step: prj.history.find((h) => h.phase === 'integrate')?.steps?.find((s) => !s.ended)?.step ?? null, gateLate: nextGate(prj)?.late ?? null, tasks: prj.tasks.map((t) => t.status).join(',') },
  warranty: unit ? warrantyWords(unit.warranty.ends, DEMO_TODAY).text : null,
  warranties: words,
  firmware: poly?.releases.find((r) => r.version?.startsWith('5.0.1'))?.released ?? null,
  endOfSupport: x52?.security_support?.ends?.date ?? null,
  fy: { now: NOW_FY, first: YEARS[0].label, planFrom: Object.values(plans)[0].from },
  pto: PTO_SEED.find(([who]) => who === 'ruth'),
  christmas: HOLIDAYS.find((h) => h.country === 'IE' && h.name === 'Christmas Day')?.date ?? null,
}));
