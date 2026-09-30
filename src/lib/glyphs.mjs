// Small line drawings of each device class (40 x 28 grid), shared by the device lists, the wiring
// diagrams and anything else that needs a recognisable device at icon size. Colour follows currentColor.
export const GLYPHS = {
  display: '<rect x="3" y="3" width="34" height="19" rx="1.5"/><path d="M16 26h8M20 22v4"/>',
  monitor: '<rect x="6" y="3" width="28" height="17" rx="1.5"/><path d="M17 26h6M20 20v6"/>',
  'video-bar': '<rect x="3" y="10" width="34" height="8" rx="4"/><circle cx="16" cy="14" r="2"/><circle cx="24" cy="14" r="2"/>',
  codec: '<rect x="5" y="8" width="30" height="12" rx="2"/><path d="M10 14h8M28 14h.01"/>',
  'touch-controller': '<path d="M9 22l3-15h16l3 15z"/><path d="M15 17h10"/>',
  camera: '<rect x="12" y="5" width="16" height="13" rx="3"/><circle cx="20" cy="11.5" r="3"/><path d="M16 24h8M20 18v6"/>',
  microphone: '<path d="M8 20h24l-3-5H11z"/><circle cx="20" cy="17.5" r="1"/>',
  amplifier: '<rect x="4" y="8" width="32" height="12" rx="1.5"/><circle cx="11" cy="14" r="2.5"/><path d="M18 12v4M22 12v4M26 12v4"/>',
  loudspeaker: '<circle cx="20" cy="14" r="10"/><circle cx="20" cy="14" r="4"/>',
  'av-extender': '<rect x="3" y="10" width="14" height="8" rx="1.5"/><rect x="23" y="10" width="14" height="8" rx="1.5"/><path d="M17 14h6" stroke-dasharray="2 2"/>',
  'av-switcher': '<rect x="4" y="8" width="32" height="12" rx="1.5"/><path d="M9 14h4M16 14h4M23 14h4M30 14h1"/>',
  adapter: '<rect x="11" y="9" width="18" height="10" rx="2"/><path d="M4 14h7M29 14h7"/>',
  'network-switch': '<rect x="3" y="9" width="34" height="10" rx="1.5"/><path d="M8 14h2M13 14h2M18 14h2M23 14h2M28 14h2"/>',
  'network-gateway': '<rect x="8" y="12" width="24" height="10" rx="3"/><path d="M14 8a9 9 0 0 1 12 0M17 5a13 13 0 0 1 6 0"/>',
  'scheduler-panel': '<rect x="12" y="4" width="16" height="20" rx="2"/><path d="M12 8h16"/><circle cx="20" cy="16" r="3"/>',
  'desk-video-device': '<rect x="8" y="3" width="24" height="17" rx="2"/><circle cx="20" cy="6" r=".8"/><path d="M14 26h12l-2-6h-8z"/>',
  dock: '<rect x="6" y="9" width="28" height="11" rx="2"/><path d="M11 14h3M17 14h3M24 14h5"/>',
  'signage-player': '<rect x="10" y="8" width="20" height="12" rx="2"/><path d="M18 11.5l4 2.5-4 2.5z"/>',
  printer: '<rect x="5" y="11" width="30" height="10" rx="2"/><path d="M11 11V4h18v7M11 17h18v7H11z"/>',
  'security-device': '<path d="M20 3l12 5v6c0 7-5 11-12 12C13 25 8 21 8 14V8z"/>',
};
GLYPHS.outlet = '<rect x="12" y="5" width="16" height="18" rx="3"/><path d="M17 11v3M23 11v3M18 18h4"/>';
GLYPHS['outlet-data'] = '<rect x="12" y="5" width="16" height="18" rx="2"/><path d="M16 19v-5h2.5v-2.5h3v2.5H24v5z"/>';
GLYPHS.laptop = '<rect x="9" y="5" width="22" height="14" rx="1.5"/><path d="M5 23h30l-3-4H8z"/>';
GLYPHS.router = '<rect x="8" y="12" width="24" height="10" rx="3"/><path d="M14 8a9 9 0 0 1 12 0"/>';
