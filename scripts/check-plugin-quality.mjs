#!/usr/bin/env node

/**
 * Quality gate for marketplace submission readiness.
 *
 * Checks Claude / Cursor / Codex packaging against published docs:
 * - Claude: https://code.claude.com/docs/en/plugins
 * - Cursor: https://cursor.com/docs/reference/plugins
 * - Codex:  https://developers.openai.com/codex/plugins/build
 * - Grok:   https://github.com/xai-org/plugin-marketplace
 *
 * Usage:
 *   node scripts/check-plugin-quality.mjs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PLUGINS = ["cloudbase", "cloudbase-sites"];

/** @type {string[]} */
const errors = [];
/** @type {string[]} */
const warnings = [];

function fail(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function readJson(rel) {
  const abs = path.join(ROOT_DIR, rel);
  if (!fs.existsSync(abs)) {
    fail(`Missing ${rel}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (err) {
    fail(`Invalid JSON ${rel}: ${err.message}`);
    return null;
  }
}

function parseFrontmatter(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return null;
  const fm = text.slice(3, end);
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

function kebabOk(name) {
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(name);
}

function checkClaude() {
  console.log("## Claude Code");
  for (const name of PLUGINS) {
    const pluginRoot = path.join("plugin", name);
    const manifestRel = path.join(pluginRoot, ".claude-plugin", "plugin.json");
    const cm = readJson(manifestRel);
    if (!cm) continue;
    if (!cm.name || !kebabOk(cm.name)) fail(`${manifestRel}: invalid name`);
    if (!cm.description) fail(`${manifestRel}: missing description`);
    if (!cm.version) warn(`${manifestRel}: missing version`);
    for (const p of [...(cm.commands || []), ...(cm.agents || [])]) {
      const abs = path.join(ROOT_DIR, pluginRoot, p);
      if (!fs.existsSync(abs)) fail(`${manifestRel}: missing path ${p}`);
    }
  }

  let hasClaudeCli = true;
  try {
    execSync("claude --version", {
      cwd: ROOT_DIR,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 10_000,
    });
  } catch {
    hasClaudeCli = false;
    warn(
      "claude CLI not installed in this environment — skipping `claude plugin validate` (run locally before submit)",
    );
  }
  if (hasClaudeCli) {
    for (const name of PLUGINS) {
      const pluginRoot = path.join("plugin", name);
      try {
        execSync(`claude plugin validate ${pluginRoot}`, {
          cwd: ROOT_DIR,
          stdio: ["pipe", "pipe", "pipe"],
          timeout: 60_000,
        });
        console.log(`✓ claude plugin validate ${pluginRoot}`);
      } catch (err) {
        fail(`claude plugin validate failed for ${pluginRoot}: ${err.message}`);
      }
    }
  }

  const marketplace = readJson(".claude-plugin/marketplace.json");
  if (marketplace) {
    if (marketplace.name !== "tencent-cloudbase") {
      fail(".claude-plugin/marketplace.json unexpected name");
    }
    for (const name of PLUGINS) {
      const entry = (marketplace.plugins || []).find((p) => p.name === name);
      if (!entry) fail(`.claude-plugin/marketplace.json missing ${name}`);
      // Client marketplaces point at the Codex variant: it is the same package
      // minus the Agent Plugins root manifest, which Codex treats as a signal to
      // disable plugin hooks. The portable package stays at ./plugin/<name>.
      else if (entry.source !== `./plugin/${name}-codex`) {
        fail(`.claude-plugin/marketplace.json ${name} source mismatch`);
      }
    }
    console.log("✓ .claude-plugin/marketplace.json");
  }
}

function checkCursor() {
  console.log("\n## Cursor Marketplace");
  const marketplace = readJson(".cursor-plugin/marketplace.json");
  if (marketplace) {
    if (!marketplace.name || !kebabOk(marketplace.name)) {
      fail(".cursor-plugin/marketplace.json invalid name");
    }
    if (!marketplace.owner?.name) fail(".cursor-plugin/marketplace.json missing owner.name");
    if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0) {
      fail(".cursor-plugin/marketplace.json missing plugins");
    }
    for (const entry of marketplace.plugins || []) {
      if (!entry.name || !kebabOk(entry.name)) {
        fail(`Cursor marketplace entry invalid name: ${entry.name}`);
      }
      const src = typeof entry.source === "string" ? entry.source : entry.source?.path;
      if (!src) {
        fail(`Cursor marketplace entry ${entry.name} missing source`);
        continue;
      }
      const pluginJson = path.join(ROOT_DIR, src, ".cursor-plugin", "plugin.json");
      if (!fs.existsSync(pluginJson)) {
        fail(`Cursor marketplace ${entry.name}: missing ${src}/.cursor-plugin/plugin.json`);
      }
      if (!fs.existsSync(path.join(ROOT_DIR, src, "mcp.json"))) {
        fail(`Cursor marketplace ${entry.name}: missing ${src}/mcp.json`);
      }
      if (!fs.existsSync(path.join(ROOT_DIR, src, "README.md"))) {
        fail(`Cursor marketplace ${entry.name}: missing README.md`);
      }
    }
    console.log("✓ .cursor-plugin/marketplace.json resolution");
  }

  for (const name of PLUGINS) {
    const pluginRoot = path.join(ROOT_DIR, "plugin", name);
    const manifestRel = path.join("plugin", name, ".cursor-plugin", "plugin.json");
    const cm = readJson(manifestRel);
    if (!cm) continue;
    if (!cm.name || !kebabOk(cm.name)) fail(`${manifestRel}: invalid name`);
    if (!cm.description) fail(`${manifestRel}: missing description`);
    if (!cm.logo) fail(`${manifestRel}: missing logo (required for quality gate)`);
    else {
      const logoAbs = path.join(pluginRoot, cm.logo.replace(/^\.\//, ""));
      if (!fs.existsSync(logoAbs)) fail(`${manifestRel}: logo file missing (${cm.logo})`);
    }
    // Prefer official CloudBase brand mark (not unrelated icons)
    const brandSvg = path.join(pluginRoot, "assets", "logo.svg");
    const brandPng = path.join(pluginRoot, "assets", "logo.png");
    const brandDark = path.join(pluginRoot, "assets", "logo-dark.png");
    if (!fs.existsSync(brandPng) && !fs.existsSync(brandSvg) && !fs.existsSync(brandDark)) {
      fail(`plugin/${name}: missing assets/logo.png (or logo.svg / logo-dark.png)`);
    }

    // Skills frontmatter
    const skillsDir = path.join(pluginRoot, "skills");
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillMd = path.join(skillsDir, entry.name, "SKILL.md");
        if (!fs.existsSync(skillMd)) {
          fail(`Cursor skill missing SKILL.md: plugin/${name}/skills/${entry.name}`);
          continue;
        }
        const fm = parseFrontmatter(skillMd);
        if (!fm?.name) fail(`Cursor skill missing name frontmatter: ${skillMd}`);
        if (!fm?.description) fail(`Cursor skill missing description: ${skillMd}`);
      }
    }

    // Agents / commands frontmatter
    for (const kind of ["agents", "commands"]) {
      const dir = path.join(pluginRoot, kind);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        if (!/\.(md|mdc|markdown|txt)$/.test(file)) continue;
        if (file.startsWith("_")) {
          fail(`Cursor ${kind}/ has underscore file that would be auto-discovered: ${file} (move out of ${kind}/)`);
          continue;
        }
        const abs = path.join(dir, file);
        const fm = parseFrontmatter(abs);
        if (!fm) {
          fail(`Cursor ${kind} missing frontmatter: plugin/${name}/${kind}/${file}`);
          continue;
        }
        if (!fm.name) fail(`Cursor ${kind} missing name: plugin/${name}/${kind}/${file}`);
        if (!fm.description) fail(`Cursor ${kind} missing description: plugin/${name}/${kind}/${file}`);
      }
    }
    console.log(`✓ plugin/${name} Cursor components`);
  }
}

function checkCodex() {
  console.log("\n## Codex / ChatGPT plugins");
  const marketplace = readJson(".agents/plugins/marketplace.json");
  const rootMarketplace = readJson("marketplace.json");
  if (marketplace && rootMarketplace) {
    if (JSON.stringify(marketplace) !== JSON.stringify(rootMarketplace)) {
      fail(".agents/plugins/marketplace.json must match root marketplace.json");
    } else {
      console.log("✓ .agents/plugins/marketplace.json sync");
    }
  }
  if (marketplace) {
    if (!marketplace.interface?.displayName) {
      fail("Codex marketplace missing interface.displayName");
    }
    for (const entry of marketplace.plugins || []) {
      for (const key of ["installation", "authentication"]) {
        if (!entry.policy?.[key]) fail(`Codex marketplace ${entry.name} missing policy.${key}`);
      }
      if (!entry.category) fail(`Codex marketplace ${entry.name} missing category`);
      const srcPath = entry.source?.path;
      if (!srcPath || !srcPath.startsWith("./")) {
        fail(`Codex marketplace ${entry.name} source.path must be ./ prefixed`);
      }
    }
  }

  for (const name of PLUGINS) {
    const pluginRoot = path.join(ROOT_DIR, "plugin", name);
    const manifestRel = path.join("plugin", name, ".codex-plugin", "plugin.json");
    const cm = readJson(manifestRel);
    if (!cm) continue;
    if (!cm.name || !kebabOk(cm.name)) fail(`${manifestRel}: invalid name`);
    if (!cm.interface?.displayName) fail(`${manifestRel}: missing interface.displayName`);
    if (!cm.interface?.shortDescription) fail(`${manifestRel}: missing interface.shortDescription`);
    if (!cm.interface?.longDescription) fail(`${manifestRel}: missing interface.longDescription`);
    if (!cm.interface?.privacyPolicyURL) fail(`${manifestRel}: missing privacyPolicyURL`);
    if (!cm.interface?.termsOfServiceURL) fail(`${manifestRel}: missing termsOfServiceURL`);
    if (!cm.interface?.logo) fail(`${manifestRel}: missing interface.logo`);
    else {
      const logoAbs = path.join(pluginRoot, ".codex-plugin", cm.interface.logo);
      // logo path is relative to plugin root per Codex docs (assets under plugin root)
      const logoFromRoot = path.join(pluginRoot, cm.interface.logo.replace(/^\.\//, ""));
      if (!fs.existsSync(logoFromRoot) && !fs.existsSync(logoAbs)) {
        fail(`${manifestRel}: logo file missing (${cm.interface.logo})`);
      }
    }
    const mcpPath = path.join(pluginRoot, ".mcp.json");
    if (!fs.existsSync(mcpPath)) fail(`plugin/${name}: missing .mcp.json`);
    for (const p of [...(cm.commands || []), ...(cm.agents || [])]) {
      const resolved = path.resolve(path.join(pluginRoot, ".codex-plugin"), p);
      if (!fs.existsSync(resolved)) fail(`${manifestRel}: missing path ${p}`);
    }
    console.log(`✓ plugin/${name} Codex manifest`);
  }

  // Universal directory caveat: local npx MCP is fine for git marketplace,
  // but portal MCP submissions need a public HTTPS MCP URL.
  warn(
    "Codex Universal Plugins Directory (portal): current packaging uses local `npx @cloudbase/cloudbase-mcp` — portal MCP review requires a public production MCP URL + domain verification. Git marketplace / App sparse install remains valid.",
  );
}

function checkGrokReadiness() {
  console.log("\n## Grok Build marketplace");
  // Grok remote sources clone a repo and expect plugin components at the repo root
  // (or vendored local path). Monorepo root is NOT a plugin root.
  warn(
    "Grok remote entry should target TencentCloudBase/cloudbase-plugin (dedicated OPS repo with skills/ + .mcp.json), not the monorepo root. Pin a full 40-char SHA after merge; regenerate plugin-index.json.",
  );
  const dedicatedHasSkill = fs.existsSync(
    path.join(ROOT_DIR, "plugin", "cloudbase", "skills", "cloudbase-platform", "SKILL.md"),
  );
  if (!dedicatedHasSkill) {
    fail("plugin/cloudbase missing cloudbase-platform skill (Grok/Claude content)");
  } else {
    console.log("✓ plugin content present for dedicated-repo sync");
  }
}

function main() {
  console.log("Plugin marketplace quality check");
  console.log("================================\n");

  checkClaude();
  checkCursor();
  checkCodex();
  checkGrokReadiness();

  console.log("\n## Summary");
  if (warnings.length) {
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  }
  if (errors.length) {
    console.error(`\n✗ Failed with ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("\n✓ Quality gate passed (see warnings for portal-only caveats)");
}

main();
