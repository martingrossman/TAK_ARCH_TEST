import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function load(architecture, services) {
  const source = await readFile(new URL(`../examples/${architecture}/Code.js`, import.meta.url), 'utf8');
  const context = vm.createContext(services);
  vm.runInContext(source, context);
  return context;
}

function fakeSpreadsheet(existing) {
  const state = { writes: [], created: [] };
  const sheet = { getRange(range) {
    assert.equal(range, 'A1:C2');
    return { setValues(rows) { state.writes.push(JSON.parse(JSON.stringify(rows))); } };
  } };
  return { state, spreadsheet: {
    getSheetByName(name) { assert.equal(name, 'TAK_ARCH_TEST'); return existing ? sheet : null; },
    insertSheet(name) { state.created.push(name); existing = true; return sheet; }
  } };
}

for (const architecture of ['bound', 'central']) {
  for (const existing of [false, true]) {
    test(`${architecture}: writes to ${existing ? 'existing' : 'new'} lab tab and reuses it`, async () => {
      const { state, spreadsheet } = fakeSpreadsheet(existing);
      const context = await load(architecture, {
        SpreadsheetApp: architecture === 'bound' ? {
          getActiveSpreadsheet: () => spreadsheet
        } : {
          openById(id) { assert.equal(id, 'disposable-sheet-id'); return spreadsheet; }
        },
        PropertiesService: { getScriptProperties: () => ({ getProperty(key) {
          assert.equal(key, 'TARGET_SPREADSHEET_ID'); return ' disposable-sheet-id ';
        } }) }
      });
      context.helloWorld();
      context.helloWorld();
      assert.deepEqual(state.created, existing ? [] : ['TAK_ARCH_TEST']);
      assert.equal(state.writes.length, 2);
      assert.deepEqual(state.writes[0][0], ['Message', 'Architecture', 'Timestamp (UTC)']);
      assert.deepEqual(state.writes[0][1].slice(0, 2), ['Hello from TAK_ARCH_TEST!', architecture]);
      assert.ok(Number.isFinite(Date.parse(state.writes[0][1][2])));
    });
  }
}

test('bound: missing parent context gives a useful error', async () => {
  const context = await load('bound', { SpreadsheetApp: { getActiveSpreadsheet: () => null } });
  assert.throws(() => context.helloWorld(), /bound spreadsheet/);
});

test('central: missing or blank ID fails before accessing Sheets', async () => {
  for (const id of [null, '', '  ']) {
    const context = await load('central', {
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => id }) }
    });
    assert.throws(() => context.helloWorld(), /TARGET_SPREADSHEET_ID/);
  }
});

test('central: Google permission errors reach the caller', async () => {
  const context = await load('central', {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'some-sheet' }) },
    SpreadsheetApp: { openById() { throw new Error('Permission denied'); } }
  });
  assert.throws(() => context.helloWorld(), /Permission denied/);
});

test('bound: menu points to the runnable function', async () => {
  let added = false;
  const context = await load('bound', { SpreadsheetApp: { getUi: () => ({
    createMenu(name) {
      assert.equal(name, 'TAK lab');
      return { addItem(label, handler) {
        assert.equal(handler, 'helloWorld');
        return { addToUi() { added = true; } };
      } };
    }
  }) } });
  context.onOpen();
  assert.equal(added, true);
});
