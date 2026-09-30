// Alertmanager webhook importer: saved webhook payloads to events (docs/connectors/alertmanager.md).
//
// Prometheus Alertmanager groups alerts from Prometheus, its exporters and anything else that speaks its API, and
// sends each group to its receivers. Its webhook receiver POSTs JSON (payload version 4): a group status, the
// receiver's name, the group's labels, the Alertmanager's own URL, and a list of alerts, each with its status
// (firing or resolved), labels, annotations, start and end time, a link to the rule that raised it, and a
// fingerprint that stays the same for the same alert.
//
// The file is one saved payload, or an array of them (several deliveries in order). Each alert becomes one event:
//   io.keia.alert.firing when it is raised, io.keia.alert.resolved when it clears, with the fingerprint as the key,
// so a flapping device gives one key, not ten incidents. The alert names its host in a label (instance, host,
// hostname or device); the event's subject is the connected unit of that name, when another system already brought
// it in. Metrics are never copied: Keia keeps the alert, and the link back to the rule.
//
// A live receiver will take the same JSON on an HTTPS endpoint; the mapping here is the one it will use.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineAdapter, mapStatus, text } from '../adapter.mjs';

const SEVERITY = { critical: 'critical', page: 'critical', error: 'major', major: 'major', high: 'major', warning: 'warning', warn: 'warning', minor: 'warning', info: 'info', informational: 'info', none: 'info', low: 'info' };
const HOST_LABELS = ['instance', 'host', 'hostname', 'device', 'target'];
// Alertmanager sends "0001-01-01T00:00:00Z" as the end of an alert still firing.
const realTime = (t) => (typeof t === 'string' && !t.startsWith('0001-') ? t : undefined);

function open(file) {
  const where = path.basename(file);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const payloads = Array.isArray(data) ? data : [data];
  const problems = [];
  const warnings = [];
  const alerts = [];
  let instance;
  payloads.forEach((p, i) => {
    if (!p || typeof p !== 'object' || !Array.isArray(p.alerts)) {
      problems.push(`${where}: payload ${i + 1} is not an Alertmanager webhook payload (no "alerts" list)`);
      return;
    }
    if (p.version && String(p.version) !== '4') warnings.push(`${where}: payload ${i + 1} is version ${p.version}; this importer reads version 4.`);
    if (Number(p.truncatedAlerts) > 0) warnings.push(`${where}: payload ${i + 1} left out ${p.truncatedAlerts} alerts (max_alerts on the receiver). Raise the limit so none are lost.`);
    try { instance ??= p.externalURL ? new URL(p.externalURL).host : undefined; } catch { /* no instance */ }
    for (const a of p.alerts) {
      if (!a?.fingerprint) { problems.push(`${where}: an alert in payload ${i + 1} has no fingerprint`); continue; }
      alerts.push({ alert: a, receiver: p.receiver, groupLabels: p.groupLabels, externalURL: p.externalURL });
    }
  });
  // The same alert delivered twice in one file (a repeat notification) is one event.
  const unique = new Map();
  for (const x of alerts) unique.set(`${x.alert.fingerprint}|${x.alert.status}|${x.alert.startsAt}`, x);
  return { file, instance, alerts: [...unique.values()], problems, warnings };
}

const recordId = (a) => `${a.fingerprint}/${a.startsAt}/${a.status}`;

function list(source, kind) {
  return kind === 'event' ? source.alerts : [];
}

function get(source, kind, key) {
  return list(source, kind).find((x) => recordId(x.alert) === key);
}

function map(kind, x, ctx) {
  const a = x.alert;
  const state = a.status === 'resolved' ? 'resolved' : 'firing';
  const labels = a.labels ?? {};
  const host = HOST_LABELS.map((l) => text(labels[l])).find(Boolean);
  const subject = ctx.matchConnected('unit', ...HOST_LABELS.map((l) => labels[l]));
  if (host && !subject) ctx.warn(`${labels.alertname ?? 'an alert'} on ${host}: no connected unit has that name, so its event has no subject. Import the device records first.`);
  const severityNative = text(labels.severity);
  return {
    id: ctx.idFor(a.fingerprint, state, a.startsAt),
    type: `io.keia.alert.${state}`,
    subject,
    time: state === 'resolved' ? realTime(a.endsAt) ?? a.startsAt : a.startsAt,
    severity: mapStatus(SEVERITY, severityNative),
    severity_native: severityNative,
    state,
    key: a.fingerprint,
    data: Object.fromEntries(Object.entries({
      alertname: text(labels.alertname),
      summary: text(a.annotations?.summary),
      description: text(a.annotations?.description),
      host,
      started_at: a.startsAt,
      ended_at: state === 'resolved' ? realTime(a.endsAt) : undefined,
    }).filter(([, v]) => v !== undefined)),
    source: { record_id: recordId(a), url: text(a.generatorURL) },
    raw: x,
  };
}

export default defineAdapter({
  manifest: {
    id: 'alertmanager',
    name: 'Alertmanager webhook importer',
    description: "Alerts raised and cleared, from Alertmanager's webhook payloads saved to a file. Reads a file; calls nothing.",
    version: '0.1.0',
    tier: 'community',
    owner: 'Keia Atlas maintainers',
    system: 'alertmanager',
    reads: 'file',
    objects: {
      event: {
        actions: ['read'],
        fields: {
          type: 'source', subject: 'source', time: 'source', severity: 'source', severity_native: 'source', state: 'source', key: 'source', data: 'source',
        },
      },
    },
    events: { mode: 'file' },
    rate: { requests_per_minute: 0, note: 'Reads saved payloads. The live receiver is an HTTPS endpoint Alertmanager posts to; Keia calls nothing.' },
    hosts: [],
    credentials: [],
  },
  open,
  list,
  get,
  map,
});
