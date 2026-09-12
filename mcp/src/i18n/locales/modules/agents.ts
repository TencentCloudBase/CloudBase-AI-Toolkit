import { defineModule } from "../types.js";

export const agents = defineModule(
  {
    queryTitle: "查询 CloudBase Agent",
    queryDescription: "CloudBase Agent 域统一只读入口。支持列表、详情与日志查询。",
    manageTitle: "管理 CloudBase Agent",
    manageDescription: "CloudBase Agent 域统一写入口。支持创建、更新和删除远端 Agent。",
    listSuccess: "Agent 列表查询成功",
    getSuccess: "Agent 详情查询成功",
    logsSuccess: "Agent 日志查询成功",
    agentIdRequired: "action={action} 时必须提供 agentId",
    nameRequired: "action=createAgent 时必须提供 name（可通过顶层 name 或 params.name 传入）",
    nameSanitizedEmpty: "name \"{name}\" 经 sanitize 后为空，请使用包含字母或数字的 name",
    nameTooLong:
      "agent name 过长（当前 {length} 字符）。CloudBase 创建 Agent 时会同步创建云函数，" +
      "函数名/别名受 SCF 64 字符长度限制，且 envId 可能作为前缀拼接。请将 name 控制在 30 字符以内。",
    createSuccess: "Agent 创建成功",
    updateSuccess: "Agent 更新成功",
    deleteSuccess: "Agent 删除成功",
  },
  {
    queryTitle: "Query CloudBase Agents",
    queryDescription: "Unified read-only entry for the CloudBase Agents domain. Supports list, detail, and log queries.",
    manageTitle: "Manage CloudBase Agents",
    manageDescription: "Unified write entry for the CloudBase Agents domain. Supports creating, updating, and deleting remote agents.",
    listSuccess: "Agent list retrieved successfully",
    getSuccess: "Agent details retrieved successfully",
    logsSuccess: "Agent logs retrieved successfully",
    agentIdRequired: "agentId is required when action={action}",
    nameRequired: "name is required when action=createAgent (pass it via the top-level name or params.name)",
    nameSanitizedEmpty: "name \"{name}\" is empty after sanitization; use a name containing letters or digits",
    nameTooLong:
      "Agent name is too long ({length} characters currently). Creating an agent in CloudBase also creates a cloud function; " +
      "function names/aliases are limited to 64 characters by SCF, and the envId may be prepended. Keep the name within 30 characters.",
    createSuccess: "Agent created successfully",
    updateSuccess: "Agent updated successfully",
    deleteSuccess: "Agent deleted successfully",
  },
);
