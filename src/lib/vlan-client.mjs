// Change VLAN on the switch page (src/pages/switches/[id].astro): the small form, what the change touches, the
// approval it needs, and the simulated record.
//
// The page carries each port's facts and its blast radius as data (src/lib/switchports.mjs, worked out at build
// time from src/lib/blast.mjs). A change is an event in the live layer (src/lib/live.mjs): item vlan:<switch>/<port>,
// field "native" when it goes ahead, "proposed" when it waits on an approval, with the reason as its note. So it
// shows in the History drawer with Undo, reaches the other windows on this computer, and stays in this browser.
// Nothing is sent to a switch: the result says which platform's connector would apply it and read it back.
import { browserLive } from './live.mjs';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const VL = [10, 20, 30, 31, 40, 50, 60, 70, 90];

/** The plan check again after a change: the words the page shows. Pure, so the tests can call it. */
export function recheck(port, vlan, plan) {
  const name = (v) => plan.find((x) => x.v === v)?.name;
  const vl = (v) => (name(v) ? `VLAN ${v} ${name(v)}` : `VLAN ${v}`);
  if (vlan === 1) return { ok: false, why: 'On VLAN 1, the switch default, which carries nothing here.' };
  if (port.inRoom && vlan === 40) return { ok: true, why: `${vl(40)}, kept in the room.` };
  if (port.plan == null) return { ok: port.mode === 'trunk' && vlan === 10 ? true : null, why: port.mode === 'trunk' ? (vlan === 10 ? `A trunk to network kit, managed on ${vl(10)}.` : `A link to network kit should be managed on ${vl(10)}.`) : 'The VLAN plan does not name this kind of device yet.' };
  return vlan === port.plan ? { ok: true, why: `On ${vl(vlan)}, as the plan says.` } : { ok: false, why: `On ${vl(vlan)}; the plan puts ${/^[aeiou]/.test(port.what ?? '') ? 'an' : 'a'} ${port.what ?? 'device'} on ${vl(port.plan)}.` };
}

export function mountVlanForm() {
  const root = document.querySelector('[data-swp]');
  if (!root || root.dataset.vfOn) return;
  root.dataset.vfOn = '1';
  const D = JSON.parse(root.dataset.swp);
  const bySlug = new Map(D.ports.map((p) => [p.slug, p]));
  const box = root.querySelector('[data-vlan-form]');
  const $ = (s) => box.querySelector(s);
  const live = browserLive();
  const item = (p) => `vlan:${D.sw}/${p.p}`;
  const name = (v) => D.plan.find((x) => x.v === v)?.name ?? '';
  const vl = (v) => (v == null ? 'no VLAN' : `VLAN ${v}${name(v) ? ` ${name(v)}` : ''}`);
  let cur = null;

  // What the page shows for a port: the planned VLAN (the record) and what the switch reports (seen), as built or
  // as a simulated change left them. seen is null when the switch agrees with the record.
  const base = (p) => ({ native: p.native, seen: p.seen ?? null, proposed: null });
  const nowOf = (p) => {
    const st = live?.stateOf(item(p), base(p)) ?? base(p);
    const seen = st.seen != null && st.seen !== st.native ? st.seen : null;
    return { native: st.native, seen, proposed: st.proposed, changed: st.native !== p.native || seen !== (p.seen ?? null) };
  };
  const checkOf = (p, n) => (n.seen != null ? { ok: false, why: `Planned ${vl(n.native)}, seen ${n.seen === 1 ? 'VLAN 1 (the switch default)' : vl(n.seen)} on the switch.` } : recheck(p, n.native, D.plan));
  const paint = (p) => {
    const n = nowOf(p);
    const cell = root.querySelector(`.swp-port[data-port="${p.slug}"]`);
    if (cell && p.state === 'active') {
      cell.style.setProperty('--vl', VL.includes(n.native) ? `var(--vl-${n.native})` : 'var(--text)');
      const v = cell.querySelector('.swp-v'); if (v && p.mode !== 'trunk') v.textContent = String(n.native);
      cell.classList.toggle('is-sim', n.changed);
      const chk = n.changed ? checkOf(p, n) : { ok: p.ok };
      const g = cell.querySelector('.swp-g'); if (g) g.hidden = chk.ok !== false;
    }
    const row = root.querySelector(`tr[data-row="${p.slug}"]`);
    if (row && (n.changed || n.proposed != null)) {
      const chk = checkOf(p, n);
      row.querySelector('[data-cell-vlan]').innerHTML = `<span class="vl"><span class="vl-sw" style="--vl:${VL.includes(n.native) ? `var(--vl-${n.native})` : 'var(--text)'}"></span><span>Planned ${esc(vl(n.native))}</span></span>` +
        (n.seen != null ? `<small class="swp-sub2">Switch reports: ${esc(vl(n.seen))}</small>` : '') +
        (n.changed ? '<small class="swp-sub2">Changed here, simulated</small>' : '') + (n.proposed != null ? `<small class="swp-sub2">Proposed: ${esc(vl(n.proposed))}, waiting on approval</small>` : '');
      row.querySelector('[data-cell-check]').innerHTML = chk.ok === false ? `<span class="faint">To review</span><small class="swp-sub2">${esc(chk.why)}</small>` : `<span class="faint">${chk.ok ? 'As planned' : 'Not in the plan'}</span>`;
    }
  };
  D.ports.forEach(paint);

  function open(slug) {
    const p = bySlug.get(slug); if (!p) return;
    cur = p;
    const n = nowOf(p);
    root.querySelectorAll('.is-on').forEach((x) => x.classList.remove('is-on'));
    root.querySelector(`.swp-port[data-port="${slug}"]`)?.classList.add('is-on');
    root.querySelector(`tr[data-row="${slug}"]`)?.classList.add('is-on');
    $('[data-vf-port]').textContent = `${D.sw} ${p.word}`;
    $('[data-vf-now]').innerHTML = p.state === 'parked'
      ? `Now: <b>parked</b>, shut with nothing plugged in. ${esc(p.place)}. A VLAN here takes effect when the port is turned on.`
      : `Planned: <b>${esc(vl(n.native))}</b>${n.seen != null ? `; the switch reports <b>${esc(vl(n.seen))}</b>` : ''}${p.mode === 'trunk' ? `. A trunk (tagged ${esc(p.tagged.join(', '))}): this changes the untagged VLAN only` : ''}. On it: ${esc(p.far || 'nothing recorded')}${p.place ? `, ${esc(p.place)}` : ''}.`;
    const sel = $('[data-vf-vlan]');
    const drift = n.seen != null;
    sel.value = String(drift ? n.native : p.ok === false && p.plan != null ? p.plan : n.native ?? p.plan ?? 10);
    $('[data-vf-why]').value = drift ? 'Put the switch back on the planned VLAN' : p.ok === false ? `Put it on the plan's VLAN (${p.rule === 'no-vlan-1' ? 'no-vlan-1' : 'vlan-by-purpose'})` : '';
    const I = p.impact ?? { spaces: [], units: [], aps: [], meetings: 0, people: 0, approval: { words: 'Goes ahead: nothing cut off' }, peers: [] };
    const units = I.units.map((u) => u.name);
    $('[data-vf-touch]').textContent = [
      units.length ? `${plural(units.length, 'unit')}: ${list(units.slice(0, 4))}${units.length > 4 ? ` and ${units.length - 4} more` : ''}` : 'No unit is plugged in',
      I.aps.length ? plural(I.aps.length, 'access point') : null,
      I.spaces.length ? `${plural(I.spaces.length, 'space')}${I.spaces.length <= 3 ? ` (${I.spaces.map((s) => s.label).join(', ')})` : ''}` : null,
    ].filter(Boolean).join(' · ') + '. While the port changes, what is on it drops off the network for about a minute and comes back with an address on the new VLAN.';
    $('[data-vf-meet]').textContent = I.meetings ? `${plural(I.meetings, 'meeting')} in the next 24 hours (${plural(I.people, 'person', 'people')}) in those spaces. Bookings are simulated.` : 'No meetings in the next 24 hours in those spaces.';
    const grp = $('[data-vf-group]');
    grp.hidden = !I.peers?.length;
    if (I.peers?.length) grp.textContent = `${I.group ? `${I.group.name}: ` : ''}one bundle with ${list(I.peers.map((x) => `${x.word} on ${x.sw}`))}, so the change applies to ${I.peers.length === 1 ? 'both links' : `all ${I.peers.length + 1} links`}.`;
    $('[data-vf-ap]').textContent = `${I.approval.words}.`;
    $('[data-vf-ap-why]').textContent = I.approval.level === 'go' ? 'It is recorded as done (simulated).' : 'It is recorded as proposed until then; nothing changes on the port.';
    $('[data-vf-err]').hidden = true;
    $('[data-vf-done]').hidden = true;
    box.querySelector('[data-vf]').hidden = false;
    box.hidden = false;
    planLine();
    const go = () => { box.scrollIntoView({ block: 'start', behavior: window.rsMotion?.().reduced ? 'auto' : 'smooth' }); sel.focus({ preventScroll: true }); };
    requestAnimationFrame(go);
  }
  function planLine() {
    if (!cur) return;
    const v = +$('[data-vf-vlan]').value;
    const chk = recheck(cur, v, D.plan);
    $('[data-vf-plan]').textContent = chk.ok === false ? `Off the plan: ${chk.why}` : chk.ok ? `Follows the plan: ${chk.why}` : chk.why;
  }
  function close() {
    box.hidden = true; cur = null;
    root.querySelectorAll('.is-on').forEach((x) => x.classList.remove('is-on'));
  }
  function submit(e) {
    e.preventDefault();
    if (!cur) return;
    const v = +$('[data-vf-vlan]').value, why = $('[data-vf-why]').value.trim();
    const n = nowOf(cur);
    const err = !why ? 'Say why, in a line: it goes on the change record.' : v === n.native && n.seen == null && cur.state !== 'parked' ? `The port is already on ${vl(v)}.` : '';
    if (err) { const x = $('[data-vf-err]'); x.textContent = err; x.hidden = false; $(err.startsWith('Say') ? '[data-vf-why]' : '[data-vf-vlan]').focus(); return; }
    const goes = (cur.impact?.approval.level ?? 'go') === 'go';
    const who = window.rsActorId ? window.rsActorId() : window.rsWhoId ? window.rsWhoId() : null;
    // Done: the record takes the new VLAN, and the connector's read-back (simulated) sees it. Proposed: the record waits.
    let ev = null;
    if (!goes) ev = live?.record({ item: item(cur), field: 'proposed', before: n.proposed, after: v, note: why, who });
    else {
      if (v !== n.native) ev = live?.record({ item: item(cur), field: 'native', before: n.native, after: v, note: why, who });
      const back = live?.record({ item: item(cur), field: 'seen', before: n.seen, after: v, note: `Read back from ${D.platform} (simulated)`, who });
      ev = ev ?? back;
    }
    const peers = cur.impact?.peers ?? [];
    const at = new Date(ev?.at ?? Date.now()).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
    $('[data-vf-done]').innerHTML =
      `<p><b>${goes ? 'Recorded as done' : 'Recorded as proposed'}</b>, ${esc(at)} <span class="sim-t is-sim">Simulated</span></p>` +
      `<p>${esc(D.sw)} ${esc(cur.word)}${peers.length ? ` and ${esc(list(peers.map((x) => `${x.word} on ${x.sw}`)))}` : ''}: ${esc(vl(n.seen ?? n.native))} to <b>${esc(vl(v))}</b>. Reason: ${esc(why)}.</p>` +
      (goes
        ? `<p>In a live setup the ${esc(D.platformShort)} connector would set the port on ${esc(D.platform)}, then read it back to confirm the VLAN took. Here nothing was sent to a switch.</p>`
        : `<p>${esc(cur.impact.approval.words)}. Nothing changes on the port until then; once approved, the ${esc(D.platformShort)} connector would set it and read it back.</p>`) +
      '<p><button type="button" class="btn small" data-vf-history>History and Undo</button> <button type="button" class="btn small ghost" data-vf-close>Close</button></p>';
    box.querySelector('[data-vf]').hidden = true;
    $('[data-vf-done]').hidden = false;
    paint(cur);
    $('[data-vf-done]').querySelector('[data-vf-history]').focus();
  }
  function seeOnPlan() {
    const br = root.querySelector('[data-br]'); if (!br || !cur) return;
    br.querySelector('[data-br-none]')?.click();
    const btn = br.querySelector(`[data-br-port="${cur.p}"]`);
    // Pressed ports are off: "Clear" leaves every port on, so pressing this one takes only it off.
    if (btn && btn.getAttribute('aria-pressed') !== 'true') btn.click();
    const t = br.querySelector('[data-br-toggle]'); if (t && t.getAttribute('aria-pressed') !== 'true') t.click();
    br.scrollIntoView({ block: 'start', behavior: window.rsMotion?.().reduced ? 'auto' : 'smooth' });
  }

  root.addEventListener('click', (e) => {
    const o = e.target.closest('[data-vlan-open]'); if (o) { open(o.dataset.vlanOpen); return; }
    if (e.target.closest('[data-vf-cancel]') || e.target.closest('[data-vf-close]')) { close(); return; }
    if (e.target.closest('[data-vf-see]')) { seeOnPlan(); return; }
    if (e.target.closest('[data-vf-history]') && cur) window.rsLive?.history(item(cur), `${D.sw} ${cur.word}`);
  });
  $('[data-vf-vlan]').addEventListener('change', planLine);
  box.querySelector('[data-vf]').addEventListener('submit', submit);
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  // Other windows, and Undo in the History drawer, change a port in place.
  live?.subscribe(`vlan:${D.sw}/`, (e) => { const p = D.ports.find((x) => item(x) === e.item); if (p) paint(p); });
  const describe = (e) => `${e.field === 'proposed' ? 'Proposed' : e.field === 'seen' ? 'The switch reports' : 'Planned'} ${vl(e.after)}${e.before != null ? `, was ${vl(e.before)}` : ''}${e.note ? `: ${e.note}` : ''} (simulated)`;
  const reg = () => window.rsLive?.register('vlan:', { base: (it) => { const p = D.ports.find((x) => item(x) === it); return p ? base(p) : {}; }, describe });
  if (window.rsLive) reg(); else document.addEventListener('rs:live-ready', reg, { once: true });
  // Arriving with ?change=<port> (the unit page's Change VLAN): open the form for that port.
  const q = new URLSearchParams(location.search).get('change');
  if (q) open(q.startsWith('port-') ? q : `port-${q}`);
}
