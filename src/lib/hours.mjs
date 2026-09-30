// An office's opening hours and change window, in words (schemas/ext/site.schema.yaml office_hours, change_window).
// Pure: the office page, the build sheet and the tests share it.

const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WORD = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const JS_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const dayWord = (d) => WORD[d];

/** "Monday to Friday", "Tuesday and Thursday", "Monday, Wednesday and Friday". */
export function daysWords(days = []) {
  const i = days.map((d) => ORDER.indexOf(d)).sort((a, b) => a - b);
  if (i.length >= 3 && i[i.length - 1] - i[0] === i.length - 1) return `${WORD[ORDER[i[0]]]} to ${WORD[ORDER[i[i.length - 1]]]}`;
  const w = i.map((k) => WORD[ORDER[k]]);
  return w.length > 1 ? `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}` : w[0] ?? '';
}

/** "07:00 to 19:00, Monday to Friday" */
export const hoursWords = (h) => (h ? `${h.open} to ${h.close}, ${daysWords(h.days)}` : null);

/** An hour after `t` ("19:00" to "20:00"), for a display's backstop off timer. */
export const plusHour = (t) => `${String((+t.slice(0, 2) + 1) % 24).padStart(2, '0')}${t.slice(2)}`;

/** Does the window run past midnight? */
const overnight = (w) => w.to <= w.from;

/** "Thursday 22:00 to 02:00" (and "the next morning" when it runs past midnight, with `long`). */
export const windowWords = (w, { long = false } = {}) => (w ? `${WORD[w.day]} ${w.from} to ${w.to}${long && overnight(w) ? ' the next morning' : ''}` : null);

/**
 * The next time the window opens from `local` ("YYYY-MM-DDTHH:MM", the office's own time): { date, days, open, text }.
 *   open  true while the window is open now
 *   days  whole days until it opens (0 today)
 *   text  "tonight, 22:00 to 02:00", "tomorrow, 22:00 to 02:00", "Thursday 1 Oct, 22:00 to 02:00", "open now, until 02:00"
 */
export function nextWindow(w, local) {
  if (!w) return null;
  const today = local.slice(0, 10), t = local.slice(11, 16);
  const add = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const dayOf = (d) => JS_DAY[new Date(`${d}T00:00:00Z`).getUTCDay()];
  // Open now: it opened today and has not closed, or opened yesterday and runs past midnight into this morning.
  if (dayOf(today) === w.day && t >= w.from && (overnight(w) || t < w.to)) return { date: today, days: 0, open: true, text: `open now, until ${w.to}` };
  if (overnight(w) && dayOf(add(today, -1)) === w.day && t < w.to) return { date: add(today, -1), days: 0, open: true, text: `open now, until ${w.to}` };
  for (let n = 0; n < 8; n++) {
    const d = add(today, n);
    if (dayOf(d) !== w.day || (n === 0 && t >= w.from)) continue;
    const x = new Date(`${d}T00:00:00Z`);
    const when = n === 0 ? 'tonight' : n === 1 ? 'tomorrow' : `${WORD[w.day]} ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`;
    return { date: d, days: n, open: false, text: `${when}, ${w.from} to ${w.to}` };
  }
  return null;
}
