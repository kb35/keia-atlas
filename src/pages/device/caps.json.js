// The unit page's capability cards (UnitCapabilities.astro): licences, certificates, security flaws and config
// backups per unit, worded when the site is built (src/lib/capabilities-view.mjs).
import { unitCaps } from '../../lib/capabilities-view.mjs';
export async function GET() {
  return new Response(JSON.stringify(unitCaps()), { headers: { 'Content-Type': 'application/json' } });
}
