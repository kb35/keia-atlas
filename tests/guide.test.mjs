// The room guide: the words it builds from a room's data, the records a report and a request make,
// and the QR encoder behind the table card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomGuide, likelyPosition, reportIncident, makeRequest, fromEvents, knownWords, newRef, localStamp } from '../src/lib/guide.mjs';
import { qrMatrix, qrPath } from '../src/lib/qr.mjs';

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
  const req = makeRequest({ room, kind: 'home', what: '', name: 'Aoife', ms });
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
