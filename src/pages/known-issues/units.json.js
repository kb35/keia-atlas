// Known issues per unit (decision 0029), for the unit page (src/pages/device/index.astro), which is filled in
// the browser: every unit on an affected version, or whose version isn't tracked, with the known issues that
// name its model. Built at build time from src/lib/knownissues-view.mjs.
import { issues } from '../../lib/knownissues-view.mjs';
import { href } from '../../lib/data.mjs';

export function GET() {
  const out = {};
  for (const it of issues) {
    for (const [list, sure] of [[it.ex.exposed, 1], [it.ex.unknown, 0]]) {
      for (const u of list) {
        (out[u.tag] ??= []).push({ id: it.ref ?? it.id, t: it.title, to: href(it.path), st: it.statusLabel, fx: it.fixed_in ?? null, fw: u.firmware ?? null, sure, maker: it.maker });
      }
    }
  }
  return new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json' } });
}
