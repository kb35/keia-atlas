// Home in the browser (src/pages/index.astro): draws the cockpit for whoever is viewing, and runs Take, Hand to, Park
// and Resume through the live layer, so every window agrees and a colleague's change shows in place (M10).
//
// The rules are in src/lib/homecore.mjs (what each role sees, in which order, with which words) and
// src/lib/ownership.mjs (who has a job, and what each verb does); this file only draws and moves.
// Motion (MOTION-V2 §4): the chip slides (4.17); a row that changes list moves there (persist), one that arrives grows
// from its centre (enter), one that leaves shrinks to its centre (exit), while the box eases to its new height and the
// page keeps still under the pointer (rsHold, rsAnchor). A new signal changes exactly three things once: the sentence,
// one figure's tone and the glyph (4.15). Reduced motion: every change at once, every meaning kept.
import { navigate } from 'astro:transitions/client';
import { cockpit, welcomeBand, rowState, planDay, dueWords, clock, spanWords } from './homecore.mjs';
import { chipOf, verbsFor, apply, historyLine, clockWords, VERBS } from './ownership.mjs';
import { chipHtml, setChip } from './withchip.mjs';
import { glyph, setGlyph, tally } from './health.mjs';
import { parkRead, parkEdit, slotsHtml } from './handover.mjs';

const W = window, D = document;
const fmtD = (d) => (d ? `${+d.slice(8, 10)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+d.slice(5, 7) - 1]}` : '');
const due = (it) => dueWords(it, H.today, fmtD);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const M = () => (W.rsMotion ? W.rsMotion() : { reduced: true, morph: 520, enter: 440, exit: 240, state: 300, stagger: 24, delay: 120, ease: 'ease' });
const cssMs = (name, d) => { const v = getComputedStyle(D.documentElement).getPropertyValue(name).trim(), n = parseFloat(v); return Number.isNaN(n) ? d : /ms$/.test(v) ? n : /s$/.test(v) ? n * 1000 : n; };
const linger = () => cssMs('--dur-linger', 4000);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* blocked */ } } };
const VERB_HELP = { take: 'data-help="verb.take"', hand: 'data-help="verb.hand"', park: 'data-help="verb.park"', resume: 'data-help="verb.resume"' };
const VERB_ID = { take: 'take', hand: 'hand-to', park: 'park', resume: 'resume' };   // the palette's names (src/lib/verbs.mjs)
const KIND_WORD = { task: 'Task', incident: 'Incident', lab: 'Lab test', visit: 'Site visit', refresh: 'Work plan', plan: 'Planning', inbox: 'Approval' };
const STATUS = { todo: 'To do', doing: 'Doing', blocked: 'Waiting on', done: 'Done', booked: 'Booked' };
const TEAMS = [{ id: 'team-network', kind: 'team', name: 'Network team' }, { id: 'team-av-it', kind: 'team', name: 'AV and IT team' }, { id: 'team-desk', kind: 'team', name: 'Service desk' }];
const VENDORS = [{ id: 'poly', kind: 'vendor', name: 'Poly', clockH: 4 }, { id: 'northlight', kind: 'vendor', name: 'Northlight AV', clockH: 8 }, { id: 'keystone', kind: 'vendor', name: 'Keystone Service', clockH: 4 }];

let H = null, L = null, root = null, lastWho = null, lastModel = null, drawn = false;
const localOwn = new Map();      // changes made before the live layer is ready (it arrives a moment after the page)
const moveT = new Map();

// ---- Who has each job now: the base, then the live layer's changes on top ------------------------------------
function ownOf(id) {
  const base = H.cockpit.own[id] ?? null;
  let o = localOwn.get(id) ?? base;
  if (L) { const st = L.live.stateOf(id, { own: base, status: H.items[id]?.status }); o = st.own ?? o; if (st.status === 'done' && H.items[id]?.status !== 'done') o = { ...(o ?? {}), s: 'done' }; }
  return o;
}
const who = () => (W.rsWhoId ? W.rsWhoId() : 'anna');
const actor = () => (W.rsActorId ? W.rsActorId() : who());
const people = () => Object.fromEntries(Object.values(H.people).map((p) => [p.id, { name: p.name, first: p.first, initials: p.initials }]));
const personOf = (id) => H.people[id] || { id, name: id, first: id, role: '', roleId: 'delivery', initials: '?' };
const link = (p) => (p && p.charAt(0) === '/' ? H.base.replace(/\/$/, '') + p : p);
const roomOf = (id) => (id && H.rooms[id] ? H.rooms[id] : null);
const siteName = (id) => (id && H.sites[id] ? H.sites[id].name : '');
const welcomed = () => { try { return JSON.parse(store.get('rs6-welcomed') || '{}') || {}; } catch { return {}; } };
const onLeave = () => store.get('rs6-leave') === 'on';
const inWelcome = (id) => onLeave() && !!H.cockpit.welcome[id] && !welcomed()[id];
const coveringFor = (id) => Object.keys(H.cockpit.welcome).find((x) => inWelcome(x) && coverId(x) === id) ?? null;
const coverId = (x) => Object.values(H.people).find((p) => p.id !== x && p.roleId === personOf(x).roleId && !p.vendor)?.id ?? null;

// ---- One job row: glyph, title, where, the With chip, and the verbs you can use on it ---------------------------
function history(id) {
  const base = (H.cockpit.history[id] ?? []).map((h) => ({ at: clockWords(h.at, H.today), text: h.text }));
  const live = L ? L.live.historyOf(id).filter((e) => e.field === 'own').map((e) => ({ at: clockWords(e.at, H.today), text: historyLine(e.before, e.after, { people: people(), viewer: who() }) })) : [];
  return [...live, ...base];
}
function subOf(it, withDue = true) {
  const bits = [], r = roomOf(it.room), x = H.cockpit.inc[it.id];
  if (r) bits.push(r.name + (it.site && H.sites[it.site] && !H.sites[it.site].remote ? `, ${siteName(it.site).replace(/ office$/, '')}` : ''));
  else if (it.site) bits.push(siteName(it.site));
  if (it.kind === 'incident') { bits.push(`P${it.prio}`); if (x) bits.push(x.past ? 'past target' : `came in ${clockWords(x.opened, H.today)}`); }
  else if (it.project) bits.push(it.project);
  if (withDue && it.kind === 'task' && it.end) bits.push(due(it));
  return bits.join(' · ');
}
function verbButtons(it, own, viewer, kind) {
  return verbsFor(own, viewer, { desk: kind === 'desk' }).map((v, i) => `<button type="button" class="btn small${i === 0 ? '' : ' ghost'}" data-verb="${VERB_ID[v]}" data-job-verb="${v}" ${VERB_HELP[v]}>${VERBS[v]}</button>`).join('');
}
function jobRow(it, list, model, viewer) {
  const own = ownOf(it.id), st = rowState(it, own);
  const chip = chipHtml(chipOf(own, viewer, { people: people(), today: H.today }), { item: it.id, history: history(it.id) });
  const park = own?.s === 'parked' ? parkRead(own.park, { compact: true }) : '';
  return `<li class="job" data-job="${esc(it.id)}" data-list="${list}" data-help="home.job">
    <span class="job-g">${glyph(st, { size: 16, title: it.kind === 'incident' ? `P${it.prio}` : KIND_WORD[it.kind] })}</span>
    <div class="job-main">
      <a class="job-t" href="${esc(it.href)}">${esc(it.title)}</a>
      <p class="job-s">${esc(subOf(it))}</p>
      <div class="job-meta">${chip}</div>
      ${park}
      <div class="job-edit" data-job-edit></div>
    </div>
    <div class="job-act">${verbButtons(it, own, viewer, model.kind)}</div>
  </li>`;
}
const emptyLine = (t) => `<li class="job-none">${esc(t)}</li>`;

// ---- The band ----------------------------------------------------------------------------------------------------
function band(model, me, viewer, fresh) {
  const all = viewer === 'everyone';
  const W_ = inWelcome(viewer) ? welcomeBand(H.cockpit.welcome[viewer], me) : null;
  const title = W_ ? W_.title : all ? 'Everyone, the whole estate' : `${me.first}, ready for you`;
  const t = D.getElementById('pb-title'); if (t && t.textContent !== title) t.textContent = title;
  const where = D.querySelector('[data-who-where]'); if (where) where.textContent = all ? 'every role' : me.where ?? '';
  const answer = W_ ? W_.answer : model.answer;
  const a = D.querySelector('[data-pb-answer]');
  if (a && a.textContent !== answer) {
    a.textContent = answer; a.closest('p')?.setAttribute('title', answer);
    // A new signal: the sentence cross-fades to its new words, once (4.15). View as is moved by the Shell instead.
    if (drawn && !fresh && !M().reduced) a.animate([{ opacity: 0 }, { opacity: 1 }], { duration: M().state, easing: M().ease });
  }
  const figs = W_ ? W_.figures : model.figures;
  figs.forEach((f, i) => {
    const li = D.querySelector(`.kn-i[data-kn="k${i}"]`); if (!li) return;
    li.dataset.knId = f.id; li.hidden = false;
    const aEl = li.querySelector('a');
    if (aEl && f.to) { aEl.setAttribute('href', link(f.to)); const b = aEl.querySelector('b'); if (f.to.charAt(0) === '/') b.setAttribute('data-vt-rec', `dd${f.to.split('?')[0].replace(/[^a-z0-9]+/gi, '-').replace(/-$/, '')}`); else b.removeAttribute('data-vt-rec'); }
    li.setAttribute('data-help-name', f.label);
    W.rsKeyNumber?.(`k${i}`, f.n, { label: f.label, tone: f.tone || '', spark: f.spark || '', title: f.title || '' });
  });
  for (let i = figs.length; i < 4; i++) { const li = D.querySelector(`.kn-i[data-kn="k${i}"]`); if (li) li.hidden = true; }
  const act = D.querySelector('[data-home-action]');
  if (act) {
    const [label, to] = W_ ? ['Start the day', '#summary'] : actionFor(model, me, all);
    act.textContent = label; act.setAttribute('href', link(to));
    act.toggleAttribute('data-start-day', !!W_);
  }
}
function actionFor(model, me, all) {
  if (all) return ['Open Support', '/support/'];
  switch (model.kind) {
    case 'field': return model.office ? [`Open the ${siteName(model.office).replace(/ office$/, '')} office`, `/locations/${model.office}/`] : H.next[me.id] ? ['Open the batch', H.next[me.id].href] : ['Open Support', '/support/'];
    case 'desk': return ['Open Incidents', '/incidents/?state=new'];
    case 'owner': return ['Open Proposals', '/changes/'];
    case 'pm': return me.roleId === 'programme' ? ['Open the year plan', '/work/schedule/?view=year'] : ['Open your projects', `/projects/?owner=${me.id}`];
    case 'lead': return ['Open Locations', '/locations/'];
    case 'vendor': return ['Open your installation', '/vendor/'];
    default: return ['Team schedule', '/work/schedule/?view=day&scope=team'];
  }
}

// ---- Sections, in the role's order, in their layers ----------------------------------------------------------------
function place(model, viewer) {
  const welcome = inWelcome(viewer), cover = coveringFor(viewer);
  D.querySelector('[data-sec="welcome"]').hidden = !welcome;
  root.querySelectorAll('.layer, [data-oh]').forEach((el) => { el.hidden = welcome; });
  if (welcome) return;
  let layout = model.layout;
  // Someone without an office floor plan (at home, on the road) sees the estate instead of the floors.
  if (model.kind === 'field' && !model.office) layout = { ...layout, summary: layout.summary.map((s) => (s === 'floors' ? 'estate' : s)) };
  const summary = root.querySelector('[data-layer="summary"]'), record = root.querySelector('[data-layer="record"]');
  const role = personOf(viewer).roleId;
  const onlyFor = { device: ['delivery', 'network'], provision: ['delivery', 'network'], lab: ['innovation', 'sm-av'] };
  layout = { ...layout, record: layout.record.filter((s) => !onlyFor[s] || onlyFor[s].includes(role)) };
  const want = new Set([...(cover ? ['cover'] : []), ...layout.summary, ...layout.record]);
  root.querySelectorAll('.layer [data-sec]').forEach((el) => { el.hidden = !want.has(el.dataset.sec); });
  // Nothing new for you: Ready for you steps aside (the figure still says 0).
  const ready = root.querySelector('[data-sec="ready"]'); if (ready && !ready.hidden) ready.hidden = model.ready.length === 0 || model.kind === 'desk';
  // Move sections only when the order differs, so focus and open folds stay where they are.
  [[summary, [...(cover ? ['cover'] : []), ...layout.summary]], [record, layout.record]].forEach(([box, ids]) => {
    const els = ids.map((id) => root.querySelector(`.layer [data-sec="${id}"]`)).filter(Boolean);
    const now = [...box.children].filter((c) => els.includes(c));
    if (now.length !== els.length || now.some((c, i) => c !== els[i])) els.forEach((el) => box.appendChild(el));
  });
  // The tour card stays at the very end of the record.
  const tour = root.querySelector('[data-tour]'); if (tour) record.appendChild(tour);
}

// ---- The lists -----------------------------------------------------------------------------------------------------
function fillLists(model, viewer) {
  const list = (name, rows, none) => {
    const el = root.querySelector(`[data-list="${name}"]`); if (!el) return;
    el.innerHTML = rows.length ? rows.map((it) => jobRow(it, name, model, viewer)).join('') : none ? emptyLine(none) : '';
    const n = root.querySelector(`[data-n="${name}"]`); if (n) n.textContent = rows.length ? String(rows.length) : '';
  };
  list('ready', model.ready);
  list('queue', model.kind === 'desk' ? model.queue : [], model.kind === 'desk' ? 'Nothing open. Every ticket is resolved.' : '');
  list('with', model.withYou);
  root.querySelector('[data-empty="with"]').hidden = model.withYou.length > 0;
  const rv = root.querySelector('[data-list="review"]');
  rv.innerHTML = model.review.map((r) => `<li class="rv-i"><span class="rv-g">${glyph('review', { size: 16 })}</span><span class="rv-b">${r.href ? `<a href="${esc(r.href)}">${esc(r.title)}</a>` : `<b>${esc(r.title)}</b>`}<small>${esc(r.sub)}</small></span></li>`).join('');
  root.querySelector('[data-n="review"]').textContent = model.review.length ? String(model.review.length) : '';
  root.querySelector('[data-empty="review"]').hidden = model.review.length > 0;
}

// The office's floors (field roles) and the estate, with one line that says how they are.
function pictures(model, viewer) {
  const C = H.cockpit, office = model.office;
  root.querySelectorAll('[data-sec="floors"] [data-sm-card]').forEach((c) => { c.hidden = c.dataset.site !== office; });
  if (office) {
    const sh = C.siteHealth[office], nm = siteName(office);
    root.querySelector('[data-floors-name]').textContent = nm;
    root.querySelector('[data-floors-say]').textContent = tally(sh.fault.length, sh.review.length);
    const a = root.querySelector('[data-floors-link]'); a.setAttribute('href', link(`/locations/${office}/`)); a.innerHTML = `Open the office <span aria-hidden="true">→</span>`;
  }
  const est = C.offices.reduce((a, s) => ({ f: a.f + C.siteHealth[s].fault.length, r: a.r + C.siteHealth[s].review.length }), { f: 0, r: 0 });
  root.querySelector('[data-estate-say]').textContent = `${C.offices.length} offices · ${tally(est.f, est.r)}`;
}

// Done automatically today, what changed overnight, knowledge to review: in the viewer's scope.
function quiet(model, viewer) {
  const C = H.cockpit, me = personOf(viewer), all = viewer === 'everyone';
  const scope = all || !me.region || ['desk', 'owner', 'lead', 'pm'].includes(model.kind) ? null
    : model.office && me.roleId === 'tech' ? new Set([model.office]) : new Set(Object.keys(H.sites).filter((s) => H.sites[s].region === me.region));
  const inScope = (x) => !scope || !x.site || scope.has(x.site);
  const fill = (k, rows, none) => {
    root.querySelector(`[data-qn="${k}"]`).textContent = String(rows.length);
    root.querySelector(`[data-ql="${k}"]`).innerHTML = rows.length ? rows.map((r) => `<li class="qd-i">${r.at ? `<span class="qd-at">${esc(clockWords(r.at, H.today))}</span>` : ''}<span class="qd-b"><a href="${esc(r.href)}">${esc(r.text ?? r.title)}</a>${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span></li>`).join('') : `<li class="qd-none">${esc(none)}</li>`;
  };
  fill('auto', C.auto.filter(inScope).map((a) => ({ ...a, sub: `${a.number} · Done automatically under ${a.rule.name} (owner: ${personOf(a.rule.owner).first}) · How was this done?` })), 'Nothing ran for you today.');
  fill('changed', C.changed.filter(inScope), 'Nothing changed overnight.');
  fill('knowledge', ['field', 'owner', 'desk'].includes(model.kind) || all ? C.knowledge : [], 'Nothing to review.');
}

// My day: where you are, the hours bar with the day in order, the current time, and the list.
function day(viewer, items) {
  const box = root.querySelector('[data-day]'); if (!box || box.hidden) return;
  const me = personOf(viewer), pl = H.place[viewer];
  const now = localNow(me.tz), plan = planDay(items, viewer, H.today);
  box.querySelector('[data-day-place]').innerHTML = `<i class="day-dot ${esc(pl ? pl.kind : 'remote')}" aria-hidden="true"></i>${esc(placeWords(pl))} <span class="faint">· ${esc(now.text)} in ${esc(H.sites[me.office]?.city || 'your office')}</span>`;
  box.querySelector('[data-day-full]').setAttribute('href', link(`/work/schedule/?view=day&who=${viewer}&d=${H.today}`));
  const start = 8, end = 18, pct = (h) => `${(((h - start) / (end - start)) * 100).toFixed(2)}%`;
  let bar = '';
  for (let h = start; h <= end; h += 2) bar += `<span class="day-tick" style="left:${pct(h)}"><i></i>${clock(h)}</span>`;
  plan.forEach((x, i) => { if (x.from == null) return; bar += `<a class="day-blk k-${esc(x.it.kind)}${x.it.status === 'blocked' ? ' blocked' : ''}" style="left:${pct(x.from)};width:${(((x.to - x.from) / (end - start)) * 100).toFixed(2)}%;--i:${i}" href="${esc(x.it.href)}" title="${esc(x.it.title)}" tabindex="-1"><span>${esc(x.it.title)}</span></a>`; });
  if (now.h >= start && now.h <= end && pl && pl.kind !== 'away') bar += `<span class="day-now" style="left:${pct(now.h)}"><i></i><b>Now</b></span>`;
  box.querySelector('[data-day-bar]').innerHTML = bar;
  box.querySelector('[data-day-list]').innerHTML = plan.map((x, i) => {
    const it = x.it, r = roomOf(it.room);
    return `<li class="day-i" style="--i:${i}" data-help="home.day-item"><a href="${esc(it.href)}"><span class="day-t">${x.from == null ? '<small>Later</small>' : `<b>${clock(x.from)}</b><small>${spanWords(x.hours)}</small>`}</span><span class="day-k k-${esc(it.kind)}" aria-hidden="true"></span><span class="day-b"><b>${esc(it.title)}</b><small>${esc(KIND_WORD[it.kind] || it.kind)}${r ? ` · ${esc(r.name)}` : it.site ? ` · ${esc(siteName(it.site))}` : ''}${it.kind === 'incident' ? (it.prio ? ` · P${it.prio}` : '') : it.status === 'blocked' ? ' · Waiting on something' : ''}</small></span><span class="day-arrow" aria-hidden="true">→</span></a></li>`;
  }).join('');
  box.querySelector('[data-day-empty]').hidden = plan.length > 0;
  box.querySelector('[data-day-bar]').hidden = plan.length === 0;
}
const localNow = (tz) => { try { const s = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date()); const p = s.split(':'); return { text: s, h: +p[0] + +p[1] / 60 }; } catch { const d = new Date(); return { text: d.toTimeString().slice(0, 5), h: d.getHours() + d.getMinutes() / 60 }; } };
function placeWords(pl) {
  if (!pl) return 'Working remotely';
  if (pl.kind === 'away') return pl.why === 'holiday' ? `Away: ${pl.note || 'public holiday'}` : pl.why === 'weekend' ? 'Weekend' : `Away: ${pl.note || 'time off'}`;
  if (pl.kind === 'office') return `At the ${siteName(pl.site)}`;
  if (pl.kind === 'home') { const r = roomOf(pl.place); return `At home${r ? `, ${r.name}` : ''}`; }
  if (pl.kind === 'visiting') { const v = roomOf(pl.place); return `Visiting ${v ? v.name : siteName(pl.site)}`; }
  return 'Working remotely';
}

// Engineers, vendors and managers: the next device, provisioning, the team today (unchanged from v0.1).
function details(viewer, items) {
  const all = viewer === 'everyone';
  const none = (t) => `<p class="hp-empty">${esc(t)}</p>`;
  const dev = (n) => {
    if (!n) return none('No device waiting: nothing of yours is in Deploy.');
    const u = n.unit;
    return `<a class="next dev" href="${esc(n.href)}" data-help="home.device-card"><span class="next-b"><span class="next-k">${esc(n.project)} ${esc(n.projectName)} · ${esc(n.siteName)}</span><b>${esc(u ? u.name : n.batch)}</b><small>${esc(u && u.model ? `${u.model} · ` : '')}${esc(n.batch)}: ${n.done} of ${n.total} set up${n.issues ? ` · ${n.issues} ready for you` : n.ready ? ` · ${n.ready} checked, to accept` : ''}</small><span class="next-go">Open the batch →</span></span></a>`;
  };
  root.querySelector('[data-device]').innerHTML = dev(H.next[all ? 'anna' : viewer]);
  root.querySelector('[data-device-vendor]').innerHTML = dev(H.next[all ? 'sam' : viewer]);
  const prov = items.filter((i) => i.kind === 'task' && i.taskKind === 'provision' && (all || i.who.includes(viewer)) && i.status !== 'done');
  root.querySelector('[data-provision]').innerHTML = prov.length ? prov.map((i) => `<a class="mini-row" href="${esc(i.href)}">${glyph(i.status === 'blocked' ? 'review' : i.status === 'doing' ? 'progress' : 'planned', { size: 12 })}<span>${esc(i.title)}<small>${esc(STATUS[i.status])} · ${esc(subOf(i))}</small></span><span class="mr-arrow" aria-hidden="true">→</span></a>`).join('') : none('Nothing waiting to be provisioned.');
  const pa = root.querySelector('[data-provision-all]'); pa.textContent = `See all ${prov.length} in the Work list →`; pa.setAttribute('href', link(`/work/list/?kind=provision${all ? '' : `&person=${viewer}`}`));
  const me = all ? null : personOf(viewer), ppl = all ? personOf('olivia').people : me ? me.people : [];
  root.querySelector('[data-team]').innerHTML = ppl.length ? ppl.map((id) => {
    const p = personOf(id), pl = H.place[id], n = planDay(items, id, H.today).length;
    return `<a class="team-row" href="${esc(link(`/work/schedule/?view=day&who=${id}&d=${H.today}`))}" data-help="home.team-row"><span class="av">${esc(p.initials)}</span><span class="team-n"><b>${esc(p.name)}</b><small>${esc(p.role)}</small></span><span class="team-p"><i class="day-dot ${esc(pl ? pl.kind : 'remote')}" aria-hidden="true"></i>${esc(placeWords(pl))}</span><span class="team-w faint">${pl && pl.kind === 'away' ? '' : `${n} ${n === 1 ? 'thing' : 'things'} today`}</span></a>`;
  }).join('') : none('Nobody reports to you in this demo.');
  const pa2 = root.querySelector('[data-projects-all]'); if (pa2) pa2.setAttribute('href', link(me && me.roleId === 'pm' ? `/projects/?owner=${viewer}` : '/projects/'));
}

// ---- Welcome back and the cover card: one card, two moments (UX-V2 §4.3) ------------------------------------------
function welcomeCard(viewer, fresh) {
  const w = H.cockpit.welcome[viewer]; if (!w) return;
  const card = D.querySelector('[data-ho="welcome"]');
  const cov = personOf(w.cover);
  const line = (r) => ({ ...r, to: r.to ?? r.href, chip: r.item ? chipHtml(chipOf(ownOf(r.item), viewer, { people: people(), today: H.today }), { item: r.item, history: history(r.item) }) : '', glyph: r.item ? glyph(rowState(H.items[r.item] ?? {}, ownOf(r.item)), { size: 16 }) : '' });
  card.querySelector('[data-ho-title]').textContent = `${fmtDay(w.from)} to ${fmtDay(w.to)}`;
  card.querySelector('[data-ho-over]').textContent = 'While you were away';
  let meta = card.querySelector('[data-ho-meta]');
  if (!meta) { meta = D.createElement('p'); meta.className = 'ho-meta'; meta.setAttribute('data-ho-meta', ''); card.querySelector('.ho-hd').appendChild(meta); }
  meta.textContent = `${cov.name} covered your open jobs. Your parked work is where you left it.`;
  card.querySelector('[data-ho-body]').innerHTML = slotsHtml('welcome', {
    open: { lines: w.open.map(line) },
    handled: { lines: w.handled.map(line), free: w.rules.length ? `Also done automatically on your spaces: ${w.rules.length} tickets matched to their space.` : '' },
    changed: { lines: w.changed.map(line) },
    refresh: { lines: w.refresh.map(line), free: w.refresh.length ? 'After 90 days away from a procedure, its checklist opens with every step and why.' : '' },
  });
  if (fresh && !M().reduced) { card.setAttribute('data-enter', ''); setTimeout(() => card.removeAttribute('data-enter'), 1200); }
}
function coverCard(viewer) {
  const away = coveringFor(viewer), sec = root.querySelector('[data-sec="cover"]');
  if (!away) { sec.hidden = true; return; }
  const w = H.cockpit.welcome[away], p = personOf(away), card = sec.querySelector('[data-ho="cover"]');
  card.querySelector('[data-ho-title]').textContent = `Covering for ${p.first}`;
  let meta = card.querySelector('[data-ho-meta]');
  if (!meta) { meta = D.createElement('p'); meta.className = 'ho-meta'; meta.setAttribute('data-ho-meta', ''); card.querySelector('.ho-hd').appendChild(meta); }
  meta.textContent = `${p.first} is back today. This card goes when ${p.first} starts the day.`;
  const open = w.open.map((r) => ({ ...r, glyph: glyph(rowState(H.items[r.item] ?? {}, ownOf(r.item)), { size: 16 }), chip: chipHtml(chipOf(ownOf(r.item), viewer, { people: people(), today: H.today }), { item: r.item, history: history(r.item) }) }));
  const fragile = w.open.filter((r) => ownOf(r.item)?.s === 'waiting').map((r) => ({ title: r.title, sub: `Waiting on ${ownOf(r.item).wait}`, to: r.to, glyph: glyph('review', { size: 16 }) }));
  const owns = w.open.map((r) => ({ title: r.title, sub: H.items[r.item]?.kind === 'incident' ? `With you while ${p.first} is away` : `Stays with ${p.first}`, to: r.to }));
  card.querySelector('[data-ho-body]').innerHTML = slotsHtml('cover', { open: { lines: open }, fragile: { lines: fragile }, owns: { lines: owns }, changed: { lines: w.changed.slice(0, 5) } });
}
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDay = (d) => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}`;

// ---- The task list: Today, This week, Later; one tap ticks a task through the live layer ------------------------------
function currentItems() {
  return Object.values(H.items).map((it) => {
    const s = L ? L.live.stateOf(it.id, { status: it.status, owner: it.who[0] || null }) : { status: it.status };
    const who = it.kind === 'task' && s.owner && s.owner !== it.who[0] ? [s.owner] : it.who;
    return { ...it, status: s.status || it.status, who };
  });
}
const dayN = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
function bucket(it) {
  if (it.status === 'done') return 'done';
  if (it.kind === 'incident' || it.kind === 'inbox') return 'today';
  if (it.kind === 'refresh' || it.kind === 'plan') return 'later';
  const at = it.kind === 'task' ? it.end : it.start; if (!at) return 'later';
  const n = dayN(H.today, at);
  if (n <= 0 || (it.start && it.start <= H.today && it.end >= H.today)) return 'today';
  return n <= 7 ? 'week' : 'later';
}
function taskGroups(items, viewer) {
  const all = viewer === 'everyone';
  const mine = items.filter((it) => (all || it.who.includes(viewer)) && !['time-off', 'inbox', 'plan', 'visit'].includes(it.kind) && (!all || it.kind === 'task'));
  const out = { today: [], week: [], later: [], done: [] }, plans = {};
  mine.forEach((it) => {
    if (it.kind !== 'refresh') { out[bucket(it)].push(it); return; }
    const k = `${it.site}:${(it.end || '').slice(0, 4)}`;
    const row = plans[k] ?? (plans[k] = { ...it, id: `refresh:${k}`, room: null, units: 0, rooms: 0, href: link(`/refresh/?site=${it.site}&due=over,now`) });
    row.units += it.units || 0; row.rooms += 1;
  });
  Object.values(plans).forEach((r) => { r.title = `Replace ${r.units} ${r.units === 1 ? 'device' : 'devices'} due in ${(r.end || '').slice(0, 4)}`; out.later.push(r); });
  const order = { incident: 0, task: 2, lab: 3, refresh: 5 };
  Object.values(out).forEach((g) => g.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || (a.kind === 'incident' ? (a.prio || 9) - (b.prio || 9) : 0) || (a.end || a.start || '9').localeCompare(b.end || b.start || '9') || a.title.localeCompare(b.title)));
  return out;
}
let rowsById = {};
function taskRow(it, viewer, i) {
  const all = viewer === 'everyone', tick = it.kind === 'task', st = it.status;
  const d = it.kind === 'task' && it.end ? dayN(H.today, it.end) : 1;
  return `<li class="th st-${esc(st)} k-${esc(it.kind)}" style="--i:${i}" data-row="${esc(it.id)}"${tick ? ` data-live-task="${esc(it.id.slice(5))}"` : ''} data-help="home.task">`
    + (tick ? `<button type="button" class="tbox" data-tick aria-label="${st === 'done' ? 'Ticked done. Select to reopen' : 'Tick done'}" aria-pressed="${st === 'done'}" data-help="home.tick"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : `<span class="tbox k" aria-hidden="true">${it.kind === 'incident' ? (it.prio ? `P${it.prio}` : '·') : it.kind === 'lab' ? 'Lab' : it.kind === 'refresh' ? 'Plan' : '·'}</span>`)
    + `<a class="th-main" href="${esc(it.href)}"><b>${esc(it.title)}</b><small>${all && it.who.length ? `<span class="th-owner">${esc(personOf(it.who[0]).name)} · </span>` : ''}${esc(subOf(it, false))}</small></a>`
    + `<span class="th-due${d < 0 ? ' late' : d <= 7 ? ' soon' : ''}">${esc(due(it))}</span>`
    + `<span class="th-st" data-pill>${esc(it.kind === 'incident' ? ({ todo: 'New', doing: 'In progress', blocked: 'On hold' }[st] || st) : STATUS[st] || st)}</span></li>`;
}
function tasks(viewer, items) {
  const box = root.querySelector('[data-tasks]'), g = taskGroups(items, viewer);
  let n = 0; rowsById = {};
  ['today', 'week', 'later', 'done'].forEach((k) => {
    const grp = box.querySelector(`[data-group="${k}"]`);
    let rows = g[k];
    if (k === 'done') rows = rows.filter((it) => L && L.live.historyOf(it.id).some((e) => e.at.slice(0, 10) === new Date().toISOString().slice(0, 10)));
    grp.querySelector('[data-rows]').innerHTML = rows.length ? rows.map((it, i) => taskRow(it, viewer, n + i)).join('') : k === 'today' ? '<li class="th th-none">Nothing due today.</li>' : '';
    grp.querySelector('[data-n]').textContent = rows.length ? String(rows.length) : '';
    grp.hidden = rows.length === 0 && k !== 'today';
    if (k !== 'done') n += rows.length;
    rows.forEach((it) => { rowsById[it.id] = grp.querySelector(`[data-row="${CSS.escape(it.id)}"]`); });
  });
  root.querySelector('[data-task-summary]').textContent = n ? `${n} open` : '';
  root.querySelector('[data-task-empty]').hidden = n > 0 || viewer === 'everyone';
  const sa = root.querySelector('[data-tasks-all]');
  if (sa) { sa.textContent = `See all ${n} in the Work list →`; sa.setAttribute('href', link(`/work/list/?kind=${H.taskKinds}${viewer === 'everyone' ? '' : `&person=${viewer}`}`)); sa.hidden = n === 0; }
}
function tick(id) {
  const it = H.items[`task:${id}`]; if (!it) return;
  const now = L ? L.live.stateOf(it.id, { status: it.status }) : { status: it.status };
  const after = now.status === 'done' ? (it.status === 'done' ? 'todo' : it.status) : 'done';
  if (L) L.live.record({ item: it.id, field: 'status', before: now.status, after, who: L.who() });
}
function paintTask(item, e, remote) {
  const row = rowsById[item]; if (!row) { draw(false); return; }
  const st = L.live.stateOf(item, { status: H.items[item].status }).status;
  row.className = `th st-${st} k-task`;
  const pill = row.querySelector('[data-pill]'); pill.textContent = STATUS[st] || st;
  const tb = row.querySelector('[data-tick]'); if (tb) { tb.setAttribute('aria-pressed', String(st === 'done')); tb.setAttribute('aria-label', st === 'done' ? 'Ticked done. Select to reopen' : 'Tick done'); }
  const whoName = e && e.who ? personOf(e.who).first : 'You';
  W.rsMarkChanged?.(row.querySelector('.th-main'), whoName);
  if (!remote) toast(st === 'done' ? 'Ticked done' : `Set to ${STATUS[st] || st}`, whoName, e);
  clearTimeout(moveT.get(item));
  moveT.set(item, setTimeout(() => morph(() => draw(false, true)), M().reduced ? 0 : linger()));
}
let toastT = null;
function toast(what, whoName, ev) {
  const t = root.querySelector('[data-toast]'); if (!t) return;
  t.innerHTML = `<span>${esc(what)} · ${esc(whoName)}, just now</span>${ev && L ? `<button type="button" class="btn small ghost" data-undo="${esc(ev.id)}" data-help="live.undo">Undo</button>` : ''}`;
  t.hidden = false; requestAnimationFrame(() => t.classList.add('on'));
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.classList.remove('on'); setTimeout(() => { t.hidden = true; }, M().exit); }, linger());
}

// ---- Draw everything ---------------------------------------------------------------------------------------------
function draw(fresh = false, quietly = false) {
  if (!root || !D.contains(root)) return;
  const viewer = who(), all = viewer === 'everyone', me = all ? { first: 'Everyone', name: 'Everyone' } : personOf(viewer);
  const items = currentItems();
  const model = cockpit({ ...H, items: Object.fromEntries(items.map((it) => [it.id, it])) }, ownOf, viewer);
  const prev = lastModel && lastWho === viewer ? lastModel : null;
  band(model, me, viewer, fresh || lastWho !== viewer);
  place(model, viewer);
  if (inWelcome(viewer)) welcomeCard(viewer, fresh || lastWho !== viewer);
  coverCard(viewer);
  fillLists(model, viewer);
  pictures(model, viewer);
  quiet(model, viewer);
  day(viewer, items);
  details(viewer, items);
  tasks(viewer, items);
  W.__rsInboxRender?.();
  D.dispatchEvent(new CustomEvent('rs:sa-refresh'));
  root.removeAttribute('aria-busy');
  // A new signal while you look: exactly three things change, once (MOTION-V2 4.15).
  if (prev && !quietly && model.ready.length > prev.ready.length) signal(model);
  lastModel = model; lastWho = viewer; drawn = true;
}
function signal(model) {
  if (M().reduced) return;
  const li = D.querySelector('.kn-i[data-kn-id="ready"] b');
  li?.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: M().state, easing: M().ease });
  // A P1 plays one 800 ms flash of the band's strip, once.
  if (model.ready.some((it) => it.kind === 'incident' && it.prio === 1)) D.querySelector('.band.pb')?.animate([{ boxShadow: 'inset 0 -3px 0 var(--h-fault)' }, { boxShadow: 'inset 0 -3px 0 transparent' }], { duration: cssMs('--dur-flash', 800), easing: M().ease });
}

// Persist, enter and exit for rows when lists change (M2), inside a held box so the page never jumps (M6).
function morph(update) {
  const m = M();
  if (m.reduced || !root) { update(); return; }
  const rows = [...root.querySelectorAll('[data-job]')].filter((r) => r.getClientRects().length);
  const before = new Map(), byId = new Map();
  rows.forEach((r) => { const b = r.getBoundingClientRect(); before.set(`${r.dataset.list}|${r.dataset.job}`, { r, b }); if (!byId.has(r.dataset.job)) byId.set(r.dataset.job, b); });
  const anchor = W.rsAnchor ? W.rsAnchor() : null;
  const layer = root.querySelector('[data-layer="summary"]');
  const run = () => { update(); anchor?.restore(); };
  if (W.rsHold && layer) W.rsHold(layer, run); else run();
  const after = [...root.querySelectorAll('[data-job]')].filter((r) => r.getClientRects().length);
  const keysNow = new Set(after.map((r) => `${r.dataset.list}|${r.dataset.job}`)), idsNow = new Set(after.map((r) => r.dataset.job));
  let k = 0;
  after.forEach((r) => {
    const b = before.get(`${r.dataset.list}|${r.dataset.job}`)?.b ?? byId.get(r.dataset.job), n = r.getBoundingClientRect();
    if (b) { const dx = b.left - n.left, dy = b.top - n.top; if (Math.abs(dx) + Math.abs(dy) > 1) r.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: m.morph, easing: m.ease }); }
    else r.animate([{ transform: 'scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: m.enter, delay: m.delay + Math.min(k++, 12) * m.stagger, easing: m.ease, fill: 'backwards' });
  });
  before.forEach(({ r, b }, key) => {
    if (keysNow.has(key) || idsNow.has(r.dataset.job) || !b.height) return;
    const g = D.createElement('div'); g.className = 'content home ck-ghost'; g.setAttribute('aria-hidden', 'true');
    g.style.cssText = `position:absolute;left:${b.left + scrollX}px;top:${b.top + scrollY}px;width:${b.width}px;margin:0;padding:0;pointer-events:none;z-index:5;display:block`;
    const ol = D.createElement('ol'); ol.className = 'jobs'; ol.appendChild(r); g.appendChild(ol); D.body.appendChild(g);
    g.animate([{ transform: 'none', opacity: 1 }, { transform: 'scale(.94)', opacity: 0 }], { duration: m.exit, easing: getComputedStyle(D.documentElement).getPropertyValue('--ease-exit').trim() || 'ease-in', fill: 'forwards' }).onfinish = () => g.remove();
  });
}

// ---- The verbs ---------------------------------------------------------------------------------------------------
function doVerb(verb, id, extra = {}) {
  const before = ownOf(id), by = actor();
  const after = apply(verb, before, { who: by, at: new Date().toISOString(), ...extra });
  if (L) L.live.record({ item: id, field: 'own', before, after, who: by });
  else { localOwn.set(id, after); changed(id, after, false, by); }
  if (verb === 'resume') {
    const it = H.items[id];
    setTimeout(() => { if (it?.href) navigate(it.href); }, M().reduced ? 0 : cssMs('--dur-chip', 320) + M().stagger * 8);
  }
}
// A change to who has a job, from this window or another: the chip slides in place at once; the lists follow.
function changed(id, own, remote, by) {
  const viewer = who();
  root.querySelectorAll(`[data-wc-item="${CSS.escape(id)}"]`).forEach((el) => {
    setChip(el, chipOf(own, viewer, { people: people(), today: H.today }), { history: history(id) });
    const row = el.closest('[data-job]');
    if (row) {
      const it = H.items[id]; const g = row.querySelector('.job-g .hg'); if (g && it) setGlyph(g, rowState(it, own));
      row.querySelector('.job-act').innerHTML = verbButtons(it, own, viewer, lastModel?.kind);
      const park = row.querySelector(':scope .job-main > .ho-park'); if (park) park.remove();
      if (own?.s === 'parked') row.querySelector('.job-meta').insertAdjacentHTML('afterend', parkRead(own.park, { compact: true }));
      row.querySelector('[data-job-edit]').innerHTML = '';
      if (remote) W.rsMarkChanged?.(row.querySelector('.job-meta'), personOf(by).first);
    }
  });
  // The figures and the sentence change now (in place, M9); the rows move once the chip has settled.
  const items = currentItems();
  const model = cockpit({ ...H, items: Object.fromEntries(items.map((it) => [it.id, it])) }, ownOf, viewer);
  band(model, viewer === 'everyone' ? { first: 'Everyone' } : personOf(viewer), viewer, false);
  clearTimeout(moveT.get(`own:${id}`));
  moveT.set(`own:${id}`, setTimeout(() => morph(() => draw(false)), M().reduced ? 0 : remote ? linger() : cssMs('--dur-chip', 320) + 360));
}

// Hand to and Park open a short form inside the row, grown from the button that opened it (4.20).
function openEdit(row, verb, btn) {
  const box = row.querySelector('[data-job-edit]'), id = row.dataset.job;
  if (box.dataset.open === verb) { closeEdit(box); return; }
  const html = verb === 'park' ? parkEdit(ownOf(id)?.park ?? {}, { id: `pk-${id.replace(/\W/g, '')}` }) : handForm(id);
  const swap = () => { box.innerHTML = html; box.dataset.open = verb; };
  if (W.rsHold) W.rsHold(row.closest('.ck') ?? row, swap); else swap();
  const form = box.firstElementChild;
  if (form && btn && !M().reduced) {
    const b = btn.getBoundingClientRect(), f = form.getBoundingClientRect();
    form.style.setProperty('--ox', `${Math.max(0, b.left + b.width / 2 - f.left)}px`);
    form.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: M().pop, easing: M().ease });
  }
  form?.querySelector('input, select')?.focus({ preventScroll: true });
}
function closeEdit(box) {
  const done = () => { box.innerHTML = ''; delete box.dataset.open; };
  const form = box.firstElementChild;
  if (!form || M().reduced) { if (W.rsHold) W.rsHold(box.closest('.ck') ?? box, done); else done(); return; }
  form.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(.97)' }], { duration: M().exit, easing: 'ease-in', fill: 'forwards' }).onfinish = () => { if (W.rsHold) W.rsHold(box.closest('.ck') ?? box, done); else done(); };
}
function handForm(id) {
  const viewer = who(), me = personOf(viewer);
  const staff = Object.values(H.people).filter((p) => p.id !== viewer && !p.vendor);
  const same = staff.filter((p) => p.roleId === me.roleId || p.team === me.team);
  const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
  const fid = `hd-${id.replace(/\W/g, '')}`;
  return `<form class="hand-form" data-hand-form data-help="handover.hand">
    <label class="ho-f" for="${fid}-to"><span>Hand to</span><select id="${fid}-to" name="to" required>
      <option value="">Choose a person, team or vendor</option>
      ${same.length ? `<optgroup label="Your team">${same.map((p) => opt(`person:${p.id}`, `${p.name} · ${p.role}`)).join('')}</optgroup>` : ''}
      <optgroup label="Teams">${TEAMS.map((t) => opt(`team:${t.id}`, t.name)).join('')}</optgroup>
      <optgroup label="Vendors">${VENDORS.map((v) => opt(`vendor:${v.id}`, `${v.name} (vendor)`)).join('')}</optgroup>
      <optgroup label="Everyone else">${staff.filter((p) => !same.includes(p)).map((p) => opt(`person:${p.id}`, `${p.name} · ${p.role}`)).join('')}</optgroup>
    </select></label>
    <label class="ho-f" for="${fid}-why"><span>Why?</span><input id="${fid}-why" name="why" type="text" maxlength="140" autocomplete="off" placeholder="The one thing only you know"></label>
    <div class="ho-act"><button type="submit" class="btn primary small">Hand to</button><button type="button" class="btn ghost small" data-cancel>Cancel</button><span class="ho-note faint">The job moves as a whole: the record, the history and your reason.</span></div>
  </form>`;
}
function targetOf(v) {
  const [k, id] = String(v).split(':');
  if (k === 'person') return { id, kind: 'person', name: personOf(id).name };
  if (k === 'team') return TEAMS.find((t) => t.id === id);
  if (k === 'vendor') return VENDORS.find((x) => x.id === id);
  return null;
}
function clockIn(h) { const d = new Date(Date.now() + h * 36e5); return `${String(d.getHours()).padStart(2, '0')}:00`; }

function bind() {
  if (root.__rsBound) return; root.__rsBound = true;
  root.addEventListener('click', (e) => {
    const t = e.target;
    const vb = t.closest('[data-job-verb]');
    if (vb) {
      const row = vb.closest('[data-job]'), v = vb.dataset.jobVerb;
      if (v === 'take' || v === 'resume') doVerb(v, row.dataset.job);
      else openEdit(row, v, vb);
      return;
    }
    const c = t.closest('[data-cancel]'); if (c) { closeEdit(c.closest('[data-job-edit]')); return; }
    const tb = t.closest('[data-tick]'); if (tb) { const r = tb.closest('[data-live-task]'); if (r) tick(r.dataset.liveTask); return; }
    const u = t.closest('[data-undo]');
    if (u && L) { const ev = L.live.events().find((x) => x.id === u.dataset.undo); L.live.undo(u.dataset.undo, { who: L.who(), base: ev ? { status: H.items[ev.item]?.status } : {} }); const ts = root.querySelector('[data-toast]'); ts.classList.remove('on'); setTimeout(() => { ts.hidden = true; }, M().exit); }
  });
  root.addEventListener('submit', (e) => {
    const f = e.target; e.preventDefault();
    const row = f.closest('[data-job]'); if (!row) return;
    const id = row.dataset.job, data = Object.fromEntries(new FormData(f).entries());
    if (f.matches('[data-park-form]')) doVerb('park', id, { card: data });
    if (f.matches('[data-hand-form]')) {
      const target = targetOf(data.to); if (!target) { f.querySelector('select')?.focus(); return; }
      doVerb('hand', id, { target, why: data.why, clock: target.kind === 'vendor' ? clockIn(target.clockH) : undefined });
    }
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const box = e.target.closest?.('[data-job-edit]'); if (box && box.dataset.open) { e.stopPropagation(); closeEdit(box); box.closest('[data-job]')?.querySelector(`[data-job-verb="${box.dataset.open}"]`)?.focus(); } } });
  // Start the day: Welcome back leaves, Home arrives (rsChange: what leaves shrinks, what arrives grows, 4.26).
  D.querySelector('[data-home-action]')?.addEventListener('click', (e) => {
    const a = e.currentTarget; if (!a.hasAttribute('data-start-day')) return;
    e.preventDefault();
    const w = welcomed(); w[who()] = true; store.set('rs6-welcomed', JSON.stringify(w));
    const go = () => draw(true);
    if (W.rsChange) W.rsChange(() => {}, go, { roots: ['main'] }); else go();
    scrollTo({ top: 0, behavior: 'instant' });
    D.getElementById('pb-title')?.focus?.();
  });
}

// ---- Start: once per page ------------------------------------------------------------------------------------------
export function start() {
  root = D.querySelector('[data-home]'); H = W.RS_HOME;
  if (!root || !H) return;
  lastWho = null; lastModel = null; drawn = false; L = null;
  bind();
  draw(true);
  W.rsDepthOpen?.();
  const goLive = () => {
    L = W.rsLive; if (!L || !D.contains(root)) return;
    L.register('task:', { base: (item) => ({ status: H.items[item]?.status, owner: H.items[item]?.who[0] ?? null }), describe: describeEvent });
    L.register('inc:', { base: (item) => ({ own: H.cockpit.own[item] ?? null }), describe: describeEvent });
    // Apply anything done before the live layer arrived, then follow it.
    localOwn.forEach((after, id) => L.live.record({ item: id, field: 'own', before: H.cockpit.own[id] ?? null, after, who: actor() }));
    localOwn.clear();
    draw(false, true);
    const stops = ['task:', 'inc:', 'lab:', 'inbox:'].map((k) => L.live.subscribe(k, (e, info) => {
      if (!D.contains(root)) return;
      if (e.field === 'own') changed(e.item, ownOf(e.item), info?.remote, e.who);
      else if (e.field === 'status' && rowsById[e.item]) paintTask(e.item, e, info?.remote);
      else morph(() => draw(false));
    }));
    D.addEventListener('astro:before-swap', () => stops.forEach((s) => s()), { once: true });
  };
  if (W.rsLive) goLive(); else D.addEventListener('rs:live-ready', goLive, { once: true });
  if (!W.__rsHomeHook) {
    W.__rsHomeHook = true;
    // View as and a module change redraw in place, inside the Shell's rsChange.
    D.addEventListener('rs:demo-change', () => { if (D.querySelector('[data-home]')) draw(true); });
    // The leave switch (Settings) and another window starting the day.
    const leave = () => { if (!D.querySelector('[data-home]')) return; if (W.rsChange) W.rsChange(() => {}, () => draw(true), { roots: ['main'] }); else draw(true); };
    D.addEventListener('rs:leave', leave);
    addEventListener('storage', (e) => { if (['rs6-leave', 'rs6-welcomed'].includes(e.key)) leave(); });
  }
}
function describeEvent(e) {
  if (e.field === 'own') return historyLine(e.before, e.after, { people: people(), viewer: who() });
  if (e.field === 'status') return e.after === 'done' ? 'Ticked done' : e.before === 'done' ? `Reopened, back to ${STATUS[e.after] || e.after}` : `Moved to ${STATUS[e.after] || e.after}`;
  return `${e.field} changed`;
}
