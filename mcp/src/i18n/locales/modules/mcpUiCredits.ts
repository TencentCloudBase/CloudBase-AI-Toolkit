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
    "spark.cap": "近 7 天",
    "spark.from": "7 天前",
    "spark.to": "今天",
    "value.unavailable": "—",

    // 状态词（四分支 + 未确认）
    "state.unknown": "用量尚未确认",
    "state.normal": "用量正常",
    "state.trialExhausted": "体验版耗尽",
    "state.stopped": "已停服",
    "state.expired": "套餐已到期",
    "state.arrears": "账户欠费",

    // 分隔符（模板串保持纯 ASCII，连接符一律走词典）
    "title.sep": " · ",
    "modules.sep": " · ",
    "value.currency": "¥",

    // 说明句（四分支 + 未确认）
    "hint.unknown": "这份数据不足以判断资源点是否充足；完整配额可在控制台查看。",
    "hint.normal": "本月资源点仍充足。",

    // 说明句（四分支）
    "hint.trialExhausted": "本月资源点已用完，账户余额充足；体验版不支持资源包与按量计费。",
    "hint.stopped": "资源点耗尽触发停服；升配、购买资源包、开启按量计费三选一恢复。",
    "hint.expired": "套餐过期后进入 15 天隔离期，逾期环境将被销毁；隔离期内续费可恢复。",
    "hint.arrears": "账户余额为负，影响变配与续费；套餐内资源点仍够用时，业务不受影响。",
    "expired.note": "隔离期剩余 {days} 天（第 15 天销毁）",

    // 行动（一屏一个主行动 + 一个复制链接的次行动）
    "action.upgrade": "升级付费套餐（唯一恢复途径）",
    "action.recommendRestore": "推荐恢复方案",
    "action.renew": "立即续费",
    "action.guidedTopup": "在会话里引导充值",
    "action.copyConsoleLink": "复制控制台链接",
    "action.copyExpenseLink": "复制费用中心链接",
    "action.copied": "控制台链接已复制；无计费权限时可转给主账号管理员",

    // 交给会话的请求（按钮 → ui/message 的原文，技能按这些入口组织引导）
    "message.upgrade": "帮我了解付费套餐，把这个环境从体验版升级",
    "message.restore": "这个环境资源点耗尽了，帮我比较升配、购买资源包和开启按量计费哪种合适",
    "message.renew": "这个环境的套餐到期了，帮我完成续费",
    "message.topup": "这个环境账户欠费了，带我到费用中心完成充值",

    // 模块名（分模块用量）
    "module.functions": "云函数",
    "module.database": "数据库",
    "module.storage": "存储",
    "module.cdn": "CDN",

    // 套餐名（仅有这五种）
    "plan.trial": "免费体验版",
    "plan.personal": "个人版",
    "plan.standard": "标准版",
    "plan.enterprise": "企业版",
    "plan.enterpriseAdvanced": "企业高级版",
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
    "spark.cap": "Last 7 days",
    "spark.from": "7 days ago",
    "spark.to": "Today",
    "value.unavailable": "-",

    "state.unknown": "Usage not confirmed",
    "state.normal": "Usage is within plan",
    "state.trialExhausted": "Trial credits used up",
    "state.stopped": "Suspended",
    "state.expired": "Plan expired",
    "state.arrears": "Account in arrears",

    "title.sep": " - ",
    "modules.sep": ", ",
    "value.currency": "CNY ",

    "hint.unknown":
      "This data is not enough to tell whether credits are sufficient. The full quota is available in the console.",
    "hint.normal": "This month's credits are still within the plan.",

    "hint.trialExhausted":
      "This month's credits are used up while the account balance is sufficient. The trial plan supports neither credit packs nor pay-as-you-go.",
    "hint.stopped":
      "Credits are used up and the service is suspended. Restore it by upgrading the plan, buying a credit pack, or enabling pay-as-you-go.",
    "hint.expired":
      "The plan has expired. The environment enters a 15-day grace period and is destroyed afterwards; renewing within the grace period restores it.",
    "hint.arrears":
      "The account balance is negative, which affects plan changes and renewal. Service is unaffected while the plan still has credits.",
    "expired.note": "{days} days left in the grace period (destroyed on day 15)",

    "action.upgrade": "Upgrade plan (the only way back)",
    "action.recommendRestore": "Recommend a recovery option",
    "action.renew": "Renew now",
    "action.guidedTopup": "Get top-up guidance in chat",
    "action.copyConsoleLink": "Copy console link",
    "action.copyExpenseLink": "Copy billing center link",
    "action.copied": "Console link copied. Without billing permission, forward it to the account owner.",

    "message.upgrade": "Help me review the paid plans and upgrade this environment from the trial plan",
    "message.restore":
      "This environment has run out of credits. Compare upgrading the plan, buying a credit pack, and enabling pay-as-you-go for me",
    "message.renew": "This environment's plan has expired. Help me renew it",
    "message.topup": "This environment's account is in arrears. Take me to the billing center to top up",

    "module.functions": "Cloud Functions",
    "module.database": "Database",
    "module.storage": "Storage",
    "module.cdn": "CDN",

    "plan.trial": "Free trial",
    "plan.personal": "Personal",
    "plan.standard": "Standard",
    "plan.enterprise": "Enterprise",
    "plan.enterpriseAdvanced": "Enterprise Advanced",
  },
);
