#!/usr/bin/env node
"use strict";

// MCP speaks JSON-RPC on stdout. Every launcher path except the manual
// --nge-diag command must leave stdout completely untouched.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockRegistry } from "./mock-registry.mjs";
import { removeTempRoot } from "./cleanup.mjs";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const SPEC = "@cloudbase/nge-testpkg@latest";

const results = [];
function check(ok, label, detail = "") {
  results.push({ ok, label });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

const mkRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "nge-stdout-"));
let registry;

function env(root, extra = {}) {
  return {
    ...process.env,
    PATH: process.platform === "win32"
      ? (process.env.PATH || "")
      : `/usr/local/bin:${process.env.PATH || ""}`,
    NGE_ROOT: root,
    npm_config_cache: path.join(root, ".npmcache"),
    NGE_REGISTRY: registry.url,
    NGE_CHECK_INTERVAL: "3600000",
    NGE_TELEMETRY: "0",
    ...extra,
  };
}

function run(args, root, extra = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [INDEX, ...args], {
      env: env(root, extra), stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

async function main() {
  registry = await startMockRegistry();

  console.log("\n[1] 静态：stdout 写入只允许出现在 --nge-diag 分支");
  const src = fs.readFileSync(INDEX, "utf8");
  const diagStart = src.indexOf('if (spec === "--nge-diag")');
  const diagEnd = src.indexOf("  const c = context(spec);", diagStart);
  const lineOf = (offset) => src.slice(0, offset).split("\n").length;
  const diagStartLine = lineOf(diagStart);
  const diagEndLine = lineOf(diagEnd);
  const writes = [];
  src.split("\n").forEach((line, i) => {
    if (/process\.stdout\.(write|end)|\bconsole\.log\b/.test(line)) writes.push(i + 1);
  });
  check(diagStart > 0 && diagEnd > diagStart && writes.length > 0
    && writes.every((n) => n >= diagStartLine && n <= diagEndLine),
  "stdout writes are confined to the manual diag branch", `writes at L${writes.join(",L")}, diag L${diagStartLine}-${diagEndLine}`);
  check(!/\bconsole\.log\b/.test(src), "no console.log anywhere in the launcher");

  console.log("\n[2] 冷启动：stdout 只有目标包输出");
  const r2 = mkRoot();
  const cold = await run([SPEC, "--sleep", "50"], r2);
  check(cold.code === 0 && /^TARGET_OK 1\.0\.0\s*$/.test(cold.out),
    "cold start stdout is only the target output", JSON.stringify(cold.out));
  check(!/npm|registry|added [0-9]+ package|toolkit_launcher|install\.log/i.test(cold.out),
    "no npm or telemetry noise on stdout", JSON.stringify(cold.out));

  console.log("\n[3] 首次安装失败：stdout 必须是空的");
  const r3 = mkRoot();
  registry.setOffline(true);
  const failed = await run([SPEC], r3, {
    NGE_FIRST_RUN_TIMEOUT: "1200",
    npm_config_fetch_retries: "0",
    npm_config_fetch_timeout: "2000",
  });
  registry.setOffline(false);
  check(failed.code === 1 && failed.out === "",
    "first-install failure writes nothing to stdout", `code=${failed.code} out=${JSON.stringify(failed.out)}`);
  check(/Failed to install/.test(failed.err), "failure message goes to stderr");

  console.log("\n[4] 后台更新：stdout 必须是空的");
  const r4 = mkRoot();
  await run([SPEC, "--sleep", "50"], r4);
  const bg = await run(["--nge-update", SPEC], r4, { NGE_CHECK_INTERVAL: "0" });
  check(bg.out === "", "background update writes nothing to stdout", JSON.stringify(bg.out));

  console.log("\n[5] 参数错误与非法版本范围：stdout 必须是空的");
  const r5 = mkRoot();
  const noArgs = await run([], r5);
  const badRange = await run(["@cloudbase/nge-testpkg@>=1 <2"], r5);
  check(noArgs.out === "" && badRange.out === "",
    "usage and invalid-range errors stay on stderr",
    `noArgs=${JSON.stringify(noArgs.out)} badRange=${JSON.stringify(badRange.out)}`);
  check(/Usage:/.test(noArgs.err) && /Unsupported version range/.test(badRange.err),
    "both errors are readable on stderr");

  console.log("\n[6] --nge-diag 仍输出到 stdout（仅手动排障用）");
  const r6 = mkRoot();
  const diag = await run(["--nge-diag", SPEC], r6);
  check(diag.out.startsWith("platform=") && /current=/.test(diag.out),
    "diag output is preserved", JSON.stringify(diag.out.slice(0, 60)));

  for (const r of [r2, r3, r4, r5, r6]) removeTempRoot(r);
  const failedChecks = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`);
  registry.close();
  if (failedChecks.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  if (registry) registry.close();
  process.exit(1);
});
