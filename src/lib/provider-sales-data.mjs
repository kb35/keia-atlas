// Loads a provider's sales records (data/providers/<provider>/sales/) and the shared library they draw on (space
// types, device models and classes, setup guides, the client's spaces and installs), then works out every
// opportunity once: its versions, rooms, BOM, labour, quote, options, the diff between versions, the statement of
// work and the handoff. The maths is in src/lib/provider-sales.mjs; this file only reads and joins.
// Used by the pages at build time and by the tests. The validator runs first, so this trusts the data.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { quoteVersion, diffQuotes, buildSow, handoff, pipeline, currentVersion, designRooms, rollUp, estimateLabour, priceQuote } from './provider-sales.mjs';
import { ENGAGEMENTS, orgName, siteName } from './engagements.mjs';
import { PEOPLE } from './demo.mjs';

const readTree = (dir) => {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) Object.assign(out, readTree(full));
    else if (name.endsWith('.yaml')) out[name.slice(0, -5)] = parse(readFileSync(full, 'utf8'));
  }
  return out;
};

/** The shared library and the provider's own records, from the repository at `root`. */
export function loadSales(root = process.cwd(), provider = 'northlight') {
  const data = path.join(root, 'data');
  const recs = Object.values(readTree(path.join(data, 'providers', provider, 'sales')));
  const priceList = recs.find((r) => r.kind === 'price-list');
  const labour = recs.find((r) => r.kind === 'labour');
  const terms = recs.find((r) => r.kind === 'terms');
  const opps = recs.filter((r) => r.kind === 'opportunity').sort((a, b) => a.id.localeCompare(b.id));
  const lib = {
    spaceTypes: readTree(path.join(data, 'space-types')),
    models: readTree(path.join(data, 'device-models')),
    classes: readTree(path.join(data, 'device-classes')),
    guides: Object.values(readTree(path.join(data, 'configurations'))),
    spaces: readTree(path.join(data, 'spaces')),
    installs: readTree(path.join(data, 'installs')),
    prices: Object.fromEntries(priceList.items.map((i) => [i.model, { cost: i.cost, sell: i.sell }])),
  };
  return { provider, priceList, labour, terms, opps, lib };
}

const personName = (id) => PEOPLE.find((p) => p.id === id)?.name ?? null;

/** Every opportunity worked out, and the pipeline. */
export function salesModel(root = process.cwd(), provider = 'northlight') {
  const S = loadSales(root, provider);
  const ctx = { lib: S.lib, labour: S.labour, priceList: S.priceList, terms: S.terms };
  const opps = S.opps.map((o) => {
    const engagement = ENGAGEMENTS.find((e) => e.id === o.engagement) ?? null;
    const clientName = orgName(o.client), providerName = orgName(o.provider);
    const versions = (o.versions ?? []).slice().sort((a, b) => a.v - b.v).map((v) => quoteVersion(o, v.v, ctx));
    const cur = currentVersion(o);
    const current = cur ? versions.find((v) => v.v === cur.v) : null;
    const diffs = versions.slice(1).map((v, i) => diffQuotes(versions[i], v));
    const more = { terms: S.terms, labour: S.labour, clientName, providerName, engagement, contactName: personName(o.contact), installs: S.lib.installs };
    const sow = current ? buildSow(o, current, more) : null;
    const hand = current ? handoff(o, current, more) : null;
    const value = current ? current.quote.totals.sell : o.estimate ?? 0;
    return {
      ...o, slug: o.id.toLowerCase(), clientName, providerName, siteName: siteName(o.client, o.site), contactName: personName(o.contact),
      engagementRec: engagement, fictional: o.client !== 'aigna', versions, current, diffs, sow, handoff: hand, value,
      hasDesign: !!o.design, hasQuote: versions.some((v) => v.status !== 'draft'),
    };
  });
  return { ...S, opps, pipeline: pipeline(opps) };
}

let cache = null;
/** The model, worked out once per build. */
export function sales() {
  if (!cache) cache = salesModel();
  return cache;
}

// Re-exported for the tests' convenience.
export { designRooms, rollUp, estimateLabour, priceQuote };
