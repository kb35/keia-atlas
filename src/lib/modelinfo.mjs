// What the models pages show about each model, worked out once: how many are installed, in which
// rooms, how long they have been in service (from each unit's own install date), the firmware position,
// and a plain line on what the model is for.
import { models, classes, spaceTypes, modelChoices, firmwareFor, standardFirmware, typesUsing, className, sites, DEMO_TODAY } from './data.mjs';
import { records, fmtYears, lifeOf } from './refresh.mjs';

const byModel = {};
for (const r of records) if (r.model) (byModel[r.model] ??= []).push(r);
const today = +DEMO_TODAY.slice(0, 4);
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function modelFacts(id) {
  const m = models[id];
  const all = byModel[id] ?? [];
  const live = all.filter((r) => r.status !== 'retired');
  const gone = all.filter((r) => r.status === 'retired');
  const rooms = new Map();
  for (const r of live) rooms.set(r.space.id, r.space);
  const siteSet = new Set(live.map((r) => r.space.site));
  const dated = live.filter((r) => r.dated);
  const yrs = dated.map((r) => r.yearsIn);
  const older = all.some((r) => r.older);
  const ch = modelChoices[id];
  const types = [...(typesUsing[id] ?? [])].map((t) => spaceTypes[t].profile.name);

  // Firmware: a tracked line with a standard release, a vendor end-of-support date, or nothing tracked.
  const line = firmwareFor(id), std = standardFirmware(id);
  const eos = m.lifecycle?.end_of_support;
  let fw;
  if (line && std) fw = { tone: 'ok', label: `Standard ${std.version.replace(/[-.]\d{5,}$/, '')}`, sub: line.name };
  else if (eos && +eos.slice(0, 4) <= today) fw = { tone: 'warn', label: `Support ended ${eos.slice(0, 4)}`, sub: 'No more updates from the vendor' };
  else if (eos) fw = { tone: 'ok', label: `Supported to ${eos.slice(0, 4)}`, sub: 'Vendor end of support' };
  else fw = { tone: 'off', label: 'Not tracked', sub: 'No firmware line yet' };

  // What it is for: the reason it was chosen, else where it is used, else what an older model is.
  const role = classes[m.class]?.profile.object_role;
  let purpose;
  const usedIn = types.length ? `Used in ${types.slice(0, 3).join(' · ')}${types.length > 3 ? ` and ${types.length - 3} more` : ''}.` : '';
  if (ch?.why?.[0]) purpose = `${ch.why[0].point} ${usedIn}`.trim();
  else if (types.length) purpose = `${role ? `${role.replace(/\.$/, '').replace(/^./, (c) => c.toUpperCase())}. ` : ''}${usedIn}`;
  else if (older) purpose = `An older ${lower(className(m.class))} from before today's standard. It is kept on record because ${live.length ? `${live.length === 1 ? 'one is' : `${live.length} are`} still installed and due for replacement` : 'it was in service and has since been taken out'}.`;
  else purpose = `${className(m.class)}, not yet placed in a space type.`;

  // Install years, for the small histogram.
  const perYear = {};
  for (const r of all) if (r.dated) (perYear[r.installedYear] ??= { live: 0, gone: 0 })[r.status === 'retired' ? 'gone' : 'live']++;
  const oldestOut = dated.length ? Math.max(...yrs) : null;
  const overdue = live.filter((r) => r.dated && r.due < today).length;

  return {
    purpose, older, installed: live.length, retired: gone.length, rooms: [...rooms.values()], sites: [...siteSet].map((s) => sites[s]?.code ?? s),
    years: yrs.length ? { min: Math.min(...yrs), max: Math.max(...yrs), label: Math.max(...yrs) < 1 ? 'under a year' : Math.min(...yrs).toFixed(0) === Math.max(...yrs).toFixed(0) ? fmtYears(Math.max(...yrs)) : `${Math.min(...yrs) < 1 ? 'under 1' : Math.min(...yrs).toFixed(0)} to ${Math.max(...yrs).toFixed(0)} years` } : null,
    oldestOut, overdue, life: lifeOf(m.class), fw, perYear, types, why: ch?.why ?? [], status: ch?.status ?? (older ? 'legacy' : types.length ? 'standard' : null),
  };
}
export const allFacts = Object.fromEntries(Object.keys(models).map((id) => [id, modelFacts(id)]));

// Ports counted by connector, for the compact strip.
export function portCounts(m) {
  const c = new Map();
  for (const p of m.ports ?? []) {
    const k = p.connector;
    const e = c.get(k) ?? { connector: k, n: 0, ins: 0, outs: 0, sample: p };
    e.n++; if (p.direction === 'in') e.ins++; if (p.direction === 'out') e.outs++;
    c.set(k, e);
  }
  return [...c.values()].sort((a, b) => b.n - a.n);
}
