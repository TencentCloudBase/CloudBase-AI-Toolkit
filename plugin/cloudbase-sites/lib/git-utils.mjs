/**
 * Common git helpers for save/deploy/rollback.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function isGitRepo(cwd) {
  return spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, stdio: "ignore" }).status === 0;
}

export function ensureGitRepo(cwd) {
  if (isGitRepo(cwd)) return true;
  return spawnSync("git", ["init"], { cwd, stdio: "ignore" }).status === 0;
}

export function gitHead(cwd) {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] });
  if (r.status !== 0) return null;
  return r.stdout.toString().trim();
}

export function gitHeadFull(cwd) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] });
  if (r.status !== 0) return null;
  return r.stdout.toString().trim();
}

export function gitWorkingTreeDirty(cwd) {
  const r = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.status !== 0) return false;
  return r.stdout.toString().trim().length > 0;
}

export function gitAddCommitTag(cwd, tag, message) {
  spawnSync("git", [
    "add", "-A", "--", ".",
    ":!.cloudbase-sites",
    ":!dist",
    ":!node_modules",
    ":!.env",
    ":!.env.*",
  ], { cwd, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", message], {
    cwd,
    stdio: "ignore",
    env: withFallbackGitIdentity(cwd),
  });
  const tagR = spawnSync("git", ["tag", "-f", tag], { cwd, stdio: "ignore" });
  return tagR.status === 0;
}

export function gitTagOnly(cwd, tag) {
  return spawnSync("git", ["tag", "-f", tag], { cwd, stdio: "ignore" }).status === 0;
}

export function gitResetHard(cwd, ref) {
  return spawnSync("git", ["reset", "--hard", ref], { cwd, stdio: ["ignore", "pipe", "pipe"] }).status === 0;
}

export function gitStashIncludeUntracked(cwd, message) {
  return spawnSync("git", ["stash", "push", "--include-untracked", "-m", message], { cwd, stdio: ["ignore", "pipe", "pipe"] }).status === 0;
}

export function ensureGitignoreEntry(cwd, entry) {
  const gitignorePath = join(cwd, ".gitignore");
  const normalized = entry.trim();
  if (!normalized) return;
  let current = "";
  if (existsSync(gitignorePath)) {
    current = readFileSync(gitignorePath, "utf8");
    const lines = current.split(/\r?\n/).map((line) => line.trim());
    if (lines.includes(normalized)) return;
  }
  const prefix = current && !current.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, `${current}${prefix}${normalized}\n`);
}

function withFallbackGitIdentity(cwd) {
  const env = { ...process.env };
  const hasUserName = gitConfigExists(cwd, "user.name");
  const hasUserEmail = gitConfigExists(cwd, "user.email");
  if (!hasUserName && !env.GIT_AUTHOR_NAME) {
    env.GIT_AUTHOR_NAME = "CloudBase Sites";
  }
  if (!hasUserEmail && !env.GIT_AUTHOR_EMAIL) {
    env.GIT_AUTHOR_EMAIL = "cloudbase-sites@cloudbase.invalid";
  }
  if (!hasUserName && !env.GIT_COMMITTER_NAME) {
    env.GIT_COMMITTER_NAME = env.GIT_AUTHOR_NAME;
  }
  if (!hasUserEmail && !env.GIT_COMMITTER_EMAIL) {
    env.GIT_COMMITTER_EMAIL = env.GIT_AUTHOR_EMAIL;
  }
  return env;
}

function gitConfigExists(cwd, key) {
  return spawnSync("git", ["config", "--get", key], {
    cwd,
    stdio: "ignore",
  }).status === 0;
}
