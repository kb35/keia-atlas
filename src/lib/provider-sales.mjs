// Winning the work, in a provider's own Keia (docs/service-providers.md, section 7): opportunities, a design drawn
// from the space types and the device library, the bill of materials, labour from the setup guides, the quote with
// its versions, the statement of work, and the handoff that turns an accepted quote into the client's project.
//
// The edge is the unbroken thread: design, quote, statement of work, accepted, the client's project, build sheets,
// as-built. Nothing is typed twice. Each line says where it came from:
//   standard   the space type's build option names it
//   library    the space type names only a class (a 65 inch display); the design picked the model from the library
//   changed    the person changed it: a quantity, another model, an item not in the library yet, an optional line
//
// Pure: no files are read here, so the tests and the page's own script can run the same maths. The loader
// (src/lib/provider-sales-data.mjs) reads the YAML and passes it in as `lib`:
//   lib.spaceTypes {id: space type}   lib.models {id: model}   lib.classes {id: class}   lib.guides [setup guide]
//   lib.spaces {id: space}            lib.prices {model: {cost, sell}}
// Money is in whole currency units, rounded to the cent at each line. Every price is fictional (demo).

// ---- Words ------------------------------------------------------------------------------------------------------
export const MARKS = {
  standard: { word: 'Standard', long: 'From the space type\'s standard' },
  library: { word: 'Library', long: 'Picked from the device library' },
  changed: { word: 'Changed', long: 'Changed by the person' },
};
export const LABOUR_MARKS = {
  guide: { word: 'Setup guide', long: 'Worked out from the model\'s setup guide' },
  task: { word: 'Task type', long: 'From the task type\'s time' },
  changed: { word: 'Changed', long: 'Changed by the person' },
};
export const STAGES = [
  { id: 'lead', word: 'Lead', what: 'Raised, not surveyed yet' },
  { id: 'design', word: 'Design', what: 'Surveyed; the design is being drawn' },
  { id: 'quoted', word: 'Quoted', what: 'A quote is with the client' },
  { id: 'accepted', word: 'Accepted', what: 'Won: it is the client\'s project now' },
  { id: 'lost', word: 'Lost', what: 'Not going ahead' },
];
export const TASK_WORDS = { install: 'Install', configure: 'Configure', commission: 'Commission', manage: 'Manage the project' };
export const STATUS_WORDS = { draft: 'Planned · draft, not sent', sent: 'In progress · with the client', superseded: 'Off · replaced by a later version', accepted: 'Fine · accepted' };

// The order lines are listed in: what people see first in a room, then what sits behind it.
const CLASS_ORDER = ['display', 'monitor', 'video-bar', 'codec', 'touch-controller', 'camera', 'microphone', 'scheduler-panel', 'signage-player', 'av-extender', 'adapter'];
const classRank = (c) => { const i = CLASS_ORDER.indexOf(c); return i < 0 ? CLASS_ORDER.length : i; };

// ---- Numbers ----------------------------------------------------------------------------------------------------
export const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Minutes to hours, to the nearest quarter hour. */
export const quarterHours = (min) => Math.round(min / 15) / 4;
/** Margin on one line or a total: the amount, and the share of the sell price (to one decimal). */
export function margin(cost, sell) {
  const m = r2(sell - cost);
  return { margin: m, marginPct: sell ? Math.round((m / sell) * 1000) / 10 : 0 };
}
const SYM = { USD: '$', EUR: '€', GBP: '£' };
/** $12,345 or $1,282.50: cents only when there are some. */
export function money(n, cur = 'USD') {
  if (n == null || Number.isNaN(n)) return 'Not priced';
  const neg = n < 0, v = Math.abs(r2(n));
  const whole = Number.isInteger(v);
  const s = v.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  return `${neg ? '−' : ''}${SYM[cur] ?? ''}${s}`;
}
export const pctWords = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;
export const hoursWords = (h) => `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')} h`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- The library ----------------------------------------------------------------------------------------------------
export const modelName = (lib, id) => (lib.models[id] ? `${lib.models[id].manufacturer} ${lib.models[id].model}` : id);
export const className = (lib, id) => lib.classes?.[id]?.profile?.name ?? String(id).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
/** A display's size in inches, from its model's summary ("A 65 inch 4K commercial display"). Null when not stated. */
export function displaySize(model) {
  const m = /(\d{2,3})\s*inch/i.exec(model?.summary ?? '');
  return m ? Number(m[1]) : null;
}
/** The setup guide for a model, if the library has one. */
export const guideFor = (lib, modelId) => (lib.guides ?? []).find((g) => (g.models ?? []).includes(modelId)) ?? null;
/** How many settings a setup guide sets or checks: every setting it does not leave at the default. */
export const guideSettings = (g) => g?.settingsCount ?? (g?.groups ?? []).reduce((n, gr) => n + (gr.settings ?? []).filter((s) => s.action !== 'leave').length, 0);
/** A setup guide cut down to what the labour estimate reads, for a page's own script. */
export const slimGuide = (g) => (g ? { id: g.id, name: g.name, settingsCount: guideSettings(g) } : null);
const sizesWords = (sizes) => (sizes.length === 1 ? `${sizes[0]}` : `${sizes.slice(0, -1).join(', ')} or ${sizes[sizes.length - 1]}`);

/** For a line whose space type names only a class: the model the library offers. A display with sizes takes the
    smallest size the space type allows that the library has, at the smallest listed size first. */
export function pickFromLibrary(lib, e) {
  const of = Object.entries(lib.models).filter(([id, m]) => m.class === e.class && lib.prices?.[id]);
  if (e.sizes_in?.length) {
    for (const size of [...e.sizes_in].sort((a, b) => a - b)) {
      const hit = of.filter(([, m]) => displaySize(m) === size).sort(([a], [b]) => a.localeCompare(b))[0];
      if (hit) return { id: hit[0], size };
    }
    return null;
  }
  const first = of.sort(([a], [b]) => a.localeCompare(b))[0];
  return first ? { id: first[0] } : null;
}

// ---- Versions -------------------------------------------------------------------------------------------------------
/** A version with everything it inherits: the changes of the version it extends, then its own (later wins). */
export function resolveVersion(opp, v) {
  const list = opp.versions ?? [];
  const V = list.find((x) => x.v === v);
  if (!V) return null;
  const seen = new Set();
  const chain = [];
  for (let cur = V; cur && !seen.has(cur.v); cur = cur.extends ? list.find((x) => x.v === cur.extends) : null) { seen.add(cur.v); chain.unshift(cur); }
  const labour = new Map();
  for (const c of chain) for (const l of c.labour_changes ?? []) labour.set(`${l.task}:${l.class ?? '*'}`, l);
  return { ...V, changes: chain.flatMap((c) => c.changes ?? []), labour_changes: [...labour.values()], options: V.options ?? [], discount: V.discount ?? null };
}
/** The version a client has, or had last: accepted, else sent, else the latest. */
export function currentVersion(opp) {
  const list = [...(opp.versions ?? [])].sort((a, b) => b.v - a.v);
  return list.find((x) => x.status === 'accepted') ?? list.find((x) => x.status === 'sent') ?? list[0] ?? null;
}

// ---- The design: spaces, their space types, and the lines each gets ---------------------------------------------------
function spaceLabel(s, rec) {
  const number = rec?.number ?? s.number;
  const name = rec?.name ?? s.name ?? s.space;
  return { number: number ?? '', name, label: number ? `${number} ${name}` : name };
}

/** One line of a room: the space type's equipment entry, resolved to a model, then the person's changes on top. */
export function resolveLine(lib, e, changes = []) {
  const line = {
    key: e.key, cls: e.class, clsName: className(lib, e.class), role: e.role ?? null, location: e.location ?? null,
    optional: e.requirement === 'optional', included: e.requirement !== 'optional', qty: Number(e.quantity) || 1,
    model: e.model ?? null, item: null, cost: null, sell: null, source: e.model ? 'standard' : 'library', why: '', was: null, unresolved: false,
  };
  if (!e.model) {
    const pick = pickFromLibrary(lib, e);
    if (pick) {
      line.model = pick.id;
      line.why = e.sizes_in?.length ? `The space type asks for ${sizesWords(e.sizes_in)} inch; the library's ${pick.size} inch display` : `The space type names a ${line.clsName.toLowerCase()}; the library's one`;
    } else {
      line.unresolved = true;
      line.why = e.sizes_in?.length ? `No ${sizesWords(e.sizes_in)} inch ${line.clsName.toLowerCase()} is in the device library` : `No ${line.clsName.toLowerCase()} is in the device library`;
    }
  } else line.why = 'Named by the space type\'s build option';
  const nameOf = () => (line.item ?? (line.model ? modelName(lib, line.model) : `${line.clsName}, not chosen`));
  for (const c of changes) {
    if (c.add) { line.included = true; line.source = 'changed'; line.was = 'Optional in the space type'; line.why = c.why; }
    if (c.model) { line.was = `${MARKS[line.source === 'changed' ? 'standard' : line.source].word}: ${nameOf()}`; line.model = c.model; line.item = null; line.unresolved = false; line.source = 'changed'; line.why = c.why; }
    if (c.item) { line.was = line.unresolved ? line.why : `${MARKS[line.source === 'changed' ? 'standard' : line.source].word}: ${nameOf()}`; line.item = c.item; line.model = null; line.cost = c.cost ?? null; line.sell = c.sell ?? null; line.unresolved = false; line.source = 'changed'; line.why = c.why; line.notInLibrary = true; }
    if (c.qty != null) { line.was = line.was ?? `Standard: ${line.qty}`; line.qty = c.qty; line.source = 'changed'; line.why = c.why; line.included = line.included || c.qty > 0; }
  }
  if (line.model && lib.prices?.[line.model]) { line.cost = lib.prices[line.model].cost; line.sell = lib.prices[line.model].sell; }
  line.name = nameOf();
  line.id = line.model ?? (line.item ? `item-${slug(line.item)}` : `none-${line.cls}`);
  line.guide = line.model ? guideFor(lib, line.model) : null;
  return line;
}

/** The rooms of a design at one version: each space, its space type and option, and its lines. */
export function designRooms(opp, vNum, lib) {
  const V = vNum ? resolveVersion(opp, vNum) : { changes: [] };
  const changes = V?.changes ?? [];
  return (opp.design?.spaces ?? []).map((s) => {
    const rec = lib.spaces?.[s.space] ?? null;
    const T = lib.spaceTypes[s.space_type];
    if (!T) throw new Error(`provider-sales: no space type "${s.space_type}" for ${s.space}`);
    const optCh = changes.filter((c) => c.space === s.space && c.option).at(-1);
    const optionId = optCh?.option ?? s.option;
    const O = T.keia_atlas.options.find((o) => o.id === optionId);
    if (!O) throw new Error(`provider-sales: space type ${s.space_type} has no option "${optionId}"`);
    const all = O.equipment.map((e) => resolveLine(lib, e, changes.filter((c) => c.space === s.space && c.key === e.key)));
    const lines = all.filter((l) => l.included && l.qty > 0);
    const removed = all.filter((l) => l.source === 'changed' && l.qty === 0);
    const optional = all.filter((l) => !l.included);
    const units = lines.reduce((n, l) => n + l.qty, 0);
    const priced = (k) => r2(lines.reduce((n, l) => n + (l[k] ?? 0) * l.qty, 0));
    const optionOf = (id) => T.keia_atlas.options.find((o) => o.id === id)?.name ?? id;
    return {
      space: s.space, ...spaceLabel(s, rec), site: rec?.site ?? opp.site, inRecords: !!rec,
      typeId: s.space_type, typeName: T.profile.name, capacity: T.profile.capacity ?? null,
      optionId, optionName: O.name, optionSummary: O.summary ?? '',
      optionWas: optCh ? optionOf(s.option) : null, optionWhy: optCh?.why ?? null,
      recordedOption: rec?.option && rec.option !== optionId ? optionOf(rec.option) : null,
      lines, removed, optional, units, cost: priced('cost'), sell: priced('sell'),
      changed: lines.filter((l) => l.source === 'changed').length + removed.length + (optCh ? 1 : 0),
      verification: T.verification_model?.platforms_to_check ?? [],
      infrastructure: O.infrastructure ?? [],
    };
  });
}

/** The project bill of materials: every room's lines rolled up by model (or item), with the rooms each is in and
    the marks it carries. Totals count units and add up cost and sell; an unpriced line is counted, never guessed. */
export function rollUp(rooms) {
  const map = new Map();
  for (const room of rooms) for (const l of room.lines) {
    const x = map.get(l.id) ?? { id: l.id, model: l.model, item: l.item, name: l.name, cls: l.cls, clsName: l.clsName, qty: 0, unitCost: l.cost, unitSell: l.sell, rooms: [], marks: {}, notInLibrary: !!l.notInLibrary, unresolved: l.unresolved };
    x.qty += l.qty;
    x.rooms.push({ space: room.space, label: room.label, qty: l.qty });
    x.marks[l.source] = (x.marks[l.source] ?? 0) + l.qty;
    map.set(l.id, x);
  }
  const lines = [...map.values()].map((x) => ({
    ...x,
    cost: x.unitCost == null ? null : r2(x.unitCost * x.qty),
    sell: x.unitSell == null ? null : r2(x.unitSell * x.qty),
    mark: x.marks.changed ? 'changed' : x.marks.library ? 'library' : 'standard',
  })).sort((a, b) => classRank(a.cls) - classRank(b.cls) || a.name.localeCompare(b.name));
  const sum = (k) => r2(lines.reduce((n, l) => n + (l[k] ?? 0), 0));
  return {
    lines,
    totals: {
      units: lines.reduce((n, l) => n + l.qty, 0), lines: lines.length, cost: sum('cost'), sell: sum('sell'),
      unpriced: lines.filter((l) => l.unitSell == null).length,
      marks: Object.fromEntries(Object.keys(MARKS).map((m) => [m, lines.reduce((n, l) => n + (l.marks[m] ?? 0), 0)])),
    },
  };
}

// ---- Labour ---------------------------------------------------------------------------------------------------------
/** Roles with any rates the person changed laid over the price list's. */
export const withRates = (roles, rates = {}) => roles.map((r) => ({ ...r, ...(rates[r.id] ?? {}) }));

/** Hours for the work, from the task types and the setup guides: install each unit, configure each unit to its
    setup guide, commission each room, and manage the project as a share of the rest. */
export function estimateLabour(rooms, L, lib, labourChanges = []) {
  const T = L.tasks;
  const over = (task, cls) => labourChanges.find((c) => c.task === task && (c.class ?? null) === (cls ?? null)) ?? labourChanges.find((c) => c.task === task && !c.class) ?? null;
  const tasks = [];
  const gaps = [];
  const push = (t) => tasks.push({ ...t, hours: quarterHours(t.minutes) });
  for (const room of rooms) {
    for (const l of room.lines) {
      const ch = over('install', l.cls);
      const each = ch ? ch.minutes : (T.install.minutes_by_class[l.cls] ?? T.install.default_minutes);
      push({ task: 'install', space: room.space, room: room.label, what: `${l.qty} × ${l.name}`, lineId: l.id, cls: l.cls, qty: l.qty, each, minutes: each * l.qty, role: T.install.role,
        source: ch ? 'changed' : 'task', basis: ch ? ch.why : `Install a ${l.clsName.toLowerCase()}: ${each} min each` });
      if (l.guide) {
        const n = guideSettings(l.guide);
        const ch2 = over('configure', l.cls);
        const eachC = ch2 ? ch2.minutes : T.configure.base_minutes + T.configure.per_setting_minutes * n;
        push({ task: 'configure', space: room.space, room: room.label, what: `${l.qty} × ${l.name}`, lineId: l.id, cls: l.cls, qty: l.qty, each: eachC, minutes: eachC * l.qty, role: T.configure.role,
          source: ch2 ? 'changed' : 'guide', guide: { id: l.guide.id, name: l.guide.name, settings: n },
          basis: ch2 ? ch2.why : `Setup guide "${l.guide.name}": ${n} settings to set or check, ${T.configure.base_minutes} min plus ${T.configure.per_setting_minutes} min a setting` });
      } else if (l.notInLibrary || !l.model) {
        gaps.push({ space: room.space, room: room.label, what: l.name, why: 'Not in the device library, so no setup guide: its configure time is not estimated' });
      }
    }
    const ch3 = over('commission', null);
    const eachR = ch3 ? ch3.minutes : T.commission.base_minutes + T.commission.per_unit_minutes * room.units;
    push({ task: 'commission', space: room.space, room: room.label, what: `Test ${room.label} against its space type`, qty: 1, each: eachR, minutes: eachR, role: T.commission.role,
      source: ch3 ? 'changed' : 'task', basis: ch3 ? ch3.why : `${T.commission.base_minutes} min a room, plus ${T.commission.per_unit_minutes} min for each of its ${room.units} units` });
  }
  const other = tasks.reduce((n, t) => n + t.hours, 0);
  const pm = quarterHours((other * 60 * T.manage.share_pct) / 100);
  tasks.push({ task: 'manage', space: null, room: null, what: 'Project management', qty: 1, each: pm * 60, minutes: pm * 60, hours: pm, role: T.manage.role, source: 'task', basis: `${T.manage.share_pct}% of the other ${hoursWords(other)}` });
  return summariseLabour(tasks, L, rooms, gaps);
}

/** Hours by role, room and task, priced at the roles' rates (pass `rates` to price at rates the person changed). */
export function summariseLabour(tasks, L, rooms = [], gaps = [], rates = {}) {
  const roles = withRates(L.roles, rates);
  const byRole = roles.map((r) => {
    const hours = tasks.filter((t) => t.role === r.id).reduce((n, t) => n + t.hours, 0);
    return { id: r.id, name: r.name, rateCost: r.cost, rateSell: r.sell, hours, cost: r2(hours * r.cost), sell: r2(hours * r.sell) };
  }).filter((r) => r.hours > 0);
  const byTask = ['install', 'configure', 'commission', 'manage'].map((k) => ({ task: k, word: TASK_WORDS[k], hours: tasks.filter((t) => t.task === k).reduce((n, t) => n + t.hours, 0) }));
  const byRoom = rooms.map((r) => ({ space: r.space, label: r.label, hours: tasks.filter((t) => t.space === r.space).reduce((n, t) => n + t.hours, 0) }));
  const hours = byRole.reduce((n, r) => n + r.hours, 0);
  const crew = L.crew;
  const h = (k) => byTask.find((t) => t.task === k).hours;
  const days = { install: Math.ceil(h('install') / (crew.installers * crew.hours_per_day)), configure: Math.ceil(h('configure') / crew.hours_per_day), commission: Math.ceil(h('commission') / crew.hours_per_day) };
  return { tasks, byRole, byTask, byRoom, gaps, days, totals: { hours, cost: r2(byRole.reduce((n, r) => n + r.cost, 0)), sell: r2(byRole.reduce((n, r) => n + r.sell, 0)) } };
}

// ---- The quote ------------------------------------------------------------------------------------------------------
/** Cost, sell and margin by line and in total: the equipment from the BOM, the allowance for mounts and cables,
    the labour by role, then any discount (on labour, equipment or all). */
export function priceQuote({ bom, labour, priceList, discount = null }) {
  const lines = [];
  for (const l of bom.lines) lines.push({ kind: 'equipment', id: l.id, name: l.name, cls: l.cls, qty: l.qty, unit: 'each', unitCost: l.unitCost, unitSell: l.unitSell, cost: l.cost, sell: l.sell, mark: l.mark, notInLibrary: l.notInLibrary, ...margin(l.cost ?? 0, l.sell ?? 0) });
  const eqCost = r2(lines.reduce((n, l) => n + (l.cost ?? 0), 0));
  const eqSell = r2(lines.reduce((n, l) => n + (l.sell ?? 0), 0));
  const A = priceList.allowance;
  const alCost = Math.round((eqCost * A.pct) / 100);
  const alSell = Math.round(alCost * (1 + A.markup_pct / 100));
  lines.push({ kind: 'allowance', id: 'allowance', name: A.what, qty: 1, unit: 'lot', unitCost: alCost, unitSell: alSell, cost: alCost, sell: alSell, basis: `${A.pct}% of the equipment's cost, plus ${A.markup_pct}%`, ...margin(alCost, alSell) });
  for (const r of labour.byRole) lines.push({ kind: 'labour', id: r.id, name: r.name, qty: r.hours, unit: 'h', unitCost: r.rateCost, unitSell: r.rateSell, cost: r.cost, sell: r.sell, ...margin(r.cost, r.sell) });
  const group = (kinds) => {
    const ls = lines.filter((l) => kinds.includes(l.kind));
    const cost = r2(ls.reduce((n, l) => n + (l.cost ?? 0), 0)), sell = r2(ls.reduce((n, l) => n + (l.sell ?? 0), 0));
    return { cost, sell, ...margin(cost, sell) };
  };
  const equipment = group(['equipment', 'allowance']), work = group(['labour']), before = group(['equipment', 'allowance', 'labour']);
  let off = null;
  if (discount?.pct) {
    const base = discount.on === 'labour' ? work.sell : discount.on === 'equipment' ? equipment.sell : before.sell;
    off = { ...discount, base, amount: r2((base * discount.pct) / 100) };
  }
  const sell = r2(before.sell - (off?.amount ?? 0));
  return { lines, equipment, labour: work, before, discount: off, totals: { cost: before.cost, sell, ...margin(before.cost, sell) }, unpriced: lines.filter((l) => l.unitSell == null).length };
}

/** An option: lines the space types mark optional, added to named rooms, priced on their own (equipment, the
    allowance on it, install and configure time, the extra commissioning and its share of management). Never in the
    total until the client takes it. */
export function priceOption(opt, rooms, lib, L, priceList) {
  const add = [];
  for (const a of opt.adds) {
    const room = rooms.find((r) => r.space === a.space);
    if (!room) throw new Error(`provider-sales: option ${opt.id} names ${a.space}, which is not in the design`);
    const T = lib.spaceTypes[room.typeId];
    const e = T.keia_atlas.options.find((o) => o.id === room.optionId).equipment.find((x) => x.key === a.key);
    if (!e) throw new Error(`provider-sales: option ${opt.id}: ${room.typeId} (${room.optionId}) has no "${a.key}"`);
    const line = resolveLine(lib, { ...e, requirement: 'required', quantity: a.qty ?? e.quantity });
    add.push({ ...line, space: room.space, room: room.label, source: 'standard' });
  }
  const pseudo = rooms.filter((r) => add.some((l) => l.space === r.space)).map((r) => ({ ...r, lines: add.filter((l) => l.space === r.space), units: add.filter((l) => l.space === r.space).reduce((n, l) => n + l.qty, 0) }));
  const lab = estimateLabour(pseudo, { ...L, tasks: { ...L.tasks, commission: { ...L.tasks.commission, base_minutes: 0 } } }, lib);
  const bom = rollUp(pseudo);
  const q = priceQuote({ bom, labour: lab, priceList });
  return { id: opt.id, title: opt.title, why: opt.why ?? '', lines: add, units: bom.totals.units, hours: lab.totals.hours, equipment: q.equipment, labour: q.labour, cost: q.totals.cost, sell: q.totals.sell, margin: q.totals.margin, marginPct: q.totals.marginPct };
}

/** One version, worked out whole: its rooms, BOM, labour, quote, options and validity. */
export function quoteVersion(opp, v, ctx) {
  const { lib, labour: L, priceList, terms } = ctx;
  const V = resolveVersion(opp, v);
  const rooms = designRooms(opp, v, lib);
  const bom = rollUp(rooms);
  const lab = estimateLabour(rooms, L, lib, V.labour_changes);
  const quote = priceQuote({ bom, labour: lab, priceList, discount: V.discount });
  const options = V.options.map((o) => priceOption(o, rooms, lib, L, priceList));
  return { v: V.v, date: V.date, status: V.status, note: V.note ?? '', validUntil: addDays(V.date, terms.validity_days), changes: V.changes, labourChanges: V.labour_changes, discount: V.discount, rooms, bom, labour: lab, quote, options };
}

export function addDays(d, n) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

// ---- Versions compared ----------------------------------------------------------------------------------------------
/** What changed from one version to the next: lines added, taken out and changed, the rooms whose build changed,
    options, the discount and the totals. */
export function diffQuotes(a, b) {
  const key = (l) => `${l.kind}:${l.id}`;
  const A = new Map(a.quote.lines.map((l) => [key(l), l]));
  const B = new Map(b.quote.lines.map((l) => [key(l), l]));
  const added = [...B].filter(([k]) => !A.has(k)).map(([, l]) => ({ kind: l.kind, id: l.id, name: l.name, qty: l.qty, sell: l.sell }));
  const removed = [...A].filter(([k]) => !B.has(k)).map(([, l]) => ({ kind: l.kind, id: l.id, name: l.name, qty: l.qty, sell: l.sell }));
  const changed = [...B].filter(([k, l]) => A.has(k) && (A.get(k).qty !== l.qty || A.get(k).sell !== l.sell)).map(([k, l]) => {
    const o = A.get(k);
    return { kind: l.kind, id: l.id, name: l.name, qtyA: o.qty, qtyB: l.qty, sellA: o.sell, sellB: l.sell, delta: r2((l.sell ?? 0) - (o.sell ?? 0)) };
  });
  const rooms = b.rooms.map((r) => {
    const o = a.rooms.find((x) => x.space === r.space);
    return o && o.optionId !== r.optionId ? { space: r.space, label: r.label, from: o.optionName, to: r.optionName } : null;
  }).filter(Boolean);
  const optsA = new Map(a.options.map((o) => [o.id, o])), optsB = new Map(b.options.map((o) => [o.id, o]));
  const options = {
    added: [...optsB.values()].filter((o) => !optsA.has(o.id)).map((o) => ({ id: o.id, title: o.title, sell: o.sell })),
    removed: [...optsA.values()].filter((o) => !optsB.has(o.id)).map((o) => ({ id: o.id, title: o.title, sell: o.sell })),
  };
  const discount = (a.quote.discount?.amount ?? 0) !== (b.quote.discount?.amount ?? 0) ? { from: a.quote.discount, to: b.quote.discount } : null;
  const totals = {
    sellA: a.quote.totals.sell, sellB: b.quote.totals.sell, delta: r2(b.quote.totals.sell - a.quote.totals.sell),
    costA: a.quote.totals.cost, costB: b.quote.totals.cost, marginPctA: a.quote.totals.marginPct, marginPctB: b.quote.totals.marginPct,
  };
  const n = added.length + removed.length + changed.length + rooms.length + options.added.length + options.removed.length + (discount ? 1 : 0);
  const dir = totals.delta < 0 ? `${money(-totals.delta)} less` : totals.delta > 0 ? `${money(totals.delta)} more` : 'the same price';
  return { from: a.v, to: b.v, added, removed, changed, rooms, options, discount, totals, n, answer: `Version ${b.v} is ${dir} than version ${a.v}: ${plural(n, 'change')}` };
}

// A line's role in the space type, short and in running text: "HDBaseT transmitter", "powers the video bar".
const roleWords = (role) => {
  const t = role.replace(/:.*$/, '').replace(/\s*\(.*\)\s*$/, '').trim();
  return /^[A-Z][a-z]/.test(t) ? t[0].toLowerCase() + t.slice(1) : t;
};

// ---- Statement of work ------------------------------------------------------------------------------------------------
/** Outlets a room needs, from its build option's infrastructure: power, data and direct runs (the lower figure of a range). */
export function outletsFor(room) {
  const n = { power: 0, data: 0, 'direct-run': 0 };
  for (const i of room.infrastructure) {
    const q = typeof i.quantity === 'object' ? i.quantity.min : i.quantity;
    if (i.service in n) n[i.service] += Number(q) || 0;
  }
  return n;
}

/** The statement of work for a version, generated from the design and the quote. Every section names where its
    words came from, so nothing in it is typed again. */
export function buildSow(opp, ver, ctx) {
  const { terms, labour: L, clientName, providerName, engagement } = ctx;
  const vWord = `version ${ver.v}`;
  const scope = ver.rooms.map((r) => ({
    space: r.space, label: r.label, type: `${r.typeName}, ${r.optionName.toLowerCase()}`,
    lines: r.lines.map((l) => `${l.qty} × ${l.name}${l.role ? ` (${roleWords(l.role)})` : ''}`),
  }));
  const guides = new Map();
  for (const r of ver.rooms) for (const l of r.lines) if (l.guide) guides.set(l.guide.id, { name: l.guide.name, units: (guides.get(l.guide.id)?.units ?? 0) + l.qty });
  const withGuide = [...guides.values()].reduce((n, g) => n + g.units, 0);
  const checks = [...new Set(ver.rooms.flatMap((r) => r.verification.map((c) => c.check)))];
  // Outlets, grouped by the build (one line per space type and option).
  const builds = new Map();
  for (const r of ver.rooms) {
    const k = `${r.typeId}/${r.optionId}`;
    const b = builds.get(k) ?? { name: `${r.typeName}, ${r.optionName.toLowerCase()}`, rooms: [], out: outletsFor(r) };
    b.rooms.push(r.number || r.name);
    builds.set(k, b);
  }
  const outletWords = [...builds.values()].map((b) => {
    const parts = [b.out.power && plural(b.out.power, 'power outlet'), b.out.data && plural(b.out.data, 'data outlet'), b.out['direct-run'] && plural(b.out['direct-run'], 'direct cable run')].filter(Boolean);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
    return parts.length ? `${b.name} (${b.rooms.join(', ')}): ${list} in place in each room before the install day, as the space type lists them.` : null;
  }).filter(Boolean);
  const notLib = ver.bom.lines.filter((l) => l.notInLibrary);
  const days = ver.labour.days;
  const steps = [];
  let at = 1;
  const step = (what, n, from) => { steps.push({ what, days: n, start: at, end: at + n - 1, from }); at += n; };
  step('Order and deliver the kit', terms.lead_time_days, 'Northlight\'s lead time');
  step(`Install ${plural(ver.bom.totals.units, 'unit')} (${L.crew.installers} installers)`, Math.max(1, days.install), 'The install hours');
  step('Configure each unit to its setup guide', Math.max(1, days.configure), 'The configure hours');
  step(`Test ${plural(ver.rooms.length, 'room')} and hand over`, Math.max(1, days.commission), 'The commission hours');
  const pay = terms.payment.map((p) => ({ when: p.when, pct: p.pct, amount: r2((ver.quote.totals.sell * p.pct) / 100) }));
  const sections = [
    { id: 'scope', title: 'Scope, room by room', from: `The design, ${vWord}: each space's type and build option, with the changes the quote lists`, rooms: scope },
    { id: 'deliverables', title: 'Deliverables', from: 'Northlight\'s standard deliverables, counted from the design', items: [
      `${plural(ver.bom.totals.units, 'unit')} supplied, installed and set up across ${plural(ver.rooms.length, 'room')}.`,
      `A build sheet for each of the ${plural(withGuide, 'unit')} that has a setup guide, with every setting worked out for its room.`,
      `An as-built record in ${clientName}'s Keia: the serial, MAC address and a photo of each position, sent as a reviewed change.`,
      `The room test result for each room, and a handover ${clientName} accepts room by room.`,
    ] },
    { id: 'assumptions', title: 'Assumptions', from: 'Northlight\'s standard terms, and the outlets each space type lists', items: [...outletWords, ...terms.assumptions] },
    { id: 'exclusions', title: 'Exclusions', from: 'Northlight\'s standard terms', items: terms.exclusions },
    { id: 'client', title: `What ${clientName} does`, from: `Northlight's standard terms, and the engagement${engagement ? ` (${engagement.id})` : ''}`, items: [
      ...terms.client_responsibilities,
      ...notLib.map((l) => `Add the ${l.name.toLowerCase()} to the device library before it is ordered, so its setup guide and checks exist.`),
    ] },
    { id: 'acceptance', title: 'Acceptance criteria', from: 'Keia\'s verification: each model\'s setup guide and each space type\'s room test', items: [
      `Each unit is read back against its setup guide: ${[...guides.values()].map((g) => `${g.name} (${plural(g.units, 'unit')})`).join('; ')}.`,
      `Each room test passes: ${checks.join('; ')}.`,
      'A room that fails is not accepted until it passes; an accepted snag has an owner and a date.',
    ] },
    { id: 'timeline', title: 'Timeline', from: `The labour estimate (${hoursWords(ver.labour.totals.hours)}) and Northlight's lead time, in working days from acceptance`, steps },
    { id: 'change', title: 'Change control', from: 'Northlight\'s standard terms', items: terms.change_control },
    { id: 'price', title: 'Price and payment', from: `The quote, ${vWord}, and Northlight's standard terms`, total: ver.quote.totals.sell, payments: pay, validUntil: ver.validUntil, warranty: terms.warranty, tax: terms.tax ?? '' },
  ];
  return { title: `Statement of work: ${opp.title}`, client: clientName, provider: providerName, v: ver.v, date: ver.date, sections };
}

// ---- Accepted: the handoff into the client's Keia ---------------------------------------------------------------------
/** What happens when the quote is accepted: the design goes over the engagement as a proposal, lands in the
    client's review queue, and once accepted becomes a project whose install positions start from the BOM. */
export function handoff(opp, ver, ctx) {
  const { clientName, providerName, engagement, contactName, installs = {} } = ctx;
  const inScope = !!engagement?.scope?.kinds?.includes('design');
  const positions = ver.rooms.map((r) => {
    const yaml = [`space: ${r.space}`, 'positions:', ...r.lines.flatMap((l) => [
      `  - position: ${l.key}`,
      ...(l.model ? [`    model: ${l.model}`] : [`    # ${l.name}: add the model to the library first`]),
      `    units: []   # ${l.qty} to capture on install: serial, MAC, photo`,
    ])].join('\n');
    // Where the client's record already holds the room (a project under way), match its positions to the lines.
    const inst = installs[r.space];
    const match = inst ? r.lines.map((l) => {
      const p = inst.positions?.find((x) => x.position === l.key);
      return { key: l.key, name: l.name, found: !!p, units: p?.units?.length ?? 0, sameModel: !p?.model || !l.model || p.model === l.model };
    }) : null;
    return { space: r.space, label: r.label, units: r.units, yaml, match };
  });
  const guides = new Map();
  for (const r of ver.rooms) for (const l of r.lines) if (l.guide) guides.set(l.guide.id, { id: l.guide.id, name: l.guide.name, units: (guides.get(l.guide.id)?.units ?? 0) + l.qty });
  const who = contactName ?? `${clientName}'s delivery lead`;
  const steps = [
    { side: 'provider', what: `${clientName} accepts quote version ${ver.v}`, how: 'Recorded in Northlight\'s Keia with the date and who accepted it' },
    { side: 'both', what: 'The design goes over the engagement as a proposal', how: `Signed by ${providerName}; written in both audit logs (${engagement?.id ?? 'no engagement'})` },
    { side: 'client', what: `It lands in ${clientName}'s review queue`, how: `${who} compares it with ${clientName}'s space types and standards, then accepts it` },
    { side: 'client', what: `It becomes a project in ${clientName}'s Keia`, how: `${ver.rooms.length} spaces, ${providerName} engaged as integrator, the quote as its budget line` },
    { side: 'client', what: 'The BOM becomes each space\'s install positions', how: `${plural(ver.bom.totals.units, 'unit')} to capture; build sheets start from ${plural(guides.size, 'setup guide')}` },
    { side: 'both', what: 'On install, the as-built comes back as a reviewed change', how: 'Serials, MACs and photos fill the positions; nobody retypes a spreadsheet' },
  ];
  const gaps = ver.bom.lines.filter((l) => l.notInLibrary).map((l) => `${l.name}: not in the device library yet, so it has no setup guide or checks. Add it before ordering.`);
  if (!inScope) gaps.unshift(`Design proposals are not in the scope of the engagement with ${clientName}. ${clientName} would add them before this can be proposed.`);
  return {
    inScope, positions, guides: [...guides.values()], steps, gaps,
    project: { name: opp.title, site: opp.site, spaces: ver.rooms.length, units: ver.bom.totals.units, budget: ver.quote.totals.sell, becomes: opp.becomes ?? null },
  };
}

// ---- The pipeline -----------------------------------------------------------------------------------------------------
/** An opportunity's value: the quote the client has (or had), else the draft's, else the rough estimate. */
export const valueOf = (o) => o.value ?? o.estimate ?? 0;

/** Opportunities by stage, with the open value and the answer for the band. */
export function pipeline(opps) {
  const stages = STAGES.map((s) => {
    const list = opps.filter((o) => o.stage === s.id);
    return { ...s, opps: list, n: list.length, value: r2(list.reduce((n, o) => n + valueOf(o), 0)) };
  });
  const st = (id) => stages.find((s) => s.id === id);
  const open = ['lead', 'design', 'quoted'].map(st);
  const openN = open.reduce((n, s) => n + s.n, 0), openV = r2(open.reduce((n, s) => n + s.value, 0));
  const quoted = st('quoted');
  const answer = `${plural(openN, 'opportunity', 'opportunities')} open, ${money(Math.round(openV))} in play · ${quoted.n ? `${plural(quoted.n, 'quote')} with the client` : 'no quote out'}`;
  return { stages, open: { n: openN, value: openV }, won: st('accepted'), lost: st('lost'), answer };
}
