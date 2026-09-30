// A comms room's power and temperature against the house standards, in words. Pure: the comms room page and the tests
// share it. The targets are the standards' own (data/standards/power.yaml ups-runtime and ups-size, racks.yaml
// temperature); tests/operations.test.mjs checks the standards still say these numbers.

export const TARGETS = {
  runtimeMin: 15,          // power / ups-runtime: at least 15 minutes at full load
  loadMaxPct: 80,          // power / ups-size: no more than 80% of the UPS's rating
  tempC: [18, 27],         // racks / temperature: 18 to 27 degrees C at the front of the racks
};

const dmy = (s) => { const d = new Date(`${s}T00:00:00Z`); return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/** The UPS against the standard: { runtime, load, ok, answer, measured }. */
export function upsWords(ups) {
  if (!ups) return null;
  const runtime = { n: ups.runtime_min, ok: ups.runtime_min >= TARGETS.runtimeMin, target: TARGETS.runtimeMin };
  const load = { n: ups.load_pct, ok: ups.load_pct <= TARGETS.loadMaxPct, target: TARGETS.loadMaxPct };
  const answer = !load.ok ? `UPS load ${load.n}%, over the ${load.target}% limit`
    : !runtime.ok ? `UPS runs ${runtime.n} min, under the ${runtime.target} minutes the standard asks`
    : `UPS runs ${runtime.n} min at ${load.n}% load, inside the standard`;
  return { runtime, load, ok: runtime.ok && load.ok, answer, measured: dmy(ups.measured) };
}

// A made-up reading for the demo, steady per room: 20.5 to 25.4 degrees C, one decimal. Labelled Simulated.
const h = (s) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
export function simulatedTemp(spaceId) { return Math.round((20.5 + (h(spaceId) % 50) / 10) * 10) / 10; }

/** The temperature against the target: { c, ok, text }. */
export function tempWords(c) {
  if (c == null) return null;
  const [lo, hi] = TARGETS.tempC;
  const ok = c >= lo && c <= hi;
  return { c, ok, lo, hi, text: ok ? `${c.toFixed(1)} °C, inside ${lo} to ${hi} °C` : `${c.toFixed(1)} °C, outside ${lo} to ${hi} °C` };
}

/** The one answer for the block: the thing that is wrong first, else both are fine. */
export function envAnswer(ups, temp) {
  const u = upsWords(ups), t = tempWords(temp);
  if (u && !u.ok) return u.answer;
  if (t && !t.ok) return `The room is at ${t.text}`;
  return [u?.answer, t ? `the room is at ${t.c.toFixed(1)} °C` : null].filter(Boolean).join(' · ');
}
