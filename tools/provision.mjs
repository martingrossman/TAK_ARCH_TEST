import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { projectDirectory, validateId, sourceFiles, saveConfig } from './config.mjs';

export function planProvision(args) {
  const [architecture, ...rest] = args;
  projectDirectory(architecture);
  const apply = rest.at(-1) === '--apply';
  const positional = apply ? rest.slice(0, -1) : rest;
  if (positional.length !== (architecture === 'bound' ? 1 : 0)) {
    throw new Error('Usage: npm run provision -- bound SHEET_ID [--apply] OR central [--apply]');
  }
  const body = { title: `TAK_ARCH_TEST ${architecture}` };
  if (architecture === 'bound') body.parentId = validateId(positional[0]);
  return { architecture, apply, body };
}

export async function createAndUpload({ body, files, token, request = fetch, save = async () => {} }) {
  const call = async (path, method, payload) => {
    const response = await request(`https://script.googleapis.com/v1/projects${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000)
    });
    // Do not echo response bodies: errors can contain account or request details.
    if (!response.ok) throw new Error(`${method} Apps Script API failed (HTTP ${response.status}). Check API enablement, scope and account access.`);
    return response.json();
  };
  const project = await call('', 'POST', body);
  const scriptId = validateId(project.scriptId);
  // Save before upload so an interrupted PUT can be recovered using clasp push.
  try {
    await save(scriptId);
    await call(`/${encodeURIComponent(scriptId)}/content`, 'PUT', { files });
  } catch (error) {
    throw new Error(`Project ${scriptId} was created, but setup/upload failed. Do not create again; recover this project with clasp. ${error.message}`);
  }
  return scriptId;
}

async function main() {
  const plan = planProvision(process.argv.slice(2));
  const files = await sourceFiles(plan.architecture);
  console.log(JSON.stringify({ mode: plan.apply ? 'APPLY' : 'DRY RUN', create: plan.body,
    upload: files.map(({ name, type }) => ({ name, type })) }, null, 2));
  if (!plan.apply) {
    console.log('No Google calls made. Add --apply and supply GOOGLE_ACCESS_TOKEN to create a new lab project.');
    return;
  }
  const directory = projectDirectory(plan.architecture);
  try {
    await access(join(directory, '.clasp.json'));
    throw new Error('A local target already exists. Use clasp push; do not provision it again.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const token = process.env.GOOGLE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('GOOGLE_ACCESS_TOKEN is required for --apply.');
  const scriptId = await createAndUpload({ body: plan.body, files, token,
    save: (id) => saveConfig(directory, id) });
  console.log(`Created and uploaded: https://script.google.com/d/${scriptId}/edit`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
