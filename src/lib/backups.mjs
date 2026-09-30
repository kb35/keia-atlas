// Config backups and drift (the Config backups capability, src/lib/modules.mjs): each network device's last config
// backup, as the backup tool (Oxidized) reports it in data/config-backups/, and where its config differs from the
// network standard. Atlas keeps the date and the differences, never the config. Simulated in the demo. Pure.

export const SOURCE_LABEL = { oxidized: 'Oxidized', unimus: 'Unimus', rancid: 'RANCID', unifi: 'UniFi' };
export const STALE_HOURS = 48;   // a backup older than this is late, even when the last attempt did not fail

const hoursBetween = (a, b) => (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 36e5;

/** One row per device, what needs a look first: a failed or late backup, then drift, then the rest. */
export function backupRows(snapshots) {
  const out = [];
  for (const s of snapshots) for (const d of s.devices) {
    const age = hoursBetween(d.last_backup, s.read_at);
    const late = d.status === 'failed' || age > STALE_HOURS;
    const drift = d.drift ?? [];
    out.push({ unit: d.unit, site: s.site, source: s.source, readAt: s.read_at, last: d.last_backup, status: d.status, late, age: Math.round(age), changed: d.lines_changed, drift,
      state: late ? 'fault' : drift.length ? 'review' : 'fine' });
  }
  const rank = { fault: 0, review: 1, fine: 2 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || b.drift.length - a.drift.length || a.site.localeCompare(b.site) || a.unit.localeCompare(b.unit));
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export function backupSummary(rows) {
  return { devices: rows.length, drifted: rows.filter((r) => r.drift.length).length, findings: rows.reduce((n, r) => n + r.drift.length, 0), late: rows.filter((r) => r.late).length, changed: rows.filter((r) => r.changed > 0).length };
}
/** The answer first: devices that differ from the standard, then backups that failed or are late. */
export function backupAnswer(s) {
  const parts = [];
  if (s.drifted) parts.push(`${plural(s.drifted, 'device')} ${s.drifted === 1 ? 'differs' : 'differ'} from the standard`);
  if (s.late) parts.push(`${plural(s.late, 'backup')} failed or late`);
  return parts.length ? parts.join(' · ') : `All ${plural(s.devices, 'device')} backed up and to the standard`;
}
/** A backup time in words, from the snapshot's reading time: "02:04 today", "4 days ago". */
export function backupWhen(r) {
  if (r.age < 24) return `${r.last.slice(11, 16)} today`;
  const days = Math.round(r.age / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
