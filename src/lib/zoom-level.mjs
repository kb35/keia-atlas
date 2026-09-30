// Zoom levels from an address alone (UX-V2 §2.2), for the build (src/lib/zoom.mjs) and the browser (the
// Shell's zoom script). No imports. Levels: 0 Locations, 1 region, 2 office, 3 floor (a state of the office
// page), 4 space, 5 device, 6 port (a state of the device page). `path` is inside the site: base removed.
export const ZOOM_LEVELS = ['locations', 'region', 'office', 'floor', 'space', 'device', 'port'];
const REGION_IDS = ['emea', 'amer', 'apac'];

export function zoomLevel(path, search = '', hash = '') {
  if (path === '/locations/') return 0;
  let m = /^\/locations\/([a-z]+)\/$/.exec(path);
  if (m) return REGION_IDS.includes(m[1]) ? 1 : /[?&]floor=/.test(search) ? 3 : 2;
  m = /^\/rooms\/([a-z0-9-]+)\/$/.exec(path);
  if (m && m[1] !== 'overview') return 4;
  if (path === '/device/' && /[?&](tag|host)=/.test(search)) return /^#port-/.test(hash) ? 6 : 5;
  return null;
}

// Floor and port are states of a page, so they share their page's level for moving between pages.
export const pageLevel = (level) => (level == null ? null : [0, 1, 2, 2, 3, 4, 4][level]);

// 'in' or 'out' when a move goes exactly one page level down or up the zoom; null for any other move
// (a jump of two levels, as from the palette, plays the ordinary page move instead: MOTION-V2 4.6).
export function zoomDir(from, to) {
  const a = pageLevel(from), b = pageLevel(to);
  if (a == null || b == null) return null;
  return b - a === 1 ? 'in' : a - b === 1 ? 'out' : null;
}
