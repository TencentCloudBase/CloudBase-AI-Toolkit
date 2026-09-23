#!/usr/bin/env node

/**
 * 版本声明变了，compat baseline 就必须在同一个变更里同步刷新。
 *
 * 每个 skill / guideline 入口的 `version:` 行都会进入派生产物，所以一次版本 bump 会改写所有
 * 文本面的哈希。文本面分组的 `hashMode` 是 `report`（有意设计：纯文案改动不该拦 CI），代价是
 * 这类漂移不会让任何门禁失败 —— baseline 因此可以在没人注意的情况下过期很久，
 * 报告里堆满噪声，真正的兼容面变化反而不显眼。
 *
 * 本检查只钉一件事：**diff 里出现了版本声明变化，就必须同时出现 baseline 改动**。
 * 它不把文本面哈希改成阻断（那会推翻「文案改动不拦 CI」的既有决策），也不试图判断漂移是否
 * 合理，只保证 baseline 不落后于版本声明。
 *
 * 用法：node scripts/check-compat-baseline-sync.mjs --base <ref>
 * CI 里 <ref> 取 PR 的 base sha 或 push 前的 before sha；取不到时跳过（不误伤）。
 */

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "url";

/** 版本声明的来源：skill / guideline 入口的 frontmatter。 */
export const VERSION_SOURCE_PATHS = ["config/source/skills", "config/source/guideline"];

/** 版本变化时必须同步刷新的基线。 */
export const BASELINE_PATH = "config/source/editor-config/compat-baseline.json";

/** diff 里的版本行：frontmatter 的 `version: x.y.z`，以及 JSON 的 `"version": "x.y.z"`。 */
const VERSION_LINE_RE = /^[-+]\s*"?version"?\s*:/m;

/**
 * 纯判定函数（无 I/O），便于单测覆盖四个分支。
 */
export function evaluateBaselineSync({ versionChanged, baselineChanged }) {
  if (!versionChanged) {
    return { ok: true, reason: "no-version-change" };
  }
  if (baselineChanged) {
    return { ok: true, reason: "baseline-refreshed" };
  }
  return { ok: false, reason: "baseline-stale" };
}

export function defaultGit(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function hasCommit(ref, { cwd = process.cwd(), git = defaultGit } = {}) {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * 只取「版本声明」与「baseline」两处 diff，避免为了判定去读整棵产物树。
 * 比较对象是工作区（`git diff <base>`，不带 HEAD）：CI 里工作区是干净的，等价于 base..HEAD；
 * 本地这样写才能看见尚未提交的 bump，而不是给一个「没有版本变化」的假绿灯。
 */
export function collectBaselineSyncState(base, { cwd = process.cwd(), git = defaultGit } = {}) {
  const versionDiff = git(["diff", "--unified=0", base, "--", ...VERSION_SOURCE_PATHS], cwd);
  const baselineDiff = git(["diff", "--name-only", base, "--", BASELINE_PATH], cwd);

  return {
    versionChanged: VERSION_LINE_RE.test(versionDiff),
    baselineChanged: baselineDiff.trim().length > 0,
  };
}

const FAILURE_MESSAGE = [
  "ERROR: version declarations changed but the compat baseline was not refreshed.",
  "",
  "Every skill entrypoint carries a `version:` line that lands in the generated products, so a",
  "version bump rewrites the text-surface hashes in config/source/editor-config/compat-baseline.json.",
  "Text-surface drift is report-only by design, which means a stale baseline fails nothing and stays",
  "invisible until someone reads the report.",
  "",
  "Fix (either one):",
  "  npm run update:compat-baseline",
  "  node scripts/sync-skill-versions.mjs --version X.Y.Z   # refreshes the baseline for you",
  "",
  "Then commit the updated baseline together with the version change.",
].join("\n");

export function runCheck({
  base,
  cwd = process.cwd(),
  git = defaultGit,
  log = console.log,
  error = console.error,
} = {}) {
  if (!base) {
    log("No base revision supplied; skipping the version-bump baseline check.");
    return 0;
  }

  if (!hasCommit(base, { cwd, git })) {
    log(`Base revision ${base} is not available locally; skipping the version-bump baseline check.`);
    return 0;
  }

  const verdict = evaluateBaselineSync(collectBaselineSyncState(base, { cwd, git }));

  if (verdict.ok) {
    log(
      verdict.reason === "baseline-refreshed"
        ? "OK: version declarations changed and the compat baseline was refreshed in the same change."
        : "OK: no version declaration changed; the compat baseline freshness check does not apply.",
    );
    return 0;
  }

  error(FAILURE_MESSAGE);
  return 1;
}

export function parseArgs(argv) {
  const options = {};

  argv.forEach((arg, index) => {
    if (arg !== "--base" && arg !== "--cwd") return;
    const value = argv[index + 1];
    // 空串是合法的「没给基线」（CI 里未解析的 `--base "$BASE_SHA"`），交给 runCheck 走跳过分支，
    // 不要在这里抛错 —— 参数解析失败会让门禁变成假红。
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    options[arg === "--base" ? "base" : "cwd"] = value;
  });

  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseArgs(process.argv.slice(2));
    process.exit(runCheck({ ...options, base: options.base ?? process.env.BASE_SHA }));
  } catch (err) {
    console.error(`ERROR: ${err?.message || err}`);
    process.exit(1);
  }
}
