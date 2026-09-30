// The search index for the whole console, built once at build time. See src/lib/search-index.mjs.
import { buildSearchIndex } from '../../lib/search-index.mjs';
export async function GET() {
  return new Response(JSON.stringify(buildSearchIndex()), { headers: { 'Content-Type': 'application/json' } });
}
