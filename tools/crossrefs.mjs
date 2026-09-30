// Cross-reference checks.
//
// A schema checks one file on its own. These checks look across files:
// a space type that names a device class, a source, or a file path must
// point at something that actually exists.
//
// Each check returns { file, at, message }, where `at` is the path inside the
// YAML (used to report the line number).

import { existsSync } from 'node:fs';
import { PEOPLE } from '../src/lib/demo.mjs';
import { crossCheckStock } from './crossrefs-stock.mjs';
import { crossCheckIncidents } from './crossrefs-incidents.mjs';
import { crossCheckRules } from './crossrefs-rules.mjs';
import { crossCheckKnownIssues } from './crossrefs-knownissues.mjs';
import { crossCheckFloors } from './crossrefs-floors.mjs';
import { crossCheckPrivacy } from './crossrefs-privacy.mjs';
import { crossCheckConnected } from './crossrefs-connected.mjs';
import { crossCheckSwitchPorts } from './crossrefs-switchports.mjs';
import path from 'node:path';


// Which connectors each cable type can plug into.
const CABLE_FITS = {
  hdmi: ['hdmi'], displayport: ['displayport'], 'usb-c': ['usb-c'], thunderbolt: ['usb-c'],
  usb: ['usb-a', 'usb-b', 'usb-c', 'micro-usb'], cat6: ['rj45'], cat6a: ['rj45'], audio: ['3.5mm', 'terminal-block', 'xlr', '6.35mm'],
  'poly-mic': ['rj11', 'proprietary'], speaker: ['terminal-block'],
  power: ['dc-barrel', 'iec-c14', 'iec-c8', 'iec-c6', 'terminal-block', 'usb-c', 'not-stated', 'proprietary'], proprietary: null,
};

// Check one build option's wiring. Returns [{at, message}].
export function checkWiring(option, models) {
  const out = [];
  const items = new Map();
  option.equipment.forEach((e, i) => {
    if (items.has(e.key)) out.push({ at: ['equipment', i, 'key'], message: `equipment key "${e.key}" is used twice` });
    items.set(e.key, e);
  });
  const outlets = new Map();
  for (const o of option.infrastructure ?? []) {
    const k = `${o.service}/${o.location}`;
    const n = o.quantity === 'tbd' ? 1 : typeof o.quantity === 'number' ? o.quantity : o.quantity.max;
    outlets.set(k, (outlets.get(k) ?? 0) + n);
  }
  const parse = (ep, i, end) => {
    if (ep === 'laptop' || ep === 'home-router') return { special: ep };
    const om = /^outlet:([a-z-]+\/[a-z-]+)#(\d+)$/.exec(ep);
    if (om) {
      const have = outlets.get(om[1]) ?? 0;
      if (+om[2] > have) out.push({ at: ['wiring', i, end], message: `${ep}: the option has ${have} ${om[1]} outlet${have === 1 ? '' : 's'}` });
      return { outlet: ep };
    }
    const m = /^([a-z0-9-]+)(?:#(\d+))?\.([a-z0-9-]+)$/.exec(ep);
    const item = items.get(m[1]);
    if (!item) { out.push({ at: ['wiring', i, end], message: `${ep}: no equipment with key "${m[1]}"` }); return null; }
    const idx = +(m[2] ?? 1);
    const max = item.quantity === 'tbd' ? 1 : item.quantity;
    if (idx > max) out.push({ at: ['wiring', i, end], message: `${ep}: "${m[1]}" has quantity ${item.quantity}` });
    const model = item.model ? models.get(item.model) : null;
    let port = null;
    if (model) {
      port = model.ports.find((p) => p.id === m[3]);
      if (!port) out.push({ at: ['wiring', i, end], message: `${ep}: ${item.model} has no port "${m[3]}"` });
    }
    return { device: `${m[1]}#${idx}.${m[3]}`, port, item };
  };
  const used = [[], []]; // [all optional fitted, none fitted]
  (option.wiring ?? []).forEach((link, i) => {
    for (const k of [link.when, link.unless]) {
      if (k && !items.has(k)) out.push({ at: ['wiring', i], message: `when/unless names "${k}", which is not an equipment key` });
      else if (k && items.get(k).requirement !== 'optional') out.push({ at: ['wiring', i], message: `when/unless names "${k}", which is not optional` });
    }
    const ends = [parse(link.from, i, 'from'), parse(link.to, i, 'to')];
    for (const [j, e] of ends.entries()) {
      if (e?.port && CABLE_FITS[link.cable] && !CABLE_FITS[link.cable].includes(e.port.connector)) {
        out.push({ at: ['wiring', i, j ? 'to' : 'from'], message: `a ${link.cable} cable doesn't fit ${e.port.connector} (${j ? link.to : link.from})` });
      }
    }
    const optional = (e) => e?.item?.requirement === 'optional' ? e.item.key : null;
    [true, false].forEach((fitted, s) => {
      const on = (k) => (fitted ? true : !k || items.get(k)?.requirement !== 'optional');
      if (link.when && !fitted) return;
      if (link.unless && fitted) return;
      if (ends.some((e) => optional(e) && !on(optional(e)))) return;
      for (const e of ends) if (e?.device || e?.outlet) used[s].push([e.device ?? e.outlet, i]);
    });
  });
  for (const [s, list] of used.entries()) {
    const seen = new Map();
    for (const [ep, i] of list) {
      if (seen.has(ep) && seen.get(ep) !== i) {
        out.push({ at: ['wiring', i], message: `${ep} is used by two cables${s === 0 ? ' when all optional kit is fitted' : ''}` });
      }
      seen.set(ep, i);
    }
  }
  return out;
}

export function crossCheck(records, root) {
  const problems = [];
  const report = (rec, at, message) => problems.push({ file: rec.file, at, message });
  const inFolder = (folder) => records.filter((r) => r.folder === folder);
  const ids = (folder) => new Set(inFolder(folder).map((r) => r.id));

  // Every source entry id, across all source registry files, must be unique.
  const sourceIds = new Map();
  for (const rec of inFolder('sources')) {
    rec.data.entries.forEach((entry, i) => {
      if (sourceIds.has(entry.id)) {
        report(rec, ['entries', i, 'id'], `source id "${entry.id}" is already used in ${sourceIds.get(entry.id)}`);
      } else {
        sourceIds.set(entry.id, rec.rel);
      }
    });
  }

  const fileExists = (rel) => existsSync(path.join(root, rel));
  const classIds = ids('device-classes');
  const modelIds = ids('device-models');
  const models = new Map(inFolder('device-models').map((r) => [r.id, r.data]));
  const LAPTOP_FACING = new Set(['monitor', 'dock', 'adapter', 'video-bar', 'desk-video-device']);

  for (const rec of inFolder('device-classes')) {
    rec.data.sources.forEach((s, i) => {
      if (!fileExists(s.file)) report(rec, ['sources', i, 'file'], `source file "${s.file}" does not exist`);
    });
    // A consistency check can only compare fields its platforms actually record. The fields are helpful, not
    // required: a record that lacks one still passes, and the check says "not known yet" for it. The old name,
    // required_fields, is read the same way.
    rec.data.consistency.forEach((c, i) => {
      c.compare.forEach((ref, j) => {
        const [platform, field] = ref.split('.');
        const p = rec.data.platforms[platform];
        if (!p) report(rec, ['consistency', i, 'compare', j], `"${ref}": platform "${platform}" is not defined`);
        else if (!(p.helpful_fields ?? p.required_fields ?? []).includes(field)) {
          report(rec, ['consistency', i, 'compare', j], `"${ref}": "${field}" is not in ${platform}'s helpful_fields`);
        }
      });
    });
    // Keia Atlas rule: the first place to look for a symptom must be a platform this profile defines.
    for (const [symptom, d] of Object.entries(rec.data.discrimination)) {
      if (!rec.data.platforms[d.first_check]) {
        report(rec, ['discrimination', symptom, 'first_check'], `first_check "${d.first_check}" is not one of this profile's platforms`);
      }
    }
  }

  for (const rec of inFolder('device-models')) {
    const { data } = rec;
    if (!classIds.has(data.class)) report(rec, ['class'], `device class "${data.class}" does not exist`);
    data.sources.forEach((s, i) => {
      if (!sourceIds.has(s.source)) report(rec, ['sources', i, 'source'], `source "${s.source}" is not a source entry id`);
    });
    const portIds = new Set();
    data.ports.forEach((p, i) => {
      if (portIds.has(p.id)) report(rec, ['ports', i, 'id'], `port id "${p.id}" is used twice`);
      portIds.add(p.id);
    });
    (data.power?.inputs ?? []).forEach((input, i) => {
      if (input.port && !portIds.has(input.port)) {
        report(rec, ['power', 'inputs', i, 'port'], `power input points at port "${input.port}", which this model doesn't have`);
      }
    });
  }

  for (const rec of inFolder('space-types')) {
    const { profile, sources, equipment_categories: categories, keia_atlas: rs } = rec.data;

    if (profile.space_type !== rec.id) {
      report(rec, ['profile', 'space_type'], `space_type "${profile.space_type}" must match the file name "${rec.id}"`);
    }

    sources.forEach((s, i) => {
      if (!fileExists(s.file)) report(rec, ['sources', i, 'file'], `source file "${s.file}" does not exist`);
    });

    // Keia rule: each object_profile path must resolve to an existing file.
    const coveredClasses = new Set();
    categories.forEach((c, i) => {
      if (c.object_profile === null) return;
      const m = /^data\/device-classes\/([a-z0-9-]+)\.yaml$/.exec(c.object_profile);
      if (!m) {
        report(rec, ['equipment_categories', i, 'object_profile'], `object_profile must be a file in data/device-classes/, got "${c.object_profile}"`);
      } else if (!classIds.has(m[1])) {
        report(rec, ['equipment_categories', i, 'object_profile'], `device class "${m[1]}" does not exist`);
      } else {
        coveredClasses.add(m[1]);
      }
    });

    if (rs.standard === 'industry' && !rs.guideline) {
      report(rec, ['keia_atlas', 'standard'], 'an industry space type must name its guideline');
    } else if (rs.guideline && !sourceIds.has(rs.guideline)) {
      report(rec, ['keia_atlas', 'guideline'], `guideline "${rs.guideline}" is not a source entry id`);
    }

    if (rs.capacity && rs.capacity.min > rs.capacity.max) {
      report(rec, ['keia_atlas', 'capacity'], 'capacity min is larger than max');
    }

    const optionIds = new Set();
    rs.options.forEach((option, o) => {
      for (const w of checkWiring(option, models)) report(rec, ['keia_atlas', 'options', o, ...w.at], `option "${option.id}": ${w.message}`);
      if (optionIds.has(option.id)) report(rec, ['keia_atlas', 'options', o, 'id'], `option id "${option.id}" is used twice`);
      optionIds.add(option.id);

      option.equipment.forEach((item, e) => {
        const at = ['keia_atlas', 'options', o, 'equipment', e];
        if (!classIds.has(item.class)) {
          report(rec, [...at, 'class'], `device class "${item.class}" does not exist`);
        } else if (!coveredClasses.has(item.class)) {
          report(rec, [...at, 'class'], `device class "${item.class}" is used in an option but no equipment category points at it`);
        }
        // Once any device model exists, every model named here must exist.
        if (item.model && modelIds.size > 0 && !modelIds.has(item.model)) {
          report(rec, [...at, 'model'], `device model "${item.model}" does not exist`);
        }
        // A laptop plugs straight into these, so they must support every laptop system the option serves.
        const model = models.get(item.model);
        if (option.clients && model && LAPTOP_FACING.has(item.class)) {
          const missing = option.clients.filter((os) => !(model.client_os ?? []).includes(os));
          if (missing.length) {
            report(rec, [...at, 'model'], `option "${option.id}" serves ${missing.join(', ')}, but ${item.model} doesn't list ${missing.length > 1 ? 'them' : 'it'} in client_os`);
          }
        }
      });
    });
  }

  // Sites and spaces.
  const sites = new Map(inFolder('sites').map((r) => [r.id, r.data]));
  const spaceTypes = new Map(inFolder('space-types').map((r) => [r.id, r.data]));
  for (const rec of inFolder('sites')) {
    rec.data.sources.forEach((s, i) => {
      if (!sourceIds.has(s.source)) report(rec, ['sources', i, 'source'], `source "${s.source}" is not a source entry id`);
    });
    const floorIds = (rec.data.floors ?? []).map((f) => f.id);
    if (new Set(floorIds).size !== floorIds.length) report(rec, ['floors'], 'a floor id is used twice');
  }
  const numbers = new Map();
  for (const rec of inFolder('spaces')) {
    const s = rec.data;
    const site = sites.get(s.site);
    if (!site) { report(rec, ['site'], `site "${s.site}" does not exist`); continue; }
    if (!rec.id.startsWith(`${s.site}-`)) report(rec, ['site'], `file name "${rec.id}" must start with the site id "${s.site}-"`);
    if (!rec.rel.includes(`/spaces/${s.site}/`)) report(rec, ['site'], `file must sit in data/spaces/${s.site}/`);
    if (site.kind === 'office') {
      if (!s.floor) report(rec, ['site'], 'a space at an office needs a floor');
      else if (!site.floors.some((f) => f.id === s.floor)) report(rec, ['floor'], `floor "${s.floor}" is not a floor of ${s.site}`);
      if (s.number && s.floor && !s.number.startsWith(`${s.floor}.`)) report(rec, ['number'], `room number "${s.number}" must start with its floor "${s.floor}."`);
      if (s.number) {
        const key = `${s.site} ${s.number}`;
        if (numbers.has(key)) report(rec, ['number'], `room number ${s.number} is already used by ${numbers.get(key)}`);
        numbers.set(key, rec.id);
      }
    }
    const st = spaceTypes.get(s.space_type);
    if (!st) { report(rec, ['space_type'], `space type "${s.space_type}" does not exist`); continue; }
    if (!st.keia_atlas.options.some((o) => o.id === s.option)) {
      report(rec, ['option'], `space type "${s.space_type}" has no option "${s.option}"`);
    }
    const isRemote = st.keia_atlas.category === 'remote';
    if (isRemote !== (site.kind === 'remote')) {
      report(rec, ['space_type'], isRemote ? 'remote space types belong only at a remote site' : 'a remote site holds only remote space types');
    }
    // Home offices (decision 0025): each says its town, country and nearest office, in its own region.
    if (site.kind === 'remote') {
      for (const k of ['town', 'country', 'near']) if (!s[k]) report(rec, [], `a home office needs its ${k}`);
      const near = s.near ? sites.get(s.near) : null;
      if (s.near && (!near || near.kind !== 'office')) report(rec, ['near'], `near "${s.near}" is not an office`);
      else if (near && site.region && near.region !== site.region) report(rec, ['near'], `near "${s.near}" is in ${near.region}, but ${s.site} is the remote site for ${site.region}`);
    } else {
      for (const k of ['town', 'country', 'near']) if (s[k]) report(rec, [k], `only home offices have a ${k}; a room at an office takes the site's`);
    }
  }

  // Installs: what is actually in each space.
  const spaces = new Map(inFolder('spaces').map((r) => [r.id, r.data]));
  const seenSerial = new Map(), seenTag = new Map(), seenHost = new Map();
  const installedClasses = new Map();
  const installed = new Set();
  for (const rec of inFolder('installs')) {
    const inst = rec.data;
    const space = spaces.get(inst.space);
    if (!space) { report(rec, ['space'], `space "${inst.space}" does not exist`); continue; }
    installed.add(inst.space);
    if (rec.id !== inst.space) report(rec, ['space'], `file name "${rec.id}" must be the space id "${inst.space}"`);
    // Older kit: devices outside today's standard, still installed or retired. The record is only
    // useful if each one has a real model, dates in order, and a serial, tag and hostname of its own.
    (inst.older_kit ?? []).forEach((u, i) => {
      if (!modelIds.has(u.model)) report(rec, ['older_kit', i, 'model'], `device model "${u.model}" does not exist`);
      if (u.installed < '2000-01-01') report(rec, ['older_kit', i, 'installed'], 'the record starts in 2000');
      if (u.retired && u.retired < u.installed) report(rec, ['older_kit', i, 'retired'], `retired ${u.retired} is before installed ${u.installed}`);
      if (u.retired && u.retired > '2026-09-29') report(rec, ['older_kit', i, 'retired'], 'a retired date cannot be in the future');
      if (seenSerial.has(u.serial)) report(rec, ['older_kit', i, 'serial'], `serial ${u.serial} is already used in ${seenSerial.get(u.serial)}`);
      seenSerial.set(u.serial, rec.id);
      if (seenTag.has(u.asset_tag)) report(rec, ['older_kit', i, 'asset_tag'], `asset tag ${u.asset_tag} is already used in ${seenTag.get(u.asset_tag)}`);
      seenTag.set(u.asset_tag, rec.id);
      if (u.hostname) {
        if (seenHost.has(u.hostname)) report(rec, ['older_kit', i, 'hostname'], `hostname ${u.hostname} is already used in ${seenHost.get(u.hostname)}`);
        seenHost.set(u.hostname, rec.id);
      }
      const cls = models.get(u.model)?.class;
      if (cls && !installedClasses.has(cls)) installedClasses.set(cls, rec.id);
    });
    const option = spaceTypes.get(space.space_type)?.keia_atlas.options.find((o) => o.id === space.option);
    // Spare units: boxes on the shelves of an IT store. Each has a real model, its own serial and tag, and a
    // cabinet and shelf that the store's room profile option really has.
    if ((inst.spare_units ?? []).length && space.space_type !== 'it-store') report(rec, ['spare_units'], `spare units belong in an IT store, and ${inst.space} is a ${space.space_type}`);
    const shelves = new Map((option?.storage ?? []).map((c) => [c.name, new Set(c.shelves)]));
    (inst.spare_units ?? []).forEach((u, i) => {
      if (!modelIds.has(u.model)) report(rec, ['spare_units', i, 'model'], `device model "${u.model}" does not exist`);
      if (u.arrived < '2000-01-01') report(rec, ['spare_units', i, 'arrived'], 'the record starts in 2000');
      if (u.arrived > '2026-09-29') report(rec, ['spare_units', i, 'arrived'], 'a spare cannot have arrived in the future');
      if (seenSerial.has(u.serial)) report(rec, ['spare_units', i, 'serial'], `serial ${u.serial} is already used in ${seenSerial.get(u.serial)}`);
      seenSerial.set(u.serial, rec.id);
      if (seenTag.has(u.asset_tag)) report(rec, ['spare_units', i, 'asset_tag'], `asset tag ${u.asset_tag} is already used in ${seenTag.get(u.asset_tag)}`);
      seenTag.set(u.asset_tag, rec.id);
      if (!shelves.has(u.cabinet)) report(rec, ['spare_units', i, 'cabinet'], `"${u.cabinet}" is not a cabinet of ${space.space_type} / ${space.option}`);
      else if (!shelves.get(u.cabinet).has(u.shelf)) report(rec, ['spare_units', i, 'shelf'], `"${u.shelf}" is not a shelf of ${u.cabinet}`);
    });
    if (!option) continue;
    const items = new Map(option.equipment.map((e) => [e.key, e]));
    for (const [i, k] of (inst.fitted ?? []).entries()) {
      if (items.get(k)?.requirement !== 'optional') report(rec, ['fitted', i], `"${k}" is not an optional item of ${space.space_type} / ${space.option}`);
    }
    // Expected positions: every required item, plus fitted optional ones, per repeated unit.
    const fitted = new Set(inst.fitted ?? []);
    const expected = new Map();
    const count = space.count ?? 1;
    const prefix = space.space_type === 'remote-home' ? 'kit' : 'desk';
    for (let u = 1; u <= count; u++) {
      const pre = count > 1 ? `${prefix}-${String(u).padStart(2, '0')}/` : '';
      for (const e of option.equipment) {
        if (e.requirement === 'optional' && !fitted.has(e.key)) continue;
        if (e.quantity === 'tbd' && !e.model) continue;
        const n = e.quantity === 'tbd' ? (inst.positions.filter((p) => p.position.startsWith(pre + e.key)).length || 1) : e.quantity;
        for (let j = 1; j <= n; j++) expected.set(`${pre}${e.key}${n > 1 ? `#${j}` : ''}`, e);
      }
    }
    const got = new Set();
    inst.positions.forEach((p, i) => {
      const e = expected.get(p.position);
      if (!e) { report(rec, ['positions', i, 'position'], `"${p.position}" is not a position of ${space.space_type} / ${space.option}`); return; }
      got.add(p.position);
      if ((e.model ?? null) !== (p.model ?? null)) report(rec, ['positions', i, 'model'], `${p.position} should be ${e.model ?? 'without a model'}, not ${p.model ?? 'blank'}`);
      const live = p.units.filter((u) => !u.legacy);
      if (live.length !== 1) report(rec, ['positions', i, 'units'], `${p.position} needs exactly one current unit (and at most one legacy unit)`);
      if (p.hostname) {
        if (seenHost.has(p.hostname)) report(rec, ['positions', i, 'hostname'], `hostname ${p.hostname} is already used in ${seenHost.get(p.hostname)}`);
        seenHost.set(p.hostname, rec.id);
      }
      p.units.forEach((u, j) => {
        // A unit may be a different model from its position's (an outgoing switch): it must be a real model, of the same class.
        if (u.model) {
          if (!modelIds.has(u.model)) report(rec, ['positions', i, 'units', j, 'model'], `device model "${u.model}" does not exist`);
          else if (p.model && models.get(u.model)?.class !== models.get(p.model)?.class) report(rec, ['positions', i, 'units', j, 'model'], `${u.model} is a different class from the position's ${p.model}`);
        }
        if (seenSerial.has(u.serial)) report(rec, ['positions', i, 'units', j, 'serial'], `serial ${u.serial} is already used in ${seenSerial.get(u.serial)}`);
        seenSerial.set(u.serial, rec.id);
        if (seenTag.has(u.asset_tag)) report(rec, ['positions', i, 'units', j, 'asset_tag'], `asset tag ${u.asset_tag} is already used in ${seenTag.get(u.asset_tag)}`);
        seenTag.set(u.asset_tag, rec.id);
      });
    });
    for (const k of expected.keys()) if (!got.has(k)) report(rec, ['positions'], `missing position ${k}`);
  }

  // Refresh policy: every class it names exists, every installed class has a policy,
  // sources exist, and each task's low estimate is not above its high one.
  for (const rec of inFolder('spaces')) {
    const t = spaceTypes.get(rec.data.space_type);
    const opt = t?.keia_atlas?.options?.find((o) => o.id === rec.data.option);
    for (const e of opt?.equipment ?? []) if (!installedClasses.has(e.class)) installedClasses.set(e.class, rec.id);
  }
  for (const rec of inFolder('refresh-policy')) {
    const named = new Set();
    rec.data.classes.forEach((c, i) => {
      if (!classIds.has(c.class)) report(rec, ['classes', i, 'class'], `device class "${c.class}" does not exist`);
      if (named.has(c.class)) report(rec, ['classes', i, 'class'], `device class "${c.class}" is listed twice`);
      named.add(c.class);
    });
    for (const [cls] of installedClasses) if (classIds.has(cls) && !named.has(cls)) report(rec, ['classes'], `no refresh policy for device class "${cls}", which spaces use`);
    rec.data.tasks.forEach((t, i) => {
      if (t.low > t.high) report(rec, ['tasks', i, 'low'], `${t.task}: low estimate ${t.low} is above high ${t.high}`);
    });
    rec.data.sources.forEach((s, i) => {
      if (!sourceIds.has(s.source)) report(rec, ['sources', i, 'source'], `source id "${s.source}" does not exist`);
    });
    if (rec.data.horizon.from > rec.data.horizon.to) report(rec, ['horizon'], 'the horizon starts after it ends');
  }

  // Projects (demo data): their site, spaces and people must exist.
  const siteIdSet = new Set(inFolder('sites').map((r) => path.basename(r.file, '.yaml')));
  const spaceIdSet = new Set(inFolder('spaces').map((r) => path.basename(r.file, '.yaml')));
  const people = new Set(PEOPLE.map((p) => p.id));
  const projectIds = new Set();
  const playbookIds = new Set(inFolder('playbooks').map((r) => r.data.id));
  // Playbooks may skip phases (decision 0025), but each phase appears once and in order.
  const PHASE_ORDER = ['plan', 'design', 'procure', 'integrate', 'handover', 'closed'];
  const playbookPhases = new Map(inFolder('playbooks').map((r) => [r.data.id, r.data.phases.map((ph) => ph.phase)]));
  for (const rec of inFolder('playbooks')) {
    rec.data.phases.forEach((ph, i) => {
      const prev = rec.data.phases[i - 1];
      if (prev && PHASE_ORDER.indexOf(ph.phase) <= PHASE_ORDER.indexOf(prev.phase)) report(rec, ['phases', i, 'phase'], `phase "${ph.phase}" comes after "${prev.phase}": phases appear once, in order`);
      (ph.steps ?? []).forEach((st, j) => { if (st.step && ph.phase !== 'integrate') report(rec, ['phases', i, 'steps', j, 'step'], `only Deploy steps have a device step, not ${ph.phase}`); });
    });
  }
  for (const rec of inFolder('projects')) {
    const d = rec.data;
    if (projectIds.has(d.id)) report(rec, ['id'], `project id "${d.id}" is used twice`);
    projectIds.add(d.id);
    if (!siteIdSet.has(d.site)) report(rec, ['site'], `site "${d.site}" does not exist`);
    if (!people.has(d.owner)) report(rec, ['owner'], `person "${d.owner}" is not one of the demo people`);
    (d.roles ?? []).forEach((r, i) => { if (!people.has(r.person)) report(rec, ['roles', i, 'person'], `person "${r.person}" is not one of the demo people`); });
    (d.history ?? []).forEach((h, i) => { if (h.signed_off_by && !people.has(h.signed_off_by)) report(rec, ['history', i, 'signed_off_by'], `person "${h.signed_off_by}" is not one of the demo people`); });
    if (d.playbook && !playbookIds.has(d.playbook)) report(rec, ['playbook'], `playbook "${d.playbook}" does not exist`);
    const pbPhases = playbookPhases.get(d.playbook);
    if (pbPhases && !pbPhases.includes(d.phase)) report(rec, ['phase'], `the ${d.playbook} playbook has no ${d.phase} phase`);
    (d.history ?? []).forEach((h, i) => (h.steps ?? []).forEach((st, j) => {
      if (h.phase !== 'integrate') report(rec, ['history', i, 'steps', j], `only the Deploy phase has device steps, not ${h.phase}`);
      if (st.signed_off_by && !people.has(st.signed_off_by)) report(rec, ['history', i, 'steps', j, 'signed_off_by'], `person "${st.signed_off_by}" is not one of the demo people`);
    }));
    d.spaces.forEach((s, i) => { if (!spaceIdSet.has(s.space)) report(rec, ['spaces', i, 'space'], `space "${s.space}" does not exist`); });
    d.tasks.forEach((t, i) => {
      if (t.space && !spaceIdSet.has(t.space)) report(rec, ['tasks', i, 'space'], `space "${t.space}" does not exist`);
      if (!people.has(t.owner)) report(rec, ['tasks', i, 'owner'], `person "${t.owner}" is not one of the demo people`);
      if (t.status === 'done' && !t.captured_fix && !t.nothing_new) report(rec, ['tasks', i], `${t.id} is done but has neither a captured fix nor a "nothing new" reason`);
      if (t.status === 'blocked' && !t.blocked_by) report(rec, ['tasks', i], `${t.id} is blocked but doesn't say by what`);
      if (t.start && !t.due) report(rec, ['tasks', i, 'start'], `${t.id} has a start but no due date`);
      if (t.start && t.due && t.start > t.due) report(rec, ['tasks', i, 'start'], `${t.id} starts ${t.start}, after it is due (${t.due})`);
    });
    // The log (risks, issues, decisions, dependencies) and change requests: the people, tasks,
    // rooms and incidents they name must exist, and each id is used once.
    const ownTasks = new Set(d.tasks.map((t) => t.id));
    const incidentNumbers = new Set(inFolder('incidents').map((r) => String(r.data.number).toUpperCase()));
    const seenLog = new Set();
    (d.log ?? []).forEach((l, i) => {
      if (seenLog.has(l.id)) report(rec, ['log', i, 'id'], `log id "${l.id}" is used twice`);
      seenLog.add(l.id);
      if (!people.has(l.owner)) report(rec, ['log', i, 'owner'], `person "${l.owner}" is not one of the demo people`);
      if (l.task && !ownTasks.has(l.task)) report(rec, ['log', i, 'task'], `task "${l.task}" is not on this project`);
      if (l.room && !spaceIdSet.has(l.room)) report(rec, ['log', i, 'room'], `space "${l.room}" does not exist`);
      if (l.incident && !incidentNumbers.has(String(l.incident).toUpperCase())) report(rec, ['log', i, 'incident'], `incident "${l.incident}" does not exist`);
      if (l.kind === 'decision' && l.status === 'closed' && !l.decided) report(rec, ['log', i], `${l.id} is a decision that is decided but has no decided date`);
    });
    (d.changes ?? []).forEach((c, i) => {
      if (!people.has(c.proposed_by)) report(rec, ['changes', i, 'proposed_by'], `person "${c.proposed_by}" is not one of the demo people`);
      if (!people.has(c.approver)) report(rec, ['changes', i, 'approver'], `person "${c.approver}" is not one of the demo people`);
      if (c.status !== 'proposed' && !c.decided) report(rec, ['changes', i], `${c.id} is ${c.status} but has no decided date`);
    });
  }

  // People (src/lib/demo.mjs): each base is an office or a home office, each office an office, and
  // office days are weekdays. A home office belongs to one person at most. Only where there are sites
  // to check against (the test fixtures have none).
  const homeOwner = new Map();
  for (const p of sites.size ? PEOPLE : []) {
    const bad = (m) => problems.push({ file: 'src/lib/demo.mjs', at: [], message: `${p.id}: ${m}` });
    const home = spaces.get(p.base);
    if (home) {
      if (sites.get(home.site)?.kind !== 'remote') bad(`base "${p.base}" is a room at an office, not a home office`);
      if (homeOwner.has(p.base)) bad(`home office "${p.base}" is already ${homeOwner.get(p.base)}'s`);
      homeOwner.set(p.base, p.id);
      if (home.near && home.near !== p.office) bad(`works from ${p.base}, near ${home.near}, but goes to ${p.office} on office days`);
    } else if (sites.get(p.base)?.kind !== 'office') bad(`base "${p.base}" is neither an office nor a home office`);
    if (sites.get(p.office)?.kind !== 'office') bad(`office "${p.office}" is not an office`);
    for (const d of p.office_days ?? []) if (!['mon', 'tue', 'wed', 'thu', 'fri'].includes(d)) bad(`"${d}" is not a weekday`);
  }

  // Lab tests, incidents and the year plan (demo data): the people, models, rooms and projects they name must exist.
  const modelIdSet = new Set(inFolder('device-models').map((r) => path.basename(r.file, '.yaml')));
  const who = (rec, at, id) => { if (id && !people.has(id)) report(rec, at, `person "${id}" is not one of the demo people`); };
  for (const rec of inFolder('lab')) {
    const d = rec.data;
    who(rec, ['owner'], d.owner); (d.with ?? []).forEach((w, i) => who(rec, ['with', i], w)); who(rec, ['decided_by'], d.decided_by);
    (d.models ?? []).forEach((m, i) => { if (!modelIdSet.has(m)) report(rec, ['models', i], `device model "${m}" does not exist`); });
    if (d.project && !projectIds.has(d.project)) report(rec, ['project'], `project "${d.project}" does not exist`);
  }
  const taskIds = new Set(inFolder('projects').flatMap((r) => r.data.tasks.map((t) => t.id)));
  // Incidents: subject, lifecycle, people and linked work (their own file, tools/crossrefs-incidents.mjs).
  problems.push(...crossCheckIncidents(records, { people, taskIds }));
  // Standing rules and the incidents that name them (tools/crossrefs-rules.mjs).
  problems.push(...crossCheckRules(records, { people }));
  // Known issues and maker cases (their own file, tools/crossrefs-knownissues.mjs, decision 0029).
  problems.push(...crossCheckKnownIssues(records, { people }));
  for (const rec of inFolder('plan')) {
    const d = rec.data;
    d.owners.forEach((o, i) => who(rec, ['owners', i], o));
    d.pipeline.forEach((w, i) => { if (!siteIdSet.has(w.site)) report(rec, ['pipeline', i, 'site'], `site "${w.site}" does not exist`); });
    d.events.forEach((e, i) => (e.who ?? []).forEach((w, j) => who(rec, ['events', i, 'who', j], w)));
  }

  // Planning (demo data): the offices, device classes and people it names must exist, and each kind of file appears once.
  const planningKinds = new Map();
  for (const rec of inFolder('planning')) {
    const d = rec.data;
    if (planningKinds.has(d.kind)) report(rec, ['kind'], `planning file of kind "${d.kind}" is already ${planningKinds.get(d.kind)}`);
    planningKinds.set(d.kind, rec.id);
    if (d.kind === 'headcount') {
      for (const s of Object.keys(d.staff)) if (!siteIdSet.has(s)) report(rec, ['staff', s], `site "${s}" does not exist`);
    }
    if (d.kind === 'ratios') {
      for (const [k, sz] of Object.entries(d.office_sizes)) if (!siteIdSet.has(sz.like)) report(rec, ['office_sizes', k, 'like'], `site "${sz.like}" does not exist`);
    }
    if (d.kind === 'budget') {
      for (const c of Object.keys(d.unit_price)) if (!classIds.has(c)) report(rec, ['unit_price', c], `device class "${c}" does not exist`);
      const seenYear = new Set();
      d.envelopes.forEach((e, i) => { if (seenYear.has(e.year)) report(rec, ['envelopes', i, 'year'], `${e.year} has two envelopes`); seenYear.add(e.year); });
    }
    if (d.kind === 'scenarios') {
      const seenId = new Set();
      d.scenarios.forEach((s, i) => {
        if (seenId.has(s.id)) report(rec, ['scenarios', i, 'id'], `scenario "${s.id}" is listed twice`);
        seenId.add(s.id);
        who(rec, ['scenarios', i, 'owner'], s.owner);
        s.changes.forEach((c, j) => { if (c.op === 'early' && !classIds.has(c.class)) report(rec, ['scenarios', i, 'changes', j, 'class'], `device class "${c.class}" does not exist`); });
      });
    }
  }

  // Firmware, advisories, model choices and configurations: every model, source, advisory and Lab test they name must exist.
  const sourceIdSet = new Set(inFolder('sources').flatMap((r) => r.data.entries.map((e) => e.id)));
  const advIdSet = new Set(inFolder('advisories').map((r) => r.data.id));
  const labIdSet = new Set(inFolder('lab').map((r) => r.data.id));
  const fwIdSet = new Set(inFolder('firmware').map((r) => r.data.id));
  const cfgIdSet = new Set(inFolder('configurations').map((r) => r.data.id));
  const needModel = (rec, at, m) => { if (!modelIdSet.has(m)) report(rec, at, `device model "${m}" does not exist`); };
  const needSource = (rec, at, id) => { if (id && !sourceIdSet.has(id)) report(rec, at, `source "${id}" is not in data/sources`); };
  for (const rec of inFolder('advisories')) {
    rec.data.models.forEach((m, i) => needModel(rec, ['models', i], m));
    rec.data.sources.forEach((id, i) => needSource(rec, ['sources', i], id));
    who(rec, ['owner'], rec.data.owner);
  }
  for (const rec of inFolder('firmware')) {
    rec.data.models.forEach((m, i) => needModel(rec, ['models', i], m));
    rec.data.releases.forEach((r, i) => {
      needSource(rec, ['releases', i, 'source'], r.source);
      if (r.advisory && !advIdSet.has(r.advisory)) report(rec, ['releases', i, 'advisory'], `advisory "${r.advisory}" does not exist`);
      if (r.lab && !labIdSet.has(r.lab)) report(rec, ['releases', i, 'lab'], `Lab test "${r.lab}" does not exist`);
    });
  }
  for (const rec of inFolder('model-choices')) {
    const d = rec.data;
    needModel(rec, ['model'], d.model); who(rec, ['decided_by'], d.decided_by);
    d.why.forEach((w, i) => needSource(rec, ['why', i, 'source'], w.source));
    d.platforms.forEach((p, i) => needSource(rec, ['platforms', i, 'source'], p.source));
    if (d.firmware && !fwIdSet.has(d.firmware)) report(rec, ['firmware'], `firmware line "${d.firmware}" does not exist`);
    if (d.configuration && !cfgIdSet.has(d.configuration)) report(rec, ['configuration'], `configuration "${d.configuration}" does not exist`);
  }
  for (const rec of inFolder('configurations')) {
    const d = rec.data;
    d.models.forEach((m, i) => needModel(rec, ['models', i], m)); who(rec, ['owner'], d.owner);
    d.groups.forEach((g, gi) => g.settings.forEach((st, si) => {
      needSource(rec, ['groups', gi, 'settings', si, 'source'], st.source);
      if (st.advisory && !advIdSet.has(st.advisory)) report(rec, ['groups', gi, 'settings', si, 'advisory'], `advisory "${st.advisory}" does not exist`);
    }));
    // Setup order: ids are unique, and a step can only wait for a step that comes before it, with a reason.
    const seenStep = new Set();
    (d.setup ?? []).forEach((st, i) => {
      needSource(rec, ['setup', i, 'source'], st.source);
      if (seenStep.has(st.id)) report(rec, ['setup', i, 'id'], `setup step "${st.id}" is used twice`);
      (st.after ?? []).forEach((a, j) => {
        if (!seenStep.has(a)) report(rec, ['setup', i, 'after', j], `setup step "${st.id}" waits for "${a}", which is not an earlier step`);
      });
      if (st.after?.length && !st.why_order) report(rec, ['setup', i, 'why_order'], `setup step "${st.id}" waits for another step but does not say why`);
      seenStep.add(st.id);
    });
  }

  // House values: each VLAN is in the network standard's VLAN plan, each class and configuration exists, and a
  // class sits on one VLAN only.
  const netStd = inFolder('standards').find((r) => r.data.id === 'network')?.data;
  const planVlans = new Set((netStd?.sections ?? []).find((s) => s.id === 'vlans')?.table?.rows?.map((row) => String(row[0])) ?? []);
  for (const rec of inFolder('house-values')) {
    const onVlan = new Map();
    rec.data.vlans.forEach((v, i) => {
      if (!planVlans.has(v.vlan)) report(rec, ['vlans', i, 'vlan'], `VLAN ${v.vlan} is not in the network standard's VLAN plan`);
      v.classes.forEach((c, j) => {
        if (!classIds.has(c)) report(rec, ['vlans', i, 'classes', j], `device class "${c}" does not exist`);
        if (onVlan.has(c)) report(rec, ['vlans', i, 'classes', j], `device class "${c}" is already on VLAN ${onVlan.get(c)}`);
        onVlan.set(c, v.vlan);
      });
    });
    rec.data.platforms.forEach((p, i) => p.configurations.forEach((c, j) => {
      if (!cfgIdSet.has(c)) report(rec, ['platforms', i, 'configurations', j], `configuration "${c}" does not exist`);
    }));
  }

  // Vendors (demo data): their people, owner, sites and covered models must exist.
  for (const rec of inFolder('vendors')) {
    const d = rec.data;
    who(rec, ['owner'], d.owner); (d.people ?? []).forEach((w, i) => who(rec, ['people', i], w));
    (d.sites ?? []).forEach((x, i) => { if (!siteIdSet.has(x)) report(rec, ['sites', i], `site "${x}" does not exist`); });
    (d.contract.covers_models ?? []).forEach((m, i) => needModel(rec, ['contract', 'covers_models', i], m));
  }

  // Racks: every item's equipment must be in the rack equipment catalogue.
  const gearIds = new Set(inFolder('rack-gear').map((r) => r.data.id));
  const gearById = new Map(inFolder('rack-gear').map((r) => [r.data.id, r.data]));
  const installById = new Map(inFolder('installs').map((r) => [r.data.space, r.data]));
  const spaceTypeById = spaceTypes, spaceById = spaces;
  for (const rec of [...inFolder('racks'), ...inFolder('rack-layouts')]) {
    const d = rec.data;
    if (d.gear && !gearIds.has(d.gear)) report(rec, ['gear'], `rack equipment "${d.gear}" does not exist`);
    (d.side_pdus ?? []).forEach((x, i) => { if (!gearIds.has(x.gear)) report(rec, ['side_pdus', i, 'gear'], `rack equipment "${x.gear}" does not exist`); });
    d.items.forEach((it, i) => { if (it.gear && !gearIds.has(it.gear)) report(rec, ['items', i, 'gear'], `rack equipment "${it.gear}" does not exist`); });
    // Nothing may overlap, and everything must fit.
    const used = new Map();
    d.items.forEach((it, i) => { for (let u = it.u; u < it.u + it.size; u++) { if (u > d.height_u) report(rec, ['items', i, 'u'], `goes above the top of the rack (U${d.height_u})`); if (used.has(u)) report(rec, ['items', i, 'u'], `U${u} is already used by item ${used.get(u)}`); used.set(u, i); } });
    // A recorded replacement names real equipment that was the same height.
    d.items.forEach((it, i) => {
      if (!it.replaced) return;
      const old = gearById.get(it.replaced.gear);
      if (!old) report(rec, ['items', i, 'replaced', 'gear'], `rack equipment "${it.replaced.gear}" does not exist`);
      else if (old.rack_units && old.rack_units !== it.size) report(rec, ['items', i, 'replaced', 'gear'], `${it.replaced.gear} is ${old.rack_units}U, but this slot is ${it.size}U`);
    });
    // A rack stands in a room (data/racks), or is the typical layout of a room type's build option (data/rack-layouts).
    if (rec.folder === 'racks' && !d.space) report(rec, ['space'], 'a rack in data/racks needs the space it stands in');
    if (rec.folder === 'rack-layouts' && (d.space || !d.space_type || !d.option)) report(rec, [], 'a typical layout names a space_type and option, and no space');
    if (!d.space && !d.space_type) report(rec, [], 'a rack needs a space, or a space_type and option for a typical layout');
    if (!d.space && d.space_type) {
      const opt = spaceTypeById.get(d.space_type)?.keia_atlas.options.find((o) => o.id === d.option);
      if (!opt) report(rec, ['option'], `room type "${d.space_type}" has no build option "${d.option}"`);
    }
    // A rack item at a recorded position shows the model the room's install records there.
    if (d.space) {
      const inst = installById.get(d.space), sp = spaceById.get(d.space);
      const opt = sp && spaceTypeById.get(sp.space_type)?.keia_atlas.options.find((o) => o.id === sp.option);
      d.items.forEach((it, i) => {
        if (!it.position) return;
        const p = inst?.positions.find((x) => x.position === it.position);
        if (!p) { report(rec, ['items', i, 'position'], `${d.space} has no install position "${it.position}"`); return; }
        const want = p.model ?? opt?.equipment.find((e) => e.key === it.position.replace(/#\d+$/, ''))?.model ?? null;
        const have = it.gear ? gearById.get(it.gear)?.device_model ?? null : null;
        if (want && have && want !== have) report(rec, ['items', i, 'gear'], `${it.position} is recorded as ${want}, but the rack shows ${it.gear}`);
      });
    }
  }
  // Rack equipment that names a device model must name one that exists.
  for (const rec of inFolder('rack-gear')) {
    if (rec.data.device_model && !modelIds.has(rec.data.device_model)) report(rec, ['device_model'], `device model "${rec.data.device_model}" does not exist`);
  }

  // Spares, cables and the cable standard (their own file, tools/crossrefs-stock.mjs).
  problems.push(...crossCheckStock(records));
  problems.push(...crossCheckFloors(records));
  problems.push(...crossCheckPrivacy(records));
  problems.push(...crossCheckConnected(records));
  problems.push(...crossCheckSwitchPorts(records));

  return problems;
}
