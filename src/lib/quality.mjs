// Meeting quality per space (the Meeting quality capability, src/lib/modules.mjs): a call quality score out of 100 for
// each space with a video system, as the meeting platform reports it (data/meeting-quality/), with its eight-week trend,
// the poor calls and their most common cause, and the worst rooms first. Simulated in the demo. Pure.

export const PLATFORM_LABEL = { 'google-meet': 'Google Meet', webex: 'Webex', teams: 'Microsoft Teams', zoom: 'Zoom' };
export const CAUSE_WORD = { network: 'the network', audio: 'the audio', video: 'the picture', device: 'the room system', none: '' };
export const POOR_BELOW = 70;    // a space scoring under this is poor
export const WATCH_BELOW = 80;   // under this, one to watch

/** Which way the score is going: its last seven days against the average of the eight weeks before. */
export function trendOf(score, weeks) {
  const avg = weeks.reduce((a, b) => a + b, 0) / weeks.length;
  const d = score - avg;
  return d <= -5 ? 'falling' : d >= 5 ? 'rising' : 'steady';
}
export const stateOf = (score) => (score < POOR_BELOW ? 'fault' : score < WATCH_BELOW ? 'review' : 'fine');

/** One row per space, worst first. */
export function qualityRows(snapshots) {
  return snapshots.flatMap((s) => s.spaces.map((x) => ({ ...x, site: s.site, readAt: s.read_at, trend: trendOf(x.score, x.weeks), state: stateOf(x.score) })))
    .sort((a, b) => a.score - b.score || b.poor_7d - a.poor_7d || a.space.localeCompare(b.space));
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export function qualitySummary(rows) {
  const calls = rows.reduce((n, r) => n + r.calls_7d, 0), poor = rows.reduce((n, r) => n + r.poor_7d, 0);
  const weighted = calls ? Math.round(rows.reduce((n, r) => n + r.score * r.calls_7d, 0) / calls) : null;
  return { spaces: rows.length, poorSpaces: rows.filter((r) => r.state === 'fault').length, watch: rows.filter((r) => r.state === 'review').length, falling: rows.filter((r) => r.trend === 'falling').length, calls, poor, score: weighted, worst: rows[0] ?? null };
}
/** The answer first: the spaces whose calls go badly, and the worst of them. */
export function qualityAnswer(s, name = (id) => id) {
  if (!s.spaces) return 'No calls measured';
  if (!s.poorSpaces) return `Calls go well in every space · ${s.score} out of 100 across ${plural(s.spaces, 'space')}`;
  return `${plural(s.poorSpaces, 'space')} ${s.poorSpaces === 1 ? 'has' : 'have'} poor calls · worst: ${name(s.worst.space)}, ${s.worst.score}`;
}
/** A space's quality in one line: "64 out of 100, falling · 6 of 17 calls poor, mostly the audio". */
export function qualityLine(r) {
  const why = r.poor_7d ? ` · ${r.poor_7d} of ${r.calls_7d} calls poor, mostly ${CAUSE_WORD[r.cause]}` : ` · ${plural(r.calls_7d, 'call')}, none poor`;
  return `${r.score} out of 100${r.trend !== 'steady' ? `, ${r.trend}` : ''}${why}`;
}
