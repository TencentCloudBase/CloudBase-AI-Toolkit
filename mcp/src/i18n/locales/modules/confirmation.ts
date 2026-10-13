import { defineModule } from "../types.js";

/**
 * 破坏性操作确认（elicitation 护栏）的文案。
 *
 * 两条硬约束决定了这里的形状：
 *   1. 选项固定为两个受控值（确认 / 取消），**不得出现自由文本字段** —— form 模式禁止收集
 *      密码 / API key / token（MCP 规范的 MUST NOT）；
 *   2. 确认文案必须带**目标**（哪一个资源、哪个环境），不允许只问"确定吗"。
 */
export const confirmation = defineModule(
  {
    "option.confirm": "确认删除",
    "option.cancel": "取消",

    // 每个 message 都必须带 {resource}（这次要动什么），环境 ID 只在拿到时拼进去
    "message.deleteFunction": "即将删除云函数 {resource}（环境 {envId}）。删除后无法恢复。",
    "message.deleteCollection": "即将删除集合 {resource}（环境 {envId}）。集合及其中的数据会一并删除，无法恢复。",
    "message.deleteDocuments": "即将删除集合 {resource} 中的 {count} 条文档（环境 {envId}）。删除后无法恢复。",
    "message.deleteStorage": "即将删除云存储文件 {resource}（环境 {envId}）。删除后无法恢复。",
    "message.deleteCloudRun": "即将删除云托管服务 {resource}（环境 {envId}）。服务会下线，需要重新部署才能恢复。",
    "message.destroyMysql": "即将销毁 MySQL 实例 {resource}（环境 {envId}）。实例与数据都会删除，无法恢复。",
    "message.unknownResource": "（未能从参数中取到资源名）",
    "message.unknownEnv": "未知",

    "blocked.target": "目标：{resource}（环境 {envId}）",
    "blocked.cancelled": "未执行：你在确认框里点了取消（{durationMs}ms）。",
    "blocked.timeout": "未执行：{seconds}s 内没有收到确认（超时）。",
    "blocked.error": "未执行：确认流程出错（{reason}）。",
    "blocked.autoApprovedBlocked":
      "未执行：Agent 自动审批通过（{durationMs}ms，未询问你），但 CLOUDBASE_MCP_ELICIT_AUTO_APPROVE=block。",
    "hint.release":
      "如需放行：把客户端权限改成会询问，或把它加入 CLOUDBASE_MCP_SKIP_ELICITATIONS（本次为 {action}）。",
  },
  {
    "option.confirm": "Delete",
    "option.cancel": "Cancel",

    "message.deleteFunction": "About to delete the cloud function {resource} (env {envId}). This cannot be undone.",
    "message.deleteCollection": "About to delete the collection {resource} (env {envId}). Its documents are deleted with it and cannot be recovered.",
    "message.deleteDocuments": "About to delete {count} document(s) from the collection {resource} (env {envId}). This cannot be undone.",
    "message.deleteStorage": "About to delete the cloud storage file {resource} (env {envId}). This cannot be undone.",
    "message.deleteCloudRun": "About to delete the CloudRun service {resource} (env {envId}). The service goes offline and needs a redeploy to come back.",
    "message.destroyMysql": "About to destroy the MySQL instance {resource} (env {envId}). The instance and its data are deleted and cannot be recovered.",
    "message.unknownResource": "(could not read the resource name from the arguments)",
    "message.unknownEnv": "unknown",

    "blocked.target": "Target: {resource} (env {envId})",
    "blocked.cancelled": "Not executed: you cancelled in the confirmation dialog ({durationMs}ms).",
    "blocked.timeout": "Not executed: no confirmation within {seconds}s (timed out).",
    "blocked.error": "Not executed: the confirmation flow failed ({reason}).",
    "blocked.autoApprovedBlocked":
      "Not executed: the agent auto-approved it ({durationMs}ms, you were not asked) while CLOUDBASE_MCP_ELICIT_AUTO_APPROVE=block.",
    "hint.release":
      "To allow it: switch the client permission to ask, or add it to CLOUDBASE_MCP_SKIP_ELICITATIONS (this call was {action}).",
  },
);
