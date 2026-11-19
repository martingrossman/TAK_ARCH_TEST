import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const folder of ['tools', 'test', 'examples/bound', 'examples/central']) {
  for (const file of await readdir(join(root, folder))) {
    const path = join(root, folder, file);
    if (/\.(mjs|js)$/.test(file)) {
      const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
      if (result.status !== 0) process.exit(result.status || 1);
    }
    if (file === 'appsscript.json') {
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      const scope = folder.endsWith('bound') ? 'spreadsheets.currentonly' : 'spreadsheets';
      if (manifest.runtimeVersion !== 'V8' ||
          JSON.stringify(manifest.oauthScopes) !== JSON.stringify([`https://www.googleapis.com/auth/${scope}`])) {
        throw new Error(`Unexpected runtime or scopes in ${path}`);
      }
    }
  }
}
console.log('JavaScript syntax and Apps Script manifests passed.');
