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
// room whose class is in the list (a whole-room report when none is).
export const SYMPTOMS = [
  { id: 'picture', label: 'No picture', hint: 'The screen is blank or says no signal', classes: ['display', 'monitor', 'av-extender', 'av-switcher'], priority: 2 },
  { id: 'sound', label: 'No sound', hint: 'We cannot hear, or they cannot hear us', classes: ['loudspeaker', 'amplifier', 'microphone', 'video-bar', 'codec', 'desk-video-device', 'monitor'], priority: 2 },
  { id: 'join', label: "Can't join a call", hint: 'The meeting will not start or connect', classes: ['video-bar', 'codec', 'desk-video-device', 'touch-controller'], priority: 2 },
  { id: 'camera', label: 'Camera', hint: 'No picture of us, or it points the wrong way', classes: ['camera', 'video-bar', 'codec', 'desk-video-device', 'monitor'], priority: 3 },
  { id: 'other', label: 'Something else', hint: 'Anything else in the room', classes: [], priority: 3 },
];
export const symptomOf = (id) => SYMPTOMS.find((s) => s.id === id) ?? SYMPTOMS[SYMPTOMS.length - 1];

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

// The incident a report makes: the same shape as data/incidents (schemas/ext/incident.schema.yaml), from
// the room guide instead of ServiceNow, and labelled as demo data.
export function reportIncident({ room, symptom, note = '', name = '', ms = Date.now(), ref = newRef('INC', ms) }) {
  const s = symptomOf(symptom);
  const pos = likelyPosition(room.positions ?? [], s.id);
  const at = localStamp(ms, room.tz ?? 'UTC');
  const caller = name.trim() || 'Someone in the room';
  const title = `${s.label} in ${room.title}`;
  return {
    number: ref,
    opened: at,
    short_description: title,
    description: note.trim() || undefined,
    caller,
    priority: s.priority,
    state: 'new',
    assignment_group: REGION_GROUP[room.region] ?? 'Service desk',
    subject: pos ? { kind: 'device', room: room.id, position: pos.position, device: pos.current?.asset_tag } : { kind: 'room', room: room.id },
    history: [
      { at, state: 'new', person: caller, source: 'keia_atlas', note: `Reported from the room guide: ${s.label.toLowerCase()}.${note.trim() ? ` "${note.trim()}"` : ''}` },
      { at, source: 'keia_atlas', note: pos ? `Matched to the ${pos.role ?? pos.cls.replace(/-/g, ' ')} (${pos.position}), the most likely device for "${s.label.toLowerCase()}".` : 'A whole-room report: no single device matches.' },
    ],
    keia_atlas: { matched_by: 'Room guide: the room from the QR code, the device from the symptom', symptom: s.id, evidence: [], next: [] },
    source: 'room-guide',
    site: room.site,
    region: room.region,
    where: room.where,
    demo: true,
  };
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
