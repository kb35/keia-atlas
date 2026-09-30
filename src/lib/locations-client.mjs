// The Locations pages in the browser: each office's local time and whether it is open, and (where the page carries
// the live model) the rooms' state now, from the same simulation as the overview (src/lib/livesim.mjs), so the
// office page, the region page and Locations, Overview always agree.
//
// Markup it reads:
//   [data-loc-tz="Europe/Dublin"]   a block for one office; inside it [data-loc-clock] (local time) and
//                                   [data-loc-open] (Open until 19:00 / Closed, opens 07:00). With data-fi it
//                                   also gets data-f-status="open|closed" for the filter bar's Status facet.
//   [data-loc-model]                the lean live model (JSON), with `base`
//   [data-loc-room="<id>"]          anything that shows one room's state (data-st); the floor map's rooms too
//   [data-loc-att] [data-loc-att-none]  the list of rooms with a problem now, and its empty line
//   Key numbers loc-use, loc-problem and loc-open (PageBand ids), changed with rsKeyNumber.
//   [data-loc-answer]               the page's answer sentence follows the live state (window.rsAnswer)
import { prepare, snapshot, tickOf, hhmm, openAt, nextSwitch, local, OFFICE_HOURS } from './livesim.mjs';
import { every, esc } from './liveview.mjs';
import { glyph } from './health.mjs';
// Spaces out of service show as Off on the plan (the Out of service capability, src/lib/outofservice.mjs).
import { outNow, readChanges, whenWords, EVENT as OOS_EVENT, KEY as OOS_KEY } from './outofservice.mjs';

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const STW = { use: 'In use', free: 'Free', problem: 'Problem', closed: 'Closed' };

export function openWords(tz, t) {
  const open = openAt(tz, t, OFFICE_HOURS);
  const at = nextSwitch(tz, t, OFFICE_HOURS);
  if (!at) return { open, text: open ? 'Open' : 'Closed' };
  const lt = local(tz, at), today = local(tz, t).dow === lt.dow && at - t < 864e5;
  return { open, text: open ? `Open until ${hhmm(tz, at)}` : `Closed, opens ${today ? '' : `${DAY[lt.dow]} `}${hhmm(tz, at)}` };
}

export function startLocations(root) {
  if (!root || root.__loc) return () => {};
  root.__loc = true;
  const W = window;
  const bar = root.querySelector('[data-fb]');
  const json = root.querySelector('[data-loc-model]');
  const model = json ? prepare(JSON.parse(json.textContent)) : null;
  const B = model?.base ?? '/';
  let first = true;
  const last = {};
  // Out of service: the seed records on the page ([data-oos-seed]) with this browser's changes on top, while the
  // capability is on. Such a space reads Off (st "off") whatever the simulation says.
  const oosSeed = (() => { try { return JSON.parse(document.querySelector('[data-oos-seed]')?.textContent || '[]'); } catch (_) { return []; } })();
  const oosNow = () => (W.rsFeatureOn && !W.rsFeatureOn('out-of-service') ? {} : outNow(oosSeed, readChanges()));

  function clocks(t) {
    let moved = false;
    document.querySelectorAll('[data-loc-tz]').forEach((el) => {
      const tz = el.dataset.locTz, w = openWords(tz, t);
      el.querySelectorAll('[data-loc-clock]').forEach((c) => { c.textContent = hhmm(tz, t); });
      el.querySelectorAll('[data-loc-open]').forEach((o) => { o.textContent = w.text; o.dataset.open = w.open ? '1' : '0'; });
      if (el.hasAttribute('data-fi')) {
        const st = w.open ? 'open' : 'closed';
        if (el.getAttribute('data-f-status') !== st) { el.setAttribute('data-f-status', st); moved = true; }
      }
    });
    if (moved && bar?.rsFilter) bar.rsFilter.refresh();
    const openN = new Set([...root.querySelectorAll('[data-fi][data-loc-tz][data-f-status="open"]')].map((el) => el.dataset.vk ?? el)).size;
    if (root.querySelector('[data-fi][data-loc-tz]')) number('loc-open', String(openN));
  }
  function number(id, v, tone) {
    if (!W.rsKeyNumber || !document.querySelector(`.kn-i[data-kn="${id}"]`)) return;
    W.rsKeyNumber(id, v, tone !== undefined ? { tone } : undefined);
    if (!first && last[id] !== v && W.rsMarkChanged) W.rsMarkChanged(document.querySelector(`.kn-i[data-kn="${id}"]`));
    last[id] = v;
  }
  // What is wrong with a room now, in words, for the plan's Health lens and its selected-space panel.
  function whyWords(s) {
    const w = s.why; if (!w) return '';
    const u = w.unit != null ? model.units[w.unit] : null;
    if (u && w.down) return `${u.n ?? 'A unit'} offline`;
    if (u && w.al >= 0) return `${u.n ?? 'A unit'}: ${u.alerts?.[w.al] ?? 'alerting'}`;
    const inc = w.inc >= 0 ? model.incs?.[w.inc] : null;
    return inc ? `${inc.no}: ${inc.title}` : '';
  }
  function rooms(t) {
    if (!model) return;
    // While Replay shows a past moment (src/lib/replay-client.mjs), the plan and the answer keep that moment.
    if (root.dataset.replay) return;
    const snap = snapshot(model, t), out = oosNow();
    const stOf = (id, i) => (out[id] ? 'off' : snap.rooms[i].st);
    root.__rooms = new Map(model.rooms.map((r, i) => [r.id, out[r.id] ? { st: 'off', why: `Out of service until ${whenWords(out[r.id].until)}` } : { st: snap.rooms[i].st, why: whyWords(snap.rooms[i]) }]));
    const byId = new Map(model.rooms.map((r, i) => [r.id, i]));
    root.querySelectorAll('[data-loc-room], [data-sel^="room:"]').forEach((el) => {
      const i = byId.get(el.dataset.locRoom ?? el.dataset.sel.slice(5)); if (i == null) return;
      const st = stOf(el.dataset.locRoom ?? el.dataset.sel.slice(5), i);
      if (el.dataset.st !== st) {
        const was = el.dataset.st;
        el.dataset.st = st;
        if (was && W.rsMarkChanged && !el.closest('svg')) W.rsMarkChanged(el);
      }
    });
    let use = 0, prob = 0;
    snap.rooms.forEach((s) => { if (s.st === 'use') use++; if (s.st === 'problem') prob++; });
    number('loc-use', String(use));
    number('loc-problem', String(prob), prob ? 'bad' : '');
    root.dispatchEvent(new CustomEvent('loc:tick'));
    if (root.hasAttribute('data-loc-answer') && W.rsAnswer) W.rsAnswer(prob ? `${prob} ${prob === 1 ? 'space' : 'spaces'} not working now` : `All ${snap.rooms.length} spaces working`);
    if (!root.querySelector('[data-fi][data-loc-tz]')) {
      const offices = model.sites.map((s, i) => ({ s, i })).filter((x) => !x.s.remote && x.s.tz && model.rooms.some((r) => r.site === x.i));
      if (offices.length > 1) number('loc-open', String(offices.filter((x) => snap.sites[x.i]).length));
    }
    const att = root.querySelector('[data-loc-att]');
    if (att) {
      const list = model.rooms.map((r, i) => ({ r, s: snap.rooms[i] })).filter((x) => x.s.st === 'problem').slice(0, 6);
      att.innerHTML = list.map(({ r }) => `<li><a href="${B}rooms/${esc(r.id)}/">${glyph('fault', { size: 12, title: 'not working now' })}<span>${esc(r.no ? `${r.no} ${r.n}` : r.n)}</span><small>${esc(STW.problem)} now</small></a></li>`).join('');
      const none = root.querySelector('[data-loc-att-none]');
      if (none) none.hidden = list.length > 0;
    }
  }
  const tick = (t) => { clocks(t); rooms(t); first = false; };
  tick(tickOf(Date.now()));

  // On the office, the floor map's spaces are chosen and opened by the lens script (src/lib/lens-client.mjs).
  root.__locTick = () => tick(tickOf(Date.now()));
  const stop = every(tick);
  // A space taken out or brought back (here, in another window, or its capability switched) shows at once.
  const again = () => { if (root.isConnected) root.__locTick(); };
  const onStore = (e) => { if (e.key === OOS_KEY) again(); };
  document.addEventListener(OOS_EVENT, again);
  document.addEventListener('rs:demo-change', again);
  window.addEventListener('storage', onStore);
  return () => { stop(); document.removeEventListener(OOS_EVENT, again); document.removeEventListener('rs:demo-change', again); window.removeEventListener('storage', onStore); };
}
