import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const scopes = {
  bound: ['spreadsheets.currentonly'],
  central: ['spreadsheets'],
  'registration-client': ['spreadsheets.currentonly', 'script.external_request'],
  'registration-registry': ['spreadsheets']
};
for (const folder of ['tools', 'test', ...Object.keys(scopes).map((name) => `examples/${name}`)]) {
  for (const file of await readdir(join(root, folder))) {
    const path = join(root, folder, file);
    if (/\.(mjs|js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
    if (file === 'appsscript.json') {
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      const expected = scopes[folder.split('/')[1]].map((scope) => `https://www.googleapis.com/auth/${scope}`);
      if (manifest.runtimeVersion !== 'V8' ||
          JSON.stringify(manifest.oauthScopes) !== JSON.stringify(expected)) {
        throw new Error(`Unexpected runtime or scopes in ${path}`);
      }
    }
  }
}
console.log('JavaScript syntax and Apps Script manifests passed.');
