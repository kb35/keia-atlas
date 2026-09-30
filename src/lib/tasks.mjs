// What a task involves, by kind of work: the steps, what "done" looks like, and what to have open.
// A task's own `steps` override these. Steps name the room profile, profile and configuration pages so
// the person doing the work has the source of truth one click away (the knowledge loop).
import { spaces, sites, classes, models, configFor, standardFirmware, firmwareFor, className, modelName, playbooks, href, LOC_LABEL, INTEGRATE_STEPS, STEP_LABEL, PHASES, SITE_ORDER, roomWords, deviceName, countryName } from './data.mjs';
import { SYSTEMS } from './cfgstate.mjs';

export const TASK_KIND = {
  survey: 'Survey', design: 'Design', order: 'Order', network: 'Network', facilities: 'Facilities', records: 'Records',
  install: 'Install', provision: 'Provision', configure: 'Configure', commission: 'Commission', handover: 'Hand over', review: 'Review', budget: 'Plan and budget',
};

const STEPS = {
  survey: [
    'Open the space type drawing and walk the space with it.',
    'Check every outlet is where the space type expects it: power and data behind the display, under the table, at the door.',
    'Photograph the display wall, the table floor box and the ceiling.',
    'Note anything that differs from the space type; it goes in the design.',
  ],
  design: [
    'Choose the build option for each space from its space type.',
    'Write the swap sheet: position, old model, new model, hostname kept.',
    'Check mounts, cable lengths and power suit the new model (its ports are on the model page).',
    'List each networked device with its port and VLAN for the network team.',
    'Ask the service manager for design sign-off.',
  ],
  order: [
    'Order from the design: every position, plus one spare per ten.',
    'Flag anything with a long lead time to the project manager.',
    'Record the purchase order number and the expected delivery date on the project.',
  ],
  network: [
    'Send the MAC addresses to the network team before the units ship (their queue is five working days).',
    'Ask for address reservations and forward and reverse DNS records, named with each hostname.',
    'Confirm the switch ports are on the AV VLAN with enough power over Ethernet.',
    'Check each reservation resolves before install day.',
  ],
  facilities: [
    'Confirm power and data outlets with facilities against the space type\'s outlet list.',
    'Power in AV spaces must be always on: no light switch can turn it off.',
    'The table floor box sits under a table leg, so nobody trips on it.',
  ],
  records: [
    'For every position, record the serial number, MAC address and asset tag below.',
    'Photograph each label before the unit is mounted; some can\'t be read once it\'s on the wall.',
    'The delivery engineer checks the records before they count.',
  ],
  install: [
    'Book the space out for the time the install needs.',
    'Check the firmware on the unit against the standard. Newer than the standard? Don\'t update or roll back: use Report, New firmware found.',
    'Mount each device where the space type puts it, and connect it as the wiring shows.',
    'Power on and check each device takes its reserved address.',
    'Keep the position and hostname; retire any old unit in the asset register the same day.',
  ],
  // Deploy holds four steps per device (decision 0025). Provision is the system records, made
  // before or as the device arrives; configure is setting the device itself up.
  provision: [
    'Create or update the asset record: serial, asset tag, model, space and position.',
    'Reserve the address and check forward and reverse DNS resolve to the hostname.',
    'Enrol the device in device management, and add it to monitoring.',
    'Add the space to booking, where the space has a calendar.',
    'Assign the licence, and check the firmware against the standard before it goes on the wall.',
  ],
  configure: [
    'Open the setup guide for each device and work through its setup order: a step unlocks when the ones before it are done.',
    'Settings marked Set must be changed; settings marked Verify only need checking.',
    'Enrol the device in its meeting platform with the hostname as its name.',
    'Pair the touch controller and the booking panel to their space.',
    'Check the time zone and time servers, so the calendar is right.',
  ],
  commission: [
    'Run the space\'s verification: every device recorded, on its address, in device management and on standard firmware.',
    'Make a test call from another site, not the space next door.',
    'Check camera framing and microphone levels from the far end.',
    'List any snags; each gets an owner and a date.',
    'Close with what fixed anything unexpected, or "Nothing new" and why.',
  ],
  handover: [
    'Write the handover note for the service desk: spaces, what changed, known snags.',
    'Check the records match what is in the spaces.',
    'Redeploy or dispose of old units, and record which.',
  ],
  review: [
    'Collect what was learned on each task.',
    'Propose changes to the playbook, device types or setup guides; the owner approves them.',
  ],
  budget: [
    'Set the scope: which spaces and which units.',
    'Estimate the cost and add a budget line for the planning review.',
  ],
};

// Where a device of this kind is healthy, as the checks a commissioning run makes.
export const checksFor = (cls) => Object.values(classes[cls]?.platforms ?? {}).flatMap((p) => p.healthy_indicators ?? []).slice(0, 5).map(roomWords);

export function taskDetail(project, task) {
  const kind = task.kind ?? 'review';
  const space = task.space ? spaces[task.space] : null;
  const rooms = space ? [space] : (project.spaces ?? []).map((s) => spaces[s.space]).filter(Boolean);
  const devices = rooms.flatMap((s) => s.positions.filter((p) => p.model || p.hostname).map((p) => {
    const cfg = p.model ? configFor(p.model) : null;
    const set = cfg ? cfg.groups.flatMap((g) => g.settings) : [];
    const change = set.filter((x) => x.action === 'change').length, verify = set.filter((x) => x.action === 'verify').length;
    const fw = p.model ? standardFirmware(p.model) : null;
    return {
      room: s, p, name: `${s.name} ${(p.role ?? className(p.cls)).replace(/:.*$/, '').replace(/^./, (c) => c.toLowerCase())}`, model: p.model ? modelName(p.model) : null,
      cls: p.cls, host: p.hostname ?? null, where: LOC_LABEL[p.equipment?.location ?? 'tbd'],
      unit: p.current, cfg, change, verify, fw: fw?.version ?? null, checks: checksFor(p.cls),
      link: p.current ? href(`/device/?tag=${p.current.asset_tag}`) : null,
      cfgLink: cfg ? href(`/configurations/${cfg.id}/`) : p.model ? href(`/profiles/${p.cls}/${p.model}/#configuration`) : null,
    };
  }));
  const pb = project.playbook ? playbooks[project.playbook] : null;
  const phase = pb?.phases.find((x) => x.phase === task.phase) ?? null;
  const words = (t) => new Set(t.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const tw = words(task.title);
  const step = phase?.steps.map((st) => ({ st, n: [...words(st.title)].filter((w) => tw.has(w)).length })).sort((a, b) => b.n - a.n)[0];
  return {
    kind, kindLabel: TASK_KIND[kind] ?? kind, steps: task.steps ?? STEPS[kind] ?? STEPS.review, rooms, devices,
    showDevices: ['install', 'provision', 'configure', 'commission', 'records', 'network', 'design', 'survey'].includes(kind),
    records: kind === 'records' || (kind === 'install' && project.roles?.some((r) => r.as === 'vendor' && r.person === task.owner)),
    playbook: pb, phase, fromStep: step && step.n > 0 ? step.st : null,
  };
}

// ---- The Deploy board (decision 0025) ----------------------------------
// Every device in a project against the four steps of Deploy: Provision, Install, Configure,
// Commission. Each device-step is a checklist; a tick is a live event (src/lib/live.mjs) on the item
// `int:<project>:<device>:<step>`, one field per row, so the History drawer shows every tick on that
// step with who and when. What the page was built with (the base) is worked out here from the
// project's tasks: a done task ticks every row, a task being done ticks some, and a step with no task
// of its own counts as done once a later step has started. Checklists that many devices share
// (a configuration, a device profile's commissioning) are sent once, by id, so the page stays small.

const hash = (str) => [...str].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const DOMAIN = 'aigna.example';
const sentence = (s) => String(s ?? '').replace(/^./, (c) => c.toUpperCase());

// Provision: one row per system record the device needs (the systems in cfgstate.mjs, applied as
// the configuration file state applies them), then the licence and the firmware check.
function provisionRows(room, p, cfg, fw) {
  const plat = classes[p.cls]?.platforms ?? {}, signage = p.cls === 'signage-player';
  const host = p.hostname ?? null, u = p.current ?? {}, site = sites[room.site];
  const sy = (id) => SYSTEMS.find((x) => x.id === id);
  const n = hash(u.serial ?? p.position);
  const ip = `10.${(SITE_ORDER.indexOf(room.site) + 1) * 10}.${room.floor ?? 1}.${20 + (n % 200)}`;
  const roomLabel = room.number ? `${room.number} ${room.name}` : room.name;
  const rows = [];
  const add = (id, applies, exp, path) => { if (applies) rows.push({ id, t: sy(id).does, sys: sy(id).name, exp, path }); };
  add('assetbox', true, `${u.asset_tag ?? 'New tag'} · ${u.serial ?? 'serial on arrival'} · ${site.name}, ${roomLabel}`, `assets/${u.asset_tag ?? 'new'}.json`);
  add('infodns', Boolean(plat.dhcp_dns && host), `${host}.${DOMAIN} on ${ip}, reserved by MAC`, `zones/${DOMAIN}/${host}`);
  add('fleetlens', Boolean(plat.device_management && !signage), `${host ?? u.serial} in the ${site.name} site policy`, `sites/${room.site}/devices/${host ?? u.serial}.yaml`);
  add('darksign', signage, `${host ?? u.serial} in ${site.name} signage`, `players/${host ?? u.serial}.json`);
  add('appstate', Boolean(plat.room_booking || signage), `${room.id}@resource.${DOMAIN}`, `rooms/${room.id}.yaml`);
  add('monitordog', Boolean(plat.monitoring && host), `${host}.${DOMAIN}: ping and https, alerts to av-${room.site}`, `checks/${host}.yml`);
  const lic = (cfg?.requires ?? []).find((r) => /licen[cs]e/i.test(r));
  if (lic) rows.push({ id: 'licence', t: 'Licence assigned', sys: 'Licences', exp: sentence(lic) });
  if (fw) rows.push({ id: 'firmware', t: 'Firmware at the standard', sys: 'Before it goes on the wall', exp: `Version ${fw}` });
  return rows;
}

// Install: the physical work, in the order it happens.
function installRows(p, fw) {
  const where = LOC_LABEL[p.equipment?.location ?? 'tbd'];
  const rows = [{ id: 'book', t: 'Space booked out for the install' }];
  if (fw) rows.push({ id: 'fw', t: `Firmware checked against the standard (${fw})`, why: 'Newer than the standard? Do not update or roll back: use Report, New firmware found.' });
  rows.push({ id: 'label', t: 'Label photographed before it is mounted', why: 'Some labels cannot be read once the unit is on the wall.' });
  rows.push({ id: 'mount', t: where && p.equipment?.location && p.equipment.location !== 'tbd' ? `Mounted: ${where.toLowerCase()}` : 'Mounted where the space type puts it' });
  rows.push({ id: 'wire', t: 'Connected as the wiring shows' });
  rows.push({ id: 'power', t: p.hostname ? 'Powered on and took its reserved address' : 'Powered on and working' });
  if (p.legacy) rows.push({ id: 'retire', t: `Old unit ${p.legacy.serial} retired in the asset register`, why: 'The same day, so the register never shows two units in one position.' });
  return rows;
}

// Configure: the configuration's setup order (a step with `after` stays locked until those are
// ticked), then the settings to Set and to Verify; settings left at the vendor default are listed
// separately and not ticked.
function configureList(cfg) {
  const setup = (cfg.setup ?? (cfg.steps ?? []).map((s, i) => ({ id: `s${i + 1}`, title: s })));
  const rows = setup.map((s, i) => ({ id: `su-${s.id}`, kind: 'setup', n: i + 1, t: s.title, path: s.path, detail: s.detail, crit: s.critical || undefined, after: s.after?.map((a) => `su-${a}`), why: s.why_order, unc: s.unconfirmed || undefined }));
  const all = cfg.groups.flatMap((g) => g.settings.map((st) => ({ ...st, group: g.name })));
  const setting = (st, i, kind) => ({ id: `${kind}-${i}`, kind, t: st.name, group: st.group, path: st.path, val: st.value, def: st.default, why: st.why, per: st.per_device || undefined, unc: st.unconfirmed || undefined });
  all.forEach((st, i) => { if (st.action === 'change') rows.push(setting(st, i, 'set')); });
  all.forEach((st, i) => { if (st.action === 'verify') rows.push(setting(st, i, 'ver')); });
  const defaults = all.map((st, i) => (st.action === 'leave' ? setting(st, i, 'def') : null)).filter(Boolean);
  return { id: cfg.id, name: cfg.name, version: cfg.version, link: href(`/configurations/${cfg.id}/`), managedBy: cfg.managed_by ?? '', rows, defaults };
}

// Commission: the room verification for this kind of device, then its healthy checks.
function commissionRows(cls) {
  const plat = classes[cls]?.platforms ?? {};
  const V = 'Space verification';
  const rows = [{ id: 'v-asset', t: 'Recorded in the asset register, in this space', grp: V }];
  if (plat.dhcp_dns) rows.push({ id: 'v-addr', t: 'On its reserved address; DNS resolves both ways', grp: V });
  if (plat.device_management) rows.push({ id: 'v-dm', t: 'Checking in to device management', grp: V });
  rows.push({ id: 'v-fw', t: 'On the standard firmware', grp: V });
  if (plat.monitoring) rows.push({ id: 'v-mon', t: 'Green in monitoring', grp: V });
  if (['video-bar', 'codec', 'desk-video-device'].includes(cls)) rows.push({ id: 'v-call', t: 'Test call from another site: framing and microphone levels checked from the far end', grp: V });
  checksFor(cls).forEach((c, i) => rows.push({ id: `chk-${i}`, t: sentence(c), grp: 'Healthy when' }));
  return rows;
}

export function integrateBoard(project) {
  const phaseAt = PHASES.indexOf(project.phase), intAt = PHASES.indexOf('integrate');
  const hist = (project.history ?? []).find((h) => h.phase === 'integrate');
  const lead = project.roles?.find((r) => r.as === 'lead')?.person ?? project.owner;
  const intTasks = project.tasks.filter((t) => t.phase === 'integrate' && INTEGRATE_STEPS.includes(t.kind));
  const taskFor = (room, step) => intTasks.find((t) => t.kind === step && t.space === room) ?? intTasks.find((t) => t.kind === step && !t.space) ?? null;
  const configs = {}, commission = {};
  const rooms = [], devices = [];
  for (const ps of project.spaces ?? []) {
    const room = spaces[ps.space];
    if (!room) continue;
    const site = sites[room.site];
    const r = { id: room.id, name: room.number ? `${room.number} ${room.name}` : room.name, site: room.site, siteName: site.name, state: ps.state, profile: room.type?.profile?.name ?? '', devices: [] };
    for (const p of room.positions.filter((x) => x.model || x.hostname)) {
      const cfg = p.model ? configFor(p.model) : null;
      if (cfg && !configs[cfg.id]) configs[cfg.id] = configureList(cfg);
      if (!commission[p.cls]) commission[p.cls] = commissionRows(p.cls);
      const fw = p.model ? standardFirmware(p.model)?.version ?? null : null;
      const id = `${room.id}/${p.position}`;
      const prov = provisionRows(room, p, cfg, fw), inst = installRows(p, fw);
      const totals = { provision: prov.length, install: inst.length, configure: cfg ? configs[cfg.id].rows.length : 0, commission: commission[p.cls].length };
      // How far each step had got when the page was built.
      const frac = {}, task = {};
      for (const step of INTEGRATE_STEPS) {
        const t = taskFor(room.id, step);
        task[step] = t;
        if (t) frac[step] = t.status === 'done' ? 1 : t.status === 'doing' ? 0.35 + (hash(`${id}:${step}`) % 40) / 100 : 0;
        else if (phaseAt > intAt) frac[step] = 1;
        else if (phaseAt < intAt) frac[step] = 0;
        else frac[step] = hist?.steps?.find((s) => s.step === step)?.ended || ps.state === 'done' ? 1 : null;
      }
      // A step with no task of its own is done once a later step has started.
      INTEGRATE_STEPS.forEach((step, i) => {
        if (frac[step] !== null) return;
        frac[step] = INTEGRATE_STEPS.slice(i + 1).some((s) => frac[s] > 0) ? 1 : 0;
      });
      const base = {}, blocked = {}, owner = {}, tasks = {};
      for (const step of INTEGRATE_STEPS) {
        const tot = totals[step];
        let k = Math.round(frac[step] * tot);
        if (tot > 0 && frac[step] > 0 && frac[step] < 1) k = Math.min(tot - 1, Math.max(1, k));
        base[step] = k;
        const t = task[step];
        if (t?.status === 'blocked') blocked[step] = t.blocked_by ?? 'Waiting on something';
        owner[step] = t?.owner ?? lead;
        if (t) tasks[step] = { id: t.id, title: t.title, href: href(`/projects/${project.id.toLowerCase()}/tasks/${t.id.toLowerCase()}/`) };
      }
      // Read back (stage 2): what the systems hold. At most one made-up difference per device, and
      // only on a row that was already ticked, so the board shows what drift looks like.
      const drift = {};
      if (hash(id) % 5 === 0) {
        const ticked = prov.slice(0, base.provision);
        const pick = ticked.find((x) => x.id === 'infodns') ?? ticked.find((x) => x.id === 'monitordog') ?? ticked.find((x) => x.id === 'firmware');
        if (pick?.id === 'infodns') drift.infodns = pick.exp.replace(/\.(\d+), reserved by MAC$/, (m, d) => `.${+d + 1}, reserved by MAC`);
        else if (pick?.id === 'monitordog') drift.monitordog = 'Missing: no check for this host';
        else if (pick?.id === 'firmware') drift.firmware = `Version ${firmwareFor(p.model)?.releases.find((x) => x.status === 'superseded')?.version ?? 'older than the standard'}`;
      }
      // A Studio X, once its settings are ticked, reads back the drift that matters most for it:
      // Fleet Lens turned automatic updates back on (ADV-001).
      if (cfg?.id === 'poly-x-google-meet') {
        const au = configs[cfg.id].rows.find((x) => x.t === 'Enable Automatic Updates');
        if (au) drift[au.id] = 'On (turned back on by the Fleet Lens policy)';
      }
      const full = deviceName(room, p);
      const d = {
        id, room: room.id, roomName: r.name, site: room.site, name: full,
        short: sentence(full.slice(room.name.length).trim()) || className(p.cls),
        cls: p.cls, clsName: className(p.cls), model: p.model ? modelName(p.model) : null, host: p.hostname ?? null,
        tag: p.current?.asset_tag ?? null, fw,
        tz: site.time_zone ?? '', country: site.country ? countryName(site.country) : '',
        dm: Boolean(classes[p.cls]?.platforms?.device_management), cfg: cfg?.id ?? null,
        unit: p.current ? href(`/device/?tag=${p.current.asset_tag}`) : null,
        rows: { provision: prov, install: inst }, totals, base, blocked, owner, tasks, drift,
      };
      devices.push(d); r.devices.push(d);
    }
    rooms.push(r);
  }
  // How many devices have finished each step, as the page was built.
  const done = Object.fromEntries(INTEGRATE_STEPS.map((s) => [s, devices.filter((d) => d.totals[s] > 0 && d.base[s] >= d.totals[s]).length]));
  const applies = Object.fromEntries(INTEGRATE_STEPS.map((s) => [s, devices.filter((d) => d.totals[s] > 0).length]));
  return { project: project.id, steps: INTEGRATE_STEPS.map((s) => ({ id: s, label: STEP_LABEL[s] })), rooms, devices, configs, commission, done, applies, lead };
}

// The state of one device-step from how many of its rows are ticked: done, doing, blocked, to do,
// or not needed (nothing to tick).
export function cellState(total, n, blocked) {
  if (!total) return 'na';
  if (n >= total) return 'done';
  if (blocked) return 'blocked';
  return n > 0 ? 'doing' : 'todo';
}
