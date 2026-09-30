// Everything the device page needs about each physical unit, worked out once at build time.
// The device page is one template filled from this data, so a page per device costs nothing extra.
import { spaces, sites, classes, models, incidents, incidentPath, projects, labTests, SITE_ORDER, className, modelName, STAGE_LABEL,
  advisoriesFor, configFor, standardFirmware, firmwareFor, modelChoices, networkPath, LOC_LABEL, rackFor, deviceName } from './data.mjs';
import { activeLinks, describe, CABLE_LABEL } from './wiring.mjs';
import { usageCard } from './usage.mjs';
import { firmwareLines, sources, DEMO_TODAY } from './data.mjs';
import { loadPrivacy, recordFor, privacyRows } from './privacy.mjs';
import { supportStatus, monthLabel } from './security.mjs';
import { RESTRICTED_VIEWS } from './classification.mjs';

// A model's security support, shaped for the unit page: the firmware line by name, the end date with its
// source (or "demo value"), the maker's vulnerability contact, and the warning when support ends within
// 12 months or has ended.
export function securityInfo(m) {
  const ss = m?.security_support;
  if (!ss) return null;
  const st = supportStatus(ss, DEMO_TODAY);
  const src = (id) => (id && sources[id] ? { title: sources[id].title, url: sources[id].url ?? null } : null);
  return {
    line: firmwareLines[ss.firmware_line]?.name ?? ss.firmware_line,
    ends: monthLabel(ss.ends.date), endsDemo: Boolean(ss.ends.demo), endsSrc: src(ss.ends.source),
    state: st.state, tone: st.tone, chip: st.chip, text: st.text,
    contact: ss.vulnerability_contact ? { url: ss.vulnerability_contact.url, demo: Boolean(ss.vulnerability_contact.demo), src: src(ss.vulnerability_contact.source) } : null,
  };
}

const h = (str) => [...str].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
const hex = (v) => (v & 255).toString(16).padStart(2, '0').toUpperCase();

export function buildDevices() {
  const units = [];
  const modelInfo = {};
  const rooms = {}, siteInfo = {};
  const privacyRecs = loadPrivacy(), privacy = {};
  for (const s of Object.values(spaces)) {
    const site = sites[s.site];
    const fit = new Set(s.fitted ?? []);
    const links = activeLinks(s.option, fit);
    const path = networkPath(s);
    const rack = rackFor(s.id);
    rooms[s.id] = { name: s.name, number: s.number ?? null, type: s.type.profile.name, typeId: s.space_type, option: s.option.name, floor: s.floor ?? null, site: s.site,
      path: { idf: path.idf ? { id: path.idf.id, name: `${path.idf.name}, ${path.idf.number}` } : null, mdf: path.mdf ? { id: path.mdf.id, name: `${path.mdf.name}, ${path.mdf.number}` } : null },
      // path: the incident's own page (decision 0024); tag: the unit it is about (null for the whole room).
      incidents: Object.values(incidents).filter((i) => i.room === s.id).map((i) => ({ number: i.number, title: i.short_description, state: i.state, priority: i.priority, position: i.position ?? null, tag: i.device ?? null, opened: i.opened ?? null, path: incidentPath(i.number) })),
      tasks: Object.values(projects).flatMap((prj) => prj.tasks.filter((t) => t.space === s.id).map((t) => ({ project: prj.id, projectName: prj.name, id: t.id, title: t.title, status: t.status, due: t.due ?? null }))) };
    siteInfo[s.site] ??= { name: site.name, code: site.code, city: site.city ?? null, tz: site.time_zone ?? null, country: site.country ?? null };
    for (const p of [...s.positions, ...s.olderKit, ...s.spareKit]) {
      const cls = classes[p.cls];
      const networked = Boolean(cls?.platforms?.dhcp_dns);
      const local = p.position.replace(/^[a-z]+-\d+\//, '');
      const [key, nth = '1'] = local.split('#');
      const hits = (ep) => { const m = /^([a-z0-9-]+)(?:#(\d+))?\.([a-z0-9-]+)$/.exec(ep); return m && m[1] === key && +(m[2] ?? 1) === +nth; };
      const conn = links.filter((l) => hits(l.from) || hits(l.to)).map((l) => {
        const [me, them] = hits(l.from) ? [l.from, l.to] : [l.to, l.from];
        return { port: me.split('.').pop(), to: describe(them, s.option), cable: CABLE_LABEL[l.cable] ?? l.cable };
      });
      const rackItem = rack?.items.find((it) => it.position === p.position);
      // A unit can be a different model from its position's (an outgoing switch, say): the models of the units come with it.
      for (const mid of new Set([p.model, ...p.units.map((x) => x.model)].filter(Boolean))) {
        if (modelInfo[mid]) continue;
        const mcls = models[mid]?.class ?? p.cls;
        const fw = standardFirmware(mid), line = firmwareFor(mid), cfg = configFor(mid), ch = modelChoices[mid];
        modelInfo[mid] = {
          name: modelName(mid), cls: mcls, className: className(mcls),
          fw: fw ? { version: fw.version, known: fw.known_issues ?? [], line: line.name, blocked: line.releases.filter((r) => r.status === 'blocked').map((r) => r.version) } : null,
          advisories: advisoriesFor(mid).map((a) => ({ id: a.id, level: a.level, title: a.title, action: a.action })),
          config: cfg ? { id: cfg.id, name: cfg.name, version: cfg.version, mode: cfg.mode, perDevice: cfg.groups.flatMap((g) => g.settings.filter((x) => x.per_device).map((x) => ({ group: g.name, name: x.name, value: x.value }))) } : null,
          platforms: ch?.platforms.map((x) => ({ name: x.name, support: x.support })) ?? [],
          status: ch?.status ?? null,
          sec: securityInfo(models[mid]),
          labs: Object.values(labTests).filter((l) => l.models?.includes(mid)).map((l) => ({ id: l.id, title: l.title, status: l.status, start: l.start ?? null, end: l.end ?? null })),
        };
      }
      // The privacy record for a sensing unit (camera, microphone, video bar...), by class and site.
      const pr = recordFor(privacyRecs, models[p.model]?.class ?? p.cls, s.site);
      if (pr && !privacy[pr.id]) privacy[pr.id] = { name: pr.name, rows: privacyRows(pr), never: pr.never ?? [], notice: pr.notice.text ?? null, law: pr.law, approver: pr.approver };
      for (const u of p.units) {
        const n = h(u.serial);
        units.push({
          tag: u.asset_tag, serial: u.serial, host: p.hostname ?? null, name: deviceName(s, p), stage: u.stage, stageLabel: STAGE_LABEL[u.stage], installed: u.installed ?? null, arrived: u.arrived ?? null, retired: u.retired ?? null, spare: Boolean(p.spare), store: p.spare ? { cabinet: p.cabinet, shelf: p.shelf } : null, notes: u.notes ?? null, legacy: Boolean(u.legacy), older: Boolean(p.older),
          room: s.id,
          pos: { key: p.position, role: p.role ?? className(p.cls), cls: p.cls, className: className(p.cls), model: u.model ?? p.model ?? null, location: p.spare ? null : LOC_LABEL[p.equipment?.location ?? 'tbd'] ?? null },
          net: networked && p.hostname ? { ip: `10.${(SITE_ORDER.indexOf(s.site) + 1) * 10}.${s.floor ?? 1}.${20 + (n % 200)}`, mac: ['02', hex(n), hex(n >> 8), hex(n >> 16), hex(n >> 24), hex(n >> 4)].join(':'), fqdn: `${p.hostname}.aigna.example` } : null,
          conn, rack: rackItem ? { name: rack.name, u: rackItem.u, size: rackItem.size } : null,
          platforms: p.spare ? ['inventory'] : Object.keys(cls?.platforms ?? {}),
          usage: usageCard(u.asset_tag),
          privacy: pr ? pr.id : null,
          pw: typeof u.default_password_changed === 'boolean' ? u.default_password_changed : null,
        });
      }
    }
  }
  return { units, models: modelInfo, rooms, sites: siteInfo, privacy, restricted: RESTRICTED_VIEWS };
}
