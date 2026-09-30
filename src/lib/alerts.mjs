// Alert rules and routing (the Alert rules capability, src/lib/modules.mjs): each rule in data/alert-rules/ said as one
// plain sentence, who gets it at each office, and its last 30 days of alerts. The monitoring tool (Datadog,
// Alertmanager, LibreNMS) raises the alerts; Atlas routes them to a role and silences them while its own planned work
// runs (a room check round before 09:00, a standing rule's run window). The alerts are simulated: there is no
// monitoring feed in the demo. Pure: names, targets and windows come from the caller.

export const SOURCE_LABEL = { datadog: 'Datadog', alertmanager: 'Alertmanager', librenms: 'LibreNMS' };
export const ROLE_WORD = { tech: 'on-site technician', network: 'network engineer', desk: 'service desk', 'sm-av': 'AV service manager', 'sm-infra': 'infrastructure service manager' };
export const STATUS_WORD = { sent: 'Sent', silenced: 'Silenced', held: 'Waited for the morning' };
export const WINDOW_DAYS = 30;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const article = (w) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);
const joinOr = (list) => (list.length <= 1 ? list[0] ?? '' : `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`);

/** What the rule watches, as the subject of its sentence: "a video bar in the Dublin office", "a comms room". */
export function subjectOf(rule, { className = (c) => c, siteName = (s) => s } = {}) {
  const a = rule.applies_to;
  let what = a.classes ? article(joinOr(a.classes.map((c) => className(c).toLowerCase()))) : 'a comms room';
  if (a.classes && a.space_types) what += ' in a comms room';
  if (a.sites) what += ` in the ${joinOr(a.sites.map(siteName))}`;
  return what;
}
const VERB = {
  offline: () => 'is offline',
  'packet-loss': (c) => `loses more than ${c.above}${c.unit ?? ''} of its packets`,
  'port-down': () => 'loses an uplink',
  'on-battery': () => 'runs on its UPS battery',
  temperature: (c) => `is warmer than ${c.above} ${c.unit ?? ''}`.trim(),
};
/** Who gets it, in words: "the Dublin on-site technician", "that office's on-site technician", "the service desk". */
export function routeWords(rule, { siteName = (s) => s } = {}) {
  const r = rule.route, word = ROLE_WORD[r.role] ?? r.role;
  if (r.role === 'desk') return 'the service desk';
  if (r.at === 'office') return rule.applies_to.sites?.length === 1 ? `the ${siteName(rule.applies_to.sites[0]).replace(/ office$/, '')} ${word}` : `that office's ${word}`;
  if (r.at === 'region') return `the region's ${word}`;
  return `the ${word}`;
}
/** The rule as one sentence: "When a video bar in the Dublin office is offline for 10 minutes during office hours,
    tell the Dublin on-site technician." */
export function sentence(rule, ctx = {}) {
  const c = rule.condition;
  const time = c.for_min ? ` for ${plural(c.for_min, 'minute')}` : '';
  const when = rule.when === 'office-hours' ? ' during office hours' : ' at any hour';
  return `When ${subjectOf(rule, ctx)} ${VERB[c.signal](c)}${time}${when}, tell ${routeWords(rule, ctx)}.`;
}
/** Quiet hours and silences, in words. */
export function quietWords(rule) {
  if (rule.priority === 1) return 'A priority 1 alert never waits: it wakes someone at any hour.';
  return rule.quiet_hours ? `Between ${rule.quiet_hours.from} and ${rule.quiet_hours.to} it waits for the morning.` : 'No quiet hours: it is sent when it happens.';
}
export function silenceWords(rule) {
  const s = rule.silenced_by ?? {}, out = [];
  if (s.room_checks) out.push('a room check round in its office, until 09:00 on the day');
  if (s.standing_rules) out.push("a standing rule's run window on the unit it is working on");
  return out;
}

// ---- Simulated alerts --------------------------------------------------------------------------------------------------
const seedOf = (s) => [...String(s)].reduce((n, c) => (Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
const rnd = (seed) => { let t = seed >>> 0; return () => { t = (t + 0x6d2b79f5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const isWeekend = (d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const inQuiet = (t, q) => { if (!q) return false; return q.from > q.to ? t >= q.from || t < q.to : t >= q.from && t < q.to; };

/** The rule's last 30 days of alerts, made up from a seed (the same every build).
    targets: [{ id, label, site }] what it watches; rounds: [{ date, site, spaces, name }] room check rounds;
    night: { name, from, to } a standing rule's run window; who(site) the person it goes to at that office. */
export function simulatedAlerts(rule, { targets = [], rounds = [], night = null, who = () => null, today }) {
  if (!targets.length) return [];
  const r = rnd(seedOf(`alerts:${rule.id}`));
  const out = [];
  const n = 2 + Math.floor(r() * (rule.priority === 1 ? 2 : 6));
  for (let i = 0; i < n; i++) {
    let day = addDays(today, -1 - Math.floor(r() * (WINDOW_DAYS - 1)));
    if (day >= today) day = addDays(today, -1);
    while (rule.when === 'office-hours' && isWeekend(day)) day = addDays(day, -1);   // office hours are weekdays
    const mins = rule.when === 'office-hours' ? 8 * 60 + Math.floor(r() * 10 * 60) : Math.floor(r() * 24 * 60);
    const tg = targets[Math.floor(r() * targets.length)];
    out.push({ at: `${day}T${hm(mins)}`, target: tg, lasted: rule.condition.for_min + Math.floor(r() * 40) });
  }
  // Atlas's own planned work: one alert raised while a room check round ran, one inside a standing rule's run window.
  if (rule.silenced_by?.room_checks) {
    const round = [...rounds].reverse().find((x) => x.date < today && targets.some((t) => t.site === x.site && (!t.space || x.spaces.includes(t.space))));
    if (round) { const tg = targets.find((t) => t.site === round.site && (!t.space || round.spaces.includes(t.space))); out.push({ at: `${round.date}T08:2${Math.floor(r() * 9)}`, target: tg, lasted: 6, round }); }
  }
  if (rule.silenced_by?.standing_rules && night) {
    const tg = targets[Math.floor(r() * targets.length)];
    out.push({ at: `${addDays(today, -2 - Math.floor(r() * 5))}T23:1${Math.floor(r() * 9)}`, target: tg, lasted: 4, night });
  }
  return out.map((e) => {
    const t = e.at.slice(11, 16);
    let status = 'sent', why = null;
    if (e.round) { status = 'silenced'; why = `the ${e.round.name.toLowerCase()} was running`; }
    else if (e.night) { status = 'silenced'; why = `the ${e.night.name} was running (${e.night.from} to ${e.night.to})`; }
    else if (rule.priority > 1 && inQuiet(t, rule.quiet_hours)) { status = 'held'; why = `quiet hours until ${rule.quiet_hours.to}`; }
    return { ...e, round: undefined, night: undefined, status, why, to: status === 'silenced' ? null : who(e.target.site) };
  }).sort((a, b) => b.at.localeCompare(a.at));
}

/** A rule's alerts in figures, and the answer its page leads with. */
export function alertCounts(list) {
  return { total: list.length, sent: list.filter((e) => e.status === 'sent').length, silenced: list.filter((e) => e.status === 'silenced').length, held: list.filter((e) => e.status === 'held').length, last: list[0] ?? null };
}
export function ruleAnswer(c) {
  if (!c.total) return `No alerts in ${WINDOW_DAYS} days`;
  const parts = [`Sent ${c.sent === 1 ? 'once' : `${c.sent} times`} in ${WINDOW_DAYS} days`];
  if (c.silenced) parts.push(`${c.silenced} silenced by planned work`);
  if (c.held) parts.push(`${c.held} waited for the morning`);
  return parts.join(' · ');
}
export function alertsAnswer(rules, counts) {
  const t = counts.reduce((a, c) => ({ sent: a.sent + c.sent, silenced: a.silenced + c.silenced }), { sent: 0, silenced: 0 });
  return `${plural(t.sent, 'alert')} sent in ${WINDOW_DAYS} days by ${plural(rules.length, 'rule')} · ${t.silenced} silenced by planned work`;
}
