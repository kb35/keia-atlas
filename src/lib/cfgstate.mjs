// Configuration state (demo). Two things a configuration page shows about one example unit:
//  1. Configuration file state: where that device's record lives in each of Aigna's systems and
//     whether it matches what Keia Atlas expects. The systems are made up (Assetbox, InfoDNS, Fleet Lens,
//     DarkSign, AppState, Monitor Dog), and so are the values found in them.
//  2. Which settings a check would find wrong on that unit.
// Which systems apply follows the device profile's platforms, so a passive speaker only has an asset
// record and a video bar has five. At most one made-up problem per configuration, so the page shows
// what drift looks like without everything being red.
import { spaces, sites, classes, models, SITE_ORDER, modelName, standardFirmware, firmwareFor, deviceName, STAGE_LABEL } from './data.mjs';

const h = (str) => [...str].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const hex = (v) => (v & 255).toString(16).padStart(2, '0');

export const SYSTEMS = [
  { id: 'assetbox', name: 'Assetbox', does: 'Asset register', icon: 'box' },
  { id: 'infodns', name: 'InfoDNS', does: 'Addresses and DNS', icon: 'globe' },
  { id: 'fleetlens', name: 'Fleet Lens', does: 'Device management', icon: 'sliders' },
  { id: 'darksign', name: 'DarkSign', does: 'Signage players', icon: 'devices' },
  { id: 'appstate', name: 'AppState', does: 'Room booking and signage fleet', icon: 'calendar' },
  { id: 'monitordog', name: 'Monitor Dog', does: 'Monitoring', icon: 'pulse' },
];
export const STATE_LABEL = { sync: 'In sync', drift: 'Drifted', missing: 'Missing', na: 'Not used' };

// The meeting platform or management a configuration runs under, as a short filter value. The mode
// field is free text ("Webex cloud registration, Join Google Meet button"), so this reads it.
export function providerOf(cfg) {
  const m = `${cfg.mode ?? ''} ${cfg.managed_by ?? ''}`;
  if (/webex/i.test(m)) return 'Webex';
  if (/google meet/i.test(m)) return 'Google Meet';
  if (/poly video mode/i.test(m)) return 'Poly Video';
  if (/room booking/i.test(m)) return 'Room booking';
  if (/bsn/i.test(m)) return 'Signage cloud';
  if (/macos|managed/i.test(m)) return 'Managed';
  return 'Stand-alone';
}

/* The example unit: an in-service unit of one of the configuration's models, Dublin first. */
function exampleFor(cfg) {
  let best = null;
  for (const s of Object.values(spaces)) for (const p of s.positions) {
    if (!cfg.models.includes(p.model) || !p.current) continue;
    const score = (p.current.stage === 'manage' ? 4 : 0) + (p.hostname ? 2 : 0) + (s.site === 'dub' ? 1 : 0) + (p.model === cfg.models[0] ? 1 : 0);
    if (!best || score > best.score) best = { s, p, score };
  }
  return best;
}

export function fileState(cfg) {
  const ex = exampleFor(cfg);
  const cls = models[cfg.models[0]].class, plat = classes[cls]?.platforms ?? {};
  const signage = cls === 'signage-player';
  if (!ex) return { device: null, systems: SYSTEMS.map((sy) => ({ ...sy, state: 'na', file: '', fields: [] })), wrong: [] };
  const { s, p } = ex, u = p.current, site = sites[s.site], n = h(u.serial), seed = h(cfg.id);
  const host = p.hostname ?? null, fqdn = host ? `${host}.aigna.example` : null;
  const ip = `10.${(SITE_ORDER.indexOf(s.site) + 1) * 10}.${s.floor ?? 1}.${20 + (n % 200)}`;
  const mac = ['02', hex(n), hex(n >> 8), hex(n >> 16), hex(n >> 24), hex(n >> 4)].join(':');
  const fw = standardFirmware(p.model)?.version ?? null;
  const prevFw = firmwareFor(p.model)?.releases.find((r) => r.status === 'superseded')?.version ?? null;
  const room = s.number ? `${s.number} ${s.name}` : s.name;
  const isPolyMeet = cfg.id === 'poly-x-google-meet';
  // The Studio X always shows the problem that matters most for it: Fleet Lens turned automatic
  // updates back on (research note: Lens provisioning can re-enable updates). Others take one of a few.
  const problem = isPolyMeet ? 'updates' : ['fw', 'none', 'mon', 'none', 'dns', 'none', 'none'][seed % 7];

  const F = (k, want, got = want) => ({ k, want, got, ok: want === got });
  const out = [];
  const add = (id, applies, file, fields, missing = false) => {
    const sy = SYSTEMS.find((x) => x.id === id);
    if (!applies) { out.push({ ...sy, state: 'na', file: '', fields: [] }); return; }
    const state = missing ? 'missing' : fields.every((f) => f.ok) ? 'sync' : 'drift';
    out.push({ ...sy, state, file, fields: missing ? fields.map((f) => ({ ...f, got: null, ok: false })) : fields });
  };
  add('assetbox', true, `assets/${u.asset_tag}.json`, [
    F('asset_tag', u.asset_tag), F('serial', u.serial), F('model', modelName(p.model)),
    F('location', `${site.name}, ${room}`), F('status', STAGE_LABEL[u.stage]),
  ]);
  add('infodns', Boolean(plat.dhcp_dns && host), `zones/aigna.example/${host}`, [
    F('fqdn', fqdn ?? ''), F('address', ip, problem === 'dns' ? ip.replace(/\d+$/, (x) => String(+x + 1)) : ip), F('mac', mac), F('reservation', 'yes'),
  ]);
  add('fleetlens', Boolean(plat.device_management && !signage), `sites/${s.site}/devices/${host ?? u.serial}.yaml`, [
    F('name', host ?? u.serial), F('firmware', fw ?? 'not tracked', problem === 'fw' && prevFw ? prevFw : fw ?? 'not tracked'),
    F('policy', `${site.name} site`),
    ...(isPolyMeet ? [F('provider', 'Google Meet'), F('auto_updates', 'off', 'on')] : []),
  ]);
  add('darksign', signage, `players/${host ?? u.serial}.json`, [
    F('player', host ?? u.serial), F('group', `${site.name} signage`), F('firmware', fw ?? 'not tracked'),
  ]);
  add('appstate', Boolean(plat.room_booking || signage), `rooms/${s.id}.yaml`, [
    F('room', room), F('resource', `${s.id}@resource.aigna.example`), F('device', host ?? u.serial),
  ]);
  add('monitordog', Boolean(plat.monitoring && host), `checks/${host}.yml`, [
    F('host', fqdn ?? ''), F('checks', 'ping, https'), F('alerts_to', `av-${s.site}`),
  ], problem === 'mon');
  return {
    device: { name: deviceName(s, p), host, tag: u.asset_tag, room, site: site.name, model: modelName(p.model), fw },
    systems: out,
    // Settings a check would find wrong on this unit (by setting name), with what it found.
    wrong: isPolyMeet ? [{ name: 'Enable Automatic Updates', got: 'On (turned back on by the Fleet Lens policy)' }] : [],
  };
}
