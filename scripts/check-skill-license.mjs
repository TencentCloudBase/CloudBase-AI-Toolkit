#!/usr/bin/env node

/**
 * 每个 skill / guideline 入口必须同时满足两件事：
 *
 *   1) SKILL.md frontmatter 声明 `license`（SkillHub 发布规范把 license 列为
 *      frontmatter 字段，见 https://skillhub.cn/tutorials#cli-publish）；
 *   2) 入口目录（与 SKILL.md 同级）放一份**独立的 LICENSE 文件**，写完整协议原文。
 *
 * 第 2 条才是管理端审核真正读的东西：只在 frontmatter 或正文里写 license 字段
 * 会被判缺失。2026-10-09 实测我们的发布包一个 LICENSE 文件都没有，于是把它变成
 * 可回归的门禁 —— 新增 skill 不带 LICENSE 文件，CI 直接红，而不是等审核打回。
 *
 * 只要求文件存在且 frontmatter 有声明，不校验许可证标识或原文内容：换许可证、
 * 改著作权行是产品与法务决策，不是格式问题。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collectSkillFiles } from "./sync-skill-versions.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LICENSE_LINE_RE = /^license:\s*(.+?)\s*$/m;
// LICENSE / LICENSE.md / LICENSE.txt / LICENCE(.md) —— 大小写与常见拼写都认。
const LICENSE_FILE_RE = /^licen[cs]e(\.(md|txt))?$/i;

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

/** 入口目录里的独立 LICENSE 文件名，找不到返回 null。 */
export function findLicenseFile(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.isFile() && LICENSE_FILE_RE.test(entry.name)) {
      return entry.name;
    }
  }

  return null;
}

/** 列出所有不满足条件的入口：{ file, missing: [...] }。 */
export function findMissingLicense(rootDir = ROOT_DIR) {
  const problems = [];

  for (const file of collectSkillFiles(rootDir)) {
    const missing = [];

    if (!readLicense(fs.readFileSync(file, "utf8"))) {
      missing.push("SKILL.md frontmatter 里的 license 声明");
    }
    if (!findLicenseFile(path.dirname(file))) {
      missing.push("与 SKILL.md 同级的 LICENSE 文件（完整协议原文）");
    }

    if (missing.length > 0) {
      problems.push({ file: path.relative(rootDir, file), missing });
    }
  }

  return problems;
}

function main() {
  const problems = findMissingLicense();

  if (problems.length === 0) {
    const total = collectSkillFiles().length;
    console.log(`All ${total} skill/guideline entries ship a license.`);
    return;
  }

  console.error(`Skill packages are missing license information:`);
  for (const { file, missing } of problems) {
    console.error(`  ${file}`);
    for (const item of missing) {
      console.error(`      - 缺 ${item}`);
    }
  }
  console.error(
    `\nSkillHub 的管理端审核要求发布包里有独立的 LICENSE 文件（完整协议原文），` +
      `\n只在 frontmatter 里写 license 字段不算；同时保留 frontmatter 声明以符合发布规范。` +
      `\n做法：在 version 行之后补 \`license: MIT\`，并把仓库根 LICENSE 复制到该入口目录。`,
  );
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
