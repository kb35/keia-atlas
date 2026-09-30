#!/usr/bin/env node
// The connect tool: run one adapter over one export file and show what would change in data/connected/.
//
//   npm run connect                                   lists the adapters
//   npm run connect -- <adapter> <file>               shows the diff; writes nothing
//   npm run connect -- <adapter> <file> --apply       writes the new and changed files
//
// Options:
//   --apply              write the files (only when the plan has no problems)
//   --system <name>      the system name in source marks and folder names (default: the adapter's own), for
//                        example netbox-emea when you import from two NetBox instances
//   --data <folder>      the data folder (default: data/ in this repository)
//   --verbose            list every record, not the first 25 of each kind of change
//   --manifest           print the adapter's manifest and the tools it will publish through Keia's MCP gateway

import path from 'node:path';
import { ADAPTERS } from './adapters/index.mjs';
import { planImport, applyPlan, formatPlan, DEFAULT_DATA } from './run.mjs';
import { plannedMcpTools } from './adapter.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
};
const option = (name) => {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};

const apply = flag('--apply');
const verbose = flag('--verbose');
const showManifest = flag('--manifest');
const system = option('--system');
// npm runs scripts from the repository root; paths on the command line are from where the person typed them.
const here = process.env.INIT_CWD ?? process.cwd();
const dataArg = option('--data');
const dataDir = dataArg ? path.resolve(here, dataArg) : DEFAULT_DATA;
const [adapterId, file] = args;

const usage = () => {
  console.log('Keia connect: bring records from another system into data/connected/ (read only)\n');
  console.log('  npm run connect -- <adapter> <file> [--apply] [--system <name>] [--verbose]\n');
  console.log('Adapters');
  for (const a of Object.values(ADAPTERS)) console.log(`  ${a.manifest.id.padEnd(8)} ${a.manifest.name} (${a.manifest.tier}): ${a.manifest.description ?? ''}`);
  console.log('\nWithout --apply nothing is written. See docs/connectors/README.md.');
};

const adapter = ADAPTERS[adapterId];
if (!adapterId || (!adapter && adapterId)) {
  if (adapterId) console.error(`No adapter called "${adapterId}".\n`);
  usage();
  process.exitCode = adapterId ? 1 : 0;
} else if (showManifest) {
  console.log(JSON.stringify({ manifest: adapter.manifest, mcp_tools_planned: plannedMcpTools(adapter.manifest) }, null, 2));
} else if (!file) {
  console.error(`Which file? npm run connect -- ${adapterId} <file>`);
  process.exitCode = 1;
} else {
  const plan = await planImport({ adapter, file: path.resolve(here, file), dataDir, system });
  let written;
  if (apply && !plan.problems.length) written = applyPlan(plan);
  console.log(formatPlan(plan, { apply: apply && !plan.problems.length, verbose, written }));
  if (plan.problems.length) process.exitCode = 1;
}
