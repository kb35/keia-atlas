// The browser side of the Services pages (/services/ and /services/<id>/). The simulation is src/lib/livesim.mjs, the
// same as the Rooms and Devices overviews: a new moment every five seconds, the same in every window. Real feeds
// replace it at stage 2 and this file does not change.
//   initService(root)   a service page: band figures, the light, Needs attention, the feed, health by office, every
//                       unit as a dot, and the firmware rows' counts, all following the filter bar
//   initOverview(root)  the Services overview: each service's light, four figures and its worst three items
import { snapshot, diff, eventsBetween, countRooms, TICK_MS, tickOf } from './livesim.mjs';
import { prepareServiceModel, tally, lightOf, LIGHT_WORDS, counted, officesOnline } from './services.mjs';
import { every, steady, refresh, repeek, ping, syncList, pushFeed, filterOf, visible, stickSide, esc, clock, ago, span } from './liveview.mjs';

const W = typeof window !== 'undefined' ? window : {};
const FEED = 8, KEEP = 400, BACK = 15 * 60e3;
const STW = { online: 'Online', alert: 'Alert', offline: 'Offline' };
const minsSince = (s, t) => (s.since != null ? Math.max(1, Math.round((t - s.since) / 60e3)) : null);

// ---- Words for a unit's state -------------------------------------------------------------------------------------
export function reason(model, u, s) {
  if (s.down) return 'Offline';
  if (s.al >= 0) return u.alerts[s.al];
  if (s.inc >= 0) return model.incs[s.inc].title;
  return '';
}
const unitHref = (B, u) => (u.to ? `${B}${u.to.replace(/^\//, '')}` : `${B}device/?tag=${encodeURIComponent(u.id)}`);
const rank = (s) => (s.down ? 0 : s.al >= 0 ? 1 : 2);

// The units that need a look, worst first: offline, then alerting, then an open incident, oldest first.
export function attentionRows(model, snap, t) {
  const out = [];
  model.units.forEach((u, i) => {
    if (!counted(u)) return;
    const s = snap.units[i]; if (s.st === 'online') return;
    const m = minsSince(s, t), inc = s.inc >= 0 ? model.incs[s.inc] : null;
    out.push({ u, i, s, m, inc, rank: rank(s), key: `${rank(s)}${inc ? inc.pri : 9}${String(1e6 - (m ?? 0)).padStart(7, '0')}${u.n}` });
  });
  return out.sort((a, b) => (a.key < b.key ? -1 : 1));
}

// ---- The four figures of a service ----------------------------------------------------------------------------------
// Each: { n, tone, title, to } where `to` is the filter on the service's own list of units (rule P10).
// statics: figures that do not change during the day, from the build. incCount: open incidents on the service's kit.
export function serviceNumbers(id, model, snap, statics = {}, incCount = 0) {
  const rows = model.units.map((u, i) => ({ u, s: snap.units[i] })).filter((x) => counted(x.u));
  const of = (...ks) => rows.filter((x) => ks.includes(x.u.k));
  const notOnline = (a) => a.filter((x) => x.s.st !== 'online').length;
  const notOffline = (a) => a.filter((x) => x.s.st !== 'offline').length;
  const tone = (n, t) => (n ? t : '');
  if (id === 'av') {
    const r = countRooms(model, snap), work = r.use + r.free;
    const a = notOnline(rows), off = rows.filter((x) => x.s.st === 'offline').length;
    const fw = rows.filter((x) => x.u.fw).length;
    return [
      { n: work, tone: '', title: `Of ${r.all} rooms; ${r.problem} with a problem and ${r.closed} closed` },
      { n: a, tone: off ? 'bad' : tone(a, 'warn'), title: `Of ${rows.length} units` },
      { n: fw, tone: tone(fw, 'warn'), title: 'Units running firmware behind the standard' },
      { n: incCount, tone: tone(incCount, 'bad'), title: 'Open incidents on AV kit' },
    ];
  }
  if (id === 'network') {
    const o = officesOnline(model, snap, model.sites);
    const home = of('home-gateway'), sw = of('switch'), ci = of('circuit');
    const swBad = notOnline(sw);
    return [
      { n: o.up, tone: o.up < o.total ? 'bad' : '', title: `Of ${o.total} offices` },
      { n: notOffline(home), tone: notOffline(home) < home.length ? 'warn' : '', title: `Of ${home.length} home gateways` },
      { n: swBad, tone: sw.some((x) => x.s.st === 'offline') ? 'bad' : tone(swBad, 'warn'), title: `Of ${sw.length} switches` },
      { n: notOffline(ci), tone: notOffline(ci) < ci.length ? 'bad' : '', title: `Of ${ci.length} internet circuits` },
    ];
  }
  const pw = of('ups', 'pdu'), ln = of('link');
  return [
    { n: statics.toStandard ?? 0, tone: (statics.toStandard ?? 0) < (statics.rooms ?? 0) ? 'warn' : '', title: `Of ${statics.rooms ?? 0} comms rooms` },
    { n: notOnline(pw), tone: pw.some((x) => x.s.st === 'offline') ? 'bad' : tone(notOnline(pw), 'warn'), title: `Of ${pw.length} UPS and power strips` },
    { n: statics.short ?? 0, tone: tone(statics.short ?? 0, 'warn'), title: `Racks with under ${statics.shortU ?? 6}U free` },
    { n: notOnline(ln), tone: ln.some((x) => x.s.st === 'offline') ? 'bad' : tone(notOnline(ln), 'warn'), title: `Of ${ln.length} links` },
  ];
}

const lightHtml = (l) => `<i class="sv-lt" data-l="${l}" aria-hidden="true"></i><span>${LIGHT_WORDS[l]}</span>`;

// =========================================================================================================
// A service page
// =========================================================================================================
export function initService(root) {
  if (!root || root.__sv) return () => {};
  root.__sv = true;
  const D = JSON.parse(root.querySelector('[data-lv-model]').textContent);
  const id = root.dataset.sv, B = D.base, statics = D.statics ?? {};
  const model = prepareServiceModel(D);
  const bar = root.querySelector('[data-fb]');
  const side = root.querySelector('[data-lv-side]');
  const attList = root.querySelector('[data-att]'), feedList = root.querySelector('[data-feed]');
  const els = new Map();
  root.querySelectorAll('[data-fi][data-i]').forEach((el) => els.set(+el.dataset.i, el));
  const rows = [...root.querySelectorAll('.lv-site')];
  const siteOf = (u) => model.sites[u.site];
  const cleanups = [];
  const CLS = D.kinds ?? {};

  function fwLine(u) {
    if (!u.fw) return '';
    const [found, std] = u.fw.split('|');
    return `<small>Firmware behind the standard${found && std ? `: ${esc(found)} found, ${esc(std)} is the standard` : ''}</small>`;
  }
  function peekStatus(u, s, t) {
    const m = minsSince(s, t);
    let line = `<span class="lv-pk-st" data-st="${s.st}">${STW[s.st]}${s.st !== 'online' && !s.down ? `: ${esc(reason(model, u, s).toLowerCase())}` : ''}${m ? `, for ${span(m)}` : ''}</span>`;
    if (s.inc >= 0) { const inc = model.incs[s.inc]; line += `<a href="${esc(inc.to)}">${esc(inc.no)}, ${esc(inc.state.toLowerCase())}<small>${esc(inc.title)}</small></a>`; }
    return line + fwLine(u);
  }
  function paint(el, i, s, t) {
    const u = model.units[i];
    el.dataset.st = s.st; el.setAttribute('data-f-status', s.st);
    el.setAttribute('aria-label', `${u.n}: ${STW[s.st].toLowerCase()}${s.st !== 'online' ? `, ${reason(model, u, s).toLowerCase()}` : ''}`);
    const pk = el.querySelector('template')?.content.querySelector('[data-pk]');
    if (pk) pk.innerHTML = peekStatus(u, s, t);
    repeek(el);
  }

  // ---- The first moment ----
  let snap = snapshot(model, tickOf(Date.now()));
  const bound = !!bar?.rsFilter;
  model.units.forEach((u, i) => {
    const el = els.get(i); if (!el) return;
    if (bound) { const n = el.cloneNode(true); paint(n, i, snap.units[i], snap.t); el.replaceWith(n); els.set(i, n); }
    else paint(el, i, snap.units[i], snap.t);
  });

  // ---- Health by office, the office rows, and the firmware rows: counted from what the filters show ----
  const blank = () => ({ online: 0, alert: 0, offline: 0, fw: 0, all: 0 });
  const filterQuery = (o) => { const q = new URLSearchParams(location.search); q.delete('site'); q.delete('status'); for (const k in o) q.set(k, o[k]); return `?${q.toString().replace(/%2C/g, ',')}#units`; };
  function paintHealth() {
    const byS = {}, bySi = new Map(), byM = {};
    els.forEach((el, i) => {
      if (el.classList.contains('fb-out')) return;
      const u = model.units[i], st = el.dataset.st, s = siteOf(u);
      for (const o of [byS[s.id] ??= blank(), bySi.get(u.site) ?? (bySi.set(u.site, blank()), bySi.get(u.site))]) { o[st]++; o.all++; if (u.fw) o.fw++; }
      if (u.m) { const o = byM[u.m] ??= { units: 0, behind: 0 }; o.units++; if (u.fw) o.behind++; }
    });
    const sites = bar?.rsFilter ? bar.rsFilter.get('site') : [];
    root.querySelectorAll('[data-health] .sv-hr').forEach((b) => {
      const n = byS[b.dataset.k] ?? blank(), on = sites.includes(b.dataset.k);
      b.querySelectorAll('.sv-hbar i').forEach((x) => { x.style.flexGrow = String(n[x.dataset.st]); x.classList.toggle('has', n[x.dataset.st] > 0); });
      b.querySelector('[data-hn]').textContent = `${n.all} ${n.all === 1 ? 'unit' : 'units'}${n.fw ? ` · ${n.fw} firmware out of date` : ''}`;
      const at = (st, text) => `<a href="${esc(filterQuery({ site: b.dataset.k, status: st }))}">${text}</a>`;
      const bits = [];
      if (n.offline) bits.push(at('offline', `<b class="t-bad">${n.offline} offline</b>`));
      if (n.alert) bits.push(at('alert', `<b class="t-warn">${n.alert} ${n.alert === 1 ? 'alert' : 'alerts'}</b>`));
      b.querySelector('[data-hx]').innerHTML = bits.join(' · ') || (n.all ? 'All online' : 'None match');
      b.classList.toggle('none', !n.all); b.dataset.on = String(on);
    });
    for (const row of rows) {
      const n = bySi.get(+row.dataset.site) ?? blank();
      const site = model.sites[+row.dataset.site].id;
      const at = (st, text) => `<a href="${esc(filterQuery({ site, status: st }))}">${text}</a>`;
      const bits = [at('online', `${n.online} online`)];
      if (n.offline) bits.push(at('offline', `<b>${n.offline} offline</b>`));
      if (n.alert) bits.push(at('alert', `<b class="t-warn">${n.alert} with ${n.alert === 1 ? 'an alert' : 'alerts'}</b>`));
      row.querySelector('[data-counts]').innerHTML = bits.join(' · ');
    }
    const filtered = !!(bar?.rsFilter && (bar.rsFilter.get('site').length || bar.rsFilter.get('region').length || bar.rsFilter.get('kind').length || bar.rsFilter.get('status').length));
    root.querySelectorAll('tr[data-m]').forEach((tr) => {
      const n = byM[tr.dataset.m] ?? { units: 0, behind: 0 };
      tr.querySelector('[data-fu]').textContent = String(n.units);
      const b = tr.querySelector('[data-fwb]'); b.textContent = String(n.behind); b.closest('td').classList.toggle('t-warn', n.behind > 0);
      tr.hidden = filtered && !n.units;
    });
    const none = root.querySelector('[data-fw-none]'); if (none) none.hidden = [...root.querySelectorAll('tr[data-m]')].some((tr) => !tr.hidden);
  }
  // Selecting an office row picks it in the filter bar (again to drop it), then shows the units.
  root.querySelectorAll('[data-health]').forEach((box) => box.addEventListener('click', (e) => {
    const link = e.target.closest('a'); if (!link || e.metaKey || e.ctrlKey || e.shiftKey || link.closest('.sv-hx')) return;
    const row = link.closest('.sv-hr'); if (!row) return;
    const f = bar?.querySelector('[data-fb-facet="site"]'); const opt = f?.querySelector(`[data-fopt][data-v="${CSS.escape(row.dataset.k)}"]`);
    if (!opt) return;
    e.preventDefault(); opt.click();
    if (row.dataset.on !== 'true') document.getElementById('units')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }));

  // ---- The band and the light ----
  let firstNumbers = true;
  const lastN = {};
  function paintNumbers() {
    const list = serviceNumbers(id, model, snap, statics, D.incCount ?? 0);
    list.forEach((x, k) => {
      const key = `sv-${k + 1}`;
      if (!W.rsKeyNumber) return;
      W.rsKeyNumber(key, x.n, { tone: x.tone, title: x.title });
      if (!firstNumbers && lastN[key] !== String(x.n) && W.rsMarkChanged) W.rsMarkChanged(document.querySelector(`.kn-i[data-kn="${key}"]`));
      lastN[key] = String(x.n);
    });
    firstNumbers = false;
    const nt = tally(model, snap), l = lightOf(nt), el = document.querySelector('[data-sv-light]');
    const bad = nt.offline + nt.alert;
    if (W.rsAnswer) W.rsAnswer(!nt.all ? 'Nothing reporting on this service yet' : !bad ? `Within target · all ${nt.all.toLocaleString('en-IE')} working` : `${l === 'bad' ? 'Past target' : 'Within target'} · ${nt.offline} offline, ${nt.alert} alerting`);
    if (el && el.dataset.l !== l) { el.dataset.l = l; el.innerHTML = lightHtml(l); }
  }

  // ---- Needs attention ----
  let lastAtt = [];
  function paintAttention(t, animate) {
    lastAtt = attentionRows(model, snap, t).map((x) => {
      const site = siteOf(x.u);
      return {
        key: x.u.id, sort: x.key, find: `${x.u.n} ${x.u.rn} ${site.name} ${x.u.id} ${reason(model, x.u, x.s)}`, region: site.region, site: site.id, kind: x.u.k,
        html: `<i data-r="${x.rank}" aria-hidden="true"></i><span class="lv-ar-b"><a href="${unitHref(B, x.u)}">${esc(x.u.n)}</a><small><b>${esc(reason(model, x.u, x.s))}</b> · ${esc(site.name)}</small></span>` +
          `<span class="lv-ar-e">${x.m ? `<span>${span(x.m)}</span>` : ''}${x.inc ? `<a href="${esc(x.inc.to)}" title="${esc(x.inc.title)}">${esc(x.inc.no)}</a>` : ''}</span>`,
      };
    });
    syncList(attList, lastAtt, () => { const li = document.createElement('li'); li.className = 'lv-ar'; return li; }, { animate });
    filterAttention();
  }
  function filterAttention() {
    const f = filterOf(bar, ['region', 'site', 'kind']);
    const byKey = new Map(lastAtt.map((r) => [r.key, r]));
    let shown = 0;
    [...attList.children].forEach((li) => { const r = byKey.get(li.dataset.vk); const ok = !!r && visible(r, f); li.hidden = !ok; if (ok) shown++; });
    root.querySelector('[data-att-none]').hidden = shown > 0;
    root.querySelector('[data-att-n]').textContent = shown ? `${shown} ${shown === 1 ? 'unit' : 'units'}` : '';
    document.dispatchEvent(new CustomEvent('rs:sa-refresh'));
  }

  // ---- Alerts and changes ----
  let feed = [], seq = 0;
  function describe(e) {
    if (e.unit == null) return null;
    const u = model.units[e.unit]; if (!counted(u)) return null;
    const s = siteOf(u), name = `<b>${esc(u.n)}</b>`;
    const text = e.k === 'offline' ? `${name} went offline` : e.k === 'online' ? `${name} back online${e.dur ? ` after ${span(e.dur)}` : ''}`
      : e.k === 'alert' ? `Alert on ${name}: ${esc(u.alerts[e.al].toLowerCase())}` : `Alert cleared on ${name}`;
    return { key: `e${seq++}`, t: e.t, k: e.k, href: unitHref(B, u), text, sub: `${s.name} · ${u.rn}`, find: `${u.n} ${u.rn} ${s.name} ${u.id}`, region: s.region, site: s.id, kind: u.k };
  }
  const makeEv = (x) => {
    const li = document.createElement('li');
    li.className = 'lv-ev'; li.dataset.k = x.k; li.dataset.t = String(x.t);
    li.innerHTML = `<span class="lv-et">${clock(x.t)}</span><i class="lv-ek" aria-hidden="true"></i><a class="lv-eb" href="${x.href}"><span>${x.text}</span><small>${esc(x.sub)} · <span data-ago>${ago(x.t, snap.t)}</span></small></a>`;
    return li;
  };
  function renderFeed() {
    const f = filterOf(bar, ['region', 'site', 'kind']);
    const list = feed.filter((x) => visible(x, f)).slice(-FEED).reverse();
    feedList.replaceChildren(...list.map(makeEv));
    root.querySelector('[data-feed-none]').hidden = list.length > 0;
  }
  function addToFeed(evs) {
    const fresh = evs.map(describe).filter(Boolean);
    if (!fresh.length) return;
    feed.push(...fresh); if (feed.length > KEEP) feed = feed.slice(-KEEP);
    const show = fresh.filter((x) => visible(x, filterOf(bar, ['region', 'site', 'kind']))).slice(-FEED).reverse();
    if (show.length) { pushFeed(feedList, show, makeEv, FEED); root.querySelector('[data-feed-none]').hidden = true; }
  }
  function paintAgo(t) {
    feedList.querySelectorAll('[data-ago]').forEach((el) => { el.textContent = ago(+el.closest('.lv-ev').dataset.t, t); });
    root.querySelector('[data-feed-clock]').textContent = `As of ${clock(t)}`;
  }
  (function prefill() {
    let from = snap.t - BACK, evs = eventsBetween(model, from, snap.t);
    while (evs.length < FEED && snap.t - from < 60 * 60e3) { const older = eventsBetween(model, from - BACK, from); from -= BACK; evs = [...older, ...evs]; }
    feed = evs.map(describe).filter(Boolean).slice(-KEEP);
  })();

  // ---- Sort the office rows ----
  function reorder(v) {
    const box = root.querySelector('[data-rows="units"]');
    const key = (row) => {
      const si = +row.dataset.site, idx = [...row.querySelectorAll('[data-fi]')].map((el) => +el.dataset.i);
      const bad = idx.filter((i) => snap.units[i].st !== 'online').length;
      return v === 'count' ? [-idx.length, si] : v === 'site' ? [si] : [-bad, si];
    };
    [...box.children].map((row) => ({ row, k: key(row) })).sort((a, b) => { for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i]; return 0; }).forEach((x) => box.appendChild(x.row));
  }

  // ---- Each tick ----
  function tick(t) {
    if (t <= snap.t) { paintAgo(Date.now()); return; }
    const from = Math.max(snap.t, t - BACK);
    const evs = t - from > TICK_MS ? eventsBetween(model, from, t) : null;
    const prev = snap, next = snapshot(model, t);
    snap = next;
    const changed = [];
    let statusMoved = false;
    steady(() => {
      model.units.forEach((u, i) => {
        const a = prev.units[i], b = next.units[i], el = els.get(i); if (!el) return;
        if (a.st !== b.st) { const n = refresh(el, (x) => paint(x, i, b, t)); els.set(i, n); changed.push(n); statusMoved = true; }
        else if (a.al !== b.al || a.down !== b.down) { paint(el, i, b, t); changed.push(el); }
        else if (b.st !== 'online' && t % 60e3 < TICK_MS) paint(el, i, b, t);
      });
    });
    changed.forEach(ping);
    if (statusMoved && bar?.rsFilter && bar.rsFilter.get('status').length) bar.rsFilter.run(true);
    paintHealth(); paintNumbers(); paintAttention(t, true);
    addToFeed(evs ?? diff(model, prev, next));
    paintAgo(t);
  }

  // ---- Start ----
  paintHealth(); paintNumbers(); paintAttention(snap.t, false); renderFeed(); paintAgo(snap.t);
  const onChange = () => { paintHealth(); filterAttention(); renderFeed(); };
  const start = () => {
    if (!bar?.rsFilter) return;
    bar.addEventListener('fb:change', onChange);
    bar.addEventListener('fb:sort', (e) => bar.rsFilter.run(true, () => reorder(e.detail.value)));
    reorder(bar.rsFilter.sort());
    bar.rsFilter.run(false);
  };
  if (bar?.rsFilter) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
  cleanups.push(every(tick));
  if (side) cleanups.push(stickSide(side));
  const pause = () => document.querySelector('[data-lv-live]')?.classList.toggle('lv-paused', document.hidden);
  document.addEventListener('visibilitychange', pause);
  cleanups.push(() => document.removeEventListener('visibilitychange', pause));
  return () => cleanups.forEach((f) => f());
}

// =========================================================================================================
// The Services overview: three cards, side by side
// =========================================================================================================
export function initOverview(root) {
  if (!root || root.__svo) return () => {};
  root.__svo = true;
  const D = JSON.parse(root.querySelector('[data-lv-model]').textContent);
  const B = D.base, ids = Object.keys(D.services);
  const models = Object.fromEntries(ids.map((id) => [id, prepareServiceModel(D.services[id].sim)]));
  const W_ = W;
  let firstNumbers = true;
  const last = {};

  function paint(t) {
    const snaps = Object.fromEntries(ids.map((id) => [id, snapshot(models[id], t)]));
    const lights = {};
    let alerting = 0;
    for (const id of ids) {
      const model = models[id], snap = snaps[id], card = root.querySelector(`[data-svc="${id}"]`);
      const n = tally(model, snap), l = lightOf(n);
      lights[id] = l;
      alerting += n.offline + n.alert;
      const el = card.querySelector('[data-light]'); if (el.dataset.l !== l) { el.dataset.l = l; el.innerHTML = lightHtml(l); }
      card.dataset.l = l;
      serviceNumbers(id, model, snap, D.services[id].statics, D.services[id].incCount).forEach((x, k) => {
        const cell = card.querySelector(`[data-n="${k + 1}"]`), num = cell.querySelector('b');
        const v = x.n.toLocaleString('en-IE');
        if (num.textContent !== v) { num.textContent = v; if (!firstNumbers && W_.rsMarkChanged) W_.rsMarkChanged(cell); }
        cell.title = x.title; cell.dataset.tone = x.tone || '';
      });
      const top = attentionRows(model, snap, t).slice(0, 3);
      const list = card.querySelector('[data-top]');
      const html = top.map((x) => `<li class="sv-top"><i data-r="${x.rank}" aria-hidden="true"></i><span><a href="${unitHref(B, x.u)}">${esc(x.u.n)}</a><small><b>${esc(reason(model, x.u, x.s))}</b> · ${esc(model.sites[x.u.site].name)}</small></span>${x.m ? `<em>${span(x.m)}</em>` : ''}</li>`).join('');
      const sig = html + n.offline + n.alert;
      if (last[id] !== sig) { last[id] = sig; list.innerHTML = html; }
      card.querySelector('[data-top-none]').hidden = top.length > 0;
      const more = card.querySelector('[data-more]'), extra = n.offline + n.alert;
      more.textContent = extra ? `See all ${extra} ${extra === 1 ? 'unit' : 'units'} needing attention →` : `Open the ${D.services[id].name} service →`;
      more.setAttribute('href', extra ? `${B}services/${id}/?status=alert,offline#units` : `${B}services/${id}/`);
    }
    const fine = ids.filter((id) => lights[id] === 'good').length;
    const past = ids.filter((id) => lights[id] === 'bad').length, review = ids.filter((id) => lights[id] === 'warn').length;
    const svc = (n) => `${n} ${n === 1 ? 'service' : 'services'}`;
    const parts = [past && `${svc(past)} past target`, review && `${svc(review)} to review`, fine && `${fine} within target`].filter(Boolean);
    if (W_.rsAnswer) W_.rsAnswer(fine === ids.length ? `All ${ids.length} services within target` : parts.join(' · '));
    if (W_.rsKeyNumber) {
      const put = (key, v, tone) => { W_.rsKeyNumber(key, v, { tone }); if (!firstNumbers && last[key] !== String(v) && W_.rsMarkChanged) W_.rsMarkChanged(document.querySelector(`.kn-i[data-kn="${key}"]`)); last[key] = String(v); };
      put('svo-1', fine, fine < ids.length ? 'warn' : 'good');
      put('svo-2', alerting, alerting ? 'warn' : '');
    }
    firstNumbers = false;
    const clockEl = root.querySelector('[data-clock]'); if (clockEl) clockEl.textContent = `As of ${clock(t)}`;
  }
  const t0 = tickOf(Date.now());
  paint(t0);
  const stop = every((t) => paint(t));
  return stop;
}
