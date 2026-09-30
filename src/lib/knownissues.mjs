// Known issues (decision 0029): what makers publish about faults in their own firmware, matched to Aigna's
// fleet and incidents, and the other way round, repeats across the fleet that no maker has published yet.
//
// The pure rules live here, so they can be tested on small made-up inputs (tests/knownissues.test.mjs). The
// build-time wiring to the real data is src/lib/knownissues-view.mjs.
//
// Nothing here closes, links or sends anything. A match is a proposal with a confidence in words; a person
// confirms it, and every confirmation goes through the live layer (who, when, undo).

export const KI_STATUS = { open: 'Open', fixed: 'Fixed', 'wont-fix': "Won't fix" };
export const KI_TONE = { open: 'warn', fixed: 'manage', 'wont-fix': 'plain' };
export const CONFIDENCE = { strong: 'Strong match', possible: 'Possible match' };
export const AFFECTS = { yes: 'Affects us', maybe: 'May affect us', no: "Doesn't affect us" };
// A maker case, from Aigna's first draft to the maker's answer. "draft" only ever lives in the live layer.
export const CASE_STATUS = { draft: 'Being prepared', sent: 'Sent', acknowledged: 'Acknowledged', investigating: 'Manufacturer investigating', published: 'Known error published', closed: 'Closed' };
export const CASE_ORDER = ['draft', 'sent', 'acknowledged', 'investigating', 'published', 'closed'];
// Resolutions that say the ticket was not a fault of the device: they never count towards a match or a repeat.
export const EXPLAINED = ['duplicate', 'cancelled', 'no-fault-found'];
// A repeat across the fleet: the same model and symptom, three or more times in 30 days, or twice or more in
// two or more offices.
export const CLUSTER_RULE = { days: 30, count: 3, sites: 2 };

// Does a version fall in a list the maker published? "4.6.2.460046" is exact; "1.12.x" covers 1.12.anything.
export function versionIn(v, list = []) {
  if (!v) return false;
  return list.some((p) => {
    if (!/x/i.test(p)) return p === v;
    const front = p.replace(/\.?x.*$/i, '');
    return v === front || v.startsWith(`${front}.`);
  });
}

// The words for a firmware answer: where it came from matters (the ticket, or device management today).
const FW_FROM = { ticket: 'recorded on the ticket', fleet: 'from device management today' };

// Does an incident look like a known issue? inc: { model, firmware, firmwareFrom, symptom, text, roomModels }.
// Returns null when it can't be the issue (another model, a version the maker says is not affected, a room
// that doesn't meet the maker's condition, no sign of the symptom), otherwise
// { confidence: 'strong' | 'possible', reasons: [{ ok: true | null, text }] }.
// Strong needs all three: the model, a version the maker lists, and the symptom from the guide with at least
// one of the words the maker's description uses. Anything less that still fits is possible.
export function matchIncident(issue, inc) {
  if (!inc.model || !issue.models.includes(inc.model)) return null;
  if (issue.needs?.never) return null;
  if (issue.needs?.with_models?.length && !issue.needs.with_models.some((m) => (inc.roomModels ?? []).includes(m))) return null;
  const reasons = [{ ok: true, text: 'Same model' }];
  let fw = null;
  if (inc.firmware) {
    if (!versionIn(inc.firmware, issue.affected)) return null;
    fw = true;
    reasons.push({ ok: true, text: `On ${inc.firmware}, affected`, title: `An affected version, ${FW_FROM[inc.firmwareFrom] ?? 'reported'}` });
  } else reasons.push({ ok: null, text: 'Version not known', title: 'Keia Atlas has no firmware version for this unit, so the match stays possible' });
  const text = (inc.text ?? '').toLowerCase();
  const symptom = Boolean(inc.symptom && issue.symptoms?.includes(inc.symptom));
  const signs = (issue.signs ?? []).filter((s) => text.includes(s));
  if (!symptom && !signs.length) return null;
  if (symptom) reasons.push({ ok: true, text: 'Same symptom', title: 'The symptom in the device type\'s guide is one the manufacturer describes' });
  if (signs.length) reasons.push({ ok: true, text: `Says "${signs[0]}"`, title: 'Words from the manufacturer\'s description appear in the ticket' });
  const confidence = fw && symptom && signs.length ? 'strong' : 'possible';
  return { confidence, reasons };
}

// Which units run an affected version. unit: { tag, model, site, room, firmware, roomModels }.
// Returns { exposed, unknown, safe } where safe units say why: 'version', 'need' or 'never'.
export function exposure(issue, units) {
  const out = { exposed: [], unknown: [], safe: [] };
  for (const u of units) {
    if (!issue.models.includes(u.model)) continue;
    if (issue.needs?.never) { out.safe.push({ ...u, why: 'never' }); continue; }
    if (issue.needs?.with_models?.length && !issue.needs.with_models.some((m) => (u.roomModels ?? []).includes(m))) { out.safe.push({ ...u, why: 'need' }); continue; }
    if (!u.firmware) out.unknown.push(u);
    else if (versionIn(u.firmware, issue.affected)) out.exposed.push(u);
    else out.safe.push({ ...u, why: 'version' });
  }
  return out;
}
export const affectsUs = (ex) => (ex.exposed.length ? 'yes' : ex.unknown.length ? 'maybe' : 'no');

// Units grouped by site, in the order given (the site order of the data).
export function bySite(list, order) {
  const m = new Map(order.map((s) => [s, []]));
  for (const u of list) (m.get(u.site) ?? m.set(u.site, []).get(u.site)).push(u);
  return [...m].filter(([, l]) => l.length).map(([site, units]) => ({ site, units }));
}

// Repeats across the fleet that no known issue explains. inc: { number, model, symptom, site, opened, explained }.
// `matched` holds the numbers of incidents that already look like a known issue; they are left out, and so is
// any incident that is explained elsewhere (a duplicate, cancelled, no fault found, or tied to project work).
export function findClusters(incs, { today, matched = new Set(), rule = CLUSTER_RULE } = {}) {
  const from = new Date(new Date(`${today.slice(0, 10)}T23:59:00Z`).getTime() - rule.days * 864e5).toISOString().slice(0, 16);
  const groups = new Map();
  for (const i of incs) {
    if (!i.model || !i.symptom || i.explained || matched.has(i.number)) continue;
    if (i.opened < from || i.opened.slice(0, 10) > today.slice(0, 10)) continue;
    const key = `${i.model}|${i.symptom}`;
    (groups.get(key) ?? groups.set(key, []).get(key)).push(i);
  }
  const out = [];
  for (const [key, list] of groups) {
    const sites = [...new Set(list.map((i) => i.site))];
    if (list.length >= rule.count || (list.length >= 2 && sites.length >= rule.sites)) {
      const [model, symptom] = key.split('|');
      list.sort((a, b) => a.opened.localeCompare(b.opened));
      out.push({ key: `${model}--${symptom}`.replace(/_/g, '-'), model, symptom, incidents: list, sites, first: list[0].opened, last: list[list.length - 1].opened,
        why: list.length >= rule.count ? `${list.length} incidents in ${rule.days} days` : `${list.length} incidents in ${sites.length} offices` });
    }
  }
  return out.sort((a, b) => b.incidents.length - a.incidents.length || b.last.localeCompare(a.last));
}

// What fixing it means for Aigna. release: the fixed_in release in the firmware line, if Keia Atlas tracks it;
// rollout: a firmware rollout project that already moves units to that version.
export function fixPlan(issue, { release = null, rollout = null } = {}) {
  if (issue.status === 'open') return { kind: 'none', text: 'No fix yet. Keep the workaround and watch the feed; Keia Atlas says when the manufacturer publishes one.' };
  if (issue.status === 'wont-fix') return { kind: 'wont-fix', text: "The manufacturer won't fix it on the affected versions. Keep the workaround, or move past them in the next rollout." };
  if (release?.status === 'blocked') return { kind: 'blocked', text: `Fixed in ${issue.fixed_in}, which Aigna doesn't install${release.advisory ? ` (${release.advisory})` : ''}. Keep the workaround and ask the manufacturer for the fix on the version you run.` };
  if (rollout) return { kind: 'rollout', text: `Fixed in ${issue.fixed_in}. ${rollout.id} ${rollout.name} already moves units to it.`, project: rollout.id };
  if (release?.status === 'standard') return { kind: 'standard', text: `Fixed in ${issue.fixed_in}, the standard. Update the exposed units to the standard.` };
  return { kind: 'propose', text: `Fixed in ${issue.fixed_in}. No project moves units to it yet: propose a firmware rollout, which starts with a Lab pass.` };
}
