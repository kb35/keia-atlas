// Work reports: the record of a finished project, or one closed task, worked out from the project data
// (every fix and every serial goes back into the record). A report says what was done, who
// did it, when, which devices were installed or changed (with serials), the evidence, anything that
// differed from the plan, and who signed it off. It is generated, so it is always in step with the data.
// Made-up people and dates; rooms and devices are the sample data.
import { spaces, classes, playbooks, PHASE_LABEL, TASK_STATUS, NOTHING_NEW, PROJECT_KIND, DEMO_TODAY, className, modelName, standardFirmware, fmtDate, sites } from './data.mjs';
import { person, ROLES, PROJECT_ROLE } from './demo.mjs';
import { taskDetail } from './tasks.mjs';

const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const spaceName = (id) => (spaces[id]?.number ? `${spaces[id].number} ${spaces[id].name}` : spaces[id]?.name ?? id);
const INSTALL_KINDS = ['install', 'provision', 'configure', 'commission', 'records'];

// Which kinds of device a piece of work touched, read from its title ("Swap the video bar in Kestrel").
// The last word of a class name, singular, is enough: bar, camera, microphone, panel, switch, display.
function touchedClasses(titles) {
  const found = new Set();
  for (const [id, name] of Object.entries(classNames())) {
    const w = name.toLowerCase().split(' ').pop().replace(/s$/, '');
    if (w.length >= 3 && titles.some((t) => new RegExp(`\\b${w}`, 'i').test(t))) found.add(id);
  }
  return found;
}
const classNames = () => Object.fromEntries(Object.keys(classes).map((c) => [c, className(c)]));

// Devices installed or changed in these rooms: one row per position, with the unit's serial and asset
// tag, and the old unit it replaced when there was one.
function deviceRows(roomIds, titles) {
  const cls = touchedClasses(titles);
  const rows = [];
  for (const rid of roomIds) {
    const s = spaces[rid]; if (!s) continue;
    for (const p of s.positions) {
      if (!p.model && !p.hostname) continue;
      if (cls.size && !cls.has(p.cls)) continue;
      if (!p.current) continue;
      rows.push({
        room: spaceName(rid), position: (p.role ?? className(p.cls)).replace(/:.*$/, ''), hostname: p.hostname ?? '', model: p.model ? modelName(p.model) : '',
        serial: p.current.serial, tag: p.current.asset_tag, firmware: p.model ? standardFirmware(p.model)?.version ?? '' : '',
        replaced: p.legacy ? `Replaced ${p.legacy.serial}${p.legacy.asset_tag ? ` (${p.legacy.asset_tag})` : ''}` : '',
      });
    }
  }
  return rows;
}

const closedHow = (t) => (t.captured_fix ? `Fix captured: ${t.captured_fix}` : t.nothing_new ? NOTHING_NEW[t.nothing_new] : '');
const gateOf = (p, phase) => (p.history ?? []).find((h) => h.phase === phase);

export function projectReport(p) {
  const pb = playbooks[p.playbook];
  const hist = p.history ?? [];
  const finished = p.phase === 'closed' ? hist.find((h) => h.phase === 'closed')?.ended ?? null : null;
  const spent = (p.budget?.lines ?? []).filter((l) => l.status === 'spent').reduce((n, l) => n + l.amount, 0);
  const money = (n) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: p.budget.currency, maximumFractionDigits: 0 }).format(n);
  const rooms = (p.spaces ?? []).map((s) => s.space);
  const titles = p.tasks.filter((t) => INSTALL_KINDS.includes(t.kind)).map((t) => t.title);
  const done = p.tasks.filter((t) => t.status === 'done');
  const deviations = [];
  for (const h of hist) {
    if (!h.ended) continue;
    const d = days(h.planned, h.ended);
    if (d > 0) deviations.push(`${PHASE_LABEL[h.phase]} ended ${plural(d, 'day')} after plan. ${h.summary}`);
  }
  for (const t of p.tasks.filter((x) => x.captured_fix)) deviations.push(`${t.id} ${t.title}: the guide did not cover it. Fix captured: ${t.captured_fix}`);
  for (const r of p.roles ?? []) if ((r.logged ?? 0) > r.hours) deviations.push(`${person(r.person).name} logged ${r.logged} h against ${r.hours} h planned.`);
  if (p.budget && spent > p.budget.approved) deviations.push(`Spent ${money(spent)} against ${money(p.budget.approved)} approved.`);
  const gates = hist.filter((h) => h.signed_off_by).map((h) => ({ phase: PHASE_LABEL[h.phase], by: person(h.signed_off_by).name, date: h.ended ? fmtDate(h.ended) : 'Open' }));
  const team = (p.roles ?? []).map((r) => ({ name: person(r.person).name, role: PROJECT_ROLE[r.as], detail: r.does ?? '', hours: `${r.logged ?? 0} of ${r.hours} h` }));
  const evidence = [];
  for (const h of hist) for (const a of h.artefacts ?? []) evidence.push(`${PHASE_LABEL[h.phase]}: ${a}`);
  const signers = ['pm', 'service-owner', 'programme'].map((as) => (p.roles ?? []).find((r) => r.as === as)).filter(Boolean);
  return {
    kind: 'project', id: p.id, file: `${p.id.toLowerCase()}-work-report`,
    title: `Work report: ${p.name}`, status: p.phase === 'closed' ? 'Completed' : `In progress (${PHASE_LABEL[p.phase]} phase)`, complete: p.phase === 'closed',
    facts: [
      ['Project', `${p.id} ${p.name}`], ['Office', sites[p.site]?.name ?? p.site], ['Kind of work', `${PROJECT_KIND[p.kind] ?? p.kind}${pb ? `, following the ${pb.name} playbook version ${pb.version}` : ''}`],
      ['Started', fmtDate(p.start)], ['Target', fmtDate(p.target)], ['Finished', finished ? fmtDate(finished) : 'Not yet'],
      ['Project manager', person(p.owner).name], ['Spaces', rooms.map(spaceName).join(', ') || 'None'],
      ...(p.budget ? [['Cost', `${money(spent)} spent of ${money(p.budget.approved)} approved`]] : []),
    ],
    summary: p.summary,
    phases: hist.map((h) => ({ name: PHASE_LABEL[h.phase], when: h.ended ? `Ended ${fmtDate(h.ended)}` : `Open, due ${fmtDate(h.planned)}`, summary: h.summary, by: h.signed_off_by ? person(h.signed_off_by).name : '' })),
    steps: [],
    team,
    tasks: p.tasks.map((t) => ({ id: t.id, title: t.title, owner: person(t.owner).name, due: t.due ? fmtDate(t.due) : '', status: TASK_STATUS[t.status], how: t.status === 'done' ? closedHow(t) : '' })),
    doneCount: done.length, taskCount: p.tasks.length,
    devices: deviceRows(rooms, titles),
    evidence,
    deviations,
    signoff: { gates, lines: signers.map((r) => ({ role: PROJECT_ROLE[r.as], name: person(r.person).name })), closed: finished ? `Closed ${fmtDate(finished)}, signed off by ${person(hist.find((h) => h.phase === 'closed')?.signed_off_by ?? p.owner).name}` : 'Not yet closed' },
    generated: fmtDate(DEMO_TODAY),
  };
}

export function taskReport(p, t) {
  const D = taskDetail(p, t);
  const h = gateOf(p, t.phase);
  const who = person(t.owner), pr = (p.roles ?? []).find((r) => r.person === t.owner);
  const rooms = t.space ? [t.space] : [];
  const devices = INSTALL_KINDS.includes(t.kind) || t.kind === 'network' ? deviceRows(rooms.length ? rooms : (p.spaces ?? []).map((s) => s.space), [t.title]) : [];
  const evidence = [];
  if (t.captured_fix) evidence.push(`Closing note: ${t.captured_fix}`);
  if (t.nothing_new) evidence.push(`Closing note: ${NOTHING_NEW[t.nothing_new]}`);
  for (const a of h?.artefacts ?? []) evidence.push(`Recorded for the ${PHASE_LABEL[t.phase]} phase: ${a}`);
  const deviations = [];
  if (t.captured_fix) deviations.push(`The guide did not cover this. Fix captured: ${t.captured_fix}`);
  if (h?.ended && t.due && t.due < h.ended && days(t.due, h.ended) > 0 && h.ended > h.planned) deviations.push(`The ${PHASE_LABEL[t.phase]} phase ended ${plural(days(h.planned, h.ended), 'day')} after plan. ${h.summary}`);
  return {
    kind: 'task', id: t.id, file: `${p.id.toLowerCase()}-${t.id.toLowerCase()}-work-report`,
    title: `Work report: ${t.title}`, status: TASK_STATUS[t.status], complete: t.status === 'done',
    facts: [
      ['Task', `${t.id} ${t.title}`], ['Project', `${p.id} ${p.name}`], ['Office', sites[p.site]?.name ?? p.site], ['Kind of work', `${PHASE_LABEL[t.phase]} phase, ${D.kindLabel.toLowerCase()} work`],
      ['Space', rooms.length ? spaceName(rooms[0]) : 'Whole project'], ['Done by', `${who.name}${who.vendorName ? ` (${who.vendorName})` : ''}, ${pr ? PROJECT_ROLE[pr.as] : ROLES[who.roleId]?.name}`],
      ['Due', t.due ? fmtDate(t.due) : 'No date'], ['Estimate', t.hours ? `${t.hours} h` : 'None'],
      ['Closed with the phase', h?.ended ? `${PHASE_LABEL[t.phase]} phase ended ${fmtDate(h.ended)}` : 'Phase still open'],
    ],
    summary: `${t.title}. ${closedHow(t) ? closedHow(t) + '.' : ''}`.replace(/\.\.$/, '.'),
    phases: [], steps: D.steps,
    team: [{ name: who.name, role: pr ? PROJECT_ROLE[pr.as] : ROLES[who.roleId]?.name, detail: pr?.does ?? '', hours: t.hours ? `${t.hours} h estimated` : '' }],
    tasks: [], devices, evidence, deviations,
    signoff: {
      gates: h?.signed_off_by ? [{ phase: `${PHASE_LABEL[t.phase]} gate`, by: person(h.signed_off_by).name, date: h.ended ? fmtDate(h.ended) : 'Open' }] : [],
      lines: [{ role: 'Done by', name: who.name }, { role: 'Project manager', name: person(p.owner).name }],
      closed: t.status === 'done' ? 'Task closed' : 'Not closed',
    },
    generated: fmtDate(DEMO_TODAY),
  };
}

// The same report as Markdown, for the download. Nothing fancy: headings, lists and tables.
export function reportMarkdown(r) {
  const row = (cells) => `| ${cells.map((c) => String(c ?? '').replace(/\|/g, '/')).join(' | ')} |`;
  const out = [`# ${r.title}`, '', `Status: ${r.status}. Generated by Keia Atlas on ${r.generated}.`, '', ...r.facts.map(([k, v]) => `- **${k}:** ${v}`), '', '## What was done', '', r.summary, ''];
  if (r.phases.length) out.push(...r.phases.map((x) => `- **${x.name}** (${x.when}${x.by ? `, signed off by ${x.by}` : ''}): ${x.summary}`), '');
  if (r.steps.length) out.push('Steps followed:', '', ...r.steps.map((s, i) => `${i + 1}. ${s}`), '');
  out.push('## Who', '', ...r.team.map((x) => `- **${x.name}**, ${x.role}${x.hours ? ` (${x.hours})` : ''}${x.detail ? `: ${x.detail}` : ''}`), '');
  if (r.tasks.length) out.push('## Tasks', '', row(['Task', 'Title', 'Owner', 'Due', 'Status', 'How it closed']), row(['---', '---', '---', '---', '---', '---']), ...r.tasks.map((t) => row([t.id, t.title, t.owner, t.due, t.status, t.how])), '');
  out.push('## Devices installed or changed', '');
  out.push(...(r.devices.length ? [row(['Space', 'Position', 'Hostname', 'Model', 'Serial', 'Asset tag', 'Note']), row(['---', '---', '---', '---', '---', '---', '---']), ...r.devices.map((d) => row([d.room, d.position, d.hostname, d.model, d.serial, d.tag, d.replaced]))] : ['No devices were installed or changed by this work.']), '');
  out.push('## Evidence', '', ...(r.evidence.length ? r.evidence.map((e) => `- ${e}`) : ['None recorded.']), '');
  out.push('## Deviations and added tasks', '', ...(r.deviations.length ? r.deviations.map((e) => `- ${e}`) : ['No deviations recorded.']), '{{ADDED}}', '');
  out.push('## Sign-off', '', ...r.signoff.gates.map((g) => `- ${g.phase}: signed off by ${g.by}, ${g.date}`), `- ${r.signoff.closed}`, '', ...r.signoff.lines.map((l) => `- ${l.role}: ${l.name}    Signature: ____________    Date: __________`), '');
  return out.join('\n');
}
