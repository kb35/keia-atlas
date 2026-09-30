// The model the live simulation runs on (src/lib/livesim.mjs), built once at build time from the site's data:
// every office room people use and every home office, with its usage grid; every unit that reports (it has a
// hostname and is live); the open incidents. The pages put it in the page as JSON and the simulation runs in
// the browser. Kept small: short keys, indexes instead of repeated names.
import { spaces, sites, classes, incidents, INC_STATE, SITE_ORDER, KIND, className, modelName, deviceName, firmwareFor, standardFirmware, incidentPath, href } from './data.mjs';
import { roomUse } from './usage.mjs';
import { heatCode, seedOf, rand } from './livesim.mjs';

const REMOTE_TZ = { emea: 'Europe/Dublin', amer: 'America/New_York', apac: 'Asia/Singapore' };
const ROOM_KINDS = ['meeting', 'small', 'shared', 'desks', 'kits'];
const VIDEO = ['video-bar', 'codec', 'desk-video-device'];
const byNumber = (a, b) => String(a.number ?? a.id).localeCompare(String(b.number ?? b.id), 'en', { numeric: true });

const SITES = SITE_ORDER.map((id) => {
  const s = sites[id];
  return { id, name: s.name, code: s.code, city: s.city ?? null, tz: s.time_zone ?? null, region: s.region, remote: s.kind === 'remote' };
});
const SITE_I = Object.fromEntries(SITE_ORDER.map((id, i) => [id, i]));

// Open incidents, most urgent first.
const INCS = Object.values(incidents).filter((i) => i.state !== 'resolved').sort((a, b) => a.priority - b.priority || a.number.localeCompare(b.number))
  .map((i) => ({ no: i.number, state: INC_STATE[i.state], title: i.short_description, pri: i.priority, room: i.room, tag: i.device ?? null, opened: i.opened ?? null, to: href(incidentPath(i.number)) }));
const incOfUnit = (tag) => INCS.findIndex((i) => i.tag === tag);
const incOfRoom = (id) => INCS.findIndex((i) => i.room === id);

// Every unit that reports: live, with a hostname. Firmware behind the standard is made up, the same on every
// build: about one in ten of the units whose model has an older release, one in three of older kit.
function monitored() {
  const out = [];
  for (const sid of SITE_ORDER) {
    for (const s of Object.values(spaces).filter((x) => x.site === sid).sort(byNumber)) {
      for (const p of [...s.positions, ...s.olderKit]) {
        const u = p.current;
        if (!p.hostname || !u || u.stage !== 'manage') continue;
        // Firmware behind the standard (made up, the same on every build): about one in twelve of the units a
        // device management service updates, one in three of older kit. The versions are named where the
        // model has a firmware line; otherwise it is "a release behind".
        const managed = Boolean(classes[p.cls]?.platforms?.device_management);
        const std = p.model ? standardFirmware(p.model)?.version ?? '' : '';
        const olderRel = p.model ? firmwareFor(p.model)?.releases.filter((r) => r.status === 'superseded').map((r) => r.version) ?? [] : [];
        const seed = seedOf(`fw:${u.asset_tag}`);
        const behind = managed && rand(seed, 1) < (p.older ? 0.35 : 0.08);
        out.push({
          id: u.asset_tag, n: deviceName(s, p), cls: p.cls, site: SITE_I[s.site], room: s.id, rn: s.number ? `${s.number} ${s.name}` : s.name,
          old: p.older ? 1 : 0, inc: incOfUnit(u.asset_tag),
          fw: behind ? (olderRel.length && std ? `${olderRel[Math.floor(rand(seed, 2) * olderRel.length)]}|${std}` : '|') : '',
          // Build-time only (for the page's own markup); dropped from the page's JSON by lean().
          host: p.hostname, mn: p.model ? modelName(p.model) : '', kind: KIND(s),
        });
      }
    }
  }
  return out;
}

// The rooms people use (comms rooms are on the Devices overview, through their switches) and home offices.
function roomsOf(units) {
  const unitsIn = {};
  units.forEach((u, i) => (unitsIn[u.room] ??= []).push(i));
  const out = [];
  for (const sid of SITE_ORDER) {
    const list = Object.values(spaces).filter((s) => s.site === sid && ROOM_KINDS.includes(KIND(s)));
    const order = { meeting: 0, small: 1, shared: 2, desks: 3, kits: 4 };
    list.sort((a, b) => order[KIND(a)] - order[KIND(b)] || byNumber(a, b));
    for (const s of list) {
      const kind = KIND(s), home = kind === 'kits', site = sites[s.site];
      const heat = roomUse[s.id]?.heat;
      out.push({
        id: s.id, n: s.name, no: s.number ?? '', site: SITE_I[s.site], kind, prof: s.type.profile.name,
        ...(home ? { home: 1, tz: sites[s.near]?.time_zone ?? REMOTE_TZ[site.region], town: s.town ?? '' } : {}),
        ...(heat ? { heat: heatCode(heat) } : { cur: home ? 'home' : kind === 'shared' ? 'shared' : kind === 'desks' ? 'desks' : 'office' }),
        video: s.positions.some((p) => VIDEO.includes(p.cls) && p.current?.stage === 'manage') ? 1 : 0,
        seats: s.type.keia_atlas?.capacity?.max ?? s.type.keia_atlas?.capacity?.min ?? null,
        inc: incOfRoom(s.id), units: unitsIn[s.id] ?? [],
      });
    }
  }
  return out;
}

const ALL_UNITS = monitored();
export const CLASS_LABEL = Object.fromEntries([...new Set(ALL_UNITS.map((u) => u.cls))].map((c) => [c, className(c)]));

// For the Rooms overview: the rooms, and the units in them (for problems).
export function roomsModel() {
  const rooms0 = roomsOf(ALL_UNITS);
  const keep = new Set(rooms0.map((r) => r.id));
  const units = ALL_UNITS.filter((u) => keep.has(u.room));
  return { sites: SITES, units, rooms: roomsOf(units), incs: INCS };
}
// For the Devices overview: every unit that reports.
export function devicesModel() {
  return { sites: SITES, units: ALL_UNITS, rooms: [], incs: INCS };
}

// What the page's script needs, as JSON. The rest (hostnames, model names, room profiles) is in the markup.
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined && o[k] !== '' && o[k] !== null).map((k) => [k, o[k]]));
export function lean(model, unitKeys = ['id', 'n', 'cls', 'site', 'room', 'rn', 'old', 'inc', 'fw']) {
  return {
    sites: model.sites.map((s) => pick(s, ['id', 'name', 'code', 'tz', 'region', 'remote'])),
    units: model.units.map((u) => pick(u, unitKeys)),
    rooms: model.rooms.map((r) => pick(r, ['id', 'n', 'no', 'site', 'kind', 'home', 'tz', 'heat', 'cur', 'video', 'inc', 'units'])),
    incs: model.incs,
  };
}
