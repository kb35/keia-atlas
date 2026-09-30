// Security support (device-model security_support, install units' default_password_changed): how long the
// maker keeps fixing security holes, and the warning before that ends. No Astro or browser dependency.

// Warn this many months before support ends (the EU Cyber Resilience Act research suggests 12, 6 and 3).
export const WARN_MONTHS = 12;

// The last day of support: a YYYY-MM date means the end of that month.
export function lastDay(date) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthLabel = (date) => {
  const [y, m, d] = date.split('-');
  return `${d ? `${+d} ` : ''}${MONTHS[+m - 1]} ${y}`;
};

// Where a model stands today: ended (past the date), soon (within WARN_MONTHS), or supported.
// Returns { state, tone, chip, text }; chip is null when nothing needs saying.
export function supportStatus(ss, today) {
  if (!ss?.ends?.date) return { state: 'unknown', tone: 'off', chip: null, text: 'Not recorded' };
  const end = lastDay(ss.ends.date);
  const when = monthLabel(ss.ends.date);
  const t = new Date(`${today}T00:00:00Z`), e = new Date(`${end}T00:00:00Z`);
  const months = (e.getUTCFullYear() - t.getUTCFullYear()) * 12 + (e.getUTCMonth() - t.getUTCMonth());
  if (end < today) return { state: 'ended', tone: 'bad', chip: 'Security support ended', text: `Ended ${when}` };
  if (months <= WARN_MONTHS) return { state: 'soon', tone: 'warn', chip: `Security support ends ${when}`, text: `Ends ${when}, in ${months <= 1 ? 'under two months' : `${months} months`}` };
  return { state: 'ok', tone: 'ok', chip: null, text: `Until ${when}` };
}

export const PASSWORD_LABEL = { true: 'Yes', false: 'No: still the maker\'s default', undefined: 'Not recorded' };
