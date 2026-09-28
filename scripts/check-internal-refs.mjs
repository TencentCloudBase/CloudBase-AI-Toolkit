#!/usr/bin/env node
/**
 * 拦截「对外文本里的内部标识」。
 *
 * 与 internal-docs-guard.yml 是互补的三层，缺一不可：
 *   - internal-docs-guard.yml  管「文件能否入库」（specs/、.workbuddy/）
 *   - 本脚本「元信息档」        管「PR 标题 / 正文 / 提交信息里有没有内部痕迹」
 *   - 本脚本「文件内容档」      管「已跟踪文件里有没有内网主机名 / 内网地址」
 * 文件层干净不代表元信息干净 —— PR 标题、正文与提交信息同样是公开可见的对外文案。
 * 反过来元信息干净也不代表文件干净 —— 内网地址一旦写进被跟踪的文件就已经发布了。
 * 三层各自都会漏，所以要同时存在。
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
import { readFileSync } from "node:fs";
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

/**
 * 只扫「已跟踪文件内容」的项。
 *
 * 与 TEXT_RULES 互补：TEXT_RULES 管 PR 元信息，这里管已经写进仓库的字。本仓库是
 * 公开的，下面这两类串在任何被跟踪的文件里都没有正当用法，出现即泄漏 —— 所以不需要
 * 基线比较，也不需要「只在改动行上判」这种降噪手段。
 *
 * 边界：判据刻意收得很窄。私有网段、`localhost`、`169.254.169.254` 这类在文档和测试里
 * 是正常内容（SSRF 防护代码就在用），收进来会天天误报；这里只放「内部域名 + 内部网段」。
 */
export const FILE_RULES = [
  {
    label: "internal hostname",
    pattern: /[a-z0-9-]+\.woa\.com\b/gi,
    hint: "drop the internal hostname — use a public URL or a placeholder instead",
  },
  {
    label: "internal network address",
    pattern: /\b9\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
    hint: "drop the internal address — use a placeholder such as 10.0.0.1 instead",
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
 * 扫描一段文件正文，按行给出位置。
 */
export function scanFileText(text) {
  const findings = [];
  text.split("\n").forEach((line, index) => {
    for (const finding of scanText(line, FILE_RULES)) {
      findings.push({ ...finding, line: index + 1 });
    }
  });
  return findings;
}

/** 依赖目录与生成产物不参与内容扫描（体积大、非人工维护）。 */
const UNSCANNED_DIR_SEGMENTS = new Set([
  ".generated",
  ".git",
  ".skills-repo-output",
  "coverage",
  "dist",
  "node_modules",
]);

export function isScannableFile(relPath) {
  return relPath
    .split("/")
    .slice(0, -1)
    .every((segment) => !UNSCANNED_DIR_SEGMENTS.has(segment));
}

/**
 * 仓库里所有应参与扫描的已跟踪文件。
 *
 * 扫全量而不是只扫改动行：残留一旦写下去，之后的 PR 没人会再回头看它。全量扫描让
 * 「main 里已经存在的问题」也能被下一个 PR 暴露出来，代价是每次 CI 多读一遍树。
 */
export function collectTrackedFiles({ cwd = ROOT_DIR, git = defaultGit } = {}) {
  return git(["ls-files", "-z"], cwd)
    .split("\0")
    .filter((rel) => rel.length > 0 && isScannableFile(rel));
}

export function scanTrackedFiles({
  cwd = ROOT_DIR,
  git = defaultGit,
  readFile = (rel) => readFileSync(path.join(cwd, rel), "utf8"),
} = {}) {
  const findings = [];

  for (const rel of collectTrackedFiles({ cwd, git })) {
    let text;
    try {
      text = readFile(rel);
    } catch {
      continue; // 读不到的文件（权限、断链软链）跳过，别让扫描本身把 CI 弄红
    }
    for (const finding of scanFileText(text)) {
      findings.push({ source: `${rel}:${finding.line}`, ...finding });
    }
  }

  return findings;
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

  const metadataFindings = [...findings];
  const fileFindings = scanTrackedFiles({ cwd, git });
  findings.push(...fileFindings);

  if (findings.length === 0) {
    log("OK: no internal references in PR metadata, commit messages, or tracked files.");
    return { status: "ok", findings };
  }

  log("ERROR: internal references on public surfaces:");
  for (const finding of findings) {
    log(`  - ${finding.source}: ${finding.label} — "${finding.match}"`);
  }

  if (metadataFindings.length > 0) {
    log("");
    log("PR titles, PR bodies and commit messages are public. Describe the change");
    log("itself instead of citing the internal tracker, review round, or local path.");
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
  }

  if (fileFindings.length > 0) {
    log("");
    log("Every tracked file in this repository is public. Rewrite the flagged lines so");
    log("they no longer name internal hosts, addresses, trackers, or local paths — and");
    log("do not just move the reference to another file.");
    log("");
    log("How to fix:");
    log("");
    log("  1. Edit the lines listed above.");
    log("");
    log("  2. Commit and push again — this check re-runs on every push.");
  }

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
