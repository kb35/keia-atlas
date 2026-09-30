// Three facts the data already held that no staff page showed (the overlooked items' "stored only" list): a room's
// accessibility, its cable test results and the meeting platforms its models are certified for. Pure, so the space
// page and the tests share the words; src/lib/roomfacts-view.mjs gathers the data.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dmy = (s) => { const d = new Date(`${String(s).slice(0, 10)}T00:00:00Z`); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const my = (s) => { const d = new Date(`${String(s).slice(0, 10)}T00:00:00Z`); return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const addYear = (s) => { const d = new Date(`${String(s).slice(0, 10)}T00:00:00Z`); d.setUTCFullYear(d.getUTCFullYear() + 1); return d.toISOString().slice(0, 10); };
const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '');

/**
 * A room's accessibility for staff (the room guide says it to the people in the room): { answer, rows, due }.
 * `a` is the room's record with the site's every_room filled in (accessOf in src/lib/guide.mjs). A hearing loop is
 * tested once a year (IEC 60118-4), so the next test is due a year after the last.
 */
export function accessForStaff(a, today) {
  if (!a) return null;
  const rows = [];
  const loop = a.hearing_loop;
  let due = null;
  if (loop) {
    const next = addYear(loop.tested);
    due = { date: next, overdue: next < today, text: next < today ? `Loop test overdue since ${my(next)}` : `Next loop test due ${my(next)}` };
    rows.push({ key: 'loop', state: loop.result === 'below-standard' ? 'fault' : due.overdue ? 'review' : 'fine', label: 'Hearing loop',
      value: `${loop.result === 'meets' ? 'Met' : 'Below'} ${loop.standard} at its test on ${dmy(loop.tested)}`, sub: due.text, note: loop.note ?? null });
  } else rows.push({ key: 'loop', state: 'off', label: 'Hearing loop', value: 'None in this room' });
  if (a.assistive_listening) rows.push({ key: 'listening', state: 'fine', label: 'Assistive listening', value: a.assistive_listening.where });
  rows.push({ key: 'captions', state: a.captions ? 'fine' : 'off', label: 'Live captions', value: a.captions ? 'On in calls, from the touch panel' : 'Not available' });
  rows.push({ key: 'step', state: a.step_free.value ? 'fine' : 'review', label: 'Step-free access', value: a.step_free.value ? 'Yes' : 'No', note: a.step_free.note ?? null });
  if (a.checked) rows.push({ key: 'checked', state: null, label: 'Last walked through', value: `${dmy(a.checked)}${a.checked_by ? `, by ${a.checked_by.replace(/^./, (c) => c.toLowerCase())}` : ''}` });
  const has = [loop && loop.result === 'meets' ? 'a hearing loop' : null, a.captions ? 'live captions' : null, a.step_free.value ? 'step-free access' : null].filter(Boolean);
  const answer = loop?.result === 'below-standard' ? 'The hearing loop was below standard at its last test'
    : due?.overdue ? `${has.length ? `${list(has).replace(/^./, (c) => c.toUpperCase())} · ` : ''}loop test overdue since ${my(due.date)}`
    : has.length ? `${list(has).replace(/^./, (c) => c.toUpperCase())}` : 'No hearing loop, captions or step-free access recorded';
  return { answer, rows, due };
}

/**
 * The cable runs to a space, as tested: { answer, rows, worst }. `runs` are data/runs entries whose far end is the
 * space; each has test { result, date, length_m, margin_db | loss_db }.
 */
export function cableTestsOf(runs) {
  if (!runs.length) return null;
  const tested = runs.filter((r) => r.test);
  const failed = tested.filter((r) => r.test.result !== 'pass');
  const margins = tested.filter((r) => r.test.margin_db != null);
  const worst = margins.length ? margins.reduce((a, b) => (a.test.margin_db <= b.test.margin_db ? a : b)) : null;
  const last = tested.map((r) => String(r.test.date)).sort().pop();
  const answer = !tested.length ? `${runs.length} ${runs.length === 1 ? 'link' : 'links'}, not tested`
    : failed.length ? `${failed.length} of ${tested.length} ${tested.length === 1 ? 'link' : 'links'} failed certification`
    : `${tested.length === runs.length ? `All ${tested.length}` : `${tested.length} of ${runs.length}`} ${runs.length === 1 ? 'link' : 'links'} passed certification${worst ? ` · closest margin ${worst.test.margin_db.toFixed(1)} dB` : ''}`;
  const rows = runs.map((r) => ({ id: r.id, outlet: r.to?.outlet ?? null, type: r.type, length: r.test?.length_m ?? r.length_m ?? null, result: r.test?.result ?? null, margin: r.test?.margin_db ?? null, loss: r.test?.loss_db ?? null, date: r.test?.date ? dmy(r.test.date) : null, thin: r.test?.margin_db != null && r.test.margin_db < 3 }));
  return { answer, rows, worst: worst ? { id: worst.id, margin: worst.test.margin_db } : null, last: last ? dmy(last) : null, failed: failed.length };
}

const PLATFORM_ORDER = ['Google Meet', 'Microsoft Teams Rooms', 'Zoom Rooms', 'Webex'];
/**
 * The meeting platforms a space's models are certified for: { answer, rows }. `models` are [{ id, name, role,
 * platforms: [{ name, support, note }] }] for the models in the space that have a model choice.
 */
export function platformsOf(models) {
  const withP = models.filter((m) => m.platforms?.length);
  if (!withP.length) return null;
  const rows = withP.map((m) => ({ ...m, yes: m.platforms.filter((p) => p.support === 'yes').map((p) => p.name), other: m.platforms.filter((p) => p.support !== 'yes') }));
  const lead = rows.find((r) => /video bar|codec|room system/i.test(r.role)) ?? rows[0];
  const names = [...lead.yes].sort((a, b) => (PLATFORM_ORDER.indexOf(a) + 99) % 99 - (PLATFORM_ORDER.indexOf(b) + 99) % 99);
  const answer = names.length ? `The ${lead.role.toLowerCase()} is certified for ${list(names)}` : `The ${lead.role.toLowerCase()} is not certified for a meeting platform`;
  return { answer, rows };
}
