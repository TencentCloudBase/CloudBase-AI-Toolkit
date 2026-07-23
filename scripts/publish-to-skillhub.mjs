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

/** @returns {number} negative if a<b, 0 if equal, positive if a>b */
function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  return pa.patch - pb.patch;
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
  iconUrl,
  files,
}) {
  const url = `${apiBase}/api/v1/orgs/${orgId}/skills/${slug}/versions`;

  // 使用原生 FormData 构建 multipart/form-data，避免手动拼接的边界条件问题
  const formData = new FormData();

  // payload 作为 JSON 字符串字段
  const payload = JSON.stringify({
    version,
    changelog: changelog || "",
    displayName: displayName || undefined,
    summary: summary || undefined,
    iconUrl: iconUrl || undefined,
    securityScan: false,
  });
  formData.append("payload", payload);

  // 文件部分
  for (const file of files) {
    const fileContent = fs.readFileSync(file.filePath);
    const blob = new Blob([fileContent], { type: "application/octet-stream" });
    formData.append("files", blob, file.relativePath);
  }

  // 发起请求（fetch 会自动设置 Content-Type 和 boundary）
  // all-in-one 等大 skill 包含大量文件，需设置充足超时时间
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120_000);

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

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

    const files = collectFiles(artifactDir, artifactDir);

    console.log(`[SkillHub] 准备发布 / Preparing: ${target.targetKey} (${slug})`);
    console.log(`  Version: ${currentVersion || "(none)"}`);
    console.log(`  DisplayName: ${metadata.name}`);
    console.log(`  Files: ${files.length} file(s)`);

    if (dryRun) {
      results.push({
        targetKey: target.targetKey,
        slug,
        version: currentVersion,
        displayName: metadata.name,
        summary: metadata.description,
        fileCount: files.length,
        status: "dry-run",
      });
      continue;
    }

    // 拉取 SkillHub 上该技能的所有版本号，确定要发布的版本
    let version = currentVersion;
    let retryCount = 0;
    const maxRetries = 10;
    // Hoisted so retry path can read it (must not be block-scoped inside versionsResponse.ok)
    let latestRelease = null;
    let skillHubVersions = [];

    try {
      const versionsUrl = `${apiBase}/api/v1/orgs/${orgId}/skills/${slug}/versions`;
      const versionsResponse = await fetch(versionsUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (versionsResponse.ok) {
        const versionsData = await versionsResponse.json();
        skillHubVersions = versionsData?.versions || [];
        console.log(`  📋 SkillHub 版本历史 / Version history: [${skillHubVersions.map((v) => v.version).join(", ")}]`);

        // 找到 SkillHub 上最新的正式版本号（不含 beta 后缀）
        const sortedReleases = skillHubVersions
          .map((v) => v.version)
          .filter((v) => v && !v.includes("-"))
          .sort(compareSemver)
          .reverse();
        latestRelease = sortedReleases.length > 0 ? sortedReleases[0] : null;

        // 找到 SkillHub 上所有以 currentVersion 为基础的 beta 版本
        const betaPrefix = `${currentVersion}-beta.`;
        let maxBeta = 0;
        for (const v of skillHubVersions) {
          if (v.version && v.version.startsWith(betaPrefix)) {
            const num = parseInt(v.version.slice(betaPrefix.length), 10);
            if (!isNaN(num) && num > maxBeta) maxBeta = num;
          }
        }

        if (latestRelease && compareSemver(latestRelease, currentVersion) > 0) {
          // SkillHub 正式版比本地 SKILL.md 更新：以 SkillHub 为基础递增 patch + beta
          // 例如本地 2.23.0、SkillHub 最新 2.24.1 → 2.24.2-beta.N
          const semver = parseSemver(latestRelease);
          const nextPatch = semver ? `${semver.major}.${semver.minor}.${semver.patch + 1}` : latestRelease;
          const nextBetaPrefix = `${nextPatch}-beta.`;
          let nextMaxBeta = 0;
          for (const v of skillHubVersions) {
            if (v.version && v.version.startsWith(nextBetaPrefix)) {
              const num = parseInt(v.version.slice(nextBetaPrefix.length), 10);
              if (!isNaN(num) && num > nextMaxBeta) nextMaxBeta = num;
            }
          }
          version = `${nextPatch}-beta.${nextMaxBeta + 1}`;
          retryCount = nextMaxBeta + 1;
          console.log(`  → 使用版本 / Using version: ${version} (SkillHub ahead: ${latestRelease} > local ${currentVersion}, next patch: ${nextPatch}, next max beta: ${nextMaxBeta})`);
        } else if (skillHubVersions.some((v) => v.version === currentVersion)) {
          // SKILL.md 版本已存在，加 beta
          version = `${currentVersion}-beta.${maxBeta + 1}`;
          retryCount = maxBeta + 1;
          console.log(`  → 使用版本 / Using version: ${version} (base exists, max beta: ${maxBeta})`);
        } else {
          // 本地版本更新或不存在于 SkillHub（如 2.25.0 vs SkillHub 2.24.1）→ 直接发正式版
          console.log(`  → 使用版本 / Using version: ${version} (local SKILL.md)`);
        }
      }
    } catch (fetchError) {
      console.warn(`  ⚠ 版本历史查询失败 / Failed to query version history: ${fetchError instanceof Error ? fetchError.message : fetchError}`);
      // 拉取版本历史失败，直接尝试 SKILL.md 版本
    }

    while (retryCount <= maxRetries) {
      try {
        const result = await uploadVersionToSkillhub({
          apiBase,
          orgId,
          token,
          slug,
          version,
          changelog: resolvedChangelog,
          displayName: metadata.name,
          summary: metadata.description,
          iconUrl: target.iconUrl,
          files,
        });

        console.log(`  ✓ Published version ${version} (versionId: ${result.versionId})`);

        results.push({
          targetKey: target.targetKey,
          slug,
          version,
          displayName: metadata.name,
          summary: metadata.description,
          fileCount: files.length,
          versionId: result.versionId,
          status: "published",
        });
        break;
      } catch (error) {
        if (error.message.includes("409") || error.message.includes("400")) {
          retryCount++;
          if (retryCount > maxRetries) {
            console.warn(`  ⚠ 重试耗尽 / Max retries reached for ${target.targetKey} (${slug})`);
            failures.push({
              targetKey: target.targetKey,
              slug,
              message: `版本冲突重试 ${maxRetries} 次后仍失败 / version conflict after ${maxRetries} retries`,
            });
            break;
          }
          // 重试：仅当 SkillHub 正式版领先本地时，才沿 nextPatch-beta 递增；否则沿本地版本 beta 递增
          if (latestRelease && compareSemver(latestRelease, currentVersion) > 0) {
            const semver = parseSemver(latestRelease);
            const nextPatch = semver ? `${semver.major}.${semver.minor}.${semver.patch + 1}` : latestRelease;
            version = `${nextPatch}-beta.${retryCount}`;
          } else {
            version = `${currentVersion}-beta.${retryCount}`;
          }
          console.log(`  ↻ 版本冲突 / Version conflict (${error.message.includes("409") ? "409" : "400"}), retrying with ${version} (attempt ${retryCount}/${maxRetries})`);
        } else {
          failures.push({
            targetKey: target.targetKey,
            slug,
            message: error.message,
          });
          break;
        }
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
