#!/usr/bin/env node
/**
 * 守住「错误码唯一真源」。
 *
 * 检查三件事：
 *   1) 登记表自身合法：category / origin / since 取值、自有码命名、无重复键。
 *   2) 产品源码里出现的 errorCode / code 字面量必须已登记（裸字面量数量供后续收敛）。
 *   3) 动态拼接的码只提示不阻断：这类值运行时才确定，按文本聚合必然散条。
 *
 * 约定写在 mcp/src/utils/error-codes.ts 的头部注释里。
 * 故意写一个未登记的码，本脚本必须非零退出；--self-test 会自己造这个反例并验证。
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
// 三元 / 状态比较里的普通词，不是码。
const NOT_A_CODE = new Set([
  "FAILED", "SUCCEED", "SUCCESS", "UNKNOWN", "READY", "PENDING",
  "ACTIVE", "AVAILABLE", "NORMAL", "EXPIRED", "IDLE", "RUNNING",
]);

function blockBetween(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) return null;
  const end = text.indexOf(endMarker, start);
  if (end < 0) return null;
  return text.slice(start, end);
}

const ENTRY_LINE =
  /^\s*"([^"]+)":\s*\{\s*category:\s*"([^"]+)",\s*origin:\s*"([^"]+)",\s*since:\s*"([^"]+)",\s*note:\s*"[^"]*"\s*\},?\s*$/gm;
const STATUS_LINE = /^\s*"([^"]+)":\s*\{\s*note:\s*"[^"]*"\s*\},?\s*$/gm;

function parseRegistry(text) {
  const errorBlock = blockBetween(text, "export const ERROR_CODES = {", "\n} as const satisfies");
  const statusBlock = blockBetween(text, "export const STATUS_CODES = {", "\n} as const;");
  if (errorBlock === null || statusBlock === null) {
    throw new Error("登记表结构变了：找不到 ERROR_CODES / STATUS_CODES 块");
  }
  const entries = [];
  for (const match of errorBlock.matchAll(ENTRY_LINE)) {
    entries.push({ code: match[1], category: match[2], origin: match[3], since: match[4] });
  }
  const statuses = [];
  for (const match of statusBlock.matchAll(STATUS_LINE)) {
    statuses.push(match[1]);
  }
  return { entries, statuses };
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
  lines.forEach((line, index) => {
    // 字段直接赋值：errorCode: "X" / code: "X"
    for (const match of line.matchAll(/(?:errorCode|(?<![A-Za-z])code)\s*:\s*"([A-Z][A-Za-z0-9_.]+)"/g)) {
      found.push({ code: match[1], line: index + 1, field: true });
    }
    // 条件赋值：errorCode: cond ? "X" : "Y"（字面量不紧跟字段名）
    if (/\berrorCode\s*:/.test(line)) {
      for (const match of line.matchAll(/"([A-Z][A-Z0-9_]{4,})"/g)) {
        const code = match[1];
        if (NOT_A_CODE.has(code)) continue;
        found.push({ code, line: index + 1, field: false });
      }
    }
    // 比较式判断：code === "FailedOperation.X" / has("X")
    if (/\b(?:code|has)\s*(?:===|!==|\()\s*"/.test(line)) {
      for (const match of line.matchAll(/"([A-Z][A-Za-z0-9_.]+)"/g)) {
        const code = match[1];
        if (NOT_A_CODE.has(code)) continue;
        found.push({ code, line: index + 1, field: false });
      }
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
    const rel = path.relative(ROOT_DIR, REGISTRY_PATH);
    violations.push({ file: rel, line: 0, message: String(error.message) });
    return { violations, warnings, entries: 0, statuses: 0, literals: 0 };
  }

  // 重复键：Map 会静默覆盖，这里按数组长度查。
  const codes = registry.entries.map((entry) => entry.code);
  const statusNames = registry.statuses;
  for (const [label, values] of [["ERROR_CODES", codes], ["STATUS_CODES", statusNames]]) {
    const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
    for (const value of new Set(duplicates)) {
      violations.push({ file: path.relative(ROOT_DIR, REGISTRY_PATH), line: 0, message: `${label}: 重复登记的码 ${value}` });
    }
  }
  for (const value of codes) {
    if (statusNames.includes(value)) {
      violations.push({ file: path.relative(ROOT_DIR, REGISTRY_PATH), line: 0, message: `${value} 同时出现在两张表里` });
    }
  }

  for (const entry of registry.entries) {
    const rel = path.relative(ROOT_DIR, REGISTRY_PATH);
    if (!CATEGORIES.has(entry.category)) {
      violations.push({ file: rel, line: 0, message: `${entry.code}: 未知 category ${entry.category}` });
    }
    if (!ORIGINS.has(entry.origin)) {
      violations.push({ file: rel, line: 0, message: `${entry.code}: 未知 origin ${entry.origin}` });
    }
    if (!SINCE.has(entry.since)) {
      violations.push({ file: rel, line: 0, message: `${entry.code}: 未知 since ${entry.since}` });
    }
    if (entry.origin === "self" && !SELF_CODE_PATTERN.test(entry.code)) {
      violations.push({ file: rel, line: 0, message: `${entry.code}: 自有码必须匹配 [A-Z][A-Z0-9_]*` });
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
  const child = spawnSync(process.execPath, [SELF_PATH, "--json"], { encoding: "utf8", cwd: ROOT_DIR });
  let parsed = null;
  try {
    parsed = JSON.parse(child.stdout);
  } catch {
    parsed = null;
  }
  return { status: child.status, parsed, stderr: child.stderr };
}

/** CI 里可重复执行的自检：先确认基线干净，再造一个未登记的码，确认被拦且只报一处。 */
function runSelfTest(asJson) {
  const probe = path.join(SRC_DIR, "tools", `__error_codes_self_test_${process.pid}.ts`);
  const steps = [];
  let ok = false;
  try {
    const baseline = runCheckJson();
    steps.push(`baseline: exit=${baseline.status}, ok=${baseline.parsed?.ok}`);
    if (baseline.status !== 0 || !baseline.parsed?.ok) {
      throw new Error("基线检查未通过，先修登记表或源码");
    }

    writeFileSync(probe, 'export const probe = { errorCode: "SELF_TEST_UNREGISTERED_CODE" };\n', "utf8");
    const negative = runCheckJson();
    const hits = (negative.parsed?.violations ?? []).filter((v) => v.file.includes("__error_codes_self_test"));
    steps.push(`negative: exit=${negative.status}, ok=${negative.parsed?.ok}, hits=${hits.length}`);
    if (negative.status !== 1 || negative.parsed?.ok !== false || hits.length !== 1) {
      throw new Error("未登记的码没有被正确拦下（预期 exit=1、ok=false、恰好一处命中）");
    }
    ok = true;
  } catch (error) {
    steps.push(`failed: ${error.message}`);
  } finally {
    try { unlinkSync(probe); } catch { /* 文件可能没建成 */ }
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
