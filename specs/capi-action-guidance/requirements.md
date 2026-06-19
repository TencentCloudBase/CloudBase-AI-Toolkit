# 需求文档

## 介绍

当前 `callCloudApi` 是一个完全开放的通用云 API 调用工具，`action` 参数没有枚举约束，也缺少足够的管控面 API 引导。虽然仓库已经支持导出部分 OpenAPI / Swagger `yaml` / `json` 文档，但这些文档主要覆盖数据面 / HTTP API，不足以帮助 agent 正确发现 `tcb`、`scf`、`lowcode`、`cdn`、`vpc` 等服务下的管控面 Action。

本需求的目标是优化 `callCloudApi` 的说明与报错体验，让 agent 在使用该工具时，能够明确区分：

- 数据面 API：可参考 OpenAPI / Swagger 文档
- 管控面 API：应优先参考 CloudBase API 概览与云开发依赖资源接口指引

并在不知道正确 Action 时，能被直接引导到正确的文档入口，而不是靠猜测。

## 需求

### 需求 1 - 明确区分数据面与管控面 API

**用户故事：** 作为调用 `callCloudApi` 的开发者，我希望工具能清楚说明哪些场景适合参考 OpenAPI/Swagger，哪些场景应该查 CloudBase 管控面文档，避免把数据面文档误当成管控面 action 指南。

#### 验收标准

1. When 工具描述介绍 `callCloudApi` 用途时，the description shall 明确指出该工具主要用于管控面 / 通用云 API 调用，不能依赖数据面 OpenAPI 猜测 Action 名称。
2. When 工具描述提到 OpenAPI/Swagger 时，the description shall 明确说明现有 OpenAPI 能力主要覆盖数据面 / HTTP API，而不是通用的管控面 Action 集合。
3. When 用户需要查找管控面 Action 时，the tool guidance shall 明确指向 CloudBase API 概览与云开发依赖资源接口指引两份官方文档。

### 需求 2 - 在工具说明中直接提供官方文档入口

**用户故事：** 作为调用 `callCloudApi` 的开发者，我希望在工具描述和文档里直接看到应该查阅的官方文档链接，而不是只看到“去看 rules / skills”这种抽象提示。

#### 验收标准

1. When `callCloudApi` 的工具描述被展示给用户或 agent 时，the description shall 包含以下官方文档入口：
   - CloudBase API 概览：`https://cloud.tencent.com/document/product/876/34809`
   - 云开发依赖资源接口指引：`https://cloud.tencent.com/document/product/876/34808`
2. When `doc/mcp-tools.md` 描述 `callCloudApi` 时，the documentation shall 同步包含上述两份官方文档入口和用途说明。
3. When 工具提示如何查 Action 时，the guidance shall 明确说明：
   - `functions/auth/cloudrun/storage/mysqldb` 等 HTTP API 可参考 OpenAPI / Swagger
   - `tcb/scf/lowcode/cdn/vpc/cam/sts` 等通用云 API Action 应优先查官方管控面文档

### 需求 3 - 错误提示更可执行

**用户故事：** 作为调用 `callCloudApi` 出错的开发者，我希望错误信息不仅提示 action 无效，还能告诉我下一步去哪查、查什么。

#### 验收标准

1. When `callCloudApi` 因 `action` 无效或不存在而失败时，the error message shall 提示不要猜测 Action，并引导用户查阅对应官方文档。
2. When `callCloudApi` 的 `service` 属于 CloudBase / 依赖资源管控面场景时，the error guidance shall 优先指向 CloudBase API 概览与云开发依赖资源接口指引。
3. When `callCloudApi` 的场景更接近数据面 HTTP API 时，the error guidance shall 提醒优先使用 OpenAPI / Swagger 或 `searchKnowledgeBase(mode="openapi")`，而不是直接继续猜测管控面 Action。

### 需求 4 - 保持工具的通用性

**用户故事：** 作为维护者，我希望在增强 action 引导的同时，不把 `callCloudApi` 改造成不可维护的全量 action 枚举工具。

#### 验收标准

1. When 本次需求被实现时，the implementation shall 不要求为所有 `service/action` 建立完整枚举。
2. When 工具说明被增强时，the tool shall 继续保持通用字符串 `action` 输入模式。
3. When 维护者完成本次需求时，the implementation shall 优先通过描述、文档和错误引导改善可发现性，而不是引入难以维护的全量 action 白名单。
