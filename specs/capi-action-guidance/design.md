# 技术方案设计

## 概述

本次需求的目标不是为 `callCloudApi` 引入完整的 Action 枚举，而是在保持工具通用性的前提下，增强三类引导：

1. **工具描述引导**：让 agent 在调用前知道应该查哪类文档
2. **错误提示引导**：当 action 猜错时，知道下一步去哪查
3. **文档引导**：让 `doc/mcp-tools.md` 与工具描述保持一致

本次实现范围控制在说明与错误信息，不扩展新的查询工具，也不引入全量 action catalog。

## 设计目标

1. 明确区分数据面 OpenAPI / Swagger 与管控面 Action 文档。
2. 将两份官方管控面文档直接挂到 `callCloudApi` 描述和报错中。
3. 让常见错误从“action 无效”升级为“无效 + 去哪查 + 先不要猜”。
4. 不修改 `action: string` 的通用设计。

## 目标文件

- `mcp/src/tools/capi.ts`
- `doc/mcp-tools.md`

如 `doc/mcp-tools.md` 为自动生成产物，则按现有仓库流程保留必要同步；若当前来源就是工具 schema，则修改源码后同步生成即可。

## 设计细节

### 1. 强化 `callCloudApi` 工具描述

当前描述过于抽象，只说“先阅读 rules 或 skills”。本次将补充：

- `callCloudApi` 适合调用 CloudBase / 腾讯云控制面与依赖资源相关 API
- 现有 OpenAPI / Swagger 能力主要覆盖数据面 / HTTP API，不是通用管控面 Action 集合
- 管控面 API 应优先参考：
  - CloudBase API 概览  
    `https://cloud.tencent.com/document/product/876/34809`
  - 云开发依赖资源接口指引  
    `https://cloud.tencent.com/document/product/876/34808`

同时补充“先查 action 再调用，不要猜测 Action 名称”的明确提示。

### 2. 强化输入参数描述

`action` 参数说明将从“符合对应服务 API 定义”升级为更可执行的版本：

- 对 `tcb/scf/lowcode/cdn/vpc/cam/sts` 等通用云 API Action，应优先查官方文档
- 对 `functions/auth/cloudrun/storage/mysqldb` 等数据面 HTTP API，应优先走 OpenAPI / Swagger，而不是使用 `callCloudApi`

`params` 参数说明也会补充：

- 参数键名必须与官方文档一致
- 如不确定参数结构，应先查对应文档而不是猜测

### 3. 优化报错信息

在 `buildCapiErrorMessage()` 中分层输出建议：

- 当命中 `invalid or not found` / `does not exist` / `not recognized`
  - 明确提示“不要继续猜 Action”
  - 如果是管控面服务，优先查看两份 CloudBase 官方文档
  - 如果用户实际在做 HTTP API 集成，则建议优先使用 OpenAPI / Swagger / `searchKnowledgeBase(mode="openapi")`

为了避免过度复杂，本次不对每个 `service` 分配独立 action 文档，只做轻量分类：

- **管控面优先文档**：`tcb`、`lowcode`
- **腾讯云通用服务**：`scf`、`cdn`、`vpc`、`cam`、`sts`
  - 仍提示先核对官方云 API 文档
- **数据面提醒**：错误信息中额外提醒，不要把 OpenAPI 数据面文档当成通用 action 目录

### 4. `doc/mcp-tools.md` 同步策略

`doc/mcp-tools.md` 的 `callCloudApi` 段落将同步补充：

- 工具用途：通用云 API / 管控面调用
- 两份官方文档链接
- 数据面 OpenAPI / Swagger 与管控面 action 的边界说明

这样无论 agent 从 tool schema 还是从文档入口读取信息，都能看到一致的引导。

## 不做的内容

本次明确不做：

- 不为所有 service/action 建立完整枚举
- 不新增 `searchCloudApiAction` / `describeCloudApiAction` 工具
- 不接入新的远程 Action catalog
- 不修改 `searchKnowledgeBase(openapi)` 的数据源范围

## 验证策略

1. 检查 `callCloudApi` 工具描述中已包含两份官方文档入口
2. 检查 `action` / `params` 参数描述包含“先查文档，不要猜”的指引
3. 检查报错信息在 action 无效时包含更明确的下一步建议
4. 检查 `doc/mcp-tools.md` 的 `callCloudApi` 章节与工具描述一致
