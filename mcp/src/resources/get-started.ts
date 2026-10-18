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
/* Fill whatever the host gives us; 860px is where one column of rows still reads well. */
.panel { width: 100%; max-width: 860px; margin: 0 auto; padding: 16px; }
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
/* Expanded, the list scrolls inside a capped box: the card must not push the conversation off the
   screen just because one project owns forty environments. */
/* Hosts hide scrollbars, so a clipped box would look like "that is all of them". The bottom edge
   fades instead: no extra element, no colour assumption about the card behind it. */
.env-list.scroll {
  max-height: 320px; overflow-y: auto; padding-right: 4px;
  -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent);
  mask-image: linear-gradient(to bottom, #000 calc(100% - 24px), transparent);
}
.env-foot { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.env-foot .hint { margin: 0; }
.row-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
button {
  font: inherit; font-size: 14px; height: 32px; padding: 0 14px; border-radius: 8px; cursor: pointer;
  white-space: nowrap; background: var(--surface); color: var(--text); border: 1px solid var(--border);
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  transition: border-color .15s, color .15s, background .15s;
}
/* Glyphs are inline SVG at 16px, stroke follows the button's text colour. */
.icon { width: 16px; height: 16px; flex: 0 0 auto; display: block; }
.linklike .icon { width: 13px; height: 13px; }
button:hover { background: var(--tint); border-color: transparent; color: var(--primary); }
button.primary { height: 36px; background: var(--primary); border-color: var(--primary); color: #fff; }
button.primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); color: #fff; }
@media (max-width: 560px) { button.primary { width: 100%; } }
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
.foot-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.foot-row .sep { color: var(--text-2); }
/* The note only exists when the host refused to open a link, so its separator is drawn by CSS
   rather than sitting in the markup as a dangling dot. */
#lnk-note::before { content: "\\00B7"; margin: 0 8px; color: var(--text-2); }
/* Text links, not buttons: they read as part of the sentence they sit in. */
.linklike { height: auto; padding: 0; border: 0; background: none; color: var(--primary); font-size: 12px; cursor: pointer; }
.linklike:hover { background: none; color: var(--primary-hover); text-decoration: underline; }
.linklike[disabled] { color: var(--text-2); text-decoration: none; }
/* The logo's dark blue is low-contrast on a dark page; dark mode swaps in the logo's own light blue. */
@media (prefers-color-scheme: dark) { .logo .logo-strong { fill: #4896FF; } }
</style>
</head>
<body>
<!-- Lucide glyphs, inline: no network, no icon font, no data URI. Buttons point a <use> at one of
     these; swapping an icon is a single attribute write. -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="ico-login" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/></symbol>
<symbol id="ico-server" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/></symbol>
<symbol id="ico-rocket" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></symbol>
<symbol id="ico-refresh" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></symbol>
<symbol id="ico-chevron-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></symbol>
<symbol id="ico-chevron-up" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></symbol>
</defs></svg>
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
<p class="sub" id="c-sub">${E(L("mcpUi.subtitle.unknown"))}</p>
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
<div class="env-foot" id="env-foot" hidden>
<p class="hint" id="env-more"></p>
<button class="linklike" type="button" id="env-toggle" hidden><svg class="icon" aria-hidden="true"><use id="ico-toggle" href="#ico-chevron-down"/></svg><span id="env-toggle-label"></span></button>
</div>
<p class="kbd err" id="env-err" hidden></p>
</section>
<section class="card">
<h2>${nextTitle}</h2>
<div class="next">
<p class="label" id="nx-label">${E(L("mcpUi.next.label.unknown"))}</p>
<div class="row-actions">
<button class="primary" id="btn-main" type="button" hidden><svg class="icon" aria-hidden="true"><use id="ico-main" href="#ico-login"/></svg><span id="btn-main-label"></span></button>
<button class="link" id="btn-refresh" type="button"><svg class="icon" aria-hidden="true"><use href="#ico-refresh"/></svg><span id="btn-refresh-label">${E(L("mcpUi.next.action.refresh"))}</span></button>
</div>
<p class="why" id="nx-why">${E(L("mcpUi.next.why.unknown"))}</p>
<p class="kbd err" id="k-err" hidden></p>
</div>
</section>
<div class="foot">
<p class="foot-row"><span>${footnote}</span></p>
<p class="foot-row">
<button class="linklike" type="button" id="lnk-docs">${E(L("mcpUi.link.docs"))}</button>
<span class="sep">&middot;</span>
<button class="linklike" type="button" id="lnk-github">${E(L("mcpUi.link.github"))}</button>
<span id="lnk-note" hidden></span>
</p>
</div>
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
    subtitleUnknown: ${S("mcpUi.subtitle.unknown")},
    subtitleLoggedOut: ${S("mcpUi.subtitle.loggedOut")},
    subtitlePending: ${S("mcpUi.subtitle.pending")},
    subtitleFailed: ${S("mcpUi.subtitle.failed")},
    subtitleUnbound: ${S("mcpUi.subtitle.unbound")},
    subtitleReady: ${S("mcpUi.subtitle.ready")},
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
    actionConnect: ${S("mcpUi.next.action.connect")},
    actionSelectEnv: ${S("mcpUi.next.action.selectEnv")},
    actionDeploy: ${S("mcpUi.next.action.deploy")},
    actionRefresh: ${S("mcpUi.next.action.refresh")},
    messageLogin: ${S("mcpUi.message.login")},
    messageConnect: ${S("mcpUi.message.connect")},
    messageSelectEnv: ${S("mcpUi.message.selectEnv")},
    messageDeploy: ${S("mcpUi.message.deploy")},
    actionPending: ${S("mcpUi.action.pending")},
    actionSent: ${S("mcpUi.action.sent")},
    actionError: ${S("mcpUi.action.error")},
    messageFailed: ${S("mcpUi.message.failed")},
    actionTimeout: ${S("mcpUi.action.timeout")},
    envReady: ${S("mcpUi.env.ready")},
    envUnavailable: ${S("mcpUi.env.unavailable")},
    envMore: ${S("mcpUi.env.more")},
    envShowAll: ${S("mcpUi.env.showAll")},
    envCollapse: ${S("mcpUi.env.collapse")},
    envRestHidden: ${S("mcpUi.env.restHidden")},
    envAllShown: ${S("mcpUi.env.allShown")},
    envMoreTotal: ${S("mcpUi.env.moreTotal")},
    envFailed: ${S("mcpUi.env.failed")},
    nextLabelUnboundList: ${S("mcpUi.next.label.unboundList")},
    linkFailed: ${S("mcpUi.link.failed")}
  };
  // One action per screen. main === "" means: no main action for this state (the secondary
  // re-check link is the only thing to press).
  var STATES = {
    // Nothing read yet: the one useful click is "connect", which authorises when nobody is signed
    // in and binds when they already are. A read-only re-check as the only button was a dead end.
    unknown: { dot: "", text: T.statusUnknown, hint: T.statusUnknownHint, label: T.nextLabelUnknown, why: T.nextWhyUnknown, main: T.actionConnect, msg: T.messageConnect, sub: T.subtitleUnknown },
    loggedOut: { dot: "", text: T.statusLoggedOut, hint: T.statusLoggedOutHint, label: T.nextLabelLoggedOut, why: T.nextWhyLoggedOut, main: T.actionLogin, msg: T.messageLogin, sub: T.subtitleLoggedOut },
    pending: { dot: "warn", text: T.statusPending, hint: T.statusPendingHint, label: T.nextLabelPending, why: T.nextWhyPending, main: "", msg: "", sub: T.subtitlePending },
    failed: { dot: "err", text: T.statusFailed, hint: T.statusFailedHint, label: T.nextLabelFailed, why: T.nextWhyFailed, main: T.actionLogin, msg: T.messageLogin, sub: T.subtitleFailed },
    unbound: { dot: "warn", text: T.statusLoggedIn, hint: T.statusUnboundHint, label: T.nextLabelUnbound, why: T.nextWhyUnbound, main: T.actionSelectEnv, msg: T.messageSelectEnv, sub: T.subtitleUnbound },
    ready: { dot: "ok", text: T.statusConnected, hint: T.statusConnectedHint, label: T.nextLabelReady, why: T.nextWhyReady, main: T.actionDeploy, msg: T.messageDeploy, sub: T.subtitleReady }
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
  var envFoot = document.getElementById("env-foot");
  var envMore = document.getElementById("env-more");
  var envToggle = document.getElementById("env-toggle");
  var ENV_LIMIT = 5;
  // Which rows the current result carried, and whether the user asked for all of them. Kept apart
  // from the payload so expanding does not re-read or re-render anything the host sent.
  var envAll = [];
  var envTotal = 0;
  var envReturned = 0;
  var envExpanded = false;
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
  /**
   * The uncapped candidate list travels in _meta: hosts hand it to the view and keep it away from
   * the model, so a 60-environment account costs the conversation nothing. Absent when the host
   * strips that field or the server sent no candidates - callers fall back to the capped list.
   */
  function readUiEnvs(result) {
    var meta = result && typeof result === "object" ? result._meta : null;
    var box = meta && typeof meta === "object" ? meta["cloudbase/ui"] : null;
    var list = box && typeof box === "object" ? box.env_candidates : null;
    return Array.isArray(list) ? list : null;
  }

  /** Swap the capped list for the full one and restate the summary so the footer tells the truth. */
  function withUiEnvs(payload, list) {
    var out = {};
    for (var key in payload) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) { out[key] = payload[key]; }
    }
    out.env_candidates = list;
    var summary = payload && payload.env_candidates_summary ? payload.env_candidates_summary : null;
    var total = summary && typeof summary.total === "number" ? Math.max(summary.total, list.length) : list.length;
    out.env_candidates_summary = { total: total, returned: list.length, truncated: false };
    return out;
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
  /** Shorthand for one of the static nodes grabbed at boot; null when the id is missing. */
  function el(id) { return document.getElementById(id); }

  /** Swap a button glyph: one <use> plus one <symbol> per icon, so this is one attribute write. */
  function setIcon(use, name) {
    if (use) { use.setAttribute("href", "#ico-" + name); }
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
    envAll = envRows(payload);
    envTotal = payload && payload.env_candidates_summary && typeof payload.env_candidates_summary.total === "number"
      ? payload.env_candidates_summary.total
      : envAll.length;
    envReturned = envAll.length;
    // A new result starts collapsed: the user asked for the next step, not for forty rows.
    envExpanded = false;
    if (envErr) { envErr.hidden = true; envErr.textContent = ""; }
    if (envAll.length === 0) {
      envCard.hidden = true;
      if (envFoot) { envFoot.hidden = true; }
      return false;
    }
    envCard.hidden = false;
    paintEnvs();
    return true;
  }

  /** Draw the rows for the current expanded/collapsed state. Nothing here goes back to the host. */
  function paintEnvs() {
    if (!envList) { return; }
    clearNode(envList);
    var shown = envExpanded ? envAll : envAll.slice(0, ENV_LIMIT);
    for (var i = 0; i < shown.length; i++) { envList.appendChild(envRow(shown[i])); }
    envList.className = "env-list" + (envExpanded && envAll.length > ENV_LIMIT ? " scroll" : "");

    var canExpand = envAll.length > ENV_LIMIT;
    var truncated = envTotal > envAll.length;
    // Nothing to expand and nothing missing: no footer at all.
    if (!canExpand && !truncated) {
      if (envFoot) { envFoot.hidden = true; }
      return;
    }
    if (envFoot) { envFoot.hidden = false; }
    if (envToggle) {
      envToggle.hidden = !canExpand;
      if (canExpand) {
        setText(el("env-toggle-label"), envExpanded ? T.envCollapse : T.envShowAll);
        setIcon(el("ico-toggle"), envExpanded ? "chevron-up" : "chevron-down");
        envToggle.setAttribute("aria-expanded", envExpanded ? "true" : "false");
      }
    }
    if (envMore) {
      // Collapsed: how much of the account is on screen. Expanded: how much the result actually
      // carried. Either way the remainder is named, not implied - a row of text that says "the
      // first five" without saying where the rest are is the dead end this replaced.
      var restored = envTotal - envReturned;
      if (!canExpand) {
        envMore.textContent = T.envRestHidden.replace("{n}", String(restored));
      } else if (!envExpanded) {
        // How many exist, and the button says how many of them this result can actually list:
        // "first 5 of 37" next to "show all 12" made the reader compare three numbers.
        envMore.textContent = T.envAllShown.replace("{total}", String(envTotal));
      } else if (restored > 0) {
        envMore.textContent = T.envRestHidden.replace("{n}", String(restored));
      } else {
        envMore.textContent = T.envAllShown.replace("{total}", String(envTotal));
      }
    }
  }

  if (envToggle) {
    envToggle.addEventListener("click", function () {
      envExpanded = !envExpanded;
      paintEnvs();
      // The card just changed height by hundreds of pixels; the host has to be told or it keeps
      // the old frame and the last rows are cut off.
      reportSize();
    });
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
    // The title never changes; the subtitle is one fixed sentence per state, and the state before
    // any result is a plain welcome instead of a guess about what the panel is checking.
    var subNode = el("c-sub");
    if (subNode && state.sub) { setText(subNode, state.sub); }
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
      // With rows on screen the list is the path; a second bordered button next to it competes for
      // the same glance. The fallback drops to a text link instead of disappearing (hosts that
      // never push results still need it).
      var refreshBtn = el("btn-refresh");
      if (refreshBtn) { refreshBtn.className = replacedByList ? "linklike" : "link"; }
      mainBtn.disabled = false;
      setText(el("btn-main-label"), state.main);
      setIcon(el("ico-main"), state.main === T.actionSelectEnv ? "server" : (state.main === T.actionDeploy ? "rocket" : "login"));
    }
    if (payload) { showRaw(JSON.stringify(payload, null, 2)); }
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
    // The host sends the result of the tool call that rendered this view as a notification.
    // This panel is mounted on the multi-purpose auth tool, so every auth call renders it;
    // consuming the notification is what keeps that call's real result visible here.
    if (data.method === "ui/notifications/tool-result") {
      var payload = readPayload(data.params);
      var fullList = readUiEnvs(data.params);
      if (payload && fullList) { payload = withUiEnvs(payload, fullList); }
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
  var LINKS = {
    "lnk-docs": "https://docs.cloudbase.net/",
    "lnk-github": "https://github.com/TencentCloudBase/CloudBase-AI-Toolkit"
  };
  var linkNote = document.getElementById("lnk-note");
  function showLinkNote(text) {
    if (!linkNote) { return; }
    linkNote.textContent = text;
    linkNote.hidden = !text;
  }
  // ui/open-link keeps the navigation decision with the host; the panel never sets a location
  // itself. A host that refuses gets the URL printed next to the link instead of a dead click.
  function openExternal(id) {
    var url = LINKS[id];
    if (!url) { return; }
    showLinkNote("");
    request("ui/open-link", { url: url }).then(function (result) {
      if (result && result.isError) { showLinkNote(T.linkFailed.replace("{url}", url)); }
    }, function () {
      showLinkNote(T.linkFailed.replace("{url}", url));
    });
  }
  for (var linkId in LINKS) {
    var linkEl = document.getElementById(linkId);
    if (linkEl) {
      linkEl.addEventListener("click", function (event) {
        var target = event && event.currentTarget ? event.currentTarget : null;
        openExternal(target ? target.id : "");
      });
    }
  }
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
      var restore = (el("btn-refresh-label") && el("btn-refresh-label").textContent) || T.actionRefresh;
      setText(el("btn-refresh-label"), T.actionPending);
      hideError();
      var settled = false;
      function finish() {
        busy = false;
        refreshBtn.disabled = false;
        setText(el("btn-refresh-label"), restore);
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
        var refreshList = readUiEnvs(result);
        if (payload && refreshList) { payload = withUiEnvs(payload, refreshList); }
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
      var restore = (el("btn-main-label") && el("btn-main-label").textContent) || state.main;
      setText(el("btn-main-label"), T.actionSent);
      hideError();
      request("ui/message", { role: "user", content: { type: "text", text: state.msg } })
        .then(function () {
          mainBtn.disabled = false;
          setText(el("btn-main-label"), restore);
        })
        .catch(function () {
          mainBtn.disabled = false;
          // Label lives in its own span: writing the button's textContent would delete the icon.
          setText(el("btn-main-label"), restore);
          // The text never reached the conversation; hand it over so the click still ends somewhere.
          copyText(state.msg);
          showError(T.messageFailed);
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
