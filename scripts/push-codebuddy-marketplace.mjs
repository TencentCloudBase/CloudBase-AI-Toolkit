#!/usr/bin/env node
/**
 * Sync config/codebuddy-plugin into codebuddy/marketplace plugins/cloudbase
 * and open a CNB pull request.
 *
 * Usage:
 *   node scripts/push-codebuddy-marketplace.mjs
 *   node scripts/push-codebuddy-marketplace.mjs --dry-run
 *
 * Auth:
 *   Uses git credentials for https://cnb.cool (or CNB_TOKEN / CNB_PASSWORD env).
 *   PR API uses CNB_TOKEN or git password from credential helper.
 *
 * Preserves / always ships:
 *   plugins/cloudbase/.codebuddy-plugin/plugin.json
 *   plugins/cloudbase/rules/**          (required — keep rules component)
 *   plugins/cloudbase/skills/cloudbase/**
 */

import { execFileSync, execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "config", "codebuddy-plugin");
const MARKETPLACE_URL = process.env.CODEBUDDY_MARKETPLACE_URL || "https://cnb.cool/codebuddy/marketplace.git";
const STAGING_REMOTE = process.env.CODEBUDDY_STAGING_REMOTE || "https://github.com/binggg/codebuddy-marketplace.git";
const STAGING_MODE = process.env.CODEBUDDY_STAGING_MODE !== "0"; // default: push to personal staging when upstream push 403
const MARKETPLACE_API_REPO = "codebuddy/marketplace";
const API_BASE = process.env.CNB_API_BASE_URL || "https://api.cnb.cool";
const DRY_RUN = process.argv.includes("--dry-run");
const BRANCH = process.env.CODEBUDDY_MARKETPLACE_BRANCH || `sync/cloudbase-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"], ...opts });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function assertSource() {
  const required = [
    path.join(SOURCE, ".codebuddy-plugin", "plugin.json"),
    path.join(SOURCE, "rules", "cloudbase_rules.md"),
    path.join(SOURCE, "skills", "cloudbase", "SKILL.md"),
  ];
  for (const p of required) {
    if (!fs.existsSync(p)) throw new Error(`Missing required source file: ${p}`);
  }
}

function readPluginJson() {
  return JSON.parse(fs.readFileSync(path.join(SOURCE, ".codebuddy-plugin", "plugin.json"), "utf-8"));
}

function resolveCnbToken() {
  if (process.env.CNB_TOKEN) return process.env.CNB_TOKEN;
  if (process.env.CNB_PASSWORD) return process.env.CNB_PASSWORD;
  try {
    const out = execFileSync("git", ["credential", "fill"], {
      input: "protocol=https\nhost=cnb.cool\n\n",
      encoding: "utf-8",
    });
    const line = out.split("\n").find((l) => l.startsWith("password="));
    if (line) return line.slice("password=".length);
  } catch {
    // ignore
  }
  return null;
}

function updateMarketplaceJson(marketplaceJsonPath, plugin) {
  const data = JSON.parse(fs.readFileSync(marketplaceJsonPath, "utf-8"));
  const plugins = Array.isArray(data.plugins) ? data.plugins : [];
  const idx = plugins.findIndex((p) => p?.name === "cloudbase");
  const entry = {
    name: "cloudbase",
    source: "./plugins/cloudbase",
    version: plugin.version || "1.0.0",
    description: plugin.description,
    author: plugin.author || { name: "Tencent CloudBase" },
    homepage: plugin.homepage || {
      url: "https://github.com/TencentCloudBase/CloudBase-AI-Toolkit",
      type: "github",
    },
    license: plugin.license || "MIT",
  };
  if (idx >= 0) plugins[idx] = { ...plugins[idx], ...entry };
  else plugins.push(entry);
  data.plugins = plugins;
  fs.writeFileSync(marketplaceJsonPath, JSON.stringify(data, null, 2) + "\n");
}

function createPull(token, title, body, head, base = "main") {
  const url = `${API_BASE}/${MARKETPLACE_API_REPO}/-/pulls`;
  const payload = JSON.stringify({ title, body, head, base });
  // Prefer curl to avoid fetch redirect quirks on CNB write APIs.
  const result = execFileSync(
    "curl",
    [
      "-sS", "-D", "-", "-o", "/tmp/cnb-pr-body.json",
      "-X", "POST", url,
      "-H", `Authorization: Bearer ${token}`,
      "-H", "Accept: application/vnd.cnb.api+json",
      "-H", "Content-Type: application/json",
      "--data-binary", payload,
    ],
    { encoding: "utf-8" },
  );
  const status = (result.match(/HTTP\/\S+\s+(\d+)/) || [])[1] || "unknown";
  const bodyText = fs.existsSync("/tmp/cnb-pr-body.json")
    ? fs.readFileSync("/tmp/cnb-pr-body.json", "utf-8")
    : "";
  return { status, headers: result, bodyText };
}

function main() {
  assertSource();
  const plugin = readPluginJson();
  console.log(`Source plugin version: ${plugin.version}`);
  console.log(`Rules present: yes (${path.join(SOURCE, "rules", "cloudbase_rules.md")})`);

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "codebuddy-marketplace-"));
  const repoDir = path.join(work, "marketplace");
  console.log(`Clone ${MARKETPLACE_URL} -> ${repoDir}`);
  execFileSync("git", ["clone", "--depth", "1", MARKETPLACE_URL, repoDir], { stdio: "inherit" });

  const target = path.join(repoDir, "plugins", "cloudbase");
  fs.rmSync(target, { recursive: true, force: true });
  copyDir(SOURCE, target);

  // Safety: rules must exist after copy
  const rulesPath = path.join(target, "rules", "cloudbase_rules.md");
  if (!fs.existsSync(rulesPath)) {
    throw new Error("rules/cloudbase_rules.md missing after sync — aborting");
  }

  updateMarketplaceJson(path.join(repoDir, ".codebuddy-plugin", "marketplace.json"), plugin);

  execFileSync("git", ["checkout", "-b", BRANCH], { cwd: repoDir, stdio: "inherit" });
  execFileSync("git", ["add", "plugins/cloudbase", ".codebuddy-plugin/marketplace.json"], {
    cwd: repoDir,
    stdio: "inherit",
  });
  const staged = run("git diff --cached --stat", { cwd: repoDir }).trim();
  console.log(staged || "(no staged changes)");
  if (!staged) {
    console.log("Nothing to sync.");
    return;
  }

  if (DRY_RUN) {
    console.log(`Dry run only. Branch would be: ${BRANCH}`);
    console.log(`Worktree: ${repoDir}`);
    return;
  }

  execFileSync("git", ["config", "user.name", "CloudBase Bot"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "cloudbase-bot@tencent.com"], { cwd: repoDir });
  execFileSync(
    "git",
    ["commit", "-m", "feat(cloudbase): sync CloudBase plugin skills and keep rules"],
    { cwd: repoDir, stdio: "inherit" },
  );
  execFileSync("git", ["push", "-u", "origin", BRANCH], { cwd: repoDir, stdio: "inherit" });

  const token = resolveCnbToken();
  if (!token) {
    console.warn("Pushed branch but no CNB token for PR API. Open PR manually:");
    console.warn(`https://cnb.cool/codebuddy/marketplace/-/compare/main...${BRANCH}`);
    return;
  }

  const title = `feat(cloudbase): sync CloudBase plugin to v${plugin.version}`;
  const body = [
    "## Summary",
    "- Sync `plugins/cloudbase` from TencentCloudBase/CloudBase-AI-Toolkit `config/codebuddy-plugin`",
    "- Keep `rules/cloudbase_rules.md` component",
    "- Refresh all-in-one skill references (renamed skill ids, PG/ops/cli, version metadata)",
    "",
    "## Notes",
    "- Built-in CodeBuddy IDE integration may still need a separate product code update",
    "- Marketplace packaging source of truth: CloudBase-AI-Toolkit `chore/codebuddy_plugin` / sync script",
  ].join("\n");

  const pr = createPull(token, title, body, BRANCH, "main");
  console.log(`PR API status: ${pr.status}`);
  console.log(pr.bodyText.slice(0, 500));
  console.log(`Compare: https://cnb.cool/codebuddy/marketplace/-/compare/main...${BRANCH}`);
  console.log(`Pulls: https://cnb.cool/codebuddy/marketplace/-/pulls`);
}

main();
