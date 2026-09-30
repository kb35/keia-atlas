// Keia Atlas search engine: a small rule-based query parser over a faceted index. No AI model: the same
// words always give the same answer.
//
// How it works, in three steps (the same idea as the search boxes on shopping and travel sites):
//   1. Index (built once, at build time, by search-index.mjs): every room, device, model and so on is
//      one item with a title, some words, and facets (region, site, models present, status, age...).
//   2. Parse (every keystroke): the words are read left to right. Longest known phrase wins, so
//      "hazel house" is a site before "house" is a word. Each phrase is one of:
//        intent  what you want back:      "rooms", "devices", "configurations", "who"
//        entity  a filter on a facet:     "EMEA", "Dublin", "x52", "Poly", "codecs", "retired"
//        relation how the next entity applies: "with" (has one), "without" (has none)
//      Typos are forgiven by edit distance (one or two letters), plurals by a simple stemmer.
//      Whatever is left over is plain words, matched against each item's text.
//   3. Filter and rank: items must pass every filter; words score higher in a title than in the
//      detail line. Results are grouped by kind, and facet counts are worked out from them.
//
// This file is plain JavaScript with no imports, so the browser (inlined by SearchOverlay.astro)
// and the unit tests (tests/search-query.test.mjs) run exactly the same code. Keep exports in the
// single list at the bottom: the browser build strips that line.

const KINDS = [
  ['room', 'Spaces', 'Space', 'room', ['space', 'room', 'meeting room', 'meeting space']],
  ['unit', 'Units', 'Unit', 'barcode', ['unit', 'device', 'installed', 'installed device', 'installed unit', 'equipment', 'hardware', 'asset', 'asset tag', 'serial', 'serial number']],
  ['model', 'Models', 'Model', 'box', ['model', 'product', 'device model']],
  ['dp', 'Device types', 'Device type', 'devices', ['device type', 'device profile', 'device class', 'type of device', 'kind of device', 'device category']],
  ['rp', 'Space types', 'Space type', 'types', ['space type', 'room profile', 'room type', 'type of space', 'type of room', 'kind of space', 'kind of room', 'space standard', 'room standard']],
  ['cfg', 'Setup guides', 'Setup guide', 'sliders', ['setup guide', 'configuration', 'config', 'setup']],
  ['set', 'Settings', 'Setting', 'sliders', ['setting', 'parameter']],
  ['fw', 'Firmware', 'Firmware', 'chip', ['firmware', 'release', 'software version', 'version', 'software']],
  ['prj', 'Projects', 'Project', 'project', ['project', 'fit out', 'fitout']],
  ['task', 'Tasks', 'Task', 'check', ['task', 'work item', 'action item']],
  ['pb', 'Playbooks', 'Playbook', 'playbook', ['playbook', 'process', 'procedure', 'runbook']],
  ['inc', 'Incidents', 'Incident', 'alert', ['incident', 'ticket', 'fault', 'issue', 'problem', 'outage']],
  ['lab', 'Lab tests', 'Lab test', 'flask', ['lab test', 'lab', 'test', 'trial', 'evaluation']],
  ['adv', 'Advisories', 'Advisory', 'shield', ['advisory', 'warning', 'notice']],
  ['person', 'People', 'Person', 'team', ['people', 'person', 'who', 'staff', 'team', 'team member', 'colleague', 'contact']],
  ['ven', 'Vendors', 'Vendor', 'kit', ['vendor', 'supplier', 'integrator', 'partner', 'contractor']],
  ['site', 'Offices', 'Office', 'sites', ['site', 'building', 'location', 'campus']],
  ['rack', 'Rack equipment', 'Rack equipment', 'rack', ['rack', 'rack gear', 'rack equipment', 'comms gear']],
  ['plan', 'Year plan', 'Plan item', 'calendar', ['year plan', 'plan item', 'pipeline', 'roadmap']],
  ['spare', 'Spares', 'Spare', 'box', ['spare', 'spare part', 'stock']],
  ['cable', 'Cables', 'Cable', 'wire', ['cable', 'patch cable', 'patch lead', 'lead', 'cord']],
  ['svc', 'Services', 'Service', 'devices', ['service', 'services', 'av service', 'network service', 'it infrastructure']],
  ['ki', 'Known errors', 'Known error', 'shield', ['known error', 'known errors', 'known issue', 'known issues', 'manufacturer bug', 'maker bug', 'bug', 'defect']],
].map(([code, label, one, icon, words], order) => ({ code, label, one, icon, words, order }));
const KIND = Object.fromEntries(KINDS.map((k) => [k.code, k]));
// Kinds with many near-identical items: shown for a filter only when you name them or type words.
const NOISY = new Set(['set']);

const REGIONS = {
  emea: { label: 'EMEA', words: ['emea', 'europe', 'european', 'middle east', 'africa', 'eu'] },
  amer: { label: 'Americas', words: ['americas', 'amer', 'america', 'north america', 'south america', 'latin america', 'latam'] },
  apac: { label: 'APAC', words: ['apac', 'asia', 'asia pacific', 'pacific', 'oceania', 'anz'] },
};

// Status words, and which raw statuses on an item each one accepts.
const STATUSES = [
  ['retired', 'Retired', ['retired', 'decommissioned', 'decommission', 'removed', 'taken out', 'disposed', 'out of service', 'scrapped', 'gone'], ['retired']],
  ['retiring', 'Being replaced', ['retiring', 'being replaced', 'replacing', 'swapping'], ['retiring']],
  ['in-service', 'In service', ['in service', 'live', 'active', 'current', 'working', 'running'], ['in-service', 'open']],
  ['installing', 'Being installed', ['installing', 'being installed', 'deploying', 'going in'], ['installing']],
  ['planned', 'Planned', ['planned', 'on order', 'ordered', 'procured', 'upcoming', 'proposed'], ['planned', 'proposed', 'approved', 'idea']],
  ['legacy', 'Older kit', ['older kit', 'old kit', 'legacy', 'older', 'old', 'outdated', 'obsolete', 'end of life', 'eol'], ['legacy']],
  ['overdue', 'Due for replacement', ['overdue', 'due', 'due for replacement', 'past its life', 'needs replacing', 'ageing', 'aging'], ['overdue']],
  ['open', 'Open', ['open', 'unresolved', 'ongoing'], ['open']],
  ['doing', 'In progress', ['in progress', 'doing', 'underway', 'under way', 'started'], ['doing', 'in-progress', 'testing']],
  ['blocked', 'Waiting on', ['waiting on', 'blocked', 'stuck', 'do not install', 'on hold'], ['blocked', 'on-hold', 'do-not-install']],
  ['closed', 'Closed', ['closed', 'resolved', 'done', 'finished', 'complete', 'completed', 'fixed'], ['closed', 'resolved', 'done', 'adopted']],
  ['todo', 'To do', ['to do', 'todo', 'not started'], ['todo', 'not-started', 'queued']],
  ['standard', 'In the standard', ['standard', 'in the standard'], ['standard', 'adopted']],
  ['candidate', 'Candidate', ['candidate', 'under review'], ['candidate', 'under-review']],
  ['testing', 'In the Lab', ['testing', 'in the lab', 'being tested'], ['testing']],
  ['passed', 'Passed', ['passed'], ['passed', 'adopted']],
  ['failed', 'Failed', ['failed', 'failing'], ['failed']],
].map(([id, label, words, any]) => ({ id, label, words, any }));

const CLASS_WORDS = {
  display: ['screen', 'tv', 'television', 'lcd'],
  'video-bar': ['videobar', 'vc bar', 'soundbar', 'video conferencing bar'],
  codec: ['codec', 'room system', 'vc codec'],
  'touch-controller': ['touch panel', 'touchscreen', 'touch screen', 'controller'],
  camera: ['cam', 'ptz'],
  microphone: ['mic', 'mike', 'ceiling mic'],
  loudspeaker: ['speaker', 'ceiling speaker'],
  amplifier: ['amp'],
  'av-extender': ['extender', 'hdbaset', 'hdbt', 'transmitter', 'receiver'],
  'av-switcher': ['switcher', 'av switch', 'presentation switcher'],
  adapter: ['converter', 'injector', 'poe injector', 'dongle', 'scaler'],
  monitor: ['desk monitor'],
  dock: ['docking station'],
  'network-gateway': ['gateway', 'router', 'network gateway'],
  'network-switch': ['switch', 'network switch', 'poe switch', 'room switch'],
  'signage-player': ['signage', 'digital signage', 'media player'],
  printer: ['mfp', 'copier'],
  'security-device': ['security', 'access control', 'badge reader'],
  'scheduler-panel': ['scheduler', 'booking panel', 'room booking panel', 'door panel'],
  'desk-video-device': ['desk video', 'personal video'],
};

const ROLE_WORDS = [
  [['tech'], ['technician', 'tech', 'on site', 'onsite', 'on site technician', 'site technician', 'field technician']],
  [['delivery'], ['delivery engineer', 'av engineer', 'av and it engineer']],
  [['delivery', 'network', 'innovation'], ['engineer']],
  [['network'], ['network engineer']],
  [['innovation'], ['innovation engineer', 'lab engineer']],
  [['pm'], ['project manager', 'pm']],
  [['programme'], ['programme manager', 'program manager']],
  [['delivery-manager'], ['delivery manager']],
  [['sm-av', 'sm-infra'], ['service manager']],
  [['sm-av'], ['av service manager']],
  [['sm-infra'], ['infrastructure service manager', 'network service manager']],
  [['head'], ['head of av', 'head']],
  [['desk'], ['service desk', 'service desk analyst', 'analyst', 'help desk', 'helpdesk']],
  [['vendor'], ['integration vendor', 'installer']],
  [['service-vendor'], ['service vendor', 'maintenance vendor']],
  [['pm', 'programme', 'delivery-manager', 'sm-av', 'sm-infra'], ['manager']],
];

const PROFILE_WORDS = {
  'reception-concierge': ['reception', 'concierge', 'front desk'],
  cafeteria: ['cafe', 'canteen'],
  'copy-print-room': ['print room', 'copy room'],
  'conference-room-large': ['large conference room', 'large meeting room', 'boardroom'],
  'conference-room-medium': ['medium conference room', 'medium meeting room'],
  'conference-room-small': ['small conference room', 'small meeting room'],
  'presentation-recording-room': ['recording studio', 'recording room', 'presentation room'],
  mdf: ['mdf', 'main comms room', 'main distribution frame'],
  idf: ['idf', 'floor comms room', 'wiring closet', 'data closet'],
  'workstation-flex': ['flex desk', 'hot desk', 'hotdesk', 'unassigned desk'],
  'workstation-assigned': ['assigned desk', 'fixed desk'],
  'remote-home': ['home office', 'home kit', 'remote worker'],
  'focus-room': ['phone booth', 'phone room'],
  makerspace: ['maker space', 'workshop'],
};
const PROFILE_GROUPS = [[['mdf', 'idf'], ['comms room', 'comms', 'network room', 'server room']], [['conference-room-large', 'conference-room-medium', 'conference-room-small'], ['conference room']], [['huddle-room', 'huddle-room-sofa', 'huddle-room-lounge', 'huddle-room-small'], ['huddle room', 'huddle']], [['workstation-flex', 'workstation-assigned'], ['desk', 'workstation']]];

const SITE_WORDS = { nyc: ['nyc', 'ny', 'manhattan'], lon: ['uk', 'united kingdom', 'england', 'britain'] };
// The three remote sites (decision 0025) answer to these words together.
const REMOTE_WORDS = ['remote', 'remote sites', 'home workers', 'remote workers'];

// Words that carry no meaning of their own. Relations and places are kept so a chip can take them
// with it when removed ("at the Dublin office" goes as one).
const REL_HAS = ['with', 'has', 'have', 'having', 'using', 'uses', 'containing', 'contains', 'equipped', 'that have', 'that has', 'fitted with'];
const REL_NOT = ['without', 'lacking', 'missing', 'no', 'not', 'minus'];
const PREP = new Set(['in', 'at', 'for', 'from', 'of', 'on', 'by', 'near', 'inside', 'within', 'across', 'that', 'the', 'a', 'an', 'to', 'made']);
const STOP = new Set(['show', 'me', 'find', 'list', 'which', 'where', 'is', 'are', 'what', 'any', 'and', 'or', 'please', 'get', 'give', 'all', 'every', 'each',
  'there', 'their', 'my', 'our', 'i', 'need', 'want', 'see', 'look', 'looking', 'search', 'only', 'just', 'located', 'based', 'do', 'does', 'can', 'could',
  'would', 'should', 'how', 'many', 'much', 'some', 'those', 'these', 'this', 'it', 'its', 'whose', 'currently', 'now', 'today', 'still', 'about', 'like', 'into', 'us']);

// ---------- Text helpers ----------
const deacc = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const low = (s) => deacc(s).toLowerCase();
const key = (s) => low(s).replace(/[^a-z0-9]+/g, '');
function sing(w) {
  if (w.length < 4 || /\d/.test(w)) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(ch|sh|x|ss|zz)es$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}
const phraseKey = (words) => words.map((w) => sing(key(w))).filter(Boolean).join(' ');
const splitWords = (s) => low(s).split(/[\s,;:()·/|"“”[\]{}!?]+/).flatMap((w) => {
  const x = w.replace(/^[.'’\-+*#]+|[.'’\-*]+$/g, '');
  if (!x) return [];
  return x.includes('-') ? [x, ...x.split('-').filter(Boolean)] : [x];
});
// Optimal string alignment distance (Levenshtein plus swapped neighbours), stopping early past max.
function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = [];
  for (let i = 0; i <= a.length; i++) { d[i] = [i]; }
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v; if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}
const allowed = (len) => (len < 4 ? 0 : len < 7 ? 1 : 2);
const arr = (v) => (v === undefined || v === null || v === '' ? undefined : Array.isArray(v) ? v : [v]);
const YEAR_MS = 365.25 * 24 * 3600 * 1000;

// ---------- Load: expand the compact index and build the vocabulary ----------
function load(raw) {
  const I = { raw, today: raw.today, sites: raw.sites, models: raw.models, classes: raw.classes, rps: raw.rp ?? {}, roles: raw.roles ?? {}, rooms: raw.rooms ?? {}, items: [] };
  const todayMs = Date.parse(raw.today);
  const modelName = (id) => (raw.models[id] ? `${raw.models[id][0]} ${raw.models[id][1]}` : id);
  const className = (id) => raw.classes[id] ?? id;
  I.modelName = modelName; I.className = className;
  const add = (k, u, t, s, x, f = {}) => {
    const st = arr(f.st), m = arr(f.m), c = arr(f.c);
    let r = arr(f.r);
    if (!r && st) { const rs = [...new Set(st.map((id) => raw.sites[id]?.[3]).filter(Boolean))]; if (rs.length) r = rs; }
    let mk = arr(f.mk);
    if (!mk && m && m.length) mk = [...new Set(m.map((id) => raw.models[id]?.[0]).filter(Boolean))];
    const it = { k, u, t, s: s ?? '', x: x ?? '', i: I.items.length, r, st, m, c, mk, z: arr(f.z), p: arr(f.p), ro: arr(f.ro), fl: f.fl ?? undefined, rm: f.rm, y: f.y || undefined, tag: f.tag };
    it.age = it.y ? (todayMs - Date.parse(it.y)) / YEAR_MS : undefined;
    const derived = [
      ...(r ?? []).map((id) => REGIONS[id]?.label ?? ''), ...(st ?? []).map((id) => (raw.sites[id] ? `${raw.sites[id][1]} ${raw.sites[id][2] ?? ''}` : '')),
      ...(k === 'model' || k === 'unit' ? (m ?? []).map(modelName) : []), ...(c ?? []).slice(0, 3).map(className),
    ].join(' ');
    it.tw = ` ${splitWords(t).join(' ')} `;
    it.sw = ` ${splitWords(it.s).join(' ')} `;
    it.text = ` ${splitWords(`${t} ${it.s} ${it.x} ${derived}`).join(' ')} `;
    I.items.push(it);
  };
  for (const [k, u, t, s, x, f] of raw.items) add(k, u, t, s, x, f);
  for (const [rm, role, model, cls, host, serial, tag, inst, ret, z] of raw.units ?? []) {
    const room = raw.rooms[rm]; if (!room) continue;
    const [rname, num, st, fl, p] = room, site = raw.sites[st] ?? [];
    const zs = z ? z.split(' ') : ['in-service'];
    const what = model ? modelName(model) : className(cls);
    add('unit', ret || !tag ? `rooms/${rm}/` : `device/?tag=${tag}`, `${rname} ${role}`, `${what} · ${site[1] ?? st}${num ? `, ${num}` : ''}`,
      [host, serial, tag, zs.includes('legacy') ? 'older kit' : '', ret ? `retired ${ret.slice(0, 4)}` : '', inst ? `installed ${inst.slice(0, 4)}` : ''].filter(Boolean).join(' '),
      { st, m: model ? [model] : [], c: [cls], z: zs, y: inst || undefined, rm, p, fl, tag });
  }
  // Every word in the index, sorted, for "is this a real word?" and for spelling suggestions.
  const words = new Set();
  for (const it of I.items) for (const w of it.text.split(' ')) if (w.length > 1) words.add(w);
  I.corpus = [...words].sort();
  buildVocab(I);
  return I;
}

function buildVocab(I) {
  const V = new Map();
  const reg = (phrase, e) => {
    const words = String(phrase).split(/\s+/);
    for (const k of new Set([phraseKey(words), words.map(key).join('')])) {
      if (!k) continue;
      const cur = V.get(k);
      if (!cur) V.set(k, { ...e, v: [...e.v] });
      else if (cur.t === e.t && cur.t !== 'kind') { for (const x of e.v) if (!cur.v.includes(x)) cur.v.push(x); if (cur.v.length > 1 && e.t === 'model') cur.label = cur.family ?? cur.label; }
    }
  };
  for (const k of KINDS) for (const w of k.words) reg(w, { t: 'kind', v: [k.code] });
  reg('profile', { t: 'kind', v: ['rp', 'dp'] });
  for (const [id, r] of Object.entries(REGIONS)) for (const w of r.words) reg(w, { t: 'region', v: [id], label: r.label, q: r.label });
  const siteLabel = (id) => { const s = I.sites[id]; return s ? (s[2] && !s[1].includes(s[2]) ? `${s[1]}, ${s[2]}` : s[1]) : id; };
  const byCountry = {};
  const remote = Object.entries(I.sites).filter(([, s]) => !s[2] && /^Remote /.test(s[1])).map(([id]) => id);
  if (remote.length) for (const w of REMOTE_WORDS) reg(w, { t: 'site', v: [...remote], label: remote.length > 1 ? 'Remote sites' : siteLabel(remote[0]), q: w });
  for (const [id, s] of Object.entries(I.sites)) {
    const [code, name, city, , country] = s;
    const e = { t: 'site', v: [id], label: siteLabel(id), q: name };
    reg(name, e); reg(id, e); if (code) reg(code, e); if (city) reg(city, e);
    const first = name.split(' ')[0]; if (name.includes(' ') && first.length > 3) reg(first, e);
    for (const w of SITE_WORDS[id] ?? []) reg(w, e);
    if (country) (byCountry[country] ??= []).push(id);
  }
  for (const [country, ids] of Object.entries(byCountry)) {
    const e = { t: 'site', v: ids, label: ids.length > 1 ? `${country} (${ids.length} offices)` : siteLabel(ids[0]), q: country };
    reg(country, e);
    if (country === 'United States') { reg('usa', e); reg('us sites', e); }
  }
  for (const s of STATUSES) for (const w of s.words) reg(w, { t: 'status', v: [s.id], label: s.label, q: s.words[0] });
  for (const [id, name] of Object.entries(I.roles)) reg(name, { t: 'role', v: [id], label: name, q: name });
  for (const [ids, words] of ROLE_WORDS) {
    const v = ids.filter((id) => I.roles[id]); if (!v.length) continue;
    for (const w of words) reg(w, { t: 'role', v, label: v.length > 1 ? `${w.replace(/^./, (c) => c.toUpperCase())}s` : I.roles[v[0]], q: w });
  }
  for (const [id, name] of Object.entries(I.rps)) {
    const e = { t: 'profile', v: [id], label: name, q: name };
    reg(name, e); reg(id.replace(/-/g, ' '), e);
    for (const w of PROFILE_WORDS[id] ?? []) reg(w, e);
  }
  for (const [ids, words] of PROFILE_GROUPS) {
    const v = ids.filter((id) => I.rps[id]); if (!v.length) continue;
    for (const w of words) reg(w, { t: 'profile', v, label: `${w.replace(/^./, (c) => c.toUpperCase())}s (${v.length} profiles)`, q: w });
  }
  for (const [id, name] of Object.entries(I.classes)) {
    const e = { t: 'class', v: [id], label: name, q: name };
    reg(name, e); reg(id.replace(/-/g, ' '), e);
    for (const w of CLASS_WORDS[id] ?? []) reg(w, e);
  }
  const makers = new Set();
  for (const m of Object.values(I.models)) makers.add(m[0]);
  for (const it of I.items) for (const mk of it.mk ?? []) makers.add(mk);
  for (const mk of makers) {
    const e = { t: 'make', v: [mk], label: mk, q: mk };
    reg(mk, e);
    const first = mk.split(/[\s.]/)[0]; if (first.length > 2) reg(first, e);
    if (mk === 'Poly') reg('hp', e);
    if (mk === 'Ubiquiti') reg('unifi', e);
    if (mk === 'Sound Control Technologies') reg('sct', e);
  }
  // Models: full name, name without the maker, and each token that carries digits ("x52", "tc10").
  const tokenOwners = new Map();
  for (const [id, m] of Object.entries(I.models)) {
    for (const tok of String(m[1]).split(/[\s/()]+/)) {
      for (const part of new Set([tok, ...tok.split('-')])) {
        const k = key(part);
        if (k.length >= 2 && /\d/.test(k) && /[a-z]/.test(k)) (tokenOwners.get(k) ?? tokenOwners.set(k, new Set()).get(k)).add(id);
      }
    }
  }
  for (const [id, m] of Object.entries(I.models)) {
    const full = `${m[0]} ${m[1]}`;
    const e = { t: 'model', v: [id], label: full, q: full };
    reg(full, e); reg(m[1], e); reg(id.replace(/-/g, ' '), e);
  }
  for (const [tok, owners] of tokenOwners) {
    const ids = [...owners];
    const label = ids.length === 1 ? I.modelName(ids[0]) : `${tok.toUpperCase()} (${ids.length} models)`;
    reg(tok, { t: 'model', v: ids, label, q: tok, family: label });
  }
  I.vocab = V;
  // Keys worth trying when a word isn't known: no digits (x52 must never become x32).
  I.fuzzyKeys = [...V.keys()].filter((k) => !/\d/.test(k) && k.length >= 4);
  for (const w of [...REL_HAS, ...REL_NOT]) if (w.length >= 4 && !w.includes(' ')) I.fuzzyKeys.push(w);
  I.relWords = new Map([...REL_HAS.map((w) => [w, 'has']), ...REL_NOT.map((w) => [w, 'not'])]);
}

// Is w the start of any word in the index? (Binary search over the sorted word list.)
function corpusHasPrefix(I, w) {
  const c = I.corpus; let lo = 0, hi = c.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (c[mid] < w) lo = mid + 1; else hi = mid; }
  return lo < c.length && c[lo].startsWith(w);
}
function nearestCorpusWord(I, w, max) {
  let best = null, bd = max + 1;
  for (const c of I.corpus) {
    if (Math.abs(c.length - w.length) > max || /\d/.test(c) !== /\d/.test(w)) continue;
    const d = editDistance(w, c, max);
    if (d < bd) { bd = d; best = c; if (d === 1 && max === 1) break; }
  }
  return best;
}

// ---------- Parse ----------
const TYPE_LABEL = { region: 'Region', site: 'Office', model: 'Model', make: 'Manufacturer', class: 'Device kind', status: 'Status', profile: 'Space type', role: 'Role', floor: 'Floor', age: 'Age', year: 'Installed' };
const ORDINAL = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, ground: 0 };
const PATTERNS = [
  [/\b(?:older than|more than|over|at least|>=?)\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?|y)(?:\s+old)?\b/g, (m) => ({ type: 'age', op: '>=', n: +m[1] })],
  [/\b(\d+(?:\.\d+)?)\s*(?:\+\s*)?(?:years?|yrs?)\s+(?:old|or older|and older|or more|plus)\b/g, (m) => ({ type: 'age', op: '>=', n: +m[1] })],
  [/\b(\d+)\s*\+\s*(?:years?|yrs?)\b/g, (m) => ({ type: 'age', op: '>=', n: +m[1] })],
  [/\b(?:newer than|younger than|less than|under|fewer than|<=?)\s*(\d+(?:\.\d+)?)\s*(?:years?|yrs?|y)(?:\s+old)?\b/g, (m) => ({ type: 'age', op: '<', n: +m[1] })],
  [/\b(?:installed\s+)?(before|after|since|from|in)\s+((?:19|20)\d\d)\b/g, (m) => ({ type: 'year', op: m[1] === 'in' ? '=' : m[1] === 'before' ? '<' : m[1] === 'after' ? '>' : '>=', n: +m[2] })],
  [/\b(?:floor|level)\s+(\d+)\b/g, (m) => ({ type: 'floor', n: m[1] })],
  [/\b(\d+)(?:st|nd|rd|th)\s+floor\b/g, (m) => ({ type: 'floor', n: m[1] })],
  [/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|ground)\s+floor\b/g, (m) => ({ type: 'floor', n: String(ORDINAL[m[1]]) })],
];
const STRUCT = /^(kind|type|region|site|model|make|class|status|profile|role|floor|age):(.+)$/;

function tokenize(q) {
  const toks = [], re = /"([^"]*)"?|[^\s"]+/g;
  let m;
  while ((m = re.exec(q))) {
    if (m[0].startsWith('"')) { if (m[1]?.trim()) toks.push({ raw: m[1], s: m.index, e: m.index + m[0].length, quoted: true }); continue; }
    const lead = m[0].match(/^[,;!?()[\]{}'’“”]+/)?.[0].length ?? 0;
    const tail = m[0].match(/[,;!?()[\]{}'’“”.]+$/)?.[0].length ?? 0;
    const raw = m[0].slice(lead, m[0].length - tail || undefined);
    if (!raw) continue;
    toks.push({ raw, s: m.index + lead, e: m.index + lead + raw.length });
  }
  for (const t of toks) { t.w = low(t.raw); t.k = key(t.raw); t.sg = sing(t.k); }
  return toks;
}

function describe(I, f) {
  if (f.type === 'age') return f.op === '<' ? `under ${f.n} years` : `over ${f.n} years`;
  if (f.type === 'year') return `${{ '<': 'before', '>': 'after', '>=': 'since', '=': 'in' }[f.op]} ${f.n}`;
  if (f.type === 'floor') return `Floor ${f.v[0]}`;
  return f.label;
}

function parse(I, q) {
  q = String(q ?? '');
  const P = { q, kinds: [], filters: [], terms: [], corrections: [], suggest: null };
  const lowq = low(q);
  const used = [];
  const isUsed = (s, e) => used.some(([a, b]) => s < b && e > a);
  for (const [re, make] of PATTERNS) {
    re.lastIndex = 0; let m;
    while ((m = re.exec(lowq))) {
      if (isUsed(m.index, m.index + m[0].length) || /"/.test(q.slice(0, m.index)) && (q.slice(0, m.index).split('"').length % 2 === 0)) continue;
      const f = make(m);
      if (f.type === 'floor') { f.v = [f.n]; delete f.n; }
      P.filters.push({ ...f, span: [m.index, m.index + m[0].length], core: [m.index, m.index + m[0].length] });
      used.push([m.index, m.index + m[0].length]);
    }
  }
  const toks = tokenize(q).filter((t) => !isUsed(t.s, t.e));
  let rel = null, relStart = null, sug = null;
  const take = (entry, start, end, from, to) => {
    const spanStart = relStart ?? start;
    if (entry.t === 'kind') {
      for (const v of entry.v) if (!P.kinds.some((k) => k.v === v)) P.kinds.push({ v, span: [spanStart, end], core: [start, end] });
    } else {
      P.filters.push({ type: entry.t, v: [...entry.v], label: entry.label, q: entry.q, neg: rel === 'not' && ['model', 'make', 'class', 'profile'].includes(entry.t), span: [spanStart, end], core: [start, end] });
    }
    if (from) P.corrections.push({ from, to: to ?? entry.q ?? from, span: [start, end] });
    rel = null; relStart = null;
  };
  for (let i = 0; i < toks.length;) {
    const t = toks[i];
    if (t.quoted) { P.terms.push({ raw: t.raw, alts: [splitWords(t.raw).join(' ')], quoted: true, span: [t.s, t.e], core: [t.s, t.e] }); i++; continue; }
    const sm = STRUCT.exec(t.w);
    if (sm) {
      const [, type, val] = sm;
      const e = structEntry(I, type === 'type' ? 'kind' : type, val);
      if (e) { if (e.t === 'age' || e.t === 'floor') P.filters.push({ ...e, type: e.t, span: [relStart ?? t.s, t.e], core: [t.s, t.e] }); else take(e, t.s, t.e); i++; continue; }
    }
    // Longest known phrase first, exactly, then the same with one or two letters forgiven.
    let hit = null;
    for (let L = Math.min(5, toks.length - i); L >= 1 && !hit; L--) {
      const win = toks.slice(i, i + L);
      if (win.some((x) => x.quoted || STRUCT.test(x.w))) continue;
      const spaced = phraseKey(win.map((x) => x.raw)), compact = win.map((x) => x.k).join('');
      const e = I.vocab.get(spaced) ?? I.vocab.get(compact);
      if (e) hit = { e, L };
    }
    if (!hit) {
      // Relations and joining words.
      const two = i + 1 < toks.length ? `${t.w} ${toks[i + 1].w}` : null;
      if (two && I.relWords.has(two)) { rel = I.relWords.get(two); relStart ??= t.s; i += 2; continue; }
      if (I.relWords.has(t.w)) { rel = I.relWords.get(t.w); relStart ??= t.s; i++; continue; }
      if (PREP.has(t.w)) { relStart ??= t.s; i++; continue; }
      if (STOP.has(t.w)) { i++; continue; }
    }
    if (!hit && !STOP.has(t.sg) && !PREP.has(t.sg) && !/\d/.test(t.k) && !corpusHasPrefix(I, t.w) && !corpusHasPrefix(I, t.sg)) {
      for (let L = Math.min(2, toks.length - i); L >= 1 && !hit; L--) {
        const win = toks.slice(i, i + L);
        if (win.some((x) => x.quoted)) continue;
        const spaced = phraseKey(win.map((x) => x.raw));
        const max = allowed(spaced.length);
        if (!max) continue;
        let best = null, bd = max + 1;
        for (const k of I.fuzzyKeys) {
          if (Math.abs(k.length - spaced.length) > max) continue;
          const d = editDistance(spaced, k, max);
          if (d < bd) { bd = d; best = k; }
        }
        if (best) {
          if (I.relWords.has(best)) { rel = I.relWords.get(best); relStart ??= t.s; P.corrections.push({ from: win.map((x) => x.raw).join(' '), to: best, span: [t.s, win[L - 1].e] }); i += L; hit = { skip: true }; break; }
          hit = { e: I.vocab.get(best), L, fuzzy: win.map((x) => x.raw).join(' '), to: best };
        }
      }
      if (hit?.skip) continue;
    }
    if (hit) { take(hit.e, t.s, toks[i + hit.L - 1].e, hit.fuzzy, hit.to); i += hit.L; continue; }
    // Plain words.
    relStart = null; rel = null;
    const term = { raw: t.raw, alts: [...new Set([t.w, t.sg].filter(Boolean))], span: [t.s, t.e], core: [t.s, t.e] };
    if ((t.w.length >= 4 || (t.w.length === 3 && /\d/.test(t.w))) && !corpusHasPrefix(I, t.w) && !corpusHasPrefix(I, t.sg)) {
      if (/\d/.test(t.w)) {
        // Never swap a number silently (x53 is not x52); offer it instead.
        const near = [...I.vocab.keys()].find((k) => /\d/.test(k) && !k.includes(' ') && editDistance(t.k, k, 1) <= 1) ?? nearestCorpusWord(I, t.w, 1);
        if (near) sug = { from: t.raw, to: near, span: [t.s, t.e] };
      } else {
        const near = nearestCorpusWord(I, t.w, allowed(t.w.length));
        if (near) { term.alts = [near]; term.corr = near; P.corrections.push({ from: t.raw, to: near, span: [t.s, t.e] }); }
      }
    }
    P.terms.push(term); i++;
  }
  // Labels: "Has" reads better than "Model" once you've asked for rooms.
  const roomish = P.kinds.some((k) => ['room', 'rp', 'site', 'dp'].includes(k.v));
  for (const f of P.filters) {
    f.value = describe(I, f);
    f.typeLabel = f.neg ? 'Without' : roomish && ['model', 'make', 'class'].includes(f.type) ? 'Has' : TYPE_LABEL[f.type];
  }
  P.corrected = P.corrections.length ? applyCorrections(q, P.corrections) : null;
  if (sug) P.suggest = applyCorrections(q, [...P.corrections, sug]);
  P.chips = [
    ...P.kinds.map((k) => ({ kind: 'kind', type: 'kind', v: [k.v], label: KIND[k.v]?.label ?? k.v, span: k.span, core: k.core })),
    ...P.filters.map((f) => ({ kind: 'filter', type: f.type, v: f.v, neg: f.neg, label: `${f.typeLabel}: ${f.value}`, span: f.span, core: f.core })),
    ...P.terms.map((t) => ({ kind: 'term', type: 'term', label: `“${t.corr ?? t.raw}”`, span: t.span, core: t.core })),
  ];
  return P;
}

function applyCorrections(q, list) {
  let out = q;
  for (const c of [...list].sort((a, b) => b.span[0] - a.span[0])) out = out.slice(0, c.span[0]) + c.to + out.slice(c.span[1]);
  return out;
}

function structEntry(I, type, val) {
  const v = low(val).trim();
  if (type === 'kind') { const k = KIND[v] ?? KINDS.find((x) => x.words.includes(sing(key(v))) || key(x.label) === key(v)); return k ? { t: 'kind', v: [k.code] } : null; }
  if (type === 'region' && REGIONS[v]) return { t: 'region', v: [v], label: REGIONS[v].label, q: REGIONS[v].label };
  if (type === 'site' && I.sites[v]) { const s = I.sites[v]; return { t: 'site', v: [v], label: s[2] ? `${s[1]}, ${s[2]}` : s[1], q: s[1] }; }
  if (type === 'model' && I.models[v]) return { t: 'model', v: [v], label: I.modelName(v), q: I.modelName(v) };
  if (type === 'class' && I.classes[v]) return { t: 'class', v: [v], label: I.classes[v], q: I.classes[v] };
  if (type === 'profile' && I.rps[v]) return { t: 'profile', v: [v], label: I.rps[v], q: I.rps[v] };
  if (type === 'role' && I.roles[v]) return { t: 'role', v: [v], label: I.roles[v], q: I.roles[v] };
  if (type === 'status') { const s = STATUSES.find((x) => x.id === v); return s ? { t: 'status', v: [s.id], label: s.label, q: s.words[0] } : null; }
  if (type === 'make') { const e = I.vocab.get(key(v)); return e?.t === 'make' ? e : null; }
  if (type === 'floor') return { t: 'floor', v: [v] };
  if (type === 'age') { const m = /^(<|>=?)?\s*(\d+(?:\.\d+)?)$/.exec(v); return m ? { t: 'age', op: m[1] === '<' ? '<' : '>=', n: +m[2] } : null; }
  return null;
}

// ---------- Filter and rank ----------
const FIELD = { region: 'r', site: 'st', model: 'm', make: 'mk', class: 'c', profile: 'p', role: 'ro', status: 'z' };
const AND_TYPES = new Set(['model', 'make', 'class']);
const statusAny = (id) => STATUSES.find((s) => s.id === id)?.any ?? [id];
const hits = (vals, want) => !!vals && vals.some((x) => want.includes(x));

function passes(it, filters) {
  const orGroups = {};
  for (const f of filters) {
    if (f.type === 'age') { if (it.age === undefined || (f.op === '<' ? !(it.age < f.n) : !(it.age >= f.n))) return false; continue; }
    if (f.type === 'year') {
      if (!it.y) return false;
      const y = +it.y.slice(0, 4);
      if (!({ '<': y < f.n, '>': y > f.n, '>=': y >= f.n, '=': y === f.n })[f.op]) return false;
      continue;
    }
    if (f.type === 'floor') { if (it.fl === undefined || String(it.fl) !== String(f.v[0])) return false; continue; }
    const vals = it[FIELD[f.type]];
    if (vals === undefined) return false;
    const want = f.type === 'status' ? f.v.flatMap(statusAny) : f.v;
    if (f.neg) { if (hits(vals, want)) return false; continue; }
    if (AND_TYPES.has(f.type)) { if (!hits(vals, want)) return false; continue; }
    (orGroups[f.type] ??= []).push(...want);
  }
  for (const [type, want] of Object.entries(orGroups)) if (!hits(it[FIELD[type]], want)) return false;
  return true;
}

function scoreText(it, terms) {
  let sc = 0;
  for (const t of terms) {
    let best = 0;
    for (const a of t.alts) {
      if (!a) continue;
      const pa = ` ${a}`;
      if (t.quoted) { if (it.text.includes(pa)) best = Math.max(best, it.tw.includes(pa) ? 8 : 3); continue; }
      if (it.tw.includes(`${pa} `)) best = Math.max(best, 10);
      else if (it.tw.includes(pa)) best = Math.max(best, 7);
      else if (it.sw.includes(pa)) best = Math.max(best, 4);
      else if (it.text.includes(pa)) best = Math.max(best, 2);
    }
    if (!best) return 0;
    sc += best;
  }
  return sc;
}

// The thing you named, when you named one: the X52 model page for "x52", the site for "Dublin".
function isSelf(it, P) {
  if (P.kinds.length) return false;
  const f = (type) => P.filters.find((x) => x.type === type && !x.neg);
  const own = { model: 'm', site: 'st', rp: 'p', dp: 'c' };
  const type = { model: 'model', site: 'site', rp: 'profile', dp: 'class' }[it.k];
  if (!type) return false;
  const flt = f(type);
  return !!flt && flt.v.length <= 3 && it[own[it.k]]?.length === 1 && flt.v.includes(it[own[it.k]][0]);
}

function search(I, q, opts = {}) {
  const P = typeof q === 'string' ? parse(I, q) : q;
  const kinds = new Set(P.kinds.map((k) => k.v));
  const hasText = P.terms.length > 0;
  const empty = !kinds.size && !P.filters.length && !hasText;
  const askedStatus = P.filters.some((f) => f.type === 'status');
  const res = [];
  if (!empty) {
    for (const it of I.items) {
      if (kinds.size ? !kinds.has(it.k) : NOISY.has(it.k) && !hasText) continue;
      if (!passes(it, P.filters)) continue;
      let sc = 1;
      if (hasText) { sc = scoreText(it, P.terms); if (!sc) continue; }
      const self = isSelf(it, P);
      // Retired units come after the ones still in a room, unless you asked about status.
      const gone = !askedStatus && it.k === 'unit' && it.z?.includes('retired') ? 0.5 : 0;
      res.push({ it, sc: sc + (self ? 50 : 0) - gone, self });
    }
  }
  res.sort((a, b) => b.sc - a.sc || KIND[a.it.k].order - KIND[b.it.k].order || a.it.i - b.it.i);
  const top = res.filter((r) => r.self).slice(0, 3);
  const byKind = new Map();
  for (const r of res) { if (top.includes(r)) continue; (byKind.get(r.it.k) ?? byKind.set(r.it.k, []).get(r.it.k)).push(r); }
  const groups = [...byKind.entries()].map(([k, list]) => ({ k, label: KIND[k].label, icon: KIND[k].icon, best: list[0].sc, total: list.length, items: list }));
  groups.sort((a, b) => (hasText ? b.best - a.best : 0) || KIND[a.k].order - KIND[b.k].order);
  return { P, total: res.length, top, groups, facets: opts.facets === false ? null : facets(I, res, P) };
}

// The words that ask for a value, so a chip menu or a facet edits the query in plain language.
function canon(I, type, v) {
  if (type === 'kind') return KIND[v]?.label.toLowerCase() ?? `kind:${v}`;
  if (type === 'region') return REGIONS[v]?.label ?? `region:${v}`;
  if (type === 'site') return I.sites[v]?.[1] ?? `site:${v}`;
  if (type === 'status') return STATUSES.find((s) => s.id === v)?.words[0] ?? `status:${v}`;
  if (type === 'class') return I.classes[v] ?? `class:${v}`;
  if (type === 'model') return I.models[v] ? I.modelName(v) : `model:${v}`;
  if (type === 'make') return v;
  if (type === 'profile') return I.rps[v] ?? `profile:${v}`;
  if (type === 'role') return I.roles[v] ?? `role:${v}`;
  return `${type}:${v}`;
}

// Facet counts over the current results, so every choice narrows to something.
function facets(I, res, P) {
  const count = (field) => { const m = new Map(); for (const { it } of res) for (const v of it[field] ?? []) m.set(v, (m.get(v) ?? 0) + 1); return m; };
  const sorted = (m, label, q) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([v, n]) => ({ v, n, label: label(v), q: q(v) }));
  const kinds = new Map(); for (const { it } of res) kinds.set(it.k, (kinds.get(it.k) ?? 0) + 1);
  const st = new Map();
  for (const s of STATUSES) { const n = res.filter(({ it }) => hits(it.z, s.any)).length; if (n) st.set(s.id, n); }
  const has = (type, v) => P.filters.some((f) => f.type === type && !f.neg && f.v.includes(v));
  const out = {
    kind: [...kinds.entries()].sort((a, b) => KIND[a[0]].order - KIND[b[0]].order).map(([v, n]) => ({ v, n, label: KIND[v].label, q: canon(I, 'kind', v), on: P.kinds.some((k) => k.v === v) })),
    region: sorted(count('r'), (v) => REGIONS[v]?.label ?? v, (v) => canon(I, 'region', v)).map((x) => ({ ...x, on: has('region', x.v) })),
    site: sorted(count('st'), (v) => I.sites[v]?.[1] ?? v, (v) => canon(I, 'site', v)).map((x) => ({ ...x, on: has('site', x.v) })),
    status: sorted(st, (v) => STATUSES.find((s) => s.id === v).label, (v) => canon(I, 'status', v)).map((x) => ({ ...x, on: has('status', x.v) })),
    class: sorted(count('c'), (v) => I.classes[v] ?? v, (v) => canon(I, 'class', v)).map((x) => ({ ...x, on: has('class', x.v) })),
    make: sorted(count('mk'), (v) => v, (v) => canon(I, 'make', v)).map((x) => ({ ...x, on: has('make', x.v) })),
    profile: sorted(count('p'), (v) => I.rps[v] ?? v, (v) => canon(I, 'profile', v)).map((x) => ({ ...x, on: has('profile', x.v) })),
  };
  return out;
}

// ---------- Editing the query from a chip or a facet ----------
function removeSpan(q, span) {
  return (q.slice(0, span[0]) + ' ' + q.slice(span[1])).replace(/\s+/g, ' ').trim();
}
function replaceSpan(q, span, text) {
  return (q.slice(0, span[0]) + text + q.slice(span[1])).replace(/\s+/g, ' ').trim();
}
function addToQuery(q, text) { return `${String(q).trim()} ${text}`.trim(); }
function setKind(P, code) {
  const k = P.kinds[0];
  const word = KIND[code]?.label.toLowerCase() ?? `kind:${code}`;
  return k ? replaceSpan(P.q, k.core, word) : `${word} ${P.q}`.trim();
}
// Other values a chip could take, for its menu. Each comes with the text that asks for it.
function alternatives(I, P, chip) {
  const cur = chip.v ?? [];
  const opt = (label, q, v) => ({ label, q: canon(I, chip.type, v), on: cur.includes(v) });
  switch (chip.type) {
    case 'kind': return KINDS.filter((k) => I.items.some((it) => it.k === k.code)).map((k) => opt(k.label, `kind:${k.code}`, k.code));
    case 'region': return Object.entries(REGIONS).map(([id, r]) => opt(r.label, `region:${id}`, id));
    case 'site': {
      const reg = P.filters.find((f) => f.type === 'region')?.v ?? null;
      return Object.entries(I.sites).filter(([, s]) => !reg || reg.includes(s[3])).map(([id, s]) => opt(s[2] ? `${s[1]}, ${s[2]}` : s[1], `site:${id}`, id));
    }
    case 'status': return STATUSES.map((s) => opt(s.label, `status:${s.id}`, s.id));
    case 'class': return Object.entries(I.classes).map(([id, n]) => opt(n, `class:${id}`, id)).sort((a, b) => a.label.localeCompare(b.label));
    case 'model': {
      const cls = I.models[cur[0]]?.[2];
      return Object.entries(I.models).filter(([, m]) => m[2] === cls).map(([id]) => opt(I.modelName(id), `model:${id}`, id));
    }
    case 'make': return [...new Set(Object.values(I.models).map((m) => m[0]))].sort().map((mk) => opt(mk, `make:${key(mk)}`, mk));
    case 'profile': return Object.entries(I.rps).map(([id, n]) => opt(n, `profile:${id}`, id));
    case 'role': return Object.entries(I.roles).map(([id, n]) => opt(n, `role:${id}`, id));
    default: return [];
  }
}

export { load, parse, search, alternatives, canon, removeSpan, replaceSpan, addToQuery, setKind, editDistance, sing, KINDS, REGIONS, STATUSES };
