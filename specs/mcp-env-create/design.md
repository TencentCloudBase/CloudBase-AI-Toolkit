# 技术方案设计：MCP 环境创建工具

## 架构概览

在 `mcp/src/tools/env.ts` 中已有 `registerEnvTools` 函数注册了 `auth`、`queryEnv`、`envDomainManagement` 三个工具。新增的 `manageEnv` 工具作为第四个工具，与现有工具共享同一个文件，复用已有的 Manager SDK 初始化、日志记录、错误处理等基础设施。

## 技术选型

- **Manager SDK v5（优先）**：`@cloudbase/manager-node` 的 `env.createEnv()`、`env.destroyEnvWithParams()`、`env.modifyEnvPlan()`、`env.renewEnv()`、`env.describeBaasPackageList()`
- **CAPI fallback**：对于 SDK 不支持的操作或版本兼容问题，降级到 `commonService("tcb", "2018-06-08").call()`

## 数据流

```
AI Agent
  │
  ├── manageEnv(action="listPackages")
  │     └── Manager SDK env.describeBaasPackageList()
  │           └── 返回套餐列表（ID、名称、适用场景）
  │
  ├── manageEnv(action="create", alias, packageId, region?, resources?, duration?)
  │     ├── 展示配置摘要 → 等待用户 confirm="yes"
  │     ├── Manager SDK env.createEnv({ Alias, PackageId, Resources, Period, ... })
  │     └── 返回新环境 ID + 提示轮询状态
  │
  ├── manageEnv(action="destroy", envId, force?, bypassCheck?)
  │     ├── 先 queryEnv(action="info", envId) 展示环境信息
  │     ├── 展示影响范围 → 等待用户 confirm="yes"
  │     ├── Manager SDK env.destroyEnvWithParams({ EnvId, IsForce, BypassCheck })
  │     └── 返回销毁结果
  │
  ├── manageEnv(action="modifyPlan", envId, packageId)
  │     ├── 查询当前套餐和价格变化
  │     ├── 展示 → 等待用户 confirm="yes"
  │     ├── Manager SDK env.modifyEnvPlan({ EnvId, PackageId })
  │     └── 返回变更结果
  │
  └── manageEnv(action="renew", envId, duration?)
        ├── 展示续费信息 → 等待用户 confirm="yes"
        ├── Manager SDK env.renewEnv({ EnvId, Period })
        └── 返回续费结果
```

## 工具设计

### 工具命名

- **工具名**：`manageEnv`
- **注册位置**：`mcp/src/tools/env.ts` 中的 `registerEnvTools` 函数
- **描述**：管理 CloudBase 环境，支持创建、销毁、变更套餐、续费、查询套餐列表等操作

### action 枚举

| action | 功能 | 安全性要求 |
|--------|------|-----------|
| `listPackages` | 查询可选套餐列表 | 只读，无需确认 |
| `create` | 创建新环境 | 产生费用，需 confirm |
| `destroy` | 销毁环境 | 不可恢复，需 confirm |
| `modifyPlan` | 变更套餐（升降配） | 产生费用变化，需 confirm |
| `renew` | 续费环境 | 产生费用，需 confirm |

### 入参 Schema

```typescript
inputSchema: {
  action: z.enum(["listPackages", "create", "destroy", "modifyPlan", "renew"])
    .describe("操作类型"),
  
  // 通用参数
  envId: z.string().optional().describe("环境 ID（destroy/modifyPlan/renew 时必填）"),
  confirm: z.literal("yes").optional().describe("确认操作，所有付费/破坏性操作必须传 yes"),
  
  // create 参数
  alias: z.string().optional().describe("环境别名（create 时必填）"),
  packageId: z.string().optional().describe("套餐 ID（create/modifyPlan 时必填）"),
  region: z.string().optional().describe("地域，默认 ap-shanghai"),
  resources: z.array(z.enum(["flexdb", "storage", "function"])).optional()
    .describe("启用的资源类型，默认全部"),
  duration: z.number().int().min(1).max(36).optional()
    .describe("购买/续费时长（月），默认 1"),
  
  // destroy 参数
  force: z.boolean().optional().describe("是否强制删除（针对隔离中的环境）"),
  bypassCheck: z.boolean().optional().describe("是否跳过资源检查直接删除"),
}
```

### 返回结构

统一返回格式（参考现有 `buildJsonToolResult` 模式）：

```typescript
{
  ok: boolean,
  code: string,          // 操作结果码
  message: string,       // 人类可读的消息
  envId?: string,        // 涉及的环境 ID
  // action 特定字段
  packages?: Package[],  // listPackages 返回
  billingInfo?: {...},   // modifyPlan/renew 的价格信息
  next_step?: {...},     // 建议的下一步操作
}
```

## Manager SDK 方法映射

| 操作 | SDK 方法 | 对应 CAPI |
|------|---------|-----------|
| 查询套餐 | `env.describeBaasPackageList({ TargetAction: "new" })` | `DescribeBaasPackageList` |
| 创建环境 | `env.createEnv({ Alias, PackageId, Resources, Period })` | `CreateEnv` |
| 销毁环境 | `env.destroyEnvWithParams({ EnvId, IsForce, BypassCheck })` | `DestroyEnv` |
| 变更套餐 | `env.modifyEnvPlan({ EnvId, PackageId })` | `ModifyEnvPlan` |
| 续费环境 | `env.renewEnv({ EnvId, Period })` | `RenewEnv` |
| 计算价格 | `env.calculatePackageCreatePrice({ packageId, region })` | `CalculatePackageCreatePrice` |

## 安全考量

1. **费用敏感操作**：create、modifyPlan、renew 三个操作会产生费用变化，执行前必须：
   - 展示配置摘要（套餐、时长、费用预估）
   - 要求用户传入 `confirm="yes"`
2. **不可恢复操作**：destroy 操作会删除所有资源，执行前必须：
   - 先查询环境详情并展示给用户
   - 要求用户传入 `confirm="yes"`
3. **权限检查**：调用前通过 Manager SDK 的认证机制保证用户已登录且有相应权限

## 与现有流程的兼容性

现有的 `auth` 工具中的自动环境创建流程（`checkAndCreateFreeEnv`）保持不变，它是针对首次使用无环境用户的免费环境自动创建路径。新增的 `manageEnv` 工具是面向有经验的用户，允许他们主动选择套餐和配置创建环境。两者互不干扰。

## 测试策略

1. **单元测试**：`mcp/src/tools/env.test.ts` 中补充 `manageEnv` 工具的单元测试
2. **集成测试**：通过实际的 MCP Server 调用验证各 action 的入参校验和返回格式
3. **模拟测试**：对涉及费用的操作（create、modifyPlan、renew、destroy），使用 mock Manager SDK 验证确认流程
