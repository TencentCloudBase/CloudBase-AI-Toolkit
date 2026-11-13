#!/usr/bin/env node
"use strict";

// Behavioural parity between the launcher and the MCP reporter's device id.
// This is the executable form of mcp/src/utils/device-id.ts, written with Node
// built-ins only: the launcher CI job installs no dependencies and runs on
// Linux / macOS / Windows. If the MCP algorithm changes, update the reference
// below AND the source-token checks in device-id.test.mjs; otherwise
// toolkit_launcher and lifecycle/tool_call rows stop sharing a uin value.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { computeDeviceId } = require(path.join(PKG, "index.js"));
const MCP_SRC = path.join(PKG, "..", "mcp", "src", "utils", "device-id.ts");

const VIRTUAL_NIC_PREFIXES = [
  "awdl", "llw", "bridge", "utun", "tun", "tap", "veth", "docker", "br-",
  "vmnet", "vboxnet", "vether", "zt", "tailscale", "wg", "lo",
];
const ANCHOR_OPTS = {
  timeout: 1000, encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"], windowsHide: true,
};
const sha256Short = (v) => crypto.createHash("sha256").update(v).digest("hex").substring(0, 32);
const isUsableMachineId = (v) => /^[0-9a-f]{16,64}$/i.test(v) && !/^0+$/.test(v);
const readFileQuietly = (p) => { try { return fs.readFileSync(p, "utf8").trim(); } catch { return undefined; } };
function execQuietly(file, args) {
  try { return execFileSync(file, args, ANCHOR_OPTS); } catch { return undefined; }
}

function readSystemAnchor(platform) {
  if (platform === "darwin") {
    const out = execQuietly("ioreg", ["-rd1", "-c", "IOPlatformExpertDevice"]);
    const m = out && /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out);
    if (m && m[1]) return { value: m[1].trim(), source: "platform-uuid" };
    return undefined;
  }
  if (platform === "win32") {
    const out = execQuietly("reg", ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"]);
    const m = out && /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{8,})/.exec(out);
    if (m && m[1]) return { value: m[1].trim().toLowerCase(), source: "machine-guid" };
    return undefined;
  }
  for (const candidate of ["/etc/machine-id", "/var/lib/dbus/machine-id"]) {
    const raw = readFileQuietly(candidate);
    if (raw && isUsableMachineId(raw)) return { value: raw.toLowerCase(), source: "machine-id" };
  }
  return undefined;
}

function physicalMacAddresses(interfaces = os.networkInterfaces()) {
  const macs = new Set();
  for (const [name, list] of Object.entries(interfaces)) {
    if (!list) continue;
    const lower = name.toLowerCase();
    if (VIRTUAL_NIC_PREFIXES.some((prefix) => lower.startsWith(prefix))) continue;
    for (const nic of list) {
      const mac = nic && nic.mac && nic.mac.toLowerCase();
      if (!nic || nic.internal || !mac) continue;
      if (mac === "00:00:00:00:00:00" || mac === "ff:ff:ff:ff:ff:ff") continue;
      macs.add(mac);
    }
  }
  return [...macs].sort();
}

function collectHostSignal() {
  let hostname = "unknown-host";
  try { hostname = os.hostname() || hostname; } catch {}
  let cpu = "";
  try { cpu = os.cpus().map((x) => x.model).join(","); } catch {}
  let macs = [];
  try { macs = physicalMacAddresses(); } catch {}
  const parts = [hostname, cpu, ...macs].filter(Boolean);
  return { value: parts.join("|"), source: macs.length > 0 ? "host-fallback" : "host-only" };
}

function reference(platform = process.platform) {
  const anchor = readSystemAnchor(platform) || collectHostSignal();
  return { deviceId: sha256Short(anchor.value), source: anchor.source };
}

const results = [];
function check(ok, label, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

console.log("[1] the reference stays tied to the MCP source");
if (fs.existsSync(MCP_SRC)) {
  const src = fs.readFileSync(MCP_SRC, "utf8");
  const m = /VIRTUAL_NIC_PREFIXES\s*=\s*\[([\s\S]*?)\]/.exec(src);
  const list = m ? [...m[1].matchAll(/["']([a-z-]+)["']/g)].map((x) => x[1]).sort() : [];
  check(JSON.stringify(list) === JSON.stringify(VIRTUAL_NIC_PREFIXES.slice().sort()),
    "MCP virtual NIC prefixes equal the reference list", `${list.length} entries`);
} else {
  check(true, "MCP source absent (published package); the reference stays self-contained");
}
check(/^[0-9a-f]{32}$/.test(reference().deviceId), "reference id is 32 lowercase hex");

console.log("\n[2] both implementations produce the same id and anchor source");
const platforms = [...new Set([process.platform, "darwin", "win32", "linux", "freebsd"])];
for (const platform of platforms) {
  const a = reference(platform);
  const b = computeDeviceId(platform);
  check(a.deviceId === b.deviceId, `same device id on ${platform}`, `${a.deviceId} / ${b.deviceId}`);
  check(a.source === b.source, `same anchor source on ${platform}`, `${a.source} / ${b.source}`);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed) process.exit(1);
