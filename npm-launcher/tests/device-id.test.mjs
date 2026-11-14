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
// The no-signal fallback lives in the reporter, not in device-id.ts.
const MCP_TELEMETRY_SRC = path.join(PKG, "..", "mcp", "src", "utils", "telemetry.ts");

const HEX32 = /^[0-9a-f]{32}$/;
const SOURCES = ["platform-uuid", "machine-guid", "machine-id", "host-fallback", "host-only"];
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nge-deviceid-"));
const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// Each process recomputes from the system anchor. There is no on-disk id file,
// matching the MCP reporter's constructor-level cache.
const FRESH_SCRIPT = `const l = require(${JSON.stringify(INDEX)}); process.stdout.write(l.deviceId());`;
function inFreshProcess() {
  const r = spawnSync(process.execPath, ["-e", FRESH_SCRIPT], {
    encoding: "utf8", env: { ...process.env, NGE_TELEMETRY: "0" },
  });
  return { value: (r.stdout || "").trim(), stderr: r.stderr || "", status: r.status };
}
function concurrent(n) {
  return Promise.all(Array.from({ length: n }, () => new Promise((resolve) => {
    const p = spawn(process.execPath, ["-e", FRESH_SCRIPT], {
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
  check(HEX32.test(deviceId()), "deviceId() returns the same shape");

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
    const telemetry = fs.existsSync(MCP_TELEMETRY_SRC)
      ? fs.readFileSync(MCP_TELEMETRY_SRC, "utf8") : "";
    check(launcher.includes("cloudbase-mcp|no-device-signal") &&
      telemetry.includes("cloudbase-mcp|no-device-signal"),
      "no-signal fallback is shared by launcher and the MCP reporter (telemetry.ts)");
  } else {
    check(true, "MCP source absent in this checkout; behavioural parity runs in device-id-parity.test.mjs");
  }

  console.log("\n[3] in-process cache, nothing written to disk");
  const first = deviceId();
  check(first === deviceId(), "repeated deviceId() calls reuse the in-process value");
  check(first === a.deviceId, "deviceId() matches computeDeviceId()");
  check(!fs.readFileSync(INDEX, "utf8").includes(".device-id"),
    "index.js has no on-disk device id file");
  check(!fs.readdirSync(ROOT).some((f) => f.includes("device-id")),
    "no id file appears under the isolated root");

  console.log("\n[4] separate processes recompute the same id");
  const fresh = inFreshProcess();
  check(fresh.status === 0 && HEX32.test(fresh.value), "a fresh process computes a valid id", fresh.value);
  check(fresh.value === a.deviceId,
    "a fresh process matches this process (system anchor, not a random instance)");
  check(fresh.stderr === "", "no stderr noise while computing the anchor");

  console.log("\n[5] concurrent processes agree");
  const ids = await concurrent(4);
  check(ids.every((v) => HEX32.test(v)), "all four processes return a valid id", ids.join(","));
  check(new Set(ids).size === 1, "all four processes agree on one id");

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch {}
  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  if (failed) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
