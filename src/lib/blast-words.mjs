// The explorer's words, with no data and no Node dependency, so the page's script can load them too
// (src/lib/blast-render.mjs). src/lib/blast.mjs re-exports them.
// -------------------------------------------------------------------------------------------------------
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const joinWords = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
/** The count line, first and still (design notes): "Would affect 6 spaces, 2 meetings in the next 24 hours (14 people),
    1 service". With nothing cut off it says what carries the load instead. */
export function countLine({ spaces = 0, meetings = 0, people = 0, services = 0, desks = 0, aps = 0 }, { when = 'in the next 24 hours', carried = null } = {}) {
  if (!spaces && !aps) return carried ? `Would affect nothing: ${carried}` : 'Would affect nothing: every space keeps its way to the internet';
  const parts = [];
  if (spaces) parts.push(plural(spaces, 'space'));
  if (aps && !spaces) parts.push(plural(aps, 'access point'));
  parts.push(meetings ? `${plural(meetings, 'meeting')} ${when} (${plural(people, 'person', 'people')})` : `no meetings ${when}`);
  if (services) parts.push(plural(services, 'service'));
  return `Would affect ${joinWords(parts)}`;
}

