#!/usr/bin/env node
/**
 * 用量模块枚举巡检（check-usage-modules）
 * ---------------------------------------
 * 起因：`DescribeCreditsUsageDetail` 的 `Modules` 是**必传**参数，没有「全部」取值，
 * 少传一个模块 = 那个模块的用量整块消失（2026-11-03 实际事故：清单里没有 `PostgreSQL`，
 * PG 环境「数据库」一行永远显示 0，MCP 与 tcb CLI 都中招）。所以这份清单必须跟官方文档同步。
 *
 * 真源：云 API 文档《获取资源点用量明细》 `product/876/132934` 的 Modules 枚举
 *      （不是 tcb CLI 的 `USAGE_MODULES`——CLI 落后于文档，照抄就会漏）。
 *
 * 用法：
 *   node scripts/check-usage-modules.mjs            # 比对，漂移则 exit 1
 *   node scripts/check-usage-modules.mjs --json     # 机器可读输出
 *
 * 退出码：0 = 一致；1 = 漂移（需要更新 `ENV_USAGE_MODULE_VALUES`）；2 = 抓取/解析失败（不是漂移）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(new URL(import.meta.url).pathname));
const DOC_URL = "https://cloud.tencent.com/document/product/876/132934";
const SOURCE_FILE = join(ROOT, "mcp/src/tools/env.ts");

/** 官方文档 Modules 枚举 → 模块码数组。文档页把枚举渲染成 `<li>CODE： 说明</li>`。 */
export function parseDocModules(html) {
  const marker = html.indexOf("模块列表");
  if (marker === -1) return null;
  // 枚举紧跟在「模块列表 / 枚举值」之后，取一段窗口足够覆盖整个 <ul>
  const window = html.slice(marker, marker + 4000).replace(/\\u003c/g, "<").replace(/\\u003e/g, ">");
  const listMatch = window.match(/<ul>([\s\S]*?)<\/ul>/);
  if (!listMatch) return null;
  const codes = [...listMatch[1].matchAll(/<li>\s*([A-Za-z][A-Za-z0-9]*)\s*[：:]/g)].map((m) => m[1]);
  return codes.length > 0 ? [...new Set(codes)] : null;
}

/** 源码里 `ENV_USAGE_MODULE_VALUES` 的当前取值。 */
export function readLocalModules(source = readFileSync(SOURCE_FILE, "utf8")) {
  const block = source.match(/export const ENV_USAGE_MODULE_VALUES = \[([\s\S]*?)\] as const;/);
  if (!block) return null;
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

export function diffModules(docModules, localModules) {
  const doc = new Set(docModules);
  const local = new Set(localModules);
  return {
    missing: docModules.filter((code) => !local.has(code)),
    extra: localModules.filter((code) => !doc.has(code)),
  };
}

async function fetchDocModules() {
  const res = await fetch(DOC_URL, { headers: { "user-agent": "cloudbase-mcp-check-usage-modules" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return parseDocModules(await res.text());
}

async function main() {
  const json = process.argv.includes("--json");
  const localModules = readLocalModules();
  if (!localModules) {
    console.error("[usage-modules] 解析 ENV_USAGE_MODULE_VALUES 失败（源码结构变了？）");
    process.exit(2);
  }

  let docModules;
  try {
    docModules = await fetchDocModules();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) console.log(JSON.stringify({ status: "fetch-failed", error: message }, null, 2));
    else console.error(`[usage-modules] 抓取文档失败：${message}（这不代表漂移）`);
    process.exit(2);
  }
  if (!docModules) {
    if (json) console.log(JSON.stringify({ status: "parse-failed", localModules }, null, 2));
    else console.error("[usage-modules] 文档里找不到 Modules 枚举（页面结构变了？）");
    process.exit(2);
  }

  const { missing, extra } = diffModules(docModules, localModules);
  const drift = missing.length > 0 || extra.length > 0;

  if (json) {
    console.log(JSON.stringify({ status: drift ? "drift" : "ok", docModules, localModules, ...{ missing, extra } }, null, 2));
  } else if (drift) {
    console.log(`[usage-modules] 与官方文档不一致（${DOC_URL}）`);
    if (missing.length) console.log(`  缺：${missing.join(", ")}  ← 这些模块的用量当前查不出来`);
    if (extra.length) console.log(`  多：${extra.join(", ")}  ← 文档已删除，请求会报参数错误`);
    console.log(`  文档共 ${docModules.length} 项，代码里 ${localModules.length} 项`);
    console.log("  改 mcp/src/tools/env.ts 的 ENV_USAGE_MODULE_VALUES，并同步 payload 归类与 skill 文档。");
  } else {
    console.log(`[usage-modules] OK：${localModules.length} 个模块与官方文档一致`);
  }
  process.exit(drift ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("check-usage-modules.mjs")) {
  await main();
}
