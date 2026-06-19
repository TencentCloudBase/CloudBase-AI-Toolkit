# 技术方案设计

## 架构设计

### 当前架构分析

1. **envQuery 工具** (mcp/src/tools/env.ts)
   - 位置：`mcp/src/tools/env.ts`
   - 功能：环境相关信息查询
   - 当前支持的操作：
     - `list`: 获取环境列表
     - `info`: 获取当前环境信息
     - `domains`: 获取安全域名列表

2. **getWebsiteConfig 工具** (mcp/src/tools/hosting.ts)
   - 位置：`mcp/src/tools/hosting.ts`
   - 功能：获取静态网站托管配置
   - 当前实现：调用 `cloudbase.hosting.getWebsiteConfig()`

### 合并方案

#### 方案选择：扩展 envQuery
选择将 getWebsiteConfig 合并到 envQuery 中，因为：
- 静态网站托管配置属于环境信息的一部分
- 减少工具数量，提高 API 一致性
- 符合工具合并的最佳实践

#### 合并后的架构

```
envQuery (扩展后)
├── action: "list" → env.listEnvs()
├── action: "info" → env.getEnvInfo()
├── action: "domains" → env.getEnvAuthDomains()
└── action: "hosting" → hosting.getWebsiteConfig() [新增]
```

## 技术栈

- **语言**：TypeScript
- **框架**：MCP Server
- **验证**：Zod schema validation
- **CloudBase SDK**：用于云开发环境操作

## 数据库/接口设计

### 输入接口设计

```typescript
// 扩展后的 envQuery 输入接口
interface EnvQueryInput {
  action: "list" | "info" | "domains" | "hosting"; // 新增 "hosting"
}
```

### 输出接口设计

保持现有输出格式不变：
```typescript
interface EnvQueryOutput {
  content: Array<{
    type: "text";
    text: string; // JSON.stringify(result, null, 2)
  }>;
}
```

## 测试策略

1. **单元测试**：测试新增的 "hosting" action
2. **集成测试**：验证与其他 action 的兼容性
3. **回归测试**：确保原有功能不受影响

## 安全性和性能考虑

- **安全性**：保持现有的权限验证机制
- **性能**：合并后减少网络请求次数，提高查询效率
- **向后兼容**：保留原有 API 不变
