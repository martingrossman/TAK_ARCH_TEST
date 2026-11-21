/** Creates a new, ignored clasp target file for one existing Apps Script project. */
import { projectDirectory, saveConfig } from './config.mjs';

try {
  const [architecture, scriptId, ...extra] = process.argv.slice(2);
  if (extra.length || !scriptId) throw new Error('Usage: npm run setup -- bound|central|registration-client|registration-registry|per-user-webapp SCRIPT_ID');
  await saveConfig(projectDirectory(architecture), scriptId);
  console.log(`Created ignored examples/${architecture}/.clasp.json. No Google calls made.`);
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Local target already exists; inspect .clasp.json before changing it.' : error.message);
  process.exitCode = 1;
}
