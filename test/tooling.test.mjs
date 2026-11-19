/** Tests safe local configuration and explicit Apps Script API provisioning behavior. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveConfig, sourceFiles, projectDirectory } from '../tools/config.mjs';
import { planProvision, createAndUpload } from '../tools/provision.mjs';

const id = 'disposable_script_id_1234567890';

test('setup creates config without overwriting an existing target', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tak-arch-test-'));
  try {
    await saveConfig(directory, id);
    assert.deepEqual(JSON.parse(await readFile(join(directory, '.clasp.json'), 'utf8')), { scriptId: id, rootDir: '.' });
    await assert.rejects(saveConfig(directory, id), { code: 'EEXIST' });
  } finally { await rm(directory, { recursive: true }); }
});

test('provisioning defaults to dry run and binds only when requested', () => {
  assert.deepEqual(planProvision(['bound', id]), { architecture: 'bound', apply: false,
    body: { title: 'TAK_ARCH_TEST bound', parentId: id } });
  assert.deepEqual(planProvision(['central', '--apply']), { architecture: 'central', apply: true,
    body: { title: 'TAK_ARCH_TEST central' } });
  for (const args of [['bound'], ['bound', 'https://example.com'], ['central', id], ['bound', id, '--force']]) {
    assert.throws(() => planProvision(args));
  }
  assert.throws(() => projectDirectory('../TAK'));
});

test('API creates first, saves recovery config, then uploads complete files to the returned project', async () => {
  const events = [];
  const files = await sourceFiles('bound');
  assert.deepEqual(files.map(({ name, type }) => ({ name, type })), [
    { name: 'Code', type: 'SERVER_JS' }, { name: 'appsscript', type: 'JSON' }
  ]);
  const result = await createAndUpload({ body: { title: 'Lab', parentId: id }, files, token: 'fake-token',
    save: async (created) => { assert.equal(created, id); events.push('save'); },
    request: async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer fake-token');
      events.push(options.method);
      if (options.method === 'POST') {
        assert.equal(url, 'https://script.googleapis.com/v1/projects');
        assert.equal(JSON.parse(options.body).parentId, id);
        return { ok: true, json: async () => ({ scriptId: id }) };
      }
      assert.equal(url, `https://script.googleapis.com/v1/projects/${id}/content`);
      assert.deepEqual(JSON.parse(options.body), { files });
      return { ok: true, json: async () => ({}) };
    }
  });
  assert.equal(result, id);
  assert.deepEqual(events, ['POST', 'save', 'PUT']);
});

test('failed create stops without saving or uploading and does not print secrets', async () => {
  let calls = 0;
  await assert.rejects(createAndUpload({ body: {}, files: [], token: 'secret',
    request: async () => { calls++; return { ok: false, status: 403 }; },
    save: async () => assert.fail('must not save')
  }), /HTTP 403/);
  assert.equal(calls, 1);
});

test('failed upload identifies the created project for recovery', async () => {
  await assert.rejects(createAndUpload({ body: {}, files: [], token: 'secret',
    request: async (url, { method }) => method === 'POST'
      ? { ok: true, json: async () => ({ scriptId: id }) }
      : { ok: false, status: 500 }
  }), new RegExp(`Project ${id} was created.*Do not create again`));
});
