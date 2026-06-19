# 技术方案设计

## 架构概述

本次收敛采用两个资源域、四个主工具的结构：

1. `functions`
   - `queryFunctions`
   - `manageFunctions`
2. `gateway`
   - `queryGateway`
   - `manageGateway`

目标不是把所有相关能力都塞进一个域，而是让资源边界和 AI 心智模型一致：

- 函数本体相关能力留在 `functions`
- HTTP 访问入口和未来网关能力留在 `gateway`
- 旧函数工具直接硬下线，不保留兼容别名

## 设计原则

1. **一个域一个 query / 一个 manage**：每个资源域只暴露两个主入口。
2. **边界优先于表面收敛**：不为了减少工具名而混淆资源模型。
3. **flat action + 统一字段命名**：保持与仓库现有模式一致，降低 AI 误调用。
4. **无兼容层**：旧工具直接删除，文档和提示词同步切换。

## 工具设计

### 一、`queryFunctions`

函数域只读入口，动作集合如下：

```ts
type QueryFunctionsAction =
  | "listFunctions"
  | "getFunctionDetail"
  | "listFunctionLogs"
  | "getFunctionLogDetail"
  | "listFunctionLayers"
  | "listLayers"
  | "listLayerVersions"
  | "getLayerVersionDetail"
  | "listFunctionTriggers"
  | "getFunctionDownloadUrl";
```

输入字段保持顶层扁平结构，并统一使用：

- `functionName`
- `layerName`
- `layerVersion`
- `requestId`

不再保留：

- `getFunctionAccess`
- `detail + include`
- 旧的 `name` / `version` 混合字段

### 二、`manageFunctions`

函数域写入口，动作集合如下：

```ts
type ManageFunctionsAction =
  | "createFunction"
  | "updateFunctionCode"
  | "updateFunctionConfig"
  | "invokeFunction"
  | "createFunctionTrigger"
  | "deleteFunctionTrigger"
  | "createLayerVersion"
  | "deleteLayerVersion"
  | "attachLayer"
  | "detachLayer"
  | "updateFunctionLayers";
```

关键约束：

- `createFunction` / `updateFunctionCode` 继续复用现有函数部署逻辑
- 危险动作如 `deleteLayerVersion` / `detachLayer` 继续要求 `confirm=true`
- 不再保留 `createFunctionAccess`

### 三、`queryGateway`

网关域只读入口，初始动作集合：

```ts
type QueryGatewayAction =
  | "getAccess"
  | "listDomains";
```

字段设计：

- `targetType`
- `targetName`

当前 `targetType` 只开放 `function`，但 schema 已按独立网关域建模，为后续非函数目标留扩展位。

### 四、`manageGateway`

网关域写入口，初始动作集合：

```ts
type ManageGatewayAction =
  | "createAccess";
```

字段设计：

- `targetType`
- `targetName`
- `path`
- `type`
- `auth`

这样当前可以承接“为函数创建 HTTP 访问”，但接口语义仍属于网关资源，而非函数附属字段。

## Cloud Mode 设计

原有 cloud mode 是按工具名过滤旧函数工具。收敛后必须补充动作级保护。

处理策略：

1. `manageFunctions(action="createFunction")` 在 cloud mode 下直接报错；
2. `manageFunctions(action="updateFunctionCode")` 在 cloud mode 下直接报错；
3. `manageFunctions(action="createLayerVersion")` 若依赖 `contentPath`，在 cloud mode 下报错并提示改用 `base64Content`。

## 文档与清单调整

需要同步更新：

- `mcp/manifest.json`
- `doc/connection-modes.mdx`
- `doc/prompts/cloud-functions.mdx`
- `config/rules/cloud-functions/rule.md`
- 相关 AI IDE 配置文档与 prompt
- 生成产物 `doc/mcp-tools.md` 和 `scripts/tools.json`

## 测试策略

### 1. 工具注册与 schema

验证：

- 只保留新的函数主入口和网关主入口
- 旧函数工具和旧网关工具不再注册
- `queryFunctions` 不再暴露 access 动作
- `manageFunctions` 不再暴露 access 写动作

### 2. 参数校验

验证：

- `queryFunctions` 缺少 `functionName` / `layerName` / `requestId` 时返回错误 envelope
- `manageFunctions` 危险动作缺少 `confirm=true` 时返回错误 envelope
- `queryGateway` 缺少 `targetName` 时返回错误 envelope

### 3. 关键集成路径

验证函数层路径：

1. 创建层版本
2. 查询层版本
3. 绑定函数层
4. 查询函数层
5. 解绑函数层
6. 删除层版本

## 风险与取舍

1. **breaking change 明确化**：硬下线旧工具会影响仍在使用旧名字的调用方，但这符合本次收敛目标。
2. **工具数没有压到两个**：最终是函数域两个主工具 + 网关域两个主工具，而不是把网关混进函数域。
3. **网关 schema 先保守实现**：当前只开放最小动作集，但字段模型已为通用网关能力留扩展空间。
