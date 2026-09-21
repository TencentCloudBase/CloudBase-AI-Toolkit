#!/usr/bin/env node
/**
 * Pack the portable Agent Plugins 1.0.0 core for each CloudBase plugin.
 *
 * The archive carries ONLY the portable contract — nothing vendor-specific:
 *   plugin.json   Agent Plugins manifest, at the package root
 *   skills/       Agent Skills (skills/<id>/SKILL.md)
 *   mcp.json      MCP servers with explicit transport types
 *
 * Why a dedicated pack instead of zipping the plugin directory as-is:
 *   - Agent Plugins §5.1 requires the manifest at `plugin.json` in the plugin
 *     root. The repo also ships `.plugin/plugin.json` for the legacy
 *     `npx plugins add` path, but a package carrying both layouts is ambiguous.
 *   - The repo-root `mcp.json` is the *Cursor* MCP config (plain
 *     `command`/`args`, no `$schema`). The Agent Plugins mcp schema is closed:
 *     `$schema` and an explicit `type` per server are required. Pasting a
 *     Cursor/Claude/Codex config and assuming it is portable is explicitly
 *     called out by the spec as wrong, so `mcp.json` is rebuilt here rather
 *     than copied. That keeps the Cursor-facing file untouched.
 *
 * Sibling skills are shipped as-is under skills/ (unlike the Kimi pack, which
 * assembles them into the routing skill's references/) because Agent Skills
 * discovery is a flat scan of skills/<id>/SKILL.md.
 *
 * Output names are version-free — the release tag carries the version, so the
 * zip URL stays stable across releases:
 *   dist/cloudbase-agent-plugin.zip
 *   dist/cloudbase-sites-agent-plugin.zip
 *
 * Usage:
 *   node scripts/pack-agent-plugins.mjs
 *   node scripts/pack-agent-plugins.mjs --out-dir /tmp
 *   node scripts/pack-agent-plugins.mjs --plugin cloudbase
 */

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MCP_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const PLUGIN_SCHEMA_URL = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

const PLUGINS = ["cloudbase", "cloudbase-sites"];

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

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (p) => !p.endsWith(".DS_Store") && !p.endsWith(".gitkeep"),
  });
}

/**
 * Rebuild the repo's MCP config into the Agent Plugins mcp.json shape:
 * canonical `$schema` plus an explicit `type` on every server entry.
 */
function buildPortableMcpConfig(pluginDir) {
  const source = path.join(pluginDir, ".mcp.json");
  if (!fs.existsSync(source)) {
    throw new Error(`Missing MCP config source: ${source}`);
  }
  const src = readJson(source);
  const servers = {};
  for (const [id, cfg] of Object.entries(src.mcpServers || {})) {
    if (!cfg || typeof cfg !== "object") {
      throw new Error(`${source}: mcpServers.${id} must be an object`);
    }
    let entry;
    if (typeof cfg.url === "string") {
      entry = { type: cfg.type === "sse" ? "sse" : "streamable-http", url: cfg.url };
      if (cfg.headers && Object.keys(cfg.headers).length > 0) entry.headers = cfg.headers;
    } else {
      if (typeof cfg.command !== "string" || !cfg.command) {
        throw new Error(`${source}: mcpServers.${id} needs either a command or a url`);
      }
      entry = { type: "stdio", command: cfg.command };
      if (Array.isArray(cfg.args) && cfg.args.length > 0) entry.args = cfg.args;
      // The spec forbids env entries named PLUGIN_ROOT / PLUGIN_DATA.
      if (cfg.env && Object.keys(cfg.env).length > 0) entry.env = cfg.env;
    }
    servers[id] = entry;
  }
  if (Object.keys(servers).length === 0) {
    throw new Error(`${source} declares no MCP servers`);
  }
  return { $schema: MCP_SCHEMA_URL, mcpServers: servers };
}

function assertPortableMcpConfig(config, pluginName) {
  for (const [id, entry] of Object.entries(config.mcpServers)) {
    if (!entry.type) {
      throw new Error(`[${pluginName}] mcpServers.${id} is missing an explicit transport type`);
    }
    if (entry.type === "stdio" && !entry.command) {
      throw new Error(`[${pluginName}] mcpServers.${id} is stdio but has no command`);
    }
  }
  // Pinned MCP versions strand plugin users on a stale tool set until an
  // out-of-band PR unpins them. Every packed manifest must follow @latest.
  const argsJson = JSON.stringify(config.mcpServers);
  if (/@cloudbase\/cloudbase-mcp@\d/.test(argsJson)) {
    throw new Error(
      `[${pluginName}] MCP config pins a version of @cloudbase/cloudbase-mcp; ` +
        "use '@latest' so plugin users always get the current tool set",
    );
  }
}

function assertPortableManifest(manifest, pluginName, manifestPath) {
  if (manifest.$schema !== PLUGIN_SCHEMA_URL) {
    throw new Error(
      `[${pluginName}] ${manifestPath} has $schema ${JSON.stringify(manifest.$schema)}; ` +
        `the Agent Plugins 1.0.0 canonical value is ${PLUGIN_SCHEMA_URL}`,
    );
  }
  if (!manifest.name) {
    throw new Error(`[${pluginName}] ${manifestPath} is missing 'name'`);
  }
  const allowed = new Set([
    "$schema", "name", "version", "description",
    "author", "homepage", "repository", "license", "keywords", "extensions",
  ]);
  const extra = Object.keys(manifest).filter((k) => !allowed.has(k));
  if (extra.length > 0) {
    throw new Error(
      `[${pluginName}] ${manifestPath} has fields outside the closed Agent Plugins schema: ${extra.join(", ")}`,
    );
  }
}

function packPlugin(pluginName, outDir) {
  const pluginDir = path.join(ROOT, "plugin", pluginName);
  const manifestPath = path.join(pluginDir, "plugin.json");
  const skillsDir = path.join(pluginDir, "skills");

  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `Missing ${manifestPath} — run: node scripts/build-open-plugin-spec.mjs`,
    );
  }
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`Missing skills dir: ${skillsDir}`);
  }

  const manifest = readJson(manifestPath);
  assertPortableManifest(manifest, pluginName, manifestPath);

  const mcpConfig = buildPortableMcpConfig(pluginDir);
  assertPortableMcpConfig(mcpConfig, pluginName);

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-plugin-pack-"));
  const outPath = path.join(outDir, `${pluginName}-agent-plugin.zip`);

  try {
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.copyFileSync(manifestPath, path.join(stagingDir, "plugin.json"));
    copyDir(skillsDir, path.join(stagingDir, "skills"));
    fs.writeFileSync(
      path.join(stagingDir, "mcp.json"),
      JSON.stringify(mcpConfig, null, 2) + "\n",
    );

    const skillCount = fs
      .readdirSync(path.join(stagingDir, "skills"), { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(stagingDir, "skills", e.name, "SKILL.md")))
      .length;

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
    console.log(`Skills: ${skillCount} under skills/<id>/SKILL.md`);
    return outPath;
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Pack the portable Agent Plugins 1.0.0 core for CloudBase plugins.

Archive root contains exactly: plugin.json + skills/ + mcp.json

Usage:
  node scripts/pack-agent-plugins.mjs
  node scripts/pack-agent-plugins.mjs --out-dir ./dist --plugin cloudbase
`);
    return;
  }

  // Root plugin.json and mcp.json are generated artifacts — keep them fresh.
  execFileSync("node", ["scripts/build-open-plugin-spec.mjs"], { cwd: ROOT, stdio: "inherit" });

  const targets = args.plugin ? [args.plugin] : PLUGINS;
  for (const name of targets) {
    if (!PLUGINS.includes(name)) {
      throw new Error(`Unknown plugin "${name}" (expected: ${PLUGINS.join(", ")})`);
    }
  }

  for (const name of targets) packPlugin(name, args.outDir);

  console.log("");
  console.log("Next: attach these zips to the GitHub release (CI does this on release: published).");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
