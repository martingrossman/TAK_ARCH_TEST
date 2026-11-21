/** Mocked Apps Script API tests: no real Google account or spreadsheet needed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { planWebAppRelease, promoteWebApp } from '../tools/webapp-release.mjs';

const scriptId = 'script-aaaaaaaaaaaaaaaaaaaa';
const spreadsheetId = 'sheet-bbbbbbbbbbbbbbbbbbbb';
const deploymentId = 'AKfycccccccccccccccccccccccccc';
const url = `https://script.google.com/macros/s/${deploymentId}/exec`;
function mockedApi({ parentId = spreadsheetId, web = true, putFails = false } = {}) {
  const calls = [];
  const request = async (path, options) => {
    calls.push({ path, options });
    if (putFails && options.method === 'PUT') return { ok: false, status: 403 };
    const result = options.method === 'GET' && path.endsWith(`/projects/${scriptId}`)
      ? { scriptId, parentId }
      : options.method === 'GET'
        ? { deploymentId, deploymentConfig: { scriptId, versionNumber: 2, manifestFileName: 'appsscript' },
            entryPoints: web ? [{ entryPointType: 'WEB_APP', webApp: { url } }] : [] }
        : options.method === 'POST'
          ? { versionNumber: 3 }
          : { deploymentId, deploymentConfig: { scriptId, versionNumber: 3 },
              entryPoints: [{ entryPointType: 'WEB_APP', webApp: { url } }] };
    return { ok: true, json: async () => result };
  };
  return { calls, request };
}

test('dry run validates IDs and cannot request Google changes', () => {
  assert.deepEqual(planWebAppRelease([scriptId, spreadsheetId, deploymentId]),
    { scriptId, spreadsheetId, deploymentId, apply: false });
  assert.throws(() => planWebAppRelease(['bad', spreadsheetId, deploymentId]));
  assert.throws(() => planWebAppRelease([scriptId, spreadsheetId, deploymentId, '--wrong']));
});

test('creates a version and updates the EXISTING deployment ID (same URL)', async () => {
  const api = mockedApi();
  const result = await promoteWebApp({ scriptId, spreadsheetId, deploymentId, token: 'fake', request: api.request });
  assert.equal(result.versionNumber, 3);
  assert.equal(result.previousVersion, 2);
  assert.equal(result.url, url);
  assert.deepEqual(api.calls.map((x) => x.options.method), ['GET','GET','POST','PUT']);
  assert.match(api.calls[3].path, new RegExp(`/deployments/${deploymentId}$`));
  assert.equal(JSON.parse(api.calls[3].options.body).deploymentConfig.versionNumber, 3);
  assert.equal(api.calls.filter((x) => x.options.method === 'POST').length, 1);
});

test('fails before any write for wrong parent or missing /exec entry point', async () => {
  const wrongParent = mockedApi({ parentId: 'wrong-parent-xxxxxxxxxx' });
  await assert.rejects(promoteWebApp({ scriptId, spreadsheetId, deploymentId, token: 'fake', request: wrongParent.request }), /STOP/);
  assert.deepEqual(wrongParent.calls.map((x) => x.options.method), ['GET']);
  const wrongType = mockedApi({ web: false });
  await assert.rejects(promoteWebApp({ scriptId, spreadsheetId, deploymentId, token: 'fake', request: wrongType.request }), /STOP/);
  assert.deepEqual(wrongType.calls.map((x) => x.options.method), ['GET','GET']);
});

test('a PUT failure is reported without claiming success', async () => {
  const api = mockedApi({ putFails: true });
  await assert.rejects(promoteWebApp({ scriptId, spreadsheetId, deploymentId, token: 'fake', request: api.request }), /HTTP 403/);
  assert.equal(api.calls.at(-1).options.method, 'PUT');
});
