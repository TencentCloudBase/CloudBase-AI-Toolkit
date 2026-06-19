# 需求文档

## 介绍

为了减少 AI 在使用 `callCloudApi(service="tcb")` 时对管控面 Action 名称和参数结构的猜测，需要将现有可导出的 CloudBase 管控面 OpenAPI YAML 纳入仓库的可维护资产，并转换成适合 webpack 最终产物使用的轻量索引数据。在运行时，系统不对 `tcb` Action 做强制前置校验，也不阻断调用；仅在调用失败时，基于内置索引提供更可信的 Action 候选、参数提醒和文档引导。同时，需要优化 `callCloudApi` 的 action 与 params 示例，使 AI 更容易在调用前构造出接近正确的请求。

## 需求

### 需求 1 - 管控面 YAML 作为可维护源入仓

**用户故事：** 作为维护者，我希望将 CloudBase `tcb` 管控面 OpenAPI YAML 以源码资产方式纳入仓库，以便后续生成运行时索引并随代码演进维护，而不是依赖下载目录中的临时文件。

#### 验收标准

1. When 维护者查看仓库时，the CloudBase MCP repository shall 在源码目录中提供一份可维护的 `tcb` 管控面 OpenAPI YAML 源文件，而不是依赖用户本地下载目录。
2. While 该 YAML 作为索引生成输入使用时，the CloudBase MCP repository shall 将其放在适合工程维护的位置，而不是将其作为仅供阅读的文档资产处理。
3. When 维护者需要更新 `tcb` 管控面 Action 定义时，the CloudBase MCP repository shall 允许通过替换或更新该 YAML 源文件来刷新后续生成的索引数据。

### 需求 2 - 生成适合 bundle 的轻量 tcb action index

**用户故事：** 作为运行时维护者，我希望最终随 webpack 产物一起分发的是轻量索引数据，而不是在运行时动态解析大体积 YAML，以降低实现复杂度并避免打包不确定性。

#### 验收标准

1. When 构建或准备运行时代码时，the CloudBase MCP repository shall 基于 `tcb` OpenAPI YAML 生成一个轻量的 `tcb` action index，至少包含 Action 名称以及可用于错误提示的参数键信息。
2. When webpack 打包最终 MCP 产物时，the CloudBase MCP repository shall 让运行时使用的 `tcb` action index 进入最终 bundle 或其受控产物，而不是要求运行时从文档目录或下载目录读取原始 YAML。
3. While 运行时仅需要错误提示信息时，the CloudBase MCP repository shall 避免在运行时直接解析完整 YAML，并优先使用预生成的轻量索引。

### 需求 3 - tcb 调用失败时提供候选与参数提醒

**用户故事：** 作为使用 `callCloudApi` 的 AI，我希望在 `tcb` 调用失败时得到基于真实 Action 索引的候选和参数提醒，这样我可以更快修正请求，而不是继续猜测。

#### 验收标准

1. When `callCloudApi(service="tcb")` 因未知 Action 或相近错误失败时，the CloudBase MCP server shall 在错误消息中基于内置 `tcb` action index 提供可信的候选 Action 提示。
2. When `callCloudApi(service="tcb")` 因参数字段不匹配或缺少常见参数失败时，the CloudBase MCP server shall 在错误消息中尽量给出该 Action 的参数键提示或示例性参数方向。
3. While `callCloudApi(service="tcb")` 调用尚未失败时，the CloudBase MCP server shall 不因索引存在而强制拦截、阻止或拒绝该调用。

### 需求 4 - 优化 callCloudApi 的 action 与参数示例

**用户故事：** 作为使用 MCP 工具的 AI，我希望工具描述中的 action 和 params 示例更贴近真实 `tcb` 管控面调用，从而在第一次调用时就更容易构造出正确请求。

#### 验收标准

1. When AI 阅读 `callCloudApi` 的工具描述时，the CloudBase MCP server shall 为 `tcb` 管控面调用提供更清晰的 Action 选择说明，而不是只要求“不要猜”。
2. When AI 阅读 `callCloudApi` 的参数说明时，the CloudBase MCP server shall 提供至少一个贴近真实 `tcb` 调用的 `params` 示例或示例方向，帮助 AI 理解 `EnvId` 等键应如何组织。
3. While 场景属于 HTTP API 集成时，the CloudBase MCP server shall 继续明确区分数据面 OpenAPI / Swagger 与 `callCloudApi` 的管控面能力边界，避免把两者混淆。
