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
// Dark is the same materials, deeper and lower in brightness (evening light, warm lamps), never neon.
//
//   INTERIOR[look][mode]   the values: colours as hex, and six numbers (glass and shadow opacity, light intensities)
//   interiorCss()          CSS custom properties (--in-*) on :root for every look and mode, matching how the Shell
//                          sets the look (data-look, data-contrast="high", data-theme, the system's dark mode).
//                          One line on a page: <style is:global set:html={interiorCss()} />
//   IN_TOKENS              the property names, for a script that reads them (hero3d.mjs)

export const INTERIOR = {
  studio: {
    light: {
      slab: '#D9C7A6', roomFloor: '#DCC6A0', corr: '#ECE4D4', rug: '#D8B382', town: '#CDAF8A', wall: '#F2EBDE', core: '#E6DECF', wc: '#E2E0D8',
      glass: '#CFE3E4', frame: '#3A332B', wood: '#6E4A2E', oak: '#C9A473', chair: '#EFE5D2', chair2: '#B5623E', sofa: '#9BAA8E',
      dev: '#2A2B31', screen: '#8395AE', cream: '#F6F1E6', leg: '#4A3B2D', leaf: '#7E9A68', pot: '#A65F3D', lamp: '#F4DDA9',
      sun: '#FFF1DC', sky: '#FFF8EE', bounce: '#8E7457',
      glassA: 0.3, sunI: 1.55, skyI: 1.25, ambI: 0.3, lampI: 0.5, shadowA: 0.32,
    },
    dark: {
      slab: '#5A4B3B', roomFloor: '#6A5A46', corr: '#4E463B', rug: '#7A5836', town: '#6A5238', wall: '#7A7064', core: '#5C544A', wc: '#4B4944',
      glass: '#8FB0B8', frame: '#1C1916', wood: '#5A3A22', oak: '#8C6A45', chair: '#B8AA92', chair2: '#8C4A2E', sofa: '#5F6B56',
      dev: '#15161B', screen: '#6E82A3', cream: '#B9AE9E', leg: '#2B2119', leaf: '#4F6B45', pot: '#7A4428', lamp: '#FFCF8A',
      sun: '#FFC084', sky: '#7A8499', bounce: '#553F2E',
      glassA: 0.22, sunI: 1.45, skyI: 1.25, ambI: 0.75, lampI: 1.6, shadowA: 0.55,
    },
  },
  enterprise: {
    light: {
      slab: '#D5D9DE', roomFloor: '#E4E1DA', corr: '#ECEFF2', rug: '#C7CFDA', town: '#CBD3DE', wall: '#F1F3F5', core: '#DDE2E8', wc: '#D6DEE8',
      glass: '#D4E3EE', frame: '#3B4656', wood: '#CDBFA5', oak: '#DCD1BC', chair: '#7F8FA6', chair2: '#2E3D5C', sofa: '#95A3B6',
      dev: '#23262D', screen: '#8A9BB5', cream: '#F4F5F7', leg: '#A3ACB6', leaf: '#6E8B72', pot: '#8A939E', lamp: '#EEF2F8',
      sun: '#F5F7FC', sky: '#F4F7FC', bounce: '#7C838E',
      glassA: 0.3, sunI: 1.5, skyI: 1.3, ambI: 0.32, lampI: 0.45, shadowA: 0.3,
    },
    dark: {
      slab: '#2A3242', roomFloor: '#5B574F', corr: '#323A48', rug: '#3F4A5C', town: '#3A4556', wall: '#4F5866', core: '#3A4352', wc: '#36404F',
      glass: '#7F9AB0', frame: '#121821', wood: '#6F6553', oak: '#7C7262', chair: '#56657C', chair2: '#1F2A40', sofa: '#5A6678',
      dev: '#0E1116', screen: '#6B7FA0', cream: '#A9AFB8', leg: '#6E7680', leaf: '#4A614E', pot: '#5B636E', lamp: '#FFE2B0',
      sun: '#D9E2F5', sky: '#7A879E', bounce: '#3A414C',
      glassA: 0.22, sunI: 1.1, skyI: 1.2, ambI: 0.7, lampI: 1.4, shadowA: 0.55,
    },
  },
  contrast: {
    light: {
      slab: '#C9CED6', roomFloor: '#FFFFFF', corr: '#E9ECF0', rug: '#D5DAE1', town: '#D5DAE1', wall: '#F5F6F8', core: '#9AA3AF', wc: '#B7C0CC',
      glass: '#FFFFFF', frame: '#0B1220', wood: '#5B6472', oak: '#7A8391', chair: '#334155', chair2: '#1E293B', sofa: '#475569',
      dev: '#0B1220', screen: '#5B6B85', cream: '#E2E8F0', leg: '#0B1220', leaf: '#3F5B45', pot: '#4B5563', lamp: '#FFFFFF',
      sun: '#FFFFFF', sky: '#FFFFFF', bounce: '#BFC5CE',
      glassA: 0.15, sunI: 0.9, skyI: 2.0, ambI: 0.6, lampI: 0.2, shadowA: 0.18,
    },
    dark: {
      slab: '#1A2130', roomFloor: '#2C3546', corr: '#111827', rug: '#232C3B', town: '#232C3B', wall: '#3A4456', core: '#4B5563', wc: '#3B4658',
      glass: '#9FB3C8', frame: '#E5E9F0', wood: '#A8B3C2', oak: '#8F9AAA', chair: '#CBD5E1', chair2: '#E2E8F0', sofa: '#94A3B8',
      dev: '#05080D', screen: '#7F93B5', cream: '#64748B', leg: '#CBD5E1', leaf: '#6B8F74', pot: '#94A3B8', lamp: '#FFFFFF',
      sun: '#FFFFFF', sky: '#C8D2E0', bounce: '#1A2130',
      glassA: 0.12, sunI: 0.8, skyI: 1.4, ambI: 0.7, lampI: 0.3, shadowA: 0.35,
    },
  },
  draw: {
    light: {
      slab: '#DCE6F1', roomFloor: '#F2F6FB', corr: '#E7EEF6', rug: '#D3DFEC', town: '#D3DFEC', wall: '#F7FAFD', core: '#C5D4E5', wc: '#CBD8E8',
      glass: '#E3EEF8', frame: '#10284A', wood: '#A9BED6', oak: '#BFD0E3', chair: '#8FA9C7', chair2: '#6F8DB2', sofa: '#9FB5CE',
      dev: '#1D3354', screen: '#7C9AC0', cream: '#EEF3F9', leg: '#3A5578', leaf: '#8FB0B6', pot: '#9FB5CE', lamp: '#FFFFFF',
      sun: '#FFFFFF', sky: '#F3F7FC', bounce: '#9FB0C6',
      glassA: 0.3, sunI: 1.3, skyI: 1.4, ambI: 0.4, lampI: 0.3, shadowA: 0.22,
    },
    dark: {
      slab: '#10345C', roomFloor: '#174272', corr: '#123A66', rug: '#1B4A7E', town: '#1B4A7E', wall: '#2A5A8E', core: '#1E4E82', wc: '#1E4E82',
      glass: '#9FC3E6', frame: '#EAF3FF', wood: '#4E7AAD', oak: '#5C88BA', chair: '#7FA3CC', chair2: '#9FBEE0', sofa: '#6690BF',
      dev: '#0A1E38', screen: '#9FC3E6', cream: '#3A6699', leg: '#CFE0F5', leaf: '#5E9AA0', pot: '#6690BF', lamp: '#EAF3FF',
      sun: '#EAF3FF', sky: '#8FB3DC', bounce: '#0E3259',
      glassA: 0.15, sunI: 1.0, skyI: 1.2, ambI: 0.6, lampI: 0.6, shadowA: 0.4,
    },
  },
  classic: {
    light: {
      slab: '#E9D3A8', roomFloor: '#F2DFB8', corr: '#F6ECD6', rug: '#E5A95A', town: '#E0B070', wall: '#FFF7E8', core: '#F0E4CC', wc: '#DDE7EA',
      glass: '#CDEAF0', frame: '#2B2B2B', wood: '#8A5230', oak: '#D4A060', chair: '#E8A93A', chair2: '#D2603F', sofa: '#5E9E8C',
      dev: '#24252A', screen: '#7FA3D6', cream: '#FFF8EC', leg: '#3A2E24', leaf: '#5E9E5A', pot: '#C8663E', lamp: '#FFE3A0',
      sun: '#FFF4E0', sky: '#FFFBF2', bounce: '#9A7A52',
      glassA: 0.3, sunI: 1.6, skyI: 1.3, ambI: 0.32, lampI: 0.5, shadowA: 0.3,
    },
    dark: {
      slab: '#5E4A30', roomFloor: '#6E5A3C', corr: '#4A3E2C', rug: '#8A5E2C', town: '#7E5C34', wall: '#7E7060', core: '#5E5242', wc: '#45525A',
      glass: '#8FB8C4', frame: '#141414', wood: '#5E361E', oak: '#946C3E', chair: '#A87A2A', chair2: '#94432C', sofa: '#3F6E62',
      dev: '#121317', screen: '#6E8FC0', cream: '#BFB09A', leg: '#241C15', leaf: '#3F6E3C', pot: '#8C4629', lamp: '#FFCF8A',
      sun: '#FFC084', sky: '#7A8499', bounce: '#553F2E',
      glassA: 0.22, sunI: 1.4, skyI: 1.2, ambI: 0.72, lampI: 1.6, shadowA: 0.55,
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
