// The room guide: what someone in a room
// needs to use it, worked out from the room's own data, and the records a report or a request makes.
// Pure: the pages pass the room in, and tests/guide.test.mjs checks the rules on small made-up rooms.
//
// Where the words come from:
//   How a call starts    the room's build option: a video bar or codec with a touch panel runs the meeting
//                        itself (house rooms are Google Meet rooms, data/configurations/poly-x-google-meet.yaml,
//                        which also join Teams and Zoom meetings as a guest); a video bar with no touch panel
//                        is bring your own meeting (the laptop runs the call over one USB-C cable); a monitor
//                        or nothing means the laptop does it all.
//   Sharing a screen     the option's wiring: every cable that ends at "laptop" is a way in, with its cable
//                        type and where it is (the table, the wall, the video bar).
//   Extras               a booking panel by the door and a whiteboard camera, only when the room has them.
//                        Lights and blinds are not in the data yet, so the guide says nothing about them.

// Which rooms have a guide: rooms people meet or work in (KIND in src/lib/data.mjs). Desks, home office
// kits, comms rooms, stores and shared spaces do not have one yet.
export const GUIDE_KINDS = ['meeting', 'small'];

export const PLATFORMS = [
  { id: 'meet', label: 'Google Meet' },
  { id: 'teams', label: 'Teams' },
  { id: 'zoom', label: 'Zoom' },
];

// What people tap when something is wrong, and which device it most likely is: the first position in the
// room whose class is in `classes` (a whole-room report when none is). `shows` is the kit a room must have for
// the symptom to be offered at all (symptomsFor), so a focus room is never asked about its touch panel.
// `why` is the reason for the proposed priority, in the words the incident keeps.
export const SYMPTOMS = [
  { id: 'picture', label: 'Display is black', hint: 'Blank, or it says no signal', classes: ['display', 'monitor', 'av-extender', 'av-switcher'], shows: ['display', 'monitor'], priority: 2, why: 'the room cannot show a meeting' },
  { id: 'sound', label: 'No sound', hint: 'We cannot hear them, or they cannot hear us', classes: ['loudspeaker', 'amplifier', 'microphone', 'video-bar', 'codec', 'desk-video-device', 'monitor'], shows: ['loudspeaker', 'microphone', 'video-bar', 'codec', 'desk-video-device', 'monitor'], priority: 2, why: 'the room cannot hold a call' },
  { id: 'camera', label: 'Camera not detected', hint: 'The call has no picture of us', classes: ['camera', 'video-bar', 'codec', 'desk-video-device', 'monitor'], shows: ['camera', 'video-bar', 'codec', 'desk-video-device', 'monitor'], priority: 3, why: 'the call goes on without the room\'s picture' },
  { id: 'join', label: "Can't join the meeting", hint: 'It will not start or connect', classes: ['video-bar', 'codec', 'desk-video-device', 'touch-controller'], shows: ['video-bar', 'codec', 'desk-video-device'], priority: 2, why: 'the room cannot hold a call' },
  { id: 'panel', label: 'Touch panel unresponsive', hint: 'The panel on the table does not react', classes: ['touch-controller'], shows: ['touch-controller'], priority: 2, why: 'nobody can start a call from the room' },
  { id: 'booking', label: 'Booking panel is wrong', hint: 'The panel by the door shows the wrong meetings', classes: ['scheduler-panel'], shows: ['scheduler-panel'], priority: 3, why: 'people can still meet; the booking shows wrong' },
  { id: 'other', label: 'Something else', hint: 'Anything else in the room', classes: [], shows: [], priority: 3, why: 'not yet known; the technician checks' },
];
export const symptomOf = (id) => SYMPTOMS.find((s) => s.id === id) ?? SYMPTOMS[SYMPTOMS.length - 1];
// The symptoms this room's kit can have, in the order above; "Something else" is always last.
export const symptomsFor = (classes = []) => SYMPTOMS.filter((s) => s.id === 'other' || s.shows.some((c) => classes.includes(c)));

export const REQUESTS = [
  { id: 'help', label: 'Help in this room', hint: 'Someone to show you how, or set up for an event' },
  { id: 'change', label: 'A change to this room', hint: 'Another screen, a camera, a cable, a move' },
  { id: 'home', label: 'Home office kit', hint: 'A monitor, dock or network for working from home' },
];
export const requestOf = (id) => REQUESTS.find((r) => r.id === id) ?? REQUESTS[0];

// When a fix is due, in words, from the service desk design's targets
// (resolve P1 4 h, P2 8 h, P3 3 working days, P4 10 working days).
export const FIX_DUE = { 1: 'Fix due within hours.', 2: 'Fix due today.', 3: 'Fix due within three working days.', 4: 'Fix due within two weeks.' };
const HOLD_WORDS = { 'awaiting-vendor': 'Waiting for the vendor.', 'awaiting-parts': 'Waiting for a part.', 'awaiting-change': 'Waiting for a planned change.', 'awaiting-caller': 'Waiting to hear from the person who reported it.' };
// "We know" words for an open incident: what is being done, then when it should be fixed.
export function knownWords({ state, priority, hold = null }) {
  const doing = state === 'new' ? 'Reported, and with the local team.' : state === 'on-hold' ? HOLD_WORDS[hold] ?? 'On hold.' : 'Someone is working on it.';
  return `${doing} ${FIX_DUE[priority] ?? ''}`.trim();
}

const REGION_GROUP = { amer: 'AV and IT, Americas', emea: 'AV and IT, EMEA', apac: 'AV and IT, Asia Pacific' };

// The devices a room has: required ones, and optional ones only when fitted.
export function equipmentOf(option, fitted = []) {
  return (option?.equipment ?? []).filter((e) => e.requirement === 'required' || fitted.includes(e.key));
}

const CABLE = { 'usb-c': 'USB-C', thunderbolt: 'USB-C', hdmi: 'HDMI' };
const WHERE = { 'below-table': 'at the table', 'table-top': 'at the table', 'floor-box': 'at the table', wall: 'at the wall', 'display-wall': 'from the video bar', desk: 'at the desk' };

// How this room is used, as three short lines per task. room: { option, fitted, kind }.
export function roomGuide({ option, fitted = [], name = 'this room' }) {
  const eq = equipmentOf(option, fitted);
  const has = (cls) => eq.some((e) => e.class === cls);
  const one = (cls) => eq.find((e) => e.class === cls) ?? null;
  const panel = one('touch-controller');
  const bar = one('video-bar') ?? one('codec') ?? one('desk-video-device');
  const monitor = one('monitor');
  const screens = eq.filter((e) => e.class === 'display').length;
  const system = bar && (panel || bar.class === 'desk-video-device') ? 'room' : bar ? 'byom' : monitor ? 'monitor' : 'none';
  const tapOn = bar?.class === 'desk-video-device' ? 'the screen on the desk' : 'the touch panel on the table';
  const onScreen = screens > 1 ? 'the room screens' : monitor && !screens ? 'the monitor' : 'the room screen';

  // Ways in for a laptop, from the wiring.
  const inputs = (option?.wiring ?? []).filter((w) => w.to === 'laptop' && (!w.when || fitted.includes(w.when)))
    .map((w) => {
      const key = w.from.split('.')[0].split('#')[0];
      const e = eq.find((x) => x.key === key);
      if (!e) return null;
      const where = /pass-through/i.test(w.notes ?? '') ? 'at the wall' : e.class === 'video-bar' ? 'from the video bar' : e.class === 'monitor' ? 'from the monitor' : WHERE[e.location] ?? 'at the table';
      return { cable: CABLE[w.cable] ?? 'USB-C', where, side: /left|right/i.test(w.notes ?? '') ? w.notes.toLowerCase().replace(/ side.*$/, '') : null };
    }).filter(Boolean);
  const cable = inputs[0] ?? null;
  const cableWords = cable ? `the ${cable.cable} cable ${cable.where}` : null;

  // Start a meeting: one set of three lines per platform.
  const APP = { meet: 'Meet', teams: 'Teams', zoom: 'Zoom' };
  const SETTINGS = { meet: 'In Meet, open Settings', teams: 'In Teams, open Device settings', zoom: 'In Zoom, open Settings, Audio and Video,' };
  const join = {};
  for (const p of PLATFORMS) {
    if (system === 'room') {
      join[p.id] = [
        `Add ${name} to the ${p.id === 'meet' ? 'Google Calendar' : APP[p.id]} invite.`,
        `Tap your meeting on ${tapOn}.`,
        p.id === 'meet' ? 'Tap Join. No invite? Tap Join with a code and type the code.' : `Tap Join. The room joins the ${APP[p.id]} meeting as a guest, with its own camera and sound.`,
      ];
    } else if (system === 'byom') {
      join[p.id] = [
        `Join the ${APP[p.id]} meeting on your laptop as usual.`,
        `Plug ${cableWords ?? 'the USB-C cable from the video bar'} into your laptop.`,
        `${SETTINGS[p.id]} and pick the room's video bar for camera, microphone and speaker.`,
      ];
    } else {
      join[p.id] = [
        `Join the ${APP[p.id]} meeting on your laptop as usual.`,
        cableWords ? `Plug ${cableWords} into your laptop for a bigger picture.` : 'Use your laptop screen; this room has no room screen.',
        monitor ? `${SETTINGS[p.id]} and pick the monitor for camera and sound if it has them.` : 'Use headphones if others are working nearby.',
      ];
    }
  }
  const joinLede = system === 'room' ? 'This room runs the call itself. You do not need your laptop.'
    : system === 'byom' ? 'Bring your own meeting: your laptop runs the call and uses the room camera, microphones and speaker.'
    : 'Your laptop runs the call.';

  // Share your screen.
  const share = !cable ? null : {
    cable: cable.cable,
    where: cable.where,
    lines: system === 'byom' ? [
      `Plug ${cableWords} into your laptop.`,
      `Your laptop sees ${onScreen} as a second screen. Share it from your meeting app.`,
      'The one cable carries camera, microphones, speaker and screen.',
    ] : [
      `Plug ${cableWords} into your laptop.${inputs.length > 1 ? ` There is one on each side of the table.` : ''}`,
      `Your screen shows on ${onScreen} in a few seconds.`,
      system === 'room' ? 'In a call, everyone in the meeting sees it too. Unplug to stop.' : 'Unplug to stop.',
    ],
    // Google Meet rooms also take a share from a laptop in the same meeting (Companion mode): no cable.
    wireless: system === 'room' && bar?.class !== 'codec' ? 'No cable? Join the same meeting on your laptop in Companion mode and tap Present now.' : null,
  };

  const panelLines = panel ? [
    'Tap the screen to wake it. The meetings booked in this room are listed.',
    'In a call, the buttons along the bottom mute the microphones, stop the camera and change the volume.',
    'Tap the red Leave button when you finish, so the room is ready for the next people.',
  ] : null;
  const door = has('scheduler-panel') ? 'The panel by the door shows whether the room is free. Tap it to book the room now, or to check in to your booking.' : null;
  const board = eq.some((e) => e.class === 'camera' && /whiteboard/i.test(`${e.key} ${e.role ?? ''}`)) ? 'The camera over the whiteboard can share the board into your call. Press the share button beside the board.' : null;

  return { system, panel, bar, monitor, screens, join, joinLede, share, panelLines, door, board, inputs };
}

// The device a symptom most likely points at: the first position whose class is on the symptom's list.
// positions: [{ position, cls, role?, current: { asset_tag } }]. Returns null for a whole-room report.
export function likelyPosition(positions, symptomId) {
  const s = symptomOf(symptomId);
  for (const cls of s.classes) {
    const list = positions.filter((p) => p.cls === cls && !/whiteboard/i.test(p.position));
    if (list.length) return [...list].sort((a, b) => a.position.localeCompare(b.position))[0];
  }
  return null;
}

// A reference people can read out: INC or REQ and seven digits, from the time (different each second).
export const newRef = (kind, ms = Date.now()) => `${kind}00${42000 + (Math.floor(ms / 1000) % 58000)}`;
const pad = (n) => String(n).padStart(2, '0');
// Local time at the office, to the minute, in the incident schema's form (2026-09-28T07:58).
export function localStamp(ms, tz) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms))) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}T${pad(+p.hour % 24)}:${p.minute}`;
}

// The booking a report was made in: the half hour it falls in (simulated; stage 2 reads the room's calendar).
export function bookingAt(stamp) {
  const h = +stamp.slice(11, 13), m = +stamp.slice(14, 16) < 30 ? 0 : 30;
  const end = m ? `${pad((h + 1) % 24)}:00` : `${pad(h)}:30`;
  return { from: `${pad(h)}:${pad(m)}`, to: end };
}

// The incident a report makes: the same shape as data/incidents (schemas/ext/incident.schema.yaml), from
// the room guide instead of ServiceNow, and labelled as demo data. Filled in from what the page already knows:
// the space (the QR code), the unit (the symptom), the time, the booking, the report source and a proposed
// priority. The report source is the phone in the room, never a person: no name or account is asked for.
export function reportIncident({ room, symptom, note = '', name = '', ms = Date.now(), ref = newRef('INC', ms) }) {
  const s = symptomOf(symptom);
  const pos = likelyPosition(room.positions ?? [], s.id);
  const at = localStamp(ms, room.tz ?? 'UTC');
  const caller = name.trim() || 'Someone in the room';
  const title = `${s.label} in ${room.title}`;
  const b = bookingAt(at);
  const unit = pos ? `the ${pos.role ?? pos.cls.replace(/-/g, ' ')} (${pos.position}${pos.current?.asset_tag ? `, ${pos.current.asset_tag}` : ''})` : null;
  return {
    number: ref,
    opened: at,
    short_description: title,
    description: note.trim() || undefined,
    caller,
    priority: s.priority,
    priority_proposed: s.priority,
    state: 'new',
    assignment_group: REGION_GROUP[room.region] ?? 'Service desk',
    subject: pos ? { kind: 'device', room: room.id, position: pos.position, device: pos.current?.asset_tag } : { kind: 'room', room: room.id },
    history: [
      { at, state: 'new', person: caller, source: 'keia_atlas', note: `Reported from the room guide: ${s.label.toLowerCase()}.${note.trim() ? ` "${note.trim()}"` : ''}` },
      { at, source: 'keia_atlas', note: unit ? `Matched to ${unit}, the most likely device for "${s.label.toLowerCase()}".` : 'A whole-room report: no single device matches.' },
      { at, source: 'keia_atlas', note: `Priority proposed: P${s.priority}, because ${s.why}.${room.owner ? ` Ready for ${room.owner.name}, the technician for this office.` : ''}` },
    ],
    keia_atlas: {
      matched_by: 'Room guide: the room from the QR code, the device from the symptom',
      symptom: s.id,
      evidence: [
        { from: 'Room guide', says: `Reported from a phone in the room, from the QR code on the table. No name or account is kept.`, level: 'ok' },
        { from: 'Room booking (simulated)', says: `Booked ${b.from} to ${b.to} when this was reported.`, level: 'ok' },
      ],
      next: [],
    },
    source: 'room-guide',
    site: room.site,
    region: room.region,
    where: room.where,
    booking: b,
    demo: true,
  };
}

// ---- After the report: the plain status read back to the person in the room ---------------------------------
// PEOPLE-SCAN principle 7: status is part of the product. Proactive, plain words, the next expected time, and
// the work shown being done. The steps are events on the report's live item (src/lib/live.mjs), so a technician
// taking it in another window shows here too:
//   reported   the record itself (field "reported")
//   with       { who, name, at }        someone took it
//   fixed      { at, by }               they marked it fixed
//   followup   { ok: true | false, at } the person in the room answered "Did it work for you?"
// No is one tap and reopens it with the reason "not fixed for the person".

// When a fix is expected, from the time it came in (simulated targets for the demo: a room that cannot hold
// a call is worth a visit within half an hour).
export const EXPECT_MIN = { 1: 20, 2: 30, 3: 120, 4: 240 };
export function addMinutes(stamp, min) {
  const t = Date.UTC(+stamp.slice(0, 4), +stamp.slice(5, 7) - 1, +stamp.slice(8, 10), +stamp.slice(11, 13), +stamp.slice(14, 16)) + min * 60000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
export const expectedBy = (priority, from) => addMinutes(from, EXPECT_MIN[priority] ?? 120);
const hhmm = (stamp) => stamp?.slice(11, 16) ?? '';

// The status in words. `r` is the report as it is now: replay(events, item) of its live item.
// Returns { step, glyph, word, head, line, steps: [{ key, state, word, at }], ask }.
// `owner` is the room's technician ({ first }), for the words before anyone has taken it.
export function reportStatus(r, { owner: who = null } = {}) {
  const inc = r.reported, first = r.with?.name?.split(' ')[0] ?? null;
  const owner = first ?? who?.first ?? 'The local team';
  const reopened = r.followup?.ok === false;
  const fixed = r.fixed && !reopened;
  const since = reopened ? r.followup.at : r.with?.at ?? inc.opened;
  const expect = expectedBy(inc.priority, since);
  const steps = [
    { key: 'reported', state: 'fine', word: 'Reported', at: hhmm(inc.opened) },
    { key: 'with', state: r.with ? (fixed || r.followup?.ok ? 'fine' : 'progress') : 'planned', word: r.with ? `With ${first}` : `${owner} takes it`, at: r.with ? hhmm(r.with.at) : '' },
    { key: 'fixed', state: fixed || r.followup?.ok ? 'fine' : 'planned', word: 'Fixed', at: fixed || r.followup?.ok ? hhmm(r.fixed.at) : `expected by ${hhmm(expect)}` },
  ];
  // `head` and `line` sit beside the With chip, which names who has it; `sentence` is the whole status in one
  // line for anywhere without the chip (UX-V2 4.6: "With Liam · started 08:03 · expected by 08:30").
  if (reopened) return { step: 'reopened', glyph: 'progress', word: `With ${owner} again`, head: `Reopened at ${hhmm(r.followup.at)}`, line: `Not fixed for you, so it is back with ${owner}. Expected by ${hhmm(expect)}.`, sentence: `With ${owner} again · reopened ${hhmm(r.followup.at)} · expected by ${hhmm(expect)}`, steps, ask: false };
  if (r.followup?.ok) return { step: 'done', glyph: 'fine', word: 'Fixed', head: `Fixed at ${hhmm(r.fixed.at)}`, line: 'You said it works. Thank you for telling us.', sentence: `Fixed at ${hhmm(r.fixed.at)}`, steps, ask: false };
  if (fixed) return { step: 'fixed', glyph: 'fine', word: 'Fixed', head: `Fixed at ${hhmm(r.fixed.at)}`, line: `${owner} marked it fixed. Tell us below if it works for you.`, sentence: `Fixed at ${hhmm(r.fixed.at)}`, steps, ask: true };
  if (r.with) return { step: 'with', glyph: 'progress', word: `With ${first}`, head: `Started ${hhmm(r.with.at)}`, line: `Expected by ${hhmm(expect)}. You'll be told when it's fixed.`, sentence: `With ${first} · started ${hhmm(r.with.at)} · expected by ${hhmm(expect)}`, steps, ask: false };
  return { step: 'reported', glyph: 'review', word: 'Reported', head: `Reported at ${hhmm(inc.opened)}`, line: `${owner} sees this now. You'll be told when it's fixed.`, sentence: `Reported at ${hhmm(inc.opened)} · ${owner} sees this now`, steps, ask: false };
}

// The fields the report filled in, in the words the person reads back ("What we sent").
export function sentFields(inc, room) {
  const s = symptomOf(inc.keia_atlas?.symptom);
  const pos = inc.subject?.kind === 'device' ? (room.positions ?? []).find((p) => p.position === inc.subject.position) : null;
  return [
    ['Space', room.title],
    ['Device', pos ? `${cap(pos.role ?? pos.cls.replace(/-/g, ' '))} · ${inc.subject.device ?? pos.position}` : 'The whole room'],
    ['Problem', s.label],
    ['Time', hhmm(inc.opened)],
    ['Booking', inc.booking ? `${inc.booking.from} to ${inc.booking.to} (simulated)` : 'None'],
    ['Reported from', 'A phone in the room, by the QR code. No name kept.'],
    ['Priority', `P${inc.priority_proposed ?? inc.priority}, proposed: ${s.why}`],
    ['Reference', inc.number],
  ];
}
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Who looks after a room: the technician based at its site, or the one whose scope covers its city.
// people: src/lib/demo.mjs PEOPLE. Returns { id, name, first, initials } or null.
export function ownerFor(people, site, city) {
  const techs = people.filter((p) => p.roleId === 'tech');
  const p = techs.find((t) => t.site === site) ?? (city ? techs.find((t) => new RegExp(`covers ${city}\\b`).test(t.scope)) : null);
  return p ? { id: p.id, name: p.name, first: p.name.split(' ')[0], initials: p.initials } : null;
}

// ---- Access in this room (data/accessibility/, schemas/ext/accessibility.schema.yaml) ---------------------------
const DAY_MS = 86400000;
export const dayWords = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
// The room's record with the site's every_room filled in. `site` is the site's file; null when there is none.
export function accessOf(site, roomId) {
  if (!site) return null;
  const own = site.rooms?.[roomId] ?? {};
  return { ...site.every_room, ...own, step_free: own.step_free ?? site.every_room.step_free, checked_by: site.checked_by };
}
// The rows the guide shows, in plain words: [{ key, state, title, line, note? }]. `system` is roomGuide's.
// A loop is promised only when it passed a test in the last year. `nearest` names a room with a loop that works.
export function accessWords(a, { system = 'room', today = new Date().toISOString().slice(0, 10), nearest = null } = {}) {
  if (!a) return [];
  const out = [];
  const loop = a.hearing_loop;
  if (loop) {
    const age = (Date.parse(today) - Date.parse(loop.tested)) / DAY_MS;
    if (loop.result === 'below-standard') out.push({ key: 'loop', state: 'fault', title: 'Hearing loop', line: `Below standard at its last test, ${dayWords(loop.tested)}.`, note: loop.note });
    else if (age > 366) out.push({ key: 'loop', state: 'review', title: 'Hearing loop', line: `Set your hearing aid to T. Last tested ${dayWords(loop.tested)}; a new test is due.`, note: loop.note });
    else out.push({ key: 'loop', state: 'fine', title: 'Hearing loop', line: `Set your hearing aid to T. Tested ${dayWords(loop.tested)} to ${loop.standard}.` });
  } else {
    out.push({ key: 'loop', state: 'off', title: 'No hearing loop', line: nearest ? `The nearest room with one is ${nearest}.` : 'Ask the office team for a portable loop.' });
  }
  if (a.assistive_listening) out.push({ key: 'listening', state: 'fine', title: 'Assistive listening', line: `${a.assistive_listening.where}.` });
  if (a.captions) {
    out.push({ key: 'captions', state: 'fine', title: 'Live captions', line: system === 'room' ? 'In a call, tap Captions on the touch panel. They show on the room screen.' : system === 'byom' ? 'Turn on captions in your meeting app. They show on the room screen with the call.' : 'Turn on captions in your meeting app.' });
  }
  const sf = a.step_free;
  out.push({ key: 'step', state: sf.value ? 'fine' : 'review', title: sf.value ? 'Step-free access' : 'Not step-free', line: sf.note ?? (sf.value ? 'Level access from the lift, with room to turn at the table.' : 'Ask the office team for another room.') });
  return out;
}

// ---- Privacy notice for the sensing devices in the room (data/privacy/, src/lib/privacy.mjs) ----------------------
// records: the privacy records that cover this room's sensing units (one per record, not per unit).
// Returns { any, lead, points: [text], never: [text], small } in plain words, or { any: false, lead } when nothing senses.
export function privacyWords(records, { monitor = false } = {}) {
  if (!records.length) {
    return { any: false, lead: 'Nothing in this room counts people or sends picture or sound anywhere.', points: monitor ? ['A camera on a desk monitor works only for the laptop plugged into it.'] : [], never: [], small: '' };
  }
  const r = records[0];
  const counted = records.some((x) => x.occupancy?.counted);
  const min = Math.max(...records.map((x) => x.occupancy?.min_group_size ?? 0));
  const points = [
    records.some((x) => x.captures.includes('video') || x.captures.includes('audio')) ? 'Picture and sound go only to the call in progress.' : null,
    'Nothing is recorded by the room. A call is recorded only when someone in it starts the recording.',
    counted ? `It counts how many people are here, as a number. Fewer than ${min} shows as "fewer than ${min}", so a count never says who was here.` : null,
    records.some((x) => x.identifies_people) ? 'It can identify people; the notice by the door says how.' : 'It does not identify anyone.',
    r.retention.split('. ').find((t) => /kept/i.test(t))?.replace(/\.$/, '') + '.',
  ].filter((t) => t && t !== 'undefined.');
  const never = [...new Set(records.flatMap((x) => x.never ?? []))];
  const small = records.map((x) => `${x.name}, ${x.dpia.ref}. Approved by: ${x.approver}.`).join(' ');
  return { any: true, lead: r.notice.text.split('. ')[0] + '.', points, never, small };
}

// A request from the guide (the service desk's Request kind, still being built): three kinds, two fields.
export function makeRequest({ room, kind, what = '', name = '', ms = Date.now(), ref = newRef('REQ', ms) }) {
  const r = requestOf(kind);
  return {
    number: ref,
    opened: localStamp(ms, room.tz ?? 'UTC'),
    kind: r.id,
    title: what.trim() || r.label,
    label: r.label,
    caller: name.trim() || 'Someone in the room',
    state: 'new',
    room: room.id,
    site: room.site,
    source: 'room-guide',
    demo: true,
  };
}

// Live layer items (src/lib/live.mjs): one event makes each record; the pages replay them.
export const REPORT_PREFIX = 'incident:';
export const REQUEST_PREFIX = 'request:';
// Every report and request made from a guide, newest first, from a list of live events.
export function fromEvents(events) {
  const reports = [], requests = [];
  for (const e of events) {
    if (e.field === 'reported' && e.item.startsWith(REPORT_PREFIX) && e.after) reports.push(e.after);
    if (e.field === 'requested' && e.item.startsWith(REQUEST_PREFIX) && e.after) requests.push(e.after);
  }
  const newest = (a, b) => b.opened.localeCompare(a.opened) || b.number.localeCompare(a.number);
  return { reports: reports.sort(newest), requests: requests.sort(newest) };
}
