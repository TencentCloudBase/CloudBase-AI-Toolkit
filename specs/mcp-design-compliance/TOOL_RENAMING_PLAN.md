# MCP 工具重命名计划

**日期**: 2026-03-11  
**策略**: 激进重命名，提升命名一致性  
**目标**: 命名一致性从 64% 提升到 95%

---

## 📊 当前命名分析

### ✅ 已符合规范的工具 (9个)

| 当前名称 | 模式 | 状态 |
|---------|------|------|
| queryStorage | query{Resource} | ✅ 符合 |
| manageStorage | manage{Resource} | ✅ 符合 |
| queryCloudRun | query{Resource} | ✅ 符合 |
| manageCloudRun | manage{Resource} | ✅ 符合 |
| readSecurityRule | read{Resource} | ✅ 符合 |
| writeSecurityRule | write{Resource} | ✅ 符合 |
| executeReadOnlySQL | execute{Action} | ✅ 符合 |
| executeWriteSQL | execute{Action} | ✅ 符合 |
| searchKnowledgeBase | search{Resource} | ✅ 符合 |

### ❌ 需要重命名的工具 (16个)

#### Function 工具 (8个)

| 当前名称 | 推荐名称 | 理由 |
|---------|---------|------|
| getFunctionList | queryFunctions | 统一为 query{Resource} |
| createFunction | manageFunctions | 统一为 manage{Resource} + action |
| updateFunctionCode | manageFunctions | 统一为 manage{Resource} + action |
| updateFunctionConfig | manageFunctions | 统一为 manage{Resource} + action |
| deleteFunction | manageFunctions | 统一为 manage{Resource} + action |
| copyFunction | manageFunctions | 统一为 manage{Resource} + action |
| invokeFunction | invokeFunctions | 统一为 invoke{Resource} |
| getFunctionLogs | queryFunctionLogs | 统一为 query{Resource} |

#### Database NoSQL 工具 (2个)

| 当前名称 | 推荐名称 | 理由 |
|---------|---------|------|
| readNoSqlDatabaseStructure | queryNoSqlDatabase | 统一为 query{Resource} |
| writeNoSqlDatabaseStructure | manageNoSqlDatabase | 统一为 manage{Resource} |

#### Data Model 工具 (2个)

| 当前名称 | 推荐名称 | 理由 |
|---------|---------|------|
| manageDataModel | queryDataModel | 拆分为 query + manage |
| modifyDataModel | manageDataModel | 统一为 manage{Resource} |

#### Hosting 工具 (3个)

| 当前名称 | 推荐名称 | 理由 |
|---------|---------|------|
| uploadFiles | manageHosting | 统一为 manage{Resource} + action |
| deleteFiles | manageHosting | 统一为 manage{Resource} + action |
| walkFiles | queryHosting | 统一为 query{Resource} |

#### 其他工具 (1个)

| 当前名称 | 推荐名称 | 理由 |
|---------|---------|------|
| domainManagement | manageHostingDomain | 统一为 manage{Resource} |

---

## 🎯 重命名策略

### 策略 1: 保留旧名称作为别名（推荐）⭐⭐⭐⭐⭐

**方案**:
- 创建新名称的工具
- 保留旧名称作为别名（调用新工具）
- 在旧工具中添加 deprecation 警告
- 文档中标记旧名称为 deprecated

**优点**:
- ✅ 向后兼容
- ✅ 用户有时间迁移
- ✅ 不破坏现有代码

**缺点**:
- ❌ 维护两套工具名称
- ❌ 代码库变大

**实现示例**:
```typescript
// 新工具
server.registerTool('queryFunctions', { ... });

// 旧工具（别名 + deprecation 警告）
server.registerTool('getFunctionList', {
  ...schema,
  description: '⚠️ DEPRECATED: Use queryFunctions instead. This tool will be removed in v3.0.',
  handler: async (args) => {
    // 调用新工具
    return queryFunctionsHandler(args);
  }
});
```

### 策略 2: 直接重命名（激进）⭐⭐⭐

**方案**:
- 直接重命名工具
- 更新所有文档
- 发布 breaking change 公告

**优点**:
- ✅ 代码库干净
- ✅ 命名一致性高

**缺点**:
- ❌ 破坏向后兼容性
- ❌ 用户需要立即更新代码

---

## 📋 推荐执行计划

### 阶段 1: 创建新工具（保留旧工具）

**优先级 1: Function 工具** (最重要)
1. 创建 `queryFunctions` (替代 getFunctionList)
2. 创建 `manageFunctions` (合并 create/update/delete/copy)
3. 创建 `invokeFunctions` (替代 invokeFunction)
4. 创建 `queryFunctionLogs` (替代 getFunctionLogs)

**优先级 2: Database 工具**
1. 创建 `queryNoSqlDatabase` (替代 readNoSqlDatabaseStructure)
2. 创建 `manageNoSqlDatabase` (替代 writeNoSqlDatabaseStructure)

**优先级 3: Hosting 工具**
1. 创建 `queryHosting` (替代 walkFiles)
2. 创建 `manageHosting` (合并 uploadFiles/deleteFiles)
3. 创建 `manageHostingDomain` (替代 domainManagement)

**优先级 4: Data Model 工具**
1. 创建 `queryDataModel` (从 manageDataModel 拆分)
2. 重命名 `modifyDataModel` → `manageDataModel`

### 阶段 2: 添加 Deprecation 警告

为所有旧工具添加警告：
```
⚠️ DEPRECATED: Use {newToolName} instead. 
This tool will be removed in v3.0.
See migration guide: https://...
```

### 阶段 3: 更新文档

1. 更新 `doc/mcp-tools.md`
2. 创建迁移指南
3. 更新示例代码
4. 更新 README

### 阶段 4: 监控和迁移

1. 添加使用统计（记录旧工具调用次数）
2. 发布迁移公告
3. 给用户 3-6 个月迁移期
4. 在 v3.0 中移除旧工具

---

## 📊 预期效果

### 命名一致性提升

| 阶段 | 一致性 | 说明 |
|-----|--------|------|
| 当前 | 64% | 9/25 工具符合规范 |
| 阶段 1 完成 | 100% | 所有新工具符合规范 |
| 阶段 4 完成 | 100% | 移除旧工具后 |

### 设计合规性提升

| 指标 | 当前 | 完成后 | 提升 |
|-----|------|--------|------|
| 命名一致性 | 64% | 100% | +36% |
| 设计合规性 | 86/100 | 95/100 | +9 |

---

## ⏱️ 工作量估算

| 任务 | 时间 |
|-----|------|
| 创建新 Function 工具 | 3-4 小时 |
| 创建新 Database 工具 | 1-2 小时 |
| 创建新 Hosting 工具 | 1-2 小时 |
| 创建新 Data Model 工具 | 1 小时 |
| 添加 Deprecation 警告 | 1 小时 |
| 更新文档 | 2-3 小时 |
| 测试 | 2 小时 |
| **总计** | **11-15 小时** |

---

## 🎯 最终建议

**推荐**: 策略 1 - 保留旧名称作为别名

**执行顺序**:
1. 先做 Function 工具（最重要，最复杂）
2. 再做 Database 和 Hosting 工具
3. 最后做 Data Model 工具
4. 添加 deprecation 警告
5. 更新文档

**时间安排**:
- 今天: Function 工具 (3-4 小时)
- 明天: 其他工具 + 文档 (4-5 小时)

---

**准备好开始了吗？我建议从 Function 工具开始！**

