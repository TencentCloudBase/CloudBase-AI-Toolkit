#!/usr/bin/env node
/**
 * Pack the CloudBase entry skill for Qoder / QoderWork Skill marketplace.
 *
 * Layout (required by Qoder):
 *   <skill-name>/
 *   ├── SKILL.md
 *   └── references/   (optional)
 *
 * Zip contains the skill folder at archive root (not flat files).
 *
 * Usage:
 *   npm run pack:qoder-skill
 *   node scripts/pack-qoder-skill.mjs --out /tmp/cloudbase-skill.zip
 *   node scripts/pack-qoder-skill.mjs --skill cloudbase-platform
 *
 * Docs: https://docs.qoder.com/zh/qoderwork/skill-marketplace-guidelines
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SKILLS_DIR = path.join(ROOT, "plugin", "cloudbase", "skills");
const DEFAULT_SKILL = "cloudbase";

function parseArgs(argv = process.argv.slice(2)) {
  const args = { out: null, skill: DEFAULT_SKILL };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--out") {
      args.out = argv[++i];
      if (!args.out) throw new Error("--out requires a path");
    } else if (a === "--skill") {
      args.skill = argv[++i];
      if (!args.skill) throw new Error("--skill requires a skill id");
    } else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function readFrontmatterVersion(skillMd) {
  const text = fs.readFileSync(skillMd, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return "0.0.0";
  const versionLine = match[1].match(/^version:\s*["']?([^\s"']+)/m);
  return versionLine?.[1] || "0.0.0";
}

function assertSkillReady(skillDir) {
  const skillMd = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    throw new Error(`Missing SKILL.md: ${skillMd}`);
  }
  const text = fs.readFileSync(skillMd, "utf8");
  if (!/^---\r?\n[\s\S]*?\r?\n---/.test(text)) {
    throw new Error(`SKILL.md missing YAML frontmatter: ${skillMd}`);
  }
  if (!/^name:\s*\S+/m.test(text.split("---")[1] || "")) {
    throw new Error(`SKILL.md frontmatter missing name: ${skillMd}`);
  }
  if (!/^description:\s*.+/m.test(text.split("---")[1] || "")) {
    throw new Error(`SKILL.md frontmatter missing description: ${skillMd}`);
  }
}

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Pack CloudBase skill for Qoder / QoderWork Skill marketplace.

Usage:
  npm run pack:qoder-skill
  npm run pack:qoder-skill -- --out ./dist/cloudbase-skill.zip
  npm run pack:qoder-skill -- --skill cloudbase-platform
`);
    return;
  }

  const skillId = args.skill;
  const skillDir = path.join(SKILLS_DIR, skillId);
  if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) {
    throw new Error(`Skill not found: ${skillDir}`);
  }

  assertSkillReady(skillDir);

  const version = readFrontmatterVersion(path.join(skillDir, "SKILL.md"));
  // Version-free asset name (same strategy as the Kimi pack): the release tag
  // carries the version, so the zip-url stays stable across releases.
  const outPath =
    args.out ||
    path.join(ROOT, "dist", `${skillId}-skill.zip`);

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) fs.rmSync(outPath);

  // Zip the skill folder so archive root is <skill-id>/SKILL.md
  execFileSync(
    "zip",
    ["-r", outPath, skillId, "-x", "*.DS_Store"],
    { cwd: SKILLS_DIR, stdio: "inherit" },
  );

  const size = fs.statSync(outPath).size;
  console.log("");
  console.log(`Packed: ${outPath}`);
  console.log(`Size:   ${(size / 1024).toFixed(1)} KiB`);
  console.log(`Skill:  ${skillId}@${version}`);
  console.log("");
  console.log("Next:");
  console.log("  1. QoderWork → Extensions → Skills marketplace → submit");
  console.log("  2. Upload this zip (must contain <skill>/SKILL.md)");
  console.log("  Guidelines: https://docs.qoder.com/zh/qoderwork/skill-marketplace-guidelines");
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
