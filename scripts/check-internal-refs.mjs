#!/usr/bin/env node
/**
 * 拦截「对外文本里的内部标识」。
 *
 * 与 internal-docs-guard.yml 是互补的两层，缺一不可：
 *   - internal-docs-guard.yml  管「文件能否入库」（specs/、.workbuddy/）
 *   - 本脚本                   管「PR 标题 / 正文 / 提交信息里有没有内部痕迹」
 * 文件层干净不代表元信息干净 —— PR 标题、正文与提交信息同样是公开可见的对外文案。
 *
 * 触发场景：自动化建 PR 的流程会把内部任务标记（`ato-task:<uuid>`）写进 PR 正文，
 * 把内部短号以 `(<8 位 hex>)` 追加到提交 headline。这类痕迹不出现在 diff 里，
 * 只能靠事后回看发现，所以由 CI 兜底。
 *
 * 判据分两档：
 *   - 全档（PR 标题 / PR 正文 / 提交 headline / 提交正文）：明确的内部标记词。
 *   - 标题档（仅 PR 标题与提交 headline）：括号里的 7-40 位 hex，形如 `(07caf487)`。
 *     正文里裸 hex 太常见（引用 commit sha 是正常习惯），只在标题位判，避免误伤。
 *
 * 拿不到基线时跳过而不是失败（本地无 origin/main、push 事件的 before 为全零等）。
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");

// git log 的记录/字段分隔符。用控制字符，避免与正文里的换行、空格混淆。
const RECORD_SEP = "\u001e";
const FIELD_SEP = "\u001f";

// 文档里常见的占位用户名，不算本机路径泄漏。
const PLACEHOLDER_USERNAMES = new Set([
  "xxx",
  "xx",
  "user",
  "username",
  "youruser",
  "yourname",
  "me",
  "name",
  "someone",
  "example",
  "foo",
  "bar",
]);

/**
 * 所有对外文本都会检查的项。
 * `allow` 可选：拿到匹配结果后判定是否豁免。
 */
export const TEXT_RULES = [
  {
    label: "internal task marker",
    pattern: /ato-task:/gi,
    hint: "remove the `ato-task:` line — it is an internal tracker identifier",
  },
  {
    label: "internal task reference",
    pattern: /\bATO\s+(?:task|round|id)\b/gi,
    hint: "describe what changed instead of citing the internal tracker",
  },
  {
    label: "internal review round",
    pattern: /\bGEL\s+(?:r|round)\s*\d+/gi,
    hint: "drop the internal review-round reference",
  },
  {
    label: "internal worktree path",
    pattern: /\.ato[\\/]worktrees/gi,
    hint: "drop the local worktree path",
  },
  {
    label: "local home path",
    pattern: /\/Users\/([A-Za-z0-9][A-Za-z0-9._-]*)\//g,
    allow: (match) => PLACEHOLDER_USERNAMES.has(match[1].toLowerCase()),
    hint: "replace the absolute path with a placeholder such as `~/project`",
  },
];

/**
 * 只在 PR 标题与提交 headline 上生效的项。
 */
export const TITLE_RULES = [
  {
    label: "bare id in parentheses",
    pattern: /(?<![0-9A-Za-z])\(([0-9a-f]{7,40})\)(?!\w)/g,
    hint: "drop the parenthesised id — the description alone is the useful part",
  },
];

function globalize(pattern) {
  return pattern.flags.includes("g")
    ? pattern
    : new RegExp(pattern.source, `${pattern.flags}g`);
}

/**
 * 在单段文本里跑一组规则。
 * @returns {{label: string, hint: string, match: string}[]}
 */
export function scanText(text, rules) {
  const findings = [];
  if (typeof text !== "string" || text.length === 0) {
    return findings;
  }

  for (const rule of rules) {
    const re = globalize(rule.pattern);
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (typeof rule.allow === "function" && rule.allow(match)) {
        continue;
      }
      findings.push({ label: rule.label, hint: rule.hint, match: match[0] });
      if (match.index === re.lastIndex) {
        re.lastIndex += 1;
      }
    }
  }

  return findings;
}

function defaultGit(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * 读取 base..HEAD 的提交信息，headline 与正文分开返回（两者判据不同）。
 */
export function collectCommits({ base, cwd = ROOT_DIR, git = defaultGit }) {
  const raw = git(
    ["log", `--format=%h${FIELD_SEP}%s${FIELD_SEP}%b${RECORD_SEP}`, `${base}..HEAD`],
    cwd,
  );

  return raw
    .split(RECORD_SEP)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0)
    .map((chunk) => {
      const [sha, subject, ...rest] = chunk.split(FIELD_SEP);
      return {
        sha: sha ?? "",
        subject: subject ?? "",
        body: rest.join(FIELD_SEP).trim(),
      };
    });
}

function resolveBase(base, { cwd, git }) {
  if (!base || /^0+$/.test(base)) {
    return { ok: false, reason: "no base revision was provided" };
  }
  try {
    git(["rev-parse", "--verify", "--quiet", `${base}^{commit}`], cwd);
  } catch {
    return { ok: false, reason: `base revision ${base} could not be resolved locally` };
  }
  return { ok: true };
}

/**
 * @returns {{status: 'ok'|'failed'|'skipped', findings: object[], reason?: string}}
 */
export function runCheck({
  base,
  cwd = ROOT_DIR,
  prTitle = "",
  prBody = "",
  git = defaultGit,
  log = console.log,
} = {}) {
  const resolved = resolveBase(base, { cwd, git });
  if (!resolved.ok) {
    log(`OK: ${resolved.reason}; the internal-reference check does not apply.`);
    return { status: "skipped", findings: [], reason: resolved.reason };
  }

  const findings = [];
  const collect = (source, text, rules) => {
    for (const finding of scanText(text, rules)) {
      findings.push({ source, ...finding });
    }
  };

  collect("PR title", prTitle, [...TITLE_RULES, ...TEXT_RULES]);
  collect("PR body", prBody, TEXT_RULES);

  for (const commit of collectCommits({ base, cwd, git })) {
    collect(`commit ${commit.sha} headline`, commit.subject, [...TITLE_RULES, ...TEXT_RULES]);
    collect(`commit ${commit.sha} message`, commit.body, TEXT_RULES);
  }

  if (findings.length === 0) {
    log("OK: no internal references in PR metadata or commit messages.");
    return { status: "ok", findings };
  }

  log("ERROR: internal references in PR metadata or commit messages:");
  for (const finding of findings) {
    log(`  - ${finding.source}: ${finding.label} — "${finding.match}"`);
  }
  log("");
  log("These surfaces are public. Describe the change itself instead of citing the");
  log("internal tracker, review round, or local path.");
  log("");
  log("How to fix:");
  log("");
  log("  1. Amend the commit messages:");
  log("       git commit --amend   # for the tip commit");
  log("       git rebase -i <base> # for older commits, then reword");
  log("");
  log("  2. Update the PR title and body on the pull request page.");
  log("");
  log("  3. Re-push the branch so this check re-runs.");

  return { status: "failed", findings };
}

export function parseArgs(argv) {
  const options = {};
  argv.forEach((arg, index) => {
    if (arg !== "--base" && arg !== "--cwd") {
      return;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${arg} requires a value`);
    }
    options[arg === "--base" ? "base" : "cwd"] = value;
  });
  return options;
}

export function isDirectCliInvocation({ argv = process.argv, moduleUrl = import.meta.url } = {}) {
  if (!argv[1] || !moduleUrl.startsWith("file:")) {
    return false;
  }
  return path.resolve(fileURLToPath(moduleUrl)) === path.resolve(argv[1]);
}

if (isDirectCliInvocation()) {
  const { base, cwd } = parseArgs(process.argv.slice(2));
  const result = runCheck({
    base,
    cwd: cwd ? path.resolve(cwd) : ROOT_DIR,
    prTitle: process.env.PR_TITLE ?? "",
    prBody: process.env.PR_BODY ?? "",
  });

  process.exit(result.status === "failed" ? 1 : 0);
}
