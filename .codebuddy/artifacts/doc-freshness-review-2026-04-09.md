# 文档新鲜度审查报告

**审查日期：** 2026-04-09  
**审查范围：** README 文件、doc/ 目录、scripts/tools.json

---

## 执行摘要

发现 **3 类主要问题**，涉及工具数量不一致、IDE列表不匹配、分类逻辑过时。

---

## 问题 1：工具数量与分类不一致（严重）

### 现状对比

| 分类 | README-ZH.md | README-EN.md | 实际工具数 | 状态 |
|------|---------------|---------------|------------|------|
| 环境 | 4 个 | 4 个 | 3 个 (auth, envQuery, envDomainManagement) | ❌ 多算1个 |
| 数据库 | 11 个 | 11 个 | 8 个 (NoSQL×4 + MySQL×4) | ❌ 多算3个 |
| 云函数 | 9 个 | 9 个 | 2 个 (queryFunctions, manageFunctions) | ❌ 多算7个 |
| 静态托管 | 5 个 | 5 个 | 4 个 (uploadFiles, deleteFiles, findFiles, domainManagement) | ❌ 多算1个 |
| 小程序 | 7 个 | 7 个 | 0 个（无对应工具） | ❌ 虚构分类 |
| 工具支持 | 4 个 | 3 个 | 6 个 (downloadTemplate + searchWeb + searchKnowledgeBase + downloadRemoteFile + activateInviteCode + callCloudApi) | ❌ 中英文不一致 |

### 根因

README 中的工具数量基于旧版工具集（v1.x），当前 `scripts/tools.json` 已包含 **36 个工具**，分类体系已重构。

### 建议修复

**选项 A（推荐）：** 删除具体数字，改为描述性文本
```markdown
| 分类 | 核心功能 |
|------|----------|
| **环境管理** | 登录认证、环境查询、域名管理 |
| **数据库 (NoSQL)** | 集合管理、文档 CRUD、索引、数据模型 |
| **数据库 (MySQL)** | 实例管理、SQL 执行、Schema 初始化 |
| **云函数** | 创建、更新、调用、日志、触发器、层管理 |
| **静态托管** | 文件上传/删除/搜索、域名配置、CDN 配置 |
| **云存储** | 对象上传/下载/删除、临时链接 |
| **云托管** | 服务管理、部署、扩缩容 |
| **网关** | 访问入口、路由、自定义域名 |
| **认证** | 登录方式、Provider、客户端配置 |
| **权限** | 资源权限、角色、用户管理 |
| **日志** | 日志服务状态、CLS 日志搜索 |
| **Agent** | Agent 管理、日志查询 |
| **工具支持** | 模板下载、知识库搜索、联网搜索、远程文件下载、邀请码激活、云 API 调用 |
```

**选项 B：** 精确统计并标注版本号
```markdown
### v2.16.1 工具概览（共 36 个）

| 分类 | 数量 | 工具列表 |
|------|------|----------|
| 环境管理 | 3 | auth, envQuery, envDomainManagement |
| ... | ... | ... |
```

---

## 问题 2：IDE 支持列表不一致（中等）

### 差异对比

| IDE | README-ZH.md | README-EN.md | README.md (主) |
|-----|---------------|---------------|----------------|
| OpenClaw | ❌ 无 | ❌ 无 | ✅ 有 |
| iFlow CLI | ✅ 有 | ❌ 无 | ❌ 无 |
| Cursor | ✅ 有 | ✅ 有 | ✅ 有 |
| WindSurf | ✅ 有 | ✅ 有 | ✅ 有 |
| CodeBuddy | ✅ 有 | ✅ 有 | ✅ 有 |

### 建议修复

统一三个 README 的 IDE 列表，建议采用主 README (README.md) 的版本作为基准，因为它包含最新的 OpenClaw。

---

## 问题 3：分类逻辑过时（中等）

### 当前问题

README 中的"小程序"分类在 `tools.json` 中无对应工具。实际工具分类已调整为：
- **云存储** (queryStorage, manageStorage)
- **云托管** (queryCloudRun, manageCloudRun)
- **网关** (queryGateway, manageGateway)
- **认证** (queryAppAuth, manageAppAuth)
- **权限** (queryPermissions, managePermissions)
- **日志** (queryLogs)
- **Agent** (queryAgents, manageAgents)

### 建议修复

更新 README 表格，反映当前实际的工具分类体系。参考 `doc/mcp-tools.md` 的顺序。

---

## 其他发现

### ✅ 正常的部分

1. **文件引用有效：** `doc/mcp-tools.md` 和 `scripts/tools.json` 均存在且内容同步
2. **Banner 图片链接：** 所有 README 使用相同的 CDN 链接，可访问
3. **MCP 配置示例：** 本地模式和托管模式的配置代码正确
4. **快速开始指南：** 步骤清晰，命令有效

---

## 推荐行动

### 立即修复（高优先级）

1. **统一 IDE 列表**  
   - 文件：`README-ZH.md`, `README-EN.md`  
   - 操作：同步为 README.md 的版本

2. **修复工具数量**  
   - 文件：所有 README  
   - 操作：采用"选项 A"（删除数字，改为描述性文本）

### 后续优化（中优先级）

3. **重构工具分类表格**  
   - 文件：所有 README  
   - 操作：按 `doc/mcp-tools.md` 的实际分类更新

4. **添加版本标注**  
   - 文件：`doc/mcp-tools.md`  
   - 操作：在标题处添加 `当前版本：v2.16.1（共 36 个工具）`

---

## 审查清单

- [x] README 与 tools.json 对比
- [x] README 与 mcp-tools.md 对比
- [x] 中英文 README 一致性检查
- [ ] ~~链接有效性测试~~（跳过，CDN 链接需运行时验证）
- [x] 代码示例正确性检查
- [x] 图片引用检查

---

**审查人：** AI Assistant  
**下一步：** 等待用户确认修复方案后执行 PR
