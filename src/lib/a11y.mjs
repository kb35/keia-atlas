// Accessibility settings (Settings › Accessibility; docs/accessibility.md). One record per browser, not per person
// in View as: these belong to the human at the keyboard, so switching who you view as never turns motion back on.
// Stored in localStorage as rs7-a11y and applied to <html> before first paint by the boot script below, which the
// Shell, the front door (Front.astro) and the room guide (Guide.astro) all inline in their <head>.
//
//   motion    system (follow the device's reduced-motion setting), reduced (short fades only), off (no animation)
//   text      default, larger, largest: scales every font size through --rs-text (tools/postcss-a11y.mjs)
//   outlines  stronger outlines and focus rings
//   links     underline every text link
//   words     the state word beside every health glyph
//   still     moving pictures (the front door's loops) start paused
//
// <html> attributes: data-motion="reduced|off", data-text="larger|largest", data-outlines="strong",
// data-links="underline", data-status-words="on", data-still="on". Absent means the default.

export const A11Y_KEY = 'rs7-a11y';
export const MOTION = ['system', 'reduced', 'off'];
export const TEXT = ['default', 'larger', 'largest'];
export const TEXT_SCALE = { default: 1, larger: 1.15, largest: 1.3 };
export const DEFAULTS = { motion: 'system', text: 'default', outlines: false, links: false, words: false, still: false };

// The two functions below are written self-contained (no outside names, ES5) because the boot script is built
// from their source: one logic for the page head, Settings and the tests.

/** A saved record (any shape, or a JSON string) as a complete, valid set of settings. */
export function readA11y(raw) {
  var o = raw;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch (_) { o = null; } }
  if (!o || typeof o !== 'object') o = {};
  return {
    motion: o.motion === 'reduced' || o.motion === 'off' ? o.motion : 'system',
    text: o.text === 'larger' || o.text === 'largest' ? o.text : 'default',
    outlines: o.outlines === true, links: o.links === true, words: o.words === true, still: o.still === true,
  };
}

/** The <html> attributes for a set of settings; null means remove the attribute. */
export function a11yAttrs(p) {
  return {
    'data-motion': p.motion === 'system' ? null : p.motion,
    'data-text': p.text === 'default' ? null : p.text,
    'data-outlines': p.outlines ? 'strong' : null,
    'data-links': p.links ? 'underline' : null,
    'data-status-words': p.words ? 'on' : null,
    'data-still': p.still ? 'on' : null,
  };
}

/** True when motion should be reduced: the person chose Reduced or Off here, or their device asks for it. */
export function reducedMotion() {
  if (typeof document === 'undefined') return false;
  const m = document.documentElement.getAttribute('data-motion');
  if (m === 'reduced' || m === 'off') return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True when the person chose Off: nothing animates at all. */
export const motionOff = () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-motion') === 'off';

// The boot script, inlined in each layout's <head> before any stylesheet or content, so the first paint already
// has the settings. It also:
//   - defines window.rsA11y(), rsSetA11y(patch), rsApplyA11y() and rsReduced() for Settings and page scripts;
//   - with Motion Off, makes every scripted animation (Element.animate) finish at once at its end state, so a
//     script that forgot to check never moves anything, and its onfinish still runs;
//   - puts the attributes back after the client router swaps in the next page's <html>.
export const A11Y_BOOT = `(function () {
  var W = window, D = document, R = D.documentElement, KEY = ${JSON.stringify(A11Y_KEY)};
  var readA11y = ${readA11y.toString()};
  var a11yAttrs = ${a11yAttrs.toString()};
  W.rsA11y = function () { var v = null; try { v = localStorage.getItem(KEY); } catch (_) {} return readA11y(v || W.__rsA11yMem || null); };
  W.rsApplyA11y = function () {
    var a = a11yAttrs(W.rsA11y());
    Object.keys(a).forEach(function (k) { if (a[k] == null) R.removeAttribute(k); else if (R.getAttribute(k) !== a[k]) R.setAttribute(k, a[k]); });
  };
  W.rsSetA11y = function (patch) {
    var p = W.rsA11y(); Object.keys(patch || {}).forEach(function (k) { p[k] = patch[k]; });
    p = readA11y(p); W.__rsA11yMem = p;
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (_) {}
    W.rsApplyA11y();
    D.dispatchEvent(new CustomEvent('rs:a11y', { detail: p }));
    return p;
  };
  W.rsReduced = function () {
    var m = R.getAttribute('data-motion');
    return m === 'reduced' || m === 'off' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  W.rsApplyA11y();
  if (!W.__rsA11yHook) {
    W.__rsA11yHook = true;
    D.addEventListener('astro:after-swap', function () { W.rsApplyA11y(); });
    var EP = W.Element && W.Element.prototype, animate = EP && EP.animate;
    if (animate && !animate.__rsA11y) {
      var wrapped = function (frames, opts) {
        if (R.getAttribute('data-motion') === 'off') {
          var o = typeof opts === 'number' ? {} : Object.assign({}, opts || {});
          o.duration = 0; o.delay = 0; o.endDelay = 0; o.iterations = 1;
          return animate.call(this, frames, o);
        }
        return animate.call(this, frames, opts);
      };
      wrapped.__rsA11y = true;
      EP.animate = wrapped;
    }
  }
})();`;
