#!/usr/bin/env node
/**
 * Build the domestic `cloudbase` WorkBuddy connector package.
 *
 * Usage:
 *   node scripts/build-connector-cloudbase.mjs
 *
 * Sibling of scripts/build-connector-cloudbase-intl.mjs. Same content source, same
 * aggregator — the only real difference is that this connector targets the China site, so
 * there is no host rewriting, no region surgery, and it ships a `cli.json` (the MCP server
 * declares `preAuth: "cli"`, so WorkBuddy drives `tcb` for install / login / status).
 *
 * What it does, in order:
 *   1. Aggregates `config/source/**` into one skill via scripts/build-allinone-skill.ts.
 *   2. Copies the aggregate into connectors/cloudbase/skills/.
 *   3. Restores a per-skill `LICENSE.md` next to every bundled SKILL.md. The all-in-one
 *      builder deliberately drops the 35 duplicate LICENSE files to keep its own bundle
 *      small (see build-allinone-skill.ts), but the WorkBuddy connector review reads the
 *      LICENSE sitting beside each skill entry — shipping the bundle without them is a
 *      litmus for "missing license" rejections.
 *   4. Validates the package (meta fields, single stdio server, runtime/env/preAuth,
 *      registry and timeout values, cli.json commands, no secrets).
 *   5. Zips the submittable files into dist/cloudbase-connector.zip.
 *
 * skills/ is generated output — never hand-edit it; change config/source/** instead.
 *
 * Version lives in connector-meta.json. Submission requires it to advance on every content
 * change; scripts/bump-connector-versions.mjs patches it on main after a rebuild.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONNECTOR_DIR = path.join(ROOT, "connectors", "cloudbase");
const SKILLS_DIR = path.join(CONNECTOR_DIR, "skills");
const DIST_DIR = path.join(ROOT, "dist");

const META_FILE = path.join(CONNECTOR_DIR, "connector-meta.json");
const MCP_FILE = path.join(CONNECTOR_DIR, "mcp.json");
const CLI_FILE = path.join(CONNECTOR_DIR, "cli.json");
const ICON_FILE = path.join(CONNECTOR_DIR, "icon.svg");

const SOURCE = "cloudbase";
/** Fields that only exist from WorkBuddy 5.0.0 on. `minWorkbuddyVersion` must cover them. */
const MIN_WORKBUDDY_VERSION = "5.0.0";

/** Files that go into the reviewable submission package. SUBMISSION.md stays out. */
const PACKAGE_ENTRIES = [
  "connector-meta.json",
  "mcp.json",
  "cli.json",
  "icon.svg",
  "skills",
];

// Marketplace-side fields. Not part of connector-meta.json (the documented meta field list
// has neither `id` nor `visible_in`), so they cannot ride along in the zip. Echoed on every
// build so the values to register by hand cannot drift out of sight.
const MARKETPLACE_FIELDS = [
  'id         = "cloudbase"',
  'visible_in = ["internal", "iOA", "cloudhosted", "selfhosted"]',
];

const PLATFORM_KEYS = ["darwin", "linux", "win32"];

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function parseJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fail(`${path.relative(ROOT, file)} is not valid JSON: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Aggregate the skill from config/source/** using the existing toolkit builder
// ---------------------------------------------------------------------------
function buildAggregateSkill() {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "cloudbase-skill-"));
  console.log("1/5  Aggregating skill from config/source/** …");
  execFileSync(
    path.join(ROOT, "node_modules", ".bin", "tsx"),
    [path.join(ROOT, "scripts", "build-allinone-skill.ts"), "--dir", staging],
    { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] },
  );
  const produced = path.join(staging, "cloudbase");
  if (!fs.existsSync(path.join(produced, "SKILL.md"))) {
    fail(`build-allinone-skill.ts did not produce ${produced}/SKILL.md`);
  }
  return { staging, produced };
}

// ---------------------------------------------------------------------------
// 2. Restore the per-skill LICENSE.md the all-in-one builder strips
// ---------------------------------------------------------------------------
function restorePerSkillLicenses() {
  const bundleLicense = path.join(SKILLS_DIR, "LICENSE.md");
  if (!fs.existsSync(bundleLicense)) {
    fail("skills/LICENSE.md is missing — the aggregator should have written it");
  }

  const entries = walk(path.join(SKILLS_DIR, "references")).filter((file) =>
    /(^|\/)(SKILL|skill)\.md$/.test(file),
  );
  let added = 0;
  for (const entry of entries) {
    const dir = path.dirname(entry);
    const hasLicense = fs
      .readdirSync(dir)
      .some((name) => /^licen[cs]e(\.(md|txt))?$/i.test(name));
    if (hasLicense) continue;
    fs.copyFileSync(bundleLicense, path.join(dir, "LICENSE.md"));
    added += 1;
  }
  console.log(
    `2/5  Restored LICENSE.md next to ${added} skill entr${added === 1 ? "y" : "ies"} ` +
      `(${entries.length} total)`,
  );
  if (added === 0) {
    console.log("     Nothing to restore — the aggregate already carried per-skill licenses");
  }
}

// ---------------------------------------------------------------------------
// 3. Validate the package
// ---------------------------------------------------------------------------
function validate() {
  console.log("3/5  Validating …");
  const meta = parseJson(META_FILE);
  const mcp = parseJson(MCP_FILE);
  const cli = parseJson(CLI_FILE);

  for (const key of [
    "name",
    "name_en",
    "description",
    "description_zh",
    "description_en",
    "source",
    "examples_zh",
    "examples_en",
  ]) {
    const value = meta[key];
    if (!value || (Array.isArray(value) && value.length === 0)) {
      fail(`connector-meta.json is missing required field "${key}"`);
    }
  }
  if (meta.source !== SOURCE) {
    fail(`connector-meta.json source must be "${SOURCE}", found "${meta.source}"`);
  }
  if (meta.type && meta.type !== "mcp") {
    fail(`connector-meta.json type must be "mcp" (cli.json only serves preAuth), found "${meta.type}"`);
  }
  if (meta.auth_mode) {
    fail("connector-meta.json must not set auth_mode — this connector pre-authenticates through the CLI");
  }
  if (!meta.version) fail("connector-meta.json must carry the submission version");
  if (meta.minWorkbuddyVersion !== MIN_WORKBUDDY_VERSION) {
    fail(
      `connector-meta.json minWorkbuddyVersion must be "${MIN_WORKBUDDY_VERSION}" — ` +
        `runtime/env/npmRegistries/preAuth are 5.0.0 fields, found "${meta.minWorkbuddyVersion}"`,
    );
  }
  for (const key of ["examples_zh", "examples_en"]) {
    if (meta[key].length < 2 || meta[key].length > 5) {
      fail(`${key} must hold 2–5 examples, found ${meta[key].length}`);
    }
  }

  const servers = Object.keys(mcp.mcpServers ?? {});
  if (servers.length !== 1) {
    fail(`mcp.json must configure exactly one server, found ${servers.length}`);
  }
  const server = mcp.mcpServers[servers[0]];
  if (server.command !== "npx") {
    fail(`mcp.json server command must be "npx", found "${server.command}"`);
  }
  if (!Array.isArray(server.args) || !server.args.some((arg) => arg.includes("@cloudbase/cloudbase-mcp"))) {
    fail("mcp.json args must install @cloudbase/cloudbase-mcp");
  }
  if (server.runtime?.type !== "node") {
    fail('mcp.json must declare runtime.type "node" — npmRegistries only applies to it');
  }
  if (mcp.preAuth !== "cli") {
    fail('mcp.json must set preAuth "cli" — this connector authenticates through tcb');
  }
  const registries = server.npmRegistries ?? [];
  if (!Array.isArray(registries) || registries.length === 0) {
    fail("mcp.json must declare npmRegistries (array) so first-run npx install has a mirror");
  }
  for (const registry of registries) {
    if (!/^https:\/\//.test(registry)) fail(`npmRegistries entry must be HTTPS, found "${registry}"`);
  }
  if (!Number.isFinite(server.timeout) || server.timeout <= 30000) {
    fail(
      "mcp.json must raise timeout above the 30000 ms default — the first npx run downloads " +
        "the whole MCP package before the handshake",
    );
  }
  const env = server.env ?? {};
  if (!env.CLOUDBASE_MCP_CLIENT) {
    fail("mcp.json env must carry CLOUDBASE_MCP_CLIENT so calls are attributable to WorkBuddy");
  }
  if (!env.INTEGRATION_IDE) {
    fail("mcp.json env must carry INTEGRATION_IDE");
  }

  for (const key of ["init", "auth", "status", "unAuth"]) {
    const block = cli[key];
    if (!block) fail(`cli.json is missing "${key}"`);
    for (const platform of PLATFORM_KEYS) {
      if (!block[platform]) fail(`cli.json ${key} is missing the ${platform} command`);
    }
  }
  if (!cli.versionCheck?.minVersion) fail("cli.json must declare versionCheck.minVersion");
  if (!cli.env?.TCB_CLI_SOURCE) {
    fail("cli.json env must set TCB_CLI_SOURCE so CLI calls report their source");
  }
  const cliRegistries = cli.npmRegistries ?? [];
  if (!Array.isArray(cliRegistries) || cliRegistries.length === 0) {
    fail("cli.json must declare npmRegistries (array) for the global install");
  }

  if (!fs.existsSync(ICON_FILE)) fail("icon.svg is missing");
  if (!fs.existsSync(path.join(SKILLS_DIR, "SKILL.md"))) fail("skills/SKILL.md is missing");

  const MISSING_LICENSE = [];
  for (const file of walk(path.join(SKILLS_DIR, "references"))) {
    if (!/(^|\/)(SKILL|skill)\.md$/.test(file)) continue;
    const dir = path.dirname(file);
    if (!fs.readdirSync(dir).some((name) => /^licen[cs]e(\.(md|txt))?$/i.test(name))) {
      MISSING_LICENSE.push(path.relative(SKILLS_DIR, dir));
    }
  }
  if (MISSING_LICENSE.length > 0) {
    fail(
      `skill entries without a neighbouring LICENSE file: ${MISSING_LICENSE.join(", ")}. ` +
        "WorkBuddy review reads that file, not the frontmatter",
    );
  }

  const SECRET_PATTERNS = [
    /AKID[A-Za-z0-9]{12,}/,
    /secret(?:id|key)\s*[:=]\s*["'][A-Za-z0-9/+=]{16,}["']/i,
    /X-TencentCloud-SecretId["']?\s*[:=]\s*["']?[A-Za-z0-9]{16,}/i,
  ];
  const secretHits = new Set();
  for (const file of walk(CONNECTOR_DIR)) {
    if (!/\.(json|md|yaml|yml|svg)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) secretHits.add(path.relative(CONNECTOR_DIR, file));
    }
  }
  if (secretHits.size > 0) {
    fail(`possible hardcoded credentials in: ${[...secretHits].join(", ")}`);
  }

  const referenceDirs = fs
    .readdirSync(path.join(SKILLS_DIR, "references"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).length;
  console.log(`     ✓ source=${meta.source} type=mcp, single stdio server, preAuth=cli`);
  console.log(`     ✓ runtime node + ${registries.length} registry mirror(s), timeout ${server.timeout} ms`);
  console.log(`     ✓ env: ${Object.keys(env).join(", ")}`);
  console.log(`     ✓ cli.json: 4 commands × 3 platforms, tcb ≥ ${cli.versionCheck.minVersion}`);
  console.log(`     ✓ ${referenceDirs} bundled skill references, all with a LICENSE file, no secrets`);
  return meta;
}

// ---------------------------------------------------------------------------
// 4. Package the submittable files
// ---------------------------------------------------------------------------
function packageConnector(meta) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
  // Version-free asset name — the version travels inside connector-meta.json, so the
  // download URL stays stable while the package version moves.
  const zipPath = path.join(DIST_DIR, "cloudbase-connector.zip");
  if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
  execFileSync("zip", ["-r", "-X", "-q", zipPath, ...PACKAGE_ENTRIES], { cwd: CONNECTOR_DIR });
  const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
  console.log(`4/5  Packaged ${path.relative(ROOT, zipPath)} (${size} MB)`);
  console.log(`     Contents: ${PACKAGE_ENTRIES.join(", ")} (SUBMISSION.md excluded)`);
  console.log(`     Package version: ${meta.version}`);
  console.log("     Register in the marketplace config at submission time:");
  for (const line of MARKETPLACE_FIELDS) console.log(`       ${line}`);
}

function main() {
  console.log("\n📦 Building the cloudbase connector package (China site)\n");
  const { staging, produced } = buildAggregateSkill();

  fs.rmSync(SKILLS_DIR, { recursive: true, force: true });
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.cpSync(produced, SKILLS_DIR, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });

  restorePerSkillLicenses();
  const meta = validate();
  packageConnector(meta);
  console.log("\n5/5  ✨ Done.\n");
}

main();
