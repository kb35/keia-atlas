// Cross-reference checks for spares, cables and the cable standard.
//
// A schema checks one file on its own. These checks look across files: a spare in a comms room must
// name a real room at the right site, a cable must use a colour, type and purpose from the house standard
// and the colour must be the one the standard gives that purpose, and a patch cable's ends must land on
// real units in the rack it is in.
//
// Each check returns { file, at, message } like the others in crossrefs.mjs.

export function crossCheckStock(records) {
  const problems = [];
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const inFolder = (folder) => records.filter((r) => r.folder === folder);
  const siteIds = new Set(inFolder('sites').map((r) => r.id));
  const modelIds = new Set(inFolder('device-models').map((r) => r.id));
  const spaces = new Map(inFolder('spaces').map((r) => [r.id, r.data]));
  const racks = new Map(inFolder('racks').map((r) => [r.data.id, r.data]));

  // The standard: colours, types and purposes must agree with each other.
  const stdRec = inFolder('standards').find((r) => r.id === 'cables');
  const std = stdRec?.data;
  const colours = new Set((std?.colours ?? []).map((c) => c.id));
  const types = new Set((std?.cable_types ?? []).map((c) => c.id));
  const purposes = new Map((std?.purposes ?? []).map((p) => [p.id, p]));
  if ((inFolder('cables').length || inFolder('spares').length) && !std) {
    for (const rec of [...inFolder('cables')]) report(rec, [], 'the house standard data/standards/cables.yaml is missing');
  }
  if (stdRec) {
    for (const [i, p] of std.purposes.entries()) {
      if (!colours.has(p.colour)) report(stdRec, ['purposes', i, 'colour'], `colour "${p.colour}" is not in the standard's colours`);
      for (const [j, m] of p.media.entries()) if (!types.has(m)) report(stdRec, ['purposes', i, 'media', j], `cable type "${m}" is not in the standard's cable types`);
    }
    const ids = new Set();
    for (const [i, p] of std.purposes.entries()) { if (ids.has(p.id)) report(stdRec, ['purposes', i, 'id'], `purpose "${p.id}" is listed twice`); ids.add(p.id); }
  }

  // Where a thing is kept: the room and the rack, if named, must be real and at this site.
  const checkWhere = (rec, at, site, where, { needRack = false } = {}) => {
    if (where.space) {
      const sp = spaces.get(where.space);
      if (!sp) report(rec, [...at, 'space'], `room "${where.space}" does not exist`);
      else if (sp.site !== site) report(rec, [...at, 'space'], `room "${where.space}" is at site "${sp.site}", not "${site}"`);
    }
    if (where.rack) {
      const rk = racks.get(where.rack);
      if (!rk) report(rec, [...at, 'rack'], `rack "${where.rack}" does not exist`);
      else if (where.space && rk.space !== where.space) report(rec, [...at, 'rack'], `rack "${where.rack}" is in room "${rk.space}", not "${where.space}"`);
      else if (!where.space) report(rec, [...at, 'rack'], 'a rack needs its room (where.space) as well');
    } else if (needRack) {
      report(rec, at, 'a patch cable must say which rack it is in (where.rack)');
    }
  };

  // IT stores. Every office has one room whose profile is the IT store and one stock file; the minimums name real
  // models (once each), the counted stock sits on a real cabinet and shelf of the store, and ids are unique.
  const spareIds = new Map();
  const installs = new Map(inFolder('installs').map((r) => [r.data.space, r]));
  const optionOf = (sp) => spaceTypeRecs.get(sp?.space_type)?.keia_atlas.options.find((o) => o.id === sp.option);
  const spaceTypeRecs = new Map(inFolder('space-types').map((r) => [r.id, r.data]));
  const storesAt = (site) => [...spaces.entries()].filter(([, sp]) => sp.site === site && sp.space_type === 'it-store').map(([id]) => id);
  for (const rec of inFolder('sites')) {
    if (rec.data.kind !== 'office') continue;
    const n = storesAt(rec.id).length;
    if (n !== 1) report(rec, [], `an office has exactly one IT store room, and ${rec.id} has ${n}`);
    if (!inFolder('spares').some((r) => r.id === rec.id)) report(rec, [], `office ${rec.id} has no stock file data/spares/${rec.id}.yaml`);
  }
  for (const rec of inFolder('spares')) {
    const d = rec.data;
    if (d.site !== rec.id) report(rec, ['site'], `site "${d.site}" must match the file name "${rec.id}"`);
    if (!siteIds.has(d.site)) report(rec, ['site'], `site "${d.site}" does not exist`);
    const store = spaces.get(d.store);
    if (!store) report(rec, ['store'], `room "${d.store}" does not exist`);
    else if (store.site !== d.site) report(rec, ['store'], `room "${d.store}" is at site "${store.site}", not "${d.site}"`);
    else if (store.space_type !== 'it-store') report(rec, ['store'], `room "${d.store}" is a ${store.space_type}, not an IT store`);
    const shelves = new Map((optionOf(store)?.storage ?? []).map((c) => [c.name, new Set(c.shelves)]));
    const claim = (id, at) => {
      if (!id.startsWith(`${d.site}-sp-`)) report(rec, [...at, 'id'], `id "${id}" must start with "${d.site}-sp-"`);
      if (spareIds.has(id)) report(rec, [...at, 'id'], `id "${id}" is already used in ${spareIds.get(id)}`);
      spareIds.set(id, rec.rel);
    };
    const seenModel = new Set();
    d.minimums.forEach((m, i) => {
      claim(m.id, ['minimums', i]);
      if (!modelIds.has(m.model)) report(rec, ['minimums', i, 'model'], `device model "${m.model}" does not exist`);
      if (seenModel.has(m.model)) report(rec, ['minimums', i, 'model'], `model "${m.model}" already has a minimum in this store`);
      seenModel.add(m.model);
    });
    d.consumables.forEach((c, i) => {
      claim(c.id, ['consumables', i]);
      if (shelves.size && !shelves.has(c.where.cabinet)) report(rec, ['consumables', i, 'where', 'cabinet'], `"${c.where.cabinet}" is not a cabinet of ${store.space_type} / ${store.option}`);
      else if (shelves.size && !shelves.get(c.where.cabinet).has(c.where.shelf)) report(rec, ['consumables', i, 'where', 'shelf'], `"${c.where.shelf}" is not a shelf of ${c.where.cabinet}`);
    });
    (d.retired ?? []).forEach((r, i) => {
      claim(r.id, ['retired', i]);
      if (r.model && !modelIds.has(r.model)) report(rec, ['retired', i, 'model'], `device model "${r.model}" does not exist`);
    });
    // A model that has spare units in the store but no minimum is allowed (nobody has said how many to keep).
    const inst = installs.get(d.store);
    if (store && !inst) report(rec, ['store'], `room "${d.store}" has no install file, so its spare units are not recorded`);
  }

  // Cables.
  const cableIds = new Map();
  for (const rec of inFolder('cables')) {
    const d = rec.data;
    if (d.site !== rec.id) report(rec, ['site'], `site "${d.site}" must match the file name "${rec.id}"`);
    if (!siteIds.has(d.site)) report(rec, ['site'], `site "${d.site}" does not exist`);
    d.cables.forEach((c, i) => {
      const at = (...k) => ['cables', i, ...k];
      if (!c.id.startsWith(`${d.site}-cb-`)) report(rec, at('id'), `id "${c.id}" must start with "${d.site}-cb-"`);
      if (cableIds.has(c.id)) report(rec, at('id'), `id "${c.id}" is already used in ${cableIds.get(c.id)}`);
      cableIds.set(c.id, rec.rel);
      if (std) {
        if (!types.has(c.type)) report(rec, at('type'), `cable type "${c.type}" is not in the standard`);
        if (!colours.has(c.colour)) report(rec, at('colour'), `colour "${c.colour}" is not in the standard`);
        const p = purposes.get(c.purpose);
        if (!p) report(rec, at('purpose'), `purpose "${c.purpose}" is not in the standard`);
        else {
          if (types.has(c.type) && !p.media.includes(c.type)) report(rec, at('type'), `a ${c.type} cable cannot be "${p.name}": the standard allows ${p.media.join(', ')}`);
          if (c.colour !== p.colour) report(rec, at('colour'), `"${p.name}" cables are ${p.colour} in the standard, not ${c.colour}`);
        }
      }
      checkWhere(rec, at('where'), d.site, c.where, { needRack: c.role === 'patch' });
      if (c.role === 'patch') {
        if (!c.connects) report(rec, at(), 'a patch cable must say what it connects (connects)');
        if (c.minimum !== undefined || c.last_counted !== undefined) report(rec, at(), 'minimum and last_counted are for spares, not patch cables');
        const rack = racks.get(c.where.rack);
        for (const side of ['from', 'to']) {
          const e = c.connects?.[side]; if (!e) continue;
          const eAt = at('connects', side);
          if (!e.u && !e.device) report(rec, eAt, 'an end needs a rack unit (u) or a device in words');
          const er = e.rack ? racks.get(e.rack) : rack;
          if (e.rack && !er) report(rec, [...eAt, 'rack'], `rack "${e.rack}" does not exist`);
          if (e.u && er) {
            const item = er.items.find((it) => e.u >= it.u && e.u < it.u + it.size);
            if (!item) report(rec, [...eAt, 'u'], `nothing is mounted at U${e.u} in rack "${er.id}"`);
            else if (['blank', 'reserved', 'cable-manager'].includes(item.kind)) report(rec, [...eAt, 'u'], `U${e.u} in rack "${er.id}" is ${item.kind === 'cable-manager' ? 'a cable manager' : item.kind}, which has no ports`);
            else if (e.ports && ['patch-panel', 'fibre-panel'].includes(item.kind) && item.ports) {
              const hi = Number(String(e.ports).split('-').pop());
              if (hi > item.ports) report(rec, [...eAt, 'ports'], `"${item.label}" at U${e.u} has ${item.ports} ports, not ${hi}`);
            }
          }
          const m = /^(\d+)(?:-(\d+))?$/.exec(e.ports ?? '');
          if (m && m[2]) {
            const n = Number(m[2]) - Number(m[1]) + 1;
            if (n < 2) report(rec, [...eAt, 'ports'], `port range ${e.ports} must count upwards`);
            else if (n !== c.quantity) report(rec, [...eAt, 'ports'], `port range ${e.ports} is ${n} ports but the quantity is ${c.quantity}`);
          }
        }
      } else {
        if (c.minimum === undefined) report(rec, at(), 'a spare cable needs a minimum');
        if (!c.last_counted) report(rec, at(), 'a spare cable needs a last_counted date');
        if (!c.where.cabinet || !c.where.shelf) report(rec, at('where'), 'a spare cable needs its cabinet and shelf');
        if (c.connects) report(rec, at('connects'), 'a spare cable connects nothing yet: leave connects out');
      }
    });
  }

  return problems;
}
