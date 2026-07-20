#!/usr/bin/env node

/**
 * Build plugin repository output for syncing to dedicated plugin repos.
 *
 * Dedicated repos are Open Plugin Spec only (`npx plugins add`).
 * Vendor-native marketplace manifests stay in the main CloudBase-MCP repo:
 *   - `.claude-plugin/`  → Claude Code marketplace
 *   - `.codex-plugin/`   → Codex marketplace
 *   - `marketplace.json` → would make plugins CLI treat the repo as a marketplace
 *
 * Output: .plugin-repo-output/cloudbase/ and .plugin-repo-output/cloudbase-sites/
 *
 * Usage:
 *   node scripts/push-plugin-repos.mjs          Build output
 *   node scripts/push-plugin-repos.mjs --check   Check only
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const OUTPUT_DIR = path.join(ROOT_DIR, ".plugin-repo-output");

const PLUGINS = [
  {
    name: "cloudbase",
    sourceDir: path.join(ROOT_DIR, "plugin", "cloudbase"),
    repoName: "TencentCloudBase/cloudbase-plugin",
    description: "CloudBase AI Plugin — MCP Server + Agent Skills for AI Coding Agents",
    // Hooks load skill-manifest.json + synonyms.json at runtime.
    requireGenerated: true,
  },
  {
    name: "cloudbase-sites",
    sourceDir: path.join(ROOT_DIR, "plugin", "cloudbase-sites"),
    repoName: "TencentCloudBase/cloudbase-sites-plugin",
    description: "CloudBase Sites Plugin — create, deploy, and manage Vite web apps on CloudBase",
    requireGenerated: false,
  },
];

/**
 * Files/dirs to EXCLUDE when copying to dedicated plugin repo.
 * Keep generated/ — hooks need skill-manifest.json and synonyms.json at runtime.
 */
const EXCLUDE_PATTERNS = [
  // Marketplace / vendor-native install paths stay in CloudBase-MCP only
  "marketplace.json",
  ".claude-plugin",
  ".codex-plugin",
  ".sync-metadata.json",
  ".DS_Store",
  ".gitkeep",
];

function shouldExclude(relPath) {
  return EXCLUDE_PATTERNS.some((p) => relPath === p || relPath.startsWith(p + "/"));
}

function copyDir(src, dest, base) {
  if (!fs.existsSync(src)) return 0;
  let count = 0;

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === ".DS_Store" || entry.name === ".gitkeep") continue;

    const fullPath = path.join(src, entry.name);
    const relPath = path.relative(base, fullPath);
    if (shouldExclude(relPath)) {
      console.log(`  skip: ${relPath}`);
      continue;
    }

    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      count += copyDir(fullPath, destPath, base);
    } else {
      fs.copyFileSync(fullPath, destPath);
      count++;
    }
  }
  return count;
}

function generateReadme(plugin) {
  return `# ${plugin.name}

${plugin.description}

This repository is automatically synced from [${plugin.repoName.split("/")[0]}/CloudBase-MCP](https://github.com/${plugin.repoName.split("/")[0]}/CloudBase-MCP)
(\`plugin/${plugin.name}/\`, Open Plugin Spec artifacts only).

Claude Code / Codex native marketplace install continues to use the main
[CloudBase-MCP](https://github.com/${plugin.repoName.split("/")[0]}/CloudBase-MCP) repository.

## Installation

\`\`\`bash
npx plugins add ${plugin.repoName}
\`\`\`

## Open Plugin Specification

This plugin conforms to the [Open Plugin Specification v1.0.0](https://open-plugins.com/plugin-builders/specification).

## License

MIT
`;
}

function buildPlugin(plugin) {
  const outDir = path.join(OUTPUT_DIR, plugin.name);

  // Clear output
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // Copy plugin contents (excluding marketplace.json etc.)
  const count = copyDir(plugin.sourceDir, outDir, plugin.sourceDir);

  // Generate README
  fs.writeFileSync(path.join(outDir, "README.md"), generateReadme(plugin));

  console.log(`✓ [${plugin.name}] ${count} files copied to ${path.relative(ROOT_DIR, outDir)}/`);
  return count;
}

function checkPlugin(plugin) {
  const outDir = path.join(OUTPUT_DIR, plugin.name);
  if (!fs.existsSync(outDir)) {
    console.error(`✗ [${plugin.name}] Output not found — run: node scripts/push-plugin-repos.mjs`);
    return false;
  }

  // Vendor-native / marketplace files must NOT appear in dedicated OPS repos
  const forbidden = [
    "marketplace.json",
    ".claude-plugin",
    ".codex-plugin",
    path.join(".claude-plugin", "marketplace.json"),
    path.join(".claude-plugin", "plugin.json"),
    path.join(".codex-plugin", "plugin.json"),
  ];
  for (const rel of forbidden) {
    const p = path.join(outDir, rel);
    if (fs.existsSync(p)) {
      console.error(`✗ [${plugin.name}] Found forbidden path (vendor/marketplace): ${rel}`);
      return false;
    }
  }

  // Required Open Plugin Spec artifacts
  const required = [
    [".plugin/plugin.json", path.join(outDir, ".plugin", "plugin.json")],
    ["mcp.json", path.join(outDir, "mcp.json")],
  ];
  for (const [label, p] of required) {
    if (!fs.existsSync(p)) {
      console.error(`✗ [${plugin.name}] Missing required file: ${label}`);
      return false;
    }
  }

  if (plugin.requireGenerated) {
    const generatedRequired = [
      "generated/skill-manifest.json",
      "generated/synonyms.json",
    ];
    for (const rel of generatedRequired) {
      if (!fs.existsSync(path.join(outDir, rel))) {
        console.error(`✗ [${plugin.name}] Missing required runtime artifact: ${rel}`);
        return false;
      }
    }

    // promptSignals currently survive only in committed skill-manifest.json.
    // Refuse to publish an empty matching table (would disable skill-inject).
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(outDir, "generated", "skill-manifest.json"), "utf-8"),
      );
      const skills = Object.values(manifest.skills || {});
      const withSignals = skills.filter((s) => (s.promptSignals?.phrases || []).length > 0);
      if (skills.length === 0 || withSignals.length === 0) {
        console.error(
          `✗ [${plugin.name}] generated/skill-manifest.json has empty promptSignals ` +
            `(${withSignals.length}/${skills.length}). Do not rebuild from SKILL.md until ` +
            `skill-metadata persistence is implemented.`,
        );
        return false;
      }
    } catch (err) {
      console.error(`✗ [${plugin.name}] Failed to parse generated/skill-manifest.json: ${err.message}`);
      return false;
    }
  }

  console.log(`✓ [${plugin.name}] Output looks good`);
  return true;
}

function main() {
  const check = process.argv.slice(2).includes("--check");

  console.log("Push Plugin Repos build");
  console.log("========================");
  console.log(`Mode: ${check ? "check" : "generate"}`);
  console.log();

  if (check) {
    let allGood = true;
    for (const plugin of PLUGINS) {
      if (!checkPlugin(plugin)) allGood = false;
    }
    if (!allGood) process.exit(1);
    console.log("\nAll plugin repo outputs are valid.");
    return;
  }

  let totalFiles = 0;
  for (const plugin of PLUGINS) {
    totalFiles += buildPlugin(plugin);
  }

  // Always validate after generate so CI catches incomplete output early
  let allGood = true;
  for (const plugin of PLUGINS) {
    if (!checkPlugin(plugin)) allGood = false;
  }
  if (!allGood) process.exit(1);

  console.log(`\nDone. ${totalFiles} total files in ${path.relative(ROOT_DIR, OUTPUT_DIR)}/`);
}

main();
