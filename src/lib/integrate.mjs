// Deploy, built around batches and checks.
//
// "Verify, don't tick." An engineer sets devices up in batches (every unit that shares one configuration,
// such as three Poly Studio X72 video bars), not room by room, and Keia Atlas checks what it can see: the
// records in the systems, the unit online on its switch port, the settings read back against the standard.
// A person accepts what passed in one action and fixes only the exceptions. Commissioning stays room by
// room: a short room test, "All passed" in one tap.
//
// This module builds the plan a project's Deploy pages start from (the base). What happens after is
// events in the live layer (src/lib/live.mjs), replayed in the browser by src/lib/integrate-client.mjs:
//
//   int:<PRJ>:<unit id>:unit        one unit: online, read, drift, fwOk, dnsOk, host, serial, photo,
//                                   x-<step> (a person's tick or untick, with the reason in the note),
//                                   su-<setup id> (a setup-order tick)
//   int:<PRJ>:<batch id>:batch      one batch: applied, prepared (the agent), accepted, su-<setup id>
//   int:<PRJ>:<room id>:room        one room: tests, signed, accepted
//   int:<PRJ>:all:project           the whole project: accepted
//
// "accepted" is a list of "<unit id>|<step>" a person has accepted (or confirmed by hand where Keia Atlas
// cannot see), written as one event with the evidence in its note. Everything here is simulated: the
// systems' answers are made up from the project's tasks, so the page is labelled Simulated live.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { spaces, sites, classes, configFor, standardFirmware, firmwareFor, advisoriesFor, ADV_LEVEL, REGION_LABEL, className, modelName, href, LOC_LABEL, INTEGRATE_STEPS, STEP_LABEL, PHASE_LABEL, PHASES, SITE_ORDER, deviceName, countryName, DEMO_TODAY } from './data.mjs';
import { SYSTEMS } from './cfgstate.mjs';
import { PEOPLE, person } from './demo.mjs';
import { buildSheet, resolve, varsOf } from './buildsheet.mjs';

const hash = (str) => [...String(str)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

// The house values every build sheet is worked out from (data/house-values), and the network standard's VLAN
// names. Read here because data.mjs does not load them; the validator has already checked both.
const readData = (rel) => parse(readFileSync(path.join(process.cwd(), 'data', rel), 'utf8'));
export const HOUSE = readData('house-values/aigna.yaml');
const NETWORK = readData('standards/network.yaml');
const VLAN_NAME = Object.fromEntries((NETWORK.sections.find((s) => s.id === 'vlans')?.table?.rows ?? []).map((r) => [String(r[0]), r[1]]));
const DOMAIN = HOUSE.domain;
const SYSTEM_NAME = Object.fromEntries(SYSTEMS.map((s) => [s.id, s.name]));
const sentence = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());
const lowerFirst = (s) => (/^[A-Z][a-z]/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const plural = (w) => (/(s|x|ch|sh)$/i.test(w) ? `${w}es` : /[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
export const nounOf = (cls, n) => { const w = lowerFirst(className(cls)); return n === 1 ? w : plural(w); };

// The steps a unit goes through, and the word for each when it is done. Labels come from data.mjs, so a
// renamed phase or step changes everywhere at once.
export const UNIT_STEPS = INTEGRATE_STEPS.filter((s) => s !== 'commission');
export const DONE_WORD = { provision: 'Provisioned', install: 'Installed', configure: 'Configured', commission: 'Commissioned' };

// Which devices a project really changes. A fit-out or a home kit is all new. A refresh or an upgrade
// changes one kind of device (the ones with a new unit on its way, or the kind the project is named for);
// the devices that pair with it are re-checked, and everything else in the room stays as it is and is
// covered by the room test. So a video bar refresh is 3 video bars, 3 touch controllers to re-pair and
// 5 microphones to reconnect, not 33 devices through 4 steps.
const ALL_NEW = new Set(['fit-out', 'home-kit', 'custom-design', 'new-build']);
const NAMED = [[/video bar/i, 'video-bar'], [/booking panel|scheduler/i, 'scheduler-panel'], [/signage/i, 'signage-player'], [/\bdisplay/i, 'display'], [/camera/i, 'camera'], [/switch/i, 'network-switch']];
const PAIRS_WITH = { 'video-bar': ['touch-controller', 'microphone', 'camera'], codec: ['touch-controller', 'microphone', 'camera'] };
const NEW_STAGES = new Set(['plan', 'procure', 'deploy']);

// The order an engineer sets things up in: the network first, then the room system, what pairs with it,
// then the AV path, the panels and the screens.
const WORK_ORDER = ['network-switch', 'network-gateway', 'video-bar', 'codec', 'desk-video-device', 'touch-controller', 'microphone', 'camera', 'amplifier', 'loudspeaker', 'av-switcher', 'av-extender', 'adapter', 'scheduler-panel', 'signage-player', 'printer', 'dock', 'monitor', 'display'];
const orderOf = (cls) => { const i = WORK_ORDER.indexOf(cls); return i < 0 ? WORK_ORDER.length : i; };

// Where a class can be seen from: networked devices answer for themselves; a microphone or touch
// controller is seen through the room system it hangs off.
const SEEN_VIA_HOST = new Set(['microphone', 'camera']);

// The short room test for commissioning, by what is in the room. Kept short on purpose: one line each.
const TESTS = [
  { id: 'call', when: (c) => c.has('video-bar') || c.has('codec') || c.has('desk-video-device'), t: 'Test call from another site', how: 'The far end sees the whole table and hears everyone clearly. Call from another site, not the room next door.' },
  { id: 'display', when: (c) => c.has('display'), t: 'Displays', how: 'The call and shared content show on every display, sharp and the right way up.' },
  { id: 'audio', when: (c) => c.has('microphone') || c.has('video-bar') || c.has('loudspeaker'), t: 'Microphones and speakers', how: 'Even levels from every seat, and no echo at the far end.' },
  { id: 'share', when: (c) => c.has('av-switcher') || c.has('av-extender'), t: 'Sharing a laptop', how: 'A laptop shares by cable at the table, and the picture switches over by itself.' },
  { id: 'booking', when: (c) => c.has('scheduler-panel'), t: 'Booking panel', how: 'The panel at the door shows today\'s bookings and can book the room.' },
  { id: 'network', when: (c) => c.has('network-gateway'), t: 'Home network', how: 'The gateway is online and the work network reaches the office.' },
  { id: 'desk', when: (c) => c.has('monitor') || c.has('dock'), t: 'Desk set-up', how: 'One cable to the laptop gives the monitor, charging and the network.' },
  { id: 'print', when: (c) => c.has('printer'), t: 'Test print', how: 'A test page prints from the queue, and scanning to email works.' },
];

// Everything a unit's build sheet is worked out from (src/lib/buildsheet.mjs): the unit, its room and site, its
// configuration, the house values, what it pairs with and its firmware target.
function ctxFor(u, plan) {
  const room = spaces[u.room], site = sites[u.site];
  const cfg = u.cfg && u.model ? configFor(u.model) : null;
  const line = u.model ? firmwareFor(u.model) : null;
  const std = u.model ? standardFirmware(u.model) : null;
  const partner = u.pairs ? (plan?.units ?? []).find((x) => x.host === u.pairs && x.room === u.room) ?? null : null;
  const adv = u.model ? advisoriesFor(u.model).map((a) => ({ id: a.id, title: a.title, levelLabel: ADV_LEVEL[a.level] ?? a.level })) : [];
  return {
    unit: { ...u, records: (u.records ?? []).map((r) => r.id) },
    room: { id: room.id, number: room.number ?? null, name: room.name },
    site: { id: u.site, code: site.code, name: site.name, region: site.region, time_zone: site.time_zone ?? null, countryName: site.country ? countryName(site.country) : null },
    regionName: REGION_LABEL[site.region] ?? site.region,
    cfg, house: HOUSE, vlanName: VLAN_NAME, systems: SYSTEM_NAME,
    platforms: cfg ? HOUSE.platforms.filter((p) => p.configurations.includes(cfg.id)) : [],
    // No compute system is a device class yet, so a setting that names the paired compute system's hostname
    // stays Not recorded until the room's install record has one.
    partner: { host: u.pairs ?? null, name: partner?.name ?? null, compute: null },
    firmware: line || cfg?.firmware ? {
      target: std ? `${line.name} ${std.version}` : null, from: 'The fleet standard, passed by the Lab', checked: cfg?.firmware ?? null,
      where: line?.managed_in ? line.managed_in.split(/[,;]/)[0].trim() : cfg?.groups.find((g) => /firmware|update/i.test(g.name))?.where ?? 'Where the configuration updates it', advisories: adv,
    } : null,
  };
}
// One unit's build sheet.
export const sheetFor = (plan, uid) => { const u = plan.units.find((x) => x.id === uid); return u ? buildSheet(ctxFor(u, plan)) : null; };
// A per-unit value as the batch page shows it: resolved, or "Not recorded".
function valueFor(s, u, plan) {
  if (!s.derive) return s.val;
  const r = resolve(s.derive, { name: s.t, value: s.val }, ctxFor(u, plan));
  return r.missing ? 'Not recorded' : r.secret ? `Vault: ${r.val}` : `${r.val}${r.alt ? ` (${r.alt.val})` : ''}`;
}
// Where a unit's build sheet lives: under its batch, by a slug of its id.
export const unitSlug = (id) => String(id).replace(/[/#]+/g, '-');

// A configuration's settings as a person reads them: grouped by where they live, no ticks.
function settingsOf(cfg) {
  const all = cfg.groups.flatMap((g) => g.settings.map((st) => ({ ...st, group: g.name })));
  const row = (st) => ({ t: st.name, val: st.value, def: st.default ?? null, path: st.path ?? null, why: st.why ?? null, act: st.action, per: Boolean(st.per_device), unc: Boolean(st.unconfirmed), derive: st.derive ?? null });
  const groups = cfg.groups.map((g) => ({ name: g.name, rows: g.settings.filter((st) => st.action !== 'leave').map((st) => row({ ...st, group: g.name })) })).filter((g) => g.rows.length);
  return {
    set: all.filter((s) => s.action === 'change').length, verify: all.filter((s) => s.action === 'verify').length, leave: all.filter((s) => s.action === 'leave').length,
    groups, perDevice: all.filter((s) => s.per_device && s.action !== 'leave').map(row),
  };
}
// The setup order: the configuration's own, or its plain steps.
function setupOf(cfg) {
  const list = cfg.setup ?? (cfg.steps ?? []).map((s, i) => ({ id: `s${i + 1}`, title: s }));
  return list.map((s, i) => ({ id: s.id, n: i + 1, t: s.title, detail: s.detail ?? null, path: s.path ?? null, why: s.why_order ?? null, first: Boolean(s.critical), after: s.after ?? [] }));
}

export function integratePlan(project) {
  const P = project.id;
  const phaseAt = PHASES.indexOf(project.phase), intAt = PHASES.indexOf('integrate');
  const past = phaseAt > intAt;
  const hist = project.history ?? [];
  const procured = past || hist.some((h) => h.phase === 'procure' && h.ended);
  const lead = project.roles?.find((r) => r.as === 'lead')?.person ?? project.owner;
  const vendorRole = project.roles?.find((r) => r.as === 'vendor');
  const vendor = vendorRole ? PEOPLE.find((x) => x.id === vendorRole.person) ?? null : null;
  const intTasks = project.tasks.filter((t) => t.phase === 'integrate');
  const taskFor = (room, step) => intTasks.find((t) => t.kind === step && t.space === room) ?? intTasks.find((t) => t.kind === step && !t.space) ?? null;
  const networkDone = project.tasks.some((t) => t.kind === 'network' && t.status === 'done');
  const allNew = ALL_NEW.has(project.kind);

  // What the project changes: the classes with a new unit on its way, or the kind it is named for.
  const rooms0 = (project.spaces ?? []).map((ps) => ({ ps, room: spaces[ps.space] })).filter((x) => x.room);
  const scope = new Set();
  if (!allNew) {
    for (const { room } of rooms0) for (const p of room.positions) if (p.legacy || NEW_STAGES.has(p.current?.stage)) scope.add(p.cls);
    for (const [re, cls] of NAMED) if (re.test(project.name)) scope.add(cls);
    const present = new Set(rooms0.flatMap(({ room }) => room.positions.map((p) => p.cls)));
    for (const c of [...scope]) if (!present.has(c)) scope.delete(c);
  }
  const everything = allNew || scope.size === 0;

  const units = [], kept = [], rooms = [];
  let firmwarePicked = false, driftPicked = false;
  for (const { ps, room } of rooms0) {
    const site = sites[room.site];
    const roomName = room.number ? `${room.number} ${room.name}` : room.name;
    const positions = room.positions.filter((x) => x.model || x.hostname);
    const newHere = positions.filter((p) => everything || scope.has(p.cls));
    const pairClasses = new Set(newHere.flatMap((p) => PAIRS_WITH[p.cls] ?? []));
    const hostOf = (cls) => positions.find((x) => x.cls === 'video-bar' || x.cls === 'codec') ?? null;
    const r = { id: room.id, name: roomName, site: room.site, siteName: site.name, profile: room.type?.profile?.name ?? '', state: ps.state, note: ps.note ?? null, units: [], kept: [], tests: [], base: { tests: {}, signed: null } };

    for (const p of positions) {
      const isNew = everything || scope.has(p.cls);
      const cfg = p.model ? configFor(p.model) : null;
      const touched = !isNew && pairClasses.has(p.cls) && cfg;
      const id = `${room.id}/${p.position}`;
      const full = deviceName(room, p);
      const short = sentence(full.slice(room.name.length).trim()) || className(p.cls);
      if (!isNew && !touched) {
        const k = { id, room: room.id, short, clsName: className(p.cls), cls: p.cls, model: p.model ? modelName(p.model) : null, host: p.hostname ?? null };
        kept.push(k); r.kept.push(id);
        continue;
      }
      const plat = classes[p.cls]?.platforms ?? {};
      const networked = Boolean(plat.dhcp_dns || plat.device_management || plat.monitoring);
      const hostPos = SEEN_VIA_HOST.has(p.cls) || p.cls === 'touch-controller' ? hostOf(p.cls) : null;
      const hasCfg = Boolean(cfg && (cfg.groups.some((g) => g.settings.some((s) => s.action !== 'leave')) || (cfg.setup ?? cfg.steps ?? []).length));
      const steps = touched ? (hasCfg ? ['configure'] : []) : ['provision', 'install', ...(hasCfg ? ['configure'] : [])];
      if (!steps.length) { kept.push({ id, room: room.id, short, clsName: className(p.cls), cls: p.cls, model: p.model ? modelName(p.model) : null, host: p.hostname ?? null }); r.kept.push(id); continue; }

      // How far each step had got when the page was built, from the project's tasks.
      const frac = {}, task = {};
      for (const step of [...UNIT_STEPS, 'commission']) {
        const t = taskFor(room.id, step);
        task[step] = t;
        if (t) frac[step] = t.status === 'done' ? 1 : t.status === 'doing' ? 0.5 : 0;
        else if (past || ps.state === 'done' || ps.state === 'snags') frac[step] = 1;
        else if (phaseAt < intAt) frac[step] = 0;
        else frac[step] = null;
      }
      UNIT_STEPS.forEach((step, i) => {
        if (frac[step] !== null) return;
        frac[step] = [...UNIT_STEPS.slice(i + 1), 'commission'].some((s) => frac[s] > 0) ? 1 : 0;
      });

      const h = hash(id), u0 = p.current ?? {};
      const installedDay = u0.stage === 'deploy' && u0.installed && u0.installed <= DEMO_TODAY;
      const installed = touched ? true : frac.install === 1 || (frac.install > 0 && (installedDay || h % 3 !== 0));
      const online = networked && installed;
      const fw = p.model ? standardFirmware(p.model)?.version ?? null : null;
      const oldFw = p.model ? firmwareFor(p.model)?.releases.find((x) => x.status === 'superseded')?.version ?? null : null;
      const ip = `10.${(SITE_ORDER.indexOf(room.site) + 1) * 10}.${room.floor ?? 1}.${20 + (hash(u0.serial ?? p.position) % 200)}`;
      const switchName = `${room.site}-${String(room.number ?? room.floor ?? '1').replace(/\D/g, '').slice(0, 4) || '01'}-sw01`;
      const port = networked ? `${switchName} port ${1 + (h % 22)}` : null;

      // Provision: one check per system record the unit needs (the systems in cfgstate.mjs).
      const records = [];
      if (!touched) {
        const sy = (sid) => SYSTEMS.find((x) => x.id === sid);
        const add = (sid, applies, seen, exp) => { if (applies) records.push({ id: sid, t: sy(sid).does, sys: sy(sid).name, exp, seen }); };
        const provStarted = frac.provision > 0;
        add('assetbox', true, procured || provStarted || installed, `${u0.asset_tag ?? 'New tag'} · ${u0.serial ?? 'serial on arrival'}`);
        add('infodns', Boolean(plat.dhcp_dns), Boolean(p.hostname) && (frac.provision === 1 || (task.provision ? task.provision.status !== 'todo' : networkDone) || installed), p.hostname ? `${p.hostname}.${DOMAIN} on ${ip}` : 'A hostname first');
        add('fleetlens', Boolean(plat.device_management && p.cls !== 'signage-player'), online || frac.provision === 1, `In the ${site.name} policy`);
        add('darksign', p.cls === 'signage-player', online || frac.provision === 1, `In ${site.name} signage`);
        const calVars = varsOf({ unit: { modelName: p.model ? modelName(p.model) : '' }, room, site: { ...site, id: room.site } });
        add('appstate', Boolean(plat.room_booking), provStarted || installed || !allNew, HOUSE.calendar.address.replace(/\{(\w+)\}/g, (m, k) => calVars[k] ?? m));
        add('monitordog', Boolean(plat.monitoring && p.hostname), frac.provision === 1 || installed || (!allNew && Boolean(p.hostname)), 'Ping and https checks');
        const lic = (cfg?.requires ?? []).find((x) => /licen[cs]e/i.test(x));
        if (lic) records.push({ id: 'licence', t: 'Licence', sys: 'Licences', exp: sentence(lic), seen: online || frac.provision === 1 });
        if (fw) records.push({ id: 'firmware', t: 'Firmware', sys: 'Read from the unit', exp: `Version ${fw}`, seen: online || frac.provision === 1 });
      }

      // Configure, as it was: read back from device management where Keia Atlas can see it.
      const readable = Boolean(plat.device_management) || (hostPos && SEEN_VIA_HOST.has(p.cls)) || p.cls === 'touch-controller';
      const configured = frac.configure === 1;
      const setupN = cfg ? setupOf(cfg).length : 0;
      const setupDone = configured ? setupN : frac.configure > 0 ? Math.max(1, Math.round(setupN * 0.4)) : 0;

      // Accepted already: a step whose task is done, or a room already finished.
      const who = (step) => task[step]?.owner ?? lead;
      const acceptedBase = {};
      const signedOff = (step) => (task[step]?.status === 'done') || past || ps.state === 'done' || ps.state === 'snags';
      for (const step of steps) {
        const done = step === 'provision' ? frac.provision === 1 : step === 'install' ? installed && frac.install === 1 : configured;
        if (done && signedOff(step)) acceptedBase[step] = who(step);
      }
      // Done by hand earlier where Keia Atlas cannot see (a microphone, an extender set by DIP switches).
      const handBase = {};
      if (steps.includes('install') && installed && !networked) handBase.install = who('install');
      if (steps.includes('configure') && configured && !readable) handBase.configure = who('configure');

      const tag = u0.asset_tag ?? null;
      const u = {
        id, room: room.id, roomName, site: room.site, name: full, short, cls: p.cls, clsName: className(p.cls),
        model: p.model ?? null, modelName: p.model ? modelName(p.model) : null, host: p.hostname ?? null, tag, serial: u0.serial ?? null, ip, port,
        role: touched ? 'touched' : 'new', steps, networked, readable: Boolean(readable), cfg: hasCfg ? cfg.id : null, fw, oldFw,
        where: LOC_LABEL[p.equipment?.location ?? 'tbd'] ?? null, tz: site.time_zone ?? '', country: site.country ? countryName(site.country) : '',
        hostPos: hostPos ? `${room.id}/${hostPos.position}` : null, pairs: null,
        legacy: p.legacy ? { tag: p.legacy.asset_tag, serial: p.legacy.serial } : null,
        link: p.current ? href(`/device/?tag=${p.current.asset_tag}`) : null,
        tasks: Object.fromEntries(steps.map((s) => [s, task[s] ? { id: task[s].id, title: task[s].title, owner: task[s].owner, status: task[s].status, href: href(`/projects/${P.toLowerCase()}/tasks/${task[s].id.toLowerCase()}/`) } : null]).filter(([, v]) => v)),
        blocked: Object.fromEntries(steps.map((s) => [s, task[s]?.status === 'blocked' ? (task[s].blocked_by ?? 'Blocked') : null]).filter(([, v]) => v)),
        owner: Object.fromEntries(steps.map((s) => [s, who(s)])),
        vendor: false,
        records,
        base: {
          online, read: Boolean(readable) && configured && (online || !networked), drift: null, fwOk: true, dnsOk: true,
          installed, partial: { provision: records.length ? records.filter((x) => x.seen).length / records.length : 0, install: !installed && frac.install > 0 ? 0.5 : 0, configure: configured ? 1 : setupN ? setupDone / setupN : 0 },
          setupDone, accepted: acceptedBase, hand: handBase,
        },
      };
      // The things that need a person, as the systems would report them.
      if (u.legacy && records.some((x) => x.id === 'infodns') && installed) u.base.dnsOk = false;
      if (!firmwarePicked && !touched && online && fw && oldFw && u.base.dnsOk === false) { u.base.fwOk = false; firmwarePicked = true; }
      if (!driftPicked && cfg?.id === 'poly-x-google-meet' && u.base.read) { u.base.drift = 'Automatic updates: On. Fleet Lens turned them back on (advisory ADV-001).'; driftPicked = true; }
      units.push(u); r.units.push(id);
    }
    // Pairing: what each unit pairs with in its room.
    const inRoom = units.filter((x) => x.room === room.id);
    const hostU = inRoom.find((x) => x.cls === 'video-bar' || x.cls === 'codec');
    const hostHost = hostU?.host ?? positions.find((x) => x.cls === 'video-bar' || x.cls === 'codec')?.hostname ?? null;
    for (const x of inRoom) {
      if (x.cls === 'touch-controller' || SEEN_VIA_HOST.has(x.cls)) x.pairs = hostHost;
      if (x.cls === 'video-bar' || x.cls === 'codec') x.pairs = positions.find((q) => q.cls === 'touch-controller')?.hostname ?? null;
    }
    // The room test, and how far it had got.
    const clsHere = new Set(positions.map((x) => x.cls));
    r.tests = TESTS.filter((t) => t.when(clsHere)).map(({ id, t, how }) => ({ id, t, how }));
    if (!r.tests.length) r.tests = [{ id: 'works', t: 'Everything works', how: 'The room works the way its room profile says.' }];
    const ct = taskFor(room.id, 'commission');
    if (ps.state === 'done' || past) { r.tests.forEach((t) => { r.base.tests[t.id] = { r: 'pass' }; }); r.base.signed = ct?.owner ?? lead; }
    else if (ps.state === 'snags') {
      r.tests.forEach((t, i) => { r.base.tests[t.id] = { r: 'pass' }; });
      const failing = r.tests.find((t) => t.id === 'call') ?? r.tests[0];
      r.base.tests[failing.id] = { r: 'fail', note: ps.note ?? 'Failed the room test' };
    }
    r.commissionTask = ct ? { id: ct.id, title: ct.title, owner: ct.owner, status: ct.status, href: href(`/projects/${P.toLowerCase()}/tasks/${ct.id.toLowerCase()}/`) } : null;
    rooms.push(r);
  }

  // The vendor installs every new unit, except in rooms where an install task names someone else.
  if (vendor) {
    for (const u of units) {
      if (!u.steps.includes('install')) continue;
      const t = intTasks.find((x) => x.kind === 'install' && x.space === u.room);
      u.vendor = !t || t.owner === vendor.id || PEOPLE.find((x) => x.id === t.owner)?.roleId === 'vendor';
    }
  }

  // Batches: every unit that shares one configuration (or one model, when there is nothing to set),
  // new units and re-checked ones apart, in the order an engineer would work.
  const byKey = new Map();
  for (const u of units) {
    const key = `${u.role === 'touched' ? 're-' : ''}${u.cfg ?? (u.model ? `model-${u.model}` : `kind-${u.cls}`)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(u);
  }
  const batches = [...byKey.entries()].map(([id, us]) => {
    const u0 = us[0], cfg = u0.cfg ? configFor(u0.model) : null;
    const modelsIn = [...new Set(us.map((u) => u.modelName).filter(Boolean).map((m) => m.replace(/\s*\([^)]*\)\s*$/, '')))];
    const clsIn = [...new Set(us.map((u) => u.cls))];
    const noun = clsIn.length === 1 ? nounOf(clsIn[0], us.length) : us.length === 1 ? 'device' : 'devices';
    const oneModel = modelsIn.length === 1 && us.every((u) => u.modelName);
    const nameHasNoun = oneModel && lowerFirst(className(u0.cls)).split(' ').some((w) => w.length > 3 && modelsIn[0].toLowerCase().includes(w.replace(/s$/, '')));
    const title = oneModel ? `${us.length} ${modelsIn[0]}${nameHasNoun ? (us.length > 1 && /[a-z]$/i.test(modelsIn[0]) ? 's' : '') : ` ${noun}`}` : `${us.length} ${noun}`;
    const plat = classes[u0.cls]?.platforms ?? {};
    const via = cfg ? (plat.device_management ? `Fleet Lens, the ${sites[u0.site].name} policy` : cfg.managed_by && !/^None/.test(cfg.managed_by) ? cfg.managed_by.split(/[;,]/)[0].replace(/\s*\([^)]*\)/g, '').replace(/\.$/, '').trim() : 'On each unit') : null;
    const settings = cfg ? settingsOf(cfg) : null;
    // What differs per unit, and what turns out to be the same for all of them (so it moves to the shared part).
    const perRows = settings?.perDevice ?? [];
    const differ = [], same = [];
    for (const s of perRows) {
      const vals = us.map((u) => valueFor(s, u, { units }));
      if (new Set(vals).size === 1 && us.length > 1) same.push({ t: s.t, val: vals[0] });
      else differ.push({ t: s.t, derive: s.derive, pattern: s.val, vals: Object.fromEntries(us.map((u, i) => [u.id, vals[i]])) });
    }
    // The settings that are the same on every unit, with their values (a house value such as the time servers
    // worked out, the rest as the configuration writes them).
    const shared = (cfg?.groups ?? []).flatMap((g) => g.settings).filter((s) => !s.per_device && s.action === 'change')
      .map((s) => ({ t: s.name, val: valueFor({ t: s.name, val: s.value, derive: s.derive }, u0, { units }) }));
    return {
      id, touched: u0.role === 'touched', title, noun, cls: clsIn, clsName: u0.clsName, models: modelsIn,
      cfg: cfg ? { id: cfg.id, name: cfg.name, version: cfg.version, link: href(`/configurations/${cfg.id}/`), summary: cfg.summary ?? '' } : null,
      via, dm: Boolean(plat.device_management), readable: us.every((u) => u.readable),
      settings: settings ? { set: settings.set, verify: settings.verify, leave: settings.leave, groups: settings.groups } : null,
      setup: cfg ? setupOf(cfg) : [], same: [...same, ...shared].filter((x, i, all) => all.findIndex((y) => y.t.toLowerCase() === x.t.toLowerCase()) === i), differ,
      steps: UNIT_STEPS.filter((s) => us.some((u) => u.steps.includes(s))),
      units: us.map((u) => u.id), rooms: [...new Set(us.map((u) => u.room))], order: orderOf(u0.cls),
    };
  }).sort((a, b) => a.touched - b.touched || a.order - b.order || a.title.localeCompare(b.title));
  // Re-checked units sit right after the batch they pair with (touch controllers after the video bars).
  const ordered = [];
  for (const b of batches.filter((x) => !x.touched)) ordered.push(b);
  for (const b of batches.filter((x) => x.touched)) {
    const at = ordered.findIndex((x) => !x.touched && PAIRS_WITH[x.cls[0]]?.some((c) => b.cls.includes(c)));
    if (at >= 0) { let i = at + 1; while (ordered[i]?.touched) i++; ordered.splice(i, 0, b); } else ordered.push(b);
  }
  ordered.forEach((b, i) => { b.n = i + 1; });
  const base = href(`/projects/${P.toLowerCase()}/integrate/`);
  for (const u of units) {
    u.batch = ordered.find((b) => b.units.includes(u.id)).id;
    u.slug = unitSlug(u.id);
    u.sheet = `${base}${u.batch}/${u.slug}/`;
  }

  const blocked = intTasks.filter((t) => t.status === 'blocked').map((t) => ({ id: t.id, title: t.title, why: t.blocked_by ?? 'Blocked', room: t.space ?? null, owner: t.owner, href: href(`/projects/${P.toLowerCase()}/tasks/${t.id.toLowerCase()}/`) }));
  return {
    project: P, name: project.name, kind: project.kind, phaseLabel: PHASE_LABEL.integrate,
    steps: INTEGRATE_STEPS.map((s) => ({ id: s, label: STEP_LABEL[s], done: DONE_WORD[s] })),
    lead, leadName: person(lead).name, vendor: vendor ? { id: vendor.id, name: vendor.name, company: vendor.vendorName ?? '' } : null,
    everything, scope: [...scope], units, kept, rooms, batches: ordered, blocked,
    home: href(`/projects/${P.toLowerCase()}/`), base: href(`/projects/${P.toLowerCase()}/integrate/`),
  };
}

// Where each batch and room page lives.
export const batchHref = (plan, id) => `${plan.base}${id}/`;
export const roomHref = (plan, id) => `${plan.base}room/${id}/`;

// The model as the pages were built (no events yet), for drawing on the server.
import { integrateModel } from './integrate-view.mjs';
export const buildModel = (plan) => integrateModel(plan, { get: (it, base) => base, stage: () => 6, agents: () => true, people: Object.fromEntries(PEOPLE.map((x) => [x.id, x.name])) });
