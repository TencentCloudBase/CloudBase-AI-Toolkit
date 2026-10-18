import { defineModule } from "../types.js";

/**
 * MCP Apps 环境资源用量面板（`ui://cloudbase/env-credits`）的文案。
 *
 * 与 `mcpUi.ts`（入口面板）同一套纪律：
 *   1. 面板 HTML 是**近静态模板 + 词典注入**：模板串只含 ASCII 结构与占位符，
 *      所有句子来自这里，按实例语言在 resources/read 时求值；
 *   2. 面板**不执行计费**：主行动只把一句话交给会话（messages.*），
 *      由 CloudBase 技能继续引导；支付类动作（PayDeals）不在此面板射程内；
 *   3. **面向用户，不面向实现**：正文不出现内部枚举与字段名
 *      （`trial` / `single_env` / `CreditsValue` 等），套餐名、模块名一律走映射；
 *      认不出来的原始值照原样显示（宁可不译，不要译错）。
 *
 * 四分支（体验版耗尽 / 付费版耗尽 / 套餐到期 / 账户欠费）的判别与结论话术
 * 以 `specs/credits-exhaustion-guidance/handoff-to-elicitation-confirmations.md` §5 为准，
 * 改动需两侧同步。
 */
export const mcpUiCredits = defineModule(
  {
    resourceTitle: "环境资源用量",
    resourceDescription: "资源点与套餐用量（只读）",

    // 品牌条
    "brand.copyEnvId": "复制环境 ID",

    // 卡片
    title: "环境资源用量",
    "field.credits": "资源点",
    "field.plan": "套餐",
    "field.place": "位置",
    "field.modules": "分模块用量",
    "field.balance": "账户余额",
    "fold.raw": "查看原始返回",
    "spark.cap": "近期",
    "value.unavailable": "—",

    // 状态词（四分支 + 未确认）
    "state.unknown": "用量尚未确认",
    "state.normal": "用量正常",
    "state.nearLimit": "用量接近上限",
    "state.trialExhausted": "体验版耗尽",
    "state.stopped": "套餐资源点已用完",
    "state.expired": "套餐已到期",
    "state.arrears": "账户欠费",

    // 分隔符（模板串保持纯 ASCII，连接符一律走词典）
    "title.sep": " · ",
    "modules.sep": " · ",
    "value.currency": "¥",

    // 说明句（四分支 + 未确认）
    "hint.unknown": "这份数据不足以判断资源点是否充足；完整配额可在控制台查看。",
    "hint.unknownWithUsage": "已读到用量，但套餐状态没拿到，判断不了是否够用；完整配额可在控制台查看。",
    "hint.normal": "本月资源点仍充足。",
    "hint.nearLimit": "本月资源点已用 {pct}%；升级套餐或购买资源包可避免中断。",

    // 说明句（四分支）
    "hint.trialExhausted": "本月资源点已用完；体验版不支持资源包与按量计费，升级付费套餐是唯一恢复途径。",
    "hint.stopped": "套餐内的资源点已用完；若已购买资源包或开启了按量计费，服务可能仍在正常运行。是否停服以实际调用结果为准。",
    "hint.expired": "套餐过期后进入 15 天隔离期，逾期环境将被销毁；隔离期内续费可恢复。",
    "hint.arrears": "账户余额为负，会影响套餐变更与续费；套餐内资源点仍够用时，业务不受影响。",
    "expired.note": "隔离期剩余 {days} 天（第 15 天销毁）",

    // 行动（一屏一个主行动 + 一个复制链接的次行动）
    "action.upgrade": "升级付费套餐（唯一恢复途径）",
    "action.recommendRestore": "推荐恢复方案",
    "action.renew": "立即续费",
    "action.guidedTopup": "去充值",
    "action.openConsole": "打开控制台",
    "action.nearLimit": "看看怎么省",
    "message.nearLimit": "这个环境的资源点已经用到 {pct}% 了，帮我看看能怎么省，或者有没有更合适的套餐。",
    "copy.copied": "已复制",
    "copy.failed": "没能写入剪贴板，请手动选中复制。",
    "message.failed": "这个面板不能直接发消息给会话；文字已复制，粘贴到输入框发送即可。",
    "action.openExpense": "打开费用中心",
    "action.copiedConsole": "没能直接打开，链接已复制；无计费权限时可转给主账号管理员",
    "action.copiedExpense": "没能直接打开，链接已复制；无计费权限时可转给主账号管理员",

    // 交给会话的请求（按钮 → ui/message 的原文，技能按这些入口组织引导）
    "message.upgrade": "帮我了解付费套餐，把这个环境从体验版升级",
    "message.restore": "这个环境资源点耗尽了，帮我比较升配、购买资源包和开启按量计费哪种合适",
    "message.renew": "这个环境的套餐到期了，帮我完成续费",
    "message.topup": "这个环境账户欠费了，带我到费用中心完成充值",

    // 模块名（分模块用量）
    "module.functions": "云函数",
    "module.database": "数据库",
    "module.storage": "存储",
    "module.ai": "AI",
    "module.auth": "身份认证",
    "module.api": "API 调用",
    "module.http": "HTTP 网关",
    "module.hosting": "托管",
    "module.workflow": "工作流",
    "module.other": "其它",

    // 套餐名（仅有这五种）
    "plan.trial": "免费体验版",
    "plan.personal": "个人版",
    "plan.standard": "标准版",
    "plan.enterprise": "企业版",
    "plan.enterpriseAdvanced": "企业高级版",

    // ---- 监控指标卡（queryEnv(action=metrics)：同一资源按 kind 分派的第二个视图）----
    // 指标人话名（枚举 ↔ 词典键；未列出的枚举一律退化为 metric.generic，绝不打印原始码）
    "metric.generic": "环境指标",
    "metric.GatewayTraceEnvQPS": "环境网关 QPS",
    "metric.EnvQPSAll": "环境总 QPS",
    "metric.FunctionInvocation": "函数调用次数",
    "metric.FunctionError": "函数错误次数",
    "metric.FunctionTimeout": "函数超时次数",
    "metric.FunctionThrottle": "函数限流次数",
    "metric.FunctionDuration": "函数执行耗时",
    "metric.FunctionConcurrentExecutions": "函数并发数",
    "metric.DbRead": "数据库读次数",
    "metric.DbWrite": "数据库写次数",
    "metric.DbSizepkg": "数据库存储用量",
    "metric.MysqlCpuUsageRate": "MySQL CPU 使用率",
    "metric.MysqlMemoryUse": "MySQL 内存使用",
    "metric.MysqlStorageUsage": "MySQL 存储用量",
    "metric.MysqlQps": "MySQL QPS",
    "metric.MysqlSlowQueries": "MySQL 慢查询",
    "metric.MysqlDbConnections": "MySQL 连接数",
    "metric.TkeCpuUsedService": "云托管 CPU 使用",
    "metric.TkeMemUsedService": "云托管内存使用",
    "metric.TkeQPSService": "云托管 QPS",
    "metric.TkeHttpErrorService": "云托管 HTTP 错误",
    "metric.TkeInvokeNumService": "云托管调用次数",

    // 状态（三态：有数据 / 无流量 / 查询失败）
    // 指标单位（词表来自云开发控制台的真实呈现：调用次数（次）/ 运行时间（ms）/
    // 资源用量（GBs）/ 资源用量（CU），以及套餐用量页的 GB / KB / 万次 / %）
    // 控制台原文：QPS 页「当前环境QPS（每秒请求量）」、仪表盘云函数视图「并发执行个数（个）」
    // ⇒ 新增两个词按原文转写（英文取 req/s、items，控制台英文界面未核到时的稳妥写法）
    "metric.unit.perSec": "次/秒",
    "metric.unit.item": "个",

    "metric.unit.count": "次",
    "metric.unit.ms": "ms",
    "metric.unit.gbs": "GBs",
    "metric.unit.cu": "CU",
    "metric.unit.gb": "GB",
    "metric.unit.percent": "%",

    // 单位摆放（跟控制台一致：单位写在指标名后的括号里）
    "metric.unitWrap": "{label}（{unit}）",
    // 数值后缀的拼接：中文紧贴（18次），英文要留空格（18 items）
    "metric.unitSuffix": "{value}{unit}",

    "metric.state.data": "有数据",
    "metric.state.noData": "无流量",
    "metric.state.failed": "查询失败",

    // 说明句
    "metric.hint.data": "所选时段内该指标有数据。",
    "metric.hint.noData": "所选时段内该指标没有数据。",
    "metric.hint.failed": "这次查询没有拿到数据；可以先重试，或去日志看这段时间有没有报错。",

    // 字段标签
    "metric.field.name": "指标",
    "metric.field.value": "数值",
    "metric.field.note": "说明",
    "metric.field.latest": "最新值",
    "metric.field.peak": "峰值",
    "metric.field.avg": "平均",
    "metric.field.window": "样本数",

    // 行动（一屏一个主行动）
    // 三态各自的动作（动作腔；noData 最接近流失，不许说"异常"）
    "metric.action.data": "解释这段曲线",
    "metric.action.noData": "去日志看这段时间有没有请求",
    "metric.action.failed": "重试这次查询",
    "metric.message.data": "帮我解释这段时间「{metric}」这条曲线的变化",
    "metric.message.noData": "这段时间「{metric}」没有数据，帮我看看是不是没有请求进来",
    "metric.message.failed": "刚才查「{metric}」失败了，帮我重试并看看原因",

    // 值拼接（模板串保持纯 ASCII，连接一律走词典）
    "metric.every": "每 {period} 采样",
    "metric.samples": "{n} 个样本",
    "metric.period.minute": "5 分钟",
    "metric.period.hour": "1 小时",
    "metric.period.day": "1 天",
  },
  {
    resourceTitle: "Environment usage",
    resourceDescription: "Credits and plan usage (read-only)",

    "brand.copyEnvId": "Copy environment ID",

    title: "Environment usage",
    "field.credits": "Credits",
    "field.plan": "Plan",
    "field.place": "Location",
    "field.modules": "Usage by module",
    "field.balance": "Account balance",
    "fold.raw": "View raw response",
    "spark.cap": "Recent",
    "value.unavailable": "-",

    "state.unknown": "Usage not confirmed",
    "state.normal": "Usage is within plan",
    "state.nearLimit": "Usage near the limit",
    "state.trialExhausted": "Trial credits used up",
    "state.stopped": "Plan credits used up",
    "state.expired": "Plan expired",
    "state.arrears": "Account in arrears",

    "title.sep": " - ",
    "modules.sep": ", ",
    "value.currency": "CNY ",

    "hint.unknown":
      "This data is not enough to tell whether credits are sufficient. The full quota is available in the console.",
    "hint.unknownWithUsage":
      "Usage is known, but the plan state is not, so sufficiency cannot be judged. The full quota is in the console.",
    "hint.normal": "This month's credits are still within the plan.",
    "hint.nearLimit": "Credits are {pct}% used; upgrade the plan or add a credit pack to avoid interruption.",

    "hint.trialExhausted":
      "This month's credits are used up. The trial plan supports neither credit packs nor pay-as-you-go, so upgrading to a paid plan is the only way back.",
    "hint.stopped":
      "The plan credits are used up. If you have a credit pack or pay-as-you-go enabled, the service may still be running; check the actual call result to confirm.",
    "hint.expired":
      "The plan has expired. The environment enters a 15-day grace period and is destroyed afterwards; renewing within the grace period restores it.",
    "hint.arrears":
      "The account balance is negative, which affects plan changes and renewal. Service is unaffected while the plan still has credits.",
    "expired.note": "{days} days left in the grace period (destroyed on day 15)",

    "action.upgrade": "Upgrade plan (the only way back)",
    "action.recommendRestore": "Recommend a recovery option",
    "action.renew": "Renew now",
    "action.guidedTopup": "Top up",
    "action.openConsole": "Open console",
    "action.nearLimit": "How to cut usage",
    "message.nearLimit": "This environment is at {pct}% of its credits. Show me how to cut usage or which plan fits better.",
    "copy.copied": "Copied",
    "copy.failed": "Could not write to the clipboard; select and copy manually.",
    "message.failed": "This panel cannot post to the conversation; the text is copied, paste it to send.",
    "action.openExpense": "Open billing center",
    "action.copiedConsole": "Could not open it directly; the link is copied. Without billing permission, forward it to the account owner.",
    "action.copiedExpense": "Could not open it directly; the link is copied. Without billing permission, forward it to the account owner.",

    "message.upgrade": "Help me review the paid plans and upgrade this environment from the trial plan",
    "message.restore":
      "This environment has run out of credits. Compare upgrading the plan, buying a credit pack, and enabling pay-as-you-go for me",
    "message.renew": "This environment's plan has expired. Help me renew it",
    "message.topup": "This environment's account is in arrears. Take me to the billing center to top up",

    "module.functions": "Cloud Functions",
    "module.database": "Database",
    "module.storage": "Storage",
    "module.ai": "AI",
    "module.auth": "Identity",
    "module.api": "API calls",
    "module.http": "HTTP gateway",
    "module.hosting": "Hosting",
    "module.workflow": "Workflow",
    "module.other": "Other",

    "plan.trial": "Free trial",
    "plan.personal": "Personal",
    "plan.standard": "Standard",
    "plan.enterprise": "Enterprise",
    "plan.enterpriseAdvanced": "Enterprise Advanced",

    "metric.generic": "Environment metric",
    "metric.GatewayTraceEnvQPS": "Gateway QPS",
    "metric.EnvQPSAll": "Environment QPS",
    "metric.FunctionInvocation": "Function invocations",
    "metric.FunctionError": "Function errors",
    "metric.FunctionTimeout": "Function timeouts",
    "metric.FunctionThrottle": "Function throttles",
    "metric.FunctionDuration": "Function duration",
    "metric.FunctionConcurrentExecutions": "Function concurrency",
    "metric.DbRead": "Database reads",
    "metric.DbWrite": "Database writes",
    "metric.DbSizepkg": "Database storage",
    "metric.MysqlCpuUsageRate": "MySQL CPU usage",
    "metric.MysqlMemoryUse": "MySQL memory usage",
    "metric.MysqlStorageUsage": "MySQL storage usage",
    "metric.MysqlQps": "MySQL QPS",
    "metric.MysqlSlowQueries": "MySQL slow queries",
    "metric.MysqlDbConnections": "MySQL connections",
    "metric.TkeCpuUsedService": "CloudRun CPU usage",
    "metric.TkeMemUsedService": "CloudRun memory usage",
    "metric.TkeQPSService": "CloudRun QPS",
    "metric.TkeHttpErrorService": "CloudRun HTTP errors",
    "metric.TkeInvokeNumService": "CloudRun invocations",

    "metric.unit.perSec": "req/s",
    "metric.unit.item": "items",

    "metric.unit.count": "times",
    "metric.unit.ms": "ms",
    "metric.unit.gbs": "GBs",
    "metric.unit.cu": "CU",
    "metric.unit.gb": "GB",
    "metric.unit.percent": "%",

    "metric.unitWrap": "{label} ({unit})",
    "metric.unitSuffix": "{value} {unit}",

    "metric.state.data": "Has data",
    "metric.state.noData": "No traffic",
    "metric.state.failed": "Query failed",

    "metric.hint.data": "This metric has data in the selected window.",
    "metric.hint.noData": "This metric has no data in the selected window.",
    "metric.hint.failed": "This query returned no data; retry it, or check the logs for errors in this period.",

    "metric.field.name": "Metric",
    "metric.field.value": "Value",
    "metric.field.note": "Note",
    "metric.field.latest": "Latest",
    "metric.field.peak": "Peak",
    "metric.field.avg": "Average",
    "metric.field.window": "Samples",

    "metric.action.data": "Explain this curve",
    "metric.action.noData": "Check the logs for requests in this period",
    "metric.action.failed": "Retry this query",
    "metric.message.data": "Walk me through this curve for {metric} in the selected window",
    "metric.message.noData": "There is no data for {metric} in this window - check whether requests ever arrived",
    "metric.message.failed": "The last {metric} query failed - retry it and tell me why",

    "metric.every": "every {period}",
    "metric.samples": "{n} samples",
    "metric.period.minute": "5 minutes",
    "metric.period.hour": "1 hour",
    "metric.period.day": "1 day",
  },
);
