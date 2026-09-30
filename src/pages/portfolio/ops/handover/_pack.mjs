// Put a handover pack together for a page (the Astro side: Deploy's room tests need the site's data layer). The pack's
// own logic is handoverPack() in src/lib/provider-ops.mjs; this only gathers its inputs from the record.
import { projects, href } from '../../../../lib/data.mjs';
import { integratePlan } from '../../../../lib/integrate.mjs';
import { loadOps } from '../../../../lib/provider-ops-load.mjs';
import { handoverPack } from '../../../../lib/provider-ops.mjs';
import { contractClock } from '../../../../lib/vendors.mjs';
import { ORGS, orgName } from '../../../../lib/engagements.mjs';
import { PEOPLE } from '../../../../lib/demo.mjs';

const plans = new Map();
const planOf = (prj) => {
  if (!plans.has(prj)) { const p = Object.values(projects).find((x) => x.id === prj); plans.set(prj, p ? integratePlan(p) : null); }
  return plans.get(prj);
};

export function packs() {
  const L = loadOps();
  const H = L.handovers ?? { packs: [], warranty: [] };
  return H.packs.map((pk) => {
    const job = L.jobs.find((j) => j.id === pk.job);
    const plan = job?.ref?.startsWith('PRJ-') ? planOf(job.ref) : null;
    const rooms = (plan?.rooms ?? []).filter((r) => (job.spaces ?? []).includes(r.id)).map((r) => ({
      id: r.id, name: r.name.replace(/^(\S+) (.*\1.*)$/, '$2'), tests: r.tests, results: r.base.tests, signed: r.base.signed, signedName: PEOPLE.find((p) => p.id === r.base.signed)?.name ?? null,
    }));
    const units = L.unitsOf(job);
    const docs = L.docsOf(units.map((u) => u.model));
    for (const d of Object.values(docs)) if (d.guide) d.guide.href = href(d.guide.to);
    const snags = L.snagsOf(job).map((s) => ({ ...s, clock: contractClock(s) }));
    const accepted = pk.accepted ? PEOPLE.find((p) => p.id === pk.accepted.by)?.name ?? pk.accepted.by : null;
    const P = handoverPack({ pack: pk, job, units, ports: L.portsOf(job.site), rooms, docs, terms: H.warranty, snags, names: { client: orgName(job.client), provider: ORGS[L.provider]?.name, accepted } });
    return { ...P, facts: L.factsOf(job), acceptedName: accepted, project: job.ref, remaining: plan ? plan.rooms.filter((r) => !['done', 'snags'].includes(r.state)).length : 0, roomsAll: plan?.rooms.length ?? 0 };
  });
}
