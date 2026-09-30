// On call, shaped for the pages (src/lib/oncall.mjs has the rules): each region's rota at the demo's now, the line
// for each person's Home, and who to call about an incident at a site.
import { onCall, sites } from './data.mjs';
import { PEOPLE } from './demo.mjs';
import { rotaAt, lineFor, whenWords, hoursWords, utcOf, REGION_WORD } from './oncall.mjs';

// The demo's now: noon on Monday 28 September in Dublin (src/lib/home.mjs), as a moment every time zone agrees on.
export const DEMO_NOW_UTC = '2026-09-28T11:00:00Z';
const person = (id) => PEOPLE.find((p) => p.id === id) ?? null;
const first = (id) => person(id)?.name.split(' ')[0] ?? id;
export const ROTAS = ['emea', 'amer', 'apac'].map((g) => Object.values(onCall).find((r) => r.region === g)).filter(Boolean);

/** Every region, now: who is on call, until when, the backup, who they escalate to and the next weeks. */
export function onCallNow(utc = DEMO_NOW_UTC) {
  return ROTAS.map((rota) => {
    const r = rotaAt(rota, utc);
    return {
      region: rota.region, regionWord: REGION_WORD[rota.region], name: rota.name, tz: rota.time_zone, hours: hoursWords(rota), ooh: r.ooh,
      person: r.now ? person(r.now.person) : null, backup: r.now ? person(r.now.backup) : null, escalate: person(rota.escalate_to),
      until: r.now ? whenWords(r.now.until, r.local) : null, untilFull: r.now ? whenWords(r.now.until, r.local, { full: true }) : null,
      next: r.upcoming.slice(0, 3).map((w) => ({ person: person(w.person), backup: person(w.backup), from: whenWords(w.from, r.local, { full: true }) })),
      paging: rota.paging ?? null,
    };
  });
}

/** The line for someone's Home, or null when they are not on the rota this week or next. */
export function homeLine(personId, utc = DEMO_NOW_UTC) {
  const l = lineFor(personId, ROTAS, utc);
  if (!l) return null;
  const who = l.kind === 'backup' ? `${first(l.r.now.person)} is on call; you back them up` : l.kind === 'now' ? `Backup ${person(l.r.now.backup)?.name ?? l.r.now.backup}` : `${first(l.r.now?.person)} until then`;
  return { kind: l.kind, text: l.text, lead: l.lead, when: l.when, sub: `${l.rota.name}, ${hoursWords(l.rota)} · ${who} · escalate to ${person(l.rota.escalate_to)?.name}`, region: l.region, untilFull: whenWords(l.until, l.r.local, { full: true }) };
}

/** Every person with a Home line this week, keyed by id. */
export function homeLines(utc = DEMO_NOW_UTC) {
  return Object.fromEntries(PEOPLE.map((p) => [p.id, homeLine(p.id, utc)]).filter(([, l]) => l));
}

/** Who is on call for a site's region at a moment: for the incident band. `local` is the site's own wall clock
    ("YYYY-MM-DDTHH:MM", as incidents record time); left out, the demo's now. */
export function onCallForSite(siteId, local = null) {
  const site = sites[siteId], region = site?.region;
  const rota = ROTAS.find((r) => r.region === region);
  const utc = local && rota ? utcOf(local, site.time_zone ?? rota.time_zone) : DEMO_NOW_UTC;
  return onCallNow(utc).find((x) => x.region === region) ?? null;
}
