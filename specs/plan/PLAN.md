# CloudBase MCP SDK / CLI 升级只读规划

## 概述
- 本次只规划 `/Users/bookerzhao/Projects/cloudbase-turbo-delploy/mcp` 的 MCP 升级，不改代码、不跑云端操作、不提交、不建 PR。
- 运行时依赖从 `@cloudbase/manager-node@^4.10.2` 升级到 `5.0.0`。
- `@cloudbase/cli@3.0.1` 仅作为能力参考，不作为运行时依赖，不新增任何 CLI wrapper tool，不通过 shell 调 `tcb`。
- 规划目标分两部分：
  1. 验证并完成 Manager v5 对现有 MCP 的兼容升级。
  2. 参考 CLI v3 新能力，补齐当前 MCP 尚未覆盖、且能直接落到 Manager v5 的能力缺口。

## 关键变更
- 依赖升级：
  - 更新 `mcp/package.json` 与 `mcp/package-lock.json` 中的 `@cloudbase/manager-node` 到 `5.0.0`。
  - 保持当前 `getCloudBaseManager`、鉴权与环境选择模型不变，除非 build/type check 证明 v5 需要微调构造参数或类型声明。
- 现有能力保持不拆不重命名：
  - `callCloudApi` 继续承接 `tcb api` 类能力。
  - 现有 `queryFunctions/manageFunctions`、`querySqlDatabase/manageSqlDatabase`、`queryGateway/manageGateway`、`queryStorage/manageStorage`、`uploadFiles`、`queryCloudRun/manageCloudRun` 等保持主入口地位。
  - 不为“贴 CLI 名称”而做破坏式工具迁移。
- 网关能力补齐，优先扩展现有工具而不是新开 CLI 映射工具：
  - 在 `queryGateway` / `manageGateway` 中补齐 HTTP 访问服务 route/domain 能力。
  - 规划新增 action：查询域名路由、创建路由、更新路由、删除路由、绑定自定义域名、删除自定义域名、删除 access、切换 path auth。
  - 使用 Manager v5 的 `env.describeHttpServiceRoute/createHttpServiceRoute/modifyHttpServiceRoute/deleteHttpServiceRoute/bindCustomDomain/deleteCustomDomain` 和现有 `access` service 组合实现。
- 用户权限能力作为本轮重点新增：
  - 新增 `queryPermissions` / `managePermissions`。
  - 覆盖两类能力：
    1. 资源权限：查询/修改函数、存储、表、集合的权限配置。
    2. 角色权限：角色列表、角色详情、创建角色、更新角色、删除角色、给角色增删成员、给角色增删策略。
  - 角色策略按 Manager v5 的 `PermissionPolicyItem` 建模，纳入 MCP 输入结构，不再额外设计一套自定义策略 DSL。
- 用户管理能力单独建模，但不承担权限逻辑：
  - 新增 `queryUsers` / `manageUsers`。
  - 仅覆盖 `describeUserList/createUser/modifyUser/deleteUsers`。
  - 用户与角色的关系调整统一放到 `managePermissions`，避免用户 CRUD 和权限变更耦合。
- 日志能力补齐：
  - 新增 `queryLogs`，基于 Manager v5 `log` service。
  - 范围包括：日志服务是否开通、开通状态检查、CLS 检索。
  - 检索输入直接围绕 `queryString + 时间范围 + 分页上下文 + service(tcb/tcbr)` 设计，不包装 CLI 文本命令。
- Agent 能力补齐：
  - 新增 `queryAgents` / `manageAgents`。
  - 覆盖 Agent 的列表、详情、日志、创建、更新、删除。
  - 保留现有 `manageCloudRun(action="createAgent")` 的本地脚手架用途，但远端 Agent 资源管理统一收敛到新 Agent 工具族。
- App 能力补齐：
  - 新增 `queryApps` / `manageApps`，基于 Manager v5 `cloudAppService`。
  - 本轮只规划 CloudApp 静态部署场景：应用列表、详情、版本列表、版本详情、部署、删除应用、删除版本。
  - 部署只规划本地目录上传 + SDK create/update 流程，不纳入 Git 构建、模板构建、`http-function` 部署类型。
- 插件接入：
  - 在 `mcp/src/server.ts` 中为 permissions / users / logs / agents / apps 增加插件注册。
  - 各工具文件放在 `mcp/src/tools/` 下，延续现有 `queryX/manageX`、结构化 envelope、`registerTool`、`zod` schema 风格。

## 用户权限配置方式结论
- 本轮规划确认 CloudBase 存在“用户权限配置方式”，但不是本地配置文件驱动，而是平台/API 驱动。
- 需要在方案里显式区分三种权限面：
  - 角色权限配置：
    - 通过角色承载权限策略，用户通过角色获得权限。
    - Manager v5 `permission` service 已直接支持角色与策略管理，应作为 MCP 首选实现面。
  - 资源权限配置：
    - 针对函数、存储、集合、表等资源设置简单权限或自定义规则。
    - 现有 `security-rule` / `commonService` 能力与 v5 `permission` service 需要在职责上收敛，避免重复入口。
  - 访问鉴权配置：
    - HTTP 路由鉴权开关、自定义域名访问控制、Access Token / API Key / Publishable Key。
    - 这部分不属于“角色本身”，但和用户是否能访问资源直接相关，应在工具描述和 nextActions 中串起来。
- 本轮默认不规划“把权限导出成 repo 内声明式文件并回放”的能力。
- 如果后续要做“权限即配置”，建议另起专题，不并入这次 SDK 升级。

## 测试与验收
- 依赖升级验证：
  - `mcp/src/cloudbase-manager.test.ts` 覆盖 Manager v5 下的鉴权缺失、授权进行中、单环境自动绑定、多环境选择、显式凭据优先级。
- 新增工具单测：
  - `permissions/users/logs/agents/apps/gateway` 各自补充 unit tests，全部通过 mock Manager v5 service 完成，不触发真实云端调用。
- 回归测试：
  - 确认现有 functions/sql/storage/hosting/cloudrun/env/database 工具注册与类型不回退。
  - 确认默认插件集合下服务正常注册，至少验证 server 创建与 tool 注册快照。
- 最低验证命令规划：
  - `cd /Users/bookerzhao/Projects/cloudbase-turbo-delploy/mcp && npm run build`
  - `cd /Users/bookerzhao/Projects/cloudbase-turbo-delploy/mcp && npx vitest run`
- 验收标准：
  - Manager v5 可完成构建与测试。
  - 不引入 CLI 运行时依赖。
  - 新增 tool 均直接调用 Manager v5 service。
  - 用户权限相关能力至少覆盖“角色管理 + 资源权限管理 + 用户 CRUD 分离”三条主线。

## 默认假设
- 截至 2026-04-03，目标版本为 `@cloudbase/manager-node@5.0.0`、`@cloudbase/cli@3.0.1`。
- CLI v3 的价值仅在于帮助识别能力缺口，不作为 MCP 的实现依赖。
- 本轮不做 README / FAQ / 中英文文档同步，不做 envQuery，不做模板、示例、CloudRun 文档收口。
- 用户权限工具以 Manager v5 原生能力为准，不再额外设计一层 CLI 风格命令语法。
