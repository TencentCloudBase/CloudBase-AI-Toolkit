# 需求文档

## 介绍

当前云函数层管理功能已经完成实现、构建和 MCP 层测试，但真实云端集成测试仍只覆盖只读的 `listLayers` 路径，尚未覆盖 layer 版本创建、函数绑定、解绑、整体更新和删除回收等真实写操作。为了确保 layer 能力在真实 CloudBase 环境中的可用性、稳定性和清理安全，需要补充一组可控、可清理、可按条件启用的真实集成测试。本次需求只进入 spec 流程，不立即实现。

同时，本次需求需要确认 `@cloudbase/manager-node` 版本基线是否满足最新能力要求。当前仓库依赖版本为 `^4.10.2`，并且 npm registry 当前最新版本查询结果也是 `4.10.2`，因此当前依赖版本已经处于最新主线版本。

## 需求

### 需求 1 - 提供可选启用的真实集成测试入口

**用户故事：** 作为维护者，我希望 layer 真实集成测试可以按条件启用，而不是在所有本地和 CI 场景中默认执行，以便兼顾测试真实性与环境安全。

#### 验收标准

1. When 运行 layer 真实集成测试时, the 系统 shall 仅在检测到完整 CloudBase 凭证和明确的启用信号后才执行真实云端写操作。
2. While 未检测到所需凭证或启用条件时, the 测试 shall 明确跳过真实集成测试，而不是误报失败。
3. When 真实集成测试被执行时, the 测试入口 shall 与现有 MCP 测试链路兼容，并可被单独运行。

### 需求 2 - 覆盖 layer 创建与删除的真实云端路径

**用户故事：** 作为维护者，我希望真实集成测试能实际创建和删除临时 layer 版本，以验证 `createLayerVersion` 与 `deleteLayerVersion` 的可用性。

#### 验收标准

1. When 执行真实集成测试时, the 测试 shall 使用 `writeFunctionLayers(action="createLayerVersion")` 在云端创建一个临时 layer 版本。
2. When 临时 layer 版本创建成功后, the 测试 shall 验证返回结果中的关键字段，并确认后续读操作能够查询到该版本。
3. When 测试流程结束时, the 测试 shall 使用 `writeFunctionLayers(action="deleteLayerVersion")` 删除测试中创建的 layer 版本。
4. While 删除阶段执行时, the 测试 shall 对资源已不存在、删除失败或清理部分失败的情况提供明确回显。

### 需求 3 - 覆盖 layer 绑定、解绑和排序更新的真实云端路径

**用户故事：** 作为维护者，我希望真实集成测试能实际把 layer 绑定到函数、解绑并调整顺序，以验证函数层配置相关 action 在真实环境中的行为。

#### 验收标准

1. When 执行真实集成测试时, the 测试 shall 使用 `writeFunctionLayers(action="attachLayer")` 将测试 layer 绑定到目标函数。
2. When 绑定成功后, the 测试 shall 通过 `readFunctionLayers(action="getFunctionLayers")` 或函数详情查询验证绑定结果。
3. When 存在多个绑定层时, the 测试 shall 使用 `writeFunctionLayers(action="updateFunctionLayers")` 验证顺序更新和整体替换路径。
4. When 测试流程结束或需要回滚时, the 测试 shall 使用 `writeFunctionLayers(action="detachLayer")` 清理绑定关系。

### 需求 4 - 使用隔离的测试资源与清理策略

**用户故事：** 作为维护者，我希望真实集成测试只操作隔离的测试资源，并在成功和失败场景下都能尽量清理，以避免污染真实环境。

#### 验收标准

1. While 真实集成测试创建资源时, the 测试 shall 使用明确的临时命名约定，以区分测试 layer 和正式 layer。
2. When 真实集成测试需要目标函数时, the 测试 shall 明确是复用专用测试函数，还是按条件动态创建并在结束后清理。
3. While 任一步骤失败时, the 测试 shall 尝试执行补偿性清理，并输出哪些资源已清理、哪些资源仍可能残留。
4. When 测试完成后, the 测试 shall 尽量将环境恢复到执行前状态，包括 layer 绑定关系和临时 layer 版本。

### 需求 5 - 保持测试结果对维护者可诊断

**用户故事：** 作为维护者，我希望真实集成测试失败时可以快速知道是创建失败、绑定失败、排序失败还是清理失败，以便快速定位问题。

#### 验收标准

1. When 任一步骤失败时, the 测试 shall 输出当前步骤名称、目标资源名称和关键错误上下文。
2. While 测试输出结果时, the 测试 shall 保留足够的结构化信息，帮助维护者判断失败发生在创建、绑定、更新、解绑还是删除阶段。
3. When 测试被跳过时, the 测试 shall 明确说明跳过原因，例如缺少环境变量、未开启真实集成测试开关或缺少测试函数。

### 需求 6 - 与当前 layer 实现和 manager sdk 版本保持一致

**用户故事：** 作为维护者，我希望真实集成测试基于当前已实现的 layer 工具和最新可用的 manager sdk 版本设计，以便避免测试目标与实现基线不一致。

#### 验收标准

1. While 设计真实集成测试时, the 系统 shall 以当前已实现的 `readFunctionLayers` 和 `writeFunctionLayers` 为测试目标，而不是绕过 MCP 直接调用底层 SDK。
2. When 确认依赖版本时, the 系统 shall 记录当前仓库中的 `@cloudbase/manager-node` 版本以及 npm registry 最新版本，并明确是否存在升级差异。
3. While 当前版本已经满足最新版本要求时, the 需求文档 shall 明确说明无需因为本次测试需求单独升级 manager sdk。
