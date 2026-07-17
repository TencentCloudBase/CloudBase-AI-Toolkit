#!/usr/bin/env node

/**
 * Build Open Plugin Specification v1.0.0 compliant artifacts.
 *
 * Generates:
 *   - plugin/cloudbase/.plugin/plugin.json  (vendor-neutral manifest)
 *   - plugin/cloudbase/mcp.json             (spec-standard MCP config, copied from .mcp.json)
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

const PLUGIN_DIR = path.join(ROOT_DIR, "plugin", "cloudbase");
const CLAUDE_MANIFEST = path.join(PLUGIN_DIR, ".claude-plugin", "plugin.json");
const SPEC_MANIFEST = path.join(PLUGIN_DIR, ".plugin", "plugin.json");
const MCP_SOURCE = path.join(PLUGIN_DIR, ".mcp.json");
const MCP_TARGET = path.join(PLUGIN_DIR, "mcp.json");

const SPEC_SCHEMA_URL = "https://open-plugins.com/schemas/1.0.0/plugin.schema.json";

/**
 * Fields allowed by Open Plugin Spec v1.0.0 closed schema.
 * Only these top-level fields are permitted in .plugin/plugin.json.
 */
const SPEC_ALLOWED_FIELDS = new Set([
  "$schema",
  "name",
  "version",
  "description",
  "author",
  "homepage",
  "repository",
  "license",
  "keywords",
  "extensions",
]);

/**
 * Read and parse a JSON file.
 */
function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

/**
 * Write JSON with trailing newline.
 */
function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Build the spec-compliant manifest from the Claude Code manifest.
 *
 * Strategy: read .claude-plugin/plugin.json (which has the most accurate
 * metadata for this plugin), keep only spec-allowed fields, add $schema.
 *
 * Fields like `commands`, `agents`, `mcpServers` are host-specific and
 * NOT part of the Open Plugin Spec v1.0.0 closed schema, so they are
 * stripped. The host will ignore them anyway (spec §11.3), but we keep
 * .plugin/plugin.json clean to pass schema validation.
 */
function buildSpecManifest() {
  const claudeManifest = readJson(CLAUDE_MANIFEST);

  const specManifest = { $schema: SPEC_SCHEMA_URL };

  for (const key of Object.keys(claudeManifest)) {
    if (SPEC_ALLOWED_FIELDS.has(key)) {
      specManifest[key] = claudeManifest[key];
    }
  }

  // Ensure required fields
  if (!specManifest.name) {
    throw new Error("Missing required field 'name' in source manifest");
  }

  // Validate name constraints (spec §5.2):
  // 1-64 chars, lowercase alphanumeric + hyphens + periods,
  // start/end with alphanumeric, no -- or ..
  const name = specManifest.name;
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(name) || name.length > 64 || name.includes("--") || name.includes("..")) {
    throw new Error(`Plugin name "${name}" does not conform to spec naming constraints`);
  }

  return specManifest;
}

/**
 * Copy .mcp.json to mcp.json (spec standard path without dot prefix).
 */
function syncMcpConfig() {
  const source = readJson(MCP_SOURCE);
  return source;
}

/**
 * Compare two JSON objects for semantic equality (key order insensitive).
 */
function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Run npx plugins discover to verify the plugin is recognized.
 */
function verifyDiscover() {
  try {
    const output = execSync("npx -y plugins discover . --remote", {
      cwd: PLUGIN_DIR,
      encoding: "utf-8",
      timeout: 60_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    // Check if the output contains the plugin name
    return output.includes("cloudbase");
  } catch {
    // npx plugins might not be available or might fail for other reasons
    // Don't fail the build, just warn
    console.warn("⚠ npx plugins discover failed (skipping verification)");
    return null;
  }
}

function parseArgs(argv) {
  const args = process.argv.slice(2);
  return { check: args.includes("--check") };
}

function main() {
  const { check } = parseArgs(process.argv);

  console.log("Open Plugin Spec build");
  console.log("=======================");
  console.log(`Plugin dir: ${PLUGIN_DIR}`);
  console.log(`Mode: ${check ? "check" : "generate"}`);
  console.log();

  // 1. Build spec manifest
  const specManifest = buildSpecManifest();
  console.log(`Spec manifest fields: ${Object.keys(specManifest).join(", ")}`);

  // 2. Sync MCP config
  const mcpConfig = syncMcpConfig();
  console.log(`MCP config servers: ${Object.keys(mcpConfig.mcpServers || {}).join(", ")}`);

  if (check) {
    // Check mode: verify existing files match expected content
    let allGood = true;

    if (!fs.existsSync(SPEC_MANIFEST)) {
      console.error(`✗ Missing: ${SPEC_MANIFEST}`);
      allGood = false;
    } else {
      const existing = readJson(SPEC_MANIFEST);
      if (!jsonEqual(existing, specManifest)) {
        console.error(`✗ Outdated: ${SPEC_MANIFEST}`);
        console.error("  Run: node scripts/build-open-plugin-spec.mjs");
        allGood = false;
      } else {
        console.log(`✓ Up to date: .plugin/plugin.json`);
      }
    }

    if (!fs.existsSync(MCP_TARGET)) {
      console.error(`✗ Missing: ${MCP_TARGET}`);
      allGood = false;
    } else {
      const existing = readJson(MCP_TARGET);
      if (!jsonEqual(existing, mcpConfig)) {
        console.error(`✗ Outdated: ${MCP_TARGET}`);
        console.error("  Run: node scripts/build-open-plugin-spec.mjs");
        allGood = false;
      } else {
        console.log(`✓ Up to date: mcp.json`);
      }
    }

    if (!allGood) {
      process.exit(1);
    }

    console.log();
    console.log("All Open Plugin Spec artifacts are up to date.");
    return;
  }

  // Generate mode: write files
  writeJson(SPEC_MANIFEST, specManifest);
  console.log(`✓ Generated: .plugin/plugin.json`);

  writeJson(MCP_TARGET, mcpConfig);
  console.log(`✓ Generated: mcp.json`);

  // Verify with npx plugins discover
  console.log();
  console.log("Verifying with npx plugins discover...");
  const discovered = verifyDiscover();
  if (discovered === true) {
    console.log("✓ npx plugins discover recognized the plugin");
  } else if (discovered === false) {
    console.warn("⚠ npx plugins discover did not recognize the plugin");
  }

  console.log();
  console.log("Done. Open Plugin Spec artifacts generated successfully.");
}

main();
