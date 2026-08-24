#!/usr/bin/env node
/**
 * Pack plugin/cloudbase as a Kimi Code / Kimi Work plugin zip.
 *
 * Self-contained structure — the archive top level contains ONLY what the
 * Kimi manifest declares:
 *   - kimi.plugin.json   (Open Plugin Spec style manifest)
 *   - skills/cloudbase/  (routing skill, self-contained)
 *
 * Sibling skills (cloud-functions, auth-*, etc.) are NOT shipped as separate
 * top-level skills; they are assembled into
 * skills/cloudbase/references/<skill-id>/ — matching the routing skill's
 * activation contract ("Prefer local relative paths:
 * references/<skill-id>/SKILL.md or sibling skill directories") and the same
 * structure already used by the CodeBuddy plugin. Because they are assembled
 * at pack time from plugin/cloudbase/skills/, the references are always in
 * sync with the current source (no stale mirror to maintain).
 *
 * IDE-specific content (agents/, hooks/, commands/, .claude-plugin/,
 * gemini-extension.json, assets/ ...) is excluded.
 *
 * Output name is version-free: dist/cloudbase-kimi.zip (release tag carries
 * the version, so a stable asset name keeps zip-url stable across releases).
 *
 * Usage:
 *   node scripts/pack-kimi-plugin.mjs
 *   node scripts/pack-kimi-plugin.mjs --out /tmp/cloudbase-kimi.zip
 *
 * Release flow (CI): .github/workflows/release-plugin-zips.yml packs this zip
 * on `release: published` and uploads it to the release assets.
 */

import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PLUGIN_DIR = path.join(ROOT, "plugin", "cloudbase");
const SKILLS_DIR = path.join(PLUGIN_DIR, "skills");
const ROUTING_SKILL = "cloudbase";
const MANIFEST_PATH = path.join(PLUGIN_DIR, "kimi.plugin.json");
const DEFAULT_OUT_NAME = "cloudbase-kimi.zip";

function parseArgs(argv = process.argv.slice(2)) {
  const args = { out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--out") {
      args.out = argv[++i];
      if (!args.out) throw new Error("--out requires a path");
    } else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function assertReady() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing required path for Kimi pack: ${MANIFEST_PATH}`);
  }
  const routingDir = path.join(SKILLS_DIR, ROUTING_SKILL);
  if (!fs.existsSync(routingDir)) {
    throw new Error(`Missing routing skill: ${routingDir}`);
  }
}

function copyDir(src, dest) {
  fs.cpSync(src, dest, {
    recursive: true,
    filter: (p) => !p.endsWith(".DS_Store"),
  });
}

function assembleStaging(stagingDir) {
  fs.mkdirSync(stagingDir, { recursive: true });
  copyDir(MANIFEST_PATH, path.join(stagingDir, "kimi.plugin.json"));
  copyDir(path.join(SKILLS_DIR, ROUTING_SKILL), path.join(stagingDir, "skills", ROUTING_SKILL));

  // Assemble sibling skills into routing skill's references/<skill-id>/
  const refsDir = path.join(stagingDir, "skills", ROUTING_SKILL, "references");
  let siblingCount = 0;
  for (const skillId of fs.readdirSync(SKILLS_DIR)) {
    if (skillId === ROUTING_SKILL || skillId.startsWith(".")) continue;
    const src = path.join(SKILLS_DIR, skillId);
    if (!fs.statSync(src).isDirectory()) continue;
    copyDir(src, path.join(refsDir, skillId));
    siblingCount += 1;
  }
  return siblingCount;
}

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Pack CloudBase plugin for Kimi Code / Kimi Work.

Self-contained: only kimi.plugin.json + skills/cloudbase/ at top level;
sibling skills are assembled into skills/cloudbase/references/<skill-id>/.

Usage:
  node scripts/pack-kimi-plugin.mjs
  node scripts/pack-kimi-plugin.mjs --out ./dist/cloudbase-kimi.zip
`);
    return;
  }

  assertReady();

  const outPath = args.out || path.join(ROOT, "dist", DEFAULT_OUT_NAME);
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "kimi-pack-"));

  let siblingCount = 0;
  try {
    siblingCount = assembleStaging(stagingDir);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    if (fs.existsSync(outPath)) fs.rmSync(outPath);

    execFileSync("zip", ["-r", outPath, ".", "-x", "*.DS_Store"], {
      cwd: stagingDir,
      stdio: "inherit",
    });
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  const size = fs.statSync(outPath).size;
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  console.log("");
  console.log(`Packed: ${outPath}`);
  console.log(`Size:   ${(size / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`Name:   ${manifest.name}@${manifest.version}`);
  console.log(`Skills: routing=${ROUTING_SKILL} + ${siblingCount} siblings in references/`);
  console.log("");
  console.log("Next:");
  console.log("  1. Upload this zip to the GitHub release assets");
  console.log("     (CI does this automatically on release: published)");
  console.log("  2. Or install locally: put it under ~/.kimi-code/plugins/managed/<id>/");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
