#!/usr/bin/env node
"use strict";

import { removeTempRoot } from "./cleanup.mjs";

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockRegistry } from "./mock-registry.mjs";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nge-behaviour-"));
const SPEC = "@cloudbase/nge-testpkg@latest";

let registry;
const results = [];
function check(ok, label, detail = "") {
  results.push({ ok, label });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

function base() {
  const dir = fs.existsSync(ROOT)
    ? fs.readdirSync(ROOT).find((d) => d.includes("nge-testpkg"))
    : null;
  return dir ? path.join(ROOT, dir) : path.join(ROOT, "__missing__");
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
    NGE_REGISTRY: registry.url,
    NGE_CHECK_INTERVAL: "3600000",
    NGE_TELEMETRY: "0", // tests must never send real telemetry to beacon
    ...extra,
  };
}

function launch(args = [], extra = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [INDEX, SPEC, ...args], {
      env: env(extra), stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await wait(300);
  }
  return false;
}

async function main() {
  registry = await startMockRegistry();
  console.log(`isolated root: ${ROOT}\nmock registry: ${registry.url}`);

  console.log("\n[1] stdout purity and argument forwarding");
  const r1 = await launch(["alpha", "beta"]);
  check(r1.code === 0, "first run exits 0", r1.err.slice(0, 200));
  check(/^TARGET_OK 1\.0\.0 alpha beta\s*$/.test(r1.out),
    "stdout contains only the target output, args forwarded", JSON.stringify(r1.out));
  check(!/npm (notice|warn)|added \d+ package|ENOENT/i.test(r1.out),
    "no npm noise on the JSON-RPC channel");
  check(current() === "1.0.0", "current is 1.0.0");

  console.log("\n[2] same spec, tag moves to a new version");
  registry.setLatest("2.0.0");
  const r2 = await launch([], { NGE_CHECK_INTERVAL: "0" });
  check(/TARGET_OK 1\.0\.0/.test(r2.out),
    "running instance still uses the old version", JSON.stringify(r2.out));
  const upgraded = await waitFor(() => current() === "2.0.0");
  check(upgraded, "background update switches current to 2.0.0", `current=${current()}`);
  check(fs.existsSync(path.join(base(), "versions", "1.0.0")),
    "old version directory is kept");
  const r3 = await launch([]);
  check(/TARGET_OK 2\.0\.0/.test(r3.out), "next start uses the new version", JSON.stringify(r3.out));

  console.log("\n[3] failed install falls back to the working version");
  registry.setLatest("3.0.0");
  registry.failTarball("3.0.0");
  await launch([], { NGE_CHECK_INTERVAL: "0" });
  await wait(4000);
  check(current() === "2.0.0", "current stays on 2.0.0 after a broken tarball", `current=${current()}`);
  const r4 = await launch([]);
  check(/TARGET_OK 2\.0\.0/.test(r4.out), "still starts after a failed update");

  console.log("\n[4] registry unreachable falls back to the working version");
  registry.setOffline(true);
  await launch([], { NGE_CHECK_INTERVAL: "0" });
  await wait(3000);
  const r5 = await launch([]);
  check(/TARGET_OK 2\.0\.0/.test(r5.out), "starts offline from the local version", JSON.stringify(r5.out));
  check(current() === "2.0.0", "current is not corrupted while offline");
  registry.setOffline(false);

  console.log("\n[5] signal forwarding to the target process");
  if (process.platform === "win32") {
    console.log("SKIP  Windows does not deliver POSIX signals to child processes");
  } else {
    const held = spawn(process.execPath, [INDEX, SPEC, "--hold"], {
      env: env(), stdio: ["ignore", "pipe", "pipe"],
    });
    let heldOut = "";
    held.stdout.on("data", (d) => { heldOut += d; });
    await wait(1200);
    held.kill("SIGTERM");
    await wait(1500);
    check(/GOT_SIGTERM/.test(heldOut), "SIGTERM reaches the target process", JSON.stringify(heldOut));
  }

  console.log("\n[6] stale lock does not block a later update");
  const lockPath = path.join(base(), "lock");
  fs.mkdirSync(lockPath, { recursive: true });
  const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
  fs.utimesSync(lockPath, old, old);
  registry.setLatest("4.0.0");
  const r6 = await launch([], { NGE_CHECK_INTERVAL: "0" });
  const recovered = await waitFor(() => current() === "4.0.0");
  check(recovered, "stale lock is cleared and update proceeds", `current=${current()}`);
  const r7 = await launch([]);
  check(/TARGET_OK 4\.0\.0/.test(r7.out), "next start uses 4.0.0", JSON.stringify(r7.out));

  console.log("\n[7] 20 concurrent starts while a new version is published");
  registry.setLatest("1.0.0");
  fs.writeFileSync(path.join(base(), "current"), "1.0.0");
  fs.writeFileSync(path.join(base(), "last-check"), "0");
  const racing = Array.from({ length: 20 }, () => launch([], { NGE_CHECK_INTERVAL: "0" }));
  setTimeout(() => registry.setLatest("2.0.0"), 400);
  const runs = await Promise.all(racing);
  check(runs.every((r) => r.code === 0), "all 20 racing starts exit 0",
    `${runs.filter((r) => r.code !== 0).length} failed`);
  check(!runs.some((r) => /ENOTEMPTY|EJSONPARSE|EEXIST/.test(r.out + r.err)),
    "no directory conflicts while publishing mid-flight");
  await wait(5000);
  const final = current();
  check(final === "1.0.0" || final === "2.0.0", "current stays valid after the race", `current=${final}`);
  const dirs = fs.readdirSync(path.join(base(), "versions"));
  const inFlight = dirs.filter((d) => d.startsWith(".tmp-"));
  const stale = inFlight.filter((d) => {
    try {
      return Date.now() - fs.statSync(path.join(base(), "versions", d)).mtimeMs > 60000;
    } catch { return false; }
  });
  check(stale.length === 0, "no stale temp directories after the race",
    `in-flight=${inFlight.length} stale=${stale.length} [${inFlight.join(", ")}]`);

  const logFile = path.join(base(), "install.log");
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
  check(!/EJSONPARSE|ENOTEMPTY/.test(log), "install.log has no conflict errors");

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  registry.close();
  removeTempRoot(ROOT);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  if (registry) registry.close();
  removeTempRoot(ROOT);
  process.exit(1);
});
