#!/usr/bin/env node
"use strict";

import { removeTempRoot } from "./cleanup.mjs";

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { startMockRegistry } from "./mock-registry.mjs";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nge-telemetry-"));
const NPM_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), "nge-telemetry-npmcache-"));
const SPEC = "@cloudbase/nge-testpkg@latest";

// Must match the beacon-side registration, key for key.
const KEYS = [
  "phase", "result", "launcherVersion", "spec", "targetVersion", "fromVersion",
  "osPlatform", "nodeMajor", "client", "coldStart", "reason", "elapsedMs",
].sort();

let registry, sink, blackhole;
const received = [];
const results = [];

function check(ok, label, detail = "") {
  results.push({ ok, label });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function base() {
  const dir = fs.readdirSync(ROOT).find((d) => d.includes("nge-testpkg"));
  return dir ? path.join(ROOT, dir) : path.join(ROOT, "__missing__");
}
function eventsFile() { return path.join(base(), "events.jsonl"); }
function localEvents() {
  if (!fs.existsSync(eventsFile())) return [];
  return fs.readFileSync(eventsFile(), "utf8").trim().split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return {}; } });
}
function current() {
  const p = path.join(base(), "current");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : null;
}

function env(extra = {}) {
  return {
    ...process.env,
    PATH: process.platform === "win32"
      ? (process.env.PATH || "")
      : `/usr/local/bin:${process.env.PATH || ""}`,
    NGE_ROOT: ROOT,
    npm_config_cache: NPM_CACHE,
    NGE_REGISTRY: registry.url,
    NGE_CHECK_INTERVAL: "3600000",
    NGE_TELEMETRY: "1", // explicitly on; CI sets 0 at the job level
    NGE_TELEMETRY_ENDPOINT: sink.url,
    NGE_TELEMETRY_TIMEOUT: "300",
    ...extra,
  };
}

function runOnce(args = [], extra = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [INDEX, SPEC, ...args], {
      env: env(extra), stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, out, err, ms: Date.now() - t0 }));
  });
}

// Call the detached updater's entry point directly: deterministic, and avoids
// relying on last-check timing / a background process still holding the lock.
function runUpdate(extra = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [INDEX, "--nge-update", SPEC], {
      env: env(extra), stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

function runDiag() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [INDEX, "--nge-diag", SPEC], {
      env: env(), stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", (code) => resolve({ code, out }));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(predicate, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(200);
  }
  return false;
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

async function startBlackhole() {
  const sockets = [];
  const server = http.createServer(() => { /* accept, never respond */ });
  server.on("connection", (s) => sockets.push(s));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/analytics/v2_upload`,
    close: () => {
      for (const s of sockets) { try { s.destroy(); } catch {} }
      server.close();
    },
  };
}

async function main() {
  registry = await startMockRegistry();
  sink = await startSink();
  console.log(`isolated root: ${ROOT}\nmock registry: ${registry.url}\ntelemetry sink: ${sink.url}`);

  console.log("\n[1] cold start reports start + install");
  // --sleep keeps the launcher alive so the fire-and-forget request can flush,
  // but exits by itself (no kill needed on Windows).
  const r1 = await runOnce(["--sleep", "2500"], { CLOUDBASE_MCP_CLIENT: "codebuddy" });
  check(r1.code === 0, "cold start exits 0", r1.err.slice(0, 200));
  check(/TARGET_OK 1\.0\.0/.test(r1.out), "target still runs normally", JSON.stringify(r1.out));
  check(!/npm (notice|warn)|added \d+ package/i.test(r1.out), "telemetry adds no stdout noise");
  const got = await waitFor(() => received.length >= 2, 8000);
  check(got, "cold-start events reach the sink", `received=${received.length}`);
  const phases = received.map((p) => p.events?.[0]?.mapValue?.phase);
  check(phases.includes("start") && phases.includes("install"),
    "start and install phases reported", phases.join(","));

  console.log("\n[2] payload matches the registered contract");
  check(received.every((p) => p.events?.length === 1 && p.events[0].eventCode === "toolkit_launcher"),
    "one toolkit_launcher event per call");
  check(received.every((p) => p.mainAppKey === "0WEB0AD0GM4PUUU1" && p.sdkId === "js" && p.platformId === 3),
    "v2_upload envelope matches the MCP reporter");
  check(received.every((p) => p.common.from === "cloudbase-npm-launcher"
    && /^[0-9a-f]{32}$/.test(p.common.A2)),
    "A2 is a 32-hex device id computed with the MCP reporter algorithm");
  check(new Set(received.map((p) => p.common.A2)).size === 1,
    "every event from one machine carries the same device id");
  check(received.every((p) => JSON.stringify(Object.keys(p.events[0].mapValue).sort()) === JSON.stringify(KEYS)),
    "mapValue has exactly the 12 registered keys");
  const mv = received.find((p) => p.events[0].mapValue.phase === "start")?.events[0].mapValue;
  const pkgVersion = JSON.parse(fs.readFileSync(path.join(PKG, "package.json"), "utf8")).version;
  check(!!mv && mv.spec === SPEC && mv.launcherVersion === pkgVersion
    && mv.osPlatform === process.platform
    && mv.nodeMajor === String(process.versions.node.split(".")[0]),
    "identity fields are populated", JSON.stringify(mv));
  check(mv?.client === "codebuddy", "client comes from CLOUDBASE_MCP_CLIENT");
  const dump = JSON.stringify(received);
  check(!dump.includes(ROOT) && !/--sleep|GOT_SIGTERM|alpha|beta/.test(dump),
    "no local path or target arguments in the payload");
  check(!/"(uin|login_uin|install_id|device_id|deviceId)"/.test(dump),
    "no extra account/device keys beyond common.A2");

  console.log("\n[3] local events and --nge-diag");
  const le = localEvents();
  check(le.length >= 2 && le.some((e) => e.phase === "start") && le.some((e) => e.phase === "install"),
    "events.jsonl keeps a local copy", `rows=${le.length}`);
  const diag = await runDiag();
  check(diag.code === 0 && /telemetry=on/.test(diag.out) && /events=/.test(diag.out)
    && /"phase":"start"/.test(diag.out), "diag exports recent events");

  console.log("\n[4] NGE_TELEMETRY=0 stops the network call only");
  received.length = 0;
  const before = localEvents().length;
  const r4 = await runOnce([], { NGE_TELEMETRY: "0" });
  await wait(500);
  check(r4.code === 0 && /TARGET_OK/.test(r4.out), "still starts with telemetry off");
  check(received.length === 0, "no network request when disabled", `received=${received.length}`);
  check(localEvents().length > before, "local events are still written");

  console.log("\n[5] update and fallback phases");
  // First install also emits an `update` event, so wait on the count, not on existence.
  // Reset last-check to force a detached updater on each start (0 interval can
  // otherwise compare equal to a stamp written in the same millisecond).
  const updateCount = () => localEvents().filter((e) => e.phase === "update").length;
  registry.setLatest("2.0.0");
  const updatesBefore = updateCount();
  fs.writeFileSync(path.join(base(), "last-check"), "0");
  const r5 = await runOnce([], { NGE_CHECK_INTERVAL: "0" });
  check(r5.code === 0, "start with a pending update exits 0");
  const updated = await waitFor(() => updateCount() > updatesBefore, 20000);
  check(updated, "background update produces a new update event", `count=${updateCount()}`);
  const switched = await waitFor(() => current() === "2.0.0", 20000);
  check(switched, "background update switches current to 2.0.0", `current=${current()}`);

  registry.setLatest("3.0.0");
  registry.failTarball("3.0.0");
  const unlocked = await waitFor(() => !fs.existsSync(path.join(base(), "lock")), 10000);
  check(unlocked, "previous updater released its lock");
  const r6 = await runUpdate({ NGE_CHECK_INTERVAL: "0" });
  check(r6.code === 0, "updater exits cleanly on a broken tarball", r6.err.slice(0, 200));
  const fellBack = localEvents().some((e) => e.phase === "fallback");
  check(fellBack, "failed update produces a fallback event",
    localEvents().map((e) => `${e.phase}:${e.result}:${e.reason}`).join(" | "));
  check(current() !== "3.0.0", "current stays on a working version", `current=${current()}`);
  const allPhases = new Set(localEvents().map((e) => e.phase));
  check(["start", "install", "update", "fallback"].every((p) => allPhases.has(p)),
    "all four phases appear in the local log", [...allPhases].join(","));

  console.log("\n[6] a hung telemetry endpoint never delays startup");
  blackhole = await startBlackhole();
  const r7 = await runOnce(["--sleep", "1200"], {
    NGE_TELEMETRY_ENDPOINT: blackhole.url, NGE_TELEMETRY_TIMEOUT: "200",
  });
  check(r7.code === 0 && /TARGET_OK/.test(r7.out), "starts even when reporting times out");
  check(r7.ms < 4000, "startup is not blocked by the network", `${r7.ms}ms`);

  console.log("\n[7] client value is sanitised");
  await wait(1500); // let any detached updater finish
  received.length = 0;
  await runOnce(["--sleep", "1800"], { CLOUDBASE_MCP_CLIENT: "../../etc/passwd" });
  await waitFor(() => received.length > 0, 8000);
  check(received.length > 0 && received.every((p) => p.events[0].mapValue.client === "unknown"),
    "hostile client value falls back to unknown", `received=${received.length}`);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (blackhole) blackhole.close();
  sink.close();
  registry.close();
  removeTempRoot(ROOT);
  removeTempRoot(NPM_CACHE);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  if (blackhole) blackhole.close();
  if (sink) sink.close();
  if (registry) registry.close();
  removeTempRoot(ROOT);
  removeTempRoot(NPM_CACHE);
  process.exit(1);
});
