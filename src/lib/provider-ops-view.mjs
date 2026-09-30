// The parts of the operations pages that change when a person acts (reserve, send, receive, approve), as HTML. The
// pages draw them with these when the site is built (set:html), and src/lib/provider-ops-client.mjs draws them again
// in the browser from the same view (opsView in src/lib/provider-ops.mjs), so the two can never differ.
// Every element that moves between groups is keyed data-vk (km.regroup, M2); every figure that changes is marked
// data-tk, so the client can tick it in place (km.tick, row 48). Pure: strings in, strings out.
import { glyph } from './health.mjs';
import { dayWords, dateWords, WEEKS, inWeek, CERTS, TASK_WORDS } from './provider-ops.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nameOf = (V, key) => V.names[key] ?? key.split(':')[1];
const locName = (V, id) => V.S.locations.find((l) => l.id === id)?.name ?? id;
const days = (ds) => (ds.length > 1 ? `${dayWords(ds[0])} to ${dayWords(ds[ds.length - 1])}` : dayWords(ds[0]));
const jobLine = (V, id) => { const j = V.jobsById[id]; return j ? `${esc(j.id)} · ${esc(j.title)}` : esc(id); };

// ---- Stock ----------------------------------------------------------------------------------------------------------------
/** The shortfalls for next week, each with the draft order that covers it. */
export function shortHtml(V) {
  if (!V.short.length) return `<p class="po-none">${glyph('fine', { size: 16 })} Nothing short for next week's jobs.</p>`;
  return `<ul class="po-short">${V.short.map((s) => {
    const d = V.orders.find((o) => o.draft && o.lines.some((l) => l.key === s.key && l.jobs.some((j) => j.job === s.job.id)));
    const cover = d ? (d.status === 'draft' ? `Draft order ${esc(d.id)} to ${esc(d.distributorName)}, arrives ${dayWords(d.expected)}${d.inTime ? ', in time' : ', too late'}` : `${esc(d.id)} sent to ${esc(d.distributorName)}, arrives ${dayWords(d.expected)}`) : 'No order covers it yet';
    return `<li>${glyph('fault', { size: 16 })}<span><b><span data-tk>${s.short}</span> × ${esc(nameOf(V, s.key))} short</b><small>For ${jobLine(V, s.job.id)} · ${days(s.job.days)} · needs ${s.need}, ${s.held + s.takeQty} from stock</small><small>${cover}</small></span></li>`;
  }).join('')}</ul>`;
}

/** Where the stock is: one card per place. */
export function placesHtml(V) {
  return `<ul class="po-places">${V.S.locations.map((l) => {
    const units = V.rows.reduce((n, r) => n + (r.serialised ? r.byLoc[l.id] ?? 0 : 0), 0);
    const parts = V.rows.reduce((n, r) => n + (!r.serialised ? r.byLoc[l.id] ?? 0 : 0), 0);
    const reserved = V.rows.reduce((n, r) => n + (r.serialised ? r.serials.filter((s) => s.at === l.id && s.job).length : 0), 0);
    return `<li class="po-place"><span class="overline">${l.kind === 'van' ? esc(l.crew ?? 'Van') : 'Warehouse'}</span><b>${esc(l.name)}</b>
      <dl><div><dt>Units</dt><dd data-tk>${units}</dd></div><div><dt>Reserved</dt><dd data-tk>${reserved}</dd></div><div><dt>Parts</dt><dd data-tk>${parts}</dd></div></dl>
      ${l.based ? `<small>Based in ${esc(l.based)}</small>` : ''}</li>`;
  }).join('')}</ul>`;
}

/** Every item: on hand by place, reserved, available against its reorder point, and its serials. */
export function itemsHtml(V) {
  const shortKeys = new Set(V.short.map((s) => s.key));
  return `<ul class="po-items" data-items>${V.rows.map((r) => {
    const st = shortKeys.has(r.key) ? 'fault' : r.low ? 'review' : 'fine';
    const word = shortKeys.has(r.key) ? 'Short next week' : r.low ? 'Below reorder point' : 'In stock';
    const where = Object.entries(r.byLoc).map(([loc, n]) => `${n} in ${esc(locName(V, loc))}`).join(', ') || 'None on hand';
    const pct = r.onHand ? Math.round((r.available / Math.max(r.onHand, r.reorderPoint, 1)) * 100) : 0;
    const chips = r.serialised ? r.serials.map((s) => `<span class="po-chip${s.job ? ' is-res' : ''}" data-vk="${esc(s.serial)}" title="${esc(`${s.serial} · ${locName(V, s.at)}${s.job ? ` · reserved for ${s.job}` : ' · available'}`)}">${esc(s.serial.slice(-5))}${s.job ? `<i>${esc(s.job)}</i>` : ''}</span>`).join('') : '';
    const res = Object.entries(r.byJob).map(([j, n]) => `${n} for ${esc(j)}`).join(', ');
    return `<li class="po-item" data-st="${st}" data-fi data-find="${esc(`${nameOf(V, r.key)} ${r.serials.map((s) => s.serial).join(' ')}`)}" data-f-status="${st}">
      <div class="po-i-h">${glyph(st, { size: 16, title: word })}<span><b>${esc(nameOf(V, r.key))}</b><small>${r.serialised ? 'Serialised' : `Counted, by the ${esc(r.unit ?? 'unit')}`} · ${esc(where)}</small></span></div>
      <dl class="po-figs"><div><dt>On hand</dt><dd data-tk>${r.onHand}</dd></div><div><dt>Reserved</dt><dd data-tk>${r.reserved}</dd></div><div><dt>Available</dt><dd data-tk class="${r.low ? 't-warn' : ''}">${r.available}</dd></div><div><dt>Reorder at</dt><dd>${r.reorderPoint}</dd></div></dl>
      <span class="po-bar" data-chart-bar title="${r.available} available; reorder at ${r.reorderPoint}"><i style="width:${Math.min(100, pct)}%"></i><b style="left:${Math.min(100, Math.round((r.reorderPoint / Math.max(r.onHand, r.reorderPoint, 1)) * 100))}%" aria-hidden="true"></b></span>
      ${res ? `<small class="po-res">Reserved: ${res}</small>` : ''}
      ${chips ? `<div class="po-chips" aria-label="Serial numbers">${chips}</div>` : ''}
      ${r.notes ? `<small class="po-note">${esc(r.notes)}</small>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

// ---- Reservations and orders ---------------------------------------------------------------------------------------------
/** One job's bill of materials: reserved units, the units stock can give it (to reserve), on order and short. */
export function jobCardHtml(V, p) {
  const j = p.job;
  const canReserve = p.lines.some((l) => l.takeQty > 0);
  const st = p.short ? 'fault' : p.onOrder ? 'progress' : canReserve ? 'review' : 'fine';
  const word = p.short ? `${plural(p.lines.filter((l) => l.short).length, 'line')} short` : p.onOrder ? 'Waiting on an order' : canReserve ? 'Ready to reserve' : 'All reserved';
  const chip = (id, label, cls, title) => `<span class="po-chip ${cls}" data-vk="${esc(id)}" title="${esc(title)}">${esc(label)}</span>`;
  const rows = p.lines.map((l) => {
    const serial = l.model && V.S.items.find((it) => it.key === l.key)?.serialised;
    const held = serial ? l.heldSerials.map((s) => chip(s, s.slice(-5), 'is-res', `${s} reserved for ${j.id}`)).join('') : l.held ? chip(`${j.id}:${l.key}`, `${l.held} ${l.held === 1 ? 'held' : 'held'}`, 'is-res', `${l.held} reserved for ${j.id}`) : '';
    const take = serial ? l.take.map((s) => chip(s, s.slice(-5), 'is-avail', `${s} available: reserve it for ${j.id}`)).join('') : l.takeQty ? chip(`${j.id}:${l.key}`, `${l.takeQty} free`, 'is-avail', `${l.takeQty} available to reserve`) : '';
    const status = l.short ? `<b class="t-bad" data-tk>${l.short} short</b>` : l.onOrder ? `<span data-tk>${l.onOrder}</span> on order` : l.held >= l.need ? 'Reserved' : 'In stock';
    return `<tr><td data-label=""><b>${esc(l.name ?? nameOf(V, l.key))}</b>${l.where?.length ? `<small>${esc([...new Set(l.where)].slice(0, 2).join('; '))}${new Set(l.where).size > 2 ? ` and ${new Set(l.where).size - 2} more` : ''}</small>` : ''}</td>
      <td data-label="Need" class="num">${l.need}</td>
      <td data-label="Reserved"><div class="po-chips" data-slot="held">${held || '<span class="po-dash">None yet</span>'}</div></td>
      <td data-label="Available to reserve"><div class="po-chips" data-slot="take">${take || '<span class="po-dash">None</span>'}</div></td>
      <td data-label="">${status}</td></tr>`;
  }).join('');
  return `<article class="card po-job" data-job="${esc(j.id)}" aria-labelledby="pj-${esc(j.id)}">
    <header class="po-job-h">
      ${glyph(st, { size: 16, word })}
      <h3 id="pj-${esc(j.id)}"><span class="mono">${esc(j.id)}</span> ${esc(j.title)}</h3>
      <small>${esc(j.facts?.clientName ?? j.client)} · ${esc(j.facts?.siteName ?? j.site)} · ${days(j.days)} · for ${esc(j.ref)}</small>
      ${canReserve ? `<button type="button" class="btn small primary" data-po-act="reserve" data-id="${esc(j.id)}">Reserve from stock</button>` : ''}
    </header>
    ${p.lines.length ? `<table class="po-bom to-cards"><thead><tr><th>Item</th><th>Need</th><th>Reserved</th><th>Available to reserve</th><th><span class="sr-only">Status</span></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="po-none">No parts: labour only.</p>'}
    ${j.bom && !Array.isArray(j.bom) ? `<p class="po-src">Bill of materials read from ${esc(j.facts?.clientName ?? j.client)}'s ${esc(j.bom.project)} build sheet: the positions in ${esc(j.facts?.where ?? '')}.${(j.bom.picks ?? []).map((x) => ` ${esc(x.why)}: Northlight fits its own part.`).join('')}</p>` : ''}
  </article>`;
}
export function jobsHtml(V, week) {
  const list = V.plan.jobs.filter((p) => inWeek(p.job, week) && p.lines.length);
  return list.length ? `<div class="po-jobs">${list.map((p) => jobCardHtml(V, p)).join('')}</div>` : `<p class="po-none">No parts needed ${week.id === 'this' ? 'this week' : 'next week'}.</p>`;
}

/** One order (a draft, an open one, or received). */
export function orderHtml(V, o) {
  const lines = o.lines.map((l) => {
    const why = o.draft ? [l.short ? `${l.short} for ${l.jobs.map((x) => x.job).join(', ')}` : '', l.topUp ? `${l.topUp} to the reorder point` : ''].filter(Boolean).join(', ') : (o.job ? `for ${o.job}` : '');
    const serials = l.serials?.length ? `<div class="po-chips" aria-label="Serials on the shipping notice">${l.serials.map((s) => `<span class="po-chip" title="${esc(s)}">${esc(s.slice(-5))}</span>`).join('')}</div>` : '';
    return `<li><b><span data-tk>${l.qty}</span> × ${esc(nameOf(V, l.key ?? (l.model ? `model:${l.model}` : `part:${l.part}`)))}</b>${why ? `<small>${esc(why)}</small>` : ''}${serials}</li>`;
  }).join('');
  const st = o.status === 'received' ? 'fine' : o.status === 'sent' ? 'progress' : o.inTime === false ? 'fault' : 'review';
  const word = o.status === 'received' ? `Received ${dayWords(o.received ?? V.today)}` : o.status === 'sent' ? `Arrives ${dayWords(o.expected)}` : `Draft · arrives ${dayWords(o.expected)} if sent today`;
  const act = o.status === 'draft' ? `<button type="button" class="btn small primary" data-po-act="send" data-id="${esc(o.id)}">Send to ${esc(o.distributorName ?? '')}</button>`
    : o.status === 'sent' ? `<button type="button" class="btn small" data-po-act="receive" data-id="${esc(o.id)}">Receive</button>` : '';
  const dist = o.distributorName ?? V.distributors?.find?.((d) => d.id === o.distributor)?.name ?? o.distributor;
  const job = o.job ?? (o.jobs?.length ? o.jobs.join(', ') : null);
  return `<article class="card po-order" data-order="${esc(o.id)}" data-status="${esc(o.status)}" data-vk="order:${esc(o.id)}">
    <header class="po-order-h">${glyph(st, { size: 16, word })}<h3><span class="mono">${esc(o.id)}</span> ${esc(dist)}</h3>${act}</header>
    <ul class="po-lines">${lines}</ul>
    <small class="po-meta">${job ? `For ${esc(job)} · ` : ''}deliver to ${esc(locName(V, o.deliver_to ?? 'warehouse'))}${o.draft && o.firstNeed ? ` · first needed ${dayWords(o.firstNeed)}${o.inTime ? ', in time' : ', too late: find another source'}` : ''}${o.notes ? ` · ${esc(o.notes)}` : ''}</small>
  </article>`;
}
export const ordersHtml = (V, list, empty) => (list.length ? `<div class="po-orders">${list.map((o) => orderHtml(V, o)).join('')}</div>` : `<p class="po-none">${esc(empty)}</p>`);
export const ordersAnswer = (V) => {
  const shortLines = V.short.length, drafts = V.drafts.length, open = V.open.length;
  if (shortLines) return `${plural(shortLines, 'line')} short next week · ${drafts ? `${plural(drafts, 'draft order')} ready to send` : `${plural(open, 'order')} on the way`}`;
  return `Nothing short next week · ${plural(open, 'order')} on the way${drafts ? ` · ${plural(drafts, 'draft')} to send` : ''}`;
};

// ---- Visit readiness ------------------------------------------------------------------------------------------------------
export function visitHtml(V, r, base = '') {
  const v = r.visit;
  const crew = v.people.map((id) => V.people.find((p) => p.id === id)?.name ?? id);
  const rams = v.jobs.map((j) => `<a href="${esc(`${base}/portfolio/ops/rams/${j.toLowerCase()}/`)}">RAMS ${esc(j)}</a>`).join(' · ');
  return `<article class="card po-visit" data-visit="${esc(v.id)}" data-ready="${r.ready ? 'yes' : 'no'}" aria-labelledby="pv-${esc(v.id)}">
    <header class="po-visit-h">
      ${glyph(r.ready ? 'fine' : 'fault', { size: 16, word: r.ready ? 'Ready' : 'At risk' })}
      <h3 id="pv-${esc(v.id)}">${days(v.days)} · ${esc(V.jobsById[v.jobs[0]]?.facts?.clientName ?? v.client)}, ${esc(V.jobsById[v.jobs[0]]?.facts?.siteName ?? v.site)}</h3>
      <small>${esc(v.where)} · ${esc(crew.join(', '))} · ${v.jobs.map((j) => esc(j)).join(', ')}</small>
    </header>
    ${r.blockers.length ? `<ul class="po-block">${r.blockers.map((b) => `<li data-vk="${esc(`${v.id}:${b.split(':')[0]}`)}">${esc(b)}</li>`).join('')}</ul>` : ''}
    <ul class="po-checks">${r.checks.map((c) => `<li data-ok="${c.ok ? 'yes' : 'no'}">${glyph(c.ok ? 'fine' : 'fault', { size: 16 })}<span><b>${esc(c.label)}</b><small>${esc(c.words)}</small></span></li>`).join('')}</ul>
    <p class="po-links">${rams}</p>
  </article>`;
}
export function visitsHtml(V, week, base = '') {
  const list = V.visits.filter((r) => inWeek(r.visit, week));
  return list.length ? `<div class="po-visits">${list.map((r) => visitHtml(V, r, base)).join('')}</div>` : '<p class="po-none">No visits booked.</p>';
}

// ---- RAMS sign-off ---------------------------------------------------------------------------------------------------------
export function ramsSignHtml(doc) {
  const reviewed = doc.status === 'approved';
  return `<div class="rm-sign" data-status="${esc(doc.status)}">
    <div class="rm-sig"><span class="overline">Prepared</span><b>Generated from the record</b><small>${esc(dateWords(doc.generated))}, ${esc(doc.generated.slice(11, 16))} · from the space, the job's tasks and the crew's certifications</small></div>
    <div class="rm-sig">${reviewed ? `<span class="overline">Reviewed and approved</span><b>${esc(doc.reviewedByName ?? '')}</b><small>${esc(dateWords(doc.reviewed))}, ${esc(doc.reviewed.slice(11, 16))}</small>`
      : `<span class="overline">Review</span><b>Waiting for review</b><small>A competent person reads every hazard and its controls, then approves. The visit waits until then.</small><button type="button" class="btn small primary" data-po-act="approve" data-id="${esc(doc.job.id)}">Approve as Sam Okafor</button>`}</div>
  </div>`;
}
/** Every live job's RAMS: waiting for review first, then by the day the work starts. */
export function ramsListHtml(V, base = '') {
  const docs = Object.values(V.rams).sort((a, b) => Number(a.status === 'approved') - Number(b.status === 'approved') || a.days[0].localeCompare(b.days[0]));
  return `<ul class="po-docs">${docs.map((d) => `<li class="po-doc" data-vk="rams:${esc(d.job.id)}">${glyph(d.status === 'approved' ? 'fine' : 'review', { size: 16, title: d.status === 'approved' ? `Approved by ${d.reviewedByName}` : 'Waiting for review' })}<span>
    <a href="${esc(`${base}/portfolio/ops/rams/${d.job.id.toLowerCase()}/`)}"><span class="mono">${esc(d.id)}</span> ${esc(d.title)}</a>
    <small>${esc(d.clientName)}, ${esc(d.siteName)}${d.where ? ` · ${esc(d.where)}` : ''} · ${days(d.days)}</small>
    <small>${plural(d.hazards.length, 'hazard')} · highest after controls: ${esc(d.worst ? d.worst.after.label : 'none')} · ${d.status === 'approved' ? `approved by ${esc(d.reviewedByName)}` : 'waiting for review'}${d.problems.length ? ` · ${plural(d.problems.length, 'certification problem')}` : ''}</small>
  </span></li>`).join('')}</ul>`;
}
export const ramsListAnswer = (V) => { const docs = Object.values(V.rams); const w = docs.filter((d) => d.status !== 'approved').length; return `${docs.length} RAMS generated from the record · ${w ? `${w} waiting for review` : 'all reviewed'}`; };
export const ramsStatusWord = (doc) => (doc.status === 'approved' ? `Generated from the record, reviewed by ${doc.reviewedByName}` : 'Generated from the record, waiting for review');

export { CERTS, TASK_WORDS, WEEKS };
