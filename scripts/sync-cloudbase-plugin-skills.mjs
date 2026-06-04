#!/usr/bin/env node

import childProcess from "child_process";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const DEFAULT_REPO = "https://github.com/TencentCloudBase/skills.git";
const DEFAULT_REF = "main";
const DEFAULT_TARGET_DIR = path.join(ROOT_DIR, "plugin", "cloudbase", "skills");
const DEFAULT_METADATA_PATH = path.join(ROOT_DIR, "plugin", "cloudbase", ".sync-metadata.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rmDir(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function shouldSkip(name) {
  return name === ".DS_Store" || name === ".gitkeep";
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

function sha256(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function exec(cmd, opts) {
  return childProcess.execSync(cmd, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    ...opts,
  });
}

/**
 * Clone upstream skills repo and return the temp directory path.
 */
function cloneUpstream(repo, ref) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cloudbase-plugin-skills-"));
  console.log(`Cloning ${repo}#${ref} into ${tmpDir}...`);
  exec(`git clone --depth 1 --branch ${ref} ${repo} ${tmpDir}`, {
    timeout: 120_000,
  });
  return tmpDir;
}

/**
 * Get the commit SHA of the cloned repo.
 */
function getCommitSha(repoDir) {
  return exec("git rev-parse HEAD", { cwd: repoDir }).trim();
}

/**
 * Validate that every skill directory has a SKILL.md file.
 */
function validateSkillDirs(skillsDir) {
  if (!fs.existsSync(skillsDir)) {
    throw new Error(`Skills directory not found in upstream: ${skillsDir}`);
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory() && !shouldSkip(e.name));

  if (dirs.length === 0) {
    throw new Error(`No skill directories found in: ${skillsDir}`);
  }

  const missing = [];
  for (const dir of dirs) {
    const skillMdPath = path.join(skillsDir, dir.name, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) {
      missing.push(dir.name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Skills missing SKILL.md: ${missing.join(", ")}`,
    );
  }

  return dirs.map((d) => d.name).sort();
}

/**
 * Copy skills from upstream clone to target directory.
 */
function copySkills(sourceSkillsDir, targetDir) {
  // Clear target directory (preserving .gitkeep)
  if (fs.existsSync(targetDir)) {
    for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
      if (entry.name === ".gitkeep") {
        continue;
      }
      const p = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        rmDir(p);
      } else {
        fs.unlinkSync(p);
      }
    }
  }

  ensureDir(targetDir);

  const copyDir = (src, dest) => {
    ensureDir(dest);

    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (shouldSkip(entry.name)) {
        continue;
      }

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        ensureDir(path.dirname(destPath));
        fs.copyFileSync(srcPath, destPath);
      }
    }
  };

  copyDir(sourceSkillsDir, targetDir);
}

/**
 * Write sync metadata file.
 */
function writeMetadata(metadataPath, { repo, ref, commit, syncedAt, skillCount }) {
  const metadata = {
    repo,
    ref,
    commit,
    syncedAt,
    skillCount,
  };
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");
  return metadata;
}

/**
 * Sync: clone upstream, validate, copy skills, write metadata.
 */
export function syncCloudbasePluginSkills(options = {}) {
  const repo = options.repo || DEFAULT_REPO;
  const ref = options.ref || DEFAULT_REF;
  const targetDir = options.targetDir || DEFAULT_TARGET_DIR;
  const metadataPath = options.metadataPath || DEFAULT_METADATA_PATH;

  let tmpDir;
  try {
    tmpDir = cloneUpstream(repo, ref);
    const commit = getCommitSha(tmpDir);
    const upstreamSkillsDir = path.join(tmpDir, "skills");
    const skillNames = validateSkillDirs(upstreamSkillsDir);

    copySkills(upstreamSkillsDir, targetDir);

    const metadata = writeMetadata(metadataPath, {
      repo,
      ref,
      commit,
      syncedAt: new Date().toISOString(),
      skillCount: skillNames.length,
    });

    const fileCount = collectFiles(targetDir).length;

    return {
      repo,
      ref,
      commit,
      targetDir,
      metadataPath,
      skillNames,
      fileCount,
      metadata,
    };
  } finally {
    if (tmpDir) {
      rmDir(tmpDir);
    }
  }
}

/**
 * Check: clone upstream, compare against current target, report drift.
 */
export function checkCloudbasePluginSkills(options = {}) {
  const repo = options.repo || DEFAULT_REPO;
  const ref = options.ref || DEFAULT_REF;
  const targetDir = options.targetDir || DEFAULT_TARGET_DIR;

  let tmpDir;
  try {
    tmpDir = cloneUpstream(repo, ref);
    const commit = getCommitSha(tmpDir);
    const upstreamSkillsDir = path.join(tmpDir, "skills");
    validateSkillDirs(upstreamSkillsDir);

    const expectedFiles = collectFiles(upstreamSkillsDir);
    const actualFiles = collectFiles(targetDir);
    const expectedSet = new Set(expectedFiles);
    const actualSet = new Set(actualFiles);

    const missingFiles = expectedFiles.filter((f) => !actualSet.has(f));
    const extraFiles = actualFiles.filter((f) => !expectedSet.has(f));
    const changedFiles = expectedFiles.filter((f) => {
      if (!actualSet.has(f)) {
        return false;
      }
      return (
        sha256(path.join(upstreamSkillsDir, f)) !==
        sha256(path.join(targetDir, f))
      );
    });

    return {
      repo,
      ref,
      upstreamCommit: commit,
      targetDir,
      expectedFileCount: expectedFiles.length,
      actualFileCount: actualFiles.length,
      missingFiles,
      extraFiles,
      changedFiles,
      hasDiff:
        missingFiles.length > 0 ||
        extraFiles.length > 0 ||
        changedFiles.length > 0,
    };
  } finally {
    if (tmpDir) {
      rmDir(tmpDir);
    }
  }
}

function printCheck(result) {
  console.log("CloudBase plugin skills check");
  console.log("==============================");
  console.log(`Upstream: ${result.repo}#${result.ref}`);
  console.log(`Upstream commit: ${result.upstreamCommit}`);
  console.log(`Target: ${result.targetDir}`);
  console.log(`Expected files: ${result.expectedFileCount}`);
  console.log(`Actual files: ${result.actualFileCount}`);
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
      console.log(`  - ${item}`);
    }
    if (items.length > 100) {
      console.log(`  - ... and ${items.length - 100} more`);
    }
  }
}

function parseArgs(argv) {
  const args = process.argv.slice(2);
  const options = { checkOnly: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--check":
        options.checkOnly = true;
        break;
      case "--repo":
        options.repo = args[++i];
        break;
      case "--ref":
        options.ref = args[++i];
        break;
      case "--help":
      case "-h":
        console.log(`Usage: node scripts/sync-cloudbase-plugin-skills.mjs [options]

Options:
  --check          Check for drift between upstream and local skills
  --repo <url>     Git repository URL (default: ${DEFAULT_REPO})
  --ref <branch>   Git branch or tag (default: ${DEFAULT_REF})
  --help, -h       Show this help message
`);
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        process.exit(1);
    }
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv);

  if (options.checkOnly) {
    const result = checkCloudbasePluginSkills({
      repo: options.repo,
      ref: options.ref,
    });
    printCheck(result);
    process.exit(result.hasDiff ? 1 : 0);
  }

  const result = syncCloudbasePluginSkills({
    repo: options.repo,
    ref: options.ref,
  });

  console.log("CloudBase plugin skills sync complete");
  console.log("======================================");
  console.log(`Upstream: ${result.repo}#${result.ref} (${result.commit})`);
  console.log(`Target: ${result.targetDir}`);
  console.log(`Skills synced: ${result.skillNames.length}`);
  console.log(`Files copied: ${result.fileCount}`);
  console.log(`Metadata: ${result.metadataPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
