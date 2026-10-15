import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExtendedMcpServer } from "../server.js";
import { getInstanceLang, t, type Lang, type MessageKey } from "../i18n/index.js";
import { getCachedEnvId } from "../cloudbase-manager.js";
import { resolveSiteAndRegion } from "../utils/site-map.js";
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

/** 控制台路径（精确 hash 路径待核，见 handoff §6.4；核完替换这里即可，面板不硬编码）。 */
export const ENV_CREDITS_CONSOLE_LINKS = {
  package: "https://console.cloud.tencent.com/tcb/package",
  renew: "https://console.cloud.tencent.com/tcb/renew",
  expense: "https://console.cloud.tencent.com/expense",
} as const;

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

  const siteText = (() => {
    const map: Record<string, string> = {
      domestic: L("mcpUi.site.domestic"),
      intl: L("mcpUi.site.intl"),
    };
    return map[fallback.site] || fallback.site;
  })();
  const regionText = (() => {
    const map: Record<string, string> = {
      "ap-shanghai": L("mcpUi.region.apShanghai"),
      "ap-guangzhou": L("mcpUi.region.apGuangzhou"),
      "ap-beijing": L("mcpUi.region.apBeijing"),
      "ap-nanjing": L("mcpUi.region.apNanjing"),
      "ap-chengdu": L("mcpUi.region.apChengdu"),
      "ap-hongkong": L("mcpUi.region.apHongkong"),
      "ap-singapore": L("mcpUi.region.apSingapore"),
      "na-siliconvalley": L("mcpUi.region.naSiliconvalley"),
      "eu-frankfurt": L("mcpUi.region.euFrankfurt"),
    };
    return map[fallback.region] || fallback.region;
  })();
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

  // Console paths are injected by the server (exact hash paths pending); no URL literals live here.
  var LINKS = ${JSON.stringify(ENV_CREDITS_CONSOLE_LINKS)};
  var LINK_LABEL = { package: T.copyConsoleLink, renew: T.copyConsoleLink, expense: T.copyExpenseLink };

  // Local fallback only fills fields the tool result does not carry; live values always win.
  var FALLBACK = { envAlias: "", envId: ${J(fallback.envId ?? "")}, place: ${J(placeText)} };
  var current = { branch: "unknown", envId: FALLBACK.envId, link: "" };

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
  function hasField(payload, key) {
    return !!payload && typeof payload === "object" && key in payload;
  }
  function branchOf(payload) {
    if (!payload || typeof payload.branch !== "string") { return "unknown"; }
    return BRANCHES[payload.branch] ? payload.branch : "unknown";
  }

  function render(payload) {
    var key = branchOf(payload);
    var branch = BRANCHES[key];
    current.branch = key;
    current.link = branch.link || "";

    var alias = hasField(payload, "env_alias") && payload.env_alias ? String(payload.env_alias) : FALLBACK.envAlias;
    var envId = hasField(payload, "env_id") ? (payload.env_id ? String(payload.env_id) : "") : FALLBACK.envId;
    current.envId = envId;

    setText(el("c-title"), T.title + (alias ? T.titleSep + alias : ""));
    var brandAlias = el("brand-alias");
    setText(brandAlias, alias || ${J(siteText)});
    if (brandAlias) { brandAlias.title = envId ? ${S("mcpUiCredits.brand.copyEnvId")} + ": " + envId : ""; }
    setText(el("st-text"), branch.text);
    el("st-dot").className = "dot" + (branch.dot ? " " + branch.dot : "");
    setText(el("c-hint"), branch.hint);

    var plan = payload ? planLabel(payload) : "";
    var fPlan = el("f-plan");
    fPlan.hidden = !plan;
    setText(el("k-plan"), plan);
    var brandPlan = el("brand-plan");
    brandPlan.hidden = !plan;
    setText(brandPlan, plan);

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
    var copyEnv = el("btn-copy-env");
    copyEnv.hidden = !envId;
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
      copyText(LINKS[current.link] || "");
      var copyNote = el("k-copynote");
      if (copyNote) {
        setText(copyNote, current.link === "expense" ? T.copiedExpense : T.copiedConsole);
        copyNote.hidden = false;
      }
      return;
    }
    if (node.id === "btn-main") {
      var msg = BRANCHES[current.branch] ? BRANCHES[current.branch].msg : "";
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
    if (candidate && typeof candidate === "object" && typeof candidate.branch === "string") { return candidate; }
    return null;
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || typeof data !== "object") { return; }
    if (data.method === "ui/notifications/tool-result") {
      var payload = readPayload(data.params);
      // A result we cannot read is never spread across the card: it goes to the fold only.
      if (payload) { render(payload); } else { render(null); }
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
