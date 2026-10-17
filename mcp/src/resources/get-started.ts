/**
 * MCP Apps 入口面板：`ui://cloudbase/get-started`
 *
 * 为什么存在：服务端此前一条 UI 都没声明（`capabilities` 里只有 `tools`）。本资源是
 * 一期唯一的 UI 落点——一个自包含单文件 HTML，经 `_meta.ui.resourceUri` 挂在既有
 * `auth` 工具上，给声明了 `io.modelcontextprotocol/ui` 的客户端一个"能看见的入口"。
 *
 * 四条纪律（对应 specs/mcp-ui/design.md §2.1 / §3.1）：
 *   1. **零外链**：宿主默认 CSP 只允许自身与内联（`script-src 'self' 'unsafe-inline'`、
 *      `style-src 'self' 'unsafe-inline'`、`img-src 'self' data:`），并禁止一切外部网络
 *      （`connect-src 'none'`）⇒ 面板必须完全自包含；CSS/JS 全部内联，Logo 也内联成
 *      `<svg>`（不用外链、也不用 data URI），不引任何 CDN / 字体 / 图片 / 图表库。
 *   2. **模板纯 ASCII**：HTML 模板串只含结构与占位符，所有句子经 `t(key, params, lang)`
 *      注入；`t()` 在 read 回调里求值，晚于 `setInstanceLang`，英文实例自动出英文。
 *      注入分两路：HTML 文本走 `escapeHtml`，脚本里的字符串走 `jsLiteral`（JSON 转义 +
 *      转义 `<`，避免 `</script>` 截断）。
 *   3. **只读无密钥**：状态值只来自 `server.cloudBaseOptions` / 环境变量 / 缓存 / 站点解析，
 *      读资源时不发网络请求；面板自己只会发两类调用——只读的
 *      `auth(action:"status")`（「重新检查」）和只改本地绑定的
 *      `auth(action:"set_env")`（点「可选环境」里的一行）。两者都不动云端资源，也不碰密钥。
 *   4. **状态吃实时结果，不吃本地猜测**：宿主会以 `ui/notifications/tool-result` 通知把
 *      「令本次面板被渲染的那次工具调用」的结果送来。面板挂在多用途的 `auth` 上，
 *      每一次 `auth` 调用都会渲染它，所以状态区**优先消费这条通知的 `structuredContent`**
 *      （没有时回落到 `content[0].text` 里的 JSON），本地配置只作还没有实时结果时的兜底。
 *      这同时消除了"静态卡按本地配置猜的凭据范围"和"实时值"互相矛盾的问题——静态那条已移除。
 *
 * 展示纪律：面板正文只出现人话。站点 / 地域 / 凭据范围经词典翻成中文或英文，
 * 认不出来的原始枚举照原样显示；原始 JSON 只进「查看原始返回」折叠区。
 *
 * bridge 的 `targetOrigin` 用 `"*"` 且不校验 `event.origin`：与规范给出的示例一致，且面板跑在
 * 沙箱 iframe 里拿不到宿主 origin，没有可信来源可校验——刻意保持现状（脚本内有同义注释）。
 *
 * 读回调里另写一条 `debug` 日志（uri / mimeType / 体积 / 语言）：它是**给人工验证用的服务端信号**
 * ——"宿主确实来拉资源了"这件事在本地只有它能看到（遥测是延迟的、本地不可见），不是给用户看的输出。
 */
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

/** 定稿的 `ui://` 资源 URI（无变量模板，不进 `resources/list`）。 */
export const GET_STARTED_RESOURCE_URI = "ui://cloudbase/get-started";

/** MCP Apps 资源 MUST 使用此 MIME。 */
export const GET_STARTED_MIME_TYPE = "text/html;profile=mcp-app";

/** 面板状态卡的静态兜底数据（全部来自本地，读资源时不发网络/文件请求）。 */
export interface GetStartedStatus {
  envId: string | null;
  site: string;
  region: string;
}

/**
 * 原始 code → 词典 key。这些 code 只允许出现在词典与本文件的脚本查表里，
 * 不允许出现在面板正文（见下面对应的静态断言）。
 */
const REGION_MESSAGE_KEYS: ReadonlyArray<readonly [string, MessageKey]> = [
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

const SITE_MESSAGE_KEYS: ReadonlyArray<readonly [string, MessageKey]> = [
  ["domestic", "mcpUi.site.domestic"],
  ["intl", "mcpUi.site.intl"],
];

const SCOPE_MESSAGE_KEYS: ReadonlyArray<readonly [string, MessageKey]> = [
  ["account", "mcpUi.scope.account"],
  ["single_env", "mcpUi.scope.singleEnv"],
];

/** 按 `& < > " '` 转义，避免环境 ID 等值破坏 HTML 结构。 */
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

/** 从 server 实例派生静态兜底状态；只读本地状态，不发起任何请求。 */
export function resolveGetStartedStatus(server: ExtendedMcpServer): GetStartedStatus {
  const envId =
    server.cloudBaseOptions?.envId ||
    process.env.CLOUDBASE_ENV_ID ||
    getCachedEnvId() ||
    null;
  const { site, region } = resolveSiteAndRegion({
    site: server.cloudBaseOptions?.site,
    region: server.cloudBaseOptions?.region,
  });
  return { envId, site, region };
}

/**
 * 生成面板 HTML。模板串保持纯 ASCII：所有自然语言来自词典，按 `lang` 求值后注入。
 */
export function buildGetStartedHtml(lang: Lang, status: GetStartedStatus): string {
  const L = (key: MessageKey): string => t(key, undefined, lang);
  const E = escapeHtml;
  const J = jsLiteral;
  const S = (key: MessageKey): string => J(L(key));

  /** 把 code → 词典 key 的表组装成脚本里的查表对象字面量。 */
  const tableOf = (pairs: ReadonlyArray<readonly [string, MessageKey]>): string =>
    pairs.map(([code, key]) => `${J(code)}:${S(key)}`).join(",");

  const siteLabelDir = new Map(SITE_MESSAGE_KEYS);
  const regionLabelDir = new Map(REGION_MESSAGE_KEYS);
  /** 认不出的 code 照原样显示；认得出走词典（宁可不译，不要译错）。 */
  const labelOf = (dir: Map<string, MessageKey>, code: string): string => {
    const key = dir.get(code);
    return key ? L(key) : code;
  };
  const siteText = labelOf(siteLabelDir, status.site);
  const regionText = labelOf(regionLabelDir, status.region);
  const placeText = regionText
    ? siteText
      ? `${regionText}${L("mcpUi.place.open")}${siteText}${L("mcpUi.place.close")}`
      : regionText
    : siteText;

  const title = E(L("mcpUi.title"));
  const subtitle = E(L("mcpUi.subtitle"));
  const statusTitle = E(L("mcpUi.status.title"));
  const rawLabel = E(L("mcpUi.status.raw"));
  const nextTitle = E(L("mcpUi.next.title"));
  const envTitle = E(L("mcpUi.env.title"));
  const envHint = E(L("mcpUi.env.hint"));
  const footnote = E(L("mcpUi.footnote"));

  const envIdText = status.envId ? E(status.envId) : E(L("mcpUi.status.unset"));

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root {
  color-scheme: light dark;
  --bg: #F6F7F9; --surface: #ffffff; --tint: #EFF5FF; --border: rgba(16,24,40,.08); --border-2: rgba(16,24,40,.05);
  --text: #141A24; --text-2: #5A6472;
  --primary: #0052D9; --primary-hover: #0043B4;
  --ok: #12B76A; --warn: #F79009; --err: #F04438;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101318; --surface: #191D24; --border: rgba(255,255,255,.10); --border-2: rgba(255,255,255,.06); --tint: rgba(0,82,217,.25);
    --text: #E9EDF2; --text-2: #9AA4B2;
    --primary: #4896FF; --primary-hover: #63A9FF;
  }
}
* { box-sizing: border-box; }
  @media (prefers-color-scheme: dark) { .card { box-shadow: none; } }
html, body { margin: 0; }
[hidden] { display: none !important; }
body {
  background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased;
  font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
.panel { width: 719px; max-width: 100%; margin: 0 auto; padding: 16px; }
.head { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; }
.logo { display: inline-flex; flex: 0 0 auto; }
.logo svg { width: 22px; height: 22px; display: block; }
.head h1 { font-size: 22px; font-weight: 600; margin: 0 0 2px; letter-spacing: -.01em; }
.head .sub { margin: 0; font-size: 13px; color: var(--text-2); }
.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; padding: 16px; margin: 0 0 12px; box-shadow: 0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10);
}
.card > h2 {
  font-size: 16px; font-weight: 600; color: var(--text);
  margin: 0 0 10px; letter-spacing: -.01em;
}
.state { display: flex; align-items: center; gap: 6px; margin: 0 0 10px; font-size: 14px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-2); flex: 0 0 auto; }
.dot.ok { background: var(--ok); }
.dot.warn { background: var(--warn); }
.dot.err { background: var(--err); }
.state .qual { color: var(--text-2); font-size: 12px; }
.state .qual::before { content: "\\00B7\\00A0"; }
.kv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
.kv .row { min-width: 0; }
.kv .row.wide { grid-column: 1 / -1; }
.kv .k { font-size: 13px; color: var(--text-2); margin: 0 0 4px; }
.kv .v { margin: 0; font-size: 14px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.kv .v.idle { color: var(--text-2); }
.kv .v.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: var(--text-2); }
.next .label { font-size: 13px; color: var(--text-2); margin: 0 0 8px; }
.next .why { font-size: 13px; color: var(--text-2); margin: 8px 0 0; }
.next .why:empty { display: none; }
.hint { font-size: 12px; color: var(--text-2); margin: 6px 0 0; }
.env-list { display: flex; flex-direction: column; gap: 6px; margin: 10px 0 0; }
.env-item {
  display: flex; align-items: center; gap: 10px; width: 100%; height: auto; padding: 8px 10px;
  text-align: left; background: var(--bg); border: 1px solid var(--border-2); border-radius: 8px;
}
.env-item .n { font-weight: 600; overflow-wrap: anywhere; }
.env-item .i {
  font-size: 12px; color: var(--text-2); overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.env-item .t { margin-left: auto; flex: 0 0 auto; font-size: 12px; color: var(--text-2); }
.env-item .t.off { opacity: .65; }
.row-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
button {
  font: inherit; font-size: 14px; height: 32px; padding: 0 14px; border-radius: 8px; cursor: pointer;
  white-space: nowrap; background: var(--surface); color: var(--text); border: 1px solid var(--border);
  transition: border-color .15s, color .15s, background .15s;
}
button:hover { background: var(--tint); border-color: transparent; color: var(--primary); }
button.primary { height: 36px; background: var(--primary); border-color: var(--primary); color: #fff; }
button.primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); color: #fff; }
button.link { height: 32px; padding: 0 14px; border-radius: 8px; background: var(--surface); color: var(--text); border: 1px solid var(--border); }
button.link:hover { background: var(--tint); border-color: transparent; color: var(--primary); }
button[disabled] { cursor: default; opacity: .6; }
button.primary[disabled]:hover { background: var(--primary); border-color: var(--primary); color: #fff; }
button.link[disabled]:hover { background: var(--surface); border-color: var(--border); color: var(--text-2); }
.kbd { font-size: 12px; color: var(--text-2); margin: 8px 0 0; }
.kbd.err { color: var(--err); }
details { margin: 8px 0 0; }
summary {
  font-size: 12px; color: var(--text-2); cursor: pointer; list-style: none;
  display: inline-flex; align-items: center; gap: 4px;
}
summary::-webkit-details-marker { display: none; }
summary::before { content: "\\25B8"; font-size: 10px; }
details[open] summary::before { content: "\\25BE"; }
summary:hover { color: var(--primary); }
pre {
  margin: 6px 0 0; padding: 8px 10px; background: var(--bg); border: 1px solid var(--border-2);
  border-radius: 6px; font-size: 12px; line-height: 1.45;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre-wrap; overflow-wrap: anywhere; max-height: 200px; overflow: auto;
}
.foot { font-size: 12px; color: var(--text-2); margin: 0; padding-top: 10px; border-top: 1px solid var(--border-2); }
/* The logo's dark blue is low-contrast on a dark page; dark mode swaps in the logo's own light blue. */
@media (prefers-color-scheme: dark) { .logo .logo-strong { fill: #4896FF; } }
</style>
</head>
<body>
<main class="panel">
<div class="head">
<span class="logo" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none" focusable="false">
<path fill-rule="evenodd" clip-rule="evenodd" d="M-0.00195272 13.364C-0.0021879 13.0869 0.100481 12.8097 0.306053 12.5947L8.64438 4.25689C8.74869 4.15259 8.89015 4.09399 9.03766 4.09399H19.6942C20.1894 4.09399 20.4377 4.69236 20.088 5.04296L11.7889 13.364H-0.00195272Z" fill="#67E9E9"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M-0.00195272 13.366C-0.00218796 13.6431 0.100474 13.9203 0.306033 14.1353L8.64438 22.4731C8.74869 22.5774 8.89015 22.636 9.03766 22.636H19.6942C20.1894 22.636 20.4377 22.0376 20.088 21.687L11.7889 13.366H-0.00195272Z" fill="#2BCCCC"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M35.999 22.2539C35.9993 21.9781 35.8977 21.7023 35.6942 21.4877L27.3527 13.1468C27.2484 13.0425 27.1069 12.9839 26.9594 12.9839H16.3029C15.8077 12.9839 15.5594 13.5823 15.9091 13.9328L24.2081 22.2539H35.999Z" fill="#4896FF"/>
<path class="logo-strong" fill-rule="evenodd" clip-rule="evenodd" d="M35.999 22.2534C35.9994 22.526 35.9002 22.7987 35.7015 23.0123L27.3527 31.3605C27.2484 31.4648 27.1069 31.5234 26.9594 31.5234H16.3029C15.8077 31.5234 15.5594 30.9251 15.9091 30.5745L24.2081 22.2534H35.999Z" fill="#0052D9"/>
</svg></span>
<div>
<h1>${title}</h1>
<p class="sub">${subtitle}</p>
</div>
</div>
<section class="card">
<h2>${statusTitle}</h2>
<div class="state" id="state-row" role="status">
<span class="dot idle" id="st-dot"></span>
<span id="st-text">${E(L("mcpUi.status.unknown"))}</span>
<span class="qual" id="st-qual">${E(L("mcpUi.status.unknownHint"))}</span>
</div>
<div class="kv">
<div class="row"><p class="k">${E(L("mcpUi.status.place"))}</p><p class="v${placeText ? "" : " idle"}" id="k-place">${placeText ? E(placeText) : E(L("mcpUi.status.placeUnknown"))}</p></div>
<div class="row"><p class="k">${E(L("mcpUi.status.scope"))}</p><p class="v idle" id="k-scope">${E(L("mcpUi.status.scopeAfterLogin"))}</p></div>
<div class="row wide"><p class="k">${E(L("mcpUi.status.envId"))}</p><p class="v mono${status.envId ? "" : " idle"}" id="k-env">${envIdText}</p></div>
</div>
<details id="raw-box" hidden>
<summary>${rawLabel}</summary>
<pre id="raw-out"></pre>
</details>
</section>
<section class="card" id="env-card" hidden>
<h2>${envTitle}</h2>
<p class="hint">${envHint}</p>
<div class="env-list" id="env-list" role="group" aria-label="${envTitle}"></div>
<p class="kbd err" id="env-err" hidden></p>
</section>
<section class="card">
<h2>${nextTitle}</h2>
<div class="next">
<p class="label" id="nx-label">${E(L("mcpUi.next.label.unknown"))}</p>
<div class="row-actions">
<button class="primary" id="btn-main" type="button" hidden></button>
<button class="link" id="btn-refresh" type="button">${E(L("mcpUi.next.action.refresh"))}</button>
</div>
<p class="why" id="nx-why">${E(L("mcpUi.next.why.unknown"))}</p>
<p class="kbd err" id="k-err" hidden></p>
</div>
</section>
<p class="foot">${footnote}</p>
</main>
<script>
(function () {
  var host = window.parent;
  var nextId = 1;
  var pending = {};
  var CHECK_TIMEOUT_MS = 10000;
  var T = {
    region: {${tableOf(REGION_MESSAGE_KEYS)}},
    site: {${tableOf(SITE_MESSAGE_KEYS)}},
    scope: {${tableOf(SCOPE_MESSAGE_KEYS)}},
    placeOpen: ${S("mcpUi.place.open")},
    placeClose: ${S("mcpUi.place.close")},
    placeUnknown: ${S("mcpUi.status.placeUnknown")},
    scopeAfterLogin: ${S("mcpUi.status.scopeAfterLogin")},
    statusUnknown: ${S("mcpUi.status.unknown")},
    statusUnknownHint: ${S("mcpUi.status.unknownHint")},
    statusLoggedOut: ${S("mcpUi.status.loggedOut")},
    statusLoggedOutHint: ${S("mcpUi.status.loggedOutHint")},
    statusLoggedIn: ${S("mcpUi.status.loggedIn")},
    statusUnboundHint: ${S("mcpUi.status.unboundHint")},
    statusConnected: ${S("mcpUi.status.connected")},
    statusConnectedHint: ${S("mcpUi.status.connectedHint")},
    statusPending: ${S("mcpUi.status.pending")},
    statusPendingHint: ${S("mcpUi.status.pendingHint")},
    statusFailed: ${S("mcpUi.status.failed")},
    statusFailedHint: ${S("mcpUi.status.failedHint")},
    statusUnset: ${S("mcpUi.status.unset")},
    nextLabelUnknown: ${S("mcpUi.next.label.unknown")},
    nextLabelLoggedOut: ${S("mcpUi.next.label.loggedOut")},
    nextLabelPending: ${S("mcpUi.next.label.pending")},
    nextLabelFailed: ${S("mcpUi.next.label.failed")},
    nextLabelUnbound: ${S("mcpUi.next.label.unbound")},
    nextLabelReady: ${S("mcpUi.next.label.ready")},
    nextWhyUnknown: ${S("mcpUi.next.why.unknown")},
    nextWhyLoggedOut: ${S("mcpUi.next.why.loggedOut")},
    nextWhyPending: ${S("mcpUi.next.why.pending")},
    nextWhyFailed: ${S("mcpUi.next.why.failed")},
    nextWhyUnbound: ${S("mcpUi.next.why.unbound")},
    nextWhyReady: ${S("mcpUi.next.why.ready")},
    actionLogin: ${S("mcpUi.next.action.login")},
    actionSelectEnv: ${S("mcpUi.next.action.selectEnv")},
    actionDeploy: ${S("mcpUi.next.action.deploy")},
    actionRefresh: ${S("mcpUi.next.action.refresh")},
    messageLogin: ${S("mcpUi.message.login")},
    messageSelectEnv: ${S("mcpUi.message.selectEnv")},
    messageDeploy: ${S("mcpUi.message.deploy")},
    actionPending: ${S("mcpUi.action.pending")},
    actionSent: ${S("mcpUi.action.sent")},
    actionError: ${S("mcpUi.action.error")},
    actionTimeout: ${S("mcpUi.action.timeout")},
    envReady: ${S("mcpUi.env.ready")},
    envUnavailable: ${S("mcpUi.env.unavailable")},
    envMore: ${S("mcpUi.env.more")},
    envMoreTotal: ${S("mcpUi.env.moreTotal")},
    envFailed: ${S("mcpUi.env.failed")},
    nextLabelUnboundList: ${S("mcpUi.next.label.unboundList")}
  };
  // One action per screen. main === "" means: no main action for this state (the secondary
  // re-check link is the only thing to press).
  var STATES = {
    unknown: { dot: "", text: T.statusUnknown, hint: T.statusUnknownHint, label: T.nextLabelUnknown, why: T.nextWhyUnknown, main: "", msg: "" },
    loggedOut: { dot: "", text: T.statusLoggedOut, hint: T.statusLoggedOutHint, label: T.nextLabelLoggedOut, why: T.nextWhyLoggedOut, main: T.actionLogin, msg: T.messageLogin },
    pending: { dot: "warn", text: T.statusPending, hint: T.statusPendingHint, label: T.nextLabelPending, why: T.nextWhyPending, main: "", msg: "" },
    failed: { dot: "err", text: T.statusFailed, hint: T.statusFailedHint, label: T.nextLabelFailed, why: T.nextWhyFailed, main: T.actionLogin, msg: T.messageLogin },
    unbound: { dot: "warn", text: T.statusLoggedIn, hint: T.statusUnboundHint, label: T.nextLabelUnbound, why: T.nextWhyUnbound, main: T.actionSelectEnv, msg: T.messageSelectEnv },
    ready: { dot: "ok", text: T.statusConnected, hint: T.statusConnectedHint, label: T.nextLabelReady, why: T.nextWhyReady, main: T.actionDeploy, msg: T.messageDeploy }
  };
  // Local config only fills the gaps until the live result arrives; it never overrides a live value.
  // Region and site are kept apart (not pre-joined) because a real auth(status) result always
  // carries current_region but carries site only when the caller passed one explicitly, so the
  // two halves have to fall back independently.
  var FALLBACK = { region: ${J(regionText)}, site: ${J(siteText)}, env: ${J(status.envId ?? "")} };

  var stDot = document.getElementById("st-dot");
  var stText = document.getElementById("st-text");
  var stQual = document.getElementById("st-qual");
  var kPlace = document.getElementById("k-place");
  var kScope = document.getElementById("k-scope");
  var kEnv = document.getElementById("k-env");
  var rawBox = document.getElementById("raw-box");
  var rawOut = document.getElementById("raw-out");
  var nxLabel = document.getElementById("nx-label");
  var nxWhy = document.getElementById("nx-why");
  var mainBtn = document.getElementById("btn-main");
  var refreshBtn = document.getElementById("btn-refresh");
  var errLine = document.getElementById("k-err");
  var envCard = document.getElementById("env-card");
  var envList = document.getElementById("env-list");
  var envErr = document.getElementById("env-err");
  var ENV_LIMIT = 5;
  var current = STATES.unknown;
  // targetOrigin "*" and no origin check on incoming messages: matches the spec's own example, and a
  // sandboxed view has no host origin to verify against. Do not "fix" this into a pinned origin.
  function post(message) {
    host.postMessage(message, "*");
  }
  function request(method, params) {
    var id = nextId++;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      post({ jsonrpc: "2.0", id: id, method: method, params: params });
    });
  }
  function notify(method, params) {
    post({ jsonrpc: "2.0", method: method, params: params });
  }
  function setText(el, value) {
    if (el) { el.textContent = value; }
  }
  function reportSize() {
    notify("ui/notifications/size-changed", {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    });
  }
  function tryParse(text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      return null;
    }
  }
  // The host hands the panel the result of the call that rendered it. Prefer structuredContent;
  // fall back to parsing the JSON text payload, which is how this server returns tool results.
  function readPayload(result) {
    if (!result || typeof result !== "object") { return null; }
    if (result.structuredContent && typeof result.structuredContent === "object") {
      return result.structuredContent;
    }
    var content = result.content;
    if (content && content.length > 0 && typeof content[0].text === "string") {
      var parsed = tryParse(content[0].text);
      if (parsed && typeof parsed === "object") { return parsed; }
    }
    return null;
  }
  // Raw payloads are shown as text only, inside the collapsed "view raw" area.
  function rawTextOf(value) {
    if (typeof value === "string") { return value; }
    if (value && typeof value === "object") {
      var content = value.content;
      if (content && content.length > 0 && typeof content[0].text === "string") {
        return content[0].text;
      }
    }
    return JSON.stringify(value, null, 2);
  }
  function showRaw(value) {
    if (!rawBox || !rawOut) { return; }
    var text = rawTextOf(value);
    rawOut.textContent = typeof text === "string" ? text : String(text);
    rawBox.hidden = false;
  }
  function stateKey(payload) {
    if (!payload) { return "unknown"; }
    var s = payload.auth_status;
    if (s === "PENDING") { return "pending"; }
    if (s === "READY") { return payload.current_env_id ? "ready" : "unbound"; }
    if (s === "DENIED" || s === "EXPIRED" || s === "ERROR") { return "failed"; }
    if (s === "REQUIRED") { return "loggedOut"; }
    // The panel is mounted on every auth call, not just the status action; the other actions
    // answer with a code instead of auth_status. Only the two unambiguous ones are mapped here:
    // an AUTH_READY result does not say whether an environment is bound, so it stays unknown
    // and the re-check link resolves it.
    if (payload.code === "AUTH_PENDING") { return "pending"; }
    if (payload.code === "AUTH_REQUIRED") { return "loggedOut"; }
    return "unknown";
  }
  // Unknown codes are shown as-is: never guess a translation.
  function codeLabel(table, code) {
    if (!code || typeof code !== "string") { return ""; }
    return table[code] || code;
  }
  function placeOf(payload) {
    // Per field: a live value wins, a missing one falls back to local config. A real
    // auth(status) result always carries current_region but carries site only when the
    // caller passed one explicitly, so gating the whole line on "has any location" would
    // drop the site half on every ordinary call.
    var region = hasField(payload, "current_region")
      ? codeLabel(T.region, payload.current_region)
      : FALLBACK.region;
    var site = hasField(payload, "site")
      ? codeLabel(T.site, payload.site)
      : FALLBACK.site;
    if (region && site) { return region + T.placeOpen + site + T.placeClose; }
    return region || site;
  }
  // Live values win per field; the local fallback only fills a field the result does not carry.
  // Key presence (not truthiness) decides: an explicit "current_env_id": null means "not bound"
  // and must not be replaced by a locally cached envId.
  function hasField(payload, key) {
    return !!payload && typeof payload === "object" && key in payload;
  }
  function hideError() {
    if (errLine) { errLine.hidden = true; errLine.textContent = ""; }
  }
  function showError(text) {
    if (errLine) { errLine.hidden = false; errLine.textContent = text; }
  }
  // A host that never answers must not leave a control stuck on "working"; every panel-initiated
  // call goes through this so the same deadline applies.
  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("timeout")); }, ms);
      promise.then(function (value) {
        clearTimeout(timer);
        resolve(value);
      }, function (err) {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  function clearNode(el) {
    while (el.firstChild) { el.removeChild(el.firstChild); }
  }
  function envName(env) {
    if (typeof env.alias === "string" && env.alias) { return env.alias; }
    return typeof env.envId === "string" ? env.envId : "";
  }
  // Only what the result actually carries is drawn: no candidates in, no card out. Rows the
  // account can open come first; a row it cannot open stays visible, dimmed, because "why is my
  // environment missing" is a worse question than "this one is unavailable".
  function envRows(payload) {
    var list = payload && payload.env_candidates;
    if (!Array.isArray(list)) { return []; }
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var env = list[i];
      if (env && typeof env === "object" && typeof env.envId === "string" && env.envId) { out.push(env); }
    }
    out.sort(function (a, b) {
      var ra = a.status === "NORMAL" ? 0 : 1;
      var rb = b.status === "NORMAL" ? 0 : 1;
      if (ra !== rb) { return ra - rb; }
      var na = envName(a);
      var nb = envName(b);
      return na < nb ? -1 : na > nb ? 1 : 0;
    });
    return out;
  }
  function setEnvBusy(disabled) {
    if (!envList) { return; }
    var items = envList.querySelectorAll(".env-item");
    for (var i = 0; i < items.length; i++) { items[i].disabled = disabled; }
  }
  function envRow(env) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "env-item";
    var name = document.createElement("span");
    name.className = "n";
    name.textContent = envName(env);
    var id = document.createElement("span");
    id.className = "i";
    id.textContent = env.envId;
    var tag = document.createElement("span");
    tag.className = "t" + (env.status === "NORMAL" ? "" : " off");
    tag.textContent = env.status === "NORMAL" ? T.envReady : (env.status ? T.envUnavailable : "");
    btn.appendChild(name);
    btn.appendChild(id);
    btn.appendChild(tag);
    btn.addEventListener("click", function () { bindEnv(env.envId, envName(env)); });
    return btn;
  }
  function renderEnvs(payload) {
    if (!envCard || !envList) { return false; }
    var rows = envRows(payload);
    clearNode(envList);
    if (envErr) { envErr.hidden = true; envErr.textContent = ""; }
    if (rows.length === 0) {
      envCard.hidden = true;
      return false;
    }
    var shown = rows.length > ENV_LIMIT ? rows.slice(0, ENV_LIMIT) : rows;
    for (var i = 0; i < shown.length; i++) { envList.appendChild(envRow(shown[i])); }
    if (rows.length > shown.length) {
      // The result says how many exist in total; draw that instead of a vague "and more".
      var total = payload && payload.env_candidates_summary && typeof payload.env_candidates_summary.total === "number"
        ? payload.env_candidates_summary.total
        : 0;
      var more = document.createElement("p");
      more.className = "hint";
      more.textContent = total > shown.length
        ? T.envMoreTotal.replace("{total}", String(total)).replace("{shown}", String(shown.length))
        : T.envMore.replace("{shown}", String(shown.length));
      envList.appendChild(more);
    }
    envCard.hidden = false;
    return true;
  }
  // One click, one path: the panel asks the host to run auth(set_env) itself, then re-reads the
  // status so the card shows the bound environment instead of guessing. Hosts that do not forward
  // app-initiated calls leave the deadline to fail the promise, and the row says so in one line
  // instead of pretending the click worked.
  function bindEnv(envId, name) {
    if (busy || !envId) { return; }
    busy = true;
    setEnvBusy(true);
    if (envErr) { envErr.hidden = true; envErr.textContent = ""; }
    withTimeout(request("tools/call", { name: "auth", arguments: { action: "set_env", envId: envId } }), CHECK_TIMEOUT_MS)
      .then(function (result) {
        var payload = readPayload(result);
        if (payload && payload.ok === false) { throw new Error(typeof payload.code === "string" ? payload.code : "SET_ENV_FAILED"); }
        return withTimeout(request("tools/call", { name: "auth", arguments: { action: "status" } }), CHECK_TIMEOUT_MS);
      })
      .then(function (result) {
        var payload = readPayload(result);
        if (payload) { render(payload); } else { render(null); showRaw(result); }
      })
      .catch(function () {
        if (envErr) { envErr.hidden = false; envErr.textContent = T.envFailed.replace("{alias}", name || envId); }
      })
      .then(function () {
        busy = false;
        setEnvBusy(false);
        reportSize();
      });
  }
  function render(payload) {
    var state = STATES[stateKey(payload)];
    current = state;
    hideError();
    if (stDot) { stDot.className = "dot" + (state.dot ? " " + state.dot : ""); }
    setText(stText, state.text);
    setText(stQual, state.hint);
    var place = placeOf(payload);
    if (kPlace) {
      kPlace.className = place ? "v" : "v idle";
      setText(kPlace, place || T.placeUnknown);
    }
    var scope = hasField(payload, "credential_scope")
      ? codeLabel(T.scope, payload.credential_scope)
      : "";
    if (kScope) {
      kScope.className = scope ? "v" : "v idle";
      setText(kScope, scope || T.scopeAfterLogin);
    }
    var env = hasField(payload, "current_env_id")
      ? (typeof payload.current_env_id === "string" ? payload.current_env_id : "")
      : FALLBACK.env;
    if (kEnv) {
      kEnv.className = env ? "v mono" : "v mono idle";
      setText(kEnv, env || T.statusUnset);
    }
    var envShown = renderEnvs(payload);
    setText(nxLabel, state === STATES.unbound && envShown ? T.nextLabelUnboundList : state.label);
    setText(nxWhy, state.why);
    if (mainBtn) {
      // When the environment rows are on screen, the "pick an environment" button would only send
      // the question back to the conversation: the list itself is the action, so it steps aside.
      var replacedByList = envShown && state.main === T.actionSelectEnv;
      mainBtn.hidden = !state.main || replacedByList;
      mainBtn.disabled = false;
      setText(mainBtn, state.main);
    }
    if (payload) { showRaw(JSON.stringify(payload, null, 2)); }
  }
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || typeof data !== "object") { return; }
    // The host sends the result of the tool call that rendered this view as a notification.
    // This panel is mounted on the multi-purpose auth tool, so every auth call renders it;
    // consuming the notification is what keeps that call's real result visible here.
    if (data.method === "ui/notifications/tool-result") {
      var payload = readPayload(data.params);
      // A result we cannot read as a status payload is never spread across the panel body: it goes
      // into the collapsed raw area and the card falls back to its local, unconfirmed values.
      // Unparsed text on screen is harder to read than no text at all.
      if (payload) { render(payload); } else { render(null); showRaw(data.params); }
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
  // appInfo is the field a real host validates: Codex answers -32603
  // params.appInfo Invalid input when it is absent. clientInfo is what the
  // published spec (2026-01-26, apps.mdx) calls the same thing. Send both:
  // an unknown key is ignored, a missing required one is not.
  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    appCapabilities: { availableDisplayModes: ["inline"] },
    appInfo: { name: "cloudbase-get-started", version: "1.0.0" },
    clientInfo: { name: "cloudbase-get-started", version: "1.0.0" }
  }).then(function () {
    notify("ui/notifications/initialized", {});
    reportSize();
  }).catch(function () {
    reportSize();
  });
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(reportSize).observe(document.body);
  }
  var busy = false;
  if (refreshBtn) {
    refreshBtn.addEventListener("click", function () {
      if (busy) { return; }
      busy = true;
      refreshBtn.disabled = true;
      var restore = refreshBtn.textContent || T.actionRefresh;
      setText(refreshBtn, T.actionPending);
      hideError();
      var settled = false;
      function finish() {
        busy = false;
        refreshBtn.disabled = false;
        setText(refreshBtn, restore);
      }
      // Timeout fallback: if the host never forwards this call, do not leave the panel sitting on
      // "checking" forever, which reads as broken.
      var timer = setTimeout(function () {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        finish();
        showError(T.actionTimeout);
        reportSize();
      }, CHECK_TIMEOUT_MS);
      request("tools/call", { name: "auth", arguments: { action: "status" } }).then(function (result) {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        finish();
        var payload = readPayload(result);
        if (payload) {
          render(payload);
        } else {
          // Same rule as the notification path: no unreadable return in the body.
          render(null);
          showRaw(result);
          showError(T.actionError);
        }
        reportSize();
      }).catch(function () {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        finish();
        showError(T.actionError);
        reportSize();
      });
    });
  }
  if (mainBtn) {
    mainBtn.addEventListener("click", function () {
      var state = current;
      if (!state || !state.msg) { return; }
      mainBtn.disabled = true;
      var restore = mainBtn.textContent || state.main;
      setText(mainBtn, T.actionSent);
      hideError();
      request("ui/message", { role: "user", content: { type: "text", text: state.msg } })
        .then(function () {
          mainBtn.disabled = false;
          setText(mainBtn, restore);
        })
        .catch(function () {
          mainBtn.disabled = false;
          setText(mainBtn, restore);
          showError(T.actionError);
        });
    });
  }
})();
</script>
</body>
</html>`;
}

/**
 * 注册 `ui://cloudbase/get-started`。
 *
 * 用**无变量的 `ResourceTemplate`**（而非 string uri）注册：能力位照旧自动带上
 * （`registerResource` 内部 `registerCapabilities({resources:{listChanged:true}})`），
 * `resources/read` 照旧可命中，但 `resources/list` 仍为空数组——纯 UI 资源不进列表。
 */
export function registerGetStartedResource(server: ExtendedMcpServer): void {
  server.registerResource(
    "cloudbase-get-started",
    new ResourceTemplate(GET_STARTED_RESOURCE_URI, { list: undefined }),
    {
      mimeType: GET_STARTED_MIME_TYPE,
      title: t("mcpUi.resourceTitle"),
      description: t("mcpUi.resourceDescription"),
    },
    async (uri) => {
      const startedAt = Date.now();
      const lang = getInstanceLang();
      let success = true;
      let errorMessage: string | undefined;
      let html = "";
      let bytes = 0;
      try {
        html = buildGetStartedHtml(lang, resolveGetStartedStatus(server));
        bytes = Buffer.byteLength(html, "utf8");
      } catch (error) {
        success = false;
        errorMessage = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        // 给人工验证的服务端信号：宿主是否真的来拉 `ui://` 资源，本地只能在这里看到。
        // 遥测是延迟的、本地不可见；这条日志让"人点了面板/宿主预取了一次"变成可观测事实。
        // 只记 uri / mime / 体积 / 语言——都不含环境或密钥类信息。
        debug("[mcp-ui] resource read", {
          uri: GET_STARTED_RESOURCE_URI,
          mimeType: GET_STARTED_MIME_TYPE,
          bytes,
          lang,
        });
        // 埋点：证明「声明 → 拉取」闭环。测试环境下跳过，避免额外 I/O。
        const isTestEnvironment =
          process.env.NODE_ENV === "test" || process.env.VITEST === "true";
        if (!isTestEnvironment) {
          reportResourceRead({
            resourceUri: GET_STARTED_RESOURCE_URI,
            mimeType: GET_STARTED_MIME_TYPE,
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
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: GET_STARTED_MIME_TYPE,
            text: html,
            _meta: { ui: { prefersBorder: true } },
          },
        ],
      };
    },
  );

  // 我们从不发 `notifications/resources/list_changed`（列表恒空），所以不声明自己不做的事：
  // `registerResource` 内部已写 `resources: { listChanged: true }`，这里用**公开 API** 覆盖为 false。
  // 依赖 `mergeCapabilities` 的「后写覆盖先写」，且必须在 connect 之前调用——
  // 该覆盖顺序依赖 SDK 内部实现，故由协议级测试断言 initialize 的最终形态为 false 钉住。
  server.server.registerCapabilities({ resources: { listChanged: false } });
}
