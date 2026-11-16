#!/usr/bin/env node
"use strict";

// 1.3.0 resilience: the cold start keeps a way out instead of giving up early,
// a second and third registry back up the default one, a release that crashes
// on start is rolled back, and a machine that keeps failing stops hammering
// the registry.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { startMockRegistry } from "./mock-registry.mjs";
import { removeTempRoot } from "./cleanup.mjs";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const SPEC = "@cloudbase/nge-testpkg@latest";
const SLUG = "_cloudbase_nge-testpkg_latest";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nge-resilience-"));

const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}
let n = 0;
const mkRoot = () => { const d = path.join(TMP, `r${++n}`); fs.mkdirSync(d); return d; };
const base = (root) => path.join(root, SLUG);
const readCur = (root) => { try { return fs.readFileSync(path.join(base(root), "current"), "utf8").trim(); } catch { return null; } };
function events(root) {
  try {
    return fs.readFileSync(path.join(base(root), "events.jsonl"), "utf8").trim().split("\n")
      .filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
}

// npm that fails at once, so only the direct installer can succeed.
const FAKE = path.join(TMP, "fake-npm");
fs.mkdirSync(path.join(FAKE, "bin"), { recursive: true });
fs.mkdirSync(path.join(FAKE, "lib/commands"), { recursive: true });
fs.writeFileSync(path.join(FAKE, "lib/commands/install.js"), "//\n");
fs.writeFileSync(path.join(FAKE, "bin/npm-cli.js"),
  '#!/usr/bin/env node\nprocess.stderr.write("npm ERR! code ECONNREFUSED\\n"); process.exit(1);\n');

function env(root, extra = {}) {
  const e = {
    ...process.env,
    NGE_ROOT: root,
    NGE_TELEMETRY: "0",
    NGE_CHECK_INTERVAL: "3600000",
    NGE_SELF_UPDATE: "0",
    npm_execpath: path.join(FAKE, "bin/npm-cli.js"),
    npm_config_cache: path.join(root, ".npmcache"),
    ...extra,
  };
  // CI sets NGE_REGISTRY job-wide; tests that exercise the chain must drop it.
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  return e;
}
function launch(root, args, extra, { timeout = 90e3 } = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [INDEX, ...args], { env: env(root, extra), stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, timeout);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out, err, ms: Date.now() - t0 }); });
  });
}

const a = await startMockRegistry();
const b = await startMockRegistry();

try {
  console.log("[1] the default registry fails: the next one in the chain installs");
  {
    const root = mkRoot();
    a.setMode("empty");
    b.resetHits();
    const r = await launch(root, [SPEC, "--sleep", "50"], {
      NGE_REGISTRY: undefined, NGE_REGISTRIES: `${a.url},${b.url}`, NGE_FIRST_RUN_TIMEOUT: "60000",
    });
    a.setMode("ok");
    const ok = events(root).find((e) => e.phase === "install" && e.result === "ok");
    check(r.code === 0 && /TARGET_OK 1\.0\.0/.test(r.out), "the cold start succeeds", `code=${r.code} ${r.err.slice(0, 120)}`);
    check(ok?.reason === "direct-m2", "install/ok records the second registry", `reason=${ok?.reason}`);
    check(b.hits() > 0, "the second registry was asked");
  }

  console.log("\n[2] an explicit NGE_REGISTRY is the only source");
  {
    const root = mkRoot();
    a.setMode("500");
    b.resetHits();
    const r = await launch(root, [SPEC], {
      NGE_REGISTRY: a.url, NGE_REGISTRIES: `${a.url},${b.url}`, NGE_FIRST_RUN_TIMEOUT: "6000",
    });
    a.setMode("ok");
    check(r.code === 1, "the cold start fails", `code=${r.code}`);
    check(b.hits() === 0, "no other registry is contacted", `hits=${b.hits()}`);
  }

  console.log("\n[3] a registry that recovers a few seconds in is still waited for");
  {
    // 1.2.0 spent its three attempts within ~2 s here and told the client
    // "failed" while the registry came back moments later.
    const root = mkRoot();
    a.setMode("500");
    setTimeout(() => a.setMode("ok"), 4000);
    const r = await launch(root, [SPEC, "--sleep", "50"], { NGE_REGISTRY: a.url, NGE_FIRST_RUN_TIMEOUT: "60000" });
    a.setMode("ok");
    const ev = events(root);
    const failedBefore = ev.filter((e) => e.phase === "update" && e.result !== "ok").length;
    check(r.code === 0 && /TARGET_OK/.test(r.out), "the same connection starts the target", `code=${r.code} ${r.err.slice(0, 160)}`);
    check(failedBefore >= 2, "earlier attempts did fail", `failed attempts=${failedBefore}`);
    check(ev.some((e) => e.phase === "start" && e.result === "ok" && e.coldStart === "true"), "start/ok is a cold start");
    check(!ev.some((e) => e.phase === "start" && e.result === "failed"), "no start/failed in between");
  }

  console.log("\n[4] a cold start still waiting after NGE_SLOW_MS reports start/slow once");
  {
    const root = mkRoot();
    a.setTarballDelay(2000); // under the direct installer's 2.5 s connect timeout
    const r = await launch(root, [SPEC, "--sleep", "50"], { NGE_REGISTRY: a.url, NGE_SLOW_MS: "1000", NGE_FIRST_RUN_TIMEOUT: "60000" });
    a.setTarballDelay(0);
    const slow = events(root).filter((e) => e.phase === "start" && e.result === "slow");
    check(r.code === 0, "the start completes", `code=${r.code}`);
    check(slow.length === 1, "exactly one start/slow", `count=${slow.length}`);
    check(Number(slow[0]?.elapsedMs) >= 1000, "start/slow carries the wait so far", `elapsedMs=${slow[0]?.elapsedMs}`);
  }

  console.log("\n[5] a release that crashes on start is rolled back");
  {
    const root = mkRoot();
    a.setLatest("1.0.0");
    const extra = { NGE_REGISTRY: a.url };
    const first = await launch(root, [SPEC, "--sleep", "50"], extra);
    check(first.code === 0 && readCur(root) === "1.0.0", "1.0.0 installed");
    a.setLatest("5.0.0");
    await launch(root, ["--nge-update", SPEC], extra);
    check(readCur(root) === "5.0.0", "the background update switched to 5.0.0", `current=${readCur(root)}`);
    const c1 = await launch(root, [SPEC], extra);
    check(c1.code === 1 && readCur(root) === "5.0.0", "one crash alone does not roll back", `current=${readCur(root)}`);
    const c2 = await launch(root, [SPEC], extra);
    check(c2.code === 1 && readCur(root) === "1.0.0", "a second crash rolls back to 1.0.0", `current=${readCur(root)}`);
    check(/Switched back to 1\.0\.0/.test(c2.err), "stderr says what happened", c2.err.split("\n").filter(Boolean).pop());
    const fb = events(root).find((e) => e.phase === "fallback" && e.reason === "crash-rollback");
    check(fb?.targetVersion === "1.0.0" && fb?.fromVersion === "5.0.0", "fallback/crash-rollback is recorded");
    const q = fs.readFileSync(path.join(base(root), "quarantine"), "utf8");
    check(/5\.0\.0/.test(q), "5.0.0 is quarantined");
    const c3 = await launch(root, [SPEC, "--sleep", "50"], extra);
    check(c3.code === 0 && /TARGET_OK 1\.0\.0/.test(c3.out), "the next connection starts 1.0.0");
    await launch(root, ["--nge-update", SPEC], extra);
    check(readCur(root) === "1.0.0", "the updater does not switch back to the quarantined version");
    check(events(root).some((e) => e.phase === "update" && e.reason === "quarantined"), "update/skipped:quarantined is recorded");
    a.setLatest("2.0.0");
    await launch(root, ["--nge-update", SPEC], extra);
    check(readCur(root) === "2.0.0", "a newer release is picked up normally", `current=${readCur(root)}`);
    a.setLatest("1.0.0");
  }

  console.log("\n[6] a clean exit right after start is not a crash");
  {
    const root = mkRoot();
    const extra = { NGE_REGISTRY: a.url };
    await launch(root, [SPEC, "--sleep", "10"], extra);
    a.setLatest("2.0.0");
    await launch(root, ["--nge-update", SPEC], extra);
    for (let i = 0; i < 3; i++) await launch(root, [SPEC], extra); // prints and exits 0 at once
    check(readCur(root) === "2.0.0", "current is untouched", `current=${readCur(root)}`);
    check(!fs.existsSync(path.join(base(root), "quarantine")), "nothing is quarantined");
    a.setLatest("1.0.0");
  }

  console.log("\n[7] a damaged current falls back to another installed version");
  {
    const root = mkRoot();
    const extra = { NGE_REGISTRY: a.url };
    await launch(root, [SPEC, "--sleep", "10"], extra);
    a.setLatest("2.0.0");
    await launch(root, ["--nge-update", SPEC], extra);
    fs.rmSync(path.join(base(root), "versions", "2.0.0", "node_modules", "@cloudbase", "nge-testpkg", "bin.js"));
    a.setOffline(true);
    const r = await launch(root, [SPEC, "--sleep", "10"], extra);
    a.setOffline(false);
    check(r.code === 0 && /TARGET_OK 1\.0\.0/.test(r.out), "starts 1.0.0 without a cold install", r.err.slice(0, 120));
    check(readCur(root) === "1.0.0", "current is repaired", `current=${readCur(root)}`);
    a.setLatest("1.0.0");
  }

  console.log("\n[8] repeated cold failures: one attempt per connection, then heal");
  {
    const root = mkRoot();
    const bad = { NGE_REGISTRY: "http://127.0.0.1:1/", NGE_FIRST_RUN_TIMEOUT: "8000" };
    for (let i = 0; i < 3; i++) await launch(root, [SPEC], bad);
    const cd = JSON.parse(fs.readFileSync(path.join(base(root), "cooldown"), "utf8"));
    check(cd.failures === 3 && cd.until > Date.now(), "cooldown starts after the third failed connection", JSON.stringify(cd));
    const before = events(root).length;
    const r = await launch(root, [SPEC], bad);
    const mine = events(root).slice(before);
    const attempts = mine.filter((e) => e.phase === "update").length;
    const start = mine.find((e) => e.phase === "start" && e.result === "failed");
    check(r.code === 1 && attempts === 1, "in cooldown a connection makes one attempt", `attempts=${attempts}`);
    check(/^cooldown\//.test(start?.reason || ""), "start/failed says cooldown", `reason=${start?.reason}`);
    const ok = await launch(root, [SPEC, "--sleep", "10"], { NGE_REGISTRY: a.url });
    check(ok.code === 0 && /TARGET_OK/.test(ok.out), "a working network still heals in cooldown");
    check(!fs.existsSync(path.join(base(root), "cooldown")), "success clears the cooldown");
  }
  console.log("\n[9] only a real non-zero exit counts as a crash");
  {
    const { crashExit } = createRequire(import.meta.url)(INDEX);
    check(crashExit(1, null, 100) === true, "a fast non-zero exit counts");
    check(crashExit(0, null, 100) === false, "a clean exit does not count");
    check(crashExit(null, "SIGKILL", 100) === false, "a signal exit does not count");
    check(crashExit(1, "SIGKILL", 100) === false, "a code alongside a signal does not count");
    check(crashExit(1, null, 6000) === false, "a late exit does not count", "CRASH_WINDOW=5000");
  }
} finally {
  a.close();
  b.close();
  removeTempRoot(TMP);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
