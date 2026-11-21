/**
 * Promote HEAD of ONE existing bound Apps Script to its ONE existing /exec deployment.
 * It never uploads source; run clasp push and back up source BEFORE using --apply.
 */
import { pathToFileURL } from 'node:url';
import { validateId } from './config.mjs';

export function planWebAppRelease(args) {
  const [scriptIdRaw, spreadsheetIdRaw, deploymentIdRaw, ...flags] = args;
  if (flags.some((x) => x !== '--apply') || flags.filter((x) => x === '--apply').length > 1 ||
      !scriptIdRaw || !spreadsheetIdRaw || !deploymentIdRaw) {
    throw new Error('Usage: npm run release-webapp -- SCRIPT_ID SPREADSHEET_ID DEPLOYMENT_ID [--apply]');
  }
  return { scriptId: validateId(scriptIdRaw), spreadsheetId: validateId(spreadsheetIdRaw),
    deploymentId: validateId(deploymentIdRaw), apply: flags.includes('--apply') };
}

export async function promoteWebApp({ scriptId, spreadsheetId, deploymentId, token, request = fetch,
  description = 'TAK lab release' }) {
  scriptId = validateId(scriptId);
  spreadsheetId = validateId(spreadsheetId);
  deploymentId = validateId(deploymentId);
  if (!token || typeof token !== 'string') throw new Error('An OAuth token is required.');
  const base = `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}`;
  async function api(path, method, body) {
    const response = await request(base + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw new Error(`Apps Script ${method} failed (HTTP ${response.status}). Check token scopes and access.`);
    return response.json();
  }

  // Preflight: never update a script attached to the wrong spreadsheet.
  const project = await api('', 'GET');
  if (project.scriptId !== scriptId || project.parentId !== spreadsheetId) {
    throw new Error('STOP: script project is not bound to the expected spreadsheet.');
  }
  const deployment = await api(`/deployments/${encodeURIComponent(deploymentId)}`, 'GET');
  if (deployment.deploymentId !== deploymentId || deployment.deploymentConfig?.scriptId !== scriptId ||
      !deployment.entryPoints?.some((e) => e.entryPointType === 'WEB_APP' && e.webApp?.url?.endsWith('/exec'))) {
    throw new Error('STOP: the deployment ID is not the expected existing /exec web app.');
  }
  const previousUrl = deployment.entryPoints.find((e) => e.entryPointType === 'WEB_APP').webApp.url;
  const previousVersion = deployment.deploymentConfig.versionNumber;
  const manifestFileName = deployment.deploymentConfig.manifestFileName || 'appsscript';

  // A failed deployment update leaves the previous /exec version in place;
  // the just-created immutable version can safely remain in project history.
  const version = await api('/versions', 'POST', { description });
  if (!Number.isInteger(version.versionNumber) || version.versionNumber < 1) {
    throw new Error('Version creation returned no usable version number. Deployment not changed.');
  }
  const result = await api(`/deployments/${encodeURIComponent(deploymentId)}`, 'PUT', {
    deploymentConfig: { scriptId, versionNumber: version.versionNumber, manifestFileName, description }
  });
  if (result.deploymentId !== deploymentId ||
      result.deploymentConfig?.versionNumber !== version.versionNumber ||
      !result.entryPoints?.some((e) => e.entryPointType === 'WEB_APP' && e.webApp?.url === previousUrl)) {
    throw new Error('Update response differs from the expected deployment ID, version or URL. Check Google manually.');
  }
  return { scriptId, spreadsheetId, deploymentId, previousVersion,
    versionNumber: version.versionNumber, url: previousUrl };
}

async function main() {
  const plan = planWebAppRelease(process.argv.slice(2));
  console.log(JSON.stringify({ mode: plan.apply ? 'APPLY' : 'DRY RUN',
    action: 'Create version from the existing HEAD and advance this ONE /exec deployment',
    ...plan }, null, 2));
  if (!plan.apply) {
    console.log('No Google calls made. Back up the script and upload the tested code first.');
    return;
  }
  const token = process.env.GOOGLE_ACCESS_TOKEN?.trim();
  if (!token) throw new Error('Set GOOGLE_ACCESS_TOKEN with script.projects and script.deployments OAuth scopes.');
  const result = await promoteWebApp({ ...plan, token });
  console.log(`Promoted /exec from version ${result.previousVersion} to ${result.versionNumber}; URL unchanged: ${result.url}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
