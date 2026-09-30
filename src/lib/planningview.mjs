// What the Planning page draws from a year's totals, written once so the page (at build time) and its script (in
// the browser, after a scenario is adopted or typed) paint the same figures the same way. Pure: no data loaded.
import { ROLES, ROLE_LABEL, REGIONS, REGION_NAME, fyLabel } from './planningcore.mjs';

export const money = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
export const kmoney = (n) => (Math.abs(n) >= 1e6 ? `€${(n / 1e6).toFixed(2)}m` : Math.abs(n) < 1000 ? money(n) : `€${Math.round(n / 1000)}k`);
export const signed = (n, f = kmoney) => (n > 0 ? `+${f(n)}` : n < 0 ? `−${f(-n)}` : 'same');
export const fmtH = (n) => `${Math.round(n).toLocaleString('en-IE')} h`;
export const signedH = (n) => (Math.abs(n) < 0.5 ? 'same' : `${n > 0 ? '+' : '−'}${Math.round(Math.abs(n)).toLocaleString('en-IE')} h`);
export const pctOf = (n, d) => (d > 0 ? Math.max(0, Math.min(100, (n / d) * 100)) : 0);
export const gapWords = (gap) => (gap >= 0 ? `${Math.round(gap).toLocaleString('en-IE')} h to spare` : `Short by ${Math.round(-gap).toLocaleString('en-IE')} h`);
export const loadWord = (pct) => (pct == null ? 'No one yet' : pct <= 50 ? 'Light' : pct <= 85 ? 'Busy' : pct <= 105 ? 'Full' : 'Too much');
export const loadTone = (pct) => (pct == null ? 'bad' : pct <= 85 ? 'good' : pct <= 105 ? 'warn' : 'bad');

// Every figure on the page for one year, keyed the way the page's data-v attributes name them. `base` is the same
// year with no scenarios, so scenario hours can be shown as their own segment.
export function flat(t, base = t) {
  const v = {};
  const scale = Math.max(t.envelope ?? 0, t.spend.total, 1);
  v['spend.committed'] = money(t.spend.committed); v['spend.planned'] = money(t.spend.planned); v['spend.estimated'] = money(t.spend.estimated); v['spend.total'] = money(t.spend.total);
  v['k.committed'] = kmoney(t.spend.committed); v['k.planned'] = kmoney(t.spend.planned); v['k.estimated'] = kmoney(t.spend.estimated); v['k.total'] = kmoney(t.spend.total);
  v.headroom = t.headroom == null ? 'No envelope yet' : t.headroom >= 0 ? `${money(t.headroom)} headroom` : `${money(-t.headroom)} over`;
  v['headroom.tone'] = t.headroom == null ? '' : t.headroom >= 0 ? 'good' : 'bad';
  v.units = t.units.toLocaleString('en-IE'); v.rooms = t.rooms.toLocaleString('en-IE'); v.projects = String(t.projects);
  v['bar.committed'] = pctOf(t.spend.committed, scale); v['bar.planned'] = pctOf(t.spend.planned, scale); v['bar.estimated'] = pctOf(t.spend.estimated, scale);
  v['bar.cap'] = t.envelope == null ? 100 : pctOf(t.envelope, scale);
  for (const [k, b] of Object.entries(t.byKind)) { v[`kind:${k}:total`] = kmoney(b.committed + b.planned + b.estimated); v[`kind:${k}:n`] = b.committed + b.planned + b.estimated; for (const s of ['committed', 'planned', 'estimated']) v[`kind:${k}:${s}`] = pctOf(b[s], scale); }
  for (const [s, b] of Object.entries(t.byOffice)) { v[`office:${s}:committed`] = b.committed ? kmoney(b.committed) : ''; v[`office:${s}:planned`] = b.planned ? kmoney(b.planned) : ''; v[`office:${s}:estimated`] = b.estimated ? kmoney(b.estimated) : ''; v[`office:${s}:total`] = kmoney(b.committed + b.planned + b.estimated); v[`office:${s}:units`] = b.units ? String(b.units) : ''; v[`office:${s}:rooms`] = b.rooms ? String(b.rooms) : ''; }
  for (const [g, b] of Object.entries(t.byRegion)) { v[`region:${g}:committed`] = b.committed ? kmoney(b.committed) : ''; v[`region:${g}:planned`] = b.planned ? kmoney(b.planned) : ''; v[`region:${g}:estimated`] = b.estimated ? kmoney(b.estimated) : ''; v[`region:${g}:total`] = kmoney(b.committed + b.planned + b.estimated); v[`region:${g}:units`] = b.units ? String(b.units) : ''; v[`region:${g}:rooms`] = b.rooms ? String(b.rooms) : ''; }
  for (const r of ROLES) {
    const h = t.hours[r], b = base.hours[r], scen = Math.max(0, h.need - b.need), plan = Math.max(0, h.need - h.bau - scen);
    const cap = Math.max(h.have, h.need, 1);
    v[`hours:${r}:need`] = fmtH(h.need); v[`hours:${r}:have`] = fmtH(h.have); v[`hours:${r}:people`] = h.people % 1 ? h.people.toFixed(1) : String(h.people);
    v[`hours:${r}:pct`] = h.pct == null ? '' : `${h.pct}%`; v[`hours:${r}:word`] = loadWord(h.pct); v[`hours:${r}:tone`] = loadTone(h.pct);
    v[`hours:${r}:gap`] = gapWords(h.gap); v[`hours:${r}:gap.tone`] = h.gap >= 0 ? 'good' : 'bad';
    v[`hours:${r}:bar.bau`] = pctOf(h.bau, cap); v[`hours:${r}:bar.plan`] = pctOf(plan, cap); v[`hours:${r}:bar.scen`] = pctOf(scen, cap); v[`hours:${r}:bar.have`] = pctOf(h.have, cap);
    v[`hours:${r}:bau`] = fmtH(h.bau); v[`hours:${r}:plan`] = fmtH(plan); v[`hours:${r}:scen`] = fmtH(scen);
    for (const g of REGIONS) {
      const x = h.byRegion[g];
      v[`hours:${r}:${g}:people`] = x.people % 1 ? x.people.toFixed(1) : String(x.people); v[`hours:${r}:${g}:have`] = fmtH(x.have); v[`hours:${r}:${g}:need`] = fmtH(x.need);
      v[`hours:${r}:${g}:gap`] = x.people || x.need ? gapWords(x.gap) : ''; v[`hours:${r}:${g}:gap.tone`] = x.gap >= 0 ? 'good' : 'bad';
    }
  }
  for (const g of REGIONS) { const e = t.estate[g]; v[`estate:${g}:rooms`] = String(e.rooms ?? 0); v[`estate:${g}:units`] = String(e.units ?? 0); v[`estate:${g}:staff`] = String(e.staff ?? 0); v[`estate:${g}:offices`] = String(e.offices ?? 0); }
  return v;
}

// The one line under the title that answers the year.
export function ledeFor(t, n, nowFy) {
  const when = n === nowFy ? 'This year' : n === nowFy + 1 ? 'Next year' : fyLabel(n);
  const tech = t.hours.tech;
  const room = t.headroom == null ? 'no budget envelope yet' : t.headroom >= 0 ? `${kmoney(t.headroom)} headroom` : `${kmoney(-t.headroom)} over the envelope`;
  return `${when}: ${kmoney(t.spend.committed)} committed in ${t.projects} ${t.projects === 1 ? 'project' : 'projects'}, ${kmoney(t.spend.planned + t.spend.estimated)} planned for ${t.units.toLocaleString('en-IE')} devices, ${room}; technicians at ${tech.pct ?? 0}% of their hours.`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dCls = (d) => (d > 0 ? 'up' : d < 0 ? 'down' : 'same');

// The comparison of one scenario with the plan: a chart of spend by year, then the table.
export function compareHtml(rows, name) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.base.spend.total, r.sc.spend.total]));
  const chart = rows.map((r) => {
    const b = pctOf(r.base.spend.total, max), s = pctOf(r.sc.spend.total, max), changed = Math.abs(r.d.spend) >= 500;
    return `<div class="plc-col" role="listitem"><div class="plc-bars" aria-hidden="true">${changed ? `<span class="plc-lbl ${dCls(r.d.spend)}">${esc(signed(r.d.spend))}</span>` : ''}<i class="plc-b plc-base" style="height:${b}%"></i><i class="plc-b plc-sc" style="height:${s}%"></i></div><span class="plc-y">${esc(fyLabel(r.n))}</span><span class="sr-only">${esc(fyLabel(r.n))}: the plan ${esc(money(r.base.spend.total))}, ${esc(name)} ${esc(money(r.sc.spend.total))}</span></div>`;
  }).join('');
  const cell = (l, a, b, d, f = kmoney, sf = signed) => `<td class="num" data-label="${l}, plan">${esc(f(a))}</td><td class="num" data-label="${l}, scenario">${esc(f(b))}</td><td class="num plc-d ${dCls(d)}" data-label="${l}, change">${esc(sf(d, f))}</td>`;
  const hcell = (l, h) => `<td class="num" data-label="${l}, plan">${esc(fmtH(h.base))}</td><td class="num" data-label="${l}, scenario">${esc(fmtH(h.sc))}</td><td class="num plc-d ${dCls(h.d)}" data-label="${l}, change">${esc(signedH(h.d))}</td>`;
  const n = (x) => x.toLocaleString('en-IE');
  const sn = (d) => (d > 0 ? `+${n(d)}` : d < 0 ? `−${n(-d)}` : 'same');
  const body = rows.map((r) => `<tr><th scope="row">${esc(fyLabel(r.n))}</th>${cell('Spend', r.base.spend.total, r.sc.spend.total, r.d.spend)}${cell('Devices', r.base.units, r.sc.units, r.d.units, n, sn)}${cell('Rooms', r.base.rooms, r.sc.rooms, r.d.rooms, n, sn)}${hcell('Technician hours', r.hours.tech)}${hcell('Engineer hours', r.hours.delivery)}</tr>`).join('');
  const tot = (k) => rows.reduce((a, r) => a + r[k], 0);
  const sums = { base: rows.reduce((a, r) => a + r.base.spend.total, 0), sc: rows.reduce((a, r) => a + r.sc.spend.total, 0) };
  void tot;
  return `<div class="plc-chart" role="list" aria-label="Spend by year, the plan and ${esc(name)}">${chart}</div>
<ul class="plc-key" aria-label="Key"><li><i class="plc-base"></i>The plan as it stands</li><li><i class="plc-sc"></i>${esc(name)}</li></ul>
<div class="tablewrap"><table class="plc-table to-cards"><thead><tr><th scope="col">Year</th><th scope="col" colspan="3">Spend: plan, scenario, change</th><th scope="col" colspan="3">Devices</th><th scope="col" colspan="3">Rooms</th><th scope="col" colspan="3">Technician hours</th><th scope="col" colspan="3">Engineer hours</th></tr></thead><tbody>${body}</tbody>
<tfoot><tr><th scope="row">All years</th><td class="num">${esc(kmoney(sums.base))}</td><td class="num">${esc(kmoney(sums.sc))}</td><td class="num plc-d ${dCls(sums.sc - sums.base)}">${esc(signed(sums.sc - sums.base))}</td><td colspan="12"></td></tr></tfoot></table></div>`;
}

export { ROLES, ROLE_LABEL, REGIONS, REGION_NAME, fyLabel };
