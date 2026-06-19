#!/usr/bin/env node

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const DEFAULT_SOURCE_DIR = path.join(
  ROOT_DIR,
  "config",
  "source",
  "skills",
);
const DEFAULT_TARGET_DIR = path.join(ROOT_DIR, "config", ".claude", "skills");

function shouldSkip(name) {
  return name === ".DS_Store";
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDir(sourceDir, targetDir) {
  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (shouldSkip(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath);
      continue;
    }

    if (entry.isFile()) {
      ensureDir(path.dirname(targetPath));
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function getSkillNames(sourceDir) {
  return fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !shouldSkip(entry.name))
    .filter((entry) =>
      fs.existsSync(path.join(sourceDir, entry.name, "SKILL.md")),
    )
    .map((entry) => entry.name)
    .sort();
}

function buildMirror(sourceDir, outputDir) {
  ensureDir(outputDir);
  const skillNames = getSkillNames(sourceDir);

  for (const skillName of skillNames) {
    copyDir(path.join(sourceDir, skillName), path.join(outputDir, skillName));
  }

  return skillNames;
}

function sha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function collectFiles(rootDir) {
  const files = [];

  const walk = (relativePath = "") => {
    const fullPath = path.join(rootDir, relativePath);
    if (!fs.existsSync(fullPath)) {
      return;
    }

    const stats = fs.statSync(fullPath);
    if (stats.isFile()) {
      files.push(relativePath);
      return;
    }

    for (const entry of fs.readdirSync(fullPath, { withFileTypes: true })) {
      if (shouldSkip(entry.name)) {
        continue;
      }

      const nextRelative = relativePath
        ? path.join(relativePath, entry.name)
        : entry.name;

      if (entry.isDirectory()) {
        walk(nextRelative);
      } else if (entry.isFile()) {
        files.push(nextRelative);
      }
    }
  };

  walk();
  return files.sort();
}

export function checkClaudeSkillsMirror(options = {}) {
  const sourceDir = options.sourceDir || DEFAULT_SOURCE_DIR;
  const targetDir = options.targetDir || DEFAULT_TARGET_DIR;
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "cloudbase-claude-skills-mirror-"),
  );

  try {
    const expectedDir = path.join(tempDir, "expected");
    const skillNames = buildMirror(sourceDir, expectedDir);
    const expectedFiles = collectFiles(expectedDir);
    const actualFiles = collectFiles(targetDir);
    const expectedSet = new Set(expectedFiles);
    const actualSet = new Set(actualFiles);

    const missingFiles = expectedFiles.filter((file) => !actualSet.has(file));
    const extraFiles = actualFiles.filter((file) => !expectedSet.has(file));
    const changedFiles = expectedFiles.filter((file) => {
      if (!actualSet.has(file)) {
        return false;
      }

      return (
        sha256(path.join(expectedDir, file)) !== sha256(path.join(targetDir, file))
      );
    });

    return {
      sourceDir,
      targetDir,
      skillNames,
      missingFiles,
      extraFiles,
      changedFiles,
      hasDiff:
        missingFiles.length > 0 ||
        extraFiles.length > 0 ||
        changedFiles.length > 0,
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function syncClaudeSkillsMirror(options = {}) {
  const sourceDir = options.sourceDir || DEFAULT_SOURCE_DIR;
  const targetDir = options.targetDir || DEFAULT_TARGET_DIR;

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Skills source directory not found: ${sourceDir}`);
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  ensureDir(targetDir);

  const skillNames = buildMirror(sourceDir, targetDir);

  return {
    sourceDir,
    targetDir,
    skillNames,
    fileCount: collectFiles(targetDir).length,
  };
}

function printCheck(result) {
  console.log("Claude skills mirror check");
  console.log("=========================");
  console.log(`Source: ${result.sourceDir}`);
  console.log(`Target: ${result.targetDir}`);
  console.log(`Skills: ${result.skillNames.length}`);
  console.log(`Has diff: ${result.hasDiff ? "YES" : "NO"}`);

  const sections = [
    ["Missing files", result.missingFiles],
    ["Extra files", result.extraFiles],
    ["Changed files", result.changedFiles],
  ];

  for (const [title, items] of sections) {
    if (items.length === 0) {
      continue;
    }
    console.log(`\n${title}: ${items.length}`);
    for (const item of items.slice(0, 100)) {
      console.log(`- ${item}`);
    }
    if (items.length > 100) {
      console.log(`- ... and ${items.length - 100} more`);
    }
  }
}

function main() {
  const checkOnly = process.argv.includes("--check");

  if (checkOnly) {
    const result = checkClaudeSkillsMirror();
    printCheck(result);
    if (result.hasDiff) {
      process.exit(1);
    }
    return;
  }

  const result = syncClaudeSkillsMirror();
  console.log(`✅ Synced Claude skills mirror: ${result.targetDir}`);
  console.log(`📦 Skills mirrored: ${result.skillNames.length}`);
  console.log(`📄 Files copied: ${result.fileCount}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
