// Tests for the validator itself.
//
// A validator that always says PASS is worse than none, so these tests prove
// it catches each kind of mistake, using small made-up "widget" fixtures.
//
// Run with:  npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../tools/validate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(here, 'fixtures', name);
const messagesFor = (result, file) =>
  result.errors.filter((e) => e.file.endsWith(file)).map((e) => e.message);

test('the real repo passes', async () => {
  const r = await validate();
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('good data passes', async () => {
  const r = await validate(fixture('good'));
  assert.deepEqual(r.errors, []);
  assert.equal(r.checked, 1);
});

test('bad data fails', async () => {
  const r = await validate(fixture('bad'));
  assert.equal(r.ok, false);
});

test('catches missing fields, wrong types, unknown fields and bad values', async () => {
  const msgs = messagesFor(await validate(fixture('bad')), 'wrong.yaml');
  assert.ok(msgs.some((m) => m.includes('missing required field "name"')), msgs.join('\n'));
  assert.ok(msgs.some((m) => m.startsWith('ports: must be integer')), msgs.join('\n'));
  assert.ok(msgs.some((m) => m.includes('unknown field "colour"')), msgs.join('\n'));
  assert.ok(msgs.some((m) => m.startsWith('face: must be one of "front", "rear"')), msgs.join('\n'));
});

test('points at the line of the problem', async () => {
  const r = await validate(fixture('bad'));
  const ports = r.errors.find((e) => e.file.endsWith('wrong.yaml') && e.message.startsWith('ports'));
  assert.equal(ports.line, 2);
});

test('catches duplicate keys in YAML', async () => {
  const msgs = messagesFor(await validate(fixture('bad')), 'broken.yaml');
  assert.ok(msgs.some((m) => m.startsWith('not valid YAML')), msgs.join('\n'));
});

test('catches files that are not YAML', async () => {
  const msgs = messagesFor(await validate(fixture('bad')), 'notes.txt');
  assert.deepEqual(msgs, ['only .yaml files belong under data/']);
});

test('catches data in a folder the registry does not know', async () => {
  const msgs = messagesFor(await validate(fixture('bad')), 'stray.yaml');
  assert.deepEqual(msgs, ['folder "gadgets" is not listed in schemas/registry.yaml']);
});

// ---- secret check: a password, token or key field must be a vault reference ----

const secretMessages = (result, file) =>
  messagesFor(result, file).filter((m) => m.includes('looks like a secret'));

test('vault references pass the secret check', async () => {
  const msgs = secretMessages(await validate(fixture('secrets')), 'vaulted.yaml');
  assert.deepEqual(msgs, []);
});

test('literal secrets fail, whatever the key spelling and however deep', async () => {
  const r = await validate(fixture('secrets'));
  const msgs = secretMessages(r, 'leaky.yaml');
  const keys = msgs.map((m) => m.match(/field "([^"]+)"/)[1]).sort();
  assert.deepEqual(keys, ['API_KEY', 'Client_Secret', 'admin_password', 'apiKey', 'auth_token', 'passwd', 'private-key']);
  assert.equal(r.ok, false);
});

test('a secret error points at the line of the value', async () => {
  const r = await validate(fixture('secrets'));
  const e = r.errors.find((x) => x.file.endsWith('leaky.yaml') && x.message.includes('"admin_password"'));
  assert.equal(e.line, 4);
});

test('the secret check names a fix a person can copy', async () => {
  const msgs = secretMessages(await validate(fixture('secrets')), 'leaky.yaml');
  assert.ok(msgs[0].includes('vault:<entry name>'), msgs[0]);
});
