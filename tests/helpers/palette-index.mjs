// A made-up search index the size of the real one (3,000 spaces and 12,000 units across five offices), so the
// palette's tests and its speed check give the same answer with or without a build.
export function bigIndex() {
  const sites = { dub: ['DUB', 'Dublin office', 'Dublin', 'emea', 'Ireland'], lon: ['LON', 'London office', 'London', 'emea', 'United Kingdom'], nyc: ['NYC', 'New York office', 'New York', 'amer', 'United States'], sin: ['SIN', 'Singapore office', 'Singapore', 'apac', 'Singapore'], mel: ['MEL', 'Melbourne office', 'Melbourne', 'apac', 'Australia'] };
  const S = Object.keys(sites), birds = ['Gannet', 'Curlew', 'Wren', 'Heron', 'Skylark', 'Whooper Swan', 'Goldcrest', 'Kestrel'];
  const rooms = {}, items = [], units = [];
  for (let i = 0; i < 3000; i++) {
    const st = S[i % S.length], id = `${st}-${i}`, fl = String(1 + (i % 20)), name = `${birds[i % birds.length]} ${i}`;
    rooms[id] = [name, `${fl}.${i % 40}`, st, fl, 'conference-room-medium'];
    items.push(['room', `rooms/${id}/`, name, `${sites[st][1]} ${fl}.${i % 40} · Medium meeting room`, '', { st, fl, p: 'conference-room-medium', m: ['poly-studio-x52'], c: ['video-bar', 'display'] }]);
    for (let u = 0; u < 4; u++) units.push([id, u ? 'display' : 'video bar', u ? 0 : 'poly-studio-x52', u ? 'display' : 'video-bar', `${id}-d${u}`, `DEMO-${i}-${u}`, `AG-${String(i * 4 + u).padStart(6, '0')}`, '2021-01-01', 0, 'in-service']);
  }
  return {
    v: 1, today: '2026-09-30', sites,
    classes: { 'video-bar': 'Video bar', display: 'Display' },
    models: { 'poly-studio-x52': ['Poly', 'Studio X52', 'video-bar', 'standard'] },
    rp: { 'conference-room-medium': 'Medium meeting room' }, roles: { tech: 'On-site technician' },
    rooms, items, units,
  };
}

// Queries a person types; the made-up index has no displays with ages and no on-site rota, so those two may be empty.
export const QUERIES = ['x52', 'EMEA spaces with X52', 'whooper swan', 'dublin', 'displays older than 7 years', 'AG-000101', 'who is on site in APAC', 'gannet'];
export const MAY_BE_EMPTY = new Set(['who is on site in APAC', 'displays older than 7 years']);
