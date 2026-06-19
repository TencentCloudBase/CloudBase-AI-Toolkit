# 技术方案设计

## 架构概述

本次 spec 不新增新的插件，仍在现有 `functions` 插件范围内进行优化设计。目标不是重做一套新的函数工具体系，而是在保持兼容的前提下，对现有函数与函数层工具做一次“全局工具规范 + 规范一致性 + AI 友好度”收敛。设计范围覆盖：

1. `getFunctionList`
2. `createFunction`
3. `updateFunctionCode`
4. `updateFunctionConfig`
5. `invokeFunction`
6. `getFunctionLogs`
7. `getFunctionLogDetail`
8. `manageFunctionTriggers`
9. `readFunctionLayers`
10. `writeFunctionLayers`

本次设计遵循四个原则：

1. **兼容优先**：现有工具名默认保留，不做破坏性重命名。
2. **少量工具**：不因为 AI 友好度问题而无限拆工具，优先通过 schema、action 和返回结构优化解决。
3. **渐进收敛**：优先统一高频工具的输入输出模式，再处理批量能力和增强引导。
4. **AI 优先视角**：优先优化“AI 能否一次理解、一次调用、一次衔接下一步”，而不是只追求 SDK 字段完整透传。

## 全局工具规范基线

在本次设计中，先定义 CloudBase MCP 的全局工具分类规则，再将 `functions` 域映射到对应模式。全局基线如下：

### 1. 声明式资源

适合：

- NoSQL 数据内容
- NoSQL 结构
- 安全规则
- 其他以 CRUD 和声明式修改为主的资源

设计原则：

- 优先采用 `read/write`
- action 应围绕“查询、创建、更新、删除”展开
- 输入输出尽量稳定、可预测

### 2. 生命周期资源

适合：

- functions
- cloudrun
- storage
- 域名、环境控制面等资源

设计原则：

- 优先采用 `read/manage`
- action 不只表达字段修改，也表达部署、绑定、解绑、发布、上传、删除、执行等生命周期动作
- 输出要强调当前状态与下一步管理动作

### 3. 执行动作

适合：

- `invoke`
- `execute`
- 其他一次性运行操作

设计原则：

- 如果动作与某个生命周期资源强绑定，可以作为 `manage(action=...)` 的一部分
- 如果动作已经形成稳定心智模型，也可以独立保留 `invoke/execute`
- 关键判断标准是“执行一次动作”，而不是“修改资源定义”

### 4. 观测能力

适合：

- logs
- metrics
- traces
- operation history

设计原则：

- 优先单独抽域
- 不继续混在资源管理工具里
- 默认摘要优先，详情显式展开

### 5. 对 `functions` 域的判定

基于上述规则，`functions` 域应优先被视为**生命周期资源**，而不是声明式资源。

因此本次设计给出的长期方向是：

- `functions` 域总体更适合 `read/manage`
- `invoke` 不宜被视为 `write`，应视为执行动作，可独立保留或纳入 `manage`
- `logs` 应逐步从函数资源工具中抽离为更独立的观测域
- `layers` 作为函数域下的生命周期子资源，也应评估从 `writeFunctionLayers` 向 `manageFunctionLayers` 收敛的可行性

## 当前问题归类

### 1. 全局规范缺位问题

- 当前项目不同插件混用了多套命名哲学：
  - `read/write`
  - `get/create/update`
  - `manage`
- 这些模式并非都错误，但项目缺少统一的判定规则。
- 没有先定义“什么资源该用 `read/write`、什么资源该用 `read/manage`”，导致同类资源可能沿着不同历史路径演化。

### 2. 规范一致性问题

- 同属 `functions` 插件，但返回结构存在两套模式：
  - 旧函数工具多为直接返回原始 SDK JSON 字符串
  - 新 layer 工具返回 `{ success, data, message }`
- 工具命名风格不完全统一：
  - `getFunctionList`
  - `manageFunctionTriggers`
  - `readFunctionLayers`
  - `writeFunctionLayers`
- 某些工具职责边界对 AI 不够明确：
  - `getFunctionList(action="detail")` 可看层
  - `readFunctionLayers(action="getFunctionLayers")` 也可看层
- 写操作结果多为 SDK 原始结果，缺少“当前生效状态”的回显，导致下一步仍需补查。

### 3. AI 友好度问题

- schema 不能充分表达 action 条件必填、模式差异和互斥关系。
- 高价值字段没有被突出，低价值字段输出过多，增加 token 成本。
- 部分工具缺少“下一步建议”，导致调用链需要 AI 自行推断。
- 批量场景支持不均衡，多个高频任务仍需要多次往返。

## 设计目标

### 目标 0 - 先补全全局工具规范，再优化函数域

在函数域收敛之前，先补齐项目层面的设计判断：

1. 声明式资源优先 `read/write`
2. 生命周期资源优先 `read/manage`
3. 执行动作独立保留或纳入 `manage(action=...)`
4. 观测能力单独抽域

这套规范将作为函数域和后续其他资源域演进时的统一依据。

### 目标 1 - 统一高频函数工具的返回契约

对函数相关工具逐步收敛到一致的结构化返回格式：

```json
{
  "success": true,
  "data": {},
  "message": "Human-readable summary",
  "nextActions": []
}
```

说明：

- `success`：统一成功状态表达。
- `data`：承载结构化结果。
- `message`：保留简洁摘要，便于直接展示给用户。
- `nextActions`：为 AI 提供建议性的后续工具调用线索。

### 目标 2 - 统一“摘要优先，详情显式请求”的读路径

对高频只读工具采用摘要优先策略：

- 默认返回用于决策的关键字段
- 当用户或 AI 明确需要时，再通过 `view`、`include` 或 `verbose` 获取更完整字段

适用对象：

- `getFunctionList`
- `getFunctionLogs`
- `readFunctionLayers`

### 目标 3 - 保持创建/更新路径自然串联

对高频写工具，操作完成后返回“最小必要结果 + 当前有效状态摘要 + 推荐下一步”，减少二次查询。

适用对象：

- `createFunction`
- `updateFunctionCode`
- `updateFunctionConfig`
- `manageFunctionTriggers`
- `writeFunctionLayers`

### 目标 4 - 提升批量操作效率但不显著增加复杂度

批量能力优先通过现有工具增强，不新增大量新工具。仅在以下条件同时满足时才引入新的 action：

1. 高频场景明显受益
2. schema 可以保持简单
3. 返回结构可以稳定表达部分成功/失败

## 工具级设计

### 1. `getFunctionList`

#### 当前问题

- `list` 与 `detail` 共用一个工具是合理的，但默认结果过于接近 SDK 原始数据。
- `detail` 已经能返回 `Layers`，与 `readFunctionLayers(action="getFunctionLayers")` 形成发现性重叠。

#### 设计建议

保留 `getFunctionList` 名称和 `list/detail` action，不新增新工具。

新增可选参数建议：

```ts
type GetFunctionListInput = {
  action?: "list" | "detail";
  name?: string;
  limit?: number;
  offset?: number;
  view?: "summary" | "detail";
  include?: Array<"layers" | "triggers" | "envVariables" | "access" | "all">;
};
```

设计说明：

- `list` 默认 `view="summary"`，只返回：
  - `name`
  - `type`
  - `runtime`
  - `status`
  - `lastModifiedTime`
- `detail` 默认返回关键摘要，不默认展开所有大字段。
- 当需要完整层配置时：
  - 看完整函数上下文，用 `getFunctionList(action="detail")`
  - 只看层绑定，用 `readFunctionLayers(action="getFunctionLayers")`

输出建议：

- `data.functions` 或 `data.function`
- `data.count`
- `nextActions`
  - 例如推荐查看层、日志、触发器或更新配置

### 2. `createFunction`

#### 当前问题

- `func` 对象承载 Event / HTTP / WebSocket 等多种模式，条件必填复杂。
- 对 AI 来说，哪些字段在当前类型下有效并不直观。

#### 设计建议

保留工具名，优先优化 schema 表达，而不是拆新工具。

建议方向：

1. 用判别式结构强化 `type` 和 `protocolType` 的约束。
2. 为高频字段补示例与默认值说明。
3. 保留 `layers` 作为创建期一次性配置入口。
4. 返回结果中增加：
   - `functionName`
   - `type`
   - `runtime`
   - `layers`
   - `nextActions`

兼容策略：

- 第一阶段允许旧输入结构继续工作。
- 第二阶段再考虑在 schema 描述层更强地突出推荐结构。

### 3. `updateFunctionCode`

#### 当前问题

- 当前只适合“更新代码”这一个很明确的动作，但返回结果缺少当前函数代码相关状态摘要。
- AI 完成更新后，通常还需要决定是否验证、调用或查日志。

#### 设计建议

保留工具名和输入结构，主要优化输出。

输出建议：

- `functionName`
- `updated: true`
- `deploymentResult`
- `nextActions`
  - `invokeFunction`
  - `getFunctionLogs`
  - `getFunctionList(action="detail")`

### 4. `updateFunctionConfig`

#### 当前问题

- 该工具内部基于当前配置做 merge，但 schema 并没有明确告诉 AI 是“局部合并”而不是“整体覆盖”。
- 返回结果没有回显最终有效配置摘要，AI 难以判断当前状态。

#### 设计建议

保留工具名，但明确配置更新语义。

新增可选参数建议：

```ts
type UpdateFunctionConfigInput = {
  funcParam: {
    name: string;
    timeout?: number;
    envVariables?: Record<string, string>;
    vpc?: {
      vpcId: string;
      subnetId: string;
    };
  };
  patchMode?: "merge";
  returnView?: "summary" | "effective";
};
```

设计说明：

- `patchMode` 初期只允许 `merge`，但要显式表达当前行为。
- `returnView="effective"` 时回显最终配置摘要，而不只是 SDK 更新结果。

输出建议：

- `data.functionName`
- `data.updatedFields`
- `data.effectiveConfig`
- `nextActions`

### 5. `invokeFunction`

#### 当前问题

- 当前 schema 简单直接，但输出仍偏原始。
- 当调用失败时，有部分友好提示，但成功时对下一步操作没有引导。

#### 设计建议

从全局规范看，`invokeFunction` 不应被视为 `write`。它代表执行动作，可有两条演进路径：

1. 短期兼容：保留 `invokeFunction`
2. 长期收敛：评估将其纳入 `manageFunctions(action="invoke")`

本次设计建议保持最小变更，短期保留独立工具。

输入可选增强：

- 保留 `params`
- 可评估增加 `payload` 作为语义更直观的别名，但需要确认是否值得引入

输出建议：

- `functionName`
- `result`
- `requestId`（若可获得）
- `nextActions`
  - 查看日志
  - 重新查询函数详情

### 6. `getFunctionLogs` 与 `getFunctionLogDetail`

#### 当前问题

- 两个工具拆分是合理的，但 `getFunctionLogs` 默认返回的原始结果对 AI 不够经济。
- 日志列表工具没有突出“最关键的下一步字段”。

#### 设计建议

从全局规范看，日志属于观测能力，应逐步从函数资源语义中弱化，长期可收敛到更独立的日志域。本次设计保持两个工具，不合并。

`getFunctionLogs` 输入增强建议：

```ts
type GetFunctionLogsInput = {
  name: string;
  offset?: number;
  limit?: number;
  startTime?: string;
  endTime?: string;
  requestId?: string;
  qualifier?: string;
  view?: "summary" | "detail";
};
```

输出建议：

- 默认 `summary`
- 每条日志仅保留：
  - `requestId`
  - `invokeTime`
  - `status`
  - `duration`
  - `memUsage`
- 顶层回显：
  - `count`
  - `requestIds`
  - `nextActions`

`getFunctionLogDetail` 输出建议：

- 除原始日志内容外，增加：
  - `requestId`
  - `logLinesCount`
  - `hasError`
  - `errorSummary`

### 7. `manageFunctionTriggers`

#### 当前问题

- 当前 create 支持数组，delete 仅支持单个 `triggerName`，批量能力不对称。
- 输出为原始结果，不便继续管理。

#### 设计建议

保留工具名与 `create/delete` action。

新增参数建议：

```ts
type ManageFunctionTriggersInput = {
  action: "create" | "delete";
  name: string;
  triggers?: TriggerInput[];
  triggerName?: string;
  triggerNames?: string[];
};
```

设计说明：

- `delete` 支持 `triggerName` 与 `triggerNames` 二选一。
- 若同时传入多个删除目标，返回逐项结果。

输出建议：

- `functionName`
- `createdTriggers` / `deletedTriggers`
- `failedTriggers`
- `currentTriggerCount`（若成本可接受）
- `nextActions`

### 8. `readFunctionLayers`

#### 当前问题

- 当前已比旧函数工具更 AI 友好，但仍可进一步统一摘要/详情策略。
- 只支持单函数查看层绑定，批量查看能力不足。

#### 设计建议

保留工具名与现有 action，优先增强而不重构。

新增参数建议：

```ts
type ReadFunctionLayersInput = {
  action:
    | "listLayers"
    | "listLayerVersions"
    | "getLayerVersion"
    | "getFunctionLayers";
  name?: string;
  version?: number;
  runtime?: string;
  searchKey?: string;
  offset?: number;
  limit?: number;
  functionName?: string;
  functionNames?: string[];
  view?: "summary" | "detail";
};
```

设计说明：

- `listLayers` 和 `listLayerVersions` 默认返回摘要。
- `getLayerVersion` 默认返回下载信息和核心元数据，不默认透传全部大字段。
- `getFunctionLayers` 可评估支持 `functionNames`，返回多函数层摘要。

### 9. `writeFunctionLayers`

#### 当前问题

- 当前设计已较清晰，但批量 attach/detach 仍偏单条。
- 写后回显已经比旧工具好，但仍可补充更明确的“最终状态 + 下一步建议”。

#### 设计建议

短期保留工具名与现有 action，避免破坏已完成的 layer 实现与文档生成结果。

长期方向上，若函数域整体收敛到 `read/manage`，则 layer 子域也应评估：

- `readFunctionLayers` 是否保持不变
- `writeFunctionLayers` 是否逐步收敛为 `manageFunctionLayers`

增强方向：

1. `attachLayer` 支持单条或批量输入：
   - 保留 `layerName` + `layerVersion`
   - 可新增 `layers` 作为批量追加输入
2. `detachLayer` 支持单条或批量解绑：
   - 保留 `layerName` + `layerVersion`
   - 可新增 `layers` 作为批量解绑输入
3. `updateFunctionLayers` 继续作为最终目标数组的显式更新入口

输出建议：

- `functionName`
- `action`
- `layers`
- `count`
- `changed`
- `nextActions`

## 自发现性设计

### 1. 统一 nextActions

对函数相关工具引入统一的 `nextActions` 结构建议：

```ts
type SuggestedNextAction = {
  tool: string;
  action?: string;
  reason: string;
};
```

示例：

- 创建函数后建议：
  - `getFunctionList(detail)`
  - `invokeFunction`
  - `getFunctionLogs`
- 查询函数详情后建议：
  - `readFunctionLayers(getFunctionLayers)`
  - `manageFunctionTriggers`
  - `updateFunctionConfig`
- 查询日志列表后建议：
  - `getFunctionLogDetail`

### 2. 明确主入口与补充入口

设计上明确：

- `getFunctionList(detail)` 是“函数全貌入口”
- `readFunctionLayers(getFunctionLayers)` 是“函数层专题入口”
- `getFunctionLogs` 是“日志列表入口”
- `getFunctionLogDetail` 是“单次调用日志详情入口”

文档和描述需要强调“主入口 vs 专题入口”的关系，减少工具选择歧义。

## Token 经济性设计

### 1. 默认摘要视图

高频读工具默认只返回：

- 主键
- 状态
- 数量
- 下一步所需关键标识

### 2. 详情按需展开

通过 `view`、`include` 或 `returnView` 请求更大字段，避免默认透传：

- 全量环境变量
- 全量日志详情
- 大型函数详情对象
- 大型层详情对象

### 3. 写后回显有效状态

优先在写操作结果中回显“已经生效的关键状态”，减少补查带来的额外 token 消耗。

## 批量能力设计

### 优先增强的批量场景

1. 批量查询多个函数的层绑定摘要
2. 批量删除多个触发器
3. 批量追加/解绑多个 layer

### 暂不建议优先增强的场景

1. 批量创建多个函数
2. 批量更新多个函数代码
3. 批量获取多个函数的完整详情

原因：

- 容易显著增大 schema 复杂度
- 容易让单次响应过大
- 对失败回滚和部分成功表达要求更高

## 兼容性与迁移策略

### 阶段 1 - 非破坏性增强

- 不改工具名
- 旧参数继续可用
- 新增可选字段如 `view`、`include`、`returnView`
- 写工具开始回显更稳定的结构化结果

### 阶段 2 - 明确全局规范并同步文档

- 将“声明式资源 / 生命周期资源 / 执行动作 / 观测能力”的分类规则写入更上层规范
- 在各插件设计中明确该资源域采用 `read/write` 还是 `read/manage`
- 更新工具标题、描述和 schema 注释
- 让 `tools.json` 与 `doc/mcp-tools.md` 更强调 AI 推荐用法和工具分类理由

### 阶段 3 - 评估进一步收敛

- 若实践证明有效，再评估是否继续统一旧函数工具到 `jsonContent` 风格
- 如有必要，再考虑兼容性别名或更细致的 action 归并
- 评估 `functions` 域和 layer 子域是否从现状逐步收敛到 `read/manage`

## 测试策略

本次仅做设计，不实现测试。但后续实现阶段应覆盖：

1. 工具 schema 的新增可选字段和默认行为
2. 默认摘要视图与显式详情视图的返回差异
3. `nextActions` 的结构稳定性
4. 批量输入下的部分成功/失败结果结构
5. 对旧输入格式的兼容性

## 安全性考虑

1. 不因批量能力引入隐式大规模变更
2. 对写操作保持显式目标表达，避免模糊更新
3. 对详情展开能力保持按需请求，避免在日志或配置中默认暴露过多内容

## 本阶段边界

本次设计包含：

- CloudBase MCP 全局工具规范基线
- 函数相关工具的规范性评审结论
- AI 友好度优化方向
- schema、输出、批量能力和自发现性的设计方案

本次设计不包含：

- 代码实现
- 工具重命名落地
- 对外文档和生成脚本的实际修改
- 测试文件改动
