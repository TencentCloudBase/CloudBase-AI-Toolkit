#!/usr/bin/env node

/**
 * Build Open Plugin Specification v1.0.0 compliant artifacts.
 *
 * Generates for each plugin (cloudbase + cloudbase-sites):
 *   - .plugin/plugin.json  (vendor-neutral manifest)
 *   - mcp.json             (spec-standard MCP config, copied from .mcp.json)
 *
 * Usage:
 *   node scripts/build-open-plugin-spec.mjs          Generate artifacts
 *   node scripts/build-open-plugin-spec.mjs --check   Check only (CI mode, no writes)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const SPEC_SCHEMA_URL = "https://open-plugins.com/schemas/1.0.0/plugin.schema.json";

const SPEC_ALLOWED_FIELDS = new Set([
  "$schema", "name", "version", "description",
  "author", "homepage", "repository", "license", "keywords", "extensions",
]);

const PLUGINS = [
  { name: "cloudbase", dir: path.join(ROOT_DIR, "plugin", "cloudbase") },
  { name: "cloudbase-sites", dir: path.join(ROOT_DIR, "plugin", "cloudbase-sites") },
];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
}

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildSpecManifest(claudeManifestPath) {
  const cm = readJson(claudeManifestPath);
  const spec = { $schema: SPEC_SCHEMA_URL };
  for (const key of Object.keys(cm)) {
    if (SPEC_ALLOWED_FIELDS.has(key)) spec[key] = cm[key];
  }
  if (!spec.name) throw new Error(`Missing 'name' in ${claudeManifestPath}`);
  const name = spec.name;
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name) || name.length > 64 || name.includes("--") || name.includes("..")) {
    throw new Error(`Plugin name "${name}" does not conform to spec naming constraints`);
  }
  return spec;
}

function verifyDiscover(pluginDir) {
  try {
    const output = execSync("npx -y plugins discover . --remote", {
      cwd: pluginDir, encoding: "utf-8", timeout: 60_000, stdio: ["pipe", "pipe", "pipe"],
    });
    return output.includes("cloudbase");
  } catch {
    console.warn("⚠ npx plugins discover failed (skipping verification)");
    return null;
  }
}

function parseArgs() {
  return { check: process.argv.slice(2).includes("--check") };
}

function main() {
  const { check } = parseArgs();
  console.log("Open Plugin Spec build");
  console.log("=======================");
  console.log(`Mode: ${check ? "check" : "generate"}`);
  console.log();

  let allGood = true;

  for (const { name, dir } of PLUGINS) {
    const claudeManifest = path.join(dir, ".claude-plugin", "plugin.json");
    const specManifest = path.join(dir, ".plugin", "plugin.json");
    const mcpSource = path.join(dir, ".mcp.json");
    const mcpTarget = path.join(dir, "mcp.json");

    if (!fs.existsSync(claudeManifest)) {
      console.log(`[${name}] Skipping — no .claude-plugin/plugin.json`);
      continue;
    }

    const spec = buildSpecManifest(claudeManifest);
    const mcp = readJson(mcpSource);
    console.log(`[${name}] fields: ${Object.keys(spec).join(", ")}, mcp servers: ${Object.keys(mcp.mcpServers || {}).join(", ")}`);

    if (check) {
      for (const [p, expected, label] of [[specManifest, spec, ".plugin/plugin.json"], [mcpTarget, mcp, "mcp.json"]]) {
        if (!fs.existsSync(p) || !jsonEqual(readJson(p), expected)) {
          console.error(`✗ [${name}] Outdated: ${label}`);
          allGood = false;
        } else {
          console.log(`✓ [${name}] Up to date: ${label}`);
        }
      }
    } else {
      writeJson(specManifest, spec);
      writeJson(mcpTarget, mcp);
      console.log(`✓ [${name}] Generated: .plugin/plugin.json + mcp.json`);
    }
  }

  if (check) {
    if (!allGood) {
      console.error("\nRun: node scripts/build-open-plugin-spec.mjs");
      process.exit(1);
    }
    console.log("\nAll Open Plugin Spec artifacts are up to date.");
    return;
  }

  // Verify cloudbase (primary plugin)
  console.log("\nVerifying cloudbase with npx plugins discover...");
  const discovered = verifyDiscover(PLUGINS[0].dir);
  if (discovered === true) console.log("✓ npx plugins discover recognized cloudbase");
  else if (discovered === false) console.warn("⚠ npx plugins discover did not recognize cloudbase");

  console.log("\nDone. Open Plugin Spec artifacts generated successfully.");
}

main();
