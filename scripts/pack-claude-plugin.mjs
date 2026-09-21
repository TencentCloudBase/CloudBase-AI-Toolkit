#!/usr/bin/env node
/**
 * Pack plugin/cloudbase (and cloudbase-sites) as a Claude Code plugin zip.
 *
 * Archive root is a Claude Code plugin root:
 *   .claude-plugin/plugin.json   manifest
 *   skills/  commands/  agents/  hooks/  generated/  assets/  bin/  lib/
 *   cloudbase-session.md         session context, read by hooks at runtime
 *   .mcp.json                    MCP server config
 *   README.md
 *
 * Why exclusion-based instead of a component whitelist: hooks resolve their
 * data at runtime relative to the plugin root (`cloudbase-session.md`,
 * `generated/skill-manifest.json`, `generated/synonyms.json`), and
 * cloudbase-sites hooks shell out into `bin/` + `lib/`. A whitelist silently
 * drops those and the plugin then fails at hook time rather than at pack time.
 *
 * Stripped, so the package is unambiguous on clients that implement more than
 * one plugin format:
 *   plugin.json         Agent Plugins portable manifest — excluded at the root
 *                       only, because clients that support Agent Plugins decide
 *                       the format from a root manifest, and a package carrying
 *                       both would resolve as Agent Plugins. It ships in the
 *                       agent-plugin zip instead. `.claude-plugin/plugin.json`
 *                       is nested and must survive.
 *   .plugin/            legacy Open Plugin layout (`npx plugins add`)
 *   .cursor-plugin/     Cursor Marketplace
 *   .codex-plugin/      Codex / ChatGPT
 *   .qoder-plugin/      Qoder / QoderWork
 *   marketplace.json    marketplace manifest, not a plugin component
 *   mcp.json            Cursor MCP config (Claude Code reads .mcp.json)
 *   gemini-extension.json + GEMINI.md   Gemini CLI extension
 *
 * Claude Code does not currently implement the Agent Plugins 1.0
 * specification, so a single archive cannot serve both — the portable package
 * is emitted separately by scripts/pack-agent-plugins.mjs.
 *
 * Output names are version-free — the release tag carries the version, so the
 * zip URL stays stable across releases:
 *   dist/cloudbase-claude-plugin.zip
 *   dist/cloudbase-sites-claude-plugin.zip
 *
 * Usage:
 *   node scripts/pack-claude-plugin.mjs
 *   node scripts/pack-claude-plugin.mjs --out-dir /tmp
 *   node scripts/pack-claude-plugin.mjs --plugin cloudbase
 */

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PLUGINS = ["cloudbase", "cloudbase-sites"];

/** Entries owned by other clients, or repo bookkeeping. Excluded at any depth. */
const EXCLUDE_ENTRIES = new Set([
  ".plugin",
  ".cursor-plugin",
  ".codex-plugin",
  ".qoder-plugin",
  "marketplace.json",
  "mcp.json",
  "kimi.plugin.json",
  "gemini-extension.json",
  "GEMINI.md",
  "skill-metadata.json",
  "skill-metadata.template.json",
  ".sync-metadata.json",
  ".git",
  ".DS_Store",
  ".gitkeep",
]);

/** Excluded at the plugin root only — see the header note on plugin.json. */
const EXCLUDE_AT_ROOT = new Set(["plugin.json"]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = { outDir: path.join(ROOT, "dist"), plugin: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--out-dir") {
      args.outDir = argv[++i];
      if (!args.outDir) throw new Error("--out-dir requires a path");
    } else if (a === "--plugin") {
      args.plugin = argv[++i];
      if (!args.plugin) throw new Error("--plugin requires a name");
    } else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function copyTree(src, dest, depth = 0) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE_ENTRIES.has(entry.name)) continue;
    if (depth === 0 && EXCLUDE_AT_ROOT.has(entry.name)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(from, to, depth + 1);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function assertManifest(stagingDir, pluginName) {
  // Regression guard: a root manifest would make clients that also implement
  // Agent Plugins resolve this package as Agent Plugins, never reaching the
  // Claude layout.
  if (fs.existsSync(path.join(stagingDir, "plugin.json"))) {
    throw new Error(
      `[${pluginName}] packed output carries a root plugin.json; ` +
        "the Claude zip must not include the Agent Plugins portable manifest",
    );
  }

  const manifestPath = path.join(stagingDir, ".claude-plugin", "plugin.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`[${pluginName}] packed output has no .claude-plugin/plugin.json`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!manifest.name || !manifest.description) {
    throw new Error(`[${pluginName}] .claude-plugin/plugin.json needs name + description`);
  }
  for (const rel of [...(manifest.commands || []), ...(manifest.agents || [])]) {
    if (!fs.existsSync(path.join(stagingDir, rel.replace(/^\.\//, "")))) {
      throw new Error(`[${pluginName}] manifest references missing path: ${rel}`);
    }
  }
  return manifest;
}

function assertRuntimeData(stagingDir, pluginDir, pluginName) {
  // Each hooks/ file resolves its data relative to the plugin root. Missing
  // data degrades silently in-session, so fail at pack time instead.
  if (!fs.existsSync(path.join(pluginDir, "hooks"))) return;

  const required = [];
  if (fs.existsSync(path.join(pluginDir, "cloudbase-session.md"))) {
    required.push("cloudbase-session.md");
  }
  if (fs.existsSync(path.join(pluginDir, "generated"))) {
    required.push("generated/skill-manifest.json", "generated/synonyms.json");
  }
  for (const rel of required) {
    if (!fs.existsSync(path.join(stagingDir, rel))) {
      throw new Error(`[${pluginName}] hooks read ${rel} at runtime but it is not packed`);
    }
  }
}

function packPlugin(pluginName, outDir) {
  const pluginDir = path.join(ROOT, "plugin", pluginName);
  if (!fs.existsSync(pluginDir)) {
    throw new Error(`Missing plugin dir: ${pluginDir}`);
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-plugin-pack-"));
  const outPath = path.join(outDir, `${pluginName}-claude-plugin.zip`);

  try {
    copyTree(pluginDir, stagingDir);
    const manifest = assertManifest(stagingDir, pluginName);
    assertRuntimeData(stagingDir, pluginDir, pluginName);

    fs.mkdirSync(outDir, { recursive: true });
    if (fs.existsSync(outPath)) fs.rmSync(outPath);
    execFileSync("zip", ["-r", outPath, ".", "-x", "*.DS_Store"], {
      cwd: stagingDir,
      stdio: "inherit",
    });

    const size = fs.statSync(outPath).size;
    console.log("");
    console.log(`Packed: ${outPath}`);
    console.log(`Size:   ${(size / 1024).toFixed(0)} KiB`);
    console.log(`Name:   ${manifest.name}@${manifest.version || "unversioned"}`);
    return outPath;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Pack a CloudBase plugin as a Claude Code plugin zip.

Archive root: .claude-plugin/plugin.json + skills/ commands/ agents/ hooks/ + .mcp.json

Usage:
  node scripts/pack-claude-plugin.mjs
  node scripts/pack-claude-plugin.mjs --out-dir ./dist --plugin cloudbase
`);
    return;
  }

  const targets = args.plugin ? [args.plugin] : PLUGINS;
  for (const name of targets) {
    if (!PLUGINS.includes(name)) {
      throw new Error(`Unknown plugin "${name}" (expected: ${PLUGINS.join(", ")})`);
    }
  }

  for (const name of targets) packPlugin(name, args.outDir);

  console.log("");
  console.log("Install paths for the packed zip:");
  console.log("  claude --plugin-url <zip-url>      load once, per session");
  console.log("  claude --plugin-dir ./<zip>        load from a local archive");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
