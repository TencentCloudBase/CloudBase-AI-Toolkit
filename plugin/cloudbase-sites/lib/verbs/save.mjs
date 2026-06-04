/**
 * `cloudbase-sites save` — create a new saved version (Codex Sites-style).
 *
 * Steps:
 *   1. git add -A && git commit --allow-empty -m "version <n>: <label>"
 *   2. git tag version/<n>
 *   3. append { n, commitSha, label, savedAt, status:"saved" } to app.json.versions
 *   4. emit JSON with the new version entry
 *
 * No build, no deploy. A version is just a labeled checkpoint that can later
 * be deployed via `cloudbase-sites deploy --version <n>` (default: latest).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { emitErrPayload, emitOk, withCode } from "../emit.mjs";
import { ERR } from "../preview-state.mjs";
import { appendVersion, getOrCreateSiteName, readApp } from "../app-store.mjs";
import { ensureGitRepo, ensureGitignoreEntry, gitAddCommitTag, gitHead, isGitRepo } from "../git-utils.mjs";

export const saveHelp = `cloudbase-sites save — create a new saved version (a labeled git checkpoint)

Options:
  -m, --message <text>     human-readable label for this version
                            (defaults to a placeholder if omitted)

Behavior:
  - Creates a git commit (--allow-empty) and a tag version/<n>.
  - Appends to <cwd>/.cloudbase-sites/app.json.versions[].
  - Does NOT build or deploy. Use \`cloudbase-sites deploy\` for that.

Output: JSON with the new version entry.`;

export async function runSave(args) {
  const CWD = process.cwd();

  // Verify Vite project (cheap fingerprint).
  const pkg = readPkg(CWD);
  if (!pkg) throw withCode(ERR.NOT_VITE_PROJECT, "no package.json in cwd");
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (!deps.vite) throw withCode(ERR.NOT_VITE_PROJECT, "vite not in dependencies/devDependencies");
  if (!deps.react && !deps.vue) throw withCode(ERR.NOT_VITE_PROJECT, "neither react nor vue is a dependency");

  // Ensure siteName + git repo.
  const siteName = getOrCreateSiteName();
  if (!isGitRepo(CWD)) {
    const initialized = ensureGitRepo(CWD);
    if (!initialized) {
      emitErrPayload("not a git repository and automatic `git init` failed", ERR.GENERIC, {
        nextActions: [
          {
            tool: "shell",
            action: "git init",
            reason: "CloudBase Sites saves are git checkpoints; initialize the repository, inspect files, then retry save.",
          },
        ],
      });
      return;
    }
  }
  ensureGitignoreEntry(CWD, ".cloudbase-sites/");

  // Compute next version number.
  const app = readApp();
  const nextN = (app?.versions?.[app.versions.length - 1]?.n || 0) + 1;
  const label = args.message || `auto-saved at ${new Date().toISOString()}`;
  const tag = `version/${nextN}`;

  // Commit + tag.
  const ok = gitAddCommitTag(CWD, tag, `version ${nextN}: ${label}`);
  if (!ok) throw withCode(ERR.GENERIC, `git tag ${tag} failed (check git status)`);

  const commitSha = gitHead(CWD);
  const entry = appendVersion({ commitSha, label });

  emitOk(
    {
      siteName,
      version: entry,
      gitTag: tag,
      previouslyDeployed: !!app?.currentDeploy,
    },
    `saved version ${nextN} (${commitSha}): ${label}`,
  );
}

function readPkg(cwd) {
  const p = join(cwd, "package.json");
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; }
}
