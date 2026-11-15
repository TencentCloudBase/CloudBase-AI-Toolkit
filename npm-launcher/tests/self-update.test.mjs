#!/usr/bin/env node
"use strict";

// Self-update: a pinned launcher installs a newer copy of itself from the
// `stable` dist-tag and hands launches over to it, with every guard rail
// (same major, minimum age, self-test, quarantine, remote rollback, opt-out).

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startMockRegistry } from "./mock-registry.mjs";
import { removeTempRoot } from "./cleanup.mjs";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const SRC = fs.readFileSync(INDEX, "utf8");
const SELF = JSON.parse(fs.readFileSync(path.join(PKG, "package.json"), "utf8")).version;
const [MAJ, MIN] = SELF.split(".").map(Number);
const SPEC = "@cloudbase/nge-testpkg@latest";
const LSLUG = "_cloudbase_npm-launcher_stable";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nge-selfupd-"));
const DAY = 24 * 3600e3;

const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}
let n = 0;
const mkRoot = () => { const d = path.join(TMP, `r${++n}`); fs.mkdirSync(d); return d; };
const lcur = (root) => { try { return fs.readFileSync(path.join(root, LSLUG, "current"), "utf8").trim(); } catch { return null; } };
const lquar = (root) => { try { return fs.readFileSync(path.join(root, LSLUG, "quarantine"), "utf8"); } catch { return ""; } };
const levents = (root) => {
  try { return fs.readFileSync(path.join(root, LSLUG, "events.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
};

// A newer launcher is this very file with another version and a marker on
// stderr, so delegation is observable.
const newer = (v, marker = `DELEGATED ${v}`) =>
  SRC.replace(/const LAUNCHER_VERSION = \(\(\) => \{[\s\S]*?\}\)\(\);/, `const LAUNCHER_VERSION = ${JSON.stringify(v)};`)
    .replace(/function main\(\) \{/, `function main() {\n  if (process.argv[2] !== "--nge-selftest") process.stderr.write(${JSON.stringify(marker + "\n")});`);
const V_OK = `${MAJ}.${MIN + 1}.0`;
const V_YOUNG = `${MAJ}.${MIN + 2}.0`;
const V_MAJOR = `${MAJ + 1}.0.0`;
const V_NOTEST = `${MAJ}.${MIN + 3}.0`;
const V_THROWS = `${MAJ}.${MIN + 4}.0`;

const reg = await startMockRegistry();
reg.publishLauncher(V_OK, newer(V_OK), 4 * DAY);
reg.publishLauncher(V_YOUNG, newer(V_YOUNG), 1 * DAY);
reg.publishLauncher(V_MAJOR, newer(V_MAJOR), 9 * DAY);
reg.publishLauncher(V_NOTEST, "process.exit(0);\n", 9 * DAY); // never prints nge-selftest-ok
// Passes the self-test but throws when a real launch is delegated to it.
reg.publishLauncher(V_THROWS, newer(V_THROWS).replace(/(function main\(\) \{\n[^\n]*\n)/,
  `$1  if (process.argv[2] !== "--nge-selftest") throw new Error("broken main");\n`), 9 * DAY);

function env(root, extra = {}) {
  return {
    ...process.env, NGE_ROOT: root, NGE_REGISTRY: reg.url, NGE_TELEMETRY: "0",
    NGE_CHECK_INTERVAL: "3600000", NGE_SELF_UPDATE: "1",
    npm_config_cache: path.join(root, ".npmcache"), ...extra,
  };
}
function launch(root, args, extra) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [INDEX, ...args], { env: env(root, extra), stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => resolve({ code, out, err }));
  });
}
const selfUpdate = (root, extra) => launch(root, ["--nge-update", "@cloudbase/npm-launcher@stable"], extra);

try {
  console.log("[1] --nge-selftest contract");
  {
    const r = await launch(mkRoot(), ["--nge-selftest"]);
    check(r.code === 0 && r.err.includes(`nge-selftest-ok ${SELF}`) && r.out === "", "prints nge-selftest-ok on stderr only");
  }

  console.log("\n[2] a stable release older than 72 h installs and takes over launches");
  const root = mkRoot();
  {
    reg.setLauncherStable(V_OK);
    await launch(root, [SPEC, "--sleep", "10"]); // cold install of the target
    await selfUpdate(root);
    check(lcur(root) === V_OK, "the newer launcher is installed", `current=${lcur(root)}`);
    const r = await launch(root, [SPEC, "--sleep", "10"]);
    check(r.err.includes(`DELEGATED ${V_OK}`), "the launch is handed to it");
    check(r.code === 0 && /TARGET_OK/.test(r.out), "the target still starts", `code=${r.code}`);
    const off = await launch(root, [SPEC, "--sleep", "10"], { NGE_SELF_UPDATE: "0" });
    check(!off.err.includes("DELEGATED") && /TARGET_OK/.test(off.out), "NGE_SELF_UPDATE=0 runs the pinned copy");
  }

  console.log("\n[3] guard rails hold back unsafe releases");
  for (const [v, label] of [[V_YOUNG, "published under 72 h ago"], [V_MAJOR, "another major version"]]) {
    reg.setLauncherStable(v);
    await selfUpdate(root);
    const held = levents(root).filter((e) => e.reason === "self-hold" && e.targetVersion === v);
    check(lcur(root) === V_OK && held.length > 0, `${label}: held, previous copy kept`, `current=${lcur(root)}`);
  }

  console.log("\n[4] a release that fails its self-test is quarantined, not switched to");
  {
    reg.setLauncherStable(V_NOTEST);
    await selfUpdate(root);
    check(lcur(root) === V_OK, "current is unchanged", `current=${lcur(root)}`);
    check(lquar(root).includes(V_NOTEST), "the release is quarantined");
  }

  console.log("\n[5] a delegate that throws falls back to the pinned copy");
  {
    reg.setLauncherStable(V_THROWS);
    await selfUpdate(root);
    check(lcur(root) === V_THROWS, "it passed the self-test and was installed", `current=${lcur(root)}`);
    const r = await launch(root, [SPEC, "--sleep", "10"]);
    check(r.code === 0 && /TARGET_OK/.test(r.out), "the target still starts", r.err.slice(0, 200));
    check(lquar(root).includes(V_THROWS), "the throwing release is quarantined");
    const again = await launch(root, [SPEC, "--sleep", "10"]);
    check(/TARGET_OK/.test(again.out) && !again.err.includes("broken main"), "later launches skip it");
  }

  console.log("\n[6] moving stable back to the pinned version stops delegation");
  {
    const r2 = mkRoot();
    reg.setLauncherStable(V_OK);
    await launch(r2, [SPEC, "--sleep", "10"]);
    await selfUpdate(r2);
    check(lcur(r2) === V_OK, "delegating to the newer copy first");
    reg.publishLauncher(SELF, SRC, 30 * DAY);
    reg.setLauncherStable(SELF);
    await selfUpdate(r2);
    check(lcur(r2) === null, "current is cleared", `current=${lcur(r2)}`);
    const r = await launch(r2, [SPEC, "--sleep", "10"]);
    check(!r.err.includes("DELEGATED") && /TARGET_OK/.test(r.out), "launches run the pinned copy again");
  }

  console.log("\n[7] a warm start schedules the self-update check in the background");
  {
    const r3 = mkRoot();
    reg.setLauncherStable(V_OK);
    await launch(r3, [SPEC, "--sleep", "10"]);
    // Cold start never fetches the launcher; the warm start does (interval 0).
    check(!fs.existsSync(path.join(r3, LSLUG, "last-check")), "a cold start does not check for a launcher update");
    await launch(r3, [SPEC, "--sleep", "1500"], { NGE_CHECK_INTERVAL: "0" });
    let ok = false;
    for (let i = 0; i < 40 && !ok; i++) { ok = lcur(r3) === V_OK; if (!ok) await new Promise((r) => setTimeout(r, 300)); }
    check(ok, "the background check installs the newer copy", `current=${lcur(r3)}`);
  }
} finally {
  reg.close();
  removeTempRoot(TMP);
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
