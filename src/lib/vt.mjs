// Record shared elements (rule M5, docs/rules/motion.md): a clicked thing flies into the page it opens.
//
// On the page you click from, mark the picture of each record with data-vt-rec="<id>" (never a name:
// list items must not carry permanent view-transition names). On the record's own page, spread
// recHere(id) onto the element it should become. The Shell pairs the two just before the page changes,
// in both directions (open, and Back or up the path), and names nothing when there is no pair.
export const recName = (id) => `rec-${String(id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

export const recHere = (id) => ({
  'data-vt-here': String(id),
  style: `view-transition-name:${recName(id)};view-transition-class:rec`,
});
