#!/usr/bin/env node
"use strict";

// The device id must be byte-for-byte compatible with mcp/src/utils/device-id.ts
// so beacon rows from both events share the same `uin` value. These checks run
// on Node built-ins only (launcher CI installs no dependencies).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX = path.join(PKG, "index.js");
const { computeDeviceId, deviceId } = require(INDEX);
const MCP_SRC = path.join(PKG, "..", "mcp", "src", "utils", "device-id.ts");

const HEX32 = /^[0-9a-f]{32}$/;
const SOURCES = ["platform-uuid", "machine-guid", "machine-id", "host-fallback", "host-only"];
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nge-deviceid-"));
const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// Call deviceId() in a fresh process so the module-level cache cannot hide
// whether the on-disk value was actually read.
function inFreshProcess(base) {
  const script = `const l = require(${JSON.stringify(INDEX)}); process.stdout.write(l.deviceId({ base: ${JSON.stringify(base)} }));`;
  const r = spawnSync(process.execPath, ["-e", script], {
    encoding: "utf8", env: { ...process.env, NGE_TELEMETRY: "0" },
  });
  return { value: (r.stdout || "").trim(), stderr: r.stderr || "", status: r.status };
}
function concurrent(base, n) {
  const script = `const l = require(${JSON.stringify(INDEX)}); process.stdout.write(l.deviceId({ base: ${JSON.stringify(base)} }));`;
  return Promise.all(Array.from({ length: n }, () => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-e", script], {
      env: { ...process.env, NGE_TELEMETRY: "0" }, stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.on("close", () => resolve(out.trim()));
  })));
}

async function main() {
  console.log(`isolated root: ${ROOT}`);

  console.log("\n[1] format and stability");
  const a = computeDeviceId();
  const b = computeDeviceId();
  check(HEX32.test(a.deviceId), "computeDeviceId returns 32 lowercase hex", a.deviceId);
  check(SOURCES.includes(a.source), "anchor source is one of the known fallbacks", a.source);
  check(a.deviceId === b.deviceId, "repeated computation is stable (no random fallback)");
  fs.mkdirSync(path.join(ROOT, "self"), { recursive: true });
  check(HEX32.test(deviceId({ base: path.join(ROOT, "self") })), "deviceId() returns the same shape");

  console.log("\n[2] algorithm agrees with the MCP reporter source");
  if (fs.existsSync(MCP_SRC)) {
    const mcp = fs.readFileSync(MCP_SRC, "utf8");
    const launcher = fs.readFileSync(INDEX, "utf8");
    const nicBlock = (src) => {
      const m = /VIRTUAL_NIC_PREFIXES\s*=\s*\[([\s\S]*?)\]/.exec(src);
      return m ? [...m[1].matchAll(/["']([a-z-]+)["']/g)].map((x) => x[1]).sort() : [];
    };
    check(JSON.stringify(nicBlock(mcp)) === JSON.stringify(nicBlock(launcher)),
      "virtual NIC prefix list matches", `${nicBlock(mcp).length} entries`);
    for (const token of ["IOPlatformUUID", "MachineGuid", "/etc/machine-id", "sha256", "substring(0, 32)"]) {
      check(mcp.includes(token) && launcher.includes(token), `both implementations contain ${token}`);
    }
    check(launcher.includes("cloudbase-mcp|no-device-signal"),
      "no-signal fallback string matches the MCP reporter");
  } else {
    check(true, "MCP source not present in this checkout; parity checked by the specs/ script");
  }

  console.log("\n[3] cache file is created and reused");
  const base1 = path.join(ROOT, "base1");
  fs.mkdirSync(base1, { recursive: true });
  const file1 = path.join(base1, ".device-id");
  const first = inFreshProcess(base1);
  check(first.status === 0 && HEX32.test(first.value), "first run writes a valid id", first.value);
  check(fs.existsSync(file1), ".device-id exists under the cache base");
  check(first.stderr === "", "no stderr noise while computing the anchor");
  const second = inFreshProcess(base1);
  check(second.value === first.value, "second process reads the cached id");
  fs.writeFileSync(file1, "b".repeat(32) + "\n");
  const third = inFreshProcess(base1);
  check(third.value === "b".repeat(32), "a valid cached id is reused verbatim");
  fs.writeFileSync(file1, "garbage\n");
  const fourth = inFreshProcess(base1);
  check(HEX32.test(fourth.value) && fourth.value === a.deviceId,
    "an invalid cache is recomputed from the anchor", fourth.value);

  console.log("\n[4] device-level, not per-directory");
  const base2 = path.join(ROOT, "base2");
  fs.mkdirSync(base2, { recursive: true });
  const other = inFreshProcess(base2);
  check(other.value === a.deviceId, "a different cache base yields the SAME id (system anchor, not a random instance)");

  console.log("\n[5] concurrent first runs converge");
  const base3 = path.join(ROOT, "base3");
  fs.mkdirSync(base3, { recursive: true });
  const ids = await concurrent(base3, 4);
  check(ids.every((v) => HEX32.test(v)), "all four processes return a valid id", ids.join(","));
  check(new Set(ids).size === 1, "all four processes agree on one id");

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
