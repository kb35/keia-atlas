// A unit's build sheet: every setting it gets, worked out to its own value, grouped where you set it and in
// the order you set it up.
//
// Pure: no data.mjs here, so the tests can run it and nothing guesses. The caller (integrate.mjs, sheetFor)
// gathers the unit, its room, its site, its configuration and the house values (data/house-values) and
// passes them in. A configuration setting names its value template with `derive` (schemas/ext/configuration);
// resolve() turns the template into this unit's value and says where it came from. Secrets are never shown:
// the sheet names the password vault entry instead. A value that cannot be worked out from the data is
// "Not recorded", with the reason, and is listed; it is never guessed.
//
//   const S = buildSheet(ctx)
//   S.groups  [{ id, place, where, title, n, rows }]   in setup order
//   S.rows    every row: { k, t, val, alt, note, from, path, act, per, secret, missing, why, pattern, ck }
//   S.missing the rows that are Not recorded
//   S.counts  { rows, set, verify, per, missing }

const SEP = ' › ';
const fill = (pattern, vars) => String(pattern ?? '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
const segs = (s) => String(s ?? '').split(/\s*(?:>|›)\s*/).map((x) => x.trim()).filter(Boolean);
const slugOf = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Where exactly: the group's place, then the setting's own menu path, without repeating a step both name.
export function wherePath(where, path) {
  const W = segs(where), P = segs(path);
  if (!P.length) return W.join(SEP);
  const at = W.findIndex((w) => w.toLowerCase() === P[0].toLowerCase());
  return (at >= 0 ? [...W.slice(0, at), ...P] : [...W, ...P]).join(SEP);
}

// The house values' {placeholders} for one unit.
export function varsOf({ unit, room, site, regionName }) {
  return {
    site: site.name, city: site.city ?? site.name, code: String(site.code ?? site.id ?? '').toLowerCase(), region: regionName ?? site.region ?? '',
    number: room.number ?? '', digits: String(room.number ?? '').replace(/\D/g, ''), room: room.name, slug: slugOf(room.name),
    model: unit.modelName ?? unit.clsName ?? '',
  };
}

const missing = (why) => ({ val: null, missing: true, why });

// The platform a management setting is about: the one its words name, else the configuration's first.
export function platformFor(platforms, st, group) {
  const text = `${st?.name ?? ''} ${st?.value ?? ''} ${group?.name ?? ''} ${group?.where ?? ''}`.toLowerCase();
  return platforms.find((x) => text.includes(x.name.toLowerCase())) ?? platforms.find((x) => text.includes(x.name.split(' ')[0].toLowerCase())) ?? platforms[0] ?? null;
}

// One value template, resolved for this unit.
export function resolve(key, st, ctx) {
  const { unit, room, site, house, platforms = [], partner } = ctx;
  const V = varsOf(ctx);
  const roomLabel = room.number ? `${room.number} ${room.name}` : room.name;
  const hostOr = (why) => (unit.host ? { val: unit.host, from: 'The unit\'s hostname, from its install record' } : missing(why ?? 'No hostname in the install record yet. Give it one on the Deploy page first.'));
  switch (key) {
    case 'hostname': return hostOr();
    case 'fqdn': return unit.host ? { val: `${unit.host}.${house.domain}`, from: 'The hostname and the house domain' } : hostOr();
    case 'compute-host':
      return partner?.compute
        ? { val: partner.compute, from: `The compute system in ${roomLabel}` }
        : missing(`The compute system this pairs with is not recorded in ${roomLabel}. Add it to the room's install record; its hostname is the device name.`);
    case 'room-name': return { val: roomLabel, from: 'The room\'s number and name' };
    case 'calendar': return {
      val: fill(house.calendar.name, V), alt: { label: 'Resource address', val: fill(house.calendar.address, V) },
      from: 'The house calendar naming, from the room',
    };
    case 'time-zone': return site.time_zone ? { val: site.time_zone, from: `The site's time zone (${site.name})` } : missing(`No time zone is recorded for ${site.name}.`);
    case 'country': return site.countryName ? { val: site.countryName, from: `The site's country (${site.name})` } : missing(`No country is recorded for ${site.name}.`);
    case 'holidays': return site.countryName ? { val: `${site.countryName} public holidays`, from: 'The site\'s country' } : missing(`No country is recorded for ${site.name}.`);
    case 'time-server-1': return { val: house.time_servers[0], from: 'The house time servers' };
    case 'time-server-2': return house.time_servers[1] ? { val: house.time_servers[1], from: 'The house time servers' } : missing('Only one house time server is recorded.');
    case 'time-servers': return { val: house.time_servers.join(', '), from: 'The house time servers (DHCP hands them out)' };
    case 'time-servers-zone': return site.time_zone
      ? { val: house.time_servers.join(', '), alt: { label: 'Time zone', val: site.time_zone }, from: 'The house time servers and the site\'s time zone' }
      : missing(`No time zone is recorded for ${site.name}.`);
    case 'dns-servers': {
      const d = house.dns?.[site.region];
      return d ? { val: d.join(', '), from: `The ${ctx.regionName ?? site.region} resolvers (DHCP hands them out)` } : missing(`No DNS servers are recorded for ${site.name}'s region.`);
    }
    case 'domain': return { val: house.domain, from: 'The house domain' };
    case 'dhcp-reservation':
      return unit.ip
        ? { val: unit.ip, note: `Leave it on DHCP (${st?.value ?? 'DHCP'}). The reservation gives it this address.`, from: 'Its DHCP reservation (simulated address plan)' }
        : missing('No address reserved for it yet.');
    case 'sip-address': return unit.host ? { val: `${unit.host}@${house.sip_domain}`, from: 'The hostname and the house SIP domain' } : hostOr();
    case 'contact': return house.support ? { val: fill(house.support, V), from: 'The house support contact' } : missing('No support contact is recorded in the house values.');
    case 'pair':
      return partner?.host
        ? { val: partner.host, note: `${partner.name ? `${partner.name}. ` : ''}${st?.value ? `As written: ${st.value}.` : ''}`.trim(), from: `What it pairs with in ${roomLabel}` }
        : missing(`Nothing it pairs with is recorded in ${roomLabel}.`);
    case 'management': {
      const p = platformFor(platforms, st, ctx.group);
      if (!p) return missing('No management platform is recorded for this configuration.');
      const where = fill(p.group, V);
      return /policy level/i.test(st?.name ?? '')
        ? { val: where, note: `${p.group_label} in ${p.name}.`, from: `The house values for ${p.name}` }
        : { val: p.org, alt: { label: p.group_label, val: where }, from: `The house values for ${p.name}` };
    }
    case 'vault-site': case 'vault-room': case 'vault-monitoring': {
      const pat = house.vault[key.slice(6)];
      return { val: fill(pat, { ...V, setting: st?.name ?? 'password' }), secret: true, from: 'The password vault. The secret itself is never shown here.' };
    }
    case 'office-hours': return missing(`${site.name}'s opening and closing times are not recorded.`);
    case 'on-site': return missing('Decided or measured on site, during setup or commissioning, so it is not recorded before. Note it on the unit afterwards.');
    case 'as-written': return { val: st?.value ?? '', from: 'The configuration: the same instruction on every unit' };
    default: return missing('This setting has no value template yet.');
  }
}

// Setup order: the index of the first setup step that mentions where a group is set.
function orderIndex(cfg, texts) {
  const steps = cfg?.setup?.length ? cfg.setup.map((s) => `${s.title} ${s.path ?? ''} ${s.detail ?? ''}`) : (cfg?.steps ?? []);
  const words = texts.flatMap((t) => segs(t).flatMap((x) => x.split(/\s*[(),/]\s*/))).map((x) => x.trim()).filter((x) => x.length >= 6 && !/^(device|settings?|system|network)$/i.test(x));
  const paths = cfg?.setup?.length ? cfg.setup.map((s) => String(s.path ?? '').split(/,\s*then\s*/i).map((p) => segs(p).join(SEP).toLowerCase())) : [];
  let best = Infinity;
  // A setup step's own menu path that starts a row's path is the strongest match.
  texts.forEach((t) => {
    const tp = segs(t).join(SEP).toLowerCase();
    paths.forEach((ps, i) => { if (ps.some((p) => p && (tp.startsWith(p) || p.startsWith(tp)))) best = Math.min(best, i); });
  });
  if (best < Infinity) return best;
  steps.forEach((s, i) => { if (words.some((w) => s.toLowerCase().includes(w.toLowerCase()))) best = Math.min(best, i); });
  return best;
}

export function buildSheet(ctx) {
  const { unit, cfg, house, site, room, vlanName = {}, systems = {}, firmware = null, platforms = [] } = ctx;
  const has = (rec) => (unit.records ?? []).includes(rec);
  const groups = [];
  let seq = 0;
  const row = (g, o) => {
    const r = { k: `${g.id}-${++seq}`, t: o.t, val: o.val ?? null, alt: o.alt ?? null, note: o.note ?? null, from: o.from ?? null, path: o.path ?? g.where, act: o.act ?? 'change', per: o.per ?? true, secret: Boolean(o.secret), missing: Boolean(o.missing), why: o.why ?? null, pattern: o.pattern ?? null, ck: o.ck ?? null };
    g.rows.push(r);
    return r;
  };
  const group = (id, o) => { const g = { id, place: o.place, where: o.where ?? o.place, title: o.title ?? o.place, stage: o.stage, at: o.at ?? 0, rows: [] }; groups.push(g); return g; };
  const nr = (why) => ({ val: null, missing: true, why });
  const roomLabel = room.number ? `${room.number} ${room.name}` : room.name;

  // 1. The asset register: the unit as it arrived.
  if (has('assetbox')) {
    const sys = systems.assetbox ?? 'The asset register';
    const g = group('asset', { place: sys, where: `${sys}${SEP}Assets`, title: 'Asset register', stage: 0 });
    const ck = { step: 'provision', rec: 'assetbox' };
    row(g, { t: 'Asset tag', act: 'verify', ck, ...(unit.tag ? { val: unit.tag, from: 'The install record' } : nr('No asset tag yet. It goes on when the unit is received.')) });
    row(g, { t: 'Serial number', act: 'verify', ck, ...(unit.serial ? { val: unit.serial, from: 'The install record' } : nr('Not recorded yet. Read it from the label when the unit arrives.')) });
    row(g, { t: 'Model', act: 'verify', ck, per: false, ...(unit.modelName ? { val: unit.modelName, from: 'The room profile' } : nr('No model is recorded for this position.')) });
    row(g, { t: 'Location', act: 'change', ck, val: `${site.name}, ${roomLabel}`, from: 'The room' });
  }
  // 2. DHCP and DNS: its name and address, before it is plugged in.
  if (has('infodns')) {
    const sys = systems.infodns ?? 'DHCP and DNS';
    const g = group('dns', { place: sys, where: `${sys}${SEP}Records`, title: 'DHCP and DNS', stage: 1 });
    const ck = { step: 'provision', rec: 'infodns' };
    row(g, { t: 'DNS name (A and PTR records)', ck, path: `${sys}${SEP}DNS`, ...(unit.host ? { val: `${unit.host}.${house.domain}`, from: 'The hostname and the house domain' } : nr('No hostname yet.')) });
    row(g, { t: 'DHCP reservation', ck, path: `${sys}${SEP}DHCP${SEP}Reservations`, ...(unit.ip ? { val: unit.ip, from: 'The site\'s address plan (simulated)' } : nr('No address reserved yet.')) });
    row(g, { t: 'MAC address for the reservation', ck, path: `${sys}${SEP}DHCP${SEP}Reservations`, ...nr('Not recorded yet. The installer reads it from the unit\'s label and records it with the serial.') });
    const dns = house.dns?.[site.region];
    row(g, { t: 'DNS servers handed out', act: 'verify', per: false, ck, path: `${sys}${SEP}DHCP${SEP}Scope options`, ...(dns ? { val: dns.join(', '), from: `The ${ctx.regionName ?? site.region} resolvers` } : nr('No DNS servers are recorded for this region.')) });
    row(g, { t: 'Time servers handed out (option 42)', act: 'verify', per: false, ck, path: `${sys}${SEP}DHCP${SEP}Scope options`, val: house.time_servers.join(', '), from: 'The house time servers' });
  }
  // 3. The switch port: the VLAN for what it is (network standard, VLAN by purpose).
  if (unit.networked) {
    const g = group('port', { place: 'The switch port', where: `Network controller${SEP}Ports`, title: 'Switch port', stage: 2 });
    const ck = { step: 'install', rec: 'online' };
    const v = (house.vlans ?? []).find((x) => x.classes.includes(unit.cls));
    row(g, { t: 'VLAN (native, untagged)', ck, per: false, ...(v ? { val: `${v.vlan}${vlanName[v.vlan] ? ` ${vlanName[v.vlan]}` : ''}`, from: 'The network standard: VLAN by purpose' } : nr(`The network standard's VLAN plan does not name ${unit.clsName ? unit.clsName.toLowerCase() : 'this kind of device'}s yet.`)) });
    row(g, { t: 'Port', act: 'verify', ck, ...(unit.port ? { val: unit.port, from: 'The port it is patched to (simulated)' } : nr('No port recorded.')) });
  }
  // 4. Firmware: at the target before the settings go on, so they land on the right version.
  if (firmware) {
    const g = group('fw', { place: firmware.where ?? 'Firmware', title: 'Firmware', stage: 3 });
    const ck = has('firmware') ? { step: 'provision', rec: 'firmware' } : null;
    const adv = (firmware.advisories ?? []).map((a) => `${a.id} (${a.levelLabel}): ${a.title}`).join('. ');
    row(g, {
      t: 'Firmware version', act: 'verify', per: false, ck,
      ...(firmware.target ? { val: firmware.target, from: firmware.from ?? 'The fleet standard', note: adv || null } : nr(`No fleet standard firmware for this model yet.${firmware.checked ? ` The configuration was checked on ${firmware.checked}.` : ''}${adv ? ` ${adv}.` : ''}`)),
    });
  }
  // 5. The management platforms: the organisation and the office's place in it (unless the configuration
  // already has a setting for it, which then carries the same values).
  const texts = (g) => [g.where ?? '', g.name ?? '', ...(g.settings ?? []).map((s) => s.path ?? '')];
  const covered = new Set((cfg?.groups ?? []).flatMap((cg) => cg.settings.filter((s) => s.derive === 'management' && s.action !== 'leave').map((s) => platformFor(platforms, s, cg)?.id)));
  for (const p of platforms.filter((x) => !covered.has(x.id))) {
    const where = `${p.name}${SEP}${p.group_label}`;
    const at = orderIndex(cfg, [p.name]);
    const g = group(`mgmt-${p.id}`, { place: p.name, where, title: p.name, stage: 4, at });
    const ck = has('fleetlens') ? { step: 'provision', rec: 'fleetlens' } : unit.steps?.includes('configure') ? { step: 'configure' } : null;
    const V = varsOf(ctx);
    row(g, { t: 'Organisation', act: 'verify', per: false, ck, val: p.org, from: 'The house values', path: `${p.name}${SEP}Organisation` });
    row(g, { t: p.group_label, ck, per: false, val: fill(p.group, V), from: `The house values, for ${site.name}` });
  }
  // 6. The configuration's own settings, where it says they live.
  for (const cg of cfg?.groups ?? []) {
    const sets = cg.settings.filter((s) => s.action !== 'leave');
    if (!sets.length) continue;
    const where = cg.where ?? cfg.managed_by ?? 'On the unit';
    const g = group(`cfg-${slugOf(cg.name)}`, { place: segs(where)[0] ?? where, where: segs(where).join(SEP), title: cg.name, stage: 4, at: orderIndex(cfg, texts(cg)) });
    for (const st of sets) {
      const ck = unit.steps?.includes('configure') ? { step: 'configure' } : null;
      const calCk = st.derive === 'calendar' && has('appstate') ? { step: 'provision', rec: 'appstate' } : ck;
      const base = { t: st.name, act: st.action, ck: calCk, path: wherePath(where, st.path), pattern: st.derive ? st.value : null };
      if (st.derive) row(g, { ...base, per: !['time-server-1', 'time-server-2', 'time-servers', 'domain', 'as-written', 'dns-servers'].includes(st.derive), ...resolve(st.derive, st, { ...ctx, group: cg }) });
      else if (st.per_device) row(g, { ...base, per: true, ...nr('This setting differs per unit but has no value template yet.'), pattern: st.value });
      else row(g, { ...base, per: false, val: st.value, from: 'The configuration, the same on every unit' });
    }
  }

  // Setup order: provisioning first (register, DHCP and DNS, the port, firmware), then the rest in the order
  // the configuration's setup steps reach them; anything the steps never name keeps its configuration order.
  groups.forEach((g, i) => { g.i = i; });
  groups.sort((a, b) => a.stage - b.stage || (a.stage === 4 ? a.at - b.at : 0) || a.i - b.i);
  groups.forEach((g, i) => { g.n = i + 1; delete g.i; });
  const rows = groups.flatMap((g) => g.rows);
  // The few values an engineer types most, for the side panel.
  const v = (house.vlans ?? []).find((x) => x.classes.includes(unit.cls));
  const facts = [
    { t: 'Hostname', val: unit.host ?? null },
    { t: 'Address', val: unit.networked ? unit.ip ?? null : null, skip: !unit.networked },
    { t: 'VLAN', val: v ? `${v.vlan}${vlanName[v.vlan] ? ` ${vlanName[v.vlan]}` : ''}` : null, skip: !unit.networked },
    { t: 'Time zone', val: site.time_zone ?? null },
    { t: 'Pairs with', val: ctx.partner?.host ?? ctx.partner?.compute ?? null, skip: !ctx.partner?.host && !(cfg?.groups ?? []).some((g) => g.settings.some((s) => ['pair', 'compute-host'].includes(s.derive))) },
    { t: 'Firmware target', val: firmware?.target ?? null, skip: !firmware },
  ].filter((f) => !f.skip);
  return {
    groups, rows, facts,
    missing: rows.filter((r) => r.missing),
    counts: { rows: rows.length, set: rows.filter((r) => r.act === 'change').length, verify: rows.filter((r) => r.act === 'verify').length, per: rows.filter((r) => r.per).length, missing: rows.filter((r) => r.missing).length },
  };
}

// The sheet as CSV (one row per setting), for the export button and the tests.
export function sheetCsv(sheet, head = {}) {
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [['Order', 'Where', 'Setting', 'Value', 'Also', 'Set or check', 'Per unit', 'Where exactly', 'From'].map(q).join(',')];
  sheet.groups.forEach((g) => g.rows.forEach((r) => {
    lines.push([g.n, g.title, r.t, r.missing ? 'Not recorded' : r.secret ? `From the password vault, ${r.val}` : r.val, r.alt ? `${r.alt.label}: ${r.alt.val}` : '', r.act === 'verify' ? 'Check' : 'Set', r.per ? 'Yes' : 'No', r.path, r.missing ? r.why : r.from].map(q).join(','));
  }));
  const top = Object.entries(head).map(([k, v]) => `${q(k)},${q(v)}`);
  return [...top, ...(top.length ? [''] : []), ...lines].join('\r\n');
}
