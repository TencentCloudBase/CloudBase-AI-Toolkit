# 技术方案设计

## 架构概述

本次在 `mcp/src/tools/functions.ts` 中扩展云函数层管理能力，不新增独立插件，仍然归属于现有 `functions` 插件。整体采用与 `storage.ts`、`cloudrun.ts`、`databaseNoSQL.ts` 一致的读写分离模式：

1. `readFunctionLayers`：只读查询工具
2. `writeFunctionLayers`：写操作工具

层管理分为两类路径：

- **Layer 资源路径**：直接管理层及其版本
- **Function 配置路径**：管理函数当前绑定的层与顺序

其中 Layer 资源路径直接使用 manager sdk 的 layer API；Function 配置路径优先使用 manager sdk 已提供的 `attachLayer`、`unAttachLayer`、`updateFunctionLayer`，并在必要时结合 `getFunctionDetail` 做状态校验与结果回显。

## 技术选型

- **核心 SDK**：`@cloudbase/manager-node`
- **工具注册**：沿用 `ExtendedMcpServer.registerTool`
- **参数校验**：`zod`
- **日志记录**：复用 `logCloudBaseResult`
- **返回格式**：与现有 MCP 工具保持一致，优先返回结构化 JSON 文本
- **实现位置**：`mcp/src/tools/functions.ts`
- **测试方式**：延续 `tests/cloudrun.test.js`、`tests/storage-tools.test.js` 的 MCP client 集成测试风格

## API 设计

### 1. `readFunctionLayers`

**目标**：提供所有层相关只读能力，控制为一把工具，通过 `action` 区分子能力。

建议 action 设计：

- `listLayers`
- `listLayerVersions`
- `getLayerVersion`
- `getFunctionLayers`

说明：

- `getLayerVersion` 返回的结果中本身包含 `Location`、`CodeSha256` 等字段，因此“下载地址/元信息”不单独拆新 action。
- `getFunctionLayers` 聚焦“函数当前绑定的层”，避免让用户为了看层配置去读完整函数详情对象。

建议输入结构：

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
};
```

接口映射：

| action | manager sdk | 说明 |
| --- | --- | --- |
| `listLayers` | `cloudbase.functions.listLayers()` | 查询层列表 |
| `listLayerVersions` | `cloudbase.functions.listLayerVersions()` | 查询指定层的版本列表 |
| `getLayerVersion` | `cloudbase.functions.getLayerVersion()` | 查询版本详情，同时返回下载地址信息 |
| `getFunctionLayers` | `cloudbase.functions.getFunctionDetail()` | 从函数详情中提取 `Layers` 字段 |

### 2. `writeFunctionLayers`

**目标**：提供层版本创建、删除以及函数层绑定管理能力。

建议 action 设计：

- `createLayerVersion`
- `deleteLayerVersion`
- `attachLayer`
- `detachLayer`
- `updateFunctionLayers`

说明：

- `attachLayer` 用于追加绑定，最贴近 CLI 的 bind 语义。
- `detachLayer` 用于移除单个已绑定层，最贴近 CLI 的 unbind 语义。
- `updateFunctionLayers` 用于显式设置目标层数组，覆盖“排序调整”和“批量重排/修正”场景。
- 不提供本地下载 action，本次只读层下载地址。

建议输入结构：

```ts
type WriteFunctionLayersInput = {
  action:
    | "createLayerVersion"
    | "deleteLayerVersion"
    | "attachLayer"
    | "detachLayer"
    | "updateFunctionLayers";
  name?: string;
  version?: number;
  functionName?: string;
  contentPath?: string;
  base64Content?: string;
  runtimes?: string[];
  description?: string;
  licenseInfo?: string;
  layerName?: string;
  layerVersion?: number;
  layers?: Array<{
    LayerName: string;
    LayerVersion: number;
  }>;
};
```

接口映射：

| action | manager sdk | 说明 |
| --- | --- | --- |
| `createLayerVersion` | `cloudbase.functions.createLayer()` | 创建新层版本 |
| `deleteLayerVersion` | `cloudbase.functions.deleteLayerVersion()` | 删除指定版本 |
| `attachLayer` | `cloudbase.functions.attachLayer()` | 为函数追加绑定一层 |
| `detachLayer` | `cloudbase.functions.unAttachLayer()` | 为函数解绑指定层 |
| `updateFunctionLayers` | `cloudbase.functions.updateFunctionLayer()` | 按目标数组整体更新函数层配置 |

## 与现有函数工具的关系

### 保持不破坏现有能力

- `createFunction` 继续保留 `func.layers` 输入能力，不迁移、不移除。
- `getFunctionList(action="detail")` 当前已经可返回函数完整详情，设计阶段不强制改工具名和接口形态。
- `updateFunctionConfig` 不扩展为通用层管理入口，避免与 `writeFunctionLayers` 形成职责重叠。

### 一致性策略

1. **创建阶段**：用户仍可通过 `createFunction` 一次性带上 `layers`
2. **查询阶段**：用户可通过 `getFunctionList(detail)` 看完整函数，也可通过 `readFunctionLayers(action="getFunctionLayers")` 快速看层绑定
3. **更新阶段**：用户通过 `writeFunctionLayers` 管理已存在函数的层绑定与顺序

这样可以同时兼容：

- manager sdk 的函数配置模型
- CLI 的 layer bind / unbind / sort 心智模型
- MCP 的“少量工具 + 明确 action”设计目标

## 参数与校验策略

### `readFunctionLayers`

- `listLayers`：允许 `runtime`、`searchKey`、`offset`、`limit`
- `listLayerVersions`：必须提供 `name`
- `getLayerVersion`：必须提供 `name` 和 `version`
- `getFunctionLayers`：必须提供 `functionName`

### `writeFunctionLayers`

- `createLayerVersion`：必须提供 `name`、`runtimes`，且 `contentPath` 与 `base64Content` 至少二选一
- `deleteLayerVersion`：必须提供 `name` 和 `version`
- `attachLayer`：必须提供 `functionName`、`layerName`、`layerVersion`
- `detachLayer`：必须提供 `functionName`、`layerName`、`layerVersion`
- `updateFunctionLayers`：必须提供 `functionName` 和 `layers`

### 校验原则

1. 尽量在 zod schema 层约束静态字段
2. 在 handler 内做 action 级必填校验，保持和现有 `functions.ts` 风格一致
3. 错误信息直接指出缺失字段和允许的 action

## 返回格式设计

返回结构保持与现有较新的工具风格一致：

```json
{
  "success": true,
  "data": {
    "action": "listLayers",
    "...": "..."
  },
  "message": "..."
}
```

具体策略：

- 所有返回体包含 `success`
- 尽量在 `data.action` 中回显当前 action
- 对 layer 读操作保留 manager sdk 原始关键字段，避免二次重命名过多
- 对函数层配置查询结果，统一输出：
  - `functionName`
  - `layers`
  - `count`

## 错误处理策略

错误分层：

1. **参数错误**
   - 缺失 `name` / `version` / `functionName`
   - `createLayerVersion` 既没给 `contentPath` 也没给 `base64Content`
2. **资源不存在**
   - 层不存在
   - 层版本不存在
   - 函数不存在
3. **绑定状态错误**
   - 解绑不存在的层
   - 更新层数组格式非法
4. **SDK/权限错误**
   - manager sdk 调用失败
   - 环境/权限不足

错误处理原则：

- 不吞掉 manager sdk 的关键信息
- 在必要时追加更友好的上下文，如当前 action 和缺失参数
- 复用 `logCloudBaseResult` 记录成功调用结果

## 测试策略

### 1. 工具注册与 schema 测试

新增 `tests/function-layer-tools.test.js`，覆盖：

- `listTools()` 中存在 `readFunctionLayers`
- `listTools()` 中存在 `writeFunctionLayers`
- `readFunctionLayers` 的 schema 包含预期 action
- `writeFunctionLayers` 的 schema 包含预期 action
- annotations 正确：
  - `readFunctionLayers.readOnlyHint === true`
  - `writeFunctionLayers.readOnlyHint === false`
  - `writeFunctionLayers.category === "functions"`

### 2. 基础调用路径测试

沿用现有集成测试策略，用 MCP client 调 `callTool()` 验证：

- `readFunctionLayers(action="listLayers")` 可调用
- `readFunctionLayers(action="getLayerVersion")` 在参数存在时可调用
- `writeFunctionLayers(action="createLayerVersion")` 在参数格式正确时进入调用路径
- `writeFunctionLayers(action="deleteLayerVersion")` 在参数格式正确时进入调用路径
- `writeFunctionLayers(action="attachLayer")` / `detachLayer` / `updateFunctionLayers` 的参数校验生效

### 3. 向后兼容测试

补充断言，确保：

- `createFunction` 仍然存在
- `getFunctionList` 仍然存在
- `updateFunctionConfig` 仍然存在
- 新工具加入后 `functions` 插件整体工具注册正常

## 文档与元数据

本阶段不手写 `doc/mcp-tools.md` 内容，而是保证实现完成后可通过现有生成链路同步：

- `scripts/generate-tools-json.mjs`
- `scripts/generate-tools-doc.mjs`

设计要求：

1. 工具标题、描述、schema 必须完整，确保生成结果可读
2. 下载相关描述必须明确“返回下载地址，不下载到本地”
3. action 描述必须体现读写分离和使用场景

## 安全性考虑

1. 不引入新的本地文件写入下载逻辑，避免额外文件系统风险
2. 函数层更新优先调用 manager sdk 内置方法，减少自拼底层请求
3. 若使用 `updateFunctionLayers`，必须要求显式传入最终目标数组，避免隐式排序导致误操作

## 实施范围边界

本次包含：

- 层列表、版本列表、版本详情
- 层版本创建与删除
- 函数层绑定、解绑、整体更新
- 层下载地址/元信息查询
- 测试、工具元数据、文档生成链路适配

本次不包含：

- 下载层 ZIP 到本地目录
- 新增独立的 layer 插件
- 重构现有 `createFunction` / `getFunctionList` / `updateFunctionConfig` 的整体接口形态
