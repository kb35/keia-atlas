// The heartbeat (UI-V2 §8.6): "checked 40 s ago" at the end of a page's answer sentence, the proof that a quiet
// page is alive. The words change every 10 s; nothing moves. When the feed has said nothing for longer than its
// window, the heartbeat reads "Not reporting since 08:12" in fault ink, the page gets data-stale, and it counts as
// a fault.
//
// The demo feed: real feeds do not exist yet, so the simulated feed "checks" every FEED_EVERY ms, on the same
// boundaries in every window. It can be switched off to show the stale state: add ?feed=off to any address
// (?feed=on puts it back), or call window.rsSetFeed('off' | 'on'). The choice is kept in this browser (rs6-feed).
// Pure functions here; Heartbeat.astro does the timing and the page.

export const FEED_EVERY = 30e3;          // the demo feed checks every 30 s
export const WINDOW_S = 90;              // three missed checks and the feed is not reporting
export const TICK_EVERY = 10e3;          // the words update every 10 s
export const FEED_KEY = 'rs6-feed';

/** The time of the last check at `now`, for a feed switched off at `offAt` (or on, when offAt is null). */
export const lastCheck = (now, offAt = null) => Math.floor((offAt ?? now) / FEED_EVERY) * FEED_EVERY;

/** Read the stored feed setting: { on: true } or { on: false, since: ms }. */
export function parseFeed(v) {
  const m = /^off:(\d+)$/.exec(String(v ?? ''));
  return m ? { on: false, since: +m[1] } : { on: true };
}

const hhmm = (ms, tz) => new Date(ms).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false, ...(tz ? { timeZone: tz } : {}) });

/** What the heartbeat says at `now` for a feed last heard at `at`, with a window in seconds. */
export function beat(now, at, windowS = WINDOW_S, tz) {
  const age = Math.max(0, now - at);
  if (age > windowS * 1000) return { stale: true, text: `Not reporting since ${hhmm(at, tz)}`, age };
  const s = Math.round(age / 1000);
  const text = s < 5 ? 'checked just now' : s < 60 ? `checked ${s} s ago` : `checked ${Math.floor(s / 60)} min ago`;
  return { stale: false, text, age };
}
