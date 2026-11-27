#!/usr/bin/env node
/**
 * 守住「错误码唯一真源」。
 *
 * 检查三件事：
 *   1) 登记表自身合法：category / origin / since 取值、自有码命名、重复键、两表交叉、解析完整性。
 *   2) 产品源码里的错误码字面量必须已登记。覆盖字段赋值、三元条件赋值、比较式判断、switch 分支。
 *   3) 动态拼接的码只提示不阻断：这类值运行时才确定，按文本聚合必然散条。
 *
 * 约定写在 mcp/src/utils/error-codes.ts 的头部注释里。
 * --self-test 会为每种写法各造一个未登记的反例，并确认合法写法不会被误伤。
 *
 *   node scripts/check-error-codes.mjs
 *   node scripts/check-error-codes.mjs --json
 *   node scripts/check-error-codes.mjs --self-test
 */

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SELF_PATH = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(SELF_PATH), "..");
const REGISTRY_PATH = path.join(ROOT_DIR, "mcp/src/utils/error-codes.ts");
const REGISTRY_REL = path.relative(ROOT_DIR, REGISTRY_PATH);
const SRC_DIR = path.join(ROOT_DIR, "mcp/src");

const CATEGORIES = new Set([
  "invalid_argument", "not_found", "permission", "precondition",
  "action_required", "unavailable", "internal",
]);
const ORIGINS = new Set(["self", "cloud_api"]);
const SINCE = new Set(["legacy", "next"]);
const SELF_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

// Node / 系统层错误码，不属于业务错误码，不需要登记。
const EXTERNAL = new Set([
  "ENOTFOUND", "ENOENT", "ETIMEDOUT", "EACCES", "SIGINT", "SIGTERM",
]);
// 三元 / 状态比较里的普通词、JS 类型名，不是码。
const NOT_A_CODE = new Set([
  "FAILED", "SUCCEED", "SUCCESS", "READY", "PENDING", "ACTIVE", "AVAILABLE",
  "NORMAL", "EXPIRED", "IDLE", "RUNNING", "string", "number", "boolean",
  "object", "undefined", "function",
]);
const CODE_LIKE = /^(?:[A-Z][A-Z0-9_]{4,}|[A-Z][A-Za-z0-9]*\.[A-Za-z0-9.]+|InsufficientBalance)$/;

function isCodeLike(value) {
  return (
    typeof value === "string" &&
    !NOT_A_CODE.has(value) &&
    !value.startsWith("setup.") &&
    CODE_LIKE.test(value)
  );
}

function blockBetween(text, startMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) return null;
  const end = text.indexOf("\n} as const", start);
  if (end < 0) return null;
  return text.slice(start, end);
}

const ENTRY_LINE =
  /^\s*"([^"]+)":\s*\{\s*category:\s*"([^"]+)",\s*origin:\s*"([^"]+)",\s*since:\s*"([^"]+)",\s*note:\s*"[^"]*"\s*\},?\s*$/gm;
const STATUS_LINE = /^\s*"([^"]+)":\s*\{\s*note:\s*"[^"]*"\s*\},?\s*$/gm;
const ENTRY_START = /^\s*"[^"]+":\s*\{/gm;

function parseRegistry(text) {
  const errorBlock = blockBetween(text, "export const ERROR_CODES = {");
  const statusBlock = blockBetween(text, "export const STATUS_CODES = {");
  if (errorBlock === null || statusBlock === null) {
    throw new Error("登记表结构变了：找不到 ERROR_CODES / STATUS_CODES 块");
  }
  const entries = [...errorBlock.matchAll(ENTRY_LINE)].map((m) => ({
    code: m[1], category: m[2], origin: m[3], since: m[4],
  }));
  const statuses = [...statusBlock.matchAll(STATUS_LINE)].map((m) => m[1]);
  return {
    entries,
    statuses,
    expectedErrors: [...errorBlock.matchAll(ENTRY_START)].length,
    expectedStatuses: [...statusBlock.matchAll(ENTRY_START)].length,
  };
}

function listSourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!name.name.endsWith(".ts") || name.name.endsWith(".test.ts")) continue;
    if (full === REGISTRY_PATH) continue;
    out.push(full);
  }
  return out;
}

function scanSource(text, relPath) {
  const found = [];
  const lines = text.split("\n");
  const fieldRe = /(?:errorCode|(?<![A-Za-z])code|error_category|credential_warning)\s*:\s*(?:"([^"]+)"|'([^']+)')/g;
  const compareRe =
    /(?:"([^"]+)"|'([^']+)')\s*(?:===|!==|==)\s*(?:errorCode|\bcode)|(?:errorCode|\bcode)\s*(?:===|!==|==)\s*(?:"([^"]+)"|'([^']+)')|\.includes\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/g;
  const caseRe = /case\s+(?:"([^"]+)"|'([^']+)')\s*:/g;
  const categoryRe = /error_category\s*:\s*"([^"]+)"/g;
  const ALLOWED_CATEGORIES = new Set([
    "credential_expired",
    "credential_scope_limited",
    "credential_invalid",
    "cam_denied",
    "cloud_api_error",
  ]);

  lines.forEach((line, index) => {
    // 0) 分类值白名单：写错分类名也要被拦下，即使它不是大写码形。
    for (const m of line.matchAll(categoryRe)) {
      if (!ALLOWED_CATEGORIES.has(m[1])) found.push({ code: m[1], line: index + 1 });
    }
    // 1) 字段赋值：errorCode: "X" / code: "X"
    for (const m of line.matchAll(fieldRe)) {
      const value = m[1] ?? m[2];
      if (isCodeLike(value)) found.push({ code: value, line: index + 1 });
    }
    // 2) 比较式：errorCode === "X" / "X" === code / .includes("X")
    for (const m of line.matchAll(compareRe)) {
      const value = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6];
      if (isCodeLike(value)) found.push({ code: value, line: index + 1 });
    }
    // 3) 三元 / 条件赋值行里的大写字面量（字面量不紧跟字段名）
    if (/\berrorCode\s*:/.test(line)) {
      for (const m of line.matchAll(/"([A-Z][A-Z0-9_]{4,})"/g)) {
        if (!NOT_A_CODE.has(m[1])) found.push({ code: m[1], line: index + 1 });
      }
    }
    // 4) switch 分支里的码形字面量
    for (const m of line.matchAll(caseRe)) {
      const value = m[1] ?? m[2];
      if (isCodeLike(value)) found.push({ code: value, line: index + 1 });
    }
  });

  const seen = new Set();
  return found
    .map((item) => ({ ...item, file: relPath }))
    .filter((item) => {
      const key = `${item.file}:${item.line}:${item.code}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function collect() {
  const violations = [];
  const warnings = [];

  let registry;
  try {
    registry = parseRegistry(readFileSync(REGISTRY_PATH, "utf8"));
  } catch (error) {
    violations.push({ file: REGISTRY_REL, line: 0, message: String(error.message) });
    return { violations, warnings, entries: 0, statuses: 0, literals: 0 };
  }

  if (registry.entries.length !== registry.expectedErrors ||
      registry.statuses.length !== registry.expectedStatuses) {
    violations.push({
      file: REGISTRY_REL,
      line: 0,
      message: `登记表解析不完整：ERROR_CODES ${registry.entries.length}/${registry.expectedErrors}、STATUS_CODES ${registry.statuses.length}/${registry.expectedStatuses}，条目必须单行且字段顺序固定`,
    });
  }

  const codes = registry.entries.map((entry) => entry.code);
  const statusNames = registry.statuses;
  for (const [label, values] of [["ERROR_CODES", codes], ["STATUS_CODES", statusNames]]) {
    for (const value of new Set(values.filter((v, i) => values.indexOf(v) !== i))) {
      violations.push({ file: REGISTRY_REL, line: 0, message: `${label}: 重复登记的码 ${value}` });
    }
  }
  for (const value of codes) {
    if (statusNames.includes(value)) {
      violations.push({ file: REGISTRY_REL, line: 0, message: `${value} 同时出现在两张表里` });
    }
  }

  for (const entry of registry.entries) {
    if (!CATEGORIES.has(entry.category)) {
      violations.push({ file: REGISTRY_REL, line: 0, message: `${entry.code}: 未知 category ${entry.category}` });
    }
    if (!ORIGINS.has(entry.origin)) {
      violations.push({ file: REGISTRY_REL, line: 0, message: `${entry.code}: 未知 origin ${entry.origin}` });
    }
    if (!SINCE.has(entry.since)) {
      violations.push({ file: REGISTRY_REL, line: 0, message: `${entry.code}: 未知 since ${entry.since}` });
    }
    if (entry.origin === "self" && !SELF_CODE_PATTERN.test(entry.code)) {
      violations.push({ file: REGISTRY_REL, line: 0, message: `${entry.code}: 自有码必须匹配 [A-Z][A-Z0-9_]*` });
    }
  }

  const registered = new Set([...codes, ...statusNames]);
  let literalCount = 0;
  for (const file of listSourceFiles(SRC_DIR)) {
    const relPath = path.relative(ROOT_DIR, file);
    const text = readFileSync(file, "utf8");
    for (const hit of scanSource(text, relPath)) {
      literalCount += 1;
      if (EXTERNAL.has(hit.code)) continue;
      if (!registered.has(hit.code)) {
        violations.push({
          file: relPath,
          line: hit.line,
          message: `未登记的错误码 ${hit.code}：先在 mcp/src/utils/error-codes.ts 登记，再引用常量`,
        });
      }
    }
    if (/`HOSTING_\$\{[^}]*\}_FAILED`/.test(text)) {
      warnings.push(`${relPath}: 动态拼接的 HOSTING_<action>_FAILED，后续改成枚举`);
    }
  }
  if (literalCount > 0) {
    warnings.push(`产品源码仍有 ${literalCount} 处错误码裸字面量，后续迁移成常量引用`);
  }
  return {
    violations, warnings,
    entries: codes.length,
    statuses: statusNames.length,
    literals: literalCount,
  };
}

function finish(result, asJson) {
  const output = { ok: result.violations.length === 0, ...result };
  if (asJson) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`登记表：${result.entries} 个错误码 / ${result.statuses} 个状态值；源码裸字面量 ${result.literals} 处`);
    for (const warning of result.warnings) console.log(`  ⚠ ${warning}`);
    if (result.violations.length === 0) {
      console.log("错误码检查通过");
    } else {
      for (const v of result.violations) {
        console.error(`  ✗ ${v.file}${v.line ? `:${v.line}` : ""} ${v.message}`);
      }
      console.error(`共 ${result.violations.length} 处违规`);
    }
  }
  process.exitCode = result.violations.length === 0 ? 0 : 1;
}

function runCheckJson() {
  const child = spawnSync(process.execPath, [SELF_PATH, "--json"], {
    encoding: "utf8", cwd: ROOT_DIR, timeout: 30000,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(child.stdout);
  } catch {
    parsed = null;
  }
  return { status: child.status, parsed };
}

const PROBE_CODE = "SELF_TEST_UNREGISTERED_CODE";
const NEGATIVE_CASES = [
  { name: "字段赋值", text: `export const p = { errorCode: "${PROBE_CODE}" };\n` },
  { name: "比较式判断", text: `export const p = (errorCode) => errorCode === "${PROBE_CODE}";\n` },
  { name: "三元条件赋值", text: `export const p = (ok) => ({ errorCode: ok ? "${PROBE_CODE}" : undefined });\n` },
  { name: "code 字段", text: `export const p = { code: "${PROBE_CODE}" };\n` },
  { name: "switch 分支", text: `export function p(c) { switch (c) { case "${PROBE_CODE}": return true; } }\n` },
  { name: "分类字段", text: `export const p = { error_category: "${PROBE_CODE}" };\n` },
  { name: "非法分类值", text: `export const p = { error_category: "SELF_TEST_BAD_CATEGORY" };\n` },
];
const POSITIVE_CASES = [
  { name: "已登记状态值", text: `export const p = { code: "AUTH_READY" };\n` },
  { name: "JS 类型字符串", text: `export const p = (code) => typeof code === "string";\n` },
  { name: "合法分类值", text: `export const p = { error_category: "credential_expired" };\n` },
];

/** CI 里可重复执行的自检：每种写法各造一个反例，并确认合法写法不被误伤。 */
function runSelfTest(asJson) {
  const steps = [];
  let ok = false;
  const probes = [];

  const runCase = (probeName, text) => {
    const probe = path.join(SRC_DIR, "tools", probeName);
    probes.push(probe);
    writeFileSync(probe, text, "utf8");
    const result = runCheckJson();
    const hits = (result.parsed?.violations ?? []).filter((v) => v.file.endsWith(probeName));
    try { unlinkSync(probe); } catch { /* 交给 finally 兜底 */ }
    probes.pop();
    return { result, hits };
  };

  try {
    const baseline = runCheckJson();
    steps.push(`baseline: exit=${baseline.status}, ok=${baseline.parsed?.ok}`);
    if (baseline.status !== 0 || !baseline.parsed?.ok) {
      throw new Error("基线检查未通过，先修登记表或源码");
    }

    for (const [index, testCase] of NEGATIVE_CASES.entries()) {
      const probeName = `__error_codes_probe_${process.pid}_n${index}.ts`;
      const { result, hits } = runCase(probeName, testCase.text);
      steps.push(`反例 ${testCase.name}: exit=${result.status}, hits=${hits.length}`);
      if (result.status !== 1 || result.parsed?.ok !== false || hits.length !== 1) {
        throw new Error(`反例「${testCase.name}」未被正确拦下（预期 exit=1、ok=false、恰好一处命中）`);
      }
    }
    for (const [index, testCase] of POSITIVE_CASES.entries()) {
      const probeName = `__error_codes_probe_${process.pid}_p${index}.ts`;
      const { result, hits } = runCase(probeName, testCase.text);
      steps.push(`正例 ${testCase.name}: exit=${result.status}, hits=${hits.length}`);
      if (result.status !== 0 || result.parsed?.ok !== true || hits.length !== 0) {
        throw new Error(`正例「${testCase.name}」被误伤（预期 exit=0、ok=true、无命中）`);
      }
    }
    ok = true;
  } catch (error) {
    steps.push(`failed: ${error.message}`);
  } finally {
    for (const probe of probes) {
      try { unlinkSync(probe); } catch { /* 已删除或没建成 */ }
    }
  }

  const result = { ok, steps };
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const step of steps) console.log(`  ${step}`);
    console.log(ok ? "门禁自检通过" : "门禁自检失败");
  }
  process.exitCode = ok ? 0 : 1;
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  runSelfTest(args.includes("--json"));
} else {
  finish(collect(), args.includes("--json"));
}
