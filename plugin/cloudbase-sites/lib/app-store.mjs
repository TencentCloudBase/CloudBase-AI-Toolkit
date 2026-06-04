/**
 * <cwd>/.cloudbase-sites/app.json — site identity + version history.
 *
 * V2 schema:
 *   {
 *     siteName,                 // stable per cwd, generated once: <dirname>-<6hex>
 *     cwd,
 *     firstSeenAt,
 *     versions: [
 *       { n, commitSha, label, savedAt, status }   // status: saved|deployed|rolled-back
 *     ],
 *     deployments: [
 *       { version, deployedAt, accessUrl, buildId, versionName, buildStatus, finalUrl }
 *     ],
 *     currentVersion,           // highest n in versions
 *     currentDeploy             // version n of last successful deploy
 *   }
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { randomBytes } from "node:crypto";
import { ensureDir, STATE_DIR } from "./preview-state.mjs";

export const APP_JSON_PATH = join(STATE_DIR, "app.json");

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

export function readApp() {
  if (!existsSync(APP_JSON_PATH)) return null;
  try { return JSON.parse(readFileSync(APP_JSON_PATH, "utf8")); }
  catch { return null; }
}

export function writeApp(app) {
  ensureDir(STATE_DIR);
  const tmp = `${APP_JSON_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify(app, null, 2));
  renameSync(tmp, APP_JSON_PATH);
}

// ---------------------------------------------------------------------------
// siteName: stable per cwd, generated once
// ---------------------------------------------------------------------------

export function getOrCreateSiteName() {
  const existing = readApp();
  if (existing?.siteName) return existing.siteName;

  const CWD = process.cwd();
  const raw = basename(CWD).toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
  const safe = raw || "site";
  const suffix = randomBytes(3).toString("hex");
  const name = `${safe}-${suffix}`;

  const app = existing || { versions: [], deployments: [] };
  app.siteName = name;
  app.cwd = CWD;
  if (!app.firstSeenAt) app.firstSeenAt = new Date().toISOString();
  writeApp(app);
  return name;
}

// ---------------------------------------------------------------------------
// Version mutations
// ---------------------------------------------------------------------------

export function appendVersion({ commitSha, label }) {
  const app = readApp() || { siteName: getOrCreateSiteName(), versions: [], deployments: [] };
  const n = (app.versions[app.versions.length - 1]?.n || 0) + 1;
  const entry = {
    n,
    commitSha,
    label: label || null,
    savedAt: new Date().toISOString(),
    status: "saved",
  };
  app.versions.push(entry);
  app.currentVersion = n;
  writeApp(app);
  return entry;
}

export function findVersion(n) {
  const app = readApp();
  if (!app) return null;
  return app.versions.find((v) => v.n === Number(n)) || null;
}

export function latestSavedVersion() {
  const app = readApp();
  if (!app) return null;
  // Highest n that's still in saved/deployed state (skip rolled-back).
  for (let i = app.versions.length - 1; i >= 0; i--) {
    if (app.versions[i].status !== "rolled-back") return app.versions[i];
  }
  return null;
}

export function appendDeployment({ version, accessUrl, buildId, versionName, buildStatus, finalUrl }) {
  const app = readApp();
  if (!app) throw new Error("no app.json — run save first");
  const ts = new Date().toISOString();
  app.deployments.push({
    version,
    deployedAt: ts,
    accessUrl,
    buildId: buildId || null,
    versionName: versionName || null,
    buildStatus: buildStatus || null,
    finalUrl: finalUrl || accessUrl,
  });
  app.currentDeploy = version;
  if (!app.firstDeployedAt) app.firstDeployedAt = ts;
  // Mark the version as deployed.
  const v = app.versions.find((x) => x.n === version);
  if (v) v.status = "deployed";
  writeApp(app);
  return app.deployments[app.deployments.length - 1];
}

export function markVersionRolledBack(n) {
  const app = readApp();
  if (!app) return;
  const v = app.versions.find((x) => x.n === n);
  if (v) v.status = "rolled-back";
  writeApp(app);
}
