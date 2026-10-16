import { defineModule } from "../types.js";

/**
 * MCP Apps 产物卡片面板（`ui://cloudbase/artifact-card`）的文案。
 *
 * 与 `mcpUi.ts` / `mcpUiCredits.ts` 同一套纪律：模板串纯 ASCII、句子全在这里、
 * 正文零内部枚举与字段名，拿不到的值不显示（不补零、不编）。
 *
 * **有意的跨模块复用**（不是漏写）：品牌条与「位置」用到的
 *   - 套餐名：`mcpUiCredits.plan.*`
 *   - 复制环境 ID 的按钮文案：`mcpUiCredits.brand.copyEnvId`
 *   - 原始返回折叠区标题：`mcpUiCredits.fold.raw`
 *   - 站点 / 地域人话与括号：`mcpUi.site.*` / `mcpUi.region.*` / `mcpUi.place.open|close`
 *     （这两张映射表在入口面板的词典里，env-credits 也是从那里取的——三处必须是同一份）
 * 这几套标签在两个面板里必须**逐字一致**（同一个环境、同一个套餐，换个面板不该换个说法），
 * 所以这里刻意不复制一份；`t()` 是全局的，跨模块取键是受支持的用法。改动那几条请两个面板一起看。
 */
export const mcpUiArtifact = defineModule(
  {
    resourceTitle: "部署产物",
    // 环境 ID 的标签（品牌条 hover 的 title 用；复制按钮的文案复用 mcpUiCredits.brand.copyEnvId）
    "brand.envIdLabel": "环境 ID",
    resourceDescription: "最近一次部署的状态与访问地址（只读）",

    // 标题：<产物类型> · <产物名>
    "title.sep": " · ",
    "kind.hosting": "静态托管站点",
    "kind.apps": "云应用",
    "kind.cloudrun": "云托管服务",

    // 四态（+ 未确认）
    "state.deploying": "部署中",
    "state.published": "已上线",
    "state.failed": "部署失败",
    "state.unknown": "未确认",

    // 说明句（失败态的说明句是后端原文，不走词典）
    "hint.deploying": "构建进行中，完成后此处给出访问地址。",
    "hint.published": "本次部署的产物与访问地址。",
    "hint.publishedInternal": "服务已上线，仅内网可达。",
    "hint.unknown": "这次部署的结果不完整，无法判断状态。",

    // 关键信息行
    "field.place": "位置",
    "field.accessUrl": "访问地址",
    "field.updatedAt": "更新时间",
    "field.failedAt": "失败时间",

    // 标签
    "tag.internalOnly": "仅内网",

    // 行动（一屏一个主行动；全部经 ui/message 交给会话）
    "action.openUrl": "打开访问地址",
    "action.bindDomain": "绑定公网域名",
    "action.viewLog": "查看日志",
    "action.viewBuildLog": "查看构建日志",
    "action.redeploy": "重新部署",
    "action.refresh": "刷新进度",
    "action.copyUrl": "复制地址",

    // 交给会话的请求（按钮 → ui/message 的原文）。
    // 两个占位符由面板脚本在点击时替换：{target} = 本次部署的对象（类型 + 名称，缺失时用 targetFallback），
    // {url} = 实时访问地址。**必须带上对象**，否则技能只能拿到一句"看下日志"，不知道查哪个服务。
    "message.openUrl": "打开 {target} 的访问地址 {url}",
    "message.bindDomain": "给 {target} 绑定一个公网域名（它当前只有内网地址 {url}）",
    "message.viewLog": "帮我看一下 {target} 的日志",
    "message.viewBuildLog": "帮我看一下 {target} 的构建日志",
    "message.redeploy": "帮我重新部署 {target}",
    "message.refresh": "帮我看看 {target} 的进度",
    "message.targetFallback": "这次部署",
  },
  {
    resourceTitle: "Deployment artifact",
    "brand.envIdLabel": "Environment ID",
    resourceDescription: "Status and access address of the latest deployment (read-only)",

    "title.sep": " - ",
    "kind.hosting": "Static hosting site",
    "kind.apps": "Cloud app",
    "kind.cloudrun": "Cloud Run service",

    "state.deploying": "Deploying",
    "state.published": "Live",
    "state.failed": "Deployment failed",
    "state.unknown": "Not confirmed",

    "hint.deploying": "The build is running; the access address appears here when it finishes.",
    "hint.published": "The artifact from this deployment and its access address.",
    "hint.publishedInternal": "The service is live and reachable on the internal network only.",
    "hint.unknown": "This deployment's result is incomplete, so its state cannot be determined.",

    "field.place": "Location",
    "field.accessUrl": "Access address",
    "field.updatedAt": "Updated",
    "field.failedAt": "Failed",

    "tag.internalOnly": "Internal only",

    "action.openUrl": "Open access address",
    "action.bindDomain": "Bind a public domain",
    "action.viewLog": "View logs",
    "action.viewBuildLog": "View build log",
    "action.redeploy": "Deploy again",
    "action.refresh": "Refresh progress",
    "action.copyUrl": "Copy address",

    "message.openUrl": "Open the access address of {target}: {url}",
    "message.bindDomain": "Bind a public domain for {target} (it currently only has the internal address {url})",
    "message.viewLog": "Show me the logs of {target}",
    "message.viewBuildLog": "Show me the build log of {target}",
    "message.redeploy": "Deploy {target} again for me",
    "message.refresh": "Check the progress of {target}",
    "message.targetFallback": "this deployment",
  },
);
