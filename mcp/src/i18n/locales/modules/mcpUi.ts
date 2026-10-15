import { defineModule } from "../types.js";

/**
 * MCP Apps 入口面板（`ui://cloudbase/get-started`）的文案。
 *
 * 三条硬约束决定了这里的形状：
 *   1. 面板 HTML 是**近静态模板 + 词典注入**：HTML 模板串只含 ASCII 结构与占位符，
 *      所有句子来自这里，按实例语言在 resources/read 时求值；
 *   2. 面板是**只读入口**：只展示状态、只发一次 `auth(action:"status")`，
 *      任何密钥类字段（secretId / apiKey / token）都不属于这个面板的内容；
 *   3. **面向用户，不面向实现**：面板正文里不出现内部枚举（`domestic` / `single_env` /
 *      `ap-shanghai` / `READY` / `auth(status)` 等），站点、地域、凭据范围一律翻成人话；
 *      认不出来的原始值照原样显示（宁可不译，不要译错）。
 *
 * 地名与凭据范围的映射是**逐个 code 一个 key**（`region.apShanghai`），
 * 由资源层组装成面板脚本里的查表对象；词典本身是这些 code 唯一合法的落点。
 */
export const mcpUi = defineModule(
  {
    resourceTitle: "CloudBase 起步",
    resourceDescription: "连接状态与下一步（只读）",

    title: "CloudBase 起步",
    subtitle: "确认这个环境是否可用。",

    "status.title": "连接状态",
    "status.unknown": "尚未确认",
    "status.unknownHint": "点「重新检查」确认一次",
    "status.loggedOut": "尚未登录",
    "status.loggedOutHint": "先在下面登录一次",
    "status.loggedIn": "已登录",
    "status.unboundHint": "还没有绑定环境",
    "status.connected": "已连接",
    "status.connectedHint": "凭据已就绪",
    "status.pending": "登录进行中",
    "status.pendingHint": "请在浏览器里完成登录",
    "status.failed": "登录没有完成",
    "status.failedHint": "需要重新登录",
    "status.place": "位置",
    "status.placeUnknown": "位置未知",
    "status.scope": "可访问范围",
    "status.scopeAfterLogin": "登录后显示",
    "status.envId": "环境 ID",
    "status.unset": "未绑定",
    "status.raw": "查看原始返回",

    "place.open": "（",
    "place.close": "）",

    "site.domestic": "中国站",
    "site.intl": "国际站",
    "region.apShanghai": "上海",
    "region.apGuangzhou": "广州",
    "region.apBeijing": "北京",
    "region.apNanjing": "南京",
    "region.apChengdu": "成都",
    "region.apHongkong": "中国香港",
    "region.apSingapore": "新加坡",
    "region.naSiliconvalley": "美国西部（硅谷）",
    "region.euFrankfurt": "德国（法兰克福）",
    "scope.account": "整个账号",
    "scope.singleEnv": "仅当前环境",

    "next.title": "下一步",
    "next.label.unknown": "先确认一下当前连接：",
    "next.label.loggedOut": "要连接这个环境，先登录：",
    "next.label.pending": "登录正在进行：",
    "next.label.failed": "登录没有成功：",
    "next.label.unbound": "接下来选一个环境：",
    "next.label.ready": "连接没问题，可以先接一个示例项目：",
    "next.why.unknown": "",
    "next.why.loggedOut": "",
    "next.why.pending": "",
    "next.why.failed": "",
    "next.why.unbound": "账号下可能有多地域的环境，绑定后才能读写其中的资源。",
    "next.why.ready": "",
    "next.action.login": "登录 CloudBase",
    "next.action.selectEnv": "选择一个环境",
    "next.action.deploy": "接一个示例项目",
    "next.action.refresh": "重新检查",

    "message.login": "请帮我登录 CloudBase 并绑定一个环境。",
    "message.selectEnv": "请帮我选择并绑定一个 CloudBase 环境。",
    "message.deploy": "请用一个示例项目接上 CloudBase，跑通从代码到云端的完整链路。",

    "action.pending": "正在检查…",
    "action.sent": "已交给会话…",
    "action.error": "重新检查没有完成。可以直接在会话里说「查一下 CloudBase 登录状态」。",
    "action.timeout": "没有拿到返回。可以直接在会话里说「查一下 CloudBase 登录状态」。",

    footnote: "这个面板只读：只展示连接状态，不会改动云端资源。",
  },
  {
    resourceTitle: "CloudBase Get Started",
    resourceDescription: "Connection status and the next step (read-only)",

    title: "CloudBase Get Started",
    subtitle: "Confirm this environment is usable.",

    "status.title": "Connection status",
    "status.unknown": "Not checked yet",
    "status.unknownHint": "Re-check once to confirm",
    "status.loggedOut": "Not signed in",
    "status.loggedOutHint": "sign in below first",
    "status.loggedIn": "Signed in",
    "status.unboundHint": "no environment bound yet",
    "status.connected": "Connected",
    "status.connectedHint": "Credential ready",
    "status.pending": "Sign-in in progress",
    "status.pendingHint": "finish it in the browser",
    "status.failed": "Sign-in did not finish",
    "status.failedHint": "sign in again",
    "status.place": "Location",
    "status.placeUnknown": "Location unknown",
    "status.scope": "Access scope",
    "status.scopeAfterLogin": "Shown after login",
    "status.envId": "Environment ID",
    "status.unset": "not bound",
    "status.raw": "View raw response",

    "place.open": " (",
    "place.close": ")",

    "site.domestic": "China",
    "site.intl": "International",
    "region.apShanghai": "Shanghai",
    "region.apGuangzhou": "Guangzhou",
    "region.apBeijing": "Beijing",
    "region.apNanjing": "Nanjing",
    "region.apChengdu": "Chengdu",
    "region.apHongkong": "Hong Kong, China",
    "region.apSingapore": "Singapore",
    "region.naSiliconvalley": "US West (Silicon Valley)",
    "region.euFrankfurt": "Germany (Frankfurt)",
    "scope.account": "Whole account",
    "scope.singleEnv": "Current environment only",

    "next.title": "Next step",
    "next.label.unknown": "Confirm the connection first:",
    "next.label.loggedOut": "To connect this environment, sign in first:",
    "next.label.pending": "Sign-in is in progress:",
    "next.label.failed": "Sign-in did not succeed:",
    "next.label.unbound": "Next, pick an environment:",
    "next.label.ready": "Connection is fine. You can wire up a sample project first:",
    "next.why.unknown": "",
    "next.why.loggedOut": "",
    "next.why.pending": "",
    "next.why.failed": "",
    "next.why.unbound": "An account can hold environments in several regions; bind one before reading or writing its resources.",
    "next.why.ready": "",
    "next.action.login": "Sign in to CloudBase",
    "next.action.selectEnv": "Pick an environment",
    "next.action.deploy": "Wire up a sample project",
    "next.action.refresh": "Re-check",

    "message.login": "Please help me sign in to CloudBase and bind an environment.",
    "message.selectEnv": "Please help me pick and bind a CloudBase environment.",
    "message.deploy": "Please wire up a sample project on CloudBase and run the full code-to-cloud path.",

    "action.pending": "Checking...",
    "action.sent": "Handed to the conversation...",
    "action.error": "Re-check did not complete. You can just say check CloudBase sign-in status in the conversation.",
    "action.timeout": "No response came back. You can just say check CloudBase sign-in status in the conversation.",

    footnote: "This panel is read-only: it only shows connection status and never modifies cloud resources.",
  },
);
