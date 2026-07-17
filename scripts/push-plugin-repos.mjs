#!/usr/bin/env node

/**
 * Build plugin repository output for syncing to dedicated plugin repos.
 *
 * For each plugin, copies its contents to .plugin-repo-output/<name>/
 * while EXCLUDING marketplace.json files (which cause `npx plugins` CLI
 * to treat the repo as a marketplace instead of a single plugin).
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
  },
  {
    name: "cloudbase-sites",
    sourceDir: path.join(ROOT_DIR, "plugin", "cloudbase-sites"),
    repoName: "TencentCloudBase/cloudbase-sites-plugin",
    description: "CloudBase Sites Plugin — create, deploy, and manage Vite web apps on CloudBase",
  },
];

/**
 * Files/dirs to EXCLUDE when copying to dedicated plugin repo.
 * marketplace.json causes `plugins` CLI to treat repo as marketplace, not single plugin.
 */
const EXCLUDE_PATTERNS = [
  "marketplace.json",
  ".claude-plugin/marketplace.json",
  ".sync-metadata.json",
  "generated",           // build artifacts, not needed in plugin repo
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

This repository is automatically synced from [${plugin.repoName.split("/")[0]}/CloudBase-MCP](https://github.com/${plugin.repoName.split("/")[0]}/CloudBase-MCP).

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

  // Verify no marketplace.json in output
  const checks = [
    path.join(outDir, "marketplace.json"),
    path.join(outDir, ".claude-plugin", "marketplace.json"),
  ];
  for (const p of checks) {
    if (fs.existsSync(p)) {
      console.error(`✗ [${plugin.name}] Found forbidden file: ${path.relative(outDir, p)}`);
      return false;
    }
  }

  // Verify .plugin/plugin.json exists
  if (!fs.existsSync(path.join(outDir, ".plugin", "plugin.json"))) {
    console.error(`✗ [${plugin.name}] Missing .plugin/plugin.json`);
    return false;
  }

  // Verify mcp.json exists
  if (!fs.existsSync(path.join(outDir, "mcp.json"))) {
    console.error(`✗ [${plugin.name}] Missing mcp.json`);
    return false;
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

  console.log(`\nDone. ${totalFiles} total files in ${path.relative(ROOT_DIR, OUTPUT_DIR)}/`);
}

main();
