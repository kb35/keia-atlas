#!/usr/bin/env node
// One-off migration (decision 0025): one room per home office, in three remote sites.
//
// Kept for the record; it has already been run and its output committed. It refuses to run again
// once the old kit groups are gone.
//
// Before: one remote site (Willow) with two anonymous groups, 40 USB-C monitor kits and 15 Mac kits.
// After: Remote EMEA (rem), Remote Americas (ram) and Remote APAC (rap), with 104 home offices near
// the company's offices. Each is its own room, built to one option of the remote-home room profile,
// with its own install. The 55 old kits keep their asset tags and install dates and move into the
// first home offices of their option (their serials take the new site's code); the rest get new made-up
// serials and asset tags continuing the numbering. Towns are real places named only for the country,
// plug and time zone; home offices are labelled by town and a number, never by a person's name.
//
// Run from the repository root:  node tools/migrations/2026-09-29-home-offices.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const ROOT = process.cwd();
const OLD = ['rem-kit-01', 'rem-kit-02'];
if (!existsSync(path.join(ROOT, 'data/installs/rem/rem-kit-01.yaml'))) {
  console.log('Already run: the old kit groups are gone.');
  process.exit(0);
}

// A small seeded random, so the output is the same every run.
let seed = 20260929;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pad = (n, w = 6) => String(n).padStart(w, '0');
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const slug = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Towns near each office: [town, country, how many home offices]. Real towns, generic.
const REMOTE = {
  rem: { code: 'REM', near: {
    dub: [['Bray', 'IE', 3], ['Swords', 'IE', 3], ['Naas', 'IE', 2], ['Maynooth', 'IE', 3], ['Greystones', 'IE', 2], ['Drogheda', 'IE', 2], ['Navan', 'IE', 1]],
    lon: [['Reading', 'GB', 3], ['St Albans', 'GB', 2], ['Guildford', 'GB', 2], ['Watford', 'GB', 2], ['Brighton', 'GB', 2], ['Cambridge', 'GB', 2], ['Oxford', 'GB', 1]],
    cph: [['Roskilde', 'DK', 2], ['Hillerød', 'DK', 2], ['Helsingør', 'DK', 1], ['Køge', 'DK', 2], ['Malmö', 'SE', 3], ['Lund', 'SE', 2]],
  } },
  ram: { code: 'RAM', near: {
    nyc: [['Hoboken', 'US', 3], ['Jersey City', 'US', 2], ['Stamford', 'US', 3], ['Yonkers', 'US', 2], ['White Plains', 'US', 2], ['Montclair', 'US', 2], ['New Rochelle', 'US', 2]],
    chi: [['Evanston', 'US', 3], ['Naperville', 'US', 2], ['Oak Park', 'US', 2], ['Skokie', 'US', 1], ['Aurora', 'US', 2]],
    tor: [['Mississauga', 'CA', 3], ['Oakville', 'CA', 2], ['Markham', 'CA', 2], ['Hamilton', 'CA', 2], ['Burlington', 'CA', 1]],
    jnu: [['Douglas', 'US', 2]],
  } },
  rap: { code: 'RAP', near: {
    sin: [['Tampines', 'SG', 3], ['Punggol', 'SG', 2], ['Jurong East', 'SG', 2], ['Woodlands', 'SG', 1], ['Johor Bahru', 'MY', 2]],
    mel: [['Geelong', 'AU', 2], ['Frankston', 'AU', 2], ['Dandenong', 'AU', 1], ['Ballarat', 'AU', 1]],
    tyo: [['Yokohama', 'JP', 3], ['Kawasaki', 'JP', 2], ['Saitama', 'JP', 2], ['Chiba', 'JP', 1]],
  } },
};
const OFFICE = { dub: 'Dublin office', lon: 'London office', cph: 'Copenhagen office', nyc: 'New York office', chi: 'Chicago office', tor: 'Toronto office', jnu: 'Juneau office', sin: 'Singapore office', mel: 'Melbourne office', tyo: 'Tokyo office' };
// Home offices of the demo team (src/lib/demo.mjs gives each person a base). These use the Mac option
// or the USB-C one as below; the rest are chosen at random, about one in four on the Mac option.
const TEAM = { 'rem-maynooth-01': 'mac', 'rem-bray-01': 'usb-c-monitor', 'rem-swords-01': 'usb-c-monitor', 'rem-naas-01': 'mac', 'rem-watford-01': 'usb-c-monitor', 'ram-hoboken-01': 'mac', 'ram-stamford-01': 'usb-c-monitor', 'rap-tampines-01': 'usb-c-monitor', 'rap-yokohama-01': 'usb-c-monitor' };
// New starters whose kit is on its way (project PRJ-20): units being installed, no install date yet.
const NEW_STARTERS = new Set(['rem-reading-03', 'rem-malmo-03', 'rem-drogheda-02', 'rem-guildford-02']);
const EQUIP = {
  'usb-c-monitor': [['monitor', 'dell-p2726deb'], ['network-gateway', 'unifi-express-7']],
  mac: [['monitor', 'apple-studio-display-2026'], ['dock', 'caldigit-ts5'], ['network-gateway', 'unifi-express-7']],
};

// The old kits, in order: each is a list of units by position key.
const oldKits = (id) => {
  const inst = parse(readFileSync(path.join(ROOT, `data/installs/rem/${id}.yaml`), 'utf8'));
  const kits = new Map();
  for (const p of inst.positions) {
    const [kit, key] = p.position.split('/');
    if (!kits.has(kit)) kits.set(kit, {});
    kits.get(kit)[key] = p.units[0];
  }
  return [...kits.values()];
};
const reuse = { 'usb-c-monitor': oldKits('rem-kit-01'), mac: oldKits('rem-kit-02') };
let next = 1451; // the highest asset tag in use before this migration was AG-001450

let offices = 0, units = 0, reused = 0;
for (const [site, { code, near }] of Object.entries(REMOTE)) {
  mkdirSync(path.join(ROOT, `data/spaces/${site}`), { recursive: true });
  mkdirSync(path.join(ROOT, `data/installs/${site}`), { recursive: true });
  for (const [office, towns] of Object.entries(near)) {
    for (const [town, country, n] of towns) {
      for (let i = 1; i <= n; i++) {
        const id = `${site}-${slug(town)}-${pad(i, 2)}`;
        const name = `${town} home office ${i}`;
        const option = TEAM[id] ?? (rnd() < 0.26 ? 'mac' : 'usb-c-monitor');
        const optName = option === 'mac' ? 'Mac' : 'USB-C monitor';
        writeFileSync(path.join(ROOT, `data/spaces/${site}/${id}.yaml`),
          `# ${siteName(site)}: ${name}, near ${OFFICE[office]}. A made-up home office; the town is real.\n\nsite: ${site}\nname: ${name}\nspace_type: remote-home\noption: ${option}\ntown: ${town}\ncountry: ${country}\nnear: ${office}\n`);
        const old = NEW_STARTERS.has(id) ? null : reuse[option].shift();
        const day = addDays('2022-01-10', Math.floor(rnd() * 1600));
        const lines = [`# Installed in ${name} (${id}), ${optName} option. Serials and asset tags are made up.`, '', `space: ${id}`, 'positions:'];
        for (const [key, model] of EQUIP[option]) {
          let serial, tag, installed, stage;
          if (old) {
            const u = old[key];
            serial = u.serial.replace(/^DEMO-[A-Z]{3}-/, `DEMO-${code}-`); tag = u.asset_tag; installed = u.installed; stage = u.stage;
          } else {
            serial = `DEMO-${code}-${pad(next)}`; tag = `AG-${pad(next)}`; next++;
            stage = NEW_STARTERS.has(id) ? 'deploy' : 'manage';
            installed = stage === 'manage' ? addDays(day, Math.floor(rnd() * 12)) : null;
          }
          lines.push(`  - position: ${key}`, `    model: ${model}`, '    units:', `      - serial: ${serial}`, `        asset_tag: ${tag}`, `        stage: ${stage}`);
          if (installed) lines.push(`        installed: "${installed}"`);
          units++;
        }
        if (old) reused++;
        if (NEW_STARTERS.has(id)) lines.push('notes:', '  - A new starter\'s kit, on its way (PRJ-20). Provisioned before it ships; installed and configured at home.');
        writeFileSync(path.join(ROOT, `data/installs/${site}/${id}.yaml`), `${lines.join('\n')}\n`);
        offices++;
      }
    }
  }
}
function siteName(s) { return { rem: 'Remote EMEA', ram: 'Remote Americas', rap: 'Remote APAC' }[s]; }

if (reuse['usb-c-monitor'].length || reuse.mac.length) throw new Error('Not every old kit found a home office');
for (const id of OLD) {
  rmSync(path.join(ROOT, `data/spaces/rem/${id}.yaml`));
  rmSync(path.join(ROOT, `data/installs/rem/${id}.yaml`));
}
console.log(`${offices} home offices, ${units} units (${reused} old kits moved in), next asset tag AG-${pad(next)}`);
