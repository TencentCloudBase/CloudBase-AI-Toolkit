# 模块处理状态检查

**日期**: 2026-03-11  
**总模块数**: 19 个

---

## ✅ 已处理的模块 (13个)

| # | 模块 | 状态 | 需要重命名 |
|---|------|------|-----------|
| 1 | storage.ts | ✅ 已迁移 | ❌ 不需要（已符合规范） |
| 2 | databaseSQL.ts | ✅ 已迁移 | ❌ 不需要（已符合规范） |
| 3 | rag.ts | ✅ 已迁移 | ❌ 不需要（已符合规范） |
| 4 | cloudrun.ts | ✅ 已迁移 | ❌ 不需要（已符合规范） |
| 5 | databaseNoSQL.ts | ✅ 已迁移 | ✅ 需要重命名 |
| 6 | security-rule.ts | ✅ 已迁移 | ❌ 不需要（已符合规范） |
| 7 | hosting.ts | ✅ 已迁移 | ✅ 需要重命名 |
| 8 | functions.ts | ✅ 已迁移 | ✅ 需要重命名 |
| 9 | dataModel.ts | ✅ 已迁移 | ✅ 需要重命名 |
| 10 | env.ts | ✅ 已迁移 | ❌ 不需要（auth相关） |
| 11 | capi.ts | ✅ 已迁移 | ❌ 不需要（通用工具） |
| 12 | gateway.ts | ✅ 已迁移 | ✅ 需要重命名 |
| 13 | miniprogram.ts | ✅ 已迁移 | ✅ 需要重命名 |

---

## ❌ 未处理的模块 (6个)

| # | 模块 | 原因 | 优先级 |
|---|------|------|--------|
| 14 | setup.ts | 需要重构（747行） | 低（延后） |
| 15 | download.ts | 非核心功能 | 低（跳过） |
| 16 | env-setup.ts | 自动化流程 | 低（跳过） |
| 17 | invite-code.ts | 营销功能 | 低（跳过） |
| 18 | interactive.ts | 已标记跳过 | 跳过 |
| 19 | env.test.ts | 测试文件 | N/A |

---

## 🔄 需要重命名的模块 (6个)

### 1. functions.ts ⭐⭐⭐⭐⭐ 最重要

**当前工具**:
- getFunctionList → queryFunctions
- createFunction → manageFunctions (action: 'create')
- updateFunctionCode → manageFunctions (action: 'updateCode')
- updateFunctionConfig → manageFunctions (action: 'updateConfig')
- deleteFunction → manageFunctions (action: 'delete')
- copyFunction → manageFunctions (action: 'copy')
- invokeFunction → invokeFunctions
- getFunctionLogs → queryFunctionLogs

**工作量**: 3-4 小时

---

### 2. databaseNoSQL.ts ⭐⭐⭐⭐

**当前工具**:
- readNoSqlDatabaseStructure → queryNoSqlDatabase
- writeNoSqlDatabaseStructure → manageNoSqlDatabase

**工作量**: 1 小时

---

### 3. hosting.ts ⭐⭐⭐

**当前工具**:
- uploadFiles → manageHosting (action: 'upload')
- deleteFiles → manageHosting (action: 'delete')
- walkFiles → queryHosting
- domainManagement → manageHostingDomain

**工作量**: 1-2 小时

---

### 4. dataModel.ts ⭐⭐⭐

**当前工具**:
- manageDataModel → 拆分为 queryDataModel + manageDataModel
- modifyDataModel → manageDataModel (action: 'modify')

**工作量**: 1-2 小时

---

### 5. gateway.ts ⭐⭐

**当前工具**:
- createGateway → manageGateway (action: 'create')

**工作量**: 30 分钟

---

### 6. miniprogram.ts ⭐⭐

**当前工具**:
- uploadMiniProgram → manageMiniProgram (action: 'upload')
- previewMiniProgram → manageMiniProgram (action: 'preview')

**工作量**: 30 分钟

---

## 📊 总工作量估算

| 模块 | 时间 |
|-----|------|
| functions.ts | 3-4 小时 |
| databaseNoSQL.ts | 1 小时 |
| hosting.ts | 1-2 小时 |
| dataModel.ts | 1-2 小时 |
| gateway.ts | 30 分钟 |
| miniprogram.ts | 30 分钟 |
| **总计** | **7-10 小时** |

---

## 🎯 执行顺序建议

1. **functions.ts** - 最重要，最复杂
2. **databaseNoSQL.ts** - 中等复杂度
3. **hosting.ts** - 中等复杂度
4. **gateway.ts** - 简单
5. **miniprogram.ts** - 简单
6. **dataModel.ts** - 中等复杂度

---

## 📋 重命名规则

### 不保留别名策略

**做法**:
- 直接重命名工具
- 在新工具描述中提及旧名称
- 例如：`(formerly getFunctionList)`

**描述模板**:
```
查询云函数列表或详情 (formerly getFunctionList)
```

**优点**:
- ✅ 代码库干净
- ✅ 命名一致性高
- ✅ 无维护负担

**缺点**:
- ❌ 破坏向后兼容性（需要在 CHANGELOG 中说明）

---

## 🚀 准备开始

**建议**: 从 functions.ts 开始，这是最重要的模块

**准备好了吗？**

