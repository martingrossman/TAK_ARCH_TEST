/** Simulate copied Sheets, property initialization, and browser web-app requests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../examples/per-user-webapp/Code.js', import.meta.url), 'utf8');
function loadCopy({ id, name, staleId } = {}) {
  const properties = new Map(staleId ? [['TAK_BOUND_SPREADSHEET_ID', staleId]] : []);
  const openCalls = [];
  const uiCalls = [];
  const sheet = { getId: () => id, getName: () => name };
  const ctx = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => sheet,
      openById: (x) => { openCalls.push(x); return sheet; },
      getUi: () => ({
        createMenu: () => ({ addItem() { return this; }, addToUi() {} }),
        alert: (x) => uiCalls.push(x),
        showModalDialog: (x) => uiCalls.push(x)
      })
    },
    PropertiesService: { getScriptProperties: () => ({
      setProperty: (k, v) => properties.set(k, v),
      getProperty: (k) => properties.get(k) || null
    }) },
    HtmlService: { createHtmlOutput: (html) => ({ content: html, setTitle() { return this; }, setWidth() { return this; }, setHeight() { return this; } }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/AKfyczzzzzzzzzzzzzzzzzz/exec' }) }
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { ctx, openCalls, uiCalls, properties };
}

test('web app refuses to open a sheet before initializing the copy', () => {
  const x = loadCopy({ id: 'sheet-a', name: 'Copy A' });
  const html = x.ctx.doGet().content;
  assert.match(html, /not initialized/);
  assert.equal(x.openCalls.length, 0);
});

test('initialization always overwrites a stale template ID', () => {
  const x = loadCopy({ id: 'sheet-b', name: 'Copy B', staleId: 'template-sheet' });
  x.ctx.initializeThisCopy();
  assert.equal(x.properties.get('TAK_BOUND_SPREADSHEET_ID'), 'sheet-b');
  x.ctx.doGet();
  assert.deepEqual(x.openCalls, ['sheet-b']);
});

test('separate copied scripts keep their own sheet IDs', () => {
  const a = loadCopy({ id: 'sheet-a', name: 'Copy A' });
  const b = loadCopy({ id: 'sheet-b', name: 'Copy B' });
  a.ctx.initializeThisCopy();
  b.ctx.initializeThisCopy();
  assert.match(a.ctx.doGet().content, /Copy A/);
  assert.match(b.ctx.doGet().content, /Copy B/);
  assert.deepEqual(a.openCalls, ['sheet-a']);
  assert.deepEqual(b.openCalls, ['sheet-b']);
});

test('spreadsheet names are HTML escaped', () => {
  const x = loadCopy({ id: 'sheet-x', name: '<script>alert(1)</script>' });
  x.ctx.initializeThisCopy();
  const html = x.ctx.doGet().content;
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});
