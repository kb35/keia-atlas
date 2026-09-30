// The help registry (src/lib/help.mjs) as one small file, built once. The "?" Help switch fetches it the first
// time help is turned on, so pages do not carry every card.
import { helpJson } from '../../lib/help.mjs';
export async function GET() {
  return new Response(JSON.stringify(helpJson()), { headers: { 'Content-Type': 'application/json' } });
}
