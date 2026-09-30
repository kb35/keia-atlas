// Search records for spares and cables, for the main search to merge in.
//
//   import { searchExtra } from './search-extra.mjs';
//   const records = searchExtra();   // [{ kind, id, title, subtitle, url, tokens }]
//
// kind:     'spare' (a stock line of devices and parts) or 'cable' (a patch cable line in a rack, or a spare cable line)
// id:       the record's own id in data/spares or data/cables, for example dub-sp-03 or dub-cb-12
// title:    what a person would call it
// subtitle: site and where it is, with the stock or the two ends
// url:      a full address (base path included) that opens the list already narrowed to this record
// tokens:   ONE lowercase string of everything worth matching, space separated (words, ids, colours, port labels, site and region)
//
// Archived lines are left out, as they are left out of stock and warnings. Nothing here is loaded until it is called.
import { href, REGION_LABEL } from './data.mjs';
import { activeSpares, activeCables } from './stock.mjs';
import { SPARE_KIND } from './cablecore.mjs';

const words = (...parts) => [...new Set(parts.flat().filter((x) => x !== undefined && x !== null && x !== '').join(' ').toLowerCase().split(/\s+/))].join(' ');
const regionWords = (r) => (r === 'emea' ? 'emea europe' : r === 'amer' ? 'amer americas' : r === 'apac' ? 'apac asia pacific' : REGION_LABEL[r] ?? r);

export function searchExtra() {
  const spares = activeSpares.map((x) => ({
    kind: 'spare',
    id: x.id,
    title: `${x.what}, spare`,
    subtitle: `${x.siteName} · ${x.where.room}, ${x.where.cabinet}, ${x.where.shelf} · ${x.quantity} on the shelf, minimum ${x.minimum}${x.low ? ' (below minimum)' : ''}`,
    url: `${href('/spares/')}?q=${encodeURIComponent(x.id)}`,
    tokens: words('spare spares stock', x.what, x.modelName, x.model, x.part_number, SPARE_KIND[x.kind], x.kind, x.where.room, x.where.cabinet, x.where.shelf, x.siteName, x.siteCode, x.city, regionWords(x.region), x.id, x.notes, x.low ? 'low below minimum reorder' : '', x.out ? 'out of stock none' : ''),
  }));
  const cables = activeCables.map((c) => {
    const patch = c.role === 'patch';
    return {
      kind: 'cable',
      id: c.id,
      title: `${c.quantity > 1 ? `${c.quantity} × ` : ''}${c.typeLabel}, ${c.lengthText}, ${c.colourName.toLowerCase()} (${c.purposeName.toLowerCase()})`,
      subtitle: patch ? `${c.siteName} · ${c.where.room} · ${c.from} to ${c.to}` : `${c.siteName} · ${c.where.room}, ${c.where.cabinet}, ${c.where.shelf} · ${c.quantity} spare, minimum ${c.minimum}${c.low ? ' (below minimum)' : ''}`,
      url: `${href('/cables/')}?q=${encodeURIComponent(c.id)}`,
      tokens: words('cable cables', patch ? 'patch cable in a rack' : 'spare cable store', c.typeLabel, c.type, c.colourName, c.purposeName, c.purpose, c.lengthText, `${c.length_m}m`, c.from, c.to, c.where.room, c.where.cabinet, c.where.shelf, c.siteName, c.siteCode, c.city, regionWords(c.region), c.id, c.notes, c.low ? 'low below minimum reorder' : ''),
    };
  });
  return [...spares, ...cables];
}

export default searchExtra;

// The main search index (search-index.mjs) takes rows of [kind, url relative to the site, title, subtitle,
// extra words, facets]. Same records as above, in that shape.
const rel = (u) => u.replace(/^.*?\/(spares|cables)\//, '$1/');
export function searchItems() {
  const bySite = Object.fromEntries([...activeSpares, ...activeCables].map((x) => [x.id, x]));
  return searchExtra().map((r) => {
    const x = bySite[r.id] ?? {};
    return [r.kind, rel(r.url), r.title, r.subtitle, r.tokens, { st: x.site, r: x.region }];
  });
}
