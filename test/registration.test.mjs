import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { projectDirectory } from '../tools/config.mjs';
import { planProvision } from '../tools/provision.mjs';

const invitation = '12345678-1234-1234-1234-123456789012'.repeat(2);
const scriptId = 'script_copy_aaaaaaaaaaaaaaaaaaaa';
const spreadsheetId = 'sheet_copy_aaaaaaaaaaaaaaaaaaaaa';
const headers = ['Script ID', 'Spreadsheet ID', 'Reported version', 'Registered at UTC', 'Review status'];
const key = 'INVITE_' + createHash('sha256').update(invitation).digest('hex');
const payload = { invitation, scriptId, spreadsheetId, version: '0.1.0' };

async function registry() {
  const properties = new Map([['REGISTRY_SPREADSHEET_ID', 'private_registry_sheet'],
    [key, JSON.stringify({ expiresAt: Date.now() + 60000 })]]);
  const state = { rows: [headers.slice()], locked: false, failWrite: false, busy: false, alerts: [] };
  const sheet = {
    getRange: () => ({ getValues: () => [state.rows[0]] }),
    getDataRange: () => ({ getValues: () => state.rows }),
    appendRow(row) {
      assert.equal(state.locked, true);
      if (state.failWrite) throw new Error('Private Google details');
      state.rows.push(Array.from(row));
    }
  };
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (name) => properties.get(name) ?? null,
      setProperty: (name, value) => properties.set(name, value),
      deleteProperty: (name) => properties.delete(name),
      getProperties: () => Object.fromEntries(properties)
    }) },
    SpreadsheetApp: {
      openById(id) { assert.equal(id, 'private_registry_sheet'); return { getSheetByName: () => sheet }; },
      flush() {},
      getUi: () => ({ ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' }, Button: { YES: 'YES' },
        alert: (...args) => { state.alerts.push(args); return 'YES'; } })
    },
    LockService: { getScriptLock: () => ({
      waitLock() { if (state.busy) throw new Error('busy'); state.locked = true; },
      releaseLock() { state.locked = false; }
    }) },
    Utilities: { getUuid: randomUUID, DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, text) => [...createHash(algorithm).update(text).digest()] },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (text) => ({
      setMimeType: () => JSON.parse(text)
    }) }
  });
  vm.runInContext(await readFile(new URL('../examples/registration-registry/Code.js', import.meta.url), 'utf8'), context);
  return { context, state, properties, post: (data) => context.doPost({ postData: { contents: JSON.stringify(data) } }) };
}

async function client(services, configured = true) {
  let code = await readFile(new URL('../examples/registration-client/Code.js', import.meta.url), 'utf8');
  if (configured) code = code.replace('PASTE_YOUR_REGISTRY_EXEC_URL_HERE', 'https://script.google.com/macros/s/test_deployment/exec');
  const context = vm.createContext(services);
  vm.runInContext(code, context);
  return context;
}

test('registration: client sends the live copy IDs; server records once and preserves owner review', async () => {
  const server = await registry();
  let currentScript = scriptId;
  const app = await client({
    ScriptApp: { getScriptId: () => currentScript },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => spreadsheetId }) },
    UrlFetchApp: { fetch(url, options) {
      assert.equal(options.method, 'post');
      assert.equal(options.followRedirects, true);
      const response = server.post(JSON.parse(options.payload));
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(response) };
    } }
  });
  app.registerCopy_(invitation);
  assert.equal(server.state.rows.length, 2);
  assert.deepEqual(server.state.rows[1].slice(0, 3), [scriptId, spreadsheetId, '0.1.0']);
  assert.equal(server.state.rows[1][4], 'Pending review');
  server.state.rows[1][4] = 'Approved manually';
  app.registerCopy_(invitation);
  assert.equal(server.state.rows.length, 2);
  assert.equal(server.state.rows[1][4], 'Approved manually');
  currentScript = 'script_copy_bbbbbbbbbbbbbbbbbbbb';
  assert.throws(() => app.registerCopy_(invitation), /not accepted/);
  assert.equal(server.state.locked, false);
});

test('registration: each new copy can enroll with its own invitation', async () => {
  const server = await registry();
  assert.equal(server.post(payload).ok, true);
  const secondInvite = invitation.replaceAll('1', '2');
  const secondKey = 'INVITE_' + createHash('sha256').update(secondInvite).digest('hex');
  server.properties.set(secondKey, JSON.stringify({ expiresAt: Date.now() + 60000 }));
  assert.equal(server.post({ ...payload, invitation: secondInvite,
    scriptId: 'script_copy_bbbbbbbbbbbbbbbbbbbb', spreadsheetId: 'sheet_copy_bbbbbbbbbbbbbbbbbbbbb' }).ok, true);
  assert.equal(server.state.rows.length, 3);
});

test('registration: missing, expired, malformed and reused invitations are rejected', async () => {
  const server = await registry();
  assert.equal(server.post({ ...payload, invitation: invitation.replaceAll('1', '3') }).ok, false);
  assert.equal(server.post({ ...payload, invitation: 'bad' }).ok, false);
  server.properties.set(key, JSON.stringify({ expiresAt: Date.now() - 1 }));
  assert.equal(server.post(payload).ok, false);
  server.properties.set(key, JSON.stringify({ expiresAt: 'invalid' }));
  assert.equal(server.post(payload).ok, false);
  assert.equal(server.state.rows.length, 1);
});

test('registration: unsafe fields and oversized bodies never reach the registry', async () => {
  const server = await registry();
  for (const invalid of [null, {}, { ...payload, version: '=IMPORTXML("x")' },
    { ...payload, scriptId: '=evil_formula_aaaaaaaaaaaa' }, { ...payload, spreadsheetId: 123 }]) {
    assert.equal(server.post(invalid).ok, false);
  }
  assert.equal(server.context.doPost({ postData: { contents: 'x'.repeat(4097) } }).ok, false);
  assert.equal(server.context.doPost({ postData: { contents: '{' } }).ok, false);
  assert.equal(server.state.rows.length, 1);
});

test('registration: failed write is retryable only by the same copy and errors are sanitized', async () => {
  const server = await registry();
  server.state.failWrite = true;
  const failure = server.post(payload);
  assert.equal(failure.ok, false);
  assert.doesNotMatch(JSON.stringify(failure), /Private Google|12345678|private_registry/);
  assert.equal(server.state.locked, false);
  server.state.failWrite = false;
  assert.equal(server.post({ ...payload, spreadsheetId: 'different_sheet_aaaaaaaaaaaaaaa' }).ok, false);
  assert.equal(server.post(payload).ok, true);
  assert.equal(server.state.rows.length, 2);
});

test('registration: unexpected headers and a busy registry fail without writing', async () => {
  const server = await registry();
  server.state.busy = true;
  assert.equal(server.post(payload).ok, false);
  server.state.busy = false;
  server.state.rows[0][0] = 'Wrong column';
  assert.equal(server.post(payload).ok, false);
  assert.equal(server.state.rows.length, 1);
  assert.equal(server.state.locked, false);
});

test('registration: invitation is shown to owner, stored only by hash, and can be revoked', async () => {
  const server = await registry();
  server.context.createInvitation();
  const shown = server.state.alerts[0][1].split('\n')[0];
  assert.match(shown, /^[a-f0-9-]{72}$/);
  assert.ok(!JSON.stringify([...server.properties]).includes(shown));
  assert.equal(server.post({ ...payload, invitation: shown }).ok, true);
  server.context.revokeInvitations();
  assert.equal(server.post({ ...payload, invitation: shown }).ok, false);
  assert.equal(server.properties.get('REGISTRY_SPREADSHEET_ID'), 'private_registry_sheet');
});

test('registration: opening menu or cancelling activation does not send data', async () => {
  const handlers = [];
  const menu = { addItem(label, handler) { handlers.push(handler); return menu; }, addToUi() {} };
  const app = await client({ SpreadsheetApp: { getUi: () => ({ createMenu: () => menu,
    ButtonSet: { OK_CANCEL: 'OK_CANCEL' }, Button: { OK: 'OK' },
    prompt: () => ({ getSelectedButton: () => 'CANCEL' }) }) } });
  app.onOpen();
  app.activateThisCopy();
  assert.deepEqual(handlers, ['activateThisCopy', 'helloWorld']);
});

test('registration: unset URL and malformed invitation fail before network access', async () => {
  const unconfigured = await client({}, false);
  assert.throws(() => unconfigured.registerCopy_(invitation), /configure/);
  const configured = await client({});
  assert.throws(() => configured.registerCopy_('bad'), /valid invitation/);
});

test('registration: network errors, login HTML and rejected responses are clear and do not leak details', async () => {
  for (const fetch of [() => { throw new Error('secret request details'); },
    () => ({ getContentText: () => '<html>Login</html>' }),
    () => ({ getResponseCode: () => 403, getContentText: () => '{"ok":true}' })]) {
    const app = await client({ ScriptApp: { getScriptId: () => scriptId },
      SpreadsheetApp: { getActiveSpreadsheet: () => ({ getId: () => spreadsheetId }) },
      UrlFetchApp: { fetch } });
    assert.throws(() => app.registerCopy_(invitation), (error) => !/secret request/.test(error.message));
  }
});

test('registration: setup supports both new folders; provisioning remains explicitly limited', () => {
  for (const name of ['registration-client', 'registration-registry']) {
    assert.ok(projectDirectory(name).includes(name));
    assert.throws(() => planProvision([name, '--apply']), /bound or central only/);
  }
});
