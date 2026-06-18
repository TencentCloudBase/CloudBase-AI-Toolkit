#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const AUTO_CHANGELOG_LIMIT = 5;
const DEFAULT_API_BASE = "https://api.skillhub.cn";

function parseArgs(argv) {
  let manifestPath = "";
  let dryRun = false;
  let changelog = "";
  let bump = "minor";
  let apiBase = DEFAULT_API_BASE;

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

    if (arg === "--bump") {
      bump = argv[index + 1] || bump;
      index += 1;
      continue;
    }

    if (arg === "--api-base") {
      apiBase = argv[index + 1] || apiBase;
      index += 1;
      continue;
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

  return { manifestPath, dryRun, changelog, bump, apiBase };
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
      ["log", `-${AUTO_CHANGELOG_LIMIT}`, "--pretty=format:- %s"],
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

function buildChangelogText(manualChangelog, gitRoot) {
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

function parseSemver(versionStr) {
  const match = (versionStr || "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

function bumpSemver(versionStr, bumpType) {
  const semver = parseSemver(versionStr);
  if (!semver) {
    // 如果解析失败，从 1.0.0 开始
    return "1.0.0";
  }

  switch (bumpType) {
    case "major":
      return `${semver.major + 1}.0.0`;
    case "minor":
      return `${semver.major}.${semver.minor + 1}.0`;
    case "patch":
      return `${semver.major}.${semver.minor}.${semver.patch + 1}`;
    default:
      return `${semver.major}.${semver.minor + 1}.0`;
  }
}

function readCurrentVersion(skillFile) {
  const content = fs.readFileSync(skillFile, "utf8");
  const versionMatch = content.match(/^version:\s*(.+)$/m);
  return versionMatch ? versionMatch[1].trim() : null;
}

function parseFrontmatter(skillContent) {
  const nameMatch = skillContent.match(/^name:\s*(.+)$/m);
  const descriptionMatch = skillContent.match(/^description:\s*(.+)$/m);
  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    description: descriptionMatch ? descriptionMatch[1].trim() : "",
  };
}

function collectFiles(dirPath, baseDir) {
  const files = [];

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile()) {
        files.push({
          filePath: fullPath,
          relativePath,
        });
      }
    }
  }

  walk(dirPath);
  return files;
}

async function uploadVersionToSkillhub({
  apiBase,
  orgId,
  token,
  slug,
  version,
  changelog,
  displayName,
  summary,
  files,
}) {
  const url = `${apiBase}/api/v1/orgs/${orgId}/skills/${slug}/versions`;

  // 构建 multipart/form-data
  const boundary = `----SkillHubBoundary${Date.now()}`;

  const encoder = new TextEncoder();

  // 构建 payload 部分
  const payload = JSON.stringify({
    version,
    changelog: changelog || "",
    displayName: displayName || undefined,
    summary: summary || undefined,
    securityScan: false,
  });

  const payloadPart = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="payload"',
    "Content-Type: application/json",
    "",
    payload,
  ].join("\r\n");

  // 构建文件部分
  const fileParts = [];
  for (const file of files) {
    const fileContent = fs.readFileSync(file.filePath);
    fileParts.push({
      header: [
        `--${boundary}`,
        `Content-Disposition: form-data; name="files"; filename="${file.relativePath}"`,
        "Content-Type: application/octet-stream",
        "",
      ].join("\r\n"),
      content: fileContent,
    });
  }

  // 结束 boundary
  const closingBoundary = `\r\n--${boundary}--\r\n`;

  // 计算总 body 大小
  let bodySize = Buffer.byteLength(payloadPart, "utf8");
  for (const part of fileParts) {
    bodySize += Buffer.byteLength("\r\n", "utf8") + part.header.length + part.content.length;
  }
  bodySize += Buffer.byteLength(closingBoundary, "utf8");

  // 构建完整 body（先写 header 部分，再写文件内容）
  const headerBuffer = Buffer.from(payloadPart + "\r\n", "utf8");
  const footerBuffer = Buffer.from(closingBoundary, "utf8");

  // 收集所有 buffer
  const buffers = [headerBuffer];
  for (const part of fileParts) {
    buffers.push(Buffer.from(part.header, "utf8"));
    buffers.push(part.content);
    buffers.push(Buffer.from("\r\n", "utf8"));
  }
  buffers.push(footerBuffer);

  const body = Buffer.concat(buffers);

  // 发起请求
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  const responseText = await response.text();

  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    responseJson = null;
  }

  if (!response.ok) {
    const errorMsg = responseJson?.error || responseText || response.statusText;
    throw new Error(
      `SkillHub API 返回错误 / SkillHub API error (${response.status}): ${errorMsg}`,
    );
  }

  return responseJson;
}

export async function publishToSkillhub({
  manifestPath,
  dryRun = false,
  changelog = "",
  bump = "minor",
  apiBase = DEFAULT_API_BASE,
}) {
  const manifest = readManifest(manifestPath);
  const gitRoot = resolveGitRoot(manifestPath);
  const resolvedChangelog = buildChangelogText(changelog, gitRoot);

  const orgId = process.env.SKILLHUB_ORG_ID;
  const token = process.env.SKILLHUB_API_TOKEN;

  if (!dryRun) {
    if (!orgId) {
      throw new Error("缺少环境变量 SKILLHUB_ORG_ID / SKILLHUB_ORG_ID is required for non-dry-run publishing");
    }
    if (!token) {
      throw new Error("缺少环境变量 SKILLHUB_API_TOKEN / SKILLHUB_API_TOKEN is required for non-dry-run publishing");
    }
  }

  const failures = [];
  const results = [];

  for (const target of manifest.targets || []) {
    const slug = target.registrySlug;
    const artifactDir = target.artifactDir;
    const skillFile = path.join(artifactDir, "SKILL.md");

    if (!fs.existsSync(skillFile)) {
      failures.push({
        targetKey: target.targetKey,
        slug,
        message: `在 ${artifactDir} 中缺少 SKILL.md`,
      });
      continue;
    }

    const skillContent = fs.readFileSync(skillFile, "utf8");
    const metadata = parseFrontmatter(skillContent);
    const currentVersion = readCurrentVersion(skillFile);
    const nextVersion = bumpSemver(currentVersion, bump);

    const files = collectFiles(artifactDir, artifactDir);

    console.log(`[SkillHub] 准备发布 / Preparing: ${target.targetKey} (${slug})`);
    console.log(`  Version: ${currentVersion || "(none)"} -> ${nextVersion}`);
    console.log(`  DisplayName: ${metadata.name}`);
    console.log(`  Files: ${files.length} file(s)`);

    if (dryRun) {
      results.push({
        targetKey: target.targetKey,
        slug,
        version: nextVersion,
        displayName: metadata.name,
        summary: metadata.description,
        fileCount: files.length,
        status: "dry-run",
      });
      continue;
    }

    try {
      const result = await uploadVersionToSkillhub({
        apiBase,
        orgId,
        token,
        slug,
        version: nextVersion,
        changelog: resolvedChangelog,
        displayName: metadata.name,
        summary: metadata.description,
        files,
      });

      console.log(`  ✓ Published version ${nextVersion} (versionId: ${result.versionId})`);

      results.push({
        targetKey: target.targetKey,
        slug,
        version: nextVersion,
        displayName: metadata.name,
        summary: metadata.description,
        fileCount: files.length,
        versionId: result.versionId,
        status: "published",
      });
    } catch (error) {
      // 处理 409 冲突（有版本审核中）
      if (error.message.includes("409")) {
        console.warn(`  ⚠ 跳过 / Skipped (已有版本审核中): ${target.targetKey}`);
        results.push({
          targetKey: target.targetKey,
          slug,
          version: nextVersion,
          status: "skipped",
          reason: "版本审核中 / version pending review",
        });
      } else {
        failures.push({
          targetKey: target.targetKey,
          slug,
          message: error.message,
        });
      }
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `[SkillHub] 发布失败 / Failed to publish ${failure.targetKey} (${failure.slug}): ${failure.message}`,
      );
    }

    const error = new Error(
      `发布到 SkillHub 失败 / Failed to publish ${failures.length} target(s) to SkillHub`,
    );
    error.failures = failures;
    throw error;
  }

  return results;
}

function main() {
  const { manifestPath, dryRun, changelog, bump, apiBase } = parseArgs(
    process.argv.slice(2),
  );

  // 因为是 async 主入口，用 IIFE
  (async () => {
    try {
      const results = await publishToSkillhub({
        manifestPath,
        dryRun,
        changelog,
        bump,
        apiBase,
      });

      for (const result of results) {
        if (result.status === "published") {
          console.log(`✓ ${result.targetKey} (${result.slug}): v${result.version} -> versionId=${result.versionId}`);
        } else if (result.status === "skipped") {
          console.log(`- ${result.targetKey} (${result.slug}): ${result.reason}`);
        } else {
          console.log(`- ${result.targetKey} (${result.slug}): dry-run (v${result.version}, ${result.fileCount} files)`);
        }
      }

      console.log(`\n[SkillHub] 已完成 ${results.length} 个发布操作 / Completed ${results.length} publish operation(s).`);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  })();
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
