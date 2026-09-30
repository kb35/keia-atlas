/* The site-wide grammar of the motion library, wired once for every page (Motion.astro in the Shell, and the
   room guide's layout). Each page arrival (astro:page-load):
     sections   km-settle     a section below the fold settles in once as it first scrolls into view
     charts     km-draw-in    a sparkline or bar chart draws in once, the first time it is seen
     figures    km-tick       a figure that changes ticks to its new value
   and, for the whole visit:
     disclosures km-disclose  every <details> grows from its summary and folds back into it
   Pages opt out with data-no-settle, data-no-draw, data-no-tick or data-no-disclose on any ancestor.
   Reduced motion (km.reduced(): the site's switch, else the system's): none of them move; every one lands on its
   end state at once. docs/rules/motion.md, M17 and M19. */
export function wirePage(km) {
  if (window.__kmWired) return;
  window.__kmWired = true;
  let stops = [];
  const stop = () => { stops.forEach((f) => { try { f(); } catch (_) { /* a page already gone */ } }); stops = []; };
  const arrive = () => {
    stop();
    const main = document.querySelector('main');
    if (!main) return;
    stops.push(km.watchFigures(main));
    // Charts and sections wait a beat, so the page's own scripts have drawn their lists and bars first.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!main.isConnected) return;
      stops.push(km.watchCharts(main));
      stops.push(km.settle(main));
    }));
  };
  document.addEventListener('astro:page-load', arrive);
  document.addEventListener('astro:before-swap', stop);

  /* Disclosures: the press is taken over so the box can grow from its summary; the <details> still opens and
     closes (and fires its toggle event) as it always did. */
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const sum = e.target.closest && e.target.closest('summary');
    if (!sum) return;
    const d = sum.parentElement;
    if (!(d instanceof HTMLDetailsElement) || d.querySelector(':scope > summary') !== sum) return;
    if (d.closest('[data-no-disclose]') || !d.closest('main')) return;
    // A link or button inside the summary does its own thing.
    const inner = e.target.closest('a, button, input, select, textarea, label');
    if (inner && sum.contains(inner) && inner !== sum) return;
    e.preventDefault();
    km.disclose(d, !d.open);
  });
}
