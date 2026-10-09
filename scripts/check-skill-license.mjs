#!/usr/bin/env node

/**
 * 每个 skill / guideline 入口的 frontmatter 都必须声明 `license`。
 *
 * 为什么是门禁而不是"发布前记得检查"：SkillHub 的发布规范把 `license` 列为 SKILL.md
 * frontmatter 字段（见 https://skillhub.cn/tutorials#cli-publish 的参数表，`license`
 * = Skill 的开源许可证），缺了它线上条目的管理端审核不通过 —— 2026-10-09 实测我们
 * 已发布的条目里没有任何许可信息。这类"元数据漏填"只会等到审核被拒才被发现，
 * 所以在源这一侧钉死：新增 skill 若不带 license，CI 直接红。
 *
 * 只要求字段存在且非空，不校验具体许可证标识 —— 换许可证是产品决策，不是格式问题。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collectSkillFiles } from "./sync-skill-versions.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LICENSE_LINE_RE = /^license:\s*(.+?)\s*$/m;

/**
 * 从 SKILL.md 文本里读 license 声明。只认 frontmatter 内的行，
 * 避免正文里的 "license:" 字样被误当成声明。
 */
export function readLicense(raw) {
  const frontmatterMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatterMatch) return null;
  const match = frontmatterMatch[1].match(LICENSE_LINE_RE);
  return match ? match[1] : null;
}

/** 返回所有缺少 license 声明的入口文件（相对 rootDir）。 */
export function findMissingLicense(rootDir = ROOT_DIR) {
  const missing = [];

  for (const file of collectSkillFiles(rootDir)) {
    const license = readLicense(fs.readFileSync(file, "utf8"));
    if (!license) {
      missing.push(path.relative(rootDir, file));
    }
  }

  return missing;
}

function main() {
  const missing = findMissingLicense();

  if (missing.length === 0) {
    const total = collectSkillFiles().length;
    console.log(`All ${total} skill/guideline entries declare a license.`);
    return;
  }

  console.error(`Skill frontmatter is missing a license declaration:`);
  for (const file of missing) {
    console.error(`  ${file}`);
  }
  console.error(
    `\nSkillHub 发布规范要求 SKILL.md frontmatter 带 license（见 https://skillhub.cn/tutorials#cli-publish）。` +
      `\n在 frontmatter 的 version 行之后补一行 \`license: MIT\`。`,
  );
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
