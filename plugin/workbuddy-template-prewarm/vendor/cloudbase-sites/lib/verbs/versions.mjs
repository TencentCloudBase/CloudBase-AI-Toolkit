/**
 * `cloudbase-sites versions` — list saved versions and deployment status.
 */

import { readApp } from "../app-store.mjs";
import { emitOk } from "../emit.mjs";

export const versionsHelp = `cloudbase-sites versions — list saved versions for the cwd

Output:
  {
    siteName,
    currentVersion,        // highest saved n
    currentDeploy,         // version n of last successful deploy
    versions: [{ n, commitSha, label, savedAt, status }],
    lastDeploy: { version, accessUrl, finalUrl, deployedAt }   // or null
  }`;

export async function runVersions(_args) {
  const app = readApp();
  if (!app) {
    emitOk({ siteName: null, versions: [], deployments: [] }, "no save history yet — run `cloudbase-sites save`");
    return;
  }
  const lastDeploy = app.deployments?.[app.deployments.length - 1] || null;
  emitOk({
    siteName: app.siteName,
    currentVersion: app.currentVersion,
    currentDeploy: app.currentDeploy,
    versions: app.versions || [],
    deployments: app.deployments || [],
    lastDeploy,
  });
}
