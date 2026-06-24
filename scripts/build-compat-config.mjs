#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const SOURCE_DIR = path.join(ROOT_DIR, "config", "source");
const SKILLS_DIR = path.join(SOURCE_DIR, "skills");
const EDITOR_CONFIG_DIR = path.join(SOURCE_DIR, "editor-config");
const COMPAT_GUIDE_FILE = path.join(
  EDITOR_CONFIG_DIR,
  "guides",
  "cloudbase-rules.mdc",
);
const LEGACY_CONFIG_DIR = path.join(ROOT_DIR, "config");
const DEFAULT_OUTPUT_DIR = path.join(ROOT_DIR, ".generated", "compat-config");

const GUIDELINE_TARGETS = [
  ".cursor/rules/cloudbase-rules.mdc",
  ".trae/rules/cloudbase-rules.md",
  ".windsurf/rules/cloudbase-rules.md",
  ".roo/rules/cloudbaase-rules.md",
  ".lingma/rules/cloudbaase-rules.md",
  ".qoder/rules/cloudbase-rules.md",
  ".rules/cloudbase-rules.md",
  ".rules/cloudbase-rules.mdc",
  ".clinerules/cloudbase-rules.mdc",
  ".github/copilot-instructions.md",
  ".comate/rules/cloudbase-rules.mdr",
  ".comate/rules/cloudbaase-rules.mdr",
  ".augment-guidelines",
  "CLAUDE.md",
  ".gemini/GEMINI.md",
  "AGENTS.md",
  ".qwen/QWEN.md",
  "CODEBUDDY.md",
  "IFLOW.md",
];

const IDE_RULE_TARGETS = [
  { dir: ".qoder/rules", convertMdToMdc: false },
  { dir: ".cursor/rules", convertMdToMdc: true },
  { dir: ".agent/rules", convertMdToMdc: false },
  { dir: ".trae/rules", convertMdToMdc: false },
  { dir: ".windsurf/rules", convertMdToMdc: false },
  { dir: ".clinerules", convertMdToMdc: false },
  { dir: ".kiro/steering", convertMdToMdc: false },
];

const MACHINE_TARGETS = [
  { source: "files/root.mcp.json", target: ".mcp.json" },
  { source: "files/cursor.mcp.json", target: ".cursor/mcp.json" },
  { source: "files/roo.mcp.json", target: ".roo/mcp.json" },
  { source: "files/comate.mcp.json", target: ".comate/mcp.json" },
  { source: "files/vscode.mcp.json", target: ".vscode/mcp.json" },
  { source: "files/kiro.mcp.json", target: ".kiro/settings/mcp.json" },
  { source: "files/gemini.settings.json", target: ".gemini/settings.json" },
  { source: "files/qwen.settings.json", target: ".qwen/settings.json" },
  { source: "files/opencode.json", target: ".opencode.json" },
  { source: "files/codex.toml", target: ".codex/config.toml" },
  { source: "files/vscode.settings.json", target: ".vscode/settings.json" },
  { source: "files/aider.mcp.json", target: "mcp.json" },
  { source: "files/iflow.settings.json", target: ".iflow/settings.json" },
];

const PASS_THROUGH_DIRS = ["codebuddy-plugin"];

function shouldSkip(name) {
  return name === ".DS_Store";
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(sourcePath, targetPath) {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDir(sourceDir, targetDir, transformName = (name) => name) {
  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const nextName = transformName(entry.name);
    const targetPath = path.join(targetDir, nextName);

    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath, transformName);
      continue;
    }

    if (entry.isFile()) {
      copyFile(sourcePath, targetPath);
    }
  }
}

function getSkillDirectories() {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !shouldSkip(entry.name))
    .filter((entry) =>
      fs.existsSync(path.join(SKILLS_DIR, entry.name, "SKILL.md")),
    )
    .map((entry) => entry.name)
    .sort();
}

function buildRulesDirectory(outputDir, skillNames) {
  const rulesDir = path.join(outputDir, "rules");
  ensureDir(rulesDir);

  for (const skillName of skillNames) {
    const sourceDir = path.join(SKILLS_DIR, skillName);
    const targetDir = path.join(rulesDir, skillName);

    copyDir(sourceDir, targetDir, (name) => (name === "SKILL.md" ? "rule.md" : name));
  }
}

function buildCodeBuddySkills(outputDir, skillNames) {
  const targetRoot = path.join(outputDir, ".codebuddy", "skills");
  ensureDir(targetRoot);

  for (const skillName of skillNames) {
    copyDir(path.join(SKILLS_DIR, skillName), path.join(targetRoot, skillName));
  }
}

function buildGuidelineTargets(outputDir, guidelineContent) {
  for (const relativeTarget of GUIDELINE_TARGETS) {
    const targetPath = path.join(outputDir, relativeTarget);
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, guidelineContent, "utf8");
  }
}

function buildIdeRuleTargets(outputDir) {
  const rulesSourceDir = path.join(outputDir, "rules");

  for (const { dir, convertMdToMdc } of IDE_RULE_TARGETS) {
    const targetRoot = path.join(outputDir, dir);
    ensureDir(targetRoot);

    const syncRecursive = (sourceDir, targetDir) => {
      for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        if (shouldSkip(entry.name)) {
          continue;
        }

        const sourcePath = path.join(sourceDir, entry.name);
        let targetName = entry.name;
        if (convertMdToMdc && entry.isFile() && entry.name.endsWith(".md")) {
          targetName = entry.name.replace(/\.md$/, ".mdc");
        }
        const targetPath = path.join(targetDir, targetName);

        if (entry.isDirectory()) {
          ensureDir(targetPath);
          syncRecursive(sourcePath, targetPath);
          continue;
        }

        if (entry.isFile()) {
          copyFile(sourcePath, targetPath);
        }
      }
    };

    syncRecursive(rulesSourceDir, targetRoot);
  }
}

function buildMachineTargets(outputDir) {
  for (const { source, target } of MACHINE_TARGETS) {
    copyFile(path.join(EDITOR_CONFIG_DIR, source), path.join(outputDir, target));
  }

  const claudeSource = path.join(EDITOR_CONFIG_DIR, "claude");
  const claudeTarget = path.join(outputDir, ".claude");
  copyDir(claudeSource, claudeTarget);
}

function copyPassThroughDirs(outputDir) {
  for (const dirName of PASS_THROUGH_DIRS) {
    const sourceDir = path.join(LEGACY_CONFIG_DIR, dirName);
    if (!fs.existsSync(sourceDir)) {
      continue;
    }
    copyDir(sourceDir, path.join(outputDir, dirName));
  }
}

export function buildCompatConfig(options = {}) {
  const outputDir = options.outputDir
    ? path.resolve(options.outputDir)
    : DEFAULT_OUTPUT_DIR;

  if (!fs.existsSync(SKILLS_DIR)) {
    throw new Error(`Skills directory not found: ${SKILLS_DIR}`);
  }
  if (!fs.existsSync(COMPAT_GUIDE_FILE)) {
    throw new Error(`Compat guide file not found: ${COMPAT_GUIDE_FILE}`);
  }

  fs.rmSync(outputDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
  ensureDir(outputDir);

  const skillNames = getSkillDirectories();
  const guidelineContent = fs.readFileSync(COMPAT_GUIDE_FILE, "utf8");

  buildRulesDirectory(outputDir, skillNames);
  buildCodeBuddySkills(outputDir, skillNames);
  buildGuidelineTargets(outputDir, guidelineContent);
  buildIdeRuleTargets(outputDir);
  buildMachineTargets(outputDir);
  copyPassThroughDirs(outputDir);

  return {
    outputDir,
    skillCount: skillNames.length,
  };
}

function main() {
  const result = buildCompatConfig();
  console.log(`✅ Built compat config: ${result.outputDir}`);
  console.log(`📦 Skills processed: ${result.skillCount}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
