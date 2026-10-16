import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExtendedMcpServer } from "../server.js";
import { getInstanceLang, t, type Lang, type MessageKey } from "../i18n/index.js";
import { getCachedEnvId } from "../cloudbase-manager.js";
import {
  SITE_IDS,
  SITE_REGION_MAP,
  getConsoleDevUrl,
  normalizeSite,
  resolveSiteAndRegion,
  type SiteId,
} from "../utils/site-map.js";
import { debug } from "../utils/logger.js";
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
  credits?: { total?: number; used?: number } | null;
  modules?: Array<{ module?: CreditsModuleCode | string; credits_value?: number }>;
  spark?: Array<{ calc_time?: string; credits_value?: number }>;
  balance?: number | null;
  isolated_days_left?: number | null;
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
 * 从 server 实例派生静态兜底值。
 *
 * 环境 ID 的取值优先级（与 get-started 同口径，新增来源时同步两处）：
 *   ① 本次工具结果携带（面板侧覆盖，见 EnvCreditsPayload）
 *   → ② `server.cloudBaseOptions.envId` / `process.env.CLOUDBASE_ENV_ID`
 *   → ③ 进程缓存 `getCachedEnvId()`
 *   → ④ 降级：不显示 ID
 * hosted 是无状态的，进程缓存不可靠，因此 ③ 只是本地兜底；面板永远以工具结果为准。
 */
export function resolveEnvCreditsFallback(server: ExtendedMcpServer): EnvCreditsFallback {
  const envId =
    server.cloudBaseOptions?.envId || process.env.CLOUDBASE_ENV_ID || getCachedEnvId() || null;
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
.panel { width: 100%; max-width: 460px; margin: 0 auto; padding: 16px; }
.brand { height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  border-bottom: 1px solid var(--line); }
.brand-l { display: flex; align-items: center; gap: 8px; min-width: 0; }
.brand-l .logo svg { width: 20px; height: 20px; display: block; }
.brand-name { font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
.brand-r { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.brand-alias { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 13px; font-weight: 500; color: var(--text); }
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
.t3 { margin-top: 12px; }
.field { margin-top: 12px; }
.field .k { margin: 0 0 4px; font-size: 13px; color: var(--text-2); }
.field .v { margin: 0; font-size: 14px; font-variant-numeric: tabular-nums; }
.field .v.mono { font-family: var(--mono); font-size: 13px; }
.ubar { height: 6px; margin-top: 6px; border-radius: 3px; background: var(--bg); border: 1px solid var(--line); overflow: hidden; }
.ubar i { display: block; height: 100%; background: var(--err); }
.ubar.ok i { background: var(--ok); }
.mods { margin-top: 6px; font-size: 12px; color: var(--text-3); overflow-wrap: anywhere; }
.spark { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.spark-cap { font-size: 12px; color: var(--text-3); flex: 0 0 auto; }
.spark-box { position: relative; flex: 1; height: 44px; min-width: 0; margin-bottom: 14px; }
.spark-box::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 1px; background: var(--line); }
.spark-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.spark-line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; vector-effect: non-scaling-stroke; }
.spark-area { stroke: none; }
.spark-dot { position: absolute; width: 7px; height: 7px; border-radius: 50%; border: 1.5px solid var(--surface);
  transform: translate(-50%,-50%); background: var(--text-3); }
.spark-dot.ok { background: var(--ok); }
.spark-dot.err { background: var(--err); }
.acts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
button { font: inherit; font-size: 14px; height: 32px; padding: 0 14px; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); cursor: pointer;
  transition: background .15s, border-color .15s, color .15s; }
button:hover { background: var(--tint); border-color: transparent; color: var(--primary); }
button.primary { height: 36px; flex: 1 1 100%; background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 500; }
button.primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); color: #fff; }
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
</style>
</head>
<body>
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
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
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
      <div class="field" id="f-credits" hidden>
        <p class="k">${E(L("mcpUiCredits.field.credits"))}</p>
        <p class="v mono" id="k-credits"></p>
        <div class="ubar" id="ubar-box" hidden><i id="ubar"></i></div>
      </div>
      <div class="field" id="f-mods" hidden>
        <p class="k">${E(L("mcpUiCredits.field.modules"))}</p>
        <div class="mods" id="k-mods"></div>
      </div>
      <div class="spark" id="f-spark" hidden>
          <span class="spark-cap">${E(L("mcpUiCredits.spark.cap"))}</span>
          <div class="spark-box">
            <svg class="spark-svg" viewBox="0 0 280 56" preserveAspectRatio="none" aria-hidden="true" id="spark-svg">
              <defs>
                <linearGradient id="g-err" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style="stop-color:var(--err);stop-opacity:.14"/>
                  <stop offset="1" style="stop-color:var(--err);stop-opacity:0"/>
                </linearGradient>
                <linearGradient id="g-ok" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" style="stop-color:var(--ok);stop-opacity:.14"/>
                  <stop offset="1" style="stop-color:var(--ok);stop-opacity:0"/>
                </linearGradient>
              </defs>
              <path class="spark-area" id="spark-area" d="" fill="url(#g-err)"/>
              <path class="spark-line" id="spark-line" d="" stroke="var(--err)"/>
            </svg>
            <i class="spark-dot" id="spark-dot" hidden></i>
          </div>
      </div>
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
      <div class="field" id="f-m-latest" hidden>
        <p class="k">${E(L("mcpUiCredits.metric.field.latest"))}</p>
        <p class="v mono" id="k-m-latest"></p>
      </div>
      <div class="field" id="f-m-peak" hidden>
        <p class="k">${E(L("mcpUiCredits.metric.field.peak"))}</p>
        <p class="v mono" id="k-m-peak"></p>
      </div>
      <div class="field" id="f-m-avg" hidden>
        <p class="k">${E(L("mcpUiCredits.metric.field.avg"))}</p>
        <p class="v mono" id="k-m-avg"></p>
      </div>
      <div class="field" id="f-m-window" hidden>
        <p class="k">${E(L("mcpUiCredits.metric.field.window"))}</p>
        <p class="v" id="k-m-window"></p>
      </div>
      <p class="note" id="k-expired" hidden></p>
    </div>
    <p class="note" id="k-copynote" hidden></p>
    <div class="acts">
      <button class="primary" type="button" id="btn-main" hidden></button>
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
  function reportSize() {
    notify("ui/notifications/size-changed", {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    });
  }
  function el(id) { return document.getElementById(id); }

  var T = {
    title: ${S("mcpUiCredits.title")},
    placeOpen: ${S("mcpUi.place.open")},
    placeClose: ${S("mcpUi.place.close")},
    region: { ${dirTable(REGION_LABEL_DIR)} },
    site: { ${dirTable(SITE_LABEL_DIR)} },
    titleSep: ${S("mcpUiCredits.title.sep")},
    modulesSep: ${S("mcpUiCredits.modules.sep")},
    currency: ${S("mcpUiCredits.value.currency")},
    unavailable: ${S("mcpUiCredits.value.unavailable")},
    copiedConsole: ${S("mcpUiCredits.action.copiedConsole")},
    copiedExpense: ${S("mcpUiCredits.action.copiedExpense")},
    copyEnvId: ${S("mcpUiCredits.brand.copyEnvId")},
    copyConsoleLink: ${S("mcpUiCredits.action.copyConsoleLink")},
    copyExpenseLink: ${S("mcpUiCredits.action.copyExpenseLink")},
    expiredNote: ${S("mcpUiCredits.expired.note")},
    stateUnknown: ${S("mcpUiCredits.state.unknown")},
    stateNormal: ${S("mcpUiCredits.state.normal")},
    hintUnknown: ${S("mcpUiCredits.hint.unknown")},
    hintNormal: ${S("mcpUiCredits.hint.normal")},
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
    metricWindow: ${S("mcpUiCredits.metric.window")},
    metricSamples: ${S("mcpUiCredits.metric.samples")},
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
    unknown: { dot: "", text: T.stateUnknown, hint: T.hintUnknown, main: "", msg: "", link: "" },
    normal: { dot: "ok", text: T.stateNormal, hint: T.hintNormal, main: "", msg: "", link: "" },
    trialExhausted: {
      dot: "warn", text: ${S("mcpUiCredits.state.trialExhausted")}, hint: ${S("mcpUiCredits.hint.trialExhausted")},
      main: ${S("mcpUiCredits.action.upgrade")}, msg: ${S("mcpUiCredits.message.upgrade")}, link: "package"
    },
    stopped: {
      dot: "err", text: ${S("mcpUiCredits.state.stopped")}, hint: ${S("mcpUiCredits.hint.stopped")},
      main: ${S("mcpUiCredits.action.recommendRestore")}, msg: ${S("mcpUiCredits.message.restore")}, link: "package"
    },
    expired: {
      dot: "err", text: ${S("mcpUiCredits.state.expired")}, hint: ${S("mcpUiCredits.hint.expired")},
      main: ${S("mcpUiCredits.action.renew")}, msg: ${S("mcpUiCredits.message.renew")}, link: "renew"
    },
    arrears: {
      dot: "err", text: ${S("mcpUiCredits.state.arrears")}, hint: ${S("mcpUiCredits.hint.arrears")},
      main: ${S("mcpUiCredits.action.guidedTopup")}, msg: ${S("mcpUiCredits.message.topup")}, link: "expense"
    }
  };

  // Console links are composed at click time from the live env id + site, so no URL literal
  // lives in this template: only host tables and the hash fragment are injected.
  var ENV_HASH = ${JSON.stringify(ENV_CREDITS_ENV_LINK_HASH)};
  var DEV_HOST = ${JSON.stringify(CONSOLE_HOST_BY_SITE)};
  var BILL_HOST = ${JSON.stringify(ENV_CREDITS_BILLING.host)};
  var BILL_PATH = ${J(ENV_CREDITS_BILLING.path)};
  var LINK_LABEL = { package: T.copyConsoleLink, renew: T.copyConsoleLink, expense: T.copyExpenseLink };

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
  function sparkPath(pts) {
    var d = "M" + pts[0][0] + "," + pts[0][1];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += " C" + c1x.toFixed(1) + "," + c1y.toFixed(1) + " " + c2x.toFixed(1) + "," + c2y.toFixed(1) + " " + p2[0].toFixed(1) + "," + p2[1].toFixed(1);
    }
    return d;
  }
  function renderSpark(values, tone) {
    var area = el("spark-area");
    var line = el("spark-line");
    var dot = el("spark-dot");
    if (!area || !line) { return; }
    if (!values || values.length < 2) {
      area.setAttribute("d", "");
      line.setAttribute("d", "");
      if (dot) { dot.hidden = true; }
      return;
    }
    var max = Math.max.apply(null, values);
    if (!max) { max = 1; }
    var pts = [];
    for (var i = 0; i < values.length; i++) {
      var x = (i / (values.length - 1)) * 278;
      var y = 52 - (values[i] / max) * 48;
      pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    }
    var d = sparkPath(pts);
    var color = tone === "ok" || tone === "err" ? tone : "";
    area.setAttribute("d", d + " L278,56 L0,56 Z");
    area.setAttribute("fill", color ? "url(#g-" + color + ")" : "none");
    line.setAttribute("d", d);
    line.setAttribute("stroke", color ? "var(--" + color + ")" : "var(--text-2)");
    if (dot) {
      var last = pts[pts.length - 1];
      dot.style.left = (last[0] / 280 * 100) + "%";
      dot.style.top = (last[1] / 56 * 100) + "%";
      dot.className = "spark-dot" + (color ? " " + color : "");
      dot.hidden = false;
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
    setText(brandAlias, alias || ${J(siteText)});
    if (brandAlias) { brandAlias.title = envId ? T.copyEnvId + ": " + envId : ""; }
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
  var CREDITS_ONLY = ["f-credits", "f-mods", "f-plan", "f-balance", "k-expired", "ubar-box"];
  /** Metrics-only blocks, hidden while the credits view renders. */
  var METRICS_ONLY = ["f-m-latest", "f-m-peak", "f-m-avg", "f-m-window"];

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
    setText(el("c-hint"), T.metricHint[state]);

    // latest / peak (+ its time)
    var latest = payload && typeof payload.latest === "number" ? payload.latest : null;
    var fLatest = el("f-m-latest");
    fLatest.hidden = latest === null;
    if (latest !== null) { setText(el("k-m-latest"), withUnit(fmtMetricValue(latest), unit)); }

    var peak = payload && typeof payload.max === "number" ? payload.max : null;
    var peakTime = payload && typeof payload.peak_time === "string" && payload.peak_time ? payload.peak_time : "";
    var fPeak = el("f-m-peak");
    fPeak.hidden = peak === null;
    if (peak !== null) {
      setText(el("k-m-peak"), withUnit(fmtMetricValue(peak), unit) + (peakTime ? T.modulesSep + peakTime : ""));
    }

    // average
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
      var samplesText = T.metricSamples.replace("{n}", String(samples));
      setText(el("k-m-window"), period ? T.metricWindow.replace("{samples}", samplesText).replace("{period}", period) : samplesText);
    }

    // single line reusing spark: under 2 points is not a line, noData stays neutral
    var values = [];
    if (payload && payload.spark && payload.spark.length) {
      for (var i = 0; i < payload.spark.length; i++) { values.push(Number(payload.spark[i].credits_value || 0)); }
    }
    var fSpark = el("f-spark");
    // All-zero means no traffic; a flat baseline would read as "there is data", so we do not draw it.
    fSpark.hidden = values.length < 2 || state === "noData";
    renderSpark(values.length < 2 || state === "noData" ? [] : values, "");

    // The single primary action hands the follow-up to the session; the panel calls no tools itself.
    var mainBtn = el("btn-main");
    mainBtn.hidden = false;
    setText(mainBtn, mainLabel);
    mainBtn.disabled = false;
    var linkBtn = el("btn-link");
    linkBtn.hidden = true;
    var copyNote = el("k-copynote");
    if (copyNote) { copyNote.hidden = true; }
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

    setText(el("c-title"), T.title + (alias ? T.titleSep + alias : ""));
    setText(el("st-text"), branch.text);
    el("st-dot").className = "dot" + (branch.dot ? " " + branch.dot : "");
    setText(el("c-hint"), branch.hint);

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
      setText(el("k-credits"), pct === null ? fmtNumber(used) : fmtNumber(used) + " / " + fmtNumber(total));
    }
    var ubarBox = el("ubar-box");
    ubarBox.hidden = pct === null;
    if (pct !== null) {
      el("ubar").style.width = pct + "%";
      ubarBox.className = "ubar" + (pct < 80 ? " ok" : "");
      // The bar already turns red from 80% (an early warning we keep), so the wording has to
      // follow: a red bar next to "usage is within plan" is a contradiction on one screen.
      // Only for the two states that make no claim about the level (normal / unknown).
      if (pct >= 80 && (key === "normal" || key === "unknown")) {
        setText(el("st-text"), T.stateNearLimit.replace("{pct}", String(pct)));
        setText(el("c-hint"), T.hintNearLimit.replace("{pct}", String(pct)));
      }
    }

    var mods = [];
    if (payload && payload.modules && payload.modules.length) {
      for (var i = 0; i < payload.modules.length; i++) {
        var m = payload.modules[i];
        var name = T.module[m.module] || "";
        if (name) { mods.push(name + " " + fmtNumber(m.credits_value || 0)); }
      }
    }
    var fMods = el("f-mods");
    fMods.hidden = mods.length === 0;
    if (mods.length) { setText(el("k-mods"), mods.join(T.modulesSep)); }

    var values = [];
    if (payload && payload.spark && payload.spark.length) {
      for (var j = 0; j < payload.spark.length; j++) { values.push(Number(payload.spark[j].credits_value || 0)); }
    }
    var fSpark = el("f-spark");
    fSpark.hidden = values.length < 2;
    renderSpark(values, pct === null ? "" : (pct < 80 ? "ok" : "err"));

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
    mainBtn.hidden = !branch.main;
    if (branch.main) { setText(mainBtn, branch.main); mainBtn.disabled = false; }
    var linkBtn = el("btn-link");
    linkBtn.hidden = !current.link;
    if (current.link) { setText(el("btn-link-label"), LINK_LABEL[current.link]); }

    var copyNote = el("k-copynote");
    if (copyNote) { copyNote.hidden = true; }
  }

  function copyText(text) {
    if (!text) { return; }
    var done = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done = true; }).catch(function () {});
    }
    if (!done) {
      try {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "readonly");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      } catch (error) { /* clipboard unavailable: the hint tells the user to copy manually */ }
    }
  }

  document.addEventListener("click", function (event) {
    var node = event.target && event.target.closest ? event.target.closest("button") : null;
    if (!node) { return; }
    if (node.id === "btn-copy-env") { copyText(current.envId); return; }
    if (node.id === "btn-link") {
      copyText(consoleLink(current.link));
      var copyNote = el("k-copynote");
      if (copyNote) {
        setText(copyNote, current.link === "expense" ? T.copiedExpense : T.copiedConsole);
        copyNote.hidden = false;
      }
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
      setText(el("raw-out"), JSON.stringify(data.params, null, 2));
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
      const lang = getInstanceLang();
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
