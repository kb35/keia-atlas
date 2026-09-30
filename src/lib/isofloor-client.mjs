// Browser side of IsoFloor.astro: change a space's state on the drawing in place. The ring's shape and the room's
// tint both follow the data-state attribute (the CSS in IsoFloor.astro eases them over --dur-state).
export function setSpace(root, id, state) {
  root.querySelectorAll(`[data-ifl-room="${id}"], [data-ifl-ring="${id}"]`).forEach((el) => el.setAttribute('data-state', state));
}

// Every space on the drawing to one state.
export function setAll(root, state, except = {}) {
  root.querySelectorAll('[data-ifl-ring]').forEach((el) => setSpace(root, el.getAttribute('data-ifl-ring'), except[el.getAttribute('data-ifl-ring')] ?? state));
}

// Switch on the device dots of one batch (a class), in turn: each dot's own --i staggers its transition.
export function showKit(root, cls, on = true) {
  root.querySelectorAll(cls ? `[data-ifl-dev="${cls}"]` : '[data-ifl-dev]').forEach((el) => el.classList.toggle('is-on', on));
}
