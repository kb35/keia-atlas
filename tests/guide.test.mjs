// The room guide: the words it builds from a room's data, the records a report and a request make,
// and the QR encoder behind the table card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { roomGuide, likelyPosition, reportIncident, makeRequest, fromEvents, knownWords, newRef, localStamp, symptomsFor, symptomOf, sentFields, bookingAt, reportStatus, addMinutes, ownerFor, accessOf, accessWords, privacyWords } from '../src/lib/guide.mjs';
import { loadPrivacy, recordFor } from '../src/lib/privacy.mjs';
import { PEOPLE } from '../src/lib/demo.mjs';
import { qrMatrix, qrPath } from '../src/lib/qr.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const MEET_ROOM = {
  equipment: [
    { key: 'display', class: 'display', requirement: 'required', location: 'display-wall' },
    { key: 'video-bar', class: 'video-bar', model: 'poly-studio-x52', requirement: 'required', location: 'display-wall' },
    { key: 'touch-controller', class: 'touch-controller', model: 'poly-tc10', requirement: 'required', location: 'table-top' },
    { key: 'hdbaset-tx', class: 'av-extender', requirement: 'required', location: 'below-table' },
    { key: 'scheduler-panel', class: 'scheduler-panel', requirement: 'optional', location: 'room-entrance' },
  ],
  wiring: [{ from: 'hdbaset-tx.usb-c-1', to: 'laptop', cable: 'usb-c' }],
};
const BYOM = {
  equipment: [
    { key: 'display', class: 'display', requirement: 'required' },
    { key: 'video-bar', class: 'video-bar', model: 'logitech-meetup-2', requirement: 'required', location: 'display-wall' },
  ],
  wiring: [{ from: 'video-bar.usb-c-1', to: 'laptop', cable: 'usb-c' }],
};

test('a room with a video bar and a touch panel runs the call itself, for every platform', () => {
  const g = roomGuide({ option: MEET_ROOM, fitted: [] });
  assert.equal(g.system, 'room');
  for (const p of ['meet', 'teams', 'zoom']) assert.equal(g.join[p].length, 3);
  assert.match(g.join.meet[1], /touch panel/);
  assert.match(g.join.teams[2], /guest/);
  assert.equal(g.share.cable, 'USB-C');
  assert.match(g.share.lines[0], /at the table/);
  assert.ok(g.share.wireless, 'Meet rooms take a share without a cable');
  assert.equal(g.panelLines.length, 3);
  assert.equal(g.door, null, 'the booking panel is optional and not fitted');
  assert.ok(roomGuide({ option: MEET_ROOM, fitted: ['scheduler-panel'] }).door, 'fitted, it is described');
});

test('a video bar without a touch panel is bring your own meeting', () => {
  const g = roomGuide({ option: BYOM });
  assert.equal(g.system, 'byom');
  assert.match(g.join.zoom[1], /from the video bar/);
  assert.equal(g.panelLines, null);
});

test('a symptom points at the most likely device, or the whole room', () => {
  const positions = [
    { position: 'display#2', cls: 'display', current: { asset_tag: 'AG-2' } },
    { position: 'display#1', cls: 'display', current: { asset_tag: 'AG-1' } },
    { position: 'video-bar', cls: 'video-bar', current: { asset_tag: 'AG-3' } },
  ];
  assert.equal(likelyPosition(positions, 'picture').position, 'display#1');
  assert.equal(likelyPosition(positions, 'join').position, 'video-bar');
  assert.equal(likelyPosition(positions, 'sound').position, 'video-bar');
  assert.equal(likelyPosition(positions, 'other'), null);
});

test('a report makes an incident in the shape of the incident data, from the room guide', () => {
  const room = { id: 'dub-3-02', title: '3.02 Kestrel', site: 'dub', region: 'emea', tz: 'Europe/Dublin', where: '3.02 Kestrel, Dublin', positions: [{ position: 'video-bar', cls: 'video-bar', current: { asset_tag: 'AG-9' } }] };
  const ms = Date.UTC(2026, 8, 30, 9, 5);
  const inc = reportIncident({ room, symptom: 'join', note: ' Stuck on connecting ', ms });
  assert.match(inc.number, /^INC[0-9]{7}$/);
  assert.equal(inc.opened, '2026-09-30T10:05', 'local time at the office');
  assert.equal(inc.state, 'new');
  assert.equal(inc.priority, 2);
  assert.equal(inc.assignment_group, 'AV and IT, EMEA');
  assert.deepEqual(inc.subject, { kind: 'device', room: 'dub-3-02', position: 'video-bar', device: 'AG-9' });
  assert.equal(inc.history[0].at, inc.opened);
  assert.equal(inc.source, 'room-guide');
  assert.equal(inc.demo, true);
  assert.equal(inc.caller, 'Someone in the room');
  const req = makeRequest({ room, kind: 'home', what: '', name: 'Anna', ms });
  assert.match(req.number, /^REQ[0-9]{7}$/);
  assert.equal(req.title, 'Home office kit');
  const events = [
    { id: 'a', at: '1', item: `incident:${inc.number}`, field: 'reported', after: inc },
    { id: 'b', at: '2', item: `request:${req.number}`, field: 'requested', after: req },
    { id: 'c', at: '3', item: 'task:T-1', field: 'status', after: 'done' },
  ];
  const got = fromEvents(events);
  assert.equal(got.reports.length, 1);
  assert.equal(got.requests.length, 1);
});

test('the symptom list comes from the room\'s own kit', () => {
  const ids = (cls) => symptomsFor(cls).map((s) => s.id);
  assert.deepEqual(ids(['display', 'video-bar', 'touch-controller', 'scheduler-panel']), ['picture', 'sound', 'camera', 'join', 'panel', 'booking', 'other']);
  assert.deepEqual(ids(['monitor']), ['picture', 'sound', 'camera', 'other'], 'a focus room is never asked about a touch panel');
  assert.deepEqual(ids([]), ['other'], 'Something else is always there');
  assert.equal(symptomOf('picture').label, 'Display is black');
});

const ROOM = {
  id: 'dub-3-09', title: '3.09 Whooper Swan', site: 'dub', region: 'emea', tz: 'Europe/Dublin', where: '3.09 Whooper Swan, Dublin',
  owner: { id: 'liam', name: 'Liam Doyle', first: 'Liam', initials: 'LD' },
  positions: [{ position: 'display#1', cls: 'display', role: 'display', current: { asset_tag: 'AG-1' } }],
};

test('two taps make a filled-in incident: space, unit, symptom, time, booking, source and a proposed priority', () => {
  const inc = reportIncident({ room: ROOM, symptom: 'picture', ms: Date.UTC(2026, 8, 30, 7, 3) });
  assert.equal(inc.opened, '2026-09-30T08:03');
  assert.equal(inc.priority_proposed, 2);
  assert.equal(inc.priority, inc.priority_proposed);
  assert.deepEqual(inc.subject, { kind: 'device', room: 'dub-3-09', position: 'display#1', device: 'AG-1' });
  assert.deepEqual(inc.booking, { from: '08:00', to: '08:30' });
  assert.equal(inc.caller, 'Someone in the room', 'the report source is the phone, never a person');
  assert.match(inc.keia_atlas.evidence[0].says, /No name or account is kept/);
  assert.match(inc.history.at(-1).note, /Priority proposed: P2.*Ready for Liam Doyle/);
  const f = Object.fromEntries(sentFields(inc, ROOM));
  assert.equal(f.Device, 'Display · AG-1');
  assert.equal(f.Reference, inc.number);
  assert.deepEqual(bookingAt('2026-09-30T08:47'), { from: '08:30', to: '09:00' });
});

test('the status reads back in plain words, with the next expected time, through to "not fixed for the person"', () => {
  const reported = reportIncident({ room: ROOM, symptom: 'picture', ms: Date.UTC(2026, 8, 30, 7, 3) });
  const owner = ROOM.owner;
  let st = reportStatus({ reported }, { owner });
  assert.equal(st.step, 'reported');
  assert.equal(st.line, "Liam sees this now. You'll be told when it's fixed.");
  assert.deepEqual(st.steps.map((s) => s.state), ['fine', 'planned', 'planned']);
  const withLiam = { reported, with: { who: 'liam', name: 'Liam Doyle', at: '2026-09-30T08:05' } };
  st = reportStatus(withLiam, { owner });
  assert.equal(st.sentence, 'With Liam · started 08:05 · expected by 08:35');
  assert.equal(st.glyph, 'progress');
  const fixed = { ...withLiam, fixed: { at: '2026-09-30T08:21', by: 'liam' } };
  st = reportStatus(fixed, { owner });
  assert.equal(st.head, 'Fixed at 08:21');
  assert.equal(st.ask, true, 'Did it work for you?');
  assert.equal(reportStatus({ ...fixed, followup: { ok: true, at: '2026-09-30T08:22' } }, { owner }).step, 'done');
  st = reportStatus({ ...withLiam, fixed: null, followup: { ok: false, at: '2026-09-30T08:23' } }, { owner });
  assert.equal(st.step, 'reopened');
  assert.match(st.line, /Not fixed for you, so it is back with Liam\. Expected by 08:53/);
  assert.equal(addMinutes('2026-09-30T23:50', 30), '2026-10-01T00:20');
});

test('who looks after a room: the site\'s technician, or the one who covers its city', () => {
  assert.equal(ownerFor(PEOPLE, 'dub', 'Dublin').first, 'Liam');
  assert.equal(ownerFor(PEOPLE, 'cph', 'Copenhagen').first, 'Tom');
  assert.equal(ownerFor(PEOPLE, 'jnu', 'Juneau').first, 'Nathan');
  assert.equal(ownerFor(PEOPLE, 'xyz', 'Nowhere'), null);
});

test('access words: a hearing loop is promised only when it passed a test in the last year', () => {
  const site = { checked_by: 'Facilities', every_room: { captions: true, step_free: { value: true }, checked: '2026-06-18' }, rooms: {
    a: { hearing_loop: { standard: 'IEC 60118-4', tested: '2026-07-12', result: 'meets' } },
    b: { hearing_loop: { standard: 'IEC 60118-4', tested: '2025-07-22', result: 'meets' } },
    c: { hearing_loop: { standard: 'IEC 60118-4', tested: '2026-06-11', result: 'below-standard', note: 'Weak at the far end.' } },
    d: { step_free: { value: false, note: 'Two steps down.' } },
  } };
  const today = '2026-09-30';
  const loop = (id, o = {}) => accessWords(accessOf(site, id), { today, ...o }).find((r) => r.key === 'loop');
  assert.equal(loop('a').state, 'fine');
  assert.match(loop('a').line, /Set your hearing aid to T\. Tested 12 Jul 2026 to IEC 60118-4/);
  assert.equal(loop('b').state, 'review');
  assert.equal(loop('c').state, 'fault');
  assert.equal(loop('d', { nearest: '3.09 Whooper Swan, on this floor' }).line, 'The nearest room with one is 3.09 Whooper Swan, on this floor.');
  const d = accessWords(accessOf(site, 'd'), { today, system: 'byom' });
  assert.equal(d.find((r) => r.key === 'step').state, 'review');
  assert.match(d.find((r) => r.key === 'captions').line, /meeting app/);
  assert.deepEqual(accessWords(null), []);
});

test('the privacy notice says in plain words what the room senses, from the privacy record', () => {
  const recs = loadPrivacy();
  const r = recordFor(recs, 'video-bar', 'dub');
  assert.ok(r, 'Dublin video bars have a privacy record');
  const p = privacyWords([r]);
  assert.equal(p.any, true);
  assert.equal(p.lead, 'This room has a camera and microphones for video calls.');
  assert.ok(p.points.some((t) => /fewer than 3/.test(t)), 'a count never says who was here');
  assert.ok(p.points.some((t) => /13 months/.test(t)), 'how long counts are kept');
  assert.ok(p.never.includes('Face recognition or speaker identification'));
  assert.equal(privacyWords([]).any, false);
});

test('accessibility data names real guide rooms at its own site, and every office with guide rooms has a file', () => {
  const dir = path.join(ROOT, 'data', 'accessibility');
  const files = Object.fromEntries(readdirSync(dir).map((f) => [f.slice(0, -5), parse(readFileSync(path.join(dir, f), 'utf8'))]));
  const spaces = {};
  for (const s of readdirSync(path.join(ROOT, 'data', 'spaces'))) for (const f of readdirSync(path.join(ROOT, 'data', 'spaces', s))) spaces[f.slice(0, -5)] = parse(readFileSync(path.join(ROOT, 'data', 'spaces', s, f), 'utf8'));
  const problems = [];
  for (const [site, a] of Object.entries(files)) {
    if (a.site !== site) problems.push(`${site}.yaml says site ${a.site}`);
    for (const id of Object.keys(a.rooms)) if (spaces[id]?.site !== site) problems.push(`${site}.yaml: ${id} is not a space at ${site}`);
  }
  const meetingSites = new Set(Object.values(spaces).filter((s) => /^(conference|hybrid|huddle|focus|office$)/.test(s.space_type)).map((s) => s.site));
  for (const s of meetingSites) if (!files[s]) problems.push(`no data/accessibility/${s}.yaml`);
  assert.deepEqual(problems, []);
});

test('the words for what we know, and references and times', () => {
  assert.equal(knownWords({ state: 'in-progress', priority: 2 }), 'Someone is working on it. Fix due today.');
  assert.match(knownWords({ state: 'on-hold', priority: 3, hold: 'awaiting-parts' }), /^Waiting for a part/);
  assert.notEqual(newRef('INC', 1000), newRef('INC', 2000));
  assert.equal(localStamp(Date.UTC(2026, 0, 5, 23, 30), 'Asia/Tokyo'), '2026-01-06T08:30');
});

test('the QR code: right version, finder patterns, timing and format bits', () => {
  const url = 'https://kb35.github.io/keia-atlas/guide/dub-3-02/';
  const q = qrMatrix(url);
  assert.equal(q.version, 4, `${url.length} bytes fit version 4 at level M`);
  assert.equal(q.size, 33);
  // The three finder patterns: a dark ring, a light ring, a dark 3 by 3 centre.
  for (const [cx, cy] of [[3, 3], [q.size - 4, 3], [3, q.size - 4]]) {
    for (let d = -3; d <= 3; d++) { assert.ok(q.dark(cx + d, cy - 3)); assert.ok(q.dark(cx - 3, cy + d)); }
    assert.ok(!q.dark(cx - 2, cy - 2) && q.dark(cx, cy) && q.dark(cx + 1, cy + 1));
  }
  for (let i = 8; i < q.size - 8; i++) assert.equal(q.dark(i, 6), i % 2 === 0, 'timing row');
  assert.ok(q.dark(8, q.size - 8), 'the dark module');
  // Format bits: level M and the chosen mask, BCH coded, both copies the same.
  let bits = 0;
  for (let i = 0; i <= 5; i++) bits |= (q.dark(8, i) ? 1 : 0) << i;
  bits |= (q.dark(8, 7) ? 1 : 0) << 6; bits |= (q.dark(8, 8) ? 1 : 0) << 7; bits |= (q.dark(7, 8) ? 1 : 0) << 8;
  for (let i = 9; i < 15; i++) bits |= (q.dark(14 - i, 8) ? 1 : 0) << i;
  let copy = 0;
  for (let i = 0; i < 8; i++) copy |= (q.dark(q.size - 1 - i, 8) ? 1 : 0) << i;
  for (let i = 8; i < 15; i++) copy |= (q.dark(8, q.size - 15 + i) ? 1 : 0) << i;
  assert.equal(bits, copy);
  const data = (bits ^ 0x5412) >>> 10;
  assert.equal(data >>> 3, 0, 'level M');
  assert.equal(data & 7, q.mask);
  // Longer text moves up a version; the path covers the quiet zone.
  assert.ok(qrMatrix('x'.repeat(120)).version > 4);
  assert.equal(qrPath(url).size, 33 + 8);
  assert.throws(() => qrMatrix('x'.repeat(400)));
});
