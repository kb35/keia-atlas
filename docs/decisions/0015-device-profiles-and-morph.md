# 0015. Device profiles with the model morph

- Status: Accepted
- Date: 2026-09-28

## Context

The first version of the console site (0012) had device model pages but no device profiles, and drew ports as generic shapes. The brief asks for device profiles, and for switching models on a profile to morph one drawing into the next, as the prototype did. It also asks for light, auto and dark to be one icon beside the signed-in user, with Settings behind a gear.

## Decision

- A device profile page per device class shows what healthy means on each platform (the Keia object profile), its cross-checks and troubleshooting, and every model of the class.
- The prototype's hand-traced front drawings are carried over unchanged. Every model of a type draws the same named parts in the same order, so parts can be matched.
- Each model has its own page, so every state has a link. Choosing a model fetches that page and morphs the page in place with the prototype's keyed DOM morph: parts with the same `data-k` key keep their element, and CSS transitions move them, with a spring overshoot. Ports are keyed by their id, so a port both models share slides to its new place.
- Models without a traced drawing show the class outline, and say so.
- One button beside the user cycles Auto, Light and Dark. The gear opens Settings, which also holds the mode choice.

## Consequences

- The morph works without a client framework and degrades to a normal page load if the fetch fails.
- Reduced motion turns the transitions off; the page still updates in place.
- Only 13 of the 40 models have traced drawings. Adding one means tracing it with the same part names as its type.

Sources: [MDN: CSS transitions](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_transitions/Using_CSS_transitions), [MDN: History.pushState](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState).
