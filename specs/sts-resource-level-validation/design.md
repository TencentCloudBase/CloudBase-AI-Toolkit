# STS 资源级临时密钥 MCP 兼容性验证与修复

## 背景

CloudBase MCP Server 需要支持通过 STS 临时密钥（`GetFederationToken`）方式接入，用于 CI/CD 流水线、子账号受限访问等场景。

STS 临时密钥通过环境变量注入：
```bash
TENCENTCLOUD_SECRETID=<TmpSecretId>
TENCENTCLOUD_SECRETKEY=<TmpSecretKey>
TENCENTCLOUD_SESSIONTOKEN=<Token>
CLOUDBASE_ENV_ID=<envId>
```

## 问题发现

通过编写自动化测试（`tests/sts-resource-level-validation.test.js`）发现：STS 临时密钥不支持 `DescribeEnvs` 和 `ListFunctions` API。而 MCP Server 内部在多处前置调用了这些 API，导致大部分工具无法工作。

### 根因分析

| 问题 | 位置 | 影响 |
|------|------|------|
| `getCloudBaseManager` 为获取 region 调用 `DescribeEnvs` | `cloudbase-manager.ts:506-516` | 所有走 manager 的工具都失败 |
| `@cloudbase/manager-node` SDK `lazyInit()` 内部调 `DescribeEnvs` | SDK `environment.js:47` | 所有 SDK 高级方法（functions/storage/database）都失败 |
| NoSQL 操作需要先查 `DescribeEnvs` 获取 instanceId 作为 Tag | `databaseNoSQL.ts` + `cloudbase-manager.ts` | NoSQL CRUD 全部失败 |

## 修复方案

### 1. 升级 `@cloudbase/manager-node` 到 5.3.1

SDK 5.3.1 版本将内部 `getEnvInfo()` 从 `DescribeEnvs` 切换为 `DescribeEnvInfo`（STS 兼容的新接口）。这一升级解决了 SDK `lazyInit` 导致的所有问题。

### 2. 删除 region 检测的 DescribeEnvs 调用

`getCloudBaseManager()` 中即使 envId 已确定，仍会调 `listAvailableEnvCandidates()` → `DescribeEnvs` 获取 region。

**修改**：直接使用 fallback region（`TCB_REGION` 环境变量或默认 `ap-shanghai`），不再为 region 检测调用 `DescribeEnvs`。

### 3. NoSQL 数据库 EnvId 替代 Tag

NoSQL API 现已支持直接传 `EnvId` 参数替代 `Tag`（instanceId），无需先查询 `DescribeEnvs` 获取 instanceId。

所有 NoSQL 操作（createCollection/deleteCollection/updateCollection/listCollections/describeCollection/checkCollection/checkIndex 以及 CRUD）统一改为：
- 使用 `cloudbase.commonService("tcb", "2018-06-08").call()` 直接调用底层 API
- 参数中传 `EnvId` 而非 `Tag`

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `package.json` | `@cloudbase/manager-node` → `5.3.1` |
| `mcp/package.json` | `@cloudbase/manager-node` → `5.3.1` |
| `mcp/src/cloudbase-manager.ts` | 删除 region 检测 DescribeEnvs 调用 |
| `mcp/src/tools/databaseNoSQL.ts` | 所有 NoSQL 操作改用 EnvId + commonService |
| `tests/sts-resource-level-validation.test.js` | 新增：STS 全资源验证测试 |

## 测试结果

```
总计: 40 项 | 通过: 40 | 失败: 0
其中 STS 已知不支持的 API（预期行为）: 4 项
```

### 各资源类型验证结果

| 资源类型 | 操作数 | 结果 |
|----------|--------|------|
| NoSQL 数据库 | 6 | ✅ 全部通过 |
| SQL 数据库 | 5 | ✅ 全部通过 |
| 云函数 | 4 | ✅ 3通过 + 1预期限制(ListFunctions) |
| 云存储 | 4 | ✅ 全部通过 |
| 静态网站托管 | 3 | ✅ 全部通过 |
| 云托管 | 2 | ✅ 全部通过 |
| 网关 | 4 | ✅ 全部通过 |
| 权限与认证 | 5 | ✅ 全部通过 |
| 环境管理 | 3 | ✅ 2通过 + 1预期限制(DescribeEnvs) |
| 日志 | 2 | ✅ 全部通过 |
| 通用CloudAPI | 2 | ✅ 2预期限制 |

## STS 已知限制

以下 API 本身不支持 STS 临时密钥调用（非 MCP 问题，是腾讯云 API 限制）：

- `DescribeEnvs` — 列出环境列表
- `ListFunctions` (SCF) — 列出云函数列表

**影响**：使用 STS 临时密钥时，`envQuery(action="list")` 和 `queryFunctions(action="listFunctions")` 会返回权限错误。其他所有操作正常。

## 运行测试

```bash
cd mcp && npm run build && npx vitest run ../tests/sts-resource-level-validation.test.js
```
