// Winning the work in a provider's own Keia (src/lib/provider-sales.mjs): the BOM rolls up from the rooms, labour
// comes from the task types and the setup guides, the pricing and margin maths add up, versions compare line by line,
// the statement of work is generated from the design and the quote, and an accepted quote hands over into the
// client's Keia. The maths is pure; the real data is read from data/providers/northlight/sales/.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  margin, money, quarterHours, displaySize, pickFromLibrary, resolveLine, resolveVersion, designRooms, rollUp,
  estimateLabour, summariseLabour, priceQuote, priceOption, diffQuotes, buildSow, handoff, pipeline, outletsFor, addDays, slimGuide,
} from '../src/lib/provider-sales.mjs';
import { salesModel } from '../src/lib/provider-sales-data.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const M = salesModel(ROOT);
const opp = (id) => M.opps.find((o) => o.id === id);

// ---- A small library of its own, so the maths can be checked by hand ----------------------------------------------
const LIB = {
  models: {
    'disp-55': { manufacturer: 'Acme', model: 'D55', class: 'display', summary: 'A 55 inch display.' },
    'disp-65': { manufacturer: 'Acme', model: 'D65', class: 'display', summary: 'A 65 inch display.' },
    'disp-75': { manufacturer: 'Acme', model: 'D75', class: 'display', summary: 'A 75 inch display.' },
    bar: { manufacturer: 'Acme', model: 'Bar', class: 'video-bar', summary: 'A video bar.' },
    bar2: { manufacturer: 'Acme', model: 'Bar Two', class: 'video-bar', summary: 'A bigger video bar.' },
    panel: { manufacturer: 'Acme', model: 'Panel', class: 'scheduler-panel', summary: 'A booking panel.' },
  },
  classes: {},
  guides: [{ id: 'bar-guide', name: 'Bar setup', models: ['bar', 'bar2'], groups: [{ settings: [{ action: 'change' }, { action: 'verify' }, { action: 'leave' }, { action: 'change' }] }] }],
  prices: { 'disp-65': { cost: 1000, sell: 1300 }, 'disp-75': { cost: 1800, sell: 2400 }, bar: { cost: 2000, sell: 2600 }, bar2: { cost: 3000, sell: 3900 }, panel: { cost: 500, sell: 650 } },
  spaces: { 'x-1': { site: 'x', number: '1.01', name: 'One', space_type: 'room', option: 'std' } },
  spaceTypes: {
    room: {
      profile: { name: 'Test room', capacity: '4-6 people' },
      verification_model: { platforms_to_check: [{ platform: 'keia_atlas', check: 'every device recorded' }] },
      keia_atlas: { options: [
        { id: 'std', name: 'Standard', equipment: [
          { key: 'display', class: 'display', quantity: 2, requirement: 'required', sizes_in: [65, 75] },
          { key: 'video-bar', class: 'video-bar', model: 'bar', quantity: 1, requirement: 'required' },
          { key: 'scheduler-panel', class: 'scheduler-panel', model: 'panel', quantity: 1, requirement: 'optional' },
        ], infrastructure: [{ service: 'power', quantity: 4 }, { service: 'data', quantity: { min: 2, max: 4 } }] },
        { id: 'big', name: 'Big', equipment: [{ key: 'video-bar', class: 'video-bar', model: 'bar2', quantity: 1, requirement: 'required' }] },
      ] },
    },
  },
};
const L = {
  roles: [{ id: 'installer', name: 'Installer', cost: 50, sell: 100 }, { id: 'engineer', name: 'Engineer', cost: 60, sell: 120 }, { id: 'commissioning', name: 'Commissioning', cost: 60, sell: 110 }, { id: 'pm', name: 'PM', cost: 70, sell: 130 }],
  tasks: {
    install: { role: 'installer', default_minutes: 30, minutes_by_class: { display: 120, 'video-bar': 90 } },
    configure: { role: 'engineer', base_minutes: 15, per_setting_minutes: 2 },
    commission: { role: 'commissioning', base_minutes: 60, per_unit_minutes: 10 },
    manage: { role: 'pm', share_pct: 10 },
  },
  crew: { installers: 2, hours_per_day: 7.5 },
};
const PRICES = { allowance: { what: 'Sundries', pct: 5, markup_pct: 20 } };
const OPP = {
  id: 'OPP-0001', title: 'Test', site: 'x', design: { spaces: [{ space: 'x-1', space_type: 'room', option: 'std' }, { space: 'x-2', name: 'Two', number: '1.02', space_type: 'room', option: 'std' }] },
  versions: [
    { v: 1, date: '2026-09-01', status: 'superseded', changes: [{ space: 'x-1', key: 'scheduler-panel', add: true, why: 'asked' }], labour_changes: [{ task: 'install', class: 'display', minutes: 150, why: 'concrete' }] },
    { v: 2, extends: 1, date: '2026-09-10', status: 'sent', changes: [{ space: 'x-2', key: 'display', qty: 1, why: 'small room' }, { space: 'x-2', option: 'big', why: 'bigger' }], discount: { pct: 10, on: 'labour', why: 'repeat' }, options: [{ id: 'panels', title: 'Panels', adds: [{ space: 'x-2', key: 'video-bar' }] }] },
  ],
};

test('a display\'s size comes from its summary, and the library pick takes the smallest size the space type allows', () => {
  assert.equal(displaySize(LIB.models['disp-65']), 65);
  assert.equal(displaySize(LIB.models.bar), null);
  assert.deepEqual(pickFromLibrary(LIB, { class: 'display', sizes_in: [75, 65] }), { id: 'disp-65', size: 65 });
  assert.equal(pickFromLibrary(LIB, { class: 'display', sizes_in: [43, 50] }), null, 'nothing that size: no guess');
  assert.equal(pickFromLibrary(LIB, { class: 'display', sizes_in: [55] }), null, 'a model with no price is not offered');
});

test('each line says where it came from: the standard, the library, or the person', () => {
  const T = LIB.spaceTypes.room.keia_atlas.options[0].equipment;
  const std = resolveLine(LIB, T[1]);
  assert.equal(std.source, 'standard'); assert.equal(std.model, 'bar'); assert.equal(std.sell, 2600); assert.equal(std.guide.id, 'bar-guide');
  const lib = resolveLine(LIB, T[0]);
  assert.equal(lib.source, 'library'); assert.equal(lib.model, 'disp-65'); assert.match(lib.why, /65 or 75 inch; the library's 65 inch/);
  const none = resolveLine(LIB, { ...T[0], sizes_in: [43] });
  assert.equal(none.unresolved, true); assert.equal(none.model, null); assert.match(none.why, /No 43 inch display/);
  const opt = resolveLine(LIB, T[2]);
  assert.equal(opt.included, false, 'optional lines stay out unless added');
  const added = resolveLine(LIB, T[2], [{ add: true, why: 'asked' }]);
  assert.equal(added.included, true); assert.equal(added.source, 'changed'); assert.equal(added.was, 'Optional in the space type');
  const swapped = resolveLine(LIB, T[1], [{ model: 'bar2', why: 'bigger room' }]);
  assert.equal(swapped.source, 'changed'); assert.equal(swapped.was, 'Standard: Acme Bar'); assert.equal(swapped.sell, 3900);
  const item = resolveLine(LIB, { ...T[0], sizes_in: [43] }, [{ item: '43 inch display', cost: 400, sell: 520, why: 'not in library' }]);
  assert.equal(item.notInLibrary, true); assert.equal(item.sell, 520); assert.equal(item.id, 'item-43-inch-display');
  const qty = resolveLine(LIB, T[0], [{ qty: 1, why: 'one wall' }]);
  assert.equal(qty.qty, 1); assert.equal(qty.was, 'Standard: 2');
});

test('versions inherit the changes of the version they extend; a later labour change wins', () => {
  const V = resolveVersion(OPP, 2);
  assert.equal(V.changes.length, 3, 'version 1\'s change, then version 2\'s two');
  assert.equal(V.labour_changes[0].minutes, 150);
  assert.equal(V.discount.pct, 10);
  assert.equal(resolveVersion(OPP, 9), null);
});

test('the BOM rolls up: rooms to one project list, by model, with the rooms and the marks each line carries', () => {
  const rooms = designRooms(OPP, 1, LIB);
  assert.deepEqual(rooms.map((r) => r.label), ['1.01 One', '1.02 Two']);
  assert.equal(rooms[0].units, 4, '2 displays, a bar and the panel that was added');
  assert.equal(rooms[1].units, 3);
  const B = rollUp(rooms);
  const disp = B.lines.find((l) => l.id === 'disp-65');
  assert.equal(disp.qty, 4); assert.deepEqual(disp.rooms.map((r) => r.qty), [2, 2]); assert.equal(disp.mark, 'library');
  assert.equal(disp.sell, 5200); assert.equal(disp.cost, 4000);
  assert.equal(B.lines.find((l) => l.id === 'panel').mark, 'changed');
  assert.equal(B.totals.units, 7);
  assert.equal(B.totals.sell, 5200 + 2 * 2600 + 650);
  assert.deepEqual(B.totals.marks, { standard: 2, library: 4, changed: 1 });
  assert.equal(B.lines[0].cls, 'display', 'displays first');
  // Version 2: room two becomes the Big build and takes one display less (a change to a key the new build lacks is ignored).
  const r2 = designRooms(OPP, 2, LIB)[1];
  assert.equal(r2.optionName, 'Big'); assert.equal(r2.optionWas, 'Standard'); assert.equal(r2.units, 1);
  // An unpriced line is counted, never guessed.
  const U = rollUp([{ space: 'y', label: 'Y', lines: [{ id: 'item-z', name: 'Z', cls: 'adapter', clsName: 'Adapter', qty: 2, cost: null, sell: null, source: 'changed' }] }]);
  assert.equal(U.totals.unpriced, 1); assert.equal(U.totals.sell, 0); assert.equal(U.lines[0].sell, null);
});

test('labour: install per unit by class, configure from the setup guide, commission per room, manage as a share', () => {
  assert.equal(quarterHours(50), 0.75); assert.equal(quarterHours(52), 0.75); assert.equal(quarterHours(53), 1);
  const rooms = designRooms(OPP, 1, LIB);
  const lab = estimateLabour(rooms, L, LIB, []);
  const t = (task, space, id) => lab.tasks.find((x) => x.task === task && x.space === space && (!id || x.lineId === id));
  assert.equal(t('install', 'x-1', 'disp-65').minutes, 240, '2 displays at 120 min');
  assert.equal(t('install', 'x-1', 'panel').minutes, 30, 'no time for its class: the default');
  const cfg = t('configure', 'x-1', 'bar');
  assert.equal(cfg.guide.settings, 3, 'the guide sets or checks 3 settings (one is left alone)');
  assert.equal(cfg.minutes, 15 + 2 * 3); assert.equal(cfg.source, 'guide'); assert.equal(cfg.hours, 0.25);
  assert.equal(t('configure', 'x-1', 'disp-65'), undefined, 'a model with no setup guide has no configure time');
  assert.equal(t('commission', 'x-1').minutes, 60 + 10 * 4);
  const other = lab.tasks.filter((x) => x.task !== 'manage').reduce((n, x) => n + x.hours, 0);
  assert.equal(t('manage', null).hours, quarterHours(other * 60 * 0.1));
  assert.equal(lab.totals.hours, other + t('manage', null).hours);
  const inst = lab.byRole.find((r) => r.id === 'installer');
  assert.equal(inst.sell, inst.hours * 100); assert.equal(inst.cost, inst.hours * 50);
  // A labour change overrides the task type, and says so.
  const ch = estimateLabour(rooms, L, LIB, [{ task: 'install', class: 'display', minutes: 150, why: 'concrete' }]);
  const d = ch.tasks.find((x) => x.task === 'install' && x.lineId === 'disp-65');
  assert.equal(d.minutes, 300); assert.equal(d.source, 'changed'); assert.equal(d.basis, 'concrete');
  // Rates the person changes reprice the same hours.
  const again = summariseLabour(lab.tasks, L, rooms, [], { installer: { sell: 110 } });
  assert.equal(again.byRole.find((r) => r.id === 'installer').sell, inst.hours * 110);
  assert.equal(again.totals.hours, lab.totals.hours);
  // A page's script reads a cut-down guide and gets the same count.
  assert.equal(slimGuide(LIB.guides[0]).settingsCount, 3);
  // Crew days: install hours over two installers' days.
  assert.equal(lab.days.install, Math.ceil(lab.byTask.find((x) => x.task === 'install').hours / 15));
});

test('pricing and margin: by line and in total, with the allowance and a discount', () => {
  assert.deepEqual(margin(100, 130), { margin: 30, marginPct: 23.1 });
  assert.deepEqual(margin(0, 0), { margin: 0, marginPct: 0 });
  assert.equal(money(1234.5), '$1,234.50'); assert.equal(money(46348), '$46,348'); assert.equal(money(-12), '−$12'); assert.equal(money(null), 'Not priced');
  const rooms = designRooms(OPP, 1, LIB), bom = rollUp(rooms), lab = estimateLabour(rooms, L, LIB);
  const q = priceQuote({ bom, labour: lab, priceList: PRICES });
  const al = q.lines.find((l) => l.kind === 'allowance');
  assert.equal(al.cost, Math.round(bom.totals.cost * 0.05)); assert.equal(al.sell, Math.round(al.cost * 1.2));
  for (const l of q.lines) assert.equal(l.margin, Math.round((l.sell - l.cost) * 100) / 100, `${l.name}: margin is sell less cost`);
  const sum = (k) => Math.round(q.lines.reduce((n, l) => n + l[k], 0) * 100) / 100;
  assert.equal(q.totals.cost, sum('cost')); assert.equal(q.totals.sell, sum('sell'));
  assert.equal(q.equipment.sell, bom.totals.sell + al.sell); assert.equal(q.labour.sell, lab.totals.sell);
  assert.equal(q.totals.margin, Math.round((q.totals.sell - q.totals.cost) * 100) / 100);
  assert.equal(q.totals.marginPct, Math.round((q.totals.margin / q.totals.sell) * 1000) / 10);
  // A 10% discount on labour comes off the sell price only.
  const d = priceQuote({ bom, labour: lab, priceList: PRICES, discount: { pct: 10, on: 'labour', why: 'x' } });
  assert.equal(d.discount.amount, Math.round(lab.totals.sell * 10) / 100);
  assert.equal(d.totals.sell, Math.round((q.totals.sell - d.discount.amount) * 100) / 100);
  assert.equal(d.totals.cost, q.totals.cost);
  assert.ok(d.totals.marginPct < q.totals.marginPct);
  // An option is priced on its own and never joins the total.
  const o = priceOption(OPP.versions[1].options[0], designRooms(OPP, 1, LIB), LIB, L, PRICES);
  assert.equal(o.equipment.sell, 2600 + Math.round(Math.round(2000 * 0.05) * 1.2));
  assert.ok(o.hours > 0 && o.sell > o.equipment.sell);
});

test('two versions compared: lines added, taken out and changed, rooms rebuilt, and the totals', () => {
  const ctx = { lib: LIB, labour: L, priceList: PRICES, terms: { validity_days: 30 } };
  const mk = (v) => {
    const rooms = designRooms(OPP, v, LIB), V = resolveVersion(OPP, v);
    return { v, rooms, options: [], quote: priceQuote({ bom: rollUp(rooms), labour: estimateLabour(rooms, L, LIB, V.labour_changes), priceList: PRICES, discount: V.discount }) };
  };
  void ctx;
  const D = diffQuotes(mk(1), mk(2));
  assert.deepEqual(D.added.map((l) => l.id), ['bar2']);
  assert.ok(D.changed.some((l) => l.id === 'disp-65' && l.qtyA === 4 && l.qtyB === 2));
  assert.ok(D.changed.some((l) => l.id === 'bar' && l.qtyA === 2 && l.qtyB === 1));
  assert.deepEqual(D.rooms, [{ space: 'x-2', label: '1.02 Two', from: 'Standard', to: 'Big' }]);
  assert.ok(D.discount && D.discount.to.pct === 10);
  assert.equal(D.totals.delta, Math.round((D.totals.sellB - D.totals.sellA) * 100) / 100);
  assert.match(D.answer, /^Version 2 is \$[\d,.]+ (less|more) than version 1: \d+ changes$/);
});

// ---- The real data ------------------------------------------------------------------------------------------------
test('the demo pipeline: five opportunities across three clients, every answer short, every model priced', () => {
  assert.equal(M.opps.length, 5);
  assert.deepEqual([...new Set(M.opps.map((o) => o.client))].sort(), ['aigna', 'fenwater', 'quillmark']);
  assert.deepEqual(M.pipeline.stages.map((s) => s.n), [1, 1, 1, 1, 1], 'one in each stage');
  assert.ok(M.pipeline.answer.length <= 110, M.pipeline.answer);
  const words = /(?<![\w-])(profiles?|makers?)(?![\w-])/i;
  for (const o of M.opps) {
    assert.ok(o.answer.length <= 110, `${o.id}: ${o.answer}`);
    assert.ok(!words.test(`${o.answer} ${o.title} ${o.next ?? ''}`), `${o.id} uses a retired word`);
    for (const v of o.versions) {
      assert.equal(v.quote.unpriced, 0, `${o.id} v${v.v}: every line priced`);
      for (const r of v.rooms) for (const l of r.lines) assert.ok(!l.unresolved, `${o.id} ${r.label}: ${l.key} resolved`);
    }
  }
  // Aigna's spaces are Aigna's own records; every change names a key its build has, or a build option.
  for (const o of M.opps.filter((x) => x.design)) {
    for (const s of o.design.spaces) if (o.client === 'aigna') assert.ok(M.lib.spaces[s.space], `${o.id}: ${s.space} is one of Aigna's spaces`);
    for (const v of o.versions) {
      const R = resolveVersion(o, v.v);
      for (const c of R.changes.filter((x) => x.key)) {
        const room = v.rooms.find((r) => r.space === c.space);
        const keys = M.lib.spaceTypes[room.typeId].keia_atlas.options.find((x) => x.id === room.optionId).equipment.map((e) => e.key);
        assert.ok(keys.includes(c.key), `${o.id} v${v.v}: ${c.space} has no "${c.key}"`);
      }
    }
  }
});

test('Chicago level 13: version 2 against version 1, and the options', () => {
  const o = opp('OPP-2611');
  const [v1, v2] = o.versions;
  const D = o.diffs[0];
  assert.deepEqual(D.rooms.map((r) => [r.label, r.from, r.to]), [['13.07 Goldcrest', 'Bring your own meeting', 'Room system']]);
  assert.ok(D.removed.some((l) => l.id === 'logitech-tap-scheduler'), 'booking panels left the base price');
  assert.ok(D.removed.some((l) => l.id === 'logitech-meetup-2'), 'Goldcrest no longer needs the USB bar');
  assert.ok(D.added.some((l) => l.id === 'poly-expansion-microphone'));
  assert.equal(D.discount.to.pct, 8);
  assert.equal(D.totals.delta, Math.round((v2.quote.totals.sell - v1.quote.totals.sell) * 100) / 100);
  assert.deepEqual(v2.options.map((x) => x.id), ['panels', 'whiteboard']);
  assert.equal(v2.options[0].equipment.sell > 4 * 940, true, 'four panels and the allowance on them');
  assert.equal(v2.validUntil, '2026-10-24');
  assert.equal(addDays('2026-09-24', 30), '2026-10-24');
  const disp = v2.labour.tasks.find((t) => t.task === 'install' && t.cls === 'display');
  assert.equal(disp.each, 150, 'the concrete walls from the survey'); assert.equal(disp.source, 'changed');
  assert.equal(o.current.v, 2);
  assert.equal(o.value, v2.quote.totals.sell);
});

test('the statement of work is generated from the design and the quote, and each section says where it came from', () => {
  const o = opp('OPP-2611'), S = o.sow;
  assert.deepEqual(S.sections.map((s) => s.id), ['scope', 'deliverables', 'assumptions', 'exclusions', 'client', 'acceptance', 'timeline', 'change', 'price']);
  for (const s of S.sections) assert.ok(s.from && s.from.length > 10, `${s.id} says where it came from`);
  assert.equal(S.sections[0].rooms.length, 5);
  assert.ok(S.sections[0].rooms[0].lines.includes('2 × Samsung QM65C'));
  const acc = S.sections.find((s) => s.id === 'acceptance').items.join(' ');
  assert.match(acc, /read back against its setup guide: .*Studio X in Google Meet mode/);
  assert.match(acc, /Each room test passes: /);
  const tl = S.sections.find((s) => s.id === 'timeline').steps;
  for (let i = 1; i < tl.length; i++) assert.equal(tl[i].start, tl[i - 1].end + 1, 'the steps follow on');
  const price = S.sections.find((s) => s.id === 'price');
  assert.equal(Math.round(price.payments.reduce((n, p) => n + p.amount, 0)), Math.round(price.total));
  assert.ok(S.sections.find((s) => s.id === 'client').items.some((x) => /50 inch commercial display to the device library/.test(x)), 'a line not in the library is the client\'s to add');
  assert.ok(S.sections.find((s) => s.id === 'assumptions').items.some((x) => /\d+ power outlets.*\d+ data outlets/.test(x)), 'the outlets come from the space type');
  assert.deepEqual(outletsFor({ infrastructure: [{ service: 'power', quantity: 4 }, { service: 'data', quantity: { min: 2, max: 4 } }] }), { power: 4, data: 2, 'direct-run': 0 });
  void buildSow;
});

test('accepted: the design becomes the client\'s project, its BOM the install positions', () => {
  const jnu = opp('OPP-2602');
  assert.equal(jnu.becomes, 'PRJ-14');
  for (const p of jnu.handoff.positions) for (const m of p.match) assert.ok(m.found && m.sameModel, `${p.label}: ${m.key} is a position in Aigna's record`);
  const chi = opp('OPP-2611').handoff;
  assert.equal(chi.inScope, true);
  assert.ok(chi.positions.every((p) => p.match === null), 'a quote not yet accepted is not matched against the rooms\' kit today');
  assert.equal(chi.steps.length, 6);
  assert.match(chi.positions[0].yaml, /^space: chi-13-02\npositions:\n {2}- position: display\n {4}model: samsung-qm65c/);
  assert.ok(chi.guides.some((g) => g.id === 'poly-x-google-meet'));
  assert.ok(chi.gaps.some((g) => /50 inch/.test(g)));
  const fw = opp('OPP-2613').handoff;
  assert.equal(fw.inScope, false, 'design is not in Fenwater\'s engagement scope');
  assert.match(fw.gaps[0], /not in the scope of the engagement/);
  void handoff; void pipeline;
});
