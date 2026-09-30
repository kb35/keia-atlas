// Pure helpers for spares and cables (no data loading, so tests can run them without Astro).

// A count older than this is flagged "count overdue".
export const COUNT_OVERDUE_DAYS = 90;

export const isLow = (quantity, minimum) => quantity < minimum;
export const shortBy = (quantity, minimum) => Math.max(0, minimum - quantity);

// Whole days between two ISO dates (a to b).
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
export const countOverdue = (lastCounted, today) => daysBetween(lastCounted, today) > COUNT_OVERDUE_DAYS;

// The rack's number in its room: "dub-3-21-r1" is rack 1, written R1 on a label.
export const rackNumber = (rackId) => {
  const m = /-r(\d+)$/.exec(rackId ?? '');
  return m ? `R${Number(m[1])}` : 'R1';
};

const two = (n) => String(n).padStart(2, '0');

// The label for one end, in the house format SITE-ROOM-RACK-UNIT-PORT, for example DUB-3.21-R1-U15-P07.
export function portLabel({ code, room, rack, u, port }) {
  const parts = [code, room, rackNumber(rack), `U${two(u)}`];
  if (port !== undefined && port !== null && port !== '') parts.push(`P${two(port)}`);
  return parts.join('-');
}

// The label for an end that may be a port range: DUB-3.21-R1-U15-P01 to P40.
export function endLabel({ code, room, rack }, end) {
  if (!end) return '';
  if (!end.u) return end.ports ? `${end.device}, ${end.ports.includes('-') ? 'outlets' : 'outlet'} ${end.ports}` : end.device;
  const r = end.rack ?? rack;
  const [lo, hi] = String(end.ports ?? '').split('-');
  if (!lo) return portLabel({ code, room, rack: r, u: end.u }) + (end.device ? ` (${end.device.toLowerCase()})` : '');
  const first = portLabel({ code, room, rack: r, u: end.u, port: lo });
  return hi ? `${first} to P${two(hi)}` : first;
}

export const formatLength = (m) => `${Number.isInteger(m) ? m : String(m).replace(/0+$/, '')} m`;

// Words for the kinds of spare.
export const SPARE_KIND = { device: 'Devices', module: 'Modules and optics', power: 'Power supplies', accessory: 'Mounts and accessories' };
