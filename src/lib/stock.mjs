// Spares and cables, joined with sites, rooms, racks and models, and the house cable standard.
// Loaded once at build time (the validator has already checked every link, so this trusts the data).
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { loadYaml } from './demo-clock.mjs';
import { sites, spaces, racks, models, SITE_ORDER, DEMO_TODAY, STAGE_LABEL, modelName, className } from './data.mjs';
import { isLow, shortBy, countOverdue, daysBetween, endLabel, formatLength, rackNumber } from './cablecore.mjs';

export { SPARE_KIND, COUNT_OVERDUE_DAYS, formatLength, rackNumber, portLabel } from './cablecore.mjs';

const load = (folder) => {
  const dir = path.join(process.cwd(), 'data', folder);
  return Object.fromEntries(readdirSync(dir).filter((n) => n.endsWith('.yaml')).sort().map((n) => [n.slice(0, -5), loadYaml(path.join(dir, n))]));
};

export const cableStandard = load('standards').cables;
export const colours = Object.fromEntries(cableStandard.colours.map((c) => [c.id, c]));
export const cableTypes = Object.fromEntries(cableStandard.cable_types.map((c) => [c.id, c]));
export const purposes = Object.fromEntries(cableStandard.purposes.map((p) => [p.id, p]));

const spareFiles = load('spares');
const cableFiles = load('cables');
const siteInfo = (sid) => ({ site: sid, siteName: sites[sid].name, siteCode: sites[sid].code, region: sites[sid].region ?? 'remote', city: sites[sid].city ?? '' });
const spaceOf = (id) => (id ? spaces[id] ?? null : null);
const whereText = (w) => [w.room, w.cabinet, w.shelf].filter(Boolean).join(', ');

// IT stores. Each office has one room whose profile is the IT store. Its spare UNITS are units with the status
// Spare in the room's install (they have serials, asset tags and unit pages); the least to keep of each model
// and the counted stock without serial numbers (cords, mounts, modules) are in data/spares/<site>.yaml.
const plainWhere = (space, cabinet, shelf) => ({ room: `${space.name} ${space.number}`, space: space.id, cabinet, shelf });
export const stores = SITE_ORDER.filter((sid) => spareFiles[sid]).map((sid) => {
  const file = spareFiles[sid];
  const space = spaces[file.store];
  const lastCounted = file.last_counted;
  const storeOverdue = countOverdue(lastCounted, DEMO_TODAY);
  // The spare units on the shelves, each linking to its unit page.
  const units = (space.spareKit ?? []).map((p) => {
    const u = p.current;
    return {
      tag: u.asset_tag, serial: u.serial, model: p.model, modelName: modelName(p.model), cls: p.cls, className: className(p.cls), arrived: u.arrived,
      cabinet: p.cabinet, shelf: p.shelf, notes: u.notes ?? null, stage: u.stage, status: STAGE_LABEL[u.stage], site: sid, store: space.id, unitHref: `/device/?tag=${u.asset_tag}`,
    };
  });
  // The minimum rules: per model, with the units the store holds of it.
  const rules = file.minimums.map((m) => {
    const mine = units.filter((u) => u.model === m.model);
    const have = mine.length;
    const low = isLow(have, m.minimum);
    const shelfCounts = {};
    for (const u of mine) shelfCounts[`${u.cabinet}|${u.shelf}`] = (shelfCounts[`${u.cabinet}|${u.shelf}`] ?? 0) + 1;
    const top = Object.entries(shelfCounts).sort((a, b) => b[1] - a[1])[0]?.[0].split('|') ?? [];
    return {
      id: m.id, model: m.model, modelName: modelName(m.model), modelClass: models[m.model]?.class ?? null, minimum: m.minimum, have, low, short: low ? shortBy(have, m.minimum) : 0,
      out: have === 0 && m.minimum > 0, notes: m.notes ?? null, cabinet: top[0] ?? null, shelf: top[1] ?? null, tags: mine.map((u) => u.tag),
    };
  });
  const ruled = new Set(rules.map((r) => r.model));
  const unruled = [...new Set(units.filter((u) => !ruled.has(u.model)).map((u) => u.model))].map((m) => ({ model: m, modelName: modelName(m), have: units.filter((u) => u.model === m).length }));
  // Counted stock: no serial numbers, so counted against a minimum.
  const consumables = file.consumables.map((c) => {
    const low = isLow(c.quantity, c.minimum);
    return {
      ...c, ...siteInfo(sid), low, short: low ? shortBy(c.quantity, c.minimum) : 0, out: c.quantity === 0,
      overdue: countOverdue(c.last_counted, DEMO_TODAY), countedDays: daysBetween(c.last_counted, DEMO_TODAY),
      where: plainWhere(space, c.where.cabinet, c.where.shelf), whereText: `${c.where.cabinet}, ${c.where.shelf}`,
    };
  });
  const retired = (file.retired ?? []).map((r) => ({ ...r, modelName: r.model ? modelName(r.model) : null, site: sid }));
  // The cabinets and shelves of the room profile's option, with what is on each shelf.
  const cabinets = (space.option.storage ?? []).map((cab) => ({
    key: cab.key, name: cab.name,
    shelves: cab.shelves.map((sh) => ({ name: sh, units: units.filter((u) => u.cabinet === cab.name && u.shelf === sh), lines: consumables.filter((c) => c.where.cabinet === cab.name && c.where.shelf === sh) })),
  }));
  const lowRules = rules.filter((r) => r.low), lowLines = consumables.filter((c) => c.low);
  return {
    ...siteInfo(sid), id: space.id, space, number: space.number, name: space.name, floor: space.floor, option: space.option, optionName: space.option.name,
    href: `/spares/${sid}/`, roomHref: `/rooms/${space.id}/`, lastCounted, countedDays: daysBetween(lastCounted, DEMO_TODAY), overdue: storeOverdue || consumables.some((c) => c.overdue),
    units, rules, unruled, consumables, retired, cabinets, low: lowRules.length + lowLines.length, lowRules, lowLines,
    shelfCount: cabinets.reduce((n, c) => n + c.shelves.length, 0),
  };
});
export const storeOf = (sid) => stores.find((s) => s.site === sid) ?? null;
export const spareUnits = stores.flatMap((s) => s.units);
export const lowStores = stores.filter((s) => s.low > 0);

// Stock lines in the shape search and the older pages read: one per model rule (units held against the minimum)
// and one per counted line. Archived lines stay in the data, out of the counts.
export const spareLines = stores.flatMap((st) => [
  ...st.rules.map((r) => ({
    id: r.id, what: r.modelName, kind: 'device', model: r.model, quantity: r.have, minimum: r.minimum, notes: r.notes, archived: null, ...siteInfo(st.site),
    where: plainWhere(st.space, r.cabinet ?? '', r.shelf ?? ''), last_counted: st.lastCounted, low: r.low, short: r.short, out: r.out,
    overdue: countOverdue(st.lastCounted, DEMO_TODAY), countedDays: st.countedDays, modelName: r.modelName, modelClass: r.modelClass, roomHref: st.roomHref, whereText: [st.name, st.number].join(' '),
  })),
  ...st.consumables.map((c) => ({ ...c, archived: null, modelName: null, modelClass: null, roomHref: st.roomHref, where: { ...c.where, room: `${st.name} ${st.number}` } })),
  ...st.retired.map((r) => ({ ...r, quantity: 0, minimum: 0, kind: 'device', ...siteInfo(st.site), low: false, short: 0, out: false, overdue: false, where: plainWhere(st.space, '', ''), roomHref: st.roomHref })),
]);
export const activeSpares = spareLines.filter((s) => !s.archived);
export const archivedSpares = spareLines.filter((s) => s.archived);
export const lowSpares = activeSpares.filter((s) => s.low);

// Cables: patch cables in racks and spare cables in stores.
export const cableLines = SITE_ORDER.flatMap((sid) => (cableFiles[sid]?.cables ?? []).map((c) => {
  const sp = spaceOf(c.where.space);
  const ctx = { code: sites[sid].code, room: sp?.number ?? '', rack: c.where.rack };
  const col = colours[c.colour], type = cableTypes[c.type], pur = purposes[c.purpose];
  const spare = c.role === 'spare';
  const low = spare && !c.archived && isLow(c.quantity, c.minimum);
  return {
    ...c, ...siteInfo(sid), archived: c.archived ?? null,
    hex: col.hex, colourName: col.name, ink: col.ink, typeLabel: type.label, typeGroup: type.group, purposeName: pur.name, coded: pur.coded !== false,
    from: c.connects ? endLabel(ctx, c.connects.from) : '', to: c.connects ? endLabel(ctx, c.connects.to) : '',
    fromU: c.connects?.from?.u ?? null, toU: c.connects?.to?.u ?? null,
    low, short: low ? shortBy(c.quantity, c.minimum) : 0,
    overdue: spare && !c.archived && countOverdue(c.last_counted, DEMO_TODAY),
    roomHref: sp ? `/rooms/${sp.id}/` : null, whereText: spare ? whereText(c.where) : `${c.where.room}, rack ${rackNumber(c.where.rack)}`,
    lengthText: formatLength(c.length_m),
  };
}));
export const activeCables = cableLines.filter((c) => !c.archived);
export const patchCables = activeCables.filter((c) => c.role === 'patch');
export const spareCables = activeCables.filter((c) => c.role === 'spare');
export const cablesInRack = (rackId) => patchCables.filter((c) => c.where.rack === rackId);
export const cableTotal = (list) => list.reduce((n, c) => n + c.quantity, 0);
