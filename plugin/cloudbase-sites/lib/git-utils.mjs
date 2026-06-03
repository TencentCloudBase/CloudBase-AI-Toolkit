/**
 * Common git helpers for save/deploy/rollback.
 */

import { spawnSync } from "node:child_process";

export function isGitRepo(cwd) {
  return spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, stdio: "ignore" }).status === 0;
}

export function gitHead(cwd) {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] });
  if (r.status !== 0) return null;
  return r.stdout.toString().trim();
}

export function gitAddCommitTag(cwd, tag, message) {
  spawnSync("git", ["add", "-A"], { cwd, stdio: "ignore" });
  spawnSync("git", ["commit", "--allow-empty", "-m", message], { cwd, stdio: "ignore" });
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
