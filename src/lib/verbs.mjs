// The page's verbs for the palette's Do mode (⌘K, then ">"; design notes). A verb is never only in the palette:
// it is a button or link on the page that carries data-verb="<id>", and the palette lists the ones you can
// see right now under the button's own name, then presses that button. So the palette can never do anything
// the page cannot do by clicking, and every verb has the same name as its button (design notes).
//
// A page's one band action (PageBand's action slot) is a verb too without marking it, under its own name.
// VERBS names the verbs the method defines, with the words people might type for each, so ">hand" finds
// "Hand to" and ">problem" finds "Report". Plain JavaScript with no imports: the browser (inlined by
// SearchOverlay.astro) and the unit tests (tests/palette.test.mjs) run the same code.

const VERBS = [
  { id: 'take', name: 'Take', hint: 'Make this job yours', words: ['take', 'mine', 'assign to me', 'pick up'] },
  { id: 'hand-to', name: 'Hand to', hint: 'Give this job to someone, with why', words: ['hand to', 'hand over', 'give', 'pass', 'reassign'] },
  { id: 'park', name: 'Park', hint: 'Stop for now and say where you stopped', words: ['park', 'pause', 'stop for now'] },
  { id: 'report', name: 'Report a problem', hint: 'Propose an edit, log firmware or raise an urgent issue about this page', words: ['report', 'problem', 'issue', 'propose', 'edit', 'firmware'] },
  { id: 'new-change', name: 'New change', hint: 'Propose a change to this', words: ['new change', 'change', 'propose'] },
  { id: 'run-rule', name: 'Run rule', hint: 'Run a standing rule now', words: ['run', 'rule', 'standing rule', 'automate'] },
  { id: 'open-in', name: 'Open in', hint: 'Open this in the tool it comes from', words: ['open in', 'open', 'tool', '3d'] },
  { id: 'set-depth', name: 'Set depth', hint: 'Open pages like this at this layer', words: ['depth', 'open here', 'layer'] },
  { id: 'switch-lens', name: 'Switch lens', hint: 'Show the plan by another lens', words: ['lens', 'switch lens', 'view'] },
  { id: 'view-as', name: 'View as', hint: 'See Keia Atlas as another role', words: ['view as', 'role', 'person', 'switch person', 'who'] },
  { id: 'show-help', name: 'Show help', hint: 'Explain what things are: ? on or off', words: ['help', 'explain', 'what is'] },
  { id: 'zoom-out', name: 'Zoom out', hint: 'Up one level of the path: [', words: ['zoom out', 'up', 'back up', 'parent'] },
  { id: 'settings', name: 'Settings', hint: 'Look, light or dark, modules', words: ['settings', 'look', 'dark', 'light', 'modules', 'theme'] },
  { id: 'action', name: 'Page action', hint: 'This page\'s main action', words: [] },
];
const VERB = Object.fromEntries(VERBS.map((v) => [v.id, v]));

// One row per verb: { id, label (the button's own name), hint, words }. `found` is [{ id, label }] read from the
// page; a verb found twice (a phone and a computer copy) is listed once.
function verbRows(found) {
  const seen = new Set(), rows = [];
  for (const f of found) {
    const v = VERB[f.id] || { id: f.id, name: f.label, hint: '', words: [] };
    const label = String(f.label || v.name).trim();
    const key = f.id + '|' + label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: f.id, label, hint: f.hint || v.hint, words: v.words, i: rows.length });
  }
  return rows;
}

// Rank rows for what was typed after ">": the label first, then the verb's words; the page order breaks ties.
function matchVerbs(rows, q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return rows.slice();
  const score = (r) => {
    const l = r.label.toLowerCase();
    if (l === t) return 0;
    if (l.startsWith(t)) return 1;
    if (l.split(/\s+/).some((w) => w.startsWith(t))) return 2;
    if (r.words.some((w) => w.startsWith(t) || t.startsWith(w))) return 3;
    if (l.includes(t) || r.words.some((w) => w.includes(t))) return 4;
    return -1;
  };
  return rows.map((r) => [score(r), r]).filter(([s]) => s >= 0).sort((a, b) => a[0] - b[0] || a[1].i - b[1].i).map(([, r]) => r);
}

// View as, by name: ">liam", ">view as liam", ">technician dublin". The rows press the View as picker's own
// buttons (src/components/ViewAs.astro), so this is the picker's verb, not a new one. people is
// [{ id, name, role, short, where }]. Nothing typed after ">" lists none (the page's verbs come first); "view as"
// on its own lists everyone. Each word typed must start a word of the person's name, role or place; a first name
// ranks first, then a surname, then the role, then the place.
function matchPeople(people, q) {
  const raw = String(q || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!raw) return [];
  const lead = /^(view as|view|see as|switch to|as)\b\s*/;
  const asked = lead.test(raw), t = raw.replace(lead, '').trim();
  if (!t) return asked ? people.slice() : [];
  const toks = t.split(/\s+/).filter(Boolean);
  const words = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(Boolean);
  const rows = [];
  people.forEach((p, i) => {
    const name = words(p.name), role = words(`${p.role} ${p.short || ''}`), where = words(p.where);
    let score = 0;
    for (const k of toks) {
      const s = name[0] && name[0].startsWith(k) ? 0 : name.slice(1).some((w) => w.startsWith(k)) ? 1
        : role.some((w) => w.startsWith(k)) ? 2 : where.some((w) => w.startsWith(k)) ? 3 : -1;
      if (s < 0) return;
      score += s;
    }
    rows.push([score, i, p]);
  });
  return rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((r) => r[2]);
}

// The mode a palette query is in: '>' Do (the page's verbs), '?' Ask (plain words and the glossary), else Find.
function paletteMode(q) {
  const s = String(q || '').replace(/^\s+/, '');
  if (s[0] === '>') return { mode: 'do', q: s.slice(1) };
  if (s[0] === '?') return { mode: 'ask', q: s.slice(1) };
  return { mode: 'find', q: s };
}

export { VERBS, verbRows, matchVerbs, matchPeople, paletteMode };
