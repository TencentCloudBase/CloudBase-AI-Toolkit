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
// Reproduces how Electron-style clients supervise MCP servers on Windows: the
// launcher runs inside a Job object with KILL_ON_JOB_CLOSE, and closing the
// job kills every process in it. PowerShell puts itself in the job first so
// the launcher and everything it spawns inherit the job with no race.
const JOB_PS1 = String.raw`
param($Node, $Index, $Spec, $Base)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NgeJob {
  [StructLayout(LayoutKind.Sequential)] public struct BASIC {
    public long PerProcessUserTimeLimit; public long PerJobUserTimeLimit; public uint LimitFlags;
    public UIntPtr MinimumWorkingSetSize; public UIntPtr MaximumWorkingSetSize; public uint ActiveProcessLimit;
    public UIntPtr Affinity; public uint PriorityClass; public uint SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] public struct IOC {
    public ulong R; public ulong W; public ulong O; public ulong RB; public ulong WB; public ulong OB; }
  [StructLayout(LayoutKind.Sequential)] public struct EXT {
    public BASIC Basic; public IOC Io; public UIntPtr ProcessMemoryLimit; public UIntPtr JobMemoryLimit;
    public UIntPtr PeakProcessMemoryUsed; public UIntPtr PeakJobMemoryUsed; }
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr CreateJobObject(IntPtr a, string n);
  [DllImport("kernel32.dll")] public static extern bool SetInformationJobObject(IntPtr j, int c, ref EXT i, uint l);
  [DllImport("kernel32.dll")] public static extern bool AssignProcessToJobObject(IntPtr j, IntPtr p);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
'@
$job = [NgeJob]::CreateJobObject([IntPtr]::Zero, $null)
$info = New-Object NgeJob+EXT
$info.Basic.LimitFlags = 0x2000
if (-not [NgeJob]::SetInformationJobObject($job, 9, [ref]$info, [uint32][Runtime.InteropServices.Marshal]::SizeOf($info))) { [Console]::Out.WriteLine('SETINFO_FAILED'); exit 2 }
if (-not [NgeJob]::AssignProcessToJobObject($job, [Diagnostics.Process]::GetCurrentProcess().Handle)) { [Console]::Out.WriteLine('ASSIGN_FAILED'); exit 2 }
$null = Start-Process -FilePath $Node -ArgumentList @(('"' + $Index + '"'), $Spec) -PassThru -WindowStyle Hidden
$lock = Join-Path $Base 'lock'
for ($i = 0; $i -lt 300 -and -not (Test-Path $lock); $i++) { Start-Sleep -Milliseconds 100 }
[Console]::Out.WriteLine('LOCK_SEEN=' + (Test-Path $lock))
[Console]::Out.Flush()
$null = [NgeJob]::CloseHandle($job)
Start-Sleep -Seconds 5
[Console]::Out.WriteLine('STILL_ALIVE')
`;

async function killedByJob(extra) {
  const root = mkRoot();
  const base = path.join(root, SLUG);
  fs.mkdirSync(base, { recursive: true });
  const ps1 = path.join(root, "job.ps1");
  fs.writeFileSync(ps1, JOB_PS1);
  const out = await new Promise((resolve) => {
    const ps = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", ps1, process.execPath, INDEX, SPEC, base], {
      env: env(root, { NGE_FIRST_RUN_TIMEOUT: "60000", ...extra }), stdio: ["ignore", "pipe", "pipe"],
    });
    let o = "";
    ps.stdout.on("data", (d) => { o += d; });
    ps.stderr.on("data", (d) => { o += d; });
    ps.on("close", () => resolve(o.trim()));
  });
  // The tarball is delayed 4 s; give a surviving installer time to finish.
  await waitFor(() => current(root) !== null, 15000);
  const result = {
    out: out.slice(0, 300),
    lockSeen: /LOCK_SEEN=True/.test(out) && !/STILL_ALIVE/.test(out),
    current: current(root),
    leftovers: fs.readdirSync(base).filter((f) => f.startsWith(".updater-env-")),
  };
  removeTempRoot(root);
  return result;
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

  console.log("\n[6] 非法版本范围明确报错，不会在 Windows 崩在 mkdirSync");
  const r6 = mkRoot();
  const bad6 = await new Promise((resolve) => {
    const child = spawn(process.execPath, [INDEX, "@cloudbase/nge-testpkg@>=1 <2"], {
      env: env(r6), stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, err }));
  });
  check(bad6.code === 1 && /Unsupported version range/.test(bad6.err),
    "invalid range exits with a clear message", `code=${bad6.code} err=${bad6.err.trim().slice(0, 90)}`);
  removeTempRoot(r6);

  console.log("\n[7] 子进程 pid 也有租约，kill -9 launcher 后版本仍受保护");
  if (process.platform === "win32") {
    check(true, "SKIP on Windows (SIGKILL semantics differ)");
  } else {
    const r7 = mkRoot();
    const held = spawn(process.execPath, [INDEX, SPEC, "--hold"], {
      env: env(r7, { NGE_FIRST_RUN_TIMEOUT: "10000" }), stdio: ["ignore", "pipe", "pipe"],
    });
    const leases7 = path.join(r7, SLUG, "leases");
    const ok7 = await waitFor(() => {
      try { return fs.readdirSync(leases7).filter((f) => /^\d+$/.test(f)).length >= 2; } catch { return false; }
    }, 15000);
    const files7 = ok7 ? fs.readdirSync(leases7).filter((f) => /^\d+$/.test(f)) : [];
    check(ok7 && files7.includes(String(held.pid)),
      "launcher and MCP child both hold a lease", `leases=${files7.join(",")} launcher=${held.pid}`);
    const childPid = Number(files7.find((f) => f !== String(held.pid)));
    const ver7 = current(r7);
    try { process.kill(held.pid, "SIGKILL"); } catch {}
    await wait(300);
    let childAlive = false;
    try { process.kill(childPid, 0); childAlive = true; } catch {}
    check(childAlive, "MCP child survives a kill -9 of the launcher");
    registry.setLatest("2.0.0");
    await runUpdate(r7, { NGE_KEEP: "1" });
    check(fs.existsSync(path.join(r7, SLUG, "versions", ver7)),
      "prune skips the version the orphaned child still uses", `protected=${ver7}`);
    registry.setLatest("1.0.0");
    try { process.kill(childPid, "SIGKILL"); } catch {}
    removeTempRoot(r7);
  }

  console.log("\n[8] 只有 CHECK_INTERVAL 允许取 0");
  const r8 = mkRoot();
  const c8 = await run(["--sleep", "300"], r8, { NGE_FIRST_RUN_TIMEOUT: "0" });
  check(c8.code === 0 && /TARGET_OK/.test(c8.out),
    "FIRST_RUN_TIMEOUT=0 falls back to the default instead of skipping install",
    `code=${c8.code} out=${JSON.stringify(c8.out.slice(0, 80))}`);
  removeTempRoot(r8);

  console.log("\n[9] 首装失败：start:failed 能发出、原因真实、且不算回退");
  const r9 = mkRoot();
  received.length = 0;
  registry.setOffline(true);
  const c9 = await run([], r9, {
    NGE_FIRST_RUN_TIMEOUT: "3000",
    npm_config_fetch_retries: "0",
    npm_config_fetch_timeout: "2000",
  });
  registry.setOffline(false);
  await wait(800);
  const maps = received.map((p) => p.events?.[0]?.mapValue).filter(Boolean);
  const startFailed = maps.filter((m) => m.phase === "start" && m.result === "failed");
  const fallbacks = maps.filter((m) => m.phase === "fallback");
  check(c9.code === 1, "failure exits 1", `code=${c9.code}`);
  check(/Failed to install/.test(c9.err), "stderr carries the failure line");
  check(startFailed.length >= 1, "start:failed reaches the network sink", `requests=${received.length}`);
  check(startFailed[0]?.coldStart === "true", "start:failed is marked coldStart");
  check(startFailed[0]?.reason && startFailed[0].reason !== "timeout",
    "reason is the real npm failure, not a hard-coded timeout", `reason=${startFailed[0]?.reason}`);
  check(fallbacks.length === 0, "no fallback event when there is no old version",
    `fallbacks=${fallbacks.length}`);
  const bgEvents = maps.filter((m) => m.phase === "update" || m.phase === "install");
  check(bgEvents.length > 0 && bgEvents.every((m) => m.coldStart === "true"),
    "coldStart is carried by background install/update events",
    bgEvents.map((m) => `${m.phase}:${m.coldStart}`).join(","));
  removeTempRoot(r9);

  console.log("\n[10] 磁盘文件只读第一行，追加行不破坏识别");
  const r10 = mkRoot();
  const cold10 = await run(["--sleep", "50"], r10);
  check(cold10.code === 0, "install once");
  const base10 = path.join(r10, SLUG);
  fs.writeFileSync(path.join(base10, "current"), "1.0.0\nextra: metadata\n");
  fs.writeFileSync(path.join(base10, "last-check"), `${Date.now()}\nextra: metadata\n`);
  const warm10 = await run(["--sleep", "50"], r10);
  check(warm10.code === 0 && /TARGET_OK 1\.0\.0/.test(warm10.out),
    "current with extra lines still starts the right version", JSON.stringify(warm10.out));
  removeTempRoot(r10);

  console.log("\n[11] prune 只删版本目录，残留的 .current.* 会被回收");
  const r11 = mkRoot();
  await run(["--sleep", "50"], r11);
  const base11 = path.join(r11, SLUG);
  fs.mkdirSync(path.join(base11, "versions", "meta"), { recursive: true });
  fs.mkdirSync(path.join(base11, "versions", "not-a-version"), { recursive: true });
  const stale11 = path.join(base11, ".current.99999");
  fs.writeFileSync(stale11, "1.0.0");
  const old11 = new Date(Date.now() - 2 * 60 * 60 * 1000);
  fs.utimesSync(stale11, old11, old11);
  registry.setLatest("2.0.0");
  await runUpdate(r11);
  registry.setLatest("1.0.0");
  check(fs.existsSync(path.join(base11, "versions", "meta")), "non-version directory is left alone");
  check(fs.existsSync(path.join(base11, "versions", "not-a-version")), "non-semver directory is left alone");
  check(!fs.existsSync(stale11), "stale .current.* temp file is reclaimed");
  removeTempRoot(r11);

  console.log("\n[12] 前台被杀后后台仍装完，重连直接启动");
  if (process.platform === "win32") {
    check(true, "SKIP on Windows (SIGKILL semantics differ)");
  } else {
    const r12 = mkRoot();
    const foreground = spawn(process.execPath, [INDEX, SPEC], {
      env: env(r12, { NGE_FIRST_RUN_TIMEOUT: "60000", NGE_TELEMETRY_TIMEOUT: "1" }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const closed12 = new Promise((res) => foreground.on("close", res));
    foreground.stdout.on("data", () => {});
    foreground.stderr.on("data", () => {});
    await wait(700);
    try { foreground.kill("SIGKILL"); } catch {}
    await closed12;
    const done12 = await waitFor(() => current(r12) !== null, 20000);
    check(done12, "detached install finishes after the foreground is killed", `current=${current(r12)}`);
    const again12 = await run(["--sleep", "100"], r12);
    check(again12.code === 0 && /TARGET_OK/.test(again12.out),
      "reconnect starts immediately without downloading again", JSON.stringify(again12.out));
    removeTempRoot(r12);
  }

  console.log("\n[13] 首装等待超时只看本次会话的事件，旧会话的失败原因不串过来");
  const r13 = mkRoot();
  const base13 = path.join(r13, SLUG);
  fs.mkdirSync(path.join(base13, "lock"), { recursive: true });
  // A live pid holds the lock: the download is "still in progress" elsewhere.
  fs.writeFileSync(path.join(base13, "lock", "pid"), String(process.pid));
  fs.writeFileSync(path.join(base13, "events.jsonl"), JSON.stringify({
    ts: new Date(Date.now() - 24 * 3600e3).toISOString(),
    phase: "install", result: "failed", reason: "enospc",
  }) + "\n");
  const c13 = await run([], r13, { NGE_FIRST_RUN_TIMEOUT: "3000" });
  const last13 = events(r13).filter((e) => e.phase === "start").pop();
  check(c13.code === 1 && last13?.result === "failed", "wait expiry exits 1 with start:failed",
    `code=${c13.code}`);
  check(last13?.reason === "timeout", "reason is timeout, not yesterday's enospc",
    `reason=${last13?.reason}`);
  removeTempRoot(r13);

  console.log("\n[14] Windows：客户端用 Job 对象杀掉整棵进程树时，首装仍在 Job 外继续");
  if (process.platform !== "win32") {
    check(true, "SKIP outside Windows (Job objects are Windows-only)");
  } else {
    registry.setTarballDelay(4000);
    const control = await killedByJob({ NGE_WIN_BREAKAWAY: "0" });
    check(control.lockSeen, "control: installer started before the job was closed", control.out);
    check(control.current === null,
      "control: a plain detached installer dies with the job (harness reproduces the bug)",
      `current=${control.current}`);
    const fixed = await killedByJob({});
    check(fixed.lockSeen, "installer started before the job was closed", fixed.out);
    check(fixed.current !== null, "installer outside the job finishes after the job is closed",
      `current=${fixed.current}`);
    check(fixed.leftovers.length === 0, "no env file left behind", fixed.leftovers.join(","));
    registry.setTarballDelay(0);
  }

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
