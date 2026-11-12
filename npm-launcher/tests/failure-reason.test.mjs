#!/usr/bin/env node
"use strict";

// Failure categories must survive all the way to events.jsonl. These checks
// use a fake npm-cli.js (with a completeness marker so npmCli() accepts it) to
// produce deterministic failures without a network or a real npm install.
//
// Regression baseline: a half-present npm used to produce
// (install,failed,other) with no way to tell it apart from a source outage;
// resolveVersion() failures were hard-coded to "registry" regardless of the
// real error.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const { classify } = require(INDEX);
const SPEC = "@cloudbase/nge-testpkg@latest";
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nge-reason-"));
const FAKE = path.join(ROOT, "fake-npm");
const CLI = path.join(FAKE, "bin/npm-cli.js");

const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// A complete-looking npm layout: npmCli() requires this marker next to the cli.
fs.mkdirSync(path.dirname(CLI), { recursive: true });
fs.mkdirSync(path.join(FAKE, "lib/commands"), { recursive: true });
fs.writeFileSync(path.join(FAKE, "lib/commands/install.js"), "// marker\n");

function writeFakeNpm(body) {
  fs.writeFileSync(CLI, `#!/usr/bin/env node\n"use strict";\nconst a = process.argv.slice(2);\n${body}\n`);
}

function runScene(id, body) {
  return new Promise((resolve) => {
    writeFakeNpm(body);
    const root = path.join(ROOT, id);
    fs.mkdirSync(root, { recursive: true });
    const env = {
      ...process.env,
      NGE_ROOT: root,
      NGE_REGISTRY: "http://127.0.0.1:1/",
      NGE_TELEMETRY: "0",
      NPM_CONFIG_CACHE: path.join(root, "npm-cache"),
      npm_execpath: CLI,
    };
    const child = spawn(process.execPath, [INDEX, "--nge-update", SPEC], {
      env, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.resume();
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 20000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const bases = fs.readdirSync(root).filter((d) => !d.startsWith("."));
      const base = bases.length ? path.join(root, bases[0]) : null;
      const p = base ? path.join(base, "events.jsonl") : "";
      const events = p && fs.existsSync(p)
        ? fs.readFileSync(p, "utf8").trim().split("\n").filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return {}; } })
        : [];
      resolve({ code, stdout, events, base });
    });
  });
}

async function main() {
  console.log(`isolated root: ${ROOT}`);

  console.log("\n[1] classify() value domain");
  const cases = [
    ["Error: Cannot find module 'npm/lib/commands/install.js'", "npm-incomplete"],
    ["npm ERR! spawn ENOENT", "enoent"],
    ["ENOTEMPTY: directory not empty", "enotempty"],
    ["EPERM: operation not permitted", "eperm"],
    ["EACCES: permission denied", "eacces"],
    ["npm ERR! code E404", "notfound"],
    ["npm ERR! code EINTEGRITY", "integrity"],
    ["npm ERR! network ECONNRESET", "network"],
    ["ETIMEDOUT", "timeout"],
    ["unrecognised", "other"],
  ];
  for (const [text, want] of cases) {
    check(classify(text) === want, `classify -> ${want}`, text.slice(0, 60));
  }

  console.log("\n[2] npm view fails: update/skipped carries the real reason");
  const viewFail = await runScene("view-enoent",
    'process.stderr.write("npm ERR! spawn ENOENT\\n"); process.exit(1);');
  const skipped = viewFail.events.find((e) => e.phase === "update" && e.result === "skipped");
  check(!!skipped, "update/skipped is emitted", JSON.stringify(viewFail.events.map((e) => `${e.phase}:${e.result}:${e.reason}`)));
  check(skipped?.reason === "enoent", "reason is enoent, not the hard-coded registry", skipped?.reason);
  check(!viewFail.events.some((e) => e.reason === "registry"), "no event is mislabelled registry");
  check(viewFail.stdout === "", "stdout stays empty on resolve failure");

  console.log("\n[3] half-present npm: install failure is classified");
  const half = await runScene("install-incomplete",
    'if (a[0] === "view") { process.stdout.write(JSON.stringify("2.37.5") + "\\n"); process.exit(0); }\n' +
    'if (a[0] === "install") { process.stderr.write("Error: Cannot find module \'npm/lib/commands/install.js\'\\n"); process.exit(1); }\n' +
    'process.exit(1);');
  const instFailed = half.events.find((e) => e.phase === "install" && e.result === "failed");
  check(!!instFailed, "install/failed is emitted", JSON.stringify(half.events.map((e) => `${e.phase}:${e.result}:${e.reason}`)));
  check(instFailed?.reason === "npm-incomplete", "reason is npm-incomplete, not other", instFailed?.reason);
  check(half.events.some((e) => e.phase === "update" && e.result === "failed" && e.reason === "npm-incomplete"),
    "update/failed carries the same real reason");
  check(half.stdout === "", "stdout stays empty on install failure");

  console.log("\n[4] empty npm output is not lumped into other");
  const empty = await runScene("empty-output", 'process.exit(1);');
  const emptySkip = empty.events.find((e) => e.phase === "update" && e.result === "skipped");
  check(emptySkip?.reason === "empty-output", "empty stderr/stdout yields empty-output", emptySkip?.reason);
  check(empty.stdout === "", "stdout stays empty on silent failure");

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
