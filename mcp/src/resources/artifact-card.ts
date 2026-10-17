import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ExtendedMcpServer } from "../server.js";
import { getInstanceLang, t, type Lang, type MessageKey } from "../i18n/index.js";
import { resolveEnvCreditsFallback } from "./env-credits.js";
import { debug } from "../utils/logger.js";
import {
  readClientCapabilitiesFromServer,
  readMcpClientInfoFromServer,
  reportResourceRead,
} from "../utils/telemetry.js";

/**
 * MCP Apps 产物卡片面板（`ui://cloudbase/artifact-card`）。
 *
 * 为什么存在：部署类工具（`manageHosting` / `manageApps` / `manageCloudRun`）的结果是一大段 JSON，
 * 用户在客户端里看到的应该是"这次部署成没成、地址在哪、下一步点什么"，而不是自己读 JSON。
 *
 * 六条纪律：
 *   1. **面板 HTML 是近静态模板 + 词典注入**：模板串只含 ASCII 结构与占位符，句子全部来自
 *      `i18n/locales/modules/mcpUiArtifact.ts`，按实例语言在 resources/read 时求值；
 *      **模板串保持纯 ASCII**（英文面板纯 ASCII 由测试钉住），且不含反引号。
 *   2. **零外链**：宿主默认 CSP 只允许自身与内联（`connect-src 'none'`），CSS/JS/图标/logo
 *      全部内联，不引任何 CDN、字体、图片或图表库。
 *   3. **读资源不发请求**：静态兜底值只来自本地（环境 ID / 站点 / 地域），真实状态随**工具结果**
 *      （`ui/notifications/tool-result`）推给面板，逐字段覆盖兜底值。
 *   4. **面板不执行任何动作**：主行动只把一句话交给会话（`ui/message`），
 *      **面板发起的 `tools/call` 恒为 0**（由测试钉住）。
 *   5. **只读**：面板不写任何云端资源，也不展示任何密钥类字段。
 *   6. **面向用户，不面向实现**：正文不出现内部枚举 / 字段名 / 工具名；套餐、站点、地域一律走
 *      既有映射（复用 `mcpUiCredits.*` 的标签，见 `mcpUiArtifact.ts` 顶部说明），
 *      认不出的原始码**不打印原文**（宁可留空）。
 *
 * 四态（部署中 / 已上线·公网 / 已上线·仅内网 / 部署失败）的判定在服务端完成
 * （`tools/artifact-card-payload.ts` 的 `state`），面板只负责如实渲染 + 指路。
 */

/** 定稿的 `ui://` 资源 URI（无变量模板，不进 `resources/list`）。 */
export const ARTIFACT_CARD_RESOURCE_URI = "ui://cloudbase/artifact-card";

/** MCP Apps 资源 MUST 使用此 MIME。 */
export const ARTIFACT_CARD_MIME_TYPE = "text/html;profile=mcp-app";

/** 按 `& < > " '` 转义，避免环境 ID / 地址等值破坏 HTML 结构。 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 转成可直接嵌进面板 `<script>` 的双引号 JS 字符串字面量（含 `</script>` 防护）。 */
function jsLiteral(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * 生成面板 HTML。模板串保持纯 ASCII：所有自然语言来自词典，按 `lang` 求值后注入。
 *
 * `fallback` 与 env-credits 面板共用同一个解析器（环境 ID 优先级：工具结果 → 配置/环境变量 →
 * 进程缓存 → 不显示），保证两个面板对"这是哪个环境"的口径一致。
 */
export function buildArtifactCardHtml(
  lang: Lang,
  fallback: { envId: string | null; site: string; region: string },
): string {
  const L = (key: MessageKey): string => t(key, undefined, lang);
  const E = escapeHtml;
  const J = jsLiteral;
  const S = (key: MessageKey): string => J(L(key));

  const siteText = (() => {
    const map: Record<string, string> = {
      domestic: L("mcpUi.site.domestic"),
      intl: L("mcpUi.site.intl"),
    };
    return map[fallback.site] || "";
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
    return map[fallback.region] || "";
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
<title>${E(L("mcpUiArtifact.resourceTitle"))}</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #F6F7F9; --surface: #ffffff; --line: rgba(16,24,40,.08);
  --text: #141A24; --text-2: #5A6472; --text-3: #8A93A0;
  --primary: #0052D9; --primary-hover: #0043B4; --tint: #EFF5FF;
  --ok: #12B76A; --warn: #F79009; --err: #F04438;
  --shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101318; --surface: #191D24; --line: rgba(255,255,255,.10);
    --text: #E9EDF2; --text-2: #9AA4B2; --text-3: #6B7480;
    --primary: #4896FF; --primary-hover: #63A9FF; --tint: rgba(0,82,217,.25);
    --shadow: none;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; }
[hidden] { display: none !important; }
body {
  background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased;
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
/* The host decides the width; the card fills it instead of leaving wide margins. */
.screen { width: 100%; max-width: 720px; margin: 0 auto; background: var(--bg); }
.brand { height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 0 16px; border-bottom: 1px solid var(--line); }
.brand-l { display: flex; align-items: center; gap: 8px; min-width: 0; }
.logo { width: 20px; height: 20px; flex: 0 0 auto; display: block; }
.brand-name { font-size: 15px; font-weight: 600; letter-spacing: -.01em; }
.brand-r { font-size: 12px; color: var(--text-2); white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.brand-alias { max-width: 140px; overflow: hidden; text-overflow: ellipsis; color: var(--text); font-weight: 500; }
.plan-tag { font-size: 12px; color: var(--text-2); background: transparent; border: 1px solid var(--line); border-radius: 6px; padding: 1px 6px; white-space: nowrap; }
.brand-r .icon-btn { width: 24px; height: 24px; }
@media (prefers-color-scheme: dark) { .logo .lp-brand { fill: #4896FF; } }
.content { padding: 16px; }
.card { background: var(--surface); border-radius: 12px; padding: 16px; box-shadow: var(--shadow); }
.t1 { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.t1 h1 { flex: 1 1 auto; min-width: 0; font-size: 22px; font-weight: 600; line-height: 1.3;
  letter-spacing: -.01em; margin: 0; overflow-wrap: anywhere; }
.st { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; font-size: 14px; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; background: var(--text-3); }
.dot.ok { background: var(--ok); }
.dot.warn { background: var(--warn); }
.dot.err { background: var(--err); }
.t2 { font-size: 13px; color: var(--text-2); margin: 8px 0 0; overflow-wrap: anywhere; }
.t3 { margin: 16px 0 0; }
.field + .field { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.field .k { font-size: 13px; color: var(--text-2); margin: 0 0 2px; }
.field .v { font-size: 14px; margin: 0; overflow-wrap: anywhere; }
.note { margin: 8px 0 0; font-size: 12px; color: var(--text-2); }
.field .val { display: grid; grid-template-columns: minmax(0,1fr) auto auto; align-items: center; gap: 8px; }
.field .url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px;
  overflow-wrap: anywhere; user-select: all; min-width: 0; }
.tag { font-size: 13px; line-height: 22px; height: 22px; padding: 0 8px; border-radius: 6px; white-space: nowrap;
  background: var(--bg); color: var(--text-2); }
.tag.warn { color: var(--warn); background: rgba(247,144,9,.12); }
.acts { margin: 16px 0 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.btn { font: inherit; font-size: 14px; font-weight: 500; cursor: pointer; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap;
  transition: background .15s, border-color .15s, color .15s; }
.btn.primary { height: 36px; padding: 0 18px; background: var(--primary); border: 1px solid var(--primary); color: #fff; }
/* Card-width rule: full-bleed while the card is phone-shaped, natural width once it is a wide card
   (a 700px-wide button reads as a banner, not as the one next step). */
@media (max-width: 560px) { .btn.primary { width: 100%; } }
.btn.primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
.btn.secondary { height: 32px; padding: 0 12px; background: var(--surface); border: 1px solid var(--line); color: var(--text); }
.btn.secondary:hover { background: var(--tint); border-color: transparent; }
.btn[disabled] { cursor: default; opacity: .6; }
.icon-btn { width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center;
  border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--text-2); cursor: pointer;
  transition: background .15s, border-color .15s, color .15s; }
.icon-btn:hover { background: var(--tint); border-color: transparent; color: var(--primary); }
.icon { width: 16px; height: 16px; flex: 0 0 auto; }
.acts-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.fold { margin: 16px 0 0; padding-top: 16px; border-top: 1px solid var(--line); }
.fold summary { font-size: 13px; color: var(--text-2); cursor: pointer; list-style: none;
  display: inline-flex; align-items: center; gap: 4px; }
.fold summary::-webkit-details-marker { display: none; }
.fold summary::before { content: "\\25B8"; font-size: 10px; }
.fold details[open] summary::before { content: "\\25BE"; }
.fold pre { margin: 8px 0 0; padding: 12px; background: var(--bg); border-radius: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; line-height: 1.5;
  white-space: pre-wrap; overflow-wrap: anywhere; max-height: 200px; overflow: auto; }
</style>
</head>
<body>
<!-- Lucide glyphs, inline and referenced by id: no network, no icon font, no data URI. One <use>
     per button keeps the swap to a single attribute write. -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="ico-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></symbol>
<symbol id="ico-link" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></symbol>
<symbol id="ico-log" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></symbol>
<symbol id="ico-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></symbol>
<symbol id="ico-share" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/></symbol>
</defs></svg>
<div class="screen">
<div class="brand">
<span class="brand-l">
<span class="logo"><svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
<path fill-rule="evenodd" clip-rule="evenodd" d="M-0.00195272 13.364C-0.0021879 13.0869 0.100481 12.8097 0.306053 12.5947L8.64438 4.25689C8.74869 4.15259 8.89015 4.09399 9.03766 4.09399H19.6942C20.1894 4.09399 20.4377 4.69236 20.088 5.04296L11.7889 13.364H-0.00195272Z" fill="#67E9E9"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M-0.00195272 13.366C-0.00218796 13.6431 0.100474 13.9203 0.306033 14.1353L8.64438 22.4731C8.74869 22.5774 8.89015 22.636 9.03766 22.636H19.6942C20.1894 22.636 20.4377 22.0376 20.088 21.687L11.7889 13.366H-0.00195272Z" fill="#2BCCCC"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M35.999 22.2539C35.9993 21.9781 35.8977 21.7023 35.6942 21.4877L27.3527 13.1468C27.2484 13.0425 27.1069 12.9839 26.9594 12.9839H16.3029C15.8077 12.9839 15.5594 13.5823 15.9091 13.9328L24.2081 22.2539H35.999Z" fill="#4896FF"/>
<path class="lp-brand" fill-rule="evenodd" clip-rule="evenodd" d="M35.999 22.2534C35.9994 22.526 35.9002 22.7987 35.7015 23.0123L27.3527 31.3605C27.2484 31.4648 27.1069 31.5234 26.9594 31.5234H16.3029C15.8077 31.5234 15.5594 30.9251 15.9091 30.5745L24.2081 22.2534H35.999Z" fill="#0052D9"/>
</svg></span>
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
<div class="content">
<div class="card">
<div class="t1">
<h1 id="c-title"></h1>
<span class="st"><span class="dot" id="st-dot"></span><span id="st-text"></span></span>
</div>
<p class="t2" id="c-hint"></p>
<div class="t3">
<div class="field" id="f-place">
<p class="k">${E(L("mcpUiArtifact.field.place"))}</p>
<p class="v" id="k-place">${E(placeText)}</p>
</div>
<div class="field" id="f-url" hidden>
<p class="k">${E(L("mcpUiArtifact.field.accessUrl"))}</p>
<div class="val">
<span class="url" id="k-url"></span>
<span class="tag warn" id="k-url-tag" hidden>${E(L("mcpUiArtifact.tag.internalOnly"))}</span>
<button class="icon-btn" type="button" id="btn-copy-url" title="${E(L("mcpUiArtifact.action.copyUrl"))}" aria-label="${E(L("mcpUiArtifact.action.copyUrl"))}">
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
</button>
</div>
<p class="note" id="k-note" hidden></p>
</div>
</div>
<div class="acts">
<button class="btn primary" type="button" id="btn-main" hidden><svg class="icon" aria-hidden="true"><use id="ico-main" href="#ico-open"/></svg><span id="btn-main-label"></span></button>
<div class="acts-row" id="acts-row">
<button class="btn secondary" type="button" id="btn-log" hidden><svg class="icon" aria-hidden="true"><use href="#ico-log"/></svg><span id="btn-log-label"></span></button>
<button class="btn secondary" type="button" id="btn-redeploy" hidden><svg class="icon" aria-hidden="true"><use href="#ico-refresh"/></svg><span id="btn-redeploy-label"></span></button>
<button class="btn secondary" type="button" id="btn-share" hidden><svg class="icon" aria-hidden="true"><use href="#ico-share"/></svg><span id="btn-share-label"></span></button>
<button class="btn secondary" type="button" id="btn-refresh" hidden>
<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
<span id="btn-refresh-label">${E(L("mcpUiArtifact.action.refresh"))}</span>
</button>
</div>
</div>
<div class="fold"><details><summary>${E(L("mcpUiCredits.fold.raw"))}</summary><pre id="raw-out"></pre></details></div>
</div>
</div>
</div>
<script>
(function () {
  var host = window.parent;
  var nextId = 1;
  var pending = {};
  function post(message) { host.postMessage(message, "*"); }
  function request(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  }
  function notify(method, params) { post({ jsonrpc: "2.0", method: method, params: params }); }
  function el(id) { return document.getElementById(id); }
  function setText(node, value) { if (node) { node.textContent = value; } }
  function reportSize() {
    notify("ui/notifications/size-changed", {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    });
  }

  var T = {
    titleSep: ${S("mcpUiArtifact.title.sep")},
    kind: {
      hosting: ${S("mcpUiArtifact.kind.hosting")},
      apps: ${S("mcpUiArtifact.kind.apps")},
      cloudrun: ${S("mcpUiArtifact.kind.cloudrun")}
    },
    state: {
      deploying: ${S("mcpUiArtifact.state.deploying")},
      published: ${S("mcpUiArtifact.state.published")},
      failed: ${S("mcpUiArtifact.state.failed")},
      unknown: ${S("mcpUiArtifact.state.unknown")}
    },
    hint: {
      deploying: ${S("mcpUiArtifact.hint.deploying")},
      published: ${S("mcpUiArtifact.hint.published")},
      publishedInternal: ${S("mcpUiArtifact.hint.publishedInternal")},
      unknown: ${S("mcpUiArtifact.hint.unknown")}
    },
    envIdLabel: ${S("mcpUiArtifact.brand.envIdLabel")},
    copyEnvId: ${S("mcpUiCredits.brand.copyEnvId")},
    actionOpenUrl: ${S("mcpUiArtifact.action.openUrl")},
    actionOpenFailed: ${S("mcpUiArtifact.action.openFailed")},
    actionBindDomain: ${S("mcpUiArtifact.action.bindDomain")},
    actionViewLog: ${S("mcpUiArtifact.action.viewLog")},
    actionViewBuildLog: ${S("mcpUiArtifact.action.viewBuildLog")},
    actionRedeploy: ${S("mcpUiArtifact.action.redeploy")},
    actionShareCase: ${S("mcpUiArtifact.action.shareCase")},
    actionRefresh: ${S("mcpUiArtifact.action.refresh")},
    messageBindDomain: ${S("mcpUiArtifact.message.bindDomain")},
    messageViewLog: ${S("mcpUiArtifact.message.viewLog")},
    messageViewBuildLog: ${S("mcpUiArtifact.message.viewBuildLog")},
    messageRedeploy: ${S("mcpUiArtifact.message.redeploy")},
    messageShareCase: ${S("mcpUiArtifact.message.shareCase")},
    messageRefresh: ${S("mcpUiArtifact.message.refresh")},
    messageTargetFallback: ${S("mcpUiArtifact.message.targetFallback")},
    plan: {
      trial: ${S("mcpUiCredits.plan.trial")},
      personal: ${S("mcpUiCredits.plan.personal")},
      standard: ${S("mcpUiCredits.plan.standard")},
      enterprise: ${S("mcpUiCredits.plan.enterprise")},
      enterpriseAdvanced: ${S("mcpUiCredits.plan.enterpriseAdvanced")}
    },
    region: {
      "ap-shanghai": ${S("mcpUi.region.apShanghai")},
      "ap-guangzhou": ${S("mcpUi.region.apGuangzhou")},
      "ap-beijing": ${S("mcpUi.region.apBeijing")},
      "ap-nanjing": ${S("mcpUi.region.apNanjing")},
      "ap-chengdu": ${S("mcpUi.region.apChengdu")},
      "ap-hongkong": ${S("mcpUi.region.apHongkong")},
      "ap-singapore": ${S("mcpUi.region.apSingapore")},
      "na-siliconvalley": ${S("mcpUi.region.naSiliconvalley")},
      "eu-frankfurt": ${S("mcpUi.region.euFrankfurt")}
    },
    site: {
      domestic: ${S("mcpUi.site.domestic")},
      intl: ${S("mcpUi.site.intl")}
    },
    placeOpen: ${S("mcpUi.place.open")},
    placeClose: ${S("mcpUi.place.close")},
    internalTag: ${S("mcpUiArtifact.tag.internalOnly")}
  };

  // Local config only fills the gaps until the tool result arrives; it never overrides a live value.
  var FALLBACK = { site: ${J(siteText)}, region: ${J(regionText)}, envId: ${J(fallback.envId ?? "")} };
  var SITE_TEXT = FALLBACK.site;
  var current = { envId: FALLBACK.envId, url: "", state: "unknown", kind: "", name: "" };
  // The last payload that actually carried a state: the fallback below reuses its identity
  // (kind / name / alias / env / plan / place) so a failure still says *what* failed.
  var lastPayload = null;
  var busy = false;

  // Unknown codes are dropped rather than printed: an internal code on screen reads worse than a blank.
  function codeLabel(table, code) {
    if (!code || typeof code !== "string") { return ""; }
    return table[code] || "";
  }
  function hasField(payload, key) {
    return !!payload && typeof payload === "object" && key in payload;
  }
  function placeOf(payload) {
    var region = hasField(payload, "current_region")
      ? (codeLabel(T.region, payload.current_region) || FALLBACK.region)
      : FALLBACK.region;
    var site = hasField(payload, "site")
      ? (codeLabel(T.site, payload.site) || FALLBACK.site)
      : FALLBACK.site;
    if (region && site) { return region + T.placeOpen + site + T.placeClose; }
    return region || site;
  }
  /**
   * Fallback for "the call failed and no readable payload came with it": we still know it failed,
   * so show the failed state, reuse the identity from the last payload, and leave the error text to
   * the raw fold (the body never shows unreadable text).
   */
  function identityOnlyFailure() {
    var previous = lastPayload || {};
    var payload = { state: "failed" };
    if (previous.artifact_kind) { payload.artifact_kind = previous.artifact_kind; }
    if (previous.artifact_name) { payload.artifact_name = previous.artifact_name; }
    if (previous.env_alias) { payload.env_alias = previous.env_alias; }
    if (previous.env_id) { payload.env_id = previous.env_id; }
    if (previous.plan) { payload.plan = previous.plan; }
    if (previous.current_region) { payload.current_region = previous.current_region; }
    if (previous.site) { payload.site = previous.site; }
    return payload;
  }
  function stateOf(payload) {
    if (!payload || typeof payload.state !== "string") { return "unknown"; }
    return Object.prototype.hasOwnProperty.call(T.state, payload.state) ? payload.state : "unknown";
  }
  function titleOf(payload) {
    var kind = payload && typeof payload.artifact_kind === "string"
      ? (T.kind[payload.artifact_kind] || "")
      : "";
    var name = payload && typeof payload.artifact_name === "string" ? payload.artifact_name : "";
    if (kind && name) { return kind + T.titleSep + name; }
    return kind || name;
  }

  function render(payload, synthetic) {
    if (!synthetic && payload && typeof payload.state === "string") { lastPayload = payload; }
    var state = stateOf(payload);
    current.state = state;
    var url = payload && typeof payload.access_url === "string" ? payload.access_url : "";
    var scope = payload && typeof payload.access_url_scope === "string" ? payload.access_url_scope : "";
    current.url = url;

    var dot = el("st-dot");
    if (dot) {
      var tone = state === "published" ? "ok" : state === "failed" ? "err" : state === "deploying" ? "warn" : "";
      dot.className = "dot" + (tone ? " " + tone : "");
    }
    setText(el("st-text"), T.state[state]);

    // The explanation is the state's own sentence; for a failure it is the backend's own text, verbatim.
    var hint = "";
    if (state === "failed") {
      hint = payload && typeof payload.error_text === "string" ? payload.error_text : "";
    } else if (state === "published") {
      hint = scope === "internal" ? T.hint.publishedInternal : T.hint.published;
    } else {
      hint = T.hint[state] || "";
    }
    current.kind = payload && typeof payload.artifact_kind === "string" ? payload.artifact_kind : "";
    current.name = payload && typeof payload.artifact_name === "string" ? payload.artifact_name : "";
    var hintNode = el("c-hint");
    setText(hintNode, hint);
    if (hintNode) { hintNode.hidden = !hint; }

    var title = titleOf(payload);
    var titleNode = el("c-title");
    setText(titleNode, title);
    if (titleNode) { titleNode.hidden = !title; }

    setText(el("k-place"), placeOf(payload) || "");

    var fUrl = el("f-url");
    // An address is shown whenever the result carried one; whether it can be opened is a separate
    // question (the main action only exists when the source says it is publicly reachable).
    // A failed card never shows an address, even if one travelled with the result.
    var showUrl = url !== "" && state !== "failed";
    if (fUrl) { fUrl.hidden = !showUrl; }
    if (showUrl) {
      setText(el("k-url"), url);
      var urlTag = el("k-url-tag");
      if (urlTag) {
        setText(urlTag, T.internalTag);
        urlTag.hidden = scope !== "internal";
      }
    }

    // Brand: alias (falling back to the site's human name), plan tag, copy the environment ID.
    var alias = hasField(payload, "env_alias") && payload.env_alias ? String(payload.env_alias) : "";
    var envId = hasField(payload, "env_id") ? (payload.env_id ? String(payload.env_id) : "") : FALLBACK.envId;
    current.envId = envId;
    var aliasNode = el("brand-alias");
    setText(aliasNode, alias || SITE_TEXT);
    if (aliasNode) { aliasNode.title = envId ? T.envIdLabel + ": " + envId : ""; }
    var copyEnv = el("btn-copy-env");
    if (copyEnv) { copyEnv.hidden = !envId; }
    var planLabel = payload && payload.plan ? (T.plan[payload.plan] || "") : "";
    var planNode = el("brand-plan");
    setText(planNode, planLabel);
    if (planNode) { planNode.hidden = !planLabel; }

    // One main action per screen; every action hands a sentence to the conversation.
    var main = el("btn-main");
    var log = el("btn-log");
    var redeploy = el("btn-redeploy");
    var refresh = el("btn-refresh");
    var mainLabel = "";
    var mainMessage = "";
    var showLog = false;
    var logLabel = "";
    var logMessage = "";
    var openMain = false;
    var showRedeploy = false;
    var showRefresh = false;
    var showShare = false;

    if (state === "deploying") {
      mainLabel = T.actionViewBuildLog;
      mainMessage = T.messageViewBuildLog;
      showRefresh = true;
    } else if (state === "published") {
      if (scope === "internal") {
        mainLabel = T.actionBindDomain;
        mainMessage = T.messageBindDomain;
        showLog = true;
        logLabel = T.actionViewLog;
        logMessage = T.messageViewLog;
      } else if (scope === "public") {
        // The address is live: the button opens it. Asking the conversation to "open {url}" only
        // moves the same click one turn away from the user.
        mainLabel = T.actionOpenUrl;
        mainMessage = "";
        openMain = true;
        // Sharing needs something a stranger can open, so this only exists for a public address.
        showShare = true;
      }
      // Unknown scope: no promise is made about the address, so there is no main action at all.
      showRedeploy = true;
    } else if (state === "failed") {
      // The reason is the backend's own text, so the next step is to read the logs rather than
      // to deploy again blindly (the prototype's failure state leads with the log action too).
      mainLabel = T.actionViewLog;
      mainMessage = T.messageViewLog;
      showRedeploy = true;
    }

    // Labels live in their own span so the glyph beside them survives a re-render: writing
    // textContent on the button itself would delete the icon.
    setText(el("btn-main-label"), mainLabel);
    if (main) { main.hidden = !mainLabel; main.disabled = false; }
    setIcon(el("ico-main"), openMain ? "open" : (mainLabel === T.actionBindDomain ? "link" : "log"));
    setText(el("btn-log-label"), logLabel);
    if (log) { log.hidden = !showLog; log.disabled = false; }
    setText(el("btn-redeploy-label"), T.actionRedeploy);
    if (redeploy) { redeploy.hidden = !showRedeploy; redeploy.disabled = false; }
    var share = el("btn-share");
    setText(el("btn-share-label"), T.actionShareCase);
    if (share) { share.hidden = !showShare; share.disabled = false; }
    if (refresh) { refresh.hidden = !showRefresh; refresh.disabled = false; }

    if (main) {
      main.setAttribute("data-message", mainMessage);
      main.setAttribute("data-action", openMain ? "open" : "message");
    }
    if (log) { log.setAttribute("data-message", logMessage); }
    if (redeploy) { redeploy.setAttribute("data-message", T.messageRedeploy); }
    if (share) { share.setAttribute("data-message", T.messageShareCase); }
    if (refresh) { refresh.setAttribute("data-message", T.messageRefresh); }
  }

  // The two placeholders are filled in at click time from what this result actually carried:
  // {target} names the deployment (kind + name) so the conversation knows which object to act on,
  // {url} is the live address. Missing pieces fall back to a neutral phrase, never to a guess.
  function targetText() {
    var kind = current.kind ? (T.kind[current.kind] || "") : "";
    var name = current.name || "";
    if (kind && name) { return kind + " " + name; }
    return name || kind || T.messageTargetFallback;
  }
  function payloadText(message) {
    var text = message;
    if (text.indexOf("{target}") !== -1) { text = text.replace("{target}", targetText()); }
    if (text.indexOf("{url}") !== -1) { text = text.replace("{url}", current.url); }
    return text;
  }

  /** Swap a button glyph: one <use> plus one <symbol> per icon, so this is a single attribute write. */
  function setIcon(use, name) {
    if (use) { use.setAttribute("href", "#ico-" + name); }
  }

  function sendMessage(node) {
    if (!node || busy) { return; }
    var message = payloadText(node.getAttribute("data-message") || "");
    if (!message) { return; }
    busy = true;
    node.disabled = true;
    request("ui/message", { role: "user", content: { type: "text", text: message } })
      .then(function () { busy = false; node.disabled = false; })
      .catch(function () { busy = false; node.disabled = false; });
  }

  /**
   * ui/open-link is the sanctioned way out of the sandbox: the host opens the URL in the user's
   * browser and may refuse. When it refuses (or does not implement the method), the click still
   * has to end somewhere, so the address is copied and the note under it says so.
   */
  function openUrl(node) {
    if (!current.url || busy) { return; }
    busy = true;
    node.disabled = true;
    request("ui/open-link", { url: current.url })
      .then(function (result) {
        if (result && result.isError) { throw new Error("denied"); }
        busy = false;
        node.disabled = false;
      })
      .catch(function () {
        busy = false;
        node.disabled = false;
        copyText(current.url);
        var note = el("k-note");
        if (note) { setText(note, T.actionOpenFailed); note.hidden = false; }
      });
  }

  function copyText(text) {
    if (!text) { return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
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
      document.execCommand("copy");
      document.body.removeChild(area);
    } catch (error) { /* clipboard unavailable: the value is still selectable on screen */ }
  }

  document.addEventListener("click", function (event) {
    var node = event.target && event.target.closest ? event.target.closest("button") : null;
    if (!node) { return; }
    if (node.id === "btn-copy-env") { copyText(current.envId); return; }
    if (node.id === "btn-copy-url") { copyText(current.url); return; }
    if (node.getAttribute("data-action") === "open") { openUrl(node); return; }
    sendMessage(node);
  });

  function readPayload(params) {
    if (!params || typeof params !== "object") { return null; }
    var candidate = params.structuredContent || params;
    if (candidate && typeof candidate === "object" && typeof candidate.state === "string") {
      return candidate;
    }
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
      } else if (data.params && data.params.isError === true) {
        // The main path carries a payload even on failure; this is the fallback for a host that
        // only forwards the error mark: still show the failed state, keeping the last identity.
        render(identityOnlyFailure(), true);
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
    appInfo: { name: "cloudbase-artifact-card", version: "1.0.0" },
    clientInfo: { name: "cloudbase-artifact-card", version: "1.0.0" }
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
 * 注册 `ui://cloudbase/artifact-card`。
 *
 * `resources.listChanged = false` 的能力位覆盖由 `registerGetStartedResource` 统一执行
 * （三个面板同生命周期、同一次 initialize），此处不重复覆盖。
 */
export function registerArtifactCardResource(server: ExtendedMcpServer): void {
  server.registerResource(
    "cloudbase-artifact-card",
    new ResourceTemplate(ARTIFACT_CARD_RESOURCE_URI, { list: undefined }),
    {
      mimeType: ARTIFACT_CARD_MIME_TYPE,
      title: t("mcpUiArtifact.resourceTitle"),
      description: t("mcpUiArtifact.resourceDescription"),
    },
    async (uri) => {
      const startedAt = Date.now();
      const lang = getInstanceLang();
      let success = true;
      let errorMessage: string | undefined;
      let bytes = 0;
      try {
        const html = buildArtifactCardHtml(lang, resolveEnvCreditsFallback(server));
        bytes = Buffer.byteLength(html, "utf8");
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: ARTIFACT_CARD_MIME_TYPE,
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
          uri: ARTIFACT_CARD_RESOURCE_URI,
          mimeType: ARTIFACT_CARD_MIME_TYPE,
          bytes,
          lang,
        });
        const isTestEnvironment =
          process.env.NODE_ENV === "test" || process.env.VITEST === "true";
        if (!isTestEnvironment) {
          reportResourceRead({
            resourceUri: ARTIFACT_CARD_RESOURCE_URI,
            mimeType: ARTIFACT_CARD_MIME_TYPE,
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
