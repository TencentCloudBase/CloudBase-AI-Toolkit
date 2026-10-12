#!/usr/bin/env node
/**
 * 拦截「对外文本里的内部标识」。
 *
 * 与 internal-docs-guard.yml 是互补的三层，缺一不可：
 *   - internal-docs-guard.yml  管「文件能否入库」（specs/、.workbuddy/）
 *   - 本脚本「元信息档」        管「PR 标题 / 正文 / 提交信息里有没有内部痕迹」
 *   - 本脚本「文件内容档」      管「已跟踪文件里有没有内网主机名 / 内网地址」
 *   - 本脚本「个人信息档」      管「已跟踪文件里有没有作者本机的账号 / 路径 / 环境 / 密钥」
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
 * 「个人信息档」跟文件内容档落在同一层、同一个扫描循环里，但判据来源不同：仓库是公开的，
 * 作者本机的账号号、home 目录、环境 ID、密钥一旦写进被跟踪的文件就等于已经发布。结构形态
 * （路径形状、环境 ID 形状、密钥前缀）可以写死在代码里；**具体值不写进仓库** —— 自己的
 * 账号、用户名、邮箱由 INTERNAL_REFS_EXTRA / INTERNAL_REFS_EXTRA_FILE 从外部注入，两个
 * 都缺省时这一档只剩结构判据（CI 上通常就是这种情况），不会因此变红。
 *
 * 命中值可能本身就是被保护对象，所以这一档的日志只打掩码。
 *
 * 这一档分两级：`severity: "error"` 命中即挡（本机路径、密钥、注入的个人字面值）；
 * `severity: "warn"` 只报不挡（账号号、环境 ID）—— 这两类在本仓的 OpenAPI 示例、
 * 教程与测试夹具里已经大量存在，直接挡会把 CI 弄成常红，先按提示清一轮再收紧。
 *
 * 本地自检（不依赖 origin/main，做发布前用）：
 *   node scripts/check-internal-refs.mjs --files
 * 自己的账号 / 用户名 / 邮箱可从环境额外注入：
 *   INTERNAL_REFS_EXTRA="handle;account-id" node scripts/check-internal-refs.mjs --files
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
  "x",
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
  // CI / 容器里的固定账号，不是作者本人。
  "root",
  "node",
  "runner",
  "builder",
  "jenkins",
  "ubuntu",
  "vscode",
  "codespace",
]);

/**
 * 所有对外文本都会检查的项。
 * `allow` 可选：拿到匹配结果后判定是否豁免。
 */
/** 命中值本身可能就是要保护的东西，日志里只出掩码。 */
function redact(text) {
  if (text.length <= 8) {
    return "*".repeat(text.length);
  }
  return `${text.slice(0, 3)}…${text.slice(-2)}`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

/** 明显是占位 / 测试用途的字面值，不算真泄漏。 */
const PLACEHOLDER_VALUE_MARKERS =
  /(placeholder|should.?not.?appear|not.?real|credential|example|fixture|dummy|sample|redacted|xxxx|your[_-]?key)/i;

/** 标准 UUID 形态。RequestId、内部任务短号、会话 ID 都长这样，不是环境 ID。 */
function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * 明显是编造的环境 ID：尾段是同一字符连排（`…-0000000000000000`、`…-aaaaaaaaaaaa`），
 * 或一长串前导 0 再接序号。真实环境 ID 的尾段总是字母数字混杂，不会长这样 ——
 * 测试夹具与文档占位符就写成这个形态，好让判据自己放过它。
 */
function isSyntheticEnvId(value) {
  const suffix = value.slice(value.lastIndexOf("-") + 1);
  if (/^(\w)\1{7,}$/.test(suffix)) {
    return true;
  }
  return /^0{8,}\d*$/.test(suffix);
}

/** 明显是编造出来的账号号（全同位、递增串、一长串 0、某个数字连排），测试夹具里最常见。 */
function isSyntheticAccountTail(tail) {
  if (/^(\d)\1+$/.test(tail)) {
    return true;
  }
  if (/^0+12345678\d?$/.test(tail)) {
    return true;
  }
  if (/^0{6,}/.test(tail)) {
    return true;
  }
  // 尾段里某个数字连排 6 次以上（`100099999999` 型），只可能是编的。
  return /(\d)\1{5,}/.test(tail);
}

/**
 * 作者个人信息档：只认结构，不含任何具体账号 / 环境 / 密钥值，可以安全地待在公开仓。
 *
 * 精确值（自己的账号 uin、用户名、邮箱）走 loadExtraRules() 从环境注入。
 */
export const PERSONAL_RULES = [
  {
    label: "local home path",
    severity: "error",
    pattern: /(?:\/Users\/|\/home\/)([A-Za-z0-9][A-Za-z0-9._-]*)\//g,
    allow: (match) => PLACEHOLDER_USERNAMES.has(match[1].toLowerCase()),
    redact: true,
    hint: "replace the author's home directory with a placeholder such as `~/project`",
  },
  {
    label: "windows home path",
    severity: "error",
    pattern: /[A-Za-z]:\\Users\\([A-Za-z0-9][A-Za-z0-9._-]*)\\/g,
    allow: (match) => PLACEHOLDER_USERNAMES.has(match[1].toLowerCase()),
    redact: true,
    hint: "replace the author's home directory with a placeholder such as `%USERPROFILE%`",
  },
  {
    label: "cloud secret id",
    severity: "error",
    pattern: /\bAKID[A-Za-z0-9]{12,}\b/g,
    allow: (match) => PLACEHOLDER_VALUE_MARKERS.test(match[0]),
    redact: true,
    hint: "remove the credential — secrets must never be committed",
  },
  {
    label: "cloud api key",
    severity: "error",
    pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g,
    allow: (match) => PLACEHOLDER_VALUE_MARKERS.test(match[0]),
    redact: true,
    hint: "remove the credential — secrets must never be committed",
  },
  {
    label: "assigned secret value",
    severity: "error",
    // 右边得是「像密钥的字面量」：必须含数字，且不是 TENCENTCLOUD_SECRET_ID 这类常量名。
    pattern:
      /\b(?:secret_?id|secret_?key|api_?key|access_?token|private_?key)\b["']?\s*[:=]\s*["']?([A-Za-z0-9_+/-]{20,})/gi,
    allow: (match) => {
      const value = match[1];
      return (
        PLACEHOLDER_VALUE_MARKERS.test(value) ||
        !/\d/.test(value) ||
        /^[A-Z][A-Z0-9_]*$/.test(value)
      );
    },
    redact: true,
    hint: "remove the credential — secrets must never be committed",
  },
  {
    label: "cloud account id",
    severity: "warn",
    pattern: /\b100(\d{9})\b/g,
    allow: (match) => isSyntheticAccountTail(match[1]),
    redact: true,
    hint: "replace the account id with a placeholder such as `<account-id>`",
  },
  {
    label: "cloud environment id",
    severity: "warn",
    // 尾段 12-20 位且必须含数字：`auth-tool-simplification` 这类普通连字符词得放过。
    pattern: /(?<![a-z0-9-])([a-z][a-z0-9]*(?:-[a-z0-9]+)*-[a-z0-9]{12,20})(?![a-z0-9-])/g,
    allow: (match) =>
      isUuidLike(match[1]) ||
      isSyntheticEnvId(match[1]) ||
      !/\d/.test(match[1].slice(match[1].lastIndexOf("-") + 1)),
    redact: true,
    hint: "replace the environment id with a placeholder such as `<env-id>`",
  },
];

/**
 * 已确认不是泄漏的命中值 —— 对外文档里的示例。
 *
 * 判定标准只有一个：它是否**有意**出现在对外内容里，且换掉会损失示例价值。
 * 拿不准的不要往这儿加 —— 这里是「不报」，不是「安全」，值一旦被跟踪就已经公开了。
 */
export const ALLOWED_LITERAL_VALUES = new Set([
  // 云函数文档里的层名格式示例 `common_<envId>`（源头 mcp/src/i18n/locales/modules/functions.ts，
  // 投影到 4 套 skill 与 doc/；换掉要连带重跑生成）
  "cloud1-d9ghadgak3edf6b36",
  // 平台自定义域名文档里的 PlatformId 示例 —— 是平台 ID，不是环境 ID（判据本身的误报）
  "pf-t960szfwv1cs",
  // 对外教程的线上 demo 环境（README / README.zh-CN / doc/examples.md / doc/tutorials）
  "cloud1-5g39elugeec5ba0f",
  "chinese-chess-app-0g00z1dr85125ec3",
]);

/**
 * 不参与内容扫描的文件。
 *
 * 上游 vendored 的 OpenAPI 与由它生成的索引：里面的示例环境 ID / 账号号来自上游，
 * 手改会被下一次生成覆盖 —— 只能提上游，本地改了没意义。
 */
export const ALLOWED_FILE_PATTERNS = [
  /^mcp\/assets\/control-plane\//,
  /^mcp\/src\/generated\/tcb-action-index\.ts$/,
];

export function isAllowedFile(relPath) {
  return ALLOWED_FILE_PATTERNS.some((pattern) => pattern.test(relPath));
}

/** 文件内容层的完整判据（结构档 + 个人信息档）。 */
export const DEFAULT_FILE_RULES = [...FILE_RULES, ...PERSONAL_RULES];

/** 太短的串太容易误报，注入的字面值至少要有这么长。 */
const MIN_EXTRA_LITERAL_LENGTH = 4;

/**
 * 从外部注入「无法用结构判据表达」的个人标识（自己的账号 uin、用户名、邮箱）。
 *
 *   INTERNAL_REFS_EXTRA       分号或换行分隔的字面串
 *   INTERNAL_REFS_EXTRA_FILE  每行一条、`#` 开头的行忽略
 *
 * 两者都缺省时返回空数组 —— CI 上通常就是这种情况，这一档只剩结构判据。
 */
export function loadExtraRules({
  env = process.env,
  readFile = (file) => readFileSync(file, "utf8"),
} = {}) {
  const literals = [];

  const push = (raw) => {
    const value = String(raw).trim();
    if (value.length >= MIN_EXTRA_LITERAL_LENGTH && !value.startsWith("#")) {
      literals.push(value);
    }
  };

  (env.INTERNAL_REFS_EXTRA ?? "").split(/[;\n]/).forEach(push);

  const extraFile = env.INTERNAL_REFS_EXTRA_FILE ?? "";
  if (extraFile) {
    try {
      readFile(extraFile).split(/\r?\n/).forEach(push);
    } catch {
      // 读不到就当没配 —— 这一档是额外加固，不该把流程本身弄红。
    }
  }

  return [...new Set(literals)].map((literal) => ({
    label: "personal identifier",
    pattern: new RegExp(escapeRegExp(literal), "g"),
    redact: true,
    hint: "remove the author's personal identifier (account, username, or address)",
  }));
}

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
      if (
        ALLOWED_LITERAL_VALUES.has(match[0]) ||
        (typeof rule.allow === "function" && rule.allow(match))
      ) {
        continue;
      }
      findings.push({
        label: rule.label,
        hint: rule.hint,
        match: match[0],
        display: rule.redact ? redact(match[0]) : match[0],
        severity: rule.severity ?? "error",
      });
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
export function scanFileText(text, rules = DEFAULT_FILE_RULES) {
  const findings = [];
  text.split("\n").forEach((line, index) => {
    for (const finding of scanText(line, rules)) {
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
  rules = DEFAULT_FILE_RULES,
  readFile = (rel) => readFileSync(path.join(cwd, rel), "utf8"),
} = {}) {
  const findings = [];

  for (const rel of collectTrackedFiles({ cwd, git })) {
    if (isAllowedFile(rel)) {
      continue; // 上游 vendored 的 OpenAPI 与生成产物，见 ALLOWED_FILE_PATTERNS
    }
    let text;
    try {
      text = readFile(rel);
    } catch {
      continue; // 读不到的文件（权限、断链软链）跳过，别让扫描本身把 CI 弄红
    }
    for (const finding of scanFileText(text, rules)) {
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
  filesOnly = false,
  prTitle = "",
  prBody = "",
  git = defaultGit,
  log = console.log,
} = {}) {
  // `filesOnly` 是本地自检入口：不依赖 base（本地仓库常常没有 origin/main），
  // 只扫已跟踪文件内容，也不看 PR 元信息。CI 走的是带 base 的完整路径。
  if (!filesOnly) {
    const resolved = resolveBase(base, { cwd, git });
    if (!resolved.ok) {
      log(`OK: ${resolved.reason}; the internal-reference check does not apply.`);
      return { status: "skipped", findings: [], reason: resolved.reason };
    }
  }

  const findings = [];
  const collect = (source, text, rules) => {
    for (const finding of scanText(text, rules)) {
      findings.push({ source, ...finding });
    }
  };

  const extraRules = loadExtraRules();
  const metadataRules = [...TEXT_RULES, ...extraRules];

  if (!filesOnly) {
    collect("PR title", prTitle, [...TITLE_RULES, ...metadataRules]);
    collect("PR body", prBody, metadataRules);

    for (const commit of collectCommits({ base, cwd, git })) {
      collect(`commit ${commit.sha} headline`, commit.subject, [...TITLE_RULES, ...metadataRules]);
      collect(`commit ${commit.sha} message`, commit.body, metadataRules);
    }
  }

  const metadataFindings = [...findings];
  const fileFindings = scanTrackedFiles({ cwd, git, rules: [...DEFAULT_FILE_RULES, ...extraRules] });
  findings.push(...fileFindings);

  const errors = findings.filter((finding) => finding.severity !== "warn");
  const warnings = findings.filter((finding) => finding.severity === "warn");
  const metadataErrors = metadataFindings.filter((finding) => finding.severity !== "warn");
  const fileErrors = fileFindings.filter((finding) => finding.severity !== "warn");

  if (warnings.length > 0) {
    log(`NOTE: ${warnings.length} personal-information hint(s) — reported, not blocking:`);
    for (const finding of warnings) {
      log(`  ~ ${finding.source}: ${finding.label} — "${finding.display ?? finding.match}"`);
    }
    log("");
  }

  if (errors.length === 0) {
    if (warnings.length === 0) {
      log("OK: no internal references in PR metadata, commit messages, or tracked files.");
    }
    return { status: "ok", findings };
  }

  log("ERROR: internal references on public surfaces:");
  for (const finding of errors) {
    log(`  - ${finding.source}: ${finding.label} — "${finding.display ?? finding.match}"`);
  }

  if (metadataErrors.length > 0) {
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

  if (fileErrors.length > 0) {
    log("");
    log("Every tracked file in this repository is public. Rewrite the flagged lines so");
    log("they no longer name internal hosts, addresses, trackers, local paths, accounts,");
    log("environment ids, or credentials — and do not just move the reference to another");
    log("file. Personal values belong in the caller's environment, not in the repository.");
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
    if (arg === "--files") {
      options.filesOnly = true;
      return;
    }
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
  const { base, cwd, filesOnly } = parseArgs(process.argv.slice(2));
  const result = runCheck({
    base,
    cwd: cwd ? path.resolve(cwd) : ROOT_DIR,
    filesOnly,
    prTitle: process.env.PR_TITLE ?? "",
    prBody: process.env.PR_BODY ?? "",
  });

  process.exit(result.status === "failed" ? 1 : 0);
}
