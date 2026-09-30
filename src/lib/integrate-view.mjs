// The Deploy pages' state and markup, shared by the build and the browser (no data.mjs here, so the
// browser can load it). The build renders the plan as it was built (the base); the browser replays the
// live events over the same base with the same functions, so both draw the same thing
// (src/lib/integrate.mjs explains the plan and the events; integrate-client.mjs does the live part).
//
//   const M = integrateModel(plan, io)   io: { get(item, base) -> state, stage() -> 1..6, agents() -> bool }
//   M.stepOf(unitId, step)  { st, label, sub, why, issue, acc }  st: todo, doing, verified, done, issue, blocked, na
//
// "verified" is what Keia Atlas saw pass and nobody has accepted yet; "done" is accepted, or done by hand
// where Keia Atlas cannot see. Exceptions ("issue") are never swept up by an accept.

export const USTEPS = ['provision', 'install', 'configure'];
const DONE = { provision: 'Provisioned', install: 'Installed', configure: 'Configured', commission: 'Commissioned' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many ?? `${one}s`}`;
export const PSEUDO = { keia_atlas: 'Keia Atlas', agent: 'The setup guide agent' };
const first = (name) => String(name ?? '').split(' ')[0];

export function integrateModel(plan, io) {
  const P = plan.project;
  const U = new Map(plan.units.map((u) => [u.id, u]));
  const B = new Map(plan.batches.map((b) => [b.id, b]));
  const R = new Map(plan.rooms.map((r) => [r.id, r]));
  const LABEL = Object.fromEntries(plan.steps.map((s) => [s.id, s.label]));
  const DONE_W = Object.fromEntries(plan.steps.map((s) => [s.id, s.done ?? DONE[s.id]]));
  const people = io.people ?? {};
  const nameOf = (id) => PSEUDO[id] ?? people[id] ?? id ?? 'Someone';
  const stage = () => io.stage?.() ?? 6;
  const seeOn = () => stage() >= 2;

  // ---- Items and what they were built as ----
  const item = { unit: (id) => `int:${P}:${id}:unit`, batch: (id) => `int:${P}:${id}:batch`, room: (id) => `int:${P}:${id}:room`, zone: (id) => `int:${P}:${id}:zone`, project: () => `int:${P}:all:project` };
  const Z = new Map((plan.zones ?? []).map((z) => [z.id, z]));
  const setupOf = (u) => (B.get(u.batch)?.setup ?? []);
  function baseUnit(u) {
    const o = { online: u.base.online, read: u.base.read, drift: u.base.drift, fwOk: u.base.fwOk, dnsOk: u.base.dnsOk, host: u.host, installed: u.base.installed };
    setupOf(u).slice(0, u.base.setupDone).forEach((s) => { o[`su-${s.id}`] = true; });
    for (const [step, who] of Object.entries(u.base.hand ?? {})) o[`x-${step}`] = { v: true, w: who };
    return o;
  }
  const baseBatch = (b) => ({ applied: b.units.every((id) => U.get(id).base.read) && b.units.some((id) => U.get(id).steps.includes('configure')), handed: false, prepared: false, accepted: {} });
  const baseRoom = (r) => ({ tests: r.base.tests ?? {}, signed: r.base.signed ? { w: r.base.signed } : false, accepted: {} });
  const baseOf = (it) => {
    const m = /^int:[^:]+:(.+):(unit|batch|room|zone|project)$/.exec(it); if (!m) return {};
    if (m[2] === 'unit') return U.has(m[1]) ? baseUnit(U.get(m[1])) : {};
    if (m[2] === 'batch') return B.has(m[1]) ? baseBatch(B.get(m[1])) : {};
    if (m[2] === 'room') return R.has(m[1]) ? baseRoom(R.get(m[1])) : {};
    return { accepted: {} };
  };
  const S = (it) => io.get(it, baseOf(it));
  const us = (id) => S(item.unit(id));
  const bs = (id) => S(item.batch(id));
  const rs = (id) => S(item.room(id));

  // Everything accepted, from the built plan and from every accept event (batch, room, floor or side, one unit,
  // the project and custom sets), whichever way the work was grouped when it was accepted.
  function acceptedAll() {
    const out = new Map();
    for (const u of plan.units) for (const [step, who] of Object.entries(u.base.accepted ?? {})) out.set(`${u.id}|${step}`, { who, at: null });
    const add = (st) => { for (const [k, v] of Object.entries(st.accepted ?? {})) out.set(k, v); };
    plan.batches.forEach((b) => add(bs(b.id)));
    plan.rooms.forEach((r) => add(rs(r.id)));
    Z.forEach((z) => add(S(item.zone(z.id))));
    plan.units.forEach((u) => add(us(u.id)));
    add(S(item.project()));
    return out;
  }
  let accCache = null;
  const acc = (k) => (accCache ?? (accCache = acceptedAll())).get(k) ?? null;
  const fresh = () => { accCache = null; };

  // ---- What Keia Atlas can check for a unit and a step ----
  const hostOnline = (u) => { if (!u.hostPos) return true; const h = U.get(u.hostPos); return h ? Boolean(us(h.id).online) : true; };
  function checks(u, step) {
    const s = us(u.id);
    if (step === 'provision') {
      return u.records.map((r) => {
        let ok = Boolean(r.seen);
        if (['fleetlens', 'licence', 'firmware', 'darksign'].includes(r.id)) ok = ok || Boolean(s.online);
        if (r.id === 'infodns') ok = Boolean(s.host) && (ok || Boolean(s.online)) && s.dnsOk !== false;
        if (r.id === 'firmware') ok = ok && s.fwOk !== false;
        const found = r.id === 'infodns' && s.dnsOk === false ? `Points at the old unit${u.legacy ? ` (${u.legacy.tag})` : ''}` : r.id === 'firmware' && s.fwOk === false ? `Version ${u.oldFw}` : ok ? r.exp : 'Not found yet';
        return { id: r.id, t: r.t, sys: r.sys, exp: r.exp, ok, found };
      });
    }
    if (step === 'install') {
      if (!u.networked) return [{ id: 'hand', t: 'Mounted and connected', exp: u.where ?? 'Where the space type puts it', ok: null, found: 'Keia Atlas cannot see this one: a person confirms it' }];
      return [{ id: 'online', t: 'Online on its switch port', exp: u.port, ok: Boolean(s.online), found: s.online ? `Online on ${u.port}` : s.installed ? 'Marked installed, not seen online yet' : 'Not seen yet' }];
    }
    if (step === 'configure') {
      const b = B.get(u.batch);
      if (!u.readable) return [{ id: 'hand', t: 'Set as the setup guide says', exp: b?.cfg ? `${b.cfg.name} ${b.cfg.version}` : '', ok: null, found: 'Keia Atlas cannot read this one back: a person confirms it' }];
      const reach = (u.networked ? Boolean(s.online) : true) && hostOnline(u);
      const ok = reach && Boolean(s.read) && !s.drift;
      return [{ id: 'read', t: b?.cfg ? `Settings match ${b.cfg.name} ${b.cfg.version}` : 'Settings match the standard', exp: b?.via ?? '', ok, found: s.drift ? s.drift : ok ? 'Read back: matches' : !reach ? (!hostOnline(u) ? 'Its video bar is not online yet' : 'Not online yet') : s.read ? 'Matches' : 'Not read back yet' }];
    }
    return [];
  }
  // The things that need a person, as the systems report them.
  function issuesOf(u, step) {
    if (!seeOn()) return [];
    const s = us(u.id), b = B.get(u.batch), out = [];
    if (step === 'provision') {
      if (u.records.some((r) => r.id === 'infodns') && !s.host) out.push({ kind: 'host', t: 'No hostname yet', fix: 'Give it one so DNS, device management and monitoring can find it.', act: 'host' });
      if (s.dnsOk === false) out.push({ kind: 'dns', t: `DNS for ${s.host} still points at the old unit${u.legacy ? ` (${u.legacy.tag})` : ''}`, fix: 'Retire the old unit in the asset register, then recheck.', act: 'recheck', field: 'dnsOk' });
      if (s.fwOk === false) out.push({ kind: 'fw', t: `Firmware ${u.oldFw}; the standard is ${u.fw}`, fix: 'Update it before you configure it, so the settings land on the right version.', act: stage() >= 4 ? 'update' : 'recheck', field: 'fwOk' });
    }
    if (step === 'install' && s.offline) out.push({ kind: 'offline', t: `Offline: last seen on ${u.port}`, fix: `Check the cable and power at ${u.port}, then recheck.`, act: 'recheck', field: 'online' });
    if (step === 'configure' && s.drift) out.push({ kind: 'drift', t: s.drift, fix: stage() >= 4 ? 'Reapply the setup guide to this unit.' : `Set it back by hand in ${b?.via ?? 'device management'}, then recheck.`, act: stage() >= 4 ? 'reapply' : 'recheck', field: 'drift' });
    return out;
  }
  const issueOf = (u, step) => issuesOf(u, step)[0] ?? null;

  // ---- One unit, one step ----
  function stepOf(uid, step) {
    const u = U.get(uid);
    if (!u || !u.steps.includes(step)) return { st: 'na', label: 'Not needed', sub: '' };
    const s = us(uid), key = `${uid}|${step}`, a = acc(key);
    const cs = checks(u, step);
    const seeable = seeOn() && cs.length > 0 && cs.every((c) => c.ok !== null);
    const allOk = seeable && cs.every((c) => c.ok);
    const xo = s[`x-${step}`] ?? null, x = xo ? xo.v : undefined;
    const issue = issueOf(u, step);
    const by = (w) => (w === 'keia_atlas' ? 'Keia Atlas' : first(nameOf(w)));
    if (x === false) return { st: 'todo', label: 'To do', sub: `Unticked by ${by(xo.w)}`, why: xo.n ?? null, cs };
    if (issue) return { st: 'issue', label: 'Ready for you', sub: { host: 'No hostname', dns: 'DNS', fw: 'Firmware', offline: 'Offline', drift: 'Drifted' }[issue.kind] ?? '', issue, cs };
    if (allOk) return a ? { st: 'done', label: DONE_W[step], sub: `Accepted by ${by(a.who)}`, acc: a, cs, seen: true } : { st: 'verified', label: 'Checked', sub: 'Seen by Keia Atlas', cs, seen: true };
    if (x === true) return { st: 'done', label: DONE_W[step], sub: `${step === 'install' && u.vendor ? 'Marked' : 'Ticked'} by ${by(xo.w)}`, why: xo.n ?? null, cs };
    if (a && !seeable) return { st: 'done', label: DONE_W[step], sub: `Confirmed by ${by(a.who)}`, acc: a, cs };
    if (u.blocked?.[step]) return { st: 'blocked', label: 'Waiting on', sub: u.blocked[step], cs };
    const okN = cs.filter((c) => c.ok).length;
    if (step === 'provision' && okN > 0) return { st: 'doing', label: 'Under way', sub: `${okN} of ${cs.length} seen`, cs };
    if (step === 'install' && s.installed) return { st: 'doing', label: 'Under way', sub: seeable ? 'Waiting to see it online' : 'Marked installed', cs };
    if (step === 'configure') {
      const bst = bs(u.batch);
      const su = setupOf(u), n = su.filter((x2) => s[`su-${x2.id}`] || bst[`su-${x2.id}`]).length;
      if ((bst.applied || s.applied) && seeable) return { st: 'doing', label: 'Under way', sub: !hostOnline(u) ? 'Waits for its video bar' : u.networked && !s.online ? 'Applies when it is online' : 'Reading back', cs };
      if (n > 0) return { st: 'doing', label: 'Under way', sub: `${n} of ${su.length} setup steps`, cs };
    }
    return { st: 'todo', label: 'To do', sub: '', cs };
  }
  const unitSteps = (uid) => U.get(uid).steps.map((s) => stepOf(uid, s));
  const unitSetUp = (uid) => unitSteps(uid).every((x) => x.st === 'done' || x.st === 'verified');

  // ---- Batches, rooms, the project ----
  function batchSum(bid) {
    const b = B.get(bid);
    const per = Object.fromEntries(b.steps.map((step) => [step, b.units.map((id) => stepOf(id, step))]));
    const all = b.units.flatMap((id) => U.get(id).steps.map((step) => ({ id, step, x: stepOf(id, step) })));
    const issues = all.filter((z) => z.x.st === 'issue');
    const ready = all.filter((z) => z.x.st === 'verified');
    const done = b.units.filter(unitSetUp).length;
    const accepted = b.units.filter((id) => U.get(id).steps.every((st) => stepOf(id, st).st === 'done')).length;
    const moving = all.some((z) => z.x.st !== 'todo' && z.x.st !== 'na');
    const status = issues.length ? 'needs' : ready.length ? 'accept' : accepted === b.units.length ? 'done' : moving ? 'doing' : 'todo';
    return { per, issues, ready, done, accepted, total: b.units.length, status };
  }
  function roomSum(rid) {
    const r = R.get(rid), st = rs(rid);
    const units = r.units.map((id) => ({ id, steps: unitSteps(id) }));
    const setUp = r.units.filter(unitSetUp).length;
    const tests = r.tests.map((t) => ({ ...t, res: st.tests?.[t.id] ?? null }));
    const passed = tests.filter((t) => t.res?.r === 'pass').length, failed = tests.filter((t) => t.res?.r === 'fail');
    const issues = units.flatMap((x) => x.steps.filter((y) => y.st === 'issue').map((y) => ({ id: x.id, y })));
    const ready = setUp === r.units.length;
    const status = st.signed ? 'done' : failed.length || issues.length ? 'needs' : ready ? 'test' : setUp || units.some((x) => x.steps.some((y) => y.st !== 'todo')) ? 'doing' : 'todo';
    return { r, st, units, setUp, total: r.units.length, tests, passed, failed, ready, signed: Boolean(st.signed), status, issues };
  }

  // What needs a person: every exception, each waiting task, and each failed room test.
  function needs() {
    const out = [];
    for (const u of plan.units) for (const step of u.steps) {
      const x = stepOf(u.id, step);
      if (x.st === 'issue') for (const i of issuesOf(u, step)) out.push({ k: `${u.id}|${step}|${i.kind}`, kind: i.kind, u: u.id, step, where: `${u.roomName} ${u.short.toLowerCase()}`, room: u.room, batch: u.batch, t: i.t, fix: i.fix, act: i.act, field: i.field });
    }
    for (const r of plan.rooms) {
      const st = rs(r.id);
      for (const t of r.tests) { const res = st.tests?.[t.id]; if (res?.r === 'fail') out.push({ k: `${r.id}|test|${t.id}`, kind: 'test', room: r.id, where: r.name, t: `Room test failed: ${t.t.toLowerCase()}`, fix: res.note ? `"${res.note}". Fix it, then test again.` : 'Fix it, then test again.', act: 'room' }); }
    }
    for (const t of plan.blocked) {
      const r = t.room ? R.get(t.room) : null;
      out.push({ k: `task|${t.id}`, kind: 'blocked', room: t.room, where: r ? r.name : plan.name, t: `Waiting on: ${t.why}`, fix: `${t.id} ${t.title}. ${first(nameOf(t.owner))} is on it; nothing to do here until it clears.`, act: 'task', href: t.href, quiet: true });
    }
    return out;
  }
  // What Keia Atlas saw pass and nobody has accepted yet, by batch or by room.
  const EVIDENCE = { provision: 'in the asset register, DNS and device management', install: 'online on the right switch ports', configure: 'settings read back and match' };
  // `by` is a way of delivering (type, room, floor, one, set) or, as before, 'batch'.
  function readyGroups(by, opts = {}) {
    const groups = [];
    const way = by === 'batch' ? 'type' : by;
    const list = way === 'one'
      ? (plan.queue ?? plan.units.map((u) => u.id)).map((id) => { const u = U.get(id); return { scope: 'unit', id, title: unitLabel(u), units: [id], noun: null }; })
      : groupsBy(way, opts).map((g) => ({ ...g, noun: g.scope === 'batch' ? B.get(g.id).noun : null, cfg: g.scope === 'batch' ? B.get(g.id).cfg : null }));
    const scopeWord = (g) => (g.scope === 'batch' ? 'batch' : g.scope);
    for (const g of list) {
      const keys = [], stepsSeen = new Set(); let checksN = 0; const unitsIn = new Set();
      let blockedN = 0;
      for (const id of g.units) for (const step of U.get(id).steps) {
        const x = stepOf(id, step);
        if (x.st === 'verified') { keys.push(`${id}|${step}`); stepsSeen.add(step); checksN += x.cs.length; unitsIn.add(id); }
        else if (x.st === 'issue') blockedN += 1;
      }
      if (!keys.length) continue;
      const ev = USTEPS.filter((s) => stepsSeen.has(s)).map((s) => (s === 'configure' && g.cfg ? `settings match the setup guide (${g.cfg.name}, ${g.cfg.version})` : EVIDENCE[s]));
      const n = unitsIn.size;
      const all = n === g.units.length && !blockedN && g.units.every((id) => U.get(id).steps.every((st) => ['verified', 'done'].includes(stepOf(id, st).st)));
      const inWords = g.scope !== 'batch';
      const what = inWords ? `in ${g.title}` : (g.noun ?? 'units');
      const head = g.scope === 'unit' ? `${g.title}: ${plural(keys.length, 'step')} passed`
        : all
          ? (inWords ? `Every unit in ${g.title} passes` : n === 1 ? `The ${g.title.replace(/^1 /, '')} passes` : `All ${n} ${what} pass`)
          : `${plural(keys.length, 'step')} passed on ${n} of ${g.units.length} ${inWords ? `units ${what}` : what}`;
      groups.push({ scope: scopeWord(g), id: g.id, title: g.title, head, ev: ev.join(', '), keys, n, checksN, left: blockedN, all });
    }
    return groups;
  }

  // ---- Deliver by: the same units, grouped the way a team works ----
  // type: batches that share a setup guide; room: each space's units, then its room test; floor: spaces by
  // floor, or by side of the floor; one: a single queue in walking order; set: a set a person picked.
  const lc = (s) => (/^[A-Z][a-z]/.test(String(s)) ? String(s).charAt(0).toLowerCase() + String(s).slice(1) : String(s));
  const unitLabel = (u) => `${u.roomName} ${lc(u.short)}`;
  function groupsBy(by, { set = null } = {}) {
    if (by === 'room') return plan.rooms.filter((r) => r.units.length).map((r, i) => ({ scope: 'room', id: r.id, n: i + 1, title: r.name, sub: [r.profile, r.kept.length ? `${plural(r.kept.length, 'device')} kept as they are` : ''].filter(Boolean).join(' · '), units: r.units, rooms: [r.id] }));
    if (by === 'floor') {
      const zones = plan.zones?.length ? plan.zones : [{ id: 'all', title: 'Every space', rooms: plan.rooms.filter((r) => r.units.length).map((r) => r.id), units: plan.units.map((u) => u.id) }];
      return zones.map((z, i) => ({ scope: 'zone', id: z.id, n: i + 1, title: z.title, sub: `${plural(z.rooms.length, 'space')}, ${plural(z.units.length, 'unit')}`, units: z.units, rooms: z.rooms }));
    }
    if (by === 'one') {
      const q = plan.queue ?? plan.units.map((u) => u.id);
      return [{ scope: 'queue', id: 'all', title: 'The queue', sub: 'Space by space, in the order an engineer works', units: q, rooms: [...new Set(q.map((id) => U.get(id).room))] }];
    }
    if (by === 'set') {
      const inSet = set ? set.units.filter((id) => U.has(id)) : [];
      const rest = plan.units.map((u) => u.id).filter((id) => !inSet.includes(id));
      const out = [];
      if (set) out.push({ scope: 'set', id: set.id, title: set.name, sub: 'Your set, saved in this browser', units: inSet, rooms: [...new Set(inSet.map((id) => U.get(id).room))] });
      if (rest.length) out.push({ scope: 'rest', id: 'rest', title: set ? 'Not in this set' : 'Every unit', sub: set ? 'The rest of the project' : 'Pick units for a set above', units: rest, rooms: [...new Set(rest.map((id) => U.get(id).room))] });
      return out;
    }
    return plan.batches.map((b) => ({ scope: 'batch', id: b.id, n: b.n, title: b.title, sub: b.touched ? 'Re-check: they pair with the new units' : b.cfg ? `${b.cfg.name} ${b.cfg.version}` : 'Nothing to set: provision and install', units: b.units, rooms: b.rooms }));
  }
  const settled = (x) => x.st === 'done' || x.st === 'verified';
  // Where a group stands, counted from its units' own steps (so every grouping counts the same way).
  function groupSum(g) {
    const per = g.units.map((id) => ({ id, xs: unitSteps(id) }));
    const checked = per.filter((p) => p.xs.every(settled)).length;
    const accepted = per.filter((p) => p.xs.every((x) => x.st === 'done')).length;
    const issueUnits = per.filter((p) => p.xs.some((x) => x.st === 'issue')).map((p) => p.id);
    const readyKeys = per.flatMap((p) => U.get(p.id).steps.filter((s, i) => p.xs[i].st === 'verified').map((s) => `${p.id}|${s}`));
    const moving = per.some((p) => p.xs.some((x) => x.st !== 'todo' && x.st !== 'na'));
    const rooms = (g.scope === 'room' || g.scope === 'zone') ? (g.rooms ?? []).map((rid) => roomSum(rid)) : [];
    const signed = rooms.filter((r) => r.signed).length, failed = rooms.filter((r) => r.failed.length && !r.signed);
    const status = issueUnits.length || failed.length ? 'needs' : readyKeys.length ? 'accept'
      : rooms.length ? (signed === rooms.length ? 'done' : checked === per.length ? 'test' : moving ? 'doing' : 'todo')
        : accepted === per.length ? 'done' : moving ? 'doing' : 'todo';
    return { total: per.length, checked, accepted, issueUnits, readyKeys, rooms, signed, failed, status, moving };
  }
  // A unit's worst step: what a person would want to know about it first.
  const worstOf = (xs) => xs.find((x) => x.st === 'issue') ?? xs.find((x) => x.st === 'blocked') ?? xs.find((x) => !settled(x)) ?? xs.find((x) => x.st === 'verified') ?? xs[0];
  // Where a unit stands, in two or three words: the same words in every way of delivering.
  function unitWord(uid) {
    const u = U.get(uid), xs = unitSteps(uid);
    const issue = xs.find((x) => x.st === 'issue');
    if (issue) return `Ready for you: ${lc(issue.sub || 'look')}`;
    const wait = xs.find((x) => x.st === 'blocked');
    if (wait) return `Waiting on: ${lc(wait.sub)}`;
    const ready = xs.filter((x) => x.st === 'verified').length;
    if (ready) return `${plural(ready, 'step')} to accept`;
    if (xs.every((x) => x.st === 'done')) return 'Accepted';
    const i = xs.findIndex((x) => !settled(x));
    return i < 0 ? 'Set up' : `${LABEL[u.steps[i]]}: ${lc(xs[i].label)}`;
  }
  const unitStatus = (uid) => { const xs = unitSteps(uid); return xs.some((x) => x.st === 'issue') ? 'needs' : xs.some((x) => x.st === 'verified') ? 'accept' : xs.every((x) => x.st === 'done') ? 'done' : xs.some((x) => x.st !== 'todo' && x.st !== 'na') ? 'doing' : 'todo'; };
  // One exception in words, short enough for the answer sentence.
  // mode: 'room' names the unit by its kind ("the display"), 'self' says "it", anything else names it in full.
  function issuePhrase(n, mode) {
    const inRoom = mode === 'room' || mode === 'self';
    const u = n.u ? U.get(n.u) : null;
    const who = mode === 'self' ? 'it' : u ? (inRoom ? `the ${lc(u.short)}` : unitLabel(u)) : '';
    const its = mode === 'self' ? 'its' : `${who}'s`;
    if (n.kind === 'host') return `${who} has no hostname yet`;
    if (n.kind === 'dns') return `${its} DNS still points at the old unit`;
    if (n.kind === 'fw') return `${who} runs older firmware than the standard`;
    if (n.kind === 'offline') return `${who} is offline`;
    if (n.kind === 'drift') { const what = String(us(n.u).drift ?? '').split(':')[0].toLowerCase(); return `${its} ${what || 'settings'} ${what && !/s$/.test(what) ? 'differs' : 'differ'} from the setup guide`; }
    if (n.kind === 'test') return inRoom ? `the room test failed: ${lc(n.t.replace(/^Room test failed: /, ''))}` : `${R.get(n.room)?.name ?? 'a space'}'s room test failed`;
    if (n.kind === 'blocked') return `waiting on ${lc(n.t.replace(/^Waiting on: /, ''))}`;
    return lc(n.t);
  }
  // The answer sentence first: "4.05 Heron: 5 of 7 checked; the display's DNS still points at the old unit".
  // `bare` leaves the group's name off, for a card whose title already says it.
  function groupAnswer(g, sum = groupSum(g), { bare = false } = {}) {
    const inRoom = g.scope === 'room';
    const ids = new Set(g.units), roomsIn = new Set(g.rooms ?? []);
    const list = needs().filter((n) => (n.u ? ids.has(n.u) : (n.kind === 'test' && (g.scope === 'room' || g.scope === 'zone') && roomsIn.has(n.room)) || (n.kind === 'blocked' && n.room && roomsIn.has(n.room))));
    const loud = list.filter((n) => !n.quiet);
    const head = `${bare ? '' : `${g.title}: `}${sum.checked} of ${plural(sum.total, 'unit')} checked`;
    if (loud.length) return `${head}; ${issuePhrase(loud[0], inRoom ? 'room' : 'any')}${loud.length > 1 ? `, and ${loud.length - 1} more for you` : ''}`;
    if (sum.readyKeys.length) return `${head}; ${plural(sum.readyKeys.length, 'step')} passed, ready to accept`;
    if (sum.rooms.length) {
      if (sum.signed === sum.rooms.length) return `${head}; ${sum.rooms.length === 1 ? 'signed off' : `all ${sum.rooms.length} spaces signed off`}`;
      if (sum.checked === sum.total) return `${head}; ${sum.rooms.length === 1 ? 'ready for the room test' : `${sum.signed} of ${sum.rooms.length} spaces signed off`}`;
    }
    if (sum.accepted === sum.total && sum.total) return `${head}; all accepted`;
    const waits = list.filter((n) => n.quiet);
    if (waits.length) return `${head}; ${issuePhrase(waits[0], inRoom ? 'room' : 'any')}`;
    if (!sum.moving) return `${head}; not started`;
    return sum.checked === sum.total ? `${head}; nothing waiting on you` : `${head}; ${sum.total - sum.checked} still to set up`;
  }
  // One unit's answer, for One at a time.
  function unitAnswer(uid) {
    const u = U.get(uid), xs = unitSteps(uid);
    const n = needs().find((x) => x.u === uid && !x.quiet);
    const ok = xs.filter(settled).length;
    const head = `${unitLabel(u)}: ${ok} of ${plural(xs.length, 'step')} checked`;
    if (n) return `${head}; ${issuePhrase(n, 'self')}`;
    const ready = xs.filter((x) => x.st === 'verified').length;
    if (ready) return `${head}; ${plural(ready, 'step')} passed, ready to accept`;
    if (xs.every((x) => x.st === 'done')) return `${head}; all accepted`;
    const w = worstOf(xs), step = lc(LABEL[u.steps[xs.indexOf(w)]] ?? '');
    if (w.st === 'blocked') return `${head}; ${step} is waiting on ${lc(w.sub)}`;
    return `${head}; next: ${step}${w.sub ? ` (${lc(w.sub)})` : ''}`;
  }

  // What passed for one unit and step, in words, kept with its accept.
  function evidenceOf(uid, step) {
    const x = stepOf(uid, step);
    const ok = (x.cs ?? []).filter((c) => c.ok);
    if (!ok.length) return 'Confirmed by hand: Keia Atlas cannot see this one';
    return ok.map((c) => `${c.t}: ${c.found || c.exp}`).join('; ');
  }
  function acceptSummary(keys) {
    const steps = [...new Set(keys.map((k) => k.split('|')[1]))];
    const unitsN = new Set(keys.map((k) => k.split('|')[0])).size;
    const checksN = keys.reduce((n, k) => { const [u, s] = k.split('|'); return n + ((stepOf(u, s).cs ?? []).filter((c) => c.ok).length); }, 0);
    return `${plural(unitsN, 'unit')}, ${plural(keys.length, 'step')}: ${USTEPS.filter((s) => steps.includes(s)).map((s) => EVIDENCE[s]).join('; ')}. ${plural(checksN, 'check')} passed.`;
  }
  // The item an accept in this group is written to. A custom set lives in one browser, so its accepts go on the
  // project, naming the set; every other grouping has an item every window knows.
  function itemOfGroup(g) {
    if (g.scope === 'batch') return item.batch(g.id);
    if (g.scope === 'room') return item.room(g.id);
    if (g.scope === 'zone') return item.zone(g.id);
    if (g.scope === 'unit') return item.unit(g.id);
    return item.project();
  }
  // The one event that accepts `keys` in group g: each unit and step with who, when, what passed and where.
  function acceptEvent(g, keys, { who, at, note } = {}) {
    const it = itemOfGroup(g);
    const cur = S(it).accepted ?? {};
    const add = Object.fromEntries(keys.map((k) => { const [uid, step] = k.split('|'); return [k, { who, at, ev: evidenceOf(uid, step), in: `${g.scope}:${g.id}`, inTitle: g.title }]; }));
    return { item: it, field: 'accepted', before: cur, after: { ...cur, ...add }, note: note ?? `Accepted in ${g.title}: ${acceptSummary(keys)}` };
  }
  // Units in a group still waiting for their setup guide: ones Keia Atlas can read back, and ones a person confirms.
  function toApply(g) { return g.units.filter((id) => { const u = U.get(id); return u.steps.includes('configure') && u.readable && !(bs(u.batch).applied || us(id).applied || us(id).read) && !settled(stepOf(id, 'configure')); }); }
  function toConfirm(g) { return g.units.filter((id) => { const u = U.get(id); return u.steps.includes('configure') && !u.readable && !settled(stepOf(id, 'configure')); }); }
  // The events that send a group its setup guides: a batch is one event, anything else one per unit.
  function applyEvents(g, { how = 'push' } = {}) {
    if (g.scope === 'batch') { const b = B.get(g.id); return [{ item: item.batch(g.id), field: 'applied', before: false, after: true, note: how === 'push' ? `Applied through ${b.via} to all ${b.units.length}` : `Applied by hand in ${b.via}` }]; }
    return toApply(g).map((id) => { const b = B.get(U.get(id).batch); return { item: item.unit(id), field: 'applied', before: false, after: true, note: `${how === 'push' ? 'Applied' : 'Applied by hand'}: ${b?.cfg ? `${b.cfg.name} ${b.cfg.version}` : 'the setup guide'} through ${b?.via ?? 'device management'}, with ${g.title}` }; });
  }

  // ---- Band figures ----
  function figures() {
    const nd = needs().filter((x) => !x.quiet).length;
    const toAccept = plan.units.reduce((n, u) => n + u.steps.filter((s) => stepOf(u.id, s).st === 'verified').length, 0);
    const setUp = plan.units.filter((u) => unitSetUp(u.id)).length;
    const signed = plan.rooms.filter((r) => rs(r.id).signed).length;
    return { needs: nd, toAccept, setUp, units: plan.units.length, signed, rooms: plan.rooms.length };
  }

  const agents = () => io.agents?.() ?? stage() >= 6;
  return { agents, plan, P, U, B, R, LABEL, DONE_W, item, baseOf, us, bs, rs, acc, fresh, checks, issueOf, issuesOf, stepOf, unitSteps, unitSetUp, batchSum, roomSum, needs, readyGroups, figures, nameOf, setupOf, hostOnline, stage, seeOn, Z, groupsBy, groupSum, groupAnswer, unitAnswer, unitStatus, unitWord, worstOf, unitLabel, evidenceOf, acceptSummary, acceptEvent, itemOfGroup, toApply, toConfirm, applyEvents, issuePhrase };
}

// ---- Markup, shared by the build and the browser ----
const TICK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="ig-t" d="M4.2 8.4l2.5 2.5 5.1-5.3"/><path class="ig-x" d="M8 4.6v4.2M8 11.2v.2"/></svg>';
export const glyph = (st) => `<span class="ig" data-st="${st}" aria-hidden="true">${TICK}</span>`;

// A step cell in a unit row: a glyph that eases between states, a word and who or what said so.
export function cellHtml(M, uid, step) {
  const x = M.stepOf(uid, step), u = M.U.get(uid);
  if (x.st === 'na') return `<span class="ic na" data-cell="${esc(uid)}|${step}" data-st="na"><span class="ic-l">Not needed</span></span>`;
  return `<button type="button" class="ic" data-help="integrate.cell" data-help-name="${esc(M.LABEL[step])}" data-cell="${esc(uid)}|${step}" data-st="${x.st}" aria-label="${esc(`${M.LABEL[step]}, ${u.name}: ${x.label}${x.sub ? `, ${x.sub}` : ''}`)}">${glyph(x.st)}<span class="ic-w"><span class="ic-l">${esc(x.label)}</span><span class="ic-s">${esc(x.sub)}</span></span></button>`;
}
// A batch's progress: one small segment per unit for each step, and the count.
export function metersHtml(M, bid) {
  const b = M.B.get(bid), sum = M.batchSum(bid);
  return b.steps.map((step) => {
    const xs = sum.per[step], n = xs.filter((x) => x.st === 'done' || x.st === 'verified').length, t = xs.filter((x) => x.st !== 'na').length;
    return `<div class="im" data-meter="${step}"><span class="im-h"><span>${esc(M.LABEL[step])}</span><b class="num" data-meter-n>${n}/${t}</b></span><span class="im-segs">${xs.map((x, i) => `<i data-seg="${esc(b.units[i])}" data-st="${x.st}"></i>`).join('')}</span></div>`;
  }).join('');
}
// The one line at the foot of a batch or room card: what it needs next.
export function batchFootHtml(M, bid) {
  const s = M.batchSum(bid);
  if (s.status === 'needs') return `<span class="bf needs"><i class="nd-dot"></i>${plural(new Set(s.issues.map((z) => z.id)).size, 'unit is', 'units are')} ready for you</span>`;
  if (s.status === 'accept') return `<span class="bf accept">${glyph('verified')}${plural(new Set(s.ready.map((z) => z.id)).size, 'unit')} checked, ready to accept</span>`;
  if (s.status === 'done') return `<span class="bf done">${glyph('done')}All ${s.total} set up and accepted</span>`;
  return `<span class="bf">${s.done} of ${s.total} set up</span>`;
}
export function roomFootHtml(M, rid) {
  const s = M.roomSum(rid);
  if (s.signed) return `<span class="bf done">${glyph('done')}Commissioned</span>`;
  if (s.failed.length) return `<span class="bf needs"><i class="nd-dot"></i>Room test: ${plural(s.failed.length, 'failure')}</span>`;
  if (s.issues.length) return `<span class="bf needs"><i class="nd-dot"></i>${plural(new Set(s.issues.map((z) => z.id)).size, 'unit is', 'units are')} ready for you</span>`;
  if (s.ready) return `<span class="bf accept">${glyph('verified')}Ready for the room test</span>`;
  return `<span class="bf">${s.setUp} of ${s.total} set up, then the room test</span>`;
}
// Each unit in a room, as a chip with the glyph of where it has got to.
export function roomChipsHtml(M, rid) {
  const r = M.R.get(rid);
  return r.units.map((id) => {
    const u = M.U.get(id), xs = M.unitSteps(id);
    const worst = xs.find((x) => x.st === 'issue') ?? xs.find((x) => x.st === 'blocked') ?? xs.find((x) => x.st !== 'done' && x.st !== 'verified') ?? xs.find((x) => x.st === 'verified') ?? xs[0];
    return `<span class="rchip" data-chip="${esc(id)}" data-st="${worst?.st ?? 'na'}" title="${esc(`${u.short}: ${worst?.label ?? ''}`)}">${glyph(worst?.st ?? 'na')}${esc(u.short)}</span>`;
  }).join('');
}

// The "Needs you" list.
export function needsHtml(M, { room = null, batch = null, limit = 0 } = {}) {
  let list = M.needs();
  if (room) list = list.filter((x) => x.room === room);
  if (batch) list = list.filter((x) => x.batch === batch);
  if (!list.length) return `<p class="nd-none">${glyph('done')}<span>Nothing is ready for you${room || batch ? ' here' : ''}. Keia Atlas keeps checking ${room || batch ? 'these units' : `all ${M.plan.units.length} units`}.</span></p>`;
  const shown = limit ? list.slice(0, limit) : list;
  const base = M.plan.base;
  return `<ul class="nd-list">${shown.map((x) => {
    const where = x.u ? `<a href="${esc(`${base}${M.U.get(x.u).batch}/#u=${encodeURIComponent(x.u)}`)}">${esc(x.where)}</a>` : x.room ? `<a href="${esc(`${base}room/${x.room}/`)}">${esc(x.where)}</a>` : esc(x.where);
    const btn = x.act === 'recheck' ? `<button type="button" class="btn small" data-help="integrate.fix" data-act="recheck" data-u="${esc(x.u)}" data-f="${esc(x.field)}">Recheck</button>`
      : x.act === 'update' ? `<button type="button" class="btn small" data-help="integrate.fix" data-act="update" data-u="${esc(x.u)}">Update the firmware</button>`
      : x.act === 'reapply' ? `<button type="button" class="btn small" data-help="integrate.fix" data-act="reapply" data-u="${esc(x.u)}">Reapply</button>`
      : x.act === 'host' ? `<form class="nd-host" data-act-form="host" data-u="${esc(x.u)}"><input name="host" aria-label="Hostname" placeholder="Hostname" required autocomplete="off" spellcheck="false" /><button class="btn small" data-help="integrate.fix">Save</button></form>`
      : x.act === 'room' ? `<a class="btn small ghost" href="${esc(`${base}room/${x.room}/`)}">Open the room test</a>`
      : x.act === 'task' ? `<a class="btn small ghost" href="${esc(x.href)}">Open the task</a>` : '';
    return `<li class="nd${x.quiet ? ' quiet' : ''}" data-k="${esc(x.k)}" data-help="integrate.need"><i class="nd-dot" aria-hidden="true"></i><div class="nd-b"><p class="nd-w">${where}</p><p class="nd-t">${esc(x.t)}</p><p class="nd-f">${esc(x.fix)}</p></div><div class="nd-a">${btn}</div></li>`;
  }).join('')}</ul>${limit && list.length > limit ? `<p class="nd-more faint">and ${list.length - limit} more below</p>` : ''}`;
}
// The "Checked by Keia Atlas" list: what passed and waits for a person to accept, one action each.
export function readyHtml(M, { by = 'batch', only = null, set = null } = {}) {
  let groups = M.readyGroups(by, { set });
  if (only) groups = groups.filter((g) => g.id === only);
  if (!groups.length) {
    return `<p class="rd-none">${M.seeOn() ? 'Nothing waiting. When units pass their checks, they gather here for you to accept in one go.' : 'Once real feeds replace the simulation, Keia Atlas checks the systems and gathers what passed here. Until then, mark each step done by hand.'}</p>`;
  }
  const total = groups.reduce((n, g) => n + g.keys.length, 0), unitsN = new Set(groups.flatMap((g) => g.keys.map((k) => k.split('|')[0]))).size;
  const rows = groups.map((g) => `<li class="rd" data-k="${esc(`${g.scope}:${g.id}`)}" data-help="integrate.ready"><div class="rd-b"><p class="rd-t">${glyph('verified')}<b>${esc(g.head)}</b></p><p class="rd-e">${esc(g.ev)}. ${plural(g.checksN, 'check')} passed${g.left ? `; ${plural(g.left, 'exception')} left out` : ''}.</p></div><button type="button" class="btn small primary" data-help="integrate.accept" data-act="accept" data-scope="${esc(g.scope)}" data-id="${esc(g.id)}">${g.all && g.n > 1 ? `Accept all ${g.n}` : 'Accept'}</button></li>`).join('');
  const allBtn = !only && groups.length > 1 ? `<div class="rd-all"><span>${plural(unitsN, 'unit')}, ${plural(total, 'step')} checked in all</span><button type="button" class="btn small" data-help="integrate.accept-all" data-act="accept" data-scope="project" data-id="all">Accept everything that passed</button></div>` : '';
  return `<ul class="rd-list">${rows}</ul>${allBtn}`;
}

// A unit's full detail, only when asked for: every check with what the systems hold.
export function unitDetailHtml(M, uid) {
  const u = M.U.get(uid), s = M.us(uid);
  const cols = u.steps.map((step) => {
    const x = M.stepOf(uid, step);
    const rows = (x.cs ?? []).map((c) => `<li class="ud-c" data-ok="${c.ok === null ? 'na' : c.ok ? 'yes' : 'no'}">${glyph(c.ok === null ? 'todo' : c.ok ? 'verified' : x.st === 'issue' ? 'issue' : 'todo')}<span><b>${esc(c.t)}</b>${c.sys ? `<small>${esc(c.sys)}</small>` : ''}<small class="ud-f">${esc(c.ok ? (c.found || c.exp) : c.found)}</small></span></li>`).join('');
    const why = x.why ? `<p class="ud-why">"${esc(x.why)}"</p>` : '';
    const btn = x.st === 'done' || x.st === 'verified'
      ? `<button type="button" class="btn small ghost" data-help="integrate.untick" data-act="untick" data-u="${esc(uid)}" data-step="${step}">Untick</button>`
      : x.st === 'issue' ? '' : `<button type="button" class="btn small ghost" data-help="integrate.tick" data-act="tick" data-u="${esc(uid)}" data-step="${step}">Mark ${esc(M.DONE_W[step].toLowerCase())}</button>`;
    return `<section class="ud-s"><h4>${glyph(x.st)}${esc(M.LABEL[step])}<small>${esc(x.label)}${x.sub ? ` · ${esc(x.sub)}` : ''}</small></h4><ul class="ud-l">${rows}</ul>${why}<p class="ud-b">${btn}</p></section>`;
  }).join('');
  const bits = [u.modelName, s.host ? `<span class="mono">${esc(s.host)}</span>` : null, u.tag ? `<span class="mono">${esc(u.tag)}</span>` : null, s.serial ? `Serial <span class="mono">${esc(s.serial)}</span>` : null, s.photo ? `Photo: ${esc(s.photo)}` : null].filter(Boolean);
  const links = [u.sheet ? `<a href="${esc(u.sheet)}" data-help="integrate.sheet-open">Build sheet</a>` : '', u.link ? `<a href="${esc(u.link)}">The unit</a>` : '', ...Object.values(u.tasks ?? {}).map((t) => `<a href="${esc(t.href)}">${esc(t.id)} ${esc(t.title)}</a>`)].filter(Boolean).join('');
  const b = M.B.get(u.batch);
  const own = (b?.differ ?? []).map((d) => `<div><dt>${esc(d.t)}</dt><dd>${esc(d.t === 'Device Name' || d.t === 'Host Name' ? (s.host ?? d.vals[uid]) : d.vals[uid])}</dd></div>`).join('');
  return `<div class="ud-top"><p class="ud-meta">${bits.join(' · ')}</p><p class="ud-links">${links}<button type="button" class="btn small ghost" data-help="live.history" data-act="history" data-u="${esc(uid)}">History</button></p></div>${own ? `<dl class="ud-own" data-help="integrate.own">${own}</dl>` : ''}<div class="ud-grid">${cols}</div>`;
}

// ---- A build sheet row's check (src/lib/buildsheet.mjs gives each row { step, rec }) ----
// What Keia Atlas has seen for this one setting: the record it checks (the asset register, DNS, device
// management, the calendar, firmware), the unit online on its port, or the settings read back. A drift names
// the one setting that differs; nothing else on the sheet is marked as needing a person for it.
const ISSUE_REC = { dns: 'infodns', fw: 'firmware', host: 'infodns', offline: 'online' };
export function sheetCheck(M, uid, ck, name = '') {
  const u = M.U.get(uid);
  if (!u || !ck || !u.steps.includes(ck.step)) return { st: 'na', label: 'Not checked' };
  const x = M.stepOf(uid, ck.step);
  if (!M.seeOn() && x.st !== 'done') return { st: 'todo', label: 'Not checked yet' };
  if (ck.step === 'configure') {
    const s = M.us(uid);
    if (s.drift) {
      const what = String(s.drift).split(':')[0].toLowerCase();
      if (what && String(name).toLowerCase().includes(what)) return { st: 'issue', label: 'Differs' };
    }
    if (x.st === 'done') return { st: 'done', label: x.acc ? 'Accepted' : 'Confirmed' };
    if (x.st === 'verified' || (x.st === 'issue' && s.read)) return { st: 'verified', label: 'Read back' };
    if (!u.readable) return { st: 'todo', label: 'Confirm by hand' };
    if (x.st === 'blocked') return { st: 'blocked', label: 'Waiting on' };
    return { st: x.st === 'doing' ? 'doing' : 'todo', label: 'Not read back yet' };
  }
  const c = (x.cs ?? []).find((y) => y.id === ck.rec) ?? (x.cs ?? [])[0] ?? null;
  const issue = x.st === 'issue' && M.issuesOf(u, ck.step).some((i) => ISSUE_REC[i.kind] === (ck.rec ?? c?.id));
  if (issue) return { st: 'issue', label: 'Ready for you' };
  if (!c) return { st: x.st, label: x.label };
  if (c.ok === null) return x.st === 'done' ? { st: 'done', label: 'Confirmed' } : { st: 'todo', label: 'Confirm by hand' };
  if (c.ok) return x.st === 'done' ? { st: 'done', label: 'Accepted' } : { st: 'verified', label: 'Seen' };
  return { st: x.st === 'blocked' ? 'blocked' : 'todo', label: 'Not seen yet' };
}
export function sheetCkHtml(M, uid, ck, name) {
  const c = sheetCheck(M, uid, ck, name);
  return `<span class="bs-ck" data-sck="${esc(uid)}" data-sck-step="${esc(ck?.step ?? '')}" data-sck-rec="${esc(ck?.rec ?? '')}" data-sck-t="${esc(name)}" data-st="${c.st}">${glyph(c.st)}<span class="bs-ckl">${esc(c.label)}</span></span>`;
}

// The shared setup of a batch: done once for every unit.
export function sharedHtml(M, bid) {
  const b = M.B.get(bid), st = M.bs(bid);
  const configurable = b.steps.includes('configure');
  if (!configurable) return `<p class="sh-none">Nothing to set on these: once they are provisioned and installed, they are ready for the room test.</p>`;
  const agents = M.agents();
  const reachable = b.units.filter((id) => { const u = M.U.get(id); return (u.networked ? M.us(id).online : true) && M.hostOnline(u); }).length;
  let status, acts = '';
  if (!b.readable) {
    status = `<p class="sh-st">${glyph('todo')}<span><b>Set on each unit by hand</b> ${esc(b.via ?? '')}. Keia Atlas cannot read these back, so a person confirms them.</span></p>`;
    const left = b.units.filter((id) => !['done', 'verified'].includes(M.stepOf(id, 'configure').st));
    if (left.length) acts = `<button type="button" class="btn primary" data-help="integrate.confirm-all" data-act="confirm" data-id="${esc(bid)}">Confirm all ${left.length} set</button>`;
  } else if (st.applied) {
    const seen = b.units.filter((id) => ['verified', 'done'].includes(M.stepOf(id, 'configure').st)).length;
    status = `<p class="sh-st">${glyph(seen === b.units.length ? 'done' : 'doing')}<span><b>Setup guide applied</b> through ${esc(b.via)}. Read back from ${seen} of ${b.units.length}${reachable < b.units.length ? `; the other ${b.units.length - reachable} ${b.units.length - reachable === 1 ? 'takes it' : 'take it'} when ${b.units.length - reachable === 1 ? 'it' : 'they'} can be reached` : ''}.</span></p>`;
  } else if (agents && st.prepared) {
    status = `<div class="sh-agent" data-help="integrate.agent"><p class="sh-ah">Prepared by the setup guide agent</p><p>One run for all ${plural(b.units.length, 'unit')} through ${esc(b.via)}: ${b.settings ? `${b.settings.set} settings to set and ${b.settings.verify} to check` : 'its settings'}, plus each unit's own name and address. Nothing has changed on any unit yet.</p><p class="faint">Agents only propose. A person applies it, then accepts what Keia Atlas reads back.</p></div>`;
    acts = `<button type="button" class="btn primary" data-help="integrate.apply-agent" data-act="apply" data-id="${esc(bid)}" data-via="agent">Apply the prepared run</button><button type="button" class="btn ghost" data-act="discard" data-id="${esc(bid)}">Discard</button>`;
  } else if (agents && st.handed) {
    status = `<p class="sh-st">${glyph('doing')}<span><b>With the setup guide agent</b>. It is preparing the run; nothing changes until a person applies it.</span></p>`;
  } else {
    status = `<p class="sh-st">${glyph('todo')}<span><b>Not applied yet.</b> One setup guide sets the shared settings on all ${b.units.length}${reachable < b.units.length ? `; ${reachable} can take it now, the rest when they can be reached` : ''}.</span></p>`;
    acts = `<button type="button" class="btn primary" data-help="integrate.apply" data-act="apply" data-id="${esc(bid)}" data-via="${M.stage() >= 4 ? 'push' : 'hand'}">${M.stage() >= 4 ? `Apply to all ${b.units.length}` : 'I have applied it'}</button>` +
      (agents ? `<button type="button" class="btn ghost" data-help="integrate.hand" data-act="handoff" data-id="${esc(bid)}">Hand to the agent</button>` : '');
  }
  acts += `<button type="button" class="btn ghost" data-help="live.history" data-act="history-batch" data-id="${esc(bid)}">History</button>`;
  return `${status}<div class="sh-acts">${acts}</div>`;
}

// The setup order as a stepper: the next step open, the rest one line each, the reason behind "Why".
export function setupHtml(M, bid) {
  const b = M.B.get(bid), bst = M.bs(bid);
  if (!b.setup.length) return '';
  const unitsC = b.units.filter((id) => M.U.get(id).steps.includes('configure'));
  const doneFor = (s) => unitsC.filter((id) => bst[`su-${s.id}`] || M.us(id)[`su-${s.id}`]).length;
  const nextI = b.setup.findIndex((s) => doneFor(s) < unitsC.length);
  return `<ol class="su">${b.setup.map((s, i) => {
    const n = doneFor(s), all = n === unitsC.length, open = i === nextI;
    const chips = unitsC.map((id) => { const on = Boolean(bst[`su-${s.id}`] || M.us(id)[`su-${s.id}`]); const u = M.U.get(id); return `<button type="button" class="su-chip${on ? ' on' : ''}" data-help="integrate.su-unit" data-act="su" data-u="${esc(id)}" data-s="${esc(s.id)}" aria-pressed="${on}">${glyph(on ? 'done' : 'todo')}${esc(u.roomName)}</button>`; }).join('');
    return `<li class="su-i${all ? ' all' : ''}${open ? ' open' : ''}" data-su="${esc(s.id)}"><details${open ? ' open' : ''}><summary data-help="integrate.su-step">${glyph(all ? 'done' : n ? 'doing' : 'todo')}<span class="su-n num">${s.n}</span><span class="su-t">${esc(s.t)}${s.first ? '<i class="su-first" title="Do this before the steps that follow it"></i>' : ''}</span><span class="su-c num">${n}/${unitsC.length}</span></summary>` +
      `<div class="su-body">${s.path ? `<p class="su-path mono">${esc(s.path)}</p>` : ''}${s.detail ? `<p>${esc(s.detail)}</p>` : ''}${s.first ? '<p class="su-note">Do this before the steps after it.</p>' : ''}${s.why ? `<details class="su-why"><summary>Why this order</summary><p>${esc(s.why)}</p></details>` : ''}<div class="su-chips">${chips}${all ? '' : `<button type="button" class="btn small ghost" data-help="integrate.su-all" data-act="su-all" data-id="${esc(bid)}" data-s="${esc(s.id)}">Done on all ${unitsC.length}</button>`}</div></div></details></li>`;
  }).join('')}</ol>`;
}

// The room test: one line each, Pass or Fail, "All passed" in one tap.
export function testsHtml(M, rid) {
  const s = M.roomSum(rid);
  const rows = s.tests.map((t) => {
    const r = t.res?.r ?? null;
    return `<li class="rt${r ? ` ${r}` : ''}" data-test="${esc(t.id)}" data-help="integrate.test"><div class="rt-b">${glyph(r === 'pass' ? 'done' : r === 'fail' ? 'issue' : 'todo')}<span><b>${esc(t.t)}</b><small>${esc(t.how)}</small>${r === 'fail' && t.res.note ? `<small class="rt-note">"${esc(t.res.note)}"</small>` : ''}</span></div>` +
      `<div class="rt-a" role="group" aria-label="${esc(t.t)}"><button type="button" class="rt-btn" data-act="test" data-id="${esc(rid)}" data-t="${esc(t.id)}" data-r="pass" aria-pressed="${r === 'pass'}">Pass</button><button type="button" class="rt-btn" data-act="test" data-id="${esc(rid)}" data-t="${esc(t.id)}" data-r="fail" aria-pressed="${r === 'fail'}">Fail</button></div>` +
      `<form class="rt-fail" data-act-form="fail" data-id="${esc(rid)}" data-t="${esc(t.id)}" hidden><input name="note" placeholder="What went wrong?" aria-label="What went wrong" required /><button class="btn small">Save</button><button type="button" class="btn small ghost" data-act="fail-cancel">Cancel</button></form></li>`;
  }).join('');
  let foot;
  if (s.signed) {
    foot = `<p class="rt-signed">${glyph('done')}<span><b>Commissioned.</b> Signed off by ${esc(first(M.nameOf(s.st.signed?.w ?? null)))}${s.st.signed?.at ? `, ${esc(new Date(s.st.signed.at).toLocaleString('en-IE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}` : ''}${s.st.signed?.n ? `: ${esc(s.st.signed.n)}` : ''}.</span><button type="button" class="btn small ghost" data-act="history-room" data-id="${esc(rid)}">History</button></p>`;
  } else if (!s.ready) {
    foot = `<p class="rt-wait">${glyph('todo')}<span>Ready once every unit is set up: ${s.setUp} of ${s.total} so far. You can still note results as you go.</span></p>`;
  } else if (s.failed.length) {
    foot = `<p class="rt-wait">${glyph('issue')}<span>${plural(s.failed.length, 'test')} failed. Fix ${s.failed.length === 1 ? 'it' : 'them'}, then select Pass; it shows under Ready for you until then.</span></p>`;
  } else if (s.passed === s.tests.length) {
    foot = `<div class="rt-go"><button type="button" class="btn primary" data-help="integrate.sign" data-act="sign" data-id="${esc(rid)}">Sign off the space</button><span class="faint">Every test passed.</span></div>`;
  } else {
    foot = `<div class="rt-go"><button type="button" class="btn primary" data-help="integrate.all-passed" data-act="all-passed" data-id="${esc(rid)}">All passed</button><span class="faint">Records every test as passed and signs the space off. A failure: select Fail on just that test.</span></div>`;
  }
  return `<ul class="rt-list">${rows}</ul>${foot}`;
}

// ---- Deliver by: the board ----
// Every way of delivering draws the same unit rows (keyed data-vk="u:<id>"), so switching moves each row to its
// new group (km.regroup) instead of swapping the page. The rows keep their order while live changes arrive
// (M10); the order (exceptions first) is set when the board is drawn.
export const DELIVER_BY = [
  { by: 'type', label: 'Device type', short: 'Type', what: 'Batches of units that share a setup guide, set up together' },
  { by: 'room', label: 'Room', short: 'Room', what: 'Each space\'s units set up and checked together, then its room test' },
  { by: 'floor', label: 'Floor or zone', short: 'Floor', what: 'Spaces grouped by floor, or by side of the floor, for a fit-out' },
  { by: 'one', label: 'One at a time', short: 'One', what: 'A single queue: the next unit, its build sheet and checks, then Next' },
  { by: 'set', label: 'Custom set', short: 'Set', what: 'Units you pick and name, worked as one batch' },
];
export const DELIVER_WORD = Object.fromEntries(DELIVER_BY.map((d) => [d.by, d.label]));
const ST_RANK = { needs: 0, accept: 1, doing: 2, todo: 3, done: 4 };
const DOT_WORD = { todo: 'To do', doing: 'Under way', verified: 'Checked', done: 'Accepted', issue: 'Ready for you', blocked: 'Waiting on', na: 'Not needed' };

// One unit's row. How it is named depends on the group: by space in a batch, by kind in a space, both elsewhere.
export function unitRowHtml(M, uid, g, { one = false } = {}) {
  const u = M.U.get(uid), xs = M.unitSteps(uid), w = M.worstOf(xs), st = M.unitStatus(uid);
  const inRoom = g.scope === 'room' || g.scope === 'zone';
  const name = g.scope === 'batch' ? u.roomName : inRoom ? u.short : M.unitLabel(u);
  const sub = [g.scope === 'batch' ? u.short : u.modelName?.replace(/\s*\([^)]*\)\s*$/, ''), u.host].filter(Boolean).join(' · ');
  const word = M.unitWord(uid);
  const dots = u.steps.map((s, i) => `<span class="dv-dot" data-dot="${s}" data-st="${xs[i].st}" title="${esc(`${M.LABEL[s]}: ${DOT_WORD[xs[i].st] ?? xs[i].label}`)}">${glyph(xs[i].st)}</span>`).join('');
  const to = `${M.plan.base}${u.batch}/#u=${encodeURIComponent(uid)}`;
  return `<li class="dv-u" data-vk="u:${esc(uid)}" data-urow="${esc(uid)}" data-st="${st}" data-fi data-find="${esc([u.name, u.roomName, u.short, u.host, u.modelName, u.clsName].filter(Boolean).join(' '))}" data-f-site="${esc(u.site)}" data-f-kind="${esc(u.cls)}" data-f-status="${st}" data-f-room="${esc(u.room)}" data-help="integrate.unit-row">` +
    `<a class="dv-ub" href="${esc(to)}"${one ? ` data-act="one-pick" data-u="${esc(uid)}"` : ''}>${glyph(w?.st ?? 'todo')}<span class="dv-un"><b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></a>` +
    `<span class="dv-uw" data-uword>${esc(word)}</span><span class="dv-dots" aria-hidden="true">${dots}</span></li>`;
}
// A group's progress per step: one segment per unit (a single bar past 24 units), and the room tests.
export function groupMetersHtml(M, g) {
  const steps = USTEPS.filter((s) => g.units.some((id) => M.U.get(id).steps.includes(s)));
  const meter = (label, key, sts) => {
    const n = sts.filter((s) => s === 'done' || s === 'verified').length, t = sts.filter((s) => s !== 'na').length;
    const body = sts.length > 24
      ? (() => { const pc = (k) => (100 * sts.filter((s) => s === k).length) / Math.max(1, t); return `<span class="im-bar"><i data-st="done" style="width:${pc('done').toFixed(1)}%"></i><i data-st="verified" style="width:${pc('verified').toFixed(1)}%"></i><i data-st="issue" style="width:${pc('issue').toFixed(1)}%"></i><i data-st="doing" style="width:${pc('doing').toFixed(1)}%"></i></span>`; })()
      : `<span class="im-segs">${sts.map((s) => `<i data-st="${s}"></i>`).join('')}</span>`;
    return `<div class="im" data-meter="${key}"><span class="im-h"><span>${esc(label)}</span><b class="num">${n}/${t}</b></span>${body}</div>`;
  };
  const out = steps.map((s) => meter(M.LABEL[s], s, g.units.map((id) => M.stepOf(id, s).st)));
  if (g.scope === 'room' || g.scope === 'zone') {
    const sts = (g.rooms ?? []).map((rid) => { const r = M.roomSum(rid); return r.signed ? 'done' : r.failed.length ? 'issue' : r.passed ? 'doing' : r.ready ? 'verified' : 'todo'; });
    out.push(meter(g.scope === 'room' ? 'Room test' : 'Room tests', 'commission', sts).replace(/<b class="num">\d+\/\d+<\/b>/, `<b class="num">${sts.filter((s) => s === 'done').length}/${sts.length}</b>`));
  }
  return out.join('');
}
// What a person can do with the group in view: apply its setup guides, confirm what cannot be read back, accept
// what passed, and open the page that goes deeper.
export function groupActsHtml(M, g) {
  const sum = M.groupSum(g), acts = [];
  const gid = `${g.scope}:${g.id}`;
  const apply = M.toApply(g), confirm = M.toConfirm(g);
  if (apply.length && M.seeOn()) {
    const cfgs = new Set(apply.map((id) => M.B.get(M.U.get(id).batch)?.cfg?.id).filter(Boolean)).size;
    const push = M.stage() >= 4;
    acts.push(`<button type="button" class="btn small" data-help="integrate.group-apply" data-act="g-apply" data-g="${esc(gid)}" data-via="${push ? 'push' : 'hand'}">${push ? `Apply ${cfgs > 1 ? `${cfgs} setup guides` : 'the setup guide'} to ${apply.length}` : `I have applied it (${apply.length})`}</button>`);
  }
  if (confirm.length) acts.push(`<button type="button" class="btn small" data-help="integrate.confirm-all" data-act="g-confirm" data-g="${esc(gid)}">Confirm ${confirm.length} set by hand</button>`);
  if (sum.readyKeys.length) {
    const units = new Set(sum.readyKeys.map((k) => k.split('|')[0])).size;
    const all = sum.checked === sum.total && !sum.issueUnits.length;
    acts.push(`<button type="button" class="btn small primary" data-help="integrate.accept" data-act="g-accept" data-g="${esc(gid)}">${all && units > 1 ? `Accept all ${units}` : `Accept ${plural(sum.readyKeys.length, 'step')} that passed`}</button>`);
  }
  if (g.scope === 'room' && !M.roomSum(g.id).signed && (M.roomSum(g.id).ready || M.roomSum(g.id).failed.length)) acts.push(`<a class="btn small" data-help="integrate.roomtest" href="${esc(`${M.plan.base}room/${g.id}/`)}">Open the room test</a>`);
  return acts.join('');
}
// A space inside a floor group: its name, where its room test stands, then its units.
export function roomTestWord(M, rid) {
  const s = M.roomSum(rid);
  return s.signed ? 'Signed off' : s.failed.length ? `Room test: ${plural(s.failed.length, 'failure')}` : s.ready ? 'Ready for the room test' : s.total === 1 ? 'Room test once its unit is set up' : `Room test once all ${s.total} are set up`;
}
const sortUnits = (M, ids) => [...ids].map((id, i) => ({ id, i, r: ST_RANK[M.unitStatus(id)] })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.id);
export function groupHtml(M, g) {
  const sum = M.groupSum(g);
  const gid = `${g.scope}:${g.id}`;
  // A batch and a space have pages of their own: the title opens it, and flies into its page (M5).
  const to = g.scope === 'batch' ? `${M.plan.base}${g.id}/` : g.scope === 'room' ? `${M.plan.base}room/${g.id}/` : null;
  let body;
  if (g.scope === 'zone') {
    body = (g.rooms ?? []).map((rid) => {
      const r = M.R.get(rid);
      return `<div class="dv-room" data-dvroom="${esc(rid)}"><p class="dv-rh"><a href="${esc(`${M.plan.base}room/${rid}/`)}">${esc(r.name)}</a><span data-rword="${esc(rid)}">${esc(roomTestWord(M, rid))}</span></p><ul class="dv-list">${sortUnits(M, r.units).map((id) => unitRowHtml(M, id, g)).join('')}</ul></div>`;
    }).join('');
  } else if (g.scope === 'queue') {
    body = `<ol class="dv-list dv-queue">${g.units.map((id) => unitRowHtml(M, id, g, { one: true })).join('')}</ol>`;
  } else {
    body = `<ul class="dv-list">${sortUnits(M, g.units).map((id) => unitRowHtml(M, id, g)).join('')}</ul>`;
  }
  const test = g.scope === 'room' ? `<p class="dv-rtest" data-rword="${esc(g.id)}">${esc(roomTestWord(M, g.id))}</p>` : '';
  const vi = g.scope === 'room' ? `<div class="iv-vi" data-vendor-only data-slot="vinstall" data-r="${esc(g.id)}"></div>` : '';
  return `<section class="card dv-g" data-g="${esc(gid)}" data-st="${sum.status}" data-fb-group${g.scope === 'room' ? ` data-rcard="${esc(g.id)}"` : ''} data-help="integrate.group" aria-label="${esc(g.title)}">` +
    `<header class="dv-gh" data-km-chrome>${g.n ? `<span class="iv-n num" aria-hidden="true">${g.n}</span>` : ''}<span class="dv-gt">${to ? `<a class="dv-gl" href="${esc(to)}"${g.scope === 'batch' ? ` data-vt-rec="int-${esc(g.id)}"` : g.scope === 'room' ? ` data-vt-rec="int-r-${esc(g.id)}"` : ''}><b>${esc(g.title)}</b></a>` : `<b>${esc(g.title)}</b>`}${g.sub ? `<small>${esc(g.sub)}</small>` : ''}</span><b class="dv-gc num" data-gcount>${sum.checked}/${sum.total}</b></header>` +
    `<p class="dv-ans" data-gans data-engineer-only data-km-chrome>${esc(M.groupAnswer(g, sum, { bare: true }))}</p>` +
    `<div class="dv-meters" data-gmeters data-engineer-only data-km-chrome>${groupMetersHtml(M, g)}</div>` +
    `<div data-engineer-only>${body}</div>${test}${vi}` +
    `<footer class="dv-acts" data-gacts data-engineer-only data-km-chrome>${groupActsHtml(M, g)}</footer></section>`;
}
// One at a time: the unit in hand, with its build sheet's essentials, its checks and Next.
export function oneHtml(M, uid) {
  const q = M.plan.queue ?? M.plan.units.map((u) => u.id);
  if (!uid) return `<p class="dv-none">${glyph('done')}<span>Every unit is set up and accepted. The room tests are on each space's page.</span></p>`;
  const u = M.U.get(uid), s = M.us(uid), i = q.indexOf(uid);
  const b = M.B.get(u.batch);
  const facts = [
    ['Model', u.modelName], ['Hostname', s.host ?? 'None yet'], ['Address', u.networked ? u.ip : null], ['Switch port', u.port],
    ['Setup guide', b?.cfg ? `${b.cfg.name} ${b.cfg.version}` : 'Nothing to set'], ['Pairs with', u.pairs], ['Where', u.where],
  ].filter(([, v]) => v);
  return `<article class="dv-one" data-one="${esc(uid)}">` +
    `<p class="dv-one-k"><span>Unit ${i + 1} of ${q.length} · ${esc(u.roomName)}</span><button type="button" class="btn small ghost" data-act="one-next" data-help="integrate.one-next">Next unit</button></p>` +
    `<h3 class="dv-one-t">${esc(u.short)}<small>${esc(u.roomName)}</small></h3>` +
    `<p class="dv-ans" data-oans>${esc(M.unitAnswer(uid))}</p>` +
    `<dl class="dv-kvs" data-help="integrate.sheet-unit">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd${/Hostname|Address|Switch/.test(k) ? ' class="mono"' : ''}>${esc(v)}</dd></div>`).join('')}</dl>` +

    `<div class="dv-one-d" data-slot="udetail" data-u="${esc(uid)}">${unitDetailHtml(M, uid)}</div>` +
    `</article>`;
}
export function oneActsHtml(M, uid) {
  if (!uid) return '';
  const g = { scope: 'unit', id: uid, title: M.unitLabel(M.U.get(uid)), units: [uid] };
  const acts = [];
  const apply = M.toApply(g), ready = M.U.get(uid).steps.filter((s) => M.stepOf(uid, s).st === 'verified');
  if (apply.length && M.seeOn()) acts.push(`<button type="button" class="btn" data-help="integrate.group-apply" data-act="g-apply" data-g="unit:${esc(uid)}" data-via="${M.stage() >= 4 ? 'push' : 'hand'}">${M.stage() >= 4 ? 'Apply its setup guide' : 'I have applied it'}</button>`);
  if (ready.length) acts.push(`<button type="button" class="btn primary" data-help="integrate.accept" data-act="g-accept" data-g="unit:${esc(uid)}">Accept ${plural(ready.length, 'step')} that passed</button>`);
  acts.push(`<button type="button" class="btn${ready.length ? '' : ' primary'} dv-next" data-help="integrate.one-next" data-act="one-next">Next unit</button>`);
  return acts.join('');
}

// The unit One at a time opens on: the one asked for, else the first in the queue not yet set up and accepted.
export function nextInQueue(M, after = null) {
  const q = M.plan.queue ?? M.plan.units.map((u) => u.id);
  const open = (id) => !M.unitSteps(id).every((x) => x.st === 'done');
  const i = after ? q.indexOf(after) : -1;
  return q.slice(i + 1).find(open) ?? q.slice(0, Math.max(0, i + 1)).find(open) ?? null;
}
const GROUP_RANK = { needs: 0, accept: 1, test: 2, doing: 3, todo: 4, done: 5 };
export function boardGroups(M, by, { set = null, sort = 'order' } = {}) {
  const gs = M.groupsBy(by, { set });
  if (sort === 'needs') return gs.map((g, i) => ({ g, i, r: GROUP_RANK[M.groupSum(g).status] ?? 9 })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.g);
  if (sort === 'name') return [...gs].sort((a, b) => a.title.localeCompare(b.title));
  return gs;
}
// The whole board for one way of delivering.
export function boardHtml(M, by, { set = null, sort = 'order', at = null } = {}) {
  if (by === 'one') {
    const cur = at && M.U.has(at) ? at : nextInQueue(M);
    const q = M.groupsBy('one')[0];
    return `<div class="dv-board dv-oneboard" data-by="one"><section class="card dv-cur" aria-label="The unit in hand" data-help="integrate.one" data-km-chrome><div data-slot="one" data-u="${esc(cur ?? '')}">${oneHtml(M, cur)}</div><footer class="dv-one-acts" data-oacts>${oneActsHtml(M, cur)}</footer></section>${groupHtml(M, q)}</div>`;
  }
  const gs = boardGroups(M, by, { set, sort });
  return `<div class="dv-board" data-by="${esc(by)}"><div class="dv-groups">${gs.map((g) => groupHtml(M, g)).join('')}</div></div>`;
}
// The custom set picker, and the form that makes or changes one. Sets are kept in this browser only.
export function setBarHtml(M, sets, active) {
  const chips = sets.map((s) => `<button type="button" class="dv-chip" data-act="set-pick" data-set="${esc(s.id)}" aria-pressed="${s.id === active}">${esc(s.name)}<small class="num">${s.units.filter((id) => M.U.has(id)).length}</small></button>`).join('');
  return `<div class="dv-setbar" role="group" aria-label="Your sets" data-help="integrate.set">${chips}<button type="button" class="btn small ghost" data-act="set-new" data-help="integrate.set-new">New set</button>${active ? `<button type="button" class="btn small ghost" data-act="set-edit">Change this set</button>` : ''}<span class="dv-setnote faint">Sets are yours, kept in this browser. What you accept in one is recorded for everyone.</span></div>`;
}
export function setFormHtml(M, draft) {
  const has = new Set(draft.units);
  const kinds = [...new Set(M.plan.units.map((u) => u.cls))].map((c) => ({ k: `kind:${c}`, label: M.plan.units.find((u) => u.cls === c).clsName, ids: M.plan.units.filter((u) => u.cls === c).map((u) => u.id) }));
  const rooms = M.plan.rooms.filter((r) => r.units.length).map((r) => ({ k: `room:${r.id}`, label: r.name, ids: r.units }));
  const status = [['needs', 'Ready for you'], ['accept', 'Checked, to accept'], ['todo', 'Not started']].map(([v, label]) => ({ k: `status:${v}`, label, ids: M.plan.units.filter((u) => M.unitStatus(u.id) === v).map((u) => u.id) })).filter((x) => x.ids.length);
  const chip = (x) => `<button type="button" class="dv-chip" data-act="set-add" data-ids="${esc(x.ids.join(' '))}" aria-pressed="${x.ids.every((id) => has.has(id))}">${esc(x.label)}<small class="num">${x.ids.length}</small></button>`;
  const byRoom = M.plan.rooms.filter((r) => r.units.length).map((r) => `<fieldset class="dv-setroom"><legend>${esc(r.name)}</legend>${r.units.map((id) => { const u = M.U.get(id); return `<label class="dv-pick"><input type="checkbox" name="u" value="${esc(id)}"${has.has(id) ? ' checked' : ''} /><span>${esc(u.short)}${u.host ? `<small class="mono">${esc(u.host)}</small>` : ''}</span></label>`; }).join('')}</fieldset>`).join('');
  return `<form class="card dv-setform" data-act-form="set" data-help="integrate.set-new">` +
    `<div class="dv-sf-top"><label class="dv-sf-name"><span>Name the set</span><input name="name" value="${esc(draft.name)}" required maxlength="60" autocomplete="off" /></label><p class="dv-sf-n"><b class="num" data-set-n>${has.size}</b> units chosen</p></div>` +
    `<div class="dv-sf-by"><p class="dv-sf-h">Add or take out by kind of device</p><div class="dv-chips">${kinds.map(chip).join('')}</div></div>` +
    `<div class="dv-sf-by"><p class="dv-sf-h">By space</p><div class="dv-chips">${rooms.map(chip).join('')}</div></div>` +
    (status.length ? `<div class="dv-sf-by"><p class="dv-sf-h">By where they stand</p><div class="dv-chips">${status.map(chip).join('')}</div></div>` : '') +
    `<details class="dv-sf-hand"><summary>Pick units by hand</summary><div class="dv-setrooms">${byRoom}</div></details>` +
    `<div class="dv-sf-acts"><button class="btn primary">Save the set</button><button type="button" class="btn ghost" data-act="set-cancel">Cancel</button>${draft.id ? `<button type="button" class="btn ghost dv-sf-del" data-act="set-delete" data-set="${esc(draft.id)}">Delete this set</button>` : ''}</div></form>`;
}

// Words for the History drawer (and anything else that lists changes).
export function describe(M, e) {
  const m = /^int:[^:]+:(.+):(unit|batch|room|zone|project)$/.exec(e.item) ?? [];
  const kind = m[2], id = m[1];
  const f = e.field, on = e.after;
  const u = kind === 'unit' ? M.U.get(id) : null;
  let t;
  if (f === 'accepted') { const n = Object.keys(on ?? {}).length - Object.keys(e.before ?? {}).length; t = n >= 0 ? `Accepted ${plural(n, 'step')}` : `Took back ${plural(-n, 'accepted step')}`; }
  else if (f === 'online') t = on ? 'Seen online' : 'Went offline';
  else if (f === 'read') t = on ? 'Settings read back' : 'Settings not read back';
  else if (f === 'drift') t = on ? `Drift found: ${on}` : 'Drift cleared';
  else if (f === 'dnsOk') t = on ? 'DNS points at the new unit' : 'DNS points at the old unit';
  else if (f === 'fwOk') t = on ? 'Firmware at the standard' : 'Firmware older than the standard';
  else if (f === 'installed') t = on ? 'Marked installed' : 'Took back installed';
  else if (f === 'host') t = `Hostname set to ${on}`;
  else if (f === 'serial') t = `Serial recorded: ${on}`;
  else if (f === 'photo') t = `Photo added: ${on}`;
  else if (/^x-/.test(f)) { const st = f.slice(2), v = on?.v; t = v === true ? `Marked ${(M.DONE_W[st] ?? st).toLowerCase()}${on.n ? `: ${on.n}` : ''}` : v === false ? `Unticked ${(M.LABEL[st] ?? st).toLowerCase()}${on.n ? `: ${on.n}` : ''}` : `Cleared the tick on ${(M.LABEL[st] ?? st).toLowerCase()}`; }
  else if (/^su-/.test(f)) { const b = kind === 'batch' ? M.B.get(id) : u ? M.B.get(u.batch) : null; const s = b?.setup.find((x) => `su-${x.id}` === f); t = `${on ? 'Ticked' : 'Unticked'} setup step "${s?.t ?? f.slice(3)}"${kind === 'batch' ? ' on every unit' : ''}`; }
  else if (f === 'applied') t = on ? 'Applied the setup guide' : 'Took back the setup guide';
  else if (f === 'handed') t = on ? 'Handed to the setup guide agent' : 'Took it back from the agent';
  else if (f === 'prepared') t = on ? 'The setup guide agent prepared the run' : 'Discarded the prepared run';
  else if (f === 'tests') t = 'Room test results';
  else if (f === 'signed') t = on ? 'Signed off the space' : 'Took back the sign-off';
  else t = `${f}: ${String(e.before ?? 'none')} to ${String(on ?? 'none')}`;
  return e.undoes ? `${e.note}: ${t.charAt(0).toLowerCase()}${t.slice(1)}` : t;
}
