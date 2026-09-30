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
  const item = { unit: (id) => `int:${P}:${id}:unit`, batch: (id) => `int:${P}:${id}:batch`, room: (id) => `int:${P}:${id}:room`, project: () => `int:${P}:all:project` };
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
    const m = /^int:[^:]+:(.+):(unit|batch|room|project)$/.exec(it); if (!m) return {};
    if (m[2] === 'unit') return U.has(m[1]) ? baseUnit(U.get(m[1])) : {};
    if (m[2] === 'batch') return B.has(m[1]) ? baseBatch(B.get(m[1])) : {};
    if (m[2] === 'room') return R.has(m[1]) ? baseRoom(R.get(m[1])) : {};
    return { accepted: {} };
  };
  const S = (it) => io.get(it, baseOf(it));
  const us = (id) => S(item.unit(id));
  const bs = (id) => S(item.batch(id));
  const rs = (id) => S(item.room(id));

  // Everything accepted, from the built plan and from every accept event (batch, room, project).
  function acceptedAll() {
    const out = new Map();
    for (const u of plan.units) for (const [step, who] of Object.entries(u.base.accepted ?? {})) out.set(`${u.id}|${step}`, { who, at: null });
    const add = (st) => { for (const [k, v] of Object.entries(st.accepted ?? {})) out.set(k, v); };
    plan.batches.forEach((b) => add(bs(b.id)));
    plan.rooms.forEach((r) => add(rs(r.id)));
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
      if (bst.applied && seeable) return { st: 'doing', label: 'Under way', sub: !hostOnline(u) ? 'Waits for its video bar' : u.networked && !s.online ? 'Applies when it is online' : 'Reading back', cs };
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
  function readyGroups(by) {
    const groups = [];
    const list = by === 'room' ? plan.rooms.map((r) => ({ id: r.id, title: r.name, units: r.units, noun: null })) : plan.batches.map((b) => ({ id: b.id, title: b.title, units: b.units, noun: b.noun, cfg: b.cfg }));
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
      const what = by === 'room' ? `in ${g.title}` : (g.noun ?? 'units');
      const head = all
        ? (by === 'room' ? `Every unit in ${g.title} passes` : n === 1 ? `The ${g.title.replace(/^1 /, '')} passes` : `All ${n} ${what} pass`)
        : `${plural(keys.length, 'step')} passed on ${n} of ${g.units.length} ${by === 'room' ? `units ${what}` : what}`;
      groups.push({ scope: by, id: g.id, title: g.title, head, ev: ev.join(', '), keys, n, checksN, left: blockedN, all });
    }
    return groups;
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
  return { agents, plan, P, U, B, R, LABEL, DONE_W, item, baseOf, us, bs, rs, acc, fresh, checks, issueOf, issuesOf, stepOf, unitSteps, unitSetUp, batchSum, roomSum, needs, readyGroups, figures, nameOf, setupOf, hostOnline, stage, seeOn };
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
export function readyHtml(M, { by = 'batch', only = null } = {}) {
  let groups = M.readyGroups(by);
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

// Words for the History drawer (and anything else that lists changes).
export function describe(M, e) {
  const m = /^int:[^:]+:(.+):(unit|batch|room|project)$/.exec(e.item) ?? [];
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
