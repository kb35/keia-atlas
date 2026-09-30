// Depth and density, remembered per person (design notes; docs/rules/platform.md P11).
//
// Depth: every page has four layers, Band, Summary, Record and Raw. "Open pages like this here" (OpenHere.astro) at a
// layer's boundary sets the person's default layer for that kind of page (home, space, device, job...). The next
// page of that kind opens scrolled to it, with no scroll animation. The address wins: a link with a #layer opens
// there whatever the default. Stored in this browser as rs6-depth, one entry per person:
//   { "<person>": { "<kind>": "<layer>" } }
// Density: Comfortable (the default) or Compact (the default in the Enterprise look). Stored as rs6-density,
// one value per person: { "<person>": "compact" }. Applied as html[data-density] before first paint (Shell.astro).
//
// The pure parts are tested (tests/depth.test.mjs); the browser parts take a storage object so tests can pass one.

export const DEPTH_KEY = 'rs6-depth';
export const DENSITY_KEY = 'rs6-density';
export const LAYERS = ['band', 'summary', 'record', 'raw'];
export const LAYER_NAME = { band: 'Band', summary: 'Summary', record: 'Record', raw: 'Raw' };
export const DENSITIES = ['comfortable', 'compact'];
// The words for a kind, in the plural, for "Spaces now open here".
export const KIND_WORDS = { home: 'Home', space: 'Spaces', device: 'Devices', job: 'Jobs', service: 'Services', project: 'Projects', office: 'Offices', vendor: 'Vendors' };

const parse = (v) => { try { const o = JSON.parse(v ?? '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };

/** The stored layer for a person and a kind, or null (the band). */
export function depthFor(all, person, kind) {
  const l = all?.[person]?.[kind];
  return LAYERS.includes(l) && l !== 'band' ? l : null;
}
/** A new store with the person's layer for a kind set (or cleared with null or 'band'). */
export function withDepth(all, person, kind, layer) {
  const out = { ...(all ?? {}) }, mine = { ...(out[person] ?? {}) };
  if (!layer || layer === 'band') delete mine[kind]; else mine[kind] = layer;
  if (Object.keys(mine).length) out[person] = mine; else delete out[person];
  return out;
}
/** Where a page opens: the address's #layer wins, then the person's default, then the band. */
export function openingLayer(hash, stored) {
  const h = String(hash ?? '').replace(/^#/, '');
  if (LAYERS.includes(h)) return h;
  if (h) return null;               // any other anchor: the browser goes there itself
  return stored ?? null;
}
/** "Spaces now open here" */
export const confirmWords = (kind) => `${KIND_WORDS[kind] ?? 'Pages like this'} now open${kind === 'home' ? 's' : ''} here`;

/** A person's density; the Enterprise look defaults to Compact. */
export function densityFor(all, person, look) {
  const d = all?.[person];
  return DENSITIES.includes(d) ? d : look === 'enterprise' || look === 'contrast' ? 'compact' : 'comfortable';
}
export function withDensity(all, person, value) {
  const out = { ...(all ?? {}) };
  if (DENSITIES.includes(value)) out[person] = value; else delete out[person];
  return out;
}

// ---- Browser helpers (storage passed in, so the tests can use a plain object) ----
export function store(storage) {
  const read = (k) => { try { return parse(storage?.getItem(k)); } catch { return {}; } };
  const write = (k, v) => { try { storage?.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: kept for this page only */ } };
  return {
    depth: (person, kind) => depthFor(read(DEPTH_KEY), person, kind),
    setDepth: (person, kind, layer) => write(DEPTH_KEY, withDepth(read(DEPTH_KEY), person, kind, layer)),
    resetDepth: (person) => { const all = read(DEPTH_KEY); if (person) delete all[person]; write(DEPTH_KEY, person ? all : {}); },
    density: (person, look) => densityFor(read(DENSITY_KEY), person, look),
    setDensity: (person, value) => write(DENSITY_KEY, withDensity(read(DENSITY_KEY), person, value)),
  };
}
