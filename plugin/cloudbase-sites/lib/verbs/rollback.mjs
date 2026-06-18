/**
 * `cloudbase-sites rollback` — revert working tree to a saved version.
 *
 * Default: rollback to currently deployed version (current production).
 * Or specify --to-version <n>.
 *
 * Steps:
 *   1. Resolve target version's commitSha from app.json.versions.
 *   2. git stash --include-untracked (preserve any uncommitted edits).
 *   3. git reset --hard <commitSha>
 *   4. mark all versions newer than target as "rolled-back"
 *   5. trigger a `preview --restart` so the dev server picks up the reset.
 *
 * Note: rollback DOES NOT auto-deploy. After rollback, user can:
 *   - keep iterating (next save will create version n+1 ahead of the rolled
 *     back tip — git history will show the rolled-back commits as orphaned)
 *   - explicitly deploy the rolled-back version via `cloudbase-sites deploy`
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { emitOk, withCode } from "../emit.mjs";
import { ERR } from "../preview-state.mjs";
import { findVersion, markVersionRolledBack, readApp } from "../app-store.mjs";
import { gitResetHard, gitStashIncludeUntracked, isGitRepo } from "../git-utils.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_BIN = join(__dirname, "..", "..", "bin", "cloudbase-sites");

export const rollbackHelp = `cloudbase-sites rollback — revert cwd to a saved version

Options:
  --to-version <n>     target version (default: current production deploy)
  --no-restart         skip auto-restart of dev server after rollback

Behavior:
  - git stash --include-untracked any uncommitted edits (recoverable via \`git stash list\`)
  - git reset --hard to the target version's commit
  - marks all versions newer than target as "rolled-back" in app.json
  - restarts dev server unless --no-restart`;

export async function runRollback(args) {
  const CWD = process.cwd();
  if (!isGitRepo(CWD)) throw withCode(ERR.ROLLBACK_FAILED, "not a git repository");

  const app = readApp();
  if (!app || !app.versions || app.versions.length === 0) {
    throw withCode(ERR.VERSION_NOT_FOUND, "no saved versions yet — nothing to rollback to");
  }

  // Default target: current production (last successful deploy).
  let targetN;
  if (args.toVersion) targetN = Number(args.toVersion);
  else if (app.currentDeploy) targetN = app.currentDeploy;
  else throw withCode(ERR.VERSION_NOT_FOUND, "no current deploy to rollback to — pass --to-version <n>");

  const target = findVersion(targetN);
  if (!target) throw withCode(ERR.VERSION_NOT_FOUND, `version ${targetN} not found`);

  // 1. Stash uncommitted edits.
  gitStashIncludeUntracked(CWD, `cloudbase-sites pre-rollback to v${targetN}`);

  // 2. Reset.
  if (!gitResetHard(CWD, target.commitSha)) {
    throw withCode(ERR.ROLLBACK_FAILED, `git reset --hard ${target.commitSha} failed`);
  }

  // 3. Mark newer versions as rolled-back.
  for (const v of app.versions) {
    if (v.n > targetN) markVersionRolledBack(v.n);
  }

  // 4. Restart preview unless --no-restart.
  let preview = null;
  if (!args.noRestart) {
    spawn(SITES_BIN, ["preview", "--restart"], {
      cwd: CWD,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    preview = "restart triggered (async)";
  }

  emitOk(
    {
      rolledBackTo: { n: target.n, commitSha: target.commitSha, label: target.label },
      droppedVersions: app.versions.filter((v) => v.n > targetN).map((v) => v.n),
      stashedChanges: "if any uncommitted edits, recover via `git stash list` + `git stash pop`",
      preview,
    },
    `rolled back to version ${target.n} (${target.commitSha})`,
  );
}
