#!/usr/bin/env node
/**
 * sync-experts.mjs — 把 plugins/experts/ 下的专家包源码同步到 WorkBuddy 专家目录
 *
 * 真源：   <repo>/plugins/experts/<expert-name>/
 * 目标：   ${WORKBUDDY_CONFIG_DIR || ~/.workbuddy}/plugins/marketplaces/my-experts/plugins/<expert-name>/
 *
 * 同步 = rsync 全量镜像（--delete）→ validate_expert.py → register_expert.py
 * WorkBuddy 专家目录里的内容是同步产物，不要手改，会被覆盖。
 *
 * 用法：
 *   node scripts/sync-experts.mjs                # 同步 plugins/experts/ 下全部专家
 *   node scripts/sync-experts.mjs <expert-name>  # 只同步指定专家
 *
 * 可用环境变量：
 *   WORKBUDDY_CONFIG_DIR          WorkBuddy 配置根目录（默认 ~/.workbuddy）
 *   EXPERT_MANAGER_SCRIPTS_DIR    expert-manager 校验/注册脚本目录覆盖
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("..", import.meta.url).pathname);
const SOURCE_ROOT = join(REPO_ROOT, "plugins", "experts");
const CONFIG_DIR =
  process.env.WORKBUDDY_CONFIG_DIR?.trim() || join(homedir(), ".workbuddy");
const TARGET_ROOT = join(
  CONFIG_DIR,
  "plugins",
  "marketplaces",
  "my-experts",
  "plugins"
);

const DEFAULT_EM_SCRIPTS_DIR =
  "/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/expert-manager/scripts";
const EM_SCRIPTS_DIR =
  process.env.EXPERT_MANAGER_SCRIPTS_DIR?.trim() || DEFAULT_EM_SCRIPTS_DIR;

// 与 expert-manager skill 固定用法保持一致
const SESSION_ID = "e568b592-4252-4e99-a552-99467f9985e5";

function run(cmd, args, label) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.error) {
    console.error(`❌ [${label}] 无法执行 ${cmd}: ${r.error.message}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`❌ [${label}] 失败（exit ${r.status}）：${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function listExperts(filter) {
  if (!existsSync(SOURCE_ROOT)) {
    console.error(`❌ 源目录不存在: ${SOURCE_ROOT}`);
    process.exit(1);
  }
  const names = readdirSync(SOURCE_ROOT).filter((n) => {
    const p = join(SOURCE_ROOT, n);
    return statSync(p).isDirectory() && !n.startsWith(".");
  });
  const picked = filter ? names.filter((n) => n === filter) : names;
  if (filter && picked.length === 0) {
    console.error(
      `❌ 未找到专家 "${filter}"。可用: ${names.join(", ") || "（空）"}`
    );
    process.exit(1);
  }
  return picked;
}

function ensureValidExpert(name) {
  const dir = join(SOURCE_ROOT, name);
  const pluginJson = join(dir, ".codebuddy-plugin", "plugin.json");
  if (!existsSync(pluginJson)) {
    console.error(`❌ ${name}: 缺少 ${pluginJson}，不是有效的专家包源码目录`);
    process.exit(1);
  }
}

function syncExpert(name) {
  ensureValidExpert(name);
  const src = join(SOURCE_ROOT, name);
  const dst = join(TARGET_ROOT, name);
  console.log(`\n==> 同步专家 ${name}`);
  console.log(`    ${src}`);
  console.log(` -> ${dst}`);
  run("rsync", ["-a", "--delete", `${src}/`, `${dst}/`], `rsync ${name}`);
  run(
    "python3",
    [join(EM_SCRIPTS_DIR, "validate_expert.py"), dst],
    `validate ${name}`
  );
  run(
    "python3",
    [
      join(EM_SCRIPTS_DIR, "register_expert.py"),
      dst,
      "--session-id",
      SESSION_ID,
    ],
    `register ${name}`
  );
  console.log(`✅ ${name} 同步并注册完成`);
}

const filter = process.argv[2];
if (filter && (filter.startsWith("-") || filter.includes("/"))) {
  console.error("用法: node scripts/sync-experts.mjs [expert-name]");
  process.exit(1);
}
const experts = listExperts(filter);
if (experts.length === 0) {
  console.log(`（${SOURCE_ROOT} 下暂无专家包）`);
  process.exit(0);
}
console.log(`专家目录: ${TARGET_ROOT}`);
for (const name of experts) syncExpert(name);
console.log(`\n全部完成：${experts.length} 个专家已同步。`);
