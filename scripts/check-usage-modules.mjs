#!/usr/bin/env node
/**
 * 用量模块枚举巡检（check-usage-modules）
 * ---------------------------------------
 * 起因：`DescribeCreditsUsageDetail` 的 `Modules` 是**必传**参数，没有「全部」取值，
 * 少传一个模块 = 那个模块的用量整块消失（2026-11-03 实际事故：清单里没有 `PostgreSQL`，
 * PG 环境「数据库」一行永远显示 0，MCP 与 tcb CLI 都中招）。所以这份清单必须跟官方文档同步。
 *
 * 真源：云 API 文档《获取资源点用量明细》 `product/876/132934` 的 Modules 枚举
 *      —— 但**它是子集**：接口另外接受 6 个文档没收录的码（见 `DOC_NOT_LISTED_YET`），
 *      控制台用量页请求的就是含这 6 项的全量清单。
 *
 * 判据：文档里的码**必须全部包含**（漏一个 = 那个模块的用量静默消失）；
 *      代码里比文档多的，只有在 `DOC_NOT_LISTED_YET` 之内才放过（文档还没收录），
 *      其余一律当真漂移（多半是文档删了某项，请求会报参数错误）。
 *
 * 用法：
 *   node scripts/check-usage-modules.mjs            # 比对，漂移则 exit 1
 *   node scripts/check-usage-modules.mjs --json     # 机器可读输出
 *
 * 退出码：0 = 一致（含「文档未收录的已知项」）；1 = 漂移（需要更新 `ENV_USAGE_MODULE_VALUES`）；
 *         2 = 抓取/解析失败（不是漂移）。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(new URL(import.meta.url).pathname));
const DOC_URL = "https://cloud.tencent.com/document/product/876/132934";
const SOURCE_FILE = join(ROOT, "mcp/src/tools/env.ts");

/**
 * 文档枚举是**子集**：下面这 6 项接口接受、控制台用量页也在请求，但云 API 文档的 Modules 枚举没有收录。
 * 它们出现在代码清单里不算漂移；哪天文档补上了，这里留着也不影响（只影响 --json 里的 extraExplained）。
 * 反过来，文档**删掉**某个码会让它变成「多」，那是真问题（请求会报参数错误），所以仍要报。
 */
const DOC_NOT_LISTED_YET = new Set(["CBF", "Gateway", "CLS", "EO", "STORAGE_EO", "CI"]);

/**
 * 文档里仍然列着、但我们**有意不请求**的码：`Gateway` 的拆分子类。
 * 文档把它们当正式枚举，实际口径已经统一到 `Gateway`（控制台只传 `Gateway`），
 * 两个子类和父项一起传会让「环境调用」翻倍，所以清单里不放它们。
 * 这两个码不会出现在请求里，因此「文档有、代码没有」不算漂移。
 */
const DOC_MERGED_SUBMODULES = new Set(["APIInvocation", "HTTPInvocation"]);

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
  // 文档是**子集**：它只收录了 15 项，另有 6 项控制台在用、接口也接受，但文档没写。
  // 这 6 项不算漂移；除此之外的「多」都当真漂移（很可能是文档删了某项，请求会报参数错误）。
  const unexplainedExtra = extra.filter((code) => !DOC_NOT_LISTED_YET.has(code));
  // 反过来，文档里 `Gateway` 的两个拆分子类我们有意不请求（同传会翻倍），也不算缺。
  const unexplainedMissing = missing.filter((code) => !DOC_MERGED_SUBMODULES.has(code));
  const drift = unexplainedMissing.length > 0 || unexplainedExtra.length > 0;

  if (json) {
    console.log(
      JSON.stringify(
        {
          status: drift ? "drift" : "ok",
          docModules,
          localModules,
          missing,
          extra,
          missingExplained: missing.filter((code) => DOC_MERGED_SUBMODULES.has(code)),
          missingUnexplained: unexplainedMissing,
          extraExplained: extra.filter((code) => DOC_NOT_LISTED_YET.has(code)),
          extraUnexplained: unexplainedExtra,
        },
        null,
        2,
      ),
    );
  } else if (drift) {
    console.log(`[usage-modules] 与官方文档不一致（${DOC_URL}）`);
    if (unexplainedMissing.length)
      console.log(`  缺：${unexplainedMissing.join(", ")}  ← 这些模块的用量当前查不出来`);
    if (unexplainedExtra.length)
      console.log(`  多：${unexplainedExtra.join(", ")}  ← 文档已删除，请求会报参数错误`);
    console.log(`  文档共 ${docModules.length} 项，代码里 ${localModules.length} 项`);
    console.log("  改 mcp/src/tools/env.ts 的 ENV_USAGE_MODULE_VALUES，并同步 payload 归类与 skill 文档。");
  } else {
    const listed = extra.length ? `（另有 ${extra.length} 项文档未收录：${extra.join(", ")}）` : "";
    console.log(`[usage-modules] OK：${localModules.length} 个模块，官方文档的 ${docModules.length} 项全部覆盖${listed}`);
  }
  process.exit(drift ? 1 : 0);
}

if (process.argv[1] && process.argv[1].endsWith("check-usage-modules.mjs")) {
  await main();
}
