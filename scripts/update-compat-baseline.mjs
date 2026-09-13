#!/usr/bin/env node

import fs from "fs";
import { pathToFileURL } from "url";
import {
  BASELINE_FILE,
  GENERATED_CONFIG_DIR,
  buildCompatBaselineManifest,
  loadCompatBaseline,
} from "./compat-baseline-lib.mjs";
import { buildCompatConfig } from "./build-compat-config.mjs";

function countFiles(manifest) {
  return Object.values(manifest.groups).reduce(
    (sum, group) => sum + Object.keys(group.files).length,
    0,
  );
}

function groupCountsOf(manifest) {
  return Object.fromEntries(
    Object.entries(manifest.groups).map(([groupName, group]) => [
      groupName,
      Object.keys(group.files).length,
    ]),
  );
}

/**
 * 刷新 compat baseline。
 *
 * 默认全量刷新：所有条目都用当前产物重算 hash，generatedAt 置为当前时间。
 *
 * 传 `only` 时做「定向刷新」：只把路径含该子串的条目更新到基线，其余条目保留
 * 基线里的旧 hash。用于「本次只改了某个 skill，不想顺手把别的 skill 的存量漂移
 * 一起洗白」的场景 —— 全量刷新会把别人未经审核的漂移一并吞掉，让报告失真。
 * 定向模式不改 generatedAt（它表示最近一次全量刷新的时间）。
 *
 * 注意：定向刷新只更新已存在的条目。若匹配到的产物在基线里不存在（新增文件），
 * 会记入 unseen 返回并提示走全量刷新 —— 新增/删除文件属于 existence 级变更，
 * 需要整体重算。
 */
export function updateCompatBaseline({ only } = {}) {
  buildCompatConfig({ outputDir: GENERATED_CONFIG_DIR });

  const fresh = buildCompatBaselineManifest(GENERATED_CONFIG_DIR);

  if (!only) {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(fresh, null, 2) + "\n", "utf8");

    return {
      baselineFile: BASELINE_FILE,
      mode: "full",
      totalFiles: countFiles(fresh),
      groupCounts: groupCountsOf(fresh),
    };
  }

  const manifest = loadCompatBaseline();
  let updated = 0;
  let unchanged = 0;
  const unseen = [];

  for (const groupName of Object.keys(fresh.groups)) {
    const freshFiles = fresh.groups[groupName].files;
    const baseFiles = manifest.groups[groupName].files;

    for (const [file, hash] of Object.entries(freshFiles)) {
      if (!file.includes(only)) {
        continue;
      }
      // 已存在的 key 赋值不会改变对象内的位置，路径字典序得以保持。
      if (!(file in baseFiles)) {
        unseen.push(file);
        continue;
      }
      if (baseFiles[file] === hash) {
        unchanged++;
        continue;
      }
      baseFiles[file] = hash;
      updated++;
    }
  }

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  return {
    baselineFile: BASELINE_FILE,
    mode: "targeted",
    only,
    updated,
    unchanged,
    unseen,
    totalFiles: countFiles(manifest),
    groupCounts: groupCountsOf(manifest),
  };
}

function parseArgs(argv) {
  const onlyIndex = argv.indexOf("--only");
  if (onlyIndex === -1) {
    return { only: undefined };
  }
  const value = argv[onlyIndex + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--only 需要一个子串参数，例如 --only cloud-api-operations");
  }
  return { only: value };
}

function main() {
  const result = updateCompatBaseline(parseArgs(process.argv.slice(2)));

  console.log(`✅ Updated compat baseline: ${result.baselineFile}`);

  if (result.mode === "targeted") {
    console.log(`🎯 定向刷新：匹配 "${result.only}"`);
    console.log(`- 更新条目: ${result.updated}`);
    console.log(`- 未变化: ${result.unchanged}`);
    if (result.unseen.length > 0) {
      console.log(`- ⚠️ 基线中不存在（需全量刷新）: ${result.unseen.length}`);
      for (const file of result.unseen) {
        console.log(`  - ${file}`);
      }
    }
    console.log("- generatedAt 保持原值（定向模式不改全量基线时间戳）");
  }

  console.log(`📦 Files tracked: ${result.totalFiles}`);
  for (const [groupName, count] of Object.entries(result.groupCounts)) {
    console.log(`- ${groupName}: ${count}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
