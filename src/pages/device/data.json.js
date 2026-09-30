// The data behind the device page: one entry per physical unit, plus what every model shares.
import { buildDevices } from '../../lib/devices.mjs';
export async function GET() {
  return new Response(JSON.stringify(buildDevices()), { headers: { 'Content-Type': 'application/json' } });
}
