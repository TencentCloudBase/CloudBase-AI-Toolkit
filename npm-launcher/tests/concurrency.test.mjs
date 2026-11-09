#!/usr/bin/env node
"use strict";

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nge-concurrency-"));

const results = [];
function check(ok, label, detail = "") {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function env(extra = {}) {
  return {
    ...process.env,
    PATH: process.platform === "win32"
      ? (process.env.PATH || "")
      : `/usr/local/bin:${process.env.PATH || ""}`,
    NGE_ROOT: ROOT,
    NGE_CHECK_INTERVAL: "3600000",
    NGE_TELEMETRY: "0", // tests must never send real telemetry to beacon
    ...extra,
  };
}

function once(spec, extra = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [INDEX, spec, "1.2.3"], {
      env: env(extra), stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

async function concurrent(spec, n, extra = {}) {
  const runs = await Promise.all(Array.from({ length: n }, () => once(spec, extra)));
  const failed = runs.filter((r) => r.code !== 0);
  const noisy = runs.filter((r) => /ENOTEMPTY|EJSONPARSE|EEXIST/.test(r.out + r.err));
  return { runs, failed, noisy };
}

function baseOf(spec) {
  const at = spec.lastIndexOf("@");
  return path.join(ROOT, `${spec.slice(0, at)}@${spec.slice(at + 1)}`.replace(/[@/\\:]/g, "_"));
}

function installLog(spec) {
  const p = path.join(baseOf(spec), "install.log");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

async function main() {
  const A = "semver@7.5.4";
  const B = "semver@7.6.0";
  const N = 12;

  console.log(`isolated root: ${ROOT}`);
  console.log(`\n[1] ${N} concurrent first-run installs of ${A}`);
  const a = await concurrent(A, N);
  check(a.failed.length === 0, "all first-run processes exit 0",
    a.failed.length ? `${a.failed.length} failed: ${a.failed[0].err.slice(0, 160)}` : "");
  check(a.noisy.length === 0, "no ENOTEMPTY / EJSONPARSE in process output");
  const logA = installLog(A);
  check(!/ENOTEMPTY|EJSONPARSE/.test(logA), "install.log has no npm conflict errors");
  const curA = path.join(baseOf(A), "current");
  check(fs.existsSync(curA) && fs.readFileSync(curA, "utf8").trim() === "7.5.4",
    "current points at 7.5.4");
  const dirsA = fs.readdirSync(path.join(baseOf(A), "versions"));
  check(dirsA.filter((d) => d.startsWith(".tmp-")).length === 0,
    "no leftover .tmp-* directories", dirsA.join(", "));

  console.log(`\n[2] ${N} concurrent installs of a second version ${B}`);
  const b = await concurrent(B, N);
  check(b.failed.length === 0, "all second-version processes exit 0",
    b.failed.length ? `${b.failed.length} failed: ${b.failed[0].err.slice(0, 160)}` : "");
  check(fs.existsSync(path.join(baseOf(A), "versions", "7.5.4")),
    "first version directory still intact");
  check(fs.existsSync(path.join(baseOf(B), "versions", "7.6.0")),
    "second version directory created");

  console.log(`\n[3] ${N} concurrent warm starts of ${A} with background update enabled`);
  const c = await concurrent(A, N, { NGE_CHECK_INTERVAL: "0" });
  check(c.failed.length === 0, "all warm starts exit 0",
    c.failed.length ? `${c.failed.length} failed: ${c.failed[0].err.slice(0, 160)}` : "");
  await new Promise((r) => setTimeout(r, 2500));
  const curAfter = fs.readFileSync(curA, "utf8").trim();
  check(curAfter === "7.5.4" || curAfter === "7.6.0", "current still valid after background update",
    `current=${curAfter}`);
  check(!/EJSONPARSE/.test(installLog(A)), "no corrupted package.json after concurrent writes");

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  fs.rmSync(ROOT, { recursive: true, force: true });
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  fs.rmSync(ROOT, { recursive: true, force: true });
  process.exit(1);
});
