#!/usr/bin/env node

/**
 * Validate Claude Code + Codex marketplace manifests in this repo.
 *
 * These files are hand-maintained (unlike OPS / Cursor artifacts from
 * build-open-plugin-spec.mjs). CI runs this script to catch drift:
 *   - root Codex marketplace vs .agents/plugins (Codex preferred path)
 *   - Claude `.claude-plugin/marketplace.json` entries + per-plugin manifests
 *   - sparse single-plugin marketplace copies under plugin/*
 *
 * Usage:
 *   node scripts/check-plugin-marketplaces.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// Codex drops plugin hooks for any package carrying an Agent Plugins root
// manifest, so the Codex marketplace points at the generated `-codex` variants
// that omit it. The portable packages stay at plugin/<name> for every other
// client (Claude, Cursor, Qoder, npx plugins). Variants are produced by
// scripts/build-open-plugin-spec.mjs and verified by its --check mode.
const EXPECTED_PLUGINS = [
  { name: "cloudbase", sourcePath: "./plugin/cloudbase-codex" },
  { name: "cloudbase-sites", sourcePath: "./plugin/cloudbase-sites-codex" },
];

/** @type {string[]} */
const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(relPath) {
  const abs = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(abs)) {
    fail(`Missing ${relPath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    fail(`Failed to parse ${relPath}: ${err.message}`);
    return null;
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function requireFile(relPath) {
  if (!fs.existsSync(path.join(ROOT_DIR, relPath))) {
    fail(`Missing ${relPath}`);
    return false;
  }
  return true;
}

function checkCodexRootMarketplace() {
  const marketplace = readJson("marketplace.json");
  if (!marketplace) return;

  if (marketplace.name !== "tencent-cloudbase") {
    fail(`marketplace.json name must be "tencent-cloudbase", got ${JSON.stringify(marketplace.name)}`);
  }
  if (marketplace.interface?.displayName !== "Tencent CloudBase") {
    fail(`marketplace.json interface.displayName must be "Tencent CloudBase"`);
  }
  if (!Array.isArray(marketplace.plugins)) {
    fail("marketplace.json plugins must be an array");
    return;
  }

  for (const { name, sourcePath } of EXPECTED_PLUGINS) {
    const entry = marketplace.plugins.find((p) => p && p.name === name);
    if (!entry) {
      fail(`marketplace.json missing plugin "${name}"`);
      continue;
    }
    if (!deepEqual(entry.source, { source: "local", path: sourcePath })) {
      fail(`marketplace.json plugin "${name}" source mismatch`);
    }
    if (
      !deepEqual(entry.policy, {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
      })
    ) {
      fail(`marketplace.json plugin "${name}" policy mismatch`);
    }
    requireFile(path.join(sourcePath, ".codex-plugin", "plugin.json"));
  }

  const agentsMarketplace = readJson(path.join(".agents", "plugins", "marketplace.json"));
  if (agentsMarketplace && !deepEqual(agentsMarketplace, marketplace)) {
    fail(
      ".agents/plugins/marketplace.json must match root marketplace.json " +
        "(Codex preferred marketplace path)",
    );
  }
}

function checkCodexSparseMarketplaces() {
  for (const { name } of EXPECTED_PLUGINS) {
    const rel = path.join("plugin", name, "marketplace.json");
    const marketplace = readJson(rel);
    if (!marketplace) continue;

    if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length !== 1) {
      fail(`${rel} must list exactly one plugin`);
      continue;
    }
    const entry = marketplace.plugins[0];
    if (entry.name !== name) {
      fail(`${rel} plugin name must be "${name}"`);
    }
    if (!deepEqual(entry.source, { source: "local", path: "./" })) {
      fail(`${rel} plugin source must be local "./"`);
    }
    requireFile(path.join("plugin", name, ".codex-plugin", "plugin.json"));
  }
}

function checkClaudeRootMarketplace() {
  const rel = path.join(".claude-plugin", "marketplace.json");
  const marketplace = readJson(rel);
  if (!marketplace) return;

  if (marketplace.name !== "tencent-cloudbase") {
    fail(`${rel} name must be "tencent-cloudbase"`);
  }
  if (marketplace.owner?.name !== "Tencent CloudBase") {
    fail(`${rel} owner.name must be "Tencent CloudBase"`);
  }
  if (!Array.isArray(marketplace.plugins)) {
    fail(`${rel} plugins must be an array`);
    return;
  }

  for (const { name, sourcePath } of EXPECTED_PLUGINS) {
    const entry = marketplace.plugins.find((p) => p && p.name === name);
    if (!entry) {
      fail(`${rel} missing plugin "${name}"`);
      continue;
    }
    if (entry.source !== sourcePath) {
      fail(`${rel} plugin "${name}" source must be "${sourcePath}"`);
    }
    if (entry.category !== "Developer Tools") {
      fail(`${rel} plugin "${name}" category must be "Developer Tools"`);
    }
    if (typeof entry.description !== "string" || !entry.description.includes("CloudBase")) {
      fail(`${rel} plugin "${name}" description must mention CloudBase`);
    }
    requireFile(path.join(sourcePath, ".claude-plugin", "plugin.json"));
  }
}

function checkClaudeSparseMarketplaces() {
  for (const { name } of EXPECTED_PLUGINS) {
    const rel = path.join("plugin", name, ".claude-plugin", "marketplace.json");
    const marketplace = readJson(rel);
    if (!marketplace) continue;

    if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length !== 1) {
      fail(`${rel} must list exactly one plugin`);
      continue;
    }
    const entry = marketplace.plugins[0];
    if (entry.name !== name) {
      fail(`${rel} plugin name must be "${name}"`);
    }
    if (entry.source !== "./") {
      fail(`${rel} plugin source must be "./"`);
    }
    requireFile(path.join("plugin", name, ".claude-plugin", "plugin.json"));
  }
}

function main() {
  console.log("Plugin marketplace check (Claude + Codex)");
  console.log("=========================================");
  console.log();

  checkCodexRootMarketplace();
  checkCodexSparseMarketplaces();
  checkClaudeRootMarketplace();
  checkClaudeSparseMarketplaces();

  if (errors.length > 0) {
    console.error("✗ Marketplace check failed:\n");
    for (const message of errors) {
      console.error(`  - ${message}`);
    }
    console.error("\nFix the manifests or keep .agents/plugins/marketplace.json in sync with marketplace.json.");
    process.exit(1);
  }

  console.log("✓ Claude Code marketplace (.claude-plugin) OK");
  console.log("✓ Codex marketplace (marketplace.json + .agents/plugins) OK");
  console.log("✓ Sparse per-plugin marketplaces OK");
}

main();
