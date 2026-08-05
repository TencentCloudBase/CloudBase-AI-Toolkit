#!/usr/bin/env node

/**
 * Build Open Plugin Specification v1.0.0 compliant artifacts.
 *
 * Generates for each plugin (cloudbase + cloudbase-sites):
 *   - .plugin/plugin.json  (vendor-neutral manifest)
 *   - mcp.json             (spec-standard MCP config, copied from .mcp.json)
 *   - .cursor-plugin/plugin.json (Cursor Marketplace manifest)
 *   - .qoder-plugin/plugin.json (Qoder / QoderWork plugin marketplace)
 *
 * Also generates:
 *   - .cursor-plugin/marketplace.json (repo-root multi-plugin marketplace)
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
const REPO_URL = "https://github.com/TencentCloudBase/CloudBase-MCP";

const SPEC_ALLOWED_FIELDS = new Set([
  "$schema", "name", "version", "description",
  "author", "homepage", "repository", "license", "keywords", "logo", "extensions",
]);

function resolveLogoPath(pluginDir) {
  const logoSvg = path.join(pluginDir, "assets", "logo.svg");
  const logoPng = path.join(pluginDir, "assets", "logo.png");
  if (fs.existsSync(logoSvg)) return "./assets/logo.svg";
  if (fs.existsSync(logoPng)) return "./assets/logo.png";
  return null;
}

const PLUGINS = [
  {
    name: "cloudbase",
    dir: path.join(ROOT_DIR, "plugin", "cloudbase"),
    marketplaceDescription:
      "CloudBase platform capabilities: AI, auth, databases, cloud functions, storage, CloudRun, and Mini Program integration.",
  },
  {
    name: "cloudbase-sites",
    dir: path.join(ROOT_DIR, "plugin", "cloudbase-sites"),
    marketplaceDescription:
      "Create, preview, save, deploy, inspect, and roll back Vite web apps hosted on Tencent CloudBase.",
  },
  // Marketplace listing only (no MCP server / skills pack to regenerate).
  {
    name: "workbuddy-template-prewarm",
    dir: path.join(ROOT_DIR, "plugin", "workbuddy-template-prewarm"),
    marketplaceDescription:
      "SessionStart prewarm + Sites-aligned preview during WorkBuddy credential wait. Stacks with teamai hooks.",
    marketplaceOnly: true,
  },
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

function buildSpecManifest(claudeManifestPath, pluginDir) {
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
  const logo = resolveLogoPath(pluginDir);
  if (!logo) {
    throw new Error(`Missing Open Plugin logo at ${path.join(pluginDir, "assets", "logo.svg")} or logo.png`);
  }
  spec.logo = cm.logo || logo;
  return spec;
}

function buildQoderManifest(claudeManifestPath, pluginDir) {
  const cm = readJson(claudeManifestPath);
  const keywords = Array.isArray(cm.keywords) ? [...cm.keywords] : [];
  if (!keywords.includes("qoder")) keywords.push("qoder");
  if (!keywords.includes("qoderwork")) keywords.push("qoderwork");

  const skillsDir = path.join(pluginDir, "skills");
  const skills = [];
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
      if (fs.existsSync(skillMd)) skills.push(`./skills/${entry.name}/`);
    }
    skills.sort();
  }

  const manifest = {
    name: cm.name,
    version: cm.version,
    description: cm.description,
    author: cm.author || { name: "Tencent CloudBase", url: "https://cloudbase.net" },
    homepage: cm.homepage || "https://cloudbase.net",
    repository: REPO_URL,
    license: cm.license || "MIT",
    keywords,
  };
  if (skills.length > 0) manifest.skills = skills;
  if (Array.isArray(cm.commands) && cm.commands.length > 0) {
    manifest.commands = cm.commands;
  }
  if (Array.isArray(cm.agents) && cm.agents.length > 0) {
    manifest.agents = cm.agents;
  }
  if (!manifest.name) {
    throw new Error(`Missing 'name' in ${claudeManifestPath}`);
  }
  return manifest;
}

function buildCursorManifest(claudeManifestPath, pluginDir) {
  const cm = readJson(claudeManifestPath);
  const authorName = cm.author?.name || "Tencent CloudBase";
  const logo = resolveLogoPath(pluginDir);
  if (!logo) {
    throw new Error(`Missing Cursor logo at ${path.join(pluginDir, "assets", "logo.svg")} or logo.png`);
  }
  const manifest = {
    name: cm.name,
    version: cm.version,
    description: cm.description,
    author: { name: authorName },
    homepage: cm.homepage || "https://cloudbase.net",
    repository: REPO_URL,
    license: cm.license || "MIT",
    keywords: Array.isArray(cm.keywords) ? [...cm.keywords] : [],
    logo,
    mcpServers: "./mcp.json",
  };
  if (!manifest.keywords.includes("cursor")) {
    manifest.keywords.push("cursor");
  }
  if (!manifest.name) {
    throw new Error(`Missing 'name' in ${claudeManifestPath}`);
  }
  return manifest;
}

function buildCursorMarketplace() {
  return {
    name: "tencent-cloudbase",
    owner: {
      name: "Tencent CloudBase",
    },
    metadata: {
      description: "Tencent CloudBase plugins for CloudBase platform development and CloudBase Sites workflows.",
      version: "1.0.0",
    },
    plugins: PLUGINS.map((plugin) => {
      const claudeManifest = path.join(plugin.dir, ".claude-plugin", "plugin.json");
      const cm = readJson(claudeManifest);
      const keywords = Array.isArray(cm.keywords) ? [...cm.keywords] : [];
      if (!keywords.includes("cursor")) {
        keywords.push("cursor");
      }
      return {
        name: cm.name,
        source: `plugin/${plugin.name}`,
        description: plugin.marketplaceDescription,
        version: cm.version,
        author: { name: cm.author?.name || "Tencent CloudBase" },
        homepage: cm.homepage || "https://cloudbase.net",
        repository: REPO_URL,
        license: cm.license || "MIT",
        category: "Developer Tools",
        keywords,
      };
    }),
  };
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

  for (const { name, dir, marketplaceOnly } of PLUGINS) {
    if (marketplaceOnly) {
      console.log(`[${name}] Marketplace-only — skip Open Plugin / MCP artifact generation`);
      continue;
    }

    const claudeManifest = path.join(dir, ".claude-plugin", "plugin.json");
    const specManifest = path.join(dir, ".plugin", "plugin.json");
    const cursorManifest = path.join(dir, ".cursor-plugin", "plugin.json");
    const qoderManifest = path.join(dir, ".qoder-plugin", "plugin.json");
    const mcpSource = path.join(dir, ".mcp.json");
    const mcpTarget = path.join(dir, "mcp.json");

    if (!fs.existsSync(claudeManifest)) {
      console.log(`[${name}] Skipping — no .claude-plugin/plugin.json`);
      continue;
    }

    const spec = buildSpecManifest(claudeManifest, dir);
    const cursor = buildCursorManifest(claudeManifest, dir);
    const qoder = buildQoderManifest(claudeManifest, dir);
    const mcp = readJson(mcpSource);
    console.log(`[${name}] fields: ${Object.keys(spec).join(", ")}, mcp servers: ${Object.keys(mcp.mcpServers || {}).join(", ")}, qoder skills: ${(qoder.skills || []).length}`);

    if (check) {
      for (const [p, expected, label] of [
        [specManifest, spec, ".plugin/plugin.json"],
        [mcpTarget, mcp, "mcp.json"],
        [cursorManifest, cursor, ".cursor-plugin/plugin.json"],
        [qoderManifest, qoder, ".qoder-plugin/plugin.json"],
      ]) {
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
      writeJson(cursorManifest, cursor);
      writeJson(qoderManifest, qoder);
      console.log(`✓ [${name}] Generated: .plugin/plugin.json + mcp.json + .cursor-plugin/plugin.json + .qoder-plugin/plugin.json`);
    }
  }

  const cursorMarketplacePath = path.join(ROOT_DIR, ".cursor-plugin", "marketplace.json");
  const cursorMarketplace = buildCursorMarketplace();
  if (check) {
    if (!fs.existsSync(cursorMarketplacePath) || !jsonEqual(readJson(cursorMarketplacePath), cursorMarketplace)) {
      console.error("✗ Outdated: .cursor-plugin/marketplace.json");
      allGood = false;
    } else {
      console.log("✓ Up to date: .cursor-plugin/marketplace.json");
    }
  } else {
    writeJson(cursorMarketplacePath, cursorMarketplace);
    console.log("✓ Generated: .cursor-plugin/marketplace.json");
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
