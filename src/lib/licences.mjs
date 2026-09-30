// Licences (the Licences capability, src/lib/modules.mjs): room and platform licence pools, the seats each uses, and
// what renews soon. Pure: the pools come from data/licences/ and the units from data/installs/ (a list of
// { tag, model, site, region, space }), so tests run it on its own and the pages call it when the site is built.

export const PLATFORM_LABEL = {
  'google-meet-hardware': 'Google Meet hardware', 'teams-rooms-pro': 'Teams Rooms Pro', 'teams-rooms-basic': 'Teams Rooms Basic',
  'zoom-rooms': 'Zoom Rooms', 'webex-device': 'Webex room device', 'poly-lens': 'Poly Lens', 'logitech-sync': 'Logitech Sync',
  'bsn-cloud': 'BSN.cloud', 'samsung-vxt': 'Samsung VXT', 'lg-business-cloud': 'LG Business Cloud',
};
export const KIND_LABEL = { 'meeting-room': 'Meeting room', 'device-management': 'Device management' };
export const TERM_LABEL = { monthly: 'Monthly', annual: 'Yearly', 'three-year': 'Three years' };
export const SOON_DAYS = 30;     // "renews soon": the answer counts these
export const NOTICE_DAYS = 90;   // shown as coming up on the list

const DAY = 864e5;
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** The units holding a seat in a pool: the listed ones, or every unit of a covered model in its scope. */
export function seatHolders(pool, units) {
  if (Array.isArray(pool.assigned)) return units.filter((u) => pool.assigned.includes(u.tag));
  const inScope = (u) => (!pool.scope?.region || u.region === pool.scope.region) && (!pool.scope?.sites || pool.scope.sites.includes(u.site));
  return units.filter((u) => pool.covers.models.includes(u.model) && inScope(u));
}

/** One row per pool: seats used, spare or short, days to renewal and whether that is soon. Soonest renewal first. */
export function licenceRows(pools, units, today) {
  return pools.map((p) => {
    const holders = seatHolders(p, units);
    const used = holders.length, days = daysBetween(today, p.renews);
    const perSeat = p.seats ? Math.round((p.cost.amount / p.seats) * 100) / 100 : null;
    return {
      id: p.id, name: p.name, platform: p.platform, platformLabel: PLATFORM_LABEL[p.platform] ?? p.platform, kind: p.kind, kindLabel: KIND_LABEL[p.kind],
      vendor: p.vendor, seats: p.seats, used, spare: Math.max(0, p.seats - used), short: Math.max(0, used - p.seats),
      renews: p.renews, days, soon: days >= 0 && days <= SOON_DAYS, lapsed: days < 0, notice: days >= 0 && days <= NOTICE_DAYS,
      autoRenew: Boolean(p.auto_renew), term: p.term, termLabel: TERM_LABEL[p.term], cost: p.cost, perSeat, owner: p.owner_role, notes: p.notes ?? null,
      units: holders.map((u) => u.tag), spaces: [...new Set(holders.map((u) => u.space))], models: p.covers.models,
      scope: p.scope ?? null, assigned: Array.isArray(p.assigned),
    };
  }).sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

/** The figures the fleet list leads with. */
export function licenceSummary(rows) {
  const renewing = rows.filter((r) => r.soon || r.lapsed);
  return {
    pools: rows.length, renewing: renewing.length, short: rows.filter((r) => r.short > 0).length, seatsShort: rows.reduce((n, r) => n + r.short, 0),
    unused: rows.reduce((n, r) => n + r.spare, 0), cost: rows.reduce((n, r) => n + (r.cost.per === 'month' ? r.cost.amount * 12 : r.cost.amount), 0),
    currency: rows[0]?.cost.currency ?? 'EUR', nextRenewal: renewing[0] ?? rows.find((r) => r.days >= 0) ?? null,
  };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The answer first: what renews within 30 days, then any pool short of seats. */
export function licenceAnswer(s) {
  const parts = [];
  if (s.renewing) parts.push(`${plural(s.renewing, 'licence')} ${s.renewing === 1 ? 'renews' : 'renew'} in ${SOON_DAYS} days`);
  if (s.seatsShort) parts.push(`${plural(s.seatsShort, 'seat')} short`);
  if (!parts.length) return `Every licence has seats to spare · none renews in ${SOON_DAYS} days`;
  return parts.join(' · ');
}

/** Days to a date, in words: "in 21 days", "tomorrow", "today", "3 days ago". */
export function inDays(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** The pools a space's units hold seats in, and the pool each unit holds. */
export const rowsForSpace = (rows, spaceId) => rows.filter((r) => r.spaces.includes(spaceId));
export const rowsForUnit = (rows, tag) => rows.filter((r) => r.units.includes(tag));

/** Money, written the way the Costs page writes it. */
export const money = (n, currency = 'EUR') => `${{ EUR: '€', USD: '$', GBP: '£' }[currency] ?? ''}${Math.round(n).toLocaleString('en-IE')}`;
