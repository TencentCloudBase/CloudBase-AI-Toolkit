#!/usr/bin/env node
"use strict";

// Cold-start failure timing.
//
// Until 1.2.0 the foreground always waited out FIRST_RUN_TIMEOUT. A cold start
// whose installs had already failed in under a second still held the client for
// the full two minutes, and the event it finally emitted carried elapsedMs near
// the budget -- so a fast, specific failure was reported as a slow, vague one.
// Measured in the field: start/failed rows at 120,419 ms sitting behind
// update/skipped rows that had failed in 1-2 s.
//
// These checks pin the fixed behaviour: give up once every retry is spent and
// nothing is installing, report the reason the installer actually recorded, and
// still wait when an install is genuinely in flight.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { removeTempRoot } from "./cleanup.mjs";

const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const SPEC = "@cloudbase/nge-testpkg@latest";
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nge-fastfail-"));
const FAKE = path.join(ROOT, "fake-npm");
const CLI = path.join(FAKE, "bin/npm-cli.js");

const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// A complete-looking npm layout, so npmCli() selects it instead of falling
// through to the real npm on PATH.
fs.mkdirSync(path.dirname(CLI), { recursive: true });
fs.mkdirSync(path.join(FAKE, "lib/commands"), { recursive: true });
fs.writeFileSync(path.join(FAKE, "lib/commands/install.js"), "// marker\n");

// The whole point is to time the foreground, so run the real entry point the
// way a client does: `index.js <spec>`, not `--nge-update`.
function runColdStart(id, npmBody, { timeout = 60e3, firstRunTimeout = 20e3 } = {}) {
  return new Promise((resolve) => {
    fs.writeFileSync(CLI, `#!/usr/bin/env node\n"use strict";\nconst a = process.argv.slice(2);\n${npmBody}\n`);
    const root = path.join(ROOT, id);
    fs.mkdirSync(root, { recursive: true });
    const env = {
      ...process.env,
      NGE_ROOT: root,
      // Port 1 is closed, so the direct installer fails immediately too:
      // this isolates the wait logic from any real network.
      NGE_REGISTRY: "http://127.0.0.1:1/",
      NGE_TELEMETRY: "0",
      NGE_FIRST_RUN_TIMEOUT: String(firstRunTimeout),
      NPM_CONFIG_CACHE: path.join(root, "npm-cache"),
      npm_execpath: CLI,
    };
    const t0 = Date.now();
    const child = spawn(process.execPath, [INDEX, SPEC, "--help"], {
      env, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, timeout);
    child.on("close", (code) => {
      clearTimeout(timer);
      const elapsed = Date.now() - t0;
      const bases = fs.readdirSync(root).filter((d) => !d.startsWith("."));
      const base = bases.length ? path.join(root, bases[0]) : null;
      const p = base ? path.join(base, "events.jsonl") : "";
      const events = p && fs.existsSync(p)
        ? fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return {}; } })
        : [];
      resolve({ code, elapsed, stdout, stderr, events });
    });
  });
}

const FAIL_FAST = 'process.stderr.write("npm ERR! code ENOSPC\\nnpm ERR! nospc\\n"); process.exit(1);';

console.log("[1] installs that fail immediately are reported immediately");
{
  const budget = 20e3;
  const r = await runColdStart("fast", FAIL_FAST, { firstRunTimeout: budget });
  const start = r.events.find((e) => e.phase === "start" && e.result === "failed");
  check(r.code === 1, "the launcher still exits non-zero", `code=${r.code}`);
  check(!!start, "start/failed is emitted", JSON.stringify(r.events.map((e) => `${e.phase}:${e.result}`)));
  // Three attempts, each gated by a 10 s retry spacing, is the floor here;
  // what matters is that it does not sit until the budget expires.
  check(r.elapsed < budget - 2000,
    "the foreground gives up before the wait budget expires",
    `elapsed=${r.elapsed}ms budget=${budget}ms`);
  check(Number(start?.elapsedMs) < budget - 2000,
    "the reported elapsedMs is the real failure time, not the budget",
    `elapsedMs=${start?.elapsedMs}`);
}

console.log("\n[2] the reported reason is the installer's, not a bare timeout");
{
  const r = await runColdStart("reason", FAIL_FAST, { firstRunTimeout: 20e3 });
  const start = r.events.find((e) => e.phase === "start" && e.result === "failed");
  const reason = String(start?.reason || "");
  check(reason !== "timeout" && reason !== "", "a real reason is reported", reason);
  check(/no-space|enospc|ENOSPC/i.test(reason),
    "the reason identifies the actual condition", reason);
}

console.log("\n[3] the user-facing message explains the failure");
{
  const r = await runColdStart("message", FAIL_FAST, { firstRunTimeout: 20e3 });
  check(/Failed to install/.test(r.stderr), "the failure is announced on stderr");
  check(/disk is full|space/i.test(r.stderr),
    "the message says what went wrong", r.stderr.split("\n")[1] || "");
  check(/--nge-diag/.test(r.stderr), "the message offers the diagnostics command");
  check(r.stdout === "", "stdout stays empty", JSON.stringify(r.stdout.slice(0, 40)));
}

console.log("\n[4] a slow but live install is still waited for");
{
  // npm stays silent past the retry window, so nothing has failed: the
  // foreground must keep waiting rather than treat quiet as failure.
  const SLOW = 'if (a[0] === "view") { setTimeout(() => { process.stdout.write(JSON.stringify("1.0.0")); process.exit(0); }, 14000); }\n'
    + 'else { setTimeout(() => process.exit(1), 14000); }';
  const budget = 12e3;
  const r = await runColdStart("slow", SLOW, { firstRunTimeout: budget, timeout: 60e3 });
  // No terminal failure was recorded in time, so the wait runs to the budget.
  check(r.elapsed >= budget - 1500,
    "the foreground waits while an install is in flight",
    `elapsed=${r.elapsed}ms budget=${budget}ms`);
}

removeTempRoot(ROOT);
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
