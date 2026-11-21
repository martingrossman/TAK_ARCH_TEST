/** Shared validation, project-path, and source-loading helpers for the local tooling. */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export function projectDirectory(architecture) {
  if (!['bound', 'central', 'registration-client', 'registration-registry', 'per-user-webapp'].includes(architecture)) {
    throw new Error('Choose bound, central, registration-client, registration-registry or per-user-webapp.');
  }
  return fileURLToPath(new URL(`../examples/${architecture}/`, import.meta.url));
}

export function validateId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{20,}$/.test(id)) {
    throw new Error('Use a real Google ID, not a URL or a placeholder.');
  }
  return id;
}

export function claspConfig(scriptId) {
  return { scriptId: validateId(scriptId), rootDir: '.' };
}

export async function saveConfig(directory, scriptId) {
  await writeFile(join(directory, '.clasp.json'),
    JSON.stringify(claspConfig(scriptId), null, 2) + '\n', { flag: 'wx' });
}

export async function sourceFiles(architecture) {
  const directory = new URL(`../examples/${architecture}/`, import.meta.url);
  projectDirectory(architecture);
  return Promise.all([
    ['Code', 'SERVER_JS', 'Code.js'],
    ['appsscript', 'JSON', 'appsscript.json']
  ].map(async ([name, type, file]) => ({
    name, type, source: await readFile(new URL(file, directory), 'utf8')
  })));
}
