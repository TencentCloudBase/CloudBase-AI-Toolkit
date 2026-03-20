# 需求文档

## 介绍

当前仓库中的函数与网关能力存在两个问题：

1. `functions` 域历史上暴露了过多细粒度工具，AI 难以稳定选择正确入口；
2. 函数 HTTP 访问虽然常与函数一起使用，但底层资源和未来规划属于独立 `gateway` 域，不应继续混入函数域。

本次需求要求将函数域和网关域都收敛为明确的主入口模型，并且对函数历史工具执行硬下线，不再保留兼容别名。

## 需求

### 需求 1 - 函数域收敛为两个主工具

**用户故事：** 作为 AI 调用方，我希望函数相关能力只有稳定的查询入口和管理入口，这样我能更容易选对工具。

#### 验收标准

1. When AI 需要查询函数域资源时, the 系统 shall 仅暴露 `queryFunctions` 作为函数域只读入口。
2. When AI 需要修改函数域资源时, the 系统 shall 仅暴露 `manageFunctions` 作为函数域写入口。
3. While 定义函数域边界时, the 系统 shall 将函数详情、日志、触发器、函数层和代码下载地址限定在 `functions` 域内。
4. While 定义函数域写能力时, the 系统 shall 将创建函数、更新代码、更新配置、调用函数、管理触发器和管理函数层限定在 `functions` 域内。

### 需求 2 - 网关域保持独立资源边界

**用户故事：** 作为维护者，我希望网关能力为后续自定义域名、鉴权和非函数目标暴露预留独立演进空间。

#### 验收标准

1. When AI 需要查询网关域资源时, the 系统 shall 暴露 `queryGateway` 作为网关域只读入口。
2. When AI 需要修改网关域资源时, the 系统 shall 暴露 `manageGateway` 作为网关域写入口。
3. While 函数 HTTP 访问依赖网关资源时, the 系统 shall 通过 `gateway` 域处理访问入口的查询与创建，而不是继续放入 `functions` 域。
4. While 网关域能力仍处于初始阶段时, the 系统 shall 采用独立资源命名（如 `targetType`、`targetName`），而不是使用函数专属字段作为长期接口。

### 需求 3 - 历史函数工具必须硬下线

**用户故事：** 作为产品维护者，我希望收敛结果是明确的，而不是长期保留多个旧入口继续误导 AI。

#### 验收标准

1. When 本次收敛完成时, the 系统 shall 移除 `getFunctionList`、`createFunction`、`updateFunctionCode`、`updateFunctionConfig`、`invokeFunction`、`getFunctionLogs`、`getFunctionLogDetail`、`manageFunctionTriggers`、`readFunctionLayers`、`writeFunctionLayers` 等旧函数工具注册。
2. When 本次收敛完成时, the 系统 shall 移除 `createFunctionHTTPAccess` 这种函数专属网关工具注册。
3. While 对外文档、manifest、prompt 和配置仍引用旧工具时, the 系统 shall 将其更新为新的 query/manage 主入口。

### 需求 4 - Schema 必须利于 AI 正确调用

**用户故事：** 作为 AI 调用方，我希望主入口 schema 既收敛又直观，不需要猜测同一能力该走哪个域。

#### 验收标准

1. When 定义 `queryFunctions` 和 `manageFunctions` 的 action 时, the 系统 shall 使用 flat 且可自解释的动作命名，例如 `getFunctionDetail`、`listFunctionLogs`、`attachLayer`。
2. While 定义函数域参数时, the 系统 shall 统一使用 `functionName`、`layerName`、`triggerName` 等统一字段命名。
3. When 定义 `queryGateway` 和 `manageGateway` 的 schema 时, the 系统 shall 使用独立网关语义字段，如 `targetType`、`targetName`。
4. While 同一能力存在跨域边界时, the 系统 shall 只保留一个推荐主路径，避免重复入口。

### 需求 5 - Cloud mode 约束不能被收敛绕过

**用户故事：** 作为运行时维护者，我希望工具收敛后 cloud mode 仍能正确阻止依赖本地文件的操作。

#### 验收标准

1. When `manageFunctions` 在 cloud mode 下执行依赖本地目录的动作时, the 系统 shall 返回明确错误，而不是继续执行。
2. While 某些动作支持非本地输入替代方案时, the 系统 shall 在错误信息中提示可行替代方式。

### 需求 6 - 测试与对外材料必须同步

**用户故事：** 作为维护者，我希望代码收敛后，测试、文档和工具清单都与实际行为一致。

#### 验收标准

1. When 工具收敛完成时, the 系统 shall 更新测试以覆盖新主入口注册、schema 和关键集成路径。
2. When 工具收敛完成时, the 系统 shall 更新 manifest、prompt、connection mode 和生成产物以反映最终工具集合。
3. While 执行回归验证时, the 系统 shall 至少覆盖 TypeScript 构建、目标测试和工具文档生成流程。
