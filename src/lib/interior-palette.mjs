// The interior palette: what the offices are made of, per look, light and dark (Keith, 30 Sept 2026). One table,
// shared by every picture of a room: the front door's 3D hero (src/lib/hero3d.mjs), its drawn layers and the room
// shot (HeroZoom.astro, RoomShot.astro), and any page that draws a room or an isometric floor. It is the look of the
// space, never the UI: no health colour lives here, and nothing here ever tints a status ring (rings read the
// look's own --h-* tokens).
//
//   Studio       warm mid-century: walnut, oak, terracotta, cream upholstery, sage, late-morning light
//   Enterprise   cooler and crisper: pale ash, grey-blue fabric, brushed steel, navy accents
//   High contrast  flat and clearly separated: few tones, strong frames, light shadows
//   Drawing set  drafting film and blueprint: pale blue-greys, ink frames
//   Playful      brighter: mustard, coral, teal, honey oak
// The building and its floors are an architect's model (Keith, 30 Sept): slab, corridor, core and partitions in one
// or two quiet tones (bone clay with a hint of pale oak on the room floors; in dark, charcoal and slate), glass drawn
// as a thinner, lighter partition. The furniture tones are used only inside the room the story visits. Never dark
// brown. Dark is the evening: cool-neutral surfaces under a cool sky, the lamps the only warm accent, never neon.
//
//   INTERIOR[look][mode]   the values: colours as hex (wall is the paint, feature the one accent wall a meeting room
//                          has, cap the wall tops), and seven numbers (glass and ground-shadow opacity, how dark the
//                          sun's shadows are, light intensities)
//   interiorCss()          CSS custom properties (--in-*) on :root for every look and mode, matching how the Shell
//                          sets the look (data-look, data-contrast="high", data-theme, the system's dark mode).
//                          One line on a page: <style is:global set:html={interiorCss()} />
//   IN_TOKENS              the property names, for a script that reads them (hero3d.mjs)

export const INTERIOR = {
  studio: {
    light: {
      slab: '#E6E1D8', roomFloor: '#ECE3D2', corr: '#F0EDE7', rug: '#DDD6C9', town: '#E0D8C8', wall: '#F7F4EF', core: '#E2DDD4', wc: '#E2DDD4',
      glass: '#EDF0F0', frame: '#3A332B', wood: '#A98C68', oak: '#D6C29F', chair: '#EEE9DF', chair2: '#B98468', sofa: '#A8B3A1',
      dev: '#2A2B31', screen: '#8395AE', cream: '#F6F1E6', leg: '#6B6459', leaf: '#7E9A68', pot: '#B3876B', lamp: '#F4DDA9',
      sun: '#FFF7EC', sky: '#FBFAF7', bounce: '#A8A397',
      feature: '#C9CFBF', cap: '#D6CFC3',
      glassA: 0.3, sunI: 1.55, skyI: 1.25, ambI: 0.3, lampI: 0.5, shadowA: 0.32, shadowI: 0.5,
    },
    dark: {
      slab: '#32363C', roomFloor: '#454A51', corr: '#3B4046', rug: '#505256', town: '#525357', wall: '#5E656E', core: '#50565F', wc: '#50565F',
      glass: '#6C7883', frame: '#191B1E', wood: '#6A625A', oak: '#7C746A', chair: '#AEACA7', chair2: '#8C6B5B', sofa: '#5D6862',
      dev: '#15161B', screen: '#6E82A3', cream: '#9D9B96', leg: '#25272B', leaf: '#4F6B55', pot: '#6E5B51', lamp: '#FFCF8A',
      sun: '#E4E8F0', sky: '#7C8596', bounce: '#2E3238',
      feature: '#5B6660', cap: '#747C86',
      glassA: 0.22, sunI: 1.45, skyI: 1.25, ambI: 0.75, lampI: 1.6, shadowA: 0.55, shadowI: 0.6,
    },
  },
  enterprise: {
    light: {
      slab: '#E2E5E9', roomFloor: '#EAE8E3', corr: '#F0F2F4', rug: '#C7CFDA', town: '#CBD3DE', wall: '#F6F7F9', core: '#DDE2E8', wc: '#DDE2E8',
      glass: '#E8EFF4', frame: '#3B4656', wood: '#CDBFA5', oak: '#DCD1BC', chair: '#7F8FA6', chair2: '#2E3D5C', sofa: '#95A3B6',
      dev: '#23262D', screen: '#8A9BB5', cream: '#F4F5F7', leg: '#A3ACB6', leaf: '#6E8B72', pot: '#8A939E', lamp: '#EEF2F8',
      sun: '#F5F7FC', sky: '#F4F7FC', bounce: '#7C838E',
      feature: '#B9C3D1', cap: '#C8CFD7',
      glassA: 0.3, sunI: 1.5, skyI: 1.3, ambI: 0.32, lampI: 0.45, shadowA: 0.3, shadowI: 0.5,
    },
    dark: {
      slab: '#30353C', roomFloor: '#424851', corr: '#394048', rug: '#3F4A5C', town: '#3A4556', wall: '#59616C', core: '#4B525C', wc: '#4B525C',
      glass: '#687888', frame: '#121821', wood: '#6B665F', oak: '#77726A', chair: '#56657C', chair2: '#1F2A40', sofa: '#5A6678',
      dev: '#0E1116', screen: '#6B7FA0', cream: '#A9AFB8', leg: '#6E7680', leaf: '#4A614E', pot: '#5B636E', lamp: '#FFE2B0',
      sun: '#D9E2F5', sky: '#7A879E', bounce: '#3A414C',
      feature: '#46505F', cap: '#6F7884',
      glassA: 0.22, sunI: 1.1, skyI: 1.2, ambI: 0.7, lampI: 1.4, shadowA: 0.55, shadowI: 0.6,
    },
  },
  contrast: {
    light: {
      slab: '#C9CED6', roomFloor: '#FFFFFF', corr: '#E9ECF0', rug: '#D5DAE1', town: '#D5DAE1', wall: '#F5F6F8', core: '#9AA3AF', wc: '#B7C0CC',
      glass: '#E4E9EF', frame: '#0B1220', wood: '#5B6472', oak: '#7A8391', chair: '#334155', chair2: '#1E293B', sofa: '#475569',
      dev: '#0B1220', screen: '#5B6B85', cream: '#E2E8F0', leg: '#0B1220', leaf: '#3F5B45', pot: '#4B5563', lamp: '#FFFFFF',
      sun: '#FFFFFF', sky: '#FFFFFF', bounce: '#BFC5CE',
      feature: '#DDE1E7', cap: '#8A93A0',
      glassA: 0.15, sunI: 0.9, skyI: 2.0, ambI: 0.6, lampI: 0.2, shadowA: 0.18, shadowI: 0.35,
    },
    dark: {
      slab: '#1A2130', roomFloor: '#2C3546', corr: '#111827', rug: '#232C3B', town: '#232C3B', wall: '#3A4456', core: '#4B5563', wc: '#3B4658',
      glass: '#6B7A8E', frame: '#E5E9F0', wood: '#A8B3C2', oak: '#8F9AAA', chair: '#CBD5E1', chair2: '#E2E8F0', sofa: '#94A3B8',
      dev: '#05080D', screen: '#7F93B5', cream: '#64748B', leg: '#CBD5E1', leaf: '#6B8F74', pot: '#94A3B8', lamp: '#FFFFFF',
      sun: '#FFFFFF', sky: '#C8D2E0', bounce: '#1A2130',
      feature: '#2F394A', cap: '#5E6A7C',
      glassA: 0.12, sunI: 0.8, skyI: 1.4, ambI: 0.7, lampI: 0.3, shadowA: 0.35, shadowI: 0.5,
    },
  },
  draw: {
    light: {
      slab: '#DCE6F1', roomFloor: '#F2F6FB', corr: '#E7EEF6', rug: '#D3DFEC', town: '#D3DFEC', wall: '#F7FAFD', core: '#C5D4E5', wc: '#CBD8E8',
      glass: '#E6EFF8', frame: '#10284A', wood: '#A9BED6', oak: '#BFD0E3', chair: '#8FA9C7', chair2: '#6F8DB2', sofa: '#9FB5CE',
      dev: '#1D3354', screen: '#7C9AC0', cream: '#EEF3F9', leg: '#3A5578', leaf: '#8FB0B6', pot: '#9FB5CE', lamp: '#FFFFFF',
      sun: '#FFFFFF', sky: '#F3F7FC', bounce: '#9FB0C6',
      feature: '#D5E1EE', cap: '#9FB4CC',
      glassA: 0.3, sunI: 1.3, skyI: 1.4, ambI: 0.4, lampI: 0.3, shadowA: 0.22, shadowI: 0.4,
    },
    dark: {
      slab: '#10345C', roomFloor: '#174272', corr: '#123A66', rug: '#1B4A7E', town: '#1B4A7E', wall: '#2A5A8E', core: '#1E4E82', wc: '#1E4E82',
      glass: '#3A6A9E', frame: '#EAF3FF', wood: '#4E7AAD', oak: '#5C88BA', chair: '#7FA3CC', chair2: '#9FBEE0', sofa: '#6690BF',
      dev: '#0A1E38', screen: '#9FC3E6', cream: '#3A6699', leg: '#CFE0F5', leaf: '#5E9AA0', pot: '#6690BF', lamp: '#EAF3FF',
      sun: '#EAF3FF', sky: '#8FB3DC', bounce: '#0E3259',
      feature: '#22558C', cap: '#6F95C2',
      glassA: 0.15, sunI: 1.0, skyI: 1.2, ambI: 0.6, lampI: 0.6, shadowA: 0.4, shadowI: 0.5,
    },
  },
  classic: {
    light: {
      slab: '#E8E3D9', roomFloor: '#EFE6D4', corr: '#F3F0EA', rug: '#EAD9B0', town: '#E6D7B8', wall: '#FAF8F3', core: '#E6E0D5', wc: '#E6E0D5',
      glass: '#E6F1F0', frame: '#2B2B2B', wood: '#B98D5E', oak: '#D9B884', chair: '#E8A93A', chair2: '#D2603F', sofa: '#5E9E8C',
      dev: '#24252A', screen: '#7FA3D6', cream: '#FFF8EC', leg: '#3A2E24', leaf: '#5E9E5A', pot: '#C8663E', lamp: '#FFE3A0',
      sun: '#FFF7EC', sky: '#FBFAF7', bounce: '#A8A397',
      feature: '#B9D6CC', cap: '#DACFBC',
      glassA: 0.3, sunI: 1.6, skyI: 1.3, ambI: 0.32, lampI: 0.5, shadowA: 0.3, shadowI: 0.5,
    },
    dark: {
      slab: '#32363C', roomFloor: '#454A51', corr: '#3B4046', rug: '#56575B', town: '#58595D', wall: '#5E656E', core: '#50565F', wc: '#50565F',
      glass: '#6C7883', frame: '#141414', wood: '#6C6258', oak: '#7E7468', chair: '#A87A2A', chair2: '#94432C', sofa: '#3F6E62',
      dev: '#121317', screen: '#6E8FC0', cream: '#BFB09A', leg: '#25272B', leaf: '#3F6E3C', pot: '#7A5140', lamp: '#FFCF8A',
      sun: '#E4E8F0', sky: '#7A8499', bounce: '#2E3238',
      feature: '#4A6E64', cap: '#747C86',
      glassA: 0.22, sunI: 1.4, skyI: 1.2, ambI: 0.72, lampI: 1.6, shadowA: 0.55, shadowI: 0.6,
    },
  },
};

// roomFloor -> --in-room-floor, chair2 -> --in-chair-2, glassA -> --in-glass-a
export const inName = (k) => `--in-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`).replace(/(\d)/g, '-$1')}`;
export const IN_TOKENS = Object.keys(INTERIOR.studio.light).map(inName);

const decl = (p) => Object.entries(p).map(([k, v]) => `${inName(k)}:${v}`).join(';');

// Studio is the default (no data-look). Order matters where specificity ties: high contrast (on Enterprise) is last.
export function interiorCss() {
  const rules = [`:root{${decl(INTERIOR.studio.light)}}`, `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${decl(INTERIOR.studio.dark)}}}`, `:root[data-theme="dark"]{${decl(INTERIOR.studio.dark)}}`];
  const block = (sel, p) => {
    rules.push(`${sel}{${decl(p.light)}}`);
    rules.push(`@media (prefers-color-scheme: dark){${sel}:not([data-theme="light"]){${decl(p.dark)}}}`);
    rules.push(`${sel}[data-theme="dark"]{${decl(p.dark)}}`);
  };
  for (const look of ['studio', 'enterprise', 'draw', 'classic']) block(`:root[data-look="${look}"]`, INTERIOR[look]);
  block(':root[data-contrast="high"]', INTERIOR.contrast);
  return rules.join('\n');
}
