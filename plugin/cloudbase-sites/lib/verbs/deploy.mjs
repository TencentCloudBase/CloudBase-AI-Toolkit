/**
 * `cloudbase-sites deploy` — bridge a saved version to cloudbase-mcp manageApps.
 *
 * Two phases (model bridges via MCP):
 *   Phase 1 — `cloudbase-sites deploy [--version <n>]`:
 *     - Resolve version (default: latest saved). Refuse if no version saved
 *       — user must `save` first.
 *     - If currently checked out commit != version's commit, do a soft check
 *       (warn but proceed; user might be deploying an older version on top
 *       of new uncommitted edits — that's fine because we use git stash).
 *       Actually we DO NOT git checkout here — we deploy what's in the
 *       working tree. The version metadata is for record-keeping and rollback.
 *       (Codex Sites' "save" is more like "tag the current state"; deploy
 *       deploys whatever the version pointed to. We follow that pattern.)
 *     - pnpm/npm run build → validate dist/
 *     - emit nextAction { tool:"manageApps", args:{ action:"deployApp",
 *         serviceName:siteName, filePath:cwd, buildPath:"dist",
 *         framework:"static", installCmd:"", buildCmd:"" } }
 *
 *   Phase 2 — `cloudbase-sites deploy --post --version <n> --access-url <url> [--build-id <id>]`:
 *     - Append to app.json.deployments[]
 *     - Mark version as "deployed"
 *     - git tag deploy/<n>-<ts>
 *     - emit { finalUrl: <accessUrl>?v=<rand6> }
 *
 * Rationale: see Codex Sites two-stage save→deploy pattern. Local build runs
 * here; remote `manageApps` only does `tcb hosting deploy` (framework=static,
 * no install/build).
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { emitOk, withCode } from "../emit.mjs";
import { ERR } from "../preview-state.mjs";
import {
  appendDeployment,
  findVersion,
  getOrCreateSiteName,
  latestSavedVersion,
  readApp,
} from "../app-store.mjs";
import { gitTagOnly, isGitRepo } from "../git-utils.mjs";

export const deployHelp = `cloudbase-sites deploy — deploy a saved version to CloudApp (manageApps).

Phase 1 (build + emit nextAction):
  cloudbase-sites deploy [--version <n>]   # default: latest saved version
  cloudbase-sites deploy --skip-build      # already built; just emit nextAction

Phase 2 (record after manageApps succeeds):
  cloudbase-sites deploy --post --version <n> --access-url <url> [--build-id <id>]

Behavior:
  - Reads stable siteName from <cwd>/.cloudbase-agent/app.json.
  - Phase 1 builds dist/ and emits a JSON whose nextAction tells the model to
    call cloudbase-mcp manageApps with framework=static (skip remote install/build).
  - Phase 2 appends to deployments[], tags git deploy/<n>-<ts>, returns finalUrl.

Refuses to deploy if no version has been saved (run \`cloudbase-sites save\` first).`;

export async function runDeploy(args) {
  if (args.post) return runPostDeploy(args);

  const CWD = process.cwd();

  // Verify Vite project.
  const pkg = readPkg(CWD);
  if (!pkg) throw withCode(ERR.NOT_VITE_PROJECT, "no package.json in cwd");
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (!deps.vite) throw withCode(ERR.NOT_VITE_PROJECT, "vite not in dependencies/devDependencies");
  if (!deps.react && !deps.vue) throw withCode(ERR.NOT_VITE_PROJECT, "neither react nor vue is a dependency");

  // Resolve version.
  let version;
  if (args.version) {
    version = findVersion(args.version);
    if (!version) throw withCode(ERR.VERSION_NOT_FOUND, `version ${args.version} not found — run \`cloudbase-sites versions\` to list`);
  } else {
    version = latestSavedVersion();
    if (!version) {
      throw withCode(
        ERR.VERSION_NOT_FOUND,
        "no saved version yet — run `cloudbase-sites save` to create one before deploying",
      );
    }
  }

  const siteName = getOrCreateSiteName();

  // Build.
  if (!args.skipBuild) {
    const buildScript = pkg.scripts?.build;
    if (!buildScript) throw withCode(ERR.BUILD_FAILED, "package.json has no scripts.build");
    runBuild(CWD);
  }

  // Validate dist/.
  const distPath = join(CWD, "dist");
  if (!existsSync(distPath) || !statSync(distPath).isDirectory()) {
    throw withCode(ERR.DIST_MISSING, "dist/ does not exist after build");
  }
  const entries = readdirSync(distPath);
  if (entries.length === 0) throw withCode(ERR.DIST_MISSING, "dist/ is empty after build");

  const app = readApp();
  const previouslyDeployed = !!app?.currentDeploy;

  emitOk(
    {
      stage: "build-complete",
      siteName,
      version: version.n,
      versionLabel: version.label,
      versionCommit: version.commitSha,
      distPath,
      distEntries: entries.length,
      previouslyDeployed,
      nextAction: {
        tool: "manageApps",
        args: {
          action: "deployApp",
          serviceName: siteName,
          filePath: CWD,
          buildPath: "dist",
          framework: "static",
          installCmd: "",
          buildCmd: "",
        },
        hint: previouslyDeployed
          ? `Re-deploys CloudApp '${siteName}' (URL stays the same).`
          : `First-time deploy creates CloudApp '${siteName}' with its own subdomain.`,
        followup: {
          tool: "cloudbase-sites",
          args: ["deploy", "--post", "--version", String(version.n), "--access-url", "<accessUrl>", "--build-id", "<optional>"],
          purpose: "record this deploy in app.json and tag git",
        },
      },
    },
    `build complete; deploy version ${version.n} of '${siteName}' next via manageApps (framework=static)`,
  );
}

async function runPostDeploy(args) {
  if (!args.accessUrl) throw withCode(ERR.GENERIC, "--post requires --access-url");
  const versionN = args.version ? Number(args.version) : null;
  if (!versionN) throw withCode(ERR.GENERIC, "--post requires --version <n>");
  if (!findVersion(versionN)) {
    throw withCode(ERR.VERSION_NOT_FOUND, `version ${versionN} not found in app.json`);
  }

  const cacheBust = randomBytes(3).toString("hex");
  const finalUrl = appendQuery(args.accessUrl, `v=${cacheBust}`);

  const entry = appendDeployment({
    version: versionN,
    accessUrl: args.accessUrl,
    buildId: args.buildId,
    finalUrl,
  });

  // Tag git: deploy/<n>-<ts>.
  const tag = `deploy/${versionN}-${Date.now()}`;
  if (isGitRepo(process.cwd())) gitTagOnly(process.cwd(), tag);

  const app = readApp();
  emitOk(
    {
      stage: "post-deploy",
      siteName: app?.siteName ?? null,
      version: versionN,
      ...entry,
      gitTag: tag,
      deployCount: app?.deployments?.length ?? 0,
    },
    `deploy recorded for '${app?.siteName}' v${versionN} — open: ${finalUrl}`,
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function readPkg(cwd) {
  const p = join(cwd, "package.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}

function pickRunner(cwd) {
  const which = (b) => spawnSync(process.platform === "win32" ? "where" : "which", [b], { stdio: "ignore" }).status === 0;
  if (existsSync(join(cwd, "pnpm-lock.yaml")) && which("pnpm")) return ["pnpm", "run", "build"];
  if (which("pnpm")) return ["pnpm", "run", "build"];
  if (which("npm")) return ["npm", "run", "build"];
  return ["npx", "--yes", "--no-install", "vite", "build"];
}

function runBuild(cwd) {
  const [cmd, ...rest] = pickRunner(cwd);
  const r = spawnSync(cmd, rest, { cwd, stdio: ["ignore", "inherit", "inherit"], env: process.env });
  if (r.status !== 0) {
    throw withCode(ERR.BUILD_FAILED, `build exited with code ${r.status} (cmd: ${cmd} ${rest.join(" ")})`);
  }
}

function appendQuery(url, qs) {
  if (!url || !qs) return url;
  return url + (url.includes("?") ? "&" : "?") + qs;
}
