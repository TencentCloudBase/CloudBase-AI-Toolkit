import { defineModule } from "../types.js";

/**
 * MCP Apps 入口面板（`ui://cloudbase/get-started`）的文案。
 *
 * 两条硬约束决定了这里的形状：
 *   1. 面板 HTML 是**近静态模板 + 词典注入**：HTML 模板串只含 ASCII 结构与占位符，
 *      所有句子来自这里，按实例语言在 resources/read 时求值；
 *   2. 面板是**只读入口**：只展示状态、只发一次 `auth(action:"status")`，
 *      任何密钥类字段（secretId / apiKey / token）都不属于这个面板的内容。
 */
export const mcpUi = defineModule(
  {
    resourceTitle: "CloudBase 起步面板",
    resourceDescription: "连接状态与三条起步路径（只读）",

    title: "CloudBase 起步面板",
    subtitle: "环境连接自检与起步路径。面板只读，不会在此处写入密钥。",

    "status.title": "连接状态",
    "status.envId": "环境 ID",
    "status.site": "站点",
    "status.region": "地域",
    "status.credentialScope": "凭据范围",
    "status.scope.account": "账号级",
    "status.scope.singleEnv": "单环境",
    "status.unset": "未绑定",

    "paths.title": "三条起步路径",
    "paths.check.title": "1. 查状态",
    "paths.check.desc": "调用一次只读的 auth(status)，确认登录与环境绑定情况。",
    "paths.check.button": "查状态",
    "paths.login.title": "2. 登录并绑定环境",
    "paths.login.desc": "把登录请求交给会话，由你的 AI 客户端带你完成登录并绑定环境。",
    "paths.login.button": "请帮我登录",
    "paths.deploy.title": "3. 先把项目接上",
    "paths.deploy.desc": "让会话先做一次部署自检，把一个示例项目接上云端。",
    "paths.deploy.button": "部署自检",

    "message.login": "请帮我登录 CloudBase 并绑定一个环境。",
    "message.deploy": "请用一个示例项目做一次部署自检。",

    "action.pending": "正在查状态……",
    "action.error": "调用未完成：",

    footnote: "此面板只读：只在本地展示连接状态，唯一会发出的调用是只读的 auth(status)。",
  },
  {
    resourceTitle: "CloudBase Get Started",
    resourceDescription: "Connection status and three getting-started paths (read-only)",

    title: "CloudBase Get Started",
    subtitle: "Connection self-check and getting-started paths. This panel is read-only and never writes credentials.",

    "status.title": "Connection status",
    "status.envId": "Environment ID",
    "status.site": "Site",
    "status.region": "Region",
    "status.credentialScope": "Credential scope",
    "status.scope.account": "account",
    "status.scope.singleEnv": "single_env",
    "status.unset": "not bound",

    "paths.title": "Three getting-started paths",
    "paths.check.title": "1. Check status",
    "paths.check.desc": "Make one read-only auth(status) call to confirm login and environment binding.",
    "paths.check.button": "Check status",
    "paths.login.title": "2. Log in and bind an environment",
    "paths.login.desc": "Hand the login request to the conversation; your AI client walks you through login and environment binding.",
    "paths.login.button": "Help me log in",
    "paths.deploy.title": "3. Wire up a project",
    "paths.deploy.desc": "Ask the conversation to run one deploy self-check and connect a sample project.",
    "paths.deploy.button": "Deploy self-check",

    "message.login": "Please help me log in to CloudBase and bind an environment.",
    "message.deploy": "Please run one deploy self-check with a sample project.",

    "action.pending": "Checking status...",
    "action.error": "Call did not complete:",

    footnote: "This panel is read-only: it only shows connection status locally, and the one call it can make is the read-only auth(status).",
  },
);
