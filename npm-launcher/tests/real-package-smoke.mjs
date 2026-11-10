#!/usr/bin/env node
"use strict";

// Cold-start smoke against the real published package. Used by the nightly
// workflow and by the publish workflow's post-publish verification.
// It downloads ~20 MB, so keep it out of PRs.
//
// Default: run the local index.js with node.
// NGE_SMOKE_LAUNCHER_SPEC="@cloudbase/npm-launcher@1.0.0": install the just
// published launcher through npx and run that instead. This is the only mode
// that also covers the launcher's own npx cold start.
import { removeTempRoot } from "./cleanup.mjs";

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const SPEC = process.env.NGE_SMOKE_SPEC || "@cloudbase/cloudbase-mcp@latest";
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nge-smoke-"));
const NPM_CACHE = fs.mkdtempSync(path.join(os.tmpdir(), "nge-smoke-cache-"));
const MAX_MS = Number(process.env.NGE_SMOKE_MAX_MS || 240000);
const LAUNCHER_SPEC = process.env.NGE_SMOKE_LAUNCHER_SPEC || "";
const isWin = process.platform === "win32";

function cleanup() {
  removeTempRoot(ROOT);
  removeTempRoot(NPM_CACHE);
}
function fail(msg) {
  console.error(`FAIL ${msg}`);
  cleanup();
  process.exit(1);
}
function baseDir() {
  const d = fs.existsSync(ROOT) ? fs.readdirSync(ROOT).find((x) => !x.startsWith(".")) : null;
  return d ? path.join(ROOT, d) : null;
}

const env = {
  ...process.env,
  NGE_ROOT: ROOT,
  NGE_REGISTRY: process.env.NGE_REGISTRY || "https://registry.npmjs.org",
  NGE_CHECK_INTERVAL: "3600000",
  NGE_FIRST_RUN_TIMEOUT: String(MAX_MS),
  NGE_TELEMETRY: "0", // smoke tests are not real users; never report from CI or local runs
  npm_config_cache: NPM_CACHE,
  PATH: process.platform === "win32"
    ? (process.env.PATH || "")
    : `/usr/local/bin:${process.env.PATH || ""}`,
};

const start = Date.now();
const launcher = LAUNCHER_SPEC
  ? { file: isWin ? "npx.cmd" : "npx", args: ["-y", LAUNCHER_SPEC], shell: isWin }
  : { file: process.execPath, args: [INDEX], shell: false };
// npx resolves a same-named bin from the cwd package.json (this package's own
// bin is "npm-launcher"), which makes it fail with "command not found" instead
// of installing the published package. Run from the isolated temp root.
const child = spawn(launcher.file, [...launcher.args, SPEC, "--version"], {
  env, stdio: ["ignore", "pipe", "pipe"], shell: launcher.shell, cwd: ROOT,
});
let stderr = "";
child.stderr.on("data", (d) => { stderr += d; });
child.stdout.on("data", () => {});
child.on("error", (e) => fail(`spawn: ${e.message}`));

let done = false;
const poll = setInterval(() => {
  const b = baseDir();
  if (!b || !fs.existsSync(path.join(b, "current"))) return;
  clearInterval(poll);
  done = true;
  try { child.kill("SIGTERM"); } catch {}
  const ms = Date.now() - start;
  const logFile = path.join(b, "install.log");
  const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
  if (/ENOTEMPTY|EJSONPARSE/.test(log + stderr)) {
    fail(`npm conflict after ${ms}ms\n${(log + stderr).slice(-800)}`);
  }
  const current = fs.readFileSync(path.join(b, "current"), "utf8").trim();
  console.log(`OK cold start ${ms}ms version=${current} platform=${process.platform} launcher=${LAUNCHER_SPEC || "node index.js"} npm_cache=${NPM_CACHE}`);
  cleanup();
  process.exit(0);
}, 300);

setTimeout(() => {
  if (done) return;
  clearInterval(poll);
  try { child.kill("SIGKILL"); } catch {}
  const b = baseDir();
  const log = b && fs.existsSync(path.join(b, "install.log"))
    ? fs.readFileSync(path.join(b, "install.log"), "utf8").slice(-800) : "";
  fail(`no usable version within ${MAX_MS}ms\n${(log + stderr).slice(-800)}`);
}, MAX_MS);
