#!/usr/bin/env node
"use strict";

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { startMockRegistry } from "./mock-registry.mjs";
import { removeTempRoot } from "./cleanup.mjs";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const SPEC = "@cloudbase/nge-testpkg@latest";
const SLUG = "_cloudbase_nge-testpkg_latest";

const results = [];
function check(ok, label, detail = "") {
  results.push({ ok, label });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

let registry, sink;
const received = [];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(predicate, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(200);
  }
  return false;
}
const mkRoot = () => fs.mkdtempSync(path.join(os.tmpdir(), "nge-hard-"));
function baseOf(root) {
  const d = fs.readdirSync(root).find((x) => x.includes("nge-testpkg"));
  return d ? path.join(root, d) : path.join(root, "__missing__");
}
function current(root) {
  const p = path.join(baseOf(root), "current");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : null;
}
function events(root) {
  const p = path.join(baseOf(root), "events.jsonl");
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return {}; } });
}
function env(root, extra = {}) {
  return {
    ...process.env,
    PATH: process.platform === "win32" ? (process.env.PATH || "") : `/usr/local/bin:${process.env.PATH || ""}`,
    NGE_ROOT: root,
    npm_config_cache: path.join(root, ".npmcache"),
    NGE_REGISTRY: registry.url,
    NGE_CHECK_INTERVAL: "3600000",
    NGE_TELEMETRY: "1",
    NGE_TELEMETRY_ENDPOINT: sink.url,
    NGE_TELEMETRY_TIMEOUT: "300",
    ...extra,
  };
}
function run(args, root, extra = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [INDEX, SPEC, ...args], {
      env: env(root, extra), stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, out, err, ms: Date.now() - t0 }));
  });
}
function runUpdate(root, extra = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [INDEX, "--nge-update", SPEC], {
      env: env(root, extra), stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("close", (code) => resolve(code));
  });
}
function spawnHeld(root, extra = {}) {
  const child = spawn(process.execPath, [INDEX, SPEC, "--sleep", "4000"], {
    env: env(root, extra), stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}
async function startSink() {
  const server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => {
      try { received.push(JSON.parse(b)); } catch {}
      res.writeHead(200); res.end("ok");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/analytics/v2_upload`,
    close: () => server.close(),
  };
}

async function main() {
  registry = await startMockRegistry();
  sink = await startSink();
  console.log(`mock registry: ${registry.url}\ntelemetry sink: ${sink.url}`);

  console.log("\n[1] DO_NOT_TRACK 关闭上报，本地事件仍写");
  const r1 = mkRoot();
  const cold = await run(["--sleep", "800"], r1);
  check(cold.code === 0, "cold start exits 0", cold.err.slice(0, 160));
  received.length = 0;
  const dnt = await run(["--sleep", "1200"], r1, { DO_NOT_TRACK: "1" });
  await wait(400);
  check(dnt.code === 0, "starts with DO_NOT_TRACK set");
  check(received.length === 0, "no network request", `received=${received.length}`);
  check(events(r1).some((e) => e.phase === "start"), "local event still written");
  removeTempRoot(r1);

  console.log("\n[2] 锁里 pid 已退出时立刻回收");
  const r2 = mkRoot();
  const lock2 = path.join(r2, SLUG, "lock");
  fs.mkdirSync(lock2, { recursive: true });
  fs.writeFileSync(path.join(lock2, "pid"), "999999999");
  const t2 = Date.now();
  const c2 = await run(["--sleep", "800"], r2, { NGE_FIRST_RUN_TIMEOUT: "10000" });
  check(c2.code === 0 && /TARGET_OK/.test(c2.out), "dead-pid lock reclaimed, install succeeds",
    `code=${c2.code} out=${JSON.stringify(c2.out)}`);
  check(Date.now() - t2 < 9000, "does not wait for the timeout", `${Date.now() - t2}ms`);
  removeTempRoot(r2);

  console.log("\n[3] 等锁只记一次，不会刷出上百条上报");
  const r3 = mkRoot();
  const lock3 = path.join(r3, SLUG, "lock");
  fs.mkdirSync(lock3, { recursive: true });
  // A live pid keeps the lock held for the whole wait window.
  fs.writeFileSync(path.join(lock3, "pid"), String(process.pid));
  received.length = 0;
  const c3 = await run([], r3, { NGE_FIRST_RUN_TIMEOUT: "3000" });
  const lockEvents = events(r3).filter((e) => e.phase === "update" && e.reason === "lock");
  const lockReports = received.filter((p) => p.events?.[0]?.mapValue?.reason === "lock").length;
  check(c3.code === 1, "gives up when no version can be installed");
  check(lockEvents.length === 1, "only one lock event in events.jsonl", `count=${lockEvents.length}`);
  check(lockReports <= 1, "no burst of telemetry while waiting", `reports=${lockReports}`);
  removeTempRoot(r3);

  console.log("\n[4] 租约保护仍在使用的版本，退出后回收");
  const r4 = mkRoot();
  const keep = { NGE_KEEP: "1" };
  const c4 = await run(["--sleep", "800"], r4, keep);
  check(c4.code === 0, "cold start installs 1.0.0", c4.err.slice(0, 160));
  const held = spawnHeld(r4, keep);
  const leaseDir = path.join(baseOf(r4), "leases");
  const leased = await waitFor(() => fs.existsSync(leaseDir)
    && fs.readdirSync(leaseDir).some((f) => /^\d+$/.test(f)), 6000);
  check(leased, "running instance registers a lease");
  registry.setLatest("2.0.0");
  await runUpdate(r4, keep);
  check(fs.existsSync(path.join(baseOf(r4), "versions", "1.0.0")),
    "leased 1.0.0 survives prune with KEEP=1");
  await wait(4600); // --sleep 4000 target exits, launcher removes its lease
  registry.setLatest("3.0.0");
  await runUpdate(r4, keep);
  check(!fs.existsSync(path.join(baseOf(r4), "versions", "1.0.0")),
    "1.0.0 is reclaimed after the instance exits");
  const deadLease = path.join(leaseDir, "999999999");
  fs.mkdirSync(leaseDir, { recursive: true });
  fs.writeFileSync(deadLease, "2.0.0");
  registry.setLatest("4.0.0");
  await runUpdate(r4, keep);
  check(!fs.existsSync(deadLease), "lease left by a dead pid is cleaned up");
  try { held.kill(); } catch {}
  removeTempRoot(r4);

  console.log("\n[5] 非法数字环境变量回落后仍能检查更新");
  const r5 = mkRoot();
  await run(["--sleep", "800"], r5);
  fs.writeFileSync(path.join(baseOf(r5), "last-check"), "0");
  registry.setLatest("2.0.0");
  const bad = spawn(process.execPath, [INDEX, SPEC, "--sleep", "2500"], {
    env: env(r5, { NGE_CHECK_INTERVAL: "abc" }), stdio: ["ignore", "pipe", "pipe"],
  });
  bad.stdout.on("data", () => {});
  bad.stderr.on("data", () => {});
  const checked = await waitFor(() => current(r5) === "2.0.0", 10000);
  check(checked, "NaN falls back to the default interval and update runs", `current=${current(r5)}`);
  await wait(2800);
  try { bad.kill(); } catch {}
  removeTempRoot(r5);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  sink.close();
  registry.close();
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  if (sink) sink.close();
  if (registry) registry.close();
  process.exit(1);
});
