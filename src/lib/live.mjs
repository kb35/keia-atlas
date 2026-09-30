// The live layer (decision 0025): every change to work is an event, and what a page shows is the
// events replayed over the data it was built with. One event:
//
//   { id, at, who, item, field, before, after, note?, undoes? }
//
// `item` is a work id from src/lib/work.mjs ("task:T-1204"), `who` a person id, `at` an ISO time.
// Nothing is ever deleted: undo writes a new event that puts the old value back.
//
// This module runs in the browser (LiveBar loads it) and in tests. The pure parts (replay, versions,
// the reversing event) take a list of events. createLive() wires them to a store and a transport:
//   store      { load() -> events, append(event) -> events }            (browser: localStorage rs5-live)
//   transport  { send(message), listen(fn) -> stop }                     (browser: BroadcastChannel)
// Today the transport reaches other windows on this computer only. A sync server replaces it later by
// providing the same two functions; pages do not change.

export const STORAGE_KEY = 'rs5-live';
export const CHANNEL = 'keia-atlas-live';
export const HEARTBEAT_MS = 4000;
export const GONE_MS = 11000;
const MAX_EVENTS = 5000;

// ---- Pure parts -----------------------------------------------------------------------------------
const byTime = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const sorted = (events) => [...events].sort(byTime);
// A key ending in ":" "/" or "*" is a prefix ("task:" is every task); any other key is one item.
export const matches = (key, item) => (/[:/*]$/.test(key) ? item.startsWith(key.replace(/\*$/, '')) : item === key);
export const eventsOf = (events, item) => sorted(events.filter((e) => e.item === item));

// What an item looks like now: the base (what the page was built with) with every event on top.
export function replay(events, item, base = {}) {
  const state = { ...base };
  for (const e of eventsOf(events, item)) state[e.field] = e.after;
  return state;
}

// Every version of an item: version 0 is the base, then one per event, each with who changed what.
export function versionsOf(events, item, base = {}) {
  const out = [{ n: 0, at: null, who: null, event: null, state: { ...base } }];
  let state = { ...base };
  eventsOf(events, item).forEach((e, i) => {
    state = { ...state, [e.field]: e.after };
    out.push({ n: i + 1, at: e.at, who: e.who, event: e, state });
  });
  return out;
}

// The history of an item, newest first, each event saying whether it has been undone and by which event.
export function historyOf(events, item) {
  const list = eventsOf(events, item);
  const undoneBy = new Map(list.filter((e) => e.undoes).map((e) => [e.undoes, e]));
  return list.map((e) => ({ ...e, undoneBy: undoneBy.get(e.id)?.id ?? null })).reverse();
}

// The event that undoes `target`: it sets the field back to what it was before, from whatever it is
// now. Undoing an undo is a redo.
export function reversing(events, target, { id, at, who, base = {} }) {
  const now = replay(events, target.item, base)[target.field];
  return { id, at, who, item: target.item, field: target.field, before: now ?? null, after: target.before ?? null, note: target.undoes ? 'Redo' : 'Undo', undoes: target.id };
}

export const newId = () => `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// ---- Wiring: store, transport, subscribers, presence ---------------------------------------------
export function createLive({ store, transport, now = () => new Date().toISOString(), id = newId, tab = newId() } = {}) {
  let events = store?.load() ?? [];
  const known = new Set(events.map((e) => e.id));
  const subs = new Set();
  const seen = new Map();       // presence: `${page} ${tab}` -> { page, who, tab, at }
  const mine = new Map();       // the pages this window says it is on
  const presenceSubs = new Set();
  const clock = () => Date.parse(now());

  const deliver = (e, remote) => { for (const s of subs) if (matches(s.key, e.item)) s.fn(e, { remote }); };
  const take = (e, remote) => {
    if (known.has(e.id)) return false;
    known.add(e.id); events.push(e);
    deliver(e, remote);
    return true;
  };
  const tellPresence = (page) => { for (const s of presenceSubs) if (!page || s.page === page) s.fn(whoIsHere(s.page)); };

  const stopListening = transport?.listen((m) => {
    if (!m || typeof m !== 'object') return;
    if (m.type === 'event' && m.event?.id) take(m.event, true);
    else if (m.type === 'here' && m.tab !== tab) { seen.set(`${m.page} ${m.tab}`, { page: m.page, who: m.who, tab: m.tab, at: clock() }); tellPresence(m.page); }
    else if (m.type === 'bye') { seen.delete(`${m.page} ${m.tab}`); tellPresence(m.page); }
    else if (m.type === 'ask' && m.tab !== tab) for (const h of mine.values()) transport.send({ type: 'here', page: h.page, who: h.who, tab });
  });

  function record(ev) {
    const e = { id: ev.id ?? id(), at: ev.at ?? now(), who: ev.who ?? null, item: ev.item, field: ev.field, before: ev.before ?? null, after: ev.after ?? null };
    if (ev.note) e.note = ev.note;
    if (ev.undoes) e.undoes = ev.undoes;
    if (!e.item || !e.field) throw new Error('An event needs an item and a field');
    // Storing reads what other windows wrote too; anything not seen yet is passed on as theirs.
    if (store) for (const x of store.append(e)) if (x.id !== e.id) take(x, true);
    take(e, false);
    transport?.send({ type: 'event', event: e });
    return e;
  }

  // Presence: say "I am on this page" now and every few seconds; others drop you after GONE_MS.
  function here(page, who) {
    const beat = () => transport?.send({ type: 'here', page, who, tab });
    if (mine.has(page)) clearInterval(mine.get(page).timer);
    const timer = setInterval(beat, HEARTBEAT_MS);
    mine.set(page, { page, who, timer });
    beat(); transport?.send({ type: 'ask', tab });
    return function leave() {
      if (mine.get(page)?.timer !== timer) return;
      clearInterval(timer); mine.delete(page); transport?.send({ type: 'bye', page, tab });
    };
  }
  function whoIsHere(page) {
    const t = clock();
    return [...seen.values()].filter((h) => h.page === page && t - h.at < GONE_MS);
  }

  return {
    tab,
    record,
    subscribe(key, fn) { const s = { key, fn }; subs.add(s); return () => subs.delete(s); },
    historyOf: (item) => historyOf(events, item),
    stateOf: (item, base) => replay(events, item, base),
    versions: (item, base) => versionsOf(events, item, base),
    undo(eventId, { who, base } = {}) {
      const target = events.find((e) => e.id === eventId);
      if (!target) return null;
      return record(reversing(events, target, { id: id(), at: now(), who, base }));
    },
    here, whoIsHere,
    onPresence(page, fn) { const s = { page, fn }; presenceSubs.add(s); return () => presenceSubs.delete(s); },
    events: () => sorted(events),
    close() { for (const h of mine.values()) { clearInterval(h.timer); transport?.send({ type: 'bye', page: h.page, tab }); } mine.clear(); stopListening?.(); },
  };
}

// ---- The browser's store and transport ------------------------------------------------------------
export function localStore(key = STORAGE_KEY) {
  const read = () => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; } };
  const mem = [];
  return {
    load: () => { const r = read(); return r.length ? r : [...mem]; },
    // Read, add, write in one go, so two windows writing at once both keep their events.
    append(e) {
      const all = read(); all.push(e); mem.push(e);
      try { localStorage.setItem(key, JSON.stringify(all.slice(-MAX_EVENTS))); return all; } catch (_) { return [...mem]; }
    },
  };
}

// BroadcastChannel where the browser has it; otherwise the storage event, which also reaches other
// windows of the same site.
export function windowTransport(name = CHANNEL) {
  if (typeof BroadcastChannel === 'function') {
    const ch = new BroadcastChannel(name);
    return {
      send: (m) => { try { ch.postMessage(m); } catch (_) {} },
      listen(fn) { const h = (e) => fn(e.data); ch.addEventListener('message', h); return () => { ch.removeEventListener('message', h); ch.close(); }; },
    };
  }
  const key = `${name}-msg`;
  return {
    send: (m) => { try { localStorage.setItem(key, JSON.stringify({ m, n: Math.random() })); } catch (_) {} },
    listen(fn) { const h = (e) => { if (e.key === key && e.newValue) try { fn(JSON.parse(e.newValue).m); } catch (_) {} }; addEventListener('storage', h); return () => removeEventListener('storage', h); },
  };
}

// The one live layer a browser window uses.
let shared = null;
export function browserLive() {
  if (!shared && typeof window !== 'undefined') shared = createLive({ store: localStore(), transport: windowTransport() });
  return shared;
}
