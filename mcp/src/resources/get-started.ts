/**
 * MCP Apps 入口面板：`ui://cloudbase/get-started`
 *
 * 为什么存在：服务端此前一条 UI 都没声明（`capabilities` 里只有 `tools`）。本资源是
 * 一期唯一的 UI 落点——一个自包含单文件 HTML，经 `_meta.ui.resourceUri` 挂在既有
 * `auth` 工具上，给声明了 `io.modelcontextprotocol/ui` 的客户端一个"能看见的入口"。
 *
 * 三条纪律（对应 specs/mcp-ui/design.md §2.1 / §3.1）：
 *   1. **零外链**：宿主默认 CSP 只允许自身与内联（`script-src 'self' 'unsafe-inline'`、
 *      `style-src 'self' 'unsafe-inline'`、`img-src 'self' data:`），并禁止一切外部网络
 *      （`connect-src 'none'`）⇒ 面板必须完全自包含；CSS/JS 全部内联，不引任何 CDN / 字体 /
 *      图片 / 图表库（内联脚本本身正依赖上面的 `'unsafe-inline'`）。
 *   2. **模板纯 ASCII**：HTML 模板串只含结构与占位符，所有句子经 `t(key, params, lang)`
 *      注入；`t()` 在 read 回调里求值，晚于 `setInstanceLang`，英文实例自动出英文。
 *   3. **只读无密钥**：状态值只来自 `server.cloudBaseOptions` / 环境变量 / 缓存 / 站点解析，
 *      读资源时不发网络请求；唯一会发出的调用是面板按钮触发的只读 `auth(action:"status")`。
 *   4. **也呈现"叫它来的那次调用"**：宿主会以 `ui/notifications/tool-result` 通知把「令本次
 *      面板被渲染的那次工具调用」的结果送来。面板挂在多用途的 `auth` 上，每一次 `auth` 调用都会
 *      渲染它，所以必须消费这条通知，否则 `auth(start_auth)` / `auth(set_env)` 的真实结果会被
 *      静态卡片顶掉。渲染只走 `textContent`（不做 HTML 解析）；面板发起的 `tools/call` 另带
 *      10s 超时兜底，避免宿主不转发时永远停在"等待中"。
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

/** 面板状态卡的数据（全部来自本地，读资源时不发网络/文件请求）。 */
export interface GetStartedStatus {
  envId: string | null;
  site: string;
  region: string;
  credentialScope: "account" | "single_env";
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

/** 从 server 实例派生状态卡内容；只读本地状态，不发起任何请求。 */
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
  return {
    envId,
    site,
    region,
    credentialScope: server.cloudBaseOptions?.credentialScope === "env" ? "single_env" : "account",
  };
}

/**
 * 生成面板 HTML。模板串保持纯 ASCII：所有自然语言来自词典，按 `lang` 求值后转义注入。
 */
export function buildGetStartedHtml(lang: Lang, status: GetStartedStatus): string {
  const L = (key: MessageKey): string => t(key, undefined, lang);
  const E = escapeHtml;

  const title = E(L("mcpUi.title"));
  const subtitle = E(L("mcpUi.subtitle"));
  const statusTitle = E(L("mcpUi.status.title"));
  const envIdLabel = E(L("mcpUi.status.envId"));
  const siteLabel = E(L("mcpUi.status.site"));
  const regionLabel = E(L("mcpUi.status.region"));
  const scopeLabel = E(L("mcpUi.status.credentialScope"));
  const envIdValue = E(status.envId ?? L("mcpUi.status.unset"));
  const scopeValue =
    status.credentialScope === "single_env"
      ? E(L("mcpUi.status.scope.singleEnv"))
      : E(L("mcpUi.status.scope.account"));
  const pathsTitle = E(L("mcpUi.paths.title"));
  const checkTitle = E(L("mcpUi.paths.check.title"));
  const checkDesc = E(L("mcpUi.paths.check.desc"));
  const checkButton = E(L("mcpUi.paths.check.button"));
  const loginTitle = E(L("mcpUi.paths.login.title"));
  const loginDesc = E(L("mcpUi.paths.login.desc"));
  const loginButton = E(L("mcpUi.paths.login.button"));
  const deployTitle = E(L("mcpUi.paths.deploy.title"));
  const deployDesc = E(L("mcpUi.paths.deploy.desc"));
  const deployButton = E(L("mcpUi.paths.deploy.button"));
  const messageLogin = E(L("mcpUi.message.login"));
  const messageDeploy = E(L("mcpUi.message.deploy"));
  const pendingText = E(L("mcpUi.action.pending"));
  const errorText = E(L("mcpUi.action.error"));
  const timeoutText = E(L("mcpUi.action.timeout"));
  const resultTitle = E(L("mcpUi.result.title"));
  const footnote = E(L("mcpUi.footnote"));

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root { color-scheme: light dark; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.5; }
.panel { padding: 16px; }
.panel h1 { font-size: 18px; margin: 0 0 4px; }
.panel .sub { margin: 0 0 16px; opacity: 0.75; font-size: 13px; }
.card { border: 1px solid currentColor; border-radius: 10px; padding: 12px 14px; margin: 0 0 12px; }
.card h2 { font-size: 14px; margin: 0 0 10px; }
.card h3 { font-size: 13px; margin: 0 0 4px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0 0 12px; }
dt { opacity: 0.7; font-size: 12px; }
dd { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; word-break: break-all; }
.path { margin: 0 0 12px; }
.path p { margin: 0 0 8px; font-size: 12px; opacity: 0.8; }
button { font: inherit; font-size: 12px; padding: 6px 12px; border-radius: 8px; border: 1px solid currentColor; background: transparent; color: inherit; cursor: pointer; }
button:hover { opacity: 0.85; }
.out { margin: 10px 0 0; padding: 8px; border-radius: 8px; background: rgba(127,127,127,0.12); font-size: 12px; white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow: auto; }
.foot { font-size: 12px; opacity: 0.7; margin: 0; }
</style>
</head>
<body>
<main class="panel">
<h1>${title}</h1>
<p class="sub">${subtitle}</p>
<section class="card" id="tool-result-card" hidden>
<h2>${resultTitle}</h2>
<pre id="tool-result-out" class="out"></pre>
</section>
<section class="card">
<h2>${statusTitle}</h2>
<dl>
<div><dt>${envIdLabel}</dt><dd>${envIdValue}</dd></div>
<div><dt>${siteLabel}</dt><dd>${E(status.site)}</dd></div>
<div><dt>${regionLabel}</dt><dd>${E(status.region)}</dd></div>
<div><dt>${scopeLabel}</dt><dd>${scopeValue}</dd></div>
</dl>
</section>
<section class="card">
<h2>${pathsTitle}</h2>
<div class="path">
<h3>${checkTitle}</h3>
<p>${checkDesc}</p>
<button id="btn-check" type="button">${checkButton}</button>
</div>
<div class="path">
<h3>${loginTitle}</h3>
<p>${loginDesc}</p>
<button id="btn-login" type="button" data-message="${messageLogin}">${loginButton}</button>
</div>
<div class="path">
<h3>${deployTitle}</h3>
<p>${deployDesc}</p>
<button id="btn-deploy" type="button" data-message="${messageDeploy}">${deployButton}</button>
</div>
<pre id="out" class="out" data-pending="${pendingText}" data-error="${errorText}" data-timeout="${timeoutText}" hidden></pre>
</section>
<p class="foot">${footnote}</p>
</main>
<script>
(function () {
  var host = window.parent;
  var nextId = 1;
  var pending = {};
  var CHECK_TIMEOUT_MS = 10000;
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
  function textOf(payload) {
    try {
      var content = payload && payload.content;
      if (content && content.length > 0 && typeof content[0].text === "string") {
        return content[0].text;
      }
      return JSON.stringify(payload);
    } catch (err) {
      return String(err);
    }
  }
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || typeof data !== "object") { return; }
    // The host sends the result of the tool call that rendered this view as a notification.
    // This panel is mounted on the multi-purpose auth tool, so every auth call renders it;
    // consuming the notification is what keeps that call's real result visible here.
    if (data.method === "ui/notifications/tool-result") {
      var resultCard = document.getElementById("tool-result-card");
      var resultBox = document.getElementById("tool-result-out");
      if (resultCard) { resultCard.hidden = false; }
      // Plain text only: any markup in a tool result is shown as text, never parsed.
      if (resultBox) { resultBox.textContent = textOf(data.params); }
      reportSize();
      return;
    }
    if (data.id !== undefined && pending[data.id]) {
      var entry = pending[data.id];
      delete pending[data.id];
      if (data.error) { entry.reject(data.error); } else { entry.resolve(data.result); }
    }
  });
  var out = document.getElementById("out");
  function reportSize() {
    notify("ui/notifications/size-changed", {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    });
  }
  function setOut(text) {
    if (!out) { return; }
    out.hidden = false;
    out.textContent = text;
    reportSize();
  }
  request("ui/initialize", {
    protocolVersion: "2026-01-26",
    appCapabilities: { availableDisplayModes: ["inline"] },
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
  var checkButton = document.getElementById("btn-check");
  if (checkButton) {
    checkButton.addEventListener("click", function () {
      if (out) { out.hidden = false; out.textContent = out.getAttribute("data-pending") || ""; }
      // Timeout fallback: if the host never forwards this call, do not leave the panel sitting on
      // "waiting" forever, which reads as broken.
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) { return; }
        settled = true;
        setOut(out ? (out.getAttribute("data-timeout") || "") : "");
      }, CHECK_TIMEOUT_MS);
      request("tools/call", { name: "auth", arguments: { action: "status" } }).then(function (result) {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        setOut(textOf(result));
      }).catch(function (err) {
        if (settled) { return; }
        settled = true;
        clearTimeout(timer);
        setOut((out ? out.getAttribute("data-error") : "") + " " + JSON.stringify(err));
      });
    });
  }
  function bindMessage(buttonId) {
    var button = document.getElementById(buttonId);
    if (!button) { return; }
    button.addEventListener("click", function () {
      var message = button.getAttribute("data-message") || "";
      request("ui/message", { role: "user", content: { type: "text", text: message } })
        .then(function () { setOut(message); })
        .catch(function (err) {
          setOut((out ? out.getAttribute("data-error") : "") + " " + JSON.stringify(err));
        });
    });
  }
  bindMessage("btn-login");
  bindMessage("btn-deploy");
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
