// The adapters the connect tool knows, by manifest id. Add a new adapter here (docs/connectors/README.md).
import csv from './csv.mjs';
import netbox from './netbox.mjs';
import infoblox from './infoblox.mjs';
import alertmanager from './alertmanager.mjs';
import snipeit from './snipeit.mjs';

export const ADAPTERS = Object.fromEntries([csv, netbox, infoblox, alertmanager, snipeit].map((a) => [a.manifest.id, a]));
