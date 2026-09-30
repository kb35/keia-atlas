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
import { prepare, snapshot, tickOf, hhmm, openAt, nextSwitch, local, OFFICE_HOURS } from './livesim.mjs';
import { every, esc } from './liveview.mjs';

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
  function rooms(t) {
    if (!model) return;
    const snap = snapshot(model, t);
    const byId = new Map(model.rooms.map((r, i) => [r.id, i]));
    root.querySelectorAll('[data-loc-room], [data-sel^="room:"]').forEach((el) => {
      const i = byId.get(el.dataset.locRoom ?? el.dataset.sel.slice(5)); if (i == null) return;
      const s = snap.rooms[i];
      if (el.dataset.st !== s.st) {
        const was = el.dataset.st;
        el.dataset.st = s.st;
        if (was && W.rsMarkChanged && !el.closest('svg')) W.rsMarkChanged(el);
      }
    });
    let use = 0, prob = 0;
    snap.rooms.forEach((s) => { if (s.st === 'use') use++; if (s.st === 'problem') prob++; });
    number('loc-use', String(use));
    number('loc-problem', String(prob), prob ? 'bad' : '');
    if (!root.querySelector('[data-fi][data-loc-tz]')) {
      const offices = model.sites.map((s, i) => ({ s, i })).filter((x) => !x.s.remote && x.s.tz && model.rooms.some((r) => r.site === x.i));
      if (offices.length > 1) number('loc-open', String(offices.filter((x) => snap.sites[x.i]).length));
    }
    const att = root.querySelector('[data-loc-att]');
    if (att) {
      const list = model.rooms.map((r, i) => ({ r, s: snap.rooms[i] })).filter((x) => x.s.st === 'problem').slice(0, 6);
      att.innerHTML = list.map(({ r }) => `<li><a href="${B}rooms/${esc(r.id)}/"><i class="hl lit" data-state="bad" aria-hidden="true"></i><span>${esc(r.no ? `${r.no} ${r.n}` : r.n)}</span><small>${esc(STW.problem)} now</small></a></li>`).join('');
      const none = root.querySelector('[data-loc-att-none]');
      if (none) none.hidden = list.length > 0;
    }
  }
  const tick = (t) => { clocks(t); rooms(t); first = false; };
  tick(tickOf(Date.now()));

  // The floor map's rooms open the room, and its racks their comms room (the map draws them as buttons).
  // Access points have no page of their own here, so they are not offered as buttons.
  const racks = JSON.parse(root.querySelector('[data-loc-racks]')?.dataset.locRacks ?? '{}');
  root.querySelectorAll('[data-sel^="ap:"]').forEach((el) => { el.removeAttribute('tabindex'); el.removeAttribute('role'); el.removeAttribute('aria-pressed'); });
  root.querySelectorAll('[data-sel^="room:"], [data-sel^="rack:"]').forEach((el) => el.removeAttribute('aria-pressed'));
  const open = (e) => {
    const g = e.target.closest?.('[data-sel^="room:"], [data-sel^="rack:"]');
    if (!g || !root.contains(g)) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    const [kind, id] = [g.dataset.sel.slice(0, 4), g.dataset.sel.replace(/^[a-z]+:/, '')];
    const room = kind === 'rack' ? racks[id] : id;
    if (!room) return;
    e.preventDefault();
    location.href = `${B}rooms/${room}/`;
  };
  root.addEventListener('click', open);
  root.addEventListener('keydown', open);
  const stop = every(tick);
  return () => { stop(); root.removeEventListener('click', open); root.removeEventListener('keydown', open); };
}
