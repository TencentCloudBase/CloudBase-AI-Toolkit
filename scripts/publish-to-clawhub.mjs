#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const AUTO_CHANGELOG_LIMIT = 5;

function parseArgs(argv) {
  let manifestPath = "";
  let dryRun = false;
  let changelog = "";
  let tags = "latest";
  let bump = "minor";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--manifest") {
      manifestPath = path.resolve(argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--changelog") {
      changelog = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (arg === "--tags") {
      tags = argv[index + 1] || tags;
      index += 1;
      continue;
    }

    if (arg === "--bump") {
      bump = argv[index + 1] || bump;
      index += 1;
    }
  }

  if (!manifestPath) {
    throw new Error("缺少必填参数 --manifest / Missing required --manifest argument");
  }

  if (!["patch", "minor", "major"].includes(bump)) {
    throw new Error(
      `不支持的 bump 类型 / Unsupported bump type: ${bump}. Allowed: patch, minor, major`,
    );
  }

  return { manifestPath, dryRun, changelog, tags, bump };
}

function readManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`未找到 manifest 文件 / Manifest file not found: ${manifestPath}`);
  }

  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function resolveGitRoot(manifestPath) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: path.dirname(manifestPath),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return process.cwd();
  }
}

function getRecentCommitLines(gitRoot) {
  try {
    const output = execFileSync(
      "git",
      [
        "log",
        `-${AUTO_CHANGELOG_LIMIT}`,
        "--pretty=format:- %s",
      ],
      {
        cwd: gitRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();

    return output;
  } catch {
    return "";
  }
}

export function buildChangelogText(manualChangelog, gitRoot) {
  const normalizedManual = (manualChangelog || "").trim();
  const recentCommits = getRecentCommitLines(gitRoot);

  if (normalizedManual && recentCommits) {
    return `${normalizedManual}\n\nRecent commits / 最近提交:\n${recentCommits}`;
  }

  if (normalizedManual) {
    return normalizedManual;
  }

  if (recentCommits) {
    return `Recent commits / 最近提交:\n${recentCommits}`;
  }

  return "";
}

export function normalizeClawhubChangelog(changelog) {
  return String(changelog || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" | ");
}

export function buildSyncCommand(target, options) {
  return {
    command: "clawhub",
    args: [
      "sync",
      "--workdir",
      target.artifactRootDir,
      "--dir",
      "skills",
      "--all",
      "--bump",
      options.bump,
      "--changelog",
      normalizeClawhubChangelog(options.changelog),
      "--tags",
      options.tags,
    ],
  };
}

export function publishToClawhub({
  manifestPath,
  dryRun = false,
  changelog = "",
  tags = "latest",
  bump = "minor",
}) {
  const manifest = readManifest(manifestPath);
  const gitRoot = resolveGitRoot(manifestPath);
  const resolvedChangelog = buildChangelogText(changelog, gitRoot);
  const failures = [];
  const results = [];

  if (!dryRun && !process.env.CLAWDHUB_TOKEN) {
    throw new Error("正式发布需要设置 CLAWDHUB_TOKEN / CLAWDHUB_TOKEN is required for non-dry-run publishing");
  }

  for (const target of manifest.targets || []) {
    const publishCommand = buildSyncCommand(target, {
      changelog: resolvedChangelog,
      tags,
      bump,
    });

    console.log(`发布目标 / Publishing target: ${target.targetKey}`);
    console.log(
      `执行命令 / Command: ${publishCommand.command} ${publishCommand.args.join(" ")}`,
    );

    if (dryRun) {
      publishCommand.args.push("--dry-run");
      console.log(
        `Dry run 模式 / Dry-run mode: ${publishCommand.command} ${publishCommand.args.join(" ")}`,
      );
      results.push({
        targetKey: target.targetKey,
        registrySlug: target.registrySlug,
        status: "dry-run",
      });
      continue;
    }

    try {
      execFileSync(publishCommand.command, publishCommand.args, {
        stdio: "inherit",
        env: process.env,
      });

      results.push({
        targetKey: target.targetKey,
        registrySlug: target.registrySlug,
        status: dryRun ? "dry-run" : "published",
      });
    } catch (error) {
      failures.push({
        targetKey: target.targetKey,
        registrySlug: target.registrySlug,
        message: error.message,
      });
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `发布失败 / Failed to publish ${failure.targetKey} (${failure.registrySlug}): ${failure.message}`,
      );
    }

    const error = new Error(
      `发布到 ClawHub 失败 / Failed to publish ${failures.length} target(s) to ClawHub`,
    );
    error.failures = failures;
    throw error;
  }

  return results;
}

function main() {
  const { manifestPath, dryRun, changelog, tags, bump } = parseArgs(
    process.argv.slice(2),
  );
  const results = publishToClawhub({
    manifestPath,
    dryRun,
    changelog,
    tags,
    bump,
  });

  console.log(`已完成 ${results.length} 个 ClawHub 发布操作 / Completed ${results.length} ClawHub publish operation(s).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
