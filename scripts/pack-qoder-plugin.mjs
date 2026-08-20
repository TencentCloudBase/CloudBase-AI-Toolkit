#!/usr/bin/env node
/**
 * Pack plugin/cloudbase as a Qoder / QoderWork marketplace zip.
 *
 * Zip root contains `.qoder-plugin/plugin.json` (and `.claude-plugin/` which
 * QoderWork Expert Kits also accept), skills, MCP, agents, commands, hooks.
 *
 * Usage:
 *   npm run pack:qoder-plugin
 *   node scripts/pack-qoder-plugin.mjs --out /tmp/cloudbase-qoder.zip
 *
 * Submit:
 *   1. QoderWork: marketplace → create/submit → upload zip (or import folder)
 *   2. Qoder IDE: plugin market → import local folder / community AppHub
 *   Docs: https://docs.qoder.com/zh/qoderwork/skill-marketplace-guidelines
 */

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PLUGIN_DIR = path.join(ROOT, "plugin", "cloudbase");

function parseArgs(argv = process.argv.slice(2)) {
  const args = { out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--out") {
      args.out = argv[++i];
      if (!args.out) throw new Error("--out requires a path");
    } else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function ensureBuilt() {
  execFileSync("node", ["scripts/build-open-plugin-spec.mjs"], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

function assertReady() {
  const required = [
    path.join(PLUGIN_DIR, ".qoder-plugin", "plugin.json"),
    path.join(PLUGIN_DIR, ".mcp.json"),
    path.join(PLUGIN_DIR, "skills"),
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) {
      throw new Error(`Missing required path for Qoder pack: ${p}`);
    }
  }
}

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Pack CloudBase plugin for Qoder / QoderWork.

Usage:
  npm run pack:qoder-plugin
  npm run pack:qoder-plugin -- --out ./dist/cloudbase-qoder.zip
`);
    return;
  }

  ensureBuilt();
  assertReady();

  const manifest = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_DIR, ".qoder-plugin", "plugin.json"), "utf8"),
  );
  const version = manifest.version || "0.0.0";
  // Version-free asset name (same strategy as the Kimi pack): the release tag
  // carries the version, so the zip-url stays stable across releases.
  const outPath =
    args.out ||
    path.join(ROOT, "dist", "cloudbase-qoder.zip");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) fs.rmSync(outPath);

  // zip from inside plugin dir so archive root is the plugin contents
  execFileSync(
    "zip",
    [
      "-r",
      outPath,
      ".",
      "-x",
      "*.DS_Store",
      "./.git/*",
      "./.sync-metadata.json",
      "./generated/*",
    ],
    { cwd: PLUGIN_DIR, stdio: "inherit" },
  );

  const size = fs.statSync(outPath).size;
  console.log("");
  console.log(`Packed: ${outPath}`);
  console.log(`Size:   ${(size / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`Name:   ${manifest.name}@${version}`);
  console.log("");
  console.log("Next:");
  console.log("  1. Open QoderWork → Extensions / marketplace → submit / 我的发布");
  console.log("  2. Upload this zip (root must include .qoder-plugin/plugin.json)");
  console.log("  3. Or: Qoder IDE plugin market → import local folder:");
  console.log(`     ${PLUGIN_DIR}`);
  console.log("  Guidelines: https://docs.qoder.com/zh/qoderwork/skill-marketplace-guidelines");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
