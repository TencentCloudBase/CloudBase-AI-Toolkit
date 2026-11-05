import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExtendedMcpServer } from "../server.js";
import { resolvePanelLang, t, type Lang, type MessageKey } from "../i18n/index.js";
import { readDisplayedEnvId } from "../utils/env-binding.js";
import {
  SITE_IDS,
  SITE_REGION_MAP,
  getConsoleDevUrl,
  normalizeSite,
  resolveSiteAndRegion,
  type SiteId,
} from "../utils/site-map.js";
import { debug } from "../utils/logger.js";
import { CREDENTIAL_GUARD_JS } from "./panel-raw-guard.js";
import {
  readClientCapabilitiesFromServer,
  readMcpClientInfoFromServer,
  reportResourceRead,
} from "../utils/telemetry.js";

/**
 * MCP Apps 环境资源用量面板（`ui://cloudbase/env-credits`）。
 *
 * 五条硬约束决定了这里的形状：
 *   1. **面板 HTML 是近静态模板 + 词典注入**：模板串只含 ASCII 结构与占位符，
 *      所有句子来自 `i18n/locales/modules/mcpUiCredits.ts`，按实例语言在 resources/read 时求值；
 *   2. **读资源不发请求**：只有本地兜底值（环境 ID / 站点 / 地域）在 read 时求值，
 *      真实用量随**工具结果**（`ui/notifications/tool-result`）推给面板，逐字段覆盖兜底值；
 *   3. **面板不执行计费**：主行动只把一句话交给会话（`ui/message`），由技能继续引导；
 *      支付类动作（billing:PayDeals）不在本面板射程内；
 *   4. **控制台计费页不直接打开**：面板使用者未必有计费权限（子账号 / hosted 用户会被权限页拦住），
 *      因此只提供「复制链接」，无权限时转给主账号管理员；
 *   5. **面向用户，不面向实现**：正文不出现内部枚举与字段名，套餐名、模块名一律走映射；
 *      认不出来的原始值照原样显示（宁可不译，不要译错）。
 *
 * 四分支（体验版耗尽 / 付费版耗尽 / 套餐到期 / 账户欠费）的判别与结论话术以
 * `specs/credits-exhaustion-guidance/handoff-to-elicitation-confirmations.md` §5 为准。
 * 面板只负责"看清 + 指路"，**分支由服务端在工具结果里给出**（`branch` 字段）。
 */

/** 定稿的 `ui://` 资源 URI（无变量模板，不进 `resources/list`）。 */
export const ENV_CREDITS_RESOURCE_URI = "ui://cloudbase/env-credits";

/** MCP Apps 资源 MUST 使用此 MIME。 */
export const ENV_CREDITS_MIME_TYPE = "text/html;profile=mcp-app";

/** 四个告警分支（体验版耗尽 / 套餐配额用完 / 套餐到期 / 账户欠费）+ 用量正常 + 尚未拿到结果的未确认态。 */
export type CreditsBranch =
  | "unknown"
  | "normal"
  | "trialExhausted"
  | "stopped"
  | "expired"
  | "arrears";

/** 用量模块（分模块用量条的固定枚举；认不出的模块原样显示）。 */
export type CreditsModuleCode = "functions" | "database" | "storage" | "cdn";

/** 套餐枚举（仅有这五种；认不出的原样显示）。 */
export type PlanCode = "trial" | "personal" | "standard" | "enterprise" | "enterpriseAdvanced";

/** 静态兜底数据：只读本地状态，读资源时不发网络/文件请求。 */
export interface EnvCreditsFallback {
  envId: string | null;
  site: string;
  region: string;
}

/** 工具结果里携带的用量数据（面板按字段覆盖兜底值）。 */
export interface EnvCreditsPayload {
  /**
   * 载荷判别式。`credits`（或**缺省**）走用量视图——缺省即 credits 是为了让本字段
   * 上线前的一切既有载荷与断言**逐字不变**（旧路径不带这个键）。
   */
  kind?: "credits";
  branch?: CreditsBranch;
  env_alias?: string | null;
  env_id?: string | null;
  plan?: PlanCode | null;
  plan_raw?: string | null;
  current_region?: string;
  site?: string;
  /**
   * 资源点用量。三个数各占一个去向，加起来才是总消耗：
   *   `used`    套餐内用量（进度条分子，与 `total` 同口径）
   *   `payg`    超套餐后的按量用量
   *   `package` 资源包抵扣
   * 只有 `used` 是必有的；`payg` / `package` 为零或读不到时整键缺省（面板不画空行）。
   * `source` 说明 `used` 从哪来：`billing` = 账单聚合接口，`detail` = 分模块明细求和。
   */
  credits?: {
    total?: number;
    used?: number;
    payg?: number;
    package?: number;
    source?: "billing" | "detail";
  } | null;
  /**
   * 分模块用量，**只到模块合计一层**（与控制台「功能用量概览」的模块行同层级）。
   *
   * 为什么不再往下钻：往下一层是指标名（`Capacity` / `Flux` / `CU`）和资源类型名
   * （`TDSQL` / `PG`），都是云 API 的英文代码，官方没有中文名表。卡片是给人一眼看的，
   * 印一串读不懂的码等于没有信息，还会把模块合计挤成次要信息。指标明细由 Agent 在对话里
   * 用中文讲（需要数据就传 `needUsageDetails: true`）。
   */
  modules?: Array<{
    module?: CreditsModuleCode | string;
    credits_value?: number;
  }>;
  spark?: Array<{ calc_time?: string; credits_value?: number }>;
  balance?: number | null;
  isolated_days_left?: number | null;
  /**
   * 这次查询的数字覆盖到哪一层 —— **`branch: "unknown"` 的三种成因要靠它分开**：
   *   `full`     整周期、全模块，`total` 与 `used` 同口径，能下结论；
   *   `filtered` 调用方按 `type` 选了模块，`used` 只是子集，故不与套餐总额比较（套餐本身仍照实给）；
   *   `partial`  某条 `Usages[]` 缺 `DeductValue`，求和是部分和，同样不比较；
   *   `none`     一条用量都没拿到（`credits` 整键缺省）。
   * 旧载荷没有这个键；面板只在选文案时读它，其余按 `full` 处理。
   */
  scope?: "full" | "filtered" | "partial" | "none";
}

/** 监控指标卡的三态（其余情况一律不硬凑成某一态）。 */
export type MetricsState = "data" | "noData" | "failed";

/**
 * 监控指标卡（`queryEnv(action=metrics)`）的面板载荷。
 *
 * 与 `EnvCreditsPayload` 共用同一个资源（`ui://cloudbase/env-credits`）：`_meta.ui.resourceUri`
 * 是**工具级单值**，一个工具只能挂一个资源，所以第二个视图只能靠 `kind` 在同一面板里分派。
 *
 * 纪律与用量卡一致：**不猜、不编数**——`summary` 里拿不到的字段一律不带（面板隐藏该行），
 * `curve` 已在工具侧裁剪（见 `buildEnvMetricsPayload`），这里只接收裁剪后的 `spark`。
 */
export interface EnvMetricsPayload {
  kind: "metrics";
  /** 面板状态：有数据 / 无流量 / 查询失败。 */
  state: MetricsState;
  /** 指标枚举值（只用于映射人话；未映射的一律退化为通用标题，不打印原始码）。 */
  metric: string;
  env_alias?: string | null;
  env_id?: string | null;
  current_region?: string;
  site?: string;
  plan?: PlanCode | null;
  sample_count: number;
  period_seconds?: number | null;
  // 只保留面板会读的字段：start_time / end_time / min 曾产出但无人读，已删除。
  latest?: number | null;
  max?: number | null;
  avg?: number | null;
  /** 峰值时间（原样字符串；拿不到就不显示，不编时间）。 */
  peak_time?: string | null;
  spark?: Array<{ calc_time?: string; credits_value?: number }>;
}

/** 面板可能收到的两种载荷。 */
export type EnvPanelPayload = EnvCreditsPayload | EnvMetricsPayload;

/**
 * 控制台入口（2026-10-16 登录态真机核对，三条链接逐条打开过）。
 *
 * 环境级的两条都落在云开发控制台的「套餐用量」页 —— 这是**本环境**套餐的唯一入口：
 *   - 套餐资源点耗尽 → 该页给「升级套餐 / 加购资源包 / 套餐变配」；
 *   - 套餐到期、环境被临时隔离 → 同一页给出「当前访问资源已临时隔离 … 续费」。
 * （已隔离环境实测：同一 URL 会自行切到隔离/续费口径，所以续费不需要另一条路径。）
 *
 * 费用中心是**账户级**的、没有环境维度，所以只带充值页：欠费要先把账户充上。
 *
 * ⚠️ 旧值 `console.cloud.tencent.com/tcb/{package,renew}` 是**不存在的路径**：该主机下任何
 * 未知的 `/tcb/*` 都会被 SPA 兜底到环境列表 `/tcb/platform/env`，既不带 envId 也不分站点，
 * 用户点开只会看到环境列表。改动前先读这一句，不要改回去，也不要只锁主机名。
 */
export const ENV_CREDITS_CONSOLE_LINK_KEYS = ["package", "renew", "expense"] as const;
export type EnvCreditsConsoleLinkKey = (typeof ENV_CREDITS_CONSOLE_LINK_KEYS)[number];

/**
 * 环境级入口的 hash 段。带前导 `/` —— 控制台自己的导航就是 `#/env/package-usage` 这个形制，
 * 与 `getConsoleDevUrl(envId, "static-hosting")` 那种「`#static-hosting`」写法刻意不同。
 */
export const ENV_CREDITS_ENV_LINK_HASH: Readonly<
  Record<Exclude<EnvCreditsConsoleLinkKey, "expense">, string>
> = {
  package: "/env/package-usage",
  renew: "/env/package-usage",
};

/** 账户级费用中心：国家站与国际站不同域。 */
export const ENV_CREDITS_BILLING = {
  path: "/expense/recharge",
  host: { domestic: "console.cloud.tencent.com", intl: "console.intl.cloud.tencent.com" },

} as const;

/** 面板脚本要用的主机表：由 SITE_REGION_MAP 派生，杜绝与 getConsoleDevUrl 漂移。 */
const CONSOLE_HOST_BY_SITE = Object.fromEntries(
  SITE_IDS.map((id) => [id, SITE_REGION_MAP[id].consoleHost]),
) as Record<SiteId, string>;

/**
 * 拼一条控制台链接。`envId` / `site` 都应来自**本次工具结果**，在点击时才求值 ——
 * 不要在建 HTML 时定死，同一个面板可能被用来查另一个环境（多地域账号尤甚）。
 * 这是纯函数，所以完整 URL 可以在测试里直接锁死。
 */
export function buildEnvCreditsConsoleUrl(
  key: EnvCreditsConsoleLinkKey,
  envId: string | null | undefined,
  site?: string,
): string {
  if (key === "expense") {
    const resolvedSite = normalizeSite(site) ?? resolveSiteAndRegion({ site }).site;
    return `https://${ENV_CREDITS_BILLING.host[resolvedSite]}${ENV_CREDITS_BILLING.path}`;
  }
  return getConsoleDevUrl(envId ?? undefined, ENV_CREDITS_ENV_LINK_HASH[key], site);
}

/**
 * Static fallback until a tool result arrives.
 * Explicit `cloudBaseOptions.envId` wins. Otherwise the current slot.
 * Does not read `CLOUDBASE_ENV_ID` or the process cache.
 */
export function resolveEnvCreditsFallback(server: ExtendedMcpServer): EnvCreditsFallback {
  const envId = readDisplayedEnvId(server.cloudBaseOptions?.envId);
  const { site, region } = resolveSiteAndRegion({
    site: server.cloudBaseOptions?.site,
    region: server.cloudBaseOptions?.region,
  });
  return { envId, site, region };
}

/** 按 `& < > " '` 转义，避免环境 ID 等值破坏 HTML 结构。 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function jsLiteral(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** 生成面板 HTML。模板串保持纯 ASCII：所有自然语言来自词典，按 `lang` 求值后注入。 */
export function buildEnvCreditsHtml(lang: Lang, fallback: EnvCreditsFallback): string {
  const L = (key: MessageKey): string => t(key, undefined, lang);
  const E = escapeHtml;
  const J = jsLiteral;
  const S = (key: MessageKey): string => J(L(key));

  /**
   * 站点与地域的 code → 词典 key：这两类 code 唯一合法的翻译落点，
   * 面板正文与脚本查表都由它派生。**认不出的 code 返回空串**（宁可不显示，也不把内部码打到界面上）。
   */
  const SITE_LABEL_DIR: ReadonlyArray<readonly [string, MessageKey]> = [
    ["domestic", "mcpUi.site.domestic"],
    ["intl", "mcpUi.site.intl"],
  ];
  const REGION_LABEL_DIR: ReadonlyArray<readonly [string, MessageKey]> = [
    ["ap-shanghai", "mcpUi.region.apShanghai"],
    ["ap-guangzhou", "mcpUi.region.apGuangzhou"],
    ["ap-beijing", "mcpUi.region.apBeijing"],
    ["ap-nanjing", "mcpUi.region.apNanjing"],
    ["ap-chengdu", "mcpUi.region.apChengdu"],
    ["ap-hongkong", "mcpUi.region.apHongkong"],
    ["ap-singapore", "mcpUi.region.apSingapore"],
    ["na-siliconvalley", "mcpUi.region.naSiliconvalley"],
    ["eu-frankfurt", "mcpUi.region.euFrankfurt"],
  ];
  const labelOf = (
    dir: ReadonlyArray<readonly [string, MessageKey]>,
    code: string,
  ): string => {
    const hit = dir.find(([c]) => c === code);
    return hit ? L(hit[1]) : "";
  };
  const dirTable = (dir: ReadonlyArray<readonly [string, MessageKey]>): string =>
    dir.map(([code, key]) => `${J(code)}:${S(key)}`).join(",");

  const siteText = labelOf(SITE_LABEL_DIR, fallback.site);
  const regionText = labelOf(REGION_LABEL_DIR, fallback.region);
  const placeText = regionText
    ? siteText
      ? regionText + L("mcpUi.place.open") + siteText + L("mcpUi.place.close")
      : regionText
    : siteText;

  return `<!doctype html>
<html lang="${E(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${E(L("mcpUiCredits.resourceTitle"))}</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #F6F7F9; --surface: #ffffff; --border: rgba(16,24,40,.08); --line: rgba(16,24,40,.08);
  --text: #141A24; --text-2: #5A6472; --text-3: #8A93A0;
  --primary: #0052D9; --primary-hover: #0043B4; --tint: #EFF5FF;
  --ok: #12B76A; --warn: #F79009; --err: #F04438;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101318; --surface: #191D24; --border: rgba(255,255,255,.10); --line: rgba(255,255,255,.10);
    --text: #E9EDF2; --text-2: #9AA4B2; --text-3: #6B7480;
    --primary: #4896FF; --primary-hover: #63A9FF; --tint: rgba(0,82,217,.25);
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; }
[hidden] { display: none !important; }
body {
  background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased;
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
/* The host decides how wide the card is; the panel fills it instead of pinning a narrow column
   in the middle. 720px is the widest a single column of key/value pairs still reads well at. */
.panel { width: 100%; max-width: 720px; margin: 0 auto; padding: 16px; }
.brand { height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  border-bottom: 1px solid var(--line); }
.brand-l { display: flex; align-items: center; gap: 8px; min-width: 0; }
.brand-l .logo svg { width: 20px; height: 20px; display: block; }
.brand-name { font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
.brand-r { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.brand-alias { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; font-weight: 500; color: var(--text-2);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.plan-tag { font-size: 12px; color: var(--text-2); border: 1px solid var(--border);
  border-radius: 6px; padding: 1px 6px; white-space: nowrap; }
.icon-btn { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text-2);
  cursor: pointer; padding: 0; }
.icon-btn:hover { background: var(--tint); border-color: transparent; color: var(--primary); }
.card { margin-top: 16px; background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 16px; box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10); }
@media (prefers-color-scheme: dark) { .card { box-shadow: none; } }
.t1 { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.t1 h1 { font-size: 22px; font-weight: 600; letter-spacing: -.01em; line-height: 1.3; margin: 0; }
.st { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-3); flex: 0 0 auto; }
.dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.err { background: var(--err); }
.t2 { margin: 8px 0 0; font-size: 13px; color: var(--text-2); }
/* Module tags: which modules this reading covers, in the same tag language as the plan tag above.
   A narrowed query gets one extra tag that reads "all modules" - the way back is visible, so no
   sentence has to explain the scope. */
.mods-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px; }
.mods { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.mtag { display: inline-flex; align-items: baseline; gap: 5px; font: inherit; font-size: 12px; line-height: 1.7;
  color: var(--text-2); background: none; border: 1px solid var(--border); border-radius: 6px; padding: 0 7px;
  white-space: nowrap; font-variant-numeric: tabular-nums; }
/* The figure is what the eye looks for; the module name is the label next to it.
   Tags stay plain spans: the card answers "which module costs the most" and stops there.
   Metric codes from the API (Capacity / Flux / CU) mean nothing to a reader, so they are
   not printed here at all - naming them is the agent's job, in words, when asked. */
.mtag b { font-weight: 600; color: var(--text); }
/* The module rows are "what was consumed", the headline is "what the plan covered". On a
   pay-as-you-go environment the first is larger than the second, so the sum is spelled out
   here instead of leaving the reader to reconcile two numbers on their own. */
.mods-sum { margin: 5px 0 0; font-size: 11.5px; color: var(--text-3); font-variant-numeric: tabular-nums; }
.tagbtn { display: inline-flex; align-items: center; gap: 1px; font: inherit; font-size: 12px;
  line-height: 1.7; color: var(--primary); background: var(--tint); border: 0; border-radius: 6px;
  padding: 0 5px 0 8px; cursor: pointer; white-space: nowrap; }
.tagbtn:hover { text-decoration: underline; }
.tagbtn:disabled { cursor: default; opacity: .6; }
.tagbtn svg { width: 12px; height: 12px; display: block; }
.t3 { margin-top: 12px; display: grid; gap: 12px 28px; align-items: start; }
/* Wide hosts get two real columns instead of one narrow strip in the middle: the credit total and
   what it is made of on the left, the plan facts on the right. A narrow host stacks them. */
@media (min-width: 760px) { .t3 { grid-template-columns: minmax(0, 1.02fr) minmax(0, 1fr); } }
.t3 > table, .t3 > .note, .t3 > .spark, .t3 > details { grid-column: 1 / -1; }
.col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.field { margin-top: 0; }
.field .k { margin: 0 0 4px; font-size: 13px; color: var(--text-2); }
.field .v { margin: 0; font-size: 14px; font-variant-numeric: tabular-nums; }
.field .v.mono { font-family: var(--mono); font-size: 13px; }
/* The share is the number people look for first, so it gets the display size and the raw figures
   follow it in small type. With no quota there is no share: the used figure stands alone. */
.big { display: flex; align-items: baseline; gap: 10px; margin: 0; }
.big #k-pct { font-size: 26px; font-weight: 600; line-height: 1.15; letter-spacing: -.02em; }
.big #k-pct:empty { display: none; }
.big .v { font-size: 13px; color: var(--text-2); }
.ubar { height: 6px; margin-top: 6px; border-radius: 3px; background: var(--bg); border: 1px solid var(--line); overflow: hidden; }
.ubar i { display: block; height: 100%; background: var(--err); }
.ubar.ok i { background: var(--ok); }
/* Daily usage as bars, not a curve: the figure for each day is what people act on, so every bar
   carries its own number and its day sits under the baseline. A curve shows the shape and hides
   all seven figures; the caption it needed ("last 7 days") is now written by the dates themselves.
   One neutral colour for every bar: the bars are readings, and health is already said once by the
   status dot and the quota bar above. A green or red bar would claim a judgement about the data. */
.spark { margin-top: 10px; }
.spark-bars { display: flex; align-items: flex-end; gap: 6px; height: 96px; }
.spark-bars.tight { gap: 2px; }
.bcol { flex: 1 1 0; min-width: 0; max-width: 132px; height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: flex-end; gap: 5px; }
.bval { font-size: 11px; line-height: 1; color: var(--text); font-variant-numeric: tabular-nums; white-space: nowrap; }
.bday { font-size: 11px; line-height: 1; color: var(--text-3); font-variant-numeric: tabular-nums; white-space: nowrap; }
/* A bar keeps a visible stub at zero: the day exists and reads as zero, it is not missing. */
.bfill { width: 60%; max-width: 48px; height: 2px; border-radius: 3px 3px 0 0; background: var(--text-3); }
@media (max-width: 460px) { .bval, .bday { font-size: 10px; } }
.acts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
button { font: inherit; font-size: 14px; height: 32px; padding: 0 14px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); cursor: pointer;
  transition: background .15s, border-color .15s, color .15s; }
button:hover { background: var(--tint); border-color: transparent; color: var(--primary); }
/* A full-bleed primary is a phone pattern; on a wide card it reads as a banner. Keep it a
   normal button and let it keep its natural width. */
button.primary { height: 36px; flex: 0 0 auto; min-width: 200px; background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 500; }
button.primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); color: #fff; }
@media (max-width: 560px) { button.primary { flex: 1 1 100%; } }
button[disabled] { cursor: default; opacity: .6; }
.icon { width: 16px; height: 16px; display: block; }
details { margin-top: 12px; }
summary { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; color: var(--text-2);
  cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary::before { content: "\\25B8"; font-size: 10px; }
details[open] summary::before { content: "\\25BE"; }
pre { margin: 8px 0 0; padding: 10px; border-radius: 8px; background: var(--bg); border: 1px solid var(--line);
  font-family: var(--mono); font-size: 12px; color: var(--text-2); overflow: auto; max-height: 220px; }
.note { margin: 8px 0 0; font-size: 12px; color: var(--text-2); }
/* One metric, four numbers: a table puts them on one line and leaves the trailing column for the
   time each number belongs to, instead of four stacked "label: value" rows. */
.mtable { width: 100%; border-collapse: collapse; margin-top: 2px; font-variant-numeric: tabular-nums; }
.mtable th, .mtable td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: baseline; }
.mtable thead th { font-size: 12px; font-weight: 500; color: var(--text-3); padding-top: 0; padding-bottom: 6px; }
.mtable tbody th { font-weight: 400; color: var(--text-2); font-size: 13px; white-space: nowrap; }
.mtable td.num { font-family: var(--mono); font-size: 14px; }
.mtable td.sub { color: var(--text-3); font-size: 12px; }
.mtable tbody tr:last-child th, .mtable tbody tr:last-child td { border-bottom: none; }
</style>
</head>
<body>
<!-- Lucide glyphs, inline: no network, no icon font, no data URI. Buttons point a <use> at one of
     these; swapping an icon is one attribute write. -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="ico-rocket" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></symbol>
<symbol id="ico-lifebuoy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/><circle cx="12" cy="12" r="4"/></symbol>
<symbol id="ico-calendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h5"/><path d="M17.5 17.5 16 16.3V14"/><circle cx="16" cy="16" r="6"/></symbol>
<symbol id="ico-card" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></symbol>
<symbol id="ico-chart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/></symbol>
<symbol id="ico-log" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></symbol>
<symbol id="ico-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></symbol>
</defs></svg>
<div class="panel">
  <div class="brand">
    <span class="brand-l">
      <span class="logo">
        <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M-0.00195272 13.364C-0.0021879 13.0869 0.100481 12.8097 0.306053 12.5947L8.64438 4.25689C8.74869 4.15259 8.89015 4.09399 9.03766 4.09399H19.6942C20.1894 4.09399 20.4377 4.69236 20.088 5.04296L11.7889 13.364H-0.00195272Z" fill="#67E9E9"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M-0.00195272 13.366C-0.00218796 13.6431 0.100474 13.9203 0.306033 14.1353L8.64438 22.4731C8.74869 22.5774 8.89015 22.636 9.03766 22.636H19.6942C20.1894 22.636 20.4377 22.0376 20.088 21.687L11.7889 13.366H-0.00195272Z" fill="#2BCCCC"/>
          <path fill-rule="evenodd" clip-rule="evenodd" d="M35.999 22.2539C35.9993 21.9781 35.8977 21.7023 35.6942 21.4877L27.3527 13.1468C27.2484 13.0425 27.1069 12.9839 26.9594 12.9839H16.3029C15.8077 12.9839 15.5594 13.5823 15.9091 13.9328L24.2081 22.2539H35.999Z" fill="#4896FF"/>
          <path class="lp-brand" fill-rule="evenodd" clip-rule="evenodd" d="M35.999 22.2534C35.9994 22.526 35.9002 22.7987 35.7015 23.0123L27.3527 31.3605C27.2484 31.4648 27.1069 31.5234 26.9594 31.5234H16.3029C15.8077 31.5234 15.5594 30.9251 15.9091 30.5745L24.2081 22.2534H35.999Z" fill="#0052D9"/>
        </svg>
      </span>
      <span class="brand-name">CloudBase</span>
    </span>
    <span class="brand-r">
      <span class="brand-alias" id="brand-alias"></span>
      <span class="plan-tag" id="brand-plan" hidden></span>
      <button class="icon-btn" type="button" id="btn-copy-env" title="${E(L("mcpUiCredits.brand.copyEnvId"))}" aria-label="${E(L("mcpUiCredits.brand.copyEnvId"))}">
        <svg class="icon" id="ico-copy-env" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
        <svg class="icon" id="ico-check-env" hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
      </button>
    </span>
  </div>

  <div class="card">
    <div class="t1">
      <h1 id="c-title"></h1>
      <span class="st"><span class="dot" id="st-dot"></span><span id="st-text"></span></span>
    </div>
    <p class="t2" id="c-hint"></p>
    <div class="t3">
      <div class="col" id="col-a">
        <div class="field" id="f-credits" hidden>
          <p class="k">${E(L("mcpUiCredits.field.credits"))}</p>
          <p class="big"><span id="k-pct"></span><span class="v mono" id="k-credits"></span></p>
          <div class="ubar" id="ubar-box" hidden><i id="ubar"></i></div>
        </div>
        <div class="field" id="f-payg" hidden>
          <p class="k">${E(L("mcpUiCredits.field.payg"))}</p>
          <p class="v mono" id="k-payg"></p>
        </div>
        <div class="field" id="f-package" hidden>
          <p class="k">${E(L("mcpUiCredits.field.package"))}</p>
          <p class="v mono" id="k-package"></p>
        </div>
        <div class="field" id="f-mods" hidden>
          <p class="k">${E(L("mcpUiCredits.field.modules"))}</p>
          <div class="mods-row">
            <div class="mods" id="k-mods"></div>
            <button class="tagbtn" type="button" id="btn-all-mods" hidden><span id="btn-all-mods-label"></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
          </div>
          <p class="mods-sum" id="k-mods-sum" hidden></p>
        </div>
      </div>
      <div class="col" id="col-b">
        <div class="field" id="f-plan" hidden>
          <p class="k">${E(L("mcpUiCredits.field.plan"))}</p>
          <p class="v" id="k-plan"></p>
        </div>
        <div class="field" id="f-balance" hidden>
          <p class="k">${E(L("mcpUiCredits.field.balance"))}</p>
          <p class="v mono" id="k-balance"></p>
        </div>
        <div class="field" id="f-place">
          <p class="k">${E(L("mcpUiCredits.field.place"))}</p>
          <p class="v" id="k-place">${E(placeText)}</p>
        </div>
      </div>
      <div class="spark" id="f-spark" hidden>
        <div class="spark-bars" id="spark-bars"></div>
      </div>
      <table class="mtable" id="f-m-table" hidden>
        <thead>
          <tr>
            <th scope="col">${E(L("mcpUiCredits.metric.field.name"))}</th>
            <th scope="col">${E(L("mcpUiCredits.metric.field.value"))}</th>
            <th scope="col">${E(L("mcpUiCredits.metric.field.note"))}</th>
          </tr>
        </thead>
        <tbody>
          <tr id="f-m-latest" hidden><th scope="row">${E(L("mcpUiCredits.metric.field.latest"))}</th><td class="num" id="k-m-latest"></td><td class="sub" id="k-m-latest-note"></td></tr>
          <tr id="f-m-peak" hidden><th scope="row">${E(L("mcpUiCredits.metric.field.peak"))}</th><td class="num" id="k-m-peak"></td><td class="sub" id="k-m-peak-note"></td></tr>
          <tr id="f-m-avg" hidden><th scope="row">${E(L("mcpUiCredits.metric.field.avg"))}</th><td class="num" id="k-m-avg"></td><td class="sub" id="k-m-avg-note"></td></tr>
          <tr id="f-m-window" hidden><th scope="row">${E(L("mcpUiCredits.metric.field.window"))}</th><td class="num" id="k-m-window"></td><td class="sub" id="k-m-window-note"></td></tr>
        </tbody>
      </table>
      <p class="note" id="k-expired" hidden></p>
    </div>
    <p class="note" id="k-copynote" hidden></p>
    <div class="acts">
      <button class="primary" type="button" id="btn-main" hidden><svg class="icon" aria-hidden="true"><use id="ico-main" href="#ico-rocket"/></svg><span id="btn-main-label"></span></button>
      <button type="button" id="btn-tip" hidden>${E(L("mcpUiCredits.action.nearLimit"))}</button>
      <button type="button" id="btn-link" hidden>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
        <span id="btn-link-label"></span>
      </button>
    </div>
    <details>
      <summary>${E(L("mcpUiCredits.fold.raw"))}</summary>
      <pre id="raw-out"></pre>
    </details>
  </div>
</div>
<script>
(function () {
  var host = window.parent;
${CREDENTIAL_GUARD_JS}
  var pending = {};
  var nextId = 1;
  function post(message) { host.postMessage(message, "*"); }
  function request(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  }
  function notify(method, params) { post({ jsonrpc: "2.0", method: method, params: params }); }
  function setText(el, value) { if (el) { el.textContent = value; } }
  /**
   * Report the height of the card, not of the viewport.
   *
   * documentElement.scrollHeight is at least as tall as the frame the host gave us, so reporting it
   * tells the host "keep this height" - and a short card then sits in a tall empty box. Measuring
   * the panel itself lets the host shrink to the content.
   */
  function reportSize() {
    var width = document.documentElement.scrollWidth;
    var height = document.documentElement.scrollHeight;
    var root = null;
    try { root = document.querySelector("main.panel, .panel, .screen"); } catch (error) { root = null; }
    if (root && root.getBoundingClientRect) {
      var rect = root.getBoundingClientRect();
      if (rect.height > 0) { height = Math.ceil(rect.height); }
    }
    notify("ui/notifications/size-changed", { width: width, height: height });
  }
  function el(id) { return document.getElementById(id); }

  var T = {
    title: ${S("mcpUiCredits.title")},
    placeOpen: ${S("mcpUi.place.open")},
    placeClose: ${S("mcpUi.place.close")},
    region: { ${dirTable(REGION_LABEL_DIR)} },
    site: { ${dirTable(SITE_LABEL_DIR)} },
    titleSep: ${S("mcpUiCredits.title.sep")},
    currency: ${S("mcpUiCredits.value.currency")},
    unavailable: ${S("mcpUiCredits.value.unavailable")},
    copiedConsole: ${S("mcpUiCredits.action.copiedConsole")},
    copiedExpense: ${S("mcpUiCredits.action.copiedExpense")},
    copyEnvId: ${S("mcpUiCredits.brand.copyEnvId")},
    copyCopied: ${S("mcpUiCredits.copy.copied")},
    copyFailed: ${S("mcpUiCredits.copy.failed")},
    messageFailed: ${S("mcpUiCredits.message.failed")},
    messageNearLimit: ${S("mcpUiCredits.message.nearLimit")},
    openConsole: ${S("mcpUiCredits.action.openConsole")},
    openExpense: ${S("mcpUiCredits.action.openExpense")},
    expiredNote: ${S("mcpUiCredits.expired.note")},
    stateUnknown: ${S("mcpUiCredits.state.unknown")},
    stateFiltered: ${S("mcpUiCredits.state.filtered")},
    stateNotCredits: ${S("mcpUiCredits.state.notCredits")},
    stateNormal: ${S("mcpUiCredits.state.normal")},
    hintUnknown: ${S("mcpUiCredits.hint.unknown")},
    hintNotCredits: ${S("mcpUiCredits.hint.notCredits")},
    hintNormal: ${S("mcpUiCredits.hint.normal")},
    actionSwitchEnv: ${S("mcpUiCredits.action.switchEnv")},
    messageSwitchEnv: ${S("mcpUiCredits.message.switchEnv")},
    plan: {
      trial: ${S("mcpUiCredits.plan.trial")},
      personal: ${S("mcpUiCredits.plan.personal")},
      standard: ${S("mcpUiCredits.plan.standard")},
      enterprise: ${S("mcpUiCredits.plan.enterprise")},
      enterpriseAdvanced: ${S("mcpUiCredits.plan.enterpriseAdvanced")}
    },
    // Metrics labels: enum -> dict key. Unmapped enums fall back to generic; a raw code is never printed.
    metric: {
      generic: ${S("mcpUiCredits.metric.generic")},
      GatewayTraceEnvQPS: ${S("mcpUiCredits.metric.GatewayTraceEnvQPS")},
      EnvQPSAll: ${S("mcpUiCredits.metric.EnvQPSAll")},
      FunctionInvocation: ${S("mcpUiCredits.metric.FunctionInvocation")},
      FunctionError: ${S("mcpUiCredits.metric.FunctionError")},
      FunctionTimeout: ${S("mcpUiCredits.metric.FunctionTimeout")},
      FunctionThrottle: ${S("mcpUiCredits.metric.FunctionThrottle")},
      FunctionDuration: ${S("mcpUiCredits.metric.FunctionDuration")},
      FunctionConcurrentExecutions: ${S("mcpUiCredits.metric.FunctionConcurrentExecutions")},
      DbRead: ${S("mcpUiCredits.metric.DbRead")},
      DbWrite: ${S("mcpUiCredits.metric.DbWrite")},
      DbSizepkg: ${S("mcpUiCredits.metric.DbSizepkg")},
      MysqlCpuUsageRate: ${S("mcpUiCredits.metric.MysqlCpuUsageRate")},
      MysqlMemoryUse: ${S("mcpUiCredits.metric.MysqlMemoryUse")},
      MysqlStorageUsage: ${S("mcpUiCredits.metric.MysqlStorageUsage")},
      MysqlQps: ${S("mcpUiCredits.metric.MysqlQps")},
      MysqlSlowQueries: ${S("mcpUiCredits.metric.MysqlSlowQueries")},
      MysqlDbConnections: ${S("mcpUiCredits.metric.MysqlDbConnections")},
      TkeCpuUsedService: ${S("mcpUiCredits.metric.TkeCpuUsedService")},
      TkeMemUsedService: ${S("mcpUiCredits.metric.TkeMemUsedService")},
      TkeQPSService: ${S("mcpUiCredits.metric.TkeQPSService")},
      TkeHttpErrorService: ${S("mcpUiCredits.metric.TkeHttpErrorService")},
      TkeInvokeNumService: ${S("mcpUiCredits.metric.TkeInvokeNumService")}
    },
    metricState: {
      data: ${S("mcpUiCredits.metric.state.data")},
      noData: ${S("mcpUiCredits.metric.state.noData")},
      failed: ${S("mcpUiCredits.metric.state.failed")}
    },
    metricHint: {
      data: ${S("mcpUiCredits.metric.hint.data")},
      noData: ${S("mcpUiCredits.metric.hint.noData")},
      failed: ${S("mcpUiCredits.metric.hint.failed")}
    },
    metricAction: {
      data: ${S("mcpUiCredits.metric.action.data")},
      noData: ${S("mcpUiCredits.metric.action.noData")},
      failed: ${S("mcpUiCredits.metric.action.failed")}
    },
    metricMessage: {
      data: ${S("mcpUiCredits.metric.message.data")},
      noData: ${S("mcpUiCredits.metric.message.noData")},
      failed: ${S("mcpUiCredits.metric.message.failed")}
    },
    stateNearLimit: ${S("mcpUiCredits.state.nearLimit")},
    hintNearLimit: ${S("mcpUiCredits.hint.nearLimit")},
    hintUnknownWithUsage: ${S("mcpUiCredits.hint.unknownWithUsage")},
    hintFiltered: ${S("mcpUiCredits.hint.filtered")},
    actionAllModules: ${S("mcpUiCredits.action.allModules")},
    modulesTotal: ${S("mcpUiCredits.modules.total")},
    modulesInPlan: ${S("mcpUiCredits.modules.inPlan")},
    messageQueryAllModules: ${S("mcpUiCredits.message.queryAllModules")},
    metricSamples: ${S("mcpUiCredits.metric.samples")},
    metricEvery: ${S("mcpUiCredits.metric.every")},
    // Interval (seconds -> words). An unnameable interval shows samples only, never an invented unit.
    metricPeriod: {
      "300": ${S("mcpUiCredits.metric.period.minute")},
      "3600": ${S("mcpUiCredits.metric.period.hour")},
      "86400": ${S("mcpUiCredits.metric.period.day")}
    },
    // Unit words come from the real console rendering (invocations -> times, runtime -> ms,
    // compute usage -> GBs / CU) plus the package page (GB / KB / 10k times / %).
    metricUnit: {
      perSec: ${S("mcpUiCredits.metric.unit.perSec")},
      item: ${S("mcpUiCredits.metric.unit.item")},
      count: ${S("mcpUiCredits.metric.unit.count")},
      ms: ${S("mcpUiCredits.metric.unit.ms")},
      gbs: ${S("mcpUiCredits.metric.unit.gbs")},
      cu: ${S("mcpUiCredits.metric.unit.cu")},
      gb: ${S("mcpUiCredits.metric.unit.gb")},
      percent: ${S("mcpUiCredits.metric.unit.percent")}
    },
    metricUnitWrap: ${S("mcpUiCredits.metric.unitWrap")},
    metricUnitSuffix: ${S("mcpUiCredits.metric.unitSuffix")},
    module: {
      functions: ${S("mcpUiCredits.module.functions")},
      database: ${S("mcpUiCredits.module.database")},
      storage: ${S("mcpUiCredits.module.storage")},
      ai: ${S("mcpUiCredits.module.ai")},
      auth: ${S("mcpUiCredits.module.auth")},
      api: ${S("mcpUiCredits.module.api")},
      http: ${S("mcpUiCredits.module.http")},
      hosting: ${S("mcpUiCredits.module.hosting")},
      workflow: ${S("mcpUiCredits.module.workflow")},
      other: ${S("mcpUiCredits.module.other")}
    }
  };

  // One main action per screen: an empty main means this branch has nothing to press.
  var BRANCHES = {
    unknown: { dot: "", text: T.stateUnknown, hint: T.hintUnknown, main: "", msg: "", link: "", icon: "" },
    normal: { dot: "ok", text: T.stateNormal, hint: T.hintNormal, main: "", msg: "", link: "", icon: "" },
    trialExhausted: {
      dot: "warn", text: ${S("mcpUiCredits.state.trialExhausted")}, hint: ${S("mcpUiCredits.hint.trialExhausted")},
      main: ${S("mcpUiCredits.action.upgrade")}, msg: ${S("mcpUiCredits.message.upgrade")}, link: "package", icon: "rocket"
    },
    stopped: {
      dot: "err", text: ${S("mcpUiCredits.state.stopped")}, hint: ${S("mcpUiCredits.hint.stopped")},
      main: ${S("mcpUiCredits.action.recommendRestore")}, msg: ${S("mcpUiCredits.message.restore")}, link: "package", icon: "lifebuoy"
    },
    expired: {
      dot: "err", text: ${S("mcpUiCredits.state.expired")}, hint: ${S("mcpUiCredits.hint.expired")},
      main: ${S("mcpUiCredits.action.renew")}, msg: ${S("mcpUiCredits.message.renew")}, link: "renew", icon: "calendar"
    },
    arrears: {
      dot: "err", text: ${S("mcpUiCredits.state.arrears")}, hint: ${S("mcpUiCredits.hint.arrears")},
      main: ${S("mcpUiCredits.action.guidedTopup")}, msg: ${S("mcpUiCredits.message.topup")}, link: "expense", icon: "card"
    }
  };

  // Console links are composed at click time from the live env id + site, so no URL literal
  // lives in this template: only host tables and the hash fragment are injected.
  var ENV_HASH = ${JSON.stringify(ENV_CREDITS_ENV_LINK_HASH)};
  var DEV_HOST = ${JSON.stringify(CONSOLE_HOST_BY_SITE)};
  var BILL_HOST = ${JSON.stringify(ENV_CREDITS_BILLING.host)};
  var BILL_PATH = ${J(ENV_CREDITS_BILLING.path)};
  var LINK_LABEL = { package: T.openConsole, renew: T.openConsole, expense: T.openExpense };

  // Local fallback only fills fields the tool result does not carry; live values always win.
  // FALLBACK comes from main (it carries siteCode, needed to build the console link on click).
  // current is the union: main's site for links, plus this branch's mainMsg / kind / metricName.
  var FALLBACK = { envAlias: "", envId: ${J(fallback.envId ?? "")}, siteCode: ${J(fallback.site)}, site: ${J(siteText)}, region: ${J(regionText)} };
  var current = { branch: "unknown", envId: FALLBACK.envId, site: "domestic", link: "", mainMsg: "", kind: "credits", metricName: "" };

  function fmtNumber(value) {
    var n = Math.round(Number(value));
    return String(n).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
  }
  function planLabel(payload) {
    // Only names we can translate are shown; an unrecognized package id is never printed raw.
    if (payload && payload.plan && T.plan[payload.plan]) { return T.plan[payload.plan]; }
    return "";
  }
  // The axis label is the smallest unit the data actually carries: a clock time when the point is
  // stamped with one, a month-day otherwise. A stamp we cannot parse prints nothing, never a guess.
  // Daily usage is always stamped 00:00:00 - that is not "some moment", it is "this whole day", so
  // midnight falls back to the date instead of printing a column of identical 00:00 labels.
  function shortStamp(calcTime) {
    var text = typeof calcTime === "string" ? calcTime.trim() : "";
    if (!text) { return ""; }
    var halves = text.split(" ");
    var clock = halves.length > 1 ? halves[1].slice(0, 5) : "";
    if (clock && clock !== "00:00") { return clock; }
    var parts = halves[0].split("-");
    return parts.length === 3 ? parts[1] + "-" + parts[2] : "";
  }
  var SPARK_BAR_MAX = 58;
  // Past a handful of bars a number over each one becomes noise, so the text steps aside and the
  // bar heights carry the reading; the per-bar tooltip still has the figure.
  var SPARK_TEXT_MAX_POINTS = 8;

  function renderSpark(values, stamps) {
    var box = el("spark-bars");
    if (!box) { return; }
    box.textContent = "";
    if (!values || !values.length) { return; }
    var max = 0;
    for (var i = 0; i < values.length; i++) {
      if (values[i] > max) { max = values[i]; }
    }
    if (max <= 0) { max = 1; }
    var withText = values.length <= SPARK_TEXT_MAX_POINTS;
    box.className = "spark-bars" + (values.length > 16 ? " tight" : "");
    for (var j = 0; j < values.length; j++) {
      var value = Number(values[j]) || 0;
      var stamp = stamps && stamps[j] ? stamps[j] : "";
      var col = document.createElement("div");
      col.className = "bcol";
      if (withText) {
        var num = document.createElement("span");
        num.className = "bval";
        num.textContent = fmtNumber(value);
        col.appendChild(num);
      }
      var bar = document.createElement("i");
      bar.className = "bfill";
      bar.style.height = Math.max(2, Math.round((value / max) * SPARK_BAR_MAX)) + "px";
      bar.title = (stamp ? stamp + ": " : "") + fmtNumber(value);
      col.appendChild(bar);
      if (withText && stamp) {
        var day = document.createElement("span");
        day.className = "bday";
        day.textContent = stamp;
        col.appendChild(day);
      }
      box.appendChild(col);
    }
  }
  // Live values win per field; local config only fills a field the result does not carry.
  // A code we cannot translate is never printed raw: that field falls back to local config.
  function codeLabel(table, code) {
    if (!code || typeof code !== "string") { return ""; }
    return table[code] || "";
  }
  function placeOf(payload) {
    // A live value is never replaced by the local one: when we cannot translate a code the row
    // says so, instead of quietly showing this machine's location. Only a missing field falls back.
    var regionLive = hasField(payload, "current_region");
    var siteLive = hasField(payload, "site");
    var region = regionLive ? codeLabel(T.region, payload.current_region) : FALLBACK.region;
    var site = siteLive ? codeLabel(T.site, payload.site) : FALLBACK.site;
    if (regionLive && !region) { region = T.unavailable; }
    if (siteLive && !site) { site = T.unavailable; }
    if (region && site) {
      if (region === T.unavailable && site === T.unavailable) { return T.unavailable; }
      return region + T.placeOpen + site + T.placeClose;
    }
    return region || site || T.unavailable;
  }
  function hasField(payload, key) {
    return !!payload && typeof payload === "object" && key in payload;
  }
  function linkSite(payload) {
    // The console host we hand out follows the live site code. A missing or unrecognized code
    // falls back to the local one instead of guessing a host from something we cannot read.
    var code = hasField(payload, "site") && typeof payload.site === "string" ? payload.site : "";
    if (code !== "domestic" && code !== "intl") { code = FALLBACK.siteCode; }
    if (code !== "domestic" && code !== "intl") { code = "domestic"; }
    return code;
  }
  function consoleLink(key) {
    if (key === "expense") { return "https://" + BILL_HOST[current.site] + BILL_PATH; }
    // No link for a branch that has none: an empty fragment is never handed out.
    if (!ENV_HASH[key]) { return ""; }
    var query = current.envId ? "?envId=" + encodeURIComponent(current.envId) : "";
    return "https://" + DEV_HOST[current.site] + "/dev" + query + "#" + ENV_HASH[key];
  }
  function branchOf(payload) {
    if (!payload || typeof payload.branch !== "string") { return "unknown"; }
    return BRANCHES[payload.branch] ? payload.branch : "unknown";
  }
  /**
   * Metric -> unit key. An empty string means the unit is NOT determined, and today that is exactly
   * one metric (MysqlDbConnections: the console dashboard timed out before showing it), so we show
   * none rather than inventing one. A new metric has to state its unit here explicitly - a test
   * walks the enum and fails otherwise.
   *
   * The QPS family reads the "per second" unit because the console's QPS page states the figure as
   * requests per second, and concurrency reads the "count of instances" unit because the dashboard's
   * function view words it as concurrent executions (count). Both words are transcribed from those
   * console pages - the exact Chinese wording lives in the dictionary module, never invented here.
   */
  var METRIC_UNIT_KEY = {
    GatewayTraceEnvQPS: "perSec",
    EnvQPSAll: "perSec",
    FunctionInvocation: "count",
    FunctionError: "count",
    FunctionTimeout: "count",
    FunctionThrottle: "count",
    FunctionDuration: "ms",
    FunctionConcurrentExecutions: "item",
    DbRead: "count",
    DbWrite: "count",
    DbSizepkg: "gb",
    MysqlCpuUsageRate: "percent",
    MysqlMemoryUse: "gbs",
    MysqlStorageUsage: "gb",
    MysqlQps: "perSec",
    MysqlSlowQueries: "count",
    MysqlDbConnections: "",
    TkeCpuUsedService: "cu",
    TkeMemUsedService: "gbs",
    TkeQPSService: "perSec",
    TkeHttpErrorService: "count",
    TkeInvokeNumService: "count"
  };

  /** Unit word for this metric, or "" when the unit is not determined (never invented). */
  function metricUnitOf(payload) {
    if (!payload || typeof payload.metric !== "string") { return ""; }
    var key = METRIC_UNIT_KEY[payload.metric];
    return key ? (T.metricUnit[key] || "") : "";
  }

  /**
   * Metric numbers keep their decimals: the console does not round them away (it shows 4.52 / 88.3),
   * and the server already hands us floats (avg 16.043478260869566). Two decimals is enough to read
   * a metric, and trailing zeros are dropped so whole numbers stay whole (18, not 18.00).
   * Credits keep using fmtNumber (Math.round) - those are integer resource points, untouched here.
   */
  function fmtMetricValue(value) {
    var n = Number(value);
    if (!isFinite(n)) { return ""; }
    var parts = String(Math.round(n * 100) / 100).split(".");
    parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
    return parts.join(".");
  }
  function withUnit(text, unit) {
    return unit ? T.metricUnitSuffix.replace("{value}", text).replace("{unit}", unit) : text;
  }

  /** Discriminator: kind === "metrics" renders the metrics view; anything else renders credits. */
  function payloadKind(payload) {
    return payload && payload.kind === "metrics" ? "metrics" : "credits";
  }
  /** Metric label: enum -> dict, falling back to the generic title - never the raw code. */
  function metricLabel(payload) {
    if (!payload || typeof payload.metric !== "string") { return T.metric.generic; }
    return T.metric[payload.metric] || T.metric.generic;
  }
  /** Brand bar + place row, shared by both views: identity does not depend on the view. */
  function applyBrand(payload) {
    var alias = hasField(payload, "env_alias") && payload.env_alias ? String(payload.env_alias) : FALLBACK.envAlias;
    var envId = hasField(payload, "env_id") ? (payload.env_id ? String(payload.env_id) : "") : FALLBACK.envId;
    current.envId = envId;
    var brandAlias = el("brand-alias");
    setText(brandAlias, envId);
    if (brandAlias) {
      brandAlias.hidden = !envId;
      brandAlias.title = envId ? T.copyEnvId : "";
    }
    var plan = payload ? planLabel(payload) : "";
    var brandPlan = el("brand-plan");
    brandPlan.hidden = !plan;
    setText(brandPlan, plan);
    setText(el("k-place"), placeOf(payload));
    // main builds the console link on click from this payload's site, so site must follow the
    // payload here too - and both views go through applyBrand, so both keep it up to date.
    current.site = linkSite(payload);
    var copyEnv = el("btn-copy-env");
    copyEnv.hidden = !envId;
    return { alias: alias, envId: envId, plan: plan };
  }
  function hideAll(ids) {
    for (var i = 0; i < ids.length; i++) {
      var node = el(ids[i]);
      if (node) { node.hidden = true; }
    }
  }
  /** Credits-only blocks, hidden while the metrics view renders. */
  var CREDITS_ONLY = ["col-a", "col-b", "f-credits", "f-payg", "f-package", "f-mods", "f-plan", "f-balance", "k-expired", "ubar-box"];
  /** Metrics-only blocks, hidden while the credits view renders. */
  var METRICS_ONLY = ["f-m-table", "f-m-latest", "f-m-peak", "f-m-avg", "f-m-window"];

  /**
   * Metrics view (single-metric trend card): one call = one metric + one resource.
   *
   * The three states come from real data only, with no invented thresholds: failed is set by the panel
   * for an error result, sampleCount 0 or all-zero is noData, otherwise data. Nothing here knows
   * what a good value is, so the curve colour follows the state, not the value.
   */
  function renderMetrics(payload) {
    var state = payload && T.metricState[payload.state] ? payload.state : "noData";
    var label = metricLabel(payload);
    current.kind = "metrics";
    current.metricName = payload && typeof payload.metric === "string" ? payload.metric : "";
    current.branch = "";
    current.link = "";
    // One label and one message per state: "no traffic" is the state closest to losing a user,
    // so it must not be worded as an anomaly hunt, and a failed query asks for a retry.
    var mainLabel = T.metricAction[state] || T.metricAction.noData;
    var mainMessage = T.metricMessage[state] || T.metricMessage.noData;
    current.mainMsg = mainMessage.replace("{metric}", label);

    var brand = applyBrand(payload);
    hideAll(CREDITS_ONLY);
    var unit = metricUnitOf(payload);
    var titleLabel = unit
      ? T.metricUnitWrap.replace("{label}", label).replace("{unit}", unit)
      : label;
    setText(el("c-title"), titleLabel + (brand.alias ? T.titleSep + brand.alias : ""));
    setText(el("st-text"), T.metricState[state]);
    // Colour carries no health meaning on this card: "has data" is not "healthy" (a thousand
    // function errors are still data), so it stays neutral; a failed query is an operation
    // failure, not an environment problem, and red here would be read as the latter - the state
    // word and the action button carry the meaning instead.
    el("st-dot").className = "dot";
    setHint(T.metricHint[state]);

    // Four numbers that belong to the same metric share one table: a row each, and the third
    // column carries what the number alone cannot say (when the peak happened, how the samples
    // are spaced). A value the result does not carry keeps its row hidden - never a dash.
    el("f-m-table").hidden = false;

    var latest = payload && typeof payload.latest === "number" ? payload.latest : null;
    var fLatest = el("f-m-latest");
    fLatest.hidden = latest === null;
    if (latest !== null) { setText(el("k-m-latest"), withUnit(fmtMetricValue(latest), unit)); }

    var peak = payload && typeof payload.max === "number" ? payload.max : null;
    var peakTime = payload && typeof payload.peak_time === "string" && payload.peak_time ? payload.peak_time : "";
    var fPeak = el("f-m-peak");
    fPeak.hidden = peak === null;
    if (peak !== null) {
      setText(el("k-m-peak"), withUnit(fmtMetricValue(peak), unit));
      setText(el("k-m-peak-note"), peakTime);
    }

    var avg = payload && typeof payload.avg === "number" ? payload.avg : null;
    var fAvg = el("f-m-avg");
    fAvg.hidden = avg === null;
    if (avg !== null) { setText(el("k-m-avg"), withUnit(fmtMetricValue(avg), unit)); }

    // samples and interval: an unnameable interval shows samples only
    var samples = payload && typeof payload.sample_count === "number" ? payload.sample_count : 0;
    var period = payload && payload.period_seconds ? T.metricPeriod[String(payload.period_seconds)] : "";
    var fWindow = el("f-m-window");
    fWindow.hidden = samples <= 0;
    if (!fWindow.hidden) {
      // The row label already names the unit; repeating it inside the cell says it twice.
      setText(el("k-m-window"), String(samples));
      setText(el("k-m-window-note"), period ? T.metricEvery.replace("{period}", period) : "");
    }

    // One bar per sample in the space the curve used to take. A single sample is one honest bar -
    // the "needs two points" rule belonged to the line - and noData stays undrawn.
    var values = [];
    var stamps = [];
    if (payload && payload.spark && payload.spark.length) {
      for (var i = 0; i < payload.spark.length; i++) {
        values.push(Number(payload.spark[i].credits_value || 0));
        stamps.push(shortStamp(payload.spark[i].calc_time));
      }
    }
    var fSpark = el("f-spark");
    // All-zero means no traffic; a drawn chart would read as "there is data", so we do not draw it.
    var sparkDrawn = values.length >= 1 && state !== "noData";
    fSpark.hidden = !sparkDrawn;
    renderSpark(sparkDrawn ? values : [], sparkDrawn ? stamps : []);

    // The single primary action hands the follow-up to the session; the panel calls no tools itself.
    var mainBtn = el("btn-main");
    mainBtn.hidden = false;
    setText(el("btn-main-label"), mainLabel);
    // One glyph per metric state: explain the curve / go read the logs / retry the query.
    setIcon(el("ico-main"), state === "data" ? "chart" : (state === "failed" ? "refresh" : "log"));
    mainBtn.disabled = false;
    var linkBtn = el("btn-link");
    linkBtn.hidden = true;
    var copyNote = el("k-copynote");
    if (copyNote) { copyNote.hidden = true; }
  }

  /** Empty hints leave no sentence under the status word; hide the node instead of a blank line. */
  function setHint(text) {
    var node = el("c-hint");
    var value = text || "";
    setText(node, value);
    if (node) { node.hidden = !value; }
  }

  /**
   * True when this payload is actually a credit reading: a known credit plan, a non-zero used
   * figure, module rows, or a sparkline. A zero used with none of those is an empty usage list,
   * which old non-credit packages also return. Absence of a payload is the list/info case.
   */
  function hasCreditSignal(payload) {
    if (!payload) { return false; }
    if (payload.plan && T.plan[payload.plan]) { return true; }
    var credits = payload.credits;
    if (credits && typeof credits.used === "number" && credits.used > 0) { return true; }
    if (payload.modules && payload.modules.length) { return true; }
    if (payload.spark && payload.spark.length) { return true; }
    return false;
  }

  function render(payload) {
    if (payloadKind(payload) === "metrics") { renderMetrics(payload); return; }
    hideAll(METRICS_ONLY);
    current.kind = "credits";
    var key = branchOf(payload);
    var branch = BRANCHES[key];
    current.branch = key;
    current.link = branch.link || "";
    current.mainMsg = branch.msg || "";

    var brand = applyBrand(payload);
    var alias = brand.alias;

    // Every render starts with the "cut usage" tip hidden; only the near-limit branch turns it on.
    var tipReset = el("btn-tip");
    if (tipReset) { tipReset.hidden = true; }
    setText(el("c-title"), T.title + (alias ? T.titleSep + alias : ""));
    setText(el("st-text"), branch.text);
    el("st-dot").className = "dot" + (branch.dot ? " " + branch.dot : "");
    setHint(branch.hint);

    var plan = payload ? planLabel(payload) : "";
    var fPlan = el("f-plan");
    fPlan.hidden = !plan;
    setText(el("k-plan"), plan);

    var credits = payload && payload.credits ? payload.credits : null;
    var total = credits && typeof credits.total === "number" ? credits.total : null;
    var used = credits && typeof credits.used === "number" ? credits.used : null;
    var pct = total !== null && total > 0 && used !== null ? Math.min(100, Math.round((used / total) * 100)) : null;

    // Show whatever we actually have: with an unknown quota the used figure still shows,
    // and no total is ever invented to fill the line.
    var fCredits = el("f-credits");
    fCredits.hidden = used === null;
    if (!fCredits.hidden) {
      setText(el("k-pct"), pct === null ? "" : pct + "%");
      setText(el("k-credits"), pct === null ? fmtNumber(used) : fmtNumber(used) + " / " + fmtNumber(total));
    }
    // The two other destinations of the same credit bill. Without them the module rows look like
    // they add up to more than the plan figure for no reason. Zero means the row would be noise.
    var payg = credits && typeof credits.payg === "number" && credits.payg > 0 ? credits.payg : null;
    var packCredits = credits && typeof credits.package === "number" && credits.package > 0 ? credits.package : null;
    var fPayg = el("f-payg");
    fPayg.hidden = payg === null;
    if (!fPayg.hidden) { setText(el("k-payg"), fmtNumber(payg)); }
    var fPackage = el("f-package");
    fPackage.hidden = packCredits === null;
    if (!fPackage.hidden) { setText(el("k-package"), fmtNumber(packCredits)); }
    // "Not enough data" is only true when nothing was read. With a used figure in hand, the honest
    // sentence names the one piece that is missing instead of denying the number on screen.
    if (key === "unknown" && used !== null) {
      // "Plan state is missing" only holds for the partial scope: when the caller filtered by
      // module the plan is right there, what is missing is a total on the same footing.
      var filteredScope = !!(payload && payload.scope === "filtered");
      if (filteredScope) { setText(el("st-text"), T.stateFiltered); }
      setHint(filteredScope ? T.hintFiltered : T.hintUnknownWithUsage);
    }
    var notCredits = key === "unknown" && !hasCreditSignal(payload);
    // A list/info result, or an environment that is not billed by credits, has no credit figure.
    // Name it as non-credit and offer a prompt CTA to switch / review plans.
    if (notCredits) {
      setText(el("st-text"), T.stateNotCredits);
      setHint(T.hintNotCredits);
      current.mainMsg = T.messageSwitchEnv;
    }
    var ubarBox = el("ubar-box");
    ubarBox.hidden = pct === null;
    if (pct !== null) {
      el("ubar").style.width = pct + "%";
      ubarBox.className = "ubar" + (pct < 80 ? " ok" : "");
      // The bar already turns red from 80% (an early warning we keep), so the wording has to
      // follow: a red bar next to "usage is within plan" is a contradiction on one screen.
      // Only for the two states that make no claim about the level (normal / unknown).
      current.pct = pct;
      if (pct >= 80 && (key === "normal" || key === "unknown")) {
        setText(el("st-text"), T.stateNearLimit.replace("{pct}", String(pct)));
        setHint(T.hintNearLimit.replace("{pct}", String(pct)));
        // The wording now says "near the limit", so the dot has to follow: a green dot next to a
        // red bar reads as two different verdicts on one screen.
        el("st-dot").className = "dot warn";
        // The sentence offers an upgrade path; the card has to hand one over instead of naming it.
        if (!current.link) { current.link = "package"; }
        var tipBtn = el("btn-tip");
        if (tipBtn) { tipBtn.hidden = false; }
      }
    }

    var mods = [];
    if (payload && payload.modules && payload.modules.length) {
      for (var i = 0; i < payload.modules.length; i++) {
        var m = payload.modules[i];
        var name = T.module[m.module] || "";
        if (!name) { continue; }
        mods.push({ key: m.module, name: name, value: fmtNumber(m.credits_value || 0), raw: Number(m.credits_value) || 0 });
      }
    }
    var fMods = el("f-mods");

    // Module tags. The tags are the rows that actually came back, not what the caller asked for:
    // a request for five modules that returns three rows shows three tags, each carrying its own
    // figure, so the scope statement and the breakdown are the same widget instead of two.
    var modsBox = el("k-mods");
    if (modsBox) {
      while (modsBox.firstChild) { modsBox.removeChild(modsBox.firstChild); }
      for (var t = 0; t < mods.length; t++) {
        var row = mods[t];
        var tag = document.createElement("span");
        tag.className = "mtag";
        var tagName = document.createElement("span");
        tagName.textContent = row.name;
        var tagValue = document.createElement("b");
        tagValue.textContent = row.value;
        tag.appendChild(tagName);
        tag.appendChild(tagValue);
        modsBox.appendChild(tag);
      }
    }
    // Narrowed query: one more tag offers the way back. It sits in the same row as the modules it
    // would replace, which is where a reader looks for it - not next to the title.
    var narrowed = !!(payload && payload.scope === "filtered");
    var allBtn = el("btn-all-mods");
    if (allBtn) {
      allBtn.hidden = !narrowed;
      setText(el("btn-all-mods-label"), T.actionAllModules);
      // The visible tag says what the row becomes; the tooltip says what the click does.
      allBtn.title = T.messageQueryAllModules;
    }
    fMods.hidden = mods.length === 0 && !narrowed;

    // What the rows add up to, said out loud. The headline counts plan-included usage; the rows
    // count everything consumed, including pay-as-you-go - on an over-quota environment the second
    // is much larger, and without this line the two numbers look like a contradiction.
    var sumBox = el("k-mods-sum");
    if (sumBox) {
      if (mods.length === 0) {
        sumBox.hidden = true;
      } else {
        var modSum = 0;
        for (var q = 0; q < mods.length; q++) { modSum += mods[q].raw; }
        var planUsed = payload && payload.credits && typeof payload.credits.used === "number" ? payload.credits.used : null;
        // Compare what actually gets printed: once both round to the same number, saying
        // "of which X in plan" just repeats itself.
        var differs = planUsed !== null && Math.round(modSum) !== Math.round(planUsed);
        setText(
          sumBox,
          differs
            ? T.modulesInPlan.replace("{n}", fmtNumber(modSum)).replace("{m}", fmtNumber(planUsed))
            : T.modulesTotal.replace("{n}", fmtNumber(modSum)),
        );
        sumBox.hidden = false;
      }
    }

    var values = [];
    var stamps = [];
    if (payload && payload.spark && payload.spark.length) {
      for (var j = 0; j < payload.spark.length; j++) {
        values.push(Number(payload.spark[j].credits_value || 0));
        stamps.push(shortStamp(payload.spark[j].calc_time));
      }
    }
    var fSpark = el("f-spark");
    fSpark.hidden = values.length === 0;
    renderSpark(fSpark.hidden ? [] : values, fSpark.hidden ? [] : stamps);

    var fBalance = el("f-balance");
    var balance = payload && typeof payload.balance === "number" ? payload.balance : null;
    fBalance.hidden = balance === null;
    if (balance !== null) {
      var negative = balance < 0;
      setText(el("k-balance"), (negative ? "-" : "") + T.currency + Math.abs(balance).toFixed(2));
    }

    var expiredNote = el("k-expired");
    var days = payload && typeof payload.isolated_days_left === "number" ? payload.isolated_days_left : null;
    expiredNote.hidden = key !== "expired" || days === null;
    if (!expiredNote.hidden) { setText(expiredNote, T.expiredNote.replace("{days}", String(days))); }

    var mainBtn = el("btn-main");
    var mainLabel = notCredits ? T.actionSwitchEnv : branch.main;
    var mainIcon = notCredits ? "rocket" : (branch.icon || "rocket");
    mainBtn.hidden = !mainLabel;
    if (mainLabel) {
      // Label and glyph sit in their own nodes: writing textContent on the button would delete
      // the icon on the next render.
      setText(el("btn-main-label"), mainLabel);
      setIcon(el("ico-main"), mainIcon);
      mainBtn.disabled = false;
    }
    var linkBtn = el("btn-link");
    linkBtn.hidden = !current.link;
    if (current.link) { setText(el("btn-link-label"), LINK_LABEL[current.link]); }

    var copyNote = el("k-copynote");
    if (copyNote) { copyNote.hidden = true; }
  }

  /**
   * Leaving the sandbox is the host's call: ui/open-link asks the host to open the URL in the
   * user's browser, and the host may refuse (scheme, allowlist, user cancel). The panel never
   * navigates itself and never opens a window on its own.
   */
  function openLink(url) {
    return request("ui/open-link", { url: url }).then(function (result) {
      if (result && result.isError) { throw new Error("denied"); }
      return true;
    });
  }

  /** Swap a button glyph: one <use> plus one <symbol> per icon, so this is one attribute write. */
  function setIcon(use, name) {
    if (use) { use.setAttribute("href", "#ico-" + name); }
  }

  /**
   * Copy, then report whether it worked: a silent copy is indistinguishable from a broken one
   * (the sandbox can deny clipboard access), so callers get a boolean back through onResult.
   */
  function copyText(text, onResult) {
    var done = onResult || function () {};
    if (!text) { done(false); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
      return;
    }
    try {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "readonly");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(area);
      done(ok !== false);
    } catch (error) {
      done(false);
    }
  }

  var COPY_FLASH_MS = 1500;

  /** 1.5s "copied" state; on failure the button title says to copy by hand. */
  function copyWithFeedback(text) {
    copyText(text, function (ok) {
      var copyNode = el("ico-copy-env");
      var checkNode = el("ico-check-env");
      var btn = el("btn-copy-env");
      var idleTitle = btn ? btn.title : "";
      if (copyNode) { copyNode.hidden = ok; }
      if (checkNode) { checkNode.hidden = !ok; }
      if (btn) {
        var label = ok ? T.copyCopied : T.copyFailed;
        btn.title = label;
        btn.setAttribute("aria-label", label);
      }
      if (!ok) {
        var note = el("k-copynote");
        if (note) { setText(note, T.copyFailed); note.hidden = false; }
      }
      setTimeout(function () {
        if (copyNode) { copyNode.hidden = false; }
        if (checkNode) { checkNode.hidden = true; }
        if (btn) { btn.title = idleTitle; btn.setAttribute("aria-label", idleTitle); }
      }, COPY_FLASH_MS);
    });
  }

  document.addEventListener("click", function (event) {
    var node = event.target && event.target.closest ? event.target.closest("button") : null;
    if (!node) { return; }
    if (node.id === "btn-copy-env") { copyWithFeedback(current.envId); return; }
    if (node.id === "btn-all-mods") {
      // Same relay as the near-limit tip: the panel cannot re-query, it can only ask the
      // conversation to. Refusing to relay falls back to the clipboard, never to a dead click.
      var allMsg = T.messageQueryAllModules;
      node.disabled = true;
      request("ui/message", { role: "user", content: { type: "text", text: allMsg } })
        .then(function () { node.disabled = false; }, function () {
          copyText(allMsg);
          node.disabled = false;
          var chipNote = el("k-copynote");
          if (chipNote) { setText(chipNote, T.messageFailed); chipNote.hidden = false; }
        });
      return;
    }
    if (node.id === "btn-tip") {
      var tipMsg = T.messageNearLimit.replace("{pct}", String(current.pct === null ? "" : current.pct)).replace("  ", " ");
      node.disabled = true;
      request("ui/message", { role: "user", content: { type: "text", text: tipMsg } })
        .then(function () { node.disabled = false; }, function () {
          // Host refuses to relay: hand the sentence over instead of leaving the click dead.
          copyText(tipMsg);
          node.disabled = false;
          var note = el("k-copynote");
          if (note) { setText(note, T.messageFailed); note.hidden = false; }
        });
      return;
    }
    if (node.id === "btn-link") {
      var url = consoleLink(current.link);
      if (!url) { return; }
      node.disabled = true;
      openLink(url).then(function () {
        node.disabled = false;
      }, function () {
        // A clicked button has to end somewhere useful even when the host refuses to open it,
        // so the URL lands in the clipboard and the note says exactly that.
        copyText(url);
        node.disabled = false;
        var copyNote = el("k-copynote");
        if (copyNote) {
          setText(copyNote, current.link === "expense" ? T.copiedExpense : T.copiedConsole);
          copyNote.hidden = false;
        }
      });
      return;
    }
    if (node.id === "btn-main") {
      var msg = current.mainMsg || "";
      if (!msg) { return; }
      node.disabled = true;
      request("ui/message", { role: "user", content: { type: "text", text: msg } })
        .catch(function () { node.disabled = false; });
      return;
    }
  });

  function readPayload(params) {
    if (!params || typeof params !== "object") { return null; }
    var candidate = params.structuredContent || params;
    if (!candidate || typeof candidate !== "object") { return null; }
    // Credits payloads are marked by branch, metrics payloads by kind; anything else is unreadable.
    if (typeof candidate.branch === "string") { return candidate; }
    if (candidate.kind === "metrics") { return candidate; }
    return null;
  }

  window.addEventListener("message", function (event) {
    // Only the host may drive this view. Origin cannot be checked here (a sandboxed view has no
    // comparable host origin, and the spec's own example posts with "*"), so the source window is
    // checked instead. It has to accept how hosts actually deliver: from the parent frame, from
    // this frame itself (a sandbox proxy that relays by posting here), and a null source (a
    // MessagePort relay). Measured on Codex's mcp-app-sandbox: allowing the parent frame only
    // dropped every result silently, which is why those two cases are allowed on purpose.
    if (event.source && event.source !== window.parent && event.source !== window) { return; }
    var data = event.data;
    if (!data || typeof data !== "object") { return; }
    if (data.method === "ui/notifications/tool-result") {
      var payload = readPayload(data.params);
      // A result we cannot read is never spread across the card: it goes to the fold only.
      if (payload) {
        render(payload);
      } else if (data.params && data.params.isError && current.kind === "metrics") {
        // A failed metrics call carries error text but no structuredContent. The panel must not fall back
        // to the credits view: it stays on metrics, reports the failure, and keeps the raw text in the fold.
        renderMetrics({ kind: "metrics", state: "failed", metric: current.metricName, sample_count: 0 });
      } else {
        render(null);
      }
      if (carriesCredentialBlock(data.params)) {
        // Credentials never reach the fold: this card explains state, it is not a JSON viewer.
        var rawPre = el("raw-out");
        if (rawPre) {
          setText(rawPre, "");
          if (rawPre.parentNode) { rawPre.parentNode.hidden = true; }
        }
      } else {
        setText(el("raw-out"), JSON.stringify(data.params, null, 2));
      }
      reportSize();
      return;
    }
    if (data.id !== undefined && pending[data.id]) {
      var entry = pending[data.id];
      delete pending[data.id];
      if (data.error) { entry.reject(data.error); } else { entry.resolve(data.result); }
    }
  });

  render(null);
  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    appCapabilities: { availableDisplayModes: ["inline"] },
    appInfo: { name: "cloudbase-env-credits", version: "1.0.0" },
    clientInfo: { name: "cloudbase-env-credits", version: "1.0.0" }
  }).then(function () {
    notify("ui/notifications/initialized", {});
    reportSize();
  }).catch(function () {
    reportSize();
  });
  window.addEventListener("resize", reportSize);
})();
</script>
</body>
</html>`;
}

/**
 * 注册 `ui://cloudbase/env-credits` 资源。
 *
 * `resources.listChanged = false` 的能力位覆盖由 `registerGetStartedResource` 统一执行
 * （两个面板同生命周期、同一次 initialize），此处不重复覆盖。
 */
export function registerEnvCreditsResource(server: ExtendedMcpServer): void {
  server.registerResource(
    "cloudbase-env-credits",
    new ResourceTemplate(ENV_CREDITS_RESOURCE_URI, { list: undefined }),
    {
      mimeType: ENV_CREDITS_MIME_TYPE,
      title: t("mcpUiCredits.resourceTitle"),
      description: t("mcpUiCredits.resourceDescription"),
    },
    async (uri) => {
      const startedAt = Date.now();
      const lang = resolvePanelLang();
      let success = true;
      let errorMessage: string | undefined;
      let bytes = 0;
      try {
        const html = buildEnvCreditsHtml(lang, resolveEnvCreditsFallback(server));
        bytes = Buffer.byteLength(html, "utf8");
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: ENV_CREDITS_MIME_TYPE,
              text: html,
              _meta: { ui: { prefersBorder: true } },
            },
          ],
        };
      } catch (error) {
        success = false;
        errorMessage = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        debug("[mcp-ui] resource read", {
          uri: ENV_CREDITS_RESOURCE_URI,
          mimeType: ENV_CREDITS_MIME_TYPE,
          bytes,
          lang,
        });
        const isTestEnvironment =
          process.env.NODE_ENV === "test" || process.env.VITEST === "true";
        if (!isTestEnvironment) {
          reportResourceRead({
            resourceUri: ENV_CREDITS_RESOURCE_URI,
            mimeType: ENV_CREDITS_MIME_TYPE,
            bytes,
            durationMs: Date.now() - startedAt,
            success,
            error: errorMessage,
            cloudBaseOptions: server.cloudBaseOptions,
            ide: server.ide || process.env.INTEGRATION_IDE,
            client: server.client || process.env.CLOUDBASE_MCP_CLIENT,
            mcpClientInfo: readMcpClientInfoFromServer(server),
            mcpClientCapabilities: readClientCapabilitiesFromServer(server),
          }).catch(() => {
            /* 遥测失败不影响资源读取 */
          });
        }
      }
    },
  );
}
