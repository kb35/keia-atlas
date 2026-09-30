// Certificates, service accounts and secrets, by reference (the Certificates and secrets capability,
// src/lib/modules.mjs): what uses each credential in data/credentials/, and how soon it expires, with a warning at
// 60, 30 and 7 days. Never a secret: a credential here is its vault name, its owner and its dates. Pure.

export const KIND_LABEL = { certificate: 'Certificate', 'service-account': 'Service account', 'snmp-user': 'SNMP v3 user', 'api-token': 'API credential' };
export const WARN_DAYS = [60, 30, 7];
const DAY = 864e5;
const days = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** How urgent an expiry is: expired, 7, 30 or 60 (the smallest warning it is inside), or null when further off. */
export function warnLevel(d) {
  if (d < 0) return 'expired';
  for (const w of [...WARN_DAYS].sort((a, b) => a - b)) if (d <= w) return w;
  return null;
}
export const TONE = { expired: 'bad', 7: 'bad', 30: 'warn', 60: 'warn' };
export const LEVEL_WORD = { expired: 'Expired', 7: 'Within 7 days', 30: 'Within 30 days', 60: 'Within 60 days' };

/** The units a credential is used by: listed units, or units of its models (in its offices). A platform-wide one has none. */
export function usedByUnits(c, units) {
  const u = c.used_by;
  if (u.units) return units.filter((x) => u.units.includes(x.tag));
  if (u.models) return units.filter((x) => u.models.includes(x.model) && (!u.sites || u.sites.includes(x.site)));
  return [];
}

/** One row per credential, soonest expiry first. */
export function credentialRows(list, units, today) {
  return list.map((c) => {
    const d = days(today, c.expires), level = warnLevel(d), us = usedByUnits(c, units);
    return { id: c.id, kind: c.kind, kindLabel: KIND_LABEL[c.kind], name: c.name, vault: c.vault, purpose: c.purpose, issuer: c.issuer ?? null, issued: c.issued, rotated: c.rotated ?? null,
      expires: c.expires, days: d, level, tone: TONE[level] ?? null, owner: c.owner_role, platform: c.used_by.platform ?? null, models: c.used_by.models ?? [], sites: c.used_by.sites ?? null,
      units: us.map((x) => x.tag), spaces: [...new Set(us.map((x) => x.space))] };
  }).sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export function credentialSummary(rows) {
  const n = (f) => rows.filter(f).length;
  return { total: rows.length, expired: n((r) => r.level === 'expired'), in7: n((r) => r.level === 7), in30: n((r) => r.level === 30 || r.level === 7), in60: n((r) => r.level != null && r.level !== 'expired'), units: new Set(rows.flatMap((r) => r.units)).size };
}
/** The answer first: what has expired, then what expires within 30 days. */
export function credentialAnswer(s) {
  const parts = [];
  if (s.expired) parts.push(`${plural(s.expired, 'credential')} expired`);
  if (s.in30) parts.push(`${s.in30} ${s.in30 === 1 ? 'expires' : 'expire'} within 30 days`);
  else if (s.in60) parts.push(`${s.in60} within 60 days`);
  return parts.length ? parts.join(' · ') : 'Nothing expires in the next 60 days';
}
/** "expired 8 days ago", "expires in 6 days", "expires 12 Jan 2027". */
export function expiryWords(r, fmt = (d) => d) {
  if (r.days < 0) return `expired ${-r.days === 1 ? 'yesterday' : `${-r.days} days ago`}`;
  if (r.days === 0) return 'expires today';
  if (r.level) return `expires in ${r.days} days`;
  return `expires ${fmt(r.expires)}`;
}
