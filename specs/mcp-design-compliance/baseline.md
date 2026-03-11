# MCP 工具设计合规性改进 - 质量基线

**日期**: 2026-03-11  
**分支**: `refactor/mcp-design-compliance`  
**基线版本**: v2.14.0

---

## 测试基线

### 测试通过率

- **测试文件**: 22/23 通过 (95.7%)
- **测试用例**: 112/112 通过 (100%)
- **失败测试**: 1 个（cloudbase-sdk-runtime-validation.test.js - 模块解析问题，与本次改动无关）

### 测试执行时间

- **总时长**: 38.19s
- **测试执行**: 157.57s
- **构建时间**: ~25s

---

## 代码质量基线

### 工具文件统计

| 文件 | 行数 | 主要问题 |
|-----|------|---------|
| `setup.ts` | 500+ | 函数过长，需要重构 |
| `functions.ts` | ~800 | 命名不一致，返回格式混乱 |
| `databaseNoSQL.ts` | ~400 | 返回格式不统一 |
| `databaseSQL.ts` | ~200 | 缺少安全确认 |
| `storage.ts` | ~300 | ✅ 较好的设计 |
| `cloudrun.ts` | ~400 | ✅ 较好的设计 |
| `hosting.ts` | ~150 | 缺少查询工具 |
| `rag.ts` | ~700 | mode="doc" 需改为 "skills" |

---

## 命名模式分布

### 当前命名模式统计

| 模式 | 工具数量 | 示例 | 一致性 |
|-----|---------|------|--------|
| `query{Domain}` / `manage{Domain}` | 4 | queryStorage, manageStorage | ✅ 好 |
| `read{Domain}` / `write{Domain}` | 6 | readSecurityRule, writeSecurityRule | ⚠️ 中 |
| `execute{Action}` | 2 | executeReadOnlySQL, executeWriteSQL | ✅ 好 |
| `get{Resource}List` / `create{Resource}` | 8 | getFunctionList, createFunction | ❌ 差 |
| 其他 | 5 | uploadFiles, downloadTemplate | ❌ 差 |

**命名一致性**: ~60%

---

## 返回格式分布

### 当前返回格式统计

| 格式 | 工具数量 | 示例 | 问题 |
|-----|---------|------|------|
| 原始 SDK JSON 字符串 | 8 | getFunctionList, uploadFiles | ❌ 难解析，token 浪费 |
| 结构化信封 | 6 | queryStorage, manageCloudRun | ✅ 好 |
| 混合格式 | 5 | 部分 database 工具 | ⚠️ 不一致 |
| MCP 标准格式 | 6 | auth, interactive | ✅ 好 |

**返回格式一致性**: ~40%

---

## nextActions 覆盖情况

### 当前 nextActions 统计

| 状态 | 工具数量 | 说明 |
|-----|---------|------|
| 有 nextActions | 3 | auth, 部分新工具 |
| 无 nextActions | 22 | 大部分工具 |
| 过度推荐 | 0 | - |

**nextActions 覆盖率**: ~12%  
**质量**: 现有的 nextActions 质量较好，但覆盖率低

---

## 安全确认覆盖情况

### 破坏性操作统计

| 工具 | 操作 | 确认机制 | 状态 |
|-----|------|---------|------|
| manageStorage | delete | `force` 参数 | ✅ 已实现 |
| manageCloudRun | delete | 确认参数 | ✅ 已实现 |
| executeWriteSQL | DROP/DELETE/TRUNCATE | 无 | ❌ 缺失 |
| manageFunctions | delete | 需验证 | ❓ 待确认 |
| writeNoSqlDatabaseStructure | deleteCollection | 无 | ❌ 缺失 |
| manageHosting | delete | 无（工具不存在） | ❌ 缺失 |

**安全确认覆盖率**: ~50%

---

## 设计合规性评分基线

### 总体评分: 65/100

| 维度 | 评分 | 说明 |
|-----|------|------|
| 工具职责与命名 | 70/100 | 部分工具命名不一致 |
| Query/Manage 模式 | 60/100 | 新工具遵循，旧工具不遵循 |
| Read/Write 分离 | 75/100 | 大部分工具已分离 |
| 返回信封与 AI 人机工程学 | 55/100 | 返回格式混乱 |
| 参数设计与安全性 | 65/100 | 部分缺少安全确认 |

---

## 代码复杂度基线

### 函数长度统计

| 文件 | 最长函数 | 行数 | 问题 |
|-----|---------|------|------|
| setup.ts | downloadTemplate | 500+ | ❌ 严重超标 |
| functions.ts | getFunctionList | ~150 | ⚠️ 偏长 |
| databaseNoSQL.ts | writeNoSqlDatabaseStructure | ~100 | ✅ 可接受 |

### any 类型使用统计

- **总计**: ~50 处（估算）
- **主要集中**: functions.ts, setup.ts, rag.ts

---

## 改进目标

### 阶段 1 目标 (1-2 周)

- ✅ 返回格式一致性: 40% → 100%
- ✅ nextActions 质量: 低覆盖 → 高质量（如无必要不推荐）
- ✅ 安全确认覆盖率: 50% → 100%
- ✅ 命名规范文档: 无 → 完成

### 阶段 2 目标 (2-4 周)

- ✅ Function 工具优化: 支持 view/include 参数
- ✅ 缺失工具补充: queryHosting, queryDataModel 等
- ✅ setup.ts 重构: 500+ 行 → <100 行

### 阶段 3 目标 (1-2 月)

- ✅ nextActions 优化: 移除过度推荐，添加必要推荐
- ✅ searchKnowledgeBase: doc → skills
- ✅ 工具描述改进: 明确 action 边界

### 最终目标

- ✅ 设计合规性评分: 65/100 → 90/100
- ✅ 命名一致性: 60% → 95%
- ✅ 返回格式一致性: 40% → 100%
- ✅ 安全确认覆盖率: 50% → 100%
- ✅ 测试通过率: 95.7% → 100%

---

## 备注

- 基线建立于 2026-03-11
- 所有改动将在 `refactor/mcp-design-compliance` 分支进行
- 保持向后兼容，使用 deprecation 策略
- 每个阶段完成后合并到 main 分支

